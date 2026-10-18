-- Per-activity visibility (the globe on each activity). Null = follow the player's default
-- (profiles.activity_visibility). Enforced here, not just hidden in the app.

alter table public.game_players add column if not exists visibility text
  check (visibility is null or visibility in ('everyone', 'followers', 'private'));

-- May the current viewer see this player's activity with this setting?
create or replace function public.can_see_activity(p_user uuid, p_vis text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() = p_user then true
    else case coalesce(p_vis, (select activity_visibility from public.profiles where id = p_user), 'everyone')
      when 'everyone' then true
      when 'followers' then exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p_user)
      else false end
  end;
$$;
grant execute on function public.can_see_activity(uuid, text) to anon, authenticated;

-- Set the globe on one of my activities (null = back to my default).
create or replace function public.set_activity_visibility(p_game uuid, p_vis text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if p_vis is not null and p_vis not in ('everyone', 'followers', 'private') then raise exception 'bad_visibility'; end if;
  update public.game_players set visibility = p_vis where game_id = p_game and player_id = auth.uid();
  if not found then raise exception 'not_in_game'; end if;
  return p_vis;
end $$;
grant execute on function public.set_activity_visibility(uuid, text) to authenticated;

-- Activities now filter row by row, and tell the owner each row's setting.
drop function if exists public.player_activities(uuid, int, timestamptz);
create function public.player_activities(p_user uuid, p_limit int default 20, p_before timestamptz default null)
returns table (
  game_id uuid, sport text, slots int, court_name text, town text,
  starts_at timestamptz, ended_at timestamptz, minutes int,
  team_a uuid[], team_b uuid[], score_a int, score_b int,
  won boolean, level_before numeric, level_after numeric, players json,
  visibility text, effective_visibility text
)
language sql stable security definer set search_path = public as $$
  select g.id, g.sport, g.slots, c.name, c.town,
    g.starts_at, coalesce(g.ended_at, r.created_at),
    case when coalesce(g.ended_at, r.created_at) is not null
              and extract(epoch from coalesce(g.ended_at, r.created_at) - g.starts_at) between 600 and 18000
         then (extract(epoch from coalesce(g.ended_at, r.created_at) - g.starts_at) / 60)::int
         else g.fee_minutes end,
    r.team_a, r.team_b, r.score_a, r.score_b,
    case when r.game_id is null then null
         when p_user = any(r.team_a) then r.score_a > r.score_b
         else r.score_b > r.score_a end,
    h.mu_before, h.mu_after,
    (select json_agg(json_build_object('id', pp.id, 'name', pp.display_name, 'avatar_url', pp.avatar_url) order by x.joined_at)
       from public.game_players x join public.profiles pp on pp.id = x.player_id
      where x.game_id = g.id and not x.no_show),
    case when auth.uid() = p_user then me.visibility else null end,
    case when auth.uid() = p_user then coalesce(me.visibility, (select activity_visibility from public.profiles where id = p_user)) else null end
  from public.game_players me
  join public.games g on g.id = me.game_id and g.status <> 'cancelled'
  join public.courts c on c.id = g.court_id
  left join public.game_results r on r.game_id = g.id
  left join public.rating_history h on h.game_id = g.id and h.player_id = p_user
  where me.player_id = p_user and not me.no_show
    and (g.ended_at is not null or r.game_id is not null)
    and public.can_see_activity(p_user, me.visibility)
    and (p_before is null or g.starts_at < p_before)
  order by g.starts_at desc
  limit least(coalesce(p_limit, 20), 50);
$$;
grant execute on function public.player_activities(uuid, int, timestamptz) to anon, authenticated;

-- Profile header: "can see" now means "can see at least the default", and per-row rules apply.
-- (profile_card's can_see keeps using the default; rows marked Everyone still show to all.)
