// ── The proof sheet: the homepage's ending, as numbers ──────────────────────
// The last ticket tears; the ending opens on the face that came off it (the
// last chapter's cover) and pulls back, in one move, until that frame is one
// cell of an editor's proof sheet: every frame of the issue, one row per
// place in chapter order, each at its OWN file ratio. The kept stubs head the
// rows; the editor rings the covers and threads them with the atlas's route.
//
// This module is the ONE source of that geometry and of its score. It is pure:
// the section's size, the chapters and a few type measurements (taken once,
// by the component, in the stub's and the title's own faces) go in; integer
// rects, paths, keyframe samples and event times come out. Nothing here reads
// the DOM, and nothing downstream measures a rect back.
import type { Collection } from '../types';

// ── Data ─────────────────────────────────────────────────────────────────────

export interface ProofFrame {
  /** Bare Sanity asset URL (no query). */
  url: string;
  /** The file's own width / height. */
  ratio: number;
  isCover: boolean;
}

export interface ProofChapter {
  /** Collection id; the chapter section is `archive-item-${id}`. */
  id: string;
  /** Collection slug: the key of the stub's card stock (lib/ticketStock). */
  slug: string;
  /** What the torn stub printed: '01'… */
  ordinal: string;
  place: string;
  region: string;
  year: string;
  coverUrl: string;
  coverRatio: number;
  frames: ProofFrame[];
}

const ASSET_HASH = /[0-9a-f]{40}/;
const FILE_DIMS = /-(\d+)x(\d+)\.[a-z]+/i;

