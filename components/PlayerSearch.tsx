"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { SearchIcon } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { searchPlayers, setFollow, sportsLabel, type FoundPlayer } from "@/lib/players";
import { track } from "@/lib/track";

/**
 * Search players by name. In "follow" mode each result has a Follow button and opens the profile;
 * in "pick" mode tapping a result chooses that player (for logging a match).
 */
export default function PlayerSearch({
  me,
  mode = "follow",
  onPick,
  exclude = [],
  autoFocus,
  placeholder = "Search players by name",
}: {
  me: string;
  mode?: "follow" | "pick";
  onPick?: (p: FoundPlayer) => void;
  exclude?: string[];
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<FoundPlayer[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const req = useRef(0);

  // Search as you type (newest answer wins).
  useEffect(() => {
    const id = ++req.current;
    const t = setTimeout(
      async () => {
        const r = await searchPlayers(q.trim());
        if (id === req.current) setRes(r);
      },
      q.trim().length >= 2 ? 220 : 0
    );
    return () => clearTimeout(t);
  }, [q]);

  async function follow(p: FoundPlayer) {
    setBusyId(p.id);
    const { error } = await setFollow(me, p.id, !p.following);
    setBusyId(null);
    if (error) return toast("Couldn't update. Try again.");
    if (!p.following) track("followed");
    setRes((xs) => xs?.map((x) => (x.id === p.id ? { ...x, following: !x.following } : x)) ?? null);
  }

  const list = (res ?? []).filter((p) => !exclude.includes(p.id));
  const typed = q.trim().length >= 2;

  return (
    <div className="psearch">
      <label className="search-pill psearch-box">
        <SearchIcon />
        <input
          className="psearch-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="search"
          aria-label={placeholder}
        />
        {q && (
          <button type="button" className="psearch-clear" onClick={() => setQ("")} aria-label="Clear">
            ×
          </button>
        )}
      </label>

      {!typed && list.length > 0 && <h3 className="psearch-cap">{mode === "pick" ? "People you've played with" : "Suggested for you"}</h3>}
      {res === null ? (
        <div className="skeleton" />
      ) : list.length === 0 ? (
        <p className="muted small psearch-empty">
          {typed
            ? `No players called “${q.trim()}”. Check the spelling, or share your QR code so they can find you.`
            : mode === "pick"
              ? "Type a name to find who you played with."
              : "Type a name to find friends. People you play with show up here too."}
        </p>
      ) : (
        <div className="list psearch-list">
          {list.map((p) => {
            const meta = [p.played_with ? `Played together ${p.played_with}×` : null, p.follows_me && !p.following ? "Follows you" : null, sportsLabel(p.sports) || null]
              .filter(Boolean)
              .join(" · ");
            const body = (
              <>
                <Avatar id={p.id} name={p.display_name} src={p.avatar_url} size={44} />
                <span className="grow">
                  <span className="t">{p.display_name}</span>
                  {meta && <span className="m">{meta}</span>}
                </span>
              </>
            );
            return mode === "pick" ? (
              <button key={p.id} type="button" className="list-row psearch-row" onClick={() => onPick?.(p)}>
                {body}
                <span className="psearch-add">Add</span>
              </button>
            ) : (
              <div key={p.id} className="list-row psearch-row">
                <Link href={`/p/${p.id}`} className="psearch-link">
                  {body}
                </Link>
                <button type="button" className={`btn btn-sm${p.following ? "" : " btn-ball"}`} disabled={busyId === p.id} onClick={() => follow(p)}>
                  {p.following ? "Following" : p.follows_me ? "Follow back" : "Follow"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
