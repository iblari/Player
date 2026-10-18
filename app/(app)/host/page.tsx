"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { track } from "@/lib/track";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isMissing, rpcCompat, without } from "@/lib/rpc";
import { useSession } from "@/components/Session";
import CourtDiagram from "@/components/CourtDiagram";
import LocationSheet from "@/components/LocationSheet";
import WaitingGames from "@/components/WaitingGames";
import MembershipPrompt from "@/components/MembershipPrompt";
import SportSwitch from "@/components/SportSwitch";
import { useMyRatings, useSport } from "@/lib/sport";
import { saveAnswer } from "@/lib/membership";
import { BackIcon, PinIcon } from "@/components/Icons";
import { useNearby } from "@/lib/nearby";
import { clean, durationLabel, money, share, type Handles } from "@/lib/pay";
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
  const { courts, cells, coords } = useNearby(25, sport);
  const meta = SPORT_META[sport];
  const ratings = useMyRatings(userId);
  const myLevel = ratings ? (ratings[sport]?.level ?? null) : undefined;
  const clamp = (x: number) => clampSkill(x, meta.lo, meta.hi);
  const [courtId, setCourtId] = useState(params.get("court") ?? "");
  const [sheet, setSheet] = useState(!params.get("court"));
  // Singles by default: it needs one more player instead of three, so it fills far more often.
  const [slots, setSlots] = useState<2 | 4>(2);
  const [start, setStart] = useState(params.get("when") === "later" ? "pick" : "15");
  const [picked, setPicked] = useState(() => localInputValue(new Date(Date.now() + 3 * 3600e3)));
  const [min, setMin] = useState(3);
  const [max, setMax] = useState(3.5);
  const [editRange, setEditRange] = useState(false);
  const [note, setNote] = useState("");
  // Paid court: total cost and how long it's booked for; everyone splits it evenly.
  const [paid, setPaid] = useState(false);
  const [feeTotal, setFeeTotal] = useState("");
  const [feeMinutes, setFeeMinutes] = useState(90);
  const [handles, setHandles] = useState<Handles>({});
  const [handlesLoaded, setHandlesLoaded] = useState(false);
  const [supply, setSupply] = useState<{ available: number; nearby: number } | null>(null);
  // How past games actually filled vs the model; k = 1 until there's data.
  const [cal, setCal] = useState<{ k: number; games: number; filled: number } | null>(null);
  useEffect(() => {
    supabase()
      .rpc("fill_calibration")
      .then(({ data }) => data && setCal({ k: Number((data as { k: number }).k) || 1, games: (data as { games: number }).games, filled: (data as { filled: number }).filled }));
  }, []);
  const k = cal && cal.games >= 5 ? cal.k : 1;
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

  // Where I get paid, saved from last time.
  useEffect(() => {
    if (!userId) return;
    supabase()
      .from("payment_handles")
      .select("venmo, cashapp, paypal, zelle")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setHandles(data as Handles);
        setHandlesLoaded(true);
      });
  }, [userId]);

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
    const base = { p_court: courtId, p_min: min, p_max: max };
    rpcCompat("fill_supply", { ...base, p_sport: sport }, base)
      .then(({ data }) => live && setSupply((data as { available: number; nearby: number }[])?.[0] ?? { available: 0, nearby: 0 }));
    return () => {
      live = false;
    };
  }, [courtId, min, max, sport]);

  const startsAt = useMemo(() => {
    if (start === "pick") return picked ? new Date(picked) : null;
    return new Date(Date.now() + Number(start) * 60000);
  }, [start, picked]);

  const doubles = supply ? fillChance(supply.available, supply.nearby, 3, k) : null;
  const singles = supply ? fillChance(supply.available, supply.nearby, 1, k) : null;
  const chosen = slots === 4 ? doubles : singles;

  async function submit(confirmed = false) {
    setErr(null);
    if (!courtId) return setSheet(true);
    if (!startsAt || isNaN(startsAt.getTime())) return setErr("Pick a start time.");
    const fee = Number(feeTotal);
    if (paid && (!feeTotal || !(fee > 0) || fee > 2000)) return setErr("Enter what the court costs, or switch it to Free.");
    if (startsAt.getTime() < Date.now() - 60000) return setErr("That time has passed. Pick a later one.");
    setBusy(true);
    const args = {
      p_court: courtId,
      p_slots: slots,
      p_min: min,
      p_max: max,
      p_starts: startsAt.toISOString(),
      p_note: note,
      p_confirmed: confirmed,
      p_sport: sport,
    };
    // An older database can only create pickleball games, so only fall back for pickleball.
    const { data, error } = await rpcCompat<string>("create_game", args, sport === "pickleball" ? without(args, "p_sport") : null);
    if (error && isMissing(error)) {
      setBusy(false);
      return setErr(`${meta.label} games aren't switched on yet. Try again soon.`);
    }
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
    if (paid && userId) {
      // Fee and payment handles are saved alongside the game (older databases just skip this).
      const sb = supabase();
      const h = {
        venmo: handles.venmo ? clean.venmo(handles.venmo) || null : null,
        cashapp: handles.cashapp ? clean.cashapp(handles.cashapp) || null : null,
        paypal: handles.paypal ? clean.paypal(handles.paypal) || null : null,
        zelle: handles.zelle ? clean.zelle(handles.zelle) || null : null,
      };
      await Promise.all([
        sb.from("games").update({ fee_total: fee, fee_minutes: feeMinutes }).eq("id", data),
        sb.from("payment_handles").upsert({ user_id: userId, ...h, updated_at: new Date().toISOString() }),
      ]);
    }
    track("game_posted", { sport, slots, paid });
    // Snapshot the model's inputs so fill chance can learn from how this game turns out.
    if (supply) supabase().from("games").update({ supply_available: supply.available, supply_nearby: supply.nearby }).eq("id", data).then(() => {});
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

      {courtId && !sheet && <WaitingGames courtId={courtId} courtName={court?.name} sport={sport} userId={userId} />}

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
            { v: 2 as const, t: "Singles", m: "You + 1 player", est: singles, tag: "Fills fastest" },
            { v: 4 as const, t: "Doubles", m: "You + 3 players", est: doubles, tag: null },
          ].map((o) => (
            <button key={o.v} className="option" aria-pressed={slots === o.v} onClick={() => setSlots(o.v)}>
              <CourtDiagram size="sm" slots={o.v} players={me} />
              <span>
                <span className="t">{o.t}</span>
                {o.tag && <span className="pill pill-ball" style={{ marginLeft: 8, verticalAlign: "2px" }}>{o.tag}</span>}
                <br />
                <span className="m">{o.m}</span>
              </span>
              <span className="r">
                {o.est && o.est.lambda === 0 ? (
                  <>
                    <b>New</b>
                    <span className="m">area</span>
                  </>
                ) : (
                  <>
                    <b>{pct(o.est)}</b>
                    <span className="m">fill chance</span>
                  </>
                )}
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

      <section className="block">
        <div className="block-head">
          <h2>Court cost</h2>
          <div className="seg" role="group" aria-label="Court cost">
            <button aria-pressed={!paid} onClick={() => setPaid(false)}>
              Free
            </button>
            <button aria-pressed={paid} onClick={() => setPaid(true)}>
              Paid
            </button>
          </div>
        </div>
        {paid && (
          <div className="fee-box">
            <div className="fee-row">
              <label className="money-input">
                <span>$</span>
                <input inputMode="decimal" placeholder="40" value={feeTotal} onChange={(e) => setFeeTotal(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Total court cost in dollars" />
              </label>
              <span className="muted small">total, for</span>
              <div className="seg seg-sm" role="group" aria-label="Court booked for">
                {[60, 90, 120].map((m) => (
                  <button key={m} aria-pressed={feeMinutes === m} onClick={() => setFeeMinutes(m)}>
                    {durationLabel(m)}
                  </button>
                ))}
              </div>
            </div>
            {Number(feeTotal) > 0 && (
              <p className="fee-split">
                Split {slots} ways: <b>{money(share(Number(feeTotal), slots))} each</b>
                {slots === 2 ? ` (doubles would be ${money(share(Number(feeTotal), 4))} each)` : ` (singles would be ${money(share(Number(feeTotal), 2))} each)`}
              </p>
            )}
            <span className="opt-label">Players pay you with</span>
            <div className="handles">
              {(
                [
                  ["venmo", "Venmo", "@username"],
                  ["cashapp", "Cash App", "$cashtag"],
                  ["zelle", "Zelle", "phone or email"],
                  ["paypal", "PayPal", "paypal.me name"],
                ] as const
              ).map(([k, label, ph]) => (
                <label key={k} className="handle">
                  <span>{label}</span>
                  <input
                    className="input"
                    placeholder={ph}
                    value={handles[k] ?? ""}
                    onChange={(e) => setHandles((h) => ({ ...h, [k]: e.target.value }))}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </label>
              ))}
            </div>
            <span className="small muted">
              {handlesLoaded && Object.values(handles).some(Boolean) ? "Saved for next time. " : ""}Only players who join your game see these.
            </span>
          </div>
        )}
      </section>

      {supply && chosen && (
        <p className="small muted" style={{ margin: 0 }}>
          {chosen.lambda === 0 ? (
            <>No players at {fmtSkill(min)}–{fmtSkill(max)} near here yet. Post anyway: everyone who signs up or goes available nearby can see it, and the fill chance rises as players join this area.</>
          ) : (
            <>
              {supply.available} available now and {supply.nearby} others play near here at {fmtSkill(min)}–{fmtSkill(max)}. Poisson estimate, λ = {chosen.lambda.toFixed(2)},
              assuming {Math.round(YES_RATE_AVAILABLE * k * 100)}% of available and {Math.round(Math.min(1, YES_RATE_NEARBY * k) * 100)}% of other players say yes
              {cal && cal.games >= 5
                ? `, learned from ${cal.games} past games (${Math.round((cal.filled / cal.games) * 100)}% filled).`
                : ". These rates start as estimates and learn from real games."}
            </>
          )}
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
          near={coords}
          sport={sport}
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
