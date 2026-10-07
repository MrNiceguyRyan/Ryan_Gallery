// ── The opening film: a retro editorial type film (v7, five seconds) ──
// The homepage opens on a short film (src/components/home/OpeningFilm.tsx,
// its scenes in OpeningScenes.tsx, its materials in src/styles/opening.css).
// The owner's spec (2026-09-28, "复古编辑部动态排版") and his changes of
// 2026-09-29 (no place names — keep the suspense; match cuts through many
// kinds of printed matter round a fixed lime anchor; a typed line relayed
// across machines; the single words FIRST, then the relay — "先单独的字，再
// 轮到打字接力"; richer, more layered pages; black-and-white pages and a
// stronger colour rhythm, in runs, never abrupt). Then, 2026-10-05: "现在我
// 觉得开头的动画可以再短一点点 控制在5秒" — the whole opening, from the first
// paint to the landing done (the page's own words in place, input free),
// within five seconds. It was 10.1 s. Every act is kept, each COMPRESSED
// rather than cut (what he loved: the printed matter's quick cuts, "第一版
// 各种杂志报纸做的文字快切这样的也很好", "快切部分效果也不错"; the relay
// across machines with the antique computer; the single words first):
//
//   act                      before     now
//   0. the proof             1000 ms    500 ms (four beats a sixth apart)
//   1. the match cuts        3333       1333 (17 pages → 8, each a sixth)
//   2. the hand-off           333        167 (two twelfths)
//   3. the relay             2333       1250 (8 machines → 5; 15 twelfths)
//   4. the burn               917        583 (22 frames at 24 fps → 14; the
//                                        countdown gone, the burn slow)
//   5. the dark, typed        875        292 (7 keys, a 24th each)
//   6. the end title          625        292 (the morph, the credits
//                                        rising, the formed title held)
//      landing A              700        555
//      first paint → landed  10.11 s     4.97 s (the plan: 4.74 s
//                                        measured before the relay and
//                                        the burn were slowed, 2026-10-06
//                                        and -07; a sixth more on a load
//                                        whose first face misses its beat)
//
//   0. The proof (half a second, before the clock). The owner, 2026-09-29:
//      "然后开头动画最开端是直接播放，有点突兀了，可以加一个小小的开场" (the
//      very start just plays, a little abrupt: add a small opening). The
//      first paint is a printer's proof on the newspaper's own newsprint, a
//      flat, even sheet: the lights go down, the lime plate prints the
//      anchor's block, the ink plate prints ARCHIVE into it, and the first
//      page is printed round it — four beats a sixth apart, the cuts' own
//      grid. Light on light: it turns nothing over. It is what the reader
//      sees while the island and the faces come: its beats are the
//      stylesheet's and a head script's, from the first paint, so on a slow
//      load it holds as a finished title card — ARCHIVE on its lime plate —
//      until the island prints the page.
//   1. Match cuts round a fixed lime anchor (1⅓ s: eight pages, each a
//      sixth of a second): ARCHIVE → CAMERA → TRAVEL → THOUGHT → YOU —
//      ARCHIVE, CAMERA and TRAVEL each on an editorial page and a piece of
//      printed matter, by turns; THOUGHT on the telegram, YOU on the
//      postcard (the owner, 2026-10-06: the relay "稍微慢一点，不然看不清";
//      its time came from the day book and FIRST LIGHT pages). The block's centre, its height and the
//      word's cap height never move; only the word and its face change
//      (Fraunces 900, Fraunces italic, Space Grotesk 700, Fraunces 400, the
//      monospace). Round it the frame is recomposed every cut, alternating
//      an editorial page (giant cropped Fraunces words drifting with a
//      motion blur of pre-drawn copies; words beside the anchor; layered
//      print — a taped photograph, a torn clipping, a receipt, a stamp, a
//      margin note, a pull quote, registration marks) and a piece of printed
//      matter built round the word (a newspaper, a magazine, a ticket, a
//      telegram, a postcard). The colour comes in runs: paper for ARCHIVE,
//      black and white for CAMERA, the ticket stocks for TRAVEL, paper again
//      for THOUGHT and YOU. (The dictionary, the slate, the passport and
//      seven editorial pages went: the pages most like their neighbours.)
//   2. The hand-off: the page cuts away under the anchor; the lime block
//      alone glides and shrinks into the first machine's cursor.
//   3. A typewriter relay (15 twelfths): "an archive of travel" is typed,
//      and every four letters the whole frame hard-cuts to another machine —
//      the antique 1-bit computer, a strip of film on a lightbox, a word
//      processor, grid paper, the typewriter — slow to fast (the computer
//      longest), each in its own face (a bitmap, an edge print, a sans, a
//      hand, the typewriter's), all on one left edge, one baseline, one cap
//      height; the typed count carries on across every cut. All five are
//      light: the dark terminal and the label maker's tape went with the
//      time, because a quarter second of dark between light machines, a
//      second from the burn's dark, read as a flash (the owner hates 晃眼).
//   4. A film burn, stepped at 24 fps, on the typewriter's paper: flicker,
//      scratches and gate weave, a frame slip, a burn spreading from the
//      line on an fbm mask (a WebGL shader on its own canvas), the frame
//      darkening and sliding out at 6° (slowly: no countdown card).
//   5. The dark: "ryan xu" is typed on the film's base, a key a 24th, with a
//      lime block cursor (the act's one lime).
//   6. The end title: that line is struck in the title's case ("Ryan Xu")
//      and turns, letter by letter, into his name in Fraunces — set exactly
//      as the first screen sets it (face, case, tracking), so it flies home
//      without changing at all — with CAMERA · ARCHIVE · TRAVEL · THOUGHT
//      rising under it, and YOU.
//
// Then it lands (landing A, "words fly home"): the dark dissolves into the
// first screen, his name glides home first, whole (the signature), and
// CAMERA, TRAVEL, ARCHIVE, THOUGHT (and YOU, when the page has a place for
// it) follow into their places in the entrance's opening words
// (src/components/home/EntranceIntro.tsx), in either language (the page
// prints both; the shown one is the target: src/i18n shownMatch).
//
// No place names: the places are the archive's suspense. The only one in
// the film is a tiny easter egg (EGGS: a dateline in a newspaper column),
// never large, never the keyword, never centred.
//
// Smooth, by the spec's definition: every hard cut falls on its act's grid,
// and every grid is whole vsyncs — the proof and the match cuts on the
// sixth of a second (CUT_MS: 10 vsyncs at 60 Hz, 20 at 120 Hz), the
// hand-off and the relay on the twelfth (FRAME12_MS: 5 and 10), the burn,
// the dark and the title on the 24th (FRAME24_MS: the film's own rate; 5
// vsyncs at 120 Hz); the anchor never moves; the drift runs on across a cut
// (the same way or a quarter turn); no fallback face, no blank frame, no
// dropped frame at a cut (the fonts are in before the clock starts, every
// page is painted well before its cut and rastered just before it, the
// clock is laid only once its keyframes are, and everything is transform
// and opacity on one clock). The proof's beats are on the same sixth,
// counted from its first frame: the clock is taken from the proof's own
// start (pageStart, filmStart), so the count-in and the cuts are one grid.
// Never more than three turns of light in any second (FLIP_BUDGET; this cut
// turns three times in all, never twice in a second but at CAMERA's run).
//
// It plays once a tab session (src/lib/reelVisit.ts). While it plays (the
// proof too), ONLY the Skip pill skips it (to the formed end title and a
// hurried landing — never a hard cut to the page); a wheel, a touch, a key
// or a click anywhere else does nothing at all (the page's scroll is held).
// Reduced motion gets the end title as a still and a calm crossfade.
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
/** An eighth of a second (a measure some timings are still given in). */
export const BEAT_MS = 125;
/** The burn, the dark and the title are stepped at 24 fps (the film's own
 *  rate; five vsyncs at 120 Hz). */
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
// flat, even sheet with its registration mark and its slug. The lights go
// down (the frame's vignette comes in), the lime plate prints the anchor's
// block, the ink plate prints its word, and the page is printed round it —
// four beats a sixth of a second apart, the cuts' own grid (they were a
// third of a second apart; the owner's five seconds, 2026-10-05).
// None of it waits for the island (its hydration is what the proof covers):
// the stylesheet brings the lights down from the first paint, and a small
// script in the page's head (src/lib/proofPlates.ts, from its first paint)
// prints both plates on the proof's own sixth — the lime on the first beat
// once the word's face is in (PROOF_FACE, at most PROOF_FACE_WAIT_MS), the
// word a sixth of a second after it, whatever the island is doing. The
// island takes the proof over on the same grid and prints the page on the
// first sixth it can make, never sooner than a sixth of a second after the
// word (pageStart). So a fast load is the four beats; a slow one holds a
// finished title card — ARCHIVE on its lime plate — until the page, never
// an empty sheet (the owner's eye: a blank, still sheet reads as a page
// that has not loaded) and never a lone lime bar (one that stood alone
// read as a loading bar). The film's grain comes with the page (a still
// grain whose tile is still loading shows its seams). It lives before the
// clock (film −PRELUDE_MS … 0 on a fast load; earlier on a slow one): no
// act, no act time, no cut moves. Light on light (newsprint, then lime, a
// change of hue, not of light): it turns nothing over.
export const PRELUDE = {
  /** Sixths before the page on a fast load: the first paint, the lime
   *  plate, the ink plate. */
  beats: { paint: 3, lime: 2, word: 1 },
  /** The lights go down across this many sixths from the first paint (the
   *  stylesheet; the first paint is a flat, even sheet). */
  lights: 1,
  /** The lime plate before its beat: drawn, never seen (the pages' own warm
   *  opacity: its raster is done before it prints). */
  unprinted: 0.002,
  /** The lime plate's first impression, and its ink setting to full (ms, on
   *  the house curve). */
  limeInk: 0.64,
  set: 125,
  /** The newspaper's newsprint (.of-sheet--newspaper): proof and first page
   *  are one sheet, so only ink arrives with the page. */
  ground: '#e9e5d8',
  /** Never quite opaque: the page under it stays rastered (never occlusion-
   *  culled), and unseen (under half an 8-bit level). */
  sheet: 0.998,
} as const;
export const PRELUDE_MS = PRELUDE.beats.paint * CUT_MS; // 500
/** The clock is laid this much ahead of the proof's grid: the proof's beats
 *  (and so every cut after them) fall exactly on frame times — a sixth is
 *  ten vsyncs from the proof's first frame — and a step laid exactly on a
 *  frame's time is taken on that frame or the next by a rounding. A hair
 *  ahead, it is always taken on its own frame (and never on the one
 *  before: that is a whole frame away). */
