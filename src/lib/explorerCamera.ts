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

import { DUR_MS, EASE, bezierFn, voyageEase } from './motion.ts';
import { projectAt, type Point } from './coverDock.ts';

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

// ── A switch: the planet turns under the still cover ──
// Owner, 2026-09-28 (switching was 不是自由的，移动的也很卡顿 beside 11 mois sans
// toi(t)): any place to any place, at once, with no tear, and the camera
// moves the way the reference's does — one flyTo of DUR_MS.turn on EASE.turn
// whatever the distance, its own curve (Mapbox's default; the reference
// passes none), the pitch held, and every place set on its corner's point of
// the screen (src/lib/coverDock.ts: places at one corner share it). At the
// places' rest zooms a leg across the archive climbs only 0.16–0.75 of a
// level (scripts/explorer.test.mjs): the flight reads as the planet turning
// under the ticket, not as a climb and a fall. A new
// choice mid-turn starts from where the camera is (Mapbox's own flyTo does),
// never snapping.
// The derived flights above (planFlight) stay for the moves that are not a
// switch: the phone's entry, the camera brought back onto the place in hand.
export const SWITCH = {
  /** One turn, ms, whatever the distance. */
  ms: DUR_MS.turn,
  /** Mapbox's `curve` (rho): its default, the reference's. */
  curve: 1.42,
  /** A switch that also has to come down from far out (the reader zoomed
   *  out towards the planet) takes this much longer for each level past the
   *  first, up to `maxMs`: the whole planet to a place (~3.5 levels) is a
   *  2.4 s turn, not a 1.4 s dive. */
  perLevelMs: 400,
  maxMs: 2600,
  /** A far leg (review of 2026-09-29, 有点晕): on the turn at the rest zoom
   *  the ground crossed at 1.4–1.7 viewport widths a second at 1728
   *  (Orlando → Page 2827 px/s, Page → New York 2987), and the camera took
   *  off from rest to 40 px a frame in one frame (the turn's curve starts at
   *  2.77× its mean speed). The reference turns its planet at zoom 2.8,
   *  where the same curve peaks near 0.8 vw/s. So a leg whose turn would
   *  pass `farShare` of the viewport's width a second under the focal point
   *  turns on the house's sine instead — it sets off from rest and peaks at
   *  π/2 of its mean, not 2.77× — as long as it needs to stay under the
   *  share, up to `farMaxMs`. The share is set at the focal point; the
   *  fastest shield on screen runs ~1.2× it under the oblique camera, so
   *  0.72 keeps every shield on screen near 0.9 vw/s (1550 px/s at 1728:
   *  traced on the built page). The path keeps Mapbox's own curve: at the
   *  rest zooms it climbs 0.4–0.5 of a level on the far legs (a curve of 2
   *  climbed a whole level, an apex). A neighbour keeps the turn. */
  farShare: 0.72,
  farMaxMs: 2000,
} as const;

/** A switch's duration for a zoom change of `dz` levels. */
export function switchMs(dz: number) {
  const extra = Math.max(0, Math.abs(dz) - 1);
  return Math.round(Math.min(SWITCH.maxMs, SWITCH.ms + SWITCH.perLevelMs * extra));
}

const turnCurve = bezierFn(EASE.turn);

export interface SwitchPlan {
  durationMs: number;
  curve: number;
  /** The clock's shape: the reference's turn, or the house's sine (a far
   *  leg). */
  ease: 'turn' | 'sine';
  /** The fastest the ground under the focal point crosses the screen, px/s. */
  screenPxPerS: number;
  /** Levels the path climbs above the start. */
  lift: number;
}

/**
 * A switch: the turn (SWITCH.ms, or longer from far out: `switchMs`) on the
 * reference's curve, unless that would race the ground past
 * SWITCH.farShare of the viewport's width a second — then the house's sine,
 * as long as the share needs (DERIVED: a path's speed scales as one over
 * its duration), within SWITCH.farMaxMs. `w0` the canvas's larger side
 * (px), `u1` the ground to cover at the start zoom (px), `dz` the zoom
 * change, `viewportW` the screen's width.
 */
export function planSwitch(w0: number, u1: number, dz: number, viewportW: number): SwitchPlan {
  const path = flightPath(w0, w0 / 2 ** dz, u1, SWITCH.curve);
  const base = switchMs(dz);
  const cap = SWITCH.farShare * Math.max(320, viewportW);
  const turn = flightSpeeds(path, u1, base, turnCurve);
  if (turn.screenPxPerS <= cap) {
    return { durationMs: base, curve: SWITCH.curve, ease: 'turn', screenPxPerS: turn.screenPxPerS, lift: path.lift };
  }
  const probe = flightSpeeds(path, u1, 1000, voyageEase);
  const needed = (probe.screenPxPerS / cap) * 1000;
  const durationMs = Math.round(Math.max(base, Math.min(Math.max(base, SWITCH.farMaxMs), needed)));
  const speeds = flightSpeeds(path, u1, durationMs, voyageEase);
  return { durationMs, curve: SWITCH.curve, ease: 'sine', screenPxPerS: speeds.screenPxPerS, lift: path.lift };
}