/** Sanity puts the pixel dimensions in the asset's file name. */
export function fileRatio(url: string): number | null {
  const match = FILE_DIMS.exec(url);
  if (!match) return null;
  const ratio = Number(match[1]) / Number(match[2]);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export const pad2 = (value: number) => String(value).padStart(2, '0');

/**
 * The chapters in the homepage's reading order, printed the way the ticket
 * stubs print them (ordinal, place, `region ?? location`, year), with every
 * frame at its own ratio. The cover is found among the frames by its asset
 * hash; a cover that is not one of the frames leaves the first frame as the
 * row's chosen one.
 */
export function proofChapters(collections: readonly Collection[]): ProofChapter[] {
  const chapters: ProofChapter[] = [];
  collections.forEach((collection) => {
    const photos = (collection.photos ?? []).filter((photo) => !!photo.imageUrl);
    if (!photos.length) return;
    const coverUrl = collection.coverImageUrl || photos[0].imageUrl;
    const hash = ASSET_HASH.exec(coverUrl)?.[0];
    const found = hash ? photos.findIndex((photo) => photo.imageUrl.includes(hash)) : -1;
    const coverIndex = found >= 0 ? found : 0;
    chapters.push({
      id: collection._id,
      slug: collection.slug,
      ordinal: pad2(chapters.length + 1),
      place: collection.name.trim(),
      region: (collection.region ?? collection.location ?? '').trim(),
      year: collection.year != null ? String(collection.year) : '',
      coverUrl,
      coverRatio: fileRatio(coverUrl) ?? 1.5,
      frames: photos.map((photo, index) => {
        const own = photo.width && photo.height ? photo.width / photo.height : null;
        return {
          url: photo.imageUrl,
          ratio: own && Number.isFinite(own) && own > 0 ? own : fileRatio(photo.imageUrl) ?? 1.5,
          isCover: index === coverIndex,
        };
      }),
    });
  });
  return chapters;
}

/** "2025–2026" from the chapters' years; '' when none. */
export function yearSpan(years: readonly string[]): string {
  const values = [...new Set(years.filter(Boolean))].sort();
  if (!values.length) return '';
  return values.length > 1 ? `${values[0]}–${values[values.length - 1]}` : values[0];
}

// ── Geometry ─────────────────────────────────────────────────────────────────

/** Type measured once, in its own face, at the sizes given (see the component's ruler). */
export interface ProofMetrics {
  /** The widest stub ordinal, per px of font size (Fraunces 400). */
  ordinalEm: number;
  /** The widest stub meta line (PLACE / Region · Year), in px. */
  metaW: number;
  /** Each figure's final value, per px of font size (Fraunces 400). */
  figureEm: number[];
  /** Each figure's label, in px (Space Grotesk 11px). */
  figureLabelW: number[];
  /** The widest stub count (the tally's figure), per px of font size (Fraunces 400). */
  countEm: number;
}

export const PROOF = {
  /** The nav's own frame: RYAN XU's left edge and the pills' right edge. */
  M: 48,
  /** The fixed nav's box: nothing rests above it. */
  NAV: 112,
  /** Room above the grid for the kicker, and below it for the foot. */
  KICK: 40,
  FOOT: 44,
  /** Stub → row gap, frame gap. */
  G: 20,
  GAP: 6,
  /** The number band under each row (numbers' top sits NUM_TOP below the
   *  frames), and the lead before the next row. Tight, like a contact sheet:
   *  mid-pull-back the band is scaled with everything else, so every px here
   *  is seven px of bare ground at 7x. */
  NUM: 20,
  NUM_TOP: 7,
  LEAD: 8,
  /** Below this row height the sheet is not a sheet any more (≈1180px wide):
   *  the quiet ending renders instead. */
  MIN_H: 44,
  /** The china marker's ring sits this far outside the frame. */
  RING: 5,
  /** The stub's print. */
  PRINT_PAD: 12,
  PRINT_INNER: 12,
  PRINT_RIGHT: 14,
  /** The tally: one tick per frame, in fives (a tally is read in fives), a
   *  stroke heavy enough that a two-frame chapter's "||" is still a mark;
   *  then the count, a Fraunces figure half the ordinal's size, so every
   *  stub carries two figures — which one it is, and how many it holds. */
  TICK_W: 2,
  TICK_H: 10,
  TICK_GAP: 3,
  TICK_GROUP: 5,
  TICK_GROUP_GAP: 4,
  TALLY_GAP: 10,
  COUNT_MIN: 14,
  COUNT_MAX: 20,
  /** Copy block. */
  TITLE_MAX: 88,
  TITLE_LEAD: 0.96,
  FIG_GAP: 38,
  FIG_MAX: 38,
  FIG_MIN: 26,
  COPY_FOOT: 28,
} as const;

export interface ProofRect { x: number; y: number; w: number; h: number }

/**
 * The room the sheet is set in. The PAGE is the closing's own screen (the
 * nav's frame round it, a kicker over the grid, the links under the copy);
 * the PANEL is the explorer's places panel grown into the contact sheet
 * (ExplorerControls, 2026-09-30: the Index folded into the list of places):
 * set under the panel's own head (its two views): tighter margins, no
 * kicker — the head says what the sheet is — and no links (the nav and the
 * wordmark are on screen round it). The copy sits in the room the short
 * rows leave, as on the page.
 */
export interface ProofBounds {
  /** Side margin. */
  M: number;
  /** Nothing rests above this line (the nav's box; the panel's head). */
  top: number;
  /** Room above the grid for the kicker, and below it for the foot. */
  KICK: number;
  FOOT: number;
  /** Where the grid sits in the height it is given. */
  align: 'center' | 'top';
  /** The copy block carries the links line. */
  links: boolean;
  /** The copy never runs closer than this to the foot. */
  copyFoot: number;
}

export const PAGE_BOUNDS: ProofBounds = {
  M: PROOF.M,
  top: PROOF.NAV,
  KICK: PROOF.KICK,
  FOOT: PROOF.FOOT,
  align: 'center',
  links: true,
  copyFoot: PROOF.COPY_FOOT,
};

export const PANEL_BOUNDS: ProofBounds = {
  M: 28,
  top: 24,
  KICK: 0,
  FOOT: 24,
  align: 'center',
  links: false,
  copyFoot: 24,
};

export interface ProofFrameBox extends ProofRect {
  /** 1-based frame number across the issue. */
  n: number;
  /** Row (chapter) index and index within the row. */
  row: number;
  k: number;
  isCover: boolean;
  url: string;
}

export interface ProofStubBox extends ProofRect {
  row: number;
  /** Where the perforation runs, and the torn photo wedge left of it. */
  seam: number;
  /** Stub print: ordinal size, where the tally line sits, the count's size. */
  ordinalSize: number;
  tallyTop: number;
  countSize: number;
}

export interface ProofLayout {
  W: number;
  H: number;
  /** Row height (frames), stub height (frames + number band), row pitch. */
  h: number;
  SH: number;
  pitch: number;
  SW: number;
  x0: number;
  gridTop: number;
  frames: ProofFrameBox[];
  stubs: ProofStubBox[];
  rowEnds: number[];
  kicker: { x: number; y: number };
  /** The space the short rows leave. */
  voidX: number;
  copyW: number;
  figureSize: number;
  figureGap: number;
  bounds: ProofBounds;
}

const clamp = (lo: number, value: number, hi: number) => Math.max(lo, Math.min(hi, value));

/** The width of a tally of `count` ticks, set in fives. */
export function ticksWidth(count: number) {
  if (count <= 0) return 0;
  const { TICK_W, TICK_GAP, TICK_GROUP, TICK_GROUP_GAP } = PROOF;
  return count * TICK_W + (count - 1) * TICK_GAP + Math.floor((count - 1) / TICK_GROUP) * TICK_GROUP_GAP;
}

function stubAnatomy(h: number, metrics: ProofMetrics, maxFrames: number) {
  const seam = Math.round(clamp(26, h * 0.3 + 8, 36));
  const ordinalSize = Math.round(clamp(26, h * 0.48, 38));
  const countSize = Math.round(clamp(PROOF.COUNT_MIN, ordinalSize * 0.5, PROOF.COUNT_MAX));
  // The print column holds the ordinal beside its PLACE / Region · Year
  // stack, and under them the tally line: the longest row's ticks and its count.
  const head = Math.ceil(metrics.ordinalEm * ordinalSize) + PROOF.PRINT_INNER + Math.ceil(metrics.metaW);
  const tally = ticksWidth(maxFrames) + PROOF.TALLY_GAP + Math.ceil(metrics.countEm * countSize);
  const SW = seam + PROOF.PRINT_PAD + Math.max(head, tally) + PROOF.PRINT_RIGHT;
  return { seam, ordinalSize, countSize, SW };
}

/**
 * Every rect of the resting sheet, from the section's size alone. Returns
 * null when the sheet cannot be set well at this size (the quiet ending).
 */
export function proofLayout(
  W: number,
  H: number,
  chapters: readonly ProofChapter[],
  metrics: ProofMetrics,
  bounds: ProofBounds = PAGE_BOUNDS,
): ProofLayout | null {
  const { G, GAP, NUM, NUM_TOP, LEAD } = PROOF;
  const { M, top: NAV, KICK, FOOT } = bounds;
  if (!chapters.length || W <= 0 || H <= 0) return null;
  const rows = chapters.map((chapter) => ({
    chapter,
    sumR: chapter.frames.reduce((sum, frame) => sum + frame.ratio, 0),
    n: chapter.frames.length,
  }));
  const nRows = rows.length;
  const maxFrames = Math.max(...rows.map((row) => row.n));
  const hH = (H - NAV - KICK - FOOT - nRows * (NUM + LEAD) + LEAD) / nRows;
  // The stub's width and the row height depend on each other only weakly
  // (the ordinal is set from the row height): settle it in three turns.
  let h = 72;
  let anatomy = stubAnatomy(h, metrics, maxFrames);
  for (let turn = 0; turn < 3; turn += 1) {
    const x0 = M + anatomy.SW + G;
    const hW = Math.min(...rows.map((row) => (W - M - x0 - (row.n - 1) * GAP) / row.sumR));
    h = Math.floor(Math.min(hW, hH));
    anatomy = stubAnatomy(h, metrics, maxFrames);
  }
  // Widths are rounded one frame at a time, so a long row can overrun its
  // measure by a pixel or two: step down until every row ends inside the
  // right margin.
  const rowEnd = (height: number, x: number) => rows.map((row) => row.chapter.frames.reduce(
    (end, frame) => end + Math.round(height * frame.ratio) + GAP, x) - GAP);
  while (h > PROOF.MIN_H && Math.max(...rowEnd(h, M + anatomy.SW + G)) > W - M) {
    h -= 1;
    anatomy = stubAnatomy(h, metrics, maxFrames);
  }
  if (h < PROOF.MIN_H) return null;
  const { SW, seam, ordinalSize, countSize } = anatomy;
  const x0 = M + SW + G;
  const SH = h + NUM;
  const pitch = SH + LEAD;
  const gridH = nRows * pitch - LEAD;
  const gridTop = Math.round(NAV + KICK + (bounds.align === 'top' ? 0 : (H - NAV - KICK - FOOT - gridH) / 2));

  const frames: ProofFrameBox[] = [];
  const stubs: ProofStubBox[] = [];
  const rowEnds: number[] = [];
  let n = 0;
  rows.forEach((row, rowIndex) => {
    const y = gridTop + rowIndex * pitch;
    stubs.push({ x: M, y, w: SW, h: SH, row: rowIndex, seam, ordinalSize, tallyTop: h + NUM_TOP, countSize });
    let x = x0;
    row.chapter.frames.forEach((frame, k) => {
      n += 1;
      // A photograph keeps its own ratio: w is h × ratio, rounded once.
      const w = Math.round(h * frame.ratio);
      frames.push({ x, y, w, h, n, row: rowIndex, k, isCover: frame.isCover, url: frame.url });
      x += w + GAP;
    });
    rowEnds.push(x - GAP);
  });

  // The copy sits in the room the short rows leave: right of every row from
  // the third on (rows one and two run long).
  const voidX = Math.max(...rowEnds.slice(Math.min(2, nRows - 1))) + Math.round(W * 0.05);
  const copyW = W - M - voidX;
  if (copyW < 280) return null;

  // Figures: the largest size (≤ FIG_MAX) at which the three columns fit the
  // copy's measure, so "2025–2026" never runs into the right margin.
  const columns = (size: number) => metrics.figureEm.reduce(
    (sum, em, index) => sum + Math.max(em * size, metrics.figureLabelW[index] ?? 0),
    0,
  );
  let figureGap: number = PROOF.FIG_GAP;
  let figureSize: number = PROOF.FIG_MAX;
  const gaps = Math.max(0, metrics.figureEm.length - 1);
  // (A few px of slack: the figures were measured at one optical size.)
  const measure = copyW - 6;
  while (figureSize > PROOF.FIG_MIN && columns(figureSize) + gaps * figureGap > measure) figureSize -= 1;
  if (columns(figureSize) + gaps * figureGap > measure) figureGap = Math.max(20, Math.floor((measure - columns(figureSize)) / Math.max(1, gaps)));

  return {
    W, H, h, SH, pitch, SW, x0, gridTop, frames, stubs, rowEnds,
    kicker: { x: M, y: gridTop - 30 },
    voidX, copyW, figureSize, figureGap,
    bounds,
  };
}

/** The copy block's height at a title size (every line box is set, not measured). */
export function copyHeight(titleSize: number, figureSize: number, withLinks = true) {
  const title = 4 * PROOF.TITLE_LEAD * titleSize;
  const figures = 30 + figureSize + 9 + 12;
  const links = withLinks ? 18 + 44 : 0;
  return Math.ceil(title + figures + links);
}

/**
 * Where the copy block goes once its title has been fitted to the measure:
 * level with the third row, never closer than 12px under the number line of
 * a row that runs under it, and never past the foot (it shrinks instead).
 */
export function placeCopy(layout: ProofLayout, fittedSize: number) {
  const { gridTop, pitch, h, voidX, H } = layout;
  const rowCount = layout.stubs.length;
  const anchorRow = Math.min(2, rowCount - 1);
  const rowTop = gridTop + anchorRow * pitch;
  let floor = 0;
  for (let row = 0; row < anchorRow; row += 1) {
    if (layout.rowEnds[row] > voidX - 8) floor = Math.max(floor, gridTop + row * pitch + h + PROOF.NUM_TOP + 9 + 12);
  }
  let size = Math.min(PROOF.TITLE_MAX, fittedSize);
  const topAt = (s: number) => Math.max(floor, rowTop - Math.round(s * 0.2));
  for (let turn = 0; turn < 4; turn += 1) {
    const over = topAt(size) + copyHeight(size, layout.figureSize, layout.bounds.links) - (H - layout.bounds.copyFoot);
    if (over <= 0) break;
    size = Math.floor(size - over / (4 * PROOF.TITLE_LEAD) - 1);
  }
  return { x: voidX, y: topAt(size), w: layout.copyW, titleSize: Math.max(24, size) };
}

// ── The pull-back ────────────────────────────────────────────────────────────

/** A cubic-bezier easing (CSS semantics), solved by bisection. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let u = t;
    for (let i = 0; i < 30; i += 1) {
      u = (lo + hi) / 2;
      const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
      if (x < t) lo = u;
      else hi = u;
    }
    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  };
}

/** The camera's curve, applied in LOG space: it leaves at speed, lands soft. */
export const ZOOM_EASE = cubicBezier(0.32, 0.12, 0.2, 1);
const ZOOM_SAMPLES = 48;
/** The mid-move pan: at most this share of the height, and never closer
 *  than PAN_FOOT to the bottom edge for frame 58. */
const PAN_MAX = 0.14;
const PAN_FOOT = 14;
const PAN_SOFT = 18;
const PAN_RAMP = 0.14;
/** The rows gather: mid-move the band between rows (the number band and
 *  the lead, empty until the ticks light the numbers) grows as s^(1 − GATHER)
 *  instead of s, so the camera shows a sheet, not a 200px strip of ground
 *  between two rows. It comes in over [GATHER_FROM, GATHER_TO] of the move
 *  (log-space progress): at the start the opening frame is exactly the hero,
 *  and no row enters the nav band before the nav has stepped out. */
const GATHER = 0.5;
const GATHER_FROM = 0.05;
const GATHER_TO = 0.19;
/** File sizes on the Sanity CDN, bucketed so window sizes share cache hits. */
const WIDTH_BUCKETS = [200, 300, 400, 600, 800, 1000, 1200, 1600, 2000];

export interface ProofZoomFrame {
  /** The largest scale at which this frame is ever on screen. */
  kmax: number;
  /** Requested file width (Sanity `w`). */
  srcW: number;
  /** One transform per sample (transform-origin 0 0), last one identity. */
  transforms: string[];
}

export interface ProofZoom {
  S0: number;
  F: { x: number; y: number };
  /** The focal point's bias: the largest downward pan, px. */
  panY: number;
  /** Sample offsets (0…1) and scales. */
  offsets: number[];
  scales: number[];
  anchor: ProofFrameBox;
  /** Frame 58 as it is first seen, and where its caption goes. */
  hero: ProofRect;
  caption: { x: number; y: number };
  frames: ProofZoomFrame[];
  /** Per sample: the band between rows as a multiple of its resting size. */
  gather: number[];
  /** Translate-only path of a point riding row `row`, `dy` below the row's
   *  top at rest (text never scales). */
  ride: (px: number, row: number, dy: number) => string[];
}

const fixed = (value: number, digits: number) => {
  const text = value.toFixed(digits);
  return text === '-0.00' || text === '-0.0000' ? text.slice(1) : text;
};

/**
 * One unbroken camera move about a fixed point F: at t = 0 the anchor (the
 * last chapter's cover) fills 80% of the height, centred; at t = 1 the sheet
 * is at rest. Every frame is its own small layer travelling in a straight
 * line; its scale is clamped to the largest at which it is ever on screen
 * (about its true centre), so an off-screen frame stays off screen and its
 * raster stays small. `dpr` picks the file each frame needs: the larger of
 * its biggest on-screen size and twice its resting size.
 */
export function proofZoom(layout: ProofLayout, dpr: number): ProofZoom {
  const { W, H, frames } = layout;
  const lastRow = layout.stubs.length - 1;
  const anchor = frames.find((frame) => frame.row === lastRow && frame.isCover) ??
    frames.filter((frame) => frame.row === lastRow)[0] ?? frames[frames.length - 1];
  const S0 = Math.max(1.0001, Math.min((H * 0.8) / anchor.h, (W * 0.84) / anchor.w));
  const C = { x: W / 2, y: H / 2 + 12 };
  const P = { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 };
  const F = { x: (S0 * P.x - C.x) / (S0 - 1), y: (S0 * P.y - C.y) / (S0 - 1) };
  const offsets: number[] = [];
  const scales: number[] = [];
  for (let j = 0; j <= ZOOM_SAMPLES; j += 1) {
    const t = j / ZOOM_SAMPLES;
    offsets.push(t);
    scales.push(j === ZOOM_SAMPLES ? 1 : Math.pow(S0, 1 - ZOOM_EASE(t)));
  }
  // The focal point, biased. A pure zoom about F keeps the view on the last
  // row, so mid-move the row above sits mostly off the top with a band of
  // bare ground (the number band, scaled) between. A downward pan brings
  // more of the sheet in earlier, within two limits: frame 58 never leaves
  // the bottom edge, and its centre never passes its resting height — so it
  // travels one way only (down, then held level while it shrinks), with no
  // overshoot and no drift back up under the landing stubs. It ramps in over
  // the first stretch of the move so the opening frame is exactly the hero.
  const logS0 = Math.log(S0);
  const lift = F.y - (anchor.y + anchor.h / 2);
  const softMin = (a: number, b: number) => -PAN_SOFT * Math.log(Math.exp(-a / PAN_SOFT) + Math.exp(-b / PAN_SOFT));
  const pan = scales.map((s, j) => {
    if (j === ZOOM_SAMPLES || lift <= 0) return 0;
    const u = 1 - Math.log(s) / logS0;
    const ramp = Math.min(1, u / PAN_RAMP);
    const room = H - PAN_FOOT - (F.y + s * (anchor.y + anchor.h - F.y));
    const hold = lift * (s - 1);
    const pan = ramp * ramp * (3 - 2 * ramp) * softMin(Math.max(0, room), Math.max(0, hold));
    return Math.max(0, Math.min(H * PAN_MAX, pan));
  });
  const panY = Math.max(...pan);
  // The gather: the anchor's row is placed by the camera (zoom about F plus
  // the pan); every other row stands one scaled row plus one GATHERED band
  // per row away from it. At s = 1 that is the resting pitch exactly.
  const band = layout.pitch - layout.h;
  const gather = scales.map((s, j) => {
    if (j === ZOOM_SAMPLES) return 1;
    const u = 1 - Math.log(s) / logS0;
    const r = clamp(0, (u - GATHER_FROM) / (GATHER_TO - GATHER_FROM), 1);
    return Math.pow(s, 1 - GATHER * r * r * (3 - 2 * r));
  });
  const anchorTop = anchor.y;
  const rowTop = (row: number, j: number) => {
    const s = scales[j];
    const top = F.y + s * (anchorTop - F.y) + pan[j];
    return top + (row - anchor.row) * (s * layout.h + band * gather[j]);
  };
  const margin = 0.05 * W;
  const visible = (frame: ProofFrameBox, j: number) => {
    const s = scales[j];
    const x = F.x + s * (frame.x - F.x);
    const y = rowTop(frame.row, j);
    return x < W + margin && x + s * frame.w > -margin && y < H + margin && y + s * frame.h > -margin;
  };
  const zoomFrames = frames.map((frame) => {
    let kmax = 1;
    scales.forEach((s, j) => {
      if (visible(frame, j) || (j < ZOOM_SAMPLES && visible(frame, j + 1))) kmax = Math.max(kmax, s);
    });
    const transforms = scales.map((s, j) => {
      if (j === ZOOM_SAMPLES) return 'translate(0px, 0px) scale(1)';
      const k = Math.min(s, kmax);
      const cx = F.x + s * (frame.x + frame.w / 2 - F.x);
      const cy = rowTop(frame.row, j) + (s * frame.h) / 2;
      return `translate(${fixed(cx - (k * frame.w) / 2 - frame.x, 2)}px, ${fixed(cy - (k * frame.h) / 2 - frame.y, 2)}px) scale(${fixed(k, 4)})`;
    });
    const need = frame.w * Math.max(kmax * dpr, 2);
    const srcW = WIDTH_BUCKETS.find((bucket) => bucket >= need) ?? WIDTH_BUCKETS[WIDTH_BUCKETS.length - 1];
    return { kmax, srcW, transforms };
  });
  const hero = {
    x: F.x + S0 * (anchor.x - F.x),
    y: F.y + S0 * (anchor.y - F.y),
    w: S0 * anchor.w,
    h: S0 * anchor.h,
  };
  const ride = (px: number, row: number, dy: number) => {
    const restY = layout.gridTop + row * layout.pitch + dy;
    return scales.map((s, j) => (j === ZOOM_SAMPLES
      ? 'translate(0px, 0px)'
      : `translate(${fixed(F.x + s * (px - F.x) - px, 2)}px, ${fixed(rowTop(row, j) + s * dy - restY, 2)}px)`));
  };
  return {
    S0, F, panY, offsets, scales, anchor, hero,
    caption: { x: Math.round(hero.x), y: Math.round(hero.y + hero.h + 16) },
    frames: zoomFrames,
    gather,
    ride,
  };
}

/** The anchor's file width: the plate's own ladder (ArchiveChapter). */
export function anchorWidth(need: number) {
  return need <= 1000 ? 1000 : need <= 1600 ? 1600 : 2000;
}

/** The anchor reuses the plate's own file formula (ArchiveChapter), so the
 *  face that came off is already in the cache. */
export function anchorSrc(url: string, need: number) {
  const width = anchorWidth(need);
  return `${url}?auto=format&w=${width}&q=${width === 2000 ? 78 : 82}`;
}

export function frameSrc(url: string, width: number) {
  return `${url}?w=${width}&auto=format&q=80`;
}

// ── Paper and ink ────────────────────────────────────────────────────────────

/** Small seeded PRNG (mulberry32): every stub and ring has its own hand. */
export function seeded(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f1 = (value: number) => +value.toFixed(1);

/**
 * The kept stub's paper, in its own box (SW × SH): a torn left edge that
 * wanders, the white paper core showing between the tear and the photograph,
 * a wedge of the chapter's cover up to the perforation (the cover's right
 * edge, which met the stub), the perforation intact with a notch at each end.
 */
export function stubPaper(stub: ProofStubBox, index: number) {
  const { w: SW, h: SH, seam } = stub;
  const wedge = seam - 5;
  const NOTCH = 6;
  const HOLE = 2.1;
  const PITCH = 8;
  const random = seeded(index * 7919 + 101);
  let a = 3 + random() * 4;
  let b = wedge - 2 - random() * 6;
  if (index % 2) [a, b] = [b, a];
  const p1 = random() * 6;
  const p2 = random() * 6;
  const points: Array<[number, number, number]> = [];
  for (let y = 0; y <= SH; y += 1.4 + random() * 2.2) {
    const t = y / SH;
    const wave = a + (b - a) * t + 1.7 * Math.sin(y / 15 + p1) + 0.9 * Math.sin(y / 4.7 + p2) + (random() - 0.5) * 1.5;
    points.push([Math.max(0.6, seam - 3 - wave), y, 0.7 + random() * random() * 2.4]);
  }
  points[points.length - 1][1] = SH;
  const reversed = points.slice().reverse();
  let paper = `M ${f1(points[0][0])} 0 L ${seam - NOTCH} 0 A ${NOTCH} ${NOTCH} 0 0 0 ${seam + NOTCH} 0 L ${SW} 0 L ${SW} ${SH} L ${seam + NOTCH} ${SH} A ${NOTCH} ${NOTCH} 0 0 0 ${seam - NOTCH} ${SH} `;
  paper += reversed.map(([x, y]) => `L ${f1(x)} ${f1(y)}`).join(' ') + ' Z';
  for (let y = NOTCH + 5; y < SH - NOTCH - 3; y += PITCH) {
    paper += ` M ${f1(seam - HOLE)} ${y} a ${HOLE} ${HOLE} 0 1 0 ${2 * HOLE} 0 a ${HOLE} ${HOLE} 0 1 0 ${-2 * HOLE} 0 Z`;
  }
  let photo = `M ${f1(points[0][0] + points[0][2])} 0 L ${seam} 0 L ${seam} ${SH} `;
  photo += reversed.map(([x, y, fray]) => `L ${f1(x + fray)} ${f1(y)}`).join(' ') + ' Z';
  return { paper, photo };
}

/** A quick china-marker box: four slightly bowed sides, soft corners, an overshoot past the start. */
export function ringPath(frame: ProofRect, seed: number) {
  const random = seeded(seed);
  const jitter = (amount: number) => (random() - 0.5) * amount;
  const o = PROOF.RING;
  const L = frame.x - o + jitter(2);
  const T = frame.y - o + jitter(2);
  const R = frame.x + frame.w + o + jitter(2);
  const B = frame.y + frame.h + o + jitter(2);
  const bw = R - L;
  const bh = B - T;
  const n = (value: number) => f1(value);
  return [
    `M ${n(L + 9 + jitter(3))} ${n(T + 0.5 + jitter(1))}`,
    `C ${n(L + bw * 0.38)} ${n(T - 1.6 + jitter(1.2))}, ${n(R - bw * 0.32)} ${n(T + 1.4 + jitter(1.2))}, ${n(R - 3)} ${n(T + jitter(0.8))}`,
    `Q ${n(R + 0.8)} ${n(T - 0.3)}, ${n(R + jitter(0.8))} ${n(T + 4)}`,
    `C ${n(R + 1.4 + jitter(1))} ${n(T + bh * 0.4)}, ${n(R - 1.2 + jitter(1))} ${n(B - bh * 0.34)}, ${n(R + jitter(0.8))} ${n(B - 3)}`,
    `Q ${n(R + 0.3)} ${n(B + 0.9)}, ${n(R - 4)} ${n(B + jitter(0.8))}`,
    `C ${n(R - bw * 0.3)} ${n(B + 1.6 + jitter(1.2))}, ${n(L + bw * 0.36)} ${n(B - 1.2 + jitter(1.2))}, ${n(L + 3)} ${n(B + jitter(0.8))}`,
    `Q ${n(L - 0.9)} ${n(B + 0.2)}, ${n(L + jitter(0.8))} ${n(B - 4)}`,
    `C ${n(L - 1.3 + jitter(1))} ${n(B - bh * 0.42)}, ${n(L + 1.2 + jitter(1))} ${n(T + bh * 0.3)}, ${n(L + 1.5)} ${n(T + 3.5)}`,
    `Q ${n(L + 2.5)} ${n(T - 1.2)}, ${n(L + 22 + jitter(5))} ${n(T - 3 + jitter(1))}`,
  ].join(' ');
}

export interface RouteDash {
  d: string;
  leg: number;
  /** How far along its leg (0…1) the pen is when this dash is finished. */
  at: number;
}

/**
 * The atlas's dashed route, threading the covers in chapter order: out of
 * each cover's foot, along the gutter, into the next cover's head. Each dash
 * is its own short path, placed by arc length (a dash grid never crawls).
 */
export function routeDashes(covers: readonly ProofRect[]) {
  const dashes: RouteDash[] = [];
  const legLengths: number[] = [];
  covers.slice(0, -1).forEach((from, leg) => {
    const to = covers[leg + 1];
    const sx = Math.max(from.x + 28, Math.min(from.x + from.w - 12, to.x + to.w / 2));
    const sy = from.y + from.h + PROOF.RING + 1;
    const ex = Math.max(to.x + 12, Math.min(to.x + to.w - 12, from.x + from.w / 2));
    const ey = to.y - PROOF.RING - 1;
    const c1 = { x: sx, y: ey - 1 };
    const c2 = { x: ex, y: ey - 4 };
    const at = (t: number) => {
      const u = 1 - t;
      return {
        x: u * u * u * sx + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * ex,
        y: u * u * u * sy + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * ey,
      };
    };
    const STEPS = 240;
    const pts = [at(0)];
    const cum = [0];
    for (let i = 1; i <= STEPS; i += 1) {
      const p = at(i / STEPS);
      const q = pts[i - 1];
      pts.push(p);
      cum.push(cum[i - 1] + Math.hypot(p.x - q.x, p.y - q.y));
    }
    const length = cum[STEPS];
    const pointAt = (s: number) => {
      let i = 1;
      while (i < STEPS && cum[i] < s) i += 1;
      const span = cum[i] - cum[i - 1] || 1;
      const t = (s - cum[i - 1]) / span;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    };
    for (let s = 2; s + 3 <= length - 1; s += 8) {
      const a = pointAt(s);
      const b = pointAt(s + 3);
      dashes.push({ d: `M ${f1(a.x)} ${f1(a.y)} L ${f1(b.x)} ${f1(b.y)}`, leg, at: (s + 3) / length });
    }
    legLengths.push(length);
  });
  return { dashes, legLengths };
}

// ── The score ────────────────────────────────────────────────────────────────
// Times are ms from the trigger. The acts overlap: the stubs start dropping
// while the pull-back is still settling (1.6x → 1x), the title rises while
// the last stubs are still landing, and one pen rings the covers and then
// threads them — never reaching a frame before its ring has closed.

export const SCORE = {
  zoom: 1950,
  capOut: 200,
  /** Stubs are dealt from the top of the kept pile: the one just torn (the
   *  last chapter) first, onto the row the camera has been holding all along;
   *  the first chapter's last, as its row is the last to arrive. */
  stub0: 700,
  stubStep: 110,
  fall: 400,
  skid: 210,
  /** From a touch-down: one tick per frame, and that frame is admitted. */
  tick0: 50,
  tickStep: 21,
  light: 220,
  kicker: 950,
  figures: 1000,
  title: 1250,
  titleStep: 105,
  titleMs: 1050,
  square: 2000,
  squareMs: 380,
  links: 2150,
  ring0: 2250,
  ringStep: 115,
  ringMs: 380,
  /** The pen's even speed along the route, px per ms. */
  pen: 1.45,
  dash: 90,
  /** The pen comes no nearer than ringNear px to a cover until its ring has
   *  been closed for ringHold ms (two covers can sit a short leg apart). */
  ringHold: 40,
  ringNear: 16,
  dim: 2700,
  dimMs: 800,
  /** The nav steps out as the camera leaves (global.css, easing in) — gone
   *  before any row above the opening frame reaches the top edge — and comes
   *  back only once everything is quiet. */
  navOut: 120,
  navIn: 420,
  /** Reduced motion: values, not structure. */
  reducedRow: 60,
  reducedFade: 240,
  reducedMarks: 480,
} as const;

export interface ProofScore {
  /** Per row: when its stub starts to fall, touches down, lies loose. */
  dropAt: number[];
  touchAt: number[];
  looseAt: number[];
  /** Per row, per frame: when its tick is punched (and the frame admitted). */
  tickAt: number[][];
  lastTick: number;
  square: number;
  ringAt: number[];
  ringClose: number[];
  /** Per dash: when the pen reaches it. */
  dashAt: number[];
  routeEnd: number;
  kickerRule: number;
  kickerDone: number;
  kickerRest: number;
  dim: number;
  end: number;
}

export function proofScore(layout: ProofLayout, route: { dashes: RouteDash[]; legLengths: number[] }): ProofScore {
  const S = SCORE;
  const rows = layout.stubs.length;
  const dropAt: number[] = [];
  const touchAt: number[] = [];
  const looseAt: number[] = [];
  const tickAt: number[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const order = rows - 1 - row;
    dropAt[row] = S.stub0 + order * S.stubStep;
    touchAt[row] = dropAt[row] + S.fall;
    looseAt[row] = touchAt[row] + S.skid;
    const count = layout.frames.filter((frame) => frame.row === row).length;
    tickAt[row] = Array.from({ length: count }, (_, k) => touchAt[row] + S.tick0 + k * S.tickStep);
  }
  const lastTick = Math.max(...tickAt.flat());
  const lastTouch = Math.max(...touchAt);
  const square = Math.max(S.square, Math.max(...looseAt) + 120);
  const ring0 = Math.max(S.ring0, square + 250);
  const ringAt = Array.from({ length: rows }, (_, i) => ring0 + i * S.ringStep);
  const ringClose = ringAt.map((at) => at + S.ringMs);
  // One pen: out of each ring once it has closed, at an even speed, slowed
  // only where it would otherwise come near the next cover before its ring
  // has closed. A dash appears when the pen reaches its far end, so the
  // dashes within ringNear of the next ring are timed from that ring's
  // close, not from the leg's end.
  const dashAt: number[] = new Array(route.dashes.length).fill(0);
  let legStart = (ringClose[0] ?? ring0) + S.ringHold;
  route.legLengths.forEach((length, leg) => {
    const own = route.dashes.map((dash, index) => ({ dash, index })).filter(({ dash }) => dash.leg === leg);
    const near = own.filter(({ dash }) => (1 - dash.at) * length <= S.ringNear).map(({ dash }) => dash.at);
    const gateAt = near.length ? Math.min(...near) : own.length ? Math.max(...own.map(({ dash }) => dash.at)) : 1;
    const ringReady = (ringClose[leg + 1] ?? 0) + S.ringHold;
    const duration = Math.max(length / S.pen, (ringReady - legStart) / Math.max(0.01, gateAt));
    own.forEach(({ dash, index }) => {
      dashAt[index] = Math.ceil(legStart + dash.at * duration);
    });
    legStart += duration;
  });
  const routeEnd = route.dashes.length ? Math.max(...dashAt) + S.dash : ringClose[ringClose.length - 1];
  const dim = Math.max(S.dim, ringClose[0] + 70);
  const end = Math.max(routeEnd, dim + S.dimMs, ringClose[ringClose.length - 1], S.links + 600, S.title + 3 * S.titleStep + S.titleMs);
  return {
    dropAt, touchAt, looseAt, tickAt, lastTick, square, ringAt, ringClose, dashAt, routeEnd,
    kickerRule: lastTouch + 60,
    kickerDone: lastTouch + 140,
    kickerRest: lastTick,
    dim,
    end: Math.round(end + 40),
  };
}

/** The figures as the sum of what has landed by `ms`. */
export function proofTally(score: ProofScore, chapters: readonly ProofChapter[], ms: number) {
  const landed = chapters.filter((_, row) => score.touchAt[row] <= ms);
  let frames = 0;
  score.tickAt.forEach((ticks) => ticks.forEach((at) => { if (at <= ms) frames += 1; }));
  return {
    chapters: landed.length,
    frames,
    years: yearSpan(landed.map((chapter) => chapter.year)),
  };
}

/** Loose poses: where each stub first comes to rest, near its slot, before it is squared. */
export const LOOSE = [
  { x: 10, y: -5, r: -3.2 },
  { x: -6, y: 6, r: 2.4 },
  { x: 13, y: 3, r: -1.9 },
  { x: -9, y: -6, r: 2.9 },
  { x: 7, y: 5, r: -2.5 },
  { x: -12, y: -3, r: 2.1 },
] as const;

// ── The editor's hands ───────────────────────────────────────────────────────
// Once the sheet has settled it can be handled: an editor's loupe over the
// frames, a stub that brings its row forward, a frame that opens its story.
// Everything is hit-tested against the layout above — the pointer is turned
// into sheet coordinates once per gesture and nothing is measured per frame.

export const LOUPE = {
  /** The lens: its diameter (px) and how much it magnifies the sheet. */
  D: 180,
  ZOOM: 2.5,
  /** The follow: an exponential approach with this time constant (ms) — a
   *  short smoothing that never overshoots, not a spring that trails. */
  TAU: 34,
  /** The caption: its gap under (or over) the lens, and its line. */
  CAPTION_GAP: 12,
  CAPTION_H: 11,
  /** The nearest the lens comes to the section's edges. */
  EDGE: 8,
  /** Off every frame (a gutter, a number band) the lens waits this long
   *  before it goes, so a pass from frame to frame never blinks it. */
  GRACE: 150,
  /** Resting this long on one frame is intent: its sharper file is fetched. */
  INTENT: 70,
} as const;

/** What lies under a point of the resting sheet. */
export type ProofHit =
  | { kind: 'frame'; index: number }
  | { kind: 'stub'; row: number }
  | { kind: 'copy' }
  | null;

/** The copy block's box on the sheet (its height is set, not measured). */
export function copyBox(layout: ProofLayout, copy: { x: number; y: number; w: number; titleSize: number }): ProofRect {
  return { x: copy.x, y: copy.y, w: copy.w, h: copyHeight(copy.titleSize, layout.figureSize, layout.bounds.links) };
}

/** Hit-test a point (sheet px) against the layout's own rects. */
export function proofHit(layout: ProofLayout, copy: ProofRect | null, x: number, y: number): ProofHit {
  for (const stub of layout.stubs) {
    if (x >= stub.x && x <= stub.x + stub.w && y >= stub.y && y <= stub.y + stub.h) return { kind: 'stub', row: stub.row };
  }
  const row = Math.floor((y - layout.gridTop) / layout.pitch);
  if (row >= 0 && row < layout.stubs.length) {
    const top = layout.gridTop + row * layout.pitch;
    if (y >= top && y <= top + layout.h) {
      for (let index = 0; index < layout.frames.length; index += 1) {
        const frame = layout.frames[index];
        if (frame.row === row && x >= frame.x && x <= frame.x + frame.w) return { kind: 'frame', index };
      }
    }
  }
  const PAD = 12;
  if (copy && x >= copy.x - PAD && x <= copy.x + copy.w + PAD && y >= copy.y - PAD && y <= copy.y + copy.h + PAD) {
    return { kind: 'copy' };
  }
  return null;
}

/**
 * Where the lens sits for a pointer at (x, y): centred on it, but never in
 * the fixed nav's band (nothing moves there while the nav is shown) and never
 * past the section's edges — displaced, it still magnifies what is under the
 * pointer. The caption goes under the lens unless that would leave the section.
 */
export function loupePlace(layout: ProofLayout, x: number, y: number) {
  const R = LOUPE.D / 2;
  const cx = clamp(R + LOUPE.EDGE, x, layout.W - R - LOUPE.EDGE);
  const cy = clamp(PROOF.NAV + R, y, layout.H - R - LOUPE.EDGE);
  const below = cy + R + LOUPE.CAPTION_GAP + LOUPE.CAPTION_H <= layout.H - LOUPE.EDGE;
  return { x: cx, y: cy, below };
}

/** The file width a frame needs under the lens (Sanity `w`, bucketed). */
export function loupeWidth(frame: ProofRect, dpr: number) {
  const need = frame.w * LOUPE.ZOOM * dpr;
  return WIDTH_BUCKETS.find((bucket) => bucket >= need) ?? WIDTH_BUCKETS[WIDTH_BUCKETS.length - 1];
}
