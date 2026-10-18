-- A session is several games (pickleball) or sets (tennis), not one score.
-- Scores are now a list, e.g. [[11,8],[9,11],[11,6]] from the reporter's side (their team first).
-- Ratings learn from every game: TrueSkill runs once per game, in order, and the whole session
-- still moves a level by at most 0.5. A session can end level (1–1), so ties are allowed overall.
-- Also: before the start time only the host can end the game; after it, any player can.

alter table public.score_reports add column if not exists games jsonb;
alter table public.game_results add column if not exists games jsonb;

-- Drop the old "no ties" checks (a 1–1 session is fine; each game still needs a winner).
do $$ declare r record; begin
  for r in select conrelid::regclass as t, conname from pg_constraint
           where contype = 'c' and conrelid in ('public.score_reports'::regclass, 'public.game_results'::regclass)
             and pg_get_constraintdef(oid) ilike '%score_a <> score_b%'
  loop execute format('alter table %s drop constraint %I', r.t, r.conname); end loop;
end $$;

-- Validate a list of games: 1–9 games, each two whole numbers 0–99 and not tied.
create or replace function public.valid_games(p jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 9
     and not exists (
       select 1 from jsonb_array_elements(p) g
       where jsonb_typeof(g) <> 'array' or jsonb_array_length(g) <> 2
          or (g->>0) !~ '^[0-9]{1,2}$' or (g->>1) !~ '^[0-9]{1,2}$'
          or (g->>0)::int = (g->>1)::int);
$$;

-- ---------- Apply a final result (internal) ----------
drop function if exists public.apply_result(uuid, uuid[], uuid[], int, int, uuid);
create or replace function public.apply_results(p_game uuid, p_team_a uuid[], p_team_b uuid[], p_games jsonb, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.games; prm record; ids uuid[]; pid uuid; i int; n_a int; gm jsonb; res record; lvl numeric; cur record;
  mu0 double precision[] := '{}'; sg0 double precision[] := '{}'; mus double precision[]; sigs double precision[];
  wins_a int := 0; wins_b int := 0; sa int; sb int;
begin
  select * into g from public.games where id = p_game for update;
  if exists (select 1 from public.game_results where game_id = p_game) then return; end if;
  n_a := array_length(p_team_a, 1);
  ids := p_team_a || p_team_b;
  select * into prm from public.sport_params(g.sport);
  foreach pid in array ids loop
    select r.mu, r.sigma into cur from public.player_ratings r where r.player_id = pid and r.sport = g.sport;
    if found then
      mu0 := mu0 || cur.mu::double precision; sg0 := sg0 || cur.sigma::double precision;
    else
      select public.self_level(p, g.sport) into lvl from public.profiles p where p.id = pid;
      mu0 := mu0 || coalesce(lvl, 3.0)::double precision;
      sg0 := sg0 || (case when lvl is null then prm.sigma0 * 1.5 else prm.sigma0 end);
    end if;
  end loop;

  -- One TrueSkill update per game, in order.
  mus := mu0; sigs := sg0;
  for gm in select * from jsonb_array_elements(p_games) loop
    if (gm->>0)::int > (gm->>1)::int then wins_a := wins_a + 1; else wins_b := wins_b + 1; end if;
    select * into res from public.trueskill_2team(mus, sigs, n_a, (gm->>0)::int > (gm->>1)::int, prm.beta, prm.tau);
    mus := res.new_mu;
    for i in 1..array_length(ids, 1) loop sigs[i] := greatest(0.1, res.new_sigma[i]); end loop;
  end loop;
  -- The whole session moves a level by at most 0.5; then clamp to the sport's scale.
  for i in 1..array_length(ids, 1) loop
    mus[i] := least(prm.hi, greatest(prm.lo, least(mu0[i] + 0.5, greatest(mu0[i] - 0.5, mus[i]))));
    insert into public.player_ratings as r (player_id, sport, mu, sigma, games, updated_at)
    values (ids[i], g.sport, mus[i], sigs[i], 1, now())
    on conflict (player_id, sport) do update
      set mu = excluded.mu, sigma = excluded.sigma, games = r.games + 1, updated_at = now();
    insert into public.rating_history (player_id, sport, game_id, mu_before, sigma_before, mu_after, sigma_after, won)
    values (ids[i], g.sport, p_game, mu0[i], sg0[i], mus[i], sigs[i],
            case when wins_a = wins_b then null else (i <= n_a) = (wins_a > wins_b) end);
  end loop;

  -- One game: keep its points as the score. Several: the score is games won.
  if jsonb_array_length(p_games) = 1 then sa := (p_games->0->>0)::int; sb := (p_games->0->>1)::int;
  else sa := wins_a; sb := wins_b; end if;
  insert into public.game_results (game_id, sport, team_a, team_b, score_a, score_b, submitted_by, games)
  values (p_game, g.sport, p_team_a, p_team_b, sa, sb, p_by, p_games);
  if g.ended_at is null then update public.games set ended_at = now(), ended_by = p_by where id = p_game; end if;
end $$;
revoke all on function public.apply_results(uuid, uuid[], uuid[], jsonb, uuid) from public, anon, authenticated;

-- rating_history.won may now be null for a level session.
alter table public.rating_history alter column won drop not null;

-- ---------- Finalize a waiting non-host score after the host's 24 hours ----------
create or replace function public.finalize_due(p_game uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare g public.games; r public.score_reports;
begin
  select * into g from public.games where id = p_game;
  if not found or exists (select 1 from public.game_results where game_id = p_game) then return false; end if;
  if exists (select 1 from public.score_reports where game_id = p_game and reporter_id = g.host_id) then return false; end if;
  select * into r from public.score_reports
   where game_id = p_game and reporter_id <> g.host_id and created_at <= now() - interval '24 hours'
   order by created_at limit 1;
  if not found then return false; end if;
  perform public.apply_results(p_game, r.team_a, r.team_b, coalesce(r.games, jsonb_build_array(jsonb_build_array(r.score_a, r.score_b))), r.reporter_id);
  return true;
end $$;

-- ---------- Enter a score: a list of games ----------
create or replace function public.submit_results(p_game uuid, p_team_a uuid[], p_team_b uuid[], p_games jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare g public.games; roster uuid[]; ids uuid[]; n_a int; first_at timestamptz; wa int; wb int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into g from public.games where id = p_game;
  if not found or g.status = 'cancelled' then raise exception 'game_missing'; end if;
  if g.starts_at > now() and g.ended_at is null then raise exception 'not_started'; end if;
  perform public.finalize_due(p_game);
  if exists (select 1 from public.game_results where game_id = p_game) then raise exception 'already_scored'; end if;
  select array_agg(player_id) into roster from public.game_players where game_id = p_game and not no_show;
  if roster is null or not (auth.uid() = any(roster)) then raise exception 'not_in_game'; end if;
  if not public.valid_games(p_games) then raise exception 'bad_score'; end if;
  n_a := coalesce(array_length(p_team_a, 1), 0);
  if n_a not in (1, 2) or n_a <> coalesce(array_length(p_team_b, 1), 0) then raise exception 'bad_teams'; end if;
  ids := p_team_a || p_team_b;
  if (select count(distinct x) from unnest(ids) x) <> array_length(ids, 1)
     or exists (select 1 from unnest(ids) x where not (x = any(roster))) then
    raise exception 'bad_teams';
  end if;
  select count(*) filter (where (e->>0)::int > (e->>1)::int), count(*) filter (where (e->>0)::int < (e->>1)::int)
    into wa, wb from jsonb_array_elements(p_games) e;

  insert into public.score_reports as s (game_id, reporter_id, team_a, team_b, score_a, score_b, games)
  values (p_game, auth.uid(), p_team_a, p_team_b,
          case when jsonb_array_length(p_games) = 1 then (p_games->0->>0)::int else wa end,
          case when jsonb_array_length(p_games) = 1 then (p_games->0->>1)::int else wb end, p_games)
  on conflict (game_id, reporter_id) do update
    set team_a = excluded.team_a, team_b = excluded.team_b, score_a = excluded.score_a, score_b = excluded.score_b,
        games = excluded.games, updated_at = now();

  if auth.uid() = g.host_id then
    perform public.apply_results(p_game, p_team_a, p_team_b, p_games, auth.uid());
    return json_build_object('status', 'final');
  end if;
  select min(created_at) into first_at from public.score_reports where game_id = p_game and reporter_id <> g.host_id;
  return json_build_object('status', 'pending', 'deadline', first_at + interval '24 hours');
end $$;
grant execute on function public.submit_results(uuid, uuid[], uuid[], jsonb) to authenticated;

-- The old one-score call still works (one game).
create or replace function public.submit_result(p_game uuid, p_team_a uuid[], p_team_b uuid[], p_score_a int, p_score_b int)
returns json language sql security definer set search_path = public as $$
  select public.submit_results(p_game, p_team_a, p_team_b, jsonb_build_array(jsonb_build_array(p_score_a, p_score_b)));
$$;

-- ---------- Ending a game: host only before the start time ----------
create or replace function public.end_game(p_game uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into g from public.games where id = p_game for update;
  if not found or g.status = 'cancelled' then raise exception 'game_missing'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game and player_id = auth.uid()) then raise exception 'not_in_game'; end if;
  if g.starts_at > now() and auth.uid() <> g.host_id then raise exception 'host_only'; end if;
  if g.ended_at is null then
    update public.games set ended_at = now(), ended_by = auth.uid() where id = p_game;
    return now();
  end if;
  return g.ended_at;
end $$;

-- ---------- Activities return the list of games too ----------
drop function if exists public.player_activities(uuid, int, timestamptz);
create function public.player_activities(p_user uuid, p_limit int default 20, p_before timestamptz default null)
returns table (
  game_id uuid, sport text, slots int, court_name text, town text,
  starts_at timestamptz, ended_at timestamptz, minutes int,
  team_a uuid[], team_b uuid[], score_a int, score_b int,
  won boolean, level_before numeric, level_after numeric, players json,
  visibility text, effective_visibility text, games jsonb
)
language sql stable security definer set search_path = public as $$
  select g.id, g.sport, g.slots, c.name, c.town,
    g.starts_at, coalesce(g.ended_at, r.created_at),
    case when coalesce(g.ended_at, r.created_at) is not null
              and extract(epoch from coalesce(g.ended_at, r.created_at) - g.starts_at) between 600 and 18000
         then (extract(epoch from coalesce(g.ended_at, r.created_at) - g.starts_at) / 60)::int
         else g.fee_minutes end,
    r.team_a, r.team_b, r.score_a, r.score_b,
    case when r.game_id is null or r.score_a = r.score_b then null
         when p_user = any(r.team_a) then r.score_a > r.score_b
         else r.score_b > r.score_a end,
    h.mu_before, h.mu_after,
    (select json_agg(json_build_object('id', pp.id, 'name', pp.display_name, 'avatar_url', pp.avatar_url) order by x.joined_at)
       from public.game_players x join public.profiles pp on pp.id = x.player_id
      where x.game_id = g.id and not x.no_show),
    case when auth.uid() = p_user then me.visibility else null end,
    case when auth.uid() = p_user then coalesce(me.visibility, (select activity_visibility from public.profiles where id = p_user)) else null end,
    coalesce(r.games, case when r.game_id is not null then jsonb_build_array(jsonb_build_array(r.score_a, r.score_b)) end)
  from public.game_players me
  join public.games g on g.id = me.game_id and g.status <> 'cancelled'
  join public.courts c on c.id = g.court_id
  left join public.game_results r on r.game_id = g.id
  left join public.rating_history h on h.game_id = g.id and h.player_id = p_user
  where me.player_id = p_user and not me.no_show
    and (g.ended_at is not null or r.game_id is not null)
    and public.can_see_activity(p_user, me.visibility)
    and (p_before is null or g.starts_at < p_before)
  order by g.starts_at desc
  limit least(coalesce(p_limit, 20), 50);
$$;
grant execute on function public.player_activities(uuid, int, timestamptz) to anon, authenticated;
