"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type Ctx = {
  userId: string | null;
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  update: (patch: Partial<Profile>) => Promise<string | null>;
};

const SessionCtx = createContext<Ctx>({
  userId: null,
  profile: null,
  loading: true,
  refresh: async () => {},
  update: async () => null,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb.auth.getUser();
    const id = data.user?.id ?? null;
    setUserId(id);
    if (id) {
      const { data: p } = await sb.from("profiles").select("*").eq("id", id).maybeSingle();
      // Google sign-ins start with the email prefix as their name. Swap in "First L." from
      // their Google profile once; anything the player typed themselves is left alone.
      const meta = (data.user?.user_metadata ?? {}) as { full_name?: string; name?: string; given_name?: string; family_name?: string };
      const full = (meta.full_name || meta.name || "").trim();
      const emailPrefix = (data.user?.email ?? "").split("@")[0];
      if (p && full && (!p.display_name || p.display_name === emailPrefix)) {
        const parts = full.split(/\s+/);
        const nice = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
        const { error } = await sb.from("profiles").update({ display_name: nice }).eq("id", id);
        if (!error) (p as Profile).display_name = nice;
      }
      setProfile((p as Profile) ?? null);
    } else setProfile(null);
    setLoading(false);
  }, []);

  const update = useCallback(
    async (patch: Partial<Profile>) => {
      if (!userId) return "Sign in first.";
      setProfile((p) => (p ? { ...p, ...patch } : p));
      const { error } = await supabase().from("profiles").update(patch).eq("id", userId);
      if (error) {
        await refresh();
        return "Couldn't save. Check your connection and try again.";
      }
      return null;
    },
    [userId, refresh]
  );

  useEffect(() => {
    refresh();
    const { data } = supabase().auth.onAuthStateChange(() => refresh());
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  return (
    <SessionCtx.Provider value={{ userId, profile, loading, refresh, update }}>{children}</SessionCtx.Provider>
  );
}

export const useSession = () => useContext(SessionCtx);
