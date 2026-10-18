-- A player can host only one active game at a time, at any court.
-- Active = not cancelled, and either still open and not expired, or full and not yet over
-- (we treat a game as over 2 hours after its start).

create or replace function public.active_hosted_game()
returns table (id uuid, court_name text, starts_at timestamptz, status text)
language sql stable security definer set search_path = public as $$
  select g.id, c.name, g.starts_at, g.status
  from public.games g join public.courts c on c.id = g.court_id
  where g.host_id = auth.uid()
    and g.status <> 'cancelled'
    and ((g.status = 'open' and g.expires_at > now())
      or (g.status = 'full' and g.starts_at > now() - interval '2 hours'))
  order by g.starts_at
  limit 1;
$$;

create or replace function public.create_game(p_court uuid, p_slots int, p_min numeric, p_max numeric,
  p_starts timestamptz, p_note text default null, p_confirmed boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; c public.courts; my_clubs text[];
begin
  if auth.uid() is null then raise exception 'Sign in to host a game'; end if;
  -- Lock the host's profile row so two quick taps can't create two games.
  select clubs into my_clubs from public.profiles where id = auth.uid() for update;
  if exists (select 1 from public.active_hosted_game()) then raise exception 'already_hosting'; end if;
  if p_starts < now() - interval '5 minutes' then raise exception 'That start time has passed'; end if;
  select * into c from public.courts where id = p_court;
  if not found then raise exception 'That court no longer exists'; end if;
  if c.members_only then
    if c.club is not null and not (c.club = any(coalesce(my_clubs, '{}'))) then raise exception 'needs_membership'; end if;
    if c.club is null and not p_confirmed then raise exception 'needs_membership'; end if;
  end if;
  insert into public.games (host_id, court_id, slots, skill_min, skill_max, starts_at, expires_at, note, members_only, club)
  values (auth.uid(), p_court, p_slots, p_min, p_max, p_starts,
          greatest(p_starts, now() + interval '30 minutes'), nullif(trim(p_note), ''), c.members_only, c.club)
  returning id into gid;
  insert into public.game_players (game_id, player_id) values (gid, auth.uid());
  return gid;
end $$;
