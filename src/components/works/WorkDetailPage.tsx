import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection, Photo, PortableTextBlock } from '../../types';
import Lightbox from '../shared/Lightbox';

const expo = [0.16, 1, 0.3, 1] as const;

interface Props {
  collection: Collection;
  photos: Photo[];
}

/* ─── Portable Text renderer ─── */
function renderIntroduction(blocks: PortableTextBlock[]): React.ReactNode {
  return blocks.map((block) => {
    const text = block.children.map((span) => {
      let node: React.ReactNode = span.text;
      if (span.marks?.includes('em')) node = <em key={span._key}>{node}</em>;
      if (span.marks?.includes('strong')) node = <strong key={span._key}>{node}</strong>;
      return node;
    });

    if (block.style === 'blockquote') {
      return (
        <blockquote
          key={block._key}
          className="border-l-2 border-gray-200 pl-4 my-4 text-gray-400 italic font-light text-sm leading-relaxed"
        >
          {text}
        </blockquote>
      );
    }
    return (
      <p key={block._key} className="text-gray-500 font-light text-[15px] leading-[1.8] mb-4 last:mb-0">
        {text}
      </p>
    );
  });
}

/* ─── Dynamic photo sizing ───
 * Assigns each photo a visual "weight" based on its index in the strip:
 *   - Every 5th photo (0-indexed): wide landscape card  (aspect 4/3)
 *   - Every 3rd photo: tall portrait card               (aspect 2/3)
 *   - All others: standard portrait                     (aspect 3/4)
 * This creates a rhythmic, editorial variation instead of uniform cards.
 */
type PhotoSize = 'landscape' | 'tall' | 'standard';

function getPhotoSize(index: number): PhotoSize {
  if (index % 7 === 0 && index > 0) return 'landscape';
  if (index % 3 === 0) return 'tall';
  return 'standard';
}

function getSizeStyles(size: PhotoSize): { width: string; aspect: string; offset: string } {
  switch (size) {
    case 'landscape':
      return { width: 'w-[420px] md:w-[480px] lg:w-[520px]', aspect: 'aspect-[4/3]', offset: 'mt-0' };
    case 'tall':
      return { width: 'w-[220px] md:w-[260px] lg:w-[300px]', aspect: 'aspect-[2/3]', offset: '-mt-12' };
    default:
      return { width: 'w-[260px] md:w-[300px] lg:w-[340px]', aspect: 'aspect-[3/4]', offset: 'mt-8' };
  }
}

/* ═══════════════════════════════════════════════════════
 *  WorkDetailPage — horizontal-scroll gallery + lightbox
 *  Editorial sidebar · dynamic photo sizing · smooth transitions
 * ═══════════════════════════════════════════════════════ */
export default function WorkDetailPage({ collection, photos }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const photoSizes = useMemo(() =>
    photos.map((_, i) => getPhotoSize(i)),
    [photos],
  );

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

        {/* LEFT — editorial sidebar (desktop) */}
        <div className="hidden lg:flex flex-col justify-center w-[360px] xl:w-[400px] shrink-0 px-12 xl:px-16 border-r border-gray-100/50">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, ease: expo }}
          >
            {/* Collection name */}
            <h1 className="font-serif italic text-5xl xl:text-6xl text-gray-900 tracking-tight leading-[0.95]">
              {collection.name}
            </h1>

            {/* Meta: year · location */}
            <div className="flex items-center gap-3 mt-5 text-[10px] font-mono text-gray-300 tracking-wider uppercase">
              {collection.year && <span>{collection.year}</span>}
              {collection.location && (
                <>
                  <span className="text-gray-200">&middot;</span>
                  <span>{collection.location}</span>
                </>
              )}
            </div>

            {/* Divider */}
            <motion.div
              className="w-8 h-px bg-gray-200 my-8"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.4, duration: 0.8, ease: expo }}
              style={{ transformOrigin: 'left' }}
            />

            {/* Editorial introduction — from Sanity Portable Text */}
            {collection.introduction && collection.introduction.length > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.8, ease: expo }}
              >
                {renderIntroduction(collection.introduction)}
              </motion.div>
            ) : collection.subtitle ? (
              <motion.p
                className="text-gray-500 font-light text-[15px] leading-[1.8]"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.8, ease: expo }}
              >
                {collection.subtitle}
              </motion.p>
            ) : null}

            {/* Photo count + scroll hint */}
            <motion.div
              className="mt-10 flex items-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.6 }}
            >
              <span className="text-[9px] font-mono text-gray-300 tracking-widest uppercase">
                {photos.length} frames
              </span>
              <span className="text-gray-200 text-[9px]">&middot;</span>
              <motion.span
                className="text-[9px] font-mono text-gray-300 tracking-widest uppercase flex items-center gap-1.5"
                animate={{ x: [0, 4, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                Drag to explore
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </motion.span>
            </motion.div>
          </motion.div>
        </div>

        {/* Mobile header */}
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
            <span>{photos.length} frames</span>
          </div>
        </div>

        {/* RIGHT — horizontal scroll gallery with dynamic sizing */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden flex items-center cursor-grab select-none pt-[80px] lg:pt-0"
          style={{
            scrollBehavior: 'smooth',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            gap: '20px',
            paddingLeft: '32px',
            paddingRight: '32px',
          }}
        >
          {/* Leading space */}
          <div className="shrink-0 w-2" />

          {photos.map((photo, i) => {
            const size = photoSizes[i];
            const { width, aspect, offset } = getSizeStyles(size);

            return (
              <motion.div
                key={photo._id}
                id={`photo-${photo._id}`}
                className={`shrink-0 cursor-pointer group ${offset}`}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.9,
                  delay: Math.min(i * 0.08, 0.7),
                  ease: expo,
                }}
                whileHover={{ y: -4, transition: { type: 'spring', stiffness: 280, damping: 22 } }}
                onClick={() => setLightboxIndex(i)}
              >
                <div className={`${width} ${aspect} overflow-hidden bg-gray-50 rounded-[2px] relative`}>
                  <img
                    src={`${photo.imageUrl}?auto=format&w=900&q=84`}
                    alt={photo.title || collection.name}
                    className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                  {/* Subtle hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-500" />
                </div>

                {/* Photo info below card */}
                <div className="mt-3 px-0.5">
                  {photo.title && (
                    <p className="text-[12px] text-gray-600 font-light truncate" style={{ maxWidth: width.includes('520') ? '520px' : width.includes('480') ? '480px' : '340px' }}>
                      {photo.title}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-300 font-mono tracking-wide">
                    {photo.focalLength && <span>{photo.focalLength}</span>}
                    {photo.aperture && <><span className="text-gray-200">·</span><span>{photo.aperture}</span></>}
                    {photo.shutterSpeed && <><span className="text-gray-200">·</span><span>{photo.shutterSpeed}</span></>}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* Trailing space */}
          <div className="shrink-0 w-8" />
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

      <style>{`div::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}
