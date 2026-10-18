"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/components/Session";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import { fmtSkill } from "@/lib/util";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { levelToSkill, selfLevel, SPORT_META, skillToLevel, SPORTS, type Sport } from "@/lib/types";
import { useMyRatings } from "@/lib/sport";

const KNOWN_CLUBS = ["Life Time", "Equinox"];


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
  const [clubs, setClubs] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [push, setPush] = useState<PushState>("off");
  const ratings = useMyRatings(userId);

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name.includes("@") ? "" : profile.display_name);
    setPhoto(profile.avatar_url ?? null);
    setClubs(profile.clubs ?? []);
    const s = { ...(profile.sports ?? {}) };
    if (!Object.keys(s).length) s.pickleball = skillToLevel(Number(profile.skill));
    setSports(s);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pushState(userId).then(setPush);
  }, [userId]);

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
    const patch: Parameters<typeof update>[0] = { display_name: name.trim(), sports, clubs };
    if (sports.pickleball) patch.skill = levelToSkill(sports.pickleball);
    const e2 = await update(patch);
    setSaving(false);
    toast(e2 ?? "Profile saved.");
  }

  async function turnOnPush() {
    if (!userId) return;
    try {
      const st = await enablePush(userId);
      setPush(st);
      if (st === "on") toast("Notifications on. You'll hear when your games fill.");
    } catch {
      toast("Couldn't turn on notifications. Try again.");
    }
  }
  async function turnOffPush() {
    await disablePush();
    setPush("off");
    toast("Notifications off.");
  }
  async function signOut() {
    await supabase().auth.signOut();
    router.replace("/");
  }

  const saved = {
    name: profile ? (profile.display_name.includes("@") ? "" : profile.display_name) : "",
    sports: JSON.stringify(profile?.sports ?? {}),
    clubs: JSON.stringify([...(profile?.clubs ?? [])].sort()),
  };
  const dirty =
    !!profile &&
    (name.trim() !== saved.name || JSON.stringify(sports) !== saved.sports || JSON.stringify([...clubs].sort()) !== saved.clubs);
  const sportSummary = SPORTS.filter((s) => sports[s.id]).map((s) => `${s.label} ${sports[s.id]}/10`).join(" · ");


  return (
    <>
      <header className="me-head">
        <button type="button" className="me-photo" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Change profile photo">
          {userId && <Avatar id={userId} name={name || "?"} size={88} src={photo} />}
          <span className="me-photo-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
        </button>
        <input ref={fileRef} id="photo" type="file" accept="image/*" hidden onChange={onPhoto} />
        <div className="me-id">
          <h1>{name || "Your profile"}</h1>
          <p className="sub">{uploading ? "Uploading photo…" : sportSummary || "Add the sports you play"}</p>
          {clubs.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {clubs.map((c) => (
                <span key={c} className="pill pill-ball">{c} member</span>
              ))}
            </div>
          )}
        </div>
      </header>

      <form id="profile-form" onSubmit={save} noValidate className="me-form">
        <section className="me-section">
          <h2 className="me-title">Profile</h2>
          <label className="field">
            <span>Name players see</span>
            <input id="display-name" className="input" maxLength={40} placeholder="Ib L." value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </section>

        <section className="me-section">
          <h2 className="me-title">Sports</h2>
          <div className="seg">
            {SPORTS.map((s) => (
              <button key={s.id} type="button" aria-pressed={!!sports[s.id]} onClick={() => toggleSport(s.id)}>
                {sports[s.id] ? "✓ " : "+ "}
                {s.label}
              </button>
            ))}
          </div>
          {SPORTS.filter((s) => sports[s.id]).map((s) => {
            const lv = sports[s.id]!;
            const learned = ratings?.[s.id];
            return (
              <div key={s.id} className="level-card">
                <div className="level-top">
                  <b>{s.label}</b>
                  <span className="level-num">
                    {lv}
                    <span>/10</span>
                  </span>
                </div>
                <input
                  id={`level-${s.id}`}
                  className="level-range"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={lv}
                  style={{ ["--p" as string]: `${((lv - 1) / 9) * 100}%` }}
                  onChange={(e) => setSports((x) => ({ ...x, [s.id]: Number(e.target.value) }))}
                  aria-label={`${s.label} level, 1 to 10`}
                />
                <div className="level-foot">
                  <span>{LEVEL_HINTS[s.id][lv - 1]}</span>
                  <span className="muted">
                    ≈ {SPORT_META[s.id].rating} {fmtSkill(s.id === "pickleball" ? levelToSkill(lv) : selfLevel(s.id, lv))}
                  </span>
                </div>
                {learned && learned.games > 0 && (
                  <div className="learned">
                    <span>
                      Your rating from {learned.games} scored game{learned.games === 1 ? "" : "s"}
                      <small> · ±{learned.sigma.toFixed(2)}</small>
                    </span>
                    <b>{learned.level.toFixed(2)}</b>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className="me-section">
          <h2 className="me-title">Clubs</h2>
          <div className="list">
            {KNOWN_CLUBS.map((c) => {
              const on = clubs.includes(c);
              return (
                <div key={c} className="list-row" style={{ cursor: "default" }}>
                  <span className="grow">
                    <span className="t">{c} member</span>
                    <span className="m" style={{ whiteSpace: "normal" }}>See and join {c} games. Guests can&apos;t play.</span>
                  </span>
                  <button
                    type="button"
                    className={`toggle${on ? " on" : ""}`}
                    role="switch"
                    aria-checked={on}
                    aria-label={`${c} member`}
                    onClick={() => setClubs((xs) => (on ? xs.filter((x) => x !== c) : [...xs, c]))}
                  />
                </div>
              );
            })}
          </div>
        </section>
        {err && <p className="err">{err}</p>}
      </form>

      <section className="me-section">
        <h2 className="me-title">Notifications</h2>
        <div className="list">
          <div className="list-row" style={{ cursor: "default", alignItems: "flex-start" }}>
            <span className="grow">
              <span className="t">Game pings</span>
              <span className="m" style={{ whiteSpace: "normal" }}>
                {push === "ios-install"
                  ? "On iPhone, add Fourth Up to your Home Screen first (Share → Add to Home Screen), then open it from there."
                  : push === "blocked"
                    ? "Blocked for this site. Allow notifications in your browser settings."
                    : push === "unsupported"
                      ? "This browser can't receive notifications. Try Chrome, or Safari from your Home Screen."
                      : "When someone joins your game, when it's game on, and when a game near you needs your level while you're available."}
              </span>
            </span>
            {(push === "on" || push === "off") && (
              <button
                type="button"
                className={`toggle${push === "on" ? " on" : ""}`}
                role="switch"
                aria-checked={push === "on"}
                aria-label="Game pings"
                onClick={() => (push === "on" ? turnOffPush() : turnOnPush())}
              />
            )}
          </div>
        </div>
      </section>

      <section className="me-section">
        <div className="list">
          <button type="button" className="list-row" onClick={signOut}>
            <span className="grow">
              <span className="t" style={{ color: "var(--bad)" }}>Sign out</span>
            </span>
          </button>
        </div>
      </section>

      {dirty && (
        <div className="savebar" role="region" aria-label="Unsaved changes">
          <span>Unsaved changes</span>
          <button className="btn btn-primary btn-sm" type="submit" form="profile-form" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </>
  );
}
