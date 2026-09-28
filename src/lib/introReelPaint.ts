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
// near-black ink laid down as tapered brush strokes. It is ONE stage and ONE
// sphere: every ball stands at the same place, at the same size, on the same
// ground — the cover's harlequin lattice, re-coloured and re-proportioned for
// each ball from its own colours — and each ball turns into the next ON the
// ball: the black hole's rings close onto a basketball's seams, the seams
// slide into a football's, the football shatters into a cookie, the cookie's
// pieces round off into lamps, the lamps multiply into a mirror ball's tiles,
// the tiles turn over to stone. Every ball is seen twice at once — its dark
// half, across an S, drawn from a second angle (Girl before a Mirror) — and
// the whole picture is cut by four planes through ball and ground, each a
// shade lighter or darker, which come apart and back into register through
// every turn. No gradients, no neon. Lime stays in the interface: the DOM
// scroll cue, and the viewfinder's focus lamp once the cue is gone.

import {
  type Cut,
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
  dot as dot3,
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
// dusty chroma as the lifted stocks. The camera's own blacks close the list.
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
  plumFloor: '#2f1d2c',
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
  housing: '#44484f',
  night: '#1c2230',
  nightShade: '#232b3c',
  leather: '#c9744a',
  leatherDark: '#8a4a2c',
  bake: '#d3a263',
  bakeDark: '#a8723a',
  chip: '#3a2417',
  lampRed: '#d4705f',
  lampAmber: '#dca352',
  lampGreen: '#6fb49c',
  stone: '#dcd8c8',
  stoneLimb: '#c7c3b2',
  stoneSea: '#b3b4a9',
  stoneEngrave: '#80837a',
  stoneRay: '#f3f0e6',
  stoneLip: '#ebe7d9',
  stoneBowl: '#9fa196',
  stoneFloor: '#cbc8b9',
  stoneDark: '#2a3140',
  finder: '#0a0b08',
  blade: '#1a1c17',
  bladeEdge: '#3a3e36',
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

/** Two print colours mixed (sRGB), for a flat ground turning from one ball's
 *  world to the next's. */
export function mixHex(a: string, b: string, t: number) {
  if (t <= 0 || a === b) return a;
  if (t >= 1) return b;
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  let out = '#';
  for (const s of [16, 8, 0]) out += Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t)).toString(16).padStart(2, '0');
  return out;
}
/** The shortest signed angle equal to x. */
const wrapPi = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

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
  if (pts.length < 2 || alpha <= 0.002) return;
  fillPoly(ctx, brushOutline(pts, (t) => width * Math.max(0.08, taper(t, ends[0], ends[1]))), color, alpha);
}
/** A drawn ellipse: one gesture a little over a full turn, heavier on one
 *  side (`swing`: 0 = even; 1 = from a hairline to about double weight), its
 *  ends overlapping and thinning out. */
