/**
 * Animated "organic blob" site atmosphere, drawn on a <canvas>.
 *
 * A field of scattered, ROUNDED, irregular closed contours — pebble / water-drop
 * shapes (echoing Lando's blob motif), NOT straight stripes. They're stroked in
 * a faint olive only a hair lighter than the page, so the field reads as a quiet
 * texture and never competes with the photography. Density is scattered/random
 * across the frame. Motion is a slow scroll-parallax drift plus an almost
 * imperceptible breathe — continuous, never a flicker.
 *
 * Honors prefers-reduced-motion (single static frame). The canvas is fixed, so
 * "parallax" is applied by offsetting the drawing by a fraction of scrollY each
 * frame. Returns a cleanup fn; also self-stops once the canvas leaves the DOM.
 */
export function startAtmosphere(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Faint near-background olive — just a hair lighter than the #282c20 page, so
  // the blobs are felt more than seen. Outer rings fade further into the page.
  const stroke = (a: number) => `rgba(58, 63, 45, ${a})`;

  let w = 0;
  let h = 0;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  // Scattered blob "peaks" — each emits a stack of nested rounded contours.
  // Spread across the frame (some past the edges) for a continuous, random-
  // density field. Low warp = smooth pebble shapes, not spiky topography.
  const peaks = [
    { x: 0.13, y: 0.18, rings: 7, base: 30, warp: 13, sp: 0.5, aspect: 0.92, seed: 0.0 },
    { x: 0.42, y: 0.09, rings: 6, base: 34, warp: 15, sp: 0.42, aspect: 1.08, seed: 1.7 },
    { x: 0.79, y: 0.16, rings: 7, base: 27, warp: 12, sp: 0.55, aspect: 0.9, seed: 3.1 },
    { x: 0.24, y: 0.50, rings: 8, base: 31, warp: 16, sp: 0.46, aspect: 0.98, seed: 4.6 },
    { x: 0.59, y: 0.44, rings: 7, base: 29, warp: 14, sp: 0.5, aspect: 1.06, seed: 6.0 },
    { x: 0.92, y: 0.54, rings: 6, base: 29, warp: 13, sp: 0.48, aspect: 0.9, seed: 7.4 },
    { x: 0.07, y: 0.78, rings: 7, base: 29, warp: 15, sp: 0.5, aspect: 1.0, seed: 8.8 },
    { x: 0.45, y: 0.85, rings: 7, base: 31, warp: 14, sp: 0.42, aspect: 0.95, seed: 10.2 },
    { x: 0.76, y: 0.82, rings: 7, base: 29, warp: 15, sp: 0.5, aspect: 1.04, seed: 11.6 },
    { x: 0.99, y: 0.93, rings: 5, base: 29, warp: 12, sp: 0.46, aspect: 0.9, seed: 13.0 },
  ];

  const render = (t: number, par: number) => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    const u = Math.max(w, h) / 1400;
    for (const p of peaks) {
      const cx = p.x * w;
      const cy = p.y * h - par;
      const warp = p.warp * u;
      for (let k = 1; k <= p.rings; k++) {
        const breathe = 1 + 0.03 * Math.sin(t * p.sp + k * 0.4 + p.seed);
        const rad = p.base * k * breathe * u;
        ctx.beginPath();
        const steps = 72;
        for (let s = 0; s <= steps; s++) {
          const a = (s / steps) * Math.PI * 2;
          const rr =
            rad +
            Math.sin(a * 2 + t * 0.22 + p.seed) * (warp * 0.6) +
            Math.sin(a * 3 - t * 0.16 + k * 0.5) * (warp * 0.3);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr * p.aspect;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = stroke(Math.max(0.22, 0.7 - k * 0.06));
        ctx.stroke();
      }
    }
  };

  let raf = 0;
  let last = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };

  if (reduce) {
    render(0, 0);
  } else {
    const loop = (now: number) => {
      if (!canvas.isConnected) {
        stop();
        return;
      }
      if (now - last >= 33) {
        last = now;
        const sy = window.scrollY || window.pageYOffset || 0;
        render(now * 0.001, sy * 0.045);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return stop;
}
