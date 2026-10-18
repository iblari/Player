"use client";
import { useCallback, useEffect, useState } from "react";
import { rpcCompat, without } from "@/lib/rpc";
import { getCoords, lastCoords, type Coords } from "@/lib/geo";
import type { Court, Sport } from "@/lib/types";
import type { PlayerCell } from "@/components/PlayerMap";

export const FALLBACK: Coords = { lat: 40.7128, lng: -74.006 };

/** Location + nearby courts + available-player cells for a sport, refreshed on demand. */
export function useNearby(radius = 15, sport?: Sport) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [cells, setCells] = useState<PlayerCell[]>([]);
  const [players, setPlayers] = useState<number | null>(null);

  const load = useCallback(
    async (c: Coords) => {
      const base = { lat: c.lat, lng: c.lng, radius_mi: radius };
      const args = { ...base, p_sport: sport ?? null };
      const [a, b, n] = await Promise.all([
        rpcCompat("nearby_courts", args, base),
        rpcCompat("available_players_map", args, base),
        rpcCompat("players_nearby", args, base),
      ]);
      setPlayers(typeof n.data === "number" ? n.data : null);
      setCourts((a.data as Court[]) ?? []);
      setCells((b.data as PlayerCell[]) ?? []);
    },
    [radius, sport]
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

  // Reload when the sport changes.
  useEffect(() => {
    if (coords) load(coords);
  }, [sport]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => coords && load(coords), [coords, load]);
  return { coords, locErr, courts, cells, players, locate, refresh };
}
