// ── The opening film: a retro editorial type film ──
// The homepage opens on a short film (src/components/home/OpeningFilm.tsx,
// its scenes in OpeningScenes.tsx, its materials in src/styles/opening.css).
// The owner's spec (2026-09-28, "复古编辑部动态排版"), in six acts:
//
//   1. A typewriter relay: "an archive of travel" is typed, and every three
//      beats the MATERIAL is cut under it — a dark CRT, a phosphor dot
//      matrix, typewriter paper, a photocopied black strip — while the typed
//      letters and the cursor never move.
//   2. The word is found: a lime marker sweeps over "archive"; the rest of
//      the line is pushed away and the word glides to the middle of the
//      frame, growing to the anchor's size and turning from the typewriter's
//      face into Fraunces on the way (both faces held to one ink box).
//   3. Match cuts round a fixed lime anchor: eight cuts of two beats; in
//      every one the block's centre, its height and the word's cap height
//      are the same — only the word and its face change — while the
//      editorial page round it is recomposed each cut (giant cropped
//      Fraunces words drifting in one direction, with a motion blur of
//      pre-drawn copies; small labels, a ringed word, grey texture, meta).
//   4. A film burn, stepped at 24 fps: flicker, scratches and gate weave, a
//      frame slip, a burn spreading from the anchor on an fbm mask (a WebGL
//      shader on its own canvas), the frame darkening and sliding out at 6°,
//      two black frames, six leader cards one frame each, and a row of lit
//      sprocket holes that carries the picture into the dark.
//   5. The dark: "ryan xu" is typed on the film's base, with a lime block
//      cursor (the act's one lime) that blinks once more when done.
//   6. The end title: that line turns into "Ryan Xu" in Fraunces, with
//      CAMERA · ARCHIVE · TRAVEL · THOUGHT under it, and YOU.
//
// Then it lands (landing A, "words fly home"): the dark dissolves into the
// first screen and RYAN, XU, CAMERA, ARCHIVE, TRAVEL, THOUGHT (and YOU, when
// the page has a place for it) fly into their places in the entrance's
// opening words (src/components/home/EntranceIntro.tsx), their face turning
// into the page's on the way.
//
// Smooth, by the spec's definition: hard cuts fall on the beat (BEAT_MS);
// the anchor never moves; the drift runs on across a cut (the same way or a
// quarter turn); no fallback face, no blank frame, no dropped frame at a
// cut (the fonts are loaded before the clock starts, and everything is
// transform and opacity on one clock).
//
// It plays once a tab session (src/lib/reelVisit.ts). While it plays, ONLY
// the Skip pill skips it (to the end title and a hurried landing — never a
// hard cut to the page); a wheel, a touch, a key or a click anywhere else
// does nothing at all (the page's scroll is held). Reduced motion gets the
// end title as a still and a calm crossfade.
//
// Everything in this module is pure (no DOM): the whole film is DATA here —
// the acts, the cuts, every cut's composition, the burn's frames — and the
// island only samples it by time. scripts/opening-film.test.mjs holds it to
// account offline.

import { bezierFn, type Bezier } from './motion';

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 → 1 across [a, b], linear, clamped. */
export const segment = (value: number, a: number, b: number) => clamp01((value - a) / (b - a));

// ── What the film tells the page ─────────────────────────────────────────
// The film is its own island, above HomePage's. It says whether it covers
// the first screen ('film'), is landing on it ('landing'), or has handed the
// page over ('page'), and whether the globe may start to come up behind it.
// (The page no longer waits on that last word: the globe is not on the first
// screen, and it comes in when the entrance's boarding pass is torn.) The
// last word is kept on window.__archiveOpening for anyone who starts
// listening late.

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
  }
}

// ── The clock ──────────────────────────────────────────────────────────────
/** Every hard cut falls on this beat (an eighth of a second: 120 bpm in
 *  sixteenths). */
export const BEAT_MS = 125;
/** The burn is stepped at 24 fps: three frames to a beat. */
export const FRAME24_MS = BEAT_MS / 3;
/** Below this width the page is the compact tree (HomePage's `lg`). */
export const PHONE_MAX_WIDTH = 1023;

export type FilmLayout = 'desktop' | 'phone';
export type Tone = 'light' | 'dark';
export type Vec2 = readonly [number, number];
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Span {
  start: number;
  end: number;
}

/** How long each act is, in beats. The desktop runs 55 beats (6.875 s) to
 *  the landing and lands in 0.6 s (7.475 s); the phone 48 (6.0 s, landed at
 *  6.6 s): one material and two cuts fewer. */
