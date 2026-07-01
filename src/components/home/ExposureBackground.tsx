import { useEffect, useRef, useState } from 'react';
import { startExposure, type ExposureStop } from '../../lib/exposure';

/**
 * ExposureBackground — the homepage's fixed background layer: the long-
 * exposure light-writing canvas (lib/exposure.ts) plus DOM EXIF stamps
 * (crisp text; canvas text would blur under DPR scaling).
 *
 * The scroll shutter is a pure function of scrollY (scroll-LINKED, both
 * directions, no triggers): by 60vh the container has faded to a 6% ghost
 * of the developed plate and the engine freezes itself. Stamps fade with
 * the same curve. No framer/whileInView anywhere (unreliable here).
 */
export default function ExposureBackground({ stops }: { stops: ExposureStop[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [positions, setPositions] = useState<{ x: number; y: number }[]>([]);
  const [arrived, setArrived] = useState<boolean[]>(() => stops.map(() => false));

  useEffect(() => {
    if (!canvasRef.current || stops.length < 2) return;
    // Re-derive stamp state in lockstep with each engine (re)start, so a
    // changed stops list can't inherit stale arrived/position arrays.
    setPositions([]);
    setArrived(stops.map(() => false));
    return startExposure(canvasRef.current, stops, {
      onLayout: setPositions,
      onArrive: (k) => setArrived((prev) => (prev[k] ? prev : prev.map((v, i) => (i === k ? true : v)))),
    });
  }, [stops]);

  // Shutter: opacity/translate driven straight from scrollY on the wrapper —
  // works identically while the engine is frozen (it's just CSS).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const vh = window.innerHeight || 1;
      const shut = Math.min(1, Math.max(0, window.scrollY / (vh * 0.6)));
      el.style.opacity = String(1 - shut * 0.94); // floor = the 6% ghost
      el.style.transform = `translateY(${-window.scrollY * 0.06}px)`; // faint plate parallax
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (stops.length < 2) return null;

  return (
    <div ref={wrapRef} className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {/* EXIF waypoint stamps — armed by the engine as the light passes.
           800ms ease fade (never a pop). */}
      {positions.map((p, k) => {
        const s = stops[k];
        if (!s) return null;
        const flip = p.x > (typeof window !== 'undefined' ? window.innerWidth : 1440) * 0.72;
        return (
          <div
            key={k}
            className="absolute font-ui uppercase whitespace-nowrap"
            style={{
              left: p.x,
              top: p.y,
              transform: flip ? 'translate(calc(-100% - 14px), -18px)' : 'translate(14px, -18px)',
              opacity: arrived[k] ? 1 : 0,
              transition: 'opacity 800ms ease',
              fontSize: 10,
              letterSpacing: '0.12em',
              color: 'rgba(244, 244, 237, 0.42)',
            }}
          >
            <span
              className="inline-block align-middle mr-2"
              style={{
                width: 4,
                height: 4,
                background: 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))',
              }}
            />
            {String(k + 1).padStart(2, '0')} {s.label.toUpperCase()}
            {s.exif ? <span style={{ color: 'rgba(244, 244, 237, 0.26)' }}> — {s.exif}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
