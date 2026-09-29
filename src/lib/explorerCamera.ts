// ── The explorer's camera: calm by construction ──
// Owner, 2026-09-28: 到主页的时候，我感觉从视觉上来看有点晃眼，有点晕. The map the
// reader now roams must never be the thing that makes them dizzy. What made
// it so, measured on the scroll-driven chapters it replaces (scripts/
// explorer.test.mjs keeps the numbers): hops that raced the ground across
// the screen at the apex of a steep climb (rho 2.1, 0.85–1.85 s), a dive
// that tipped the camera 46° while it zoomed and turned, and a camera that
// leaned on every wheel tick. Here:
//  - a flight's duration is DERIVED from its own path so that the ground
//    under the focal point never crosses the screen faster than
//    SCREEN_SPEED_CAP (a share of the viewport per second) and the zoom never
//    changes faster than ZOOM_RATE_CAP levels a second; the path climbs less
//    (FLIGHT.curve) and eases in and out (the house's sine, voyageEase);
//  - bearing never changes in a flight, and the pitch is one gentle oblique
//    view held at every zoom (EXPLORE_PITCH): the review of 2026-09-28
//    measured the pitch that followed the zoom tipping 75°/s under one flick
//    of the wheel (242°/s under a double-click) — the reader's own hand
//    swinging the camera — so it no longer follows anything;
//  - the reader's own drag and zoom are the map's (Mapbox), within
//    EXPLORE_ZOOM: the whole planet to a regional view, the wheel, the keys
//    and a double-click all held under the flights' own zoom cap
//    (READER_ZOOM, RouteAtlas "The reader's map").
// Pure: no DOM, no Mapbox. RouteAtlas plays what this plans.

import { voyageEase } from './motion.ts';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** The reader's zoom range: the whole planet … a regional view (a phone's
 *  planet is smaller: its screen is). */
export const EXPLORE_ZOOM = { min: 1.6, minPhone: 1, max: 8.5 } as const;

/** The oblique view: this many degrees at every zoom, held (never tipped
 *  with the zoom). It was 46°, tipped in on every dive, then 40° following
 *  the zoom; at 24° the ground near the foot of the screen moves about 1.3×
 *  the focal point's speed in a flight instead of 1.7×, and the planet's
 *  bright limb stays out of the frame at rest. */
export const EXPLORE_PITCH = { rest: 24 } as const;
/** The chapters' bearing: north all but straight up, and it never moves. */
export const EXPLORE_BEARING = -2;

/** The reader's own zooms, held under the flights' zoom cap. Mapbox's own
 *  double-click and +/− eased a whole level in 300 ms (6.2 levels/s, and the
 *  keys rounded to whole levels); its wheel ran a quick flick at ~1.9/s. */
export const READER_ZOOM = {
  /** A double-click: one level, about the point clicked. Peaks at
   *  π/2 · 1 / 1.4 ≈ 1.12 levels/s on the house's sine. */
  clickLevels: 1,
  clickMs: 1400,
  /** + / −: half a level a press, never rounded. */
  keyLevels: 0.5,
  keyMs: 700,
  /** The arrows: this far a press. */
  panPx: 120,
  panMs: 450,
  /** Mapbox's wheel rate (levels per wheel delta px); its default is 1/450,
   *  under which a brisk flick of a mouse wheel (ten notches) zoomed 1.9
   *  levels/s; 1/700 measured 1.39, this ~1.15. A trackpad's own rate is
   *  left as it is (0.2 levels/s measured). */
  wheelRate: 1 / 850,
} as const;

// ── A flight ──
// The path is van Wijk & Nuij's (2003), the one Mapbox's flyTo draws with
// `curve` as rho: the camera climbs and descends so the ground seems to move
// at one pace. Mapbox measures it the way `flightPath` does: `w0` the larger
// side of the canvas (px), `u1` the ground to cover at the start zoom (px),
// `dz` the zoom change.
export interface FlightPath {
  /** At s in [0, 1] of the path: the fraction of the ground covered and the
   *  zoom change from the start. */
  at: (s: number) => { u: number; dz: number };
  /** Zoom levels the path climbs above the start, at its highest. */
  lift: number;
}

