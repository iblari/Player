"use client";
import { useEffect, useRef, useState } from "react";
import { PinIcon } from "./Icons";

export type Place = { name: string; address: string; lat: number; lng: number; kind: string; distance_mi: number | null };

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string; street?: string; housenumber?: string; city?: string; town?: string; village?: string; district?: string;
    state?: string; osm_key?: string; osm_value?: string; type?: string;
  };
};

const KIND: Record<string, string> = {
  pitch: "Court", sports_centre: "Sports center", park: "Park", recreation_ground: "Rec ground", fitness_centre: "Gym",
  school: "School", community_centre: "Community center", playground: "Playground", stadium: "Stadium", club: "Club",
};
// Sports-ish places float to the top of the list.
const SKIP = new Set(["bus_stop", "parking", "parking_space", "parking_entrance", "platform", "stop_position", "station", "bicycle_parking"]);
const BOOST = new Set(["pitch", "sports_centre", "recreation_ground", "park", "fitness_centre", "community_centre", "club", "stadium"]);

function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Name field with live place suggestions (OpenStreetMap via Photon), biased near `near`. */
export default function PlaceSearch({
  value,
  onChange,
  onPick,
  near,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: Place) => void;
  near: { lat: number; lng: number };
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const picked = useRef<string | null>(null);
  const nearRef = useRef(near);
  nearRef.current = near;

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || picked.current === value) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const n = nearRef.current;
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${n.lat.toFixed(4)}&lon=${n.lng.toFixed(4)}&location_bias_scale=0.4`;
        const r = await fetch(url, { signal: ctrl.signal });
        const j = (await r.json()) as { features: PhotonFeature[] };
        const seen = new Set<string>();
        const list = (j.features ?? [])
          .filter((f) => !SKIP.has(f.properties.osm_value ?? "") && f.properties.osm_key !== "highway")
          .map((f) => {
            const p = f.properties;
            const [lng, lat] = f.geometry.coordinates;
            const city = p.city || p.town || p.village || p.district || "";
            const street = [p.housenumber, p.street].filter(Boolean).join(" ");
            return {
              name: p.name || street || city,
              address: [street, city, p.state].filter(Boolean).join(", "),
              lat,
              lng,
              kind: KIND[p.osm_value ?? ""] ?? (p.osm_value ?? "").replace(/_/g, " "),
              distance_mi: miles(n, { lat, lng }),
              boost: BOOST.has(p.osm_value ?? "") ? 1 : 0,
            };
          })
          .filter((x) => {
            const k = `${x.name}|${x.lat.toFixed(3)}|${x.lng.toFixed(3)}`;
            if (!x.name || seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .sort((a, b) => b.boost - a.boost || (a.distance_mi ?? 0) - (b.distance_mi ?? 0))
          .slice(0, 6)
          .map(({ boost: _b, ...x }) => x); // eslint-disable-line @typescript-eslint/no-unused-vars
        setResults(list);
        setOpen(true);
        setActive(-1);
      } catch {
        /* aborted or offline: keep typing works */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  function pick(p: Place) {
    picked.current = p.name;
    onChange(p.name);
    onPick(p);
    setOpen(false);
    setResults([]);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        id="court-name"
        className="input"
        maxLength={80}
        placeholder="Search a park, rec center, or club"
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="place-results"
        aria-autocomplete="list"
        onChange={(e) => {
          picked.current = null;
          onChange(e.target.value);
        }}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !results.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(results[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {loading && <span className="small muted" style={{ position: "absolute", right: 14, top: 16 }}>Searching…</span>}
      {open && results.length > 0 && (
        <div id="place-results" role="listbox" className="list" style={{ position: "absolute", zIndex: 30, left: 0, right: 0, top: "calc(100% + 6px)", boxShadow: "0 12px 32px rgba(0,0,0,.5)" }}>
          {results.map((p, i) => (
            <button
              key={`${p.name}-${p.lat}-${p.lng}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className="list-row"
              style={i === active ? { background: "var(--raised)" } : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
            >
              <span className="icon-circle" style={{ width: 36, height: 36 }}>
                <PinIcon />
              </span>
              <span className="grow">
                <span className="t">{p.name}</span>
                <span className="m">
                  {[p.kind && p.kind[0].toUpperCase() + p.kind.slice(1), p.address].filter(Boolean).join(" · ")}
                </span>
              </span>
              {p.distance_mi != null && <span className="small muted" style={{ flex: "none" }}>{p.distance_mi < 10 ? p.distance_mi.toFixed(1) : Math.round(p.distance_mi)} mi</span>}
            </button>
          ))}
          <span className="list-row small muted" style={{ cursor: "default" }}>Can&apos;t find it? Keep typing your own name and drag the map to the spot.</span>
        </div>
      )}
    </div>
  );
}
