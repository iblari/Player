"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Court } from "@/lib/types";
import { addMarker, createMap, div, pinButton } from "@/lib/map";

type Props = {
  center: { lat: number; lng: number };
  courts: Court[];
  me?: { lat: number; lng: number } | null;
  picking?: boolean;
  onMove?: (c: { lat: number; lng: number }) => void;
  onSelect?: (id: string) => void;
  tall?: boolean;
};

export default function CourtMap({ center, courts, me, picking, onMove, onSelect, tall }: Props) {
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
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
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
    m.easeTo({ center: [center.lng, center.lat], zoom: picking ? Math.max(m.getZoom(), 16) : m.getZoom() });
  }, [center.lat, center.lng]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const b = pinButton(`court-pin${hot ? " hot" : ""}`, c.open_games > 0 ? String(c.open_games) : "", c.name, () => selectCb.current?.(c.id));
      out.push(addMarker(m, c, b));
    });
    markers.current = out;
  }, [courts, me]);

  return (
    <div className={`map${tall ? " tall" : ""}`}>
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
