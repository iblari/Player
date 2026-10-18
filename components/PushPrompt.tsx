"use client";
import { useEffect, useState } from "react";
import { enablePush, pushState, type PushState } from "@/lib/push";
import { useToast } from "./Toast";

const KEY = "push-prompt-dismissed";

/**
 * Asks for notifications at the moment they matter: you're in a game that's waiting on players.
 * On iPhone in Safari, explains the Home Screen step first, since iOS only allows web
 * notifications from an app added to the Home Screen.
 */
export default function PushPrompt({ userId, waiting }: { userId: string; waiting: boolean }) {
  const toast = useToast();
  const [st, setSt] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(Number(localStorage.getItem(KEY) ?? 0) > Date.now() - 3 * 864e5);
    } catch {
      setHidden(false);
    }
    pushState(userId).then(setSt);
  }, [userId]);

  if (hidden || !st || st === "on" || st === "unsupported") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {}
    setHidden(true);
  };

  async function turnOn() {
    try {
      const s = await enablePush(userId);
      setSt(s);
      if (s === "on") toast("Notifications on. We'll tell you the moment it's game on.");
      else if (s === "blocked") toast("Notifications are blocked for this site in your browser settings.");
    } catch {
      toast("Couldn't turn on notifications. Try again.");
    }
  }

  const lead = waiting ? "Get a heads-up when your game fills" : "Get a heads-up about this game";

  return (
    <div className="notice push-prompt">
      {st === "ios-install" ? (
        <>
          <b>{lead}</b>
          <span className="muted">iPhone only sends notifications from apps on your Home Screen. It takes 10 seconds:</span>
          <ol className="push-steps">
            <li>
              Tap <b>Share</b> <span className="share-glyph" aria-hidden="true" /> at the bottom of Safari
            </li>
            <li>
              Tap <b>Add to Home Screen</b>, then <b>Add</b>
            </li>
            <li>Open the app from your Home Screen and turn on notifications</li>
          </ol>
          <button className="btn btn-sm btn-ghost" onClick={dismiss}>
            Not now
          </button>
        </>
      ) : st === "blocked" ? (
        <>
          <b>Notifications are blocked</b>
          <span className="muted">You won&apos;t hear when this game fills. Allow notifications for this site in your browser settings.</span>
          <button className="btn btn-sm btn-ghost" onClick={dismiss}>
            Got it
          </button>
        </>
      ) : (
        <>
          <b>{lead}</b>
          <span className="muted">We&apos;ll ping you when someone joins and when it&apos;s game on. Nothing else unless you&apos;re available.</span>
          <div className="btn-row" style={{ width: "100%" }}>
            <button className="btn btn-ball btn-sm" onClick={turnOn}>
              Turn on notifications
            </button>
            <button className="btn btn-sm btn-ghost" onClick={dismiss}>
              Not now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
