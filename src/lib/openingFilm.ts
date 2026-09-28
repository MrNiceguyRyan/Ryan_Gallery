// ── The opening film: a word hunt through many texts ──
// The homepage opens on a short film (src/components/home/OpeningFilm.tsx,
// its scenes in OpeningScenes.tsx, its materials in src/styles/opening.css).
// A camera hunts through one kind of text after another — code falling down
// a screen, a dictionary, a newspaper, a magazine, film subtitles, a cinema
// ticket, a book, a departure board, a telegram, a notebook, a library card,
// the edge of a strip of film — and in every one it FINDS the same words:
// ARCHIVE, CINEMA, TRAVEL, THOUGHT, RYAN XU. It ends on a clapperboard that
// carries them all, and the clap hands over to the first screen.
//
// What makes it smooth is the MATCH CUT: while the camera hunts one word, the
// word keeps its place and its size on the screen across every cut — only the
// world round it changes (the paper, the typeface, the scale of the page) —
// and a thin lime reading rule, the one lime on screen, snaps under it like
// autofocus (?finder=frame swaps it for four viewfinder corners). The camera
// only ever pushes in and drifts, on eased curves. Cuts come faster as it
// goes, like a trailer.
//
// Two ways to land, chosen by the URL (?open=a, the default, or ?open=b):
//  A "words fly home": the clapperboard dissolves into the page's olive, and
//    RYAN, XU, ARCHIVE, TRAVEL and THOUGHT glide into their own places in the
//    first screen's name and line, their typeface turning into Fraunces on
//    the way (both faces held to one ink box, so the change is a morph, never
//    a double image); the globe rises out of the dark behind them, the nav
//    last.
//  B "through the o": the camera pushes into the O of THOUGHT; its round
//    counter opens onto the page and grows into the Earth's own disc (a match
//    cut on the circle), and the first screen rises round it.
//
// It plays once a tab session (src/lib/reelVisit.ts): a later view skips it
// before the first paint. Any wheel, touch, key or click fast-forwards to the
// clapperboard and the landing — never a hard cut to the page. Reduced
// motion gets the clapperboard as a still and a calm crossfade.
//
// Everything in this module is pure (no DOM), so scripts/opening-film.test.mjs
// holds the schedule, the fast-forward, the camera, the landing and the
// portal to account offline.

