// ── The opening film: a retro editorial type film (v6) ──
// The homepage opens on a short film (src/components/home/OpeningFilm.tsx,
// its scenes in OpeningScenes.tsx, its materials in src/styles/opening.css).
// The owner's spec (2026-09-28, "复古编辑部动态排版") and his changes of
// 2026-09-29 (no place names — keep the suspense; match cuts through many
// kinds of printed matter round a fixed lime anchor; a typed line relayed
// across machines; no limit on the length; the single words FIRST, then the
// relay — "先单独的字，再轮到打字接力"; richer, more layered pages; black-and-
// white pages and a stronger colour rhythm, in runs, never abrupt), in six
// acts, after a count-in:
//
//   0. The proof (1 s, before the clock). The owner, 2026-09-29: "然后开头
//      动画最开端是直接播放，有点突兀了，可以加一个小小的开场" (the very
//      start just plays, a little abrupt: add a small opening). The first
//      paint is a printer's proof on the newspaper's own newsprint, a flat,
//      even sheet: the lights go down, the lime plate prints the anchor's
//      block, the ink plate prints ARCHIVE into it, and the first page is
//      printed round it — four beats a third of a second apart, on the
//      film's sixth, then the cuts at double time. Light on light: it turns
//      nothing over. It is what the reader sees while the island and the
//      faces come (the busy first page used to sit there frozen, about to
//      snap): on a slow load the blank proof holds under the lights, and
//      the plates and the page follow on the clock, never a lone lime bar.
//   1. Match cuts round a fixed lime anchor (3⅓ s, 17 scenes on a sixth of
//      a second — the owner's "缩短3-4秒", 2026-09-29, took it down from 5.7 s
//      and 25): ARCHIVE → CAMERA → TRAVEL → THOUGHT → YOU. The first paint
//      is the proof (act 0), with the first page drawn under it, unseen.
//      The block's centre, its height and the word's cap
//      height never move; only the word and its face change (Fraunces 900,
//      Fraunces italic, Space Grotesk 700, Fraunces 400, the monospace).
//      Round it the frame is recomposed every cut, alternating an editorial
//      page (giant cropped Fraunces words drifting with a motion blur of
//      pre-drawn copies; words beside the anchor; layered print — a taped
//      photograph, a torn clipping, a receipt, a stamp, a margin note, a pull
//      quote, registration marks) and a piece of printed matter built round
//      the word (a newspaper, a dictionary, a magazine, a slate, a ticket, a
//      passport, a telegram, a postcard). The colour comes in runs: paper
//      for ARCHIVE, black and white for CAMERA, the ticket stocks' brown and
//      maroon for TRAVEL, paper again for THOUGHT and YOU.
//   2. The hand-off: the page cuts away under the anchor; the lime block
//      alone glides and shrinks into the first machine's cursor.
//   3. A typewriter relay (2⅓ s): "an archive of travel" is typed, and every
//      few letters the whole frame hard-cuts to another machine — a 1-bit
//      desktop computer, a dark terminal, a strip of film on a lightbox, a
//      label maker's tape, a word processor, a bare page, grid paper, a
//      typewriter — slow to fast, each in its own face (a bitmap, a dot
//      matrix, an edge print, embossed capitals, a sans, a serif, a hand, the
//      typewriter's), all on one left edge, one baseline, one cap height; the
//      typed count carries on across every cut.
//   4. A film burn, stepped at 24 fps, on the typewriter's paper: flicker,
//      scratches and gate weave, a frame slip, a burn spreading from the
//      line on an fbm mask (a WebGL shader on its own canvas), the frame
//      darkening and sliding out at 6°, a black frame, six leader cards one
//      frame each, and a row of lit sprocket holes into the dark.
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
// the match cuts on the sixth of a second (CUT_MS: 10 vsyncs at 60 Hz, 20 at
// 120 Hz), the hand-off and the relay on the twelfth (FRAME12_MS), the burn
// on the 24th, the dark and the title on the eighth (BEAT_MS); the anchor
// never moves; the drift runs on across a cut (the same way or a quarter
// turn); no fallback face, no blank frame, no dropped frame at a cut (the
// fonts and his photographs are in before the clock starts, every page is
// drawn a quarter second before its cut, and everything is transform and
// opacity on one clock). The proof's beats are on the same sixth, counted
// from its first frame: the clock is taken from the proof's own start
// (filmStart), so the count-in and the cuts are one grid.
//
// It plays once a tab session (src/lib/reelVisit.ts). While it plays (the
// proof too), ONLY the Skip pill skips it (to the end title and a hurried
// landing — never a hard cut to the page); a wheel, a touch, a key or a click anywhere else
// does nothing at all (the page's scroll is held). Reduced motion gets the
// end title as a still and a calm crossfade.
//
// Everything in this module is pure (no DOM): the whole film is DATA here —
// the acts, the scenes (each {face, ground, giants, side words, layers} or a
// sheet of printed matter), the machines, the burn's frames — and the island
// only samples it by time. scripts/opening-film.test.mjs holds it to account
// offline.

import { EASE, bezierFn, type Bezier } from './motion';

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
/** The match cuts: one every sixth of a second (the guidance's 5 frames at
 *  30 fps; ten vsyncs at 60 Hz, twenty at 120 Hz — never a judder). */
export const CUT_MS = 1000 / 6;
/** The hand-off and the relay cut on the twelfth of a second (five vsyncs at
 *  60 Hz, ten at 120 Hz). */
export const FRAME12_MS = 1000 / 12;
/** The dark, the title and the landing: the eighth of a second. */
export const BEAT_MS = 125;
/** The burn is stepped at 24 fps. */
export const FRAME24_MS = 1000 / 24;
/** Below this width the page is the compact tree (HomePage's `lg`). */
export const PHONE_MAX_WIDTH = 1023;

