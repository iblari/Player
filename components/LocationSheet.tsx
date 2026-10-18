"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Court, Sport } from "@/lib/types";
import type { Coords } from "@/lib/geo";
import { miles } from "@/lib/util";
import { rpcCompat, without } from "@/lib/rpc";
import { searchCourts, searchPlaces, type OsmPlace } from "@/lib/courtSearch";
import { useSession } from "./Session";
import { useToast } from "./Toast";
import WaitingGames from "./WaitingGames";
import { BackIcon, ChevronIcon, PinIcon, PlusIcon, SearchIcon } from "./Icons";

function CourtRow({ c, onPick }: { c: Court; onPick: (c: Court) => void }) {
  return (
    <button className="list-row" onClick={() => onPick(c)}>
      <span className="icon-circle">
        <PinIcon />
      </span>
      <span className="grow">
        <span className="t">{c.name}</span>
        <span className="m">
          {Number.isFinite(c.distance_mi) ? miles(c.distance_mi) : c.town || c.address || ""}
          {c.available_players ? ` · ${c.available_players} available` : ""}
        </span>
      </span>
      {c.open_games ? (
        <span className="pill pill-ball">{c.open_games === 1 ? "Game waiting" : `${c.open_games} waiting`}</span>
      ) : (
        <span className="chev">
          <ChevronIcon />
        </span>
      )}
    </button>
  );
}

/**
 * Pick where to play. Typing searches every court on the app (not just nearby), then real
 * places from the map that nobody has listed yet. Picking a court where someone already
 * posted a game offers that game first, so players match instead of posting twice.
 */
export default function LocationSheet({
  courts,
  onPick,
  onClose,
  title = "Pick a location to play",
  near,
  sport = "pickleball",
}: {
  courts: Court[] | null;
  onPick: (c: Court) => void;
  onClose: () => void;
  title?: string;
  near?: Coords | null;
  sport?: Sport;
}) {
  const { userId } = useSession();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Court[] | null>(null);
  const [places, setPlaces] = useState<OsmPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<Court | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [found, setFound] = useState(false);
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

  const t = q.trim().toLowerCase();
  const local = useMemo(() => {
    const xs = courts ?? [];
    return t ? xs.filter((c) => `${c.name} ${c.address ?? ""} ${c.town ?? ""} ${c.notes ?? ""}`.toLowerCase().includes(t)) : xs;
  }, [courts, t]);

  // Search everywhere as they type.
  useEffect(() => {
    if (t.length < 2) {
      setRemote(null);
      setPlaces([]);
      return;
    }
    let live = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      const [r, p] = await Promise.all([searchCourts(q, near ?? null, sport), searchPlaces(q, near ?? null)]);
      if (!live) return;
      setRemote(r);
      setPlaces(p);
      setSearching(false);
    }, 280);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [t, sport]); // eslint-disable-line react-hooks/exhaustive-deps

  const localIds = new Set(local.map((c) => c.id));
  const further = (remote ?? []).filter((c) => !localIds.has(c.id));
  // Hide map places that are already listed courts (same name within ~200 m).
  const listed = [...local, ...further];
  const newPlaces = places.filter(
    (p) => !listed.some((c) => c.name.toLowerCase() === p.name.toLowerCase() || (Math.abs(c.lat - p.lat) < 0.002 && Math.abs(c.lng - p.lng) < 0.002))
  );

  async function addPlace(p: OsmPlace) {
    setAdding(p.name);
    const args = { p_name: p.name, lat: p.lat, lng: p.lng, p_address: p.address || null, p_count: null, p_notes: null, p_sports: [sport] };
    const { data, error } = await rpcCompat<string>("add_court", args, sport === "pickleball" ? without(args, "p_sports") : null);
    setAdding(null);
    if (error || !data) return toast("Couldn't add that court. Try Add a court instead.");
    choose({ id: data, name: p.name, address: p.address, court_count: null, notes: null, lat: p.lat, lng: p.lng, distance_mi: p.distance_mi, available_players: 0, open_games: 0, sports: [sport] });
  }

  function choose(c: Court) {
    // A game might be waiting there: check before going on to host.
    setFound(false);
    setChosen(c);
  }

  if (chosen)
    return (
      <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={chosen.name} onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grip" aria-hidden="true" />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn btn-ghost" style={{ minHeight: 40, padding: 0, width: 40 }} onClick={() => setChosen(null)} aria-label="Back to search">
              <BackIcon />
            </button>
            <h2 style={{ fontSize: "1.15rem" }}>{chosen.name}</h2>
          </div>
          {!found && <p className="small muted" style={{ margin: "-4px 0 0" }}>Checking for players already waiting here…</p>}
          <WaitingGames courtId={chosen.id} courtName={chosen.name} sport={sport} userId={userId} onNone={() => onPick(chosen)} onFound={() => setFound(true)} />
          {found && (
            <button className="btn btn-block" onClick={() => onPick(chosen)}>
              Start my own game here instead
            </button>
          )}
        </div>
      </div>
    );

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
            placeholder="Search any court, park, club or town"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>

        {(!t || local.length > 0) && (
        <div className="list">
          {courts === null && !t ? (
            <div className="list-row">
              <span className="muted">Finding courts near you…</span>
            </div>
          ) : (
            local.map((c) => <CourtRow key={c.id} c={c} onPick={choose} />)
          )}
          {courts !== null && !t && local.length === 0 && (
            <div className="list-row">
              <span className="muted">No courts listed within 15 mi yet. Search above to find one anywhere.</span>
            </div>
          )}
        </div>
        )}

        {t.length >= 2 && further.length > 0 && (
          <>
            <p className="sheet-label">{local.length ? "Further away" : "Courts"}</p>
            <div className="list">
              {further.map((c) => (
                <CourtRow key={c.id} c={c} onPick={choose} />
              ))}
            </div>
          </>
        )}

        {t.length >= 2 && newPlaces.length > 0 && (
          <>
            <p className="sheet-label">Not listed yet · tap to add and play</p>
            <div className="list">
              {newPlaces.map((p) => (
                <button key={`${p.name}-${p.lat}`} className="list-row" onClick={() => addPlace(p)} disabled={!!adding}>
                  <span className="icon-circle">
                    <PlusIcon />
                  </span>
                  <span className="grow">
                    <span className="t">{p.name}</span>
                    <span className="m">
                      {Number.isFinite(p.distance_mi) ? `${miles(p.distance_mi)} · ` : ""}
                      {p.address}
                    </span>
                  </span>
                  <span className="small muted">{adding === p.name ? "Adding…" : ""}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {t.length >= 2 && !searching && remote !== null && local.length === 0 && further.length === 0 && newPlaces.length === 0 && (
          <div className="list">
            <div className="list-row">
              <span className="muted">Nothing called &ldquo;{q.trim()}&rdquo; yet. Add it below and you can play there.</span>
            </div>
          </div>
        )}
        {t.length >= 2 && searching && <p className="small muted" style={{ margin: 0 }}>Searching everywhere…</p>}

        <div className="list">
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
