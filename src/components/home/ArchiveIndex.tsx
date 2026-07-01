import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import type { Collection } from '../../types';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

interface Props {
  /** In on-screen (region-grouped) order, so the Nº here matches the covers. */
  collections: Collection[];
  onOpen: (c: Collection) => void;
  totalFrames: number;
}

/**
 * ArchiveIndex — the archive's back matter: a ruled editorial "contents" of
 * every collection (Nº · name · place · year · frame count), each row a link
 * into its story. A magazine index closing the page instead of a bare
 * terminator. Real data only; calm hover (no flash). Reveals via native IO
 * (whileInView is unreliable here); static under reduced-motion.
 */
export default function ArchiveIndex({ collections, onOpen, totalFrames }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduce) { setShown(true); return; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }),
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  // Row/header rise-in. Returns {} under reduced-motion (rendered visible).
  const rise = (delay = 0): React.CSSProperties =>
    reduce
      ? {}
      : {
          transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
          opacity: shown ? 1 : 0,
          transform: shown ? 'none' : 'translateY(14px)',
        };

  if (!collections.length) return null;

  return (
    <section
      ref={ref}
      aria-label="Archive index"
      className="relative z-10 max-w-5xl mx-auto px-6 md:px-12 pt-10 md:pt-16 pb-2"
    >
      {/* Header rule */}
      <div
        className="flex items-baseline justify-between gap-6 pb-5 border-b"
        style={{ borderColor: 'rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.24)', ...rise(0) }}
      >
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
          <span className="text-eyebrow" style={{ color: 'rgba(244,244,237,0.5)' }}>Index — Full Contents</span>
        </div>
        <span className="font-ui text-[10px] tracking-[0.28em] uppercase text-white/35 tabular-nums">
          {collections.length} collections · {totalFrames} frames
        </span>
      </div>

      {/* Rows */}
      <ul>
        {collections.map((c, i) => {
          const frames = c.photoCount ?? c.photos?.length ?? 0;
          const place = c.location || c.region || 'United States';
          return (
            <li key={c._id}>
              <button
                onClick={() => onOpen(c)}
                data-cursor="View Story"
                aria-label={`View ${c.name.trim()}`}
                className="index-row group/idx relative w-full flex items-center gap-4 md:gap-6 py-4 md:py-5 text-left border-b border-white/[0.07] cursor-none"
                style={rise(Math.min(60 + i * 45, 460))}
              >
                {/* Accent tick — wipes down on hover */}
                <span
                  className="absolute left-0 top-0 bottom-0 w-[2px] origin-top scale-y-0 group-hover/idx:scale-y-100 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{ background: ACCENT }}
                />
                <span className="font-ui text-[10px] md:text-[11px] tracking-[0.2em] text-white/35 tabular-nums w-7 md:w-8 shrink-0 group-hover/idx:text-white/60 transition-colors duration-500">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  className="font-serif uppercase tracking-tight text-white/90 leading-[0.95] transition-colors duration-500 group-hover/idx:text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))]"
                  style={{ fontSize: 'clamp(22px, 3.4vw, 40px)' }}
                >
                  {c.name.trim()}
                </span>
                <span className="hidden sm:block flex-1 min-w-0 truncate font-ui text-[10px] tracking-[0.28em] uppercase text-white/30">
                  {place}{c.year ? ` · ${c.year}` : ''}
                </span>
                <span className="ml-auto sm:ml-0 flex items-center gap-3 md:gap-4 shrink-0">
                  <span className="font-ui text-[10px] md:text-[11px] tracking-[0.2em] text-white/45 tabular-nums">
                    {String(frames).padStart(2, '0')} frames
                  </span>
                  <span className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 text-white/40 -translate-x-1 group-hover/idx:translate-x-0 group-hover/idx:border-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] group-hover/idx:text-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] transition-all duration-500">
                    <ArrowUpRight size={13} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