export type FilmLayout = 'desktop' | 'phone';
/** How a frame reads, for the flash budget: light, dark, or a mid ground (a
 *  sheet of paper on a stock-coloured desk) that turns nothing over. */
export type Tone = 'light' | 'mid' | 'dark';
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

// ── Act 0: the proof (a count-in, before the clock) ───────────────────────
// The film opens on the newspaper's own newsprint as a printer's proof: a
// flat, even sheet with its marks and its slug. The lights go down (the
// frame's vignette comes in), the lime plate prints the anchor's block, the
// ink plate prints its word, and the page is printed round it — four beats
// a third of a second apart, then the cuts at double time. The stylesheet
// plays the first beat only (the lights, from the first paint, so a slow
// island is waited for under a finished page, never a still one first); the
// island prints BOTH plates on the film's clock, a third of a second apart,
// and lets the proof go at film 0 — so the lime never stands alone on the
// sheet for longer than its beat, however slow the load (it used to print
// on the stylesheet's clock and then wait, a lone bar that read as a
// loading bar, for the island's), and the word never prints in a stand-in
// face (its face is waited for: PROOF_FACE). On a slow load the proof holds
// as it is, a blank sheet under the lights with its marks and its slug.
// The film's grain comes with the first plate (on the blank sheet a moving
// grain showed its tile's seams while the tile was still loading). It lives
// before the clock (film −PRELUDE_MS … 0): no act, no act time, no cut
// moves. Light on light (newsprint, then lime, a change of hue, not of
// light): it turns nothing over.
export const PRELUDE = {
  /** Sixths before the page: the first paint, the lime plate, the ink plate. */
  beats: { paint: 6, lime: 4, word: 2 },
  /** The lights go down across this many sixths from the first paint (the
   *  stylesheet; the first paint is a flat, even sheet). */
  lights: 2,
  /** The lime plate before its beat: drawn, never seen (the pages' own warm
   *  opacity: its raster is done before it prints). */
  unprinted: 0.002,
  /** The lime plate's first impression, and its ink setting to full (ms, on
   *  the house curve). */
  limeInk: 0.64,
  set: 250,
  /** The newspaper's newsprint (.of-sheet--newspaper): proof and first page
   *  are one sheet, so only ink arrives with the page. */
  ground: '#e9e5d8',
  /** Never quite opaque: the page under it stays rastered (never occlusion-
   *  culled), and unseen (under half an 8-bit level). */
  sheet: 0.998,
} as const;
export const PRELUDE_MS = PRELUDE.beats.paint * CUT_MS; // 1000
/** The clock is laid this much ahead of the proof's grid: the proof's beats
 *  (and so every cut after them) fall exactly on frame times — a sixth is
 *  ten vsyncs from the proof's first frame — and a step laid exactly on a
 *  frame's time is taken on that frame or the next by a rounding. A hair
 *  ahead, it is always taken on its own frame (and never on the one
 *  before: that is a whole frame away). */
export const GRID_HAIR_MS = 0.25;
/** The lime plate on the film's clock: held unprinted to its beat, then its
 *  first impression setting to full on the house curve (`samples` steps of
 *  25 ms, linear between: under 0.013 of opacity off the curve anywhere). */
export function proofLimeKeys(samples = 10) {
  const lime = -PRELUDE.beats.lime * CUT_MS;
  const curve = bezierFn(EASE.arrive);
  const out: { t: number; opacity: number }[] = [
    { t: -PRELUDE_MS, opacity: PRELUDE.unprinted },
    { t: lime, opacity: PRELUDE.unprinted },
    { t: lime, opacity: PRELUDE.limeInk },
  ];
  for (let i = 1; i <= samples; i += 1) {
    const u = i / samples;
    out.push({ t: lime + PRELUDE.set * u, opacity: PRELUDE.limeInk + (1 - PRELUDE.limeInk) * curve(u) });
  }
  return out;
}
/** The proof's slug, at its foot (PROPOSED copy; no place names, and not his
 *  name — the film ends on it). The plates' labels come with their plates. */
export const PROOF_SLUG = { head: 'Proof 01', wide: '— Visual archive', plates: ['· Plate 1 lime', '· Plate 2 ink'] } as const;

/** Film 0 (the page) on document.timeline. `origin`: the proof's first frame
 *  (its stylesheet animation's start time), or null; `ready`: the earliest
 *  the island's keyframes take effect (now + CLOCK_LEAD_MS). Both plates
 *  are the island's, so the lime falls on the first sixth of the proof's
 *  grid at or after `ready` (never before its own beat), the word a third
 *  of a second after it, the page a third of a second after that. Without
 *  an origin (no proof to count from), the lime when ready. */
export function filmStart(origin: number | null, ready: number) {
  const lime = PRELUDE.beats.lime * CUT_MS;
  if (origin == null) return ready + lime;
  const beat = origin + PRELUDE_MS - lime;
  const k = Math.max(0, Math.ceil((ready - beat) / CUT_MS - 1e-6));
  return origin + PRELUDE_MS + k * CUT_MS;
}

/** The first paint's anchor as the stylesheet sets it (opening.css --c0 and
 *  --c0w), per cap height: the widest keyword's block (THOUGHT in Fraunces
 *  400, 6.7286 caps of ink at 100 px, and its padding), and the first
 *  word's (ARCHIVE in Fraunces 900 at its set size — its largest optical
 *  size on the desktop; 65 px on a 390 px phone, where the optical size
 *  draws it wider). The island lays the anchor's cap and the first block
 *  from these, always (derive, don't sample): the lime block is drawn
 *  (unseen) from the first paint where the stylesheet sets it, and must
 *  never move or change size when the island takes it over and prints it —
 *  in any face state, on any engine, at any width. (They were measured again when the film lost eight pages: the
 *  widest word had gone with them, and the phone's block jumped 10 px at
 *  the clock.) */
