import type { Metadata } from "next";
import { getInvite, inviteLine } from "@/lib/invite";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const inv = await getInvite(id).catch(() => null);
  if (!inv) return {};
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
