"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/components/Session";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import { VAPID_PUBLIC_KEY } from "@/lib/env";
import { clampSkill, fmtSkill, urlBase64ToUint8Array } from "@/lib/util";

type PushState = "unsupported" | "ios-install" | "off" | "on" | "blocked";

export default function MePage() {
  const router = useRouter();
  const toast = useToast();
  const { userId, profile, update } = useSession();
  const [name, setName] = useState("");
  const [skill, setSkill] = useState(3);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [push, setPush] = useState<PushState>("off");

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name.includes("@") ? "" : profile.display_name);
    setSkill(Number(profile.skill));
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setPush(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setPush("blocked");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setErr("Enter the name other players know you by.");
    setErr(null);
    setSaving(true);
    const e2 = await update({ display_name: name.trim(), skill });
    setSaving(false);
    toast(e2 ?? "Profile saved.");
  }

  async function enablePush() {
    const key = VAPID_PUBLIC_KEY;
    if (!key || !userId) return toast("Notifications aren't set up on this server yet.");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setPush(perm === "denied" ? "blocked" : "off");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
      const j = sub.toJSON();
      const { error } = await supabase()
        .from("push_subscriptions")
        .upsert({ endpoint: sub.endpoint, user_id: userId, p256dh: j.keys!.p256dh, auth: j.keys!.auth });
      if (error) throw error;
      setPush("on");
      toast("Notifications on. You'll get pinged while you're available.");
    } catch {
      toast("Couldn't turn on notifications. Try again.");
    }
  }

  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    setPush("off");
    toast("Notifications off.");
  }

  async function signOut() {
    await supabase().auth.signOut();
    router.replace("/");
  }

  return (
    <>
      <div className="page-head">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {userId && <Avatar id={userId} name={name || "?"} size={56} />}
          <div>
            <h1>{name || "Your profile"}</h1>
            <p className="sub">Rated {fmtSkill(skill)}</p>
          </div>
        </div>
      </div>

      <form className="block" onSubmit={save} noValidate>
        <label className="field">
          <span>Name players see</span>
          <input id="display-name" className="input" maxLength={40} placeholder="Ib L." value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Rating</span>
          <div className="stepper">
            <button type="button" aria-label="Lower rating" disabled={skill <= 2} onClick={() => setSkill(clampSkill(skill - 0.25))}>
              −
            </button>
            <output>{fmtSkill(skill)}</output>
            <button type="button" aria-label="Raise rating" disabled={skill >= 5.5} onClick={() => setSkill(clampSkill(skill + 0.25))}>
              +
            </button>
          </div>
          <span className="small muted" style={{ fontWeight: 400 }}>
            Use your DUPR if you have one. Otherwise: 2.5 learning the rules, 3.0 consistent dinks, 3.5 controlled drops, 4.0 attacks and resets.
          </span>
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>

      <section className="block">
        <h2>Notifications</h2>
        {push === "on" ? (
          <div className="btn-row">
            <span className="pill pill-ok" style={{ alignSelf: "center", flex: "none" }}>
              <span className="dot" /> On
            </span>
            <button className="btn btn-sm" onClick={disablePush}>
              Turn off
            </button>
          </div>
        ) : push === "off" ? (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              Get pinged when someone near you posts a game at your level, only while you&apos;re available.
            </p>
            <button className="btn btn-ball" onClick={enablePush}>
              Turn on notifications
            </button>
          </>
        ) : push === "ios-install" ? (
          <p className="small muted" style={{ margin: 0 }}>
            On iPhone, add Fourth Up to your home screen first: tap Share, then Add to Home Screen. Open it from there to turn on notifications.
          </p>
        ) : push === "blocked" ? (
          <p className="small muted" style={{ margin: 0 }}>
            Notifications are blocked for this site. Allow them in your browser settings, then come back.
          </p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            This browser doesn&apos;t support notifications. Try Chrome, or Safari from your home screen.
          </p>
        )}
      </section>

      <button className="btn btn-ghost" onClick={signOut}>
        Sign out
      </button>
    </>
  );
}
