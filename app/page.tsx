import Link from "next/link";
import AuthHashHandler from "@/components/AuthHashHandler";
import HeroVideo from "@/components/landing/HeroVideo";
import NearYouMap from "@/components/landing/NearYouMap";
import HowItWorks from "@/components/landing/HowItWorks";
import RallyWordmark from "@/components/landing/RallyWordmark";

export default function Landing() {
  return (
    <main className="lp">
      <AuthHashHandler />

      <section className="lp-hero">
        <HeroVideo />
        <header className="lp-top">
          <RallyWordmark />
          <Link className="lp-signin" href="/login">
            Sign in
          </Link>
        </header>
        <div className="lp-hero-copy">
          <span className="lp-pill">
            <span className="lp-live" aria-hidden="true" />
            Pickleball &amp; tennis near you
          </span>
          <h1 className="lp-h1">
            Match with players near you <span>within minutes.</span>
          </h1>
          <p className="lp-lead">Say you&apos;re free, post a game at your court, and watch the spots fill.</p>
          <div className="lp-cta">
            <Link className="btn btn-ball btn-block" href="/login">
              Get in a game
            </Link>
            <p className="small muted">Free. Takes 20 seconds to sign up.</p>
          </div>
        </div>
      </section>

      <section className="lp-sec lp-near">
        <div className="lp-sec-text">
          <span className="lp-eyebrow">Players near you</span>
          <h2 className="lp-h2">Like calling a ride. For a game.</h2>
          <p className="lp-lead">
            See who&apos;s free around you. Post a game and the closest players at your level get pinged. Watch them head to the court.
          </p>
        </div>
        <NearYouMap />
      </section>

      <section className="lp-sec lp-how">
        <div className="lp-sec-text">
          <span className="lp-eyebrow">How it works</span>
          <h2 className="lp-h2">From couch to court in three taps.</h2>
        </div>
        <HowItWorks />
        <div className="lp-cta lp-cta-end">
          <Link className="btn btn-ball btn-block" href="/login">
            Get in a game
          </Link>
        </div>
      </section>

      <footer className="lp-foot">
        <RallyWordmark />
        <span>Pickleball and tennis players near you. More sports soon.</span>
        <span>
          Court and map data ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>{" "}
          contributors.
        </span>
      </footer>
    </main>
  );
}
