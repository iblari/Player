"use client";
import { use, useEffect, useLayoutEffect, useRef, useState } from "react";
import { track } from "@/lib/track";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "@/components/Session";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import { BackIcon, SendIcon } from "@/components/Icons";
import { fetchPlayers, nameOf } from "@/lib/games";
import { markSeen, useChat, type Msg } from "@/lib/chat";
import type { PlayerLite } from "@/lib/types";

const QUICK = ["On my way", "Running 5 min late", "I'm at the court", "Which court number?"];

type G = { id: string; slots: number; status: string; starts_at: string; courts: { name: string } | null };

function dayLabel(d: Date) {
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
const timeLabel = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { userId } = useSession();
  const toast = useToast();
  const [game, setGame] = useState<G | null | undefined>();
  const [roster, setRoster] = useState<string[]>([]);
  const [players, setPlayers] = useState<Record<string, PlayerLite>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { msgs, ready, missing, push } = useChat(id);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [{ data: g }, { data: r }] = await Promise.all([
        sb.from("games").select("id, slots, status, starts_at, courts(name)").eq("id", id).maybeSingle(),
        sb.from("game_players").select("player_id").eq("game_id", id).order("joined_at"),
      ]);
      setGame((g as unknown as G) ?? null);
      const ids = ((r as { player_id: string }[]) ?? []).map((x) => x.player_id);
      setRoster(ids);
      setPlayers(await fetchPlayers(ids));
    })();
  }, [id]);

  // Names for anyone who posted but has since left the game.
  useEffect(() => {
    const unknown = [...new Set(msgs.map((m) => m.sender_id))].filter((s) => !players[s]);
    if (unknown.length) fetchPlayers(unknown).then((p) => setPlayers((x) => ({ ...x, ...p })));
  }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
    const last = msgs[msgs.length - 1];
    if (last) markSeen(id, last.id);
  }, [msgs.length, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const inGame = !!userId && roster.includes(userId);
  const closed = game ? game.status === "cancelled" || new Date(game.starts_at).getTime() < Date.now() - 864e5 : false;

  async function send(body: string) {
    const b = body.trim();
    if (!b || sending) return;
    setSending(true);
    const { data, error } = await supabase().from("game_messages").insert({ game_id: id, body: b }).select().single();
    setSending(false);
    if (error) return toast("Couldn't send. Try again.");
    push(data as Msg);
    track("chat_sent");
    setText("");
    box.current?.focus();
    fetch("/api/notify-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: (data as Msg).id }) }).catch(() => {});
  }

  const names = (pid: string) => nameOf(players, pid, userId);
  const title = game?.courts?.name ?? "Game chat";
  const others = roster.filter((p) => p !== userId);

  if (game === null)
    return (
      <div className="empty">
        <strong>This game doesn&apos;t exist anymore.</strong>
        <Link className="btn btn-sm" href="/play">Back home</Link>
      </div>
    );

  return (
    <div className="chat">
      <header className="chat-head">
        <Link className="chat-back" href={`/g/${id}`} aria-label="Back to the game">
          <BackIcon />
        </Link>
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="chat-title">{title}</b>
          <span className="small muted">
            {game ? `${game.slots === 4 ? "Doubles" : "Singles"} · ` : ""}
            {others.length ? others.map(names).join(", ") + " and you" : "Just you so far"}
          </span>
        </div>
        <div className="chat-faces" aria-hidden="true">
          {others.slice(0, 3).map((p) => (
            <Avatar key={p} id={p} name={names(p)} src={players[p]?.avatar_url} size={30} />
          ))}
        </div>
      </header>

      <div className="chat-list" aria-live="polite">
        {!ready ? (
          <div className="skeleton" style={{ minHeight: 120 }} />
        ) : missing ? (
          <div className="notice">
            <b>Chat is almost ready</b>
            <span className="muted">Game chat switches on with the next database update. Use Share invite to reach players for now.</span>
          </div>
        ) : userId && !inGame ? (
          <div className="notice">
            <b>Only players in this game can see the chat.</b>
            <Link className="btn btn-sm" href={`/g/${id}`}>Back to the game</Link>
          </div>
        ) : msgs.length === 0 ? (
          <div className="chat-empty">
            <b>Say hi to your {game?.slots === 4 ? "group" : "opponent"}</b>
            <span className="muted small">Sort out the court number, who brings balls, or let them know you&apos;re running late. Only players in this game can see this.</span>
          </div>
        ) : (
          msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const d = new Date(m.created_at);
            const newDay = !prev || new Date(prev.created_at).toDateString() !== d.toDateString();
            const gap = !prev || d.getTime() - new Date(prev.created_at).getTime() > 10 * 60000;
            const mine = m.sender_id === userId;
            const runStart = newDay || gap || prev.sender_id !== m.sender_id;
            return (
              <div key={m.id}>
                {(newDay || gap) && (
                  <div className="chat-when">
                    {newDay ? `${dayLabel(d)} · ` : ""}
                    {timeLabel(d)}
                  </div>
                )}
                <div className={`chat-row${mine ? " mine" : ""}${runStart ? " start" : ""}`}>
                  {!mine && (runStart ? <Avatar id={m.sender_id} name={names(m.sender_id)} src={players[m.sender_id]?.avatar_url} size={28} /> : <span className="chat-pad" />)}
                  <div className="chat-col">
                    {!mine && runStart && <span className="chat-name">{names(m.sender_id)}</span>}
                    <div className="chat-bubble" title={timeLabel(d)}>{m.body}</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>

      {inGame && !missing && (
        <div className="chat-compose">
          {closed ? (
            <p className="small muted" style={{ margin: 0, textAlign: "center" }}>This chat is closed.</p>
          ) : (
            <>
              <div className="chat-quick">
                {QUICK.map((q) => (
                  <button key={q} type="button" className="chip-btn" onClick={() => send(q)} disabled={sending}>
                    {q}
                  </button>
                ))}
              </div>
              <form
                className="chat-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(text);
                }}
              >
                <textarea
                  ref={box}
                  rows={1}
                  value={text}
                  maxLength={1000}
                  placeholder="Message"
                  aria-label="Message"
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send(text);
                    }
                  }}
                />
                <button className="chat-send" type="submit" disabled={!text.trim() || sending} aria-label="Send">
                  <SendIcon />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
