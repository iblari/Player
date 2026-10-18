"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import AuthHashHandler from "@/components/AuthHashHandler";

type Mode = "signin" | "signup" | "link";

function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Wrong email or password. New here? Switch to Create account.";
  if (m.includes("already registered") || m.includes("already been registered")) return "That email already has an account. Switch to Sign in.";
  if (m.includes("rate") || m.includes("security purposes")) return "Too many sign-in emails right now. Use a password instead, or try again in an hour.";
  if (m.includes("email not confirmed")) return "Confirm your email first, or ask the admin to turn off email confirmation.";
  if (m.includes("password")) return "Use a password with at least 6 characters.";
  return msg;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/play";
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(params.get("error") ? "That sign-in link expired or was opened in a different browser. Sign in with a password instead." : null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(v)) return setErr("Enter a valid email address.");
    if (mode !== "link" && password.length < 6) return setErr("Use a password with at least 6 characters.");
    setBusy(true);
    setErr(null);
    setInfo(null);
    const sb = supabase();
    try {
      if (mode === "link") {
        const { error } = await sb.auth.signInWithOtp({
          email: v,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        setSent(true);
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email: v,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        if (data.session) return router.replace(next === "/play" ? "/me" : next);
        // No session back: either confirmation is on, or the email is already registered
        // (Supabase hides that by returning a user with no identities). Try signing in directly.
        const si = await sb.auth.signInWithPassword({ email: v, password });
        if (!si.error) return router.replace(next === "/play" ? "/me" : next);
        if (data.user && (data.user.identities?.length ?? 0) === 0)
          setErr("That email already has an account with a different password. Sign in instead, or ask the admin to delete the old account.");
        else if (si.error.message.toLowerCase().includes("not confirmed"))
          setErr("Your account needs email confirmation, which is still turned on in Supabase. Turn off Confirm email, then try again.");
        else setErr(friendly(si.error.message));
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: v, password });
        if (error) throw error;
        router.replace(next);
      }
    } catch (e) {
      setErr(friendly((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const tabs: { v: Mode; label: string }[] = [
    { v: "signin", label: "Sign in" },
    { v: "signup", label: "Create account" },
  ];

  return (
    <main className="shell bare" style={{ justifyContent: "center", maxWidth: 440 }}>
      <Link href="/" className="wordmark" style={{ textDecoration: "none" }}>
        <i aria-hidden="true" /> Fourth Up
      </Link>
      <AuthHashHandler />
      {sent ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h1>Check your email</h1>
          <p className="muted" style={{ margin: 0 }}>
            We sent a sign-in link to <b style={{ color: "var(--ink)" }}>{email}</b>. Open it in this browser.
          </p>
          <button className="btn btn-ghost" onClick={() => { setSent(false); setMode("signin"); }}>
            Use a password instead
          </button>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
          <h1>{mode === "signup" ? "Create your account" : mode === "link" ? "Email me a link" : "Welcome back"}</h1>
          {mode !== "link" && (
            <div className="seg" role="tablist">
              {tabs.map((t) => (
                <button key={t.v} type="button" aria-pressed={mode === t.v} onClick={() => { setMode(t.v); setErr(null); setInfo(null); }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <label className="field">
            <span>Email</span>
            <input id="email" className="input" type="email" autoComplete="email" inputMode="email" placeholder="you@gmail.com"
              value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} />
          </label>
          {mode !== "link" && (
            <label className="field">
              <span>Password</span>
              <input id="password" className="input" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="At least 6 characters" value={password} onChange={(e) => { setPassword(e.target.value); setErr(null); }} />
            </label>
          )}
          {err && <p className="err">{err}</p>}
          {info && <p className="small" style={{ margin: 0, color: "var(--ok)" }}>{info}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "One sec…" : mode === "signup" ? "Create account" : mode === "link" ? "Email me a sign-in link" : "Sign in"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode(mode === "link" ? "signin" : "link"); setErr(null); }}>
            {mode === "link" ? "Use a password instead" : "Email me a sign-in link instead"}
          </button>
        </form>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
