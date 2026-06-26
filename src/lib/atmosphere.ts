/**
 * Animated topographic-contour site atmosphere, drawn on a <canvas>.
 *
 * A real elevation-map look: iso-lines of a smooth, slowly-evolving scalar field
 * (multi-frequency noise) extracted with marching squares. The contours wind
 * ACROSS the frame from one edge to another, close into loops around peaks and
 * valleys, and naturally vary in density (tight where the terrain is steep,
 * sparse where it's flat) — not concentric circles, not straight bands. They're
 * stroked in a faint olive a hair lighter than the page, so the field reads as
 * quiet texture. The terrain drifts slowly and parallaxes with scroll.
 *
 * Honors prefers-reduced-motion (single static frame). Returns a cleanup fn;
 * also self-stops once the canvas leaves the DOM (SPA nav).
 */
export function startAtmosphere(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const STROKE = 'rgba(68, 74, 52, 0.52)'; // clearly readable olive over the #282c20 page
  const CELL = 16;   // grid cell px — smaller = smoother lines, more compute
  const SCALE = 150; // px per field "world" unit — larger = broader terrain
  const LEVELS = 11; // number of contour rings across the field's range

  let w = 0;
  let h = 0;
  let nx = 0;
  let ny = 0;
  let grid: Float32Array = new Float32Array(0);
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nx = Math.ceil(w / CELL) + 2;
    ny = Math.ceil(h / CELL) + 2;
    grid = new Float32Array(nx * ny);
  };
  resize();
  window.addEventListener('resize', resize);

  // Smooth, evolving scalar field. The components run at different spatial
  // frequencies AND different time rates, so the terrain beats in and out of
  // phase — that's the fast/slow rhythm, with no two regions ever identical.
  const field = (x: number, y: number, t: number) =>
    Math.sin(x * 1.10 + t * 0.10) * 0.60 +
    Math.cos(y * 0.90 - t * 0.08) * 0.60 +
    Math.sin((x + y) * 0.70 + t * 0.06) * 0.50 +
    Math.cos((x - y) * 0.50 - t * 0.05) * 0.50 +
    Math.sin(x * 0.40 + y * 1.30 + t * 0.04) * 0.40;

  const AMP = 2.6; // sum of component amplitudes → field range ≈ ±AMP

  const render = (t: number, par: number) => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = STROKE;
    ctx.lineJoin = 'round';

    // Sample the field onto the grid (parallax shifts the sampled terrain in y).
    for (let j = 0; j < ny; j++) {
      const wy = (j * CELL + par) / SCALE;
      const base = j * nx;
      for (let i = 0; i < nx; i++) {
        grid[base + i] = field((i * CELL) / SCALE, wy, t);
      }
    }

    // Marching squares per contour level → one batched path per level.
    for (let l = 0; l < LEVELS; l++) {
      const L = -AMP + ((l + 0.5) / LEVELS) * 2 * AMP;
      ctx.beginPath();
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const tl = grid[j * nx + i];
          const tr = grid[j * nx + i + 1];
          const br = grid[(j + 1) * nx + i + 1];
          const bl = grid[(j + 1) * nx + i];
          let c = 0;
          if (tl >= L) c |= 8;
          if (tr >= L) c |= 4;
          if (br >= L) c |= 2;
          if (bl >= L) c |= 1;
          if (c === 0 || c === 15) continue;
          // Edge crossing points (linear interpolation), in pixels.
          const T = () => { const m = (L - tl) / (tr - tl); return [(i + m) * CELL, j * CELL]; };
          const R = () => { const m = (L - tr) / (br - tr); return [(i + 1) * CELL, (j + m) * CELL]; };
          const B = () => { const m = (L - bl) / (br - bl); return [(i + m) * CELL, (j + 1) * CELL]; };
          const Le = () => { const m = (L - tl) / (bl - tl); return [i * CELL, (j + m) * CELL]; };
          const seg = (a: number[], b: number[]) => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); };
          switch (c) {
            case 1: case 14: seg(Le(), B()); break;
            case 2: case 13: seg(B(), R()); break;
            case 3: case 12: seg(Le(), R()); break;
            case 4: case 11: seg(T(), R()); break;
            case 6: case 9: seg(T(), B()); break;
            case 7: case 8: seg(T(), Le()); break;
            case 5: seg(T(), Le()); seg(B(), R()); break;
            case 10: seg(T(), R()); seg(Le(), B()); break;
          }
        }
      }
      ctx.stroke();
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
        render(now * 0.001, sy * 0.06);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return stop;
}
