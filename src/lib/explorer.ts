// ── The explorer: the homepage as a map to roam ──
// Owner, 2026-09-28: 到主页的时候…我想采用自由探索的形式，点开封面或者其他地方，
// 产生撕掉票根特效 — and, asked to choose, "地图随便逛": the homepage is the
// atlas itself, dragged and zoomed like 11 mois sans toi(t)'s map, every
// place's shield on it. A shield takes the reader there (the ticket in hand
// tears first); the cover at a shield opens its story (its stub tears off —
// the admission); the empty map, or Escape, tears the ticket away and leaves
// the reader roaming with nothing in hand. The wheel is the map's: it no
// longer walks the archive chapter by chapter.
//
// This module is the explorer's rule, pure, so scripts/explorer.test.mjs can
// hold it: what each gesture does from each state, in order — a tear always
// comes before the move it opens — and the seam the entrance hands over by.

// ── The seam ──
// The entrance in front of the explorer hands the page over once the globe
// is on screen: the boarding pass, torn, asks as the page's glide lands with
// the globe risen (HomePage, `onEntranceArrived`), and nothing synthetic
// follows the ask. Anyone can ask for it:
//   import { requestExplore } from '../lib/explorer';
//   requestExplore();            // or: window.dispatchEvent(new CustomEvent('archive:explore'))
// The homepage answers by taking the page to the explorer (if it is not
// there yet), then the camera in one calm move to stop 01 (the first place
// by route order) and handing the map to the reader. It says
// where it is on window (`archive:explorer`, detail { phase, current }), and
// keeps the last word on `window.__archiveExplorer` for anyone who listens
// late. Asked before the map can move, the request waits for it.
export const EXPLORE_EVENT = 'archive:explore';
export const EXPLORER_EVENT = 'archive:explorer';

export type ExplorerPhase = 'globe' | 'entering' | 'explore';

export interface ExplorerDetail {
  phase: ExplorerPhase;
  /** The place in hand (its cover shows once the camera is down on it). */
  current: string | null;
}

export interface ExploreRequest {
  /** Who asked (for the record only: 'boarding-pass', …). */
  from?: string;
}

declare global {
  interface Window {
    __archiveExplorer?: ExplorerDetail;
    __archiveExploreAsked?: ExploreRequest;
  }
}

/** Ask the homepage to enter the explorer (see "The seam"). Safe to call
 *  before the homepage has mounted: the ask is kept on window. */
export function requestExplore(request: ExploreRequest = {}) {
  if (typeof window === 'undefined') return;
  window.__archiveExploreAsked = request;
  window.dispatchEvent(new CustomEvent<ExploreRequest>(EXPLORE_EVENT, { detail: request }));
}

/** Tell the page where the explorer is (HomePage calls this). */
export function announceExplorer(detail: ExplorerDetail) {
  if (typeof window === 'undefined') return;
  window.__archiveExplorer = detail;
  window.dispatchEvent(new CustomEvent<ExplorerDetail>(EXPLORER_EVENT, { detail }));
}

// ── The rule ──
export interface ExplorerState {
  phase: ExplorerPhase;
  /** The place in hand: the camera is on it or flying to it. */
  current: string | null;
}

export const EXPLORER_START: ExplorerState = { phase: 'globe', current: null };

export type ExplorerAction =
  /** The entrance hands over: one calm move to stop 01 (or to the place
   *  asked for). */
  | { type: 'enter'; id?: string }
  /** The entry move is down. */
  | { type: 'entered' }
  /** A shield, a row of the list, Prev / Next. */
  | { type: 'select'; id: string }
  /** The cover (or its rail, from the keyboard): the story. */
  | { type: 'open'; id: string }
  /** The empty map, Escape: nothing in hand. */
  | { type: 'dismiss' }
  /** Back to the start (the entrance's opening words). */
  | { type: 'leave' };

export type ExplorerEffect =
  /** Tear the ticket in hand: the face comes off (ArchiveChapter's tear);
   *  what follows waits for the face to be free. */
  | { type: 'tear'; id: string }
  /** Tear the stub off the ticket: the admission (the face stays whole and
   *  grows into the story). What follows waits for the stub to be free. */
  | { type: 'tear-stub'; id: string }
  /** The camera goes to a place (`from`: the place it leaves, null from the
   *  open map). The same place again brings the camera back onto it. */
  | { type: 'fly'; id: string; from: string | null }
  /** The entry: the globe to stop 01. */
  | { type: 'entry'; id: string | null }
  /** Let the ticket in hand go: its cover (torn) leaves the map. */
  | { type: 'release'; id: string }
  | { type: 'story'; id: string }
  /** Back to the start: the opening words again, and the camera back on
   *  the globe the next tear will bring up. */
  | { type: 'home' };

export interface ExplorerStep {
  state: ExplorerState;
  effects: ExplorerEffect[];
}

/** The first place by route order (the explorer's entry): the order the
 *  homepage reads its places in (src/lib/chapterOrder.ts). */
export function stopOne(order: readonly string[]): string | null {
  return order[0] ?? null;
}

