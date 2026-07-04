import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * WalkIn — the site's OPENING, rebuilt on the iventions.com hero mechanics:
 *
 * Layers (bottom → top): cream ground · a static purple diagonal light band
 * (scroll parallax only, not mouse) · the rounded centre CARD (cycling the
 * archive's real city names — no photos) with a SPOTLIGHT CONE inside that
 * rotates to aim at the pointer (atan2 → damped rAF interpolation, 0.08) ·
 * top chrome (masked-line title, two flanking copy blocks) · the giant
 * "VISUAL ARCHIVE" word across the bottom.
 *
 * Load sequence: cream preloader with the giant word rising from the bottom,
 * hold, mask lifts to reveal the hero, title lines rise with 0.1s stagger
 * (all CSS transitions on a phase state — no framer mount animations, which
 * freeze when mixed with style MotionValues).
 *
 * Scroll (pin + scrub, CSS sticky; Lenis is the only scroll authority): the
 * card — rendered at FULL viewport size and only ever scaled DOWN (0.6 → 1,
 * crisp by construction) — grows to fill; the purple band parallaxes, the
 * giant word counter-translates, the chrome dissolves, and at the end the
 * card interior dims to the site's olive: lights out, enter the archive.
 */

const CREAM = '#F3EFEB';
const CARD = '#EAE3DC';
const PURPLE = '#9C93E8';
const NEON = '#E0FF98';
const INK = '#1E1E1E';
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
  const cardRef = useRef<HTMLDivElement>(null);
  const beamRef = useRef<HTMLDivElement>(null);
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

  // ── The spotlight cone aims at the pointer (atan2 + damped rAF) ──
  useEffect(() => {
    if (reduce) return;
    let target = -32;
    let current = -32;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      target = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    };
    const loop = () => {
      // Shortest angular path so crossing ±180° never spins the long way.
      let d = target - current;
      d = ((d + 540) % 360) - 180;
      current += d * 0.08; // the damping IS the silkiness — never assign directly
      if (beamRef.current) beamRef.current.style.transform = `rotate(${current}deg)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, [reduce]);

  // ── Scroll scrub ──
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const scale = useTransform(scrollYProgress, [0, 0.8], [0.6, 1], { clamp: true });
  const radius = useTransform(scrollYProgress, [0, 0.6], [44, 0]);

  // The satellite layers (band parallax, giant-word drift, chrome fade, dim)
  // are written DIRECTLY from one scroll subscription. Framer style bindings
  // on these siblings went stale across the city-cycling re-renders; direct
  // writes (the same pattern as the beam) are immune.
  const bandRef = useRef<HTMLDivElement>(null);
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
      if (bandRef.current) {
        bandRef.current.style.transform = `translateY(${-seg(v, 0, 1) * 70}px) rotate(-22deg)`;
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
      {/* L1 — cream ground */}
      <div className="absolute inset-0" style={{ background: CREAM }} />

      {/* L2 — static purple diagonal light band (scroll parallax only) */}
      <div
        ref={bandRef}
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          width: '170%',
          height: '30vh',
          left: '-30%',
          top: '34%',
          background: PURPLE,
          transform: 'rotate(-22deg)',
          opacity: 0.85,
        }}
      />

      {/* L5a — giant word across the bottom (in front of the card, like the
           reference); counter-translates + dissolves on scroll */}
      <div
        ref={wordRef}
        aria-hidden="true"
        className="absolute inset-x-0 z-20 text-center font-serif uppercase whitespace-nowrap leading-none pointer-events-none"
        style={{
          bottom: '-1.5vw',
          fontSize: '13.5vw',
          letterSpacing: '-0.03em',
          color: INK,
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

      {/* L3+L4 — the card: full-viewport-sized, scaled DOWN (crisp), holding
           the rotating spotlight cone + cycling city names */}
      <motion.div
        ref={cardRef}
        className="absolute inset-0 z-10 overflow-hidden will-change-transform"
        style={{
          background: CARD,
          scale: reduce ? 0.62 : scale,
          borderRadius: reduce ? 44 : radius,
          transformOrigin: 'center center',
        }}
      >
        {/* The spotlight cone — rotates toward the pointer around the card
             centre. Oversized so the wedge reaches past the edges. */}
        <div
          ref={beamRef}
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            left: '-25%',
            top: '-25%',
            width: '150%',
            height: '150%',
            transform: 'rotate(-32deg)',
            clipPath: 'polygon(50% 50%, 100% 34%, 100% 66%)',
            background: `linear-gradient(to right, ${NEON} 50%, ${NEON} 100%)`,
            opacity: 0.95,
          }}
        />

        {/* Card chrome — tiny editorial labels */}
        <div
          className="absolute top-[3.5%] inset-x-[4%] flex items-center justify-between font-ui uppercase"
          style={{ color: 'rgba(30,30,30,0.55)', fontSize: 'clamp(10px, 0.9vw, 13px)', letterSpacing: '0.3em' }}
        >
          <span>Journal Gallery</span>
          <span>
            Nº {String((cityIdx % collections.length) + 1).padStart(2, '0')} / {String(places).padStart(2, '0')}
          </span>
        </div>

        {/* Cycling city name — remounts per city for the CSS rise-in */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            key={reduce ? 'static' : cityIdx}
            className={`font-serif uppercase text-center leading-[0.9] tracking-[-0.02em] ${reduce ? '' : 'walkin-city'}`}
            style={{ color: INK, fontSize: 'clamp(40px, 7.5vw, 130px)' }}
          >
            {city.name}
          </span>
          <span
            key={reduce ? 'static-f' : `f${cityIdx}`}
            className={`font-ui uppercase mt-[1.5%] ${reduce ? '' : 'walkin-city'}`}
            style={{ color: 'rgba(30,30,30,0.5)', fontSize: 'clamp(10px, 0.95vw, 14px)', letterSpacing: '0.32em', animationDelay: '0.08s' }}
          >
            {String(city.frames).padStart(2, '0')} frames
          </span>
        </div>

        {/* Bottom-of-card caption */}
        <div
          className="absolute bottom-[3.5%] inset-x-[4%] flex items-center justify-between font-ui uppercase"
          style={{ color: 'rgba(30,30,30,0.45)', fontSize: 'clamp(9px, 0.8vw, 12px)', letterSpacing: '0.28em' }}
        >
          <span>A record of light &amp; place</span>
          <span>{frames} frames</span>
        </div>

        {/* Lights out — the card dims to the site olive as it fills, handing
             off seamlessly to the dark archive below */}
        {!reduce && (
          <div ref={dimRef} className="absolute inset-0 pointer-events-none" style={{ background: '#282c20', opacity: 0 }} />
        )}
      </motion.div>

      {/* L5b — top chrome: masked-line title + flanking copy (dissolves on scroll) */}
      <div
        ref={chromeRef}
        className="absolute inset-0 z-30 pointer-events-none"
      >
        <h1
          className="absolute top-[9vh] inset-x-0 text-center uppercase"
          style={{ color: INK, fontSize: 'clamp(34px, 4.6vw, 72px)', lineHeight: 0.98, letterSpacing: '-0.02em' }}
        >
          {titleLine(<span className="font-ui font-medium">Step into</span>, 0)}
          {titleLine(<span className="font-serif italic">the light.</span>, 1)}
        </h1>

        {/* Flanking copy blocks */}
        <p
          className="absolute left-[5vw] top-[46%] w-[15vw] min-w-[150px] font-ui uppercase hidden md:block"
          style={{
            color: 'rgba(30,30,30,0.62)', fontSize: '11px', letterSpacing: '0.14em', lineHeight: 1.8,
            opacity: revealed ? 1 : 0, transition: `opacity 0.9s ease 0.55s`,
          }}
        >
          A photographic journal by Ryan Xu — {places} places, {frames} frames, kept in the order they were lived.
        </p>
        <p
          className="absolute right-[5vw] top-[46%] w-[15vw] min-w-[150px] text-right font-ui uppercase hidden md:block"
          style={{
            color: 'rgba(30,30,30,0.62)', fontSize: '11px', letterSpacing: '0.14em', lineHeight: 1.8,
            opacity: revealed ? 1 : 0, transition: `opacity 0.9s ease 0.65s`,
          }}
        >
          Scroll — the spotlight finds each place in turn. Step inside the archive.
        </p>
      </div>

      {/* Preloader — cream sheet with the giant word rising; the whole sheet
           lifts away like a mask */}
      {phase !== 'in' && !reduce && (
        <div
          className="absolute inset-0 z-40 overflow-hidden"
          style={{
            background: CREAM,
            transform: phase === 'lift' ? 'translateY(-100%)' : 'translateY(0)',
            transition: `transform 0.9s ${EXPO}`,
          }}
        >
          <div
            className="absolute inset-x-0 bottom-[-1.5vw] text-center font-serif uppercase whitespace-nowrap leading-none"
            style={{ fontSize: '13.5vw', letterSpacing: '-0.03em', color: 'rgba(30,30,30,0.12)' }}
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
