"use client";
import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { addMarker, createMap, div, pinButton } from "@/lib/map";

/** players = free right now; others = play nearby but aren't free (grey). */
export type PlayerCell = { lat: number; lng: number; players: number; others?: number };
export type CourtDot = { id: string; name: string; lat: number; lng: number; open_games: number };

type Props = {
  center: { lat: number; lng: number };
  me?: { lat: number; lng: number } | null;
  cells: PlayerCell[];
  courts: CourtDot[];
  onCourt?: (id: string) => void;
  zoom?: number;
  interactive?: boolean;
  /** Frame me + players + the nearest courts once data arrives (home map). */
  fit?: boolean;
};

const COURT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M12 5v14"/></svg>';

export default function PlayerMap({ center, me, cells, courts, onCourt, zoom = 13, interactive = true, fit }: Props) {
  const fitted = useRef("");
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const cb = useRef(onCourt);
  cb.current = onCourt;

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = createMap(el.current, { center, zoom, interactive });
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    map.current?.easeTo({ center: [center.lng, center.lat] });
  }, [center.lat, center.lng]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    const out: maplibregl.Marker[] = [];
    cells.forEach((c) => {
      const free = c.players > 0;
      const n = free ? c.players : c.others ?? 0;
      if (!n) return;
      const size = Math.min(56, 26 + n * 6);
      const d = div(`player-cell${free ? "" : " idle"}`, String(n), `width:${size}px;height:${size}px;pointer-events:none`);
      d.setAttribute("aria-hidden", "true");
      out.push(addMarker(m, c, d));
    });
    courts.forEach((c) => {
      const b = pinButton(`court-pin${c.open_games ? " hot" : ""}`, c.open_games ? String(c.open_games) : COURT_SVG, c.name, () => cb.current?.(c.id));
      out.push(addMarker(m, c, b));
    });
    if (me) {
      const d = div("me-pin", "", "pointer-events:none");
      d.setAttribute("aria-hidden", "true");
      out.push(addMarker(m, me, d));
    }
    markers.current = out;

    // Frame you, the players and your nearest courts, so the map isn't a few empty streets.
    const key = `${cells.length}|${Math.min(courts.length, 6)}`;
    if (fit && key !== fitted.current && (cells.length || courts.length)) {
      fitted.current = key;
      const pts = [...cells.map((c) => [c.lng, c.lat]), ...courts.slice(0, 6).map((c) => [c.lng, c.lat])];
      if (me) pts.push([me.lng, me.lat]);
      if (pts.length >= 2) {
        const lngs = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
        m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 64, bottom: 28, left: 36, right: 36 }, maxZoom: 14, duration: 600 });
      }
    }
  }, [cells, courts, me]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} style={{ position: "absolute", inset: 0 }} />;
}
