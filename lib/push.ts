"use client";
import { supabase } from "@/lib/supabase/client";
import { VAPID_PUBLIC_KEY } from "@/lib/env";
import { urlBase64ToUint8Array } from "@/lib/util";

export type PushState = "unsupported" | "ios-install" | "off" | "on" | "blocked";

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;

function sameKey(sub: PushSubscription) {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // browser doesn't expose it; assume fine
  const a = new Uint8Array(k as ArrayBuffer);
  const b = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

async function save(sub: PushSubscription, userId: string) {
  const j = sub.toJSON();
  const { error } = await supabase().from("push_subscriptions").upsert({ endpoint: sub.endpoint, user_id: userId, p256dh: j.keys!.p256dh, auth: j.keys!.auth });
  if (error) throw error;
}

/** Current state. If notifications were allowed but the subscription was made with an old
 * key (or never saved), quietly re-subscribe so pings actually arrive. */
export async function pushState(userId: string | null): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return isIOS() && !standalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  let sub = await reg?.pushManager.getSubscription();
  if (sub && !sameKey(sub)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
    if (Notification.permission === "granted" && reg && userId) {
      try {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource });
        await save(sub, userId);
      } catch {
        sub = null;
      }
    }
  }
  return sub ? "on" : "off";
}

export async function enablePush(userId: string): Promise<PushState> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "blocked" : "off";
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource });
  await save(sub, userId);
  return "on";
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}

/** Tell the other players in a game that I just joined (and whether that made it a game). */
export function notifyJoined(gameId: string) {
  fetch("/api/notify-join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId }) }).catch(() => {});
}
