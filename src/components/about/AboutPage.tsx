import { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import type { Collection, SiteSettings, TimelineItem } from '../../types';
import Magnetic from '../shared/Magnetic';
import { startLenis } from '../../lib/smoothScroll';
import { useInViewOnce } from '../../lib/useInViewOnce';

const expo = [0.16, 1, 0.3, 1] as const;

// One continuous animation mask travels through the complete autograph. The
// visible mark still comes from the rounded source asset, so the connector
// curves can bridge blank pixels without changing the finished silhouette.
const SIGNATURE_REVEAL_PATH = 'M21.7,53.28 C1.97,58.33 5.74,51.92 11.58,47.08 C17.75,41.97 26.22,38.61 34.44,35.47 C49.89,29.57 64.44,24.43 79.74,20.04 C108.54,11.78 140.03,6.17 170.64,4.31 C177.88,3.87 185.08,3.64 193.66,4.29 C202.79,4.98 213.49,6.67 215.5,10.1 C217.76,13.93 209.16,19.94 200.95,23.22 C193.36,26.25 186.09,26.94 177.5,28.97 C168.64,31.06 158.38,34.56 161.35,36.97 C162.74,38.1 167.03,39 169.45,40.22 C172.16,41.59 172.54,43.37 171.24,45.22 C165.95,52.73 132.97,61.35 131.61,71.34 C110,74 77,72 55.28,70.5 C73.66,48.15 98.7,50.3 122.8,44.62 C128.63,43.25 134.39,41.42 140.22,40.17 C145.87,38.95 151.57,38.28 157.28,38.48 C169.43,38.89 181.58,43.23 191.11,35.35 C171,31.5 143,30.5 122.61,34.13 C99.81,47.75 111.76,48.45 122.09,46.09 C132.14,43.78 140.66,38.58 151.81,37.29 C157.28,36.65 163.39,36.96 167.36,38.61 C169.29,39.42 170.72,40.54 171.54,42.05 C172.51,43.86 172.62,46.24 173.38,47.92 C175.97,53.65 186.15,51.47 196.23,49.32 C235.5,40.91 273.31,32.73 315.57,38.08';

function SignatureScrub({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion();
  const signatureRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: signatureRef,
    // Explicit percentages keep Framer from interpreting the second edge as
    // pixels. Finish with room before the document bottom, while preserving a
    // long reversible writing range on both phones and desktop.
    offset: ['start 94%', 'end 52%'],
  });
  const drawLength = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.35 });
  const drawOpacity = useTransform(scrollYProgress, [0, 0.035], [0, 1], { clamp: true });

  return (
    <div ref={signatureRef} className={className}>
      <svg
        viewBox="0 0 320 84"
        aria-hidden="true"
        focusable="false"
        className="block h-auto w-full"
        style={{ overflow: 'visible', filter: 'drop-shadow(0 0 7px rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.24))' }}
      >
        {!reduce && (
          <defs>
            <mask id="signature-reveal-mask" x="0" y="0" width="320" height="84" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style={{ maskType: 'alpha' }}>
              <rect x="0" y="0" width="320" height="84" fill="transparent" />
              <motion.path
                d={SIGNATURE_REVEAL_PATH}
                fill="none"
                stroke="white"
                strokeWidth="14"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pathLength: drawLength, opacity: drawOpacity }}
              />
            </mask>
          </defs>
        )}
        <image
          href="/assets/signature/abstract-autograph-rounded.png"
          x="0"
          y="0"
          width="320"
          height="84"
          preserveAspectRatio="none"
          mask={reduce ? undefined : 'url(#signature-reveal-mask)'}
        />
      </svg>
    </div>
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

type ArchiveCollection = Pick<Collection, '_id' | 'name' | 'location' | 'year' | 'photoCount'>;

/** Build the fallback log from the same collection records shown elsewhere.
 *  If no dated archive data is available, the section is omitted instead of
 *  presenting an invented or stale year. */
