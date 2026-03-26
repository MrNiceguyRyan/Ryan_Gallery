import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection, Photo } from '../../types';
import OpeningAnimation from './OpeningAnimation';
import CoverPage from './CoverPage';
import AboutSection from './AboutSection';
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

interface Props {
  collections: Collection[];
  photos: Photo[];
}

export default function HomePage({ collections, photos }: Props) {
  // Show animation only once per browser session
  const [showOpening, setShowOpening] = useState(false);
  const [selectedWork, setSelectedWork] = useState<Collection | null>(null);
  const [activeStyle, setActiveStyle] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);

  useEffect(() => {
    if (!sessionStorage.getItem('opening-shown')) {
      setShowOpening(true);
    }
  }, []);

  // Group photos by style
  const styleGroups: StyleGroup[] = (() => {
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
  })();

  const handleOpeningComplete = useCallback(() => {
    sessionStorage.setItem('opening-shown', '1');
    setShowOpening(false);
  }, []);
  const handleSelectWork = useCallback((c: Collection) => setSelectedWork(c), []);
  const handleCloseModal = useCallback(() => setSelectedWork(null), []);

  return (
    <>
      {/* ══════ Opening animation overlay ══════ */}
      {showOpening && <OpeningAnimation onComplete={handleOpeningComplete} />}

      {/* ══════ Main scrollable content ══════ */}
      <div className={showOpening ? 'opacity-0' : 'opacity-100 transition-opacity duration-500'}>

        {/* ── Section 1: Hero ── */}
        <section className="pt-28 pb-12 px-6 md:px-16 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-extralight tracking-tighter text-gray-900 leading-[0.95]">
              Visual<br />Archive.
            </h1>
            <p className="text-gray-400 text-lg md:text-xl font-light max-w-lg mt-6 leading-relaxed">
              Shot on Nikon Zf. Every frame, a quiet conversation between light and intention.
            </p>
            <div className="flex items-center gap-8 mt-8 pt-6 border-t border-gray-100">
              <div>
                <span className="text-2xl font-extralight text-gray-900 tabular-nums">{photos.length}</span>
                <p className="text-[10px] text-gray-400 uppercase tracking-[0.15em] mt-0.5">Photographs</p>
              </div>
              <div>
                <span className="text-2xl font-extralight text-gray-900 tabular-nums">{collections.length}</span>
                <p className="text-[10px] text-gray-400 uppercase tracking-[0.15em] mt-0.5">Collections</p>
              </div>
              <div>
                <span className="text-2xl font-extralight text-gray-900 tabular-nums">{styleGroups.length}</span>
                <p className="text-[10px] text-gray-400 uppercase tracking-[0.15em] mt-0.5">Styles</p>
              </div>
            </div>
          </motion.div>
        </section>

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
              {(activeStyle
                ? photos.filter((p) => p.styleCategory === activeStyle)
                : photos
              ).map((photo, i) => (
                <motion.div
                  key={photo._id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="group relative aspect-square rounded-xl overflow-hidden cursor-zoom-in"
                  onClick={() => setLightboxPhoto(photo)}
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
              ))}
            </AnimatePresence>
          </motion.div>
        </section>

        {/* ── Section 4: Works Carousel — Ferris wheel ── */}
        {collections.length > 0 && (
          <WorksCarousel collections={collections} onSelectWork={handleSelectWork} />
        )}

        {/* ── Section 5: About — blob avatar + timeline ── */}
        <div className="border-t border-gray-100">
          <AboutSection />
        </div>

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

      {/* ══════ Photo lightbox ══════ */}
      <AnimatePresence>
        {lightboxPhoto && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setLightboxPhoto(null)}
          >
            {/* Close button */}
            <button
              className="absolute top-5 right-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
              onClick={() => setLightboxPhoto(null)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Image */}
            <motion.div
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
                <p className="text-white/80 text-sm font-light">{lightboxPhoto.title}</p>
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
