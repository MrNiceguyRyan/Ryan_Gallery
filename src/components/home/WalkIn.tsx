import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * WalkIn — the site's OPENING.
 *
 * Stage layers (bottom → top):
 *   L1 deep-olive ground
 *   L2 the X-BURST — apex at screen centre, four uneven wedges + four thin
 *      splinter rays (one clip-path), SOLID lime fill (no gradient), sitting
 *      BEHIND the card on the outer stage (same world as the giant word),
 *      slowly aiming at the pointer (damped atan2, 0.04 — lazy, heavy light)
 *   L3 the CARD — a full-viewport rounded WINDOW (framer scale 0.6→1 on
 *      scroll, downscale-only = crisp) with real 3D: a perspective wrapper
 *      tilts it toward the pointer (rotateX/rotateY capped ±5°, 0.08 lerp)
 *      over a deep soft shadow; inside, an OVERSIZED figure (inset -5%)
 *      parallax-translates (nx·10px/ny·5px) the opposite depth plane, and the
 *      cycling city name wipes in TOP-DOWN with mix-blend overlay (light on
 *      material, not a sticker)
 *   L4 the giant bottom word (the only other outer element)
 *   L5 the load preloader (olive sheet, word rises, mask lifts)
 *
 * All pointer motion runs in ONE rAF loop with lerp damping (never assign
 * directly). Satellites are scroll-driven by direct writes (framer bindings
 * on siblings went stale across cycling re-renders). At the end of the walk
 * the card dims to the page olive — lights out, enter the archive.
 */

const GROUND = '#20241a'; // a step darker than the page, so the lit card pops
const CARD = '#30352a'; // the site's lifted-olive surface
const OFF = '#F4F4ED';
const LIME = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const EXPO = 'cubic-bezier(0.22, 1, 0.36, 1)';

/* Detailed irregular X — four uneven main wedges + four thin splinter rays,
 * apex at centre, in a single clip-path. */
