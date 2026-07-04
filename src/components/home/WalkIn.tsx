import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * WalkIn — the site's OPENING (iventions mechanics, re-graded to the site's
 * dark-olive palette so it flows into the pages below).
 *
 * Layers (bottom → top): deep-olive ground · a big diagonal LIGHT SHAFT that
 * ROTATES to aim at the pointer (this is the mouse-follow element — a
 * searchlight sweeping the stage behind the card; atan2 to screen centre +
 * damped rAF, shortest angular path) · the centre card (lighter olive)
 * cycling the archive's real city names with a top-down WIPE · top chrome
 * (masked-line title, flanking copy) · the giant "VISUAL ARCHIVE" word.
 *
 * Load: olive preloader, giant word rises, the sheet lifts like a mask,
 * title lines rise staggered (CSS transitions on a phase state — no framer
 * mount anims, which freeze when mixed with style MotionValues).
 *
 * Scroll (pin + scrub, CSS sticky; Lenis is the only scroll authority): the
 * card — full-viewport-sized, only ever scaled DOWN (0.6 → 1, crisp) — grows
 * to full-bleed; the giant word counter-drifts; the chrome dissolves; at the
 * end the card dims to the page olive: lights out, enter the archive.
 * Satellite layers are driven by ONE scroll subscription writing styles
 * directly (framer bindings on siblings went stale across cycling re-renders).
 */

