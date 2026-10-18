-- Members-only courts (e.g. Life Time): players confirm membership before hosting or joining,
-- and members-only games are only shown/pinged to players who confirmed that club.

alter table public.courts add column if not exists club text;
update public.courts set club = 'Life Time' where source = 'lifetime' and club is null;

alter table public.profiles add column if not exists clubs text[] not null default '{}';

alter table public.games
  add column if not exists members_only boolean not null default false,
  add column if not exists club text;

-- Save a confirmed membership on the caller's profile
create or replace function public.add_club(p_club text)
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set clubs = (select array_agg(distinct x) from unnest(clubs || p_club) x)
   where id = auth.uid() and p_club is not null and length(trim(p_club)) > 0;
$$;

-- Host a game (host is the first player). Members-only courts need a confirmed membership.
drop function if exists public.create_game(uuid, int, numeric, numeric, timestamptz, text);
create function public.create_game(p_court uuid, p_slots int, p_min numeric, p_max numeric,
  p_starts timestamptz, p_note text default null, p_confirmed boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; c public.courts; my_clubs text[];
begin
  if auth.uid() is null then raise exception 'Sign in to host a game'; end if;
  if p_starts < now() - interval '5 minutes' then raise exception 'That start time has passed'; end if;
  select * into c from public.courts where id = p_court;
  if not found then raise exception 'That court no longer exists'; end if;
  select clubs into my_clubs from public.profiles where id = auth.uid();
  if c.members_only and not p_confirmed and not (c.club is not null and c.club = any(coalesce(my_clubs, '{}'))) then
    raise exception 'needs_membership';
  end if;
  insert into public.games (host_id, court_id, slots, skill_min, skill_max, starts_at, expires_at, note, members_only, club)
  values (auth.uid(), p_court, p_slots, p_min, p_max, p_starts,
          greatest(p_starts, now() + interval '30 minutes'), nullif(trim(p_note), ''), c.members_only, c.club)
  returning id into gid;
  insert into public.game_players (game_id, player_id) values (gid, auth.uid());
  return gid;
end $$;

-- Join with a row lock; members-only games need a confirmed membership (or guest confirmation).
drop function if exists public.join_game(uuid);
create function public.join_game(p_game uuid, p_confirmed boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare g public.games; n int; my_clubs text[];
begin
  if auth.uid() is null then return 'signed_out'; end if;
  select * into g from public.games where id = p_game for update;
  if not found or g.status = 'cancelled' then return 'cancelled'; end if;
  if exists (select 1 from public.game_players where game_id = p_game and player_id = auth.uid()) then return 'already_in'; end if;
  select clubs into my_clubs from public.profiles where id = auth.uid();
  if g.members_only and not p_confirmed and not (g.club is not null and g.club = any(coalesce(my_clubs, '{}'))) then
    return 'needs_membership';
  end if;
  select count(*) into n from public.game_players where game_id = p_game;
  if n >= g.slots then return 'full'; end if;
  if g.expires_at < now() then return 'expired'; end if;
  insert into public.game_players (game_id, player_id) values (p_game, auth.uid());
  if n + 1 >= g.slots then update public.games set status = 'full', filled_at = now() where id = p_game; end if;
  return 'joined';
end $$;

-- Open games that fit me. Club games only reach that club's members.
drop function if exists public.games_for_me();
create function public.games_for_me()
returns table (id uuid, court_id uuid, court_name text, distance_mi double precision, slots int,
  skill_min numeric, skill_max numeric, starts_at timestamptz, expires_at timestamptz, host_id uuid,
  note text, player_ids uuid[], members_only boolean, club text)
language sql stable security definer set search_path = public, extensions as $$
  with me as (select * from public.profiles where id = auth.uid())
  select g.id, c.id, c.name, st_distance(c.location, me.location) / 1609.34, g.slots,
    g.skill_min, g.skill_max, g.starts_at, g.expires_at, g.host_id, g.note,
    array(select gp.player_id from public.game_players gp where gp.game_id = g.id order by gp.joined_at),
    g.members_only, g.club
  from public.games g join public.courts c on c.id = g.court_id, me
  where g.status = 'open' and g.expires_at > now()
    and me.location is not null
    and st_dwithin(c.location, me.location, me.radius_mi * 1609.34)
    and me.skill between g.skill_min and g.skill_max
    and (not g.members_only or g.club is null or g.club = any(me.clubs))
    and not exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.player_id = me.id)
    and not exists (select 1 from public.game_passes gp where gp.game_id = g.id and gp.player_id = me.id)
  order by g.starts_at
  limit 50;
$$;

-- Pings: club games only go to confirmed members of that club.
create or replace function public.push_targets(p_game uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public, extensions as $$
  select s.endpoint, s.p256dh, s.auth
  from public.games g join public.courts c on c.id = g.court_id
  join public.profiles p on p.available_until > now() and p.location is not null
    and p.id <> g.host_id and p.skill between g.skill_min and g.skill_max
    and st_dwithin(p.location, c.location, p.radius_mi * 1609.34)
    and (not g.members_only or g.club is null or g.club = any(p.clubs))
  join public.push_subscriptions s on s.user_id = p.id
  where g.id = p_game and g.host_id = auth.uid() and g.created_at > now() - interval '10 minutes'
  limit 200;
$$;

-- Fill estimate counts only eligible players at members-only courts.
create or replace function public.fill_supply(p_court uuid, p_min numeric, p_max numeric)
returns table (available int, nearby int)
language sql stable security definer set search_path = public, extensions as $$
  select
    count(*) filter (where p.available_until > now())::int,
    count(*) filter (where p.available_until is null or p.available_until <= now())::int
  from public.profiles p, public.courts c
  where c.id = p_court and p.id <> auth.uid() and p.location is not null
    and p.skill between p_min and p_max
    and (not c.members_only or c.club is null or c.club = any(p.clubs))
    and st_dwithin(p.location, c.location, p.radius_mi * 1609.34);
$$;

-- Expose club on court lists
drop function if exists public.recommended_courts(double precision, double precision, int);
drop function if exists public.nearby_courts(double precision, double precision, int);
create function public.nearby_courts(lat double precision, lng double precision, radius_mi int default 15)
returns table (id uuid, name text, address text, court_count int, notes text, lat double precision, lng double precision,
  distance_mi double precision, available_players int, open_games int,
  town text, kind text, indoor boolean, members_only boolean, lit boolean, source text, club text)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.name, c.address, c.court_count, c.notes,
    st_y(c.location::geometry), st_x(c.location::geometry),
    st_distance(c.location, public.pt(lat, lng)) / 1609.34,
    (select count(*)::int from public.profiles p
       where p.available_until > now() and p.location is not null
         and st_dwithin(p.location, c.location, p.radius_mi * 1609.34)),
    (select count(*)::int from public.games g
       where g.court_id = c.id and g.status = 'open' and g.expires_at > now()),
    c.town, c.kind, c.indoor, c.members_only, c.lit, c.source, c.club
  from public.courts c
  where st_dwithin(c.location, public.pt(lat, lng), radius_mi * 1609.34)
  order by c.location <-> public.pt(lat, lng)
  limit 150;
$$;

create function public.recommended_courts(lat double precision, lng double precision, p_limit int default 8)
returns table (id uuid, name text, address text, court_count int, notes text, lat double precision, lng double precision,
  distance_mi double precision, available_players int, open_games int,
  town text, kind text, indoor boolean, members_only boolean, lit boolean, source text, club text)
language sql stable security definer set search_path = public, extensions as $$
  select * from public.nearby_courts($1, $2, 25) n
  order by (n.open_games * 6 + n.available_players * 2 + least(coalesce(n.court_count, 1), 12) * 0.5
            + case when n.indoor then 1.5 else 0 end + case when n.lit then 0.5 else 0 end
            - n.distance_mi * 0.6) desc
  limit $3;
$$;
