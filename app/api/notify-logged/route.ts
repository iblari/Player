import { NextResponse } from "next/server";
import webpush from "web-push";
import { serverSupabase } from "@/lib/supabase/server";
import { VAPID_PUBLIC_KEY } from "@/lib/env";

export const runtime = "nodejs";

/** Someone logged a match with you: ask the other players to confirm the score. */
export async function POST(request: Request) {
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!VAPID_PUBLIC_KEY || !priv) return NextResponse.json({ sent: 0, reason: "push_not_configured" });
  const { gameId } = (await request.json().catch(() => ({}))) as { gameId?: string };
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });
  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  // The function only answers the logger, for a few minutes after logging.
  const [{ data: targets }, { data: me }, { data: game }] = await Promise.all([
    sb.rpc("logged_push_targets", { p_game: gameId }),
    sb.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
    sb.from("games").select("sport, courts(name)").eq("id", gameId).maybeSingle(),
  ]);
  if (!targets?.length) return NextResponse.json({ sent: 0 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@playersclub.io", VAPID_PUBLIC_KEY, priv);
  const who = me?.display_name || "A player";
  const court = (game?.courts as unknown as { name: string } | null)?.name;
  const payload = JSON.stringify({
    title: `${who} logged a match with you`,
    body: `${game?.sport === "tennis" ? "Tennis" : "Pickleball"}${court ? ` at ${court}` : ""}. Tap to confirm the score, fix it, or say it didn't happen.`,
    url: `/g/${gameId}#score`,
    tag: `logged-${gameId}`,
  });
  const results = await Promise.allSettled(
    (targets as { endpoint: string; p256dh: string; auth: string }[]).map((t) =>
      webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 7 * 86400 })
    )
  );
  return NextResponse.json({ sent: results.filter((r) => r.status === "fulfilled").length });
}
