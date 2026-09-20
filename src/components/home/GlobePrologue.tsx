import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import { useInViewOnce } from '../../lib/useInViewOnce';
import { StepCount } from './ArchiveClosing';

const expo = [0.16, 1, 0.3, 1] as const;

interface PrologueCity {
  name: string;
  /** DOM id of the chapter the name jumps to. */
  id: string;
  /** Collection id — the stop the globe lights while the name is pointed at. */
  chapterId: string;
  /** State or region, when it says more than the name. */
  region?: string;
  frames: number;
  year?: number | string;
}

const pad2 = (value: number) => String(value).padStart(2, '0');

interface Props {
  chapters: number;
  frames: number;
  years: string;
  cities: PrologueCity[];
  onSelect: (anchorId: string) => void;
  /** Hover/focus on an index name lights its stop on the globe (null clears). */
  onHighlight?: (chapterId: string | null) => void;
  /** The planet's centre and radius on screen (viewport px). With it the
   *  index bends around the planet; without it (server, reduced motion) the
   *  index is a plain column. */
  planet?: { x: number; y: number; r: number } | null;
  /** Prologue progress 0–1: the bent index fades in with the planet's
   *  arrival and out into the dive. */
  progress?: MotionValue<number>;
}

// The bent index: rows spread across this arc (degrees from horizontal, on
// the planet's right), the arc line sits this far outside the limb.
const ARC_SPREAD: [number, number] = [-42, 43];
const ARC_GAP = 58;
const ROW_GAP = 26;

/**
 * One line of display type rising out of its own mask (Christie Hemm Klok:
 * y 105% → 0, staggered). Whole lines only — never split into letters, so
 * assistive tech reads the words as written.
 */
