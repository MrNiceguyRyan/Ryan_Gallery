import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * WalkIn — the site's OPENING.
 *
 *  BEAT 0 — intro (the anchor): a LIGHT paper field; the giant "VISUAL ARCHIVE"
 *    rises from the bottom, tone-on-tone (barely-there), as the sole focus — a
 *    work developing out of a bright field, NOT a black loading screen. A small
 *    ink hourglass turns quietly as the loading tell. Nav pills stay hidden.
 *  BEAT 1 — bloom (reveal): once resources are ready (min dwell), the field
 *    darkens to olive in one breath while the hourglass OPENS OUT into the solid
 *    lime X (overshoot bloom + spin decelerate), the card pops from a point in
 *    real 3D, the nav slides down, and the card's lines wipe up staggered.
 *  Then scroll grows the card to full and dims into the archive.
 *
 * Pointer: card 3D tilt ±5°, inner figure parallaxes the material light layers,
 * the shaft sways — all spring-damped in one rAF.
 */

const GROUND = '#20241a';
const CARD = '#30352a';
const OFF = '#F4F4ED';
const PAPER = '#EDEAE3'; // opening light field (before the dark sunburst blooms)
const PAPER_WORD = '#E3DED5'; // tone-on-tone giant word on the paper field
const LIME = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const LIME_A = (a: number) => `rgba(var(--accent-r), var(--accent-g), var(--accent-b), ${a})`;
const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)'; // house expo-out — the "liquid reach" curve for the beams
const SILK = 'cubic-bezier(0.19, 1, 0.22, 1)'; // card's pure long-tail glide, no bounce
const CARD_IN = 0.4; // card grows from ~2/5 out of the X centre (not a pinpoint punch)

const WORD_GHOST = '#333a24'; // giant backdrop wordmark — tone-on-tone lift off the olive field

