import { useRef, useMemo } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import type { Collection } from '../../types';

/**
 * JourneyIntro — a cinematic, scroll-driven opening sequence that plays
 * between the hero title and the archive. Full-bleed REAL archive photos
 * (Ken-Burns + parallax) carry large kinetic narrative beats — the journey
 * across the country — then hand off into "Selected Works". Page-level only;
 * uses the same collections the homepage already has.
 */

const expo = [0.16, 1, 0.3, 1] as const;

// Narrative beats. Each binds to a real collection by keyword so the imagery
// matches the place; falls back to the next unused collection.
const BEATS = [
  {
    match: ['new york', 'york', 'manhattan', 'nyc'],
    kicker: 'Chapter I · The City',
    line: 'It opens in a city that never holds still.',
  },
  {
    match: ['zion', 'page', 'bryce', 'arizona', 'antelope', 'canyon', 'utah'],
    kicker: 'Chapter II · The West',
    line: 'Then west, where the rock keeps time.',
  },
  {
    match: ['miami', 'orlando', 'florida', 'beach'],
    kicker: 'Chapter III · The South',
    line: 'And south, into the relentless light.',
  },
];

function pickCollection(
  collections: Collection[],
  matches: string[],
  used: Set<string>,
): Collection | undefined {
  for (const c of collections) {
    const key = c.slug || c._id;
    if (used.has(key)) continue;
    const hay = `${c.name} ${c.location || ''}`.toLowerCase();
    if (matches.some((m) => hay.includes(m))) return c;
  }
  return collections.find((c) => !used.has(c.slug || c._id)) || collections[0];
}

function srcSetFor(base: string) {
  return [900, 1600, 2200].map((w) => `${base}?auto=format&w=${w}&q=80 ${w}w`).join(', ');
}

function Panel({
  collection,
  kicker,
  line,
}: {
  collection: Collection;
  kicker: string;
  line: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const imgY = useTransform(scrollYProgress, [0, 1], ['-12%', '14%']);
  const imgScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.18, 1.06, 1.0]);
  const textY = useTransform(scrollYProgress, [0, 1], [90, -90]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.22, 0.6, 0.85], [0, 1, 1, 0]);

  const base = collection.coverImageUrl || collection.photos?.[0]?.imageUrl || '';

  return (
    <section ref={ref} className="relative h-[92vh] overflow-hidden">
      <motion.div className="absolute inset-0" style={{ y: imgY, scale: imgScale }}>
        {base && (
          <img
            src={`${base}?auto=format&w=1800&q=82`}
            srcSet={srcSetFor(base)}
            sizes="100vw"
            alt={collection.name}
            className="absolute inset-0 w-full h-[125%] object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        )}
      </motion.div>
      {/* Darkening for legibility */}
      <div className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-[#0A0A0A]/70" />

      <motion.div
        style={{ y: textY, opacity: textOpacity }}
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
      >
        <span className="font-mono text-[10px] md:text-xs tracking-[0.5em] uppercase text-white/55 mb-6">
          {kicker}
        </span>
        <h2 className="font-serif italic text-[#FDFDFB] leading-[0.95] tracking-tight text-5xl md:text-7xl lg:text-[7rem] max-w-5xl drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
          {line}
        </h2>
        <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-white/50 mt-8">
          {collection.location || collection.name}
          {collection.year ? ` · ${collection.year}` : ''}
        </span>
      </motion.div>
    </section>
  );
}

export default function JourneyIntro({ collections }: { collections: Collection[] }) {
  const beats = useMemo(() => {
    const used = new Set<string>();
    return BEATS.map((b) => {
      const c = pickCollection(collections, b.match, used);
      if (c) used.add(c.slug || c._id);
      return { ...b, collection: c };
    }).filter((b): b is typeof b & { collection: Collection } => !!b.collection);
  }, [collections]);

  const opener = useRef<HTMLDivElement>(null);
  const { scrollYProgress: openerProg } = useScroll({ target: opener, offset: ['start start', 'end start'] });
  const openerOpacity = useTransform(openerProg, [0, 0.8], [1, 0]);
  const openerY = useTransform(openerProg, [0, 1], [0, -60]);

  if (beats.length === 0) return null;

  return (
    <div className="relative z-10">
      {/* Opening manifesto — the thesis of the journey */}
      <section ref={opener} className="relative h-[80vh] flex items-center justify-center px-6">
        <motion.div style={{ opacity: openerOpacity, y: openerY }} className="max-w-5xl text-center">
          <span className="block font-mono text-[10px] md:text-xs tracking-[0.55em] uppercase text-white/40 mb-8">
            A photographic journey · {beats.length >= 3 ? 'across the United States' : ''}
          </span>
          <h2 className="font-serif italic text-[#FDFDFB] leading-[1.02] tracking-tight text-4xl md:text-6xl lg:text-7xl">
            For one year, I followed the light&nbsp;
            <span className="opacity-50">across the country.</span>
          </h2>
        </motion.div>
      </section>

      {beats.map((b, i) => (
        <Panel key={i} collection={b.collection} kicker={b.kicker} line={b.line} />
      ))}

      {/* Hand-off into the archive */}
      <section className="relative h-[60vh] flex flex-col items-center justify-center text-center px-6">
        <span className="font-mono text-[10px] tracking-[0.55em] uppercase text-white/40 mb-6">
          // the archive
        </span>
        <h2 className="font-serif italic text-[#FDFDFB] text-4xl md:text-6xl tracking-tight">
          {collections.length} places. One year of looking.
        </h2>
        <motion.div
          className="w-px h-12 bg-white/25 origin-top mt-12"
          animate={{ scaleY: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </section>
    </div>
  );
}
