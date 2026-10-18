// Runs the ratings migration against an in-process Postgres with stubbed PostGIS/auth,
// checks the TrueSkill math against ts-trueskill, and exercises submit_result end to end.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { TrueSkill, Rating } from "ts-trueskill";

const MIG = process.argv[2] ?? new URL("../migrations/20261018110000_sports_ratings.sql", import.meta.url).pathname;
const db = new PGlite();
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fails++; };

await db.exec(`
  create role authenticated;
  create schema extensions; create schema auth;
  create domain extensions.geography as text;
  create function extensions.st_distance(a extensions.geography, b extensions.geography) returns double precision language sql as 'select 0::float8';
  create function extensions.st_dwithin(a extensions.geography, b extensions.geography, d double precision) returns boolean language sql as 'select true';
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.profiles (id uuid primary key, display_name text default '', skill numeric(3,2) not null default 3.00,
    location extensions.geography, radius_mi int default 5, available_until timestamptz, clubs text[] not null default '{}', sports jsonb not null default '{}');
  create table public.courts (id uuid primary key default gen_random_uuid(), name text, location extensions.geography, members_only boolean default false, club text);
  create table public.games (id uuid primary key default gen_random_uuid(), host_id uuid references profiles, court_id uuid references courts,
    slots int, skill_min numeric(3,2), skill_max numeric(3,2), starts_at timestamptz, expires_at timestamptz, status text default 'open',
    note text, members_only boolean default false, club text, created_at timestamptz default now(), filled_at timestamptz);
  create table public.game_players (game_id uuid references games, player_id uuid references profiles, joined_at timestamptz default now(), no_show boolean default false, primary key (game_id, player_id));
  create table public.game_passes (game_id uuid, player_id uuid);
  create table public.push_subscriptions (endpoint text, user_id uuid, p256dh text, auth text);
  create function public.active_hosted_game() returns table (id uuid) language sql as 'select null::uuid where false';
`);
await db.exec(readFileSync(MIG, "utf8"));
ok(true, "migration applies");
await db.exec(readFileSync(MIG, "utf8"));
ok(true, "migration re-applies cleanly (safe to run twice)");
// Court sports migration: SQL bodies need real PostGIS, so skip body checks and test the table + trigger.
const MIG2 = new URL("../migrations/20261018120000_court_sports.sql", import.meta.url).pathname;
await db.exec("alter table public.courts add column town text, add column kind text, add column indoor boolean default false, add column lit boolean default false, add column source text default 'user', add column address text, add column court_count int, add column notes text, add column created_by uuid; set check_function_bodies = off;");
await db.exec(readFileSync(MIG2, "utf8"));
await db.exec(readFileSync(MIG2, "utf8"));
await db.exec("set check_function_bodies = on;");
ok(true, "court sports migration applies");

// --- Math vs reference implementation
const ts = new TrueSkill(3.0, 0.8, 0.4, 0.02, 0); // mu, sigma, beta, tau, drawProbability
const cases = [
  { mu: [3.5, 3.5, 3.5, 3.5], s: [0.8, 0.8, 0.8, 0.8], na: 2, aw: true },
  { mu: [3.2, 4.1, 3.9, 3.0], s: [0.8, 0.3, 0.5, 0.8], na: 2, aw: false },
  { mu: [2.5, 5.0], s: [0.8, 0.4], na: 1, aw: true }, // upset
  { mu: [4.0, 3.0], s: [0.2, 0.2], na: 1, aw: true },
];
for (const c of cases) {
  const r = await db.query(`select * from trueskill_2team($1::float8[], $2::float8[], $3, $4, 0.4, 0.02)`, [c.mu, c.s, c.na, c.aw]);
  const { new_mu, new_sigma } = r.rows[0];
  const A = c.mu.slice(0, c.na).map((m, i) => new Rating(m, c.s[i]));
  const B = c.mu.slice(c.na).map((m, i) => new Rating(m, c.s[c.na + i]));
  const out = ts.rate([A, B], c.aw ? [0, 1] : [1, 0]).flat();
  const err = Math.max(...out.map((o, i) => Math.max(Math.abs(o.mu - new_mu[i]), Math.abs(o.sigma - new_sigma[i]))));
  ok(err < 1e-4, `trueskill ${JSON.stringify(c.mu)} a_won=${c.aw} max err ${err.toExponential(1)} → mu ${new_mu.map((x) => x.toFixed(3)).join(", ")}`);
}

// --- End to end
const P = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "33333333-3333-3333-3333-333333333333", "44444444-4444-4444-4444-444444444444"];
await db.query(`insert into profiles (id, skill, sports) values ($1, 3.5, '{"pickleball":5,"tennis":6}'), ($2, 3.75, '{}'), ($3, 3.25, '{}'), ($4, 4.0, '{}')`, P);
const court = (await db.query(`insert into courts (name) values ('Test Park') returning id`)).rows[0].id;
const set = (u) => db.query(`select set_config('test.uid', $1, false)`, [u ?? ""]);

