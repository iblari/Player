"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { openAt, readableHours, sunTimes, telHref } from "@/lib/courtInfo";
import { durationLabel, money, share } from "@/lib/pay";
import type { Sport } from "@/lib/types";

type Court = {
  name: string;
  hours: string | null;
  lights: "yes" | "no" | null;
  phone: string | null;
  website: string | null;
  fee: "free" | "paid" | null;
  fee_note: string | null;
  indoor: boolean;
  members_only: boolean;
  info_checked_at: string | null;
};
export type BriefGame = {
  id: string;
  sport: Sport;
  slots: number;
  starts_at: string;
  court_id: string;
  fee_total: number | null;
  fee_minutes: number | null;
  host: string;
};

const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * The agent's first message in every game chat: the court's hours, lights (and when it gets dark),
 * a number to call, and what it costs, so everyone knows the plan before they show up.
 */
export default function CourtBrief({ game }: { game: BriefGame }) {
  const toast = useToast();
  const [court, setCourt] = useState<Court | null | undefined>();
  const [at, setAt] = useState<{ lat: number; lng: number } | null>(null);
  const [looking, setLooking] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data, error }, { data: pt }] = await Promise.all([
      sb.from("courts").select("name, hours, lights, phone, website, fee, fee_note, indoor, members_only, info_checked_at").eq("id", game.court_id).maybeSingle(),
      sb.rpc("court_point", { p_court: game.court_id }),
    ]);
    setAt((pt as { lat: number; lng: number }[] | null)?.[0] ?? null);
    if (error) {
      // Database not updated yet: show what we can.
      const { data: d2 } = await sb.from("courts").select("name, indoor, members_only, lit").eq("id", game.court_id).maybeSingle();
      const c = d2 as { name: string; indoor: boolean; members_only: boolean; lit: boolean } | null;
      setCourt(c ? { name: c.name, hours: null, lights: c.lit ? "yes" : null, phone: null, website: null, fee: null, fee_note: null, indoor: c.indoor, members_only: c.members_only, info_checked_at: "n/a" } : null);
      return null;
    }
    setCourt((data as Court) ?? null);
    return data as Court | null;
  }, [game.court_id]);

  useEffect(() => {
    load().then(async (c) => {
      if (c && !c.info_checked_at) {
        // First chat at this court: look its details up on the map, then show them.
        setLooking(true);
        await fetch("/api/court-info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courtId: game.court_id }) }).catch(() => {});
        await load();
        setLooking(false);
      }
    });
  }, [load, game.court_id]);

  if (!court) return null;

  const agent = game.sport === "tennis" ? "Tennis Agent" : "Pickleball Agent";
  const start = new Date(game.starts_at);
  const day = start.toLocaleDateString("en-US", { weekday: "long" });
  const sun = at ? sunTimes(start, at.lat, at.lng) : null;
  const afterDark = sun ? start.getTime() > sun.set.getTime() - 30 * 60000 : false;
  const open = at ? openAt(court.hours, start, at.lat, at.lng) : null;
  const hours = readableHours(court.hours);

  const warnings: string[] = [];
  if (open === false) warnings.push(`The listed hours say this court is closed at ${t(start)} on ${day}. Double-check before you go.`);
  if (afterDark && !court.indoor && court.lights !== "yes")
    warnings.push(
      court.lights === "no"
        ? `This game starts around or after sunset (${t(sun!.set)}) and the court has no lights. Consider an earlier time.`
        : `This game starts around or after sunset (${t(sun!.set)}). Lights aren't confirmed, so check before you go.`
    );

  const cost = game.fee_total
    ? `${money(Number(game.fee_total))}${game.fee_minutes ? ` for ${durationLabel(game.fee_minutes)}` : ""}, about ${money(share(Number(game.fee_total), game.slots))} each. Pay ${game.host} from the game page.`
    : court.fee === "free"
      ? "Free to play."
      : court.fee === "paid"
        ? `This court charges a fee${court.fee_note ? ` (${court.fee_note})` : ""}. Agree on how to split it here.`
        : court.members_only
          ? "Members-only court: guests may need a member or a fee. Check with the venue."
          : `Not listed. ${game.host === "You" ? "Let everyone know" : `Ask ${game.host}`} if there's a court fee.`;

  return (
    <div className="agent">
      <div className="agent-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mark.svg" alt="" width={28} height={28} />
        <b>{agent}</b>
        <span>Court brief</span>
      </div>
      <div className="agent-bubble">
        <p>
          Here&apos;s what to know about <b>{court.name}</b> before {day} at {t(start)}.
        </p>
        {warnings.map((w) => (
          <p key={w} className="agent-warn">
            {w}
          </p>
        ))}
        <dl className="agent-facts">
          <dt>Hours</dt>
          <dd>{hours ?? "Not listed"}</dd>
          <dt>Lights</dt>
          <dd>
            {court.indoor
              ? "Indoor courts"
              : court.lights === "yes"
                ? "Yes, lit for night play"
                : court.lights === "no"
                  ? "No lights"
                  : "Not listed"}
            {!court.indoor && court.lights !== "yes" && sun ? ` · sunset ${t(sun.set)}` : ""}
          </dd>
          <dt>Call</dt>
          <dd>{court.phone ? <a href={telHref(court.phone)}>{court.phone}</a> : "No number listed"}</dd>
          <dt>Cost</dt>
          <dd>{cost}</dd>
          {court.members_only && (
            <>
              <dt>Access</dt>
              <dd>Members only</dd>
            </>
          )}
          {court.website && (
            <>
              <dt>Website</dt>
              <dd>
                <a href={court.website.startsWith("http") ? court.website : `https://${court.website}`} target="_blank" rel="noopener noreferrer">
                  {court.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 40)}
                </a>
              </dd>
            </>
          )}
        </dl>
        {looking && <p className="small muted">Checking the map for this court&apos;s details…</p>}
        <p className="small muted">
          From the map and players who play here, so it can be out of date.{" "}
          <button className="agent-link" onClick={() => setEditing((x) => !x)}>
            {editing ? "Close" : "Add or fix details"}
          </button>
        </p>
        {editing && (
          <CourtEdit
            courtId={game.court_id}
            court={court}
            onSaved={async () => {
              setEditing(false);
              toast("Thanks! Court details updated for everyone.");
              await load();
            }}
          />
        )}
        <p className="small muted" style={{ margin: 0 }}>
          Payment links and the score are on the <Link href={`/g/${game.id}`}>game page</Link>.
        </p>
      </div>
    </div>
  );
}

