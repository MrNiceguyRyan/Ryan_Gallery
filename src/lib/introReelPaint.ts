// ── The opening reel's hand ──
// Draws one frame of the reel (src/lib/introReel.ts keeps its clock and
// geometry). Everything is drawn in the design frame (1728×1000, or 390×844 on
// a phone) through a context that is either the live canvas or, for the
// server's first paint, src/lib/introReelSvg.ts's recorder — so the scenes
// stick to paths, fills, clips and transforms (no gradients, no filters, no
// images); only the renderer at the bottom is canvas-only.
//
// The hand is Picasso's between the wars, cut paper and printer's ink: flat
// planes of the ticket stocks' own hues lifted to print lightness; one
// near-black ink laid down as tapered brush strokes; every ball split down an
// S-curve into two colours (the double face), seen twice at once (an echo of
// its outline, or of where it just was); its pattern carried out past its
// edge into the ground. No gradients, no neon. Lime stays in the interface:
// the DOM scroll cue, and the viewfinder's focus lamp once the cue is gone.

import {
  type Mat3,
  type ReelScore,
  type SphereKind,
  type Vec2,
  type Vec3,
  apply,
  beatAt,
  bump,
  circlePoly,
  clamp01,
  centroid,
  cookieOutline,
  cutsAround,
  easeInOutCubic,
  footballGeometry,
  hash,
  irisBlades,
  lensed,
  lerp,
  normalize,
  resampleClosed,
  rotation,
  segment,
  shardsFromCuts,
  smootherstep,
  smoothstep,
  sphereCircle,
  spherePoints,
  visibleRuns,
  wave,
} from './introReel';

// ── Palette ─────────────────────────────────────────────────────────────────
// The ticket stocks (src/lib/ticketStock.ts) at three print lightnesses
// (OKLCH L 0.52 / 0.68 / 0.84, same hue), the site's olive and bone, a warm
// paper, the ink, and the few object colours a ball needs to be itself (a
// basketball's leather, a cookie's bake, three lamps) — each held to the same
// dusty chroma as the lifted stocks.
export const REEL_INK = {
  ink: '#16190f',
  paper: '#ebe6d6',
  paperShade: '#d7d1bf',
  bone: '#F4F4ED',
  olive: '#282c20',
  oliveMid: '#666c59',
  olivePale: '#c9ccc3',
  roseDeep: '#562f2e',
  roseMid: '#905655',
  rose: '#ca8280',
  rosePale: '#e0c2c0',
  blueDeep: '#223b55',
  blueMid: '#476c93',
  blue: '#6f9ccc',
  bluePale: '#bbcde0',
  plumDeep: '#492d43',
  plumMid: '#83597a',
  plum: '#b985ad',
  plumPale: '#d9c3d3',
  tealDeep: '#20423a',
  tealMid: '#427468',
  teal: '#6ba697',
  tealPale: '#bad0ca',
  ochreDeep: '#593d1b',
  ochreMid: '#885f2e',
  ochre: '#bf8d53',
  ochrePale: '#dbc7b1',
  slateDeep: '#35383e',
  slateMid: '#646972',
  slate: '#9398a3',
  slatePale: '#c8cacf',
  night: '#1c2230',
  leather: '#c9744a',
  leatherDark: '#8a4a2c',
  bake: '#d3a263',
  bakeDark: '#a8723a',
  chip: '#3a2417',
  lampRed: '#d4705f',
  lampAmber: '#dca352',
  lampGreen: '#6fb49c',
  stone: '#dcd8c8',
  stoneDark: '#2a3140',
} as const;
const C = REEL_INK;

/** The subset of CanvasRenderingContext2D the scenes use (the SVG recorder
 *  implements exactly this). */
export type ReelCtx = Pick<
  CanvasRenderingContext2D,
  | 'save' | 'restore' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'arc'
  | 'fill' | 'stroke' | 'clip' | 'translate' | 'rotate' | 'scale' | 'fillRect'
  | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'lineCap' | 'lineJoin' | 'globalAlpha'
>;

// ── The hand: paths, brush strokes ─────────────────────────────────────────

function path(ctx: ReelCtx, pts: readonly Vec2[], close = true) {
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}
function fillPoly(ctx: ReelCtx, pts: readonly Vec2[], color: string, alpha = 1) {
  if (pts.length < 3 || alpha <= 0.002) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.beginPath();
  path(ctx, pts);
  ctx.fill();
  ctx.globalAlpha = 1;
}
function fillPolys(ctx: ReelCtx, polys: readonly (readonly Vec2[])[], color: string, alpha = 1) {
  if (!polys.length || alpha <= 0.002) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const p of polys) if (p.length >= 3) path(ctx, p);
  ctx.fill();
  ctx.globalAlpha = 1;
}
function line(ctx: ReelCtx, pts: readonly Vec2[], color: string, width: number, alpha = 1) {
  if (pts.length < 2 || alpha <= 0.002) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path(ctx, pts, false);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
function dot(ctx: ReelCtx, x: number, y: number, r: number, color: string, alpha = 1) {
  if (r <= 0 || alpha <= 0.002) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
function clipTo(ctx: ReelCtx, pts: readonly Vec2[]) {
  ctx.beginPath();
  path(ctx, pts);
  ctx.clip();
}

/** A brush stroke's outline: width follows `width(t)` along it (t by length). */
function brushOutline(pts: readonly Vec2[], width: (t: number, i: number) => number): Vec2[] {
  const n = pts.length;
  if (n < 2) return [];
  const lengths = [0];
  for (let i = 1; i < n; i += 1) lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lengths[n - 1] || 1;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const w = Math.max(0, width(lengths[i] / total, i)) / 2;
    left.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
    right.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
  }
  return [...left, ...right.reverse()];
}
const taper = (t: number, a = 0.14, b = 0.18) => Math.max(0, Math.min(1, t / a, (1 - t) / b)) ** 0.55;
function brush(ctx: ReelCtx, pts: readonly Vec2[], width: number, color: string, alpha = 1, ends: [number, number] = [0.14, 0.18]) {
  if (pts.length < 2) return;
  fillPoly(ctx, brushOutline(pts, (t) => width * Math.max(0.08, taper(t, ends[0], ends[1]))), color, alpha);
}
/** A drawn ellipse: one gesture a little over a full turn, heavier on one
 *  side, its ends overlapping and thinning out. */
function gestureRing(ctx: ReelCtx, cx: number, cy: number, rx: number, ry: number, width: number, color: string, seed: number, heavyAt = Math.PI * 0.25, alpha = 1, rot = 0) {
  const start = hash(1, seed) * Math.PI * 2;
  const sweep = Math.PI * 2 * (1.06 + hash(2, seed) * 0.05);
  const n = 128;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = start + (i / n) * sweep;
    const wob = 1 + 0.006 * wave(a * 2, seed) + (i / n) * 0.014;
    const x = Math.cos(a) * rx * wob, y = Math.sin(a) * ry * wob;
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  const outline = brushOutline(pts, (t) => {
    const a = start + t * sweep;
    const heavy = 0.5 + 0.5 * Math.cos(a - heavyAt);
    return width * (0.4 + 0.85 * heavy) * Math.max(0.1, taper(t, 0.05, 0.07));
  });
  fillPoly(ctx, outline, color, alpha);
}
function ellipsePoly(cx: number, cy: number, rx: number, ry: number, n = 72, rot = 0): Vec2[] {
  const cr = Math.cos(rot), sr = Math.sin(rot);
  return circlePoly(0, 0, 1, n).map(([x, y]) => [cx + x * rx * cr - y * ry * sr, cy + x * rx * sr + y * ry * cr] as Vec2);
}
const shift = (pts: readonly Vec2[], dx: number, dy: number) => pts.map(([x, y]) => [x + dx, y + dy] as Vec2);

// ── Spheres ────────────────────────────────────────────────────────────────

export interface Sphere {
  cx: number;
  cy: number;
  r: number;
  m: Mat3;
  /** Squash (the bounce): x and y scale of the projection about the centre. */
  sx: number;
  sy: number;
}
const project = (s: Sphere, v: Vec3): Vec2 => [s.cx + v[0] * s.r * s.sx, s.cy - v[1] * s.r * s.sy];
/** The light, in view space: from the upper left, a little in front. */
const LIGHT: Vec3 = normalize([-0.62, 0.62, 0.48]);

function limb(s: Sphere, n = 96, from = 0, to = Math.PI * 2): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = from + ((to - from) * i) / n;
    out.push([s.cx + Math.cos(a) * s.r * s.sx, s.cy + Math.sin(a) * s.r * s.sy]);
  }
  return out;
}
function sphereRuns(s: Sphere, pts: readonly Vec3[], minZ = 0): { pts: Vec2[]; z: number[] }[] {
  const rotated = pts.map((p) => apply(s.m, p));
  return visibleRuns(rotated, minZ).map((run) => ({ pts: run.map((p) => project(s, p)), z: run.map((p) => p[2]) }));
}
/** A seam: a brush stroke along a curve on the sphere, thinning toward the
 *  limb as it turns away. */
function seam(ctx: ReelCtx, s: Sphere, pts: readonly Vec3[], width: number, color: string, alpha = 1) {
  for (const run of sphereRuns(s, pts)) {
    const outline = brushOutline(run.pts, (_t, i) => width * (0.22 + 0.78 * Math.sqrt(Math.max(0, run.z[i]))));
    fillPoly(ctx, outline, color, alpha);
  }
}
/** A spherical polygon as a screen polygon: its edges are arcs, and whatever
 *  is behind is pressed onto the limb. Null when wholly behind. */
