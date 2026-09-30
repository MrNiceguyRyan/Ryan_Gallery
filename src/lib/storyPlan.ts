// ── The story as a weekly feature: its pages, planned from the photographs ──
// A Collection Story is laid out the way a weekly lays out a feature: an
// opening spread (the place's map page printed on the chapter's ticket stock
// beside the photograph the reader opened, at its own ratio), then inside
// pages on paper with an edited ladder of frame sizes — a frame the height of
// the screen, a pair, a small frame hung beside the text, a pull quote,
// Part II — and an end page on the stock again. Two photographs are never
// joined: a pair always has its gutter between them (the owner, 2026-09-28:
// collection story里面不要出现两张照片拼接在一起 — the touching diptych is gone,
// and the screen-high moment it made is a single page now).
//
// A story the owner has split into sub-chapters (src/lib/storyChapters.ts) is
// planned chapter by chapter: the introduction as one band, then per chapter
// an opener beside its first frame and its frames by the same templates
// (planChapters; scripts/story-chapters.test.mjs).
//
// Everything here is pure, so the server can print the final layout: the
// planner decides which template each frame goes into from the frames' ratios
// alone, and the geometry writes every box twice from one formula — as CSS
// calc() on the story's grid tokens (--sM, --sG, --sC, 100vw, 100svh), which
// /works sends in its HTML so nothing moves on hydration, and in pixels for a
// given window, which the plate's grow aims at and the tests read.
// scripts/story-plan.test.mjs holds the two to each other and pins today's
// six sequences.

/** The running head's height on desktop. */
export const STORY_HEAD = 44;
/** Room under an in-flow frame for its caption: every frame and its caption
 *  fit on one screen under the running head. */
export const CAPTION_ROOM = 40;

export interface StoryPhotoLike {
  imageUrl: string;
  width?: number;
  height?: number;
}

const ASSET_HASH = /[0-9a-f]{40}/;
const FILE_DIMS = /-(\d+)x(\d+)\.[a-z0-9]+(?:$|\?)/i;

/** A photograph's width / height: its Sanity dimensions, else the size in its
 *  file name, else 3:2. */
export function frameRatio(photo: StoryPhotoLike): number {
  if (photo.width && photo.height) return photo.width / photo.height;
  const match = FILE_DIMS.exec(photo.imageUrl ?? '');
  if (match && Number(match[1]) > 0 && Number(match[2]) > 0) return Number(match[1]) / Number(match[2]);
  return 1.5;
}

export const isLandscape = (ratio: number) => ratio > 1;

/**
 * The story's frames in reading order. Frame 01 is the photograph the reader
 * opened the story from: the chapter's cover, found among the photographs by
 * its 40-hex asset hash (as the closing's proof sheet finds it). The rest keep
 * Sanity's order. With no cover to match, the old rule stands: the first
 * landscape leads. The grid, the lightbox and the kept stub all read this one
 * array, so their numbers agree.
 */
export function storyFrames<T extends StoryPhotoLike>(photos: readonly T[] | null | undefined, coverImageUrl?: string | null): T[] {
  const source = photos ? [...photos] : [];
  if (source.length < 2) return source;
  const hash = coverImageUrl ? ASSET_HASH.exec(coverImageUrl)?.[0] : undefined;
  let at = hash ? source.findIndex((photo) => ASSET_HASH.exec(photo.imageUrl ?? '')?.[0] === hash) : -1;
  if (at < 0) at = source.findIndex((photo) => photo.width != null && photo.height != null && photo.width > photo.height);
  if (at <= 0) return source;
  const [lead] = source.splice(at, 1);
  return [lead, ...source];
}

// ── The plan ──

