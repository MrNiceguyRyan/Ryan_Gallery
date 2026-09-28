// ── The tear: how a ticket's face comes off, frame by frame ──
// Every desktop cover is a ticket (ArchiveChapter, "The tear"), and the globe
// egg's ADMIT ONE is the same object (GlobeEggs). Both tear on this one score,
// kept pure (plain 2×3 affine arrays, no DOM) so scripts/ticket-latch.test.mjs
// can hold it to its promises.
//
// Held like a ticket in two hands. The right hand keeps the stub; the reader's
// push is the left hand. It takes the strain first (the face dips a hair, the
// stub gives a little where the right hand grips it). Then the paper gives at
// the top notch and the rip runs DOWN the perforation, but not evenly: each
// hole gives at once and the rip catches on the next bridge of paper (stick-
// slip), while the hand keeps pulling, so the face HINGES open about the
// running tip of the rip. Its top-left corner drops first, the map opens in a
// V between face and stub, and torn fibres show on both edges. The last
// bridge snaps, the stub recoils in the right hand, and the left hand lays
// the face aside, up and to the left, straightening it as it goes. Nothing
// falls: after the snap no point of the face moves down the screen, and the
// only ease-in is the fade of something that is already slowing.
//
// Times are ms from the trigger at rate 1. A reader who moves on harder pulls
// harder: ArchiveChapter runs the clock up to TEAR_RATE_MAX× faster until the
// face is free (`tearRate`), never after.

// With its extension: the tests import this module straight into Node, which
// does not resolve Vite's bare sibling paths.
import { EASE } from './motion.ts';

export const TEAR_TENSION_MS = 70;
export const TEAR_RIP_MS = 460;
/** The last bridge goes: the face is free. */
export const TEAR_FREE_MS = TEAR_TENSION_MS + TEAR_RIP_MS;
export const TEAR_SNAP_MS = 90;
export const TEAR_ASIDE_MS = 460;
/** The whole score, strain to gone. */
export const TEAR_MS = TEAR_FREE_MS + TEAR_SNAP_MS + TEAR_ASIDE_MS;
/** A beat for the free face to register before anything else moves. */
export const TEAR_BEAT_MS = 60;
/** When the page may go on after the trigger at rate 1: the face free plus
 *  the beat. RouteAtlas (TEAR_BEFORE_FLIGHT_MS) and ArchiveClosing
 *  (TEAR_BEFORE_ENDING_MS) mirror it, because they live in lazy chunks. */
export const TEAR_BEFORE_FLIGHT_MS = TEAR_FREE_MS + TEAR_BEAT_MS;
/** Reduced motion keeps the event and drops the travel: the face fades in
 *  place over this long, the stub dims, the pad goes. */
export const TEAR_REDUCED_MS = 300;

// deg. The hinge follows the HAND (the smooth tip), not the tip itself, so the
// V keeps opening through every catch and no two poses repeat.
const HINGE_DEG = 8;
const HINGE_EXP = 0.8;
// px. The left hand's strain on the face, and the right hand's give on the
// stub (deg about its right-middle, where it is gripped) and lift.
const DIP_PX = 1.5;
const STUB_GIVE_DEG = -0.7;
const STUB_LIFT_PX = 0.9;
// The snap: the pull no longer resisted.
const KICK_DEG = 2.4;
const KICK_X = -7;
const KICK_Y = 4;
// The stub's recoil once the load is gone: damped, it overshoots its seat
// and settles by ~500ms.
const RECOIL_TAU_MS = 150;
const RECOIL_PERIOD_MS = 170;
// Laid aside: carried a share of the viewport to the left, lifted, eased
// down from 10.4° to its rest angle, a touch smaller as it lifts off the map.
// It stays whole until FADE_FROM of the way. It straightens about the middle
// of its torn edge, where it last held: turning back from the hinge swings
// the far (left) side UP, so no corner of it sinks. Straightened about the
// left hand's grip (0.22 of the width) the right-hand corners dropped 60–70px
// while the face was still whole — the fall the owner rejected
// (不要像掉下去).
const ASIDE_VW = 0.11;
const ASIDE_Y = -28;
const ASIDE_REST_DEG = 1.5;
const ASIDE_SCALE = 0.975;
const ASIDE_GRIP: readonly [number, number] = [1, 0.5];
const FADE_FROM = 0.4;

