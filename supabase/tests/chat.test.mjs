// Game chat migration: applies cleanly, and row-level security keeps the thread to players in the game.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fails++; };
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c";

await db.exec(`
  create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.profiles (id uuid primary key, display_name text);
  create table public.games (id uuid primary key, host_id uuid, status text default 'open', starts_at timestamptz default now() + interval '1 hour');
  create table public.game_players (game_id uuid references games, player_id uuid references profiles, joined_at timestamptz default now(), primary key (game_id, player_id));
  create table public.push_subscriptions (endpoint text primary key, user_id uuid, p256dh text, auth text);
  insert into profiles values ('${A}','A'),('${B}','B'),('${C}','C');
  insert into games (id, host_id) values ('10000000-0000-0000-0000-000000000001','${A}');
  insert into games (id, host_id, status) values ('10000000-0000-0000-0000-000000000002','${A}','cancelled');
  insert into game_players (game_id, player_id) values ('10000000-0000-0000-0000-000000000001','${A}'),('10000000-0000-0000-0000-000000000001','${B}'),('10000000-0000-0000-0000-000000000002','${A}');
  insert into push_subscriptions values ('e-a','${A}','p','a'),('e-b','${B}','p','a'),('e-c','${C}','p','a');
`);
await db.exec(readFileSync(new URL("../migrations/20261018130000_game_chat.sql", import.meta.url), "utf8"));
ok(true, "chat migration applies");
await db.exec(`grant usage on schema public, auth to authenticated; grant select, insert on all tables in schema public to authenticated;
  grant usage on all sequences in schema public to authenticated; grant execute on all functions in schema auth to authenticated;`);

const G1 = "10000000-0000-0000-0000-000000000001", G2 = "10000000-0000-0000-0000-000000000002";
async function as(uid, sql) {
  await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec("reset role;"); }
}

let r = await as(A, `insert into game_messages (game_id, body) values ('${G1}', 'On my way') returning id, sender_id`);
ok(!r.error && r.rows[0].sender_id === A, "player A can post, sender defaults to them");
r = await as(B, `select body from game_messages where game_id = '${G1}'`);
ok(r.rows?.length === 1 && r.rows[0].body === "On my way", "player B in the game reads it");
r = await as(C, `select body from game_messages where game_id = '${G1}'`);
ok(r.rows?.length === 0, "outsider C sees nothing");
r = await as(C, `insert into game_messages (game_id, body) values ('${G1}', 'hi')`);
ok(!!r.error, "outsider C can't post");
r = await as(B, `insert into game_messages (game_id, sender_id, body) values ('${G1}', '${A}', 'spoof')`);
ok(!!r.error, "B can't post as A");
r = await as(A, `insert into game_messages (game_id, body) values ('${G1}', '   ')`);
ok(!!r.error, "blank message rejected");
r = await as(A, `insert into game_messages (game_id, body) values ('${G2}', 'hello?')`);
ok(!!r.error, "no posting in a cancelled game");

const mid = (await db.query(`select id from game_messages limit 1`)).rows[0].id;
r = await as(A, `select endpoint from chat_push_targets(${mid})`);
ok(r.rows?.map((x) => x.endpoint).join() === "e-b", "push goes only to the other player (B)");
r = await as(B, `select endpoint from chat_push_targets(${mid})`);
ok(r.rows?.length === 0, "only the sender can trigger push for a message");

// Match notifications
await db.exec(readFileSync(new URL("../migrations/20261018140000_match_push.sql", import.meta.url), "utf8"));
await db.exec("grant execute on all functions in schema public to authenticated;");
ok(true, "match push migration applies");
r = await as(B, `select endpoint from join_push_targets('${G1}')`);
ok(r.rows?.map((x) => x.endpoint).join() === "e-a", "B just joined: push goes to A only");
r = await as(C, `select endpoint from join_push_targets('${G1}')`);
ok(r.rows?.length === 0, "outsider can't trigger join pushes");
await db.exec(`update game_players set joined_at = now() - interval '10 minutes' where player_id = '${B}'`);
r = await as(B, `select endpoint from join_push_targets('${G1}')`);
ok(r.rows?.length === 0, "stale join can't re-trigger pushes");

console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
