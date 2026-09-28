import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ATLAS_PAPER, silenceArchivePlaceLabels } from '../../lib/atlasBasemap';
import { MAP_BURN, MAP_INK, MAP_INK_RGB } from '../../lib/mapInk';
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
import { AfPoint, AtlasTicks, AtlasViewfinder, ATLAS_READING_LINE, type ViewfinderHandle, type ViewfinderPlace } from './AtlasSign';
import { isAtlasInterfaceReady, scheduleAtlasIdleFallback } from '../../lib/atlasReadiness';
import { ARCHIVE_ENTRANCE_PHASES, entrancePhase } from '../../lib/archiveEntrance';
import {
  angularDistance,
  greatCirclePoint,
  routeCoordinates,
  type GeoCoordinate,
} from '../../lib/routeGeometry';
import {
  SILVER_EXIT_HYSTERESIS,
  SILVER_EXIT_ZOOM,
  SILVER_FOG,
  SILVER_FOG_LITE,
  createGlobeChannel,
  globeGraticule,
  globeLookAt,
  prologueNaturalLongitude,
  prologueTurnRemaining,
  silverFloorAt,
  silverPaint,
  silverRamp,
  stockPaint,
} from '../../lib/globeLook';
import { createPlanetLight, type PlanetLightLayer } from '../../lib/planetLight';
import { createEggExposure, setEggMarks } from '../../lib/eggExposure';
import { wrap180 } from '../../lib/globeEgg';
import { CSS_EASE, DUR_MS, EASE, smootherstep, voyageEase } from '../../lib/motion';

// The globe's easter eggs (desk spin, BULB): their own chunk, fetched only
// where the prologue globe can be played with (desktop, motion allowed).
const GlobeEggs = lazy(() => import('./GlobeEggs'));

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

/** A click on a place, the globe's ticket or a torn cover: the page scrolls
 *  to `chapterId` over `duration` ms and the camera goes straight there.
 *  `outbound`: Back to the start instead — the page goes up to the first
 *  screen and the camera leaves the archive in one zoom-out over the first
 *  `entryShare` of the trip, after which the prologue's own scroll glides the
 *  planet home to the corner (`chapterId` is not read). */