export type SlotKind =
  | 'OPEN' // frame 01 on the opening spread
  | 'LEDE' // paragraph 1, a small frame hung at the right edge
  | 'LEDE2' // a short story: paragraphs 1 and 2 side by side, a column frame under them (none in a story of two)
  | 'SCREEN' // a landscape the height of the screen, flush left over the rail
  | 'FEATURE' // a landscape across eight columns
  | 'PAIR' // two frames at one height, a gutter between them
  | 'PAGE' // one portrait the height of the screen
  | 'COLUMN'
  | 'SMALL'
  | 'QUOTE' // the pull quote's page
  | 'PART' // "II", paragraph 2 and a column frame
  | 'CHAPTER' // a sub-chapter's opener (number, title, intro) and its first frame
  | 'END'; // the end page, on the stock

export interface Slot {
  kind: SlotKind;
  /** 0-based indices into the story's frames. */
  frames: number[];
  /** For the templates set to one side: 1 right, -1 left, alternating. */
  side?: 1 | -1;
  /** A CHAPTER's section, as an index into the story's sections. */
  section?: number;
  /** A CHAPTER that opens the frames no part holds ("More frames"). */
  more?: true;
}

/** A sub-chapter's frames in the story's reading order: [start, start +
 *  count) (src/lib/storyChapters.ts groups them). `no` null: the group of
 *  frames no part holds, which opens with a shorter pause. */
export interface PlanSection {
  start: number;
  count: number;
  no?: number | null;
}

const SIDED: ReadonlySet<SlotKind> = new Set(['FEATURE', 'PAIR', 'COLUMN', 'SMALL']);

/**
 * Which template each frame goes into. Frame 01 opens; frame 02 is hung
 * beside the lede; then, per frame, the first template in its orientation's
 * order of preference that is not one of the last two used (no A-B-A-B
 * metronome), else the first that is not the last one:
 *   landscape: SCREEN (at most one per seven frames, from frame 3, five
 *              frames apart), FEATURE, PAIR, COLUMN, SMALL;
 *   portrait:  PAGE at the head of a run of portraits (this frame and the
 *              next both portraits, five frames from the last page), then
 *              PAIR, PAGE, COLUMN, SMALL.
 * The head of a run is where the touching diptych stood: its screen-high
 * moment goes to the first portrait alone, and the next is planned as any
 * other frame. No template joins two photographs; a pair keeps its gutter.
 * Part II takes the frame at 0.66 of the story (never before frame 4, and no
 * pair ever swallows it); the pull quote follows the slot that reaches frame
 * 0.4n, in stories of six or more with a quote to print, and never directly
 * before Part II.
 *
 * A story in sub-chapters (`sections`, src/lib/storyChapters.ts) is planned
 * by chapter instead (planChapters); every other story exactly as before.
 */
export function planStory(
  ratios: readonly number[],
  { hasQuote = false, sections }: { hasQuote?: boolean; sections?: readonly PlanSection[] | null } = {},
): Slot[] {
  const n = ratios.length;
  if (sections && sections.length > 0 && wholeSections(sections, n)) return planChapters(ratios, hasQuote, sections);
  const slots: Slot[] = [];
  if (n > 0) slots.push({ kind: 'OPEN', frames: [0] });
  // The text always runs: a one-frame story still has its band, frameless.
  // A two-frame story's band goes frameless too, and its one inside frame
  // closes the story as a page of its own, centred and the height of the
  // screen: hung as a column under the band, it sat at the far edge with a
  // page of empty paper beside it and nothing else on screen (New York).
  if (n === 2) slots.push({ kind: 'LEDE2', frames: [] }, { kind: 'PAGE', frames: [1] });
  else if (n >= 2) slots.push({ kind: n >= 4 ? 'LEDE' : 'LEDE2', frames: [1] });
  else slots.push({ kind: 'LEDE2', frames: [] });
  // Frame numbers here are 1-based, as the reader counts them.
  const quoteAt = n >= 6 && hasQuote ? Math.round(0.4 * n) : null;
  const partAt = n >= 4 ? Math.min(n, Math.max(4, Math.round(0.66 * n))) : null;
  const state = pickState(n, ['OPEN', 'LEDE']);
  let quoted = false;
  let index = Math.min(n, 2);
  while (index < n) {
    const no = index + 1;
    if (partAt !== null && no === partAt) {
      slots.push({ kind: 'PART', frames: [index] });
      state.history.push('PART');
      index += 1;
    } else {
      const nextOk = index + 1 < n && !(partAt !== null && no + 1 === partAt);
      const slot = pickTemplate(ratios, index, nextOk, state);
      slots.push(slot);
      index += slot.frames.length;
    }
    // `index` frames are placed. The quote comes before Part II with a
    // picture between them: never straight before it, never after it (a
    // story too short to fit it there goes without).
    if (quoteAt !== null && !quoted && index >= quoteAt && index < n
      && !state.history.includes('PART') && !(partAt !== null && index + 1 === partAt)) {
      slots.push({ kind: 'QUOTE', frames: [] });
      state.history.push('QUOTE');
      quoted = true;
    }
  }
  slots.push({ kind: 'END', frames: [] });
  return setSides(slots);
}

