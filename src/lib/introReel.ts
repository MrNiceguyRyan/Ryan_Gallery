// ── The opening reel: its clock and its geometry ──
// The homepage opens on a short film drawn on one canvas, driven by the
// scroll — each ball's hold scrubbed, each turn into the next played by the
// film's own clock once the scroll commits it (see "The film clock")
// (src/components/home/IntroReel.tsx paints it with src/lib/introReelPaint.ts):
// a Picasso-like cover — a black hole in a harlequin wallpaper that its
// gravity bends into a sphere of curves — then a run of spheres (basketball,
// football, cookie, traffic light, mirror ball, moon), each turning into the
// next, and at the end a film camera's viewfinder: the moon glides to where
// the Earth sits on the first screen, the split-image focuses on its limb, and
// the shutter fires — closes and opens — on the real globe. The archive begins.
//
// Everything here is pure (no DOM, no canvas), so scripts/intro-reel.test.mjs
// can hold the score and the geometry to account offline.

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
/** Row-major 3×3. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 → 1 across [a, b], linear, clamped. */
export const segment = (value: number, a: number, b: number) => clamp01((value - a) / (b - a));
export const smoothstep = (a: number, b: number, value: number) => {
  const t = segment(value, a, b);
  return t * t * (3 - 2 * t);
};
/** The site's scroll curve (src/lib/archiveEntrance.ts uses the same). */
export const smootherstep = (t: number) => {
  const v = clamp01(t);
  return v * v * v * (v * (v * 6 - 15) + 10);
};
export const easeInOutCubic = (t: number) => {
  const v = clamp01(t);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeInCubic = (t: number) => clamp01(t) ** 3;
export const easeInQuad = (t: number) => clamp01(t) ** 2;
/** 0 at the ends, 1 in the middle: the shape of a transition's disorder. */
export const bump = (t: number) => Math.sin(Math.PI * clamp01(t));

// ── Colour: every blend in OKLab ───────────────────────────────────────────
// Two print colours are mixed in OKLab (perceptually even: a turn from paper
// to night passes through the dusk between, not through sRGB's muddy grey).
// A blend is quantised to 1/64 (a step is far under a just-noticeable
// difference, and the painter can group equal colours into one fill).

export type Lab = readonly [number, number, number];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);
export function hexToOklab(hex: string): Lab {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = toLinear(((n >> 16) & 255) / 255), g = toLinear(((n >> 8) & 255) / 255), b = toLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function oklabToHex([L, A, B]: Lab) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  let out = '#';
  for (const c of rgb) out += Math.round(clamp01(toGamma(c)) * 255).toString(16).padStart(2, '0');
  return out;
}
export const MIX_STEPS = 64;
const labCache = new Map<string, Lab>();
const mixCache = new Map<string, string>();
const labOf = (hex: string) => {
  let lab = labCache.get(hex);
  if (!lab) {
    lab = hexToOklab(hex);
    labCache.set(hex, lab);
  }
  return lab;
};
/** `a` → `b` at t (0–1) through OKLab, quantised to 1/MIX_STEPS. The ends
 *  are the colours themselves, exactly (so a hold and the turn that leaves
 *  it paint the same picture). */
export function mixOklab(a: string, b: string, t: number) {
  if (a === b) return a;
  const q = Math.round(clamp01(t) * MIX_STEPS);
  if (q <= 0) return a;
  if (q >= MIX_STEPS) return b;
  const key = `${a}${b}${q}`;
  let hit = mixCache.get(key);
  if (!hit) {
    const x = labOf(a), y = labOf(b), k = q / MIX_STEPS;
    hit = oklabToHex([lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)]);
    mixCache.set(key, hit);
  }
  return hit;
}

// ── What the reel tells the page ──────────────────────────────────────────
// IntroReel is its own island, above HomePage's. It announces whether it
// covers the first screen ('reel') or the page is on show ('page'), and
// whether its viewfinder has come up (the shot is framed: the shutter is a
// few hundred pixels of scroll away), on `window` (keeping the last word on
// window.__archiveReel for anyone who starts listening late), and the state
// on <html data-reel>.

