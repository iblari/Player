-- Safe to re-run: drop every existing version of the functions this file recreates,
-- whatever arguments they were created with (a partial earlier run may have left new ones).
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = any(array['create_game', 'games_for_me', 'fill_supply'])
  loop execute 'drop function ' || r.sig; end loop;
end $$;

-- Multi-sport games + skill ratings that learn from results.
--
-- Model (see docs/DATA_MODEL.md):
--   * Every game has a sport. Matching uses the player's level IN THAT SPORT.
--   * A player's level starts as their self-rating (the prior) and is updated after
--     each scored game with a two-team TrueSkill update (mu = level, sigma = uncertainty).
--   * Post-game, players also say whether each other player was below / even / above
--     their level, and whether they'd play with the group again. Stored now, used
--     later to catch inflated self-ratings and to rank games by chemistry.

-- ---------- Sport on games ----------
alter table public.games add column if not exists sport text not null default 'pickleball';
do $$ begin
  alter table public.games add constraint games_sport_check check (sport in ('pickleball', 'tennis'));
exception when duplicate_object then null; end $$;

-- Per-sport rating scale and TrueSkill parameters.
--   pickleball: DUPR-style 2.0-8.0   tennis: NTRP-style 1.5-7.0
--   sigma0: uncertainty of a self-rating; beta: level gap that gives ~76% win odds;
--   tau: drift added each game so ratings keep moving as people improve.
create or replace function public.sport_params(p_sport text,
  out lo double precision, out hi double precision, out sigma0 double precision,
  out beta double precision, out tau double precision)
language sql immutable as $$
  select case p_sport when 'tennis' then 1.5 else 2.0 end,
         case p_sport when 'tennis' then 7.0 else 8.0 end,
         0.8, 0.4, 0.02;
$$;

-- ---------- Ratings ----------
create table if not exists public.player_ratings (
  player_id uuid not null references public.profiles on delete cascade,
  sport text not null check (sport in ('pickleball', 'tennis')),
  mu numeric(5,3) not null,
  sigma numeric(5,3) not null,
  games int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_id, sport)
);

create table if not exists public.game_results (
  game_id uuid primary key references public.games on delete cascade,
  sport text not null,
  team_a uuid[] not null,
  team_b uuid[] not null,
  score_a int not null check (score_a between 0 and 99),
  score_b int not null check (score_b between 0 and 99),
  submitted_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  check (score_a <> score_b)
);

create table if not exists public.rating_history (
  id bigserial primary key,
  player_id uuid not null references public.profiles on delete cascade,
  sport text not null,
  game_id uuid not null references public.games on delete cascade,
  mu_before numeric(5,3) not null,
  sigma_before numeric(5,3) not null,
  mu_after numeric(5,3) not null,
  sigma_after numeric(5,3) not null,
  won boolean not null,
  created_at timestamptz not null default now(),
  unique (player_id, game_id)
);
create index if not exists rating_history_player_idx on public.rating_history (player_id, sport, created_at);

-- verdict: how the ratee played relative to the rater's own level (-1 below, 0 even, 1 above)
create table if not exists public.level_feedback (
  game_id uuid not null references public.games on delete cascade,
  rater_id uuid not null references public.profiles on delete cascade,
  ratee_id uuid not null references public.profiles on delete cascade,
  verdict smallint not null check (verdict in (-1, 0, 1)),
  created_at timestamptz not null default now(),
  primary key (game_id, rater_id, ratee_id),
  check (rater_id <> ratee_id)
);

create table if not exists public.play_again (
  game_id uuid not null references public.games on delete cascade,
  rater_id uuid not null references public.profiles on delete cascade,
  answer boolean not null,
  created_at timestamptz not null default now(),
  primary key (game_id, rater_id)
);

alter table public.player_ratings enable row level security;
alter table public.game_results enable row level security;
alter table public.rating_history enable row level security;
alter table public.level_feedback enable row level security;
alter table public.play_again enable row level security;

-- Ratings and results are public to signed-in players; writes only go through the functions below.
drop policy if exists "ratings readable" on public.player_ratings;
create policy "ratings readable" on public.player_ratings for select to authenticated using (true);
drop policy if exists "results readable" on public.game_results;
create policy "results readable" on public.game_results for select to authenticated using (true);
drop policy if exists "history readable" on public.rating_history;
create policy "history readable" on public.rating_history for select to authenticated using (true);
-- Nobody sees who called them "below"; you only see what you said.
drop policy if exists "own feedback" on public.level_feedback;
create policy "own feedback" on public.level_feedback for select to authenticated using (rater_id = auth.uid());
drop policy if exists "own play again" on public.play_again;
create policy "own play again" on public.play_again for select to authenticated using (rater_id = auth.uid());