function timelineFromCollections(collections: ArchiveCollection[]): TimelineItem[] {
  const byYear = new Map<number, ArchiveCollection[]>();
  collections.forEach((collection) => {
    const year = Number(collection.year);
    if (!Number.isFinite(year) || (collection.photoCount ?? 0) < 1) return;
    byYear.set(year, [...(byYear.get(year) || []), collection]);
  });

  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, entries]) => {
      const names = [...new Set(entries.map(({ name }) => name).filter(Boolean))];
      const frameCount = entries.reduce((sum, entry) => sum + (entry.photoCount || 0), 0);
      const frameLabel = `${frameCount} selected frame${frameCount === 1 ? '' : 's'}.`;
      const only = entries.length === 1 ? entries[0] : null;
      const distinctLocation = only?.location
        && only.location.trim().toLocaleLowerCase() !== only.name.trim().toLocaleLowerCase()
        ? only.location.trim()
        : '';

      return {
        year: String(year),
        title: names.length === 1 ? names[0] : 'Archive Chapters',
        description: names.length === 1
          ? `${distinctLocation ? `${distinctLocation}. ` : ''}${frameLabel}`
          : `${names.join(', ')}. ${frameLabel}`,
      };
    });
}

interface Props {
  settings?: SiteSettings;
  collections?: ArchiveCollection[];
}

