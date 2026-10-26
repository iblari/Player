import type { Activity } from "@/components/ActivityCard";
import { SPORT_META } from "@/lib/types";
import { fmtSkill } from "@/lib/util";

/** Everything the story image shows, already worded on the phone (so dates use the player's time zone). */
export type StoryData = {
  variant: "board" | "photo";
  name: string;
  initials: string;
  headline: string; // "Won 2–1" / "Lost 1–2" / "Split 1–1" / "Played"
  kicker: string; // "Won · pickleball doubles"
  big: string; // "2–1" or "11–7"
  when: string; // "Sat, Oct 25 · Memorial Park, Edison"
  sub: string; // "Pickleball doubles · 1h 32m"
  won: boolean | null;
  games: [number, number][]; // mine first
  mine: { name: string; initials: string }[];
  theirs: { name: string; initials: string }[];
  stats: { label: string; value: string; accent?: string }[];
  ratingLabel: string;
  photo?: string | null; // data URI, 1080x1920 JPEG
};

const first = (n: string) => (n || "Player").trim().split(/\s+/)[0];
export const initialsOf = (n: string) =>
  (n || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .slice(0, 2)
    .toUpperCase() || "?";
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim() : `${m}m`);

/** Build the card for one finished game, using the player's own recent games for record and streak. */
export function buildStory(a: Activity, me: string, all: Activity[], variant: StoryData["variant"]): StoryData {
  const meta = SPORT_META[a.sport] ?? SPORT_META.pickleball;
  const players = a.players ?? [];
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name || "Player";
  const myName = nameOf(me);
  const onA = a.team_a?.includes(me) ?? true;
  const mineIds = (a.team_a && a.team_b ? (onA ? a.team_a : a.team_b) : [me]) as string[];
  const theirIds = (a.team_a && a.team_b ? (onA ? a.team_b : a.team_a) : players.map((p) => p.id).filter((x) => x !== me)) as string[];
  const games = (a.games ?? (a.score_a != null ? [[a.score_a, a.score_b ?? 0]] : [])).map(([x, y]) => (onA ? [x, y] : [y, x]) as [number, number]);
  const multi = games.length > 1;
  const mineWon = games.filter(([m, t]) => m > t).length;
  const theirWon = games.filter(([m, t]) => t > m).length;
  const big = multi ? `${mineWon}–${theirWon}` : games[0] ? `${games[0][0]}–${games[0][1]}` : "–";
  const kind = a.slots === 4 ? "doubles" : "singles";
  const split = a.won == null && games.length > 0;
  const verb = a.won === true ? "Won" : a.won === false ? "Lost" : split ? "Split" : "Played";
  const d = new Date(a.starts_at);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  // Record and streak from the games we can see (newest first).
  const done = all.filter((x) => x.won != null);
  const w = done.filter((x) => x.won).length;
  let streak = 0;
  for (const x of all) {
    if (x.won === true) streak++;
    else if (x.won === false) break;
  }
  const delta = a.level_before != null && a.level_after != null ? Number(a.level_after) - Number(a.level_before) : null;
  const rating = a.level_after != null ? fmtSkill(Number(a.level_after)) : null;
  const ratingStat = rating
    ? { label: meta.rating, value: rating, accent: delta != null && Math.abs(delta) >= 0.005 ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}` : undefined }
    : null;
  const partner = mineIds.find((x) => x !== me);

  const stats: StoryData["stats"] = [];
  if (variant === "photo") {
    if (a.minutes) stats.push({ label: "Time", value: dur(a.minutes) });
    if (ratingStat) stats.push(ratingStat);
    stats.push(partner ? { label: "Partner", value: nameOf(partner) } : { label: "Record", value: `${w}–${done.length - w}` });
  } else {
    if (ratingStat) stats.push(ratingStat);
    stats.push(streak >= 2 ? { label: "Streak", value: `${streak} wins` } : { label: "Record", value: `${w}–${done.length - w}` });
    stats.push({ label: "Games", value: all.length >= 50 ? "50+" : String(all.length) });
  }

  return {
    variant,
    name: myName,
    initials: initialsOf(myName),
    headline: `${verb}${games.length ? ` ${big}` : ""}`,
    kicker: `${verb} · ${meta.label.toLowerCase()} ${kind}`,
    big,
    when: `${day} · ${a.court_name}${a.town ? `, ${a.town}` : ""}`,
    sub: `${meta.label} ${kind}${a.minutes ? ` · ${dur(a.minutes)}` : ""}`,
    won: a.won,
    games: games.slice(0, 5),
    mine: mineIds.map((id) => ({ name: first(nameOf(id)), initials: initialsOf(nameOf(id)) })),
    theirs: theirIds.map((id) => ({ name: first(nameOf(id)), initials: initialsOf(nameOf(id)) })),
    stats: stats.slice(0, 3),
    ratingLabel: meta.rating,
  };
}

/** Crop a picked photo to a 1080x1920 JPEG so it uploads fast and fills the story. */
export async function storyPhoto(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const W = 1080,
    H = 1920;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const s = Math.max(W / bmp.width, H / bmp.height);
  const w = bmp.width * s,
    h = bmp.height * s;
  c.getContext("2d")!.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
  return c.toDataURL("image/jpeg", 0.82);
}
