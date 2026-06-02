import { motion } from 'framer-motion';

const expo = [0.16, 1, 0.3, 1] as const;
const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const accentSoft = (a: number) => `rgba(var(--accent-r), var(--accent-g), var(--accent-b), ${a})`;

/**
 * RegionHeader — an editorial section divider that opens a region's run of
 * city chapters on the homepage. A hairline rule + accent kicker + the region
 * name set as a "section opener", smaller than the city chapter titles below
 * it so the hierarchy reads region → place. Pure divider: not clickable, not
 * observed; the city chapters under it remain the units.
 */
export default function RegionHeader({
  region,
  placeCount,
  frameCount,
}: {
  region: string;
  placeCount: number;
  frameCount: number;
}) {
  return (
    <section className="relative pt-10 lg:pt-20 select-none" aria-label={`Region: ${region}`}>
      {/* Hairline rule wipes in (mount-triggered so it always renders) */}
      <motion.div
        className="h-px w-full origin-left"
        style={{ background: accentSoft(0.28) }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.1, ease: expo }}
      />

      <div className="flex items-end justify-between gap-6 pt-5 md:pt-7">
        <div className="overflow-hidden">
          <motion.div
            initial={{ y: '108%' }}
            animate={{ y: '0%' }}
            transition={{ duration: 0.95, ease: expo }}
          >
            <span
              className="flex items-center gap-2 font-mono text-[10px] tracking-[0.5em] uppercase mb-3 md:mb-4"
              style={{ color: accentSoft(0.85) }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
              Region
            </span>
            <h2
              className="font-serif italic tracking-tighter leading-[0.85] text-white"
              style={{ fontSize: 'clamp(40px, 7vw, 92px)' }}
            >
              {region}
            </h2>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="hidden md:block text-right pb-2 shrink-0 font-mono text-[11px] tracking-[0.25em] uppercase text-white/40 leading-relaxed"
        >
          {placeCount} places
          <br />
          {frameCount} frames
        </motion.div>
      </div>
    </section>
  );
}