await set(P[0]);
const gid = (await db.query(`select create_game($1, 4, 3.0, 4.0, now() + interval '1 hour', null, false, 'pickleball') as id`, [court])).rows[0].id;
ok(!!gid, "create_game with sport");
for (const p of P.slice(1)) await db.query(`insert into game_players (game_id, player_id) values ($1, $2)`, [gid, p]);

const lvl = (await db.query(`select player_level($1, 'tennis') t, player_level($2, 'tennis') t2, player_level($1, 'pickleball') pb`, [P[0], P[1]])).rows[0];
ok(Number(lvl.t) === 4.25 && lvl.t2 === null && Number(lvl.pb) === 3.5, `levels: tennis self 6/10 → ${lvl.t}, non-tennis player → ${lvl.t2}, pickleball ${lvl.pb}`);

const expectErr = async (sql, args, code) => {
  try { await db.query(sql, args); ok(false, `expected ${code}`); } catch (e) { ok(e.message.includes(code), `rejects: ${code}`); }
};
const submit = `select submit_result($1, $2::uuid[], $3::uuid[], $4, $5) as r`;
await expectErr(submit, [gid, [P[0], P[1]], [P[2], P[3]], 11, 7], "not_started");
await db.query(`update games set starts_at = now() - interval '1 hour' where id = $1`, [gid]);
await expectErr(submit, [gid, [P[0], P[1]], [P[2], P[0]], 11, 7], "bad_teams");
await expectErr(submit, [gid, [P[0], P[1]], [P[2], P[3]], 11, 11], "bad_score");
await set("99999999-9999-9999-9999-999999999999");
await expectErr(submit, [gid, [P[0], P[1]], [P[2], P[3]], 11, 7], "not_in_game");
await set(P[2]);
const r = (await db.query(submit, [gid, [P[0], P[1]], [P[2], P[3]], 11, 7])).rows[0].r;
const byId = Object.fromEntries(r.map((x) => [x.player_id, x]));
ok(r.length === 4 && byId[P[0]].after > byId[P[0]].before && byId[P[3]].after < byId[P[3]].before, `winners up, losers down: ${r.map((x) => `${x.before}→${x.after}`).join(", ")}`);
await expectErr(submit, [gid, [P[0], P[1]], [P[2], P[3]], 11, 7], "already_scored");
const rt = (await db.query(`select games, mu from player_ratings where player_id = $1 and sport = 'pickleball'`, [P[0]])).rows[0];
ok(rt.games === 1 && Number((await db.query(`select player_level($1,'pickleball') l`, [P[0]])).rows[0].l) === Number(rt.mu), "learned rating now drives matching");

await db.query(`select submit_feedback($1, $2::jsonb, true)`, [gid, JSON.stringify({ [P[0]]: 1, [P[1]]: 0, [P[2]]: -1, bogus: 1 }).replace('"bogus"', '"' + P[3] + '"')]);
const fb = (await db.query(`select count(*)::int n from level_feedback where game_id = $1 and rater_id = $2`, [gid, P[2]])).rows[0].n;
ok(fb === 3, `feedback stored for the other 3 players, not self (${fb})`);
const mine = (await db.query(`select * from my_ratings()`)).rows;
ok(mine.length === 1 && mine[0].sport === "pickleball" && mine[0].games === 1, `my_ratings: ${JSON.stringify(mine)}`);

// --- Court sports: tennis games only at courts tagged for tennis
await expectErr(`insert into games (host_id, court_id, slots, skill_min, skill_max, starts_at, expires_at, sport) values ($1, $2, 2, 2, 6, now(), now(), 'tennis')`, [P[1], court], "court_sport");
await db.query(`update courts set sports = '{pickleball,tennis}' where id = $1`, [court]);
await expectErr(`update courts set sports = '{golf}' where id = $1`, [court], "courts_sports_check");

// --- Upset cap: a 2.5 beating a 5.0 in singles moves at most 0.5
const g2 = (await db.query(`insert into games (host_id, court_id, slots, skill_min, skill_max, starts_at, expires_at, sport) values ($1, $2, 2, 2, 6, now() - interval '1 hour', now(), 'tennis') returning id`, [P[1], court])).rows[0].id;
await db.query(`update profiles set sports = '{"tennis":3}' where id = $1`, [P[1]]);
await db.query(`update profiles set sports = '{"tennis":9}' where id = $1`, [P[2]]);
await db.query(`insert into game_players (game_id, player_id) values ($1, $2), ($1, $3)`, [g2, P[1], P[2]]);
await set(P[1]);
const up = (await db.query(submit, [g2, [P[1]], [P[2]], 6, 2])).rows[0].r;
const d = up.map((x) => Math.abs(x.after - x.before));
ok(Math.max(...d) <= 0.5 + 1e-9, `upset capped at 0.5: ${up.map((x) => `${x.before}→${x.after}`).join(", ")}`);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