export default function AboutPage({ settings, collections = [] }: Props) {
  const name      = settings?.name      ?? 'Ryan Xu';
  const bio       = settings?.bio       ?? null;
  const avatarUrl = settings?.avatarUrl ?? 'https://cdn.sanity.io/images/z610fooo/production/926d2d1c1fcba0de3a1b45fd60b64e7fce7ce650-3300x2200.jpg';
  const email     = settings?.email     ?? 'ryan2420159421@gmail.com';
  const instagram = settings?.instagram ?? 'https://www.instagram.com/ryan_photoo/';
  const timeline  = (settings?.timeline?.length ?? 0) > 0
    ? settings!.timeline!
    : timelineFromCollections(collections);
  const reduce = useReducedMotion();
  const igHandle = '@' + (instagram.replace(/\/+$/, '').split('/').pop() || 'instagram');
  const heroItem = makeHeroItem(!!reduce);
  const avatarIsSanity = avatarUrl.includes('cdn.sanity.io/images/');
  const avatarBase = avatarUrl.split('?')[0];
  const avatarSized = (width: number) => `${avatarBase}?auto=format&w=${width}&q=82`;
  const avatarSrc = avatarIsSanity ? avatarSized(720) : avatarUrl;
  const avatarSrcSet = avatarIsSanity
    ? [480, 720, 960].map((width) => `${avatarSized(width)} ${width}w`).join(', ')
    : undefined;
  const avatarRef = useRef<HTMLDivElement>(null);
  const [avatarInView, setAvatarInView] = useState(true);

  useEffect(() => {
    if (reduce || typeof IntersectionObserver === 'undefined') {
      setAvatarInView(true);
      return;
    }
    const avatar = avatarRef.current;
    if (!avatar) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAvatarInView(Boolean(entry?.isIntersecting)),
      { rootMargin: '120px 0px' },
    );
    observer.observe(avatar);
    return () => observer.disconnect();
  }, [reduce]);

  // Same weighty inertial smooth-scroll as the homepage, so browsing About
  // feels identical. Torn down on unmount (route change); no-op under reduced-motion.
  useEffect(() => {
    const { destroy } = startLenis();
    return destroy;
  }, [reduce]);

  // Editorial "contributor cover" entrance — plays once on arrival, then
  // peels away to reveal the page.
  const [coverGone, setCoverGone] = useState(!!reduce);
  const [coverExited, setCoverExited] = useState(!!reduce);
  useEffect(() => {
    if (reduce) {
      setCoverGone(true);
      setCoverExited(true);
      return;
    }
    setCoverExited(false);
    setCoverGone(false);
    const t = setTimeout(() => setCoverGone(true), 1150);
    return () => clearTimeout(t);
  }, [reduce]);

  // The contributor cover is a real opening plane. Keep the shared nav and
  // page links out of the keyboard/assistive-tech order until it has cleared.
  useEffect(() => {
    let nav: HTMLElement | null = null;
    let secondFrame = 0;
    const apply = () => {
      nav = document.querySelector<HTMLElement>('[data-site-nav]');
      if (!nav) return;
      if (!coverExited) {
        nav.inert = true;
        nav.setAttribute('aria-hidden', 'true');
      } else {
        nav.inert = false;
        nav.removeAttribute('aria-hidden');
      }
    };
    // Nav and About are separate React islands. Wait until both have hydrated
    // before adding transient attributes, otherwise React sees an SSR mismatch.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(apply);
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      if (nav) {
        nav.inert = false;
        nav.removeAttribute('aria-hidden');
      }
    };
  }, [coverExited]);

  // Timeline rail draws itself when the log scrolls into view (not at mount,
  // where it would finish unseen below the fold).
  const [timelineRef, timelineShown] = useInViewOnce<HTMLOListElement>();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative min-h-[100dvh] bg-[#282c20] text-[#F4F4ED] focus:outline-none"
    >

      {/* ═══════ Entrance — magazine "contributor" cover ═══════ */}
      <AnimatePresence onExitComplete={() => setCoverExited(true)}>
        {!coverGone && (
          <motion.div
            key="about-cover"
            aria-hidden="true"
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
              style={{
                top: 'clamp(1.5rem,4vh,3rem)',
                left: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-left))',
                right: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-right))',
              }}
              initial={{ clipPath: 'inset(0 100% 0 0)' }}
              animate={{ clipPath: 'inset(0 0% 0 0)' }}
              transition={{ duration: 0.65, delay: 0.1, ease: expo }}
            >
              <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-white/20 font-ui text-[10px] tracking-[0.42em] uppercase">
                <span className="font-medium text-white/60">The Journal Gallery</span>
                <span className="text-white/58">The Profile</span>
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
              <div className="m-0 overflow-hidden" style={{ padding: '0.04em 0.02em' }}>
                <motion.span
                  initial={{ y: '110%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.85, delay: 0.32, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-block font-serif uppercase font-normal leading-[0.92] tracking-tight text-white/[0.98]"
                  style={{ fontSize: 'clamp(52px,12vw,150px)' }}
                >
                  {name}
                </motion.span>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.46, ease: expo }}
                className="flex items-center gap-3 font-ui text-[10px] tracking-[0.34em] uppercase text-white/58"
              >
                <span>New York, NY</span>
              </motion.div>
            </div>

            {/* Folio — camera EXIF line for the photography theme */}
            <motion.div
              className="absolute flex items-baseline justify-between gap-4 pt-2 border-t border-white/20 font-ui text-[10px] tracking-[0.42em] uppercase text-white/58"
              style={{
                bottom: 'max(clamp(1.5rem,4vh,3rem), env(safe-area-inset-bottom))',
                left: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-left))',
                right: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-right))',
              }}
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
      <div className="relative z-10" inert={!coverExited} aria-hidden={!coverExited}>

      {/* ═══════ HERO — editorial split: portrait left, profile right ═══════ */}
      <section className="safe-inline-page pt-28 md:pt-36 pb-10 md:pb-14 max-w-5xl mx-auto">
        {/* Running head / folio bar */}
        <motion.div
          className="flex items-baseline justify-between border-b border-white/10 pb-3 mb-10 md:mb-14 font-ui text-[10px] tracking-[0.32em] uppercase text-white/52"
          variants={heroItem}
          custom={0}
          initial="hidden"
          animate={coverGone ? 'show' : 'hidden'}
        >
          <span className="text-white/55">The Profile</span>
          <span className="md:hidden">NY · 2023</span>
          <span className="hidden md:inline">New York · Since 2023</span>
        </motion.div>

        <div className="grid md:grid-cols-12 gap-10 md:gap-12 items-start">

          {/* ── LEFT: editorial portrait + stacked meta ── */}
          <div className="md:col-span-5 flex flex-col items-start gap-7">
            {/* Avatar — a living droplet: the photo is masked in an organic
                water-drop shape that slowly morphs (CSS keyframes, PRM-gated in
                global.css); a second, offset droplet OUTLINE in lime drifts on a
                desynced phase behind it — the "border" is water, not a box. */}
            <motion.div
              ref={avatarRef}
              className="group relative mx-auto w-48 md:mx-0 md:w-60"
              initial={reduce ? false : { opacity: 0, y: 22, scale: 0.975 }}
              animate={coverGone ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 22, scale: 0.975 }}
              transition={{ duration: reduce ? 0 : 1.15, delay: reduce ? 0 : 0.1, ease: expo }}
            >
              {/* Whole droplet (outline + image) scales as ONE unit on its own
                  GPU layer — a slow, gentle push-in. NOTE: Tailwind v4 sets the
                  standalone `scale` property (not `transform`), so the transition
                  MUST name `scale` — transitioning `transform` leaves it snapping. */}
              <div
                className={`relative w-full ${reduce ? '' : 'group-hover:scale-[1.03]'}`}
                style={{
                  transition: 'scale 1.1s cubic-bezier(0.4, 0, 0.2, 1)',
                  transformOrigin: 'center center',
                  willChange: reduce || !avatarInView ? 'auto' : 'scale',
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
                    animationPlayState: avatarInView ? 'running' : 'paused',
                  }}
                />
                <div
                  className="relative aspect-[4/5] w-full overflow-hidden animate-blob-morph bg-white/5"
                  style={{
                    borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
                    animationPlayState: avatarInView ? 'running' : 'paused',
                  }}
                >
                  <img
                    src={avatarSrc}
                    srcSet={avatarSrcSet}
                    sizes="(min-width: 768px) 240px, 192px"
                    alt={name}
                    width={720}
                    height={900}
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
            <motion.div
              className="font-ui text-[11px] leading-relaxed text-white/58 space-y-1.5"
              variants={heroItem}
              custom={0.34}
              initial="hidden"
              animate={coverGone ? 'show' : 'hidden'}
            >
              <div className="text-white/70">Photographer</div>
              <div>New York, NY</div>
              <div>Fujifilm X-T50 · Nikon Zf</div>
              <div className="pt-2.5 mt-1 border-t border-white/10 tracking-[0.3em] uppercase text-white/52 text-[10px]">
                Since 2023
              </div>
            </motion.div>
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
                    <span className="text-white/52 tracking-[0.3em] uppercase shrink-0 w-16">Focus</span>
                    <span className="text-white/60">Light. Geometry. Stillness.</span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span className="text-white/52 tracking-[0.3em] uppercase shrink-0 w-16">Method</span>
                    <span className="text-white/60">One frame at a time. Real shutter, real exposure.</span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span className="text-white/52 tracking-[0.3em] uppercase shrink-0 w-16">Log</span>
                    <span className="text-white/60">Personal archive, selected frames only.</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════ TIMELINE — vertical editorial log ═══════ */}
      {timeline.length > 0 && (
        <section className="safe-inline-page max-w-3xl mx-auto py-12 md:py-16 border-t border-white/5">
          <Reveal>
            <p className="font-ui text-[10px] tracking-[0.4em] uppercase text-white/52 mb-3">The Log</p>
            <h2 className="text-3xl md:text-4xl font-serif uppercase text-[#F4F4ED] tracking-tight py-1 mb-8">
              Timeline
            </h2>
          </Reveal>

          <ol ref={timelineRef} className="relative ml-1.5">
            <span className={`absolute left-0 top-0 h-full w-px bg-white/12 origin-top ${timelineShown ? 'animate-line-grow' : 'scale-y-0'}`} aria-hidden="true" />
            {timeline.map((item, i) => (
              <li
                key={`${item.year}-${item.title}-${i}`}
                className="relative pl-8 pb-9 last:pb-0 group"
              >
                <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white/20 bg-[#30352a] transition-[border-color,box-shadow] duration-500 group-hover:border-[rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.9)] group-hover:shadow-[0_0_10px_rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.5)]" />
                <Reveal y={18} delay={Math.min(i * 0.06, 0.18)}>
                  <span className="font-ui text-[10px] text-white/52 tracking-[0.2em]">{item.year}</span>
                  <h3 className="text-lg md:text-xl font-serif uppercase text-[#F4F4ED] mt-1 tracking-tight">
                    {item.title}
                  </h3>
                  <p className="text-[13.5px] text-white/58 font-light mt-1.5 leading-relaxed max-w-[55ch]">
                    {item.description}
                  </p>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ═══════ CONTACT — Lando-style closing card: statement + signature,
           portrait centred between PAGES / FOLLOW columns, lime pill, © bar ═══════ */}
      <section className="safe-inline-page relative mt-14 md:mt-20">
        <div className="relative rounded-t-[2.5rem] md:rounded-t-[5rem] bg-[#20241a] ring-1 ring-white/[0.05] overflow-hidden px-6 md:px-14 pt-14 md:pt-20 pb-6">
          {/* Statement + signature scribble */}
          <Reveal className="relative z-10 text-center">
            <SignatureScrub className="mx-auto mb-1 block w-[clamp(260px,31vw,440px)] max-w-full -rotate-[0.75deg] translate-x-[1%] select-none" />
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
              <p className="font-ui text-[9px] tracking-[0.4em] uppercase text-white/52 mb-4">Pages</p>
              <ul className="space-y-1.5 font-ui font-bold uppercase tracking-[0.08em] text-lg md:text-xl text-white/85">
                {[['Home', '/'], ['Map', '/travel'], ['About', '/about']].map(([label, href]) => (
                  <li key={href}>
                    <a href={href} className="group inline-flex min-h-11 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00]">
                      <FlipLine text={label} hoverClassName="text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]" />
                    </a>
                  </li>
                ))}
              </ul>
            </Reveal>

            {/* Centre — the lime enquiry pill takes the middle slot (the hero
                already owns the one portrait on this page) */}
            <Reveal delay={0.06} className="order-last md:order-none col-span-2 md:col-span-1 flex justify-center">
              <Magnetic strength={0.34}>
                <a
                  href={`mailto:${email}`}
                  className="group inline-flex min-h-11 items-center gap-2 px-7 py-3 rounded-full text-[12px] font-bold tracking-[0.18em] uppercase text-[#111112] transition-transform duration-300 hover:scale-[1.03] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#F4F4ED]"
                  style={{ background: 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))' }}
                >
                  <FlipLine text="Get in touch" />
                  <span aria-hidden="true" className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
                </a>
              </Magnetic>
            </Reveal>

            {/* FOLLOW ON */}
            <Reveal delay={0.1} className="text-center md:text-right md:pr-[8%]">
              <p className="font-ui text-[9px] tracking-[0.4em] uppercase text-white/52 mb-4">Follow on</p>
              <ul className="space-y-1.5 font-ui font-bold uppercase tracking-[0.08em] text-lg md:text-xl text-white/85">
                <li>
                  <a href={instagram} target="_blank" rel="noopener noreferrer" className="group inline-flex min-h-11 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00]">
                    <FlipLine text="Instagram" hoverClassName="text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]" />
                  </a>
                </li>
                <li>
                  <a href={`mailto:${email}`} className="group inline-flex min-h-11 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00]">
                    <FlipLine text="Email" hoverClassName="text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]" />
                  </a>
                </li>
              </ul>
            </Reveal>
          </div>

          {/* Bottom bar */}
          <div className="relative z-10 mt-12 pt-5 border-t border-white/10 flex flex-col md:flex-row gap-2 items-center justify-between font-ui text-[9px] tracking-[0.25em] uppercase text-white/52">
            <span>© {new Date().getFullYear()} {name}. All rights reserved.</span>
            <a href="/" className="inline-flex min-h-11 items-center hover:text-white/70 transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00]">ryanxugallery.com</a>
          </div>
        </div>
      </section>

      </div>
    </main>
  );
}
