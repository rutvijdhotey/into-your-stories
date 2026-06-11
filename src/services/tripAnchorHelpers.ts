export type AnchorPoint = { lat: number; lng: number };

/** A GPS fix is plausible for a trip if within this distance of any anchor. */
export const ANCHOR_PLAUSIBLE_KM = 200;

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: AnchorPoint, b: AnchorPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** True when within `thresholdKm` of ANY anchor. Empty anchors → true (no judgment). */
export function isPlausible(
  point: AnchorPoint,
  anchors: AnchorPoint[],
  thresholdKm: number = ANCHOR_PLAUSIBLE_KM,
): boolean {
  if (anchors.length === 0) return true;
  return anchors.some((anchor) => haversineKm(point, anchor) <= thresholdKm);
}

export function nearestAnchor(point: AnchorPoint, anchors: AnchorPoint[]): AnchorPoint | null {
  let best: AnchorPoint | null = null;
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const d = haversineKm(point, anchor);
    if (d < bestDistance) {
      bestDistance = d;
      best = anchor;
    }
  }
  return best;
}

/** A resolved GPS/EXIF fix as the capture sheet sees it. */
export type AutoFix = {
  lat: number;
  lng: number;
  city: string | null;
  placeName: string | null;
};

/**
 * Decides the auto (non-manual) location for a new note.
 * - EXIF always wins (the photo was there) — never plausibility-checked.
 * - Plausible GPS passes through.
 * - Implausible GPS is replaced by the nearest anchor; the caller reverse-geocodes
 *   the anchor for city/place_name (async, so not done here).
 */
export type AutoLocation =
  | { source: 'exif' | 'gps'; lat: number; lng: number; city: string | null; place_name: string | null }
  | { source: 'inferred'; anchor: AnchorPoint }
  | { source: null };

export function resolveAutoLocation(
  exif: AutoFix | null,
  gps: AutoFix | null,
  anchors: AnchorPoint[],
): AutoLocation {
  if (exif) {
    return { source: 'exif', lat: exif.lat, lng: exif.lng, city: exif.city, place_name: exif.placeName };
  }
  if (!gps) return { source: null };
  if (isPlausible(gps, anchors)) {
    return { source: 'gps', lat: gps.lat, lng: gps.lng, city: gps.city, place_name: gps.placeName };
  }
  const anchor = nearestAnchor(gps, anchors);
  // Unreachable in practice (implausible implies non-empty anchors), kept for type safety.
  if (!anchor) {
    return { source: 'gps', lat: gps.lat, lng: gps.lng, city: gps.city, place_name: gps.placeName };
  }
  return { source: 'inferred', anchor };
}
