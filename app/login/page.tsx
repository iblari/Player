"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import AuthHashHandler from "@/components/AuthHashHandler";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/play";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(params.get("error") ? "That sign-in link expired. Send a new one." : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(v)) return setErr("Enter a valid email address.");
    setBusy(true);
    setErr(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: v,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) setErr(error.message.includes("rate") ? "Too many sign-in emails. Wait a minute and try again." : error.message);
    else setSent(true);
  }

  return (
    <main className="shell bare" style={{ justifyContent: "center" }}>
      <Link href="/" className="wordmark" style={{ textDecoration: "none" }}>
        <i aria-hidden="true" /> Fourth Up
      </Link>
      <AuthHashHandler />
      {sent ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h1>Check your email</h1>
          <p className="muted" style={{ margin: 0 }}>
            We sent a sign-in link to <b style={{ color: "var(--ink)" }}>{email}</b>. Open it on this device.
          </p>
          <button className="btn btn-ghost" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
          <div>
            <h1>Sign in</h1>
            <p className="sub">We&apos;ll email you a link. No password to remember.</p>
          </div>
          <label className="field">
            <span>Email</span>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErr(null);
              }}
            />
          </label>
          {err && <p className="err">{err}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Sending…" : "Email me a sign-in link"}
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
