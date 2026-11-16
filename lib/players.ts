import { supabase } from "@/lib/supabase/client";

export type FoundPlayer = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  sports: Record<string, number> | null;
  following: boolean;
  follows_me: boolean;
  played_with: number;
};

/**
 * Find players by name (2+ letters). With no text: people you've played with, and people who
 * follow you that you don't follow back. Falls back to a plain name search if the database
 * hasn't been updated yet.
 */
export async function searchPlayers(q: string, limit = 20): Promise<FoundPlayer[]> {
  const sb = supabase();
  const { data, error } = await sb.rpc("search_players", { p_q: q, p_limit: limit });
  if (!error) return (data as FoundPlayer[]) ?? [];
  const term = q.replace(/[%_,()*"\\]/g, "").trim();
  if (term.length < 2) return [];
  const { data: rows } = await sb.from("profiles").select("id, display_name, avatar_url, sports").ilike("display_name", `%${term}%`).limit(limit);
  const { data: auth } = await sb.auth.getUser();
  return ((rows as FoundPlayer[]) ?? [])
    .filter((p) => p.id !== auth.user?.id && p.display_name)
    .map((p) => ({ ...p, following: false, follows_me: false, played_with: 0 }));
}

export async function setFollow(me: string, them: string, on: boolean) {
  const sb = supabase();
  return on
    ? sb.from("follows").insert({ follower_id: me, followee_id: them })
    : sb.from("follows").delete().eq("follower_id", me).eq("followee_id", them);
}

export const sportsLabel = (s: Record<string, number> | null | undefined) =>
  Object.keys(s ?? {})
    .filter((k) => k === "pickleball" || k === "tennis")
    .map((k) => (k === "pickleball" ? "Pickleball" : "Tennis"))
    .join(" & ");
