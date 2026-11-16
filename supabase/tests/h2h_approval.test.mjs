// Invite approval + head to head (setup shared with find_and_log.test): search respects "show me in search"; a logged match only counts
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
    insert into public.game_results (game_id, team_a, team_b, score_a, score_b, games, submitted_by)
    select p_game, ta, tb, count(*) filter (where (e->>0)::int > (e->>1)::int), count(*) filter (where (e->>0)::int < (e->>1)::int), gs, by_
    from jsonb_array_elements(gs) e $$;
  insert into profiles (id, display_name) values ('${A}','Ibrahim L.'),('${B}','Palak P.'),('${C}','Maya K.'),('${D}','Mayank S.'),('${E}','Hidden Person');
  insert into courts values ('${K}', 'Memorial Park', 'Edison', '{tennis}');
  create table public.player_ratings (player_id uuid, sport text, mu numeric, sigma numeric, games int);
  create function public.sport_params(s text, out lo float8, out hi float8, out sigma0 float8, out beta float8, out tau float8) language sql as 'select 2.0, 8.0, 0.8, 0.4, 0.02';
  create function public.player_level(p uuid, s text) returns numeric language sql as $$ select coalesce((select mu from public.player_ratings where player_id = p and sport = s), 3.0) $$;
`);
for (const f of ["20261116000000_find_and_log", "20261116010000_match_invites", "20261116020000_h2h_and_approval"])
  await db.exec(readFileSync(new URL(`../migrations/${f}.sql`, import.meta.url), "utf8"));
await db.exec(readFileSync(new URL("../migrations/20261116020000_h2h_and_approval.sql", import.meta.url), "utf8"));
ok(true, "migrations apply (approval twice)");
await db.exec(`grant usage on schema public, auth to authenticated, anon; grant select on all tables in schema public to authenticated;
  grant execute on all functions in schema auth to authenticated;`);
async function as(uid, q, params) {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`);
  try { return { rows: (await db.query(q, params)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec("reset role;"); }
}
const ago = new Date(Date.now() - 2 * 3600e3).toISOString();
const tok = async (g) => (await db.query(`select token from game_invites where game_id = $1`, [g])).rows[0].token;
const filed = async (g) => (await db.query(`select count(*)::int n from score_reports where game_id = $1`, [g])).rows[0].n;

// ---- Approval ----
let r = await as(A, `select log_match($1, 'pickleball', $2, 60, $3, $4, '[[11,5]]'::jsonb, $5::jsonb) as id`, [K, ago, [A], [], JSON.stringify([{ team: "b", name: "Sam" }])]);
const G = r.rows[0].id;
let T = await tok(G);
await as(C, `select claim_invite($1)`, [T]);
ok((await filed(G)) === 0, "someone joining through the link doesn't file the score yet");
r = await as(C, `select approve_invite($1, true)`, [T]);
ok(r.error?.includes("not_logger"), "only the logger can approve");
r = await as(A, `select approve_invite($1, false) as t`, [T]);
const T2 = r.rows?.[0]?.t;
ok(T2 && T2 !== T, "'Not them' makes a fresh link");
r = await db.query(`select count(*)::int n from game_players where game_id = $1 and player_id = $2`, [G, C]);
ok(r.rows[0].n === 0, "and removes the wrong person from the match");
r = await as(B, `select claim_invite($1)`, [T]);
ok(r.error?.includes("no_invite"), "the old link no longer works");
await as(B, `select claim_invite($1)`, [T2]);
r = await as(A, `select approve_invite($1, true)`, [T2]);
ok((await filed(G)) === 1, "approving the right person files the score");
r = await as(B, `select submit_results($1, $2, $3, '[[5,11]]'::jsonb) as s`, [G, [B], [A]]);
ok(r.rows?.[0]?.s?.status === "final", "they confirm and it counts");
r = await as(B, `select endpoint from claim_push_targets($1)`, [G]);
ok(Array.isArray(r.rows), "claim push lookup runs");

// ---- Head to head ----
// A vs B singles (A won above), plus a doubles match A+C vs B+D logged and confirmed.
r = await as(A, `select log_match($1, 'pickleball', $2, 60, $3, $4, '[[11,9],[8,11],[11,2]]'::jsonb) as id`, [K, ago, [A, C], [B, D]]);
const G2 = r.rows[0].id;
await as(D, `select submit_results($1, $2, $3, '[[9,11],[11,8],[2,11]]'::jsonb)`, [G2, [D, B], [C, A]]);
// A and B as partners shouldn't count.
r = await as(A, `select log_match($1, 'pickleball', $2, 60, $3, $4, '[[11,3]]'::jsonb) as id`, [K, ago, [A, B], [C, D]]);
await as(C, `select submit_results($1, $2, $3, '[[3,11]]'::jsonb)`, [r.rows[0].id, [C, D], [A, B]]);
// Unconfirmed match shouldn't count.
await as(A, `select log_match($1, 'pickleball', $2, 60, $3, $4, '[[11,0]]'::jsonb)`, [K, ago, [A], [B]]);

r = await as(A, `select * from head_to_head($1)`, [B]);
ok(r.rows?.length === 2, "two confirmed matches on opposite sides (partners and unconfirmed excluded)");
ok(r.rows.every((x) => x.won === true), "both are wins from A's side");
const dbl = r.rows.find((x) => x.slots === 4);
ok(JSON.stringify(dbl?.games) === "[[11,9],[8,11],[11,2]]", "scores come from A's side");
r = await as(B, `select * from head_to_head($1)`, [A]);
ok(r.rows?.length === 2 && r.rows.every((x) => x.won === false) && JSON.stringify(r.rows.find((x) => x.slots === 4).games) === "[[9,11],[11,8],[2,11]]", "B sees the same matches flipped to B's side");
r = await as(E, `select * from head_to_head($1)`, [A]);
ok(r.rows?.length === 0, "someone who never played A gets nothing");
r = await as(null, `select * from head_to_head($1)`, [A]);
ok(!!r.error || r.rows?.length === 0, "signed out gets nothing");
await db.exec(`insert into player_ratings values ('${A}', 'pickleball', 3.65, 0.3, 12)`);
r = await as(A, `select * from rating_pair($1, 'pickleball')`, [B]);
const ra = r.rows?.find((x) => x.player_id === A), rb = r.rows?.find((x) => x.player_id === B);
ok(Number(ra?.mu) === 3.65 && Number(ra?.sigma) === 0.3 && Number(rb?.mu) === 3 && Number(rb?.sigma) === 0.8, "ratings with uncertainty for the prediction");

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
