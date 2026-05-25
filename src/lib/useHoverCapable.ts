import { useEffect, useState } from 'react';

/**
 * Returns true when the user's primary input device supports actual hover
 * (mouse / trackpad), false on coarse-pointer touchscreen-only devices.
 *
 * Used to gate hover-based visual effects — e.g. the "dim every other photo"
 * effect in MagazineLayout — that don't translate well to touch:
 *   - on touch, a tap briefly fires onHoverStart/onHoverEnd, causing the
 *     dim/blur to flash before the lightbox opens (visual jitter)
 *   - touch users can't sustain a hover, so they can never appreciate the
 *     dim-the-rest effect anyway
 *
 * Server render: defaults to `true` (assume hover) so the first paint
 * matches the most common desktop visit; the effect then resolves to its
 * real value on hydration. This avoids a flash of dimmed-out UI on
 * desktop, which is the worse failure mode.
 */
export function useHoverCapable(): boolean {
  const [canHover, setCanHover] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setCanHover(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCanHover(e.matches);
    // addEventListener is the modern API; Safari < 14 needed addListener
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    // @ts-expect-error legacy fallback
    mq.addListener(onChange);
    // @ts-expect-error legacy fallback
    return () => mq.removeListener(onChange);
  }, []);

  return canHover;
}
