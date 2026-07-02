import { useRef, useMemo, useState } from 'react';
import { motion, useScroll, useTransform, useMotionValue, useSpring, useMotionTemplate, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { Collection } from '../../types';
import Magnetic from '../shared/Magnetic';
import { excerpt } from '../../lib/narratives';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const expo = [0.16, 1, 0.3, 1] as const;

interface ArchiveChapterProps {
  id: string;
  collection: Collection;
  onClick: () => void;
  index: number;
  isActive: boolean;
  /** 'cover' (default) = full-bleed magazine cover; 'feature' = a 2-column
   *  editorial spread (image + a text rail) used for the opening chapter. */
  variant?: 'feature' | 'cover';
  /** Mirror the cover masthead alignment (left/right) for editorial bounce.
   *  Cover variant only. */
  flip?: boolean;
}

/**
 * ArchiveChapter — a collection's homepage entry. Two layouts:
 *  - 'cover'   : a tall full-bleed photo with the name set large ON the image
 *                (the default; alternating `flip` mirrors the masthead).
 *  - 'feature' : an editorial 2-column spread (image + a text rail with the
 *                subtitle deck, an excerpt, a dateline, and the CTA) — used once,
 *                for the opener, to break the look-alike stack.
 * Hover = calm dim-lift + gentle scale + cursor sheen + a lime heat glow.
 */
export default function ArchiveChapter({ id, collection, onClick, index, isActive, variant = 'cover', flip = false }: ArchiveChapterProps) {
  const chapterRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  // The cover→interior swap image is heavy, so it's only mounted once the card
  // has been hovered at least once (and never under reduced-motion).
  const [armed, setArmed] = useState(false);
  const reduce = useReducedMotion();

  // Cursor-following light sheen (spring-smoothed) layered over the cover.
  const sheenX = useMotionValue(50);
  const sheenY = useMotionValue(50);
  const sx = useSpring(sheenX, { stiffness: 150, damping: 20, mass: 0.4 });
  const sy = useSpring(sheenY, { stiffness: 150, damping: 20, mass: 0.4 });
  const sheen = useMotionTemplate`radial-gradient(32% 42% at ${sx}% ${sy}%, rgba(255,255,255,0.20), rgba(255,255,255,0.04) 45%, transparent 70%)`;
  const onCoverMove = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    sheenX.set(((e.clientX - r.left) / r.width) * 100);
    sheenY.set(((e.clientY - r.top) / r.height) * 100);
  };

  const { scrollYProgress } = useScroll({ target: chapterRef, offset: ['start end', 'end start'] });
  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
  // Cinematic entrance — the card rises in, and the photo settles OUT of a zoom
  // (a filmic "arrive/focus") over a stronger internal dolly.
  const entryY = useTransform(scrollYProgress, [0, 0.4], [96, 0], { clamp: true });
  const revealScale = useTransform(scrollYProgress, [0, 0.45, 0.9, 1], [1.3, 1, 1, 1.06]);
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '-26%']);

  // Keyword-ignite (last word lights to lime on scroll-in) stays.
  const igniteColor = useTransform(scrollYProgress, [0.3, 0.52], ['rgba(244,244,237,1)', 'rgb(210,255,0)']);
  const nameParts = collection.name.trim().split(/\s+/);
  const igniteWord = nameParts.length > 1 ? nameParts[nameParts.length - 1] : collection.name.trim();
  const leadWords = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';

  const coverBase = collection.coverImageUrl ?? collection.photos?.[0]?.imageUrl ?? '';
  const coverUrl = coverBase ? `${coverBase}?auto=format&w=1600&q=82` : '';
  const coverSrcSet = coverBase
    ? `${coverBase}?auto=format&w=1000&q=82 1000w, ${coverBase}?auto=format&w=1600&q=82 1600w, ${coverBase}?auto=format&w=2000&q=78 2000w`
    : undefined;

  // Hover swap-frame — the first interior photo that ISN'T the cover.
  const swapBase = useMemo(() => {
    const alt = collection.photos?.find((p) => p.imageUrl && p.imageUrl !== coverBase);
    return alt?.imageUrl ?? '';
  }, [collection.photos, coverBase]);
  const swapUrl = swapBase ? `${swapBase}?auto=format&w=1400&q=80` : '';
  const swapSrcSet = swapBase
    ? `${swapBase}?auto=format&w=1000&q=80 1000w, ${swapBase}?auto=format&w=1400&q=80 1400w`
    : undefined;

  const coords = useMemo(() => {
    const photo = collection.photos?.find((p) => p.location?.lat != null && p.location?.lng != null);
    return photo?.location || null;
  }, [collection.photos]);

  const frames = collection.photoCount ?? collection.photos?.length ?? 0;
  const dateline = collection.location || collection.region || 'United States';
  const exif = collection.photos?.[0];
  const exifLine = [exif?.focalLength, exif?.aperture, exif?.iso ? `ISO ${exif.iso}` : '']
    .filter(Boolean)
    .join(' · ');
  const deck = collection.subtitle?.trim();
  const lede = excerpt(collection.slug, 165);

  const aspectClass =
    variant === 'feature'
      ? 'aspect-[4/5] lg:aspect-[5/6]'
      : 'aspect-[4/5] sm:aspect-[16/11] lg:aspect-[16/10]';

  // Shared image block — parallax scale + cover/swap imgs + dim + scrims + sheen.
  const imageBlock = (
    <motion.div className={`relative ${aspectClass} overflow-hidden`}>
      {/* Reveal layer — settle-zoom, clipped by the frame */}
      <motion.div className="absolute inset-0" style={{ scale: reduce ? 1 : revealScale }}>
      {coverUrl && (
        <motion.img
          style={{ y: imgY }}
          src={coverUrl}
          srcSet={coverSrcSet}
          sizes="(min-width: 768px) 92vw, 100vw"
          alt={collection.name}
          loading="lazy"
          decoding="async"
          animate={{ scale: isHovered ? 1.12 : isActive ? 1.02 : 1 }}
          transition={{ duration: 1.1, ease: expo }}
          className="absolute inset-0 w-full h-[140%] object-cover"
          draggable={false}
        />
      )}
      {swapUrl && armed && !reduce && (
        <motion.img
          style={{ y: imgY }}
          src={swapUrl}
          srcSet={swapSrcSet}
          sizes="(min-width: 768px) 92vw, 100vw"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0, scale: isHovered ? 1.12 : 1 }}
          transition={{ opacity: { duration: isHovered ? 1.0 : 0.7, ease: expo }, scale: { duration: 1.1, ease: expo } }}
          className="absolute inset-0 w-full h-[140%] object-cover"
          draggable={false}
        />
      )}
      </motion.div>
      <motion.div
        className="absolute inset-0 bg-[#30352a] pointer-events-none"
        animate={{ opacity: isHovered ? 0.12 : isActive ? 0.28 : 0.5 }}
        transition={{ duration: 0.8, ease: expo }}
      />
      <div className="absolute inset-x-0 top-0 h-1/3 pointer-events-none bg-gradient-to-b from-black/55 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-3/4 pointer-events-none bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <motion.div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 mix-blend-soft-light"
        style={{ background: sheen }}
        aria-hidden="true"
      />
    </motion.div>
  );

  const interactive = {
    onClick,
    onHoverStart: () => { setIsHovered(true); setArmed(true); },
    onHoverEnd: () => setIsHovered(false),
    onMouseMove: onCoverMove,
    'data-cursor': 'View Story',
    role: 'button' as const,
    'aria-label': `View story: ${collection.name}`,
  };
  // Hover glow removed — the lime flash read as flicker; the dim-lift + scale +
  // sheen + baseline carry the hover calmly.
  const glow = {};
  const baseline = (
    <div
      className="absolute left-0 right-0 bottom-0 h-[5px] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-[750ms] ease-[cubic-bezier(0.16,1,0.3,1)] z-10"
      style={{ background: ACCENT }}
    />
  );

  // ── FEATURE — editorial 2-column spread (the opener) ──
  if (variant === 'feature') {
    return (
      <motion.section
        id={id}
        ref={chapterRef}
        style={{ opacity, y: reduce ? 0 : entryY }}
        className="relative pb-16 lg:pb-28"
      >
        <div className="lg:grid lg:grid-cols-12 lg:gap-12 lg:items-center">
          <motion.div
            {...interactive}
            animate={glow}
            transition={{ duration: 0.6, ease: expo }}
            className="lg:col-span-8 group relative cursor-pointer overflow-hidden bg-white/[0.02] border border-white/5 hover:border-white/15 transition-colors duration-700"
          >
            {imageBlock}
            {baseline}
          </motion.div>

          <div className="lg:col-span-4 mt-8 lg:mt-0 flex flex-col gap-5">
            <p className="text-kicker flex items-center gap-2 text-white/55">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
              In&nbsp;the&nbsp;Archive · Nº&nbsp;01
            </p>
            <h3 className="font-serif uppercase text-white tracking-tight leading-[0.88]" style={{ fontSize: 'clamp(40px, 5vw, 84px)' }}>
              {leadWords && <>{leadWords} </>}
              <motion.span style={{ color: reduce ? 'rgb(210,255,0)' : igniteColor }}>{igniteWord}</motion.span>
            </h3>
            {deck && <p className="text-deck max-w-[32ch]">{deck}</p>}
            {lede && <p className="text-[13.5px] leading-relaxed text-white/45 font-light max-w-[42ch]">{lede}</p>}
            <div className="h-px w-16" style={{ background: ACCENT }} />
            <div className="text-dateline space-y-1">
              <p>{dateline}{collection.year ? ` · ${collection.year}` : ''} · {frames} frames</p>
              {exifLine && <p className="text-white/30">{exifLine}</p>}
            </div>
            <Magnetic strength={0.4}>
              <button
                onClick={onClick}
                data-cursor="View Story"
                aria-label={`View story: ${collection.name}`}
                className="group/cta mt-1 shrink-0 inline-flex items-center gap-3 font-ui text-[10px] md:text-[11px] tracking-[0.35em] uppercase text-white/80 hover:text-white transition-colors duration-500"
              >
                View Story
                <span className="flex items-center justify-center w-10 h-10 rounded-full border border-white/25 group-hover/cta:border-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] group-hover/cta:bg-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] group-hover/cta:text-[#282c20] transition-all duration-500">
                  <ArrowRight size={16} />
                </span>
              </button>
            </Magnetic>
          </div>
        </div>
      </motion.section>
    );
  }

  // ── COVER (default) — full-bleed magazine cover ──
  return (
    <motion.section
      id={id}
      ref={chapterRef}
      style={{ opacity, y: reduce ? 0 : entryY }}
      className="relative pb-12 lg:pb-16"
    >
      <motion.div
        {...interactive}
        animate={glow}
        transition={{ duration: 0.6, ease: expo }}
        className="relative group cursor-pointer w-full overflow-hidden bg-white/[0.02] border border-white/5 hover:border-white/15 transition-colors duration-700"
      >
        {imageBlock}

        {/* ── Kicker (top) ── */}
        <div className={`absolute inset-x-0 top-0 p-5 md:p-8 flex items-start justify-between font-ui text-[10px] md:text-[11px] tracking-[0.4em] uppercase ${flip ? 'flex-row-reverse' : ''}`}>
          <span className="flex items-center gap-2 text-white/70">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
            Dispatch&nbsp;Nº&nbsp;{String(index + 1).padStart(2, '0')}
          </span>
          <span className={`text-white/45 ${flip ? 'text-left' : 'text-right'}`}>
            {dateline}
            {collection.year ? ` · ${collection.year}` : ''}
          </span>
        </div>

        {/* ── Masthead title + meta + CTA (bottom) ── */}
        <div className={`absolute inset-x-0 bottom-0 p-5 md:p-8 lg:p-10 ${flip ? 'text-right' : ''}`}>
          <h3
            className="font-serif uppercase text-white tracking-tighter leading-[0.82] drop-shadow-[0_2px_40px_rgba(0,0,0,0.55)]"
            style={{ fontSize: 'clamp(46px, 8.5vw, 132px)' }}
          >
            {leadWords && <>{leadWords} </>}
            <motion.span style={{ color: reduce ? 'rgb(210,255,0)' : igniteColor }}>{igniteWord}</motion.span>
          </h3>
          <div className={`mt-4 md:mt-6 flex items-end justify-between gap-6 ${flip ? 'flex-row-reverse' : ''}`}>
            <div className="font-ui text-[10px] md:text-[11px] tracking-[0.3em] uppercase text-white/55 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{frames} frames</span>
              {exifLine && <span className="text-white/35">{exifLine}</span>}
              {coords && (
                <span className="text-white/35">
                  {coords.lat.toFixed(3)}°, {coords.lng.toFixed(3)}°
                </span>
              )}
            </div>
            <Magnetic strength={0.4}>
              <span className="shrink-0 inline-flex items-center gap-3 font-ui text-[10px] md:text-[11px] tracking-[0.35em] uppercase text-white/80 group-hover:text-white transition-colors duration-500">
                View Story
                <span className="flex items-center justify-center w-10 h-10 rounded-full border border-white/25 group-hover:border-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] group-hover:bg-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] group-hover:text-[#282c20] transition-all duration-500">
                  <ArrowRight size={16} />
                </span>
              </span>
            </Magnetic>
          </div>
        </div>

        {baseline}
      </motion.div>
    </motion.section>
  );
}
