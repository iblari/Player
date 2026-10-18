"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/components/Session";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import { VAPID_PUBLIC_KEY } from "@/lib/env";
import { fmtSkill, urlBase64ToUint8Array } from "@/lib/util";
import { levelToSkill, skillToLevel, SPORTS, type Sport } from "@/lib/types";

type PushState = "unsupported" | "ios-install" | "off" | "on" | "blocked";

const LEVEL_HINTS: Record<Sport, string[]> = {
  pickleball: ["Brand new", "Learning to serve and return", "Learning the rules", "Can rally from the baseline", "Consistent dinks",
    "Controlled third-shot drops", "Mixes drops and drives", "Attacks and resets well", "Tournament level", "Pro / elite"],
  tennis: ["Brand new", "Learning strokes", "Can rally slowly", "Consistent groundstrokes", "Comfortable at the net",
    "Reliable serve, some spin", "Plays club matches", "Strong club / league player", "Tournament level", "College / pro"],
};

/** Center-crop and shrink a photo to a 512px square JPEG before upload. */
async function squareJpeg(file: File, size = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.86));
}

export default function MePage() {
  const router = useRouter();
  const toast = useToast();
  const { userId, profile, update } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [sports, setSports] = useState<Partial<Record<Sport, number>>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [push, setPush] = useState<PushState>("off");

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name.includes("@") ? "" : profile.display_name);
    setPhoto(profile.avatar_url ?? null);
    const s = { ...(profile.sports ?? {}) };
    if (!Object.keys(s).length) s.pickleball = skillToLevel(Number(profile.skill));
    setSports(s);
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

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !userId) return;
    if (!f.type.startsWith("image/")) return toast("Choose a photo (JPG, PNG, or HEIC).");
    setUploading(true);
    try {
      const blob = await squareJpeg(f);
      const path = `${userId}/${Date.now()}.jpg`;
      const sb = supabase();
      const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const e2 = await update({ avatar_url: url });
      if (e2) throw new Error(e2);
      setPhoto(url);
      toast("Photo updated.");
    } catch {
      toast("Couldn't upload that photo. Try a different one.");
    } finally {
      setUploading(false);
    }
  }

  function toggleSport(id: Sport) {
    setSports((s) => {
      const n = { ...s };
      if (n[id]) delete n[id];
      else n[id] = 5;
      return n;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setErr("Enter the name other players know you by.");
    if (!Object.keys(sports).length) return setErr("Pick at least one sport you play.");
    setErr(null);
    setSaving(true);
    const patch: Parameters<typeof update>[0] = { display_name: name.trim(), sports };
    if (sports.pickleball) patch.skill = levelToSkill(sports.pickleball);
    const e2 = await update(patch);
    setSaving(false);
    toast(e2 ?? "Profile saved.");
  }

  async function enablePush() {
    if (!userId) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setPush(perm === "denied" ? "blocked" : "off");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource });
      const j = sub.toJSON();
      const { error } = await supabase().from("push_subscriptions").upsert({ endpoint: sub.endpoint, user_id: userId, p256dh: j.keys!.p256dh, auth: j.keys!.auth });
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
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Change profile photo"
          style={{ position: "relative", border: 0, padding: 0, background: "none", cursor: "pointer", borderRadius: "50%" }}
        >
          {userId && <Avatar id={userId} name={name || "?"} size={84} src={photo} />}
          <span
            style={{
              position: "absolute", right: -2, bottom: -2, width: 30, height: 30, borderRadius: "50%",
              background: "var(--ink)", color: "#000", display: "grid", placeItems: "center", border: "3px solid var(--paper)",
            }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
        </button>
        <input ref={fileRef} id="photo" type="file" accept="image/*" hidden onChange={onPhoto} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: "1.75rem", overflowWrap: "anywhere" }}>{name || "Your profile"}</h1>
          <p className="sub">{uploading ? "Uploading photo…" : photo ? "Tap your photo to change it" : "Tap the circle to add a photo"}</p>
        </div>
      </div>

      <form className="block" onSubmit={save} noValidate style={{ gap: 20 }}>
        <label className="field">
          <span>Name players see</span>
          <input id="display-name" className="input" maxLength={40} placeholder="Ib L." value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="field">
          <span>Sports you play</span>
          <div className="seg">
            {SPORTS.map((s) => (
              <button key={s.id} type="button" aria-pressed={!!sports[s.id]} onClick={() => toggleSport(s.id)}>
                {sports[s.id] ? "✓ " : ""}
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {SPORTS.filter((s) => sports[s.id]).map((s) => {
          const lv = sports[s.id]!;
          return (
            <div key={s.id} className="tile" style={{ gap: 12 }}>
              <div className="block-head">
                <b>{s.label} level</b>
                <span className="num" style={{ fontSize: "1.5rem" }}>
                  {lv}
                  <span className="muted" style={{ fontSize: "1rem" }}>/10</span>
                </span>
              </div>
              <input
                id={`level-${s.id}`}
                type="range"
                min={1}
                max={10}
                step={1}
                value={lv}
                onChange={(e) => setSports((x) => ({ ...x, [s.id]: Number(e.target.value) }))}
                aria-label={`${s.label} level, 1 to 10`}
                style={{ width: "100%", accentColor: "#d8f03a" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="small" style={{ fontWeight: 600 }}>{LEVEL_HINTS[s.id][lv - 1]}</span>
                {s.id === "pickleball" && <span className="small muted">≈ DUPR {fmtSkill(levelToSkill(lv))}</span>}
              </div>
            </div>
          );
        })}
        {sports.tennis && (
          <p className="small muted" style={{ margin: "-8px 0 0" }}>
            Tennis games are coming soon. Your level is saved so you&apos;re ready when they launch.
          </p>
        )}

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
            <button className="btn btn-sm" onClick={disablePush}>Turn off</button>
          </div>
        ) : push === "off" ? (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              Get pinged when someone near you posts a game at your level, only while you&apos;re available.
            </p>
            <button className="btn btn-ball" onClick={enablePush}>Turn on notifications</button>
          </>
        ) : push === "ios-install" ? (
          <p className="small muted" style={{ margin: 0 }}>
            On iPhone, add Fourth Up to your home screen first: tap Share, then Add to Home Screen. Open it from there to turn on notifications.
          </p>
        ) : push === "blocked" ? (
          <p className="small muted" style={{ margin: 0 }}>Notifications are blocked for this site. Allow them in your browser settings, then come back.</p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>This browser doesn&apos;t support notifications. Try Chrome, or Safari from your home screen.</p>
        )}
      </section>

      <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
    </>
  );
}
