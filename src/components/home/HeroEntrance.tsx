import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * HeroEntrance — a cinematic first-visit opening, one gsap.timeline(), 3 phases:
 *
 *   Phase 1 · Preloader   — a slim vertical TRACK draws up; a bright fill
 *                           climbs it in lock-step with a large 0→100 counter
 *                           (the line literally fills as the number rises);
 *                           then the cluster retracts upward.
 *   Phase 2 · Card-fan     — up to 5 covers, stacked dead-centre, fan open like
 *                           a hand of cards (low shared transform-origin +
 *                           staggered rotation/offset).
 *   Phase 3 · Text reveal  — the intro lines rise from behind a mask
 *                           (overflow-hidden + translateY 110% → 0).
 *
 * Then the sheet lifts away → onComplete(). All eases damped (expo/power),
 * never linear. Honors reduced-motion. Initial hidden states are also set in
 * inline CSS (not only gsap.set) so there is NO flash before the timeline runs.
 *
 * Data (images + copy) is fully props-driven.
 */
interface Props {
  onComplete: () => void;
  images: string[];
  kicker?: string;
  name?: string;
  tagline?: string;
  loadingLabel?: string;
}

export default function HeroEntrance({
  onComplete,
  images,
  kicker = 'Photographic Archive',
  name = 'Ryan Xu',
  tagline = 'Photographer · New York · Est. 2023',
  loadingLabel = 'Loading the archive',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const bloomRef = useRef<HTMLDivElement>(null);
  const underlineRef = useRef<HTMLDivElement>(null);

  const cards = (images.length ? images : ['']).slice(0, 5);

  useEffect(() => {
    // Guarded, single-shot finish — the homepage sits at opacity 0 behind this
    // overlay, so it MUST be revealed exactly once, no matter what.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onComplete();
    };

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      const t = setTimeout(finish, 300);
      return () => clearTimeout(t);
    }

    // Safety net: never strand the page behind the overlay.
    const fallback = setTimeout(finish, 7000);

    const ctx = gsap.context(() => {
      const cardEls = gsap.utils.toArray<HTMLElement>('.entrance-card');
      const textLines = gsap.utils.toArray<HTMLElement>('.entrance-line');
      const n = cardEls.length;
      const mid = (n - 1) / 2;

      // ── Initial states (mirror the inline CSS hidden states) ──
      gsap.set(trackRef.current, { scaleY: 0, transformOrigin: '50% 100%' });
      gsap.set(fillRef.current, { scaleY: 0, transformOrigin: '50% 100%' });
      gsap.set(labelRef.current, { opacity: 0, y: 8 });
      gsap.set(numberRef.current, { transformOrigin: '50% 50%' });
      gsap.set(bloomRef.current, { opacity: 0 });
      gsap.set(underlineRef.current, { scaleX: 0 });
      gsap.set(cardEls, {
        xPercent: -50,
        yPercent: -50,
        opacity: 0,
        scale: 0.82,
        rotation: 0,
        transformOrigin: '50% 135%', // low pivot → fan swings open from the base
        zIndex: (i) => 50 - Math.round(Math.abs(i - mid) * 10), // centre card on top
      });
      gsap.set(textLines, { yPercent: 110 });

      const counter = { v: 0 };
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: finish });

      // ── Phase 1 · Preloader (line fills in sync with the counter) ──
      tl.to(trackRef.current, { scaleY: 1, duration: 0.4 }, 0)
        .to(labelRef.current, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 0.1)
        // counter + fill share the exact same start / duration / ease → locked together
        .to(
          counter,
          {
            v: 100,
            duration: 0.95,
            ease: 'power2.inOut',
            onUpdate: () => {
              if (counterRef.current) counterRef.current.textContent = String(Math.round(counter.v));
            },
          },
          0.3,
        )
        .to(fillRef.current, { scaleY: 1, duration: 0.95, ease: 'power2.inOut' }, 0.3)
        // "charged" beat — the number pops once as it hits 100
        .to(numberRef.current, { scale: 1.06, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.inOut' }, '>-0.04')
        // cluster retracts upward, clearing space for the cards
        .to([numberRef.current, labelRef.current], { opacity: 0, y: -14, duration: 0.4, ease: 'power3.inOut' }, '>-0.02')
        .to(trackRef.current, { scaleY: 0, opacity: 0, duration: 0.45, ease: 'power4.inOut', transformOrigin: '50% 0%' }, '<');

      // ── Phase 2 · Card-fan reveal ──
      tl.addLabel('fan', '>-0.18');
      // soft light bloom blossoms behind the deck as it opens (photographic
      // "exposure" beat), then dissolves
      tl.fromTo(bloomRef.current, { opacity: 0 }, { opacity: 0.16, duration: 0.3, ease: 'power1.out' }, 'fan')
        .to(bloomRef.current, { opacity: 0, duration: 0.9, ease: 'power2.out' }, 'fan+=0.3');
      // position/scale ride expo; rotation gets a slight back-ease overshoot so
      // the deal reads like real cards snapping into place
      tl.to(
        cardEls,
        {
          opacity: 1,
          // Z-depth: centre card forward, outer cards recede slightly
          scale: (i) => 1 - Math.abs(i - mid) * 0.07,
          x: (i) => (i - mid) * 86,
          y: (i) => Math.abs(i - mid) * 14,
          duration: 1.0,
          ease: 'expo.out',
          stagger: 0.07,
        },
        'fan',
      ).to(
        cardEls,
        {
          rotation: (i) => (i - mid) * 11,
          duration: 1.1,
          ease: 'back.out(1.6)',
          stagger: 0.07,
        },
        'fan',
      );

      // ── Phase 3 · Text reveal (overlaps the fan's tail) ──
      tl.to(textLines, { yPercent: 0, duration: 0.85, ease: 'expo.out', stagger: 0.1 }, '-=0.55');
      // hairline underline wipes out beneath the name
      tl.to(underlineRef.current, { scaleX: 1, duration: 0.6, ease: 'expo.out' }, '-=0.45');

      // ── Settle, then lift the sheet away (explicit label) ──
      tl.to({}, { duration: 0.55 }).addLabel('out');
      tl.to(cardEls, { y: '-=30', opacity: 0, duration: 0.55, ease: 'power3.in', stagger: 0.035 }, 'out')
        .to(textRef.current, { yPercent: -24, opacity: 0, duration: 0.5, ease: 'power3.in' }, 'out')
        .to(rootRef.current, { opacity: 0, duration: 0.5, ease: 'power2.inOut' }, 'out+=0.12');
    }, rootRef);

    return () => {
      clearTimeout(fallback);
      ctx.revert();
    };
  }, [onComplete]);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[60] bg-[#0A0A0A] overflow-hidden" aria-hidden="true">
      {/* faint texture to match the site */}
      <div className="absolute inset-0 newsprint-screen opacity-[0.04] pointer-events-none" />

      {/* Phase 1 · Preloader — progress track + synced counter */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-7 md:gap-10">
          {/* Track (faint) with a bright fill that climbs in sync with the number */}
          <div
            ref={trackRef}
            className="relative w-[2px] h-[clamp(170px,30vh,280px)] bg-white/12 rounded-full overflow-hidden"
            style={{ transform: 'scaleY(0)' }}
          >
            <div
              ref={fillRef}
              className="absolute inset-x-0 bottom-0 h-full bg-white origin-bottom shadow-[0_0_16px_rgba(255,255,255,0.55)]"
              style={{ transform: 'scaleY(0)' }}
            />
          </div>
          {/* Counter */}
          <div ref={numberRef} className="flex items-baseline">
            <span
              ref={counterRef}
              className="font-mono tabular-nums text-white text-7xl md:text-8xl leading-none tracking-tighter"
            >
              0
            </span>
            <span className="font-mono text-white/35 text-xl md:text-2xl ml-1.5">%</span>
          </div>
        </div>
        <div
          ref={labelRef}
          className="absolute bottom-[15vh] font-mono text-[10px] tracking-[0.55em] uppercase text-white/30"
          style={{ opacity: 0 }}
        >
          {loadingLabel}
        </div>
      </div>

      {/* Soft light bloom behind the deck — blossoms as the fan opens */}
      <div
        ref={bloomRef}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vmin] h-[85vmin] rounded-full pointer-events-none"
        style={{
          opacity: 0,
          background: 'radial-gradient(circle, rgba(255,255,255,0.5), transparent 62%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Phase 2 · Cards (stacked dead-centre, fan out) */}
      <div className="absolute inset-0 pointer-events-none">
        {cards.map((src, i) => (
          <div
            key={i}
            className="entrance-card absolute left-1/2 top-1/2 w-[clamp(150px,21vw,250px)] aspect-[3/4] overflow-hidden rounded-[2px] border border-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] opacity-0 will-change-transform"
          >
            {src && (
              <img
                src={`${src}?auto=format&w=600&q=78`}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </div>
        ))}
      </div>

      {/* Phase 3 · Text */}
      <div ref={textRef} className="absolute inset-x-0 bottom-[11vh] px-6 flex flex-col items-center text-center gap-2 md:gap-3">
        <div className="overflow-hidden">
          <div className="entrance-line font-mono text-[10px] md:text-[11px] tracking-[0.5em] uppercase text-white/45" style={{ transform: 'translateY(110%)' }}>
            {kicker}
          </div>
        </div>
        <div className="overflow-hidden py-1">
          <h1 className="entrance-line font-serif italic tracking-tighter text-white leading-[0.9] text-[clamp(36px,7vw,84px)]" style={{ transform: 'translateY(110%)' }}>
            {name}
          </h1>
        </div>
        {/* hairline underline — wipes out beneath the name */}
        <div ref={underlineRef} className="h-px w-20 bg-white/40 origin-center" style={{ transform: 'scaleX(0)' }} />
        <div className="overflow-hidden">
          <div className="entrance-line font-mono text-[10px] md:text-[11px] tracking-[0.32em] uppercase text-white/40" style={{ transform: 'translateY(110%)' }}>
            {tagline}
          </div>
        </div>
      </div>
    </div>
  );
}
