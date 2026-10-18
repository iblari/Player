"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCoords, lastCoords, type Coords } from "@/lib/geo";
import type { Court } from "@/lib/types";
import type { PlayerCell } from "@/components/PlayerMap";

export const FALLBACK: Coords = { lat: 40.7128, lng: -74.006 };

/** Location + nearby courts + available-player cells, refreshed on demand. */
export function useNearby(radius = 15) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [cells, setCells] = useState<PlayerCell[]>([]);
  const [players, setPlayers] = useState<number | null>(null);

  const load = useCallback(
    async (c: Coords) => {
      const sb = supabase();
      const [a, b, n] = await Promise.all([
        sb.rpc("nearby_courts", { lat: c.lat, lng: c.lng, radius_mi: radius }),
        sb.rpc("available_players_map", { lat: c.lat, lng: c.lng, radius_mi: radius }),
        sb.rpc("players_nearby", { lat: c.lat, lng: c.lng, radius_mi: radius }),
      ]);
      setPlayers(typeof n.data === "number" ? n.data : null);
      setCourts((a.data as Court[]) ?? []);
      setCells((b.data as PlayerCell[]) ?? []);
    },
    [radius]
  );

  const locate = useCallback(async () => {
    setLocErr(null);
    try {
      const c = await getCoords();
      setCoords(c);
      await load(c);
      return c;
    } catch (e) {
      setLocErr((e as Error).message);
      const c = lastCoords() ?? FALLBACK;
      setCoords((x) => x ?? c);
      await load(c);
      return null;
    }
  }, [load]);

  useEffect(() => {
    const c = lastCoords();
    if (c) {
      setCoords(c);
      load(c);
    }
    locate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => coords && load(coords), [coords, load]);
  return { coords, locErr, courts, cells, players, locate, refresh };
}