/** How far a switch climbs above its start, levels: the van Wijk path Mapbox
 *  flies at SWITCH.curve (`w0` the canvas's larger side, `u1` the ground to
 *  cover at the start zoom, px, `dz` the zoom change). */
export function switchLift(w0: number, u1: number, dz = 0) {
  return flightPath(w0, w0 / 2 ** dz, u1, SWITCH.curve).lift;
}

// ── The entry ──
// From the globe the page brings up to stop 01, in one calm move. The torn
// boarding pass (HomePage, EntranceIntro) glides the page on and the globe
// rises over the lower edge with it — the whole planet in the middle of the
// screen, facing stop 01, the place at the planet's centre (RouteAtlas,
// `risePlanetZoom`, `entryFrame`) — and the explorer's entry, asked for
// through the seam as the glide sets off (its clock runs under the glide:
// ENTRY.glideMs), takes the camera straight down onto the place: the zoom on
// the entry's own clock (`entryEase`), the place drawn on one straight line
// from the middle of the screen to the dock's point (where its cover will
// hang), the tip to the oblique view over the last of it (RouteAtlas,
// `globeEntryPose`).
// Owner, 2026-09-29 (撕开miami票根之后，飞入地球的速度可以快一点，然后地球的角度
// 是不是有点太靠左了): the tear to the cover took 4.9 s at 1728 (a 1.3 s
// glide, a 3.9 s descent on the sine at 1.15 levels/s), and the planet rose
// on the atlas's focal point — 542 px of 1728, a third of the way in — with
// Miami beside its centre, then slid up and right 420 px to its dock over
// the last second and a half. Now the glide is 1.0 s, the descent 2.4 s, on
// a clock that holds its pace (a cruise between two soft ramps: its peak is
// 1 / (1 − ramp) of the mean, not the sine's π/2), so the zoom's peak rises
// only from ~1.25 to ~1.7 levels/s; and the planet rises in the middle with
// the place at its centre.
// The reader can cut it short: a key, a press or a new turn of the wheel
// plays the rest of the descent quickly, from where it is (HomePage,
// `finishEntry`; ENTRY_FINISH below).
export const ENTRY = {
  /** The entrance's glide the entry rides under (boardingPass.ts
   *  ARRIVAL_SECONDS, in ms): the torn pass asks for the explorer as the
   *  glide SETS OFF, so the camera is already coming down while the globe
   *  rises with the page. It was 1.3 s. */
  glideMs: 1000,
  /** What is left of the descent once the glide has landed, ms (it was
   *  2.6 s; review of 2026-09-29: before that, the whole 4.4 s, after the
   *  glide). */
  afterGlideMs: 1400,
  /** The descent onto stop 01, ms: under the glide, then the rest (the
   *  clock starts with the glide). The rise planet's zoom is ~2.2 at
   *  1728 × 1000 and ~1.9 at 1280 × 800, and a place rests at 5.05: on the
   *  entry's clock a descent of Δ levels over T peaks at Δ / T / (1 − ramp),
   *  so 2.4 s keeps it under `zoomPerS` from the fitted planet at 1728 (a
   *  smaller window's planet rises a little larger: `entryStartZoom`; at
   *  1280 × 800 it rose at 2.2 before as well). */
  diveMs: 2400,
  /** The entry's clock (`entryEase`): its pace eases up over this share of
   *  the descent, cruises, and eases down over the same share at the end
   *  (raised-cosine ramps: no jolt at either end). */
  ramp: 0.25,
  /** The descent's zoom: never faster than this, levels a second, as
   *  planned (the flights' own cap is 1.15; the entry is the one move the
   *  reader asked for with the tear, and it now takes 2.4 s instead of 3.9).
   *  Traced on the built page the peak runs ~8% over the plan (1.25 for the
   *  old 1.15): ~1.7 levels/s at 1728 × 1000. */
  zoomPerS: 1.6,
  /** On a phone: the camera waits above stop 01 at PHONE_APPROACH_ZOOM (the
   *  page brings that view up) and goes down, at least this long when
   *  nothing glides first (a torn pass: its flight starts with the glide and
   *  lasts the desktop's `diveMs`). */
  phoneMinMs: 2400,
} as const;

