// ── The opening film: a word hunt through many texts ──
// The homepage opens on a short film (src/components/home/OpeningFilm.tsx,
// its scenes in OpeningScenes.tsx, its materials in src/styles/opening.css).
// A camera hunts through one kind of text after another — code falling down
// a screen, a dictionary, a black-and-white newspaper, the engraved top plate
// of a camera, the rings of a lens, a frame cut into slices of six materials,
// a departure board, a book, a photocopied telegram, a letterpress poster, the edge of a strip of film on a contact sheet — and in
// every one it FINDS the same words: ARCHIVE, CAMERA, TRAVEL, THOUGHT, RYAN
// XU. It ends on a clapperboard that carries them all, and the clap hands
// over to the first screen.
//
// What holds it together is the MATCH CUT: while the camera hunts one word,
// the word keeps its place and its size on the screen across every cut —
// only the world round it changes (the material, the typeface, the depth) —
// and a thin lime reading rule, the one lime on screen, locks on under it
// like autofocus (?finder=frame swaps it for four viewfinder corners).
//
// What gives it punch is the ENTRANCE: every shot cuts in hard, on a beat,
// with one short kinetic move — a snap zoom, a whip pan smeared by ghosts of
// the sheet, a 3D swing of the text plane, a two-gear speed ramp, a
// typewriter carriage slamming home, a lens ring turning, slices slamming
// together — and then HOLDS dead still to be read. The finder waits, wide and
// dim, while the shot moves, and locks on when it lands.
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
// before the first paint. While it plays, ONLY the Skip pill skips it (to
// the clapperboard and a hurried landing — never a hard cut to the page); a
// wheel, a touch, a key or a click anywhere else does nothing at all (the
// page's scroll is held). Reduced motion gets the clapperboard as a still and
// a calm crossfade.
//
// Everything in this module is pure (no DOM), so scripts/opening-film.test.mjs
// holds the schedule, the entrances, the skip, the camera, the landing and
// the portal to account offline.

import { EASE, bezierFn, type Bezier } from './motion';

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

export type FoundWord = 'archive' | 'camera' | 'travel' | 'thought' | 'ryanxu';
export type SceneId =
  | 'code'
  | 'dictionary'
  | 'newspaper'
  | 'topplate'
  | 'lens'
  | 'slices'
  | 'board'
  | 'book'
  | 'typewriter'
  | 'poster'
  | 'contact'
  | 'slate';

export interface ScenePlan {
  id: SceneId;
  /** The word the camera finds in it. Consecutive scenes on one word are a
   *  RUN: the word holds its place and size across their cuts. */
  word: FoundWord;
  /** How long the scene is on screen, ms (a whole number of beats). */
  ms: number;
}

/** The film cuts on a beat: every scene is a whole number of these (an
 *  eighth of a second: 120 bpm in sixteenths). */
export const BEAT_MS = 125;

// Desktop: twelve scenes, 8.5 s to the clap (he reviews by reloading, so he
// sits through it every time — the Skip pill is there). The code holds while
// ARCHIVE locks and lifts off it and cuts on its landing (the match cut
// carries the hold into the dictionary); from there most shots are five
// beats, and the bigger reads six — the two camera objects (their moves are
// bigger), the slices (six materials, one letter each) and the poster (the
// one full sentence): every shot, once it has landed, HOLDS for about 1.3×
// the reading time the last cut's shots had, and the lengths vary (no
// metronome) (scripts/opening-film.test.mjs); the clapperboard then holds
// long enough to be read, and claps.
//
// The order is also a GRADE: dark code, light archive paper, the dark metal
// and board of the camera and travel runs, light paper and print, then the
// dark film into the olive page — four changes of tone, never two in one
// second (a calm site: no black-white strobe).
export const FILM_DESKTOP: readonly ScenePlan[] = [
  { id: 'code', word: 'archive', ms: 875 },
  { id: 'dictionary', word: 'archive', ms: 625 },
  { id: 'newspaper', word: 'archive', ms: 625 },
  { id: 'topplate', word: 'camera', ms: 750 },
  { id: 'lens', word: 'camera', ms: 750 },
  { id: 'slices', word: 'camera', ms: 750 },
  { id: 'board', word: 'travel', ms: 625 },
  { id: 'book', word: 'travel', ms: 625 },
  { id: 'typewriter', word: 'thought', ms: 625 },
  { id: 'poster', word: 'thought', ms: 750 },
  { id: 'contact', word: 'ryanxu', ms: 625 },
  { id: 'slate', word: 'ryanxu', ms: 875 },
];