/**
 * A story in sub-chapters. Frame 01 opens as always; the story's own words
 * follow as a band (paragraphs 1 and 2 side by side, frameless: the lede's
 * hung frame would be a chapter's picture set before its chapter opened, and
 * Part II's place is taken by the chapters themselves). Then each chapter:
 * its opener (number, title, intro) with its first frame hung beside it, as
 * Part II's words hang beside theirs, and the rest of its frames by the same
 * templates as any story — the metronome rule, the screens and the pages run
 * on across chapters, and a pair never straddles two. The pull quote follows
 * the slot that reaches frame 0.4n while a picture of the same chapter is
 * still to come, so it is never set straight before an opener or the end
 * page; a story with nowhere to put it goes without.
 */
function planChapters(ratios: readonly number[], hasQuote: boolean, sections: readonly PlanSection[]): Slot[] {
  const n = ratios.length;
  const slots: Slot[] = [{ kind: 'OPEN', frames: [0] }, { kind: 'LEDE2', frames: [] }];
  const quoteAt = n >= 6 && hasQuote ? Math.round(0.4 * n) : null;
  const state = pickState(n, ['OPEN', 'LEDE2']);
  let quoted = false;
  sections.forEach((section, at) => {
    const end = section.start + section.count;
    slots.push({ kind: 'CHAPTER', frames: [section.start], section: at, ...(section.no === null ? { more: true as const } : null) });
    state.history.push('CHAPTER');
    let index = section.start + 1;
    while (index < end) {
      const slot = pickTemplate(ratios, index, index + 1 < end, state);
      slots.push(slot);
      index += slot.frames.length;
      if (quoteAt !== null && !quoted && index >= quoteAt && index < end) {
        slots.push({ kind: 'QUOTE', frames: [] });
        state.history.push('QUOTE');
        quoted = true;
      }
    }
  });
  slots.push({ kind: 'END', frames: [] });
  return setSides(slots);
}

/** What the template picker carries through a story: the screens and pages
 *  it has used, and the templates so far (no A-B-A-B metronome). */
interface PickState {
  maxScreens: number;
  screens: number;
  lastScreen: number;
  lastPage: number;
  history: SlotKind[];
}

const pickState = (n: number, history: SlotKind[]): PickState => ({
  maxScreens: Math.max(1, Math.floor(n / 7)),
  screens: 0,
  lastScreen: -99,
  lastPage: -99,
  history,
});

/** The template for the frame at `index` (0-based; see planStory), which
 *  takes the next frame too when it is a pair. `nextOk`: the next frame may
 *  join this one. */