/** Stick-slip: [share of the rip's time, share of the seam torn]. */
export const STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.08, 0.08],
  [0.24, 0.22],
  [0.42, 0.38],
  [0.6, 0.56],
  [0.78, 0.76],
  [1, 1],
];
/** Each hole gives over this share of its interval; the rest is the catch. */
export const ADV = 0.62;

// The scroll's rate: 1 at a reading pace, up to TEAR_RATE_MAX for a swipe.
const TEAR_RATE_V0 = 300;
const TEAR_RATE_SPAN = 700;
export const TEAR_RATE_MAX = 2.2;

/** A 2D affine as CSS writes it: matrix(a, b, c, d, e, f). */
export type Affine = [number, number, number, number, number, number];

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
const easeOutQuad = (x: number) => 1 - (1 - x) * (1 - x);
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

/** A house curve (src/lib/motion.ts) at `x`, solved like CSS solves it. */
function curveAt(curve: readonly [number, number, number, number], x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = curve;
  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const cx = 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3 - x;
    const dx = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
    if (Math.abs(cx) < 1e-6 || dx === 0) break;
    t = clampUnit(t - cx / dx);
  }
  return 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
}
/** The house leave curve (EASE.leave): the aside's fade, and nothing else in
 *  the score. */
const leave = (x: number) => curveAt(EASE.leave, x);
/** The ink fade (EASE.fade): reduced motion's tear, which fades in place. */
const fade = (x: number) => curveAt(EASE.fade, x);

