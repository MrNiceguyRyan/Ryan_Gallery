// ── The entrance v2: a cover of words, a pass that assembles, a stub that
// becomes the first cover ──
// Owner, 2026-09-28 (after seeing the first pass): 这个机票的出现太奇怪了 … 封面
// 画面结束后，就如同这个 11moissanstoit.com 封面一样，一些字体组成一段文字，展示
// 大致的一个内容，最后的画面需要出现一些元素，和这些文字一样飞出来变成这个机票，
// 两者都在界面中，机票只能靠点开，撕开后和用户一起往下滑动，直接进入地球相册，
// 机票票根通过精美的动效划入，直接融合变成第一站的封面 … 机票票面的乘客写成 YOU
// … 这个机票其实就是一个开始按钮，需要亲自点击右侧才能撕下来.
//
// So, after the opening film (its words land in the cover: src/lib/
// openingFilm.ts, landing A), the first screen is a COVER OF WORDS: a large
// block of type that gives the gist of the archive, set block by block the
// way the reference's cover sets (opacity 0 → 1 and 20 px up over 0.6 s, a
// block every 180 ms, on its ENTER curve) — in our type, Fraunces on olive,
// never its condensed yellow. At the end of it the boarding pass ASSEMBLES
// beside the words: its paper forms, its print comes up like the text, and
// two words leave the last sentence and land on it (the first place → TO,
// "you" → PASSENGER). Both stay on the screen. The pass is a start button:
// only a click (a tap, Enter, Space) on its right side — the stub — tears it.
// Torn, the page goes down on its own into the globe, and the stub, kept by
// the reader, travels on an arc and becomes stop 01's cover's stub.
//
// Everything here is pure (no DOM) so scripts/boarding-pass.test.mjs holds
// it: what the pass prints (from the first chapter, never invented), what
// the cover says (from the archive's data), the reveal's and the assembly's
// schedules, the rule that only the stub tears, and the stub's hand-off to
// the explorer (the arc, the carry, the landing handshake).
//
// THE HAND-OFF (the contract with the explorer, HomePage/RouteAtlas):
//  1. torn, the entrance asks for the explorer with
//     requestExplore({ from: 'boarding-pass', stubHandoff: true });
//  2. with stubHandoff the explorer keeps stop 01's cover STUB hidden (the
//     photograph may show) until the entrance dispatches STUB_LANDED_EVENT;
//  3. the explorer exposes window[COVER_STUB_TARGET]() → StubRect | null: the
//     DERIVED screen rect where stop 01's cover stub will rest once the entry
//     lands (from the entry's final camera and the dock's maths, never read
//     off a moving element), available at the latest once the entry starts;
//  4. the explorer dispatches ENTRY_LANDED_EVENT once the camera is down.
// The entrance flies its torn stub along an arc to that rect, lands it, and
// dispatches STUB_LANDED_EVENT; its copy leaves as the real stub shows.

// With its extension: the tests import this module through esbuild, and the
// site through Vite; both resolve it.
import { stateCode } from './routeShield.ts';

// ── The contract's names ────────────────────────────────────────────────
export const STUB_LANDED_EVENT = 'archive:stub-landed';
export const ENTRY_LANDED_EVENT = 'archive:entry-landed';
/** window[COVER_STUB_TARGET]: () => StubRect | null (the explorer's). */
export const COVER_STUB_TARGET = '__archiveCoverStubTarget';

/** A rect on screen: (x, y) the top-left of the UNROTATED box, in viewport
 *  px (like a DOMRect of the box before its turn); `rotate` in degrees,
 *  clockwise, about the box's centre. */
export interface StubRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
}

/** A contract rect as the entrance can trust it: finite, a real size. */
export function validStubRect(rect: unknown): StubRect | null {
  if (!rect || typeof rect !== 'object') return null;
  const r = rect as Partial<StubRect>;
  const x = Number(r.x);
  const y = Number(r.y);
  const w = Number(r.w);
  const h = Number(r.h);
  const rotate = Number(r.rotate ?? 0);
  if (![x, y, w, h, rotate].every(Number.isFinite) || w < 4 || h < 4) return null;
  return { x, y, w, h, rotate };
}

