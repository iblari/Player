"use client";
import { useEffect, useState } from "react";
import { detectPlatform, locationPermission, saveCoords, type Coords, type GeoReason, type Platform } from "@/lib/geo";
import { PinIcon } from "./Icons";

/**
 * Shown when we can't get the player's location. Websites can't flip a blocked permission
 * back on themselves, so this: (1) retries, which re-asks wherever the browser still allows a
 * prompt; (2) if it's still blocked, shows the exact steps for this phone and browser;
 * (3) lets them type a town or ZIP so the app still works meanwhile.
 */
const STEPS: Record<Platform, { label: string; steps: string[]; also?: string[] }> = {
  "ios-safari": {
    label: "iPhone · Safari",
    steps: [
      "Tap the page menu icon (aA) on the left of the address bar.",
      "Tap Website Settings.",
      "Set Location to Allow (or Ask).",
      "Come back here and tap Reload.",
    ],
    also: [
      "Still blocked? Open the Settings app → Privacy & Security → Location Services. Make sure it's on, then tap Safari Websites → While Using the App.",
    ],
  },
  "ios-app": {
    label: "iPhone · home screen app",
    steps: [
      "Open the Settings app → Privacy & Security → Location Services.",
      "Make sure Location Services is on.",
      "Tap Safari Websites → While Using the App, and turn on Precise Location.",
      "Swipe this app closed, then open it again.",
    ],
    also: ["Still blocked? Open www.letslarp.io in Safari, allow location there, then reopen the app."],
  },
  "ios-chrome": {
    label: "iPhone · Chrome",
    steps: [
      "Open the Settings app → Apps → Chrome (on older iOS, just Chrome).",
      "Tap Location → While Using the App.",
      "Come back here and tap Reload. When Chrome asks, tap Allow.",
    ],
    also: ["Also check Settings → Privacy & Security → Location Services is on."],
  },
  "ios-other": {
    label: "iPhone · other browser",
    steps: [
      "Open the Settings app → Apps → your browser.",
      "Tap Location → While Using the App.",
      "Come back here and tap Reload.",
    ],
  },
  android: {
    label: "Android",
    steps: [
      "Tap the icon on the left of the address bar.",
      "Tap Permissions → Location → Allow.",
      "Make sure your phone's Location is on (swipe down from the top).",
      "Tap Reload.",
    ],
  },
  desktop: {
    label: "Computer",
    steps: [
      "Click the icon on the left of the address bar.",
      "Set Location to Allow.",
      "Click Reload.",
    ],
    also: ["On a Mac, also check System Settings → Privacy & Security → Location Services for your browser."],
  },
};
const ORDER: Platform[] = ["ios-safari", "ios-app", "ios-chrome", "android", "desktop"];

export default function LocationFix({
  reason,
  message,
  onRetry,
  onManual,
}: {
  reason: GeoReason;
  message?: string;
  onRetry: () => Promise<unknown>;
  onManual?: (c: Coords, label: string) => void;
}) {
  const [platform, setPlatform] = useState<Platform>("ios-safari");
  const [showSteps, setShowSteps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [qErr, setQErr] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
    // If the browser already reports it as blocked, skip straight to the steps.
    locationPermission().then((s) => s === "denied" && setShowSteps(true));
  }, []);

  async function retry() {
    setBusy(true);
    await onRetry();
    setBusy(false);
    // Still blocked after asking again: the browser didn't prompt, so show the steps.
    if ((await locationPermission()) !== "granted") setShowSteps(true);
  }

  async function findPlace(e: React.FormEvent) {
    e.preventDefault();
    const s = q.trim();
    if (s.length < 2) return;
    setQErr(null);
    try {
      const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(s)}&limit=1&lang=en&layer=city&layer=postcode&layer=district&layer=locality`);
      const j = (await r.json()) as { features: { geometry: { coordinates: [number, number] }; properties: { name?: string; city?: string; state?: string; postcode?: string } }[] };
      const f = j.features?.[0];
      if (!f) return setQErr("Couldn't find that place. Try a town name or ZIP code.");
      const [lng, lat] = f.geometry.coordinates;
      const p = f.properties;
      const label = [p.name || p.postcode || p.city, p.state].filter(Boolean).join(", ");
      saveCoords({ lat, lng });
      setPlaced(label);
      onManual?.({ lat, lng }, label);
    } catch {
      setQErr("Couldn't search right now. Check your connection.");
    }
  }

  const info = STEPS[platform];
  const denied = reason === "denied";

  return (
    <div className="notice locfix" id="locfix">
      <div className="locfix-head">
        <span className="icon-circle"><PinIcon /></span>
        <span className="grow">
          <b>{denied ? "Location is off" : reason === "unsupported" ? "Location isn't available" : "Couldn't find you"}</b>
          <span className="muted">
            {denied
              ? "We use it to show courts and players near you. Other players only ever see a rough area, never your exact spot."
              : message ?? "Try again outside or with Wi-Fi on."}
          </span>
        </span>
      </div>

      {reason !== "unsupported" && (
        <button className="btn btn-ball btn-block" onClick={retry} disabled={busy}>
          {busy ? "Asking…" : "Turn on location"}
        </button>
      )}

      {denied && showSteps && (
        <div className="locfix-steps">
          <b>Your browser is blocking it. To turn it back on:</b>
          <ol>
            {info.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {info.also?.map((s) => (
            <p key={s} className="small muted" style={{ margin: 0 }}>{s}</p>
          ))}
          <button className="btn btn-block" onClick={() => window.location.reload()}>
            Reload
          </button>
          <div className="locfix-plat" role="group" aria-label="Show steps for">
            {ORDER.filter((p) => p !== platform).map((p) => (
              <button key={p} type="button" className="chip-btn" onClick={() => setPlatform(p)}>
                {STEPS[p].label}
              </button>
            ))}
          </div>
        </div>
      )}
      {denied && !showSteps && (
        <button className="locfix-link" type="button" onClick={() => setShowSteps(true)}>
          Blocked it earlier? See how to turn it back on
        </button>
      )}

      {onManual && (
        <form className="locfix-manual" onSubmit={findPlace}>
          <label htmlFor="locfix-q" className="small muted">Or play around a town or ZIP</label>
          <div className="locfix-row">
            <input id="locfix-q" className="input" placeholder="e.g. Edison or 08817" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="postal-code" />
            <button className="btn" type="submit" disabled={q.trim().length < 2}>Go</button>
          </div>
          {qErr && <span className="small" style={{ color: "var(--bad)" }}>{qErr}</span>}
          {placed && <span className="small muted">Showing courts around {placed}.</span>}
        </form>
      )}
    </div>
  );
}
