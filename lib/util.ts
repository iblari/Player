export const SKILLS: number[] = [];
for (let s = 2; s <= 5.5001; s += 0.25) SKILLS.push(Math.round(s * 100) / 100);

export function fmtSkill(s: number | string): string {
  const n = Number(s);
  return n % 0.5 === 0 ? n.toFixed(1) : n.toFixed(2);
}

export function clampSkill(s: number, lo = 2, hi = 5.5): number {
  return Math.min(hi, Math.max(lo, Math.round(s * 4) / 4));
}

export function timeOf(iso: string | number | Date): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "now", "in 25 min", "today 7:00 pm", "Sat, Oct 18 9:00 am" */
export function when(iso: string | number | Date): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const min = Math.round(diff / 60000);
  if (Math.abs(min) <= 2) return "now";
  if (diff > 0 && min < 60) return `in ${min} min`;
  if (diff < 0 && min > -90) return `started ${-min} min ago`;
  const today = new Date().toDateString() === d.toDateString();
  const tomorrow = new Date(Date.now() + 864e5).toDateString() === d.toDateString();
  if (today) return `today ${timeOf(d)}`;
  if (tomorrow) return `tomorrow ${timeOf(d)}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}, ${timeOf(d)}`;
}

export function miles(m: number | null | undefined): string {
  if (m == null) return "";
  return m < 0.1 ? "here" : `${m < 10 ? m.toFixed(1) : Math.round(m)} mi`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** P(X >= k) for X ~ Poisson(lambda) */
export function poissonAtLeast(lambda: number, k: number): number {
  if (k <= 0) return 1;
  let cdf = 0;
  let term = Math.exp(-lambda);
  for (let i = 0; i < k; i++) {
    cdf += term;
    term *= lambda / (i + 1);
  }
  return Math.max(0, 1 - cdf);
}

/** Assumed yes-rates until real acceptance data exists */
export const YES_RATE_AVAILABLE = 0.35;
export const YES_RATE_NEARBY = 0.04;

export function fillChance(available: number, nearby: number, need: number) {
  const lambda = available * YES_RATE_AVAILABLE + nearby * YES_RATE_NEARBY;
  return { lambda, p: poissonAtLeast(lambda, need) };
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
