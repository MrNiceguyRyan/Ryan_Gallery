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
 *    lime X (overshoot bloom + spin decelerate), the card develops from the X,
 *    and the nav slides down.
 *  Then scroll grows the card to full and dims into the archive.
 *
 * Pointer: the card tilts gently while the inner material drifts. Tilt is
 * damped away well before the card reaches the viewport edges.
 */

const GROUND = '#282c20';
const CARD = '#30352a';
const OFF = '#F4F4ED';
const PAPER = '#EDEAE3'; // opening light field (before the dark sunburst blooms)
const PAPER_WORD = '#E3DED5'; // tone-on-tone giant word on the paper field
const LIME = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const LIME_A = (a: number) => `rgba(var(--accent-r), var(--accent-g), var(--accent-b), ${a})`;
const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)'; // house expo-out — the "liquid reach" curve for the beams
const SILK = 'cubic-bezier(0.19, 1, 0.22, 1)'; // card's pure long-tail glide, no bounce
const CARD_IN = 0.4;
const PAGE_SURFACE = 'radial-gradient(125% 125% at 50% 48%, transparent 56%, rgba(9, 11, 6, 0.34) 100%), #282c20';

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
  const shadowRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const safetyRef = useRef<HTMLDivElement>(null);
  const safetyDimRef = useRef<HTMLDivElement>(null);
  const ambientRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0); // scroll-scrub progress — damps the card tilt
  const reduce = useReducedMotion();
  const [mobileViewport, setMobileViewport] = useState(false);
  const [stageVisible, setStageVisible] = useState(true);
  const totalFrames = collections.reduce((sum, collection) => sum + collection.frames, 0);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const sync = () => setMobileViewport(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setStageVisible(entry.isIntersecting),
      { rootMargin: '120px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // ── Load sequence: intro (paper + word rising) → reveal (bloom) ──
  const [phase, setPhase] = useState<'intro' | 'reveal'>('intro');
  const [raised, setRaised] = useState(false); // giant word rise, from mount
  const [entranceSettled, setEntranceSettled] = useState(false);
  const revealedRef = useRef(false);
  const instantRevealRef = useRef(false);
  useEffect(() => {
    let fired = false;
    const reveal = () => {
      if (fired || revealedRef.current) return;
      fired = true;
      revealedRef.current = true;
      setRaised(true);
      setPhase('reveal');
      document.body.classList.add('walkin-in');
      try {
        window.sessionStorage.setItem('opening-shown', '1');
      } catch {
        // Storage may be unavailable in privacy-restricted browsing contexts.
      }
      window.dispatchEvent(new CustomEvent('walkin:reveal'));
    };

    let seen = false;
    try {
      seen = window.sessionStorage.getItem('opening-shown') === '1';
    } catch {
      // The opening still works normally when session storage is unavailable.
    }
    // Local-only review hook: production still plays the opener once per tab,
    // while `?replay=opening` lets the design timing be inspected repeatedly.
    const forceReplay = import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get('replay') === 'opening';
    if (reduce || (seen && !forceReplay)) {
      instantRevealRef.current = true;
      reveal();
      return;
    }

    const rf = requestAnimationFrame(() => setRaised(true));
    let minOk = false;
    let loadOk = document.readyState === 'complete';
    const go = () => {
      if (fired || !minOk || !loadOk) return;
      reveal();
    };
    // Keep a brief paper-field beat, but hand over sooner. The visual order is
    // unchanged; this only removes the extra wait the opener had accumulated.
    const t = window.setTimeout(() => { minOk = true; go(); }, 900);
    const onLoad = () => { loadOk = true; go(); };
    if (!loadOk) window.addEventListener('load', onLoad);
    const cap = window.setTimeout(() => { minOk = true; loadOk = true; go(); }, 3200);
    return () => {
      cancelAnimationFrame(rf); window.clearTimeout(t); window.clearTimeout(cap);
      window.removeEventListener('load', onLoad);
    };
  }, [reduce]);
  const revealed = phase === 'reveal';
  const instantReveal = !!reduce || instantRevealRef.current;

  // The entrance is the only moment that benefits from pre-promoting the
  // full-screen plane. Release that layer once its transform/filter has settled
  // so the later live atlas does not compete with an invisible GPU surface.
  useEffect(() => {
    if (!revealed) return;
    if (instantReveal) {
      setEntranceSettled(true);
      return;
    }
    const timeout = window.setTimeout(() => setEntranceSettled(true), 2450);
    return () => window.clearTimeout(timeout);
  }, [instantReveal, revealed]);

  // ── Scroll scrub ──
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  // Mobile begins closer to the viewer so the card stays legible without
  // becoming edge-to-edge; both layouts retain the full-bleed overscan guard.
  const scale = useTransform(
    scrollYProgress,
    [0, 0.14, 0.48, 0.72, 0.91],
    mobileViewport
      ? [0.70, 0.72, 0.90, 0.985, 1.025]
      : [0.58, 0.60, 0.84, 0.985, 1.025],
    { clamp: true },
  );
  const radius = useTransform(scrollYProgress, [0, 0.16, 0.48, 0.73], [32, 30, 16, 0]);

  // ── Pointer parallax rAF — calm card tilt + inner-light drift ──
  useEffect(() => {
    if (reduce || !stageVisible) return;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!finePointer.matches) return;

    let tTX = 0, cTX = 0, tTY = 0, cTY = 0;
    let tFX = 0, cFX = 0, tFY = 0, cFY = 0;
    let raf = 0;
    let lastDamp = -1;

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onMove = (e: MouseEvent) => {
      const nx = Math.max(-1, Math.min(1, (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2)));
      const ny = Math.max(-1, Math.min(1, (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2)));
      tTY = nx * 3.2; tTX = -ny * 3.2;
      tFX = nx * 5; tFY = ny * 2.5;
      schedule();
    };
    const resetPointer = () => {
      tTX = 0; tTY = 0; tFX = 0; tFY = 0;
      schedule();
    };
    const loop = () => {
      raf = 0;
      cTX += (tTX - cTX) * 0.08; cTY += (tTY - cTY) * 0.08;
      cFX += (tFX - cFX) * 0.08; cFY += (tFY - cFY) * 0.08;
      // A tilted plane at full bleed exposes dark wedges. Flatten it by 34%
      // scroll progress, well before the card touches the viewport edges.
      const damp = Math.max(0, 1 - progressRef.current / 0.34);
      const settled =
        damp === 0 ||
        (Math.abs(tTX - cTX) + Math.abs(tTY - cTY) + Math.abs(tFX - cFX) + Math.abs(tFY - cFY)) < 0.01;
      const dampChanged = Math.abs(damp - lastDamp) > 0.0001;
      if (!settled || dampChanged) {
        if (tiltRef.current) {
          tiltRef.current.style.transform = damp === 0
            ? 'none'
            : `rotateX(${cTX * damp}deg) rotateY(${cTY * damp}deg)`;
        }
        if (figureRef.current) {
          figureRef.current.style.transform = damp === 0
            ? 'none'
            : `translate(${cFX * damp}px, ${cFY * damp}px)`;
        }
        lastDamp = damp;
      }
      // Stop requesting frames once the spring has settled. Pointer and scroll
      // activity schedule the next short burst, so idle pages do no rAF work.
      if (!settled) raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('blur', resetPointer);
    window.addEventListener('resize', resetPointer, { passive: true });
    document.documentElement.addEventListener('mouseleave', resetPointer);
    const unsubscribeScroll = scrollYProgress.on('change', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      unsubscribeScroll();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('blur', resetPointer);
      window.removeEventListener('resize', resetPointer);
      document.documentElement.removeEventListener('mouseleave', resetPointer);
    };
  }, [reduce, scrollYProgress, stageVisible]);

  const wordRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduce) return;
    const seg = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    const apply = (v: number) => {
      progressRef.current = v;
      if (wordRef.current) {
        wordRef.current.style.opacity = String(1 - seg(v, 0.04, 0.32));
        wordRef.current.style.transform = `translateY(${seg(v, 0, 0.8) * 68}px)`;
      }
      // Let the card's lime/ivory light spill into the surrounding page before
      // it reaches the edges. The card then feels grown from the same field,
      // rather than a bright rectangle floating over a separate background.
      if (ambientRef.current) {
        const ambientTravel = seg(v, 0.08, 0.90);
        ambientRef.current.style.opacity = revealed
          ? String(0.28 + seg(v, 0, 0.86) * 0.42)
          : '0';
        ambientRef.current.style.transform = `translate3d(0, ${ambientTravel * -14}px, 0) scale(${1.02 + ambientTravel * 0.08})`;
        ambientRef.current.style.willChange = v < 0.90 && stageVisible
          ? 'transform, opacity'
          : 'auto';
      }
      if (contentRef.current) {
        // Keep the cover's final identifying marks present until the archive
        // index is already entering. Their shared overlap removes the empty
        // olive beat that previously sat between two independent timelines.
        const contentExit = seg(v, 0.40, 0.76);
        contentRef.current.style.opacity = String(1 - contentExit);
        contentRef.current.style.transform = `translate3d(0, ${contentExit * -26}px, 0)`;
        contentRef.current.style.willChange = contentExit > 0 && contentExit < 1
          ? 'transform, opacity'
          : 'auto';
      }
      // The cover is a transition aperture, not a second content surface. Let
      // the same material rise behind it before its edges reach the viewport,
      // so the object becomes the page without introducing a new image layer.
      if (safetyRef.current) safetyRef.current.style.opacity = String(seg(v, 0.28, 0.66));
      if (safetyDimRef.current) safetyDimRef.current.style.opacity = String(seg(v, 0.72, 0.995));
      if (v >= 0.34) {
        if (tiltRef.current) tiltRef.current.style.transform = 'none';
        if (figureRef.current) figureRef.current.style.transform = 'none';
      }
      if (tiltRef.current) tiltRef.current.style.willChange = v < 0.34 ? 'transform' : 'auto';
      if (figureRef.current) figureRef.current.style.willChange = v < 0.34 ? 'transform' : 'auto';
      if (cardRef.current) cardRef.current.style.willChange = v < 0.94 && stageVisible ? 'transform' : 'auto';
      // Fade a pre-rasterised shadow layer with opacity instead of rebuilding a
      // 150px box-shadow on every scroll sample.
      if (shadowRef.current) {
        shadowRef.current.style.opacity = String(1 - seg(v, 0.22, 0.64));
        shadowRef.current.style.visibility = v >= 0.64 ? 'hidden' : 'visible';
        shadowRef.current.style.willChange = v < 0.64 && stageVisible ? 'transform, opacity' : 'auto';
      }
      if (frameRef.current) {
        frameRef.current.style.opacity = String(1 - seg(v, 0.24, 0.68));
        frameRef.current.style.visibility = v >= 0.68 ? 'hidden' : 'visible';
      }
      if (dimRef.current) dimRef.current.style.opacity = String(seg(v, 0.78, 0.995));
    };
    apply(scrollYProgress.get());
    return scrollYProgress.on('change', apply);
  }, [reduce, revealed, scrollYProgress, stageVisible]);

  const lineMask = (content: React.ReactNode, delay: number) => (
    <span className="block w-full overflow-hidden">
      <span
        className="block w-full"
        style={{
          transform: reduce || revealed ? 'translateY(0%)' : 'translateY(112%)',
          transition: instantReveal ? 'none' : `transform 0.80s ${EXPO} ${delay}s`,
        }}
      >
        {content}
      </span>
    </span>
  );

  const stage = (
    <>
      <p className="sr-only">
        Ryan Xu visual archive, {places} places and {totalFrames} photographs, 2023 to 2026.
      </p>
      {/* L1 — the field: PAPER during intro, darkens to olive in the bloom */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: reduce || revealed ? GROUND : PAPER, transition: instantReveal ? 'none' : `background-color 1.05s ${EXPO}` }}
      />

      {/* A quiet, page-wide echo of the card's light. It softens the initial
           object/background split without adding another frame or panel. */}
      <div
        ref={ambientRef}
        data-walkin-ambient
        aria-hidden="true"
        className="absolute -inset-[8%] z-[1] pointer-events-none"
        style={{
          opacity: reduce || revealed ? 0.30 : 0,
          transform: 'scale(1.02)',
          transformOrigin: 'center center',
          background: `
            radial-gradient(72% 82% at 28% 61%, ${LIME_A(0.105)} 0%, ${LIME_A(0.032)} 43%, transparent 73%),
            radial-gradient(76% 68% at 68% 24%, rgba(244, 244, 237, 0.055) 0%, rgba(244, 244, 237, 0.012) 48%, transparent 76%)
          `,
          transition: instantReveal ? 'none' : `opacity 0.35s ${EXPO}`,
        }}
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
        <div className="md:-translate-x-[2.5vw] md:-translate-y-[1vh]">
          <div
            className="font-serif uppercase text-center tracking-[-0.035em]"
            style={{
              fontSize: '21vw',
              lineHeight: 0.78,
              color: reduce || revealed ? WORD_GHOST : PAPER_WORD,
              opacity: reduce || raised ? 1 : 0,
              transform: reduce || raised ? 'translateY(0)' : 'translateY(4%)',
              transition: instantReveal ? 'none' : `opacity 0.86s ${EXPO}, transform 0.95s ${EXPO}, color 0.78s ${EXPO}`,
            }}
          >
            <span className="block">Visual</span>
            <span className="block italic" style={{ letterSpacing: '-0.02em' }}>Archive</span>
          </div>
        </div>
      </div>

      {/* L3 — the coordinated olive card. It develops from the centre after the
           X bloom, then grows into the page as the visitor scrolls. */}
      <div
        className="absolute inset-0 z-10"
        style={{
          transform: reduce || revealed ? 'scale(1)' : `scale(${CARD_IN})`,
          opacity: reduce || revealed ? 1 : 0,
          filter: reduce || revealed ? 'blur(0px)' : `blur(${mobileViewport ? 3 : 4}px)`,
          transformOrigin: 'center center',
          transition: instantReveal ? 'none' : `transform 1.55s ${SILK} 0.78s, opacity 0.92s ${EXPO} 0.78s, filter 1.25s ${EXPO} 0.78s`,
          willChange: entranceSettled ? 'auto' : 'transform, opacity, filter',
        }}
      >
        <div className="absolute inset-0" style={{ perspective: '1500px' }}>
          <div
            ref={safetyRef}
            aria-hidden="true"
            data-walkin-safety
            className="absolute -inset-3 pointer-events-none overflow-hidden opacity-0"
            style={{ background: CARD }}
          >
            <div
              className="absolute inset-0"
              style={{
                mixBlendMode: 'soft-light',
                background: 'radial-gradient(135% 115% at 50% 22%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 58%)',
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                mixBlendMode: 'overlay',
                background: `radial-gradient(90% 100% at 26% 68%, ${LIME_A(0.85)} 0%, ${LIME_A(0.12)} 42%, transparent 66%)`,
              }}
            />
            <div
              ref={safetyDimRef}
              className="absolute inset-0 opacity-0"
              style={{ background: PAGE_SURFACE }}
            />
          </div>
          <div
            ref={tiltRef}
            data-walkin-tilt
            className="absolute inset-0"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <motion.div
              ref={shadowRef}
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                scale: reduce ? (mobileViewport ? 0.70 : 0.58) : scale,
                borderRadius: reduce ? 32 : radius,
                transformOrigin: 'center center',
                boxShadow: '0 42px 120px rgba(8, 11, 6, 0.25), 0 14px 42px rgba(8, 11, 6, 0.18)',
                willChange: reduce || !stageVisible ? 'auto' : 'transform',
              }}
            />
            <motion.div
              ref={cardRef}
              data-walkin-card
              className="absolute inset-0 z-[1] overflow-hidden"
              style={{
                scale: reduce ? (mobileViewport ? 0.70 : 0.58) : scale,
                borderRadius: reduce ? 32 : radius,
                transformOrigin: 'center center',
                willChange: reduce || !stageVisible ? 'auto' : 'transform',
              }}
            >
              <div
                ref={figureRef}
                data-walkin-figure
                className="absolute"
                style={{ inset: '-7%', background: CARD }}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    mixBlendMode: 'soft-light',
                    background: 'radial-gradient(135% 115% at 50% 22%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 58%)',
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    mixBlendMode: 'overlay',
                    background: `radial-gradient(90% 100% at 26% 68%, ${LIME_A(0.85)} 0%, ${LIME_A(0.12)} 42%, transparent 66%)`,
                  }}
                />
              </div>

              {/* One-shot darkroom exposure. The light crosses the developing
                  card once, behind the identity copy, then fully leaves the
                  compositing tree. It adds a photographic event without
                  introducing another panel, label or perpetual animation. */}
              {!reduce && !instantReveal && (
                <motion.div
                  data-walkin-exposure
                  aria-hidden="true"
                  initial={false}
                  animate={revealed
                    ? { x: ['-118%', '16%', '126%'], opacity: [0, 0.2, 0] }
                    : { x: '-118%', opacity: 0 }}
                  transition={{
                    duration: 1.26,
                    delay: 0.46,
                    times: [0, 0.44, 1],
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="pointer-events-none absolute -inset-[12%] z-[2]"
                  style={{
                    transformOrigin: 'center center',
                    mixBlendMode: 'screen',
                    background: `linear-gradient(
                      104deg,
                      transparent 34%,
                      rgba(244, 244, 237, 0.018) 42%,
                      rgba(244, 244, 237, 0.15) 48%,
                      ${LIME_A(0.1)} 51%,
                      rgba(244, 244, 237, 0.055) 57%,
                      transparent 68%
                    )`,
                  }}
                />
              )}

              <div
                ref={contentRef}
                aria-hidden="true"
                className="absolute inset-0 z-[2] pointer-events-none"
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center px-[8%]">
                  {lineMask(
                    <span
                      className="flex items-center justify-center gap-2 font-ui uppercase"
                      style={{
                        color: LIME,
                        fontSize: 'clamp(9px, 0.78vw, 12px)',
                        letterSpacing: '0.42em',
                      }}
                    >
                      <span className="inline-block size-[0.42em] rounded-full" style={{ background: LIME }} />
                      Visual Archive
                    </span>,
                    1.28,
                  )}
                  {lineMask(
                    <span
                      className={`walkin-city mt-[2%] block max-w-full text-center font-serif uppercase leading-[0.86] tracking-[-0.045em] ${reduce ? '[animation:none]' : ''}`}
                      style={{ color: OFF, fontSize: 'clamp(42px, 7.6vw, 128px)' }}
                    >
                      Ryan Xu
                    </span>,
                    1.34,
                  )}
                  {lineMask(
                    <span
                      className={`walkin-city mt-[3%] flex items-center justify-center gap-3 ${reduce ? '[animation:none]' : ''}`}
                      style={{ animationDelay: '0.07s' }}
                    >
                      <span className="block h-px w-5 bg-white/20 md:w-9" />
                      <span
                        className="whitespace-nowrap font-serif italic"
                        style={{
                          color: 'rgba(244,244,237,0.72)',
                          fontSize: 'clamp(11px, 1.05vw, 16px)',
                        }}
                      >
                        2023—2026
                      </span>
                      <span className="block h-px w-5 bg-white/20 md:w-9" />
                    </span>,
                    1.40,
                  )}
                </div>
              </div>

              <div
                ref={frameRef}
                className="absolute inset-0 z-[3] ring-1 ring-inset ring-white/[0.06] pointer-events-none"
                style={{ borderRadius: 'inherit' }}
              />
              {!reduce && <div ref={dimRef} className="absolute inset-0 z-0 pointer-events-none" style={{ background: PAGE_SURFACE, opacity: 0 }} />}
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );

  if (reduce) {
    return (
      <section ref={ref} className="relative h-[100dvh] min-h-[100svh] overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">{stage}</div>
      </section>
    );
  }

  return (
    <section ref={ref} className="walkin-scroll-stage relative h-[195svh] lg:h-[210vh]">
      <div className="sticky top-0 h-[100dvh] min-h-[100svh] overflow-hidden flex items-center justify-center">{stage}</div>
    </section>
  );
}
