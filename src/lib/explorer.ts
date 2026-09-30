// ── The explorer: the homepage as a map to roam ──
// Owner, 2026-09-28: 到主页的时候…我想采用自由探索的形式 — and, asked to choose,
// "地图随便逛": the homepage is the atlas itself, dragged and zoomed like 11
// mois sans toi(t)'s map, every place's shield on it. Later the same day,
// after seeing it: 地点之间的切换…不是自由的，移动的也很卡顿 … 我想要的是任意的
// 切换，切换中赋予我们现有的动效 … 地点之间的移动现在不需要撕票根动效，当你点击
// 对应的封面的时候，完整的撕开票根动画开启. So: any place to any place, at once
// (a shield anywhere on the planet, Prev / Next, the list, the arrow keys),
// and a choice made mid-turn simply turns on from where the camera is. The
// ticket in hand does not tear to move on: it stays where it lies on the
// screen while the planet turns under it and becomes the next place's ticket
// in place (src/lib/coverDock.ts, "The switch"). The one tear left is the
// admission: the cover clicked, its stub torn off whole, then the story.
// The empty map, or Escape, lets the ticket go calmly (it fades; nothing
// tears), as the reference's board goes when the globe itself is clicked.
// The wheel is the map's: it does not walk the archive chapter by chapter.
//
// This module is the explorer's rule, pure, so scripts/explorer.test.mjs can
// hold it: what each gesture does from each state, in order, and the seams
// the entrance hands over by.

import { recentreTarget } from './explorerDrift.ts';

// ── The seam ──
// The entrance in front of the explorer hands the page over once the globe
// is coming on: the boarding pass, torn, asks as the page's glide sets off
// (EntranceIntro, with `stubHandoff`: its torn stub is on its way to stop
// 01's cover — src/lib/boardingPass.ts; and `arrivingMs`: the entry rides
// under the glide), and nothing synthetic follows the ask. Anyone can ask for it:
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
  /** The entrance brings stop 01's stub itself (the torn pass's stub, flown
   *  onto the cover: "The stub hand-off" below): the cover's own stub waits,
   *  hidden, for STUB_LANDED_EVENT. */
  stubHandoff?: boolean;
  /** The entrance is still bringing the page to the explorer itself (its
   *  glide), for this many ms more: the entry starts now, under the glide —
   *  the camera begins to come down while the globe rises — and the page is
   *  not scrolled for it; the entrance is taken off once the glide has
   *  landed (EntranceIntro calls `onGlided`). Review of 2026-09-29: the
   *  click-to-cover took 7.2 s, the torn stub hanging still for 4.6 s of it,
   *  where the reference's board settles 1.6 s after its click. */
  arrivingMs?: number;
}

// ── The stub hand-off (the entrance ↔ the explorer) ──
// The torn boarding pass's stub becomes stop 01's cover stub. The explorer's
// half of the contract:
//  - asked with `stubHandoff`, it keeps stop 01's cover stub hidden (the
//    photograph shows) until the entrance dispatches STUB_LANDED_EVENT on
//    window, and shows it inside that event's dispatch — so the entrance,
//    removing its copy in the same task, never leaves a frame with both
//    stubs or with neither;
//  - `window.__archiveCoverStubTarget()` is the screen rect (viewport px)
//    where that stub will rest once the entry has landed: DERIVED from the
//    entry's final camera and the dock's plan (coverDock.ts `coverStubRect`,
//    `phoneStubRect` below), never read off a moving element. It answers as
//    soon as the entry starts (null only before the map has planned);
//  - ENTRY_LANDED_EVENT on window (detail { id }) says the camera is down on
//    stop 01.
// The entrance flies its stub along an arc onto the rect, lands it, and
// dispatches STUB_LANDED_EVENT. A stub never landed is shown anyway
// STUB_WAIT_MS after the entry lands, so no ticket is ever left without one.
export const ENTRY_LANDED_EVENT = 'archive:entry-landed';
export const STUB_LANDED_EVENT = 'archive:stub-landed';
export const STUB_WAIT_MS = 4000;
/** After the stub has landed, the ticket and the shields stay out of the
 *  hand this much longer, ms: a tap that cut the entry short (a phone's
 *  finger coming down where the cover is about to be) is never read as a
 *  tap on the cover (review of 2026-09-29: it opened the story, 4/4). */
