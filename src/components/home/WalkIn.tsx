import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * WalkIn — the site's OPENING, rebuilt on the real reference structure:
 *
 * The centre "card" is NOT an independent rotating box. It is a full-viewport
 * WINDOW layer (rounded-rect clip; framer scale 0.6→1 on scroll — downscale-
 * only, crisp) revealing an OVERSIZED FIGURE inside (110% of the window,
 * anchored centre). The pointer-follow is the figure doing a MICRO tilt:
 * rotation capped at ±3° with a coupled translation (tx≈nx·11px, ty≈ny·5px),
 * eased by a 0.08 lerp in one rAF loop — because the figure is bigger than
 * the window and only its middle shows, a tiny tilt reads as the whole card
 * leaning toward the mouse, with no edges exposed.
 *
 * Inside the figure: the olive card surface, an irregular X-shaped light
 * burst (four wedges, apex at centre, opening outward — the v1 cone language)
 * that aims at the pointer, and the cycling city name wiping in TOP-DOWN with
 * `mix-blend-mode: overlay` so the type reads as light on the material, not a
 * sticker.
 *
 * OUTSIDE the window: nothing but the giant bottom word (and the load
 * preloader). Olive palette throughout so the end-dim hands off seamlessly
 * to the dark pages below. Satellites are driven by direct writes (framer
 * bindings on siblings went stale across cycling re-renders).
 */

const GROUND = '#20241a'; // a step darker than the page, so the lit card pops
const CARD = '#30352a'; // the site's lifted-olive surface
const OFF = '#F4F4ED';
const LIME = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const EXPO = 'cubic-bezier(0.22, 1, 0.36, 1)';

/* Irregular X — four wedges, apex at centre, opening outward. Arm widths and
 * edge anchors are deliberately uneven. */
const X_CLIP =
  'polygon(50% 50%, 100% 16%, 100% 34%, 50% 50%, 98% 100%, 76% 100%, 50% 50%, 0% 84%, 0% 64%, 50% 50%, 5% 0%, 24% 0%)';

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

  // ── Pointer follow — ONE rAF loop, two motions ──
  // 1) The oversized figure micro-tilts toward the pointer: ±3° max, coupled
  //    ±11px/±5px translation, 0.08 lerp (spring feel — never assign direct).
  // 2) The X-burst aims at the pointer (atan2 to screen centre, damped,
  //    shortest angular path).
  useEffect(() => {
    if (reduce) return;
    let tRot = 0, cRot = 0, tX = 0, cX = 0, tY = 0, cY = 0;
    let tAim = -20, cAim = -20;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2); // -1..1
      const ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
      tRot = nx * 3; // ±3° — the whole trick is how SMALL this is
      tX = nx * 11;
      tY = ny * 5;
      tAim = (Math.atan2(e.clientY - window.innerHeight / 2, e.clientX - window.innerWidth / 2) * 180) / Math.PI;
    };
    const loop = () => {
      cRot += (tRot - cRot) * 0.08;
      cX += (tX - cX) * 0.08;
      cY += (tY - cY) * 0.08;
      let d = tAim - cAim;
      d = ((d + 540) % 360) - 180;
      cAim += d * 0.08;
      if (figureRef.current) figureRef.current.style.transform = `translate(${cX}px, ${cY}px) rotate(${cRot}deg)`;
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
      {/* L1 — deep-olive ground. The outer page holds NOTHING but the word. */}
      <div className="absolute inset-0" style={{ background: GROUND }} />

      {/* L2 — the giant bottom word (the only outer element) */}
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

      {/* L3 — the WINDOW: full-viewport rounded clip, scaled down (crisp).
           It does not rotate — the figure inside does. */}
      <motion.div
        className="absolute inset-0 z-10 overflow-hidden will-change-transform"
        style={{
          scale: reduce ? 0.62 : scale,
          borderRadius: reduce ? 44 : radius,
          transformOrigin: 'center center',
        }}
      >
        {/* The FIGURE — oversized (110%), micro-tilting toward the pointer */}
        <div
          ref={figureRef}
          className="absolute will-change-transform"
          style={{ inset: '-5%', background: CARD }}
        >
          {/* The X burst — apex at centre, four irregular wedges opening
               outward, aiming at the pointer */}
          <div
            ref={beamRef}
            aria-hidden="true"
            className="absolute pointer-events-none"
            style={{
              left: '-20%',
              top: '-20%',
              width: '140%',
              height: '140%',
              transform: 'rotate(-20deg)',
              transformOrigin: 'center center',
              clipPath: X_CLIP,
              background: `radial-gradient(closest-side, rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.4), rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.12) 70%, transparent)`,
              willChange: 'transform',
            }}
          />

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

          {/* Cycling city name — top-down wipe; OVERLAY blend so the type
               reads as light on the surface, not a sticker */}
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
