import { ImageResponse } from "next/og";
import { MARK, WORDMARK, WORDMARK_RATIO } from "@/app/og-assets";
import { getInvite, inviteLine } from "@/lib/invite";

export const alt = "You're invited to a game on Players Club";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Preview card for a shared game link: "<Host> is inviting you to join…". */
export default async function GameOG({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await getInvite(id).catch(() => null);
  const l = inv ? inviteLine(inv) : null;
  const left = inv ? Math.max(0, inv.slots - inv.joined) : 0;
  const wmW = 300;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#111111", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 72px", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK} width={84} height={84} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={WORDMARK} width={wmW} height={Math.round(wmW / WORDMARK_RATIO)} alt="" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, lineHeight: 1.05, flexWrap: "wrap" }}>
            {inv ? (
              <div style={{ display: "flex", flexWrap: "wrap", columnGap: 16 }}>
                {[inv.host, ..."is inviting you to join a game on Players Club".split(" ")].map((w, i) => (
                  <span key={i} style={{ color: i === 0 ? "#d8f03a" : "#fff" }}>{w}</span>
                ))}
              </div>
            ) : (
              <span>You&apos;re invited to a game</span>
            )}
          </div>
          {l && <div style={{ display: "flex", fontSize: 34, color: "#c8c8c8" }}>{l.detail}</div>}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {inv &&
              Array.from({ length: inv.slots }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 54,
                    display: "flex",
                    background: i < inv.joined ? "#d8f03a" : "transparent",
                    border: i < inv.joined ? "none" : "4px dashed #6b6b6b",
                  }}
                />
              ))}
            {l && <div style={{ display: "flex", alignItems: "center", marginLeft: 10, fontSize: 32, fontWeight: 800, color: inv?.status === "open" ? "#fff" : "#a3a3a3" }}>{l.spots}</div>}
          </div>
          <div style={{ display: "flex", background: "#d8f03a", color: "#142000", padding: "16px 34px", borderRadius: 999, fontSize: 32, fontWeight: 800 }}>
            {inv?.status === "open" && left > 0 ? "Tap to join" : "Open game"}
          </div>
        </div>
      </div>
    ),
    size
  );
}
