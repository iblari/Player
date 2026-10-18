"use client";
import { useEffect, useRef } from "react";

/**
 * One seamless 9 s loop (tennis backhand → aerial pickleball → back), with the crossfades
 * baked into the file so the phone decodes a single video. 720×1280 so it stays sharp on
 * high-density screens. MP4/H.264 first (hardware-decoded on iPhone), WebM/VP9 as fallback.
 * Clips: Mixkit and Pexels free licenses; no attribution required.
 */
export default function HeroVideo() {
  const v = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = v.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.pause();
      return;
    }
    // React doesn't reliably set the muted attribute, and browsers only autoplay muted video.
    el.muted = true;
    el.play().catch(() => {});
  }, []);

  return (
    <div className="lp-hero-media" aria-hidden="true">
      <video ref={v} poster="/landing/hero-loop.jpg" autoPlay muted loop playsInline preload="auto" disablePictureInPicture>
        <source src="/landing/hero-loop.mp4" type="video/mp4" />
        <source src="/landing/hero-loop.webm" type="video/webm" />
      </video>
    </div>
  );
}