export const REEL_EVENT = 'archive:reel';
export type ReelState = 'reel' | 'page';
export interface ReelDetail {
  state: ReelState;
  /** The globe behind may start to appear (HomePage releases its reveal). */
  framed: boolean;
  /** The shutter's latch: set going down past `fire`, cleared going back up
   *  past `rearm`. Its rising edge is HomePage's cue for the detent. */
  fired: boolean;
  /** The blades are moving, or waiting to (the latch has fired and the
   *  film is finishing its glide and focus): a click is in progress. */
  blades: boolean;
}
declare global {
  interface Window {
    __archiveReel?: ReelDetail;
    /** RouteAtlas: are the first screen's globe tiles in? (The shutter holds
     *  shut for them, briefly, before it opens on the globe.) */
    __archiveGlobeReady?: () => boolean;
  }
}

// ── The score ──────────────────────────────────────────────────────────────
// Two clocks. The SCROLL (p, 0 → 1 over the pin) says where the reader is,
// and scrubs each ball's own life (the bounce, the bites, the lamps, the
// wallpaper's flow, the viewfinder's focus). The FILM (d, on the same 0 → 1
// scale) says which ball is on the stage and how far a turn has gone: a turn
// from one ball into the next is not scrubbed — scrolling into its short
// window commits it, and the film plays it by itself, over TURN seconds, on
// one ease-in-out curve (the way the atlas flies between chapters). A reader
// who keeps scrolling is chased; one who goes back has the turn played
// backwards; one who stops mid-turn still sees it land. The shutter, the
// detent and the page underneath answer the scroll.

export type SphereKind = 'hole' | 'basket' | 'football' | 'cookie' | 'light' | 'disco' | 'moon';

export interface ReelScore {
  /** How far the page scrolls while the reel is pinned, in viewport heights. */
  screens: number;
  /** Each sphere has fully arrived at `at` (film position). The turn into it
   *  is the `turn`-wide window just before; between two windows the sphere
   *  holds, its life scrubbed by the scroll. The last sphere holds to the
   *  glide. */
  beats: readonly { kind: SphereKind; at: number }[];
  turn: number;
  /** How long a turn plays, seconds (the phone's light → moon, which passes
   *  through the mirror ball, takes `longTurn` times as long). */
  turnSeconds: number;
  longTurn: number;
  /** The last sphere (the moon) glides to the Earth's place: a turn of its
   *  own, over this window and `glideSeconds`… */
  glide: readonly [number, number];
  glideSeconds: number;
  /** …while the viewfinder's mask and focusing screen come in over this
   *  stretch of it; the split image then comes together over `focus`,
   *  scrubbed by the scroll — but never in under FOCUS_BEAT_S once the
   *  moon has glided in (a reader already past it sees it focus). */
  finder: readonly [number, number];
  focus: readonly [number, number];
  /** The shutter fires when the SCROLL passes `fire` going down and fires
   *  back when it drops under `rearm` going up (the gap keeps a reader
   *  resting on the line from firing it on every frame of Lenis' settle). */
  fire: number;
  rearm: number;
}

// Desktop: every ball's slot is 0.13 of the pin (468 px of scroll on a
// 1000 px screen), its hold 0.4 of a screen; the tail from the moon in the
// finder to the shutter is 385 px (it was 720: over a second of a nearly
// still moon at a gentle pace).
export const REEL_DESKTOP: ReelScore = {
  screens: 3.6,
  beats: [
    { kind: 'hole', at: 0 },
    { kind: 'basket', at: 0.08 },
    { kind: 'football', at: 0.21 },
    { kind: 'cookie', at: 0.34 },
    { kind: 'light', at: 0.47 },
    { kind: 'disco', at: 0.6 },
    { kind: 'moon', at: 0.73 },
  ],
  turn: 0.02,
  turnSeconds: 0.5,
  longTurn: 1.5,
  glide: [0.83, 0.855],
  glideSeconds: 0.6,
  finder: [0.84, 0.855],
  focus: [0.865, 0.935],
  fire: 0.962,
  rearm: 0.942,
};

/** Phones and small tablets: the same film on a shorter pin, one sphere
 *  fewer (the mirror ball is only passed through, between the traffic light
 *  and the moon). */
