import { NextResponse } from "next/server";
import webpush from "web-push";
import { serverSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ sent: 0, reason: "push_not_configured" });

  const { gameId } = (await request.json().catch(() => ({}))) as { gameId?: string };
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const sb = await serverSupabase();
  const { data: user } = await sb.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const [{ data: targets }, { data: game }] = await Promise.all([
    sb.rpc("push_targets", { p_game: gameId }),
    sb.from("games").select("slots, skill_min, skill_max, starts_at, courts(name)").eq("id", gameId).maybeSingle(),
  ]);
  if (!game || !targets?.length) return NextResponse.json({ sent: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@fourthup.app", pub, priv);
  const court = (game.courts as unknown as { name: string } | null)?.name ?? "a court near you";
  const start = new Date(game.starts_at);
  const mins = Math.round((start.getTime() - Date.now()) / 60000);
  const when = mins <= 20 ? "starting now" : start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  const payload = JSON.stringify({
    title: `${game.slots === 4 ? "Doubles" : "Singles"} at ${court}`,
    body: `${when}, rated ${Number(game.skill_min).toFixed(2)}–${Number(game.skill_max).toFixed(2)}. Tap to grab a spot.`,
    url: `/g/${gameId}`,
    tag: `game-${gameId}`,
  });

  const results = await Promise.allSettled(
    (targets as { endpoint: string; p256dh: string; auth: string }[]).map((t) =>
      webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 1800, urgency: "high" })
    )
  );
  return NextResponse.json({ sent: results.filter((r) => r.status === "fulfilled").length, attempted: results.length });
}