-- ---------- Levels ----------
-- Self-rating converted to the sport's scale (the prior before any scored games).
-- Pickleball keeps using profiles.skill (already synced from the 1-10 self-rating).
create or replace function public.self_level(p public.profiles, p_sport text)
returns numeric language sql immutable as $$
  select case
    when p_sport = 'pickleball' then p.skill
    when p_sport = 'tennis' and p.sports ? 'tennis'
      then round((1.5 + ((p.sports ->> 'tennis')::numeric - 1) * 5.0 / 9) * 4) / 4
    else null
  end;
$$;

-- The level used for matching: learned rating once a player has scored games, else self-rating.
-- Null means the player doesn't play that sport.
create or replace function public.player_level(p_player uuid, p_sport text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select r.mu from public.player_ratings r where r.player_id = p_player and r.sport = p_sport and r.games > 0),
    (select public.self_level(p, p_sport) from public.profiles p where p.id = p_player));
$$;

create or replace function public.player_levels(p_ids uuid[], p_sport text)
returns table (player_id uuid, level numeric, games int)
language sql stable security definer set search_path = public as $$
  select x, public.player_level(x, p_sport),
    coalesce((select r.games from public.player_ratings r where r.player_id = x and r.sport = p_sport), 0)
  from unnest(p_ids) x;
$$;

create or replace function public.my_ratings()
returns table (sport text, level numeric, sigma numeric, games int)
language sql stable security definer set search_path = public as $$
  select s, public.player_level(auth.uid(), s),
    coalesce(r.sigma, (public.sport_params(s)).sigma0::numeric), coalesce(r.games, 0)
  from unnest(array['pickleball', 'tennis']) s
  left join public.player_ratings r on r.player_id = auth.uid() and r.sport = s
  where public.player_level(auth.uid(), s) is not null;
$$;

-- ---------- TrueSkill math ----------
create or replace function public.norm_pdf(x double precision)
returns double precision language sql immutable as $$
  select exp(-x * x / 2) / sqrt(2 * pi());
$$;

-- Standard normal CDF via erf (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7).
create or replace function public.norm_cdf(x double precision)
returns double precision language plpgsql immutable as $$
declare z double precision := abs(x) / sqrt(2); t double precision; e double precision;
begin
  t := 1 / (1 + 0.3275911 * z);
  e := 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-z * z);
  return case when x >= 0 then 0.5 * (1 + e) else 0.5 * (1 - e) end;
end $$;

-- Two-team TrueSkill update, no draws. Players 1..n_a are team A, the rest team B.
-- Exact for two teams (no factor-graph iteration needed).
create or replace function public.trueskill_2team(mu double precision[], sigma double precision[], n_a int,
  a_won boolean, beta double precision, tau double precision,
  out new_mu double precision[], out new_sigma double precision[])
language plpgsql immutable as $$
declare
  n int := array_length(mu, 1); i int;
  s2 double precision[]; c2 double precision := 0; c double precision;
  mu_a double precision := 0; mu_b double precision := 0;
  t double precision; v double precision; w double precision; p double precision; dir double precision;
begin
  for i in 1..n loop
    s2[i] := sigma[i] ^ 2 + tau ^ 2;
    c2 := c2 + s2[i];
    if i <= n_a then mu_a := mu_a + mu[i]; else mu_b := mu_b + mu[i]; end if;
  end loop;
  c2 := c2 + n * beta ^ 2;
  c := sqrt(c2);
  t := (case when a_won then mu_a - mu_b else mu_b - mu_a end) / c;
  p := public.norm_cdf(t);
  if p < 1e-9 then v := -t; w := 1;  -- huge upset: asymptotic limit
  else v := public.norm_pdf(t) / p; w := v * (v + t);
  end if;
  for i in 1..n loop
    dir := case when (i <= n_a) = a_won then 1 else -1 end;
    new_mu[i] := mu[i] + dir * s2[i] / c * v;
    new_sigma[i] := sqrt(greatest(s2[i] * (1 - s2[i] / c2 * w), 1e-6));
  end loop;
end $$;

