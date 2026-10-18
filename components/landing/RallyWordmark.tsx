"use client";
import { useEffect, useState } from "react";

// "Let's rally / let's play" around the world. Rally doesn't translate naturally, so the
// other languages use their everyday "let's play" (Chinese: "let's play ball together").
const WORDS: { text: string; lang: string; dir?: "rtl" }[] = [
  { text: "Let's rally", lang: "en" },
  { text: "Let's play", lang: "en" },
  { text: "一起打球吧", lang: "zh-Hans" },
  { text: "¡Vamos a jugar!", lang: "es" },
  { text: "چلو کھیلیں", lang: "ur", dir: "rtl" },
  { text: "चलो खेलें", lang: "hi" },
];

/** Landing header wordmark: the ball plus a phrase that rotates through languages. */
export default function RallyWordmark() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % WORDS.length), 2200);
    return () => clearInterval(t);
  }, []);

  const w = WORDS[i];
  return (
    <div className="wordmark lp-wordmark">
      <i aria-hidden="true" />
      <span className="lp-word-slot" aria-label="Let's rally. Let's play.">
        <span key={i} className="lp-word" lang={w.lang} dir={w.dir} aria-hidden="true">
          {w.text}
        </span>
      </span>
    </div>
  );
}
