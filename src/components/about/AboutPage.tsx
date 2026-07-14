import { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import type { SiteSettings, TimelineItem } from '../../types';
import Magnetic from '../shared/Magnetic';
import { startLenis } from '../../lib/smoothScroll';
import { useInViewOnce } from '../../lib/useInViewOnce';

const expo = [0.16, 1, 0.3, 1] as const;

/* SignatureScrub — a real SVG signature drawn stroke by stroke, SCRUBBED by
 * page scroll: each path's pathLength is bound to a slice of the page's
 * scrollYProgress, so scrolling down literally drags the pen — main word first,
 * then the underline flourish, then the finishing flick — and the signature
 * completes exactly as you reach the bottom. Reduced-motion renders it fully
 * drawn and static. */
const SIG_STROKES = [
  // main word — one continuous cursive scribble (R → y → a → n), ending in its
  // own upward flick so nothing floats detached from the ink
  'M30,95 C34,60 44,26 58,22 C72,18 74,40 60,55 C52,63 44,66 38,66 C60,70 78,74 92,72 C104,70 112,60 116,50 C118,64 118,78 112,92 C106,108 92,116 84,108 C78,100 88,88 102,82 C118,74 130,70 142,72 C154,74 158,84 154,92 C150,98 140,98 138,90 C140,78 150,72 162,70 C176,68 184,76 184,88 C184,94 182,96 180,92 C182,80 190,70 202,68 C216,66 222,76 220,90 C226,80 238,68 250,58',
  // underline flourish
  'M40,112 C100,124 200,124 268,104',
];
// each stroke draws over its own slice of the page scroll; done by the bottom
const SIG_SEGMENTS: [number, number][] = [[0.42, 0.85], [0.85, 0.97]];

function SignatureScrub({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll(); // whole-page progress
  const lens = SIG_SEGMENTS.map(([a, b], i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length array, stable order
    useTransform(scrollYProgress, [a, b], [0, 1], { clamp: true }),
  );
  return (
    <svg
      viewBox="0 0 300 140"
      fill="none"
      aria-hidden
      className={className}
      style={{ overflow: 'visible', filter: 'drop-shadow(0 0 7px rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.3))' }}
    >
      {SIG_STROKES.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          stroke="rgb(var(--accent-r), var(--accent-g), var(--accent-b))"
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pathLength: reduce ? 1 : lens[i] }}
        />
      ))}
    </svg>
  );
}

/* FlipLine — Lando-style hover roll: the line is duplicated and stacked; when
 * the pointer lands on the parent `.group`, the original rolls UP and out while
 * the copy rolls in from below. Pure CSS transforms (GPU), inherits text styles
 * from the wrapper. The arriving copy can brighten via `hoverClassName`. */
function FlipLine({ text, className = '', hoverClassName = '' }: { text: string; className?: string; hoverClassName?: string }) {
  const move = 'transition-transform duration-[480ms] ease-[cubic-bezier(0.16,1,0.3,1)]';
  return (
    <span className={`relative block overflow-hidden ${className}`}>
      <span className={`block truncate ${move} group-hover:-translate-y-full`}>{text}</span>
      <span aria-hidden className={`absolute inset-0 block truncate translate-y-full ${move} group-hover:translate-y-0 ${hoverClassName}`}>
        {text}
      </span>
    </span>
  );
}

// Hero entrance item: fades up. `custom` is the per-element delay so the hero
// text emerges top-to-bottom once the cover has lifted.
const makeHeroItem = (reduce: boolean) => ({
  hidden: { opacity: 0, y: reduce ? 0 : 22 },
  show: (d: number = 0) => ({ opacity: 1, y: 0, transition: reduce ? { duration: 0 } : { duration: 0.62, delay: d, ease: expo } }),
});

/**
 * Scroll-reveal wrapper — a thin fade-up skin over the shared useInViewOnce
 * trigger (native IO; framer's whileInView is banned — see lib/useInViewOnce).
 * Reduced-motion users get the content immediately, no transform.
 */
function Reveal({ children, className, y = 22, delay = 0 }: { children: ReactNode; className?: string; y?: number; delay?: number }) {
  const reduce = useReducedMotion();
  const [ref, shown] = useInViewOnce<HTMLDivElement>();
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      animate={reduce || shown ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: reduce ? 0 : 0.6, delay, ease: expo }}
    >
      {children}
    </motion.div>
  );
}

/** Fallback timeline shown when Sanity has no data yet. Only entries
 *  backed by real collections are listed. Future additions go through
 *  Sanity Studio, not this fallback. */
