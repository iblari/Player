import { NextResponse } from "next/server";
import webpush from "web-push";
import { serverSupabase } from "@/lib/supabase/server";
import { VAPID_PUBLIC_KEY } from "@/lib/env";

export const runtime = "nodejs";

/** Someone joined a logged match through an invite link: ask the logger "Is this them?". */
export async function POST(request: Request) {
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!VAPID_PUBLIC_KEY || !priv) return NextResponse.json({ sent: 0, reason: "push_not_configured" });
  const { gameId } = (await request.json().catch(() => ({}))) as { gameId?: string };
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });
  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  // Only answers the person who just joined, for a few minutes.
  const [{ data: targets }, { data: me }] = await Promise.all([
    sb.rpc("claim_push_targets", { p_game: gameId }),
    sb.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (!targets?.length) return NextResponse.json({ sent: 0 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@playersclub.io", VAPID_PUBLIC_KEY, priv);
  const payload = JSON.stringify({
    title: `${me?.display_name || "Someone"} joined your logged match`,
    body: "Is this who you played? Tap to approve so the score can count.",
    url: `/g/${gameId}#score`,
    tag: `claimed-${gameId}`,
  });
  const results = await Promise.allSettled(
    (targets as { endpoint: string; p256dh: string; auth: string }[]).map((t) =>
      webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 7 * 86400 })
    )
  );
  return NextResponse.json({ sent: results.filter((r) => r.status === "fulfilled").length });
}
