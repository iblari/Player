"use client";
import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/track";
import { rpcCompat, without } from "@/lib/rpc";
import { supabase } from "@/lib/supabase/client";
import { GeoError, getCoords, lastCoords, locationPermission, saveCoords, type Coords, type GeoReason } from "@/lib/geo";
import { seedArea } from "@/lib/seed";
import type { Court, Sport } from "@/lib/types";
import type { PlayerCell } from "@/components/PlayerMap";

export const FALLBACK: Coords = { lat: 40.7128, lng: -74.006 };

const AREA_KEY = "saved-area";
function saveArea(c: Coords) {
  const r = { lat: Math.round(c.lat * 100) / 100, lng: Math.round(c.lng * 100) / 100 };
  const key = `${r.lat},${r.lng}`;
  try {
    if (localStorage.getItem(AREA_KEY) === key) return;
  } catch {}
  supabase()
    .rpc("set_location", r)
    .then(({ error }) => {
      if (!error)
        try {
          localStorage.setItem(AREA_KEY, key);
        } catch {}
    });
}

/** Location + nearby courts + available-player cells for a sport, refreshed on demand. */
export function useNearby(radius = 15, sport?: Sport) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [locReason, setLocReason] = useState<GeoReason | null>(null);
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [cells, setCells] = useState<PlayerCell[]>([]);
  const [players, setPlayers] = useState<number | null>(null);
  // First visit, location not asked yet: show "Where do you play?" instead of a cold browser prompt.
  const [ask, setAsk] = useState(false);
  const [seeding, setSeeding] = useState(false);

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

  // Load courts around this spot in the background; refresh the list if any were added.
  // Also save the player's rough area (about 1 km) so they count toward nearby supply and
  // get matched, even before they ever turn on "down to play".
  const seed = useCallback(
    async (c: Coords) => {
      saveArea(c);
      setSeeding(true);
      const added = await seedArea(c);
      setSeeding(false);
      if (added > 0) await load(c);
    },
    [load]
  );

  const locate = useCallback(async () => {
    setLocErr(null);
    try {
      const first = !lastCoords();
      const c = await getCoords();
      setLocReason(null);
      if (first) track("location_set", { how: "gps" });
      setAsk(false);
      setCoords(c);
      await load(c);
      seed(c);
      return c;
    } catch (e) {
      setLocErr((e as Error).message);
      setLocReason(e instanceof GeoError ? e.reason : "unavailable");
      const c = lastCoords() ?? FALLBACK;
      setCoords((x) => x ?? c);
      await load(c);
      return null;
    }
  }, [load, seed]);

  useEffect(() => {
    const c = lastCoords();
    if (c) {
      setCoords(c);
      load(c);
      seed(c);
      locate();
      return;
    }
    locationPermission().then((s) => {
      if (s === "prompt") setAsk(true);
      else locate();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when the sport changes.
  useEffect(() => {
    if (coords) load(coords);
  }, [sport]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => coords && load(coords), [coords, load]);
  /** A town or ZIP typed in while location is blocked. */
  const setManual = useCallback(
    (c: Coords) => {
      track("location_set", { how: "town" });
      saveCoords(c);
      setAsk(false);
      setCoords(c);
      load(c);
      seed(c);
    },
    [load, seed]
  );
  return { coords, locErr, locReason, courts, cells, players, locate, refresh, setManual, ask, seeding };
}
