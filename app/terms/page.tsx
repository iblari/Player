import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms · Players Club" };
const CONTACT = "ibrahimlari7@gmail.com";
const UPDATED = "October 18, 2026";

export default function Terms() {
  return (
    <main className="shell bare legal">
      <Link href="/" className="small muted">← Back</Link>
      <h1>Terms</h1>
      <p className="muted small">Last updated {UPDATED}</p>
      <p>By using Players Club (playersclub.io) you agree to these terms.</p>

      <h2>Using the app</h2>
      <ul>
        <li>You must be 18 or older and give accurate information about yourself.</li>
        <li>Be respectful. No harassment, hate, spam, fake accounts, or sharing other people&apos;s private information. We may remove content or accounts that break these rules.</li>
        <li>Show up for games you join, or leave them in time so someone else can play.</li>
      </ul>

      <h2>Meeting people and playing</h2>
      <p>Players Club helps you find other players; we don&apos;t run the games, the courts, or vet players. Meet in public places, use your judgment, and play within your ability. Sports carry a risk of injury. You play at your own risk, and you&apos;re responsible for following the rules of any court or club, including membership rules.</p>

      <h2>Court costs and payments</h2>
      <p>Hosts may share court costs and payment handles. Payments happen directly between players in third-party apps (Venmo, Cash App, PayPal, Zelle). We don&apos;t process, hold, or guarantee payments and can&apos;t resolve payment disputes.</p>

      <h2>Ratings and courts</h2>
      <p>Levels and ratings are estimates from game results and feedback. Court information comes partly from OpenStreetMap and from players and may be incomplete or out of date.</p>

      <h2>No warranty; limits</h2>
      <p>The app is provided &quot;as is&quot;. To the extent the law allows, we aren&apos;t liable for indirect or consequential losses, or for anything that happens between players on or off the court.</p>

      <h2>Changes</h2>
      <p>We may update these terms; we&apos;ll change the date above. Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
    </main>
  );
}
