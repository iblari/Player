"use client";
import { useEffect } from "react";
import Link from "next/link";

export type MembershipAnswer = "member" | "guest";

/** Asks whether the player can get into a members-only club before they host or join there. */
export default function MembershipPrompt({
  club,
  courtName,
  action,
  onAnswer,
  onClose,
}: {
  club: string | null;
  courtName: string;
  action: "join" | "host";
  onAnswer: (a: MembershipAnswer) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const who = club ?? "this club";
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="mp-title" onClick={onClose}>
      <div className="sheet" style={{ height: "auto", gap: 14 }} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <span className="pill" style={{ alignSelf: "flex-start" }}>Members only</span>
        <h2 id="mp-title" style={{ fontSize: "1.4rem" }}>
          Are you a {club ?? "member here"}{club ? " member" : ""}?
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {club
            ? `${club} pickleball courts are for members only. Guests can't play, so confirm your membership before you ${action === "join" ? "take a spot" : "post a game"}.`
            : `${courtName} is a private court for members or residents and their guests. Confirm you can get in before you ${action === "join" ? "take a spot" : "post a game"}.`}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <button className="btn btn-primary btn-block" onClick={() => onAnswer("member")}>
            Yes, I&apos;m a {club ? `${club} ` : ""}member
          </button>
          {!club && (
            <button className="btn btn-block" onClick={() => onAnswer("guest")}>
              I&apos;m going as a member&apos;s guest
            </button>
          )}
          <Link className="btn btn-ghost btn-block" href="/courts" onClick={onClose}>
            No, I&apos;m not a member · show public courts
          </Link>
        </div>
        {club && (
          <p className="small muted" style={{ margin: 0 }}>
            Choosing &quot;member&quot; saves it to your profile, so you&apos;ll see and get pinged for {who} games. You can change it in Account.
          </p>
        )}
      </div>
    </div>
  );
}
