import { ImageResponse } from "next/og";
import { MARK, WORDMARK, WORDMARK_RATIO } from "@/app/og-assets";
import { COURT_BG } from "./court-bg";
import type { StoryData } from "@/lib/story";

export const runtime = "edge";

// Instagram draws its own bars over roughly the top 200px and bottom 250px of a story,
// so everything important sits between them.
const W = 1080;
const H = 1920;
const BALL = "#d8f03a";
const INK = "#142000";

const fonts = Promise.all([
  fetch(new URL("./bc-800.woff", import.meta.url)).then((r) => r.arrayBuffer()),
  fetch(new URL("./b-600.woff", import.meta.url)).then((r) => r.arrayBuffer()),
  fetch(new URL("./b-700.woff", import.meta.url)).then((r) => r.arrayBuffer()),
]);

const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

/** Clean up what the phone sent: short strings, small numbers, at most one photo. */
function sanitize(x: StoryData): StoryData {
  const team = (t: StoryData["mine"]) => (Array.isArray(t) ? t.slice(0, 2).map((p) => ({ name: clip(p?.name, 16), initials: clip(p?.initials, 2) })) : []);
  const photo = typeof x.photo === "string" && /^data:image\/(jpeg|png);base64,/.test(x.photo) && x.photo.length < 3_000_000 ? x.photo : null;
  return {
    variant: x.variant === "photo" ? "photo" : "board",
    name: clip(x.name, 28),
    initials: clip(x.initials, 2),
    headline: clip(x.headline, 16),
    kicker: clip(x.kicker, 40),
    big: clip(x.big, 7),
    when: clip(x.when, 60),
    sub: clip(x.sub, 44),
    won: x.won === true ? true : x.won === false ? false : null,
    games: (Array.isArray(x.games) ? x.games : []).slice(0, 5).map((g) => [Math.min(99, Math.max(0, Number(g?.[0]) || 0)), Math.min(99, Math.max(0, Number(g?.[1]) || 0))] as [number, number]),
    mine: team(x.mine),
    theirs: team(x.theirs),
    stats: (Array.isArray(x.stats) ? x.stats : []).slice(0, 3).map((s) => ({ label: clip(s?.label, 10), value: clip(s?.value, 10), ...(s?.accent ? { accent: clip(s.accent, 6) } : {}) })),
    ratingLabel: clip(x.ratingLabel, 6),
    photo,
  };
}