function gestureRing(ctx: ReelCtx, cx: number, cy: number, rx: number, ry: number, width: number, color: string, seed: number, heavyAt = Math.PI * 0.25, alpha = 1, rot = 0, swing = 0.5) {
  if (alpha <= 0.002 || width <= 0) return;
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
  const low = 0.8 - 0.7 * swing, high = 0.4 + 1.1 * swing;
  const outline = brushOutline(pts, (t) => {
    const a = start + t * sweep;
    const heavy = 0.5 + 0.5 * Math.cos(a - heavyAt);
    return width * (low + high * heavy * heavy) * Math.max(0.1, taper(t, 0.05, 0.07));
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
type Disc = Pick<Sphere, 'cx' | 'cy' | 'r' | 'sx' | 'sy'>;
const project = (s: Sphere, v: Vec3): Vec2 => [s.cx + v[0] * s.r * s.sx, s.cy - v[1] * s.r * s.sy];
/** The light, in view space: from the upper left, a little in front. */
const LIGHT: Vec3 = normalize([-0.62, 0.62, 0.48]);
/** The second view every ball's dark half is drawn from: turned 70° about
 *  its axis and tipped 25° toward the viewer, so its seams disagree with the
 *  lit half's across the S. */
const TWIN_YAW = (70 * Math.PI) / 180;
const TWIN_PITCH = (25 * Math.PI) / 180;
const twin = (yaw: number, pitch: number, roll: number) => rotation(yaw + TWIN_YAW, pitch + TWIN_PITCH, roll);

function limb(s: Disc, n = 96, from = 0, to = Math.PI * 2): Vec2[] {
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
  if (alpha <= 0.002 || width <= 0.05) return;
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
      const v = apply(s.m, normalize(lerp3(a, b, k / steps)));
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
  const aEnd = Math.atan2(-end[1], end[0]);
  const aStart = Math.atan2(-start[1], start[0]);
  const darkMid = Math.atan2(light[1], -light[0]);
  const TAU = Math.PI * 2;
  const ccw = ((aStart - aEnd) % TAU + TAU) % TAU;
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
/** The region on the curve's normal side (+n; −n with `sign` −1). */
function sideOf(curve: readonly Vec2[], angle: number, far: number, sign = 1): Vec2[] {
  const nx = -Math.sin(angle) * sign, ny = Math.cos(angle) * sign;
  const a = curve[0], b = curve[curve.length - 1];
  return [...curve, [b[0] + nx * far, b[1] + ny * far], [a[0] + nx * far, a[1] + ny * far]];
}
function splitLine(s: Pick<Sphere, 'cx' | 'cy' | 'r'>, split: Split, extra = 0): Vec2[] {
  return sCurve(s.cx, s.cy, split.angle, (split.offset + extra) * s.r, split.bend * s.r, s.r * 1.05, s.r * 1.6, 48);
}
/** The dark side of the split (`sign` 1) or the lit side (−1). */
function splitRegion(s: Pick<Sphere, 'cx' | 'cy' | 'r'>, split: Split, sign = 1, extra = 0): Vec2[] {
  return sideOf(splitLine(s, split, extra), split.angle, s.r * 3, sign);
}
const lerpSplit = (a: Split, b: Split, t: number): Split => ({
  angle: a.angle + wrapPi(b.angle - a.angle) * t,
  offset: lerp(a.offset, b.offset, t),
  bend: lerp(a.bend, b.bend, t),
});
/** Draw `draw` twice, each clipped to the disc: once on the lit face, once
 *  (with `dark` true) on the other. */
function doubleFace(ctx: ReelCtx, s: Disc, split: Split, draw: (dark: boolean) => void) {
  ctx.save();
  clipTo(ctx, limb(s, 96));
  ctx.save();
  clipTo(ctx, splitRegion(s, split, -1));
  draw(false);
  ctx.restore();
  clipTo(ctx, splitRegion(s, split, 1));
  draw(true);
  ctx.restore();
}
/** The S itself, drawn in ink inside the ball. */
function splitStroke(ctx: ReelCtx, s: Disc, split: Split, width: number, alpha = 1) {
  if (alpha <= 0.002) return;
  ctx.save();
  clipTo(ctx, limb({ ...s, r: s.r * 0.995 }, 96));
  brush(ctx, splitLine(s, split), width, C.ink, alpha, [0.2, 0.2]);
  ctx.restore();
}
/** The ball's outline: one heavy gesture, a hairline on one side and a
 *  twentieth of the radius and more on the other. One seed: it is the one
 *  ball all through. */
const CONTOUR = 0.05;
const CONTOUR_SEED = 21;
function ballContour(ctx: ReelCtx, s: Disc, alpha = 1, weight = CONTOUR, ink: string = C.ink) {
  gestureRing(ctx, s.cx, s.cy, s.r * s.sx, s.r * s.sy, s.r * weight, ink, CONTOUR_SEED, Math.PI * 0.3, alpha, 0, 0.9);
}
/** Seen twice: a second contour a little off the first (the other view). */
function echoRing(ctx: ReelCtx, s: Disc, dx: number, dy: number, seed: number, alpha = 0.9, weight = 0.012, ink: string = C.ink) {
  gestureRing(ctx, s.cx + dx * s.r, s.cy + dy * s.r, s.r * s.sx * 1.01, s.r * s.sy * 1.01, s.r * weight, ink, seed, Math.PI * 1.2, alpha);
}
/** A cut-paper highlight: a small flat window of light on the lit side. */
function highlight(ctx: ReelCtx, s: Disc, color: string, alpha = 0.9, size = 1) {
  const cx = s.cx - s.r * 0.42 * s.sx, cy = s.cy - s.r * 0.44 * s.sy;
  const a = s.r * 0.14 * size, b = s.r * 0.075 * size;
  const tilt = -0.7;
  const pts = ([[-1, -0.2], [-0.2, -1], [1, -0.55], [0.35, 0.9]] as Vec2[]).map(([x, y]) => [
    cx + (x * Math.cos(tilt) * a - y * Math.sin(tilt) * b),
    cy + (x * Math.sin(tilt) * a + y * Math.cos(tilt) * b),
  ] as Vec2);
  fillPoly(ctx, pts, color, alpha);
}
function castShadow(ctx: ReelCtx, s: Pick<Sphere, 'cx' | 'r'>, y: number, spread: number, alpha: number, dx = 0.18) {
  fillPoly(ctx, ellipsePoly(s.cx + s.r * dx, y, s.r * spread, s.r * spread * 0.15, 48), C.ink, alpha);
}

// ── The stage, the ground, the planes ───────────────────────────────────────

export interface View { x0: number; y0: number; x1: number; y1: number }
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
  /** The part of the design frame on screen (the cover fit crops it); the
   *  whole frame when absent (the server's cover). */
  view?: View;
  /** How far the wallpaper has flowed down, design px (the renderer derives
   *  it from the clock and the scroll; the first paint has none). */
  flow?: number;
}
const viewOf = (env: Env): View => env.view ?? { x0: 0, y0: 0, x1: env.w, y1: env.h };
const W = (env: Pick<Env, 'phone'>, desktop: number) => (env.phone ? desktop * 0.45 : desktop);

export interface Stage { cx: number; cy: number; r: number }
/** The one stage: every ball stands here, at this size. */
export function stageOf(env: Pick<Env, 'w' | 'h' | 'phone'>): Stage {
  if (env.phone) return { cx: env.w * 0.5, cy: env.h * 0.45, r: env.w * 0.36 };
  return { cx: env.w * 0.5, cy: env.h * 0.48, r: env.h * 0.27 };
}
function ground(ctx: ReelCtx, env: Env, color: string, alpha = 1) {
  if (alpha <= 0.002) return;
  ctx.fillStyle = color;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillRect(-env.w, -env.h, env.w * 3, env.h * 3);
  ctx.globalAlpha = 1;
}

/** The lattice every ball stands on, as that ball colours it. */
interface GroundLook {
  fill: string;
  /** A lozenge's width (desktop design px) and its height over its width. */
  cw: number;
  aspect: number;
  base: readonly [string, string];
  alt: string;
  accents: readonly string[];
  bold: readonly string[];
  rare: string;
  line: string;
  lineAlpha: number;
  dot: string;
  dotAlpha: number;
}
const GROUND: Record<SphereKind, GroundLook> = {
  // The cover: Girl before a Mirror's wallpaper, on paper.
  hole: {
    fill: C.paper, cw: 116, aspect: 1.46, base: [C.paper, C.paperShade], alt: C.olivePale,
    accents: [C.rosePale, C.tealPale, C.bluePale, C.ochrePale, C.plumPale], bold: [C.rose, C.ochre, C.teal, C.blueMid], rare: C.ink,
    line: C.ink, lineAlpha: 0.9, dot: C.ink, dotAlpha: 0.85,
  },
  // Leather and boards: wider, squatter lozenges in the court's warm pinks.
  basket: {
    fill: C.rosePale, cw: 138, aspect: 1.28, base: [C.rosePale, C.ochrePale], alt: C.paper,
    accents: [C.rose, C.ochre, C.paper, C.bone, C.plumPale], bold: [C.leather, C.roseMid, C.ochreMid, C.leatherDark], rare: C.ink,
    line: C.ink, lineAlpha: 0.7, dot: C.roseMid, dotAlpha: 0.55,
  },
  // Two equilateral triangles to a lozenge: the pitch's hexagons in teal.
  football: {
    fill: C.tealPale, cw: 104, aspect: 1.732, base: [C.tealPale, C.bone], alt: C.teal,
    accents: [C.teal, C.bluePale, C.olivePale, C.tealMid, C.paper], bold: [C.tealMid, C.tealDeep, C.ink, C.teal], rare: C.ink,
    line: C.ink, lineAlpha: 0.78, dot: C.tealDeep, dotAlpha: 0.6,
  },
  // Square on point: the lattice becomes the checked cloth.
  cookie: {
    fill: C.paper, cw: 92, aspect: 1, base: [C.paper, C.rose], alt: C.rosePale,
    accents: [C.ochrePale, C.bake, C.rosePale, C.paperShade, C.ochre], bold: [C.bakeDark, C.chip, C.roseMid, C.ochre], rare: C.chip,
    line: C.ink, lineAlpha: 0.5, dot: C.chip, dotAlpha: 0.45,
  },
  // Night: tall lozenges, the street's blues, a lamp's colour here and there.
  light: {
    fill: C.night, cw: 104, aspect: 2.1, base: [C.blueDeep, C.night], alt: C.blueMid,
    accents: [C.slateDeep, C.blueMid, C.plumDeep, C.slateMid, C.blueDeep], bold: [C.lampRed, C.lampAmber, C.lampGreen, C.blue], rare: C.ink,
    line: C.ink, lineAlpha: 0.85, dot: C.bone, dotAlpha: 0.32,
  },
  // Small plum lozenges, and the mirror ball's reflections thrown on them.
  disco: {
    fill: C.plumDeep, cw: 84, aspect: 1.46, base: [C.plumDeep, C.plumFloor], alt: C.slateDeep,
    accents: [C.plumMid, C.plum, C.slateMid, C.blueMid, C.plumMid], bold: [C.bone, C.bluePale, C.plumPale, C.bone], rare: C.ink,
    line: C.ink, lineAlpha: 0.8, dot: C.bone, dotAlpha: 0.5,
  },
  // The night sky, the lattice all but gone.
  moon: {
    fill: C.night, cw: 128, aspect: 1.46, base: [C.night, C.nightShade], alt: C.blueDeep,
    accents: [C.slateDeep, C.blueDeep, C.stoneDark, C.nightShade, C.slateDeep], bold: [C.slateMid, C.stoneDark, C.blueMid, C.slateDeep], rare: C.ink,
    line: C.ink, lineAlpha: 0.55, dot: C.bone, dotAlpha: 0.4,
  },
};
function cellColour(look: GroundLook, role: number, pick: number) {
  switch (role) {
    case 0: return look.base[0];
    case 1: return look.base[1];
    case 2: return look.alt;
    case 3: return look.accents[Math.floor(pick * look.accents.length)];
    case 4: return look.bold[Math.floor(pick * look.bold.length)];
    default: return look.rare;
  }
}
export interface Lens { cx: number; cy: number; re: number; swirl: number }
function warper(lens: Lens | null) {
  if (!lens || lens.re < 0.5) return null;
  return (x: number, y: number): Vec2 => {
    const [lx, ly] = lensed(x, y, lens.cx, lens.cy, lens.re);
    if (lens.swirl === 0) return [lx, ly];
    const dx = lx - lens.cx, dy = ly - lens.cy;
    const d = Math.hypot(dx, dy) || 1;
    const turn = lens.swirl * (lens.re / d) ** 1.6;
    const c = Math.cos(turn), s = Math.sin(turn);
    return [lens.cx + dx * c - dy * s, lens.cy + dx * s + dy * c];
  };
}

/** The harlequin lattice, laid out from the ball (`origin`) and flowing down
 *  the page; bent by the lens where there is one. Through a turn from look
 *  `A` to look `B` the lozenges re-proportion and each one turns over to its
 *  new colour in a wave out from the ball. */
function paintGround(ctx: ReelCtx, env: Env, A: GroundLook, B: GroundLook | null, mix: number, lens: Lens | null, origin: Vec2) {
  const k = B ? smootherstep(mix) : 0;
  const L = B ?? A;
  const scale = env.phone ? 0.55 : 1;
  const cw = lerp(A.cw, L.cw, k) * scale;
  const ch = cw * lerp(A.aspect, L.aspect, k);
  const rowH = ch / 2;
  const flow = env.flow ?? 0;
  const [ox, oy] = origin;
  const warp = warper(lens);
  const v = viewOf(env);
  const pad = Math.max(cw, ch) * (warp ? 3 : 1.2);
  const X0 = v.x0 - pad, X1 = v.x1 + pad, Y0 = v.y0 - pad, Y1 = v.y1 + pad;
  const fill = mixHex(A.fill, L.fill, k);
  ground(ctx, env, fill);
  const fills = new Map<string, Vec2[][]>();
  const dots: Vec2[] = [];
  const reach = Math.hypot(env.w, env.h) * 0.62;
  const steps = 5;
  const rowFirst = Math.floor((Y0 - oy - flow) / rowH) - 1;
  const rowLast = Math.ceil((Y1 - oy - flow) / rowH) + 1;
  for (let row = rowFirst; row <= rowLast; row += 1) {
    const y = oy + flow + row * rowH;
    const odd = row & 1;
    const off = odd ? cw / 2 : 0;
    const colFirst = Math.floor((X0 - ox - off) / cw) - 1;
    const colLast = Math.ceil((X1 - ox - off) / cw) + 1;
    for (let col = colFirst; col <= colLast; col += 1) {
      const x = ox + off + col * cw;
      const key = row * 131 + col * 7 + 1000;
      const h = hash(key, 5);
      let role: number;
      let pick = 0;
      if (h > 0.955) { role = 4; pick = hash(key, 9); }
      else if (h > 0.86) { role = 3; pick = hash(key, 11); }
      else if (h > 0.845) role = 5;
      else if (!odd && (((row + col) % 3) + 3) % 3 === 0) role = 2;
      else role = odd ? 1 : 0;
      let look = A;
      if (B && mix > 0) {
        const at = Math.max(0.02, 0.04 + 0.72 * clamp01(Math.hypot(x - ox, y - oy) / reach) + (hash(key, 13) - 0.5) * 0.16);
        if (mix > at) look = B;
      }
      // The lozenge the lens sits in would be spread round the whole
      // Einstein ring (a point behind the hole is seen as a ring): it is
      // left out, or the ring would flash its colour as the paper flows.
      if (warp && lens && Math.abs(x - lens.cx) / (cw / 2) + Math.abs(y - lens.cy) / (ch / 2) <= 1.02) continue;
      const color = cellColour(look, role, pick);
      const dotted = !odd && (col & 1) === 1;
      // (A lozenge the colour of the ground needs no drawing.)
      if (!dotted && color === fill) continue;
      const corners: Vec2[] = [[x, y - ch / 2], [x + cw / 2, y], [x, y + ch / 2], [x - cw / 2, y]];
      let pts: Vec2[];
      if (warp && lens) {
        pts = [];
        // Near the ring the lens bends a lozenge's edges hard: draw them
        // finer there, and coarser as the bend relaxes.
        // (The vortex twists them too: the stronger it is, the further out.)
        const d = Math.hypot(x - lens.cx, y - lens.cy) / lens.re / (1 + Math.min(1.5, Math.abs(lens.swirl)) * 0.8);
        const n = d < 1.7 ? steps * 4 : d < 2.6 ? steps * 2 + 2 : d < 3.6 ? steps + 2 : steps;
        for (let i = 0; i < 4; i += 1) {
          const a = corners[i], b = corners[(i + 1) % 4];
          for (let s = 0; s < n; s += 1) {
            const t = s / n;
            pts.push(warp(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
          }
        }
      } else {
        pts = corners;
      }
      if (color !== fill) {
        const list = fills.get(color);
        if (list) list.push(pts);
        else fills.set(color, [pts]);
      }
      if (dotted) dots.push(warp ? warp(x, y) : [x, y]);
    }
  }
  for (const [color, polys] of fills) fillPolys(ctx, polys, color);
  // The lattice's two families of lines (through the lozenges' corners):
  // x = ox + cw(j + ½) ± (cw/ch)(y − oy − flow), bent by the lens.
  const lineAlpha = lerp(A.lineAlpha, L.lineAlpha, k);
  if (lineAlpha > 0.01) {
    ctx.strokeStyle = mixHex(A.line, L.line, k);
    ctx.lineWidth = env.phone ? 1 : 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = lineAlpha;
    ctx.beginPath();
    const slope = cw / ch;
    for (const dir of [1, -1]) {
      const e0 = dir * slope * (Y0 - oy - flow), e1 = dir * slope * (Y1 - oy - flow);
      const lo = Math.min(e0, e1), hi = Math.max(e0, e1);
      const jFirst = Math.floor((X0 - ox - hi) / cw) - 1, jLast = Math.ceil((X1 - ox - lo) / cw) + 1;
      for (let j = jFirst; j <= jLast; j += 1) {
        const base = ox + cw * (j + 0.5);
        if (warp) {
          const n = env.phone ? 80 : 120;
          // A line passing close behind the hole is torn by the lens (its
          // two sides thrown round opposite ways of the ring): lift the pen
          // there rather than rule a chord across.
          const tear = (Y1 - Y0) / n * 4;
          let px = 0, py = 0;
          for (let i = 0; i <= n; i += 1) {
            const y = Y0 + ((Y1 - Y0) * i) / n;
            const [lx, ly] = warp(base + dir * slope * (y - oy - flow), y);
            if (i === 0 || Math.hypot(lx - px, ly - py) > tear) ctx.moveTo(lx, ly);
            else ctx.lineTo(lx, ly);
            px = lx;
            py = ly;
          }
        } else {
          ctx.moveTo(base + e0, Y0);
          ctx.lineTo(base + e1, Y1);
        }
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // A spot in every other lozenge (the wallpaper in Girl before a Mirror).
  const dotAlpha = lerp(A.dotAlpha, L.dotAlpha, k);
  if (dotAlpha > 0.01 && dots.length) {
    ctx.globalAlpha = dotAlpha;
    ctx.fillStyle = mixHex(A.dot, L.dot, k);
    ctx.beginPath();
    const size = (env.phone ? 2.2 : 3.8) * Math.sqrt(cw / (116 * scale));
    for (const [x, y] of dots) {
      const shrink = lens && warp ? clamp01((Math.hypot(x - lens.cx, y - lens.cy) - lens.re) / (lens.re * 1.2)) : 1;
      const r = size * (0.25 + 0.75 * shrink);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** At most one flat plane under each ball, in shares of the frame: the
 *  ground it stands on — boards, pitch, table, kerb, floor, horizon — one
 *  band that changes its height, its tilt and its colour from ball to ball. */
interface Plane { pts: readonly Vec2[]; color: string }
const band = (left: number, right: number, color: string): Plane => ({ pts: [[-0.05, left], [1.05, right], [1.05, 1.1], [-0.05, 1.1]], color });
function planeOf(kind: SphereKind, env: Env): Plane | null {
  switch (kind) {
    case 'hole': return null;
    case 'basket': {
      // The boards the ball bounces on.
      const f = basketFloor(env) / env.h;
      return band(f + 0.016, f - 0.016, C.ochreMid);
    }
    case 'football': return band(0.74, 0.8, C.tealMid);
    case 'cookie': return band(0.75, 0.64, C.ochre);
    case 'light': return band(0.87, 0.84, C.slateDeep);
    case 'disco': return band(0.8, 0.73, C.plumFloor);
    case 'moon': return band(0.9, 0.87, C.blueDeep);
  }
}
/** The plane, turning from one ball's to the next's: its corners slide and
 *  its colour turns (a plane that is not there waits just below the frame). */
function paintPlane(ctx: ReelCtx, env: Env, from: SphereKind, to: SphereKind, mix: number, alpha = 1) {
  const a = planeOf(from, env), b = planeOf(to, env);
  if ((!a && !b) || alpha <= 0.002) return;
  const below = (q: Plane): Plane => ({ pts: q.pts.map(([x, y]) => [x, y + 0.45] as Vec2), color: q.color });
  const pa = a ?? below(b as Plane), pb = b ?? below(a as Plane);
  const k = from === to ? 0 : smootherstep(mix);
  const pts = pa.pts.map((q, i) => [lerp(q[0], pb.pts[i][0], k) * env.w, lerp(q[1], pb.pts[i][1], k) * env.h] as Vec2);
  fillPoly(ctx, pts, mixHex(pa.color, pb.color, k), alpha);
  brush(ctx, [pts[0], pts[1]], W(env, 3.4), C.ink, 0.9 * alpha, [0.02, 0.02]);
}

// ── Facets: four planes cut through ball and ground ────────────────────────

const FACET_SEED: Record<SphereKind, number> = { hole: 101, basket: 211, football: 307, cookie: 401, light: 503, disco: 601, moon: 709 };
const FACET_AMP: Record<SphereKind, number> = { hole: 0.06, basket: 0.12, football: 0.12, cookie: 0.12, light: 0.1, disco: 0.1, moon: 0.08 };
export function facetCuts(kind: SphereKind, env: Pick<Env, 'w' | 'h' | 'phone'>): Cut[] {
  const S = stageOf(env);
  return cutsAround([S.cx, S.cy], S.r * 1.4, 4, FACET_SEED[kind]);
}
/** Cuts turning from one set to another (lines have no direction: each
 *  turns the short way). */
export function blendCuts(a: readonly Cut[], b: readonly Cut[], t: number): Cut[] {
  return a.map((c, i) => {
    const d = b[i];
    let turn = d.angle - c.angle;
    turn -= Math.PI * Math.round(turn / Math.PI);
    return { p: [lerp(c.p[0], d.p[0], t), lerp(c.p[1], d.p[1], t)], angle: c.angle + turn * t };
  });
}
export interface Facet {
  poly: Vec2[];
  /** Which side of each cut it lies on: a plane keeps its code (and so its
   *  shade and its drift) while the cuts move. */
  code: number;
}
export function facetsOf(env: Pick<Env, 'w' | 'h'>, cuts: readonly Cut[]): Facet[] {
  return shardsFromCuts(env.w, env.h, cuts, 8).map((poly) => {
    const [x, y] = centroid(poly);
    let code = 0;
    cuts.forEach((c, i) => {
      if ((x - c.p[0]) * Math.sin(c.angle) - (y - c.p[1]) * Math.cos(c.angle) > 0) code |= 1 << i;
    });
    return { poly, code };
  });
}
/** Each plane a shade lighter (bone) or darker (ink), up to `amp`. */
function paintFacets(ctx: ReelCtx, env: Env, cuts: readonly Cut[], amp: number, alpha = 1) {
  if (amp * alpha <= 0.002) return;
  for (const f of facetsOf(env, cuts)) {
    const light = hash(f.code, 17) > 0.5;
    const mag = amp * (0.55 + 0.45 * hash(f.code, 19)) * alpha;
    fillPoly(ctx, f.poly, light ? C.bone : C.ink, mag * (light ? 1 : 0.85));
  }
  // (The planes meet with no drawn line: the change of tone is the edge.
  // Only in a turn, when they come apart, is the cut seen — as a seam.)
}
function facetsFor(ctx: ReelCtx, env: Env, from: SphereKind, to: SphereKind, mix: number, alpha = 1) {
  const k = from === to ? 0 : smootherstep(mix);
  const cuts = k > 0 ? blendCuts(facetCuts(from, env), facetCuts(to, env), k) : facetCuts(from, env);
  paintFacets(ctx, env, cuts, lerp(FACET_AMP[from], FACET_AMP[to], k), alpha);
}

// ── 0 · The black hole in the wallpaper (the cover) ──

export function holeGeometry(env: Pick<Env, 'w' | 'h' | 'phone'>) {
  const S = stageOf(env);
  const R = env.phone ? env.w * 0.2 : env.h * 0.18;
  return { cx: S.cx, cy: env.phone ? env.h * 0.45 : env.h * 0.52, R };
}
/** The cover's pull: the scroll's, and — left alone — a breath every 3.2 s,
 *  a tug on the paper toward the hole, as if it were drawing the reader
 *  down. (At t = 0 there is none, so the server's cover and the canvas's
 *  first frame are the same picture.) */
export function holePull(t: number, a: number) {
  const breath = Math.max(0, Math.sin((t / 3.2) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5) ** 4;
  return smoothstep(0, 1.15, a) + 0.3 * breath * (1 - segment(a, 0, 0.25));
}
/** How far the wallpaper has flowed: on its own (70 design px a second; 36
 *  on a phone), with the hole's pull, and with the scroll. */
export function reelFlow(score: ReelScore, p: number, t: number, phone: boolean) {
  const aHole = actClock(score, 0, p);
  const ch0 = (phone ? 64 : 116) * 1.46;
  return t * (phone ? 36 : 70) + holePull(t, aHole) * ch0 * 2.6 + p * (phone ? 700 : 1500);
}
interface HoleState { cx: number; cy: number; R: number; pull: number; re: number; swirl: number }
function holeState(env: Env): HoleState {
  const g = holeGeometry(env);
  const pull = holePull(env.t, env.a);
  // The Einstein ring is wide (2.2 R): the lattice crowds into a sphere of
  // curves well outside the dark, and scrolling widens it and turns the
  // paper into a vortex.
  return { ...g, pull, re: g.R * (2.2 + 0.45 * pull), swirl: 0.08 * Math.sin(env.t * 0.21) + 1.9 * pull * pull };
}
/** The hole's parts, as the cover shows them (all 1) or as they close onto
 *  the basketball. */
interface HoleBody {
  cx: number;
  cy: number;
  R: number;
  sx: number;
  sy: number;
  /** The lensed disc behind (its far side bent up over the hole): 1 full,
   *  0 shrunk onto the limb. */
  halo: number;
  haloAlpha: number;
  /** The disc's crossing: 0 the accretion disc; 1 closed onto an ellipse on
   *  the limb (`tilt`, `squash`: the basketball's equator). */
  disc: number;
  discAlpha: number;
  tilt: number;
  squash: number;
  /** Five thin eccentric orbits round it; 0 closes them onto the limb. */
  orbits: number;
  orbitsAlpha: number;
  photonAlpha: number;
  /** The dark itself (it goes as the leather covers it). */
  darkAlpha: number;
  /** Drawn on the dark, under the disc's near half (the ball coming). */
  inside?: () => void;
}
const HOLE_TILT = (t: number) => -0.06 + 0.015 * Math.sin(t * 0.17);
function holeRest(env: Env, hs: HoleState): HoleBody {
  return {
    cx: hs.cx, cy: hs.cy, R: hs.R, sx: 1, sy: 1, halo: 1, haloAlpha: 1, disc: 0, discAlpha: 1,
    tilt: HOLE_TILT(env.t), squash: 0.075, orbits: 1, orbitsAlpha: 1, photonAlpha: 1, darkAlpha: 1,
  };
}
function paintHole(ctx: ReelCtx, env: Env) {
  const hs = holeState(env);
  paintGround(ctx, env, GROUND.hole, null, 0, { cx: hs.cx, cy: hs.cy, re: hs.re, swirl: hs.swirl }, [hs.cx, hs.cy]);
  paintHoleBody(ctx, env, hs, holeRest(env, hs));
  facetsFor(ctx, env, 'hole', 'hole', 0);
}
const HALO_BANDS = [C.bone, C.ochrePale, C.ochre, C.rose, C.roseMid];
const DISC_RINGS = [
  { r: 1.95, c: C.roseMid },
  { r: 1.7, c: C.rose },
  { r: 1.45, c: C.ochre },
  { r: 1.2, c: C.bone },
];
const ORBITS = [1.15, 1.42, 1.72, 2.04, 2.4];
function paintHoleBody(ctx: ReelCtx, env: Env, hs: HoleState, b: HoleBody) {
  const { cx, cy, R } = b;
  const pull = hs.pull;
  // The lensed disc (Gargantua, flat): the far side of the disc bent up over
  // the hole and its underside bent down under it — a halo thick above and
  // below and thin at the sides, which is what makes it a black hole and not
  // a ringed planet.
  const turn = env.t * 0.06 + pull * 0.9;
  const inner = R * 1.02;
  const outerAt = (a: number) => {
    const up = Math.max(0, -Math.sin(a)) ** 1.5;
    const down = Math.max(0, Math.sin(a)) ** 1.8;
    const full = R * (1.1 + 0.95 * up + 0.45 * down + 0.025 * Math.sin(a * 3 + turn * 4));
    return lerp(inner * 1.002, full, b.halo);
  };
  const ringPts = (f: number) => {
    const pts: Vec2[] = [];
    for (let k = 0; k <= 144; k += 1) {
      const a = (k / 144) * Math.PI * 2;
      const rr = lerp(inner, outerAt(a), f);
      pts.push([cx + Math.cos(a) * rr * b.sx, cy + Math.sin(a) * rr * b.sy]);
    }
    return pts;
  };
  if (b.haloAlpha > 0.002) {
    for (let i = HALO_BANDS.length - 1; i >= 0; i -= 1) fillPoly(ctx, ringPts((i + 1) / HALO_BANDS.length), HALO_BANDS[i], b.haloAlpha);
    for (let i = 1; i <= HALO_BANDS.length; i += 1) line(ctx, ringPts(i / HALO_BANDS.length), C.ink, W(env, i === HALO_BANDS.length ? 3 : 1.3), 0.92 * b.haloAlpha);
  }
  // The sphere of curves: five thin orbits round the dark, each a little off
  // centre and uneven in weight — the lensing, and the ball enclosed by them.
  if (b.orbitsAlpha > 0.002) {
    ORBITS.forEach((f, i) => {
      const rr = R * lerp(1.0, f, b.orbits);
      const off = R * 0.06 * b.orbits;
      const ox = (hash(i, 811) - 0.5) * 2 * off, oy = (hash(i, 813) - 0.5) * 2 * off;
      const width = W(env, 1.2 + hash(i, 817) * 1.4);
      const wob = 1 + (hash(i, 819) - 0.5) * 0.06 * b.orbits;
      gestureRing(ctx, cx + ox, cy + oy, rr * wob * b.sx, (rr / wob) * b.sy, width, C.ink, 830 + i, hash(i, 821) * Math.PI * 2, 0.9 * b.orbitsAlpha, turn * (i % 2 ? 0.2 : -0.15), 0.9);
    });
  }

  // The disc itself, nearly edge on and thin: its far half is hidden by the
  // hole, its near half crosses the hole's face. Closing (`disc` → 1), its
  // rings draw in onto the limb and tip to the basketball's equator.
  const ringsAt = DISC_RINGS.map((ring) => lerp(ring.r, 1 + (ring.r - 1) * 0.015, b.disc));
  const band = (i: number) => {
    const rOut = R * ringsAt[i];
    const rIn = R * (ringsAt[i + 1] ?? 1.0);
    return {
      outer: ellipsePoly(0, 0, rOut * b.sx, rOut * b.squash * b.sy, 120),
      innerE: ellipsePoly(0, 0, rIn * b.sx, rIn * b.squash * b.sy, 120),
    };
  };
  const paintDisc = (front: boolean) => {
    if (b.discAlpha <= 0.002) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(b.tilt);
    clipTo(ctx, front ? [[-env.w * 2, 0], [env.w * 2, 0], [env.w * 2, env.h * 2], [-env.w * 2, env.h * 2]] : [[-env.w * 2, -env.h * 2], [env.w * 2, -env.h * 2], [env.w * 2, 0], [-env.w * 2, 0]]);
    for (let i = 0; i < DISC_RINGS.length; i += 1) {
      const { outer, innerE } = band(i);
      ctx.fillStyle = DISC_RINGS[i].c;
      ctx.globalAlpha = b.discAlpha;
      ctx.beginPath();
      path(ctx, outer);
      path(ctx, [...innerE].reverse());
      ctx.fill();
      ctx.globalAlpha = 1;
      line(ctx, [...outer, outer[0]], C.ink, W(env, i === 0 ? 2.6 : 1.3) * lerp(1, 2.2, b.disc), 0.95 * b.discAlpha);
    }
    // Marks riding round with the disc: its turning, made visible.
    const spin = env.t * 0.45 + pull * 5;
    const markAlpha = 0.9 * b.discAlpha * (1 - b.disc);
    if (markAlpha > 0.01) {
      for (let k = 0; k < 30; k += 1) {
        const a = spin * (k % 2 ? 1 : 0.8) + (k / 30) * Math.PI * 2;
        const rr = R * lerp(1.32 + (k % 3) * 0.26, 1, b.disc);
        const y = Math.sin(a) * rr * b.squash;
        if (front && y < 0) continue;
        if (!front && y > 0) continue;
        const a2 = a + 0.07;
        brush(ctx, [[Math.cos(a) * rr, y], [Math.cos(a2) * rr, Math.sin(a2) * rr * b.squash]], W(env, 3.2), C.ink, markAlpha, [0.3, 0.3]);
      }
    }
    ctx.restore();
  };
  paintDisc(false);
  fillPoly(ctx, limb({ cx, cy, r: R, sx: b.sx, sy: b.sy }, 96), C.ink, b.darkAlpha);
  b.inside?.();
  paintDisc(true);
  // The photon ring: one bright gesture at the edge of the dark, and the
  // hole seen twice — a second, thinner contour off its shoulder.
  gestureRing(ctx, cx, cy, R * 1.01 * b.sx, R * 0.99 * b.sy, R * 0.032, C.bone, 11, Math.PI * 1.25, b.photonAlpha);
  gestureRing(ctx, cx - R * 0.07, cy - R * 0.05, R * 1.02 * b.sx, R * 1.02 * b.sy, R * 0.01, C.ink, 13, Math.PI * 0.8, 0.75 * b.photonAlpha);
}

// ── 1 · The basketball ──

const BASKET_SEAMS = [
  sphereCircle([0, 1, 0], 0, 96),
  sphereCircle([1, 0, 0], 0, 96),
  sphereCircle([1, 0, 0], 0.64, 96),
  sphereCircle([1, 0, 0], -0.64, 96),
];
interface Pose {
  cx: number;
  cy: number;
  r: number;
  sx: number;
  sy: number;
  yaw: number;
  pitch: number;
  roll: number;
}
const sphereOf = (q: Pose): Sphere => ({ cx: q.cx, cy: q.cy, r: q.r, sx: q.sx, sy: q.sy, m: rotation(q.yaw, q.pitch, q.roll) });
const twinOf = (q: Pose): Sphere => ({ cx: q.cx, cy: q.cy, r: q.r, sx: q.sx, sy: q.sy, m: twin(q.yaw, q.pitch, q.roll) });
const bounceAmp = (env: Pick<Env, 'h' | 'phone'>) => env.h * (env.phone ? 0.03 : 0.04);
function basketFloor(env: Pick<Env, 'w' | 'h' | 'phone'>) {
  const S = stageOf(env);
  return S.cy + bounceAmp(env) + S.r * 0.87;
}
/** It bounces in place: the centre rides ±0.04 of the frame's height about
 *  the stage, squashing on the boards. */
function basketPose(env: Env): Pose & { floor: number; height: number } {
  const S = stageOf(env);
  const a = env.a;
  const phase = (a + 0.1) * Math.PI * 2.4;
  const height = Math.abs(Math.cos(phase)) ** 1.25;
  const contact = clamp01(1 - height / 0.1);
  const sy = 1 - 0.13 * contact, sx = 1 + 0.09 * contact;
  const amp = bounceAmp(env);
  const floor = basketFloor(env);
  const cy = floor - S.r * sy - height * (2 * amp - 0.13 * S.r);
  return { cx: S.cx, cy, r: S.r, sx, sy, floor, height, yaw: 0.9 + a * 3.4 + env.t * 0.05, pitch: 0.35, roll: -0.3 + a * 0.4 };
}
const basketSplit = (env: Env): Split => ({ angle: 1.05 + 0.1 * Math.sin(env.a * 3), offset: 0.12, bend: 0.28 });
interface BasketOpts {
  /** How much of the ball is leather, spreading out from the S (1 = all). */
  fill: number;
  seams: number;
  contour: number;
  extras: number;
}
const BASKET_FULL: BasketOpts = { fill: 1, seams: 1, contour: 1, extras: 1 };
function paintBasketShadow(ctx: ReelCtx, env: Env, pose: Pose & { floor: number }, alpha: number) {
  const lift = clamp01((pose.floor - (pose.cy + pose.r * pose.sy)) / (env.h * 0.08));
  castShadow(ctx, pose, pose.floor - env.h * 0.006, 1 - 0.3 * lift, (0.55 - 0.25 * lift) * alpha);
}
function paintBasketBall(ctx: ReelCtx, env: Env, pose: Pose, o: BasketOpts, split = basketSplit(env)) {
  const s = sphereOf(pose), s2 = twinOf(pose);
  const slip: Vec2 = [s.r * 0.035, -s.r * 0.025];
  const whole = o.fill >= 0.999;
  // The leather comes in from the S outward: a band either side of it.
  const w = 1.8 * o.fill;
  const bandRegion = whole ? null : [...splitLine(s, split, -w), ...splitLine(s, split, w).reverse()];
  if (o.fill > 0.001) {
    ctx.save();
    if (bandRegion) {
      clipTo(ctx, limb(s, 96));
      clipTo(ctx, bandRegion);
    }
    fillPoly(ctx, shift(limb(s, 96), slip[0], slip[1]), C.leather);
    ctx.restore();
  }
  doubleFace(ctx, s, split, (dark) => {
    if (dark && o.fill > 0.001) {
      ctx.save();
      if (bandRegion) clipTo(ctx, bandRegion);
      fillPoly(ctx, shift(limb(s, 96), slip[0], slip[1]), C.leatherDark);
      hatch(ctx, limb(s, 64), -Math.PI / 3, s.r * 0.055, C.ink, Math.max(0.8, s.r * 0.007), 0.3);
      ctx.restore();
    }
    for (const curve of BASKET_SEAMS) seam(ctx, dark ? s2 : s, curve, s.r * 0.055 * o.seams, C.ink, o.seams > 0 ? 1 : 0);
  });
  splitStroke(ctx, s, split, s.r * 0.018, 0.85 * o.extras);
  highlight(ctx, s, C.bone, 0.9 * o.extras);
  echoRing(ctx, s, -0.1, -0.06, 23, 0.8 * o.extras);
  ballContour(ctx, s, o.contour);
}
/** Where it just was: the bounce seen again, twice, as thin outlines. */
function paintBasketTrail(ctx: ReelCtx, env: Env, alpha: number) {
  if (alpha <= 0.002) return;
  for (let k = 2; k >= 1; k -= 1) {
    const e = basketPose({ ...env, a: env.a - k * 0.07 });
    gestureRing(ctx, e.cx, e.cy, e.r * e.sx, e.r * e.sy, e.r * 0.012, C.ink, 70 + k, Math.PI * 0.3, (0.55 - k * 0.15) * alpha);
  }
}
function paintBasketScene(ctx: ReelCtx, env: Env) {
  const S = stageOf(env);
  paintGround(ctx, env, GROUND.basket, null, 0, null, [S.cx, S.cy]);
  paintPlane(ctx, env, 'basket', 'basket', 0);
  const pose = basketPose(env);
  paintBasketShadow(ctx, env, pose, 1);
  paintBasketTrail(ctx, env, 1);
  paintBasketBall(ctx, env, pose, BASKET_FULL);
  facetsFor(ctx, env, 'basket', 'basket', 0);
}

// ── 2 · The football ──

const FOOTBALL = footballGeometry();
/** Each of the football's 90 seams begins as a stretch of the nearest
 *  basketball seam and slides to its own edge: one ball's seams become the
 *  other's (in the ball's own frame; both share the tumbling pose). */
const SEAM_MORPH = (() => {
  const curves = BASKET_SEAMS.map((c) => c.slice(0, -1));
  return FOOTBALL.seams.map(([a, b]) => {
    const dst: Vec3[] = [];
    for (let k = 0; k <= 6; k += 1) dst.push(normalize(lerp3(a, b, k / 6)));
    const mid = dst[3];
    let best = -Infinity, ci = 0, ii = 0;
    curves.forEach((c, cIndex) => c.forEach((q, i) => {
      const d = dot3(q, mid);
      if (d > best) { best = d; ci = cIndex; ii = i; }
    }));
    const c = curves[ci];
    const n = c.length;
    let src: Vec3[] = [];
    for (let o = -3; o <= 3; o += 1) src.push(c[(ii + o + n) % n]);
    const along = dot3([dst[6][0] - dst[0][0], dst[6][1] - dst[0][1], dst[6][2] - dst[0][2]], [src[6][0] - src[0][0], src[6][1] - src[0][1], src[6][2] - src[0][2]]);
    if (along < 0) src = src.reverse();
    return { src, dst };
  });
})();
function footballPose(env: Env): Pose {
  const S = stageOf(env);
  const a = env.a;
  // A quarter turn over from where the basketball was: the tumble between
  // them carries the pitch round by 90°.
  return { cx: S.cx, cy: S.cy, r: S.r, sx: 1, sy: 1, yaw: 7.1 + a * 2.6 + env.t * 0.05, pitch: 1.92 + a * 0.9, roll: 0.3 + a * 0.5 };
}
const footballSplit = (env: Env): Split => ({ angle: -1.2 + 0.08 * Math.sin(env.a * 2), offset: 0.18, bend: -0.3 });
function paintPentagons(ctx: ReelCtx, s: Sphere, tone: string, grow = 1, mix = 1) {
  const pents: Vec2[][] = [];
  FOOTBALL.pentagons.forEach((pent, k) => {
    let corners: readonly Vec3[] = pent;
    if (grow < 1) {
      const at = 0.36 + 0.3 * hash(k, 61);
      const g = smootherstep(segment(mix, at, at + 0.22));
      if (g <= 0.001) return;
      if (g < 1) {
        const c = normalize(pent.reduce<Vec3>((acc, q) => [acc[0] + q[0], acc[1] + q[1], acc[2] + q[2]], [0, 0, 0]));
        corners = pent.map((q) => normalize(lerp3(c, q, g)));
      }
    }
    const patch = spherePatch(s, corners, 4);
    if (patch) pents.push(shift(patch, s.r * 0.015, -s.r * 0.01));
  });
  fillPolys(ctx, pents, tone);
}
function footballSeams(ctx: ReelCtx, s: Sphere, width: number, alpha: number, u = 1) {
  for (const mm of SEAM_MORPH) {
    const pts = u >= 1 ? mm.dst : mm.src.map((q, i) => normalize(lerp3(q, mm.dst[i], u)));
    seam(ctx, s, pts, width, C.ink, alpha);
  }
}
function paintFootballBall(ctx: ReelCtx, env: Env, pose: Pose) {
  const s = sphereOf(pose), s2 = twinOf(pose);
  const split = footballSplit(env);
  const slip: Vec2 = [s.r * 0.03, -s.r * 0.02];
  fillPoly(ctx, shift(limb(s, 96), slip[0], slip[1]), C.bone);
  doubleFace(ctx, s, split, (dark) => {
    const sv = dark ? s2 : s;
    if (dark) fillPoly(ctx, shift(limb(s, 96), slip[0], slip[1]), C.tealPale);
    paintPentagons(ctx, sv, dark ? C.tealDeep : C.ink);
    footballSeams(ctx, sv, s.r * 0.02, 0.9);
    if (dark) hatch(ctx, limb(s, 64), Math.PI / 3, s.r * 0.06, C.tealDeep, Math.max(0.8, s.r * 0.006), 0.45);
  });
  splitStroke(ctx, s, split, s.r * 0.02, 0.9);
  highlight(ctx, s, C.bone, 0.95, 0.85);
  echoRing(ctx, s, 0.14, -0.08, 33, 0.85);
  ballContour(ctx, s);
}
function paintFootballScene(ctx: ReelCtx, env: Env) {
  const S = stageOf(env);
  paintGround(ctx, env, GROUND.football, null, 0, null, [S.cx, S.cy]);
  paintPlane(ctx, env, 'football', 'football', 0);
  const pose = footballPose(env);
  castShadow(ctx, pose, S.cy + S.r * 1.04, 0.95, 0.4, 0.25);
  paintFootballBall(ctx, env, pose);
  facetsFor(ctx, env, 'football', 'football', 0);
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
  const S = stageOf(env);
  return { cx: S.cx, cy: S.cy, r: S.r, spin: -0.3 + env.a * 0.9 + env.t * 0.02 };
}
const COOKIE_SPLIT: Split = { angle: 0.85, offset: 0.1, bend: 0.3 };
function paintChips(ctx: ReelCtx, cx: number, cy: number, r: number, spin: number, squash: number) {
  const cs = Math.cos(spin), sn = Math.sin(spin);
  const chips: Vec2[][] = [];
  const lights: Vec2[][] = [];
  CHIPS.forEach((c, i) => {
    if (c[2] < -0.2) return;
    const px = c[0] * 0.8, py = c[1] * 0.8;
    const x = cx + (px * cs - py * sn) * r, y = cy + (px * sn + py * cs) * r * squash;
    const size = r * (0.05 + hash(i, 13) * 0.055);
    const corners = 5 + Math.floor(hash(i, 17) * 3);
    const pts: Vec2[] = [];
    for (let k = 0; k < corners; k += 1) {
      const a = spin + (k / corners) * Math.PI * 2 + hash(i * 7 + k, 19) * 0.6;
      const rr = size * (0.6 + hash(i * 11 + k, 23) * 0.6);
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85 * squash]);
    }
    chips.push(pts);
    lights.push(shift(pts.slice(0, 3), -size * 0.14, -size * 0.16));
  });
  fillPolys(ctx, chips, C.chip);
  fillPolys(ctx, lights, C.ochreMid, 0.9);
}
/** The cookie's contour: heavy on one side, a hairline on the other (by the
 *  outline's own point index, so a piece of it can be drawn alone). */
const cookieEdgeWidth = (r: number, i: number, n: number) => r * CONTOUR * (0.12 + 1.1 * Math.max(0, Math.cos((i / n) * Math.PI * 2 - Math.PI * 0.3)) ** 1.5);
function cookieOutlineOf(env: Env, cx: number, cy: number, r: number, bites: ReturnType<typeof cookieBites>) {
  return cookieOutline(cx, cy, r, bites, env.phone ? 120 : 180, 3);
}
/** The cookie's face: its bake, the dark half across the S (hatched, its
 *  chips seen from another angle — turned a third of a turn and tipped away —
 *  so they disagree with the lit half's), the crumbs, the S. */
function paintCookieFace(ctx: ReelCtx, cx: number, cy: number, r: number, spin: number, outline: readonly Vec2[]) {
  const slip: Vec2 = [r * 0.035, -r * 0.025];
  const s: Disc = { cx, cy, r, sx: 1, sy: 1 };
  fillPoly(ctx, shift(outline, slip[0], slip[1]), C.bake);
  ctx.save();
  clipTo(ctx, outline);
  const dark = splitRegion(s, COOKIE_SPLIT, 1);
  fillPoly(ctx, shift(dark, slip[0], slip[1]), C.bakeDark);
  hatch(ctx, dark, -Math.PI / 4, r * 0.06, C.ochreDeep, Math.max(0.8, r * 0.008), 0.35);
  ctx.save();
  clipTo(ctx, splitRegion(s, COOKIE_SPLIT, -1));
  paintChips(ctx, cx, cy, r, spin, 1);
  ctx.restore();
  ctx.save();
  clipTo(ctx, dark);
  paintChips(ctx, cx, cy, r, spin + 1.2, 0.78);
  ctx.restore();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = C.ochreMid;
  ctx.beginPath();
  for (let i = 0; i < 60; i += 1) {
    const a = hash(i, 29) * Math.PI * 2 + spin;
    const d = Math.sqrt(hash(i, 31)) * r * 0.85;
    const rr = r * 0.009 + hash(i, 37) * r * 0.009;
    ctx.moveTo(cx + Math.cos(a) * d + rr, cy + Math.sin(a) * d);
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
  splitStroke(ctx, s, COOKIE_SPLIT, r * 0.016, 0.8);
  ctx.restore();
}
function paintCookieBody(ctx: ReelCtx, env: Env, cx: number, cy: number, r: number, spin: number, bites: ReturnType<typeof cookieBites>) {
  const outline = cookieOutlineOf(env, cx, cy, r, bites);
  paintCookieFace(ctx, cx, cy, r, spin, outline);
  const n = outline.length;
  fillPoly(ctx, brushOutline([...outline, outline[0], outline[1]], (_t, i) => cookieEdgeWidth(r, i % n, n)), C.ink);
  // The other view: the cookie's edge, seen from the side, as a band.
  gestureRing(ctx, cx - r * 0.08, cy - r * 0.05, r * 1.02, r * 1.0, r * 0.01, C.ink, 47, Math.PI * 1.2, 0.8);
}
function paintCookieScene(ctx: ReelCtx, env: Env) {
  const s = cookieState(env);
  paintGround(ctx, env, GROUND.cookie, null, 0, null, [s.cx, s.cy]);
  paintPlane(ctx, env, 'cookie', 'cookie', 0);
  castShadow(ctx, s, s.cy + s.r * 1.06, 0.9, 0.3, 0.2);
  paintCookieBody(ctx, env, s.cx, s.cy, s.r, s.spin, cookieBites(env.a));
  facetsFor(ctx, env, 'cookie', 'cookie', 0);
}

// ── 4 · The traffic light ──

export function lightGeometry(env: Pick<Env, 'w' | 'h' | 'phone'>) {
  const S = stageOf(env);
  const lampR = S.r * 0.3;
  const gap = lampR * 2.5;
  return { cx: S.cx, cy: S.cy, lampR, gap, lamps: [S.cy - gap, S.cy, S.cy + gap] as [number, number, number] };
}
type LightGeometry = ReturnType<typeof lightGeometry>;
const LAMPS = [
  { off: C.roseDeep, on: C.lampRed, rings: [C.lampRed, C.plumMid, C.rose] },
  { off: C.ochreDeep, on: C.lampAmber, rings: [C.lampAmber, C.ochreMid, C.rose] },
  { off: C.tealDeep, on: C.lampGreen, rings: [C.lampGreen, C.tealMid, C.bluePale] },
] as const;
function lampLevels(a: number): [number, number, number] {
  const red = 1 - smoothstep(0.28, 0.36, a);
  const amber = smoothstep(0.28, 0.36, a) * (1 - smoothstep(0.6, 0.68, a));
  const green = smoothstep(0.6, 0.68, a);
  return [red, amber, green];
}
/** Delaunay's simultaneous discs: the lit lamp throws flat rings of colour
 *  onto the night. */
function paintLightGlow(ctx: ReelCtx, g: LightGeometry, levels: readonly number[], alpha = 1) {
  if (alpha <= 0.002) return;
  const order = [0, 1, 2].sort((i, j) => levels[i] - levels[j]);
  for (const i of order) {
    const lamp = LAMPS[i];
    const level = levels[i];
    if (level < 0.02) continue;
    const reach = lerp(0.6, 2.4, level);
    for (let k = lamp.rings.length - 1; k >= 0; k -= 1) {
      const rr = g.lampR * (1.25 + ((k + 1) / lamp.rings.length) * reach);
      fillPoly(ctx, circlePoly(g.cx, g.lamps[i], rr, 96), lamp.rings[k], level * alpha * (k === lamp.rings.length - 1 ? 0.55 : 0.9));
    }
  }
}
function housingBox(g: LightGeometry, k: number) {
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
function paintLightBody(ctx: ReelCtx, env: Env, g: LightGeometry, levels: readonly number[], housing = 1, lamps = 1) {
  if (housing > 0.002) {
    const box = housingBox(g, housing);
    // The side of the box, seen at once with its front (a second view),
    // printed on its own card.
    const side = shift(box, g.lampR * 0.62, -g.lampR * 0.34);
    fillPoly(ctx, side, C.plumMid, housing);
    hatch(ctx, side, Math.PI / 3, g.lampR * 0.12, C.plumDeep, Math.max(1, g.lampR * 0.02), 0.6 * housing);
    fillPoly(ctx, box, C.slateDeep, housing);
    const face = box.filter(([x]) => x < g.cx - g.lampR * 0.6 * housing);
    if (face.length > 2) fillPoly(ctx, face, C.housing, housing);
    fillPoly(ctx, brushOutline([...box, box[0], box[1]], () => g.lampR * 0.09), C.ink, housing);
    line(ctx, [...side, side[0]], C.ink, g.lampR * 0.025, 0.7 * housing);
  }
  if (lamps <= 0.002) return;
  LAMPS.forEach((lamp, i) => {
    const level = levels[i];
    const y = g.lamps[i];
    const s: Disc = { cx: g.cx, cy: y, r: g.lampR, sx: 1, sy: 1 };
    const split: Split = { angle: 0.9, offset: 0.2, bend: 0.25 };
    fillPoly(ctx, limb(s, 64), lamp.off, lamps);
    if (level > 0.01) fillPoly(ctx, limb(s, 64), lamp.on, level * lamps);
    ctx.save();
    clipTo(ctx, limb(s, 64));
    fillPoly(ctx, splitRegion(s, split), C.ink, (0.22 + 0.1 * (1 - level)) * lamps);
    ctx.restore();
    highlight(ctx, s, C.bone, (0.25 + 0.65 * level) * lamps, 0.95);
    fillPoly(ctx, brushOutline([...limb(s, 64), ...limb(s, 4, 0, 0.2)], () => g.lampR * 0.07), C.ink, lamps);
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
      fillPoly(ctx, hood, C.ink, housing * lamps);
    }
  });
}
function paintLightScene(ctx: ReelCtx, env: Env) {
  const g = lightGeometry(env);
  const levels = lampLevels(env.a);
  paintGround(ctx, env, GROUND.light, null, 0, null, [g.cx, g.cy]);
  paintPlane(ctx, env, 'light', 'light', 0);
  paintLightGlow(ctx, g, levels);
  paintLightBody(ctx, env, g, levels);
  facetsFor(ctx, env, 'light', 'light', 0);
}

// ── 5 · The mirror ball ──

function discoPose(env: Env): Pose {
  const S = stageOf(env);
  return { cx: S.cx, cy: S.cy, r: S.r, sx: 1, sy: 1, yaw: env.a * 2.2 + env.t * 0.12, pitch: 0.28, roll: 0.05 };
}
const DISCO_BANDS = 13;
const DISCO_SLICES = 26;
const DISCO_TONES = [C.ink, C.plumDeep, C.slateMid, C.plumMid, C.blue, C.bluePale, C.bone] as const;
const DISCO_TONES_DARK = [C.ink, C.ink, C.plumDeep, C.slateDeep, C.plumMid, C.blueMid, C.plum] as const;
const DISCO_SPLIT: Split = { angle: 1.25, offset: 0.2, bend: 0.28 };
interface Tile {
  quad: Vec2[];
  mid: Vec3;
  level: number;
  sparkle: number;
  /** Which lamp it came from (by height on the ball). */
  lamp: number;
  key: number;
}
function discoTiles(s: Sphere): Tile[] {
  const out: Tile[] = [];
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
      const quad = [pt(la0, lo0), pt(la0, lo1), pt(la1, lo1), pt(la1, lo0)].map((c) => project(s, apply(s.m, c)));
      const lightness = mid[0] * LIGHT[0] + mid[1] * LIGHT[1] + mid[2] * LIGHT[2];
      const key = b * 97 + k;
      const sparkle = hash(key, 71);
      let level = Math.floor(clamp01((lightness + 0.35) / 1.3) * (DISCO_TONES.length - 1) + (sparkle - 0.5) * 2.2);
      level = Math.max(0, Math.min(DISCO_TONES.length - 1, level));
      const my = mid[1];
      out.push({ quad, mid, level, sparkle, lamp: my > 0.33 ? 0 : my < -0.33 ? 2 : 1, key });
    }
  }
  return out;
}
function tileTone(tile: Tile, dark: boolean, moonness: number): string {
  let tone: string = dark ? DISCO_TONES_DARK[tile.level] : DISCO_TONES[tile.level];
  if (moonness > 0) {
    // The facets turn over to the moon's stone, in a sweep from the lit side.
    const flipAt = clamp01(0.5 - tile.mid[0] * 0.35 + tile.mid[1] * 0.2 + (tile.sparkle - 0.5) * 0.3);
    if (moonness > flipAt) tone = tile.level > 3 ? C.stone : tile.level > 1 ? C.paperShade : C.slatePale;
  }
  return tone;
}
function fillTiles(ctx: ReelCtx, tiles: readonly Tile[], dark: boolean, moonness: number, alpha = 1) {
  const groups = new Map<string, Vec2[][]>();
  for (const tile of tiles) {
    const tone = tileTone(tile, dark, moonness);
    const list = groups.get(tone);
    if (list) list.push(tile.quad);
    else groups.set(tone, [tile.quad]);
  }
  for (const [tone, list] of groups) fillPolys(ctx, list, tone, alpha);
}
function paintDiscoBall(ctx: ReelCtx, env: Env, pose: Pose, moonness = 0, alpha = 1) {
  const s = sphereOf(pose), s2 = twinOf(pose);
  const slip: Vec2 = [s.r * 0.025, -s.r * 0.02];
  fillPoly(ctx, shift(limb(s, 96), slip[0], slip[1]), C.slateDeep, alpha);
  doubleFace(ctx, s, DISCO_SPLIT, (dark) => fillTiles(ctx, discoTiles(dark ? s2 : s), dark, moonness, alpha));
  splitStroke(ctx, s, DISCO_SPLIT, s.r * 0.018, 0.85 * (1 - moonness) * alpha);
  const star = (x: number, y: number, size: number, alpha: number) => {
    const w = size * 0.18;
    fillPoly(ctx, [[x, y - size], [x + w, y - w], [x + size, y], [x + w, y + w], [x, y + size], [x - w, y + w], [x - size, y], [x - w, y - w]], C.bone, alpha);
  };
  if (moonness < 0.5) {
    for (let i = 0; i < 3; i += 1) {
      const tw = 0.5 + 0.5 * Math.sin(env.t * 2.2 + i * 2.1 + env.a * 9);
      star(s.cx - s.r * (0.45 - i * 0.28), s.cy - s.r * (0.38 - i * 0.2), s.r * (0.12 + 0.06 * tw), (0.5 + 0.5 * tw) * (1 - moonness * 2) * alpha);
    }
  }
  echoRing(ctx, s, -0.12, 0.06, 53, 0.8 * (1 - moonness) * alpha, 0.012, C.bone);
  ballContour(ctx, s, alpha);
}
function paintDiscoScene(ctx: ReelCtx, env: Env) {
  const S = stageOf(env);
  paintGround(ctx, env, GROUND.disco, null, 0, null, [S.cx, S.cy]);
  paintPlane(ctx, env, 'disco', 'disco', 0);
  paintDiscoBall(ctx, env, discoPose(env));
  facetsFor(ctx, env, 'disco', 'disco', 0);
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
  const n = mare.at;
  const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize([helper[1] * n[2] - helper[2] * n[1], helper[2] * n[0] - helper[0] * n[2], helper[0] * n[1] - helper[1] * n[0]]);
  const v: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const corners: Vec3[] = [];
  for (let k = 0; k < 9; k += 1) {
    const ang = (k / 9) * Math.PI * 2;
    const rr = mare.size * (0.7 + 0.5 * hash(k, mare.seed * 13));
    corners.push(normalize([
      n[0] + (u[0] * Math.cos(ang) + v[0] * Math.sin(ang)) * rr,
      n[1] + (u[1] * Math.cos(ang) + v[1] * Math.sin(ang)) * rr,
      n[2] + (u[2] * Math.cos(ang) + v[2] * Math.sin(ang)) * rr,
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

/** The finder's window: 3:2 (a 36×24 frame; 2:3 held upright on a phone),
 *  with at least 5% of the width black at the sides and 12% of the height
 *  below it for the meter. `k` brings it in from the whole view. */
export function finderWindow(env: Env, k: number) {
  const v = viewOf(env);
  const vw = v.x1 - v.x0, vh = v.y1 - v.y0;
  const aspect = env.phone ? 2 / 3 : 3 / 2;
  const top = vh * 0.04, bottom = vh * 0.12;
  let ww = vw * 0.9;
  let hh = ww / aspect;
  if (hh > vh - top - bottom) {
    hh = vh - top - bottom;
    ww = hh * aspect;
  }
  const cx = v.x0 + vw / 2;
  const y0 = v.y0 + top + (vh - top - bottom - hh) / 2;
  return {
    x0: lerp(v.x0, cx - ww / 2, k),
    y0: lerp(v.y0, y0, k),
    x1: lerp(v.x1, cx + ww / 2, k),
    y1: lerp(v.y1, y0 + hh, k),
    view: v,
  };
}
/** The focusing screen's centre: the middle of the finder's window. */
export function focusCentre(env: Env): Vec2 {
  const win = finderWindow(env, 1);
  return [(win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2];
}
const viewWidth = (env: Env) => { const v = viewOf(env); return v.x1 - v.x0; };
const splitRadius = (env: Env) => viewWidth(env) * (env.phone ? 0.08 : 0.0375);
const collarRadius = (env: Env) => viewWidth(env) * (env.phone ? 0.14 : 0.065);

/** On a phone there is no globe in the corner to land on: the moon grows to
 *  half the screen's width and settles low on the right, its upper-left limb
 *  through the focusing screen's centre. */
export function phoneMoonTarget(env: Env): MoonTarget {
  const [fx, fy] = focusCentre(env);
  const R = viewWidth(env) * 0.5;
  return { x: fx + R * 0.62, y: fy + R * 0.78, r: R };
}

/** The moon: on the stage through its act, then it glides to where the
 *  Earth will be and takes its size — a touch bigger, so its limb crosses the
 *  viewfinder's focusing circle at the centre. */
export function moonSphere(env: Env, score: ReelScore, target: MoonTarget | null): Sphere {
  const S = stageOf(env);
  const glide = easeInOutCubic(segment(env.p, score.glide[0], score.glide[1]));
  const home = { x: S.cx, y: S.cy, r: S.r };
  let to = target ?? home;
  if (target) {
    const [fx, fy] = focusCentre(env);
    const reach = Math.hypot(target.x - fx, target.y - fy);
    to = { ...target, r: Math.max(target.r, reach - (env.phone ? 4 : 10)) };
  }
  // As it glides into the corner it turns its seas and its rayed crater
  // round into the quarter that stays on screen (the upper left).
  const turn = target ? glide : 0;
  const yaw = -0.3 + env.a * 0.5 + env.t * 0.015 - 0.95 * turn;
  return { cx: lerp(home.x, to.x, glide), cy: lerp(home.y, to.y, glide), r: lerp(home.r, to.r, glide), m: rotation(yaw, 0.12 - 0.52 * turn, 0), sx: 1, sy: 1 };
}
/** The moon's light: it waxes through its act, from a crescent to the Earth's
 *  own key light (upper left, a little from the front). */
export function moonLight(a: number): Vec3 {
  const t = smootherstep(clamp01(a * 1.1));
  // The sun swings round from behind on the right (a crescent lit on the
  // right, about a fifth of the disc) through full, and on a little past to
  // the Earth's own key side (upper left). It never passes through new: the
  // moon is never a dark disc.
  const phi = lerp(0.3, 1.08, t) * Math.PI;
  return normalize([Math.sin(phi), 0.3, -Math.cos(phi)]);
}
const MOON_SPLIT: Split = { angle: 1.1, offset: 0.28, bend: 0.3 };
/** The moon's twin (its seas seen from a second angle across an S): full on
 *  its stage, gone as it glides toward the viewfinder, which must see one
 *  clean limb to focus on. */
const moonTwin = (env: Env, score: ReelScore) => 1 - smootherstep(segment(env.p, score.glide[0] - 0.012, score.glide[0] + 0.025));
function paintMoonBackground(ctx: ReelCtx, env: Env, s: Sphere, score: ReelScore, alpha = 1) {
  // Night deepens into the archive's own olive as the moon takes its place.
  const S = stageOf(env);
  const toOlive = smoothstep(score.glide[0], score.finder[1], env.p);
  paintGround(ctx, env, GROUND.moon, null, 0, null, [S.cx, S.cy]);
  ground(ctx, env, C.olive, toOlive);
  const planes = (1 - toOlive) * alpha;
  paintPlane(ctx, env, 'moon', 'moon', 0, planes);
  // Its echo: the moon seen again, a flat slate shape off its shoulder.
  fillPoly(ctx, shift(limb(s, 72), -s.r * 0.22, -s.r * 0.12), C.slateDeep, 0.9 * planes);
  fillPoly(ctx, shift(limb(s, 72), -s.r * 0.08, -s.r * 0.02), C.night, planes);
  paintStars(ctx, env, s, 0.85 * (1 - toOlive * 0.9) * alpha);
}
/** Stars: Picasso's four-pointed ones, few. */
function paintStars(ctx: ReelCtx, env: Env, s: Disc, alpha: number) {
  const stars: Vec2[][] = [];
  for (let i = 0; i < (env.phone ? 14 : 26); i += 1) {
    const x = hash(i, 101) * env.w, y = hash(i, 103) * env.h * 0.9;
    if (Math.hypot(x - s.cx, y - s.cy) < s.r * 1.3) continue;
    const size = W(env, 5 + hash(i, 107) * 9) * (0.75 + 0.25 * Math.sin(env.t * 1.3 + i));
    const w = size * 0.2;
    stars.push([[x, y - size], [x + w, y - w], [x + size, y], [x + w, y + w], [x, y + size], [x - w, y + w], [x - size, y], [x - w, y - w]]);
  }
  fillPolys(ctx, stars, C.bone, alpha);
}
function paintMoonSurface(ctx: ReelCtx, s: Sphere, alpha: number) {
  const maria: Vec2[][] = [];
  for (const patch of MARE_PATCHES) {
    const pts = spherePatch(s, patch, 3);
    if (pts) maria.push(pts);
  }
  fillPolys(ctx, maria, C.stoneSea, 0.9 * alpha);
  // The seas engraved: one direction of fine lines across all of them.
  if (maria.length) {
    ctx.save();
    ctx.beginPath();
    for (const m of maria) path(ctx, m);
    ctx.clip();
    ctx.globalAlpha = 0.4 * alpha;
    ctx.strokeStyle = C.stoneEngrave;
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
      brush(ctx, [[rx, ry], [rx + Math.cos(a) * len, ry + Math.sin(a) * len * foreshorten]], s.r * 0.012, C.stoneRay, 0.8 * alpha, [0.02, 0.9]);
    }
  }
  const lips: Vec2[][] = [], bowls: Vec2[][] = [], floors: Vec2[][] = [];
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
    lips.push(oval(1.16, -rr * 0.05, -rr * 0.05));
    bowls.push(oval(1, 0, 0));
    floors.push(oval(0.78, rr * 0.2, rr * 0.18));
  }
  // (Grouped by tone, so a crater's lip may lie under its neighbour's bowl —
  // cut paper, laid down a sheet at a time.)
  fillPolys(ctx, lips, C.stoneLip, 0.9 * alpha);
  fillPolys(ctx, bowls, C.stoneBowl, 0.95 * alpha);
  fillPolys(ctx, floors, C.stoneFloor, 0.95 * alpha);
}
function paintMoonBall(ctx: ReelCtx, env: Env, s: Sphere, light: Vec3, alpha = 1, twinK = 0, s2: Sphere | null = null) {
  const slip: Vec2 = [s.r * 0.02, -s.r * 0.015];
  fillPoly(ctx, shift(limb(s, 128), slip[0], slip[1]), C.stone, alpha);
  ctx.save();
  clipTo(ctx, limb(s, 128));
  // The limb darkens: a flat band inside the edge, deepest away from the
  // light (a cut-paper crescent, not a gradient).
  ctx.globalAlpha = 0.75 * alpha;
  ctx.fillStyle = C.stoneLimb;
  ctx.beginPath();
  path(ctx, limb(s, 128));
  path(ctx, [...limb({ ...s, cx: s.cx - s.r * 0.05 * s.sx, cy: s.cy - s.r * 0.05 * s.sy, r: s.r * 0.9 }, 128)].reverse());
  ctx.fill();
  ctx.globalAlpha = 1;
  paintMoonSurface(ctx, s, alpha);
  if (twinK > 0.002 && s2) {
    // The other half of the S: stone again, and its seas from the second angle.
    ctx.save();
    clipTo(ctx, splitRegion(s, MOON_SPLIT, 1));
    fillPoly(ctx, limb(s, 96), C.stone, twinK * alpha);
    paintMoonSurface(ctx, s2, twinK * alpha);
    ctx.restore();
  }
  const shadow = shadowPlane(s, light, 0.0, 9);
  if (shadow) {
    fillPoly(ctx, shift(shadow, slip[0], slip[1]), C.stoneDark, 0.96 * alpha);
    hatch(ctx, shadow, Math.PI / 4, s.r * 0.05, C.slateMid, Math.max(0.8, s.r * 0.004), 0.4 * alpha);
    brush(ctx, shadow.slice(0, 10), s.r * 0.018, C.ink, alpha, [0.1, 0.1]);
  }
  ctx.restore();
  if (twinK > 0.002) splitStroke(ctx, s, MOON_SPLIT, s.r * 0.016, 0.8 * twinK * alpha);
  // The contour thins as the moon grows toward the corner (the Earth has no
  // drawn edge; the viewfinder focuses on the limb itself).
  const S = stageOf(env);
  ballContour(ctx, s, alpha, CONTOUR * Math.min(1, S.r / s.r) * 0.9);
}
function paintMoonScene(ctx: ReelCtx, env: Env, score: ReelScore, target: MoonTarget | null) {
  const s = moonSphere(env, score, target);
  paintMoonBackground(ctx, env, s, score);
  const twinK = moonTwin(env, score);
  const twinS = twinK > 0.002 ? { ...s, m: twin(-0.3 + env.a * 0.5 + env.t * 0.015, 0.12, 0) } : null;
  paintMoonBall(ctx, env, s, moonLight(env.a), 1, twinK, twinS);
  const toOlive = smoothstep(score.glide[0], score.finder[1], env.p);
  facetsFor(ctx, env, 'moon', 'moon', 0, 1 - toOlive);
}

export interface Finder {
  /** 0 → 1: the mask and focusing screen come in. */
  in: number;
  /** 0 → 1: the split image comes together. */
  focus: number;
}
/** The viewfinder's furniture over the scene: the eyepiece mask, the
 *  focusing screen's microprism collar, the meter needle, the focus lamp. The
 *  split image itself is composited by the renderer. */
function paintFinderFurniture(ctx: ReelCtx, env: Env, finder: Finder) {
  const k = smootherstep(finder.in);
  if (k <= 0) return;
  const win = finderWindow(env, k);
  const v = win.view;
  const radius = lerp(0, env.phone ? 3 : 4, k);
  const pts: Vec2[] = [];
  const corner = (x: number, y: number, a0: number) => {
    for (let i = 0; i <= 6; i += 1) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push([x + Math.cos(a) * radius, y + Math.sin(a) * radius]);
    }
  };
  corner(win.x1 - radius, win.y0 + radius, -Math.PI / 2);
  corner(win.x1 - radius, win.y1 - radius, 0);
  corner(win.x0 + radius, win.y1 - radius, Math.PI / 2);
  corner(win.x0 + radius, win.y0 + radius, Math.PI);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.finder;
  ctx.beginPath();
  path(ctx, [[-env.w, -env.h], [env.w * 2, -env.h], [env.w * 2, env.h * 2], [-env.w, env.h * 2]]);
  path(ctx, [...pts].reverse());
  ctx.fill();
  const [fx, fy] = focusCentre(env);
  const split = splitRadius(env);
  const collar = collarRadius(env);
  const shimmer = 1 - smootherstep(finder.focus);
  // The microprism collar: a ring of fine grain that shimmers until focused.
  ctx.save();
  ctx.beginPath();
  path(ctx, circlePoly(fx, fy, collar, 64));
  path(ctx, circlePoly(fx, fy, split, 48).reverse());
  ctx.clip();
  const pitch = env.phone ? 3.5 : 5;
  const grains = { light: [] as Vec2[][], dark: [] as Vec2[][] };
  for (let gx = fx - collar; gx <= fx + collar; gx += pitch) {
    for (let gy = fy - collar; gy <= fy + collar; gy += pitch) {
      const hsh = hash(Math.round(gx * 3 + gy * 7), 131);
      const x = gx + (hsh - 0.5) * pitch * shimmer;
      const d = pitch * 0.26;
      (hsh > 0.5 ? grains.light : grains.dark).push([[x, gy - d], [x + d, gy], [x, gy + d], [x - d, gy]]);
    }
  }
  fillPolys(ctx, grains.light, C.bone, 0.35 * k);
  fillPolys(ctx, grains.dark, C.ink, 0.35 * k);
  ctx.restore();
  const collarRing = circlePoly(fx, fy, collar, 72);
  const splitRing = circlePoly(fx, fy, split, 72);
  line(ctx, [...collarRing, collarRing[0]], C.bone, env.phone ? 0.8 : 1, 0.35 * k);
  line(ctx, [...splitRing, splitRing[0]], C.bone, env.phone ? 1 : 1.3, 0.7 * k);
  line(ctx, [[fx - split, fy], [fx + split, fy]], C.bone, env.phone ? 0.7 : 0.9, 0.5 * k * shimmer);
  // Below the window, in the black: the meter's scale and needle, and the
  // focus lamp.
  const my = win.y1 + (v.y1 - win.y1) * 0.5;
  const scaleW = viewWidth(env) * (env.phone ? 0.3 : 0.12);
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

/** Where a ball stands in its hold (all on the one stage; the basketball
 *  bouncing about it, the moon until it glides). */
export function ballAt(kind: SphereKind, env: Env, score: ReelScore): Stage {
  switch (kind) {
    case 'hole': { const g = holeGeometry(env); return { cx: g.cx, cy: g.cy, r: g.R }; }
    case 'basket': { const q = basketPose(env); return { cx: q.cx, cy: q.cy, r: q.r }; }
    case 'football': { const q = footballPose(env); return { cx: q.cx, cy: q.cy, r: q.r }; }
    case 'cookie': { const q = cookieState(env); return { cx: q.cx, cy: q.cy, r: q.r }; }
    case 'light': { const g = lightGeometry(env); return { cx: g.cx, cy: g.cy, r: stageOf(env).r }; }
    case 'disco': { const q = discoPose(env); return { cx: q.cx, cy: q.cy, r: q.r }; }
    case 'moon': { const q = moonSphere(env, score, null); return { cx: q.cx, cy: q.cy, r: q.r }; }
  }
}

/** One ball on its stage (a hold). */
export function paintSphereScene(ctx: ReelCtx, kind: SphereKind, env: Env, score: ReelScore, target: MoonTarget | null) {
  switch (kind) {
    case 'hole': return paintHole(ctx, env);
    case 'basket': return paintBasketScene(ctx, env);
    case 'football': return paintFootballScene(ctx, env);
    case 'cookie': return paintCookieScene(ctx, env);
    case 'light': return paintLightScene(ctx, env);
    case 'disco': return paintDiscoScene(ctx, env);
    case 'moon': return paintMoonScene(ctx, env, score, target);
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

// ── Turns, on the ball ─────────────────────────────────────────────────────

/** Hole → basketball: the lens lets the lattice go; the halo and the orbits
 *  close onto the dark; the disc's rings draw in onto the limb and tip into
 *  the basketball's equator; the dark grows, rises to the stage and fills
 *  with leather from the S outward; the seams come up through it. */
function paintHoleToBasket(ctx: ReelCtx, envA: Env, envB: Env, mix: number) {
  const hs = holeState(envA);
  const S = stageOf(envA);
  const e = smootherstep(mix);
  const lensK = 1 - smootherstep(segment(mix, 0, 0.75));
  paintGround(ctx, envA, GROUND.hole, GROUND.basket, mix, { cx: hs.cx, cy: hs.cy, re: hs.re * lensK, swirl: hs.swirl * lensK }, [lerp(hs.cx, S.cx, e), lerp(hs.cy, S.cy, e)]);
  paintPlane(ctx, envA, 'hole', 'basket', mix);
  const target = basketPose(envB);
  const g = smootherstep(segment(mix, 0.05, 0.85));
  const pose: Pose & { floor: number } = {
    ...target,
    cx: lerp(hs.cx, target.cx, g),
    cy: lerp(hs.cy, target.cy, g),
    r: lerp(hs.R, target.r, g),
    sx: lerp(1, target.sx, g),
    sy: lerp(1, target.sy, g),
    // It comes up edge-on, its equator lying in the disc, and tips over into
    // its three-quarter view as it spins into place.
    pitch: lerp(0.04, target.pitch, smootherstep(segment(mix, 0.3, 1))),
    yaw: target.yaw - (1 - e) * 2.4,
  };
  const n = apply(rotation(pose.yaw, pose.pitch, pose.roll), [0, 1, 0]);
  const close = smootherstep(segment(mix, 0.12, 0.62));
  const extras = segment(mix, 0.6, 1);
  paintBasketShadow(ctx, envB, pose, extras);
  paintBasketTrail(ctx, envB, extras);
  paintHoleBody(ctx, envA, hs, {
    cx: pose.cx, cy: pose.cy, R: pose.r, sx: pose.sx, sy: pose.sy,
    halo: 1 - smootherstep(segment(mix, 0, 0.5)),
    haloAlpha: 1 - segment(mix, 0.3, 0.55),
    disc: close,
    discAlpha: 1 - segment(mix, 0.56, 0.74),
    tilt: lerp(HOLE_TILT(envA.t), Math.atan2(n[0], n[1]), close),
    squash: lerp(0.075, Math.max(0.02, Math.abs(n[2])), close),
    orbits: 1 - e,
    orbitsAlpha: 1 - segment(mix, 0.2, 0.6),
    photonAlpha: 1 - segment(mix, 0.35, 0.75),
    darkAlpha: 1 - segment(mix, 0.8, 0.97),
    inside: () => paintBasketBall(ctx, envB, pose, {
      fill: smootherstep(segment(mix, 0.3, 0.88)),
      seams: segment(mix, 0.48, 0.9),
      contour: 0,
      extras,
    }),
  });
  ballContour(ctx, pose, segment(mix, 0.3, 0.7));
  facetsFor(ctx, envA, 'hole', 'basket', mix);
}

/** Basketball → football: one tumble (a quarter turn in pitch as it spins);
 *  bone sweeps across the leather behind an S; the four seams break into
 *  ninety pieces which slide into a football's edges; the pentagons ink in. */
function paintBasketToFootball(ctx: ReelCtx, envA: Env, envB: Env, mix: number) {
  const e = smootherstep(mix);
  const S = stageOf(envA);
  paintGround(ctx, envA, GROUND.basket, GROUND.football, mix, null, [S.cx, S.cy]);
  paintPlane(ctx, envA, 'basket', 'football', mix);
  const pb = basketPose(envA), pf = footballPose(envB);
  const pose: Pose = {
    cx: S.cx,
    cy: lerp(pb.cy, pf.cy, e),
    r: S.r,
    sx: lerp(pb.sx, 1, e),
    sy: lerp(pb.sy, 1, e),
    yaw: pb.yaw + wrapPi(pf.yaw - pb.yaw) * e,
    pitch: pb.pitch + (wrapPi(pf.pitch - pb.pitch - Math.PI / 2) + Math.PI / 2) * e,
    roll: pb.roll + wrapPi(pf.roll - pb.roll) * e,
  };
  const s = sphereOf(pose), s2 = twinOf(pose);
  paintBasketShadow(ctx, envA, pb, 1 - e);
  paintBasketTrail(ctx, envA, 1 - e);
  castShadow(ctx, pose, S.cy + S.r * 1.04, 0.95, 0.4 * e, 0.25);
  const split = lerpSplit(basketSplit(envA), footballSplit(envB), e);
  const sweep = smootherstep(segment(mix, 0.12, 0.8));
  const front = lerp(-1.9, 1.9, sweep);
  const turned = sideOf(sCurve(s.cx, s.cy, 0.62, front * s.r, 0.35 * s.r, s.r * 1.05, s.r * 1.6, 48), 0.62, s.r * 3, -1);
  const slip: Vec2 = [s.r * lerp(0.035, 0.03, e), -s.r * lerp(0.025, 0.02, e)];
  const old = 1 - segment(mix, 0.05, 0.32);
  const u = smootherstep(segment(mix, 0.12, 0.85));
  const pieces = segment(mix, 0, 0.18);
  const slipped = shift(limb(s, 96), slip[0], slip[1]);
  // The leather, and the bone sweeping over it (all bone once it has passed).
  const skin = (leather: string, bone: string) => {
    if (sweep >= 1) {
      fillPoly(ctx, slipped, bone);
      return;
    }
    fillPoly(ctx, slipped, leather);
    if (sweep <= 0) return;
    ctx.save();
    clipTo(ctx, slipped);
    fillPoly(ctx, shift(turned, slip[0], slip[1]), bone);
    ctx.restore();
  };
  skin(C.leather, C.bone);
  doubleFace(ctx, s, split, (dark) => {
    const sv = dark ? s2 : s;
    if (dark) {
      skin(C.leatherDark, C.tealPale);
      hatch(ctx, limb(s, 64), -Math.PI / 3, s.r * 0.055, C.ink, Math.max(0.8, s.r * 0.007), 0.3 * (1 - e));
    }
    for (const curve of BASKET_SEAMS) seam(ctx, sv, curve, s.r * 0.055, C.ink, old);
    paintPentagons(ctx, sv, dark ? C.tealDeep : C.ink, 0, mix);
    footballSeams(ctx, sv, s.r * lerp(0.055, 0.02, u), pieces * lerp(1, 0.9, u), u);
    if (dark) hatch(ctx, limb(s, 64), Math.PI / 3, s.r * 0.06, C.tealDeep, Math.max(0.8, s.r * 0.006), 0.45 * e);
  });
  splitStroke(ctx, s, split, s.r * lerp(0.018, 0.02, e), lerp(0.85, 0.9, e));
  highlight(ctx, s, C.bone, lerp(0.9, 0.95, e), lerp(1, 0.85, e));
  echoRing(ctx, s, -0.1, -0.06, 23, 0.8 * (1 - e));
  echoRing(ctx, s, 0.14, -0.08, 33, 0.85 * e);
  ballContour(ctx, s);
  facetsFor(ctx, envA, 'basket', 'football', mix);
}

/** Cookie → traffic light: the cookie cracks into three, the pieces — still
 *  cookie, chips and all — rise and fall into a column and round off into
 *  the lamps, and the housing closes round them; all on the stage, while the
 *  cloth turns to night. */
function paintCookieToLight(ctx: ReelCtx, envA: Env, envB: Env, mix: number) {
  const s = cookieState(envA);
  const g = lightGeometry(envB);
  const levels = lampLevels(envB.a);
  const crack = smoothstep(0, 0.2, mix);
  const travel = smootherstep(segment(mix, 0.16, 0.8));
  const round = smootherstep(segment(mix, 0.38, 0.9));
  paintGround(ctx, envA, GROUND.cookie, GROUND.light, mix, null, [s.cx, s.cy]);
  paintPlane(ctx, envA, 'cookie', 'light', mix);
  castShadow(ctx, s, s.cy + s.r * 1.06, 0.9, 0.3 * (1 - crack), 0.2);
  paintLightGlow(ctx, g, levels, round);
  // The cookie as it was when it cracked (its bites done).
  const bites = cookieBites(envA.a);
  const outline = cookieOutlineOf(envA, s.cx, s.cy, s.r, bites);
  const n = outline.length;
  const cracks = [-Math.PI / 2 + 0.2, Math.PI / 6 + 0.1, (5 * Math.PI) / 6 - 0.15];
  const angleOf = (p: Vec2) => Math.atan2(p[1] - s.cy, p[0] - s.cx);
  const jag = (a: number, seed: number): Vec2[] => {
    const out: Vec2[] = [];
    for (let k = 1; k < 6; k += 1) {
      const d = (k / 6) * s.r;
      const off = (hash(k, seed) - 0.5) * s.r * 0.12;
      out.push([s.cx + Math.cos(a) * d - Math.sin(a) * off, s.cy + Math.sin(a) * d + Math.cos(a) * off]);
    }
    return out;
  };
  const housing = smootherstep(segment(mix, 0.68, 1));
  // (Round and housed, the pieces are the lamps the housing draws.)
  for (let i = 0; i < 3 && !(round >= 1 && housing >= 1); i += 1) {
    const a0 = cracks[i];
    let a1 = cracks[(i + 1) % 3];
    while (a1 <= a0) a1 += Math.PI * 2;
    // Its stretch of the rim, by the outline's own points (so the rim's
    // heavy side stays where it was).
    const arc = outline
      .map((p, idx) => {
        let a = angleOf(p);
        while (a < a0) a += Math.PI * 2;
        return { p, a, idx };
      })
      .filter((q) => q.a <= a1)
      .sort((q, r) => q.a - r.a);
    const jagA = jag(a0, 400 + i), jagB = jag(a1, 400 + ((i + 1) % 3));
    const piece: Vec2[] = [[s.cx, s.cy], ...jagA, ...arc.map((q) => q.p), ...[...jagB].reverse()];
    const c = piece.reduce<[number, number]>((acc, p) => [acc[0] + p[0] / piece.length, acc[1] + p[1] / piece.length], [0, 0]);
    const dir = Math.atan2(c[1] - s.cy, c[0] - s.cx);
    const spread = crack * s.r * 0.12;
    const home: Vec2 = [c[0] + Math.cos(dir) * spread, c[1] + Math.sin(dir) * spread];
    const dest: Vec2 = [g.cx, g.lamps[i]];
    const lift = Math.sin(travel * Math.PI) * s.r * (0.3 + 0.15 * i) * (i === 1 ? -1 : 1);
    const at: Vec2 = [lerp(home[0], dest[0], travel) + lift * 0.4, lerp(home[1], dest[1], travel) - Math.abs(lift)];
    const spin = travel * (i - 1) * 0.7 * (1 - round);
    const cs = Math.cos(spin), sn = Math.sin(spin);
    const place = ([x, y]: Vec2): Vec2 => [at[0] + (x - c[0]) * cs - (y - c[1]) * sn, at[1] + (x - c[0]) * sn + (y - c[1]) * cs];
    const shape = resampleClosed(piece, 72, -Math.PI / 2);
    const circle = circlePoly(0, 0, g.lampR, 72, -Math.PI / 2);
    const morphed = shape.map(([x, y], k) => {
      const X = lerp(x - c[0], circle[k][0], round), Y = lerp(y - c[1], circle[k][1], round);
      return [at[0] + X * cs - Y * sn, at[1] + X * sn + Y * cs] as Vec2;
    });
    // The piece: the cookie's own face, carried with it…
    if (round < 0.999) {
      ctx.save();
      clipTo(ctx, morphed);
      ctx.translate(at[0], at[1]);
      ctx.rotate(spin);
      ctx.translate(-c[0], -c[1]);
      paintCookieFace(ctx, s.cx, s.cy, s.r, s.spin, outline);
      ctx.restore();
    }
    // …going over to the lamp's glass as it rounds off.
    const lamp = LAMPS[i];
    fillPoly(ctx, morphed, lamp.off, round);
    if (levels[i] > 0) fillPoly(ctx, morphed, lamp.on, levels[i] * round);
    // Its edges: the rim (the cookie's own contour) and the fresh breaks.
    const rim = arc.map((q) => place(q.p));
    fillPoly(ctx, brushOutline(rim, (_t, k) => cookieEdgeWidth(s.r, arc[k].idx, n)), C.ink, 1 - round);
    brush(ctx, ([[s.cx, s.cy], ...jagA] as Vec2[]).map(place), s.r * 0.022, C.ink, crack * (1 - round), [0.05, 0.3]);
    brush(ctx, ([[s.cx, s.cy], ...jagB] as Vec2[]).map(place), s.r * 0.022, C.ink, crack * (1 - round), [0.05, 0.3]);
    fillPoly(ctx, brushOutline([...morphed, morphed[0], morphed[1]], () => g.lampR * 0.07), C.ink, round);
  }
  gestureRing(ctx, s.cx - s.r * 0.08, s.cy - s.r * 0.05, s.r * 1.02, s.r * 1.0, s.r * 0.01, C.ink, 47, Math.PI * 1.2, 0.8 * (1 - crack));
  if (housing > 0) paintLightBody(ctx, envB, g, levels, housing);
  facetsFor(ctx, envA, 'cookie', 'light', mix);
}

/** Traffic light → mirror ball: the housing opens away and the three lamps
 *  multiply — each throws off the tiles of its third of the ball, which fly
 *  to their places on the sphere and take its tones. */
function paintLightToDisco(ctx: ReelCtx, envA: Env, envB: Env, mix: number) {
  const g = lightGeometry(envA);
  const levels = lampLevels(envA.a);
  const S = stageOf(envA);
  paintGround(ctx, envA, GROUND.light, GROUND.disco, mix, null, [S.cx, S.cy]);
  paintPlane(ctx, envA, 'light', 'disco', mix);
  const pose = discoPose(envB);
  const s = sphereOf(pose);
  paintLightGlow(ctx, g, levels, 1 - segment(mix, 0, 0.5));
  const body = smootherstep(segment(mix, 0.3, 0.75));
  const settle = smootherstep(segment(mix, 0.84, 1));
  if (settle < 1) fillPoly(ctx, shift(limb(s, 96), s.r * 0.025, -s.r * 0.02), C.slateDeep, body);
  const housing = 1 - smootherstep(segment(mix, 0, 0.4));
  paintLightBody(ctx, envA, g, levels, housing, 1 - smootherstep(segment(mix, 0.22, 0.62)));
  if (settle < 1) {
    const groups = new Map<string, Vec2[][]>();
    for (const tile of discoTiles(s)) {
      const t0 = 0.08 + 0.42 * hash(tile.key, 331);
      const u = smootherstep(segment(mix, t0, t0 + 0.38));
      if (u <= 0.001) continue;
      const lamp = LAMPS[tile.lamp];
      const ja = hash(tile.key, 337) * Math.PI * 2, jr = Math.sqrt(hash(tile.key, 339)) * g.lampR * 0.7;
      const sx = g.cx + Math.cos(ja) * jr, sy = g.lamps[tile.lamp] + Math.sin(ja) * jr;
      const size = g.lampR * 0.16;
      const src: Vec2[] = [[sx - size, sy - size], [sx + size, sy - size], [sx + size, sy + size], [sx - size, sy + size]];
      const quad = tile.quad.map((q, i) => [lerp(src[i][0], q[0], u), lerp(src[i][1], q[1], u)] as Vec2);
      const tone = u < 0.55 ? (levels[tile.lamp] > 0.5 ? lamp.on : lamp.rings[1]) : tileTone(tile, false, 0);
      const list = groups.get(tone);
      if (list) list.push(quad);
      else groups.set(tone, [quad]);
    }
    for (const [tone, list] of groups) fillPolys(ctx, list, tone, 1 - settle);
  }
  if (settle > 0) paintDiscoBall(ctx, envB, pose, 0, settle);
  ballContour(ctx, s, segment(mix, 0.45, 0.85) * (1 - settle));
  facetsFor(ctx, envA, 'light', 'disco', mix);
}
/** Mirror ball → moon: the ball tumbles a quarter turn as its facets turn
 *  over to stone in a sweep; the grid lets go and the moon is under it; the
 *  room goes to night. */
function paintDiscoToMoon(ctx: ReelCtx, envA: Env, envB: Env, mix: number, score: ReelScore, target: MoonTarget | null) {
  const flip = smootherstep(segment(mix, 0, 0.62));
  const settle = smootherstep(segment(mix, 0.45, 1));
  const S = stageOf(envA);
  const pd = discoPose(envA);
  const ms = moonSphere(envB, score, target);
  const tumble = (Math.PI / 2) * smootherstep(segment(mix, 0, 0.8));
  const pose: Pose = { ...pd, cx: lerp(pd.cx, ms.cx, settle), cy: lerp(pd.cy, ms.cy, settle), r: lerp(pd.r, ms.r, settle), pitch: pd.pitch + tumble };
  paintGround(ctx, envA, GROUND.disco, GROUND.moon, mix, null, [S.cx, S.cy]);
  paintPlane(ctx, envA, 'disco', 'moon', mix);
  const s = { ...ms, cx: pose.cx, cy: pose.cy, r: pose.r };
  if (settle > 0) {
    // The night's stars and the moon's echo come up with it.
    fillPoly(ctx, shift(limb(s, 72), -s.r * 0.22, -s.r * 0.12), C.slateDeep, 0.9 * settle);
    fillPoly(ctx, shift(limb(s, 72), -s.r * 0.08, -s.r * 0.02), C.night, settle);
    paintStars(ctx, envB, s, 0.85 * settle);
  }
  if (settle < 1) paintDiscoBall(ctx, envA, pose, flip);
  if (settle > 0) {
    const twinK = moonTwin(envB, score);
    paintMoonBall(ctx, envB, s, moonLight(envB.a), settle, twinK, twinK > 0.002 ? { ...s, m: twin(-0.3 + envB.a * 0.5 + envB.t * 0.015, 0.12, 0) } : null);
  }
  facetsFor(ctx, envA, 'disco', 'moon', mix);
}

/** The turns drawn on the ball (the rest are done as collage, by the
 *  renderer, which composites two scenes). */
const ON_BALL = new Set(['hole>basket', 'basket>football', 'cookie>light', 'light>disco', 'disco>moon', 'light>moon']);
export function paintTurn(ctx: ReelCtx, from: SphereKind, to: SphereKind, envA: Env, envB: Env, mix: number, score: ReelScore, target: MoonTarget | null) {
  switch (`${from}>${to}`) {
    case 'hole>basket': return paintHoleToBasket(ctx, envA, envB, mix);
    case 'basket>football': return paintBasketToFootball(ctx, envA, envB, mix);
    case 'cookie>light': return paintCookieToLight(ctx, envA, envB, mix);
    case 'light>disco': return paintLightToDisco(ctx, envA, envB, mix);
    case 'disco>moon': return paintDiscoToMoon(ctx, envA, envB, mix, score, target);
    case 'light>moon': {
      // (A phone's shorter film passes through the mirror ball on the way.)
      const envD: Env = { ...envB, a: 0.3 };
      if (mix < 0.5) return paintLightToDisco(ctx, envA, envD, mix * 2);
      return paintDiscoToMoon(ctx, envD, envB, mix * 2 - 1, score, target);
    }
  }
}

// ── The shutter ──────────────────────────────────────────────────────────

export interface ShutterState {
  /** 0 = open (the blade tips just outside the view), 1 = shut. */
  closed: number;
  /** The opening shows the page beneath (the canvas is clear there). */
  revealed: boolean;
  /** Where the blades close to, in design units. */
  cx: number;
  cy: number;
  /** The view (design units) and one CSS pixel in design units. */
  view: View;
  unit: number;
  /** The viewfinder's window: over the reel the blades need only clear it
   *  (the black round it hides their tips); the renderer sets it. */
  window?: View;
}
/** Seven near-black blades, turning in as they close, each with a hairline
 *  of light along its leading edge. Open (0), the opening's inscribed circle
 *  just clears the view's far corner, so any closing at all shows the tips. */
export function paintBlades(ctx: ReelCtx, shutter: ShutterState) {
  const closed = clamp01(shutter.closed);
  if (closed <= 0) return;
  const v = !shutter.revealed && shutter.window ? shutter.window : shutter.view;
  const corner = Math.hypot(Math.max(shutter.cx - v.x0, v.x1 - shutter.cx), Math.max(shutter.cy - v.y0, v.y1 - shutter.cy));
  const open = (corner / Math.cos(Math.PI / 7)) * 1.01;
  const aperture = open * (1 - closed);
  const twist = -closed * 1.1;
  const blades = irisBlades(shutter.cx, shutter.cy, aperture, 7, twist, corner * 4);
  for (const blade of blades) {
    fillPoly(ctx, blade, C.blade);
    line(ctx, [blade[0], blade[1]], C.bladeEdge, shutter.unit, 1);
  }
}

// ── The renderer (canvas only) ─────────────────────────────────────────────

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

  /** The viewport, in design units. */
  view(): View {
    return viewFor(this.cover, this.cssW, this.cssH);
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

  /** A turn as collage (the football shattering into the cookie): the frame
   *  is cut into planes round the ball; each lifts off like cut paper, turns
   *  over from the old ball's world to the new one's at its own moment, and
   *  is laid back in register. */
  private paintCollage(index: number, from: SphereKind, to: SphereKind, envA: Env, envB: Env, mix: number, score: ReelScore, target: MoonTarget | null) {
    const a = this.offscreen(false, (c) => paintSphereScene(c, from, envA, score, target));
    const b = this.offscreen(true, (c) => paintSphereScene(c, to, envB, score, target));
    const ctx = this.ctx;
    const [bx, by, bw, bh] = this.extent();
    const S = stageOf(envA);
    const reach = Math.max(envA.w, envA.h);
    const shards = shardsFromCuts(envA.w, envA.h, cutsAround([S.cx, S.cy], S.r * 0.95, envA.phone ? 3 : 4, 211 + index * 17), reach);
    const lift = bump(mix) ** 0.8;
    ground(ctx, envA, C.ink);
    shards.forEach((poly, k) => {
      const seed = 307 + index * 31 + k;
      const [sx, sy] = centroid(poly);
      const dirX = sx - S.cx, dirY = sy - S.cy;
      const dl = Math.hypot(dirX, dirY) || 1;
      const push = (envA.phone ? 12 : 30) * (0.6 + hash(k, seed) * 0.8) * lift;
      const dx = (dirX / dl) * push, dy = (dirY / dl) * push;
      const rot = (hash(k + 7, seed) - 0.5) * 0.1 * lift;
      const sc = 1 + (hash(k + 11, seed) - 0.3) * 0.05 * lift;
      const at = 0.3 + hash(k + 13, seed) * 0.4;
      const flip = clamp01((mix - at) / 0.07);
      ctx.save();
      ctx.translate(S.cx + dx, S.cy + dy);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      ctx.translate(-S.cx, -S.cy);
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

  /** A turn on the ball, with its four planes out of register: the picture
   *  is drawn once, then each plane shows it slid a little its own way (up
   *  to 18 design px at the turn's height), and comes back as it ends. */
  private paintAdrift(from: SphereKind, to: SphereKind, envA: Env, envB: Env, mix: number, drift: number, score: ReelScore, target: MoonTarget | null) {
    const buf = this.offscreen(false, (c) => paintTurn(c, from, to, envA, envB, mix, score, target));
    const ctx = this.ctx;
    const [bx, by, bw, bh] = this.extent();
    ctx.drawImage(buf, bx, by, bw, bh);
    const cuts = blendCuts(facetCuts(from, envA), facetCuts(to, envB), smootherstep(mix));
    for (const f of facetsOf(envA, cuts)) {
      const a = hash(f.code, 23) * Math.PI * 2;
      const d = drift * (0.45 + 0.55 * hash(f.code, 29));
      ctx.save();
      clipTo(ctx, f.poly);
      ctx.drawImage(buf, bx + Math.cos(a) * d, by + Math.sin(a) * d, bw, bh);
      ctx.restore();
    }
    const diag = Math.hypot(envA.w, envA.h);
    for (const c of cuts) {
      const dx = Math.cos(c.angle) * diag, dy = Math.sin(c.angle) * diag;
      line(ctx, [[c.p[0] - dx, c.p[1] - dy], [c.p[0] + dx, c.p[1] + dy]], C.paper, W(envA, 1.6), 0.5 * (drift / (envA.phone ? 8 : 18)));
    }
  }

  private design(ctx: CanvasRenderingContext2D) {
    const k = this.dpr * this.cover.s;
    ctx.setTransform(k, 0, 0, k, this.dpr * this.cover.ox, this.dpr * this.cover.oy);
  }

  render(score: ReelScore, p: number, t: number, target: MoonTarget | null, shutter: ShutterState | null) {
    const ctx = this.ctx;
    const { w, h } = this.frame;
    const view = this.view();
    const flow = reelFlow(score, p, t, this.phone);
    const env = (index: number): Env => ({ w, h, phone: this.phone, t, p, a: actClock(score, index, p), view, flow });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (shutter?.revealed) {
      // Over the page: only the blades, if any.
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (shutter.closed > 0.0005) {
        this.design(ctx);
        paintBlades(ctx, shutter);
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
      if (kind === 'moon' && finder.in > 0) this.paintFinder(score, env(beat.index), target, finder);
      else paintSphereScene(ctx, kind, env(beat.index), score, target);
    } else {
      const from = score.beats[beat.index].kind;
      const to = score.beats[beat.index + 1].kind;
      const envA = env(beat.index), envB = env(beat.index + 1);
      if (ON_BALL.has(`${from}>${to}`)) {
        const drift = bump(beat.mix) ** 1.5 * (this.phone ? 8 : 18);
        if (drift > 0.75) this.paintAdrift(from, to, envA, envB, beat.mix, drift, score, target);
        else paintTurn(ctx, from, to, envA, envB, beat.mix, score, target);
      } else {
        this.paintCollage(beat.index, from, to, envA, envB, beat.mix, score, target);
      }
    }
    if (shutter && shutter.closed > 0) {
      // Over the reel the blades need only clear the viewfinder's window as
      // it is now (all of the view when it is not up).
      const win = finderWindow(env(last), smootherstep(finder.in));
      paintBlades(ctx, { ...shutter, window: { x0: win.x0, y0: win.y0, x1: win.x1, y1: win.y1 } });
    }
    ctx.restore();
  }

  /** The moon through the viewfinder: the scene, the split image (the
   *  focusing circle's two halves see it shifted apart — up to 4% of the
   *  width — until focus brings them together), the eyepiece's furniture. */
  private paintFinder(score: ReelScore, env: Env, target: MoonTarget | null, finder: Finder) {
    const buf = this.offscreen(false, (c) => paintSphereScene(c, 'moon', env, score, target));
    const ctx = this.ctx;
    const [bx, by, bw, bh] = this.extent();
    ctx.drawImage(buf, bx, by, bw, bh);
    const k = smootherstep(finder.in);
    const [fx, fy] = focusCentre(env);
    const split = splitRadius(env);
    const unfocus = (1 - easeInOutCubic(finder.focus)) * k;
    const offset = unfocus * viewWidth(env) * 0.04;
    // Out of focus the whole view is doubled — a ghost of it a little to the
    // side — and the ghost slides home as the lens is focused.
    if (unfocus > 0.002) {
      ctx.save();
      ctx.beginPath();
      path(ctx, [[-env.w, -env.h], [env.w * 2, -env.h], [env.w * 2, env.h * 2], [-env.w, env.h * 2]]);
      path(ctx, circlePoly(fx, fy, split, 48).reverse());
      ctx.clip();
      ctx.globalAlpha = 0.4 * Math.min(1, unfocus * 1.6);
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

/** The viewport in design units, for a cover fit. */
export function viewFor(cover: { s: number; ox: number; oy: number }, cssW: number, cssH: number): View {
  const { s, ox, oy } = cover;
  return { x0: -ox / s, y0: -oy / s, x1: (cssW - ox) / s, y1: (cssH - oy) / s };
}

/** Where the shutter closes to: the lens's axis, the focusing screen's
 *  centre (in design units). */
export function shutterCentre(frame: { w: number; h: number }, phone: boolean, view?: View): Vec2 {
  return focusCentre({ w: frame.w, h: frame.h, phone, t: 0, p: 1, a: 1, view });
}
