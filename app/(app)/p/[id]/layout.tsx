import type { Metadata } from "next";
import { getProfileInvite } from "@/lib/invite";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getProfileInvite(id).catch(() => null);
  if (!p) return {};
  const title = `${p.name} wants to add you on Players Club`;
  const description = "Follow each other to see games, find partners and get matched for pickleball and tennis near you.";
  return {
    title,
    description,
    openGraph: { title, description, siteName: "Players Club", type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