export const ARRIVAL_INERT_MS = 250;
/** Said on window once the map is still (Mapbox's 'idle') after the entry
 *  has landed: its tiles are in. Reduced motion holds the entrance over the
 *  explorer until then (and the cover's print is decoded), and cuts once. */
export const ATLAS_IDLE_EVENT = 'archive:atlas-idle';

/** (x, y) the top-left of the UNROTATED box, in viewport px (like a DOMRect
 *  of the box before its turn); `rotate` in degrees, clockwise, about the
 *  box's centre. The entrance reads it as its StubRect (boardingPass.ts). */
export interface CoverStubTarget {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees (the cover lies square on the screen: 0). */
  rotate: number;
  /** When the entry will touch down (performance.now() ms), once it has
   *  started: the entrance times its arc to land on it, as the reference's
   *  board settles the moment its planet stops. Absent before the entry
   *  starts. */
  landsAt?: number;
}

declare global {
  interface Window {
    __archiveExplorer?: ExplorerDetail;
    __archiveExploreAsked?: ExploreRequest;
    __archiveCoverStubTarget?: () => CoverStubTarget | null;
    __archiveEntryLandsAt?: number | null;
  }
}

/** The entry's touchdown (performance.now() ms), written by whoever runs the
 *  entry's clock (HomePage on a desktop, RouteAtlas's flight on a phone) and
 *  read into the stub target (`landsAt`); null when no entry is under way. */
export function setEntryLandsAt(at: number | null) {
  if (typeof window === 'undefined') return;
  window.__archiveEntryLandsAt = at != null && Number.isFinite(at) ? at : null;
}
export function entryLandsAt(): number | null {
  if (typeof window === 'undefined') return null;
  const at = window.__archiveEntryLandsAt;
  return typeof at === 'number' && Number.isFinite(at) ? at : null;
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
  /** The place in hand: the camera is on it or turning to it. */
  current: string | null;
}

export const EXPLORER_START: ExplorerState = { phase: 'globe', current: null };

export type ExplorerAction =
  /** The entrance hands over: one calm move to stop 01 (or to the place
   *  asked for). */
  | { type: 'enter'; id?: string }
  /** The entry move is down. */
  | { type: 'entered' }
  /** A shield, a row of the list, Prev / Next, an arrow key: any place, from
   *  any place, at any moment (mid-turn too). */
  | { type: 'select'; id: string }
  /** The cover (or its rail, from the keyboard): the story. */
  | { type: 'open'; id: string }
  /** The empty map, Escape: nothing in hand. */
  | { type: 'dismiss' }
  /** The reader's own drag or zoom has taken the place in hand out of what
   *  they are looking at (src/lib/explorerDrift.ts): let it go, as a click
   *  on the empty map does (its cover fades; nothing tears). */
  | { type: 'drift' }
  /** Recentre (its control, the R key): back onto the place in hand, else
   *  the last one held (`last`, kept by the page), else stop 01 — the
   *  switch's own move, its ticket docked again. */
  | { type: 'recentre'; last?: string | null }
  /** Back to the start (the entrance's opening words). */
  | { type: 'leave' };

