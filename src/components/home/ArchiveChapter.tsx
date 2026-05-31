import { useRef, useMemo, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { Collection } from '../../types';

interface ArchiveChapterProps {
  id: string;
  collection: Collection;
  onClick: () => void;
  index: number;
  isActive: boolean;
}

export default function ArchiveChapter({ id, collection, onClick, index, isActive }: ArchiveChapterProps) {
  const chapterRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const { scrollYProgress } = useScroll({
    target: chapterRef,
    offset: ['start end', 'end start'],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
  // Dramatic zoom: starts at 1.08 and zooms down to 1 as it enters viewport
  const scale = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [1.08, 1, 1, 0.98]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const numberY = useTransform(scrollYProgress, [0, 1], [150, -150]);
  // Parallax for the cover image inside its container
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '-15%']);

  const coverBase = collection.coverImageUrl ?? collection.photos?.[0]?.imageUrl ?? '';
  // Desktop chapter cover — container caps at ~1100 px, Retina hits ~2200 px.
  // Bracket 900 / 1400 / 1800; let the browser pick. (Mobile uses MobileFilmstripItem
  // instead — this component is `hidden md:block`, and `loading="lazy"` below ensures
  // mobile users never request these URLs.)
  const coverUrl     = coverBase ? `${coverBase}?auto=format&w=1400&q=80` : '';
  const coverSrcSet  = coverBase
    ? `${coverBase}?auto=format&w=900&q=80 900w, ${coverBase}?auto=format&w=1400&q=80 1400w, ${coverBase}?auto=format&w=1800&q=78 1800w`
    : undefined;

  const coords = useMemo(() => {
    const photo = collection.photos?.find(p => p.location?.lat != null && p.location?.lng != null);
    return photo?.location || null;
  }, [collection.photos]);

  const thumbnails = useMemo(() => {
    return (collection.photos || [])
      .slice(1, 4)
      .map(p => `${p.imageUrl}?auto=format&w=400&q=60`);
  }, [collection.photos]);

  return (
    <motion.section
      id={id}
      ref={chapterRef}
      style={{ opacity }}
      className="relative pb-12 lg:pb-16"
    >
      {/* Massive Background Number */}
      <motion.div
        style={{ y: numberY }}
        className="absolute -left-20 lg:-left-40 top-0 select-none pointer-events-none z-0"
      >
        <span className="text-[35vw] md:text-[25vw] font-black leading-none text-white/[0.03] italic tracking-tighter">
          {String(index + 1).padStart(2, '0')}
        </span>
      </motion.div>

      {/* Main Container */}
      <div className="relative z-10 space-y-12">
        {/* Title Bar */}
        <div className="flex items-end justify-between border-b border-white/10 pb-6">
          <motion.h3
            initial={{ x: -50, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl md:text-6xl lg:text-[8.5rem] font-serif italic tracking-tighter leading-[0.8] text-white"
          >
            {collection.name}
          </motion.h3>
          <div className="hidden lg:block text-right pb-4">
            <span className="block font-mono text-[10px] opacity-20 uppercase tracking-[0.5em]">
              Sequence_Data
            </span>
            <span className="block font-mono text-[12px] opacity-40 uppercase tracking-widest">
              {collection.year || ''} // ARC.V10
            </span>
          </div>
        </div>

        {/* Cover Image with HUD — dramatic zoom on scroll + hover */}
        <motion.div
          className="relative group cursor-none w-full overflow-visible"
          onClick={onClick}
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          data-cursor="View Story"
          role="button"
          aria-label={`View story: ${collection.name}`}
        >
          <motion.div
            style={{ scale }}
            className="relative aspect-[16/9] md:aspect-[21/9] overflow-hidden bg-white/[0.02] border border-white/5"
          >
            {coverUrl && (
              <motion.img
                style={{ y: imgY }}
                src={coverUrl}
                srcSet={coverSrcSet}
                sizes="(min-width: 1024px) 66vw, 100vw"
                alt={collection.name}
                loading="lazy"
                decoding="async"
                animate={{
                  scale: isHovered ? 1.12 : isActive ? 1.05 : 1,
                  filter: isHovered || isActive
                    ? 'grayscale(0) brightness(1.1)'
                    : 'grayscale(1) brightness(0.8)',
                }}
                transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 w-full h-[130%] object-cover"
                draggable={false}
              />
            )}

            {/* Tech Scanlines */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

            {/* Gradient overlay */}
            <div
              className={`absolute inset-0 transition-opacity duration-1000 bg-gradient-to-t from-black/60 via-transparent to-transparent ${
                isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />
          </motion.div>

          {/* Persistent "View Story" affordance — always visible so the cover
               clearly reads as openable; inverts to solid on hover. */}
          <div className="absolute bottom-4 left-4 md:bottom-5 md:left-5 z-30 pointer-events-none">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/40 backdrop-blur-md px-4 py-2 text-white group-hover:bg-white group-hover:text-black group-hover:border-white transition-all duration-500">
              <span className="text-[9px] uppercase tracking-[0.3em] font-bold">View Story</span>
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform duration-500" />
            </div>
          </div>

          {/* HUD Overlay on Hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden">
            <div className="absolute top-8 left-8 w-6 h-6 border-l border-t border-white/30" />
            <div className="absolute top-8 right-8 w-6 h-6 border-r border-t border-white/30" />
            <div className="absolute bottom-8 left-8 w-6 h-6 border-l border-b border-white/30" />
            <div className="absolute bottom-8 right-8 w-6 h-6 border-r border-b border-white/30" />

            {/* Center Crosshair */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="w-32 h-32 border border-white/[0.03] rounded-full" />
              <div className="w-1 h-32 bg-white/[0.03] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              <div className="w-32 h-1 bg-white/[0.03] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>

            {/* Data Feed */}
            <div className="absolute top-12 left-12 font-mono text-[7px] space-y-1 text-white/40 tracking-[0.3em] hidden md:block">
              <p>OBJ_DETECTION: {(collection.location || collection.name).toUpperCase()}</p>
              <p>RESOLUTION: 8K_UNCOMPRESSED</p>
              <p>SIGNAL_STRENGTH: 98.4%</p>
            </div>

            {coords && (
              <div className="absolute bottom-12 right-12 text-right font-mono text-[7px] space-y-1 text-white/40 tracking-[0.3em] hidden md:block">
                <p>LAT: {coords.lat.toFixed(4)}</p>
                <p>LNG: {coords.lng.toFixed(4)}</p>
                <p>SYS_STAMP: {new Date().getFullYear()}/05/04</p>
              </div>
            )}
          </div>

          {/* Contact Sheet Thumbnails */}
          {thumbnails.length > 0 && (
            <div className="absolute -bottom-20 left-12 hidden xl:flex gap-8 z-40">
              {thumbnails.map((url, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 40, rotate: i % 2 === 0 ? 5 : -5 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.8 + i * 0.2, duration: 1.5, ease: 'circOut' }}
                  className="w-32 h-44 overflow-hidden border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] grayscale hover:grayscale-0 transition-all duration-500 group-hover:translate-y-[-10px]"
                >
                  <img src={url} className="w-full h-full object-cover" draggable={false} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Tech Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-16 pt-8 items-start text-left">
          <div className="md:col-span-1 hidden lg:block">
            <div className="rotate-90 origin-left translate-y-24 w-max whitespace-nowrap">
              <span className="font-mono text-[8px] opacity-10 uppercase tracking-[1em]">
                SYSTEM_MONITOR_CALIBRATED
              </span>
            </div>
          </div>

          <div className="md:col-span-5 flex flex-col justify-end h-full">
            <div className="flex gap-16 text-left">
              <div className="space-y-2">
                <span className="text-[9px] uppercase tracking-widest opacity-20 block font-mono">Territory</span>
                <span className="text-[14px] font-black tracking-[0.2em] uppercase block text-white/90">
                  {collection.location || collection.name}
                </span>
              </div>
              {coords && (
                <div className="space-y-2">
                  <span className="text-[9px] uppercase tracking-widest opacity-20 block font-mono">Geo_Link</span>
                  <span className="text-[11px] font-mono opacity-40 block tracking-tighter italic">
                    {coords.lat.toFixed(6)}&deg; N
                    <br />
                    {coords.lng.toFixed(6)}&deg; E
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="md:col-span-4 flex items-center justify-end md:justify-start gap-8">
            <div className="h-32 w-px bg-white/5 mx-auto hidden md:block" />
            <div className="space-y-4 text-left">
              <span className="text-[9px] uppercase tracking-widest opacity-20 block font-mono">Archive_Ref</span>
              <div className="font-mono text-[10px] space-y-1 opacity-40 uppercase tracking-widest leading-relaxed text-left">
                <p>ISO_100_S.DYN</p>
                <p>RAW_COMPRESSED</p>
                <p>ENCRYPTION_AES_256</p>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 flex md:justify-end">
            <motion.button
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClick}
              className="group relative"
            >
              <div className="w-24 h-24 rounded-none border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all duration-500">
                <ArrowRight size={32} />
              </div>
              <div className="absolute inset-0 border border-white/5 translate-x-2 translate-y-2 -z-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform" />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
