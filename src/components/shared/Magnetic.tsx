import { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useHoverCapable } from '../../lib/useHoverCapable';

interface Props {
  children: React.ReactNode;
  /** How far the element drifts toward the cursor (0–1 of the offset). */
  strength?: number;
  className?: string;
}

/**
 * Magnetic — wraps an element so it drifts toward the cursor while hovered
 * and springs back on leave (the Zajno-style "magnetic" affordance). Pairs
 * with the site's custom cursor. Translate-only, so it doesn't fight the
 * child's own hover scale; gated to hover-capable (mouse) devices.
 */
export default function Magnetic({ children, strength = 0.35, className = '' }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const canHover = useHoverCapable();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16, mass: 0.25 });
  const sy = useSpring(y, { stiffness: 220, damping: 16, mass: 0.25 });

  const onMove = (e: React.MouseEvent) => {
    if (!canHover || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.span
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ x: sx, y: sy, display: 'inline-block' }}
      className={className}
    >
      {children}
    </motion.span>
  );
}
