"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CourtDiagram from "@/components/CourtDiagram";
import { useToast } from "@/components/Toast";
import { joinGame } from "@/lib/membership";
import { JOIN_MESSAGES } from "@/lib/games";
import { waitingGames, type Waiting } from "@/lib/courtSearch";
import { SPORT_META, type Sport } from "@/lib/types";
import { fmtSkill, when } from "@/lib/util";

/**
 * Someone already posted a game at this court: offer it first, one tap to join.
 * Renders nothing when there isn't one. `onNone` fires once we know there's nothing waiting.
 */
export default function WaitingGames({
  courtId,
  courtName,
  sport,
  userId,
  onNone,
  onFound,
  compact,
}: {
  courtId: string;
  courtName?: string;
  sport: Sport;
  userId: string | null;
  onNone?: () => void;
  onFound?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [games, setGames] = useState<Waiting[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setGames(null);
    waitingGames(courtId, sport, userId).then((g) => {
      if (!live) return;
      setGames(g);
      if (!g.length) onNone?.();
      else onFound?.();
    });
    return () => {
      live = false;
    };
  }, [courtId, sport, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!games?.length) return null;
  const meta = SPORT_META[sport];

  async function join(g: Waiting) {
    setBusy(g.id);
    const res = await joinGame(g.id);
    setBusy(null);
    if (res === "joined") {
      toast(`You're in. ${g.players.length + 1 >= g.slots ? "Game on." : "Waiting on the rest."}`);
      router.push(`/g/${g.id}`);
    } else if (res === "needs_membership" || res === "error") router.push(`/g/${g.id}`);
    else toast(JOIN_MESSAGES[res] ?? "Couldn't join. Try again.");
  }

  return (
    <div className={`waiting${compact ? " compact" : ""}`}>
      <div className="waiting-head">
        <span className="pulse" aria-hidden="true" />
        <b>
          {games.length === 1 ? "A game is waiting" : `${games.length} games waiting`}
          {courtName ? ` at ${courtName}` : " here"}
        </b>
      </div>
      {games.slice(0, 3).map((g) => {
        const left = g.slots - g.players.length;
        return (
          <div className="waiting-game" key={g.id}>
            <CourtDiagram size="sm" slots={g.slots} players={g.players.map((id) => ({ id, name: id === g.host_id ? g.host_name : "Player" }))} />
            <span className="grow">
              <span className="t">
                {g.host_name} · {g.slots === 4 ? "Doubles" : "Singles"}
              </span>
              <span className="m">
                Needs {left} · {when(g.starts_at)} · {meta.rating} {fmtSkill(g.skill_min)}–{fmtSkill(g.skill_max)}
              </span>
            </span>
            <button className="btn btn-ball btn-sm" onClick={() => join(g)} disabled={!!busy}>
              {busy === g.id ? "Joining…" : "Join"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
