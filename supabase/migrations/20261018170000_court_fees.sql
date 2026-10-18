-- Paid courts: the host can say what the court costs and for how long; everyone in the game
-- splits it evenly. Players see their share before joining, and pay the host through
-- Venmo / Cash App / PayPal links (or Zelle details) after joining, then mark themselves paid.

alter table public.games add column if not exists fee_total numeric(7,2) check (fee_total is null or (fee_total >= 0 and fee_total <= 2000));
alter table public.games add column if not exists fee_minutes int check (fee_minutes is null or fee_minutes between 15 and 600);
alter table public.game_players add column if not exists paid_at timestamptz;

-- Where a host gets paid. Private: only the owner, and players in a game that person hosts, can read it.
create table if not exists public.payment_handles (
  user_id uuid primary key references public.profiles on delete cascade,
  venmo text check (char_length(venmo) <= 40),
  cashapp text check (char_length(cashapp) <= 40),
  paypal text check (char_length(paypal) <= 40),
  zelle text check (char_length(zelle) <= 80),
  updated_at timestamptz not null default now()
);
alter table public.payment_handles enable row level security;
drop policy if exists "handles own" on public.payment_handles;
create policy "handles own" on public.payment_handles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "handles visible to my host's players" on public.payment_handles;
create policy "handles visible to my host's players" on public.payment_handles for select to authenticated
  using (exists (select 1 from public.games g join public.game_players gp on gp.game_id = g.id
                 where g.host_id = payment_handles.user_id and gp.player_id = auth.uid()));

-- A player marks their share paid (or unpaid). The host sees it on the roster.
create or replace function public.mark_paid(p_game uuid, p_paid boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare t timestamptz := case when p_paid then now() else null end;
begin
  update public.game_players set paid_at = t where game_id = p_game and player_id = auth.uid();
  if not found then raise exception 'not_in_game'; end if;
  return t;
end $$;
grant execute on function public.mark_paid(uuid, boolean) to authenticated;
