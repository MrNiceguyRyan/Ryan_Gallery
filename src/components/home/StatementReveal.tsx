import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useVelocitySkew } from '../../lib/useVelocitySkew';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const WARM_WHITE = '#DDE1D2';

/* The manifesto, broken into its visual lines. `e:true` marks an emphasis run
 * set in the high-contrast serif + lime — the sans/serif collision. */
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
      <span className="font-serif italic" style={{ color: ACCENT, fontWeight: 700, fontSize: '1.05em' }}>
        {tok.t}
      </span>
    );
  }
  return <span style={{ color: WARM_WHITE }}>{tok.t}</span>;
}

/**
 * StatementReveal — the post-hero manifesto, sitting directly ON the flowing
 * contour background. NO mask: the text simply appears (a gentle staggered
 * fade-up as the section enters view — native IntersectionObserver, reliable
 * here), centered, in the sans/serif collision. Reduced motion = visible at
 * once.
 */
export default function StatementReveal() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(false);
  // Kinetic type — the manifesto leans + throws with scroll velocity.
  const kinetic = useVelocitySkew(4, 20);

  useEffect(() => {
    if (reduce) { setShown(true); return; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  const lineStyle = (i: number): React.CSSProperties =>
    reduce
      ? {}
      : {
          opacity: shown ? 1 : 0,
          transform: shown ? 'none' : 'translateY(26px)',
          transition: `opacity 0.7s ease ${i * 85}ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${i * 85}ms`,
        };

  return (
    <section
      ref={ref}
      className="relative z-10 min-h-[88vh] flex flex-col items-center justify-center py-24 px-6 md:px-12"
    >
      <p
        className="text-eyebrow text-center mb-8 md:mb-12"
        style={{ color: ACCENT, opacity: reduce || shown ? 1 : 0, transition: 'opacity 0.7s ease' }}
      >
        Nº 00 — The Ethos
      </p>
      <motion.p
        aria-hidden="true"
        className="font-ui uppercase text-center mx-auto will-change-transform"
        style={{ maxWidth: '15ch', fontSize: 'clamp(32px, 7vw, 104px)', lineHeight: 0.9, letterSpacing: '-0.008em', fontWeight: 400, skewX: kinetic.skewX, x: kinetic.x }}
      >
        {LINES.map((tokens, i) => (
          <span key={i} className="block" style={lineStyle(i)}>
            {tokens.map((tok, j) => <Run key={j} tok={tok} />)}
          </span>
        ))}
      </motion.p>
      <span className="sr-only">{LINES.map((l) => l.map((t) => t.t).join('')).join(' ')}</span>
    </section>
  );
}
