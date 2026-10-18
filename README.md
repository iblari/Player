# Fourth Up

Find pickleball and tennis players near you, at your level. Go available, post a game at your court, and watch it fill live.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres + PostGIS, Auth, Realtime) · Web Push · MapLibre + OpenFreeMap (OpenStreetMap data, free, no API key) · Vercel

## How it works

- **Availability:** a player goes available for 1–4 hours within a 2–20 mi radius. Their location is saved when they toggle on.
- **Hosting:** the host picks a court, format, start time and rating range. The app shows a fill-chance estimate: a Poisson model over the available and nearby players at that court and level (`lib/util.ts`).
- **Pings:** on posting, `/api/notify` sends a web push to players who are available, in range, and at the right level (`push_targets` in SQL).
- **Joining:** `join_game` locks the game row, so two people can't take the last spot.
- **Trust:** after a game, the host logs no-shows, which builds each player's show-up rate.
- **Sports:** pickleball and tennis. Every game has a sport, and matching uses your level in that sport.
- **Ratings that learn:** after a game, one player logs the score and everyone's level updates with a two-team TrueSkill model (`submit_result`). Players also rate each other's level and say whether they'd play together again. See [docs/DATA_MODEL.md](docs/DATA_MODEL.md).
- **Stats:** fill rate, median time to fill, show-up rate, and fills by start hour (`app_stats`).

## Setup

1. Create a Supabase project. In the SQL Editor, run every file in `supabase/migrations/` in filename order (or connect the repo with Supabase's GitHub integration, which applies them automatically).
2. Supabase → Authentication → URL Configuration: set **Site URL** to your production URL and add `https://*.vercel.app/**` to **Redirect URLs**.
3. Set these env vars (see `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (generate keys with `npx web-push generate-vapid-keys`)
4. `npm install && npm run dev`
5. `npm run test:db` tests the ratings SQL in an in-process Postgres.

## Key metric

Fill rate. Under ~50% means not enough players per court. Grow one court cluster at a time.
