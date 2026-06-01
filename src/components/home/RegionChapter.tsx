import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { Collection } from '../../types';
import Magnetic from '../shared/Magnetic';

interface RegionChapterProps {
  id: string;
  region: string;
  collections: Collection[]; // ≥2 member places
  onOpen: () => void;
  index: number;
  isActive: boolean;
}

/**
 * RegionChapter — the L1 homepage unit for a multi-place region. Instead of a
 * single cover (like ArchiveChapter), it shows a MONTAGE of the member places'
 * covers, each labelled, plus the place list + frame count — so the visitor
 * sees exactly what's inside before opening the region hub. The split montage
 * also breaks the single-column monotony of identical chapters.
 *
 * Shares ArchiveChapter's vocabulary: massive ghost number, serif-italic title
 * bar with mono labels, scroll opacity/scale, accent dot, Magnetic CTA.
 */
export default function RegionChapter({ id, region, collections, onOpen, index, isActive }: RegionChapterProps) {
  const chapterRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: chapterRef,
    offset: ['start end', 'end start'],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [1.08, 1, 1, 0.98]);
  const numberY = useTransform(scrollYProgress, [0, 1], [150, -150]);
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '-12%']);

  const tiles = collections.slice(0, 4);
  const totalFrames = collections.reduce(
    (n, c) => n + (c.photoCount ?? c.photos?.length ?? 0),
    0,
  );
  const placeNames = collections.map((c) => c.name.trim()).join(' · ');

  return (
    <motion.section id={id} ref={chapterRef} style={{ opacity }} className="relative pb-12 lg:pb-16">
      {/* Massive ghost number */}
      <motion.div
        style={{ y: numberY }}
        className="absolute -left-20 lg:-left-40 top-0 select-none pointer-events-none z-0"
      >
        <span className="text-[35vw] md:text-[25vw] font-black leading-none text-white/[0.03] italic tracking-tighter">
          {String(index + 1).padStart(2, '0')}
        </span>
      </motion.div>

      <div className="relative z-10 space-y-12">
        {/* Title bar */}
        <div className="flex items-end justify-between border-b border-white/10 pb-6">
          <motion.h3
            initial={{ x: -50, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl md:text-6xl lg:text-[8.5rem] font-serif italic tracking-tighter leading-[0.8] text-white"
          >
            {region}
          </motion.h3>
          <div className="hidden lg:block text-right pb-4">
            <span className="block font-mono text-[10px] opacity-20 uppercase tracking-[0.5em]">
              Region_Cluster
            </span>
            <span className="block font-mono text-[12px] opacity-40 uppercase tracking-widest">
              {collections.length} Places // ATLAS
            </span>
          </div>
        </div>

        {/* Montage of member covers — the L1 preview */}
        <motion.div
          style={{ scale }}
          className="relative group cursor-none w-full"
          onClick={onOpen}
          data-cursor="View Region"
          role="button"
          aria-label={`View region: ${region}`}
        >
          <div className="relative aspect-[16/9] md:aspect-[21/9] overflow-hidden border border-white/5 bg-white/[0.02] flex gap-[2px]">
            {tiles.map((c) => {
              const url = c.coverImageUrl ?? c.photos?.[0]?.imageUrl ?? '';
              return (
                <div key={c._id} className="relative flex-1 overflow-hidden min-w-0">
                  {url && (
                    <motion.img
                      style={{ y: imgY }}
                      src={`${url}?auto=format&w=900&q=80`}
                      alt={c.name}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      animate={{
                        filter: isActive
                          ? 'grayscale(0) brightness(1.05)'
                          : 'grayscale(1) brightness(0.78)',
                      }}
                      transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 w-full h-[125%] object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                    />
                  )}
                  {/* per-tile label */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 flex items-baseline justify-between gap-2">
                    <span className="font-serif italic text-base md:text-xl text-white/90 tracking-tight truncate drop-shadow">
                      {c.name.trim()}
                    </span>
                    <span className="font-mono text-[9px] text-white/50 tracking-widest shrink-0">
                      {c.photoCount ?? c.photos?.length ?? 0}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* +N more places */}
            {collections.length > tiles.length && (
              <div className="absolute top-4 right-4 px-2.5 py-1 bg-black/60 backdrop-blur-sm border border-white/15 font-mono text-[9px] tracking-widest text-white/70">
                +{collections.length - tiles.length} MORE
              </div>
            )}

            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500 pointer-events-none" />
          </div>

          {/* Region-hub affordance badge */}
          <div className="absolute top-6 left-6 flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity duration-500">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))' }}
            />
            <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-white/70">
              Region Hub
            </span>
          </div>
        </motion.div>

        {/* Footer: contained places + count + CTA */}
        <div className="flex items-center justify-between gap-8 pt-2">
          <div className="space-y-2 max-w-2xl">
            <span className="text-[9px] uppercase tracking-widest opacity-20 block font-mono">
              Contains
            </span>
            <p className="text-[14px] md:text-base font-light text-white/70 tracking-tight">
              {placeNames}
              <span className="opacity-40"> · {totalFrames} frames</span>
            </p>
          </div>
          <Magnetic strength={0.45}>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.9 }}
              onClick={onOpen}
              className="group relative shrink-0"
              aria-label={`View region ${region}`}
            >
              <div className="w-24 h-24 border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all duration-500">
                <ArrowRight size={32} />
              </div>
              <div className="absolute inset-0 border border-white/5 translate-x-2 translate-y-2 -z-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform" />
            </motion.button>
          </Magnetic>
        </div>
      </div>
    </motion.section>
  );
}
