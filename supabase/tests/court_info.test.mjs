// Court details migration: applies twice; map data never overwrites a player's fix; only players
// who have a game at a court can edit it; bad input is rejected; imports carry the details.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fails++; };
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b";
const K1 = "20000000-0000-0000-0000-000000000001";

await db.exec(`
  create role authenticated; create role anon; create role service_role;
  create schema auth; create schema extensions;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create domain extensions.geography as text;
  create function public.pt(lat float8, lng float8) returns extensions.geography language sql as $$ select (lat || ',' || lng)::extensions.geography $$;
  create function st_dwithin(a extensions.geography, b extensions.geography, m float8) returns boolean language sql as $$ select a = b $$;
  create function "<->"(a extensions.geography, b extensions.geography) returns float8 language sql as $$ select 0::float8 $$;
  create table public.profiles (id uuid primary key, display_name text);
  create table public.courts (id uuid primary key default gen_random_uuid(), name text, address text, location extensions.geography,
    court_count int, created_by uuid, source text default 'user', source_ref text, town text, kind text, indoor boolean default false,
    members_only boolean default false, lit boolean default false, sports text[] default '{}');
  create table public.games (id uuid primary key, court_id uuid references courts);
  create table public.game_players (game_id uuid references games, player_id uuid references profiles, primary key (game_id, player_id));
  insert into profiles values ('${A}','A'),('${B}','B');
  insert into courts (id, name, location, lit) values ('${K1}', 'Memorial Park', '40.5,-74.4', true);
  insert into games values ('30000000-0000-0000-0000-000000000001', '${K1}');
  insert into game_players values ('30000000-0000-0000-0000-000000000001', '${A}');
`);
// PGlite has no "order by <->" operator; strip it from the import for this test.
const sql = readFileSync(new URL("../migrations/20261026000000_court_info.sql", import.meta.url), "utf8").replace(" order by location <-> p", "");
await db.exec(sql);
await db.exec(sql);
ok(true, "migration applies (twice)");
let r = await db.query(`select lights from courts where id = '${K1}'`);
ok(r.rows[0].lights === "yes", "old lit=true becomes lights=yes (lit=false stays unknown)");

await db.exec(`grant usage on schema public, auth, extensions to authenticated; grant select on all tables in schema public to authenticated;
  grant execute on all functions in schema auth to authenticated;`);
async function as(uid, q) {
  await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return { rows: (await db.query(q)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec("reset role;"); }
}

r = await as(B, `select edit_court_info('${K1}', '6 AM–10 PM', null, null, null, null) as s`);
ok(r.rows?.[0].s === "not_played_here", "a player with no game here can't edit");
r = await as(A, `select edit_court_info('${K1}', null, null, 'call me maybe', null, null) as s`);
ok(r.rows?.[0].s === "bad_phone", "junk phone rejected");
r = await as(A, `select edit_court_info('${K1}', null, 'sometimes', null, null, null) as s`);
ok(r.rows?.[0].s === "bad_lights", "bad lights value rejected");
r = await as(A, `select edit_court_info('${K1}', '6 AM–10 PM daily', 'no', '(732) 555-0100', 'paid', '$20/hr') as s`);
ok(r.rows?.[0].s === "ok", "player who played here can edit");
r = await db.query(`select hours, lights, lit, phone, fee, fee_note, info_by from courts where id = '${K1}'`);
ok(r.rows[0].hours === "6 AM–10 PM daily" && r.rows[0].lights === "no" && r.rows[0].lit === false && r.rows[0].phone === "(732) 555-0100" && r.rows[0].fee === "paid" && r.rows[0].fee_note === "$20/hr" && r.rows[0].info_by === A, "edit saved (and lit kept in sync)");
r = await db.query(`select count(*)::int n from court_info_edits where court_id = '${K1}'`);
ok(r.rows[0].n === 5, "each changed field logged");
r = await as(A, `select edit_court_info('${K1}', '6 AM–10 PM daily', 'no', null, null, null) as s`);
r = await db.query(`select count(*)::int n from court_info_edits where court_id = '${K1}'`);
ok(r.rows[0].n === 5, "unchanged values aren't logged again");

// Map data fills blanks only.
await db.query(`select set_court_osm_info('${K1}', 'Mo-Su 08:00-20:00', 'yes', '+1 999', 'https://x.org', 'free')`);
r = await db.query(`select hours, lights, phone, website, fee, info_checked_at from courts where id = '${K1}'`);
ok(r.rows[0].hours === "6 AM–10 PM daily" && r.rows[0].lights === "no" && r.rows[0].fee === "paid" && r.rows[0].phone === "(732) 555-0100", "map data never overwrites a player's fix");
ok(r.rows[0].website === "https://x.org" && r.rows[0].info_checked_at, "map data fills a blank (website) and marks checked");
r = await as(A, `select set_court_osm_info('${K1}', 'x', 'yes', null, null, null)`);
ok(!!r.error, "players can't call the server-only map update");

// Clearing a field
r = await as(A, `select edit_court_info('${K1}', '', '', '', '', '') as s`);
r = await db.query(`select hours, lights, phone, fee from courts where id = '${K1}'`);
ok(r.rows[0].hours === null && r.rows[0].lights === null && r.rows[0].phone === null && r.rows[0].fee === null, "'' clears a field back to unknown");

// Import carries the details for new courts.
await db.query(`select import_osm_courts($1::jsonb)`, [JSON.stringify([{ ref: "w1", name: "Roosevelt Park", town: "Edison", lat: 40.6, lng: -74.3, courts: 4, sports: ["tennis"], indoor: false, lit: true, members_only: false, kind: "park", hours: "Mo-Su 06:00-22:00", lights: "yes", phone: "+1 732 555 0199", website: null, fee: "free" }])]);
r = await db.query(`select hours, lights, phone, fee, info_checked_at from courts where source_ref = 'w1'`);
ok(r.rows[0]?.hours === "Mo-Su 06:00-22:00" && r.rows[0].lights === "yes" && r.rows[0].fee === "free" && r.rows[0].info_checked_at, "import saves hours, lights, phone and cost");

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