export const ACT_BEATS = {
  /** Act 1: the cursor alone, then one material every three beats. */
  idle: 2,
  material: 3,
  /** Act 2: the marker and the glide. */
  find: 4,
  /** Act 3: every cut two beats. */
  cut: 2,
  /** Act 4: 24 frames at 24 fps. */
  burn: 8,
  /** Act 5: the dark, typed. */
  dark: 8,
  /** Act 6: the end title. */
  title: 5,
} as const;

// ── Act 1: the typewriter relay ───────────────────────────────────────────

/** The typed line, lower case, and where its found word sits in it. */
export const TYPED = 'an archive of travel';
export const FOUND_RANGE = [3, 10] as const;
export const FOUND_WORD = TYPED.slice(FOUND_RANGE[0], FOUND_RANGE[1]);

/** The materials, cut every three beats under the unmoving letters. The
 *  phone keeps three. Dark, dark, light, light: one change of tone. */
export type MaterialId = 'crt' | 'phosphor' | 'paper' | 'copy';
export const MATERIALS: Record<FilmLayout, readonly MaterialId[]> = {
  desktop: ['crt', 'phosphor', 'paper', 'copy'],
  phone: ['crt', 'paper', 'copy'],
};
export const MATERIAL_TONE: Record<MaterialId, Tone> = {
  crt: 'dark',
  phosphor: 'dark',
  paper: 'light',
  copy: 'light',
};
/** The cursor's blink period (steps, half on and half off). */
export const CURSOR_MS = 530;
/** About fourteen characters a second, each ±25 ms. */
export const TYPE_CPS = 14;
export const TYPE_JITTER_MS = 25;
/** The typed line is complete this long before the marker comes. */
export const TYPE_TAIL_MS = 90;

/** When each character of `text` appears: from `start`, about `cps` a
 *  second (faster if it must, to be done by `end`), each nudged by a seeded
 *  jitter of up to ±`jitter` ms (never so far that two swap). */
export function typeTimes(text: string, start: number, end: number, cps: number, jitter: number, seed: number) {
  const n = text.length;
  const interval = Math.min(1000 / cps, (end - start) / Math.max(1, n));
  const j = Math.min(jitter, interval * 0.4);
  const rand = seeded(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const nudge = i === 0 ? 0 : (rand() * 2 - 1) * j;
    out.push(Math.round(start + i * interval + nudge));
  }
  return out;
}

/** How each typed character of the paper looks: its ribbon strength (0.75–1)
 *  and how far it was struck off true (±0.5 px). Seeded: the server and the
 *  client draw the same page. */
export function ribbon(text: string, seed = 23) {
  const rand = seeded(seed);
  return text.split('').map(() => ({
    ink: Math.round((0.75 + rand() * 0.25) * 100) / 100,
    dx: Math.round((rand() - 0.5) * 100) / 100,
    dy: Math.round((rand() - 0.5) * 100) / 100,
  }));
}

// ── Act 2: the word is found ──────────────────────────────────────────────
/** A curve that is off the mark at once and settles long (the spec's). */
export const GLIDE_EASE = [0.2, 0.7, 0.1, 1] as const;
export const FIND = {
  /** The lime marker sweeps the word, left to right. */
  sweepMs: 150,
  /** The glide starts one beat in and ends with the act. */
  glideAt: BEAT_MS,
  /** The two faces cross in this share of the glide (one window). */
  swap: [0.3, 0.62] as const,
  /** The shared ink width goes from the typewriter's to Fraunces's here. */
  morph: [0.12, 0.8] as const,
  /** The rest of the line is pushed this far (a share of the viewport's
   *  height), up or down, and is gone by this share of the glide. */
  push: 0.2,
  pushGone: 0.7,
} as const;
/** Which way each other word of the line is pushed: up (−1) or down (+1). */
export const PUSH_DIR: Record<string, -1 | 1> = { an: -1, of: 1, travel: 1 };

// ── Act 3: the fixed anchor and its match cuts ────────────────────────────

export type Keyword = 'ARCHIVE' | 'CAMERA' | 'TRAVEL' | 'THOUGHT' | 'YOU';
/** The anchor's faces: Fraunces 900, Fraunces 400, Space Grotesk 700 in
 *  capitals, the typewriter's monospace — each held to one cap height. */
export type AnchorFace = 'f900' | 'f400' | 'sg700' | 'mono';
export const FACE_ORDER: readonly AnchorFace[] = ['f900', 'f400', 'sg700', 'mono'];

/** The anchor: its centre (a share of the viewport), its cap height (a
 *  share of the height, or less where the widest word must fit across), the
 *  block's height and side padding (shares of the cap height). */
export const ANCHOR = {
  x: 0.5,
  y: 0.5,
  capVh: 0.12,
  maxWidth: { desktop: 0.78, phone: 0.86 },
  block: 1.56,
  pad: 0.34,
} as const;

