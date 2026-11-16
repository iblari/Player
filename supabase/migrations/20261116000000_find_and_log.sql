-- Find players by name, and log a match you played outside the app.
--
-- Search: by display name (2+ letters). Players you've played with always show; everyone else
-- only if they leave "Show me in search" on. With no search text it suggests people you've played
-- with and people who follow you.
--
-- Logged matches: the person logging enters who played, where, when and the score. It does NOT
-- count yet: someone on the other side must confirm it (or enter a different score, which leaves it
-- disputed until they agree). Any other player can say it didn't happen, which removes it.
-- This stops anyone logging fake wins to pump their rating.
-- Safe to run more than once.

alter table public.profiles add column if not exists discoverable boolean not null default true;
alter table public.games add column if not exists logged boolean not null default false;

-- ---------- Search ----------
create or replace function public.search_players(p_q text default '', p_limit int default 20)
returns table (id uuid, display_name text, avatar_url text, sports jsonb, following boolean, follows_me boolean, played_with int)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  q as (select lower(regexp_replace(trim(coalesce(p_q, '')), '[%_\\]', '', 'g')) as s),
  played as (
    select gp2.player_id as pid, count(distinct g.id)::int as n
    from public.game_players gp1
    join public.games g on g.id = gp1.game_id and g.status <> 'cancelled'
    join public.game_players gp2 on gp2.game_id = gp1.game_id and gp2.player_id <> gp1.player_id
    where gp1.player_id = (select uid from me)
    group by 1
  )
  select p.id, p.display_name, p.avatar_url, p.sports,
    exists (select 1 from public.follows f where f.follower_id = me.uid and f.followee_id = p.id),
    exists (select 1 from public.follows f where f.follower_id = p.id and f.followee_id = me.uid),
    coalesce(pl.n, 0)
  from public.profiles p
  cross join me cross join q
  left join played pl on pl.pid = p.id
  where me.uid is not null and p.id <> me.uid and char_length(p.display_name) > 0
    and case
      when char_length(q.s) >= 2 then
        (p.discoverable or pl.pid is not null) and lower(p.display_name) like '%' || q.s || '%'
      else
        pl.pid is not null
        or exists (select 1 from public.follows f where f.follower_id = p.id and f.followee_id = me.uid
                   and not exists (select 1 from public.follows b where b.follower_id = me.uid and b.followee_id = p.id))
    end
  order by (pl.pid is not null) desc,
           (char_length(q.s) >= 2 and lower(p.display_name) like q.s || '%') desc,
           coalesce(pl.n, 0) desc, p.display_name
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke all on function public.search_players(text, int) from public, anon;
grant execute on function public.search_players(text, int) to authenticated;