// Phone: the same film, fewer scenes (nine, 6.5 s to the clap) — both camera
// objects kept (he judges on his phone: the word is CAMERA).
export const FILM_PHONE: readonly ScenePlan[] = [
  { id: 'code', word: 'archive', ms: 875 },
  { id: 'dictionary', word: 'archive', ms: 625 },
  { id: 'topplate', word: 'camera', ms: 750 },
  { id: 'lens', word: 'camera', ms: 750 },
  { id: 'slices', word: 'camera', ms: 750 },
  { id: 'board', word: 'travel', ms: 625 },
  { id: 'typewriter', word: 'thought', ms: 625 },
  { id: 'contact', word: 'ryanxu', ms: 625 },
  { id: 'slate', word: 'ryanxu', ms: 875 },
];

// How each scene reads on screen, light or dark: the cut rhythm must never
// strobe (scripts/opening-film.test.mjs: at most three light/dark changes in
// any one second, under the general flash threshold; on the desktop at most
// one, four in all).
export const SCENE_TONE: Record<SceneId, 'light' | 'dark'> = {
  code: 'dark',
  dictionary: 'light',
  newspaper: 'light',
  topplate: 'dark',
  lens: 'dark',
  slices: 'dark',
  board: 'dark',
  book: 'light',
  typewriter: 'light',
  poster: 'light',
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

// ── The entrances: how each shot cuts in ──────────────────────────────────
// Every cut is hard (the last frame of one scene, then the first of the
// next: no crossfade, no blur-in) and the new shot arrives with ONE short
// move, then holds. The move is a transform on the sheet ABOUT THE FOUND WORD
// (so it lands exactly where the match cut wants it): an offset (a whip pan
// or a carriage slam, a share of the viewport), a tilt of the text plane in
// depth (a swing, deg), a scale (a snap zoom or a speed ramp). All of it goes
// to rest at `ms`; `read` is when the word can be read (the finder locks on
// then), at the landing — or, for a speed ramp, as it shifts into its slow
// gear. Some scenes also have their own life on the beat (the dial spins, the
// lens ring turns, the slices slam, the flaps fall, the typebars strike);
// `read` waits for that too.

export type EntranceKind = 'cut' | 'snap' | 'whip' | 'swing' | 'ramp' | 'slam' | 'rise';
export interface Entrance {
  kind: EntranceKind;
  /** The move lands at this many ms after the cut. */
  ms: number;
  /** The finder locks on at this many ms after the cut. */
  read: number;
  /** Where the move starts (it always ends at rest). */
  x?: number;
  y?: number;
  rx?: number;
  ry?: number;
  k?: number;
  ease: Bezier;
  /** A two-gear move: the first `gear[0]` of the time covers `gear[1]` of
   *  the distance on `ease` (fast), the rest is one slow linear gear. */
  gear?: readonly [number, number];
}

/** A snap: a hard start and a hard stop (1.14 → 1 in ~150 ms). */
export const SNAP_EASE = [0.1, 0.75, 0.12, 1] as const;
/** A whip: all speed, braked at the very end. */
export const WHIP_EASE = [0.3, 0.65, 0.08, 1] as const;
/** A speed ramp: fast for a few frames, then a long slow read. */
export const RAMP_EASE = [0.16, 0.66, 0.1, 1] as const;
/** A swing of the text plane: turning for long enough to be seen, then it
 *  lands and locks (no overshoot). */
export const SWING_EASE = [0.32, 0.62, 0.16, 1] as const;

export const ENTRANCES: Record<SceneId, Entrance> = {
  // The first paint; its own beats (the lock, the lift) are CODE_BEATS.
  code: { kind: 'cut', ms: 0, read: 0, ease: EASE.arrive },
  dictionary: { kind: 'snap', ms: 160, read: 160, k: 1.16, ease: SNAP_EASE },
  newspaper: { kind: 'whip', ms: 120, read: 140, x: 0.72, ease: WHIP_EASE },
  topplate: { kind: 'swing', ms: 290, read: 290, rx: 68, k: 1.06, ease: SWING_EASE },
  lens: { kind: 'snap', ms: 150, read: 270, k: 1.08, ease: SNAP_EASE },
  slices: { kind: 'cut', ms: 0, read: 190, ease: EASE.arrive },
  board: { kind: 'whip', ms: 120, read: 200, x: -0.72, ease: WHIP_EASE },
  // Two gears: 1.7 → 1.06 in 90 ms, then 1.06 → 1 over 260 ms, linear (the
  // finder locks as it shifts into the slow gear, on a word all but still).
  book: { kind: 'ramp', ms: 350, read: 110, k: 1.7, gear: [90 / 350, 0.64 / 0.7], ease: SNAP_EASE },
  // The carriage slams home; the typebars strike THOUGHT (TYPE_STRIKE).
  typewriter: { kind: 'slam', ms: 110, read: 190, x: 0.1, ease: WHIP_EASE },
  poster: { kind: 'snap', ms: 150, read: 150, k: 1.2, ease: SNAP_EASE },
  contact: { kind: 'whip', ms: 120, read: 140, x: 0.72, ease: WHIP_EASE },
  slate: { kind: 'rise', ms: 250, read: 250, y: 0.62, rx: -14, ease: SWING_EASE },
};

/** The move at progress u (0 → 1 over its `ms`, on its curve): the offset
 *  (px), the tilt (deg) and the scale. At u = 1 it is at rest. */
export interface EntranceState {
  x: number;
  y: number;
  rx: number;
  ry: number;
  k: number;
}
export const REST: EntranceState = { x: 0, y: 0, rx: 0, ry: 0, k: 1 };
const curves = new Map<Entrance, (x: number) => number>();
/** How much of the move is still to go at progress u (1 → 0). */
export function entranceLeft(e: Entrance, u: number) {
  if (e.ms <= 0 || u >= 1) return 0;
  let curve = curves.get(e);
  if (!curve) {
    curve = bezierFn(e.ease);
    curves.set(e, curve);
  }
  const v = clamp01(u);
  if (e.gear) {
    const [g0, g1] = e.gear;
    if (v < g0) return 1 - g1 * curve(v / g0);
    return (1 - g1) * (1 - (v - g0) / (1 - g0));
  }
  return 1 - curve(v);
}
export function entranceAt(e: Entrance, u: number, width: number, height: number): EntranceState {
  if (e.ms <= 0 || u >= 1) return REST;
  const left = entranceLeft(e, u);
  return {
    x: (e.x ?? 0) * width * left,
    y: (e.y ?? 0) * height * left,
    rx: (e.rx ?? 0) * left,
    ry: (e.ry ?? 0) * left,
    k: 1 + ((e.k ?? 1) - 1) * left,
  };
}

/** How many samples an entrance is drawn with (linear between them: about
 *  one a frame, so the curve is the entrance's own). */
export const ENTRANCE_SAMPLES = 10;
/** The progress points an entrance is sampled at: evenly, or — for a
 *  two-gear move — densely through its fast gear (the curve is there) and
 *  once at the end of the slow one (a straight line needs no more). */
export function entranceSamples(e: Entrance): number[] {
  if (e.ms <= 0) return [];
  if (e.gear) {
    const out: number[] = [];
    for (let k = 0; k <= ENTRANCE_SAMPLES; k += 1) out.push((e.gear[0] * k) / ENTRANCE_SAMPLES);
    out.push(1);
    return out;
  }
  return Array.from({ length: ENTRANCE_SAMPLES + 1 }, (_, k) => k / ENTRANCE_SAMPLES);
}

/** The sheet's transform: the entrance about the found word's resting place
 *  `f` (a whip's offset, a tilt, a scale), on top of the camera. One shape of
 *  function list for every keyframe of a shot, so they interpolate term by
 *  term; the tilt terms only for a shot that turns in `depth` (a flat list
 *  keeps a flat shot flat for the compositor). */
export function sheetTransform(c: Camera, e: EntranceState, f: Vec2, depth = true) {
  const n = (v: number, d = 2) => v.toFixed(d);
  const tilt = depth ? ` rotateX(${n(e.rx, 3)}deg) rotateY(${n(e.ry, 3)}deg)` : '';
  return (
    `translate(${n(e.x)}px, ${n(e.y)}px) ` +
    `translate(${n(f[0])}px, ${n(f[1])}px)${tilt} scale(${n(e.k, 5)}) ` +
    `translate(${n(-f[0])}px, ${n(-f[1])}px) ` +
    `translate(${n(c.tx)}px, ${n(c.ty)}px) scale(${n(c.s, 5)})`
  );
}

/** The motion blur of a whip: GHOSTS of the sheet itself, trailing it (on
 *  the side it came from) by a share of the viewport's width at the cut,
 *  fainter as they fall back — the content smears, as a real whip smears
 *  it, instead of a plate of streaks laid over the frame. Their lag closes
 *  with the move (entranceLeft: a smear as long as the sheet is fast); their
 *  strength is full for the first GHOST_HOLD_MS, then fades, gone as it
 *  lands. */
export const WHIP_GHOSTS = [
  { lag: 0.04, opacity: 0.35 },
  { lag: 0.08, opacity: 0.2 },
  { lag: 0.12, opacity: 0.1 },
] as const;
export const GHOST_HOLD_MS = 80;
/** The ghosts' strength (their opacity, 1 → 0) at progress u of a whip
 *  lasting `ms`. */
export function ghostAt(u: number, ms: number) {
  if (u >= 1 || ms <= 0) return 0;
  const t = clamp01(u) * ms;
  if (t <= GHOST_HOLD_MS) return 1;
  return clamp01(1 - (t - GHOST_HOLD_MS) / Math.max(1, ms - GHOST_HOLD_MS));
}

// ── The typewriter's strike ───────────────────────────────────────────────
// As the carriage slams home, the typebars strike THOUGHT a letter at a
// time: each letter appears at `at + i * stagger` ms after the cut, a size too
// big (`k`), and is pressed flat in `ms` (two frames).
export const TYPE_STRIKE = { at: 20, stagger: 22, ms: 33, k: 1.3 } as const;

// ── The code scene (scene 1) ──────────────────────────────────────────────
// Its beats are CSS from the first paint (the rain falls, the letters of
// ARCHIVE scramble and lock one by one — opening.css writes these same
// numbers into of-scramble / of-lock-on) and WAAPI once the island is up
// (the word jumps off the rain toward the lens, the rain dims, the finder
// rides it). Film ms. The finder is there early: it comes up round the
// scrambling letters at `finder[0]`, closes on them, and rides the lift until
// it is on the word at full size at `finder[1]` — the first second is a hunt,
// not generic rain.
export const CODE_BEATS = {
  /** Letter i starts to scramble at `scramble + i * stagger`… */
  scramble: 140,
  stagger: 55,
  /** …and locks `lockAfter` later. */
  lockAfter: 220,
  /** The locked word jumps off the rain (scale k0 → 1). */
  lift: [560, 820] as const,
  /** The rain dims behind it. */
  dim: [540, 760] as const,
  /** The finder: in round the scrambling cells, then on the word at full
   *  size (the lift's end). */
  finder: [220, 820] as const,
  /** How far outside the scrambling cells the finder first comes up, px. */
  search: 46,
} as const;
/** The lift's curve: off the mark at once, braked hard (a snap toward the
 *  lens, not a float); the finder rides it. */
export const LIFT_EASE = [0.2, 0.7, 0.1, 1] as const;
/** The rain's own dimmed strength once ARCHIVE has lifted off it. */
export const RAIN_DIM = 0.3;

// ── The slate's beats (ms from the slate's cut) ───────────────────────────
// It is lifted into the frame (its entrance), then every found word is
// chalked in turn — a ring round CAMERA first (its field label), then a line
// under ARCHIVE, TRAVEL and THOUGHT — and the sticks come down at the end
// (the clap): the landing starts on the clap.
export function slateBeats(slateMs: number) {
  const from = ENTRANCES.slate.read;
  return {
    ring: from,
    ringMs: 130,
    underline: [from + 90, from + 180, from + 270] as const,
    underlineMs: 150,
    /** The sticks close: an ease-in fall, contact at `slateMs`. */
    clap: [slateMs - 130, slateMs] as const,
  };
}

// ── Input: only the Skip pill ─────────────────────────────────────────────
// While the film plays, the reader's wheel, touch, keys and clicks do
// nothing: the page's scroll is held (a stylesheet lock on the body that
// nothing else on the page can lift, html[data-film-lock]; a wheel, a drag, a
// scrolling key — with or without Cmd, Ctrl, Alt — is swallowed), the page
// under the film is inert (no focus, no find-in-page), and nothing else
// happens. The Skip pill (bottom right, a real button: Tab reaches it and
// stays on it, Enter and Space press it) is the one way out.
export type FilmInput = 'skip' | 'wheel' | 'touch' | 'key' | 'pointer';
export const INPUT_POLICY: Record<FilmInput, 'skip' | 'hold' | 'ignore'> = {
  skip: 'skip',
  wheel: 'hold',
  touch: 'hold',
  key: 'hold',
  pointer: 'ignore',
};

// ── Skip ───────────────────────────────────────────────────────────────────
// The Skip pill takes the film to the clapperboard with FF_TAIL ms of it
// left (the words already chalked under, the sticks about to fall), then the
// landing plays HURRIED (the reader asked to hurry: every landing beat at
// FF_RATE). Never a hard cut to the page, never back, and nothing once the
// clap has come.
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
// done — under the film — before the landing shows the globe. A skip lets go
// at once.
export const GLOBE_LEAD_MS = 2900;
export const globeReleaseAt = (cuts: readonly Cut[]) => Math.max(0, filmLength(cuts) - GLOBE_LEAD_MS);
/** At the clap the landing waits at most this long for the globe's tiles. */
export const GLOBE_WAIT_MS = 700;

// ── The camera ─────────────────────────────────────────────────────────────
// Every scene is a SHEET designed at the desktop's scale (a found word's
// cap height is about 64 px there) and a camera: a uniform scale and a
// translation that put the found word's centre on the run's focus point with
// the run's cap height. Once a shot has landed it is DEAD STILL (no push, no
// drift: a creeping hold reads soft). The cap height is the code scene's
// locked word, measured (its size is the one CSS rule both agree on), so the
// dictionary's headword takes over from it exactly.

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
  camera: { desktop: [0.47, 0.44], phone: [0.5, 0.4] },
  travel: { desktop: [0.55, 0.52], phone: [0.5, 0.5] },
  thought: { desktop: [0.46, 0.56], phone: [0.5, 0.54] },
  ryanxu: { desktop: [0.4, 0.36], phone: [0.5, 0.34] },
};
/** How far a run's camera pushes in (scale) and drifts (share of the
 *  viewport) from its first scene to its last: not at all — after every hit
 *  the shot holds dead still (the owner: the cuts must not feel soft). The
 *  machinery stays for a later cut that wants a push. */
