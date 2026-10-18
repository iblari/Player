-- Richer court details + recommended courts
alter table public.courts
  add column if not exists source text not null default 'user',
  add column if not exists source_ref text,
  add column if not exists town text,
  add column if not exists kind text,
  add column if not exists indoor boolean not null default false,
  add column if not exists members_only boolean not null default false,
  add column if not exists lit boolean not null default false;
create unique index if not exists courts_source_ref_key on public.courts (source, source_ref) where source_ref is not null;

drop function if exists public.nearby_courts(double precision, double precision, int);
create function public.nearby_courts(lat double precision, lng double precision, radius_mi int default 15)
returns table (id uuid, name text, address text, court_count int, notes text, lat double precision, lng double precision,
  distance_mi double precision, available_players int, open_games int,
  town text, kind text, indoor boolean, members_only boolean, lit boolean, source text)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.name, c.address, c.court_count, c.notes,
    st_y(c.location::geometry), st_x(c.location::geometry),
    st_distance(c.location, public.pt(lat, lng)) / 1609.34,
    (select count(*)::int from public.profiles p
       where p.available_until > now() and p.location is not null
         and st_dwithin(p.location, c.location, p.radius_mi * 1609.34)),
    (select count(*)::int from public.games g
       where g.court_id = c.id and g.status = 'open' and g.expires_at > now()),
    c.town, c.kind, c.indoor, c.members_only, c.lit, c.source
  from public.courts c
  where st_dwithin(c.location, public.pt(lat, lng), radius_mi * 1609.34)
  order by c.location <-> public.pt(lat, lng)
  limit 150;
$$;

-- Ranked picks near a point: live activity first, then size, then distance.
create or replace function public.recommended_courts(lat double precision, lng double precision, p_limit int default 8)
returns table (id uuid, name text, address text, court_count int, notes text, lat double precision, lng double precision,
  distance_mi double precision, available_players int, open_games int,
  town text, kind text, indoor boolean, members_only boolean, lit boolean, source text)
language sql stable security definer set search_path = public, extensions as $$
  select * from public.nearby_courts($1, $2, 25) n
  order by (n.open_games * 6 + n.available_players * 2 + least(coalesce(n.court_count, 1), 12) * 0.5
            + case when n.indoor then 1.5 else 0 end + case when n.lit then 0.5 else 0 end
            - n.distance_mi * 0.6) desc
  limit $3;
$$;
