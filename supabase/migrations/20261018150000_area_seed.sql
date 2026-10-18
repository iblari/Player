-- Background court loading. When a player first shares where they play, the server pulls
-- tennis and pickleball courts around them from OpenStreetMap and adds the missing ones.
-- Areas are ~22 km grid cells; each is loaded at most once a month.

create table if not exists public.court_seed_cells (
  cell text primary key,
  seeded_at timestamptz not null default now(),
  found int
);
alter table public.court_seed_cells enable row level security;
-- No policies: only the server (service role) reads or writes this.

create index if not exists courts_source_ref_idx on public.courts (source, source_ref);

-- Rows: [{ref, name, town, kind, lat, lng, courts, sports[], indoor, lit, members_only}]
-- An existing court at the same OSM ref, or within 120 m, gains any new sports instead of
-- being duplicated. Returns how many courts were added.
create or replace function public.import_osm_courts(p_rows jsonb)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb; added int := 0; cid uuid; sp text[]; p extensions.geography;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    sp := array(select jsonb_array_elements_text(r->'sports'));
    if coalesce(array_length(sp, 1), 0) = 0 then continue; end if;
    p := public.pt((r->>'lat')::float8, (r->>'lng')::float8);
    select id into cid from public.courts where source = 'osm' and source_ref = r->>'ref' limit 1;
    if cid is null then
      select id into cid from public.courts where st_dwithin(location, p, 120) order by location <-> p limit 1;
    end if;
    if cid is not null then
      update public.courts set sports = array(select distinct unnest(sports || sp) order by 1)
      where id = cid and not (sports @> sp);
    else
      insert into public.courts (name, address, location, court_count, source, source_ref, town, kind, indoor, members_only, lit, sports)
      values (left(r->>'name', 80), r->>'town', p, nullif((r->>'courts')::int, 0), 'osm', r->>'ref', r->>'town', r->>'kind',
              coalesce((r->>'indoor')::boolean, false), coalesce((r->>'members_only')::boolean, false),
              coalesce((r->>'lit')::boolean, false), sp);
      added := added + 1;
    end if;
  end loop;
  return added;
end $$;
revoke all on function public.import_osm_courts(jsonb) from public, anon, authenticated;
grant execute on function public.import_osm_courts(jsonb) to service_role;
