/**
 * Animated "topographic" site atmosphere, drawn on a <canvas>.
 *
 * A field of scattered "peaks": each emits a stack of nested, irregular closed
 * contours (like the rings of an elevation map). Every contour's radius is
 * warped by several sine harmonics whose phases drift with time, so the lines
 * are never circular and continuously reshape — dense, irregular lines in
 * organic motion. No horizontal banding. The peaks overlap to fill the frame.
 *
 * Motion is continuous and organic (never a flicker). Honors
 * prefers-reduced-motion by drawing a single static frame, and caps the redraw
 * rate to stay light. Returns a cleanup fn; also self-stops once the canvas
 * leaves the DOM (SPA nav).
 */
export function startAtmosphere(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Stroke colour from the live accent var (sky-blue), with a safe fallback.
  const root = getComputedStyle(document.documentElement);
  const cssVar = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  const R = cssVar('--accent-r', '108');
  const G = cssVar('--accent-g', '171');
  const B = cssVar('--accent-b', '221');
  const ink = (a: number) => `rgba(${R},${G},${B},${a})`;

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

  // Scattered elevation "peaks" (relative coords; some past the edges so the
  // contour field continues off-frame). Each has its own size, ring count,
  // aspect, tempo and phase seed → a dense, non-repeating topographic field.
  const peaks = [
    { x: 0.16, y: 0.26, rings: 8, base: 26, warp: 24, sp: 1.7, aspect: 0.92, seed: 0.0 },
    { x: 0.46, y: 0.12, rings: 7, base: 30, warp: 28, sp: 1.3, aspect: 1.06, seed: 1.7 },
    { x: 0.80, y: 0.22, rings: 8, base: 25, warp: 22, sp: 1.9, aspect: 0.88, seed: 3.1 },
    { x: 0.27, y: 0.62, rings: 9, base: 28, warp: 30, sp: 1.5, aspect: 0.96, seed: 4.6 },
    { x: 0.62, y: 0.55, rings: 8, base: 27, warp: 26, sp: 1.7, aspect: 1.08, seed: 6.0 },
    { x: 0.90, y: 0.66, rings: 7, base: 27, warp: 24, sp: 1.6, aspect: 0.9, seed: 7.4 },
    { x: 0.06, y: 0.82, rings: 7, base: 27, warp: 26, sp: 1.55, aspect: 1.0, seed: 8.8 },
    { x: 0.52, y: 0.90, rings: 8, base: 28, warp: 28, sp: 1.45, aspect: 0.94, seed: 10.2 },
  ];

  const render = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    const u = Math.max(w, h) / 1400; // scale the field with the viewport

    for (const p of peaks) {
      const cx = p.x * w;
      const cy = p.y * h;
      const warp = p.warp * u;
      for (let k = 1; k <= p.rings; k++) {
        const breathe = 1 + 0.045 * Math.sin(t * p.sp + k * 0.5 + p.seed);
        const rad = p.base * k * breathe * u;
        ctx.beginPath();
        const steps = 84;
        for (let s = 0; s <= steps; s++) {
          const a = (s / steps) * Math.PI * 2;
          const rr =
            rad +
            Math.sin(a * 2 + t * 0.9 + p.seed) * (warp * 0.5) +
            Math.sin(a * 3 - t * 0.65 + k * 0.7) * (warp * 0.34) +
            Math.sin(a * 5 + t * 1.3 + p.seed * 1.3) * (warp * 0.18);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr * p.aspect;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = ink(Math.max(0.035, 0.13 - k * 0.011));
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
    render(0);
  } else {
    const loop = (now: number) => {
      if (!canvas.isConnected) {
        stop();
        return;
      }
      if (now - last >= 22) {
        last = now;
        render(now * 0.001);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return stop;
}
