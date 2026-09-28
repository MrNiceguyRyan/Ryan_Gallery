// ── /travel: the atlas in silver ──
// The map page is the homepage's silver planet laid flat as a working atlas:
// the same satellite photograph printed through an olive-to-bone ramp, the
// same white ink for the route and the places, the index numbered the way the
// homepage numbers its chapters, and a chapter's ticket in its own stock.
//
// Everything here is pure — constants, the chapter data and the geometry the
// map and its index agree on — so scripts/travel-silver.test.mjs can hold it.
// MapboxMap owns the map instance and every write; nothing here reads the DOM,
// and nothing downstream measures a rect back.
import type { Collection } from '../types';
import { SILVER_MIX } from './globeLook';
import { fileRatio, pad2 } from './proofSheet';
import { stockPaper } from './ticketStock';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// ── The ground ──
// The homepage's print (globeLook SILVER_RAMP) runs to #e9e6d8 at the top;
// here the brightest desert stops one step below paper (#c1c0ae), so a white
// ring and a bone name always stand above the whitest rock.
export const TRAVEL_RAMP: Array<[number, string]> = [
  [0.0, '#1d2117'],
  [0.06, '#2a3023'],
  [0.14, '#363d2c'],
  [0.25, '#4a503b'],
  [0.4, '#626455'],
  [0.56, '#818171'],
  [0.72, '#9b9b8a'],
  [0.87, '#b0af9e'],
  [1.0, '#c1c0ae'],
];
/** The vector ground under the photograph: while tiles load, the map is a
 *  dark print, never a wireframe of landcover and roads. */
export const TRAVEL_GROUND = '#262b1f';
export const TRAVEL_SATELLITE = { source: 'travel-silver', layer: 'travel-silver', url: 'mapbox://mapbox.satellite' } as const;

/** `raster-color` for the print. A constant expression: zoom-driven raster
 *  paint is evaluated per tile on the draped globe and leaves seams. */
export function travelRamp(): unknown[] {
  return ['interpolate', ['linear'], ['raster-value'], ...TRAVEL_RAMP.flat()];
}

export function travelSatellitePaint(): Record<string, unknown> {
  return {
    'raster-color-mix': SILVER_MIX,
    'raster-color-range': [0, 1],
    'raster-color': travelRamp(),
    'raster-saturation': 0,
    'raster-contrast': 0,
    'raster-brightness-max': 1,
    'raster-fade-duration': 160,
    'raster-opacity': 1,
  };
}

/** A place is printed a stop down from the overview (the homepage atlas is
 *  darker at a place than on the globe). Written by the map's `zoom` event as
 *  plain numbers, quantised to 1/40 so a flight makes a dozen writes, never a
 *  zoom expression. 1 / 0 over the overview, 0.70 / 0.16 at a place. */
export function placeGrade(zoom: number) {
  const brightness = Math.round((1 - 0.3 * smoothstep(3.9, 6.4, zoom)) * 40) / 40;
  const contrast = Math.round(((1 - brightness) / 0.3) * 0.16 * 100) / 100;
  return { brightness, contrast };
}

/** Basemap layers the photograph replaces (roads, land cover and buildings
 *  are its job now) and the labels the atlas does not want. */
export const HIDDEN_LAYERS: ReadonlySet<string> = new Set([
  'national-park',
  'landuse',
  'waterway',
  'land-structure-polygon',
  'land-structure-line',
  'aeroway-polygon',
  'aeroway-line',
  'building',
  'road-label-simple',
  'waterway-label',
  'natural-line-label',
  'natural-point-label',
  'poi-label',
  'airport-label',
  'settlement-subdivision-label',
  'continent-label',
  'admin-1-boundary-bg',
  'admin-0-boundary-bg',
]);
const ROAD_FAMILY = /^(tunnel|road|bridge)-/;

/** Boundaries in bone: the nation strong enough to read the shape, the
 *  states a whisper. */
export const HAIRLINES: Record<string, Record<string, unknown>> = {
  'admin-0-boundary': { 'line-color': '#F4F4ED', 'line-opacity': 0.34, 'line-width': 0.75 },
  'admin-1-boundary': {
    'line-color': '#F4F4ED',
    'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.13, 6, 0.2],
    'line-width': 0.6,
  },
  'admin-0-boundary-disputed': { 'line-opacity': 0.2 },
};

