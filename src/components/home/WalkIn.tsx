import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

/**
 * WalkIn — the site's OPENING: one precise little photo-FRAME punched through
 * a wall of monumental type.
 *
 * Inside the box: a single clean cover (the original framed-photo style).
 * Outside the box: the bold content — a giant "VISUAL ARCHIVE" bleeding off
 * both edges, an eyebrow, a caption, a scroll cue. The scale contrast (a
 * small sharp frame against enormous serif) is the impact.
 *
 * Scroll = walking in: the frame scales past full-bleed (pin + scrub, CSS
 * sticky in a 260vh runway; Lenis stays the only scroll authority) while the
 * type wall dissolves; everything after this section is inside the archive.
 *
 * GPU-only (transform scale). Statically rendered — NEVER mix a framer
 * `initial` transform with a style MotionValue (it freezes). Reduced motion =
 * a static framed opening.
 */
export default function WalkIn({
  cover,
  places,
  frames,
}: {
  cover: string;
  places: number;
  frames: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  const scale = useTransform(scrollYProgress, [0, 0.85], [1, 4.4], { clamp: true });
  const radius = useTransform(scrollYProgress, [0, 0.5], [4, 0]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.16, 1]);
  const dim = useTransform(scrollYProgress, [0, 0.75], [0.26, 0.05]);
  // The type wall + chrome dissolve as the walk begins.
  const wallOpacity = useTransform(scrollYProgress, [0.02, 0.2], [1, 0]);
  const wallScale = useTransform(scrollYProgress, [0, 0.2], [1, 1.08]);

  const src = cover ? `${cover}?auto=format&w=2000&q=82` : '';
  if (!src) return null;

  const frame = (
    <>
      <motion.img
        src={src}
        alt=""
        style={reduce ? undefined : { scale: imgScale }}
        className="absolute inset-0 w-full h-full object-cover"
        decoding="async"
        draggable={false}
      />
      <motion.div
        className="absolute inset-0 bg-[#282c20] pointer-events-none"
        style={reduce ? { opacity: 0.2 } : { opacity: dim }}
      />
      <div className="absolute inset-0 ring-1 ring-inset ring-white/12 pointer-events-none" />
    </>
  );

  const box = 'w-[64vw] aspect-[4/5] md:w-[25vw] md:aspect-[4/5]';

  if (reduce) {
    return (
      <section className="relative h-[92vh] overflow-hidden flex items-center justify-center">
        <h1
          className="absolute inset-x-0 text-center font-serif uppercase text-[#F4F4ED] whitespace-nowrap tracking-[-0.02em] leading-none pointer-events-none"
          style={{ fontSize: 'clamp(56px, 15vw, 220px)' }}
        >
          Visual&nbsp;Archive
        </h1>
        <div className={`relative overflow-hidden z-10 ${box}`}>{frame}</div>
        <p className="absolute bottom-[8vh] inset-x-0 text-center text-eyebrow" style={{ color: 'rgba(244,244,237,0.6)' }}>
          A record of light &amp; place — {places} places · {frames} frames
        </p>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative" style={{ height: '260vh' }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden flex items-center justify-center">
        {/* ── The bold OUTSIDE — type wall + chrome, dissolves on scroll ── */}
        <motion.div className="absolute inset-0 pointer-events-none" style={{ opacity: wallOpacity }}>
          {/* Eyebrow */}
          <div className="absolute top-[16vh] md:top-[18vh] inset-x-0 text-center">
            <p className="text-eyebrow" style={{ color: 'rgba(244,244,237,0.55)' }}>
              A Photographic Journal · Est. New York
            </p>
          </div>
          {/* Monumental type, one line bleeding off both edges */}
          <motion.h1
            className="absolute inset-0 flex items-center justify-center font-serif uppercase text-[#F4F4ED] whitespace-nowrap tracking-[-0.02em] leading-none"
            style={{ fontSize: 'clamp(56px, 15vw, 220px)', scale: wallScale }}
          >
            Visual&nbsp;Archive
          </motion.h1>
          {/* Caption + cue */}
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

        {/* ── The frame — punches through the type, scales past full-bleed ── */}
        <motion.div
          className={`relative overflow-hidden will-change-transform z-10 ${box}`}
          style={{ scale, borderRadius: radius, transformOrigin: 'center center' }}
        >
          {frame}
        </motion.div>
      </div>
    </section>
  );
}