function RiseLine({ children, shown, index, className = '' }: {
  children: ReactNode;
  shown: boolean;
  index: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <span className="prologue-line">
      <motion.span
        className={`block ${className}`}
        initial={false}
        animate={{ y: reduce || shown ? '0%' : '112%' }}
        transition={reduce || !shown ? { duration: 0 } : { duration: 0.95, delay: index * 0.09, ease: expo }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/**
 * GlobePrologue — the desktop homepage's opening, laid over the live atlas.
 *
 * After 11 mois sans toi(t): giant statements scroll past on one side while
 * the map behind them is a whole, lit globe, half off the bottom-right corner,
 * turning with the scroll. The last block swaps sides — the index sits right
 * while the globe glides left into the atlas's focal point and dives into the
 * first chapter. The globe itself is the RouteAtlas map (driven by
 * `prologueProgress`); this component is only the type.
 */
export default function GlobePrologue({ chapters, frames, years, cities, onSelect, onHighlight, planet = null, progress }: Props) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const steady = useMotionValue(1);
  const bentOpacity = useTransform(progress ?? steady, progress ? [0.7, 0.78, 0.965, 1] : [0, 1], progress ? [0, 1, 1, 0] : [1, 1]);
  const bentPointer = useTransform(bentOpacity, (value) => (value > 0.5 ? 'auto' : 'none'));
  const bent = !reduce && !!planet;
  const angleAt = (index: number) => ARC_SPREAD[0] + ((ARC_SPREAD[1] - ARC_SPREAD[0]) * index) / Math.max(1, cities.length - 1);
  const at = (angle: number, radius: number): [number, number] => planet
    ? [planet.x + radius * Math.cos((angle * Math.PI) / 180), planet.y + radius * Math.sin((angle * Math.PI) / 180)]
    : [0, 0];
  const arcRadius = planet ? planet.r + ARC_GAP : 0;
  const [heroShown, setHeroShown] = useState(false);
  const [statsRef, statsShown] = useInViewOnce<HTMLDivElement>('0px 0px -22% 0px', 0.2);
  const [indexRef, indexShown] = useInViewOnce<HTMLElement>('0px 0px -18% 0px', 0.12);

  // The name rises as the page arrives (not on scroll): one beat after the
  // first paint, so the rise is seen rather than hydrated past.
  useEffect(() => {
    if (reduce) {
      setHeroShown(true);
      return;
    }
    const timer = window.setTimeout(() => setHeroShown(true), 180);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  const row = (city: PrologueCity, index: number) => (
    <motion.button
      type="button"
      onClick={() => {
        // The pointer stays put while the page travels: end the
        // hover here, or the pinned cover would ride the dive.
        onHighlight?.(null);
        setHovered(null);
        onSelect(city.id);
      }}
      onPointerEnter={() => { onHighlight?.(city.chapterId); setHovered(index); }}
      onPointerLeave={() => { onHighlight?.(null); setHovered(null); }}
      onFocus={() => { onHighlight?.(city.chapterId); setHovered(index); }}
      onBlur={() => { onHighlight?.(null); setHovered(null); }}
      data-cursor="Go to chapter"
      aria-label={`Go to chapter ${index + 1}: ${city.name}`}
      className={`prologue-index-row group flex flex-wrap items-baseline gap-x-6 whitespace-nowrap text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00] ${bent ? 'py-1' : 'w-full pb-[13px] pt-[11px]'}`}
      initial={false}
      animate={{ y: reduce || indexShown ? '0%' : '105%' }}
      transition={reduce || !indexShown ? { duration: 0 } : { duration: 0.85, delay: 0.08 + index * 0.07, ease: expo }}
    >
      <span className="w-8 shrink-0 font-ui text-[11px] tabular-nums tracking-[0.08em] text-[#D2FF00]/80">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span
        className="font-serif uppercase leading-[0.86] tracking-[-0.03em] text-[#F4F4ED] transition-colors duration-300 group-hover:text-[#D2FF00] group-focus-visible:text-[#D2FF00]"
        style={{ fontSize: bent ? 'clamp(34px, 3.6vw, 56px)' : 'clamp(36px, 4vw, 72px)' }}
      >
        {city.name}
      </span>
      {!bent && (
        <span aria-hidden="true" className="ml-auto font-ui text-[12px] text-white/0 transition-colors duration-300 group-hover:text-[#D2FF00]">
          →
        </span>
      )}
      {/* The entry's figures, set under the name like an index line. */}
      <span className="mt-[7px] flex basis-full items-baseline gap-[14px] pl-14 font-ui text-[11px] uppercase tracking-[0.08em] text-white/42 tabular-nums transition-colors duration-300 group-hover:text-white/70 group-focus-visible:text-white/70">
        {city.region && <span>{city.region}</span>}
        <span className="font-medium text-white/62 transition-colors duration-300 group-hover:text-[#D2FF00] group-focus-visible:text-[#D2FF00]">
          {pad2(city.frames)} frames
        </span>
        {city.year != null && <span>{city.year}</span>}
      </span>
    </motion.button>
  );

  return (
    <div className="globe-prologue pointer-events-none absolute inset-x-0 top-0 z-30 hidden lg:block">
      {/* ── 1 · Name ── */}
      <div className="flex h-[100svh] flex-col justify-end pb-[11svh] pl-[6vw] pr-[40vw]">
        <motion.p
          className="flex items-center gap-3 font-ui text-[11px] uppercase tracking-[0.1em] text-white/60"
          initial={false}
          animate={{ opacity: heroShown ? 1 : 0, y: heroShown ? 0 : 10 }}
          transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.5, ease: expo }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#D2FF00]" aria-hidden="true" />
          <span>Visual Archive</span>
          {years && <span className="tabular-nums text-white/45">{years}</span>}
        </motion.p>
        <p
          aria-hidden="true"
          className="prologue-display mt-5 font-serif uppercase text-[#F4F4ED]"
          style={{ fontSize: 'clamp(112px, 15.2vw, 280px)' }}
        >
          <RiseLine shown={heroShown} index={0}>Ryan</RiseLine>
          <RiseLine shown={heroShown} index={1}>Xu</RiseLine>
        </p>
        <motion.p
          className="mt-8 max-w-[30ch] font-serif text-[clamp(20px,1.7vw,28px)] italic leading-snug text-white/78"
          initial={false}
          animate={{ opacity: heroShown ? 1 : 0, y: heroShown ? 0 : 14 }}
          transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : 0.34, ease: expo }}
        >
          Cities and landscapes, one frame at a time.
        </motion.p>
        <motion.p
          aria-hidden="true"
          className="mt-14 flex items-center gap-3 font-ui text-[10px] uppercase tracking-[0.1em] text-white/50"
          initial={false}
          animate={{ opacity: heroShown ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : 1.1, ease: expo }}
        >
          <span className="prologue-scroll-cue relative block h-7 w-px overflow-hidden bg-white/18" />
          Scroll
        </motion.p>
      </div>

      {/* ── 2 · The archive in two figures ── */}
      <div ref={statsRef} className="flex h-[90svh] items-center pl-[6vw] pr-[36vw]">
        <p
          className="prologue-display font-serif uppercase"
          style={{ fontSize: 'clamp(64px, 8.6vw, 156px)' }}
        >
          {/* The figures tick up in steps as their lines rise (ArchiveClosing's
              StepCount): the server renders the final figure, the count is
              visual only. */}
          <RiseLine shown={statsShown} index={0} className="tabular-nums text-[#F4F4ED]">
            <StepCount value={chapters} pad={2} run={statsShown} /> chapters.
          </RiseLine>
          <RiseLine shown={statsShown} index={1} className="tabular-nums text-[#B2C73A]">
            <StepCount value={frames} pad={2} run={statsShown} /> frames.
          </RiseLine>
          {years && (
            <RiseLine shown={statsShown} index={2} className="tabular-nums text-white/38">
              {years}.
            </RiseLine>
          )}
        </p>
      </div>

      {/* ── 3 · Index — the sides swap: names right, globe gliding left ── */}
      {/* RouteAtlas measures this nav's left edge to size the globe beside it. */}
      <nav
        ref={indexRef}
        id="archive-index"
        aria-label="Archive index"
        className={bent ? 'pointer-events-none ml-auto h-[110svh] w-[44vw]' : 'pointer-events-auto ml-auto flex h-[110svh] w-[44vw] flex-col justify-center pr-[6vw]'}
      >
        {bent ? (
          /* Bent around the planet: pinned to the viewport (the planet is
             sticky), fading in as it arrives and out into the dive. The nav
             itself only gives the scroll its length. */
          <motion.div
            className="pointer-events-none fixed inset-0 z-30"
            style={{ opacity: bentOpacity, pointerEvents: bentPointer }}
          >
            <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
              {(() => {
                const [x0, y0] = at(ARC_SPREAD[0] - 8, arcRadius);
                const [x1, y1] = at(ARC_SPREAD[1] + 8, arcRadius);
                return <path d={`M${x0},${y0} A${arcRadius},${arcRadius} 0 0 1 ${x1},${y1}`} fill="none" stroke="rgba(244,244,237,0.22)" strokeDasharray="3 4" />;
              })()}
              {cities.map((city, index) => {
                const angle = angleAt(index);
                const [tx, ty] = at(angle, arcRadius - 8);
                const [ux, uy] = at(angle, arcRadius + 8);
                const on = hovered === index;
                return <line key={city.id} x1={tx} y1={ty} x2={ux} y2={uy} stroke={on ? '#D2FF00' : 'rgba(244,244,237,0.6)'} strokeWidth={on ? 2 : 1} />;
              })}
              {/* The needle: from the planet's limb to the pointed-at row. */}
              {(() => {
                const angle = angleAt(hovered ?? 0);
                const [nx0, ny0] = at(angle, planet!.r + 6);
                const [nx1, ny1] = at(angle, arcRadius - 10);
                return (
                  <motion.line
                    stroke="#D2FF00"
                    strokeWidth={1}
                    initial={false}
                    animate={{ x1: nx0, y1: ny0, x2: nx1, y2: ny1, opacity: hovered == null ? 0 : 1 }}
                    transition={{ duration: reduce ? 0 : 0.42, ease: expo }}
                  />
                );
              })()}
            </svg>
            <motion.p
              className="absolute flex items-center gap-3 font-ui text-[11px] uppercase tracking-[0.1em] text-white/58"
              style={{ left: at(angleAt(0), arcRadius + ROW_GAP)[0], top: at(angleAt(0), arcRadius + ROW_GAP)[1] - 64 }}
              initial={false}
              animate={{ opacity: indexShown ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.6, ease: expo }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#D2FF00]" aria-hidden="true" />
              Index
            </motion.p>
            <ol className="m-0 list-none p-0">
              {cities.map((city, index) => {
                const [x, y] = at(angleAt(index), arcRadius + ROW_GAP);
                return (
                  <li key={city.id} className="prologue-line pointer-events-auto absolute -translate-y-1/2" style={{ left: x, top: y }}>
                    {row(city, index)}
                  </li>
                );
              })}
            </ol>
            <motion.p
              aria-hidden="true"
              className="absolute flex items-center gap-3 font-ui text-[10px] uppercase tracking-[0.1em] text-white/50"
              style={{ left: at(angleAt(cities.length - 1), arcRadius + ROW_GAP)[0], top: at(angleAt(cities.length - 1), arcRadius + ROW_GAP)[1] + 58 }}
              initial={false}
              animate={{ opacity: indexShown ? 1 : 0, y: reduce || indexShown ? 0 : 8 }}
              transition={reduce ? { duration: 0 } : { duration: 0.7, delay: indexShown ? 0.2 + cities.length * 0.07 : 0, ease: expo }}
            >
              <span className="prologue-scroll-cue relative block h-7 w-px overflow-hidden bg-white/18" />
              <span>Scroll to enter{cities[0] ? ` · 01 ${cities[0].name}` : ''}</span>
            </motion.p>
          </motion.div>
        ) : (
          <>
            <motion.p
              className="mb-8 flex items-center gap-3 font-ui text-[11px] uppercase tracking-[0.1em] text-white/58"
              initial={false}
              animate={{ opacity: indexShown ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.6, ease: expo }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#D2FF00]" aria-hidden="true" />
              Index
            </motion.p>
            <ol className="m-0 list-none p-0">
              {cities.map((city, index) => (
                <Fragment key={city.id}>
                  <li className="prologue-line border-t border-white/12 last:border-b">
                    {row(city, index)}
                  </li>
                </Fragment>
              ))}
            </ol>
            {/* Scrolling on dives the globe into the first chapter. */}
            <motion.p
              aria-hidden="true"
              className="mt-7 flex items-center gap-3 font-ui text-[10px] uppercase tracking-[0.1em] text-white/50"
              initial={false}
              animate={{ opacity: indexShown ? 1 : 0, y: reduce || indexShown ? 0 : 8 }}
              transition={reduce ? { duration: 0 } : { duration: 0.7, delay: indexShown ? 0.2 + cities.length * 0.07 : 0, ease: expo }}
            >
              <span className="prologue-scroll-cue relative block h-7 w-px overflow-hidden bg-white/18" />
              <span>Scroll to enter{cities[0] ? ` · 01 ${cities[0].name}` : ''}</span>
            </motion.p>
          </>
        )}
      </nav>
    </div>
  );
}