export const REEL_PHONE: ReelScore = {
  screens: 2.4,
  beats: [
    { kind: 'hole', at: 0 },
    { kind: 'basket', at: 0.09 },
    { kind: 'football', at: 0.23 },
    { kind: 'cookie', at: 0.37 },
    { kind: 'light', at: 0.51 },
    { kind: 'moon', at: 0.665 },
  ],
  turn: 0.025,
  turnSeconds: 0.5,
  longTurn: 1.5,
  glide: [0.775, 0.805],
  glideSeconds: 0.6,
  finder: [0.787, 0.805],
  focus: [0.83, 0.93],
  fire: 0.975,
  rearm: 0.955,
};

/** Reel progress from the scroll: the reel is the first thing on the page, so
 *  it is pinned from scrollY 0 over `pinned` pixels (its wrapper's height less
 *  one viewport, read at resize, never per frame). */
export function reelProgressAt(scrollY: number, pinned: number) {
  if (!(pinned > 0)) return scrollY > 0 ? 1 : 0;
  return clamp01(scrollY / pinned);
}

export interface BeatState {
  /** Index of the sphere on screen (the outgoing one during a turn). */
  index: number;
  /** 0 = only `index`; 1 = only `index + 1`. Linear in the film position:
   *  the film clock (filmAt) already eases each turn in and out. */
  mix: number;
  /** Progress through the current beat's whole span, 0–1. */
  local: number;
}

/** Where the film is: which sphere, and how far it has turned into the next. */
export function beatAt(score: ReelScore, d: number): BeatState {
  const beats = score.beats;
  const last = beats.length - 1;
  if (d >= beats[last].at) {
    return { index: last, mix: 0, local: segment(d, beats[last].at, score.glide[1]) };
  }
  let index = 0;
  while (index < last && d >= beats[index + 1].at) index += 1;
  const start = beats[index].at;
  const end = beats[index + 1].at;
  return { index, mix: segment(d, end - score.turn, end), local: segment(d, start, end) };
}

// ── The film clock ────────────────────────────────────────────────────────
// The film position is carried on a clock, τ (seconds of film): a hold runs
// one second of τ per unit of position (so the chase crosses it quickly), a
// turn's window runs its whole duration. The film shows d = filmAt(τ); inside
// a window the position is eased (a cubic, flat at both ends), so every turn
// sets off from rest and lands at rest however fast the clock runs through
// it — the ball's morph and the world round it on the one curve.

export interface ReelWindow {
  from: number;
  to: number;
  /** Seconds the turn plays for. */
  seconds: number;
  /** The beat turning out (the last beat's index for the glide). */
  index: number;
}
const HOLD_RATE = 1;
const windowCache = new WeakMap<ReelScore, ReelWindow[]>();
export function reelWindows(score: ReelScore): ReelWindow[] {
  const cached = windowCache.get(score);
  if (cached) return cached;
  const out: ReelWindow[] = [];
  for (let i = 1; i < score.beats.length; i += 1) {
    const long = score.beats[i - 1].kind === 'light' && score.beats[i].kind === 'moon';
    out.push({ from: score.beats[i].at - score.turn, to: score.beats[i].at, seconds: score.turnSeconds * (long ? score.longTurn : 1), index: i - 1 });
  }
  out.push({ from: score.glide[0], to: score.glide[1], seconds: score.glideSeconds, index: score.beats.length - 1 });
  windowCache.set(score, out);
  return out;
}
/** The window's ease: a cubic, flat at both ends. */
const windowEase = (t: number) => {
  const v = clamp01(t);
  return v * v * (3 - 2 * v);
};
/** Its inverse (for a position inside a window, which only a restored
 *  scroll lands on). */
const windowEaseInverse = (y: number) => {
  const v = clamp01(y);
  return 0.5 - Math.sin(Math.asin(1 - 2 * v) / 3);
};
/** τ at film position d. */
export function filmClock(score: ReelScore, d: number) {
  let tau = 0;
  let at = 0;
  for (const w of reelWindows(score)) {
    if (d <= w.from) break;
    tau += (w.from - at) * HOLD_RATE;
    if (d < w.to) return tau + w.seconds * windowEaseInverse((d - w.from) / (w.to - w.from));
    tau += w.seconds;
    at = w.to;
  }
  return tau + (Math.max(d, at) - at) * HOLD_RATE;
}
/** The film position at τ (the inverse of filmClock). */
export function filmAt(score: ReelScore, tau: number) {
  let t = Math.max(0, tau);
  let at = 0;
  for (const w of reelWindows(score)) {
    const hold = (w.from - at) * HOLD_RATE;
    if (t <= hold) return at + t / HOLD_RATE;
    t -= hold;
    if (t < w.seconds) return w.from + (w.to - w.from) * windowEase(t / w.seconds);
    t -= w.seconds;
    at = w.to;
  }
  return Math.min(1, at + t / HOLD_RATE);
}

