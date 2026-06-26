/**
 * Animated "topographic" site atmosphere, drawn on a <canvas>.
 *
 * Two organic layers, in the site's sky-blue accent over the dark page:
 *   1. Flowing contour ridges — near-horizontal lines warped by layered sines
 *      whose phase drifts with time, so the whole field flows like a slow current.
 *   2. Breathing concentric ripples — a few centres each emit nested, slightly
 *      irregular rings that pulse (expand / contract) and warp, like ripples
 *      spreading on water.
 *
 * The motion is slow and continuous (landonorris-style) — never a flicker. It
 * honors prefers-reduced-motion by drawing a single static frame, and caps to
 * ~30fps to stay light alongside the homepage's other animation. Returns a
 * cleanup function; also self-stops once the canvas leaves the DOM (SPA nav).
 */
export function startAtmosphere(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Stroke colour from the live accent var (sky-blue), with a safe fallback.
  const root = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  const R = v('--accent-r', '108');
  const G = v('--accent-g', '171');
  const B = v('--accent-b', '221');
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

  // Ripple centres in relative coords; each breathes on its own tempo.
  const centres = [
    { x: 0.28, y: 0.42, rings: 7, base: 44, warp: 20, sp: 0.55 },
    { x: 0.76, y: 0.64, rings: 6, base: 52, warp: 24, sp: 0.42 },
    { x: 0.54, y: 0.13, rings: 5, base: 38, warp: 15, sp: 0.70 },
  ];

  const render = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;

    // ── Flowing contour ridges ──
    const N = 12;
    for (let i = 0; i < N; i++) {
      const baseY = (i / (N - 1)) * (h * 1.12) - h * 0.06;
      ctx.beginPath();
      for (let x = -24; x <= w + 24; x += 10) {
        const k = x / (w || 1);
        const y =
          baseY +
          Math.sin(k * 5.8 + t * 0.10 + i * 0.7) * 26 +
          Math.sin(k * 2.7 - t * 0.07 + i * 1.3) * 16 +
          Math.sin(k * 11 + t * 0.05) * 6;
        if (x <= -24) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = ink(0.05 + (i % 3) * 0.02);
      ctx.stroke();
    }

    // ── Breathing concentric ripples ──
    for (const c of centres) {
      const cx = c.x * w;
      const cy = c.y * h;
      for (let k = 1; k <= c.rings; k++) {
        const breathe = 1 + 0.07 * Math.sin(t * c.sp + k * 0.5);
        const rad = c.base * k * breathe;
        ctx.beginPath();
        const steps = 72;
        for (let s = 0; s <= steps; s++) {
          const a = (s / steps) * Math.PI * 2;
          const rr =
            rad +
            Math.sin(a * 3 + t * 0.20 + k) * (c.warp * 0.5) +
            Math.sin(a * 2 - t * 0.13) * (c.warp * 0.5);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr * 0.8;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = ink(Math.max(0.03, 0.12 - k * 0.012));
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
      if (now - last >= 33) {
        last = now;
        render(now * 0.001);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return stop;
}
