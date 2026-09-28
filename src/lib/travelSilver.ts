// ── /travel: the chapters, their numbers and the camera ──
// The map page's index is the edition's: the chapters in the homepage's
// reading order and numbering, each chapter's ticket in its own stock, and
// the one landing every path uses. (The map itself is the original atlas —
// dark-v11 graded olive, white-ink marks and clusters — drawn in MapboxMap.)
//
// Everything here is pure — the chapter data and the geometry the map and its
// index agree on — so scripts/travel-silver.test.mjs can hold it. MapboxMap
// owns the map instance and every write; nothing here reads the DOM, and
// nothing downstream measures a rect back.
import type { Collection } from '../types';
import { fileRatio, pad2 } from './proofSheet';
import { stockPaper } from './ticketStock';

// ── The chapters ──
export interface TravelPlace {
  city: string;
  lng: number;
  lat: number;
  frames: number;
}
export interface TravelFrame {
  url: string;
  /** The file's own width / height. */
  ratio: number;
  /** Its number in the issue, 1-based, as the homepage's proof sheet counts. */
  number: number;
}
export interface TravelChapter {
  slug: string;
  name: string;
  /** The homepage's chapter number: '01'… */
  ordinal: string;
  region: string;
  year: string;
  /** The chapter's card stock (lib/ticketStock). */
  stock: string;
  coverUrl: string;
  coverRatio: number;
  frames: TravelFrame[];
  places: TravelPlace[];
  /** The place the chapter's mark stands on: the cover photograph's place. */
  lead: number;
}

/** The ticket rule for a photograph's shape: its file's own ratio, held to
 *  0.45–2.4 so a panorama or a sliver never breaks the rail. */
export const clampRatio = (ratio: number | null | undefined) =>
  Math.min(2.4, Math.max(0.45, ratio && Number.isFinite(ratio) && ratio > 0 ? ratio : 1.5));

const ASSET_HASH = /[0-9a-f]{40}/;

/**
 * The chapters in the homepage's reading order (routeOrder once every
 * chapter has one, else the published order — HomePage's rule), numbered the
 * way the homepage numbers them, frames numbered across the issue 01–58 the
 * way its proof sheet does. A chapter with no coordinates keeps its number and
 * its frames' numbers but has nothing to stand on, so it is left off.
 */
export function travelChapters(collections: readonly Collection[]): TravelChapter[] {
  const withPhotos = collections.filter((collection) => (collection.photos?.length ?? 0) > 0);
  const ordered = withPhotos.length > 0 && withPhotos.every((collection) => Number.isFinite(collection.routeOrder))
    ? [...withPhotos].sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0))
    : withPhotos;
  const chapters: TravelChapter[] = [];
  let nextFrame = 1;
  ordered.forEach((collection, index) => {
    const photos = (collection.photos ?? []).filter((photo) => !!photo.imageUrl);
    const coverUrl = collection.coverImageUrl || photos[0]?.imageUrl || '';
    const frames = photos.map((photo) => {
      const own = photo.width && photo.height ? photo.width / photo.height : null;
      return {
        url: photo.imageUrl,
        ratio: own && Number.isFinite(own) && own > 0 ? own : fileRatio(photo.imageUrl) ?? 1.5,
        number: nextFrame++,
      };
    });
    const byCity = new Map<string, { city: string; lng: number; lat: number; frames: number }>();
    photos.forEach((photo) => {
      const location = photo.location;
      if (location?.lat == null || location?.lng == null) return;
      const key = `${location.city ?? ''}|${location.country ?? ''}`;
      const entry = byCity.get(key) ?? { city: location.city || collection.name, lng: 0, lat: 0, frames: 0 };
      entry.lng += location.lng;
      entry.lat += location.lat;
      entry.frames += 1;
      byCity.set(key, entry);
    });
    const places = [...byCity.values()].map((entry) => ({
      city: entry.city,
      lng: entry.lng / entry.frames,
      lat: entry.lat / entry.frames,
      frames: entry.frames,
    }));
    if (!places.length && collection.mapLocation) {
      places.push({ city: collection.name, lng: collection.mapLocation.lng, lat: collection.mapLocation.lat, frames: photos.length });
    }
    if (!places.length) return;
    // The mark stands where the cover was made; else on the place with the
    // most frames (the first of equals).
    const hash = ASSET_HASH.exec(coverUrl)?.[0];
    const coverPhoto = hash ? photos.find((photo) => photo.imageUrl.includes(hash)) : undefined;
    const coverCity = coverPhoto?.location ? `${coverPhoto.location.city ?? ''}|${coverPhoto.location.country ?? ''}` : null;
    const keys = [...byCity.keys()];
    let lead = coverCity ? keys.indexOf(coverCity) : -1;
    if (lead < 0) lead = places.reduce((best, place, i) => (place.frames > places[best].frames ? i : best), 0);
    chapters.push({
      slug: collection.slug,
      name: collection.name.trim(),
      ordinal: pad2(index + 1),
      region: (collection.region ?? collection.location ?? '').trim(),
      year: collection.year != null ? String(collection.year) : '',
      stock: stockPaper(collection.slug),
      coverUrl,
      coverRatio: clampRatio(fileRatio(coverUrl)),
      frames,
      places,
      lead,
    });
  });
  return chapters;
}

