import { useRef } from 'react';
import { motion, useScroll, useTransform, useMotionTemplate, useReducedMotion, type MotionValue } from 'framer-motion';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const WARM_WHITE = '#DDE1D2';

/* The manifesto, broken into the exact visual lines of the reveal. Each token
 * is a word-run; `e:true` marks an emphasis run set in the high-contrast serif
 * and lime — the sans/serif collision that carries the meaning. */
type Tok = { t: string; e?: boolean };
const LINES: Tok[][] = [
  [{ t: "I don't just" }],
  [{ t: 'take pictures.' }],
  [{ t: 'I capture ' }, { t: 'raw', e: true }],
  [{ t: 'moments, distilled' }],
  [{ t: 'chaos,', e: true }, { t: ' and the' }],
  [{ t: 'fleeting ' }, { t: 'rhythm', e: true }],
  [{ t: 'of the ' }, { t: 'jungle.', e: true }],
];

function Run({ tok }: { tok: Tok }) {
  if (tok.e) {
    return (
      <span
        className="font-serif italic"
        style={{ color: ACCENT, fontWeight: 700, fontSize: '1.05em' }}
      >
        {tok.t}
      </span>
    );
  }
  return <span style={{ color: WARM_WHITE }}>{tok.t}</span>;
}

/**
 * One statement line. As its scroll window plays (q: 0→1) a clip-path wipes the
 * line in left→right and a lime scan-bar rides the reveal edge, then fades off
 * the right (the landonorris `.high-line-reveal` mechanic). The line box shrink-
 * wraps its text and is centered, so the wipe + bar track the text, not the
 * viewport. Scroll-scrubbed → reverses on scroll-up.
 */
function StatementLine({
  tokens, s0, s1, progress, reduce,
}: {
  tokens: Tok[]; s0: number; s1: number; progress: MotionValue<number>; reduce: boolean;
}) {
  const q = useTransform(progress, [s0, s1], [0, 1], { clamp: true });
  const clipPct = useTransform(q, (v) => (1 - v) * 100); // inset from the right
  const clip = useMotionTemplate`inset(0 ${clipPct}% 0 0)`;
  const barPct = useTransform(q, (v) => v * 100);
  const barLeft = useMotionTemplate`${barPct}%`;
  const barOpacity = useTransform(q, [0, 0.04, 0.9, 1], [0, 1, 1, 0]);

  return (
    <span className="relative block w-fit mx-auto overflow-hidden py-[0.02em]">
      <motion.span className="block will-change-[clip-path]" style={reduce ? undefined : { clipPath: clip }}>
        {tokens.map((tok, i) => <Run key={i} tok={tok} />)}
      </motion.span>
      {!reduce && (
        <motion.span
          aria-hidden="true"
          className="absolute top-[0.1em] bottom-[0.14em] rounded-full"
          style={{
            left: barLeft,
            x: '-50%',
            width: '0.09em',
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
 * StatementReveal — the post-hero manifesto over the flowing contour field.
 * A tall pinned section: as you scroll, the statement writes itself out line by
 * line (clip wipe + lime scan-bar), centered, in the sans/serif collision.
 * Reduced motion renders the full statement, still.
 */
export default function StatementReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  const n = LINES.length;
  const winStart = 0.06;
  const step = (0.92 - winStart) / n; // per-line stride; windows overlap 1.6×

  const eyebrow = (
    <p className="text-eyebrow text-center mb-8 md:mb-12" style={{ color: ACCENT }}>
      Nº 00 — The Ethos
    </p>
  );
  const body = (
    <p
      aria-hidden="true"
      className="font-ui uppercase text-center mx-auto"
      style={{ maxWidth: '15ch', fontSize: 'clamp(32px, 7vw, 104px)', lineHeight: 0.9, letterSpacing: '-0.008em', fontWeight: 400 }}
    >
      {LINES.map((tokens, i) => (
        <StatementLine
          key={i}
          tokens={tokens}
          s0={winStart + i * step}
          s1={Math.min(1, winStart + i * step + step * 1.6)}
          progress={scrollYProgress}
          reduce={!!reduce}
        />
      ))}
    </p>
  );
  const sr = <span className="sr-only">{LINES.map((l) => l.map((t) => t.t).join('')).join(' ')}</span>;

  if (reduce) {
    return (
      <section className="relative z-10 min-h-[70vh] flex items-center py-24">
        <div className="w-full mx-auto px-6 md:px-12">{eyebrow}{body}{sr}</div>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative z-10" style={{ height: `${100 + n * 22}vh` }}>
      <div className="sticky top-0 h-[100svh] flex flex-col items-center justify-center overflow-hidden">
        <div className="w-full mx-auto px-6 md:px-12">{eyebrow}{body}{sr}</div>
      </div>
    </section>
  );
}
