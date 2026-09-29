import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ATLAS_PAPER, silenceArchivePlaceLabels } from '../../lib/atlasBasemap';
import { MAP_BURN, MAP_INK } from '../../lib/mapInk';
import MapGL, { Layer, Marker, Source } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import {
  AnimatePresence,
  animate,
  cancelFrame,
  frame,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
  type Process,
} from 'framer-motion';
import { getMapboxToken } from '../../config/mapbox';
import {
  AtlasTicks,
  AtlasViewfinder,
  ATLAS_READING_LINE,
  PlaceShield,
  type AtlasNavigateOptions,
  type ShieldBox,
  type ViewfinderHandle,
  type ViewfinderPlace,
} from './AtlasSign';
import {
  SHIELD_MAP_PX,
  SHIELD_SCALE,
  pad2,
  shieldForm,
  stackShields,
  stateCode,
  typeBox,
  type StackSlot,
} from '../../lib/routeShield';
import {
  DOCK,
  centreFor,
  coverDock,
  dockShown,
  planDock,
  railBox,
  type DockAsk,
  type DockCamera,
  type DockChapter,
  type DockEntry,
} from '../../lib/coverDock';
import { isAtlasInterfaceReady, scheduleAtlasIdleFallback } from '../../lib/atlasReadiness';
import { ARCHIVE_ENTRANCE_PHASES, entrancePhase } from '../../lib/archiveEntrance';
import {
  angularDistance,
  routeCoordinates,
  type GeoCoordinate,
} from '../../lib/routeGeometry';
import {
  STOCK_PAINT,
  SILVER_FOG,
  SILVER_FOG_LITE,
  createGlobeChannel,
  silverExitAt,
  silverFloorAt,
  silverPaint,
  silverRamp,
} from '../../lib/globeLook';
import { createPlanetLight, type PlanetLightLayer } from '../../lib/planetLight';
import { wrap180 } from '../../lib/geo';
import { CSS_EASE, DUR_MS, EASE, smootherstep, voyageEase } from '../../lib/motion';
import {
  ENTRY,
  entryStartZoom,
  EXPLORE_BEARING,
  EXPLORE_PITCH,
  EXPLORE_ZOOM,
  READER_ZOOM,
  planFlight,
} from '../../lib/explorerCamera';
import { phoneFocalY } from '../../lib/explorer';

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
  /** The cover's photograph's ratio (src/lib/coverDock.ts, coverRatioOf):
   *  the cover docked beside the place's shield is sized from it. */
  coverRatio?: number;
  /** The cover carries its region's tab (the region's first place). */
  dockTab?: boolean;
}

/** A camera move the explorer asks for (src/lib/explorer.ts): `fly` to a
 *  place (a shield, the list, Prev / Next, the one in hand again), `entry`
 *  the phone's descent onto stop 01 (the desktop's entry is the descent's
 *  own clock, driven by HomePage), `cut` straight onto a place (under a
 *  story, turned to another place, an entry cut short), `home` the phone's
 *  camera back above stop 01 (Back to the start);
 *  `release` moves nothing: the ticket in hand (torn) leaves the map. */
export interface AtlasFlight {
  kind: 'fly' | 'entry' | 'cut' | 'home' | 'release';
  id: string | null;
  token: number;
}

interface Props {
  stops: RouteStop[];
  /** Full ordered chapter IDs; stops without valid coordinates are skipped by ID. */
  chapterIds?: string[];
  /** Desktop: the descent from the globe the page brought up onto the
   *  entry's place (0–1), on HomePage's clock (the explorer's entry). With
   *  it the atlas draws the globe (`prologue`); without it (the phone) the
   *  camera waits above stop 01 and the entry is a flight. */
  entryProgress?: MotionValue<number>;
  /** The place in hand (its cover shows once the camera is down on it). */
  current: string | null;
  /** The camera move asked for last (a new token is a new move). */
  flight?: AtlasFlight | null;
  /** The map is the reader's: drag, zoom, keys (the explorer's `explore`). */
  free?: boolean;
  /** The phone's interface is up (the explorer has been entered). */
  interfaceOn?: boolean;
  /** The phone's card, px tall on screen: the camera sets a place above it. */
  phoneCardH?: number;
  reducedMotion: boolean;
  mobile?: boolean;
  paused?: boolean;
  /** A place pointed at (a shield, a row of the list): its shield answers. */
  engagedChapterId?: string | null;
  /** A shield or a tick is pointed at or focused (null when it is left). */
  onEngage?: (chapterId: string | null) => void;
  /** A shield or a tick asks for a place. */
  onSelect?: (chapterId: string, options?: AtlasNavigateOptions) => void;
  /** The empty map was clicked: nothing in hand. */
  onDismiss?: () => void;
  /** A camera move is over (`arrived` false: the reader took the map). */
  onArrive?: (token: number, arrived: boolean) => void;
  /** Create the map now, not when the atlas nears the viewport (HomePage
   *  warms it behind the opening film and the entrance's opening words). */
  eager?: boolean;
  /** Hold the globe's reveal (and its dawn and settle) until the entrance's
   *  boarding pass is torn, so they play as the page's glide brings the
   *  globe up the screen. */
  holdReveal?: boolean;
  /** Count the atlas as engaged although it is below the fold: the film and
   *  the entrance lie above it, and the camera should hold the pose the globe
   *  rises in (its tiles loading) by the time the glide brings it up. */
  engage?: boolean;
}

interface ChapterRouteStop {
  stop: RouteStop;
  stopIndex: number;
  chapterIndex: number;
  routeProgress: number;
}

// Marks drawn on the map itself are white ink — the photograph carries the
// colour; lime (#D2FF00) stays in the interface around it, and only once
// per view: on the atlas that is the viewfinder's chapter number (and the
// corners' flash on a landing). Casings are a dark burn. MAP_INK / MAP_BURN
// come from src/lib/mapInk.ts, which /travel imports as well.
// The camera down at a place: oblique enough for the standing signs to read
// as planted in the map, north kept nearly straight up. Owner, 2026-09-28
// (有点晕): 46° tipped in on every dive became 40° following the zoom, then
// one gentle 24° held at every zoom (src/lib/explorerCamera.ts,
// EXPLORE_PITCH).
const CHAPTER_PITCH = EXPLORE_PITCH.rest;
const CHAPTER_BEARING = EXPLORE_BEARING;

/** How long the atlas's instruments stay up after a hand stops moving over
 *  the map (see "The instruments on demand" in the component). Long enough to
 *  read a coordinate pair and a readout line; any move brings them back. */
const ATLAS_LOOK_IDLE_MS = 3000;

// ── A place's resting camera ──
const HOP = {
  // Rest zoom: close enough that neighbouring places sit ≥150px apart (the
  // Utah canyons), never tighter than a hair under zoom 6. At 6 itself
  // Mapbox swaps its globe for Mercator (GLOBE_ZOOM_THRESHOLD_MAX): every
  // tile reloaded, and on the landing's last frame the place — its shield
  // and the cover docked on it — jumped 15px. The archive stays on the
  // globe (owner, 2026-09-25).
  restZoom: 5.05,
  restZoomMax: 5.98,
  restSpacingPx: 150,
  // AF points: the place being left gets its point back this long after
  // take-off (the destination's lands when the viewfinder locks).
  unplantDelay: 120,
  // The viewfinder's lock snap.
  lockSnapMs: 110,
  // A camera within this of a flight's destination has arrived (px / zoom).
  arrivePx: 2,
  arriveZoom: 0.02,
  // The cover in hand shows while the reader is down at its place: from its
  // rest zoom to this far out (and appears again, zooming back, from
  // `appearOut` out). A planet with a photograph pinned to it is not a map.
  appearOut: 1.3,
  stayOut: 1.8,
  // A click on the empty map waits this long for a second (a double-click
  // zooms; it does not tear the ticket in hand away).
  dismissWaitMs: 260,
} as const;

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

