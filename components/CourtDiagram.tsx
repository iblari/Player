import { initials } from "@/lib/util";

type P = { id: string; name: string; isMe?: boolean };

// Real court proportions: 44 ft x 20 ft, kitchen (non-volley zone) 7 ft each side of the net.
const W = 440;
const H = 200;
const M = 22; // run-off around the court
const K = 70; // kitchen depth, 7 ft at 10 px/ft

const DOUBLES = [
  { x: 0.24, y: 0.27 },
  { x: 0.76, y: 0.27 },
  { x: 0.24, y: 0.73 },
  { x: 0.76, y: 0.73 },
];
const SINGLES = [
  { x: 0.24, y: 0.5 },
  { x: 0.76, y: 0.5 },
];

export default function CourtDiagram({
  slots,
  players,
  size = "lg",
  label,
}: {
  slots: number;
  players: P[];
  size?: "sm" | "lg";
  label?: string;
}) {
  const spots = slots === 2 ? SINGLES : DOUBLES;
  const r = size === "lg" ? 30 : 34;
  const filled = players.length;
  return (
    <svg
      className={`court court-${size}`}
      viewBox={`0 0 ${W + M * 2} ${H + M * 2}`}
      role="img"
      aria-label={label ?? `${filled} of ${slots} players in`}
    >
      <rect className="court-runoff" x="0" y="0" width={W + M * 2} height={H + M * 2} rx="14" />
      <g transform={`translate(${M} ${M})`}>
        <rect className="court-surface" x="0" y="0" width={W} height={H} />
        <rect className="court-kitchen" x={W / 2 - K} y="0" width={K * 2} height={H} />
        <g className="court-lines">
          <rect x="0" y="0" width={W} height={H} fill="none" />
          <line x1={W / 2 - K} y1="0" x2={W / 2 - K} y2={H} />
          <line x1={W / 2 + K} y1="0" x2={W / 2 + K} y2={H} />
          <line x1="0" y1={H / 2} x2={W / 2 - K} y2={H / 2} />
          <line x1={W / 2 + K} y1={H / 2} x2={W} y2={H / 2} />
        </g>
        <line className="court-net" x1={W / 2} y1="-10" x2={W / 2} y2={H + 10} />
        {spots.map((s, i) => {
          const p = players[i];
          const cx = s.x * W;
          const cy = s.y * H;
          if (!p)
            return (
              <g key={`empty-${i}`} className="spot-empty">
                <circle cx={cx} cy={cy} r={r} />
                <line x1={cx - 9} y1={cy} x2={cx + 9} y2={cy} />
                <line x1={cx} y1={cy - 9} x2={cx} y2={cy + 9} />
              </g>
            );
          return (
            <g key={p.id} className={`spot-filled${p.isMe ? " is-me" : ""}`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
              <circle cx={cx} cy={cy} r={r} />
              {size === "lg" && <text x={cx} y={cy + 1}>{initials(p.name)}</text>}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
