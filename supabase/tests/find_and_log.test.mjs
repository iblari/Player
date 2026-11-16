// Player search + logged matches: search respects "show me in search"; a logged match only counts
// once someone on the other side agrees; partners can't confirm; any player can remove it;
// unconfirmed matches stay out of other people's view.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fails++; };
const [A, B, C, D, E] = ["a", "b", "c", "d", "e"].map((x) => `00000000-0000-0000-0000-00000000000${x}`);
const K = "20000000-0000-0000-0000-000000000001";

await db.exec(`
  create role authenticated; create role anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.profiles (id uuid primary key, display_name text not null default '', avatar_url text, sports jsonb not null default '{}',
    activity_visibility text not null default 'everyone');
  create table public.follows (follower_id uuid references profiles, followee_id uuid references profiles, primary key (follower_id, followee_id));
  create table public.courts (id uuid primary key, name text, town text, sports text[] not null default '{}');
  create table public.games (id uuid primary key default gen_random_uuid(), host_id uuid references profiles, court_id uuid references courts,
    slots int, skill_min numeric, skill_max numeric, starts_at timestamptz, expires_at timestamptz, status text default 'open',
    sport text default 'pickleball', ended_at timestamptz, ended_by uuid, filled_at timestamptz, attendance_done boolean default false,
    fee_minutes int, created_at timestamptz default now());
  create table public.game_players (game_id uuid references games, player_id uuid references profiles, joined_at timestamptz default now(),
    no_show boolean default false, visibility text, primary key (game_id, player_id));
  create table public.score_reports (game_id uuid references games, reporter_id uuid references profiles, team_a uuid[], team_b uuid[],
    score_a int, score_b int, games jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), primary key (game_id, reporter_id));
  create table public.game_results (game_id uuid primary key, team_a uuid[], team_b uuid[], score_a int, score_b int, games jsonb, created_at timestamptz default now(), submitted_by uuid);
  create table public.rating_history (game_id uuid, player_id uuid, mu_before numeric, mu_after numeric);
  create table public.push_subscriptions (endpoint text, user_id uuid, p256dh text, auth text);
  create function public.can_see_activity(u uuid, v text) returns boolean language sql as 'select true';
  create function public.valid_games(p jsonb) returns boolean language sql immutable as $$
    select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 9
       and not exists (select 1 from jsonb_array_elements(p) g where jsonb_array_length(g) <> 2 or (g->>0)::int = (g->>1)::int) $$;
  -- Stand-in for the real rating update: just record the final result.
  create function public.apply_results(p_game uuid, ta uuid[], tb uuid[], gs jsonb, by_ uuid) returns void language sql as $$
    insert into public.game_results (game_id, team_a, team_b, score_a, score_b, games, submitted_by) values (p_game, ta, tb, 0, 0, gs, by_) $$;
  insert into profiles (id, display_name) values ('${A}','Ibrahim L.'),('${B}','Palak P.'),('${C}','Maya K.'),('${D}','Mayank S.'),('${E}','Hidden Person');
  insert into courts values ('${K}', 'Memorial Park', 'Edison', '{tennis}');
`);
const sql = readFileSync(new URL("../migrations/20261116000000_find_and_log.sql", import.meta.url), "utf8");
await db.exec(sql);
await db.exec(sql);
ok(true, "migration applies (twice)");
await db.exec(`grant usage on schema public, auth to authenticated; grant select on all tables in schema public to authenticated;
  grant execute on all functions in schema auth to authenticated;
  update profiles set discoverable = false where id = '${E}';`);