/** The place `step` stops on from `id` along the route, wrapping round (the
 *  last's next is the first). From nothing in hand, Next is stop 01 and Prev
 *  the last. */
export function neighbour(order: readonly string[], id: string | null, step: 1 | -1): string | null {
  if (!order.length) return null;
  const index = id ? order.indexOf(id) : -1;
  if (index < 0) return step > 0 ? order[0] : order[order.length - 1];
  return order[(index + step + order.length) % order.length];
}

const same = (state: ExplorerState): ExplorerStep => ({ state, effects: [] });

/**
 * What `action` does from `state`: the next state and the effects to play,
 * in order. A move always tears the ticket in hand first; nothing moves
 * before the explorer has been entered.
 */
export function explore(state: ExplorerState, action: ExplorerAction, order: readonly string[]): ExplorerStep {
  switch (action.type) {
    case 'enter': {
      if (state.phase !== 'globe') return same(state);
      const first = action.id && order.includes(action.id) ? action.id : stopOne(order);
      return { state: { phase: 'entering', current: first }, effects: [{ type: 'entry', id: first }] };
    }
    case 'entered':
      return state.phase === 'entering' ? same({ ...state, phase: 'explore' }) : same(state);
    case 'select': {
      if (state.phase !== 'explore' || !order.includes(action.id)) return same(state);
      if (action.id === state.current) {
        // In hand already: the camera comes back onto it (the reader may have
        // roamed off), nothing tears.
        return { state, effects: [{ type: 'fly', id: action.id, from: action.id }] };
      }
      const effects: ExplorerEffect[] = [];
      if (state.current) effects.push({ type: 'tear', id: state.current });
      effects.push({ type: 'fly', id: action.id, from: state.current });
      return { state: { ...state, current: action.id }, effects };
    }
    case 'open': {
      if (state.phase !== 'explore' || action.id !== state.current) return same(state);
      return { state, effects: [{ type: 'tear-stub', id: action.id }, { type: 'story', id: action.id }] };
    }
    case 'dismiss': {
      if (state.phase !== 'explore' || !state.current) return same(state);
      return {
        state: { ...state, current: null },
        effects: [{ type: 'tear', id: state.current }, { type: 'release', id: state.current }],
      };
    }
    case 'leave': {
      if (state.phase === 'globe') return same(state);
      const effects: ExplorerEffect[] = [];
      if (state.phase === 'explore' && state.current) effects.push({ type: 'tear', id: state.current });
      effects.push({ type: 'home' });
      return { state: { phase: 'globe', current: null }, effects };
    }
    default:
      return same(state);
  }
}

// ── The phone's card ──
// On a phone the ticket does not ride beside its shield (a 190px stub and a
// photograph do not fit beside a shield on a 390px screen): it is dealt at
// the foot of the screen, over the controls, whole — the same ticket, the
// same tear — and the camera sets its place in the clear band above it.
// DERIVED from the viewport and the photograph's own ratio, never measured.
export const PHONE_CARD = {
  /** The stub's fixed measure (ArchiveChapter TICKET_STUB). */
  stub: 190,
  /** The side gutter. */
  gutter: 16,
  /** The photograph's height: this share of the screen, never more than
   *  `maxH` px… */
  shareH: 0.3,
  maxH: 300,
  /** …and the whole ticket scaled down no further than this to fit across
   *  (a smaller photograph instead). */
  minScale: 0.72,
  /** The controls' band under the card, px. */
  controls: 72,
  /** What hangs under the plate ("Open story"), px. */
  below: 34,
} as const;

export interface PhoneCard {
  photoW: number;
  photoH: number;
  /** The ticket's scale (its type stays legible: ≥ minScale). */
  scale: number;
  /** The card's height on screen with what hangs under it, px. */
  h: number;
}

/** The phone card's size for a photograph of `ratio` on a `vw` × `vh` screen. */
export function phoneCard(vw: number, vh: number, ratio: number): PhoneCard {
  const across = Math.max(160, vw - 2 * PHONE_CARD.gutter);
  const r = Math.min(2.4, Math.max(0.45, ratio || 1.5));
  let photoH = Math.min(PHONE_CARD.maxH, Math.round(vh * PHONE_CARD.shareH));
  let scale = Math.min(1, across / (photoH * r + PHONE_CARD.stub));
  if (scale < PHONE_CARD.minScale) {
    scale = PHONE_CARD.minScale;
    photoH = Math.max(80, Math.floor((across / scale - PHONE_CARD.stub) / r));
  }
  const photoW = Math.floor(photoH * r);
  return { photoW, photoH, scale, h: Math.ceil(photoH * scale + PHONE_CARD.below) };
}

/** Where the camera sets a place on a phone: the middle of the clear band
 *  between the nav and the card (viewport px). */
export function phoneFocalY(vh: number, cardH: number) {
  const top = 88;
  const bottom = vh - PHONE_CARD.controls - cardH - 12;
  return Math.round(Math.max(top + 40, (top + bottom) / 2));
}