export const FIRST_PAINT = {
  desktop: { across: 7.4087, key0: 7.062 },
  phone: { across: 7.4087, key0: 7.598 },
} as const;

// ── Act 1: the fixed anchor and its match cuts ────────────────────────────

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
  /** The reading zone: the block and this much round it (shares of the cap
   *  height) is kept clear of every page's print but the words on its line. */
  clear: 0.3,
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
/** The reading zone round a block (kept clear of the page's print). */
export function readingZone(block: Box, cap: number): Box {
  const m = cap * ANCHOR.clear;
  return { x: block.x - m, y: block.y - m, w: block.w + 2 * m, h: block.h + 2 * m };
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

/** The page's ground: paper (bone, a warmer stock, a photocopy's grey-
 *  white), the dark neutrals (ink, olive, the new-york slate) and the ticket
 *  stocks (the rust brown, the maroon, the plum) — the site's own, deep and
 *  desaturated, in runs. */
export type Ground = 'bone' | 'warm' | 'copy' | 'ink' | 'olive' | 'slate' | 'rust' | 'maroon' | 'plum';
/** An ink a light page may print its giant words, a duotone or a stamp in. */
export type Stock = 'ink' | 'maroon' | 'blue' | 'plum' | 'green' | 'rust' | 'slate' | 'bone';
export const GROUND_TONE: Record<Ground, Tone> = {
  bone: 'light',
  warm: 'light',
  copy: 'light',
  ink: 'dark',
  olive: 'dark',
  slate: 'dark',
  rust: 'dark',
  maroon: 'dark',
  plum: 'dark',
};
/** The grounds' colours (and the stocks', src/lib/ticketStock.ts). */
export const GROUND_HEX: Record<Ground, string> = {
  bone: '#f1efe7',
  warm: '#e8dfcb',
  copy: '#eeeee8',
  ink: '#1b1f19',
  olive: '#282c20',
  slate: '#35383e',
  rust: '#593d1b',
  maroon: '#562f2e',
  plum: '#492d43',
};

/** An editorial page's layers (drawn under the giant words, over its
 *  ground; each placed by the island clear of the anchor's reading zone,
 *  the words on its line and the frame's print — at its place when that is
 *  clear, else the nearest clear place, else not at all). `at` is where it
 *  wants to be (shares of the viewport), `w` its width (a share of the
 *  width). Copy is PROPOSED (decorative; nothing in it is a fact about him).
 *  `phone`: kept on the phone (the rest thins out there). */
export interface Print {
  /** Which of his photographs (OpeningPicture index), at its own ratio. */
  pic: 0 | 1 | 2;
  treat: 'halftone' | 'duotone' | 'negative' | 'blown';
  ink?: Stock;
  at: Vec2;
  w: number;
  rot: number;
  caption: string;
  tape?: boolean;
  phone?: boolean;
}
export interface Layers {
  /** A crowded collage or a calm page with fine detail (the rhythm
   *  breathes). */
  density: 'dense' | 'calm';
  /** The running head across the page's top: its title and its folio. */
  run?: readonly [string, string];
  print?: Print;
  /** A torn clipping laid on the page: its headline and a paragraph
   *  (TEXTURE index). */
  clip?: { head: string; text: number; at: Vec2; w: number; rot: number; phone?: boolean };
  /** A pull quote between rules. */
  pull?: { text: string; at: Vec2; w: number; phone?: boolean };
  /** A margin note in a hand (Fraunces italic) with an arrow. */
  note?: { text: string; at: Vec2; rot: number; arrow: 'l' | 'r' | 'u' | 'd'; phone?: boolean };
  /** A rubber stamp in a stock's ink. */
  stamp?: { text: string; sub: string; shape: 'round' | 'box'; ink: Stock; at: Vec2; rot: number; phone?: boolean };
  /** A slip of receipt paper, typed. */
  receipt?: { lines: readonly string[]; at: Vec2; rot: number };
  /** A circled number and what it points at. */
  num?: { n: string; text: string; at: Vec2 };
  /** A barcode sticker and its number. */
  barcode?: { code: string; at: Vec2 };
  /** Index tabs down the frame's right edge (the first one pulled). */
  tabs?: readonly string[];
  /** Registration marks, crop marks and a grey colour bar (a proof). */
  marks?: boolean;
}

/** The printed matter (each drawn by its own sheet in OpeningScenes). */
export type SheetKind = 'newspaper' | 'dictionary' | 'magazine' | 'slate' | 'ticket' | 'passport' | 'telegram' | 'postcard';
/** How each sheet reads (its paper, or the dark it is laid on). */
export const SHEET_TONE: Record<SheetKind, Tone> = {
  newspaper: 'light',
  dictionary: 'light',
  magazine: 'dark',
  slate: 'dark',
  ticket: 'mid',
  passport: 'mid',
  telegram: 'light',
  postcard: 'light',
};
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
  /** Their ink on a light page (a second colour, printed); bone on a dark
   *  one. */
  ink?: Stock;
  /** An editorial page: its ground, the words beside the anchor, its small
   *  print and its layers. A piece of printed matter: its sheet (the words
   *  round the anchor are the sheet's own, in SHEETS). */
  ground?: Ground;
  side?: readonly Side[];
  deco?: Deco;
  layers?: Layers;
  sheet?: SheetKind;
}
/** How a scene reads (the flash budget is counted on this). */
export const sceneTone = (s: Scene): Tone => (s.sheet ? SHEET_TONE[s.sheet] : GROUND_TONE[s.ground ?? 'bone']);

/** The grey texture: tiny paragraphs, too small to read (the film's own
 *  words, PROPOSED; no place in them). */
