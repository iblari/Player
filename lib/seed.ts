"use client";
import type { Coords } from "@/lib/geo";
import { cellOf } from "@/lib/osmCourts";

const KEY = "seeded-cells";

/** Ask the server to load courts around here (once per area per device per week).
 * Resolves to how many new courts were added. Never throws. */
export async function seedArea(c: Coords): Promise<number> {
  const cell = cellOf(c.lat, c.lng);
  let seen: Record<string, number> = {};
  try {
    seen = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {}
  if (seen[cell] && seen[cell] > Date.now() - 7 * 864e5) return 0;
  try {
    const r = await fetch("/api/seed-area", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) });
    const j = (await r.json()) as { added?: number; reason?: string };
    if (r.ok && j.reason !== "busy" && j.reason !== "no_service_key" && j.reason !== "not_migrated") {
      seen[cell] = Date.now();
      try {
        localStorage.setItem(KEY, JSON.stringify(seen));
      } catch {}
    }
    return j.added ?? 0;
  } catch {
    return 0;
  }
}

/** Town or ZIP → a point, via OpenStreetMap (Photon). */
export async function lookupTown(q: string): Promise<{ c: Coords; label: string } | null> {
  const s = q.trim();
  if (s.length < 2) return null;
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(s)}&limit=1&lang=en&layer=city&layer=postcode&layer=district&layer=locality`);
    const j = (await r.json()) as { features: { geometry: { coordinates: [number, number] }; properties: { name?: string; city?: string; state?: string; postcode?: string } }[] };
    const f = j.features?.[0];
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates;
    const p = f.properties;
    return { c: { lat, lng }, label: [p.name || p.postcode || p.city, p.state].filter(Boolean).join(", ") };
  } catch {
    return null;
  }
}
