-- Profiles, follows and activities (Strava-style).
-- Every finished game (a final score, or marked ended) is an activity for each player in it.
-- Players choose who sees their activities: everyone (default), followers, or only me.
-- Follower/following counts and names stay visible so people can find and follow each other.

alter table public.profiles add column if not exists activity_visibility text not null default 'everyone'
  check (activity_visibility in ('everyone', 'followers', 'private'));

create table if not exists public.follows (
  follower_id uuid not null references public.profiles on delete cascade,
  followee_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);
alter table public.follows enable row level security;
drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows for select to authenticated using (true);
drop policy if exists "follow as me" on public.follows;
create policy "follow as me" on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists "unfollow as me" on public.follows;
create policy "unfollow as me" on public.follows for delete to authenticated using (follower_id = auth.uid());

-- Can the current viewer see this player's activities?
create or replace function public.can_see_activities(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() = p_user then true
    else coalesce((select case p.activity_visibility
                     when 'everyone' then true
                     when 'followers' then exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p_user)
                     else false end
                   from public.profiles p where p.id = p_user), false)
  end;
$$;

-- Header for a profile page.
create or replace function public.profile_card(p_user uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'sports', p.sports,
    'clubs', p.clubs,
    'followers', (select count(*) from public.follows f where f.followee_id = p.id),
    'following', (select count(*) from public.follows f where f.follower_id = p.id),
    'games', (select count(*) from public.game_players gp join public.games g on g.id = gp.game_id
              where gp.player_id = p.id and not gp.no_show and g.status <> 'cancelled'
                and (g.ended_at is not null or exists (select 1 from public.game_results r where r.game_id = g.id))),
    'am_following', exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    'follows_me', exists (select 1 from public.follows f where f.follower_id = p.id and f.followee_id = auth.uid()),
    'visibility', case when auth.uid() = p.id then p.activity_visibility else null end,
    'can_see', public.can_see_activities(p.id),
    'ratings', (select coalesce(json_agg(json_build_object('sport', r.sport, 'level', round(r.mu, 2), 'games', r.games)), '[]'::json)
                from public.player_ratings r where r.player_id = p.id)
  )
  from public.profiles p where p.id = p_user;
$$;

-- A player's finished games, newest first, if the viewer is allowed to see them.
create or replace function public.player_activities(p_user uuid, p_limit int default 20, p_before timestamptz default null)
returns table (
  game_id uuid, sport text, slots int, court_name text, town text,
  starts_at timestamptz, ended_at timestamptz, minutes int,
  team_a uuid[], team_b uuid[], score_a int, score_b int,
  won boolean, level_before numeric, level_after numeric, players json
)
language sql stable security definer set search_path = public as $$
  select g.id, g.sport, g.slots, c.name, c.town,
    g.starts_at, coalesce(g.ended_at, r.created_at),
    -- How long they played: start to end when that's believable, else the court booking.
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
      where x.game_id = g.id and not x.no_show)
  from public.game_players me
  join public.games g on g.id = me.game_id and g.status <> 'cancelled'
  join public.courts c on c.id = g.court_id
  left join public.game_results r on r.game_id = g.id
  left join public.rating_history h on h.game_id = g.id and h.player_id = p_user
  where me.player_id = p_user and not me.no_show
    and (g.ended_at is not null or r.game_id is not null)
    and public.can_see_activities(p_user)
    and (p_before is null or g.starts_at < p_before)
  order by g.starts_at desc
  limit least(coalesce(p_limit, 20), 50);
$$;

-- People I follow (for "following" lists) and who follows me.
create or replace function public.follow_list(p_user uuid, p_kind text)
returns table (id uuid, display_name text, avatar_url text, am_following boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_url,
         exists (select 1 from public.follows m where m.follower_id = auth.uid() and m.followee_id = p.id)
  from public.follows f
  join public.profiles p on p.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
  where case when p_kind = 'followers' then f.followee_id else f.follower_id end = p_user
  order by f.created_at desc
  limit 200;
$$;

grant execute on function public.can_see_activities(uuid) to anon, authenticated;
grant execute on function public.profile_card(uuid) to anon, authenticated;
grant execute on function public.player_activities(uuid, int, timestamptz) to anon, authenticated;
grant execute on function public.follow_list(uuid, text) to anon, authenticated;
