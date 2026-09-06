import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useIsPresent, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Photo } from '../../types';
import { photoAccessibleLabel, photoDisplayTitle } from '../../lib/narratives';
import { lightboxImageSources, prepareLightboxImage } from '../../lib/lightboxImage';

interface LightboxProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  collectionName?: string;
}

const photoVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction * 22,
    scale: 0.99,
  }),
  visible: { opacity: 1, x: 0, scale: 1 },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -16,
    scale: 0.99,
  }),
};

/**
 * Shared Lightbox — fullscreen photo viewer
 * Keyboard ← → navigate · Escape close · touch swipe
 */
export default function Lightbox({ photos, initialIndex, onClose, collectionName }: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [requestedIndex, setRequestedIndex] = useState(initialIndex);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [loadingFrame, setLoadingFrame] = useState(false);
  const [failedRequest, setFailedRequest] = useState<number | null>(null);
  const requestedIndexRef = useRef(initialIndex);
  const requestVersionRef = useRef(0);
  const [direction, setDirection] = useState<-1 | 1>(1);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(() => new Set());
  const photo = photos[index];
  const imageFailed = failedPhotoIds.has(photo._id);
  const displayTitle = photoDisplayTitle(photo);
  const currentPhotoLabel = photoAccessibleLabel(photo, index, photos.length, collectionName);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const reduce = useReducedMotion();
  const isPresent = useIsPresent();

  const requestFrame = useCallback((offset: number) => {
    const target = Math.max(0, Math.min(requestedIndexRef.current + offset, photos.length - 1));
    if (target === requestedIndexRef.current) return;
    requestVersionRef.current += 1;
    requestedIndexRef.current = target;
    setFailedRequest(null);
    setLoadingFrame(false);
    setRequestedIndex(target);
  }, [photos.length]);
  const goNext = useCallback(() => requestFrame(1), [requestFrame]);
  const goPrev = useCallback(() => requestFrame(-1), [requestFrame]);

  useEffect(() => {
    if (!isPresent) return;
    if (requestedIndex === index) {
      setLoadingFrame(false);
      return;
    }
    const version = requestVersionRef.current;
    const loadingTimer = window.setTimeout(() => setLoadingFrame(true), 220);
    const cancel = prepareLightboxImage(photos[requestedIndex].imageUrl, (ready) => {
      if (version !== requestVersionRef.current) return;
      window.clearTimeout(loadingTimer);
      setLoadingFrame(false);
      if (!ready) {
        setFailedRequest(requestedIndex);
        return;
      }
      setFailedRequest(null);
      setDirection(requestedIndex > index ? 1 : -1);
      setIndex(requestedIndex);
    });
    return () => {
      window.clearTimeout(loadingTimer);
      cancel();
    };
  }, [requestedIndex, index, photos, retryAttempt, isPresent]);

  useEffect(() => {
    [index - 1, index + 1].forEach((photoIndex) => {
      const adjacentPhoto = photos[photoIndex];
      if (!adjacentPhoto) return;
      const image = new Image();
      image.decoding = 'async';
      const sources = lightboxImageSources(adjacentPhoto.imageUrl);
      image.sizes = sources.sizes;
      image.srcset = sources.srcSet;
      image.src = sources.src;
    });
  }, [index, photos]);

  useEffect(() => {
    if (!isPresent) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
        else goPrev();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose, goNext, goPrev, isPresent]);

  useEffect(() => {
    // Save/restore the previous overflow — the host overlay (MagazineLayout /
    // WorkStory) already locks body scroll; blind '' restore would unlock it
    // underneath the still-open story.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    // Hide custom cursor inside lightbox — dark overlay makes white dot distracting
    const wasCursorHidden = document.body.classList.contains('cursor-hidden');
    document.body.classList.add('cursor-hidden');
    return () => {
      document.body.style.overflow = prevOverflow;
      if (!wasCursorHidden) document.body.classList.remove('cursor-hidden');
      cancelAnimationFrame(frame);
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    // A previous/next button disappears at the sequence edge; keep focus in the viewer.
    if (!dialogRef.current?.contains(document.activeElement)) {
      closeButtonRef.current?.focus({ preventScroll: true });
    }
  }, [index, requestedIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    const touch = e.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const diffX = start.x - touch.clientX;
    const diffY = start.y - touch.clientY;
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.25) {
      if (diffX > 0) goNext();
      else goPrev();
    }
  };

  return (
    <motion.div
      ref={dialogRef}
      id="lightbox"
      data-protected="true"
      role="dialog"
      aria-modal="true"
      aria-hidden={!isPresent || undefined}
      inert={!isPresent ? true : undefined}
      aria-label={collectionName ? `Photo viewer, ${collectionName}` : 'Photo viewer'}
      className="fixed inset-0 z-[60] bg-black/97 flex items-center justify-center"
      style={{ cursor: 'default' }}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStartRef.current = null; }}
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        Showing {currentPhotoLabel}
      </span>
      {/* Close button — 44px tap target, safe-area-aware on iOS */}
      <motion.button
        ref={closeButtonRef}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        whileHover={reduce ? undefined : { scale: 1.08 }}
        whileTap={reduce ? undefined : { scale: 0.92 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="absolute z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/30 text-white/62 transition-colors duration-200 hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
        style={{
          top: 'max(0.75rem, env(safe-area-inset-top))',
          right: 'max(0.75rem, env(safe-area-inset-right))',
        }}
        aria-label="Close photo viewer"
      >
        <X size={19} strokeWidth={1.5} aria-hidden="true" />
      </motion.button>

      {/* Photo (+ subtle anti-screenshot watermark overlay) */}
      <div className={`relative ${imageFailed ? 'flex h-[min(60dvh,32rem)] w-[min(92vw,48rem)] items-center justify-center bg-[#171b15]' : ''}`} onClick={(e) => e.stopPropagation()}>
        {imageFailed && (
          <p className="font-ui text-[10px] uppercase tracking-[0.3em] text-white/58">
            Frame unavailable
          </p>
        )}
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.img
            key={photo._id}
            custom={direction}
            {...lightboxImageSources(photo.imageUrl)}
            alt={currentPhotoLabel}
            decoding="async"
            onError={() => setFailedPhotoIds((ids) => new Set(ids).add(photo._id))}
            onLoad={() => setFailedPhotoIds((ids) => {
              if (!ids.has(photo._id)) return ids;
              const next = new Set(ids);
              next.delete(photo._id);
              return next;
            })}
            className={`gallery-lightbox-photo max-h-[78dvh] max-w-[92vw] select-none object-contain ${imageFailed ? 'hidden' : ''}`}
            variants={photoVariants}
            initial={reduce ? false : 'enter'}
            animate="visible"
            exit={reduce ? { opacity: 0, x: 0, scale: 1 } : 'exit'}
            transition={{ duration: reduce ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
            draggable={false}
          />
        </AnimatePresence>
        {/* Persistent watermark — overlays the image bounding box so screenshots
             of the lightbox include attribution. Mix-blend-difference keeps it
             legible against any image color while staying visually quiet. */}
        <div
          className="pointer-events-none absolute bottom-2 right-3 text-[9px] font-ui tracking-[0.2em] uppercase opacity-50 select-none"
          style={{ mixBlendMode: 'difference', color: 'white' }}
        >
          © ryanxugallery.com
        </div>
      </div>

      {/* Left arrow */}
      {requestedIndex > 0 && (
        <motion.button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          whileHover={reduce ? undefined : { scale: 1.15, x: -2 }}
          whileTap={reduce ? undefined : { scale: 0.9, x: -4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/32 text-white/58 transition-colors duration-200 hover:border-white/25 hover:text-white md:h-12 md:w-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
          style={{ left: 'max(0.75rem, env(safe-area-inset-left))' }}
          aria-label={`Previous photo, ${requestedIndex} of ${photos.length}`}
        >
          <ChevronLeft size={24} strokeWidth={1.25} aria-hidden="true" />
        </motion.button>
      )}

      {/* Right arrow */}
      {requestedIndex < photos.length - 1 && (
        <motion.button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          whileHover={reduce ? undefined : { scale: 1.15, x: 2 }}
          whileTap={reduce ? undefined : { scale: 0.9, x: 4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/32 text-white/58 transition-colors duration-200 hover:border-white/25 hover:text-white md:h-12 md:w-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
          style={{ right: 'max(0.75rem, env(safe-area-inset-right))' }}
          aria-label={`Next photo, ${requestedIndex + 2} of ${photos.length}`}
        >
          <ChevronRight size={24} strokeWidth={1.25} aria-hidden="true" />
        </motion.button>
      )}

      {/* Mobile swipe hint — shown only when there are more photos */}
      {photos.length > 1 && (
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 text-[10px] font-ui uppercase tracking-widest text-white/48 pointer-events-none md:hidden" style={{ top: 'max(1.1rem, env(safe-area-inset-top))' }}>
          <ChevronLeft className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
          swipe
          <ChevronRight className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}

      {/* Bottom info — wraps gracefully on narrow viewports */}
      <div
        className="absolute left-1/2 flex w-[90vw] max-w-3xl -translate-x-1/2 flex-col items-center gap-2 md:gap-3"
        style={{ bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom) + 0.25rem))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div role="status" aria-live="polite" aria-atomic="true" className="absolute bottom-full mb-3 flex items-center gap-3 text-[10px] font-ui tracking-wide text-white/60">
          {failedRequest !== null ? (
            <>
              <span>Frame {failedRequest + 1} could not load.</span>
              <button
                type="button"
                className="min-h-11 px-2 text-white/85 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D2FF00]"
                onClick={() => {
                  requestVersionRef.current += 1;
                  setFailedRequest(null);
                  setRetryAttempt((attempt) => attempt + 1);
                }}
              >Retry</button>
            </>
          ) : loadingFrame ? `Preparing frame ${requestedIndex + 1}…` : null}
        </div>
        <div className="flex items-center gap-3 md:gap-4 max-w-full">
          {displayTitle && (
            <span className="text-white/60 text-[13px] md:text-sm font-light tracking-wide truncate">{displayTitle}</span>
          )}
          <span className="text-white/58 text-[11px] md:text-xs font-ui tracking-wider shrink-0">
            {index + 1} / {photos.length}
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 md:gap-4 text-[11px] md:text-[13px] text-white/58 font-ui tracking-wide flex-wrap">
          {photo.camera && <span className="text-white/68">{photo.camera}</span>}
          {photo.focalLength && (<><span className="text-white/28" aria-hidden="true">|</span><span>{photo.focalLength}</span></>)}
          {photo.aperture && (<><span className="text-white/28" aria-hidden="true">|</span><span>{photo.aperture}</span></>)}
          {photo.shutterSpeed && (<><span className="text-white/28" aria-hidden="true">|</span><span>{photo.shutterSpeed}</span></>)}
          {photo.iso && (<><span className="text-white/28" aria-hidden="true">|</span><span>ISO {photo.iso}</span></>)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
        <motion.div
          className="h-full bg-white/25"
          animate={{ width: `${((index + 1) / photos.length) * 100}%` }}
          transition={{ duration: reduce ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </motion.div>
  );
}
