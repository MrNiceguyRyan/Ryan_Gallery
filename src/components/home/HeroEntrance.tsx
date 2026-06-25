import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * HeroEntrance — a cinematic first-visit opening, one gsap.timeline(), 3 phases:
 *
 *   Phase 1 · Preloader   — a slim vertical TRACK draws up; a bright fill
 *                           climbs it in lock-step with a large 0→100 counter,
 *                           then the cluster retracts upward.
 *   Phase 2 · Marvel montage — once loaded, frames fly THROUGH the camera in a
 *                           rapid, accelerating flythrough (perspective + depth +
 *                           slight 3D tilt), building to a white climax flash —
 *                           the Marvel-Studios intro feel, built from the archive.
 *   Phase 3 · Slam reveal  — out of the flash, the intro lines rise from behind a
 *                           mask with a brief scale punch.
 *
 * Then the sheet lifts away → onComplete(). Honors reduced-motion (skips to the
 * page). Data (images + copy) is fully props-driven.
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
  const stageRef = useRef<HTMLDivElement>(null);

  // Up to 14 frames for the montage; repeat the pool if the archive is small.
  const pool = images.filter(Boolean);
  const frames: string[] = pool.length
    ? Array.from({ length: Math.min(14, Math.max(8, pool.length)) }, (_, i) => pool[i % pool.length])
    : [];

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

    // Safety net — never strand the page behind the overlay.
    const fallback = setTimeout(finish, 9000);

    const ctx = gsap.context(() => {
      const frameEls = gsap.utils.toArray<HTMLElement>('.montage-frame');
      const textLines = gsap.utils.toArray<HTMLElement>('.entrance-line');

      // ── Initial states ──
      gsap.set(trackRef.current, { scaleY: 0, transformOrigin: '50% 100%' });
      gsap.set(fillRef.current, { scaleY: 0, transformOrigin: '50% 100%' });
      gsap.set(labelRef.current, { opacity: 0, y: 8 });
      gsap.set(numberRef.current, { transformOrigin: '50% 50%' });
      gsap.set(bloomRef.current, { opacity: 0 });
      gsap.set(underlineRef.current, { scaleX: 0 });
      gsap.set(stageRef.current, { opacity: 0 });
      gsap.set(frameEls, { xPercent: 0, yPercent: 0, opacity: 0, scale: 0.45, z: -600, transformOrigin: '50% 50%' });
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
            duration: 0.9,
            ease: 'power2.inOut',
            onUpdate: () => {
              if (counterRef.current) counterRef.current.textContent = String(Math.round(counter.v));
            },
          },
          0.3,
        )
        .to(fillRef.current, { scaleY: 1, duration: 0.9, ease: 'power2.inOut' }, 0.3)
        // "charged" pop as it hits 100
        .to(numberRef.current, { scale: 1.07, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.inOut' }, '>-0.04')
        // cluster retracts upward, clearing the stage
        .to([numberRef.current, labelRef.current], { opacity: 0, y: -16, duration: 0.4, ease: 'power3.inOut' }, '>-0.02')
        .to(trackRef.current, { scaleY: 0, opacity: 0, duration: 0.45, ease: 'power4.inOut', transformOrigin: '50% 0%' }, '<');

      // ── Phase 2 · Marvel montage — frames fly through the camera ──
      tl.addLabel('montage', '>-0.05');
      tl.to(stageRef.current, { opacity: 1, duration: 0.2 }, 'montage');

      const n = frameEls.length;
      let t = 0;
      frameEls.forEach((el, i) => {
        // cut interval shortens across the run → the montage accelerates
        const cut = gsap.utils.mapRange(0, Math.max(1, n - 1), 0.17, 0.075, i);
        const tilt = (i % 2 ? 1 : -1) * gsap.utils.random(7, 15);
        const at = 'montage+=' + t.toFixed(3);
        tl.fromTo(
          el,
          { opacity: 0, scale: 0.45, z: -600, rotationY: tilt, rotationX: gsap.utils.random(-6, 6) },
          { opacity: 1, scale: 1, z: 0, rotationY: 0, rotationX: 0, duration: cut * 1.8, ease: 'power3.out' },
          at,
        ).to(
          el,
          { opacity: 0, scale: 1.9, z: 650, duration: cut * 1.6, ease: 'power2.in' },
          'montage+=' + (t + cut * 0.5).toFixed(3),
        );
        t += cut;
      });

      // slow camera push + drift across the whole montage for momentum
      tl.fromTo(
        stageRef.current,
        { scale: 0.88, rotationZ: -1.5 },
        { scale: 1.08, rotationZ: 1.5, duration: t, ease: 'none' },
        'montage',
      );

      // climax flash as the last frames blow past
      tl.to(bloomRef.current, { opacity: 0.7, duration: 0.16, ease: 'power2.in' }, 'montage+=' + Math.max(0, t - 0.12).toFixed(3))
        .to(bloomRef.current, { opacity: 0, duration: 0.7, ease: 'power2.out' }, 'montage+=' + (t + 0.06).toFixed(3));

      // ── Phase 3 · Slam reveal out of the flash ──
      tl.addLabel('reveal', 'montage+=' + (t + 0.02).toFixed(3));
      tl.fromTo(textRef.current, { scale: 1.08 }, { scale: 1, duration: 0.9, ease: 'power3.out' }, 'reveal');
      tl.to(textLines, { yPercent: 0, duration: 0.85, ease: 'expo.out', stagger: 0.1 }, 'reveal');
      tl.to(underlineRef.current, { scaleX: 1, duration: 0.6, ease: 'expo.out' }, 'reveal+=0.3');

      // ── Settle (hold long enough to read), then lift the sheet ──
      tl.to({}, { duration: 1.25 }).addLabel('out');
      tl.to(textRef.current, { yPercent: -24, opacity: 0, duration: 0.5, ease: 'power3.in' }, 'out')
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

      {/* Phase 2 · Marvel montage — frames fly through the camera */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ perspective: '1100px' }}>
        <div ref={stageRef} className="relative w-[clamp(240px,44vmin,600px)] aspect-[3/2]" style={{ transformStyle: 'preserve-3d', opacity: 0 }}>
          {frames.map((src, i) => (
            <div
              key={i}
              className="montage-frame absolute inset-0 overflow-hidden rounded-[2px] border border-white/10 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] opacity-0 will-change-transform"
            >
              <img src={`${src}?auto=format&w=900&q=78`} alt="" className="w-full h-full object-cover" draggable={false} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </div>
          ))}
        </div>
      </div>

      {/* Climax flash */}
      <div
        ref={bloomRef}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[120vmax] h-[120vmax] rounded-full pointer-events-none"
        style={{
          opacity: 0,
          background: 'radial-gradient(circle, rgba(255,255,255,0.85), rgba(255,255,255,0.15) 35%, transparent 60%)',
          mixBlendMode: 'screen',
        }}
      />

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