function pickTemplate(ratios: readonly number[], index: number, nextOk: boolean, state: PickState): Slot {
  const no = index + 1;
  const landscape = (at: number) => isLandscape(ratios[at]);
  const candidates: SlotKind[] = [];
  if (landscape(index)) {
    if (state.screens < state.maxScreens && no >= 3 && no - state.lastScreen >= 5) candidates.push('SCREEN');
    candidates.push('FEATURE');
    if (nextOk) candidates.push('PAIR');
    candidates.push('COLUMN', 'SMALL');
  } else {
    // The head of a run of portraits, where the diptych stood.
    if (nextOk && !landscape(index + 1) && no - state.lastPage >= 5) candidates.push('PAGE');
    if (nextOk) candidates.push('PAIR');
    candidates.push('PAGE', 'COLUMN', 'SMALL');
  }
  const recent = state.history.slice(-2);
  const pick = candidates.find((kind) => !recent.includes(kind))
    ?? candidates.find((kind) => kind !== state.history[state.history.length - 1])
    ?? candidates[0];
  if (pick === 'SCREEN') { state.screens += 1; state.lastScreen = no; }
  if (pick === 'PAGE') state.lastPage = no;
  state.history.push(pick);
  return { kind: pick, frames: pick === 'PAIR' ? [index, index + 1] : [index] };
}

function setSides(slots: Slot[]): Slot[] {
  let side: 1 | -1 = 1;
  for (const slot of slots) {
    if (!SIDED.has(slot.kind)) continue;
    slot.side = side;
    side = side === 1 ? -1 : 1;
  }
  return slots;
}

/** Whether `sections` hold frames 2..n once each, in order, with no gap:
 *  the only shape a chapter plan is made from (groupChapters makes it). */
function wholeSections(sections: readonly PlanSection[], n: number): boolean {
  let next = 1;
  for (const section of sections) {
    if (section.start !== next || !(section.count >= 1)) return false;
    next += section.count;
  }
  return next === n;
}

/** The frames per slot in reading order, as the kept stub reads them. */
export const slotRows = (slots: readonly Slot[]) => slots.filter((slot) => slot.frames.length > 0).map((slot) => slot.frames);

// ── Geometry ──
// One formula, two outputs: `v` is the value in pixels for a given window,
// `c` the same expression in CSS on the story's grid tokens. Only lengths are
// ever multiplied or divided, and only by plain numbers, so every `c` is a
// valid calc().

export interface Q {
  readonly v: number;
  readonly c: string;
}

const fmt = (value: number) => String(Math.round(value * 1e6) / 1e6);
const px = (value: number): Q => ({ v: value, c: `${fmt(value)}px` });
const add = (...parts: Q[]): Q => ({ v: parts.reduce((sum, part) => sum + part.v, 0), c: `(${parts.map((part) => part.c).join(' + ')})` });
const sub = (a: Q, b: Q): Q => ({ v: a.v - b.v, c: `(${a.c} - ${b.c})` });
const times = (a: Q, k: number): Q => (k === 1 ? a : { v: a.v * k, c: `(${a.c} * ${fmt(k)})` });
const over = (a: Q, k: number): Q => (k === 1 ? a : { v: a.v / k, c: `(${a.c} / ${fmt(k)})` });
const least = (...parts: Q[]): Q => ({ v: Math.min(...parts.map((part) => part.v)), c: `min(${parts.map((part) => part.c).join(', ')})` });
const most = (...parts: Q[]): Q => ({ v: Math.max(...parts.map((part) => part.v)), c: `max(${parts.map((part) => part.c).join(', ')})` });
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** A length as a CSS value (always a calc(), so it can sit in a custom
 *  property and be used anywhere a length can). */
export const css = (q: Q) => `calc(${q.c})`;

/** The story's desktop grid for a window: 12 columns across the whole
 *  window, no container cap. The CSS copies of M, G and C are the tokens
 *  --sM, --sG and --sC on the story (global.css), written the same way. */
