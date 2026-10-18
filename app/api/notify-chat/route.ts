import { NextResponse } from "next/server";
import webpush from "web-push";
import { serverSupabase } from "@/lib/supabase/server";
import { VAPID_PUBLIC_KEY } from "@/lib/env";

export const runtime = "nodejs";

/** Push a new chat message to the other players in the game. The database only returns
 * targets when the caller sent that message in the last two minutes. */
export async function POST(request: Request) {
  const pub = VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ sent: 0, reason: "push_not_configured" });

  const { messageId } = (await request.json().catch(() => ({}))) as { messageId?: number };
  if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });

  const sb = await serverSupabase();
  const { data: user } = await sb.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const [{ data: targets }, { data: msg }] = await Promise.all([
    sb.rpc("chat_push_targets", { p_message: messageId }),
    sb.from("game_messages").select("game_id, body, profiles(display_name), games(courts(name))").eq("id", messageId).maybeSingle(),
  ]);
  if (!msg || !targets?.length) return NextResponse.json({ sent: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@fourthup.app", pub, priv);
  const who = (msg.profiles as unknown as { display_name: string } | null)?.display_name || "A player";
  const court = (msg.games as unknown as { courts: { name: string } | null } | null)?.courts?.name;
  const body = msg.body.length > 140 ? msg.body.slice(0, 139) + "…" : msg.body;
  const payload = JSON.stringify({
    title: court ? `${who} · ${court}` : who,
    body,
    url: `/g/${msg.game_id}/chat`,
    tag: `chat-${msg.game_id}`,
  });

  const results = await Promise.allSettled(
    (targets as { endpoint: string; p256dh: string; auth: string }[]).map((t) =>
      webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 3600, urgency: "high" })
    )
  );
  return NextResponse.json({ sent: results.filter((r) => r.status === "fulfilled").length, attempted: results.length });
}
