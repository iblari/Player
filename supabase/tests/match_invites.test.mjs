// Invite-by-link for logged matches (setup shared with find_and_log.test): search respects "show me in search"; a logged match only counts
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
const base = readFileSync(new URL("../migrations/20261116000000_find_and_log.sql", import.meta.url), "utf8");
const sql = readFileSync(new URL("../migrations/20261116010000_match_invites.sql", import.meta.url), "utf8");
await db.exec(base);
await db.exec(sql);
await db.exec(sql);
ok(true, "invite migration applies (twice)");
await db.exec(`grant usage on schema public, auth to authenticated, anon; grant select on all tables in schema public to authenticated;
  grant execute on all functions in schema auth to authenticated;`);

async function as(uid, q, params) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`);
  try { return { rows: (await db.query(q, params)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec("reset role;"); }
}
const ago = new Date(Date.now() - 2 * 3600e3).toISOString();
const games = JSON.stringify([[11, 7], [9, 11], [11, 5]]);

// Singles vs someone not on the app
let r = await as(A, `select log_match($1, 'pickleball', $2, 90, $3, $4, $5::jsonb, $6::jsonb) as id`, [K, ago, [A], [], games, JSON.stringify([{ team: "b", name: "Sam" }])]);
const G = r.rows?.[0]?.id;
ok(!!G, "log a singles match against an invited 'Sam'");
r = await db.query(`select count(*)::int n from game_players where game_id = $1`, [G]);
ok(r.rows[0].n === 1, "only the logger is in it so far");
r = await db.query(`select count(*)::int n from score_reports where game_id = $1`, [G]);
ok(r.rows[0].n === 0, "score is held until Sam joins");
r = await as(A, `select token, guest_name from game_invites where game_id = $1`, [G]);
const T = r.rows?.[0]?.token;
ok(T?.length === 32 && r.rows[0].guest_name === "Sam", "logger can read the invite link to share it");
r = await as(C, `select token from game_invites where game_id = $1`, [G]);
ok(r.rows?.length === 0, "outsiders can't read invite links");

r = await as(null, `select invite_info($1) as i`, [T]);
const info = r.rows?.[0]?.i;
ok(info?.logger === "Ibrahim L." && info.guest_name === "Sam" && JSON.stringify(info.games) === games && info.invited[0].you === true && !info.claimed, "anyone with the link sees who logged it and the score (no sign-in)");
r = await as(null, `select invite_info('nope') as i`);
ok(r.rows?.[0]?.i === null, "a wrong link shows nothing");

r = await as(null, `select claim_invite($1)`, [T]);
ok(!!r.error, "must sign in to join");
r = await as(A, `select claim_invite($1)`, [T]);
ok(r.error?.includes("already_in_game"), "the logger can't claim their own invite");
r = await as(B, `select claim_invite($1) as g`, [T]);
ok(r.rows?.[0]?.g === G, "Sam (signed up as B) joins through the link");
r = await db.query(`select team_a, team_b, games from score_reports where game_id = $1 and reporter_id = $2`, [G, A]);
ok(r.rows[0]?.team_a?.[0] === A && r.rows[0]?.team_b?.[0] === B && JSON.stringify(r.rows[0].games) === games, "logger's score is filed with Sam on the other side");
r = await as(B, `select claim_invite($1) as g`, [T]);
ok(r.rows?.[0]?.g === G, "opening the link again just returns the match");
r = await as(C, `select claim_invite($1)`, [T]);
ok(r.error?.includes("already_claimed"), "a used link can't be claimed by someone else");
r = await as(B, `select submit_results($1, $2, $3, '[[7,11],[11,9],[5,11]]'::jsonb) as s`, [G, [B], [A]]);
ok(r.rows?.[0]?.s?.status === "final", "Sam confirms and it counts");

// Doubles: real partner + invited opponents on both sides of a mix
r = await as(A, `select log_match($1, 'tennis', $2, 60, $3, $4, '[[6,4]]'::jsonb, $5::jsonb) as id`, [K, ago, [A, C], [D], JSON.stringify([{ team: "b", name: "Jo" }])]);
const G2 = r.rows?.[0]?.id;
ok(!!G2, "doubles with a partner, one opponent on the app and one invited");
r = await db.query(`select count(*)::int n from score_reports where game_id = $1`, [G2]);
ok(r.rows[0].n === 0, "held until Jo joins");
r = await as(A, `select token from game_invites where game_id = $1`, [G2]);
await as(E, `select claim_invite($1)`, [r.rows[0].token]);
r = await db.query(`select team_a, team_b from score_reports where game_id = $1`, [G2]);
const ta = r.rows[0]?.team_a?.slice().sort().join(), tb = r.rows[0]?.team_b?.slice().sort().join();
ok(ta === [A, C].sort().join() && tb === [D, E].sort().join(), "teams come out right: Ib + partner vs D + Jo");

// Bad input
r = await as(A, `select log_match($1, 'tennis', $2, 60, $3, $4, '[[6,4]]'::jsonb, $5::jsonb) as id`, [K, ago, [A], [B], JSON.stringify([{ team: "b", name: "Jo" }])]);
ok(r.error?.includes("bad_teams"), "uneven sides rejected (1 vs 2)");
r = await as(A, `select log_match($1, 'tennis', $2, 60, $3, $4, '[[6,4]]'::jsonb, $5::jsonb) as id`, [K, ago, [A], [], JSON.stringify([{ team: "b", name: "" }])]);
ok(r.error?.includes("bad_guests"), "an invite needs a name");

// Removed match: link stops working
r = await as(A, `select log_match($1, 'tennis', $2, 60, $3, $4, '[[6,4]]'::jsonb, $5::jsonb) as id`, [K, ago, [A], [], JSON.stringify([{ team: "b", name: "Lee" }])]);
const G3 = r.rows?.[0]?.id;
const T3 = (await as(A, `select token from game_invites where game_id = $1`, [G3])).rows[0].token;
await as(A, `select reject_logged($1)`, [G3]);
r = await as(B, `select claim_invite($1)`, [T3]);
ok(r.error?.includes("expired"), "after the logger removes it, the link no longer works");
r = await as(null, `select invite_info($1) as i`, [T3]);
ok(r.rows?.[0]?.i?.expired === true, "and the page says so");

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