/** Where the film should go for the scroll at p. Outside the windows it is
 *  the scroll itself. Inside one it is the window's far end once the reader
 *  is `commit` of the way in, and its near end again once back under
 *  `release` (the band between keeps a reader resting in a window from
 *  flapping a turn back and forth); `previous` is the last target. */
export const REEL_COMMIT = { commit: 0.5, release: 0.3 } as const;
export function filmTarget(score: ReelScore, p: number, previous: number) {
  for (const w of reelWindows(score)) {
    if (p <= w.from) break;
    if (p >= w.to) continue;
    const at = (p - w.from) / (w.to - w.from);
    const committed = previous >= w.to - 1e-9 ? at > REEL_COMMIT.release : previous <= w.from + 1e-9 ? at >= REEL_COMMIT.commit : at >= 0.5 * (REEL_COMMIT.commit + REEL_COMMIT.release);
    return committed ? w.to : w.from;
  }
  return p;
}

/** The chase: the film clock runs toward the target's τ at up to one second
 *  of film a second (faster when it has fallen behind by more than
 *  `catchUp` seconds: in proportion, up to `fastest` times — a turn never
 *  plays in under a quarter of a second, however hard the wheel is spun),
 *  closing in exponentially at `follow` per second, its speed eased over
 *  `smooth` seconds — so it never jumps and never stops dead. */
export const REEL_CHASE = { follow: 9, smooth: 0.07, catchUp: 0.42, fastest: 2 } as const;
export interface FilmChase {
  tau: number;
  /** τ per second. */
  v: number;
}
export function chaseFilm(state: FilmChase, targetTau: number, dt: number): FilmChase {
  const step = Math.max(0, Math.min(0.1, dt));
  const lag = targetTau - state.tau;
  const vmax = Math.min(REEL_CHASE.fastest, Math.max(1, Math.abs(lag) / REEL_CHASE.catchUp));
  const want = Math.max(-vmax, Math.min(vmax, REEL_CHASE.follow * lag));
  const v = state.v + (want - state.v) * (1 - Math.exp(-step / REEL_CHASE.smooth));
  let tau = state.tau + v * step;
  // Never past the target (the clock settles on it, it does not ring).
  if ((lag >= 0 && tau > targetTau) || (lag <= 0 && tau < targetTau)) return { tau: targetTau, v: 0 };
  if (Math.abs(targetTau - tau) < 1e-5 && Math.abs(v) < 1e-3) tau = targetTau;
  return { tau, v };
}
/** Has the film arrived where the scroll asks it to be? */
export const filmSettled = (state: FilmChase, targetTau: number) => Math.abs(targetTau - state.tau) < 1e-4 && Math.abs(state.v) < 1e-3;

/** The shutter's latch. Returns the next state given the last one. */
export function shutterLatch(score: ReelScore, fired: boolean, p: number) {
  if (!fired && p >= score.fire) return true;
  if (fired && p < score.rearm) return false;
  return fired;
}

/** How long the shutter takes, ms: the blades snap shut and open slower.
 *  (Between the two they may hold shut a moment for the globe's tiles —
 *  IntroReel pauses the clock there, at most `hold` ms.) */
export const SHUTTER_MS = { close: 170, open: 440, hold: 450 } as const;
/** A reader who scrolled faster than the turns play reaches the shutter
 *  before the film has caught up: the detent starts at once (the page is
 *  carried to the first screen and held there, still under the frame, as
 *  long as the click is in progress), and the blades wait at most this long
 *  for the film to finish its glide and its focus (the moon in the corner,
 *  the finder up, the split image together) — so the reader sees the camera
 *  focus, then fire. (At a brisk 1430 px/s the wait is about 0.7 s on a
 *  1000 px screen and 0.9 s on an 800 px one; faster than that the blades
 *  go at the cap, the focus finishing under them.) */
export const SHUTTER_WAIT_MS = 900;

/** The focus beat: once the moon has glided in, the split image takes at
 *  least this long to come together, however far past the focus stretch
 *  the scroll already is (at a brisk wheel it was together before the
 *  finder was even up, and the focus-then-fire was never seen). */
