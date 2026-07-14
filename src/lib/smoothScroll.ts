import Lenis from 'lenis';

/**
 * startLenis — the homepage's weighty inertial smooth-scroll, packaged so every
 * page browses the same way. Same config as HomePage's Lenis. Returns the
 * instance plus a teardown; no-op (null) under reduced-motion or on the server.
 *
 * Elements that must NOT be smooth-scrolled (e.g. the interactive Mapbox canvas,
 * which needs raw wheel events to zoom) should carry `data-lenis-prevent` —
 * Lenis skips wheel events originating inside them.
 */
export function startLenis(): { lenis: Lenis | null; destroy: () => void } {
  if (typeof window === 'undefined') return { lenis: null, destroy: () => {} };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return { lenis: null, destroy: () => {} };
  }
  const lenis = new Lenis({
    duration: 1.05,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    touchMultiplier: 1.6,
  });
  let raf = requestAnimationFrame(function loop(time: number) {
    lenis.raf(time);
    raf = requestAnimationFrame(loop);
  });
  return {
    lenis,
    destroy: () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    },
  };
}
