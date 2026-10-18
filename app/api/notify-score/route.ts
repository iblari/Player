import { NextResponse } from "next/server";
import webpush from "web-push";
import { serverSupabase } from "@/lib/supabase/server";
import { VAPID_PUBLIC_KEY } from "@/lib/env";

export const runtime = "nodejs";

/** A player entered the score: ask the host to confirm it (their score is the final one). */
export async function POST(request: Request) {
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!VAPID_PUBLIC_KEY || !priv) return NextResponse.json({ sent: 0, reason: "push_not_configured" });
  const { gameId } = (await request.json().catch(() => ({}))) as { gameId?: string };
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });
  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const [{ data: targets }, { data: rep }, { data: me }, { data: game }] = await Promise.all([
    sb.rpc("score_push_targets", { p_game: gameId }),
    sb.from("score_reports").select("team_a, team_b, score_a, score_b").eq("game_id", gameId).eq("reporter_id", auth.user.id).maybeSingle(),
    sb.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
    sb.from("games").select("courts(name)").eq("id", gameId).maybeSingle(),
  ]);
  if (!targets?.length || !rep) return NextResponse.json({ sent: 0 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@letslarp.io", VAPID_PUBLIC_KEY, priv);
  const who = me?.display_name || "A player";
  const court = (game?.courts as unknown as { name: string } | null)?.name ?? "your game";
  const payload = JSON.stringify({
    title: `Confirm the score · ${court}`,
    body: `${who} entered ${rep.score_a}–${rep.score_b} (their side first). Tap to confirm or fix it. It's final in 24 hours otherwise.`,
    url: `/g/${gameId}`,
    tag: `score-${gameId}`,
  });
  const results = await Promise.allSettled(
    (targets as { endpoint: string; p256dh: string; auth: string }[]).map((t) =>
      webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 86400 })
    )
  );
  return NextResponse.json({ sent: results.filter((r) => r.status === "fulfilled").length });
}
