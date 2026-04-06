import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin } from 'lucide-react';
import type { Collection, Photo, PortableTextBlock } from '../../types';
import Lightbox from '../shared/Lightbox';
import { getMapboxToken } from '../../config/mapbox';

const expo = [0.16, 1, 0.3, 1] as const;
const ACCENT = '#2c3e50';

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
        <blockquote key={block._key} className="border-l-2 border-gray-200 pl-4 my-4 text-gray-400 italic font-light text-sm leading-relaxed">
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

/* ─── Dynamic photo layout ───
 * Creates an editorial rhythm: wide / tall / standard cards alternate
 * based on position in the strip, giving each series a unique pacing.
 */
type PhotoSize = 'wide' | 'tall' | 'standard';

function getPhotoSize(index: number, total: number): PhotoSize {
  // First photo is always standard (matched to cover via view transition)
  if (index === 0) return 'standard';
  // Pattern: standard, wide, standard, tall, standard, wide...
  const pattern = index % 5;
  if (pattern === 1) return 'wide';
  if (pattern === 3) return 'tall';
  return 'standard';
}

interface SizeConfig { width: string; aspect: string; vOffset: string }

function getSizeConfig(size: PhotoSize): SizeConfig {
  switch (size) {
    case 'wide':     return { width: 'w-[460px] xl:w-[500px]', aspect: 'aspect-[16/10]', vOffset: 'mt-4' };
    case 'tall':     return { width: 'w-[240px] xl:w-[270px]',  aspect: 'aspect-[3/5]',  vOffset: '-mt-10' };
    default:         return { width: 'w-[320px] xl:w-[360px]',  aspect: 'aspect-[3/4]',  vOffset: 'mt-10' };
  }
}

/* ═══════════════════════════════════════════════════════
 *  WorkDetailPage
 * ═══════════════════════════════════════════════════════ */
