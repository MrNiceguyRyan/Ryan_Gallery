import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, X, MapPin } from 'lucide-react';
import type { Collection } from '../../types';
import Magnetic from '../shared/Magnetic';

interface RegionHubProps {
  region: string;
  collections: Collection[];
  onSelectCollection: (c: Collection) => void;
  onClose: () => void;
}

const expo = [0.16, 1, 0.3, 1] as const;

/**
 * RegionHub — the L2 overlay for a multi-place region. Full-screen dark
 * editorial sheet (mirrors MagazineLayout's chrome) that lays out EVERY place
 * in the region as a card, above a horizontal strip of the region's best
 * frames. This is where "full display" lives: nothing about the region is
 * hidden. A city card opens its L3 story (MagazineLayout) layered on top, and
 * a "View on map" link drops to /travel — the flat, everything-at-once index.
 */
export default function RegionHub({ region, collections, onSelectCollection, onClose }: RegionHubProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const totalFrames = collections.reduce(
    (n, c) => n + (c.photoCount ?? c.photos?.length ?? 0),
    0,
  );

  // Featured strip — a few frames from across every member place.
  const featured = useMemo(
    () =>
      collections
        .flatMap((c) => (c.photos || []).slice(0, 3).map((p) => ({ photo: p, collection: c })))
        .slice(0, 12),
    [collections],
  );

  return (
    <motion.div
      key="region-hub"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: expo }}
      className="fixed inset-0 z-50 bg-[#0A0A0A] text-[#FDFDFB] overflow-y-auto overflow-x-hidden"
    >
      {/* Newsprint halftone + accent wash */}
      <div className="fixed inset-0 newsprint-screen opacity-[0.05] pointer-events-none" />
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60vmax 50vmax at 16% 108%, rgba(var(--accent-r,255),var(--accent-g,255),var(--accent-b,255),0.10), transparent 70%)',
        }}
      />

      {/* Masthead */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-4 md:px-12 md:py-6 backdrop-blur-3xl bg-[#0A0A0A]/80 border-b border-white/5">
        <div className="flex items-baseline gap-4 font-mono text-[10px] tracking-[0.42em] uppercase">
          <span className="font-medium text-white/60">The Journal Gallery</span>
          <span className="text-white/30 hidden sm:inline">// Region</span>
        </div>
        <Magnetic strength={0.4}>
          <button
            onClick={onClose}
            data-cursor="Close"
            aria-label="Close region"
            className="group flex items-center gap-2 text-white/60 hover:text-white transition-colors"
          >
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase hidden sm:inline">Close</span>
            <X size={18} />
          </button>
        </Magnetic>
      </div>

      <div className="relative z-10 px-5 md:px-12 pb-24">
        {/* Hero */}
        <header className="pt-12 md:pt-20 pb-10 md:pb-14 border-b border-white/10">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: expo }}
            className="flex items-center gap-2 font-mono text-[10px] tracking-[0.5em] uppercase"
            style={{ color: 'rgba(var(--accent-r,255),var(--accent-g,255),var(--accent-b,255),0.85)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgb(var(--accent-r,255),var(--accent-g,255),var(--accent-b,255))' }} />
            // region dispatch
          </motion.span>
          <div className="overflow-hidden mt-3">
            <motion.h1
              initial={{ y: '110%' }}
              animate={{ y: '0%' }}
              transition={{ duration: 0.9, delay: 0.18, ease: expo }}
              className="font-serif italic tracking-tighter leading-[0.85] text-white"
              style={{ fontSize: 'clamp(48px, 10vw, 132px)' }}
            >
              {region}
            </motion.h1>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-5 flex items-center gap-3 font-mono text-[11px] tracking-[0.3em] uppercase text-white/40"
          >
            <span>{collections.length} places</span>
            <span className="w-[3px] h-[3px] rounded-full bg-white/40" />
            <span>{totalFrames} frames</span>
          </motion.div>
        </header>

        {/* Featured frames strip */}
        {featured.length > 0 && (
          <section className="py-8 md:py-10 border-b border-white/10">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-px bg-white/30" />
              <span className="text-[9px] uppercase tracking-[0.5em] font-bold opacity-30">Highlights</span>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x pb-2 -mx-1 px-1">
              {featured.map(({ photo, collection }, i) => (
                <motion.button
                  key={photo._id}
                  onClick={() => onSelectCollection(collection)}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.05 * i, ease: expo }}
                  whileHover={{ y: -4 }}
                  data-cursor="View Story"
                  className="group relative shrink-0 w-44 md:w-56 aspect-[4/5] overflow-hidden border border-white/10 snap-start cursor-none"
                >
                  <img
                    src={`${photo.imageUrl}?auto=format&w=500&q=70`}
                    alt={photo.title || collection.name}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 scale-105 group-hover:scale-100 transition-all duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <span className="absolute bottom-3 left-3 right-3 font-mono text-[9px] tracking-[0.25em] uppercase text-white/70 truncate">
                    {collection.name.trim()}
                  </span>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* City grid — every place in the region */}
        <section className="py-8 md:py-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-px bg-white/30" />
            <span className="text-[9px] uppercase tracking-[0.5em] font-bold opacity-30">
              Places in {region}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {collections.map((c, i) => {
              const url = c.coverImageUrl ?? c.photos?.[0]?.imageUrl ?? '';
              const count = c.photoCount ?? c.photos?.length ?? 0;
              return (
                <motion.button
                  key={c._id}
                  onClick={() => onSelectCollection(c)}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.06 * i, ease: expo }}
                  whileHover={{ y: -6 }}
                  data-cursor="View Story"
                  className="group relative text-left cursor-none"
                >
                  <div className="relative aspect-[3/4] overflow-hidden border border-white/10 bg-white/[0.02]">
                    {url && (
                      <img
                        src={`${url}?auto=format&w=700&q=75`}
                        alt={c.name}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 scale-105 group-hover:scale-100 transition-all duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between gap-3">
                      <div>
                        <h3 className="font-serif italic text-2xl md:text-3xl tracking-tight text-white leading-none">
                          {c.name.trim()}
                        </h3>
                        <p className="mt-2 font-mono text-[9px] tracking-[0.3em] uppercase text-white/45">
                          {count} frames{c.location ? ` · ${c.location}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 w-9 h-9 rounded-full border border-white/20 flex items-center justify-center text-white/70 group-hover:bg-white group-hover:text-black transition-all duration-500">
                        <ArrowRight size={16} />
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Map fallback — the flat index */}
        <div className="pt-4 flex justify-center">
          <Magnetic strength={0.4}>
            <a
              href="/travel"
              data-cursor="Open Map"
              className="group inline-flex items-center gap-3 px-6 py-3 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 transition-colors duration-300 font-mono text-[10px] tracking-[0.3em] uppercase text-white/70 hover:text-white"
            >
              <MapPin size={14} />
              View {region} on the map
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </a>
          </Magnetic>
        </div>
      </div>
    </motion.div>
  );
}
