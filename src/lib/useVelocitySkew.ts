import { useScroll, useTransform, useVelocity, useSpring, useReducedMotion, type MotionValue } from 'framer-motion';

/**
 * useVelocitySkew — the hero's kinetic-type language, packaged for section
 * headings: scroll velocity → a springed skewX lean + a horizontal throw that
 * settles when scrolling stops. Amplitudes are tuned smaller than the hero's
 * so in-page headings echo the opener without competing with it.
 * Returns zeros under reduced-motion.
 */
export function useVelocitySkew(
  maxSkew = 5,
  maxThrow = 26,
): { skewX: MotionValue<number> | number; x: MotionValue<number> | number } {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const skewRaw = useTransform(velocity, [-2200, 0, 2200], [maxSkew, 0, -maxSkew], { clamp: true });
  const skewX = useSpring(skewRaw, { stiffness: 260, damping: 22, mass: 0.5 });
  const throwRaw = useTransform(velocity, [-2200, 0, 2200], [-maxThrow, 0, maxThrow], { clamp: true });
  const x = useSpring(throwRaw, { stiffness: 220, damping: 24, mass: 0.5 });
  if (reduce) return { skewX: 0, x: 0 };
  return { skewX, x };
}
