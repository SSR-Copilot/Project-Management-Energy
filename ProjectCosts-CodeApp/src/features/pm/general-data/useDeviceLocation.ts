import { useEffect, useState } from "react";

/**
 * The canvas `Location.Latitude` / `Location.Longitude` (the map's `CurrentLocation*` and the pin fallback in
 * `mapMarker`). One position on mount; null while unknown, when the browser has no geolocation, or when the user or
 * the host frame refuses it. The canvas has the same blank in those cases.
 */
export function useDeviceLocation(): { lat: number; lng: number } | null {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let active = true;
    navigator.geolocation.getCurrentPosition(
      (p) => { if (active) setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => undefined,
      { maximumAge: 5 * 60 * 1000, timeout: 15_000 },
    );
    return () => { active = false; };
  }, []);
  return position;
}
