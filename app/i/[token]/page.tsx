import type { Metadata } from "next";
import Link from "next/link";
import { getInviteInfo, sides } from "@/lib/inviteInfo";
import InviteClaim from "./InviteClaim";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const i = await getInviteInfo(token).catch(() => null);
  if (!i) return { title: "Players Club" };
  const title = `${i.logger} logged a match with you on Players Club`;
  const description = `${i.sport === "tennis" ? "Tennis" : "Pickleball"} at ${i.court}. Tap to confirm the score.`;
  return { title, description, robots: { index: false }, openGraph: { title, description, siteName: "Players Club" }, twitter: { card: "summary_large_image", title, description } };
}

/** Where an invite link lands: the match someone logged with you, and a button to join and confirm. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const i = await getInviteInfo(token);
  if (!i || i.expired)
    return (
      <main className="shell bare invite">
        <img src="/mark.svg" alt="Players Club" width={56} height={56} />
        <h1>This link has expired</h1>
        <p className="muted">The match was removed, or the link is more than 30 days old. Ask whoever sent it to log it again.</p>
        <Link className="btn btn-ball btn-block" href="/">
          See Players Club
        </Link>
      </main>
    );

  const s = sides(i);
  const sport = i.sport === "tennis" ? "Tennis" : "Pickleball";
  const kind = i.slots === 4 ? "doubles" : "singles";
  const day = new Date(i.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });
  const games = i.games ?? [];
  const mineA = i.team === "a";
  const row = (names: string[], idx: 0 | 1, you: boolean) => (
    <div className={`inv-row${you ? " you" : ""}`}>
      <span className="inv-names">{names.join(" & ")}</span>
      {games.map((g, k) => {
        const v = g[idx];
        const win = v > g[idx === 0 ? 1 : 0];
        return (
          <span key={k} className={`inv-score${win ? " win" : ""}`}>
            {v}
          </span>
        );
      })}
    </div>
  );

  return (
    <main className="shell bare invite">
      <img src="/mark.svg" alt="Players Club" width={56} height={56} />
      <p className="inv-kicker">Hi {i.guest_name.split(" ")[0]},</p>
      <h1>{i.logger} logged a match with you</h1>
      <p className="muted">
        {sport} {kind} · {i.court}
        {i.town ? `, ${i.town}` : ""} · {day}
      </p>
      {games.length > 0 && (
        <div className="inv-board">
          {games.length > 1 && (
            <div className="inv-row inv-head">
              <span className="inv-names" />
              {games.map((_, k) => (
                <span key={k} className="inv-score">
                  {i.sport === "tennis" ? "S" : "G"}
                  {k + 1}
                </span>
              ))}
            </div>
          )}
          {row(s.a, 0, mineA)}
          {row(s.b, 1, !mineA)}
        </div>
      )}
      <InviteClaim token={token} claimed={i.claimed} gameId={i.game_id} />
      <p className="small muted inv-foot">
        Players Club finds you people to play pickleball and tennis with nearby, and keeps your scores and rating. Free.
      </p>
    </main>
  );
}
