// ── The opening film on a second view, and the way back to the globe ──
// The film (src/components/home/OpeningFilm.tsx) plays once a session. A
// later homepage load in the same tab — back from /about or a story, the
// wordmark from another page, the browser's back button — skips it; a RELOAD
// plays it again (the owner reviews by reloading), and so does a new tab (its
// sessionStorage is its own).
//
// Where such a later load opens (owner, 2026-09-30: 从其他地区回到home的时候，
// 直接回到地球处，不需要再一次撕开机票了): once the reader has torn the boarding
// pass in this tab's session (PASS_TORN_KEY, set by the tear), straight on
// the explorer — the globe, the place last in hand with its cover up
// (EXPLORER_PLACE_KEY, kept by HomePage), else nothing in hand — under a
// short veil that lifts once the map is still with its tiles in: no film, no
// pass, no tear, no descent (`homeOpening`: data-home="explorer" on <html>).
// Before the tear it opens on the first screen (the entrance's opening words
// and the pass, EntranceIntro). A reload plays the film, so it opens on the
// entrance and a new pass: the journey from the start (the owner's way to
// review it; the film lands its words on the entrance). A new tab: its first
// view, as ever.
//
// The decision is made before the first paint and written on <html>:
// data-reel="skip" (no film), or data-reel="reel" with data-opening (the
// film plays; CSS shows its fixed layer and holds the first screen's
// entrance under it) — by index.astro's head script on a full load, and by
// Layout's ClientRouter listener (astro:before-swap, on the incoming
// document) on an in-site arrival. OpeningFilm and HomePage read it at mount.
//
// The film lies OVER the page (a fixed layer) and takes no room on it, so a
// saved scroll position means the same place with or without it. Only a
// position saved under the old scroll-pinned reel (history entries that
// carry `reelOffset`) is moved back by that offset, once. A full load that
// would restore a position below the first screen (a reload deep in the
// archive) skips the film: the reader keeps his place.
//
// Everything here is pure; the inline scripts are built from these very
// functions (their source text), so scripts/reel-visit.test.mjs holds the
// shipped decision to account.

export const REEL_SEEN_KEY = 'rx:reel-seen';
/** The boarding pass has been torn in this tab's session. */
export const PASS_TORN_KEY = 'rx:pass-torn';
/** The explorer's place in hand as the reader left it ('' for none). */
export const EXPLORER_PLACE_KEY = 'rx:explorer-place';

export type ReelPlan = 'play' | 'skip';

/** Play or skip the film. `seen`: the flag in sessionStorage (the film has
 *  been on screen in this tab's session). `navigation`: the full load's
 *  PerformanceNavigationTiming type ('navigate' | 'reload' | 'back_forward' |
 *  'prerender'), or a ClientRouter arrival's navigationType ('push' |
 *  'replace' | 'traverse'). `firstEntry`: the tab's history holds only this
 *  page (a new tab, even one that was handed its opener's session). */
export function reelPlan(seen: boolean, navigation: string, firstEntry: boolean): ReelPlan {
  if (!seen) return 'play';
  if (navigation === 'reload') return 'play';
  if (navigation === 'back_forward' || navigation === 'traverse') return 'skip';
  if (navigation === 'navigate' || navigation === 'push' || navigation === 'replace') return firstEntry ? 'play' : 'skip';
  return 'play';
}

/** A history entry's scroll, as this page lays out now: an entry saved under
 *  the old scroll-pinned reel had the reel's length above the first screen. */
export function restoredScroll(scrollY: number, reelOffset: unknown): number {
  var offset = typeof reelOffset === 'number' && reelOffset > 0 ? reelOffset : 0;
  return Math.max(0, Math.round(scrollY - offset));
}

/** A restored position this far down (a share of the viewport) is a reader
 *  going back into the archive, not an arrival: no film. */
export const DEEP_RESTORE = 0.5;

export type HomeOpening = 'entrance' | 'explorer';

/** Where a homepage load opens: on the entrance (the opening words and the
 *  pass) or straight on the explorer — only when the film does not play and
 *  the pass has been torn in this session. */
export function homeOpening(plan: ReelPlan, torn: boolean): HomeOpening {
  return plan === 'skip' && torn ? 'explorer' : 'entrance';
}

/** The place to restore: the one kept, if it is still one of the explorer's
 *  (`order`), else none. */
export function restoredPlace(kept: string | null | undefined, order: readonly string[]): string | null {
  return kept && order.includes(kept) ? kept : null;
}

