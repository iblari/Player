"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { isMissing } from "@/lib/rpc";

export type Msg = { id: number; game_id: string; sender_id: string; body: string; created_at: string };

const seenKey = (gameId: string) => `chat-seen-${gameId}`;
export function markSeen(gameId: string, id: number) {
  try {
    localStorage.setItem(seenKey(gameId), String(id));
  } catch {
    /* storage blocked */
  }
}
function lastSeen(gameId: string): number {
  try {
    return Number(localStorage.getItem(seenKey(gameId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Messages for a game, live. `ready` is false while loading; `missing` means the chat
 * table isn't in the database yet (migration not run). */
export function useChat(gameId: string, enabled = true) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const ids = useRef(new Set<number>());

  useEffect(() => {
    if (!enabled) return;
    const sb = supabase();
    let alive = true;
    const add = (list: Msg[]) => {
      const fresh = list.filter((m) => !ids.current.has(m.id));
      if (!fresh.length) return;
      fresh.forEach((m) => ids.current.add(m.id));
      setMsgs((xs) => [...xs, ...fresh].sort((a, b) => a.id - b.id));
    };
    const load = async () => {
      const { data, error } = await sb.from("game_messages").select("*").eq("game_id", gameId).order("id", { ascending: false }).limit(200);
      if (!alive) return;
      if (isMissing(error)) setMissing(true);
      add(((data as Msg[]) ?? []).reverse());
      setReady(true);
    };
    load();
    const ch = sb
      .channel(`chat-${gameId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_messages", filter: `game_id=eq.${gameId}` }, (p) => add([p.new as Msg]))
      .subscribe();
    // Realtime can drop on mobile when the tab sleeps; refetch when it comes back.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      sb.removeChannel(ch);
    };
  }, [gameId, enabled]);

  return { msgs, ready, missing, push: (m: Msg) => { if (!ids.current.has(m.id)) { ids.current.add(m.id); setMsgs((xs) => [...xs, m]); } } };
}

/** Unread count for the game page's chat button. */
export function useUnread(gameId: string, userId: string | null, enabled: boolean) {
  const { msgs, ready, missing } = useChat(gameId, enabled);
  const seen = typeof window === "undefined" ? 0 : lastSeen(gameId);
  const unread = msgs.filter((m) => m.id > seen && m.sender_id !== userId).length;
  return { unread, ready, missing, count: msgs.length, last: msgs[msgs.length - 1] };
}
