"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Court } from "@/lib/types";
import { addMarker, createMap, div, pinButton } from "@/lib/map";

const COURT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M12 5v14"/></svg>';

type Props = {
  center: { lat: number; lng: number };
  courts: Court[];
  me?: { lat: number; lng: number } | null;
  picking?: boolean;
  onMove?: (c: { lat: number; lng: number }) => void;
  onSelect?: (id: string) => void;
  tall?: boolean;
  /** Fill the parent (map-first pages). Zoom buttons move to the top right. */
  fill?: boolean;
  /** Frame these points whenever fitKey changes (you + your nearest courts). */
  fitTo?: { lat: number; lng: number }[];
  fitKey?: string;
  /** Space covered by a bottom sheet, in px, so framing and centering avoid it. */
  bottomInset?: number;
  selected?: string | null;
};

export default function CourtMap({ center, courts, me, picking, onMove, onSelect, tall, fill, fitTo, fitKey, bottomInset = 0, selected }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const moveCb = useRef(onMove);
  moveCb.current = onMove;
  const selectCb = useRef(onSelect);
  selectCb.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = createMap(el.current, { center, zoom: 13 });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), fill ? "top-right" : "bottom-right");
    m.scrollZoom.enable();
    m.on("moveend", () => {
      const c = m.getCenter();
      moveCb.current?.({ lat: c.lat, lng: c.lng });
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.easeTo({
      center: [center.lng, center.lat],
      zoom: picking ? Math.max(m.getZoom(), 16) : fill ? Math.max(m.getZoom(), 13.5) : m.getZoom(),
      // Keep the point in the visible part of the map, above the sheet.
      offset: [0, -bottomInset / 2],
    });
  }, [center.lat, center.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Frame you and the nearest courts so pins are on screen from the start.
  useEffect(() => {
    const m = map.current;
    if (!m || !fitTo || fitTo.length < 2) return;
    const b = new maplibregl.LngLatBounds();
    fitTo.forEach((p) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: { top: 110, bottom: bottomInset + 40, left: 48, right: 64 }, maxZoom: 14.5, duration: 700 });
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    const out: maplibregl.Marker[] = [];
    if (me) {
      const d = div("me-pin", "", "pointer-events:none");
      d.setAttribute("aria-hidden", "true");
      out.push(addMarker(m, me, d));
    }
    courts.forEach((c) => {
      const hot = c.open_games > 0 || c.available_players > 0;
      const b = pinButton(`court-pin${hot ? " hot" : ""}${c.id === selected ? " sel" : ""}`, c.open_games > 0 ? String(c.open_games) : COURT_SVG, c.name, () => selectCb.current?.(c.id));
      out.push(addMarker(m, c, b));
    });
    markers.current = out;
  }, [courts, me, selected]);

  return (
    <div className={`map${tall ? " tall" : ""}${fill ? " fill" : ""}`}>
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      {picking && (
        <svg className="crosshair" viewBox="0 0 34 34" aria-hidden="true">
          <path d="M17 33 L8 18 A10 10 0 1 1 26 18 Z" fill="#d8f03a" stroke="#1b2900" strokeWidth="2.5" />
          <circle cx="17" cy="12" r="3.5" fill="#1b2900" />
        </svg>
      )}
    </div>
  );
}