export const GRID_HAIR_MS = 0.25;
/** The lime plate's ink from its beat: its first impression setting to full
 *  on the house curve (`samples` steps of 25 ms, linear between: under 0.013
 *  of opacity off the curve anywhere). `at`: ms after the beat. */
export function proofInk(samples = Math.ceil(PRELUDE.set / 25)) {
  const curve = bezierFn(EASE.arrive);
  const out: { at: number; opacity: number }[] = [{ at: 0, opacity: PRELUDE.limeInk }];
  for (let i = 1; i <= samples; i += 1) {
    const u = i / samples;
    out.push({ at: PRELUDE.set * u, opacity: PRELUDE.limeInk + (1 - PRELUDE.limeInk) * curve(u) });
  }
  return out;
}
/** The lime plate on the film's clock (its beat at film time `lime`): held
 *  unprinted to its beat, then its ink (proofInk). */
export function proofLimeKeys(lime: number = -PRELUDE.beats.lime * CUT_MS, samples = Math.ceil(PRELUDE.set / 25)) {
  return [{ t: lime, opacity: PRELUDE.unprinted as number }, ...proofInk(samples).map(({ at, opacity }) => ({ t: lime + at, opacity }))];
}
/** The proof's slug, at its foot, printed whole from the first paint (a real
 *  proof lists its plates before they print, and nothing at the foot moves
 *  while the reader waits). PROPOSED copy; no place names, and not his name —
 *  the film ends on it. */
