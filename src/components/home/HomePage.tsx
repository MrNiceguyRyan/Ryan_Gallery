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
 *  State → City map from PHOTO folder structure
 * ═══════════════════════════════════════════════════════ */
const STATE_MAP = [
  { name: 'Arizona', cities: ['66 Road', 'Grand Canyon', 'Page'] },
  { name: 'California', cities: ['Death Valley', 'Los Angeles', 'San Diego'] },
  { name: 'Colorado', cities: ['Denver', 'Rocky Mountain'] },
  { name: 'DMV', cities: ['Baltimore', 'DC'] },
  { name: 'Florida', cities: ['Miami', 'Orlando'] },
  { name: 'Macau', cities: ['Macau'] },
  { name: 'Nevada', cities: ['Las Vegas'] },
  { name: 'New York', cities: ['New York'] },
  { name: 'Utah', cities: ['Bryce Canyon', 'Capitol Reef', 'Zion'] },
  { name: 'Washington', cities: ['Seattle'] },
];


/* ── iMessage-style stacked photo pile for a city ── */
function PhotoStack({
  cityName,
  photos,
  slug,
  index,
}: {
  cityName: string;
  photos: Photo[];
  slug?: string;
  index: number;
}) {
  const stackPhotos = photos.slice(0, 4);
  const hasPhotos = stackPhotos.length > 0;
  const href = slug ? `/works/${slug}` : undefined;
  const Wrapper = href ? 'a' : 'div';

  return (
    <motion.div
      className="shrink-0 flex flex-col items-center gap-3 group cursor-pointer"
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: expo }}
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 25 } }}
    >
      <Wrapper
        {...(href ? { href } : {})}
        className="relative block"
        style={{ width: 'clamp(100px, 11vw, 160px)', height: 'clamp(130px, 14vw, 200px)' }}
      >
        {hasPhotos ? (
          /* Stacked photos — iMessage style: each slightly rotated + offset */
          <>
            {stackPhotos.map((photo, i) => {
              const rotations = [-4, 3, -1.5, 2];
              const offsets = [
                { x: -3, y: 2 },
                { x: 4, y: -1 },
                { x: -1, y: 3 },
                { x: 2, y: -2 },
              ];
              const isTop = i === 0;
              return (
                <motion.div
                  key={photo._id}
                  className="absolute inset-0 rounded-md overflow-hidden shadow-md"
                  style={{
                    zIndex: stackPhotos.length - i,
                    rotate: `${rotations[i % 4]}deg`,
                    x: offsets[i % 4].x,
                    y: offsets[i % 4].y,
                  }}
                  whileHover={
                    isTop
                      ? { scale: 1.02, rotate: '0deg', transition: { duration: 0.4 } }
                      : undefined
                  }
                >
                  <img
                    src={`${photo.imageUrl}?auto=format&w=400&q=75`}
                    alt={photo.title || cityName}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                  {/* Slight darkening on bottom cards */}
                  {!isTop && (
                    <div className="absolute inset-0 bg-black/10" />
                  )}
                </motion.div>
              );
            })}
            {/* Photo count badge */}
            {photos.length > 1 && (
              <div className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-gray-900 text-white text-[9px] font-medium flex items-center justify-center shadow-lg">
                {photos.length}
              </div>
            )}
          </>
        ) : (
          /* Placeholder for cities without photos yet */
          <div className="absolute inset-0 rounded-md bg-gray-100 border border-gray-200/50 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
            </svg>
          </div>
        )}
      </Wrapper>
      {/* City name label */}
      <span
        className="text-gray-500 font-light tracking-wide text-center leading-tight group-hover:text-gray-900 transition-colors duration-400"
        style={{ fontSize: 'clamp(10px, 0.9vw, 13px)' }}
      >
        {cityName}
      </span>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  WorksShowcase — State nav → City photo stacks
 *  Left: state names (top→bottom) · Right: iMessage-style city piles
 * ═══════════════════════════════════════════════════════ */
function WorksShowcase({ collections }: { collections: Collection[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const activeState = STATE_MAP[activeIdx];

  /* Match Sanity collections to cities by fuzzy name match */
  function findCollection(cityName: string): Collection | undefined {
    return collections.find((c) => {
      const cn = c.name.trim().toLowerCase();
      const target = cityName.toLowerCase();
      return cn.includes(target) || target.includes(cn);
    });
  }

  return (
    <div className="relative px-[3vw]">
      {/* ── Desktop: state nav left + city stacks right ── */}
      <div className="hidden md:flex items-start gap-[3vw]">
        {/* LEFT: section number + state nav */}
        <div className="shrink-0 flex flex-col items-start pt-2">
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
            {STATE_MAP.map((state, i) => {
              const isActive = i === activeIdx;
              return (
                <button
                  key={state.name}
                  onClick={() => setActiveIdx(i)}
                  className={`text-left uppercase whitespace-nowrap transition-colors duration-400 flex items-center gap-2 py-0.5 cursor-pointer tracking-[0.14em] ${
                    isActive
                      ? 'text-gray-900 font-semibold'
                      : 'text-gray-300 hover:text-gray-600'
                  }`}
                  style={{ fontSize: 'clamp(12px, 1.1vw, 16px)' }}
                >
                  {state.name}
                  {isActive && <span style={{ fontSize: 'clamp(10px, 0.9vw, 13px)' }}>&#9668;</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* RIGHT: city photo stacks — slide in/out */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={`cities-${activeIdx}`}
              className="flex gap-[2vw] items-start py-2"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              transition={{ duration: 0.5, ease: expo }}
            >
              {activeState.cities.map((cityName, i) => {
                const col = findCollection(cityName);
                const cityPhotos = col?.photos || [];
                return (
                  <PhotoStack
                    key={cityName}
                    cityName={cityName}
                    photos={cityPhotos}
                    slug={col?.slug}
                    index={i}
                  />
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Mobile: state tabs + city stacks horizontal scroll ── */}
      <div className="md:hidden">
        <div className="flex items-center gap-4 mb-5">
          <span className="text-3xl font-bold text-gray-900 leading-none">
            {String(activeIdx + 1).padStart(2, '0')}
          </span>
          <div className="flex gap-3 overflow-x-auto no-scrollbar">
            {STATE_MAP.map((state, i) => (
              <button
                key={state.name}
                onClick={() => setActiveIdx(i)}
                className={`text-[10px] tracking-[0.12em] uppercase whitespace-nowrap py-1 border-b-2 transition-colors ${
                  i === activeIdx
                    ? 'text-gray-900 font-semibold border-gray-900'
                    : 'text-gray-300 border-transparent'
                }`}
              >
                {state.name}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={`m-${activeIdx}`}
            className="flex gap-5 overflow-x-auto no-scrollbar pb-4 px-1"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.4, ease: expo }}
          >
            {activeState.cities.map((cityName, i) => {
              const col = findCollection(cityName);
              const cityPhotos = col?.photos || [];
              return (
                <PhotoStack
                  key={cityName}
                  cityName={cityName}
                  photos={cityPhotos}
                  slug={col?.slug}
                  index={i}
                />
              );
            })}
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
