import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import { infoFromTags } from "@/lib/courtInfo";
import type { OsmEl } from "@/lib/osmCourts";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECHECK_DAYS = 30;

function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}
const pos = (e: OsmEl) => (e.lat != null ? { lat: e.lat, lng: e.lon! } : e.center ? { lat: e.center.lat, lng: e.center.lon } : null);
const isCourt = (t: Record<string, string>) => /^(pitch|sports_centre)$/.test(t.leisure ?? "") && /tennis|pickleball/.test(t.sport ?? "");

/**
 * Looks up one court's hours, lights, phone, website and cost on OpenStreetMap and saves what it
 * finds (never over a player's own edit). Runs the first time a game chat at that court opens.
 */
export async function POST(request: Request) {
  const { courtId } = (await request.json().catch(() => ({}))) as { courtId?: string };
  if (!courtId || !UUID.test(courtId)) return NextResponse.json({ ok: false, reason: "bad_court" }, { status: 400 });
  const envName = Object.keys(process.env).find((k) => /SUPABASE_(SERVICE_ROLE_KEY|SECRET_KEY)$/.test(k) && process.env[k]);
  const key = envName ? process.env[envName] : undefined;
  if (!key) return NextResponse.json({ ok: false, reason: "no_service_key" });
  const db = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });

  const { data: court, error } = await db.from("courts").select("id, source, source_ref, info_checked_at").eq("id", courtId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, reason: "not_ready", detail: error.message });
  if (!court) return NextResponse.json({ ok: false, reason: "no_court" }, { status: 404 });
  if (court.info_checked_at && Date.now() - new Date(court.info_checked_at).getTime() < RECHECK_DAYS * 864e5)
    return NextResponse.json({ ok: true, reason: "fresh" });
  const { data: pt } = await db.rpc("court_point", { p_court: courtId });
  const at = (pt as { lat: number; lng: number }[] | null)?.[0];
  if (!at) return NextResponse.json({ ok: false, reason: "no_location" });

  const ll = `${at.lat.toFixed(6)},${at.lng.toFixed(6)}`;
  const q = `[out:json][timeout:25];
(
  nwr(around:300,${ll})["leisure"~"^(pitch|sports_centre)$"]["sport"~"tennis|pickleball"];
  nwr(around:450,${ll})["leisure"~"^(park|recreation_ground|sports_centre)$"]["name"];
  nwr(around:450,${ll})["club"]["name"];
  nwr(around:450,${ll})["amenity"~"^(school|college|university|community_centre)$"]["name"];
);
out center tags;`;

  let els: OsmEl[] | null = null;
  for (const url of MIRRORS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "playersclub.io court finder (hello@playersclub.io)" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(18000),
      });
      if (r.ok) {
        els = ((await r.json()) as { elements: OsmEl[] }).elements;
        break;
      }
    } catch {
      /* try the next mirror */
    }
  }
  if (!els) return NextResponse.json({ ok: false, reason: "map_unavailable" }, { status: 502 });

  // The courts: this venue's own map entry plus its neighbours, else whatever courts are closest.
  const withPos = els.map((e) => ({ e, p: pos(e), t: e.tags ?? {} })).filter((x) => x.p) as { e: OsmEl; p: { lat: number; lng: number }; t: Record<string, string> }[];
  const own = court.source === "osm" && court.source_ref ? withPos.find((x) => `${x.e.type[0]}${x.e.id}` === court.source_ref) : undefined;
  const anchor = own?.p ?? at;
  const courts = withPos.filter((x) => isCourt(x.t) && meters(anchor, x.p) < 180).map((x) => x.t);
  // The place it sits in: nearest named park/club/school, preferring one that lists hours or a phone.
  const places = withPos
    .filter((x) => !isCourt(x.t) || x.t.leisure === "sports_centre")
    .map((x) => ({ t: x.t, d: meters(anchor, x.p) - (x.t.opening_hours || x.t.phone || x.t["contact:phone"] ? 150 : 0) }))
    .sort((a, b) => a.d - b.d);
  const info = infoFromTags(courts, places[0]?.t ?? null);

  const { error: e2 } = await db.rpc("set_court_osm_info", {
    p_court: courtId,
    p_hours: info.hours,
    p_lights: info.lights,
    p_phone: info.phone,
    p_website: info.website,
    p_fee: info.fee,
  });
  if (e2) return NextResponse.json({ ok: false, reason: "save_failed", detail: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true, found: info });
}