export function flightPath(w0: number, w1: number, u1: number, rho: number): FlightPath {
  const rho2 = rho * rho;
  if (!(u1 > 1e-6)) {
    const dz = Math.log2(w0 / w1);
    return { at: (s) => ({ u: 0, dz: dz * clamp01(s) }), lift: Math.max(0, -dz) };
  }
  const r = (i: number) => {
    const b = (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho2 * rho2 * u1 * u1) / (2 * (i ? w1 : w0) * rho2 * u1);
    return Math.log(Math.sqrt(b * b + 1) - b);
  };
  const r0 = r(0);
  const S = (r(1) - r0) / rho;
  if (!Number.isFinite(S) || S <= 0) {
    const dz = Math.log2(w0 / w1);
    return { at: (s) => ({ u: clamp01(s), dz: dz * clamp01(s) }), lift: Math.max(0, -dz) };
  }
  const coshR0 = Math.cosh(r0);
  const sinhR0 = Math.sinh(r0);
  const at = (s: number) => {
    const k = r0 + rho * S * clamp01(s);
    const w = coshR0 / Math.cosh(k);
    const u = (w0 * (coshR0 * Math.tanh(k) - sinhR0)) / rho2 / u1;
    return { u: clamp01(u), dz: Math.log2(1 / w) };
  };
  const apexAt = -r0 / (rho * S);
  const lift = apexAt > 0 && apexAt < 1 ? Math.log2(coshR0) : Math.max(0, -at(1).dz, 0);
  return { at, lift };
}

export interface FlightSpeeds {
  /** The fastest the ground under the focal point crosses the screen, px/s. */
  screenPxPerS: number;
  /** The fastest the zoom changes, levels/s. */
  zoomPerS: number;
  /** The most the path climbs above the start, levels. */
  lift: number;
}

/**
 * How fast a flight along `path` over `durationMs` moves, on `ease` (the
 * clock's shape; Mapbox eases the path parameter), sampled `steps` times:
 * the ground under the focal point in screen px (world px at the start zoom
 * × the zoom's scale then) and the zoom's rate.
 */
export function flightSpeeds(
  path: FlightPath,
  u1: number,
  durationMs: number,
  ease: (t: number) => number = voyageEase,
  steps = 240,
): FlightSpeeds {
  let screen = 0;
  let zoom = 0;
  let lift = 0;
  let prev = path.at(0);
  const dt = durationMs / 1000 / steps;
  for (let index = 1; index <= steps; index += 1) {
    const now = path.at(ease(index / steps));
    const scale = 2 ** ((now.dz + prev.dz) / 2);
    screen = Math.max(screen, (Math.abs(now.u - prev.u) * u1 * scale) / dt);
    zoom = Math.max(zoom, Math.abs(now.dz - prev.dz) / dt);
    lift = Math.max(lift, -now.dz);
    prev = now;
  }
  return { screenPxPerS: screen, zoomPerS: zoom, lift };
}

export const FLIGHT = {
  /** Mapbox's `curve` (rho): 1.42 is its default; the chapters' hops used
   *  2.1 and climbed high enough to show the planet's edge on a neighbour. */
  curve: 1.25,
  /** The ground under the focal point: never faster than this share of the
   *  viewport's width a second. The cap is set at the focal point, but the
   *  foreground low on the screen moves faster under the oblique camera
   *  (≈1.3× at 24°), and a flight that changes zoom moves the edges faster
   *  still: at 0.62 (with 40°) the fastest point crossed at up to 1.13 vw/s;
   *  at 0.4 (with 24°) no point of the screen passes ~0.65 vw/s, the median
   *  point ~0.45 (traced on the live page at 1728). */
  screenShare: 0.4,
  /** The zoom: never faster than this, levels a second. */
  zoomPerS: 1.15,
  /** Never shorter (a neighbour still reads as a trip) nor longer. The
   *  longest is the fall from the whole planet onto a place (~4.4 levels):
   *  capped at 3.6 s it peaked at 2.2 levels/s on the live page; at 5.2 s it
   *  is the entry's own pace. */
  minMs: 1500,
  maxMs: 5200,
} as const;

