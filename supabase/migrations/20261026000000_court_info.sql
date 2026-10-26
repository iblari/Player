-- Court details for the "court brief" the Tennis/Pickleball Agent posts in every game chat:
-- opening hours, lights, a phone number, a website and whether it costs money.
-- Filled from OpenStreetMap when we first need them, and fixable by players who play there.
-- Safe to run more than once.

alter table public.courts
  add column if not exists hours text check (char_length(hours) <= 120),
  add column if not exists lights text check (lights in ('yes', 'no')),
  add column if not exists phone text check (char_length(phone) <= 30),
  add column if not exists website text check (char_length(website) <= 200),
  add column if not exists fee text check (fee in ('free', 'paid')),
  add column if not exists fee_note text check (char_length(fee_note) <= 80),
  add column if not exists info_checked_at timestamptz,
  add column if not exists info_by uuid references public.profiles on delete set null,
  add column if not exists info_at timestamptz;

-- Earlier imports saved lit = false when the map simply said nothing, so only "true" is trustworthy.
update public.courts set lights = 'yes' where lit and lights is null;

-- Every change a player makes, so bad edits can be traced and undone.
create table if not exists public.court_info_edits (
  id bigserial primary key,
  court_id uuid not null references public.courts on delete cascade,
  user_id uuid references public.profiles on delete set null,
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index if not exists court_info_edits_user_idx on public.court_info_edits (user_id, created_at desc);
alter table public.court_info_edits enable row level security;
-- No policies: only the functions below write it, and only admins read it.

-- Map details found by the server. Never overwrites something a player set.
create or replace function public.set_court_osm_info(p_court uuid, p_hours text, p_lights text, p_phone text, p_website text, p_fee text)
returns void language sql security definer set search_path = public as $$
  update public.courts set
    hours = coalesce(hours, nullif(left(p_hours, 120), '')),
    lights = coalesce(lights, case when p_lights in ('yes', 'no') then p_lights end),
    phone = coalesce(phone, nullif(left(p_phone, 30), '')),
    website = coalesce(website, nullif(left(p_website, 200), '')),
    fee = coalesce(fee, case when p_fee in ('free', 'paid') then p_fee end),
    info_checked_at = now()
  where id = p_court;
$$;
revoke all on function public.set_court_osm_info(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.set_court_osm_info(uuid, text, text, text, text, text) to service_role;

-- Players who have a game at a court (or added it) can fill in or fix its details.
-- Pass null to leave a field as it is, or '' to clear it. At most 30 changes a day per player.
create or replace function public.edit_court_info(p_court uuid, p_hours text default null, p_lights text default null,
  p_phone text default null, p_fee text default null, p_fee_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.courts; n int := 0;
begin
  if me is null then return 'not_signed_in'; end if;
  select * into c from public.courts where id = p_court;
  if not found then return 'no_court'; end if;
  if c.created_by is distinct from me and not exists (
    select 1 from public.game_players gp join public.games g on g.id = gp.game_id
    where gp.player_id = me and g.court_id = p_court) then
    return 'not_played_here';
  end if;
  if (select count(*) from public.court_info_edits where user_id = me and created_at > now() - interval '1 day') >= 30 then
    return 'too_many';
  end if;
  if p_lights is not null and p_lights not in ('yes', 'no', '') then return 'bad_lights'; end if;
  if p_fee is not null and p_fee not in ('free', 'paid', '') then return 'bad_fee'; end if;
  if p_phone is not null and p_phone <> '' and p_phone !~ '^[0-9+()\-. ]{7,30}$' then return 'bad_phone'; end if;

  if p_hours is not null and p_hours is distinct from coalesce(c.hours, '') then
    insert into public.court_info_edits (court_id, user_id, field, old_value, new_value) values (p_court, me, 'hours', c.hours, p_hours);
    update public.courts set hours = nullif(left(trim(p_hours), 120), '') where id = p_court; n := n + 1;
  end if;
  if p_lights is not null and p_lights is distinct from coalesce(c.lights, '') then
    insert into public.court_info_edits (court_id, user_id, field, old_value, new_value) values (p_court, me, 'lights', c.lights, p_lights);
    update public.courts set lights = nullif(p_lights, ''), lit = (p_lights = 'yes') where id = p_court; n := n + 1;
  end if;
  if p_phone is not null and p_phone is distinct from coalesce(c.phone, '') then
    insert into public.court_info_edits (court_id, user_id, field, old_value, new_value) values (p_court, me, 'phone', c.phone, p_phone);
    update public.courts set phone = nullif(trim(p_phone), '') where id = p_court; n := n + 1;
  end if;
  if p_fee is not null and p_fee is distinct from coalesce(c.fee, '') then
    insert into public.court_info_edits (court_id, user_id, field, old_value, new_value) values (p_court, me, 'fee', c.fee, p_fee);
    update public.courts set fee = nullif(p_fee, '') where id = p_court; n := n + 1;
  end if;
  if p_fee_note is not null and p_fee_note is distinct from coalesce(c.fee_note, '') then
    insert into public.court_info_edits (court_id, user_id, field, old_value, new_value) values (p_court, me, 'fee_note', c.fee_note, p_fee_note);
    update public.courts set fee_note = nullif(left(trim(p_fee_note), 80), '') where id = p_court; n := n + 1;
  end if;
  if n > 0 then update public.courts set info_by = me, info_at = now() where id = p_court; end if;
  return 'ok';
end $$;
revoke all on function public.edit_court_info(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.edit_court_info(uuid, text, text, text, text, text) to authenticated;

-- Imports now carry the details too (new courts get them; existing courts only fill blanks).
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
      perform public.set_court_osm_info(cid, r->>'hours', r->>'lights', r->>'phone', r->>'website', r->>'fee');
    else
      insert into public.courts (name, address, location, court_count, source, source_ref, town, kind, indoor, members_only, lit, sports,
                                 hours, lights, phone, website, fee, info_checked_at)
      values (left(r->>'name', 80), r->>'town', p, nullif((r->>'courts')::int, 0), 'osm', r->>'ref', r->>'town', r->>'kind',
              coalesce((r->>'indoor')::boolean, false), coalesce((r->>'members_only')::boolean, false),
              coalesce((r->>'lit')::boolean, false), sp,
              nullif(left(r->>'hours', 120), ''), case when r->>'lights' in ('yes', 'no') then r->>'lights' end,
              nullif(left(r->>'phone', 30), ''), nullif(left(r->>'website', 200), ''),
              case when r->>'fee' in ('free', 'paid') then r->>'fee' end, now());
      added := added + 1;
    end if;
  end loop;
  return added;
end $$;
revoke all on function public.import_osm_courts(jsonb) from public, anon, authenticated;
grant execute on function public.import_osm_courts(jsonb) to service_role;
