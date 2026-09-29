// ── The opening film: a retro editorial type film (v5) ──
// The homepage opens on a short film (src/components/home/OpeningFilm.tsx,
// its scenes in OpeningScenes.tsx, its materials in src/styles/opening.css).
// The owner's spec (2026-09-28, "复古编辑部动态排版") and his changes of
// 2026-09-29 (no place names — keep the suspense; a typed line relayed across
// machines; match cuts through many kinds of printed matter round a fixed
// lime anchor; no limit on the length), in six acts:
//
//   1. A typewriter relay (3 s): "an archive of travel" is typed, and every
//      few letters the whole frame hard-cuts to another machine — a dark CRT,
//      a deep stock-coloured screen, maroon photocopy bars, a pill over one of
//      his photographs, a beige monitor with a toolbar, a bare bone page, grid
//      paper with a lime marker, typewriter paper — slow to fast, while the
//      typed letters and the cursor never move (one monospace grid for all).
//   2. The word is found: a lime marker sweeps "archive" on the paper; the
//      rest of the line is pushed away and the word, struck in capitals,
//      glides to the middle of the frame, each typewriter capital turning
//      into its Fraunces capital in one shared ink box (swapped in one
//      instant, never a double image).
//   3. Match cuts round a fixed lime anchor (5.7 s, 25 scenes on a sixth of
//      a second; the sheets meant to be read hold two): ARCHIVE → CAMERA →
//      TRAVEL → THOUGHT → YOU. The block's
//      centre, its height and the word's cap height never move; only the word
//      and its face change (Fraunces 900, Fraunces italic, Space Grotesk 700,
//      Fraunces 400, the monospace). Round it the frame is recomposed every
//      cut, alternating an editorial page (giant cropped Fraunces words
//      drifting with a motion blur of pre-drawn copies, words beside the
//      anchor, a ringed word, grey texture, meta, a credit) and a piece of
//      printed matter built round the word (a newspaper, a dictionary, a
//      catalogue card, a magazine spread, a slate, a strip of film, a ticket,
//      a book, a passport page, a telegram, a notebook, a postcard).
//   4. A film burn, stepped at 24 fps: flicker, scratches and gate weave, a
//      frame slip, a burn spreading from the anchor on an fbm mask (a WebGL
//      shader on its own canvas), the frame darkening and sliding out at 6°,
//      two black frames, six leader cards one frame each, and a row of lit
//      sprocket holes that carries the picture into the dark.
//   5. The dark: "ryan xu" is typed on the film's base, with a lime block
//      cursor (the act's one lime) that blinks once more when done.
//   6. The end title: that line is struck in capitals and turns, letter by
//      letter, into his name in Fraunces capitals — set exactly as the first
//      screen sets it, so it flies home without changing face — with
//      CAMERA · ARCHIVE · TRAVEL · THOUGHT under it, and YOU.
//
// Then it lands (landing A, "words fly home"): the dark dissolves into the
// first screen and RYAN, XU, CAMERA, ARCHIVE, TRAVEL, THOUGHT (and YOU, when
// the page has a place for it) fly into their places in the entrance's
// opening words (src/components/home/EntranceIntro.tsx).
//
// No place names: the places are the archive's suspense. The only ones in
// the film are two tiny easter eggs (EGGS: a dateline in a newspaper column,
// a park's cancellation stamp in a passport's corner), never large, never
// the keyword, never centred.
//
// Smooth, by the spec's definition: every hard cut falls on its act's grid —
// act 1 and 2 on the twelfth of a second (FRAME12_MS, 5 vsyncs at 60 Hz), act
// 3 on the sixth (CUT_MS: 10 vsyncs at 60 Hz, 20 at 120 Hz), the burn on the
// 24th, the dark and the title on the eighth (BEAT_MS); the anchor never
// moves; the drift runs on across a cut (the same way or a quarter turn); no
// fallback face, no blank frame, no dropped frame at a cut (the fonts and his
// photographs are in before the clock starts, and everything is transform
// and opacity on one clock).
//
// It plays once a tab session (src/lib/reelVisit.ts). While it plays, ONLY
// the Skip pill skips it (to the end title and a hurried landing — never a
// hard cut to the page); a wheel, a touch, a key or a click anywhere else
// does nothing at all (the page's scroll is held). Reduced motion gets the
// end title as a still and a calm crossfade.
//
// Everything in this module is pure (no DOM): the whole film is DATA here —
// the acts, the machines, the scenes (each {face, giants, side words,
// decorations} or a sheet of printed matter), the burn's frames — and the
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
// The last word is kept on window.__archiveOpening for anyone who starts
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

// ── The clocks ─────────────────────────────────────────────────────────────
/** Acts 1–2: the relay and the find cut on the twelfth of a second (five
 *  vsyncs at 60 Hz, ten at 120 Hz). */
export const FRAME12_MS = 1000 / 12;
/** Act 3: a match cut every sixth of a second (the guidance's 5 frames at 30
 *  fps; ten vsyncs at 60 Hz, twenty at 120 Hz — never a judder). */
export const CUT_MS = 1000 / 6;
/** Acts 5–6 and the landing: the eighth of a second. */
export const BEAT_MS = 125;
/** The burn is stepped at 24 fps. */
export const FRAME24_MS = 1000 / 24;
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

// ── Act 1: the typewriter relay ───────────────────────────────────────────

/** The typed line, lower case, and where its found word sits in it
 *  (PROPOSED copy). */
export const TYPED = 'an archive of travel';
export const FOUND_RANGE = [3, 10] as const;
export const FOUND_WORD = TYPED.slice(FOUND_RANGE[0], FOUND_RANGE[1]);

/** The machines the line is typed on, in order, how long each is on screen
 *  (twelfths of a second) and how many keys it strikes: slow to fast, then
 *  the paper holds (the last letter, the cursor blinking, the find). Dark
 *  ones first, light ones after: the relay turns the picture over once.
 *  Every machine strikes a visible letter (never only a space), and its
 *  first key falls on its own cut (RELAY_KEYS). */
