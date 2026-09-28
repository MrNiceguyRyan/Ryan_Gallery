// ── The opening reel's first paint ──
// A stand-in for CanvasRenderingContext2D that records what the reel's
// painter (src/lib/introReelPaint.ts) draws and writes it out as SVG, so the
// server can ship the cover as markup: it paints with the HTML, before any
// script, and the canvas that takes over draws the same frame on top of it.
// Only what the painter uses is here (paths, fills, strokes, clips, the
// transform, alpha). Every subpath is thinned (Ramer–Douglas–Peucker, a
// third of a design pixel) and numbers carry one decimal, which keeps the
// cover to a few dozen kilobytes of markup.

import type { ReelCtx } from './introReelPaint';

type Matrix = [number, number, number, number, number, number];
type Pt = [number, number];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  const t2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1, index = -1;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = points[i];
      let d2: number;
      if (len2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d2 > worst) { worst = d2; index = i; }
    }
    if (worst > t2 && index > 0) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const num = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

interface State {
  m: Matrix;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  groups: number;
}

export class SvgRecorder implements ReelCtx {
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  globalAlpha = 1;
  private m: Matrix = [1, 0, 0, 1, 0, 0];
  private stack: State[] = [];
  private groups = 0;
  private subpaths: { pts: Pt[]; closed: boolean }[] = [];
  private current: { pts: Pt[]; closed: boolean } | null = null;
  private out: string[] = [];
  private clips = 0;
  private readonly idPrefix: string;
  private readonly tolerance: number;
  private readonly view: { w: number; h: number } | null;

  constructor(idPrefix = 'reel', view: { w: number; h: number } | null = null, tolerance = 0.45) {
    this.idPrefix = idPrefix;
    this.view = view;
    this.tolerance = tolerance;
  }

  save() {
    this.stack.push({
      m: this.m,
      fillStyle: String(this.fillStyle),
      strokeStyle: String(this.strokeStyle),
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      globalAlpha: this.globalAlpha,
      groups: this.groups,
    });
    this.groups = 0;
  }
  restore() {
    for (let i = 0; i < this.groups; i += 1) this.out.push('</g>');
    const s = this.stack.pop();
    if (!s) { this.groups = 0; return; }
    this.m = s.m;
    this.fillStyle = s.fillStyle;
    this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth;
    this.lineCap = s.lineCap;
    this.lineJoin = s.lineJoin;
    this.globalAlpha = s.globalAlpha;
    this.groups = s.groups;
  }
  translate(x: number, y: number) { this.m = multiply(this.m, [1, 0, 0, 1, x, y]); }
  rotate(a: number) { const c = Math.cos(a), s = Math.sin(a); this.m = multiply(this.m, [c, s, -s, c, 0, 0]); }
  scale(x: number, y: number) { this.m = multiply(this.m, [x, 0, 0, y, 0, 0]); }

  private point(x: number, y: number): Pt {
    const m = this.m;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }
  beginPath() { this.subpaths = []; this.current = null; }
  moveTo(x: number, y: number) {
    this.current = { pts: [this.point(x, y)], closed: false };
    this.subpaths.push(this.current);
  }
  lineTo(x: number, y: number) {
    if (!this.current) { this.moveTo(x, y); return; }
    this.current.pts.push(this.point(x, y));
  }
  closePath() { if (this.current) this.current.closed = true; this.current = null; }
  arc(x: number, y: number, r: number, a0: number, a1: number) {
    const scale = Math.sqrt(Math.abs(this.m[0] * this.m[3] - this.m[1] * this.m[2]));
    const n = Math.max(10, Math.ceil((Math.abs(a1 - a0) * r * scale) / 3));
    for (let i = 0; i <= n; i += 1) {
      const a = a0 + ((a1 - a0) * i) / n;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0 && !this.current) this.moveTo(px, py);
      else this.lineTo(px, py);
    }
  }
  /** Nothing outside the frame can show (the SVG is laid over the viewport
   *  with `slice`, which only ever crops): shapes wholly outside are dropped
   *  and open lines are trimmed to their stretch inside. */
  private inView(pts: Pt[]) {
    if (!this.view) return true;
    const m = 4;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return maxX >= -m && minX <= this.view.w + m && maxY >= -m && minY <= this.view.h + m;
  }
  private trim(pts: Pt[]): Pt[] {
    if (!this.view) return pts;
    const m = 4;
    const inside = ([x, y]: Pt) => x >= -m && x <= this.view!.w + m && y >= -m && y <= this.view!.h + m;
    let first = pts.findIndex(inside);
    if (first < 0) return [];
    let last = pts.length - 1;
    while (last > first && !inside(pts[last])) last -= 1;
    first = Math.max(0, first - 1);
    last = Math.min(pts.length - 1, last + 1);
    return pts.slice(first, last + 1);
  }
  private data() {
    let d = '';
    for (const sp of this.subpaths) {
      if (!this.inView(sp.pts)) continue;
      const pts = simplify(sp.closed ? sp.pts : this.trim(sp.pts), this.tolerance);
      if (pts.length < 2) continue;
      // Relative, whole design pixels: the cover is a first paint the canvas
      // replaces within a second, drawn at a scale of one or more.
      let x = Math.round(pts[0][0]);
      let y = Math.round(pts[0][1]);
      d += `M${x} ${y}`;
      let run = '';
      for (let i = 1; i < pts.length; i += 1) {
        const nx = Math.round(pts[i][0]);
        const ny = Math.round(pts[i][1]);
        if (nx === x && ny === y) continue;
        const dx = nx - x, dy = ny - y;
        run += `${run ? (dx < 0 ? '' : ' ') : 'l'}${dx}${dy < 0 ? '' : ' '}${dy}`;
        x = nx;
        y = ny;
      }
      d += run;
      if (sp.closed) d += 'z';
    }
    return d;
  }
  private alpha(attr: string) {
    return this.globalAlpha < 0.999 ? ` ${attr}="${Math.round(this.globalAlpha * 1000) / 1000}"` : '';
  }
  fill() {
    const d = this.data();
    if (d) this.out.push(`<path d="${d}" fill="${String(this.fillStyle)}"${this.alpha('fill-opacity')}/>`);
  }
  stroke() {
    const d = this.data();
    if (!d) return;
    const scale = Math.sqrt(Math.abs(this.m[0] * this.m[3] - this.m[1] * this.m[2]));
    this.out.push(
      `<path d="${d}" fill="none" stroke="${String(this.strokeStyle)}" stroke-width="${num(this.lineWidth * scale)}"` +
        ` stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"${this.alpha('stroke-opacity')}/>`,
    );
  }
  clip() {
    const id = `${this.idPrefix}-c${(this.clips += 1)}`;
    this.out.push(`<clipPath id="${id}"><path d="${this.data()}"/></clipPath><g clip-path="url(#${id})">`);
    this.groups += 1;
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.beginPath();
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
    this.fill();
  }
  /** The recorded drawing (inner markup, for an <svg> with the frame's viewBox). */
  markup() {
    let tail = '';
    for (let i = 0; i < this.groups; i += 1) tail += '</g>';
    for (const s of this.stack) for (let i = 0; i < s.groups; i += 1) tail += '</g>';
    return this.out.join('') + tail;
  }
}
