import Lenis from 'lenis';

/**
 * startLenis — the homepage's weighty inertial smooth-scroll, packaged so every
 * page browses the same way. Same config as HomePage's Lenis. Returns the
 * instance plus a teardown; no-op (null) under reduced-motion, coarse pointers,
 * or on the server. Touch devices keep their native platform scrolling.
 *
 * Elements that must NOT be smooth-scrolled (e.g. the interactive Mapbox canvas,
 * which needs raw wheel events to zoom) should carry `data-lenis-prevent` —
 * Lenis skips wheel events originating inside them.
 */
export function startLenis(): { lenis: Lenis | null; destroy: () => void } {
  if (typeof window === 'undefined') return { lenis: null, destroy: () => {} };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(hover: none) and (pointer: coarse)');
  if (reducedMotion.matches || coarsePointer.matches) {
    return { lenis: null, destroy: () => {} };
  }

  // Continuous damping (lerp) rather than a fixed-duration ease per wheel
  // event: a duration ease restarts on every trackpad event with a fresh burst
  // of speed, so the velocity is never continuous. Lenis damps frame-rate
  // independently; 0.085 keeps the site's weighty glide.
  const lenis = new Lenis({
    lerp: 0.085,
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
  });

  let destroyed = false;
  let raf = 0;
  const loop = (time: number) => {
    if (destroyed || document.hidden) {
      raf = 0;
      return;
    }
    lenis.raf(time);
    raf = requestAnimationFrame(loop);
  };
  const startRaf = () => {
    if (!destroyed && !document.hidden && raf === 0) {
      raf = requestAnimationFrame(loop);
    }
  };
  const onVisibilityChange = () => {
    if (document.hidden) {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
    } else {
      startRaf();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  startRaf();

  return {
    lenis,
    destroy: () => {
      destroyed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      lenis.destroy();
    },
  };
}
