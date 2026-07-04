import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * WalkIn — the site's OPENING. The entrance is an OPEN-OUT, not a curtain:
 *
 *  · blank (0-0.3s): bare olive ground.
 *  · load: the giant word rises (tone-on-tone) while a small lime X spins at
 *    centre — the loading rotor. It keeps turning until window.load AND a
 *    minimum dwell (safety-capped).
 *  · reveal: the rotor OPENS OUT — the very same X scales up to full screen
 *    while its spin decelerates into aiming at the pointer, becoming the
 *    background light shaft; the CARD scales out from centre (silky, from a
 *    point, not a pop); the word brightens to off-white.
 *
 * The card is a full-viewport rounded WINDOW (framer scale 0.6→1 on scroll,
 * downscale-only = crisp) in real 3D (perspective tilt toward the pointer)
 * revealing an oversized figure that parallaxes. Pointer motion runs in ONE
 * rAF (lerp damping). At the end of the walk the card dims to the page olive.
 */

const GROUND = '#20241a';
const CARD = '#30352a';
const OFF = '#F4F4ED';
const LIME = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';
const ROTOR = 0.045; // the X scaled down to a small centre rotor during load

/* Detailed irregular X — four uneven main wedges + four thin splinter rays. */
const X_CLIP = [
  '50% 50%', '100% 18%', '100% 30%', '50% 50%', '100% 7%', '100% 10%',
  '50% 50%', '96% 100%', '82% 100%', '50% 50%', '71% 100%', '68% 100%',
  '50% 50%', '0% 84%', '0% 72%', '50% 50%', '0% 94%', '0% 91%',
  '50% 50%', '4% 0%', '17% 0%', '50% 50%', '29% 0%', '32% 0%',
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

  // ── Cycling city names inside the card ──
  const [cityIdx, setCityIdx] = useState(0);
  useEffect(() => {
    if (reduce || collections.length < 2) return;
    const t = window.setInterval(() => setCityIdx((i) => (i + 1) % collections.length), 2400);
    return () => window.clearInterval(t);
  }, [reduce, collections.length]);

  // ── Pointer follow — ONE rAF: card tilt, figure parallax, and the X's
  //    spin→aim. During load the X spins; on reveal the spin decelerates into
  //    aiming at the pointer (damped, shortest path). ──
  useEffect(() => {
    if (reduce) return;
    let tTX = 0, cTX = 0, tTY = 0, cTY = 0;
    let tFX = 0, cFX = 0, tFY = 0, cFY = 0;
    let tAim = 0, cAim = 0;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      const ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
      tTY = nx * 5;
      tTX = -ny * 5;
      tFX = nx * 10;
      tFY = ny * 5;
      tAim = (Math.atan2(e.clientY - window.innerHeight / 2, e.clientX - window.innerWidth / 2) * 180) / Math.PI;
    };
    const loop = () => {
      cTX += (tTX - cTX) * 0.08;
      cTY += (tTY - cTY) * 0.08;
      cFX += (tFX - cFX) * 0.08;
      cFY += (tFY - cFY) * 0.08;
      if (!revealedRef.current) {
        cAim = (cAim + 2.6) % 360; // rotor spin
      } else {
        let d = tAim - cAim;
        d = ((d + 540) % 360) - 180;
        cAim += d * 0.045; // decelerate into aim
      }
      if (tiltRef.current) tiltRef.current.style.transform = `rotateX(${cTX}deg) rotateY(${cTY}deg)`;
      if (figureRef.current) figureRef.current.style.transform = `translate(${cFX}px, ${cFY}px)`;
      if (beamRef.current) beamRef.current.style.transform = `rotate(${cAim}deg)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); };
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

      {/* L2 — the X: a small spinning rotor during load, opening OUT to the
           full background shaft on reveal. `beamScale` grows it (CSS
           transition); `beamRef` (inner) rotates via rAF. */}
      <div
        aria-hidden="true"
        className="absolute inset-[-30%] z-[5] pointer-events-none"
        style={{
          transform: reduce || revealed ? 'scale(1)' : `scale(${ROTOR})`,
          transformOrigin: 'center center',
          opacity: reduce ? 1 : phase === 'blank' ? 0 : revealed ? 0.32 : 0.85,
          transition: `transform 1.15s ${EXPO}, opacity 1.15s ${EXPO}`,
          willChange: 'transform',
        }}
      >
        <div
          ref={beamRef}
          className="absolute inset-0"
          style={{
            clipPath: `polygon(${X_CLIP})`,
            background: LIME,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        />
      </div>

      {/* L4 — giant word (tone-on-tone during load → off-white on reveal) */}
      <div
        ref={wordRef}
        aria-hidden="true"
        className="absolute inset-x-0 z-20 text-center font-serif uppercase whitespace-nowrap leading-none pointer-events-none overflow-hidden"
        style={{ bottom: '-1.5vw', fontSize: '13.5vw', letterSpacing: '-0.03em' }}
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

      {/* L3 — the CARD: scales OUT from centre on reveal (entrance), then 3D
           tilt + scroll scale. */}
      <div
        className="absolute inset-0 z-10"
        style={{
          transform: reduce || revealed ? 'scale(1)' : `scale(${ROTOR})`,
          opacity: reduce ? 1 : phase === 'blank' ? 0 : revealed ? 1 : 0,
          transformOrigin: 'center center',
          transition: `transform 1.2s ${EXPO} 0.12s, opacity 0.8s ${EXPO} 0.12s`,
          willChange: 'transform',
        }}
      >
        <div className="absolute inset-0" style={{ perspective: '1400px' }}>
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
              <div ref={figureRef} className="absolute will-change-transform" style={{ inset: '-5%', background: CARD }}>
                <div
                  className="absolute top-[7%] inset-x-[8%] flex items-center justify-between font-ui uppercase"
                  style={{ color: 'rgba(244,244,237,0.5)', fontSize: 'clamp(10px, 0.9vw, 13px)', letterSpacing: '0.3em' }}
                >
                  <span>Journal Gallery</span>
                  <span style={{ color: LIME }}>
                    Nº {String((cityIdx % collections.length) + 1).padStart(2, '0')} / {String(places).padStart(2, '0')}
                  </span>
                </div>

                <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ mixBlendMode: 'overlay' }}>
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

                <div
                  className="absolute bottom-[7%] inset-x-[8%] flex items-center justify-between font-ui uppercase"
                  style={{ color: 'rgba(244,244,237,0.4)', fontSize: 'clamp(9px, 0.8vw, 12px)', letterSpacing: '0.28em' }}
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