// ── Affines (CSS order: M·N applies N first) ──
const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];
function multiply(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
const translate = (x: number, y: number): Affine => [1, 0, 0, 1, x, y];
/** Clockwise on screen for positive degrees, as CSS rotate(). */
function rotate(degrees: number): Affine {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, 0, 0];
}
const scale = (s: number): Affine => [s, 0, 0, s, 0, 0];
const chain = (...steps: Affine[]) => steps.reduce(multiply, IDENTITY);
/** Where `m` puts the point (x, y) of the box it transforms. */
export function applyAffine(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
/**
 * The score for a ticket held the other way round: the face kept in the left
 * hand and the STUB pulled off by the right (/about's correspondence ticket,
 * AboutPage ContactTicket). The face's pose `m` for a box `w` wide, turned
 * about the box's vertical axis, is the stub's pose (transform-origin 0 0):
 * its seam is its LEFT edge, it hinges about the rip's tip there, its
 * top-RIGHT corner drops first, and it is laid aside up and to the RIGHT.
 * Everything else about the tear — the catches, the snap, the fade — is the
 * same score.
 */
export function mirrorAffine(m: Affine, w: number): Affine {
  const flip: Affine = [-1, 0, 0, 1, w, 0];
  return chain(flip, m, flip);
}
/** The CSS for an affine. */
export function affineCss(m: Affine) {
  return `matrix(${m[0].toFixed(5)}, ${m[1].toFixed(5)}, ${m[2].toFixed(5)}, ${m[3].toFixed(5)}, ${m[4].toFixed(2)}, ${m[5].toFixed(2)})`;
}

// ── The rip's tip ──
function segment(u: number) {
  let k = 0;
  while (k < STOPS.length - 2 && u >= STOPS[k + 1][0]) k += 1;
  const [u0, t0] = STOPS[k];
  const [u1, t1] = STOPS[k + 1];
  return { k, f: clampUnit((u - u0) / (u1 - u0)), t0, t1 };
}
/** The hand's tip at `u` (0–1 of the rip): piecewise linear through STOPS.
 *  The hinge follows it; a hand pulling the face drives it directly. */
export function tipSmooth(u: number) {
  const { f, t0, t1 } = segment(clampUnit(u));
  return t0 + (t1 - t0) * f;
}
/** The paper's tip at `u`: each hole gives at once (ease-out over ADV of its
 *  interval) and the rip catches on the next bridge for the rest; the last
 *  interval runs into the bottom notch. */
export function tipStepped(u: number) {
  const { k, f, t0, t1 } = segment(clampUnit(u));
  const last = k === STOPS.length - 2;
  const g = last ? f * f * (1.6 - 0.6 * f) : f < ADV ? easeOutQuad(f / ADV) : 1;
  return t0 + (t1 - t0) * g;
}
/** The score's time (ms) at which the hand's tip has run `tip` of the seam:
 *  the inverse of `tipSmooth`. */
export function msAtTip(tip: number) {
  const target = clampUnit(tip);
  for (let k = 0; k < STOPS.length - 1; k += 1) {
    const [u0, t0] = STOPS[k];
    const [u1, t1] = STOPS[k + 1];
    if (target <= t1) return TEAR_TENSION_MS + TEAR_RIP_MS * (u0 + (u1 - u0) * ((target - t0) / Math.max(1e-6, t1 - t0)));
  }
  return TEAR_FREE_MS;
}
/** The hand's tip `ms` into the score. */
export const handTipAt = (ms: number) => tipSmooth((ms - TEAR_TENSION_MS) / TEAR_RIP_MS);

/** The clock's rate for a tear the reader's push sets off at `speed` px/s. */
export function tearRate(speed: number) {
  return Math.max(1, Math.min(TEAR_RATE_MAX, 1 + (speed - TEAR_RATE_V0) / TEAR_RATE_SPAN));
}

/**
 * The stamp a tear leaves on its section (`data-ticket-torn-at`) when its
 * clock is `fromMs` into the score at `now` and runs at `rate` until the face
 * is free: the moment a rate-1 score would have started to free the face when
 * it actually will. TEAR_BEFORE_FLIGHT_MS after it is then a beat after the
 * face is free, at any rate.
 */
export function tearStampAt(now: number, fromMs: number, rate: number) {
  const freeAt = fromMs >= TEAR_FREE_MS ? now : now + (TEAR_FREE_MS - fromMs) / Math.max(1, rate);
  return freeAt - TEAR_FREE_MS;
}

export interface TearFrame {
  /** The face box (px) and the viewport width (px), measured per layout. */
  w: number;
  h: number;
  vw: number;
}

export interface TearPose {
  /** The face's affine, transform-origin 0 0. */
  m: Affine;
  /** Share of the seam torn (the fibres and the edge cut run to it). */
  tip: number;
  /** The strain, 0–1 (force builds as t²). */
  tension: number;
  /** The strain still on the seam below the tip. */
  strain: number;
  /** How far the face is off the map (its shadow). */
  lift: number;
  /** The face's opacity. */
  op: number;
  /** The stub, about its right-middle: rotation (deg) and lift (px). */
  stubDeg: number;
  stubY: number;
  stubOp: number;
  /** The pad under the ticket. */
  padOp: number;
  /** The face is still joined below the tip: clip it at the seam. */
  seam: boolean;
}

const REST: TearPose = {
  m: IDENTITY,
  tip: 0,
  tension: 0,
  strain: 0,
  lift: 0,
  op: 1,
  stubDeg: 0,
  stubY: 0,
  stubOp: 1,
  padOp: 1,
  seam: false,
};

/**
 * The pose `ms` into the score. `smooth`: the hand's tip, no catches (a pull,
 * a re-seat). `reduced`: values, not structure — the face fades in place over
 * TEAR_REDUCED_MS, the stub dims, the pad goes; no hinge, fibre or aside.
 */
export function tearPose(
  ms: number,
  frame: TearFrame,
  { smooth = false, reduced = false }: { smooth?: boolean; reduced?: boolean } = {},
): TearPose {
  if (!(ms > 0)) return { ...REST };
  if (reduced) {
    // A fade-out eases in, like every other going in the house.
    const k = fade(clampUnit(ms / TEAR_MS));
    return { ...REST, op: 1 - k, stubOp: 1 - 0.45 * k, padOp: 1 - k };
  }
  const { w, h, vw } = frame;
  const tE = clampUnit(ms / TEAR_TENSION_MS) ** 2;
  const u = clampUnit((ms - TEAR_TENSION_MS) / TEAR_RIP_MS);
  const hand = tipSmooth(u);
  const dip = DIP_PX * tE;
  if (ms < TEAR_FREE_MS) {
    // The rip: the face hinges about the running tip at (w, tip·h).
    const tip = smooth ? hand : tipStepped(u);
    const theta = HINGE_DEG * Math.pow(hand, HINGE_EXP);
    return {
      m: chain(translate(w, dip + tip * h), rotate(-theta), translate(-w, -tip * h)),
      tip,
      tension: tE,
      strain: tE * (1 - tip),
      lift: 0.25 * tE + 0.55 * hand,
      op: 1,
      stubDeg: STUB_GIVE_DEG * (0.45 * tE + 0.55 * hand),
      stubY: -STUB_LIFT_PX * tE,
      stubOp: 1,
      padOp: 1,
      seam: true,
    };
  }
  // Free: the pivot is the bottom-right corner. The snap and the laid-aside
  // are one decelerating move from the snap's speed.
  const r = Math.min(ms, TEAR_MS) - TEAR_FREE_MS;
  const rel = easeOutCubic(clampUnit(r / TEAR_SNAP_MS));
  const post = clampUnit(r / (TEAR_SNAP_MS + TEAR_ASIDE_MS));
  const released = chain(translate(w, DIP_PX + h), rotate(-(HINGE_DEG + KICK_DEG * rel)), translate(-w, -h));
  const osc = Math.exp(-r / RECOIL_TAU_MS) * Math.cos((2 * Math.PI * r) / RECOIL_PERIOD_MS);
  const e = 0.75 * easeOutQuad(post) + 0.25 * post;
  // The straightening waits out the snap's kick, then decelerates on the
  // carry's own curve: the one move slows as a whole.
  const sm = clampUnit((post - 0.12) / 0.88);
  const straighten = 0.75 * easeOutQuad(sm) + 0.25 * sm;
  const [gx, gy] = applyAffine(released, ASIDE_GRIP[0] * w, ASIDE_GRIP[1] * h);
  const s = 1 - (1 - ASIDE_SCALE) * e;
  return {
    m: chain(
      translate(KICK_X * rel - ASIDE_VW * vw * e + gx, KICK_Y * rel + ASIDE_Y * e + gy),
      rotate((HINGE_DEG + KICK_DEG - ASIDE_REST_DEG) * straighten),
      scale(s),
      translate(-gx, -gy),
      released,
    ),
    tip: 1,
    tension: 1,
    strain: 0,
    lift: Math.max(0.2, (0.55 + 0.45 * rel) * (1 - 0.8 * e)),
    op: post < FADE_FROM ? 1 : 1 - leave((post - FADE_FROM) / (1 - FADE_FROM)),
    stubDeg: STUB_GIVE_DEG * osc,
    stubY: -STUB_LIFT_PX * osc,
    stubOp: 1 - 0.45 * easeOutCubic(post),
    padOp: 1 - easeOutCubic(clampUnit(post * 1.6)),
    seam: false,
  };
}

// ── The torn edge ──
// One jagged profile per ticket, the same every time it tears: an 8px-wide
// random walk down the seam, 0.4–3.6px deep, with a fibre pulled out deeper
// now and then. The face keeps the cut and a bone fringe of fibres; the stub
// keeps roughly the complement (what the face lost, the stub kept). Drawn at
// 1:1 and revealed down the seam as the rip runs (`slice`, aligned to the
// top), never squashed.
const EDGE_W = 8;
function seeded(seed: number) {
  let state = (Math.abs(Math.floor(seed)) * 7919 + 13) % 2147483647 || 13;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
const svgUrl = (height: number, path: string, fill: string, align: 'xMaxYMin' | 'xMinYMin') =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${EDGE_W}' height='${height}' viewBox='0 0 ${EDGE_W} ${height}' preserveAspectRatio='${align} slice'><path d='${path}' fill='${fill}'/></svg>`,
  )}")`;

