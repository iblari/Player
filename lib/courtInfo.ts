// Court details for the agent's "court brief": what the map says about hours, lights, phone and
// cost, made readable, plus checks against the game's start time (open? still light out?).
// Pure functions so they can be tested without the network.

export type CourtInfo = {
  hours: string | null;
  lights: "yes" | "no" | null;
  phone: string | null;
  website: string | null;
  fee: "free" | "paid" | null;
};
type Tags = Record<string, string>;

const phoneOf = (t: Tags) => (t.phone || t["contact:phone"] || "").split(";")[0].trim() || null;
const webOf = (t: Tags) => (t.website || t["contact:website"] || t.url || "").split(";")[0].trim() || null;
const feeOf = (t: Tags) => (t.fee === "no" ? "free" : t.fee && t.fee !== "no" ? "paid" : t.charge ? "paid" : null);
const litOf = (t: Tags) => (t.lit === "yes" || t.lit === "automatic" || t.lit === "limited" ? "yes" : t.lit === "no" ? "no" : null);

/**
 * Combine the courts' own tags with the place they sit in (park, club, rec center). The courts win
 * for lights and cost; hours, phone and website usually live on the park or club.
 */
export function infoFromTags(courts: Tags[], place?: Tags | null): CourtInfo {
  const pick = <T>(f: (t: Tags) => T | null): T | null => {
    for (const t of courts) {
      const v = f(t);
      if (v) return v;
    }
    return place ? f(place) : null;
  };
  // Lights: any court lit means night play is possible; "no" only if no court says yes.
  const lit = courts.map(litOf);
  const lights = lit.includes("yes") ? "yes" : lit.includes("no") ? "no" : place ? litOf(place) : null;
  return {
    hours: pick((t) => t.opening_hours?.trim() || null),
    lights,
    phone: pick(phoneOf),
    website: pick(webOf),
    fee: pick(feeOf) as CourtInfo["fee"],
  };
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const DAY_NAME: Record<string, string> = { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun" };

function clock(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  if ((h === 24 || h === 0) && !m) return "midnight";
  const hh = h % 12 || 12;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 || h === 24 ? "AM" : "PM"}`;
}
const words = (s: string) =>
  s
    .replace(/\bsunrise\b/gi, "sunrise")
    .replace(/\bsunset\b/gi, "sunset")
    .replace(/\bdawn\b/gi, "dawn")
    .replace(/\bdusk\b/gi, "dusk")
    .replace(/(\d{1,2}:\d{2})/g, (x) => clock(x))
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (d) => DAY_NAME[d])
    .replace(/\s*-\s*/g, "–")
    .replace(/;\s*/g, " · ")
    .replace(/,(?=\S)/g, ", ")
    .replace(/\boff\b/g, "closed");

/** "Mo-Su 06:00-22:00" -> "6 AM–10 PM daily". Anything unusual is shown lightly cleaned up. */
export function readableHours(oh: string | null): string | null {
  if (!oh) return null;
  const s = oh.trim();
  if (s === "24/7") return "Open 24 hours";
  const m = s.match(/^(?:(Mo|Su)-(Su|Sa)\s+)?(\d{1,2}:\d{2}|sunrise|dawn)\s*-\s*(\d{1,2}:\d{2}|sunset|dusk)$/i);
  if (m) return `${words(m[3])}–${words(m[4])} daily`;
  return words(s);
}

type Range = { days: number[]; from: string; to: string };
function parseRules(oh: string): Range[] | null {
  const out: Range[] = [];
  for (const part of oh.split(";").map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^(?:([A-Za-z,\- ]+?)\s+)?((?:\d{1,2}:\d{2}|sunrise|sunset|dawn|dusk)\s*-\s*(?:\d{1,2}:\d{2}|sunrise|sunset|dawn|dusk)|off|closed)$/i);
    if (!m) return null;
    let days = [0, 1, 2, 3, 4, 5, 6];
    if (m[1]) {
      days = [];
      for (const seg of m[1].split(",").map((x) => x.trim())) {
        const r = seg.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
        if (!r) return null;
        const a = DAYS.indexOf(r[1]);
        const b = r[2] ? DAYS.indexOf(r[2]) : a;
        for (let d = a; ; d = (d + 1) % 7) {
          days.push(d);
          if (d === b) break;
        }
      }
    }
    if (/^(off|closed)$/i.test(m[2])) {
      out.push({ days, from: "off", to: "off" });
      continue;
    }
    const [from, to] = m[2].split("-").map((x) => x.trim().toLowerCase());
    out.push({ days, from, to });
  }
  return out;
}

const mins = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Is the court open at this moment (in the court's local time)? null when the hours can't be read.
 * Sunrise/sunset style hours use the real sun times for the court's location.
 */
export function openAt(oh: string | null, at: Date, lat: number, lng: number): boolean | null {
  if (!oh) return null;
  if (oh.trim() === "24/7") return true;
  const rules = parseRules(oh);
  if (!rules) return null;
  const day = at.getDay();
  const now = at.getHours() * 60 + at.getMinutes();
  const sun = sunTimes(at, lat, lng);
  const toMin = (x: string) =>
    x === "sunrise" || x === "dawn" ? (sun ? sun.rise.getHours() * 60 + sun.rise.getMinutes() : null) : x === "sunset" || x === "dusk" ? (sun ? sun.set.getHours() * 60 + sun.set.getMinutes() : null) : mins(x);
  // Later rules override earlier ones for the same day, as in the OSM format.
  let open: boolean | null = false;
  for (const r of rules) {
    if (!r.days.includes(day)) continue;
    if (r.from === "off") {
      open = false;
      continue;
    }
    const a = toMin(r.from);
    const b = toMin(r.to);
    if (a == null || b == null) return null;
    open = b > a ? now >= a && now < b : now >= a || now < b;
  }
  return open;
}

/** Sunrise and sunset for a date and place (NOAA's simplified formula, within a couple of minutes). */
export function sunTimes(date: Date, lat: number, lng: number): { rise: Date; set: Date } | null {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const n = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 864e5);
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosH < -1 || cosH > 1) return null; // midnight sun / polar night
  const ha = Math.acos(cosH) / rad;
  const noonUtcMin = 720 - 4 * lng - eqt;
  const base = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return { rise: new Date(base + (noonUtcMin - 4 * ha) * 60000), set: new Date(base + (noonUtcMin + 4 * ha) * 60000) };
}

/** Phone number as a tel: link (digits and a leading +). */
export const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;
