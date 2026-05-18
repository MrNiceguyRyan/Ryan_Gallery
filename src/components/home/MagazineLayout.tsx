import React, { useRef, useState, useEffect, useMemo } from 'react';
import { motion, useScroll, AnimatePresence } from 'framer-motion';
import { ArrowRight, Share2, Check, MapPin } from 'lucide-react';
import type { Collection, Photo } from '../../types';
import Lightbox from '../shared/Lightbox';
import { getMapboxToken } from '../../config/mapbox';
import { EDITORIAL_FALLBACKS, renderPortableText, renderFallback } from '../../lib/narratives';

const expo = [0.23, 1, 0.32, 1] as const;

/* ── Photo cell — editorial grid item, original aspect ratio, no cropping ── */
function PhotoCell({
  photo,
  span,
  index,
  hoveredIndex,
  setHoveredIndex,
  onClick,
}: {
  photo: Photo;
  span: 'full' | 'half' | 'third';
  index: number;
  hoveredIndex: number | null;
  setHoveredIndex: (idx: number | null) => void;
  onClick: () => void;
}) {
  const colSpan =
    span === 'full' ? 'col-span-6'
    : span === 'half' ? 'col-span-3'
    : 'col-span-2';

  // Width brackets per span — Retina-aware. The browser picks based on `sizes`.
  const widthLadder =
    span === 'full' ? [900, 1400, 1800] :
    span === 'half' ? [500, 800, 1200] :
                      [300, 500, 800];
  const fallbackWidth = widthLadder[1];
  const srcSet = widthLadder
    .map((w) => `${photo.imageUrl}?auto=format&w=${w}&q=82 ${w}w`)
    .join(', ');
  const sizesAttr =
    span === 'full' ? '(min-width: 1024px) 60vw, 100vw' :
    span === 'half' ? '(min-width: 1024px) 30vw, 50vw' :
                      '(min-width: 1024px) 20vw, 33vw';

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
      className={`${colSpan} group relative bg-[#0A0A0A] cursor-pointer overflow-hidden`}
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

      {/* Image — original aspect ratio, no cropping */}
      <motion.img
        onLoad={() => setIsLoaded(true)}
        whileHover={{ scale: 1.04 }}
        transition={{ duration: 1.2, ease: expo }}
        src={`${photo.imageUrl}?auto=format&w=${fallbackWidth}&q=82`}
        srcSet={srcSet}
        sizes={sizesAttr}
        alt={photo.title || `Photograph by Ryan Xu — frame ${index + 1}`}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        className="w-full h-auto block grayscale-[0.15] hover:grayscale-0 transition-[filter] duration-[600ms]"
        loading="lazy"
        decoding="async"
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

  // Reorder photos so the first landscape (horizontal) photo leads the story
  const photos = useMemo(() => {
    const raw = collection.photos || [];
    if (raw.length === 0) return raw;
    // If first photo is already landscape, no reorder needed
    const first = raw[0];
    if (first.width && first.height && first.width > first.height) return raw;
    // Find first landscape photo and move it to front
    const landscapeIdx = raw.findIndex(p => p.width && p.height && p.width > p.height);
    if (landscapeIdx <= 0) return raw; // none found or already first
    const reordered = [...raw];
    const [landscape] = reordered.splice(landscapeIdx, 1);
    reordered.unshift(landscape);
    return reordered;
  }, [collection.photos]);

  useEffect(() => {
    return scrollYProgress.on('change', (latest) => {
      setScrollPercent(Math.round(latest * 100));
    });
  }, [scrollYProgress]);

  // Reset internal scroll position whenever the user switches to a new
  // collection (e.g. clicks "Keep Reading"). Without this the next story
  // opens at the bottom — wherever the user clicked from.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'auto' });
  }, [collection._id]);

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
          {/* Sticky header — top padding honors iOS notch safe-area */}
          <div
            className="sticky top-0 left-0 w-full z-10 px-5 py-4 md:px-12 md:py-6 flex justify-between items-center backdrop-blur-3xl bg-black/80 border-b border-white/5"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
          >
            <motion.button
              onClick={onClose}
              whileHover={{ x: -2 }}
              whileTap={{ scale: 0.96, x: -4 }}
              transition={{ duration: 0.2, ease: expo }}
              className="flex items-center gap-3 text-[10px] uppercase tracking-[0.4em] font-bold hover:opacity-60 transition-opacity min-h-[44px] -ml-1 pl-1 pr-2"
            >
              <ArrowRight size={16} className="rotate-180" /> Back
            </motion.button>
            <div className="text-[9px] md:text-[11px] uppercase tracking-[0.4em] md:tracking-[0.6em] font-bold opacity-30 truncate max-w-[55vw] md:max-w-none">
              {collection.location || collection.name}
            </div>
          </div>

          {/* Content */}
          <div className="relative z-0 px-6 md:px-12">
            <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply z-[80] paper-texture" />

            <div className="max-w-7xl mx-auto py-12 md:py-24 relative">
              <div className="grid lg:grid-cols-12 gap-8 md:gap-12 relative z-10">
                {/* ── Sidebar — fixed to viewport on desktop, three vertical regions:
                       TOP: compact header (Vol/name/meta) — never scrolls
                       MIDDLE: editorial introduction — scrolls internally if long
                       BOTTOM: scroll progress + frame count + mini-map — always pinned

                       Total height computed from the sticky offset (top-24 = 6rem)
                       and the sticky header (h-16 ≈ 4rem) plus breathing room,
                       so the whole sidebar fits inside the viewport with no
                       outer scrollbar. */}
                <aside className="lg:col-span-4 lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:flex lg:flex-col gap-8 lg:gap-6 xl:gap-8 space-y-8 lg:space-y-0">
                  {/* TOP — header */}
                  <header className="lg:shrink-0 space-y-4">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] uppercase tracking-[0.6em] font-bold opacity-30">
                        Vol. 01
                      </span>
                      <div className="h-[1px] flex-1 bg-white/10" />
                    </div>
                    <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif italic tracking-tighter leading-[0.85]">
                      {collection.name}
                    </h2>
                    <div className="flex items-center gap-4">
                      <p className="text-[10px] uppercase tracking-[0.4em] font-bold">
                        {collection.location || ''}
                      </p>
                      {collection.location && collection.year && (
                        <div className="w-1 h-1 rounded-full bg-white/20" />
                      )}
                      <p className="text-[10px] uppercase tracking-[0.4em] opacity-40 font-mono italic">
                        {collection.year || ''}
                      </p>
                    </div>
                  </header>

                  {/* MIDDLE — editorial introduction. Scrolls inside its own
                       box if the narrative is long, so the bottom region
                       (progress + map) stays pinned. */}
                  {(() => {
                    const hasIntro = collection.introduction && collection.introduction.length > 0;
                    const fallbackParas = collection.slug ? EDITORIAL_FALLBACKS[collection.slug] : null;
                    const showDescriptionFallback = !hasIntro && !fallbackParas && collection.description;
                    if (!hasIntro && !fallbackParas && !showDescriptionFallback) {
                      return <div className="flex-1 min-h-0" />;
                    }
                    return (
                      <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto no-scrollbar lg:pr-2 lg:-mr-2 text-[14px] md:text-[15px] leading-[1.7] font-serif italic opacity-75">
                        <span className="text-4xl md:text-5xl float-left mr-2.5 mt-1 font-serif not-italic leading-none opacity-25 select-none">&ldquo;</span>
                        {hasIntro
                          ? renderPortableText(collection.introduction!, 'border-white/15')
                          : fallbackParas
                            ? renderFallback(fallbackParas)
                            : <p>{collection.description}</p>}
                      </div>
                    );
                  })()}

                  {/* BOTTOM — pinned: scroll progress + frame count + mini-map */}
                  <footer className="lg:shrink-0 space-y-5">
                    {/* Scroll progress */}
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-[9px] uppercase tracking-widest font-bold opacity-30">
                        <span>Reading Progress</span>
                        <span className="font-mono">{scrollPercent}%</span>
                      </div>
                      <div className="h-[1px] w-full bg-white/5 relative overflow-hidden">
                        <motion.div
                          className="absolute top-0 left-0 h-full bg-white"
                          style={{ width: `${scrollPercent}%` }}
                          transition={{ duration: 0.15, ease: 'linear' }}
                        />
                      </div>
                    </div>

                    {/* Frame count — compact line */}
                    <div className="hidden lg:flex items-center gap-3 text-[9px] uppercase tracking-[0.4em] font-mono opacity-30">
                      <div className="w-8 h-[1px] bg-white opacity-30" />
                      <span>{photos.length} Captured Frames</span>
                    </div>

                    {/* Mini-map — immersive hover */}
                    {coords && mapboxToken && (
                      <motion.a
                        href={`/travel#loc=${coords.lat},${coords.lng},8`}
                        className="group block relative overflow-hidden rounded-xl"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.35, ease: expo }}
                      >
                        {/* Aspect-locked: matches the Mapbox source aspect (600×320 ≈ 15:8)
                             so the static map image renders edge-to-edge at any width
                             without object-cover cropping the top/bottom. */}
                        <div className="relative aspect-[15/8] lg:aspect-auto lg:h-28 xl:h-32 overflow-hidden rounded-xl bg-white/[0.03]">
                          <motion.img
                            src={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-s+ffffff(${coords.lng},${coords.lat})/${coords.lng},${coords.lat},6,0/600x320@2x?access_token=${mapboxToken}`}
                            className="absolute inset-0 w-full h-full object-cover"
                            alt="Location map"
                            draggable={false}
                            initial={{ opacity: 0.45, scale: 1.08 }}
                            whileHover={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.55, ease: expo }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-transparent opacity-80" />
                          <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/40 to-transparent" />
                          <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)' }} />
                        </div>

                        <div className="absolute inset-0 flex flex-col justify-end p-4">
                          <div className="flex items-center gap-2 mb-1.5">
                            <motion.div
                              className="w-1.5 h-1.5 rounded-full bg-white/60"
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <span className="text-[8px] font-mono uppercase tracking-[0.3em] text-white/40 group-hover:text-white/80 transition-colors duration-300">
                              {coords.lat.toFixed(4)}°N, {Math.abs(coords.lng).toFixed(4)}°{coords.lng >= 0 ? 'E' : 'W'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <MapPin size={10} className="text-white/30 group-hover:text-white/70 transition-colors duration-300" />
                              <span className="text-[9px] uppercase tracking-[0.3em] font-bold text-white/30 group-hover:text-white/80 transition-colors duration-300">
                                View on Map
                              </span>
                            </div>
                            <motion.div
                              className="flex items-center gap-1 text-white/20 group-hover:text-white/60 transition-colors duration-300"
                              whileHover={{ x: 3 }}
                            >
                              <ArrowRight size={11} />
                            </motion.div>
                          </div>
                        </div>

                        <div className="absolute inset-0 rounded-xl border border-white/0 group-hover:border-white/15 transition-colors duration-300 pointer-events-none" />
                      </motion.a>
                    )}
                  </footer>
                </aside>

                {/* Dense Photo Grid — 7-image editorial cycle, tight gaps */}
                <div className="lg:col-span-8 space-y-2 md:space-y-3">
                  {photos.reduce<React.ReactNode[][]>((acc, photo, idx) => {
                    const p = idx % 7;
                    /* Image 1: full-width (first photo is always landscape via reorder) */
                    if (p === 0) {
                      acc.push([
                        <PhotoCell key={photo._id} photo={photo} span="full" index={idx} hoveredIndex={hoveredIndex} setHoveredIndex={setHoveredIndex} onClick={() => setLightboxIndex(idx)} />,
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
                          <h3 className="text-4xl md:text-6xl font-serif italic tracking-tighter hover:scale-105 transition-transform duration-500">
                            {nextCollection.name}
                          </h3>
                          {nextCollection.coverImageUrl && (
                            <div className="w-48 h-32 overflow-hidden opacity-40 group-hover:opacity-100 transition-opacity duration-500">
                              <img
                                src={`${nextCollection.coverImageUrl}?auto=format&w=600&q=60`}
                                alt={nextCollection.name}
                                className="w-full h-full object-cover scale-110 group-hover:scale-100 transition-transform duration-1000"
                                loading="lazy"
                                draggable={false}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row items-center justify-center gap-12 w-full">
                      <motion.button
                        onClick={handleShare}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.94 }}
                        transition={{ duration: 0.2, ease: expo }}
                        className="group flex flex-col items-center gap-4"
                      >
                        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-colors duration-300">
                          {isShared ? <Check size={16} /> : <Share2 size={16} />}
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.4em] font-bold opacity-30 group-hover:opacity-100 transition-opacity duration-300">
                          {isShared ? 'Link Copied' : 'Share Story'}
                        </span>
                      </motion.button>

                      <motion.button
                        onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.94 }}
                        transition={{ duration: 0.2, ease: expo }}
                        className="group flex flex-col items-center gap-4"
                      >
                        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-colors duration-300">
                          <ArrowRight className="-rotate-90" size={16} />
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.4em] font-bold opacity-30 group-hover:opacity-100 transition-opacity duration-300">
                          Back to Top
                        </span>
                      </motion.button>
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
