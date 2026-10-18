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
        if (data.session) return router.replace(next === "/play" ? "/me/edit" : next);
        // No session back: either confirmation is on, or the email is already registered
        // (Supabase hides that by returning a user with no identities). Try signing in directly.
        const si = await sb.auth.signInWithPassword({ email: v, password });
        if (!si.error) return router.replace(next === "/play" ? "/me/edit" : next);
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

  async function google() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    // On success the browser leaves for Google, so we only get here on an error.
    if (error) {
      setBusy(false);
      setErr("Couldn't open Google sign-in. Try again, or use your email.");
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
          <button type="button" className="btn btn-block btn-google" onClick={google} disabled={busy}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continue with Google
          </button>
          <div className="or-divider"><span>or use email</span></div>
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