/** The anchor's cap height: 12% of the height, unless the widest keyword
 *  (its ink width per unit of cap height, `widestPerCap`) would not fit
 *  across. One number for every cut. */
export function anchorCap(vw: number, vh: number, widestPerCap: number, layout: FilmLayout) {
  const byHeight = ANCHOR.capVh * vh;
  const byWidth = (ANCHOR.maxWidth[layout] * vw) / Math.max(1e-6, widestPerCap + 2 * ANCHOR.pad);
  return Math.min(byHeight, byWidth);
}

/** The anchor with a word of ink width `inkW` in it: the block (centred on
 *  the anchor, as wide as the word and its padding, as tall as the anchor
 *  says), where the word's ink starts, and its baseline (the cap centred in
 *  the block). The centre and the height never depend on the word. */
export function keyBox(vw: number, vh: number, cap: number, inkW: number) {
  const cx = ANCHOR.x * vw;
  const cy = ANCHOR.y * vh;
  const h = cap * ANCHOR.block;
  const w = inkW + 2 * cap * ANCHOR.pad;
  return { cx, cy, block: { x: cx - w / 2, y: cy - h / 2, w, h }, inkX: cx - inkW / 2, baseline: cy + cap / 2 };
}

/** Which way the giant words drift in a cut. */
export type Drift = 'right' | 'down' | 'left' | 'up';
export const DRIFT_VEC: Record<Drift, Vec2> = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
export const DRIFT_DEG: Record<Drift, number> = { right: 0, down: 90, left: 180, up: 270 };
/** The motion blur of a drifting word: copies of it behind it (away from
 *  where it goes), each a step further and fainter. Drawn once; they ride
 *  with the word. */
export const BLUR_COPIES = [
  { step: 1, opacity: 0.36 },
  { step: 2, opacity: 0.2 },
  { step: 3, opacity: 0.1 },
] as const;
/** One copy's step, px per 100 px/s of drift speed. */
export const BLUR_STEP_PER_SPEED = 1.9;

export interface Giant {
  text: string;
  face: 'f900' | 'f400';
  /** Cap height, a share of the screen's short side (30–45%). */
  cap: number;
  /** Where it is set (shares of the viewport): x is its left edge ('l'),
   *  right edge ('r') or centre ('c'); y is its baseline, moved down by
   *  `yCap` of its own cap height (a word cropped by the frame's foot is
   *  cropped by the same share of itself on every screen). The frame crops
   *  it on purpose. */
  x: number;
  y: number;
  yCap?: number;
  align: 'l' | 'r' | 'c';
}
export interface Composition {
  word: Keyword;
  face: AnchorFace;
  drift: Drift;
  /** How far the giant words drift in the cut, px (20–60). */
  driftPx: number;
  giants: readonly Giant[];
  /** Beside the anchor: a label in Space Grotesk bold capitals (left) and
   *  a line in Fraunces (right). */
  label: string;
  line: string;
  /** A small word ringed by hand (a frame number, as a contact sheet's
   *  china marker rings it), and where. */
  ringed: string;
  ring: Vec2;
  /** Grey texture: tiny paragraphs (index into TEXTURE) and where. */
  texture: readonly { at: Vec2; text: number; w: number }[];
  /** The meta at the top corners. */
  metaL: string;
  /** The frame number and the place's coordinates (top right). */
  frame: string;
  at: string;
}

/** The places on his route (the site's own content) with their
 *  coordinates, for the meta and the lines beside the anchor. */
export const PLACES = {
  miami: { name: 'Miami, Florida', at: '25.76° N  80.19° W' },
  orlando: { name: 'Orlando, Florida', at: '28.54° N  81.38° W' },
  page: { name: 'Page, Arizona', at: '36.91° N  111.46° W' },
  zion: { name: 'Zion, Utah', at: '37.30° N  113.03° W' },
  bryce: { name: 'Bryce Canyon, Utah', at: '37.59° N  112.19° W' },
  newyork: { name: 'New York, New York', at: '40.71° N  74.01° W' },
} as const;

/** The grey texture (the film's own words, from the v3 cut's newspaper). */
export const TEXTURE = [
  'Every archive begins as a drawer. Somewhere between the first roll and the hundredth, the pictures stop being souvenirs and start being a record: of light on one particular afternoon, of a street that has since changed its name.',
  'Nobody sets out to keep one. The contact sheets pile up, the envelopes are labelled in pencil and then in ink, and one winter the labels are moved into a ledger with the date, the place and the frame number beside each.',
  'Read in order, the frames make a route. Read out of order, they make something closer to a mind: the same corner of light, again and again, in different countries.',
] as const;

/** The credit along the foot of every cut. */
export const CREDIT = 'Ryan Xu · A personal archive of travel and thought';

