"use client";
import Link from "next/link";
import type { Court } from "@/lib/types";
import { miles } from "@/lib/util";

function tags(c: Court): string[] {
  const t: string[] = [];
  if (c.court_count) t.push(`${c.court_count} court${c.court_count > 1 ? "s" : ""}`);
  t.push(c.indoor ? "Indoor" : "Outdoor");
  if (c.lit) t.push("Lights");
  return t;
}

export default function RecommendedCourts({ courts }: { courts: Court[] | null }) {
  if (!courts) return <div className="skeleton" style={{ minHeight: 150 }} />;
  if (!courts.length)
    return (
      <div className="empty">
        <strong>No courts listed within 25 mi yet.</strong>
        <Link className="btn btn-sm" href="/courts?add=1">Add the first one</Link>
      </div>
    );
  return (
    <div className="hscroll">
      {courts.map((c) => (
        <Link key={c.id} href={`/host?court=${c.id}`} className="rcard">
          <div className="rcard-top">
            <span className="rcard-dist">{miles(c.distance_mi)}</span>
            {c.open_games > 0 ? (
              <span className="pill pill-ball">{c.open_games} open game{c.open_games > 1 ? "s" : ""}</span>
            ) : c.available_players > 0 ? (
              <span className="pill pill-ok">{c.available_players} free now</span>
            ) : c.members_only ? (
              <span className="pill">Members only</span>
            ) : null}
          </div>
          <div>
            <div className="rcard-name">{c.name}</div>
            <div className="rcard-town">{[c.source === "lifetime" ? "Life Time club" : c.kind, c.town].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="rcard-tags">
            {tags(c).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}
