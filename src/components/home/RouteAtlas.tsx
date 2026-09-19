import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, Marker, Source } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import {
  AnimatePresence,
  animate,
  cancelFrame,
  cubicBezier,
  frame,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
  type Process,
} from 'framer-motion';
import { getMapboxToken } from '../../config/mapbox';
import { AfPoint, AtlasViewfinder, PrologueCard, prologueCardSrc, type ViewfinderHandle, type ViewfinderPlace } from './AtlasSign';
import { isAtlasInterfaceReady, scheduleAtlasIdleFallback } from '../../lib/atlasReadiness';
import { ARCHIVE_ENTRANCE_PHASES, entrancePhase } from '../../lib/archiveEntrance';
import {
  angularDistance,
  greatCirclePoint,
  routeCoordinates,
  type GeoCoordinate,
} from '../../lib/routeGeometry';

export interface RouteStop {
  id: string;
  name: string;
  slug: string;
  coordinates: [number, number];
  imageUrl: string;
  /** The chapter's cover (portrait); `imageUrl` prefers a landscape frame. */
  coverImageUrl?: string;
  frameCount: number;
  year?: number | string;
  locationLabel?: string;
  /** State or region, shown on the place's signboard. */
  region?: string;
  coordinateLabel: string;
}

/** A click on the index or the rail: the page scrolls to `chapterId` over
 *  `duration` ms and the camera goes straight there. */
export interface AtlasVoyage {
  chapterId: string;
  duration: number;
  token: number;
}

interface Props {
  stops: RouteStop[];
  activeIndex: number;
  /** Fractional index in `chapterIds` order, not necessarily the filtered stops. */
  chapterProgress?: MotionValue<number>;
  /** Full ordered chapter IDs; stops without valid coordinates are skipped by ID. */
  chapterIds?: string[];
  /** Optional 0–1 handoff from the opener into the classic atlas. */
  entryProgress?: MotionValue<number>;
  /** Desktop globe prologue, 0–1: the atlas map is the lit globe behind the
   *  homepage's opening statements until the archive entrance takes over. */
  prologueProgress?: MotionValue<number>;
  reducedMotion: boolean;
  mobile?: boolean;
  paused?: boolean;
  presentation?: 'classic' | 'living';
  /** Select a stop in the classic rail and move focus to its chapter. */
  onNavigate?: (chapterId: string) => void;
  /** Temporarily links a desktop classic photograph to its map and rail stop
   *  (the globe's point in the prologue, the AF point's ring in the archive). */
  engagedChapterId?: string | null;
  /** The trip a click set in motion, or null once the page has landed. */
  voyage?: AtlasVoyage | null;
}

interface ProjectedPoint {
  id?: string;
  x: number;
  y: number;
}

interface ChapterRouteStop {
  stop: RouteStop;
  stopIndex: number;
  chapterIndex: number;
  routeProgress: number;
}

interface ChapterSample {
  position: number;
  from: ChapterRouteStop;
  to: ChapterRouteStop;
  localProgress: number;
  easedProgress: number;
  coordinate: GeoCoordinate;
  routeProgress: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const ACCENT = '#D2FF00';
// Marks drawn on the map itself are white ink — the photograph carries the
// colour; lime stays in the interface around it. Casings are a dark burn.
const MAP_INK = '#FFFFFF';
const MAP_BURN = '#0B0E09';
// The fixed chapter camera: oblique enough for the standing signs to read as
// planted in the map, north kept nearly straight up.
const CHAPTER_PITCH = 46;
const CHAPTER_BEARING = -2;

// ── Chapter hops ──
// Once the archive is entered, scroll no longer drags the camera along the
// route. It only decides which place is current; each change plays one short,
// time-based flight (after 11 mois sans toi(t)): lift off, pull back far
// enough to see the whole leg, set down on the next place. The map rests while
// a place's cover is read. Pitch and bearing never change — only distance.
const HOP = {
  // Commit hysteresis in route-leg units: forward at 32% of the way to the
  // next place (so the map lands about as the next cover arrives), back at
  // 22% (−0.78); the 1.1 total keeps small reversals from fluttering.
  forward: 0.32,
  back: 0.78,
  // Before a commit the map is not frozen: it pre-rolls with the scroll,
  // drifting up to this share of the leg (capped in pixels) toward the next
  // place and easing out a touch, so the camera answers the hand at once.
  prerollShare: 0.08,
  prerollMaxPx: 70,
  prerollZoom: 0.12,
  // Rest zoom: close enough that neighbouring places sit ≥150px apart (the
  // Utah canyons), never tighter than zoom 6.
  restZoom: 5.05,
  restZoomMax: 6,
  restSpacingPx: 150,
  // Duration grows with the log of the distance: 0.95 s hops to 1.75 s crossings.
  durationBase: 850,
  durationRange: 1000,
  nearDegrees: 1.2,
  farDegrees: 40,
  continueFloor: 700,
  // The apex pulls back until the whole leg spans this share of the clear
  // stage between the route rail and the covers.
  // Flight path shape (van Wijk & Nuij): a bigger rho climbs higher for the
  // same leg. 1.42 is Mapbox's flyTo default; this rises a good deal more,
  // so the ground crosses the stage at the apex without racing.
  rho: 2.1,
  // The least a flight climbs, so even a neighbouring place is a hop.
  minLift: 0.32,
  // Rendered pose chases the flight with this time constant (11 mois: 0.12
  // per frame), which rounds retargets and adds a short settle.
  followMs: 110,
  // The travelled line reaches the destination this early in the flight.
  routeShare: 0.42,
  // AF points: the place being left gets its point back this long after
  // take-off (the destination's hides when the viewfinder locks).
  unplantDelay: 120,
  // The viewfinder locks when the rendered camera is this close to the place
  // (screen pixels): focus confirms on arrival, never while the map still
  // slides the last stretch. It needs its 110 ms snap before that moment.
  lockPx: 14,
  lockSnapMs: 110,
  // After the camera effect (re)starts, commits snap rather than fly, and the
  // snapped place reaches the AF points once things have been still this long.
  restartSnapMs: 900,
  // When a voyage is cut short, its time-driven entry eases onto the scroll's.
  voyageBlendMs: 320,
  settleStateMs: 120,
} as const;
// Take-off gathers speed over the first third; the landing is firm rather
// than a long creep — the follow smoothing rounds off the last few pixels.
const hopLaunchEase = cubicBezier(0.4, 0.05, 0.2, 1);
const hopContinueEase = cubicBezier(0.3, 0.45, 0.15, 1);

function mercatorLatitudeDegrees(latitude: number) {
  const clamped = Math.max(-85, Math.min(85, latitude));
  return (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
}

/** Straight-line distance on the Web Mercator plane, in degrees of longitude. */
function mercatorDegrees(from: GeoCoordinate, to: GeoCoordinate) {
  return Math.hypot(
    to[0] - from[0],
    mercatorLatitudeDegrees(to[1]) - mercatorLatitudeDegrees(from[1]),
  );
}

function pixelsAtZoom(degrees: number, zoom: number) {
  return (degrees * 512 * 2 ** zoom) / 360;
}

function mercatorLatitudeFromDegrees(y: number) {
  return (360 / Math.PI) * Math.atan(Math.exp((y * Math.PI) / 180)) - 90;
}

/** A point `u` of the way from `from` to `to` in Mercator pixel space — the
 *  straight line the map itself draws between them. */
function mercatorLerp(from: GeoCoordinate, to: GeoCoordinate, u: number): GeoCoordinate {
  const y0 = mercatorLatitudeDegrees(from[1]);
  const y1 = mercatorLatitudeDegrees(to[1]);
  return [from[0] + (to[0] - from[0]) * u, mercatorLatitudeFromDegrees(y0 + (y1 - y0) * u)];
}

/**
 * The "smooth and efficient" zoom-and-pan path of van Wijk & Nuij (2003), as
 * Mapbox's flyTo uses it: the camera climbs, glides and descends so that the
 * ground appears to move at a constant speed throughout, instead of racing at
 * the apex and creeping in to land. `w0` is the visible span at the start (in
 * pixels), `u1` the distance to cover at the start zoom, `w1` the span at the
 * destination zoom. `at(s)` for s in [0, 1] gives the fraction of the way
 * travelled and the zoom change from the start.
 */
interface FlightPath {
  at: (s: number) => { u: number; dz: number };
  /** Zoom levels the path climbs above the start, at its highest. */
  lift: number;
}
function flightPath(w0: number, w1: number, u1: number, rho: number): FlightPath {
  const rho2 = rho * rho;
  if (!(u1 > 1e-6)) {
    // Same place, different height: a straight zoom.
    const dz = Math.log2(w0 / w1);
    return { at: (s) => ({ u: 0, dz: dz * s }), lift: Math.max(0, -dz) };
  }
  const r = (i: number) => {
    const b = (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho2 * rho2 * u1 * u1) / (2 * (i ? w1 : w0) * rho2 * u1);
    return Math.log(Math.sqrt(b * b + 1) - b);
  };
  const r0 = r(0);
  const S = (r(1) - r0) / rho;
  if (!Number.isFinite(S) || S <= 0) {
    const dz = Math.log2(w0 / w1);
    return { at: (s) => ({ u: s, dz: dz * s }), lift: Math.max(0, -dz) };
  }
  const coshR0 = Math.cosh(r0);
  const sinhR0 = Math.sinh(r0);
  const at = (s: number) => {
    const k = r0 + rho * S * clamp01(s);
    const w = coshR0 / Math.cosh(k);
    const u = (w0 * (coshR0 * Math.tanh(k) - sinhR0)) / rho2 / u1;
    return { u: clamp01(u), dz: Math.log2(1 / w) };
  };
  // The path is highest where cosh is smallest, at k = 0 — if it gets there.
  const apexAt = -r0 / (rho * S);
  const lift = apexAt > 0 && apexAt < 1 ? Math.log2(coshR0) : Math.max(0, -at(1).dz, 0);
  return { at, lift };
}

function hopRestZooms(route: Array<{ stop: { coordinates: GeoCoordinate } }>) {
  return route.map((entry, index) => {
    let nearest = Number.POSITIVE_INFINITY;
    route.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      nearest = Math.min(nearest, pixelsAtZoom(mercatorDegrees(entry.stop.coordinates, other.stop.coordinates), HOP.restZoom));
    });
    if (!Number.isFinite(nearest) || nearest <= 0) return HOP.restZoom;
    return Math.max(HOP.restZoom, Math.min(HOP.restZoomMax, HOP.restZoom + Math.log2(HOP.restSpacingPx / nearest)));
  });
}
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';
const US_OVERVIEW = { longitude: -97.7, latitude: 38.3, zoom: 3.15, bearing: -3, pitch: 0 };
const LIVING_OVERVIEW = { longitude: -98.5, latitude: 37.5, zoom: 4.05, bearing: 0, pitch: 0 };
const CLASSIC_INTERFACE_STAGGER = 0.025;
const CLASSIC_INTERFACE_ACCESSIBLE_ENTRY = ARCHIVE_ENTRANCE_PHASES.interface[0] +
  CLASSIC_INTERFACE_STAGGER +
  (ARCHIVE_ENTRANCE_PHASES.interface[1] - ARCHIVE_ENTRANCE_PHASES.interface[0]) * 0.62;

function lineFeature(coordinates: [number, number][]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates },
  };
}

function encodePolyline(coordinates: [number, number][]) {
  let previousLatitude = 0;
  let previousLongitude = 0;
  let encoded = '';

  const encodeValue = (value: number) => {
    let shifted = value < 0 ? ~(value << 1) : value << 1;
    let result = '';
    while (shifted >= 0x20) {
      result += String.fromCharCode((0x20 | (shifted & 0x1f)) + 63);
      shifted >>= 5;
    }
    return result + String.fromCharCode(shifted + 63);
  };

  coordinates.forEach(([longitude, latitude]) => {
    const nextLatitude = Math.round(latitude * 1e5);
    const nextLongitude = Math.round(longitude * 1e5);
    encoded += encodeValue(nextLatitude - previousLatitude);
    encoded += encodeValue(nextLongitude - previousLongitude);
    previousLatitude = nextLatitude;
    previousLongitude = nextLongitude;
  });
  return encoded;
}