import { bezierFn } from './motion';

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 → 1 across [a, b], linear, clamped. */
export const segment = (value: number, a: number, b: number) => clamp01((value - a) / (b - a));
export const easeInOutCubic = (t: number) => {
  const v = clamp01(t);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;

// ── What the film tells the page ─────────────────────────────────────────
// The film is its own island, above HomePage's. It says whether it covers
// the first screen ('film'), is landing on it ('landing'), or has handed the
// page over ('page'), and whether the globe may start to come up behind it
// (HomePage then lets go of the atlas's held reveal, so the globe's fade and
// dawn are done, under the film, before the landing shows it). The last word
// is kept on window.__archiveOpening for anyone who starts listening late.

export const OPENING_EVENT = 'archive:opening';
export type OpeningState = 'film' | 'landing' | 'page';
export interface OpeningDetail {
  state: OpeningState;
  /** The globe may reveal (HomePage releases RouteAtlas's `holdReveal`). */
  globe: boolean;
}
declare global {
  interface Window {
    __archiveOpening?: OpeningDetail;
    /** RouteAtlas: are the first screen's globe tiles in? (The landing
     *  waits a moment for them.) */
    __archiveGlobeReady?: () => boolean;
  }
}

// ── The scenes and their cuts ─────────────────────────────────────────────

export type FoundWord = 'archive' | 'cinema' | 'travel' | 'thought' | 'ryanxu';
export type SceneId =
  | 'code'
  | 'dictionary'
  | 'newspaper'
  | 'magazine'
  | 'subtitles'
  | 'ticket'
  | 'book'
  | 'board'
  | 'telegram'
  | 'notebook'
  | 'catalogue'
  | 'contact'
  | 'slate';

export interface ScenePlan {
  id: SceneId;
  /** The word the camera finds in it. Consecutive scenes on one word are a
   *  RUN: the word holds its place and size across their cuts. */
  word: FoundWord;
  /** How long the scene is on screen, ms. */
  ms: number;
}

// Desktop: thirteen scenes, 5.6 s to the clap (he reviews by reloading, so
// he sits through it every time). The first holds while the code locks into
// ARCHIVE and the word lifts off it; from there every cut is shorter than
// the one before (a trailer's rhythm), from 580 ms down to 225; the
// clapperboard then holds long enough to be read, and claps.
//
// The order is also a GRADE: dark code, light archive paper, dark cinema,
// the board (still dark), then light travel / thought / catalogue paper, and
// dark film into the olive page — four changes of tone, never two in one
// second (a calm site: no black-white strobe).
export const FILM_DESKTOP: readonly ScenePlan[] = [
  { id: 'code', word: 'archive', ms: 900 },
  { id: 'dictionary', word: 'archive', ms: 580 },
  { id: 'newspaper', word: 'archive', ms: 490 },
  { id: 'magazine', word: 'cinema', ms: 470 },
  { id: 'subtitles', word: 'cinema', ms: 410 },
  { id: 'ticket', word: 'cinema', ms: 360 },
  { id: 'board', word: 'travel', ms: 340 },
  { id: 'book', word: 'travel', ms: 300 },
  { id: 'telegram', word: 'thought', ms: 280 },
  { id: 'notebook', word: 'thought', ms: 260 },
  { id: 'catalogue', word: 'ryanxu', ms: 240 },
  { id: 'contact', word: 'ryanxu', ms: 225 },
  { id: 'slate', word: 'ryanxu', ms: 700 },
];

// Phone: the same film, fewer and simpler scenes (eight, 3.9 s to the clap).
export const FILM_PHONE: readonly ScenePlan[] = [
  { id: 'code', word: 'archive', ms: 900 },
  { id: 'dictionary', word: 'archive', ms: 560 },
  { id: 'magazine', word: 'cinema', ms: 470 },
  { id: 'ticket', word: 'cinema', ms: 400 },
  { id: 'book', word: 'travel', ms: 340 },
  { id: 'telegram', word: 'thought', ms: 300 },
  { id: 'catalogue', word: 'ryanxu', ms: 270 },
  { id: 'slate', word: 'ryanxu', ms: 700 },
];

// How each scene reads on screen, light or dark: the cut rhythm must never
// strobe (scripts/opening-film.test.mjs: at most three light/dark changes in
// any one second, under the general flash threshold; on the desktop at most
// one, four in all).
export const SCENE_TONE: Record<SceneId, 'light' | 'dark'> = {
  code: 'dark',
  dictionary: 'light',
  newspaper: 'light',
  magazine: 'dark',
  subtitles: 'dark',
  ticket: 'dark',
  book: 'light',
  board: 'dark',
  telegram: 'light',
  notebook: 'light',
  catalogue: 'light',
  contact: 'dark',
  slate: 'dark',
};

/** Below this width the page is the compact tree (HomePage's `lg`). */
export const PHONE_MAX_WIDTH = 1023;

export interface Cut extends ScenePlan {
  index: number;
  /** Film time the scene cuts in / out, ms. */
  start: number;
  end: number;
  /** The first scene of its run (the finder travels to a new word). */
  runStart: boolean;
  run: number;
}

export function cutSchedule(scenes: readonly ScenePlan[]): Cut[] {
  const cuts: Cut[] = [];
  let at = 0;
  let run = -1;
  scenes.forEach((scene, index) => {
    const runStart = index === 0 || scenes[index - 1].word !== scene.word;
    if (runStart) run += 1;
    cuts.push({ ...scene, index, start: at, end: at + scene.ms, runStart, run });
    at += scene.ms;
  });
  return cuts;
}

/** Film time the landing begins (the clap). */
export const filmLength = (cuts: readonly Cut[]) => (cuts.length ? cuts[cuts.length - 1].end : 0);

/** The scene on screen at film time `t` (the last one holds). */
export function sceneAt(cuts: readonly Cut[], t: number) {
  for (let i = 0; i < cuts.length; i += 1) if (t < cuts[i].end) return i;
  return cuts.length - 1;
}

/** The first and last scene of the run cut `i` belongs to. */
export function runOf(cuts: readonly Cut[], i: number) {
  let first = i;
  let last = i;
  while (first > 0 && cuts[first - 1].run === cuts[i].run) first -= 1;
  while (last < cuts.length - 1 && cuts[last + 1].run === cuts[i].run) last += 1;
  return { first, last, start: cuts[first].start, end: cuts[last].end };
}

// ── The code scene (scene 1) ──────────────────────────────────────────────
// Its beats are CSS from the first paint (the rain falls, the letters of
// ARCHIVE scramble and lock one by one — opening.css writes these same
// numbers into of-scramble / of-lock-on) and WAAPI once the island is up
// (the word lifts off the rain toward the lens, the rain dims, the finder
// rides it). Film ms. The finder is there early: it comes up round the
// scrambling letters at `finder[0]`, closes on them, and rides the lift until
// it is on the word at full size at `finder[1]` — the first second is a hunt,
// not generic rain.
export const CODE_BEATS = {
  /** Letter i starts to scramble at `scramble + i * stagger`… */
  scramble: 120,
  stagger: 50,
  /** …and locks `lockAfter` later. */
  lockAfter: 200,
  /** The locked word lifts off the rain (scale k0 → 1). */
  lift: [420, 800] as const,
  /** The rain dims behind it. */
  dim: [400, 800] as const,
  /** The finder: in round the scrambling cells, then on the word at full
   *  size (the lift's end). */
  finder: [200, 800] as const,
  /** How far outside the scrambling cells the finder first comes up, px. */
  search: 46,
} as const;
/** The lift's curve (slow to leave, soft to land); the finder rides it. */
export const LIFT_EASE = [0.5, 0, 0.15, 1] as const;
/** The rain's own dimmed strength once ARCHIVE has lifted off it. */
export const RAIN_DIM = 0.3;

// ── The slate's beats (ms from the slate's cut) ───────────────────────────
// The found words are chalked under, one after another; the sticks come
// down at the end (the clap) and the landing starts on the clap.
export function slateBeats(slateMs: number) {
  return {
    underline: [90, 170, 250] as const,
    underlineMs: 150,
    /** The sticks close: an ease-in fall, contact at `slateMs`. */
    clap: [slateMs - 130, slateMs] as const,
  };
}

// ── Fast-forward ───────────────────────────────────────────────────────────
// A wheel, a touch, a key or a click takes the film to the clapperboard with
// FF_TAIL ms of it left (the words already chalked under, the sticks about to
// fall), then the landing plays HURRIED (the reader asked to hurry: every
// landing beat at FF_RATE). Never a hard cut to the page, never back, and
// nothing once the clap has come.
export const FF_TAIL = 320;
export const FF_RATE = 1.35;
export function fastForwardTarget(cuts: readonly Cut[], t: number): number | null {
  const end = filmLength(cuts);
  if (!cuts.length || t >= end) return null;
  const target = Math.max(cuts[cuts.length - 1].start, end - FF_TAIL);
  return t < target ? target : null;
}

// ── The globe behind ──────────────────────────────────────────────────────
// The atlas holds the globe's reveal while the film covers it; it lets go
// this long before the clap, so the fade, the dawn and the settle (2.6 s) are
// done — under the film — before the landing shows the globe. A fast-forward
// lets go at once.
export const GLOBE_LEAD_MS = 2900;
export const globeReleaseAt = (cuts: readonly Cut[]) => Math.max(0, filmLength(cuts) - GLOBE_LEAD_MS);
/** At the clap the landing waits at most this long for the globe's tiles. */
export const GLOBE_WAIT_MS = 700;

// ── The camera ─────────────────────────────────────────────────────────────
// Every scene is a SHEET designed at the desktop's scale (a found word's
// cap height is about 64 px there) and a camera: a uniform scale and a
// translation that put the found word's centre on the run's focus point with
// the run's cap height, times a slow push-in across the run. The cap height
// is the code scene's locked word, measured (its size is the one CSS rule
// both agree on), so the dictionary's headword takes over from it exactly.

export type Vec2 = readonly [number, number];
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The found word's cap height on screen, the CSS rule (opening.css,
 *  --of-cap) written out: 6.4% of the height or 3.9% of the width,
 *  whichever is less, 36–96 px. */