export interface TornEdge {
  /** Mask layer: what the face loses at its right edge. */
  faceCut: string;
  /** Mask layer: what the stub loses at its left edge. */
  stubCut: string;
  /** Background: the torn fibres on the face's edge. */
  faceFringe: string;
  /** Background: the torn fibres on the stub's edge. */
  stubFringe: string;
}

/** The fibres' ink: bone on the card stocks (a torn card shows its lighter
 *  core). A white paper passes its own. */
export const FIBRE_INK = { face: 'rgba(238,232,216,0.94)', stub: 'rgba(240,234,220,0.62)' } as const;

/** The torn edge of a seam `h` px long, as four data-URI SVGs. */
export function tornEdge(h: number, seed: number, ink: { face: string; stub: string } = FIBRE_INK): TornEdge {
  const { height, faceCut, stubCut, faceFringe, stubFringe } = tornEdgePaths(h, seed);
  return {
    faceCut: svgUrl(height, faceCut, '#000', 'xMaxYMin'),
    stubCut: svgUrl(height, stubCut, '#000', 'xMinYMin'),
    faceFringe: svgUrl(height, faceFringe, ink.face, 'xMaxYMin'),
    stubFringe: svgUrl(height, stubFringe, ink.stub, 'xMinYMin'),
  };
}

