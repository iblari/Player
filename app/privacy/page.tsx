import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · Let's Rally" };
const CONTACT = "ibrahimlari7@gmail.com";
const UPDATED = "October 18, 2026";

export default function Privacy() {
  return (
    <main className="shell bare legal">
      <Link href="/" className="small muted">← Back</Link>
      <h1>Privacy</h1>
      <p className="muted small">Last updated {UPDATED}</p>
      <p>Let&apos;s Rally (playersclub.io) helps you find people to play pickleball and tennis with. This page explains what we collect, why, and what you control.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account:</b> your email, and your name and photo if you sign in with Google or add them.</li>
        <li><b>Profile:</b> the sports you play, your self-rated level, clubs you say you belong to, and the name and photo you choose to show.</li>
        <li><b>Location:</b> only when you allow it or type a town or ZIP. We use it to show nearby courts and players and to tell nearby players about games. We store your approximate area (about 1 km) so nearby players and games can find you, and your location when you go available. Other players only see a rough area, never your exact spot.</li>
        <li><b>Games:</b> games you host or join, scores, ratings, attendance, level feedback you give, and messages in a game&apos;s chat.</li>
        <li><b>Payments:</b> if you host a paid court, the Venmo, Cash App, PayPal or Zelle handle you enter. We never handle money or card details; payment apps open outside our site.</li>
        <li><b>Notifications:</b> if you turn them on, a push token for your device.</li>
        <li><b>Usage:</b> page views and feature events (for example, &quot;game posted&quot;) through Vercel Web Analytics, and how pages are used (clicks, scrolls, session replays) through Microsoft Clarity, which uses cookies. Chat messages, payment details and typed text are masked from recordings.</li>
      </ul>

      <h2>Who sees what</h2>
      <ul>
        <li>Other players see your name, photo, level, show-up rate, followers and following.</li>
        <li>Your activities (finished games) are visible to everyone, your followers, or only you: your choice in Edit profile → Privacy, and per game with the globe icon.</li>
        <li>Game chat is visible only to players in that game. Payment handles are visible only to players who join a game you host.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>We don&apos;t sell your data or use it for advertising. We use service providers to run the app: Supabase (database and sign-in), Vercel (hosting and analytics), Microsoft Clarity (usage analytics), Google (if you sign in with Google), OpenStreetMap services (maps and place search; searches you type are sent to them), and your browser&apos;s push service for notifications.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Change your profile, privacy and notifications anytime in your account.</li>
        <li>Turn off location in your browser or phone settings; you can type a town instead.</li>
        <li>To delete your account and data, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from your account email. We delete it within 30 days.</li>
      </ul>

      <h2>Kids</h2>
      <p>Let&apos;s Rally is for people 18 and over. We don&apos;t knowingly collect data from anyone younger.</p>

      <h2>Contact</h2>
      <p>Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
    </main>
  );
}
