"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { rpcCompat, without } from "@/lib/rpc";
import { useSession } from "@/components/Session";
import { useToast } from "@/components/Toast";
import CourtDiagram from "@/components/CourtDiagram";
import LocationSheet from "@/components/LocationSheet";
import MembershipPrompt from "@/components/MembershipPrompt";
import { joinGame, saveAnswer } from "@/lib/membership";
import RecommendedCourts from "@/components/RecommendedCourts";
import SportSwitch from "@/components/SportSwitch";
import { useSport } from "@/lib/sport";
import Avatar from "@/components/Avatar";
import { CalendarIcon, ChevronIcon, ClockIcon, PlusIcon, SearchIcon } from "@/components/Icons";
import { getCoords, isDenied, lastCoords } from "@/lib/geo";
import LocationFix from "@/components/LocationFix";
import WhereYouPlay from "@/components/WhereYouPlay";
import { useNearby } from "@/lib/nearby";
import { fetchMyGames, fetchPlayers, JOIN_MESSAGES, nameOf, useLiveGames, type GameView } from "@/lib/games";
import { isAvailable, SPORT_META, type Court, type PlayerLite } from "@/lib/types";
import { fmtSkill, miles, pastLabel, timeOf, when } from "@/lib/util";

const PlayerMap = dynamic(() => import("@/components/PlayerMap"), { ssr: false });

type Recent = { id: string; name: string; address: string | null; last_played: string };
type Nearby = Omit<GameView, "status" | "attendance_done" | "created_at" | "filled_at" | "court_lat" | "court_lng">;

const HOURS = [1, 2, 3, 4];
const RADII = [2, 5, 10, 20];

