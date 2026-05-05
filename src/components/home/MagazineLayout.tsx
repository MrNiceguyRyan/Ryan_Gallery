import { useRef, useState, useEffect, useMemo } from 'react';
import { motion, useScroll, AnimatePresence } from 'framer-motion';
import { ArrowRight, Share2, Check } from 'lucide-react';
import type { Collection, Photo } from '../../types';
import Lightbox from '../shared/Lightbox';

const expo = [0.23, 1, 0.32, 1] as const;

/* ── Photo cell in the dense grid — respects natural dimensions, no cropping ── */
function PhotoCell({
  photo,
  span,
  index,
  hoveredIndex,
  setHoveredIndex,
  onClick,
}: {
  photo: Photo;
  span: 'full' | 'half' | 'third';
  index: number;
  hoveredIndex: number | null;
  setHoveredIndex: (idx: number | null) => void;
  onClick: () => void;
}) {
  const colSpan = span === 'full' ? 'col-span-6' : span === 'half' ? 'col-span-3' : 'col-span-2';
  const [isLoaded, setIsLoaded] = useState(false);
  const isAnyHovered = hoveredIndex !== null;
  const isThisHovered = hoveredIndex === index;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-5%' }}
      onHoverStart={() => setHoveredIndex(index)}
      onHoverEnd={() => setHoveredIndex(null)}
      onClick={onClick}
      animate={{
        opacity: isAnyHovered && !isThisHovered ? 0.4 : 1,
        filter: isAnyHovered && !isThisHovered ? 'blur(2px)' : 'blur(0px)',
        scale: isAnyHovered && !isThisHovered ? 0.97 : 1,
        zIndex: isThisHovered ? 20 : 1,
      }}
      whileHover={{
        scale: 1.02,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3), 0 12px 24px -8px rgba(0,0,0,0.2)',
      }}
      transition={{ duration: 0.6, ease: expo, boxShadow: { duration: 0.3 } }}
      className={`${colSpan} group relative bg-[#111] cursor-pointer overflow-hidden`}
    >
      {/* Index number */}
      <div className="absolute top-3 right-3 z-20 text-[7px] font-mono text-white/0 group-hover:text-white/40 transition-colors duration-700 pointer-events-none">
        {String(index + 1).padStart(2, '0')}
      </div>

      {/* Loading placeholder */}
      <motion.div
        animate={{ opacity: isLoaded ? 0 : 1 }}
        transition={{ duration: 0.6 }}
        className="absolute inset-0 bg-white/5 z-10 pointer-events-none"
      />

      {/* Image — natural aspect ratio, no cropping */}
      <motion.img
        onLoad={() => setIsLoaded(true)}
        whileHover={{ scale: 1.04 }}
        transition={{ duration: 1.2, ease: expo }}
        src={`${photo.imageUrl}?auto=format&w=${span === 'full' ? 1400 : span === 'half' ? 900 : 600}&q=82`}
        alt={photo.title || ''}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        className="w-full h-auto block grayscale-[0.15] hover:grayscale-0 transition-[filter] duration-[1.2s]"
        loading="lazy"
        draggable={false}
      />
    </motion.div>
  );
}

/* ── Full-screen lightbox using existing shared component ── */
function LightboxShell({
  photos,
  activeIndex,
  onClose,
}: {
  photos: Photo[];
  activeIndex: number;
  onClose: () => void;
}) {
  return (
    <Lightbox photos={photos} initialIndex={activeIndex} onClose={onClose} zIndex={60} />
  );
}

/* ══════════════════════════════════════════════════════════
 *  MagazineLayout — dark-theme collection detail overlay
 * ══════════════════════════════════════════════════════════ */