/** The map says less than the archive. No basemap type at all below z5 (the
 *  overview is the archive's own six names); once the camera is down on a
 *  place, towns and states come up as context, a clear step below the
 *  page's labels. */
export const LABEL_PAINT = {
  'text-color': '#E6E4D6',
  'text-halo-color': 'rgba(24, 28, 20, 0.72)',
  'text-halo-width': 1,
  'text-halo-blur': 0.8,
} as const;
export const LABEL_OPACITY: Record<string, unknown> = {
  'country-label': ['interpolate', ['linear'], ['zoom'], 4.9, 0, 5.4, 0.3],
  'state-label': ['interpolate', ['linear'], ['zoom'], 4.9, 0, 5.4, 0.26],
  'settlement-major-label': ['interpolate', ['linear'], ['zoom'], 4.6, 0, 5.3, 0.62],
  'settlement-minor-label': ['interpolate', ['linear'], ['zoom'], 5.8, 0, 6.6, 0.5],
  'water-point-label': ['interpolate', ['linear'], ['zoom'], 4.9, 0, 5.4, 0.22],
  'water-line-label': ['interpolate', ['linear'], ['zoom'], 4.9, 0, 5.4, 0.2],
};
/** The context type's size, capped near the archive's own names (a mark's
 *  name is 9px caps under a 12px ordinal): Mapbox sets a town at 14–20px
 *  once the camera is down on a place, and "Union City" read before
 *  "06 New York". The towns keep their rank order, a step apart. */
export const LABEL_SIZE: Record<string, unknown> = {
  'country-label': ['interpolate', ['linear'], ['zoom'], 5, 10, 9, 11],
  'state-label': ['interpolate', ['linear'], ['zoom'], 5, 8.5, 9, 9.5],
  'settlement-major-label': ['interpolate', ['linear'], ['zoom'], 5, ['step', ['get', 'symbolrank'], 10.5, 9, 10], 12, ['step', ['get', 'symbolrank'], 11, 12, 10.5]],
  'settlement-minor-label': ['interpolate', ['linear'], ['zoom'], 6, ['step', ['get', 'symbolrank'], 10, 12, 9.5], 13, 10.5],
  'water-point-label': ['interpolate', ['linear'], ['zoom'], 5, 9.5, 12, 10.5],
  'water-line-label': ['interpolate', ['linear'], ['zoom'], 5, 9.5, 12, 10.5],
};
/** Below these zooms the context labels are not merely transparent but not
 *  there at all: Mapbox places every visible symbol layer on every frame of
 *  a flight whatever its opacity, and over the overview that placement was
 *  the flights' main cost (at 4× CPU, p95 33ms with it, 16.7ms without). */
export const LABEL_MINZOOM: Record<string, number> = {
  'country-label': 4.9,
  'state-label': 4.9,
  'settlement-major-label': 4.6,
  'settlement-minor-label': 5.8,
  'water-point-label': 4.9,
  'water-line-label': 4.9,
};

/** What the print does with each basemap layer: the ground and the water
 *  become the dark vector print under the photograph, the boundaries its
 *  bone hairlines, the listed labels its context type; every other fill, line
 *  and symbol (land cover, roads, buildings, POIs, shields) is hidden. */
export function groundRole(layer: { id: string; type: string }): 'hide' | 'ground' | 'water' | 'hairline' | 'label' | 'keep' {
  const { id, type } = layer;
  if (type === 'background') return 'ground';
  if (type === 'fill-extrusion' || HIDDEN_LAYERS.has(id) || ROAD_FAMILY.test(id)) return 'hide';
  if (type === 'fill') return id.includes('water') ? 'water' : 'hide';
  if (type === 'line') return id in HAIRLINES ? 'hairline' : 'hide';
  if (type === 'symbol') return id in LABEL_OPACITY ? 'label' : 'hide';
  return 'keep';
}

/** The air: a dark print's own horizon, no stars (the homepage's light draws
 *  the limb there; a flat atlas has none). */
