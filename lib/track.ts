"use client";
import { track as vercelTrack } from "@vercel/analytics";

/** Funnel events (Vercel Web Analytics). Never throws; no personal data in props. */
export type Ev =
  | "sign_up"
  | "sign_in"
  | "location_set"
  | "available_on"
  | "game_posted"
  | "game_joined"
  | "score_saved"
  | "chat_sent"
  | "followed"
  | "story_opened"
  | "story_shared"
  | "profile_qr";

export function track(name: Ev, props?: Record<string, string | number | boolean | null>) {
  try {
    vercelTrack(name, props);
  } catch {
    /* analytics blocked */
  }
}
