// ── The opening film on a second view ──
// The film (src/components/home/OpeningFilm.tsx) plays once a session. A
// later homepage load in the same tab — back from /about or a story, the
// wordmark from another page, the browser's back button — opens straight on
// the first screen (the entrance's opening words, EntranceIntro — the globe
// comes later, once the boarding pass is torn); a RELOAD plays it again (the
// owner reviews by reloading), and so does a new tab (its sessionStorage is
// its own).
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
  `var DEEP_RESTORE=${DEEP_RESTORE};` +
  `var reelPlan=${reelPlan.toString()};` +
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
    '});' +
    '})();'
  );
}
