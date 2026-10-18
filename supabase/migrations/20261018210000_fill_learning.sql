-- Fill chance that learns. When a game is posted we record how many players were available
-- and nearby (the inputs to the Poisson estimate). Once games resolve, we compare how many
-- players actually joined with how many the model expected, and scale the response rates.
--
-- Model: joins_i ~ Poisson(k * (0.35 * available_i + 0.04 * nearby_i)), capped by open spots.
-- k has a Gamma(5, 5) prior (mean 1 = the starting assumptions, worth ~5 expected joins), so
-- the estimate moves from the guess toward the data as games accumulate:
--   k = (5 + total joins) / (5 + total expected joins)
-- (Joins stop once a game is full, so k is slightly conservative early on.)

alter table public.games add column if not exists supply_available int;
alter table public.games add column if not exists supply_nearby int;

create or replace function public.fill_calibration()
returns json language sql stable security definer set search_path = public as $$
  with done as (
    select g.slots,
           least((select count(*) from public.game_players gp where gp.game_id = g.id) - 1, g.slots - 1) as joins,
           0.35 * g.supply_available + 0.04 * g.supply_nearby as expected
    from public.games g
    where g.supply_available is not null and g.status <> 'cancelled'
      and g.created_at > now() - interval '90 days'
      and (g.status = 'full' or g.expires_at < now())
  )
  select json_build_object(
    'k', round(least(5, greatest(0.2, (5 + coalesce(sum(joins), 0)) / (5 + coalesce(sum(expected), 0))))::numeric, 3),
    'games', count(*),
    'joins', coalesce(sum(joins), 0),
    'expected', round(coalesce(sum(expected), 0)::numeric, 1),
    'filled', count(*) filter (where joins >= slots - 1)
  ) from done;
$$;
grant execute on function public.fill_calibration() to anon, authenticated;
