import Link from "next/link";
import LandingCourt from "@/components/LandingCourt";
import AuthHashHandler from "@/components/AuthHashHandler";

export default function Landing() {
  return (
    <main className="shell bare landing">
      <div className="wordmark">
        <i aria-hidden="true" /> Fourth Up
      </div>

      <AuthHashHandler />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 className="hero-title">Never be the one standing at the fence.</h1>
        <p className="hero-copy">
          Tell players near you you&apos;re free, post a game at your court, and watch the spots fill.
        </p>
      </div>

      <LandingCourt />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link className="btn btn-ball btn-block" href="/login">
          Get in a game
        </Link>
        <p className="small muted" style={{ margin: 0, textAlign: "center" }}>
          Free. Sign in with your email, no password.
        </p>
      </div>

      <ol className="steps">
        <li>
          <span className="n">1</span>
          <div>
            <b>Go available</b>
            <span className="muted small">Set how far you&apos;ll drive and for how long. Hosts nearby see you count toward their game.</span>
          </div>
        </li>
        <li>
          <span className="n">2</span>
          <div>
            <b>Post a game</b>
            <span className="muted small">Pick the court, doubles or singles, and a rating range. Matching players get a ping.</span>
          </div>
        </li>
        <li>
          <span className="n">3</span>
          <div>
            <b>Show up</b>
            <span className="muted small">The court fills in live. Hosts log who showed, so reliable players rise.</span>
          </div>
        </li>
      </ol>
    </main>
  );
}
