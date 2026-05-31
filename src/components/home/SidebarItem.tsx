import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection } from '../../types';

type RouteState = 'past' | 'active' | 'future';

interface SidebarItemProps {
  col: Collection;
  idx: number;
  /** Position on the route relative to the active chapter. */
  state: RouteState;
}

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

export default function SidebarItem({ col, idx, state }: SidebarItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isActive = state === 'active';

  // Hover thumbnail — physical box is 112×160 px so w=240 covers Retina
  const coverUrl = col.coverImageUrl
    ? `${col.coverImageUrl}?auto=format&w=240&q=60`
    : col.photos?.[0]?.imageUrl
      ? `${col.photos[0].imageUrl}?auto=format&w=240&q=60`
      : '';

  return (
    <motion.button
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        const el = document.getElementById(`archive-item-${col._id}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }}
      whileTap={{ scale: 0.96, x: 2 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="relative h-[52px] pl-7 flex flex-col justify-center items-start gap-1 text-left group"
    >
      {/* Hover thumbnail */}
      <AnimatePresence>
        {isHovered && coverUrl && (
          <motion.div
            initial={{ opacity: 0, x: -10, rotate: -3, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, rotate: -3, scale: 0.9 }}
            className="absolute left-[-150px] top-[-54px] w-28 h-40 border border-white/20 z-50 overflow-hidden pointer-events-none shadow-[0_0_30px_rgba(255,255,255,0.06)]"
          >
            <img
              src={coverUrl}
              alt={col.name}
              className="w-full h-full object-cover grayscale brightness-125"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            <div className="absolute inset-0 bg-white/5 mix-blend-overlay" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waypoint node on the route rail (rail sits at left-[4px]) */}
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[9px] h-[9px] flex items-center justify-center">
        {isActive && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ border: `1px solid ${ACCENT}` }}
            animate={{ scale: [1, 2.6], opacity: [0.55, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span
          className="rounded-full"
          style={{
            width: isActive ? 9 : 7,
            height: isActive ? 9 : 7,
            background: state === 'future' ? '#0A0A0A' : ACCENT,
            border: state === 'future' ? '1px solid rgba(255,255,255,0.25)' : `1px solid ${ACCENT}`,
            opacity: state === 'past' ? 0.65 : 1,
            boxShadow: isActive ? `0 0 10px ${ACCENT}` : 'none',
            transition: 'all 0.4s ease',
          }}
        />
      </span>

      {/* Index */}
      <span
        className={`text-[8px] font-mono leading-none transition-all duration-500 ${
          isActive ? 'opacity-100 text-white' : 'opacity-25 group-hover:opacity-100'
        }`}
      >
        {String(idx + 1).padStart(2, '0')}
      </span>

      {/* Name */}
      <span
        className={`text-[10px] md:text-[11px] uppercase tracking-[0.32em] font-black leading-none transition-all duration-700 truncate w-full ${
          isActive
            ? 'opacity-100 text-white italic'
            : 'opacity-25 group-hover:opacity-100 group-hover:translate-x-0.5'
        }`}
      >
        {col.name}
      </span>
    </motion.button>
  );
}
