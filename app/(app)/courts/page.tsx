"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { rpcCompat, without } from "@/lib/rpc";
import { useToast } from "@/components/Toast";
import { GeoError, getCoords, lastCoords, type Coords, type GeoReason } from "@/lib/geo";
import LocationFix from "@/components/LocationFix";
import { SPORTS, SPORT_META, type Court, type Sport } from "@/lib/types";
import { miles } from "@/lib/util";
import PlaceSearch from "@/components/PlaceSearch";
import SportSwitch from "@/components/SportSwitch";
import { useSession } from "@/components/Session";
import { useSport } from "@/lib/sport";

const CourtMap = dynamic(() => import("@/components/CourtMap"), { ssr: false, loading: () => <div className="map skeleton" /> });

const FALLBACK: Coords = { lat: 40.7128, lng: -74.006 }; // New York, used only until location is shared

function CourtsInner() {
  const toast = useToast();
  const params = useSearchParams();
  const { profile } = useSession();
  const [sport, setSport] = useSport(profile?.sports);
  const [sports, setSports] = useState<Sport[]>([]);
  const [me, setMe] = useState<Coords | null>(null);
  const [center, setCenter] = useState<Coords>(FALLBACK);
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [locReason, setLocReason] = useState<GeoReason>("unavailable");
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
    const base = { lat: c.lat, lng: c.lng, radius_mi: 30 };
    const { data } = await rpcCompat("nearby_courts", { ...base, p_sport: sport }, base);
    setCourts((data as Court[]) ?? []);
  }, [sport]);

  // New courts default to the sport being browsed.
  useEffect(() => setSports([sport]), [sport]);
  useEffect(() => {
    load(me ?? center);
  }, [sport]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setLocReason(e instanceof GeoError ? e.reason : "unavailable");
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
    if (!sports.length) return setErr("Pick at least one sport played here.");
    const near = courts?.find((c) => c.name.toLowerCase() === name.trim().toLowerCase() && c.distance_mi < 2);
    if (near) return setErr("That court is already listed nearby.");
    setBusy(true);
    const courtArgs = {
      p_name: name,
      lat: pin.lat,
      lng: pin.lng,
      p_count: count ? Number(count) : null,
      p_notes: notes,
      p_address: address,
      p_sports: sports,
    };
    // An older database tags every new court pickleball, so only fall back when that's all that was picked.
    const { error } = await rpcCompat("add_court", courtArgs, sports.length === 1 && sports[0] === "pickleball" ? without(courtArgs, "p_sports") : null);
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
          <p className="sub">{courts ? `${courts.length} ${SPORT_META[sport].label.toLowerCase()} court${courts.length === 1 ? "" : "s"} within 30 mi` : "Finding courts near you"}</p>
        </div>
        {!adding && (
          <button className="btn btn-sm" onClick={() => setAdding(true)}>
            Add a court
          </button>
        )}
      </div>

      {!adding && <SportSwitch value={sport} onChange={setSport} />}

      {locErr && !adding && (
        <LocationFix
          reason={locReason}
          message={locErr}
          onRetry={locate}
          onManual={(pt) => {
            setCenter(pt);
            setPin(pt);
            load(pt);
          }}
        />
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
          <div className="field">
            <span>Sports played here</span>
            <div className="seg" role="group" aria-label="Sports played here">
              {SPORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={sports.includes(s.id)}
                  onClick={() => setSports((xs) => (xs.includes(s.id) ? xs.filter((x) => x !== s.id) : [...xs, s.id]))}
                >
                  {sports.includes(s.id) ? "✓ " : "+ "}
                  {s.label}
                </button>
              ))}
            </div>
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
              <Link className="btn btn-sm btn-primary" href={`/host?court=${sel.id}&sport=${sport}`}>
                Host a game here
              </Link>
            </div>
          )}
          <section className="block">
            {courts === null ? (
              <div className="skeleton" />
            ) : courts.length === 0 ? (
              <div className="empty">
                <strong>No {SPORT_META[sport].label.toLowerCase()} courts listed near you yet.</strong>
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
                        {c.town ? ` · ${c.town}` : ""}
                        {c.court_count ? ` · ${c.court_count} court${c.court_count > 1 ? "s" : ""}` : ""}
                        {c.indoor ? " · Indoor" : ""}
                        {c.members_only ? " · Members only" : ""}
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
