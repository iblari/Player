-- Real (not live) count of players who have set a location within the radius.
create or replace function public.players_nearby(lat double precision, lng double precision, radius_mi int default 15)
returns int language sql stable security definer set search_path = public, extensions as $$
  select count(*)::int from public.profiles p
  where auth.uid() is not null and p.id <> auth.uid() and p.location is not null
    and st_dwithin(p.location, public.pt(lat, lng), radius_mi * 1609.34);
$$;
grant execute on function public.players_nearby(double precision, double precision, int) to authenticated;
