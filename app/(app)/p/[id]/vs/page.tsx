"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { useSession } from "@/components/Session";
import { supabase } from "@/lib/supabase/client";
import { track } from "@/lib/track";
import { fmtSkill } from "@/lib/util";
import type { Sport } from "@/lib/types";

type Match = { game_id: string; sport: Sport; slots: number; starts_at: string; court_name: string; games: [number, number][]; won: boolean | null; my_team: string[]; their_team: string[] };
type Who = { id: string; display_name: string; avatar_url: string | null };
type Rating = { player_id: string; mu: number; sigma: number; games: number };

const BETA = 0.4; // same scale the rating system uses (a gap of BETA ≈ 76% per game)
// Standard normal CDF (Abramowitz–Stegun).
function phi(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** FIFA-style head to head: you vs one player, from confirmed matches only. */
export default function HeadToHead() {
  const { id: other } = useParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useSession();
  const [people, setPeople] = useState<Record<string, Who>>({});
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [sport, setSport] = useState<Sport | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (other === userId) return router.replace("/me");
    const sb = supabase();
    sb.rpc("head_to_head", { p_other: other }).then(async ({ data, error }) => {
      if (error) return setMissing(true);
      const m = (data as Match[]) ?? [];
      setMatches(m);
      const ids = Array.from(new Set([userId, other, ...m.flatMap((x) => [...x.my_team, ...x.their_team])]));
      const { data: ps } = await sb.from("profiles").select("id, display_name, avatar_url").in("id", ids);
      setPeople(Object.fromEntries(((ps as Who[]) ?? []).map((p) => [p.id, p])));
      const counts = m.reduce<Record<string, number>>((a, x) => ((a[x.sport] = (a[x.sport] ?? 0) + 1), a), {});
      setSport((Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as Sport) ?? "pickleball");
    });
    track("h2h_opened");
  }, [userId, other, router]);

  useEffect(() => {
    if (!sport || !userId) return;
    supabase()
      .rpc("rating_pair", { p_other: other, p_sport: sport })
      .then(({ data }) => setRatings(((data as Rating[]) ?? []).map((r) => ({ ...r, mu: Number(r.mu), sigma: Number(r.sigma) }))));
  }, [sport, other, userId]);

  const list = useMemo(() => (matches ?? []).filter((m) => m.sport === sport), [matches, sport]);
  const s = useMemo(() => stats(list), [list]);
  const sports = Array.from(new Set((matches ?? []).map((m) => m.sport)));
  const me = userId ? people[userId] : undefined;
  const them = people[other];
  const name = (id: string) => (id === userId ? "You" : (people[id]?.display_name ?? "Player").split(" ")[0]);
  const first = (them?.display_name ?? "them").split(" ")[0];

  const rMe = ratings.find((r) => r.player_id === userId);
  const rThem = ratings.find((r) => r.player_id === other);
  const pGame = rMe && rThem ? phi((rMe.mu - rThem.mu) / Math.sqrt(2 * BETA * BETA + rMe.sigma ** 2 + rThem.sigma ** 2)) : null;
  const unsure = rMe && rThem ? rMe.games < 5 || rThem.games < 5 : true;

  async function share() {
    const url = `${window.location.origin}/p/${userId}/vs`;
    const text = list.length ? `Our head to head on Players Club: ${s.w}–${s.l} me. Come get your revenge:` : `Let's settle it on Players Club:`;
    track("h2h_shared");
    try {
      if (navigator.share) await navigator.share({ text, url });
      else await navigator.clipboard.writeText(`${text} ${url}`);
    } catch {}
  }

  if (missing)
    return (
      <div className="empty" style={{ marginTop: 40 }}>
        <strong>Head to head is almost ready.</strong>
        <span>Check back soon.</span>
      </div>
    );
  if (!userId || matches === null || !them) return <div className="skeleton" style={{ marginTop: 40, height: 400 }} />;

  return (
    <div className="h2h">
      <div className="h2h-top">
        <Link href={`/p/${other}`} className="small muted">
          ← {them.display_name}
        </Link>
        {sports.length > 1 && (
          <div className="seg seg-sm">
            {sports.map((x) => (
              <button key={x} aria-pressed={sport === x} onClick={() => setSport(x)}>
                {x === "tennis" ? "Tennis" : "Pickleball"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h2h-face">
        <div className="h2h-p">
          <Avatar id={userId} name={me?.display_name ?? "You"} src={me?.avatar_url} size={76} />
          <b>You</b>
          <span>{rMe ? fmtSkill(rMe.mu) : "–"}</span>
        </div>
        <div className="h2h-rec">
          <b>
            {s.w}–{s.l}
          </b>
          <span>
            {list.length} {list.length === 1 ? "match" : "matches"}
            {list.length ? ` · since ${new Date(list[list.length - 1].starts_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}
          </span>
          {list.length > 0 && (
            <div className="h2h-split" aria-hidden="true">
              <i style={{ flex: Math.max(s.w, 0.001) }} />
              <i style={{ flex: Math.max(s.l, 0.001) }} />
            </div>
          )}
        </div>
        <div className="h2h-p">
          <Avatar id={other} name={them.display_name} src={them.avatar_url} size={76} />
          <b>{first}</b>
          <span>{rThem ? fmtSkill(rThem.mu) : "–"}</span>
        </div>
      </div>

      {list.length > 0 && list.length < 5 && <p className="h2h-note">Small sample: {list.length === 1 ? "one match" : `${list.length} matches`} so far. Stats get meaningful around 5.</p>}

      {list.length > 0 ? (
        <div className="h2h-bars">
          <Bar label="Matches won" a={s.w} b={s.l} />
          <Bar label="Games won" a={s.gw} b={s.gl} />
          <Bar label="Points per game" a={s.ppgMe} b={s.ppgThem} fmt={(x) => x.toFixed(1)} />
          <Bar label="Close games won (by 2)" a={s.closeMe} b={s.closeThem} />
          <Bar label="Longest win streak" a={s.streakMe} b={s.streakThem} />
          <div className="h2h-big">
            <span className={s.bigMe ? "win" : ""}>{s.bigMe ? `${s.bigMe[0]}–${s.bigMe[1]}` : "–"}</span>
            <em>Biggest win</em>
            <span className={s.bigThem ? "win them" : ""}>{s.bigThem ? `${s.bigThem[0]}–${s.bigThem[1]}` : "–"}</span>
          </div>
        </div>
      ) : (
        <div className="empty">
          <strong>You haven&apos;t played {first} yet.</strong>
          <span>Only confirmed matches count here. Play, or log a match you&apos;ve already played.</span>
          <Link className="btn btn-sm" href="/log">
            Log a match
          </Link>
        </div>
      )}

      {pGame != null && (
        <div className="h2h-pred">
          <span className="h2h-cap">Chance to win a game, from ratings{unsure ? " (still settling)" : ""}</span>
          <div className="h2h-split big" aria-hidden="true">
            <i style={{ flex: pGame }} />
            <i style={{ flex: 1 - pGame }} />
          </div>
          <div className="h2h-pred-n">
            <b>You {Math.round(pGame * 100)}%</b>
            <b>
              {Math.round((1 - pGame) * 100)}% {first}
            </b>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="h2h-last">
          <span className="h2h-cap">Last meetings</span>
          <div className="h2h-chips">
            {list.slice(0, 5).map((m) => (
              <Link key={m.game_id} href={`/g/${m.game_id}`} className={`h2h-chip${m.won ? " w" : m.won === false ? " l" : ""}`}>
                {m.won ? "W" : m.won === false ? "L" : "D"}
              </Link>
            ))}
          </div>
          <div className="list">
            {list.slice(0, 5).map((m) => {
              const partner = m.my_team.find((x) => x !== userId);
              const theirPartner = m.their_team.find((x) => x !== other);
              return (
                <Link key={m.game_id} href={`/g/${m.game_id}`} className="list-row">
                  <span className="grow">
                    <span className="t">{m.games.map(([a, b]) => `${a}–${b}`).join(", ")}</span>
                    <span className="m">
                      {new Date(m.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {m.court_name}
                      {partner ? ` · with ${name(partner)}${theirPartner ? ` vs ${first} & ${name(theirPartner)}` : ""}` : ""}
                    </span>
                  </span>
                  <span className={`h2h-res${m.won ? " w" : ""}`}>{m.won ? "Won" : m.won === false ? "Lost" : "Split"}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <button className="btn btn-ball btn-block" onClick={share}>
        {list.length ? `Send ${first} our head to head` : `Challenge ${first}`}
      </button>
    </div>
  );
}

function Bar({ label, a, b, fmt = (x: number) => String(x) }: { label: string; a: number; b: number; fmt?: (x: number) => string }) {
  const max = Math.max(a, b, 1e-9);
  return (
    <div className="h2h-bar">
      <b className={a > b ? "lead" : ""}>{fmt(a)}</b>
      <div className="h2h-track left">
        <i style={{ width: `${(a / max) * 100}%` }} className={a > b ? "lead" : ""} />
      </div>
      <em>{label}</em>
      <div className="h2h-track right">
        <i style={{ width: `${(b / max) * 100}%` }} className={b > a ? "lead them" : ""} />
      </div>
      <b className={b > a ? "lead them" : ""}>{fmt(b)}</b>
    </div>
  );
}

/** Everything on the screen, from your side, from confirmed matches. */
function stats(list: Match[]) {
  let w = 0,
    l = 0,
    gw = 0,
    gl = 0,
    ptsMe = 0,
    ptsThem = 0,
    n = 0,
    closeMe = 0,
    closeThem = 0,
    streakMe = 0,
    streakThem = 0,
    run = 0,
    runT = 0;
  let bigMe: [number, number] | null = null;
  let bigThem: [number, number] | null = null;
  // Oldest first for streaks.
  for (const m of [...list].reverse()) {
    if (m.won === true) (w++, run++, (runT = 0));
    else if (m.won === false) (l++, runT++, (run = 0));
    streakMe = Math.max(streakMe, run);
    streakThem = Math.max(streakThem, runT);
    for (const [a, b] of m.games) {
      n++;
      ptsMe += a;
      ptsThem += b;
      if (a > b) {
        gw++;
        if (a - b <= 2) closeMe++;
        if (!bigMe || a - b > bigMe[0] - bigMe[1]) bigMe = [a, b];
      } else if (b > a) {
        gl++;
        if (b - a <= 2) closeThem++;
        if (!bigThem || b - a > bigThem[0] - bigThem[1]) bigThem = [b, a];
      }
    }
  }
  return { w, l, gw, gl, ppgMe: n ? ptsMe / n : 0, ppgThem: n ? ptsThem / n : 0, closeMe, closeThem, streakMe, streakThem, bigMe, bigThem };
}
