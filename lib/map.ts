"use client";
import maplibregl from "maplibre-gl";

/**
 * Basemap: OpenFreeMap "Dark" vector style (OpenStreetMap data).
 * Free, no API key, no usage limits, commercial use allowed: https://openfreemap.org
 * MapLibre adds the required attribution automatically.
 */
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

export function createMap(container: HTMLElement, opts: { center: { lat: number; lng: number }; zoom: number; interactive?: boolean }) {
  const interactive = opts.interactive ?? true;
  const m = new maplibregl.Map({
    container,
    style: MAP_STYLE,
    center: [opts.center.lng, opts.center.lat],
    // Callers use Leaflet-style zoom levels (256 px tiles); MapLibre uses 512 px tiles, so one level less.
    zoom: opts.zoom - 1,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    scrollZoom: false,
    dragPan: interactive,
    doubleClickZoom: interactive,
    touchZoomRotate: interactive,
    keyboard: interactive,
  });
  m.touchZoomRotate.disableRotation();
  // Start with the attribution collapsed to its (i) button so it doesn't cover the map.
  m.once("load", () => container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
  return m;
}

/** A DOM marker. Pass a button element for clickable pins so they're keyboard reachable. */
export function addMarker(m: maplibregl.Map, at: { lat: number; lng: number }, el: HTMLElement) {
  return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([at.lng, at.lat]).addTo(m);
}

export function div(className: string, html = "", style = ""): HTMLDivElement {
  const d = document.createElement("div");
  d.className = className;
  d.innerHTML = html;
  if (style) d.setAttribute("style", style);
  return d;
}

export function pinButton(className: string, html: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.innerHTML = html;
  b.setAttribute("aria-label", label);
  b.title = label;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}