-- ---------- Log a match ----------
-- The logger is always on team A. Returns the new game's id.
create or replace function public.log_match(p_court uuid, p_sport text, p_started_at timestamptz, p_minutes int,
  p_team_a uuid[], p_team_b uuid[], p_games jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); gid uuid; ids uuid[]; n int; wa int; wb int;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p_sport not in ('pickleball', 'tennis') then raise exception 'bad_sport'; end if;
  n := coalesce(array_length(p_team_a, 1), 0);
  if n not in (1, 2) or n <> coalesce(array_length(p_team_b, 1), 0) or not (me = any(p_team_a)) then raise exception 'bad_teams'; end if;
  ids := p_team_a || p_team_b;
  if (select count(distinct x) from unnest(ids) x) <> array_length(ids, 1)
     or (select count(*) from public.profiles where id = any(ids)) <> array_length(ids, 1) then
    raise exception 'bad_teams';
  end if;
  if not public.valid_games(p_games) then raise exception 'bad_score'; end if;
  if p_started_at is null or p_started_at > now() + interval '15 minutes' then raise exception 'in_future'; end if;
  if p_started_at < now() - interval '30 days' then raise exception 'too_old'; end if;
  if p_minutes is not null and p_minutes not between 10 and 600 then raise exception 'bad_minutes'; end if;
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'no_court'; end if;
  if (select count(*) from public.games where host_id = me and logged and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many';
  end if;

  -- They played this sport here, so the court hosts it.
  update public.courts set sports = array_append(sports, p_sport) where id = p_court and not (p_sport = any(sports));

  insert into public.games (host_id, court_id, slots, skill_min, skill_max, starts_at, expires_at, status, sport,
                            logged, ended_at, ended_by, filled_at, attendance_done)
  values (me, p_court, n * 2, 1, 8, p_started_at, p_started_at, 'full', p_sport,
          true, p_started_at + make_interval(mins => coalesce(p_minutes, 60)), me, now(), true)
  returning id into gid;
  insert into public.game_players (game_id, player_id) select gid, x from unnest(ids) x;

  select count(*) filter (where (e->>0)::int > (e->>1)::int), count(*) filter (where (e->>0)::int < (e->>1)::int)
    into wa, wb from jsonb_array_elements(p_games) e;
  insert into public.score_reports (game_id, reporter_id, team_a, team_b, score_a, score_b, games)
  values (gid, me, p_team_a, p_team_b,
          case when jsonb_array_length(p_games) = 1 then (p_games->0->>0)::int else wa end,
          case when jsonb_array_length(p_games) = 1 then (p_games->0->>1)::int else wb end, p_games);
  return gid;
end $$;
revoke all on function public.log_match(uuid, text, timestamptz, int, uuid[], uuid[], jsonb) from public, anon;
grant execute on function public.log_match(uuid, text, timestamptz, int, uuid[], uuid[], jsonb) to authenticated;

-- Same result from either side? (Reports are stored from the reporter's side.)
create or replace function public.same_result(a_team_a uuid[], a_games jsonb, b_team_a uuid[], b_team_b uuid[], b_games jsonb)
returns boolean language sql immutable as $$
  select case
    when (select array_agg(x order by x) from unnest(a_team_a) x) = (select array_agg(x order by x) from unnest(b_team_a) x) then a_games = b_games
    when (select array_agg(x order by x) from unnest(a_team_a) x) = (select array_agg(x order by x) from unnest(b_team_b) x) then
      a_games = (select jsonb_agg(jsonb_build_array(e->1, e->0) order by i) from jsonb_array_elements(b_games) with ordinality t(e, i))
    else false end;
$$;

-- ---------- Entering a score, now aware of logged matches ----------
create or replace function public.submit_results(p_game uuid, p_team_a uuid[], p_team_b uuid[], p_games jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare g public.games; roster uuid[]; ids uuid[]; n_a int; first_at timestamptz; wa int; wb int; h public.score_reports;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into g from public.games where id = p_game;
  if not found or g.status = 'cancelled' then raise exception 'game_missing'; end if;
  if g.starts_at > now() and g.ended_at is null then raise exception 'not_started'; end if;
  if not g.logged then perform public.finalize_due(p_game); end if;
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

  if g.logged then
    -- A logged match only counts once someone on the other side agrees with the logger.
    select * into h from public.score_reports where game_id = p_game and reporter_id = g.host_id;
    if auth.uid() <> g.host_id and not (auth.uid() = any(h.team_a))
       and public.same_result(h.team_a, h.games, p_team_a, p_team_b, p_games) then
      perform public.apply_results(p_game, h.team_a, h.team_b, h.games, auth.uid());
      return json_build_object('status', 'final');
    end if;
    if auth.uid() = g.host_id then
      -- The logger fixed their score: it now matches an opponent's? Then it's agreed.
      if exists (select 1 from public.score_reports o where o.game_id = p_game and o.reporter_id <> g.host_id
                 and not (o.reporter_id = any(p_team_a))
                 and public.same_result(p_team_a, p_games, o.team_a, o.team_b, o.games)) then
        perform public.apply_results(p_game, p_team_a, p_team_b, p_games, auth.uid());
        return json_build_object('status', 'final');
      end if;
      return json_build_object('status', 'awaiting_confirm');
    end if;
    -- The logger's own partner can't confirm for the other side.
    if auth.uid() = any(h.team_a) then return json_build_object('status', 'awaiting_confirm'); end if;
    return json_build_object('status', 'disputed');
  end if;

  if auth.uid() = g.host_id then
    perform public.apply_results(p_game, p_team_a, p_team_b, p_games, auth.uid());
    return json_build_object('status', 'final');
  end if;
  select min(created_at) into first_at from public.score_reports where game_id = p_game and reporter_id <> g.host_id;
  return json_build_object('status', 'pending', 'deadline', first_at + interval '24 hours');
end $$;
grant execute on function public.submit_results(uuid, uuid[], uuid[], jsonb) to authenticated;

-- The 24-hour "non-host score wins" rule never applies to logged matches.
create or replace function public.finalize_due(p_game uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare g public.games; r public.score_reports;
begin
  select * into g from public.games where id = p_game;
  if not found or g.logged or exists (select 1 from public.game_results where game_id = p_game) then return false; end if;
  if exists (select 1 from public.score_reports where game_id = p_game and reporter_id = g.host_id) then return false; end if;
  select * into r from public.score_reports
   where game_id = p_game and reporter_id <> g.host_id and created_at <= now() - interval '24 hours'
   order by created_at limit 1;
  if not found then return false; end if;
  perform public.apply_results(p_game, r.team_a, r.team_b, coalesce(r.games, jsonb_build_array(jsonb_build_array(r.score_a, r.score_b))), r.reporter_id);
  return true;
end $$;

-- "This didn't happen": any player can remove an unconfirmed logged match (the logger too).
create or replace function public.reject_logged(p_game uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  select * into g from public.games where id = p_game;
  if not found or not g.logged then raise exception 'not_logged'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game and player_id = auth.uid()) then raise exception 'not_in_game'; end if;
  if exists (select 1 from public.game_results where game_id = p_game) then raise exception 'already_scored'; end if;
  update public.games set status = 'cancelled' where id = p_game;
end $$;
revoke all on function public.reject_logged(uuid) from public, anon;
grant execute on function public.reject_logged(uuid) to authenticated;

-- Push targets: the other players, right after the logger logs it.
create or replace function public.logged_push_targets(p_game uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth
  from public.games g
  join public.game_players gp on gp.game_id = g.id and gp.player_id <> g.host_id
  join public.push_subscriptions s on s.user_id = gp.player_id
  where g.id = p_game and g.logged and g.host_id = auth.uid() and g.created_at > now() - interval '10 minutes'
  limit 20;
$$;
grant execute on function public.logged_push_targets(uuid) to authenticated;

-- ---------- Activities: say which ones are logged ----------
do $$ declare r record; begin
  for r in select oid::regprocedure as f from pg_proc where proname = 'player_activities' and pronamespace = 'public'::regnamespace
  loop execute 'drop function ' || r.f; end loop;
end $$;
create function public.player_activities(p_user uuid, p_limit int default 20, p_before timestamptz default null)
returns table (
  game_id uuid, sport text, slots int, court_name text, town text,
  starts_at timestamptz, ended_at timestamptz, minutes int,
  team_a uuid[], team_b uuid[], score_a int, score_b int,
  won boolean, level_before numeric, level_after numeric, players json,
  visibility text, effective_visibility text, games jsonb, logged boolean
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
    coalesce(r.games, case when r.game_id is not null then jsonb_build_array(jsonb_build_array(r.score_a, r.score_b)) end),
    g.logged
  from public.game_players me
  join public.games g on g.id = me.game_id and g.status <> 'cancelled'
  join public.courts c on c.id = g.court_id
  left join public.game_results r on r.game_id = g.id
  left join public.rating_history h on h.game_id = g.id and h.player_id = p_user
  where me.player_id = p_user and not me.no_show
    and (g.ended_at is not null or r.game_id is not null)
    -- Unconfirmed logged matches are visible only to the people in them.
    and (not g.logged or r.game_id is not null or exists (select 1 from public.game_players z where z.game_id = g.id and z.player_id = auth.uid()))
    and public.can_see_activity(p_user, me.visibility)
    and (p_before is null or g.starts_at < p_before)
  order by g.starts_at desc
  limit least(coalesce(p_limit, 20), 50);
$$;
grant execute on function public.player_activities(uuid, int, timestamptz) to anon, authenticated;
