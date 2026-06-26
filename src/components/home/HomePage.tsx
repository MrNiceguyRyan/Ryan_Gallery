import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion, type MotionValue } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';
import type { Collection } from '../../types';
import ParticleTitle from './ParticleTitle';
import SidebarItem from './SidebarItem';
import ArchiveChapter from './ArchiveChapter';
import RegionHeader from './RegionHeader';
import MagazineLayout from './MagazineLayout';
import Magnetic from '../shared/Magnetic';
import SiteAtmosphere from '../shared/SiteAtmosphere';
import Lenis from 'lenis';

/* Hero epigraphs — first sentences distilled from the per-collection
 * narratives in src/lib/narratives.tsx. The hero cycles through these
 * so the page itself "previews" what's in the archive, instead of
 * showing a single static tagline that says nothing specific. */
// Field-notes that open the homepage "journey" — each dispatch is grounded
// to the real place it was made, so the hero reads like a sequence of entries
// from across the archive rather than free-floating taglines.
const HERO_EPIGRAPHS = [
  { line: 'Manhattan light arrives sideways in the early hours.', place: 'New York' },
  { line: 'Sandstone narrows until sound itself goes muffled.', place: 'Zion' },
  { line: 'The Virgin River runs cold and milky green.', place: 'Zion' },
  { line: 'The Sonoran at midday offers nothing to hide behind.', place: 'Arizona' },
  { line: 'Pink limestone spires standing close together.', place: 'Bryce Canyon' },
  { line: 'Florida afternoon light is relentless and democratic.', place: 'Orlando' },
  { line: 'Ocean Drive at dusk exists in two registers.', place: 'Miami' },
];

const expo = [0.23, 1, 0.32, 1] as const;

interface Props {
  collections: Collection[];
}

/* A homepage section — a run of city chapters that share a `region`. Sections
 * with ≥2 cities get a divider header; single-city/untagged ones don't. Cities
 * stay the clickable unit (each opens its story directly). */
interface RegionSection {
  key: string;
  region: string | null;
  showHeader: boolean;
  frameCount: number;
  cities: Collection[];
}

/* ═══════════════════════════════════════════════════════
 *  MobileFilmstripItem — parallax mobile card
 * ═══════════════════════════════════════════════════════ */