export const RUN_PUSH = 0;
export const RUN_DRIFT: Vec2 = [0, 0];

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
// While a shot makes its entrance the finder SEARCHES: on a cut inside a run
// it opens FINDER_PULSE px wider than the word and waits there, dim; on the
// first cut of a new run it travels from where the last word was to the new
// one, arriving as the word lands. When the word can be read (the
// entrance's `read`) it LOCKS ON — onto the word in FINDER_SNAP_MS, on the
// house arrive curve, at full strength.
export const FINDER_PULSE = 22;
export const FINDER_SNAP_MS = 90;
export const FINDER_TRAVEL_MS = 150;
/** The finder's strength while it searches (it is full once locked). */
export const FINDER_SEARCH_OPACITY = 0.42;

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
  /** The curve from this key to the next: 'arrive' (the lock), 'travel'
   *  (the hunt), 'hold' (waiting, wide) or 'linear' (the push). */
  ease: 'arrive' | 'travel' | 'hold' | 'linear';
}

/** When the finder locks on in cut `i`: the entrance's `read`, inside the
 *  shot (never later than 60% of it). */
export function lockAt(cut: Cut) {
  const e = ENTRANCES[cut.id];
  return cut.start + Math.min(e.read, cut.ms * 0.6);
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
    const at = (t: number) => mix(a, b, clamp01((t - cut.start) / span));
    const lock = lockAt(cut);
    if (cut.runStart) {
      // The hunt: from the last word to this one, landing with the shot.
      const previous = keys[keys.length - 1].box;
      const arrive = Math.min(cut.end - 1, Math.max(lock, cut.start + FINDER_TRAVEL_MS));
      keys.push({ t: cut.start, box: previous, ease: 'travel' });
      keys.push({ t: arrive, box: at(arrive), ease: 'linear' });
    } else {
      // Searching, wide, while the shot moves; then the lock.
      const snapped = Math.min(cut.end - 1, lock + FINDER_SNAP_MS);
      keys.push({ t: cut.start, box: grow(a, FINDER_PULSE), ease: 'hold' });
      keys.push({ t: lock, box: grow(at(lock), FINDER_PULSE), ease: 'arrive' });
      keys.push({ t: snapped, box: at(snapped), ease: 'linear' });
    }
    keys.push({ t: cut.end, box: b, ease: 'linear' });
  });
  return keys;
}

