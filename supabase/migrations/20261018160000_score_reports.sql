-- End a game, and agree on the final score.
-- Any player can mark the game ended. Every player can enter a score:
--   * the host's score is final the moment they enter it (it wins any disagreement);
--   * a non-host's score waits for the host; if the host hasn't entered one within 24 hours
--     of that report, the earliest non-host score becomes final.
-- Ratings move only when a score becomes final.

alter table public.games add column if not exists ended_at timestamptz;
alter table public.games add column if not exists ended_by uuid references public.profiles on delete set null;

create table if not exists public.score_reports (
  game_id uuid not null references public.games on delete cascade,
  reporter_id uuid not null references public.profiles on delete cascade,
  team_a uuid[] not null,          -- the reporter's side
  team_b uuid[] not null,
  score_a int not null check (score_a between 0 and 99),
  score_b int not null check (score_b between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, reporter_id),
  check (score_a <> score_b)
);
alter table public.score_reports enable row level security;
drop policy if exists "reports read by players" on public.score_reports;
create policy "reports read by players" on public.score_reports for select to authenticated
  using (exists (select 1 from public.game_players gp where gp.game_id = score_reports.game_id and gp.player_id = auth.uid()));

-- ---------- End the game ----------
create or replace function public.end_game(p_game uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into g from public.games where id = p_game for update;
  if not found or g.status = 'cancelled' then raise exception 'game_missing'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game and player_id = auth.uid()) then raise exception 'not_in_game'; end if;
  if g.starts_at > now() + interval '15 minutes' and g.status <> 'full' then raise exception 'not_started'; end if;
  if g.ended_at is null then
    update public.games set ended_at = now(), ended_by = auth.uid() where id = p_game;
    return now();
  end if;
  return g.ended_at;
end $$;
grant execute on function public.end_game(uuid) to authenticated;

