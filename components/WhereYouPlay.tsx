"use client";
import { useState } from "react";
import type { Coords } from "@/lib/geo";
import { lookupTown } from "@/lib/seed";
import { PinIcon } from "./Icons";

/**
 * First-run step: ask where they play before the browser's location prompt. Explaining why
 * first gets far more people to tap Allow, and a town or ZIP works too. Either way we start
 * loading the courts around them in the background straight away.
 */
export default function WhereYouPlay({ onLocate, onPlace }: { onLocate: () => Promise<unknown>; onPlace: (c: Coords, label: string) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const r = await lookupTown(q);
    setBusy(false);
    if (!r) return setErr("Couldn't find that. Try a town name or ZIP code.");
    onPlace(r.c, r.label);
  }

  return (
    <section className="where">
      <span className="icon-circle"><PinIcon /></span>
      <h2>Where do you play?</h2>
      <p className="muted" style={{ margin: 0 }}>
        We&apos;ll load every tennis and pickleball court around you and show who&apos;s free nearby. Other players only see a rough area, never your exact spot.
      </p>
      <button
        className="btn btn-ball btn-block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onLocate();
          setBusy(false);
        }}
      >
        Use my location
      </button>
      <form className="locfix-row" onSubmit={go}>
        <input className="input" placeholder="Or type a town or ZIP" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Town or ZIP code" />
        <button className="btn" type="submit" disabled={busy || q.trim().length < 2}>Go</button>
      </form>
      {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}
    </section>
  );
}
