import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

/**
 * WalkIn — the pinned scale-up gateway into the archive (the iventions
 * "Master Makers" mechanic, re-metaphored for a photo archive: walking INTO
 * a photograph). A 240vh runway; inside it a sticky 100svh stage pins the
 * lead cover as a small rounded card that scales up past full-bleed as you
 * scroll, corners squaring off, while the place name floats up in serif.
 *
 * Pin = CSS sticky (plays with Lenis; no GSAP). Scrub = useScroll progress.
 * GPU-only: transform scale on the card (never width/height), overflow
 * clipped by the stage. Clicking the card opens the collection. Reduced
 * motion = a static full-bleed band with the label.
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

  // The walk-in: card grows from window to past-full-bleed; radius squares off;
  // the photo inside counter-settles for depth; the dim lifts as you "arrive".
  const scale = useTransform(scrollYProgress, [0, 0.85], [1, 3.6], { clamp: true });
  const radius = useTransform(scrollYProgress, [0, 0.5], [22, 0]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.22, 1]);
  const dim = useTransform(scrollYProgress, [0, 0.75], [0.44, 0.12]);
  // Label floats up mid-walk, then gives way as the photo takes the screen.
  const labelOpacity = useTransform(scrollYProgress, [0.18, 0.42, 0.82, 0.96], [0, 1, 1, 0]);
  const labelY = useTransform(scrollYProgress, [0.18, 0.45], [36, 0]);
  const cueOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);

  const src = cover ? `${cover}?auto=format&w=2200&q=82` : '';
  if (!src) return null;

  const label = (
    <>
      <p className="text-eyebrow mb-4" style={{ color: ACCENT }}>
        Enter the archive
      </p>
      <h2
        className="font-serif uppercase text-white tracking-tight leading-[0.88]"
        style={{ fontSize: 'clamp(44px, 9vw, 150px)', textShadow: '0 2px 50px rgba(0,0,0,0.55)' }}
      >
        {name}
      </h2>
      <p className="text-eyebrow mt-5" style={{ color: 'rgba(244,244,237,0.6)' }}>
        {places} places · {frames} frames
      </p>
    </>
  );

  if (reduce) {
    return (
      <section className="relative h-[80vh] overflow-hidden">
        <img src={src} alt={name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        <div className="absolute inset-0 bg-[#282c20]/35" />
        <div className="absolute inset-x-0 bottom-[10vh] text-center">{label}</div>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative" style={{ height: '240vh' }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden flex items-center justify-center">
        <motion.div
          onClick={onOpen}
          role="button"
          aria-label={`View story: ${name}`}
          data-cursor="View Story"
          className="relative overflow-hidden cursor-pointer will-change-transform w-[74vw] aspect-[3/4] md:w-[42vw] md:aspect-[16/11]"
          style={{ scale, borderRadius: radius, transformOrigin: 'center center' }}
        >
          <motion.img
            src={src}
            alt={name}
            style={{ scale: imgScale }}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          <motion.div className="absolute inset-0 bg-[#282c20] pointer-events-none" style={{ opacity: dim }} />
        </motion.div>

        {/* Label — outside the scaler so the type stays crisp and fixed-size */}
        <motion.div
          className="absolute inset-x-0 bottom-[10vh] text-center pointer-events-none z-10"
          style={{ opacity: labelOpacity, y: labelY }}
        >
          {label}
        </motion.div>

        {/* Scroll cue — visible at the start of the pin, gone once moving */}
        <motion.p
          className="absolute bottom-8 inset-x-0 text-center text-eyebrow pointer-events-none"
          style={{ opacity: cueOpacity }}
        >
          Keep scrolling
        </motion.p>
      </div>
    </section>
  );
}
