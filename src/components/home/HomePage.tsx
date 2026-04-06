import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { ChevronLeft, ArrowRight, Search, MapPin } from 'lucide-react';
import type { Collection, Photo } from '../../types';
import OpeningAnimation from './OpeningAnimation';
import { getMapboxToken } from '../../config/mapbox';
import Lightbox from '../shared/Lightbox';

const expo = [0.23, 1, 0.32, 1] as const;

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2000&auto=format&fit=crop';

interface Props {
  collections: Collection[];
  photos: Photo[];
}

/* ═══════════════════════════════════════════════════════
 *  Overlay — full-screen container (light bg)
 * ═══════════════════════════════════════════════════════ */
function Overlay({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.02, y: 20 }}
      transition={{ type: 'spring', damping: 30, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-[#FDFDFB] text-[#1A1A1A] overflow-y-auto no-scrollbar"
    >
      <div className="sticky top-0 left-0 w-full z-10 px-6 py-5 md:px-12 flex justify-between items-center bg-white/80 backdrop-blur-3xl border-b border-black/5">
        <button
          onClick={onClose}
          className="group flex items-center gap-2 px-4 py-2 -ml-4 rounded-full hover:bg-black/5 transition-all duration-300"
        >
          <div className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center group-hover:bg-black group-hover:text-white group-hover:border-black transition-all duration-300">
            <ChevronLeft size={14} strokeWidth={1.5} />
          </div>
          <span className="text-[11px] uppercase tracking-[0.2em] font-medium text-black/50 group-hover:text-black/80 transition-colors">Back</span>
        </button>
        <div className="text-[11px] uppercase tracking-[0.3em] font-medium opacity-25">{title}</div>
      </div>
      <div className="px-6 md:px-12">{children}</div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  PhotoBlock — dynamic photo in grid
 * ═══════════════════════════════════════════════════════ */
function PhotoBlock({
  photo,
  span,
  onClick,
}: {
  photo: Photo;
  span: 'full' | 'half' | 'third';
  onClick: () => void;
}) {
  const colSpan = span === 'full' ? 'col-span-6' : span === 'half' ? 'col-span-3' : 'col-span-2';
  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.5, ease: expo }}
      className={`${colSpan} group relative overflow-hidden rounded-sm cursor-pointer`}
      onClick={onClick}
    >
      <motion.img
        whileHover={{ scale: 1.03 }}
        transition={{ duration: 1.5, ease: expo }}
        src={`${photo.imageUrl}?auto=format&w=1200&q=82`}
        alt={photo.title || ''}
        className="w-full h-auto object-cover grayscale-[0.15] hover:grayscale-0 transition-all duration-[1.5s]"
        loading="lazy"
        draggable={false}
      />
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
    ? `${collection.coverImageUrl}?auto=format&w=2000&q=80`
    : collection.photos?.[0]?.imageUrl
      ? `${collection.photos[0].imageUrl}?auto=format&w=2000&q=80`
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
      className="filmstrip-item group relative cursor-pointer"
    >
      <div className="absolute inset-0 overflow-hidden">
        {coverUrl && (
          <motion.img
            style={{ y }}
            src={coverUrl}
            alt={collection.name}
            className="filmstrip-image brightness-[0.85] group-hover:brightness-100 transition-all duration-[2.5s] scale-110 group-hover:scale-100"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        )}
      </div>
      <div className="absolute inset-0 bg-black/25 group-hover:bg-transparent transition-colors duration-[1.5s]" />
      <div className="relative z-10 text-center px-6">
        <motion.div className="flex flex-col items-center gap-6">
          <span className="text-[10px] uppercase tracking-[0.8em] opacity-60 font-bold text-white group-hover:opacity-100 transition-opacity duration-1000">
            {collection.location || collection.subtitle || ''}
          </span>
          <h2 className="text-6xl md:text-[10vw] font-serif italic tracking-tighter text-white group-hover:scale-[1.05] transition-transform duration-[2s] leading-none drop-shadow-lg">
            {collection.name}
          </h2>
          <div className="w-0 group-hover:w-32 h-[1px] bg-white transition-all duration-[1.5s] opacity-40" />
        </motion.div>
      </div>
      <div className="absolute bottom-12 right-12 text-[10px] uppercase tracking-[0.5em] opacity-0 group-hover:opacity-80 transition-all duration-1000 translate-x-8 group-hover:translate-x-0 flex items-center gap-4 text-white font-bold">
        Explore Story <ArrowRight size={14} />
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
  const collectionPhotos = collection.photos || [];

  // Derive location from first geotagged photo
  const collectionLocation = useMemo(() => {
    const photo = collectionPhotos.find(p => p.location?.lat != null && p.location?.lng != null);
    return photo?.location || null;
  }, [collectionPhotos]);

  const mapboxToken = useMemo(() => {
    try { return getMapboxToken(); } catch { return ''; }
  }, []);

  /* Build dynamic photo grid rows: hero / half / hero / thirds */
  const rows: { photo: Photo; span: 'full' | 'half' | 'third' }[][] = [];
  let i = 0;
  while (i < collectionPhotos.length) {
    const pattern = rows.length % 4;
    if (pattern === 0 || pattern === 2) {
      // Full-width hero
      rows.push([{ photo: collectionPhotos[i], span: 'full' }]);
      i += 1;
    } else if (pattern === 1) {
      // Two side-by-side
      const row: { photo: Photo; span: 'full' | 'half' | 'third' }[] = [
        { photo: collectionPhotos[i], span: 'half' },
      ];
      if (i + 1 < collectionPhotos.length) {
        row.push({ photo: collectionPhotos[i + 1], span: 'half' });
        i += 2;
      } else {
        row[0].span = 'full';
        i += 1;
      }
      rows.push(row);
    } else {
      // Three in a row
      const row: { photo: Photo; span: 'full' | 'half' | 'third' }[] = [
        { photo: collectionPhotos[i], span: 'third' },
      ];
      if (i + 1 < collectionPhotos.length) row.push({ photo: collectionPhotos[i + 1], span: 'third' });
      if (i + 2 < collectionPhotos.length) row.push({ photo: collectionPhotos[i + 2], span: 'third' });
      // Adjust span if fewer than 3
      if (row.length === 1) row[0].span = 'full';
      else if (row.length === 2) { row[0].span = 'half'; row[1].span = 'half'; }
      i += row.length;
      rows.push(row);
    }
  }

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
              {collection.description && (
                <p className="text-lg md:text-xl leading-relaxed font-light opacity-60 max-w-md italic">
                  &ldquo;{collection.description}&rdquo;
                </p>
              )}
              {collection.subtitle && !collection.description && (
                <p className="text-lg leading-relaxed font-light opacity-60 max-w-md italic">
                  {collection.subtitle}
                </p>
              )}
              <div className="flex items-center gap-6 pt-12">
                <div className="w-16 h-[1px] bg-[#1A1A1A] opacity-10" />
                <span className="text-[10px] uppercase tracking-[0.3em] font-mono opacity-40">
                  {collectionPhotos.length} Captured Frames
                </span>
              </div>

              {/* Location mini-map card — wide country view, consistent with Journal map */}
              {collectionLocation && mapboxToken && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.8, ease: expo }}
                  className="mt-8 rounded-2xl overflow-hidden border border-black/5 shadow-md"
                >
                  <a
                    href={`/travel#loc=${collectionLocation.lat},${collectionLocation.lng},8`}
                    className="block relative h-44 overflow-hidden group cursor-pointer"
                  >
                    <img
                      src={`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+2c3e50(${collectionLocation.lng},${collectionLocation.lat})/${collectionLocation.lng},${collectionLocation.lat},3,0/500x260@2x?access_token=${mapboxToken}`}
                      alt={`Map of ${collectionLocation.city || collection.name}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      draggable={false}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-white/50 to-transparent" />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500 flex items-center justify-center">
                      <span className="text-white text-[10px] uppercase tracking-[0.2em] font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-black/40 backdrop-blur-sm px-4 py-2 rounded-full">
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
                          {collectionLocation.city || collection.name}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {collectionLocation.country || ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-[10px] text-gray-400 font-mono tracking-wide">
                        {Math.abs(collectionLocation.lat).toFixed(4)}°{collectionLocation.lat >= 0 ? 'N' : 'S'}, {Math.abs(collectionLocation.lng).toFixed(4)}°{collectionLocation.lng >= 0 ? 'E' : 'W'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Photo grid */}
            <div className="space-y-24 md:space-y-48">
              {rows.map((row, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-6 gap-4 md:gap-8">
                  {row.map((item, colIdx) => {
                    const globalIdx = rows
                      .slice(0, rowIdx)
                      .reduce((sum, r) => sum + r.length, 0) + colIdx;
                    return (
                      <PhotoBlock
                        key={item.photo._id}
                        photo={item.photo}
                        span={item.span}
                        onClick={() => setLightboxIndex(globalIdx)}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Return button */}
              <footer className="pt-48 pb-24 text-center">
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
            photos={collectionPhotos}
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
export default function HomePage({ collections, photos }: Props) {
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [showOpening, setShowOpening] = useState(false);

  // Filter to collections that have photos
  const activeCollections = collections.filter((c) => (c.photos?.length || 0) > 0);

  useEffect(() => {
    if (!sessionStorage.getItem('opening-shown')) setShowOpening(true);
  }, []);

  const handleOpeningComplete = useCallback(() => {
    sessionStorage.setItem('opening-shown', '1');
    setShowOpening(false);
  }, []);

  useEffect(() => {
    const isOverlayOpen = !!selectedCollection;
    document.body.style.overflow = isOverlayOpen ? 'hidden' : 'auto';
    document.body.style.backgroundColor = isOverlayOpen ? '#FDFDFB' : '#0A0A0A';
    return () => {
      document.body.style.overflow = '';
      document.body.style.backgroundColor = '';
    };
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
        <nav
          className={`fixed top-0 left-0 w-full z-40 px-6 py-5 md:px-12 flex items-center transition-all duration-700 ${
            selectedCollection
              ? 'bg-white/80 backdrop-blur-2xl border-b border-black/5'
              : 'bg-transparent'
          }`}
        >
          {/* Left spacer for centering */}
          <div className="flex-1" />

          {/* Center: name */}
          <button
            onClick={() => {
              setSelectedCollection(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`text-xl md:text-2xl font-display tracking-[0.12em] hover:opacity-60 transition-all ${
              selectedCollection ? 'text-[#1A1A1A]' : 'text-white'
            }`}
          >
            RYAN XU
          </button>

          {/* Right: nav links */}
          <div className="flex-1 flex justify-end items-center gap-6 md:gap-8">
            <a
              href="/"
              className={`hidden md:block text-[11px] uppercase tracking-[0.2em] font-medium hover:opacity-100 transition-all duration-700 ${
                selectedCollection ? 'text-[#1A1A1A]' : 'text-white'
              }`}
            >
              Photography
            </a>
            <a
              href="/travel"
              className={`hidden md:block text-[11px] uppercase tracking-[0.2em] font-medium hover:opacity-100 transition-all duration-700 ${
                selectedCollection ? 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]' : 'text-white/50 hover:text-white'
              }`}
            >
              Journal
            </a>
            <a
              href="/about"
              className={`hidden md:block text-[11px] uppercase tracking-[0.2em] font-medium hover:opacity-100 transition-all duration-700 ${
                selectedCollection ? 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]' : 'text-white/50 hover:text-white'
              }`}
            >
              About
            </a>
            {/* Mobile: search icon as menu hint */}
            <div className="md:hidden flex items-center gap-4">
              <a href="/travel" className="opacity-50 hover:opacity-100 transition-opacity">
                <Search size={16} className={selectedCollection ? 'text-[#1A1A1A]' : 'text-white'} />
              </a>
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
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-[#0A0A0A] z-10" />
            <img
              src={HERO_IMAGE}
              className="w-full h-full object-cover opacity-50"
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

      {/* ── Collection detail overlay ── */}
      <AnimatePresence>
        {selectedCollection && (
          <CollectionDetail
            collection={selectedCollection}
            onClose={() => setSelectedCollection(null)}
          />
        )}
      </AnimatePresence>

        {/* ── Footer ── */}
        <footer className="py-32 px-6 md:px-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-16 text-[10px] uppercase tracking-[0.4em] opacity-50">
          <div className="flex flex-col items-center md:items-start gap-6">
            <span className="text-2xl font-display tracking-[0.12em] text-white">RYAN XU</span>
            <p className="max-w-xs text-center md:text-left leading-loose">
              A curated collection of visual narratives from across the globe.
            </p>
            <div className="text-[9px] uppercase tracking-[0.4em] opacity-40 mt-4">
              &copy; {new Date().getFullYear()} Ryan Xu. All rights reserved.
            </div>
          </div>
          <div className="flex gap-16">
            <div className="flex flex-col gap-4">
              <span className="opacity-100 font-bold mb-2">Navigate</span>
              <a href="/travel" className="hover:text-white transition-colors">Journal</a>
              <a href="/about" className="hover:text-white transition-colors">About</a>
            </div>
            <div className="flex flex-col gap-4">
              <span className="opacity-100 font-bold mb-2">Tech</span>
              <span>Nikon Zf</span>
              <span>Astro + React</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