export function storyGrid(W: number, H: number) {
  const vw: Q = { v: W, c: '100vw' };
  const vh: Q = { v: H, c: '100svh' };
  const vhShare = (share: number): Q => ({ v: H * share, c: `${fmt(share * 100)}svh` });
  const vwShare = (share: number): Q => ({ v: W * share, c: `${fmt(share * 100)}vw` });
  const M: Q = { v: clamp(W * 0.0278, 16, 48), c: 'var(--sM)' };
  const G: Q = { v: clamp(W * 0.0139, 12, 24), c: 'var(--sG)' };
  const C: Q = { v: (W - 2 * M.v - 11 * G.v) / 12, c: 'var(--sC)' };
  /** Left edge of column k (1-based). */
  const colX = (k: number): Q => (k === 1 ? M : add(M, times(add(C, G), k - 1)));
  /** Width of n columns and the gutters between them. */
  const cols = (count: number): Q => (count === 1 ? C : add(times(C, count), times(G, count - 1)));
  /** Right edge of column k. */
  const colEnd = (k: number): Q => add(colX(k), C);
  return {
    W,
    H,
    vw,
    vh,
    vhShare,
    vwShare,
    M,
    G,
    C,
    colX,
    cols,
    colEnd,
    /** The tallest an in-flow frame may be: the screen under the running
     *  head, less its caption's room. */
    Hmax: sub(vh, px(STORY_HEAD + CAPTION_ROOM)),
    /** Where the frames live: columns 4–12. Columns 1–3 are the rail, the
     *  kept stub's. */
    fieldX: colX(4),
    field: cols(9),
    fieldEnd: colEnd(12),
    rail: cols(3),
    /** Between slots: a tenth of the screen (it was 0.14, 140px at 1000;
     *  the owner asked for the photographs a little closer together). */
    gap: most(px(68), vhShare(0.1)),
    /** Between the two frames of a pair (was 0.045 of the width). */
    pairGap: most(px(36), vwShare(0.034)),
  };
}

export type StoryGrid = ReturnType<typeof storyGrid>;

/** Frame 01 on the opening spread. A landscape sits flush top and right, from
 *  just left of column 6 to the window's edge (no taller than 0.72 of the
 *  screen, which leaves paper under it for its caption, the dek and the
 *  credits); a portrait stands the full height, flush right. The map page is
 *  everything to its left. Both keep the file's ratio. */
export function openerBox(grid: StoryGrid, ratio: number) {
  const mapMin = sub(grid.colX(6), over(grid.G, 2));
  const room = sub(grid.vw, mapMin);
  const w = isLandscape(ratio) ? least(room, times(grid.vh, 0.72 * ratio)) : least(times(grid.vh, ratio), room);
  const x = sub(grid.vw, w);
  return { x, w, h: over(w, ratio) };
}

/** Where frame 01 lands, in window pixels: the rectangle a plate (or the Next
 *  card) grows into. `mapW` is the map page's width. */
export function openerRect(W: number, H: number, ratio: number) {
  const box = openerBox(storyGrid(W, H), ratio);
  return { x: box.x.v, y: 0, width: box.w.v, height: box.h.v, mapW: box.x.v };
}

export interface FrameBox {
  frame: number;
  /** From the window's left edge. */
  x: Q;
  w: Q;
  h: Q;
  /** Down from the slot's top edge (the paper's own flow). */
  y: Q;
}

export interface TextBox {
  role: 'lede' | 'band1' | 'band2' | 'part' | 'chapter' | 'quote';
  x: Q;
  w: Q;
  y: Q;
  /** A height the words fill (a part's opener beside a portrait: its title
   *  and intro stand at the foot, level with the photograph's). */
  h?: Q;
}

export interface SlotBoxes {
  slot: Slot;
  frames: FrameBox[];
  text: TextBox[];
  /** Space above the slot. */
  top: Q;
}

const ZERO = px(0);

/** Every slot's boxes on desktop (≥1024). Frame heights are the frame's
 *  width over its ratio, so every box is the file's shape. */
