import { motion } from 'framer-motion';

/* SweepLine — a single line of text revealed the iventions "high-line-reveal"
 * way: a coloured bar (lime / soft-olive) covers the line, then retracts
 * (scaleX 1→0) to wipe the text in. The text itself is STATIC — only the bar
 * transforms, so the reveal is 100% GPU-composited and buttery (no per-frame
 * clip-path repaint of large glyphs, which is what made it stutter before).
 * House expo-out easing for the silky, fast-in / long-tail feel. Driven by the
 * parent's `shown` (a reliable native-IO flag), fired once, with a tiny
 * center-out stagger passed in as `delay`. Reduced-motion → plain text. */

const EXPO = [0.16, 1, 0.3, 1] as const; // house ease-out — silky
const LIME = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
export const SWEEP_OLIVE = '#b2c73a';
export const SWEEP_LIME = LIME;

export function SweepLine({
  children,
  shown,
  delay = 0,
  dir = 'left',
  color = LIME,
  reduce = false,
}: {
  children: React.ReactNode;
  shown: boolean;
  delay?: number;
  dir?: 'left' | 'right';
  color?: string;
  reduce?: boolean;
}) {
  if (reduce) return <span className="inline-block">{children}</span>;

  // The bar collapses toward `origin`, wiping the static text in from the other
  // side. Slightly over-sized (negative inset) so it fully covers tall/italic
  // glyph overhang (the W in RAW, M in RHYTHM) before it retracts.
  const origin = dir === 'left' ? 'left center' : 'right center';

  return (
    <span className="relative inline-block align-top">
      <span className="inline-block">{children}</span>
      <motion.span
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          inset: '-0.12em -0.16em',
          background: color,
          transformOrigin: origin,
          willChange: 'transform',
        }}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: shown ? 0 : 1 }}
        transition={{ duration: 1.3, ease: EXPO, delay }}
      />
    </span>
  );
}
