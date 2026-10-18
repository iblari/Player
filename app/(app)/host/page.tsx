"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/components/Session";
import CourtDiagram from "@/components/CourtDiagram";
import LocationSheet from "@/components/LocationSheet";
import MembershipPrompt from "@/components/MembershipPrompt";
import SportSwitch from "@/components/SportSwitch";
import { useMyRatings, useSport } from "@/lib/sport";
import { saveAnswer } from "@/lib/membership";
import { BackIcon, PinIcon } from "@/components/Icons";
import { useNearby } from "@/lib/nearby";
import { SPORT_META, type Court } from "@/lib/types";
import { clampSkill, fillChance, fmtSkill, miles, timeOf, when, YES_RATE_AVAILABLE, YES_RATE_NEARBY } from "@/lib/util";

const PlayerMap = dynamic(() => import("@/components/PlayerMap"), { ssr: false });

const STARTS = [
  { v: "15", label: "Now" },
  { v: "45", label: "In 45 min" },
  { v: "90", label: "In 1.5 hrs" },
  { v: "pick", label: "Pick a time" },
];

function localInputValue(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function HostInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile, userId } = useSession();
  const [sport, setSport] = useSport(profile?.sports, params.get("sport"));
  const { courts, cells } = useNearby(25, sport);
  const meta = SPORT_META[sport];
  const ratings = useMyRatings(userId);
  const myLevel = ratings ? (ratings[sport]?.level ?? null) : undefined;
  const clamp = (x: number) => clampSkill(x, meta.lo, meta.hi);
  const [courtId, setCourtId] = useState(params.get("court") ?? "");
  const [sheet, setSheet] = useState(!params.get("court"));
  const [slots, setSlots] = useState<2 | 4>(4);
  const [start, setStart] = useState(params.get("when") === "later" ? "pick" : "15");
  const [picked, setPicked] = useState(() => localInputValue(new Date(Date.now() + 3 * 3600e3)));
  const [min, setMin] = useState(3);
  const [max, setMax] = useState(3.5);
  const [editRange, setEditRange] = useState(false);
  const [note, setNote] = useState("");
  const [supply, setSupply] = useState<{ available: number; nearby: number } | null>(null);
  const [extra, setExtra] = useState<Court | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [hosting, setHosting] = useState<{ id: string; court_name: string; starts_at: string; status: string } | null>(null);

  useEffect(() => {
    supabase()
      .rpc("active_hosted_game")
      .then(({ data }) => setHosting(((data as { id: string; court_name: string; starts_at: string; status: string }[]) ?? [])[0] ?? null));
  }, []);

  // Default the rating range to my level in this sport, ±0.25.
  useEffect(() => {
    if (myLevel === undefined) return;
    const base = myLevel ?? 3.25;
    setMin(clamp(base - 0.25));
    setMax(clamp(base + 0.25));
  }, [sport, myLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  // A court picked from history may be outside the nearby list; fetch its point.
  const court = courts?.find((c) => c.id === courtId) ?? (extra?.id === courtId ? extra : null);
  useEffect(() => {
    if (!courtId || !courts || courts.some((c) => c.id === courtId)) return;
    (async () => {
      const sb = supabase();
      const [{ data: row }, { data: p }] = await Promise.all([
        sb.from("courts").select("id, name, address, court_count, notes, members_only, club, sports").eq("id", courtId).maybeSingle(),
        sb.rpc("court_point", { p_court: courtId }),
      ]);
      const pt = (p as { lat: number; lng: number }[])?.[0];
      if (row && pt) setExtra({ ...(row as Court), lat: pt.lat, lng: pt.lng, distance_mi: NaN, available_players: 0, open_games: 0 });
    })();
  }, [courtId, courts]);

  useEffect(() => {
    if (!courtId) return;
    let live = true;
    supabase()
      .rpc("fill_supply", { p_court: courtId, p_min: min, p_max: max, p_sport: sport })
      .then(({ data }) => live && setSupply((data as { available: number; nearby: number }[])?.[0] ?? { available: 0, nearby: 0 }));
    return () => {
      live = false;
    };
  }, [courtId, min, max, sport]);

  const startsAt = useMemo(() => {
    if (start === "pick") return picked ? new Date(picked) : null;
    return new Date(Date.now() + Number(start) * 60000);
  }, [start, picked]);

  const doubles = supply ? fillChance(supply.available, supply.nearby, 3) : null;
  const singles = supply ? fillChance(supply.available, supply.nearby, 1) : null;
  const chosen = slots === 4 ? doubles : singles;

  async function submit(confirmed = false) {
    setErr(null);
    if (!courtId) return setSheet(true);
    if (!startsAt || isNaN(startsAt.getTime())) return setErr("Pick a start time.");
    if (startsAt.getTime() < Date.now() - 60000) return setErr("That time has passed. Pick a later one.");
    setBusy(true);
    const { data, error } = await supabase().rpc("create_game", {
      p_court: courtId,
      p_slots: slots,
      p_min: min,
      p_max: max,
      p_starts: startsAt.toISOString(),
      p_note: note,
      p_confirmed: confirmed,
      p_sport: sport,
    });
    if (error?.message?.includes("already_hosting")) {
      setBusy(false);
      const { data: h } = await supabase().rpc("active_hosted_game");
      setHosting(((h as { id: string; court_name: string; starts_at: string; status: string }[]) ?? [])[0] ?? null);
      return setErr("You're already hosting a game. Cancel it or wait until it ends to host another.");
    }
    if (error?.message?.includes("court_sport")) {
      setBusy(false);
      return setErr(`${court?.name ?? "That court"} isn't listed for ${meta.label.toLowerCase()}. Pick another court.`);
    }
    if (error?.message?.includes("needs_membership")) {
      setBusy(false);
      return setAsk(true);
    }
    if (error || !data) {
      setBusy(false);
      return setErr(error?.message ?? "Couldn't post the game. Try again.");
    }
    fetch("/api/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId: data }) }).catch(() => {});
    router.replace(`/g/${data}?posted=1`);
  }

  const pct = (x: { p: number } | null) => (x ? `${Math.round(x.p * 100)}%` : "–");
  const me = userId ? [{ id: userId, name: profile?.display_name || "You", isMe: true }] : [];

  return (
    <>
      <div className="livemap tall" style={{ margin: "-16px -16px 0", borderRadius: "0 0 24px 24px", borderTop: 0 }}>
        {court && <PlayerMap center={{ lat: court.lat, lng: court.lng }} cells={cells} courts={[{ ...court, open_games: court.open_games }]} zoom={14} />}
        <div className="livemap-head" style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
          <button className="chip-live" style={{ border: 0, color: "inherit", cursor: "pointer", padding: 10 }} onClick={() => router.back()} aria-label="Back">
            <BackIcon />
          </button>
          {supply && (
            <span className="chip-live">
              <span className="pulse" aria-hidden="true" />
              {supply.available} available here
            </span>
          )}
        </div>
      </div>

      <SportSwitch value={sport} onChange={setSport} />
      {myLevel === null && (
        <div className="notice">
          <b>You haven&apos;t added {meta.label.toLowerCase()} yet</b>
          <span className="muted">Add it on your Account page so you get matched and pinged for {meta.label.toLowerCase()} games.</span>
        </div>
      )}

      <button className="list-row" style={{ border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)" }} onClick={() => setSheet(true)}>
        <span className="icon-circle">
          <PinIcon />
        </span>
        <span className="grow">
          <span className="t">{court?.name ?? "Pick a location to play"}</span>
          <span className="m">{court ? `${Number.isFinite(court.distance_mi) ? miles(court.distance_mi) + " away · " : ""}Change` : "Choose a court"}</span>
        </span>
      </button>

      {court?.sports && !court.sports.includes(sport) && (
        <div className="notice warn" role="status">
          <b>{court.name} isn&apos;t listed for {meta.label.toLowerCase()}</b>
          <span>Pick a court that has {meta.label.toLowerCase()}, or add it on the Courts tab.</span>
        </div>
      )}
      {court?.members_only && (
        <div className="notice">
          <b>{court.club ?? "Members"} only</b>
          <span className="muted">
            Only players who&apos;ve confirmed they&apos;re {court.club ? `${court.club} members` : "members"} will see and get pinged for this game.
          </span>
        </div>
      )}

      <section className="block">
        <h2>Choose your game</h2>
        <div className="options">
          {[
            { v: 4 as const, t: "Doubles", m: "You + 3 players", est: doubles },
            { v: 2 as const, t: "Singles", m: "You + 1 player", est: singles },
          ].map((o) => (
            <button key={o.v} className="option" aria-pressed={slots === o.v} onClick={() => setSlots(o.v)}>
              <CourtDiagram size="sm" slots={o.v} players={me} />
              <span>
                <span className="t">{o.t}</span>
                <br />
                <span className="m">{o.m}</span>
              </span>
              <span className="r">
                <b>{pct(o.est)}</b>
                <span className="m">fill chance</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="block">
        <h2>When</h2>
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
      </section>

      <section className="block">
        <div className="block-head">
          <h2>{meta.rating} level</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditRange((x) => !x)}>
            {fmtSkill(min)}–{fmtSkill(max)} · {editRange ? "Done" : "Edit"}
          </button>
        </div>
        {editRange && (
          <div className="btn-row">
            <div className="stepper" aria-label="Lowest rating">
              <button aria-label="Lower minimum" disabled={min <= meta.lo} onClick={() => setMin(clamp(min - 0.25))}>−</button>
              <output>{fmtSkill(min)}</output>
              <button aria-label="Raise minimum" disabled={min >= max} onClick={() => setMin(clamp(min + 0.25))}>+</button>
            </div>
            <div className="stepper" aria-label="Highest rating">
              <button aria-label="Lower maximum" disabled={max <= min} onClick={() => setMax(clamp(max - 0.25))}>−</button>
              <output>{fmtSkill(max)}</output>
              <button aria-label="Raise maximum" disabled={max >= meta.hi} onClick={() => setMax(clamp(max + 0.25))}>+</button>
            </div>
          </div>
        )}
        <input id="note" className="input" maxLength={140} placeholder="Note for players: court 3, I have balls" value={note} onChange={(e) => setNote(e.target.value)} />
      </section>

      {supply && chosen && (
        <p className="small muted" style={{ margin: 0 }}>
          {supply.available} available now and {supply.nearby} others play near here at {fmtSkill(min)}–{fmtSkill(max)}. Poisson estimate, λ = {chosen.lambda.toFixed(2)},
          assuming {Math.round(YES_RATE_AVAILABLE * 100)}% of available and {Math.round(YES_RATE_NEARBY * 100)}% of other players say yes.
        </p>
      )}

      <div className="sticky-cta">
        {err && <p className="err">{err}</p>}
        {hosting && (
          <div className="notice warn" role="status">
            <b>You&apos;re already hosting at {hosting.court_name}</b>
            <span>
              {hosting.status === "full" ? "That game is full and" : "That game is"} set for {when(hosting.starts_at)}. You can host one game at a time.
            </span>
            <button className="btn btn-sm" onClick={() => router.push(`/g/${hosting.id}`)}>
              Open your game
            </button>
          </div>
        )}
        <button className="btn btn-primary btn-block" onClick={() => submit()} disabled={busy || !!hosting || (!!court?.sports && !court.sports.includes(sport))}>
          {busy ? "Posting…" : `Find ${slots === 4 ? "3 players" : "1 player"} for ${meta.label.toLowerCase()}`}
        </button>
      </div>

      {sheet && (
        <LocationSheet
          courts={courts}
          onPick={(c) => {
            setCourtId(c.id);
            setSheet(false);
            router.replace(`/host?court=${c.id}&sport=${sport}${start === "pick" ? "&when=later" : ""}`);
          }}
          onClose={() => (courtId ? setSheet(false) : router.back())}
        />
      )}
      {ask && court && (
        <MembershipPrompt
          club={court.club ?? null}
          courtName={court.name}
          action="host"
          onClose={() => setAsk(false)}
          onAnswer={async (a) => {
            setAsk(false);
            await saveAnswer(court.club, a);
            submit(!court.club);
          }}
        />
      )}
    </>
  );
}

export default function HostPage() {
  return (
    <Suspense>
      <HostInner />
    </Suspense>
  );
}