export default function MagazineLayout({
  collection,
  allCollections,
  onSelectCollection,
  onClose,
}: {
  collection: Collection;
  allCollections: Collection[];
  onSelectCollection: (c: Collection) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: containerRef });
  const [scrollPercent, setScrollPercent] = useState(0);
  const [isShared, setIsShared] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const photos = collection.photos || [];

  useEffect(() => {
    return scrollYProgress.on('change', (latest) => {
      setScrollPercent(Math.round(latest * 100));
    });
  }, [scrollYProgress]);

  // Next story
  const currentIndex = allCollections.findIndex((c) => c._id === collection._id);
  const nextCollection = allCollections[(currentIndex + 1) % allCollections.length];

  // Coords from first geotagged photo
  const coords = useMemo(() => {
    const p = photos.find((ph) => ph.location?.lat != null && ph.location?.lng != null);
    return p?.location || null;
  }, [photos]);

  const handleShare = async () => {
    const shareData = {
      title: `Ryan Xu | ${collection.name}`,
      text: collection.description || '',
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setIsShared(true);
        setTimeout(() => setIsShared(false), 2000);
      }
    } catch (_) {}
  };

  /* Build photo grid rows — 7-item cycle: full, half+half, full, third×3 */
  const rows = useMemo(() => {
    const result: { photo: Photo; span: 'full' | 'half' | 'third'; globalIdx: number }[][] = [];
    let i = 0;
    while (i < photos.length) {
      const p = i % 7;
      if (p === 0) {
        result.push([{ photo: photos[i], span: 'full', globalIdx: i }]);
        i++;
      } else if (p === 1 && i + 1 < photos.length) {
        result.push([
          { photo: photos[i], span: 'half', globalIdx: i },
          { photo: photos[i + 1], span: 'half', globalIdx: i + 1 },
        ]);
        i += 2;
      } else if (p === 3) {
        result.push([{ photo: photos[i], span: 'full', globalIdx: i }]);
        i++;
      } else if (p === 4 && i + 2 < photos.length) {
        result.push([
          { photo: photos[i], span: 'third', globalIdx: i },
          { photo: photos[i + 1], span: 'third', globalIdx: i + 1 },
          { photo: photos[i + 2], span: 'third', globalIdx: i + 2 },
        ]);
        i += 3;
      } else {
        result.push([{ photo: photos[i], span: 'full', globalIdx: i }]);
        i++;
      }
    }
    return result;
  }, [photos]);

  return (
    <>
      {/* Overlay shell — slide-up/down */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center bg-black/40 backdrop-blur-sm"
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.9, ease: [0.32, 0, 0.07, 1] }}
          ref={containerRef}
          className="w-full h-full overflow-y-auto no-scrollbar relative bg-[#0A0A0A] text-[#FDFDFB]"
        >
          {/* Sticky header */}
          <div className="sticky top-0 left-0 w-full z-10 px-6 py-6 md:px-12 flex justify-between items-center backdrop-blur-3xl bg-black/80 border-b border-white/5">
            <button
              onClick={onClose}
              className="flex items-center gap-3 text-[10px] uppercase tracking-[0.4em] font-bold hover:opacity-50 transition-all hover:gap-5"
            >
              <ArrowRight size={16} className="rotate-180" /> Back
            </button>
            <div className="text-[11px] uppercase tracking-[0.6em] font-bold opacity-30">
              {collection.location || collection.name}
            </div>
          </div>

          {/* Content */}
          <div className="relative z-0 px-6 md:px-12">
            <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply z-[80] paper-texture" />

            <div className="max-w-7xl mx-auto py-12 md:py-24 relative">
              <div className="grid lg:grid-cols-12 gap-8 md:gap-12 relative z-10">
                {/* Sticky sidebar */}
                <aside className="lg:col-span-4 lg:sticky lg:top-32 h-fit space-y-16">
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] uppercase tracking-[0.6em] font-bold opacity-30">
                        Vol. 01
                      </span>
                      <div className="h-[1px] flex-1 bg-white/10" />
                    </div>
                    <h2 className="text-5xl md:text-7xl lg:text-8xl font-serif italic tracking-tighter leading-[0.8]">
                      {collection.name}
                    </h2>
                    <div className="flex items-center gap-4 pt-4">
                      <p className="text-[10px] uppercase tracking-[0.4em] font-bold">
                        {collection.location || ''}
                      </p>
                      <div className="w-1 h-1 rounded-full bg-white/20" />
                      <p className="text-[10px] uppercase tracking-[0.4em] opacity-40 font-mono italic">
                        {collection.year || ''}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-10">
                    {collection.description && (
                      <p className="text-xl leading-relaxed font-serif opacity-80">
                        {collection.description}
                      </p>
                    )}

                    <div className="pt-8 space-y-8 border-t border-white/5">
                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase tracking-widest font-bold opacity-30">Equipment</span>
                          <p className="text-[10px] uppercase tracking-widest font-medium">Nikon Zf</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase tracking-widest font-bold opacity-30">Optics</span>
                          <p className="text-[10px] uppercase tracking-widest font-medium">40mm f/2</p>
                        </div>
                      </div>
                    </div>

                    {/* Scroll progress */}
                    <div className="pt-12 space-y-4">
                      <div className="flex justify-between text-[9px] uppercase tracking-widest font-bold opacity-30">
                        <span>Reading Progress</span>
                        <span className="font-mono">{scrollPercent}%</span>
                      </div>
                      <div className="h-[1px] w-full bg-white/5 relative overflow-hidden">
                        <motion.div
                          className="absolute top-0 left-0 h-full bg-white"
                          style={{ width: `${scrollPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="hidden lg:block pt-12">
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-[1px] bg-white opacity-10" />
                      <span className="text-[9px] uppercase tracking-[0.4em] font-mono opacity-30">
                        {photos.length} Captured Frames
                      </span>
                    </div>
                  </div>
                </aside>

                {/* Photo Grid — generous spacing for breathing room */}
                <div className="lg:col-span-8 space-y-3 md:space-y-4">
                  {rows.map((row, rowIdx) => (
                    <div key={rowIdx} className="grid grid-cols-6 gap-3 md:gap-4 items-end">
                      {row.map((item) => (
                        <PhotoCell
                          key={item.photo._id}
                          photo={item.photo}
                          span={item.span}
                          index={item.globalIdx}
                          hoveredIndex={hoveredIndex}
                          setHoveredIndex={setHoveredIndex}
                          onClick={() => setLightboxIndex(item.globalIdx)}
                        />
                      ))}
                    </div>
                  ))}

                  {/* Footer */}
                  <footer className="pt-32 pb-12 flex flex-col items-center gap-24 border-t border-white/5">
                    {/* Next Story */}
                    {nextCollection && (
                      <div
                        className="w-full flex flex-col items-center gap-12 group cursor-pointer"
                        onClick={() => onSelectCollection(nextCollection)}
                      >
                        <span className="text-[10px] uppercase tracking-[0.6em] font-bold opacity-30">
                          Keep Reading
                        </span>
                        <div className="flex flex-col items-center gap-8">
                          <h3 className="text-4xl md:text-6xl font-serif italic tracking-tighter hover:scale-105 transition-transform duration-[1.5s]">
                            {nextCollection.name}
                          </h3>
                          {nextCollection.coverImageUrl && (
                            <div className="w-48 h-32 overflow-hidden opacity-40 group-hover:opacity-100 transition-opacity duration-[1s]">
                              <img
                                src={`${nextCollection.coverImageUrl}?auto=format&w=600&q=60`}
                                className="w-full h-full object-cover scale-110 group-hover:scale-100 transition-transform duration-[2s]"
                                draggable={false}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row items-center justify-center gap-12 w-full">
                      <button onClick={handleShare} className="group flex flex-col items-center gap-4">
                        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all duration-500">
                          {isShared ? <Check size={16} /> : <Share2 size={16} />}
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.4em] font-bold opacity-30 group-hover:opacity-100 transition-opacity">
                          {isShared ? 'Link Copied' : 'Share Story'}
                        </span>
                      </button>

                      <button
                        onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="group flex flex-col items-center gap-4"
                      >
                        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all duration-500">
                          <ArrowRight className="-rotate-90" size={16} />
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.4em] font-bold opacity-30 group-hover:opacity-100 transition-opacity">
                          Back to Top
                        </span>
                      </button>
                    </div>
                  </footer>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <LightboxShell
            photos={photos}
            activeIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
