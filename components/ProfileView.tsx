"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isMissing } from "@/lib/rpc";
import { useSession } from "@/components/Session";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import ActivityCard, { type Activity } from "@/components/ActivityCard";
import { BackIcon } from "@/components/Icons";
import { SPORT_META, SPORTS, type Sport } from "@/lib/types";
import { fmtSkill } from "@/lib/util";

type Card = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  sports: Partial<Record<Sport, number>>;
  clubs: string[] | null;
  followers: number;
  following: number;
  games: number;
  am_following: boolean;
  follows_me: boolean;
  visibility: "everyone" | "followers" | "private" | null;
  can_see: boolean;
  ratings: { sport: Sport; level: number; games: number }[];
};
type Hist = { sport: Sport; mu_after: number; created_at: string };
type Person = { id: string; display_name: string; avatar_url: string | null; am_following: boolean };

const VIS: Record<string, string> = { everyone: "Everyone", followers: "Followers", private: "Only you" };

/** Small line of a rating over time. */
function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const w = 120, h = 34, lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * w).toFixed(1)} ${(h - 3 - ((v - lo) / span) * (h - 6)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--ball)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Strava-style profile: photo, name, games played, followers/following, follow or edit,
 * then Activities (finished games) and Progress (ratings over time).
 */
export default function ProfileView({ userId: who }: { userId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { userId } = useSession();
  const self = userId === who;
  const [card, setCard] = useState<Card | null | undefined>();
  const [acts, setActs] = useState<Activity[] | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [tab, setTab] = useState<"activities" | "progress">("activities");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<null | { kind: "followers" | "following"; people: Person[] | null }>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const { data, error } = await sb.rpc("profile_card", { p_user: who });
    if (isMissing(error)) {
      setMissing(true);
      setCard(null);
      return;
    }
    setCard((data as Card) ?? null);
    const [{ data: a }, { data: h }] = await Promise.all([
      sb.rpc("player_activities", { p_user: who, p_limit: 30 }),
      sb.from("rating_history").select("sport, mu_after, created_at").eq("player_id", who).order("created_at"),
    ]);
    setActs((a as Activity[]) ?? []);
    setHist(((h as Hist[]) ?? []).map((x) => ({ ...x, mu_after: Number(x.mu_after) })));
  }, [who]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleFollow() {
    if (!userId) return router.push(`/login?next=/p/${who}`);
    if (!card) return;
    setBusy(true);
    const sb = supabase();
    const { error } = card.am_following
      ? await sb.from("follows").delete().eq("follower_id", userId).eq("followee_id", who)
      : await sb.from("follows").insert({ follower_id: userId, followee_id: who });
    setBusy(false);
    if (error) return toast("Couldn't update. Try again.");
    load();
  }

  async function share() {
    const url = `${window.location.origin}/p/${who}`;
    const text = `${card?.display_name ?? "My"} on Let's Rally`;
    try {
      if (navigator.share) await navigator.share({ title: text, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Profile link copied.");
      }
    } catch {
      /* dismissed */
    }
  }

  async function openList(kind: "followers" | "following") {
    setList({ kind, people: null });
    const { data } = await supabase().rpc("follow_list", { p_user: who, p_kind: kind });
    setList({ kind, people: (data as Person[]) ?? [] });
  }

  if (card === undefined) return <div className="skeleton" style={{ minHeight: 240 }} />;
  if (missing)
    return (
      <div className="empty">
        <strong>Profiles switch on with the next database update.</strong>
        {self && <Link className="btn btn-sm" href="/me/edit">Edit profile</Link>}
      </div>
    );
  if (!card)
    return (
      <div className="empty">
        <strong>This player doesn&apos;t exist anymore.</strong>
        <Link className="btn btn-sm" href="/play">Back home</Link>
      </div>
    );

  const sportsPlayed = SPORTS.filter((s) => card.sports?.[s.id] || card.ratings.some((r) => r.sport === s.id));

  return (
    <div className="prof">
      <div className="prof-bar">
        {!self && (
          <button className="mf-back" onClick={() => router.back()} aria-label="Back">
            <BackIcon />
          </button>
        )}
        <span style={{ flex: 1 }} />
        {self && (
          <Link className="prof-icon" href="/me/edit" aria-label="Settings">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </Link>
        )}
      </div>

      <header className="prof-head">
        <Avatar id={card.id} name={card.display_name || "Player"} size={84} src={card.avatar_url} />
        <div className="prof-id">
          <h1>{card.display_name || "Player"}</h1>
          <span className="muted">
            {card.games} game{card.games === 1 ? "" : "s"}
            {sportsPlayed.length ? ` · ${sportsPlayed.map((s) => s.label).join(" & ")}` : ""}
          </span>
          {!!card.clubs?.length && (
            <div className="prof-clubs">
              {card.clubs.map((c) => (
                <span key={c} className="pill">{c}</span>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="prof-follow">
        <button onClick={() => openList("followers")}>
          <b>{card.followers}</b> follower{card.followers === 1 ? "" : "s"}
        </button>
        <span aria-hidden="true">•</span>
        <button onClick={() => openList("following")}>
          <b>{card.following}</b> following
        </button>
        {!self && card.follows_me && <span className="pill" style={{ marginLeft: 6 }}>Follows you</span>}
      </div>

      <div className="btn-row">
        {self ? (
          <Link className="btn" href="/me/edit">
            Edit profile
          </Link>
        ) : (
          <button className={`btn${card.am_following ? "" : " btn-ball"}`} onClick={toggleFollow} disabled={busy}>
            {card.am_following ? "Following" : "Follow"}
          </button>
        )}
        <button className="btn" onClick={share}>
          Share profile
        </button>
      </div>

      <nav className="prof-tabs" role="tablist">
        {(["activities", "progress"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === "activities" ? "Activities" : "Progress"}
          </button>
        ))}
      </nav>

      {tab === "activities" ? (
        <div className="prof-acts">
          {self && card.visibility && (
            <Link href="/me/edit" className="prof-vis">
              Visible to: <b>{VIS[card.visibility]}</b> · change
            </Link>
          )}
          {acts === null ? (
            <div className="skeleton" style={{ minHeight: 200 }} />
          ) : acts.length === 0 && !card.can_see ? (
            <div className="empty">
              <strong>{card.display_name}&apos;s activities are {card.am_following ? "private" : "for followers"}.</strong>
              {!card.am_following && (
                <button className="btn btn-sm btn-ball" onClick={toggleFollow} disabled={busy}>
                  Follow
                </button>
              )}
            </div>
          ) : acts.length === 0 ? (
            <div className="empty">
              <strong>No games yet.</strong>
              <span>{self ? "Finish a game and enter the score: it shows up here, like a run on Strava." : "Their finished games will show up here."}</span>
              {self && <Link className="btn btn-sm btn-ball" href="/play">Find a game</Link>}
            </div>
          ) : (
            acts.map((a) => (
              <ActivityCard
                key={a.game_id}
                a={a}
                ownerId={card.id}
                ownerName={card.display_name || "Player"}
                ownerAvatar={card.avatar_url}
                editable={self}
                onVisibility={async (v) => {
                  const { error } = await supabase().rpc("set_activity_visibility", { p_game: a.game_id, p_vis: v });
                  if (error) return toast(isMissing(error) ? "Per-game visibility switches on with the next update." : "Couldn't change it. Try again.");
                  setActs((xs) => (xs ?? []).map((x) => (x.game_id === a.game_id ? { ...x, visibility: v, effective_visibility: v ?? card.visibility } : x)));
                }}
              />
            ))
          )}
        </div>
      ) : (
        <div className="prof-prog">
          {sportsPlayed.length === 0 && <div className="empty"><strong>No sports added yet.</strong></div>}
          {sportsPlayed.map((s) => {
            const meta = SPORT_META[s.id];
            const r = card.ratings.find((x) => x.sport === s.id);
            const pts = hist.filter((h) => h.sport === s.id).map((h) => h.mu_after);
            const first = pts[0];
            return (
              <div className="prog" key={s.id}>
                <div className="prog-top">
                  <span>
                    <b>{s.label}</b>
                    <small>{r ? `${r.games} rated game${r.games === 1 ? "" : "s"}` : card.sports?.[s.id] ? `Self-rated ${card.sports[s.id]}/10` : "Not rated yet"}</small>
                  </span>
                  <span className="prog-num">
                    {r ? fmtSkill(Number(r.level)) : "–"}
                    <small>{meta.rating}</small>
                  </span>
                </div>
                {pts.length >= 2 && (
                  <div className="prog-chart">
                    <Spark pts={[first, ...pts]} />
                    <small className={pts[pts.length - 1] >= first ? "up" : "down"}>
                      {pts[pts.length - 1] >= first ? "+" : ""}
                      {(pts[pts.length - 1] - first).toFixed(2)} since first rated game
                    </small>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {list && (
        <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={list.kind} onClick={() => setList(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" aria-hidden="true" />
            <h2 style={{ fontSize: "1.15rem" }}>{list.kind === "followers" ? "Followers" : "Following"}</h2>
            <div className="list">
              {list.people === null ? (
                <div className="list-row"><span className="muted">Loading…</span></div>
              ) : list.people.length === 0 ? (
                <div className="list-row"><span className="muted">{list.kind === "followers" ? "No followers yet." : "Not following anyone yet."}</span></div>
              ) : (
                list.people.map((p) => (
                  <Link key={p.id} className="list-row" href={p.id === userId ? "/me" : `/p/${p.id}`} onClick={() => setList(null)}>
                    <Avatar id={p.id} name={p.display_name || "Player"} size={36} src={p.avatar_url} />
                    <span className="grow">
                      <span className="t">{p.display_name || "Player"}</span>
                      {p.am_following && <span className="m">Following</span>}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
