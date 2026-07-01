import { useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { startAtlas, type AtlasWaypoint } from '../../lib/atlas';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const expo = [0.16, 1, 0.3, 1] as const;

/**
 * HeroAtlas — the homepage opener as a living ROUTE MAP (no photograph):
 * contour terrain + a blueprint grid on the deep-olive base, with the
 * archive's real coordinates joined into a journey that draws itself in
 * (lib/atlas.ts). The editorial overlay (masthead wordmark, archive index,
 * serif statement, scroll cue) is unchanged from the cover era — the map
 * now literally illustrates "a record of light & place."
 */
export default function HeroAtlas({
  waypoints,
  collections,
  frames,
}: {
  waypoints: AtlasWaypoint[];
  collections: number;
  frames: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const mapY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '10%']);
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  useEffect(() => {
    if (!canvasRef.current) return;
    return startAtlas(canvasRef.current, waypoints);
  }, [waypoints]);

  return (
    <header ref={ref} className="relative h-[100svh] min-h-[620px] w-full overflow-hidden">
      {/* The atlas — full-bleed canvas, slow scroll parallax */}
      <motion.div className="absolute inset-0" style={{ y: mapY }}>
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 w-full h-full" />
      </motion.div>

      {/* Statement legibility scrim (the map lines are faint; keep it light) */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#282c20] via-transparent to-transparent" />

      {/* Editorial cover overlay */}
      <motion.div
        className="absolute inset-0 z-10 flex flex-col justify-between px-6 pt-28 pb-10 md:px-12 md:pb-14"
        style={{ opacity: overlayOpacity }}
      >
        {/* Top — masthead wordmark + archive index */}
        <motion.div
          className="flex items-start justify-between gap-4"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: expo, delay: 0.15 }}
        >
          <span className="font-serif uppercase tracking-[0.16em] text-base md:text-xl text-[#F4F4ED]">
            Journal&nbsp;Gallery
          </span>
          <span className="text-eyebrow text-right leading-[1.8] hidden sm:block">
            Visual&nbsp;Archive
            <br />
            Nº&nbsp;{String(collections).padStart(2, '0')} · {frames}&nbsp;frames
          </span>
        </motion.div>

        {/* Bottom — statement + scroll cue */}
        <div className="max-w-[60rem]">
          <motion.p
            className="text-eyebrow mb-5"
            style={{ color: ACCENT }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.8 }}
          >
            The Route · {waypoints.length} stops
          </motion.p>
          <h1 className="font-serif uppercase text-[#F4F4ED] leading-[0.86] tracking-tight" style={{ fontSize: 'clamp(44px, 8vw, 132px)' }}>
            <span className="block overflow-hidden">
              <motion.span className="block" initial={{ y: '112%' }} animate={{ y: '0%' }} transition={{ duration: 0.95, delay: 0.25, ease: expo }}>
                A record of
              </motion.span>
            </span>
            <span className="block overflow-hidden">
              <motion.span className="block" initial={{ y: '112%' }} animate={{ y: '0%' }} transition={{ duration: 0.95, delay: 0.38, ease: expo }}>
                light &amp; <span style={{ color: ACCENT }}>place.</span>
              </motion.span>
            </span>
          </h1>
          <motion.div
            className="mt-9 flex items-center gap-4 text-eyebrow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.95, duration: 0.8 }}
          >
            <span>Scroll to enter the archive</span>
            <span className="w-12 h-px" style={{ background: 'rgba(244,244,237,0.4)' }} />
          </motion.div>
        </div>
      </motion.div>
    </header>
  );
}
