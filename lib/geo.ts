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

export function getCoords(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("This browser can't share location."));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          localStorage.setItem(KEY, JSON.stringify(c));
        } catch {}
        resolve(c);
      },
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location is blocked. Allow it in your browser settings to find courts near you."
              : "Couldn't get your location. Try again outside or with Wi-Fi on."
          )
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 }
    );
  });
}
