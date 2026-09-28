// ── The ticket latch: when a homepage cover tears, and when it comes back ──
// Every desktop cover is a ticket (ArchiveChapter, "The tear"). Going on past
// a chapter tears its face off; coming back puts it back. This module is the
// rule for both, kept pure so scripts/ticket-latch.test.mjs can hold it to
// the atlas it has to agree with.
//
// All positions are a chapter's `delta` on the homepage timeline: 0 when its
// photograph's centre sits on the reading line, 1 when the next chapter's
// does, negative before it.
//
// The rule has two halves that must never disagree with the map:
// - Forward, a cover tears past its own line (derived per cover, see
//   `deriveTearLine`) once the reader has seen it whole and pushes on (see
//   "The gate"), and always by TEAR_HARD_LINE, before the atlas commits to
//   the next place at ATLAS_LEAVE_LINE. RouteAtlas then holds the flight until
//   the face is free.
// - Back, a torn cover re-seats where the atlas turns for home
//   (ATLAS_HOME_LINE), so the face rises on the very frame the camera sets off
//   back to its place — or, if the reader never went that far, once they have
//   stepped TEAR_HYSTERESIS back from the furthest point reached. It never
//   waits below 0, so chapter 0 (whose delta cannot go negative) always comes
//   back. And at rest (TEAR_REST_MS, played by ArchiveChapter) the face comes
//   back to a reader who stopped below the tear line, or who turned round
//   before the atlas left and stopped short of its home line.

/** Where the atlas commits to the next place: RouteAtlas's HOP.forward,
 *  mirrored (RouteAtlas is a lazy chunk). Change the two together. */
export const ATLAS_LEAVE_LINE = 0.32;
/** Where the atlas turns for home: 1 − RouteAtlas's HOP.back, written as the
 *  same expression so the float is identical to the one it compares. */
export const ATLAS_HOME_LINE = 1 - 0.78;

// The tear line is each cover's own: the point on the timeline where this
// photograph's TOP edge reaches TEAR_TOP_VH of the viewport, so the owner's
// beat — the top-left corner going down first — happens on screen while a
// reader's wheel carries the page on (ArchiveChapter, "The tear"). Most
// covers reach it at their centre already, so the line has a floor:
// TEAR_LINE_MIN past centre (25–35px of scroll), so a reader resting on the
// chapter does not tear it. It never passes TEAR_LINE_MAX, which must stay
// below ATLAS_HOME_LINE (and so below ATLAS_LEAVE_LINE).
export const TEAR_TOP_VH = 0.25;
export const TEAR_LINE_MIN = 0.03;
export const TEAR_LINE_MAX = 0.2;
/** How far back from the furthest point reached a torn ticket re-seats when
 *  the atlas never left its place. Also the fling guard: a small reversal
 *  (a trackpad's wobble, a Lenis overshoot) never re-seats a ticket. */
export const TEAR_HYSTERESIS = 0.1;
/** A ticket that re-seats at or past its tear line (the reader came back to
 *  the atlas's home line) tears again only this much further on — never on
 *  the next forward frame. ATLAS_HOME_LINE + TEAR_REARM stays below
 *  ATLAS_LEAVE_LINE, so the tear still comes before the flight. */
export const TEAR_REARM = 0.08;
/** At rest this long (no timeline change), a torn ticket the reader has come
 *  back to is put back (see `reseatsAtRest`). */
export const TEAR_REST_MS = 200;
/** How far back from the furthest point reached counts as turning round, at
 *  rest: ~20px of a 1000px chapter — more than a trackpad's wobble, less
 *  than any deliberate step back. */
export const TEAR_REST_TURN = 0.02;

