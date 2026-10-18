"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { getCoords, lastCoords, type Coords } from "@/lib/geo";
import type { Court } from "@/lib/types";
import { miles } from "@/lib/util";
import PlaceSearch from "@/components/PlaceSearch";

const CourtMap = dynamic(() => import("@/components/CourtMap"), { ssr: false, loading: () => <div className="map skeleton" /> });

const FALLBACK: Coords = { lat: 40.7128, lng: -74.006 }; // New York, used only until location is shared

function CourtsInner() {
  const toast = useToast();
  const params = useSearchParams();
  const [me, setMe] = useState<Coords | null>(null);
  const [center, setCenter] = useState<Coords>(FALLBACK);
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(params.get("add") === "1");
  const [pin, setPin] = useState<Coords>(FALLBACK);
  const [name, setName] = useState("");
  const [count, setCount] = useState("");
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (c: Coords) => {
    const { data } = await supabase().rpc("nearby_courts", { lat: c.lat, lng: c.lng, radius_mi: 30 });
    setCourts((data as Court[]) ?? []);
  }, []);

  const locate = useCallback(async () => {
    setLocErr(null);
    try {
      const c = await getCoords();
      setMe(c);
      setCenter(c);
      setPin(c);
      load(c);
    } catch (e) {
      setLocErr((e as Error).message);
      load(center);
    }
  }, [load, center]);

  useEffect(() => {
    const c = lastCoords();
    if (c) {
      setMe(c);
      setCenter(c);
      setPin(c);
      load(c);
    }
    locate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (name.trim().length < 2) return setErr("Enter the court's name.");
    const near = courts?.find((c) => c.name.toLowerCase() === name.trim().toLowerCase() && c.distance_mi < 2);
    if (near) return setErr("That court is already listed nearby.");
    setBusy(true);
    const { error } = await supabase().rpc("add_court", {
      p_name: name,
      lat: pin.lat,
      lng: pin.lng,
      p_count: count ? Number(count) : null,
      p_notes: notes,
      p_address: address,
    });
    setBusy(false);
    if (error) return setErr("Couldn't add the court. Check the details and try again.");
    toast(`${name.trim()} added.`);
    setAdding(false);
    setName("");
    setCount("");
    setNotes("");
    setAddress("");
    load(me ?? pin);
  }

  const sel = courts?.find((c) => c.id === selected);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Courts</h1>
          <p className="sub">{courts ? `${courts.length} within 30 mi` : "Finding courts near you"}</p>
        </div>
        {!adding && (
          <button className="btn btn-sm" onClick={() => setAdding(true)}>
            Add a court
          </button>
        )}
      </div>

      {locErr && (
        <div className="notice">
          <span>{locErr}</span>
          <button className="btn btn-sm" onClick={locate}>
            Try again
          </button>
        </div>
      )}

      {adding ? (
        <form className="block" onSubmit={save} noValidate>
          <h2>Add a court</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Search for the place, then drag the map so the pin sits right on the courts.
          </p>
          <div className="field">
            <span>Name</span>
            <PlaceSearch
              value={name}
              onChange={(v) => { setName(v); setAddress(""); }}
              near={me ?? center}
              onPick={(p) => {
                setAddress(p.address);
                setCenter({ lat: p.lat, lng: p.lng });
                setPin({ lat: p.lat, lng: p.lng });
              }}
            />
            {address && <span className="small muted" style={{ fontWeight: 400 }}>{address}</span>}
          </div>
          <CourtMap center={center} courts={courts ?? []} me={me} picking tall onMove={setPin} />
          <div className="btn-row">
            <label className="field" style={{ flex: 1 }}>
              <span>Number of courts</span>
              <input id="court-count" className="input" type="number" inputMode="numeric" min={1} max={60} placeholder="6" value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Notes (optional)</span>
            <input id="court-notes" className="input" maxLength={140} placeholder="Lights until 10pm. Bring your own net." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {err && <p className="err">{err}</p>}
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Adding…" : "Add court"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <CourtMap center={center} courts={courts ?? []} me={me} onSelect={setSelected} />
          {sel && (
            <div className="notice" style={{ background: "var(--surface)", color: "var(--ink)", border: "1.5px solid var(--line)" }}>
              <b>{sel.name}</b>
              <span className="small muted">
                {miles(sel.distance_mi)} away. {sel.available_players} available nearby, {sel.open_games} open game{sel.open_games === 1 ? "" : "s"}.
              </span>
              <Link className="btn btn-sm btn-primary" href="/host">
                Host a game here
              </Link>
            </div>
          )}
          <section className="block">
            {courts === null ? (
              <div className="skeleton" />
            ) : courts.length === 0 ? (
              <div className="empty">
                <strong>No courts listed near you yet.</strong>
                <span>Add the one you play at most. One busy court beats ten empty ones.</span>
                <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
                  Add a court
                </button>
              </div>
            ) : (
              <div className="rows">
                {courts.map((c) => (
                  <button
                    key={c.id}
                    className="row"
                    style={{ gridTemplateColumns: "minmax(0,1fr) auto", border: 0, background: "transparent", textAlign: "left", cursor: "pointer", width: "100%" }}
                    onClick={() => {
                      setSelected(c.id);
                      setCenter({ lat: c.lat, lng: c.lng });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <span className="row-main">
                      <span className="row-title">{c.name}</span>
                      <span className="row-meta">
                        {miles(c.distance_mi)}
                        {c.court_count ? `, ${c.court_count} courts` : ""}
                        {c.notes ? `. ${c.notes}` : ""}
                      </span>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      {c.open_games > 0 && <span className="pill pill-warn">{c.open_games} open</span>}
                      {c.available_players > 0 && <span className="pill pill-ball">{c.available_players} free</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

export default function CourtsPage() {
  return (
    <Suspense>
      <CourtsInner />
    </Suspense>
  );
}
