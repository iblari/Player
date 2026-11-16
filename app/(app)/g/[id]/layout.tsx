import type { Metadata } from "next";
import { getInvite, inviteLine } from "@/lib/invite";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const inv = await getInvite(id).catch(() => null);
  if (!inv) return {};
  if (inv.logged) {
    const sport = inv.sport === "tennis" ? "Tennis" : "Pickleball";
    const title = `${inv.host} logged a match with you on Players Club`;
    const description = `${sport} at ${inv.court}${inv.town ? `, ${inv.town}` : ""}. ${inv.logged.confirmed ? "Score confirmed." : "Tap to confirm the score."}`;
    return { title, description, openGraph: { title, description, siteName: "Players Club", type: "website" }, twitter: { card: "summary_large_image", title, description } };
  }
  const l = inviteLine(inv);
  const description = `${l.detail} · ${l.spots}. Tap to join.`;
  return {
    title: l.title,
    description,
    openGraph: { title: l.title, description, siteName: "Players Club", type: "website" },
    twitter: { card: "summary_large_image", title: l.title, description },
  };
}

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return children;
}