const FALLBACK_TIMELINE: TimelineItem[] = [
  { year: '2024', title: 'New York Stories', description: 'Streets, architecture, and the off-hours light of the five boroughs.' },
  { year: '2024', title: 'Southwest Sequence', description: 'Zion, Bryce Canyon, Page, and the Arizona high desert. Sandstone under hard sun.' },
  { year: '2024', title: 'Florida Coast', description: 'Miami and Orlando. Humid blues, neon greens, salt-bleached pastels.' },
  { year: '2023', title: 'Started Photography', description: 'First camera. First frame I cared about. Archive begins here.' },
];

interface Props {
  settings?: SiteSettings;
}

export default function AboutPage({ settings }: Props) {
  const name      = settings?.name      ?? 'Ryan Xu';
  const bio       = settings?.bio       ?? null;
  const avatarUrl = settings?.avatarUrl ?? 'https://cdn.sanity.io/images/z610fooo/production/926d2d1c1fcba0de3a1b45fd60b64e7fce7ce650-3300x2200.jpg?auto=format&w=400&h=400&fit=crop&crop=right&q=80';
  const email     = settings?.email     ?? 'ryan2420159421@gmail.com';
  const instagram = settings?.instagram ?? 'https://www.instagram.com/ryan_photoo/';
  const timeline  = (settings?.timeline?.length ?? 0) > 0
    ? settings!.timeline!
    : FALLBACK_TIMELINE;
  const reduce = useReducedMotion();
  const igHandle = '@' + (instagram.replace(/\/+$/, '').split('/').pop() || 'instagram');
  const heroItem = makeHeroItem(!!reduce);

  // Same weighty inertial smooth-scroll as the homepage, so browsing About
  // feels identical. Torn down on unmount (route change); no-op under reduced-motion.
  useEffect(() => {
    const { destroy } = startLenis();
    return destroy;
  }, []);

  // Editorial "contributor cover" entrance — plays once on arrival, then
  // peels away to reveal the page.
  const [coverGone, setCoverGone] = useState(!!reduce);
  useEffect(() => {
    const t = setTimeout(() => setCoverGone(true), 1150);
    return () => clearTimeout(t);
  }, []);

  // Timeline rail draws itself when the log scrolls into view (not at mount,
  // where it would finish unseen below the fold).
  const [timelineRef, timelineShown] = useInViewOnce<HTMLOListElement>();

  return (
    <div className="relative bg-[#282c20] text-[#F4F4ED] min-h-[100dvh]">

      {/* ═══════ Entrance — magazine "contributor" cover ═══════ */}
      <AnimatePresence>
        {!coverGone && (
          <motion.div
            key="about-cover"
            initial={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ duration: 0.85, ease: [0.76, 0, 0.24, 1] }}
            className="fixed inset-0 z-[60] bg-[#282c20] text-[#F4F4ED] overflow-hidden"
          >
            {/* Cool accent wash (grain removed) */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(52vmax 42vmax at 20% 112%, rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.10), transparent 68%)' }}
            />
            {/* Newspaper column rules */}
            <div className="absolute inset-0 grid grid-cols-4 opacity-50 pointer-events-none">
              {[0, 1, 2, 3].map((i) => (
                <motion.span
                  key={i}
                  className="origin-top"
                  style={{ borderRight: i === 3 ? '0' : '1px solid rgba(255,255,255,0.05)' }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.7, delay: 0.05 + i * 0.06, ease: expo }}
                />
              ))}
            </div>

            {/* Masthead */}
            <motion.div
              className="absolute"
              style={{ top: 'clamp(1.5rem,4vh,3rem)', left: 'clamp(1.5rem,5vw,4rem)', right: 'clamp(1.5rem,5vw,4rem)' }}
              initial={{ clipPath: 'inset(0 100% 0 0)' }}
              animate={{ clipPath: 'inset(0 0% 0 0)' }}
              transition={{ duration: 0.65, delay: 0.1, ease: expo }}
            >
              <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-white/20 font-ui text-[10px] tracking-[0.42em] uppercase">
                <span className="font-medium text-white/60">The Journal Gallery</span>
                <span className="text-white/35">The Profile</span>
              </div>
              <div className="mt-[3px] border-b border-white/10" />
            </motion.div>

            {/* Center block */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center" style={{ paddingLeft: '6vw', paddingRight: '6vw' }}>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.22, ease: expo }}
                className="font-ui text-[11px] tracking-[0.5em] uppercase"
                style={{ color: 'rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.85)' }}
              >
                Photographer
              </motion.span>
              <h1 className="m-0 overflow-hidden" style={{ padding: '0.04em 0.02em' }}>
                <motion.span
                  initial={{ y: '110%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.85, delay: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-block font-serif uppercase font-normal leading-[0.92] tracking-tight text-white/[0.98]"
                  style={{ fontSize: 'clamp(52px,12vw,150px)' }}
                >
                  {name}
                </motion.span>
              </h1>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.46, ease: expo }}
                className="flex items-center gap-3 font-ui text-[10px] tracking-[0.34em] uppercase text-white/40"
              >
                <span>New York, NY</span>
              </motion.div>
            </div>

            {/* Folio — camera EXIF line for the photography theme */}
            <motion.div
              className="absolute flex items-baseline justify-between gap-4 pt-2 border-t border-white/20 font-ui text-[10px] tracking-[0.42em] uppercase text-white/35"
              style={{ bottom: 'clamp(1.5rem,4vh,3rem)', left: 'clamp(1.5rem,5vw,4rem)', right: 'clamp(1.5rem,5vw,4rem)' }}
              initial={{ clipPath: 'inset(0 0 0 100%)' }}
              animate={{ clipPath: 'inset(0 0 0 0%)' }}
              transition={{ duration: 0.65, delay: 0.12, ease: expo }}
            >
              <span className="text-[13px] tracking-[0.2em] text-white/55">Contributor</span>
              <span className="hidden sm:block">Nikon Zf · Fujifilm X-T50</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════ Page content (above the texture layer) ═══════ */}
      <div className="relative z-10">

      {/* ═══════ HERO — editorial split: portrait left, profile right ═══════ */}
      <section className="pt-28 md:pt-36 pb-10 md:pb-14 px-6 md:px-16 max-w-5xl mx-auto">
        {/* Running head / folio bar */}
        <motion.div
          className="flex items-baseline justify-between border-b border-white/10 pb-3 mb-10 md:mb-14 font-ui text-[10px] tracking-[0.32em] uppercase text-white/35"
          variants={heroItem}
          custom={0}
          initial="hidden"
          animate={coverGone ? 'show' : 'hidden'}
        >
          <span className="text-white/55">The Profile</span>
          <span>New York · Since 2023</span>
        </motion.div>

        <div className="grid md:grid-cols-12 gap-10 md:gap-12 items-start">

          {/* ── LEFT: editorial portrait + stacked meta ── */}
          <div className="md:col-span-5 flex flex-col items-start gap-7">
            {/* Avatar — a living droplet: the photo is masked in an organic
                water-drop shape that slowly morphs (CSS keyframes, PRM-gated in
                global.css); a second, offset droplet OUTLINE in lime drifts on a
                desynced phase behind it — the "border" is water, not a box. */}
            <motion.div
              className="group relative w-48 md:w-60"
              initial={{ opacity: 0, y: 22, scale: 0.975 }}
              animate={coverGone ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 22, scale: 0.975 }}
              transition={{ duration: 1.15, delay: 0.1, ease: expo }}
            >
              {/* Whole droplet (outline + image) scales as ONE unit on its own
                  GPU layer — a slow, gentle push-in. NOTE: Tailwind v4 sets the
                  standalone `scale` property (not `transform`), so the transition
                  MUST name `scale` — transitioning `transform` leaves it snapping. */}
              <div
                className="relative w-full group-hover:scale-[1.03]"
                style={{
                  transition: 'scale 1.1s cubic-bezier(0.4, 0, 0.2, 1)',
                  transformOrigin: 'center center',
                  willChange: 'scale',
                  backfaceVisibility: 'hidden',
                }}
              >
                <span
                  aria-hidden
                  className="absolute -inset-2.5 animate-blob-morph border"
                  style={{
                    borderColor: 'rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.35)',
                    borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
                    animationDelay: '-4s',
                  }}
                />
                <div
                  className="relative aspect-[4/5] w-full overflow-hidden animate-blob-morph bg-white/5"
                  style={{ borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' }}
                >
                  <img
                    src={avatarUrl}
                    alt={name}
                    className="w-full h-full object-cover object-right grayscale-[0.2]"
                    loading="eager"
                    decoding="async"
                    draggable={false}
                  />
                  <div aria-hidden className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#282c20]/40 via-transparent to-transparent" />
                </div>
              </div>
            </motion.div>

            {/* Stacked identity meta — one fact per line (no middle-dot pileup) */}
            <motion.dl
              className="font-ui text-[11px] leading-relaxed text-white/45 space-y-1.5"
              variants={heroItem}
              custom={0.34}
              initial="hidden"
              animate={coverGone ? 'show' : 'hidden'}
            >
              <div className="text-white/70">Photographer</div>
              <div>New York, NY</div>
              <div>Fujifilm X-T50 · Nikon Zf</div>
              <div className="pt-2.5 mt-1 border-t border-white/10 tracking-[0.3em] uppercase text-white/30 text-[10px]">
                Since 2023
              </div>
            </motion.dl>
          </div>

          {/* ── RIGHT: name + lede + bio ── */}
          <div className="md:col-span-7">
            {/* Name — fades up as part of the top-to-bottom entrance cascade */}
            <motion.h1
              className="text-6xl md:text-7xl lg:text-8xl font-serif uppercase text-[#F4F4ED] tracking-tighter leading-[1.1] pb-2"
              variants={heroItem}
              custom={0.1}
              initial="hidden"
              animate={coverGone ? 'show' : 'hidden'}
            >
              <span className="draw-underline heat-glow" style={{ ['--draw-delay' as never]: '1.4s', ['--glow-intensity' as never]: 0.45 }}>{name}</span>
            </motion.h1>

            {/* Lede — a single serif statement, the page thesis */}
            <motion.p
              className="mt-5 font-serif italic text-xl md:text-2xl text-white/75 leading-snug max-w-[24ch]"
              variants={heroItem}
              custom={0.22}
              initial="hidden"
              animate={coverGone ? 'show' : 'hidden'}
            >
              Cities and landscapes, one frame at a time.
            </motion.p>

            {/* Bio — prose section. Override the fallback by filling
                 `siteSettings.bio` in Sanity Studio. */}
            {bio ? (
              <motion.div
                className="mt-7"
                variants={heroItem}
                custom={0.34}
                initial="hidden"
                animate={coverGone ? 'show' : 'hidden'}
              >
                <p className="text-[15px] text-white/55 font-light leading-relaxed max-w-[60ch] whitespace-pre-line">
                  {bio}
                </p>
              </motion.div>
            ) : (
              <motion.div
                className="mt-7 space-y-4 text-[14.5px] md:text-[15px] text-white/55 font-light leading-[1.75] max-w-[60ch]"
                variants={heroItem}
                custom={0.34}
                initial="hidden"
                animate={coverGone ? 'show' : 'hidden'}
              >
                <p>
                  A photographic record of moving through cities and
                  landscapes, from the high-contrast geometry of Manhattan to
                  the geologic time of the American Southwest. No commissioned
                  work, no client briefs. Frames selected on a slow timeline,
                  organized by location, dated.
                </p>
                <p>
                  Off the camera: engineering and AI research. The discipline
                  of careful observation transfers between the two; both
                  reward patience over output volume. This site is one node in
                  a personal archive, not a portfolio for hire.
                </p>

                {/* Terse system signature below the prose */}
                <div className="space-y-2.5 max-w-md font-ui text-[12px] pt-5 mt-1 border-t border-white/5">
                  <div className="flex items-baseline gap-4">
                    <span className="text-white/30 tracking-[0.3em] uppercase shrink-0 w-16">Focus</span>
                    <span className="text-white/60">Light. Geometry. Stillness.</span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span className="text-white/30 tracking-[0.3em] uppercase shrink-0 w-16">Method</span>
                    <span className="text-white/60">One frame at a time. Real shutter, real exposure.</span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span className="text-white/30 tracking-[0.3em] uppercase shrink-0 w-16">Log</span>
                    <span className="text-white/60">Personal archive, selected frames only.</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════ TIMELINE — vertical editorial log ═══════ */}
      <section className="px-6 md:px-16 max-w-3xl mx-auto py-12 md:py-16 border-t border-white/5">
        <Reveal>
          <p className="font-ui text-[10px] tracking-[0.4em] uppercase text-white/30 mb-3">The Log</p>
          <h2 className="text-3xl md:text-4xl font-serif uppercase text-[#F4F4ED] tracking-tight py-1 mb-8">
            Timeline
          </h2>
        </Reveal>

        <ol ref={timelineRef} className="relative ml-1.5">
          <span className={`absolute left-0 top-0 h-full w-px bg-white/12 origin-top ${timelineShown ? 'animate-line-grow' : 'scale-y-0'}`} aria-hidden="true" />
          {timeline.map((item, i) => (
            <li
              key={`${item.year}-${i}`}
              className="relative pl-8 pb-9 last:pb-0 group"
            >
              <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white/20 bg-[#30352a] transition-[border-color,box-shadow] duration-500 group-hover:border-[rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.9)] group-hover:shadow-[0_0_10px_rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.5)]" />
              <Reveal y={18} delay={Math.min(i * 0.06, 0.18)}>
                <span className="font-ui text-[10px] text-white/30 tracking-[0.2em]">{item.year}</span>
                <h3 className="text-lg md:text-xl font-serif uppercase text-[#F4F4ED] mt-1 tracking-tight">
                  {item.title}
                </h3>
                <p className="text-[13.5px] text-white/45 font-light mt-1.5 leading-relaxed max-w-[55ch]">
                  {item.description}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* ═══════ CONTACT — Lando-style closing card: statement + signature,
           portrait centred between PAGES / FOLLOW columns, lime pill, © bar ═══════ */}
      <section className="relative mt-14 md:mt-20 px-3 md:px-6">
        <div className="relative rounded-t-[2.5rem] md:rounded-t-[5rem] bg-[#20241a] ring-1 ring-white/[0.05] overflow-hidden px-6 md:px-14 pt-14 md:pt-20 pb-6">
          {/* Statement + signature scribble */}
          <Reveal className="relative z-10 text-center">
            <SignatureScrub className="mx-auto block w-[clamp(140px,17vw,220px)] -rotate-6 translate-x-[3%] mb-1" />
            <h2 className="font-ui font-bold uppercase tracking-[-0.02em] leading-[0.96] text-[#F4F4ED]" style={{ fontSize: 'clamp(40px, 6.4vw, 96px)' }}>
              Always <span className="font-serif italic font-normal" style={{ color: '#b2c73a' }}>chasing</span>
              <br />
              the <span className="font-serif italic font-normal" style={{ color: 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))' }}>light.</span>
            </h2>
          </Reveal>

          {/* Columns — PAGES | GET IN TOUCH | FOLLOW ON */}
          <div className="relative z-10 mt-12 md:mt-16 grid grid-cols-2 md:grid-cols-3 gap-y-10 items-center">
            {/* PAGES */}
            <Reveal className="text-center md:text-left md:pl-[8%]">
              <p className="font-ui text-[9px] tracking-[0.4em] uppercase text-white/30 mb-4">Pages</p>
              <ul className="space-y-1.5 font-ui font-bold uppercase tracking-[0.08em] text-lg md:text-xl text-white/85">
                {[['Home', '/'], ['Map', '/travel'], ['About', '/about']].map(([label, href]) => (
                  <li key={href}>
                    <a href={href} className="group inline-block">
                      <FlipLine text={label} hoverClassName="text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]" />
                    </a>
                  </li>
                ))}
              </ul>
            </Reveal>

            {/* Centre — the lime enquiry pill takes the middle slot (the hero
                already owns the one portrait on this page) */}
            <Reveal delay={0.06} className="order-last md:order-none col-span-2 md:col-span-1 flex justify-center">
              <Magnetic strength={0.5}>
                <a
                  href={`mailto:${email}`}
                  className="group inline-flex items-center gap-2 px-7 py-3 rounded-full text-[12px] font-bold tracking-[0.18em] uppercase text-[#111112] transition-transform duration-300 hover:scale-[1.03] active:scale-[0.98]"
                  style={{ background: 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))' }}
                >
                  <FlipLine text="Get in touch" />
                  <span aria-hidden="true" className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
                </a>
              </Magnetic>
            </Reveal>

            {/* FOLLOW ON */}
            <Reveal delay={0.1} className="text-center md:text-right md:pr-[8%]">
              <p className="font-ui text-[9px] tracking-[0.4em] uppercase text-white/30 mb-4">Follow on</p>
              <ul className="space-y-1.5 font-ui font-bold uppercase tracking-[0.08em] text-lg md:text-xl text-white/85">
                <li>
                  <a href={instagram} target="_blank" rel="noopener noreferrer" className="group inline-block">
                    <FlipLine text="Instagram" hoverClassName="text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]" />
                  </a>
                </li>
                <li>
                  <a href={`mailto:${email}`} className="group inline-block">
                    <FlipLine text="Email" hoverClassName="text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]" />
                  </a>
                </li>
              </ul>
            </Reveal>
          </div>

          {/* Bottom bar */}
          <div className="relative z-10 mt-12 pt-5 border-t border-white/10 flex flex-col md:flex-row gap-2 items-center justify-between font-ui text-[9px] tracking-[0.25em] uppercase text-white/30">
            <span>© {new Date().getFullYear()} {name}. All rights reserved.</span>
            <a href="/" className="hover:text-white/60 transition-colors duration-300">ryanxugallery.com</a>
          </div>
        </div>
      </section>

      </div>
    </div>
  );
}