const GROUND = '#20241a'; // a step darker than the page, so the lit card pops
const CARD = '#30352a'; // the site's lifted-olive surface
const OFF = '#F4F4ED';
const LIME = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const EXPO = 'cubic-bezier(0.22, 1, 0.36, 1)';

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
  const shaftRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // ── Load phases: pre (preloader word up) → lift (mask up) → in ──
  const [phase, setPhase] = useState<'pre' | 'lift' | 'in'>('pre');
  useEffect(() => {
    if (reduce) { setPhase('in'); return; }
    const t1 = window.setTimeout(() => setPhase('lift'), 1350);
    const t2 = window.setTimeout(() => setPhase('in'), 2250);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [reduce]);
  const revealed = phase !== 'pre';

  // ── Cycling city names inside the card ──
  const [cityIdx, setCityIdx] = useState(0);
  useEffect(() => {
    if (reduce || collections.length < 2) return;
    const t = window.setInterval(() => setCityIdx((i) => (i + 1) % collections.length), 2400);
    return () => window.clearInterval(t);
  }, [reduce, collections.length]);

  // ── The background light shaft aims at the pointer ──
  // atan2 relative to the screen centre + damped rAF interpolation (0.08 —
  // the damping IS the silkiness; never assign directly). Shortest angular
  // path so crossing ±180° never spins the long way round.
  useEffect(() => {
    if (reduce) return;
    let target = -22;
    let current = -22;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      target = (Math.atan2(e.clientY - window.innerHeight / 2, e.clientX - window.innerWidth / 2) * 180) / Math.PI;
    };
    const loop = () => {
      let d = target - current;
      d = ((d + 540) % 360) - 180;
      current += d * 0.08;
      if (shaftRef.current) shaftRef.current.style.transform = `rotate(${current}deg)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, [reduce]);

  // ── Scroll scrub — card via framer (proven); satellites via direct writes ──
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const scale = useTransform(scrollYProgress, [0, 0.8], [0.6, 1], { clamp: true });
  const radius = useTransform(scrollYProgress, [0, 0.6], [44, 0]);

  const wordRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduce) return;
    const seg = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    const apply = (v: number) => {
      const chromeO = 1 - seg(v, 0.02, 0.25);
      if (chromeRef.current) chromeRef.current.style.opacity = String(chromeO);
      if (wordRef.current) {
        wordRef.current.style.opacity = String(chromeO);
        wordRef.current.style.transform = `translateY(${seg(v, 0, 0.8) * 140}px)`;
      }
      if (dimRef.current) dimRef.current.style.opacity = String(seg(v, 0.84, 1));
    };
    apply(scrollYProgress.get());
    return scrollYProgress.on('change', apply);
  }, [reduce, scrollYProgress]);

  if (!collections.length) return null;
  const city = collections[cityIdx % collections.length];

  /* Masked-line title (per the load spec: overflow-hidden per line, inner
   * rises 100%→0 with 0.1s stagger, ease-out expo). */
  const titleLine = (content: React.ReactNode, i: number) => (
    <span className="block overflow-hidden">
      <span
        className="block"
        style={{
          transform: revealed ? 'translateY(0%)' : 'translateY(110%)',
          transition: `transform 0.9s ${EXPO} ${0.15 + i * 0.1}s`,
        }}
      >
        {content}
      </span>
    </span>
  );

  const stage = (
    <>
      {/* L1 — deep-olive ground */}
      <div className="absolute inset-0" style={{ background: GROUND }} />

      {/* L2 — the searchlight: a long soft lime shaft through the screen
           centre, rotating toward the pointer (behind the card) */}
      <div
        ref={shaftRef}
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          left: '50%',
          top: '50%',
          width: '220vmax',
          height: '24vh',
          marginLeft: '-110vmax',
          marginTop: '-12vh',
          transform: 'rotate(-22deg)',
          transformOrigin: 'center center',
          background:
            'linear-gradient(to bottom, transparent, rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.16) 38%, rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.16) 62%, transparent)',
          filter: 'blur(14px)',
          willChange: 'transform',
        }}
      />

      {/* L5a — giant word across the bottom; counter-drifts + dissolves */}
      <div
        ref={wordRef}
        aria-hidden="true"
        className="absolute inset-x-0 z-20 text-center font-serif uppercase whitespace-nowrap leading-none pointer-events-none"
        style={{
          bottom: '-1.5vw',
          fontSize: '13.5vw',
          letterSpacing: '-0.03em',
          color: OFF,
        }}
      >
        <span className="block overflow-hidden">
          <span
            className="block"
            style={{
              transform: revealed ? 'translateY(0%)' : 'translateY(100%)',
              transition: `transform 1s ${EXPO} 0.05s`,
            }}
          >
            Visual&nbsp;Archive
          </span>
        </span>
      </div>

      {/* L3 — the card: full-viewport-sized, scaled DOWN (crisp), cycling
           city names with a top-down wipe */}
      <motion.div
        className="absolute inset-0 z-10 overflow-hidden will-change-transform"
        style={{
          background: CARD,
          scale: reduce ? 0.62 : scale,
          borderRadius: reduce ? 44 : radius,
          transformOrigin: 'center center',
        }}
      >
        {/* Hairline frame */}
        <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" style={{ borderRadius: 'inherit' }} />

        {/* Card chrome — tiny editorial labels */}
        <div
          className="absolute top-[3.5%] inset-x-[4%] flex items-center justify-between font-ui uppercase"
          style={{ color: 'rgba(244,244,237,0.5)', fontSize: 'clamp(10px, 0.9vw, 13px)', letterSpacing: '0.3em' }}
        >
          <span>Journal Gallery</span>
          <span style={{ color: LIME }}>
            Nº {String((cityIdx % collections.length) + 1).padStart(2, '0')} / {String(places).padStart(2, '0')}
          </span>
        </div>

        {/* Cycling city name — remounts per city; top-down wipe reveal */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            key={reduce ? 'static' : cityIdx}
            className={`font-serif uppercase text-center leading-[0.9] tracking-[-0.02em] ${reduce ? '' : 'walkin-city'}`}
            style={{ color: OFF, fontSize: 'clamp(40px, 7.5vw, 130px)' }}
          >
            {city.name}
          </span>
          <span
            key={reduce ? 'static-f' : `f${cityIdx}`}
            className={`font-ui uppercase mt-[1.5%] ${reduce ? '' : 'walkin-city'}`}
            style={{ color: 'rgba(244,244,237,0.5)', fontSize: 'clamp(10px, 0.95vw, 14px)', letterSpacing: '0.32em', animationDelay: '0.07s' }}
          >
            {String(city.frames).padStart(2, '0')} frames
          </span>
        </div>

        {/* Bottom-of-card caption */}
        <div
          className="absolute bottom-[3.5%] inset-x-[4%] flex items-center justify-between font-ui uppercase"
          style={{ color: 'rgba(244,244,237,0.4)', fontSize: 'clamp(9px, 0.8vw, 12px)', letterSpacing: '0.28em' }}
        >
          <span>A record of light &amp; place</span>
          <span>{frames} frames</span>
        </div>

        {/* Lights out — dims to the page olive as it fills */}
        {!reduce && (
          <div ref={dimRef} className="absolute inset-0 pointer-events-none" style={{ background: '#282c20', opacity: 0 }} />
        )}
      </motion.div>

      {/* L5b — top chrome: masked-line title + flanking copy */}
      <div ref={chromeRef} className="absolute inset-0 z-30 pointer-events-none">
        <h1
          className="absolute top-[9vh] inset-x-0 text-center uppercase"
          style={{ color: OFF, fontSize: 'clamp(34px, 4.6vw, 72px)', lineHeight: 0.98, letterSpacing: '-0.02em' }}
        >
          {titleLine(<span className="font-ui font-medium">Step into</span>, 0)}
          {titleLine(<span className="font-serif italic" style={{ color: LIME }}>the light.</span>, 1)}
        </h1>

        <p
          className="absolute left-[5vw] top-[46%] w-[15vw] min-w-[150px] font-ui uppercase hidden md:block"
          style={{
            color: 'rgba(244,244,237,0.55)', fontSize: '11px', letterSpacing: '0.14em', lineHeight: 1.8,
            opacity: revealed ? 1 : 0, transition: `opacity 0.9s ease 0.55s`,
          }}
        >
          A photographic journal by Ryan Xu — {places} places, {frames} frames, kept in the order they were lived.
        </p>
        <p
          className="absolute right-[5vw] top-[46%] w-[15vw] min-w-[150px] text-right font-ui uppercase hidden md:block"
          style={{
            color: 'rgba(244,244,237,0.55)', fontSize: '11px', letterSpacing: '0.14em', lineHeight: 1.8,
            opacity: revealed ? 1 : 0, transition: `opacity 0.9s ease 0.65s`,
          }}
        >
          Scroll — the light finds each place in turn. Step inside the archive.
        </p>
      </div>

      {/* Preloader — olive sheet with the giant word rising; lifts like a mask */}
      {phase !== 'in' && !reduce && (
        <div
          className="absolute inset-0 z-40 overflow-hidden"
          style={{
            background: GROUND,
            transform: phase === 'lift' ? 'translateY(-100%)' : 'translateY(0)',
            transition: `transform 0.9s ${EXPO}`,
          }}
        >
          <div
            className="absolute inset-x-0 bottom-[-1.5vw] text-center font-serif uppercase whitespace-nowrap leading-none"
            style={{ fontSize: '13.5vw', letterSpacing: '-0.03em', color: 'rgba(244,244,237,0.09)' }}
          >
            <span className="block overflow-hidden">
              <span className="block walkin-rise">Visual&nbsp;Archive</span>
            </span>
          </div>
        </div>
      )}
    </>
  );

  if (reduce) {
    return (
      <section className="relative h-[100svh] overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">{stage}</div>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative" style={{ height: '240vh' }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden flex items-center justify-center">{stage}</div>
    </section>
  );
}