// ── The gate: seen whole first, then torn by the reader's own push ──
// The owner's words: 有点太早了, 有时候没看见就撕下去了. With the line alone
// (about 30px past a cover's centre) a trackpad swipe that coasted a ticket in
// tore it inside its own glide, before the atlas had even landed. So past the
// line a ticket tears only when one of these holds (ArchiveChapter samples it
// on every change of the timeline, never at rest):
// - HARD: at TEAR_HARD_LINE, always — the atlas's commit must never find it
//   whole.
// - SEEN + PUSH: it has been on screen whole (TEAR_SEEN_SHARE) with the map
//   landed for TEAR_SEEN_MS, and the reader then pushes on at least
//   TEAR_PUSH_PX.
// - CORNER: the map has landed, the reader pushes on and the top edge (the
//   corner the owner watches drop) is about to leave the screen: a tall
//   portrait, read straight through. (Before the landing a push is still the
//   swipe that brought the plate in.)
// A push is a NEW movement: at least TEAR_PUSH_SPEED px/s over the last
// TEAR_PUSH_WINDOW_MS, and not decaying below TEAR_COAST of its speed
// TEAR_COAST_FROM_MS–TEAR_COAST_TO_MS earlier — a Lenis glide or a
// trackpad's momentum decays; a hand does not. The two windows sit ~300ms
// apart so a tau-650 glide has fallen to ~0.65 of its speed between them:
// measured on the page (whole-pixel scroll, Lenis's own smoothing, frame
// jitter) its tail never reads above 0.77, where the old 185ms spacing and
// 0.8 flickered over the line (0.83–0.94) and tore tickets in the glide's
// crawl, half a second after the map landed, with no push at all. A steady
// hand reads ~1.
export const TEAR_SEEN_MS = 450;
export const TEAR_SEEN_SHARE = 0.9;
export const TEAR_PUSH_SPEED = 200;
export const TEAR_COAST = 0.9;
export const TEAR_PUSH_WINDOW_MS = 70;
export const TEAR_COAST_FROM_MS = 250;
export const TEAR_COAST_TO_MS = 350;
export const TEAR_PUSH_PX = 10;
/** The HARD line: the tear the atlas's commit (ATLAS_LEAVE_LINE) must never
 *  find undone, a hair before it (~2px: both read the same timeline, but
 *  never the same float, where the order in which the two hear the scroll is
 *  not fixed). A glide that runs long past TEAR_LINE_MAX keeps the cover
 *  whole until the reader's own push or this line, so the tear and the
 *  flight come as one event — a glide that stops between the two leaves a
 *  torn stub over a map that stayed (at 0.01 that band was 8–10px wide and
 *  a long swipe found it). */
export const TEAR_HARD_LINE = ATLAS_LEAVE_LINE - 0.002;
/** The corner line: where this plate's top edge reaches this share of the
 *  viewport. */
export const TEAR_CORNER_VH = 0.05;

/** What the latch knows about the reader when a ticket is whole past its
 *  line (see "The gate"). */
export interface TearGate {
  /** Seen whole with the map landed, and pushed on since. */
  seen: boolean;
  /** The reader is pushing on right now. */
  pushing: boolean;
  /** This cover's corner line (`deriveCornerLine`); Infinity until the map
   *  has landed. */
  corner: number;
}

/** One sample of the reader's hand: ms, and px along the timeline. */
export interface PushSample {
  t: number;
  px: number;
}

export interface LatchState {
  /** The face is off, or on its way off. */
  torn: boolean;
  /** The furthest delta reached since the ticket tore (−∞ while whole). */
  peak: number;
  /** While whole: the delta the next tear waits for after a re-seat above the
   *  tear line (−∞ when there is nothing to wait for). */
  rearm: number;
}

export const LATCH_WHOLE: LatchState = { torn: false, peak: -Infinity, rearm: -Infinity };

/**
 * The tear line of one cover, from the geometry the homepage timeline is
 * built from (untransformed offsets, never a rect): the viewport height, the
 * photograph's height, the line its centre crosses at a whole chapter, and
 * the distance in px between its centre and the next chapter's anchor.
 */
