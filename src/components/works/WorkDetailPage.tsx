import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection, Photo } from '../../types';

const expo = [0.16, 1, 0.3, 1] as const;

interface Props {
  collection: Collection;
  photos: Photo[];
}

/* ═══════════════════════════════════════════════════════
 *  Lightbox — fullscreen photo viewer
 *  Keyboard ← → navigate · Escape close · touch swipe
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
  const goPrev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

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
      className="fixed inset-0 z-50 bg-black/97 backdrop-blur-md flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-5 right-6 z-10 w-10 h-10 flex items-center justify-center text-white/30 hover:text-white/80 transition-colors duration-400"
        aria-label="Close"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Photo — larger display area */}
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
          className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white/20 hover:text-white/70 transition-colors duration-400"
          aria-label="Previous"
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
          className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white/20 hover:text-white/70 transition-colors duration-400"
          aria-label="Next"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      {/* Bottom info — significantly larger and more readable */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title + counter */}
        <div className="flex items-center gap-4">
          {photo.title && (
            <span className="text-white/60 text-sm font-light tracking-wide">
              {photo.title}
            </span>
          )}
          <span className="text-white/30 text-xs font-mono tracking-wider">
            {index + 1} / {photos.length}
          </span>
        </div>
        {/* EXIF data — bigger, spaced, readable */}
        <div className="flex items-center gap-4 text-[13px] text-white/35 font-mono tracking-wide">
          {photo.camera && (
            <span className="text-white/45">{photo.camera}</span>
          )}
          {photo.focalLength && (
            <>
              <span className="text-white/15">|</span>
              <span>{photo.focalLength}</span>
            </>
          )}
          {photo.aperture && (
            <>
              <span className="text-white/15">|</span>
              <span>{photo.aperture}</span>
            </>
          )}
          {photo.shutterSpeed && (
            <>
              <span className="text-white/15">|</span>
              <span>{photo.shutterSpeed}</span>
            </>
          )}
          {photo.iso && (
            <>
              <span className="text-white/15">|</span>
              <span>ISO {photo.iso}</span>
            </>
          )}
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

/* ═══════════════════════════════════════════════════════
 *  WorkDetailPage — horizontal-scroll gallery + lightbox
 *  Sidebar info · uniform photo sizes · staggered offsets
 * ═══════════════════════════════════════════════════════ */
