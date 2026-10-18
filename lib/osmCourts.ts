// Turns OpenStreetMap data into court rows: groups neighbouring pitches into one venue,
// names it after the park/school/club it sits in (or the street, or the town), and notes
// which sports it hosts. Pure functions so they can be tested without the network.

export type Bbox = { s: number; w: number; n: number; e: number };
export type OsmEl = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};
export type CourtRow = {
  ref: string;
  name: string;
  town: string | null;
  kind: string | null;
  lat: number;
  lng: number;
  courts: number;
  sports: ("tennis" | "pickleball")[];
  indoor: boolean;
  lit: boolean;
  members_only: boolean;
};

export const CELL_LAT = 0.2;
export const CELL_LNG = 0.25;
export const cellOf = (lat: number, lng: number) => `${Math.floor(lat / CELL_LAT)}:${Math.floor(lng / CELL_LNG)}`;

/** The 3x3 block of cells around a point, and the box that covers them. */
export function blockAround(lat: number, lng: number): { cells: string[]; bbox: Bbox } {
  const ci = Math.floor(lat / CELL_LAT), cj = Math.floor(lng / CELL_LNG);
  const cells: string[] = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) cells.push(`${ci + i}:${cj + j}`);
  return { cells, bbox: { s: (ci - 1) * CELL_LAT, n: (ci + 2) * CELL_LAT, w: (cj - 1) * CELL_LNG, e: (cj + 2) * CELL_LNG } };
}

export function overpassQuery(b: Bbox) {
  const bb = `${b.s.toFixed(4)},${b.w.toFixed(4)},${b.n.toFixed(4)},${b.e.toFixed(4)}`;
  // Plain bbox filters only (fast); matching courts to the park/school they sit in happens in code.
  return `[out:json][timeout:120][maxsize:268435456];
(
  nwr["leisure"="pitch"]["sport"~"tennis|pickleball"](${bb});
  nwr["leisure"="sports_centre"]["sport"~"tennis|pickleball"](${bb});
  way["leisure"~"^(park|recreation_ground|sports_centre)$"]["name"](${bb});
  way["amenity"~"^(school|college|university|community_centre)$"]["name"](${bb});
  nwr["club"~"^(tennis|sport)$"]["name"](${bb});
  node["place"~"^(city|town|village|suburb|hamlet|neighbourhood|quarter)$"]["name"](${bb});
);
out center tags qt;`;
}

const R = 6371000;
function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * R;
}
const pos = (e: OsmEl) => (e.lat != null ? { lat: e.lat, lng: e.lon! } : e.center ? { lat: e.center.lat, lng: e.center.lon } : null);

function sportsOf(t: Record<string, string>): ("tennis" | "pickleball")[] {
  const s = (t.sport ?? "").toLowerCase().split(/[;,]/).map((x) => x.trim());
  const out: ("tennis" | "pickleball")[] = [];
  if (s.includes("tennis")) out.push("tennis");
  if (s.includes("pickleball")) out.push("pickleball");
  return out;
}
const isCourt = (t: Record<string, string>) => (t.leisure === "pitch" || t.leisure === "sports_centre") && sportsOf(t).length > 0;

const KIND: Record<string, string> = {
  park: "park", recreation_ground: "rec area", sports_centre: "sports center", stadium: "stadium", playground: "park",
  garden: "park", nature_reserve: "park", school: "school", college: "school", university: "school", community_centre: "community center",
};
function kindOf(t: Record<string, string>) {
  if (t.club) return t.club === "sport" || t.club === "tennis" ? "club" : "club";
  return KIND[t.leisure ?? ""] ?? KIND[t.amenity ?? ""] ?? null;
}

// Generic pitch names worth ignoring ("Court 3", "Tennis Courts").
const GENERIC = /^(court|courts|tennis|tennis courts?|pickleball|pickleball courts?|pitch)\s*\d*[a-z]?$/i;