/** Every cut's page, in the desktop's order. The drift turns only by a
 *  quarter between neighbours (right, right, down, down, right, right, up,
 *  up), so the motion runs on across every cut. The giant words sit in the
 *  bands above and below the anchor, cropped by the frame. */
export const COMPOSITIONS: readonly Composition[] = [
  {
    word: 'ARCHIVE',
    face: 'f900',
    drift: 'right',
    driftPx: 40,
    giants: [
      { text: 'ARCH', face: 'f900', cap: 0.42, x: -0.03, y: 0.36, align: 'l' },
      { text: 'IVE', face: 'f900', cap: 0.42, x: 1.03, y: 1, yCap: 0.15, align: 'r' },
    ],
    label: 'Fig. 01',
    line: PLACES.miami.name,
    ringed: '24A',
    ring: [0.86, 0.43],
    texture: [
      { at: [0.035, 0.43], text: 0, w: 150 },
      { at: [0.84, 0.62], text: 2, w: 132 },
    ],
    metaL: 'Visual archive',
    frame: 'Frame 01/36',
    at: PLACES.miami.at,
  },
  {
    word: 'ARCHIVE',
    face: 'f400',
    drift: 'right',
    driftPx: 36,
    giants: [
      { text: 'MIAMI', face: 'f900', cap: 0.44, x: -0.05, y: 0.33, align: 'l' },
      { text: 'ORLANDO', face: 'f400', cap: 0.3, x: 1.02, y: 1, yCap: 0.12, align: 'r' },
    ],
    label: 'Fig. 02',
    line: PLACES.orlando.name,
    ringed: '07',
    ring: [0.07, 0.56],
    texture: [
      { at: [0.8, 0.3], text: 1, w: 140 },
      { at: [0.035, 0.6], text: 2, w: 124 },
    ],
    metaL: 'Visual archive',
    frame: 'Frame 02/36',
    at: PLACES.orlando.at,
  },
  {
    word: 'CAMERA',
    face: 'sg700',
    drift: 'down',
    driftPx: 30,
    giants: [
      { text: 'FRAME', face: 'f900', cap: 0.4, x: 0.02, y: 0.34, align: 'l' },
      { text: 'PLATE', face: 'f400', cap: 0.36, x: 0.99, y: 1, yCap: 0.08, align: 'r' },
    ],
    label: 'Fig. 03',
    line: PLACES.page.name,
    ringed: '12',
    ring: [0.86, 0.43],
    texture: [
      { at: [0.035, 0.66], text: 0, w: 138 },
      { at: [0.82, 0.44], text: 1, w: 128 },
      { at: [0.46, 0.8], text: 2, w: 120 },
    ],
    metaL: 'Visual archive',
    frame: 'Frame 03/36',
    at: PLACES.page.at,
  },
  {
    word: 'CAMERA',
    face: 'mono',
    drift: 'down',
    driftPx: 34,
    giants: [
      { text: 'ZION', face: 'f900', cap: 0.45, x: 1.04, y: 1, yCap: 0.12, align: 'r' },
      { text: 'PAGE', face: 'f400', cap: 0.32, x: -0.02, y: 0.3, align: 'l' },
    ],
    label: 'Fig. 04',
    line: PLACES.zion.name,
    ringed: '36',
    ring: [0.07, 0.56],
    texture: [
      { at: [0.8, 0.24], text: 2, w: 136 },
      { at: [0.035, 0.44], text: 1, w: 126 },
    ],
    metaL: 'Visual archive',
    frame: 'Frame 04/36',
    at: PLACES.zion.at,
  },
  {
    word: 'TRAVEL',
    face: 'f900',
    drift: 'right',
    driftPx: 44,
    giants: [
      { text: 'ROUTE', face: 'f900', cap: 0.43, x: -0.04, y: 0.31, align: 'l' },
      { text: 'BRYCE', face: 'f400', cap: 0.33, x: 1.02, y: 1, yCap: 0.06, align: 'r' },
    ],
    label: 'Fig. 05',
    line: PLACES.bryce.name,
    ringed: '09',
    ring: [0.86, 0.43],
    texture: [
      { at: [0.035, 0.62], text: 1, w: 146 },
      { at: [0.84, 0.46], text: 0, w: 124 },
    ],
    metaL: 'Visual archive',
    frame: 'Frame 05/36',
    at: PLACES.bryce.at,
  },
  {
    word: 'TRAVEL',
    face: 'f400',
    drift: 'right',
    driftPx: 40,
    giants: [
      // Only its top half: the frame's foot cuts it through the middle.
      { text: 'TRAVEL', face: 'f900', cap: 0.45, x: 0.5, y: 1, yCap: 0.5, align: 'c' },
      { text: 'NEW YORK', face: 'f400', cap: 0.3, x: -0.03, y: 0.3, align: 'l' },
    ],
    label: 'Fig. 06',
    line: PLACES.newyork.name,
    ringed: '18',
    ring: [0.07, 0.56],
    texture: [
      { at: [0.035, 0.42], text: 2, w: 130 },
      { at: [0.83, 0.58], text: 1, w: 132 },
    ],
    metaL: 'Visual archive',
    frame: 'Frame 06/36',
    at: PLACES.newyork.at,
  },
  {
    word: 'THOUGHT',
    face: 'sg700',
    drift: 'up',
    driftPx: 32,
    giants: [
      { text: 'ZION', face: 'f400', cap: 0.34, x: -0.02, y: 0.33, align: 'l' },
      { text: 'PAGE', face: 'f900', cap: 0.42, x: 1.03, y: 1, yCap: 0.17, align: 'r' },
    ],
    label: 'Fig. 07',
    line: PLACES.zion.name,
    ringed: '31',
    ring: [0.86, 0.43],
    texture: [
      { at: [0.82, 0.26], text: 0, w: 134 },
      { at: [0.035, 0.46], text: 2, w: 128 },
      { at: [0.6, 0.84], text: 1, w: 118 },
    ],
    metaL: 'Visual archive',
    frame: 'Frame 07/36',
    at: PLACES.zion.at,
  },
  {
    word: 'YOU',
    face: 'mono',
    drift: 'up',
    driftPx: 38,
    giants: [
      { text: 'LIGHT', face: 'f900', cap: 0.45, x: 0.5, y: 0.35, align: 'c' },
      { text: 'MIAMI', face: 'f400', cap: 0.32, x: 1.02, y: 1, yCap: 0.1, align: 'r' },
    ],
    label: 'Fig. 08',
    line: PLACES.miami.name,
    ringed: '01',
    ring: [0.07, 0.56],
    texture: [
      { at: [0.035, 0.44], text: 1, w: 140 },
      { at: [0.83, 0.6], text: 0, w: 126 },
    ],
    metaL: 'Visual archive',
    frame: 'Frame 08/36',
    at: PLACES.miami.at,
  },
];
/** The cuts each layout plays (indices into COMPOSITIONS): the desktop all
 *  eight (ARCHIVE ×2, CAMERA ×2, TRAVEL ×2, THOUGHT, YOU); the phone six
 *  (ARCHIVE ×2, CAMERA, TRAVEL ×2, YOU) — YOU last on both. */
