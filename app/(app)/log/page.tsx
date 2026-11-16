"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import LocationSheet from "@/components/LocationSheet";
import PlayerSearch from "@/components/PlayerSearch";
import SportSwitch from "@/components/SportSwitch";
import { useSession } from "@/components/Session";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase/client";
import { useNearby } from "@/lib/nearby";
import { track } from "@/lib/track";
import type { FoundPlayer } from "@/lib/players";
import type { Court, Sport } from "@/lib/types";

type Slot = "partner" | "opp1" | "opp2";
const pad = (n: number) => String(n).padStart(2, "0");
const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DURATIONS = [30, 60, 90, 120, 180];
const ERR: Record<string, string> = {
  bad_teams: "Check the players: everyone can only be picked once.",
  in_future: "That time hasn't happened yet. Pick when you played.",
  too_old: "You can log matches from the last 30 days.",
  too_many: "That's 10 logged matches today. Try again tomorrow.",
  bad_score: "Every game needs a winner (no ties).",
  no_court: "Pick where you played.",
};

/**
 * Log a match you played outside the app. It shows on everyone's profile, and counts toward
 * ratings once someone on the other side confirms the score.
 */
export default function LogMatchPage() {
  const router = useRouter();
  const toast = useToast();
  const { userId, profile } = useSession();
  const [sport, setSport] = useState<Sport>("pickleball");
  const [doubles, setDoubles] = useState(false);
  const [people, setPeople] = useState<Partial<Record<Slot, FoundPlayer>>>({});
  const [picking, setPicking] = useState<Slot | null>(null);
  const [court, setCourt] = useState<Court | null>(null);
  const [courtSheet, setCourtSheet] = useState(false);
  // Default: started about 90 minutes ago (yesterday if that's before midnight), on the quarter hour.
  const start0 = new Date(Date.now() - 90 * 60000);
  const [day, setDay] = useState(dateStr(start0));
  const [time, setTime] = useState(`${pad(start0.getHours())}:${pad(Math.floor(start0.getMinutes() / 15) * 15)}`);
  const [minutes, setMinutes] = useState(90);
  const unit = sport === "tennis" ? "Set" : "Game";
  const fresh: [number, number] = sport === "tennis" ? [6, 4] : [11, 8];
  const [sets, setSets] = useState<[number, number][]>([fresh]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { courts, coords } = useNearby(15, sport);

  const slots: Slot[] = doubles ? ["partner", "opp1", "opp2"] : ["opp1"];
  const chosen = slots.map((s) => people[s]?.id).filter(Boolean) as string[];
  const ready = slots.every((s) => people[s]) && !!court;
  const won = sets.filter(([m, t]) => m > t).length;
  const lost = sets.filter(([m, t]) => t > m).length;
  const minDay = useMemo(() => dateStr(new Date(Date.now() - 29 * 864e5)), []);

  async function submit() {
    if (!userId || !ready) return;
    const at = new Date(`${day}T${time}`);
    if (at.getTime() > Date.now() + 15 * 60000) return setErr(ERR.in_future);
    if (sets.some(([m, t]) => m === t)) return setErr(ERR.bad_score);
    setBusy(true);
    setErr(null);
    const teamA = [userId, ...(doubles ? [people.partner!.id] : [])];
    const teamB = doubles ? [people.opp1!.id, people.opp2!.id] : [people.opp1!.id];
    const { data, error } = await supabase().rpc("log_match", {
      p_court: court!.id,
      p_sport: sport,
      p_started_at: at.toISOString(),
      p_minutes: minutes,
      p_team_a: teamA,
      p_team_b: teamB,
      p_games: sets,
    });
    if (error) {
      setBusy(false);
      const key = Object.keys(ERR).find((k) => error.message.includes(k));
      return setErr(key ? ERR[key] : /log_match/.test(error.message) ? "Logging matches isn't switched on yet. Try again soon." : "Couldn't log it. Try again.");
    }
    track("match_logged", { sport, doubles });
    fetch("/api/notify-logged", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId: data }) }).catch(() => {});
    toast(`Logged. It counts once ${doubles ? "an opponent" : people.opp1!.display_name.split(" ")[0]} confirms.`);
    router.replace(`/g/${data}`);
  }

  if (!userId) return <div className="skeleton" />;

  const label: Record<Slot, string> = { partner: "Your partner", opp1: doubles ? "Opponent 1" : "Opponent", opp2: "Opponent 2" };

  return (
    <>
      <div className="page-head">
        <h1>Log a match</h1>
      </div>
      <p className="muted log-intro">Played outside the app? Add it here. It counts toward ratings once the other side confirms the score.</p>

      <div className="log">
        <SportSwitch
          value={sport}
          onChange={(s) => {
            setSport(s);
            setCourt(null);
            setSets([s === "tennis" ? [6, 4] : [11, 8]]);
          }}
        />

        <div className="field">
          <span>Format</span>
          <div className="seg">
            <button type="button" aria-pressed={!doubles} onClick={() => setDoubles(false)}>
              Singles
            </button>
            <button type="button" aria-pressed={doubles} onClick={() => setDoubles(true)}>
              Doubles
            </button>
          </div>
        </div>

        <div className="field">
          <span>Who played</span>
          <div className="log-teams">
            <div className="log-team">
              <span className="log-team-cap">{doubles ? "Your team" : "You"}</span>
              <span className="log-person me">
                <Avatar id={userId} name={profile?.display_name || "You"} src={(profile as { avatar_url?: string | null } | null)?.avatar_url} size={32} />
                <b>You</b>
              </span>
              {doubles && <PersonSlot p={people.partner} label={label.partner} onAdd={() => setPicking("partner")} onClear={() => setPeople((x) => ({ ...x, partner: undefined }))} />}
            </div>
            <div className="log-vs">vs</div>
            <div className="log-team">
              <span className="log-team-cap">{doubles ? "Opponents" : "Opponent"}</span>
              <PersonSlot p={people.opp1} label={label.opp1} onAdd={() => setPicking("opp1")} onClear={() => setPeople((x) => ({ ...x, opp1: undefined }))} />
              {doubles && <PersonSlot p={people.opp2} label={label.opp2} onAdd={() => setPicking("opp2")} onClear={() => setPeople((x) => ({ ...x, opp2: undefined }))} />}
            </div>
          </div>
        </div>

        <div className="field">
          <span>Where</span>
          <button type="button" className="input log-court" onClick={() => setCourtSheet(true)}>
            {court ? (
              <>
                <b>{court.name}</b>
                {court.town ? <span className="muted"> · {court.town}</span> : null}
              </>
            ) : (
              <span className="muted">Pick the court</span>
            )}
          </button>
        </div>

        <div className="log-when">
          <label className="field">
            <span>Day</span>
            <input className="input" type="date" value={day} min={minDay} max={dateStr(new Date())} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="field">
            <span>Started</span>
            <input className="input" type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <div className="field">
          <span>How long</span>
          <div className="seg">
            {DURATIONS.map((m) => (
              <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Score</span>
          <div className="games-entry">
            <div className="games-head">
              <span />
              <span className="opt-label">{doubles ? "Your team" : "You"}</span>
              <span className="opt-label">Them</span>
              <span />
            </div>
            {sets.map(([m, t], i) => (
              <div className="games-row" key={i}>
                <span className="games-n">
                  {unit} {i + 1}
                </span>
                {([0, 1] as const).map((side) => {
                  const v = side === 0 ? m : t;
                  const set = (nv: number) => setSets((xs) => xs.map((x, j) => (j === i ? ((side === 0 ? [nv, x[1]] : [x[0], nv]) as [number, number]) : x)));
                  return (
                    <div key={side} className={`stepper stepper-sm${v > (side === 0 ? t : m) ? " lead" : ""}`}>
                      <button type="button" aria-label={`Lower ${side === 0 ? "your" : "their"} ${unit.toLowerCase()} ${i + 1} score`} disabled={v <= 0} onClick={() => set(v - 1)}>
                        −
                      </button>
                      <output className="score-num">{v}</output>
                      <button type="button" aria-label={`Raise ${side === 0 ? "your" : "their"} ${unit.toLowerCase()} ${i + 1} score`} disabled={v >= 99} onClick={() => set(v + 1)}>
                        +
                      </button>
                    </div>
                  );
                })}
                <button type="button" className="games-x" aria-label={`Remove ${unit.toLowerCase()} ${i + 1}`} disabled={sets.length === 1} onClick={() => setSets((xs) => xs.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            {sets.length < 9 && (
              <button type="button" className="games-add" onClick={() => setSets((xs) => [...xs, fresh])}>
                + Add {unit.toLowerCase()}
              </button>
            )}
            {sets.length > 1 && <p className="games-sum">{won === lost ? `Level ${won}–${lost}` : won > lost ? `You won ${won}–${lost}` : `You lost ${won}–${lost}`}</p>}
          </div>
        </div>

        {err && <p className="small" style={{ color: "var(--bad)", margin: 0 }}>{err}</p>}
        <button className="btn btn-ball btn-block" disabled={!ready || busy} onClick={submit}>
          {busy ? "Logging…" : !ready ? (court ? "Add who you played" : "Add players and court") : "Log match"}
        </button>
        <p className="small muted" style={{ margin: 0, textAlign: "center" }}>
          We&apos;ll ask {doubles ? "your opponents" : "your opponent"} to confirm. If they say it didn&apos;t happen, it&apos;s removed.
        </p>
      </div>

      {picking && (
        <div className="sheet-wrap" onClick={() => setPicking(null)} role="dialog" aria-modal="true" aria-label={`Choose ${label[picking].toLowerCase()}`}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="story-head">
              <h2>{label[picking]}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setPicking(null)}>
                Close
              </button>
            </div>
            <PlayerSearch
              me={userId}
              mode="pick"
              autoFocus
              exclude={chosen}
              placeholder="Who did you play with?"
              onPick={(p) => {
                setPeople((x) => ({ ...x, [picking]: p }));
                setPicking(null);
              }}
            />
          </div>
        </div>
      )}
      {courtSheet && (
        <LocationSheet
          courts={courts}
          near={coords}
          sport={sport}
          title="Where did you play?"
          onPick={(c) => {
            setCourt(c);
            setCourtSheet(false);
          }}
          onClose={() => setCourtSheet(false)}
        />
      )}
    </>
  );
}

function PersonSlot({ p, label, onAdd, onClear }: { p?: FoundPlayer; label: string; onAdd: () => void; onClear: () => void }) {
  if (!p)
    return (
      <button type="button" className="log-person log-add" onClick={onAdd}>
        <span className="log-plus">+</span>
        <span>{label}</span>
      </button>
    );
  return (
    <span className="log-person">
      <Avatar id={p.id} name={p.display_name} src={p.avatar_url} size={32} />
      <b>{p.display_name}</b>
      <button type="button" className="log-x" onClick={onClear} aria-label={`Remove ${p.display_name}`}>
        ×
      </button>
    </span>
  );
}