/** The database wants 2–80 characters, counted as Postgres does (code points, not UTF-16 units). */
function fitName(name: string, fallback: string) {
  const n = [...name.replace(/[\u0000-\u001f\u200b-\u200f]/g, "").trim()];
  const use = n.length >= 2 && /[\p{L}\p{N}]/u.test(n.join("")) ? n : [...fallback];
  return use.slice(0, 80).join("").trim();
}

export function toCourtRows(els: OsmEl[]): CourtRow[] {
  const courts: { el: OsmEl; p: { lat: number; lng: number }; t: Record<string, string> }[] = [];
  const containers: { name: string; kind: string | null; p: { lat: number; lng: number }; area: boolean }[] = [];
  const places: { name: string; p: { lat: number; lng: number }; rank: number }[] = [];
  const RANK: Record<string, number> = { neighbourhood: 1, quarter: 1, suburb: 2, hamlet: 2, village: 3, town: 3, city: 4 };

  for (const el of els) {
    const t = el.tags ?? {};
    const p = pos(el);
    if (!p) continue;
    if (isCourt(t)) courts.push({ el, p, t });
    if (t.place && t.name) places.push({ name: t.name, p, rank: RANK[t.place] ?? 2 });
    else if (t.name && (t.leisure || t.amenity || t.club) && !(t.leisure === "pitch")) containers.push({ name: t.name, kind: kindOf(t), p, area: el.type !== "node" });
  }

  // Greedy clustering: pitches within 180 m of a group's first pitch are one venue.
  const groups: (typeof courts)[] = [];
  for (const c of courts.sort((a, b) => a.p.lat - b.p.lat)) {
    const g = groups.find((g) => meters(g[0].p, c.p) < 180);
    if (g) g.push(c);
    else groups.push([c]);
  }

  return groups.map((g) => {
    const lat = g.reduce((s, c) => s + c.p.lat, 0) / g.length;
    const lng = g.reduce((s, c) => s + c.p.lng, 0) / g.length;
    const at = { lat, lng };
    const sports = [...new Set(g.flatMap((c) => sportsOf(c.t)))].sort() as ("tennis" | "pickleball")[];
    const own = g.map((c) => c.t.name).find((n) => n && !GENERIC.test(n.trim()));
    const host = containers
      .map((k) => ({ k, d: meters(at, k.p) }))
      .filter((x) => x.d < 450)
      .sort((a, b) => a.d - b.d)[0]?.k;
    const town = places
      .map((pl) => ({ pl, d: meters(at, pl.p) }))
      .filter((x) => x.d < 6000)
      .sort((a, b) => a.d - b.d)[0]?.pl.name ?? null;
    const street = g.map((c) => c.t["addr:street"]).find(Boolean);
    const label = sports.length === 2 ? "Tennis & pickleball courts" : sports[0] === "tennis" ? "Tennis courts" : "Pickleball courts";
    const name = own ?? host?.name ?? (street ? `${label} · ${street}` : town ? `${label} · ${town}` : label);
    const count = g.reduce((s, c) => s + (Number(c.t.courts) > 0 && Number(c.t.courts) < 40 ? Number(c.t.courts) : 1), 0);
    const access = g.map((c) => c.t.access).find(Boolean) ?? "";
    const first = g[0].el;
    return {
      ref: `${first.type[0]}${first.id}`,
      name: fitName(name, label),
      town,
      kind: host?.kind ?? (g.some((c) => c.t.leisure === "sports_centre") ? "sports center" : null),
      lat: +lat.toFixed(6),
      lng: +lng.toFixed(6),
      courts: Math.max(1, Math.min(60, count)), // the database allows 1–60
      sports,
      indoor: g.some((c) => c.t.indoor === "yes" || c.t.covered === "yes" || c.t.leisure === "sports_centre"),
      lit: g.some((c) => c.t.lit === "yes"),
      members_only: g.every((c) => ["private", "members", "customers"].includes(c.t.access ?? "")) && access !== "",
    };
  });
}
