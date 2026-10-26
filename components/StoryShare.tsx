"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { buildStory, storyPhoto, type StoryData } from "@/lib/story";
import { track } from "@/lib/track";
import type { Activity } from "@/components/ActivityCard";

/**
 * "Share to story": renders a 1080x1920 image of a finished game (scoreboard, or the
 * stats over the player's own photo) and hands it to the phone's share sheet, so it can go
 * straight to an Instagram story. Pass the activity if you have it; otherwise it's loaded.
 */
export default function StoryShare({
  gameId,
  userId,
  activity,
  all,
  className = "btn btn-ball btn-block",
  label = "Share to story",
}: {
  gameId: string;
  userId: string;
  activity?: Activity;
  all?: Activity[];
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setOpen(true);
          track("story_opened");
        }}
      >
        <StoryIcon /> {label}
      </button>
      {open && <StorySheet gameId={gameId} userId={userId} activity={activity} all={all} onClose={() => setOpen(false)} />}
    </>
  );
}

function StorySheet({ gameId, userId, activity, all, onClose }: { gameId: string; userId: string; activity?: Activity; all?: Activity[]; onClose: () => void }) {
  const [acts, setActs] = useState<{ a: Activity; all: Activity[] } | null | undefined>(activity && all ? { a: activity, all } : undefined);
  const [variant, setVariant] = useState<StoryData["variant"]>("board");
  const [photo, setPhoto] = useState<string | null>(null);
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reqRef = useRef(0);

  // Load this player's recent games (for the result, record and streak) when not handed in.
  useEffect(() => {
    if (acts !== undefined) return;
    supabase()
      .rpc("player_activities", { p_user: userId, p_limit: 50 })
      .then(({ data }) => {
        const list = (data as Activity[]) ?? [];
        const a = list.find((x) => x.game_id === gameId);
        setActs(a ? { a, all: list } : null);
      });
  }, [acts, gameId, userId]);

  // Render the image whenever the card or photo changes; only the newest render is shown.
  useEffect(() => {
    if (!acts) return;
    const id = ++reqRef.current;
    setBusy(true);
    setErr(null);
    const body: StoryData = { ...buildStory(acts.a, userId, acts.all, variant), photo: variant === "photo" ? photo : null };
    fetch("/api/story", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        if (id !== reqRef.current) return;
        setImg((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { url: URL.createObjectURL(blob), blob };
        });
      })
      .catch(() => id === reqRef.current && setErr("Couldn't make the image. Check your connection and try again."))
      .finally(() => id === reqRef.current && setBusy(false));
  }, [acts, variant, photo, userId]);

  // Free the last preview when the sheet closes.
  const lastUrl = useRef<string | null>(null);
  useEffect(() => {
    lastUrl.current = img?.url ?? null;
  }, [img]);
  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    []
  );

  async function pick(f: File | undefined) {
    if (!f) return;
    try {
      setPhoto(await storyPhoto(f));
      setVariant("photo");
    } catch {
      setErr("Couldn't open that photo. Try a different one.");
    }
  }

  async function share() {
    if (!img) return;
    const file = new File([img.blob], "players-club-game.png", { type: "image/png" });
    track("story_shared", { variant, photo: !!photo });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    // No file sharing (most computers): download it instead.
    const a = document.createElement("a");
    a.href = img.url;
    a.download = file.name;
    a.click();
  }

  return (
    <div className="sheet-wrap" onClick={onClose} role="dialog" aria-modal="true" aria-label="Share to story">
      <div className="sheet story-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="story-head">
          <h2>Share to story</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {acts === null ? (
          <p className="muted">This game doesn&apos;t have a final score yet, so there&apos;s nothing to share.</p>
        ) : (
          <>
            <div className="segbar story-seg" role="group" aria-label="Card style">
              <button aria-pressed={variant === "board"} onClick={() => setVariant("board")}>
                Scoreboard
              </button>
              <button aria-pressed={variant === "photo"} onClick={() => (photo ? setVariant("photo") : fileRef.current?.click())}>
                {photo ? "Your photo" : "Add a photo"}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />

            <div className={`story-preview${busy ? " busy" : ""}`}>
              {img ? <img src={img.url} alt="Preview of your story image" /> : <span className="muted">Making your card…</span>}
            </div>
            {variant === "photo" && (
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                {photo ? "Change photo" : "Choose a photo"}
              </button>
            )}
            {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}

            <button className="btn btn-ball btn-block" onClick={share} disabled={!img || busy}>
              {busy && !img ? "Making your card…" : "Share"}
            </button>
            <span className="small muted" style={{ textAlign: "center" }}>
              On iPhone, tap Instagram, then Story. Your photo is only used to make this image; we don't save it.
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function StoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M12 8v6M9 11l3-3 3 3" />
    </svg>
  );
}
