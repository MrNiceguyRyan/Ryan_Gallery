// ── The map's start-up waits for the opening film ──
// Round wf45, 2026-10-05 (the film's track measured it): on a phone the
// map's start-up — its WebGL context, its style, its shaders, its first
// tiles — ran under the opening film, about a second in: for a moment the
// whole main thread and extra GPU work, and 0–3 of the film's frames
// dropped at its hand-off in some runs. The film says when it has landed
// (OPENING_EVENT 'page', its last word also kept on
// window.__archiveOpening; html[data-opening] goes at the same moment): the
// map mounts in the first idle moment after that (HomePage's
// DeferredRouteAtlas). With no film over the page — a second view, the way
// back home, a reload deep in the page — it mounts at once, as before. It
// still has its time to load the globe: the pass cannot be torn until the
// cover has set itself and the pass has assembled, ~2.5 s after the landing.
// Never held longer than FILM_HOLD_CAP_MS (a film that never says it has
// landed).

import { OPENING_EVENT, type OpeningDetail } from './openingFilm.ts';

export const FILM_HOLD_CAP_MS = 12000;
/** Safari has no idle callback: a beat after the landing instead. */
export const FILM_AFTER_BEAT_MS = 60;
/** An idle moment comes within this long after the landing, or the map
 *  mounts anyway. */
export const FILM_IDLE_TIMEOUT_MS = 300;

/** Whether the opening film still covers the page (its head script marked
 *  html[data-opening]; it has not handed the page over). */
export function filmOverPage(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  const reel = root.dataset.reel;
  if (reel === 'skip' || reel === 'page' || root.dataset.home === 'explorer') return false;
  if (typeof window !== 'undefined' && window.__archiveOpening?.state === 'page') return false;
  return root.hasAttribute('data-opening');
}

/** Run `then` once no film covers the page: at once if none does, else in
 *  the first idle moment after the film has landed. Returns a cancel. */
export function afterFilm(then: () => void): () => void {
  if (!filmOverPage()) {
    then();
    return () => {};
  }
  let over = false;
  let idle = 0;
  let timer = 0;
  const stop = () => {
    window.removeEventListener(OPENING_EVENT, onOpening);
    window.clearTimeout(timer);
    if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
  };
  const run = () => {
    if (over) return;
    over = true;
    stop();
    then();
  };
  function onOpening(event: Event) {
    if ((event as CustomEvent<OpeningDetail>).detail?.state !== 'page') return;
    window.removeEventListener(OPENING_EVENT, onOpening);
    window.clearTimeout(timer);
    if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(run, { timeout: FILM_IDLE_TIMEOUT_MS });
    else timer = window.setTimeout(run, FILM_AFTER_BEAT_MS);
  }
  window.addEventListener(OPENING_EVENT, onOpening);
  timer = window.setTimeout(run, FILM_HOLD_CAP_MS);
  return () => {
    over = true;
    stop();
  };
}
