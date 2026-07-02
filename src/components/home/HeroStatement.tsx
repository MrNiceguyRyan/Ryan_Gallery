import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const expo = [0.16, 1, 0.3, 1] as const;

/**
 * HeroStatement — the homepage opener's editorial overlay. The background
 * behind it is the fixed long-exposure canvas (ExposureBackground): the
 * light-writing IS the hero image, so this component is pure typography —
 * masthead wordmark, archive index, the serif statement, a scroll cue.
 * The statement block keeps the lower-left; the gesture is authored to
 * thread the band above it (see lib/exposure.ts).
 */
export default function HeroStatement({
  collections,
  frames,
  places,
}: {
  collections: number;
  frames: number;
  places: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <header ref={ref} className="relative h-[100svh] min-h-[620px] w-full overflow-hidden">
      {/* Statement legibility scrim — the exposure is faint there by design;
           this only steadies the serif against the settled trail. */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#282c20] via-transparent to-transparent" />

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
            Visual Archive · {places} places
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