export const TRAVEL_FOG = {
  color: 'rgb(38, 43, 31)',
  'high-color': 'rgb(40, 44, 32)',
  'horizon-blend': 0.04,
  'space-color': 'rgb(40, 44, 32)',
  'star-intensity': 0,
};

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
/** The route as drawn: one leg per consecutive chapter, lead to lead. */
export function routeKm(points: ReadonlyArray<readonly [number, number]>) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += greatCircleKm(points[i - 1], points[i]);
  return total;
}
/** Web-Mercator metres per CSS pixel at a zoom and latitude (512px tiles). */
export const metresPerPixel = (zoom: number, lat: number) =>
  (EQUATOR_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);

/** The scale collar's length: the largest 1 / 2 / 5 × 10ⁿ metres that fits. */
export function niceScale(maxMetres: number) {
  if (!(maxMetres >= 1)) return 1;
  const power = 10 ** Math.floor(Math.log10(maxMetres));
  return [5, 2, 1].map((step) => step * power).find((value) => value <= maxMetres) ?? power;
}
export const scaleLabel = (metres: number) =>
  (metres >= 1000 ? `${groupThousands(metres / 1000)} km` : `${metres} m`);

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

// ── The names on the map ──
export interface ScreenPoint { x: number; y: number }
/** Marks closer than GROUP_JOIN px share one callout; a callout comes apart
 *  only past GROUP_PART, so a hand zoom at the edge does not flutter. */
export const GROUP_JOIN = 58;
export const GROUP_PART = 74;

/** Which marks stand together, as sorted index lists (singles included).
 *  `previous` is the last answer, for the hysteresis. */
export function calloutGroups(points: readonly ScreenPoint[], previous: readonly number[][] | null = null) {
  const parent = points.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const together = (i: number, j: number) => !!previous?.some((group) => group.length > 1 && group.includes(i) && group.includes(j));
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (d < (together(i, j) ? GROUP_PART : GROUP_JOIN)) parent[find(i)] = find(j);
    }
  }
  const byRoot = new Map<number, number[]>();
  points.forEach((_, i) => {
    const root = find(i);
    byRoot.set(root, [...(byRoot.get(root) ?? []), i]);
  });
  return [...byRoot.values()].sort((a, b) => a[0] - b[0]);
}

export interface LabelPlacement {
  /** 'right' / 'left' of its own mark, or stacked in a group's callout. */
  mode: 'right' | 'left' | 'stack';
  /** The label box's left edge and vertical centre, from the mark's centre. */
  dx: number;
  dy: number;
  /** The dashed leader from the mark to a stacked label, mark-relative. */
  leader: { x1: number; y1: number; x2: number; y2: number } | null;
  /** A key shared by the members of one callout. */
  group: string | null;
}

/** How much further out, and up or down, a callout's stack may be set to
 *  keep its names off the route, in order of preference. */
const STACK_OUT = [0, 24, 48, 72] as const;
const STACK_SHIFT = [0, -11, 11, -22, 22, -33, 33] as const;

export const LABEL = {
  /** A name starts this far from its mark's centre: clear of the selected
   *  mark's 21px ring. */
  gap: 17,
  /** A callout's names stand this far out from the group's outermost mark… */
  stackGap: 40,
  /** …one under another at this step. */
  step: 22,
  /** A name keeps this far from the canvas edge. */
  edge: 24,
  /** A neighbour this close to the right, this level, sends a name left. */
  crowdX: 160,
  crowdY: 22,
} as const;

/** Whether a straight run from `a` to `b` passes through a box (clipped
 *  against it, Liang–Barsky). */
function segmentCrossesBox(a: ScreenPoint, b: ScreenPoint, box: { x0: number; x1: number; y0: number; y1: number }) {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, a.x - box.x0) && clip(dx, box.x1 - a.x) && clip(-dy, a.y - box.y0) && clip(dy, box.y1 - a.y);
}

/** Whether any leg of the route (screen polylines) runs through a box. */
export function legsCross(legs: ReadonlyArray<ReadonlyArray<ScreenPoint>>, box: { x0: number; x1: number; y0: number; y1: number }) {
  return legs.some((leg) => leg.some((point, index) => index > 0 && segmentCrossesBox(leg[index - 1], point, box)));
}

