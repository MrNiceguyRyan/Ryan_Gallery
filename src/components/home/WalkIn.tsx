import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * WalkIn — the site's OPENING.
 *
 *  · Load: an HOURGLASS spins at centre (the loading rotor, fast).
 *  · Reveal: it BLOOMS OPEN — a dynamic, silky morph — the hourglass fades as
 *    a solid lime X scales up from centre with an overshoot while its spin
 *    decelerates hard; a centre glow fills the middle so there's no void.
 *  · The CARD is a full-viewport window (crisp downscale) that scales out from
 *    a point, tilts in real 3D toward the pointer (perspective rotateX/rotateY),
 *    and carries layered material texture (soft-light sheen + overlay lime
 *    wash) that shifts as an inner figure parallaxes with the pointer.
 *  · Scroll grows the card to full and dims to olive → into the archive.
 */

const GROUND = '#20241a';
const CARD = '#30352a';
const OFF = '#F4F4ED';
const LIME = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const LIME_A = (a: number) => `rgba(var(--accent-r), var(--accent-g), var(--accent-b), ${a})`;
const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';
const BLOOM = 'cubic-bezier(0.34, 1.45, 0.5, 1)'; // back-overshoot — the dynamic pop
const ROTOR = 0.05;

/* Wide solid X — four broad wedges (thin gaps, no hollow middle). */
const X_CLIP = 'polygon(50% 50%, 92% 8%, 100% 42%, 50% 50%, 100% 58%, 92% 92%, 50% 50%, 8% 92%, 0% 58%, 50% 50%, 0% 42%, 8% 8%)';
/* Hourglass / sand-timer for the loading rotor. */
const HOURGLASS = 'polygon(24% 6%, 76% 6%, 53% 50%, 76% 94%, 24% 94%, 47% 50%)';

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
  const xRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // ── Load sequence ──
  const [phase, setPhase] = useState<'blank' | 'load' | 'reveal'>('blank');
  const revealedRef = useRef(false);
  useEffect(() => {
    if (reduce) { setPhase('reveal'); revealedRef.current = true; return; }
    let minOk = false;
    let loadOk = document.readyState === 'complete';
    let fired = false;
    const go = () => {
      if (fired || !minOk || !loadOk) return;
      fired = true;
      revealedRef.current = true;
      setPhase('reveal');
    };
    const t1 = window.setTimeout(() => setPhase('load'), 300);
    const t2 = window.setTimeout(() => { minOk = true; go(); }, 1800);
    const onLoad = () => { loadOk = true; go(); };
    if (!loadOk) window.addEventListener('load', onLoad);
    const cap = window.setTimeout(() => { minOk = true; loadOk = true; go(); }, 4000);
    return () => {
      window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(cap);
      window.removeEventListener('load', onLoad);
    };
  }, [reduce]);
  const revealed = phase === 'reveal';

  // ── Cycling city names ──
  const [cityIdx, setCityIdx] = useState(0);
  useEffect(() => {
    if (reduce || collections.length < 2) return;
    const t = window.setInterval(() => setCityIdx((i) => (i + 1) % collections.length), 2400);
    return () => window.clearInterval(t);
  }, [reduce, collections.length]);

  // ── Pointer + spin rAF ──
  //  · card 3D tilt: rotateX/rotateY ±5° (0.08)
  //  · figure parallax: translate ±8/±4px (0.08) — shifts the light layers
  //  · shaft spin: FAST during load, then hard-decelerates into a gentle sway
  //    on reveal (the dynamic bloom). Same angle drives hourglass + X.
  useEffect(() => {
    if (reduce) return;
    let tTX = 0, cTX = 0, tTY = 0, cTY = 0;
    let tFX = 0, cFX = 0, tFY = 0, cFY = 0;
    let tSway = -18, cSpin = 0;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      const ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
      tTY = nx * 5;
      tTX = -ny * 5;
      tFX = nx * 8;
      tFY = ny * 4;
      tSway = -18 + nx * 9;
    };
    const loop = () => {
      cTX += (tTX - cTX) * 0.08;
      cTY += (tTY - cTY) * 0.08;
      cFX += (tFX - cFX) * 0.08;
      cFY += (tFY - cFY) * 0.08;
      if (!revealedRef.current) {
        cSpin = (cSpin + 5.4) % 360; // fast rotor spin
      } else {
        let d = tSway - cSpin;
        d = ((d + 540) % 360) - 180;
        cSpin += d * 0.045; // hard decelerate into the sway
      }
      if (tiltRef.current) tiltRef.current.style.transform = `rotateX(${cTX}deg) rotateY(${cTY}deg)`;
      if (figureRef.current) figureRef.current.style.transform = `translate(${cFX}px, ${cFY}px)`;
      const rot = `rotate(${cSpin}deg)`;
      if (xRef.current) xRef.current.style.transform = rot;
      if (glassRef.current) glassRef.current.style.transform = rot;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); };
  }, [reduce]);

  // ── Scroll scrub ──
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

      {/* L2 — the shaft field. `beamScale` blooms from rotor size to full with
           an OVERSHOOT; inside, the hourglass (load) crossfades to the solid X
           (reveal), both spun by the rAF. A centre glow fills the middle. */}
      <div
        aria-hidden="true"
        className="absolute inset-[-30%] z-[3] pointer-events-none"
        style={{
          transform: reduce || revealed ? 'scale(1)' : `scale(${ROTOR})`,
          transformOrigin: 'center center',
          transition: `transform 1.3s ${BLOOM}`,
          willChange: 'transform',
        }}
      >
        {/* Solid X — reveal */}
        <div
          ref={xRef}
          className="absolute inset-0"
          style={{
            clipPath: X_CLIP,
            background: LIME,
            opacity: reduce ? 0.5 : revealed ? 0.5 : 0,
            transition: `opacity 0.9s ${EXPO} 0.15s`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        />
        {/* Hourglass — load */}
        <div
          ref={glassRef}
          className="absolute inset-[43%]"
          style={{
            clipPath: HOURGLASS,
            background: LIME,
            opacity: reduce ? 0 : revealed ? 0 : phase === 'blank' ? 0 : 1,
            transition: `opacity 0.55s ${EXPO}`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        />
      </div>

      {/* L2b — centre glow: fills the middle so the X has no hollow void */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[2] pointer-events-none"
        style={{
          background: `radial-gradient(38% 42% at 50% 50%, ${LIME_A(0.42)} 0%, ${LIME_A(0.12)} 45%, transparent 72%)`,
          opacity: reduce ? 1 : revealed ? 1 : 0,
          transition: `opacity 1.2s ${EXPO} 0.2s`,
        }}
      />

      {/* L5 — giant word; difference blend so the shaft reads THROUGH it */}
      <div
        ref={wordRef}
        aria-hidden="true"
        className="absolute inset-x-0 z-20 text-center font-serif uppercase whitespace-nowrap leading-none pointer-events-none overflow-hidden"
        style={{ bottom: '-1.5vw', fontSize: '13.5vw', letterSpacing: '-0.03em', mixBlendMode: revealed ? 'difference' : 'normal' }}
      >
        <span className="block overflow-hidden">
          <span
            className="block"
            style={{
              color: reduce || revealed ? OFF : CARD,
              transform: phase === 'blank' ? 'translateY(105%)' : 'translateY(0)',
              opacity: phase === 'blank' ? 0 : 1,
              transition: `transform 1.1s ${EXPO}, opacity 1.1s ${EXPO}, color 1.2s ${EXPO}`,
            }}
          >
            Visual&nbsp;Archive
          </span>
        </span>
      </div>

      {/* L3 — the CARD: scales OUT from centre, then real 3D tilt + scroll */}
      <div
        className="absolute inset-0 z-10"
        style={{
          transform: reduce || revealed ? 'scale(1)' : `scale(${ROTOR})`,
          opacity: reduce ? 1 : phase === 'blank' ? 0 : revealed ? 1 : 0,
          transformOrigin: 'center center',
          transition: `transform 1.25s ${BLOOM} 0.1s, opacity 0.8s ${EXPO} 0.1s`,
          willChange: 'transform',
        }}
      >
        <div className="absolute inset-0" style={{ perspective: '1500px' }}>
          <div ref={tiltRef} className="absolute inset-0 will-change-transform" style={{ transformStyle: 'preserve-3d' }}>
            <motion.div
              className="absolute inset-0 overflow-hidden will-change-transform"
              style={{
                scale: reduce ? 0.62 : scale,
                borderRadius: reduce ? 44 : radius,
                transformOrigin: 'center center',
                boxShadow: '0 48px 130px rgba(0, 0, 0, 0.55), 0 14px 38px rgba(0, 0, 0, 0.42)',
              }}
            >
              {/* FIGURE — oversized; parallaxes the light layers with the pointer */}
              <div ref={figureRef} className="absolute will-change-transform" style={{ inset: '-6%', background: CARD }}>
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ mixBlendMode: 'soft-light', background: 'radial-gradient(135% 115% at 50% 22%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 58%)' }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ mixBlendMode: 'overlay', background: `radial-gradient(90% 100% at 26% 68%, ${LIME_A(0.85)} 0%, ${LIME_A(0.12)} 42%, transparent 66%)` }}
                />

                <div
                  className="absolute top-[7%] inset-x-[8%] flex items-center justify-between font-ui uppercase"
                  style={{ color: 'rgba(244,244,237,0.55)', fontSize: 'clamp(10px, 0.9vw, 13px)', letterSpacing: '0.3em' }}
                >
                  <span>Journal Gallery</span>
                  <span style={{ color: LIME }}>
                    Nº {String((cityIdx % collections.length) + 1).padStart(2, '0')} / {String(places).padStart(2, '0')}
                  </span>
                </div>

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
                    style={{ color: 'rgba(244,244,237,0.85)', fontSize: 'clamp(10px, 0.95vw, 14px)', letterSpacing: '0.32em', animationDelay: '0.07s' }}
                  >
                    {String(city.frames).padStart(2, '0')} frames
                  </span>
                </div>

                <div
                  className="absolute bottom-[7%] inset-x-[8%] flex items-center justify-between font-ui uppercase"
                  style={{ color: 'rgba(244,244,237,0.42)', fontSize: 'clamp(9px, 0.8vw, 12px)', letterSpacing: '0.28em' }}
                >
                  <span>A record of light &amp; place</span>
                  <span>{frames} frames</span>
                </div>
              </div>

              <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" style={{ borderRadius: 'inherit' }} />
              {!reduce && <div ref={dimRef} className="absolute inset-0 pointer-events-none" style={{ background: '#282c20', opacity: 0 }} />}
            </motion.div>
          </div>
        </div>
      </div>
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
