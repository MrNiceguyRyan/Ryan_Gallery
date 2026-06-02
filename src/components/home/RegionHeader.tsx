import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const expo = [0.16, 1, 0.3, 1] as const;
const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const accentSoft = (a: number) => `rgba(var(--accent-r), var(--accent-g), var(--accent-b), ${a})`;

/**
 * RegionHeader — an editorial section divider that opens a region's run of
 * city chapters. Hairline rule + accent kicker + region name as a "section
 * opener", smaller than the city chapter titles below so the hierarchy reads
 * region → place. Reveal is mount-triggered (always renders). When
 * `collapsible`, the whole header is a toggle that stows/opens the region's
 * chapters; a chevron rotates to reflect the collapsed state.
 */
export default function RegionHeader({
  region,
  placeCount,
  frameCount,
  collapsible = false,
  collapsed = false,
  onToggle,
}: {
  region: string;
  placeCount: number;
  frameCount: number;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const Tag = collapsible ? 'button' : 'div';
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

      <Tag
        onClick={collapsible ? onToggle : undefined}
        data-cursor={collapsible ? (collapsed ? 'Expand' : 'Collapse') : undefined}
        aria-expanded={collapsible ? !collapsed : undefined}
        className={`group/region flex w-full items-end justify-between gap-6 pt-5 md:pt-7 text-left ${
          collapsible ? 'cursor-none' : ''
        }`}
      >
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
              className={`font-serif italic tracking-tighter leading-[0.85] text-white transition-opacity duration-300 ${
                collapsible ? 'group-hover/region:opacity-80' : ''
              }`}
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
          className="flex items-center gap-4 pb-2 shrink-0"
        >
          <div className="hidden md:block text-right font-mono text-[11px] tracking-[0.25em] uppercase text-white/40 leading-relaxed">
            {placeCount} places
            <br />
            {frameCount} frames
          </div>
          {collapsible && (
            <span
              className="flex items-center justify-center w-9 h-9 rounded-full border border-white/15 text-white/55 transition-colors duration-300 group-hover/region:text-white group-hover/region:border-white/40"
              style={collapsed ? undefined : { borderColor: accentSoft(0.4), color: ACCENT }}
            >
              <motion.span
                animate={{ rotate: collapsed ? 0 : 180 }}
                transition={{ duration: 0.4, ease: expo }}
                className="flex"
              >
                <ChevronDown size={16} />
              </motion.span>
            </span>
          )}
        </motion.div>
      </Tag>
    </section>
  );
}