const X_CLIP = [
  '50% 50%', '100% 18%', '100% 30%', // NE main
  '50% 50%', '100% 7%', '100% 10%', // NE splinter
  '50% 50%', '96% 100%', '82% 100%', // SE main
  '50% 50%', '71% 100%', '68% 100%', // SE splinter
  '50% 50%', '0% 84%', '0% 72%', // SW main
  '50% 50%', '0% 94%', '0% 91%', // SW splinter
  '50% 50%', '4% 0%', '17% 0%', // NW main
  '50% 50%', '29% 0%', '32% 0%', // NW splinter
].join(', ');

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
  const tiltRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
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

  // ── Pointer follow — ONE rAF loop, three motions ──
  // 1) card 3D tilt: rotateX/rotateY capped ±5°, 0.08 lerp
  // 2) figure parallax: translate nx·10 / ny·5, 0.08 lerp (opposite plane)
  // 3) X-burst aim: damped atan2, 0.04 — deliberately slower, heavy light
  useEffect(() => {
    if (reduce) return;
    let tTX = 0, cTX = 0, tTY = 0, cTY = 0; // card tilt (deg)
    let tFX = 0, cFX = 0, tFY = 0, cFY = 0; // figure parallax (px)
    let tAim = -20, cAim = -20; // burst angle (deg)
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2); // -1..1
      const ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
      tTY = nx * 5; // rotateY follows horizontal
      tTX = -ny * 5; // rotateX follows vertical (inverted — top leans back)
      tFX = nx * 10;
      tFY = ny * 5;
      tAim = (Math.atan2(e.clientY - window.innerHeight / 2, e.clientX - window.innerWidth / 2) * 180) / Math.PI;
    };
    const loop = () => {
      cTX += (tTX - cTX) * 0.08;
      cTY += (tTY - cTY) * 0.08;
      cFX += (tFX - cFX) * 0.08;
      cFY += (tFY - cFY) * 0.08;
      let d = tAim - cAim;
      d = ((d + 540) % 360) - 180;
      cAim += d * 0.04; // slower — the light is heavy
      if (tiltRef.current) tiltRef.current.style.transform = `rotateX(${cTX}deg) rotateY(${cTY}deg)`;
      if (figureRef.current) figureRef.current.style.transform = `translate(${cFX}px, ${cFY}px)`;
      if (beamRef.current) beamRef.current.style.transform = `rotate(${cAim}deg)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, [reduce]);

  // ── Scroll scrub — window via framer (proven); satellites direct-write ──
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const scale = useTransform(scrollYProgress, [0, 0.8], [0.6, 1], { clamp: true });
  const radius = useTransform(scrollYProgress, [0, 0.6], [44, 0]);

  const wordRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduce) return;
    const seg = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    const apply = (v: number) => {
      if (wordRef.current) {
        wordRef.current.style.opacity = String(1 - seg(v, 0.02, 0.25));
        wordRef.current.style.transform = `translateY(${seg(v, 0, 0.8) * 140}px)`;
      }
      if (dimRef.current) dimRef.current.style.opacity = String(seg(v, 0.84, 1));
    };
    apply(scrollYProgress.get());
    return scrollYProgress.on('change', apply);
  }, [reduce, scrollYProgress]);

  if (!collections.length) return null;
  const city = collections[cityIdx % collections.length];

  const stage = (
    <>
      {/* L1 — deep-olive ground */}
      <div className="absolute inset-0" style={{ background: GROUND }} />

      {/* L2 — the X-burst: BEHIND the card, on the outer stage with the giant
           word. Solid lime, no gradient; slow damped aim. */}
      <div
        ref={beamRef}
        aria-hidden="true"
        className="absolute z-[5] pointer-events-none"
        style={{
          left: '-20%',
          top: '-20%',
          width: '140%',
          height: '140%',
          transform: 'rotate(-20deg)',
          transformOrigin: 'center center',
          clipPath: `polygon(${X_CLIP})`,
          background: 'rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.34)',
          willChange: 'transform',
        }}
      />

      {/* L4 — giant word across the bottom (outer stage, in front) */}
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

      {/* L3 — the CARD in real 3D: perspective wrapper → tilt layer → window */}
      <div className="absolute inset-0 z-10" style={{ perspective: '1400px' }}>
        <div ref={tiltRef} className="absolute inset-0 will-change-transform" style={{ transformStyle: 'preserve-3d' }}>
          <motion.div
            className="absolute inset-0 overflow-hidden will-change-transform"
            style={{
              scale: reduce ? 0.62 : scale,
              borderRadius: reduce ? 44 : radius,
              transformOrigin: 'center center',
              boxShadow: '0 42px 110px rgba(0, 0, 0, 0.5), 0 10px 30px rgba(0, 0, 0, 0.4)',
            }}
          >
            {/* The FIGURE — oversized, parallax-translating (opposite plane) */}
            <div
              ref={figureRef}
              className="absolute will-change-transform"
              style={{ inset: '-5%', background: CARD }}
            >
              {/* Card chrome — tiny editorial labels (part of the material) */}
              <div
                className="absolute top-[7%] inset-x-[8%] flex items-center justify-between font-ui uppercase"
                style={{ color: 'rgba(244,244,237,0.5)', fontSize: 'clamp(10px, 0.9vw, 13px)', letterSpacing: '0.3em' }}
              >
                <span>Journal Gallery</span>
                <span style={{ color: LIME }}>
                  Nº {String((cityIdx % collections.length) + 1).padStart(2, '0')} / {String(places).padStart(2, '0')}
                </span>
              </div>

              {/* Cycling city name — top-down wipe; OVERLAY blend (light on
                   material, not a sticker) */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center"
                style={{ mixBlendMode: 'overlay' }}
              >
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
                  style={{ color: 'rgba(244,244,237,0.75)', fontSize: 'clamp(10px, 0.95vw, 14px)', letterSpacing: '0.32em', animationDelay: '0.07s' }}
                >
                  {String(city.frames).padStart(2, '0')} frames
                </span>
              </div>

              {/* Bottom-of-card caption */}
              <div
                className="absolute bottom-[7%] inset-x-[8%] flex items-center justify-between font-ui uppercase"
                style={{ color: 'rgba(244,244,237,0.4)', fontSize: 'clamp(9px, 0.8vw, 12px)', letterSpacing: '0.28em' }}
              >
                <span>A record of light &amp; place</span>
                <span>{frames} frames</span>
              </div>
            </div>

            {/* Hairline window edge */}
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" style={{ borderRadius: 'inherit' }} />

            {/* Lights out — dims to the page olive as the window fills */}
            {!reduce && (
              <div ref={dimRef} className="absolute inset-0 pointer-events-none" style={{ background: '#282c20', opacity: 0 }} />
            )}
          </motion.div>
        </div>
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
