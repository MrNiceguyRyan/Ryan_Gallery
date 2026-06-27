/**
 * Aurora-flow site atmosphere, drawn on a <canvas>.
 *
 * A handful of large, soft radial light "blobs" — mostly a warm olive a touch
 * lighter than the page, with a couple of faint lime accents — drift, breathe,
 * and overlap additively to make a slow flowing aurora behind the content. It's
 * deliberately faint and very slow: atmosphere, never a subject, and no flicker.
 *
 * Honors prefers-reduced-motion (a single static frame). Returns a cleanup fn;
 * also self-stops once the canvas leaves the DOM (SPA nav).
 */
export function startAtmosphere(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Lime follows the live accent var; olive is a fixed soft tone lighter than
  // the #282c20 page so additive overlaps read as a gentle glow, not a wash.
  const root = getComputedStyle(document.documentElement);
  const cssVar = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  const LIME = `${cssVar('--accent-r', '210')}, ${cssVar('--accent-g', '255')}, ${cssVar('--accent-b', '0')}`;
  const OLIVE = '78, 92, 56';

  // Each blob drifts on slow sine LFOs (period ~40-80s), breathes its radius,
  // and is painted with `lighter` (additive) blending for the aurora glow.
  const blobs = [
    { lime: false, x: 0.20, y: 0.28, r: 0.52, ax: 0.11, ay: 0.07, sx: 0.11, sy: 0.08, ph: 0.0, a: 0.17 },
    { lime: false, x: 0.76, y: 0.24, r: 0.56, ax: 0.12, ay: 0.09, sx: 0.09, sy: 0.12, ph: 1.7, a: 0.16 },
    { lime: true, x: 0.55, y: 0.58, r: 0.42, ax: 0.10, ay: 0.11, sx: 0.10, sy: 0.08, ph: 3.1, a: 0.085 },
    { lime: false, x: 0.86, y: 0.70, r: 0.50, ax: 0.10, ay: 0.10, sx: 0.08, sy: 0.13, ph: 4.6, a: 0.15 },
    { lime: false, x: 0.14, y: 0.78, r: 0.50, ax: 0.12, ay: 0.08, sx: 0.12, sy: 0.10, ph: 6.0, a: 0.16 },
    { lime: true, x: 0.36, y: 0.16, r: 0.36, ax: 0.09, ay: 0.10, sx: 0.10, sy: 0.11, ph: 7.4, a: 0.07 },
  ];

  let w = 0;
  let h = 0;
  const resize = () => {
    // Aurora is soft, so it doesn't need full Retina — cap DPR to save the
    // per-frame full-screen gradient fills.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const render = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    const u = Math.max(w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of blobs) {
      const cx = (b.x + Math.sin(t * b.sx + b.ph) * b.ax) * w;
      const cy = (b.y + Math.cos(t * b.sy + b.ph * 1.3) * b.ay) * h;
      const rad = b.r * u * (1 + 0.08 * Math.sin(t * 0.05 + b.ph));
      const col = b.lime ? LIME : OLIVE;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, `rgba(${col}, ${b.a})`);
      g.addColorStop(0.45, `rgba(${col}, ${b.a * 0.4})`);
      g.addColorStop(1, `rgba(${col}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
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
      if (now - last >= 40) {
        last = now;
        render(now * 0.001);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return stop;
}
