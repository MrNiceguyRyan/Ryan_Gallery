// ── The boarding pass: what it prints and how it answers the hand ──
// After the opening film the homepage opens on a quiet page of opening words;
// a little way down a white boarding pass rises into view (the component is
// src/components/home/BoardingPass.tsx, its page EntranceIntro.tsx). It can
// be picked up and moved about, and its stub torn off along the perforation
// — by hand, by its Tear button, by Enter or Space, or simply by scrolling
// on — and once it is torn the globe comes in and the archive begins.
//
// Everything here is pure (no DOM), so scripts/boarding-pass.test.mjs holds
// it: what the pass prints (from the first chapter, never invented), the
// hand's physics (the tilt and sway caps, the rest area it always comes back
// into, the rubber band that keeps it on screen), the tear's resistance and
// how the rip follows the hand, and the stub's fall.

// With its extension: the tests import this module through esbuild, and the
// site through Vite; both resolve it.
import { TEAR_FREE_MS, TEAR_TENSION_MS, msAtTip } from './ticketTear.ts';
import { stateCode } from './routeShield.ts';

// ── What it prints ──────────────────────────────────────────────────────
/** The address its QR code carries. */
export const PASS_URL = 'https://ryanxugallery.com/';

export interface PassChapter {
  name?: string | null;
  region?: string | null;
  year?: number | string | null;
}

export interface PassFields {
  passenger: string;
  /** Never a real origin: the pass leaves from wherever the reader is. */
  from: string;
  /** The first chapter's place (data-driven: Miami today; Washington once
   *  the owner adds it as stop 01). */
  to: string;
  /** Its state's two letters, as the route shields print them ('' if none). */
  toCode: string;
  flight: string;
  seat: string;
  gate: string;
  boarding: string;
  /** The first chapter's year ('—' if it has none). */
  date: string;
}

export function passFields(first?: PassChapter | null): PassFields {
  const name = first?.name?.trim();
  const year = Number(first?.year);
  return {
    passenger: 'RYAN XU',
    from: 'HERE',
    to: name ? name.toUpperCase() : 'THE ARCHIVE',
    toCode: stateCode(first?.region),
    flight: 'RX 001',
    seat: '01A',
    gate: '01',
    boarding: 'NOW',
    date: Number.isFinite(year) && year > 0 ? String(year) : '—',
  };
}

/** The destination's size on the pass, as a share of the base size: a long
 *  name (WASHINGTON, BRYCE CANYON) steps down so it keeps to its field. */
export function destinationScale(to: string): number {
  const n = Math.max(1, to.length);
  return n <= 6 ? 1 : Math.max(0.52, 6 / n);
}

/** The stub's barcode: bar widths (1–3 units, bars and gaps alternating,
 *  starting with a bar), the same every time. Decorative: it encodes
 *  nothing and claims nothing. */
export function barcodeBars(seed = 1, count = 46): number[] {
  let state = (Math.abs(Math.floor(seed)) * 2654435761 + 97) >>> 0 || 97;
  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = next();
    bars.push(i % 2 === 0 ? (r < 0.45 ? 1 : r < 0.8 ? 2 : 3) : r < 0.6 ? 1 : 2);
  }
  return bars;
}

// ── The hand ─────────────────────────────────────────────────────────────
export const PASS_HAND = {
  /** The tilt toward the grab point: the point the hand holds lifts toward
   *  the reader, the far side away; at most this, in any direction. deg. */
  tiltMax: 10,
  /** The sway from the hand's sideways speed, deg at most. */
  swayMax: 12,
  /** deg per px/s of sideways speed. */
  swayPerSpeed: 0.011,
  /** The sway's own spring (a paper held at a point swings a little past
   *  and settles): stiffness 1/s², damping 1/s. */
  swayK: 150,
  swayC: 13,
  /** The lift while held (shadow, a hair of scale), in and out, per second
   *  of the approach (an exponential ease). */
  liftRate: 14,
  /** Let go: the pass glides on and slows (the velocity falls by e^−f·t). */
  friction: 4.2,
  /** …and anything outside its rest area is drawn back into it. */
  springK: 95,
  springC: 17,
  /** Past its reach the pass follows the hand less and less (a rubber band
   *  of this constant, iOS's): it can never be dragged off the screen. */
  rubber: 0.55,
  /** A thrown pass is never faster than this, px/s. */
  maxSpeed: 4200,
  /** At rest: inside the area and slower than this, px/s. */
  restSpeed: 6,
} as const;

