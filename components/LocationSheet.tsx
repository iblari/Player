"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Court } from "@/lib/types";
import { miles } from "@/lib/util";
import { BackIcon, ChevronIcon, PinIcon, PlusIcon, SearchIcon } from "./Icons";

export default function LocationSheet({
  courts,
  onPick,
  onClose,
  title = "Pick a location to play",
}: {
  courts: Court[] | null;
  onPick: (c: Court) => void;
  onClose: () => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const xs = courts ?? [];
    return t ? xs.filter((c) => `${c.name} ${c.address ?? ""} ${c.notes ?? ""}`.toLowerCase().includes(t)) : xs;
  }, [courts, q]);

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-ghost" style={{ minHeight: 40, padding: 0, width: 40 }} onClick={onClose} aria-label="Close">
            <BackIcon />
          </button>
          <h2 style={{ fontSize: "1.15rem" }}>{title}</h2>
        </div>
        <label className="search-field">
          <SearchIcon />
          <input
            ref={input}
            id="court-search"
            placeholder="Search courts, parks, clubs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </label>

        <div className="list">
          {courts === null ? (
            <div className="list-row">
              <span className="muted">Finding courts near you…</span>
            </div>
          ) : (
            list.map((c) => (
              <button key={c.id} className="list-row" onClick={() => onPick(c)}>
                <span className="icon-circle">
                  <PinIcon />
                </span>
                <span className="grow">
                  <span className="t">{c.name}</span>
                  <span className="m">
                    {miles(c.distance_mi)}
                    {c.available_players ? ` · ${c.available_players} available` : ""}
                    {c.open_games ? ` · ${c.open_games} open game${c.open_games > 1 ? "s" : ""}` : ""}
                  </span>
                </span>
                <span className="chev">
                  <ChevronIcon />
                </span>
              </button>
            ))
          )}
          {courts !== null && list.length === 0 && (
            <div className="list-row">
              <span className="muted">{q ? `No courts match "${q}" nearby.` : "No courts listed within 15 mi yet."}</span>
            </div>
          )}
          <Link className="list-row" href="/courts?add=1">
            <span className="icon-circle">
              <PlusIcon />
            </span>
            <span className="grow">
              <span className="t">Add a court</span>
              <span className="m">Drop a pin on a court that isn&apos;t listed</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