function Brand({ top, bottom }: { top?: number; bottom?: number }) {
  const ww = 380;
  return (
    // Only set the edge we were given: the renderer fails on undefined style values.
    <div style={{ position: "absolute", left: 0, right: 0, ...(top != null ? { top } : { bottom: bottom ?? 0 }), display: "flex", alignItems: "center", justifyContent: "center", gap: 22 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK} width={78} height={78} alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={WORDMARK} width={ww} height={Math.round(ww / WORDMARK_RATIO)} alt="" />
    </div>
  );
}

function Stats({ d, top }: { d: StoryData; top: number }) {
  return (
    <div style={{ display: "flex", marginTop: top, width: "100%" }}>
      {d.stats.map((s) => (
        <div key={s.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontFamily: "B", fontWeight: 600, fontSize: 30, color: "#9aa59f", letterSpacing: 2, textTransform: "uppercase" }}>{s.label}</span>
          <span style={{ fontFamily: "BC", fontWeight: 800, fontSize: 66, display: "flex", gap: 14 }}>
            {s.value}
            {s.accent ? <span style={{ color: s.accent.startsWith("-") ? "#9aa59f" : BALL }}>{s.accent}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function Dot({ p, mine, size }: { p: { initials: string }; mine: boolean; size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size, background: mine ? BALL : "#fff", color: mine ? INK : "#111", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "BC", fontWeight: 800, fontSize: size * 0.4, border: "5px solid #1c1c1c" }}>
      {p.initials}
    </div>
  );
}

function PhotoCard({ d }: { d: StoryData }) {
  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", background: "#05080b", color: "#fff" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.photo || COURT_BG} width={W} height={H} style={{ position: "absolute", left: 0, top: 0, objectFit: "cover" }} alt="" />
      {/* Darken the top so the numbers read on any photo. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: 1250, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 100%)" }} />
      <div style={{ position: "absolute", left: 80, right: 80, top: 210, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div style={{ width: 96, height: 96, borderRadius: 96, background: BALL, color: INK, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "BC", fontWeight: 800, fontSize: 40 }}>{d.initials}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "B", fontWeight: 700, fontSize: 40 }}>{d.name}</span>
            <span style={{ fontFamily: "B", fontWeight: 600, fontSize: 28, color: "#c4ccc7" }}>{d.when}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 100 }}>
          <span style={{ fontFamily: "B", fontWeight: 700, fontSize: 34, color: BALL, letterSpacing: 5, textTransform: "uppercase" }}>{d.kicker}</span>
          <span style={{ fontFamily: "BC", fontWeight: 800, fontSize: 260, lineHeight: 1, marginTop: 10 }}>{d.big}</span>
          {d.games.length > 1 && (
            <div style={{ display: "flex", gap: 22, marginTop: 20 }}>
              {d.games.map(([m, t], i) => (
                <span key={i} style={{ fontFamily: "BC", fontWeight: 800, fontSize: 52, padding: "4px 26px", borderRadius: 16, background: m > t ? BALL : "rgba(255,255,255,0.14)", color: m > t ? INK : "#fff" }}>
                  {m}–{t}
                </span>
              ))}
            </div>
          )}
          <Stats d={d} top={70} />
        </div>
      </div>
      <Brand top={d.games.length > 1 ? 1005 : 950} />
    </div>
  );
}

function BoardCard({ d }: { d: StoryData }) {
  const cols = d.games.length || 1;
  const team = (t: StoryData["mine"]) => t.map((p) => p.name).join(" & ") || "–";
  const row = (t: StoryData["mine"], mine: boolean) => (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, flex: 1 }}>
        <div style={{ display: "flex" }}>
          {t.map((p, i) => (
            <div key={i} style={{ display: "flex", marginLeft: i ? -16 : 0 }}>
              <Dot p={p} mine={mine} size={60} />
            </div>
          ))}
        </div>
        <span style={{ fontFamily: "B", fontWeight: 700, fontSize: 44, color: mine ? "#fff" : "#b5b5b5" }}>{team(t)}</span>
      </div>
      {d.games.map(([m, th], i) => {
        const v = mine ? m : th;
        const win = mine ? m > th : th > m;
        return (
          <span key={i} style={{ width: 110, display: "flex", justifyContent: "center", fontFamily: "BC", fontWeight: 800, fontSize: 76, color: win ? (mine ? BALL : "#fff") : "#7d7d7d" }}>
            {v}
          </span>
        );
      })}
    </div>
  );
  const seat = (p: { initials: string } | undefined, mine: boolean, x: number, y: number) =>
    p ? (
      <div style={{ position: "absolute", left: x - 48, top: y - 48, display: "flex" }}>
        <Dot p={p} mine={mine} size={96} />
      </div>
    ) : null;
  const doubles = d.mine.length > 1 || d.theirs.length > 1;

  return (
    <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#111", color: "#fff", padding: "200px 80px 0" }}>
      <span style={{ fontFamily: "B", fontWeight: 600, fontSize: 34, color: "#9aa59f" }}>{d.when}</span>
      <span style={{ fontFamily: "BC", fontWeight: 800, fontSize: 170, lineHeight: 1, color: d.won === false ? "#fff" : BALL, marginTop: 30, textTransform: "uppercase" }}>{d.headline}</span>
      <span style={{ fontFamily: "B", fontWeight: 600, fontSize: 38, color: "#cfcfcf", marginTop: 14 }}>{d.sub}</span>

      {d.games.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 48, background: "#1c1c1c", borderRadius: 36, padding: "30px 44px" }}>
          {cols > 1 && (
            <div style={{ display: "flex" }}>
              <span style={{ flex: 1 }} />
              {d.games.map((_, i) => (
                <span key={i} style={{ width: 110, display: "flex", justifyContent: "center", fontFamily: "B", fontWeight: 700, fontSize: 28, color: "#6b6b6b", letterSpacing: 2 }}>
                  G{i + 1}
                </span>
              ))}
            </div>
          )}
          {row(d.mine, true)}
          <div style={{ height: 2, background: "#2c2c2c", margin: "18px 0", display: "flex" }} />
          {row(d.theirs, false)}
        </div>
      )}

      <div style={{ marginTop: 36, height: 470, background: "#1e4d36", borderRadius: 36, position: "relative", display: "flex" }}>
        <div style={{ position: "absolute", left: 70, top: 55, width: 780, height: 360, background: "#2459a6", border: "6px solid #fff", display: "flex" }} />
        <div style={{ position: "absolute", left: 337, top: 55, width: 6, height: 360, background: "#fff", display: "flex" }} />
        <div style={{ position: "absolute", left: 577, top: 55, width: 6, height: 360, background: "#fff", display: "flex" }} />
        <div style={{ position: "absolute", left: 70, top: 232, width: 270, height: 6, background: "#fff", display: "flex" }} />
        <div style={{ position: "absolute", left: 580, top: 232, width: 270, height: 6, background: "#fff", display: "flex" }} />
        <div style={{ position: "absolute", left: 457, top: 35, width: 6, height: 400, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          {Array.from({ length: 17 }).map((_, i) => (
            <div key={i} style={{ width: 6, height: 12, background: "#fff", display: "flex" }} />
          ))}
        </div>
        {doubles ? (
          <>
            {seat(d.mine[0], true, 205, 145)}
            {seat(d.mine[1], true, 205, 325)}
            {seat(d.theirs[0], false, 715, 145)}
            {seat(d.theirs[1], false, 715, 325)}
          </>
        ) : (
          <>
            {seat(d.mine[0], true, 205, 235)}
            {seat(d.theirs[0], false, 715, 235)}
          </>
        )}
      </div>

      <Stats d={d} top={44} />
      <Brand bottom={215} />
    </div>
  );
}

/** Renders a 1080x1920 Instagram-story image for a finished game. */
export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 3_500_000) return new Response("Too large", { status: 413 });
  let d: StoryData;
  try {
    d = sanitize((await req.json()) as StoryData);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const [bc, b6, b7] = await fonts;
  return new ImageResponse(d.variant === "photo" ? <PhotoCard d={d} /> : <BoardCard d={d} />, {
    width: W,
    height: H,
    fonts: [
      { name: "BC", data: bc, weight: 800, style: "normal" },
      { name: "B", data: b6, weight: 600, style: "normal" },
      { name: "B", data: b7, weight: 700, style: "normal" },
    ],
    headers: { "Cache-Control": "no-store" },
  });
}
