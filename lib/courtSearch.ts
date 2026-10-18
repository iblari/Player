"use client";
import { supabase } from "@/lib/supabase/client";
import type { Coords } from "@/lib/geo";
import type { Court, Game, Sport } from "@/lib/types";

/** PostGIS geography comes back from the REST API as hex EWKB; pull the point out of it. */
export function decodePoint(v: unknown): Coords | null {
  if (v && typeof v === "object" && "coordinates" in (v as object)) {
    const [lng, lat] = (v as { coordinates: [number, number] }).coordinates;
    return { lat, lng };
  }
  if (typeof v !== "string" || v.length < 42) return null;
  try {
    const bytes = new Uint8Array(v.match(/../g)!.map((h) => parseInt(h, 16)));
    const dv = new DataView(bytes.buffer);
    const le = bytes[0] === 1;
    const type = dv.getUint32(1, le);
    let off = 5;
    if (type & 0x20000000) off += 4; // SRID present
    const lng = dv.getFloat64(off, le);
    const lat = dv.getFloat64(off + 8, le);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

export function milesBetween(a: Coords, b: Coords) {
  const R = 3958.8, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const openNow = (g: { status: string; expires_at: string }) => g.status === "open" && new Date(g.expires_at).getTime() > Date.now();

/** Every listed court matching the text, anywhere, nearest first, with its open games for this sport. */
export async function searchCourts(q: string, near: Coords | null, sport: Sport): Promise<Court[]> {
  const term = q.replace(/[,()*"\\%]/g, " ").trim();
  if (term.length < 2) return [];
  const sb = supabase();
  const like = `*${term.replace(/\s+/g, "*")}*`;
  let res = await sb.from("courts").select("*").or(`name.ilike.${like},address.ilike.${like},town.ilike.${like}`).limit(40);
  if (res.error) res = await sb.from("courts").select("*").or(`name.ilike.${like},address.ilike.${like}`).limit(40);
  const rows = ((res.data as (Court & { location?: unknown; sports?: Sport[] })[]) ?? []).filter((c) => !c.sports || c.sports.includes(sport));
  if (!rows.length) return [];

  const { data: gs } = await sb.from("games").select("*").in("court_id", rows.map((c) => c.id)).eq("status", "open").gt("expires_at", new Date().toISOString());
  const open: Record<string, number> = {};
  ((gs as (Game & { status: string; expires_at: string })[]) ?? [])
    .filter((g) => (g.sport ?? "pickleball") === sport && openNow(g))
    .forEach((g) => (open[g.court_id] = (open[g.court_id] ?? 0) + 1));

  return rows
    .map((c) => {
      const pt = decodePoint(c.location);
      const { location: _l, ...rest } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
      return {
        ...rest,
        lat: pt?.lat ?? NaN,
        lng: pt?.lng ?? NaN,
        distance_mi: pt && near ? milesBetween(near, pt) : NaN,
        available_players: 0,
        open_games: open[c.id] ?? 0,
      } as Court;
    })
    .sort((a, b) => b.open_games - a.open_games || (a.distance_mi || 1e9) - (b.distance_mi || 1e9))
    .slice(0, 15);
}

export type Waiting = Game & { status: string; expires_at: string; players: string[]; host_name: string };

/** Open games at a court for this sport that I'm not already in. */
export async function waitingGames(courtId: string, sport: Sport, me: string | null): Promise<Waiting[]> {
  const sb = supabase();
  const { data } = await sb.from("games").select("*").eq("court_id", courtId).eq("status", "open").gt("expires_at", new Date().toISOString()).order("starts_at");
  const games = ((data as Waiting[]) ?? []).filter((g) => (g.sport ?? "pickleball") === sport && openNow(g));
  if (!games.length) return [];
  const { data: gp } = await sb.from("game_players").select("game_id, player_id").in("game_id", games.map((g) => g.id)).order("joined_at");
  const roster: Record<string, string[]> = {};
  ((gp as { game_id: string; player_id: string }[]) ?? []).forEach((r) => (roster[r.game_id] ??= []).push(r.player_id));
  const hosts = [...new Set(games.map((g) => g.host_id))];
  const { data: ps } = await sb.from("profiles").select("id, display_name").in("id", hosts);
  const name: Record<string, string> = {};
  ((ps as { id: string; display_name: string }[]) ?? []).forEach((p) => (name[p.id] = p.display_name || "A player"));
  return games
    .map((g) => ({ ...g, players: roster[g.id] ?? [], host_name: name[g.host_id] ?? "A player" }))
    .filter((g) => !me || !g.players.includes(me))
    .filter((g) => g.players.length < g.slots);
}

/** Places on the map (OpenStreetMap) that look like somewhere to play, for courts nobody has listed yet. */
export type OsmPlace = { name: string; address: string; lat: number; lng: number; distance_mi: number };
const PLAY = new Set(["pitch", "sports_centre", "recreation_ground", "park", "fitness_centre", "community_centre", "club", "stadium", "school", "playground"]);
export async function searchPlaces(q: string, near: Coords | null): Promise<OsmPlace[]> {
  const term = q.trim();
  if (term.length < 3) return [];
  try {
    const bias = near ? `&lat=${near.lat.toFixed(4)}&lon=${near.lng.toFixed(4)}&location_bias_scale=0.3` : "";
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&limit=12&lang=en${bias}`);
    const j = (await r.json()) as {
      features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[];
    };
    const playish = /court|park|pickle|tennis|rec|club|athletic|sport|y\.?m\.?c\.?a|school|life ?time|equinox/i;
    return (j.features ?? [])
      .filter((f) => f.properties.name && (PLAY.has(f.properties.osm_value ?? "") || playish.test(f.properties.name ?? "")))
      .map((f) => {
        const p = f.properties;
        const [lng, lat] = f.geometry.coordinates;
        const city = p.city || p.town || p.village || p.district || "";
        const street = [p.housenumber, p.street].filter(Boolean).join(" ");
        return { name: p.name!, address: [street, city, p.state].filter(Boolean).join(", "), lat, lng, distance_mi: near ? milesBetween(near, { lat, lng }) : NaN };
      })
      .slice(0, 5);
  } catch {
    return [];
  }
}
