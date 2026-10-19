import { ImageResponse } from "next/og";
import { MARK, WORDMARK, WORDMARK_RATIO } from "./og-assets";

export const alt = "Players Club: match with pickleball and tennis players near you within minutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The preview card shown when the site is shared in messages, social posts and ads. */
export default function OG() {
  const wmW = 620;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#111111", display: "flex", alignItems: "center", padding: "0 80px", gap: 64, color: "#fff", fontFamily: "sans-serif" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK} width={340} height={340} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={WORDMARK} width={wmW} height={Math.round(wmW / WORDMARK_RATIO)} alt="" />
          <div style={{ width: 120, height: 4, background: "#d8f03a" }} />
          <div style={{ display: "flex", flexDirection: "column", fontSize: 50, fontWeight: 800, lineHeight: 1.1 }}>
            <span>Match with players near you</span>
            <span style={{ color: "#d8f03a" }}>within minutes.</span>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 28, color: "#a3a3a3", alignItems: "center" }}>
            <span style={{ background: "#d8f03a", color: "#142000", padding: "8px 20px", borderRadius: 999, fontWeight: 800 }}>Pickleball</span>
            <span style={{ background: "#262626", color: "#fff", padding: "8px 20px", borderRadius: 999, fontWeight: 800 }}>Tennis</span>
            <span style={{ padding: "8px 4px" }}>Free · playersclub.io</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
