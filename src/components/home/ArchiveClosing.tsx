import { useEffect, useRef } from 'react';
import { animate, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useInViewOnce } from '../../lib/useInViewOnce';

interface Props {
  chapters: number;
  frames: number;
  /** Already formatted, e.g. "2025–2026". Empty hides the column. */
  years: string;
  onBackToIndex: () => void;
}

/**
 * A count that ticks up in visible steps (Joffrey Spitzer's steps(14)), once,
 * when the closing page arrives. The server renders the final figure; the
 * visual count is aria-hidden and the real value stays in the accessible text.
 */
export function StepCount({ value, pad, run }: { value: number; pad: number; run: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const format = (n: number) => String(Math.round(n)).padStart(pad, '0');
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = format(value);
      return;
    }
    if (!run) {
      node.textContent = format(0);
      return;
    }
    const steps = Math.max(1, Math.min(14, value));
    const controls = animate(0, value, {
      duration: 1.1,
      ease: (t: number) => Math.floor(t * steps) / steps,
      onUpdate: (latest) => { node.textContent = format(latest); },
    });
    return () => controls.stop();
  }, [pad, reduce, run, value]);

  return (
    <>
      <span ref={ref} aria-hidden="true">{String(value).padStart(pad, '0')}</span>
      <span className="sr-only">{value}</span>
    </>
  );
}

/**
 * ArchiveClosing — the desktop homepage's last page. The final chapter scrolls
 * away and uncovers it: the page above ends in a soft curved edge that flattens
 * as it lifts (Dennis Snellenberg), while the closing copy counter-moves so it
 * reads as lying still underneath (darkroom.engineering's revealed footer).
 * Every figure is derived from the archive; the line is the About page's lede.
 */
export default function ArchiveClosing({ chapters, frames, years, onBackToIndex }: Props) {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end end'] });
  const lipScale = useTransform(scrollYProgress, [0, 0.62], [1, 0], { clamp: true });
  const contentY = useTransform(scrollYProgress, [0, 1], ['-58%', '0%'], { clamp: true });
  // Count from the first sliver in view: the closing page peeks in under the
  // last chapter, and a row of zeros there would read as broken.
  const [statsRef, statsShown] = useInViewOnce<HTMLDListElement>('0px', 0);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="archive-closing-title"
      className="relative z-0 flex h-[100svh] min-h-[600px] overflow-hidden bg-[#20241a] text-[#F4F4ED]"
    >
      {/* The bottom edge of the page above: page-coloured, curved, flattening.
          Hidden by CSS, not by branching on `reduce`, so server and client
          render the same tree under reduced motion. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[16svh] origin-top bg-[#282c20] motion-reduce:hidden"
        style={{ scaleY: lipScale, borderRadius: '0 0 50% 50% / 0 0 100% 100%' }}
      />

      <motion.div
        style={reduce ? undefined : { y: contentY }}
        className="safe-inline-page relative mx-auto flex w-full max-w-6xl flex-col justify-center"
      >
        <p className="flex items-center gap-3 font-ui text-[11px] uppercase tracking-[0.08em] text-[#D2FF00]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#D2FF00]" aria-hidden="true" />
          <span className="tabular-nums">
            {String(chapters).padStart(2, '0')} / {String(chapters).padStart(2, '0')}
          </span>
          <span>Archive complete</span>
        </p>

        <h2
          id="archive-closing-title"
          className="mt-6 max-w-[16ch] font-serif font-normal leading-[0.94] tracking-[-0.03em] text-pretty"
          style={{ fontSize: 'clamp(48px, 6.4vw, 104px)' }}
        >
          Cities and landscapes, one frame at a time.
        </h2>

        <dl ref={statsRef} className="mt-12 flex flex-wrap gap-x-16 gap-y-6">
          <div className="flex flex-col-reverse">
            <dt className="mt-2 font-ui text-[11px] uppercase tracking-[0.08em] text-white/55">Chapters</dt>
            <dd className="m-0 font-serif text-[clamp(36px,3.4vw,52px)] leading-none tracking-[-0.02em]">
              <StepCount value={chapters} pad={2} run={statsShown} />
            </dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="mt-2 font-ui text-[11px] uppercase tracking-[0.08em] text-white/55">Frames</dt>
            <dd className="m-0 font-serif text-[clamp(36px,3.4vw,52px)] leading-none tracking-[-0.02em]">
              <StepCount value={frames} pad={2} run={statsShown} />
            </dd>
          </div>
          {years && (
            <div className="flex flex-col-reverse">
              <dt className="mt-2 font-ui text-[11px] uppercase tracking-[0.08em] text-white/55">Years</dt>
              <dd className="m-0 font-serif text-[clamp(36px,3.4vw,52px)] leading-none tracking-[-0.02em]">{years}</dd>
            </div>
          )}
        </dl>

        <div className="mt-14 flex flex-wrap items-center gap-x-10 gap-y-3 font-ui text-[12px] uppercase tracking-[0.08em]">
          <button
            type="button"
            onClick={onBackToIndex}
            className="inline-flex min-h-11 items-center uppercase text-[#D2FF00]/85 transition-colors hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
          >
            Back to index ↑
          </button>
          <a
            href="/about"
            className="inline-flex min-h-11 items-center text-white/72 transition-colors hover:text-[#F4F4ED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
          >
            About →
          </a>
          <a
            href="/travel"
            className="inline-flex min-h-11 items-center text-white/72 transition-colors hover:text-[#F4F4ED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
          >
            Map →
          </a>
        </div>
      </motion.div>
    </section>
  );
}