function staticAtlasUrl(coordinates: [number, number][], token: string, mobile: boolean) {
  if (!token || coordinates.length < 2) return '';
  const route = encodeURIComponent(encodePolyline(coordinates));
  const camera = mobile ? '-98.5,37.5,2.75,0' : '-98.5,37.5,4.05,0';
  const size = mobile ? '960x960@2x' : '1280x720@2x';
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/path-3+ffffff-0.92(${route})/${camera}/${size}?access_token=${encodeURIComponent(token)}`;
}

function graticuleFeature() {
  const coordinates: [number, number][][] = [];
  for (let longitude = -130; longitude <= -60; longitude += 10) {
    coordinates.push([
      [longitude, 20],
      [longitude, 60],
    ]);
  }
  for (let latitude = 20; latitude <= 60; latitude += 10) {
    coordinates.push([
      [-130, latitude],
      [-60, latitude],
    ]);
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'MultiLineString' as const, coordinates },
  };
}

const NORTH_AMERICA_GRATICULE = graticuleFeature();

const smootherstep = (progress: number) =>
  progress * progress * progress * (progress * (progress * 6 - 15) + 10);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// ── Globe opening (after 11 mois sans toi(t)) ──
// The desktop archive entrance starts on a whole globe over the Pacific, turns
// it to North America, then dives into the first chapter. Mapbox's globe is
// pure Mercator from zoom 6 up, so the dive overshoots to GLOBE_HANDOFF_ZOOM,
// swaps the projection there — where both render identically — and settles
// back to the chapter camera. Scroll-owned and reversible like the rest of the
// entrance; reduced motion keeps the flat Mercator entrance.
const GLOBE_START_ZOOM = 1.9;
const GLOBE_TURN_DEGREES = 108;
const GLOBE_START_LATITUDE = 21;
// The globe runs on the raw entrance score rather than the flat camera's
// eased phase: that phase spends its first half while the map is still fading
// in, which would hide the turn. Inside the window below, the shares are:
// turning, diving to the handoff zoom, and settling back out in Mercator.
const GLOBE_ENTRY_WINDOW = [0.06, 0.92] as const;
const GLOBE_TURN_END = 0.5;
const GLOBE_DIVE_START = 0.32;
const GLOBE_HANDOFF_AT = 0.84;
const GLOBE_HANDOFF_ZOOM = 6.05;
const GLOBE_FOG = {
  range: [9, 20] as [number, number],
  color: '#1B2319',
  'high-color': '#3b4330',
  'space-color': '#282c20',
  'horizon-blend': 0.09,
  'star-intensity': 0,
};

// The prologue globe carries a brighter limb, the halo 11 mois draws with two
// white drop-shadows — here the atmosphere itself, a neutral paper white.
const PROLOGUE_FOG = {
  range: [9, 20] as [number, number],
  color: 'rgba(244, 244, 237, 0.55)',
  'high-color': 'rgba(214, 217, 208, 0.34)',
  'space-color': '#282c20',
  'horizon-blend': 0.035,
  'star-intensity': 0,
};

function globeEntryProgress(entry: number) {
  const [start, end] = GLOBE_ENTRY_WINDOW;
  return clamp01((entry - start) / (end - start));
}

// With the prologue in front of it, the globe has already been turned to North
// America by the time the entrance begins, so the entrance only descends.
const PROLOGUE_GLOBE = {
  turnDegrees: 0,
  startZoom: 2.25,
  // Where the prologue keeps the globe: its centre low on the right, most of
  // the disc off-screen, big enough to read as a planet rather than a map.
  centerX: 0.84,
  centerY: 0.93,
  zoom: 2.78,
  // Degrees the globe turns across the prologue (11 mois: 90° per viewport).
  spin: 210,
  startLatitude: 9,
  // The stretch of the prologue spent gliding from the corner to the atlas
  // focus — finished before the index (which sits on the right) is read.
  glideStart: 0.5,
  glideEnd: 0.8,
  // The load-in: the globe spins into place and grows from a smaller disc.
  introSpin: 150,
  introZoom: 0.62,
  // Axial tilt while it sits in the corner; straightens during the glide.
  tilt: -14,
  // Left alone, the globe keeps turning — easing toward `driftMax` degrees
  // over roughly `driftTau` ms — and leans a few degrees toward the cursor.
  driftMax: 30,
  driftTau: 12000,
  pointerLongitude: 5,
  pointerLatitude: 3,
  // Drift and cursor fold back to zero across this stretch, so the glide and
  // the dive always start from the exact scroll-owned pose.
  lifeFade: [0.28, 0.5] as [number, number],
} as const;
// The map canvas bleeds this far past the atlas column on every side
// (`-inset-8`), and the atlas focal point is the centre of the canvas once
// this padding is taken off its top and right.
const CANVAS_BLEED = 32;
const FOCAL_PADDING = { top: 48, right: 264 } as const;
// How big the globe looks on screen. Its limb radius is not simply
// proportional to 2^zoom: Mapbox draws it in perspective, so
//   r = k · R · D / (D + R),  R = radiusAtZoom0 · 2^zoom,  D = depth · canvas height
// (fitted against measured limbs at three canvas sizes; within 0.3%). The
// index step inverts this to make the planet exactly fill the space beside
// the index column.
const PLANET_FIT = { radiusAtZoom0: 81.277, k: 1.428, depth: 1.0228, minZoom: 1.2, maxZoom: 2.6 };
const PLANET_MARGIN = 48;
function planetZoomFor(limbRadius: number, canvasHeight: number) {
  const depth = PLANET_FIT.depth * canvasHeight;
  const radius = (limbRadius * depth) / (PLANET_FIT.k * depth - limbRadius);
  if (!(radius > 0)) return PLANET_FIT.minZoom;
  return Math.min(PLANET_FIT.maxZoom, Math.max(PLANET_FIT.minZoom, Math.log2(radius / PLANET_FIT.radiusAtZoom0)));
}
const PROLOGUE_SATELLITE_FADE: [number, number] = [3.3, 4.5];
// After the dive the photography does not vanish: it stays under the graded
// atlas at this strength, so chapters keep a little real ground.
const PROLOGUE_SATELLITE_RESIDUAL = 0.3;

interface GlobeMode {
  turnDegrees: number;
  startZoom: number;
  /** Where the globe was left when the prologue handed over; the entrance
   *  turns from here to the target instead of starting on the target. */
  startLongitude?: number;
}
const FLAT_ENTRY_GLOBE: GlobeMode = { turnDegrees: GLOBE_TURN_DEGREES, startZoom: GLOBE_START_ZOOM };

function globeStartCenter(target: GeoCoordinate, mode: GlobeMode = FLAT_ENTRY_GLOBE): GeoCoordinate {
  return [mode.startLongitude ?? target[0] - mode.turnDegrees, GLOBE_START_LATITUDE];
}

function globeEntryPose(
  target: { coordinate: GeoCoordinate; zoom: number; pitch: number; bearing: number },
  progress: number,
  mode: GlobeMode = FLAT_ENTRY_GLOBE,
) {
  const turn = smootherstep(clamp01(progress / GLOBE_TURN_END));
  const start = globeStartCenter(target.coordinate, mode);
  const center: GeoCoordinate = [
    start[0] + (target.coordinate[0] - start[0]) * turn,
    start[1] + (target.coordinate[1] - start[1]) * turn,
  ];
  const turningZoom = mode.startZoom + 0.5 * turn;
  const dive = clamp01((progress - GLOBE_DIVE_START) / (GLOBE_HANDOFF_AT - GLOBE_DIVE_START));
  const diveEase = dive * dive * (3 - 2 * dive);
  const settle = smootherstep(clamp01((progress - GLOBE_HANDOFF_AT) / (1 - GLOBE_HANDOFF_AT)));
  const divedZoom = turningZoom + (GLOBE_HANDOFF_ZOOM - turningZoom) * diveEase;
  const zoom = divedZoom + (target.zoom - divedZoom) * settle;
  const pose = diveEase * 0.72 + settle * 0.28;
  return {
    center,
    zoom,
    pitch: target.pitch * pose,
    bearing: target.bearing * pose,
    globe: progress < GLOBE_HANDOFF_AT,
  };
}

function isValidCoordinate(coordinates: unknown): coordinates is GeoCoordinate {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return false;
  const [longitude, latitude] = coordinates;
  return Number.isFinite(longitude) && Number.isFinite(latitude) &&
    longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

function buildChapterRoute(stops: RouteStop[], chapterIds?: string[]) {
  const orderedIds = chapterIds?.length ? chapterIds : stops.map((stop) => stop.id);
  const chapterIndexById = new Map<string, number>();
  orderedIds.forEach((id, index) => {
    if (id && !chapterIndexById.has(id)) chapterIndexById.set(id, index);
  });

  const seenIds = new Set<string>();
  const seenChapterIndices = new Set<number>();
  const route = stops.flatMap((stop, stopIndex) => {
    const chapterIndex = chapterIndexById.get(stop.id);
    if (
      chapterIndex == null ||
      !stop.id ||
      seenIds.has(stop.id) ||
      seenChapterIndices.has(chapterIndex) ||
      !isValidCoordinate(stop.coordinates)
    ) return [];
    seenIds.add(stop.id);
    seenChapterIndices.add(chapterIndex);
    return [{ stop, stopIndex, chapterIndex }];
  }).sort((a, b) => a.chapterIndex - b.chapterIndex);

  if (!route.length) return [];
  const segmentLengths = route.slice(1).map((entry, index) =>
    angularDistance(route[index].stop.coordinates, entry.stop.coordinates),
  );
  const total = segmentLengths.reduce((sum, length) => sum + length, 0);
  let travelled = 0;
  return route.map<ChapterRouteStop>((entry, index) => {
    if (index > 0) travelled += segmentLengths[index - 1];
    return {
      ...entry,
      routeProgress: total > 0 ? travelled / total : index / Math.max(1, route.length - 1),
    };
  });
}

/** One authoritative optical sample for camera, route, names, coordinates and markers. */
function sampleChapter(
  route: ChapterRouteStop[],
  chapterPosition: number,
  reducedMotion: boolean,
): ChapterSample | null {
  if (!route.length) return null;
  const first = route[0];
  const last = route.at(-1)!;
  const finitePosition = Number.isFinite(chapterPosition) ? chapterPosition : first.chapterIndex;
  const position = Math.max(first.chapterIndex, Math.min(last.chapterIndex, finitePosition));

  let from = first;
  let to = first;
  for (let index = 1; index < route.length; index += 1) {
    to = route[index];
    if (position <= to.chapterIndex) break;
    from = to;
  }
  if (position >= last.chapterIndex) from = to = last;

  const span = Math.max(1, to.chapterIndex - from.chapterIndex);
  const rawLocal = from === to ? 0 : clamp01((position - from.chapterIndex) / span);
  if (reducedMotion) {
    const snapped = rawLocal < 0.5 ? from : to;
    return {
      position: snapped.chapterIndex,
      from: snapped,
      to: snapped,
      localProgress: 0,
      easedProgress: 0,
      coordinate: snapped.stop.coordinates,
      routeProgress: snapped.routeProgress,
      zoom: 4.72,
      pitch: 0,
      bearing: -2,
    };
  }

  // Keep photographic emphasis soft, but let geography retain most of the
  // direct scroll velocity. Applying the full quintic curve to the camera made
  // every leg stick at both cities and then rush through its midpoint.
  const easedProgress = smootherstep(rawLocal);
  const travelProgress = rawLocal * 0.86 + easedProgress * 0.14;
  const distance = angularDistance(from.stop.coordinates, to.stop.coordinates);
  const distanceZoomOut = Math.min(0.68, (distance / 0.55) * 0.68);
  // One continuous optical breath replaces the old departure plateau/arrival
  // plateau pair. It is symmetric, reversible and has no hidden flat section.
  const lift = Math.sin(Math.PI * rawLocal);
  const travelLift = lift * lift;
  // Once zoomed in, the camera angle holds still between places: one oblique,
  // north-up pose for every chapter and every leg. Only the distance breathes
  // (the mid-leg zoom-out); the pitch and bearing no longer swing per leg.
  return {
    position,
    from,
    to,
    localProgress: rawLocal,
    easedProgress,
    coordinate: greatCirclePoint(from.stop.coordinates, to.stop.coordinates, travelProgress),
    routeProgress: from.routeProgress + (to.routeProgress - from.routeProgress) * travelProgress,
    zoom: 5.05 - travelLift * distanceZoomOut,
    pitch: CHAPTER_PITCH,
    bearing: CHAPTER_BEARING,
  };
}

function chapterWeight(sample: ChapterSample | null, stopId: string) {
  if (!sample) return 0;
  if (sample.from.stop.id === sample.to.stop.id) return sample.from.stop.id === stopId ? 1 : 0;
  if (sample.from.stop.id === stopId) return 1 - sample.easedProgress;
  if (sample.to.stop.id === stopId) return sample.easedProgress;
  return 0;
}

function stopVisualState(sample: ChapterSample | null, entry: ChapterRouteStop) {
  const focus = chapterWeight(sample, entry.stop.id);
  let passed = 0;
  if (sample) {
    if (entry.chapterIndex < sample.from.chapterIndex) passed = 1;
    else if (entry.stop.id === sample.from.stop.id && sample.from !== sample.to) {
      passed = sample.easedProgress;
    }
  }
  return { focus, accent: Math.max(focus, passed * 0.32) };
}

function useRouteStopLighting(sample: MotionValue<ChapterSample | null>, entry: ChapterRouteStop) {
  const state = useTransform(sample, (current) => stopVisualState(current, entry));
  const focus = useTransform(state, (current) => current.focus);
  const accent = useTransform(state, (current) => current.accent);
  return { focus, accent };
}

function useFocusLockProgress(focusLocked: boolean, reducedMotion: boolean) {
  const progress = useMotionValue(focusLocked ? 1 : 0);

  useEffect(() => {
    const target = focusLocked ? 1 : 0;
    if (reducedMotion) {
      progress.set(target);
      return;
    }
    const controls = animate(progress, target, {
      duration: target ? 0.28 : 0.42,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [focusLocked, progress, reducedMotion]);

  return progress;
}

const projectedPointsMatch = (current: ProjectedPoint[], next: ProjectedPoint[]) =>
  current.length === next.length && current.every((point, index) => {
    const candidate = next[index];
    return candidate !== undefined &&
      point.id === candidate.id &&
      Math.abs(point.x - candidate.x) < 0.05 &&
      Math.abs(point.y - candidate.y) < 0.05;
  });

function formatCoordinate(value: number, positive: string, negative: string) {
  const normalized = Math.abs(value) < 0.00005 ? 0 : value;
  return `${Math.abs(normalized).toFixed(4)}° ${normalized >= 0 ? positive : negative}`;
}

function formatCoordinateLabel([longitude, latitude]: [number, number]) {
  return `${formatCoordinate(latitude, 'N', 'S')}  ·  ${formatCoordinate(longitude, 'E', 'W')}`;
}

function ScrubbedCoordinateReadout({ sample }: { sample: MotionValue<ChapterSample | null> }) {
  const latitudeRef = useRef<HTMLSpanElement>(null);
  const longitudeRef = useRef<HTMLSpanElement>(null);
  const write = (next: ChapterSample | null) => {
    if (!next) return;
    const [longitude, latitude] = next.coordinate;
    if (latitudeRef.current) latitudeRef.current.textContent = formatCoordinate(latitude, 'N', 'S');
    if (longitudeRef.current) longitudeRef.current.textContent = formatCoordinate(longitude, 'E', 'W');
  };

  useMotionValueEvent(sample, 'change', write);
  useEffect(() => write(sample.get()), [sample]);

  const [longitude, latitude] = sample.get()?.coordinate ?? [US_OVERVIEW.longitude, US_OVERVIEW.latitude];
  return (
    <span
      aria-hidden="true"
      className="mx-auto inline-grid grid-cols-[10.5ch_auto_11.5ch] items-center gap-2 whitespace-nowrap tabular-nums"
    >
      <span ref={latitudeRef} className="text-right">{formatCoordinate(latitude, 'N', 'S')}</span>
      <span aria-hidden="true">·</span>
      <span ref={longitudeRef} className="text-left">{formatCoordinate(longitude, 'E', 'W')}</span>
    </span>
  );
}

function ScrubbedPlaceName({
  stop,
  sample,
}: {
  stop: RouteStop;
  sample: MotionValue<ChapterSample | null>;
}) {
  const opacity = useTransform(sample, (current) => chapterWeight(current, stop.id));
  const y = useTransform(sample, (current) => {
    if (!current) return 0;
    if (current.to.stop.id === stop.id) return (1 - current.easedProgress) * 3;
    if (current.from.stop.id === stop.id) return current.easedProgress * -3;
    return 0;
  });
  return (
    <motion.span className="absolute inset-0 block whitespace-nowrap" style={{ opacity, y }}>
      {stop.name}
    </motion.span>
  );
}

function ScrubbedRouteStop({
  entry,
  index,
  sample,
  semanticActive,
  mobile,
  onNavigate,
  focusLocked,
  reducedMotion,
}: {
  entry: ChapterRouteStop;
  index: number;
  sample: MotionValue<ChapterSample | null>;
  semanticActive: boolean;
  mobile: boolean;
  onNavigate?: (chapterId: string) => void;
  focusLocked: boolean;
  reducedMotion: boolean;
}) {
  // The rail reads the same lighting state as the scrubbed camera,
  // including routes that bridge chapters without coordinates. Hysteresis is
  // retained only for the semantic announcement, never for visual brightness.
  const { focus, accent } = useRouteStopLighting(sample, entry);
  const focusLockProgress = useFocusLockProgress(focusLocked, reducedMotion);
  const visualFocus = useTransform(
    [focus, focusLockProgress],
    ([chapterFocus, lock]) => clamp01(chapterFocus + (1 - chapterFocus) * lock * 0.34),
  );
  const dotScale = useTransform(focus, [0, 1], [0.92, 1.08]);
  const dotBorderColor = useTransform(
    [accent, focusLockProgress],
    ([strength, lock]) => `rgba(210, 255, 0, ${0.24 + clamp01(strength + lock * 0.2) * 0.76})`,
  );
  const dotCoreScale = useTransform(focus, [0, 1], [0.62, 1]);
  const labelOpacity = useTransform(
    visualFocus,
    (strength) => mobile ? strength : 0.5 + strength * 0.5,
  );
  const labelX = useTransform(focus, [0, 1], [-2, 0]);
  const labelColor = useTransform(visualFocus, (strength) => {
    const red = Math.round(244 + (210 - 244) * strength);
    const green = Math.round(244 + (255 - 244) * strength);
    const blue = Math.round(237 + (0 - 237) * strength);
    return `rgba(${red}, ${green}, ${blue}, ${0.68 + strength * 0.32})`;
  });

  return (
    <motion.button
      type="button"
      onClick={() => onNavigate?.(entry.stop.id)}
      disabled={!onNavigate}
      aria-current={semanticActive ? 'step' : undefined}
      aria-label={`Go to ${entry.stop.name} story`}
      data-route-rail-stop={entry.stop.id}
      data-route-focus-locked={focusLocked ? 'true' : undefined}
      className={`route-atlas-stop relative flex w-full items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00] disabled:cursor-default ${mobile ? 'py-2' : 'py-3.5'}`}
    >
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-2 inset-y-1 bg-[linear-gradient(90deg,rgba(210,255,0,0.075),rgba(210,255,0,0.018)_48%,transparent_88%)]"
        style={{ opacity: focusLockProgress }}
      />
      <motion.span
        aria-hidden="true"
        className="relative z-10 h-[15px] w-[15px] shrink-0 rounded-full border bg-[#171a15]"
        style={{ scale: dotScale, borderColor: dotBorderColor }}
      >
        <motion.span
          className="absolute inset-[4px] rounded-full bg-[#D2FF00]"
          data-route-accent="true"
          style={{ opacity: accent, scale: dotCoreScale }}
        />
        <motion.span
          className="absolute inset-[5px] rounded-full bg-[#F0F3DF]"
          data-route-focus="true"
          style={{ opacity: focus }}
        />
      </motion.span>
      <motion.span
        className="min-w-0"
        style={{ opacity: labelOpacity, x: labelX, color: labelColor }}
      >
        <span className="block font-ui text-[10px] uppercase tracking-[0.2em]">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="mt-1 block truncate font-ui text-[11px] uppercase tracking-[0.22em]">
          {entry.stop.name}
        </span>
      </motion.span>
    </motion.button>
  );
}

function ScrubbedRouteOrdinal({
  sample,
  route,
  includeTotal = false,
  className,
}: {
  sample: MotionValue<ChapterSample | null>;
  route: ChapterRouteStop[];
  includeTotal?: boolean;
  className?: string;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const formatValue = (current: ChapterSample | null) => {
    if (!current || !route.length) {
      return includeTotal ? `00 / ${String(route.length).padStart(2, '0')}` : '00';
    }
    const visualStop = current.from.stop.id === current.to.stop.id || current.easedProgress < 0.5
      ? current.from
      : current.to;
    const routeIndex = route.findIndex((entry) => entry.stop.id === visualStop.stop.id);
    const ordinal = routeIndex >= 0 ? String(routeIndex + 1).padStart(2, '0') : '00';
    return includeTotal ? `${ordinal} / ${String(route.length).padStart(2, '0')}` : ordinal;
  };
  const write = (current: ChapterSample | null) => {
    if (valueRef.current) valueRef.current.textContent = formatValue(current);
  };

  useMotionValueEvent(sample, 'change', write);
  useEffect(() => write(sample.get()), [sample, route, includeTotal]);

  return (
    <span ref={valueRef} className={className}>
      {formatValue(sample.get())}
    </span>
  );
}

function LivingMarkerNode({
  stop,
  index,
  stops,
  chapterProgress,
  interfaceVisible,
  reducedMotion,
  mobile,
  playInterfaceIntro,
}: {
  stop: RouteStop;
  index: number;
  stops: RouteStop[];
  chapterProgress: MotionValue<number>;
  interfaceVisible: boolean;
  reducedMotion: boolean;
  mobile: boolean;
  playInterfaceIntro: boolean;
}) {
  const emphasis = useTransform(chapterProgress, (chapterPosition) => {
    const distance = Math.abs(chapterPosition - index);
    return smootherstep(Math.max(0, Math.min(1, 1 - distance)));
  });
  const passed = useTransform(chapterProgress, (chapterPosition) =>
    smootherstep(Math.max(0, Math.min(1, chapterPosition - index))),
  );
  const accentStrength = useTransform([emphasis, passed], ([emphasisValue, passedValue]) =>
    Math.max(emphasisValue, passedValue * 0.42),
  );
  const haloOpacity = useTransform(emphasis, [0, 1], [0, 1]);
  const haloScale = useTransform(emphasis, [0, 1], [0.7, 1]);
  const ringOpacity = useTransform(emphasis, [0, 0.15, 1], [0, 0.1, 0.58]);
  const ringScale = useTransform(emphasis, [0, 1], [0.76, 1.08]);
  const dotScale = useTransform(emphasis, [0, 1], [1, 1.4]);
  const dotBorderColor = useTransform(
    accentStrength,
    (strength) => `rgba(210, 255, 0, ${0.25 + strength * 0.75})`,
  );
  const dotBackgroundColor = useTransform(
    accentStrength,
    (strength) => `rgba(210, 255, 0, ${0.035 + strength * 0.965})`,
  );
  const dotShadow = useTransform(
    emphasis,
    (strength) => `0 0 ${2 + strength * 12}px rgba(210, 255, 0, ${strength * 0.86})`,
  );
  const labelOpacity = useTransform(
    emphasis,
    (strength) => mobile ? strength : 0.56 + strength * 0.44,
  );
  const labelOffset = useTransform(emphasis, (strength) => (1 - strength) * 3);
  const labelColor = useTransform(
    emphasis,
    (strength) => `rgba(244, 244, 237, ${0.58 + strength * 0.42})`,
  );
  const indexColor = useTransform(
    emphasis,
    (strength) => `rgba(210, 255, 0, ${0.48 + strength * 0.52})`,
  );
  const nearbyStops = stops
    .filter((candidate) => angularDistance(candidate.coordinates, stop.coordinates) < 0.038)
    .sort((a, b) => b.coordinates[1] - a.coordinates[1]);
  const clusterRank = nearbyStops.findIndex((candidate) => candidate.id === stop.id);
  const clusterOffset = !mobile && nearbyStops.length > 1
    ? Math.max(-54, Math.min(54, (clusterRank - (nearbyStops.length - 1) / 2) * 36))
    : 0;
  const labelOnLeft =
    (stop.coordinates[0] > -90 && (mobile || stop.coordinates[1] > 35)) ||
    (!mobile && nearbyStops.length > 1 && clusterRank === 0);
  const labelX = useTransform(labelOffset, (offset) => labelOnLeft ? -offset : offset);

  return (
    <motion.span
      aria-hidden="true"
      data-route-stop={stop.id}
      initial={false}
      animate={interfaceVisible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.72 }}
      transition={{
        duration: reducedMotion ? 0 : playInterfaceIntro ? 0.56 : 0.32,
        delay: reducedMotion || !playInterfaceIntro ? 0 : 0.18 + index * 0.035,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="relative flex h-11 w-11 items-center justify-center"
    >
      <motion.span
        className="pointer-events-none absolute h-16 w-16 rounded-full bg-[radial-gradient(circle,rgba(210,255,0,0.16)_0%,rgba(210,255,0,0.055)_34%,transparent_72%)] blur-[2px]"
        style={{ opacity: haloOpacity, scale: haloScale }}
      />
      {!reducedMotion && (
        <motion.span
          className="absolute h-12 w-12 rounded-full border border-[#D2FF00]/45"
          style={{ opacity: ringOpacity, scale: ringScale }}
        />
      )}
      <motion.span
        className="relative block h-2.5 w-2.5 rounded-full border"
        style={{
          scale: dotScale,
          borderColor: dotBorderColor,
          backgroundColor: dotBackgroundColor,
          boxShadow: dotShadow,
        }}
      />
      {interfaceVisible && (
        <motion.span
          style={{
            top: `calc(50% + ${clusterOffset}px)`,
            opacity: labelOpacity,
            x: labelX,
            color: labelColor,
          }}
          className={`pointer-events-none absolute top-1/2 min-w-max -translate-y-1/2 whitespace-nowrap font-ui text-[10px] uppercase tracking-[0.2em] ${labelOnLeft ? 'right-[2.15rem] text-right' : 'left-[2.15rem]'}`}
        >
          <motion.span className="mr-[10px] inline-block text-[8px]" style={{ color: indexColor }}>
            {String(index + 1).padStart(2, '0')}
          </motion.span>
          {stop.name}
        </motion.span>
      )}
    </motion.span>
  );
}

export default function RouteAtlas({
  stops,
  activeIndex,
  chapterProgress,
  chapterIds,
  entryProgress,
  prologueProgress,
  reducedMotion,
  mobile = false,
  paused = false,
  presentation = 'classic',
  onNavigate,
  engagedChapterId = null,
  voyage = null,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const routeAtlasRef = useRef<HTMLElement>(null);
  const classicMapFrameRef = useRef<Process | null>(null);
  const interfaceIntroPlayedRef = useRef(false);
  const viewportWidthRef = useRef(0);
  const cameraSyncedRef = useRef(false);
  const mapboxToken = getMapboxToken();
  const resolvedIndex = activeIndex >= 0 && activeIndex < stops.length ? activeIndex : -1;
  const living = presentation === 'living';
  const classicEntrance = !living && !mobile && !!entryProgress;
  const classicGlobe = classicEntrance && !reducedMotion;
  const prologue = classicGlobe && !!prologueProgress;
  // How far past the atlas column's right edge the map canvas reaches. During
  // the prologue the globe sits in the viewport's bottom-right corner, over the
  // (still empty) cover column; afterwards that strip is masked back to page.
  const [canvasExtension, setCanvasExtension] = useState(0);
  // A voyage's time-driven entry progress (−1 when none): the interface fades
  // in with the dive, not with the scroll that outruns it.
  const voyageEntry = useMotionValue(-1);
  const voyageRef = useRef<AtlasVoyage | null>(voyage);
  const voyageHandlerRef = useRef<((next: AtlasVoyage | null) => void) | null>(null);
  useEffect(() => {
    voyageRef.current = voyage;
    voyageHandlerRef.current?.(voyage);
  }, [voyage]);
  // Zoom at which the prologue globe is a whole planet beside the index; the
  // glide lands on it and the entrance dives from it.
  const [planetZoom, setPlanetZoom] = useState<number>(PROLOGUE_GLOBE.startZoom);
  const globeMode = useMemo<GlobeMode>(
    () => (prologue ? { ...PROLOGUE_GLOBE, startZoom: planetZoom } : FLAT_ENTRY_GLOBE),
    [planetZoom, prologue],
  );
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapSettled, setMapSettled] = useState(false);
  const [mapCameraSynced, setMapCameraSynced] = useState(false);
  const [mapIdleFallback, setMapIdleFallback] = useState(false);
  const [mapLoadDelayed, setMapLoadDelayed] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const [mapEligible, setMapEligible] = useState(false);
  const [atlasEngaged, setAtlasEngaged] = useState(reducedMotion);
  const [interfaceInFrame, setInterfaceInFrame] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [projectedStops, setProjectedStops] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const [projectedRoute, setProjectedRoute] = useState<Array<{ x: number; y: number }>>([]);

  const chapterRoute = useMemo(() => buildChapterRoute(stops, chapterIds), [chapterIds, stops]);
  const mappedStops = useMemo(() => chapterRoute.map((entry) => entry.stop), [chapterRoute]);
  const activeRouteEntry = resolvedIndex >= 0
    ? chapterRoute.find((entry) => entry.stopIndex === resolvedIndex)
    : undefined;
  const activeStop = activeRouteEntry?.stop;
  const activeStopRef = useRef<RouteStop | undefined>(activeStop);
  const activeChapterPosition = activeRouteEntry?.chapterIndex ?? chapterRoute[0]?.chapterIndex ?? 0;
  const fallbackChapterProgress = useMotionValue(activeChapterPosition);
  const fallbackEntryProgress = useMotionValue(1);
  const resolvedChapterProgress = chapterProgress ?? fallbackChapterProgress;
  const resolvedEntryProgress = entryProgress ?? fallbackEntryProgress;
  const chapterSample = useTransform(
    resolvedChapterProgress,
    (position) => sampleChapter(chapterRoute, position, reducedMotion),
  );
  // ── Signs ── a camera viewfinder names the current place; inactive AF
  // points mark the others. With chapter hops the draw loop's hop controller
  // drives it (hunt from take-off, lock at touchdown). In scrubbed mode
  // (reduced motion) it simply settles on the place nearest the camera.
  const signs = !living && !mobile;
  const hopEnabled = signs && classicEntrance && !reducedMotion && !!chapterProgress;
  const chapterRestZooms = useMemo(() => hopRestZooms(chapterRoute), [chapterRoute]);
  const viewfinderRef = useRef<ViewfinderHandle>(null);
  const viewfinderPlace = (index: number): ViewfinderPlace | null => {
    const entry = chapterRoute[index];
    if (!entry) return null;
    return {
      id: entry.stop.id,
      name: entry.stop.name,
      number: entry.chapterIndex + 1,
      total: chapterRoute.length,
      year: entry.stop.year,
      frames: entry.stop.frameCount,
      region: entry.stop.region,
      coordinates: entry.stop.coordinates,
    };
  };
  const nearestStopIndex = (sample: ChapterSample | null) => {
    if (!sample) return 0;
    const index = chapterRoute.indexOf(sample.localProgress < 0.5 ? sample.from : sample.to);
    return index < 0 ? 0 : index;
  };
  const [initialViewfinderPlace] = useState(() => viewfinderPlace(nearestStopIndex(chapterSample.get())));
  // The place whose AF point has collapsed to a focus point because the
  // viewfinder is locked on it.
  // Toggled on the marker elements directly: a React state change here would
  // re-render the whole atlas in the middle of a flight.
  const currentStopRef = useRef<string | null>(initialViewfinderPlace?.id ?? null);
  const markCurrentStop = (id: string | null) => {
    currentStopRef.current = id;
    routeAtlasRef.current?.querySelectorAll<HTMLElement>('[data-af-stop]').forEach((element) => {
      element.classList.toggle('is-current', element.dataset.afStop === id);
    });
  };
  // Scrubbed mode: follow the nearest place. chapterSample can re-emit while
  // this component renders (its transformer is rebuilt each render), so the
  // state write is ref-guarded and deferred to a microtask.
  useEffect(() => {
    if (!signs || hopEnabled) return;
    let disposed = false;
    const update = (sample: ChapterSample | null) => {
      const place = viewfinderPlace(nearestStopIndex(sample));
      if (!place || place.id === currentStopRef.current) return;
      viewfinderRef.current?.settle(place);
      queueMicrotask(() => {
        if (!disposed) markCurrentStop(place.id);
      });
    };
    update(chapterSample.get());
    const unsubscribe = chapterSample.on('change', update);
    return () => {
      disposed = true;
      unsubscribe();
    };
    // viewfinderPlace/nearestStopIndex only read chapterRoute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterRoute, chapterSample, hopEnabled, signs]);
  // The draw loop owns the travelled line's trim. The JSX only seeds it with a
  // value fixed at mount: a per-render value would be diffed and re-applied by
  // react-map-gl on unrelated re-renders, behind the draw loop's back.
  const [initialRouteTrim] = useState<[number, number]>(() => [chapterSample.get()?.routeProgress ?? 0, 1]);
  // The committed place survives camera-effect restarts (Story close, resize),
  // so a restart re-applies hysteresis from it instead of re-deriving it.
  const committedPlaceRef = useRef<number | null>(null);

  const livingTravelProgress = useTransform(
    chapterSample,
    (sample) => sample?.routeProgress ?? 0,
  );
  const railCompletion = useTransform(chapterSample, (sample) => {
    if (!sample || chapterRoute.length < 2) return 0;
    const fromIndex = chapterRoute.findIndex((entry) => entry.stop.id === sample.from.stop.id);
    const toIndex = chapterRoute.findIndex((entry) => entry.stop.id === sample.to.stop.id);
    if (fromIndex < 0 || toIndex < 0) return 0;
    return clamp01(
      (fromIndex + (toIndex - fromIndex) * sample.easedProgress) /
      Math.max(1, chapterRoute.length - 1),
    );
  });
  const sampledEntryProgress = useTransform(
    resolvedEntryProgress,
    (progress) => reducedMotion ? (progress < 0.5 ? 0 : 1) : clamp01(progress),
  );
  // Geography develops first, then its camera and surface settle together.
  // Every value is reversible and remains attached to the shared scroll score.
  const classicMapEntry = useTransform(sampledEntryProgress, (progress) =>
    classicEntrance ? entrancePhase(progress, ...ARCHIVE_ENTRANCE_PHASES.map) : progress,
  );
  const classicEntryOpacity = useTransform(sampledEntryProgress, (progress) =>
    classicEntrance
      ? entrancePhase(progress, ...ARCHIVE_ENTRANCE_PHASES.mapVisibility)
      : clamp01((progress - 0.02) / 0.36),
  );
  const classicEntryScale = useTransform(classicMapEntry, (progress) =>
    1 + (classicEntrance ? 0.035 : 0.006) * (1 - progress),
  );
  const classicEntryY = useTransform(classicMapEntry, (progress) =>
    (classicEntrance ? 28 : 18) * (1 - progress),
  );
  const classicEntryVeilOpacity = useTransform(sampledEntryProgress, (progress) =>
    prologue
      ? 0
      : classicEntrance
        ? 1 - entrancePhase(progress, ...ARCHIVE_ENTRANCE_PHASES.mapVisibility)
        : 1 - clamp01(progress / 0.96),
  );
  // The atlas's own framing — right-edge tone, vignette, top dissolve and the
  // strip under the cover column — returns as the globe dives into the archive.
  const archiveFrameOpacity = useTransform(sampledEntryProgress, (progress) =>
    prologue ? entrancePhase(progress, 0.06, 0.42) : 1,
  );
  const fallbackPrologueProgress = useMotionValue(1);
  const resolvedPrologueProgress = prologueProgress ?? fallbackPrologueProgress;
  // The globe's load-in, played once when the map first appears at the top of
  // the page (1 → 0). Held at 0 when the page opens mid-scroll.
  const globeIntro = useMotionValue(0);

  useEffect(() => {
    activeStopRef.current = activeStop;
  }, [activeStop]);

  const fullRouteCoordinates = useMemo(() => routeCoordinates(mappedStops), [mappedStops]);
  const fullRoute = useMemo(() => lineFeature(fullRouteCoordinates), [fullRouteCoordinates]);
  // The index hover: that place's cover, pinned to its point on the globe —
  // only while the globe is the prologue's (cover hovers in the archive set
  // the same id, and there the AF point's ring answers instead).
  const [prologueStage, setPrologueStage] = useState(() => prologue && resolvedPrologueProgress.get() < 1);
  useMotionValueEvent(resolvedPrologueProgress, 'change', (progress) => {
    const next = prologue && progress < 1;
    setPrologueStage((current) => (current === next ? current : next));
  });
  const engagedEntry = prologueStage && engagedChapterId
    ? chapterRoute.find((entry) => entry.stop.id === engagedChapterId)
    : undefined;
  useEffect(() => {
    if (!prologue || !mapLoaded) return;
    // Warm the six small covers so the first hover shows a picture, not a load.
    mappedStops.forEach((stop) => {
      const base = stop.coverImageUrl || stop.imageUrl;
      if (!base) return;
      const image = new Image();
      image.src = prologueCardSrc(base);
    });
  }, [mapLoaded, mappedStops, prologue]);
  const prologueStops = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: mappedStops.map((stop) => ({
      type: 'Feature' as const,
      properties: { id: stop.id },
      geometry: { type: 'Point' as const, coordinates: stop.coordinates },
    })),
  }), [mappedStops]);
  const staticMapUrl = useMemo(
    () => living ? '' : staticAtlasUrl(fullRouteCoordinates, mapboxToken, mobile),
    [fullRouteCoordinates, living, mapboxToken, mobile],
  );
  const projectedRoutePath = useMemo(
    () => projectedRoute
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' '),
    [projectedRoute],
  );
  const routeBounds = useMemo(() => {
    const longitudes = mappedStops.map((stop) => stop.coordinates[0]);
    const latitudes = mappedStops.map((stop) => stop.coordinates[1]);
    if (!longitudes.length || !latitudes.length) {
      return [[-125, 24], [-66, 50]] as [[number, number], [number, number]];
    }
    return [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ] as [[number, number], [number, number]];
  }, [mappedStops]);

  useEffect(() => {
    if (chapterProgress) return;
    if (!living || reducedMotion) {
      fallbackChapterProgress.set(activeChapterPosition);
      return;
    }
    const controls = animate(fallbackChapterProgress, activeChapterPosition, {
      duration: mobile ? 0.62 : 0.74,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [activeChapterPosition, chapterProgress, fallbackChapterProgress, living, mobile, reducedMotion]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = () => setViewportReady(mobile ? !query.matches : query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [mobile]);

  useEffect(() => {
    if (!living || !mapLoaded) {
      setProjectedStops([]);
      setProjectedRoute([]);
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map) return;
    const update = () => {
      const nextStops = mappedStops.map((stop) => {
        const point = map.project(stop.coordinates);
        return { id: stop.id, x: point.x, y: point.y };
      });
      const nextRoute = fullRouteCoordinates.map((coordinate) => {
        const point = map.project(coordinate);
        return { x: point.x, y: point.y };
      });
      setProjectedStops((current) => projectedPointsMatch(current, nextStops) ? current : nextStops);
      setProjectedRoute((current) => projectedPointsMatch(current, nextRoute) ? current : nextRoute);
    };
    update();
    map.on('load', update);
    map.on('resize', update);
    map.on('moveend', update);
    map.on('idle', update);
    return () => {
      map.off('load', update);
      map.off('resize', update);
      map.off('moveend', update);
      map.off('idle', update);
    };
  }, [fullRouteCoordinates, living, mapLoaded, mappedStops]);

  useEffect(() => {
    let frame = 0;
    viewportWidthRef.current = window.innerWidth;
    const resize = () => {
      const nextWidth = window.innerWidth;
      // Mobile browser chrome frequently changes only the visual viewport
      // height while scrolling. The Living Atlas uses a stable svh stage, so
      // resizing WebGL and re-projecting every marker for those events is both
      // unnecessary and a major source of touch-scroll hitching.
      if (living && Math.abs(nextWidth - viewportWidthRef.current) < 1) return;
      viewportWidthRef.current = nextWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        mapRef.current?.resize();
        setLayoutRevision((current) => current + 1);
      });
    };
    window.addEventListener('resize', resize, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [living]);

  // The globe spins into place the first time it appears — only when the page
  // is at its top; a restored mid-page visit sees the globe already settled.
  const globeIntroPlayedRef = useRef(false);
  useEffect(() => {
    if (!prologue || globeIntroPlayedRef.current) return;
    if (!mapCameraSynced) {
      if (resolvedPrologueProgress.get() < 0.02) globeIntro.set(1);
      return;
    }
    globeIntroPlayedRef.current = true;
    if (globeIntro.get() <= 0) return;
    const controls = animate(globeIntro, 0, { duration: 2.4, ease: [0.16, 1, 0.3, 1] });
    return () => {
      controls.stop();
      globeIntro.set(0);
    };
  }, [globeIntro, mapCameraSynced, prologue, resolvedPrologueProgress]);

  useLayoutEffect(() => {
    if (!prologue) {
      setCanvasExtension(0);
      return;
    }
    const atlas = routeAtlasRef.current;
    if (!atlas) return;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const rect = atlas.getBoundingClientRect();
    const extension = Math.max(0, Math.round(viewportWidth - rect.right));
    setCanvasExtension((current) => (current === extension ? current : extension));
    // Size the index-step planet: a whole disc on the focal point, as large
    // as the left margin, the index column and the viewport's top and bottom
    // allow. The index nav sits to the right (GlobePrologue's #archive-index).
    const canvasHeight = rect.height + 2 * CANVAS_BLEED;
    const focalX = rect.left - CANVAS_BLEED + (rect.width + 2 * CANVAS_BLEED - FOCAL_PADDING.right) / 2;
    const focalY = rect.top - CANVAS_BLEED + FOCAL_PADDING.top + (canvasHeight - FOCAL_PADDING.top) / 2;
    const indexLeft = document.getElementById('archive-index')?.getBoundingClientRect().left ?? viewportWidth * 0.56;
    const limb = Math.min(
      indexLeft - PLANET_MARGIN - focalX,
      focalX - PLANET_MARGIN,
      focalY - 2 * PLANET_MARGIN,
      viewportHeight - PLANET_MARGIN - focalY,
    );
    const zoom = planetZoomFor(limb, canvasHeight);
    setPlanetZoom((current) => (Math.abs(current - zoom) < 0.002 ? current : zoom));
  }, [layoutRevision, prologue, viewportReady]);

  // Mapbox is the heaviest homepage dependency. HomePage first imports this
  // module near the atlas; this tighter second gate waits to create WebGL until
  // the section is almost visible, keeping map startup away from the opener's
  // card-to-page handoff.
  useEffect(() => {
    if (!viewportReady || mapEligible) return;
    const atlas = routeAtlasRef.current;
    if (!atlas || typeof IntersectionObserver === 'undefined') {
      setMapEligible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setMapEligible(true);
        observer.disconnect();
      },
      { rootMargin: mobile ? '80px 0px' : '140px 0px', threshold: 0 },
    );
    observer.observe(atlas);
    return () => observer.disconnect();
  }, [mapEligible, mobile, viewportReady]);

  useEffect(() => {
    if (!mapEligible || mapLoaded) {
      setMapLoadDelayed(false);
      return;
    }
    const timeout = window.setTimeout(() => setMapLoadDelayed(true), 15000);
    return () => window.clearTimeout(timeout);
  }, [mapEligible, mapLoaded]);

  // Preloading and engagement are intentionally separate. The WebGL canvas can
  // warm up just outside the viewport, but the camera, route and interface wait
  // until the atlas occupies a meaningful part of the screen. Engagement is
  // reversible: scrolling back to the index restores the page-coloured veil
  // instead of leaving an already-revealed map cutting into the handoff.
  useEffect(() => {
    if (!viewportReady) return;
    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      setAtlasEngaged(true);
      return;
    }
    const atlas = routeAtlasRef.current;
    if (!atlas) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setAtlasEngaged((current) => {
          const enterThreshold = mobile ? 0.10 : 0.08;
          const exitThreshold = mobile ? 0.05 : 0.04;
          const threshold = current ? exitThreshold : enterThreshold;
          const next = !!entry?.isIntersecting && entry.intersectionRatio >= threshold;
          return current === next ? current : next;
        });
      },
      {
        threshold: [0, 0.04, 0.05, 0.08, 0.10, 0.5, 1],
        rootMargin: '0px',
      },
    );
    observer.observe(atlas);
    return () => observer.disconnect();
  }, [mobile, reducedMotion, viewportReady]);

  // Keep the atlas chrome out of the opening seam and fade it before the
  // sticky map unpins at the end. This prevents the route rail from sliding
  // underneath the fixed Ryan Xu navigation.
  useEffect(() => {
    if (!viewportReady) return;
    const atlas = routeAtlasRef.current;
    if (!atlas || typeof IntersectionObserver === 'undefined') {
      setInterfaceInFrame(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInterfaceInFrame((current) => {
          const enterThreshold = mobile ? 0.80 : 0.78;
          const exitThreshold = mobile ? 0.66 : 0.64;
          const threshold = current ? exitThreshold : enterThreshold;
          const next = !!entry?.isIntersecting && entry.intersectionRatio >= threshold;
          return current === next ? current : next;
        });
      },
      { threshold: [0, 0.5, 0.64, 0.66, 0.78, 0.80, 1] },
    );
    observer.observe(atlas);
    return () => observer.disconnect();
  }, [mobile, viewportReady]);

  // Living Atlas retains its one stable overview; its HTML/SVG layer owns the
  // chapter interpolation. Classic has a separate scroll sampler below.
  useEffect(() => {
    if (!living || !mapLoaded || !atlasEngaged || paused || activeStop) return;
    const map = mapRef.current;
    map?.stop();
    map?.fitBounds(routeBounds, {
      padding: mobile
        ? { top: 240, right: 18, bottom: 174, left: 18 }
        : { top: 88, right: 62, bottom: 64, left: 238 },
      maxZoom: mobile ? 2.85 : 4.05,
      bearing: 0,
      pitch: 0,
      duration: reducedMotion ? 0 : mobile ? 820 : 1150,
      essential: !reducedMotion,
    });
  }, [activeStop, atlasEngaged, living, mapLoaded, mobile, paused, reducedMotion, routeBounds]);

  // Classic map motion is one render-free scroll transaction. Camera, route,
  // labels and waypoints read the same ChapterSample. We coalesce to one latest
  // value in Motion's render phase, after the shared sample and waypoint
  // strengths resolve in preRender, without queuing a second browser frame.
  useEffect(() => {
    if (classicMapFrameRef.current) cancelFrame(classicMapFrameRef.current);
    classicMapFrameRef.current = null;
    if (living) return;
    if (!mapLoaded || !atlasEngaged || paused) {
      mapRef.current?.stop();
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map) return;
    let disposed = false;
    let queuedSample = chapterSample.get();
    let queuedEntry = sampledEntryProgress.get();
    let padded: boolean | null = null;
    let lastOverview = false;
    let lastCoordinate: GeoCoordinate | null = null;
    let lastZoom = Number.NaN;
    let lastPitch = Number.NaN;
    let lastBearing = Number.NaN;
    let lastRouteProgress = Number.NaN;
    // Mirrors the live projection; starts on the globe when the opening does.
    let onGlobe = classicGlobe && map.getProjection?.()?.name === 'globe';
    let queuedPrologue = resolvedPrologueProgress.get();
    // Prologue "life": idle drift and cursor lean, advanced by a small rAF
    // loop below that only runs while the globe sits in the corner.
    let drift = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let lastBearingKey = Number.NaN;
    let lastPrologueRoute = Number.NaN;
    let prologuePaddingKey = '';
    // The longitude the prologue globe was on when it handed over to the
    // entrance, so a voyage to a later chapter turns from there.
    let handoffLongitude = Number.NaN;
    const entryMode: GlobeMode = { ...globeMode };
    // The canvas reaches past the atlas column by `canvasExtension`; widening
    // the right padding by the same amount keeps every chapter's focal point
    // exactly where it was before the canvas grew.
    const activePadding = { top: FOCAL_PADDING.top, right: FOCAL_PADDING.right + (prologue ? canvasExtension : 0), bottom: 0, left: 0 };
    const neutralPadding = { top: 0, right: 0, bottom: 0, left: 0 };
    // Measured once per layout (this effect re-runs on layoutRevision), never
    // per frame: the canvas box in viewport pixels, for placing the prologue
    // globe by screen position.
    const canvasBox = prologue ? map.getContainer().getBoundingClientRect() : null;

    // ── Chapter hop controller (see HOP) ──
    const lastRouteIndex = Math.max(0, chapterRoute.length - 1);
    const routePosition = (sample: ChapterSample | null) => {
      if (!sample) return 0;
      const fromIndex = chapterRoute.indexOf(sample.from);
      const toIndex = chapterRoute.indexOf(sample.to);
      if (fromIndex < 0) return 0;
      if (toIndex < 0 || toIndex === fromIndex) return fromIndex;
      return fromIndex + (toIndex - fromIndex) * sample.localProgress;
    };
    const restCenter = (index: number): GeoCoordinate => chapterRoute[index]?.stop.coordinates ?? [US_OVERVIEW.longitude, US_OVERVIEW.latitude];
    const restZoom = (index: number) => chapterRestZooms[index] ?? HOP.restZoom;
    const restRoute = (index: number) => chapterRoute[index]?.routeProgress ?? 0;
    // ── Voyage (see AtlasVoyage) ──
    // From the globe the trip is one dive driven by the voyage's own clock:
    // the scroll's entry progress would finish long before the page lands.
    // Inside the archive it is one flight. Places passed on the way are never
    // committed; when the trip ends (or is cut short) the state reconciles
    // with wherever the scroll is.
    let voyageState: { index: number; start: number; duration: number; dive: boolean; from: number } | null = null;
    let entryBlend: { from: number; start: number } | null = null;
    // Sine in-out: its fastest stretch is only ~1.6× the average, so the dive
    // (which the entry curve already concentrates mid-way) never blinks past.
    const voyageEase = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
    const drivenEntry = (now: number) => {
      if (!voyageState || !voyageState.dive) return null;
      const t = clamp01((now - voyageState.start) / voyageState.duration);
      return voyageState.from + (1 - voyageState.from) * voyageEase(t);
    };
    const effectiveEntry = (now = performance.now()) => {
      const driven = drivenEntry(now);
      if (driven != null) return driven;
      if (entryBlend) {
        const t = clamp01((now - entryBlend.start) / HOP.voyageBlendMs);
        if (t >= 1) entryBlend = null;
        else return entryBlend.from + (queuedEntry - entryBlend.from) * smootherstep(t);
      }
      return queuedEntry;
    };
    const chapterMode = () => hopEnabled && effectiveEntry() >= 0.999 && (!prologue || queuedPrologue >= 1);
    // A fresh run (first draw, resize, late map load, Story close) snaps to the
    // place the scroll position commits to — it never replays a flight.
    const hysteresisFrom = (start: number, position: number) => {
      let next = Math.max(0, Math.min(lastRouteIndex, start));
      while (next < lastRouteIndex && position >= next + HOP.forward) next += 1;
      while (next > 0 && position <= next - HOP.back) next -= 1;
      return next;
    };
    const restartPosition = routePosition(queuedSample);
    let committed = committedPlaceRef.current != null
      ? hysteresisFrom(committedPlaceRef.current, restartPosition)
      : Math.max(0, Math.min(lastRouteIndex, Math.floor(restartPosition + (1 - HOP.forward))));
    committedPlaceRef.current = committed;
    let hopCenter: GeoCoordinate = restCenter(committed);
    let hopZoom = restZoom(committed);
    let hopTrim = restRoute(committed);
    let targetCenter: GeoCoordinate = hopCenter;
    let targetZoom = hopZoom;
    interface Flight {
      originCenter: GeoCoordinate;
      originZoom: number;
      destCenter: GeoCoordinate;
      destZoom: number;
      path: FlightPath;
      /** Extra climb, sin-shaped, so short legs still hop (see HOP.minLift). */
      extraLift: number;
      duration: number;
      ease: (t: number) => number;
      trimFrom: number;
      trimTo: number;
      reach: number;
      start: number;
      dest: number;
      /** The viewfinder has been told to lock on arrival. */
      lockCalled: boolean;
    }
    let flight: Flight | null = null;
    // Pre-roll toward a neighbour: [index, amount 0..1].
    let preroll: [number, number] = [committed, 0];
    let hopFrame = 0;
    let lastHopTime = 0;
    let plantTimers: number[] = [];
    let paintMode: 'prologue' | 'archive' | null = null;
    // Mirrors currentStopId inside this closure, so a flight back to the place
    // the viewfinder is locked on does not blink its AF point on and off.
    let plantedLocal: string | null = null;
    const plant = (id: string | null) => {
      plantedLocal = id;
      if (!disposed) markCurrentStop(id);
    };
    // Right after a (re)start — Story close, late map load, resize — the scroll
    // timeline can still be catching up to the restored position. Commits in
    // that window snap to the place instead of flying there; the viewfinder
    // settles without a hunt and the AF points are written once, when the
    // window closes, so returning to the page never replays a journey.
    const snapUntil = performance.now() + HOP.restartSnapMs;
    let settleTimer = 0;
    const settleSignOn = (index: number) => {
      const place = viewfinderPlace(index);
      if (place) viewfinderRef.current?.settle(place);
      const settledId = place?.id ?? null;
      window.clearTimeout(settleTimer);
      plantedLocal = settledId;
      settleTimer = window.setTimeout(() => {
        settleTimer = 0;
        if (!disposed) markCurrentStop(settledId);
      }, Math.max(HOP.settleStateMs, snapUntil - performance.now() + HOP.settleStateMs));
    };
    if (hopEnabled) settleSignOn(committed);

    const applyPaintMode = (mode: 'prologue' | 'archive') => {
      paintMode = mode;
      // At a long flight's apex the camera climbs past the prologue's zoom
      // keys: keep a modest photographic veil (more real ground from higher
      // up) and never bring the prologue's route and dots back.
      if (map.getLayer('prologue-satellite')) {
        map.setPaintProperty('prologue-satellite', 'raster-opacity', mode === 'archive'
          ? ['interpolate', ['linear'], ['zoom'], 3.1, 0.62, 4.6, PROLOGUE_SATELLITE_RESIDUAL]
          : ['interpolate', ['linear'], ['zoom'], PROLOGUE_SATELLITE_FADE[0], 1, PROLOGUE_SATELLITE_FADE[1], PROLOGUE_SATELLITE_RESIDUAL]);
      }
      ['prologue-route', 'prologue-stops-halo', 'prologue-stops-dot'].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', mode === 'archive' ? 'none' : 'visible');
      });
    };

    const clearPlantTimers = () => {
      plantTimers.forEach((timer) => window.clearTimeout(timer));
      plantTimers = [];
    };

    const launch = (dest: number, now: number) => {
      const inAir = !!flight;
      const originCenter: GeoCoordinate = [hopCenter[0], hopCenter[1]];
      const originZoom = hopZoom;
      const destCenter = restCenter(dest);
      const destZoom = restZoom(dest);
      const degrees = (angularDistance(originCenter, destCenter) * 180) / Math.PI;
      const reach = clamp01(Math.log(1 + degrees / HOP.nearDegrees) / Math.log(1 + HOP.farDegrees / HOP.nearDegrees));
      let duration = HOP.durationBase + HOP.durationRange * reach;
      // The visible span is the clear stage (the canvas less the focal
      // padding); the leg is measured in pixels at the starting zoom.
      const container = map.getContainer();
      const w0 = Math.max(160, Math.max(container.clientWidth - activePadding.right, container.clientHeight - activePadding.top));
      const w1 = w0 * 2 ** (originZoom - destZoom);
      const u1 = pixelsAtZoom(mercatorDegrees(originCenter, destCenter), originZoom);
      const path = flightPath(w0, w1, u1, HOP.rho);
      // Retargeted mid-air the path simply starts from the live pose, already
      // high, so it glides on rather than climbing again.
      if (inAir) duration = Math.max(HOP.continueFloor, 0.9 * duration);
      const extraLift = inAir ? 0 : Math.max(0, HOP.minLift - path.lift);
      flight = {
        originCenter,
        originZoom,
        destCenter,
        destZoom,
        path,
        extraLift,
        duration,
        ease: inAir ? hopContinueEase : hopLaunchEase,
        trimFrom: hopTrim,
        trimTo: restRoute(dest),
        reach,
        start: now,
        dest,
        lockCalled: false,
      };
      committed = dest;
      committedPlaceRef.current = dest;
      window.clearTimeout(settleTimer);
      settleTimer = 0;

      // The viewfinder hunts from take-off; the flight's end is only an upper
      // bound for the lock — hopStep brings it forward to the moment the
      // camera actually arrives. A retarget mid-air keeps the hunt going.
      const destPlace = viewfinderPlace(dest);
      if (destPlace) viewfinderRef.current?.hunt(destPlace, now + duration);

      // The place being left gets its AF point back just after take-off; the
      // destination's point hides when the viewfinder locks on it.
      clearPlantTimers();
      const destId = chapterRoute[dest]?.stop.id ?? null;
      if (plantedLocal !== destId) {
        plantTimers.push(window.setTimeout(() => plant(null), HOP.unplantDelay));
        plantTimers.push(window.setTimeout(() => plant(destId), Math.max(HOP.unplantDelay + 60, duration)));
      }
      wakeHop();
    };

    const snapTo = (index: number) => {
      committed = index;
      preroll = [index, 0];
      committedPlaceRef.current = index;
      flight = null;
      hopCenter = restCenter(index);
      hopZoom = restZoom(index);
      hopTrim = restRoute(index);
      targetCenter = hopCenter;
      targetZoom = hopZoom;
      clearPlantTimers();
      settleSignOn(index);
    };
    // Outside the archive (the entrance, or a jump back to the index) the
    // committed place still follows the scroll — without a flight: the pose
    // glides to it through the follow smoothing, and any flight in progress is
    // dropped, so the entrance never dives onto a stale place.
    const settleTo = (index: number) => {
      committed = index;
      preroll = [index, 0];
      committedPlaceRef.current = index;
      flight = null;
      hopTrim = restRoute(index);
      targetCenter = restCenter(index);
      targetZoom = restZoom(index);
      clearPlantTimers();
      settleSignOn(index);
      wakeHop();
    };
    const evaluateCommit = (sample: ChapterSample | null) => {
      if (!hopEnabled || voyageState) return;
      const position = routePosition(sample);
      const next = hysteresisFrom(committed, position);
      if (!chapterMode()) {
        if (next !== committed || flight) settleTo(next);
        return;
      }
      if (next === committed) {
        // Not far enough to commit: lean the resting camera toward where the
        // scroll is heading (reversible, eased, capped).
        if (flight) return;
        const lean = position - committed;
        const neighbour = lean >= 0 ? Math.min(lastRouteIndex, committed + 1) : Math.max(0, committed - 1);
        const amount = neighbour === committed
          ? 0
          : smootherstep(clamp01(lean >= 0 ? lean / HOP.forward : -lean / HOP.back));
        if (neighbour !== preroll[0] || Math.abs(amount - preroll[1]) > 0.002) {
          preroll = [neighbour, amount];
          wakeHop();
        }
        return;
      }
      preroll = [next, 0];
      const now = performance.now();
      if (now < snapUntil && !flight) snapTo(next);
      else launch(next, now);
    };

    const hopStep = (time: number) => {
      hopFrame = 0;
      if (disposed) return;
      const dt = lastHopTime ? Math.min(64, time - lastHopTime) : 16.7;
      lastHopTime = time;
      const now = performance.now();
      if (flight) {
        const t = clamp01((now - flight.start) / flight.duration);
        const s = flight.ease(t);
        const along = flight.path.at(s);
        targetCenter = mercatorLerp(flight.originCenter, flight.destCenter, along.u);
        targetZoom = flight.originZoom + along.dz - flight.extraLift * Math.sin(Math.PI * s);
        // The lit line is thrown ahead and reaches the destination before
        // the camera does.
        const routeT = 1 - Math.pow(1 - clamp01(t / HOP.routeShare), 3);
        hopTrim = flight.trimFrom + (flight.trimTo - flight.trimFrom) * routeT;
        if (t >= 1) {
          flight = null;
          targetCenter = restCenter(committed);
          targetZoom = restZoom(committed);
          hopTrim = restRoute(committed);
        }
      } else {
        const [neighbour, amount] = preroll;
        if (amount > 0 && neighbour !== committed) {
          const from = restCenter(committed);
          const to = restCenter(neighbour);
          const legPixels = Math.max(1, pixelsAtZoom(mercatorDegrees(from, to), restZoom(committed)));
          const share = Math.min(HOP.prerollShare, HOP.prerollMaxPx / legPixels) * amount;
          targetCenter = greatCirclePoint(from, to, share);
          targetZoom = restZoom(committed) - HOP.prerollZoom * amount;
        } else {
          targetCenter = restCenter(committed);
          targetZoom = restZoom(committed);
        }
      }
      const follow = 1 - Math.exp(-dt / HOP.followMs);
      hopCenter = [
        hopCenter[0] + (targetCenter[0] - hopCenter[0]) * follow,
        hopCenter[1] + (targetCenter[1] - hopCenter[1]) * follow,
      ];
      hopZoom += (targetZoom - hopZoom) * follow;
      if (flight && !flight.lockCalled) {
        const arrival = pixelsAtZoom(mercatorDegrees(hopCenter, flight.destCenter), hopZoom);
        if (arrival < HOP.lockPx || now - flight.start >= flight.duration) {
          flight.lockCalled = true;
          const destPlace = viewfinderPlace(flight.dest);
          if (destPlace) viewfinderRef.current?.hunt(destPlace, now + HOP.lockSnapMs);
          const destId = destPlace?.id ?? null;
          if (plantedLocal !== destId) {
            clearPlantTimers();
            plantTimers.push(window.setTimeout(() => plant(destId), HOP.lockSnapMs));
          }
        }
      }
      const gap = pixelsAtZoom(mercatorDegrees(hopCenter, targetCenter), hopZoom);
      const settling = gap > 0.3 || Math.abs(targetZoom - hopZoom) > 0.0008;
      if (!flight && !settling) {
        hopCenter = targetCenter;
        hopZoom = targetZoom;
      }
      const driven = drivenEntry(now);
      if (driven != null) voyageEntry.set(driven);
      schedule(queuedSample);
      if (flight || settling || (voyageState && voyageState.dive) || entryBlend) hopFrame = requestAnimationFrame(hopStep);
      else lastHopTime = 0;
    };
    const endVoyage = () => {
      if (!voyageState) return;
      const now = performance.now();
      const driven = drivenEntry(now);
      voyageState = null;
      voyageEntry.set(-1);
      if (driven != null && Math.abs(driven - queuedEntry) > 0.002) entryBlend = { from: driven, start: now };
      evaluateCommit(queuedSample);
      wakeHop();
      schedule(queuedSample);
    };
    const beginVoyage = (next: AtlasVoyage | null) => {
      if (!next) {
        endVoyage();
        return;
      }
      if (!hopEnabled) return;
      const index = chapterRoute.findIndex((entry) => entry.stop.id === next.chapterId);
      if (index < 0) return;
      const now = performance.now();
      entryBlend = null;
      if (chapterMode()) {
        voyageState = { index, start: now, duration: next.duration, dive: false, from: 1 };
        if (committed !== index) {
          preroll = [index, 0];
          launch(index, now);
        }
      } else {
        voyageState = { index, start: now, duration: next.duration, dive: true, from: effectiveEntry(now) };
        snapTo(index);
      }
      wakeHop();
      schedule(queuedSample);
    };
    voyageHandlerRef.current = beginVoyage;
    const wakeHop = () => {
      if (hopFrame || disposed) return;
      lastHopTime = 0;
      hopFrame = requestAnimationFrame(hopStep);
    };

    const draw: Process = () => {
      if (disposed) return;
      classicMapFrameRef.current = null;
      const sample = queuedSample;
      // The globe opening owns the camera from the very first entry frame; the
      // flat entrance waits for the map to be a little way in.
      const focused = !!sample && (
        !!activeStopRef.current ||
        (!!entryProgress && (queuedEntry > 0.02 || classicGlobe))
      );

      // Padding defines the permanent editorial focal point; applying it only
      // when the map changes mode avoids resubmitting the same layout object on
      // every camera frame.
      // A dive voyage hands the camera to the entrance at once: the prologue
      // would otherwise keep unwinding its spin toward the scrubbed chapter
      // (east) while the entrance turns toward the destination (west).
      const inPrologue = prologue && !!sample && !!canvasBox && queuedPrologue < 1 && !(voyageState && voyageState.dive);
      if (!inPrologue && padded !== focused) {
        padded = focused;
        map.setPadding(focused ? activePadding : neutralPadding);
      }

      if (inPrologue && sample && canvasBox) {
        // ── Globe prologue ── the lit globe low in the bottom-right corner,
        // turning with the page; over the last third it glides into the atlas
        // focus and arrives exactly at the entrance's starting pose.
        const q = clamp01(queuedPrologue);
        const intro = globeIntro.get();
        const glide = smootherstep(clamp01((q - PROLOGUE_GLOBE.glideStart) / (PROLOGUE_GLOBE.glideEnd - PROLOGUE_GLOBE.glideStart)));
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight;
        const cx = PROLOGUE_GLOBE.centerX * viewportWidth - canvasBox.left;
        const cy = PROLOGUE_GLOBE.centerY * viewportHeight - canvasBox.top;
        const cornerPadding = {
          top: Math.max(0, Math.min(canvasBox.height * 0.96, 2 * cy - canvasBox.height)),
          right: Math.max(0, canvasBox.width - 2 * cx),
          bottom: Math.max(0, canvasBox.height - 2 * cy),
          left: Math.max(0, Math.min(canvasBox.width * 0.96, 2 * cx - canvasBox.width)),
        };
        const padding = {
          top: cornerPadding.top + (activePadding.top - cornerPadding.top) * glide,
          right: cornerPadding.right + (activePadding.right - cornerPadding.right) * glide,
          bottom: cornerPadding.bottom + (activePadding.bottom - cornerPadding.bottom) * glide,
          left: cornerPadding.left + (activePadding.left - cornerPadding.left) * glide,
        };
        const target = sample.coordinate;
        const [lifeStart, lifeEnd] = PROLOGUE_GLOBE.lifeFade;
        const life = 1 - smootherstep(clamp01((q - lifeStart) / (lifeEnd - lifeStart)));
        const center: GeoCoordinate = [
          target[0] - PROLOGUE_GLOBE.spin * Math.pow(1 - q, 1.25) - PROLOGUE_GLOBE.introSpin * intro +
            (drift + pointerX * PROLOGUE_GLOBE.pointerLongitude) * life,
          PROLOGUE_GLOBE.startLatitude + (GLOBE_START_LATITUDE - PROLOGUE_GLOBE.startLatitude) * smootherstep(q) +
            pointerY * PROLOGUE_GLOBE.pointerLatitude * life,
        ];
        handoffLongitude = center[0];
        const bearing = PROLOGUE_GLOBE.tilt * (1 - glide);
        // The corner globe keeps its share of the screen on wider displays
        // (radius doubles per zoom level), then settles to the entrance pose.
        const cornerZoom = PROLOGUE_GLOBE.zoom + Math.log2(Math.max(0.75, viewportWidth / 1440));
        const zoom = cornerZoom + (globeMode.startZoom - cornerZoom) * glide -
          PROLOGUE_GLOBE.introZoom * intro;
        if (!onGlobe) {
          onGlobe = true;
          map.setProjection('globe');
          map.setFog(PROLOGUE_FOG);
        }
        const paddingKey = `${padding.top.toFixed(1)}|${padding.right.toFixed(1)}|${padding.bottom.toFixed(1)}|${padding.left.toFixed(1)}`;
        const paddingChanged = paddingKey !== prologuePaddingKey;
        if (paddingChanged || !lastCoordinate ||
          Math.abs(lastCoordinate[0] - center[0]) > 0.004 || Math.abs(lastCoordinate[1] - center[1]) > 0.004 ||
          Math.abs(lastZoom - zoom) > 0.0004 || lastPitch !== 0 || Math.abs(lastBearingKey - bearing) > 0.01) {
          map.jumpTo({ center, zoom, bearing, pitch: 0, padding });
          prologuePaddingKey = paddingKey;
          lastCoordinate = center;
          lastZoom = zoom;
          lastPitch = 0;
          lastBearing = bearing;
          lastBearingKey = bearing;
          lastOverview = false;
        }
        // The route is drawn across the globe as North America turns in.
        const drawn = smootherstep(clamp01((q - 0.42) / 0.46));
        if (Math.abs(drawn - lastPrologueRoute) >= 0.002 || (drawn >= 1 && lastPrologueRoute !== 1)) {
          lastPrologueRoute = drawn;
          if (map.getLayer('prologue-route')) map.setPaintProperty('prologue-route', 'line-trim-offset', [drawn, 1]);
        }
        // Leaving the prologue must resubmit the atlas padding.
        padded = null;
      } else if (sample && focused) {
        // With hops, the entrance (and every non-flying frame) aims at the
        // committed place's rest pose rather than the scrubbed route head.
        const aim: ChapterSample = hopEnabled
          ? { ...sample, coordinate: hopCenter, zoom: hopZoom, pitch: CHAPTER_PITCH, bearing: CHAPTER_BEARING }
          : sample;
        if (prologue && prologuePaddingKey) {
          prologuePaddingKey = '';
          if (map.getLayer('prologue-route')) map.setPaintProperty('prologue-route', 'line-trim-offset', [1, 1]);
          lastPrologueRoute = 1;
        }
        // Enter The Route through geography, not through a scaled interface
        // panel. The same scroll-owned entry clock carries the camera from a
        // continental overview into the first chapter, so slow, fast and
        // reverse gestures all resolve to the exact same optical state.
        // The formal entrance uses the same geographic phase as the map plane;
        // after that phase ends, the existing chapter camera is untouched.
        const entryNow = effectiveEntry();
        const entryCameraProgress = entryProgress
          ? classicEntrance
            ? entrancePhase(entryNow, ...ARCHIVE_ENTRANCE_PHASES.map)
            : clamp01(entryNow)
          : 1;
        const entryOverview: GeoCoordinate = [-100.2, 38.6];
        const entryOverviewZoom = 2.32;
        let entryCoordinate = entryProgress
          ? greatCirclePoint(
              entryOverview,
              aim.coordinate,
              entryCameraProgress,
            )
          : aim.coordinate;
        let entryZoom = entryProgress
          ? entryOverviewZoom + (aim.zoom - entryOverviewZoom) * entryCameraProgress
          : aim.zoom;
        const entryPoseProgress = classicEntrance ? entryCameraProgress : smootherstep(entryCameraProgress);
        let entryPitch = aim.pitch * entryPoseProgress;
        let entryBearing = US_OVERVIEW.bearing +
          (aim.bearing - US_OVERVIEW.bearing) * entryPoseProgress;
        if (classicGlobe) {
          if (prologue && Number.isFinite(handoffLongitude)) entryMode.startLongitude = handoffLongitude;
          const globePose = globeEntryPose(aim, globeEntryProgress(entryNow), entryMode);
          entryCoordinate = globePose.center;
          entryZoom = globePose.zoom;
          entryPitch = globePose.pitch;
          entryBearing = globePose.bearing;
          if (globePose.globe !== onGlobe) {
            onGlobe = globePose.globe;
            map.setProjection(onGlobe ? 'globe' : 'mercator');
            map.setFog(onGlobe ? (prologue ? PROLOGUE_FOG : GLOBE_FOG) : null);
          }
        }
        if (chapterMode()) {
          // Inside the archive the hop controller owns the camera.
          entryCoordinate = hopCenter;
          entryZoom = hopZoom;
          entryPitch = CHAPTER_PITCH;
          entryBearing = CHAPTER_BEARING;
        }
        const atChapterEndpoint = sample.easedProgress <= 0.000001 || sample.easedProgress >= 0.999999;
        const lastScreenPoint = lastCoordinate ? map.project(lastCoordinate) : null;
        const nextScreenPoint = map.project(entryCoordinate);
        const screenDelta = lastScreenPoint
          ? Math.hypot(nextScreenPoint.x - lastScreenPoint.x, nextScreenPoint.y - lastScreenPoint.y)
          : Number.POSITIVE_INFINITY;
        // Compare in visible pixels rather than degrees. The old 0.012° gate
        // quantised short legs into small jumps, especially on high-DPI Chrome.
        const coordinateChanged = !lastCoordinate || screenDelta >= 0.14 ||
          (atChapterEndpoint && screenDelta > 0.001);
        const zoomChanged = !Number.isFinite(lastZoom) || Math.abs(lastZoom - entryZoom) > 0.0004;
        const poseChanged = !Number.isFinite(lastPitch) || !Number.isFinite(lastBearing) ||
          Math.abs(lastPitch - entryPitch) > 0.015 || Math.abs(lastBearing - entryBearing) > 0.015;
        if (lastOverview || coordinateChanged || zoomChanged || poseChanged) {
          map.jumpTo({
            center: entryCoordinate,
            zoom: entryZoom,
            bearing: entryBearing,
            pitch: entryPitch,
          });
          lastCoordinate = entryCoordinate;
          lastZoom = entryZoom;
          lastPitch = entryPitch;
          lastBearing = entryBearing;
          lastOverview = false;
        }
      } else {
        if (!lastOverview) {
          map.jumpTo({
            center: [US_OVERVIEW.longitude, US_OVERVIEW.latitude],
            zoom: US_OVERVIEW.zoom,
            bearing: US_OVERVIEW.bearing,
            pitch: 0,
          });
          lastCoordinate = null;
          lastZoom = US_OVERVIEW.zoom;
          lastPitch = 0;
          lastBearing = US_OVERVIEW.bearing;
          lastOverview = true;
        }
      }

      const routeProgress = hopEnabled
        ? chapterMode() ? hopTrim : restRoute(committed)
        : sample?.routeProgress ?? 0;
      const atRouteEndpoint = hopEnabled || (!!sample && (
        sample.easedProgress <= 0.000001 || sample.easedProgress >= 0.999999
      ));
      if (prologue) {
        const mode = chapterMode() ? 'archive' : 'prologue';
        if (mode !== paintMode) applyPaintMode(mode);
      }
      if (
        !Number.isFinite(lastRouteProgress) ||
        Math.abs(routeProgress - lastRouteProgress) >= 0.0002 ||
        (atRouteEndpoint && routeProgress !== lastRouteProgress)
      ) {
        lastRouteProgress = routeProgress;
        ['route-travelled-glow', 'route-travelled-line'].forEach((layerId) => {
          if (map.getLayer(layerId)) map.setPaintProperty(layerId, 'line-trim-offset', [routeProgress, 1]);
        });
      }
      // Mark only the first real timeline draw. The readiness fallback must
      // never reveal the initial overview before the current chapter is applied.
      if (!cameraSyncedRef.current) {
        cameraSyncedRef.current = true;
        setMapCameraSynced(true);
      }
    };
    const schedule = (sample = chapterSample.get()) => {
      if (disposed) return;
      queuedSample = sample;
      if (classicMapFrameRef.current) return;
      classicMapFrameRef.current = draw;
      frame.render(draw, false, true);
    };
    const scheduleEntry = (progress: number) => {
      queuedEntry = progress;
      if (hopEnabled) evaluateCommit(queuedSample);
      schedule(queuedSample);
    };
    const onChapterSample = (sample: ChapterSample | null) => {
      if (hopEnabled) evaluateCommit(sample);
      schedule(sample);
    };
    const unsubscribe = chapterSample.on('change', onChapterSample);
    const unsubscribeEntry = sampledEntryProgress.on('change', scheduleEntry);
    const unsubscribePrologue = prologue
      ? resolvedPrologueProgress.on('change', (progress) => {
          queuedPrologue = progress;
          if (hopEnabled) evaluateCommit(queuedSample);
          schedule(queuedSample);
        })
      : () => {};
    const unsubscribeIntro = prologue ? globeIntro.on('change', () => schedule(queuedSample)) : () => {};

    // The prologue globe's life loop: it wakes on scroll into the corner
    // stretch or on pointer movement, advances drift and cursor lean with
    // frame-rate-independent easing, and sleeps once both have settled.
    let lifeFrame = 0;
    let lastLifeTime = 0;
    const lifeActive = () => prologue && queuedPrologue < PROLOGUE_GLOBE.lifeFade[1] &&
      document.visibilityState === 'visible';
    const lifeStep = (time: number) => {
      lifeFrame = 0;
      if (disposed || !lifeActive()) {
        lastLifeTime = 0;
        return;
      }
      const dt = lastLifeTime ? Math.min(64, time - lastLifeTime) : 16.7;
      lastLifeTime = time;
      const previousDrift = drift;
      const previousX = pointerX;
      const previousY = pointerY;
      drift += (PROLOGUE_GLOBE.driftMax - drift) * (1 - Math.exp(-dt / (PROLOGUE_GLOBE.driftTau / 3)));
      const lean = 1 - Math.exp(-dt / 320);
      pointerX += (pointerTargetX - pointerX) * lean;
      pointerY += (pointerTargetY - pointerY) * lean;
      const moving = Math.abs(drift - previousDrift) > 0.0004 ||
        Math.abs(pointerX - previousX) > 0.0004 || Math.abs(pointerY - previousY) > 0.0004;
      if (moving) {
        schedule(queuedSample);
        lifeFrame = requestAnimationFrame(lifeStep);
      } else {
        lastLifeTime = 0;
      }
    };
    const wakeLife = () => {
      if (!lifeFrame && lifeActive()) lifeFrame = requestAnimationFrame(lifeStep);
    };
    const finePointer = typeof window !== 'undefined' &&
      window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    const onPointerMove = (event: PointerEvent) => {
      pointerTargetX = clamp01(event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pointerTargetY = -(clamp01(event.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
      wakeLife();
    };
    const unsubscribeLife = prologue
      ? resolvedPrologueProgress.on('change', () => wakeLife())
      : () => {};
    if (prologue) {
      if (finePointer) window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('visibilitychange', wakeLife);
      wakeLife();
    }
    // Mapbox may finish loading after several chapters have already passed, and
    // Story close may resume on a stationary scroll position. Always replay now.
    if (voyageRef.current) beginVoyage(voyageRef.current);
    schedule(chapterSample.get());
    return () => {
      voyageHandlerRef.current = null;
      voyageEntry.set(-1);
      disposed = true;
      unsubscribe();
      unsubscribeEntry();
      unsubscribePrologue();
      unsubscribeIntro();
      unsubscribeLife();
      if (lifeFrame) cancelAnimationFrame(lifeFrame);
      if (hopFrame) cancelAnimationFrame(hopFrame);
      window.clearTimeout(settleTimer);
      clearPlantTimers();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', wakeLife);
      cancelFrame(draw);
      if (classicMapFrameRef.current === draw) classicMapFrameRef.current = null;
    };
  }, [atlasEngaged, canvasExtension, chapterRestZooms, chapterRoute, chapterSample, classicEntrance, classicGlobe, entryProgress, globeIntro, globeMode, hopEnabled, layoutRevision, living, mapLoaded, paused, prologue, resolvedPrologueProgress, sampledEntryProgress]);

  const mapReadiness = {
    loaded: mapLoaded,
    cameraSynced: living || mapCameraSynced,
    settled: mapSettled,
    idleFallback: mapIdleFallback,
  };
  useEffect(() => scheduleAtlasIdleFallback({
    loaded: mapLoaded,
    cameraSynced: living || mapCameraSynced,
    settled: mapSettled,
    idleFallback: mapIdleFallback,
  }, () => setMapIdleFallback(true)), [living, mapCameraSynced, mapIdleFallback, mapLoaded, mapSettled]);

  const coordinateLabel = activeStop ? formatCoordinateLabel(activeStop.coordinates) : '';
  const entryOwnsClassicInterface = !living && !!entryProgress;
  const interfaceVisible = !paused && atlasEngaged &&
    (entryOwnsClassicInterface || interfaceInFrame) &&
    isAtlasInterfaceReady(mapReadiness);
  // On small screens the active photograph already carries the place, year,
  // frame count and story cue. Removing the atlas footer during an active
  // chapter keeps those layers from competing for the same bottom edge.
  const footerVisible = !living && interfaceVisible && (!mobile || !activeStop);
  const playInterfaceIntro = interfaceVisible && !interfaceIntroPlayedRef.current;
  const sampledClassicActive = !!activeStop || entryOwnsClassicInterface;
  const interfaceGate = useMotionValue(interfaceVisible ? 1 : 0);
  const entryForInterface = useTransform(
    [sampledEntryProgress, voyageEntry],
    ([entry, driven]) => (driven >= 0 ? driven : entry),
  );
  const classicInterfaceOpacity = useTransform(
    [entryForInterface, interfaceGate],
    ([entry, gate]) => (classicEntrance
      ? entrancePhase(entry, ...ARCHIVE_ENTRANCE_PHASES.interface)
      : smootherstep(clamp01((entry - 0.54) / 0.42))) * gate,
  );
  const classicHeaderOpacity = useTransform(
    [entryForInterface, interfaceGate],
    ([entry, gate]) => (classicEntrance
      ? entrancePhase(entry,
          ARCHIVE_ENTRANCE_PHASES.interface[0] - CLASSIC_INTERFACE_STAGGER,
          ARCHIVE_ENTRANCE_PHASES.interface[1] - CLASSIC_INTERFACE_STAGGER)
      : smootherstep(clamp01((entry - 0.54) / 0.42))) * gate,
  );
  const classicFooterOpacity = useTransform(
    [sampledEntryProgress, interfaceGate],
    ([entry, gate]) => (classicEntrance
      ? entrancePhase(entry,
          ARCHIVE_ENTRANCE_PHASES.interface[0] + CLASSIC_INTERFACE_STAGGER,
          ARCHIVE_ENTRANCE_PHASES.interface[1] + CLASSIC_INTERFACE_STAGGER)
      : smootherstep(clamp01((entry - 0.54) / 0.42))) * gate,
  );
  const classicInterfaceY = useTransform(classicInterfaceOpacity, (opacity) => (1 - opacity) * (classicEntrance ? 20 : 18));
  const classicHeaderY = useTransform(classicHeaderOpacity, (opacity) => (1 - opacity) * (classicEntrance ? 16 : 18));
  const classicFooterY = useTransform(classicFooterOpacity, (opacity) => (1 - opacity) * (classicEntrance ? 14 : 18));
  const accessibleEntry = classicEntrance ? CLASSIC_INTERFACE_ACCESSIBLE_ENTRY : 0.8;
  const [entryInterfaceAvailable, setEntryInterfaceAvailable] = useState(() =>
    !entryOwnsClassicInterface || sampledEntryProgress.get() >= accessibleEntry,
  );
  const interfaceAccessible = interfaceVisible && (!entryOwnsClassicInterface || entryInterfaceAvailable);
  const footerAccessible = footerVisible && (!entryOwnsClassicInterface || entryInterfaceAvailable);

  useEffect(() => {
    if (!entryOwnsClassicInterface) {
      setEntryInterfaceAvailable(true);
      return;
    }
    // Visual opacity stays entirely scroll-owned. Only make the emerging
    // controls focusable once they are legible, and remove them again on the
    // reverse pass. This updates React only when the boolean threshold changes.
    let available = sampledEntryProgress.get() >= accessibleEntry;
    setEntryInterfaceAvailable(available);
    return sampledEntryProgress.on('change', (progress) => {
      const next = progress >= accessibleEntry;
      if (next === available) return;
      available = next;
      setEntryInterfaceAvailable(next);
    });
  }, [accessibleEntry, entryOwnsClassicInterface, sampledEntryProgress]);

  useEffect(() => {
    const target = interfaceVisible ? 1 : 0;
    if (entryOwnsClassicInterface || reducedMotion) {
      interfaceGate.set(target);
      return;
    }
    const controls = animate(interfaceGate, target, {
      duration: target ? 0.32 : 0.24,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [entryOwnsClassicInterface, interfaceGate, interfaceVisible, reducedMotion]);

  useEffect(() => {
    if (!interfaceVisible || interfaceIntroPlayedRef.current) return;
    const timeout = window.setTimeout(() => {
      interfaceIntroPlayedRef.current = true;
    }, 1100);
    return () => window.clearTimeout(timeout);
  }, [interfaceVisible]);

  if (chapterRoute.length < 2) {
    return (
      <section
        aria-hidden="true"
        className={`route-atlas relative w-full overflow-hidden bg-[#282c20] ${mobile ? 'route-atlas--mobile h-full min-h-[100svh]' : 'h-full'}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_42%_48%,rgba(210,255,0,0.035),transparent_58%)]" />
        <div className="route-atlas-fallback__art absolute inset-0">
          <div className="absolute left-1/2 top-1/2 aspect-[1600/956] w-[132%] -translate-x-1/2 -translate-y-1/2 opacity-30 md:w-[110%]">
            <img
              src="/assets/maps/walkin-us-atlas.webp"
              alt=""
              className="h-full w-full object-contain"
              width="1600"
              height="956"
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </div>
        </div>
      </section>
    );
  }

  if (!viewportReady) {
    return (
      <section
        aria-hidden="true"
        className={`route-atlas relative w-full overflow-hidden bg-[#282c20] ${mobile ? 'route-atlas--mobile' : ''} ${
          mobile ? 'h-full min-h-[100svh]' : 'h-full'
        }`}
      >
        <div className="route-atlas-fallback__art absolute inset-0">
          <div className="absolute left-1/2 top-1/2 aspect-[1600/956] w-[132%] -translate-x-1/2 -translate-y-1/2 opacity-30 md:w-[110%]">
            <img
              src="/assets/maps/walkin-us-atlas.webp"
              alt=""
              className="h-full w-full object-contain"
              width="1600"
              height="956"
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={routeAtlasRef}
      aria-label={living ? undefined : 'Scroll-driven photographic route'}
      role={living ? 'presentation' : undefined}
      data-atlas-engaged={atlasEngaged ? 'true' : 'false'}
      className={`route-atlas relative w-full ${prologue ? 'overflow-visible' : 'overflow-hidden'} bg-transparent ${living ? '' : 'isolate'} ${mobile ? 'route-atlas--mobile' : ''} ${living ? 'route-atlas--living' : ''} ${
        mobile ? 'h-full min-h-[100svh]' : 'h-full'
      }`}
    >
      <div className={`absolute inset-0 ${living ? 'bg-[#0f130e]' : 'bg-[#282c20]'}`} aria-hidden="true" />
      <motion.div
        initial={false}
        animate={!living && entryProgress
          ? undefined
          : reducedMotion
            ? { scale: 1, y: 0 }
            : atlasEngaged && !paused
              ? { scale: 1, y: 0 }
              : { scale: mobile ? 1.045 : 1.03, y: mobile ? 18 : 12 }}
        style={!living && entryProgress
          ? prologue
            // Visible from the top of the page; reaches the viewport's right
            // edge so the globe can sit in the corner over the cover column.
            ? { right: -(32 + canvasExtension) }
            : { opacity: classicEntryOpacity, scale: classicEntryScale, y: classicEntryY }
          : undefined}
        transition={{ duration: reducedMotion ? 0 : 1.08, ease: [0.16, 1, 0.3, 1] }}
        className={`absolute origin-center overflow-hidden ${classicEntrance ? '-inset-8' : 'inset-0'}`}
      >
        <motion.div
          aria-hidden="true"
          initial={false}
          animate={{ opacity: living ? (mapSettled ? 0.42 : 1) : prologue || mapSettled ? 0 : 0.3 }}
          transition={{ duration: reducedMotion ? 0 : 0.85, ease: [0.16, 1, 0.3, 1] }}
          className="route-atlas-fallback__art pointer-events-none absolute inset-0"
        >
          {living ? (
            <div className="route-atlas-print-base absolute inset-0" aria-hidden="true">
              <img
                src="/assets/maps/walkin-silver-paper.webp"
                alt=""
                className="route-atlas-print-paper absolute inset-0 h-full w-full object-cover"
                width="1600"
                height="956"
                loading="eager"
                decoding="async"
                draggable={false}
              />
              <div className="route-atlas-print-map absolute inset-0">
                <img
                  src="/assets/maps/walkin-us-silhouette.webp"
                  alt=""
                  className="route-atlas-print-silhouette absolute inset-0 h-full w-full object-fill"
                  width="1600"
                  height="956"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
                <img
                  src="/assets/maps/walkin-us-atlas.webp"
                  alt=""
                  className="route-atlas-print-states absolute inset-0 h-full w-full object-fill"
                  width="1600"
                  height="956"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              </div>
              {!mobile && (
                <div className="route-atlas-print-labels absolute inset-0 font-serif uppercase" aria-hidden="true">
                  <span className="route-atlas-print-label route-atlas-print-label--canada">Canada</span>
                  <span className="route-atlas-print-label route-atlas-print-label--usa">United<br />States</span>
                  <span className="route-atlas-print-label route-atlas-print-label--mexico">Mexico</span>
                  <span className="route-atlas-print-label route-atlas-print-label--pacific">Pacific<br />Ocean</span>
                  <span className="route-atlas-print-label route-atlas-print-label--atlantic">Atlantic<br />Ocean</span>
                  <span className="route-atlas-print-label route-atlas-print-label--gulf">Gulf of<br />Mexico</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {staticMapUrl && (
                <img
                  src={staticMapUrl}
                  alt=""
                  className="route-atlas-static-map absolute inset-0 h-full w-full object-cover"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              )}
              <div className="absolute left-1/2 top-1/2 aspect-[1600/956] w-[132%] -translate-x-1/2 -translate-y-1/2 opacity-20 md:w-[110%]">
                <img
                  src="/assets/maps/walkin-us-atlas.webp"
                  alt=""
                  className="h-full w-full object-contain"
                  width="1600"
                  height="956"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              </div>
            </>
          )}
        </motion.div>

        {mapEligible && (
          <MapGL
            ref={mapRef}
            mapboxAccessToken={mapboxToken}
            mapStyle={MAP_STYLE}
            projection={{ name: classicGlobe ? 'globe' : 'mercator' }}
            initialViewState={living
              ? mobile
                ? { ...LIVING_OVERVIEW, zoom: 2.35, latitude: 37.5 }
                : LIVING_OVERVIEW
              : mobile
                ? { ...US_OVERVIEW, zoom: 2.3, pitch: 0 }
                : classicGlobe && chapterRoute[0]
                  ? {
                      longitude: globeStartCenter(chapterRoute[0].stop.coordinates)[0],
                      latitude: GLOBE_START_LATITUDE,
                      zoom: GLOBE_START_ZOOM,
                      bearing: 0,
                      pitch: 0,
                    }
                  : { ...US_OVERVIEW, zoom: 3 }}
            style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
            attributionControl
            trackResize={false}
            renderWorldCopies={false}
            fadeDuration={0}
            scrollZoom={false}
            dragRotate={false}
            dragPan={false}
            touchZoomRotate={false}
            touchPitch={false}
            doubleClickZoom={false}
            boxZoom={false}
            keyboard={false}
            minZoom={classicGlobe ? 1.2 : 2.2}
            // The desktop atlas is dark, graded and partly veiled: 1.5x device
            // pixels look the same and cut the GPU fill of every flight frame.
            pixelRatio={!living && !mobile && typeof window !== 'undefined'
              ? Math.min(window.devicePixelRatio || 1, 1.5)
              : undefined}
            // Labels never need to avoid each other across sources here, and
            // skipping it trims the per-frame placement work.
            crossSourceCollisions={false}
            maxZoom={11}
            onIdle={() => setMapSettled(true)}
            onLoad={() => {
              setMapLoaded(true);
              setMapLoadDelayed(false);
              const map = mapRef.current?.getMap();
              if (!map) return;
              // This homepage map is presentation-only; the adjacent route
              // rail owns navigation. Keep the WebGL canvas out of the Tab
              // order while leaving Mapbox's legal attribution DOM intact.
              map.getCanvas().tabIndex = -1;
              map.getCanvas().setAttribute('aria-hidden', 'true');
              if (mobile) map.touchZoomRotate.disableRotation();

          // Keep the actual road network without heavy terrain or extrusions.
          // Classic depth comes from the scroll-owned oblique camera, with no
          // terrain startup cost or extra animation competing with the photos.
          map.setTerrain(null);
          // The prologue globe is photographic: satellite imagery at globe
          // zooms, graded toward the archive's olive. As the camera dives it
          // settles to a residual veil under the dark atlas rather than
          // vanishing. Inserted under the first label layer; the route layers
          // draw above it.
          if (prologue && !map.getSource('prologue-satellite')) {
            const firstLabel = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;
            map.addSource('prologue-satellite', { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 });
            map.addLayer({
              id: 'prologue-satellite',
              type: 'raster',
              source: 'prologue-satellite',
              paint: {
                'raster-opacity': ['interpolate', ['linear'], ['zoom'], PROLOGUE_SATELLITE_FADE[0], 1, PROLOGUE_SATELLITE_FADE[1], PROLOGUE_SATELLITE_RESIDUAL],
                'raster-saturation': -0.32,
                'raster-contrast': 0.08,
                'raster-brightness-max': 0.86,
                'raster-fade-duration': 160,
              },
            }, firstLabel);
          }
          map.setFog(classicGlobe && map.getProjection?.()?.name === 'globe' ? (prologue ? PROLOGUE_FOG : GLOBE_FOG) : null);

          map.getStyle().layers?.forEach((layer) => {
            const id = layer.id.toLowerCase();

            if (layer.type === 'fill-extrusion') {
              map.setLayoutProperty(layer.id, 'visibility', 'none');
              return;
            }

            if (layer.type === 'hillshade') {
              if (!living) {
                map.setLayoutProperty(layer.id, 'visibility', 'none');
                return;
              }
              map.setPaintProperty(layer.id, 'hillshade-exaggeration', 0.16);
              map.setPaintProperty(layer.id, 'hillshade-shadow-color', '#080b07');
              map.setPaintProperty(layer.id, 'hillshade-highlight-color', '#59614f');
              map.setPaintProperty(layer.id, 'hillshade-accent-color', '#252c22');
              return;
            }

            if (layer.type === 'background') {
              map.setPaintProperty(layer.id, 'background-color', living ? '#0F130E' : '#1B2319');
              return;
            }

            if (layer.type === 'fill') {
              if (id.includes('water')) {
                map.setPaintProperty(layer.id, 'fill-color', '#0B1210');
                map.setPaintProperty(layer.id, 'fill-opacity', 0.92);
              } else if (id.includes('park') || id.includes('landuse') || id.includes('landcover')) {
                map.setPaintProperty(layer.id, 'fill-color', '#263024');
                map.setPaintProperty(layer.id, 'fill-opacity', living ? (mobile ? 0.32 : 0.28) : (mobile ? 0.36 : 0.38));
              } else if (id.includes('building')) {
                map.setPaintProperty(layer.id, 'fill-color', '#2A3028');
                map.setPaintProperty(layer.id, 'fill-opacity', mobile ? 0.1 : 0.12);
              }
              return;
            }

            if (layer.type === 'line') {
              if (id.includes('admin') || id.includes('boundary')) {
                map.setPaintProperty(layer.id, 'line-color', '#AEB6A9');
                map.setPaintProperty(layer.id, 'line-width', mobile ? 0.62 : 0.74);
                map.setPaintProperty(layer.id, 'line-opacity', living ? (mobile ? 0.21 : 0.2) : (mobile ? 0.28 : 0.46));
              } else if (id.includes('motorway') || id.includes('trunk') || id.includes('primary')) {
                map.setPaintProperty(layer.id, 'line-color', '#8C9588');
                map.setPaintProperty(layer.id, 'line-opacity', living ? 0.1 : (mobile ? 0.32 : 0.56));
              } else if (id.includes('secondary') || id.includes('tertiary')) {
                map.setPaintProperty(layer.id, 'line-color', '#737D6D');
                map.setPaintProperty(layer.id, 'line-opacity', living ? 0.045 : (mobile ? 0.2 : 0.39));
              } else if (id.includes('road') || id.includes('street')) {
                map.setPaintProperty(layer.id, 'line-color', '#667064');
                map.setPaintProperty(layer.id, 'line-opacity', living ? 0.018 : (mobile ? 0.1 : 0.22));
              } else if (id.includes('waterway')) {
                map.setPaintProperty(layer.id, 'line-color', '#657168');
                map.setPaintProperty(layer.id, 'line-opacity', living ? 0.08 : (mobile ? 0.18 : 0.34));
              }
              return;
            }

            if (layer.type !== 'symbol' || !('layout' in layer) || !layer.layout?.['text-field']) return;
            const isBaseNavigationNoise =
              id.includes('poi') ||
              id.includes('transit') ||
              id.includes('airport') ||
              id.includes('building-number');
            const isRoadLabel = id.includes('road') || id.includes('street');
            const isPlaceLabel =
              id.includes('settlement') ||
              id.includes('place') ||
              id.includes('city') ||
              id.includes('town') ||
              id.includes('village');
            if (isBaseNavigationNoise || ((living || !mobile) && isRoadLabel)) {
              map.setLayoutProperty(layer.id, 'visibility', 'none');
              return;
            }
            const isAtlasLabel =
              id.includes('state-label') ||
              id.includes('country-label') ||
              id.includes('water-point') ||
              id.includes('water-line');
            if (living && !isAtlasLabel) {
              map.setLayoutProperty(layer.id, 'visibility', 'none');
              return;
            }
            // The basemap's own type has to sit BELOW the page's typography.
            // At the previous values (atlas 0.54, place 0.64 of #C8CEC2) a state
            // name landed at roughly the same luminance as the site's own
            // labels, so "02 ORLANDO" in the route rail collided with
            // "MISSISSIPPI" underneath it and the seam read as noise. Geography
            // stays legible on approach; place names are the page's job.
            const labelOpacity = isAtlasLabel
              ? living
                ? (mobile ? 0.16 : 0.15)
                : (mobile ? 0.2 : 0.26)
              : isPlaceLabel
                ? (mobile ? 0.2 : 0.28)
                : isRoadLabel
                  ? (mobile ? 0.12 : 0.18)
                  : (mobile ? 0.16 : 0.2);
            // The prologue globe is unlabelled photography; names arrive with
            // the dive, before the first chapter's zoom.
            map.setPaintProperty(
              layer.id,
              'text-opacity',
              prologue
                ? ['interpolate', ['linear'], ['zoom'], PROLOGUE_SATELLITE_FADE[0] + 0.3, 0, PROLOGUE_SATELLITE_FADE[1] - 0.1, labelOpacity]
                : labelOpacity,
            );
            map.setPaintProperty(layer.id, 'text-color', '#AEB5A6');
            map.setPaintProperty(layer.id, 'text-halo-color', '#11150F');
            map.setPaintProperty(layer.id, 'text-halo-width', 0.7);
            map.setPaintProperty(layer.id, 'text-halo-blur', 0.5);
          });
            }}
          >
        <Source key="atlas-graticule" id="atlas-graticule" type="geojson" data={NORTH_AMERICA_GRATICULE}>
          <Layer
            id="atlas-graticule-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#AEB6A9',
              'line-width': 0.55,
              'line-opacity': mobile ? 0.055 : 0.045,
            }}
          />
        </Source>
        {!living && <Source key="route-all" id="route-all" type="geojson" data={fullRoute} lineMetrics>
          <Layer
            id="route-all-glow"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': MAP_BURN,
              'line-width': 4,
              'line-opacity': living ? 0 : atlasEngaged ? 0.16 : 0,
              'line-opacity-transition': { duration: reducedMotion ? 0 : 700, delay: reducedMotion ? 0 : 120 },
              'line-blur': 3,
              'line-trim-offset': [1, 1],
            }}
          />
          <Layer
            id="route-all-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': MAP_INK,
              'line-width': 1,
              'line-opacity': living ? 0 : atlasEngaged ? 0.5 : 0,
              'line-opacity-transition': { duration: reducedMotion ? 0 : 700, delay: reducedMotion ? 0 : 120 },
              'line-trim-offset': [1, 1],
            }}
          />
          <Layer
            id="route-travelled-glow"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': MAP_BURN,
              'line-width': 4.5,
              'line-opacity': living ? 0 : 0.22,
              'line-blur': 3,
              'line-trim-offset': initialRouteTrim,
            }}
          />
          <Layer
            id="route-travelled-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': MAP_INK,
              'line-width': 1.5,
              'line-opacity': living ? 0 : 0.92,
              'line-trim-offset': initialRouteTrim,
            }}
          />
          {prologue && (
            <Layer
              id="prologue-route"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': MAP_INK,
                'line-width': 1.15,
                'line-opacity': ['interpolate', ['linear'], ['zoom'], PROLOGUE_SATELLITE_FADE[0], 0.95, PROLOGUE_SATELLITE_FADE[1], 0],
                'line-trim-offset': [0, 1],
              }}
            />
          )}
        </Source>}
        {prologue && (
          <Source key="prologue-stops" id="prologue-stops" type="geojson" data={prologueStops}>
            {/* Under each point a soft dark burn keeps the white legible on pale
                ground; the place pointed at in the index gets a crisp white ring
                instead. Both stay upright to the viewer (viewport alignment), so
                they read as points rather than discs lying on the sphere. The
                hover values are data-driven, so Mapbox swaps them without easing. */}
            <Layer
              id="prologue-stops-halo"
              type="circle"
              paint={{
                'circle-radius': ['case', ['==', ['get', 'id'], engagedChapterId ?? ''], 9, 8],
                'circle-radius-transition': { duration: reducedMotion ? 0 : 420, delay: 0 },
                'circle-color': MAP_BURN,
                'circle-blur': ['case', ['==', ['get', 'id'], engagedChapterId ?? ''], 0, 1],
                'circle-pitch-alignment': 'viewport',
                'circle-opacity': [
                  'interpolate', ['linear'], ['zoom'],
                  PROLOGUE_SATELLITE_FADE[0], ['case', ['==', ['get', 'id'], engagedChapterId ?? ''], 0.2, 0.24],
                  PROLOGUE_SATELLITE_FADE[1], 0,
                ],
                'circle-opacity-transition': { duration: reducedMotion ? 0 : 420, delay: 0 },
                'circle-stroke-color': '#F4F4ED',
                'circle-stroke-width': ['case', ['==', ['get', 'id'], engagedChapterId ?? ''], 1, 0],
                'circle-stroke-opacity': [
                  'interpolate', ['linear'], ['zoom'],
                  PROLOGUE_SATELLITE_FADE[0], ['case', ['==', ['get', 'id'], engagedChapterId ?? ''], 0.95, 0],
                  PROLOGUE_SATELLITE_FADE[1], 0,
                ],
              }}
            />
            <Layer
              id="prologue-stops-dot"
              type="circle"
              paint={{
                'circle-radius': ['case', ['==', ['get', 'id'], engagedChapterId ?? ''], 3.4, 2.6],
                'circle-radius-transition': { duration: reducedMotion ? 0 : 420, delay: 0 },
                'circle-color': MAP_INK,
                'circle-stroke-color': MAP_BURN,
                'circle-stroke-width': 0.75,
                'circle-pitch-alignment': 'viewport',
                'circle-opacity': ['interpolate', ['linear'], ['zoom'], PROLOGUE_SATELLITE_FADE[0], 1, PROLOGUE_SATELLITE_FADE[1], 0],
                'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], PROLOGUE_SATELLITE_FADE[0], 0.6, PROLOGUE_SATELLITE_FADE[1], 0],
              }}
            />
          </Source>
        )}

        <AnimatePresence>
          {engagedEntry && (
            <Marker
              key={`card-${engagedEntry.stop.id}`}
              longitude={engagedEntry.stop.coordinates[0]}
              latitude={engagedEntry.stop.coordinates[1]}
              anchor="bottom-left"
              offset={[26, -22]}
            >
              <PrologueCard
                number={engagedEntry.chapterIndex + 1}
                name={engagedEntry.stop.name}
                region={engagedEntry.stop.region}
                imageUrl={engagedEntry.stop.coverImageUrl || engagedEntry.stop.imageUrl}
                reducedMotion={reducedMotion}
              />
            </Marker>
          )}
        </AnimatePresence>

        {/* AF points: upright to the camera, centred on each place. The current
            place's square collapses to a white focus point in the viewfinder's
            centre cross — the only mark the map itself draws for it. */}
        {signs && chapterRoute.map((entry) => (
          <Marker
            key={`af-${entry.stop.id}`}
            longitude={entry.stop.coordinates[0]}
            latitude={entry.stop.coordinates[1]}
            anchor="center"
            pitchAlignment="viewport"
            rotationAlignment="viewport"
          >
            <AfPoint
              stopId={entry.stop.id}
              number={entry.chapterIndex + 1}
              initiallyCurrent={entry.stop.id === currentStopRef.current}
              engaged={engagedChapterId === entry.stop.id}
              visibility={classicInterfaceOpacity}
            />
          </Marker>
        ))}
          </MapGL>
        )}

      </motion.div>

      {prologue && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-full bg-[#282c20]"
          style={{ width: canvasExtension + 40, opacity: archiveFrameOpacity }}
        />
      )}

      {living && projectedStops.length === mappedStops.length && (
        <motion.div
          aria-hidden="true"
          initial={false}
          animate={
            reducedMotion
              ? { scale: 1, y: 0 }
              : atlasEngaged && !paused
                ? { scale: 1, y: 0 }
                : { scale: mobile ? 1.045 : 1.03, y: mobile ? 18 : 12 }
          }
          transition={{ duration: reducedMotion ? 0 : 1.08, ease: [0.16, 1, 0.3, 1] }}
          className="route-atlas__marker-overlay pointer-events-none absolute inset-0 z-20 origin-center"
        >
          {projectedRoute.length > 1 && (
            <svg className="route-atlas__route-overlay absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              <motion.path
                d={projectedRoutePath}
                fill="none"
                stroke="#8FA52D"
                strokeWidth={mobile ? 1.05 : 1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                animate={{ pathLength: interfaceVisible ? 1 : 0, opacity: interfaceVisible ? (mobile ? 0.32 : 0.34) : 0 }}
                transition={{ duration: reducedMotion ? 0 : 1.05, ease: [0.16, 1, 0.3, 1] }}
              />
              <motion.path
                d={projectedRoutePath}
                fill="none"
                stroke={ACCENT}
                strokeWidth={mobile ? 1.25 : 1.45}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                style={{ pathLength: livingTravelProgress }}
                animate={{ opacity: interfaceVisible ? (mobile ? 0.72 : 0.78) : 0 }}
                transition={{
                  opacity: { duration: reducedMotion ? 0 : 0.38, ease: [0.16, 1, 0.3, 1] },
                }}
              />
            </svg>
          )}
          {projectedStops.map((projected, index) => {
            const stop = mappedStops[index];
            return (
              <div
                key={projected.id}
                className="absolute"
                style={{
                  left: projected.x,
                  top: projected.y,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <LivingMarkerNode
                  stop={stop}
                  index={index}
                  stops={mappedStops}
                  chapterProgress={resolvedChapterProgress}
                  interfaceVisible={interfaceVisible}
                  reducedMotion={reducedMotion}
                  mobile={mobile}
                  playInterfaceIntro={playInterfaceIntro}
                />
              </div>
            );
          })}
        </motion.div>
      )}

      <motion.div
        aria-hidden="true"
        className={`route-atlas-entry-dissolve pointer-events-none absolute inset-x-0 top-0 z-[5] ${mobile ? 'h-[18%]' : 'h-[24%]'}`}
        style={prologue ? { opacity: archiveFrameOpacity } : undefined}
      />

      <motion.div
        initial={false}
        animate={!living && entryProgress
          ? undefined
          : { opacity: atlasEngaged && !paused ? 0 : 1 }}
        style={!living && entryProgress ? { opacity: classicEntryVeilOpacity } : undefined}
        transition={{ duration: reducedMotion ? 0 : 0.82, ease: [0.16, 1, 0.3, 1] }}
        className={`pointer-events-none absolute inset-0 z-10 ${living ? 'bg-[#0f130e]' : 'bg-[#282c20]'}`}
      />

      <AnimatePresence>
        {mapEligible && !mapLoaded && mapLoadDelayed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.55 }}
            className="pointer-events-none absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2"
            aria-live="polite"
          >
            <div className="rounded-full border border-white/10 bg-[#171b15]/76 px-4 py-3 font-ui text-[9px] uppercase tracking-[0.1em] text-white/62 shadow-[0_12px_36px_rgba(7,9,6,0.2)] backdrop-blur-md">
              Route signal delayed
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className={`route-atlas-grade pointer-events-none absolute inset-0 ${
          mobile
            ? 'bg-[radial-gradient(circle_at_48%_54%,rgba(210,255,0,0.025)_0%,transparent_38%,rgba(7,9,6,0.2)_100%)]'
            : 'shadow-[inset_0_0_120px_rgba(7,9,6,0.23)]'
        }`}
        style={prologue ? { opacity: archiveFrameOpacity } : undefined}
      />
      {!mobile && <motion.div className="route-atlas-tone pointer-events-none absolute inset-0" style={prologue ? { opacity: archiveFrameOpacity } : undefined} />}
      {!mobile && <motion.div className="route-atlas-interface-veil pointer-events-none absolute inset-y-0 left-0" style={prologue ? { opacity: archiveFrameOpacity } : undefined} />}

      {signs && (
        <AtlasViewfinder
          ref={viewfinderRef}
          initial={initialViewfinderPlace}
          visibility={classicInterfaceOpacity}
          reducedMotion={reducedMotion}
        />
      )}

      {!living && <motion.header
        initial={false}
        animate={entryOwnsClassicInterface
          ? undefined
          : interfaceVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
        style={entryOwnsClassicInterface
          ? { opacity: classicHeaderOpacity, y: classicHeaderY }
          : undefined}
        transition={{
          duration: reducedMotion ? 0 : interfaceVisible ? (playInterfaceIntro ? 0.56 : 0.34) : 0.3,
          delay: reducedMotion || !playInterfaceIntro ? 0 : 0.1,
          ease: [0.16, 1, 0.3, 1],
        }}
        aria-hidden={!interfaceAccessible}
        inert={!interfaceAccessible}
        className={`route-atlas-header absolute inset-x-0 top-0 z-20 flex items-start justify-between ${mobile ? 'px-5 pb-6 pt-24' : 'pb-7 pl-8 pr-[38%] pt-24'}`}
      >
        <div>
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-[#D2FF00] shadow-[0_0_14px_rgba(210,255,0,0.75)]" />
            <p className="font-ui text-[8px] font-bold uppercase tracking-[0.1em] text-white/72">The Route</p>
          </div>
          <p className="mt-3 font-ui text-[9px] uppercase tracking-[0.28em] text-white/54">Photographic coordinates</p>
        </div>
        <ScrubbedRouteOrdinal
          sample={chapterSample}
          route={chapterRoute}
          includeTotal
          className="font-ui text-[9px] uppercase tracking-[0.26em] text-white/56"
        />
      </motion.header>}

      {!living && <motion.nav
        initial={false}
        animate={entryOwnsClassicInterface
          ? undefined
          : interfaceVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: -18 }}
        style={entryOwnsClassicInterface
          ? { opacity: classicInterfaceOpacity, y: classicInterfaceY }
          : undefined}
        transition={{
          duration: reducedMotion ? 0 : interfaceVisible ? (playInterfaceIntro ? 0.62 : 0.36) : 0.3,
          delay: reducedMotion || !playInterfaceIntro ? 0 : 0.18,
          ease: [0.16, 1, 0.3, 1],
        }}
        aria-hidden={!interfaceAccessible}
        inert={!interfaceAccessible}
        aria-label="Archive route chapters"
        className={`route-atlas-nav absolute z-30 ${
          mobile
            ? 'left-5 top-[31%] w-[132px]'
            : 'left-8 top-[170px] w-[190px]'
        }`}
      >
        <div className="route-atlas-rail relative">
          <div className="absolute bottom-3 left-[7px] top-3 w-px bg-white/12" />
          <motion.div
            className="absolute bottom-3 left-[7px] top-3 w-px origin-top bg-[#D2FF00] shadow-[0_0_8px_rgba(210,255,0,0.45)]"
            style={{ scaleY: railCompletion }}
          />
          {chapterRoute.map((entry, index) => {
            return (
              <ScrubbedRouteStop
                key={entry.stop.id}
                entry={entry}
                index={index}
                sample={chapterSample}
                semanticActive={entry.stopIndex === resolvedIndex}
                mobile={mobile}
                onNavigate={onNavigate}
                focusLocked={!mobile && engagedChapterId === entry.stop.id}
                reducedMotion={reducedMotion}
              />
            );
          })}
        </div>
      </motion.nav>}

      {!living && <motion.footer
        initial={false}
        animate={entryOwnsClassicInterface
          ? undefined
          : {
              opacity: footerVisible ? 1 : 0,
              y: footerVisible ? 0 : 18,
            }}
        style={entryOwnsClassicInterface
          ? { opacity: classicFooterOpacity, y: classicFooterY }
          : undefined}
        transition={{
          duration: reducedMotion ? 0 : footerVisible ? (playInterfaceIntro ? 0.56 : 0.34) : 0.28,
          delay: reducedMotion || !playInterfaceIntro ? 0 : 0.24,
          ease: [0.16, 1, 0.3, 1],
        }}
        aria-hidden={!footerAccessible}
        inert={!footerAccessible}
        className={`route-atlas-status pointer-events-none absolute z-20 ${mobile ? 'inset-x-5 bottom-[max(28px,env(safe-area-inset-bottom))]' : 'bottom-7 left-8 right-[38%]'}`}
      >
        {mobile ? (
          <div className="route-atlas-footer flex items-end justify-between gap-5 pt-5">
            <div className="min-w-0">
              <motion.div
                key="route-overview"
                initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.58, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="route-atlas-overview-title font-serif text-[clamp(38px,13.8vw,54px)] uppercase leading-[0.78] tracking-[-0.055em] text-[#F4F4ED]">The Route</p>
                <p className="mt-5 font-ui text-[9px] uppercase tracking-[0.22em] text-[#D2FF00]/78">{mappedStops.length} places · photographic atlas</p>
              </motion.div>
            </div>
            <span className="mb-1 shrink-0 font-ui text-[9px] uppercase tracking-[0.24em] text-white/54">Scroll to follow</span>
          </div>
        ) : (
          <div className="route-atlas-footer grid grid-cols-[auto_1fr_auto] items-end gap-5 pt-5 font-ui uppercase">
            <span className="sr-only" aria-live="polite">
              {activeStop ? `Current place: ${activeStop.name}. Coordinates ${coordinateLabel}` : 'Route overview'}
            </span>
            <div>
              <ScrubbedRouteOrdinal
                sample={chapterSample}
                route={chapterRoute}
                className="block text-[9px] tracking-[0.28em] text-[#D2FF00]"
              />
              <span className="relative mt-1 block h-[1.2em] min-w-[12ch] text-[9px] tracking-[0.24em] text-white/52">
                {mappedStops.map((stop) => (
                  <ScrubbedPlaceName key={stop.id} stop={stop} sample={chapterSample} />
                ))}
              </span>
            </div>
            <div className="relative min-w-0 text-center text-[9px] tracking-[0.22em] text-[#D2FF00]/72">
              <motion.div
                initial={false}
                animate={{ opacity: sampledClassicActive ? 1 : 0, y: sampledClassicActive ? 0 : 4 }}
                transition={{ duration: reducedMotion ? 0 : 0.38, ease: [0.16, 1, 0.3, 1] }}
              >
                <ScrubbedCoordinateReadout sample={chapterSample} />
              </motion.div>
              <motion.p
                aria-hidden="true"
                initial={false}
                animate={{ opacity: sampledClassicActive ? 0 : 1, y: sampledClassicActive ? -4 : 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
              >
                {mappedStops.length} places · photographic atlas
              </motion.p>
            </div>
            <span className={`mb-1 shrink-0 font-ui text-[9px] uppercase tracking-[0.23em] text-white/54 ${sampledClassicActive ? 'invisible' : ''}`}>Scroll to follow</span>
          </div>
        )}
      </motion.footer>}
    </section>
  );
}
