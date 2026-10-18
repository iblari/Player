"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { rpcCompat, without } from "@/lib/rpc";
import { useToast } from "@/components/Toast";
import { GeoError, getCoords, lastCoords, type Coords, type GeoReason } from "@/lib/geo";
import LocationFix from "@/components/LocationFix";
import { seedArea } from "@/lib/seed";
import { SPORTS, SPORT_META, type Court, type Sport } from "@/lib/types";
import { miles } from "@/lib/util";
import { BackIcon, PinIcon, PlusIcon } from "@/components/Icons";
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
  const [open, setOpen] = useState(false); // list sheet expanded
  const [vh, setVh] = useState(800);
  useEffect(() => {
    const f = () => setVh(window.innerHeight);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  const drag = useRef<number | null>(null);

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
      seedArea(c).then((n) => {
        if (n > 0) load(c);
      });
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

  const peek = Math.round(vh * 0.4);
  const fitTo = (courts ?? []).slice(0, 8).map((x) => ({ lat: x.lat, lng: x.lng })).concat(me ? [me] : []);
  const label = SPORT_META[sport].label.toLowerCase();

  if (!adding)
    return (
      <div className="mf">
        <div className="mf-map">
          <CourtMap
            fill
            center={center}
            courts={courts ?? []}
            me={me}
            selected={selected}
            bottomInset={peek}
            fitTo={fitTo}
            fitKey={`${sport}|${courts ? courts.length : "-"}|${me ? me.lat.toFixed(2) : ""}`}
            onSelect={(id) => {
              setSelected(id);
              setOpen(false);
            }}
          />
        </div>

        <div className="mf-top">
          <SportSwitch value={sport} onChange={setSport} />
          <button className="mf-fab" onClick={() => setAdding(true)} aria-label="Add a court">
            <PlusIcon />
          </button>
        </div>

        {me && (
          <button
            className="mf-locate"
            style={{ bottom: (open ? vh * 0.78 : peek) + 12 }}
            onClick={() => {
              setSelected(null);
              setCenter({ ...me });
            }}
            aria-label="Center on me"
          >
            <span className="me-dot" />
          </button>
        )}

        <section className={`mf-sheet${open ? " open" : ""}`} style={{ height: open ? "78dvh" : peek }} aria-label={`${SPORT_META[sport].label} courts`}>
          <button
            className="mf-grip"
            aria-label={open ? "Show the map" : "Show all courts"}
            onClick={() => setOpen((x) => !x)}
            onPointerDown={(e) => (drag.current = e.clientY)}
            onPointerUp={(e) => {
              if (drag.current === null) return;
              const dy = e.clientY - drag.current;
              drag.current = null;
              if (dy < -30) setOpen(true);
              else if (dy > 30) setOpen(false);
            }}
          >
            <span />
          </button>

          {sel ? (
            <div className="mf-sel">
              <div className="mf-sel-head">
                <button className="mf-back" onClick={() => setSelected(null)} aria-label="Back to the list">
                  <BackIcon />
                </button>
                <span className="grow">
                  <b>{sel.name}</b>
                  <small>
                    {miles(sel.distance_mi)} away
                    {sel.town ? ` · ${sel.town}` : ""}
                    {sel.court_count ? ` · ${sel.court_count} court${sel.court_count > 1 ? "s" : ""}` : ""}
                    {sel.indoor ? " · Indoor" : ""}
                    {sel.lit ? " · Lights" : ""}
                  </small>
                </span>
              </div>
              <div className="mf-stats">
                <span><b>{sel.available_players}</b> free nearby</span>
                <span><b>{sel.open_games}</b> open game{sel.open_games === 1 ? "" : "s"}</span>
                {sel.members_only && <span>{sel.club ?? "Members"} only</span>}
              </div>
              <div className="btn-row">
                <Link className="btn btn-ball" href={`/host?court=${sel.id}&sport=${sport}`}>
                  {sel.open_games > 0 ? "Join or host here" : "Play here"}
                </Link>
                <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}`} target="_blank" rel="noreferrer">
                  Directions
                </a>
              </div>
            </div>
          ) : (
            <div className="mf-head">
              <h1>Courts</h1>
              <span className="muted small">{courts ? `${courts.length} ${label} court${courts.length === 1 ? "" : "s"} within 30 mi` : "Finding courts near you"}</span>
            </div>
          )}

          <div className="mf-list">
            {locErr && (
              <LocationFix
                reason={locReason}
                message={locErr}
                onRetry={locate}
                onManual={(pt) => {
                  setCenter(pt);
                  setPin(pt);
                  load(pt);
                  seedArea(pt).then((n) => {
                    if (n > 0) load(pt);
                  });
                }}
              />
            )}
            {courts === null ? (
              <div className="skeleton" />
            ) : courts.length === 0 ? (
              <div className="empty">
                <strong>No {label} courts listed near you yet.</strong>
                <span>Add the one you play at most. One busy court beats ten empty ones.</span>
                <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
                  Add a court
                </button>
              </div>
            ) : (
              courts.map((x) => (
                <button
                  key={x.id}
                  className={`mf-row${x.id === selected ? " on" : ""}`}
                  onClick={() => {
                    setSelected(x.id);
                    setOpen(false);
                    setCenter({ lat: x.lat, lng: x.lng });
                  }}
                >
                  <span className="icon-circle"><PinIcon /></span>
                  <span className="grow">
                    <b>{x.name}</b>
                    <small>
                      {miles(x.distance_mi)}
                      {x.town ? ` · ${x.town}` : ""}
                      {x.court_count ? ` · ${x.court_count} court${x.court_count > 1 ? "s" : ""}` : ""}
                      {x.indoor ? " · Indoor" : ""}
                      {x.members_only ? " · Members" : ""}
                    </small>
                  </span>
                  {x.open_games > 0 ? (
                    <span className="pill pill-ball">{x.open_games} open</span>
                  ) : x.available_players > 0 ? (
                    <span className="pill">{x.available_players} free</span>
                  ) : null}
                </button>
              ))
            )}
            <p className="small muted" style={{ fontSize: 11, margin: "8px 0 0" }}>
              Map and court data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors.
            </p>
          </div>
        </section>
      </div>
    );

  return (
    <>
      {(
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
