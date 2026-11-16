import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

export type InviteInfo = {
  game_id: string;
  sport: "pickleball" | "tennis";
  slots: number;
  starts_at: string;
  ended_at: string | null;
  court: string;
  town: string | null;
  logger: string;
  logger_avatar: string | null;
  guest_name: string;
  team: "a" | "b";
  games: [number, number][] | null;
  claimed: boolean;
  expired: boolean;
  side_a: string[];
  side_b: string[];
  invited: { name: string; team: "a" | "b"; you: boolean }[];
};

const TOKEN = /^[0-9a-f]{32}$/;

/** Read an invite link's match (works signed out: the link itself is the key). */
export async function getInviteInfo(token: string): Promise<InviteInfo | null> {
  if (!TOKEN.test(token)) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("invite_info", { p_token: token });
  if (error || !data) return null;
  return data as InviteInfo;
}

/** Names on each side, with the invited person shown as "You". */
export function sides(i: InviteInfo) {
  const side = (t: "a" | "b") => [...(t === "a" ? i.side_a : i.side_b), ...i.invited.filter((x) => x.team === t).map((x) => (x.you ? "You" : x.name))];
  return { a: side("a"), b: side("b") };
}