async function as(uid, q, params) {
  await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return { rows: (await db.query(q, params)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec("reset role;"); }
}
const names = (r) => r.rows?.map((x) => x.display_name).join(", ");

// ---- Search ----
let r = await as(A, `select * from search_players('may')`);
ok(names(r) === "Mayank S., Maya K." || names(r) === "Maya K., Mayank S.", "name search finds both 'May…' players");
r = await as(A, `select * from search_players('hidden')`);
ok(r.rows?.length === 0, "someone who turned off 'Show me in search' doesn't appear");
r = await as(A, `select * from search_players('ibra')`);
ok(r.rows?.length === 0, "you don't find yourself");
r = await as(A, `select * from search_players('%')`);
ok(r.rows?.length === 0, "wildcards don't list everyone");
r = await as(A, `select * from search_players('')`);
ok(r.rows?.length === 0, "no suggestions before you've played anyone");

// ---- Logging ----
const games11 = JSON.stringify([[11, 7], [9, 11], [11, 5]]);
const ago = new Date(Date.now() - 2 * 3600e3).toISOString();
r = await as(A, `select log_match($1, 'tennis', $2, 90, $3, $4, $5::jsonb) as id`, [K, ago, [B], [A], games11]);
ok(r.error?.includes("bad_teams"), "the logger must be on team A");
r = await as(A, `select log_match($1, 'tennis', $2, 90, $3, $4, $5::jsonb) as id`, [K, new Date(Date.now() + 86400e3).toISOString(), [A], [B], games11]);
ok(r.error?.includes("in_future"), "can't log a match in the future");
r = await as(A, `select log_match($1, 'tennis', $2, 90, $3, $4, '[[11,11]]'::jsonb) as id`, [K, ago, [A], [B]]);
ok(r.error?.includes("bad_score"), "tied game rejected");
r = await as(A, `select log_match($1, 'pickleball', $2, 90, $3, $4, $5::jsonb) as id`, [K, ago, [A], [B], games11]);
const G = r.rows?.[0]?.id;
ok(!!G, "logging a singles match works");
r = await db.query(`select status, logged, slots, ended_at - starts_at as len from games where id = $1`, [G]);
ok(r.rows[0].logged && r.rows[0].status === "full" && r.rows[0].slots === 2, "game saved as a finished, logged singles match");
r = await db.query(`select sports from courts where id = $1`, [K]);
ok(r.rows[0].sports.includes("pickleball"), "the court learns it hosts pickleball");
r = await db.query(`select count(*)::int n from game_results where game_id = $1`, [G]);
ok(r.rows[0].n === 0, "it does NOT count yet");

r = await as(A, `select * from search_players('')`);
ok(names(r) === "Palak P.", "suggestions now include who you played with");
await db.exec(`update profiles set discoverable = false where id = '${B}'`);
r = await as(A, `select * from search_players('pal')`);
ok(names(r) === "Palak P.", "people you've played with show even if hidden from search");
await db.exec(`update profiles set discoverable = true where id = '${B}'`);

// Visibility before confirmation
r = await as(C, `select game_id from player_activities('${A}')`);
ok(r.rows?.length === 0, "outsiders don't see an unconfirmed logged match");
r = await as(B, `select game_id, logged from player_activities('${B}')`);
ok(r.rows?.length === 1 && r.rows[0].logged === true, "the opponent sees it (marked as logged)");

// Logger editing their own score doesn't make it count
r = await as(A, `select submit_results($1, $2, $3, $4::jsonb) as s`, [G, [A], [B], games11]);
ok(r.rows?.[0].s.status === "awaiting_confirm", "logger re-entering the score still waits for the opponent");

// Opponent disagrees
r = await as(B, `select submit_results($1, $2, $3, '[[11,7],[11,9]]'::jsonb) as s`, [G, [B], [A]]);
ok(r.rows?.[0].s.status === "disputed", "opponent entering a different score = disputed, not counted");
r = await db.query(`select count(*)::int n from game_results where game_id = $1`, [G]);
ok(r.rows[0].n === 0, "disputed match still doesn't count");

// Opponent agrees (their side first: flipped scores)
r = await as(B, `select submit_results($1, $2, $3, '[[7,11],[11,9],[5,11]]'::jsonb) as s`, [G, [B], [A]]);
ok(r.rows?.[0].s.status === "final", "opponent confirming the same score (from their side) makes it count");
r = await db.query(`select team_a, games from game_results where game_id = $1`, [G]);
ok(r.rows[0]?.team_a?.[0] === A && JSON.stringify(r.rows[0].games) === games11, "final result is the logger's version");
r = await as(C, `select game_id from player_activities('${A}')`);
ok(r.rows?.length === 1, "once confirmed, it's visible like any match");

// ---- Doubles: partner can't confirm ----
r = await as(A, `select log_match($1, 'tennis', $2, null, $3, $4, '[[6,4],[6,3]]'::jsonb) as id`, [K, ago, [A, C], [B, D]]);
const G2 = r.rows?.[0]?.id;
ok(!!G2, "logging doubles works");
r = await as(C, `select submit_results($1, $2, $3, '[[6,4],[6,3]]'::jsonb) as s`, [G2, [A, C], [B, D]]);
ok(r.rows?.[0].s.status === "awaiting_confirm", "the logger's partner can't confirm for the other side");
r = await as(D, `select submit_results($1, $2, $3, '[[4,6],[3,6]]'::jsonb) as s`, [G2, [D, B], [C, A]]);
ok(r.rows?.[0].s.status === "final", "an opponent confirms (any order of names)");

// ---- Disputed, then the logger fixes it to match ----
r = await as(A, `select log_match($1, 'tennis', $2, 60, $3, $4, '[[6,4]]'::jsonb) as id`, [K, ago, [A], [D]]);
const G3 = r.rows?.[0]?.id;
await as(D, `select submit_results($1, $2, $3, '[[6,2]]'::jsonb)`, [G3, [D], [A]]);
r = await as(A, `select submit_results($1, $2, $3, '[[2,6]]'::jsonb) as s`, [G3, [A], [D]]);
ok(r.rows?.[0].s.status === "final", "logger correcting to the opponent's score settles it");

// ---- "This didn't happen" ----
r = await as(A, `select log_match($1, 'tennis', $2, 60, $3, $4, '[[6,0]]'::jsonb) as id`, [K, ago, [A], [B]]);
const G4 = r.rows?.[0]?.id;
r = await as(C, `select reject_logged($1)`, [G4]);
ok(!!r.error, "an outsider can't remove it");
r = await as(B, `select reject_logged($1)`, [G4]);
r = await db.query(`select status from games where id = $1`, [G4]);
ok(r.rows[0].status === "cancelled", "the opponent can say it didn't happen");
r = await as(B, `select reject_logged($1)`, [G]);
ok(r.error?.includes("already_scored"), "a confirmed match can't be removed this way");

// ---- Push targets & rate limit ----
await db.exec(`insert into push_subscriptions values ('e-b','${B}','p','a'),('e-a','${A}','p','a')`);
r = await as(A, `select log_match($1, 'tennis', $2, 60, $3, $4, '[[6,1]]'::jsonb) as id`, [K, ago, [A], [B]]);
const G5 = r.rows?.[0]?.id;
r = await as(A, `select endpoint from logged_push_targets($1)`, [G5]);
ok(r.rows?.map((x) => x.endpoint).join() === "e-b", "only the other player gets the 'confirm this' push");
r = await as(B, `select endpoint from logged_push_targets($1)`, [G5]);
ok(r.rows?.length === 0, "only the logger can trigger it");
for (let i = 0; i < 6; i++) await as(A, `select log_match($1, 'tennis', $2, 60, $3, $4, '[[6,1]]'::jsonb)`, [K, ago, [A], [B]]);
r = await as(A, `select log_match($1, 'tennis', $2, 60, $3, $4, '[[6,1]]'::jsonb) as id`, [K, ago, [A], [B]]);
ok(r.error?.includes("too_many"), "at most 10 logged matches a day");

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