function MobileFilmstripItem({
  coverBase,
  title,
  caption,
  onClick,
}: {
  coverBase: string;
  title: string;
  /** Optional sub-label, e.g. "2 places · 47 frames" for a region card. */
  caption?: string;
  onClick: () => void;
}) {
  // Mobile filmstrip — 100vw container, 28vh tall. Real device widths span 360–430 px
  // and Retina hits ~860 px; bracket 600 / 900 / 1200 and let the browser pick.
  const coverUrl     = coverBase ? `${coverBase}?auto=format&w=900&q=80` : '';
  const coverSrcSet  = coverBase
    ? `${coverBase}?auto=format&w=600&q=80 600w, ${coverBase}?auto=format&w=900&q=80 900w, ${coverBase}?auto=format&w=1200&q=78 1200w`
    : undefined;

  // Scroll parallax — the cover drifts inside its frame as the card passes
  // through the viewport, matching the desktop chapters. Image is sized h-[126%]
  // so the drift never exposes an edge. Disabled for reduced-motion.
  const cardRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: cardRef, offset: ['start end', 'end start'] });
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '-16%']);

  return (
    <motion.div
      ref={cardRef}
      onClick={onClick}
      whileInView="active"
      whileTap={{ scale: 0.985 }}
      viewport={{ margin: '-25% 0px -25% 0px' }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full h-[28vh] overflow-hidden cursor-pointer border-b border-white/5 block group"
    >
      {coverUrl && (
        <motion.img
          src={coverUrl}
          srcSet={coverSrcSet}
          sizes="100vw"
          alt={title}
          style={{ y: imgY }}
          variants={{
            active: { scale: 1.08, filter: 'grayscale(0%)' },
          }}
          initial={{ filter: 'grayscale(100%)', scale: 1.02 }}
          transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 w-full h-[126%] object-cover object-center"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      )}
      <motion.div
        variants={{ active: { backgroundColor: 'rgba(0,0,0,0.2)' } }}
        initial={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        transition={{ duration: 1 }}
        className="absolute inset-0 transition-colors"
      />

      {/* Centered Title — clamps and shrinks to fit narrow screens */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 py-6 z-10 pointer-events-none">
        <h3 className="text-3xl sm:text-4xl text-white font-serif uppercase tracking-tighter text-center mix-blend-difference drop-shadow-lg leading-[1.05] break-words max-w-full">
          {title}
        </h3>
        {caption && (
          <span className="font-ui text-[8px] uppercase tracking-[0.35em] text-white/75 mix-blend-difference">
            {caption}
          </span>
        )}
      </div>

      {/* Tap affordance — always visible (touch has no hover), brightens
           and slides in when the card is the active one in view. */}
      <motion.div
        variants={{ active: { opacity: 1, x: 0 } }}
        initial={{ opacity: 0.6, x: 0 }}
        transition={{ duration: 0.7 }}
        className="absolute right-5 bottom-6 flex items-center gap-2 z-10 text-white"
      >
        <span className="rounded-full border border-white/25 bg-black/40 backdrop-blur-md px-3.5 py-1.5 text-[8px] uppercase tracking-[0.3em] font-bold flex items-center gap-1.5">
          Tap to open
          <ArrowRight size={11} />
        </span>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  CollapsedRegionStrip — compact "stowed" view of a region
 * ═══════════════════════════════════════════════════════ */
const STRIP_ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

/** A single stowed-region card. Hover is driven by Framer off one hover state
 *  so the dim-lift + gentle scale animate TOGETHER on one synced, eased
 *  timeline — no "flash then scale", identical feel to the collection covers. */
function StripCard({ c, onOpen }: { c: Collection; onOpen: (c: Collection) => void }) {
  const [hovered, setHovered] = useState(false);
  const url = c.coverImageUrl ?? c.photos?.[0]?.imageUrl ?? '';
  // One shared, gentle timeline for every hover property → moves as one piece.
  const ease = [0.16, 1, 0.3, 1] as const;
  const tween = { duration: 0.9, ease };

  return (
    <motion.button
      onClick={() => onOpen(c)}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      data-cursor="View Story"
      aria-label={`View ${c.name.trim()}`}
      animate={{ borderColor: hovered ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)' }}
      transition={tween}
      className="relative h-28 md:h-32 flex-1 min-w-[200px] overflow-hidden border cursor-none"
    >
      {url && (
        <motion.img
          src={`${url}?auto=format&w=600&q=70`}
          alt={c.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          animate={{ scale: hovered ? 1.05 : 1 }}
          transition={tween}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {/* Dim lift — opacity only, same timeline as the scale (no filter jank). */}
      <motion.div
        className="absolute inset-0 bg-[#282c20] pointer-events-none"
        animate={{ opacity: hovered ? 0.12 : 0.42 }}
        transition={tween}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent pointer-events-none" />
      {/* Accent baseline wipes in on hover */}
      <motion.span
        className="absolute left-0 right-0 bottom-0 h-[2px] origin-left"
        style={{ background: STRIP_ACCENT }}
        animate={{ scaleX: hovered ? 1 : 0 }}
        transition={tween}
      />
      <div className="absolute inset-x-0 bottom-0 p-4 flex items-baseline justify-between gap-2">
        <span className="font-serif uppercase text-xl md:text-2xl text-white tracking-tight truncate drop-shadow">
          {c.name.trim()}
        </span>
        <span className="font-ui text-[9px] text-white/50 tracking-widest shrink-0">
          {c.photoCount ?? c.photos?.length ?? 0}
        </span>
      </div>
    </motion.button>
  );
}

function CollapsedRegionStrip({
  cities,
  onOpen,
}: {
  cities: Collection[];
  onOpen: (c: Collection) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 w-full">
      {cities.map((c) => (
        <StripCard key={c._id} c={c} onOpen={onOpen} />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  HomePage — atmospheric dark archive
 * ═══════════════════════════════════════════════════════ */
/* Native-IO reveal trigger. The page-transition view-transition snapshot can
 * leave framer's `whileInView` observer stuck at `initial` (content never
 * un-hides), so below-fold reveals flip a flag from a real IntersectionObserver
 * instead — guaranteed to fire. Mirrors the Reveal pattern in AboutPage. */
function useInViewOnce<T extends Element>(rootMargin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null);
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (reduce) { setShown(true); return; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }),
      { rootMargin, threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);
  return [ref, shown] as const;
}

/* ═══════════════════════════════════════════════════════
 *  Kinetic big-type — the "distilled lens." line rises word-by-word
 *  on scroll PROGRESS (not whileInView), reversing on scroll-up.
 * ═══════════════════════════════════════════════════════ */
const SW_WORDS = ['Curating', 'the', 'world', 'through', 'a', 'distilled', 'lens.'] as const;

function RisingWord({
  word,
  index,
  progress,
  reduce,
  accent,
}: {
  word: string;
  index: number;
  progress: MotionValue<number>;
  reduce: boolean;
  accent?: boolean;
}) {
  const y = useTransform(progress, [index * 0.09, index * 0.09 + 0.4], ['110%', '0%'], { clamp: true });
  return (
    <span className="overflow-hidden inline-block align-bottom pb-[0.12em] -mb-[0.12em]">
      <motion.span
        className="inline-block"
        style={{
          y: reduce ? '0%' : y,
          color: accent ? 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))' : undefined,
        }}
      >
        {word}&nbsp;
      </motion.span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
 *  QuietIndexBand — a restrained marquee seam (landonorris-style),
 *  cooler/quieter than /travel's: one row, filled 14% type, em-dash
 *  separators, no glow. ONE name glows emerald — the live active
 *  chapter (or the first at top), a calm spotlight tied to scroll.
 * ═══════════════════════════════════════════════════════ */
function QuietIndexBand({
  names,
  activeArchiveId,
}: {
  names: { name: string; id: string | null }[];
  activeArchiveId: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const firstId = names.find((n) => n.id)?.id ?? null;
  const activeId = activeArchiveId ?? firstId;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.qm-name').forEach((el) => {
      el.classList.toggle('is-active', !!activeId && el.dataset.id === activeId);
    });
  }, [activeId, names]);

  if (!names.length) return null;

  const run = (key: string) => (
    <div className="flex shrink-0" aria-hidden="true" key={key}>
      {names.map((n, i) => (
        <span key={i} className="flex items-baseline">
          <span className="qm-name" data-id={n.id ?? ''}>
            {n.name}
          </span>
          <span className="qm-sep">&mdash;</span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="presentation"
      className="quiet-marquee w-full border-y py-3 md:py-4"
      style={{ borderColor: 'rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.10)' }}
    >
      <div className="quiet-marquee-track">
        {run('a')}
        {run('b')}
      </div>
    </div>
  );
}

export default function HomePage({ collections }: Props) {
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  // Region collapse ("收纳") — set of collapsed section keys. DEFAULT: every
  // multi-city region starts collapsed, so the homepage opens as a compact
  // index the visitor expands. Computed from the props up-front (no flash).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const counts = new Map<string, number>();
    for (const c of collections) {
      if ((c.photos?.length || 0) === 0) continue;
      const r = c.region?.trim();
      if (r) counts.set(r, (counts.get(r) || 0) + 1);
    }
    const init = new Set<string>();
    counts.forEach((n, r) => {
      if (n >= 2) init.add(`r:${r}`);
    });
    return init;
  });
  const [activeArchiveId, setActiveArchiveId] = useState<string | null>(null);
  const { scrollY, scrollYProgress } = useScroll();

  // Cinematic hero exit — as the user scrolls past the opening, the title
  // recedes (lifts, scales up slightly, fades) like a camera pulling back,
  // instead of flatly scrolling off. Scroll-linked, so it reads as a
  // continuous move into the archive.
  const heroOpacity = useTransform(scrollY, [0, 600], [1, 0], { clamp: true });
  const heroY = useTransform(scrollY, [0, 600], [0, -100], { clamp: true });
  const heroScale = useTransform(scrollY, [0, 600], [1, 1.06], { clamp: true });
  const scrollCueOpacity = useTransform(scrollY, [0, 160], [1, 0], { clamp: true });
  // Layered hero parallax — on scroll-out the title pulls UP faster than the
  // frame while the epigraph lags slightly DOWN, so the two planes separate
  // into depth instead of receding as one flat sheet. Applied on dedicated
  // wrappers so they don't fight the entrance/exit transforms; off when reduced.
  const heroTitleParallax = useTransform(scrollY, [0, 600], [0, -64], { clamp: true });
  const heroEpigraphParallax = useTransform(scrollY, [0, 600], [0, 38], { clamp: true });

  // The cinematic film-open plays once the first-visit intro is gone (or
  // immediately on a return visit, when no intro shows).
  const introReady = true;

  // Honour "reduce motion": skip the always-on ambient animations entirely.
  const reduce = useReducedMotion();

  // ── Lenis smooth scroll (landonorris-style weighty momentum) ──
  // Inertial smooth scroll for the homepage. framer's useScroll reads the same
  // window position Lenis drives, so the existing scroll effects keep working.
  // Skipped for reduced-motion. Torn down on unmount (e.g. route change).
  // Held in a ref so the collection overlay can pause it — Lenis otherwise eats
  // the wheel on the window and the overlay's own scroll never moves.
  const lenisRef = useRef<Lenis | null>(null);
  useEffect(() => {
    if (reduce) return;
    const lenis = new Lenis({
      duration: 1.05,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    lenisRef.current = lenis;
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reduce]);

  // "Selected Works" heading block — reliable scroll reveal (not whileInView).
  const [selectedWorksRef, selectedWorksShown] = useInViewOnce<HTMLDivElement>();
  // Reverse parallax — the heading block counter-drifts (down) against the
  // covers' upward drift, so the text plane reads as nearer than the photos.
  // useScroll measures the static outer wrapper; the drift is applied to an
  // inner layer (no measure/transform feedback loop). Off when reduced.
  const { scrollYProgress: swScrollProgress } = useScroll({
    target: selectedWorksRef,
    offset: ['start end', 'end start'],
  });
  const headingReverseY = useTransform(swScrollProgress, [0, 1], reduce ? [0, 0] : [36, -36]);
  // Word-by-word rise for the "distilled lens." headline, scrubbed on the
  // heading's own scroll progress (separate offset; measures the static ref).
  const { scrollYProgress: swRevealProgress } = useScroll({
    target: selectedWorksRef,
    offset: ['start 0.85', 'start 0.35'],
  });

  // Filter to collections that have photos
  const activeCollections = useMemo(
    () => collections.filter((c) => (c.photos?.length || 0) > 0),
    [collections],
  );

  // Group active cities into ordered region sections. A section shows a
  // divider HEADER only when it has ≥2 cities; single-city regions (and
  // untagged collections) just render their chapter — no redundant header.
  // Cities remain the unit everywhere (observer, rail, accent, story).
  const sections = useMemo<RegionSection[]>(() => {
    const groups = new Map<string, Collection[]>();
    const order: string[] = [];
    for (const c of activeCollections) {
      const key = c.region?.trim() ? `r:${c.region.trim()}` : `s:${c._id}`;
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(c);
    }
    return order.map((key) => {
      const cities = groups.get(key)!;
      const isRegion = key.startsWith('r:') && cities.length >= 2;
      return {
        key,
        region: isRegion ? cities[0].region!.trim() : null,
        showHeader: isRegion,
        frameCount: cities.reduce((n, c) => n + (c.photoCount ?? c.photos?.length ?? 0), 0),
        cities,
      };
    });
  }, [activeCollections]);

  // Flat city list in on-screen order (region members grouped adjacent) — the
  // route rail + observer index against this.
  const orderedCities = useMemo(() => sections.flatMap((s) => s.cities), [sections]);
  const cityDomId = (c: Collection) => `archive-item-${c._id}`;

  // Marquee index — real place names (hero epigraphs) + archive cities, deduped.
  // Each maps to its archive id so the band can spotlight the live active one.
  const indexNames = useMemo(
    () =>
      Array.from(
        new Set([...HERO_EPIGRAPHS.map((e) => e.place), ...orderedCities.map((c) => c.name.trim())]),
      ).map((name) => {
        const city = orderedCities.find((c) => c.name.trim() === name);
        return { name, id: city ? cityDomId(city) : null };
      }),
    [orderedCities],
  );

  // ── Region collapse helpers ──
  const sectionKeyOfCity = useMemo(() => {
    const m = new Map<string, string>();
    sections.forEach((s) => s.cities.forEach((c) => m.set(c._id, s.key)));
    return m;
  }, [sections]);

  const toggleRegion = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // Rail click for a city in a collapsed region: expand it, then scroll.
  const jumpToCity = useCallback(
    (c: Collection) => {
      const key = sectionKeyOfCity.get(c._id);
      if (key) {
        setCollapsed((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          document.getElementById(`archive-item-${c._id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }),
      );
    },
    [sectionKeyOfCity],
  );

  const collapsibleKeys = useMemo(() => sections.filter((s) => s.showHeader).map((s) => s.key), [sections]);
  const allCollapsed = collapsibleKeys.length > 0 && collapsibleKeys.every((k) => collapsed.has(k));
  const toggleAll = useCallback(() => {
    setCollapsed(allCollapsed ? new Set() : new Set(collapsibleKeys));
  }, [allCollapsed, collapsibleKeys]);

  // Index of the active city — drives the "route rail" fill (−1 in the hero).
  // `activeArchiveId` holds the active city's full DOM id. Each row is 52 px.
  const ROW_H = 52;
  const activeRouteIndex = activeArchiveId
    ? orderedCities.findIndex((c) => cityDomId(c) === activeArchiveId)
    : -1;

  // IntersectionObserver for sidebar active state — observes each city chapter.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveArchiveId(entry.target.id);
        });
      },
      { threshold: 0.1, rootMargin: '-30% 0px -30% 0px' },
    );

    orderedCities.forEach((c) => {
      const el = document.getElementById(cityDomId(c));
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
    // Re-observe when a region collapses/expands (chapters mount/unmount).
  }, [orderedCities, collapsed]);

  useEffect(() => {
    const isOverlayOpen = !!selectedCollection;
    document.body.style.overflow = isOverlayOpen ? 'hidden' : 'auto';
    document.body.style.backgroundColor = '#282c20';
    // Pause Lenis while the overlay is up so its own overflow-y-auto scrolls
    // natively; resume on close.
    if (isOverlayOpen) lenisRef.current?.stop();
    else lenisRef.current?.start();
    return () => {
      document.body.style.overflow = '';
      document.body.style.backgroundColor = '';
    };
  }, [selectedCollection]);

  // Scroll progress for sidebar bar
  const sidebarScrollWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  // ── Rotating hero epigraph ──
  // Cycles through HERO_EPIGRAPHS once every ~6.5s with a crossfade.
  // Starts on a random index so different visits feel different.
  const [epigraphIdx, setEpigraphIdx] = useState(() =>
    Math.floor(Math.random() * HERO_EPIGRAPHS.length),
  );
  // setTimeout keyed on the current index so the dwell time re-arms cleanly
  // after a manual jump (clicking a position dot) instead of double-firing.
  useEffect(() => {
    const t = setTimeout(() => {
      setEpigraphIdx((i) => (i + 1) % HERO_EPIGRAPHS.length);
    }, 6500);
    return () => clearTimeout(t);
  }, [epigraphIdx]);

  // ── Per-chapter dynamic accent color ──
  // Resolve the currently visible chapter's color palette → RGB. When no
  // chapter intersects (hero state), fall back to neutral white so the page
  // looks unchanged at scrollY=0. The `accent-tint-transition` class on the
  // wrapper interpolates these three CSS vars over 1.2s as `activeArchiveId`
  // flips, giving a slow crossfade between "rooms".
  // Single signature accent for all chrome (rails, dividers, dots) — Man City
  // sky-blue. No per-chapter colour shift; the photographs carry the rest.
  const accentRgb = { r: 210, g: 255, b: 0 };

  return (
    <>
      <div
        className="accent-tint-transition min-h-screen font-sans transition-colors duration-1000 apple-spring relative bg-[#282c20] text-[#F4F4ED] opacity-100"
        style={{
          // Drive per-chapter retint. The browser interpolates these natively
          // thanks to @property registration in global.css.
          ['--accent-r' as never]: accentRgb.r,
          ['--accent-g' as never]: accentRgb.g,
          ['--accent-b' as never]: accentRgb.b,
        }}
      >
        {/* ── Editorial canvas ──
             Refined-dark magazine direction: a flat near-black page with only a
             faint film grain and the page vignette below. The cinematic stack
             (background video, ambient glow, dust, parallax grid, sunbeam,
             colored halos) was removed for restraint — the photographs carry
             the page. The old animated film grain was retired — it read as
             flicker; a static cool contour field (SiteAtmosphere) replaces it. */}
        <SiteAtmosphere />

        {/* ── Continuous page vignette ──
             A page-level fixed frame (not hero-bound) so the cinematic
             darkening is the SAME from the opening through the whole archive
             — the "journey" and the content below share one frame instead of
             a vignetted hero meeting an un-vignetted page. */}
        <div
          className={`fixed inset-0 pointer-events-none z-[2] transition-opacity duration-1000 ${
            selectedCollection ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ background: 'radial-gradient(125% 95% at 50% 38%, transparent 52%, rgba(4,6,12,0.46) 100%)' }}
        />

        {/* ── Nav — signature font + pill buttons ── */}
        <nav
          className="fixed top-0 left-0 w-full z-50 px-6 py-5 md:py-8 md:px-12 flex justify-between items-center bg-transparent"
          style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
        >
          <motion.button
            onClick={() => {
              setSelectedCollection(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.2, ease: expo }}
            className="flex items-center gap-3 hover:opacity-60 transition-opacity duration-200 font-serif uppercase text-lg md:text-xl tracking-[0.16em] font-medium leading-none text-[#F4F4ED] mix-blend-difference py-1"
          >
            Ryan Xu
          </motion.button>

          <div className="flex items-center gap-2 md:gap-3">
            <Magnetic strength={0.5}>
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="/travel"
                className="inline-block px-3.5 md:px-6 py-2 md:py-2.5 rounded-full text-[9px] md:text-[10px] uppercase tracking-[0.25em] md:tracking-[0.3em] font-bold transition-colors duration-300 border border-white/20 bg-white/5 hover:bg-white/10 text-white backdrop-blur-md"
              >
                Map
              </motion.a>
            </Magnetic>

            <Magnetic strength={0.5}>
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="/about"
                className="inline-block px-3.5 md:px-6 py-2 md:py-2.5 rounded-full text-[9px] md:text-[10px] uppercase tracking-[0.25em] md:tracking-[0.3em] font-bold transition-colors duration-300 border border-white/20 bg-white/5 hover:bg-white/10 text-white backdrop-blur-md"
              >
                About
              </motion.a>
            </Magnetic>
          </div>
        </nav>

        {/* ── Hero Header ── */}
        <header className="h-[100vh] flex flex-col justify-center items-center text-center px-6 relative overflow-hidden">
          {/* The dramatic opening now lives entirely in HeroEntrance (the GSAP
               intro). The hero no longer slams its own shutter / exposure flash —
               it settles in as a calm continuation, so the entrance and the
               hero read as ONE connected sequence. */}
          {/* Scroll-linked cinematic exit wrapper — recedes on scroll */}
          <motion.div
            style={{ opacity: heroOpacity, y: heroY, scale: heroScale }}
            className="relative z-10 w-full flex justify-center"
          >
          {/* Header content — cinematic push-in (defocus → focus, slow dolly).
               Held hidden until the first-visit intro clears (introReady), so
               the push-in plays WITH the letterbox open, not under the intro. */}
          {/* Calm settle — the hero rises gently out of a soft defocus as the
               entrance hands off. No jolt; reads as the entrance landing into
               the gallery. */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 1.03, filter: 'blur(9px)' }}
            animate={introReady
              ? { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }
              : { opacity: 0, y: 30, scale: 1.03, filter: 'blur(9px)' }}
            transition={{ duration: 1.25, ease: expo, delay: 0.05 }}
            className="space-y-12"
          >
            <div className="flex flex-col items-center gap-6">
              <motion.span
                initial={{ opacity: 0, letterSpacing: '4em' }}
                animate={{ opacity: 0.3, letterSpacing: '2em' }}
                transition={{ delay: 0.1, duration: 1.5 }}
                className="text-[9px] uppercase block font-bold"
              >
                The Act of Remembering
              </motion.span>
              <div className="w-[1px] h-20 bg-gradient-to-b from-white/30 to-transparent" />
            </div>

            <div className="space-y-4 max-w-7xl w-full mx-auto">
              <motion.div className="relative" style={reduce ? undefined : { y: heroTitleParallax }}>
                <ParticleTitle
                  text="Journal <br/> Gallery"
                  className="h-64 md:h-96"
                />
                {/* Anamorphic light sweep across the title (one-shot on open) */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden z-20" aria-hidden="true">
                  <motion.div
                    className="absolute top-0 bottom-0 w-2/5 -skew-x-12"
                    style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.45), transparent)' }}
                    initial={{ x: '-170%' }}
                    animate={{ x: introReady ? '440%' : '-170%' }}
                    transition={{ duration: 0.9, delay: introReady ? 0.7 : 0, ease: [0.5, 0, 0.15, 1] }}
                  />
                </div>
              </motion.div>

              {/* ── Rotating epigraph — narrative bridge from hero into archive ──
                   A small label sits constant ("From the archive"), and beneath
                   it a serif-italic line crossfades every ~6.5 s through real
                   first-lines drawn from each chapter's narrative. Gives the
                   hero a sense of "this place actually contains specific stories"
                   instead of a single static tagline. */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 1 }}
                style={reduce ? undefined : { y: heroEpigraphParallax }}
                className="pt-10 md:pt-12 flex flex-col items-center gap-3"
              >
                <p className="text-[9px] uppercase tracking-[0.5em] font-medium opacity-25">
                  From the archive
                </p>
                <div className="relative w-full max-w-[40rem] mx-auto h-20 md:h-16">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={epigraphIdx}
                      initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
                      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-x-0 flex flex-col items-center gap-2.5"
                    >
                      <p className="text-center text-base md:text-lg font-serif italic leading-snug px-5 text-[#F4F4ED] opacity-[0.72]">
                        &ldquo;{HERO_EPIGRAPHS[epigraphIdx].line}&rdquo;
                      </p>
                      <p className="font-ui text-[9px] tracking-[0.4em] uppercase opacity-30">
                        &mdash;&ensp;{HERO_EPIGRAPHS[epigraphIdx].place}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Journey position — clickable dots to step through the entries */}
                <div className="flex items-center gap-1.5 pt-1">
                  {HERO_EPIGRAPHS.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setEpigraphIdx(i)}
                      aria-label={`Archive entry ${i + 1}`}
                      className="p-1.5 -m-1.5 cursor-pointer"
                    >
                      <span
                        className="block w-1.5 h-1.5 rounded-full transition-all duration-500"
                        style={{
                          background:
                            i === epigraphIdx
                              ? 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))'
                              : 'rgba(255,255,255,0.2)',
                          transform: i === epigraphIdx ? 'scale(1.4)' : 'scale(1)',
                        }}
                      />
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 1 }}
              className="flex items-center justify-center gap-16 pt-16"
            >
              <div
                className="w-16 h-[1px]"
                style={{ background: 'rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.10)' }}
              />
              <div className="flex items-center gap-6">
                <span className="text-[9px] font-ui opacity-20">REF &numero;</span>
                <span className="text-[10px] uppercase tracking-[0.4em] opacity-30 font-bold">
                  Vol. {activeCollections.length} Archive
                </span>
              </div>
              <div
                className="w-16 h-[1px]"
                style={{ background: 'rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.10)' }}
              />
            </motion.div>
          </motion.div>
          </motion.div>

          {/* Scroll cue — invites entry into the archive, fades on first scroll */}
          <motion.div
            style={{ opacity: scrollCueOpacity }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-10 pointer-events-none"
          >
            <span className="text-[9px] uppercase tracking-[0.5em] font-ui opacity-40">Scroll</span>
            <motion.div
              className="w-px h-8 bg-white/30 origin-top"
              animate={reduce ? { scaleY: 1 } : { scaleY: [0, 1, 0] }}
              transition={reduce ? { duration: 0.3 } : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </header>

        {/* ── Quiet index marquee — restrained seam into the archive ── */}
        <QuietIndexBand names={indexNames} activeArchiveId={activeArchiveId} />

        {/* ── Desktop Main — sidebar + archive chapters ── */}
        <main className="hidden md:block max-w-7xl mx-auto px-6 md:px-12 pt-24 lg:pt-32 pb-8 relative z-10">
          {/* Dynamic Ambient Background Aura */}
          <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
            {/* Colored accent halos + the deep photo-parallax layer were removed
                 for the editorial direction. Only the faint grayscale backdrop
                 of the active chapter remains (below). */}
            <AnimatePresence mode="wait">
              {activeArchiveId && (
                <motion.div
                  key={activeArchiveId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.15 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2, ease: 'easeInOut' }}
                  className="absolute inset-0"
                >
                  {(() => {
                    const activeCity = orderedCities.find((c) => `archive-item-${c._id}` === activeArchiveId);
                    const bgUrl = activeCity?.coverImageUrl || activeCity?.photos?.[0]?.imageUrl;
                    return bgUrl ? (
                      <>
                        <img
                          src={`${bgUrl}?auto=format&w=800&q=40`}
                          className="w-full h-full object-cover blur-[120px] scale-110 grayscale"
                          alt=""
                        />
                        <div className="absolute inset-0 bg-black/40" />
                      </>
                    ) : null;
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Decorative Grid Lines */}
          <div className="fixed left-24 top-0 bottom-0 w-px bg-white/[0.03] z-0 hidden lg:block" />
          <div className="fixed right-24 top-0 bottom-0 w-px bg-white/[0.03] z-0 hidden lg:block" />

          <div className="flex flex-col lg:flex-row gap-16 md:gap-24">
            {/* Side Navigation */}
            <aside className="hidden lg:block lg:w-48 sticky top-24 h-fit shrink-0 z-50">
              <div className="relative space-y-8">
                {/* Header — reframed as a route/itinerary */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-1 rounded-full bg-white opacity-20 animate-pulse" />
                    <span className="text-[9px] uppercase tracking-[0.4em] font-bold opacity-30">
                      The Route // {orderedCities.length} stops
                    </span>
                  </div>
                  {collapsibleKeys.length > 0 && (
                    <button
                      onClick={toggleAll}
                      data-cursor={allCollapsed ? 'Expand' : 'Collapse'}
                      className="flex items-center gap-1.5 pl-4 text-[8px] uppercase tracking-[0.3em] font-ui text-white/30 hover:text-white/70 transition-colors cursor-none"
                    >
                      <ChevronDown
                        size={11}
                        className={`transition-transform duration-300 ${allCollapsed ? '' : 'rotate-180'}`}
                      />
                      {allCollapsed ? 'Expand regions' : 'Collapse regions'}
                    </button>
                  )}
                </div>

                {/* Route rail — a vertical itinerary line with a waypoint node
                     per chapter. The line fills with the accent up to the
                     active node (distance "traveled"); passed nodes are filled,
                     the active node pulses, upcoming nodes stay hollow. */}
                <div className="relative">
                  {/* base rail */}
                  <span className="absolute left-[4px] top-0 bottom-0 w-px bg-white/10" />
                  {/* traveled rail */}
                  <motion.span
                    className="absolute left-[4px] top-0 w-px"
                    style={{
                      background:
                        'linear-gradient(to bottom, rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.15), rgb(var(--accent-r), var(--accent-g), var(--accent-b)))',
                    }}
                    animate={{ height: activeRouteIndex >= 0 ? activeRouteIndex * ROW_H + ROW_H / 2 : 0 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 32 }}
                  />

                  <div className="flex flex-col">
                    {orderedCities.map((city, idx) => (
                      <SidebarItem
                        key={city._id}
                        id={`archive-item-${city._id}`}
                        label={city.name}
                        coverBase={city.coverImageUrl ?? city.photos?.[0]?.imageUrl ?? ''}
                        idx={idx}
                        onActivate={() => jumpToCity(city)}
                        state={
                          activeRouteIndex < 0
                            ? 'future'
                            : idx < activeRouteIndex
                              ? 'past'
                              : idx === activeRouteIndex
                                ? 'active'
                                : 'future'
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-2 space-y-4">
                  <div className="space-y-2">
                    <span className="text-[7px] uppercase tracking-widest opacity-20 block font-ui">
                      Journey Progress
                    </span>
                    <div className="w-full h-[1px] bg-white/5 relative overflow-hidden">
                      <motion.div
                        className="absolute top-0 left-0 h-full"
                        style={{
                          width: sidebarScrollWidth,
                          background: 'rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.55)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            {/* Exhibition Content — leans subtly with scroll velocity */}
            <div className="flex-1 space-y-12 md:space-y-20">
              <div ref={selectedWorksRef} className="max-w-2xl">
                <motion.div style={reduce ? undefined : { y: headingReverseY }} className="space-y-4">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={selectedWorksShown ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-4 text-[9px] uppercase tracking-[0.6em] font-bold opacity-30"
                >
                  <div className="w-8 h-px bg-white/30" />
                  <span>Selected Works</span>
                </motion.div>
                <h2 className="text-4xl md:text-7xl font-serif uppercase tracking-tighter leading-tight pb-2">
                  {SW_WORDS.map((w, i) => (
                    <RisingWord
                      key={i}
                      word={w}
                      index={i}
                      progress={swRevealProgress}
                      reduce={!!reduce}
                      accent={w === 'lens.'}
                    />
                  ))}
                </h2>
                <div className="flex items-center gap-2.5 pt-2 text-[10px] font-ui uppercase tracking-[0.3em] text-white/35">
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
                      style={{ background: 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))' }}
                    />
                    <span
                      className="relative inline-flex h-1.5 w-1.5 rounded-full"
                      style={{ background: 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))' }}
                    />
                  </span>
                  <span>Select any frame to enter its story</span>
                </div>
                </motion.div>
              </div>

              <div className="space-y-12 md:space-y-20">
                {sections.map((section) => {
                  const isCollapsed = section.showHeader && collapsed.has(section.key);
                  return (
                    <div key={section.key} className="space-y-12 md:space-y-20">
                      {section.showHeader && section.region && (
                        <RegionHeader
                          region={section.region}
                          placeCount={section.cities.length}
                          frameCount={section.frameCount}
                          collapsible
                          collapsed={isCollapsed}
                          onToggle={() => toggleRegion(section.key)}
                        />
                      )}
                      <AnimatePresence initial={false} mode="wait">
                        {isCollapsed ? (
                          <motion.div
                            key="strip"
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <CollapsedRegionStrip cities={section.cities} onOpen={setSelectedCollection} />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="full"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                            className="space-y-12 md:space-y-20"
                          >
                            {section.cities.map((city) => {
                              const index = orderedCities.indexOf(city);
                              const domId = `archive-item-${city._id}`;
                              return (
                                <ArchiveChapter
                                  key={city._id}
                                  id={domId}
                                  collection={city}
                                  isActive={activeArchiveId === domId}
                                  onClick={() => setSelectedCollection(city)}
                                  index={index}
                                />
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* End-of-archive terminator — visual full-stop above the footer.
                   Tightened gap so the page caps cleanly at the footer's
                   bottom edge instead of trailing off into dead space. */}
              <div className="pt-8 pb-2 flex flex-col items-center gap-3 opacity-30">
                <div
                  className="w-px h-10"
                  style={{ background: 'rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.30)' }}
                />
                <span className="text-[9px] uppercase tracking-[0.5em] font-ui">
                  End of archive
                </span>
                <span className="text-[8px] font-ui opacity-60">
                  // {activeCollections.length} of {activeCollections.length}
                </span>
              </div>
            </div>
          </div>
        </main>

        {/* ── Mobile Filmstrip Waterfall ── */}
        <div className="block md:hidden pt-12 pb-12">
          {sections.flatMap((section) => {
            const els: React.ReactNode[] = [];
            const isCollapsed = section.showHeader && collapsed.has(section.key);
            if (section.showHeader && section.region) {
              els.push(
                <button
                  key={`mh-${section.key}`}
                  onClick={() => toggleRegion(section.key)}
                  className="w-full px-5 pt-10 pb-4 flex items-center gap-3 text-left"
                  aria-expanded={!isCollapsed}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))' }}
                  />
                  <span className="font-serif uppercase text-2xl tracking-tight text-white leading-none">
                    {section.region}
                  </span>
                  {isCollapsed && (
                    <motion.span
                      className="ml-auto font-ui text-[8px] tracking-[0.3em] uppercase"
                      style={{ color: 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))' }}
                      animate={reduce ? { opacity: 1 } : { opacity: [0.45, 1, 0.45] }}
                      transition={reduce ? { duration: 0.3 } : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      Tap to expand
                    </motion.span>
                  )}
                  <motion.span
                    className={`flex items-center justify-center w-9 h-9 rounded-full border ${isCollapsed ? '' : 'ml-auto'}`}
                    style={{
                      borderColor: isCollapsed ? 'rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.7)' : 'rgba(255,255,255,0.15)',
                      color: isCollapsed ? 'rgb(var(--accent-r),var(--accent-g),var(--accent-b))' : 'rgba(255,255,255,0.4)',
                      boxShadow: isCollapsed ? '0 0 18px rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.45)' : 'none',
                    }}
                    animate={isCollapsed && !reduce ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                    transition={isCollapsed && !reduce ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
                  >
                    <ChevronDown
                      size={15}
                      className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}
                    />
                  </motion.span>
                </button>,
              );
            }
            if (!isCollapsed) {
              section.cities.forEach((city) => {
                els.push(
                  <MobileFilmstripItem
                    key={city._id}
                    coverBase={city.coverImageUrl ?? city.photos?.[0]?.imageUrl ?? ''}
                    title={city.name}
                    onClick={() => setSelectedCollection(city)}
                  />,
                );
              });
            }
            return els;
          })}

          {/* Mobile end-of-archive terminator */}
          <div className="pt-12 pb-2 flex flex-col items-center gap-3 opacity-30">
            <div
              className="w-px h-10"
              style={{ background: 'rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.30)' }}
            />
            <span className="text-[9px] uppercase tracking-[0.5em] font-ui">
              End of archive
            </span>
          </div>

        </div>

      </div>

      {/* ── Collection detail overlay (MagazineLayout) ── */}
      <AnimatePresence>
        {selectedCollection && (
          <MagazineLayout
            collection={selectedCollection}
            allCollections={activeCollections}
            onSelectCollection={setSelectedCollection}
            onClose={() => setSelectedCollection(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
