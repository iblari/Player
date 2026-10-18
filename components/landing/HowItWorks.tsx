/** Three steps, each with a small looping demo built from the app's real UI. Pure CSS. */
export default function HowItWorks() {
  return (
    <ol className="lp-steps">
      <li className="lp-step">
        <div className="lp-step-head">
          <span className="lp-step-n">1</span>
          <div>
            <h3>Pick your sport and level</h3>
            <p>Pickleball, tennis or both. Your level sharpens after every game you play.</p>
          </div>
        </div>
        <div className="lp-demo" aria-hidden="true">
          <div className="lp-demo-row">
            <span className="lp-chipbtn lp-s1-pb">Pickleball</span>
            <span className="lp-chipbtn">Tennis</span>
          </div>
          <div className="lp-levels">
            <span>New</span>
            <span>Casual</span>
            <span className="lp-s1-lv">Solid</span>
            <span>Advanced</span>
          </div>
        </div>
      </li>

      <li className="lp-step">
        <div className="lp-step-head">
          <span className="lp-step-n">2</span>
          <div>
            <h3>Say you&apos;re free, or post a game</h3>
            <p>Flip on and players near you at your level get a ping. Or pick a court and post a game yourself.</p>
          </div>
        </div>
        <div className="lp-demo lp-demo-bare" aria-hidden="true">
          <div className="lp-avail">
            <div className="lp-avail-text">
              <div className="lp-off">
                <b>Not available</b>
                <span>Turn on so players nearby can ping you</span>
              </div>
              <div className="lp-on">
                <b>You&apos;re down to play</b>
                <span>For the next 2 hours · within 5 mi</span>
              </div>
            </div>
            <span className="lp-switch">
              <i />
            </span>
          </div>
          <div className="lp-ping">
            <span className="lp-ping-icon" />
            <div>
              <b>Singles near you · need 1</b>
              <br />
              Tap to grab the spot
            </div>
          </div>
        </div>
      </li>

      <li className="lp-step">
        <div className="lp-step-head">
          <span className="lp-step-n">3</span>
          <div>
            <h3>Show up and play</h3>
            <p>Watch your spot fill live. The moment it does, the game&apos;s on and you get directions.</p>
          </div>
        </div>
        <div className="lp-demo lp-demo-court" aria-hidden="true">
          <div className="lp-mini-court">
            <div className="lp-mc-side lp-mc-single">
              <div><span className="lp-ball">MK</span></div>
            </div>
            <div className="lp-mc-kitchen" />
            <div className="lp-mc-kitchen lp-mc-k2" />
            <div className="lp-mc-side lp-mc-single">
              <div className="lp-mc-open">
                <span className="lp-empty" />
                <span className="lp-ball lp-you">You</span>
              </div>
            </div>
          </div>
          <div className="lp-court-gameon">2/2 · Game on</div>
        </div>
      </li>
    </ol>
  );
}
