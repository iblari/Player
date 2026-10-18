"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M12 5v14"/></svg>';

export default function PlayerMap({ center, me, cells, courts, onCourt, zoom = 13, interactive = true }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const cb = useRef(onCourt);
  cb.current = onCourt;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, {
      zoomControl: false,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: false,
      doubleClickZoom: interactive,
      touchZoom: interactive,
    }).setView([center.lat, center.lng], zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "tiles-dark",
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    map.current?.setView([center.lat, center.lng], map.current.getZoom(), { animate: true });
  }, [center.lat, center.lng]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    cells.forEach((c) => {
      const size = Math.min(56, 26 + c.players * 6);
      L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="player-cell" style="width:${size}px;height:${size}px">${c.players}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(g);
    });
    courts.forEach((c) => {
      const mk = L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="court-pin${c.open_games ? " hot" : ""}">${c.open_games ? c.open_games : COURT_SVG}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        title: c.name,
      }).addTo(g);
      mk.on("click", () => cb.current?.(c.id));
    });
    if (me) {
      L.marker([me.lat, me.lng], {
        icon: L.divIcon({ className: "", html: '<div class="me-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        interactive: false,
        keyboard: false,
      }).addTo(g);
    }
  }, [cells, courts, me]);

  return <div ref={el} style={{ position: "absolute", inset: 0 }} />;
}
