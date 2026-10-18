"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/components/Session";
import CourtDiagram from "@/components/CourtDiagram";
import { getCoords, lastCoords } from "@/lib/geo";
import type { Court } from "@/lib/types";
import { clampSkill, fillChance, fmtSkill, miles, timeOf, YES_RATE_AVAILABLE, YES_RATE_NEARBY } from "@/lib/util";

const STARTS = [
  { v: "15", label: "Now" },
  { v: "45", label: "In 45 min" },
  { v: "90", label: "In 1.5 hrs" },
  { v: "pick", label: "Pick a time" },
];

function localInputValue(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function HostPage() {
  const router = useRouter();
  const { profile, userId } = useSession();
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [courtId, setCourtId] = useState("");
  const [slots, setSlots] = useState<2 | 4>(4);
  const [start, setStart] = useState("15");
  const [picked, setPicked] = useState(() => localInputValue(new Date(Date.now() + 3 * 3600e3)));
  const [min, setMin] = useState(3);
  const [max, setMax] = useState(3.5);
  const [note, setNote] = useState("");
  const [supply, setSupply] = useState<{ available: number; nearby: number } | null>(null);
  const [wide, setWide] = useState<{ available: number; nearby: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setMin(clampSkill(Number(profile.skill) - 0.25));
      setMax(clampSkill(Number(profile.skill) + 0.25));
    }
  }, [profile?.skill]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCourts(fresh = false) {
    setLocErr(null);
    try {
      const c = (!fresh && lastCoords()) || (await getCoords());
      const { data } = await supabase().rpc("nearby_courts", { lat: c.lat, lng: c.lng, radius_mi: 25 });
      const list = (data as Court[]) ?? [];
      setCourts(list);
      if (list.length && !list.some((x) => x.id === courtId)) setCourtId(list[0].id);
    } catch (e) {
      setLocErr((e as Error).message);
      setCourts([]);
    }
  }
  useEffect(() => {
    loadCourts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!courtId) return;
    const sb = supabase();
    let live = true;
    Promise.all([
      sb.rpc("fill_supply", { p_court: courtId, p_min: min, p_max: max }),
      sb.rpc("fill_supply", { p_court: courtId, p_min: clampSkill(min - 0.25), p_max: clampSkill(max + 0.25) }),
    ]).then(([a, b]) => {
      if (!live) return;
      setSupply((a.data as { available: number; nearby: number }[])?.[0] ?? { available: 0, nearby: 0 });
      setWide((b.data as { available: number; nearby: number }[])?.[0] ?? { available: 0, nearby: 0 });
    });
    return () => {
      live = false;
    };
  }, [courtId, min, max]);

  const startsAt = useMemo(() => {
    if (start === "pick") return picked ? new Date(picked) : null;
    return new Date(Date.now() + Number(start) * 60000);
  }, [start, picked]);

  const need = slots - 1;
  const est = supply ? fillChance(supply.available, supply.nearby, need) : null;
  const estWide = wide ? fillChance(wide.available, wide.nearby, need) : null;
  const tone = !est ? "" : est.p >= 0.7 ? "ok" : est.p >= 0.35 ? "warn" : "bad";
  const court = courts?.find((c) => c.id === courtId);

  async function submit() {
    setErr(null);
    if (!courtId) return setErr("Pick a court.");
    if (!startsAt || isNaN(startsAt.getTime())) return setErr("Pick a start time.");
    if (startsAt.getTime() < Date.now() - 60000) return setErr("That time has passed. Pick a later one.");
    if (min > max) return setErr("The lowest rating must be at or below the highest.");
    setBusy(true);
    const { data, error } = await supabase().rpc("create_game", {
      p_court: courtId,
      p_slots: slots,
      p_min: min,
      p_max: max,
      p_starts: startsAt.toISOString(),
      p_note: note,
    });
    if (error || !data) {
      setBusy(false);
      return setErr(error?.message ?? "Couldn't post the game. Try again.");
    }
    fetch("/api/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId: data }) }).catch(() => {});
    router.push(`/g/${data}?posted=1`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Host a game</h1>
          <p className="sub">Players near the court at your level get pinged.</p>
        </div>
      </div>

      <CourtDiagram
        slots={slots}
        players={userId ? [{ id: userId, name: profile?.display_name || "You", isMe: true }] : []}
        label={`${slots === 4 ? "Doubles" : "Singles"} court with you in the first spot`}
      />

      <section className="block">
        <label className="field">
          <span>Court</span>
          {courts === null ? (
            <div className="skeleton" style={{ minHeight: 48 }} />
          ) : courts.length === 0 ? (
            <div className="empty">
              <strong>{locErr ?? "No courts listed within 25 mi yet."}</strong>
              <span>Add your court once and everyone nearby can use it.</span>
              <div className="btn-row" style={{ width: "100%" }}>
                <Link className="btn btn-sm btn-primary" href="/courts?add=1">
                  Add a court
                </Link>
                {locErr && (
                  <button className="btn btn-sm" onClick={() => loadCourts(true)}>
                    Try location again
                  </button>
                )}
              </div>
            </div>
          ) : (
            <select id="court" className="input" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {miles(c.distance_mi)}
                </option>
              ))}
            </select>
          )}
        </label>

        <div className="field">
          <span>Format</span>
          <div className="seg">
            <button aria-pressed={slots === 4} onClick={() => setSlots(4)}>
              Doubles, need 3
            </button>
            <button aria-pressed={slots === 2} onClick={() => setSlots(2)}>
              Singles, need 1
            </button>
          </div>
        </div>

        <div className="field">
          <span>Start</span>
          <div className="seg">
            {STARTS.map((s) => (
              <button key={s.v} aria-pressed={start === s.v} onClick={() => setStart(s.v)}>
                {s.label}
              </button>
            ))}
          </div>
          {start === "pick" ? (
            <input id="start-time" className="input" type="datetime-local" value={picked} onChange={(e) => setPicked(e.target.value)} />
          ) : (
            startsAt && <span className="small muted">Starts around {timeOf(startsAt)}</span>
          )}
        </div>

        <div className="field">
          <span>Rating range</span>
          <div className="btn-row">
            <div className="stepper" aria-label="Lowest rating">
              <button aria-label="Lower minimum" disabled={min <= 2} onClick={() => setMin(clampSkill(min - 0.25))}>
                −
              </button>
              <output>{fmtSkill(min)}</output>
              <button aria-label="Raise minimum" disabled={min >= max} onClick={() => setMin(clampSkill(min + 0.25))}>
                +
              </button>
            </div>
            <div className="stepper" aria-label="Highest rating">
              <button aria-label="Lower maximum" disabled={max <= min} onClick={() => setMax(clampSkill(max - 0.25))}>
                −
              </button>
              <output>{fmtSkill(max)}</output>
              <button aria-label="Raise maximum" disabled={max >= 5.5} onClick={() => setMax(clampSkill(max + 0.25))}>
                +
              </button>
            </div>
          </div>
        </div>

        <label className="field">
          <span>Note for players (optional)</span>
          <input id="note" className="input" maxLength={140} placeholder="Court 3 by the fence. I have balls." value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {est && court && (
          <div className="estimate" aria-live="polite">
            <div className="estimate-top">
              <b>Chance it fills</b>
              <span className={`pill pill-${tone}`}>~{Math.round(est.p * 100)}%</span>
            </div>
            <div className="meter">
              <i style={{ width: `${Math.round(est.p * 100)}%` }} />
            </div>
            <span className="small muted">
              {supply!.available} available now and {supply!.nearby} others play near {court.name} at this level. You need {need}.
            </span>
            {estWide && estWide.p - est.p > 0.08 && (
              <span className="small">
                Widen to {fmtSkill(clampSkill(min - 0.25))}–{fmtSkill(clampSkill(max + 0.25))} and it rises to ~{Math.round(estWide.p * 100)}%.{" "}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: 0, minHeight: 0, color: "var(--court)" }}
                  onClick={() => {
                    setMin(clampSkill(min - 0.25));
                    setMax(clampSkill(max + 0.25));
                  }}
                >
                  Widen range
                </button>
              </span>
            )}
            <span className="small muted">
              Model: Poisson with λ = {est.lambda.toFixed(2)}, assuming {Math.round(YES_RATE_AVAILABLE * 100)}% of available players and{" "}
              {Math.round(YES_RATE_NEARBY * 100)}% of others say yes.
            </span>
          </div>
        )}

        {err && <p className="err">{err}</p>}
        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy || !courts?.length}>
          {busy ? "Posting…" : "Post game and ping players"}
        </button>
      </section>
    </>
  );
}
