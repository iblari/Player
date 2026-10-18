"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/components/Session";
import { useToast } from "@/components/Toast";
import GameRow from "@/components/GameRow";
import { getCoords } from "@/lib/geo";
import { fetchMyGames, fetchPlayers, JOIN_MESSAGES, nameOf, useLiveGames, type GameView } from "@/lib/games";
import { isAvailable, type PlayerLite } from "@/lib/types";
import { timeOf } from "@/lib/util";

const RADII = [2, 5, 10, 20];
const HOURS = [1, 2, 3, 4];

type Nearby = {
  id: string;
  court_id: string;
  court_name: string;
  distance_mi: number;
  slots: 2 | 4;
  skill_min: number;
  skill_max: number;
  starts_at: string;
  expires_at: string;
  host_id: string;
  note: string | null;
  player_ids: string[];
};

export default function PlayPage() {
  const { userId, profile, update, refresh, loading } = useSession();
  const toast = useToast();
  const [hours, setHours] = useState(2);
  const [busy, setBusy] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [nearby, setNearby] = useState<GameView[] | null>(null);
  const [mine, setMine] = useState<GameView[] | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerLite>>({});

  const avail = isAvailable(profile);
  const hasLocation = !!profile?.location;
  const isNew = !!profile && (!profile.display_name || profile.display_name.includes("@"));

  const load = useCallback(async () => {
    if (!userId) return;
    const sb = supabase();
    const [{ data: n }, m] = await Promise.all([sb.rpc("games_for_me"), fetchMyGames(userId)]);
    const near: GameView[] = ((n as Nearby[]) ?? []).map((g) => ({
      ...g,
      status: "open",
      attendance_done: false,
      created_at: "",
      filled_at: null,
      court_lat: null,
      court_lng: null,
    }));
    setNearby(near);
    setMine(m);
    setPlayers(await fetchPlayers([...near, ...m].flatMap((g) => g.player_ids)));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load, profile?.location, profile?.radius_mi, profile?.skill]);
  useLiveGames(load);

  async function goAvailable(h = hours) {
    setBusy(true);
    setLocErr(null);
    try {
      const c = await getCoords();
      await supabase().rpc("set_location", { lat: c.lat, lng: c.lng });
      const until = new Date(Date.now() + h * 3600e3).toISOString();
      const err = await update({ available_until: until });
      await refresh();
      if (err) toast(err);
      else toast(`You're available until ${timeOf(until)}.`);
      await load();
    } catch (e) {
      setLocErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    const err = await update({ available_until: null });
    setBusy(false);
    toast(err ?? "You're off the board.");
  }

  async function join(id: string) {
    const { data, error } = await supabase().rpc("join_game", { p_game: id });
    toast(error ? "Couldn't join. Try again." : JOIN_MESSAGES[data as string] ?? "Done.");
    load();
  }
  async function pass(id: string) {
    setNearby((xs) => xs?.filter((g) => g.id !== id) ?? null);
    await supabase().from("game_passes").insert({ game_id: id, player_id: userId });
  }

  const names = (id: string) => nameOf(players, id, userId);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Play</h1>
          <p className="sub">{profile?.display_name && !isNew ? `Rated ${Number(profile.skill).toFixed(2)}` : "Pickleball near you"}</p>
        </div>
      </div>

      {isNew && !loading && (
        <div className="notice">
          <b>Add your name and rating so hosts know who&apos;s coming.</b>
          <Link className="btn btn-sm" href="/me">
            Set up profile
          </Link>
        </div>
      )}

      <div className={`slab${avail ? " on" : ""}`}>
        <div className="slab-top">
          <div>
            <div className="slab-title">{avail ? "You're down to play" : "Not available"}</div>
            <div className="slab-sub">
              {avail
                ? `Until ${timeOf(profile!.available_until!)}, within ${profile!.radius_mi} mi. Hosts nearby can ping you.`
                : "Go available so games near you can find you."}
            </div>
          </div>
          <button
            className="switch"
            role="switch"
            aria-checked={avail}
            aria-label={avail ? "Stop being available" : "Go available"}
            disabled={busy || loading}
            onClick={() => (avail ? stop() : goAvailable())}
          />
        </div>
        <div className="slab-row">
          <span>{avail ? "Extend" : "For"}</span>
          <div className="seg">
            {HOURS.map((h) => (
              <button
                key={h}
                aria-pressed={!avail && hours === h}
                onClick={() => (avail ? goAvailable(h) : setHours(h))}
                disabled={busy}
              >
                {h} hr{h > 1 ? "s" : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="slab-row">
          <span>Within</span>
          <div className="seg">
            {RADII.map((r) => (
              <button key={r} aria-pressed={profile?.radius_mi === r} onClick={() => update({ radius_mi: r })} disabled={busy}>
                {r} mi
              </button>
            ))}
          </div>
        </div>
        {locErr && <p className="err">{locErr}</p>}
      </div>

      <section className="block">
        <div className="block-head">
          <h2>Games that need you</h2>
          <span className="count">{nearby?.length ?? ""}</span>
        </div>
        {nearby === null ? (
          <div className="skeleton" />
        ) : !hasLocation ? (
          <div className="empty">
            <strong>Share your location once to see games nearby.</strong>
            <span>Going available saves where you are. You can turn it off anytime.</span>
            <button className="btn btn-sm" onClick={() => goAvailable()} disabled={busy}>
              Go available now
            </button>
          </div>
        ) : nearby.length === 0 ? (
          <div className="empty">
            <strong>No open games within {profile?.radius_mi} mi at your level.</strong>
            <span>Post one and the players around you will see it.</span>
            <Link className="btn btn-sm btn-primary" href="/host">
              Host a game
            </Link>
          </div>
        ) : (
          <div className="rows">
            {nearby.map((g) => (
              <GameRow
                key={g.id}
                g={g}
                me={userId}
                names={names}
                actions={
                  <>
                    <button className="btn btn-ball btn-sm" onClick={() => join(g.id)}>
                      I&apos;m in
                    </button>
                    <button className="btn btn-sm" onClick={() => pass(g.id)}>
                      Pass
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Your games</h2>
          <span className="count">{mine?.length ?? ""}</span>
        </div>
        {mine === null ? (
          <div className="skeleton" />
        ) : mine.length === 0 ? (
          <div className="empty">
            <strong>Games you host or join land here.</strong>
            <span>Each one shows the court filling in live.</span>
          </div>
        ) : (
          <div className="rows">
            {mine.map((g) => (
              <GameRow key={g.id} g={g} me={userId} names={names} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