export const ACT3: Record<FilmLayout, readonly number[]> = {
  desktop: [0, 1, 2, 3, 4, 5, 6, 7],
  phone: [0, 1, 2, 4, 5, 7],
};

// ── Act 4: the film burn (24 fps) ─────────────────────────────────────────
// Frame numbers are 0–23 from the act's start. The canvas (a fragment
// shader) is drawn only when the frame number changes; everything else is
// held on the frame by stepped keyframes.
export const BURN = {
  frames: 24,
  /** f0–2: flicker (brightness ±10%), scratches and dust; gate weave from
   *  f0 to f11 (±1 px a frame). */
  flicker: [0, 3] as const,
  weavePx: 1,
  /** f3: the frame slips up a quarter, showing the frame line and the
   *  perforations. */
  slip: 3,
  slipShare: 0.25,
  /** f4–8: the burn spreads from beside the anchor (its radius a share of
   *  the frame's diagonal) and the frame outside it turns sepia. */
  burn: [4, 9] as const,
  radius: [0.025, 0.065, 0.12, 0.19, 0.27, 0.36, 0.45, 0.55] as const,
  sepia: [0.3, 0.45, 0.58, 0.7, 0.8, 0.86, 0.9, 0.9] as const,
  /** f9–11: all of it darkens to a deep brown-black and slides out at 6°. */
  out: [9, 12] as const,
  darkness: [0.38, 0.68, 0.9] as const,
  slide: [0.1, 0.38, 0.86] as const,
  slideDeg: 6,
  /** f12–13 black; f14–19 the leader, one card a frame; f20–23 the lit
   *  perforations carry it into the dark. */
  black: [12, 14] as const,
  leader: [14, 20] as const,
  perfs: [20, 24] as const,
} as const;
/** The leader's cards, one frame each (PROPOSED copy, awaiting the owner). */
export const LEADER = ['count-3', 'head', '35mm', 'reel', 'archive', 'count-2'] as const;
export type LeaderCard = (typeof LEADER)[number];
/** The burn's colours, from the front inward: bone at the very edge (its
 *  brightest: never a white flash), then heat to char. */