export default function WorkDetailPage({ collection, photos }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Derive first geotagged photo for mini-map ──
  const collectionLocation = useMemo(() => {
    const photo = photos.find(p => p.location?.lat != null && p.location?.lng != null);
    return photo?.location ?? null;
  }, [photos]);

  const mapboxToken = useMemo(() => {
    try { return getMapboxToken(); } catch { return ''; }
  }, []);

  const photoSizes = useMemo(
    () => photos.map((_, i) => getPhotoSize(i, photos.length)),
    [photos],
  );

  /* ── Mouse-drag horizontal scroll with inertia ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let isDown = false, startX = 0, scrollLeft = 0, velX = 0, lastX = 0, lastTime = 0, raf = 0;

    const onDown = (e: MouseEvent) => {
      isDown = true; startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft;
      lastX = e.pageX; lastTime = Date.now(); velX = 0;
      cancelAnimationFrame(raf); el.style.cursor = 'grabbing';
    };
    const onMove = (e: MouseEvent) => {
      if (!isDown) return; e.preventDefault();
      el.scrollLeft = scrollLeft - (e.pageX - el.offsetLeft - startX) * 1.2;
      const now = Date.now(), dt = now - lastTime;
      if (dt > 0) { velX = (e.pageX - lastX) / dt; lastX = e.pageX; lastTime = now; }
    };
    const onUp = () => {
      if (!isDown) return; isDown = false; el.style.cursor = '';
      const decelerate = () => {
        if (Math.abs(velX) < 0.01) return;
        el.scrollLeft -= velX * 16; velX *= 0.94; raf = requestAnimationFrame(decelerate);
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

  /* ── Hash scroll ── */
  useEffect(() => {
    const hash = window.location.hash;
    if (hash?.startsWith('#photo-')) {
      const timer = setTimeout(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }, 600);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-30 px-6 md:px-12 py-4 flex items-center justify-between bg-white/80 backdrop-blur-xl border-b border-gray-100/50">
        <a href="/" className="font-serif italic text-sm text-gray-400 hover:text-gray-900 transition-colors duration-300">
          &larr; Ryan Xu.
        </a>
        <span className="text-[10px] font-mono text-gray-300 tracking-wider uppercase">
          {collection.name} &middot; {photos.length}
        </span>
      </nav>

      <div className="flex min-h-screen pt-[56px]">

        {/* ── LEFT SIDEBAR (desktop) ── */}
        <div className="hidden lg:flex flex-col justify-center w-[340px] xl:w-[380px] shrink-0 px-10 xl:px-12 border-r border-gray-100/50 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, ease: expo }}
            className="py-12"
          >
            {/* Collection name */}
            <h1 className="font-serif italic text-5xl xl:text-6xl text-gray-900 tracking-tight leading-[0.95]">
              {collection.name}
            </h1>

            {/* Meta */}
            <div className="flex items-center gap-3 mt-4 text-[10px] font-mono text-gray-300 tracking-wider uppercase">
              {collection.year && <span>{collection.year}</span>}
              {collection.location && <><span className="text-gray-200">&middot;</span><span>{collection.location}</span></>}
            </div>

            {/* Divider */}
            <motion.div
              className="w-8 h-px bg-gray-200 my-7"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.4, duration: 0.8, ease: expo }}
              style={{ transformOrigin: 'left' }}
            />

            {/* Editorial introduction */}
            {collection.introduction && collection.introduction.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8, ease: expo }}>
                {renderIntroduction(collection.introduction)}
              </motion.div>
            ) : collection.subtitle ? (
              <motion.p className="text-gray-500 font-light text-[15px] leading-[1.8]" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8, ease: expo }}>
                {collection.subtitle}
              </motion.p>
            ) : null}

            {/* Frame count + drag hint */}
            <motion.div className="mt-8 flex items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.6 }}>
              <span className="text-[9px] font-mono text-gray-300 tracking-widest uppercase">{photos.length} frames</span>
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

            {/* ── Mini-map card ── */}
            {collectionLocation && mapboxToken && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.8, ease: expo }}
                className="mt-8 rounded-2xl overflow-hidden border border-black/5 shadow-sm"
              >
                <a
                  href={`/travel#loc=${collectionLocation.lat},${collectionLocation.lng},8`}
                  className="block relative h-40 overflow-hidden group cursor-pointer"
                >
                  <img
                    src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+2c3e50(${collectionLocation.lng},${collectionLocation.lat})/${collectionLocation.lng},${collectionLocation.lat},3,0/500x240@2x?access_token=${mapboxToken}`}
                    alt={`Map of ${collectionLocation.city || collection.name}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white/40 to-transparent" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500 flex items-center justify-center">
                    <span className="text-white text-[10px] uppercase tracking-[0.2em] font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-black/40 backdrop-blur-sm px-4 py-2 rounded-full">
                      View on Journal Map
                    </span>
                  </div>
                </a>
                <div className="px-4 py-3 bg-white">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${ACCENT}14` }}>
                      <MapPin size={14} style={{ color: ACCENT }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{collectionLocation.city || collection.name}</p>
                      <p className="text-[10px] text-gray-400">{collectionLocation.country || ''}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-[9px] text-gray-400 font-mono tracking-wide">
                      {Math.abs(collectionLocation.lat).toFixed(4)}°{collectionLocation.lat >= 0 ? 'N' : 'S'}, {Math.abs(collectionLocation.lng).toFixed(4)}°{collectionLocation.lng >= 0 ? 'E' : 'W'}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* ── Mobile header ── */}
        <div className="lg:hidden fixed top-[56px] left-0 right-0 z-20 bg-white/95 backdrop-blur-xl px-5 py-3.5 border-b border-gray-100/60">
          <h1 className="font-serif italic text-xl text-gray-900 tracking-tight leading-tight">{collection.name}</h1>
          <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-gray-300 tracking-wider uppercase">
            {collection.year && <span>{collection.year}</span>}
            {collection.location && <><span>&middot;</span><span>{collection.location}</span></>}
            <span>&middot;</span>
            <span>{photos.length} frames</span>
          </div>
        </div>

        {/* ── MOBILE: vertical masonry ── */}
        <div className="lg:hidden flex-1 pt-[96px] px-4 pb-16 overflow-y-auto">
          <div className="columns-2 gap-3">
            {photos.map((photo, i) => (
              <motion.div
                key={photo._id}
                className="break-inside-avoid mb-3 cursor-pointer group"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: Math.min(i * 0.05, 0.4), ease: expo }}
                onClick={() => setLightboxIndex(i)}
              >
                <div className="relative overflow-hidden rounded-sm bg-gray-50">
                  <img
                    src={`${photo.imageUrl}?auto=format&w=600&q=82`}
                    alt={photo.title || collection.name}
                    className="w-full h-auto object-cover"
                    style={i === 0 ? { viewTransitionName: `cover-${collection.slug}` } : undefined}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    draggable={false}
                  />
                </div>
                {photo.title && (
                  <p className="mt-1.5 px-0.5 text-[10px] text-gray-500 font-light truncate leading-tight">{photo.title}</p>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── DESKTOP: horizontal scroll gallery ── */}
        <div
          ref={scrollRef}
          className="hidden lg:flex flex-1 overflow-x-auto overflow-y-hidden items-center cursor-grab select-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', gap: '18px', paddingLeft: '28px', paddingRight: '28px' }}
        >
          <div className="shrink-0 w-2" />

          {photos.map((photo, i) => {
            const size = photoSizes[i];
            const { width, aspect, vOffset } = getSizeConfig(size);

            return (
              <motion.div
                key={photo._id}
                id={`photo-${photo._id}`}
                className={`shrink-0 cursor-pointer group ${vOffset}`}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: Math.min(i * 0.08, 0.7), ease: expo }}
                whileHover={{ y: -4, transition: { type: 'spring', stiffness: 280, damping: 22 } }}
                onClick={() => setLightboxIndex(i)}
              >
                <div className={`${width} ${aspect} overflow-hidden bg-gray-50 rounded-[2px] relative`}>
                  <img
                    src={`${photo.imageUrl}?auto=format&w=900&q=84`}
                    alt={photo.title || collection.name}
                    className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={i === 0 ? { viewTransitionName: `cover-${collection.slug}` } : undefined}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-500" />
                </div>

                <div className="mt-3 px-0.5">
                  {photo.title && (
                    <p className="text-[11px] text-gray-600 font-light truncate max-w-[360px]">{photo.title}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-300 font-mono">
                    {photo.focalLength && <span>{photo.focalLength}</span>}
                    {photo.aperture && <><span>·</span><span>{photo.aperture}</span></>}
                    {photo.shutterSpeed && <><span>·</span><span>{photo.shutterSpeed}</span></>}
                  </div>
                </div>
              </motion.div>
            );
          })}

          <div className="shrink-0 w-8" />
        </div>
      </div>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox photos={photos} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
        )}
      </AnimatePresence>

      <style>{`div::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}