// ── The globe, and the entry's descent from it ──
// The torn boarding pass brings the globe up the screen with the page
// (HomePage, EntranceIntro): the whole planet on the atlas's focal point,
// already facing the entry's place (stop 01 by route order, or the place
// asked for). The explorer's entry then takes the camera straight down onto
// it (globeEntryPose), and the archive stays on the globe (the owner's call,
// 2026-09-25). From zoom 5 up Mapbox sizes its globe to the flat map at the
// camera's own latitude, and from zoom 6 it draws pure Mercator: the places
// that rest at zoom 6 look exactly as on the flat map, the ones at
// HOP.restZoom match it around the place and curve away a little toward the
// top of the frame, and a long flight's apex shows the planet's edge. (A
// dive that overshot to zoom 6.05 and swapped to Mercator reloaded every
// tile: a flat olive frame.) So the descent ends at the place's own resting
// zoom, never past GLOBE_HANDOFF_ZOOM, and its zoom only ever increases.
// Before the map's first frame the camera looks at the first place from
// this far out (the map's initial view; the camera takes over at once).
const GLOBE_START_ZOOM = 1.9;
const GLOBE_HANDOFF_ZOOM = HOP.restZoom;
// Where in the descent the camera begins to tip from square-on to its
// oblique view (see globeEntryPose): the last 70% of it, so the 24° come in
// at 15°/s at the steepest (a 40° tip over the last 40% peaked at 44°/s).
const GLOBE_TIP_FROM = 0.3;
// The entry's clock jumped to its end from under this share of the descent:
// the reader cut it short (a key, a press, a new wheel), and the camera is
// set down under a dip. From above it the descent was all but down (the
// sine's last 3% moves the zoom by under a hundredth of a level).
const ENTRY_CUT_BELOW = 0.97;
// A flight that has to tip (the pitch is held at every zoom, so only a
// camera set square by something else ever does) tips once it is down, no
// faster than this at its steepest.
const TIP_DEG_PER_S = 15;
// The archive's air: a long flight's apex sees the planet's edge through it.
// Owner, 2026-09-28 (背景很暗): the far land used to fog toward near-black
// (#1B2319), so every chapter with the horizon in view — the Florida and New
// York chapters, over the sea — was dark in its upper half and darkest by
// the rail. The air is a lit haze now, the land going pale into distance as
// real air takes it (atmospheric perspective), the space above the limb the
// page's own ground. Quieter since the review of 2026-09-28: where the
// planet's edge is in view (Miami's corner) the lit air was a bright crescent
// behind the nav, p99 103 against ~60 of ground, swept across the screen by
// every flight; the air is now about the ground's own tone (p99 71) and the
// sky above it dark.
const GLOBE_FOG = {
  range: [7, 18] as [number, number],
  color: '#555a4a',
  'high-color': '#2e3327',
  'space-color': '#282c20',
  'horizon-blend': 0.06,
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
// Down the dive's last zooms that air turns into the archive's own
// (GLOBE_FOG), on the zoom itself: on a tall window the first chapter is
// read before the atlas takes the camera (its reading line sits inside the
// entrance's last stretch), and it was read under the prologue's clear air
// — its sea and the space over the limb the darkest ground of any chapter —
// with the archive's haze cutting in a scroll later.
const DIVE_FOG_ZOOMS = [4.2, 5] as const;
function diveFog(prologueAir: typeof SILVER_FOG) {
  const [from, to] = DIVE_FOG_ZOOMS;
  const ramp = <T,>(a: T, b: T) => ['interpolate', ['linear'], ['zoom'], from, a, to, b];
  return {
    range: ramp(['literal', prologueAir.range], ['literal', GLOBE_FOG.range]),
    color: ramp(prologueAir.color, GLOBE_FOG.color),
    'high-color': ramp(prologueAir['high-color'], GLOBE_FOG['high-color']),
    'space-color': ramp(prologueAir['space-color'], GLOBE_FOG['space-color']),
    'horizon-blend': ramp(prologueAir['horizon-blend'], GLOBE_FOG['horizon-blend']),
    'star-intensity': 0,
  } as unknown as typeof GLOBE_FOG;
}
const PROLOGUE_FOG = diveFog(SILVER_FOG);
const PROLOGUE_FOG_LITE = diveFog(SILVER_FOG_LITE);

/** The descent's own progress on the entry's clock: the whole of it (no
 *  turn to wait for, no hold at the end). */
function globeEntryProgress(entry: number) {
  return clamp01(entry);
}
// How long the globe's canvas may wait for the tiles of the pose it rises in
// before it shows anyway (counted from when it may show: the pass torn).
const GLOBE_REVEAL_CAP_MS = 3000;

/** The globe the page brings up with the torn boarding pass (HomePage,
 *  EntranceIntro): the whole planet on the atlas's focal point, already
 *  facing the entry's place, and the entry's descent starts from it. Its
 *  disc sits inside the screen — its top RISE_PLANET.margin of the height
 *  below the screen's top, its width within RISE_PLANET.across of the atlas
 *  column — so it rises over the lower edge as a planet, never as a slab of
 *  ground cut off by the edge of the page above it. DERIVED from the
 *  viewport, never measured: the focal point is on the reading line
 *  (ATLAS_READING_LINE of the height), and the disc's apparent radius r
 *  follows from Mapbox's camera. Below zoom 5 its globe has a radius of
 *  512 · 2^zoom / 2π world px scaled by 1 / cos 45° (GLOBE_SCALE_MATCH_
 *  LATITUDE, whatever the camera's latitude), seen from 1.5 canvas heights
 *  (a 36.87° field of view) above the surface, so a sphere of radius R
 *  shows a limb of r = D·R / √(D² + 2·D·R): R = r (r + √(r² + D²)) / D.
 *  Measured on the built page at 1728 × 1000: 386 px where the plain
 *  world-size model promised 410. */
const RISE_PLANET = { margin: 0.07, across: 0.78, column: 0.78 } as const;
function risePlanetZoom(viewportWidth: number, viewportHeight: number) {
  const r = Math.max(
    120,
    Math.min(
      (ATLAS_READING_LINE - RISE_PLANET.margin) * viewportHeight,
      (RISE_PLANET.across * RISE_PLANET.column * viewportWidth) / 2,
    ),
  );
  const distance = 1.5 * (viewportHeight + 2 * CANVAS_BLEED);
  const sphere = (r * (r + Math.sqrt(r * r + distance * distance))) / distance;
  return Math.log2((sphere * 2 * Math.PI * Math.SQRT1_2) / 512);
}
// Reduced motion keeps the same globe, still. It holds two poses: the planet
// the page brings up (on the atlas's focal point, facing the place) and the
// place's resting pose. Nothing turns, glides or descends: the entry cuts to
// the ground (the canvas dips out and the new view fades in), and the way
// back to the planet likewise. The route and its places are drawn whole on
// the planet at once.
type StillPose = 'planet' | 'archive';
// The map canvas bleeds this far past the atlas column on every side
// (`-inset-8`), and the atlas focal point is the centre of the canvas once
// this padding is taken off its top and right.
const CANVAS_BLEED = 32;
const FOCAL_PADDING = { top: 48, right: 264 } as const;
// A shield that would reach under the chapters' rail (its right edge this
// far inside the rail's edge, src/lib/coverDock.ts `railBox`) is under the
// chapter's name and lede: it is not printed there, unless the camera is on
// its place or flying to it. (The covers used to fill that column; they now
// ride beside their shields.)
const SIGN_UNDER = 4;
// The nav's band at the top of the page (its pills and the wordmark sit in
// the first ~92px): no shield is printed up there.
const NAV_BAND_PX = 96;
// A place further round the planet than this from the camera's centre is
// behind the globe: never stacked with the shields in view.
const SHIELD_HORIZON = 1.3;
// A transparent image round each place that the basemap's names keep out of,
// so the ground a shield stands on reads as the route, not as town names
// (48 × 54 css px round the current stop's shield: its centre 24px above
// the place).
const ATLAS_KEEP_OUT = { id: 'atlas-keepout', width: 48, height: 54, offsetY: -24 } as const;
const PROLOGUE_SATELLITE_FADE: [number, number] = [3.3, 4.5];
// After the dive the photography does not vanish: it stays under the graded
// atlas at this strength, so chapters keep a little real ground.
// Owner, 2026-09-28 (在主页浏览collection story的时候，背景很暗啊): the chapters'
// ground was a black void; the land now reads as a photograph of itself.
// Calmed the same day (有点晃眼): 0.88 → 0.76, with the stock paint's own
// quieter grade (src/lib/globeLook.ts STOCK_PAINT).
const PROLOGUE_SATELLITE_RESIDUAL = 0.76;
// The dive's veil on the way down to that residual, as [zoom, opacity] pairs:
// one steady step down, the archive's handoff zoom at the residual, where the
// archive's own veil (below) takes over at the same strength. It used to dip
// to 10% round the silver print's exit, the one layer trading its paint
// there out of sight; the frame went 62 → 35 → 54 luma, a two-second blink
// just before the landing (the review of 2026-09-28). The print's exit is a
// crossfade onto a second layer now (SILVER_EXIT, `writeSatelliteVeil`), at
// the veil's own strength, so nothing needs hiding.
const PROLOGUE_SATELLITE_OPACITY: readonly number[] = [
  PROLOGUE_SATELLITE_FADE[0], 1,
  GLOBE_HANDOFF_ZOOM, PROLOGUE_SATELLITE_RESIDUAL,
];
// The layer (and source) the archive's own paint comes up on over the silver
// print, the same satellite imagery: the reader's map (both layers are drawn
// only while the crossfade runs; a layer at opacity 0 is not drawn).
const SATELLITE_STOCK_LAYER = 'prologue-satellite-stock';
// In the archive: at a long flight's apex the camera climbs past the
// prologue's zoom keys, so a modest photographic veil (more real ground from
// higher up), never the prologue's full print.
const ARCHIVE_SATELLITE_OPACITY: readonly number[] = [3.1, 0.78, 4.6, PROLOGUE_SATELLITE_RESIDUAL];
// The phone's map carries the same photograph, a little quieter.
const PHONE_SATELLITE_OPACITY = 0.62;
// The phone's shields, css px (the desktop's SHIELD_MAP_PX is 34).
const SHIELD_PHONE_PX = 26;
// Where the phone's camera waits while the entrance is read (the torn pass
// brings this view up): above stop 01, near enough that the entry is one
// short descent (about 1.9 levels at the zoom
// cap, ~2.6 s). It used to wait on the whole planet (zoom 1.15) and came
// down 3.9 levels over 5.2 s, then tipped. The card hides it (the reader
// never sees it wait), and the reader can still zoom out to the planet.
const PHONE_APPROACH_ZOOM = 3.2;
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

/**
 * The entry's descent at `progress` (0 → 1): from the whole planet the page
 * brought up (`startZoom`, `risePlanetZoom`), already facing the place, down
 * onto its resting pose. The centre never moves — nothing turns, nothing
 * slides: the planet only comes closer — and the zoom runs on the house's
 * sine (voyageEase: one peak, in the middle, π/2 of the mean rate).
 * Owner, 2026-09-28 (有点晕): the camera does not tip while it falls. The
 * pitch comes in only over the last of the descent, from GLOBE_TIP_FROM, once
 * most of the zoom is done, on the same sine: the tip is the one large motion
 * left at that point, so it is the gentlest curve that still lands without a
 * jolt.
 */
function globeEntryPose(
  target: { coordinate: GeoCoordinate; zoom: number; pitch: number; bearing: number },
  progress: number,
  startZoom: number,
) {
  const zoom = startZoom + (target.zoom - startZoom) * voyageEase(clamp01(progress));
  const pose = voyageEase(clamp01((progress - GLOBE_TIP_FROM) / (1 - GLOBE_TIP_FROM)));
  return {
    center: target.coordinate,
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

function formatCoordinate(value: number, positive: string, negative: string) {
  const normalized = Math.abs(value) < 0.00005 ? 0 : value;
  return `${Math.abs(normalized).toFixed(4)}° ${normalized >= 0 ? positive : negative}`;
}

function formatCoordinateLabel([longitude, latitude]: [number, number]) {
  return `${formatCoordinate(latitude, 'N', 'S')}  ·  ${formatCoordinate(longitude, 'E', 'W')}`;
}

export default function RouteAtlas({
  stops,
  chapterIds,
  entryProgress,
  current,
  flight = null,
  free = false,
  interfaceOn = false,
  phoneCardH = 0,
  reducedMotion,
  mobile = false,
  paused = false,
  engagedChapterId = null,
  onEngage,
  onSelect,
  onDismiss,
  onArrive,
  eager = false,
  holdReveal = false,
  engage = false,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const routeAtlasRef = useRef<HTMLElement>(null);
  const classicMapFrameRef = useRef<Process | null>(null);
  const interfaceIntroPlayedRef = useRef(false);
  const viewportWidthRef = useRef(0);
  const cameraSyncedRef = useRef(false);
  // What the globe's camera and the planet light share (see GlobeChannel).
  // One object for the component's life: it outlives the camera effect's
  // restarts.
  const [globeChannel] = useState(createGlobeChannel);
  // The globe's canvas stays hidden until the pass is torn and its tiles are
  // in (see the reveal gate below): no dark wireframe, no half-loaded seam.
  const [globeRevealed, setGlobeRevealed] = useState(false);
  const planetLightRef = useRef<PlanetLightLayer | null>(null);
  // The satellite's grade and veil, as last written to the map. The paint
  // lives on the map, not in the camera effect, so none may reset when that
  // effect restarts. `archive` mirrors the camera's paint mode and `lookQ`
  // the progress the look is drawn at (always 1: the planet's own look), both
  // for the light, as is `fadeZoom`, the veil's own zoom (see
  // VEIL_ZOOM_RATE), which the light fades out on.
  const globeWritesRef = useRef({ floor: Number.NaN, archive: false, lookQ: 1, opacity: Number.NaN, stockOpacity: 0, fadeZoom: Number.NaN });
  const mapboxToken = getMapboxToken();
  // The desktop atlas draws the globe the page brings up with the torn pass
  // (`prologue`: its silver print, its light) and descends from it onto the
  // entry's place; the phone's waits above stop 01 (the page brings the map
  // up there) and goes down in a flight.
  const classicEntrance = !mobile && !!entryProgress;
  const classicGlobe = true;
  const prologue = classicEntrance;
  // The shields, the covers' dock and the viewfinder: on every layout now.
  const signs = true;
  // How far past the atlas column's right edge the map canvas reaches: the
  // canvas runs to the viewport's right edge (the covers ride on the map
  // beside their shields; the chapter's rail has its own soft ground).
  const [canvasExtension, setCanvasExtension] = useState(0);
  const [mapLoaded, setMapLoaded] = useState(false);
  // The ground the places are printed on: a layer inside the map, right after
  // its canvas and before its markers, holding the reading tone and the
  // viewfinder's scrim, so the ink is printed over them.
  const [inkGround, setInkGround] = useState<HTMLElement | null>(null);
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
  const [atlasSeen, setAtlasSeen] = useState(reducedMotion);
  const atlasEngaged = atlasSeen || engage;
  const [interfaceInFrame, setInterfaceInFrame] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);

  const chapterRoute = useMemo(() => buildChapterRoute(stops, chapterIds), [chapterIds, stops]);
  const mappedStops = useMemo(() => chapterRoute.map((entry) => entry.stop), [chapterRoute]);
  const currentIndex = current ? chapterRoute.findIndex((entry) => entry.stop.id === current) : -1;
  const activeStop = currentIndex >= 0 ? chapterRoute[currentIndex].stop : undefined;
  // What the camera effect reads of the explorer on its own clock.
  const currentRef = useRef(current);
  currentRef.current = current;
  const freeRef = useRef(free);
  freeRef.current = free;
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  // The move asked for last, the last one the camera has taken up, and the
  // camera's taker (set by the camera effect while it runs; a move asked for
  // while it does not is taken up when it next starts).
  const flightRef = useRef<AtlasFlight | null>(null);
  const answeredFlightRef = useRef<number | null>(null);
  const flightHandlerRef = useRef<((next: AtlasFlight) => void) | null>(null);
  // Mid-entry, the place the entry is going down onto (the explorer's
  // current then: stop 01, or the place asked for).
  const entryIndexRef = useRef(Math.max(0, currentIndex));
  if (!free && currentIndex >= 0) entryIndexRef.current = currentIndex;
  useEffect(() => {
    flightRef.current = flight;
    if (!flight || flight.token === answeredFlightRef.current) return;
    flightHandlerRef.current?.(flight);
  }, [flight]);
  // The travelled line's first trim: nothing travelled (the camera writes it
  // from then on; a per-render value would be re-applied behind its back).
  const [initialRouteTrim] = useState<[number, number]>(() => [0, 1]);
  // ── Signs ── a camera viewfinder names the current place; the shields
  // mark every place. The camera drives it (hunt from take-off, lock at
  // touchdown).
  const chapterRestZooms = useMemo(() => hopRestZooms(chapterRoute), [chapterRoute]);
  const viewfinderRef = useRef<ViewfinderHandle>(null);
  // ── The instruments on demand ── The atlas's instrument type — the
  // viewfinder's readouts, the tick timeline, the header — is not printed at
  // rest (owner, 2026-09-27: at rest a place reads as the place on the map,
  // the ticket, the city name and the lede). It comes up when it helps: the
  // viewfinder reports a flight and its landing on its own (AtlasSign), and
  // everything comes up while a hand is moving over the map. `data-atlas-look`
  // on this section says so (global.css, "The instruments on demand"); it is
  // written on pointer movement, not hover, and steps back ATLAS_LOOK_IDLE_MS
  // after the hand stops, unless it rests on a place or a tick. No layout is
  // read: an attribute and a timer per move.
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
      if (atlas.querySelector('.place-shield__sign:hover, .atlas-ticks__group:hover')) {
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
  const [initialViewfinderPlace] = useState(() => viewfinderPlace(Math.max(0, currentIndex)));
  // The place whose shield stands tallest because the camera is down on it.
  // Toggled on the marker elements directly: a React state change here would
  // re-render the whole atlas in the middle of a flight.
  const currentStopRef = useRef<string | null>(null);
  // The place the camera is FLYING to: its shield comes up at take-off.
  const inboundStopRef = useRef<string | null>(null);
  // The places the reader has been down at this visit are printed a little
  // fuller than the ones still to see.
  const visitedRef = useRef(new Set<string>());
  const markPast = () => {
    const elements = routeAtlasRef.current?.querySelectorAll<HTMLElement>('[data-af-stop]');
    if (!elements) return;
    const visited = visitedRef.current;
    elements.forEach((element) => {
      const id = element.dataset.afStop ?? '';
      element.classList.toggle('is-past', visited.has(id) && id !== currentStopRef.current && id !== inboundStopRef.current);
    });
  };
  // ── The shields ── (PlaceShield, src/lib/routeShield.ts)
  // One shield per place, standing on it: a marker at the place's own
  // coordinates, anchored at the bottom, the foot's point on the place.
  const shieldPx = mobile ? SHIELD_PHONE_PX : SHIELD_MAP_PX;
  const shieldPlaces = useMemo(() => chapterRoute.map((entry) => ({
    id: entry.stop.id,
    number: entry.chapterIndex + 1,
    name: entry.stop.name,
    region: entry.stop.region,
    slug: entry.stop.slug,
    coordinates: entry.stop.coordinates,
    ratio: shieldForm(stateCode(entry.stop.region)).h / 100,
    type: typeBox(shieldForm(stateCode(entry.stop.region))),
  })), [chapterRoute]);
  // The chapters' rail edge in the atlas's own px (its width × the layout's
  // constant) and the canvas's size (the atlas plus a bleed each side),
  // written on a resize, never per frame: the shields are placed on every
  // camera frame and must not read layout there.
  const plateLeftRef = useRef(0);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const shieldPosesRef = useRef(new Map<string, {
    el: HTMLElement;
    marker: HTMLElement | null;
    sign: HTMLElement | null;
    lift: number;
    z: number;
    count: number;
    buried: boolean;
    under: boolean;
    /** When it went under the rail (it fades out over --dur-out). */
    underSince: number;
    /** The state's scale, the one it is leaving and when it changed: a
     *  shield shrinks over --dur-out, and is stacked at its larger size
     *  until it has. */
    scale: number;
    was: number;
    since: number;
    /** In the keyboard's reach: on the page. A shield round the planet or
     *  past the screen's edge is out of the tab order (focus would land on
     *  something nobody can see). */
    reach: boolean | null;
  }>());
  // The atlas's bleed past the viewport on each side (the desktop canvas).
  const bleed = classicEntrance ? CANVAS_BLEED : 0;
  // Where each shield stands this camera frame: its place projected by the
  // camera (the marker puts the foot's point there), whether it would reach
  // under the chapters' rail, and — where shields meet at this zoom — its
  // place in their pile (stackShields). DERIVED from the camera's own
  // projection and the shields' known sizes — one `project` per place, no
  // layout read — and written only when a value moves. Runs on the map's
  // `move` and `render`, so the shields ride the camera exactly.
  const placeShields = () => {
    const atlas = routeAtlasRef.current;
    const map = mapRef.current?.getMap();
    const plateLeft = plateLeftRef.current;
    if (!atlas || !map || !(plateLeft > 0)) return;
    // Canvas px: the canvas bleeds past the atlas on the left.
    const underAt = mobile ? Number.POSITIVE_INFINITY : bleed + plateLeft - SIGN_UNDER;
    const { width, height } = canvasSizeRef.current;
    const centre = map.getCenter();
    const current = currentStopRef.current;
    const inbound = inboundStopRef.current;
    const visited = visitedRef.current;
    const now = performance.now();
    const slots: StackSlot[] = [];
    const unders = new Map<string, boolean>();
    // Every shield still printed, for the viewfinder: those in the piles and
    // those still fading out under the rail.
    const printed: StackSlot[] = [];
    // The cover docked beside the place in hand: the readouts keep off it as
    // they keep off the shields.
    const dockedId = dockAtRef.current;
    const dockedEntry = dockedId && !mobile ? dockPlanRef.current?.[dockedId] ?? null : null;
    let dockedFoot: { x: number; y: number } | null = null;
    shieldPlaces.forEach((place) => {
      let pose = shieldPosesRef.current.get(place.id);
      if (!pose || !pose.el.isConnected) {
        const el = atlas.querySelector<HTMLElement>(`[data-place-shield="${CSS.escape(place.id)}"]`);
        if (!el) return;
        pose = {
          el,
          marker: el.parentElement,
          sign: el.querySelector<HTMLElement>('.place-shield__sign'),
          lift: 0,
          z: -1,
          count: 0,
          buried: false,
          under: false,
          underSince: 0,
          scale: 0,
          was: 0,
          since: 0,
          reach: null,
        };
        shieldPosesRef.current.set(place.id, pose);
      }
      const rank = place.id === current ? 2 : place.id === inbound ? 1 : 0;
      const scale = rank === 2
        ? SHIELD_SCALE.current
        : rank === 1
          ? SHIELD_SCALE.inbound
          : visited.has(place.id) ? SHIELD_SCALE.past : SHIELD_SCALE.ahead;
      if (scale !== pose.scale) {
        pose.was = pose.scale;
        pose.scale = scale;
        pose.since = now;
      }
      const drawn = now - pose.since < DUR_MS.out ? Math.max(scale, pose.was) : scale;
      const w = shieldPx * drawn;
      const h = w * place.ratio;
      const point = map.project(place.coordinates);
      if (place.id === dockedId) dockedFoot = { x: point.x - bleed, y: point.y - bleed };
      // Under the rail, or up in the nav's band (a place on the planet's
      // far rim came up through the wordmark), a shield is not printed
      // unless its place is in hand or the camera is flying to it.
      const under = rank === 0 && (point.x + w / 2 > underAt || point.y - bleed - h < NAV_BAND_PX);
      unders.set(place.id, under);
      // On screen: inside the atlas, not merely the canvas — a shield out in
      // the bleed is off the page's edge.
      const onScreen = point.x + w / 2 > bleed && point.x - w / 2 < width - bleed &&
        point.y > bleed && point.y - h < height - bleed &&
        angularDistance([centre.lng, centre.lat], place.coordinates) < SHIELD_HORIZON;
      const slot: StackSlot = { id: place.id, number: place.number, x: point.x, y: point.y, w, h, rank, type: place.type };
      if (onScreen !== pose.reach && pose.sign) {
        pose.reach = onScreen;
        pose.sign.tabIndex = onScreen ? 0 : -1;
      }
      if (onScreen && !under) slots.push(slot);
      if (onScreen && (!under || !pose.under || now - pose.underSince < DUR_MS.out)) printed.push(slot);
    });
    const stack = stackShields(slots);
    // The viewfinder's readouts keep off every shield still printed, and off
    // the cover in hand: the same boxes, in the atlas's px.
    const boxes: ShieldBox[] = [];
    printed.forEach((slot) => {
      const foot = slot.y + (stack.get(slot.id)?.dy ?? 0) - bleed;
      const x = slot.x - bleed;
      boxes.push({ id: slot.id, left: x - slot.w / 2, top: foot - slot.h, right: x + slot.w / 2, bottom: foot });
    });
    if (dockedEntry && dockedFoot) {
      const foot = dockedFoot as { x: number; y: number };
      const left = foot.x + dockedEntry.offset.x;
      const top = foot.y + dockedEntry.offset.y;
      boxes.push({
        id: 'docked-cover',
        left,
        top: top - (dockedEntry.tab ? DOCK.tab : 0),
        right: left + dockedEntry.photoW + DOCK.stub,
        bottom: top + dockedEntry.photoH + DOCK.below,
      });
    }
    viewfinderRef.current?.avoid(boxes);
    shieldPlaces.forEach((place) => {
      const pose = shieldPosesRef.current.get(place.id);
      if (!pose) return;
      const placed = stack.get(place.id);
      const lift = placed?.dy ?? 0;
      // The place in hand is above every shield, the one flown to above the
      // rest; within a pile, its order.
      const rank = place.id === current ? 2 : place.id === inbound ? 1 : 0;
      const z = 1 + (placed?.z ?? 0) + rank * 10;
      const count = placed?.count ?? 0;
      const buried = placed?.buried ?? false;
      const under = unders.get(place.id) ?? false;
      if (lift !== pose.lift) {
        pose.lift = lift;
        pose.el.style.setProperty('--lift', `${lift}px`);
      }
      if (z !== pose.z && pose.marker) {
        pose.z = z;
        pose.marker.style.zIndex = String(z);
      }
      if (count !== pose.count && pose.sign) {
        pose.count = count;
        if (count > 1) pose.sign.dataset.pile = String(count);
        else delete pose.sign.dataset.pile;
      }
      if (buried !== pose.buried && pose.sign) {
        pose.buried = buried;
        if (buried) pose.sign.dataset.buried = '';
        else delete pose.sign.dataset.buried;
      }
      if (under !== pose.under) {
        pose.under = under;
        if (under) pose.underSince = now;
        if (under) pose.el.dataset.under = '';
        else delete pose.el.dataset.under;
      }
    });
  };
  const placeShieldsRef = useRef(placeShields);
  placeShieldsRef.current = placeShields;
  const markInboundStop = (id: string | null) => {
    inboundStopRef.current = id;
    routeAtlasRef.current?.querySelectorAll<HTMLElement>('[data-af-stop]').forEach((element) => {
      element.classList.toggle('is-inbound', !!id && element.dataset.afStop === id);
    });
    markPast();
    placeShields();
  };
  const markCurrentStop = (id: string | null) => {
    if (id) {
      markInboundStop(null);
      visitedRef.current.add(id);
    }
    currentStopRef.current = id;
    routeAtlasRef.current?.querySelectorAll<HTMLElement>('[data-af-stop]').forEach((element) => {
      element.classList.toggle('is-current', element.dataset.afStop === id);
    });
    routeAtlasRef.current?.querySelectorAll<HTMLElement>('[data-tick-group]').forEach((element) => {
      element.classList.toggle('is-current', element.dataset.tickGroup === id);
    });
    if (id) routeAtlasRef.current?.removeAttribute('data-no-place');
    else routeAtlasRef.current?.setAttribute('data-no-place', '');
    markPast();
    placeShields();
    // The viewfinder's readouts hang off the place in hand (publishDock, on
    // the map's render): a place planted after the camera has come to rest
    // (HOP.lockSnapMs after the landing) needs a frame of its own, or the
    // readouts stayed at the place just left until the reader moved the map.
    mapRef.current?.getMap()?.triggerRepaint();
  };
  // The shields ride the camera: placed on every frame the map draws, and
  // once whenever the shields or the layout change under a resting map.
  useLayoutEffect(() => {
    const atlas = routeAtlasRef.current;
    if (!signs || !atlas) return;
    const measure = () => {
      plateLeftRef.current = mobile ? window.innerWidth : railBox(window.innerWidth).left;
      canvasSizeRef.current = {
        width: atlas.clientWidth + 2 * bleed + (classicEntrance ? canvasExtension : 0),
        height: atlas.clientHeight + 2 * bleed,
      };
      placeShieldsRef.current();
    };
    measure();
    window.addEventListener('resize', measure, { passive: true });
    return () => window.removeEventListener('resize', measure);
  }, [bleed, canvasExtension, classicEntrance, layoutRevision, mapLoaded, mobile, signs, viewportReady]);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!signs || !mapLoaded || !map) return;
    shieldPosesRef.current.clear();
    // On `move` as well as `render`: the markers ride the camera on `move`,
    // and a pile placed a frame late left two shields overlapping with no
    // count at the viewport's edge.
    const onRender = () => placeShieldsRef.current();
    map.on('move', onRender);
    map.on('render', onRender);
    onRender();
    return () => {
      map.off('move', onRender);
      map.off('render', onRender);
    };
  }, [mapLoaded, shieldPlaces, signs]);
  // ── The covers' dock (src/lib/coverDock.ts) ──
  // The plan — for each place the corner its cover takes beside its shield,
  // where the camera sets the place, the cover's size — DERIVED once per
  // layout from the viewport, each cover's ratio and region tab, and where
  // its neighbours' shields stand on its resting camera. The camera reads it
  // for where it sets each place; the chapters for their covers. The phone
  // deals its card at the foot of the screen instead (no plan).
  const dockPlanRef = useRef<Readonly<Record<string, DockEntry>> | null>(null);
  // The place whose cover shows (decided on publish, below), and what the
  // camera asks of it on its latest draw (`setDockAt`).
  const dockAtRef = useRef<string | null>(null);
  const dockAskRef = useRef<DockAsk | null>(null);
  useLayoutEffect(() => {
    if (!signs || !viewportReady || mobile) {
      dockPlanRef.current = null;
      coverDock.setPlan(null);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const shieldOf = (region: string | undefined, scale: number) => {
      const w = SHIELD_MAP_PX * scale;
      return { w, h: (w * shieldForm(stateCode(region)).h) / 100 };
    };
    const chapters: DockChapter[] = chapterRoute.map((entry, index) => ({
      id: entry.stop.id,
      coordinates: entry.stop.coordinates,
      zoom: chapterRestZooms[index] ?? HOP.restZoom,
      ratio: entry.stop.coverRatio ?? 1.5,
      tab: !!entry.stop.dockTab,
      shield: shieldOf(entry.stop.region, SHIELD_SCALE.current),
      neighbours: chapterRoute.flatMap((other, otherIndex) => (otherIndex === index
        ? []
        : [{
            coordinates: other.stop.coordinates,
            ...shieldOf(other.stop.region, SHIELD_SCALE.ahead),
          }])),
    }));
    // The place's camera at rest, as the camera effect sets it: its centre
    // on the atlas's focal point (FOCAL_PADDING and the reading line, the
    // same derivation as its `activePadding`), the canvas a bleed past the
    // viewport each side.
    const canvasHeight = vh + 2 * CANVAS_BLEED;
    const camera = {
      focal: { x: ((routeAtlasRef.current?.clientWidth ?? 0.78 * vw) - FOCAL_PADDING.right) / 2, y: ATLAS_READING_LINE * vh },
      pitch: CHAPTER_PITCH,
      bearing: CHAPTER_BEARING,
      distance: 1.5 * canvasHeight,
    };
    const plan = planDock(chapters, vw, vh, camera);
    dockPlanRef.current = plan;
    coverDock.setPlan(plan);
    mapRef.current?.getMap()?.triggerRepaint();
  }, [chapterRestZooms, chapterRoute, layoutRevision, mobile, signs, viewportReady]);
  useEffect(() => () => {
    coverDock.setPlan(null);
    coverDock.publish({ at: null, points: {} });
  }, []);
  // Every place's foot this frame, and the place whose cover shows: handed
  // to the covers on the map's `move` and `render`, as the shields' markers
  // are placed (above), so a cover and its shield never part by a frame.
  // Whether a cover shows is decided here, against the camera's ask
  // (`dockShown`): it APPEARS once the camera is down on its place (never
  // seen sliding into its seat: covers appear directly); once shown it STAYS
  // while its place is in hand, riding every move the reader makes of the
  // map, and goes when the place is let go or the camera leaves.
  // The viewfinder's readouts hang off the place in hand, wherever the
  // reader has taken the map.
  const publishDock = () => {
    const map = mapRef.current?.getMap();
    if (!map || !signs) return;
    const points: Record<string, { x: number; y: number }> = {};
    shieldPlaces.forEach((place) => {
      const point = map.project(place.coordinates);
      points[place.id] = { x: Math.round(point.x) - bleed, y: Math.round(point.y) - bleed };
    });
    const at = dockShown(dockAtRef.current, dockAskRef.current, (id) => !!points[id]);
    dockAtRef.current = at;
    coverDock.publish({ at, points });
    const held = currentStopRef.current ? points[currentStopRef.current] : null;
    if (held) viewfinderRef.current?.focal(held);
  };
  const publishDockRef = useRef(publishDock);
  publishDockRef.current = publishDock;
  // Written by the camera, published with the next render.
  const setDockAt = (ask: DockAsk | null) => {
    const was = dockAskRef.current;
    if (was === ask || (was && ask && was.id === ask.id && was.appear === ask.appear && was.stay === ask.stay)) return;
    dockAskRef.current = ask;
    mapRef.current?.getMap()?.triggerRepaint();
  };
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!signs || !mapLoaded || !map) return;
    const onRender = () => publishDockRef.current();
    map.on('move', onRender);
    map.on('render', onRender);
    onRender();
    return () => {
      map.off('move', onRender);
      map.off('render', onRender);
    };
  }, [mapLoaded, signs]);

  const resolvedEntryProgress = useMotionValue(1);
  const entryMotion = entryProgress ?? resolvedEntryProgress;
  const sampledEntryProgress = useTransform(
    entryMotion,
    (progress) => reducedMotion ? (progress < 0.5 ? 0 : 1) : clamp01(progress),
  );
  // The atlas's own framing — the top dissolve, the reading tone — returns as
  // the globe dives into the archive.
  const archiveFrameOpacity = useTransform(
    sampledEntryProgress,
    // Across most of the descent (the reading tone darkens the map by 16%:
    // over 0.06–0.42 it did so while the silver print left, ~17 luma/s).
    (progress) => (prologue ? entrancePhase(progress, 0.04, 0.9) : 1),
  );

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
    () => staticAtlasUrl(fullRouteCoordinates, mapboxToken, mobile),
    [fullRouteCoordinates, mapboxToken, mobile],
  );
  // Where the phone's camera waits below the entrance (and goes home to):
  // above stop 01, already at the atlas's oblique view, so the entry is one
  // short descent with nothing to tip (PHONE_APPROACH_ZOOM).
  const phoneApproach = useMemo(() => {
    const [longitude, latitude] = mappedStops[0]?.coordinates ?? [-95, 36];
    return { longitude, latitude, zoom: PHONE_APPROACH_ZOOM, bearing: CHAPTER_BEARING, pitch: CHAPTER_PITCH };
  }, [mappedStops]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = () => setViewportReady(mobile ? !query.matches : query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [mobile]);

  useEffect(() => {
    let frame = 0;
    viewportWidthRef.current = window.innerWidth;
    const resize = () => {
      const nextWidth = window.innerWidth;
      // Mobile browser chrome changes only the visual viewport's height while
      // it shows and hides: that is no new layout for the map.
      if (mobile && Math.abs(nextWidth - viewportWidthRef.current) < 1) return;
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
  }, [mobile]);

  // ── The load-in ── The globe's canvas stays hidden until the tiles of the
  // pose it rises in are in (or GLOBE_REVEAL_CAP_MS has passed after it may
  // show), so the reader never sees Mapbox's dark wireframe or a half-loaded
  // seam across the planet. While the entrance holds it (the opening words
  // and the boarding pass above it: `holdReveal`) the gate keeps waiting —
  // the tiles load behind the page — until the pass is torn: the canvas then
  // fades in (700 ms, CSS) as the page's glide brings it up the screen, lit
  // and in place (it does not turn). Its first 90 frames after that decide
  // whether this machine needs the planet light's lighter pass.
  const globeRevealPlayedRef = useRef(false);
  const holdRevealRef = useRef(holdReveal);
  holdRevealRef.current = holdReveal;
  useEffect(() => {
    if (!prologue || !mapLoaded || globeRevealPlayedRef.current) return;
    globeRevealPlayedRef.current = true;
    const map = mapRef.current?.getMap();
    const channel = globeChannel;
    channel.dawn = 1;
    channel.veil = 0;
    let start = performance.now();
    let disposed = false;
    let pollTimer = 0;
    let readyPolls = 0;
    let sampleFrame = 0;
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
      // The archive keeps its own air (the camera sets the globe's back when
      // the reader returns to it).
      if (map && !globeWritesRef.current.archive) map.setFog(PROLOGUE_FOG_LITE);
    };
    const reveal = (reason: 'tiles' | 'cap') => {
      if (disposed) return;
      channel.revealed = true;
      setGlobeRevealed(true);
      markContainer('globeGate', reason);
      markContainer('globeRevealAt', String(Math.round(performance.now())));
      channel.requestDraw();
      map?.triggerRepaint();
      if (reducedMotion) return;
      const intervals: number[] = [];
      let last = 0;
      const sample = (now: number) => {
        sampleFrame = 0;
        if (disposed) return;
        if (last) intervals.push(now - last);
        last = now;
        if (intervals.length >= 90) {
          decideLight(intervals);
          return;
        }
        map?.triggerRepaint();
        sampleFrame = requestAnimationFrame(sample);
      };
      sampleFrame = requestAnimationFrame(sample);
    };
    const poll = () => {
      pollTimer = 0;
      if (disposed) return;
      if (holdRevealRef.current) {
        // Held: the cap counts from the release, not from the map's load.
        start = performance.now();
        readyPolls = 0;
        pollTimer = window.setTimeout(poll, 60);
        return;
      }
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
      else if (performance.now() - start >= GLOBE_REVEAL_CAP_MS) reveal('cap');
      else pollTimer = window.setTimeout(poll, 40);
    };
    poll();
    return () => {
      disposed = true;
      window.clearTimeout(pollTimer);
      if (sampleFrame) cancelAnimationFrame(sampleFrame);
      // Interrupted before the reveal: the next run gates again.
      if (!channel.revealed) globeRevealPlayedRef.current = false;
    };
  }, [globeChannel, mapLoaded, prologue, reducedMotion]);

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
  }, [layoutRevision, prologue, viewportReady]);

  // Mapbox is the heaviest homepage dependency. HomePage first imports this
  // module near the atlas; this tighter second gate waits to create WebGL until
  // the section is almost visible, keeping map startup away from the opening's
  // card-to-page handoff.
  useEffect(() => {
    if (!viewportReady || mapEligible) return;
    const atlas = routeAtlasRef.current;
    if (eager || !atlas || typeof IntersectionObserver === 'undefined') {
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
  }, [eager, mapEligible, mobile, viewportReady]);

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
      setAtlasSeen(true);
      return;
    }
    const atlas = routeAtlasRef.current;
    if (!atlas) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setAtlasSeen((current) => {
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

  // ── The camera ──
  // Three ways the camera is held. On the desktop, while the entrance is
  // read, it holds the whole planet on the focal point facing the entry's
  // place (the torn pass brings it up the screen with the page); entered,
  // HomePage runs the entry's clock on time and the camera follows it
  // straight down onto the place (one calm move, src/lib/explorerCamera.ts
  // ENTRY). From there the map is the reader's:
  // Mapbox's drag, wheel and pinch and the atlas's own keys and
  // double-click, within EXPLORE_ZOOM, the pitch held; the camera only moves
  // when the explorer asks it to (`flight`: a shield, the list, Prev / Next),
  // on a flight whose duration keeps the ground and the zoom under the
  // explorer's caps (planFlight). The phone waits above stop 01 below the
  // entrance and goes down (its entry is a flight too).
  // Every frame drawn by the globe and its descent is one render-free
  // pass in Motion's render phase; in the reader's hands the camera is never
  // written, only the paint that follows its zoom.
  useEffect(() => {
    if (classicMapFrameRef.current) cancelFrame(classicMapFrameRef.current);
    classicMapFrameRef.current = null;
    if (!mapLoaded || !atlasEngaged || paused) {
      mapRef.current?.stop();
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map) return;
    let disposed = false;
    let queuedEntry = sampledEntryProgress.get();
    let padded: boolean | null = null;
    let lastCoordinate: GeoCoordinate | null = null;
    let lastZoom = Number.NaN;
    let lastPitch = Number.NaN;
    let lastBearing = Number.NaN;
    let lastRouteProgress = Number.NaN;
    if (map.getProjection?.()?.name !== 'globe') map.setProjection('globe');
    // ── The places on the planet ──
    // The globe the page brings up is unmarked photography. As the descent
    // begins (the first PROLOGUE_INK_ENTRY of the entry) the route and his
    // places print in on it, all together, so the planet the camera goes
    // down onto is the archive's; the descent then fades them with the zoom
    // (their paint's zoom keys, PROLOGUE_SATELLITE_FADE) as the archive's own
    // marks come up. Data-driven paint does not transition, so the frames
    // write it, on a change of the quantised ink only.
    const marks = { ink: Number.NaN, routeAllHidden: null as boolean | null };
    const writePrologueInk = (ink: number) => {
      if (!prologue) return;
      const quantised = Math.round(clamp01(ink) * 100) / 100;
      if (quantised === marks.ink || !map.getLayer('prologue-stops-dot') || !map.getLayer('prologue-route')) return;
      marks.ink = quantised;
      const [fadeFrom, fadeTo] = PROLOGUE_SATELLITE_FADE;
      const byZoom = (value: number) => ['interpolate', ['linear'], ['zoom'], fadeFrom, Math.round(value * 1000) / 1000, fadeTo, 0] as never;
      map.setPaintProperty('prologue-stops-dot', 'circle-opacity', byZoom(quantised));
      map.setPaintProperty('prologue-stops-dot', 'circle-stroke-opacity', byZoom(quantised * 0.88));
      map.setPaintProperty('prologue-route', 'line-opacity', byZoom(quantised * 0.95));
    };
    // The archive's whole route (the same line) waits until the prologue's
    // own has printed in, so the two never come up over each other at
    // different paces.
    const hideRouteAll = (hidden: boolean) => {
      if (marks.routeAllHidden === hidden) return;
      marks.routeAllHidden = hidden;
      ['route-all-glow', 'route-all-line'].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', hidden ? 'none' : 'visible');
      });
    };
    // The camera's focal point sits on the reading line: a bottom padding
    // lifts the centre of the padded box up to it. DERIVED, never measured:
    // the canvas sits at exactly -CANVAS_BLEED with the viewport's height
    // plus one bleed on each edge (see derive-dont-sample). On the phone the
    // place stands in the clear band above the card (phoneFocalY).
    const viewportH = window.innerHeight;
    const focusHeight = viewportH + 2 * bleed;
    const phoneFocal = mobile ? phoneFocalY(viewportH, phoneCardH) : 0;
    const focalTarget = (mobile ? phoneFocal : ATLAS_READING_LINE * viewportH) + bleed;
    // Signed: when the focal point sits below the box's centre the correction
    // belongs on `top` instead.
    const focalBottom = Math.round(focusHeight + (mobile ? 0 : FOCAL_PADDING.top) - 2 * focalTarget);
    const activePadding = mobile
      ? { top: Math.max(0, -focalBottom), right: 0, bottom: Math.max(0, focalBottom), left: 0 }
      : {
          top: FOCAL_PADDING.top + Math.max(0, -focalBottom),
          right: FOCAL_PADDING.right + (prologue ? canvasExtension : 0),
          bottom: Math.max(0, focalBottom),
          left: 0,
        };
    // ── The covers' places (src/lib/coverDock.ts) ──
    // Each place's cover rides beside its shield at the corner the dock's
    // plan gives it, and the camera sets each place where that corner fits:
    // it looks at the ground that puts the place on the plan's point
    // (`centreFor`), its own centre always on the atlas's focal point.
    const canvasSize = { width: map.getContainer().clientWidth, height: map.getContainer().clientHeight };
    const focalPoint = {
      x: activePadding.left + (canvasSize.width - activePadding.left - activePadding.right) / 2 - bleed,
      y: activePadding.top + (canvasSize.height - activePadding.top - activePadding.bottom) / 2 - bleed,
    };
    const dockCamera: DockCamera = {
      focal: focalPoint,
      pitch: CHAPTER_PITCH,
      bearing: CHAPTER_BEARING,
      distance: 1.5 * canvasSize.height,
    };
    type LngLatLike = { lng: number; lat: number };
    type TransformClone = {
      zoom: number;
      pitch: number;
      bearing: number;
      padding: typeof activePadding;
      center: LngLatLike;
      locationPoint: (lngLat: LngLatLike) => { x: number; y: number };
    };
    // The plan's centres come from a pinhole model of the camera; each is
    // refined on the map's own camera (a clone of its transform, never the
    // live one) until the place stands on its point to the pixel.
    const refineCentre = (place: GeoCoordinate, point: { x: number; y: number }, zoom: number, guess: [number, number]): [number, number] => {
      try {
        const live = (map as unknown as { transform?: { clone?: () => TransformClone } }).transform;
        if (!live?.clone) return guess;
        const tr = live.clone() as TransformClone & {
          mercatorFromTransition?: boolean;
          setMercatorFromTransition?: () => void;
          setProjection?: (projection: { name: string }) => void;
        };
        if (zoom >= 6) tr.setMercatorFromTransition?.();
        else if (tr.mercatorFromTransition) tr.setProjection?.({ name: 'globe' });
        const LngLat = map.getCenter().constructor as new (lng: number, lat: number) => LngLatLike;
        tr.zoom = zoom;
        tr.pitch = CHAPTER_PITCH;
        tr.bearing = CHAPTER_BEARING;
        tr.padding = activePadding;
        let aim = { x: point.x, y: point.y };
        let centre = guess;
        for (let step = 0; step < 5; step += 1) {
          tr.center = new LngLat(centre[0], centre[1]);
          const at = tr.locationPoint(new LngLat(place[0], place[1]));
          const ex = point.x - (at.x - bleed);
          const ey = point.y - (at.y - bleed);
          if (!Number.isFinite(ex) || !Number.isFinite(ey)) return guess;
          if (Math.hypot(ex, ey) < 0.5) break;
          aim = { x: aim.x + ex, y: aim.y + ey };
          centre = centreFor(place, aim, zoom, dockCamera);
        }
        return centre;
      } catch {
        return guess;
      }
    };
    const dockCentres = chapterRoute.map((entry, index) => {
      const planned = !mobile ? dockPlanRef.current?.[entry.stop.id] : null;
      if (!planned) return null;
      return refineCentre(entry.stop.coordinates, planned.point, chapterRestZooms[index] ?? HOP.restZoom, planned.centre);
    });
    const restCenter = (index: number): GeoCoordinate => dockCentres[index] ?? chapterRoute[index]?.stop.coordinates ?? [US_OVERVIEW.longitude, US_OVERVIEW.latitude];
    const restZoom = (index: number) => chapterRestZooms[index] ?? HOP.restZoom;
    const restRoute = (index: number) => chapterRoute[index]?.routeProgress ?? 0;
    const indexOf = (id: string | null) => (id ? chapterRoute.findIndex((entry) => entry.stop.id === id) : -1);
    // Where a place stands on the screen at rest (the viewfinder's readouts
    // hang off it until the reader moves the map).
    const planFocal = (index: number) => (!mobile && dockPlanRef.current?.[chapterRoute[index]?.stop.id ?? '']?.point) || focalPoint;
    // ── Reduced motion: the still globe (see StillPose) ──
    // The pose the canvas shows, and the one the entry asks for; they differ
    // only while a swap runs. The swap never moves anything across the
    // screen: the canvas goes to the ground (dipping out over DUR_MS.flick
    // between the two planets, at once to or from the archive), the new pose
    // is drawn, and the canvas comes back over DUR_MS.in once the map has
    // rendered it. WAAPI, not CSS: the reduced-motion guard in global.css
    // collapses every CSS transition, and an opacity fade is not motion.
    const stillCanvas = map.getCanvas();
    let stillShown: StillPose | null = null;
    let stillTimer = 0;
    let stillFadeIn = false;
    let stillFade: Animation | null = null;
    const stillWanted = (): StillPose => (queuedEntry >= 0.5 ? 'archive' : 'planet');
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
          stillShown = stillWanted();
          stillFadeIn = true;
          schedule();
        }, dipMs);
      }
      return stillShown;
    };

    // ── The camera's state, told to the page ──
    // `data-atlas-camera` on <html> is 'flying' while the camera is on its
    // way, 'locked' at a landing (for a beat), else 'rest'; the tickets read
    // it (a ticket does not tear under a camera already in the air), and
    // `data-atlas-landed-at` is when the camera last came down.
    let cameraStateTimer = 0;
    const setCameraState = (state: 'flying' | 'locked' | 'rest') => {
      window.clearTimeout(cameraStateTimer);
      const html = document.documentElement;
      if (state === 'flying') html.dataset.atlasLandedAt = 'flying';
      else if (state === 'locked' || html.dataset.atlasLandedAt === 'flying') {
        html.dataset.atlasLandedAt = String(Math.round(performance.now()));
      }
      html.dataset.atlasCamera = state;
      if (state === 'locked') {
        cameraStateTimer = window.setTimeout(() => {
          if (document.documentElement.dataset.atlasCamera === 'locked') document.documentElement.dataset.atlasCamera = 'rest';
        }, 620);
      }
    };
    // A trip, told to the page (on window), for the ticket's sign
    // (ArchiveChapter, "The sign turns into place"): `atlas:depart` at every
    // take-off, `atlas:arrive` at the touchdown. The sign of the place flown
    // to turns from the place left (下一站同样产生位置字母跳转功能); from the open
    // map, or on the entry, there is nothing to turn from.
    const signFrom = (from: number | null) => {
      const left = from != null && from >= 0 ? chapterRoute[from] : undefined;
      return left
        ? { name: left.stop.name, code: stateCode(left.stop.region), num: pad2(left.chapterIndex + 1) }
        : null;
    };
    const announce = (type: 'atlas:depart' | 'atlas:arrive', index: number, from: number | null) => {
      const to = chapterRoute[index]?.stop;
      if (!to) return;
      window.dispatchEvent(new CustomEvent(type, { detail: { id: to.id, from: signFrom(from) } }));
    };
    let plantTimers: number[] = [];
    const clearPlantTimers = () => {
      plantTimers.forEach((timer) => window.clearTimeout(timer));
      plantTimers = [];
    };
    const plant = (id: string | null) => {
      if (!disposed) markCurrentStop(id);
    };

    // ── The silver print (see src/lib/globeLook.ts) ──
    // Two layers over the one satellite source, each with its own paint for
    // good: `prologue-satellite` printed in silver, SATELLITE_STOCK_LAYER in
    // the archive's own paint. Only their opacities move (writeSatelliteVeil):
    // the silver through the prologue and the dive, crossfaded across
    // SILVER_EXIT into the archive's paint, which alone carries the reader's
    // map. The one layer used to trade its paint mid-dive; on the draped globe
    // a paint change reaches the tiles over a few frames, and a rectangle of
    // the old print showed in the sea for a moment.
    const lookWrites = globeWritesRef.current;
    const prologueFog = () => (globeChannel.lite ? PROLOGUE_FOG_LITE : PROLOGUE_FOG);
    // The print's grade at the planet's own look (globeLook, q = 1: the
    // floor lifted, the light swung round onto the places).
    const writeLook = () => {
      lookWrites.lookQ = 1;
      if (map.getLayer('prologue-satellite')) {
        const floor = silverFloorAt(1);
        if (floor !== lookWrites.floor) {
          lookWrites.floor = floor;
          map.setPaintProperty('prologue-satellite', 'raster-color', silverRamp(floor) as never);
        }
      }
    };
    let paintMode: 'prologue' | 'archive' | null = null;
    const applyPaintMode = (mode: 'prologue' | 'archive') => {
      paintMode = mode;
      lookWrites.archive = mode === 'archive';
      lookWrites.opacity = Number.NaN;
      lookWrites.stockOpacity = Number.NaN;
      ['prologue-route', 'prologue-stops-dot'].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', mode === 'archive' ? 'none' : 'visible');
      });
      map.setFog(mode === 'archive' ? GLOBE_FOG : prologueFog());
    };
    // The veil, the silver grade's exit and the light's fade read the camera's
    // zoom through this: it follows the camera at no more than VEIL_ZOOM_RATE,
    // so a fast zoom never darkens the whole map in one frame.
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
    // The veil V at `zoom`, and the archive's paint's share k of it: the
    // silver print below at V(1−k)/(1−Vk) and the archive's paint over it at
    // Vk composite to exactly paper·(1−V) + V·((1−k)·silver + k·archive), a
    // crossfade at the veil's own strength (nothing dips, nothing cuts). At
    // k = 1 the silver is out (not drawn at all) and the archive's paint is
    // the veil.
    const writeSatelliteVeil = (zoom: number, k: number) => {
      if (!map.getLayer('prologue-satellite')) return;
      const keys = paintMode === 'archive' ? ARCHIVE_SATELLITE_OPACITY : PROLOGUE_SATELLITE_OPACITY;
      const veil = satelliteOpacityAt(keys, zoom);
      const silver = k >= 1 ? 0 : k <= 0 ? veil : (veil * (1 - k)) / (1 - veil * k);
      const base = Math.round(silver * 500) / 500;
      const over = k <= 0 ? 0 : Math.round(veil * Math.min(1, k) * 500) / 500;
      if (base !== lookWrites.opacity) {
        lookWrites.opacity = base;
        map.setPaintProperty('prologue-satellite', 'raster-opacity', base);
      }
      if (over !== lookWrites.stockOpacity && map.getLayer(SATELLITE_STOCK_LAYER)) {
        lookWrites.stockOpacity = over;
        map.setPaintProperty(SATELLITE_STOCK_LAYER, 'raster-opacity', over);
      }
    };
    const writeRouteTrim = (routeProgress: number) => {
      if (Number.isFinite(lastRouteProgress) && Math.abs(routeProgress - lastRouteProgress) < 0.0002 && routeProgress !== 1 && routeProgress !== 0) return;
      if (routeProgress === lastRouteProgress) return;
      lastRouteProgress = routeProgress;
      ['route-travelled-glow', 'route-travelled-line'].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setPaintProperty(layerId, 'line-trim-offset', [routeProgress, 1]);
      });
    };

    // ── Flights (the reader's map) ──
    // A place asked for: the camera goes to its resting pose — the place on
    // its point beside the covers' corner, the pitch the atlas's — on a
    // Mapbox flight (the reader can take the map from it at any moment),
    // DERIVED to stay under the explorer's caps. Bearing never turns.
    let flying: {
      token: number;
      kind: AtlasFlight['kind'];
      index: number;
      from: number;
      center: GeoCoordinate;
      zoom: number;
      origin: GeoCoordinate;
      trimFrom: number;
      trimTo: number;
      /** The tip to the rest pose's pitch and bearing, played once the
       *  flight is down (see `flyTo`); null when there is nothing to tip. */
      tip: { pitch: number; bearing: number; ms: number } | null;
      tipping: boolean;
    } | null = null;
    const restPose = (index: number) => ({
      center: restCenter(index),
      zoom: restZoom(index),
      pitch: CHAPTER_PITCH,
      bearing: CHAPTER_BEARING,
      padding: activePadding,
    });
    const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));
    const worldPx = (a: GeoCoordinate, b: GeoCoordinate, zoom: number) => {
      const world = 512 * 2 ** zoom;
      const dx = ((wrap180(b[0] - a[0])) / 360) * world;
      const dy = ((mercY(b[1]) - mercY(a[1])) / (2 * Math.PI)) * world;
      return Math.hypot(dx, dy);
    };
    // The cover in hand: asked for once the camera is down at its place and
    // near its zoom; nothing while it flies.
    const askFor = () => {
      const held = currentRef.current;
      if (!held || flying) return null;
      if (prologue && queuedEntry < 0.999) return null;
      const index = indexOf(held);
      if (index < 0) return null;
      const out = restZoom(index) - map.getZoom();
      return { id: held, appear: out <= HOP.appearOut, stay: out <= HOP.stayOut };
    };
    const land = (arrived: boolean) => {
      const done = flying;
      if (!done) return;
      flying = null;
      clearPlantTimers();
      if (done.kind === 'home') {
        setCameraState('rest');
        markCurrentStop(null);
        onArriveRef.current?.(done.token, arrived);
        return;
      }
      writeRouteTrim(done.trimTo);
      const held = currentRef.current;
      const heldIndex = indexOf(held);
      if (arrived) {
        setCameraState('locked');
        announce('atlas:arrive', done.index, done.from);
        const place = viewfinderPlace(done.index);
        if (place) viewfinderRef.current?.hunt(place, performance.now() + HOP.lockSnapMs);
        plantTimers.push(window.setTimeout(() => plant(held && heldIndex >= 0 ? held : null), HOP.lockSnapMs));
      } else {
        // Cut short by the reader's own hand: the place is still in hand, the
        // map is theirs, its cover comes up where its shield now stands.
        setCameraState('rest');
        plant(held && heldIndex >= 0 ? held : null);
        const place = heldIndex >= 0 ? viewfinderPlace(heldIndex) : null;
        if (place) viewfinderRef.current?.settle(place);
      }
      setDockAt(askFor());
      onArriveRef.current?.(done.token, arrived);
    };
    const flyTo = (next: AtlasFlight) => {
      if (next.kind === 'release') {
        // Nothing in hand: its cover goes (it has been torn), its shield
        // steps back among the others, the viewfinder has nothing to read.
        setDockAt(null);
        clearPlantTimers();
        markInboundStop(null);
        plant(null);
        setCameraState('rest');
        onArriveRef.current?.(next.token, true);
        return;
      }
      if (next.kind === 'home') {
        // The phone's way home: back above stop 01, out of sight below the
        // entrance's opening words (HomePage veils the swap).
        flying = { token: next.token, kind: 'home', index: -1, from: -1, center: [phoneApproach.longitude, phoneApproach.latitude], zoom: phoneApproach.zoom, origin: [0, 0], trimFrom: 0, trimTo: 0, tip: null, tipping: false };
        setDockAt(null);
        markInboundStop(null);
        map.stop();
        map.jumpTo({ center: [phoneApproach.longitude, phoneApproach.latitude], zoom: phoneApproach.zoom, pitch: phoneApproach.pitch, bearing: phoneApproach.bearing, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
        land(true);
        return;
      }
      const index = indexOf(next.id);
      if (index < 0) {
        onArriveRef.current?.(next.token, false);
        return;
      }
      if (flying) land(false);
      const dest = restPose(index);
      const from = indexOf(currentStopRef.current);
      const live = map.getCenter();
      const origin: GeoCoordinate = [live.lng, live.lat];
      flying = {
        token: next.token,
        kind: next.kind,
        index,
        from: next.kind === 'entry' ? -1 : from,
        center: dest.center,
        zoom: dest.zoom,
        origin,
        trimFrom: Number.isFinite(lastRouteProgress) ? lastRouteProgress : restRoute(Math.max(0, from)),
        trimTo: restRoute(index),
        tip: null,
        tipping: false,
      };
      setDockAt(null);
      setCameraState('flying');
      announce('atlas:depart', index, flying.from);
      clearPlantTimers();
      const destId = chapterRoute[index].stop.id;
      markInboundStop(destId);
      if (currentStopRef.current && currentStopRef.current !== destId) {
        plantTimers.push(window.setTimeout(() => plant(null), HOP.unplantDelay));
      }
      if (reducedMotion || next.kind === 'cut') {
        // Values, not structure: the camera is cut there (and under a story
        // that covers the map, a cut is all anyone could see).
        map.stop();
        map.jumpTo(dest);
        const place = viewfinderPlace(index);
        if (place) viewfinderRef.current?.settle(place);
        land(true);
        return;
      }
      const w0 = Math.max(canvasSize.width, canvasSize.height);
      const u1 = worldPx(origin, dest.center, map.getZoom());
      const plan = planFlight(w0, u1, dest.zoom - map.getZoom(), window.innerWidth);
      const durationMs = next.kind === 'entry' ? Math.max(ENTRY.phoneMinMs, plan.durationMs) : plan.durationMs;
      // Never a tip and a fall at once (有点晕): from the open planet (square
      // on) the flight keeps its pitch and bearing all the way down, and the
      // camera tips to the oblique view only once it is down, on the house's
      // sine at no more than TIP_DEG_PER_S at its steepest. Between two
      // places (both oblique) there is nothing to tip.
      const pitchNow = map.getPitch();
      const bearingNow = map.getBearing();
      const tipDeg = Math.max(Math.abs(dest.pitch - pitchNow), Math.abs(wrap180(dest.bearing - bearingNow)));
      flying.tip = tipDeg > 0.5
        ? { pitch: dest.pitch, bearing: dest.bearing, ms: Math.max(500, Math.round(((tipDeg * Math.PI) / 2 / TIP_DEG_PER_S) * 1000)) }
        : null;
      const place = viewfinderPlace(index);
      if (place) viewfinderRef.current?.hunt(place, performance.now() + durationMs + (flying.tip?.ms ?? 0));
      map.flyTo({
        ...dest,
        ...(flying.tip ? { pitch: pitchNow, bearing: bearingNow } : null),
        duration: durationMs,
        curve: plan.curve,
        easing: voyageEase,
        essential: true,
      }, { explorerFlight: next.token });
    };
    const onMoveEnd = (event: object) => {
      if (!flying || flying.kind === 'home') return;
      // The end of a flight a newer one has just cut off (Mapbox ends the
      // old ease, synchronously, as the new flyTo starts, with the old one's
      // event data): not this one's.
      const token = (event as { explorerFlight?: number }).explorerFlight;
      if (token != null && token !== flying.token) return;
      const live = map.getCenter();
      const gap = worldPx([live.lng, live.lat], flying.center, map.getZoom());
      const arrived = gap <= HOP.arrivePx && Math.abs(map.getZoom() - flying.zoom) <= HOP.arriveZoom;
      if (arrived && flying.tip && !flying.tipping) {
        // Down: now the tip, on its own (the cover waits for it).
        flying.tipping = true;
        map.easeTo({
          pitch: flying.tip.pitch,
          bearing: flying.tip.bearing,
          duration: flying.tip.ms,
          easing: voyageEase,
          essential: true,
        }, { explorerFlight: flying.token });
        return;
      }
      land(arrived);
    };
    map.on('moveend', onMoveEnd);
    // In flight the travelled line runs on under the camera, as far as the
    // ground it has covered.
    const onFlightMove = () => {
      if (!flying || flying.kind === 'home') return;
      const live = map.getCenter();
      const total = worldPx(flying.origin, flying.center, 8);
      const left = worldPx([live.lng, live.lat], flying.center, 8);
      const k = total > 1e-6 ? clamp01(1 - left / total) : 1;
      writeRouteTrim(flying.trimFrom + (flying.trimTo - flying.trimFrom) * k);
    };
    map.on('move', onFlightMove);

    // ── The reader's map ──
    // The pitch is held (EXPLORE_PITCH): nothing the reader does tips the
    // camera. A click on the empty map lets the place in hand go (after a
    // beat, so a double-click only zooms); a double-click zooms one level
    // about the point, on the house's sine under the zoom cap (READER_ZOOM:
    // Mapbox's own took 300 ms); the cover in hand is asked for as the zoom
    // comes and goes.
    let dismissTimer = 0;
    const onFreeMove = () => {
      if (!freeRef.current) return;
      setDockAt(askFor());
      schedule();
    };
    const onClick = (event: { originalEvent?: Event }) => {
      if (!freeRef.current || flying) return;
      const target = event.originalEvent?.target as Element | null;
      if (target?.closest?.('.mapboxgl-marker, button, a, [role="button"]')) return;
      window.clearTimeout(dismissTimer);
      dismissTimer = window.setTimeout(() => {
        dismissTimer = 0;
        if (!disposed) onDismissRef.current?.();
      }, HOP.dismissWaitMs);
    };
    const onDoubleClick = (event: { lngLat?: { lng: number; lat: number }; originalEvent?: MouseEvent }) => {
      window.clearTimeout(dismissTimer);
      dismissTimer = 0;
      if (!freeRef.current || flying) return;
      const target = event.originalEvent?.target as Element | null;
      if (target?.closest?.('.mapboxgl-marker, button, a, [role="button"]')) return;
      const out = event.originalEvent?.shiftKey ? -1 : 1;
      const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + out * READER_ZOOM.clickLevels));
      map.easeTo({
        zoom,
        ...(event.lngLat ? { around: event.lngLat } : null),
        duration: reducedMotion ? 0 : READER_ZOOM.clickMs,
        easing: voyageEase,
      });
    };
    map.on('move', onFreeMove);
    map.on('click', onClick);
    map.on('dblclick', onDoubleClick);

    // The descent onto the entry's place is under way (the camera "flies").
    let descending = false;
    // How far the descent's pose has got (globeEntryProgress; 1 = down on the
    // place). The entry's clocks jumped to their ends before it got there —
    // the reader cut the entry short (HomePage, `finishEntry`) — and the
    // camera is set down on the place under a short dip instead.
    let entryPoseAt = 0;
    // The reader's map has been handed the camera (reduced motion cuts it
    // onto the entry's place then). A restart in the reader's hands starts
    // handed over.
    let cutDown = !prologue || queuedEntry >= 0.999;
    const draw: Process = () => {
      if (disposed) return;
      classicMapFrameRef.current = null;
      const still = reducedMotion && prologue ? stillPose() : null;
      // The globe the page brings up, and the descent from it, until the
      // entry's clock is at its end (reduced motion: the planet, then a cut).
      const inEntrance = prologue && (still ? still === 'planet' : queuedEntry < 0.999);
      const entryIndex = entryIndexRef.current;
      const firstTarget = chapterRoute[entryIndex]?.stop.coordinates ?? chapterRoute[0]?.stop.coordinates;
      let dockAsk: DockAsk | null = null;

      if (inEntrance && firstTarget) {
        // ── The globe, then the descent ── The whole planet on the focal
        // point, facing the entry's place, while the page brings it up
        // (HomePage: the torn boarding pass); then, on the entry's own clock
        // (HomePage's, on time), straight down onto the place: the centre
        // never moves, the zoom runs on the house's sine, and the pitch comes
        // in only over the last of it (globeEntryPose). The camera is in the
        // air for the page meanwhile (the rail and the tickets wait for it
        // to come down).
        const entryNow = still ? 0 : queuedEntry;
        if (entryNow <= 0.001 && descending) {
          // Sent back to the start mid-descent: nothing is in the air.
          descending = false;
          setCameraState('rest');
          markInboundStop(null);
        }
        if (!descending && entryNow > 0.001) {
          descending = true;
          setCameraState('flying');
          markInboundStop(chapterRoute[entryIndex]?.stop.id ?? null);
          const place = viewfinderPlace(entryIndex);
          if (place) viewfinderRef.current?.hunt(place, performance.now() + (1 - entryNow) * ENTRY.diveMs);
        }
        // Back in the globe's hands (a new entry, or the first): a jump to
        // the end of its clock is the reader cutting it short again.
        cutDown = false;
        if (padded !== true) {
          padded = true;
          map.setPadding(activePadding);
        }
        const aim = { coordinate: restCenter(entryIndex), zoom: restZoom(entryIndex), pitch: CHAPTER_PITCH, bearing: CHAPTER_BEARING };
        const ink = smootherstep(clamp01(entryNow / PROLOGUE_INK_ENTRY));
        writePrologueInk(ink);
        hideRouteAll(ink < 1);
        entryPoseAt = globeEntryProgress(entryNow);
        const riseZoom = entryStartZoom(risePlanetZoom(document.documentElement.clientWidth, viewportH), aim.zoom);
        const pose = globeEntryPose(aim, entryPoseAt, riseZoom);
        writeLook();
        if (!lastCoordinate || Math.abs(lastZoom - pose.zoom) > 0.0004 ||
          Math.abs(lastCoordinate[0] - pose.center[0]) > 0.00005 || Math.abs(lastCoordinate[1] - pose.center[1]) > 0.00005 ||
          Math.abs(lastPitch - pose.pitch) > 0.015 || Math.abs(lastBearing - pose.bearing) > 0.015) {
          map.jumpTo({ center: pose.center, zoom: pose.zoom, bearing: pose.bearing, pitch: pose.pitch });
          lastCoordinate = pose.center;
          lastZoom = pose.zoom;
          lastPitch = pose.pitch;
          lastBearing = pose.bearing;
        }
        writeRouteTrim(restRoute(entryIndex));
        viewfinderRef.current?.focal(planFocal(entryIndex));
      } else {
        // ── The reader's map ── (and the phone, always). Nothing here moves
        // the camera: it is Mapbox's, or a flight's.
        // (Not the clock's own last frames: the sine is all but down there.)
        const cutShort = prologue && !still && !cutDown && entryPoseAt < ENTRY_CUT_BELOW && !!firstTarget;
        if (cutShort) {
          // The entry cut short (a key, a press, a second turn of the wheel):
          // the camera is set down on the place under a dip of the canvas
          // (the reduced-motion swap's own), never flung the rest of the way.
          stillFade?.cancel();
          stillCanvas.style.opacity = '0';
          if (padded !== true) {
            padded = true;
            map.setPadding(activePadding);
          }
          map.jumpTo(restPose(entryIndex));
          lastCoordinate = null;
          entryPoseAt = 1;
          stillFadeIn = true;
          const place = viewfinderPlace(entryIndex);
          if (place) viewfinderRef.current?.settle(place);
          writeRouteTrim(restRoute(entryIndex));
        }
        if (descending || cutShort) {
          // Down on the entry's place: its cover comes up, its sign reads.
          // The descent's last drawn frame is within a hair of the place's
          // resting pose (under ENTRY_CUT_BELOW's share of a pixel): set it
          // exactly, unseen.
          if (!cutShort && entryPoseAt < 1) {
            map.jumpTo(restPose(entryIndex));
            lastCoordinate = null;
            entryPoseAt = 1;
          }
          descending = false;
          setCameraState('locked');
          announce('atlas:arrive', entryIndex, null);
          plant(chapterRoute[entryIndex]?.stop.id ?? null);
        } else if (prologue && still === 'archive' && !cutDown) {
          // Reduced motion: the entry is a cut, straight onto the place's
          // resting pose (values, not structure), once.
          map.jumpTo(restPose(entryIndex));
          lastCoordinate = null;
          padded = true;
          setCameraState('rest');
          plant(chapterRoute[entryIndex]?.stop.id ?? null);
          const place = viewfinderPlace(entryIndex);
          if (place) viewfinderRef.current?.settle(place);
          writeRouteTrim(restRoute(entryIndex));
        }
        cutDown = true;
        if (prologue && padded !== true && !flying) {
          padded = true;
          map.setPadding(activePadding);
        }
        if (prologue) {
          writePrologueInk(1);
          hideRouteAll(false);
        }
        dockAsk = askFor();
      }

      setDockAt(dockAsk);

      if (prologue) {
        const mode = inEntrance ? 'prologue' : 'archive';
        if (mode !== paintMode) applyPaintMode(mode);
        const zoomNow = map.getZoom();
        const zoomVeil = followVeilZoom(zoomNow, !!still);
        // The archive's paint comes up over the silver print across
        // SILVER_EXIT on the way down (and the print comes back on the way
        // up); the reader's map is the archive's paint alone.
        const exit = mode === 'archive' ? 1 : silverExitAt(zoomVeil);
        writeSatelliteVeil(zoomVeil, exit);
        if (zoomVeil !== lookWrites.fadeZoom) {
          lookWrites.fadeZoom = zoomVeil;
          if (mode !== 'archive' && zoomVeil < 3.8) map.triggerRepaint();
        }
        if (Math.abs(zoomVeil - zoomNow) > 0.0005 && !veilFrame) {
          veilFrame = requestAnimationFrame(() => {
            veilFrame = 0;
            schedule();
          });
        }
      }
      if (!cameraSyncedRef.current) {
        cameraSyncedRef.current = true;
        setMapCameraSynced(true);
      }
      if (stillFadeIn) {
        stillFadeIn = false;
        map.once('render', stillReturn);
        map.triggerRepaint();
      }
    };
    const schedule = () => {
      if (disposed) return;
      if (classicMapFrameRef.current) return;
      classicMapFrameRef.current = draw;
      frame.render(draw, false, true);
    };
    const unsubscribeEntry = sampledEntryProgress.on('change', (progress) => {
      queuedEntry = progress;
      schedule();
    });
    if (prologue) {
      globeChannel.requestDraw = () => {
        if (!disposed) schedule();
      };
    }
    // The place in hand, as the camera comes back to the map: a restart
    // (a story closing, a resize, a late load) never replays a flight; it
    // marks the place and lets its cover come up where it is.
    if (!prologue || queuedEntry >= 0.999) {
      const held = currentRef.current;
      if (held && !flying) {
        plant(held);
        const place = viewfinderPlace(indexOf(held));
        if (place) viewfinderRef.current?.settle(place);
        const index = indexOf(held);
        if (index >= 0) writeRouteTrim(restRoute(index));
      }
    }
    // A move asked for before this run (the phone's entry, often: the map
    // loads after the ask).
    const pending = flightRef.current;
    if (pending && pending.token !== answeredFlightRef.current) {
      answeredFlightRef.current = pending.token;
      flyTo(pending);
    }
    flightHandlerRef.current = (next) => {
      answeredFlightRef.current = next.token;
      flyTo(next);
    };
    // Restarted in the reader's hands (a story closed over the map, a
    // resize): the camera is at rest, as it was — the teardown cleared the
    // flag, and with it the rest tone, until the next move.
    if (freeRef.current && !flying && !document.documentElement.dataset.atlasCamera) setCameraState('rest');
    schedule();
    return () => {
      flightHandlerRef.current = null;
      globeChannel.requestDraw = () => {};
      window.clearTimeout(cameraStateTimer);
      window.clearTimeout(dismissTimer);
      delete document.documentElement.dataset.atlasCamera;
      delete document.documentElement.dataset.atlasLandedAt;
      disposed = true;
      map.off('moveend', onMoveEnd);
      map.off('move', onFlightMove);
      map.off('move', onFreeMove);
      map.off('click', onClick);
      map.off('dblclick', onDoubleClick);
      if (flying) {
        // Torn down mid-flight (a story, a resize): the move is over.
        const done = flying;
        flying = null;
        map.stop();
        onArriveRef.current?.(done.token, false);
      }
      unsubscribeEntry();
      if (veilFrame) cancelAnimationFrame(veilFrame);
      lookWrites.fadeZoom = Number.NaN;
      clearPlantTimers();
      window.clearTimeout(stillTimer);
      map.off('render', stillReturn);
      stillFade?.cancel();
      stillCanvas.style.opacity = '';
      cancelFrame(draw);
      if (classicMapFrameRef.current === draw) classicMapFrameRef.current = null;
    };
    // viewfinderPlace / markCurrentStop / markInboundStop read only refs and
    // chapterRoute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlasEngaged, canvasExtension, chapterRestZooms, chapterRoute, globeChannel, layoutRevision, mapLoaded, mobile, paused, phoneApproach, phoneCardH, prologue, reducedMotion, sampledEntryProgress]);

  // The reader's map: the handlers on, the canvas a stop in the tab order
  // (arrows move it, + and − zoom), the zoom within EXPLORE_ZOOM. The keys
  // are the atlas's own, not Mapbox's: its +/− eased a whole level in 300 ms
  // and rounded to whole levels (5.05 → 6 → 7), 6.2 levels/s. Here + and −
  // take half a level on the house's sine, the arrows a short pan
  // (READER_ZOOM), and the wheel runs at a calmer rate than Mapbox's.
  const readerHasMap = free && mapLoaded && !paused;
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;
    const canvas = map.getCanvas();
    if (!readerHasMap) {
      map.setMinZoom(1);
      canvas.tabIndex = -1;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.removeAttribute('role');
      canvas.removeAttribute('aria-label');
      return;
    }
    map.touchZoomRotate.disableRotation();
    map.scrollZoom.setWheelZoomRate(READER_ZOOM.wheelRate);
    map.setMinZoom(mobile ? EXPLORE_ZOOM.minPhone : EXPLORE_ZOOM.min);
    canvas.tabIndex = 0;
    canvas.removeAttribute('aria-hidden');
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'Map of the archive. Arrow keys move it, plus and minus zoom. Each place is a shield.');
    // + and −: toward a target that each press moves on by half a level, so
    // a held key keeps on at the same calm pace instead of restarting.
    let zoomTarget = Number.NaN;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const pan = (x: number, y: number) => {
        event.preventDefault();
        map.panBy([x, y], { easing: voyageEase, duration: reducedMotion ? 0 : READER_ZOOM.panMs });
      };
      const zoomBy = (levels: number) => {
        event.preventDefault();
        const from = map.isEasing() && Number.isFinite(zoomTarget) ? zoomTarget : map.getZoom();
        zoomTarget = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), from + levels));
        const span = Math.abs(zoomTarget - map.getZoom());
        // Never faster than the one press's own peak (π/2 · 0.5 / 0.7 s).
        const ms = Math.max(READER_ZOOM.keyMs, (span / READER_ZOOM.keyLevels) * READER_ZOOM.keyMs);
        map.easeTo({ zoom: zoomTarget, easing: voyageEase, duration: reducedMotion ? 0 : ms });
      };
      const step = READER_ZOOM.panPx;
      switch (event.key) {
        case 'ArrowLeft': pan(-step, 0); break;
        case 'ArrowRight': pan(step, 0); break;
        case 'ArrowUp': pan(0, -step); break;
        case 'ArrowDown': pan(0, step); break;
        case '+':
        case '=': zoomBy(READER_ZOOM.keyLevels); break;
        case '-':
        case '_': zoomBy(-READER_ZOOM.keyLevels); break;
        default:
      }
    };
    canvas.addEventListener('keydown', onKey);
    return () => canvas.removeEventListener('keydown', onKey);
  }, [mapLoaded, mobile, readerHasMap, reducedMotion]);

  const mapReadiness = {
    loaded: mapLoaded,
    cameraSynced: mapCameraSynced,
    settled: mapSettled,
    idleFallback: mapIdleFallback,
  };
  useEffect(() => scheduleAtlasIdleFallback({
    loaded: mapLoaded,
    cameraSynced: mapCameraSynced,
    settled: mapSettled,
    idleFallback: mapIdleFallback,
  }, () => setMapIdleFallback(true)), [mapCameraSynced, mapIdleFallback, mapLoaded, mapSettled]);

  const coordinateLabel = activeStop ? formatCoordinateLabel(activeStop.coordinates) : '';
  const interfaceVisible = !paused && atlasEngaged && interfaceInFrame && isAtlasInterfaceReady(mapReadiness) &&
    (classicEntrance || interfaceOn);
  const playInterfaceIntro = interfaceVisible && !interfaceIntroPlayedRef.current;
  const interfaceGate = useMotionValue(interfaceVisible ? 1 : 0);
  const classicInterfaceOpacity = useTransform(
    [sampledEntryProgress, interfaceGate],
    ([entry, gate]) => (classicEntrance
      ? entrancePhase(Number(entry), ...ARCHIVE_ENTRANCE_PHASES.interface)
      : 1) * Number(gate),
  );
  const classicHeaderOpacity = useTransform(
    [sampledEntryProgress, interfaceGate],
    ([entry, gate]) => (classicEntrance
      ? entrancePhase(Number(entry),
          ARCHIVE_ENTRANCE_PHASES.interface[0] - CLASSIC_INTERFACE_STAGGER,
          ARCHIVE_ENTRANCE_PHASES.interface[1] - CLASSIC_INTERFACE_STAGGER)
      : 1) * Number(gate),
  );
  const classicFooterOpacity = useTransform(
    [sampledEntryProgress, interfaceGate],
    ([entry, gate]) => (classicEntrance
      ? entrancePhase(Number(entry),
          ARCHIVE_ENTRANCE_PHASES.interface[0] + CLASSIC_INTERFACE_STAGGER,
          ARCHIVE_ENTRANCE_PHASES.interface[1] + CLASSIC_INTERFACE_STAGGER)
      : 1) * Number(gate),
  );
  // Only lifts that follow an opacity already on its way (no parallax while
  // the camera moves: these ride the entry's clock, which the camera has
  // finished with by the time they move).
  const classicHeaderY = useTransform(classicHeaderOpacity, (opacity) => (1 - opacity) * 12);
  const classicFooterY = useTransform(classicFooterOpacity, (opacity) => (1 - opacity) * 12);
  const accessibleEntry = classicEntrance ? CLASSIC_INTERFACE_ACCESSIBLE_ENTRY : 0.8;
  const [entryInterfaceAvailable, setEntryInterfaceAvailable] = useState(() =>
    !classicEntrance || sampledEntryProgress.get() >= accessibleEntry,
  );
  const interfaceAccessible = interfaceVisible && (!classicEntrance || entryInterfaceAvailable);

  useEffect(() => {
    if (!classicEntrance) {
      setEntryInterfaceAvailable(true);
      return;
    }
    let available = sampledEntryProgress.get() >= accessibleEntry;
    setEntryInterfaceAvailable(available);
    return sampledEntryProgress.on('change', (progress) => {
      const next = progress >= accessibleEntry;
      if (next === available) return;
      available = next;
      setEntryInterfaceAvailable(next);
    });
  }, [accessibleEntry, classicEntrance, sampledEntryProgress]);

  useEffect(() => {
    const target = interfaceVisible ? 1 : 0;
    if (reducedMotion) {
      interfaceGate.set(target);
      return;
    }
    const controls = animate(interfaceGate, target, {
      duration: target ? 0.32 : 0.24,
      ease: EASE.arrive,
    });
    return () => controls.stop();
  }, [interfaceGate, interfaceVisible, reducedMotion]);

  useEffect(() => {
    if (!interfaceVisible || interfaceIntroPlayedRef.current) return;
    const timeout = window.setTimeout(() => {
      interfaceIntroPlayedRef.current = true;
    }, 1100);
    return () => window.clearTimeout(timeout);
  }, [interfaceVisible]);


  if (chapterRoute.length < 1 || !viewportReady) {
    return (
      <section
        aria-hidden="true"
        className={`route-atlas relative w-full overflow-hidden bg-[#282c20] ${mobile ? 'route-atlas--mobile h-full min-h-[100svh]' : 'h-full'}`}
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

  const total = chapterRoute.length;
  const ordinal = currentIndex >= 0 ? `${pad2(chapterRoute[currentIndex].chapterIndex + 1)} / ${pad2(total)}` : `— / ${pad2(total)}`;

  return (
    <section
      ref={routeAtlasRef}
      aria-label="The archive's map"
      data-atlas-engaged={atlasEngaged ? 'true' : 'false'}
      data-atlas-free={readerHasMap ? '' : undefined}
      data-no-place={current ? undefined : ''}
      onPointerMove={noteAtlasLook}
      onPointerLeave={endAtlasLook}
      className={`route-atlas relative isolate w-full ${prologue ? 'overflow-visible' : 'overflow-hidden'} bg-transparent ${mobile ? 'route-atlas--mobile h-full min-h-[100svh]' : 'h-full'}`}
    >
      <div className="absolute inset-0 bg-[#282c20]" aria-hidden="true" />
      <div
        style={prologue ? { right: -(CANVAS_BLEED + canvasExtension) } : undefined}
        className={`route-atlas__canvas absolute origin-center overflow-hidden ${classicEntrance ? 'route-atlas__canvas--bleed -inset-8' : 'inset-0'}`}
      >
        <motion.div
          aria-hidden="true"
          initial={false}
          animate={{ opacity: prologue || mapSettled ? 0 : 0.3 }}
          transition={{ duration: reducedMotion ? 0 : 0.85, ease: EASE.arrive }}
          className="route-atlas-fallback__art pointer-events-none absolute inset-0"
        >
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
        </motion.div>

        {mapEligible && (
          <MapGL
            ref={mapRef}
            mapboxAccessToken={mapboxToken}
            mapStyle={MAP_STYLE}
            projection={{ name: 'globe' }}
            initialViewState={mobile
              ? phoneApproach
              : chapterRoute[0]
                ? {
                    longitude: chapterRoute[0].stop.coordinates[0],
                    latitude: chapterRoute[0].stop.coordinates[1],
                    zoom: GLOBE_START_ZOOM,
                    bearing: 0,
                    pitch: 0,
                  }
                : { ...US_OVERVIEW, zoom: 3 }}
            // The globe's canvas is held back until the pass is torn and the
            // tiles of the pose it rises in are in, then fades in (see the
            // load-in above).
            style={{
              width: '100%',
              height: '100%',
              ...(prologue
                ? { opacity: globeRevealed ? 1 : 0, transition: `opacity 700ms ${CSS_EASE.arrive}` }
                : null),
            }}
            attributionControl
            trackResize={false}
            renderWorldCopies={false}
            fadeDuration={0}
            // The reader's map (the explorer's `explore`): drag, the wheel
            // and a pinch zoom. A double-click and the keys are the atlas's
            // own, calmer than Mapbox's (see "The reader's map" above).
            // Never rotated, never tipped by hand: the pitch is held.
            scrollZoom={readerHasMap}
            dragPan={readerHasMap}
            touchZoomRotate={readerHasMap}
            doubleClickZoom={false}
            keyboard={false}
            dragRotate={false}
            touchPitch={false}
            boxZoom={false}
            // No snap to north when a drag ends: Mapbox eased the atlas's
            // -2° to 0° after every drag, a turn nobody asked for (and the
            // next flight turned it back).
            bearingSnap={0}
            // Constant: a change of either makes react-map-gl wrap the map's
            // transform in its proxy again, and nested proxies recursed to a
            // stack overflow. The reader's range is set on the map itself
            // (see "The reader's map").
            minZoom={1}
            maxZoom={EXPLORE_ZOOM.max}
            // Full device pixels, deliberately (mapbox-gl 3 reads
            // window.devicePixelRatio live; a weak GPU gets the planet light's
            // lite pass instead).
            // The basemap's labels avoid the places' keep-out (a symbol layer
            // on its own source), so collisions run across sources.
            crossSourceCollisions
            onIdle={() => setMapSettled(true)}
            onLoad={() => {
              setMapLoaded(true);
              setMapLoadDelayed(false);
              const map = mapRef.current?.getMap();
              if (!map) return;
              // Out of the tab order until the reader has the map (then it is
              // a stop with its own keys, see "The reader's map").
              map.getCanvas().tabIndex = -1;
              map.getCanvas().setAttribute('aria-hidden', 'true');
              {
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
              map.touchZoomRotate.disableRotation();
              map.setTerrain(null);
              // The prologue globe is photographic: satellite imagery at globe
              // zooms, printed in silver (globeLook) and lit by one key light
              // (planetLight). As the camera goes down it settles to a residual
              // veil under the atlas's paper, and past SILVER_EXIT takes
              // the archive's own paint back.
              if (prologue && !map.getSource('prologue-satellite')) {
                const firstLabel = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;
                const lookWrites = globeWritesRef.current;
                lookWrites.lookQ = 1;
                lookWrites.floor = silverFloorAt(1);
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
                // The archive's paint, over the print: it comes up across
                // SILVER_EXIT and is the reader's map (writeSatelliteVeil).
                // The same imagery through a source of its own: two raster
                // layers on one source share the draped globe's overlap
                // stencil, and wherever a new zoom level's tiles came in over
                // their parents mid-dive the upper layer was masked out — a
                // tile-shaped patch of bare ground flashing in the sea for a
                // frame or two. (The browser's cache serves the second
                // source's tiles: the same URLs.)
                lookWrites.stockOpacity = 0;
                map.addSource(SATELLITE_STOCK_LAYER, { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 });
                map.addLayer({
                  id: SATELLITE_STOCK_LAYER,
                  type: 'raster',
                  source: SATELLITE_STOCK_LAYER,
                  paint: {
                    'raster-opacity': 0,
                    'raster-opacity-transition': { duration: 0, delay: 0 },
                    ...STOCK_PAINT,
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
              }
              map.setFog(prologue ? (globeChannel.lite ? PROLOGUE_FOG_LITE : PROLOGUE_FOG) : GLOBE_FOG);

              // ── A drawing, not a road map ──
              // Five inks remain: paper (background), water, land, the state
              // line and the river. Interstates drop to a whisper and every
              // class below them is not drawn, so the white route is the
              // loudest line on the map. /travel (MapboxMap.tsx) keeps its road
              // hierarchy on purpose: do not "complete" this into a global
              // cleanup (src/lib/atlasBasemap.ts).
              const roadWhisper = 0.16;
              map.getStyle().layers?.forEach((layer) => {
                const id = layer.id.toLowerCase();
                if (layer.type === 'fill-extrusion' || layer.type === 'hillshade') {
                  map.setLayoutProperty(layer.id, 'visibility', 'none');
                  return;
                }
                if (layer.type === 'background') {
                  map.setPaintProperty(layer.id, 'background-color', ATLAS_PAPER.background);
                  return;
                }
                if (layer.type === 'fill') {
                  if (id.includes('water')) {
                    map.setPaintProperty(layer.id, 'fill-color', ATLAS_PAPER.water);
                    map.setPaintProperty(layer.id, 'fill-opacity', 0.92);
                  } else if (id.includes('park') || id.includes('landuse') || id.includes('landcover')) {
                    map.setPaintProperty(layer.id, 'fill-color', ATLAS_PAPER.land);
                    map.setPaintProperty(layer.id, 'fill-opacity', mobile ? 0.36 : 0.38);
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
                    map.setPaintProperty(layer.id, 'line-opacity', mobile ? 0.28 : 0.4);
                  } else if (id.includes('motorway') || id.includes('trunk') || id.includes('primary')) {
                    map.setPaintProperty(layer.id, 'line-color', '#8C9588');
                    map.setPaintProperty(layer.id, 'line-opacity', roadWhisper);
                  } else if (id.includes('secondary') || id.includes('tertiary')) {
                    map.setLayoutProperty(layer.id, 'visibility', 'none');
                  } else if (id.includes('road') || id.includes('street')) {
                    // dark-v11 folds the whole hierarchy into `road-simple`
                    // and tells the classes apart on the feature: interstates
                    // at a whisper, every class below them not drawn.
                    map.setPaintProperty(layer.id, 'line-color', '#8C9588');
                    map.setPaintProperty(layer.id, 'line-opacity', ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], roadWhisper, 0]);
                  } else if (id.includes('waterway')) {
                    map.setPaintProperty(layer.id, 'line-color', '#657168');
                    map.setPaintProperty(layer.id, 'line-opacity', mobile ? 0.18 : 0.3);
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
                if (isBaseNavigationNoise || isRoadLabel) {
                  map.setLayoutProperty(layer.id, 'visibility', 'none');
                  return;
                }
                const isAtlasLabel =
                  id.includes('state-label') ||
                  id.includes('country-label') ||
                  id.includes('water-point') ||
                  id.includes('water-line');
                // The basemap's own type sits BELOW the page's typography:
                // geography stays legible, place names are the page's job.
                const labelOpacity = isAtlasLabel
                  ? (mobile ? 0.2 : 0.24)
                  : isPlaceLabel
                    ? (mobile ? 0.2 : 0.26)
                    : (mobile ? 0.16 : 0.2);
                // The prologue globe is unlabelled photography; names arrive
                // with the descent.
                map.setPaintProperty(
                  layer.id,
                  'text-opacity',
                  prologue
                    ? ['interpolate', ['linear'], ['zoom'], PROLOGUE_SATELLITE_FADE[0] + 0.3, 0, PROLOGUE_SATELLITE_FADE[1] - 0.1, labelOpacity]
                    : labelOpacity,
                );
                map.setPaintProperty(layer.id, 'text-color', '#AEB5A6');
                // Patterson's inversion: the ground softens behind the type,
                // at half the paper's strength over the photograph.
                map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(27, 35, 25, 0.5)');
                map.setPaintProperty(layer.id, 'text-halo-width', 1.1);
                map.setPaintProperty(layer.id, 'text-halo-blur', 1.5);
                // The page caps uppercase tracking at 0.1em and the map is not
                // exempt.
                const tracking = layer.layout?.['text-letter-spacing'];
                if (typeof tracking === 'number' ? tracking > 0.1 : Array.isArray(tracking)) {
                  try {
                    map.setLayoutProperty(layer.id, 'text-letter-spacing', typeof tracking === 'number' ? 0.1 : ['min', 0.1, tracking]);
                  } catch {
                    // A style whose tracking cannot be composed keeps its own.
                  }
                }
              });

              // The basemap does not name the places this archive is naming:
              // each is signed already (its shield, its ticket).
              silenceArchivePlaceLabels(map, chapterRoute.map((entry) => entry.stop.name));
              // The phone's map: the land as a photograph of itself, in the
              // archive's own stock paint, under the labels and the route.
              if (mobile && !map.getSource('phone-satellite')) {
                const firstLabel = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;
                map.addSource('phone-satellite', { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 });
                map.addLayer({
                  id: 'phone-satellite',
                  type: 'raster',
                  source: 'phone-satellite',
                  paint: {
                    'raster-opacity': PHONE_SATELLITE_OPACITY,
                    'raster-fade-duration': 240,
                    ...STOCK_PAINT,
                  } as never,
                }, firstLabel);
              }
              // Keep-out, the /travel technique: an invisible icon on every
              // place, so the basemap does not set a town's name across the
              // ground a shield stands on.
              if (!map.getLayer(ATLAS_KEEP_OUT.id)) {
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
            <Source key="route-all" id="route-all" type="geojson" data={fullRoute} lineMetrics>
              <Layer
                id="route-all-glow"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': MAP_BURN,
                  'line-width': 4,
                  'line-opacity': atlasEngaged ? 0.16 : 0,
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
                  'line-opacity': atlasEngaged ? 0.5 : 0,
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
                  'line-opacity': 0.22,
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
                  'line-opacity': 0.92,
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
                    // Seeded dark, once: the camera prints it in with the
                    // descent, and a value here that changed per render would
                    // be re-applied behind its back.
                    'line-opacity': 0,
                  }}
                />
              )}
            </Source>
            {prologue && (
              <Source key="prologue-stops" id="prologue-stops" type="geojson" data={prologueStops}>
                {/* Each place a small dot of white ink with a hard knockout of
                    burn round it, upright to the viewer. */}
                <Layer
                  id="prologue-stops-dot"
                  type="circle"
                  paint={{
                    'circle-radius': 2.25,
                    'circle-color': MAP_INK,
                    'circle-stroke-color': MAP_BURN,
                    'circle-stroke-width': 1.25,
                    'circle-pitch-alignment': 'viewport',
                    'circle-opacity': 0,
                    'circle-stroke-opacity': 0,
                  }}
                />
              </Source>
            )}

            {/* The places: one shield per place (PlaceShield), upright to the
                camera, the point of its foot on the place itself. Every place
                the archive has photographs of is here. */}
            {shieldPlaces.map((place) => (
              <Marker
                key={`shield-${place.id}`}
                longitude={place.coordinates[0]}
                latitude={place.coordinates[1]}
                anchor="bottom"
                pitchAlignment="viewport"
                rotationAlignment="viewport"
              >
                <PlaceShield
                  stop={place}
                  width={shieldPx}
                  initialCurrentId={currentStopRef.current}
                  engaged={engagedChapterId === place.id}
                  visibility={classicInterfaceOpacity}
                  onEngage={onEngage}
                  onNavigate={onSelect}
                />
              </Marker>
            ))}
          </MapGL>
        )}
      </div>

      <motion.div
        aria-hidden="true"
        className={`route-atlas-entry-dissolve pointer-events-none absolute inset-x-0 top-0 z-[5] ${mobile ? 'h-[18%]' : 'h-[16%]'}`}
        style={prologue ? { opacity: archiveFrameOpacity, right: -canvasExtension } : undefined}
      />

      <AnimatePresence>
        {mapEligible && !mapLoaded && mapLoadDelayed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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

      {/* Reading tone: keyed off the camera state on <html> (CSS, no React),
          printed on the map's ground under the places' ink (see inkGround),
          held at zero through the globe prologue by the archive frame's fade. */}
      {(() => {
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

      <AtlasViewfinder
        ref={viewfinderRef}
        initial={initialViewfinderPlace}
        visibility={classicInterfaceOpacity}
        reducedMotion={reducedMotion}
        scrimHost={inkGround}
        bleed={bleed}
      />

      {!mobile && (
        <motion.header
          initial={false}
          style={{ opacity: classicHeaderOpacity, y: classicHeaderY }}
          aria-hidden={!interfaceAccessible}
          inert={!interfaceAccessible}
          className="route-atlas-header pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between pb-7 pl-8 pr-[38%] pt-24"
        >
          <div>
            <div className="flex items-center gap-3">
              {/* Bone ink, and no glow: the atlas's one lime is the
                  viewfinder's chapter number. */}
              <span className="h-1.5 w-1.5 rounded-full bg-[#F4F4ED]" />
              <p className="font-ui text-[8px] font-bold uppercase tracking-[0.1em] text-white/84">The Route</p>
            </div>
            <p className="mt-3 font-ui text-[9px] uppercase tracking-[0.1em] text-white/72">Photographic coordinates</p>
          </div>
          <span className="font-ui text-[9px] uppercase tabular-nums tracking-[0.1em] text-white/72">{ordinal}</span>
        </motion.header>
      )}

      {!mobile && (
        <motion.footer
          initial={false}
          style={{ opacity: classicFooterOpacity, y: classicFooterY }}
          aria-hidden={!interfaceAccessible}
          inert={!interfaceAccessible}
          className="route-atlas-status pointer-events-none absolute bottom-7 left-8 right-[38%] z-20"
        >
          <div className="route-atlas-footer pt-5">
            <span className="sr-only" aria-live="polite">
              {activeStop ? `Current place: ${activeStop.name}. Coordinates ${coordinateLabel}` : 'The whole map'}
            </span>
            {/* The archive as a strip of ticks, one per frame, grouped by place. */}
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
              onNavigate={onSelect}
            />
          </div>
        </motion.footer>
      )}
    </section>
  );
}
