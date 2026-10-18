"use client";
import ProfileView from "@/components/ProfileView";
import { useSession } from "@/components/Session";

export default function MePage() {
  const { userId, loading } = useSession();
  if (loading || !userId) return <div className="skeleton" style={{ minHeight: 240 }} />;
  return <ProfileView userId={userId} />;
}
