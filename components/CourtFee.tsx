"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "./Toast";
import { durationLabel, money, payLinks, share, type Handles } from "@/lib/pay";

/**
 * Paid court: what it costs, each player's share, and (once you've joined) one-tap links to
 * pay the host, plus "I've paid" so the host can see who's settled up.
 */
export default function CourtFee({
  gameId,
  total,
  minutes,
  slots,
  hostId,
  hostName,
  courtName,
  inGame,
  isHost,
  paidAt,
  onChange,
}: {
  gameId: string;
  total: number;
  minutes: number | null;
  slots: number;
  hostId: string;
  hostName: string;
  courtName: string;
  inGame: boolean;
  isHost: boolean;
  paidAt: string | null;
  onChange: () => void;
}) {
  const toast = useToast();
  const [h, setH] = useState<Handles | null>(null);
  const [busy, setBusy] = useState(false);
  const each = share(total, slots);

  useEffect(() => {
    if (!inGame || isHost) return;
    supabase()
      .from("payment_handles")
      .select("venmo, cashapp, paypal, zelle")
      .eq("user_id", hostId)
      .maybeSingle()
      .then(({ data }) => setH((data as Handles) ?? {}));
  }, [inGame, isHost, hostId]);

  async function setPaid(v: boolean) {
    setBusy(true);
    const { error } = await supabase().rpc("mark_paid", { p_game: gameId, p_paid: v });
    setBusy(false);
    if (error) return toast("Couldn't update. Try again.");
    toast(v ? `Marked paid. ${hostName} can see it.` : "Marked as not paid.");
    onChange();
  }

  const note = `Court at ${courtName}`;
  const links = h ? payLinks(h, each, note) : [];

  return (
    <div className="fee-card" data-clarity-mask="true">
      <div className="fee-head">
        <span className="fee-big">{money(each)}</span>
        <span className="grow">
          <b>{inGame ? "Your share of the court" : "Court fee if you join"}</b>
          <small>
            {money(total)} court{minutes ? ` for ${durationLabel(minutes)}` : ""}, split {slots} ways
          </small>
        </span>
        {inGame && !isHost && paidAt && <span className="pill pill-ok">Paid</span>}
      </div>

      {inGame && !isHost && (
        <>
          {links.length > 0 && (
            <div className="pay-links">
              {links.map((l) => (
                <a key={l.id} className={`pay-btn pay-${l.id}`} href={l.href} target="_blank" rel="noreferrer">
                  Pay {money(each)} · {l.label}
                </a>
              ))}
            </div>
          )}
          {h?.zelle && (
            <button
              className="pay-zelle"
              onClick={() => {
                navigator.clipboard?.writeText(h.zelle!).then(() => toast("Copied. Open your bank app → Zelle."), () => {});
              }}
            >
              <span>
                Zelle <b>{h.zelle}</b>
              </span>
              <span className="muted small">Copy</span>
            </button>
          )}
          {h && !links.length && !h.zelle && <span className="small muted">{hostName} didn&apos;t add a payment app. Settle up at the court.</span>}
          <button className="btn btn-block" onClick={() => setPaid(!paidAt)} disabled={busy}>
            {paidAt ? "Undo: I haven't paid" : `I've paid ${money(each)}`}
          </button>
        </>
      )}
      {isHost && <span className="small muted">Players see links to pay you once they join. You&apos;ll see who&apos;s paid below.</span>}
    </div>
  );
}
