"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import { SPORT_META, type Sport } from "@/lib/types";

type Result = { team_a: string[]; team_b: string[]; score_a: number; score_b: number };
type Hist = { player_id: string; mu_before: number; mu_after: number; won: boolean };

const ERRORS: Record<string, string> = {
  not_started: "You can log the score once the game has started.",
  already_scored: "Someone already logged this score.",
  bad_teams: "Pick teams with the same number of players.",
  bad_score: "Scores can't be tied.",
  not_in_game: "Only players in this game can log the score.",
};

/**
 * After a game: one player logs the score (ratings update for everyone), then each player
 * says how the others played relative to them and whether they'd play together again.
 */
export default function GameResult({
  gameId,
  sport,
  players,
  userId,
  nameOf,
  avatarOf,
}: {
  gameId: string;
  sport: Sport;
  players: string[];
  userId: string;
  nameOf: (id: string) => string;
  avatarOf: (id: string) => string | null | undefined;
}) {
  const toast = useToast();
  const meta = SPORT_META[sport];
  const others = players.filter((p) => p !== userId);
  const doubles = players.length >= 4;
  const [result, setResult] = useState<Result | null | undefined>();
  const [hist, setHist] = useState<Hist[]>([]);
  const [partner, setPartner] = useState<string | null>(null);
  const [opp, setOpp] = useState<string | null>(null);
  const [mine, setMine] = useState(sport === "tennis" ? 6 : 11);
  const [theirs, setTheirs] = useState(sport === "tennis" ? 4 : 8);
  const [verdicts, setVerdicts] = useState<Record<string, -1 | 0 | 1>>({});
  const [again, setAgain] = useState<boolean | null>(null);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: r }, { data: h }, { data: fb }, { data: pa }] = await Promise.all([
      sb.from("game_results").select("team_a, team_b, score_a, score_b").eq("game_id", gameId).maybeSingle(),
      sb.from("rating_history").select("player_id, mu_before, mu_after, won").eq("game_id", gameId),
      sb.from("level_feedback").select("ratee_id").eq("game_id", gameId).eq("rater_id", userId),
      sb.from("play_again").select("answer").eq("game_id", gameId).eq("rater_id", userId).maybeSingle(),
    ]);
    setResult((r as Result) ?? null);
    setHist(((h as Hist[]) ?? []).map((x) => ({ ...x, mu_before: Number(x.mu_before), mu_after: Number(x.mu_after) })));
    setFeedbackDone(((fb as unknown[]) ?? []).length > 0 || !!pa);
  }, [gameId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (result === undefined) return null;

  async function submitScore() {
    setErr(null);
    let a: string[], b: string[];
    if (doubles) {
      if (!partner) return setErr("Pick your partner.");
      a = [userId, partner];
      b = others.filter((p) => p !== partner).slice(0, 2);
    } else {
      const o = opp ?? others[0];
      if (!o) return setErr("Pick who you played.");
      a = [userId];
      b = [o];
    }
    if (mine === theirs) return setErr(ERRORS.bad_score);
    setBusy(true);
    const { error } = await supabase().rpc("submit_result", { p_game: gameId, p_team_a: a, p_team_b: b, p_score_a: mine, p_score_b: theirs });
    setBusy(false);
    if (error) {
      const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
      return setErr(key ? ERRORS[key] : "Couldn't save the score. Try again.");
    }
    toast("Score saved. Ratings updated.");
    load();
  }

  async function submitFeedback() {
    setBusy(true);
    const { error } = await supabase().rpc("submit_feedback", { p_game: gameId, p_verdicts: verdicts, p_play_again: again });
    setBusy(false);
    if (error) return toast("Couldn't save. Try again.");
    setFeedbackDone(true);
    toast("Thanks. This sharpens who you get matched with.");
  }

  const me = hist.find((h) => h.player_id === userId);
  const fmt = (x: number) => x.toFixed(2);

  if (!result) {
    return (
      <section className="block result">
        <h2>How&apos;d it go?</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Log the score once for everyone. It updates each player&apos;s {meta.label.toLowerCase()} level.
        </p>
        {doubles ? (
          <div className="opt-group">
            <span className="opt-label">Your partner</span>
            <div className="seg">
              {others.map((p) => (
                <button key={p} type="button" aria-pressed={partner === p} onClick={() => setPartner(p)}>
                  {nameOf(p)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          others.length > 1 && (
            <div className="opt-group">
              <span className="opt-label">You played</span>
              <div className="seg">
                {others.map((p) => (
                  <button key={p} type="button" aria-pressed={(opp ?? others[0]) === p} onClick={() => setOpp(p)}>
                    {nameOf(p)}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
        <div className="scoreboard">
          {[
            { label: doubles ? "Your team" : "You", v: mine, set: setMine },
            { label: "Them", v: theirs, set: setTheirs },
          ].map((t) => (
            <div key={t.label} className="score-side">
              <span className="opt-label">{t.label}</span>
              <div className="stepper">
                <button type="button" aria-label={`Lower ${t.label} score`} disabled={t.v <= 0} onClick={() => t.set(t.v - 1)}>
                  −
                </button>
                <output className="score-num">{t.v}</output>
                <button type="button" aria-label={`Raise ${t.label} score`} disabled={t.v >= 99} onClick={() => t.set(t.v + 1)}>
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        {sport === "tennis" && <span className="small muted">Tennis: enter games in a one-set match, or sets won.</span>}
        {err && <p className="err">{err}</p>}
        <button className="btn btn-ball btn-block" onClick={submitScore} disabled={busy}>
          {busy ? "Saving…" : "Save score"}
        </button>
      </section>
    );
  }

  const name = (ids: string[]) => ids.map(nameOf).join(" + ");
  return (
    <section className="block result">
      <h2>Final</h2>
      <div className="final">
        <div>
          <span className="opt-label">{name(result.team_a)}</span>
          <b className={result.score_a > result.score_b ? "win" : ""}>{result.score_a}</b>
        </div>
        <div>
          <span className="opt-label">{name(result.team_b)}</span>
          <b className={result.score_b > result.score_a ? "win" : ""}>{result.score_b}</b>
        </div>
      </div>
      {me && (
        <div className="level-delta">
          <span>Your {meta.label.toLowerCase()} level</span>
          <b>
            {fmt(me.mu_before)} <span className="arrow">→ {fmt(me.mu_after)}</span>
          </b>
        </div>
      )}

      {!feedbackDone && others.length > 0 && (
        <div className="opt-group" style={{ gap: 14 }}>
          <h3>Was the level right?</h3>
          <span className="small muted" style={{ marginTop: -8 }}>
            Compared with you. Private: players never see what you picked.
          </span>
          {others.map((p) => (
            <div className="verdict-row" key={p}>
              <Avatar id={p} name={nameOf(p)} src={avatarOf(p)} size={36} />
              <span className="grow">{nameOf(p)}</span>
              <div className="segbar segbar-3" role="group" aria-label={`${nameOf(p)}'s level compared with you`}>
                {(
                  [
                    [-1, "Below"],
                    [0, "Even"],
                    [1, "Above"],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={verdicts[p] === v} onClick={() => setVerdicts((x) => ({ ...x, [p]: v }))}>
                    <b>{l}</b>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="verdict-row">
            <span className="grow">Play with this group again?</span>
            <div className="seg">
              <button type="button" aria-pressed={again === false} onClick={() => setAgain(false)}>
                No
              </button>
              <button type="button" aria-pressed={again === true} onClick={() => setAgain(true)}>
                Yes
              </button>
            </div>
          </div>
          <button className="btn btn-primary btn-block" onClick={submitFeedback} disabled={busy || (!Object.keys(verdicts).length && again === null)}>
            Submit
          </button>
        </div>
      )}
    </section>
  );
}