export function capFor(width: number, height: number) {
  return Math.min(96, Math.max(36, Math.min(0.064 * height, 0.039 * width)));
}

/** Where each run holds its word, as a share of the viewport. The words
 *  wander a little between runs (the finder travels: the hunt), and the last,
 *  RYAN XU, sits where the clapperboard frames best for the landing. */
export const FOCUS: Record<FoundWord, { desktop: Vec2; phone: Vec2 }> = {
  archive: { desktop: [0.5, 0.46], phone: [0.5, 0.44] },
  cinema: { desktop: [0.5, 0.44], phone: [0.5, 0.4] },
  travel: { desktop: [0.57, 0.53], phone: [0.5, 0.5] },
  thought: { desktop: [0.46, 0.58], phone: [0.5, 0.54] },
  ryanxu: { desktop: [0.4, 0.36], phone: [0.5, 0.34] },
};
/** How far a run's camera pushes in (scale) and drifts (share of the
 *  viewport) from its first scene to its last. */
export const RUN_PUSH = 0.075;
export const RUN_DRIFT: Vec2 = [-0.012, 0.004];

export interface Anchor {
  /** The found word's centre in its sheet (sheet px). */
  x: number;
  y: number;
  /** Its cap (ascender) height in the sheet. */
  cap: number;
}
export interface Camera {
  s: number;
  tx: number;
  ty: number;
}