export const PROOF_SLUG = { head: 'Proof 01', wide: '— Visual archive', plates: ['· Plate 1 lime', '· Plate 2 ink'] } as const;

/** The lime's beat on document.timeline: the first sixth of the proof's grid
 *  (counted from `origin`, its first frame) at or after `ready`, and never
 *  before its own (`PRELUDE.beats.paint − lime` sixths in). */
export function limeBeat(origin: number, ready: number) {
  const first = origin + (PRELUDE.beats.paint - PRELUDE.beats.lime) * CUT_MS;
  const k = Math.max(0, Math.ceil((ready - first) / CUT_MS - 1e-6));
  return first + k * CUT_MS;
}
/** Film 0 (the page) on document.timeline, once the plates are printed (the
 *  lime's beat `lime`, on the proof's grid): the first sixth at or after
 *  `ready` (the earliest the island's keyframes take effect: once they are
 *  laid, plus CLOCK_LEAD_MS), never sooner than a sixth after the word. */
export function pageStart(lime: number, ready: number) {
  const first = lime + PRELUDE.beats.lime * CUT_MS;
  const k = Math.max(0, Math.ceil((ready - first) / CUT_MS - 1e-6));
  return first + k * CUT_MS;
}
/** Film 0 when the island prints the plates itself (no plates were printed
 *  before it: an engine without the animations the head script reads):
 *  `origin`, the proof's first frame, or null; the lime on the first beat
 *  the keyframes can make (limeBeat), the page two beats after it. Without
 *  an origin (no proof to count from), the lime when ready. */
export function filmStart(origin: number | null, ready: number) {
  const lime = PRELUDE.beats.lime * CUT_MS;
  if (origin == null) return ready + lime;
  return limeBeat(origin, ready) + lime;
}

/** The first paint's anchor as the stylesheet sets it (opening.css --c0,
 *  --c0w, --c0l, --c0b), per cap height: the widest keyword's block
 *  (THOUGHT in Fraunces 400, 6.7286 caps of ink at 100 px, and its
 *  padding — the widest the film has set; kept as the anchor's measure in
 *  the five-second cut, which no longer sets THOUGHT in it, so the anchor
 *  is the size the owner approved); the first word's block (ARCHIVE in
 *  Fraunces 900); where its
 *  pen is from the block's left edge; its baseline below its top, per em
 *  (the stylesheet sets it at --c0 / 0.7, and 0.7 is its cap height per
 *  em); and the optical size the stylesheet pins it at — its size at the
 *  two widths it was measured at (the desktop's 1728 × 1000, where it is
 *  the largest; a 390 px phone, 64.67 px), so its ink per cap, and the
 *  block's padding, is the same at every width (left to the size, the
 *  optical size drew it 7% narrower at a tablet's 130 px, and the phone's
 *  block was 0.6 caps too wide each side). The first key is the
 *  stylesheet's, always: its block and its word are laid in vw and vh from
 *  these, from the first paint, and the island never lays them (derive,
 *  don't sample) — so the plates the head script prints before the island
 *  is up never move when it takes over, or when the frame is resized or
 *  turned, in any face state, on any engine. The island's own geometry
 *  takes the same numbers. */
