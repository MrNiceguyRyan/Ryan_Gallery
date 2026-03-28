import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection, Photo } from '../../types';
import OpeningAnimation from './OpeningAnimation';
import ParallaxHero from '../ParallaxHero';

const expo = [0.16, 1, 0.3, 1] as const;

interface Props {
  collections: Collection[];
  photos: Photo[];
}

export default function HomePage({ collections, photos }: Props) {
  const [showOpening, setShowOpening] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number>(-1);
  const [lightboxCollection, setLightboxCollection] = useState<Collection | null>(null);

  useEffect(() => {
    if (!sessionStorage.getItem('opening-shown')) {
      setShowOpening(true);
    }
  }, []);

  const handleOpeningComplete = useCallback(() => {
    sessionStorage.setItem('opening-shown', '1');
    setShowOpening(false);
  }, []);

  // Lightbox photos from selected collection
  const lightboxPhotos = lightboxCollection?.photos ?? [];
  const lightboxPhoto = lightboxIndex >= 0 ? lightboxPhotos[lightboxIndex] : null;

  // Lightbox keyboard nav
  useEffect(() => {
    if (lightboxIndex < 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          setLightboxIndex(-1);
          setLightboxCollection(null);
          break;
        case 'ArrowRight':
          setLightboxIndex((prev) => (prev + 1) % lightboxPhotos.length);
          break;
        case 'ArrowLeft':
          setLightboxIndex((prev) => (prev - 1 + lightboxPhotos.length) % lightboxPhotos.length);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, lightboxPhotos.length]);

  const openLightbox = useCallback((collection: Collection, index: number) => {
    setLightboxCollection(collection);
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(-1);
    setLightboxCollection(null);
  }, []);

  return (
    <>
      {showOpening && <OpeningAnimation onComplete={handleOpeningComplete} />}

      <div className={showOpening ? 'opacity-0' : 'opacity-100 transition-opacity duration-500'}>

        {/* ── Parallax Hero ── */}
        <ParallaxHero
          imageUrl="https://cdn.sanity.io/images/z610fooo/production/b3ff88abc00f4b64e60a031bdfd701ca34ceb618-4096x2730.jpg?auto=format&w=1800&q=85"
          title="Visual"
          titleLine2="Archive."
          label="A curated photography collection"
          meta={[`${photos.length} Photographs`, `${collections.length} Collections`, 'Nikon Zf']}
          objectPosition="center 40%"
        />

        {/* ── Gallery Collections ── */}
        <section className="px-6 md:px-16 py-20 max-w-7xl mx-auto">
          <motion.h2
            className="text-lg font-light text-gray-300 tracking-widest uppercase mb-12"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Collections
          </motion.h2>

          <div className="space-y-20">
            {collections.map((collection, ci) => (
              <motion.div
                key={collection._id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.8, ease: expo }}
              >
                {/* Collection header */}
                <div className="flex items-end justify-between mb-6">
                  <div>
                    <a
                      href={`/works/${collection.slug}`}
                      className="group inline-block"
                    >
                      <h3 className="text-3xl md:text-4xl font-[100] text-gray-900 tracking-tight group-hover:text-gray-600 transition-colors">
                        {collection.name}
                      </h3>
                    </a>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 font-light">
                      {collection.location && <span>{collection.location}</span>}
                      {collection.year && <span>{collection.year}</span>}
                      <span className="text-gray-300 font-mono">{collection.photoCount || collection.photos?.length || 0} photos</span>
                    </div>
                  </div>
                  <a
                    href={`/works/${collection.slug}`}
                    className="hidden md:inline-flex items-center gap-2 text-xs text-gray-400 hover:text-gray-900 font-light tracking-wider uppercase transition-colors"
                  >
                    View all
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </a>
                </div>

                {/* Photo grid — horizontal scrollable on mobile, grid on desktop */}
                <div className="relative">
                  <div className="flex md:grid md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3 overflow-x-auto md:overflow-visible pb-4 md:pb-0 -mx-6 px-6 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none scrollbar-hide">
                    {(collection.photos || []).slice(0, 10).map((photo, pi) => (
                      <motion.div
                        key={photo._id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: Math.min(pi * 0.04, 0.5) }}
                        className="group relative aspect-[3/4] min-w-[45vw] md:min-w-0 rounded-xl overflow-hidden cursor-pointer snap-start"
                        onClick={() => openLightbox(collection, pi)}
                      >
                        <img
                          src={`${photo.imageUrl}?auto=format&w=600&q=80`}
                          alt={photo.title}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          loading="lazy"
                          draggable={false}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                          <div className="absolute bottom-3 left-3 right-3">
                            <p className="text-white text-sm font-light">{photo.title}</p>
                            <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-white/50">
                              {photo.focalLength && <span>{photo.focalLength}</span>}
                              {photo.aperture && <span>{photo.aperture}</span>}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Mobile "View all" link */}
                <a
                  href={`/works/${collection.slug}`}
                  className="md:hidden inline-flex items-center gap-2 mt-4 text-xs text-gray-400 hover:text-gray-900 font-light tracking-wider uppercase transition-colors"
                >
                  View all →
                </a>
              </motion.div>
            ))}
          </div>
        </section>

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

      {/* ══════ Photo lightbox ══════ */}
      <AnimatePresence>
        {lightboxPhoto && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={closeLightbox}
          >
            <button
              className="absolute top-5 right-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
              onClick={closeLightbox}
              aria-label="Close lightbox"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {lightboxPhotos.length > 1 && (
              <>
                <button
                  className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex((p) => (p - 1 + lightboxPhotos.length) % lightboxPhotos.length); }}
                  aria-label="Previous"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex((p) => (p + 1) % lightboxPhotos.length); }}
                  aria-label="Next"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </>
            )}

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
                draggable={false}
              />
              <div className="mt-4 flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <p className="text-white/80 text-sm font-light">{lightboxPhoto.title}</p>
                  {lightboxPhotos.length > 1 && (
                    <span className="text-white/30 text-xs font-mono">
                      {lightboxIndex + 1} / {lightboxPhotos.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-white/40 text-xs font-mono">
                  {lightboxPhoto.focalLength && <span>{lightboxPhoto.focalLength}</span>}
                  {lightboxPhoto.aperture && <span>{lightboxPhoto.aperture}</span>}
                  {lightboxPhoto.shutterSpeed && <span>{lightboxPhoto.shutterSpeed}</span>}
                  {lightboxPhoto.iso && <span>ISO {lightboxPhoto.iso}</span>}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
