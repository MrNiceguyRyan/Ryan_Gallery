import React, { useRef, useState, useEffect, useMemo } from 'react';
import { motion, useScroll, AnimatePresence } from 'framer-motion';
import { ArrowRight, Share2, Check, MapPin } from 'lucide-react';
import type { Collection, Photo } from '../../types';
import Lightbox from '../shared/Lightbox';
import { getMapboxToken } from '../../config/mapbox';

const expo = [0.23, 1, 0.32, 1] as const;

/* ── Photo cell — editorial grid item, original aspect ratio, no cropping ── */
function PhotoCell({
  photo,
  span,
  index,
  hoveredIndex,
  setHoveredIndex,
  onClick,
  forceHero = false,
}: {
  photo: Photo;
  span: 'full' | 'half' | 'third';
  index: number;
  hoveredIndex: number | null;
  setHoveredIndex: (idx: number | null) => void;
  onClick: () => void;
  /** Force cinematic landscape crop for the first image */
  forceHero?: boolean;
}) {
  const colSpan =
    span === 'full' ? 'col-span-6'
    : span === 'half' ? 'col-span-3'
    : 'col-span-2';

  const imgWidth = span === 'full' ? 1400 : span === 'half' ? 800 : 500;

  const [isLoaded, setIsLoaded] = useState(false);
  const isAnyHovered = hoveredIndex !== null;
  const isThisHovered = hoveredIndex === index;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-5%' }}
      onHoverStart={() => setHoveredIndex(index)}
      onHoverEnd={() => setHoveredIndex(null)}
      onClick={onClick}
      animate={{
        opacity: isAnyHovered && !isThisHovered ? 0.4 : 1,
        filter: isAnyHovered && !isThisHovered ? 'blur(2px)' : 'blur(0px)',
        scale: isAnyHovered && !isThisHovered ? 0.97 : 1,
        zIndex: isThisHovered ? 20 : 1,
      }}
      whileHover={{
        scale: 1.02,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3), 0 12px 24px -8px rgba(0,0,0,0.2)',
      }}
      transition={{ duration: 0.6, ease: expo, boxShadow: { duration: 0.3 } }}
      className={`${colSpan} group relative bg-[#0A0A0A] cursor-pointer overflow-hidden ${forceHero ? 'aspect-[21/9]' : ''}`}
    >
      {/* Index number */}
      <div className="absolute top-3 right-3 z-20 text-[7px] font-mono text-white/0 group-hover:text-white/40 transition-colors duration-700 pointer-events-none">
        {String(index + 1).padStart(2, '0')}
      </div>

      {/* Loading placeholder */}
      <motion.div
        animate={{ opacity: isLoaded ? 0 : 1 }}
        transition={{ duration: 0.6 }}
        className="absolute inset-0 bg-white/5 z-10 pointer-events-none"
      />

      {/* Image — hero uses landscape crop, others show original aspect ratio */}
      <motion.img
        onLoad={() => setIsLoaded(true)}
        whileHover={{ scale: 1.04 }}
        transition={{ duration: 1.2, ease: expo }}
        src={`${photo.imageUrl}?auto=format&w=${imgWidth}&q=82`}
        alt={photo.title || ''}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        className={forceHero
          ? "absolute inset-0 w-full h-full object-cover grayscale-[0.15] hover:grayscale-0 transition-[filter] duration-[1.2s]"
          : "w-full h-auto block grayscale-[0.15] hover:grayscale-0 transition-[filter] duration-[1.2s]"
        }
        loading="lazy"
        draggable={false}
      />
    </motion.div>
  );
}

/* ── Full-screen lightbox using existing shared component ── */
function LightboxShell({
  photos,
  activeIndex,
  onClose,
}: {
  photos: Photo[];
  activeIndex: number;
  onClose: () => void;
}) {
  return (
    <Lightbox photos={photos} initialIndex={activeIndex} onClose={onClose} zIndex={60} />
  );
}

