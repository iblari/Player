"use client";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import CourtDiagram from "@/components/CourtDiagram";
import { SPORT_META, type Sport } from "@/lib/types";
import { fmtSkill, pastLabel } from "@/lib/util";

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
};

const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim() : `${m}m`);

/** One finished game, Strava-style: who, where, result, time on court, and the rating move. */
export default function ActivityCard({ a, ownerId, ownerName, ownerAvatar }: { a: Activity; ownerId: string; ownerName: string; ownerAvatar: string | null }) {
  const meta = SPORT_META[a.sport] ?? SPORT_META.pickleball;
  const players = a.players ?? [];
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name || "Player";
  const others = players.filter((p) => p.id !== ownerId);
  const onA = a.team_a?.includes(ownerId);
  const mine = a.score_a == null ? null : onA ? a.score_a : a.score_b;
  const theirs = a.score_a == null ? null : onA ? a.score_b : a.score_a;
  const partner = a.slots === 4 && a.team_a && a.team_b ? (onA ? a.team_a : a.team_b).find((x) => x !== ownerId) : undefined;
  const opponents = a.team_a && a.team_b ? (onA ? a.team_b : a.team_a) : others.map((p) => p.id);
  const delta = a.level_before != null && a.level_after != null ? Number(a.level_after) - Number(a.level_before) : null;
  // Seat players by team on the diagram: my side left.
  const seated = a.team_a && a.team_b
    ? (() => {
        const mySide = onA ? a.team_a! : a.team_b!;
        const other = onA ? a.team_b! : a.team_a!;
        return [mySide[0], other[0], mySide[1], other[1]].filter(Boolean) as string[];
      })()
    : players.map((p) => p.id);

  const kind = a.slots === 4 ? "doubles" : "singles";
  const title =
    a.won == null ? `${meta.label} ${kind}` : `${a.won ? "Won" : "Lost"} ${meta.label.toLowerCase()} ${kind}`;

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
          <span>Score</span>
          <b className={a.won ? "win" : ""}>{mine != null ? `${mine}–${theirs}` : "–"}</b>
        </div>
        <div>
          <span>Time</span>
          <b>{a.minutes ? dur(a.minutes) : "–"}</b>
        </div>
        <div>
          <span>{meta.rating}</span>
          <b>
            {a.level_after != null ? fmtSkill(Number(a.level_after)) : "–"}
            {delta != null && Math.abs(delta) >= 0.005 && <em className={delta > 0 ? "up" : "down"}>{delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}</em>}
          </b>
        </div>
      </div>

      <Link href={`/g/${a.game_id}`} className="act-court" aria-label="Open this game">
        <CourtDiagram slots={a.slots} players={seated.map((id) => ({ id, name: nameOf(id), isMe: id === ownerId }))} />
      </Link>
    </article>
  );
}
