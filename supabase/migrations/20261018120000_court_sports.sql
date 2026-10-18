-- Courts know which sports they host, and court/player lists filter by the selected sport.
-- Every existing court is a pickleball venue (the NJ seed is pickleball), so the default is pickleball.

alter table public.courts add column if not exists sports text[] not null default '{pickleball}';
do $$ begin
  alter table public.courts add constraint courts_sports_check
    check (sports <@ array['pickleball', 'tennis'] and cardinality(sports) > 0);
exception when duplicate_object then null; end $$;
create index if not exists courts_sports_idx on public.courts using gin (sports);

-- Add a court, tagged with the sports played there.
drop function if exists public.add_court(text, double precision, double precision, text, int, text);
create function public.add_court(p_name text, lat double precision, lng double precision,
  p_address text default null, p_count int default null, p_notes text default null,
  p_sports text[] default '{pickleball}')
returns uuid language sql security invoker set search_path = public, extensions as $$
  insert into public.courts (name, address, location, court_count, notes, created_by, sports)
  values (trim(p_name), nullif(trim(p_address), ''), public.pt(lat, lng), p_count, nullif(trim(p_notes), ''), auth.uid(),
          coalesce(nullif(p_sports, '{}'), '{pickleball}'))
  returning id;
$$;

-- Court lists take an optional sport. Null = all courts (old callers keep working).
-- "Available players" at a court only counts people who play that sport.
drop function if exists public.recommended_courts(double precision, double precision, int);
drop function if exists public.nearby_courts(double precision, double precision, int);
create function public.nearby_courts(lat double precision, lng double precision, radius_mi int default 15, p_sport text default null)
returns table (id uuid, name text, address text, court_count int, notes text, lat double precision, lng double precision,
  distance_mi double precision, available_players int, open_games int,
  town text, kind text, indoor boolean, members_only boolean, lit boolean, source text, club text, sports text[])
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.name, c.address, c.court_count, c.notes,
    st_y(c.location::geometry), st_x(c.location::geometry),
    st_distance(c.location, public.pt(lat, lng)) / 1609.34,
    (select count(*)::int from public.profiles p
       where p.available_until > now() and p.location is not null
         and (p_sport is null or public.player_level(p.id, p_sport) is not null)
         and st_dwithin(p.location, c.location, p.radius_mi * 1609.34)),
    (select count(*)::int from public.games g
       where g.court_id = c.id and g.status = 'open' and g.expires_at > now()
         and (p_sport is null or g.sport = p_sport)),
    c.town, c.kind, c.indoor, c.members_only, c.lit, c.source, c.club, c.sports
  from public.courts c
  where st_dwithin(c.location, public.pt(lat, lng), radius_mi * 1609.34)
    and (p_sport is null or p_sport = any(c.sports))
  order by c.location <-> public.pt(lat, lng)
  limit 150;
$$;

create function public.recommended_courts(lat double precision, lng double precision, p_limit int default 8, p_sport text default null)
returns table (id uuid, name text, address text, court_count int, notes text, lat double precision, lng double precision,
  distance_mi double precision, available_players int, open_games int,
  town text, kind text, indoor boolean, members_only boolean, lit boolean, source text, club text, sports text[])
language sql stable security definer set search_path = public, extensions as $$
  select * from public.nearby_courts($1, $2, 25, $4) n
  order by (n.open_games * 6 + n.available_players * 2 + least(coalesce(n.court_count, 1), 12) * 0.5
            + case when n.indoor then 1.5 else 0 end + case when n.lit then 0.5 else 0 end
            - n.distance_mi * 0.6) desc
  limit $3;
$$;

-- Recent courts for the selected sport (games of that sport, at courts that host it).
drop function if exists public.recent_courts(int);
create function public.recent_courts(p_limit int default 3, p_sport text default null)
returns table (id uuid, name text, address text, last_played timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.address, max(g.starts_at)
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  join public.courts c on c.id = g.court_id
  where gp.player_id = auth.uid()
    and (p_sport is null or (g.sport = p_sport and p_sport = any(c.sports)))
  group by c.id, c.name, c.address
  order by max(g.starts_at) desc
  limit p_limit;
$$;

-- Live player map and nearby count: only players who play the selected sport.
drop function if exists public.available_players_map(double precision, double precision, int);
create function public.available_players_map(lat double precision, lng double precision, radius_mi int default 15, p_sport text default null)
returns table (lat double precision, lng double precision, players int, skill_min numeric, skill_max numeric)
language sql stable security definer set search_path = public, extensions as $$
  with pts as (
    select st_snaptogrid(p.location::geometry, 0.004) as cell,
      coalesce(public.player_level(p.id, coalesce(p_sport, 'pickleball')), p.skill) as skill
    from public.profiles p
    where auth.uid() is not null
      and p.id <> auth.uid()
      and p.available_until > now()
      and p.location is not null
      and (p_sport is null or public.player_level(p.id, p_sport) is not null)
      and st_dwithin(p.location, public.pt(lat, lng), radius_mi * 1609.34)
  )
  select st_y(cell), st_x(cell), count(*)::int, min(skill), max(skill)
  from pts group by cell;
$$;

drop function if exists public.players_nearby(double precision, double precision, int);
create function public.players_nearby(lat double precision, lng double precision, radius_mi int default 15, p_sport text default null)
returns int language sql stable security definer set search_path = public, extensions as $$
  select count(*)::int from public.profiles p
  where auth.uid() is not null and p.id <> auth.uid() and p.location is not null
    and (p_sport is null or public.player_level(p.id, p_sport) is not null)
    and st_dwithin(p.location, public.pt(lat, lng), radius_mi * 1609.34);
$$;
grant execute on function public.players_nearby(double precision, double precision, int, text) to authenticated;

-- A game's sport must be one the court hosts (covers every path that creates a game).
create or replace function public.games_sport_matches_court() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.courts c where c.id = new.court_id and new.sport = any(c.sports)) then
    raise exception 'court_sport';
  end if;
  return new;
end $$;
drop trigger if exists games_sport_matches_court on public.games;
create trigger games_sport_matches_court before insert or update of sport, court_id on public.games
  for each row execute function public.games_sport_matches_court();