export type StyleId = 'crt' | 'deep' | 'bars' | 'pill' | 'beige' | 'bone' | 'grid' | 'paper';
export const STYLES: readonly { id: StyleId; frames: number; keys: number; tone: Tone }[] = [
  { id: 'crt', frames: 9, keys: 4, tone: 'dark' },
  { id: 'deep', frames: 5, keys: 4, tone: 'dark' },
  { id: 'bars', frames: 4, keys: 3, tone: 'dark' },
  { id: 'pill', frames: 3, keys: 2, tone: 'dark' },
  { id: 'beige', frames: 3, keys: 2, tone: 'light' },
  { id: 'bone', frames: 3, keys: 2, tone: 'light' },
  { id: 'grid', frames: 3, keys: 2, tone: 'light' },
  { id: 'paper', frames: 6, keys: 1, tone: 'light' },
];
export const STYLE_TONE = Object.fromEntries(STYLES.map((s) => [s.id, s.tone])) as Record<StyleId, Tone>;
/** The style the word is found on (the last). */
export const FIND_STYLE: StyleId = 'paper';

/** The cursor's blink period (steps, half on and half off). */
export const CURSOR_MS = 530;
/** The blink on the film's clock: on at `start`, then off and on every half
 *  period until `end` (the times it changes, and to what). */
export function blinkSteps(start: number, end: number, period = CURSOR_MS): [number, 0 | 1][] {
  const out: [number, 0 | 1][] = [];
  const half = period / 2;
  for (let k = 1; start + k * half < end; k += 1) out.push([start + k * half, k % 2 === 0 ? 1 : 0]);
  return out;
}
/** The first letter three twelfths in (the cursor alone first). */
export const TYPE_AT = 3 * FRAME12_MS;
/** The relay's keys: each machine's first on its own cut (a new machine
 *  arrives with a new letter, never a keystroke a frame before a cut), the
 *  rest evenly across its time — about eight letters a second. A key at
 *  least `jitterClear` ms from both of its machine's cuts is nudged by up
 *  to ±`jitter` ms (seeded); none falls in the `quiet` ms before a cut. */
export const RELAY_KEYS = { jitter: 20, jitterClear: 70, quiet: 50, seed: 41 } as const;

/** When each character of `text` appears: the first at `start`, the last
 *  at `last` (neither nudged), evenly between, each nudged by a seeded
 *  jitter of up to ±`jitter` ms (never so far that two swap). */
export function typeTimes(text: string, start: number, last: number, jitter: number, seed: number) {
  const n = text.length;
  const interval = n > 1 ? (last - start) / (n - 1) : 0;
  const j = Math.min(jitter, interval * 0.4);
  const rand = seeded(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const nudge = i === 0 || i === n - 1 ? 0 : (rand() * 2 - 1) * j;
    // Not rounded: the first key must fall exactly on its time (a dark
    // act may start on a sixth, not a whole millisecond).
    out.push(start + i * interval + nudge);
  }
  return out;
}

/** When each character of TYPED appears in the relay: machine by machine,
 *  as many keys as it strikes (STYLES), its first on its cut (the crt's at
 *  TYPE_AT), the rest evenly spaced up to its end; the middle keys nudged
 *  (RELAY_KEYS). */