-- ---------- Apply a final score (internal) ----------
-- Moves ratings and records the result. Called only by submit_result / finalize_due.
create or replace function public.apply_result(p_game uuid, p_team_a uuid[], p_team_b uuid[], p_score_a int, p_score_b int, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.games; prm record; ids uuid[]; pid uuid; i int; n_a int; a_won boolean;
  mus double precision[] := '{}'; sigs double precision[] := '{}'; cur record; res record; lvl numeric; nm double precision[];
begin
  select * into g from public.games where id = p_game for update;
  if exists (select 1 from public.game_results where game_id = p_game) then return; end if;
  n_a := array_length(p_team_a, 1);
  ids := p_team_a || p_team_b;
  select * into prm from public.sport_params(g.sport);
  foreach pid in array ids loop
    select r.mu, r.sigma into cur from public.player_ratings r where r.player_id = pid and r.sport = g.sport;
    if found then
      mus := mus || cur.mu::double precision;
      sigs := sigs || cur.sigma::double precision;
    else
      select public.self_level(p, g.sport) into lvl from public.profiles p where p.id = pid;
      mus := mus || coalesce(lvl, 3.0)::double precision;
      sigs := sigs || (case when lvl is null then prm.sigma0 * 1.5 else prm.sigma0 end);
    end if;
  end loop;

  a_won := p_score_a > p_score_b;
  select * into res from public.trueskill_2team(mus, sigs, n_a, a_won, prm.beta, prm.tau);
  nm := res.new_mu;
  -- One game moves a level by at most 0.5; then clamp to the sport's scale.
  for i in 1..array_length(ids, 1) loop
    nm[i] := least(prm.hi, greatest(prm.lo, least(mus[i] + 0.5, greatest(mus[i] - 0.5, nm[i]))));
  end loop;
  for i in 1..array_length(ids, 1) loop
    insert into public.player_ratings as r (player_id, sport, mu, sigma, games, updated_at)
    values (ids[i], g.sport, nm[i], greatest(0.1, res.new_sigma[i]), 1, now())
    on conflict (player_id, sport) do update
      set mu = excluded.mu, sigma = excluded.sigma, games = r.games + 1, updated_at = now();
    insert into public.rating_history (player_id, sport, game_id, mu_before, sigma_before, mu_after, sigma_after, won)
    values (ids[i], g.sport, p_game, mus[i], sigs[i], nm[i], greatest(0.1, res.new_sigma[i]), (i <= n_a) = a_won);
  end loop;
  insert into public.game_results (game_id, sport, team_a, team_b, score_a, score_b, submitted_by)
  values (p_game, g.sport, p_team_a, p_team_b, p_score_a, p_score_b, p_by);
  if g.ended_at is null then update public.games set ended_at = now(), ended_by = p_by where id = p_game; end if;
end $$;
revoke all on function public.apply_result(uuid, uuid[], uuid[], int, int, uuid) from public, anon, authenticated;

-- ---------- Finalize a waiting non-host score once the host's 24 hours are up ----------
create or replace function public.finalize_due(p_game uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare g public.games; r public.score_reports;
begin
  select * into g from public.games where id = p_game;
  if not found or exists (select 1 from public.game_results where game_id = p_game) then return false; end if;
  if exists (select 1 from public.score_reports where game_id = p_game and reporter_id = g.host_id) then return false; end if;
  select * into r from public.score_reports
   where game_id = p_game and reporter_id <> g.host_id and created_at <= now() - interval '24 hours'
   order by created_at limit 1;
  if not found then return false; end if;
  perform public.apply_result(p_game, r.team_a, r.team_b, r.score_a, r.score_b, r.reporter_id);
  return true;
end $$;
grant execute on function public.finalize_due(uuid) to authenticated;

-- ---------- Enter a score ----------
-- Same signature as before. Returns {"status": "final" | "pending", "deadline": ...}.
create or replace function public.submit_result(p_game uuid, p_team_a uuid[], p_team_b uuid[], p_score_a int, p_score_b int)
returns json language plpgsql security definer set search_path = public as $$
declare g public.games; roster uuid[]; ids uuid[]; n_a int; first_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into g from public.games where id = p_game;
  if not found or g.status = 'cancelled' then raise exception 'game_missing'; end if;
  if g.starts_at > now() and g.ended_at is null then raise exception 'not_started'; end if;
  perform public.finalize_due(p_game);
  if exists (select 1 from public.game_results where game_id = p_game) then raise exception 'already_scored'; end if;
  select array_agg(player_id) into roster from public.game_players where game_id = p_game and not no_show;
  if roster is null or not (auth.uid() = any(roster)) then raise exception 'not_in_game'; end if;
  if p_score_a is null or p_score_b is null or p_score_a = p_score_b then raise exception 'bad_score'; end if;
  n_a := coalesce(array_length(p_team_a, 1), 0);
  if n_a not in (1, 2) or n_a <> coalesce(array_length(p_team_b, 1), 0) then raise exception 'bad_teams'; end if;
  ids := p_team_a || p_team_b;
  if (select count(distinct x) from unnest(ids) x) <> array_length(ids, 1)
     or exists (select 1 from unnest(ids) x where not (x = any(roster))) then
    raise exception 'bad_teams';
  end if;

  insert into public.score_reports as s (game_id, reporter_id, team_a, team_b, score_a, score_b)
  values (p_game, auth.uid(), p_team_a, p_team_b, p_score_a, p_score_b)
  on conflict (game_id, reporter_id) do update
    set team_a = excluded.team_a, team_b = excluded.team_b, score_a = excluded.score_a, score_b = excluded.score_b, updated_at = now();

  if auth.uid() = g.host_id then
    perform public.apply_result(p_game, p_team_a, p_team_b, p_score_a, p_score_b, auth.uid());
    return json_build_object('status', 'final');
  end if;
  select min(created_at) into first_at from public.score_reports where game_id = p_game and reporter_id <> g.host_id;
  return json_build_object('status', 'pending', 'deadline', first_at + interval '24 hours');
end $$;

-- Push to the host when someone else enters the score (only the reporter, right after).
create or replace function public.score_push_targets(p_game uuid)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth
  from public.score_reports r
  join public.games g on g.id = r.game_id and g.host_id <> r.reporter_id
  join public.push_subscriptions s on s.user_id = g.host_id
  where r.game_id = p_game and r.reporter_id = auth.uid() and r.updated_at > now() - interval '2 minutes'
    and not exists (select 1 from public.game_results x where x.game_id = p_game)
  limit 10;
$$;
grant execute on function public.score_push_targets(uuid) to authenticated;
