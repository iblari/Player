"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/Session";
import GameRow from "@/components/GameRow";
import { ChevronIcon } from "@/components/Icons";
import { fetchMyGames, fetchPlayers, nameOf, useLiveGames, type GameView } from "@/lib/games";
import type { PlayerLite } from "@/lib/types";

export default function ActivityPage() {
  const { userId } = useSession();
  const [games, setGames] = useState<GameView[] | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerLite>>({});

  const load = useCallback(async () => {
    if (!userId) return;
    const g = await fetchMyGames(userId);
    setGames(g);
    setPlayers(await fetchPlayers(g.flatMap((x) => x.player_ids)));
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);
  useLiveGames(load);

  const now = Date.now();
  const upcoming = (games ?? []).filter((g) => new Date(g.starts_at).getTime() > now - 90 * 60000);
  const names = (id: string) => nameOf(players, id, userId);

  return (
    <>
      <div className="page-head">
        <h1>Activity</h1>
      </div>

      <section className="block">
        <h2>Your games</h2>
        {games === null ? (
          <div className="skeleton" />
        ) : upcoming.length === 0 ? (
          <div className="empty">
            <strong>No games yet.</strong>
            <span>Games you host or join show up here with a live roster.</span>
            <Link className="btn btn-sm btn-primary" href="/host">
              Find players
            </Link>
          </div>
        ) : (
          <div className="rows">
            {upcoming.map((g) => (
              <GameRow key={g.id} g={g} me={userId} names={names} />
            ))}
          </div>
        )}
      </section>

      <Link className="list" href="/stats" style={{ textDecoration: "none" }}>
        <span className="list-row">
          <span className="grow">
            <span className="t">Is it working?</span>
            <span className="m">Fill rate, time to fill, and show-up rate across all courts</span>
          </span>
          <span className="chev">
            <ChevronIcon />
          </span>
        </span>
      </Link>
    </>
  );
}