// ── The curve ───────────────────────────────────────────────────────────
/** The reference's ENTER curve (11moissanstoit.com, module 75191): its
 *  block reveal, its board's mount and its switches ride it. Ours for the
 *  cover's reveal, the pass's assembly and the stub's arc. Not a house token
 *  (src/lib/motion.ts): it is the entrance's own, written once here and once
 *  in entrance.css (--entrance-ease). */
export const ENTER_EASE = [0.22, 0.61, 0.36, 1] as const;

// ── What it prints ──────────────────────────────────────────────────────
/** The address its QR code carries. */
export const PASS_URL = 'https://ryanxugallery.com/';

export interface PassChapter {
  name?: string | null;
  region?: string | null;
  year?: number | string | null;
  /** Its card stock (src/lib/ticketStock.ts): the stub lands on it. */
  slug?: string | null;
}

export interface PassFields {
  /** The viewer: the pass is the reader's. */
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
    passenger: 'YOU',
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

// ── What the cover says ─────────────────────────────────────────────────
// PROPOSED copy, every line (awaiting the owner). The facts are the
// archive's own (HomePage hands them over: the years its chapters carry, how
// many places and frames, its regions in route order); nothing is claimed
// that the data does not say — "a camera", not "one camera" (each chapter
// was shot on its own body). The words the opening film finds keep their own
// spans (`land`), so landing A has somewhere to land them.

/** The film's words, as landing A names them (src/lib/openingFilm.ts
 *  LANDING_TARGETS: `.entrance-intro [data-open-land="…"]`). */
export type LandWord = 'ryan' | 'xu' | 'camera' | 'archive' | 'travel' | 'thought' | 'you';
export const LAND_WORDS: readonly LandWord[] = ['ryan', 'xu', 'camera', 'travel', 'archive', 'thought', 'you'];

export type CoverPiece =
  | string
  /** A word the film lands (its text defaults to the word itself). */
  | { land: LandWord; text?: string }
  /** A word the pass takes: it flies to its field as the pass assembles. */
  | { pass: 'to'; text: string }
  /** Where a large line prefers to break on a wide screen (a phone sets
   *  the words as they fall). */
  | { br: true };

export type CoverKind = 'kicker' | 'xl' | 'xl-quiet' | 'm';
export interface CoverBlock {
  kind: CoverKind;
  pieces: CoverPiece[];
}

export interface CoverFacts {
  /** '2025–2026' (or one year, or '' when no chapter has one). */
  years: string;
  places: number;
  frames: number;
  /** The regions in route order (HomePage: each chapter's own, deduped). */
  regions: readonly string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Florida, Arizona, Utah and New York". */
export function listJoin(items: readonly string[]): string {
  const list = items.map((item) => item.trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** Distinct, in the order given (route order): the cover's regions. */
export function distinctRegions(regions: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  regions.forEach((region) => {
    const value = region?.trim();
    if (!value || seen.has(value.toLowerCase())) return;
    seen.add(value.toLowerCase());
    out.push(value);
  });
  return out;
}

/** The cover, block by block (PROPOSED copy). */
export function coverBlocks(facts: CoverFacts, first?: PassChapter | null): CoverBlock[] {
  const blocks: CoverBlock[] = [];
  blocks.push({ kind: 'kicker', pieces: facts.years ? ['Visual Archive', facts.years] : ['Visual Archive'] });
  blocks.push({
    kind: 'xl',
    // "a camera" held together (a no-break space): a narrow screen breaks
    // before the "a", never after it.
    pieces: [{ land: 'ryan', text: 'Ryan' }, ' ', { land: 'xu', text: 'Xu' }, ', a ', { land: 'camera' }, ',', { br: true }, 'and the places I ', { land: 'travel' }, '.'],
  });
  if (facts.places > 0) {
    blocks.push({
      kind: 'xl-quiet',
      pieces: [`${plural(facts.places, 'place', 'places')}. ${plural(Math.max(0, facts.frames), 'frame', 'frames')}.`],
    });
  }
  const where = listJoin(facts.regions);
  if (where || facts.years) {
    blocks.push({ kind: 'm', pieces: [[where, facts.years].filter(Boolean).join(', ') + '.'] });
  }
  blocks.push({
    kind: 'm',
    pieces: ['What the camera kept became this ', { land: 'archive' }, ' — the light, the ground, and the ', { land: 'thought' }, ' that came along.'],
  });
  const name = first?.name?.trim();
  blocks.push({
    kind: 'm',
    pieces: name
      ? ['First stop, ', { pass: 'to', text: name }, '. The passenger is ', { land: 'you' }, '.']
      : ['The passenger is ', { land: 'you' }, '.'],
  });
  return blocks;
}

/** A piece of a word: plain text, or a word the film or the pass takes (or
 *  a wide screen's line break: a word of its own, with no text). */
export interface WordPart {
  text: string;
  land?: LandWord;
  pass?: 'to';
  br?: true;
}

/** A block's pieces as words (split on white space — never on a no-break
 *  space; punctuation stays with the word it touches): each word is set on
 *  its own, so a rising word never carries a landed one with it and a comma
 *  never starts a line. */
export function coverWords(pieces: readonly CoverPiece[]): WordPart[][] {
  const words: WordPart[][] = [];
  let word: WordPart[] = [];
  const end = () => {
    if (word.length) words.push(word);
    word = [];
  };
  pieces.forEach((piece) => {
    if (typeof piece === 'string') {
      piece.split(/([ \t\n\r\f]+)/).forEach((chunk) => {
        if (!chunk) return;
        if (/^[ \t\n\r\f]+$/.test(chunk)) end();
        else word.push({ text: chunk });
      });
      return;
    }
    if ('br' in piece) {
      end();
      words.push([{ text: '', br: true }]);
      return;
    }
    if ('land' in piece) word.push({ text: piece.text ?? piece.land, land: piece.land });
    else word.push({ text: piece.text, pass: piece.pass });
  });
  end();
  return words;
}

/** A block's words read as plain text (the line breaks are spaces). */
export const coverText = (pieces: readonly CoverPiece[]) =>
  coverWords(pieces)
    .filter((word) => !word[0]?.br)
    .map((word) => word.map((part) => part.text).join(''))
    .join(' ')
    .replace(/ /g, ' ');

// ── The reveal ──────────────────────────────────────────────────────────
// As the reference's cover: block by block (never word by word, never
// scrolled), each block's words up from 20 px and in over 0.6 s on ENTER, a
// block every 180 ms. It starts as the film's words land (html[data-reel]
// 'landed'); the landed words themselves never move (they are home).
export const COVER_REVEAL = { stepMs: 180, durMs: 600, rise: 20 } as const;
/** When block `index` starts (ms after the reveal starts). */
export const revealAt = (index: number) => Math.max(0, Math.floor(index)) * COVER_REVEAL.stepMs;
/** When the last of `blocks` blocks is in. */
export const revealEnd = (blocks: number) => (blocks > 0 ? revealAt(blocks - 1) + COVER_REVEAL.durMs : 0);

// ── The assembly ────────────────────────────────────────────────────────
// At the end of the reveal the pass assembles beside the words, one
// choreographed FLIP of 1.2 s: its main paper comes up like a block of the
// text, the stub slides in to meet it at the perforation, the print comes
// up part by part, and two words fly out of the last sentence onto it — the
// first place into TO, "you" into PASSENGER (each a twin: the sentence keeps
// its own word). Then the hint. Times are ms from the assembly's start.
export type AssemblyPart = 'paper' | 'stub' | 'band' | 'route' | 'grid' | 'qr' | 'stubprint';
export const PASS_ASSEMBLY = {
  /** The assembly starts this long after the LAST block starts rising (the
   *  last line is still settling: one breath, not a wait). */
  lead: 240,
  /** The paper: up from `rise` px, in, and a hair of scale. */
  paper: { at: 0, ms: 600, rise: 20 },
  /** The stub: in from `slide` px to the right, to meet the perforation. */
  stub: { at: 120, ms: 600, slide: 26 },
  /** The print, part by part, up from `rise` px. */
  print: { ms: 420, rise: 8, at: { band: 180, route: 300, stubprint: 360, grid: 420, qr: 540 } },
  /** The words flying out of the sentence onto the pass. */
  flights: { ms: 860, at: { to: 160, you: 260 } },
  /** "Tear the stub to begin". */
  hint: { at: 820, ms: 380 },
} as const;

export interface AssemblyItem {
  part: AssemblyPart | 'flight-to' | 'flight-you' | 'hint';
  at: number;
  ms: number;
}

/** The assembly, every part's start and length (ms from its start). */
export function assemblySchedule(): AssemblyItem[] {
  const A = PASS_ASSEMBLY;
  const items: AssemblyItem[] = [
    { part: 'paper', at: A.paper.at, ms: A.paper.ms },
    { part: 'stub', at: A.stub.at, ms: A.stub.ms },
  ];
  (Object.keys(A.print.at) as Array<keyof typeof A.print.at>).forEach((part) => {
    items.push({ part, at: A.print.at[part], ms: A.print.ms });
  });
  items.push({ part: 'flight-to', at: A.flights.at.to, ms: A.flights.ms });
  items.push({ part: 'flight-you', at: A.flights.at.you, ms: A.flights.ms });
  items.push({ part: 'hint', at: A.hint.at, ms: A.hint.ms });
  return items.sort((a, b) => a.at - b.at);
}
/** The assembly's length, ms. */
export const assemblyMs = () => Math.max(...assemblySchedule().map((item) => item.at + item.ms));
/** When the assembly starts, ms after the reveal starts, for a cover of
 *  `blocks` blocks. */
export const assemblyAt = (blocks: number) => revealAt(Math.max(0, blocks - 1)) + PASS_ASSEMBLY.lead;

// ── The pass is a start button ──────────────────────────────────────────
// Only the stub tears it, and only when asked: a click or a tap on the stub,
// or Enter / Space on it (a real button). Hovering it shows it can be torn
// (the stub lifts a hair on its perforation); a click on the main part shows
// where (the stub peels at its top notch and lies back). Nothing else — no
// drag, no wheel, no scroll, no timer — ever tears it.
export type PassTarget = 'stub' | 'main' | 'elsewhere';
export type PassInput = 'click' | 'key' | 'hover' | 'press' | 'drag' | 'wheel' | 'scroll' | 'idle';
export type PassResponse = 'tear' | 'peek' | 'lift' | 'none';

export function passResponse(target: PassTarget, input: PassInput, torn = false): PassResponse {
  if (torn) return 'none';
  if (target === 'stub') {
    if (input === 'click' || input === 'key') return 'tear';
    if (input === 'hover' || input === 'press') return 'lift';
    return 'none';
  }
  if (target === 'main' && input === 'click') return 'peek';
  return 'none';
}

/** The pass's hinge against a cover's (ticketTear's HINGE_DEG, scaled): a
 *  stub pulled off a pass swings wider than a cover's. */
export const PASS_HINGE = 1.6;
/** Hovered (or pressed), the stub lifts this much on its perforation, deg:
 *  about a point just below its top notch (PEEK_PIVOT), eased in and out at
 *  HOVER_RATE per second. */
export const HOVER_PEEL_DEG = 2.2;
export const HOVER_RATE = 14;
/** The peel's pivot down the seam (a share of it from the top notch). */
export const PEEK_PIVOT = 0.2;
/** A click on the main part: the stub peels at its top notch and lies back
 *  (the way in is the stub). The peel's angle `k` (0 → 1) of the way through
 *  PEEK_MS: up quickly, down softly. */
export const PEEK_DEG = 4;
export const PEEK_MS = 380;
export function peekAngle(k: number): number {
  const t = clamp01(k);
  const up = 0.32;
  if (t <= up) {
    const a = t / up;
    return PEEK_DEG * (1 - (1 - a) * (1 - a));
  }
  const b = (t - up) / (1 - up);
  return PEEK_DEG * (1 - b * b * (3 - 2 * b));
}

/** Approach `target` from `value` at `rate` per second (an exponential
 *  ease, frame-rate independent). */
export function approach(value: number, target: number, rate: number, dt: number): number {
  return target + (value - target) * Math.exp(-rate * dt);
}

// ── The glide ───────────────────────────────────────────────────────────
// Torn, the page goes on by itself (no scroll asked of the reader), a beat
// after the stub is free: down one screen, the pass and the words going up
// and away as the globe rises over the lower edge, already facing stop 01.
/** The beat between the stub coming free and the page setting off, ms. */
export const GLIDE_AFTER_FREE_MS = 140;
/** The glide: one length, s. */
export const ARRIVAL_SECONDS = 1.6;
/** Its curve: a soft start and a long, soft landing. Its peak is 2.56× the
 *  mean speed — about 1600 px/s over a 1000 px glide. */
export const ARRIVAL_EASE = [0.3, 0, 0.2, 1] as const;

// ── The stub, kept ──────────────────────────────────────────────────────
// Free, the stub stays with the reader (a fixed layer: the page glides on
// under it). It settles into the hand — straightens a little, lifts, its
// shadow deepens (CARRY) — and once the explorer says where stop 01's cover
// stub will rest (COVER_STUB_TARGET) it travels there on one arc (FLIGHT): a
// quadratic path bowed up off the chord, a slight turn that peaks mid-way,
// its width going to the cover stub's. It waits there, still the pass's
// white stub, held in the air, fixed on the screen while the camera comes
// down under it (the reference's board holds still while its planet turns).
// When the camera has landed and the cover is there, it MERGES (MERGE): it
// settles onto the cover, the pass's paper and print giving way to stop 01's
// own card stock as the card unfolds to the cover stub's height; then it
// hands over — STUB_LANDED_EVENT — and its copy goes as the real stub shows.
export const STUB_CARRY = {
  /** Settling into the hand, ms (ease-out). */
  ms: 460,
  /** Lifted off the page, px up. */
  lift: 12,
  /** …a hair larger (nearer the eye). */
  scale: 1.03,
  /** How much of the tear's hinge it straightens out of. */
  straighten: 0.6,
} as const;

export const STUB_FLIGHT = {
  /** The arc's length, ms: in step with the distance, within the range the
   *  reference's moves keep (1.2–1.6 s). */
  minMs: 1200,
  maxMs: 1600,
  msPerPx: 0.42,
  /** The bow: the control point off the chord's middle, a share of the
   *  chord, toward the top of the screen; never more than bowMax px. */
  bow: 0.22,
  bowMax: 210,
  /** The slight turn, deg: added to the rotation, largest mid-way. */
  turn: 4.5,
  /** Coming in it is held a little lower (its shadow shortens by this
   *  share): still in the air, nearer the map. */
  shadowIn: 0.3,
  /** After the merge the copy (the blank card) fades over the real stub
   *  this long, ms (the stub's print develops): one step, no gap, no
   *  second stub anywhere. */
  handoffMs: 140,
  /** No target this long after the explorer landed (an explorer that does
   *  not say where): the stub is let go where it is. ms. */
  targetGraceMs: 900,
  /** …and never kept at all longer than this after it was torn, ms. */
  maxWaitMs: 12000,
  /** Let go: it fades where it is, ms. */
  fadeMs: 420,
} as const;

/** The merge, once the camera is down: shares of its length (linear time) —
 *  the card (stop 01's stock) comes up under the print, the print goes, the
 *  card unfolds to the cover stub's height, the stub settles onto the map
 *  (its shadow gone). On ENTER. */
export const STUB_MERGE = {
  ms: 520,
  cardIn: [0, 0.5] as const,
  printOut: [0.12, 0.7] as const,
  unfold: [0.08, 1] as const,
  shadowOut: [0, 0.8] as const,
} as const;

export interface Point2 {
  x: number;
  y: number;
}

const clamp = (value: number, lo: number, hi: number) => (value < lo ? lo : value > hi ? hi : value);
function clamp01(value: number) {
  return clamp(value, 0, 1);
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 → 1 across [a, b] of `k`, clamped. */
export const span01 = (k: number, [a, b]: readonly [number, number]) => clamp01((k - a) / Math.max(1e-6, b - a));
const smooth = (t: number) => t * t * (3 - 2 * t);

export const centreOf = (rect: StubRect): Point2 => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });

/** The arc's length for a flight between two centres, ms. */
export function stubFlightMs(from: Point2, to: Point2): number {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.round(clamp(STUB_FLIGHT.minMs + d * STUB_FLIGHT.msPerPx, STUB_FLIGHT.minMs, STUB_FLIGHT.maxMs));
}

/** The arc's control point: off the chord's middle, square to it, on the
 *  side toward the top of the screen (a thrown thing rises before it comes
 *  down), bowed by a share of the chord, at most bowMax. */
export function arcControl(p0: Point2, p1: Point2): Point2 {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const d = Math.hypot(dx, dy);
  const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  if (d < 1e-6) return mid;
  // The two normals; take the one that points up the screen (y < 0). A
  // vertical chord bows toward the screen's middle side (left of a right
  // edge, right of a left one) — here, simply to the left.
  let nx = dy / d;
  let ny = -dx / d;
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  const bow = Math.min(STUB_FLIGHT.bowMax, STUB_FLIGHT.bow * d);
  return { x: mid.x + nx * bow, y: mid.y + ny * bow };
}

/** A quadratic Bézier at t. */
export function bezier2(p0: Point2, c: Point2, p1: Point2, t: number): Point2 {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}

/** A cubic-bezier easing (CSS's), solved by bisection: pure, and exact
 *  enough for a pose. */
export function cubicEase([x1, y1, x2, y2]: readonly [number, number, number, number]) {
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  return (x: number) => {
    if (!(x > 0)) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (bx(mid) < x) lo = mid;
      else hi = mid;
    }
    return by((lo + hi) / 2);
  };
}
const enter = cubicEase(ENTER_EASE);
const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;

/** The stub as the courier draws it: its centre, turn and uniform scale
 *  (its own box is the pass stub's, `w` × `h` at scale 1), and the layers'
 *  shares. */
export interface StubPose {
  cx: number;
  cy: number;
  rotate: number;
  scale: number;
  /** The pass's white paper and print, 1 → 0. */
  print: number;
  /** Stop 01's card stock under it, 0 → 1. */
  card: number;
  /** The card's height, from the print's (0) to the cover stub's (1). */
  unfold: number;
  /** The carried shadow, 0 → 1. */
  shadow: number;
}

/** Free: where the tear left it (its centre and turn, scale 1). */
export interface FreeStub {
  cx: number;
  cy: number;
  rotate: number;
  /** Its box, px (the pass stub's). */
  w: number;
  h: number;
}

/** Settling into the hand, `ms` after it came free. */
export function carryPose(free: FreeStub, ms: number): StubPose {
  const k = easeOutCubic(ms / STUB_CARRY.ms);
  return {
    cx: free.cx,
    cy: free.cy - STUB_CARRY.lift * k,
    rotate: free.rotate * (1 - STUB_CARRY.straighten * k),
    scale: 1 + (STUB_CARRY.scale - 1) * k,
    print: 1,
    card: 0,
    unfold: 0,
    shadow: k,
  };
}

/** The carried stub's rest (the carry done). */
export const carried = (free: FreeStub) => carryPose(free, STUB_CARRY.ms);

/** The scale the stub lands at: the pass stub fitted inside the cover
 *  stub's rect (its width on a tall cover stub; its height on a short one —
 *  a phone's card), never larger. */
export function landingScale(box: { w: number; h: number }, to: StubRect) {
  return Math.min(to.w / Math.max(1, box.w), to.h / Math.max(1, box.h));
}

/** The flight, `k` (linear time, 0 → 1) of the way from `from` (the carried
 *  pose it set off in; its box `w` × `h`) to the cover stub's `to`. At 1 it
 *  is on `to`: centred on it, turned as it, fitted inside it. */
export function stubFlightPose(from: StubPose, box: { w: number; h: number }, to: StubRect, k: number): StubPose {
  const t = clamp01(k);
  const e = enter(t);
  const p0 = { x: from.cx, y: from.cy };
  const p1 = centreOf(to);
  const c = arcControl(p0, p1);
  const p = bezier2(p0, c, p1, e);
  const endScale = landingScale(box, to);
  return {
    cx: p.x,
    cy: p.y,
    rotate: lerp(from.rotate, to.rotate, e) + STUB_FLIGHT.turn * Math.sin(Math.PI * e),
    scale: lerp(from.scale, endScale, e),
    print: 1,
    card: 0,
    unfold: 0,
    shadow: from.shadow * (1 - STUB_FLIGHT.shadowIn * e),
  };
}

/** The merge, `k` (linear time, 0 → 1) of STUB_MERGE.ms after the camera
 *  landed, from `at` (the stub where the arc left it, on the target): the
 *  card comes up, the print goes, the card unfolds, the shadow settles. At 1
 *  it is the cover stub, blank: exactly its rect, its card, no shadow. */
export function stubMergePose(at: StubPose, k: number): StubPose {
  const t = clamp01(k);
  return {
    ...at,
    print: 1 - smooth(span01(t, STUB_MERGE.printOut)),
    card: smooth(span01(t, STUB_MERGE.cardIn)),
    unfold: enter(span01(t, STUB_MERGE.unfold)),
    shadow: at.shadow * (1 - smooth(span01(t, STUB_MERGE.shadowOut))),
  };
}

/** The card's box in the courier's own (unscaled) frame, centred on the
 *  print's: the size that lands at the cover stub's at the landing scale.
 *  It unfolds from the print's box to its own (`unfold`). */
export function courierCard(box: { w: number; h: number }, to: StubRect) {
  const endScale = landingScale(box, to);
  return { w: to.w / endScale, h: to.h / endScale, endScale };
}
/** The card's clip at `unfold` along one side (px, its own frame): from the
 *  print's extent (centred) to none. */
export function unfoldInset(cardSide: number, printSide: number, unfold: number) {
  const start = Math.max(0, (cardSide - printSide) / 2);
  return start * (1 - clamp01(unfold));
}

// ── The hand-off, step by step ──────────────────────────────────────────
// The courier's rule, pure: what it does on each word from the clock, the
// explorer's target, and the explorer's landing. It merges only once it has
// arrived AND the camera is down; it says it has landed exactly once, when
// it is the cover's stub; it never waits for good.
export type CourierPhase = 'carry' | 'arc' | 'hold' | 'merge' | 'handoff' | 'fade' | 'done';
export interface CourierState {
  phase: CourierPhase;
  /** When it came free (ms, the page's clock). */
  freeAt: number;
  target: StubRect | null;
  /** The arc: its start, its length, and the pose it set off in. */
  arcAt: number;
  arcMs: number;
  from: StubPose | null;
  entryLanded: number | null;
  /** When the merge began. */
  mergeAt: number;
  /** When the hand-off (or the let-go) began. */
  endAt: number;
  /** STUB_LANDED_EVENT has been said. */
  said: boolean;
}
export type CourierEvent =
  | { type: 'tick'; now: number; pose?: StubPose }
  | { type: 'target'; now: number; rect: StubRect | null }
  | { type: 'entry-landed'; now: number };
export type CourierEffect = 'say-landed' | 'remove';

export function courierStart(freeAt: number): CourierState {
  return { phase: 'carry', freeAt, target: null, arcAt: 0, arcMs: 0, from: null, entryLanded: null, mergeAt: 0, endAt: 0, said: false };
}

/** The courier's next state, and what to do. `pose` on a tick is where the
 *  stub is drawn now (the arc sets off from it). */
export function courierStep(state: CourierState, event: CourierEvent, free: FreeStub): { state: CourierState; effects: CourierEffect[] } {
  const effects: CourierEffect[] = [];
  let s = state;
  if (s.phase === 'done') return { state: s, effects };
  if (event.type === 'target') {
    const rect = event.rect;
    if (rect && (s.phase === 'carry' || s.phase === 'arc' || s.phase === 'hold')) s = { ...s, target: rect };
    return { state: s, effects };
  }
  if (event.type === 'entry-landed') {
    if (s.entryLanded == null) s = { ...s, entryLanded: event.now };
    event = { type: 'tick', now: event.now };
  }
  const now = event.now;
  const say = () => {
    if (!s.said) {
      s = { ...s, said: true };
      effects.push('say-landed');
    }
  };
  switch (s.phase) {
    case 'carry': {
      if (s.target && now - s.freeAt >= STUB_CARRY.ms) {
        const from = event.pose ?? carried(free);
        s = { ...s, phase: 'arc', arcAt: now, from, arcMs: stubFlightMs({ x: from.cx, y: from.cy }, centreOf(s.target)) };
      } else if (
        (!s.target && s.entryLanded != null && now - s.entryLanded >= STUB_FLIGHT.targetGraceMs) ||
        now - s.freeAt >= STUB_FLIGHT.maxWaitMs
      ) {
        s = { ...s, phase: 'fade', endAt: now };
      }
      break;
    }
    case 'arc': {
      if (now - s.arcAt >= s.arcMs) s = { ...s, phase: 'hold' };
      break;
    }
    default:
      break;
  }
  if (s.phase === 'hold') {
    // The camera is down (or never said so: merge all the same — the stub is
    // where the cover's will be — rather than keep the cover's stub hidden).
    if (s.entryLanded != null || now - s.freeAt >= STUB_FLIGHT.maxWaitMs) s = { ...s, phase: 'merge', mergeAt: now };
  }
  if (s.phase === 'merge' && now - s.mergeAt >= STUB_MERGE.ms) {
    s = { ...s, phase: 'handoff', endAt: now };
    say();
  }
  if (s.phase === 'handoff' && now - s.endAt >= STUB_FLIGHT.handoffMs) {
    s = { ...s, phase: 'done' };
    effects.push('remove');
  }
  if (s.phase === 'fade') {
    // Let go where it is: the explorer's own stub shows (nothing kept hidden).
    say();
    if (now - s.endAt >= STUB_FLIGHT.fadeMs) {
      s = { ...s, phase: 'done' };
      effects.push('remove');
    }
  }
  return { state: s, effects };
}

/** Where the courier draws the stub at `now` in `state`. */
export function courierPose(state: CourierState, free: FreeStub, now: number): { pose: StubPose; opacity: number } {
  const box = { w: free.w, h: free.h };
  switch (state.phase) {
    case 'carry':
      return { pose: carryPose(free, now - state.freeAt), opacity: 1 };
    case 'arc':
    case 'hold':
    case 'merge':
    case 'handoff': {
      const from = state.from ?? carried(free);
      const k = state.phase === 'arc' ? (now - state.arcAt) / Math.max(1, state.arcMs) : 1;
      const flown = state.target ? stubFlightPose(from, box, state.target, k) : from;
      const m = state.phase === 'merge' ? (now - state.mergeAt) / STUB_MERGE.ms : state.phase === 'handoff' ? 1 : 0;
      const pose = m > 0 ? stubMergePose(flown, m) : flown;
      const opacity = state.phase === 'handoff' ? 1 - clamp01((now - state.endAt) / STUB_FLIGHT.handoffMs) : 1;
      return { pose, opacity };
    }
    case 'fade': {
      const pose = carryPose(free, now - state.freeAt);
      const k = clamp01((now - state.endAt) / STUB_FLIGHT.fadeMs);
      return { pose, opacity: 1 - k * k };
    }
    default:
      return { pose: carried(free), opacity: 0 };
  }
}
