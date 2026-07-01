/**
 * Topographic site atmosphere, drawn on a <canvas>.
 *
 * Marching-squares contour lines of a slow multi-frequency scalar field —
 * a faint topographic map that the whole (dark) site sits on. Deliberately
 * sparse and thin: 7 levels, delicate olive strokes, every 3rd an "index
 * contour" set a touch stronger (the map-making convention). It reads as
 * cartography — on theme with the archive's coordinates, the route rail, and
 * the /travel atlas — rather than ambient decoration.
 *
 * Motion is meaningful, not aimless: the terrain scrolls UP with the page (like
 * travelling across a map) over a very slow idle drift. A radial mask fades the
 * centre so the lines only surface in the margins/dark areas, never competing
 * with content. Honors prefers-reduced-motion (one static frame). Returns a
 * cleanup fn; self-stops once the canvas leaves the DOM.
 */
export function startAtmosphere(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Faint light-olive lines, lighter than the #282c20 page so they read as
  // topography. Index contours (every 3rd) get the stronger alpha.
  const STROKE = '120, 132, 92';
  const A_MAIN = 0.085;
  const A_INDEX = 0.16;

  const CELL = 18; // grid resolution (px) — bigger = calmer, fewer segments
  const SCALE = 230; // field wavelength — bigger = broader, sweeping contours
  const LEVELS = 7;
  const LO = -1.7;
  const STEP = (2 * 1.7) / LEVELS;

  // Scalar field. x,y already divided by SCALE. Four slow terms → organic,
  // non-repeating terrain; the tiny time coefficients give an idle drift.
  const field = (nx: number, ny: number, t: number) =>
    Math.sin(nx * 1.6 + t * 0.03) * Math.cos(ny * 1.4 - t * 0.024) +
    0.55 * Math.sin((nx + ny) * 1.0 + t * 0.018) +
    0.45 * Math.cos((nx - ny) * 1.7 - t * 0.021);

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
    const yOff = scroll * 0.15; // terrain travels up as the page scrolls down

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

    for (let l = 0; l < LEVELS; l++) {
      const v = LO + (l + 0.5) * STEP;
      const path = l % 3 === 0 ? index : main;
      for (let iy = 0; iy < rows; iy++) {
        const row = iy * (cols + 1);
        const nrow = row + cols + 1;
        const y0 = iy * CELL;
        const y1 = y0 + CELL;
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

          const x0 = ix * CELL;
          const x1 = x0 + CELL;
          // Edge crossings (linear interpolation), computed only when used.
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

    // Radial mask — fade the centre so lines only surface in the margins.
    const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.12)');
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
