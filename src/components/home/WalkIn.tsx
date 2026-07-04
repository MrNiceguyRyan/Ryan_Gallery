import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * WalkIn — the site's OPENING, rebuilt against the reference's real texture
 * mechanics (measured 1:1), graded to the site's olive world.
 *
 * THE THREE TEXTURE SECRETS (the reason it read flat before):
 *  1. Blend LAYERING, not a solid card. The card is olive base + a soft-light
 *     sheen + an overlay lime wash (colored light on material) + the city
 *     name in overlay. The giant word uses mix-blend difference against the
 *     shaft. (The nav wordmark already uses difference.)
 *  2. RADIAL-SOFTENED beam. The lime X is blurred and vignetted into the
 *     ground by a radial "beam-soft" layer, so its edges melt — not a hard
 *     clip-path slab.
 *  3. A layered ground, no grain — depth comes from the blends.
 *
 * Pointer follow (measured): the FIGURE inside the card does an in-plane micro
 * move — rotate ±3.1°, translateX ≈ angle × 4.4 (±13.6px), translateY ±5px,
 * spring damping 0.08. The card itself does NOT 3D-tilt. The background shaft
 * sways gently.
 *
 * Entrance: a small lime X spins at centre (loading rotor), then OPENS OUT to
 * the full background shaft while the card scales out from a point. The card
 * is a full-viewport WINDOW scaled down (crisp) so at rest it reads as a
 * centred card in the shaft field; scroll grows it to full and dims to olive.
 */

const GROUND = '#20241a';
const GROUND_RGB = '32, 36, 26';
const CARD = '#30352a';
const OFF = '#F4F4ED';
const LIME = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const LIME_A = (a: number) => `rgba(var(--accent-r), var(--accent-g), var(--accent-b), ${a})`;
const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';
const ROTOR = 0.045;

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

  // ── Cycling city names ──
  const [cityIdx, setCityIdx] = useState(0);
  useEffect(() => {
    if (reduce || collections.length < 2) return;
    const t = window.setInterval(() => setCityIdx((i) => (i + 1) % collections.length), 2400);
    return () => window.clearInterval(t);
  }, [reduce, collections.length]);

  // ── Pointer follow — ONE rAF (measured values, spring 0.08). The FIGURE
  //    does the in-plane micro move (no card 3D). The shaft sways / spins. ──
  useEffect(() => {
    if (reduce) return;
    let tR = 0, cR = 0, tX = 0, cX = 0, tY = 0, cY = 0;
    let tSway = -20, cAim = -20;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      const ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
      tR = nx * 3.1;      // ±3.1° (measured)
      tX = nx * 13.6;     // tx ≈ angle × 4.4
      tY = ny * 5;        // ty ±5px
      tSway = -20 + nx * 9; // background shaft: gentle sway around its base
    };
    const loop = () => {
      cR += (tR - cR) * 0.08;
      cX += (tX - cX) * 0.08;
      cY += (tY - cY) * 0.08;
      if (!revealedRef.current) {
        cAim = (cAim + 2.6) % 360; // rotor spin during load
      } else {
        let d = tSway - cAim;
        d = ((d + 540) % 360) - 180;
        cAim += d * 0.05; // decelerate into the gentle sway
      }
      if (figureRef.current) figureRef.current.style.transform = `translate(${cX}px, ${cY}px) rotate(${cR}deg)`;
      if (beamRef.current) beamRef.current.style.transform = `rotate(${cAim}deg)`;
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

      {/* L2 — the shaft: a small spinning rotor during load, opening OUT to the
           full background X on reveal. */}
      <div
        aria-hidden="true"
        className="absolute inset-[-30%] z-[3] pointer-events-none"
        style={{
          transform: reduce || revealed ? 'scale(1)' : `scale(${ROTOR})`,
          transformOrigin: 'center center',
          opacity: reduce ? 1 : phase === 'blank' ? 0 : revealed ? 1 : 0.9,
          transition: `transform 1.15s ${EXPO}, opacity 1.15s ${EXPO}`,
          willChange: 'transform',
        }}
      >
        <div
          ref={beamRef}
          className="absolute inset-0"
          style={{
            clipPath: `polygon(${X_CLIP})`,
            // Solid lime, but blurred so its edges are soft light, not a slab.
            background: LIME,
            filter: 'blur(22px)',
            opacity: revealed ? 0.5 : 0.9,
            transition: `opacity 1.15s ${EXPO}`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        />
      </div>

      {/* L2b — beam-soft: radial vignette to the ground colour, melting the
           shaft's outer reach into the olive (secret #2). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[4] pointer-events-none"
        style={{
          background: `radial-gradient(120% 92% at 50% 42%, rgba(${GROUND_RGB},0) 0%, rgba(${GROUND_RGB},0.35) 52%, rgba(${GROUND_RGB},0.94) 100%)`,
          opacity: reduce ? 1 : revealed ? 1 : 0,
          transition: `opacity 1.2s ${EXPO}`,
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

      {/* L3 — the CARD: scales OUT from centre; a flat window (no 3D tilt);
           the FIGURE inside does the pointer micro-move + carries the texture. */}
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
        <motion.div
          className="absolute inset-0 overflow-hidden will-change-transform"
          style={{
            scale: reduce ? 0.62 : scale,
            borderRadius: reduce ? 44 : radius,
            transformOrigin: 'center center',
            boxShadow: '0 46px 120px rgba(0, 0, 0, 0.5), 0 12px 34px rgba(0, 0, 0, 0.4)',
          }}
        >
          {/* FIGURE — oversized; pointer micro-move; holds the material layers */}
          <div ref={figureRef} className="absolute will-change-transform" style={{ inset: '-6%', background: CARD }}>
            {/* Texture secret #1a — a soft-light top sheen (light on material) */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                mixBlendMode: 'soft-light',
                background: 'radial-gradient(135% 115% at 50% 22%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 58%)',
              }}
            />
            {/* Texture secret #1b — an overlay lime wash raking from one side */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                mixBlendMode: 'overlay',
                background: `radial-gradient(90% 100% at 26% 68%, ${LIME_A(0.85)} 0%, ${LIME_A(0.12)} 42%, transparent 66%)`,
              }}
            />

            {/* Chrome */}
            <div
              className="absolute top-[7%] inset-x-[8%] flex items-center justify-between font-ui uppercase"
              style={{ color: 'rgba(244,244,237,0.55)', fontSize: 'clamp(10px, 0.9vw, 13px)', letterSpacing: '0.3em' }}
            >
              <span>Journal Gallery</span>
              <span style={{ color: LIME }}>
                Nº {String((cityIdx % collections.length) + 1).padStart(2, '0')} / {String(places).padStart(2, '0')}
              </span>
            </div>

            {/* City name — kept legible (solid type at overlay goes muddy on a
                 dark card; the texture is carried by the sheen + wash layers) */}
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