export default function WorkDetailPage({ collection, photos }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ── Mouse-drag horizontal scroll with inertia ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let velX = 0;
    let lastX = 0;
    let lastTime = 0;
    let raf = 0;

    const onDown = (e: MouseEvent) => {
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      lastX = e.pageX;
      lastTime = Date.now();
      velX = 0;
      cancelAnimationFrame(raf);
      el.style.cursor = 'grabbing';
    };
    const onMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.2;
      el.scrollLeft = scrollLeft - walk;

      const now = Date.now();
      const dt = now - lastTime;
      if (dt > 0) {
        velX = (e.pageX - lastX) / dt;
        lastX = e.pageX;
        lastTime = now;
      }
    };
    const onUp = () => {
      if (!isDown) return;
      isDown = false;
      el.style.cursor = '';
      // Inertia
      const decelerate = () => {
        if (Math.abs(velX) < 0.01) return;
        el.scrollLeft -= velX * 16;
        velX *= 0.94;
        raf = requestAnimationFrame(decelerate);
      };
      raf = requestAnimationFrame(decelerate);
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      cancelAnimationFrame(raf);
    };
  }, []);

  /* ── Hash-based scroll to specific photo ── */
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#photo-')) {
      const photoId = hash.slice(1);
      const timer = setTimeout(() => {
        const el = document.getElementById(photoId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-30 px-6 md:px-12 py-4 flex items-center justify-between bg-white/80 backdrop-blur-xl border-b border-gray-100/50">
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

      {/* ── Main layout: sidebar + horizontal gallery ── */}
      <div className="flex min-h-screen pt-[56px]">
        {/* LEFT — collection info sidebar (desktop) */}
        <div className="hidden lg:flex flex-col justify-center w-[340px] xl:w-[380px] shrink-0 px-12 xl:px-16 border-r border-gray-100/50">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, ease: expo }}
          >
            <h1 className="font-serif italic text-5xl xl:text-6xl text-gray-900 tracking-tight leading-[0.95]">
              {collection.name}
            </h1>

            <div className="flex items-center gap-3 mt-5 text-[10px] font-mono text-gray-300 tracking-wider uppercase">
              {collection.year && <span>{collection.year}</span>}
              {collection.location && (
                <>
                  <span>&middot;</span>
                  <span>{collection.location}</span>
                </>
              )}
            </div>

            {collection.subtitle && (
              <p className="mt-8 text-gray-500 font-light text-base leading-relaxed">
                {collection.subtitle}
              </p>
            )}

            {collection.description && (
              <p className="mt-4 text-gray-400 font-light text-sm leading-relaxed">
                {collection.description}
              </p>
            )}

            <div className="mt-12 flex items-center gap-2 text-[9px] font-mono text-gray-300 tracking-wider">
              <span>{photos.length} photographs</span>
              <span>&middot;</span>
              <span>Scroll &rarr;</span>
            </div>
          </motion.div>
        </div>

        {/* Mobile header (shown below nav) */}
        <div className="lg:hidden fixed top-[56px] left-0 right-0 z-20 bg-white/90 backdrop-blur-xl px-6 py-4 border-b border-gray-100/50">
          <h1 className="font-serif italic text-2xl text-gray-900 tracking-tight">
            {collection.name}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-[9px] font-mono text-gray-300 tracking-wider uppercase">
            {collection.year && <span>{collection.year}</span>}
            {collection.location && (
              <>
                <span>&middot;</span>
                <span>{collection.location}</span>
              </>
            )}
            <span>&middot;</span>
            <span>{photos.length} photos</span>
          </div>
        </div>

        {/* RIGHT — horizontal scroll gallery */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden flex items-center gap-5 md:gap-7 px-6 md:px-10 cursor-grab select-none pt-[80px] lg:pt-0"
          style={{
            scrollBehavior: 'smooth',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {/* Leading space */}
          <div className="shrink-0 w-4 md:w-8" />

          {photos.map((photo, i) => (
            <motion.div
              key={photo._id}
              id={`photo-${photo._id}`}
              className={`shrink-0 cursor-pointer group ${
                i % 2 === 0 ? 'mt-8' : '-mt-8'
              }`}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.8,
                delay: Math.min(i * 0.1, 0.8),
                ease: [0.16, 1, 0.3, 1],
              }}
              whileHover={{ y: -3, transition: { type: 'spring', stiffness: 300, damping: 25 } }}
              onClick={() => setLightboxIndex(i)}
            >
              {/* Uniform photo card — all same size */}
              <div className="w-[260px] md:w-[300px] lg:w-[340px] aspect-[3/4] overflow-hidden bg-gray-50 rounded-sm">
                <img
                  src={`${photo.imageUrl}?auto=format&w=800&q=82`}
                  alt={photo.title || collection.name}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                  loading="lazy"
                  draggable={false}
                />
              </div>

              {/* Photo info below card */}
              <div className="mt-4 px-1">
                {photo.title && (
                  <p className="text-sm text-gray-700 font-light truncate max-w-[260px] md:max-w-[300px] lg:max-w-[340px]">
                    {photo.title}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400 font-mono tracking-wide">
                  {photo.focalLength && <span>{photo.focalLength}</span>}
                  {photo.aperture && <span>{photo.aperture}</span>}
                  {photo.shutterSpeed && <span>{photo.shutterSpeed}</span>}
                </div>
              </div>
            </motion.div>
          ))}

          {/* Trailing space */}
          <div className="shrink-0 w-12 md:w-20" />
        </div>
      </div>

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

      {/* Hide scrollbar */}
      <style>{`
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
