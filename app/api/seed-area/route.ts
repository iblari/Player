import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import { blockAround, overpassQuery, toCourtRows, type OsmEl } from "@/lib/osmCourts";

export const runtime = "nodejs";
export const maxDuration = 300;

const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const FRESH_DAYS = 30;
const MAX_BLOCKS_PER_10_MIN = 40;

/**
 * Load tennis and pickleball courts around a point from OpenStreetMap, once per area.
 * Called in the background when a player first shares where they play.
 */
export async function POST(request: Request) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) return NextResponse.json({ added: 0, reason: "no_service_key" });

  const { lat, lng } = (await request.json().catch(() => ({}))) as { lat?: number; lng?: number };
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 85 || Math.abs(lng) > 180)
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });

  const db = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
  const { cells, bbox } = blockAround(lat, lng);

  const since = new Date(Date.now() - FRESH_DAYS * 864e5).toISOString();
  const { data: rows0, error: cellErr } = await db.from("court_seed_cells").select("cell, found, seeded_at").in("cell", cells).gt("seeded_at", since);
  if (cellErr) return NextResponse.json({ added: 0, reason: "not_migrated" });
  // Finished cells have a count; a claim without one is a load in progress (or one that died).
  const fresh = (r: { seeded_at: string }) => Date.now() - new Date(r.seeded_at).getTime() < 6 * 60e3;
  const done = (rows0 ?? []).filter((r) => r.found !== null);
  const loading = (rows0 ?? []).filter((r) => r.found === null && fresh(r));
  if (done.length === cells.length) return NextResponse.json({ added: 0, reason: "already_loaded" });
  if (done.length + loading.length === cells.length) return NextResponse.json({ added: 0, reason: "loading" });

  // Gentle on the free map servers and on us.
  const { count } = await db
    .from("court_seed_cells")
    .select("cell", { count: "exact", head: true })
    .gt("seeded_at", new Date(Date.now() - 10 * 60e3).toISOString());
  if ((count ?? 0) > MAX_BLOCKS_PER_10_MIN * 9) return NextResponse.json({ added: 0, reason: "busy" });

  // Claim the area first so parallel requests from the same town don't all hit the map servers.
  await db.from("court_seed_cells").upsert(cells.map((cell) => ({ cell, seeded_at: new Date().toISOString(), found: null })));

  let els: OsmEl[] | null = null;
  const errs: string[] = [];
  const q = overpassQuery(bbox);
  // The main server is busy at peak times: try it, then the mirrors, then the main one again after a pause.
  const plan = [MIRRORS[0], MIRRORS[1], MIRRORS[2], "wait", MIRRORS[0], "wait", MIRRORS[0]];
  for (const url of plan) {
    if (els) break;
    if (url === "wait") {
      await new Promise((r) => setTimeout(r, 8000));
      continue;
    }
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "letslarp.io court finder (hello@letslarp.io)" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(90000),
      });
      if (!r.ok) {
        errs.push(`${new URL(url).host} ${r.status} ${(await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 160)}`);
        continue;
      }
      els = ((await r.json()) as { elements: OsmEl[] }).elements;
    } catch (e) {
      errs.push(`${new URL(url).host} ${(e as Error).name}: ${(e as Error).message}`.slice(0, 160));
    }
  }
  if (!els) {
    // Release the claim so the next visitor retries.
    await db.from("court_seed_cells").delete().in("cell", cells).is("found", null);
    return NextResponse.json({ added: 0, reason: "map_unavailable", detail: errs }, { status: 502 });
  }

  const rows = toCourtRows(els);
  let added = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const { data, error } = await db.rpc("import_osm_courts", { p_rows: rows.slice(i, i + 400) });
    if (error) return NextResponse.json({ added, found: rows.length, reason: "import_failed", detail: error.message }, { status: 500 });
    added += (data as number) ?? 0;
  }
  await db.from("court_seed_cells").update({ found: rows.length }).in("cell", cells);
  return NextResponse.json({ added, found: rows.length });
}
