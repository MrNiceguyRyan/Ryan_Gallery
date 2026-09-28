// ── Motion vocabulary: the site's curves, durations, staggers and springs ──
// One small set of words for how things move, so a hover, a landing and a
// fall read as the same hand across the homepage, the Story, /travel and
// /about. It lives in two places that must match:
// - src/styles/global.css, the `:root` Motion block (--ease-*, --dur-*), for
//   CSS transitions and keyframes;
// - this module, the same values for framer-motion, WAAPI, Lenis and Mapbox.
// scripts/motion-tokens.test.mjs holds the two to each other, and fails on any
// var(--ease-*) or var(--dur-*) under src/ that the Motion block does not
// define (an undefined custom property in a transition shorthand drops the
// whole transition, so the move silently hard-cuts). Scripts read the values
// from here, never by parsing getComputedStyle: the build minifies the block,
// so --dur-in is served as `.2s` and --ease-arrive as `cubic-bezier(.16, 1, .3, 1)`.
//
// Tailwind 4 already owns --ease-in, --ease-out and --ease-in-out (they drive
// its ease-in/ease-out utilities), so none of these names reuse them.
//
// Named exceptions stay local to where they are used, because each is its own
// owner-approved gesture; mark each one "named exception - see
// src/lib/motion.ts" when its file moves onto these tokens:
// - popEase (0.34, 1.56, 0.64, 1), the frame rise;
// - overlayEase (0.32, 0, 0.07, 1), the Story panel slide;
// - stubTravel (0.5, 0, 0.18, 1);
// - the closing's SKID, PEN and STEP_BACK;
// - the atlas hops' launch and continue curves (850 + 1000 x reach ms);
// - the nav return (0, 0, 0.2, 1).
// Scroll-owned values keep `smootherstep`; internal clocks (the tear clock,
// the pull-back samples) stay linear and shape their transforms instead.
//
// Rhythm: hover comes in over DUR.in on EASE.arrive and goes out over DUR.out
// (opacity reaching 0 on EASE.fade, colour and transform on EASE.arrive).
// Hover grows at most 2px, chrome never scales, a press is 0.96-0.97.
// Reduced motion sets durations to 0 or jumps to final values; it never
// changes what is on the page.

export type Bezier = readonly [number, number, number, number];

export const EASE = {
  /** The house curve (expo out). Entrances, settles, landings, hover in,
   *  small flights, the hero rise, the voyage bridge. */
  arrive: [0.16, 1, 0.3, 1],
  /** The site rule for anything leaving: every fall and exit transform (the
   *  torn face, the stub fall, the egg exits, the page fall). */
  leave: [0.55, 0, 1, 0.45],
  /** The leave curve's companion for ink: opacity reaching 0 on a still or
   *  slow element, always after a hold. Still an ease-in, but with a finite
   *  end slope, so the last two frames do not pop from a third to nothing. */
  fade: [0.42, 0, 1, 1],
  /** A to B on a clock: the needle, the viewfinder's travel, the closing's
   *  square, the archive recede. */
  travel: [0.65, 0, 0.35, 1],
  /** Large opaque planes: plate grow, card grow, peel, entry covers. */
  plane: [0.76, 0, 0.24, 1],
  /** Mask sweeps only. */
  develop: [0.455, 0.03, 0.515, 0.955],
} as const satisfies Record<string, Bezier>;

export type EaseName = keyof typeof EASE;

const cubicBezier = ([x1, y1, x2, y2]: Bezier) => `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;

/** A curve as a function of time, for the APIs that take an easing function
 *  rather than a CSS string (Mapbox's flyTo, fitBounds and easeTo). Solves
 *  x(t) = x by Newton's method (8 steps; the curves here are all well inside
 *  it) and returns y(t). `bezierFn(EASE.travel)` is the same curve the CSS
 *  var(--ease-travel) runs, so a map flight and a CSS move keep one hand. */
export function bezierFn([x1, y1, x2, y2]: Bezier): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (!(x > 0)) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(t) - x;
      const slope = slopeX(t);
      if (Math.abs(error) < 1e-6 || !slope) break;
      t -= error / slope;
    }
    return sampleY(Math.max(0, Math.min(1, t)));
  };
}

/** The same curves as CSS strings, written exactly as the Motion block
 *  writes them (for inline styles and WAAPI `easing`). */
export const CSS_EASE = Object.fromEntries(
  Object.entries(EASE).map(([name, curve]) => [name, cubicBezier(curve)]),
) as { readonly [K in EaseName]: string };

/** Durations in milliseconds, mirrored by --dur-* in the Motion block. */
export const DUR_MS = {
  /** Blinks, digit rolls, a press, the nav step-out. */
  flick: 120,
  /** Hover in. */
  in: 200,
  /** Lightbox slide, captions, state and background swaps. */
  swap: 320,
  /** Hover out, small exits. */
  out: 400,
  /** Plate grow, the lightbox's open flight. */
  grow: 560,
  /** Lock, AF point, landmark, re-seat, develop. */
  settle: 620,
  /** Peel, panel. */
  plane: 720,
  /** The entry cover's lift. */
  cover: 850,
  /** The tear, the longest hero rise. */
  scene: 1000,
  /** Terrain settle, recede. */
  atmos: 1300,
} as const;

export type DurName = keyof typeof DUR_MS;

/** The same durations in seconds (framer-motion, Lenis). */
export const DUR = Object.fromEntries(
  Object.entries(DUR_MS).map(([name, ms]) => [name, ms / 1000]),
) as { readonly [K in DurName]: number };

/** Stagger steps in seconds: list rows, display lines, reading-order sets. */
export const STAGGER = {
  list: 0.04,
  line: 0.09,
  set: 0.07,
} as const;

/** framer-motion springs. `answer` is engagement and the pull hint; `hand`
 *  is pointer-follow only. */
export const SPRING = {
  answer: { stiffness: 250, damping: 28, mass: 0.62 },
  hand: { stiffness: 150, damping: 25, mass: 0.58 },
} as const;

/** Quintic smootherstep for scroll-owned values: flat at both ends, so a
 *  value tied to the wheel starts and stops without a kick. Takes 0..1;
 *  clamp before calling. The same expression as RouteAtlas's, so the floats
 *  agree. */
export const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** How long a programmatic voyage along the homepage takes (the atlas, the
 *  eggs' tickets, pull-to-tear, Back to the start): a beat longer the further
 *  it goes, from 1.5 s to 2.6 s. `distance` is in CSS pixels. */
export const voyageSeconds = (distance: number) =>
  Math.min(2.6, Math.max(1.5, 1.3 + distance / 2400));

/** The voyage's Lenis easing: sine in and out, so the atlas camera can take
 *  off and land with the page. */
export const voyageEase = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
