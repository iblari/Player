import { ImageResponse } from "next/og";
import { MARK, WORDMARK, WORDMARK_RATIO } from "@/app/og-assets";
import { getProfileInvite, withAvatar } from "@/lib/invite";

export const alt = "Add me on Players Club";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LABEL = { pickleball: "Pickleball", tennis: "Tennis" } as const;

/** Preview card for a shared profile: "<Name> wants to add you on Players Club". */
export default async function ProfileOG({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await getProfileInvite(id).catch(() => null);
  const p = base ? await withAvatar(base) : null;
  const wmW = 300;
  const initials = p ? p.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "";
  const words = p ? [p.name, ..."wants to add you on Players Club".split(" ")] : "Add me on Players Club".split(" ");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#111111", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 72px", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK} width={84} height={84} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={WORDMARK} width={wmW} height={Math.round(wmW / WORDMARK_RATIO)} alt="" />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          {p && (
            <div style={{ display: "flex", width: 200, height: 200, borderRadius: 200, border: "6px solid #d8f03a", overflow: "hidden", alignItems: "center", justifyContent: "center", background: "#262626", flexShrink: 0 }}>
              {p.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar} width={200} height={200} style={{ objectFit: "cover" }} alt="" />
              ) : (
                <span style={{ fontSize: 80, fontWeight: 800, color: "#d8f03a" }}>{initials}</span>
              )}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", columnGap: 16, fontSize: 62, fontWeight: 800, lineHeight: 1.1, flex: 1 }}>
            {words.map((w, i) => (
              <span key={i} style={{ color: p && i === 0 ? "#d8f03a" : "#fff" }}>{w}</span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14, fontSize: 30 }}>
            {(p?.sports.length ? p.sports : (["pickleball", "tennis"] as const)).map((s, i) => (
              <span key={s} style={{ background: i === 0 ? "#d8f03a" : "#262626", color: i === 0 ? "#142000" : "#fff", padding: "8px 22px", borderRadius: 999, fontWeight: 800 }}>{LABEL[s]}</span>
            ))}
          </div>
          <div style={{ display: "flex", background: "#d8f03a", color: "#142000", padding: "16px 34px", borderRadius: 999, fontSize: 32, fontWeight: 800 }}>
            Tap to follow
          </div>
        </div>
      </div>
    ),
    size
  );
}
