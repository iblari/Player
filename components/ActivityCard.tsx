"use client";
import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import CourtDiagram from "@/components/CourtDiagram";
import { SPORT_META, type Sport } from "@/lib/types";
import { fmtSkill, pastLabel } from "@/lib/util";
import StoryShare from "@/components/StoryShare";

export type Activity = {
  game_id: string;
  sport: Sport;
  slots: number;
  court_name: string;
  town: string | null;
  starts_at: string;
  ended_at: string | null;
  minutes: number | null;
  team_a: string[] | null;
  team_b: string[] | null;
  score_a: number | null;
  score_b: number | null;
  won: boolean | null;
  level_before: number | null;
  level_after: number | null;
  players: { id: string; name: string; avatar_url: string | null }[] | null;
  /** Owner only: this activity's own setting (null = default) and what actually applies. */
  visibility?: Vis | null;
  effective_visibility?: Vis | null;
  games?: [number, number][] | null;
};
type Vis = "everyone" | "followers" | "private";

const VIS_LABEL: Record<Vis, string> = {
  everyone: "Everyone",
  followers: "Followers",
  private: "Only me",
};

function VisIcon({ v }: { v: Vis }) {
  const p = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (v === "private")
    return (
      <svg {...p}>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    );
  if (v === "followers")
    return (
      <svg {...p}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-2.5-5.1" />
      </svg>
    );
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

const dur = (m: number) =>
  m >= 60
    ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim()
    : `${m}m`;

/** One finished game, Strava-style: who, where, result, time on court, and the rating move. */
export default function ActivityCard({
  a,
  ownerId,
  ownerName,
  ownerAvatar,
  editable,
  onVisibility,
  all,
}: {
  a: Activity;
  ownerId: string;
  ownerName: string;
  ownerAvatar: string | null;
  editable?: boolean;
  onVisibility?: (v: Vis | null) => void;
  /** The owner's loaded games, for record and streak on the story card. */
  all?: Activity[];
}) {
  const [menu, setMenu] = useState(false);
  const eff = (a.effective_visibility ?? a.visibility ?? "everyone") as Vis;
  const meta = SPORT_META[a.sport] ?? SPORT_META.pickleball;
  const players = a.players ?? [];
  const nameOf = (id: string) =>
    players.find((p) => p.id === id)?.name || "Player";
  const others = players.filter((p) => p.id !== ownerId);
  const onA = a.team_a?.includes(ownerId);
  const mine = a.score_a == null ? null : onA ? a.score_a : a.score_b;
  const theirs = a.score_a == null ? null : onA ? a.score_b : a.score_a;
  const partner =
    a.slots === 4 && a.team_a && a.team_b
      ? (onA ? a.team_a : a.team_b).find((x) => x !== ownerId)
      : undefined;
  const opponents =
    a.team_a && a.team_b
      ? onA
        ? a.team_b
        : a.team_a
      : others.map((p) => p.id);
  const delta =
    a.level_before != null && a.level_after != null
      ? Number(a.level_after) - Number(a.level_before)
      : null;
  // Seat players by team on the diagram: my side left.
  const seated =
    a.team_a && a.team_b
      ? (() => {
          const mySide = onA ? a.team_a! : a.team_b!;
          const other = onA ? a.team_b! : a.team_a!;
          return [mySide[0], other[0], mySide[1], other[1]].filter(
            Boolean,
          ) as string[];
        })()
      : players.map((p) => p.id);

  const kind = a.slots === 4 ? "doubles" : "singles";
  const level = a.score_a != null && a.score_a === a.score_b;
  const title = level
    ? `Split ${meta.label.toLowerCase()} ${kind}`
    : a.won == null
      ? `${meta.label} ${kind}`
      : `${a.won ? "Won" : "Lost"} ${meta.label.toLowerCase()} ${kind}`;
  const unit = a.sport === "tennis" ? "sets" : "games";
  const myGames = (a.games ?? []).map(
    ([x, y]) => (onA ? [x, y] : [y, x]) as [number, number],
  );

  return (
    <article className="act">
      <header className="act-head">
        <Avatar id={ownerId} name={ownerName} size={40} src={ownerAvatar} />
        <span className="grow">
          <b>{ownerName}</b>
          <small>
            {pastLabel(a.starts_at)} · {a.court_name}
            {a.town ? `, ${a.town}` : ""}
          </small>
        </span>
        <span className={`act-sport act-${a.sport}`}>{meta.label}</span>
        {editable && (
          <span className="act-vis-wrap">
            <button
              className={`act-vis act-vis-${eff}`}
              onClick={() => setMenu((x) => !x)}
              aria-label={`Who can see this: ${VIS_LABEL[eff]}`}
              aria-expanded={menu}
            >
              <VisIcon v={eff} />
            </button>
            {menu && (
              <span className="act-vis-menu" role="menu">
                <span className="act-vis-cap">Who can see this game</span>
                {(["everyone", "followers", "private"] as Vis[]).map((v) => (
                  <button
                    key={v}
                    role="menuitemradio"
                    aria-checked={a.visibility === v}
                    onClick={() => {
                      setMenu(false);
                      onVisibility?.(v);
                    }}
                  >
                    <VisIcon v={v} /> {VIS_LABEL[v]}
                    {a.visibility === v && <b>✓</b>}
                  </button>
                ))}
                <button
                  role="menuitemradio"
                  aria-checked={!a.visibility}
                  onClick={() => {
                    setMenu(false);
                    onVisibility?.(null);
                  }}
                >
                  <span className="act-vis-def">↺</span> Use my default
                  {!a.visibility && <b>✓</b>}
                </button>
              </span>
            )}
          </span>
        )}
      </header>

      <Link href={`/g/${a.game_id}`} className="act-title">
        {title}
      </Link>
      <p className="act-with">
        {partner ? (
          <>
            with <Link href={`/p/${partner}`}>{nameOf(partner)}</Link> vs{" "}
          </>
        ) : (
          "vs "
        )}
        {opponents.map((id, i) => (
          <span key={id}>
            {i > 0 ? " & " : ""}
            <Link href={`/p/${id}`}>{nameOf(id)}</Link>
          </span>
        ))}
      </p>

      <div className="act-stats">
        <div>
          <span>
            {myGames.length > 1
              ? `${unit[0].toUpperCase()}${unit.slice(1)} won`
              : "Score"}
          </span>
          <b className={a.won ? "win" : ""}>
            {mine != null ? `${mine}–${theirs}` : "–"}
          </b>
        </div>
        <div>
          <span>Time</span>
          <b>{a.minutes ? dur(a.minutes) : "–"}</b>
        </div>
        <div>
          <span>{meta.rating}</span>
          <b>
            {a.level_after != null ? fmtSkill(Number(a.level_after)) : "–"}
            {delta != null && Math.abs(delta) >= 0.005 && (
              <em className={delta > 0 ? "up" : "down"}>
                {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
              </em>
            )}
          </b>
        </div>
      </div>

      {myGames.length > 1 && (
        <div
          className="act-games"
          aria-label={`Scores by ${unit.slice(0, -1)}`}
        >
          {myGames.map(([m, t], i) => (
            <span key={i} className={m > t ? "w" : ""}>
              {m}–{t}
            </span>
          ))}
        </div>
      )}

      <Link
        href={`/g/${a.game_id}`}
        className="act-court"
        aria-label="Open this game"
      >
        <CourtDiagram
          slots={a.slots}
          players={seated.map((id) => ({
            id,
            name: nameOf(id),
            isMe: id === ownerId,
          }))}
        />
      </Link>
      {editable &&
        (a.score_a != null ? (
          <StoryShare
            gameId={a.game_id}
            userId={ownerId}
            activity={a}
            all={all}
            className="btn btn-sm act-share"
          />
        ) : (
          // No final score yet, so nothing to put on a story card: send them to add it.
          <Link href={`/g/${a.game_id}#score`} className="btn btn-sm act-share">
            Add score to share
          </Link>
        ))}
    </article>
  );
}
