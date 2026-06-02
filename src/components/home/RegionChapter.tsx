import { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { Collection } from '../../types';
import Magnetic from '../shared/Magnetic';

const expo = [0.16, 1, 0.3, 1] as const;

interface RegionChapterProps {
  id: string;
  region: string;
  collections: Collection[]; // ≥2 member places
  /** Open the region hub (L2 — all places + highlights). */
  onOpen: () => void;
  /** Open a single place's story (L3) directly. */
  onOpenCity: (c: Collection) => void;
  index: number;
  isActive: boolean;
}

/**
 * RegionChapter — the L1 homepage unit for a multi-place region. The member
 * covers form an EXPANDING ACCORDION montage: hovering a place widens it and
 * brings it to colour while the others recede, so the row breathes instead of
 * sitting as a rigid contact-sheet grid. Each tile opens its place's story;
 * the title and the "Enter <region>" CTA open the full region hub.
 *
 * Shares ArchiveChapter's vocabulary (ghost number, serif-italic title bar,
 * scroll opacity/scale, Magnetic CTA) so it reads as the same family.
 */
export default function RegionChapter({
  id,
  region,
  collections,
  onOpen,
  onOpenCity,
  index,
  isActive,
}: RegionChapterProps) {
  const chapterRef = useRef(null);
  const [hovered, setHovered] = useState<number | null>(null);
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

      <div className="relative z-10 space-y-10">
        {/* Title bar — title doubles as the hub entry */}
        <div className="flex items-end justify-between border-b border-white/10 pb-6">
          <button onClick={onOpen} data-cursor="View Region" className="group/title text-left cursor-none">
            <motion.h3
              initial={{ x: -50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: expo }}
              className="text-5xl md:text-6xl lg:text-[8.5rem] font-serif italic tracking-tighter leading-[0.8] text-white transition-opacity duration-300 group-hover/title:opacity-80"
            >
              {region}
            </motion.h3>
          </button>
          <div className="hidden lg:block text-right pb-4">
            <span className="block font-mono text-[10px] opacity-20 uppercase tracking-[0.5em]">
              Region_Cluster
            </span>
            <span className="block font-mono text-[12px] opacity-40 uppercase tracking-widest">
              {collections.length} Places // ATLAS
            </span>
          </div>
        </div>

        {/* Expanding accordion montage — the L1 preview */}
        <motion.div
          style={{ scale }}
          className="relative flex gap-[3px] aspect-[16/9] md:aspect-[21/9] overflow-hidden border border-white/5 bg-white/[0.02]"
          onMouseLeave={() => setHovered(null)}
        >
          {tiles.map((c, i) => {
            const url = c.coverImageUrl ?? c.photos?.[0]?.imageUrl ?? '';
            const grow = hovered === null ? 1 : hovered === i ? 2.6 : 0.78;
            const lit = hovered === i || (hovered === null && isActive);
            return (
              <motion.button
                key={c._id}
                onMouseEnter={() => setHovered(i)}
                onClick={() => onOpenCity(c)}
                data-cursor="View Story"
                aria-label={`View ${c.name.trim()}`}
                initial={{ opacity: 0, y: 30, clipPath: 'inset(0 0 100% 0)' }}
                whileInView={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }}
                viewport={{ once: true, margin: '-12%' }}
                transition={{ duration: 1, delay: 0.1 * i, ease: expo }}
                style={{ flexGrow: grow }}
                className="group relative h-full basis-0 min-w-0 overflow-hidden cursor-none transition-[flex-grow] duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
              >
                {url && (
                  <motion.img
                    style={{ y: imgY }}
                    src={`${url}?auto=format&w=1000&q=80`}
                    alt={c.name}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    animate={{
                      filter: lit ? 'grayscale(0) brightness(1.04)' : 'grayscale(1) brightness(0.68)',
                      scale: hovered === i ? 1.05 : 1,
                    }}
                    transition={{ duration: 1.4, ease: expo }}
                    className="absolute inset-0 w-full h-[125%] object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                {/* Label */}
                <motion.div
                  animate={{ opacity: hovered === null || hovered === i ? 1 : 0.5 }}
                  transition={{ duration: 0.5, ease: expo }}
                  className="absolute bottom-0 left-0 right-0 p-3 md:p-5 flex items-end justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="block font-serif italic text-base md:text-2xl text-white tracking-tight truncate leading-none drop-shadow">
                      {c.name.trim()}
                    </span>
                    <motion.span
                      animate={{ opacity: hovered === i ? 1 : 0, y: hovered === i ? 0 : 6 }}
                      transition={{ duration: 0.4, ease: expo }}
                      className="mt-2 inline-flex items-center gap-1 font-mono text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-white/75"
                    >
                      View story <ArrowUpRight size={11} />
                    </motion.span>
                  </div>
                  <span className="shrink-0 font-mono text-[9px] text-white/45 tracking-widest">
                    {c.photoCount ?? c.photos?.length ?? 0}
                  </span>
                </motion.div>
              </motion.button>
            );
          })}

          {/* Overflow → hub */}
          {collections.length > tiles.length && (
            <button
              onClick={onOpen}
              data-cursor="View Region"
              aria-label={`View all ${collections.length} places in ${region}`}
              className="relative shrink-0 px-3 md:px-5 flex items-center justify-center cursor-none bg-white/[0.03] hover:bg-white/[0.07] transition-colors duration-500"
            >
              <span className="font-mono text-[10px] tracking-[0.3em] text-white/60 [writing-mode:vertical-rl] rotate-180">
                +{collections.length - tiles.length} more
              </span>
            </button>
          )}
        </motion.div>

        {/* Footer — places list + hub CTA */}
        <div className="flex items-center justify-between gap-8">
          <div className="space-y-2 max-w-2xl">
            <span className="text-[9px] uppercase tracking-widest opacity-20 block font-mono">
              In this region
            </span>
            <p className="text-[14px] md:text-base font-light text-white/70 tracking-tight">
              {collections.map((c) => c.name.trim()).join(' · ')}
              <span className="opacity-40"> · {totalFrames} frames</span>
            </p>
          </div>
          <Magnetic strength={0.45}>
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={onOpen}
              data-cursor="View Region"
              className="group shrink-0 inline-flex items-center gap-3 px-6 py-3.5 border border-white/15 hover:border-white/40 bg-white/[0.02] hover:bg-white/[0.06] transition-colors duration-500 cursor-none"
              aria-label={`Enter region ${region}`}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/70 group-hover:text-white transition-colors">
                Enter {region}
              </span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </Magnetic>
        </div>
      </div>
    </motion.section>
  );
}
