import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import type { Photo } from '../types';
import { useHoverCapable } from '../lib/useHoverCapable';

const expo = [0.16, 1, 0.3, 1] as const;

interface Cluster {
  city: string;
  country: string;
  lat: number;
  lng: number;
  photos: Photo[];
}

function clusterByLocation(photos: Photo[]): Cluster[] {
  const groups: Record<string, Cluster> = {};
  for (const p of photos) {
    if (p.location?.lat == null || p.location?.lng == null) continue;
    const key = `${p.location.city || ''}|${p.location.country || ''}`;
    if (!groups[key]) {
      groups[key] = {
        city: p.location.city || 'Unknown',
        country: p.location.country || '',
        lat: p.location.lat,
        lng: p.location.lng,
        photos: [],
      };
    }
    groups[key].photos.push(p);
  }
  return Object.values(groups).sort((a, b) => b.photos.length - a.photos.length);
}

const fmt = (v: number, pos: string, neg: string) =>
  `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;

/**
 * AtlasIndex — an interactive coordinate index that sits below the map.
 * Hovering a location dims the rest and floats a photo preview that follows
 * the cursor; clicking flies the (already-mounted) map to that city via the
 * #loc= hash and scrolls up to it. Page-level UI only — the map component
 * is untouched.
 */
export default function AtlasIndex({ photos }: { photos: Photo[] }) {
  const list = useMemo(() => clusterByLocation(photos), [photos]);
  const canHover = useHoverCapable();
  const [active, setActive] = useState<number | null>(null);

  // Cursor-following preview position (desktop only).
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 350, damping: 30, mass: 0.5 });
  const sy = useSpring(my, { stiffness: 350, damping: 30, mass: 0.5 });

  const onMove = (e: React.MouseEvent) => {
    mx.set(e.clientX);
    my.set(e.clientY);
  };

  const go = (c: Cluster) => {
    // Setting the hash triggers the map's reactive #loc= handler (flyTo).
    window.location.hash = `#loc=${c.lat},${c.lng},9`;
    const el = document.getElementById('atlas-map');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (list.length === 0) return null;

  return (
    <div className="relative" onMouseMove={canHover ? onMove : undefined}>
      {/* Section label */}
      <div className="flex items-end justify-between mb-6 md:mb-8 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-white/50" />
          <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-white/45">
            Coordinate Index
          </span>
        </div>
        <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-white/25">
          {list.length} locations · select to locate
        </span>
      </div>

      {/* Rows */}
      <div className="flex flex-col">
        {list.map((c, i) => {
          const dim = active !== null && active !== i;
          return (
            <motion.button
              key={`${c.city}-${c.country}-${i}`}
              type="button"
              onClick={() => go(c)}
              onMouseEnter={() => canHover && setActive(i)}
              onMouseLeave={() => canHover && setActive(null)}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-8%' }}
              transition={{ duration: 0.7, delay: Math.min(i * 0.05, 0.4), ease: expo }}
              whileTap={{ scale: 0.995 }}
              className="group relative w-full text-left border-b border-white/10 py-5 md:py-7 grid grid-cols-[2rem_1fr_auto] md:grid-cols-[3rem_1fr_auto_auto] items-center gap-4 md:gap-8"
              style={{
                opacity: dim ? 0.32 : 1,
                transition: 'opacity 0.4s ease, padding-left 0.5s cubic-bezier(0.16,1,0.3,1)',
                paddingLeft: active === i ? '1rem' : '0rem',
              }}
            >
              {/* Index number */}
              <span className="font-mono text-[10px] md:text-xs text-white/30 tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* City + country */}
              <span className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-4 min-w-0">
                <span className="text-2xl md:text-4xl lg:text-5xl font-serif italic tracking-tight text-[#FDFDFB] leading-none truncate">
                  {c.city}
                </span>
                <span className="font-mono text-[9px] md:text-[10px] tracking-[0.3em] uppercase text-white/35 shrink-0">
                  {c.country}
                </span>
              </span>

              {/* Coordinates (desktop) */}
              <span className="hidden md:block font-mono text-[10px] tracking-[0.15em] text-white/35 tabular-nums text-right leading-relaxed">
                {fmt(c.lat, 'N', 'S')}
                <br />
                {fmt(c.lng, 'E', 'W')}
              </span>

              {/* Frame count + locate cue */}
              <span className="flex items-center justify-end gap-3 md:gap-5">
                <span className="font-mono text-[9px] md:text-[10px] tracking-[0.25em] uppercase text-white/40 whitespace-nowrap tabular-nums">
                  {String(c.photos.length).padStart(2, '0')} fr
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[8px] md:text-[9px] tracking-[0.3em] uppercase text-white/25 group-hover:text-white/70 transition-colors duration-300">
                  <span className="hidden sm:inline">Locate</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="transition-transform duration-300 group-hover:translate-x-0.5">
                    <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
              </span>

              {/* Accent underline that draws on hover */}
              <span
                className="pointer-events-none absolute left-0 bottom-0 h-px bg-white/60"
                style={{
                  width: active === i ? '100%' : '0%',
                  transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)',
                }}
              />
            </motion.button>
          );
        })}
      </div>

      {/* Cursor-following photo preview (desktop / hover devices only) */}
      {canHover && (
        <motion.div
          className="fixed top-0 left-0 z-[60] pointer-events-none"
          style={{ x: sx, y: sy }}
        >
          <AnimatePresence mode="wait">
            {active !== null && list[active]?.photos[0] && (
              <motion.div
                key={active}
                initial={{ opacity: 0, scale: 0.85, rotate: -6 }}
                animate={{ opacity: 1, scale: 1, rotate: -4 }}
                exit={{ opacity: 0, scale: 0.9, rotate: -2 }}
                transition={{ duration: 0.4, ease: expo }}
                className="absolute"
                style={{ transform: 'translate(2.5rem, -50%)' }}
              >
                <div className="relative w-[220px] h-[290px] lg:w-[260px] lg:h-[340px] overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] border border-white/15">
                  <img
                    src={`${list[active].photos[0].imageUrl}?auto=format&w=520&q=72`}
                    alt={list[active].city}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                  {/* Coordinate stamp */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="font-serif italic text-lg text-white leading-none">{list[active].city}</p>
                    <p className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/60 mt-1.5 tabular-nums">
                      {fmt(list[active].lat, 'N', 'S')} · {fmt(list[active].lng, 'E', 'W')}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
