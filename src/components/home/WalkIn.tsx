import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

/**
 * WalkIn — the site's OPENING: the archive as a CONTACT SHEET.
 *
 * Act 1 (minimal page): a clean dark screen holding one small centered card —
 * not a single collection's cover, but a miniature contact sheet of ALL
 * collections (2×3 grid with hairline gutters and tiny frame numbers), the
 * wordmark above, one caption line below, a scroll cue. The card IS the
 * archive in miniature; no place gets top billing.
 * Act 2 (the zoom): scrolling scales the sheet past full-bleed (pin + scrub,
 * CSS sticky in a 260vh runway; Lenis stays the only scroll authority) — the
 * frames grow monumental around you, the chrome dissolves, "THE ARCHIVE"
 * floats up mid-walk.
 * Act 3: everything after this section is inside the archive.
 *
 * GPU-only (transform scale; never width/height). Statically rendered (no
 * mount animation — and never mix a framer `initial` transform with a style
 * MotionValue; it freezes). Reduced motion = a static sheet band.
 */
export default function WalkIn({
  covers,
  places,
  frames,
}: {
  /** All collections' covers, in on-screen order. */
  covers: { src: string; name: string }[];
  places: number;
  frames: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  // The walk-in: sheet grows past full-bleed; radius squares off; the frames
  // counter-settle; the dim lifts as you "arrive".
  const scale = useTransform(scrollYProgress, [0, 0.85], [1, 3.6], { clamp: true });
  const radius = useTransform(scrollYProgress, [0, 0.5], [18, 0]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.16, 1]);
  const dim = useTransform(scrollYProgress, [0, 0.75], [0.34, 0.08]);
  // Opening chrome dissolves as soon as the walk begins.
  const openingOpacity = useTransform(scrollYProgress, [0.02, 0.22], [1, 0]);
  const openingY = useTransform(scrollYProgress, [0.02, 0.22], [0, -18]);
  // The destination floats up mid-walk, then gives way to the frames.
  const nameOpacity = useTransform(scrollYProgress, [0.3, 0.52, 0.82, 0.96], [0, 1, 1, 0]);
  const nameY = useTransform(scrollYProgress, [0.3, 0.55], [36, 0]);

  const sheet = covers.filter((c) => c.src).slice(0, 6);
  if (sheet.length < 2) return null;

  const grid = (
    <div className="absolute inset-0 grid grid-cols-2 md:grid-cols-3 gap-[3px]">
      {sheet.map((c, i) => (
        <div key={i} className="relative overflow-hidden">
          <motion.img
            src={`${c.src}?auto=format&w=900&q=80`}
            alt={c.name}
            style={reduce ? undefined : { scale: imgScale }}
            className="absolute inset-0 w-full h-full object-cover"
            decoding="async"
            draggable={false}
          />
          {/* Contact-sheet frame number */}
          <span
            className="absolute bottom-1.5 left-2 font-ui text-[8px] tracking-[0.25em] text-white/45"
            aria-hidden="true"
          >
            {String(i + 1).padStart(2, '0')}
          </span>
        </div>
      ))}
    </div>
  );

  if (reduce) {
    return (
      <section className="relative h-[92vh] overflow-hidden">
        <div className="absolute inset-0">{grid}</div>
        <div className="absolute inset-0 bg-[#282c20]/45" />
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
        {/* ── Act 1 chrome — the minimal page around the sheet ── */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10"
          style={{ opacity: openingOpacity, y: openingY }}
        >
          <p className="font-serif uppercase tracking-[0.24em] text-base md:text-xl text-[#F4F4ED] mb-6 md:mb-8">
            Journal&nbsp;Gallery
          </p>
          {/* Spacer the size of the sheet (the sheet itself sits beneath) */}
          <div className="w-[70vw] aspect-[3/4] md:w-[38vw] md:aspect-[16/11] invisible" />
          <p className="text-eyebrow mt-6 md:mt-8 text-center px-6" style={{ color: 'rgba(244,244,237,0.55)' }}>
            A record of light &amp; place&nbsp;&nbsp;·&nbsp;&nbsp;{places} places · {frames} frames
          </p>
          <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2">
            <span className="text-eyebrow">Scroll to step inside</span>
            <span className="w-px h-8" style={{ background: 'rgba(244,244,237,0.35)' }} />
          </div>
        </motion.div>

        {/* ── The contact sheet — scales past full-bleed ── */}
        <motion.div
          aria-label="The archive, as a contact sheet"
          className="relative overflow-hidden will-change-transform w-[70vw] aspect-[3/4] md:w-[38vw] md:aspect-[16/11]"
          style={{ scale, borderRadius: radius, transformOrigin: 'center center' }}
        >
          {grid}
          <motion.div className="absolute inset-0 bg-[#282c20] pointer-events-none" style={{ opacity: dim }} />
        </motion.div>

        {/* ── Mid-walk destination label ── */}
        <motion.div
          className="absolute inset-x-0 bottom-[10vh] text-center pointer-events-none z-10"
          style={{ opacity: nameOpacity, y: nameY }}
        >
          <p className="text-eyebrow mb-4" style={{ color: ACCENT }}>
            Nº {String(places).padStart(2, '0')} — Visual Archive
          </p>
          <h1
            className="font-serif uppercase text-white tracking-tight leading-[0.88]"
            style={{ fontSize: 'clamp(44px, 9vw, 150px)', textShadow: '0 2px 50px rgba(0,0,0,0.55)' }}
          >
            The <span style={{ color: ACCENT }}>Archive</span>
          </h1>
        </motion.div>
      </div>
    </section>
  );
}