export interface Box2 {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const clamp = (value: number, lo: number, hi: number) => (value < lo ? lo : value > hi ? hi : value);
const clamp01 = (value: number) => clamp(value, 0, 1);

/** Where the pass may come to rest and how far the hand may take it, as
 *  offsets from its home (the centre of its frame): the rest area keeps the
 *  whole pass on screen with room round it; the reach keeps at least most
 *  of it on screen. From the frame's and the pass's sizes (px), never
 *  measured per frame. */
export function passAreas(frameW: number, frameH: number, passW: number, passH: number) {
  const roomX = Math.max(0, (frameW - passW) / 2);
  const roomY = Math.max(0, (frameH - passH) / 2);
  // Small: let go, it glides and comes to rest near the middle (a pass left
  // off to one side read as dropped, not placed).
  const restX = Math.max(0, Math.min(frameW * 0.06, roomX - 16));
  const restY = Math.max(0, Math.min(frameH * 0.04, roomY - 24));
  const reachX = roomX + passW * 0.3;
  const reachY = roomY + passH * 0.25;
  return {
    rest: { x0: -restX, x1: restX, y0: -restY, y1: restY } as Box2,
    reach: { x0: -reachX, x1: reachX, y0: -reachY, y1: reachY } as Box2,
  };
}

/** The nearest point of `area` to (x, y). */
export function clampToArea(x: number, y: number, area: Box2): [number, number] {
  return [clamp(x, area.x0, area.x1), clamp(y, area.y0, area.y1)];
}

/** A rubber band past [lo, hi]: 1:1 inside, and past an edge the pass goes
 *  only (1 − 1 / (d·c / L + 1))·L of the hand's d — never more than L. */
export function rubberBand(value: number, lo: number, hi: number, dimension: number, c: number = PASS_HAND.rubber): number {
  const L = Math.max(1, dimension);
  const band = (d: number) => (1 - 1 / ((d * c) / L + 1)) * L;
  if (value < lo) return lo - band(lo - value);
  if (value > hi) return hi + band(value - hi);
  return value;
}

/** The tilt toward the grab point (nx, ny in −1…1 from the pass's centre),
 *  scaled by the lift (0…1): rotateX, rotateY in degrees, the whole tilt
 *  never more than tiltMax. The grabbed point comes toward the reader:
 *  rotateY(−) lifts the right edge, rotateX(+) lifts the bottom one. */
export function tiltFor(nx: number, ny: number, lift = 1): { rx: number; ry: number } {
  let rx = clamp(ny, -1, 1) * PASS_HAND.tiltMax * clamp01(lift);
  let ry = -clamp(nx, -1, 1) * PASS_HAND.tiltMax * clamp01(lift);
  const m = Math.hypot(rx, ry);
  if (m > PASS_HAND.tiltMax) {
    rx *= PASS_HAND.tiltMax / m;
    ry *= PASS_HAND.tiltMax / m;
  }
  return { rx: rx + 0, ry: ry + 0 };
}

/** The sway the hand's sideways speed asks for (deg), at most swayMax. Held
 *  above its middle a pass hangs from the hand and trails the move (moving
 *  right, its foot swings left: a clockwise turn); held below, it leans the
 *  other way, less. `ny` −1 (top) … 1 (bottom). */
export function swayTarget(vx: number, ny: number): number {
  const pivot = clamp(0.35 - ny, -1, 1);
  return clamp(vx * PASS_HAND.swayPerSpeed * pivot, -PASS_HAND.swayMax, PASS_HAND.swayMax);
}

export interface SwayState {
  s: number;
  v: number;
}
/** One step of the sway's spring toward `target`, the result held to
 *  ±swayMax. */
export function stepSway(state: SwayState, target: number, dt: number): SwayState {
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  let { s, v } = state;
  for (let i = 0; i < steps; i += 1) {
    const a = PASS_HAND.swayK * (target - s) - PASS_HAND.swayC * v;
    v += a * h;
    s += v * h;
  }
  if (s > PASS_HAND.swayMax) {
    s = PASS_HAND.swayMax;
    v = Math.min(0, v);
  } else if (s < -PASS_HAND.swayMax) {
    s = -PASS_HAND.swayMax;
    v = Math.max(0, v);
  }
  return { s, v };
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** A throw's speed, held to maxSpeed. */
export function throwVelocity(vx: number, vy: number): [number, number] {
  const m = Math.hypot(vx, vy);
  if (!Number.isFinite(m) || m === 0) return [0, 0];
  const k = m > PASS_HAND.maxSpeed ? PASS_HAND.maxSpeed / m : 1;
  return [vx * k, vy * k];
}

/** One step of the let-go pass: it glides on and slows (friction), and
 *  whatever is outside the rest area is sprung back into it (a damped
 *  spring toward the area's nearest point). Semi-implicit Euler in sub-steps
 *  of 1/240 s, so any frame rate lands on the same path. */
export function stepBody(body: Body, dt: number, rest: Box2): Body {
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  let { x, y, vx, vy } = body;
  const decay = Math.exp(-PASS_HAND.friction * h);
  for (let i = 0; i < steps; i += 1) {
    const [tx, ty] = clampToArea(x, y, rest);
    const outX = x !== tx;
    const outY = y !== ty;
    const ax = outX ? -PASS_HAND.springK * (x - tx) - PASS_HAND.springC * vx : 0;
    const ay = outY ? -PASS_HAND.springK * (y - ty) - PASS_HAND.springC * vy : 0;
    vx = (vx + ax * h) * decay;
    vy = (vy + ay * h) * decay;
    x += vx * h;
    y += vy * h;
  }
  return { x, y, vx, vy };
}

/** At rest: inside the rest area (to half a pixel) and all but still. */
export function bodyAtRest(body: Body, rest: Box2): boolean {
  const [tx, ty] = clampToArea(body.x, body.y, rest);
  return Math.hypot(body.x - tx, body.y - ty) < 0.5 && Math.hypot(body.vx, body.vy) < PASS_HAND.restSpeed;
}

/** Approach `target` from `value` at `rate` per second (an exponential
 *  ease, frame-rate independent). */
export function approach(value: number, target: number, rate: number, dt: number): number {
  return target + (value - target) * Math.exp(-rate * dt);
}

// ── The tear ─────────────────────────────────────────────────────────────
// Grab the stub and pull it away from the pass, across the perforation. The
// paper resists first: over the first TEAR_RESIST_PX of the hand's travel it
// only takes the strain (the score's tension, src/lib/ticketTear.ts); past
// that the rip runs down the perforation following the hand, one to one —
// the rip's tip is the hand's share of `span` — and when it reaches the
// bottom notch the stub is free, in the hand. Let go before that: past most
// of the rip (or with a flick) it tears on; otherwise the paper springs back.
export const TEAR_RESIST_PX = 40;
/** Released with the rip this far down, the tear completes. */
export const TEAR_COMMIT_TIP = 0.82;
/** A flick (px/ms along the pull) completes it once the rip is this far. */
export const TEAR_FLICK_TIP = 0.22;
export const TEAR_FLICK_SPEED = 0.7;
/** How far the pass itself gives toward the pull while it resists, px at
 *  most: the paper takes the strain, the hand feels it. */
export const TEAR_GIVE_PX = 6;

/** The hand's travel for the whole rip, from the seam's length (px): a
 *  longer perforation takes a longer pull, within a hand's reach. */
export function tearSpan(seam: number, touch = false): number {
  return touch ? clamp(seam * 0.55, 110, 170) : clamp(seam * 0.62, 130, 230);
}

/** The tear's clock (ms of the score, ticketTear's) for `travel` px of the
 *  hand along the pull: the strain up to TEAR_RESIST_PX, then the rip. */
export function tearClock(travel: number, span: number): number {
  if (!(travel > 0)) return 0;
  if (travel < TEAR_RESIST_PX) return TEAR_TENSION_MS * (travel / TEAR_RESIST_PX);
  return Math.min(TEAR_FREE_MS, msAtTip((travel - TEAR_RESIST_PX) / Math.max(1, span)));
}

/** The rip's share of the seam for `travel` (0 while it resists). */
export function tearTip(travel: number, span: number): number {
  return clamp01((travel - TEAR_RESIST_PX) / Math.max(1, span));
}

/** How far the pass gives toward the pull (px): it follows the hand a
 *  little while the paper resists, and settles back as the rip runs. */
export function tearGive(travel: number, span: number): number {
  if (!(travel > 0)) return 0;
  const strain = clamp01(travel / TEAR_RESIST_PX);
  return TEAR_GIVE_PX * strain * strain * (1 - tearTip(travel, span));
}

/** Let go at `travel` with `speed` (px/ms along the pull): does it tear on? */
export function tearCommits(travel: number, span: number, speed: number): boolean {
  const tip = tearTip(travel, span);
  return tip >= TEAR_COMMIT_TIP || (tip >= TEAR_FLICK_TIP && speed >= TEAR_FLICK_SPEED);
}

// ── The stub's fall ──────────────────────────────────────────────────────
// Once free the stub is in the hand (it follows it one to one and sways);
// let go, it falls: gravity, a little air, its spin slowing. A scripted tear
// (the button, a key, the scroll) hands it a small lift first, then lets it
// fall the same way. It goes once it is below the screen.
export const STUB_FALL = {
  gravity: 3000,
  air: 0.7,
  spinDecay: 1.2,
  /** The scripted tear's toss: px/s along the pull, px/s up, deg/s — a
   *  small lift off the pass, then the fall. */
  toss: [150, -240, 30] as const,
  /** The longest a fall is kept, ms. */
  maxMs: 2200,
} as const;

export interface FallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
}

export function stepFall(state: FallState, dt: number): FallState {
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  let { x, y, vx, vy, a, va } = state;
  const air = Math.exp(-STUB_FALL.air * h);
  const spin = Math.exp(-STUB_FALL.spinDecay * h);
  for (let i = 0; i < steps; i += 1) {
    vy += STUB_FALL.gravity * h;
    vx *= air;
    vy *= air;
    va *= spin;
    x += vx * h;
    y += vy * h;
    a += va * h;
  }
  return { x, y, vx, vy, a, va };
}

// ── The page round it ────────────────────────────────────────────────────
// EntranceIntro's scroll score, in viewport heights: the intro is one
// screen; the pass's frame pins for PASS_PIN of a screen below it; scrolled
// PASS_TEAR_AT of the way through the pin the pass tears for the reader
// (nobody is ever stuck behind it); it rises into view over PASS_RISE.
export const PASS_PIN = 0.6;
export const PASS_TEAR_AT = 0.72;
export const PASS_RISE: readonly [number, number] = [0.28, 1];

/** How far the pass has risen into place (0 → 1) at scroll `y` (px) with the
 *  frame pinned at `pinTop` (px) in a viewport `vh` tall: over PASS_RISE of
 *  the screen before the pin. */
export function passRise(y: number, pinTop: number, vh: number): number {
  const from = pinTop - vh * (1 - PASS_RISE[0]);
  return clamp01((y - from) / Math.max(1, pinTop - from));
}

/** The strain the scroll puts on the stub inside the pin (0 → 1 at the
 *  tear point). */
export function scrollStrain(y: number, pinTop: number, vh: number): number {
  return clamp01((y - pinTop) / Math.max(1, vh * PASS_PIN * PASS_TEAR_AT));
}

/** The glide after the tear (the globe comes in): its length from the
 *  distance, s. */
export function arrivalSeconds(distance: number): number {
  return clamp(1.1 + Math.abs(distance) / 2600, 1.2, 1.6);
}
/** Its curve: slow to leave, long and soft to land. */
export const ARRIVAL_EASE = [0.45, 0, 0.18, 1] as const;
