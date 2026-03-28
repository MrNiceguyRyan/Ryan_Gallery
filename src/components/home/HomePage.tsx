import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection, Photo } from '../../types';
import OpeningAnimation from './OpeningAnimation';
import CoverPage from './CoverPage';
import ParallaxHero from '../ParallaxHero';
import WorksCarousel from './WorksCarousel';
import WorkDetailModal from './WorkDetailModal';

interface StyleGroup {
  category: string;
  label: string;
  description: string;
  photos: Photo[];
  coverImageUrl: string;
}

const STYLE_META: Record<string, { label: string; description: string }> = {
  landscape: { label: 'Landscape', description: 'Where horizons dissolve into light' },
  portrait: { label: 'Portrait', description: 'Faces that tell unspoken stories' },
  street: { label: 'Street', description: 'The poetry of passing moments' },
  architecture: { label: 'Architecture', description: 'Geometry carved from silence' },
  abstract: { label: 'Abstract', description: 'Beyond form, into feeling' },
};

// Cap stagger delay so large photo sets don't take forever to appear
const MAX_STAGGER_DELAY = 1.2; // seconds

interface Props {
  collections: Collection[];
  photos: Photo[];
}

export default function HomePage({ collections, photos }: Props) {
  const [showOpening, setShowOpening] = useState(false);
  const [selectedWork, setSelectedWork] = useState<Collection | null>(null);
  const [activeStyle, setActiveStyle] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number>(-1);

  useEffect(() => {
    if (!sessionStorage.getItem('opening-shown')) {
      setShowOpening(true);
    }
  }, []);

  // Group photos by style
  const styleGroups: StyleGroup[] = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const p of photos) {
      if (p.styleCategory) {
        if (!map.has(p.styleCategory)) map.set(p.styleCategory, []);
        map.get(p.styleCategory)!.push(p);
      }
    }
    return Array.from(map.entries()).map(([cat, catPhotos]) => ({
      category: cat,
      label: STYLE_META[cat]?.label ?? cat,
      description: STYLE_META[cat]?.description ?? '',
      photos: catPhotos,
      coverImageUrl: catPhotos[0]?.imageUrl ?? '',
    }));
  }, [photos]);

  // Filtered photo list (used for grid + lightbox navigation)
  const filteredPhotos = useMemo(
    () => activeStyle ? photos.filter((p) => p.styleCategory === activeStyle) : photos,
    [photos, activeStyle],
  );

  const lightboxPhoto = lightboxIndex >= 0 ? filteredPhotos[lightboxIndex] : null;

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIndex < 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          setLightboxIndex(-1);
          break;
        case 'ArrowRight':
          setLightboxIndex((prev) => (prev + 1) % filteredPhotos.length);
          break;
        case 'ArrowLeft':
          setLightboxIndex((prev) => (prev - 1 + filteredPhotos.length) % filteredPhotos.length);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, filteredPhotos.length]);

  const handleOpeningComplete = useCallback(() => {
    sessionStorage.setItem('opening-shown', '1');
    setShowOpening(false);
  }, []);
  const handleSelectWork = useCallback((c: Collection) => setSelectedWork(c), []);
  const handleCloseModal = useCallback(() => setSelectedWork(null), []);

  const goLightboxPrev = useCallback(() => {
    setLightboxIndex((prev) => (prev - 1 + filteredPhotos.length) % filteredPhotos.length);
  }, [filteredPhotos.length]);

  const goLightboxNext = useCallback(() => {
    setLightboxIndex((prev) => (prev + 1) % filteredPhotos.length);
  }, [filteredPhotos.length]);

  return (
    <>
      {/* ══════ Opening animation overlay ══════ */}
      {showOpening && <OpeningAnimation onComplete={handleOpeningComplete} />}

      {/* ══════ Main scrollable content ══════ */}
      <div className={showOpening ? 'opacity-0' : 'opacity-100 transition-opacity duration-500'}>

        {/* ── Section 1: Parallax Hero ── */}
        <ParallaxHero
          imageUrl="https://cdn.sanity.io/images/z610fooo/production/b3ff88abc00f4b64e60a031bdfd701ca34ceb618-4096x2730.jpg?auto=format&w=1800&q=85"
          title="Visual"
          titleLine2="Archive."
          label="A curated photography collection"
          meta={[`${photos.length} Photographs`, `${collections.length} Collections`, 'Nikon Zf']}
          objectPosition="center 40%"
        />

        {/* ── Section 2: Browse by Style — filter + photo grid ── */}
        <section className="px-6 md:px-16 py-20 max-w-7xl mx-auto border-t border-gray-100">
          <motion.h2
            className="text-lg font-light text-gray-300 tracking-widest uppercase mb-10"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Browse by Style
          </motion.h2>

          {/* Category pills */}
          <div className="flex flex-wrap gap-3 mb-10">
            <button
              onClick={() => setActiveStyle(null)}
              className={`px-5 py-2 text-sm font-light tracking-wide rounded-full border transition-all duration-300 ${
                activeStyle === null
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-200 text-gray-400 hover:border-gray-900 hover:text-gray-900'
              }`}
            >
              All
            </button>
            {styleGroups.map((g) => (
              <button
                key={g.category}
                onClick={() => setActiveStyle(activeStyle === g.category ? null : g.category)}
                className={`px-5 py-2 text-sm font-light tracking-wide rounded-full border transition-all duration-300 ${
                  activeStyle === g.category
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-200 text-gray-400 hover:border-gray-900 hover:text-gray-900'
                }`}
              >
                {g.label}
                <span className="ml-2 text-[10px] opacity-50">{g.photos.length}</span>
              </button>
            ))}
          </div>

          {/* Photo grid */}
          <motion.div layout className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <AnimatePresence mode="popLayout">
              {filteredPhotos.map((photo, i) => {
                // Cap stagger delay so 100+ photos don't wait forever
                const staggerDelay = Math.min(i * 0.03, MAX_STAGGER_DELAY);
                return (
                  <motion.div
                    key={photo._id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.35, delay: staggerDelay }}
                    className="group relative aspect-square rounded-xl overflow-hidden cursor-zoom-in"
                    onClick={() => setLightboxIndex(i)}
                  >
                    <img
                      src={`${photo.imageUrl}?auto=format&w=600&q=80`}
                      alt={photo.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      <div className="absolute bottom-3 left-3 right-3">
                        <p className="text-white text-sm font-light">{photo.title}</p>
                        <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-white/50">
                          {photo.focalLength && <span>{photo.focalLength}</span>}
                          {photo.aperture && <span>{photo.aperture}</span>}
                          {photo.location?.city && <span>{photo.location.city}</span>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </section>

        {/* ── Section 4: Works Carousel — Ferris wheel ── */}
        {collections.length > 0 && (
          <WorksCarousel collections={collections} onSelectWork={handleSelectWork} />
        )}

        {/* ── Footer ── */}
        <footer className="py-20 px-6 md:px-16 max-w-7xl mx-auto border-t border-gray-100">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h2 className="text-lg font-light text-gray-900 tracking-tight">Visual Archive.</h2>
              <p className="text-xs text-gray-400 mt-1 font-light">
                &copy; {new Date().getFullYear()} Ryan. All rights reserved.
              </p>
            </div>
            <div className="flex items-center gap-6 text-xs text-gray-400 font-mono">
              <span>Nikon Zf</span>
              <span className="text-gray-200">|</span>
              <span>Astro + React</span>
              <span className="text-gray-200">|</span>
              <span>Sanity CMS</span>
            </div>
          </div>
        </footer>
      </div>

      {/* ══════ Work detail modal overlay ══════ */}
      <AnimatePresence>
        {selectedWork && (
          <WorkDetailModal collection={selectedWork} onClose={handleCloseModal} />
        )}
      </AnimatePresence>

      {/* ══════ Photo lightbox with prev/next ══════ */}
      <AnimatePresence>
        {lightboxPhoto && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setLightboxIndex(-1)}
          >
            {/* Close button */}
            <button
              className="absolute top-5 right-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
              onClick={() => setLightboxIndex(-1)}
              aria-label="Close lightbox"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Prev arrow */}
            {filteredPhotos.length > 1 && (
              <button
                className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
                onClick={(e) => { e.stopPropagation(); goLightboxPrev(); }}
                aria-label="Previous photo"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
            )}

            {/* Next arrow */}
            {filteredPhotos.length > 1 && (
              <button
                className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
                onClick={(e) => { e.stopPropagation(); goLightboxNext(); }}
                aria-label="Next photo"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            )}

            {/* Image */}
            <motion.div
              key={lightboxPhoto._id}
              className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={`${lightboxPhoto.imageUrl}?auto=format&w=1600&q=90`}
                alt={lightboxPhoto.title}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              />
              {/* Caption */}
              <div className="mt-4 flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <p className="text-white/80 text-sm font-light">{lightboxPhoto.title}</p>
                  {filteredPhotos.length > 1 && (
                    <span className="text-white/30 text-xs font-mono">
                      {lightboxIndex + 1} / {filteredPhotos.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-white/40 text-xs font-mono">
                  {lightboxPhoto.focalLength && <span>{lightboxPhoto.focalLength}</span>}
                  {lightboxPhoto.aperture && <span>{lightboxPhoto.aperture}</span>}
                  {lightboxPhoto.shutterSpeed && <span>{lightboxPhoto.shutterSpeed}</span>}
                  {lightboxPhoto.iso && <span>ISO {lightboxPhoto.iso}</span>}
                  {lightboxPhoto.location?.city && <span>{lightboxPhoto.location.city}</span>}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
