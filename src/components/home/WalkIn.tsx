import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import MiniHome from './MiniHome';

/**
 * WalkIn — the site's OPENING: a little screen-shaped FRAME holding a
 * miniature of the site itself, punched through a wall of monumental type.
 *
 * CRISP-ZOOM technique: the mini is rendered at FULL viewport size and the
 * frame is scaled DOWN (0.3 → 1.0) — we only ever downscale a full-resolution,
 * GPU-composited layer, so it stays sharp (no upscale blur) and buttery. The
 * frame is viewport-shaped (a shrunk screen), not an arbitrary portrait card.
 *
 * Inside: MiniHome — a photo-free scale model of the homepage (real data, the
 * site's own type/layout; NO images). Outside: the bold "VISUAL ARCHIVE" type
 * wall. Scroll = walking in (pin + scrub, CSS sticky; Lenis is the only scroll
 * authority); everything after is the real archive.
 */
export default function WalkIn({
  collections,
  places,
  frames,
}: {
  collections: { name: string; frames: number }[];
  places: number;
  frames: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  // DOWNSCALE → 1.0 (never above): crisp + cheap.
  const scale = useTransform(scrollYProgress, [0, 0.82], [0.3, 1], { clamp: true });
  const radius = useTransform(scrollYProgress, [0, 0.55], [60, 0]);
  const frameOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);
  const wallOpacity = useTransform(scrollYProgress, [0.02, 0.22], [1, 0]);
  const wallScale = useTransform(scrollYProgress, [0, 0.22], [1, 1.08]);

  if (!collections.length) return null;

  if (reduce) {
    return (
      <section className="relative h-[92vh] overflow-hidden flex items-center justify-center">
        <h1
          className="absolute inset-x-0 text-center font-serif uppercase text-[#F4F4ED] whitespace-nowrap tracking-[-0.02em] leading-none pointer-events-none"
          style={{ fontSize: 'clamp(56px, 15vw, 220px)' }}
        >
          Visual&nbsp;Archive
        </h1>
        <div className="relative z-10 w-[54vw] aspect-[16/10] overflow-hidden rounded-xl ring-1 ring-white/20">
          <MiniHome collections={collections} frames={frames} />
        </div>
        <p className="absolute bottom-[8vh] inset-x-0 text-center text-eyebrow" style={{ color: 'rgba(244,244,237,0.6)' }}>
          A record of light &amp; place — {places} places · {frames} frames
        </p>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative" style={{ height: '240vh' }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden flex items-center justify-center">
        {/* ── The bold OUTSIDE — type wall + chrome, dissolves on scroll ── */}
        <motion.div className="absolute inset-0 z-0 pointer-events-none" style={{ opacity: wallOpacity }}>
          <div className="absolute top-[16vh] md:top-[18vh] inset-x-0 text-center">
            <p className="text-eyebrow" style={{ color: 'rgba(244,244,237,0.55)' }}>
              A Photographic Journal · Est. New York
            </p>
          </div>
          <motion.h1
            className="absolute inset-0 flex items-center justify-center font-serif uppercase text-[#F4F4ED] whitespace-nowrap tracking-[-0.02em] leading-none"
            style={{ fontSize: 'clamp(56px, 15vw, 220px)', scale: wallScale }}
          >
            Visual&nbsp;Archive
          </motion.h1>
          <div className="absolute bottom-[7vh] inset-x-0 flex flex-col items-center gap-5 text-center px-6">
            <p className="text-eyebrow" style={{ color: 'rgba(244,244,237,0.55)' }}>
              A record of light &amp; place&nbsp;&nbsp;·&nbsp;&nbsp;{places} places · {frames} frames
            </p>
            <div className="flex flex-col items-center gap-2">
              <span className="text-eyebrow">Scroll to step inside</span>
              <span className="w-px h-8" style={{ background: 'rgba(244,244,237,0.35)' }} />
            </div>
          </div>
        </motion.div>

        {/* ── The frame — full-viewport mini, scaled DOWN then up to 1.0 ── */}
        <motion.div
          className="absolute inset-0 z-10 overflow-hidden will-change-transform"
          style={{ scale, borderRadius: radius, transformOrigin: 'center center' }}
        >
          <MiniHome collections={collections} frames={frames} />
          {/* Frame edge — visible while it's a small card, fades as it fills */}
          <motion.div
            className="absolute inset-0 pointer-events-none border-[3px] border-white/25"
            style={{ opacity: frameOpacity, borderRadius: radius }}
          />
        </motion.div>
      </div>
    </section>
  );
}