export const BURN_RAMP = ['#F4F4ED', '#FFE3A0', '#FF9A3C', '#C8471E', '#3A1408'] as const;
/** Where they sit, css px in from the burn's front (then the hole). */
export const BURN_STOPS = [0, 5, 15, 30, 52] as const;
export const BURN_HOLE = '#140D08';
/** Frame f's flicker (−1 dark … 1 light) and gate weave (px), seeded. */
export function burnFrame(f: number) {
  const rand = seeded(9000 + f * 31);
  const flick = f < BURN.out[0] ? (f % 2 === 0 ? 1 : -1) * (0.45 + rand() * 0.55) : 0;
  const weave: Vec2 = f < BURN.out[1] ? [Math.round((rand() * 2 - 1) * BURN.weavePx), Math.round((rand() * 2 - 1) * BURN.weavePx)] : [0, 0];
  return { flick, weave };
}
/** The burn's radius (share of the diagonal) at frame f, 0 before it. */
export function burnRadius(f: number) {
  if (f < BURN.burn[0]) return 0;
  return BURN.radius[Math.min(BURN.radius.length - 1, f - BURN.burn[0])];
}
export function burnSepia(f: number) {
  if (f < BURN.burn[0]) return 0;
  return BURN.sepia[Math.min(BURN.sepia.length - 1, f - BURN.burn[0])];
}
export function burnDarkness(f: number) {
  if (f < BURN.out[0]) return 0;
  if (f >= BURN.out[1]) return 1;
  return BURN.darkness[f - BURN.out[0]];
}
/** The frame's place at frame f: its gate weave, the slip, the slide out
 *  (a share of the height, and the turn, deg). */
export function frameAt(f: number) {
  const { weave } = burnFrame(f);
  let y = 0;
  let rot = 0;
  if (f === BURN.slip) y = -BURN.slipShare;
  if (f >= BURN.out[0] && f < BURN.out[1]) {
    const k = f - BURN.out[0];
    y = BURN.slide[k];
    rot = (BURN.slideDeg * (k + 1)) / (BURN.out[1] - BURN.out[0]);
  }
  if (f >= BURN.out[1]) {
    y = 1.2;
    rot = BURN.slideDeg;
  }
  return { x: weave[0], y, rot, weaveY: weave[1] };
}

// ── Act 5: the dark ───────────────────────────────────────────────────────
export const DARK_TYPED = 'ryan xu';
export const DARK_CPS = 12;
/** The first letter a beat into the act; the blink after the last. */
export const DARK_TYPE_AT = BEAT_MS;

// ── Act 6: the end title ──────────────────────────────────────────────────
/** The typed line turns into the title (one ink box: the two faces share a
 *  baseline and an x-height, and one width), the credits come up under it. */
export const TITLE = {
  morph: 375,
  swap: [0.28, 0.6] as const,
  cursorOut: 120,
  sub: [250, 480] as const,
  you: [360, 560] as const,
  rise: 10,
} as const;
/** The end title's words (PROPOSED: the YOU line). */
export const TITLE_NAME = 'Ryan Xu';
export const TITLE_SUB = ['CAMERA', 'ARCHIVE', 'TRAVEL', 'THOUGHT'] as const;
export const TITLE_YOU = { lead: 'Admit one', word: 'YOU' } as const;

// ── The plan: the whole film as spans on one clock ────────────────────────
export type ActId = 'type' | 'find' | 'cuts' | 'burn' | 'dark' | 'title';
export interface CutPlan extends Span {
  /** The composition (index into COMPOSITIONS). */
  index: number;
  word: Keyword;
  face: AnchorFace;
  drift: Drift;
}
export interface FilmPlan {
  layout: FilmLayout;
  acts: Record<ActId, Span>;
  materials: (Span & { id: MaterialId })[];
  /** Act 1: when each character of TYPED appears; the cursor's first
   *  flash. */
  typing: number[];
  cursorOn: number;
  /** Act 2. */
  sweep: Span;
  glide: Span;
  /** Act 3. */
  cuts: CutPlan[];
  /** Act 5: when each character of DARK_TYPED appears; the blink after. */
  darkTyping: number[];
  blink: Span;
  /** The landing starts here (the film's length). */
  length: number;
}

