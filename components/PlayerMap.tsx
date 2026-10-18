"use client";
import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { addMarker, createMap, div, pinButton } from "@/lib/map";

export type PlayerCell = { lat: number; lng: number; players: number };
export type CourtDot = { id: string; name: string; lat: number; lng: number; open_games: number };

type Props = {
  center: { lat: number; lng: number };
  me?: { lat: number; lng: number } | null;
  cells: PlayerCell[];
  courts: CourtDot[];
  onCourt?: (id: string) => void;
  zoom?: number;
  interactive?: boolean;
};

const COURT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M12 5v14"/></svg>';

export default function PlayerMap({ center, me, cells, courts, onCourt, zoom = 13, interactive = true }: Props) {
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
      const size = Math.min(56, 26 + c.players * 6);
      const d = div("player-cell", String(c.players), `width:${size}px;height:${size}px;pointer-events:none`);
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
  }, [cells, courts, me]);

  return <div ref={el} style={{ position: "absolute", inset: 0 }} />;
}
