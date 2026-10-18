"use client";

export type Coords = { lat: number; lng: number };
const KEY = "fourthup:lastCoords";

export function lastCoords(): Coords | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Coords) : null;
  } catch {
    return null;
  }
}

export function saveCoords(c: Coords) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
}

export type GeoReason = "denied" | "unavailable" | "unsupported";
export class GeoError extends Error {
  constructor(public reason: GeoReason, message: string) {
    super(message);
  }
}
export const isDenied = (e: unknown) => e instanceof GeoError && e.reason === "denied";

/** "granted" | "prompt" | "denied", or null where the browser can't tell us (older iOS). */
export async function locationPermission(): Promise<PermissionState | null> {
  try {
    if (!navigator.permissions?.query) return null;
    const s = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return s.state;
  } catch {
    return null;
  }
}

export function getCoords(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new GeoError("unsupported", "This browser can't share location."));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        saveCoords(c);
        resolve(c);
      },
      (err) =>
        reject(
          err.code === err.PERMISSION_DENIED
            ? new GeoError("denied", "Location is off for this site.")
            : new GeoError("unavailable", "Couldn't get your location. Try again outside or with Wi-Fi on.")
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 }
    );
  });
}

/** Which device/browser we're on, to show the right steps for turning location back on. */
export type Platform = "ios-safari" | "ios-app" | "ios-chrome" | "ios-other" | "android" | "desktop";
export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) {
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || window.matchMedia("(display-mode: standalone)").matches;
    if (standalone) return "ios-app";
    if (/CriOS/.test(ua)) return "ios-chrome";
    if (/FxiOS|EdgiOS|OPiOS|GSA\//.test(ua)) return "ios-other";
    return "ios-safari";
  }
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