export default function WalkIn({
  collections,
  places,
}: {
  collections: { name: string; frames: number }[];
  places: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0); // scroll-scrub progress — damps the tilt to 0 as the card grows
  const reduce = useReducedMotion();

  // ── Load sequence: intro (paper + word rising) → reveal (bloom) ──
  const [phase, setPhase] = useState<'intro' | 'reveal'>('intro');
  const [raised, setRaised] = useState(false); // giant word rise, from mount
  const revealedRef = useRef(false);
  useEffect(() => {
    if (reduce) {
      setRaised(true); setPhase('reveal'); revealedRef.current = true;
      document.body.classList.add('walkin-in');
      return;
    }
    const rf = requestAnimationFrame(() => setRaised(true));
    let minOk = false;
    let loadOk = document.readyState === 'complete';
    let fired = false;
    const go = () => {
      if (fired || !minOk || !loadOk) return;
      fired = true;
      revealedRef.current = true;
      setPhase('reveal');
      document.body.classList.add('walkin-in');
    };
    // word rises 0.9s, then ~0.15s breath, then bloom (min floor; waits longer
    // only if resources aren't ready — the reference holds for load too)
    const t = window.setTimeout(() => { minOk = true; go(); }, 1050);
    const onLoad = () => { loadOk = true; go(); };
    if (!loadOk) window.addEventListener('load', onLoad);
    const cap = window.setTimeout(() => { minOk = true; loadOk = true; go(); }, 4000);
    return () => {
      cancelAnimationFrame(rf); window.clearTimeout(t); window.clearTimeout(cap);
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

  // ── Pointer parallax rAF — card 3D tilt + inner-figure drift (beam is static) ──
  useEffect(() => {
    if (reduce) return;
    let tTX = 0, cTX = 0, tTY = 0, cTY = 0;
    let tFX = 0, cFX = 0, tFY = 0, cFY = 0;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      const ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
      tTY = nx * 5; tTX = -ny * 5;
      tFX = nx * 8; tFY = ny * 4;
    };
    let idle = false; // true once the last write was the settled/identity state
    const loop = () => {
      cTX += (tTX - cTX) * 0.08; cTY += (tTY - cTY) * 0.08;
      cFX += (tFX - cFX) * 0.08; cFY += (tFY - cFY) * 0.08;
      // Fade the 3D tilt out as the card grows to full page — a tilted plane at
      // full-bleed reads as a skewed page with dark wedges at the edges. Fully
      // flat by ~40% of the scrub.
      const damp = Math.max(0, 1 - progressRef.current * 2.5);
      // Skip the style writes once settled (pointer still / opener scrolled
      // past). The loop keeps ticking (4 float lerps ≈ free) but stops touching
      // the DOM, so an idle hero costs the main thread nothing while Lenis
      // scrolls. One final write lands the settled state before going idle.
      const settled =
        damp === 0 ||
        (Math.abs(tTX - cTX) + Math.abs(tTY - cTY) + Math.abs(tFX - cFX) + Math.abs(tFY - cFY)) < 0.01;
      if (!settled || !idle) {
        if (tiltRef.current) tiltRef.current.style.transform = `rotateX(${cTX * damp}deg) rotateY(${cTY * damp}deg)`;
        if (figureRef.current) figureRef.current.style.transform = `translate(${cFX * damp}px, ${cFY * damp}px)`;
        idle = settled;
      }
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); };
  }, [reduce]);

  // ── Scroll scrub ──
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const scale = useTransform(scrollYProgress, [0, 0.8], [0.54, 1], { clamp: true });
  const radius = useTransform(scrollYProgress, [0, 0.6], [44, 0]);

  const wordRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduce) return;
    const seg = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    const apply = (v: number) => {
      progressRef.current = v;
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

  /* Line-mask reveal — overflow-clip line, inner rises 112%→0 on reveal, tight
   * ~0.06s stagger (the reference's crisp roll-up). */
  const lineMask = (content: React.ReactNode, delay: number) => (
    <span className="block overflow-hidden w-full">
      <span
        className="block w-full"
        style={{
          transform: reduce || revealed ? 'translateY(0%)' : 'translateY(112%)',
          transition: `transform 0.95s ${EXPO} ${delay}s`,
          willChange: 'transform',
        }}
      >
        {content}
      </span>
    </span>
  );

  const stage = (
    <>
      {/* L1 — the field: PAPER during intro, darkens to olive in the bloom */}
      <div
        className="absolute inset-0"
        style={{ background: reduce || revealed ? GROUND : PAPER, transition: `background-color 1.25s ${EXPO}` }}
      />

      {/* Giant ghosted wordmark — the backdrop. Huge tone-on-tone type filling
           the viewport BEHIND the card (peeks out top & bottom). Paper-ghost
           during load → olive-ghost as the field darkens; fades + drifts up once
           on reveal, then drifts down + fades on scroll (wordRef, scroll-scrub). */}
      <div
        ref={wordRef}
        aria-hidden="true"
        className="absolute inset-0 z-[2] flex flex-col items-center justify-center pointer-events-none overflow-hidden select-none"
      >
        <div
          className="font-serif uppercase text-center tracking-[-0.035em]"
          style={{
            fontSize: '21vw',
            lineHeight: 0.78,
            color: reduce || revealed ? WORD_GHOST : PAPER_WORD,
            opacity: reduce || raised ? 1 : 0,
            transform: reduce || raised ? 'translateY(0)' : 'translateY(4%)',
            transition: `opacity 1.0s ${EXPO}, transform 1.1s ${EXPO}, color 0.9s ${EXPO}`,
          }}
        >
          <span className="block">Visual</span>
          <span className="block italic" style={{ letterSpacing: '-0.02em' }}>Archive</span>
        </div>
      </div>

      {/* L3 — the CARD: second beat. The X light-bars pour out FIRST (liquid);
           only once they're mostly extended does the card develop out of the X
           centre — a slow no-bounce glide + blur→sharp, like a print coming up
           in the bath. One after the other, never at once. */}
      <div
        className="absolute inset-0 z-10"
        style={{
          transform: reduce || revealed ? 'scale(1)' : `scale(${CARD_IN})`,
          opacity: reduce || revealed ? 1 : 0,
          filter: reduce || revealed ? 'blur(0px)' : 'blur(14px)',
          transformOrigin: 'center center',
          transition: `transform 1.8s ${SILK} 0.95s, opacity 1.1s ${EXPO} 0.95s, filter 1.5s ${EXPO} 0.95s`,
          willChange: 'transform',
        }}
      >
        <div className="absolute inset-0" style={{ perspective: '1500px' }}>
          <div ref={tiltRef} className="absolute inset-0 will-change-transform" style={{ transformStyle: 'preserve-3d' }}>
            <motion.div
              className="absolute inset-0 overflow-hidden will-change-transform"
              style={{
                scale: reduce ? 0.56 : scale,
                borderRadius: reduce ? 44 : radius,
                transformOrigin: 'center center',
                boxShadow: '0 48px 130px rgba(0, 0, 0, 0.55), 0 14px 38px rgba(0, 0, 0, 0.42)',
              }}
            >
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
                  className="absolute top-[7%] inset-x-[8%] font-ui uppercase"
                  style={{ color: 'rgba(244,244,237,0.55)', fontSize: 'clamp(10px, 0.9vw, 13px)', letterSpacing: '0.3em' }}
                >
                  {lineMask(
                    <span className="flex items-center justify-between w-full">
                      <span>Journal Gallery</span>
                      <span style={{ color: LIME }}>
                        Nº {String((cityIdx % collections.length) + 1).padStart(2, '0')} / {String(places).padStart(2, '0')}
                      </span>
                    </span>,
                    1.55,
                  )}
                </div>

                {/* Centre — a photo-book cover lockup: kicker, serif city hero,
                     and an italic-serif caption ruled on both sides. No photos. */}
                <div className="absolute inset-0 flex flex-col items-center justify-center px-[9%]">
                  {lineMask(
                    <span
                      className="flex items-center justify-center gap-2 font-ui uppercase"
                      style={{ color: LIME, fontSize: 'clamp(9px, 0.78vw, 12px)', letterSpacing: '0.42em' }}
                    >
                      <span className="inline-block rounded-full" style={{ width: '0.42em', height: '0.42em', background: LIME }} />
                      Selected Frames
                    </span>,
                    1.58,
                  )}
                  {lineMask(
                    <span
                      key={reduce ? 'static' : cityIdx}
                      className={`block font-serif uppercase text-center leading-[0.84] tracking-[-0.038em] mt-[2%] ${reduce ? '' : 'walkin-city'}`}
                      style={{ color: OFF, fontSize: 'clamp(42px, 7.6vw, 128px)' }}
                    >
                      {city.name}
                    </span>,
                    1.64,
                  )}
                  {lineMask(
                    <span
                      key={reduce ? 'static-f' : `f${cityIdx}`}
                      className={`flex items-center justify-center gap-3 mt-[3%] ${reduce ? '' : 'walkin-city'}`}
                      style={{ animationDelay: '0.07s' }}
                    >
                      <span className="block h-px w-7 md:w-9" style={{ background: 'rgba(244,244,237,0.22)' }} />
                      <span
                        className="font-serif italic whitespace-nowrap lowercase"
                        style={{ color: 'rgba(244,244,237,0.72)', fontSize: 'clamp(11px, 1.05vw, 16px)', letterSpacing: '0.005em' }}
                      >
                        {city.frames} frames · since 2023
                      </span>
                      <span className="block h-px w-7 md:w-9" style={{ background: 'rgba(244,244,237,0.22)' }} />
                    </span>,
                    1.70,
                  )}
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
