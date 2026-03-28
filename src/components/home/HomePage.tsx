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

/** Extract width x height from a Sanity CDN image URL */
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
 *  CollectionRow — one city = one horizontal photo strip
 *  Photos sized by their real aspect ratios, fixed height
 * ═══════════════════════════════════════════════════════ */
function CollectionRow({
  collection,
  index,
}: {
  collection: Collection;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const photos = collection.photos || [];

  return (
    <motion.div
      ref={ref}
      className="mb-12 md:mb-16"
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.8,
        delay: Math.min(index * 0.1, 0.3),
        ease: expo,
      }}
    >
      {/* City label + meta */}
      <a
        href={`/works/${collection.slug}`}
        className="group inline-flex items-center gap-3 md:gap-4 mb-3 md:mb-4"
      >
        <h3 className="font-serif italic text-xl md:text-2xl text-white/90 group-hover:text-white transition-colors duration-500">
          {collection.name}
        </h3>
        {collection.location && (
          <span className="text-[9px] text-white/20 tracking-[0.15em] uppercase hidden md:inline">
            {collection.location}
          </span>
        )}
        <span className="text-[9px] text-white/15 tracking-[0.12em] uppercase font-mono">
          {collection.photoCount || photos.length}
        </span>
        <svg
          className="w-3.5 h-3.5 text-white/15 group-hover:text-white/50 group-hover:translate-x-1 transition-all duration-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75"
          />
        </svg>
      </a>

      {/* Photo strip — horizontal, natural aspect ratios */}
      <div className="flex gap-1.5 md:gap-2 overflow-x-auto no-scrollbar pb-1">
        {photos.map((photo) => {
          const { w, h } = parseDimensions(photo.imageUrl);
          return (
            <a
              key={photo._id}
              href={`/works/${collection.slug}`}
              className="shrink-0 h-[160px] md:h-[220px] lg:h-[260px] overflow-hidden group"
              style={{ aspectRatio: `${w} / ${h}` }}
            >
              <img
                src={`${photo.imageUrl}?auto=format&w=500&q=80`}
                alt={photo.title || collection.name}
                className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
                draggable={false}
              />
            </a>
          );
        })}
      </div>
    </motion.div>
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

  /* ── Marquee content ── */
  const marqueeItems = [
    'Photographer',
    'Visual Storyteller',
    'Travel',
    'Street',
    'Landscape',
    'Architecture',
    'Portrait',
  ];
  const collectionNames = collections.map((c) => c.name);

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
          {/* Background photo with parallax */}
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

          {/* Gradient layers */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/30 to-[#0a0a0a]/60" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/40 via-transparent to-transparent" />

          {/* Grain */}
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            }}
          />

          {/* Hero text */}
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

          {/* Scroll indicator */}
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

        {/* ═══════════════════ MARQUEE STRIP ═══════════════════ */}
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

        {/* ═══════════════════ WORKS — row per city ═══════════════════ */}
        <section className="py-16 md:py-24 px-4 md:px-10 lg:px-16 bg-[#0a0a0a]">
          {/* Section label */}
          <motion.div
            className="flex items-center gap-6 mb-10 md:mb-14 max-w-7xl mx-auto"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: expo }}
          >
            <span className="w-12 h-px bg-white/20" />
            <span className="text-[10px] tracking-[0.5em] text-white/30 uppercase">
              Selected Works
            </span>
          </motion.div>

          {/* Collection rows */}
          <div className="max-w-7xl mx-auto">
            {collections.map((collection, i) => (
              <CollectionRow
                key={collection._id}
                collection={collection}
                index={i}
              />
            ))}
          </div>
        </section>

        {/* ═══════════════════ STATEMENT ═══════════════════ */}
        <section className="py-36 md:py-52 bg-[#0a0a0a] relative overflow-hidden border-t border-white/5">
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

        {/* ═══════════════════ MARQUEE STRIP 2 ═══════════════════ */}
        <div className="py-5 border-y border-gray-100 bg-white overflow-hidden">
          <div className="animate-marquee-reverse flex whitespace-nowrap">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center shrink-0">
                {Array(5)
                  .fill(collectionNames)
                  .flat()
                  .map((name, j) => (
                    <span
                      key={`${copy}-${j}`}
                      className="flex items-center shrink-0 mx-6 md:mx-10"
                    >
                      <span className="text-base md:text-xl font-serif italic text-gray-800">
                        {name}
                      </span>
                      <span className="text-gray-200 ml-6 md:ml-10">
                        &middot;
                      </span>
                    </span>
                  ))}
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════════ STATS ═══════════════════ */}
        <section className="py-32 md:py-44 px-6 md:px-16">
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