/** Where the run of cut `i` is, 0 → 1, at film time `t`. The code scene's
 *  run starts its push at the second scene (the first lifts its word). */
export function runProgress(cuts: readonly Cut[], i: number, t: number) {
  const run = runOf(cuts, i);
  const pushFrom = cuts[run.first].id === 'code' && run.last > run.first ? cuts[run.first + 1].start : run.start;
  return segment(t, pushFrom, run.end);
}

export function focusAt(cuts: readonly Cut[], i: number, t: number, width: number, height: number, phone: boolean, archiveFocus?: Vec2): Vec2 {
  const word = cuts[i].word;
  const base: Vec2 = word === 'archive' && archiveFocus ? archiveFocus : [FOCUS[word][phone ? 'phone' : 'desktop'][0] * width, FOCUS[word][phone ? 'phone' : 'desktop'][1] * height];
  const p = runProgress(cuts, i, t);
  const drift = phone ? 0 : 1;
  return [base[0] + RUN_DRIFT[0] * width * p * drift, base[1] + RUN_DRIFT[1] * height * p * drift];
}

/** The camera on a sheet: its anchor lands on `focus` with cap height
 *  `cap * (1 + RUN_PUSH * p)`. transform-origin is the sheet's top left. */
export function cameraFor(anchor: Anchor, focus: Vec2, cap: number, p: number): Camera {
  const s = (cap * (1 + RUN_PUSH * clamp01(p))) / Math.max(1e-6, anchor.cap);
  return { s, tx: focus[0] - anchor.x * s, ty: focus[1] - anchor.y * s };
}

export const cameraTransform = (c: Camera) =>
  `translate3d(${c.tx.toFixed(2)}px, ${c.ty.toFixed(2)}px, 0) scale(${c.s.toFixed(5)})`;

/** A sheet box (sheet px) on the screen under camera `c`. */
export const onScreen = (box: Box, c: Camera): Box => ({ x: c.tx + box.x * c.s, y: c.ty + box.y * c.s, w: box.w * c.s, h: box.h * c.s });

/** The finder's box round a word's box on screen. */
export function finderBox(word: Box, pad: number): Box {
  return { x: word.x - pad, y: word.y - pad, w: word.w + 2 * pad, h: word.h + 2 * pad };
}

// ── The finder's track ────────────────────────────────────────────────────
// Its box at every scene's start and end (the word under the camera then).
// On a cut inside a run it re-acquires — a small autofocus pulse from a box
// FINDER_PULSE px wider back onto the word; on the first cut of a new run it
// TRAVELS from where the last word was to the new one, over FINDER_TRAVEL_MS
// on the house arrive curve (fast off the mark, so even a 225 ms cut is
// mostly spent ON its word, not on the way to it).
export const FINDER_PULSE = 12;
export const FINDER_PULSE_MS = 150;
export const FINDER_TRAVEL_MS = 150;