export interface FlightPlan {
  durationMs: number;
  curve: number;
  speeds: FlightSpeeds;
}

/**
 * A flight's duration: the shortest (≥ FLIGHT.minMs) that keeps its path
 * under both caps on the house's sine clock — DERIVED, since the speed of a
 * path scales as one over its duration. `w0` is the canvas's larger side
 * (px), `u1` the ground to cover at the start zoom (px), `dz` the zoom
 * change, `viewportW` the screen's width (the share is of it).
 */
export function planFlight(w0: number, u1: number, dz: number, viewportW: number): FlightPlan {
  const path = flightPath(w0, w0 / 2 ** dz, u1, FLIGHT.curve);
  const probe = flightSpeeds(path, u1, 1000);
  const capPx = FLIGHT.screenShare * Math.max(320, viewportW);
  const needed = Math.max(probe.screenPxPerS / capPx, probe.zoomPerS / FLIGHT.zoomPerS) * 1000;
  const durationMs = Math.round(Math.min(FLIGHT.maxMs, Math.max(FLIGHT.minMs, needed)));
  return { durationMs, curve: FLIGHT.curve, speeds: flightSpeeds(path, u1, durationMs) };
}

// ── The entry ──
// From the globe the page brings up to stop 01, in one calm move. The torn
// boarding pass (HomePage, EntranceIntro) glides the page on and the globe
// rises over the lower edge with it — the whole planet on the atlas's focal
// point, already facing stop 01 (RouteAtlas, `risePlanetZoom`) — and the
// explorer's entry, asked for through the seam as the glide lands, takes the
// camera straight down onto the place: the centre held, the zoom on the
// house's sine, the tip to the oblique view over the last 70% (RouteAtlas,
// `globeEntryPose`). There is no turn before it any more: the first screen's
// corner globe (India's face, turned ~195° to the Americas over 3.8 s) went
// with the first screen.
// The reader can cut it short: a key, a press or a new turn of the wheel
// sets the camera down on stop 01 at once (HomePage, `finishEntry`).
export const ENTRY = {
  /** The descent onto stop 01, ms. The rise planet's zoom is ~2.2 at
   *  1728 × 1000 and ~1.9 at 1280 × 800, and a place rests at 5.05: on the
   *  sine a descent of Δ levels over T peaks at π/2 · Δ / T, so 4.4 s keeps
   *  the zoom at or under FLIGHT.zoomPerS down to an 800 px window (1.02 and
   *  1.14 levels/s traced on the built page), and the 24° tip over its last
   *  70% at ~12°/s. */
  diveMs: 4400,
  /** On a phone: the camera waits above stop 01 at PHONE_APPROACH_ZOOM (the
   *  page brings that view up) and goes down, at least this long. */
  phoneMinMs: 2400,
} as const;

/** The fastest the entry's descent changes the zoom, levels a second: from
 *  `startZoom` to `restZoom` on the house's sine over `diveMs`. */
export function entryZoomRate(startZoom: number, restZoom: number, diveMs: number = ENTRY.diveMs) {
  return (Math.PI / 2) * Math.abs(restZoom - startZoom) / (diveMs / 1000);
}

/** Where the entry's descent starts: the whole planet fitted to the screen
 *  (`fitted`), but never so far out that the descent to `restZoom` would
 *  pass FLIGHT.zoomPerS — a tall, narrow window (a tablet held upright)
 *  fits a smaller planet; it rises a little larger instead. */
export function entryStartZoom(fitted: number, restZoom: number, diveMs: number = ENTRY.diveMs) {
  return Math.max(fitted, restZoom - (FLIGHT.zoomPerS * (diveMs / 1000)) / (Math.PI / 2));
}
