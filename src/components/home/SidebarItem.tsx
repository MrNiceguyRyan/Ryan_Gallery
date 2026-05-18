import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Collection } from '../../types';

interface SidebarItemProps {
  col: Collection;
  idx: number;
  isActive: boolean;
}

export default function SidebarItem({ col, idx, isActive }: SidebarItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Hover thumbnail — physical box is 112×160 px so w=200 already covers Retina
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
      className="flex flex-col items-start gap-0.5 text-left relative group py-3 h-[52px]"
    >
      <AnimatePresence>
        {isHovered && coverUrl && (
          <motion.div
            initial={{ opacity: 0, x: -10, rotate: -3, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, rotate: -3, scale: 0.9 }}
            className="absolute left-[-140px] top-[-20px] w-28 h-40 border border-white/20 z-50 overflow-hidden pointer-events-none shadow-[0_0_30px_rgba(255,255,255,0.05)]"
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

      <div className="flex items-center gap-3">
        <span
          className={`text-[8px] font-mono transition-all duration-500 ${
            isActive ? 'opacity-100 text-white translate-x-1' : 'opacity-20 group-hover:opacity-100'
          }`}
        >
          {String(idx + 1).padStart(2, '0')}
        </span>
        <motion.div
          className="h-px bg-white shadow-[0_0_5px_white]"
          initial={false}
          animate={{
            width: isActive ? 30 : isHovered ? 15 : 0,
            opacity: isActive || isHovered ? 1 : 0,
          }}
        />
      </div>
      <span
        className={`text-[10px] md:text-[11px] uppercase tracking-[0.35em] font-black transition-all duration-700 truncate w-full ${
          isActive
            ? 'opacity-100 text-white italic scale-[1.02]'
            : 'opacity-20 group-hover:opacity-100 group-hover:translate-x-1'
        }`}
      >
        {col.name}
      </span>
    </motion.button>
  );
}
