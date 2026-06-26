import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * HeroEntrance — a "focus pull" first-visit opening. One gsap.timeline():
 *
 *   The cover sits full-bleed but heavily DEFOCUSED. The 0→100 counter IS the
 *   focus ring: as it climbs, blur racks out and the frame snaps sharp, with an
 *   AF reticle tightening around the number. At 100 focus "locks" (a small
 *   confirm beat), the HUD clears, and the title rises over the sharp photo.
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
  loadingLabel = 'Acquiring focus',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
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

    const MAX_BLUR = 32; // px — starting defocus

    const ctx = gsap.context(() => {
      const textLines = gsap.utils.toArray<HTMLElement>('.entrance-line');

      // ── Initial states ──
      gsap.set(labelRef.current, { opacity: 0, y: 8 });
      gsap.set(numberRef.current, { transformOrigin: '50% 50%' });
      gsap.set(reticleRef.current, { opacity: 0, scale: 1.35, transformOrigin: '50% 50%' });
      gsap.set(underlineRef.current, { scaleX: 0 });
      gsap.set(photoRef.current, { opacity: 0, scale: 1.1, filter: `blur(${MAX_BLUR}px) brightness(0.62)` });
      gsap.set(textLines, { yPercent: 110 });

      const counter = { v: 0 };
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: finish });
      tl.timeScale(1.4); // snappier overall pacing

      // ── In: the defocused frame + AF reticle appear ──
      tl.to(photoRef.current, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0)
        .to(reticleRef.current, { opacity: 1, scale: 1.12, duration: 0.6, ease: 'power2.out' }, 0.15)
        .to(labelRef.current, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 0.2);

      // ── Focus pull: the counter racks the blur out to sharp ──
      tl.to(
        counter,
        {
          v: 100,
          duration: 1.9,
          ease: 'power2.inOut',
          onUpdate: () => {
            const p = counter.v / 100;
            if (counterRef.current) counterRef.current.textContent = String(Math.round(counter.v));
            const blur = (MAX_BLUR * (1 - p)).toFixed(2);
            const bright = (0.62 + 0.38 * p).toFixed(3);
            gsap.set(photoRef.current, { filter: `blur(${blur}px) brightness(${bright})` });
          },
        },
        0.45,
      )
        // reticle tightens + photo scale settles as focus resolves
        .to(reticleRef.current, { scale: 0.82, duration: 1.9, ease: 'power2.inOut' }, 0.45)
        .to(photoRef.current, { scale: 1.0, duration: 2.0, ease: 'power2.out' }, 0.45);

      // ── Lock: a small confirm beat at 100 (no flash) ──
      tl.to(reticleRef.current, { scale: 0.76, duration: 0.13, yoyo: true, repeat: 1, ease: 'power2.inOut' }, '>-0.02')
        .to(photoRef.current, { scale: 1.015, duration: 0.13, yoyo: true, repeat: 1, ease: 'power2.inOut' }, '<');

      // ── HUD clears ──
      tl.to([numberRef.current, labelRef.current], { opacity: 0, y: -12, duration: 0.45, ease: 'power3.inOut' }, '>+0.05')
        .to(reticleRef.current, { opacity: 0, scale: 0.7, duration: 0.5, ease: 'power2.out' }, '<');

      // ── Title rises over the sharp photo ──
      tl.to(textLines, { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.12 }, '>-0.1');
      tl.to(underlineRef.current, { scaleX: 1, duration: 0.6, ease: 'expo.out' }, '>-0.5');

      // ── Settle, then lift the sheet ──
      tl.to({}, { duration: 1.25 }).addLabel('out');
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
    <div ref={rootRef} className="fixed inset-0 z-[60] bg-[#22271a] overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Single full-bleed cover (starts defocused, racks sharp) */}
      <div className="absolute inset-0 overflow-hidden">
        <div ref={photoRef} className="absolute inset-0 will-change-[filter,transform]" style={{ opacity: 0 }}>
          {hero && (
            <img src={`${hero}?auto=format&w=1800&q=82`} alt="" className="w-full h-full object-cover" draggable={false} />
          )}
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/45" />
        </div>
      </div>

      {/* AF reticle + counter (centered, no transform-centering so GSAP can scale it) */}
      <div className="absolute inset-0 flex items-center justify-center z-20">
        <div className="relative flex flex-col items-center gap-6">
          <div ref={reticleRef} className="relative w-[min(48vmin,380px)] aspect-square" style={{ opacity: 0 }}>
            {/* four AF corner brackets */}
            <span className="absolute top-0 left-0 w-7 h-7 border-t border-l border-white/55" />
            <span className="absolute top-0 right-0 w-7 h-7 border-t border-r border-white/55" />
            <span className="absolute bottom-0 left-0 w-7 h-7 border-b border-l border-white/55" />
            <span className="absolute bottom-0 right-0 w-7 h-7 border-b border-r border-white/55" />
            {/* counter centered in the reticle */}
            <div ref={numberRef} className="absolute inset-0 flex items-baseline justify-center">
              <span ref={counterRef} className="font-mono tabular-nums text-white text-6xl md:text-7xl leading-none tracking-tighter">
                0
              </span>
              <span className="font-mono text-white/35 text-lg md:text-xl ml-1">%</span>
            </div>
          </div>
          <div ref={labelRef} className="font-mono text-[10px] tracking-[0.55em] uppercase text-white/35" style={{ opacity: 0 }}>
            {loadingLabel}
          </div>
        </div>
      </div>

      {/* Title */}
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
