import { useRef } from 'react';
import { motion, useScroll, useTransform, useMotionTemplate, useReducedMotion, type MotionValue } from 'framer-motion';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

/* The manifesto, broken into the exact visual lines of the reveal (landonorris
 * hard-codes line breaks so each line can wipe independently). */
const LINES = [
  "I don't just",
  'take pictures.',
  'I capture raw',
  'moments, distilled',
  'chaos, and the',
  'fleeting rhythm',
  'of the jungle.',
];

/**
 * One statement line. As its scroll window plays (q: 0→1) a clip-path wipes the
 * text in left→right, and a lime scan-bar rides the reveal edge (transform-
 * origin at the boundary) then fades off the right — the landonorris
 * `.high-line-reveal` mechanic. Scroll-scrubbed, so it reverses on scroll-up.
 */
function StatementLine({
  text, s0, s1, progress, reduce,
}: {
  text: string; s0: number; s1: number; progress: MotionValue<number>; reduce: boolean;
}) {
  const q = useTransform(progress, [s0, s1], [0, 1], { clamp: true });
  const clipPct = useTransform(q, (v) => (1 - v) * 100); // inset from the right
  const clip = useMotionTemplate`inset(0 ${clipPct}% 0 0)`;
  const barPct = useTransform(q, (v) => v * 100);
  const barLeft = useMotionTemplate`${barPct}%`;
  const barOpacity = useTransform(q, [0, 0.04, 0.9, 1], [0, 1, 1, 0]);

  return (
    <span className="relative block overflow-hidden py-[0.02em]">
      <motion.span className="block will-change-[clip-path]" style={reduce ? undefined : { clipPath: clip }}>
        {text}
      </motion.span>
      {!reduce && (
        <motion.span
          aria-hidden="true"
          className="absolute top-[0.1em] bottom-[0.14em] rounded-full"
          style={{
            left: barLeft,
            x: '-50%',
            width: '0.1em',
            background: ACCENT,
            opacity: barOpacity,
            boxShadow: '0 0 34px 2px rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.65)',
          }}
        />
      )}
    </span>
  );
}

/**
 * StatementReveal — the post-hero manifesto. A tall pinned section: the light
 * head's shutter has closed above it, and as you scroll the statement writes
 * itself out line by line (clip wipe + lime scan-bar). Reduced motion renders
 * the full statement, still. Pure typography over the frozen exposure ghost.
 */
export default function StatementReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  const n = LINES.length;
  const winStart = 0.06;
  const step = (0.92 - winStart) / n; // per-line stride; windows overlap 1.6×

  const eyebrow = (
    <p className="text-eyebrow mb-6 md:mb-10" style={{ color: ACCENT }}>
      Nº 00 — The Ethos
    </p>
  );
  const body = (
    <p
      aria-hidden="true"
      className="font-impact uppercase text-[#F4F4ED]"
      style={{ fontSize: 'clamp(30px, 7.3vw, 96px)', lineHeight: 0.94, letterSpacing: '-0.015em' }}
    >
      {LINES.map((line, i) => (
        <StatementLine
          key={i}
          text={line}
          s0={winStart + i * step}
          s1={Math.min(1, winStart + i * step + step * 1.6)}
          progress={scrollYProgress}
          reduce={!!reduce}
        />
      ))}
    </p>
  );
  const sr = <span className="sr-only">{LINES.join(' ')}</span>;

  if (reduce) {
    return (
      <section className="relative z-10 min-h-[70vh] flex items-center py-24">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-12">
          {eyebrow}
          {body}
          {sr}
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative z-10" style={{ height: `${100 + n * 22}vh` }}>
      <div className="sticky top-0 h-[100svh] flex items-center overflow-hidden">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-12">
          {eyebrow}
          {body}
          {sr}
        </div>
      </div>
    </section>
  );
}
