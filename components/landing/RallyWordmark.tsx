"use client";
import { useEffect, useState } from "react";

// "Let's rally", then "let's play", in each language.
// Chinese 对打 is the word for hitting back and forth; Spanish "pelotear" is the tennis word
// for rallying; Hindi and Urdu players use the English loanword "rally".
const WORDS: { text: string; lang: string; dir?: "rtl" }[] = [
  { text: "Let's rally", lang: "en" },
  { text: "Let's play", lang: "en" },
  { text: "来对打吧", lang: "zh-Hans" },
  { text: "一起打球吧", lang: "zh-Hans" },
  { text: "¡Vamos a pelotear!", lang: "es" },
  { text: "¡Vamos a jugar!", lang: "es" },
  { text: "چلو ریلی کریں", lang: "ur", dir: "rtl" },
  { text: "چلو کھیلیں", lang: "ur", dir: "rtl" },
  { text: "चलो रैली करें", lang: "hi" },
  { text: "चलो खेलें", lang: "hi" },
];

/** Landing header wordmark: the ball plus a phrase that rotates through languages. */
export default function RallyWordmark() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % WORDS.length), 2000);
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
