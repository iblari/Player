import Link from "next/link";
import CourtDiagram from "./CourtDiagram";
import { fmtSkill, miles, when } from "@/lib/util";
import { gameState } from "@/lib/types";
import type { GameView } from "@/lib/games";

export default function GameRow({
  g,
  me,
  names,
  actions,
}: {
  g: GameView;
  me: string | null;
  names: (id: string) => string;
  actions?: React.ReactNode;
}) {
  const n = g.player_ids.length;
  const st = gameState(g, n, g.slots);
  const left = g.slots - n;
  const pill =
    st === "full" ? (
      <span className="pill pill-ok">Game on</span>
    ) : st === "expired" ? (
      <span className="pill pill-bad">Didn&apos;t fill</span>
    ) : left === 1 ? (
      <span className="pill pill-warn">Need 1</span>
    ) : (
      <span className="pill">Need {left}</span>
    );
  return (
    <div className="row">
      <Link href={`/g/${g.id}`} aria-label={`Open game at ${g.court_name}`}>
        <CourtDiagram
          size="sm"
          slots={g.slots}
          players={g.player_ids.map((id) => ({ id, name: names(id), isMe: id === me }))}
        />
      </Link>
      <Link href={`/g/${g.id}`} className="row-main" style={{ textDecoration: "none" }}>
        <span className="row-title">{g.court_name}</span>
        <span className="row-meta">
          {g.slots === 4 ? "Doubles" : "Singles"}, {when(g.starts_at)}
          {g.distance_mi != null ? `, ${miles(g.distance_mi)}` : ""}
        </span>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {pill}
          <span className="pill">
            {fmtSkill(g.skill_min)}–{fmtSkill(g.skill_max)}
          </span>
        </span>
      </Link>
      {actions && <div className="row-actions">{actions}</div>}
    </div>
  );
}