function spherePatch(s: Sphere, corners: readonly Vec3[], steps = 5): Vec2[] | null {
  const pts: Vec2[] = [];
  let front = 0;
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (let k = 0; k < steps; k += 1) {
      const t = k / steps;
      const v = apply(s.m, normalize([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
      if (v[2] >= 0) {
        front += 1;
        pts.push(project(s, v));
      } else {
        const l = Math.hypot(v[0], v[1]) || 1;
        pts.push(project(s, [v[0] / l, v[1] / l, 0]));
      }
    }
  }
  return front ? pts : null;
}

/** The dark of a sphere lit from `light`, as one flat plane: the visible
 *  terminator (faceted into `facets` straight pieces) and the limb round the
 *  dark side. Null when nothing is dark; the whole disc when all is. */
function shadowPlane(s: Sphere, light: Vec3, k = 0.04, facets = 9): Vec2[] | null {
  const circle = sphereCircle(light, k, 96);
  const runs = visibleRuns(circle);
  if (!runs.length) return light[2] > 0 ? null : limb(s);
  let run = runs[0];
  if (runs.length > 1) run = [...runs[runs.length - 1], ...runs[0].slice(1)];
  if (run.length >= circle.length - 1) return light[2] > 0 ? null : limb(s);
  const faceted: Vec3[] = [];
  for (let i = 0; i <= facets; i += 1) faceted.push(run[Math.round((i / facets) * (run.length - 1))]);
  const end = faceted[faceted.length - 1];
  const start = faceted[0];
  // Screen angles (y down) of the two limb points; walk the limb between them
  // through the dark side (the side away from the light).
  const aEnd = Math.atan2(-end[1], end[0]);
  const aStart = Math.atan2(-start[1], start[0]);
  const darkMid = Math.atan2(light[1], -light[0]);
  const TAU = Math.PI * 2;
  const ccw = ((aStart - aEnd) % TAU + TAU) % TAU; // aEnd → aStart increasing
  const off = ((darkMid - aEnd) % TAU + TAU) % TAU;
  const to = off <= ccw ? aEnd + ccw : aEnd - (TAU - ccw);
  const pts: Vec2[] = faceted.map((p) => [s.cx + p[0] * s.r * s.sx, s.cy - p[1] * s.r * s.sy]);
  return [...pts, ...limb(s, 48, aEnd, to)];
}

function hatch(ctx: ReelCtx, region: readonly Vec2[], angle: number, spacing: number, color: string, width: number, alpha: number) {
  if (region.length < 3 || alpha <= 0.002) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of region) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const reach = Math.hypot(maxX - minX, maxY - minY) / 2 + spacing;
  ctx.save();
  clipTo(ctx, region);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  const dx = Math.cos(angle), dy = Math.sin(angle);
  for (let d = -reach; d <= reach; d += spacing) {
    const px = cx - dy * d, py = cy + dx * d;
    ctx.moveTo(px - dx * reach, py - dy * reach);
    ctx.lineTo(px + dx * reach, py + dy * reach);
  }
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ── The double face: every ball split down an S ─────────────────────────────

export interface Split {
  /** The S-curve's direction, radians. */
  angle: number;
  /** Its offset from the centre along its normal, share of the radius. */
  offset: number;
  /** How far the S swings, share of the radius. */
  bend: number;
}
/** The S-curve through a point, `reach` long each way; the swing lives
 *  within one `lobe` of the point (a full sine period, eased at its ends). */
function sCurve(cx: number, cy: number, angle: number, offset: number, bend: number, lobe: number, reach: number, n = 64): Vec2[] {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const nx = -dy, ny = dx;
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i += 1) {
    const u = -reach + (2 * reach * i) / n;
    const w = Math.abs(u) < lobe ? Math.sin((Math.PI * u) / lobe) * (1 - (u / lobe) ** 2) ** 2 : 0;
    const lat = offset + bend * w;
    out.push([cx + dx * u + nx * lat, cy + dy * u + ny * lat]);
  }
  return out;
}
/** The region on the curve's normal side (+n), as a polygon. */
function sideOf(curve: readonly Vec2[], angle: number, far: number, sign = 1): Vec2[] {
  const nx = -Math.sin(angle) * sign, ny = Math.cos(angle) * sign;
  const a = curve[0], b = curve[curve.length - 1];
  return [...curve, [b[0] + nx * far, b[1] + ny * far], [a[0] + nx * far, a[1] + ny * far]];
}
function splitRegion(s: Sphere, split: Split): Vec2[] {
  const curve = sCurve(s.cx, s.cy, split.angle, split.offset * s.r, split.bend * s.r, s.r * 1.05, s.r * 1.6, 48);
  return sideOf(curve, split.angle, s.r * 3);
}
function splitLine(s: Sphere, split: Split): Vec2[] {
  return sCurve(s.cx, s.cy, split.angle, split.offset * s.r, split.bend * s.r, s.r * 1.05, s.r * 1.6, 48);
}
/** Draw `draw` twice: once on the lit face, once (with `dark` true) on the
 *  other, each clipped to the disc. */
function doubleFace(ctx: ReelCtx, s: Sphere, split: Split, draw: (dark: boolean) => void) {
  const disc = limb(s, 96);
  const region = splitRegion(s, split);
  ctx.save();
  clipTo(ctx, disc);
  draw(false);
  clipTo(ctx, region);
  draw(true);
  ctx.restore();
}
/** The S itself, drawn in ink inside the ball. */
function splitStroke(ctx: ReelCtx, s: Sphere, split: Split, width: number, alpha = 1) {
  ctx.save();
  clipTo(ctx, limb({ ...s, r: s.r * 0.995 }, 96));
  brush(ctx, splitLine(s, split), width, C.ink, alpha, [0.2, 0.2]);
  ctx.restore();
}
function ballContour(ctx: ReelCtx, s: Sphere, seed: number, weight = 0.032, alpha = 1, ink: string = C.ink) {
  gestureRing(ctx, s.cx, s.cy, s.r * s.sx, s.r * s.sy, s.r * weight, ink, seed, Math.PI * 0.3, alpha);
}
/** Seen twice: a second contour a little off the first (the other view). */
function echoRing(ctx: ReelCtx, s: Sphere, dx: number, dy: number, seed: number, alpha = 0.9, weight = 0.012, ink: string = C.ink) {
  gestureRing(ctx, s.cx + dx * s.r, s.cy + dy * s.r, s.r * s.sx * 1.01, s.r * s.sy * 1.01, s.r * weight, ink, seed, Math.PI * 1.2, alpha);
}
/** A cut-paper highlight: a small flat window of light on the lit side. */
function highlight(ctx: ReelCtx, s: Sphere, color: string, alpha = 0.9, size = 1) {
  const cx = s.cx - s.r * 0.42 * s.sx, cy = s.cy - s.r * 0.44 * s.sy;
  const a = s.r * 0.14 * size, b = s.r * 0.075 * size;
  const tilt = -0.7;
  const pts = ([[-1, -0.2], [-0.2, -1], [1, -0.55], [0.35, 0.9]] as Vec2[]).map(([x, y]) => [
    cx + (x * Math.cos(tilt) * a - y * Math.sin(tilt) * b),
    cy + (x * Math.sin(tilt) * a + y * Math.cos(tilt) * b),
  ] as Vec2);
  fillPoly(ctx, pts, color, alpha);
}
function castShadow(ctx: ReelCtx, s: Sphere, y: number, spread: number, alpha: number, dx = 0.18) {
  fillPoly(ctx, ellipsePoly(s.cx + s.r * dx, y, s.r * spread, s.r * spread * 0.15, 48), C.ink, alpha);
}

// ── Scenes ─────────────────────────────────────────────────────────────────

export interface Env {
  /** Design frame. */
  w: number;
  h: number;
  phone: boolean;
  /** Idle clock, seconds. */
  t: number;
  /** Reel progress, 0–1. */
  p: number;
  /** The act's own progress (runs below 0 / above 1 through the turns). */
  a: number;
  /** Extra turn of the ball (radians of yaw) while it changes skins. */
  spin?: number;
}

interface Layout { cx: number; cy: number; r: number }
function layoutFor(env: Env): Layout {
  if (env.phone) return { cx: env.w * 0.5, cy: env.h * 0.45, r: env.w * 0.36 };
  return { cx: env.w * 0.5, cy: env.h * 0.48, r: env.h * 0.27 };
}
function ground(ctx: ReelCtx, env: Env, color: string, alpha = 1) {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fillRect(-env.w, -env.h, env.w * 3, env.h * 3);
  ctx.globalAlpha = 1;
}
/** A flat plane given in shares of the frame. */
function plane(ctx: ReelCtx, env: Env, shares: readonly Vec2[], color: string, alpha = 1) {
  fillPoly(ctx, shares.map(([x, y]) => [x * env.w, y * env.h] as Vec2), color, alpha);
}
function planeEdge(ctx: ReelCtx, env: Env, a: Vec2, b: Vec2, width: number, color: string = C.ink, alpha = 1) {
  brush(ctx, [[a[0] * env.w, a[1] * env.h], [b[0] * env.w, b[1] * env.h]], width, color, alpha, [0.02, 0.02]);
}
const W = (env: Env, desktop: number) => (env.phone ? desktop * 0.45 : desktop);

// ── 0 · The black hole in the wallpaper (the cover) ──

export function holeGeometry(env: Env) {
  const L = layoutFor(env);
  const R = env.phone ? env.w * 0.2 : env.h * 0.18;
  return { cx: L.cx, cy: env.phone ? env.h * 0.43 : env.h * 0.47, R };
}

function paintHole(ctx: ReelCtx, env: Env) {
  const { cx, cy, R } = holeGeometry(env);
  // Left alone on the cover, the hole breathes in every few seconds — a
  // small tug on the paper toward it — as if drawing the reader down; the
  // scroll then takes the pull over. (At t = 0 there is no tug, so the
  // server's cover and the canvas's first frame are the same picture.)
  const tug = 0.16 * Math.max(0, Math.sin((env.t / 4.6) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5) ** 4 * (1 - segment(env.a, 0, 0.25));
  const pull = smoothstep(0, 1.15, env.a) + tug;
  // The Einstein ring widens and the paper begins to turn as the reader
  // scrolls into it.
  const re = R * (1.5 + 0.45 * pull);
  const swirl = 0.08 * Math.sin(env.t * 0.21) + 1.9 * pull * pull;
  ground(ctx, env, C.paper);
  paintWallpaper(ctx, env, cx, cy, R, re, swirl, pull);

  // The lensed disc (Gargantua, flat): the far side of the disc bent up over
  // the hole and its underside bent down under it, a ring thick above and
  // below and thin at the sides — which is what makes it a black hole and not
  // a ringed planet.
  const bands = [C.bone, C.ochrePale, C.ochre, C.rose, C.roseMid];
  const turn = env.t * 0.06 + pull * 0.9;
  const inner = R * 1.02;
  const outerAt = (a: number) => {
    const up = Math.max(0, -Math.sin(a)) ** 1.5;
    const down = Math.max(0, Math.sin(a)) ** 1.8;
    return R * (1.1 + 0.62 * up + 0.3 * down + 0.025 * Math.sin(a * 3 + turn * 4));
  };
  const ringPts = (f: number) => {
    const pts: Vec2[] = [];
    for (let k = 0; k <= 144; k += 1) {
      const a = (k / 144) * Math.PI * 2;
      const rr = lerp(inner, outerAt(a), f);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return pts;
  };
  for (let i = bands.length - 1; i >= 0; i -= 1) fillPoly(ctx, ringPts((i + 1) / bands.length), bands[i]);
  for (let i = 1; i <= bands.length; i += 1) line(ctx, ringPts(i / bands.length), C.ink, W(env, i === bands.length ? 3 : 1.3), 0.92);

  // The disc itself, nearly edge on and thin: its far half is hidden by the
  // hole, its near half crosses the hole's face.
  const tilt = -0.06 + 0.015 * Math.sin(env.t * 0.17);
  const discRings = [
    { r: 2.75, c: C.roseMid },
    { r: 2.3, c: C.rose },
    { r: 1.85, c: C.ochre },
    { r: 1.45, c: C.bone },
  ];
  const squash = 0.075;
  const discBand = (i: number) => {
    const outer = ellipsePoly(0, 0, R * discRings[i].r, R * discRings[i].r * squash, 120);
    const next = discRings[i + 1]?.r ?? 1.0;
    const innerE = ellipsePoly(0, 0, R * next, R * next * squash, 120);
    return { outer, innerE };
  };
  const paintDisc = (front: boolean) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    if (front) clipTo(ctx, [[-env.w, 0], [env.w, 0], [env.w, env.h], [-env.w, env.h]]);
    for (let i = 0; i < discRings.length; i += 1) {
      const { outer, innerE } = discBand(i);
      ctx.fillStyle = discRings[i].c;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      path(ctx, outer);
      path(ctx, [...innerE].reverse());
      ctx.fill();
      line(ctx, [...outer, outer[0]], C.ink, W(env, i === 0 ? 2.6 : 1.3), 0.95);
    }
    // Marks riding round with the disc: its turning, made visible.
    const spin = env.t * 0.45 + pull * 5;
    for (let k = 0; k < 30; k += 1) {
      const a = spin * (k % 2 ? 1 : 0.8) + (k / 30) * Math.PI * 2;
      const rr = R * (1.62 + (k % 3) * 0.42);
      const y = Math.sin(a) * rr * squash;
      if (front && y < 0) continue;
      if (!front && y > 0) continue;
      const a2 = a + 0.07;
      brush(ctx, [[Math.cos(a) * rr, y], [Math.cos(a2) * rr, Math.sin(a2) * rr * squash]], W(env, 3.2), C.ink, 0.9, [0.3, 0.3]);
    }
    ctx.restore();
  };
  paintDisc(false);
  dot(ctx, cx, cy, R, C.ink);
  paintDisc(true);
  // The photon ring: one bright gesture at the edge of the dark, and the
  // hole seen twice — a second, thinner contour off its shoulder.
  gestureRing(ctx, cx, cy, R * 1.01, R * 0.99, R * 0.032, C.bone, 11, Math.PI * 1.25);
  gestureRing(ctx, cx - R * 0.07, cy - R * 0.05, R * 1.02, R * 1.02, R * 0.01, C.ink, 13, Math.PI * 0.8, 0.75);
}

/** The harlequin wallpaper behind the hole, bent by it: every point of the
 *  lozenge grid is moved to where the lens shows it, so the lines crowd and
 *  curve round the hole into a sphere of curves; scrolling turns it into a
 *  vortex. The paper flows down the page, slowly on its own and faster with
 *  the scroll: the wallpaper itself says which way to go. */
function paintWallpaper(ctx: ReelCtx, env: Env, cx: number, cy: number, R: number, re: number, swirl: number, pull: number) {
  const cw = env.phone ? 64 : 116;
  const ch = cw * 1.46;
  const flow = env.t * (env.phone ? 14 : 26) + pull * ch * 2.6;
  const rowH = ch / 2;
  const firstRow = Math.floor(-flow / rowH) - 3;
  const rows = Math.ceil(env.h / rowH) + 7;
  const cols = Math.ceil(env.w / cw) + 4;
  const steps = 5;
  const warp = (x: number, y: number): Vec2 => {
    const [lx, ly] = lensed(x, y, cx, cy, re);
    if (swirl === 0) return [lx, ly];
    const dx = lx - cx, dy = ly - cy;
    const d = Math.hypot(dx, dy) || 1;
    const turn = swirl * (re / d) ** 1.6;
    const c = Math.cos(turn), s = Math.sin(turn);
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  };
  const fills = new Map<string, Vec2[][]>();
  const add = (color: string, poly: Vec2[]) => {
    const list = fills.get(color);
    if (list) list.push(poly);
    else fills.set(color, [poly]);
  };
  const accents = [C.rosePale, C.tealPale, C.bluePale, C.ochrePale, C.plumPale];
  const bold = [C.rose, C.ochre, C.teal, C.blueMid];
  const dots: Vec2[] = [];
  for (let row = firstRow; row < firstRow + rows; row += 1) {
    const y = row * rowH + flow;
    const offset = row & 1 ? cw / 2 : 0;
    for (let col = -2; col < cols; col += 1) {
      const x = col * cw + offset;
      const corners: Vec2[] = [[x, y - ch / 2], [x + cw / 2, y], [x, y + ch / 2], [x - cw / 2, y]];
      const pts: Vec2[] = [];
      // Near the ring the lens bends a lozenge's edges hard: draw them finer.
      const near = Math.hypot(x - cx, y - cy) < re * 2.6;
      const n = near ? steps * 4 : steps;
      for (let i = 0; i < 4; i += 1) {
        const a = corners[i], b = corners[(i + 1) % 4];
        for (let k = 0; k < n; k += 1) {
          const t = k / n;
          pts.push(warp(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
        }
      }
      const key = row * 131 + col * 7 + 1000;
      const h = hash(key, 5);
      let color: string = row & 1 ? C.paperShade : C.paper;
      if ((row + col) % 3 === 0 && !(row & 1)) color = C.olivePale;
      if (h > 0.955) color = bold[Math.floor(hash(key, 9) * bold.length)];
      else if (h > 0.86) color = accents[Math.floor(hash(key, 11) * accents.length)];
      else if (h > 0.845) color = C.ink;
      add(color, pts);
      if (!(row & 1) && (col & 1)) dots.push(warp(x, y));
    }
  }
  for (const [color, polys] of fills) fillPolys(ctx, polys, color);
  // The grid's two families of lines (through the lozenges' corners), bent
  // by the lens: x ± (cw/ch)(y − flow) = cw(k + ½).
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = env.phone ? 1 : 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  const slope = cw / ch;
  const yTop = -env.h * 0.4, yBottom = env.h * 1.4;
  const span = env.w + (yBottom - yTop) * slope;
  for (const dir of [1, -1]) {
    for (let k = Math.floor(-span / cw) - 2; k <= Math.ceil((env.w + span) / cw) + 2; k += 1) {
      const n = env.phone ? 90 : 150;
      for (let i = 0; i <= n; i += 1) {
        const y = yTop + ((yBottom - yTop) * i) / n;
        const x = cw * (k + 0.5) - dir * slope * (y - flow);
        const [lx, ly] = warp(x, y);
        if (i === 0) ctx.moveTo(lx, ly);
        else ctx.lineTo(lx, ly);
      }
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // A spot in every other lozenge (the wallpaper in Girl before a Mirror).
  for (const [x, y] of dots) {
    const d = Math.hypot(x - cx, y - cy);
    const shrink = clamp01((d - re) / (re * 1.2));
    dot(ctx, x, y, (env.phone ? 2.2 : 3.8) * (0.25 + 0.75 * shrink), C.ink, 0.85);
  }
}

// ── 1 · The basketball ──

function bounceAt(env: Env, a: number) {
  const L = layoutFor(env);
  const floor = env.h * (env.phone ? 0.74 : 0.86);
  const hang = env.h * (env.phone ? 0.16 : 0.24);
  const phase = (a + 0.1) * Math.PI * 2.4;
  const height = Math.abs(Math.cos(phase)) ** 1.25;
  const contact = clamp01(1 - height / 0.1);
  const sy = 1 - 0.13 * contact;
  const sx = 1 + 0.09 * contact;
  const r = L.r * 0.9;
  // It bounces across the court toward the hoop.
  const travel = Math.max(-0.35, Math.min(1.35, a));
  const cx = L.cx + (env.phone ? lerp(-0.08, 0.08, travel) * env.w : lerp(-0.2, 0.1, travel) * env.w);
  return { cx, cy: floor - r * sy - height * hang, r, sx, sy, floor };
}
function basketSphere(env: Env): Sphere {
  const b = bounceAt(env, env.a);
  return { cx: b.cx, cy: b.cy, r: b.r, m: rotation(0.9 + env.a * 3.4 + env.t * 0.05 + (env.spin ?? 0), 0.35, -0.3 + env.a * 0.4), sx: b.sx, sy: b.sy };
}
const BASKET_SEAMS = [
  sphereCircle([0, 1, 0], 0, 96),
  sphereCircle([1, 0, 0], 0, 96),
  sphereCircle([1, 0, 0], 0.64, 96),
  sphereCircle([1, 0, 0], -0.64, 96),
];
function paintBasket(ctx: ReelCtx, env: Env) {
  const s = basketSphere(env);
  const b = bounceAt(env, env.a);
  const fy = b.floor / env.h;
  ground(ctx, env, C.rosePale);
  plane(ctx, env, [[0.57, 0], [1, 0], [1, 1], [0.47, 1]], C.ochrePale);
  plane(ctx, env, [[0, 0], [0.26, 0], [0.2, 0.38], [0, 0.44]], C.paper);
  plane(ctx, env, [[0.86, 0], [1, 0], [1, 0.62], [0.83, 0.6]], C.rose);
  // The hoop's backboard, cubist: a white square seen flat, its target box
  // and the rim as an ellipse, high on the right.
  if (!env.phone) {
    plane(ctx, env, [[0.74, 0.08], [0.9, 0.06], [0.91, 0.36], [0.75, 0.37]], C.bone);
    fillPoly(ctx, brushOutline([[0.74 * env.w, 0.08 * env.h], [0.9 * env.w, 0.06 * env.h], [0.91 * env.w, 0.36 * env.h], [0.75 * env.w, 0.37 * env.h], [0.74 * env.w, 0.08 * env.h], [0.9 * env.w, 0.06 * env.h]], () => 4), C.ink);
    line(ctx, [[0.79 * env.w, 0.2 * env.h], [0.86 * env.w, 0.19 * env.h], [0.865 * env.w, 0.3 * env.h], [0.795 * env.w, 0.305 * env.h], [0.79 * env.w, 0.2 * env.h]], C.leatherDark, 4, 0.9);
    const rim = ellipsePoly(0.83 * env.w, 0.335 * env.h, env.w * 0.05, env.h * 0.022, 48);
    brush(ctx, [...rim, rim[0], rim[1]], 7, C.leatherDark, 1, [0.01, 0.01]);
    // The net: a few falling lines.
    for (let k = 0; k < 6; k += 1) {
      const x0 = 0.785 * env.w + k * env.w * 0.018;
      line(ctx, [[x0, 0.345 * env.h], [x0 + (k - 2.5) * 3, 0.45 * env.h]], C.ink, 1.5, 0.6);
    }
  }
  planeEdge(ctx, env, [0.57, 0], [0.47, 1], W(env, 3));
  // The floor: a black band, the boards' plane, the court's arc in paint.
  plane(ctx, env, [[0, fy + 0.005], [1, fy - 0.025], [1, 1], [0, 1]], C.ochreMid);
  ctx.save();
  clipTo(ctx, [[0, (fy + 0.005) * env.h], [env.w, (fy - 0.025) * env.h], [env.w, env.h * 1.2], [0, env.h * 1.2]]);
  for (let i = -9; i <= 9; i += 1) {
    const x0 = env.w * 0.5 + i * env.w * 0.075;
    line(ctx, [[x0, fy * env.h - 20], [env.w * 0.5 + i * env.w * 0.2, env.h * 1.1]], C.ochreDeep, W(env, 1.6), 0.7);
  }
  const arc: Vec2[] = [];
  for (let k = 0; k <= 72; k += 1) {
    const a = Math.PI * (0.02 + (0.96 * k) / 72);
    arc.push([env.w * 0.46 + Math.cos(a) * env.w * 0.5, fy * env.h - env.h * 0.03 + Math.sin(a) * env.h * 0.2]);
  }
  brush(ctx, arc, W(env, 9), C.bone, 0.92, [0.02, 0.02]);
  ctx.restore();
  plane(ctx, env, [[0, fy - 0.01], [1, fy - 0.04], [1, fy - 0.022], [0, fy + 0.008]], C.ink);
  // Where it just was: the chronophotograph — the bounce cut out again and
  // again in paper, the older the paler.
  const trail = [C.paper, C.rosePale, C.rose];
  // (Not on a phone: the frame is too narrow for the trail to spread out.)
  for (let k = env.phone ? 0 : 3; k >= 1; k -= 1) {
    const e = bounceAt(env, env.a - k * 0.11);
    const es: Sphere = { ...s, cx: e.cx, cy: e.cy, sx: e.sx, sy: e.sy };
    fillPoly(ctx, limb(es, 72), trail[3 - k]);
    gestureRing(ctx, es.cx, es.cy, es.r * es.sx, es.r * es.sy, es.r * 0.014, C.ink, 70 + k, Math.PI * 0.3, 0.85);
    // Its seams, just two, as it was turning.
    const ghost: Sphere = { ...es, m: rotation(0.9 + (env.a - k * 0.11) * 3.4, 0.35, -0.3) };
    seam(ctx, ghost, BASKET_SEAMS[0], es.r * 0.025, C.ink, 0.55);
    seam(ctx, ghost, BASKET_SEAMS[2], es.r * 0.025, C.ink, 0.55);
  }
  const lift = clamp01((b.floor - (s.cy + s.r * s.sy)) / (env.h * 0.25));
  castShadow(ctx, s, b.floor - env.h * 0.012, 1 - 0.4 * lift, 0.6 - 0.3 * lift);
  // The ball.
  const split: Split = { angle: 1.05 + 0.1 * Math.sin(env.a * 3), offset: 0.12, bend: 0.28 };
  const slip: Vec2 = [s.r * 0.035, -s.r * 0.025];
  fillPoly(ctx, shift(limb(s, 96), slip[0], slip[1]), C.leather);
  doubleFace(ctx, s, split, (dark) => {
    if (dark) {
      fillPoly(ctx, shift(limb(s, 96), slip[0], slip[1]), C.leatherDark);
      hatch(ctx, limb(s, 64), -Math.PI / 3, s.r * 0.055, C.ink, Math.max(0.8, s.r * 0.007), 0.3);
    }
    for (const curve of BASKET_SEAMS) seam(ctx, s, curve, s.r * 0.055, C.ink);
  });
  splitStroke(ctx, s, split, s.r * 0.018, 0.85);
  highlight(ctx, s, C.bone, 0.9);
  echoRing(ctx, s, -0.1, -0.06, 23, 0.8);
  ballContour(ctx, s, 21);
}

// ── 2 · The football ──

const FOOTBALL = footballGeometry();
function footballSphere(env: Env): Sphere {
  const L = layoutFor(env);
  const a = env.a;
  return { cx: L.cx, cy: L.cy + (env.phone ? 0 : env.h * 0.01), r: L.r * 0.95, m: rotation(0.4 + a * 2.6 + env.t * 0.05 + (env.spin ?? 0), 0.5 + a * 1.4, 0.3 + a * 0.6), sx: 1, sy: 1 };
}
function hexMosaic(ctx: ReelCtx, env: Env, size: number, drift: number, tones: readonly string[]) {
  const hw = Math.sqrt(3) * size;
  const polys = new Map<string, Vec2[][]>();
  const edges: Vec2[][] = [];
  for (let row = -2; row < env.h / (size * 1.5) + 2; row += 1) {
    for (let col = -2; col < env.w / hw + 2; col += 1) {
      const x = col * hw + (row & 1 ? hw / 2 : 0) + (drift % hw);
      const y = row * size * 1.5;
      const hex: Vec2[] = [];
      for (let k = 0; k < 6; k += 1) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        hex.push([x + Math.cos(a) * size, y + Math.sin(a) * size]);
      }
      const key = row * 53 + col * 17;
      const tone = hash(key, 91) > 0.86 ? tones[2] : tones[(row + col * 2) % 2 === 0 ? 0 : 1];
      const list = polys.get(tone);
      if (list) list.push(hex);
      else polys.set(tone, [hex]);
      edges.push([...hex, hex[0]]);
    }
  }
  for (const [tone, list] of polys) fillPolys(ctx, list, tone);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = W(env, 1.6);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const e of edges) path(ctx, e, false);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
function paintFootball(ctx: ReelCtx, env: Env) {
  const s = footballSphere(env);
  ground(ctx, env, C.tealPale);
  // The ball's own pattern, grown into the ground on a tilted plane.
  ctx.save();
  const mosaic: Vec2[] = [[0.36 * env.w, 0], [env.w * 1.1, 0], [env.w * 1.1, env.h * 1.1], [0.24 * env.w, env.h * 1.1]];
  clipTo(ctx, mosaic);
  hexMosaic(ctx, env, env.phone ? 34 : 64, env.a * 60 + env.t * 3, [C.tealMid, C.teal, C.ink]);
  ctx.restore();
  planeEdge(ctx, env, [0.36, 0], [0.24, 1], W(env, 5));
  plane(ctx, env, [[0, 0.62], [0.28, 0.6], [0.26, 1], [0, 1]], C.tealMid);
  planeEdge(ctx, env, [0, 0.62], [0.28, 0.6], W(env, 4), C.bone);
  plane(ctx, env, [[0, 0], [0.33, 0], [0.33, 0.07], [0, 0.1]], C.bluePale);
  // The centre circle, huge, round the ball.
  const ring = ellipsePoly(s.cx, s.cy + s.r * 0.2, s.r * 1.75, s.r * 1.62, 120, 0.2);
  brush(ctx, [...ring, ring[0], ring[1], ring[2]], W(env, 6), C.bone, 0.95, [0.03, 0.03]);
  castShadow(ctx, s, s.cy + s.r * 1.04, 0.95, 0.5, 0.25);
  const split: Split = { angle: -1.2 + 0.08 * Math.sin(env.a * 2), offset: 0.18, bend: -0.3 };
  const slip: Vec2 = [s.r * 0.03, -s.r * 0.02];
  fillPoly(ctx, shift(limb(s, 96), slip[0], slip[1]), C.bone);
  doubleFace(ctx, s, split, (dark) => {
    if (dark) fillPoly(ctx, shift(limb(s, 96), slip[0], slip[1]), C.tealPale);
    const pentTone = dark ? C.tealDeep : C.ink;
    const pents: Vec2[][] = [];
    for (const pent of FOOTBALL.pentagons) {
      const patch = spherePatch(s, pent, 4);
      if (patch) pents.push(shift(patch, slip[0] * 0.5, slip[1] * 0.5));
    }
    fillPolys(ctx, pents, pentTone);
    for (const [a, b] of FOOTBALL.seams) {
      const pts: Vec3[] = [];
      for (let k = 0; k <= 6; k += 1) {
        const t = k / 6;
        pts.push(normalize([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
      }
      seam(ctx, s, pts, s.r * 0.02, C.ink, 0.9);
    }
    if (dark) hatch(ctx, limb(s, 64), Math.PI / 3, s.r * 0.06, C.tealDeep, Math.max(0.8, s.r * 0.006), 0.45);
  });
  splitStroke(ctx, s, split, s.r * 0.02, 0.9);
  highlight(ctx, s, C.bone, 0.95, 0.85);
  echoRing(ctx, s, 0.14, -0.08, 33, 0.85);
  ballContour(ctx, s, 31);
}

// ── 3 · The cookie ──

const CHIPS = spherePoints(22, 7, 0.9);
export function cookieBites(a: number) {
  const first = smoothstep(0.1, 0.4, a);
  const second = smoothstep(0.45, 0.75, a);
  return [
    { angle: -0.55, depth: 0.28 * first, size: 0.24 },
    { angle: -0.12, depth: 0.22 * second, size: 0.2 },
  ].filter((b) => b.depth > 0.001);
}
function cookieState(env: Env) {
  const L = layoutFor(env);
  return { cx: L.cx, cy: L.cy + (env.phone ? 0 : env.h * 0.02), r: L.r * 1.02, spin: -0.3 + env.a * 0.9 + env.t * 0.02 + (env.spin ?? 0) * 0.5 };
}
function paintCookieBackground(ctx: ReelCtx, env: Env, cx: number, cy: number, r: number) {
  ground(ctx, env, C.ochrePale);
  plane(ctx, env, [[0, 0], [0.42, 0], [0.34, 0.56], [0, 0.62]], C.olivePale);
  plane(ctx, env, [[0.78, 0], [1, 0], [1, 0.4], [0.82, 0.44]], C.paper);
  // The checked cloth of a Picasso still life: flat, tilted, bold.
  const cloth: Vec2[] = [[env.w * 0.2, env.h * 1.2], [env.w * 0.46, env.h * 0.46], [env.w * 1.3, env.h * 0.3], [env.w * 1.3, env.h * 1.2]];
  ctx.save();
  clipTo(ctx, cloth);
  ground(ctx, env, C.paper);
  const cell = env.phone ? 30 : 58;
  ctx.translate(env.w * 0.6, env.h * 0.6);
  ctx.rotate(-0.34);
  const checks: Vec2[][] = [];
  for (let i = -20; i < 20; i += 1) {
    for (let j = -14; j < 14; j += 1) {
      if (((i + j) & 1) !== 0) continue;
      checks.push([[i * cell, j * cell], [(i + 1) * cell, j * cell], [(i + 1) * cell, (j + 1) * cell], [i * cell, (j + 1) * cell]]);
    }
  }
  fillPolys(ctx, checks, C.rose);
  ctx.restore();
  brush(ctx, [cloth[0], cloth[1], cloth[2]], W(env, 5), C.ink, 1, [0.01, 0.01]);
  // The plate, seen twice: from above (a circle) and from the side (an
  // ellipse), one over the other.
  fillPoly(ctx, ellipsePoly(cx - r * 0.12, cy + r * 0.05, r * 1.42, r * 1.42, 96), C.bone);
  gestureRing(ctx, cx - r * 0.12, cy + r * 0.05, r * 1.42, r * 1.42, r * 0.018, C.ink, 41, Math.PI * 0.4);
  fillPoly(ctx, ellipsePoly(cx + r * 0.1, cy + r * 0.62, r * 1.55, r * 0.5, 96), C.paperShade, 0.95);
  gestureRing(ctx, cx + r * 0.1, cy + r * 0.62, r * 1.55, r * 0.5, r * 0.02, C.ink, 43, Math.PI * 0.5);
  gestureRing(ctx, cx - r * 0.12, cy + r * 0.05, r * 1.12, r * 1.12, r * 0.008, C.ink, 45, Math.PI * 1.4, 0.7);
}
function paintCookieBody(ctx: ReelCtx, env: Env, cx: number, cy: number, r: number, spin: number, bites: ReturnType<typeof cookieBites>) {
  const outline = cookieOutline(cx, cy, r, bites, env.phone ? 120 : 180, 3);
  const slip: Vec2 = [r * 0.035, -r * 0.025];
  const s: Sphere = { cx, cy, r, m: rotation(0, 0), sx: 1, sy: 1 };
  const split: Split = { angle: 0.85, offset: 0.1, bend: 0.3 };
  fillPoly(ctx, shift(outline, slip[0], slip[1]), C.bake);
  ctx.save();
  clipTo(ctx, outline);
  const region = splitRegion(s, split);
  fillPoly(ctx, shift(region, slip[0], slip[1]), C.bakeDark);
  // The bake's rim: a darker ring inside the edge.
  hatch(ctx, region, -Math.PI / 4, r * 0.06, C.ochreDeep, Math.max(0.8, r * 0.008), 0.35);
  // Chips: dark, angular, turning with the cookie.
  const cs = Math.cos(spin), sn = Math.sin(spin);
  const chips: Vec2[][] = [];
  const lights: Vec2[][] = [];
  CHIPS.forEach((c, i) => {
    if (c[2] < -0.2) return;
    const px = c[0] * 0.8, py = c[1] * 0.8;
    const x = cx + (px * cs - py * sn) * r, y = cy + (px * sn + py * cs) * r;
    const size = r * (0.05 + hash(i, 13) * 0.055);
    const corners = 5 + Math.floor(hash(i, 17) * 3);
    const pts: Vec2[] = [];
    for (let k = 0; k < corners; k += 1) {
      const a = spin + (k / corners) * Math.PI * 2 + hash(i * 7 + k, 19) * 0.6;
      const rr = size * (0.6 + hash(i * 11 + k, 23) * 0.6);
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85]);
    }
    chips.push(pts);
    lights.push(shift(pts.slice(0, 3), -size * 0.14, -size * 0.16));
  });
  fillPolys(ctx, chips, C.chip);
  fillPolys(ctx, lights, C.ochreMid, 0.9);
  for (let i = 0; i < 60; i += 1) {
    const a = hash(i, 29) * Math.PI * 2 + spin;
    const d = Math.sqrt(hash(i, 31)) * r * 0.85;
    dot(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.009 + hash(i, 37) * r * 0.009, C.ochreMid, 0.85);
  }
  ctx.restore();
  splitStroke(ctx, s, split, r * 0.016, 0.8);
  fillPoly(ctx, brushOutline([...outline, outline[0], outline[1]], (t) => r * 0.034 * (0.45 + 0.55 * Math.max(0, Math.cos(t * Math.PI * 2 - Math.PI * 0.3)))), C.ink);
  // The other view: the cookie's edge, seen from the side, as a band.
  gestureRing(ctx, cx - r * 0.08, cy - r * 0.05, r * 1.02, r * 1.0, r * 0.01, C.ink, 47, Math.PI * 1.2, 0.8);
}
function paintCookie(ctx: ReelCtx, env: Env) {
  const s = cookieState(env);
  paintCookieBackground(ctx, env, s.cx, s.cy, s.r);
  paintCookieBody(ctx, env, s.cx, s.cy, s.r, s.spin, cookieBites(env.a));
}

// ── 4 · The traffic light ──

export function lightGeometry(env: Env) {
  const L = layoutFor(env);
  const lampR = env.phone ? env.w * 0.11 : env.h * 0.088;
  const gap = lampR * 2.5;
  return { cx: L.cx, cy: L.cy + (env.phone ? 0 : env.h * 0.01), lampR, gap, lamps: [L.cy - gap, L.cy, L.cy + gap].map((y) => y + (env.phone ? 0 : env.h * 0.01)) as [number, number, number] };
}
const LAMPS = [
  { off: C.roseDeep, on: C.lampRed, rings: [C.lampRed, C.plumMid, C.rose, C.blueMid] },
  { off: C.ochreDeep, on: C.lampAmber, rings: [C.lampAmber, C.ochreMid, C.rose, C.blueMid] },
  { off: C.tealDeep, on: C.lampGreen, rings: [C.lampGreen, C.tealMid, C.bluePale, C.blueMid] },
] as const;
function lampLevels(a: number): [number, number, number] {
  const red = 1 - smoothstep(0.28, 0.36, a);
  const amber = smoothstep(0.28, 0.36, a) * (1 - smoothstep(0.6, 0.68, a));
  const green = smoothstep(0.6, 0.68, a);
  return [red, amber, green];
}
function paintLightBackground(ctx: ReelCtx, env: Env, g: ReturnType<typeof lightGeometry>, levels: readonly number[]) {
  ground(ctx, env, C.blueDeep);
  plane(ctx, env, [[0, 0], [0.3, 0], [0.24, 1], [0, 1]], C.blueMid);
  plane(ctx, env, [[0.74, 0], [1, 0], [1, 1], [0.8, 1]], C.slateDeep);
  // Delaunay's simultaneous discs: each lamp throws flat rings of colour,
  // the lit one wide and bright, the others in their night tones.
  const order = [0, 1, 2].sort((i, j) => levels[i] - levels[j]);
  for (const i of order) {
    const lamp = LAMPS[i];
    const level = levels[i];
    const reach = lerp(1.9, 3.6, level);
    for (let k = lamp.rings.length - 1; k >= 0; k -= 1) {
      const rr = g.lampR * (1.25 + ((k + 1) / lamp.rings.length) * reach);
      const tone = level > 0.5 || k > 1 ? lamp.rings[k] : k === 0 ? lamp.off : C.blueMid;
      fillPoly(ctx, circlePoly(g.cx, g.lamps[i], rr, 96), tone, lerp(0.35, 1, level) * (k === lamp.rings.length - 1 ? 0.7 : 1));
    }
  }
  // Their circles cut by a night plane: the street below.
  plane(ctx, env, [[0, 0.83], [1, 0.78], [1, 1], [0, 1]], '#111925');
  planeEdge(ctx, env, [0, 0.83], [1, 0.78], W(env, 4), C.ink);
  planeEdge(ctx, env, [0.08, 0.92], [0.46, 0.9], W(env, 5), C.bone, 0.55);
  planeEdge(ctx, env, [0.58, 0.895], [0.96, 0.875], W(env, 5), C.bone, 0.55);
  // The pole.
  const poleW = g.lampR * 0.42;
  fillPoly(ctx, [[g.cx - poleW / 2, g.lamps[2] + g.lampR * 1.5], [g.cx + poleW / 2, g.lamps[2] + g.lampR * 1.5], [g.cx + poleW * 0.62, env.h * 1.05], [g.cx - poleW * 0.38, env.h * 1.05]], C.ink);
}
function housingBox(g: ReturnType<typeof lightGeometry>, k: number) {
  const hw = g.lampR * 1.5;
  const top = g.lamps[0] - g.lampR * 1.5;
  const bottom = g.lamps[2] + g.lampR * 1.5;
  const rr = g.lampR * 0.45;
  const box: Vec2[] = [];
  const corner = (x: number, y: number, a0: number) => {
    for (let i = 0; i <= 8; i += 1) {
      const a = a0 + (i / 8) * (Math.PI / 2);
      box.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
  };
  corner(g.cx + hw - rr, top + rr, -Math.PI / 2);
  corner(g.cx + hw - rr, bottom - rr, 0);
  corner(g.cx - hw + rr, bottom - rr, Math.PI / 2);
  corner(g.cx - hw + rr, top + rr, Math.PI);
  return box.map(([x, y]) => [g.cx + (x - g.cx) * (0.55 + 0.45 * k), g.cy + (y - g.cy) * (0.3 + 0.7 * k)] as Vec2);
}
function paintLightBody(ctx: ReelCtx, env: Env, g: ReturnType<typeof lightGeometry>, levels: readonly number[], housing = 1) {
  if (housing > 0) {
    const box = housingBox(g, housing);
    // The side of the box, seen at once with its front (a second view),
    // printed on its own card.
    const side = shift(box, g.lampR * 0.62, -g.lampR * 0.34);
    fillPoly(ctx, side, C.plumMid, housing);
    hatch(ctx, side, Math.PI / 3, g.lampR * 0.12, C.plumDeep, Math.max(1, g.lampR * 0.02), 0.6 * housing);
    fillPoly(ctx, box, C.slateDeep, housing);
    const face = box.filter(([x]) => x < g.cx - g.lampR * 0.6 * housing);
    if (face.length > 2) fillPoly(ctx, face, '#44484f', housing);
    fillPoly(ctx, brushOutline([...box, box[0], box[1]], () => g.lampR * 0.07), C.ink, housing);
    line(ctx, [...side, side[0]], C.ink, g.lampR * 0.025, 0.7 * housing);
  }
  LAMPS.forEach((lamp, i) => {
    const level = levels[i];
    const y = g.lamps[i];
    const s: Sphere = { cx: g.cx, cy: y, r: g.lampR, m: rotation(0, 0), sx: 1, sy: 1 };
    const split: Split = { angle: 0.9, offset: 0.2, bend: 0.25 };
    fillPoly(ctx, limb(s, 64), lamp.off);
    if (level > 0.01) fillPoly(ctx, limb(s, 64), lamp.on, level);
    ctx.save();
    clipTo(ctx, limb(s, 64));
    fillPoly(ctx, splitRegion(s, split), C.ink, 0.22 + 0.1 * (1 - level));
    ctx.restore();
    highlight(ctx, s, C.bone, 0.25 + 0.65 * level, 0.95);
    fillPoly(ctx, brushOutline([...limb(s, 64), ...limb(s, 4, 0, 0.2)], () => g.lampR * 0.06), C.ink);
    if (housing > 0.3) {
      // The visor: a hood over each lamp.
      const hood: Vec2[] = [];
      for (let k = 0; k <= 24; k += 1) {
        const a = Math.PI * (1.05 + (0.9 * k) / 24);
        hood.push([g.cx + Math.cos(a) * g.lampR * 1.24, y + Math.sin(a) * g.lampR * 1.24]);
      }
      for (let k = 24; k >= 0; k -= 1) {
        const a = Math.PI * (1.05 + (0.9 * k) / 24);
        hood.push([g.cx + Math.cos(a) * g.lampR * 1.02 + g.lampR * 0.1, y + Math.sin(a) * g.lampR * 0.9 - g.lampR * 0.06]);
      }
      fillPoly(ctx, hood, C.ink, housing);
    }
  });
}
function paintLight(ctx: ReelCtx, env: Env) {
  const g = lightGeometry(env);
  const levels = lampLevels(env.a);
  paintLightBackground(ctx, env, g, levels);
  paintLightBody(ctx, env, g, levels);
}

// ── 5 · The mirror ball ──

function discoSphere(env: Env): Sphere {
  const L = layoutFor(env);
  return { cx: L.cx, cy: L.cy - (env.phone ? 0 : env.h * 0.02), r: L.r * 0.92, m: rotation(env.a * 2.2 + env.t * 0.12 + (env.spin ?? 0), 0.28, 0.05), sx: 1, sy: 1 };
}
const DISCO_BANDS = 13;
const DISCO_SLICES = 26;
const DISCO_TONES = [C.ink, C.plumDeep, C.slateMid, C.plumMid, C.blue, C.bluePale, C.bone] as const;
const DISCO_TONES_DARK = [C.ink, C.ink, C.plumDeep, C.slateDeep, C.plumMid, C.blueMid, C.plum] as const;
function paintDiscoBackground(ctx: ReelCtx, env: Env, s: Sphere) {
  ground(ctx, env, C.plumDeep);
  const turn = env.a * 2.2 + env.t * 0.12;
  // Beams: flat wedges of light thrown from the ball, turning with it.
  const beams = [C.plumMid, C.blueMid, C.plum, C.plumMid, C.slateMid];
  beams.forEach((tone, i) => {
    const a = turn * 0.5 + (i / beams.length) * Math.PI * 2 + 0.3;
    const spread = 0.13 + 0.05 * hash(i, 5);
    const far = Math.max(env.w, env.h) * 1.2;
    fillPoly(ctx, [[s.cx, s.cy], [s.cx + Math.cos(a - spread) * far, s.cy + Math.sin(a - spread) * far], [s.cx + Math.cos(a + spread) * far, s.cy + Math.sin(a + spread) * far]], tone, 0.85);
  });
  plane(ctx, env, [[0, 0.74], [1, 0.68], [1, 1], [0, 1]], '#2f1d2c');
  planeEdge(ctx, env, [0, 0.74], [1, 0.68], W(env, 3));
  // Reflections thrown across the room, sliding as the ball turns.
  const spots: Record<string, Vec2[][]> = {};
  for (let i = 0; i < 56; i += 1) {
    const u = (hash(i, 41) + turn / (Math.PI * 2)) % 1;
    const x = u * env.w * 1.2 - env.w * 0.1;
    const y = hash(i, 43) * env.h;
    if (Math.hypot(x - s.cx, y - s.cy) < s.r * 1.12) continue;
    const size = W(env, 6 + hash(i, 47) * 11);
    const tone = hash(i, 53) > 0.45 ? C.bone : hash(i, 59) > 0.5 ? C.bluePale : C.plumPale;
    (spots[tone] ??= []).push([[x, y - size], [x + size * 0.7, y], [x, y + size], [x - size * 0.7, y]]);
  }
  for (const [tone, list] of Object.entries(spots)) fillPolys(ctx, list, tone, 0.9);
  brush(ctx, [[s.cx + 3, -10], [s.cx, s.cy - s.r * 0.98]], W(env, 3.4), C.ink, 1, [0.01, 0.2]);
}
function paintDiscoBall(ctx: ReelCtx, env: Env, s: Sphere, moonness = 0) {
  const slip: Vec2 = [s.r * 0.025, -s.r * 0.02];
  fillPoly(ctx, shift(limb(s, 96), slip[0], slip[1]), C.slateDeep);
  const split: Split = { angle: 1.25, offset: 0.2, bend: 0.28 };
  const region = splitRegion(s, split);
  const Lm = LIGHT;
  const tiles = new Map<string, Vec2[][]>();
  const put = (tone: string, poly: Vec2[]) => {
    const list = tiles.get(tone);
    if (list) list.push(poly);
    else tiles.set(tone, [poly]);
  };
  const splitNx = -Math.sin(split.angle), splitNy = Math.cos(split.angle);
  for (let b = 0; b < DISCO_BANDS; b += 1) {
    const lat0 = -Math.PI / 2 + (b / DISCO_BANDS) * Math.PI;
    const lat1 = -Math.PI / 2 + ((b + 1) / DISCO_BANDS) * Math.PI;
    const slices = Math.max(6, Math.round(DISCO_SLICES * Math.cos((lat0 + lat1) / 2) + 2));
    for (let k = 0; k < slices; k += 1) {
      const lon0 = (k / slices) * Math.PI * 2;
      const lon1 = ((k + 1) / slices) * Math.PI * 2;
      const inset = 0.09;
      const la0 = lerp(lat0, lat1, inset), la1 = lerp(lat1, lat0, inset);
      const lo0 = lerp(lon0, lon1, inset), lo1 = lerp(lon1, lon0, inset);
      const pt = (la: number, lo: number): Vec3 => [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
      const mid = apply(s.m, pt((la0 + la1) / 2, (lo0 + lo1) / 2));
      if (mid[2] < 0.03) continue;
      const screen = [pt(la0, lo0), pt(la0, lo1), pt(la1, lo1), pt(la1, lo0)].map((c) => project(s, apply(s.m, c)));
      const lightness = mid[0] * Lm[0] + mid[1] * Lm[1] + mid[2] * Lm[2];
      const sparkle = hash(b * 97 + k, 71);
      let level = Math.floor(clamp01((lightness + 0.35) / 1.3) * (DISCO_TONES.length - 1) + (sparkle - 0.5) * 2.2);
      level = Math.max(0, Math.min(DISCO_TONES.length - 1, level));
      // Which face of the double face is this tile on?
      const [mx, my] = project(s, mid);
      const dark = (mx - s.cx) * splitNx + (my - s.cy) * splitNy > split.offset * s.r;
      let tone: string = dark ? DISCO_TONES_DARK[level] : DISCO_TONES[level];
      if (moonness > 0) {
        // The facets turn over to the moon's stone, in a sweep from the lit side.
        const flipAt = clamp01(0.5 - mid[0] * 0.35 + mid[1] * 0.2 + (sparkle - 0.5) * 0.3);
        if (moonness > flipAt) tone = level > 3 ? C.stone : level > 1 ? C.paperShade : C.slatePale;
      }
      put(tone, screen);
    }
  }
  for (const [tone, list] of tiles) fillPolys(ctx, list, tone);
  void region;
  splitStroke(ctx, s, split, s.r * 0.018, 0.85 * (1 - moonness));
  const star = (x: number, y: number, size: number, alpha: number) => {
    const w = size * 0.18;
    fillPoly(ctx, [[x, y - size], [x + w, y - w], [x + size, y], [x + w, y + w], [x, y + size], [x - w, y + w], [x - size, y], [x - w, y - w]], C.bone, alpha);
  };
  if (moonness < 0.5) {
    for (let i = 0; i < 3; i += 1) {
      const tw = 0.5 + 0.5 * Math.sin(env.t * 2.2 + i * 2.1 + env.a * 9);
      star(s.cx - s.r * (0.45 - i * 0.28), s.cy - s.r * (0.38 - i * 0.2), s.r * (0.12 + 0.06 * tw), (0.5 + 0.5 * tw) * (1 - moonness * 2));
    }
  }
  echoRing(ctx, s, -0.12, 0.06, 53, 0.8 * (1 - moonness), 0.012, C.bone);
  ballContour(ctx, s, 51, 0.03);
}
function paintDisco(ctx: ReelCtx, env: Env) {
  const s = discoSphere(env);
  paintDiscoBackground(ctx, env, s);
  paintDiscoBall(ctx, env, s);
}

// ── 6 · The moon, and the viewfinder ──

const MARIA: readonly { at: Vec3; size: number; seed: number }[] = [
  { at: normalize([-0.3, 0.35, 0.88]), size: 0.34, seed: 1 },
  { at: normalize([0.2, 0.42, 0.88]), size: 0.26, seed: 2 },
  { at: normalize([0.38, -0.05, 0.92]), size: 0.3, seed: 3 },
  { at: normalize([-0.12, -0.25, 0.96]), size: 0.2, seed: 4 },
  { at: normalize([0.05, 0.05, 1]), size: 0.14, seed: 5 },
];
const MARE_PATCHES = MARIA.map((mare) => {
  const [u, v] = (() => {
    const n = mare.at;
    const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const a = normalize([helper[1] * n[2] - helper[2] * n[1], helper[2] * n[0] - helper[0] * n[2], helper[0] * n[1] - helper[1] * n[0]]);
    return [a, [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]] as Vec3];
  })();
  const corners: Vec3[] = [];
  for (let k = 0; k < 9; k += 1) {
    const ang = (k / 9) * Math.PI * 2;
    const rr = mare.size * (0.7 + 0.5 * hash(k, mare.seed * 13));
    corners.push(normalize([
      mare.at[0] + (u[0] * Math.cos(ang) + v[0] * Math.sin(ang)) * rr,
      mare.at[1] + (u[1] * Math.cos(ang) + v[1] * Math.sin(ang)) * rr,
      mare.at[2] + (u[2] * Math.cos(ang) + v[2] * Math.sin(ang)) * rr,
    ]));
  }
  return corners;
});
const RAY_CRATER: Vec3 = normalize([0.22, -0.34, 0.91]);
const CRATERS = [
  { at: RAY_CRATER, size: 0.05 },
  ...spherePoints(34, 83, 1.2).map((p, i) => ({ at: p, size: 0.035 + hash(i, 89) * 0.08 })),
];

export interface MoonTarget { x: number; y: number; r: number }

/** The moon: centre stage through its act, then it glides to where the Earth
 *  will be and takes its size — a touch bigger, so its limb crosses the
 *  viewfinder's focusing circle at the centre. */
export function moonSphere(env: Env, score: ReelScore, target: MoonTarget | null): Sphere {
  const L = layoutFor(env);
  const glide = easeInOutCubic(segment(env.p, score.glide[0], score.glide[1]));
  const home = { x: L.cx, y: L.cy - (env.phone ? 0 : env.h * 0.02), r: L.r * 0.95 };
  let to = target ?? home;
  if (target && !env.phone) {
    const focusX = env.w / 2, focusY = env.h * 0.46;
    const reach = Math.hypot(target.x - focusX, target.y - focusY);
    to = { ...target, r: Math.max(target.r, reach - (env.phone ? 6 : 10)) };
  }
  // As it glides into the corner it turns its seas and its rayed crater
  // round into the quarter that stays on screen (the upper left).
  const turn = target && !env.phone ? glide : 0;
  const yaw = -0.3 + env.a * 0.5 + env.t * 0.015 + (env.spin ?? 0) - 0.95 * turn;
  return { cx: lerp(home.x, to.x, glide), cy: lerp(home.y, to.y, glide), r: lerp(home.r, to.r, glide), m: rotation(yaw, 0.12 - 0.52 * turn, 0), sx: 1, sy: 1 };
}
/** The moon's light: it waxes through its act, from a crescent to the Earth's
 *  own key light (upper left, a little from the front). */
export function moonLight(a: number): Vec3 {
  const t = smootherstep(clamp01(a * 1.1));
  // The sun swings round from behind on the right (a crescent lit on the
  // right, about a fifth of the disc) through full, and on a little past to
  // the Earth's own key side (upper left), so the moon that takes the
  // Earth's place is lit the way the Earth will be. It never passes through
  // new: the moon is never a dark disc.
  const phi = lerp(0.3, 1.08, t) * Math.PI;
  return normalize([Math.sin(phi), 0.3, -Math.cos(phi)]);
}
function paintMoonBackground(ctx: ReelCtx, env: Env, s: Sphere, score: ReelScore) {
  // Night deepens into the archive's own olive as the moon takes its place.
  const toOlive = smoothstep(score.glide[0], score.finder[1], env.p);
  ground(ctx, env, C.night);
  ground(ctx, env, C.olive, toOlive);
  const planes = 1 - toOlive;
  plane(ctx, env, [[0, 0], [0.34, 0], [0.27, 1], [0, 1]], C.blueDeep, planes);
  plane(ctx, env, [[0.7, 0], [1, 0], [1, 0.36], [0.78, 0.46]], C.slateDeep, planes);
  planeEdge(ctx, env, [0.34, 0], [0.27, 1], W(env, 3), C.ink, planes);
  // Its echo: the crescent seen again, a flat slate shape off its shoulder.
  fillPoly(ctx, shift(limb(s, 72), -s.r * 0.22, -s.r * 0.12), C.slateDeep, 0.9 * planes);
  fillPoly(ctx, shift(limb(s, 72), -s.r * 0.08, -s.r * 0.02), C.night, planes);
  // Stars: Picasso's four-pointed ones, few.
  const stars: Vec2[][] = [];
  for (let i = 0; i < (env.phone ? 14 : 26); i += 1) {
    const x = hash(i, 101) * env.w, y = hash(i, 103) * env.h * 0.9;
    if (Math.hypot(x - s.cx, y - s.cy) < s.r * 1.3) continue;
    const size = W(env, 5 + hash(i, 107) * 9) * (0.75 + 0.25 * Math.sin(env.t * 1.3 + i));
    const w = size * 0.2;
    stars.push([[x, y - size], [x + w, y - w], [x + size, y], [x + w, y + w], [x, y + size], [x - w, y + w], [x - size, y], [x - w, y - w]]);
  }
  fillPolys(ctx, stars, C.bone, 0.85 * (1 - toOlive * 0.9));
}
function paintMoonBall(ctx: ReelCtx, env: Env, s: Sphere, light: Vec3, alpha = 1) {
  const slip: Vec2 = [s.r * 0.02, -s.r * 0.015];
  fillPoly(ctx, shift(limb(s, 128), slip[0], slip[1]), C.stone, alpha);
  ctx.save();
  clipTo(ctx, limb(s, 128));
  // The limb darkens: a flat band inside the edge, deepest away from the
  // light (a cut-paper crescent, not a gradient).
  ctx.globalAlpha = 0.75 * alpha;
  ctx.fillStyle = '#c7c3b2';
  ctx.beginPath();
  path(ctx, limb(s, 128));
  path(ctx, [...limb({ ...s, cx: s.cx - s.r * 0.05 * s.sx, cy: s.cy - s.r * 0.05 * s.sy, r: s.r * 0.9 }, 128)].reverse());
  ctx.fill();
  ctx.globalAlpha = 1;
  const maria: Vec2[][] = [];
  for (const patch of MARE_PATCHES) {
    const pts = spherePatch(s, patch, 3);
    if (pts) maria.push(pts);
  }
  fillPolys(ctx, maria, '#b3b4a9', 0.9 * alpha);
  // The seas engraved: one direction of fine lines across all of them.
  if (maria.length) {
    ctx.save();
    ctx.beginPath();
    for (const m of maria) path(ctx, m);
    ctx.clip();
    ctx.globalAlpha = 0.4 * alpha;
    ctx.strokeStyle = '#80837a';
    ctx.lineWidth = Math.max(0.7, s.r * 0.0028);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    const step = Math.max(3, s.r * 0.024);
    const dx = Math.cos(-0.95), dy = Math.sin(-0.95);
    for (let d = -s.r * 1.5; d <= s.r * 1.5; d += step) {
      const px = s.cx - dy * d, py = s.cy + dx * d;
      ctx.moveTo(px - dx * s.r * 1.5, py - dy * s.r * 1.5);
      ctx.lineTo(px + dx * s.r * 1.5, py + dy * s.r * 1.5);
    }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // A young crater throws its rays across the seas.
  const rayed = apply(s.m, RAY_CRATER);
  if (rayed[2] > 0.1) {
    const [rx, ry] = project(s, rayed);
    for (let k = 0; k < 13; k += 1) {
      const a = (k / 13) * Math.PI * 2 + hash(k, 211) * 0.4;
      const len = s.r * (0.18 + hash(k, 223) * 0.34);
      const foreshorten = 0.35 + 0.65 * rayed[2];
      brush(ctx, [[rx, ry], [rx + Math.cos(a) * len, ry + Math.sin(a) * len * foreshorten]], s.r * 0.012, '#f3f0e6', 0.8 * alpha, [0.02, 0.9]);
    }
  }
  for (const crater of CRATERS) {
    const c = apply(s.m, crater.at);
    if (c[2] < 0.15) continue;
    const [px, py] = project(s, c);
    const rr = crater.size * s.r;
    const squash = Math.max(0.25, c[2]);
    const ang = Math.atan2(-c[1], c[0]);
    const oval = (k: number, dx: number, dy: number) => circlePoly(0, 0, 1, 24).map(([x, y]) => {
      const X = x * rr * k * squash, Y = y * rr * k;
      return [px + dx + X * Math.cos(ang) - Y * Math.sin(ang), py + dy + X * Math.sin(ang) + Y * Math.cos(ang)] as Vec2;
    });
    // A lit lip, the bowl in shadow, its floor catching the light again:
    // three flat ovals, lit from the upper left.
    fillPoly(ctx, oval(1.16, -rr * 0.05, -rr * 0.05), '#ebe7d9', 0.9 * alpha);
    fillPoly(ctx, oval(1, 0, 0), '#9fa196', 0.95 * alpha);
    fillPoly(ctx, oval(0.78, rr * 0.2, rr * 0.18), '#cbc8b9', 0.95 * alpha);
  }
  const shadow = shadowPlane(s, light, 0.0, 9);
  if (shadow) {
    fillPoly(ctx, shift(shadow, slip[0], slip[1]), C.stoneDark, 0.96 * alpha);
    hatch(ctx, shadow, Math.PI / 4, s.r * 0.05, C.slateMid, Math.max(0.8, s.r * 0.004), 0.4 * alpha);
    const edge = shadow.slice(0, 10);
    brush(ctx, edge, s.r * 0.018, C.ink, alpha, [0.1, 0.1]);
  }
  ctx.restore();
  ballContour(ctx, s, 61, 0.022, alpha);
}

export interface Finder {
  /** 0 → 1: the mask and focusing screen come in. */
  in: number;
  /** 0 → 1: the split image comes together. */
  focus: number;
}
function finderWindow(env: Env, k: number) {
  const inset = lerp(0, env.phone ? 12 : 34, k);
  const bottom = lerp(0, env.phone ? 60 : 72, k);
  return { x0: inset, y0: inset, x1: env.w - inset, y1: env.h - bottom, inset, bottom, radius: lerp(0, env.phone ? 18 : 26, k) };
}
export function focusCentre(env: Env): Vec2 {
  return [env.w / 2, env.phone ? env.h * 0.45 : env.h * 0.46];
}
const splitRadius = (env: Env) => (env.phone ? 40 : 84);
/** The viewfinder's furniture over the scene: the eyepiece mask, the
 *  focusing screen's microprism collar, the meter needle, the focus lamp. The
 *  split image itself is composited by the renderer. */
function paintFinderFurniture(ctx: ReelCtx, env: Env, finder: Finder) {
  const k = smootherstep(finder.in);
  if (k <= 0) return;
  const win = finderWindow(env, k);
  const pts: Vec2[] = [];
  const corner = (x: number, y: number, a0: number) => {
    for (let i = 0; i <= 8; i += 1) {
      const a = a0 + (i / 8) * (Math.PI / 2);
      pts.push([x + Math.cos(a) * win.radius, y + Math.sin(a) * win.radius]);
    }
  };
  corner(win.x1 - win.radius, win.y0 + win.radius, -Math.PI / 2);
  corner(win.x1 - win.radius, win.y1 - win.radius, 0);
  corner(win.x0 + win.radius, win.y1 - win.radius, Math.PI / 2);
  corner(win.x0 + win.radius, win.y0 + win.radius, Math.PI);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0a0b08';
  ctx.beginPath();
  path(ctx, [[-env.w, -env.h], [env.w * 2, -env.h], [env.w * 2, env.h * 2], [-env.w, env.h * 2]]);
  path(ctx, [...pts].reverse());
  ctx.fill();
  const [fx, fy] = focusCentre(env);
  const split = splitRadius(env);
  const collar = split * 1.5;
  const shimmer = 1 - smootherstep(finder.focus);
  ctx.save();
  ctx.beginPath();
  path(ctx, circlePoly(fx, fy, collar, 64));
  path(ctx, circlePoly(fx, fy, split, 48).reverse());
  ctx.clip();
  const pitch = env.phone ? 4 : 6;
  const grains = { light: [] as Vec2[][], dark: [] as Vec2[][] };
  for (let gx = fx - collar; gx <= fx + collar; gx += pitch) {
    for (let gy = fy - collar; gy <= fy + collar; gy += pitch) {
      const hsh = hash(Math.round(gx * 3 + gy * 7), 131);
      const x = gx + (hsh - 0.5) * pitch * shimmer;
      const d = pitch * 0.24;
      (hsh > 0.5 ? grains.light : grains.dark).push([[x, gy - d], [x + d, gy], [x, gy + d], [x - d, gy]]);
    }
  }
  fillPolys(ctx, grains.light, C.bone, (0.1 + 0.3 * shimmer) * k);
  fillPolys(ctx, grains.dark, C.ink, (0.1 + 0.3 * shimmer) * k);
  ctx.restore();
  const collarRing = circlePoly(fx, fy, collar, 72);
  const splitRing = circlePoly(fx, fy, split, 72);
  line(ctx, [...collarRing, collarRing[0]], C.bone, 1, 0.35 * k);
  line(ctx, [...splitRing, splitRing[0]], C.bone, 1.3, 0.65 * k);
  line(ctx, [[fx - split, fy], [fx + split, fy]], C.bone, 0.9, 0.45 * k * shimmer);
  // Under the window: the meter's scale and needle, and the focus lamp.
  const my = win.y1 + win.bottom * 0.5 - win.inset * 0.25;
  const scaleW = env.phone ? 90 : 180;
  for (let i = -5; i <= 5; i += 1) {
    const x = fx + ((i / 5) * scaleW) / 2;
    line(ctx, [[x, my - (i === 0 ? 7 : 4)], [x, my + (i === 0 ? 7 : 4)]], C.bone, i === 0 ? 1.4 : 1, 0.55 * k);
  }
  const needle = fx + lerp(scaleW * 0.36, 0, smootherstep(finder.focus)) + Math.sin(env.t * 5) * 1.2 * (1 - finder.focus);
  fillPoly(ctx, [[needle, my - 10], [needle + 4, my - 17], [needle - 4, my - 17]], C.bone, 0.85 * k);
  const lamp = smoothstep(0.9, 1, finder.focus);
  dot(ctx, fx + scaleW / 2 + (env.phone ? 18 : 30), my, env.phone ? 3 : 4, '#D2FF00', lamp * k);
  dot(ctx, fx - scaleW / 2 - (env.phone ? 18 : 30), my, env.phone ? 3 : 4, C.bone, 0.25 * k);
}

// ── Scene dispatch ────────────────────────────────────────────────────────

export function paintSphereScene(ctx: ReelCtx, kind: SphereKind, env: Env, score: ReelScore, target: MoonTarget | null) {
  // The camera pushes in through each act (a slow dolly, 6%), so a sphere
  // that holds is still travelling toward the viewer; the turn that follows
  // resets it. Not the cover (its own pull is the wallpaper's) and not the
  // moon (it glides to an exact place).
  if (kind !== 'hole' && kind !== 'moon') {
    const L = layoutFor(env);
    const k = 1 + 0.06 * smoothstep(-0.3, 1.4, env.a);
    ctx.save();
    ctx.translate(L.cx, L.cy);
    ctx.scale(k, k);
    ctx.translate(-L.cx, -L.cy);
    paintSphereKind(ctx, kind, env, score, target);
    ctx.restore();
    return;
  }
  paintSphereKind(ctx, kind, env, score, target);
}
function paintSphereKind(ctx: ReelCtx, kind: SphereKind, env: Env, score: ReelScore, target: MoonTarget | null) {
  switch (kind) {
    case 'hole': return paintHole(ctx, env);
    case 'basket': return paintBasket(ctx, env);
    case 'football': return paintFootball(ctx, env);
    case 'cookie': return paintCookie(ctx, env);
    case 'light': return paintLight(ctx, env);
    case 'disco': return paintDisco(ctx, env);
    case 'moon': {
      const s = moonSphere(env, score, target);
      paintMoonBackground(ctx, env, s, score);
      paintMoonBall(ctx, env, s, moonLight(env.a));
      return;
    }
  }
}

/** The act clock of beat `index` at progress p: 0 at its arrival, 1 by the
 *  middle of its turn into the next (and on either side through the turns). */
export function actClock(score: ReelScore, index: number, p: number) {
  const beats = score.beats;
  const start = beats[index].at;
  const last = index + 1 >= beats.length;
  const next = last ? score.glide[1] : beats[index + 1].at;
  const end = last ? next : start + (next - start) * (score.hold + (1 - score.hold) * 0.5);
  return (p - start) / Math.max(1e-6, end - start);
}

/** The cover as the server paints it before any script runs (and as reduced
 *  motion keeps it). */
export function paintCover(ctx: ReelCtx, frame: { w: number; h: number }, phone: boolean) {
  paintHole(ctx, { w: frame.w, h: frame.h, phone, t: 0, p: 0, a: 0 });
}

// ── Turns ─────────────────────────────────────────────────────────────────

/** How each turn sweeps: the S-curve's direction and swing, and which way it
 *  travels. */
const SWEEPS: Record<string, { angle: number; bend: number; sign: 1 | -1 }> = {
  'hole>basket': { angle: 0.32, bend: 0.5, sign: -1 },
  'basket>football': { angle: 1.32, bend: -0.45, sign: 1 },
  'football>cookie': { angle: -0.55, bend: 0.5, sign: -1 },
  'basket>light': { angle: 1.2, bend: 0.45, sign: 1 },
  'football>light': { angle: -0.4, bend: 0.5, sign: 1 },
  'light>disco': { angle: 1.62, bend: -0.5, sign: -1 },
  'light>moon': { angle: 1.62, bend: -0.5, sign: -1 },
  'cookie>disco': { angle: 0.9, bend: 0.4, sign: 1 },
};

/** A turn as a double face: an S-curve sweeps across the frame — slow over
 *  the ball, quick across the ground — and the new world is on the far side
 *  of it, settling into register as it comes; for a moment the ball is two
 *  balls, split down the S. */
function paintSplitTurn(ctx: ReelCtx, from: SphereKind, to: SphereKind, envA: Env, envB: Env, mix: number, score: ReelScore, target: MoonTarget | null) {
  const sweep = SWEEPS[`${from}>${to}`] ?? { angle: 0.8, bend: 0.45, sign: 1 };
  const L = layoutFor(envA);
  const u = mix * 2 - 1;
  const diag = Math.hypot(envA.w, envA.h);
  const travel = sweep.sign * (u * L.r * 1.25 + Math.sign(u) * Math.abs(u) ** 5 * diag * 0.75);
  const curve = sCurve(L.cx, L.cy, sweep.angle, travel, L.r * sweep.bend, L.r * 1.2, diag, 96);
  const regionB = sideOf(curve, sweep.angle, diag * 2, -sweep.sign);
  const settle = 1 - smootherstep(mix);
  // One ball turning over to show a new skin: the old one turns away as
  // the S passes, the new one turns in behind it, the same way round.
  const roll = 1.5 * sweep.sign;
  envA = { ...envA, spin: (envA.spin ?? 0) + smootherstep(mix) * roll };
  envB = { ...envB, spin: (envB.spin ?? 0) - (1 - smootherstep(mix)) * roll };
  ctx.save();
  // The old world recedes a little as it goes.
  const recede = 1 - 0.035 * smootherstep(mix);
  ctx.translate(L.cx, L.cy);
  ctx.scale(recede, recede);
  ctx.translate(-L.cx, -L.cy);
  paintSphereScene(ctx, from, envA, score, target);
  ctx.restore();
  ctx.save();
  clipTo(ctx, regionB);
  // The new one comes forward into register.
  const k = 1 + 0.05 * settle;
  ctx.translate(L.cx + (envA.phone ? 6 : 14) * settle, L.cy - (envA.phone ? 4 : 10) * settle);
  ctx.rotate(0.06 * settle * sweep.sign);
  ctx.scale(k, k);
  ctx.translate(-L.cx, -L.cy);
  paintSphereScene(ctx, to, envB, score, target);
  ctx.restore();
  // The cut: a heavy S of ink, with a paper edge along it.
  const edge = bump(mix) ** 0.35;
  brush(ctx, shift(curve, (envA.phone ? 2 : 4) * -sweep.sign, 0), W(envA, 7), C.paper, 0.9 * edge, [0.01, 0.01]);
  brush(ctx, curve, W(envA, 9), C.ink, edge, [0.01, 0.01]);
}

/** Cookie → traffic light: the cookie cracks into three, the pieces rise and
 *  fall into a column and round off into the lamps, and the housing closes
 *  round them. */
function paintCookieToLight(ctx: ReelCtx, envA: Env, envB: Env, mix: number) {
  const s = cookieState(envA);
  const g = lightGeometry(envB);
  const levels = lampLevels(envB.a);
  const crack = smoothstep(0, 0.2, mix);
  const travel = smootherstep(segment(mix, 0.16, 0.8));
  const round = smootherstep(segment(mix, 0.38, 0.9));
  const bgSwap = smootherstep(segment(mix, 0.3, 0.7));
  paintCookieBackground(ctx, envA, s.cx, s.cy, s.r);
  if (bgSwap > 0) {
    ctx.save();
    // The dusk comes up as a plane from below, its edge an ink line.
    const edge = lerp(envA.h * 1.15, -envA.h * 0.25, bgSwap);
    const cut: Vec2[] = [[-envA.w, edge + envA.h * 0.12], [envA.w * 2, edge - envA.h * 0.12], [envA.w * 2, envA.h * 2], [-envA.w, envA.h * 2]];
    clipTo(ctx, cut);
    paintLightBackground(ctx, envB, g, levels.map((l) => l * round));
    ctx.restore();
    brush(ctx, [cut[0], cut[1]], W(envA, 8), C.ink, bump(bgSwap) ** 0.4, [0.01, 0.01]);
  }
  const outline = cookieOutline(s.cx, s.cy, s.r, cookieBites(1.2), 180, 3);
  const cracks = [-Math.PI / 2 + 0.2, Math.PI / 6 + 0.1, (5 * Math.PI) / 6 - 0.15];
  const angleOf = (p: Vec2) => Math.atan2(p[1] - s.cy, p[0] - s.cx);
  const pieces: Vec2[][] = [];
  for (let i = 0; i < 3; i += 1) {
    const a0 = cracks[i];
    let a1 = cracks[(i + 1) % 3];
    while (a1 <= a0) a1 += Math.PI * 2;
    const arc = outline
      .map((p) => {
        let a = angleOf(p);
        while (a < a0) a += Math.PI * 2;
        return { p, a };
      })
      .filter((q) => q.a <= a1)
      .sort((q, r) => q.a - r.a)
      .map((q) => q.p);
    const jag = (a: number, seed: number): Vec2[] => {
      const out: Vec2[] = [];
      for (let k = 1; k < 6; k += 1) {
        const d = (k / 6) * s.r;
        const off = (hash(k, seed) - 0.5) * s.r * 0.12;
        out.push([s.cx + Math.cos(a) * d - Math.sin(a) * off, s.cy + Math.sin(a) * d + Math.cos(a) * off]);
      }
      return out;
    };
    pieces.push([[s.cx, s.cy], ...jag(a0, 400 + i), ...arc, ...jag(a1, 400 + ((i + 1) % 3)).reverse()]);
  }
  pieces.forEach((piece, i) => {
    const c = piece.reduce<[number, number]>((acc, p) => [acc[0] + p[0] / piece.length, acc[1] + p[1] / piece.length], [0, 0]);
    const dir = Math.atan2(c[1] - s.cy, c[0] - s.cx);
    const spread = crack * s.r * 0.12;
    const home: Vec2 = [c[0] + Math.cos(dir) * spread, c[1] + Math.sin(dir) * spread];
    const dest: Vec2 = [g.cx, g.lamps[i]];
    const lift = Math.sin(travel * Math.PI) * s.r * (0.3 + 0.15 * i) * (i === 1 ? -1 : 1);
    const at: Vec2 = [lerp(home[0], dest[0], travel) + lift * 0.4, lerp(home[1], dest[1], travel) - Math.abs(lift)];
    const shape = resampleClosed(piece, 72, -Math.PI / 2).map(([x, y]) => [x - c[0], y - c[1]] as Vec2);
    const circle = circlePoly(0, 0, g.lampR, 72, -Math.PI / 2);
    const spin = travel * (i - 1) * 0.7 * (1 - round);
    const morphed = shape.map(([x, y], k) => {
      const X = lerp(x, circle[k][0], round), Y = lerp(y, circle[k][1], round);
      return [at[0] + X * Math.cos(spin) - Y * Math.sin(spin), at[1] + X * Math.sin(spin) + Y * Math.cos(spin)] as Vec2;
    });
    const lamp = LAMPS[i];
    fillPoly(ctx, morphed, C.bake, 1 - round);
    fillPoly(ctx, morphed, lamp.off, round);
    if (levels[i] > 0) fillPoly(ctx, morphed, lamp.on, levels[i] * round);
    fillPoly(ctx, brushOutline([...morphed, morphed[0], morphed[1]], () => lerp(s.r * 0.03, g.lampR * 0.06, round)), C.ink);
    for (let k = 0; k < 4; k += 1) {
      const px = at[0] + (hash(k + i * 5, 501) - 0.5) * s.r * 0.4 * (1 - round);
      const py = at[1] + (hash(k + i * 5, 503) - 0.5) * s.r * 0.4 * (1 - round);
      dot(ctx, px, py, s.r * 0.05 * (1 - round), C.chip, 1 - round);
    }
  });
  const housing = smootherstep(segment(mix, 0.68, 1));
  if (housing > 0) paintLightBody(ctx, envB, g, levels, housing);
}

/** Mirror ball → moon: the facets turn over to stone in a sweep, the grid
 *  lets go, and the moon is under it; the room goes to night behind. */
function paintDiscoToMoon(ctx: ReelCtx, envA: Env, envB: Env, mix: number, score: ReelScore, target: MoonTarget | null) {
  const flip = smootherstep(segment(mix, 0, 0.62));
  const settle = smootherstep(segment(mix, 0.45, 1));
  const ds = discoSphere(envA);
  const ms = moonSphere(envB, score, target);
  const s: Sphere = { ...ms, cx: lerp(ds.cx, ms.cx, settle), cy: lerp(ds.cy, ms.cy, settle), r: lerp(ds.r, ms.r, settle), m: ds.m };
  const night = smootherstep(segment(mix, 0.15, 0.75));
  paintDiscoBackground(ctx, envA, { ...s, m: ds.m });
  if (night > 0) {
    ctx.save();
    const edge = lerp(-envA.w * 0.35, envA.w * 1.35, night);
    const cut: Vec2[] = [[-envA.w, -envA.h], [edge + envA.w * 0.12, -envA.h], [edge - envA.w * 0.12, envA.h * 2], [-envA.w, envA.h * 2]];
    clipTo(ctx, cut);
    paintMoonBackground(ctx, envB, s, score);
    ctx.restore();
    brush(ctx, [[edge + envA.w * 0.12 * 1.5, -envA.h * 0.5], [edge - envA.w * 0.12 * 1.5, envA.h * 1.5]], W(envA, 8), C.ink, bump(night) ** 0.4, [0.01, 0.01]);
  }
  if (settle < 1) paintDiscoBall(ctx, envA, s, flip);
  if (settle > 0) {
    ctx.save();
    clipTo(ctx, limb({ ...s, r: s.r * 1.01 }, 96));
    paintMoonBall(ctx, envB, { ...ms, cx: s.cx, cy: s.cy, r: s.r }, moonLight(envB.a), settle);
    ctx.restore();
  }
}

// ── The shutter ──────────────────────────────────────────────────────────

export interface ShutterState {
  /** 0 = open, 1 = shut. */
  closed: number;
  /** The opening shows the page beneath (the canvas is clear there). */
  revealed: boolean;
  /** Where the blades close to, in design units. */
  cx: number;
  cy: number;
}
/** Seven blades, turning in as they close. */
export function paintBlades(ctx: ReelCtx, frame: { w: number; h: number }, shutter: ShutterState, phone: boolean) {
  const closed = clamp01(shutter.closed);
  if (closed <= 0) return;
  const far = Math.hypot(frame.w, frame.h) * 2.4;
  const maxR = Math.hypot(Math.max(shutter.cx, frame.w - shutter.cx), Math.max(shutter.cy, frame.h - shutter.cy)) * 1.3;
  const aperture = maxR * (1 - closed);
  const twist = -closed * 1.1;
  const blades = irisBlades(shutter.cx, shutter.cy, aperture, 7, twist, far);
  const tones = ['#1b1e1d', '#24282a', '#1e2120', '#282c2c', '#1a1d1c', '#222626', '#1d2020'];
  const bevel = phone ? 5 : 9;
  blades.forEach((blade, i) => {
    fillPoly(ctx, blade, tones[i % tones.length]);
    // Each blade's leading edge is bevelled and catches a line of light.
    const [a, b, , d] = blade;
    const nx = d[0] - a[0], ny = d[1] - a[1];
    const nl = Math.hypot(nx, ny) || 1;
    const ox = (nx / nl) * bevel, oy = (ny / nl) * bevel;
    fillPoly(ctx, [a, b, [b[0] + ox, b[1] + oy], [a[0] + ox, a[1] + oy]], '#3b403f', 0.9);
    line(ctx, [a, b], C.bone, phone ? 1 : 1.5, 0.45);
  });
}

// ── The renderer (canvas only) ─────────────────────────────────────────────

/** Turns done as collage (canvas only: they composite two scenes). */
const COLLAGE_TURNS = new Set(['football>cookie', 'football>light']);

export class ReelRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scratch: HTMLCanvasElement | null = null;
  private scratchB: HTMLCanvasElement | null = null;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private cover = { s: 1, ox: 0, oy: 0 };
  private frame = { w: 1728, h: 1000 };
  phone = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
  }

  resize(cssW: number, cssH: number, dpr: number, frame: { w: number; h: number }, phone: boolean, cover: { s: number; ox: number; oy: number }) {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.frame = frame;
    this.phone = phone;
    this.cover = cover;
    const Wd = Math.max(1, Math.round(cssW * dpr));
    const Hd = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== Wd || this.canvas.height !== Hd) {
      this.canvas.width = Wd;
      this.canvas.height = Hd;
    }
    for (const b of [this.scratch, this.scratchB]) {
      if (b && (b.width !== Wd || b.height !== Hd)) {
        b.width = Wd;
        b.height = Hd;
      }
    }
  }

  private scratchCanvas(second = false) {
    const make = () => {
      const c = document.createElement('canvas');
      c.width = this.canvas.width;
      c.height = this.canvas.height;
      return c;
    };
    if (second) return (this.scratchB ??= make());
    return (this.scratch ??= make());
  }

  /** Paint a scene into a scratch canvas, in design units. */
  private offscreen(second: boolean, draw: (c: CanvasRenderingContext2D) => void) {
    const buf = this.scratchCanvas(second);
    const c = buf.getContext('2d') as CanvasRenderingContext2D;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.clearRect(0, 0, buf.width, buf.height);
    c.save();
    this.design(c);
    draw(c);
    c.restore();
    return buf;
  }

  /** The scratch canvases' extent in design units (for drawImage). */
  private extent(): [number, number, number, number] {
    const { s, ox, oy } = this.cover;
    return [-ox / s, -oy / s, this.cssW / s, this.cssH / s];
  }

  /** A turn as collage: the frame is cut into planes round the ball; each
   *  plane lifts off like cut paper, turns over from the old sphere's world
   *  to the new one's at its own moment, and is laid back in register. */
  private paintCollage(index: number, from: SphereKind, to: SphereKind, envA: Env, envB: Env, mix: number, score: ReelScore, target: MoonTarget | null) {
    const a = this.offscreen(false, (c) => paintSphereScene(c, from, envA, score, target));
    const b = this.offscreen(true, (c) => paintSphereScene(c, to, envB, score, target));
    const ctx = this.ctx;
    const [bx, by, bw, bh] = this.extent();
    const L = layoutFor(envA);
    const reach = Math.max(envA.w, envA.h);
    const shards = shardsFromCuts(envA.w, envA.h, cutsAround([L.cx, L.cy], L.r * 0.95, envA.phone ? 3 : 4, 211 + index * 17), reach);
    const lift = bump(mix) ** 0.8;
    ground(ctx, envA, C.ink);
    shards.forEach((poly, k) => {
      const seed = 307 + index * 31 + k;
      const [sx, sy] = centroid(poly);
      const dirX = sx - L.cx, dirY = sy - L.cy;
      const dl = Math.hypot(dirX, dirY) || 1;
      const push = (envA.phone ? 12 : 30) * (0.6 + hash(k, seed) * 0.8) * lift;
      const dx = (dirX / dl) * push, dy = (dirY / dl) * push;
      const rot = (hash(k + 7, seed) - 0.5) * 0.1 * lift;
      const sc = 1 + (hash(k + 11, seed) - 0.3) * 0.05 * lift;
      const at = 0.3 + hash(k + 13, seed) * 0.4;
      const flip = clamp01((mix - at) / 0.07);
      ctx.save();
      ctx.translate(L.cx + dx, L.cy + dy);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      ctx.translate(-L.cx, -L.cy);
      // The piece's shadow on the ink below: it has come off the page.
      fillPoly(ctx, shift(poly, (envA.phone ? 3 : 7) * lift, (envA.phone ? 4 : 9) * lift), '#000', 0.35 * lift);
      ctx.save();
      clipTo(ctx, poly);
      if (flip < 1) ctx.drawImage(a, bx, by, bw, bh);
      if (flip > 0) {
        ctx.globalAlpha = flip;
        ctx.drawImage(b, bx, by, bw, bh);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      line(ctx, [...poly, poly[0]], C.paper, envA.phone ? 1.4 : 2.6, 0.85 * lift);
      ctx.restore();
    });
  }

  private design(ctx: CanvasRenderingContext2D) {
    const k = this.dpr * this.cover.s;
    ctx.setTransform(k, 0, 0, k, this.dpr * this.cover.ox, this.dpr * this.cover.oy);
  }

  render(score: ReelScore, p: number, t: number, target: MoonTarget | null, shutter: ShutterState | null) {
    const ctx = this.ctx;
    const { w, h } = this.frame;
    const env = (index: number): Env => ({ w, h, phone: this.phone, t, p, a: actClock(score, index, p) });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (shutter?.revealed) {
      // Over the page: only the blades, if any.
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (shutter.closed > 0.0005) {
        this.design(ctx);
        paintBlades(ctx, { w, h }, shutter, this.phone);
      }
      return;
    }
    const beat = beatAt(score, p);
    const last = score.beats.length - 1;
    const finder: Finder = {
      in: segment(p, score.finder[0], score.finder[1]),
      focus: segment(p, score.focus[0], score.focus[1]),
    };
    ctx.save();
    this.design(ctx);
    if (beat.mix <= 0.0005 || beat.index >= last) {
      const kind = score.beats[beat.index].kind;
      if (kind === 'moon' && finder.in > 0) {
        this.paintFinder(score, env(beat.index), target, finder);
      } else {
        paintSphereScene(ctx, kind, env(beat.index), score, target);
      }
    } else {
      const from = score.beats[beat.index].kind;
      const to = score.beats[beat.index + 1].kind;
      const envA = env(beat.index), envB = env(beat.index + 1);
      if (from === 'cookie' && to === 'light') paintCookieToLight(ctx, envA, envB, beat.mix);
      else if (from === 'disco' && to === 'moon') paintDiscoToMoon(ctx, envA, envB, beat.mix, score, target);
      else if (COLLAGE_TURNS.has(`${from}>${to}`)) this.paintCollage(beat.index, from, to, envA, envB, beat.mix, score, target);
      else paintSplitTurn(ctx, from, to, envA, envB, beat.mix, score, target);
    }
    if (shutter && shutter.closed > 0) paintBlades(ctx, { w, h }, shutter, this.phone);
    ctx.restore();
  }

  /** The moon through the viewfinder: the scene, the split image (the
   *  focusing circle's two halves see it shifted apart until focus brings
   *  them together), the eyepiece's furniture. */
  private paintFinder(score: ReelScore, env: Env, target: MoonTarget | null, finder: Finder) {
    const buf = this.offscreen(false, (c) => paintSphereScene(c, 'moon', env, score, target));
    const ctx = this.ctx;
    const [bx, by, bw, bh] = this.extent();
    ctx.drawImage(buf, bx, by, bw, bh);
    const k = smootherstep(finder.in);
    const [fx, fy] = focusCentre(env);
    const split = splitRadius(env);
    const blur = (1 - smootherstep(finder.focus)) * k;
    const offset = blur * (env.phone ? 22 : 52);
    // Out of focus the whole view is doubled — a ghost of it a little to the
    // side — and the ghost slides home as the lens is focused.
    if (blur > 0.002) {
      ctx.save();
      const outside: Vec2[] = circlePoly(fx, fy, split, 48).reverse();
      ctx.beginPath();
      path(ctx, [[-env.w, -env.h], [env.w * 2, -env.h], [env.w * 2, env.h * 2], [-env.w, env.h * 2]]);
      path(ctx, outside);
      ctx.clip();
      ctx.globalAlpha = 0.42 * Math.min(1, blur * 1.6);
      ctx.drawImage(buf, bx + offset * 0.8, by + offset * 0.1, bw, bh);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    for (const half of [-1, 1]) {
      ctx.save();
      const pts: Vec2[] = [];
      for (let i = 0; i <= 32; i += 1) {
        const a = half < 0 ? Math.PI + (i / 32) * Math.PI : (i / 32) * Math.PI;
        pts.push([fx + Math.cos(a) * split, fy + Math.sin(a) * split]);
      }
      clipTo(ctx, pts);
      ctx.drawImage(buf, bx + offset * half, by, bw, bh);
      ctx.restore();
    }
    paintFinderFurniture(ctx, env, finder);
  }
}

/** Where the shutter closes to: the lens's axis, the focusing screen's
 *  centre (in design units). */
export function shutterCentre(frame: { w: number; h: number }, phone: boolean): Vec2 {
  return focusCentre({ w: frame.w, h: frame.h, phone, t: 0, p: 1, a: 1 });
}