export const TEXTURE = [
  'Every archive begins as a drawer. Somewhere between the first roll and the hundredth, the pictures stop being souvenirs and start being a record: of light on one particular afternoon, of a street that has since changed its name.',
  'Nobody sets out to keep one. The contact sheets pile up, the envelopes are labelled in pencil and then in ink, and one winter the labels are moved into a ledger with the date, the place and the frame number beside each.',
  'Read in order, the frames make a route. Read out of order, they make something closer to a mind: the same corner of light, again and again, in different countries.',
  'A camera is a patient machine. It waits for the light as long as its keeper does, and forgets nothing it was shown, not even the things he did not mean to show it.',
  'The road is mostly waiting: for a bus, for the weather, for the one minute in an afternoon when a street arranges itself and the shutter can be let go.',
  'A print is a decision made twice: once at the window, once in the dark. The second is slower, and kinder, and it is the one that is kept.',
  'Grain is the weather of a photograph. Push the film and it thickens like a coming storm; pull it and the frame goes still as a held breath.',
  'The envelope says what the negatives cannot: which roll, which month, which of the thirty-six was worth a second look under the loupe.',
] as const;

/** The credit along the foot of every editorial page (centred). */
export const CREDIT = 'Ryan Xu · A personal archive of travel and thought';

/** The printed matter's words (PROPOSED copy, except the dictionary, which
 *  is Webster's 1913 — public domain). `row`: the words either side of the
 *  anchor on its line; `above` / `below`: the lines over and under it. No
 *  place in any of it, but for the two eggs (EGGS). */