export interface AtlasVoyage {
  chapterId: string;
  duration: number;
  token: number;
  outbound?: { entryShare: number };
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
  /** Temporarily links a desktop classic photograph to its map and rail stop
   *  (the globe's point in the prologue, the AF point's ring in the archive). */
  engagedChapterId?: string | null;
  /** The trip a click set in motion, or null once the page has landed. */
  voyage?: AtlasVoyage | null;
  /** An AF point is pointed at or focused (null when it is left). */
  onEngage?: (chapterId: string | null) => void;
  /** An AF point is clicked: go to that chapter. */
  onNavigate?: (chapterId: string) => void;
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

// Marks drawn on the map itself are white ink — the photograph carries the
// colour; lime (#D2FF00) stays in the interface around it, and only once
// per view: on the atlas that is the viewfinder's chapter number (and the
// corners' flash on a landing). Casings are a dark burn. This holds for the living
// tree's DOM markers and route overlay too, not only the Mapbox layers.
// MAP_INK / MAP_BURN (and the ink's rgb triplet, for the living markers'
// alpha ramps) come from src/lib/mapInk.ts, which /travel imports as well.
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
/** How long the atlas's instruments stay up after a hand stops moving over
 *  the map (see "The instruments on demand" in the component). Long enough to
 *  read a coordinate pair and a readout line; any move brings them back. */
const ATLAS_LOOK_IDLE_MS = 3000;

const HOP = {
  // Commit hysteresis in route-leg units: forward at 32% of the way to the
  // next place (so the map lands about as the next cover arrives), back at
  // 22% (−0.78); the 1.1 total keeps small reversals from fluttering.
  // Both are mirrored in src/lib/ticketLatch.ts (ATLAS_LEAVE_LINE,
  // ATLAS_HOME_LINE) — the covers tear before `forward` and re-seat at
  // `back` — so change them together (scripts/ticket-latch.test.mjs reads
  // these two lines).
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
// ── The tear before the flight ──
// Every desktop cover is a ticket, and leaving one going forward tears its
// face off (ArchiveChapter, "The tear"). The owner's rule: 撕开后才能前往下一个地方
// — the map goes on to the next place only once that face is torn free.
// Each face tears past its own line once its reader has seen it and pushes
// on, and always by 30% of the way to the next chapter (src/lib/
// ticketLatch.ts, TEAR_HARD_LINE) — before this controller commits at 32%
// (HOP.forward) — and stamps its section with `data-ticket-torn-at`: the
// moment a rate-1 score would have started to free the face when it will
// actually be free (a harder push runs the rip faster; the stamp is
// back-dated to match, and moved again if the push grows). The rip reaches
// the bottom notch 530ms after that (src/lib/ticketTear.ts, TEAR_FREE_MS). A
// forward scroll commit therefore takes off no sooner than this long after
// the stamp of every cover it leaves — the face free plus a beat for it to
// register (530 + 60). A reader who lingers past the tear flies at once,
// exactly as before; a quick one waits out the rest.
// Mirrored, not imported (ArchiveChapter is in the page bundle, this is a
// lazy chunk): change the two files together.
// Going back is the same rule read the other way: the camera does not return
// to a place while that place's ticket is still torn. The ticket itself
// re-seats exactly where this controller turns for home (ATLAS_HOME_LINE is
// 1 − HOP.back, the same float), so a backward commit normally finds it
// whole already, or waits for the re-seat on the same frame (the ticket
// observer below) — the face rises back into its ticket as the map turns
// for home, never the map arriving at a place whose cover is missing.
// `wholeBackTo` is kept as the guard that makes it so whatever the order in
// which the two hear the scroll.
// Not held: voyages (a click on a place asks to be taken there, and passes
// its covers at the scroll's pace), restart snaps, and reduced
// motion (no hops at all).
const TEAR_BEFORE_FLIGHT_MS = 590;
// A held forward commit re-reads the stamps when its timer runs out (a cover
// can latch a frame after the atlas commits). It never waits past this long
// from the commit, so a ticket that never stamps cannot ground the map.
const TEAR_HOLD_CAP_MS = 1200;
// Take-off gathers speed over the first third; the landing is firm rather
// than a long creep — the follow smoothing rounds off the last few pixels.
// Both hop curves are named exceptions - see src/lib/motion.ts.
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

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// ── Globe opening (after 11 mois sans toi(t)) ──
// The desktop archive entrance starts on a whole globe over the Pacific, turns
// it to North America, then dives into the first chapter, and the archive
// stays on the globe (the owner's call, 2026-09-25). From zoom 5 up Mapbox
// sizes its globe to the flat map at the camera's own latitude, and from zoom
// 6 it draws pure Mercator: the chapters that rest at zoom 6 look exactly as
// they did on the flat map, the ones at HOP.restZoom match it around the
// place and curve away a little toward the top of the frame, and a long
// flight's apex shows the planet's edge. (The dive used to overshoot to zoom
// 6.05, swap to Mercator there and zoom back out to the chapter: every swap
// reloaded every tile, a flat olive frame, and the reader scrolling down
// watched the map zoom the wrong way at the end.) So the dive descends
// straight to GLOBE_HANDOFF_ZOOM, the nearest a chapter ever rests
// (HOP.restZoom), and its zoom only ever increases. Scroll-owned and
// reversible like the rest of the entrance.
const GLOBE_START_ZOOM = 1.9;
const GLOBE_TURN_DEGREES = 108;
const GLOBE_START_LATITUDE = 21;
// The globe runs on the raw entrance score rather than the flat camera's
// eased phase: that phase spends its first half while the map is still fading
// in, which would hide the turn. Inside the window below, the shares are:
// turning, diving to the handoff zoom, and settling onto the chapter's pitch
// (and on down to its own rest zoom, where that is closer than the handoff).
// With the prologue in front of it (the homepage) there is nothing left to
// turn — its glide hands over the planet on the focal point, already facing
// the first chapter — so the window opens on the entrance's first frame and
// the dive begins there (GlobeMode's `windowStart` / `diveStart`): the
// planet goes straight on into the dive instead of holding still for a
// third of it.
const GLOBE_ENTRY_WINDOW = [0.06, 0.92] as const;
const GLOBE_TURN_END = 0.5;
const GLOBE_DIVE_START = 0.32;
const GLOBE_HANDOFF_AT = 0.84;
const GLOBE_HANDOFF_ZOOM = HOP.restZoom;
// The archive's air: a long flight's apex sees the planet's edge through it.
const GLOBE_FOG = {
  range: [9, 20] as [number, number],
  color: '#1B2319',
  'high-color': '#3b4330',
  'space-color': '#282c20',
  'horizon-blend': 0.09,
  'star-intensity': 0,
};

// The share of the entrance over which the route and his places print in on
// the planet as the dive begins (see the camera's "The places on the
// planet"); by its end the dive is at the zoom where they start to fade.
const PROLOGUE_INK_ENTRY = 0.15;

// The prologue globe's limb is lit air, not a halo all the way round: the
// planet light (src/lib/planetLight.ts) draws it on the lit side only, so the
// atmosphere itself keeps just a whisper of paper white. The lite light draws
// no air, and its fog carries the rim instead (see globeLook).
const PROLOGUE_FOG = SILVER_FOG;
const PROLOGUE_FOG_LITE = SILVER_FOG_LITE;

// Back to the start (see `beginOutbound`): the share of the trip's zoom-out
// (its first `entryShare`) over which the hop pose is carried from where the
// camera was onto the first place. It starts once the entrance has begun to
// pull out (a pan at the rest zoom would slide the map under the page) and is
// done before the planet is whole again.
const OUTBOUND_AIM: readonly [number, number] = [0.12, 0.55];

function globeEntryProgress(entry: number, mode: GlobeMode = FLAT_ENTRY_GLOBE) {
  const start = mode.windowStart;
  const end = GLOBE_ENTRY_WINDOW[1];
  return clamp01((entry - start) / (end - start));
}

// With the prologue in front of it, the globe has already been turned to North
// America by the time the entrance begins, so the entrance only descends.
const PROLOGUE_GLOBE = {
  // Where the prologue keeps the globe: its centre low on the right, most of
  // the disc off-screen, big enough to read as a planet rather than a map
  // (`cornerZoomFor`). It keeps that size through the glide: the dive starts
  // from it, so the planet never pulls back before it falls.
  centerX: 0.84,
  centerY: 0.93,
  zoom: 2.78,
  // The turn across the prologue is PROLOGUE_TURN (src/lib/globeLook.ts):
  // westward, 195° from the first screen's face to the first chapter.
  startLatitude: 9,
  // The stretch of the prologue spent gliding from the corner to the atlas
  // focus. It runs to the prologue's end, where the dive takes the planet on
  // from the very pose the glide arrives at: there is nothing to read on the
  // way (the index and the film roll that stood there are gone).
  glideStart: 0.35,
  glideEnd: 1,
  // The load-in: the canvas waits for its first tiles, then fades in while
  // the dawn sweeps the light round and the globe settles this many degrees
  // eastward — the way the drift and the scroll turn it — into place. (It used
  // to spin 150° into place and grow from a smaller disc, over a dark
  // wireframe and half-loaded tiles.)
  settle: 24,
  // How long the canvas may wait for those tiles before it shows anyway.
  revealCapMs: 3000,
  // Axial tilt while it sits in the corner; straightens during the glide.
  tilt: -14,
  // Left alone, the globe keeps turning — easing toward `driftMax` degrees
  // over roughly `driftTau` ms — and leans a few degrees toward the cursor.
  // The drift is part of the turn (see prologueTurnRemaining): the scroll
  // consumes it, so the globe never stalls or turns back.
  driftMax: 30,
  driftTau: 12000,
  pointerLongitude: 5,
  pointerLatitude: 3,
  // The cursor lean folds back to zero across this stretch, so the glide and
  // the dive always start from the exact scroll-owned pose.
  lifeFade: [0.2, 0.35] as [number, number],
  // A voyage that starts with the globe still in the corner (a ticket dealt
  // on the first screen) eases from the corner pose into the dive over this
  // long, instead of jumping the planet ~900px in one frame.
  voyageBridgeMs: 700,
} as const;
/** The corner globe's zoom: it keeps its share of the screen on wider
 *  displays (radius doubles per zoom level). The glide keeps it and the dive
 *  starts from it. */
function cornerZoomFor(viewportWidth: number) {
  return PROLOGUE_GLOBE.zoom + Math.log2(Math.max(0.75, viewportWidth / 1440));
}
// Reduced motion keeps the same globe, still. It holds two poses: the corner
// planet exactly as the first screen shows it (q = 0, before any drift) and
// the planet on the atlas's focal point (q = 1, where the dive starts).
// Nothing turns, drifts, leans or glides. Where the glide would be halfway
// the canvas dips out and comes back on the other pose; the dive into the
// first chapter (and the way back up) cuts to the ground and fades the new
// view in. The route and its places are drawn whole on the planet at once.
const STILL_SWAP_Q = (PROLOGUE_GLOBE.glideStart + PROLOGUE_GLOBE.glideEnd) / 2;
type StillPose = 'corner' | 'planet' | 'archive';
// The map canvas bleeds this far past the atlas column on every side
// (`-inset-8`), and the atlas focal point is the centre of the canvas once
// this padding is taken off its top and right.
const CANVAS_BLEED = 32;
const FOCAL_PADDING = { top: 48, right: 264 } as const;
// Where the covers' column starts, as a share of the atlas column: HomePage
// sets the atlas at 78% of the stage and pulls the archive column 36% back
// over it, so the column's left edge is at 42/78 of the atlas. A place whose
// key would land within SIDE_CLEARANCE of that edge sets it on its left.
const ARCHIVE_COLUMN_LEFT = 42 / 78;
const SIDE_CLEARANCE = 28;
// A place whose dot itself lands in the covers' column (its knockout's 5px
// inside the edge) is under the plates and their chapter headers: printed
// there, New York's "06" read into "01 / 06 · REGION FLORIDA" and its dot
// sat on the plate's corner like a rivet. It is not printed (unless the
// camera is on it or flying to it).
const UNDER_CLEARANCE = 5;
// How long the camera must have been still before the sides are taken.
const SIDES_REST_MS = 180;
// A transparent image round each place that the basemap's names keep out of:
// the dot, its key on either side, and the current place's landmark standing
// over it (64 × 38 css px, its centre 12px above the dot).
const ATLAS_KEEP_OUT = { id: 'atlas-keepout', width: 64, height: 38, offsetY: -12 } as const;
const PROLOGUE_SATELLITE_FADE: [number, number] = [3.3, 4.5];
// After the dive the photography does not vanish: it stays under the graded
// atlas at this strength, so chapters keep a little real ground.
const PROLOGUE_SATELLITE_RESIDUAL = 0.3;
// The dive's veil on the way down to that residual, as [zoom, opacity] pairs.
// It dips to 10% around SILVER_EXIT_ZOOM, where the one layer trades the
// silver print for the archive's own paint: at the old 30% the trade was a
// one-frame cut from the olive print to full colour (the Gulf's blue, the
// Bahamas' cyan) across the whole map, mid-dive and inside every voyage. Both
// sides of the exit's hysteresis sit inside the dip, and the veil is back at
// the residual by the handoff zoom, where the archive's own veil (below)
// takes over at the same strength.
const PROLOGUE_SATELLITE_OPACITY: readonly number[] = [
  PROLOGUE_SATELLITE_FADE[0], 1,
  SILVER_EXIT_ZOOM - 0.15, 0.1,
  SILVER_EXIT_ZOOM + 0.3, 0.1,
  GLOBE_HANDOFF_ZOOM, PROLOGUE_SATELLITE_RESIDUAL,
];
// In the archive: at a long flight's apex the camera climbs past the
// prologue's zoom keys, so a modest photographic veil (more real ground from
// higher up), never the prologue's full print.
const ARCHIVE_SATELLITE_OPACITY: readonly number[] = [3.1, 0.62, 4.6, PROLOGUE_SATELLITE_RESIDUAL];
// The fastest the veil (and the grade's exit, and the planet light's fade)
// follow the camera's zoom, per ms: 0.075 of a zoom level a frame keeps the
// steepest key under 0.07 of opacity a frame, about 2 L on the map. A long
// gap between draws still counts as one frame: the scroll often moves the
// camera only every other frame, and a double step landed on one frame (3.4 L
// at 1280); the catch-up frames take the rest.
const VEIL_ZOOM_RATE = 0.0045;
const VEIL_MAX_STEP_MS = 18;
/** The veil at `zoom` along [zoom, opacity] pairs, held flat past both ends.
 *  The camera writes it onto the layer as a plain number, never as a zoom
 *  expression: on the draped globe Mapbox caches each tile's drape and only
 *  re-evaluates a zoom expression when that tile is drawn again, so the veil
 *  stood still for a few frames and then caught up all at once — the whole
 *  map darkened ~7 L in one frame at zoom 3.6 on every dive. A written value
 *  redrapes every tile on the frame it changes. */
function satelliteOpacityAt(stops: readonly number[], zoom: number) {
  if (!(zoom > stops[0])) return stops[1];
  for (let index = 2; index < stops.length; index += 2) {
    if (zoom <= stops[index]) {
      const t = (zoom - stops[index - 2]) / (stops[index] - stops[index - 2]);
      return stops[index - 1] + (stops[index + 1] - stops[index - 1]) * t;
    }
  }
  return stops[stops.length - 1];
}

interface GlobeMode {
  turnDegrees: number;
  startZoom: number;
  /** Where the entrance's window opens on its score, and where in the window
   *  the dive begins (see GLOBE_ENTRY_WINDOW). */
  windowStart: number;
  diveStart: number;
  /** Where the globe was left when the prologue handed over; the entrance
   *  turns from here to the target instead of starting on the target. */
  startLongitude?: number;
}
const FLAT_ENTRY_GLOBE: GlobeMode = {
  turnDegrees: GLOBE_TURN_DEGREES,
  startZoom: GLOBE_START_ZOOM,
  windowStart: GLOBE_ENTRY_WINDOW[0],
  diveStart: GLOBE_DIVE_START,
};

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
  const dive = clamp01((progress - mode.diveStart) / (GLOBE_HANDOFF_AT - mode.diveStart));
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
  // The atlas's print mark: one 7px dot of white ink with a hard knockout
  // (the CSS), scaled and inked by how near its chapter is — .64 and .62 far
  // off, full size and full ink as its chapter arrives. No seat, no ring:
  // nothing is drawn round a place (owner, 2026-09-27). Scroll-owned, so the
  // ramp is the scroll's own.
  const dotScale = useTransform(emphasis, (strength) => 0.64 + 0.36 * strength);
  const dotOpacity = useTransform(emphasis, (strength) => 0.62 + 0.38 * strength);
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
    (strength) => `rgba(${MAP_INK_RGB}, ${0.42 + strength * 0.58})`,
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
        ease: EASE.arrive,
      }}
      className="relative flex h-11 w-11 items-center justify-center"
    >
      <motion.span
        className="living-mark__dot"
        style={{ scale: dotScale, opacity: dotOpacity }}
      />
      {interfaceVisible && (
        <motion.span
          style={{
            top: `calc(50% + ${clusterOffset}px)`,
            opacity: labelOpacity,
            x: labelX,
            color: labelColor,
          }}
          className={`living-mark__label pointer-events-none absolute top-1/2 min-w-max -translate-y-1/2 whitespace-nowrap font-ui text-[10px] uppercase tracking-[0.1em] ${labelOnLeft ? 'right-[2.15rem] text-right' : 'left-[2.15rem]'}`}
        >
          <motion.span className="living-mark__num mr-[10px] inline-block" style={{ color: indexColor }}>
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
  engagedChapterId = null,
  voyage = null,
  onEngage,
  onNavigate,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const routeAtlasRef = useRef<HTMLElement>(null);
  const classicMapFrameRef = useRef<Process | null>(null);
  const interfaceIntroPlayedRef = useRef(false);
  const viewportWidthRef = useRef(0);
  const cameraSyncedRef = useRef(false);
  // What the prologue camera, the planet light and the globe's easter eggs
  // share (see GlobeChannel). One object for the component's life: it outlives
  // the camera effect's restarts, so the drift and an egg's offset do too.
  const [globeChannel] = useState(createGlobeChannel);
  // The prologue canvas stays hidden until its first tiles are in (see the
  // reveal gate below): no dark wireframe, no half-loaded seam.
  const [globeRevealed, setGlobeRevealed] = useState(false);
  // The globe's easter eggs are for a mouse or a pen (and a keyboard beside
  // one): never on a touch screen, never under reduced motion (the globe is
  // still there, but it does not play).
  const [eggPointer, setEggPointer] = useState(false);
  const planetLightRef = useRef<PlanetLightLayer | null>(null);
  // The satellite's grade, veil and the graticule, as last written to the map.
  // The paint lives on the map, not in the camera effect, so none may reset
  // when that effect restarts. `archive` mirrors the camera's paint mode and
  // `lookQ` the progress the look is drawn at (1 once the prologue has handed
  // over, including a voyage's dive from the top), both for the light, as is
  // `fadeZoom`, the veil's own zoom (see VEIL_ZOOM_RATE), which the light
  // fades out on.
  const globeWritesRef = useRef({ silver: true, floor: Number.NaN, graticule: Number.NaN, archive: false, lookQ: 0, opacity: Number.NaN, fadeZoom: Number.NaN });
  const mapboxToken = getMapboxToken();
  const resolvedIndex = activeIndex >= 0 && activeIndex < stops.length ? activeIndex : -1;
  const living = presentation === 'living';
  const classicEntrance = !living && !mobile && !!entryProgress;
  // Reduced motion keeps the globe and its prologue (the same tree); only
  // their values change: still poses, and cuts where the glide and the dive
  // would move (see STILL_SWAP_Q).
  const classicGlobe = classicEntrance;
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
  // The zoom the entrance dives from: the corner globe's own (`cornerZoomFor`
  // this viewport), which the glide keeps, so the prologue hands over the
  // planet at the size it has. The entrance starts on the latitude the
  // prologue ends on (GLOBE_START_LATITUDE, 21°) and on the longitude it was
  // left at (`handoffLongitude`), with no turn of its own.
  const [diveZoom, setDiveZoom] = useState<number>(() => cornerZoomFor(1440));
  const globeMode = useMemo<GlobeMode>(
    () => (prologue ? { turnDegrees: 0, startZoom: diveZoom, windowStart: 0, diveStart: 0 } : FLAT_ENTRY_GLOBE),
    [diveZoom, prologue],
  );
  const [mapLoaded, setMapLoaded] = useState(false);
  // The ground the places are printed on: a layer inside the map, right after
  // its canvas and before its markers, holding the reading tone and the
  // viewfinder's scrim. Laid over the whole atlas they toned the marks as
  // well as the map — the current place measured 181/255, grey ink — so they
  // now darken the ground only, and the ink is printed over them.
  const [inkGround, setInkGround] = useState<HTMLElement | null>(null);
  // The ground spans the whole canvas; the tone covers the atlas column only
  // (its feather is a share of that column), so it is inset by the canvas's
  // bleed and the prologue's extension — both known, neither measured.
  useEffect(() => {
    if (!inkGround) return;
    inkGround.style.setProperty('--bleed', `${classicEntrance ? CANVAS_BLEED : 0}px`);
    inkGround.style.setProperty('--atlas-ext', `${canvasExtension}px`);
  }, [canvasExtension, classicEntrance, inkGround]);
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
  // ── The instruments on demand ── The atlas's instrument type — the
  // viewfinder's readouts, the tick timeline, the header — is not printed at
  // rest (owner, 2026-09-27: at rest a chapter reads as the place on the map,
  // the ticket, the city name and the lede). It comes up when it helps: the
  // viewfinder reports a flight and its landing on its own (AtlasSign), and
  // everything comes up while a hand is moving over the map. `data-atlas-look`
  // on this section says so (global.css, "The instruments on demand"); it is
  // written on pointer movement, not hover, so a pointer parked on the map
  // while the reader scrolls does not keep the whole panel lit — the panel
  // steps back ATLAS_LOOK_IDLE_MS after the hand stops, unless it rests on a
  // place or a tick. No layout is read: an attribute and a timer per move.
  const lookTimerRef = useRef(0);
  const lookArmedAtRef = useRef(0);
  const endAtlasLook = () => {
    window.clearTimeout(lookTimerRef.current);
    lookTimerRef.current = 0;
    lookArmedAtRef.current = 0;
    routeAtlasRef.current?.removeAttribute('data-atlas-look');
  };
  const noteAtlasLook = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') return;
    const atlas = event.currentTarget;
    if (!atlas.hasAttribute('data-atlas-look')) atlas.setAttribute('data-atlas-look', '');
    const now = event.timeStamp;
    // Re-armed at most every 200ms: the idle only needs to be roughly 3 s.
    if (lookTimerRef.current && now - lookArmedAtRef.current < 200) return;
    lookArmedAtRef.current = now;
    window.clearTimeout(lookTimerRef.current);
    const idle = () => {
      // A hand resting on a place or a tick is still using the instruments.
      if (atlas.querySelector('.af-point__mark:hover, .atlas-ticks__group:hover')) {
        lookTimerRef.current = window.setTimeout(idle, ATLAS_LOOK_IDLE_MS);
        return;
      }
      lookTimerRef.current = 0;
      atlas.removeAttribute('data-atlas-look');
    };
    lookTimerRef.current = window.setTimeout(idle, ATLAS_LOOK_IDLE_MS);
  };
  useEffect(() => () => window.clearTimeout(lookTimerRef.current), []);
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
  // The place the camera is FLYING to. Until now the map had no way to say it:
  // `plant(null)` fires 120ms after take-off, so for the whole 0.85–1.85s
  // flight the destination was drawn exactly like every place the camera was
  // not going to — the one mark the reader is watching was the one mark that
  // said nothing.
  const inboundStopRef = useRef<string | null>(null);
  // The places the archive has already passed are printed a little fuller
  // than the ones still ahead. Keyed on the place being flown to, or else the
  // place the camera is on — never on the current place alone: `plant(null)`
  // clears it just after take-off, and every visited place would drop back to
  // "ahead" for the whole flight and come back on landing.
  const markPast = () => {
    const elements = routeAtlasRef.current?.querySelectorAll<HTMLElement>('[data-af-stop]');
    if (!elements) return;
    const id = inboundStopRef.current ?? currentStopRef.current;
    let reached = 0;
    elements.forEach((element) => {
      if (element.dataset.afStop === id) reached = Number(element.dataset.chapter) || 0;
    });
    elements.forEach((element) => {
      element.classList.toggle('is-past', reached > 0 && Number(element.dataset.chapter) < reached);
    });
  };
  // Which side of its dot each place's key is set on: the left for a place in
  // reach of the covers' column, so its number never prints half under a
  // plate; and whether its dot is inside that column (`data-under`: not
  // printed, see UNDER_CLEARANCE). Written when the camera comes
  // down and when a place is committed, never per frame, and derived — the
  // camera's own projection against the layout's constant — not read off the
  // page.
  const markSides = () => {
    const atlas = routeAtlasRef.current;
    const map = mapRef.current?.getMap();
    if (!atlas || !map) return;
    const plateLeft = atlas.clientWidth * ARCHIVE_COLUMN_LEFT;
    atlas.querySelectorAll<HTMLElement>('[data-af-stop]').forEach((element) => {
      const entry = chapterRoute.find((candidate) => candidate.stop.id === element.dataset.afStop);
      if (!entry) return;
      const x = map.project(entry.stop.coordinates).x - CANVAS_BLEED;
      const side = x > plateLeft - SIDE_CLEARANCE ? 'left' : 'right';
      if (element.dataset.side !== side) element.dataset.side = side;
      const under = x > plateLeft - UNDER_CLEARANCE;
      if (under !== (element.dataset.under != null)) {
        if (under) element.dataset.under = '';
        else delete element.dataset.under;
      }
    });
  };
  const markInboundStop = (id: string | null) => {
    inboundStopRef.current = id;
    routeAtlasRef.current?.querySelectorAll<HTMLElement>('[data-af-stop]').forEach((element) => {
      element.classList.toggle('is-inbound', !!id && element.dataset.afStop === id);
    });
    markPast();
  };
  const markCurrentStop = (id: string | null) => {
    if (id) markInboundStop(null);
    currentStopRef.current = id;
    routeAtlasRef.current?.querySelectorAll<HTMLElement>('[data-af-stop]').forEach((element) => {
      element.classList.toggle('is-current', element.dataset.afStop === id);
    });
    routeAtlasRef.current?.querySelectorAll<HTMLElement>('[data-tick-group]').forEach((element) => {
      element.classList.toggle('is-current', element.dataset.tickGroup === id);
    });
    markPast();
    if (id) markSides();
  };
  // A dive from the globe lands by scroll, with no camera state to say so
  // (the dive is scroll-owned): the map's own `idle`, once it has drawn the
  // place it came to, is the rest it ends in.
  const markSidesRef = useRef(markSides);
  markSidesRef.current = markSides;
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!signs || !mapLoaded || !map) return;
    const onIdle = () => markSidesRef.current();
    map.on('idle', onIdle);
    return () => {
      map.off('idle', onIdle);
    };
  }, [mapLoaded, signs]);
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
  // Set while a story covers the atlas (`paused`), and read by the camera's
  // next run, when the story is closing: see "Resumed on another place".
  const coveredRef = useRef(false);

  const livingTravelProgress = useTransform(
    chapterSample,
    (sample) => sample?.routeProgress ?? 0,
  );
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
  // On a voyage it keeps the dive's own clock, as the interface does: the
  // page's scroll outruns the dive and crossed this band in five frames, so
  // the reading tone dropped over the planet mid-dive and darkened the whole
  // map column ~16 L at once.
  const archiveFrameOpacity = useTransform(
    [sampledEntryProgress, voyageEntry],
    ([progress, driven]) => (prologue ? entrancePhase(driven >= 0 ? driven : progress, 0.06, 0.42) : 1),
  );
  const fallbackPrologueProgress = useMotionValue(1);
  const resolvedPrologueProgress = prologueProgress ?? fallbackPrologueProgress;
  // The globe's load-in settle, played once when the map is revealed at the
  // top of the page (1 → 0). Held at 0 when the page opens mid-scroll.
  const globeIntro = useMotionValue(0);

  useEffect(() => {
    activeStopRef.current = activeStop;
  }, [activeStop]);

  const fullRouteCoordinates = useMemo(() => routeCoordinates(mappedStops), [mappedStops]);
  const fullRoute = useMemo(() => lineFeature(fullRouteCoordinates), [fullRouteCoordinates]);
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
      ease: EASE.arrive,
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

  // ── The load-in ── The prologue canvas stays hidden until the tiles of its
  // first pose are in (or `revealCapMs` has passed), so the reader never sees
  // Mapbox's dark wireframe or a half-loaded seam across the planet. Then,
  // together: the canvas fades in (700 ms, CSS), the dawn sweeps the key light
  // round from behind the planet (2.2 s) and the globe settles its last 24°
  // into place (2.6 s). A page that opens mid-scroll still waits for its tiles
  // but skips the dawn and the settle, and so does reduced motion: the globe
  // fades in already lit and in place. The first 90 dawn frames also decide
  // whether this machine needs the lighter light pass.
  const globeRevealPlayedRef = useRef(false);
  useEffect(() => {
    if (!prologue) return;
    if (!mapLoaded) {
      // The first prologue pose already carries the settle, so the tiles the
      // gate waits for are the ones that are shown.
      if (!globeRevealPlayedRef.current && !reducedMotion && resolvedPrologueProgress.get() < 0.02) globeIntro.set(1);
      return;
    }
    if (globeRevealPlayedRef.current) return;
    globeRevealPlayedRef.current = true;
    const map = mapRef.current?.getMap();
    const channel = globeChannel;
    const fromTop = !reducedMotion && resolvedPrologueProgress.get() < 0.02;
    globeIntro.set(fromTop ? 1 : 0);
    channel.dawn = fromTop ? 0 : 1;
    channel.veil = fromTop ? 1 : 0;
    const start = performance.now();
    let disposed = false;
    let pollTimer = 0;
    let readyPolls = 0;
    let dawnFrame = 0;
    let settle: ReturnType<typeof animate> | null = null;
    const markContainer = (key: string, value: string) => {
      const container = map?.getContainer();
      if (container) container.dataset[key] = value;
    };
    const decideLight = (intervals: number[]) => {
      const sorted = [...intervals].sort((a, b) => a - b);
      const p90 = sorted[Math.floor(0.9 * (sorted.length - 1))] ?? 0;
      const lite = p90 > 22;
      markContainer('globeLight', lite ? 'lite' : 'full');
      if (!lite || channel.lite) return;
      // One way, for the rest of the visit.
      channel.lite = true;
      planetLightRef.current?.setLite(true);
      // The archive keeps its own air (the camera sets the prologue's back
      // when the reader returns to it).
      if (map && !globeWritesRef.current.archive) map.setFog(PROLOGUE_FOG_LITE);
    };
    const reveal = (reason: 'tiles' | 'cap') => {
      if (disposed) return;
      channel.revealed = true;
      setGlobeRevealed(true);
      markContainer('globeGate', reason);
      markContainer('globeRevealAt', String(Math.round(performance.now())));
      // Wakes the camera and, with `revealed`, the idle drift.
      channel.requestDraw();
      if (!fromTop) {
        map?.triggerRepaint();
        return;
      }
      settle = animate(globeIntro, 0, { duration: 2.6, ease: EASE.arrive });
      const dawnStart = performance.now();
      const intervals: number[] = [];
      let last = 0;
      const step = (now: number) => {
        dawnFrame = 0;
        if (disposed) return;
        const t = clamp01((now - dawnStart) / 2200);
        channel.dawn = 1 - (1 - t) ** 3;
        const lift = clamp01((t - 0.35) / 0.65);
        channel.veil = 1 - lift * lift * (3 - 2 * lift);
        if (last && intervals.length < 90) {
          intervals.push(now - last);
          if (intervals.length === 90) decideLight(intervals);
        }
        last = now;
        map?.triggerRepaint();
        if (t < 1) dawnFrame = requestAnimationFrame(step);
      };
      dawnFrame = requestAnimationFrame(step);
    };
    const poll = () => {
      pollTimer = 0;
      if (disposed) return;
      let ready = false;
      try {
        ready = cameraSyncedRef.current && !!map &&
          map.isSourceLoaded('prologue-satellite') && map.areTilesLoaded();
      } catch {
        ready = false;
      }
      // Twice in a row, 40 ms apart: the first camera pose's tiles are only
      // requested on the render after the camera moves, so one "loaded" read
      // can still describe the map's initial view.
      readyPolls = ready ? readyPolls + 1 : 0;
      if (readyPolls >= 2) reveal('tiles');
      else if (performance.now() - start >= PROLOGUE_GLOBE.revealCapMs) reveal('cap');
      else pollTimer = window.setTimeout(poll, 40);
    };
    poll();
    return () => {
      disposed = true;
      window.clearTimeout(pollTimer);
      if (dawnFrame) cancelAnimationFrame(dawnFrame);
      settle?.stop();
      if (!channel.revealed) {
        // Interrupted before the reveal: the next run gates again.
        globeRevealPlayedRef.current = false;
        return;
      }
      globeIntro.set(0);
      channel.dawn = 1;
      channel.veil = 0;
    };
  }, [globeChannel, globeIntro, mapLoaded, prologue, reducedMotion, resolvedPrologueProgress]);

  useEffect(() => {
    if (!prologue) return;
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setEggPointer(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [prologue]);

  useLayoutEffect(() => {
    if (!prologue) {
      setCanvasExtension(0);
      return;
    }
    const atlas = routeAtlasRef.current;
    if (!atlas) return;
    // Widths only: horizontal geometry does not depend on the scroll.
    const viewportWidth = document.documentElement.clientWidth;
    const rect = atlas.getBoundingClientRect();
    const extension = Math.max(0, Math.round(viewportWidth - rect.right));
    setCanvasExtension((current) => (current === extension ? current : extension));
    // The dive starts from the corner globe's own size (see `diveZoom`); the
    // camera's prologue frames derive the same number from the same width.
    const zoom = cornerZoomFor(viewportWidth);
    setDiveZoom((current) => (Math.abs(current - zoom) < 0.0005 ? current : zoom));
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
  // reversible: scrolling back up to the opening restores the page-coloured veil
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
      if (paused) coveredRef.current = true;
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map) return;
    const covered = coveredRef.current;
    coveredRef.current = false;
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
    // The globe opening never leaves the globe (see "Globe opening"): nothing
    // swaps the projection any more, this only makes sure of it.
    if (classicGlobe && map.getProjection?.()?.name !== 'globe') map.setProjection('globe');
    let queuedPrologue = resolvedPrologueProgress.get();
    // Prologue "life": idle drift and cursor lean, advanced by a small rAF
    // loop below that only runs while the globe sits in the corner. The drift
    // lives on the globe channel, so a restart (resize) does not snap it back.
    let pointerX = 0;
    let pointerY = 0;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let lastBearingKey = Number.NaN;
    let prologuePaddingKey = '';
    // ── The places on the planet ──
    // The prologue's globe is unmarked photography: it glides in under the
    // first screen's type, and a route drawn on it crossed the line under his
    // name. As the dive begins (the first PROLOGUE_INK_ENTRY of the entrance)
    // the route and his places print in on it, all together and on the
    // scroll, so the planet the dive falls into is the archive's; the dive
    // then fades them with the zoom (their paint's zoom keys,
    // PROLOGUE_SATELLITE_FADE) as the archive's own marks come up. Going back
    // up they go out the same way. Reduced motion draws them whole on its
    // still planet. Data-driven paint does not transition, so the frames
    // write it: on a change of the quantised ink only, and never while an egg
    // has cut the marks (the egg puts back what it cut).
    const marks = { ink: Number.NaN, routeAllHidden: null as boolean | null };
    const writePrologueInk = (ink: number) => {
      if (globeChannel.marksHidden) {
        marks.ink = Number.NaN;
        return;
      }
      const quantised = Math.round(clamp01(ink) * 100) / 100;
      if (quantised === marks.ink || !map.getLayer('prologue-stops-dot') || !map.getLayer('prologue-route')) return;
      marks.ink = quantised;
      const [fadeFrom, fadeTo] = PROLOGUE_SATELLITE_FADE;
      const byZoom = (value: number) => ['interpolate', ['linear'], ['zoom'], fadeFrom, Math.round(value * 1000) / 1000, fadeTo, 0];
      map.setPaintProperty('prologue-stops-dot', 'circle-opacity', byZoom(quantised));
      map.setPaintProperty('prologue-stops-dot', 'circle-stroke-opacity', byZoom(quantised * 0.88));
      map.setPaintProperty('prologue-route', 'line-opacity', byZoom(quantised * 0.95));
    };
    // The archive's whole route (the same line) waits until the prologue's
    // own has printed in, so the two never come up over each other at
    // different paces: two dashed lines half in read as neither.
    const hideRouteAll = (hidden: boolean) => {
      if (marks.routeAllHidden === hidden) return;
      marks.routeAllHidden = hidden;
      ['route-all-glow', 'route-all-line'].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', hidden ? 'none' : 'visible');
      });
    };
    // The longitude the prologue globe was on when it handed over to the
    // entrance, so a voyage to a later chapter turns from there.
    let handoffLongitude = Number.NaN;
    const entryMode: GlobeMode = { ...globeMode };
    // The canvas reaches past the atlas column by `canvasExtension`; widening
    // the right padding by the same amount keeps every chapter's focal point
    // exactly where it was before the canvas grew.
    // The camera's focal point sits on the reading line, where the chapter's
    // photograph is: a bottom padding lifts the centre of the padded box up to
    // it. DERIVED, not measured. This block runs once per layout, and the
    // container's position in the viewport is scroll-dependent until the atlas
    // stage pins — so a rect read at the wrong scroll baked a wrong focal point
    // in for the rest of the session. It did: the bottom padding came out 0
    // where it should have been 84, and every place therefore landed 42px BELOW
    // the cross the viewfinder draws, on every chapter, for the whole session.
    //
    // Whenever the camera matters the stage IS pinned, and pinned means the
    // canvas sits at exactly -CANVAS_BLEED with the viewport's height plus one
    // bleed on each edge. That geometry can be computed, so it is.
    const focusHeight = window.innerHeight + 2 * CANVAS_BLEED;
    const focalTarget = ATLAS_READING_LINE * window.innerHeight + CANVAS_BLEED;
    // Signed: when the focal point sits below the box's centre the correction
    // belongs on `top` instead. The old `Math.max(0, …)` threw that half away
    // silently, which is exactly how a focal point can be wrong and never say so.
    const focalBottom = Math.round(focusHeight + FOCAL_PADDING.top - 2 * focalTarget);
    const activePadding = {
      top: FOCAL_PADDING.top + Math.max(0, -focalBottom),
      right: FOCAL_PADDING.right + (prologue ? canvasExtension : 0),
      bottom: Math.max(0, focalBottom),
      left: 0,
    };
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
    // `to`: the entry the driven clock ends on (1 into the archive, 0 out of
    // it). `outbound`: Back to the start — where the camera was when it set
    // off; the hop pose is carried from there onto the first place (see
    // hopStep) while the driven entry dives the globe out of the archive over
    // the first `share` of the trip. Past that the page is in the prologue,
    // and the prologue's own scroll takes the planet home (see `homeward`).
    let voyageState: {
      index: number;
      start: number;
      duration: number;
      dive: boolean;
      from: number;
      to: number;
      outbound?: { center: GeoCoordinate; zoom: number; share: number };
    } | null = null;
    let entryBlend: { from: number; start: number } | null = null;
    // A dive voyage that leaves while the globe is still in the prologue's
    // corner: the pose it left from, blended into the entrance's own pose (and
    // the corner padding into the focal padding) over voyageBridgeMs.
    let bridge: {
      t0: number;
      /** The prologue progress the look was last drawn at. */
      lookQ: number;
      center: GeoCoordinate;
      zoom: number;
      bearing: number;
      pitch: number;
      padding: { top: number; right: number; bottom: number; left: number };
    } | null = null;
    // The voyage's own sine in-out (voyageEase, src/lib/motion.ts): its
    // fastest stretch is only ~1.6× the average, so the dive (which the entry
    // curve already concentrates mid-way) never blinks past.
    const drivenEntry = (now: number) => {
      if (!voyageState || !voyageState.dive) return null;
      const t = clamp01((now - voyageState.start) / (voyageState.duration * (voyageState.outbound?.share ?? 1)));
      return voyageState.from + (voyageState.to - voyageState.from) * voyageEase(t);
    };
    // Back to the start, once its zoom-out is done: the planet is whole on the
    // focal point, the very pose the prologue holds at its end, and as soon as
    // the page is in the prologue its scroll glides the planet home.
    const homeward = (now: number) => !!voyageState?.outbound && (drivenEntry(now) ?? 1) <= 0;
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
    // Whether the entrance's camera has already come down on its place — the
    // same phase the draw below uses, which is done well before the entry
    // clock is (the globe's dive hands over at GLOBE_HANDOFF_AT of its
    // window, and only the settle is left). On a tall window (1728×1000,
    // 1080, 1440×900) the first chapter RESTS inside that tail: its
    // photograph is centred before the entry clock reads 1, so chapterMode()
    // is false there while the camera sits on (or settles onto) the hop
    // pose. A voyage from there must fly like any chapter's: the entrance's
    // pose follows the hop pose continuously, so the flight is drawn through
    // it. A dive re-aims the entrance at the destination at once, which cut
    // the camera there in one frame.
    const entryCameraAt = (entry: number) => {
      if (!entryProgress) return 1;
      if (classicGlobe) return globeEntryProgress(entry, entryMode);
      return classicEntrance ? entrancePhase(entry, ...ARCHIVE_ENTRANCE_PHASES.map) : clamp01(entry);
    };
    const cameraOnChapter = (now = performance.now()) => hopEnabled
      && (!prologue || queuedPrologue >= 1)
      && !drivenEntry(now)
      && entryCameraAt(effectiveEntry(now)) >= GLOBE_HANDOFF_AT;
    // ── Reduced motion: the still globe (see STILL_SWAP_Q) ──
    // The pose the canvas shows, and the one the scroll asks for; they differ
    // only while a swap runs. The swap never moves anything across the
    // screen: the canvas goes to the ground (dipping out over DUR_MS.flick
    // between the two planets, at once to or from the archive, whose
    // interface cuts in with it), the new pose is drawn, and the canvas comes
    // back over DUR_MS.in once the map has rendered it. On the canvas element
    // itself: React never styles it, so nothing re-renders. The fades are
    // WAAPI, not CSS transitions: the global reduced-motion guard in
    // global.css collapses every CSS transition, and an opacity fade is not
    // motion (a cut there would leave a blank beat instead of a dip).
    const stillCanvas = map.getCanvas();
    let stillShown: StillPose | null = null;
    let stillTimer = 0;
    let stillFadeIn = false;
    let stillFade: Animation | null = null;
    const stillWanted = (): StillPose => (queuedPrologue < 1
      ? (queuedPrologue >= STILL_SWAP_Q ? 'planet' : 'corner')
      : effectiveEntry() >= 0.5 ? 'archive' : 'planet');
    const stillReturn = () => {
      if (disposed) return;
      stillFade?.cancel();
      stillCanvas.style.opacity = '';
      stillFade = stillCanvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR_MS.in, easing: CSS_EASE.arrive });
    };
    const stillPose = (): StillPose => {
      const wanted = stillWanted();
      if (stillShown == null) stillShown = wanted;
      else if (wanted !== stillShown && !stillTimer) {
        const dipMs = wanted === 'archive' || stillShown === 'archive' ? 0 : DUR_MS.flick;
        stillFade?.cancel();
        stillCanvas.style.opacity = '0';
        stillFade = dipMs
          ? stillCanvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dipMs, easing: CSS_EASE.fade })
          : null;
        stillTimer = window.setTimeout(() => {
          stillTimer = 0;
          if (disposed) return;
          // Whatever the scroll asks for by now (it may have come back).
          stillShown = stillWanted();
          stillFadeIn = true;
          schedule(queuedSample);
        }, dipMs);
      }
      return stillShown;
    };
    // A fresh run (first draw, resize, late map load, Story close) snaps to the
    // place the scroll position commits to — it never replays a flight.
    const hysteresisFrom = (start: number, position: number) => {
      let next = Math.max(0, Math.min(lastRouteIndex, start));
      while (next < lastRouteIndex && position >= next + HOP.forward) next += 1;
      while (next > 0 && position <= next - HOP.back) next -= 1;
      return next;
    };
    // ── Tickets (see TEAR_BEFORE_FLIGHT_MS) ──
    // The chapter sections, looked up once and kept (a lookup again only if
    // React replaced the node). Reading a data attribute off them is not a
    // layout read, so the back gate below may ask on any sample.
    const ticketSections = new Map<number, HTMLElement | null>();
    const ticketSection = (routeIndex: number) => {
      const chapterIndex = chapterRoute[routeIndex]?.chapterIndex;
      if (chapterIndex == null || typeof document === 'undefined') return null;
      const cached = ticketSections.get(chapterIndex);
      if (cached?.isConnected) return cached;
      const section = document.querySelector<HTMLElement>(
        `[data-archive-chapter][data-chapter-index="${chapterIndex}"]`,
      );
      const ticket = section?.querySelector('.archive-plate--ticket') ? section : null;
      ticketSections.set(chapterIndex, ticket);
      return ticket;
    };
    const ticketTorn = (routeIndex: number) => ticketSection(routeIndex)?.dataset.ticketTornAt != null;
    // Going back from `from` toward `to`: the furthest place the camera may
    // return to, which is as far as the tickets on the way are whole again.
    // `from` itself when the ticket of the place just behind is still torn.
    const wholeBackTo = (from: number, to: number) => {
      let dest = from;
      while (dest > to && !ticketTorn(dest - 1)) dest -= 1;
      return dest;
    };
    const restartPosition = routePosition(queuedSample);
    const resumedFrom = committedPlaceRef.current;
    let committed = committedPlaceRef.current != null
      ? hysteresisFrom(committedPlaceRef.current, restartPosition)
      : Math.max(0, Math.min(lastRouteIndex, Math.floor(restartPosition + (1 - HOP.forward))));
    // A restart (Story close, resize) keeps the back gate too: re-deriving the
    // place must not snap the camera back onto a place whose ticket is torn.
    if (hopEnabled && committedPlaceRef.current != null && committed < committedPlaceRef.current) {
      committed = wholeBackTo(committedPlaceRef.current, committed);
    }
    committedPlaceRef.current = committed;
    // ── Resumed on another place ──
    // A story turned (Next) and then closed sets the page on the turned
    // story's chapter while the story still covers everything (HomePage's
    // close sets the chapter clock with it). The camera resumes on another
    // place than the one it stopped on. It cuts there on its first frame,
    // under the story, with the readout and the current mark: a glide from
    // where the map froze would carry the old place out from under the story
    // as it lifts, beside the new chapter's plate.
    const cutUnderCover = covered && hopEnabled && resumedFrom != null && committed !== resumedFrom;
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
    // A forward commit waiting for the covers it leaves to tear free (see
    // TEAR_BEFORE_FLIGHT_MS). It counts as made for the hysteresis — the scroll
    // has to come back as far as it would to undo a real commit — but
    // `committed` stays the camera's place and the camera stays where the
    // commit found it, leaning toward the place it is about to fly to. Every
    // other decision about the camera (launch, snap, settle, a voyage)
    // supersedes it.
    let heldHop: { dest: number; timer: number; since: number } | null = null;
    const dropHeldHop = () => {
      if (!heldHop) return;
      window.clearTimeout(heldHop.timer);
      heldHop = null;
    };
    // When every cover a commit from route place `from` to `to` leaves has
    // been free for a beat. Read once per commit (and once more at release),
    // never per frame. A ticket with no stamp is tearing on this very frame:
    // which of the two hears the scroll first is not fixed.
    const facesFreeAt = (from: number, to: number, now: number) => {
      let free = Number.NEGATIVE_INFINITY;
      for (let index = from; index < to; index += 1) {
        const section = ticketSection(index);
        if (!section) continue;
        const tornAt = Number(section.dataset.ticketTornAt ?? now);
        free = Math.max(free, (Number.isFinite(tornAt) ? tornAt : now) + TEAR_BEFORE_FLIGHT_MS);
      }
      return free;
    };
    // Pre-roll toward a neighbour: [index, amount 0..1].
    let preroll: [number, number] = [committed, 0];
    let hopFrame = 0;
    let lastHopTime = 0;
    let plantTimers: number[] = [];
    let paintMode: 'prologue' | 'archive' | null = null;
    // Whether the scroll's dive has set its camera down on the first place
    // (null until the entrance first draws; see the entrance's draw).
    let diveDown: boolean | null = null;
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
    // The chapter column's focus corners read this: the camera is flying to
    // the plate that is arriving, and lands on it. An attribute on <html>,
    // not React state — nothing may re-render mid-flight.
    // `data-atlas-landed-at` beside it is when the camera last came down on a
    // place ('flying' while it is in the air): a ticket is only SEEN once the
    // map under it has landed (src/lib/ticketLatch.ts, "The gate"). Missing
    // means long ago, so a page with no flight never holds a tear back.
    let cameraStateTimer = 0;
    const setCameraState = (state: 'flying' | 'locked' | 'rest') => {
      if (typeof document === 'undefined') return;
      window.clearTimeout(cameraStateTimer);
      const html = document.documentElement;
      if (state === 'flying') html.dataset.atlasLandedAt = 'flying';
      else if (state === 'locked' || html.dataset.atlasLandedAt === 'flying') {
        // Locked on arrival, or a snap or settle that ended a flight.
        html.dataset.atlasLandedAt = String(Math.round(performance.now()));
      }
      document.documentElement.dataset.atlasCamera = state;
      if (state === 'locked') {
        // The camera is down: each place's key takes its side for this view.
        markSides();
        cameraStateTimer = window.setTimeout(() => {
          if (document.documentElement.dataset.atlasCamera === 'locked') document.documentElement.dataset.atlasCamera = 'rest';
        }, 620);
      }
    };

    // A restart (first draw, resize, Story close) must not replay a flight —
    // but if the reader is the one moving, their commit is a real flight even
    // inside that window. Only scroll intent counts: a pointer moving over
    // the page, or the click that closed the Story, is not the reader
    // travelling.
    let readerDrove = false;
    const noteReaderDrove = () => { readerDrove = true; };
    ['wheel', 'keydown', 'touchstart'].forEach((type) => window.addEventListener(type, noteReaderDrove, { passive: true }));
    let settleTimer = 0;
    let sidesTimer = 0;
    // `atOnce`: the place is certain (a cut under a story), so its point is
    // marked current now rather than when the restart window closes.
    const settleSignOn = (index: number, atOnce = false) => {
      setCameraState('rest');
      const place = viewfinderPlace(index);
      if (place) viewfinderRef.current?.settle(place);
      const settledId = place?.id ?? null;
      window.clearTimeout(settleTimer);
      plantedLocal = settledId;
      settleTimer = window.setTimeout(() => {
        settleTimer = 0;
        if (!disposed) markCurrentStop(settledId);
      }, atOnce ? 0 : Math.max(HOP.settleStateMs, snapUntil - performance.now() + HOP.settleStateMs));
    };
    if (hopEnabled) settleSignOn(committed, cutUnderCover);

    // ── The silver print (see src/lib/globeLook.ts) ──
    // One layer carries it: `prologue-satellite` is printed in silver through
    // the prologue and the dive, and gets its own archive paint back once the
    // camera is past SILVER_EXIT_ZOOM or the atlas has the camera — a second
    // raster layer for the grade dropped whole tiles on the draped globe.
    const lookWrites = globeWritesRef.current;
    const prologueFog = () => (globeChannel.lite ? PROLOGUE_FOG_LITE : PROLOGUE_FOG);
    const applySatellitePaint = (silver: boolean) => {
      lookWrites.silver = silver;
      if (!map.getLayer('prologue-satellite')) return;
      const floor = silverFloorAt(lookWrites.lookQ);
      lookWrites.floor = silver ? floor : Number.NaN;
      Object.entries(silver ? silverPaint(floor) : stockPaint()).forEach(([key, value]) => {
        map.setPaintProperty('prologue-satellite', key as 'raster-color', value as never);
      });
    };
    // The scroll's paint: the ocean floor lifts (only while silver) and the
    // faint graticule comes and goes. Written only when the quantised value
    // changes — each ramp write rebuilds a texture. (`graticuleQ` lets a
    // voyage's bridge ease the light and the floor without the graticule
    // flickering through its mid-prologue band.)
    const writeLook = (q: number, graticuleQ = q) => {
      lookWrites.lookQ = q;
      if (lookWrites.silver && map.getLayer('prologue-satellite')) {
        const floor = silverFloorAt(q);
        if (floor !== lookWrites.floor) {
          lookWrites.floor = floor;
          map.setPaintProperty('prologue-satellite', 'raster-color', silverRamp(floor) as never);
        }
      }
      const graticule = globeLookAt(graticuleQ).graticule;
      if (graticule !== lookWrites.graticule && map.getLayer('prologue-graticule')) {
        lookWrites.graticule = graticule;
        map.setPaintProperty('prologue-graticule', 'line-opacity', ['interpolate', ['linear'], ['zoom'], 3.2, graticule, 3.6, 0]);
      }
    };

    const applyPaintMode = (mode: 'prologue' | 'archive') => {
      paintMode = mode;
      lookWrites.archive = mode === 'archive';
      // The archive always has its own paint back, even when a long flight's
      // apex climbs below the silver zoom.
      if (mode === 'archive' && lookWrites.silver) applySatellitePaint(false);
      if (map.getLayer('prologue-graticule')) {
        map.setLayoutProperty('prologue-graticule', 'visibility', mode === 'archive' ? 'none' : 'visible');
      }
      // The veil follows the mode's own keys from the next write on (see
      // writeSatelliteVeil). At a long flight's apex the prologue's route and
      // dots never come back.
      lookWrites.opacity = Number.NaN;
      ['prologue-route', 'prologue-stops-dot'].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', mode === 'archive' ? 'none' : 'visible');
      });
      // The prologue's air is a whisper of lit limb; the archive's is the
      // olive haze a long flight's apex sees the planet's edge through. Both
      // are the same globe, so the change is only ever in that haze.
      map.setFog(mode === 'archive' ? GLOBE_FOG : prologueFog());
    };
    // The veil, the silver grade's exit and the light's fade read the camera's
    // zoom through this: it follows the camera at no more than VEIL_ZOOM_RATE,
    // so a fling that carries the dive across the veil's steep keys (and the
    // light's 3.2–3.75 fade) in two or three frames no longer darkens the
    // whole map 4 L in one of them; past the fling it catches up within a
    // beat. All three read the same number, so the grade still trades paint
    // inside the dip however fast the dive goes. Reduced motion, and every
    // fresh start of this effect, take the camera's zoom as it is.
    let veilZoom = Number.NaN;
    let veilTime = 0;
    let veilFrame = 0;
    const followVeilZoom = (zoom: number, snap: boolean) => {
      const now = performance.now();
      if (snap || !Number.isFinite(veilZoom)) veilZoom = zoom;
      else {
        const reach = VEIL_ZOOM_RATE * Math.min(VEIL_MAX_STEP_MS, Math.max(0, now - veilTime));
        veilZoom += Math.max(-reach, Math.min(reach, zoom - veilZoom));
      }
      veilTime = now;
      return veilZoom;
    };
    // The satellite's veil, written as a number (see satelliteOpacityAt) and
    // only when its quantised value changes: nothing is written while a
    // chapter rests.
    const writeSatelliteVeil = (zoom: number) => {
      if (!map.getLayer('prologue-satellite')) return;
      const keys = paintMode === 'archive' ? ARCHIVE_SATELLITE_OPACITY : PROLOGUE_SATELLITE_OPACITY;
      const opacity = Math.round(satelliteOpacityAt(keys, zoom) * 500) / 500;
      if (opacity === lookWrites.opacity) return;
      lookWrites.opacity = opacity;
      map.setPaintProperty('prologue-satellite', 'raster-opacity', opacity);
    };

    const clearPlantTimers = () => {
      plantTimers.forEach((timer) => window.clearTimeout(timer));
      plantTimers = [];
    };

    const launch = (dest: number, now: number) => {
      dropHeldHop();
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
      setCameraState('flying');
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
      markInboundStop(destId);
      if (plantedLocal !== destId) {
        plantTimers.push(window.setTimeout(() => plant(null), HOP.unplantDelay));
        plantTimers.push(window.setTimeout(() => plant(destId), Math.max(HOP.unplantDelay + 60, duration)));
      }
      wakeHop();
    };

    const snapTo = (index: number) => {
      dropHeldHop();
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
    // Outside the archive (the entrance, or a jump back to the start) the
    // committed place still follows the scroll — without a flight: the pose
    // glides to it through the follow smoothing, and any flight in progress is
    // dropped, so the entrance never dives onto a stale place.
    const settleTo = (index: number) => {
      dropHeldHop();
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
    // The held commit's clock has run out: the faces are free, go. The stamps
    // are read once more first — a cover that latched a frame after this
    // commit armed its hold from the atlas's clock, not its own — and the
    // hold re-arms for what is left, never past TEAR_HOLD_CAP_MS from the
    // commit to this destination.
    const releaseHeldHop = () => {
      if (disposed || !heldHop) return;
      const { dest, since } = heldHop;
      heldHop = null;
      if (voyageState || !chapterMode() || dest === committed) return;
      const now = performance.now();
      const wait = Math.min(facesFreeAt(committed, dest, now), since + TEAR_HOLD_CAP_MS) - now;
      if (wait > 1) {
        heldHop = { dest, since, timer: window.setTimeout(releaseHeldHop, wait) };
        return;
      }
      preroll = [dest, 0];
      launch(dest, now);
    };
    // Holds a forward commit to `dest` until the faces it leaves are free.
    // False when there is nothing left to wait for. Asked again on every
    // scroll sample while held, so the cap is kept here too: a cover with no
    // stamp yet counts as tearing now, and without the cap a reader who went
    // on scrolling would push the flight back on every sample.
    const holdFor = (dest: number, now: number) => {
      const since = heldHop && heldHop.dest === dest ? heldHop.since : now;
      const wait = Math.min(facesFreeAt(committed, dest, now), since + TEAR_HOLD_CAP_MS) - now;
      if (!(wait > 0)) return false;
      if (heldHop) window.clearTimeout(heldHop.timer);
      heldHop = { dest, since, timer: window.setTimeout(releaseHeldHop, wait) };
      return true;
    };
    // `immediate`: a reconcile after a voyage, which is not the reader tearing
    // a ticket, so it is never held.
    const evaluateCommit = (sample: ChapterSample | null, immediate = false) => {
      if (!hopEnabled || voyageState) return;
      const position = routePosition(sample);
      const next = hysteresisFrom(heldHop ? heldHop.dest : committed, position);
      if (!chapterMode()) {
        // In the entrance there are no flights, only the glide — but the
        // glide home waits for the re-seat too (the first cover sits inside
        // the entrance runway on some screens), so the entrance pulls out
        // from the place the camera is on until then.
        const settle = next < committed && !immediate ? wholeBackTo(committed, next) : next;
        if (settle !== committed || flight || heldHop) settleTo(settle);
        return;
      }
      if (heldHop) {
        // Still ahead of the camera: keep holding. A fling that commits
        // further on (or comes back one) waits for the faces it now leaves.
        if (next > committed) {
          // The same destination is asked again too: a cover re-stamped by
          // a harder push is free sooner, and its release comes forward.
          const now = performance.now();
          if (!holdFor(next, now)) {
            preroll = [next, 0];
            launch(next, now);
          }
          return;
        }
        // Back to the camera's place or behind it: the held flight never
        // happens.
        dropHeldHop();
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
      // Back: return only as far as the tickets are whole again. Until the
      // place just behind re-seats, the camera stays where it is, poised
      // toward it (the pre-roll is left as the back line found it); the
      // re-seat itself re-runs this (see the ticket observer below), so the
      // flight home takes off on the frame the face starts rising back. A
      // restart snap is gated the same way: it must not land the camera on a
      // place whose cover is missing either.
      let dest = next;
      if (next < committed && !immediate) {
        dest = wholeBackTo(committed, next);
        if (dest === committed) return;
      }
      const now = performance.now();
      if (!readerDrove && !flight && now < snapUntil) {
        snapTo(dest);
        return;
      }
      // Forward: take off once the cover being left is torn free. While it
      // tears the pre-roll is left as it is, so the camera waits poised toward
      // the next place instead of easing back.
      if (dest > committed && !immediate && holdFor(dest, now)) return;
      preroll = [dest, 0];
      launch(dest, now);
    };

    // Touchdown: the camera state says so, the viewfinder locks and the place
    // plants. Called once per flight (`lockCalled`).
    const lockFlight = (landing: Flight, now: number) => {
      landing.lockCalled = true;
      setCameraState('locked');
      const destPlace = viewfinderPlace(landing.dest);
      if (destPlace) viewfinderRef.current?.hunt(destPlace, now + HOP.lockSnapMs);
      const destId = destPlace?.id ?? null;
      if (plantedLocal !== destId) {
        clearPlantTimers();
        plantTimers.push(window.setTimeout(() => plant(destId), HOP.lockSnapMs));
      }
    };

    // There used to be an idle sway here: left alone over a chapter for 30s the
    // resting camera drifted ±11px on an 11-second sine with a 0.01 zoom
    // breath. It was deliberate and it was the wrong instinct for this page —
    // a place on this map is a FIXED point, and a background that wanders while
    // the reader is reading is the map sliding out from under the photograph
    // it is supposed to be holding still for. A landed camera now holds.
    const hopStep = (time: number) => {
      hopFrame = 0;
      if (disposed) return;
      const dt = lastHopTime ? Math.min(64, time - lastHopTime) : 16.7;
      lastHopTime = time;
      const now = performance.now();
      if (voyageState?.outbound) {
        // Back to the start: the hop pose goes from where the camera set off
        // onto the first place (the entrance's pose sits on it until the
        // globe starts to pull out, past OUTBOUND_AIM of the zoom-out).
        const { center, zoom, share } = voyageState.outbound;
        const t = clamp01((now - voyageState.start) / (voyageState.duration * share));
        const k = smootherstep(clamp01((t - OUTBOUND_AIM[0]) / (OUTBOUND_AIM[1] - OUTBOUND_AIM[0])));
        targetCenter = greatCirclePoint(center, restCenter(0), k);
        targetZoom = zoom + (restZoom(0) - zoom) * k;
      } else if (flight) {
        const t = clamp01((now - flight.start) / flight.duration);
        const s = flight.ease(t);
        const along = flight.path.at(s);
        targetCenter = mercatorLerp(flight.originCenter, flight.destCenter, along.u);
        targetZoom = flight.originZoom + along.dz - flight.extraLift * Math.sin(Math.PI * s);
        // Going on, the lit line is thrown ahead and arrives before the
        // camera. Coming back, it is given up under the camera instead of on
        // a schedule: `along.u` is the fraction of the leg already covered,
        // so the bright end sits on the ground the camera is over.
        const routeT = flight.trimTo >= flight.trimFrom
          ? 1 - Math.pow(1 - clamp01(t / HOP.routeShare), 3)
          : along.u;
        hopTrim = flight.trimFrom + (flight.trimTo - flight.trimFrom) * routeT;
        if (t >= 1) {
          // One long frame — a GC pause, or the tab left in the background
          // (rAF stops) — can carry the clock past the end before the camera
          // is within lockPx. The lock check below only runs for a flight still
          // in the air, so without this the arrival was never called: the
          // camera state stayed 'flying' for good (measured: reproduced with a
          // 2.2 s stall mid-flight), the reading tone never settled, the
          // tickets' landing gate stayed shut and the sign never reported.
          if (!flight.lockCalled) lockFlight(flight, now);
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
        if (arrival < HOP.lockPx || now - flight.start >= flight.duration) lockFlight(flight, now);
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
      evaluateCommit(queuedSample, true);
      wakeHop();
      schedule(queuedSample);
    };
    const beginVoyage = (next: AtlasVoyage | null) => {
      if (!next) {
        endVoyage();
        return;
      }
      if (!hopEnabled) return;
      if (next.outbound) {
        beginOutbound(next.duration, next.outbound.entryShare);
        return;
      }
      const index = chapterRoute.findIndex((entry) => entry.stop.id === next.chapterId);
      if (index < 0) return;
      const now = performance.now();
      // A voyage goes at once, even from under a held commit: the reader asked
      // to be taken there.
      dropHeldHop();
      const onChapter = chapterMode() || cameraOnChapter(now);
      entryBlend = null;
      if (onChapter) {
        voyageState = { index, start: now, duration: next.duration, dive: false, from: 1, to: 1 };
        if (committed !== index) {
          preroll = [index, 0];
          launch(index, now);
        }
      } else {
        voyageState = { index, start: now, duration: next.duration, dive: true, from: effectiveEntry(now), to: 1 };
        if (prologue && queuedPrologue < 0.98) {
          const center = map.getCenter();
          const padding = map.getPadding();
          bridge = {
            t0: now,
            lookQ: lookWrites.lookQ,
            center: [center.lng, center.lat],
            zoom: map.getZoom(),
            bearing: map.getBearing(),
            pitch: map.getPitch(),
            padding: { top: padding.top, right: padding.right, bottom: padding.bottom, left: padding.left },
          };
        }
        snapTo(index);
      }
      wakeHop();
      schedule(queuedSample);
    };
    voyageHandlerRef.current = beginVoyage;
    // ── Back to the start: one zoom-out, then the prologue home ──
    // Left to the scroll, the camera flew back place by place (each flight
    // retargeted mid-air), then — the moment the page left the archive —
    // was pulled back IN onto the first place before the entrance zoomed it
    // out: a 0.4-level bump over Miami, and a zoom-out so steep that the
    // silver grade (which follows a rate-limited zoom) arrived ~300ms after
    // the planet did. Instead the trip drives the entry clock from here down
    // to 0 over the first `share` of the page's own time and curve (the page
    // is at the prologue's end by then, see HomePage's backToStart), and
    // carries the hop pose from where the camera is onto the first place over
    // the middle of that (OUTBOUND_AIM), while the entrance's pose still sits
    // on it; the entrance then pulls the planet out to the pose the prologue
    // holds at its end (the corner globe's size on the focal point, turned to
    // the first place), and from there the prologue's own scroll glides it
    // home to the corner as the page climbs the first screen (`homeward`).
    // The zoom only ever falls. Outside the archive (the camera still in the
    // entrance or on the globe) the scroll has it, as before.
    const beginOutbound = (duration: number, share: number) => {
      const now = performance.now();
      if (!prologue || !classicGlobe || !(chapterMode() || cameraOnChapter(now))) return;
      dropHeldHop();
      entryBlend = null;
      flight = null;
      clearPlantTimers();
      // Where the prologue's frames will turn the planet at their end (q = 1),
      // taken the short way round from the first place.
      const home = restCenter(0);
      const natural = prologueNaturalLongitude(home[0], 1, globeChannel.drift, PROLOGUE_GLOBE.settle * globeIntro.get());
      const longitude = globeChannel.compose(natural, 1) + globeChannel.wobble;
      entryMode.startLongitude = home[0] + wrap180(longitude - home[0]);
      voyageState = {
        index: 0,
        start: now,
        duration,
        dive: true,
        from: effectiveEntry(now),
        to: 0,
        outbound: { center: [hopCenter[0], hopCenter[1]], zoom: hopZoom, share: clamp01(share) || 1 },
      };
      wakeHop();
      schedule(queuedSample);
    };
    const wakeHop = () => {
      if (hopFrame || disposed) return;
      lastHopTime = 0;
      hopFrame = requestAnimationFrame(hopStep);
    };
    // Assert the resting pose on entry — which includes every resume after a
    // story has covered the atlas, since this effect tears down and rebuilds on
    // `paused`. `hopCenter`/`hopZoom` are re-initialised above to the committed
    // chapter's exact resting pose, but the MAP is wherever it froze when the
    // loop last stopped, and the loop stops as soon as its gap falls under
    // 0.3px. Nothing ever closed that gap: the controller's own reading was
    // zero while the place sat several pixels off its point, so returning from
    // a story left it there for good. Measured before this: closing a story
    // moved the landed place 5.1px and it never came back. A place on this map
    // is a fixed point — say so, once, at the moment the camera takes over.
    // Seed the controller from where the map ACTUALLY is, not from where it
    // assumes it left off — then let it converge and snap as it always does.
    //
    // This effect tears down and rebuilds whenever the atlas is paused, which a
    // story does every time it covers it. On rebuild `hopCenter`/`hopZoom` were
    // re-initialised to the committed chapter's ideal resting pose while the
    // MAP stayed wherever the loop froze — and the loop freezes as soon as its
    // gap falls under 0.3px. So the controller read a gap of zero while the
    // place sat several pixels off its point, and nothing ever closed it:
    // measured, closing a story moved the landed place 5.1px and it never came
    // back. Seeding from the live camera makes the gap real again, and the
    // existing settle-and-snap at the end of hopStep does the rest.
    //
    // (`prologue` is a capability — "this atlas HAS an opening" — and stays true
    // deep in the archive. Whether the opening has FINISHED is queuedPrologue.)
    //
    // Not after a cut under a story (see "Resumed on another place"): the hop
    // pose is already the new place's rest pose, and the first frame jumps the
    // map onto it exactly.
    if (!cutUnderCover && chapterMode() && queuedPrologue >= 1 && !voyageState && queuedEntry > 0.98) {
      const live = map.getCenter();
      hopCenter = [live.lng, live.lat];
      hopZoom = map.getZoom();
      wakeHop();
    }

    const draw: Process = () => {
      if (disposed) return;
      classicMapFrameRef.current = null;
      // An egg cuts the white-ink marks while the print is smeared or
      // exposed, and brings them back with its landing (on a change only).
      if (prologue) setEggMarks(map, globeChannel.marksHidden);
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
      // Reduced motion: the pose on the canvas decides (a swap finishes on
      // the pose it started from before the new one is drawn). Back to the
      // start hands the camera back to the prologue once its zoom-out is done.
      const still = reducedMotion && prologue ? stillPose() : null;
      const inPrologue = prologue && !!sample && !!canvasBox && (still
        ? still !== 'archive'
        : queuedPrologue < 1 && !(voyageState && voyageState.dive && !homeward(performance.now())));
      if (bridge && !(voyageState && voyageState.dive)) bridge = null;
      // While the bridge runs, the padding travels inside its jumpTo instead.
      if (!inPrologue && !bridge && padded !== focused) {
        padded = focused;
        map.setPadding(focused ? activePadding : neutralPadding);
      }

      if (inPrologue && sample && canvasBox) {
        // ── Globe prologue ── the lit globe low in the bottom-right corner,
        // turning with the page; past the first screen it glides into the
        // atlas focus, at its own size, and arrives exactly at the entrance's
        // starting pose. Reduced motion draws only the two ends of it: the
        // corner at q = 0, the planet at q = 1 (no drift or lean ever runs
        // there, and no settle).
        const q = still ? (still === 'planet' ? 1 : 0) : clamp01(queuedPrologue);
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
        // The cursor lean folds away before the glide. The drift does not have
        // to: the turn consumes it (prologueTurnRemaining), so it never runs
        // against the scroll.
        const life = 1 - smootherstep(clamp01((q - lifeStart) / (lifeEnd - lifeStart)));
        const drift = still ? 0 : globeChannel.drift;
        // The cursor lean is part of the globe's own longitude here, inside
        // whatever an egg composes: a globe an egg has pinned holds against the
        // lean folding away too, instead of creeping back while it is held.
        const natural = prologueNaturalLongitude(target[0], q, drift, PROLOGUE_GLOBE.settle * intro) +
          pointerX * PROLOGUE_GLOBE.pointerLongitude * life;
        globeChannel.natural = natural;
        globeChannel.remaining = prologueTurnRemaining(q, drift);
        const center: GeoCoordinate = [
          globeChannel.compose(natural, q) + globeChannel.wobble,
          PROLOGUE_GLOBE.startLatitude + (GLOBE_START_LATITUDE - PROLOGUE_GLOBE.startLatitude) * smootherstep(q) +
            pointerY * PROLOGUE_GLOBE.pointerLatitude * life,
        ];
        handoffLongitude = center[0];
        const bearing = PROLOGUE_GLOBE.tilt * (1 - glide);
        // The corner globe's size, handed to the entrance exactly (the
        // entrance's copy is set per layout from the same width).
        const cornerZoom = cornerZoomFor(viewportWidth);
        const zoom = cornerZoom + (globeMode.startZoom - cornerZoom) * glide;
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
        // Unmarked until the dive (see "The places on the planet"); reduced
        // motion has them whole on its still planet, none on the corner.
        writePrologueInk(still === 'planet' ? 1 : 0);
        hideRouteAll(true);
        writeLook(q);
        // Leaving the prologue must resubmit the atlas padding.
        padded = null;
      } else if (sample && focused) {
        // With hops, the entrance (and every non-flying frame) aims at the
        // committed place's rest pose rather than the scrubbed route head.
        const aim: ChapterSample = hopEnabled
          ? { ...sample, coordinate: hopCenter, zoom: hopZoom, pitch: CHAPTER_PITCH, bearing: CHAPTER_BEARING }
          : sample;
        if (prologue && prologuePaddingKey) prologuePaddingKey = '';
        // Enter The Route through geography, not through a scaled interface
        // panel. The same scroll-owned entry clock carries the camera from a
        // continental overview into the first chapter, so slow, fast and
        // reverse gestures all resolve to the exact same optical state.
        // The formal entrance uses the same geographic phase as the map plane;
        // after that phase ends, the existing chapter camera is untouched.
        // Reduced motion's archive pose holds until its swap has finished.
        const entryNow = still === 'archive' ? 1 : effectiveEntry();
        // Past the prologue (or diving from it on a voyage) the route and his
        // places print in as the dive begins, and fade with it (see "The
        // places on the planet"). The archive's own route joins under the
        // prologue's once that is whole: the same line, so it comes in unseen.
        if (prologue) {
          const ink = still ? 1 : smootherstep(clamp01(entryNow / PROLOGUE_INK_ENTRY));
          writePrologueInk(ink);
          hideRouteAll(ink < 1);
        }
        // The scroll's dive is a flight too (see setCameraState): until its
        // camera has settled on the first place (the end of its window) the
        // map is in the air for the tickets' gate, so chapter 1's ticket,
        // which comes up the page with the dive, counts as seen only once
        // the map under it is down, as every other ticket does after its
        // flight. (The film roll's landing used to hold it back, until the
        // roll went.) The attribute alone: the camera's own state (the
        // focus corners) stays the hop controller's, and voyages keep theirs.
        if (prologue && hopEnabled && !voyageState) {
          const down = entryCameraAt(entryNow) >= 1;
          if (down !== diveDown) {
            const html = document.documentElement;
            if (!down) html.dataset.atlasLandedAt = 'flying';
            else if (diveDown === false) html.dataset.atlasLandedAt = String(Math.round(performance.now()));
            diveDown = down;
          }
        }
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
          // Where the prologue left the globe, taken the short way round to
          // the place: an egg may have spun it a turn or two past it.
          if (prologue && Number.isFinite(handoffLongitude)) {
            entryMode.startLongitude = aim.coordinate[0] + wrap180(handoffLongitude - aim.coordinate[0]);
          }
          const globePose = globeEntryPose(aim, globeEntryProgress(entryNow, entryMode), entryMode);
          entryCoordinate = globePose.center;
          entryZoom = globePose.zoom;
          entryPitch = globePose.pitch;
          entryBearing = globePose.bearing;
        }
        let bridgedPadding: typeof activePadding | null = null;
        // Past the prologue (or diving on a voyage from it) the globe is lit
        // and graded as at the prologue's end; a voyage leaving the corner
        // swings the light round with the bridge below, not on its first frame.
        let lookQ = 1;
        if (bridge) {
          const t = (performance.now() - bridge.t0) / PROLOGUE_GLOBE.voyageBridgeMs;
          if (t >= 1) {
            bridge = null;
            bridgedPadding = activePadding;
          } else {
            // Smootherstep, not an expo: its fastest frame moves the planet
            // under 50px, where an expo's first frame carried it ~150px.
            const k = smootherstep(clamp01(t));
            lookQ = bridge.lookQ + (1 - bridge.lookQ) * k;
            const from = bridge.padding;
            entryCoordinate = [
              bridge.center[0] + wrap180(entryCoordinate[0] - bridge.center[0]) * k,
              bridge.center[1] + (entryCoordinate[1] - bridge.center[1]) * k,
            ];
            entryZoom = bridge.zoom + (entryZoom - bridge.zoom) * k;
            entryPitch = bridge.pitch + (entryPitch - bridge.pitch) * k;
            entryBearing = bridge.bearing + (entryBearing - bridge.bearing) * k;
            bridgedPadding = {
              top: from.top + (activePadding.top - from.top) * k,
              right: from.right + (activePadding.right - from.right) * k,
              bottom: from.bottom + (activePadding.bottom - from.bottom) * k,
              left: from.left + (activePadding.left - from.left) * k,
            };
          }
        }
        // The prologue's faint graticule goes at once, as it always has.
        if (prologue) writeLook(lookQ, 1);
        if (chapterMode()) {
          // Inside the archive the hop controller owns the camera.
          entryCoordinate = hopCenter;
          entryZoom = hopZoom;
          entryPitch = CHAPTER_PITCH;
          entryBearing = CHAPTER_BEARING;
          // The archive has the camera: an egg's pin on the prologue globe is
          // let go, and the entrance — should the reader scroll back up
          // through it — turns from the place again, not from wherever the
          // globe was once left (the prologue meets it there at q = 1).
          if (prologue && (Number.isFinite(handoffLongitude) || !Number.isNaN(globeChannel.pin))) {
            handoffLongitude = Number.NaN;
            entryMode.startLongitude = undefined;
            globeChannel.pin = Number.NaN;
            globeChannel.offset = 0;
          }
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
        if (bridgedPadding || lastOverview || coordinateChanged || zoomChanged || poseChanged) {
          map.jumpTo({
            center: entryCoordinate,
            zoom: entryZoom,
            bearing: entryBearing,
            pitch: entryPitch,
            ...(bridgedPadding ? { padding: bridgedPadding } : null),
          });
          lastCoordinate = entryCoordinate;
          lastZoom = entryZoom;
          lastPitch = entryPitch;
          lastBearing = entryBearing;
          lastOverview = false;
          // The places' sides (and which sit under the covers) once this
          // camera has come to rest: the entrance's settle onto chapter 1
          // never locks, and the map's own idle did not always come after
          // it, so New York kept a side taken mid-dive over chapter 1's
          // header. Once, SIDES_REST_MS after the last camera write.
          window.clearTimeout(sidesTimer);
          sidesTimer = window.setTimeout(() => {
            if (!disposed) markSides();
          }, SIDES_REST_MS);
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
        // Reduced motion has no hop controller: the archive is its archive pose.
        const mode = (still ? still === 'archive' : chapterMode()) ? 'archive' : 'prologue';
        if (mode !== paintMode) applyPaintMode(mode);
        // The silver print holds through the prologue and the dive, and hands
        // the layer its archive paint back past SILVER_EXIT_ZOOM (±0.1, so a
        // camera resting on the line cannot flicker between the two).
        const zoomNow = map.getZoom();
        const zoomVeil = followVeilZoom(zoomNow, !!still);
        const wantSilver = mode !== 'archive' && zoomVeil < SILVER_EXIT_ZOOM +
          (lookWrites.silver ? SILVER_EXIT_HYSTERESIS : -SILVER_EXIT_HYSTERESIS);
        if (wantSilver !== lookWrites.silver) applySatellitePaint(wantSilver);
        writeSatelliteVeil(zoomVeil);
        // The light fades on the same zoom. While it is still on the planet a
        // new value needs a frame of its own even when nothing else changed
        // (the veil holds at 1 until zoom 3.3, so it writes nothing there).
        if (zoomVeil !== lookWrites.fadeZoom) {
          lookWrites.fadeZoom = zoomVeil;
          if (mode !== 'archive' && zoomVeil < 3.8) map.triggerRepaint();
        }
        // Still catching up with a fling: draw again next frame (the camera
        // itself may already be at rest). Not through schedule() from in
        // here — the frame loop would fold it into this very frame and drop it.
        if (Math.abs(zoomVeil - zoomNow) > 0.0005 && !veilFrame) {
          veilFrame = requestAnimationFrame(() => {
            veilFrame = 0;
            schedule(queuedSample);
          });
        }
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
      // A still swap's new pose is on the map now: bring the canvas back once
      // it has been rendered, never over the pose it replaced.
      if (stillFadeIn) {
        stillFadeIn = false;
        map.once('render', stillReturn);
        map.triggerRepaint();
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
    // The ticket observer. A cover's latch and this controller both hear the
    // same scroll frame, in no fixed order, and the scroll may stop on that
    // frame: when a ticket tears or re-seats, the commit is looked at again
    // with the latest sample, so a back commit waiting on a re-seat takes off
    // on it rather than on the next wheel tick (which may never come). Only
    // the one attribute is watched; it changes a few times per chapter.
    const ticketObserver = hopEnabled && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => {
          if (!disposed) evaluateCommit(queuedSample);
        })
      : null;
    ticketObserver?.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-ticket-torn-at'],
    });
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
    // The drift starts with the reveal: before it the canvas is hidden, and the
    // settle carries the first seconds. Reduced motion's globe has no life.
    const lifeActive = () => prologue && !reducedMotion && globeChannel.revealed &&
      queuedPrologue < PROLOGUE_GLOBE.lifeFade[1] && document.visibilityState === 'visible';
    const lifeStep = (time: number) => {
      lifeFrame = 0;
      if (disposed || !lifeActive()) {
        lastLifeTime = 0;
        return;
      }
      const dt = lastLifeTime ? Math.min(64, time - lastLifeTime) : 16.7;
      lastLifeTime = time;
      const previousDrift = globeChannel.drift;
      const previousX = pointerX;
      const previousY = pointerY;
      // A hand on the globe (an egg) holds both where they are.
      if (!globeChannel.driftFrozen) {
        globeChannel.drift += (PROLOGUE_GLOBE.driftMax - globeChannel.drift) * (1 - Math.exp(-dt / (PROLOGUE_GLOBE.driftTau / 3)));
      }
      if (!globeChannel.leanFrozen) {
        const lean = 1 - Math.exp(-dt / 320);
        pointerX += (pointerTargetX - pointerX) * lean;
        pointerY += (pointerTargetY - pointerY) * lean;
      }
      const moving = Math.abs(globeChannel.drift - previousDrift) > 0.0004 ||
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
      // The lean follows a hovering cursor only. A pressed hand dragging
      // across the page is not asking the globe to turn: it holds its lean
      // from the press, and the next free move eases it on.
      if (event.buttons !== 0) return;
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
      // The reveal and the eggs ask for frames through the channel; this run
      // of the camera is the one that answers.
      globeChannel.requestDraw = () => {
        if (disposed) return;
        schedule(queuedSample);
        wakeLife();
      };
    }
    // Mapbox may finish loading after several chapters have already passed, and
    // Story close may resume on a stationary scroll position. Always replay now.
    if (voyageRef.current) beginVoyage(voyageRef.current);
    schedule(chapterSample.get());
    return () => {
      voyageHandlerRef.current = null;
      globeChannel.requestDraw = () => {};
      voyageEntry.set(-1);
      window.clearTimeout(cameraStateTimer);
      if (typeof document !== 'undefined') {
        delete document.documentElement.dataset.atlasCamera;
        delete document.documentElement.dataset.atlasLandedAt;
      }
      ['wheel', 'keydown', 'touchstart'].forEach((type) => window.removeEventListener(type, noteReaderDrove));
      disposed = true;
      unsubscribe();
      ticketObserver?.disconnect();
      unsubscribeEntry();
      unsubscribePrologue();
      unsubscribeIntro();
      unsubscribeLife();
      if (lifeFrame) cancelAnimationFrame(lifeFrame);
      if (hopFrame) cancelAnimationFrame(hopFrame);
      if (veilFrame) cancelAnimationFrame(veilFrame);
      lookWrites.fadeZoom = Number.NaN;
      window.clearTimeout(settleTimer);
      window.clearTimeout(sidesTimer);
      // A held commit dies with this run; the restart re-derives the place
      // from committedPlaceRef (still the camera's) and snaps, never flies.
      dropHeldHop();
      clearPlantTimers();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', wakeLife);
      // A still swap cut short: the next run shows its pose outright.
      window.clearTimeout(stillTimer);
      map.off('render', stillReturn);
      stillFade?.cancel();
      stillCanvas.style.opacity = '';
      cancelFrame(draw);
      if (classicMapFrameRef.current === draw) classicMapFrameRef.current = null;
    };
  }, [atlasEngaged, canvasExtension, chapterRestZooms, chapterRoute, chapterSample, classicEntrance, classicGlobe, entryProgress, globeChannel, globeIntro, globeMode, hopEnabled, layoutRevision, living, mapLoaded, paused, prologue, reducedMotion, resolvedPrologueProgress, sampledEntryProgress]);

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
  // The eggs stay out under reduced motion (no hit disc): the still globe is
  // not a toy. This is the client-only atlas, so no server tree to match.
  const eggMap = prologue && !reducedMotion && mapLoaded && eggPointer && !living && !mobile ? mapRef.current?.getMap() ?? null : null;
  const entryOwnsClassicInterface = !living && !!entryProgress;
  const interfaceVisible = !paused && atlasEngaged &&
    (entryOwnsClassicInterface || interfaceInFrame) &&
    isAtlasInterfaceReady(mapReadiness);
  // On small screens the active photograph already carries the place, year,
  // frame count and story cue. Removing the atlas footer during an active
  // chapter keeps those layers from competing for the same bottom edge.
  const footerVisible = !living && interfaceVisible && (!mobile || !activeStop);
  const playInterfaceIntro = interfaceVisible && !interfaceIntroPlayedRef.current;
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
      ease: EASE.arrive,
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
      onPointerMove={signs ? noteAtlasLook : undefined}
      onPointerLeave={signs ? endAtlasLook : undefined}
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
        transition={{ duration: reducedMotion ? 0 : 1.08, ease: EASE.arrive }}
        className={`absolute origin-center overflow-hidden ${classicEntrance ? '-inset-8' : 'inset-0'}`}
      >
        <motion.div
          aria-hidden="true"
          initial={false}
          animate={{ opacity: living ? (mapSettled ? 0.42 : 1) : prologue || mapSettled ? 0 : 0.3 }}
          transition={{ duration: reducedMotion ? 0 : 0.85, ease: EASE.arrive }}
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
            // The prologue canvas is held back until its first tiles are in,
            // then fades in with the dawn (see the load-in above). Until then
            // the corner is plain page ground while the name rises. Other
            // atlases keep their stylesheet opacity (the living one is 0.92).
            style={{
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              ...(prologue
                ? { opacity: globeRevealed ? 1 : 0, transition: `opacity 700ms ${CSS_EASE.arrive}` }
                : null),
            }}
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
            // Full device pixels, deliberately. (A `pixelRatio` prop used to
            // sit here capping it at 1.5; mapbox-gl 3 has no such option and
            // reads window.devicePixelRatio live, so it never did anything.
            // Capping it globally measured no gain on M-series GPUs and would
            // blur the closing proof sheet's canvases. A weak GPU gets the
            // planet light's lite pass instead.)
            // The basemap's labels avoid the places' keep-out (a symbol layer
            // on its own source), so collisions run across sources. Measured
            // on the 14 s archive run at 1728 dpr2: frame pacing unchanged.
            crossSourceCollisions
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
              if (signs) {
                const canvas = map.getCanvas();
                let ground = canvas.parentElement?.querySelector<HTMLElement>(':scope > .route-atlas-ink-ground') ?? null;
                if (!ground) {
                  ground = document.createElement('div');
                  ground.className = 'route-atlas-ink-ground';
                  ground.setAttribute('aria-hidden', 'true');
                  canvas.after(ground);
                }
                setInkGround(ground);
              }
              if (mobile) map.touchZoomRotate.disableRotation();

          // Keep the actual road network without heavy terrain or extrusions.
          // Classic depth comes from the scroll-owned oblique camera, with no
          // terrain startup cost or extra animation competing with the photos.
          map.setTerrain(null);
          // The prologue globe is photographic: satellite imagery at globe
          // zooms, printed in silver (globeLook) and lit by one key light
          // (planetLight). As the camera dives it settles to a residual veil
          // under the dark atlas rather than vanishing, and past
          // SILVER_EXIT_ZOOM takes the archive's own paint back. Inserted
          // under the first label layer, then the light and the prologue
          // graticule above it; the route layers draw above all three, so the
          // white ink is never shaded.
          if (prologue && !map.getSource('prologue-satellite')) {
            const firstLabel = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;
            const lookWrites = globeWritesRef.current;
            lookWrites.lookQ = clamp01(resolvedPrologueProgress.get());
            lookWrites.silver = true;
            lookWrites.floor = silverFloorAt(lookWrites.lookQ);
            // The camera writes the veil from here on (writeSatelliteVeil),
            // each value at once rather than over the style's 300 ms.
            lookWrites.opacity = Math.round(satelliteOpacityAt(PROLOGUE_SATELLITE_OPACITY, map.getZoom()) * 500) / 500;
            map.addSource('prologue-satellite', { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 });
            map.addLayer({
              id: 'prologue-satellite',
              type: 'raster',
              source: 'prologue-satellite',
              paint: {
                'raster-opacity': lookWrites.opacity,
                'raster-opacity-transition': { duration: 0, delay: 0 },
                ...silverPaint(lookWrites.floor),
                'raster-fade-duration': 160,
              } as never,
            }, firstLabel);
            const light = createPlanetLight(map, () => ({
              q: globeWritesRef.current.lookQ,
              dawn: globeChannel.dawn,
              veil: globeChannel.veil,
              hover: globeChannel.hover,
              archive: globeWritesRef.current.archive,
              zoom: globeWritesRef.current.fadeZoom,
            }));
            light.setLite(globeChannel.lite);
            planetLightRef.current = light;
            map.addLayer(light, firstLabel);
            // The globe's easter eggs photograph the print (src/lib/eggExposure.ts):
            // the shutter, the exposure and the dodge directly under the light,
            // so it draws over them sharp; the burn of his places on top of
            // everything. Both cost nothing until an egg plays.
            const eggLayers = createEggExposure(map, () => globeChannel);
            map.addLayer(eggLayers.exposure, 'planet-light');
            map.addLayer(eggLayers.burn);
            map.addSource('prologue-graticule', { type: 'geojson', data: globeGraticule() });
            map.addLayer({
              id: 'prologue-graticule',
              type: 'line',
              source: 'prologue-graticule',
              paint: { 'line-color': '#F4F4ED', 'line-width': 0.55, 'line-opacity': 0 },
            }, firstLabel);
            lookWrites.graticule = 0;
          }
          map.setFog(classicGlobe && map.getProjection?.()?.name === 'globe'
            ? (prologue ? (globeChannel.lite ? PROLOGUE_FOG_LITE : PROLOGUE_FOG) : GLOBE_FOG)
            : null);

          // ── Desktop: a drawing, not a road map ──
          // On the classic desktop path the road LABELS were already hidden but
          // the lines stayed, so the atlas read as a navigation map with its
          // words removed. Five inks remain there: paper (background), water,
          // land, the state line and the river. Interstates drop to a whisper
          // and everything below them is not drawn at all — so the white route
          // gets louder without anyone touching its opacity. Relief on this
          // path is the satellite residual under the paper (dark-v11 ships no
          // hillshade layer; that branch below is for other styles).
          //
          // /travel (MapboxMap.tsx) deliberately KEEPS its road hierarchy: there
          // the map IS the interface and a reader panning between cities
          // navigates by it. src/lib/atlasBasemap.ts exists so the two surfaces
          // share their ground without sharing their treatment — do not
          // "complete" this into a global cleanup.
          //
          // What the reader sees change at the chapter rest zoom (5.05–6) is
          // the interstate web only: dark-v11's `road-simple` filter admits
          // nothing below motorway/trunk until z6 and nothing below primary
          // until z8, and this map's maxZoom is 11. During the prologue dive's
          // satellite cross-fade (z3.3–4.5) no road layer is drawn at all
          // (`road-simple` starts at z5), and the raster sits above every line
          // layer anyway — roads never draw over the photograph.
          const desktopDrawing = !living && !mobile;
          const roadWhisper = 0.16;

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
              map.setPaintProperty(layer.id, 'background-color', living ? ATLAS_PAPER.backgroundLiving : ATLAS_PAPER.background);
              return;
            }

            if (layer.type === 'fill') {
              if (id.includes('water')) {
                map.setPaintProperty(layer.id, 'fill-color', ATLAS_PAPER.water);
                map.setPaintProperty(layer.id, 'fill-opacity', 0.92);
              } else if (id.includes('park') || id.includes('landuse') || id.includes('landcover')) {
                map.setPaintProperty(layer.id, 'fill-color', ATLAS_PAPER.land);
                map.setPaintProperty(layer.id, 'fill-opacity', living ? (mobile ? 0.32 : 0.28) : (mobile ? 0.36 : 0.38));
              } else if (id.includes('building')) {
                map.setPaintProperty(layer.id, 'fill-color', ATLAS_PAPER.building);
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
                map.setPaintProperty(layer.id, 'line-opacity', living ? 0.1 : (mobile ? 0.32 : roadWhisper));
              } else if (id.includes('secondary') || id.includes('tertiary')) {
                if (desktopDrawing) {
                  map.setLayoutProperty(layer.id, 'visibility', 'none');
                  return;
                }
                map.setPaintProperty(layer.id, 'line-color', '#737D6D');
                map.setPaintProperty(layer.id, 'line-opacity', living ? 0.045 : 0.2);
              } else if (id.includes('road') || id.includes('street')) {
                if (desktopDrawing) {
                  // dark-v11 has none of the layers matched above: it folds the
                  // whole hierarchy into `road-simple` (with bridge / tunnel /
                  // path twins) and tells the classes apart on the feature, so
                  // the split has to be data-driven. Interstates at a whisper;
                  // every class below them — and paths, rail — not drawn.
                  map.setPaintProperty(layer.id, 'line-color', '#8C9588');
                  map.setPaintProperty(layer.id, 'line-opacity', ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], roadWhisper, 0]);
                  return;
                }
                map.setPaintProperty(layer.id, 'line-color', '#667064');
                map.setPaintProperty(layer.id, 'line-opacity', living ? 0.018 : 0.1);
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
            // Patterson's inversion: the type does not wear an outline, the
            // ground softens behind it. The halo is this surface's OWN paper
            // (the living tree has its own, darker one) and the blur exceeds
            // the width, so there is no hard core. The previous #11150F at
            // 0.7 / 0.5 was darker than the paper with a crisp edge — UI
            // vocabulary on a cartographic ground.
            map.setPaintProperty(layer.id, 'text-halo-color', living ? ATLAS_PAPER.backgroundLiving : ATLAS_PAPER.background);
            map.setPaintProperty(layer.id, 'text-halo-width', 1.1);
            map.setPaintProperty(layer.id, 'text-halo-blur', 1.5);
            // Mapbox's own tracking runs to 0.25em on ocean names and 0.15em
            // on states. The page caps uppercase tracking at 0.1em and the
            // map is not exempt; a data-driven value is capped inside its
            // own expression. (Legacy stop functions are left alone.)
            const tracking = layer.layout?.['text-letter-spacing'];
            if (typeof tracking === 'number' ? tracking > 0.1 : Array.isArray(tracking)) {
              try {
                map.setLayoutProperty(layer.id, 'text-letter-spacing', typeof tracking === 'number' ? 0.1 : ['min', 0.1, tracking]);
              } catch {
                // A style whose tracking cannot be composed keeps its own;
                // wide letters are a blemish, a thrown error in onLoad is not.
              }
            }
          });

          // The same rule /travel follows: the basemap does not name the places
          // this archive is naming. The route already draws each stop's name at
          // the viewfinder, so a settlement label underneath it is the page
          // saying the same word twice in two voices.
          silenceArchivePlaceLabels(map, chapterRoute.map((entry) => entry.stop.name));
          // Keep-out, the /travel technique: an invisible icon on every place,
          // as big as its dot, its key on either side and the landmark over
          // it, placed first (the topmost symbol layer) so the basemap can no
          // longer set a town's name across a place's number ("Fort
          // Lauderdale" through Miami's 01). It needs the map's cross-source
          // collisions, which are on for it.
          if (signs && !map.getLayer(ATLAS_KEEP_OUT.id)) {
            if (!map.hasImage(ATLAS_KEEP_OUT.id)) {
              map.addImage(ATLAS_KEEP_OUT.id, {
                width: ATLAS_KEEP_OUT.width,
                height: ATLAS_KEEP_OUT.height,
                data: new Uint8Array(ATLAS_KEEP_OUT.width * ATLAS_KEEP_OUT.height * 4),
              });
            }
            if (!map.getSource(ATLAS_KEEP_OUT.id)) {
              map.addSource(ATLAS_KEEP_OUT.id, {
                type: 'geojson',
                data: {
                  type: 'FeatureCollection',
                  features: chapterRoute.map((entry) => ({
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'Point', coordinates: entry.stop.coordinates },
                  })),
                },
              });
            }
            map.addLayer({
              id: ATLAS_KEEP_OUT.id,
              type: 'symbol',
              source: ATLAS_KEEP_OUT.id,
              layout: {
                'icon-image': ATLAS_KEEP_OUT.id,
                'icon-allow-overlap': true,
                'icon-ignore-placement': false,
                'icon-offset': [0, ATLAS_KEEP_OUT.offsetY],
                'icon-pitch-alignment': 'viewport',
                'icon-rotation-alignment': 'viewport',
              },
              paint: { 'icon-opacity': 0 },
            });
          }
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
              'line-dasharray': [3, 4],
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
              'line-dasharray': [5, 2.5],
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
                'line-dasharray': [3, 2.5],
                // Seeded dark, once: the camera prints it in with the glide
                // ("The places on the planet"), and a value here that changed
                // per render would be re-applied behind its back.
                'line-opacity': 0,
              }}
            />
          )}
        </Source>}
        {prologue && (
          <Source key="prologue-stops" id="prologue-stops" type="geojson" data={prologueStops}>
            {/* Each place a small dot of white ink with a hard knockout of
                burn round it (the globe's version of the atlas's printed
                marks), upright to the viewer, so it reads as a point rather
                than a disc lying on the sphere. */}
            <Layer
              id="prologue-stops-dot"
              type="circle"
              paint={{
                'circle-radius': 2.25,
                'circle-color': MAP_INK,
                'circle-stroke-color': MAP_BURN,
                'circle-stroke-width': 1.25,
                'circle-pitch-alignment': 'viewport',
                // Seeded dark, once, like the route above.
                'circle-opacity': 0,
                'circle-stroke-opacity': 0,
              }}
            />
          </Source>
        )}

        {/* The places: printed marks, upright to the camera and centred on
            each place (AfPoint). The current place's dot is the focal mark —
            the camera sets it exactly on the viewfinder's reading line. */}
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
              slug={entry.stop.slug}
              number={entry.chapterIndex + 1}
              name={entry.stop.name}
              initiallyCurrent={entry.stop.id === currentStopRef.current}
              engaged={engagedChapterId === entry.stop.id}
              visibility={classicInterfaceOpacity}
              onEngage={onEngage}
              onNavigate={onNavigate}
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
          transition={{ duration: reducedMotion ? 0 : 1.08, ease: EASE.arrive }}
          className="route-atlas__marker-overlay pointer-events-none absolute inset-0 z-20 origin-center"
        >
          {projectedRoute.length > 1 && (
            <svg className="route-atlas__route-overlay absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              {/* The route still ahead: white ink at a whisper, under the
                  travelled line — not olive, which read as a second lime on
                  the phone's map (marks on the map are white ink). */}
              <motion.path
                d={projectedRoutePath}
                fill="none"
                stroke={MAP_INK}
                strokeWidth={mobile ? 1.05 : 1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                animate={{ pathLength: interfaceVisible ? 1 : 0, opacity: interfaceVisible ? (mobile ? 0.22 : 0.24) : 0 }}
                transition={{ duration: reducedMotion ? 0 : 1.05, ease: EASE.arrive }}
              />
              <motion.path
                d={projectedRoutePath}
                fill="none"
                stroke={MAP_INK}
                strokeWidth={mobile ? 1.25 : 1.45}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                style={{ pathLength: livingTravelProgress }}
                animate={{ opacity: interfaceVisible ? (mobile ? 0.72 : 0.78) : 0 }}
                transition={{
                  opacity: { duration: reducedMotion ? 0 : 0.38, ease: EASE.arrive },
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
        transition={{ duration: reducedMotion ? 0 : 0.82, ease: EASE.arrive }}
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
      {/* Reading tone: keyed off the camera state on <html> (CSS, no React),
          so a landing settles the ground and a flight lifts it. */}
      {/* Held at zero through the globe prologue by the same archive-frame
          fade as the other tone layers: the camera is also "at rest" while the
          planet turns, and toning the globe darkened the first screen AND drew
          a hard seam where the atlas box ends (78vw) and the planet's bleed
          carries on. Two layers so the camera state (CSS) and the archive
          fade (MotionValue) never fight over one opacity. */}
      {/* Once the map is up the tone is printed on its ground, under the
          places' ink (see inkGround): the marks sit ON the toned plate. */}
      {!mobile && (() => {
        const tone = (
          <motion.div
            className={inkGround ? 'route-atlas-ink-tone' : 'pointer-events-none absolute inset-0'}
            style={prologue ? { opacity: archiveFrameOpacity } : undefined}
            aria-hidden="true"
          >
            <div className="route-atlas-rest-tone absolute inset-0" />
          </motion.div>
        );
        return inkGround ? createPortal(tone, inkGround) : tone;
      })()}
      {!mobile && <motion.div className="route-atlas-interface-veil pointer-events-none absolute inset-y-0 left-0" style={prologue ? { opacity: archiveFrameOpacity } : undefined} />}

      {signs && (
        <AtlasViewfinder
          ref={viewfinderRef}
          initial={initialViewfinderPlace}
          visibility={classicInterfaceOpacity}
          reducedMotion={reducedMotion}
          scrimHost={inkGround}
          bleed={classicEntrance ? CANVAS_BLEED : 0}
        />
      )}

      {eggMap && (
        <Suspense fallback={null}>
          <GlobeEggs
            map={eggMap}
            channel={globeChannel}
            route={chapterRoute}
            progress={resolvedPrologueProgress}
            revealed={globeRevealed}
            paused={paused}
            voyage={voyage}
            reducedMotion={reducedMotion}
            bleed={CANVAS_BLEED}
            onNavigate={onNavigate}
          />
        </Suspense>
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
          ease: EASE.arrive,
        }}
        aria-hidden={!interfaceAccessible}
        inert={!interfaceAccessible}
        className={`route-atlas-header absolute inset-x-0 top-0 z-20 flex items-start justify-between ${mobile ? 'px-5 pb-6 pt-24' : 'pb-7 pl-8 pr-[38%] pt-24'}`}
      >
        <div>
          <div className="flex items-center gap-3">
            {/* Bone ink, and no glow: the atlas's one lime is the viewfinder's
                chapter number (plus the corners' flash on a landing). */}
            <span className="h-1.5 w-1.5 rounded-full bg-[#F4F4ED]" />
            <p className="font-ui text-[8px] font-bold uppercase tracking-[0.1em] text-white/84">The Route</p>
          </div>
          <p className="mt-3 font-ui text-[9px] uppercase tracking-[0.1em] text-white/72">Photographic coordinates</p>
        </div>
        <ScrubbedRouteOrdinal
          sample={chapterSample}
          route={chapterRoute}
          includeTotal
          className="font-ui text-[9px] uppercase tracking-[0.1em] text-white/72"
        />
      </motion.header>}


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
          ease: EASE.arrive,
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
                transition={{ duration: reducedMotion ? 0 : 0.58, ease: EASE.arrive }}
              >
                <p className="route-atlas-overview-title font-serif text-[clamp(38px,13.8vw,54px)] uppercase leading-[0.78] tracking-[-0.055em] text-[#F4F4ED]">The Route</p>
                <p className="mt-5 font-ui text-[9px] uppercase tracking-[0.1em] text-[#D2FF00]/78">{mappedStops.length} places · photographic atlas</p>
              </motion.div>
            </div>
            <span className="mb-1 shrink-0 font-ui text-[9px] uppercase tracking-[0.1em] text-white/54">Scroll to follow</span>
          </div>
        ) : (
          <div className="route-atlas-footer pt-5">
            <span className="sr-only" aria-live="polite">
              {activeStop ? `Current place: ${activeStop.name}. Coordinates ${coordinateLabel}` : 'Route overview'}
            </span>
            {/* The archive as a strip of ticks, one per frame, grouped by chapter. */}
            <AtlasTicks
              chapters={chapterRoute.map((entry) => ({
                id: entry.stop.id,
                number: entry.chapterIndex + 1,
                name: entry.stop.name,
                frames: entry.stop.frameCount,
              }))}
              currentId={currentStopRef.current}
              engagedId={engagedChapterId}
              onEngage={onEngage}
              onNavigate={onNavigate}
            />
          </div>
        )}
      </motion.footer>}
    </section>
  );
}
