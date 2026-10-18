-- Match notifications: when a player joins a game, tell everyone else already in it.
-- Only the player who just joined can trigger it, and only in the 2 minutes after joining.
create or replace function public.join_push_targets(p_game uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth
  from public.game_players me
  join public.game_players gp on gp.game_id = me.game_id and gp.player_id <> me.player_id
  join public.push_subscriptions s on s.user_id = gp.player_id
  where me.game_id = p_game and me.player_id = auth.uid() and me.joined_at > now() - interval '2 minutes'
  limit 50;
$$;
grant execute on function public.join_push_targets(uuid) to authenticated;

-- A stale subscription (phone reset, app deleted) can be cleared by the server after a 404/410.
create or replace function public.drop_push_endpoint(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
grant execute on function public.drop_push_endpoint(text) to authenticated;
