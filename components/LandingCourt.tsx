"use client";
import { useEffect, useState } from "react";
import CourtDiagram from "./CourtDiagram";

const CAST = [
  { id: "a", name: "Jordan Bell" },
  { id: "b", name: "Maya K" },
  { id: "c", name: "Dev R" },
  { id: "d", name: "Sam T" },
];

// The one orchestrated moment: the court fills, then resets.
export default function LandingCourt() {
  const [n, setN] = useState(1);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(4);
      return;
    }
    const t = setInterval(() => setN((x) => (x >= 4 ? 1 : x + 1)), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <CourtDiagram slots={4} players={CAST.slice(0, n)} label="A doubles court filling up, one player at a time" />
      <figcaption className="small muted" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Riverside Park · Court 3</span>
        <span className="num" style={{ fontSize: "1.1rem", color: "var(--ink)" }}>
          {n} / 4 {n === 4 ? "· game on" : `· need ${4 - n}`}
        </span>
      </figcaption>
    </figure>
  );
}
