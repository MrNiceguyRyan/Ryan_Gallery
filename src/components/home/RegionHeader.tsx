import { motion, useReducedMotion } from 'framer-motion';
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
  const reduce = useReducedMotion();
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
            <div className="flex items-center gap-3">
              {/* Strong, unmistakable cue to open when collapsed */}
              {collapsed && (
                <motion.span
                  className="hidden sm:inline font-mono text-[10px] tracking-[0.35em] uppercase"
                  style={{ color: ACCENT }}
                  animate={reduce ? { opacity: 1 } : { opacity: [0.45, 1, 0.45] }}
                  transition={reduce ? { duration: 0.3 } : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  Tap to expand
                </motion.span>
              )}
              <motion.span
                className="flex items-center justify-center w-11 h-11 rounded-full border transition-colors duration-300"
                style={{
                  borderColor: collapsed ? accentSoft(0.7) : 'rgba(255,255,255,0.15)',
                  color: collapsed ? ACCENT : 'rgba(255,255,255,0.55)',
                  boxShadow: collapsed ? `0 0 22px ${accentSoft(0.45)}` : 'none',
                }}
                animate={collapsed && !reduce ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                transition={collapsed && !reduce ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
              >
                <motion.span
                  animate={{ rotate: collapsed ? 0 : 180 }}
                  transition={{ duration: 0.4, ease: expo }}
                  className="flex"
                >
                  <ChevronDown size={18} />
                </motion.span>
              </motion.span>
            </div>
          )}
        </motion.div>
      </Tag>
    </section>
  );
}
