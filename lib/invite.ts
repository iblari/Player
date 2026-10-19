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

export type ProfileInvite = { name: string; first: string; avatarUrl: string | null; avatar: string | null; sports: Sport[] };

function admin() {
  const envName = Object.keys(process.env).find((k) => /SUPABASE_(SERVICE_ROLE_KEY|SECRET_KEY)$/.test(k) && process.env[k]);
  const key = envName ? process.env[envName] : undefined;
  return key ? createClient(SUPABASE_URL, key, { auth: { persistSession: false } }) : null;
}

/** The avatar as a data URI the share image can draw. Skipped if slow, huge or an unsupported format. */
async function avatarData(url: string | null): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !/^image\/(png|jpeg|jpg)/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 2_000_000) return null;
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** What a shared profile link shows: the player's public name, photo and sports. */
export async function getProfileInvite(id: string): Promise<ProfileInvite | null> {
  if (!UUID.test(id)) return null;
  const db = admin();
  if (!db) return null;
  const { data: p } = await db.from("profiles").select("display_name, avatar_url, sports").eq("id", id).maybeSingle();
  if (!p) return null;
  const name = (p.display_name || "A player").trim();
  const sports = (Object.keys((p.sports as Record<string, number>) ?? {}) as Sport[]).filter((s) => s === "pickleball" || s === "tennis");
  return { name, first: name.split(/\s+/)[0], avatarUrl: p.avatar_url ?? null, avatar: null, sports };
}

export async function withAvatar(p: ProfileInvite): Promise<ProfileInvite> {
  return { ...p, avatar: await avatarData(p.avatarUrl) };
}