/* ══════════════════════════════════════════════════════════
 *  MagazineLayout — dark-theme collection detail overlay
 * ══════════════════════════════════════════════════════════ */
export default function MagazineLayout({
  collection,
  allCollections,
  onSelectCollection,
  onClose,
}: {
  collection: Collection;
  allCollections: Collection[];
  onSelectCollection: (c: Collection) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: containerRef });
  const [scrollPercent, setScrollPercent] = useState(0);
  const [isShared, setIsShared] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const photos = collection.photos || [];

  useEffect(() => {
    return scrollYProgress.on('change', (latest) => {
      setScrollPercent(Math.round(latest * 100));
    });
  }, [scrollYProgress]);

  // Next story
  const currentIndex = allCollections.findIndex((c) => c._id === collection._id);
  const nextCollection = allCollections[(currentIndex + 1) % allCollections.length];

  // Coords from first geotagged photo
  const coords = useMemo(() => {
    const p = photos.find((ph) => ph.location?.lat != null && ph.location?.lng != null);
    return p?.location || null;
  }, [photos]);

  const mapboxToken = useMemo(() => {
    try { return getMapboxToken(); } catch { return ''; }
  }, []);

  const handleShare = async () => {
    const shareData = {
      title: `Ryan Xu | ${collection.name}`,
      text: collection.description || '',
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setIsShared(true);
        setTimeout(() => setIsShared(false), 2000);
      }
    } catch (_) {}
  };

  /* 7-image editorial cycle: full → half×2 → full → third×3, repeat */

  return (
    <>
      {/* Overlay shell — slide-up/down */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center bg-black/40 backdrop-blur-sm"
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.9, ease: [0.32, 0, 0.07, 1] }}
          ref={containerRef}
          className="w-full h-full overflow-y-auto no-scrollbar relative bg-[#0A0A0A] text-[#FDFDFB]"
        >
          {/* Sticky header */}
          <div className="sticky top-0 left-0 w-full z-10 px-6 py-6 md:px-12 flex justify-between items-center backdrop-blur-3xl bg-black/80 border-b border-white/5">
            <button
              onClick={onClose}
              className="flex items-center gap-3 text-[10px] uppercase tracking-[0.4em] font-bold hover:opacity-50 transition-all hover:gap-5"
            >
              <ArrowRight size={16} className="rotate-180" /> Back
            </button>
            <div className="text-[11px] uppercase tracking-[0.6em] font-bold opacity-30">
              {collection.location || collection.name}
            </div>
          </div>

          {/* Content */}
          <div className="relative z-0 px-6 md:px-12">
            <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply z-[80] paper-texture" />

            <div className="max-w-7xl mx-auto py-12 md:py-24 relative">
              <div className="grid lg:grid-cols-12 gap-8 md:gap-12 relative z-10">
                {/* Sticky sidebar */}
                <aside className="lg:col-span-4 lg:sticky lg:top-32 h-fit space-y-16">
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] uppercase tracking-[0.6em] font-bold opacity-30">
                        Vol. 01
                      </span>
                      <div className="h-[1px] flex-1 bg-white/10" />
                    </div>
                    <h2 className="text-5xl md:text-7xl lg:text-8xl font-serif italic tracking-tighter leading-[0.8]">
                      {collection.name}
                    </h2>
                    <div className="flex items-center gap-4 pt-4">
                      <p className="text-[10px] uppercase tracking-[0.4em] font-bold">
                        {collection.location || ''}
                      </p>
                      <div className="w-1 h-1 rounded-full bg-white/20" />
                      <p className="text-[10px] uppercase tracking-[0.4em] opacity-40 font-mono italic">
                        {collection.year || ''}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-10">
                    {collection.description && (
                      <p className="text-xl leading-relaxed font-serif opacity-80">
                        {collection.description}
                      </p>
                    )}

                    {/* Scroll progress */}
                    <div className="pt-12 space-y-4">
                      <div className="flex justify-between text-[9px] uppercase tracking-widest font-bold opacity-30">
                        <span>Reading Progress</span>
                        <span className="font-mono">{scrollPercent}%</span>
                      </div>
                      <div className="h-[1px] w-full bg-white/5 relative overflow-hidden">
                        <motion.div
                          className="absolute top-0 left-0 h-full bg-white"
                          style={{ width: `${scrollPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="hidden lg:block pt-12">
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-[1px] bg-white opacity-10" />
                      <span className="text-[9px] uppercase tracking-[0.4em] font-mono opacity-30">
                        {photos.length} Captured Frames
                      </span>
                    </div>
                  </div>

                  {/* Mini-map — bottom of sidebar, immersive hover */}
                  {coords && mapboxToken && (
                    <motion.a
                      href={`/travel#loc=${coords.lat},${coords.lng},8`}
                      className="group block relative overflow-hidden rounded-xl"
                      whileHover={{ scale: 1.02 }}
                      transition={{ duration: 0.5, ease: expo }}
                    >
                      {/* Map image — larger, fills container */}
                      <div className="relative h-40 overflow-hidden rounded-xl bg-white/[0.03]">
                        <motion.img
                          src={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-s+ffffff(${coords.lng},${coords.lat})/${coords.lng},${coords.lat},6,0/600x320@2x?access_token=${mapboxToken}`}
                          className="absolute inset-0 w-full h-full object-cover"
                          alt="Location map"
                          draggable={false}
                          initial={{ opacity: 0.4, scale: 1.1 }}
                          whileHover={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.8, ease: expo }}
                        />
                        {/* Gradient vignette */}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-transparent opacity-80" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/40 to-transparent" />
                        {/* Subtle scan line */}
                        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)' }} />
                      </div>

                      {/* Overlay info */}
                      <div className="absolute inset-0 flex flex-col justify-end p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <motion.div
                            className="w-1.5 h-1.5 rounded-full bg-white/60"
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                          />
                          <span className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/40 group-hover:text-white/80 transition-colors duration-500">
                            {coords.lat.toFixed(4)}°N, {Math.abs(coords.lng).toFixed(4)}°{coords.lng >= 0 ? 'E' : 'W'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <MapPin size={10} className="text-white/30 group-hover:text-white/70 transition-colors duration-500" />
                            <span className="text-[9px] uppercase tracking-[0.3em] font-bold text-white/30 group-hover:text-white/80 transition-colors duration-500">
                              View on Map
                            </span>
                          </div>
                          <motion.div
                            className="flex items-center gap-1 text-white/20 group-hover:text-white/60 transition-colors duration-500"
                            whileHover={{ x: 3 }}
                          >
                            <ArrowRight size={11} />
                          </motion.div>
                        </div>
                      </div>

                      {/* Hover border glow */}
                      <div className="absolute inset-0 rounded-xl border border-white/0 group-hover:border-white/10 transition-colors duration-700 pointer-events-none" />
                    </motion.a>
                  )}
                </aside>

                {/* Dense Photo Grid — 7-image editorial cycle, tight gaps */}
                <div className="lg:col-span-8 space-y-2 md:space-y-3">
                  {photos.reduce<React.ReactNode[][]>((acc, photo, idx) => {
                    const p = idx % 7;
                    /* Image 1: full-width hero (first image forced landscape) */
                    if (p === 0) {
                      acc.push([
                        <PhotoCell key={photo._id} photo={photo} span="full" index={idx} hoveredIndex={hoveredIndex} setHoveredIndex={setHoveredIndex} onClick={() => setLightboxIndex(idx)} forceHero={idx === 0} />,
                      ]);
                    }
                    /* Images 2 & 3: half + half */
                    else if (p === 1) {
                      const next = photos[idx + 1];
                      const row: React.ReactNode[] = [
                        <PhotoCell key={photo._id} photo={photo} span="half" index={idx} hoveredIndex={hoveredIndex} setHoveredIndex={setHoveredIndex} onClick={() => setLightboxIndex(idx)} />,
                      ];
                      if (next) row.push(
                        <PhotoCell key={next._id} photo={next} span="half" index={idx + 1} hoveredIndex={hoveredIndex} setHoveredIndex={setHoveredIndex} onClick={() => setLightboxIndex(idx + 1)} />,
                      );
                      acc.push(row);
                    }
                    else if (p === 2) { /* skip — handled by p===1 */ }
                    /* Image 4: full-width hero */
                    else if (p === 3) {
                      acc.push([
                        <PhotoCell key={photo._id} photo={photo} span="full" index={idx} hoveredIndex={hoveredIndex} setHoveredIndex={setHoveredIndex} onClick={() => setLightboxIndex(idx)} />,
                      ]);
                    }
                    /* Images 5, 6 & 7: third + third + third */
                    else if (p === 4) {
                      const n1 = photos[idx + 1];
                      const n2 = photos[idx + 2];
                      const row: React.ReactNode[] = [
                        <PhotoCell key={photo._id} photo={photo} span="third" index={idx} hoveredIndex={hoveredIndex} setHoveredIndex={setHoveredIndex} onClick={() => setLightboxIndex(idx)} />,
                      ];
                      if (n1) row.push(
                        <PhotoCell key={n1._id} photo={n1} span="third" index={idx + 1} hoveredIndex={hoveredIndex} setHoveredIndex={setHoveredIndex} onClick={() => setLightboxIndex(idx + 1)} />,
                      );
                      if (n2) row.push(
                        <PhotoCell key={n2._id} photo={n2} span="third" index={idx + 2} hoveredIndex={hoveredIndex} setHoveredIndex={setHoveredIndex} onClick={() => setLightboxIndex(idx + 2)} />,
                      );
                      acc.push(row);
                    }
                    else if (p === 5 || p === 6) { /* skip — handled by p===4 */ }
                    return acc;
                  }, []).map((row, rowIdx) => (
                    <div key={rowIdx} className="grid grid-cols-6 gap-2 md:gap-3 items-end">
                      {row}
                    </div>
                  ))}

                  {/* Footer */}
                  <footer className="pt-32 pb-12 flex flex-col items-center gap-24 border-t border-white/5">
                    {/* Next Story */}
                    {nextCollection && (
                      <div
                        className="w-full flex flex-col items-center gap-12 group cursor-pointer"
                        onClick={() => onSelectCollection(nextCollection)}
                      >
                        <span className="text-[10px] uppercase tracking-[0.6em] font-bold opacity-30">
                          Keep Reading
                        </span>
                        <div className="flex flex-col items-center gap-8">
                          <h3 className="text-4xl md:text-6xl font-serif italic tracking-tighter hover:scale-105 transition-transform duration-[1.5s]">
                            {nextCollection.name}
                          </h3>
                          {nextCollection.coverImageUrl && (
                            <div className="w-48 h-32 overflow-hidden opacity-40 group-hover:opacity-100 transition-opacity duration-[1s]">
                              <img
                                src={`${nextCollection.coverImageUrl}?auto=format&w=600&q=60`}
                                className="w-full h-full object-cover scale-110 group-hover:scale-100 transition-transform duration-[2s]"
                                draggable={false}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row items-center justify-center gap-12 w-full">
                      <button onClick={handleShare} className="group flex flex-col items-center gap-4">
                        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all duration-500">
                          {isShared ? <Check size={16} /> : <Share2 size={16} />}
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.4em] font-bold opacity-30 group-hover:opacity-100 transition-opacity">
                          {isShared ? 'Link Copied' : 'Share Story'}
                        </span>
                      </button>

                      <button
                        onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="group flex flex-col items-center gap-4"
                      >
                        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all duration-500">
                          <ArrowRight className="-rotate-90" size={16} />
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.4em] font-bold opacity-30 group-hover:opacity-100 transition-opacity">
                          Back to Top
                        </span>
                      </button>
                    </div>
                  </footer>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <LightboxShell
            photos={photos}
            activeIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
