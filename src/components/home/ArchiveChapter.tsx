import { useRef, useMemo, useState } from 'react';
import { motion, useScroll, useTransform, useMotionValue, useSpring, useMotionTemplate } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { Collection } from '../../types';
import Magnetic from '../shared/Magnetic';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const expo = [0.16, 1, 0.3, 1] as const;

interface ArchiveChapterProps {
  id: string;
  collection: Collection;
  onClick: () => void;
  index: number;
  isActive: boolean;
}

/**
 * ArchiveChapter — a collection's homepage entry, composed as a MAGAZINE COVER:
 * a tall full-bleed photo with the collection name set large ON the image, an
 * editorial kicker (Dispatch Nº / place · year) at the top, and the frame
 * count + "View Story" CTA woven into the masthead. Type lives on the photo —
 * it reads as a cover, not a captioned card. Hover is a calm opacity dim-lift +
 * gentle scale + cursor sheen (no filter/WebGL jank).
 */
export default function ArchiveChapter({ id, collection, onClick, index, isActive }: ArchiveChapterProps) {
  const chapterRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

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

  const { scrollYProgress } = useScroll({
    target: chapterRef,
    offset: ['start end', 'end start'],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [1.06, 1, 1, 0.99]);
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '-14%']);

  const coverBase = collection.coverImageUrl ?? collection.photos?.[0]?.imageUrl ?? '';
  // Full-bleed cover — wide (≈92vw) up to a large container. Bracket Retina.
  const coverUrl = coverBase ? `${coverBase}?auto=format&w=1600&q=82` : '';
  const coverSrcSet = coverBase
    ? `${coverBase}?auto=format&w=1000&q=82 1000w, ${coverBase}?auto=format&w=1600&q=82 1600w, ${coverBase}?auto=format&w=2000&q=78 2000w`
    : undefined;

  const coords = useMemo(() => {
    const photo = collection.photos?.find((p) => p.location?.lat != null && p.location?.lng != null);
    return photo?.location || null;
  }, [collection.photos]);

  const frames = collection.photoCount ?? collection.photos?.length ?? 0;
  const dateline = collection.location || collection.region || 'United States';

  return (
    <motion.section id={id} ref={chapterRef} style={{ opacity }} className="relative pb-12 lg:pb-16">
      <motion.div
        className="relative group cursor-none w-full overflow-hidden bg-white/[0.02] border border-white/5 group-hover:border-white/15 transition-colors duration-700"
        onClick={onClick}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        onMouseMove={onCoverMove}
        data-cursor="View Story"
        role="button"
        aria-label={`View story: ${collection.name}`}
      >
        {/* Tall full-bleed cover photo */}
        <motion.div style={{ scale }} className="relative aspect-[4/5] sm:aspect-[16/11] lg:aspect-[16/10] overflow-hidden">
          {coverUrl && (
            <motion.img
              style={{ y: imgY }}
              src={coverUrl}
              srcSet={coverSrcSet}
              sizes="(min-width: 768px) 92vw, 100vw"
              alt={collection.name}
              loading="lazy"
              decoding="async"
              animate={{ scale: isHovered ? 1.045 : isActive ? 1.02 : 1 }}
              transition={{ duration: 1.1, ease: expo }}
              className="absolute inset-0 w-full h-[125%] object-cover"
              draggable={false}
            />
          )}

          {/* Calm dim-lift on hover (opacity only) */}
          <motion.div
            className="absolute inset-0 bg-[#0A0A0A] pointer-events-none"
            animate={{ opacity: isHovered ? 0.12 : isActive ? 0.28 : 0.5 }}
            transition={{ duration: 0.8, ease: expo }}
          />

          {/* Masthead scrims — top for the kicker, bottom for the title */}
          <div className="absolute inset-x-0 top-0 h-1/3 pointer-events-none bg-gradient-to-b from-black/55 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-3/4 pointer-events-none bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

          {/* Cursor sheen (hover only) */}
          <motion.div
            className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 mix-blend-soft-light"
            style={{ background: sheen }}
            aria-hidden="true"
          />
        </motion.div>

        {/* ── Kicker (top) ── */}
        <div className="absolute inset-x-0 top-0 p-5 md:p-8 flex items-start justify-between font-mono text-[10px] md:text-[11px] tracking-[0.4em] uppercase">
          <span className="flex items-center gap-2 text-white/70">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
            Dispatch&nbsp;Nº&nbsp;{String(index + 1).padStart(2, '0')}
          </span>
          <span className="text-white/45 text-right">
            {dateline}
            {collection.year ? ` · ${collection.year}` : ''}
          </span>
        </div>

        {/* ── Masthead title + meta + CTA (bottom, over the photo) ── */}
        <div className="absolute inset-x-0 bottom-0 p-5 md:p-8 lg:p-10">
          <h3
            className="font-serif italic text-white tracking-tighter leading-[0.82] drop-shadow-[0_2px_40px_rgba(0,0,0,0.55)]"
            style={{ fontSize: 'clamp(46px, 8.5vw, 132px)' }}
          >
            {collection.name}
          </h3>
          <div className="mt-4 md:mt-6 flex items-end justify-between gap-6">
            <div className="font-mono text-[10px] md:text-[11px] tracking-[0.3em] uppercase text-white/55 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{frames} frames</span>
              {coords && (
                <span className="text-white/35">
                  {coords.lat.toFixed(3)}°, {coords.lng.toFixed(3)}°
                </span>
              )}
            </div>
            <Magnetic strength={0.4}>
              <span className="shrink-0 inline-flex items-center gap-3 font-mono text-[10px] md:text-[11px] tracking-[0.35em] uppercase text-white/80 group-hover:text-white transition-colors duration-500">
                View Story
                <span className="flex items-center justify-center w-10 h-10 rounded-full border border-white/25 group-hover:border-white group-hover:bg-white group-hover:text-black transition-all duration-500">
                  <ArrowRight size={16} />
                </span>
              </span>
            </Magnetic>
          </div>
        </div>

        {/* Accent baseline wipes in on hover */}
        <div
          className="absolute left-0 right-0 bottom-0 h-[3px] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-[750ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ background: ACCENT }}
        />
      </motion.div>
    </motion.section>
  );
}
