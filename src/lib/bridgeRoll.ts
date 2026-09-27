// ── The bridge: a roll of his own frames between the opening and chapter 1 ──
// The desktop homepage used to hand its opening to the archive through an
// index of six names bent round the planet: type only, no photograph until
// the third screen, and nothing that said what the archive is. The owner
// found it boring and said it did not carry the opening into the chapters.
// In its place a roll of his own frames runs through the statement of what
// this is: from each chapter its select (the cover) with the frame either
// side of it, at their own ratios, edge-printed with their numbers. The roll
// winds back from the last chapter to the first, and as each chapter's
// select passes the gate its place lights on the planet. Then it comes to
// rest with chapter 1's select on the left edge of chapter 1's plate, and
// that frame is lifted out of the roll and grows and rises into the plate's
// exact pixels. Every move is on the wheel and runs backwards on the way up.
//
// All of it is a pure function of the viewport, the files' ratios and a few
// untransformed offsets, measured on layout only (never a rect per frame).
// GlobePrologue draws it; RouteAtlas lights the places from `gateCrossings`
// and `litWhenSeen`. scripts/bridge-roll.test.mjs holds it.

import { smootherstep } from './motion.ts';

export const ROLL = {
  /** Frame height, as a share of the viewport's height. */
  frameH: 0.24,
  /** The frames' bottom edge, as a share of the viewport's height (their
   *  numbers hang below it). */
  bandBottom: 0.925,
  /** px between the frames of one chapter, and between two chapters. */
  gap: 6,
  cutGap: 72,
  /** The prologue progress over which the roll travels, the share of it at
   *  an even speed before it slows to rest, and how far past the viewport's
   *  right edge its head waits (px). */
  travel: [0.2, 1] as const,
  cruise: 0.6,
  enter: 24,
  /** A select whose centre has crossed this share of the viewport's width
   *  lights its place (once the place faces the reader, see `seenDeg`). */
  gate: 0.62,
  /** A place lights only within this great-circle distance (degrees) of the
   *  camera's centre: on the face of the planet, never round its back. */
  seenDeg: 72,
  /** The site's clamp on a photograph's ratio (a tall 9:20 to a wide 2.4:1). */
  ratio: [0.45, 2.4] as const,
  /** The two statements' windows on the prologue progress, and the latch's
   *  hysteresis. */
  s1: [0.28, 0.5] as const,
  s2: [0.7, 0.97] as const,
  hysteresis: 0.01,
  /** The landing: the frames not chosen step back to `dimTo` over the first
   *  `dimEnd` of it, then drop `dropPx` and go over `drop`. */
  dimTo: 0.4,
  dimEnd: 0.14,
  drop: [0.14, 0.4] as const,
  dropPx: 48,
  /** Two places lighting on the same frame light this far apart (ms). */
  stepMs: 240,
  /** Reduced motion: the roll does not travel, it cuts between three
   *  windows at these progresses (and waits off-screen before the first). */
  stillAt: [0.45, 0.75] as const,
} as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const pad2 = (value: number) => String(value).padStart(2, '0');

export function clampRatio(ratio: number) {
  const [min, max] = ROLL.ratio;
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(max, Math.max(min, ratio)) : 1.5;
}

/** A file's ratio from its dimensions, else from the Sanity asset name
 *  (`…-7728x5152.jpg`), clamped. */
export function frameRatio(url: string, width?: number, height?: number) {
  if (width && height) return clampRatio(width / height);
  const match = /-(\d+)x(\d+)\.[a-z]+/i.exec(url);
  return clampRatio(match ? Number(match[1]) / Number(match[2]) : Number.NaN);
}

export interface RollFrame {
  /** The frame's number in its chapter (the story's own order, from 1). */
  n: number;
  url: string;
  ratio: number;
  /** The chapter's select: its cover. */
  select: boolean;
}

/** One chapter's piece of the roll: its select with the frame either side
 *  of it, in the chapter's own order. The select is the frame whose file is
 *  the cover's; failing that, the first. */
export function rollFrames(
  photos: ReadonlyArray<{ imageUrl?: string; width?: number; height?: number }>,
  coverUrl?: string,
): RollFrame[] {
  const base = (url?: string) => (url ?? '').split('?')[0];
  const listed = photos.filter((photo) => !!photo.imageUrl);
  if (!listed.length) return [];
  const found = listed.findIndex((photo) => base(photo.imageUrl) === base(coverUrl));
  const cover = found >= 0 ? found : 0;
  return listed.flatMap((photo, index) => (Math.abs(index - cover) <= 1
    ? [{ n: index + 1, url: base(photo.imageUrl), ratio: frameRatio(base(photo.imageUrl), photo.width, photo.height), select: index === cover }]
    : []));
}

