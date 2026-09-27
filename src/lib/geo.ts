// ── Where a chapter stands, and how far apart two of them are ──
// The homepage's rule (HomePage places the chapters, AtlasSign reads the
// legs): a chapter stands on its canonical map point when Sanity has one,
// else on the mean of its geotagged frames; a leg is the great-circle
// distance between two of those points (R 6371 km), in the homepage's
// chapter order. Pure; scripts/exposure-record.test.mjs holds it.

export const EARTH_RADIUS_KM = 6371;

type LngLat = [number, number];

export function haversineKm(a: LngLat, b: LngLat) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 6791.9 → "6 792", grouped with a thin space. */
export const formatKm = (km: number) => Math.round(km).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

interface Placed {
  mapLocation?: { lat: number; lng: number } | null;
  photos?: Array<{ location?: { lat?: number | null; lng?: number | null } | null }> | null;
}

/** The chapter's point: its canonical map location, else the mean of its
 *  geotagged frames, else nothing (the caller may know a named place). */
export function chapterPoint(chapter: Placed): LngLat | undefined {
  const map = chapter.mapLocation;
  if (
    map &&
    Number.isFinite(map.lng) &&
    Number.isFinite(map.lat) &&
    map.lng >= -180 &&
    map.lng <= 180 &&
    map.lat >= -90 &&
    map.lat <= 90
  ) {
    return [map.lng, map.lat];
  }
  const points = (chapter.photos ?? [])
    .map((photo) => photo.location)
    .filter((location): location is { lat: number; lng: number } => location?.lat != null && location?.lng != null);
  if (!points.length) return undefined;
  return [
    points.reduce((sum, point) => sum + point.lng, 0) / points.length,
    points.reduce((sum, point) => sum + point.lat, 0) / points.length,
  ];
}
