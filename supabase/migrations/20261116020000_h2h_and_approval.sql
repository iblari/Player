-- 1) The logger approves who joined through an invite link ("Sam Lee joined. Is this them?").
--    Nothing counts until they say yes; "Not them" removes that person and makes a fresh link.
-- 2) Head to head: every confirmed match two players played on opposite sides, for the FIFA-style
--    comparison screen. Safe to run more than once. Run after match_invites.

alter table public.game_invites add column if not exists approved boolean;

-- File the logger's held score once everyone invited has joined AND been approved (internal).
create or replace function public.file_logged_pending(p_game uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.games; lp public.logged_pending; ta uuid[]; tb uuid[]; wa int; wb int;
begin
  if exists (select 1 from public.game_invites where game_id = p_game and (claimed_by is null or approved is not true)) then return; end if;
  select * into g from public.games where id = p_game;
  select * into lp from public.logged_pending where game_id = p_game;
  if not found then return; end if;
  ta := lp.team_a || coalesce((select array_agg(claimed_by) from public.game_invites where game_id = p_game and team = 'a'), '{}');
  tb := lp.team_b || coalesce((select array_agg(claimed_by) from public.game_invites where game_id = p_game and team = 'b'), '{}');
  select count(*) filter (where (e->>0)::int > (e->>1)::int), count(*) filter (where (e->>0)::int < (e->>1)::int)
    into wa, wb from jsonb_array_elements(lp.games) e;
  insert into public.score_reports (game_id, reporter_id, team_a, team_b, score_a, score_b, games)
  values (p_game, g.host_id, ta, tb,
          case when jsonb_array_length(lp.games) = 1 then (lp.games->0->>0)::int else wa end,
          case when jsonb_array_length(lp.games) = 1 then (lp.games->0->>1)::int else wb end, lp.games)
  on conflict (game_id, reporter_id) do nothing;
  delete from public.logged_pending where game_id = p_game;
end $$;
revoke all on function public.file_logged_pending(uuid) from public, anon, authenticated;

-- Joining through a link now waits for the logger's OK before the score is filed.
create or replace function public.claim_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); i public.game_invites; g public.games;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into i from public.game_invites where token = p_token for update;
  if not found then raise exception 'no_invite'; end if;
  select * into g from public.games where id = i.game_id;
  if g.status = 'cancelled' or i.created_at < now() - interval '30 days' then raise exception 'expired'; end if;
  if i.claimed_by = me then return g.id; end if;
  if i.claimed_by is not null then raise exception 'already_claimed'; end if;
  if exists (select 1 from public.game_players where game_id = g.id and player_id = me) then raise exception 'already_in_game'; end if;
  insert into public.game_players (game_id, player_id) values (g.id, me);
  update public.game_invites set claimed_by = me, claimed_at = now(), approved = null where token = p_token;
  return g.id;
end $$;
revoke all on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

-- The logger answers "Is this them?". Yes: approved (score filed once everyone's approved).
-- No: that person is taken out of the match and the link is replaced, so the old one stops working.
create or replace function public.approve_invite(p_token text, p_ok boolean)
returns text language plpgsql security definer set search_path = public as $$
declare i public.game_invites; g public.games; fresh text;
begin
  select * into i from public.game_invites where token = p_token for update;
  if not found then raise exception 'no_invite'; end if;
  select * into g from public.games where id = i.game_id;
  if g.host_id is distinct from auth.uid() then raise exception 'not_logger'; end if;
  if i.claimed_by is null then raise exception 'not_claimed'; end if;
  if p_ok then
    update public.game_invites set approved = true where token = p_token;
    perform public.file_logged_pending(g.id);
    return p_token;
  end if;
  delete from public.game_players where game_id = g.id and player_id = i.claimed_by;
  delete from public.score_reports where game_id = g.id and reporter_id = i.claimed_by;
  fresh := replace(gen_random_uuid()::text, '-', '');
  update public.game_invites set token = fresh, claimed_by = null, claimed_at = null, approved = null where token = p_token;
  return fresh;
end $$;
revoke all on function public.approve_invite(text, boolean) from public, anon;
grant execute on function public.approve_invite(text, boolean) to authenticated;

-- Push to the logger right after someone joins through their link.
create or replace function public.claim_push_targets(p_game uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth
  from public.game_invites i
  join public.games g on g.id = i.game_id
  join public.push_subscriptions s on s.user_id = g.host_id
  where i.game_id = p_game and i.claimed_by = auth.uid() and i.claimed_at > now() - interval '10 minutes'
  limit 10;
$$;
grant execute on function public.claim_push_targets(uuid) to authenticated;

-- ---------- Head to head ----------
-- Confirmed matches where you and p_other were on opposite sides, newest first, scores from your side.
create or replace function public.head_to_head(p_other uuid, p_sport text default null)
returns table (game_id uuid, sport text, slots int, starts_at timestamptz, court_name text,
               games jsonb, won boolean, my_team uuid[], their_team uuid[])
language sql stable security definer set search_path = public as $$
  select g.id, g.sport, g.slots, g.starts_at, c.name,
    (select jsonb_agg(case when auth.uid() = any(r.team_a) then e else jsonb_build_array(e->1, e->0) end order by n)
       from jsonb_array_elements(coalesce(r.games, jsonb_build_array(jsonb_build_array(r.score_a, r.score_b)))) with ordinality t(e, n)),
    case when r.score_a = r.score_b then null
         when auth.uid() = any(r.team_a) then r.score_a > r.score_b else r.score_b > r.score_a end,
    case when auth.uid() = any(r.team_a) then r.team_a else r.team_b end,
    case when auth.uid() = any(r.team_a) then r.team_b else r.team_a end
  from public.game_results r
  join public.games g on g.id = r.game_id and g.status <> 'cancelled'
  join public.courts c on c.id = g.court_id
  where auth.uid() is not null and p_other <> auth.uid()
    and ((auth.uid() = any(r.team_a) and p_other = any(r.team_b)) or (auth.uid() = any(r.team_b) and p_other = any(r.team_a)))
    and (p_sport is null or g.sport = p_sport)
  order by g.starts_at desc
  limit 200;
$$;
revoke all on function public.head_to_head(uuid, text) from public, anon;
grant execute on function public.head_to_head(uuid, text) to authenticated;

-- Both players' current rating and how sure it is, for the prediction.
create or replace function public.rating_pair(p_other uuid, p_sport text)
returns table (player_id uuid, mu numeric, sigma numeric, games int)
language sql stable security definer set search_path = public as $$
  select x, public.player_level(x, p_sport),
    coalesce((select r.sigma from public.player_ratings r where r.player_id = x and r.sport = p_sport and r.games > 0), (public.sport_params(p_sport)).sigma0::numeric),
    coalesce((select r.games from public.player_ratings r where r.player_id = x and r.sport = p_sport), 0)
  from unnest(array[auth.uid(), p_other]) x
  where auth.uid() is not null;
$$;
grant execute on function public.rating_pair(uuid, text) to authenticated;