export const SHEETS = {
  newspaper: {
    edition: ['Saturday Edition', 'No. 1,204', 'Two Cents'],
    ears: ['Fair, the light holding late', 'Late final'],
    row: ['From the', 'Photographs, letters and notes'],
    headline: 'What a drawer of negatives remembers',
    deck: 'Thirty-six frames to a roll, and the ones worth a second look',
    dateline: 'MIAMI —',
    body: [0, 1, 2, 3, 4, 5],
    pull: 'The labels moved from pencil into ink.',
    caption: 'A contact sheet, printed full frame.',
    jump: 'Continued, col. 6',
    index: [
      ['Letters', '4'],
      ['Notes', '6'],
      ['Frames', '9'],
    ],
    folio: 'A1',
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
    tabs: ['A', 'B', 'C', 'D', 'E', 'F'],
    fig: 'Fig. 12. — A press of drawers.',
    key: 'ā, as in fāte; ă, as in făt; ä, as in fär; ē, as in mēte; ĭ, as in ĭn; ō, as in ōld; ŏ, as in nŏt',
    note: 'cf. record',
  },
  magazine: {
    kicker: 'The Picture Issue — Feature',
    deck: 'Twenty-four frames a second, and the one that stays.',
    row: ['', 'obscura'],
    body: [
      'A film is mostly forgotten on the way home. What stays is a frame or two: a face turned to a window, a road seen through a windscreen, the exact grey of a harbour at five.',
      'A photograph works the other way round. It is the one frame, chosen and kept; the film it came from, the walk and the waiting and the weather, is the part the viewer supplies.',
    ],
    pull: 'The one frame, chosen and kept.',
    caption: 'Photograph: Ryan Xu',
    runs: ['The Picture Issue', 'Feature'],
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
    tape: 'mos',
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
    seat: [
      ['Coach', 'C'],
      ['Seat', '14'],
      ['Class', '2'],
    ],
    punch: 'Checked',
    receipt: ['Fare', '1 × single', 'Paid', 'Thank you'],
    code: '4127 0417 11',
  },
  passport: {
    row: ['Visas', 'Endorsements'],
    stamps: ['Admitted', 'Entry', 'Exit', 'No. 36'],
    park: 'ZION NATIONAL PARK · UT',
    mrz: 'P<ARCHIVE<<TRAVEL<<THOUGHT<<<<<<<<<<<<<<<<',
    mrz2: '0417002536<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<04',
    page: '17',
    serial: '0417025',
  },
  telegram: {
    fields: ['Received at 16.40', 'Words 17', 'Charges paid'],
    above: 'ARRIVED STOP LIGHT HOLDING STOP',
    row: ['', 'OF THE SEA ALL DAY STOP'],
    below: 'MORE FILM TOMORROW STOP',
    stamp: ['Received', '16.40'],
    clerk: 'ck 14',
  },
  postcard: {
    row: ['thinking of', '— as ever,'],
    below: 'Wish you were here. The light holds late; I keep missing the last bus to photograph it.',
    stamp: 'Postage',
    mark: 'Post office',
    airmail: 'Par avion · By air mail',
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

/** Receipts' lines (PROPOSED, decorative). */
const RECEIPT_LAB = ['DEV + CONTACT', '135 · 36 EXP', '1 ROLL', 'PUSH +1', 'TOTAL  ——', 'THANK YOU'] as const;
const RECEIPT_ROAD = ['1 × SINGLE', 'OUT  ——', 'RETURN  ——', 'PAID', 'KEEP FOR INSPECTION'] as const;

/** Every scene, in order: seventeen, four a keyword (three for THOUGHT, two
 *  for YOU), an editorial page and a piece of printed matter by turns. The
 *  owner found the film long (2026-09-29, "缩短3-4秒"): the pages most like
 *  their neighbours went (the catalogue card, the strip of negatives, the
 *  book, the notebook and four editorial pages) and every page now holds one
 *  sixth — but the first (drawn from the first paint, under the proof), two, and the last
 *  (YOU, before the hand-off), three. The drift turns only by a quarter
 *  between neighbours, so the motion runs on across every cut; the face
 *  changes at every cut. The colour in runs: ARCHIVE on paper, CAMERA in
 *  black and white, TRAVEL in the ticket stocks (rust, maroon), THOUGHT and
 *  YOU on paper again with a second ink. */
export const SCENES: readonly Scene[] = [
  // ── ARCHIVE: paper ──
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
    slots: 1,
    drift: 'right',
    driftPx: 40,
    ground: 'bone',
    ink: 'maroon',
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
    layers: {
      density: 'dense',
      run: ['The Archive — Vol. I', '12'],
      print: { pic: 0, treat: 'duotone', ink: 'maroon', at: [0.68, 0.1], w: 0.17, rot: 2.5, caption: 'Plate 2 · a contact print', tape: true, phone: true },
      clip: { head: 'Found in a drawer', text: 1, at: [0.05, 0.72], w: 0.19, rot: -2.2 },
      note: { text: 'sharper than the last', at: [0.05, 0.58], rot: -4, arrow: 'r' },
      marks: true,
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
    face: 'f400',
    slots: 1,
    drift: 'right',
    driftPx: 42,
    ground: 'bone',
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
    layers: {
      density: 'dense',
      receipt: { lines: RECEIPT_LAB, at: [0.06, 0.07], rot: -3 },
      stamp: { text: 'Received', sub: 'with thanks', shape: 'box', ink: 'maroon', at: [0.72, 0.72], rot: -6, phone: true },
      clip: { head: 'Not a souvenir. A record.', text: 7, at: [0.66, 0.08], w: 0.17, rot: 1.4 },
      num: { n: '4', text: 'print again, softer', at: [0.1, 0.8] },
    },
  },
  // ── CAMERA: black and white ──
  {
    word: 'CAMERA',
    face: 'f900',
    slots: 1,
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
    ground: 'olive',
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
    layers: {
      density: 'dense',
      run: ['Visual archive — Vol. II', '31'],
      print: { pic: 1, treat: 'halftone', at: [0.64, 0.08], w: 0.17, rot: -2, caption: 'Fig. 3 — at the window', tape: true, phone: true },
      note: { text: 'the shutter, not the lens', at: [0.06, 0.78], rot: 3, arrow: 'u' },
      marks: true,
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
    ground: 'slate',
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
        { at: [0.035, 0.64], text: 7, w: 130 },
      ],
      metaL: 'Contact sheet 10',
      metaR: 'Frame 10',
    },
    layers: {
      density: 'calm',
      print: { pic: 2, treat: 'negative', at: [0.7, 0.7], w: 0.15, rot: 0, caption: 'Neg. 14 — reversed', phone: true },
      barcode: { code: '0417 0010', at: [0.07, 0.08] },
    },
  },
  // ── TRAVEL: the ticket stocks ──
  {
    word: 'TRAVEL',
    face: 'f900',
    slots: 1,
    drift: 'down',
    driftPx: 34,
    ground: 'rust',
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
    layers: {
      density: 'dense',
      stamp: { text: 'Passed', sub: 'No. 7', shape: 'round', ink: 'bone', at: [0.8, 0.1], rot: 12, phone: true },
      receipt: { lines: RECEIPT_ROAD, at: [0.08, 0.68], rot: 2.5 },
      clip: { head: 'Notes from the road', text: 4, at: [0.72, 0.7], w: 0.18, rot: 1.8 },
    },
  },
  {
    word: 'TRAVEL',
    face: 'sg700',
    slots: 1,
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
    ground: 'maroon',
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
    layers: {
      density: 'calm',
      run: ['Between trains', '57'],
      tabs: ['I', 'II', 'III', 'IV', 'V'],
      clip: { head: 'The long way round', text: 4, at: [0.06, 0.1], w: 0.17, rot: -1.5, phone: true },
    },
  },
  {
    word: 'TRAVEL',
    face: 'f900',
    slots: 1,
    drift: 'up',
    driftPx: 36,
    sheet: 'passport',
    giants: [{ text: 'VISA', face: 'f900', cap: 0.44, x: -0.03, y: 0.3, align: 'l' }],
  },
  // ── THOUGHT: paper, a green second ink ──
  {
    word: 'THOUGHT',
    face: 'fit',
    slots: 1,
    drift: 'right',
    driftPx: 40,
    ground: 'bone',
    ink: 'green',
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
        { at: [0.035, 0.62], text: 5, w: 126 },
      ],
      metaL: 'Visual archive · Vol. IV',
      metaR: 'Frame 18',
    },
    layers: {
      density: 'calm',
      run: ['Day book', '88'],
      pull: { text: 'Written down, it stays.', at: [0.64, 0.1], w: 0.2, phone: true },
    },
  },
  {
    word: 'THOUGHT',
    face: 'mono',
    slots: 1,
    drift: 'down',
    driftPx: 32,
    sheet: 'telegram',
    giants: [{ text: 'TELEGRAM', face: 'f900', cap: 0.4, x: 0.5, y: 0.2, align: 'c' }],
  },
  {
    word: 'THOUGHT',
    face: 'f400',
    slots: 1,
    drift: 'right',
    driftPx: 40,
    ground: 'bone',
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
    layers: {
      density: 'calm',
      run: ['Second printing', '93'],
      marks: true,
    },
  },
  // ── YOU: paper, a blue second ink ──
  {
    word: 'YOU',
    face: 'fit',
    slots: 1,
    drift: 'up',
    driftPx: 32,
    sheet: 'postcard',
    giants: [{ text: 'POST CARD', face: 'f900', cap: 0.36, x: 0.5, y: 0.19, align: 'c' }],
  },
  {
    word: 'YOU',
    face: 'f900',
    slots: 3,
    drift: 'up',
    driftPx: 44,
    ground: 'bone',
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
    layers: {
      density: 'calm',
      run: ['Visual archive — Vol. V', 'End of roll'],
      print: { pic: 0, treat: 'halftone', at: [0.08, 0.74], w: 0.14, rot: -1.5, caption: 'Last frame', phone: false },
    },
  },
];
/** The scenes each layout plays (indices into SCENES): every one on both. */
export const ACT_CUTS: Record<FilmLayout, readonly number[]> = {
  desktop: SCENES.map((_, i) => i),
  phone: SCENES.map((_, i) => i),
};

