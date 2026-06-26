import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * ScrollSignature — a handwritten lime signature that "writes" itself stroke by
 * stroke as the section scrolls through the viewport, and un-writes on scroll
 * up. Strictly scroll-bound: scroll halfway and it's half drawn.
 *
 * Implementation: framer `motion.path` with `pathLength` (0→1) driven by the
 * section's scroll progress — framer normalizes stroke-dasharray/offset under
 * the hood, so there's no manual getTotalLength and no extra library (it rides
 * the same Lenis-driven scroll as the rest of the homepage). Multi-stroke: the
 * flourish underline draws after the main scrawl via a staggered range.
 *
 * The `d` values are a PLACEHOLDER cursive flourish — swap them for the real
 * signature exported as a single-line stroke path (fill:none) from Illustrator
 * / Figma or an image-to-SVG centerline trace.
 */
export default function ScrollSignature() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.9', 'end 0.4'] });
  const main = useTransform(scrollYProgress, [0, 0.72], [0, 1]);
  const flourish = useTransform(scrollYProgress, [0.6, 0.96], [0, 1]);

  const accent = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

  return (
    <section
      ref={ref}
      className="relative z-10 py-28 md:py-44 px-6 flex flex-col items-center justify-center"
      aria-label="Signature"
    >
      <p className="font-ui text-[10px] tracking-[0.5em] uppercase text-white/30 mb-10">Signed off</p>
      <svg
        viewBox="0 0 640 220"
        className="w-full max-w-[520px] overflow-visible"
        fill="none"
        role="img"
        aria-label="Ryan Xu signature"
      >
        <motion.path
          d="M36 150 C44 78 78 64 92 104 C104 138 84 162 74 144 C66 128 96 120 124 142 C144 158 156 122 176 140 C196 158 208 122 228 140 C248 158 260 120 282 134 C312 152 300 188 268 178 C244 170 268 146 312 150 C360 154 372 96 412 112 C452 128 432 178 392 168 C366 161 384 138 430 144 C506 154 566 146 612 108"
          stroke={accent}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pathLength: reduce ? 1 : main }}
        />
        <motion.path
          d="M70 190 C220 208 430 208 588 184"
          stroke={accent}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pathLength: reduce ? 1 : flourish }}
        />
      </svg>
      <p className="font-ui text-[10px] tracking-[0.4em] uppercase text-white/25 mt-8">Ryan Xu · New York</p>
    </section>
  );
}
