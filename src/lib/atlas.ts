import { drawContours, fitCanvas, prefersReducedMotion, type ContourOpts } from './atmosphere';

/**
 * Hero atlas — the homepage opener drawn as a living route map.
 *
 * The archive's real coordinates (one per collection, in on-screen order)
 * are projected into the hero and joined into a journey: contour terrain +
 * a fine blueprint grid underneath, a faint dashed "planned" line, and a
 * lime "traveled" line that draws itself in once on load, lighting each
 * waypoint as it passes. Afterwards a small position dot cruises the route.
 *
 * Same terrain language as the page background (drawContours), one volume
 * louder. Calm by design: slow breathing rings, no flashing. Reduced motion
 * renders a single fully-drawn static frame.
 */

export interface AtlasWaypoint {
  label: string;
  lat: number;
  lng: number;
}

/* Contours in the hero — the shared field, a touch stronger than the page. */
const HERO_CONTOURS: ContourOpts = {
  cell: 20,
  scale: 260,
  levels: 6,
  stroke: '120, 132, 92',
  alphaMain: 0.1,
  alphaIndex: 0.19,
};

const SAMPLES_PER_SEG = 28; // route curve resolution
const DRAW_DELAY = 0.8; // s — let the masthead type land first
const DRAW_TIME = 4.5; // s — the route draws itself in
const CRUISE_PERIOD = 26; // s — position-dot lap time after the draw

const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

/* Catmull-Rom through all points (the curve passes THROUGH every waypoint,
 * so nodes sit exactly on the line), sampled to a flat polyline. */
function sampleRoute(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 2) return pts.slice();
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < SAMPLES_PER_SEG; s++) {
      const u = s / SAMPLES_PER_SEG;
      const u2 = u * u;
      const u3 = u2 * u;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
      });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

