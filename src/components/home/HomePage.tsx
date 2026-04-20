import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { ChevronLeft, ArrowRight, Search, MapPin } from 'lucide-react';
import type { Collection, Photo, SiteSettings } from '../../types';
import OpeningAnimation from './OpeningAnimation';
import { getMapboxToken } from '../../config/mapbox';
import Lightbox from '../shared/Lightbox';
import MapboxMap from '../MapboxMap';
import AboutPage from '../about/AboutPage';

const expo = [0.23, 1, 0.32, 1] as const;

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2000&auto=format&fit=crop';

interface Props {
  collections: Collection[];
  photos: Photo[];
  mapPhotos?: Photo[];
  siteSettings?: SiteSettings;
  mapboxToken?: string;
}

/* ═══════════════════════════════════════════════════════
 *  Overlay — cinematic vertical shutter with backdrop mask
 * ═══════════════════════════════════════════════════════ */
function Overlay({
  title,
  children,
  onClose,
  variant = 'light',
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  variant?: 'light' | 'dark';
}) {
  const isDark = variant === 'dark';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.9, ease: [0.32, 0, 0.07, 1] }}
        className={`w-full h-full overflow-y-auto no-scrollbar relative ${
          isDark ? 'bg-[#0A0A0A] text-[#FDFDFB]' : 'bg-[#FDFDFB] text-[#1A1A1A]'
        }`}
      >
        {!isDark && (
          <div
            className="paper-grain pointer-events-none absolute inset-x-0 top-0 min-h-full z-0 opacity-[0.032] mix-blend-multiply"
            aria-hidden
          />
        )}
        <div className={`sticky top-0 left-0 w-full z-10 px-6 py-6 md:px-12 flex justify-between items-center backdrop-blur-3xl border-b transition-colors duration-700 ${
          isDark ? 'bg-black/80 border-white/5' : 'bg-white/80 border-black/5'
        }`}>
          <button
            onClick={onClose}
            className={`group flex items-center gap-3 text-[10px] uppercase tracking-[0.4em] font-bold transition-all duration-500 hover:gap-5 hover:opacity-50 ${
              isDark ? 'text-white/60 hover:text-white' : 'text-black/50 hover:text-black/80'
            }`}
          >
            <ChevronLeft size={16} strokeWidth={1.5} className="transition-transform duration-500 group-hover:-translate-x-1" />
            <span>Back</span>
          </button>
          <div className={`text-[11px] uppercase tracking-[0.6em] font-bold opacity-30`}>{title}</div>
        </div>
        <motion.div
          className="relative z-[1] px-6 md:px-12"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.55,
            delay: isDark ? 0.42 : 0.36,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  MiniMapCard — reusable location card (desktop sidebar + mobile)
 * ═══════════════════════════════════════════════════════ */
