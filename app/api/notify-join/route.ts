import { NextResponse } from "next/server";
import webpush from "web-push";
import { serverSupabase } from "@/lib/supabase/server";
import { VAPID_PUBLIC_KEY } from "@/lib/env";

export const runtime = "nodejs";

/** Someone just joined a game: tell the players already in it. The database only returns
 * targets for the caller's own join, in the two minutes after it. */
export async function POST(request: Request) {
  const pub = VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ sent: 0, reason: "push_not_configured" });

  const { gameId } = (await request.json().catch(() => ({}))) as { gameId?: string };
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const [{ data: targets }, { data: game }, { count }, { data: me }] = await Promise.all([
    sb.rpc("join_push_targets", { p_game: gameId }),
    sb.from("games").select("*, courts(name)").eq("id", gameId).maybeSingle(),
    sb.from("game_players").select("player_id", { count: "exact", head: true }).eq("game_id", gameId),
    sb.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (!game || !targets?.length) return NextResponse.json({ sent: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@playersclub.io", pub, priv);
  const who = me?.display_name || "A player";
  const court = (game.courts as { name: string } | null)?.name ?? "the court";
  const n = count ?? 0;
  const left = game.slots - n;
  const kind = `${game.sport === "tennis" ? "Tennis" : "Pickleball"} ${game.slots === 4 ? "doubles" : "singles"}`;
  const start = new Date(game.starts_at);
  const mins = Math.round((start.getTime() - Date.now()) / 60000);
  const at = mins <= 10 ? "now" : start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  const payload =
    left <= 0
      ? { title: `Game on · ${court}`, body: `${who} joined. ${kind}, ${mins <= 10 ? "starting now" : `at ${at}`}. Tap for the game and directions.`, tag: `game-${gameId}` }
      : { title: `${who} joined your game`, body: `${kind} at ${court} · ${n}/${game.slots}, ${left} more to go.`, tag: `game-${gameId}` };

  const results = await Promise.allSettled(
    (targets as { endpoint: string; p256dh: string; auth: string }[]).map((t) =>
      webpush
        .sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, JSON.stringify({ ...payload, url: `/g/${gameId}` }), { TTL: 3600, urgency: "high" })
        .catch(async (e: { statusCode?: number }) => {
          if (e?.statusCode === 404 || e?.statusCode === 410) await sb.rpc("drop_push_endpoint", { p_endpoint: t.endpoint });
          throw e;
        })
    )
  );
  return NextResponse.json({ sent: results.filter((r) => r.status === "fulfilled").length, attempted: results.length });
}