export function startAtlas(canvas: HTMLCanvasElement, waypoints: AtlasWaypoint[]): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduce = prefersReducedMotion();

  // Accent follows the live CSS vars (electric lime by default).
  const root = getComputedStyle(document.documentElement);
  const cssVar = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  const LIME = `${cssVar('--accent-r', '210')}, ${cssVar('--accent-g', '255')}, ${cssVar('--accent-b', '0')}`;

  let w = 0;
  let h = 0;
  let nodes: { x: number; y: number; label: string }[] = [];
  let route: { x: number; y: number }[] = [];
  let bbox: { latMin: number; latMax: number; lngMin: number; lngMax: number } | null = null;

  const project = () => {
    nodes = [];
    route = [];
    bbox = null;
    if (!waypoints.length) return;
    let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
    for (const p of waypoints) {
      latMin = Math.min(latMin, p.lat); latMax = Math.max(latMax, p.lat);
      lngMin = Math.min(lngMin, p.lng); lngMax = Math.max(lngMax, p.lng);
    }
    bbox = { latMin, latMax, lngMin, lngMax };
    // Padded stage — clear of the masthead (top) and the statement (bottom).
    const padX = w * 0.14;
    const padT = h * 0.24;
    const padB = h * 0.34;
    const sw = w - padX * 2;
    const sh = h - padT - padB;
    const dLng = lngMax - lngMin || 1;
    const dLat = latMax - latMin || 1;
    nodes = waypoints.map((p) => ({
      x: padX + ((p.lng - lngMin) / dLng) * sw,
      y: padT + ((latMax - p.lat) / dLat) * sh,
      label: p.label,
    }));
    route = sampleRoute(nodes);
  };

  const resize = () => {
    ({ w, h } = fitCanvas(canvas, ctx));
    project();
  };
  resize();
  window.addEventListener('resize', resize);

  const render = (t: number, appear: number) => {
    ctx.clearRect(0, 0, w, h);

    // ── Terrain ──
    drawContours(ctx, w, h, t, 0, HERO_CONTOURS);

    // ── Blueprint grid + edge ticks ──
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(244, 244, 237, 0.03)';
    ctx.beginPath();
    for (let x = 120; x < w; x += 120) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 120; y < h; y += 120) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(244, 244, 237, 0.08)';
    ctx.beginPath();
    for (let x = 60; x < w; x += 60) {
      ctx.moveTo(x, 0); ctx.lineTo(x, 5);
      ctx.moveTo(x, h); ctx.lineTo(x, h - 5);
    }
    for (let y = 60; y < h; y += 60) {
      ctx.moveTo(0, y); ctx.lineTo(5, y);
      ctx.moveTo(w, y); ctx.lineTo(w - 5, y);
    }
    ctx.stroke();

    // ── Corner coordinates (real bbox of the journey) ──
    if (bbox && w >= 560) {
      ctx.font = '9px "Space Grotesk", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(244, 244, 237, 0.24)';
      const fmt = (lat: number, lng: number) =>
        `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`;
      ctx.textAlign = 'left';
      ctx.fillText(fmt(bbox.latMax, bbox.lngMin), w * 0.14, h * 0.24 - 12);
      ctx.textAlign = 'right';
      ctx.fillText(fmt(bbox.latMin, bbox.lngMax), w * 0.86, h - h * 0.34 + 16);
      ctx.textAlign = 'left';
    }

    if (route.length < 2) return;

    // ── Planned route — faint dashed full path ──
    ctx.beginPath();
    ctx.moveTo(route[0].x, route[0].y);
    for (let i = 1; i < route.length; i++) ctx.lineTo(route[i].x, route[i].y);
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = 'rgba(244, 244, 237, 0.13)';
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Traveled route — lime, draws itself in ──
    const m = Math.max(1, Math.floor(appear * (route.length - 1)));
    ctx.beginPath();
    ctx.moveTo(route[0].x, route[0].y);
    for (let i = 1; i <= m; i++) ctx.lineTo(route[i].x, route[i].y);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(${LIME}, 0.68)`;
    ctx.shadowColor = `rgba(${LIME}, 0.45)`;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Waypoints ──
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k];
      const reachedAt = (k * SAMPLES_PER_SEG) / (route.length - 1);
      const reached = appear >= Math.min(1, reachedAt);
      if (reached) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${LIME}, 0.9)`;
        ctx.fill();
        // Breathing ring — slow, gentle, never off.
        const ra = reduce ? 0.2 : 0.15 + 0.08 * Math.sin(t * 1.1 + k * 1.3);
        ctx.beginPath();
        ctx.arc(n.x, n.y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${LIME}, ${ra})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(244, 244, 237, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (w >= 560) {
        ctx.font = '600 9px "Space Grotesk", ui-monospace, monospace';
        ctx.fillStyle = reached ? 'rgba(244, 244, 237, 0.55)' : 'rgba(244, 244, 237, 0.28)';
        ctx.fillText(`${String(k + 1).padStart(2, '0')} ${n.label.toUpperCase()}`, n.x + 10, n.y - 8);
      }
    }

    // ── Position dot — cruises the drawn route ──
    if (appear >= 1 && !reduce) {
      const p = (t / CRUISE_PERIOD) % 1;
      const i = Math.min(route.length - 1, Math.floor(p * (route.length - 1)));
      const d = route[i];
      const halo = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 12);
      halo.addColorStop(0, `rgba(${LIME}, 0.35)`);
      halo.addColorStop(1, `rgba(${LIME}, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(d.x - 12, d.y - 12, 24, 24);
      ctx.beginPath();
      ctx.arc(d.x, d.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${LIME}, 0.95)`;
      ctx.fill();
    }
  };

  let raf = 0;
  let last = 0;
  let t0 = -1;
  const stop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };

  if (reduce) {
    render(0, 1); // static frame, route fully drawn
  } else {
    const loop = (now: number) => {
      if (!canvas.isConnected) {
        stop();
        return;
      }
      if (t0 < 0) t0 = now;
      if (now - last >= 33) {
        last = now;
        const t = (now - t0) * 0.001;
        const appear = easeInOutCubic(Math.min(1, Math.max(0, (t - DRAW_DELAY) / DRAW_TIME)));
        render(t, appear);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return stop;
}
