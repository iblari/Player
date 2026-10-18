"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

// Handles sign-in links that come back with tokens or errors in the URL hash
// (e.g. an expired link, or the implicit flow), wherever they land.
export default function AuthHashHandler() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const err = h.get("error_description");
    if (err) {
      setMsg(err.includes("expired") || err.includes("invalid") ? "That sign-in link expired or was already used. Send yourself a new one." : err);
      history.replaceState(null, "", window.location.pathname);
      return;
    }
    const at = h.get("access_token");
    const rt = h.get("refresh_token");
    if (at && rt) {
      supabase()
        .auth.setSession({ access_token: at, refresh_token: rt })
        .then(({ error }) => {
          history.replaceState(null, "", window.location.pathname);
          if (!error) router.replace("/play");
          else setMsg("Couldn't finish signing in. Send yourself a new link.");
        });
    }
  }, [router]);
  if (!msg) return null;
  return (
    <div className="notice warn" role="alert">
      <span>{msg}</span>
      <a className="btn btn-sm" href="/login">
        Send a new link
      </a>
    </div>
  );
}
