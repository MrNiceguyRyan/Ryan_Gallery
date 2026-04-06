import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection, Photo } from '../../types';
import Lightbox from '../shared/Lightbox';

const expo = [0.16, 1, 0.3, 1] as const;

interface Props {
  collection: Collection;
  photos: Photo[];
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
                  decoding="async"
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