export const FIRST_PAINT = {
  desktop: { across: 7.4087, key0: 7.062, left: 0.3578, base: 0.8575, opsz: 144 },
  phone: { across: 7.4087, key0: 7.598, left: 0.3352, base: 0.8503, opsz: 64.67 },
} as const;
/** The first word's size: its cap height is the anchor's (0.7 of its em). */
export const FIRST_PAINT_CAP_EM = 0.7;

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
export type SheetKind = 'newspaper' | 'magazine' | 'ticket' | 'telegram' | 'postcard';
/** How each sheet reads (its paper, or the dark it is laid on). */
export const SHEET_TONE: Record<SheetKind, Tone> = {
  newspaper: 'light',
  magazine: 'dark',
  ticket: 'mid',
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

/** The printed matter's words (PROPOSED copy). `row`: the words either side
 *  of the anchor on its line; `above` / `below`: the lines over and under
 *  it. No place in any of it, but for the egg (EGGS). */
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

/** The easter egg: the only place name in the film — tiny (7 px), in a
 *  column of the newspaper, never the keyword, never large, never centred
 *  (the passport's park stamp went with the passport). */
export const EGGS = [{ sheet: 'newspaper', text: SHEETS.newspaper.dateline, px: 7 }] as const;
/** The places on his route: named nowhere in the film but the eggs. */
export const PLACE_NAMES = ['Miami', 'Orlando', 'Page', 'Zion', 'Bryce', 'New York', 'Florida', 'Arizona', 'Utah', 'Manhattan', 'Washington'] as const;

/** Receipts' lines (PROPOSED, decorative). */
const RECEIPT_LAB = ['DEV + CONTACT', '135 · 36 EXP', '1 ROLL', 'PUSH +1', 'TOTAL  ——', 'THANK YOU'] as const;
const RECEIPT_ROAD = ['1 × SINGLE', 'OUT  ——', 'RETURN  ——', 'PAID', 'KEEP FOR INSPECTION'] as const;

/** Every scene, in order: eight — ARCHIVE, CAMERA and TRAVEL two each (a
 *  piece of printed matter and an editorial page, by turns), THOUGHT the
 *  telegram and YOU the postcard — each a sixth of a second. The relay's
 *  readable pace (2026-10-06) took the day book and FIRST LIGHT. The owner's five seconds
 *  (2026-10-05) took it from seventeen: the pages most like their
 *  neighbours went (the dictionary, the slate, the passport, and the
 *  editorial pages NEGATIVE, LENS, ROUTE and INK), and the first page and
 *  YOU's now hold one sixth like the rest (they held two and three). The
 *  drift turns only by a quarter between neighbours, so the motion runs on
 *  across every cut (three pages turned a quarter to keep it so); the face
 *  changes at every cut. The colour in runs: ARCHIVE on paper, CAMERA in
 *  black and white, TRAVEL in the ticket stocks, THOUGHT and YOU on paper
 *  again with a second ink. */
export const SCENES: readonly Scene[] = [
  // ── ARCHIVE: paper ──
  {
    word: 'ARCHIVE',
    face: 'f900',
    slots: 1,
    drift: 'right',
    driftPx: 36,
    sheet: 'newspaper',
    giants: [{ text: 'LEDGER', face: 'f900', cap: 0.4, x: 0.5, y: 0.2, align: 'c' }],
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
  // ── TRAVEL: the ticket stocks ──
  {
    word: 'TRAVEL',
    face: 'sg700',
    slots: 1,
    // A quarter turn from CAMERA's rise.
    drift: 'left',
    driftPx: 36,
    sheet: 'ticket',
    giants: [{ text: 'SINGLE', face: 'f900', cap: 0.4, x: 0.5, y: 0.2, align: 'c' }],
  },
  {
    word: 'TRAVEL',
    face: 'f900',
    slots: 1,
    // The ticket's way on (it fell, after the slate's run).
    drift: 'left',
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
  // ── THOUGHT: paper, a green second ink ──
  {
    word: 'THOUGHT',
    face: 'mono',
    slots: 1,
    // A quarter turn from the rust page's.
    drift: 'down',
    driftPx: 32,
    sheet: 'telegram',
    giants: [{ text: 'TELEGRAM', face: 'f900', cap: 0.4, x: 0.5, y: 0.2, align: 'c' }],
  },
  // ── YOU: paper, a blue second ink ──
  {
    word: 'YOU',
    face: 'fit',
    slots: 1,
    // A quarter turn from the telegram's fall.
    drift: 'right',
    driftPx: 32,
    sheet: 'postcard',
    giants: [{ text: 'POST CARD', face: 'f900', cap: 0.36, x: 0.5, y: 0.19, align: 'c' }],
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
 *  machine's cursor across two twelfths, on the glide curve, and becomes it
 *  (the same lime box, on the same frame). The anchor's word goes with the
 *  page: never a word shrinking into a cursor. */
export const HAND = {
  frames: 2,
  ease: GLIDE_EASE,
} as const;

// ── Act 3: the typewriter relay ───────────────────────────────────────────

/** The typed line, lower case (PROPOSED copy). */
export const TYPED = 'an archive of travel';

/** The machines the line is typed on, in order, how long each is on screen
 *  (twelfths of a second) and how many keys it strikes: slow to fast — the
 *  antique computer a third of a second (and under the hand-off before it),
 *  the film strip, the word processor and the grid paper a quarter each,
 *  the typewriter a sixth (15 twelfths in all, down from 28) — then the
 *  typewriter's paper holds (the last letter, the cursor blinking, the
 *  burn — which is on the same paper for its first quarter second). Four
 *  keys a machine: about 16 letters a second, 12 on the computer rising to
 *  24 on the typewriter. The owner, 2026-10-06: "打字那段可以稍微慢一点，
 *  不然看不清是什么" — it was about 24 a second throughout (11 twelfths).
 *  Each sets the line in its own face (the owner's "字体模范的切换"): the
 *  1-bit computer's bitmap, a film's edge print, a word processor's sans, a
 *  hand on grid paper, the typewriter's — on one left edge, one baseline,
 *  one cap height. All light: the dark terminal and the label maker's tape
 *  went (with a quarter second each, the dark run between light machines a
 *  second before the burn's dark read as a flash), and so did the bare
 *  page (the typewriter's paper's twin). Every machine strikes a visible
 *  letter (never only a space), and its first key falls on its own cut
 *  (RELAY_KEYS). */
export type StyleId = 'mac' | 'film' | 'beige' | 'grid' | 'paper';
export type RelayFace = 'pixel' | 'edge' | 'sans' | 'hand' | 'type';
export const STYLES: readonly { id: StyleId; face: RelayFace; frames: number; keys: number; tone: Tone }[] = [
  { id: 'mac', face: 'pixel', frames: 4, keys: 4, tone: 'light' },
  { id: 'film', face: 'edge', frames: 3, keys: 4, tone: 'light' },
  { id: 'beige', face: 'sans', frames: 3, keys: 4, tone: 'light' },
  { id: 'grid', face: 'hand', frames: 3, keys: 4, tone: 'light' },
  { id: 'paper', face: 'type', frames: 2, keys: 4, tone: 'light' },
];
export const STYLE_TONE = Object.fromEntries(STYLES.map((s) => [s.id, s.tone])) as Record<StyleId, Tone>;
/** The machine the burn takes (the last). */
export const BURN_STYLE: StyleId = 'paper';

/** The cursor's blink period (steps, half on and half off): a third of a
 *  second — half on, half off, each a sixth, the film's own grid (it was
 *  the desktop's 530 ms; the burn now takes the paper within 0.35 s). */
export const CURSOR_MS = 1000 / 3;
/** The blink on the film's clock: on at `start`, then off and on every half
 *  period until `end` (the times it changes, and to what). */
export function blinkSteps(start: number, end: number, period = CURSOR_MS): [number, 0 | 1][] {
  const out: [number, 0 | 1][] = [];
  const half = period / 2;
  for (let k = 1; start + k * half < end; k += 1) out.push([start + k * half, k % 2 === 0 ? 1 : 0]);
  return out;
}
/** The first letter a twelfth after the cursor has landed. */
export const TYPE_AT = FRAME12_MS;
/** The relay's keys: each machine's first on its own cut (a new machine
 *  arrives with a new letter, never a keystroke two frames before a cut),
 *  the rest evenly across its time — about 16 letters a second. A key at
 *  least `jitterClear` ms from both of its machine's cuts is nudged by up
 *  to ±`jitter` ms (seeded); none falls in the `quiet` ms before a cut. */
export const RELAY_KEYS = { jitter: 8, jitterClear: 60, quiet: 33, seed: 41 } as const;

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
 *  in the same case on both sides ("Ryan Xu"). */
export const GLYPH_MORPH = {
  box: [0.06, 0.5] as const,
  fade: [0.29, 0.29] as const,
} as const;

// ── Act 4: the film burn (24 fps) ─────────────────────────────────────────
// On the typewriter's paper (the relay's last machine). Frame numbers are
// 0–13 from the act's start. The owner, 2026-10-07: 后面的胶片灼烧可以直接把
// 数字倒数删掉，直接慢速灼烧好了 — so no countdown card (the leader went), and
// the burn itself takes its time: one frame of flicker, the slip, then ten
// frames of the hole opening from beside the typed line (it was three),
// slow at first and gathering, and the frame darkening and sliding out. The
// canvas (a fragment shader) is drawn only when the frame number changes;
// everything else is held on the frame by stepped keyframes.
export const BURN = {
  frames: 14,
  /** f0: a flicker (brightness ±10%), scratches and dust; gate weave from
   *  f0 until the frame has gone (±1 px a frame). */
  flicker: [0, 1] as const,
  weavePx: 1,
  /** f1: the frame slips up a quarter, showing the frame line and the
   *  perforations. */
  slip: 1,
  slipShare: 0.25,
  /** f2–11: the burn spreads from beside the typed line, slowly and then
   *  gathering (its radius a share of the frame's diagonal, frame by frame
   *  from f2 on, growing as the frame goes) and the frame outside it turns
   *  sepia. */
  burn: [2, 12] as const,
  radius: [0.025, 0.045, 0.07, 0.1, 0.14, 0.19, 0.25, 0.32, 0.4, 0.48, 0.56, 0.62] as const,
  sepia: [0.24, 0.36, 0.48, 0.58, 0.66, 0.73, 0.79, 0.84, 0.87, 0.89, 0.9, 0.9] as const,
  /** f12–13: all of it darkens to a deep brown-black and slides out at 6° —
   *  UP, the way the slip went (the motion runs on; a slide down would
   *  reverse it). Then the dark. */
  out: [12, 14] as const,
  darkness: [0.55, 0.9] as const,
  slide: [-0.24, -0.86] as const,
  slideDeg: 6,
} as const;
/** The burn's colours, from the front inward: bone at the very edge (its
 *  brightest: never a white flash), then heat to char. */
export const BURN_RAMP = ['#F4F4ED', '#FFE3A0', '#FF9A3C', '#C8471E', '#3A1408'] as const;
/** Where they sit, css px in from the burn's front (then the hole). */
export const BURN_STOPS = [0, 5, 15, 30, 52] as const;
export const BURN_HOLE = '#140D08';
/** Frame f's flicker (−1 dark … 1 light) and gate weave (px), seeded. */
export function burnFrame(f: number) {
  const rand = seeded(9000 + f * 31);
  // The flicker is the burn's first frames only (f0–1: light, then dark),
  // as the spec has it: a short flutter, not a strobe running into the burn.
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
/** The dark is seven 24ths: a key a 24th from its first frame (the lime
 *  cursor comes with the first letter), the last on its seventh, then the
 *  title. It was seven beats (the keys at fourteen a second, a blink after
 *  the last): the five seconds folded it into the title's rhythm. */
export const DARK_FRAMES = 7;
export const DARK_CPS = 24;
/** The first letter on the act's first frame. */
export const DARK_TYPE_AT = 0;

// ── Act 6: the end title ──────────────────────────────────────────────────
/** The typed line turns into the title: struck in the title's case on the
 *  beat the title begins (the letters in the same cells), then every
 *  typewriter letter turns into its Fraunces letter in one shared ink box
 *  (GLYPH_MORPH) as the line grows to the title's size; the credits come up
 *  under it. */
export const TITLE = {
  /** Seven 24ths: the morph across five of them (it was 375 ms of a 625 ms
   *  title), the credits rising with it, the formed title held two. */
  frames: 7,
  morph: 5 * FRAME24_MS,
  swap: GLYPH_MORPH.fade,
  box: GLYPH_MORPH.box,
  cursorOut: 2 * FRAME24_MS,
  sub: [1 * FRAME24_MS, 5 * FRAME24_MS] as const,
  you: [2 * FRAME24_MS, 5 * FRAME24_MS] as const,
  rise: 10,
} as const;
/** The end title's words (PROPOSED: the YOU line). His name is set as the
 *  cover sets it — its face, case and tracking (Fraunces 400, "Ryan Xu":
 *  entrance.css .ec-xl) — so it flies home as it stands, only moved and
 *  made smaller (landing A): the signature. (It was set in capitals and
 *  turned its case letter by letter in flight; review of 2026-09-30.) The
 *  typed line is struck in the title's case on the beat the title begins
 *  (r and x take their capitals). */
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
  /** Act 4: nine frames at 24 fps. */
  burn: BURN.frames * FRAME24_MS,
  /** Act 5: the dark, typed (seven 24ths). */
  dark: DARK_FRAMES * FRAME24_MS,
  /** Act 6: the end title (seven 24ths). */
  title: TITLE.frames * FRAME24_MS,
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
   *  plate and its ink plate (the word), on a fast load (on a slow one the
   *  plates are earlier on the film's clock: the island's own record). */
  prelude: Span & { lime: number; word: number };
  acts: Record<ActId, Span>;
  /** Act 1. */
  cuts: CutPlan[];
  /** Act 3: the machines, and when each character of TYPED appears. */
  styles: (Span & { id: StyleId })[];
  typing: number[];
  /** Act 5: when each character of DARK_TYPED appears (a 24th apart). */
  darkTyping: number[];
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
  const dark = { start: burn.end, end: onGrid(burn.end / FRAME24_MS + DARK_FRAMES, FRAME24_MS) };
  const title = { start: dark.end, end: onGrid(dark.end / FRAME24_MS + TITLE.frames, FRAME24_MS) };
  // On the 24th, unjittered: the keys are the act's own frames.
  const darkTyping = typeTimes(DARK_TYPED, dark.start + DARK_TYPE_AT, dark.start + DARK_TYPE_AT + ((DARK_TYPED.length - 1) * 1000) / DARK_CPS, 0, 77);
  return {
    layout,
    prelude: { start: -PRELUDE_MS, lime: -PRELUDE.beats.lime * CUT_MS, word: -PRELUDE.beats.word * CUT_MS, end: 0 },
    acts: { cuts: cutsAct, hand, type, burn, dark, title },
    cuts,
    styles,
    typing,
    darkTyping,
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
// (the title formed, its credits up: the two 24ths it is held), then the
// landing plays HURRIED (every landing beat at FF_RATE). Never a hard cut to
// the page, never back, and nothing once the landing has begun.
export const FF_TAIL = 2 * FRAME24_MS;
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
// torn instead, whatever the film says — so the film says it with the
// landing (one word to the page, not a second one mid-film that set the
// whole homepage rendering again under the cuts, on the phone's busiest
// half second; it was 2.9 s before the landing).
export const GLOBE_LEAD_MS = 0;
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
// box in the entrance's opening words (one continuous FLIP). Landing ms.
//
// Owner, 2026-09-30 (动画结束之后，Ryanxu这几个字跳转到左侧文章的时候，动效可以
// 再优化一下). Studied frame by frame, the first landing (every word 420 ms,
// 30 ms apart, the fall leading the slide) broke his name in two: RYAN and XU
// flew as two words at two scales (1.01 and 1.37: the case turn made their
// ink boxes differ), so the gap between them opened to a word's width and XU
// dropped below RYAN; each turned its case letter by letter mid-flight, at
// its fastest, 30 ms apart ("Ryan XU" on one frame); the credits grew to
// 40 px as Space Grotesk capitals before they turned into the page's
// Fraunces; CAMERA passed over TRAVEL on the way up; and the page's words
// took over from the clones with every edge of every glyph moved (sub-pixel
// pens and the flight layer's own raster: up to 179 of 255 at an edge).
// Now:
//  - his name is ONE unit, the signature: the end title sets it in the
//    cover's own case and tracking (TITLE_NAME, opening.css .of-title__face),
//    so nothing about it turns on the way — its two words leave together on
//    one clock, one scale, one path, and it is only moved and made smaller
//    (a rigid FLIP). It leaves first and lands first;
//  - the credits and YOU leave a beat later, once the name is clear of the
//    line above them, by the line they land on (landingRank: those bound
//    above first, the highest first, then the deepest first — no word ever
//    passes through another), and turn from the credits' capitals into the
//    page's Fraunces at the very start, at their own small size (the
//    letters' shared ink boxes; one instant for the swap), then grow in the
//    page's face — never a large word in the wrong face;
//  - their size grows on a log scale (each frame the same ratio: a word eight
//    times larger at the end grows evenly, not all at the end);
//  - home, every clone is the word itself (the page's own shaping), and the
//    page's words take over under a short cross-dissolve (`settle`): the
//    same word at the same place in two rasters, so the eye never sees a
//    frame change.
// The five seconds (2026-10-05) took it from 0.7 s to 0.555 s, every part
// in proportion: his name's flight 470 → 400 ms (its fastest 52 px a 60th
// at 1728 × 1000, from 44: still the calm curve, far from the old dart's
// 70), the credits' 360 → 300 ms a stagger of 16 ms apart, the dark gone
// by 360 ms.
export const LANDING_A = {
  /** The dark dissolves into the page: gone before the first word is home. */
  dissolve: [0, 360] as const,
  /** His name: both words at once, on one clock. */
  name: { delay: 0, fly: 400, yLead: 0.86 } as const,
  /** The title's own letters fly the first share of the name's flight and
   *  hand it to the clones there, at speed (a clone's layer draws its text
   *  up to a pixel off the title's: at rest, the hand-over ticked). */
  nameSwap: 0.3,
  /** The credits and YOU: word i (landingRank's order) leaves at
   *  `start + i * stagger` and flies `fly` ms — the first home just after
   *  his name; the fall (or the rise) leads the slide a little (`yLead`: a
   *  word bound for another line is on its own line before it slides along
   *  it). */
  start: 110,
  stagger: 16,
  fly: 300,
  yLead: 0.72,
  /** The credits' turn into the page's face, as a share of their flight:
   *  the letters' shared ink boxes across `morph`, the faces swapped in one
   *  instant in its middle (a crossfade showed CAMERA over camera) — while
   *  the word is still at the credits' own size. */
  morph: [0, 0.22] as const,
  sourceOut: [0.11, 0.11] as const,
  targetIn: [0.11, 0.11] as const,
  /** Past the turn, the letters give way to the word itself, set whole (the
   *  page's own shaping and kerning): the clone that lands IS the word. */
  plain: 0.3,
  /** Home: the clones dissolve into the page's own words (ms). */
  settle: 80,
  /** The rest of the opening words (the kicker first, the name's line's
   *  other words a block later, the nav last) comes up round the landed
   *  words; no block a flying word lands on rises before every word is home
   *  (landingAEnd), so nothing comes up under a word still sliding in. */
  rest: 360,
  done: 555,
  /** The end title's YOU line (only its lead, "Admit one ·", when YOU
   *  flies to the cover's own "you"): gone before the first flight reaches
   *  its row (never crossed). */
  youOut: [0, 80] as const,
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

/** The landing curve: a calm, even ease-in-out with a soft arrival — its
 *  fastest 2.0 times its mean, a little before the middle (the first
 *  landing's (0.38, 0, 0.2, 1) peaked at 2.7 times: his name moved 70 px
 *  in one 60th of a second, a dart; now 52 at 1728 × 1000, its flight
 *  400 ms). */
export const FLY_EASE = [0.4, 0, 0.4, 1] as const;

/** The words his name is made of: they fly as one (LANDING_A.name). */
export const NAME_WORDS: readonly FlyWord[] = ['ryan', 'xu'];

export interface Flight {
  /** Source centre minus target centre (px) and source/target scale. */
  dx: number;
  dy: number;
  k: number;
  delay: number;
  duration: number;
  /** The share of the flight by which the word is on its own line. */
  yLead: number;
  /** His name's words scale linearly with the slide (so the two keep their
   *  places to each other exactly, one rigid unit); the others on a log
   *  scale. */
  rigid: boolean;
}
/** A word's place in the landing's order, lower first: the words bound above
 *  the line they leave from first (they rise behind his name), the highest
 *  first; then those bound below it, the deepest first — so no word rises
 *  into one still rising above it or drops through one still dropping below
 *  it. `from` and `top`: the tops of its box on the title and on the page
 *  (px); words on one line rank alike (the caller then reads along it). */
export function landingRank({ from, top }: { from: number; top: number }) {
  const line = Math.round(top / 4) * 4;
  return line < from - 2 ? line : 100000 - line;
}
/** When a word leaves and how long it flies: his name's words together
 *  (`order` null), the others in the cover's reading order (`order` 0, 1…). */
export function landingSlot(order: number | null) {
  if (order == null) return { delay: LANDING_A.name.delay, duration: LANDING_A.name.fly, yLead: LANDING_A.name.yLead, rigid: true };
  return { delay: LANDING_A.start + order * LANDING_A.stagger, duration: LANDING_A.fly, yLead: LANDING_A.yLead, rigid: false };
}
/** The FLIP from a word's box on the end title to its glyph box on the page:
 *  sizes match on the ink height (`srcCap` / `dstCap`). */
export function flightFor(src: Box, dst: Box, srcCap: number, dstCap: number, order: number | null): Flight {
  return {
    dx: src.x + src.w / 2 - (dst.x + dst.w / 2),
    dy: src.y + src.h / 2 - (dst.y + dst.h / 2),
    k: srcCap / Math.max(1e-6, dstCap),
    ...landingSlot(order),
  };
}
/** A flight sampled into keyframes: the slide on the landing curve, the fall
 *  a little ahead of it (`yLead`), the size with the slide — on a log scale
 *  (a word growing eightfold grows by the same ratio every frame), or, for
 *  his name, linearly: two flights on one slot, one scale and one line (its
 *  two words) then keep their places to each other exactly, one rigid unit
 *  (the title's name is the page's, scaled). */
const flyCurve = bezierFn(FLY_EASE);
export function flightPath(f: Flight, samples = 24) {
  const out: { offset: number; x: number; y: number; s: number }[] = [];
  const k = Math.max(1e-6, f.k);
  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    const ex = flyCurve(u);
    const ey = flyCurve(Math.min(1, u / Math.max(0.05, f.yLead)));
    out.push({ offset: u, x: f.dx * (1 - ex), y: f.dy * (1 - ey), s: f.rigid ? k + (1 - k) * ex : Math.pow(k, 1 - ex) });
  }
  return out;
}
/** Every word home (ms from the landing's start), `words` of them besides
 *  his name. */
export const landingAEnd = (words: number) =>
  Math.max(LANDING_A.name.delay + LANDING_A.name.fly, words > 0 ? LANDING_A.start + (words - 1) * LANDING_A.stagger + LANDING_A.fly : 0);
/** The page's words take over (the clones' cross-dissolve begins): every
 *  word home and the dark gone. */
export const landingAHome = (words: number) => Math.max(landingAEnd(words), LANDING_A.dissolve[1]);

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
// meanwhile, its lights going down from the first paint and its plates
// printed by the head script) and never for his photographs (they load
// behind the film) — past that the film plays on whatever has come, and a
// face that lands later has every word measured again on the same clock.
// One face is waited for longer, by the head script, not the island: the
// first word's (PROOF_FACE, ARCHIVE in Fraunces 900), which the proof
// prints alone on the sheet — never in a stand-in face while it can still
// come (at most PROOF_FACE_WAIT_MS from the proof's first frame; past that
// the plates print on whatever has come, and the face swaps in where it
// lands, as the rest of the film's do). A reload never sits still: the
// proof moves from the first paint.
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
 *  holds its plates for it at most, from its first frame. */
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
