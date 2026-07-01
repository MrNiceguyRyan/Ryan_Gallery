/**
 * Topographic site atmosphere, drawn on a <canvas>.
 *
 * Marching-squares contour lines of a slow multi-frequency scalar field —
 * a faint topographic map that the whole (dark) site sits on. Deliberately
 * sparse and thin, with every 3rd line an "index contour" set a touch stronger
 * (the map-making convention). It reads as cartography — on theme with the
 * archive's coordinates, the route rail, and the /travel atlas.
 *
 * The contour renderer is exported so the hero atlas (lib/atlas.ts) can draw
 * the SAME terrain language at a louder volume.
 *
 * Motion is meaningful, not aimless: the terrain scrolls UP with the page over
 * a very slow idle drift. A radial mask fades the centre so the lines surface
 * mostly in the margins. Honors prefers-reduced-motion (one static frame).
 */

export interface ContourOpts {
  /** Grid resolution in px — bigger = calmer, fewer segments. */
  cell: number;
  /** Field wavelength in px — bigger = broader, sweeping contours. */
  scale: number;
  /** Number of iso-levels sampled across the field's range. */
  levels: number;
  /** 'r, g, b' stroke color triplet. */
  stroke: string;
  alphaMain: number;
  alphaIndex: number;
}

/* Scalar field. nx,ny already divided by scale. Four slow terms → organic,
 * non-repeating terrain; the tiny time coefficients give an idle drift. */
const field = (nx: number, ny: number, t: number) =>
  Math.sin(nx * 1.6 + t * 0.03) * Math.cos(ny * 1.4 - t * 0.024) +
  0.55 * Math.sin((nx + ny) * 1.0 + t * 0.018) +
  0.45 * Math.cos((nx - ny) * 1.7 - t * 0.021);

const RANGE = 1.7; // field values live in ≈ [-RANGE, RANGE]

/**
 * Draw one frame of contour lines into `ctx` (CSS-pixel space, untransformed).
 * `yOff` shifts the sampled terrain vertically (scroll travel).
 */
export function drawContours(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  yOff: number,
  o: ContourOpts,
): void {
  const cols = Math.ceil(w / o.cell);
  const rows = Math.ceil(h / o.cell);
  const vals = new Float32Array((cols + 1) * (rows + 1));
  const STEP = (2 * RANGE) / o.levels;

  // Sample the field at every grid vertex once (reused across all levels).
  for (let iy = 0; iy <= rows; iy++) {
    const ny = (iy * o.cell + yOff) / o.scale;
    const base = iy * (cols + 1);
    for (let ix = 0; ix <= cols; ix++) {
      vals[base + ix] = field((ix * o.cell) / o.scale, ny, t);
    }
  }

  const main = new Path2D();
  const index = new Path2D();

  for (let l = 0; l < o.levels; l++) {
    const v = -RANGE + (l + 0.5) * STEP;
    const path = l % 3 === 0 ? index : main;
    for (let iy = 0; iy < rows; iy++) {
      const row = iy * (cols + 1);
      const nrow = row + cols + 1;
      const y0 = iy * o.cell;
      const y1 = y0 + o.cell;
      for (let ix = 0; ix < cols; ix++) {
        const a = vals[row + ix];       // top-left
        const b = vals[row + ix + 1];   // top-right
        const c = vals[nrow + ix + 1];  // bottom-right
        const d = vals[nrow + ix];      // bottom-left
        let cse = 0;
        if (a >= v) cse |= 8;
        if (b >= v) cse |= 4;
        if (c >= v) cse |= 2;
        if (d >= v) cse |= 1;
        if (cse === 0 || cse === 15) continue;

        const x0 = ix * o.cell;
        const x1 = x0 + o.cell;
        // Edge crossings (linear interpolation), computed only when used.
        const T = () => [x0 + (o.cell * (v - a)) / (b - a), y0] as const;
        const R = () => [x1, y0 + (o.cell * (v - b)) / (c - b)] as const;
        const B = () => [x0 + (o.cell * (v - d)) / (c - d), y1] as const;
        const L = () => [x0, y0 + (o.cell * (v - a)) / (d - a)] as const;
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
  ctx.strokeStyle = `rgba(${o.stroke}, ${o.alphaMain})`;
  ctx.stroke(main);
  ctx.strokeStyle = `rgba(${o.stroke}, ${o.alphaIndex})`;
  ctx.stroke(index);
}

/** Standard resize: cap DPR (soft lines don't need full Retina), return CSS size. */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

export const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Page-background contour settings — faint light-olive lines, lighter than
 * the #282c20 page so they read as topography. */
const PAGE_OPTS: ContourOpts = {
  cell: 18,
  scale: 230,
  levels: 7,
  stroke: '120, 132, 92',
  alphaMain: 0.11,
  alphaIndex: 0.2,
};

export function startAtmosphere(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduce = prefersReducedMotion();

  let w = 0;
  let h = 0;
  const resize = () => {
    ({ w, h } = fitCanvas(canvas, ctx));
  };
  resize();
  window.addEventListener('resize', resize);

  const render = (t: number, scroll: number) => {
    ctx.clearRect(0, 0, w, h);
    drawContours(ctx, w, h, t, scroll * 0.15, PAGE_OPTS);

    // Radial mask — fade the centre so lines surface mostly in the margins.
    const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0.38)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
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