// ── Act 2: the hand-off ───────────────────────────────────────────────────
/** A curve that is off the mark at once and settles long (the spec's). */
export const GLIDE_EASE = [0.2, 0.7, 0.1, 1] as const;
/** The last page cuts away under the anchor (a hard cut, on the sixth the
 *  last scene ends); the lime block alone glides and shrinks into the first
 *  machine's cursor across four twelfths, on the glide curve, and becomes it
 *  (the same lime box, on the same frame). The anchor's word goes with the
 *  page: never a word shrinking into a cursor. */
export const HAND = {
  frames: 4,
  ease: GLIDE_EASE,
} as const;

// ── Act 3: the typewriter relay ───────────────────────────────────────────

/** The typed line, lower case (PROPOSED copy). */
export const TYPED = 'an archive of travel';

/** The machines the line is typed on, in order, how long each is on screen
 *  (twelfths of a second) and how many keys it strikes: slow to fast (2⅓ s
 *  in all, down from 3 s: the last four machines a sixth each), then the
 *  typewriter's paper holds (the last letter, the cursor blinking, the
 *  burn — which is on the same paper for its first half second). Each sets the line in its own face (the owner's "字体模范的切换"):
 *  a 1-bit desktop's bitmap, a film's edge print, a terminal's dot matrix, a
 *  label maker's embossed capitals, a word processor's sans, a bare page's
 *  serif, a hand on grid paper, the typewriter's — on one left edge, one
 *  baseline, one cap height. Light (the desktop, the lightbox), then the
 *  dark run (the terminal, the tape on its desk), then light to the burn:
 *  the relay turns the picture over twice. Every machine strikes a visible letter (never
 *  only a space), and its first key falls on its own cut (RELAY_KEYS). */
export type StyleId = 'mac' | 'film' | 'crt' | 'label' | 'beige' | 'bone' | 'grid' | 'paper';
export type RelayFace = 'pixel' | 'dot' | 'edge' | 'emboss' | 'sans' | 'serif' | 'hand' | 'type';
export const STYLES: readonly { id: StyleId; face: RelayFace; frames: number; keys: number; tone: Tone }[] = [
  { id: 'mac', face: 'pixel', frames: 8, keys: 4, tone: 'light' },
  { id: 'film', face: 'edge', frames: 4, keys: 4, tone: 'light' },
  { id: 'crt', face: 'dot', frames: 4, keys: 3, tone: 'dark' },
  { id: 'label', face: 'emboss', frames: 3, keys: 2, tone: 'dark' },
  { id: 'beige', face: 'sans', frames: 2, keys: 2, tone: 'light' },
  { id: 'bone', face: 'serif', frames: 2, keys: 2, tone: 'light' },
  { id: 'grid', face: 'hand', frames: 2, keys: 2, tone: 'light' },
  { id: 'paper', face: 'type', frames: 3, keys: 1, tone: 'light' },
];
export const STYLE_TONE = Object.fromEntries(STYLES.map((s) => [s.id, s.tone])) as Record<StyleId, Tone>;
/** The machine the burn takes (the last). */
export const BURN_STYLE: StyleId = 'paper';

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
/** The first letter three twelfths after the cursor has landed. */
export const TYPE_AT = 3 * FRAME12_MS;
/** The relay's keys: each machine's first on its own cut (a new machine
 *  arrives with a new letter, never a keystroke a frame before a cut), the
 *  rest evenly across its time — about ten letters a second. A key at
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
 *  as many keys as it strikes (STYLES), its first on its cut (the first
 *  machine's TYPE_AT after its cut), the rest evenly spaced up to its end;
 *  the middle keys nudged (RELAY_KEYS). */
