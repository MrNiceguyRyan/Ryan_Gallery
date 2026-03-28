import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion';
import type { Collection, Photo } from '../../types';
import OpeningAnimation from './OpeningAnimation';

const expo = [0.16, 1, 0.3, 1] as const;

interface Props {
  collections: Collection[];
  photos: Photo[];
}

const HERO_IMAGE =
  'https://cdn.sanity.io/images/z610fooo/production/b3ff88abc00f4b64e60a031bdfd701ca34ceb618-4096x2730.jpg';

/** Extract width × height from a Sanity CDN image URL */
function parseDimensions(url: string) {
  const m = url.match(/-(\d+)x(\d+)\./);
  return m ? { w: +m[1], h: +m[2] } : { w: 4, h: 3 };
}

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
 *  CollectionSection — gregorylalle-inspired layout
 *  LEFT photos | CENTER nav list | RIGHT photos
 * ═══════════════════════════════════════════════════════ */
function CollectionSection({
  collection,
  allCollections,
  index,
}: {
  collection: Collection;
  allCollections: Collection[];
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const photos = collection.photos || [];
  const leftPhotos = photos.slice(0, 2);
  const rightPhotos = photos.slice(2, 7);

  // Heights create visual rhythm (tall anchor on right position 1)
  const leftH = [120, 175];
  const rightH = [120, 265, 140, 140, 140];

  return (
    <motion.section
      ref={ref}
      id={`work-${collection.slug}`}
      className="py-10 md:py-16 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : {}}
      transition={{ duration: 0.8, ease: expo }}
    >
      {/* ── Desktop: 3-zone layout ── */}
      <div className="hidden md:flex items-start">
        {/* LEFT photos */}
        <div className="flex flex-col gap-2 shrink-0 pl-3">
          {leftPhotos.map((photo, i) => {
            const { w, h } = parseDimensions(photo.imageUrl);
            return (
              <a
                key={photo._id}
                href={`/works/${collection.slug}#photo-${photo._id}`}
                className="block overflow-hidden group"
                style={{
                  height: `${leftH[i]}px`,
                  aspectRatio: `${w} / ${h}`,
                }}
              >
                <img
                  src={`${photo.imageUrl}?auto=format&w=400&q=80`}
                  alt={photo.title || collection.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  draggable={false}
                />
              </a>
            );
          })}
        </div>

        {/* CENTER: collection navigation list */}
        <div className="flex-1 flex justify-center items-start pt-6 min-w-[180px]">
          <nav className="flex flex-col gap-1">
            {allCollections.map((c) => {
              const isActive = c._id === collection._id;
              return (
                <button
                  key={c._id}
                  onClick={() => {
                    document
                      .getElementById(`work-${c.slug}`)
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className={`text-left text-[11px] tracking-[0.12em] uppercase transition-colors duration-300 flex items-center gap-2 py-0.5 ${
                    isActive
                      ? 'text-gray-900 font-semibold'
                      : 'text-gray-300 hover:text-gray-600'
                  }`}
                >
                  {c.name}
                  {isActive && <span className="text-[10px]">&#9668;</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* RIGHT photos */}
        <div className="flex gap-2 items-start shrink-0">
          {rightPhotos.map((photo, i) => {
            const { w, h } = parseDimensions(photo.imageUrl);
            return (
              <a
                key={photo._id}
                href={`/works/${collection.slug}#photo-${photo._id}`}
                className="block overflow-hidden shrink-0 group"
                style={{
                  height: `${rightH[i]}px`,
                  aspectRatio: `${w} / ${h}`,
                }}
              >
                <img
                  src={`${photo.imageUrl}?auto=format&w=500&q=80`}
                  alt={photo.title || collection.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  draggable={false}
                />
              </a>
            );
          })}
        </div>
      </div>

      {/* ── Mobile: compact grid ── */}
      <div className="md:hidden px-4">
        <a
          href={`/works/${collection.slug}`}
          className="group inline-flex items-center gap-2 mb-3"
        >
          <h3 className="font-serif italic text-xl text-gray-900 group-hover:text-gray-500 transition-colors">
            {collection.name}
          </h3>
          <span className="text-[10px] text-gray-300 tracking-wider uppercase font-mono">
            {collection.photoCount || photos.length}
          </span>
        </a>
        <div className="grid grid-cols-3 gap-1">
          {photos.slice(0, 6).map((photo) => (
            <a
              key={photo._id}
              href={`/works/${collection.slug}#photo-${photo._id}`}
              className="block aspect-square overflow-hidden"
            >
              <img
                src={`${photo.imageUrl}?auto=format&w=250&q=75`}
                alt={photo.title || collection.name}
                className="w-full h-full object-cover"
                draggable={false}
              />
            </a>
          ))}
        </div>
      </div>

      {/* Section number */}
      <div className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mt-4 md:mt-6 pl-4 md:pl-3 tracking-tight leading-none">
        {String(index + 1).padStart(2, '0')}
      </div>
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════════════
 *  HomePage — Editorial portfolio
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
  const heroImgScale = useTransform(heroProgress, [0, 1], [1, 1.12]);
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
        {/* ═══════════════════ HERO ═══════════════════ */}
        <section
          ref={heroRef}
          className="relative h-screen overflow-hidden bg-[#0a0a0a]"
        >
          <motion.div
            className="absolute inset-0"
            style={{ y: smoothImgY, scale: heroImgScale }}
          >
            <img
              src={`${HERO_IMAGE}?auto=format&w=2000&q=80`}
              alt=""
              className="w-full h-full object-cover opacity-40"
              style={{ objectPosition: 'center 40%' }}
              draggable={false}
            />
          </motion.div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/30 to-[#0a0a0a]/60" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/40 via-transparent to-transparent" />
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            }}
          />

          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10"
            style={{ y: smoothTextY, opacity: heroOpacity }}
          >
            <motion.h1
              className="font-serif italic text-[8.5vw] md:text-[6vw] lg:text-[5vw] leading-none text-white tracking-[-0.02em] text-center whitespace-nowrap"
              initial={{ opacity: 0, y: 100, filter: 'blur(20px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1.8, delay: 0.2, ease: expo }}
            >
              Discover the World
            </motion.h1>
            <motion.div
              className="flex items-center gap-6 mt-8"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.7, ease: expo }}
            >
              <span className="w-12 h-px bg-white/20" />
              <span className="text-[10px] md:text-[11px] tracking-[0.6em] text-white/50 uppercase font-light">
                Ryan&apos;s Gallery
              </span>
              <span className="w-12 h-px bg-white/20" />
            </motion.div>
          </motion.div>

          <motion.div
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8, duration: 0.8 }}
          >
            <span className="text-[7px] tracking-[0.5em] text-white/25 uppercase">
              Scroll
            </span>
            <motion.div
              className="w-px h-8 bg-white/20 origin-top"
              animate={{ scaleY: [0, 1, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </motion.div>
        </section>

        {/* ═══════════════════ MARQUEE ═══════════════════ */}
        <div className="py-5 border-y border-gray-100 bg-white overflow-hidden">
          <div className="animate-marquee flex whitespace-nowrap">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center shrink-0">
                {[...marqueeItems, ...marqueeItems].map((item, j) => (
                  <span
                    key={`${copy}-${j}`}
                    className="flex items-center shrink-0 mx-5 md:mx-8"
                  >
                    <span className="text-sm md:text-base font-serif italic text-gray-800 tracking-wide">
                      {item}
                    </span>
                    <span className="text-gray-200/60 text-[10px] ml-5 md:ml-8">
                      &#10022;
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════════ WORKS — gregorylalle style ═══════════════════ */}
        <section className="bg-white pt-12 md:pt-20 pb-8">
          {collections.map((collection, i) => (
            <CollectionSection
              key={collection._id}
              collection={collection}
              allCollections={collections}
              index={i}
            />
          ))}
        </section>

        {/* ═══════════════════ STATEMENT ═══════════════════ */}
        <section className="py-36 md:py-52 bg-[#0a0a0a] relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="px-6 md:px-16 max-w-4xl mx-auto text-center relative z-10">
            <motion.blockquote
              className="text-3xl md:text-5xl lg:text-6xl font-serif italic text-white/85 leading-[1.15] tracking-[-0.01em]"
              initial={{ opacity: 0, y: 60 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 1.4, ease: expo }}
            >
              Every frame is a dialogue between light and intention.
            </motion.blockquote>
            <motion.div
              className="mt-12 flex items-center justify-center gap-5"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.5 }}
            >
              <span className="w-8 h-px bg-white/15" />
              <span className="text-[9px] tracking-[0.4em] text-white/25 uppercase font-serif italic">
                Ryan Xu
              </span>
              <span className="w-8 h-px bg-white/15" />
            </motion.div>
          </div>
        </section>

        {/* ═══════════════════ STATS ═══════════════════ */}
        <section className="py-32 md:py-44 px-6 md:px-16 bg-white">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-center gap-20 md:gap-32">
            {[
              { value: photos.length, label: 'Photographs' },
              { value: collections.length, label: 'Collections' },
              {
                value: new Date().getFullYear(),
                label: 'Year',
                isYear: true,
              },
            ].map((stat, i) => (
              <motion.div
                key={i}
                className="text-center"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.8,
                  delay: i * 0.15,
                  ease: expo,
                }}
              >
                <div className="text-7xl md:text-[6rem] font-serif italic text-gray-900 leading-none tracking-tight">
                  {stat.isYear ? (
                    stat.value
                  ) : (
                    <AnimatedCounter target={stat.value} />
                  )}
                </div>
                <p className="text-[9px] tracking-[0.5em] text-gray-400 uppercase mt-5 font-light">
                  {stat.label}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══════════════════ CTA ═══════════════════ */}
        <section className="py-16 md:py-24 px-6 md:px-16 text-center border-t border-gray-50">
          <motion.a
            href="/travel"
            className="inline-flex items-center gap-5 group"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <span className="font-serif italic text-3xl md:text-4xl text-gray-900 group-hover:text-gray-500 transition-colors duration-500">
              Explore the Journey
            </span>
            <svg
              className="w-6 h-6 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-2 transition-all duration-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75"
              />
            </svg>
          </motion.a>
        </section>

        {/* ═══════════════════ FOOTER ═══════════════════ */}
        <footer className="py-20 px-6 md:px-16 max-w-7xl mx-auto border-t border-gray-100">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-serif italic text-gray-900 tracking-tight">
                Ryan Xu.
              </h2>
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
        </footer>
      </div>
    </>
  );
}
