"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { isMissing } from "@/lib/rpc";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import { SPORT_META, type Sport } from "@/lib/types";
import { timeOf } from "@/lib/util";

type Result = { team_a: string[]; team_b: string[]; score_a: number; score_b: number };
type Report = Result & { reporter_id: string; created_at: string };
type Hist = { player_id: string; mu_before: number; mu_after: number; won: boolean };

const ERRORS: Record<string, string> = {
  not_started: "You can log the score once the game has started.",
  already_scored: "The final score is already in.",
  bad_teams: "Pick teams with the same number of players.",
  bad_score: "Scores can't be tied.",
  not_in_game: "Only players in this game can log the score.",
};

/**
 * After a game, every player can enter the score. The host's score is final as soon as they
 * enter it (it wins any disagreement). Another player's score waits for the host; if the host
 * hasn't entered one 24 hours after it, it becomes final. Ratings move once a score is final.
 * Then each player says how the others played relative to them, and whether they'd play again.
 */
export default function GameResult({
  gameId,
  sport,
  players,
  userId,
  nameOf,
  avatarOf,
  onScored,
  hostId,
}: {
  gameId: string;
  sport: Sport;
  players: string[];
  userId: string;
  nameOf: (id: string) => string;
  avatarOf: (id: string) => string | null | undefined;
  onScored?: () => void;
  hostId: string;
}) {
  const isHost = userId === hostId;
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
  const [unavailable, setUnavailable] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    // A waiting score past the host's 24 hours becomes final now (no-op otherwise).
    await sb.rpc("finalize_due", { p_game: gameId });
    const { data: reps } = await sb.from("score_reports").select("reporter_id, team_a, team_b, score_a, score_b, created_at").eq("game_id", gameId).order("created_at");
    setReports((reps as Report[]) ?? []);
    const [{ data: r, error: rErr }, { data: h }, { data: fb }, { data: pa }] = await Promise.all([
      sb.from("game_results").select("team_a, team_b, score_a, score_b").eq("game_id", gameId).maybeSingle(),
      sb.from("rating_history").select("player_id, mu_before, mu_after, won").eq("game_id", gameId),
      sb.from("level_feedback").select("ratee_id").eq("game_id", gameId).eq("rater_id", userId),
      sb.from("play_again").select("answer").eq("game_id", gameId).eq("rater_id", userId).maybeSingle(),
    ]);
    // Database not migrated yet: hide score entry instead of showing a form that can't save.
    if (isMissing(rErr)) return setUnavailable(true);
    setResult((r as Result) ?? null);
    setHist(((h as Hist[]) ?? []).map((x) => ({ ...x, mu_before: Number(x.mu_before), mu_after: Number(x.mu_after) })));
    setFeedbackDone(((fb as unknown[]) ?? []).length > 0 || !!pa);
  }, [gameId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Someone else's report, seen from my side of the net.
  const mine_ = reports.find((r) => r.reporter_id === userId);
  const others_ = reports.filter((r) => r.reporter_id !== userId);
  const fromMySide = (r: Report) => {
    const onA = r.team_a.includes(userId);
    const myTeam = onA ? r.team_a : r.team_b;
    return { me: onA ? r.score_a : r.score_b, them: onA ? r.score_b : r.score_a, partner: myTeam.find((x) => x !== userId) ?? null, opp: (onA ? r.team_b : r.team_a)[0] };
  };
  const prefill = (r: Report) => {
    const s = fromMySide(r);
    setMine(s.me);
    setTheirs(s.them);
    if (doubles) setPartner(s.partner);
    else setOpp(s.opp);
  };

  // Host: start from what the other player entered, so confirming is one tap.
  useEffect(() => {
    if (isHost && !mine_ && others_[0]) prefill(others_[0]);
  }, [reports.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (unavailable || result === undefined) return null;

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
    const { data, error } = await supabase().rpc("submit_result", { p_game: gameId, p_team_a: a, p_team_b: b, p_score_a: mine, p_score_b: theirs });
    setBusy(false);
    if (error) {
      const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
      return setErr(key ? ERRORS[key] : "Couldn't save the score. Try again.");
    }
    const status = (data as { status?: string } | null)?.status;
    if (status === "pending") {
      toast(`Score sent. ${nameOf(hostId)} confirms it, or it's final in 24 hours.`);
      fetch("/api/notify-score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId }) }).catch(() => {});
    } else toast("Final score saved. Ratings updated.");
    setEditing(false);
    load();
    onScored?.();
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

  if (!result && !isHost && mine_ && !editing) {
    const s = fromMySide(mine_);
    const deadline = new Date(new Date(reports.filter((r) => r.reporter_id !== hostId)[0]?.created_at ?? mine_.created_at).getTime() + 864e5);
    return (
      <section className="block result">
        <h2>Score sent</h2>
        <div className="final">
          <div>
            <span className="opt-label">{doubles ? "Your team" : "You"}</span>
            <b className={s.me > s.them ? "win" : ""}>{s.me}</b>
          </div>
          <div>
            <span className="opt-label">Them</span>
            <b className={s.them > s.me ? "win" : ""}>{s.them}</b>
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Waiting for {nameOf(hostId)} (host) to confirm. If they don&apos;t by {deadline.toDateString() === new Date().toDateString() ? "" : "tomorrow "}
          {timeOf(deadline)}, your score becomes final and ratings update.
        </p>
        <button className="btn btn-block" onClick={() => setEditing(true)}>
          Change score
        </button>
      </section>
    );
  }

  if (!result) {
    const theirReport = isHost ? others_[0] : null;
    return (
      <section className="block result">
        <h2>How&apos;d it go?</h2>
        {theirReport ? (
          <div className="notice" style={{ borderColor: "var(--ball)" }}>
            <b>
              {nameOf(theirReport.reporter_id)} entered {fromMySide(theirReport).me}–{fromMySide(theirReport).them} (you–them)
            </b>
            <span className="muted">It&apos;s filled in below. Confirm it, or fix it: as host, your score is the final one.</span>
          </div>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            {isHost
              ? `As host, your score is final. It updates each player's ${meta.label.toLowerCase()} level.`
              : `Enter the score. ${nameOf(hostId)} (host) confirms it, or it's final after 24 hours.`}
          </p>
        )}
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
          {busy ? "Saving…" : isHost ? (theirReport ? "Confirm final score" : "Save final score") : mine_ ? "Update score" : "Send score"}
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
