"use client";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Game, PlayerLite } from "@/lib/types";

export type GameView = Game & {
  court_name: string;
  court_lat: number | null;
  court_lng: number | null;
  distance_mi?: number | null;
  player_ids: string[];
};

/** Games I'm in (hosting or joined), recent and upcoming. */
export async function fetchMyGames(userId: string): Promise<GameView[]> {
  const sb = supabase();
  const { data: mine } = await sb.from("game_players").select("game_id").eq("player_id", userId);
  const ids = (mine ?? []).map((r: { game_id: string }) => r.game_id);
  if (!ids.length) return [];
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { data: games } = await sb
    .from("games")
    .select("*, courts(name, address)")
    .in("id", ids)
    .neq("status", "cancelled")
    .gte("starts_at", since)
    .order("starts_at");
  const { data: gp } = await sb.from("game_players").select("game_id, player_id, joined_at").in("game_id", ids).order("joined_at");
  return (games ?? []).map((g: Game & { courts: { name: string } | null }) => ({
    ...g,
    court_name: g.courts?.name ?? "Court",
    court_lat: null,
    court_lng: null,
    player_ids: (gp ?? []).filter((r: { game_id: string }) => r.game_id === g.id).map((r: { player_id: string }) => r.player_id),
  }));
}

export async function fetchPlayers(ids: string[]): Promise<Record<string, PlayerLite>> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return {};
  const { data } = await supabase().from("profiles").select("id, display_name, skill, avatar_url").in("id", uniq);
  const out: Record<string, PlayerLite> = {};
  (data ?? []).forEach((p: PlayerLite) => (out[p.id] = p));
  return out;
}

export function nameOf(players: Record<string, PlayerLite>, id: string, me?: string | null): string {
  if (me && id === me) return "You";
  return players[id]?.display_name || "Player";
}

export const JOIN_MESSAGES: Record<string, string> = {
  joined: "You're in.",
  already_in: "You're already in this game.",
  full: "That game just filled.",
  expired: "That request expired.",
  cancelled: "The host cancelled this game.",
  signed_out: "Sign in to join.",
  needs_membership: "This court is members only.",
};

/** Calls onChange (debounced) whenever games or rosters change anywhere. */
export function useLiveGames(onChange: () => void, filter?: { gameId?: string }) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const sb = supabase();
    let t: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => cb.current(), 250);
    };
    const gid = filter?.gameId;
    const ch = sb
      .channel(`live-${gid ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", ...(gid ? { filter: `id=eq.${gid}` } : {}) }, fire)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players", ...(gid ? { filter: `game_id=eq.${gid}` } : {}) }, fire)
      .subscribe();
    const onFocus = () => fire();
    window.addEventListener("focus", onFocus);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("focus", onFocus);
      sb.removeChannel(ch);
    };
  }, [filter?.gameId]);
}
