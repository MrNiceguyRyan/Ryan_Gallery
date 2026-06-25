import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * HeroEntrance — a calm, cinematic first-visit opening. One gsap.timeline():
 *
 *   Phase 1 · Preloader — a slim vertical TRACK draws up; a bright fill climbs
 *                         it in lock-step with a 0→100 counter, then retracts.
 *   Phase 2 · Single cover — once loaded, ONE archive frame fades in full-bleed
 *                         behind the title and drifts on a slow Ken-Burns zoom.
 *                         No cuts, no flashing — quiet and filmic.
 *   Phase 3 · Text — the intro lines rise from behind a mask over the photo.
 *
 * Then the sheet lifts away → onComplete(). Honors reduced-motion (skips to the
 * page). Data (image + copy) is props-driven.
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
  const photoRef = useRef<HTMLDivElement>(null);
  const underlineRef = useRef<HTMLDivElement>(null);

  const hero = images.find(Boolean) || '';

  useEffect(() => {
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

    const fallback = setTimeout(finish, 8000);

    const ctx = gsap.context(() => {
      const textLines = gsap.utils.toArray<HTMLElement>('.entrance-line');

      // ── Initial states ──
      gsap.set(trackRef.current, { scaleY: 0, transformOrigin: '50% 100%' });
      gsap.set(fillRef.current, { scaleY: 0, transformOrigin: '50% 100%' });
      gsap.set(labelRef.current, { opacity: 0, y: 8 });
      gsap.set(numberRef.current, { transformOrigin: '50% 50%' });
      gsap.set(underlineRef.current, { scaleX: 0 });
      gsap.set(photoRef.current, { opacity: 0, scale: 1.05, transformOrigin: '50% 50%' });
      gsap.set(textLines, { yPercent: 110 });

      const counter = { v: 0 };
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: finish });

      // ── Phase 1 · Preloader (line fills in sync with the counter) ──
      tl.to(trackRef.current, { scaleY: 1, duration: 0.4 }, 0)
        .to(labelRef.current, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 0.1)
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
        .to(numberRef.current, { scale: 1.06, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.inOut' }, '>-0.04')
        .to([numberRef.current, labelRef.current], { opacity: 0, y: -14, duration: 0.45, ease: 'power3.inOut' }, '>-0.02')
        .to(trackRef.current, { scaleY: 0, opacity: 0, duration: 0.45, ease: 'power4.inOut', transformOrigin: '50% 0%' }, '<');

      // ── Phase 2 · Single cinematic cover (slow Ken-Burns drift) ──
      tl.addLabel('reveal', '>-0.05');
      tl.to(photoRef.current, { opacity: 1, duration: 1.6, ease: 'power2.out' }, 'reveal');
      // long, even zoom that runs under the rest of the sequence — no cuts
      tl.to(photoRef.current, { scale: 1.15, duration: 4, ease: 'none' }, 'reveal');

      // ── Phase 3 · Text reveal over the photo ──
      tl.to(textLines, { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.12 }, 'reveal+=0.85');
      tl.to(underlineRef.current, { scaleX: 1, duration: 0.6, ease: 'expo.out' }, 'reveal+=1.15');

      // ── Settle (hold), then lift the sheet ──
      tl.to({}, { duration: 1.3 }).addLabel('out');
      tl.to(textRef.current, { yPercent: -20, opacity: 0, duration: 0.5, ease: 'power3.in' }, 'out')
        .to(photoRef.current, { opacity: 0, duration: 0.6, ease: 'power2.inOut' }, 'out')
        .to(rootRef.current, { opacity: 0, duration: 0.5, ease: 'power2.inOut' }, 'out+=0.1');
    }, rootRef);

    return () => {
      clearTimeout(fallback);
      ctx.revert();
    };
  }, [onComplete]);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[60] bg-[#0A0A0A] overflow-hidden pointer-events-none" aria-hidden="true">
      {/* faint texture to match the site */}
      <div className="absolute inset-0 newsprint-screen opacity-[0.04] pointer-events-none z-10" />

      {/* Phase 2 · Single full-bleed cover, behind everything */}
      <div className="absolute inset-0 overflow-hidden">
        <div ref={photoRef} className="absolute inset-0 will-change-transform" style={{ opacity: 0 }}>
          {hero && (
            <img src={`${hero}?auto=format&w=1800&q=82`} alt="" className="w-full h-full object-cover" draggable={false} />
          )}
          {/* cinematic scrims — keep the title legible, deepen the mood */}
          <div className="absolute inset-0 bg-black/55" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/55" />
        </div>
      </div>

      {/* Phase 1 · Preloader — progress track + synced counter */}
      <div className="absolute inset-0 flex items-center justify-center z-20">
        <div className="flex items-center gap-7 md:gap-10">
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

      {/* Phase 3 · Text */}
      <div ref={textRef} className="absolute inset-x-0 bottom-[11vh] px-6 flex flex-col items-center text-center gap-2 md:gap-3 z-20">
        <div className="overflow-hidden">
          <div className="entrance-line font-mono text-[10px] md:text-[11px] tracking-[0.5em] uppercase text-white/55" style={{ transform: 'translateY(110%)' }}>
            {kicker}
          </div>
        </div>
        <div className="overflow-hidden py-1">
          <h1 className="entrance-line font-serif italic tracking-tighter text-white leading-[0.9] text-[clamp(36px,7vw,84px)]" style={{ transform: 'translateY(110%)' }}>
            {name}
          </h1>
        </div>
        <div ref={underlineRef} className="h-px w-20 bg-white/40 origin-center" style={{ transform: 'scaleX(0)' }} />
        <div className="overflow-hidden">
          <div className="entrance-line font-mono text-[10px] md:text-[11px] tracking-[0.32em] uppercase text-white/50" style={{ transform: 'translateY(110%)' }}>
            {tagline}
          </div>
        </div>
      </div>
    </div>
  );
}
