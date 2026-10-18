-- Home map: show where players are, not just a count. Free players and players who play
-- nearby (but aren't free right now) are grouped on a ~1 km grid so no one's exact spot shows.
create or replace function public.players_map(lat double precision, lng double precision, radius_mi int default 15, p_sport text default null)
returns table (lat double precision, lng double precision, free int, others int)
language sql stable security definer set search_path = public, extensions as $$
  with pts as (
    select st_snaptogrid(p.location::geometry, 0.01) as cell, p.available_until > now() as is_free
    from public.profiles p
    where auth.uid() is not null and p.id <> auth.uid() and p.location is not null
      and (p_sport is null or public.player_level(p.id, p_sport) is not null)
      and st_dwithin(p.location, public.pt(lat, lng), radius_mi * 1609.34)
  )
  select st_y(cell), st_x(cell), (count(*) filter (where is_free))::int, (count(*) filter (where not is_free))::int
  from pts group by cell;
$$;
grant execute on function public.players_map(double precision, double precision, int, text) to authenticated;
