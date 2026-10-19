import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import type { Sport } from "@/lib/types";

export type Invite = {
  host: string;
  sport: Sport;
  slots: number;
  joined: number;
  court: string;
  town: string | null;
  status: "open" | "full" | "cancelled" | "ended";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a shared game link shows before anyone signs in: host's first name, sport, court and spots. */
export async function getInvite(id: string): Promise<Invite | null> {
  if (!UUID.test(id)) return null;
  const envName = Object.keys(process.env).find((k) => /SUPABASE_(SERVICE_ROLE_KEY|SECRET_KEY)$/.test(k) && process.env[k]);
  const key = envName ? process.env[envName] : undefined;
  if (!key) return null;
  const db = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
  const { data: g } = await db
    .from("games")
    .select("host_id, sport, slots, status, ended_at, courts(name, town)")
    .eq("id", id)
    .maybeSingle();
  if (!g) return null;
  const [{ count }, { data: prof }] = await Promise.all([
    db.from("game_players").select("player_id", { count: "exact", head: true }).eq("game_id", id),
    db.from("profiles").select("display_name").eq("id", g.host_id).maybeSingle(),
  ]);
  const court = (Array.isArray(g.courts) ? g.courts[0] : g.courts) as { name: string; town: string | null } | null;
  const joined = count ?? 1;
  const first = (prof?.display_name || "A player").trim().split(/\s+/)[0];
  return {
    host: first,
    sport: (g.sport as Sport) ?? "pickleball",
    slots: g.slots,
    joined,
    court: court?.name ?? "a court near you",
    town: court?.town ?? null,
    status: g.ended_at ? "ended" : g.status === "cancelled" ? "cancelled" : g.status === "full" || joined >= g.slots ? "full" : "open",
  };
}

export function inviteLine(i: Invite) {
  const left = Math.max(0, i.slots - i.joined);
  const kind = i.slots === 4 ? "doubles" : "singles";
  const sport = i.sport === "tennis" ? "tennis" : "pickleball";
  return {
    title: `${i.host} is inviting you to play ${sport} on Players Club`,
    detail: `${sport[0].toUpperCase()}${sport.slice(1)} ${kind} at ${i.court}${i.town ? `, ${i.town}` : ""}`,
    spots: i.status === "open" ? `${left} ${left === 1 ? "spot" : "spots"} left` : i.status === "full" ? "Game is full" : i.status === "ended" ? "Game has ended" : "Game was cancelled",
  };
}
