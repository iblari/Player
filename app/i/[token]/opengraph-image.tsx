import { ImageResponse } from "next/og";
import { MARK, WORDMARK, WORDMARK_RATIO } from "@/app/og-assets";
import { getInviteInfo, sides } from "@/lib/inviteInfo";

export const alt = "Confirm your match on Players Club";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Preview for an invite link: "<Name> logged a match with you on Players Club" and the score. */
export default async function InviteOG({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const i = await getInviteInfo(token).catch(() => null);
  const s = i ? sides(i) : null;
  const games = i?.games ?? [];
  const words = i ? [i.logger, ..."logged a match with you on Players Club".split(" ")] : "Confirm your match on Players Club".split(" ");
  const wmW = 300;
  const row = (names: string[], idx: 0 | 1) => (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <span style={{ width: 360, fontSize: 34, fontWeight: 800, color: "#d8d8d8", overflow: "hidden", whiteSpace: "nowrap" }}>{names.join(" & ")}</span>
      {games.map((g, k) => (
        <span key={k} style={{ width: 70, display: "flex", justifyContent: "center", fontSize: 48, fontWeight: 800, color: g[idx] > g[idx ? 0 : 1] ? "#d8f03a" : "#6b6b6b" }}>
          {g[idx]}
        </span>
      ))}
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#111111", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 72px", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK} width={80} height={80} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={WORDMARK} width={wmW} height={Math.round(wmW / WORDMARK_RATIO)} alt="" />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 16, fontSize: 60, fontWeight: 800, lineHeight: 1.08 }}>
          {words.map((w, k) => (
            <span key={k} style={{ color: i && k === 0 ? "#d8f03a" : "#fff" }}>
              {w}
            </span>
          ))}
        </div>
        {s && games.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#1c1c1c", borderRadius: 28, padding: "18px 30px" }}>
            {row(s.a, 0)}
            {row(s.b, 1)}
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 34, color: "#c8c8c8" }}>Tap to confirm the score.</div>
        )}
      </div>
    ),
    size
  );
}
