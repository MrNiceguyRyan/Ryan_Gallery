import { useRef } from 'react';
import { motion, useScroll, useTransform, useMotionTemplate, useReducedMotion } from 'framer-motion';

/**
 * ScrollSignature — the "RyanXu" signature writes itself on as the sign-off
 * section scrolls through (left→right reveal), and un-writes on scroll up.
 * Strictly scroll-bound: scroll halfway and it's half written.
 *
 * Rendered in a bold script font with a scroll-driven clip-path wipe (reads like
 * a pen moving across) plus a soft lime glow. This gives a real, legible
 * signature now; swap in the actual handwritten mark by replacing this with a
 * single-line SVG stroke path (then bind framer's `pathLength` to the same
 * scroll progress for a true stroke-by-stroke draw).
 */
export default function ScrollSignature() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.9', 'end 0.45'] });
  const reveal = useTransform(scrollYProgress, [0, 0.85], [100, 0]);
  const clip = useMotionTemplate`inset(-14% ${reveal}% -14% 0)`;
  const accent = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

  return (
    <section
      ref={ref}
      className="relative z-10 py-28 md:py-44 px-6 flex flex-col items-center justify-center"
      aria-label="Signature"
    >
      <p className="font-ui text-[10px] tracking-[0.5em] uppercase text-white/30 mb-10">Signed off</p>
      <motion.span
        className="select-none leading-none"
        style={{
          fontFamily: '"Dancing Script", cursive',
          fontWeight: 700,
          fontSize: 'clamp(68px, 14vw, 200px)',
          color: accent,
          textShadow: 'rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.45) 0 0 24px',
          clipPath: reduce ? undefined : clip,
        }}
      >
        RyanXu
      </motion.span>
      <p className="font-ui text-[10px] tracking-[0.4em] uppercase text-white/25 mt-8">New York</p>
    </section>
  );
}