export const FOCUS_BEAT_S = 0.35;
/** The beat's clock, 0 → 1: it runs up while the film is at the end of the
 *  glide and back down (as fast) while it is not, so it never jumps. */
export function stepFocusBeat(beat: number, glided: boolean, dt: number) {
  return clamp01(beat + ((glided ? 1 : -1) * Math.max(0, dt)) / FOCUS_BEAT_S);
}
/** The split image's focus, 0 (apart) → 1 (together): the scroll's, held
 *  back by the beat. */
export function finderFocus(score: ReelScore, life: number, beat: number) {
  return Math.min(segment(life, score.focus[0], score.focus[1]), clamp01(beat));
}

export interface ShutterFrame {
  /** 0 = wide open (the blade tips just outside the frame), 1 = shut. */
  closed: number;
  /** What the opening shows: the page beneath (the archive) or the reel. */
  showsPage: boolean;
  done: boolean;
}
/** The blades `elapsed` ms after a release toward the page (`toPage`) or
 *  back to the reel: they close over what was showing and open on the other.
 *  The close eases in (quadratic, so the tips are in the frame from the very
 *  first frame after the release); the open eases out. */
export function shutterAt(elapsed: number, toPage: boolean): ShutterFrame {
  const e = Math.max(0, elapsed);
  if (e < SHUTTER_MS.close) return { closed: (e / SHUTTER_MS.close) ** 2, showsPage: !toPage, done: false };
  const t = (e - SHUTTER_MS.close) / SHUTTER_MS.open;
  if (t >= 1) return { closed: 0, showsPage: toPage, done: true };
  return { closed: 1 - easeOutCubic(t), showsPage: toPage, done: false };
}
/** A release reversed mid-click picks up from where the blades are. Caught
 *  while closing (over the side the reader is going back to), the blades
 *  simply open again onto it; caught while opening (on the new side), they
 *  close over it and open on the old one. Returns the reversed release's own
 *  elapsed time; its blades are exactly where they were. */
export function reversedElapsed(elapsed: number) {
  if (elapsed <= 0) return 0;
  const frame = shutterAt(elapsed, true);
  if (frame.done) return 0;
  if (elapsed < SHUTTER_MS.close) return SHUTTER_MS.close + SHUTTER_MS.open * (1 - Math.cbrt(clamp01(frame.closed)));
  return SHUTTER_MS.close * Math.sqrt(clamp01(frame.closed));
}
/** The detent: when the shutter fires going down, the page is carried to the
 *  first screen and arrives at rest as the blades finish opening (seconds,
 *  and the curve — HomePage hands both to Lenis). */
export const DETENT_S = (SHUTTER_MS.close + SHUTTER_MS.open) / 1000;
export const detentEase = (t: number) => easeOutCubic(t);
/** …and holds still this long after the blades are open, so a flick's
 *  momentum does not carry the reader on past the first screen. */
export const DETENT_HOLD_MS = 450;

// ── Design frames ──────────────────────────────────────────────────────────
// The reel is composed in a fixed design frame and laid over the viewport
// the way CSS `background-size: cover` would (the server's first paint is an
// SVG of the cover in the same frame with `preserveAspectRatio: slice`, so
// the canvas that replaces it lands on the same pixels).

export interface DesignFrame {
  w: number;
  h: number;
}
export const FRAME_DESKTOP: DesignFrame = { w: 1728, h: 1000 };
export const FRAME_PHONE: DesignFrame = { w: 390, h: 844 };
/** Below this width the page is the compact tree (HomePage's `lg`). */
export const PHONE_MAX_WIDTH = 1023;

export interface Cover {
  s: number;
  ox: number;
  oy: number;
}
/** design → screen: x * s + ox. */
export function coverTransform(frame: DesignFrame, width: number, height: number): Cover {
  const s = Math.max(width / frame.w, height / frame.h);
  return { s, ox: (width - frame.w * s) / 2, oy: (height - frame.h * s) / 2 };
}
export const toDesign = (cover: Cover, x: number, y: number): Vec2 => [(x - cover.ox) / cover.s, (y - cover.oy) / cover.s];

