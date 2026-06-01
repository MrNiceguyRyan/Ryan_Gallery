import { useRef, useMemo, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Layers } from 'lucide-react';
import type { Collection } from '../../types';
import { stateCovers, stateFrameCount, firstCoords } from '../../lib/stateGrouping';

interface StateChapterProps {
  id: string;
  state: string;
  collections: Collection[];
  onClick: () => void;
  index: number;
  isActive: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════
 *  StateChapter — a clustered "state" entry on the homepage archive.
 *
 *  Visually echoes ArchiveChapter, but the cover is a montage of the member
 *  cities' covers and the metadata advertises how much sits inside
 *  ("3 Cities · 47 Frames"). Clicking opens the StateHub overlay, where
 *  every city story is listed in full — so clustering never hides content.
 * ═══════════════════════════════════════════════════════════════════════ */
export default function StateChapter({ id, state, collections, onClick, index, isActive }: StateChapterProps) {
  const chapterRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const { scrollYProgress } = useScroll({
    target: chapterRef,
    offset: ['start end', 'end start'],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [1.08, 1, 1, 0.98]);
  const numberY = useTransform(scrollYProgress, [0, 1], [150, -150]);
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '-12%']);

  const covers = useMemo(() => stateCovers(collections, 4), [collections]);
  const frameCount = useMemo(() => stateFrameCount(collections), [collections]);
  const coords = useMemo(() => firstCoords(collections), [collections]);
  const cityCount = collections.length;

  // Montage tile layout: how the up-to-4 covers tile the 21:9 frame.
  const tiles = covers.length;

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

      <div className="relative z-10 space-y-12">
        {/* Title Bar */}
        <div className="flex items-end justify-between border-b border-white/10 pb-6">
          <div className="flex flex-col gap-3">
            <motion.div
              initial={{ x: -30, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 text-[9px] uppercase tracking-[0.5em] font-bold opacity-40"
            >
              <Layers size={12} className="opacity-70" />
              <span>Region · {cityCount} Cities</span>
            </motion.div>
            <motion.h3
              initial={{ x: -50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl md:text-6xl lg:text-[8.5rem] font-serif italic tracking-tighter leading-[0.8] text-white"
            >
              {state}
            </motion.h3>
          </div>
          <div className="hidden lg:block text-right pb-4">
            <span className="block font-mono text-[10px] opacity-20 uppercase tracking-[0.5em]">
              Cluster_Index
            </span>
            <span className="block font-mono text-[12px] opacity-40 uppercase tracking-widest">
              {cityCount} CITIES // {frameCount} FRAMES
            </span>
          </div>
        </div>

        {/* Montage Cover */}
        <motion.div
          className="relative group cursor-pointer w-full overflow-visible"
          onClick={onClick}
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
        >
          <motion.div
            style={{ scale }}
            className="relative aspect-[16/9] md:aspect-[21/9] overflow-hidden bg-white/[0.02] border border-white/5"
          >
            {/* Montage grid — fills the whole frame with the member covers */}
            <motion.div
              style={{
                y: imgY,
                ...(tiles >= 4
                  ? { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }
                  : tiles === 3
                    ? { gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr' }
                    : tiles === 2
                      ? { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' }
                      : { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }),
              }}
              animate={{
                scale: isHovered ? 1.06 : isActive ? 1.03 : 1,
                filter: isHovered || isActive
                  ? 'grayscale(0) brightness(1.05)'
                  : 'grayscale(1) brightness(0.8)',
              }}
              transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 w-full h-[120%] grid gap-[2px]"
            >
              {covers.map((url, i) => (
                <div
                  key={url}
                  className="relative overflow-hidden"
                  style={tiles === 3 && i === 0 ? { gridRow: 'span 2' } : undefined}
                >
                  <img
                    src={`${url}?auto=format&w=900&q=78`}
                    srcSet={`${url}?auto=format&w=600&q=78 600w, ${url}?auto=format&w=1000&q=78 1000w`}
                    sizes="(min-width: 1024px) 40vw, 60vw"
                    alt={`${state} city ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
              ))}
            </motion.div>

            {/* Tech Scanlines */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

            {/* Gradient overlay */}
            <div
              className={`absolute inset-0 transition-opacity duration-1000 bg-gradient-to-t from-black/60 via-transparent to-transparent ${
                isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />

            {/* Stacked-pages affordance label */}
            <div className="absolute bottom-6 left-6 md:bottom-8 md:left-8 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
              <div className="px-3 py-1.5 border border-white/30 backdrop-blur-md bg-black/30 flex items-center gap-2">
                <Layers size={11} className="text-white/70" />
                <span className="text-[9px] uppercase tracking-[0.3em] font-bold text-white/80">
                  Open Region
                </span>
              </div>
            </div>
          </motion.div>

          {/* HUD corner brackets on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden">
            <div className="absolute top-8 left-8 w-6 h-6 border-l border-t border-white/30" />
            <div className="absolute top-8 right-8 w-6 h-6 border-r border-t border-white/30" />
            <div className="absolute bottom-8 left-8 w-6 h-6 border-l border-b border-white/30" />
            <div className="absolute bottom-8 right-8 w-6 h-6 border-r border-b border-white/30" />
            <div className="absolute top-12 left-12 font-mono text-[7px] space-y-1 text-white/40 tracking-[0.3em] hidden md:block">
              <p>CLUSTER: {state.toUpperCase()}</p>
              <p>NODES: {cityCount} CITIES</p>
              <p>FRAMES: {frameCount}</p>
            </div>
          </div>
        </motion.div>

        {/* Member-city ticker + meta */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-16 pt-2 items-start text-left">
          <div className="md:col-span-9 space-y-5">
            <div className="space-y-2">
              <span className="text-[9px] uppercase tracking-widest opacity-20 block font-mono">
                Cities in this region
              </span>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {collections.map((c) => (
                  <span
                    key={c._id}
                    className="text-[13px] md:text-[15px] font-serif italic tracking-tight text-white/70"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
            {coords && (
              <div className="space-y-2">
                <span className="text-[9px] uppercase tracking-widest opacity-20 block font-mono">Geo_Anchor</span>
                <span className="text-[11px] font-mono opacity-40 block tracking-tighter italic">
                  {coords.lat.toFixed(4)}&deg; N · {coords.lng.toFixed(4)}&deg; {coords.lng >= 0 ? 'E' : 'W'}
                </span>
              </div>
            )}
          </div>

          <div className="md:col-span-3 flex md:justify-end">
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