/** The entry's clock: the share of the descent's zoom done at `t` (0 → 1) of
 *  its time. Its pace rises on a raised cosine over ENTRY.ramp, holds, and
 *  falls the same way: at its peak 1 / (1 − ramp) of the mean (the sine's
 *  is π/2 ≈ 1.57; this, at 0.25, 1.33). */
export function entryEase(t: number) {
  const x = clamp01(t);
  const a = ENTRY.ramp;
  const v = 1 / (1 - a);
  const ramp = (s: number) => v * (s / 2 - (a / (2 * Math.PI)) * Math.sin((Math.PI * s) / a));
  if (x <= a) return ramp(x);
  if (x >= 1 - a) return 1 - ramp(1 - x);
  return ramp(a) + v * (x - a);
}
/** The entry clock's pace at `t`, the zoom's share per unit of time. */
export function entryEaseRate(t: number) {
  const x = clamp01(t);
  const a = ENTRY.ramp;
  const v = 1 / (1 - a);
  const edge = Math.min(x, 1 - x);
  return edge >= a ? v : (v * (1 - Math.cos((Math.PI * edge) / a))) / 2;
}
/** The entry clock's peak over its mean. */
export const ENTRY_PEAK = 1 / (1 - ENTRY.ramp);
/** The progress at which the entry's clock has done `y` of its zoom. */
export function entryEaseInverse(y: number) {
  const target = clamp01(y);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (entryEase(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Cutting the entry short (a key, a press, a new turn of the wheel): the
 *  rest of the descent is played quickly, never jumped (review of
 *  2026-09-29: a jump from the whole planet to the place in ONE frame, then
 *  60–150 ms of flat unloaded ground). From where the camera is, at the pace
 *  its zoom was going (velocity-continuous: a cubic Hermite in the zoom
 *  from its level and rate to the rest, arriving at rest), in the shortest
 *  time from `minMs` that keeps the zoom under `zoomPerS` (twice the
 *  flights' cap: the reader asked for it), within `maxMs` (a cut in the
 *  first half of a whole-planet descent peaks near 2.8 levels/s there). */
export const ENTRY_FINISH = {
  minMs: 700,
  maxMs: 1500,
  zoomPerS: 2.3,
  /** The phone's entry cut short: a turn this long onto the place, from the
   *  live camera. */
  phoneMs: 700,
} as const;

export interface EntryFinish {
  ms: number;
  /** The entry's progress at `tau` (0 → 1) of `ms`. */
  at: (tau: number) => number;
  /** The fastest the zoom changes on the way, levels/s. */
  zoomPerS: number;
}

/** The rest of the entry from progress `p0`, its clock moving at `v0`
 *  (progress per second), for a descent of `levels` zoom levels on the
 *  entry's clock (entryEase, globeEntryPose). */
export function finishEntry(p0: number, v0: number, levels: number): EntryFinish {
  const from = clamp01(p0);
  const y0 = entryEase(from);
  // The zoom's share per second where the clock is now.
  const rate0 = Math.max(0, entryEaseRate(from) * v0);
  const plan = (T: number) => {
    const m0 = Math.max(0, Math.min(rate0 * T, 3 * (1 - y0)));
    const share = (tau: number) => {
      const t = clamp01(tau);
      const t2 = t * t;
      const t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2);
    };
    let max = 0;
    let prev = share(0);
    const steps = 60;
    for (let i = 1; i <= steps; i += 1) {
      const now = share(i / steps);
      max = Math.max(max, (Math.abs(now - prev) * levels) / (T / steps));
      prev = now;
    }
    return { share, max };
  };
  let ms: number = ENTRY_FINISH.minMs;
  while (ms < ENTRY_FINISH.maxMs && plan(ms / 1000).max > ENTRY_FINISH.zoomPerS) ms += 50;
  ms = Math.min(ms, ENTRY_FINISH.maxMs);
  const { share, max } = plan(ms / 1000);
  return { ms, at: (tau: number) => (tau >= 1 ? 1 : entryEaseInverse(share(tau))), zoomPerS: max };
}

/** The fastest the entry's descent changes the zoom, levels a second: from
 *  `startZoom` to `restZoom` on the entry's clock over `diveMs`. */
export function entryZoomRate(startZoom: number, restZoom: number, diveMs: number = ENTRY.diveMs) {
  return (ENTRY_PEAK * Math.abs(restZoom - startZoom)) / (diveMs / 1000);
}

/** Where the entry's descent starts: the whole planet fitted to the screen
 *  (`fitted`), but never so far out that the descent to `restZoom` would
 *  pass ENTRY.zoomPerS — a smaller or a tall, narrow window fits a smaller
 *  planet; it rises a little larger instead. */
export function entryStartZoom(fitted: number, restZoom: number, diveMs: number = ENTRY.diveMs) {
  return Math.max(fitted, restZoom - (ENTRY.zoomPerS * (diveMs / 1000)) / ENTRY_PEAK);
}

/** The most zoom the entry's descent spans (from `entryStartZoom`'s floor
 *  to the rest, at the cap over its clock), levels: what a finish plans
 *  for. */
export const ENTRY_SPAN = (ENTRY.zoomPerS * (ENTRY.diveMs / 1000)) / ENTRY_PEAK;

/** The phone's entry flight, ms: started under the glide (`leadMs` > 0) it
 *  runs on the desktop's clock, `diveMs` from the glide's start, or longer
 *  if its `dz` levels would pass ENTRY.zoomPerS on the house's sine; with
 *  nothing gliding first, at least ENTRY.phoneMinMs (or `planMs`, the
 *  flights' own). */
export function phoneEntryMs(dz: number, planMs: number, leadMs: number) {
  if (leadMs > 0) return Math.round(Math.max(ENTRY.diveMs, ((Math.PI / 2) * Math.abs(dz) * 1000) / ENTRY.zoomPerS));
  return Math.round(Math.max(ENTRY.phoneMinMs, planMs));
}

// ── The entry's frame: where the planet rises, and where the place goes ──
// Owner, 2026-09-29 (地球的角度是不是有点太靠左了，可以优化一下，能更舒适的找到
// 目的地): the planet used to rise on the atlas's focal point (542 px of 1728,
// the chapters' camera at rest) looking at the ground the dock needs under
// it, with Miami off its centre, and the camera went down with its centre
// held there — so the place slid 420 px right and 185 px up across the
// last second and a half, under the eye, to its dock. Now the planet rises
// in the middle of the screen with the place at its centre (the camera's
// centre ON the place, the camera's focal point — the padding's centre — in
// the middle), and on the way down the place is drawn on one straight line
// from there to the dock's point, in step with the zoom's share, while the
// camera's centre and focal point come round to the chapters' resting ones
// (the rest pose, exactly, at the end: nothing to snap). DERIVED: the
// screen points are the viewport's (the middle, the reading line) and the
// dock plan's; the camera is the dock's pinhole (projectAt), corrected by
// its own residual at rest so the last frame is the rest pose to the pixel.
export interface EntryFrameInput {
  /** The place, and the camera's centre at rest ([lng, lat]). */
  place: readonly [number, number];
  restCentre: readonly [number, number];
  startZoom: number;
  restZoom: number;
  /** Where the place stands as the planet rises (the middle of the
   *  screen), at rest (the dock's point), and the camera's focal point at
   *  rest, viewport px. */
  rise: Point;
  dock: Point;
  focal: Point;
  /** The camera now (its pitch and bearing on the descent) and at rest. */
  pitch: number;
  bearing: number;
  restPitch: number;
  restBearing: number;
  /** Mapbox's camera distance, px (1.5 canvas heights). */
  distance: number;
}

/** The camera for the entry's zoom share `y` (0 = the planet risen, 1 =
 *  the rest pose): its centre, its zoom and its focal point on the screen
 *  (the padding's centre, viewport px). */
export function entryFrame(input: EntryFrameInput, y: number) {
  const k = clamp01(y);
  const zoom = input.startZoom + (input.restZoom - input.startZoom) * k;
  if (k >= 1) return { centre: [input.restCentre[0], input.restCentre[1]] as [number, number], zoom: input.restZoom, focal: { ...input.focal }, placeAt: { ...input.dock } };
  const dLng = ((((input.restCentre[0] - input.place[0]) % 360) + 540) % 360) - 180;
  const centre: [number, number] = [input.place[0] + dLng * k, input.place[1] + (input.restCentre[1] - input.place[1]) * k];
  const at = { x: input.rise.x + (input.dock.x - input.rise.x) * k, y: input.rise.y + (input.dock.y - input.rise.y) * k };
  const origin = { x: 0, y: 0 };
  const off = projectAt(input.place, centre, zoom, { focal: origin, pitch: input.pitch, bearing: input.bearing, distance: input.distance });
  const offRest = projectAt(input.place, input.restCentre, input.restZoom, { focal: origin, pitch: input.restPitch, bearing: input.restBearing, distance: input.distance });
  // The pinhole's own error at rest (Mapbox's globe and its camera differ
  // from it by a few px there), carried in with the offset's own scale.
  const scale = k * 2 ** (zoom - input.restZoom);
  const cx = input.dock.x - input.focal.x - offRest.x;
  const cy = input.dock.y - input.focal.y - offRest.y;
  return {
    centre,
    zoom,
    focal: { x: at.x - off.x - cx * scale, y: at.y - off.y - cy * scale },
    placeAt: at,
  };
}
