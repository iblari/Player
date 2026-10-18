"use client";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProfileView from "@/components/ProfileView";
import { useSession } from "@/components/Session";

export default function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { userId } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (userId && userId === id) router.replace("/me");
  }, [userId, id, router]);
  return <ProfileView userId={id} />;
}
