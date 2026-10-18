-- Map of available players, privacy-safe: positions are snapped to a ~400 m grid
-- and grouped, so nobody's exact location is ever exposed.
create or replace function public.available_players_map(lat double precision, lng double precision, radius_mi int default 15)
returns table (lat double precision, lng double precision, players int, skill_min numeric, skill_max numeric)
language sql stable security definer set search_path = public, extensions as $$
  with pts as (
    select st_snaptogrid(p.location::geometry, 0.004) as cell, p.skill
    from public.profiles p
    where auth.uid() is not null
      and p.id <> auth.uid()
      and p.available_until > now()
      and p.location is not null
      and st_dwithin(p.location, public.pt(lat, lng), radius_mi * 1609.34)
  )
  select st_y(cell), st_x(cell), count(*)::int, min(skill), max(skill)
  from pts group by cell;
$$;

-- Courts I've played at most recently (for the "recent" list under search)
create or replace function public.recent_courts(p_limit int default 3)
returns table (id uuid, name text, address text, last_played timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.address, max(g.starts_at)
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  join public.courts c on c.id = g.court_id
  where gp.player_id = auth.uid()
  group by c.id, c.name, c.address
  order by max(g.starts_at) desc
  limit p_limit;
$$;
