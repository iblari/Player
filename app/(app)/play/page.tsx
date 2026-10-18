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
import { CalendarIcon, ChevronIcon, ClockIcon, SearchIcon } from "@/components/Icons";
import { getCoords } from "@/lib/geo";
import { useNearby } from "@/lib/nearby";
import { fetchMyGames, fetchPlayers, JOIN_MESSAGES, nameOf, useLiveGames, type GameView } from "@/lib/games";
import { isAvailable, SPORT_META, type Court, type PlayerLite } from "@/lib/types";
import { fmtSkill, miles, timeOf, when } from "@/lib/util";

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
  const { coords, locErr, courts, cells, players: nearbyPlayers, locate, refresh: refreshMap } = useNearby(15, sport);
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
    const upcoming = mine.filter((g) => new Date(g.starts_at).getTime() > Date.now() - 90 * 60000).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
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
    const fromHistory = recent.map((r) => ({ id: r.id, name: r.name, sub: `Last played ${when(r.last_played)}` }));
    if (fromHistory.length) return fromHistory;
    return (courts ?? []).slice(0, 2).map((c) => ({ id: c.id, name: c.name, sub: `${miles(c.distance_mi)} away${c.court_count ? ` · ${c.court_count} courts` : ""}` }));
  }, [recent, courts]);

  const availableCount = cells.reduce((s, c) => s + c.players, 0);
  // Always lead with the biggest number that is true: free now > players nearby > courts nearby.
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const headline =
    availableCount > 0
      ? `${plural(availableCount, "player")} free now${nearbyPlayers && nearbyPlayers > availableCount ? ` · ${nearbyPlayers} nearby` : ""}`
      : nearbyPlayers && nearbyPlayers > 0
        ? `${plural(nearbyPlayers, "player")} nearby · be the first free`
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
      const c = await getCoords();
      await supabase().rpc("set_location", { lat: c.lat, lng: c.lng });
      const until = untilDate.toISOString();
      const err = await update({ available_until: until });
      await refresh();
      toast(err ?? `You're available until ${timeOf(until)}.`);
      load();
    } catch (e) {
      toast((e as Error).message);
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
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <SportSwitch value={sport} onChange={setSport} />
          <Link href="/me" aria-label="Account" style={{ flex: "none" }}>
            {userId && <Avatar id={userId} name={profile?.display_name || "You"} size={40} src={profile?.avatar_url} />}
          </Link>
        </div>
        <h1>{firstName ? `Hi, ${firstName}` : "Find a game"}</h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="search-pill" role="button" tabIndex={0} onClick={() => setSheet("now")} onKeyDown={(e) => e.key === "Enter" && setSheet("now")}>
          <SearchIcon />
          <span className="label">Where are you playing {sportLabel.toLowerCase()}?</span>
          <button
            className="later"
            onClick={(e) => {
              e.stopPropagation();
              setSheet("later");
            }}
          >
            <CalendarIcon /> Later
          </button>
        </div>

        {recents.length > 0 && (
          <div className="list">
            {recents.map((r) => (
              <Link key={r.id} className="list-row" href={`/host?court=${r.id}&sport=${sport}`}>
                <span className="icon-circle">
                  <ClockIcon />
                </span>
                <span className="grow">
                  <span className="t">{r.name}</span>
                  <span className="m">{r.sub}</span>
                </span>
                <span className="chev">
                  <ChevronIcon />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className={`avail-strip${avail ? " on" : ""}`}>
          <button className="grow" style={{ background: "none", border: 0, padding: 0, textAlign: "left", color: "inherit", cursor: "pointer" }} onClick={() => setShowOpts((x) => !x)} aria-expanded={showOpts}>
            <b>{avail ? "You're down to play" : "Not available"}</b>
            <span>
              {avail ? `Until ${timeOf(profile!.available_until!)} · within ${profile!.radius_mi} mi · tap to change` : "Turn on so players nearby can ping you"}
            </span>
          </button>
          <button className="switch" role="switch" aria-checked={avail} aria-label={avail ? "Stop being available" : "Go available"} disabled={busy} onClick={() => (avail ? stop() : goAvailable())} />
        </div>
        {showOpts && (
          <div className="avail-opts">
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

      {next && (
        <Link className="list" href={`/g/${next.id}`} style={{ textDecoration: "none" }}>
          <span className="list-row">
            <span style={{ width: 72, flex: "none" }}>
              <CourtDiagram size="sm" slots={next.slots} players={next.player_ids.map((id) => ({ id, name: names(id), isMe: id === userId }))} />
            </span>
            <span className="grow">
              <span className="m">Up next · {SPORT_META[next.sport ?? "pickleball"].label}</span>
              <span className="t">{next.court_name}</span>
              <span className="m">
                {when(next.starts_at)} · {next.player_ids.length}/{next.slots} in
              </span>
            </span>
            <span className="chev">
              <ChevronIcon />
            </span>
          </span>
        </Link>
      )}

      <section className="block">
        <div className="block-head">
          <h2>Available players</h2>
          <Link href="/courts">All courts</Link>
        </div>
        <div className="livemap">
          {coords && <PlayerMap center={coords} me={coords} cells={cells} courts={courts ?? []} onCourt={(id) => router.push(`/host?court=${id}`)} />}
          <div className="livemap-head">
            <span className="chip-live">
              <span className="pulse" aria-hidden="true" />
              {headline}
            </span>
          </div>
        </div>
        {locErr ? (
          <div className="notice">
            <span>{locErr}</span>
            <button className="btn btn-sm" onClick={locate}>
              Use my location
            </button>
          </div>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Yellow circles are players who are free right now, grouped by area. Tap a court to start a game there.
          </p>
        )}
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Recommended courts</h2>
          <Link href="/courts">See all</Link>
        </div>
        <RecommendedCourts courts={recommended} />
        <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
          Court data includes © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors.
        </p>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>{sportLabel} games that need you</h2>
          <span className="count">{visible?.length || ""}</span>
        </div>
        {visible === null ? (
          <div className="skeleton" />
        ) : !profile?.location ? (
          <div className="empty">
            <strong>Go available once to see games near you.</strong>
            <span>It saves where you are so hosts nearby can find you.</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <strong>No open {sportLabel.toLowerCase()} games within {profile?.radius_mi} mi at your level.</strong>
            <span>Pick a court above and be the first.</span>
          </div>
        ) : (
          <div className="hscroll">
            {visible.map((g) => {
              const left = g.slots - g.player_ids.length;
              return (
                <div className="gcard" key={g.id}>
                  <Link href={`/g/${g.id}`} className="gcard-court" aria-label={`Open game at ${g.court_name}`}>
                    <CourtDiagram size="sm" slots={g.slots} players={g.player_ids.map((id) => ({ id, name: names(id) }))} />
                    <span className={`pill badge ${left === 1 ? "pill-ball" : ""}`}>Need {left}</span>
                    {g.members_only && <span className="pill" style={{ position: "absolute", right: 10, top: 10 }}>{g.club ?? "Members"} only</span>}
                  </Link>
                  <span className="gcard-title">{g.court_name}</span>
                  <span className="gcard-meta">
                    {g.slots === 4 ? "Doubles" : "Singles"} · {when(g.starts_at)} · {fmtSkill(g.skill_min)}–{fmtSkill(g.skill_max)}
                    {g.distance_mi != null ? ` · ${miles(g.distance_mi)}` : ""}
                  </span>
                  <div className="gcard-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => join(g.id)}>
                      I&apos;m in
                    </button>
                    <button className="btn btn-sm" onClick={() => pass(g.id)}>
                      Pass
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
      {sheet && <LocationSheet courts={courts} title={sheet === "later" ? "Schedule a game" : "Pick a location to play"} onPick={pick} onClose={() => setSheet(null)} />}
    </>
  );
}