export type ExplorerEffect =
  /** Tear the stub off the ticket: the admission, played whole (the face
   *  stays and grows into the story). The story waits for it. */
  | { type: 'tear-stub'; id: string }
  /** The camera turns to a place (`from`: the place in hand it leaves, null
   *  from the open map): the switch. The ticket in hand stays where it lies
   *  and becomes this place's. The same place again brings the camera back
   *  onto it. */
  | { type: 'fly'; id: string; from: string | null }
  /** The entry: the globe to stop 01. */
  | { type: 'entry'; id: string | null }
  /** Let the ticket in hand go: its cover fades from the map (no tear). */
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
 * in order. Nothing tears on the way between places (a switch is one turn
 * of the planet); the cover's admission is the one tear. Nothing moves
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
      // In hand already: the camera comes back onto it (the reader may have
      // roamed off). Else the turn, from the place in hand (or the open map).
      return {
        state: action.id === state.current ? state : { ...state, current: action.id },
        effects: [{ type: 'fly', id: action.id, from: state.current }],
      };
    }
    case 'open': {
      if (state.phase !== 'explore' || action.id !== state.current) return same(state);
      return { state, effects: [{ type: 'tear-stub', id: action.id }, { type: 'story', id: action.id }] };
    }
    case 'dismiss':
    case 'drift': {
      if (state.phase !== 'explore' || !state.current) return same(state);
      return { state: { ...state, current: null }, effects: [{ type: 'release', id: state.current }] };
    }
    case 'recentre': {
      if (state.phase !== 'explore') return same(state);
      const id = recentreTarget(order, state.current, action.last ?? null);
      if (!id) return same(state);
      return {
        state: id === state.current ? state : { ...state, current: id },
        effects: [{ type: 'fly', id, from: state.current }],
      };
    }
    case 'leave': {
      if (state.phase === 'globe') return same(state);
      return { state: { phase: 'globe', current: null }, effects: [{ type: 'home' }] };
    }
    default:
      return same(state);
  }
}

// ── The phone's card ──
// On a phone the ticket does not ride beside its shield (a 190px stub and a
// photograph do not fit beside a shield on a 390px screen): it is dealt at
// the foot of the screen, over the controls, whole — the same ticket, the
// same switch, the same admission — and the camera sets its place in the
// clear band above it. DERIVED from the viewport and the photograph's own
// ratio, never measured.
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
  /** The controls' band under the card, px (global.css `.archive-dock--phone`
   *  stands the card this far up; its seat `below` further). */
  controls: 72,
  dockBottom: 76,
  /** What hangs under the plate ("Open story"), px. */
  below: 34,
  /** The state's tab on the card's top edge (its name boxed), screen px:
   *  set back to the screen's own size whatever the card's scale (global.css
   *  `.archive-dock--phone .archive-dock__tab`), so its state reads 15px. */
  tab: 30,
} as const;

export interface PhoneCard {
  photoW: number;
  photoH: number;
  /** The ticket's scale (its type stays legible: ≥ minScale). */
  scale: number;
  /** The card's height on screen with what rides on it (the state's tab)
   *  and what hangs under it, px. */
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
  return { photoW, photoH, scale, h: Math.ceil(photoH * scale + PHONE_CARD.below) + PHONE_CARD.tab };
}

/** Where the phone card's stub rests on the screen (viewport px): the card
 *  stands centred, its foot `dockBottom + below` above the screen's foot
 *  (global.css `.archive-dock--phone`; a home-indicator inset is not
 *  counted), scaled about its foot. */
export function phoneStubRect(vw: number, vh: number, ratio: number): CoverStubTarget {
  const card = phoneCard(vw, vh, ratio);
  const width = (card.photoW + PHONE_CARD.stub) * card.scale;
  const foot = vh - PHONE_CARD.dockBottom - PHONE_CARD.below;
  return {
    x: vw / 2 - width / 2 + card.photoW * card.scale,
    y: foot - card.photoH * card.scale,
    w: PHONE_CARD.stub * card.scale,
    h: card.photoH * card.scale,
    rotate: 0,
  };
}

/** Where the camera sets a place on a phone: the middle of the clear band
 *  between the nav and the card (viewport px). */
export function phoneFocalY(vh: number, cardH: number) {
  const top = 88;
  const bottom = vh - PHONE_CARD.controls - cardH - 12;
  return Math.round(Math.max(top + 40, (top + bottom) / 2));
}
