-- Game chat: a group thread for the players in a game.
-- Only players in the game (including the host, who is always in game_players) can read or post.

create table if not exists public.game_messages (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists game_messages_game_idx on public.game_messages (game_id, id);

create or replace function public.is_in_game(p_game uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_players where game_id = p_game and player_id = auth.uid());
$$;

alter table public.game_messages enable row level security;

drop policy if exists "chat read by players" on public.game_messages;
create policy "chat read by players" on public.game_messages for select to authenticated
  using (public.is_in_game(game_id));

drop policy if exists "chat post by players" on public.game_messages;
create policy "chat post by players" on public.game_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_in_game(game_id)
    and exists (select 1 from public.games g where g.id = game_id and g.status <> 'cancelled'
                and g.starts_at > now() - interval '1 day')
  );

-- Live updates in the chat screen.
do $$ begin
  alter publication supabase_realtime add table public.game_messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Push targets for a new message: everyone else in the game, only callable by its sender,
-- only for a fresh message (stops replays).
create or replace function public.chat_push_targets(p_message bigint)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth
  from public.game_messages m
  join public.game_players gp on gp.game_id = m.game_id and gp.player_id <> m.sender_id
  join public.push_subscriptions s on s.user_id = gp.player_id
  where m.id = p_message and m.sender_id = auth.uid() and m.created_at > now() - interval '2 minutes'
  limit 50;
$$;

grant execute on function public.is_in_game(uuid) to authenticated;
grant execute on function public.chat_push_targets(bigint) to authenticated;
