import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * HeroEntrance — a cinematic first-visit opening choreographed as ONE GSAP
 * timeline, in three connected phases:
 *
 *   Phase 1 · Preloader   — a thin vertical line draws in while a 0→100%
 *                           counter ticks up beside it; then both clear.
 *   Phase 2 · Card-fan     — 4–5 photos, stacked dead-centre, fan open like a
 *                           hand of cards (shared low transform-origin +
 *                           staggered rotation/offset).
 *   Phase 3 · Text reveal  — the intro lines rise from behind a mask
 *                           (overflow-hidden + translateY 100% → 0).
 *
 * Then the whole sheet lifts away and calls onComplete(). Eases are all
 * heavily-damped (expo / power4) — never linear. Honors reduced-motion.
 *
 * Data (images + copy) is fully props-driven so it's trivial to swap.
 */
interface Props {
  onComplete: () => void;
  images: string[];
  kicker?: string;
  name?: string;
  tagline?: string;
}

export default function HeroEntrance({
  onComplete,
  images,
  kicker = 'Photographic Archive',
  name = 'Ryan Xu',
  tagline = 'Photographer · New York · Est. 2023',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  // Up to 5 cards; fall back to repeating covers if fewer collections exist.
  const cards = (images.length ? images : ['']).slice(0, 5);

  useEffect(() => {
    // Guarded, single-shot finish — the homepage sits at opacity 0 behind this
    // overlay, so it MUST be revealed exactly once no matter what.
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

    // Reduced motion → skip the show, reveal the page almost immediately.
    if (reduce) {
      const t = setTimeout(finish, 300);
      return () => clearTimeout(t);
    }

    // Safety net: if GSAP ever errors or a hidden tab throttles rAF, never
    // strand the page behind the overlay.
    const fallback = setTimeout(finish, 7000);

    const ctx = gsap.context(() => {
      const cardEls = gsap.utils.toArray<HTMLElement>('.entrance-card');
      const textLines = gsap.utils.toArray<HTMLElement>('.entrance-line');
      const n = cardEls.length;
      const mid = (n - 1) / 2;

      // ── Initial states ──
      gsap.set(lineRef.current, { scaleY: 0, transformOrigin: '50% 50%' });
      gsap.set(counterRef.current, { opacity: 1 });
      gsap.set(cardEls, {
        xPercent: -50,
        yPercent: -50,
        opacity: 0,
        scale: 0.82,
        rotation: 0,
        transformOrigin: '50% 135%', // low pivot → fan swings from the bottom
      });
      gsap.set(textLines, { yPercent: 110 });

      const counter = { v: 0 };
      const tl = gsap.timeline({
        defaults: { ease: 'expo.out' },
        onComplete: finish,
      });

      // ── Phase 1 · Preloader ──
      tl.to(lineRef.current, { scaleY: 1, duration: 0.7 }, 0)
        .to(
          counter,
          {
            v: 100,
            duration: 1.15,
            ease: 'power2.out',
            onUpdate: () => {
              if (counterRef.current) counterRef.current.textContent = `${Math.round(counter.v)}%`;
            },
          },
          0.05,
        )
        // line + counter clear, making room for the cards
        .to(counterRef.current, { opacity: 0, y: -10, duration: 0.4, ease: 'power3.inOut' }, '>-0.1')
        .to(lineRef.current, { scaleY: 0, opacity: 0, duration: 0.5, ease: 'power4.inOut' }, '<');

      // ── Phase 2 · Card-fan reveal ──
      tl.to(
        cardEls,
        {
          opacity: 1,
          scale: 1,
          rotation: (i) => (i - mid) * 11,
          x: (i) => (i - mid) * 86,
          y: (i) => Math.abs(i - mid) * 14, // gentle downward arc at the edges
          duration: 1.15,
          ease: 'expo.out',
          stagger: 0.08,
        },
        '>-0.15',
      );

      // ── Phase 3 · Text reveal (overlaps the fan's tail) ──
      tl.to(
        textLines,
        { yPercent: 0, duration: 0.95, ease: 'expo.out', stagger: 0.12 },
        '-=0.6',
      );

      // ── Settle, then lift the whole sheet away ──
      tl.to({}, { duration: 0.7 }) // hold
        .to(cardEls, { y: '-=24', opacity: 0, duration: 0.7, ease: 'power3.in', stagger: 0.04 }, 'out')
        .to(textRef.current, { yPercent: -30, opacity: 0, duration: 0.6, ease: 'power3.in' }, 'out')
        .to(rootRef.current, { opacity: 0, duration: 0.6, ease: 'power2.inOut' }, 'out+=0.15');
    }, rootRef);

    return () => {
      clearTimeout(fallback);
      ctx.revert();
    };
  }, [onComplete]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[60] bg-[#0A0A0A] overflow-hidden"
      aria-hidden="true"
    >
      {/* faint texture to match the site */}
      <div className="absolute inset-0 newsprint-screen opacity-[0.04] pointer-events-none" />

      {/* Phase 1 · Preloader */}
      <div className="absolute inset-0 flex items-center justify-center gap-5">
        <div ref={lineRef} className="w-px h-[clamp(160px,28vh,260px)] bg-white/80" />
        <span
          ref={counterRef}
          className="font-mono tabular-nums text-white/90 text-2xl md:text-3xl tracking-tight w-[3.5ch]"
        >
          0%
        </span>
      </div>

      {/* Phase 2 · Cards (stacked dead-centre, fan out) */}
      <div ref={cardsRef} className="absolute inset-0 pointer-events-none">
        {cards.map((src, i) => (
          <div
            key={i}
            className="entrance-card absolute left-1/2 top-1/2 w-[clamp(150px,21vw,250px)] aspect-[3/4] overflow-hidden rounded-[2px] border border-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] will-change-transform"
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
          <div className="entrance-line font-mono text-[10px] md:text-[11px] tracking-[0.5em] uppercase text-white/45">
            {kicker}
          </div>
        </div>
        <div className="overflow-hidden py-1">
          <h1 className="entrance-line font-serif italic tracking-tighter text-white leading-[0.9] text-[clamp(36px,7vw,84px)]">
            {name}
          </h1>
        </div>
        <div className="overflow-hidden">
          <div className="entrance-line font-mono text-[10px] md:text-[11px] tracking-[0.32em] uppercase text-white/40">
            {tagline}
          </div>
        </div>
      </div>
    </div>
  );
}
