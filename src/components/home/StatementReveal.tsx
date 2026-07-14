import { useReducedMotion } from 'framer-motion';
import { useInViewOnce } from '../../lib/useInViewOnce';
import { SweepLine, SWEEP_LIME, SWEEP_OLIVE } from './SweepLine';

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
  const reduce = useReducedMotion();
  // Fire as the block reaches the lower viewport, once (shared site trigger).
  const [ref, shown] = useInViewOnce<HTMLElement>('0px 0px -5% 0px', 0);

  // Near-synchronous center-out stagger (reference: amount 0.015 from center).
  const center = (LINES.length - 1) / 2;
  const delayOf = (i: number) => (Math.abs(i - center) / center) * 0.015;

  return (
    <section
      ref={ref}
      className="relative z-10 min-h-[88vh] flex flex-col items-center justify-center py-24 px-6 md:px-12"
    >
      <p
        className="text-eyebrow text-center mb-8 md:mb-12"
        style={{ color: ACCENT, opacity: reduce || shown ? 1 : 0, transition: 'opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        Nº 00 — The Ethos
      </p>
      <p
        aria-hidden="true"
        className="font-ui uppercase text-center mx-auto"
        style={{ maxWidth: '15ch', fontSize: 'clamp(32px, 7vw, 104px)', lineHeight: 0.9, letterSpacing: '-0.008em', fontWeight: 400 }}
      >
        {LINES.map((tokens, i) => (
          <span key={i} className="block">
            <SweepLine
              shown={shown}
              delay={delayOf(i)}
              dir={i % 2 === 0 ? 'left' : 'right'}
              color={tokens.some((t) => t.e) ? SWEEP_LIME : SWEEP_OLIVE}
              reduce={!!reduce}
            >
              {tokens.map((tok, j) => <Run key={j} tok={tok} />)}
            </SweepLine>
          </span>
        ))}
      </p>
      <span className="sr-only">{LINES.map((l) => l.map((t) => t.t).join('')).join(' ')}</span>
    </section>
  );
}