export function storyBoxes(slots: readonly Slot[], ratios: readonly number[], W: number, H: number): SlotBoxes[] {
  const g = storyGrid(W, H);
  return slots.map((slot) => {
    const r = slot.frames.map((index) => ratios[index]);
    const frame = (index: number, x: Q, w: Q, y: Q = ZERO): FrameBox => ({ frame: slot.frames[index], x, w, h: over(w, r[index]), y });
    const right = (w: Q) => sub(g.fieldEnd, w);
    const capped = (w: Q, ratio: number) => least(w, times(g.Hmax, ratio));
    switch (slot.kind) {
      case 'OPEN': {
        const box = openerBox(g, r[0]);
        return { slot, frames: [frame(0, box.x, box.w)], text: [], top: ZERO };
      }
      case 'LEDE': {
        const w = capped(g.cols(isLandscape(r[0]) ? 3 : 2), r[0]);
        return {
          slot,
          frames: [frame(0, right(w), w, g.vhShare(0.11))],
          text: [{ role: 'lede', x: g.colX(4), w: g.cols(5), y: ZERO }],
          top: g.vhShare(0.14),
        };
      }
      case 'LEDE2': {
        // The frame sits under the band (its own row, `gap` below it).
        const w = capped(g.cols(isLandscape(r[0]) ? 5 : 4), r[0]);
        return {
          slot,
          frames: r.length ? [frame(0, right(w), w, g.gap)] : [],
          text: [
            { role: 'band1', x: g.colX(4), w: g.cols(4), y: ZERO },
            { role: 'band2', x: g.colX(9), w: g.cols(4), y: ZERO },
          ],
          top: g.vhShare(0.14),
        };
      }
      case 'SCREEN': {
        const w = least(g.vw, times(g.Hmax, r[0]));
        return { slot, frames: [frame(0, ZERO, w)], text: [], top: g.gap };
      }
      case 'FEATURE': {
        const w = capped(g.cols(8), r[0]);
        return { slot, frames: [frame(0, slot.side === -1 ? g.fieldX : right(w), w)], text: [], top: g.gap };
      }
      case 'PAIR': {
        const portraits = !isLandscape(r[0]) && !isLandscape(r[1]);
        const room = portraits ? g.cols(7) : g.field;
        const h = least(over(sub(room, g.pairGap), r[0] + r[1]), g.vhShare(0.86), g.Hmax);
        const w0 = times(h, r[0]);
        const w1 = times(h, r[1]);
        const total = add(times(h, r[0] + r[1]), g.pairGap);
        const x = portraits
          ? (slot.side === -1 ? g.fieldX : sub(g.fieldEnd, total))
          : add(g.fieldX, over(sub(g.field, total), 2));
        return { slot, frames: [frame(0, x, w0), frame(1, add(x, w0, g.pairGap), w1)], text: [], top: g.gap };
      }
      case 'PAGE': {
        const w = least(times(g.Hmax, r[0]), g.field);
        return { slot, frames: [frame(0, add(g.fieldX, over(sub(g.field, w), 2)), w)], text: [], top: g.gap };
      }
      case 'COLUMN': {
        const w = capped(g.cols(isLandscape(r[0]) ? 5 : 4), r[0]);
        return { slot, frames: [frame(0, slot.side === -1 ? g.colX(5) : right(w), w)], text: [], top: g.gap };
      }
      case 'SMALL': {
        const w = capped(g.cols(isLandscape(r[0]) ? 3 : 2), r[0]);
        return { slot, frames: [frame(0, slot.side === -1 ? g.fieldX : right(w), w)], text: [], top: g.gap };
      }
      case 'PART': {
        const w = r.length ? capped(g.cols(isLandscape(r[0]) ? 5 : 4), r[0]) : ZERO;
        return {
          slot,
          frames: r.length ? [frame(0, right(w), w)] : [],
          text: [{ role: 'part', x: g.colX(4), w: g.cols(4), y: px(40) }],
          top: add(g.gap, px(28)),
        };
      }
      case 'CHAPTER': {
        // The opener's words in columns 4–7 and the part's first frame hung
        // at the right edge beside them, as Part II's. A part is a real
        // pause, 2.4 gaps above it (240px at 1000 high, against 100 between
        // slots); the frames no part holds follow a shorter one, a gap and a
        // half, so the remainder stays quieter than the parts. Beside a
        // portrait the words are as tall as the frame, so the title and intro
        // can stand at its foot (global.css) instead of leaving a column of
        // blank paper under a title set at the top.
        const w = capped(g.cols(isLandscape(r[0]) ? 5 : 4), r[0]);
        return {
          slot,
          frames: [frame(0, right(w), w)],
          text: [{
            role: 'chapter',
            x: g.colX(4),
            w: g.cols(4),
            y: ZERO,
            ...(isLandscape(r[0]) ? null : { h: over(w, r[0]) }),
          }],
          top: slot.more ? add(g.gap, over(g.gap, 2)) : times(g.gap, 2.4),
        };
      }
      case 'QUOTE':
        return { slot, frames: [], text: [{ role: 'quote', x: g.colX(5), w: g.cols(8), y: ZERO }], top: g.gap };
      case 'END':
      default:
        return { slot, frames: [], text: [], top: g.gap };
    }
  });
}

