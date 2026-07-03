import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

/**
 * WalkIn — the site's OPENING and its gateway, as one piece.
 *
 * Act 1 (minimal page): a clean dark screen holding only a small centered
 * cover card, the wordmark above it, one caption line + counts below, and a
 * scroll cue. Nothing else.
 * Act 2 (the zoom): scrolling scales that card past full-bleed (pin + scrub —
 * CSS sticky stage in a 260vh runway; Lenis stays the only scroll authority),
 * the opening chrome dissolves as the photo takes over, and the place name
 * floats up mid-walk.
 * Act 3: everything after this section IS "inside the photograph" — the whole
 * archive follows.
 *
 * GPU-only (transform scale; never width/height). Clickable → opens the lead
 * collection. Reduced motion = static minimal page over a full-bleed band.
 */
export default function WalkIn({
  cover,
  name,
  places,
  frames,
  onOpen,
}: {
  cover: string;
  name: string;
  places: number;
  frames: number;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  // The walk-in: card grows from a window to past-full-bleed; radius squares
  // off; the photo counter-settles; the dim lifts as you "arrive".
  const scale = useTransform(scrollYProgress, [0, 0.85], [1, 3.6], { clamp: true });
  const radius = useTransform(scrollYProgress, [0, 0.5], [20, 0]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.22, 1]);
  const dim = useTransform(scrollYProgress, [0, 0.75], [0.38, 0.1]);
  // Opening chrome dissolves as soon as the walk begins.
  const openingOpacity = useTransform(scrollYProgress, [0.02, 0.22], [1, 0]);
  const openingY = useTransform(scrollYProgress, [0.02, 0.22], [0, -18]);
  // The destination name floats up mid-walk, then gives way to the photo.
  const nameOpacity = useTransform(scrollYProgress, [0.3, 0.52, 0.82, 0.96], [0, 1, 1, 0]);
  const nameY = useTransform(scrollYProgress, [0.3, 0.55], [36, 0]);

  const src = cover ? `${cover}?auto=format&w=2200&q=82` : '';
  if (!src) return null;

  if (reduce) {
    return (
      <section className="relative h-[92vh] overflow-hidden">
        <img src={src} alt={name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        <div className="absolute inset-0 bg-[#282c20]/40" />
        <div className="absolute inset-x-0 bottom-[10vh] text-center">
          <p className="font-serif uppercase tracking-[0.2em] text-lg text-[#F4F4ED] mb-3">Journal Gallery</p>
          <p className="text-eyebrow" style={{ color: 'rgba(244,244,237,0.6)' }}>
            A record of light &amp; place — {places} places · {frames} frames
          </p>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative" style={{ height: '260vh' }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden flex items-center justify-center">
        {/* ── Act 1 chrome — the minimal page around the card. Statically
             visible (no mount animation — the page opens settled and calm);
             it dissolves as soon as the walk begins. ── */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10"
          style={{ opacity: openingOpacity, y: openingY }}
        >
          {/* Wordmark above the card */}
          <p className="font-serif uppercase tracking-[0.24em] text-base md:text-xl text-[#F4F4ED] mb-6 md:mb-8">
            Journal&nbsp;Gallery
          </p>
          {/* Spacer the size of the card (the card itself sits beneath) */}
          <div className="w-[70vw] aspect-[3/4] md:w-[36vw] md:aspect-[16/11] invisible" />
          {/* Caption below the card */}
          <p className="text-eyebrow mt-6 md:mt-8 text-center px-6" style={{ color: 'rgba(244,244,237,0.55)' }}>
            A record of light &amp; place&nbsp;&nbsp;·&nbsp;&nbsp;{places} places · {frames} frames
          </p>
          {/* Scroll cue */}
          <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2">
            <span className="text-eyebrow">Scroll to step inside</span>
            <span className="w-px h-8" style={{ background: 'rgba(244,244,237,0.35)' }} />
          </div>
        </motion.div>

        {/* ── The card / the world — scales past full-bleed. The scrub owns
             the transform; no mount animation (mixing an entrance `initial`
             with a style MotionValue froze scale at its initial). ── */}
        <motion.div
          onClick={onOpen}
          role="button"
          aria-label={`View story: ${name}`}
          data-cursor="View Story"
          className="relative overflow-hidden cursor-pointer will-change-transform w-[70vw] aspect-[3/4] md:w-[36vw] md:aspect-[16/11]"
          style={{ scale, borderRadius: radius, transformOrigin: 'center center' }}
        >
          <motion.img
            src={src}
            alt={name}
            style={{ scale: imgScale }}
            className="absolute inset-0 w-full h-full object-cover"
            decoding="async"
            draggable={false}
          />
          <motion.div className="absolute inset-0 bg-[#282c20] pointer-events-none" style={{ opacity: dim }} />
        </motion.div>

        {/* ── Mid-walk destination label ── */}
        <motion.div
          className="absolute inset-x-0 bottom-[10vh] text-center pointer-events-none z-10"
          style={{ opacity: nameOpacity, y: nameY }}
        >
          <p className="text-eyebrow mb-4" style={{ color: ACCENT }}>
            Enter the archive
          </p>
          <h1
            className="font-serif uppercase text-white tracking-tight leading-[0.88]"
            style={{ fontSize: 'clamp(44px, 9vw, 150px)', textShadow: '0 2px 50px rgba(0,0,0,0.55)' }}
          >
            {name}
          </h1>
        </motion.div>
      </div>
    </section>
  );
}