export function filmPlan(layout: FilmLayout): FilmPlan {
  const b = (n: number) => n * BEAT_MS;
  const mats = MATERIALS[layout];
  const typeEnd = b(ACT_BEATS.idle + ACT_BEATS.material * mats.length);
  const materials = mats.map((id, k) => ({
    id,
    start: k === 0 ? 0 : b(ACT_BEATS.idle + ACT_BEATS.material * k),
    end: k === mats.length - 1 ? typeEnd : b(ACT_BEATS.idle + ACT_BEATS.material * (k + 1)),
  }));
  const typeAt = b(ACT_BEATS.idle);
  const typing = typeTimes(TYPED, typeAt, typeEnd - TYPE_TAIL_MS, TYPE_CPS, TYPE_JITTER_MS, 41);
  const find = { start: typeEnd, end: typeEnd + b(ACT_BEATS.find) };
  const order = ACT3[layout];
  const cutsAct = { start: find.end, end: find.end + b(ACT_BEATS.cut * order.length) };
  const cuts: CutPlan[] = order.map((index, k) => {
    const c = COMPOSITIONS[index];
    return { index, word: c.word, face: c.face, drift: c.drift, start: cutsAct.start + b(ACT_BEATS.cut * k), end: cutsAct.start + b(ACT_BEATS.cut * (k + 1)) };
  });
  const burn = { start: cutsAct.end, end: cutsAct.end + b(ACT_BEATS.burn) };
  const dark = { start: burn.end, end: burn.end + b(ACT_BEATS.dark) };
  const title = { start: dark.end, end: dark.end + b(ACT_BEATS.title) };
  const darkTyping = typeTimes(DARK_TYPED, dark.start + DARK_TYPE_AT, dark.end, DARK_CPS, 18, 77);
  // The blink: off half a period after the last letter's own beat… and on
  // again as the title begins.
  const blink = { start: title.start - CURSOR_MS / 2, end: title.start };
  return {
    layout,
    acts: { type: { start: 0, end: typeEnd }, find, cuts: cutsAct, burn, dark, title },
    materials,
    typing,
    cursorOn: BEAT_MS,
    sweep: { start: find.start, end: find.start + FIND.sweepMs },
    glide: { start: find.start + FIND.glideAt, end: find.end },
    cuts,
    darkTyping,
    blink,
    length: title.end,
  };
}

/** Every hard cut of a plan: the materials, the acts, the match cuts. */
export function hardCuts(plan: FilmPlan) {
  const out = new Set<number>();
  plan.materials.forEach((m) => out.add(m.start));
  Object.values(plan.acts).forEach((a) => out.add(a.start));
  plan.cuts.forEach((c) => out.add(c.start));
  out.add(plan.length);
  return [...out].filter((t) => t > 0).sort((a, b) => a - b);
}

/** The film's frame number at time t inside the burn (−1 outside it). */
export function burnFrameAt(plan: FilmPlan, t: number) {
  const { start, end } = plan.acts.burn;
  if (t < start || t >= end) return -1;
  return Math.min(BURN.frames - 1, Math.floor((t - start) / FRAME24_MS + 1e-6));
}
/** The start of burn frame f (film ms). */
export const burnFrameStart = (plan: FilmPlan, f: number) => plan.acts.burn.start + f * FRAME24_MS;

/** How the picture reads, light or dark, from start to end: the flash
 *  budget is counted on this (scripts/opening-film.test.mjs). */
