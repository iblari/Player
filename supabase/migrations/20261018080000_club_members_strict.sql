-- Club courts (e.g. Life Time) are strictly members only: no guest bypass.
-- p_confirmed only applies to private courts with no named club (HOA, community courts).

create or replace function public.create_game(p_court uuid, p_slots int, p_min numeric, p_max numeric,
  p_starts timestamptz, p_note text default null, p_confirmed boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; c public.courts; my_clubs text[];
begin
  if auth.uid() is null then raise exception 'Sign in to host a game'; end if;
  if p_starts < now() - interval '5 minutes' then raise exception 'That start time has passed'; end if;
  select * into c from public.courts where id = p_court;
  if not found then raise exception 'That court no longer exists'; end if;
  select clubs into my_clubs from public.profiles where id = auth.uid();
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

create or replace function public.join_game(p_game uuid, p_confirmed boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare g public.games; n int; my_clubs text[];
begin
  if auth.uid() is null then return 'signed_out'; end if;
  select * into g from public.games where id = p_game for update;
  if not found or g.status = 'cancelled' then return 'cancelled'; end if;
  if exists (select 1 from public.game_players where game_id = p_game and player_id = auth.uid()) then return 'already_in'; end if;
  select clubs into my_clubs from public.profiles where id = auth.uid();
  if g.members_only then
    if g.club is not null and not (g.club = any(coalesce(my_clubs, '{}'))) then return 'needs_membership'; end if;
    if g.club is null and not p_confirmed then return 'needs_membership'; end if;
  end if;
  select count(*) into n from public.game_players where game_id = p_game;
  if n >= g.slots then return 'full'; end if;
  if g.expires_at < now() then return 'expired'; end if;
  insert into public.game_players (game_id, player_id) values (p_game, auth.uid());
  if n + 1 >= g.slots then update public.games set status = 'full', filled_at = now() where id = p_game; end if;
  return 'joined';
end $$;
