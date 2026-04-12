import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Photo } from '../../types';

interface LightboxProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  /** z-index level — use 50 for WorkDetailPage, 60 for overlay-within-overlay (HomePage) */
  zIndex?: 50 | 60;
}

/**
 * Shared Lightbox — fullscreen photo viewer
 * Keyboard ← → navigate · Escape close · touch swipe
 */
export default function Lightbox({ photos, initialIndex, onClose, zIndex = 50 }: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index];
  const touchStartX = useRef(0);

  const goNext = useCallback(
    () => setIndex((i) => Math.min(i + 1, photos.length - 1)),
    [photos.length],
  );
  const goPrev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev();
    };
    document.body.style.overflow = 'hidden';
    // Hide custom cursor inside lightbox — dark overlay makes white dot distracting
    document.body.classList.add('cursor-hidden');
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('cursor-hidden');
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose, goNext, goPrev]);

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

  const zClass = zIndex === 60 ? 'z-[60]' : 'z-50';

  return (
    <motion.div
      className={`fixed inset-0 ${zClass} bg-black/97 backdrop-blur-md flex items-center justify-center`}
      style={{ cursor: 'default' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-5 right-6 z-10 w-10 h-10 flex items-center justify-center text-white/30 hover:text-white/80 transition-colors"
        aria-label="Close"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Photo */}
      <AnimatePresence mode="wait">
        <motion.img
          key={photo._id}
          src={`${photo.imageUrl}?auto=format&w=1800&q=90`}
          alt={photo.title || ''}
          className="max-w-[92vw] max-h-[78vh] object-contain select-none"
          initial={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      </AnimatePresence>

      {/* Left arrow */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white/20 hover:text-white/70 transition-colors"
          aria-label="Previous photo"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}

      {/* Right arrow */}
      {index < photos.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white/20 hover:text-white/70 transition-colors"
          aria-label="Next photo"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      {/* Mobile swipe hint — shown only when there are more photos */}
      {photos.length > 1 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 flex md:hidden items-center gap-1.5 text-white/20 text-[10px] font-mono tracking-widest uppercase pointer-events-none">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          swipe
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      )}

      {/* Bottom info */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          {photo.title && (
            <span className="text-white/60 text-sm font-light tracking-wide">{photo.title}</span>
          )}
          <span className="text-white/30 text-xs font-mono tracking-wider">
            {index + 1} / {photos.length}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[13px] text-white/35 font-mono tracking-wide">
          {photo.camera && <span className="text-white/45">{photo.camera}</span>}
          {photo.focalLength && (<><span className="text-white/15">|</span><span>{photo.focalLength}</span></>)}
          {photo.aperture && (<><span className="text-white/15">|</span><span>{photo.aperture}</span></>)}
          {photo.shutterSpeed && (<><span className="text-white/15">|</span><span>{photo.shutterSpeed}</span></>)}
          {photo.iso && (<><span className="text-white/15">|</span><span>ISO {photo.iso}</span></>)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
        <motion.div
          className="h-full bg-white/25"
          animate={{ width: `${((index + 1) / photos.length) * 100}%` }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        />
      </div>
    </motion.div>
  );
}