/** The finder's two looks (?finder=frame for the corners). The owner had the
 *  four-corner frame taken off the covers; the default is a READING RULE: a
 *  2 px lime line under the word, its ink width + 8 px, 6 px under the
 *  baseline — the slate's chalk underlines are the same gesture by hand. */
export type FinderLook = 'rule' | 'frame';
export function finderLookFrom(search: string): FinderLook {
  try {
    return new URLSearchParams(search).get('finder') === 'frame' ? 'frame' : 'rule';
  } catch {
    return 'rule';
  }
}
/** The rule under a finder box (a box of the word's cap box + `pad`): x, the
 *  top of its line, and its width. */
export const RULE_GAP = 6;
export const RULE_OVERHANG = 4;
export function ruleFor(box: Box, pad: number) {
  return { x: box.x + pad - RULE_OVERHANG, y: box.y + box.h - pad + RULE_GAP, w: Math.max(0, box.w - 2 * pad + 2 * RULE_OVERHANG) };
}
/** A box grown by `d` (and by `d * vy` up and down: a rule grows only
 *  sideways, `vy` 0). */
export const growBox = (b: Box, d: number, vy = 1): Box => ({ x: b.x - d, y: b.y - d * vy, w: b.w + 2 * d, h: b.h + 2 * d * vy });
/** A box scaled by `s` about the point (cx, cy). */
export const scaleBox = (b: Box, s: number, cx: number, cy: number): Box => ({ x: cx + (b.x - cx) * s, y: cy + (b.y - cy) * s, w: b.w * s, h: b.h * s });

export interface FinderKey {
  t: number;
  box: Box;
  /** The curve from this key to the next: 'arrive' (the pulse), 'travel'
   *  (the hunt), or 'linear' (the push). */
  ease: 'arrive' | 'travel' | 'linear';
}

/** `boxes[i]` = [box at the scene's start, box at its end]; the track starts
 *  at the code scene's own close (`from`). */
export function finderTrack(cuts: readonly Cut[], boxes: readonly (readonly [Box, Box])[], from: number, vy = 1): FinderKey[] {
  const keys: FinderKey[] = [];
  const mix = (a: Box, b: Box, k: number): Box => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });
  const grow = (b: Box, d: number) => growBox(b, d, vy);
  cuts.forEach((cut, i) => {
    const [a, b] = boxes[i];
    if (i === 0) {
      keys.push({ t: from, box: a, ease: 'linear' });
      keys.push({ t: cut.end, box: b, ease: 'linear' });
      return;
    }
    const span = Math.max(1, cut.end - cut.start);
    const settle = cut.runStart ? Math.min(FINDER_TRAVEL_MS, span * 0.7) : Math.min(FINDER_PULSE_MS, span * 0.5);
    const landed = mix(a, b, settle / span);
    if (cut.runStart) {
      const previous = keys[keys.length - 1].box;
      keys.push({ t: cut.start, box: previous, ease: 'travel' });
    } else {
      keys.push({ t: cut.start, box: grow(a, FINDER_PULSE), ease: 'arrive' });
    }
    keys.push({ t: cut.start + settle, box: landed, ease: 'linear' });
    keys.push({ t: cut.end, box: b, ease: 'linear' });
  });
  return keys;
}

/** The finder in the code scene, up to the lift's end: it comes up round the
 *  scrambling letters (their box at the rain's scale `k0`, grown by
 *  CODE_BEATS.search), closes on them as they lock, then RIDES the lift —
 *  sampled on the lift's own curve, so it never lags the word. `ink` is the
 *  locked word's box at full size, (cx, cy) the point it scales about. */