/** Where the first screen's globe sits, in screen pixels, derived the way
 *  RouteAtlas places it (PROLOGUE_GLOBE centre 0.84 / 0.93 of the viewport,
 *  `cornerZoomFor` scaling its radius with the width); the radius was measured
 *  off the live planet at 1280–1920 wide (0.380w → 0.366w). The moon lands
 *  there, and the shutter reopens on the Earth in the same place. */
export function firstScreenGlobe(width: number, height: number) {
  const w = Math.max(1080, width);
  const ratio = 0.3797 - (w - 1280) * 2.22e-5;
  return { x: 0.84 * width, y: 0.93 * height, r: ratio * w };
}

// ── Sphere maths ───────────────────────────────────────────────────────────

/** Rotation: yaw about y, then pitch about x, then roll about z. */
export function rotation(yaw: number, pitch: number, roll = 0): Mat3 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const cz = Math.cos(roll), sz = Math.sin(roll);
  // Ry
  const a: Mat3 = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  // Rx
  const b: Mat3 = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  // Rz
  const c: Mat3 = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul(c, mul(b, a));
}
export function mul(a: Mat3, b: Mat3): Mat3 {
  const out = new Array(9) as unknown as number[];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out as unknown as Mat3;
}
export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}
export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Two unit vectors perpendicular to `n` and to each other. */
export function basis(n: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(helper, n));
  return [u, cross(n, u)];
}
/** A circle on the unit sphere: points whose dot with `normal` is `offset`. */
export function sphereCircle(normal: Vec3, offset: number, samples: number): Vec3[] {
  const n = normalize(normal);
  const [u, v] = basis(n);
  const radius = Math.sqrt(Math.max(0, 1 - offset * offset));
  const out: Vec3[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const a = (i / samples) * Math.PI * 2;
    const c = Math.cos(a) * radius, s = Math.sin(a) * radius;
    out.push([n[0] * offset + u[0] * c + v[0] * s, n[1] * offset + u[1] * c + v[1] * s, n[2] * offset + u[2] * c + v[2] * s]);
  }
  return out;
}

/** Split a 3-D polyline into its runs in front of the sphere (z ≥ 0), each
 *  run cut exactly on the limb. */
export function visibleRuns(points: readonly Vec3[], minZ = 0): Vec3[][] {
  const runs: Vec3[][] = [];
  let run: Vec3[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const inFront = p[2] >= minZ;
    if (i > 0) {
      const q = points[i - 1];
      const wasInFront = q[2] >= minZ;
      if (inFront !== wasInFront) {
        const t = (minZ - q[2]) / (p[2] - q[2]);
        const cut: Vec3 = [q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t, minZ];
        if (wasInFront) {
          run.push(cut);
          runs.push(run);
          run = [];
        } else {
          run = [cut];
        }
      }
    }
    if (inFront) run.push(p);
  }
  if (run.length > 1) runs.push(run);
  return runs.filter((r) => r.length > 1);
}

// ── The football: a truncated icosahedron on the sphere ─────────────────────

const PHI = (1 + Math.sqrt(5)) / 2;
export function icosahedron(): Vec3[] {
  const raw: Vec3[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-PHI, PHI]) {
      raw.push([0, a, b], [a, b, 0], [b, 0, a]);
    }
  }
  return raw.map(normalize);
}

export interface Football {
  /** 12 pentagons (5 corners each, in order round the patch). */
  pentagons: Vec3[][];
  /** 90 seams: 60 pentagon edges and 30 between hexagons. */
  seams: [Vec3, Vec3][];
}

export function footballGeometry(): Football {
  const v = icosahedron();
  const edge = Math.min(...v.slice(1).map((w) => Math.hypot(v[0][0] - w[0], v[0][1] - w[1], v[0][2] - w[2])));
  const near = (a: Vec3, b: Vec3) => Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - edge) < 1e-6;
  const third = (a: Vec3, b: Vec3): Vec3 => normalize([a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3, a[2] + (b[2] - a[2]) / 3]);
  const pentagons: Vec3[][] = [];
  const seams: [Vec3, Vec3][] = [];
  v.forEach((center, i) => {
    const neighbours = v.filter((w, j) => j !== i && near(center, w));
    const [u, w] = basis(center);
    neighbours.sort((a, b) => Math.atan2(dot(a, w), dot(a, u)) - Math.atan2(dot(b, w), dot(b, u)));
    const corners = neighbours.map((n) => third(center, n));
    pentagons.push(corners);
    corners.forEach((c, k) => seams.push([c, corners[(k + 1) % corners.length]]));
    neighbours.forEach((n) => {
      const j = v.indexOf(n);
      if (j > i) seams.push([third(center, n), third(n, center)]);
    });
  });
  return { pentagons, seams };
}

