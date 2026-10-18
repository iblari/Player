import { NextResponse } from "next/server";
import webpush from "web-push";
import { serverSupabase } from "@/lib/supabase/server";
import { VAPID_PUBLIC_KEY } from "@/lib/env";

export const runtime = "nodejs";

/** Sends a test notification to the signed-in player's own devices. */
export async function POST() {
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!VAPID_PUBLIC_KEY || !priv) return NextResponse.json({ sent: 0, reason: "push_not_configured" });
  const sb = await serverSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: subs } = await sb.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", auth.user.id);
  if (!subs?.length) return NextResponse.json({ sent: 0, reason: "no_devices" });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@letslarp.io", VAPID_PUBLIC_KEY, priv);
  const payload = JSON.stringify({ title: "Notifications are on", body: "You'll hear when someone joins your game and when it's game on.", url: "/play", tag: "test" });
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600 }).catch(async (e: { statusCode?: number }) => {
        if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        throw e;
      })
    )
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ sent, attempted: subs.length, reason: sent ? undefined : "send_failed" });
}
