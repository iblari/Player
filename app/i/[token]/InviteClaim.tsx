"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { track } from "@/lib/track";

const MSG: Record<string, string> = {
  already_claimed: "Someone already joined with this link. If that wasn't you, ask for a new one.",
  already_in_game: "You're already in this match.",
  expired: "This link has expired.",
};

/** Signed out: sign up and come back. Signed in: join the match (once) and go confirm the score. */
export default function InviteClaim({ token, claimed, gameId }: { token: string; claimed: boolean; gameId: string }) {
  const router = useRouter();
  const [me, setMe] = useState<string | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .auth.getUser()
      .then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  async function claim() {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase().rpc("claim_invite", { p_token: token });
    if (error) {
      setBusy(false);
      const k = Object.keys(MSG).find((x) => error.message.includes(x));
      if (k === "already_in_game") return router.replace(`/g/${gameId}#score`);
      return setErr(k ? MSG[k] : "Couldn't join. Try again.");
    }
    track("invite_claimed");
    fetch("/api/notify-claimed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId: data }) }).catch(() => {});
    router.replace(`/g/${data}#score`);
  }

  // Back from signing up with ?claim=1: join straight away.
  useEffect(() => {
    if (me && new URLSearchParams(window.location.search).get("claim") === "1") claim();
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  if (me === undefined) return <div className="skeleton" style={{ height: 52 }} />;
  if (claimed && me) return <a className="btn btn-ball btn-block" href={`/g/${gameId}#score`}>Open the match</a>;
  if (claimed) return <p className="muted">Someone already joined with this link.</p>;

  return (
    <>
      {me ? (
        <button className="btn btn-ball btn-block" onClick={claim} disabled={busy}>
          {busy ? "Joining…" : "That's me: confirm the score"}
        </button>
      ) : (
        <>
          <a className="btn btn-ball btn-block" href={`/login?next=${encodeURIComponent(`/i/${token}?claim=1`)}`} onClick={() => track("invite_signup_clicked")}>
            Sign up to confirm
          </a>
          <span className="small muted" style={{ textAlign: "center" }}>
            Free · takes 30 seconds
          </span>
        </>
      )}
      {err && <p className="small" style={{ color: "var(--bad)", margin: 0 }}>{err}</p>}
    </>
  );
}