export interface RollChapterFrames {
  /** The chapter's number (1 = the first chapter). */
  order: number;
  frames: ReadonlyArray<{ n: number; ratio: number; select: boolean }>;
}

export interface RollLayout {
  frameH: number;
  /** In roll order: the last chapter first. `left` is in the band's space. */
  cuts: Array<{
    order: number;
    left: number;
    width: number;
    frames: Array<{ n: number; left: number; width: number; select: boolean }>;
  }>;
  width: number;
  /** Each cut's select centre in the band's space, in roll order. */
  covers: number[];
  /** Chapter 1's select, in the band's space (the frame that lands). */
  select: { left: number; width: number };
}

/** The roll laid out at frame height `frameH`: the chapters from the last to
 *  the first, each with its own frames in their own order. */
export function rollCuts(chapters: ReadonlyArray<RollChapterFrames>, frameH: number): RollLayout {
  const ordered = [...chapters].sort((a, b) => b.order - a.order);
  let x = 0;
  const cuts: RollLayout['cuts'] = [];
  const covers: number[] = [];
  let select = { left: 0, width: 0 };
  ordered.forEach((chapter, index) => {
    if (index > 0) x += ROLL.cutGap;
    const left = x;
    const frames: RollLayout['cuts'][number]['frames'] = [];
    chapter.frames.forEach((frame, frameIndex) => {
      if (frameIndex > 0) x += ROLL.gap;
      const width = Math.round(frameH * clampRatio(frame.ratio));
      frames.push({ n: frame.n, left: x, width, select: frame.select });
      if (frame.select) {
        covers.push(x + width / 2);
        if (chapter.order === 1) select = { left: x, width };
      }
      x += width;
    });
    if (!frames.some((frame) => frame.select) && frames.length) covers.push(frames[0].left + frames[0].width / 2);
    cuts.push({ order: chapter.order, left, width: x - left, frames });
  });
  return { frameH, cuts, width: x, covers, select };
}

/** The roll's travel at prologue progress `q`, 0 (head at the right edge) to
 *  1 (rest): even speed for `cruise` of its window, then a cosine slow-down
 *  that arrives with no speed left. */
export function rollTravel(q: number) {
  const [start, end] = ROLL.travel;
  const u = clamp01((q - start) / (end - start));
  const c = ROLL.cruise;
  const along = (v: number) => {
    if (v <= c) return v;
    const s = (v - c) / (1 - c);
    return c + (1 - c) * (s / 2 + Math.sin(Math.PI * s) / (2 * Math.PI));
  };
  return along(u) / along(1);
}

/** The band's x (px) at `q`, from X0 (its head just past the right edge) to
 *  X1 (chapter 1's select on its plate's left edge). */
export function rollX(q: number, X0: number, X1: number) {
  return X0 + (X1 - X0) * rollTravel(q);
}

/** Where the band's x must be for a window of cuts to be on screen: their
 *  span centred in the viewport, or set on the left margin when it is wider
 *  than the viewport allows. */
export function windowX(layout: RollLayout, from: number, to: number, viewportWidth: number) {
  const first = layout.cuts[from];
  const last = layout.cuts[Math.min(layout.cuts.length - 1, to)];
  if (!first || !last) return 0;
  const span = last.left + last.width - first.left;
  const margin = viewportWidth * 0.06;
  return span <= viewportWidth - 2 * margin
    ? (viewportWidth - span) / 2 - first.left
    : margin - first.left;
}

/** Reduced motion's roll: no travel, three cuts. Off-screen before the roll
 *  would have entered; the last chapters (06, 05, 04 on this issue) to the
 *  first still point; the middle pair to the second; the rest pose after. */
export function rollXStill(q: number, layout: RollLayout, X0: number, X1: number, viewportWidth: number) {
  if (q < ROLL.travel[0]) return X0;
  const n = layout.cuts.length;
  const early = Math.ceil(n / 2);
  if (q < ROLL.stillAt[0]) return windowX(layout, 0, early - 1, viewportWidth);
  if (q < ROLL.stillAt[1]) return windowX(layout, early, n - 2, viewportWidth);
  return X1;
}

/** The progress at which each select crosses the gate (roll order): the
 *  travel inverted, by bisection (it only ever increases). Infinity for a
 *  select that never reaches it. */
export function gateCrossings(covers: readonly number[], X0: number, X1: number, gateX: number) {
  const [start, end] = ROLL.travel;
  return covers.map((centre) => {
    const t = (gateX - centre - X0) / (X1 - X0);
    if (!(t <= 1)) return Number.POSITIVE_INFINITY;
    if (t <= 0) return start;
    let lo = start;
    let hi = end;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (rollTravel(mid) < t) lo = mid;
      else hi = mid;
    }
    return hi;
  });
}

