"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Court } from "@/lib/types";

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
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const moveCb = useRef(onMove);
  moveCb.current = onMove;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "tiles-dark",
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    m.on("moveend", () => {
      const c = m.getCenter();
      moveCb.current?.({ lat: c.lat, lng: c.lng });
    });
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    map.current?.setView([center.lat, center.lng], map.current.getZoom());
  }, [center.lat, center.lng]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    if (me) {
      L.marker([me.lat, me.lng], {
        icon: L.divIcon({ className: "", html: '<div class="me-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        interactive: false,
      }).addTo(g);
    }
    courts.forEach((c) => {
      const hot = c.open_games > 0 || c.available_players > 0;
      const label = c.open_games > 0 ? String(c.open_games) : "";
      const mk = L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="court-pin${hot ? " hot" : ""}">${label}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        title: c.name,
        keyboard: true,
      }).addTo(g);
      mk.on("click", () => onSelect?.(c.id));
    });
  }, [courts, me, onSelect]);

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