/**
 * The same torn edge for a seam that runs ACROSS (a pass held upright, its
 * stub below its face: the boarding pass on a phone): each strip turned
 * about the diagonal, `w` px long and EDGE_W tall, the face's cut along its
 * bottom edge and the stub's along its top, revealed from the left as the
 * rip runs. The same profile, the same seed.
 */
export function tornEdgeAcross(w: number, seed: number, ink: { face: string; stub: string } = FIBRE_INK): TornEdge {
  const { height, faceCut, stubCut, faceFringe, stubFringe } = tornEdgePaths(w, seed);
  const across = (path: string, fill: string, align: 'xMinYMax' | 'xMinYMin') =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${height}' height='${EDGE_W}' viewBox='0 0 ${height} ${EDGE_W}' preserveAspectRatio='${align} slice'><path transform='matrix(0 1 1 0 0 0)' d='${path}' fill='${fill}'/></svg>`,
    )}")`;
  return {
    faceCut: across(faceCut, '#000', 'xMinYMax'),
    stubCut: across(stubCut, '#000', 'xMinYMin'),
    faceFringe: across(faceFringe, ink.face, 'xMinYMax'),
    stubFringe: across(stubFringe, ink.stub, 'xMinYMin'),
  };
}

/** The torn edge's four outlines (SVG paths in an EDGE_W-wide strip `height`
 *  tall, the seam down its length): what `tornEdge` and `tornEdgeAcross`
 *  draw. The face keeps the cut at its right, the stub at its left. */
export function tornEdgePaths(h: number, seed: number) {
  const random = seeded(seed);
  const points: Array<[number, number, number, number]> = [];
  let depth = 1.6;
  for (let y = 0; y <= h + 2; y += 1.2 + random() * 1.6) {
    depth += (random() - 0.5) * 1.3;
    if (random() < 0.07) depth += 1.4 + random();
    depth = Math.max(0.4, Math.min(3.6, depth));
    points.push([y, depth, 0.5 + random() * 1.3, 0.6 + random() * 1.4]);
  }
  const f = (n: number) => n.toFixed(2);
  const height = Math.ceil(h + 2);
  const faceEdge = points.map(([y, d]) => `L${f(EDGE_W - d)} ${f(y)}`).join(' ');
  const faceCut = `M${EDGE_W} 0 ${faceEdge} L${EDGE_W} ${f(h + 2)} Z`;
  const faceFringe = `M${f(EDGE_W - points[0][1])} 0 ${faceEdge} ${points
    .slice()
    .reverse()
    .map(([y, d, fibre]) => `L${f(EDGE_W - d - fibre)} ${f(y)}`)
    .join(' ')} Z`;
  const stubPoints = points.map(([y, d, fibre, fibre2]) => [
    y,
    Math.max(0.4, Math.min(3.6, 3.9 - d + (fibre - 1.1) * 0.6)),
    fibre2,
  ] as const);
  const stubEdge = stubPoints.map(([y, d]) => `L${f(d)} ${f(y)}`).join(' ');
  const stubCut = `M0 0 ${stubEdge} L0 ${f(h + 2)} Z`;
  const stubFringe = `M${f(stubPoints[0][1])} 0 ${stubEdge} ${stubPoints
    .slice()
    .reverse()
    .map(([y, d, fibre]) => `L${f(d + fibre)} ${f(y)}`)
    .join(' ')} Z`;
  return { height, faceCut, stubCut, faceFringe, stubFringe };
}