export const leadOf = (chapter: TravelChapter): [number, number] => {
  const place = chapter.places[chapter.lead] ?? chapter.places[0];
  return [place.lng, place.lat];
};

/** "15 frames", "01 frame" — the figure padded the way the homepage prints
 *  it, the noun agreeing with it ("1 frames" is gone). CSS sets the case. */
export const framesLabel = (count: number) => `${pad2(count)} ${count === 1 ? 'frame' : 'frames'}`;
export const frameRange = (chapter: TravelChapter) => {
  const first = chapter.frames[0]?.number;
  const last = chapter.frames[chapter.frames.length - 1]?.number;
  if (first == null || last == null) return '';
  return first === last ? pad2(first) : `${pad2(first)}–${pad2(last)}`;
};
/** The row's figures line: region (left out where it only repeats the name),
 *  frames, year, and how many places when there is more than one. */
export function figuresLine(chapter: TravelChapter) {
  const parts: string[] = [];
  if (chapter.region && chapter.region.toLowerCase() !== chapter.name.toLowerCase()) parts.push(chapter.region);
  parts.push(framesLabel(chapter.frames.length));
  if (chapter.year) parts.push(chapter.year);
  if (chapter.places.length > 1) parts.push(`${chapter.places.length} places`);
  return parts.join(' · ');
}
export const coordLabel = (lng: number, lat: number) =>
  `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;
/** 6792 → "6 792", grouped with a thin space. */
export const groupThousands = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// ── Distance ──
const EARTH_KM = 6371;
const EQUATOR_M = 40075016.686;
export function greatCircleKm(from: readonly [number, number], to: readonly [number, number]) {
  const r = Math.PI / 180;
  const dLat = (to[1] - from[1]) * r;
  const dLng = (to[0] - from[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(from[1] * r) * Math.cos(to[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** The route's length as the index prints it: chapter to chapter, lead to lead. */
export function routeKm(points: ReadonlyArray<readonly [number, number]>) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += greatCircleKm(points[i - 1], points[i]);
  return total;
}

// ── The camera ──
/** Every trip is the house travel curve and a beat longer the further it
 *  goes: 900 ms next door, 1.6 s coast to coast. */
export const flightMs = (km: number) => Math.round(900 + 700 * Math.min(1, Math.max(0, km) / 3000));

export const PLACE_ZOOM = 7;
/** A chapter of several places lands where they stand this far apart. */
export const PLACES_APART_PX = 64;
/** …but no closer than street scale: past it the satellite bytes climb. */
export const STREET_ZOOM_MAX = 12.6;

export interface Padding { top: number; right: number; bottom: number; left: number }
export interface TravelViewport {
  compact: boolean;
  /** How much of the canvas the desktop rail's feather covers. */
  feather?: number;
  /** The phone sheet's height, px (see sheetHeight). */
  sheet?: number;
}

export function chapterCentre(chapter: TravelChapter): [number, number] {
  if (chapter.places.length < 2) return leadOf(chapter);
  const lng = chapter.places.reduce((sum, place) => sum + place.lng, 0) / chapter.places.length;
  const lat = chapter.places.reduce((sum, place) => sum + place.lat, 0) / chapter.places.length;
  return [lng, lat];
}

/** One place: z7. Several: the zoom where the two furthest apart stand
 *  PLACES_APART_PX apart, held between z7 and street scale. */
export function landingZoom(chapter: TravelChapter) {
  if (chapter.places.length < 2) return PLACE_ZOOM;
  let far = 0;
  chapter.places.forEach((a, i) => chapter.places.slice(i + 1).forEach((b) => {
    far = Math.max(far, greatCircleKm([a.lng, a.lat], [b.lng, b.lat]));
  }));
  if (!(far > 0)) return PLACE_ZOOM;
  const lat = chapterCentre(chapter)[1];
  const zoom = Math.log2((EQUATOR_M * Math.cos((lat * Math.PI) / 180)) / (512 * ((far * 1000) / PLACES_APART_PX)));
  return Math.round(Math.min(STREET_ZOOM_MAX, Math.max(PLACE_ZOOM, zoom)) * 100) / 100;
}

/** Where a landed place sits: the centre of the map the visitor can see.
 *  On the desktop the rail's feather lies over the canvas's right edge; on
 *  the phone the sheet covers the bottom. */
export function landingPadding(viewport: TravelViewport): Padding {
  if (viewport.compact) return { top: 24, right: 24, bottom: Math.round((viewport.sheet ?? 78) + 16), left: 24 };
  return { top: 40, right: Math.round(40 + 0.7 * (viewport.feather ?? 80)), bottom: 40, left: 40 };
}

/** The one landing every path uses: a map mark, its name, an index row, a
 *  group, `?place=`, history and the phone list. */
export function landingCamera(chapter: TravelChapter, viewport: TravelViewport) {
  return {
    center: chapterCentre(chapter),
    zoom: landingZoom(chapter),
    padding: landingPadding(viewport),
    bearing: 0,
    pitch: 0,
  };
}

/** Screen position of a coordinate near the camera, DERIVED (Web Mercator,
 *  relative to the camera's own centre and padding) — for deciding what the
 *  map will look like where a flight is going, before it gets there. */
export function projectAround(
  lngLat: readonly [number, number],
  camera: { center: readonly [number, number]; zoom: number; padding: Padding },
  size: { width: number; height: number },
) {
  const worldPx = 512 * 2 ** camera.zoom;
  const mx = (lng: number) => ((lng + 180) / 360) * worldPx;
  const my = (lat: number) => {
    const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldPx;
  };
  const cx = camera.padding.left + (size.width - camera.padding.left - camera.padding.right) / 2;
  const cy = camera.padding.top + (size.height - camera.padding.top - camera.padding.bottom) / 2;
  return {
    x: cx + mx(lngLat[0]) - mx(camera.center[0]),
    y: cy + my(lngLat[1]) - my(camera.center[1]),
  };
}

// ── The phone sheet ──
export type SheetMode = 'peek' | 'browse' | 'detail';
/** The sheet's height — ONE rule for the CSS (78px / 48svh / 62svh, never
 *  closer than 72px to the top of the map) and for the camera that frames
 *  what the sheet leaves visible. */
export function sheetHeight(mode: SheetMode, viewportHeight: number, mapHeight: number) {
  if (mode === 'peek') return 78;
  const share = mode === 'detail' ? 0.62 : 0.48;
  return Math.round(Math.min(viewportHeight * share, Math.max(78, mapHeight - 72)));
}
