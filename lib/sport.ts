"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Sport } from "@/lib/types";

const KEY = "fu.sport";
const isSport = (v: unknown): v is Sport => v === "pickleball" || v === "tennis";

/**
 * The sport the player is browsing/hosting. Remembered per browser; defaults to a sport
 * they've said they play. An explicit value (e.g. from ?sport=) wins.
 */
export function useSport(profileSports?: Partial<Record<Sport, number>> | null, explicit?: string | null): [Sport, (s: Sport) => void] {
  const [sport, setSportState] = useState<Sport>(isSport(explicit) ? explicit : "pickleball");
  useEffect(() => {
    if (isSport(explicit)) return setSportState(explicit);
    try {
      const v = localStorage.getItem(KEY);
      if (isSport(v)) return setSportState(v);
    } catch {
      /* storage blocked */
    }
    if (profileSports && !profileSports.pickleball && profileSports.tennis) setSportState("tennis");
  }, [explicit, profileSports?.pickleball, profileSports?.tennis]); // eslint-disable-line react-hooks/exhaustive-deps
  const setSport = useCallback((s: Sport) => {
    setSportState(s);
    try {
      localStorage.setItem(KEY, s);
    } catch {
      /* storage blocked */
    }
  }, []);
  return [sport, setSport];
}

export type MyRating = { sport: Sport; level: number; sigma: number; games: number };

/** My level per sport: learned from scored games, else my self-rating. */
export function useMyRatings(refreshKey?: unknown): Partial<Record<Sport, MyRating>> | null {
  const [out, setOut] = useState<Partial<Record<Sport, MyRating>> | null>(null);
  useEffect(() => {
    let live = true;
    supabase()
      .rpc("my_ratings")
      .then(({ data }) => {
        if (!live) return;
        const m: Partial<Record<Sport, MyRating>> = {};
        ((data as MyRating[]) ?? []).forEach((r) => (m[r.sport] = { ...r, level: Number(r.level), sigma: Number(r.sigma) }));
        setOut(m);
      });
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return out;
}
