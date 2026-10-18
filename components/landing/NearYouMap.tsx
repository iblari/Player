/**
 * Looping demo of the core loop on an Uber-style map: players free nearby appear, a game is
 * posted and pings ripple out from the court, three players head over, the game fills to 4/4.
 * Pure CSS (see "Landing" in globals.css). It's an illustration, so it shows no real numbers.
 */
export default function NearYouMap() {
  return (
    <div className="lp-map-wrap">
      <div
        className="lp-map"
        role="img"
        aria-label="Demo: pick a court, choose doubles, post the game; nearby players at your level get pinged, three accept and head there, and the game fills to four of four."
      >
        <div className="lp-scene lp-scene1" aria-hidden="true">
          <div className="lp-s-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            Where are you playing?
          </div>
          <div className="lp-s-label">Courts near you</div>
          <div className="lp-s-list">
            <div className="lp-s-row lp-s-row1">
              <span className="lp-s-icon" />
              <span className="lp-s-grow"><b>Memorial Park</b><span>0.8 mi · 6 courts · lights</span></span>
              <span className="lp-s-pill">Players free</span>
            </div>
            <div className="lp-s-row">
              <span className="lp-s-icon" />
              <span className="lp-s-grow"><b>Community Center</b><span>1.6 mi · 4 courts</span></span>
            </div>
            <div className="lp-s-row">
              <span className="lp-s-icon" />
              <span className="lp-s-grow"><b>Life Time</b><span>3.1 mi · 8 indoor · members</span></span>
            </div>
            <div className="lp-s-row">
              <span className="lp-s-icon" />
              <span className="lp-s-grow"><b>High School Courts</b><span>3.4 mi · 2 courts</span></span>
            </div>
          </div>
          <span className="lp-tap lp-tap1" />
        </div>

        <div className="lp-scene lp-scene2" aria-hidden="true">
          <div className="lp-s-court">
            <span className="lp-s-icon" />
            <span className="lp-s-grow"><b>Memorial Park</b><span>0.8 mi away</span></span>
          </div>
          <div className="lp-s-label">Choose your game</div>
          <div className="lp-s-opt lp-s-doubles">
            <span className="lp-s-mini lp-s-mini4" />
            <span className="lp-s-grow"><b>Doubles</b><span>You + 3 players</span></span>
            <span className="lp-s-fill">Fills fast</span>
          </div>
          <div className="lp-s-opt">
            <span className="lp-s-mini" />
            <span className="lp-s-grow"><b>Singles</b><span>You + 1 player</span></span>
            <span className="lp-s-fill">Fills fast</span>
          </div>
          <div className="lp-s-when"><span className="on">Now</span><span>In 45 min</span><span>Later</span></div>
          <div className="lp-s-cta">Find 3 players</div>
          <span className="lp-tap lp-tap2" />
          <span className="lp-tap lp-tap3" />
        </div>

        <div className="lp-scene lp-scene3">
          <svg aria-hidden="true" width="350" height="470" viewBox="0 0 350 470" className="lp-map-roads">
            <rect width="350" height="470" fill="#191a1a" />
            <path d="M150 210 h90 v60 h-90 z" fill="#1f2b22" />
            <path d="M20 330 h70 v70 h-70 z" fill="#1f2b22" />
            <path d="M-10 90 C80 80 160 110 360 70" stroke="#2c2c2c" fill="none" strokeWidth="10" />
            <path d="M-10 300 L360 260" stroke="#2c2c2c" fill="none" strokeWidth="14" />
            <path d="M120 -10 C130 120 110 300 140 480" stroke="#2c2c2c" fill="none" strokeWidth="10" />
            <path d="M270 -10 L250 480" stroke="#2c2c2c" fill="none" strokeWidth="8" />
            <path d="M-10 410 C120 380 240 440 360 400" stroke="#262626" fill="none" strokeWidth="6" />
            <path d="M200 -10 L215 200" stroke="#262626" fill="none" strokeWidth="5" />
            <path d="M-10 180 L130 200" stroke="#262626" fill="none" strokeWidth="5" />
            <path d="M260 180 L360 170" stroke="#262626" fill="none" strokeWidth="5" />
            <path d="M140 360 L260 340" stroke="#262626" fill="none" strokeWidth="5" />
          </svg>

          <span className="lp-ring lp-r1" aria-hidden="true" />
          <span className="lp-ring lp-r2" aria-hidden="true" />
          <span className="lp-ring lp-r3" aria-hidden="true" />

          <span className="lp-dot lp-d1" style={{ left: 96, top: 146 }} />
          <span className="lp-dot lp-d2" style={{ left: 286, top: 120 }} />
          <span className="lp-dot lp-d3" style={{ left: 116, top: 326 }} />
          <span className="lp-dot lp-d4" style={{ left: 300, top: 340 }} />
          <span className="lp-dot lp-d5" style={{ left: 44, top: 240 }} />
          <span className="lp-dot lp-d6" style={{ left: 236, top: 56 }} />

          <div className="lp-court-pin" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <rect x="3" y="6" width="18" height="12" rx="1.5" />
              <path d="M12 5v14" />
            </svg>
          </div>
          <span className="lp-me" aria-hidden="true" />

          <div className="lp-chips" aria-hidden="true">
            <div className="lp-chip lp-k1">
              <span><i />Players free near you</span>
            </div>
            <div className="lp-chip lp-k2">
              <span><i />Game posted · pinging players at your level</span>
            </div>
            <div className="lp-chip lp-k3">
              <span><i />Players on the way</span>
            </div>
          </div>

          <div className="lp-sheet" aria-hidden="true">
            <div className="lp-sheet-top">
              <div>
                <div className="lp-sheet-title">Doubles at Memorial Park</div>
                <div className="lp-sheet-sub">Pickleball · your level · starts in 30 min</div>
              </div>
              <div className="lp-count">
                <span className="lp-n lp-n1">1/4</span>
                <span className="lp-n lp-n2">2/4</span>
                <span className="lp-n lp-n3">3/4</span>
                <span className="lp-n lp-n4">4/4</span>
              </div>
            </div>
            <div className="lp-meter">
              <i className="lp-fill" />
            </div>
            <div className="lp-gameon">Game on</div>
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