/** Points spread evenly over the sphere (Fibonacci lattice), jittered by a
 *  seeded hash so they do not read as a grid. */
export function spherePoints(count: number, seed = 1, jitter = 0.35): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * golden + (hash(i, seed) - 0.5) * jitter;
    const dy = (hash(i + 97, seed) - 0.5) * jitter * (2 / count) * 6;
    out.push(normalize([Math.cos(a) * r, y + dy, Math.sin(a) * r]));
  }
  return out;
}

/** A deterministic 0–1 hash of an integer and a seed. */
export function hash(n: number, seed = 0) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1-D noise: a sum of three seeded sines, in about −1…1. */
export function wave(x: number, seed = 0) {
  const a = hash(1, seed) * Math.PI * 2;
  const b = hash(2, seed) * Math.PI * 2;
  const c = hash(3, seed) * Math.PI * 2;
  return (Math.sin(x + a) * 0.55 + Math.sin(x * 2.13 + b) * 0.3 + Math.sin(x * 4.37 + c) * 0.15);
}

// ── Plane geometry (shards, the iris, the cookie) ──────────────────────────

export type Poly = Vec2[];

export function polygonArea(poly: readonly Vec2[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function centroid(poly: readonly Vec2[]): Vec2 {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

/** Split a convex polygon by the line through `p` at `angle`. */
export function splitConvex(poly: readonly Vec2[], p: Vec2, angle: number): Poly[] {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const side = (q: Vec2) => (q[0] - p[0]) * dy - (q[1] - p[1]) * dx;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa >= 0) left.push(a);
    if (sa <= 0) right.push(a);
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = sa / (sa - sb);
      const cut: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      left.push(cut);
      right.push(cut);
    }
  }
  return [left, right].filter((q) => q.length >= 3 && Math.abs(polygonArea(q)) > 1e-6);
}

export interface Cut {
  p: Vec2;
  angle: number;
}
/** Cut a w×h rectangle into shards along straight cuts (collage planes). */
export function shardsFromCuts(w: number, h: number, cuts: readonly Cut[], pad = 0): Poly[] {
  let shards: Poly[] = [[[-pad, -pad], [w + pad, -pad], [w + pad, h + pad], [-pad, h + pad]]];
  for (const cut of cuts) {
    shards = shards.flatMap((s) => splitConvex(s, cut.p, cut.angle));
  }
  return shards;
}

/** A seeded set of cuts that all pass near a focus (the sphere), so the
 *  sphere is broken into planes the way a cubist face is. */
export function cutsAround(focus: Vec2, radius: number, count: number, seed: number): Cut[] {
  const out: Cut[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = radius * (0.1 + hash(i, seed) * 0.75);
    const a = hash(i + 31, seed) * Math.PI * 2;
    const angle = (i / count) * Math.PI + (hash(i + 7, seed) - 0.5) * 0.7;
    out.push({ p: [focus[0] + Math.cos(a) * r, focus[1] + Math.sin(a) * r], angle });
  }
  return out;
}

/** The iris: `n` straight blades whose inner edges make a regular n-gon of
 *  circumradius `aperture` round (cx, cy), turned by `twist`. Each blade runs
 *  from its corner along its edge and on out past `far`; together they cover
 *  everything outside the opening. */
export function irisBlades(cx: number, cy: number, aperture: number, n: number, twist: number, far: number): Poly[] {
  const corners: Vec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = twist + (i / n) * Math.PI * 2;
    corners.push([cx + Math.cos(a) * aperture, cy + Math.sin(a) * aperture]);
  }
  const blades: Poly[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % n];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      // Shut: the edge direction is the tangent at the corner's angle.
      const ang = twist + (i / n) * Math.PI * 2 + Math.PI / 2 + Math.PI / n;
      dx = Math.cos(ang);
      dy = Math.sin(ang);
    } else {
      dx /= len;
      dy /= len;
    }
    // Outward normal of edge a→b (the opening is on the inside).
    const nx = dy, ny = -dx;
    const back = far * 0.02;
    blades.push([
      [a[0] - dx * back, a[1] - dy * back],
      [a[0] + dx * far, a[1] + dy * far],
      [a[0] + dx * far + nx * far, a[1] + dy * far + ny * far],
      [a[0] - dx * back + nx * far, a[1] - dy * back + ny * far],
    ]);
  }
  return blades;
}