export function relayTimes(styles: readonly (Span & { id: StyleId })[]) {
  const rand = seeded(RELAY_KEYS.seed);
  const out: number[] = [];
  styles.forEach((m, k) => {
    const n = STYLES[k].keys;
    const first = k === 0 ? TYPE_AT : m.start;
    const step = (m.end - first) / n;
    for (let i = 0; i < n; i += 1) {
      const t = first + i * step;
      const clear = i > 0 && t - m.start >= RELAY_KEYS.jitterClear && m.end - t >= RELAY_KEYS.jitterClear;
      const nudge = clear ? (rand() * 2 - 1) * RELAY_KEYS.jitter : 0;
      // Exact (a key on a cut is the cut's own time, to the last bit).
      out.push(t + nudge);
    }
  });
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
/** A face turning into another, letter by letter (act 2, act 6): every
 *  letter of the one face and its letter in the other are held to ONE ink
 *  box, which goes from the first face's to the second's across `box` (a
 *  share of the move), and the two faces are SWAPPED at `fade` — one
 *  instant (a zero-width window) near the middle of it, at the move's
 *  fastest, where the two letters are the same size in the same place: one
 *  frame shows the one face, the next the other, never both (a crossfade,
 *  however short, showed two words for two or three frames). The words are
 *  in the same case on both sides (capitals). */
export const GLYPH_MORPH = {
  box: [0.06, 0.5] as const,
  fade: [0.29, 0.29] as const,
} as const;
export const FIND = {
  /** The lime marker sweeps the word, left to right, in two twelfths. */
  sweepMs: 2 * FRAME12_MS,
  /** The glide starts as the sweep ends and ends with the act; as it
   *  starts, the word is struck again in capitals (a hard cut, the letters
   *  in the same cells). */
  glideMs: 4 * FRAME12_MS,
  /** The two faces cross in this share of the glide (one window). */
  swap: GLYPH_MORPH.fade,
  /** The shared ink boxes go from the typewriter's to Fraunces's here. */
  morph: GLYPH_MORPH.box,
  /** The rest of the line is pushed this far (a share of the viewport's
   *  height), up or down, and is gone by this share of the glide. */
  push: 0.2,
  pushGone: 0.7,
} as const;
/** Which way each other word of the line is pushed: up (−1) or down (+1). */
export const PUSH_DIR: Record<string, -1 | 1> = { an: -1, of: 1, travel: 1 };

// ── Act 3: the fixed anchor and its match cuts ────────────────────────────

export type Keyword = 'ARCHIVE' | 'CAMERA' | 'TRAVEL' | 'THOUGHT' | 'YOU';
/** The anchor's faces (the guidance's Didone / script / heavy caps / thin
 *  serif, in the faces the site loads): Fraunces 900 at its largest optical
 *  size, Fraunces italic 500 (title case: the script), Space Grotesk 700 in
 *  capitals, Fraunces 400, the typewriter's monospace — each held to one cap
 *  height. */
export type AnchorFace = 'f900' | 'fit' | 'sg700' | 'f400' | 'mono';
export const FACE_ORDER: readonly AnchorFace[] = ['f900', 'fit', 'sg700', 'f400', 'mono'];
/** The word as a face sets it: the script in title case, the rest in
 *  capitals. */
export function faceText(word: Keyword, face: AnchorFace) {
  return face === 'fit' ? word.charAt(0) + word.slice(1).toLowerCase() : word;
}

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
/** The motion blur of a drifting word (the guidance's single-axis blur, as
 *  pre-drawn copies): copies of it behind it (away from where it goes), each
 *  a step further and fainter. Drawn once; they ride with the word. */
export const BLUR_COPIES = [
  { step: 1, opacity: 0.36 },
  { step: 2, opacity: 0.2 },
  { step: 3, opacity: 0.1 },
] as const;
/** One copy's step, px per 100 px/s of drift speed. */
export const BLUR_STEP_PER_SPEED = 1.1;
/** The drift (and its blur) as a share of the data's px, per layout: the
 *  phone's frame is a quarter of the desktop's, and the same 30–40 px there
 *  swept every giant's edge across so much of it that, cut after cut, the
 *  same pixels turned light and dark more than four times a second (the
 *  local flash budget). The stylesheet carries the same number
 *  (--drift-k) for the blur copies drawn in the markup. */
export const DRIFT_SCALE: Record<FilmLayout, number> = { desktop: 1, phone: 0.6 };

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
/** The giant words' largest cap height, a share of the short side, per
 *  layout: on the phone the short side is the width, and a giant at 45% of
 *  it filled the frame with a fragment whose every cut flipped the same
 *  pixels (the phone's local flash budget); there they are held to 34%. */
export const GIANT_CAP_MAX: Record<FilmLayout, number> = { desktop: 0.45, phone: 0.34 };
export const giantCap = (g: Giant, layout: FilmLayout) => Math.min(g.cap, GIANT_CAP_MAX[layout]);

/** A word beside the anchor: condensed heavy capitals (Space Grotesk 700),
 *  the script (Fraunces italic) or the thin serif (Fraunces 400); left or
 *  right of the block, on its middle, a line above it or a line below. */
export type SideRole = 'caps' | 'italic' | 'thin';
export interface Side {
  text: string;
  role: SideRole;
  at: 'l' | 'r';
  row: -1 | 0 | 1;
}
/** An editorial page's small print: a small word ringed by hand, tiny grey
 *  paragraphs (index into TEXTURE) as texture, and the meta at the top
 *  corners. */
export interface Deco {
  ringed: string;
  ring: Vec2;
  texture: readonly { at: Vec2; text: number; w: number }[];
  metaL: string;
  metaR: string;
}
/** The printed matter (each drawn by its own sheet in OpeningScenes). */
export type SheetKind =
  | 'newspaper'
  | 'dictionary'
  | 'catalogue'
  | 'magazine'
  | 'slate'
  | 'edge'
  | 'ticket'
  | 'book'
  | 'passport'
  | 'telegram'
  | 'notebook'
  | 'postcard';
export interface Scene {
  word: Keyword;
  face: AnchorFace;
  /** How many sixths of a second it holds. */
  slots: number;
  drift: Drift;
  /** How far the giant words drift in the cut, px (20–60). */
  driftPx: number;
  /** The giant words: 1–2, cropped by the frame. */
  giants: readonly Giant[];
  /** An editorial page: the words beside the anchor and its small print.
   *  A piece of printed matter: its sheet (the words round the anchor are
   *  the sheet's own, in SHEETS). */
  side?: readonly Side[];
  deco?: Deco;
  sheet?: SheetKind;
}

/** The grey texture: tiny paragraphs, too small to read (the film's own
 *  words, PROPOSED; no place in them). */
export const TEXTURE = [
  'Every archive begins as a drawer. Somewhere between the first roll and the hundredth, the pictures stop being souvenirs and start being a record: of light on one particular afternoon, of a street that has since changed its name.',
  'Nobody sets out to keep one. The contact sheets pile up, the envelopes are labelled in pencil and then in ink, and one winter the labels are moved into a ledger with the date, the place and the frame number beside each.',
  'Read in order, the frames make a route. Read out of order, they make something closer to a mind: the same corner of light, again and again, in different countries.',
  'A camera is a patient machine. It waits for the light as long as its keeper does, and forgets nothing it was shown, not even the things he did not mean to show it.',
  'The road is mostly waiting: for a bus, for the weather, for the one minute in an afternoon when a street arranges itself and the shutter can be let go.',
] as const;

/** The credit along the foot of every editorial page (centred). */
export const CREDIT = 'Ryan Xu · A personal archive of travel and thought';

/** The printed matter's words (PROPOSED copy, except the dictionary, which
 *  is Webster's 1913, and the book, which is Stevenson's Travels with a
 *  Donkey, 1879 — both public domain). `row`: the words either side of the
 *  anchor on its line; `above` / `below`: the lines over and under it. No
 *  place in any of it, but for the two eggs (EGGS). */
export const SHEETS = {
  newspaper: {
    edition: ['Saturday Edition', 'No. 1,204', 'Two Cents'],
    row: ['From the', 'Photographs, letters and notes'],
    headline: 'What a drawer of negatives remembers',
    dateline: 'MIAMI —',
    body: [0, 1, 2, 3, 4],
  },
  dictionary: {
    head: ['Archipelago', '79', 'Archly'],
    above: [
      'Ar′chi·pel′a·go, n.; pl. -goes. Any sea or broad sheet of water interspersed with many islands or with a group of islands.',
      'Ar′chi·tect, n. 1. A person skilled in the art of building; one who makes it his occupation to form plans and designs of buildings. 2. A contriver, designer, or maker.',
      'Ar′chi·trave, n. (Arch.) The lower division of an entablature, or that part which rests immediately on the column.',
    ],
    row: ['', 'n.; pl. Archives. [F. archives, L. archivum, Gr. archeion government house.]'],
    below: [
      '1. pl. The place in which public records or historic documents are kept. 2. pl. Public records or documents preserved as evidence of facts; as, the archives of a country or family.',
      'Ar′chi·vist, n. A keeper of archives or records.',
      'Ar′chi·volt, n. (Arch.) The architectural member surrounding the curved opening of an arch.',
    ],
  },
  catalogue: {
    above: ['Xu, Ryan.', 'A personal archive of travel and thought / photographs by Ryan Xu.'],
    row: ['', '— Personal. 1 v. : ill. ; 35 mm.'],
    below: ['1. Travel photography.  2. Archives.  I. Title.'],
    call: ['TR', '790', '.X8'],
  },
  magazine: {
    kicker: 'The Picture Issue — Feature',
    deck: 'Twenty-four frames a second, and the one that stays.',
    row: ['', 'obscura'],
    body: [
      'A film is mostly forgotten on the way home. What stays is a frame or two: a face turned to a window, a road seen through a windscreen, the exact grey of a harbour at five.',
      'A photograph works the other way round. It is the one frame, chosen and kept; the film it came from, the walk and the waiting and the weather, is the part the viewer supplies.',
    ],
    caption: 'Photograph: Ryan Xu',
    folios: ['42', '43'],
  },
  slate: {
    prod: ['Prod.', 'A personal archive'],
    row: ['Roll 001', 'Scene 01 · Take 1'],
    cells: [
      ['Roll', '001'],
      ['Scene', '01'],
      ['Take', '1'],
      ['Fps', '24'],
    ],
    foot: ['35 mm', 'Sync', 'Day'],
  },
  edge: {
    row: ['▸ 23A', '▸ 24   Safety film'],
    notes: ['print this one', 'keep'],
  },
  ticket: {
    head: ['Single journey', 'Second class'],
    row: ['Valid for', 'one journey only'],
    route: [
      ['From', 'here'],
      ['To', 'anywhere'],
    ],
    no: 'Nº 004127',
    fine: 'Keep this ticket. Not valid for re-entry.',
    stub: 'Admit one',
  },
  book: {
    head: ['Travels with a Donkey', '63'],
    // The page is cropped mid-sentence: its first line (the sentence it
    // finishes names two villages) is out of the frame.
    above: ['is more than my much-inventing spirit can suppose.'],
    row: ['For my part, I', 'not to go anywhere,'],
    below: [
      'but to go. I travel for travel’s sake. The great',
      'affair is to move; to feel the needs and hitches of',
      'our life more nearly; to come down off this feather-',
      'bed of civilisation, and find the globe granite',
    ],
  },
  passport: {
    row: ['Visas', 'Endorsements'],
    stamps: ['Admitted', 'Entry', 'Exit', 'No. 36'],
    park: 'ZION NATIONAL PARK · UT',
    mrz: 'P<ARCHIVE<<TRAVEL<<THOUGHT<<<<<<<<<<<<<<<<',
    page: '17',
  },
  telegram: {
    fields: ['Received at 16.40', 'Words 17', 'Charges paid'],
    above: 'ARRIVED STOP LIGHT HOLDING STOP',
    row: ['', 'OF THE SEA ALL DAY STOP'],
    below: 'MORE FILM TOMORROW STOP',
  },
  notebook: {
    above: 'tuesday — the ferry late again, the light good.',
    row: ['a', ', written down,'],
    below: ['is a place you can go back to.', '(frame 14: the rope, not the boat)'],
  },
  postcard: {
    row: ['thinking of', '— as ever,'],
    below: 'Wish you were here. The light holds late; I keep missing the last bus to photograph it.',
    stamp: 'Postage',
    mark: 'Post office',
  },
} as const;

/** The easter eggs: the only place names in the film — tiny (6–7 px), in a
 *  corner of a page, never the keyword, never large, never centred. */
export const EGGS = [
  { sheet: 'newspaper', text: SHEETS.newspaper.dateline, px: 7 },
  { sheet: 'passport', text: SHEETS.passport.park, px: 6 },
] as const;
/** The places on his route: named nowhere in the film but the eggs. */
export const PLACE_NAMES = ['Miami', 'Orlando', 'Page', 'Zion', 'Bryce', 'New York', 'Florida', 'Arizona', 'Utah', 'Manhattan', 'Washington'] as const;

/** Every scene, in order. The drift turns only by a quarter between
 *  neighbours, so the motion runs on across every cut; the face changes at
 *  every cut. Slow to fast: the first two hold two sixths, the last (YOU,
 *  before the burn) four; the four sheets whose words are there to be read
 *  (the magazine, the ticket, the telegram, the postcard) hold two. */
export const SCENES: readonly Scene[] = [
  // ── ARCHIVE ──
  {
    word: 'ARCHIVE',
    face: 'f900',
    slots: 2,
    drift: 'right',
    driftPx: 36,
    sheet: 'newspaper',
    giants: [{ text: 'LEDGER', face: 'f900', cap: 0.4, x: 0.5, y: 0.2, align: 'c' }],
  },
  {
    word: 'ARCHIVE',
    face: 'fit',
    slots: 2,
    drift: 'right',
    driftPx: 40,
    giants: [
      { text: 'NEGA', face: 'f900', cap: 0.42, x: -0.03, y: 0.34, align: 'l' },
      { text: 'TIVE', face: 'f900', cap: 0.42, x: 1.03, y: 1, yCap: 0.16, align: 'r' },
    ],
    side: [
      { text: 'Collected', role: 'caps', at: 'l', row: 0 },
      { text: 'kept by hand', role: 'italic', at: 'r', row: 0 },
      { text: 'Plate I', role: 'thin', at: 'r', row: 1 },
    ],
    deco: {
      ringed: 'The',
      ring: [0.08, 0.64],
      texture: [
        { at: [0.8, 0.66], text: 0, w: 150 },
        { at: [0.035, 0.42], text: 2, w: 132 },
      ],
      metaL: 'Visual archive · Vol. I',
      metaR: 'Roll 01 · Frame 02',
    },
  },
  {
    word: 'ARCHIVE',
    face: 'f900',
    slots: 1,
    drift: 'down',
    driftPx: 30,
    sheet: 'dictionary',
    giants: [{ text: 'A', face: 'f400', cap: 0.45, x: -0.03, y: 1, yCap: 0.3, align: 'l' }],
  },
  {
    word: 'ARCHIVE',
    face: 'sg700',
    slots: 1,
    drift: 'down',
    driftPx: 34,
    giants: [
      { text: 'GRAIN', face: 'f400', cap: 0.38, x: 0.02, y: 0.33, align: 'l' },
      { text: 'ROLL', face: 'f900', cap: 0.44, x: 0.5, y: 1, yCap: 0.5, align: 'c' },
    ],
    side: [
      { text: 'Selected works', role: 'caps', at: 'l', row: 0 },
      { text: 'one frame at a time', role: 'italic', at: 'r', row: 0 },
      { text: 'Folio', role: 'thin', at: 'l', row: -1 },
    ],
    deco: {
      ringed: 'a',
      ring: [0.9, 0.3],
      texture: [
        { at: [0.82, 0.62], text: 1, w: 140 },
        { at: [0.035, 0.62], text: 3, w: 124 },
      ],
      metaL: 'Contact sheet 04',
      metaR: 'Frame 04',
    },
  },
  {
    word: 'ARCHIVE',
    face: 'mono',
    slots: 1,
    drift: 'right',
    driftPx: 38,
    sheet: 'catalogue',
    giants: [{ text: '025', face: 'f900', cap: 0.42, x: -0.04, y: 1, yCap: 0.35, align: 'l' }],
  },
  {
    word: 'ARCHIVE',
    face: 'f400',
    slots: 1,
    drift: 'right',
    driftPx: 42,
    giants: [
      { text: 'EXPO', face: 'f900', cap: 0.43, x: 1.04, y: 0.32, align: 'r' },
      { text: 'SURE', face: 'f900', cap: 0.43, x: -0.04, y: 1, yCap: 0.2, align: 'l' },
    ],
    side: [
      { text: 'In transit', role: 'caps', at: 'l', row: 0 },
      { text: 'as it was', role: 'italic', at: 'r', row: 0 },
      { text: 'Edition of one', role: 'thin', at: 'l', row: 1 },
    ],
    deco: {
      ringed: 'No.',
      ring: [0.1, 0.3],
      texture: [
        { at: [0.83, 0.6], text: 4, w: 136 },
        { at: [0.035, 0.6], text: 0, w: 128 },
      ],
      metaL: 'Visual archive',
      metaR: 'Frame 06',
    },
  },
  // ── CAMERA ──
  {
    word: 'CAMERA',
    face: 'f900',
    slots: 2,
    drift: 'up',
    driftPx: 32,
    sheet: 'magazine',
    giants: [{ text: '43', face: 'f400', cap: 0.4, x: 1.03, y: 0.24, align: 'r' }],
  },
  {
    word: 'CAMERA',
    face: 'fit',
    slots: 1,
    drift: 'up',
    driftPx: 36,
    giants: [
      { text: 'SHUT', face: 'f900', cap: 0.43, x: -0.03, y: 0.33, align: 'l' },
      { text: 'TER', face: 'f400', cap: 0.4, x: 1.03, y: 1, yCap: 0.14, align: 'r' },
    ],
    side: [
      { text: 'On film', role: 'caps', at: 'l', row: 0 },
      { text: 'held to the eye', role: 'italic', at: 'r', row: 0 },
      { text: 'Chapter two', role: 'thin', at: 'r', row: -1 },
    ],
    deco: {
      ringed: 'The',
      ring: [0.09, 0.66],
      texture: [
        { at: [0.82, 0.64], text: 3, w: 144 },
        { at: [0.035, 0.42], text: 1, w: 126 },
      ],
      metaL: 'Visual archive · Vol. II',
      metaR: 'Frame 08',
    },
  },
  {
    word: 'CAMERA',
    face: 'sg700',
    slots: 1,
    drift: 'right',
    driftPx: 34,
    sheet: 'slate',
    giants: [{ text: 'TAKE', face: 'f900', cap: 0.44, x: 0.5, y: 1, yCap: 0.52, align: 'c' }],
  },
  {
    word: 'CAMERA',
    face: 'f400',
    slots: 1,
    drift: 'right',
    driftPx: 40,
    giants: [
      { text: 'LENS', face: 'f900', cap: 0.45, x: 0.02, y: 0.35, align: 'l' },
      { text: 'FOCUS', face: 'f400', cap: 0.36, x: 1.03, y: 1, yCap: 0.1, align: 'r' },
    ],
    side: [
      { text: 'Field notes', role: 'caps', at: 'l', row: 0 },
      { text: 'after the rain', role: 'italic', at: 'r', row: 0 },
      { text: 'Index', role: 'thin', at: 'l', row: 1 },
    ],
    deco: {
      ringed: 'on',
      ring: [0.9, 0.32],
      texture: [
        { at: [0.82, 0.62], text: 2, w: 138 },
        { at: [0.035, 0.64], text: 4, w: 130 },
      ],
      metaL: 'Contact sheet 10',
      metaR: 'Frame 10',
    },
  },
  {
    word: 'CAMERA',
    face: 'mono',
    slots: 1,
    drift: 'down',
    driftPx: 30,
    sheet: 'edge',
    giants: [{ text: '24A', face: 'f900', cap: 0.4, x: 0.97, y: 0.27, align: 'r' }],
  },
  // ── TRAVEL ──
  {
    word: 'TRAVEL',
    face: 'f900',
    slots: 1,
    drift: 'down',
    driftPx: 34,
    giants: [
      { text: 'MILES', face: 'f900', cap: 0.42, x: -0.03, y: 0.33, align: 'l' },
      // Only its top half: the frame's foot cuts it through the middle.
      { text: 'ROAD', face: 'f900', cap: 0.45, x: 0.62, y: 1, yCap: 0.5, align: 'c' },
    ],
    side: [
      { text: 'Slow travel', role: 'caps', at: 'l', row: 0 },
      { text: 'the long way round', role: 'italic', at: 'r', row: 0 },
      { text: 'Part three', role: 'thin', at: 'r', row: 1 },
    ],
    deco: {
      ringed: 'The',
      ring: [0.09, 0.3],
      texture: [
        { at: [0.83, 0.3], text: 4, w: 140 },
        { at: [0.035, 0.62], text: 2, w: 128 },
      ],
      metaL: 'Visual archive · Vol. III',
      metaR: 'Frame 12',
    },
  },
  {
    word: 'TRAVEL',
    face: 'sg700',
    slots: 2,
    drift: 'left',
    driftPx: 36,
    sheet: 'ticket',
    giants: [{ text: 'SINGLE', face: 'f900', cap: 0.4, x: 0.5, y: 0.2, align: 'c' }],
  },
  {
    word: 'TRAVEL',
    face: 'fit',
    slots: 1,
    drift: 'left',
    driftPx: 40,
    giants: [
      { text: 'ROUTE', face: 'f900', cap: 0.43, x: 1.04, y: 0.33, align: 'r' },
      { text: 'NORTH', face: 'f400', cap: 0.34, x: -0.03, y: 1, yCap: 0.12, align: 'l' },
    ],
    side: [
      { text: 'On foot', role: 'caps', at: 'l', row: 0 },
      { text: 'between trains', role: 'italic', at: 'r', row: 0 },
      { text: 'Appendix', role: 'thin', at: 'l', row: -1 },
    ],
    deco: {
      ringed: 'a',
      ring: [0.9, 0.64],
      texture: [
        { at: [0.82, 0.3], text: 0, w: 138 },
        { at: [0.035, 0.66], text: 3, w: 128 },
      ],
      metaL: 'Contact sheet 14',
      metaR: 'Frame 14',
    },
  },
  {
    word: 'TRAVEL',
    face: 'f400',
    slots: 1,
    drift: 'up',
    driftPx: 30,
    sheet: 'book',
    giants: [{ text: 'TRAVELS', face: 'f400', cap: 0.38, x: 0.5, y: 0.19, align: 'c' }],
  },
  {
    word: 'TRAVEL',
    face: 'sg700',
    slots: 1,
    drift: 'up',
    driftPx: 36,
    giants: [
      { text: 'DUSK', face: 'f900', cap: 0.44, x: 1.03, y: 0.34, align: 'r' },
      { text: 'HOURS', face: 'f400', cap: 0.36, x: -0.03, y: 1, yCap: 0.12, align: 'l' },
    ],
    side: [
      { text: 'Night edition', role: 'caps', at: 'l', row: 0 },
      { text: 'for the record', role: 'italic', at: 'r', row: 0 },
      { text: 'Plate IX', role: 'thin', at: 'r', row: -1 },
    ],
    deco: {
      ringed: 'No.',
      ring: [0.1, 0.66],
      texture: [
        { at: [0.82, 0.64], text: 1, w: 142 },
        { at: [0.035, 0.34], text: 4, w: 124 },
      ],
      metaL: 'Visual archive',
      metaR: 'Frame 16',
    },
  },
  {
    word: 'TRAVEL',
    face: 'f900',
    slots: 1,
    drift: 'right',
    driftPx: 38,
    sheet: 'passport',
    giants: [{ text: 'VISA', face: 'f900', cap: 0.44, x: -0.03, y: 0.3, align: 'l' }],
  },
  // ── THOUGHT ──
  {
    word: 'THOUGHT',
    face: 'fit',
    slots: 1,
    drift: 'right',
    driftPx: 40,
    giants: [
      { text: 'DAY', face: 'f900', cap: 0.43, x: -0.03, y: 0.34, align: 'l' },
      { text: 'BOOK', face: 'f400', cap: 0.38, x: 1.03, y: 1, yCap: 0.14, align: 'r' },
    ],
    side: [
      { text: 'Untitled', role: 'caps', at: 'l', row: 0 },
      { text: 'in passing', role: 'italic', at: 'r', row: 0 },
      { text: 'Volume II', role: 'thin', at: 'l', row: 1 },
    ],
    deco: {
      ringed: 'The',
      ring: [0.9, 0.3],
      texture: [
        { at: [0.82, 0.62], text: 2, w: 140 },
        { at: [0.035, 0.62], text: 0, w: 126 },
      ],
      metaL: 'Visual archive · Vol. IV',
      metaR: 'Frame 18',
    },
  },
  {
    word: 'THOUGHT',
    face: 'mono',
    slots: 2,
    drift: 'down',
    driftPx: 32,
    sheet: 'telegram',
    giants: [{ text: 'TELEGRAM', face: 'f900', cap: 0.4, x: 0.5, y: 0.2, align: 'c' }],
  },
  {
    word: 'THOUGHT',
    face: 'f900',
    slots: 1,
    drift: 'down',
    driftPx: 36,
    giants: [
      { text: 'STILL', face: 'f400', cap: 0.4, x: 1.03, y: 0.33, align: 'r' },
      { text: 'LIFE', face: 'f900', cap: 0.45, x: 0.36, y: 1, yCap: 0.48, align: 'c' },
    ],
    side: [
      { text: 'First printing', role: 'caps', at: 'l', row: 0 },
      { text: 'written down', role: 'italic', at: 'r', row: 0 },
      { text: 'Frame', role: 'thin', at: 'r', row: 1 },
    ],
    deco: {
      ringed: 'a',
      ring: [0.1, 0.3],
      texture: [
        { at: [0.83, 0.62], text: 3, w: 136 },
        { at: [0.035, 0.62], text: 1, w: 130 },
      ],
      metaL: 'Contact sheet 20',
      metaR: 'Frame 20',
    },
  },
  {
    word: 'THOUGHT',
    face: 'fit',
    slots: 1,
    drift: 'right',
    driftPx: 34,
    sheet: 'notebook',
    giants: [{ text: 'NOTES', face: 'f400', cap: 0.4, x: 1.03, y: 1, yCap: 0.35, align: 'r' }],
  },
  {
    word: 'THOUGHT',
    face: 'f400',
    slots: 1,
    drift: 'right',
    driftPx: 40,
    giants: [
      { text: 'INK', face: 'f900', cap: 0.45, x: -0.02, y: 0.35, align: 'l' },
      { text: 'PAPER', face: 'f400', cap: 0.36, x: 1.03, y: 1, yCap: 0.12, align: 'r' },
    ],
    side: [
      { text: 'Second printing', role: 'caps', at: 'l', row: 0 },
      { text: 'still developing', role: 'italic', at: 'r', row: 0 },
      { text: 'Folio', role: 'thin', at: 'l', row: -1 },
    ],
    deco: {
      ringed: 'on',
      ring: [0.9, 0.66],
      texture: [
        { at: [0.82, 0.3], text: 4, w: 138 },
        { at: [0.035, 0.64], text: 2, w: 128 },
      ],
      metaL: 'Visual archive',
      metaR: 'Frame 22',
    },
  },
  // ── YOU ──
  {
    word: 'YOU',
    face: 'fit',
    slots: 2,
    drift: 'up',
    driftPx: 32,
    sheet: 'postcard',
    giants: [{ text: 'POST CARD', face: 'f900', cap: 0.36, x: 0.5, y: 0.19, align: 'c' }],
  },
  {
    word: 'YOU',
    face: 'sg700',
    slots: 1,
    drift: 'up',
    driftPx: 36,
    giants: [
      { text: 'DEAR', face: 'f900', cap: 0.44, x: -0.03, y: 0.34, align: 'l' },
      { text: 'READER', face: 'f400', cap: 0.36, x: 1.03, y: 1, yCap: 0.12, align: 'r' },
    ],
    side: [
      { text: 'Admitted', role: 'caps', at: 'l', row: 0 },
      { text: 'yours', role: 'italic', at: 'r', row: 0 },
      { text: 'Appendix', role: 'thin', at: 'r', row: 1 },
    ],
    deco: {
      ringed: 'The',
      ring: [0.1, 0.66],
      texture: [
        { at: [0.82, 0.62], text: 0, w: 140 },
        { at: [0.035, 0.36], text: 3, w: 126 },
      ],
      metaL: 'Visual archive · Vol. V',
      metaR: 'Frame 24',
    },
  },
  {
    word: 'YOU',
    face: 'f900',
    slots: 4,
    drift: 'up',
    driftPx: 44,
    giants: [
      { text: 'FIRST', face: 'f400', cap: 0.4, x: 0.5, y: 0.33, align: 'c' },
      { text: 'LIGHT', face: 'f900', cap: 0.45, x: 0.5, y: 1, yCap: 0.5, align: 'c' },
    ],
    side: [
      { text: 'Admit one', role: 'caps', at: 'l', row: 0 },
      { text: 'the passenger', role: 'italic', at: 'r', row: 0 },
      { text: 'Last frame', role: 'thin', at: 'l', row: 1 },
    ],
    deco: {
      ringed: 'a',
      ring: [0.9, 0.3],
      texture: [
        { at: [0.82, 0.62], text: 1, w: 140 },
        { at: [0.035, 0.62], text: 2, w: 130 },
      ],
      metaL: 'Visual archive',
      metaR: 'Frame 25 · End of roll',
    },
  },
];
/** The scenes each layout plays (indices into SCENES): every one on both. */
export const ACT3: Record<FilmLayout, readonly number[]> = {
  desktop: SCENES.map((_, i) => i),
  phone: SCENES.map((_, i) => i),
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
  /** f9–11: all of it darkens to a deep brown-black and slides out at 6° —
   *  UP, the way the last cut drifts and the slip went (the motion runs on;
   *  a slide down would reverse it). */
  out: [9, 12] as const,
  darkness: [0.38, 0.68, 0.9] as const,
  slide: [-0.1, -0.38, -0.86] as const,
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
  // The flicker is the burn's first three frames only (f0–2), as the spec
  // has it: a short flutter, not a strobe running into the burn.
  const flick = f < BURN.flicker[1] ? (f % 2 === 0 ? 1 : -1) * (0.45 + rand() * 0.55) : 0;
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
    y = -1.2;
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
/** The typed line turns into the title: struck in capitals on the beat the
 *  title begins (the letters in the same cells), then every typewriter
 *  capital turns into its Fraunces capital in one shared ink box
 *  (GLYPH_MORPH) as the line grows to the title's size; the credits come up
 *  under it. */
export const TITLE = {
  morph: 375,
  swap: GLYPH_MORPH.fade,
  box: GLYPH_MORPH.box,
  cursorOut: 120,
  sub: [250, 480] as const,
  you: [300, 500] as const,
  rise: 10,
} as const;
/** The end title's words (PROPOSED: the YOU line). His name is set in
 *  capitals, exactly as the first screen sets it (Fraunces 400, capitals,
 *  the same size and tracking), so the name flies home without changing
 *  face: a word that is the same on both ends is only moved. */
export const TITLE_NAME = 'Ryan Xu';
export const TITLE_SUB = ['CAMERA', 'ARCHIVE', 'TRAVEL', 'THOUGHT'] as const;
export const TITLE_YOU = { lead: 'Admit one', word: 'YOU' } as const;

// ── Acts' lengths ─────────────────────────────────────────────────────────
export const ACT_MS = {
  /** Act 1: the machines' twelfths. */
  type: STYLES.reduce((s, x) => s + x.frames, 0) * FRAME12_MS,
  /** Act 2: the sweep and the glide. */
  find: FIND.sweepMs + FIND.glideMs,
  /** Act 4: 24 frames at 24 fps. */
  burn: 24 * FRAME24_MS,
  /** Act 5: the dark, typed (eight beats). */
  dark: 8 * BEAT_MS,
  /** Act 6: the end title (five beats). */
  title: 5 * BEAT_MS,
} as const;

// ── The plan: the whole film as spans on one clock ────────────────────────
export type ActId = 'type' | 'find' | 'cuts' | 'burn' | 'dark' | 'title';
export interface CutPlan extends Span {
  /** The scene (index into SCENES). */
  index: number;
  word: Keyword;
  face: AnchorFace;
  drift: Drift;
}
export interface FilmPlan {
  layout: FilmLayout;
  acts: Record<ActId, Span>;
  styles: (Span & { id: StyleId })[];
  /** Act 1: when each character of TYPED appears. */
  typing: number[];
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

/** A time on a grid, exact to a nanosecond (the film's clock is a float). */
const onGrid = (n: number, unit: number) => Math.round(n * unit * 1e6) / 1e6;

export function filmPlan(layout: FilmLayout): FilmPlan {
  let f = 0;
  const styles = STYLES.map((s) => {
    const span = { id: s.id, start: onGrid(f, FRAME12_MS), end: onGrid(f + s.frames, FRAME12_MS) };
    f += s.frames;
    return span;
  });
  const typeEnd = onGrid(f, FRAME12_MS);
  const typing = relayTimes(styles);
  const find = { start: typeEnd, end: onGrid(typeEnd / FRAME12_MS + 6, FRAME12_MS) };
  const order = ACT3[layout];
  let slot = 0;
  const cuts: CutPlan[] = order.map((index) => {
    const s = SCENES[index];
    const start = onGrid(find.end / CUT_MS + slot, CUT_MS);
    slot += s.slots;
    return { index, word: s.word, face: s.face, drift: s.drift, start, end: onGrid(find.end / CUT_MS + slot, CUT_MS) };
  });
  const cutsAct = { start: find.end, end: cuts[cuts.length - 1].end };
  const burn = { start: cutsAct.end, end: onGrid(cutsAct.end / FRAME24_MS + 24, FRAME24_MS) };
  const dark = { start: burn.end, end: burn.end + ACT_MS.dark };
  const title = { start: dark.end, end: dark.end + ACT_MS.title };
  const darkTyping = typeTimes(DARK_TYPED, dark.start + DARK_TYPE_AT, dark.start + DARK_TYPE_AT + ((DARK_TYPED.length - 1) * 1000) / DARK_CPS, 18, 77);
  // The blink: off half a period before the title… and on again as it begins.
  const blink = { start: title.start - CURSOR_MS / 2, end: title.start };
  return {
    layout,
    acts: { type: { start: 0, end: typeEnd }, find, cuts: cutsAct, burn, dark, title },
    styles,
    typing,
    sweep: { start: find.start, end: onGrid(find.start / FRAME12_MS + 2, FRAME12_MS) },
    glide: { start: onGrid(find.start / FRAME12_MS + 2, FRAME12_MS), end: find.end },
    cuts,
    darkTyping,
    blink,
    length: title.end,
  };
}

/** The act-1 cursor on the film's clock: blinking before the first letter,
 *  solid while it types, blinking again after the last (until the glide
 *  carries it off). The times its ink changes, and to what. */
export function cursorSteps(plan: FilmPlan): [number, 0 | 1][] {
  const first = plan.typing[0];
  const last = plan.typing[plan.typing.length - 1];
  const before = blinkSteps(0, first);
  const out: [number, 0 | 1][] = [...before];
  if (before.length && before[before.length - 1][1] === 0) out.push([first, 1]);
  return out.concat(blinkSteps(last, plan.glide.end));
}

/** Every hard cut of a plan: the machines, the acts, the match cuts. */
export function hardCuts(plan: FilmPlan) {
  const out = new Set<number>();
  plan.styles.forEach((m) => out.add(m.start));
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
    if (last && last.tone === tone && Math.abs(last.end - start) < 1e-6) last.end = end;
    else out.push({ start, end, tone });
  };
  plan.styles.forEach((m) => push(m.start, m.end, STYLE_TONE[m.id]));
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
// Act 2 (the typewriter's ARCHIVE into Fraunces's ARCHIVE), act 6 (the typed
// RYAN XU into the title) and the landing hold both faces to ONE ink box: the
// same centre and height, and one shared width that goes from the first
// face's to the second's — so the crossfade (one window, no blur) is a morph
// of letterforms, never a double image.
/** A letter's ink box (px, in the frame both faces share). */
export interface InkBox {
  l: number;
  r: number;
  t: number;
  b: number;
}
/** The morph's progress (0 → 1, eased) at share u of a move, across `win`. */
export function morphAt(u: number, win: readonly [number, number]) {
  const x = segment(u, win[0], win[1]);
  return x * x * (3 - 2 * x);
}
/** The one ink box a letter and its counterpart share at progress p. */
export function lerpBox(a: InkBox, b: InkBox, p: number): InkBox {
  return { l: lerp(a.l, b.l, p), r: lerp(a.r, b.r, p), t: lerp(a.t, b.t, p), b: lerp(a.b, b.b, p) };
}
/** The transform that sets a letter (its ink box `ink`, its pen at x `pen`
 *  on the baseline `base`, the transform's origin) into the box `to`:
 *  translate(tx, ty) scale(sx, sy). Its own box gives the identity. */
export function glyphFit(ink: InkBox, pen: number, base: number, to: InkBox) {
  const sx = (to.r - to.l) / Math.max(1e-3, ink.r - ink.l);
  const sy = (to.b - to.t) / Math.max(1e-3, ink.b - ink.t);
  return { sx, sy, tx: to.l - pen - sx * (ink.l - pen), ty: to.t - base - sy * (ink.t - base) };
}

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
   *  leads the slide (`yLead`: each word drops to its own line first, so
   *  two words bound for different lines never cross on one). */
  start: 0,
  stagger: 30,
  fly: 420,
  yLead: 0.6,
  /** The shared ink boxes, letter by letter, title's → page's, as a share
   *  of the flight (a word whose face does not change is only moved). */
  morph: [0.3, 0.64] as const,
  /** The swap of the faces (Space Grotesk capitals → the page's Fraunces):
   *  one instant, the same for both, in the middle of the morph at the
   *  flight's fastest, where the two share one ink box — never a frame
   *  with both (a 42 ms crossfade showed CAMERA over camera). */
  sourceOut: [0.47, 0.47] as const,
  targetIn: [0.47, 0.47] as const,
  /** The rest of the opening words (the line's other words, the kicker,
   *  the scroll cue, the nav last) comes up round the landed words — once
   *  the last word is home (landingAEnd), so nothing comes up under a word
   *  still sliding in ('that' under 'thought'). */
  rest: 560,
  done: 700,
  /** The end title's YOU line, when the page has no place for YOU to fly
   *  to: gone before the first flight reaches its row (never crossed). */
  youOut: [0, 100] as const,
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

// ── His photographs ────────────────────────────────────────────────────────
// Three of his frames play parts: the life behind the pill (blurred), the
// small print pinned to the grid paper (black and white), the magazine's
// picture page. Each at its own ratio (never cropped or stretched), one per
// chapter where there are enough.
export interface OpeningPicture {
  src: string;
  ratio: number;
}
interface PictureSource {
  imageUrl?: string | null;
  width?: number | null;
  height?: number | null;
}
/** A photograph's ratio for the film: landscape-ish (a portrait frame
 *  would leave the pill's life a sliver and the magazine's plate a strip). */
export const PICTURE_RATIO = [1.2, 1.8] as const;
/** Each role's width, px (the blurred life needs next to nothing). */
export const PICTURE_W = [96, 480, 900] as const;
export function pickPictures(groups: readonly { photos?: readonly PictureSource[] | null }[], count = 3): OpeningPicture[] {
  const usable = (p: PictureSource) => {
    if (!p.imageUrl || !p.width || !p.height) return false;
    const r = p.width / p.height;
    return r >= PICTURE_RATIO[0] && r <= PICTURE_RATIO[1];
  };
  const chosen: PictureSource[] = [];
  for (let round = 0; chosen.length < count && round < 3; round += 1) {
    for (const group of groups) {
      if (chosen.length >= count) break;
      const pick = (group.photos ?? []).filter(usable)[round];
      if (pick && !chosen.includes(pick)) chosen.push(pick);
    }
  }
  return chosen.map((p, i) => {
    const sep = p.imageUrl!.includes('?') ? '&' : '?';
    return { src: `${p.imageUrl}${sep}w=${PICTURE_W[i] ?? 640}&q=62&auto=format`, ratio: Math.round((p.width! / p.height!) * 10000) / 10000 };
  });
}

// ── The fonts, loaded before the clock starts ─────────────────────────────
// Every face and weight the film sets (document.fonts.load each, with the
// characters it sets, so the right subset comes). No cut may show a
// fallback face: the clock waits for these (and for his photographs to be
// decoded) at most FONT_WAIT_MS — past that the film plays on whatever has
// come.
export const FONT_LOADS = [
  '900 100px Fraunces',
  '400 100px Fraunces',
  'italic 400 100px Fraunces',
  'italic 500 100px Fraunces',
  '700 20px "Space Grotesk"',
  '600 20px "Space Grotesk"',
  '500 20px "Space Grotesk"',
] as const;
export const FONT_SAMPLE = 'ARCHIVECMTLOUGYZNPBFRWDSK abcdefghijklmnopqrstuvwxyz 0123456789 ·°—/.,′’';
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