// ── Captions and facts ──

const pad2 = (value: number) => String(value).padStart(2, '0');

/**
 * A slot's caption: its frame numbers, keyed ("05, 06"), and the frame's own
 * place only where it is not the story's (New York: "01 Midtown"). `places`
 * holds that place per frame, '' where it is the story's. Never uppercase,
 * never a machine title; the exposure stays in the lightbox.
 */
export function slotCaption(frames: readonly number[], places: readonly string[]): Array<{ no: string; place: string }> {
  const shared = frames.every((index) => (places[index] ?? '') === (places[frames[0]] ?? ''));
  if (shared) return [{ no: frames.map((index) => pad2(index + 1)).join(', '), place: places[frames[0]] ?? '' }];
  return frames.map((index) => ({ no: pad2(index + 1), place: places[index] ?? '' }));
}

const BRANDS: Record<string, string> = {
  FUJIFILM: 'Fujifilm',
  NIKON: 'Nikon',
  CANON: 'Canon',
  SONY: 'Sony',
  LEICA: 'Leica',
  RICOH: 'Ricoh',
  OLYMPUS: 'Olympus',
  PANASONIC: 'Panasonic',
  APPLE: 'Apple',
  HASSELBLAD: 'Hasselblad',
};

/**
 * A camera as a credit prints it, from what the file's EXIF says:
 * "FUJIFILM X-T50" → "Fujifilm X-T50"; "NIKON CORPORATION NIKON Z f" and
 * "Nikon Zf" → "Nikon Z f". The brand once, in its own case; the model as
 * written, with Nikon's "Zf" spaced the way Nikon prints it.
 */
export function cameraName(raw: string | null | undefined): string {
  const words = String(raw ?? '').replace(/\bCORPORATION\b|\bCO\.,? LTD\.?|\bIMAGING\b/gi, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const brandKey = words[0].toUpperCase();
  const brand = BRANDS[brandKey] ?? words[0];
  const model = words.slice(1).filter((word, index) => !(index === 0 && word.toUpperCase() === brandKey));
  let modelText = model.join(' ');
  if (brand === 'Nikon') modelText = modelText.replace(/^Z\s*f$/i, 'Z f').replace(/^Zf\b/i, 'Z f');
  return [brand, modelText].filter(Boolean).join(' ');
}

/** The camera most of a story's frames were made on. */
export function storyCamera(cameras: ReadonlyArray<string | null | undefined>): string {
  const counts = new Map<string, number>();
  for (const raw of cameras) {
    const name = cameraName(raw);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best = '';
  let most = 0;
  for (const [name, count] of counts) if (count > most) { best = name; most = count; }
  return best;
}

/** "25.76° N, 80.19° W". */
export function formatPosition(lat: number | null | undefined, lng: number | null | undefined): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  const part = (value: number, positive: string, negative: string) => `${Math.abs(value).toFixed(2)}° ${value >= 0 ? positive : negative}`;
  return `${part(lat as number, 'N', 'S')}, ${part(lng as number, 'E', 'W')}`;
}

/** The same in Chinese, hemisphere first: "北纬 25.76°，西经 80.19°". */
export function formatPositionZh(lat: number | null | undefined, lng: number | null | undefined): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  const part = (value: number, positive: string, negative: string) => `${value >= 0 ? positive : negative} ${Math.abs(value).toFixed(2)}°`;
  return `${part(lat as number, '北纬', '南纬')}，${part(lng as number, '东经', '西经')}`;
}