function MiniMapCard({ location, name, token, className = '' }: {
  location: { lat: number; lng: number; city?: string; country?: string };
  name: string;
  token: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: expo }}
      className={`rounded-2xl overflow-hidden border border-black/5 ${className}`}
    >
      <a
        href={`/travel#loc=${location.lat},${location.lng},8`}
        className="block relative h-36 md:h-44 overflow-hidden group cursor-pointer"
      >
        {/* motion 控制缩放，避免与 global.css 里 img 的 transition 冲突 */}
        <motion.img
          src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+2c3e50(${location.lng},${location.lat})/${location.lng},${location.lat},3,0/500x260@2x?access_token=${token}`}
          alt={`Map of ${location.city || name}`}
          className="absolute inset-0 h-full w-full max-w-none object-cover will-change-transform [transform-origin:center_center] transition-none"
          style={{ width: '115%', height: '115%', left: '-7.5%', top: '-7.5%' }}
          loading="lazy"
          draggable={false}
          initial={{ scale: 1 }}
          whileHover={{ scale: 1.12 }}
          transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1] }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/50 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-[900ms] group-hover:bg-black/10 flex items-center justify-center">
          <span className="text-white text-[10px] uppercase tracking-[0.2em] font-bold opacity-0 transition-opacity duration-[900ms] group-hover:opacity-100 bg-black/40 backdrop-blur-sm px-4 py-2 rounded-full">
            View on Journal Map
          </span>
        </div>
      </a>
      <div className="px-4 py-3 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#2c3e50]/8 flex items-center justify-center flex-shrink-0">
            <MapPin size={16} className="text-[#2c3e50]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[#1A1A1A] truncate">
              {location.city || name}
            </p>
            <p className="text-[11px] text-gray-400">
              {location.country || ''}
            </p>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 font-mono tracking-wide">
            {Math.abs(location.lat).toFixed(4)}&deg;{location.lat >= 0 ? 'N' : 'S'}, {Math.abs(location.lng).toFixed(4)}&deg;{location.lng >= 0 ? 'E' : 'W'}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  Smart row builder — aspect-ratio-aware magazine layout
 * ═══════════════════════════════════════════════════════ */
type Span = 'full' | 'half' | 'third';
interface RowItem { photo: Photo; span: Span; }

interface SubCategory {
  id: string;
  title: string;
  count: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  landscape: 'City Landscape',
  street: 'Street Photo',
  portrait: 'Portrait Study',
  architecture: 'Architecture',
  abstract: 'Abstract',
  uncategorized: 'Curated Selection',
};

function toChapterTitle(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSubCategories(photos: Photo[]): SubCategory[] {
  const order: string[] = [];
  const counter = new Map<string, number>();

  photos.forEach((photo) => {
    const key = (photo.styleCategory || 'uncategorized').toLowerCase();
    if (!counter.has(key)) order.push(key);
    counter.set(key, (counter.get(key) ?? 0) + 1);
  });

  return order.map((id) => ({
    id,
    title: CATEGORY_LABELS[id] ?? toChapterTitle(id),
    count: counter.get(id) ?? 0,
  }));
}

function isLandscape(p: Photo) { return (p.width && p.height) ? p.width / p.height > 1.2 : false; }
function isPortrait(p: Photo) { return (p.width && p.height) ? p.height / p.width > 1.1 : true; }

function buildStoryRows(photos: Photo[]): RowItem[][] {
  const rows: RowItem[][] = [];
  let i = 0;
  while (i < photos.length) {
    const p = photos[i];
    if (isLandscape(p)) {
      rows.push([{ photo: p, span: 'full' }]);
      i++;
    } else if (isPortrait(p)) {
      const next = photos[i + 1];
      if (next && (isPortrait(next) || (!isLandscape(next)))) {
        rows.push([{ photo: p, span: 'half' }, { photo: next, span: 'half' }]);
        i += 2;
      } else {
        rows.push([{ photo: p, span: 'full' }]);
        i++;
      }
    } else {
      const p2 = photos[i + 1];
      const p3 = photos[i + 2];
      if (p2 && !isLandscape(p2) && p3 && !isLandscape(p3)) {
        rows.push([{ photo: p, span: 'third' }, { photo: p2, span: 'third' }, { photo: p3, span: 'third' }]);
        i += 3;
      } else if (p2 && !isLandscape(p2)) {
        rows.push([{ photo: p, span: 'half' }, { photo: p2, span: 'half' }]);
        i += 2;
      } else {
        rows.push([{ photo: p, span: 'full' }]);
        i++;
      }
    }
  }
  return rows;
}

/* ═══════════════════════════════════════════════════════
 *  PhotoBlock — full photo, no crop, no background box
 * ═══════════════════════════════════════════════════════ */
function photoHasEditorialHover(photo: Photo) {
  return !!(
    photo.title ||
    photo.focalLength ||
    photo.aperture ||
    photo.shutterSpeed ||
    photo.iso ||
    photo.camera
  );
}

function PhotoBlock({
  photo,
  span,
  globalIndex,
  hoveredIndex,
  onHover,
  onClick,
}: {
  photo: Photo;
  span: Span;
  globalIndex: number;
  hoveredIndex: number | null;
  onHover: (i: number | null) => void;
  onClick: () => void;
}) {
  const colSpan = span === 'full' ? 'col-span-6' : span === 'half' ? 'col-span-3' : 'col-span-2';
  const isActive = hoveredIndex === globalIndex;
  const isPeerFocused = hoveredIndex !== null && hoveredIndex !== globalIndex;
  const showCaption = isActive && photoHasEditorialHover(photo);
  const tactileEase = [0.23, 1, 0.32, 1] as const;
  const liftShadow =
    '0 30px 60px -12px rgba(0,0,0,0.2), 0 18px 36px -18px rgba(0,0,0,0.25)';
  const filmFilterDormant = 'grayscale(0.22) saturate(0.92) contrast(1.02)';
  const filmFilterPeer =
    'grayscale(0.58) saturate(0.72) brightness(0.9) contrast(0.94)';
  const filmFilterActive = 'grayscale(0) saturate(1.06) contrast(1.06) brightness(1.02)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.5, ease: expo }}
      className={`${colSpan} group relative cursor-pointer`}
      style={{ zIndex: isActive ? 20 : 1 }}
      onClick={onClick}
      onHoverStart={() => onHover(globalIndex)}
      onHoverEnd={() => onHover(null)}
    >
      <motion.div
        className="relative rounded-sm bg-transparent"
        animate={{
          opacity: isPeerFocused ? 0.34 : 1,
          scale: isPeerFocused ? 0.94 : 1,
        }}
        whileHover={{
          scale: 1.045,
          boxShadow: liftShadow,
        }}
        transition={{
          duration: 0.8,
          ease: tactileEase,
          boxShadow: { duration: 0.4, ease: tactileEase },
        }}
      >
        <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute top-3 right-3 z-20 rounded-sm bg-black/40 px-1.5 py-0.5 text-[8px] font-mono tracking-[0.18em] text-white/90 opacity-[0.35] backdrop-blur-[2px] transition-opacity duration-700 group-hover:opacity-100"
          aria-hidden
        >
          NO. {String(globalIndex + 1).padStart(2, '0')}
        </div>
        {(() => {
          const baseW = span === 'full' ? 2400 : span === 'half' ? 1600 : 1200;
          const sizesAttr =
            span === 'full'
              ? '(min-width: 1280px) 1200px, 100vw'
              : span === 'half'
              ? '(min-width: 1280px) 600px, 50vw'
              : '(min-width: 1280px) 400px, 33vw';
          const url = (w: number, q: number) =>
            `${photo.imageUrl}?auto=format&fit=max&w=${w}&q=${q}`;
          return (
            <motion.img
              src={url(baseW, 88)}
              srcSet={`${url(baseW, 88)} 1x, ${url(Math.min(baseW * 2, 3200), 82)} 2x`}
              sizes={sizesAttr}
              alt={photo.title || ''}
              className="w-full h-auto block"
              loading="lazy"
              decoding="async"
              draggable={false}
              animate={{
                filter: isPeerFocused
                  ? filmFilterPeer
                  : isActive
                  ? filmFilterActive
                  : filmFilterDormant,
              }}
              transition={{ duration: 0.8, ease: tactileEase }}
            />
          );
        })()}
        <AnimatePresence>
          {showCaption && (
            <motion.div
              className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/55 to-transparent px-3 py-2.5"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.22 }}
            >
              {photo.title && (
                <p className="text-[11px] font-light leading-tight text-white/90">{photo.title}</p>
              )}
              {(() => {
                const exif = [photo.focalLength, photo.aperture, photo.shutterSpeed, photo.iso].filter(Boolean);
                if (exif.length === 0) return null;
                return (
                  <p className="mt-0.5 text-[9px] font-mono text-white/55">{exif.join(' · ')}</p>
                );
              })()}
              {photo.camera && (
                <p className="mt-1 text-[9px] font-mono uppercase tracking-wider text-white/40">{photo.camera}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  FilmstripItem — parallax collection band
 * ═══════════════════════════════════════════════════════ */
function FilmstripItem({
  collection,
  onClick,
  index,
}: {
  collection: Collection;
  onClick: () => void;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-20%', '20%']);

  const coverUrl = collection.coverImageUrl
    ? `${collection.coverImageUrl}?auto=format&w=1600&q=75`
    : collection.photos?.[0]?.imageUrl
      ? `${collection.photos[0].imageUrl}?auto=format&w=1600&q=75`
      : '';

  const photoCount = collection.photos?.length || collection.photoCount || 0;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 100 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ delay: index * 0.1, duration: 1.5, ease: expo }}
      onClick={onClick}
      className="filmstrip-item group relative cursor-pointer block"
      data-location={collection.location || collection.name}
    >
      {/* Cover image: motion.div handles y-parallax, plain img handles CSS hover zoom */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div style={{ y }} className="absolute inset-0">
          {coverUrl && (
            <img
              src={coverUrl}
              alt={collection.name}
              className="filmstrip-image"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          )}
        </motion.div>
      </div>

      {/* Dark overlay — fades on hover */}
      <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent transition-colors duration-[1.5s]" />

      {/* Title + decorative line */}
      <div className="relative z-10 text-center px-6">
        <div className="flex flex-col items-center gap-3 md:gap-6">
          <span className="text-[9px] md:text-[10px] uppercase tracking-[0.5em] md:tracking-[0.8em] opacity-40 font-bold text-white group-hover:opacity-100 transition-opacity duration-1000">
            {collection.location || collection.subtitle || ''}
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-[10vw] font-serif italic tracking-tighter text-white group-hover:scale-[1.05] transition-transform duration-[2s] apple-spring leading-none drop-shadow-lg will-change-transform">
            {collection.name}
          </h2>
          <div className="w-0 group-hover:w-32 h-[1px] bg-white transition-all duration-[1.5s] opacity-40" />
        </div>
      </div>

      {/* Desktop CTA — slide in from right */}
      <div className="hidden md:flex absolute bottom-12 right-12 text-[10px] uppercase tracking-[0.5em] opacity-0 group-hover:opacity-60 transition-all duration-1000 translate-x-8 group-hover:translate-x-0 items-center gap-4 text-white font-bold">
        Explore Story <ArrowRight size={14} />
      </div>

      {/* Mobile bottom bar */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 px-5 py-4 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-[9px] font-mono text-white/50 tracking-wider uppercase">
          {photoCount} frames
        </span>
        <span className="text-[9px] font-mono text-white/50 tracking-wider uppercase flex items-center gap-1.5">
          View <ArrowRight size={10} />
        </span>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  CollectionDetail — overlay with sticky sidebar + grid
 * ═══════════════════════════════════════════════════════ */
function CollectionDetail({
  collection,
  onClose,
}: {
  collection: Collection;
  onClose: () => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [hoveredPhotoIndex, setHoveredPhotoIndex] = useState<number | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all');
  const collectionPhotos = collection.photos || [];

  // Derive location from first geotagged photo
  const collectionLocation = useMemo(() => {
    const photo = collectionPhotos.find(p => p.location?.lat != null && p.location?.lng != null);
    return photo?.location || null;
  }, [collectionPhotos]);

  const mapboxToken = useMemo(() => {
    try { return getMapboxToken(); } catch { return ''; }
  }, []);

  const subCategories = useMemo(() => buildSubCategories(collectionPhotos), [collectionPhotos]);
  const displayedPhotos = useMemo(() => {
    if (activeCategoryId === 'all') return collectionPhotos;
    return collectionPhotos.filter((photo) => (photo.styleCategory || 'uncategorized').toLowerCase() === activeCategoryId);
  }, [collectionPhotos, activeCategoryId]);

  const rows = useMemo(() => buildStoryRows(displayedPhotos), [displayedPhotos]);

  useEffect(() => {
    if (activeCategoryId === 'all') return;
    if (subCategories.some((cat) => cat.id === activeCategoryId)) return;
    setActiveCategoryId('all');
  }, [activeCategoryId, subCategories]);

  useEffect(() => {
    setHoveredPhotoIndex(null);
    setLightboxIndex(null);
  }, [activeCategoryId]);

  return (
    <>
      <Overlay title={collection.location || collection.name} onClose={onClose}>
        <div className="max-w-7xl mx-auto">
          <div className="detail-grid">
            {/* Sticky sidebar */}
            <div className="lg:sticky lg:top-32 h-fit space-y-10 mb-24 lg:mb-0">
              <span className="text-[11px] uppercase tracking-[0.5em] opacity-40 block font-medium">
                Archive Collection
              </span>
              <h2 className="text-7xl md:text-9xl font-serif italic tracking-tighter leading-[0.85]">
                {collection.name}
              </h2>
              {(collection.descriptionCN || collection.descriptionEN) ? (
                <div className="space-y-8">
                  {collection.descriptionCN && (
                    <p className="text-lg leading-relaxed font-sans text-[#1A1A1A] opacity-90">
                      {collection.descriptionCN}
                    </p>
                  )}
                  {collection.descriptionEN && (
                    <p className="text-sm leading-relaxed font-serif italic opacity-40 border-l border-black/10 pl-4">
                      {collection.descriptionEN}
                    </p>
                  )}
                </div>
              ) : collection.description ? (
                <p className="text-lg md:text-xl leading-relaxed font-light opacity-60 max-w-md italic">
                  &ldquo;{collection.description}&rdquo;
                </p>
              ) : collection.subtitle ? (
                <p className="text-lg leading-relaxed font-light opacity-60 max-w-md italic">
                  {collection.subtitle}
                </p>
              ) : null}
              {subCategories.length > 0 && (
                <div className="space-y-6 pb-10 border-b border-black/5">
                  <div className="flex items-center gap-4">
                    <span className="text-[9px] uppercase tracking-[0.4em] font-bold opacity-30">Selection</span>
                    <div className="h-[1px] flex-1 bg-black/5" />
                  </div>

                  <div className="flex flex-col gap-4">
                    <button
                      onClick={() => setActiveCategoryId('all')}
                      className="group flex items-center gap-6 text-left"
                    >
                      <span className={`text-[9px] font-mono transition-all duration-500 ${activeCategoryId === 'all' ? 'opacity-100' : 'opacity-20 group-hover:opacity-40'}`}>
                        00
                      </span>
                      <div className="relative flex flex-col">
                        <span className={`text-[10px] uppercase tracking-[0.3em] font-bold transition-all duration-500 ${
                          activeCategoryId === 'all' ? 'opacity-100 translate-x-3' : 'opacity-20 group-hover:opacity-50 group-hover:translate-x-1'
                        }`}>
                          The Archive
                        </span>
                        {activeCategoryId === 'all' && (
                          <motion.div
                            layoutId="homeActiveChapterBar"
                            className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-[1px] bg-black"
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                          />
                        )}
                      </div>
                    </button>

                    {subCategories.map((cat, idx) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategoryId(cat.id)}
                        className="group flex items-center gap-6 text-left"
                      >
                        <span className={`text-[9px] font-mono transition-all duration-500 ${
                          activeCategoryId === cat.id ? 'opacity-100' : 'opacity-20 group-hover:opacity-40'
                        }`}>
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="relative flex flex-col">
                          <span className={`text-[10px] uppercase tracking-[0.3em] font-bold transition-all duration-500 ${
                            activeCategoryId === cat.id ? 'opacity-100 translate-x-3' : 'opacity-20 group-hover:opacity-50 group-hover:translate-x-1'
                          }`}>
                            {cat.title}
                          </span>
                          {activeCategoryId === cat.id && (
                            <motion.div
                              layoutId="homeActiveChapterBar"
                              className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-[1px] bg-black"
                              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-6 pt-12">
                <div className="w-16 h-[1px] bg-[#1A1A1A] opacity-10" />
                <span className="text-[10px] uppercase tracking-[0.3em] font-mono opacity-40">
                  {displayedPhotos.length}{activeCategoryId !== 'all' ? ` / ${collectionPhotos.length}` : ''} Captured Frames
                </span>
              </div>

              {/* Location mini-map — desktop only (hidden on mobile, shown after grid instead) */}
              {collectionLocation && mapboxToken && (
                <MiniMapCard location={collectionLocation} name={collection.name} token={mapboxToken} className="hidden lg:block mt-8" />
              )}
            </div>

            {/* Photo grid — tight magazine gaps */}
            <div className="space-y-1 md:space-y-2">
              {subCategories.length > 0 && (
                <div className="lg:hidden sticky top-[73px] z-[5] bg-[#FDFDFB]/95 backdrop-blur-xl border-b border-black/5 -mx-2 px-2 py-2 mb-3">
                  <div className="relative">
                    <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-[#FDFDFB]/95 to-transparent z-[1]" />
                    <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[#FDFDFB]/95 to-transparent z-[1]" />
                    <div className="overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth">
                      <div className="flex items-center gap-4 min-w-max">
                      <button
                        onClick={() => setActiveCategoryId('all')}
                        className="relative pb-1 text-left snap-start"
                      >
                        <span className={`text-[9px] uppercase tracking-[0.28em] font-bold transition-all duration-500 ${
                          activeCategoryId === 'all' ? 'opacity-100' : 'opacity-25'
                        }`}>
                          00 THE ARCHIVE
                        </span>
                        {activeCategoryId === 'all' && (
                          <motion.div
                            layoutId="homeMobileChapterBar"
                            className="absolute left-0 right-0 -bottom-[1px] h-[1px] bg-black/70"
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                          />
                        )}
                      </button>
                      {subCategories.map((cat, idx) => (
                        <button
                          key={cat.id}
                          onClick={() => setActiveCategoryId(cat.id)}
                          className="relative pb-1 text-left snap-start"
                        >
                          <span className={`text-[9px] uppercase tracking-[0.28em] font-bold transition-all duration-500 ${
                            activeCategoryId === cat.id ? 'opacity-100' : 'opacity-25'
                          }`}>
                            {String(idx + 1).padStart(2, '0')} {cat.title}
                          </span>
                          {activeCategoryId === cat.id && (
                            <motion.div
                              layoutId="homeMobileChapterBar"
                              className="absolute left-0 right-0 -bottom-[1px] h-[1px] bg-black/70"
                              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            />
                          )}
                        </button>
                      ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {rows.map((row, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-6 gap-1 md:gap-2">
                  {row.map((item, colIdx) => {
                    const globalIdx = rows
                      .slice(0, rowIdx)
                      .reduce((sum, r) => sum + r.length, 0) + colIdx;
                    return (
                      <PhotoBlock
                        key={item.photo._id}
                        photo={item.photo}
                        span={item.span}
                        globalIndex={globalIdx}
                        hoveredIndex={hoveredPhotoIndex}
                        onHover={setHoveredPhotoIndex}
                        onClick={() => setLightboxIndex(globalIdx)}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Mobile mini-map — shown below photo grid on small screens */}
              {collectionLocation && mapboxToken && (
                <div className="lg:hidden px-2 pt-12">
                  <MiniMapCard location={collectionLocation} name={collection.name} token={mapboxToken} />
                </div>
              )}

              {/* Return button */}
              <footer className="pt-32 pb-24 text-center">
                <button
                  onClick={() => {
                    onClose();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="group flex flex-col items-center gap-4 mx-auto"
                >
                  <div className="w-12 h-12 rounded-full border border-black/10 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all duration-500">
                    <ArrowRight className="-rotate-90" size={16} />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.4em] font-bold opacity-30 group-hover:opacity-100 transition-opacity">
                    Return to Archive
                  </span>
                </button>
              </footer>
            </div>
          </div>
        </div>
      </Overlay>

      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            photos={displayedPhotos}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            zIndex={60}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ═══════════════════════════════════════════════════════
 *  HomePage — dark filmstrip archive
 * ═══════════════════════════════════════════════════════ */
export default function HomePage({ collections, photos, mapPhotos, siteSettings, mapboxToken: externalMapboxToken }: Props) {
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showOpening, setShowOpening] = useState(false);

  const isAnyOverlayOpen = !!selectedCollection || showMap || showAbout;

  // Filter to collections that have photos
  const activeCollections = collections.filter((c) => (c.photos?.length || 0) > 0);

  useEffect(() => {
    if (!sessionStorage.getItem('opening-shown')) setShowOpening(true);
  }, []);

  const handleOpeningComplete = useCallback(() => {
    sessionStorage.setItem('opening-shown', '1');
    setShowOpening(false);
  }, []);

  const closeAllOverlays = useCallback(() => {
    setSelectedCollection(null);
    setShowMap(false);
    setShowAbout(false);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isAnyOverlayOpen ? 'hidden' : 'auto';
    document.body.style.backgroundColor = isAnyOverlayOpen ? '#FDFDFB' : '#0A0A0A';
    return () => {
      document.body.style.overflow = '';
      document.body.style.backgroundColor = '';
    };
  }, [isAnyOverlayOpen]);

  // Deep-link: /?collection=<slug> opens the matching CollectionDetail overlay.
  // Makes Journal map -> Explore Story reuse the home overlay instead of /works/[slug].
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const readSlug = () => {
      const params = new URLSearchParams(window.location.search);
      return params.get('collection');
    };
    const applySlug = (slug: string | null) => {
      if (!slug) {
        setSelectedCollection(null);
        return;
      }
      const match = activeCollections.find((c) => c.slug === slug);
      if (match) {
        setShowMap(false);
        setShowAbout(false);
        setSelectedCollection(match);
      }
    };
    applySlug(readSlug());
    const onPop = () => applySlug(readSlug());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [activeCollections]);

  // Keep the URL in sync when the overlay opens/closes via UI.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get('collection');
    const desired = selectedCollection?.slug ?? null;
    if (current === desired) return;
    if (desired) url.searchParams.set('collection', desired);
    else url.searchParams.delete('collection');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [selectedCollection]);

  return (
    <>
      {showOpening && <OpeningAnimation onComplete={handleOpeningComplete} />}

      <div
        className={`min-h-screen font-sans transition-colors duration-1000 ${
          showOpening ? 'opacity-0' : 'opacity-100 transition-opacity duration-700'
        } ${
          selectedCollection
            ? 'bg-[#FDFDFB] text-[#1A1A1A]'
            : 'bg-[#0A0A0A] text-[#FDFDFB]'
        }`}
      >
        {/* ── Nav — centered name + right links ── */}
        <nav className="fixed top-0 left-0 w-full z-40 px-6 py-5 md:px-12 flex items-center transition-all duration-700 bg-transparent">
          {/* Left spacer for centering */}
          <div className="flex-1" />

          {/* Center: name */}
          <button
            onClick={() => {
              closeAllOverlays();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-xl md:text-2xl font-display tracking-[0.12em] hover:opacity-60 transition-all text-white"
          >
            RYAN XU
          </button>

          {/* Right: nav links */}
          <div className="flex-1 flex justify-end items-center gap-6 md:gap-8">
            <button
              onClick={() => {
                closeAllOverlays();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hidden md:block text-[11px] uppercase tracking-[0.2em] font-medium hover:opacity-100 transition-all duration-700 text-white"
            >
              Photography
            </button>
            <button
              onClick={() => { closeAllOverlays(); setShowMap(true); }}
              className="hidden md:block text-[11px] uppercase tracking-[0.2em] font-medium hover:opacity-100 transition-all duration-700 text-white/50 hover:text-white"
            >
              Journal
            </button>
            <button
              onClick={() => { closeAllOverlays(); setShowAbout(true); }}
              className="hidden md:block text-[11px] uppercase tracking-[0.2em] font-medium hover:opacity-100 transition-all duration-700 text-white/50 hover:text-white"
            >
              About
            </button>
            {/* Mobile: search icon as menu hint */}
            <div className="md:hidden flex items-center gap-4">
              <button onClick={() => { closeAllOverlays(); setShowMap(true); }} className="opacity-50 hover:opacity-100 transition-opacity">
                <Search size={16} className="text-white" />
              </button>
            </div>
          </div>
        </nav>

        {/* ── Hero ── */}
        <header className="h-screen flex flex-col justify-end items-center text-center px-6 pb-20 relative overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 1.15 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.5, ease: expo }}
            className="absolute inset-0 z-0"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#0A0A0A] z-10" />
            <img
              src={HERO_IMAGE}
              className="w-full h-full object-cover opacity-60"
              alt=""
              draggable={false}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 1.5, ease: expo }}
            className="relative z-10 flex flex-col items-center gap-8"
          >
            <h1
              className="text-6xl md:text-8xl lg:text-[9vw] font-serif italic tracking-tighter leading-[0.85] drop-shadow-2xl"
              style={{ color: '#9cc2a9' }}
            >
              Journal Gallery
            </h1>
            <div className="flex items-center gap-6">
              <div className="w-12 h-[1px] bg-white/30" />
              <p className="text-[9px] md:text-[10px] uppercase tracking-[0.5em] text-white/60 font-medium">
                Visual Archive
              </p>
              <div className="w-12 h-[1px] bg-white/30" />
            </div>

            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="opacity-20 mt-4"
            >
              <ArrowRight className="rotate-90" size={18} />
            </motion.div>
          </motion.div>
        </header>

      {/* ── Filmstrip collection list ── */}
      <main className="pb-64">
        <div className="space-y-0">
          {activeCollections.map((collection, index) => (
            <FilmstripItem
              key={collection._id}
              collection={collection}
              onClick={() => setSelectedCollection(collection)}
              index={index}
            />
          ))}
        </div>
      </main>

      {/* ── Backdrop blur buffer ── */}
      <AnimatePresence>
        {isAnyOverlayOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-40 backdrop-blur-2xl bg-white/30 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* ── Overlay panels ── */}
      <AnimatePresence mode="wait">
        {selectedCollection && (
          <CollectionDetail
            key="story"
            collection={selectedCollection}
            onClose={() => setSelectedCollection(null)}
          />
        )}
        {showMap && mapPhotos && externalMapboxToken && (
          <Overlay key="map" title="Journal" variant="dark" onClose={() => setShowMap(false)}>
            <section className="py-8 max-w-7xl mx-auto">
              <MapboxMap photos={mapPhotos} mapboxToken={externalMapboxToken} showLocationList={true} />
            </section>
          </Overlay>
        )}
        {showAbout && (
          <Overlay key="about" title="About" variant="light" onClose={() => setShowAbout(false)}>
            <AboutPage settings={siteSettings} />
          </Overlay>
        )}
      </AnimatePresence>

        {/* ── Footer ── */}
        <footer className="py-20 px-6 md:px-12 border-t border-white/[0.06] mt-12">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h2 className="text-lg font-light text-white tracking-tight">Visual Archive.</h2>
              <p className="text-xs text-white/30 mt-1 font-light">
                &copy; {new Date().getFullYear()} Ryan. All rights reserved.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-white/30 font-mono">
              <span>Fujifilm X-T50</span>
              <span className="text-white/10">·</span>
              <span>Nikon Zf</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