/** Is a point inside a convex or simple polygon (even-odd)? */
export function pointInPolygon(point: Vec2, poly: readonly Vec2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface Bite {
  /** Direction from the cookie's centre, radians. */
  angle: number;
  /** How far the bite's circle reaches in from the edge, share of the radius. */
  depth: number;
  /** The bite circle's radius, share of the cookie radius. */
  size: number;
}
/** The cookie's outline: a lumpy disc with bites taken out of it. Each bite
 *  is a circle centred outside the edge; a ray from the centre stops where it
 *  first enters any bite. */
export function cookieOutline(cx: number, cy: number, r: number, bites: readonly Bite[], samples = 160, seed = 3): Poly {
  const out: Vec2[] = [];
  const circles = bites.map((b) => {
    const size = b.size * r;
    const d = r * (1 - b.depth) + size;
    return { x: Math.cos(b.angle) * d, y: Math.sin(b.angle) * d, rr: size };
  });
  for (let i = 0; i < samples; i += 1) {
    const a = (i / samples) * Math.PI * 2;
    const lump = 1 + 0.018 * wave(a * 3, seed) + 0.01 * wave(a * 9, seed + 5);
    let reach = r * lump;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (const c of circles) {
      // Ray (t·dx, t·dy) against the circle: t² − 2t(d·c) + |c|² − rr² = 0.
      const bproj = dx * c.x + dy * c.y;
      const disc = bproj * bproj - (c.x * c.x + c.y * c.y - c.rr * c.rr);
      if (disc <= 0) continue;
      const t1 = bproj - Math.sqrt(disc);
      if (t1 > 0 && t1 < reach) reach = t1;
    }
    out.push([cx + dx * reach, cy + dy * reach]);
  }
  return out;
}

/** Resample a closed polygon to `n` points evenly spaced along its perimeter,
 *  starting nearest the given angle about its centroid (so two shapes can be
 *  morphed point for point). */
export function resampleClosed(poly: readonly Vec2[], n: number, startAngle = 0): Vec2[] {
  const c = centroid(poly);
  let start = 0;
  let best = Infinity;
  poly.forEach((p, i) => {
    const a = Math.atan2(p[1] - c[1], p[0] - c[0]);
    const d = Math.abs(Math.atan2(Math.sin(a - startAngle), Math.cos(a - startAngle)));
    if (d < best) { best = d; start = i; }
  });
  const pts = [...poly.slice(start), ...poly.slice(0, start)];
  const lengths = [0];
  for (let i = 1; i <= pts.length; i += 1) {
    const a = pts[i - 1], b = pts[i % pts.length];
    lengths.push(lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[lengths.length - 1];
  const out: Vec2[] = [];
  let k = 0;
  for (let i = 0; i < n; i += 1) {
    const target = (i / n) * total;
    while (k < pts.length - 1 && lengths[k + 1] < target) k += 1;
    const a = pts[k], b = pts[(k + 1) % pts.length];
    const seg = lengths[k + 1] - lengths[k] || 1;
    const t = (target - lengths[k]) / seg;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** A circle as a polygon of `n` points starting at `startAngle`. */
export function circlePoly(cx: number, cy: number, r: number, n: number, startAngle = 0): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = startAngle + (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** The lens: where a point of the wallpaper behind a black hole of Einstein
 *  radius `re` at (cx, cy) appears (the primary image of the point-lens
 *  equation θ = (β + √(β² + 4θE²)) / 2). Everything is pushed out of the
 *  hole, and lines bend round it. */
export function lensed(x: number, y: number, cx: number, cy: number, re: number): Vec2 {
  const dx = x - cx, dy = y - cy;
  const beta = Math.hypot(dx, dy);
  if (re <= 0) return [x, y];
  if (beta < 1e-6) return [cx + re, cy];
  const theta = (beta + Math.sqrt(beta * beta + 4 * re * re)) / 2;
  const k = theta / beta;
  return [cx + dx * k, cy + dy * k];
}
