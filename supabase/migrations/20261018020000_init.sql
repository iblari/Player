-- Fourth Up database schema
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create extension if not exists postgis with schema extensions;

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  skill numeric(3,2) not null default 3.00 check (skill between 1.0 and 8.0),
  location extensions.geography(point),
  radius_mi int not null default 5 check (radius_mi between 1 and 30),
  available_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  address text,
  location extensions.geography(point) not null,
  court_count int check (court_count between 1 and 60),
  notes text check (char_length(notes) <= 140),
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists courts_location_idx on public.courts using gist (location);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles on delete cascade,
  court_id uuid not null references public.courts on delete cascade,
  slots int not null check (slots in (2, 4)),
  skill_min numeric(3,2) not null,
  skill_max numeric(3,2) not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'full', 'cancelled')),
  note text check (char_length(note) <= 140),
  attendance_done boolean not null default false,
  created_at timestamptz not null default now(),
  filled_at timestamptz,
  check (skill_min <= skill_max)
);
create index if not exists games_open_idx on public.games (status, starts_at);

create table if not exists public.game_players (
  game_id uuid references public.games on delete cascade,
  player_id uuid references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  no_show boolean not null default false,
  primary key (game_id, player_id)
);

create table if not exists public.game_passes (
  game_id uuid references public.games on delete cascade,
  player_id uuid references public.profiles on delete cascade,
  primary key (game_id, player_id)
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------- Profile row on sign-up ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), ''))
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.courts enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_passes enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "courts readable" on public.courts;
create policy "courts readable" on public.courts for select using (true);
drop policy if exists "courts insert" on public.courts;
create policy "courts insert" on public.courts for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "games readable" on public.games;
create policy "games readable" on public.games for select using (true);
drop policy if exists "games host update" on public.games;
create policy "games host update" on public.games for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists "players readable" on public.game_players;
create policy "players readable" on public.game_players for select using (true);
drop policy if exists "host marks attendance" on public.game_players;
create policy "host marks attendance" on public.game_players for update to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and g.host_id = auth.uid()));

drop policy if exists "passes own" on public.game_passes;
create policy "passes own" on public.game_passes for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());

drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Helpers ----------
create or replace function public.pt(lat double precision, lng double precision)
returns extensions.geography language sql immutable as $$
  select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
$$;

-- Update my location (and optionally go available)
create or replace function public.set_location(lat double precision, lng double precision)
returns void language sql security invoker set search_path = public, extensions as $$
  update public.profiles set location = public.pt(lat, lng) where id = auth.uid();
$$;

-- Add a court at a coordinate
create or replace function public.add_court(p_name text, lat double precision, lng double precision,
  p_address text default null, p_count int default null, p_notes text default null)
returns uuid language sql security invoker set search_path = public, extensions as $$
  insert into public.courts (name, address, location, court_count, notes, created_by)
  values (trim(p_name), nullif(trim(p_address), ''), public.pt(lat, lng), p_count, nullif(trim(p_notes), ''), auth.uid())
  returning id;
$$;

-- Courts near a point, with live activity
create or replace function public.nearby_courts(lat double precision, lng double precision, radius_mi int default 15)
returns table (id uuid, name text, address text, court_count int, notes text, lat double precision, lng double precision,
  distance_mi double precision, available_players int, open_games int)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.name, c.address, c.court_count, c.notes,
    st_y(c.location::geometry), st_x(c.location::geometry),
    st_distance(c.location, public.pt(lat, lng)) / 1609.34,
    (select count(*)::int from public.profiles p
       where p.available_until > now() and p.location is not null
         and st_dwithin(p.location, c.location, p.radius_mi * 1609.34)),
    (select count(*)::int from public.games g
       where g.court_id = c.id and g.status = 'open' and g.expires_at > now())
  from public.courts c
  where st_dwithin(c.location, public.pt(lat, lng), radius_mi * 1609.34)
  order by c.location <-> public.pt(lat, lng)
  limit 100;
$$;

-- One court's coordinates (for directions)
create or replace function public.court_point(p_court uuid)
returns table (lat double precision, lng double precision)
language sql stable set search_path = public, extensions as $$
  select st_y(location::geometry), st_x(location::geometry) from public.courts where id = p_court;
$$;

