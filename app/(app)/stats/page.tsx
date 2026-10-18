"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useLiveGames } from "@/lib/games";

type Stats = {
  finished: number;
  filled: number;
  median_fill_min: number | null;
  players: number;
  available_now: number;
  open_now: number;
  week_games: number;
  attended: number;
  showed: number;
  by_hour: { hour: number; total: number; filled: number }[];
};

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);
const hourLabel = (h: number) => (h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`);

export default function StatsPage() {
  const [s, setS] = useState<Stats | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase().rpc("app_stats");
    setS(data as Stats);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useLiveGames(load);

  const fill = s && s.finished ? s.filled / s.finished : null;
  const show = s && s.attended ? s.showed / s.attended : null;
  const verdict =
    fill == null
      ? "No finished games yet. Post a few to start the clock."
      : fill >= 0.7
        ? "Healthy. Most requests fill, so players trust posting."
        : fill >= 0.5
          ? "Working, but thin. More players per court will push this up."
          : "Too few players per court. Recruit at one court before spreading out.";
  const max = Math.max(1, ...(s?.by_hour ?? []).map((b) => b.total));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Is it working?</h1>
          <p className="sub">Live numbers across every court</p>
        </div>
      </div>

      <div className="tiles">
        <div className="tile lead">
          <span className="tile-label">Fill rate</span>
          <span className="num" style={{ fontSize: "4rem" }}>
            {fill == null ? "–" : `${Math.round(fill * 100)}%`}
          </span>
          <span className="small muted">
            {s ? `${s.filled} of ${s.finished} finished requests filled. ` : ""}
            {verdict}
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Median time to fill</span>
          <span className="num">{s?.median_fill_min == null ? "–" : `${Math.round(s.median_fill_min)}m`}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Show-up rate</span>
          <span className="num">{show == null ? "–" : `${Math.round(show * 100)}%`}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Available now</span>
          <span className="num">{s?.available_now ?? "–"}</span>
          <span className="small muted">of {s?.players ?? 0} players</span>
        </div>
        <div className="tile">
          <span className="tile-label">Games this week</span>
          <span className="num">{s?.week_games ?? "–"}</span>
          <span className="small muted">{s?.open_now ?? 0} open right now</span>
        </div>
      </div>

      <section className="block">
        <div className="block-head">
          <h2>When games fill</h2>
          <span className="small muted">by start hour</span>
        </div>
        {!s || !s.by_hour.length ? (
          <div className="empty">
            <strong>Bars appear once requests finish.</strong>
            <span>Green is the share that filled. Use it to pick the hour you post.</span>
          </div>
        ) : (
          <div className="tile" style={{ gap: 8 }}>
            <div className="bars" role="img" aria-label="Requests by start hour, filled share in green">
              {HOURS.map((h) => {
                const b = s.by_hour.find((x) => x.hour === h);
                const total = b?.total ?? 0;
                return (
                  <div key={h} style={{ height: `${(total / max) * 100}%` }} title={`${hourLabel(h)}: ${b?.filled ?? 0} of ${total} filled`}>
                    <i style={{ height: `${total ? ((b!.filled / total) * 100).toFixed(0) : 0}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="bar-labels">
              {HOURS.map((h) => (
                <span key={h}>{h % 3 === 0 ? hourLabel(h) : ""}</span>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
