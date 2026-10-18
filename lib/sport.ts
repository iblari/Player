"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { isMissing } from "@/lib/rpc";
import { selfLevel, SPORTS, type Sport } from "@/lib/types";

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
    (async () => {
      const sb = supabase();
      const { data, error } = await sb.rpc("my_ratings");
      const m: Partial<Record<Sport, MyRating>> = {};
      if (isMissing(error)) {
        // Database not migrated yet: fall back to self-ratings on the profile.
        const { data: u } = await sb.auth.getUser();
        const { data: p } = u.user
          ? await sb.from("profiles").select("skill, sports").eq("id", u.user.id).maybeSingle()
          : { data: null };
        const sports = ((p?.sports as Partial<Record<Sport, number>>) ?? {}) as Partial<Record<Sport, number>>;
        SPORTS.forEach(({ id }) => {
          const lv = id === "pickleball" ? Number(p?.skill ?? 3) : sports[id] ? selfLevel(id, sports[id]!) : null;
          if (lv != null) m[id] = { sport: id, level: lv, sigma: 0.8, games: 0 };
        });
      } else {
        ((data as MyRating[]) ?? []).forEach((r) => (m[r.sport] = { ...r, level: Number(r.level), sigma: Number(r.sigma) }));
      }
      if (live) setOut(m);
    })();
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return out;
}