-- Host a game (host is the first player)
create or replace function public.create_game(p_court uuid, p_slots int, p_min numeric, p_max numeric,
  p_starts timestamptz, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to host a game'; end if;
  if p_starts < now() - interval '5 minutes' then raise exception 'That start time has passed'; end if;
  insert into public.games (host_id, court_id, slots, skill_min, skill_max, starts_at, expires_at, note)
  values (auth.uid(), p_court, p_slots, p_min, p_max, p_starts,
          greatest(p_starts, now() + interval '30 minutes'), nullif(trim(p_note), ''))
  returning id into gid;
  insert into public.game_players (game_id, player_id) values (gid, auth.uid());
  return gid;
end $$;

-- Join with a row lock so two people can't take the last spot
create or replace function public.join_game(p_game uuid)
returns text language plpgsql security definer set search_path = public as $$
declare g public.games; n int;
begin
  if auth.uid() is null then return 'signed_out'; end if;
  select * into g from public.games where id = p_game for update;
  if not found or g.status = 'cancelled' then return 'cancelled'; end if;
  if exists (select 1 from public.game_players where game_id = p_game and player_id = auth.uid()) then return 'already_in'; end if;
  select count(*) into n from public.game_players where game_id = p_game;
  if n >= g.slots then return 'full'; end if;
  if g.expires_at < now() then return 'expired'; end if;
  insert into public.game_players (game_id, player_id) values (p_game, auth.uid());
  if n + 1 >= g.slots then update public.games set status = 'full', filled_at = now() where id = p_game; end if;
  return 'joined';
end $$;

create or replace function public.leave_game(p_game uuid)
returns text language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  select * into g from public.games where id = p_game for update;
  if not found then return 'missing'; end if;
  if g.host_id = auth.uid() then return 'host_cannot_leave'; end if;
  if g.starts_at < now() then return 'started'; end if;
  delete from public.game_players where game_id = p_game and player_id = auth.uid();
  update public.games set status = 'open', filled_at = null where id = p_game and status = 'full';
  return 'left';
end $$;

-- Open games that fit me: within my radius, my skill, not mine, not passed
create or replace function public.games_for_me()
returns table (id uuid, court_id uuid, court_name text, distance_mi double precision, slots int,
  skill_min numeric, skill_max numeric, starts_at timestamptz, expires_at timestamptz, host_id uuid,
  note text, player_ids uuid[])
language sql stable security definer set search_path = public, extensions as $$
  with me as (select * from public.profiles where id = auth.uid())
  select g.id, c.id, c.name, st_distance(c.location, me.location) / 1609.34, g.slots,
    g.skill_min, g.skill_max, g.starts_at, g.expires_at, g.host_id, g.note,
    array(select gp.player_id from public.game_players gp where gp.game_id = g.id order by gp.joined_at)
  from public.games g join public.courts c on c.id = g.court_id, me
  where g.status = 'open' and g.expires_at > now()
    and me.location is not null
    and st_dwithin(c.location, me.location, me.radius_mi * 1609.34)
    and me.skill between g.skill_min and g.skill_max
    and not exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.player_id = me.id)
    and not exists (select 1 from public.game_passes gp where gp.game_id = g.id and gp.player_id = me.id)
  order by g.starts_at
  limit 50;
$$;

-- Supply around a court for the host's fill estimate
create or replace function public.fill_supply(p_court uuid, p_min numeric, p_max numeric)
returns table (available int, nearby int)
language sql stable security definer set search_path = public, extensions as $$
  select
    count(*) filter (where p.available_until > now())::int,
    count(*) filter (where p.available_until is null or p.available_until <= now())::int
  from public.profiles p, public.courts c
  where c.id = p_court and p.id <> auth.uid() and p.location is not null
    and p.skill between p_min and p_max
    and st_dwithin(p.location, c.location, p.radius_mi * 1609.34);
$$;

-- Push subscriptions of available, matching players near a new game. Host only, within 10 min of posting.
create or replace function public.push_targets(p_game uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public, extensions as $$
  select s.endpoint, s.p256dh, s.auth
  from public.games g join public.courts c on c.id = g.court_id
  join public.profiles p on p.available_until > now() and p.location is not null
    and p.id <> g.host_id and p.skill between g.skill_min and g.skill_max
    and st_dwithin(p.location, c.location, p.radius_mi * 1609.34)
  join public.push_subscriptions s on s.user_id = p.id
  where g.id = p_game and g.host_id = auth.uid() and g.created_at > now() - interval '10 minutes'
  limit 200;
$$;

-- Marketplace health numbers
create or replace function public.app_stats()
returns json language sql stable security definer set search_path = public as $$
  with done as (
    select g.*, (select count(*) from public.game_players gp where gp.game_id = g.id) as n
    from public.games g
    where g.status <> 'cancelled' and (g.status = 'full' or g.expires_at < now())
  )
  select json_build_object(
    'finished', (select count(*) from done),
    'filled', (select count(*) from done where status = 'full'),
    'median_fill_min', (select percentile_cont(0.5) within group (order by extract(epoch from filled_at - created_at) / 60) from done where status = 'full' and filled_at is not null),
    'players', (select count(*) from public.profiles),
    'available_now', (select count(*) from public.profiles where available_until > now()),
    'open_now', (select count(*) from public.games where status = 'open' and expires_at > now()),
    'week_games', (select count(*) from public.games where created_at > now() - interval '7 days' and status <> 'cancelled'),
    'attended', (select count(*) from public.game_players gp join public.games g on g.id = gp.game_id where g.attendance_done),
    'showed', (select count(*) from public.game_players gp join public.games g on g.id = gp.game_id where g.attendance_done and not gp.no_show),
    'by_hour', (select coalesce(json_agg(h order by h.hour), '[]') from (
        select extract(hour from starts_at at time zone 'America/New_York')::int as hour,
               count(*) as total, count(*) filter (where status = 'full') as filled
        from done group by 1) h)
  );
$$;

-- Show-up rate per player
create or replace function public.reliability(p_ids uuid[])
returns table (player_id uuid, games int, showed int)
language sql stable security definer set search_path = public as $$
  select gp.player_id, count(*)::int, count(*) filter (where not gp.no_show)::int
  from public.game_players gp join public.games g on g.id = gp.game_id
  where g.attendance_done and gp.player_id = any(p_ids)
  group by gp.player_id;
$$;

-- Realtime for live rosters
do $$ begin
  begin alter publication supabase_realtime add table public.games; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.game_players; exception when duplicate_object then null; end;
end $$;
