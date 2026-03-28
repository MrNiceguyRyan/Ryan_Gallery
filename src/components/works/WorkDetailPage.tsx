import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { useRef } from 'react';
import type { Collection, Photo } from '../../types';

const expo = [0.16, 1, 0.3, 1] as const;

interface Props {
  collection: Collection;
  photos: Photo[];
}

/** Extract width × height from Sanity CDN URL */
function parseDimensions(url: string) {
  const m = url.match(/-(\d+)x(\d+)\./);
  return m ? { w: +m[1], h: +m[2] } : { w: 4, h: 3 };
}

/* ═══════════════════════════════════════════════════════
 *  GalleryPhoto — single photo in masonry grid
 * ═══════════════════════════════════════════════════════ */
function GalleryPhoto({
  photo,
  index,
  collectionName,
  onClick,
}: {
  photo: Photo;
  index: number;
  collectionName: string;
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const { w, h } = parseDimensions(photo.imageUrl);
  const hasExif = photo.focalLength || photo.aperture || photo.shutterSpeed;

  return (
    <motion.div
      ref={ref}
      id={`photo-${photo._id}`}
      className="group cursor-pointer overflow-hidden relative"
      style={{ aspectRatio: `${w} / ${h}` }}
      onClick={onClick}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.7,
        delay: Math.min(index * 0.06, 0.4),
        ease: expo,
      }}
    >
      <img
        src={`${photo.imageUrl}?auto=format&w=1000&q=85`}
        alt={photo.title || collectionName}
        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700 ease-out"
        loading="lazy"
        draggable={false}
      />

      {/* Hover overlay with EXIF */}
      {hasExif && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-500 flex items-end justify-start p-4 md:p-5">
          <div className="opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-500">
            {photo.title && (
              <p className="text-white text-sm font-light mb-1">
                {photo.title}
              </p>
            )}
            <div className="flex items-center gap-3 text-[9px] text-white/60 font-mono">
              {photo.focalLength && <span>{photo.focalLength}</span>}
              {photo.aperture && <span>{photo.aperture}</span>}
              {photo.shutterSpeed && <span>{photo.shutterSpeed}</span>}
              {photo.iso && <span>ISO {photo.iso}</span>}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  Lightbox — fullscreen photo viewer
 *  Keyboard: ← → navigate, Escape close
 * ═══════════════════════════════════════════════════════ */
function Lightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index];
  const touchStartX = useRef(0);

  const goNext = useCallback(
    () => setIndex((i) => Math.min(i + 1, photos.length - 1)),
    [photos.length],
  );
  const goPrev = useCallback(
    () => setIndex((i) => Math.max(i - 1, 0)),
    [],
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose, goNext, goPrev]);

  // Touch swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-5 right-6 z-10 w-10 h-10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
        aria-label="Close"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Photo */}
      <AnimatePresence mode="wait">
        <motion.img
          key={photo._id}
          src={`${photo.imageUrl}?auto=format&w=1800&q=90`}
          alt={photo.title || ''}
          className="max-w-[92vw] max-h-[82vh] object-contain select-none"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.25 }}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      </AnimatePresence>

      {/* Left arrow */}
      {index > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/25 hover:text-white transition-colors"
          aria-label="Previous"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </button>
      )}

      {/* Right arrow */}
      {index < photos.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/25 hover:text-white transition-colors"
          aria-label="Next"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>
        </button>
      )}

      {/* Bottom info bar */}
      <div
        className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Counter */}
        <span className="text-white/50 text-[11px] font-mono tracking-wider">
          {index + 1} / {photos.length}
        </span>

        {/* EXIF data */}
        <div className="flex items-center gap-4 text-[9px] text-white/25 font-mono">
          {photo.focalLength && <span>{photo.focalLength}</span>}
          {photo.aperture && <span>{photo.aperture}</span>}
          {photo.shutterSpeed && <span>{photo.shutterSpeed}</span>}
          {photo.iso && <span>ISO {photo.iso}</span>}
          {photo.camera && <span>{photo.camera}</span>}
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
        <motion.div
          className="h-full bg-white/20"
          animate={{ width: `${((index + 1) / photos.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  WorkDetailPage — masonry gallery with lightbox
 * ═══════════════════════════════════════════════════════ */
export default function WorkDetailPage({ collection, photos }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Hash-based scroll to specific photo
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#photo-')) {
      const photoId = hash.slice(1); // "photo-xxxx"
      // Wait for images to render, then scroll
      const timer = setTimeout(() => {
        const el = document.getElementById(photoId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Brief highlight effect
          el.style.outline = '2px solid rgba(0,0,0,0.1)';
          el.style.outlineOffset = '4px';
          setTimeout(() => {
            el.style.outline = '';
            el.style.outlineOffset = '';
          }, 2000);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, []);

  // Split photos into 2 columns for masonry
  const col1: { photo: Photo; originalIndex: number }[] = [];
  const col2: { photo: Photo; originalIndex: number }[] = [];
  photos.forEach((photo, i) => {
    if (i % 2 === 0) col1.push({ photo, originalIndex: i });
    else col2.push({ photo, originalIndex: i });
  });

  return (
    <div className="min-h-screen bg-white">
      {/* ── Sticky nav bar ── */}
      <nav className="sticky top-0 z-30 px-6 md:px-12 py-4 flex items-center justify-between bg-white/80 backdrop-blur-xl border-b border-gray-100/50">
        <a
          href="/"
          className="font-serif italic text-sm text-gray-400 hover:text-gray-900 transition-colors duration-300"
        >
          &larr; Ryan Xu.
        </a>
        <span className="text-[10px] font-mono text-gray-300 tracking-wider uppercase">
          {collection.name} &middot; {photos.length}
        </span>
      </nav>

      {/* ── Collection header ── */}
      <header className="px-6 md:px-12 lg:px-20 pt-16 md:pt-24 pb-12 md:pb-16">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: expo }}
        >
          <h1 className="font-serif italic text-5xl md:text-7xl lg:text-8xl text-gray-900 tracking-tight leading-[0.95]">
            {collection.name}
          </h1>

          <div className="flex items-center gap-4 mt-5 text-[10px] font-mono text-gray-300 tracking-wider uppercase">
            {collection.year && <span>{collection.year}</span>}
            {collection.location && (
              <>
                <span>&middot;</span>
                <span>{collection.location}</span>
              </>
            )}
            <span>&middot;</span>
            <span>{photos.length} photographs</span>
          </div>

          {collection.subtitle && (
            <p className="mt-5 text-gray-500 font-light text-lg md:text-xl max-w-2xl leading-relaxed">
              {collection.subtitle}
            </p>
          )}

          {collection.description && (
            <p className="mt-4 text-gray-400 font-light text-sm max-w-xl leading-relaxed">
              {collection.description}
            </p>
          )}
        </motion.div>
      </header>

      {/* ── Masonry photo grid ── */}
      <div className="px-3 md:px-6 lg:px-10 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 max-w-7xl mx-auto">
          {/* Column 1 */}
          <div className="flex flex-col gap-3 md:gap-4">
            {col1.map(({ photo, originalIndex }) => (
              <GalleryPhoto
                key={photo._id}
                photo={photo}
                index={originalIndex}
                collectionName={collection.name}
                onClick={() => setLightboxIndex(originalIndex)}
              />
            ))}
          </div>

          {/* Column 2 — offset for staggered effect */}
          <div className="flex flex-col gap-3 md:gap-4 md:mt-16">
            {col2.map(({ photo, originalIndex }) => (
              <GalleryPhoto
                key={photo._id}
                photo={photo}
                index={originalIndex}
                collectionName={collection.name}
                onClick={() => setLightboxIndex(originalIndex)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="px-6 md:px-12 py-8 border-t border-gray-100 flex items-center justify-between">
        <a
          href="/"
          className="font-serif italic text-gray-400 text-sm hover:text-gray-900 transition-colors"
        >
          Ryan Xu.
        </a>
        <div className="flex items-center gap-4 text-[10px] text-gray-300 font-mono tracking-wider">
          <span>Nikon Zf</span>
          <span className="text-gray-200">|</span>
          <span>{collection.name}</span>
        </div>
      </footer>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            photos={photos}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