export function deriveTearLine(viewport: number, height: number, readingLine: number, span: number) {
  if (!(span > 0) || !(viewport > 0)) return TEAR_LINE_MAX;
  const line = (readingLine * viewport - height / 2 - TEAR_TOP_VH * viewport) / span;
  return Math.max(TEAR_LINE_MIN, Math.min(TEAR_LINE_MAX, line));
}

/**
 * The corner line of one cover (see "The gate"): the point on the timeline
 * where this photograph's top edge reaches TEAR_CORNER_VH of the viewport,
 * never before its tear line and never past TEAR_LINE_MAX. A portrait reaches
 * it just past its line; a landscape only at the ceiling.
 */
export function deriveCornerLine(viewport: number, height: number, readingLine: number, span: number, line: number) {
  const floor = Math.max(line, TEAR_LINE_MIN);
  if (!(span > 0) || !(viewport > 0)) return TEAR_LINE_MAX;
  const corner = (readingLine * viewport - height / 2 - TEAR_CORNER_VH * viewport) / span;
  return Math.max(floor, Math.min(TEAR_LINE_MAX, corner));
}

/**
 * The share of a plate on screen at `delta`, derived from the same geometry
 * as the lines (never a rect): its centre sits on the reading line at 0, and
 * the page has moved `delta` of the span to the next anchor since (or of the
 * span from the previous one, before it).
 */
export function plateShare(delta: number, viewport: number, height: number, readingLine: number, span: number, prevSpan: number) {
  if (!(height > 0) || !(viewport > 0)) return 0;
  const top = readingLine * viewport - height / 2 - delta * (delta >= 0 ? span : prevSpan);
  const shown = Math.min(viewport, top + height) - Math.max(0, top);
  return Math.max(0, Math.min(1, shown / height));
}

/** The travel (px) and speed (px/s) from the first to the last sample aged
 *  between `from` and `to` ms; 0 with fewer than two. */
function travelOver(samples: readonly PushSample[], now: number, from: number, to: number) {
  let first: PushSample | null = null;
  let last: PushSample | null = null;
  for (const sample of samples) {
    const age = now - sample.t;
    if (age < from || age > to) continue;
    if (!first) first = sample;
    last = sample;
  }
  if (!first || !last || !(last.t > first.t)) return { px: 0, speed: 0 };
  return { px: last.px - first.px, speed: ((last.px - first.px) / (last.t - first.t)) * 1000 };
}

/** A gap between samples this long means the page stood still in between. */
export const TEAR_REST_GAP_MS = 50;
const FRAME_MS = 1000 / 60;

/**
 * Adds a sample of the timeline to the ring (at most TEAR_COAST_TO_MS of it).
 * After a rest the page stood where the last sample left it until a frame
 * ago, so that is written in first: the first frame of a push already has a
 * speed, instead of waiting two more frames to be told the page moved.
 */
export function addPushSample(samples: PushSample[], t: number, px: number) {
  const last = samples[samples.length - 1];
  if (last && t - last.t > TEAR_REST_GAP_MS) samples.push({ t: t - FRAME_MS, px: last.px });
  samples.push({ t, px });
  while (samples.length > 2 && t - samples[0].t > TEAR_COAST_TO_MS) samples.shift();
  return samples;
}

/** Whether the reader is pushing on (see "The gate"), from the recent
 *  samples of the timeline, and how far the push has carried the page in
 *  its window (`travel`, px). */
export function pushState(samples: readonly PushSample[], now: number) {
  const recent = travelOver(samples, now, 0, TEAR_PUSH_WINDOW_MS);
  const vNow = recent.speed;
  const vPrev = travelOver(samples, now, TEAR_COAST_FROM_MS, TEAR_COAST_TO_MS).speed;
  const pushing = vNow >= TEAR_PUSH_SPEED && !(vPrev > 0 && vNow < TEAR_COAST * vPrev);
  return { vNow, vPrev, pushing, travel: pushing ? recent.px : 0 };
}