/** How many selects have crossed the gate at `q`, and how far the roll is
 *  from the last one crossed to the next (0..1). */
export function gatePassed(q: number, crossings: readonly number[]) {
  let passed = 0;
  while (passed < crossings.length && q >= crossings[passed]) passed += 1;
  const from = passed > 0 ? crossings[passed - 1] : Number.NaN;
  const to = crossings[passed];
  const fraction = passed > 0 && Number.isFinite(to) ? clamp01((q - from) / (to - from)) : 0;
  return { passed, fraction };
}

/** Great-circle distance between two [lng, lat] points, in degrees. */
export function arcDegrees(a: readonly [number, number], b: readonly [number, number]) {
  const r = Math.PI / 180;
  const cos = Math.sin(a[1] * r) * Math.sin(b[1] * r) +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.cos((a[0] - b[0]) * r);
  return Math.acos(Math.max(-1, Math.min(1, cos))) / r;
}

/** How many places are lit (roll order): a place lights once its select has
 *  crossed the gate AND it faces the reader (under `seenDeg` of the camera's
 *  centre), and never before the one ahead of it in the roll. */
export function litWhenSeen(
  passed: number,
  centre: readonly [number, number],
  places: ReadonlyArray<readonly [number, number]>,
  seenDeg: number = ROLL.seenDeg,
) {
  let lit = 0;
  for (let index = 0; index < Math.min(passed, places.length); index += 1) {
    if (arcDegrees(centre, places[index]) >= seenDeg) break;
    lit = index + 1;
  }
  return lit;
}

/** Where the drawn route ends (its `line-trim-offset` end, on a line from the
 *  first chapter at 0 to the last at 1): back from the last chapter to the
 *  last place lit, running on toward the next one while the roll carries its
 *  select to the gate. 1 (nothing drawn) until a place is lit. `progress` is
 *  each place's position along the line, in roll order. */
export function routeTail(lit: number, passed: number, fraction: number, progress: readonly number[]) {
  if (lit <= 0 || !progress.length) return 1;
  const now = progress[Math.min(lit, progress.length) - 1];
  if (lit === passed && lit < progress.length) return now + (progress[lit] - now) * clamp01(fraction);
  return now;
}

/**
 * The landing: chapter 1's select, lifted out of the roll at rest, over the
 * landing clock L (0 at rest, 1 when chapter 1's plate is on the reading
 * line). It grows in place first (scale on smootherstep), then rises into
 * the plate's slot accelerating into the page's own motion:
 * top = from.y − drop·f(L), f = (1−b)L² + bL³, with b chosen so f′(1) =
 * span/drop — it arrives moving exactly as the plate it hands over to,
 * `span` px of scroll per unit of L. `x` settles on the slot's on the same
 * curve as the scale (they are one edge at rest already).
 */
export function landingPose(
  L: number,
  from: { x: number; y: number; scale: number },
  slot: { x: number; y: number },
  span: number,
) {
  const t = clamp01(L);
  const k = smootherstep(t);
  const drop = from.y - slot.y;
  // b may go below 0 (a wide window, where the drop is long for the scroll
  // that carries it): f stays monotonic for b ≥ −2 (f′ = t(2 − 2b + 3bt)),
  // and above 1 it would first run backwards, so it is held to [−1, 1].
  const b = drop > 0 ? Math.max(-1, Math.min(1, span / drop - 2)) : 0;
  const f = (1 - b) * t * t + b * t * t * t;
  return {
    x: from.x + (slot.x - from.x) * k,
    y: from.y - drop * f,
    scale: from.scale + (1 - from.scale) * k,
  };
}

/** The frames not chosen during the landing: one ink and one drop for the
 *  whole band. They step back on the house curve (an ease out), then fall
 *  away on an ease in — hold, then go. */
export function bandRecede(L: number) {
  const dim = 1 - (1 - ROLL.dimTo) * (1 - Math.pow(1 - clamp01(L / ROLL.dimEnd), 3));
  const [a, b] = ROLL.drop;
  const fall = clamp01((L - a) / (b - a)) ** 2;
  return { opacity: dim * (1 - fall), dropY: fall * ROLL.dropPx };
}

/** A statement's latch on the prologue progress: shown inside its window
 *  (with hysteresis on the way out), past once beyond it. */
export function statementState(q: number, window: readonly [number, number], shown: boolean) {
  const [a, b] = window;
  const h = ROLL.hysteresis;
  const on = shown ? q > a - h && q < b + h : q >= a && q < b;
  return { on, past: !on && q >= b };
}
