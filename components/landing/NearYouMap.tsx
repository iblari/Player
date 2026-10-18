import CourtDiagram from "@/components/CourtDiagram";
import { BackIcon, CalendarIcon, ChevronIcon, PinIcon, SearchIcon } from "@/components/Icons";

/**
 * Looping demo of the real app flow, built from the app's own components and classes:
 * Home → pick a court → Host "Choose your game" (singles first) → game page fills, game on.
 * Pure CSS timing (see "Landing demo" in globals.css). Sample content, not live data.
 */
const ME = [{ id: "you", name: "You", isMe: true }];
const BOTH = [
  { id: "you", name: "You", isMe: true },
  { id: "mk", name: "Maya K" },
];

export default function NearYouMap() {
  return (
    <div className="lp-map-wrap">
      <div
        className="lp-phone"
        role="img"
        aria-label="Demo of the app: pick a court near you, choose singles, post the game, and the game page fills to two of two as a nearby player joins."
      >
        {/* 1 · Home, then the court picker sheet */}
        <div className="lp-scene lp-scene1" aria-hidden="true">
          <div className="sport-switch">
            <button type="button" aria-pressed="true" tabIndex={-1}>Pickleball</button>
            <button type="button" tabIndex={-1}>Tennis</button>
            <span className="soon">More soon</span>
          </div>
          <h1 className="lp-ph-h1">Hi, Alex</h1>
          <div className="search-pill">
            <SearchIcon />
            <span className="label">Where are you playing pickleball?</span>
            <span className="later">
              <CalendarIcon /> Later
            </span>
          </div>
          <div className="avail-strip on">
            <span className="grow">
              <b>You&apos;re down to play</b>
              <span>For the next 2 hours · within 5 mi</span>
            </span>
            <span className="switch" />
          </div>
          <p className="lp-ph-label">Available players</p>
          <div className="lp-ph-map lp-ph-home">
            <span className="chip-live"><span className="pulse" />7 available near you</span>
            {[[22, 40], [64, 30], [78, 66], [40, 72], [55, 52]].map(([x, y]) => (
              <span key={`${x}-${y}`} className="lp-ph-dot" style={{ left: `${x}%`, top: `${y}%` }} />
            ))}
          </div>

          <div className="lp-sheet-up">
            <div className="sheet-grip" />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="lp-ph-back"><BackIcon /></span>
              <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Pick a location to play</h2>
            </div>
            <div className="search-field">
              <SearchIcon />
              <span className="muted">Search courts, parks, clubs</span>
            </div>
            <div className="list">
              {[
                ["Memorial Park", "0.8 mi · 3 available"],
                ["Community Center", "1.6 mi · 1 available"],
                ["High School Courts", "3.4 mi"],
              ].map(([t, m], i) => (
                <div key={t} className={`list-row${i === 0 ? " lp-row-pick" : ""}`}>
                  <span className="icon-circle"><PinIcon /></span>
                  <span className="grow">
                    <span className="t">{t}</span>
                    <span className="m">{m}</span>
                  </span>
                  <span className="chev"><ChevronIcon /></span>
                </div>
              ))}
            </div>
          </div>
          <span className="lp-tap lp-tap1" />
          <span className="lp-tap lp-tap2" />
        </div>

        {/* 2 · Host: choose your game (singles is the default) */}
        <div className="lp-scene lp-scene2" aria-hidden="true">
          <div className="lp-ph-map">
            <span className="chip-live"><span className="pulse" />3 available here</span>
            <span className="court-pin hot lp-ph-pin">1</span>
          </div>
          <div className="list-row lp-ph-court">
            <span className="icon-circle"><PinIcon /></span>
            <span className="grow">
              <span className="t">Memorial Park</span>
              <span className="m">0.8 mi away · Change</span>
            </span>
          </div>
          <h2 style={{ margin: 0 }}>Choose your game</h2>
          <div className="options">
            <div className="option" aria-pressed="true">
              <CourtDiagram size="sm" slots={2} players={ME} />
              <span>
                <span className="t">Singles</span> <span className="pill pill-ball">Fills fastest</span>
                <br />
                <span className="m">You + 1 player</span>
              </span>
              <span className="r"><b>93%</b><span className="m">fill chance</span></span>
            </div>
            <div className="option" aria-pressed="false">
              <CourtDiagram size="sm" slots={4} players={ME} />
              <span>
                <span className="t">Doubles</span>
                <br />
                <span className="m">You + 3 players</span>
              </span>
              <span className="r"><b>34%</b><span className="m">fill chance</span></span>
            </div>
          </div>
          <div className="btn btn-primary btn-block lp-ph-cta">Find 1 player for pickleball</div>
          <span className="lp-tap lp-tap3" />
        </div>

        {/* 3 · Game page: finding a player, then game on */}
        <div className="lp-scene lp-scene3" aria-hidden="true">
          <div className="page-head">
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="sub" style={{ margin: "0 0 6px" }}>Pickleball · Singles at Memorial Park</p>
              <div className="lp-ph-swap">
                <div className="lp-gs-a">
                  <h1 className="lp-ph-h1">Need one more</h1>
                  <p className="finding" style={{ margin: "8px 0 0" }}><span className="pulse" /> Finding players near you</p>
                </div>
                <div className="lp-gs-b">
                  <h1 className="lp-ph-h1">Game on</h1>
                  <p className="finding" style={{ margin: "8px 0 0", color: "var(--ball)" }}>Maya K. is on the way</p>
                </div>
              </div>
            </div>
            <div className="score-big lp-ph-score">
              <span className="lp-gs-a">1<small>/2</small></span>
              <span className="lp-gs-b">2<small>/2</small></span>
            </div>
          </div>
          <div className="lp-ph-swap">
            <div className="lp-gs-a"><CourtDiagram slots={2} players={ME} /></div>
            <div className="lp-gs-b"><CourtDiagram slots={2} players={BOTH} /></div>
          </div>
          <div className="facts">
            <div className="fact"><span>Starts</span><b>in 30 min</b></div>
            <div className="fact"><span>DUPR level</span><b>3.25–3.75</b></div>
          </div>
        </div>
      </div>
      <ol className="lp-flow" aria-label="How a game comes together">
        <li className="lp-flow1">Pick a court</li>
        <li className="lp-flow2">Choose your game</li>
        <li className="lp-flow3">Players join</li>
      </ol>
    </div>
  );
}
