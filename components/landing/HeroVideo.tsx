"use client";
import { useEffect, useRef } from "react";

/**
 * Two muted, looping stock clips (tennis backhand, aerial pickleball) that crossfade.
 * Clips: Mixkit (free license) and Pexels (free license); no attribution required.
 * The tennis clip stays underneath so there's never a dark gap during the fade.
 */
export default function HeroVideo() {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      [a.current, b.current].forEach((v) => v?.pause());
      return;
    }
    // React doesn't reliably set the muted attribute, and browsers only autoplay muted video.
    [a.current, b.current].forEach((v) => {
      if (!v) return;
      v.muted = true;
      v.play().catch(() => {});
    });
  }, []);

  return (
    <div className="lp-hero-media" aria-hidden="true">
      <video ref={a} className="lp-v1" poster="/landing/hero-tennis.jpg" autoPlay muted loop playsInline preload="auto">
        <source src="/landing/hero-tennis.webm" type="video/webm" />
        <source src="/landing/hero-tennis.mp4" type="video/mp4" />
      </video>
      <video ref={b} className="lp-v2" poster="/landing/hero-pickleball.jpg" autoPlay muted loop playsInline preload="auto">
        <source src="/landing/hero-pickleball.webm" type="video/webm" />
        <source src="/landing/hero-pickleball.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