export function relayTimes(styles: readonly (Span & { id: StyleId })[]) {
  const rand = seeded(RELAY_KEYS.seed);
  const out: number[] = [];
  styles.forEach((m, k) => {
    const n = STYLES[k].keys;
    const first = k === 0 ? m.start + TYPE_AT : m.start;
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

/** A face turning into another, letter by letter (act 6, the landing):
 *  every letter of the one face and its letter in the other are held to ONE
 *  ink box, which goes from the first face's to the second's across `box`
 *  (a share of the move), and the two faces are SWAPPED at `fade` — one
 *  instant (a zero-width window) near the middle of it, at the move's
 *  fastest, where the two letters are the same size in the same place: one
 *  frame shows the one face, the next the other, never both (a crossfade,
 *  however short, showed two words for two or three frames). The words are
 *  in the same case on both sides (capitals). */
export const GLYPH_MORPH = {
  box: [0.06, 0.5] as const,
  fade: [0.29, 0.29] as const,
} as const;

// ── Act 4: the film burn (24 fps) ─────────────────────────────────────────
// On the typewriter's paper (the relay's last machine). Frame numbers are
// 0–21 from the act's start (22 frames: one black frame, not two, and three
// frames of lit perforations, not four — the owner's shorter film). The canvas (a fragment
// shader) is drawn only when the frame number changes; everything else is
// held on the frame by stepped keyframes.
export const BURN = {
  frames: 22,
  /** f0–2: flicker (brightness ±10%), scratches and dust; gate weave from
   *  f0 to f11 (±1 px a frame). */
  flicker: [0, 3] as const,
  weavePx: 1,
  /** f3: the frame slips up a quarter, showing the frame line and the
   *  perforations. */
  slip: 3,
  slipShare: 0.25,
  /** f4–8: the burn spreads from beside the typed line (its radius a share
   *  of the frame's diagonal) and the frame outside it turns sepia. */
  burn: [4, 9] as const,
  radius: [0.025, 0.065, 0.12, 0.19, 0.27, 0.36, 0.45, 0.55] as const,
  sepia: [0.3, 0.45, 0.58, 0.7, 0.8, 0.86, 0.9, 0.9] as const,
  /** f9–11: all of it darkens to a deep brown-black and slides out at 6° —
   *  UP, the way the slip went (the motion runs on; a slide down would
   *  reverse it). */
  out: [9, 12] as const,
  darkness: [0.38, 0.68, 0.9] as const,
  slide: [-0.1, -0.38, -0.86] as const,
  slideDeg: 6,
  /** f12 black; f13–18 the leader, one card a frame; f19–21 the lit
   *  perforations carry it into the dark. */
  black: [12, 13] as const,
  leader: [13, 19] as const,
  perfs: [19, 22] as const,
  /** The lit perforations, frame by frame: where the row is (a share of the
   *  height, climbing) and how bright (fading). */
  perfY: [0.8, 0.47, 0.14] as const,
  perfO: [0.95, 0.72, 0.4] as const,
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
/** Fourteen letters a second (it was twelve; the dark is a beat shorter). */
export const DARK_CPS = 14;
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
 *  the cover's face (Fraunces 400: entrance.css .ec-xl), in capitals; the
 *  cover sets it "Ryan Xu", so on its way home only its case turns, letter
 *  by letter in one ink box (LANDING_A.morph), like the credits. */
export const TITLE_NAME = 'Ryan Xu';
export const TITLE_SUB = ['CAMERA', 'ARCHIVE', 'TRAVEL', 'THOUGHT'] as const;
export const TITLE_YOU = { lead: 'Admit one', word: 'YOU' } as const;

// ── Acts' lengths ─────────────────────────────────────────────────────────
export const ACT_MS = {
  /** Act 1: the match cuts' sixths. */
  cuts: SCENES.reduce((s, x) => s + x.slots, 0) * CUT_MS,
  /** Act 2: the hand-off's twelfths. */
  hand: HAND.frames * FRAME12_MS,
  /** Act 3: the machines' twelfths. */
  type: STYLES.reduce((s, x) => s + x.frames, 0) * FRAME12_MS,
  /** Act 4: 22 frames at 24 fps. */
  burn: BURN.frames * FRAME24_MS,
  /** Act 5: the dark, typed (seven beats). */
  dark: 7 * BEAT_MS,
  /** Act 6: the end title (five beats). */
  title: 5 * BEAT_MS,
} as const;

// ── The plan: the whole film as spans on one clock ────────────────────────
/** The acts in the order they play. */
export const ACT_ORDER = ['cuts', 'hand', 'type', 'burn', 'dark', 'title'] as const;
export type ActId = (typeof ACT_ORDER)[number];
export interface CutPlan extends Span {
  /** The scene (index into SCENES). */
  index: number;
  word: Keyword;
  face: AnchorFace;
  drift: Drift;
  tone: Tone;
}
export interface FilmPlan {
  layout: FilmLayout;
  /** Act 0, before the clock: the proof (film −PRELUDE_MS … 0), its lime
   *  plate and its ink plate (the word). */
  prelude: Span & { lime: number; word: number };
  acts: Record<ActId, Span>;
  /** Act 1. */
  cuts: CutPlan[];
  /** Act 3: the machines, and when each character of TYPED appears. */
  styles: (Span & { id: StyleId })[];
  typing: number[];
  /** Act 5: when each character of DARK_TYPED appears; the blink after. */
  darkTyping: number[];
  blink: Span;
  /** The landing starts here (the film's length). */
  length: number;
}

/** A time on a grid, exact to a nanosecond (the film's clock is a float). */
const onGrid = (n: number, unit: number) => Math.round(n * unit * 1e6) / 1e6;

export function filmPlan(layout: FilmLayout): FilmPlan {
  const order = ACT_CUTS[layout];
  let slot = 0;
  const cuts: CutPlan[] = order.map((index) => {
    const s = SCENES[index];
    const start = onGrid(slot, CUT_MS);
    slot += s.slots;
    return { index, word: s.word, face: s.face, drift: s.drift, tone: sceneTone(s), start, end: onGrid(slot, CUT_MS) };
  });
  const cutsAct = { start: 0, end: cuts[cuts.length - 1].end };
  const hand = { start: cutsAct.end, end: onGrid(cutsAct.end / FRAME12_MS + HAND.frames, FRAME12_MS) };
  let f = hand.end / FRAME12_MS;
  const styles = STYLES.map((s) => {
    const span = { id: s.id, start: onGrid(f, FRAME12_MS), end: onGrid(f + s.frames, FRAME12_MS) };
    f += s.frames;
    return span;
  });
  const type = { start: hand.end, end: styles[styles.length - 1].end };
  const typing = relayTimes(styles);
  const burn = { start: type.end, end: onGrid(type.end / FRAME24_MS + BURN.frames, FRAME24_MS) };
  const dark = { start: burn.end, end: burn.end + ACT_MS.dark };
  const title = { start: dark.end, end: dark.end + ACT_MS.title };
  const darkTyping = typeTimes(DARK_TYPED, dark.start + DARK_TYPE_AT, dark.start + DARK_TYPE_AT + ((DARK_TYPED.length - 1) * 1000) / DARK_CPS, 18, 77);
  // The blink: off half a period before the title… and on again as it begins.
  const blink = { start: title.start - CURSOR_MS / 2, end: title.start };
  return {
    layout,
    prelude: { start: -PRELUDE_MS, lime: -PRELUDE.beats.lime * CUT_MS, word: -PRELUDE.beats.word * CUT_MS, end: 0 },
    acts: { cuts: cutsAct, hand, type, burn, dark, title },
    cuts,
    styles,
    typing,
    darkTyping,
    blink,
    length: title.end,
  };
}

/** The relay's cursor on the film's clock: it is the anchor's lime block,
 *  landed (on at the relay's first frame), solid until and while it types,
 *  blinking after the last letter until the burn has taken the frame. The
 *  times its ink changes, and to what. */
export function cursorSteps(plan: FilmPlan): [number, 0 | 1][] {
  const first = plan.typing[0];
  const last = plan.typing[plan.typing.length - 1];
  const before = blinkSteps(plan.acts.type.start, first);
  const out: [number, 0 | 1][] = [...before];
  if (before.length && before[before.length - 1][1] === 0) out.push([first, 1]);
  return out.concat(blinkSteps(last, burnFrameStart(plan, BURN.out[1])));
}

/** Every hard cut of a plan: the match cuts, the acts, the machines. */
export function hardCuts(plan: FilmPlan) {
  const out = new Set<number>();
  plan.cuts.forEach((c) => out.add(c.start));
  Object.values(plan.acts).forEach((a) => out.add(a.start));
  plan.styles.forEach((m) => out.add(m.start));
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

/** How the picture reads, light, mid or dark, from start to end: the flash
 *  budget is counted on this (scripts/opening-film.test.mjs). */
export function toneTimeline(plan: FilmPlan): (Span & { tone: Tone })[] {
  const out: (Span & { tone: Tone })[] = [];
  const push = (start: number, end: number, tone: Tone) => {
    const last = out[out.length - 1];
    if (last && last.tone === tone && Math.abs(last.end - start) < 1e-6) last.end = end;
    else out.push({ start, end, tone });
  };
  // The proof: newsprint, then the lime plate on it — light, and one with
  // the first page (the same newsprint).
  push(plan.prelude.start, plan.prelude.end, 'light');
  plan.cuts.forEach((c) => push(c.start, c.end, c.tone));
  // The hand-off is on the first machine's screen.
  push(plan.acts.hand.start, plan.acts.hand.end, STYLE_TONE[plan.styles[0].id]);
  plan.styles.forEach((m) => push(m.start, m.end, STYLE_TONE[m.id]));
  // The burn stays light (a sepia frame, a local burn) until it darkens
  // and slides out; from there on it is the dark.
  push(plan.acts.burn.start, burnFrameStart(plan, BURN.out[0]), 'light');
  push(burnFrameStart(plan, BURN.out[0]), plan.length + LANDING_A.done, 'dark');
  return out;
}
/** The times the picture turns over, light to dark or back (a mid ground in
 *  between turns nothing over: light, mid, dark is one turn). */
export function toneFlips(plan: FilmPlan) {
  const out: number[] = [];
  let side: Tone | null = null;
  toneTimeline(plan).forEach((s) => {
    if (s.tone === 'mid') return;
    if (side && s.tone !== side) out.push(s.start);
    side = s.tone;
  });
  return out;
}
/** The whole film's budget of turns (the owner allows more than the spec's
 *  four now that the pages carry black and white and colour: never more than
 *  three in any second). */
export const FLIP_BUDGET = { total: 6, perSecond: 3 } as const;

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
// Act 6 (the typed RYAN XU into the title) and the landing hold both faces
// to ONE ink box: the
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
  /** The end title's YOU line (only its lead, "Admit one ·", when YOU
   *  flies to the cover's own "you"): gone before the first flight reaches
   *  its row (never crossed). */
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
// Three of his frames play parts: the prints taped to the pages and the
// grid paper (a halftone, a duotone, blown out), the magazine's picture page
// and the big halftones, and the lightbox's frames. Each at its own ratio (never cropped or stretched), one per
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
 *  would leave a strip's frame a sliver and the magazine's plate a strip). */
export const PICTURE_RATIO = [1.2, 1.8] as const;
/** Each role's width, px (the blurred life needs next to nothing). */
export const PICTURE_W = [480, 900, 640] as const;
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
// characters it sets, so the right subset comes). The clock waits for them
// at most FONT_WAIT_MS after the island starts (the proof is on screen
// meanwhile, its lights going down from the first paint; both its plates
// are the clock's) and never for his photographs (they load behind the
// film) — past that the film plays on whatever has come, and a face that
// lands later has every word measured again on the same clock. One face is
// waited for longer: the first word's (PROOF_FACE, ARCHIVE in Fraunces 900),
// which the proof prints alone on a blank sheet — never in a stand-in face,
// and never swapped under the reader's eye; the proof holds, a still and
// finished page, meanwhile (at most PROOF_FACE_WAIT_MS after the island
// starts). A reload never sits still: the proof moves from the first paint,
// and the clock's keyframes are laid a third of a second after the island is.
export const FONT_LOADS = [
  '900 100px Fraunces',
  '400 100px Fraunces',
  'italic 400 100px Fraunces',
  'italic 500 100px Fraunces',
  '700 20px "Space Grotesk"',
  '600 20px "Space Grotesk"',
  '500 20px "Space Grotesk"',
  '400 20px "Space Grotesk"',
] as const;
export const FONT_SAMPLE = 'ARCHIVECMTLOUGYZNPBFRWDSK abcdefghijklmnopqrstuvwxyz 0123456789 ·°—/.,′’';
export const FONT_WAIT_MS = 250;
/** The proof's word's face (the first scene's, f900) and how long the proof
 *  holds for it at most, from the island's start. */
export const PROOF_FACE = FONT_LOADS[0];
export const PROOF_FACE_WAIT_MS = 1200;

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
