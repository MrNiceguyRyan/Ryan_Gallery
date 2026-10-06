import { useLayoutEffect, type RefObject } from 'react';
import { scroll, useMotionValue, type MotionValue, type UseScrollOptions } from 'framer-motion';

// ── A section's passage through the page's scroll, only when it is used ──
// framer-motion's `useScroll({ target })` always tracks: on every scroll of the
// page it measures its target (an `offsetTop` / `offsetLeft` walk up the tree,
// `scrollHeight`, `clientWidth`), and the first read in a frame brings the
// page's style and layout up to date. The homepage's covers and its contact
// sheet each held one from their old scroll-driven pages, though neither
// reads it any more (a docked cover rides the map; the sheet sits in the
// places panel) — and the entrance's glide scrolls the window every frame for
// a second: seven trackers measured in each of those frames (31 forced style
// passes in the glide, traced 2026-10-05 on a phone). This is the same
// progress (`scrollYProgress`), tracked only when `enabled`; otherwise it
// rests at 0 and nothing listens.

export function useSectionScroll(
  target: RefObject<HTMLElement | null>,
  offset: UseScrollOptions['offset'],
  enabled: boolean,
): MotionValue<number> {
  const progress = useMotionValue(0);
  const key = JSON.stringify(offset ?? null);
  useLayoutEffect(() => {
    const element = target.current;
    if (!enabled || !element) return;
    return scroll((_progress: number, info: { y: { progress: number } }) => {
      progress.set(info.y.progress);
    }, { target: element, ...(offset ? { offset } : null) });
    // `offset` is compared by its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, progress, target]);
  return progress;
}
