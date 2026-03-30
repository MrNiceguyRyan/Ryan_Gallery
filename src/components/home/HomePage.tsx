import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, useInView, AnimatePresence } from 'framer-motion';
import type { Collection, Photo } from '../../types';
import OpeningAnimation from './OpeningAnimation';

const expo = [0.16, 1, 0.3, 1] as const;

interface Props {
  collections: Collection[];
  photos: Photo[];
}

const HERO_IMAGE =
  'https://cdn.sanity.io/images/z610fooo/production/b3ff88abc00f4b64e60a031bdfd701ca34ceb618-4096x2730.jpg';

/* ═══════════════════════════════════════════════════════
 *  Animated Counter
 * ═══════════════════════════════════════════════════════ */
function AnimatedCounter({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const dur = 2000;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / dur, 1);
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isInView, target]);

  return <span ref={ref}>{count}</span>;
}

/* ═══════════════════════════════════════════════════════
 *  WorksShowcase — single-row project switcher
 *  Nav on left · ALL photos in ONE horizontal row · no stacking
 *  Scales proportionally with viewport width
 * ═══════════════════════════════════════════════════════ */
function WorksShowcase({ collections }: { collections: Collection[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = collections[activeIdx];
  const visiblePhotos = (active?.photos || []).slice(0, 6);

  return (
    <div className="relative px-[3vw]">
      {/* ── Desktop: nav left + all photos in one row ── */}
      <div className="hidden md:flex items-center gap-[3vw]">
        {/* LEFT: section number + nav */}
        <div className="shrink-0 flex flex-col items-start">
          <AnimatePresence mode="wait">
            <motion.div
              key={`num-${activeIdx}`}
              className="font-bold text-gray-900 tracking-tight leading-none mb-[1.5vw]"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 5rem)' }}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.4, ease: expo }}
            >
              {String(activeIdx + 1).padStart(2, '0')}
            </motion.div>
          </AnimatePresence>
          <nav className="flex flex-col gap-1">
            {collections.map((c, i) => {
              const isActive = i === activeIdx;
              return (
                <button
                  key={c._id}
                  onClick={() => setActiveIdx(i)}
                  className={`text-left uppercase whitespace-nowrap transition-colors duration-300 flex items-center gap-2 py-0.5 cursor-pointer tracking-[0.14em] ${
                    isActive
                      ? 'text-gray-900 font-semibold'
                      : 'text-gray-300 hover:text-gray-600'
                  }`}
                  style={{ fontSize: 'clamp(12px, 1.1vw, 16px)' }}
                >
                  {c.name}
                  {isActive && <span style={{ fontSize: 'clamp(10px, 0.9vw, 13px)' }}>&#9668;</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* RIGHT: ALL photos in ONE horizontal row */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={`photos-${activeIdx}`}
              className="flex gap-[1vw]"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              transition={{ duration: 0.5, ease: expo }}
            >
              {visiblePhotos.map((photo, i) => (
                <motion.a
                  key={photo._id}
                  href={`/works/${active.slug}#photo-${photo._id}`}
                  className="block shrink-0 overflow-hidden rounded-sm group"
                  style={{ width: 'clamp(120px, 13vw, 220px)', aspectRatio: '4/3' }}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: i * 0.08, ease: expo }}
                  whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 25 } }}
                >
                  <img
                    src={`${photo.imageUrl}?auto=format&w=500&q=80`}
                    alt={photo.title || active.name}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700 ease-out"
                    draggable={false}
                  />
                </motion.a>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Mobile: city tabs + one-row scroll ── */}
      <div className="md:hidden">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-3xl font-bold text-gray-900 leading-none">
            {String(activeIdx + 1).padStart(2, '0')}
          </span>
          <div className="flex gap-3 overflow-x-auto no-scrollbar">
            {collections.map((c, i) => (
              <button
                key={c._id}
                onClick={() => setActiveIdx(i)}
                className={`text-[10px] tracking-[0.12em] uppercase whitespace-nowrap py-1 border-b-2 transition-colors ${
                  i === activeIdx
                    ? 'text-gray-900 font-semibold border-gray-900'
                    : 'text-gray-300 border-transparent'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={`m-${activeIdx}`}
            className="flex gap-2 overflow-x-auto no-scrollbar pb-2"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.4, ease: expo }}
          >
            {visiblePhotos.map((photo) => (
              <a
                key={photo._id}
                href={`/works/${active.slug}#photo-${photo._id}`}
                className="block shrink-0 w-[35vw] aspect-[4/3] overflow-hidden"
              >
                <img
                  src={`${photo.imageUrl}?auto=format&w=300&q=75`}
                  alt={photo.title || active.name}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </a>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  HomePage
 * ═══════════════════════════════════════════════════════ */
export default function HomePage({ collections, photos }: Props) {
  const [showOpening, setShowOpening] = useState(false);

  /* ── Hero parallax ── */
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroImgY = useTransform(heroProgress, [0, 1], [0, 150]);
  const heroTextY = useTransform(heroProgress, [0, 1], [0, -80]);
  const heroOpacity = useTransform(heroProgress, [0, 0.5], [1, 0]);
  const smoothImgY = useSpring(heroImgY, { stiffness: 50, damping: 30 });
  const smoothTextY = useSpring(heroTextY, { stiffness: 50, damping: 30 });

  /* ── Opening animation ── */
  useEffect(() => {
    if (!sessionStorage.getItem('opening-shown')) setShowOpening(true);
  }, []);
  const handleOpeningComplete = useCallback(() => {
    sessionStorage.setItem('opening-shown', '1');
    setShowOpening(false);
  }, []);

  /* ── Marquee ── */
  const marqueeItems = [
    'Photographer',
    'Visual Storyteller',
    'Travel',
    'Street',
    'Landscape',
    'Architecture',
    'Portrait',
  ];

  return (
    <>
      {showOpening && <OpeningAnimation onComplete={handleOpeningComplete} />}

      <div
        className={
          showOpening
            ? 'opacity-0'
            : 'opacity-100 transition-opacity duration-700'
        }
      >
        {/* ═══════════════════ HERO — fullscreen cover ═══════════════════ */}
        <section
          ref={heroRef}
          className="relative h-screen overflow-hidden bg-[#0a0a0a]"
        >
          {/* Ken Burns slow-zoom + parallax image */}
          <motion.div
            className="absolute inset-0"
            style={{ y: smoothImgY }}
          >
            <motion.img
              src={`${HERO_IMAGE}?auto=format&w=2200&q=85`}
              alt=""
              className="w-full h-[120%] object-cover"
              style={{ objectPosition: 'center 40%' }}
              draggable={false}
              initial={{ scale: 1.2, filter: 'brightness(0.6) blur(6px)' }}
              animate={{ scale: 1.02, filter: 'brightness(0.85) blur(0px)' }}
              transition={{ duration: 8, ease: [0.25, 0, 0.2, 1] }}
            />
          </motion.div>

          {/* Subtle overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/30" />

          {/* Text overlay — centered */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10"
            style={{ y: smoothTextY, opacity: heroOpacity }}
          >
            <motion.h1
              className="font-serif italic text-white tracking-[-0.02em] text-center leading-none"
              style={{ fontSize: 'clamp(2.8rem, 7vw, 7rem)' }}
              initial={{ opacity: 0, y: 80, filter: 'blur(16px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1.6, delay: 0.2, ease: expo }}
            >
              Discover the World
            </motion.h1>
            <motion.div
              className="flex items-center gap-6 mt-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.8, ease: expo }}
            >
              <motion.span
                className="h-px bg-white/30"
                initial={{ width: 0 }}
                animate={{ width: 48 }}
                transition={{ duration: 1.2, delay: 1.2, ease: expo }}
              />
              <span
                className="tracking-[0.6em] text-white/50 uppercase font-light"
                style={{ fontSize: 'clamp(8px, 0.8vw, 12px)' }}
              >
                Ryan&apos;s Gallery
              </span>
              <motion.span
                className="h-px bg-white/30"
                initial={{ width: 0 }}
                animate={{ width: 48 }}
                transition={{ duration: 1.2, delay: 1.2, ease: expo }}
              />
            </motion.div>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2, duration: 0.8 }}
          >
            <span className="text-[7px] tracking-[0.5em] text-white/30 uppercase">
              Scroll
            </span>
            <motion.div
              className="w-px h-8 bg-white/20 origin-top"
              animate={{ scaleY: [0, 1, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </section>

        {/* ═══════════════════ MARQUEE ═══════════════════ */}
        <motion.div
          className="py-5 border-y border-gray-100 bg-white overflow-hidden"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="animate-marquee flex whitespace-nowrap">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center shrink-0">
                {[...marqueeItems, ...marqueeItems].map((item, j) => (
                  <span key={`${copy}-${j}`} className="flex items-center shrink-0 mx-5 md:mx-8">
                    <span className="text-sm md:text-base font-serif italic text-gray-800 tracking-wide">
                      {item}
                    </span>
                    <span className="text-gray-200/60 text-[10px] ml-5 md:ml-8">&#10022;</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </motion.div>

        {/* ═══════════════════ WORKS — one-row interactive switcher ═══════════════════ */}
        <motion.section
          className="bg-white py-16 md:py-24 overflow-hidden"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: expo }}
        >
          <WorksShowcase collections={collections} />
        </motion.section>

        {/* ═══════════════════ STATS ═══════════════════ */}
        <section className="py-20 md:py-28 px-6 md:px-16 bg-white">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-center gap-16 md:gap-28">
            {[
              { value: photos.length, label: 'Photographs' },
              { value: new Set(collections.map(c => c.location || c.name)).size, label: 'Cities' },
              { value: collections.length, label: 'Collections' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                className="text-center"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: i * 0.15, ease: expo }}
              >
                <div
                  className="font-serif italic text-gray-900 leading-none tracking-tight"
                  style={{ fontSize: 'clamp(3.5rem, 7vw, 6rem)' }}
                >
                  <AnimatedCounter target={stat.value} />
                </div>
                <p className="text-[9px] tracking-[0.5em] text-gray-400 uppercase mt-5 font-light">
                  {stat.label}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══════════════════ CTA ═══════════════════ */}
        <motion.section
          className="py-16 md:py-24 px-6 md:px-16 text-center border-t border-gray-50"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: expo }}
        >
          <motion.a
            href="/travel"
            className="inline-flex items-center gap-5 group"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <span
              className="font-serif italic text-gray-900 group-hover:text-gray-500 transition-colors duration-500"
              style={{ fontSize: 'clamp(1.5rem, 3vw, 2.5rem)' }}
            >
              Explore the Journey
            </span>
            <svg
              className="w-6 h-6 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-2 transition-all duration-500"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
            </svg>
          </motion.a>
        </motion.section>

        {/* ═══════════════════ FOOTER ═══════════════════ */}
        <motion.footer
          className="py-20 px-6 md:px-16 max-w-7xl mx-auto border-t border-gray-100"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-serif italic text-gray-900 tracking-tight">Ryan Xu.</h2>
              <p className="text-[10px] text-gray-400 mt-2 font-light tracking-wider">
                &copy; {new Date().getFullYear()} All rights reserved.
              </p>
            </div>
            <div className="flex items-center gap-6 text-[10px] text-gray-400 font-mono tracking-wider">
              <span>Nikon Zf</span>
              <span className="text-gray-200">|</span>
              <span>Astro + React</span>
              <span className="text-gray-200">|</span>
              <span>Sanity CMS</span>
            </div>
          </div>
        </motion.footer>
      </div>
    </>
  );
}