const liftCurve = bezierFn(LIFT_EASE);
export function codeFinderKeys(ink: Box, cx: number, cy: number, k0: number, pad: number, vy = 1, samples = 10): FinderKey[] {
  const at = (s: number) => finderBox(scaleBox(ink, s, cx, cy), pad);
  const [findA] = CODE_BEATS.finder;
  const [liftA, liftB] = CODE_BEATS.lift;
  const search = growBox(at(k0), CODE_BEATS.search, vy);
  const keys: FinderKey[] = [
    { t: 0, box: search, ease: 'linear' },
    { t: findA, box: search, ease: 'arrive' },
    { t: liftA, box: at(k0), ease: 'linear' },
  ];
  for (let i = 1; i <= samples; i += 1) {
    const u = i / samples;
    keys.push({ t: liftA + (liftB - liftA) * u, box: at(k0 + (1 - k0) * liftCurve(u)), ease: 'linear' });
  }
  return keys;
}

// ── Landing A: the words fly home ─────────────────────────────────────────
// Each found word leaves the clapperboard from its own box and lands on its
// own glyph box in the first screen (one continuous FLIP), a little after
// the one before; the clapperboard's typeface turns into Fraunces on the way.
// The two faces are held to ONE ink box the whole time — the same centre,
// the same cap height, and one shared width that goes from the board's ink
// width to the page's across `morph` — so the crossfade (one window, no blur)
// is a morph of letterforms, never a double image. The words leave on the
// clap itself (its jolt is beat enough). Landing ms.
export const LANDING_A = {
  /** The clapperboard dissolves into the page. */
  dissolve: [0, 420] as const,
  /** The finder and the film's furniture go. */
  furniture: [0, 220] as const,
  /** Word i leaves at `start + i * stagger`, and flies `fly` ms; the fall
   *  leads the slide (`yLead`: the vertical move is done by that share of
   *  the flight), so words that land lower drop clear of the ones above
   *  before they slide home — no word crosses another. */
  start: 0,
  stagger: 45,
  fly: 1000,
  yLead: 0.8,
  /** The shared ink width, board's → page's, as a share of the flight. */
  morph: [0.18, 0.62] as const,
  /** The crossfade (one window for both faces), as a share of the flight. */
  sourceOut: [0.4, 0.56] as const,
  targetIn: [0.4, 0.56] as const,
  /** The globe rises out of the dark behind the flying words. */
  globe: 380,
  /** The rest of the first screen (the line's other words, the kicker, the
   *  scroll cue, the nav last) comes up round the landed words. */
  rest: 900,
  done: 1500,
} as const;
export const FLY_ORDER = ['ryan', 'xu', 'archive', 'travel', 'thought'] as const;
export type FlyWord = (typeof FLY_ORDER)[number];

/** The landing curve: an ease-in-out with a soft arrival, quick enough off
 *  the clap that the board never sits frozen after it (15% of the way at
 *  200 ms). */
export const FLY_EASE = [0.38, 0, 0.2, 1] as const;

/** The two faces' horizontal scales across the morph: at every moment both
 *  have ink width lerp(srcW, dstW, p) — `srcW` the board face's ink width and
 *  `dstW` the page face's, both at the landed size. */
export function morphScales(srcW: number, dstW: number) {
  const s = Math.max(1e-6, srcW);
  const d = Math.max(1e-6, dstW);
  return { source: [1, d / s] as const, target: [s / d, 1] as const };
}

export interface Flight {
  /** Source centre minus target centre (px) and source/target scale. */
  dx: number;
  dy: number;
  k: number;
  delay: number;
  duration: number;
}
/** The FLIP from a word's box on the clapperboard to its glyph box on the
 *  first screen: sizes match on the cap height (`srcCap` / `dstCap`). */
export function flightFor(src: Box, dst: Box, srcCap: number, dstCap: number, order: number): Flight {
  return {
    dx: src.x + src.w / 2 - (dst.x + dst.w / 2),
    dy: src.y + src.h / 2 - (dst.y + dst.h / 2),
    k: srcCap / Math.max(1e-6, dstCap),
    delay: LANDING_A.start + order * LANDING_A.stagger,
    duration: LANDING_A.fly,
  };
}
/** A flight sampled into keyframes: the slide on the landing curve, the
 *  fall ahead of it (`yLead`), the scale with the slide. Offsets 0 → 1;
 *  (x, y) is the remaining offset from the landing place, `s` the scale. */
