// ── The opening reel on a second view ──
// The film plays once a session. A later homepage load in the same tab — back
// from /about or a story, the wordmark from another page, the browser's back
// button — opens straight on the first screen, as the page did before the
// reel existed; a RELOAD plays it again (the owner reviews by reloading), and
// so does a new tab (its sessionStorage is its own).
//
// The decision is made before the first paint and written on
// <html data-reel="skip">, where CSS collapses the reel's pinned block (the
// server's markup is the same either way): by index.astro's head script on a
// full load, and by Layout's ClientRouter listener (astro:before-swap, on the
// incoming document) on an in-site arrival. IntroReel and HomePage read the
// attribute at mount.
//
// Scroll positions saved on the homepage (Astro's history state, Layout's
// "home-filmstrip-scroll") are kept with the reel's offset at the time — the
// distance from the top of the document to the first screen, the film's
// pinned length when it plays and 0 when it is skipped — so a position saved
// with the film is restored to the same place on the page without it, and
// the other way round.
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

/** A saved homepage scroll position, carried into the layout that is about to
 *  show. `savedY` was saved when the reel's offset was `savedOffset`; it is
 *  `offsetNow` now. A reload that plays the film on the first screen starts
 *  the film from its cover (`restart`: the saved position is at most `near`
 *  under the first screen); a position inside the film lands inside it again,
 *  or on the first screen when there is no film. */
export function reelScroll(savedY: number, savedOffset: number, offsetNow: number, restart: boolean, near: number): number {
  var page = savedY - savedOffset;
  if (restart && page <= near) return 0;
  if (page < 0) return offsetNow > 0 ? Math.max(0, Math.min(savedY, offsetNow)) : 0;
  return Math.round(page + offsetNow);
}

/** The reel's offset in the live document: the distance from the top of the
 *  document to the first screen (the reel's height less the viewport it
 *  overlaps), 0 without a reel or when it is collapsed. */
export function reelOffsetIn(doc: Document): number {
  var reel = doc.querySelector('.intro-reel') as HTMLElement | null;
  if (!reel || !reel.offsetHeight) return 0;
  var margin = parseFloat(getComputedStyle(reel).marginBottom) || 0;
  return Math.max(0, Math.round(reel.offsetHeight + margin));
}

/** Mark the film as seen for this tab's session. */
export function markReelSeen() {
  try {
    sessionStorage.setItem(REEL_SEEN_KEY, '1');
  } catch {
    // Storage denied (a private window may): the film simply plays again.
  }
}

/** Record the reel's offset on the current history entry (Astro keeps the
 *  entry's scroll there; every later write spreads the state, so it stays). */
export function recordReelOffset(offset: number) {
  try {
    const state = history.state;
    if (!state || typeof state !== 'object' || state.reelOffset === offset) return;
    history.replaceState({ ...state, reelOffset: offset }, '');
  } catch {
    // (A sandboxed frame may refuse; positions then restore as saved.)
  }
}

const source = () =>
  `var REEL_SEEN_KEY=${JSON.stringify(REEL_SEEN_KEY)};` +
  `var reelPlan=${reelPlan.toString()};` +
  `var reelScroll=${reelScroll.toString()};` +
  `var reelOffsetIn=${reelOffsetIn.toString()};`;

export interface ReelHeadConstants {
  desktopScreens: number;
  phoneScreens: number;
  phoneMaxWidth: number;
}

/** index.astro's <head> script: on a full load, decide before the first
 *  paint, and carry a restored scroll position (Astro's router restores
 *  history.state.scrollY as its module runs, after this) into the layout
 *  about to show — the film's length estimated from the viewport, as CSS
 *  will size it. (An in-site arrival runs it again after the swap, by then
 *  decided: it steps aside.) */
export function reelHeadScript(c: ReelHeadConstants) {
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
    "root.setAttribute('data-reel',plan==='skip'?'skip':'reel');" +
    'try{var st=history.state;' +
    "if(st&&typeof st.scrollY==='number'&&typeof st.reelOffset==='number'){" +
    "var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;" +
    `var screens=reduce?1:innerWidth<=${c.phoneMaxWidth}?${c.phoneScreens}:${c.desktopScreens};` +
    "var now=plan==='skip'?0:Math.round(screens*innerHeight);" +
    "var y=reelScroll(st.scrollY,st.reelOffset,now,nav==='reload'&&plan==='play',innerHeight*0.5);" +
    "if(y!==st.scrollY||now!==st.reelOffset)history.replaceState(Object.assign({},st,{scrollY:y,reelOffset:now}),'');" +
    '}}catch(e){}' +
    '})();'
  );
}

/** Layout's script (every page): on an in-site arrival at the homepage,
 *  decide on the incoming document before it is swapped in, and on a
 *  traversal carry the entry's scroll into the layout now showing. Exposes
 *  window.__reelVisit for Layout's own homepage scroll keeping. */
export function reelRouterScript() {
  return (
    '(function(){' +
    source() +
    'function path(v){try{return new URL(v,location.origin).pathname;}catch(e){return location.pathname;}}' +
    'window.__reelVisit={offset:function(){return reelOffsetIn(document);},scroll:reelScroll};' +
    "document.addEventListener('astro:before-swap',function(e){" +
    "if(!e||!e.newDocument||path(e.to)!=='/')return;" +
    'var seen=false;' +
    "try{seen=sessionStorage.getItem(REEL_SEEN_KEY)==='1';}catch(err){}" +
    'var plan=reelPlan(seen,e.navigationType,false);' +
    "e.newDocument.documentElement.setAttribute('data-reel',plan==='skip'?'skip':'reel');" +
    '});' +
    "document.addEventListener('astro:after-swap',function(){" +
    "if(location.pathname!=='/')return;" +
    'try{var st=history.state;' +
    "if(!st||typeof st.scrollY!=='number'||typeof st.reelOffset!=='number')return;" +
    'var now=reelOffsetIn(document);' +
    'var y=reelScroll(st.scrollY,st.reelOffset,now,false,0);' +
    "if(Math.abs(y-scrollY)>1)scrollTo({top:y,behavior:'instant'});" +
    "history.replaceState(Object.assign({},st,{scrollY:y,reelOffset:now}),'');" +
    '}catch(err){}' +
    '});' +
    '})();'
  );
}