-- ---------- Post-game ----------
-- Any player in the game records the score once. Ratings update atomically.
create or replace function public.submit_result(p_game uuid, p_team_a uuid[], p_team_b uuid[], p_score_a int, p_score_b int)
returns json language plpgsql security definer set search_path = public as $$
declare
  g public.games; prm record; roster uuid[]; ids uuid[]; pid uuid; i int; n_a int; a_won boolean;
  mus double precision[] := '{}'; sigs double precision[] := '{}'; cur record; res record; lvl numeric; nm double precision[];
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into g from public.games where id = p_game for update;
  if not found or g.status = 'cancelled' then raise exception 'game_missing'; end if;
  if g.starts_at > now() then raise exception 'not_started'; end if;
  if exists (select 1 from public.game_results where game_id = p_game) then raise exception 'already_scored'; end if;
  select array_agg(player_id) into roster from public.game_players where game_id = p_game and not no_show;
  if roster is null or not (auth.uid() = any(roster)) then raise exception 'not_in_game'; end if;
  if p_score_a is null or p_score_b is null or p_score_a = p_score_b then raise exception 'bad_score'; end if;
  n_a := coalesce(array_length(p_team_a, 1), 0);
  if n_a not in (1, 2) or n_a <> coalesce(array_length(p_team_b, 1), 0) then raise exception 'bad_teams'; end if;
  ids := p_team_a || p_team_b;
  if (select count(distinct x) from unnest(ids) x) <> array_length(ids, 1)
     or exists (select 1 from unnest(ids) x where not (x = any(roster))) then
    raise exception 'bad_teams';
  end if;

  select * into prm from public.sport_params(g.sport);
  foreach pid in array ids loop
    select r.mu, r.sigma into cur from public.player_ratings r where r.player_id = pid and r.sport = g.sport;
    if found then
      mus := mus || cur.mu::double precision;
      sigs := sigs || cur.sigma::double precision;
    else
      select public.self_level(p, g.sport) into lvl from public.profiles p where p.id = pid;
      mus := mus || coalesce(lvl, 3.0)::double precision;
      sigs := sigs || (case when lvl is null then prm.sigma0 * 1.5 else prm.sigma0 end);
    end if;
  end loop;

  a_won := p_score_a > p_score_b;
  select * into res from public.trueskill_2team(mus, sigs, n_a, a_won, prm.beta, prm.tau);
  nm := res.new_mu;

  -- Guardrail: one game moves a level by at most 0.5, so a single fluke (or a sandbagged
  -- new account) can't swing a rating wildly. Then clamp to the sport's scale.
  for i in 1..array_length(ids, 1) loop
    nm[i] := least(prm.hi, greatest(prm.lo, least(mus[i] + 0.5, greatest(mus[i] - 0.5, nm[i]))));
  end loop;

  for i in 1..array_length(ids, 1) loop
    insert into public.player_ratings as r (player_id, sport, mu, sigma, games, updated_at)
    values (ids[i], g.sport, nm[i], greatest(0.1, res.new_sigma[i]), 1, now())
    on conflict (player_id, sport) do update
      set mu = excluded.mu, sigma = excluded.sigma, games = r.games + 1, updated_at = now();
    insert into public.rating_history (player_id, sport, game_id, mu_before, sigma_before, mu_after, sigma_after, won)
    values (ids[i], g.sport, p_game, mus[i], sigs[i],
            nm[i], greatest(0.1, res.new_sigma[i]), (i <= n_a) = a_won);
  end loop;

  insert into public.game_results (game_id, sport, team_a, team_b, score_a, score_b, submitted_by)
  values (p_game, g.sport, p_team_a, p_team_b, p_score_a, p_score_b, auth.uid());

  return (select json_agg(json_build_object('player_id', h.player_id, 'before', h.mu_before, 'after', h.mu_after, 'won', h.won))
          from public.rating_history h where h.game_id = p_game);
end $$;

