import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { animate, useMotionValue, type MotionValue } from 'framer-motion';

// Into the press: gathering over a click's length, so a hand that is starting
// a drag has barely pressed in by the time it has travelled `slop`. Out of it:
// a tween that lands on 1 without passing it.
const PRESS = { duration: 0.14, ease: [0.33, 0, 0.2, 1] as const };
const SETTLE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

/**
 * A card that gives a hair under a still press, the way framer's
 * `whileTap: { scale }` did here, but only while the hand is still. Once the
 * press has travelled `slop` px it is a drag (a pull, a swipe, a selection),
 * not a click, and the card settles straight back. The settle is a tween,
 * never whileTap's spring, so it cannot overshoot and wobble under a hand
 * that is dragging across it.
 *
 * Put `scale` on the card's style and call `onPointerDown` from its press
 * handler. The press is followed on `window` until it ends, so a hand that
 * leaves the card before letting go still settles it.
 */
export function usePressGive(
  enabled: boolean,
  { depth = 0.996, slop = 6 }: { depth?: number; slop?: number } = {},
): {
  scale: MotionValue<number>;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
} {
  const scale = useMotionValue(1);
  const detachRef = useRef<(() => void) | null>(null);
  useEffect(() => () => detachRef.current?.(), []);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0 || !event.isPrimary) return;
    detachRef.current?.();
    const id = event.pointerId;
    const x = event.clientX;
    const y = event.clientY;
    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      if (detachRef.current === detach) detachRef.current = null;
    };
    const settle = () => {
      detach();
      animate(scale, 1, SETTLE);
    };
    function onMove(move: PointerEvent) {
      if (move.pointerId === id && Math.hypot(move.clientX - x, move.clientY - y) >= slop) settle();
    }
    function onEnd(end: PointerEvent) {
      if (end.pointerId === id) settle();
    }
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    detachRef.current = detach;
    animate(scale, depth, PRESS);
  };

  return { scale, onPointerDown };
}
