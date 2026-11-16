-- Log a match with someone who isn't on Players Club yet.
-- The logger types their name; we make a private link for each such person. When they open it and
-- sign up, they join the match, and the usual "Is this right?" confirmation takes over (it counts
-- once someone on the other side agrees). Links last 30 days. Safe to run more than once.

create table if not exists public.game_invites (
  token text primary key,
  game_id uuid not null references public.games on delete cascade,
  team text not null check (team in ('a', 'b')),
  guest_name text not null check (char_length(guest_name) between 1 and 40),
  created_by uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  claimed_by uuid references public.profiles on delete set null,
  claimed_at timestamptz
);
create index if not exists game_invites_game_idx on public.game_invites (game_id);
alter table public.game_invites enable row level security;
drop policy if exists "invites read by players" on public.game_invites;
create policy "invites read by players" on public.game_invites for select to authenticated
  using (exists (select 1 from public.game_players gp where gp.game_id = game_invites.game_id and gp.player_id = auth.uid()));

-- The logger's score, held until everyone invited has joined (it needs everyone's account).
create table if not exists public.logged_pending (
  game_id uuid primary key references public.games on delete cascade,
  games jsonb not null,
  team_a uuid[] not null,   -- people already on the app, by side
  team_b uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.logged_pending enable row level security;
-- No policies: only the functions below touch it.

-- Players can see the held score of their own match.
create or replace function public.pending_games(p_game uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select lp.games from public.logged_pending lp
  where lp.game_id = p_game and exists (select 1 from public.game_players gp where gp.game_id = p_game and gp.player_id = auth.uid());
$$;
grant execute on function public.pending_games(uuid) to authenticated;

-- Log a match where some players are invited by name. p_team_a/p_team_b hold the people already on
-- the app (the logger in team A); p_guests is [{"team":"a"|"b","name":"Sam"}]. Returns the game id.
create or replace function public.log_match(p_court uuid, p_sport text, p_started_at timestamptz, p_minutes int,
  p_team_a uuid[], p_team_b uuid[], p_games jsonb, p_guests jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); gid uuid; ids uuid[]; na int; nb int; ga int; gb int; g jsonb; wa int; wb int;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p_sport not in ('pickleball', 'tennis') then raise exception 'bad_sport'; end if;
  if jsonb_typeof(p_guests) <> 'array' or jsonb_array_length(p_guests) > 3 then raise exception 'bad_guests'; end if;
  if exists (select 1 from jsonb_array_elements(p_guests) x
             where x->>'team' not in ('a', 'b') or char_length(trim(coalesce(x->>'name', ''))) not between 1 and 40) then
    raise exception 'bad_guests';
  end if;
  na := coalesce(array_length(p_team_a, 1), 0);
  nb := coalesce(array_length(p_team_b, 1), 0);
  select count(*) filter (where x->>'team' = 'a'), count(*) filter (where x->>'team' = 'b') into ga, gb from jsonb_array_elements(p_guests) x;
  if (na + ga) not in (1, 2) or (na + ga) <> (nb + gb) or not (me = any(p_team_a)) then raise exception 'bad_teams'; end if;
  ids := p_team_a || coalesce(p_team_b, '{}');
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

  update public.courts set sports = array_append(sports, p_sport) where id = p_court and not (p_sport = any(sports));
  insert into public.games (host_id, court_id, slots, skill_min, skill_max, starts_at, expires_at, status, sport,
                            logged, ended_at, ended_by, filled_at, attendance_done)
  values (me, p_court, (na + ga) * 2, 1, 8, p_started_at, p_started_at, 'full', p_sport,
          true, p_started_at + make_interval(mins => coalesce(p_minutes, 60)), me, now(), true)
  returning id into gid;
  insert into public.game_players (game_id, player_id) select gid, x from unnest(ids) x;

  if jsonb_array_length(p_guests) = 0 then
    select count(*) filter (where (e->>0)::int > (e->>1)::int), count(*) filter (where (e->>0)::int < (e->>1)::int)
      into wa, wb from jsonb_array_elements(p_games) e;
    insert into public.score_reports (game_id, reporter_id, team_a, team_b, score_a, score_b, games)
    values (gid, me, p_team_a, p_team_b,
            case when jsonb_array_length(p_games) = 1 then (p_games->0->>0)::int else wa end,
            case when jsonb_array_length(p_games) = 1 then (p_games->0->>1)::int else wb end, p_games);
  else
    insert into public.logged_pending (game_id, games, team_a, team_b) values (gid, p_games, p_team_a, coalesce(p_team_b, '{}'));
    for g in select * from jsonb_array_elements(p_guests) loop
      insert into public.game_invites (token, game_id, team, guest_name, created_by)
      values (replace(gen_random_uuid()::text, '-', ''), gid, g->>'team', trim(g->>'name'), me);
    end loop;
  end if;
  return gid;
end $$;
revoke all on function public.log_match(uuid, text, timestamptz, int, uuid[], uuid[], jsonb, jsonb) from public, anon;
grant execute on function public.log_match(uuid, text, timestamptz, int, uuid[], uuid[], jsonb, jsonb) to authenticated;

-- What the link shows before sign-up. Anyone holding the link can see it (the token is the secret).
create or replace function public.invite_info(p_token text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'game_id', g.id, 'sport', g.sport, 'slots', g.slots, 'starts_at', g.starts_at, 'ended_at', g.ended_at,
    'court', c.name, 'town', c.town, 'logger', p.display_name, 'logger_avatar', p.avatar_url,
    'guest_name', i.guest_name, 'team', i.team,
    'games', lp.games,   -- the logger's side first; null once everyone has joined
    'claimed', i.claimed_by is not null,
    'expired', i.created_at < now() - interval '30 days' or g.status = 'cancelled',
    -- Names on each side: people on the app, then people invited by name.
    'side_a', coalesce((select json_agg(x.display_name order by x.id = g.host_id desc) from public.profiles x where x.id = any(lp.team_a)), '[]'::json),
    'side_b', coalesce((select json_agg(x.display_name) from public.profiles x where x.id = any(lp.team_b)), '[]'::json),
    'invited', coalesce((select json_agg(json_build_object('name', o.guest_name, 'team', o.team, 'you', o.token = i.token) order by o.created_at)
                         from public.game_invites o where o.game_id = g.id and o.claimed_by is null), '[]'::json)
  )
  from public.game_invites i
  join public.games g on g.id = i.game_id
  join public.courts c on c.id = g.court_id
  join public.profiles p on p.id = i.created_by
  left join public.logged_pending lp on lp.game_id = g.id
  where i.token = p_token;
$$;
grant execute on function public.invite_info(text) to anon, authenticated;

-- "This is me": join the match through the link. When the last invited person joins, the logger's
-- score is filed and the normal confirmation takes over.
create or replace function public.claim_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); i public.game_invites; g public.games; lp public.logged_pending;
  ta uuid[]; tb uuid[]; wa int; wb int;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into i from public.game_invites where token = p_token for update;
  if not found then raise exception 'no_invite'; end if;
  select * into g from public.games where id = i.game_id;
  if g.status = 'cancelled' or i.created_at < now() - interval '30 days' then raise exception 'expired'; end if;
  if i.claimed_by = me then return g.id; end if;
  if i.claimed_by is not null then raise exception 'already_claimed'; end if;
  if exists (select 1 from public.game_players where game_id = g.id and player_id = me) then raise exception 'already_in_game'; end if;

  insert into public.game_players (game_id, player_id) values (g.id, me);
  update public.game_invites set claimed_by = me, claimed_at = now() where token = p_token;

  if not exists (select 1 from public.game_invites where game_id = g.id and claimed_by is null) then
    select * into lp from public.logged_pending where game_id = g.id;
    if found then
      ta := lp.team_a || coalesce((select array_agg(claimed_by) from public.game_invites where game_id = g.id and team = 'a'), '{}');
      tb := lp.team_b || coalesce((select array_agg(claimed_by) from public.game_invites where game_id = g.id and team = 'b'), '{}');
      select count(*) filter (where (e->>0)::int > (e->>1)::int), count(*) filter (where (e->>0)::int < (e->>1)::int)
        into wa, wb from jsonb_array_elements(lp.games) e;
      insert into public.score_reports (game_id, reporter_id, team_a, team_b, score_a, score_b, games)
      values (g.id, g.host_id, ta, tb,
              case when jsonb_array_length(lp.games) = 1 then (lp.games->0->>0)::int else wa end,
              case when jsonb_array_length(lp.games) = 1 then (lp.games->0->>1)::int else wb end, lp.games)
      on conflict (game_id, reporter_id) do nothing;
      delete from public.logged_pending where game_id = g.id;
    end if;
  end if;
  return g.id;
end $$;
revoke all on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;
