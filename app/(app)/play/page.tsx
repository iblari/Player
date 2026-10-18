"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/components/Session";
import { useToast } from "@/components/Toast";
import CourtDiagram from "@/components/CourtDiagram";
import LocationSheet from "@/components/LocationSheet";
import Avatar from "@/components/Avatar";
import { CalendarIcon, ChevronIcon, ClockIcon, SearchIcon } from "@/components/Icons";
import { getCoords } from "@/lib/geo";
import { useNearby } from "@/lib/nearby";
import { fetchMyGames, fetchPlayers, JOIN_MESSAGES, nameOf, useLiveGames, type GameView } from "@/lib/games";
import { isAvailable, type Court, type PlayerLite } from "@/lib/types";
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
  const { coords, locErr, courts, cells, locate, refresh: refreshMap } = useNearby(15);
  const [sheet, setSheet] = useState<null | "now" | "later">(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [games, setGames] = useState<GameView[] | null>(null);
  const [next, setNext] = useState<GameView | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerLite>>({});
  const [busy, setBusy] = useState(false);
  const [showOpts, setShowOpts] = useState(false);

  const avail = isAvailable(profile);
  const firstName = profile?.display_name && !profile.display_name.includes("@") ? profile.display_name.split(" ")[0] : "";

  const load = useCallback(async () => {
    if (!userId) return;
    const sb = supabase();
    const [{ data: r }, { data: n }, mine] = await Promise.all([sb.rpc("recent_courts", { p_limit: 2 }), sb.rpc("games_for_me"), fetchMyGames(userId)]);
    setRecent((r as Recent[]) ?? []);
    const near = ((n as Nearby[]) ?? []).map((g) => ({ ...g, status: "open" as const, attendance_done: false, created_at: "", filled_at: null, court_lat: null, court_lng: null }));
    setGames(near);
    const upcoming = mine.filter((g) => new Date(g.starts_at).getTime() > Date.now() - 90 * 60000).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    setNext(upcoming[0] ?? null);
    setPlayers(await fetchPlayers([...near, ...mine].flatMap((g) => g.player_ids)));
  }, [userId]);

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

  async function goAvailable(h = 2) {
    setBusy(true);
    try {
      const c = await getCoords();
      await supabase().rpc("set_location", { lat: c.lat, lng: c.lng });
      const until = new Date(Date.now() + h * 3600e3).toISOString();
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
  async function join(id: string) {
    const { data, error } = await supabase().rpc("join_game", { p_game: id });
    toast(error ? "Couldn't join. Try again." : JOIN_MESSAGES[data as string] ?? "Done.");
    if (data === "joined") router.push(`/g/${id}`);
    else load();
  }
  async function pass(id: string) {
    setGames((xs) => xs?.filter((g) => g.id !== id) ?? null);
    await supabase().from("game_passes").insert({ game_id: id, player_id: userId });
  }
  function pick(c: Court) {
    router.push(`/host?court=${c.id}${sheet === "later" ? "&when=later" : ""}`);
  }

  const names = (id: string) => nameOf(players, id, userId);

  return (
    <>
      <div className="page-head" style={{ alignItems: "center" }}>
        <div>
          <div className="wordmark" style={{ fontSize: "1rem" }}>
            <i aria-hidden="true" style={{ width: 16, height: 16 }} /> Fourth Up
          </div>
          <h1 style={{ marginTop: 6 }}>{firstName ? `Hi, ${firstName}` : "Find a game"}</h1>
        </div>
        <Link href="/me" aria-label="Account">
          {userId && <Avatar id={userId} name={profile?.display_name || "You"} size={36} />}
        </Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="search-pill" role="button" tabIndex={0} onClick={() => setSheet("now")} onKeyDown={(e) => e.key === "Enter" && setSheet("now")}>
          <SearchIcon />
          <span className="label">Pick a location to play</span>
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
              <Link key={r.id} className="list-row" href={`/host?court=${r.id}`}>
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
              {avail ? `Until ${timeOf(profile!.available_until!)} · within ${profile!.radius_mi} mi · tap to change` : "Turn on so hosts nearby can ping you"}
            </span>
          </button>
          <button className="switch" role="switch" aria-checked={avail} aria-label={avail ? "Stop being available" : "Go available"} disabled={busy} onClick={() => (avail ? stop() : goAvailable())} />
        </div>
        {showOpts && (
          <div className="avail-opts">
            <div className="seg" aria-label="Available for">
              {HOURS.map((h) => (
                <button key={h} onClick={() => goAvailable(h)} disabled={busy}>
                  {h} hr{h > 1 ? "s" : ""}
                </button>
              ))}
            </div>
            <div className="seg" aria-label="Distance">
              {RADII.map((r) => (
                <button key={r} aria-pressed={profile?.radius_mi === r} onClick={() => update({ radius_mi: r })}>
                  {r} mi
                </button>
              ))}
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
              <span className="m">Up next</span>
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
              {availableCount} player{availableCount === 1 ? "" : "s"} available near you
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
          <h2>Games that need you</h2>
          <span className="count">{games?.length || ""}</span>
        </div>
        {games === null ? (
          <div className="skeleton" />
        ) : !profile?.location ? (
          <div className="empty">
            <strong>Go available once to see games near you.</strong>
            <span>It saves where you are so hosts nearby can find you.</span>
          </div>
        ) : games.length === 0 ? (
          <div className="empty">
            <strong>No open games within {profile?.radius_mi} mi at your level.</strong>
            <span>Pick a court above and be the first.</span>
          </div>
        ) : (
          <div className="hscroll">
            {games.map((g) => {
              const left = g.slots - g.player_ids.length;
              return (
                <div className="gcard" key={g.id}>
                  <Link href={`/g/${g.id}`} className="gcard-court" aria-label={`Open game at ${g.court_name}`}>
                    <CourtDiagram size="sm" slots={g.slots} players={g.player_ids.map((id) => ({ id, name: names(id) }))} />
                    <span className={`pill badge ${left === 1 ? "pill-ball" : ""}`}>Need {left}</span>
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

      {sheet && <LocationSheet courts={courts} title={sheet === "later" ? "Schedule a game" : "Pick a location to play"} onPick={pick} onClose={() => setSheet(null)} />}
    </>
  );
}