-- Level verdicts on the other players ({"<player uuid>": -1|0|1}) and "play again?".
create or replace function public.submit_feedback(p_game uuid, p_verdicts jsonb, p_play_again boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v text;
begin
  if not exists (select 1 from public.game_players where game_id = p_game and player_id = auth.uid()) then
    raise exception 'not_in_game';
  end if;
  for k, v in select * from jsonb_each_text(coalesce(p_verdicts, '{}'::jsonb)) loop
    if k::uuid <> auth.uid()
       and v in ('-1', '0', '1')
       and exists (select 1 from public.game_players where game_id = p_game and player_id = k::uuid) then
      insert into public.level_feedback (game_id, rater_id, ratee_id, verdict)
      values (p_game, auth.uid(), k::uuid, v::smallint)
      on conflict (game_id, rater_id, ratee_id) do update set verdict = excluded.verdict, created_at = now();
    end if;
  end loop;
  if p_play_again is not null then
    insert into public.play_again (game_id, rater_id, answer) values (p_game, auth.uid(), p_play_again)
    on conflict (game_id, rater_id) do update set answer = excluded.answer, created_at = now();
  end if;
end $$;

-- ---------- Matching now uses the level in the game's sport ----------
drop function if exists public.create_game(uuid, int, numeric, numeric, timestamptz, text, boolean);
create function public.create_game(p_court uuid, p_slots int, p_min numeric, p_max numeric,
  p_starts timestamptz, p_note text default null, p_confirmed boolean default false, p_sport text default 'pickleball')
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; c public.courts; my_clubs text[];
begin
  if auth.uid() is null then raise exception 'Sign in to host a game'; end if;
  if p_sport not in ('pickleball', 'tennis') then raise exception 'Pick a sport'; end if;
  -- Lock the host's profile row so two quick taps can't create two games.
  select clubs into my_clubs from public.profiles where id = auth.uid() for update;
  if exists (select 1 from public.active_hosted_game()) then raise exception 'already_hosting'; end if;
  if p_starts < now() - interval '5 minutes' then raise exception 'That start time has passed'; end if;
  select * into c from public.courts where id = p_court;
  if not found then raise exception 'That court no longer exists'; end if;
  if c.members_only then
    if c.club is not null and not (c.club = any(coalesce(my_clubs, '{}'))) then raise exception 'needs_membership'; end if;
    if c.club is null and not p_confirmed then raise exception 'needs_membership'; end if;
  end if;
  insert into public.games (host_id, court_id, slots, skill_min, skill_max, starts_at, expires_at, note, members_only, club, sport)
  values (auth.uid(), p_court, p_slots, p_min, p_max, p_starts,
          greatest(p_starts, now() + interval '30 minutes'), nullif(trim(p_note), ''), c.members_only, c.club, p_sport)
  returning id into gid;
  insert into public.game_players (game_id, player_id) values (gid, auth.uid());
  return gid;
end $$;

drop function if exists public.games_for_me();
create function public.games_for_me()
returns table (id uuid, court_id uuid, court_name text, distance_mi double precision, slots int,
  skill_min numeric, skill_max numeric, starts_at timestamptz, expires_at timestamptz, host_id uuid,
  note text, player_ids uuid[], members_only boolean, club text, sport text)
language sql stable security definer set search_path = public, extensions as $$
  with me as (select * from public.profiles where id = auth.uid())
  select g.id, c.id, c.name, st_distance(c.location, me.location) / 1609.34, g.slots,
    g.skill_min, g.skill_max, g.starts_at, g.expires_at, g.host_id, g.note,
    array(select gp.player_id from public.game_players gp where gp.game_id = g.id order by gp.joined_at),
    g.members_only, g.club, g.sport
  from public.games g join public.courts c on c.id = g.court_id, me
  where g.status = 'open' and g.expires_at > now()
    and me.location is not null
    and st_dwithin(c.location, me.location, me.radius_mi * 1609.34)
    and public.player_level(me.id, g.sport) between g.skill_min and g.skill_max
    and (not g.members_only or g.club is null or g.club = any(me.clubs))
    and not exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.player_id = me.id)
    and not exists (select 1 from public.game_passes gp where gp.game_id = g.id and gp.player_id = me.id)
  order by g.starts_at
  limit 50;
$$;

create or replace function public.push_targets(p_game uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public, extensions as $$
  select s.endpoint, s.p256dh, s.auth
  from public.games g join public.courts c on c.id = g.court_id
  join public.profiles p on p.available_until > now() and p.location is not null
    and p.id <> g.host_id
    and public.player_level(p.id, g.sport) between g.skill_min and g.skill_max
    and st_dwithin(p.location, c.location, p.radius_mi * 1609.34)
    and (not g.members_only or g.club is null or g.club = any(p.clubs))
  join public.push_subscriptions s on s.user_id = p.id
  where g.id = p_game and g.host_id = auth.uid() and g.created_at > now() - interval '10 minutes'
  limit 200;
$$;

drop function if exists public.fill_supply(uuid, numeric, numeric);
create function public.fill_supply(p_court uuid, p_min numeric, p_max numeric, p_sport text default 'pickleball')
returns table (available int, nearby int)
language sql stable security definer set search_path = public, extensions as $$
  select
    count(*) filter (where p.available_until > now())::int,
    count(*) filter (where p.available_until is null or p.available_until <= now())::int
  from public.profiles p, public.courts c
  where c.id = p_court and p.id <> auth.uid() and p.location is not null
    and public.player_level(p.id, p_sport) between p_min and p_max
    and (not c.members_only or c.club is null or c.club = any(p.clubs))
    and st_dwithin(p.location, c.location, p.radius_mi * 1609.34);
$$;
