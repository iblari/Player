"use client";
import { supabase } from "@/lib/supabase/client";
import { notifyJoined } from "@/lib/push";
import type { MembershipAnswer } from "@/components/MembershipPrompt";

/** Join a game, retrying with confirmation after the player answers the membership prompt. */
export async function joinGame(id: string, confirmed = false): Promise<string> {
  const { data, error } = await supabase().rpc("join_game", { p_game: id, p_confirmed: confirmed });
  if (error) return "error";
  if (data === "joined") notifyJoined(id);
  return data as string;
}

export async function saveAnswer(club: string | null | undefined, a: MembershipAnswer) {
  if (a === "member" && club) await supabase().rpc("add_club", { p_club: club });
}
