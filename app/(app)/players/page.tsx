"use client";
import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/Session";
import PlayerSearch from "@/components/PlayerSearch";
import ProfileQR from "@/components/ProfileQR";

/** Find players by name and follow them. */
export default function PlayersPage() {
  const { userId, profile } = useSession();
  const [qr, setQr] = useState(false);
  if (!userId) return <div className="skeleton" />;
  return (
    <>
      <div className="page-head">
        <h1>Find players</h1>
      </div>
      <PlayerSearch me={userId} autoFocus />
      <div className="psearch-foot">
        <button className="btn btn-sm" onClick={() => setQr(true)}>
          Show my QR code
        </button>
        <Link className="btn btn-sm" href="/log">
          Log a match
        </Link>
      </div>
      {qr && (
        <ProfileQR
          userId={userId}
          name={profile?.display_name || "Me"}
          avatar={(profile as { avatar_url?: string | null } | null)?.avatar_url ?? null}
          onShareLink={async () => {
            const url = `${window.location.origin}/p/${userId}`;
            try {
              if (navigator.share) await navigator.share({ url, text: `${profile?.display_name || "I"} wants to add you on Players Club` });
              else await navigator.clipboard.writeText(url);
            } catch {}
          }}
          onClose={() => setQr(false)}
        />
      )}
    </>
  );
}
