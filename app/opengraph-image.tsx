import { ImageResponse } from "next/og";

export const alt = "Let's Rally: match with pickleball and tennis players near you within minutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The preview card shown when the site is shared or used in ads. */
export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#111111", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 44, background: "#d8f03a" }} />
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 1 }}>LET&apos;S RALLY</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1, textTransform: "uppercase", maxWidth: 1000 }}>Match with players near you</div>
          <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1, textTransform: "uppercase", color: "#d8f03a" }}>within minutes.</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 30, color: "#a3a3a3" }}>
          <span style={{ background: "#d8f03a", color: "#142000", padding: "8px 20px", borderRadius: 999, fontWeight: 800 }}>Pickleball</span>
          <span style={{ background: "#262626", color: "#fff", padding: "8px 20px", borderRadius: 999, fontWeight: 800 }}>Tennis</span>
          <span style={{ padding: "8px 4px" }}>Free · playersclub.io</span>
        </div>
      </div>
    ),
    size
  );
}
