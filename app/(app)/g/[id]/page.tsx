"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/components/Session";
import { useToast } from "@/components/Toast";
import CourtDiagram from "@/components/CourtDiagram";
import Avatar from "@/components/Avatar";
import { fetchPlayers, JOIN_MESSAGES, nameOf, useLiveGames } from "@/lib/games";
import { gameState, type Game, type PlayerLite } from "@/lib/types";
import { fmtSkill, timeOf, when } from "@/lib/util";

type Row = { player_id: string; no_show: boolean; joined_at: string };
type Rel = { player_id: string; games: number; showed: number };

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const { userId } = useSession();
  const toast = useToast();
  const [game, setGame] = useState<(Game & { courts: { name: string; address: string | null; notes: string | null } }) | null | undefined>();
  const [rows, setRows] = useState<Row[]>([]);
  const [players, setPlayers] = useState<Record<string, PlayerLite>>({});
  const [rel, setRel] = useState<Record<string, Rel>>({});
  const [pt, setPt] = useState<{ lat: number; lng: number } | null>(null);
  const [noShows, setNoShows] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: g }, { data: r }] = await Promise.all([
      sb.from("games").select("*, courts(name, address, notes)").eq("id", id).maybeSingle(),
      sb.from("game_players").select("player_id, no_show, joined_at").eq("game_id", id).order("joined_at"),
    ]);
    setGame(g ?? null);
    const list = (r as Row[]) ?? [];
    setRows(list);
    const ids = list.map((x) => x.player_id);
    setPlayers(await fetchPlayers(ids));
    const { data: rr } = await sb.rpc("reliability", { p_ids: ids });
    const m: Record<string, Rel> = {};
    ((rr as Rel[]) ?? []).forEach((x) => (m[x.player_id] = x));
    setRel(m);
    if (g && !pt) {
      const { data: p } = await sb.rpc("court_point", { p_court: g.court_id });
      if ((p as { lat: number; lng: number }[])?.[0]) setPt((p as { lat: number; lng: number }[])[0]);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);
  useLiveGames(load, { gameId: id });

  useEffect(() => {
    if (search.get("posted")) toast("Game posted. Players near the court were pinged.");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (game === undefined) return <div className="skeleton" style={{ minHeight: 260 }} />;
  if (game === null)
    return (
      <div className="empty">
        <strong>This game doesn&apos;t exist anymore.</strong>
        <Link className="btn btn-sm" href="/play">
          See games near you
        </Link>
      </div>
    );

  const ids = rows.map((r) => r.player_id);
  const n = ids.length;
  const st = gameState(game, n, game.slots);
  const left = game.slots - n;
  const isHost = game.host_id === userId;
  const inGame = !!userId && ids.includes(userId);
  const started = new Date(game.starts_at).getTime() < Date.now();
  const names = (pid: string) => nameOf(players, pid, userId);
  const url = typeof window !== "undefined" ? `${window.location.origin}/g/${game.id}` : "";

  const headline =
    st === "full" ? "Game on" : st === "cancelled" ? "Cancelled" : st === "expired" ? "Didn't fill" : left === 1 ? "Need one more" : `Need ${left} more`;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      load();
    }
  }
  const join = () =>
    act(async () => {
      const { data, error } = await supabase().rpc("join_game", { p_game: id });
      toast(error ? "Couldn't join. Try again." : JOIN_MESSAGES[data as string] ?? "Done.");
    });
  const leave = () =>
    act(async () => {
      const { data } = await supabase().rpc("leave_game", { p_game: id });
      toast(data === "left" ? "You left the game." : data === "started" ? "This game already started." : "Couldn't leave.");
    });
  const cancel = () =>
    act(async () => {
      const { error } = await supabase().from("games").update({ status: "cancelled" }).eq("id", id);
      toast(error ? "Couldn't cancel. Try again." : "Game cancelled.");
      setConfirmCancel(false);
    });
  const saveAttendance = () =>
    act(async () => {
      const sb = supabase();
      for (const pid of ids) {
        await sb.from("game_players").update({ no_show: noShows.includes(pid) }).eq("game_id", id).eq("player_id", pid);
      }
      await sb.from("games").update({ attendance_done: true }).eq("id", id);
      toast("Attendance saved.");
    });
  async function share() {
    const text = `${headline} for ${game!.slots === 4 ? "doubles" : "singles"} at ${game!.courts.name}, ${when(game!.starts_at)}.`;
    try {
      if (navigator.share) await navigator.share({ title: "Fourth Up", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast("Invite link copied.");
      }
    } catch {
      /* dismissed */
    }
  }

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <p className="sub" style={{ margin: "0 0 6px" }}>
            {game.slots === 4 ? "Doubles" : "Singles"} at {game.courts.name}
          </p>
          <h1>{headline}</h1>
          {st === "open" && (
            <p className="finding" style={{ margin: "8px 0 0" }}>
              <span className="pulse" aria-hidden="true" /> Finding players near {game.courts.name}
            </p>
          )}
        </div>
        <div className="score-big" aria-label={`${n} of ${game.slots} players`}>
          {n}
          <small>/{game.slots}</small>
        </div>
      </div>

      <CourtDiagram slots={game.slots} players={ids.map((pid) => ({ id: pid, name: names(pid), isMe: pid === userId }))} />

      <div className="facts">
        <div className="fact">
          <span>Starts</span>
          <b>{when(game.starts_at)}</b>
        </div>
        <div className="fact">
          <span>Rating</span>
          <b>
            {fmtSkill(game.skill_min)}–{fmtSkill(game.skill_max)}
          </b>
        </div>
        <div className="fact">
          <span>Court</span>
          <b>{game.courts.name}</b>
        </div>
        <div className="fact">
          <span>{st === "open" ? "Request open until" : "Posted"}</span>
          <b>{st === "open" ? timeOf(game.expires_at) : when(game.created_at)}</b>
        </div>
      </div>
      {game.note && <p style={{ margin: 0 }}>&ldquo;{game.note}&rdquo; <span className="muted small">from {names(game.host_id)}</span></p>}

      {st !== "cancelled" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!userId ? (
            <Link className="btn btn-ball btn-block" href={`/login?next=/g/${id}`}>
              Sign in to join
            </Link>
          ) : st === "open" && !inGame ? (
            <button className="btn btn-ball btn-block" onClick={join} disabled={busy}>
              I&apos;m in
            </button>
          ) : null}
          <div className="btn-row">
            <button className="btn" onClick={share}>
              Share invite
            </button>
            {pt && (
              <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${pt.lat},${pt.lng}`} target="_blank" rel="noreferrer">
                Directions
              </a>
            )}
          </div>
        </div>
      )}

      <section className="block">
        <div className="block-head">
          <h2>Who&apos;s playing</h2>
          <span className="count">
            {n}/{game.slots}
          </span>
        </div>
        <div className="roster">
          {ids.map((pid) => {
            const r = rel[pid];
            return (
              <div className="roster-row" key={pid}>
                <Avatar id={pid} name={names(pid)} src={players[pid]?.avatar_url} />
                <div className="grow">
                  <b>{names(pid)}</b>
                  {pid === game.host_id && <span className="pill" style={{ marginLeft: 8 }}>Host</span>}
                  <div className="small muted">
                    {players[pid] ? `Rated ${fmtSkill(players[pid].skill)}` : ""}
                    {r ? `, shows up ${Math.round((r.showed / r.games) * 100)}% of ${r.games}` : ", new player"}
                  </div>
                </div>
              </div>
            );
          })}
          {st === "open" &&
            Array.from({ length: left }).map((_, i) => (
              <div className="roster-row" key={`open-${i}`}>
                <span className="avatar" style={{ width: 36, height: 36, background: "transparent", border: "2px dashed var(--line)" }} />
                <span className="muted">Open spot</span>
              </div>
            ))}
        </div>
      </section>

      {isHost && st === "full" && started && !game.attendance_done && (
        <section className="block">
          <h2>Did everyone show?</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Tick anyone who didn&apos;t. This builds each player&apos;s show-up rate.
          </p>
          <div className="roster">
            {ids
              .filter((pid) => pid !== userId)
              .map((pid) => (
                <label className="roster-row" key={pid} style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={noShows.includes(pid)}
                    onChange={(e) => setNoShows((xs) => (e.target.checked ? [...xs, pid] : xs.filter((x) => x !== pid)))}
                    style={{ width: 22, height: 22 }}
                  />
                  <span className="grow">{names(pid)} didn&apos;t show</span>
                </label>
              ))}
          </div>
          <button className="btn btn-primary" onClick={saveAttendance} disabled={busy}>
            Save attendance
          </button>
        </section>
      )}

      {!started && st !== "cancelled" && (inGame || isHost) && (
        <div>
          {isHost ? (
            confirmCancel ? (
              <div className="notice">
                <b>Cancel this game? Everyone in it will see it&apos;s off.</b>
                <div className="btn-row" style={{ width: "100%" }}>
                  <button className="btn btn-sm btn-danger" onClick={cancel} disabled={busy}>
                    Cancel game
                  </button>
                  <button className="btn btn-sm" onClick={() => setConfirmCancel(false)}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-ghost btn-block btn-danger" onClick={() => setConfirmCancel(true)}>
                Cancel game
              </button>
            )
          ) : (
            <button className="btn btn-ghost btn-block" onClick={leave} disabled={busy}>
              Leave game
            </button>
          )}
        </div>
      )}
    </>
  );
}