/** Where each mark's name is set: beside its mark (right unless the edge or
 *  a neighbour is there), or, for marks standing together, stacked beside the
 *  group in screen order with a leader back to each mark. `widths` are the
 *  labels' own widths, measured in their own face. `legs` are the route's
 *  legs in screen px: a name keeps off them where it can (the route is
 *  canvas under the DOM names, and a dashed leg through a name read as one
 *  tangle with the callout's dashed leaders). */
export function placeLabels(
  points: readonly ScreenPoint[],
  groups: readonly number[][],
  widths: readonly number[],
  canvasWidth: number,
  legs: ReadonlyArray<ReadonlyArray<ScreenPoint>> = [],
): LabelPlacement[] {
  const out: LabelPlacement[] = points.map(() => ({ mode: 'right', dx: LABEL.gap, dy: 0, leader: null, group: null }));
  // Every label box set so far, and every mark, in screen px: a single name
  // takes the side that clears them (a callout's stack is set first).
  const taken: Array<{ x0: number; x1: number; y0: number; y1: number }> = points.map((p) => ({ x0: p.x - 6, x1: p.x + 6, y0: p.y - 6, y1: p.y + 6 }));
  const HALF = 8;
  const AIR = 10;
  const hits = (box: { x0: number; x1: number; y0: number; y1: number }, own: number) =>
    taken.some((other, k) => k !== own && box.x1 > other.x0 && box.x0 < other.x1 && box.y1 > other.y0 && box.y0 < other.y1);
  const singles: number[] = [];
  groups.forEach((group) => {
    if (group.length === 1) {
      singles.push(group[0]);
      return;
    }
    const key = group.join('-');
    const sorted = [...group].sort((a, b) => points[a].y - points[b].y);
    const minX = Math.min(...group.map((i) => points[i].x));
    const maxX = Math.max(...group.map((i) => points[i].x));
    const centre = group.reduce((sum, i) => sum + points[i].y, 0) / group.length;
    const widest = Math.max(...group.map((i) => widths[i] ?? 80));
    const leftFits = minX - LABEL.stackGap - widest >= LABEL.edge / 2;
    const rightFits = maxX + LABEL.stackGap + widest <= canvasWidth - LABEL.edge / 2;
    // The side that fits (left first), set level with the group; if a leg
    // of the route runs through the stack there, the same side a little
    // further out and up or down (the legs leaving a group part as they go),
    // then the other side if it fits — the first that no leg crosses, else
    // the one fewest names are crossed on. A stack moved off the level keeps
    // out of the room the other marks' names need: every other mark, and a
    // lone mark's name on the side it would take (on the phone, pushed out to
    // clear a leg, the Southwest's names ran into New York's).
    const sides = leftFits ? (rightFits ? [false, true] : [false]) : [true];
    const room = points.flatMap((p, j) => {
      if (group.includes(j)) return [];
      const mark = { x0: p.x - 6, x1: p.x + 6, y0: p.y - 6, y1: p.y + 6 };
      if (!groups.some((other) => other.length === 1 && other[0] === j)) return [mark];
      const w = widths[j] ?? 80;
      const left = p.x + LABEL.gap + w > canvasWidth - LABEL.edge;
      const x0 = left ? p.x - LABEL.gap - w : p.x + LABEL.gap;
      return [mark, { x0: x0 - AIR, x1: x0 + w + AIR, y0: p.y - HALF, y1: p.y + HALF }];
    });
    const overlaps = (a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }) =>
      a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1;
    const stackAt = (toRight: boolean, further: number, shift: number) => {
      const x0 = toRight ? maxX + LABEL.stackGap + further : minX - LABEL.stackGap - further;
      const cy = centre + shift;
      return sorted.map((i, k) => {
        const w = widths[i] ?? 80;
        const ly = cy + (k - (sorted.length - 1) / 2) * LABEL.step;
        const left = toRight ? x0 : x0 - w;
        return { x0: left - 3, x1: left + w + 3, y0: ly - HALF, y1: ly + HALF };
      });
    };
    let choice: [boolean, number, number] = [sides[0], 0, 0];
    let fewest = Infinity;
    const fits = (toRight: boolean, further: number) => (toRight
      ? maxX + LABEL.stackGap + further + widest <= canvasWidth - LABEL.edge / 2
      : minX - LABEL.stackGap - further - widest >= LABEL.edge / 2);
    search: for (const side of sides) {
      for (const further of STACK_OUT) {
        if (further > 0 && !fits(side, further)) break;
        for (const shift of STACK_SHIFT) {
          const boxes = stackAt(side, further, shift);
          const level = side === sides[0] && further === 0 && shift === 0;
          if (!level && boxes.some((box) => room.some((other) => overlaps(box, other)))) continue;
          const crossed = boxes.filter((box) => legsCross(legs, box)).length;
          if (crossed < fewest) {
            fewest = crossed;
            choice = [side, further, shift];
            if (crossed === 0) break search;
          }
        }
      }
    }
    const [toRight, further, shift] = choice;
    const x0 = toRight ? maxX + LABEL.stackGap + further : minX - LABEL.stackGap - further;
    const cy = centre + shift;
    sorted.forEach((i, k) => {
      const p = points[i];
      const w = widths[i] ?? 80;
      const ly = cy + (k - (sorted.length - 1) / 2) * LABEL.step;
      const ex = toRight ? x0 - 4 : x0 + 4;
      const vx = ex - p.x;
      const vy = ly - p.y;
      const d = Math.hypot(vx, vy) || 1;
      out[i] = {
        mode: 'stack',
        dx: Math.round(((toRight ? x0 : x0 - w) - p.x) * 10) / 10,
        dy: Math.round((ly - p.y) * 10) / 10,
        leader: {
          x1: Math.round((vx / d) * 6 * 10) / 10,
          y1: Math.round((vy / d) * 6 * 10) / 10,
          x2: Math.round(vx * 10) / 10,
          y2: Math.round(vy * 10) / 10,
        },
        group: key,
      };
      taken.push({ x0: p.x + out[i].dx, x1: p.x + out[i].dx + w, y0: ly - HALF, y1: ly + HALF });
    });
  });
  singles.forEach((i) => {
    const p = points[i];
    const w = widths[i] ?? 80;
    const crowded = points.some((q, j) => j !== i && q.x > p.x && q.x - p.x < LABEL.crowdX && Math.abs(q.y - p.y) < LABEL.crowdY);
    const clipsRight = p.x + LABEL.gap + w > canvasWidth - LABEL.edge;
    const clipsLeft = p.x - LABEL.gap - w < LABEL.edge;
    // A name reads as one with a neighbour's when they share a line with
    // less than a word space between them, so boxes keep AIR apart.
    const box = (left: boolean, dy: number) => ({
      x0: (left ? p.x - LABEL.gap - w : p.x + LABEL.gap) - AIR,
      x1: (left ? p.x - LABEL.gap : p.x + LABEL.gap + w) + AIR,
      y0: p.y + dy - HALF,
      y1: p.y + dy + HALF,
    });
    const preferLeft = (clipsRight || crowded) && !clipsLeft;
    // The preferred side; the other side if it is on the canvas; then the
    // preferred side a line above or below the mark. The first that runs
    // into no name and no mark already set is the one.
    const candidates: Array<[boolean, number]> = [[preferLeft, 0]];
    if (!(preferLeft ? clipsRight : clipsLeft)) candidates.push([!preferLeft, 0]);
    candidates.push([preferLeft, -LABEL.step * 0.75], [preferLeft, LABEL.step * 0.75]);
    const clear = (side: boolean, shift: number) => {
      const b = box(side, shift);
      return !hits(b, -1) && !legsCross(legs, { x0: b.x0 + AIR - 3, x1: b.x1 - AIR + 3, y0: b.y0, y1: b.y1 });
    };
    const [left, dy] = candidates.find(([side, shift]) => clear(side, shift))
      ?? candidates.find(([side, shift]) => !hits(box(side, shift), -1))
      ?? candidates[0];
    out[i] = { mode: left ? 'left' : 'right', dx: left ? -(LABEL.gap + w) : LABEL.gap, dy, leader: null, group: null };
    taken.push(box(left, dy));
  });
  return out;
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