function CourtEdit({ courtId, court, onSaved }: { courtId: string; court: Court; onSaved: () => void }) {
  const shownHours = readableHours(court.hours) ?? "";
  const [hours, setHours] = useState(shownHours);
  const [lights, setLights] = useState(court.lights ?? "");
  const [phone, setPhone] = useState(court.phone ?? "");
  const [fee, setFee] = useState(court.fee ?? "");
  const [note, setNote] = useState(court.fee_note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const MSG: Record<string, string> = {
    not_played_here: "Only players with a game at this court can edit it.",
    too_many: "That's a lot of edits today. Try again tomorrow.",
    bad_phone: "That phone number doesn't look right.",
    not_signed_in: "Sign in to edit.",
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    // Only send what changed (null = leave as is), so the map's machine-readable hours survive.
    const changed = <T,>(now: T, was: T) => (now === was ? null : now);
    const { data, error } = await supabase().rpc("edit_court_info", {
      p_court: courtId,
      p_hours: changed(hours.trim(), shownHours),
      p_lights: changed(lights, court.lights ?? ""),
      p_phone: changed(phone.trim(), court.phone ?? ""),
      p_fee: changed(fee, court.fee ?? ""),
      p_fee_note: changed(fee === "paid" ? note.trim() : "", court.fee_note ?? ""),
    });
    setBusy(false);
    if (error) return setErr("Couldn't save. Try again.");
    if (data !== "ok") return setErr(MSG[data as string] ?? "Couldn't save. Check the details.");
    onSaved();
  }

  return (
    <form className="agent-edit" onSubmit={save}>
      <label>
        <span>Hours</span>
        <input className="input" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 6 AM–10 PM daily" maxLength={120} />
      </label>
      <label>
        <span>Lights</span>
        <select className="input" value={lights} onChange={(e) => setLights(e.target.value as Court["lights"] & string)}>
          <option value="">Not sure</option>
          <option value="yes">Yes, lit at night</option>
          <option value="no">No lights</option>
        </select>
      </label>
      <label>
        <span>Phone to book or ask</span>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(732) 555-0123" inputMode="tel" maxLength={30} />
      </label>
      <label>
        <span>Cost</span>
        <select className="input" value={fee} onChange={(e) => setFee(e.target.value as Court["fee"] & string)}>
          <option value="">Not sure</option>
          <option value="free">Free</option>
          <option value="paid">Paid</option>
        </select>
      </label>
      {fee === "paid" && (
        <label>
          <span>How much? (optional)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. $20/hr, book online" maxLength={80} />
        </label>
      )}
      {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}
      <button className="btn btn-ball btn-sm" disabled={busy}>
        {busy ? "Saving…" : "Save for everyone"}
      </button>
    </form>
  );
}
