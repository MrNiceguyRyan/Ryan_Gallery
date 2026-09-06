import { useCallback, useEffect, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useHoverCapable } from '../../lib/useHoverCapable';

interface Props {
  children: React.ReactNode;
  /** How far the element drifts toward the cursor (0–1 of the offset). */
  strength?: number;
  className?: string;
}

const clamp = (value: number, min: number, max: number) => (
  Math.min(Math.max(value, min), max)
);

/**
 * Magnetic — wraps an element so it drifts toward the cursor while hovered
 * and springs back on leave (the Zajno-style "magnetic" affordance). Pairs
 * with the site's custom cursor. Translate-only, so it doesn't fight the
 * child's own hover scale; gated to hover-capable (mouse) devices.
 */
export default function Magnetic({ children, strength = 0.35, className = '' }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const canHover = useHoverCapable();
  // Continuous pointer-tracking motion — disabled for reduced-motion visitors
  // (the CSS neutralizer can't reach framer's inline spring writes).
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 24, mass: 0.2 });
  const sy = useSpring(y, { stiffness: 260, damping: 24, mass: 0.2 });

  const reset = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    rectRef.current = null;
    pointerRef.current = null;
    x.set(0);
    y.set(0);
  }, [x, y]);

  const flushPosition = useCallback(() => {
    frameRef.current = null;
    const rect = rectRef.current;
    const pointer = pointerRef.current;
    if (!rect || !pointer) return;

    x.set(clamp((pointer.x - (rect.left + rect.width / 2)) * strength, -10, 10));
    y.set(clamp((pointer.y - (rect.top + rect.height / 2)) * strength, -8, 8));
  }, [strength, x, y]);

  const schedulePosition = useCallback((clientX: number, clientY: number) => {
    pointerRef.current = { x: clientX, y: clientY };
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(flushPosition);
    }
  }, [flushPosition]);

  const onPointerEnter = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (reduce || !canHover || e.pointerType !== 'mouse' || !ref.current) {
      reset();
      return;
    }
    rectRef.current = ref.current.getBoundingClientRect();
    schedulePosition(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (reduce || !canHover || e.pointerType !== 'mouse') {
      reset();
      return;
    }
    if (!rectRef.current && ref.current) {
      rectRef.current = ref.current.getBoundingClientRect();
    }
    schedulePosition(e.clientX, e.clientY);
  };

  useEffect(() => {
    if (reduce || !canHover) reset();
    return reset;
  }, [canHover, reduce, reset]);

  return (
    <motion.span
      ref={ref}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onTouchStart={reset}
      onTouchEnd={reset}
      onTouchCancel={reset}
      style={{ x: sx, y: sy, display: 'inline-block' }}
      className={className}
    >
      {children}
    </motion.span>
  );
}