/** The travel pushed on since the ticket was seen, after one more sample:
 *  the step just taken while pushing — and at least the push's own window,
 *  which is what told us it is a push (it is the reader's hand, not the
 *  glide, so it counts from its first frame). */
export function pushedAfter(pushed: number, push: { pushing: boolean; travel: number }, step: number) {
  if (!push.pushing) return pushed;
  return Math.max(pushed + Math.max(0, step), push.travel);
}

/** When the atlas landed, from `html[data-atlas-landed-at]` (RouteAtlas):
 *  missing is long ago (a page with no atlas never blocks a tear), 'flying'
 *  is not yet. */
export function readLandedAt(value: string | undefined) {
  if (value == null || value === '') return 0;
  if (value === 'flying') return Number.POSITIVE_INFINITY;
  const at = Number(value);
  return Number.isFinite(at) ? at : 0;
}

/**
 * The seen clock after a sample at `now`: the time since the last sample
 * (`prevT`) counts — from the landing, if that came later — when at that
 * sample the plate was on screen whole (TEAR_SEEN_SHARE, or as whole as a
 * plate taller than the viewport can be). A cover has no entrance of its own
 * (it is simply there, whole, wherever it is on screen), so on screen whole
 * is seen. A reader at rest samples nothing, so their first move carries the
 * whole rest.
 */
export function accrueSeen(
  seen: number,
  prevT: number,
  now: number,
  landedAt: number,
  prevShare: number,
  height: number,
  viewport: number,
) {
  const whole = Math.min(TEAR_SEEN_SHARE, height > 0 ? (viewport - 24) / height : TEAR_SEEN_SHARE);
  if (prevShare < whole) return seen;
  return seen + Math.max(0, now - Math.max(prevT, landedAt));
}

/** Where a torn ticket whose furthest point was `peak` re-seats. */
export function reseatLine(peak: number) {
  return Math.max(0, Math.min(ATLAS_HOME_LINE, peak - TEAR_HYSTERESIS));
}

/**
 * One step of the latch: the state after the timeline reads `delta`, for a
 * cover whose tear line is `line`. With a `gate` a whole ticket past its line
 * tears only as "The gate" says; without one (reduced motion, a jump shown as
 * it is) it tears on the line. Returns the same object when nothing changed,
 * so a caller can store it on every call.
 */
export function stepLatch(state: LatchState, delta: number, line: number, gate?: TearGate): LatchState {
  if (state.torn) {
    const peak = Math.max(state.peak, delta);
    if (delta > reseatLine(peak)) {
      return peak === state.peak ? state : { torn: true, peak, rearm: -Infinity };
    }
    return { torn: false, peak: -Infinity, rearm: delta >= line ? delta + TEAR_REARM : -Infinity };
  }
  // Back below the line, the reader has come back to the chapter: the next
  // tear is an ordinary one again.
  const rearm = delta < line ? -Infinity : state.rearm;
  const open = !gate || delta >= TEAR_HARD_LINE || (gate.pushing && (gate.seen || delta >= gate.corner));
  if (delta >= Math.max(line, rearm) && open) return { torn: true, peak: delta, rearm: -Infinity };
  return rearm === state.rearm ? state : { torn: false, peak: -Infinity, rearm };
}

/**
 * The rest re-seat's question: does a torn ticket at rest at `delta` go back?
 * Yes below its tear line — the reader stopped on the chapter, not past it.
 * And yes at or below the atlas's home line once the reader has turned round
 * (TEAR_REST_TURN back from the furthest point): with the tear starting just
 * past a chapter's centre, a reader who reverses mid-tear, or while the
 * flight waits, stops well inside that band, and the camera never left. A
 * reader still going forward who merely pauses is never turned back, so a
 * notched wheel's pauses cannot tear, re-seat and tear again.
 */
export function reseatsAtRest(state: LatchState, delta: number, line: number) {
  if (!state.torn) return false;
  return delta < line || (delta <= ATLAS_HOME_LINE && state.peak - delta >= TEAR_REST_TURN);
}
