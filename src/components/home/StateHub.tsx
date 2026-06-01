import { useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, MapPin, Layers } from 'lucide-react';
import type { Collection } from '../../types';
import {
  collectionCover,
  collectionFrameCount,
  stateFrameCount,
  firstCoords,
  stateFeaturedPhotos,
} from '../../lib/stateGrouping';

const expo = [0.23, 1, 0.32, 1] as const;

/* ── A single city card inside the hub ── */
function CityCard({
  collection,
  index,
  onClick,
}: {
  collection: Collection;
  index: number;
  onClick: () => void;
}) {
  const cover = collectionCover(collection);
  const frames = collectionFrameCount(collection);

  return (
    <motion.button
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-5%' }}
      transition={{ duration: 0.7, ease: expo, delay: Math.min(index * 0.05, 0.4) }}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group relative text-left overflow-hidden bg-white/[0.02] border border-white/5 hover:border-white/15 transition-colors duration-500"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {cover && (
          <motion.img
            src={`${cover}?auto=format&w=700&q=78`}
            srcSet={`${cover}?auto=format&w=500&q=78 500w, ${cover}?auto=format&w=800&q=78 800w`}
            sizes="(min-width: 1024px) 25vw, 50vw"
            alt={collection.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover grayscale-[0.4] group-hover:grayscale-0 transition-all duration-[1200ms] scale-105 group-hover:scale-100"
            draggable={false}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

        {/* Index */}
        <div className="absolute top-3 left-3 font-mono text-[8px] tracking-[0.3em] text-white/40">
          {String(index + 1).padStart(2, '0')}
        </div>

        {/* Title + meta */}
        <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
          <h4 className="text-2xl md:text-3xl font-serif italic tracking-tight leading-none text-white">
            {collection.name}
          </h4>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.3em] font-mono opacity-50">
              {frames} Frames{collection.year ? ` · ${collection.year}` : ''}
            </span>
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-[0.3em] font-bold opacity-40 group-hover:opacity-100 transition-opacity duration-300">
              Story <ArrowRight size={11} className="group-hover:translate-x-1 transition-transform duration-300" />
            </span>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 *  StateHub — full-screen overlay listing every city inside one state.
 *
 *  This is the "L2" layer that resolves the "content gets hidden when you
 *  cluster" worry: the hub indexes ALL cities of the state in full, plus a
 *  featured strip of frames pulled across them. Clicking a city defers to
 *  the parent's `onSelectCollection`, which opens the existing MagazineLayout
 *  (rendered above this overlay).
 * ══════════════════════════════════════════════════════════════════════ */
export default function StateHub({
  state,
  collections,
  onSelectCollection,
  onClose,
}: {
  state: string;
  collections: Collection[];
  onSelectCollection: (c: Collection) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const cityCount = collections.length;
  const frameCount = useMemo(() => stateFrameCount(collections), [collections]);
  const coords = useMemo(() => firstCoords(collections), [collections]);
  const featured = useMemo(() => stateFeaturedPhotos(collections, 12), [collections]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTo({ top: 0, behavior: 'auto' });
  }, [state]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.85, ease: [0.32, 0, 0.07, 1] }}
        ref={containerRef}
        className="w-full h-full overflow-y-auto no-scrollbar relative bg-[#0A0A0A] text-[#FDFDFB]"
      >
        {/* Sticky header */}
        <div
          className="sticky top-0 left-0 w-full z-20 px-5 py-4 md:px-12 md:py-6 flex justify-between items-center backdrop-blur-3xl bg-black/80 border-b border-white/5"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <motion.button
            onClick={onClose}
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.96, x: -4 }}
            transition={{ duration: 0.2, ease: expo }}
            className="flex items-center gap-3 text-[10px] uppercase tracking-[0.4em] font-bold hover:opacity-60 transition-opacity min-h-[44px] -ml-1 pl-1 pr-2"
          >
            <ArrowRight size={16} className="rotate-180" /> Archive
          </motion.button>
          <div className="flex items-center gap-2 text-[9px] md:text-[11px] uppercase tracking-[0.4em] md:tracking-[0.6em] font-bold opacity-30">
            <Layers size={12} /> {state}
          </div>
        </div>

        <div className="relative z-0 px-6 md:px-12">
          <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply z-[80] paper-texture" />

          <div className="max-w-7xl mx-auto py-12 md:py-20 relative">
            {/* ── Region masthead ── */}
            <header className="space-y-6 mb-12 md:mb-20">
              <div className="flex items-center gap-4">
                <span className="text-[10px] uppercase tracking-[0.6em] font-bold opacity-30">
                  Region
                </span>
                <div className="h-[1px] flex-1 bg-white/10" />
                <span className="text-[10px] uppercase tracking-[0.4em] font-mono opacity-40">
                  {cityCount} Cities · {frameCount} Frames
                </span>
              </div>
              <h2 className="text-6xl md:text-8xl lg:text-9xl font-serif italic tracking-tighter leading-[0.85]">
                {state}
              </h2>
              <p className="max-w-xl text-[13px] md:text-[15px] leading-[1.7] font-serif italic opacity-60">
                A region of the archive — {cityCount} distinct cities gathered under one roof.
                Step into any of them below, or trace the whole territory on the map.
              </p>

              {/* View on map */}
              {coords && (
                <a
                  href={`/travel#loc=${coords.lat},${coords.lng},6`}
                  className="group inline-flex items-center gap-3 mt-2 px-5 py-3 border border-white/10 hover:border-white/30 rounded-full transition-colors duration-300"
                >
                  <MapPin size={13} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                  <span className="text-[10px] uppercase tracking-[0.3em] font-bold opacity-60 group-hover:opacity-100 transition-opacity">
                    View region on map
                  </span>
                  <ArrowRight size={13} className="opacity-40 group-hover:translate-x-1 group-hover:opacity-100 transition-all" />
                </a>
              )}
            </header>

            {/* ── Featured frames strip ── */}
            {featured.length > 0 && (
              <section className="mb-14 md:mb-20">
                <div className="flex items-center gap-3 mb-5 text-[9px] uppercase tracking-[0.5em] font-bold opacity-30">
                  <div className="w-8 h-px bg-white/30" />
                  <span>Selected Frames</span>
                </div>
                <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar pb-2 -mx-6 px-6 md:mx-0 md:px-0 snap-x">
                  {featured.map((photo, i) => (
                    <motion.div
                      key={photo._id}
                      initial={{ opacity: 0, x: 30 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, ease: expo, delay: Math.min(i * 0.04, 0.3) }}
                      className="relative shrink-0 w-[60vw] sm:w-[40vw] md:w-72 aspect-[3/2] overflow-hidden bg-white/[0.03] snap-start"
                    >
                      <img
                        src={`${photo.imageUrl}?auto=format&w=700&q=78`}
                        alt={photo.title || 'Frame'}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover grayscale-[0.3] hover:grayscale-0 transition-all duration-700"
                        draggable={false}
                      />
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* ── City index — every city, nothing hidden ── */}
            <section>
              <div className="flex items-center gap-3 mb-6 text-[9px] uppercase tracking-[0.5em] font-bold opacity-30">
                <div className="w-8 h-px bg-white/30" />
                <span>Cities — {cityCount}</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
                {collections.map((c, i) => (
                  <CityCard
                    key={c._id}
                    collection={c}
                    index={i}
                    onClick={() => onSelectCollection(c)}
                  />
                ))}
              </div>
            </section>

            <footer className="pt-24 pb-12 flex flex-col items-center gap-6 border-t border-white/5 mt-20 opacity-40">
              <span className="text-2xl font-serif italic tracking-tighter">{state}</span>
              <span className="text-[9px] uppercase tracking-[0.4em] font-mono">
                {cityCount} Cities · {frameCount} Frames
              </span>
            </footer>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