const flyCurve = bezierFn(FLY_EASE);
export function flightPath(f: Flight, samples = 24) {
  const out: { offset: number; x: number; y: number; s: number }[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    const ex = flyCurve(u);
    const ey = flyCurve(Math.min(1, u / LANDING_A.yLead));
    out.push({ offset: u, x: f.dx * (1 - ex), y: f.dy * (1 - ey), s: f.k + (1 - f.k) * ex });
  }
  return out;
}
export const landingAEnd = (words: number) => LANDING_A.start + Math.max(0, words - 1) * LANDING_A.stagger + LANDING_A.fly;

// ── Landing B: through the o ───────────────────────────────────────────────
// The camera pushes into the counter of the O in THOUGHT. The counter is a
// window onto the page from the first frame; the push is exponential in
// scale (every doubling takes the same time, so the dive neither lurches nor
// crawls) and eased in and out, and ends with the counter exactly on the
// Earth's disc (on a phone, where the first screen has no globe, on a circle
// just past the screen's corners: an iris out).
export const LANDING_B = {
  push: 980,
  /** The clapperboard itself fades out while the counter is this many times
   *  its own size (past it only the O's ring and the olive round it are
   *  left, drawn crisp at any scale): late enough that the push is seen
   *  going THROUGH the letters. */
  sheetFade: [6, 20] as const,
  /** The ring: a white-ink hairline from the first frame (not the O's
   *  stroke blown up), px. */
  ring: 2.5,
  /** The ground round the window: the page's own olive, so the dive never
   *  goes black. */
  ground: '#282c20',
  /** Then the olive round the globe lifts, the ring goes, the name rises. */
  surround: [960, 1480] as const,
  ringOut: [900, 1360] as const,
  rise: 900,
  done: 1560,
} as const;

/** The first screen's globe, in screen px: RouteAtlas places it (PROLOGUE_GLOBE
 *  centre 0.84 / 0.93 of the viewport, `cornerZoomFor` scaling its radius
 *  with the width); the radius was measured off the live planet at 1280–1920
 *  wide (0.380w → 0.366w). */
export function firstScreenGlobe(width: number, height: number) {
  const w = Math.max(1080, width);
  const ratio = 0.3797 - (w - 1280) * 2.22e-5;
  return { x: 0.84 * width, y: 0.93 * height, r: ratio * w };
}

/** Where the portal lands: the globe's disc on the desktop, a circle past the
 *  screen's corners on a phone. */
export function portalTarget(width: number, height: number, phone: boolean) {
  if (phone) return { x: width / 2, y: height / 2, r: Math.hypot(width, height) / 2 + 24 };
  return firstScreenGlobe(width, height);
}

export interface Portal {
  x: number;
  y: number;
  /** The counter's radius (the window) and the scale on everything else. */
  r: number;
  zoom: number;
}
/** The portal at push progress `u` (0 → 1) from the counter (centre `c0`,
 *  radius `r0`) to the target circle. */
export function portalAt(u: number, c0: Vec2, r0: number, target: { x: number; y: number; r: number }): Portal {
  const e = easeInOutCubic(u);
  const zoom = Math.exp(Math.log(target.r / Math.max(1e-6, r0)) * e);
  // The centre travels so that the counter's centre is on the straight line
  // from where it was to where it lands, in step with the zoom's own share
  // (a zoom about a moving point: the page does not slide under the window).
  const k = zoom <= 1.0001 ? 0 : (zoom - 1) / (target.r / Math.max(1e-6, r0) - 1);
  return { x: lerp(c0[0], target.x, k), y: lerp(c0[1], target.y, k), r: r0 * zoom, zoom };
}

// ── Reduced motion ─────────────────────────────────────────────────────────
// No montage: the clapperboard is shown still, then the page crossfades in.
export const STILL = { hold: 1100, fade: 700 } as const;

// ── Landing choice ─────────────────────────────────────────────────────────
export type Landing = 'a' | 'b';
export function landingFrom(search: string): Landing {
  try {
    return new URLSearchParams(search).get('open') === 'b' ? 'b' : 'a';
  } catch {
    return 'a';
  }
}