export function toneTimeline(plan: FilmPlan): (Span & { tone: Tone })[] {
  const out: (Span & { tone: Tone })[] = [];
  const push = (start: number, end: number, tone: Tone) => {
    const last = out[out.length - 1];
    if (last && last.tone === tone && last.end === start) last.end = end;
    else out.push({ start, end, tone });
  };
  plan.materials.forEach((m) => push(m.start, m.end, MATERIAL_TONE[m.id]));
  push(plan.acts.find.start, plan.acts.cuts.end, 'light');
  // The burn stays light (a sepia frame, a local burn) until it darkens
  // and slides out; from there on it is the dark.
  push(plan.acts.burn.start, burnFrameStart(plan, BURN.out[0]), 'light');
  push(burnFrameStart(plan, BURN.out[0]), plan.length + LANDING_A.done, 'dark');
  return out;
}
/** The times the picture turns over, light to dark or back. */
export function toneFlips(plan: FilmPlan) {
  const tl = toneTimeline(plan);
  return tl.slice(1).map((s) => s.start);
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
// The Skip pill takes the film to the end title with FF_TAIL ms of it left
// (the title formed, its credits up), then the landing plays HURRIED (every
// landing beat at FF_RATE). Never a hard cut to the page, never back, and
// nothing once the landing has begun.
export const FF_TAIL = 250;
export const FF_RATE = 1.35;
export function fastForwardTarget(plan: FilmPlan, t: number): number | null {
  const end = plan.length;
  if (t >= end) return null;
  const target = end - FF_TAIL;
  return t < target ? target : null;
}

// ── The globe behind ──────────────────────────────────────────────────────
// The film says the globe may come up this long before the landing (a skip
// says so at once). The page holds the globe until the boarding pass is
// torn instead, whatever the film says.
export const GLOBE_LEAD_MS = 2900;
export const globeReleaseAt = (plan: FilmPlan) => Math.max(0, plan.length - GLOBE_LEAD_MS);

// ── One ink box: a word turning from one face into another ────────────────
// Act 2 (the typewriter's "archive" into Fraunces's ARCHIVE), act 6 (the
// typed "ryan xu" into the title) and the landing hold both faces to ONE ink
// box: the same centre and height, and one shared width that goes from the
// first face's to the second's — so the crossfade (one window, no blur) is a
// morph of letterforms, never a double image.
/** The two faces' horizontal scales across the morph: at every moment both
 *  have ink width lerp(srcW, dstW, p). */
export function morphScales(srcW: number, dstW: number) {
  const s = Math.max(1e-6, srcW);
  const d = Math.max(1e-6, dstW);
  return { source: [1, d / s] as const, target: [s / d, 1] as const };
}

// ── Landing A: the words fly home ─────────────────────────────────────────
// Each word leaves the end title from its own box and lands on its own glyph
// box in the entrance's opening words (one continuous FLIP), a little after
// the one before; the title's face turns into the page's on the way (one ink
// box, as above). Landing ms. The spec gives it 0.6 s.
export const LANDING_A = {
  /** The dark dissolves into the page. */
  dissolve: [0, 380] as const,
  /** Word i leaves at `start + i * stagger` and flies `fly` ms; the fall
   *  leads the slide (`yLead`). */
  start: 0,
  stagger: 20,
  fly: 480,
  yLead: 0.8,
  /** The shared ink width, title's → page's, as a share of the flight. */
  morph: [0.14, 0.66] as const,
  /** The crossfade (one window for both faces), as a share of the flight. */
  sourceOut: [0.34, 0.6] as const,
  targetIn: [0.34, 0.6] as const,
  /** The rest of the opening words (the line's other words, the kicker,
   *  the scroll cue, the nav last) comes up round the landed words. */
  rest: 300,
  done: 600,
} as const;
/** The words that fly home, in the end title's order (his name, the
 *  credits, then YOU). YOU is optional: the entrance will give it a place
 *  (the boarding pass's passenger); a word missing on either side simply
 *  does not fly — its place comes up with the rest. */
export const FLY_ORDER = ['ryan', 'xu', 'camera', 'archive', 'travel', 'thought', 'you'] as const;
export type FlyWord = (typeof FLY_ORDER)[number];
export const FLY_OPTIONAL: readonly FlyWord[] = ['you'];
/** Where each word leaves from (the end title: [data-fly]) and where it
 *  lands (its span in the entrance: [data-open-land], src/components/home/
 *  EntranceIntro.tsx). YOU may land anywhere in the entrance (the pass). */
export const LANDING_TARGETS: Record<FlyWord, { from: string; to: string }> = Object.fromEntries(
  FLY_ORDER.map((word) => [word, { from: `[data-fly="${word}"]`, to: word === 'you' ? `.entrance [data-open-land="${word}"]` : `.entrance-intro [data-open-land="${word}"]` }]),
) as Record<FlyWord, { from: string; to: string }>;

/** The landing curve: an ease-in-out with a soft arrival, quick off the
 *  mark. */
export const FLY_EASE = [0.38, 0, 0.2, 1] as const;

export interface Flight {
  /** Source centre minus target centre (px) and source/target scale. */
  dx: number;
  dy: number;
  k: number;
  delay: number;
  duration: number;
}
/** The FLIP from a word's box on the end title to its glyph box on the page:
 *  sizes match on the cap height (`srcCap` / `dstCap`). */
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
 *  fall ahead of it (`yLead`), the scale with the slide. */
const flyCurve = bezierFn(FLY_EASE);
export function flightPath(f: Flight, samples = 20) {
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

/** A glide sampled on a curve: n + 1 points of (offset 0 → 1, eased 0 → 1). */
export function sampleCurve(ease: Bezier, n = 14) {
  const fn = bezierFn(ease);
  return Array.from({ length: n + 1 }, (_, i) => ({ u: i / n, e: fn(i / n) }));
}

// ── Reduced motion ─────────────────────────────────────────────────────────
// No film: the end title is shown still, then the page crossfades in.
export const STILL = { hold: 1100, fade: 700 } as const;

// ── The fonts, loaded before the clock starts ─────────────────────────────
// Every face and weight the film sets (document.fonts.load each, with the
// characters it sets, so the right subset comes). No cut may show a
// fallback face: the clock waits for these (at most FONT_WAIT_MS — past
// that the film plays on whatever has come).
export const FONT_LOADS = [
  '900 100px Fraunces',
  '400 100px Fraunces',
  '700 20px "Space Grotesk"',
  '500 20px "Space Grotesk"',
] as const;
export const FONT_SAMPLE = 'ARCHIVECMTLOUGYZNPBFRWDSK abcdefghijklmnopqrstuvwxyz 0123456789 ·°—/.,';
export const FONT_WAIT_MS = 3500;

// ── Deterministic material ────────────────────────────────────────────────
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

/** Relative luminance of a #RRGGBB colour (for the flash budget). */
export function luminance(hex: string) {
  const v = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