/** The finder's strength: full, then dim from each cut (a step on the
 *  frame) until the shot can be read, then full again as it locks on. */
export function finderStrength(cuts: readonly Cut[]) {
  const keys: { t: number; o: number }[] = [];
  cuts.forEach((cut, i) => {
    if (i === 0) return;
    const lock = lockAt(cut);
    if (lock <= cut.start) return;
    keys.push(
      { t: cut.start, o: 1 },
      { t: cut.start, o: FINDER_SEARCH_OPACITY },
      { t: lock, o: FINDER_SEARCH_OPACITY },
      { t: Math.min(cut.end, lock + FINDER_SNAP_MS * 0.5), o: 1 },
    );
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

// ── A scene's own life: kicks ─────────────────────────────────────────────
// Inside a shot, things move on the beat too: the dial spins and clicks, the
// lens ring turns its word to the front, the slices slam together, the flaps
// fall. A scene marks each with data-kick (OpeningScenes.tsx): a transform
// it comes FROM (to its resting one), when (ms after the cut), for how long,
// and on which curve — the island plays it on the film's one clock.
export const KICK_EASES = {
  lock: EASE.arrive,
  snap: SNAP_EASE,
  whip: WHIP_EASE,
  fall: EASE.leave,
} as const satisfies Record<string, Bezier>;
export type KickEase = keyof typeof KICK_EASES;

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
  'ISO400', 'F/2.8', '1/125', '35MM', '50MM', 'EV+0.3', 'ROLL07', 'FRAME24A', 'LAT25.76N', 'LNG80.19W', 'RAW', 'EXP36',
  'ROLL01', 'FR12', 'INDEX', 'F/8', '1/500', 'ISO800', '28MM', 'AE-L', 'F/16', '36EXP', 'N40.71', 'W74.00', 'ZION',
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
// The newspaper's halftone and the contact sheet carry his own frames (a
// photographer's archive should not open without one photograph), both in
// black and white: the first landscape frame of each chapter, in the order
// given, at a size the scene needs (the newspaper's picture, 640 px; a 35 mm
// frame, 800 px) from the Sanity CDN at a modest quality. Each keeps its own
// ratio; frames far from 3:2 are passed over (a frame of film is landscape).
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