export default function HomePage() {
  const router = useRouter();
  const toast = useToast();
  const { userId, profile, update, refresh } = useSession();
  const [sport, setSport] = useSport(profile?.sports);
  const { coords, locErr, locReason, courts, cells, players: nearbyPlayers, locate, refresh: refreshMap, setManual, ask: askWhere, seeding } = useNearby(15, sport);
  const [sheet, setSheet] = useState<null | "now" | "later">(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [dur, setDur] = useState<number | "pick" | null>(null);
  const [untilTime, setUntilTime] = useState(() => {
    const d = new Date(Date.now() + 2 * 3600e3);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [games, setGames] = useState<GameView[] | null>(null);
  const [next, setNext] = useState<GameView | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerLite>>({});
  const [busy, setBusy] = useState(false);
  const [showOpts, setShowOpts] = useState(false);
  const [allGames, setAllGames] = useState(false);
  const [ask, setAsk] = useState<GameView | null>(null);
  const [recommended, setRecommended] = useState<Court[] | null>(null);
  const sportLabel = SPORT_META[sport].label;

  useEffect(() => {
    if (!coords) return;
    const base = { lat: coords.lat, lng: coords.lng, p_limit: 8 };
    rpcCompat("recommended_courts", { ...base, p_sport: sport }, base)
      .then(({ data }) => setRecommended((data as Court[]) ?? []));
  }, [coords, courts, sport]);

  const avail = isAvailable(profile);
  const firstName = profile?.display_name && !profile.display_name.includes("@") ? profile.display_name.split(" ")[0] : "";

  const load = useCallback(async () => {
    if (!userId) return;
    const sb = supabase();
    const [{ data: r }, { data: n }, mine] = await Promise.all([rpcCompat("recent_courts", { p_limit: 2, p_sport: sport }, { p_limit: 2 }), sb.rpc("games_for_me"), fetchMyGames(userId)]);
    setRecent((r as Recent[]) ?? []);
    const near = ((n as Nearby[]) ?? []).map((g) => ({ ...g, status: "open" as const, attendance_done: false, created_at: "", filled_at: null, court_lat: null, court_lng: null }));
    setGames(near);
    // A game is over once someone marks it ended or a final score is in.
    const scored = new Set<string>();
    if (mine.length) {
      const { data: res } = await sb.from("game_results").select("game_id").in("game_id", mine.map((g) => g.id));
      ((res as { game_id: string }[]) ?? []).forEach((r) => scored.add(r.game_id));
    }
    const upcoming = mine.filter((g) => !g.ended_at && !scored.has(g.id) && new Date(g.starts_at).getTime() > Date.now() - 90 * 60000).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    setNext(upcoming[0] ?? null);
    setPlayers(await fetchPlayers([...near, ...mine].flatMap((g) => g.player_ids)));
  }, [userId, sport]);

  useEffect(() => {
    load();
  }, [load, profile?.location, profile?.radius_mi, profile?.skill]);
  useLiveGames(() => {
    load();
    refreshMap();
  });

  const recents = useMemo(() => {
    const short = (n: string) => n.replace(/^(Tennis|Pickleball|Tennis & pickleball) courts · /, "");
    const fromHistory = recent.map((r) => ({ id: r.id, name: short(r.name), sub: pastLabel(r.last_played) }));
    if (fromHistory.length) return fromHistory;
    return (courts ?? []).slice(0, 2).map((c) => ({ id: c.id, name: short(c.name), sub: `${miles(c.distance_mi)} away` }));
  }, [recent, courts]);

  const availableCount = cells.reduce((s, c) => s + c.players, 0);
  // Always lead with the biggest number that is true: free now > players nearby > courts nearby.
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const headline =
    availableCount > 0
      ? `${plural(availableCount, "player")} free now${nearbyPlayers && nearbyPlayers > availableCount ? ` · ${nearbyPlayers} nearby` : ""}`
      : nearbyPlayers && nearbyPlayers > 0
        ? `${plural(nearbyPlayers, "player")} nearby · be the first free`
        : seeding && (courts?.length ?? 0) < 5
          ? "Loading courts near you…"
          : courts?.length
            ? `${plural(courts.length, "court")} within 15 mi`
            : "Finding courts near you";

  function untilFromTime(t: string) {
    const [hh, mm] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    if (d.getTime() < Date.now() + 10 * 60e3) d.setDate(d.getDate() + 1);
    return d;
  }
  async function goAvailable(h: number | Date = 2) {
    const untilDate = h instanceof Date ? h : new Date(Date.now() + h * 3600e3);
    if (untilDate.getTime() - Date.now() > 16 * 3600e3) return toast("Pick a time within the next 16 hours.");
    setBusy(true);
    try {
      // Location blocked but they typed a town: use that area.
      const c = await getCoords().catch((e) => {
        const typed = lastCoords();
        if (isDenied(e) && typed) return typed;
        throw e;
      });
      await supabase().rpc("set_location", { lat: c.lat, lng: c.lng });
      const until = untilDate.toISOString();
      const err = await update({ available_until: until });
      await refresh();
      toast(err ?? `You're available until ${timeOf(until)}.`);
      load();
    } catch (e) {
      if (isDenied(e)) {
        toast("Location is off. Turn it on, or type a town, to go available.");
        document.getElementById("locfix")?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    setBusy(true);
    toast((await update({ available_until: null })) ?? "You're off the board.");
    setBusy(false);
  }
  async function join(id: string, confirmed = false) {
    const res = await joinGame(id, confirmed);
    if (res === "needs_membership") return setAsk(games?.find((g) => g.id === id) ?? null);
    toast(res === "error" ? "Couldn't join. Try again." : JOIN_MESSAGES[res] ?? "Done.");
    if (res === "joined") router.push(`/g/${id}`);
    else load();
  }
  async function pass(id: string) {
    setGames((xs) => xs?.filter((g) => g.id !== id) ?? null);
    await supabase().from("game_passes").insert({ game_id: id, player_id: userId });
  }
  function pick(c: Court) {
    router.push(`/host?court=${c.id}&sport=${sport}${sheet === "later" ? "&when=later" : ""}`);
  }

  const names = (id: string) => nameOf(players, id, userId);
  const visible = games?.filter((g) => (g.sport ?? "pickleball") === sport) ?? null;

  return (
    <div className="home">
      <div className="home-top">
        <SportSwitch value={sport} onChange={setSport} />
        <Link href="/me" aria-label="Account" style={{ flex: "none", marginLeft: "auto" }}>
          {userId && <Avatar id={userId} name={profile?.display_name || "You"} size={34} src={profile?.avatar_url} />}
        </Link>
      </div>
      <h1 className="home-hi">{firstName ? `Hi, ${firstName}` : "Find a game"}</h1>

      {askWhere && <WhereYouPlay onLocate={locate} onPlace={(pt) => setManual(pt)} />}

      <div className="home-search" role="button" tabIndex={0} onClick={() => setSheet("now")} onKeyDown={(e) => e.key === "Enter" && setSheet("now")}>
        <SearchIcon />
        <span className="label">Where to play?</span>
        <button
          className="when-btn"
          aria-label="Schedule for later"
          onClick={(e) => {
            e.stopPropagation();
            setSheet("later");
          }}
        >
          <CalendarIcon /> Later
        </button>
      </div>

      <div className="home-chips" aria-label="Recent courts">
        {recents.map((r) => (
          <Link key={r.id} className="home-chip" href={`/host?court=${r.id}&sport=${sport}`}>
            <span className="ci">
              <ClockIcon />
            </span>
            <span className="tx">
              <b>{r.name}</b>
              <small>{r.sub}</small>
            </span>
          </Link>
        ))}
        <Link className="home-chip" href="/courts?add=1">
          <span className="ci">
            <PlusIcon />
          </span>
          <span className="tx">
            <b>Add court</b>
            <small>Not listed?</small>
          </span>
        </Link>
      </div>

      <div>
        <div className={`avail-strip slim${avail ? " on" : ""}`}>
          <button className="grow" onClick={() => setShowOpts((x) => !x)} aria-expanded={showOpts}>
            <b>{avail ? "Down to play" : "Not available"}</b>
            <span>{avail ? ` · until ${timeOf(profile!.available_until!)} · ${profile!.radius_mi} mi` : " · players can't ping you"}</span>
          </button>
          <button className="switch" role="switch" aria-checked={avail} aria-label={avail ? "Stop being available" : "Go available"} disabled={busy} onClick={() => (avail ? stop() : goAvailable())} />
        </div>
        {showOpts && (
          <div className="avail-opts" style={{ marginTop: 8 }}>
            <div className="opt-group">
              <span className="opt-label">Free for</span>
              <div className="segbar segbar-5" role="group" aria-label="Available for">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    aria-pressed={dur === h}
                    disabled={busy}
                    onClick={() => {
                      setDur(h);
                      goAvailable(h);
                    }}
                  >
                    <b>{h} hr{h > 1 ? "s" : ""}</b>
                    <small>{timeOf(new Date(Date.now() + h * 3600e3))}</small>
                  </button>
                ))}
                <button aria-pressed={dur === "pick"} onClick={() => setDur("pick")}>
                  <b>Until</b>
                  <small>pick time</small>
                </button>
              </div>
              {dur === "pick" && (
                <div className="until-row">
                  <input className="input" type="time" step={900} value={untilTime} onChange={(e) => setUntilTime(e.target.value)} aria-label="Available until" />
                  <button className="btn btn-primary" disabled={busy || !untilTime} onClick={() => goAvailable(untilFromTime(untilTime))}>
                    Set
                  </button>
                </div>
              )}
            </div>
            <div className="opt-group">
              <span className="opt-label">Ping me for games within</span>
              <div className="segbar" role="group" aria-label="Distance">
                {RADII.map((r) => (
                  <button key={r} aria-pressed={profile?.radius_mi === r} onClick={() => update({ radius_mi: r })}>
                    <b>{r}</b>
                    <small>miles</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {next && (() => {
        const started = new Date(next.starts_at).getTime() < Date.now();
        const full = next.player_ids.length >= next.slots;
        return (
          <Link className="home-next" href={`/g/${next.id}`}>
            <span className="mc">
              <CourtDiagram size="sm" slots={next.slots} players={next.player_ids.map((id) => ({ id, name: names(id), isMe: id === userId }))} />
            </span>
            <span className="tx">
              <b>{next.court_name}</b>
              <small>
                {started ? "In progress" : full ? "Game on" : "Up next"} · {when(next.starts_at)}
              </small>
            </span>
            <span className={`pill${full ? " pill-ball" : ""}`}>
              {next.player_ids.length}/{next.slots}
            </span>
          </Link>
        );
      })()}

      <section className="home-sec">
        <div className="home-sec-head">
          <h2>Games near you</h2>
          {visible && visible.length > 3 && (
            <button className="link-btn" onClick={() => setAllGames((x) => !x)}>
              {allGames ? "Show less" : `See all ${visible.length}`}
            </button>
          )}
        </div>
        {visible === null ? (
          <div className="skeleton" style={{ minHeight: 56 }} />
        ) : !profile?.location ? (
          <p className="home-empty">Go available once and games near you show up here.</p>
        ) : visible.length === 0 ? (
          <p className="home-empty">
            No open {sportLabel.toLowerCase()} games within {profile?.radius_mi} mi at your level. Pick a court and be the first.
          </p>
        ) : (
          <div className="home-games">
            {(allGames ? visible : visible.slice(0, 3)).map((g) => {
              const left = g.slots - g.player_ids.length;
              return (
                <div className="home-game" key={g.id}>
                  <Link href={`/g/${g.id}`} className="mc" aria-label={`Open game at ${g.court_name}`}>
                    <CourtDiagram size="sm" slots={g.slots} players={g.player_ids.map((id) => ({ id, name: names(id) }))} />
                  </Link>
                  <Link href={`/g/${g.id}`} className="tx">
                    <b>
                      {g.slots === 4 ? "Doubles" : "Singles"} · {g.court_name}
                    </b>
                    <small>
                      {g.distance_mi != null ? `${miles(g.distance_mi)} · ` : ""}
                      {when(g.starts_at).replace(/^today /, "")} · needs {left} · {fmtSkill(g.skill_min)}–{fmtSkill(g.skill_max)}
                      {g.members_only ? ` · ${g.club ?? "Members"} only` : ""}
                    </small>
                  </Link>
                  <button className="join-btn" onClick={() => join(g.id)}>
                    Join
                  </button>
                  <button className="pass-btn" onClick={() => pass(g.id)} aria-label={`Pass on game at ${g.court_name}`}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="home-sec">
        <div className="home-sec-head">
          <h2>Available players</h2>
          <Link href="/courts">All courts</Link>
        </div>
        <div className="livemap home-map">
          {coords && <PlayerMap center={coords} me={coords} cells={cells} courts={courts ?? []} onCourt={(id) => router.push(`/host?court=${id}`)} />}
          <div className="livemap-head">
            <span className="chip-live">
              <span className="pulse" aria-hidden="true" />
              {headline}
            </span>
          </div>
        </div>
        {locErr && locReason && <LocationFix reason={locReason} message={locErr} onRetry={locate} onManual={(pt) => setManual(pt)} />}
      </section>

      <section className="home-sec">
        <div className="home-sec-head">
          <h2>Recommended courts</h2>
          <Link href="/courts">See all</Link>
        </div>
        <RecommendedCourts courts={recommended} />
        <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
          Court data includes © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors.
        </p>
      </section>

      {ask && (
        <MembershipPrompt
          club={ask.club ?? null}
          courtName={ask.court_name}
          action="join"
          onClose={() => setAsk(null)}
          onAnswer={async (a) => {
            const g = ask;
            setAsk(null);
            await saveAnswer(g.club, a);
            if (a === "member") await refresh();
            join(g.id, !g.club);
          }}
        />
      )}
      {sheet && <LocationSheet courts={courts} near={coords} sport={sport} title={sheet === "later" ? "Schedule a game" : "Pick a location to play"} onPick={pick} onClose={() => setSheet(null)} />}
    </div>
  );
}
