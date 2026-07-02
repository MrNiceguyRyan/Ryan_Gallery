/**
 * Flow-field contour atmosphere, drawn on a full-screen <canvas> (the
 * landonorris.com background language).
 *
 * Marching-squares contour lines of a slow multi-frequency scalar field —
 * thin flowing curves that drift like a topographic / airflow map. Every 3rd
 * line is an "index contour" (a touch stronger, the map-making convention) and
 * ONE level is drawn in the electric-lime accent — the occasional bright thread
 * through the field. Visible by design: no centre mask, real alpha; the field
 * evolves over time and parallaxes with scroll so it reads as flowing.
 *
 * Honors prefers-reduced-motion (one static frame). Returns a cleanup fn; also
 * self-stops once the canvas leaves the DOM.
 */

const CELL = 18; // grid resolution (px)
const SCALE = 235; // field wavelength (px) — broad, sweeping contours
const LEVELS = 8;
const RANGE = 1.7; // field values live in ≈ [-RANGE, RANGE]
const LIME_LEVEL = 3; // which iso-level is drawn in the accent

/* Thin light-olive lines, lighter than the #282c20 page so they read as
 * topography. */
const STROKE = '150, 158, 120';
const A_MAIN = 0.26;
const A_INDEX = 0.46;
const A_LIME = 0.34;

/* Scalar field — four slow terms → organic, non-repeating terrain; the time
 * coefficients give a perceptible-but-calm flow (periods ~80-160s). */
const field = (nx: number, ny: number, t: number) =>
  Math.sin(nx * 1.6 + t * 0.06) * Math.cos(ny * 1.4 - t * 0.05) +
  0.55 * Math.sin((nx + ny) * 1.0 + t * 0.04) +
  0.45 * Math.cos((nx - ny) * 1.7 - t * 0.045);

export function startAtmosphere(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Lime follows the live accent var (electric lime by default).
  const root = getComputedStyle(document.documentElement);
  const cssVar = (name: string, fb: string) => root.getPropertyValue(name).trim() || fb;
  const LIME = `${cssVar('--accent-r', '210')}, ${cssVar('--accent-g', '255')}, ${cssVar('--accent-b', '0')}`;

  let w = 0;
  let h = 0;
  let cols = 0;
  let rows = 0;
  let vals = new Float32Array(0);
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / CELL);
    rows = Math.ceil(h / CELL);
    vals = new Float32Array((cols + 1) * (rows + 1));
  };
  resize();
  window.addEventListener('resize', resize);

  const render = (t: number, scroll: number) => {
    ctx.clearRect(0, 0, w, h);
    const yOff = scroll * 0.12; // terrain travels up as the page scrolls down
    const STEP = (2 * RANGE) / LEVELS;

    // Sample the field at every grid vertex once (reused across all levels).
    for (let iy = 0; iy <= rows; iy++) {
      const ny = (iy * CELL + yOff) / SCALE;
      const base = iy * (cols + 1);
      for (let ix = 0; ix <= cols; ix++) {
        vals[base + ix] = field((ix * CELL) / SCALE, ny, t);
      }
    }

    const main = new Path2D();
    const index = new Path2D();
    const lime = new Path2D();

    for (let l = 0; l < LEVELS; l++) {
      const v = -RANGE + (l + 0.5) * STEP;
      const path = l === LIME_LEVEL ? lime : l % 3 === 0 ? index : main;
      for (let iy = 0; iy < rows; iy++) {
        const rowi = iy * (cols + 1);
        const nrow = rowi + cols + 1;
        const y0 = iy * CELL;
        const y1 = y0 + CELL;
        for (let ix = 0; ix < cols; ix++) {
          const a = vals[rowi + ix];      // top-left
          const b = vals[rowi + ix + 1];  // top-right
          const c = vals[nrow + ix + 1];  // bottom-right
          const d = vals[nrow + ix];      // bottom-left
          let cse = 0;
          if (a >= v) cse |= 8;
          if (b >= v) cse |= 4;
          if (c >= v) cse |= 2;
          if (d >= v) cse |= 1;
          if (cse === 0 || cse === 15) continue;

          const x0 = ix * CELL;
          const x1 = x0 + CELL;
          const T = () => [x0 + (CELL * (v - a)) / (b - a), y0] as const;
          const R = () => [x1, y0 + (CELL * (v - b)) / (c - b)] as const;
          const B = () => [x0 + (CELL * (v - d)) / (c - d), y1] as const;
          const L = () => [x0, y0 + (CELL * (v - a)) / (d - a)] as const;
          const seg = (p: readonly [number, number], q: readonly [number, number]) => {
            path.moveTo(p[0], p[1]);
            path.lineTo(q[0], q[1]);
          };

          switch (cse) {
            case 1: case 14: seg(L(), B()); break;
            case 2: case 13: seg(B(), R()); break;
            case 3: case 12: seg(L(), R()); break;
            case 4: case 11: seg(T(), R()); break;
            case 6: case 9: seg(T(), B()); break;
            case 7: case 8: seg(T(), L()); break;
            case 5: seg(T(), L()); seg(B(), R()); break; // saddle
            case 10: seg(T(), R()); seg(B(), L()); break; // saddle
          }
        }
      }
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${STROKE}, ${A_MAIN})`;
    ctx.stroke(main);
    ctx.strokeStyle = `rgba(${STROKE}, ${A_INDEX})`;
    ctx.stroke(index);
    // The lime thread — a hair thicker with a soft glow so it reads as accent.
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(${LIME}, ${A_LIME})`;
    ctx.shadowColor = `rgba(${LIME}, 0.5)`;
    ctx.shadowBlur = 6;
    ctx.stroke(lime);
    ctx.shadowBlur = 0;
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
        render(now * 0.001, window.scrollY || window.pageYOffset || 0);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return stop;
}