// ── Deterministic material ────────────────────────────────────────────────
// The code rain and the scrambles are drawn by the server and the client
// alike, so they come from a seeded generator (the same markup both sides).

export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The rain's vocabulary: the archive's own jargon — exposure, film and
 *  place readouts — read down the columns a character at a time. */
export const RAIN_TOKENS = [
  'ISO400', 'F/2.8', '1/125', '35MM', '50MM', 'EV+0.3', 'ROLL07', 'FRAME24A', 'LAT25.76N', 'LNG80.19W', 'RAW', 'TAKE3',
  'REEL01', 'SCN12', 'INDEX', 'F/8', '1/500', 'ISO800', '28MM', 'SYNC', 'FPS24', '36EXP', 'N40.71', 'W74.00', 'ZION',
  'PAGE', '0x2F', 'A7', 'DUST', 'GRAIN', 'LENS', 'KEEP', 'STOP', 'FILE', 'SHOT', 'LIGHT', '00:04:12', 'Ø', '▸', '·',
] as const;
const RAIN_EXTRA = '0123456789ABCDEFXZ:/.·+-';

export interface RainColumn {
  /** Column offset from the focus column (in pitches). */
  i: number;
  text: string;
  /** Fall duration and phase, s. */
  fall: number;
  phase: number;
  /** Relative length (the tail). */
  len: number;
}

export const RAIN_COLUMNS = 141;
export function rainColumns(seed = 7): RainColumn[] {
  const rand = seeded(seed);
  const out: RainColumn[] = [];
  const half = (RAIN_COLUMNS - 1) / 2;
  for (let c = 0; c < RAIN_COLUMNS; c += 1) {
    const len = 12 + Math.floor(rand() * 20);
    let text = '';
    while (text.length < len) {
      if (rand() < 0.62) text += RAIN_TOKENS[Math.floor(rand() * RAIN_TOKENS.length)];
      else text += RAIN_EXTRA[Math.floor(rand() * RAIN_EXTRA.length)];
    }
    text = text.slice(0, len);
    out.push({ i: c - half, text, fall: 2.2 + rand() * 3.4, phase: rand(), len });
  }
  return out;
}

/** Each locked letter scrambles through these before it lands. */
export function scrambleStrip(letter: string, index: number, count = 7) {
  const rand = seeded(101 + index * 17);
  let strip = '';
  for (let k = 0; k < count; k += 1) strip += RAIN_EXTRA[Math.floor(rand() * RAIN_EXTRA.length)];
  return strip + letter;
}

// ── His photographs in the film ───────────────────────────────────────────
// The magazine's picture page and the strip of film carry his own frames
// (a photographer's archive should not open without one photograph): the
// first landscape frame of each chapter, in the order given, at a size the
// scene needs (a plate on the magazine page, 640 px; a 35 mm frame, 800 px)
// from the Sanity CDN at a modest quality. Each keeps its own ratio; frames
// far from 3:2 are passed over (a frame of film is landscape).
export interface PictureSource {
  imageUrl?: string | null;
  width?: number | null;
  height?: number | null;
}
export const PICTURE_RATIO = [1.3, 1.7] as const;
export function pickPictures(groups: readonly { photos?: readonly PictureSource[] | null }[], count = 4) {
  const usable = (p: PictureSource) => {
    if (!p.imageUrl || !p.width || !p.height) return false;
    const r = p.width / p.height;
    return r >= PICTURE_RATIO[0] && r <= PICTURE_RATIO[1];
  };
  const chosen: PictureSource[] = [];
  // One per chapter first, then (if there are fewer chapters than frames) a
  // second round.
  for (let round = 0; chosen.length < count && round < 3; round += 1) {
    for (const group of groups) {
      if (chosen.length >= count) break;
      const pick = (group.photos ?? []).filter(usable)[round];
      if (pick && !chosen.includes(pick)) chosen.push(pick);
    }
  }
  return chosen.map((p, i) => {
    const w = i === 0 ? 640 : 800;
    const sep = p.imageUrl!.includes('?') ? '&' : '?';
    return { src: `${p.imageUrl}${sep}w=${w}&q=60&auto=format`, ratio: Math.round((p.width! / p.height!) * 10000) / 10000 };
  });
}