/** The pass is torn (the reader is on the way to the globe). */
export function markPassTorn() {
  try {
    sessionStorage.setItem(PASS_TORN_KEY, '1');
  } catch {
    // Storage denied: a later visit opens on the entrance again.
  }
}

/** Keep the explorer's place in hand (null: nothing in hand). */
export function keepExplorerPlace(id: string | null) {
  try {
    sessionStorage.setItem(EXPLORER_PLACE_KEY, id ?? '');
  } catch {
    // Storage denied: the explorer comes back with nothing in hand.
  }
}

/** The place kept for this session, raw (null: none). */
export function keptExplorerPlace(): string | null {
  try {
    return sessionStorage.getItem(EXPLORER_PLACE_KEY) || null;
  } catch {
    return null;
  }
}

/** Mark the film as seen for this tab's session. */
export function markReelSeen() {
  try {
    sessionStorage.setItem(REEL_SEEN_KEY, '1');
  } catch {
    // Storage denied (a private window may): the film simply plays again.
  }
}

const source = () =>
  `var REEL_SEEN_KEY=${JSON.stringify(REEL_SEEN_KEY)};` +
  `var PASS_TORN_KEY=${JSON.stringify(PASS_TORN_KEY)};` +
  `var DEEP_RESTORE=${DEEP_RESTORE};` +
  `var reelPlan=${reelPlan.toString()};` +
  `var homeOpening=${homeOpening.toString()};` +
  `var restoredScroll=${restoredScroll.toString()};`;

/** index.astro's <head> script: on a full load, decide before the first
 *  paint. (Astro's router restores history.state.scrollY as its module runs,
 *  after this: an old entry's position is corrected here first.) An in-site
 *  arrival runs it again after the swap, by then decided: it steps aside. */
export function reelHeadScript() {
  return (
    '(function(){' +
    source() +
    'var root=document.documentElement;' +
    "if(document.readyState!=='loading')return;" +
    "var nav='navigate';" +
    "try{var entry=performance.getEntriesByType('navigation')[0];if(entry&&entry.type)nav=entry.type;}catch(e){}" +
    'var seen=false;' +
    "try{seen=sessionStorage.getItem(REEL_SEEN_KEY)==='1';}catch(e){}" +
    'var plan=reelPlan(seen,nav,history.length<=1);' +
    'try{var st=history.state;' +
    "if(st&&typeof st.scrollY==='number'){" +
    'var y=restoredScroll(st.scrollY,st.reelOffset);' +
    "if(y!==st.scrollY||typeof st.reelOffset==='number'){var next=Object.assign({},st,{scrollY:y});delete next.reelOffset;history.replaceState(next,'');}" +
    "if(plan==='play'&&y>innerHeight*DEEP_RESTORE)plan='skip';" +
    '}}catch(e){}' +
    "root.setAttribute('data-reel',plan==='skip'?'skip':'reel');" +
    "if(plan==='play')root.setAttribute('data-opening','');" +
    'var torn=false;' +
    "try{torn=sessionStorage.getItem(PASS_TORN_KEY)==='1';}catch(e){}" +
    "if(homeOpening(plan,torn)==='explorer')root.setAttribute('data-home','explorer');" +
    '})();'
  );
}

/** Layout's script (every page): on an in-site arrival at the homepage,
 *  decide on the incoming document before it is swapped in. */
export function reelRouterScript() {
  return (
    '(function(){' +
    source() +
    'function path(v){try{return new URL(v,location.origin).pathname;}catch(e){return location.pathname;}}' +
    "document.addEventListener('astro:before-swap',function(e){" +
    "if(!e||!e.newDocument||path(e.to)!=='/')return;" +
    'var seen=false;' +
    "try{seen=sessionStorage.getItem(REEL_SEEN_KEY)==='1';}catch(err){}" +
    'var plan=reelPlan(seen,e.navigationType,false);' +
    'var el=e.newDocument.documentElement;' +
    "el.setAttribute('data-reel',plan==='skip'?'skip':'reel');" +
    "if(plan==='play')el.setAttribute('data-opening','');" +
    'var torn=false;' +
    "try{torn=sessionStorage.getItem(PASS_TORN_KEY)==='1';}catch(err){}" +
    "if(homeOpening(plan,torn)==='explorer')el.setAttribute('data-home','explorer');" +
    '});' +
    '})();'
  );
}
