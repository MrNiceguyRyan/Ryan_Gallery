// ── The viewport's size, read once per resize, never per frame ──
// Owner, 2026-10-05 (手机端的使用很不流畅，电脑端也一般般). `window.innerWidth`,
// `innerHeight` and `document.documentElement.clientWidth` look like plain
// numbers, but each one brings the page's style (and often its layout) up to
// date before it answers. Read inside a frame loop — where the frame before
// has just written a transform, so the styles are always dirty — every read
// is a whole style recalculation of the page, on the main thread, in the
// middle of an animation. Traced on the built homepage (390 × 844 at 3×,
// CPU ×4): the torn stub's courier asked stop 01's stub rect every frame
// (21 recalculations, 56 ms, in its 1.5 s flight), the boarding pass's drag
// re-read the screen's bounds every tick (187 recalculations), the reader's
// map re-read the view on every move of a drag (39 in a pan and a pinch),
// and a switch read the width at the click. None of those numbers changes
// between two resizes, so they are read here once, lazily, after each
// resize, and every frame loop asks this module instead.
//
// The listener is added when this module is first imported (before any
// component that imports it mounts), so it runs before theirs on a resize:
// a component's own resize handler that asks for the size is never handed
// the size from before the resize.

export interface Viewport {
  /** window.innerWidth */
  w: number;
  /** window.innerHeight */
  h: number;
  /** document.documentElement.clientWidth (the width less a classic
   *  scrollbar; the homepage has none), else innerWidth. */
  cw: number;
}

let cached: Viewport | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    cached = null;
  }, { passive: true });
}

/** The viewport's size as of the last resize (read now if it has not been
 *  read since). Never call it to SEE a layout change: it only follows the
 *  window's size. */
export function viewport(): Viewport {
  if (cached) return cached;
  if (typeof window === 'undefined') return { w: 0, h: 0, cw: 0 };
  const w = window.innerWidth;
  const h = window.innerHeight;
  cached = { w, h, cw: document.documentElement.clientWidth || w };
  return cached;
}
