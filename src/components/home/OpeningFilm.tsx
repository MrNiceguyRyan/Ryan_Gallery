import { useEffect, useRef } from 'react';
import OpeningScenes from './OpeningScenes';
import {
  ANCHOR,
  BLUR_STEP_PER_SPEED,
  BURN,
  BURN_HOLE,
  BURN_RAMP,
  BURN_STOPS,
  BURN_STYLE,
  DARK_TYPED,
  DRIFT_SCALE,
  DRIFT_VEC,
  FF_RATE,
  FF_TAIL,
  FIRST_PAINT,
  FLY_ORDER,
  FONT_LOADS,
  FONT_SAMPLE,
  FONT_WAIT_MS,
  GRID_HAIR_MS,
  GLIDE_EASE,
  HAND,
  INPUT_POLICY,
  LANDING_A,
  LANDING_TARGETS,
  NAME_WORDS,
  OPENING_EVENT,
  PHONE_MAX_WIDTH,
  CUT_MS,
  PRELUDE,
  PRELUDE_MS,
  SCENES,
  STILL,
  TITLE,
  TITLE_NAME,
  TYPED,
  anchorCap,
  burnDarkness,
  burnFrame,
  burnFrameAt,
  burnFrameStart,
  burnRadius,
  burnSepia,
  clamp01,
  cursorSteps,
  faceText,
  fastForwardTarget,
  filmPlan,
  filmStart,
  pageStart,
  flightFor,
  flightPath,
  proofLimeKeys,
  frameAt,
  giantCap,
  globeReleaseAt,
  glyphFit,
  keyBox,
  landingAHome,
  landingRank,
  lerpBox,
  morphAt,
  readingZone,
  sampleCurve,
  seeded,
  type Box,
  type InkBox,
  type FilmInput,
  type FilmLayout,
  type FilmPlan,
  type FlyWord,
  type OpeningDetail,
  type OpeningPicture,
  type OpeningState,
  type StyleId,
  type Vec2,
} from '../../lib/openingFilm';
import { markReelSeen } from '../../lib/reelVisit';
import { PLATES, proofPlates, type ProofPlates } from '../../lib/proofPlates';
import { EASE } from '../../lib/motion';
import { shownMatch } from '../../i18n/lang';
import { viewport } from '../../lib/viewport';
import { T, useT } from '../../i18n/react';

const bezier = ([a, b, c, d]: readonly number[]) => `cubic-bezier(${a}, ${b}, ${c}, ${d})`;
const FADE_CSS = bezier(EASE.fade);
const ARRIVE_CSS = bezier(EASE.arrive);
const GLIDE_CSS = bezier(GLIDE_EASE);

// ── Measuring type ──
// One canvas, reused: a face's ink box (its left and right bearings from the
// pen, its ascent and descent) and its cap and x heights, in the element's
// own computed face and size.
let measureContext: CanvasRenderingContext2D | null = null;
interface Ink {
  left: number;
  right: number;
  ascent: number;
  descent: number;
  cap: number;
  xh: number;
  size: number;
}
function inkOf(el: Element, text: string): Ink {
  const style = getComputedStyle(el);
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  const ctx = measureContext;
  const size = parseFloat(style.fontSize) || 16;
  if (!ctx) return { left: 0, right: size * 0.6 * text.length, ascent: size * 0.7, descent: 0, cap: size * 0.7, xh: size * 0.5, size };
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const spacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing;
  } catch {
    // (An older engine without canvas letter-spacing measures without it.)
  }
  const shown = style.textTransform === 'uppercase' ? text.toUpperCase() : text;
  const m = ctx.measureText(shown);
  const cap = ctx.measureText('H').actualBoundingBoxAscent;
  const xh = ctx.measureText('x').actualBoundingBoxAscent;
  return { left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent, cap, xh, size };
}
/** An element's baseline below its own top (its probe, `.of-bl`). */
function baselineIn(el: HTMLElement) {
  const probe = el.querySelector<HTMLElement>(':scope > .of-bl') ?? el.querySelector<HTMLElement>('.of-bl');
  if (!probe) return el.offsetHeight * 0.8;
  let y = 0;
  let node: HTMLElement | null = probe;
  while (node && node !== el) {
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
    if (node && !el.contains(node) && node !== el) break;
  }
  return y;
}
/** Where an element's baseline is on screen, read without touching the
 *  layout (a probe appended to a word re-balanced its paragraph and moved
 *  the word): its text's line box top plus its face's ascent. */
function baselineOf(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = range.getClientRects();
  const r = rects.length ? rects[rects.length - 1] : el.getBoundingClientRect();
  const style = getComputedStyle(el);
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  if (!measureContext) return r.top + r.height * 0.8;
  measureContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const scale = r.height / Math.max(1, measureContext.measureText('Hg').fontBoundingBoxAscent + measureContext.measureText('Hg').fontBoundingBoxDescent);
  return r.top + measureContext.measureText('Hg').fontBoundingBoxAscent * scale;
}
function textBox(el: Element): Box | null {
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = range.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
const px = (v: number) => `${v.toFixed(2)}px`;
const tx = (x: number, y = 0) => `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
/** A 2D translate (the giant words: no layer of its own for a copy). */
const tr = (x: number, y = 0) => `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;

// ── A word as its letters (the morphs) ──
// Each letter of a `.of-gm__face` is a box of its own ([data-g], its index
// in the text), set on its pen; its transform's origin is the pen on the
// baseline. Measured once, in the face's own computed face and size (pens
// with the face's kerning and tracking; each letter's ink box).
interface Glyph {
  el: HTMLElement;
  /** Pen (x) and baseline (y) in the frame the two faces share. */
  pen: number;
  base: number;
  ink: InkBox;
}
const fontOf = (style: Pick<CSSStyleDeclaration, 'fontStyle' | 'fontWeight' | 'fontSize' | 'fontFamily'>) => `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
/** What setGlyphs reads off a face: its computed face (for the canvas) and
 *  its baseline below its own top (which its own place does not change).
 *  Read for many faces in one go (the landing's clones), so that no write
 *  falls between two reads and the layout is brought up to date once. */
interface FaceRead {
  font: string;
  size: number;
  ls: number;
  upper: boolean;
  lift: number;
}
function readFace(face: HTMLElement): FaceRead {
  const style = getComputedStyle(face);
  return {
    font: fontOf(style),
    size: parseFloat(style.fontSize) || 16,
    ls: style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing) || 0,
    upper: style.textTransform === 'uppercase',
    lift: baselineIn(face),
  };
}
/** Sets a face's letters on their pens, its pen origin at x0 and its
 *  baseline at yB (in its parent's frame), and returns them measured. The
 *  pens are the canvas's, or `pens` (each character's, from x0) where the
 *  page has laid the same text out itself. `read`: the face read already
 *  (readFace): nothing is read here then, only written. */
function setGlyphs(face: HTMLElement, text: string, x0: number, yB: number, pens?: readonly number[] | null, read?: FaceRead): Glyph[] {
  const { font, size, ls, upper, lift } = read ?? readFace(face);
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  const ctx = measureContext;
  const shown = upper ? text.toUpperCase() : text;
  face.style.left = px(x0);
  face.style.top = px(yB - lift);
  const els = Array.from(face.querySelectorAll<HTMLElement>(':scope > [data-g]'));
  if (ctx) {
    ctx.font = font;
    try {
      // Tracking is added by hand below (the same in every engine).
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    } catch {
      // (Without canvas letter-spacing it is never applied: the same.)
    }
  }
  return els.map((el) => {
    const i = Number(el.dataset.g);
    const ch = shown[i] ?? '';
    let pen = i * size * 0.6;
    let ink: InkBox = { l: pen, r: pen + size * 0.6, t: -size * 0.7, b: 0 };
    if (ctx) {
      pen = pens?.[i] ?? ctx.measureText(shown.slice(0, i + 1)).width - ctx.measureText(ch).width + i * ls;
      const m = ctx.measureText(ch);
      ink = { l: pen - m.actualBoundingBoxLeft, r: pen + m.actualBoundingBoxRight, t: -m.actualBoundingBoxAscent, b: m.actualBoundingBoxDescent };
    } else if (pens?.[i] != null) {
      pen = pens[i];
    }
    el.style.left = px(pen);
    el.style.transformOrigin = `0px ${lift.toFixed(2)}px`;
    return { el, pen: x0 + pen, base: yB, ink: { l: x0 + ink.l, r: x0 + ink.r, t: yB + ink.t, b: yB + ink.b } };
  });
}
/** Each character's pen in an element's own text, from its left edge, as
 *  the page lays it out (its face's own shaping and optical size: the
 *  canvas measures a variable face at its automatic optical size only).
 *  Read at layout time, never per frame; null if the text is not all there. */
function domPens(el: HTMLElement, text: string): number[] | null {
  const box = el.getBoundingClientRect();
  const k = el.offsetWidth > 0 ? box.width / el.offsetWidth : 1;
  if (!box.width || !(k > 0)) return null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const pens: number[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const t = node.textContent ?? '';
    for (let j = 0; j < t.length; j += 1) {
      range.setStart(node, j);
      range.setEnd(node, j + 1);
      pens.push((range.getBoundingClientRect().left - box.left) / k);
    }
  }
  return pens.length === text.length ? pens : null;
}
/** Letter g fitted into the box that letters a and b share at progress p. */
function glyphTransform(g: Glyph, a: Glyph, b: Glyph, p: number) {
  const f = glyphFit(g.ink, g.pen, g.base, lerpBox(a.ink, b.ink, p));
  return `translate(${f.tx.toFixed(2)}px, ${f.ty.toFixed(2)}px) scale(${f.sx.toFixed(4)}, ${f.sy.toFixed(4)})`;
}
/** Shares of a move sampled across a morph window (its ends included). */
const morphSamples = (win: readonly [number, number], n = 10) => Array.from({ length: n + 1 }, (_, k) => win[0] + ((win[1] - win[0]) * k) / n);
/** Two faces' letters paired in order (a morph needs as many on each side). */
const pairGlyphs = (a: Glyph[], b: Glyph[]) => (a.length === b.length && a.length > 0 ? a.map((g, i) => [g, b[i]] as const) : null);

// ── The grain: a tile moved every 60th of a second, a 12-step loop ──
const GRAIN_STEPS: Vec2[] = [
  [0, 0],
  [-37, 21],
  [52, -44],
  [-18, -71],
  [66, 38],
  [-61, 9],
  [23, 57],
  [-49, -27],
  [71, -6],
  [-8, 44],
  [34, -63],
  [-72, 30],
];
const GRAIN_LOOP_MS = 200;
/** A scene may be drawn this long before its turn (and is hidden again once
 *  past it): it is painted well before its cut (a main-thread step, so it
 *  is let in early enough to ride out a busy main thread), and the film
 *  never holds every scene in memory at once. The match cuts' pages are let
 *  in earlier still (CUTS_DRAWN, four cuts ahead): they play over the
 *  page's own busiest second — its hydration and the map's start-up, up to
 *  180 ms a task on a phone at a quarter of the CPU — and a page whose
 *  turn to be let in fell in a stall came late, over bare paper (measured
 *  with the main thread held for half a second across three cuts: twelve
 *  frames of blank paper between two dark pages with the quarter second
 *  this was; two with 400 ms; none with 700 ms, the compositor taking
 *  every cut alone). The cost is the compositor's tiles for the pages let
 *  in (measured on a 3× phone through the cuts: 204 MB on average, 258 MB
 *  at most, against 171 and 209 before; every page drawn from the clock
 *  was 231 and 349). */
const PREROLL_MS = 400;
const CUTS_DRAWN = 700;
/** How long ahead of its cut a page is drawn at WARM_OPACITY (after it is
 *  let in by PREROLL_MS): a fifth of a bone-to-ink step, unseen. */
const WARM_MS = 150;
const WARM_OPACITY = 0.002;
/** The clock starts at least this long after its keyframes are laid (the
 *  compositor takes them a frame or two later). The clock is laid only once
 *  they are: on a slow phone laying them took longer than the lead, and
 *  the first sixth was spent before its page was there. */
const CLOCK_LEAD_MS = 50;
/** The grid paper's arrow is drawn a stage every two 60ths. */
const ARROW_STEP_MS = 1000 / 30;

/** The keys that scroll a page (with or without a modifier). */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', ' ', 'Spacebar']);

// ── The burn's shader ──
// One canvas over the frame, drawn only when the film's 24 fps frame number
// changes: the flicker veil, the scratches and dust, the burn (an fbm mask
// spreading from beside the anchor, coloured from its front inward by
// BURN_RAMP, its brightest bone) and the frame's darkening. Premultiplied
// alpha over the page; the sepia is a colour-blend layer under it.
const glColor = (hex: string) => {
  const v = hex.replace('#', '');
  return `vec3(${[0, 2, 4].map((i) => (parseInt(v.slice(i, i + 2), 16) / 255).toFixed(4)).join(', ')})`;
};
const BURN_FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_px;
uniform vec2 u_origin;
uniform float u_frame;
uniform float u_radius;
uniform float u_flick;
uniform float u_dark;
uniform float u_dust;
uniform vec4 u_scratch;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
vec4 over(vec4 dst, vec3 c, float a) { return vec4(c * a, a) + dst * (1.0 - a); }
vec3 ramp(float e) {
  vec3 c0 = ${glColor(BURN_RAMP[0])}; vec3 c1 = ${glColor(BURN_RAMP[1])}; vec3 c2 = ${glColor(BURN_RAMP[2])};
  vec3 c3 = ${glColor(BURN_RAMP[3])}; vec3 c4 = ${glColor(BURN_RAMP[4])}; vec3 c5 = ${glColor(BURN_HOLE)};
  if (e < ${BURN_STOPS[1].toFixed(1)}) return mix(c0, c1, e / ${BURN_STOPS[1].toFixed(1)});
  if (e < ${BURN_STOPS[2].toFixed(1)}) return mix(c1, c2, (e - ${BURN_STOPS[1].toFixed(1)}) / ${(BURN_STOPS[2] - BURN_STOPS[1]).toFixed(1)});
  if (e < ${BURN_STOPS[3].toFixed(1)}) return mix(c2, c3, (e - ${BURN_STOPS[2].toFixed(1)}) / ${(BURN_STOPS[3] - BURN_STOPS[2]).toFixed(1)});
  if (e < ${BURN_STOPS[4].toFixed(1)}) return mix(c3, c4, (e - ${BURN_STOPS[3].toFixed(1)}) / ${(BURN_STOPS[4] - BURN_STOPS[3]).toFixed(1)});
  return mix(c4, c5, clamp((e - ${BURN_STOPS[4].toFixed(1)}) / 60.0, 0.0, 1.0));
}
void main() {
  vec2 res = u_res / u_px;
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_px;
  vec4 col = vec4(0.0);
  if (u_flick > 0.0) col = over(col, ${glColor('#F4F4ED')}, u_flick);
  else col = over(col, ${glColor('#171B15')}, -u_flick);
  for (int k = 0; k < 2; k++) {
    float sx = k == 0 ? u_scratch.x : u_scratch.y;
    float st = k == 0 ? u_scratch.z : u_scratch.w;
    if (sx >= 0.0) {
      float x = sx * res.x + (noise(vec2(p.y * 0.013, u_frame * 3.1 + float(k))) - 0.5) * 7.0;
      float a = smoothstep(1.3, 0.1, abs(p.x - x)) * st * (0.55 + 0.45 * noise(vec2(p.y * 0.05, float(k) * 9.0)));
      col = over(col, k == 0 ? ${glColor('#F4F4ED')} : ${glColor('#171B15')}, a);
    }
  }
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    vec2 c = vec2(hash(vec2(u_frame + 1.3, fi * 1.7)), hash(vec2(fi * 2.9, u_frame + 7.1))) * res;
    float r = 0.9 + 2.8 * hash(vec2(u_frame * 1.9, fi * 3.3));
    float d = length(p - c) + (noise((p - c) * 0.5 + fi) - 0.5) * 1.6;
    col = over(col, ${glColor('#171B15')}, smoothstep(r, r - 0.9, d) * 0.5 * u_dust);
  }
  if (u_radius > 0.0) {
    float d = length(p - u_origin);
    float n1 = fbm(p / 120.0 + 3.1) - 0.5;
    float n2 = fbm(p / 24.0 + 11.7) - 0.5;
    float e = u_radius - d + n1 * (u_radius * 0.75 + 36.0) + n2 * 16.0;
    if (e < 0.0) {
      float h = clamp(1.0 + e / 80.0, 0.0, 1.0);
      col = over(col, ${glColor(BURN_RAMP[4])}, h * h * 0.42);
    } else {
      col = over(col, ramp(e), 1.0);
    }
  }
  col = over(col, ${glColor('#120D09')}, u_dark);
  gl_FragColor = col;
}`;
const BURN_VERT = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';

interface BurnGL {
  resize: (w: number, h: number) => void;
  draw: (u: { frame: number; origin: Vec2; radius: number; flick: number; dark: number; dust: number; scratch: [number, number, number, number] } | null) => void;
  dispose: () => void;
}
function makeBurn(canvas: HTMLCanvasElement): BurnGL | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  // A phone under memory pressure (iOS Safari above all) may lose the
  // context at any time, or refuse to make its objects: the burn is then
  // simply not drawn — never an error, never a stalled film (the frames
  // under it are the film's own; the canvas is only its light).
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
  });
  try {
    return burnGL(canvas, gl, () => lost || gl!.isContextLost());
  } catch {
    return null;
  }
}
function burnGL(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, isLost: () => boolean): BurnGL | null {
  const compile = (type: number, src: string) => {
    const s = gl!.createShader(type)!;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      console.warn('[opening] burn shader:', gl!.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, BURN_VERT);
  const fs = compile(gl.FRAGMENT_SHADER, BURN_FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (name: string) => gl!.getUniformLocation(prog, name);
  const u = { res: U('u_res'), px: U('u_px'), origin: U('u_origin'), frame: U('u_frame'), radius: U('u_radius'), flick: U('u_flick'), dark: U('u_dark'), dust: U('u_dust'), scratch: U('u_scratch') };
  let ratio = 1;
  return {
    resize(w, h) {
      if (isLost()) return;
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      gl!.viewport(0, 0, canvas.width, canvas.height);
    },
    draw(v) {
      if (isLost()) return;
      const g = gl!;
      g.clearColor(0, 0, 0, 0);
      g.clear(g.COLOR_BUFFER_BIT);
      if (!v) return;
      g.uniform2f(u.res, canvas.width, canvas.height);
      g.uniform1f(u.px, ratio);
      g.uniform2f(u.origin, v.origin[0], v.origin[1]);
      g.uniform1f(u.frame, v.frame);
      g.uniform1f(u.radius, v.radius);
      g.uniform1f(u.flick, v.flick);
      g.uniform1f(u.dark, v.dark);
      g.uniform1f(u.dust, v.dust);
      g.uniform4f(u.scratch, ...v.scratch);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl!.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
/** Burn frame f's scratches: one or two, light and dark, seeded — in the
 *  flicker's frames (f0–2) only. */
function scratchOf(f: number): [number, number, number, number] {
  if (f >= BURN.flicker[1]) return [-1, -1, 0, 0];
  const rand = seeded(4200 + f * 17);
  const a = 0.12 + rand() * 0.76;
  const b = rand() < 0.55 ? 0.1 + rand() * 0.8 : -1;
  return [a, b, 0.45 + rand() * 0.35, 0.35 + rand() * 0.3];
}

/**
 * OpeningFilm — the homepage's opening: a retro editorial type film
 * (src/lib/openingFilm.ts has the plan and the reasons).
 *
 * A fixed layer over the first screen from the first paint (the server's
 * markup is its first frame: the proof, with the first page drawn under it
 * — its page, and the lime anchor and its word, which are the stylesheet's
 * for good, unprinted; the stylesheet brings the lights down, and the head
 * script, src/lib/proofPlates.ts, prints the plates on the proof's sixth
 * before this island is up). The island takes the proof over (the head
 * script's record, or its own when there was none — the plates' own
 * animations kept, never a second on their elements), loads every face the
 * film sets (at most FONT_WAIT_MS), measures the words, and lays the clock
 * on the proof's own grid: the page on the first sixth it can make once its
 * keyframes are laid, never sooner than a sixth after the word (pageStart).
 * The whole film is WAAPI
 * on transform and opacity from that one start (the compositor plays it, so
 * the page's hydration and the map's start-up behind it cannot stutter it),
 * plus the burn's canvas, drawn on the same clock a 24th of a second at a
 * time. The page's scroll is held (body overflow: clip, set by a stylesheet
 * rule on html[data-film-lock]) and the page under the film is inert; only
 * the Skip pill skips — to the end title and a hurried landing. Tab stays on
 * the pill.
 *
 * It plays once a tab session (src/lib/reelVisit.ts decides before the first
 * paint: html[data-opening] present means it plays). `?filmT=<ms>` (a
 * verification hook, never linked) holds the film still at that time (from
 * −PRELUDE_MS = −500, the proof's first frame) and exposes window.__filmSeek.
 */
export default function OpeningFilm({ pictures = [] }: { pictures?: readonly OpeningPicture[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const say = useT();

  useEffect(() => {
    const overlayEl = rootRef.current;
    const skipEl = skipRef.current;
    const html = document.documentElement;
    // The head script's record of the proof's plates (src/lib/proofPlates.ts),
    // taken over once (a later arrival in this tab starts its own), and the
    // Skip pill's taps are this island's from now on.
    const headPlates = window.__proofPlates ?? null;
    window.__proofPlates = undefined;
    headPlates?.off();
    if (!overlayEl || !skipEl) return;
    const overlay: HTMLDivElement = overlayEl;
    const skip: HTMLButtonElement = skipEl;
    if (!html.hasAttribute('data-opening') || html.dataset.reel === 'skip') return;

    const body = document.body;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const seekParam = (() => {
      try {
        const v = new URLSearchParams(window.location.search).get('filmT');
        return v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
      } catch {
        return null;
      }
    })();
    const q = <T extends Element = HTMLElement>(sel: string, root: ParentNode = overlay) => root.querySelector<T & Element>(sel) as T | null;
    const qa = <T extends Element = HTMLElement>(sel: string, root: ParentNode = overlay) => Array.from(root.querySelectorAll(sel)) as T[];

    let disposed = false;
    let state: OpeningState = 'film';
    let globe = false;
    let phase: 'wait' | 'film' | 'landing' | 'done' = 'wait';
    let hurried = false;
    const timers = new Set<number>();
    const cleanups: (() => void)[] = [];
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!disposed) fn();
      }, Math.max(0, ms));
      timers.add(id);
      return id;
    };
    const clearTimers = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
    const publish = () => {
      const detail: OpeningDetail = { state, globe };
      window.__archiveOpening = detail;
      window.dispatchEvent(new CustomEvent<OpeningDetail>(OPENING_EVENT, { detail }));
    };
    const releaseGlobe = () => {
      if (globe) return;
      globe = true;
      publish();
    };
    // (The film tells the page the globe may come up with the landing — one
    // word, not a second one under the cuts: GLOBE_LEAD_MS.)

    // ── The page is held while the film plays ──
    let locked = false;
    const inerted: Element[] = [];
    const lock = () => {
      if (locked) return;
      locked = true;
      html.setAttribute('data-film-lock', '');
      let mine: Element | null = overlay;
      while (mine && mine.parentElement !== body) mine = mine.parentElement;
      Array.from(body.children).forEach((el) => {
        if (el === mine || el.hasAttribute('inert') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
        el.setAttribute('inert', '');
        inerted.push(el);
      });
    };
    const unlock = () => {
      if (!locked) return;
      locked = false;
      html.removeAttribute('data-film-lock');
      inerted.splice(0).forEach((el) => el.removeAttribute('inert'));
    };

    // A reload deep in the page (a position restored below the first
    // screen) is not an arrival: no film, the reader keeps his place.
    if (window.scrollY > window.innerHeight * 0.5) {
      html.dataset.reel = 'page';
      html.removeAttribute('data-opening');
      state = 'page';
      globe = true;
      publish();
      return;
    }
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    html.setAttribute('data-opening', 'run');
    lock();
    publish();

    let seen = false;
    const markSeen = () => {
      if (seen) return;
      seen = true;
      markReelSeen();
    };

    const flightLayer = q('[data-flight]')!;
    let filmAnims: Animation[] = [];
    let landAnims: Animation[] = [];
    let burn: BurnGL | null = null;
    let burnRaf = 0;
    // The cover's words watched for a change of size under the film (the
    // landing's, below); declared here, where finish() can let it go on
    // every path (reduced motion's too).
    let coverWatch: ResizeObserver | null = null;
    const unwatchCover = () => {
      coverWatch?.disconnect();
      coverWatch = null;
    };

    const finish = () => {
      if (phase === 'done') return;
      phase = 'done';
      clearTimers();
      detachInput();
      unlock();
      markSeen();
      html.removeAttribute('data-opening');
      html.removeAttribute('data-open-fly');
      html.removeAttribute('data-skip-pending');
      skip.classList.remove('is-gone');
      state = 'page';
      globe = true;
      publish();
      if (burnRaf) cancelAnimationFrame(burnRaf);
      burnRaf = 0;
      overlay.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      unwatchCover();
      flightLayer.replaceChildren();
      q('[data-title] [data-gm-unit]')?.style.removeProperty('visibility');
      burn?.dispose();
      burn = null;
    };

    // ── Input: only the Skip pill skips ──
    let onSkipFilm: () => void = () => {};
    const input = (source: FilmInput) => {
      if (INPUT_POLICY[source] === 'skip') onSkipFilm();
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      input('wheel');
    };
    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      input('touch');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Tab and Shift+Tab land on the pill and stay there.
      if (event.key === 'Tab') {
        event.preventDefault();
        if ((phase === 'film' || phase === 'wait') && document.activeElement !== skip) skip.focus({ preventScroll: true });
        return;
      }
      // The pill's own keys press it (at once, on the key going down).
      if (event.target === skip && !event.metaKey && !event.ctrlKey && !event.altKey && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')) {
        event.preventDefault();
        input('skip');
        return;
      }
      // A scrolling key does nothing, whatever modifier is held with it
      // (Cmd+Down is the Mac's own "to the end of the page").
      if (SCROLL_KEYS.has(event.key)) {
        event.preventDefault();
        input('key');
        return;
      }
      // The browser's own shortcuts (Cmd+R, Cmd+L, the F-keys) are left alone.
      if (event.metaKey || event.ctrlKey || event.altKey || /^F\d{1,2}$/.test(event.key)) return;
      event.preventDefault();
      input('key');
    };
    const onSkip = (event: MouseEvent) => {
      event.preventDefault();
      input('skip');
    };
    let inputAttached = false;
    const attachInput = () => {
      if (inputAttached) return;
      inputAttached = true;
      window.addEventListener('wheel', onWheel, { capture: true, passive: false });
      window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
      window.addEventListener('keydown', onKeyDown, { capture: true });
      skip.addEventListener('click', onSkip);
    };
    const detachInput = () => {
      if (!inputAttached) return;
      inputAttached = false;
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('touchmove', onTouchMove, { capture: true });
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      skip.removeEventListener('click', onSkip);
    };
    attachInput();

    // ── Reduced motion: the end title still, then a calm crossfade ──
    if (reduce) {
      let fading = false;
      const fade = () => {
        if (fading) return;
        fading = true;
        markSeen();
        releaseGlobe();
        html.dataset.reel = 'page';
        state = 'landing';
        publish();
        skip.classList.add('is-gone');
        overlay.style.opacity = '0';
        later(finish, STILL.fade + 40);
      };
      onSkipFilm = fade;
      phase = 'film';
      // A tap on the pill before the island was up (the head script's):
      // the crossfade at once.
      later(fade, html.hasAttribute('data-skip-pending') ? 0 : STILL.hold);
      return () => {
        disposed = true;
        clearTimers();
        detachInput();
        unlock();
        overlay.style.opacity = '';
        if (html.hasAttribute('data-opening')) html.removeAttribute('data-opening');
      };
    }

    // ── The film ──
    const timeline = document.timeline;
    const nowMs = () => Number(timeline.currentTime ?? performance.now());
    /** The proof's stylesheet animations (its lights, from the first paint;
     *  filled both ways, so it is here at any moment until the film is let
     *  go — on the vignette's ::before, which a subtree query finds). */
    const proofAnims = () =>
      (overlay.getAnimations?.({ subtree: true }) ?? []).filter(
        (a) => typeof (a as CSSAnimation).animationName === 'string' && (a as CSSAnimation).animationName.startsWith('of-proof'),
      );
    const layoutOf = (): FilmLayout => (overlay.clientWidth <= PHONE_MAX_WIDTH ? 'phone' : 'desktop');
    let plan: FilmPlan = filmPlan(layoutOf());
    let t0 = nowMs();
    const filmTime = () => nowMs() - t0;
    // Skip pressed before the clock (the fonts or the plates still coming,
    // or the island not yet up: the head script's tap): start at the tail,
    // at once.
    let pendingSkip = html.hasAttribute('data-skip-pending');
    let skipNow: () => void = () => {};
    const skipped = new Promise<void>((resolve) => {
      skipNow = resolve;
    });
    if (pendingSkip) skipNow();
    // The proof's plates: the head script's (printed from the first paint),
    // or, where there was none (an in-site arrival), started here; none for
    // the verification hook (it lays them on its own clock).
    const plates: ProofPlates | null = seekParam != null ? null : (headPlates ?? proofPlates(PLATES, false));
    if (pendingSkip) plates?.hold();
    /** Printed by the plates' own animation (laid before the clock, on the
     *  proof's grid). That animation stays the element's only one: a second
     *  on the same opacity takes both off the compositor, and under load the
     *  plates would print on the main thread's time, late and off the cuts'
     *  grid. */
    const platePrinted = (el: Element | null) => !!el && !!plates?.anims.some((a) => (a.effect as KeyframeEffect | null)?.target === el);
    /** The lime plate's beat on the film's clock (the word's is two sixths
     *  later): the plan's on a fast load; earlier on a slow one, where the
     *  plates were printed before the island was up. */
    let limeAt: number = plan.prelude.lime;
    const wordAt = () => limeAt + (PRELUDE.beats.lime - PRELUDE.beats.word) * CUT_MS;

    // ── Layout: every word measured and placed, once, before the clock ──
    /** A relay machine's line: its size, where each typed count ends (px
     *  from the line's left, the n-th character's advance), its width. */
    interface MatGeo {
      el: HTMLElement;
      size: number;
      width: number;
      xs: number[];
    }
    interface Geometry {
      W: number;
      H: number;
      /** The anchor. */
      cap: number;
      cx: number;
      cy: number;
      blocks: Box[];
      /** The relay's machines, and the first one's cursor (where the lime
       *  block lands). */
      mats: Map<StyleId, MatGeo>;
      landing: Box;
      /** Acts 5–6: the typed line and the title, letter by letter. */
      title: { k5: number; adv: number; pen: number; revealW: number; origin: Vec2; from: Glyph[]; to: Glyph[] };
      burnOrigin: Vec2;
    }
    let geo: Geometry | null = null;

    /** Sets an element's face to `cap` px capitals: its size from its own
     *  capitals' ink, measured twice (a face with optical sizes draws its
     *  capitals a little differently at another size). */
    const fitCap = (el: HTMLElement, sizeEl: HTMLElement, cap: number) => {
      sizeEl.style.fontSize = '100px';
      let size = cap / Math.max(0.01, inkOf(el, 'H').cap / 100);
      sizeEl.style.fontSize = px(size);
      size = cap / Math.max(0.01, inkOf(el, 'H').cap / size);
      sizeEl.style.fontSize = px(size);
      return size;
    };

    const layout = (): Geometry => {
      const W = overlay.clientWidth;
      const H = overlay.clientHeight;
      const short = Math.min(W, H);
      const phoneLayout = plan.layout === 'phone';

      // The anchor: one cap height for every cut, the widest word (THOUGHT)
      // fitting across. It is the first paint's, always (derive, don't
      // sample): the cap from the stylesheet's own numbers (FIRST_PAINT, its
      // --c0: the widest word's measure in the faces). The first key — its
      // block and its word — is the stylesheet's for good, laid in vw and vh
      // on the same numbers from the first paint (its optical size pinned,
      // so its ink per cap holds at every width): never laid here, so the
      // plates the head script prints before the island is up never move
      // when it takes over, when a face lands, or when the frame is resized
      // or turned. Its block here is the same derivation, for the page's own
      // geometry.
      const keys = qa<HTMLElement>('[data-key]');
      const firstPaint = FIRST_PAINT[plan.layout];
      const cap = anchorCap(W, H, firstPaint.across - 2 * ANCHOR.pad, plan.layout);
      const blocks: Box[] = [];
      let anchorBase = 0;
      keys.forEach((key, i) => {
        if (i === 0) {
          const kb = keyBox(W, H, cap, (firstPaint.key0 - 2 * ANCHOR.pad) * cap);
          anchorBase = kb.baseline;
          blocks.push(kb.block);
          return;
        }
        const word = q('[data-word]', key)!;
        fitCap(word, word, cap);
        const ink = inkOf(word, faceText(SCENES[i].word, SCENES[i].face));
        const kb = keyBox(W, H, cap, ink.left + ink.right);
        const box = kb.block;
        anchorBase = kb.baseline;
        const block = q('[data-block]', key)!;
        block.style.left = px(box.x);
        block.style.top = px(box.y);
        block.style.width = px(box.w);
        block.style.height = px(box.h);
        word.style.left = px(kb.inkX + ink.left);
        word.style.top = '0px';
        word.style.top = px(kb.baseline - baselineIn(word));
        blocks.push(box);
        // The page round it knows where the block is (the first page: the
        // stylesheet tells it, on the same numbers).
        const cut = q(`[data-cut="${i}"]`);
        if (cut) {
          cut.style.setProperty('--bl', px(box.x));
          cut.style.setProperty('--br', px(box.x + box.w));
          cut.style.setProperty('--bt', px(box.y));
          cut.style.setProperty('--bb', px(box.y + box.h));
          cut.style.setProperty('--cap', px(cap));
        }
      });
      const cx = ANCHOR.x * W;
      const cy = ANCHOR.y * H;

      // A word beside the anchor that would run off the frame (a narrow
      // desktop: the block is wide, the margin short) is set a little
      // smaller — at most by a quarter — and, past that, wraps inside the
      // frame. Never clipped.
      const EDGE = 16;
      qa<HTMLElement>('[data-cut] .of-row, [data-cut] .of-side').forEach((el) => {
        el.style.fontSize = '';
        el.style.whiteSpace = '';
        el.style.maxWidth = '';
        el.style.removeProperty('text-wrap');
        // (A line that wraps already keeps inside its measure.) Unclamped,
        // the box is the line's own width.
        if (getComputedStyle(el).whiteSpace !== 'nowrap') return;
        el.style.maxWidth = 'none';
        const w = el.offsetWidth;
        if (!w) return;
        const over = Math.max(0, el.offsetLeft + w - (W - EDGE), EDGE - el.offsetLeft);
        if (!over) return;
        const size = parseFloat(getComputedStyle(el).fontSize) || 16;
        el.style.fontSize = px(size * Math.max(0.74, (w - over) / w));
        const l = el.offsetLeft;
        const r = l + el.offsetWidth;
        if (r > W - EDGE || l < EDGE) {
          el.style.whiteSpace = 'normal';
          el.style.setProperty('text-wrap', 'balance');
          el.style.maxWidth = px(r > W - EDGE ? W - EDGE - l : r - EDGE);
        }
      });

      // The words on the anchor's line sit on its baseline (where the sheet
      // says so: on the phone they go over and under it instead).
      qa<HTMLElement>('[data-cut] [data-base]').forEach((el) => {
        el.style.top = '';
        if (getComputedStyle(el).getPropertyValue('--base-align').trim() !== '1') return;
        el.style.top = px(anchorBase - baselineIn(el));
      });

      // Print that must start under something on its sheet (the senses
      // under a wrapped etymology, a ticket's fine print under its route):
      // pushed down to clear it where a small frame would set one over the
      // other ([data-clear]: what to clear, in its cut).
      qa<HTMLElement>('[data-cut] [data-clear]').forEach((el) => {
        el.style.top = '';
        el.style.bottom = '';
        const cutEl = el.closest<HTMLElement>('[data-cut]');
        if (!cutEl || !el.offsetWidth) return;
        const l = el.offsetLeft;
        const r = l + el.offsetWidth;
        const refs = qa<HTMLElement>(el.dataset.clear!, cutEl).filter((ref) => ref !== el && ref.offsetWidth > 0 && ref.offsetLeft < r && l < ref.offsetLeft + ref.offsetWidth);
        if (!refs.length) return;
        const need = Math.max(...refs.map((ref) => ref.offsetTop + ref.offsetHeight)) + 0.6 * (parseFloat(getComputedStyle(el).fontSize) || 12);
        if (el.offsetTop >= need) return;
        el.style.top = px(need);
        el.style.bottom = 'auto';
      });

      // The pages' giant words, set on the short side (their capitals
      // measured twice) and placed on their baselines.
      qa<HTMLElement>('[data-cut]').forEach((cutEl) => {
        const c = SCENES[Number(cutEl.dataset.cut)];
        qa<HTMLElement>('[data-giant]', cutEl).forEach((g, k) => {
          const spec = c.giants[k];
          const word = q('[data-giant-word]', g)!;
          const capShare = giantCap(spec, plan.layout);
          fitCap(word, g, capShare * short);
          const w = word.offsetWidth;
          const left = spec.align === 'l' ? spec.x * W : spec.align === 'r' ? spec.x * W - w : spec.x * W - w / 2;
          g.style.left = px(left);
          g.style.top = '0px';
          g.style.top = px(spec.y * H + (spec.yCap ?? 0) * capShare * short - baselineIn(word));
        });
      });
      placeSmallPrint(W, H, short, phoneLayout, blocks, cap);

      // The relay: every machine's line in its own face, its capitals as
      // tall as the typewriter's monospace, its baseline on the
      // typewriter's, its left edge the same; where each typed count ends
      // on it.
      const mats = new Map<StyleId, MatGeo>();
      const matEls = qa<HTMLElement>('[data-mat]');
      matEls.forEach((mat) => {
        const line = q('[data-line]', mat)!;
        line.style.fontSize = '';
        line.style.top = '';
      });
      const refLine = q(`[data-mat="${BURN_STYLE}"] [data-line]`)!;
      const refTyped = q('[data-typed]', refLine)!;
      const refCap = inkOf(refTyped, 'H').cap;
      const refBase = refLine.offsetTop + baselineIn(refLine);
      if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
      matEls.forEach((mat) => {
        const id = mat.dataset.mat as StyleId;
        const line = q('[data-line]', mat)!;
        const typed = q('[data-typed]', line)!;
        const size = mat === refLine.closest('[data-mat]') ? parseFloat(getComputedStyle(line).fontSize) || 16 : fitCap(typed, line, refCap);
        line.style.top = '0px';
        line.style.top = px(refBase - baselineIn(line));
        const style = getComputedStyle(typed);
        const shown = style.textTransform === 'uppercase' ? TYPED.toUpperCase() : TYPED;
        const ls = style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing) || 0;
        const width = typed.offsetWidth;
        let xs = Array.from({ length: TYPED.length + 1 }, (_, n) => (n * width) / TYPED.length);
        const ctx = measureContext;
        if (ctx) {
          ctx.font = fontOf(style);
          try {
            (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
          } catch {
            // (Tracking is added by hand below.)
          }
          xs = xs.map((_, n) => ctx.measureText(shown.slice(0, n)).width + n * ls);
          // The page's own layout is the truth: the canvas's pens scaled to
          // the typed line's own width.
          const k = width / Math.max(1, xs[TYPED.length]);
          if (Math.abs(k - 1) < 0.08) xs = xs.map((x) => x * k);
        }
        mats.set(id, { el: mat, size, width, xs });
      });
      // Where the lime block lands: the first machine's cursor, before a
      // letter is typed (its ink box, on the frame).
      const first = plan.styles[0].id;
      const firstMat = mats.get(first)!;
      const firstLine = q('[data-line]', firstMat.el)!;
      const cursor = q('[data-cursor]', firstLine)!;
      const cursorInk = q('[data-cursor-ink]', cursor)!;
      const landing: Box = {
        x: firstLine.offsetLeft + cursor.offsetLeft + cursorInk.offsetLeft,
        y: firstLine.offsetTop + cursor.offsetTop + cursorInk.offsetTop,
        w: cursorInk.offsetWidth,
        h: cursorInk.offsetHeight,
      };
      const lastBlock = blocks[plan.cuts[plan.cuts.length - 1].index];
      const hand = q('[data-handoff]')!;
      hand.style.left = px(lastBlock.x);
      hand.style.top = px(lastBlock.y);
      hand.style.width = px(lastBlock.w);
      hand.style.height = px(lastBlock.h);

      // Acts 5–6: the title (in flow, his name as the cover sets it:
      // Fraunces 400, "Ryan Xu"), its letters, and the typed line — the
      // typewriter's capitals as tall as the title's, centred on it, on its
      // baseline; the typed line in the same cells (struck in the title's
      // case on the title's beat).
      const titleUnit = q('[data-title]')!;
      const name = q('[data-title-to]')!;
      const mono = q('[data-title-from]')!;
      const reveal = mono.closest<HTMLElement>('[data-reveal]')!;
      const tFrom = q('[data-gm="from"]', titleUnit)!;
      const tTo = q('[data-gm="to"]', titleUnit)!;
      const caps = TITLE_NAME;
      // The name at the cover's own optical size (Fraunces draws a smaller
      // size wider and softer: at 1728 its "Ryan Xu" at 104 px is 4% wider,
      // scaled, than the title's own at 142 px). The clone that flies home is
      // the cover's word scaled up, so on the frame it takes the title's
      // place the two are one drawing; the title's letters sit on the page's
      // own pens for that size.
      // (The cover is printed in both languages: the shown copy.)
      const coverName = shownMatch(document, LANDING_TARGETS.ryan.to);
      const coverSize = coverName ? parseFloat(getComputedStyle(coverName).fontSize) : NaN;
      const opsz = coverSize > 0 ? `"opsz" ${Math.min(144, Math.max(9, coverSize)).toFixed(2)}` : '';
      name.style.fontVariationSettings = opsz;
      tTo.style.fontVariationSettings = opsz;
      const nameInk = inkOf(name, TITLE_NAME);
      const nameBase = name.offsetTop + baselineIn(name);
      const nameLeft = name.offsetLeft;
      const inkCx = nameLeft + (nameInk.right - nameInk.left) / 2;
      const capF = nameInk.cap;
      const origin: Vec2 = [inkCx, nameBase - capF / 2];
      titleUnit.style.transformOrigin = `${origin[0].toFixed(2)}px ${origin[1].toFixed(2)}px`;
      tFrom.style.fontSize = '100px';
      const Fm5 = capF / Math.max(0.05, inkOf(tFrom, 'H').cap / 100);
      tFrom.style.fontSize = px(Fm5);
      mono.style.fontSize = px(Fm5);
      const capsInk = inkOf(tFrom, caps);
      const pen = inkCx - (capsInk.left + capsInk.right) / 2 + capsInk.left;
      const titleFrom = setGlyphs(tFrom, caps, pen, nameBase);
      const titleTo = setGlyphs(tTo, caps, nameLeft, nameBase, domPens(name, caps));
      const adv5 = mono.offsetWidth / DARK_TYPED.length;
      const padR = 12;
      reveal.style.left = px(pen - padR);
      reveal.style.top = '0px';
      reveal.style.top = px(nameBase - baselineIn(mono) - padR);
      const titleCursor = q('[data-title-cursor]')!;
      const capM = capsInk.cap;
      titleCursor.style.left = px(pen);
      titleCursor.style.top = px(nameBase - capM - Fm5 * 0.1);
      titleCursor.style.width = px(adv5 * 0.86);
      titleCursor.style.height = px(capM + Fm5 * 0.2);
      // The typed line's size on screen (the title grows from it).
      const typedPx = phoneLayout ? Math.max(22, Math.min(32, W * 0.075)) : Math.max(28, Math.min(64, W * 0.034));
      const k5 = typedPx / Fm5;

      // The burn starts beside the typewriter's line (up and to the right
      // of its middle).
      const paper = mats.get(BURN_STYLE)!;
      const paperLine = q('[data-line]', paper.el)!;
      const burnOrigin: Vec2 = [paperLine.offsetLeft + paper.width * 0.64, paperLine.offsetTop + baselineIn(paperLine) - refCap * 1.6];

      return {
        W,
        H,
        cap,
        cx,
        cy,
        blocks,
        mats,
        landing,
        title: { k5, adv: adv5, pen, revealW: mono.offsetWidth + 2 * padR, origin, from: titleFrom, to: titleTo },
        burnOrigin,
      };
    };

    // The pages' small print and layers — a taped print, a clipping, a
    // receipt, a stamp, a barcode, a pull quote, a note, a circled number,
    // the ringed word, the grey texture — kept clear of the anchor's reading
    // zone, the words on its line, the frame's print, the running head and
    // the Skip pill; the words (not the paper laid under the giant words)
    // clear of the giant words as far as they drift, too: each at its place
    // in the data when that is clear, else at the nearest clear place, else
    // not at all. (Measured once, before the clock, like everything else.)
    type Rect = { x: number; y: number; w: number; h: number };
    const grow = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
    const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const offsetBox = (el: HTMLElement): Rect => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    const SEARCH: Vec2[] = (() => {
      const out: Vec2[] = [];
      for (let dx = -312; dx <= 312; dx += 24) for (let dy = -240; dy <= 240; dy += 12) out.push([dx, dy]);
      return out.sort((a, b) => Math.hypot(a[0], a[1] * 1.4) - Math.hypot(b[0], b[1] * 1.4));
    })();
    function placeSmallPrint(W: number, H: number, short: number, phoneLayout: boolean, blocks: Box[], cap: number) {
      const s = skip.getBoundingClientRect();
      const skipBox = grow({ x: s.left, y: s.top, w: s.width, h: s.height }, 14);
      qa<HTMLElement>('[data-cut]').forEach((cutEl) => {
        const index = Number(cutEl.dataset.cut);
        const c = SCENES[index];
        if (!c.deco) return;
        const block = blocks[index];
        const zone = readingZone(block, cap);
        const keep: Rect[] = [zone, skipBox];
        qa<HTMLElement>('.of-row, .of-side', cutEl).forEach((el) => el.offsetWidth && keep.push(grow(offsetBox(el), 16)));
        const soft: Rect[] = [];
        qa<Element>('.of-run, .of-tabs, .of-reg, .of-steps', cutEl).forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width) return;
          const f = cutEl.getBoundingClientRect();
          soft.push(grow({ x: r.left - f.left, y: r.top - f.top, w: r.width, h: r.height }, 8));
        });
        const chrome = q(`[data-chrome="${index}"]`);
        if (chrome) qa<HTMLElement>('.of-meta, .of-credit', chrome).forEach((el) => el.offsetWidth && keep.push(grow(offsetBox(el), 10)));
        const cutMs = plan.cuts.find((x) => x.index === index);
        const driftPx = c.driftPx * DRIFT_SCALE[plan.layout];
        const speed = (driftPx * 1000) / Math.max(1, cutMs ? cutMs.end - cutMs.start : 167);
        const trail = (speed / 100) * BLUR_STEP_PER_SPEED * 3;
        const giants: Rect[] = [];
        qa<HTMLElement>('[data-giant]', cutEl).forEach((g, k) => {
          const word = q('[data-giant-word]', g)!;
          const base = g.offsetTop + baselineIn(word);
          const capPx = giantCap(c.giants[k], plan.layout) * short;
          giants.push(grow({ x: g.offsetLeft, y: base - capPx, w: word.offsetWidth, h: capPx }, driftPx / 2 + trail + 10));
        });
        const inBounds = (r: Rect) => r.x >= 14 && r.y >= 14 && r.x + r.w <= W - 14 && r.y + r.h <= H - 14;
        // Paper laid on the page ('over') may lie under the giant words and
        // across the running head — but is laid clear of them where it can.
        const place = (el: HTMLElement, want: Vec2, box: Rect, inset: Vec2, over: boolean) => {
          el.style.visibility = '';
          el.dataset.placed = '';
          const tries = over ? [keep.concat(giants), keep] : [keep.concat(soft, giants)];
          for (const avoid of tries) {
            for (const [dx, dy] of SEARCH) {
              const r = { x: want[0] + dx, y: want[1] + dy, w: box.w, h: box.h };
              if (!inBounds(r) || avoid.some((k) => hits(r, k))) continue;
              el.style.left = px(r.x + inset[0]);
              el.style.top = px(r.y + inset[1]);
              keep.push(grow(r, 12));
              return;
            }
          }
          el.style.visibility = 'hidden';
          el.dataset.placed = 'none';
        };
        // The layers first (the paper laid on the page, then its words).
        const layers = qa<HTMLElement>('[data-place]', cutEl).filter((el) => el.offsetWidth > 0);
        layers.sort((a, b) => Number(b.dataset.place === 'over') - Number(a.dataset.place === 'over'));
        layers.forEach((el) => {
          el.style.left = '0px';
          el.style.top = '0px';
          const cs = getComputedStyle(el);
          const wx = parseFloat(cs.getPropertyValue('--want-x')) || 0;
          const wy = parseFloat(cs.getPropertyValue('--want-y')) || 0;
          const w = el.offsetWidth;
          const h = el.offsetHeight;
          // A rotated piece keeps its corners in: a margin of its turn.
          const turn = Math.abs(parseFloat(cs.getPropertyValue('--rot')) || 0);
          const m = Math.sin((turn * Math.PI) / 180) * Math.max(w, h) * 0.5 + 4;
          const wantAt: Vec2 = phoneLayout
            ? [Math.min(Math.max(14, wx * W), W - 14 - w), wy < 0.5 ? zone.y - 24 - h : zone.y + zone.h + 24]
            : [wx * W, wy * H];
          place(el, [wantAt[0] - m, wantAt[1] - m], { x: 0, y: 0, w: w + 2 * m, h: h + 2 * m }, [m, m], el.dataset.place === 'over');
        });
        // The ringed word (its ring drawn round it: 0.7em × 0.55em out).
        const ringed = q('[data-ringed]', cutEl);
        if (ringed) {
          const em = parseFloat(getComputedStyle(ringed).fontSize) || 22;
          const rw = ringed.offsetWidth + 1.4 * em;
          const rh = ringed.offsetHeight + 1.1 * em;
          const right = c.deco.ring[0] > 0.5;
          const ringWant: Vec2 = phoneLayout
            ? [right ? W - 24 - rw : 24, right ? block.y - 96 - rh : block.y + block.h + 70]
            : [c.deco.ring[0] * W - 0.7 * em, c.deco.ring[1] * H - 0.55 * em];
          place(ringed, ringWant, { x: 0, y: 0, w: rw, h: rh }, [0.7 * em, 0.55 * em], false);
        }
        // The texture (the phone keeps the first).
        qa<HTMLElement>('[data-texture]', cutEl).forEach((p, k) => {
          if (getComputedStyle(p).display === 'none') return;
          const t = c.deco!.texture[k];
          const w = p.offsetWidth;
          const h = p.offsetHeight;
          const want: Vec2 = phoneLayout ? [Math.min(Math.max(14, t.at[0] * W), W - 14 - w), block.y + block.h + 110] : [t.at[0] * W, t.at[1] * H];
          place(p, want, { x: 0, y: 0, w, h }, [0, 0], false);
        });
      });
    }

    // ── Build: the whole film as keyframes on one clock ──
    const build = () => {
      filmAnims.forEach((a) => a.cancel());
      filmAnims = [];
      const g = geo!;
      const { H } = g;
      const total = plan.length + 40;
      const at = (t: number) => clamp01(t / total);
      const play = (el: Element, keyframes: Keyframe[]) => {
        let floor = 0;
        keyframes.forEach((k) => {
          if (typeof k.offset === 'number') {
            k.offset = Math.min(1, Math.max(floor, k.offset));
            floor = k.offset;
          }
        });
        const anim = el.animate(keyframes, { duration: total, fill: 'both', easing: 'linear' });
        anim.startTime = t0;
        filmAnims.push(anim);
        return anim;
      };
      /** Keyframes on a window of the clock only [start, end] (offsets in
       *  the window); outside it the element's own style (fill none). */
      const during = (el: Element, start: number, end: number, keyframes: Keyframe[], iterations = 1) => {
        const anim = el.animate(keyframes, { delay: start, duration: Math.max(1, end - start), iterations, fill: 'none', easing: 'linear' });
        anim.startTime = t0;
        filmAnims.push(anim);
        return anim;
      };
      /** A property held at each value from its time (hard steps). */
      const steps = (el: Element, prop: 'opacity' | 'transform', first: string | number, changes: [number, string | number][]) => {
        const frames: Keyframe[] = [{ offset: 0, [prop]: first }];
        let prev = first;
        changes.forEach(([t, v]) => {
          frames.push({ offset: at(t), [prop]: prev }, { offset: at(t), [prop]: v });
          prev = v;
        });
        frames.push({ offset: 1, [prop]: prev });
        play(el, frames);
      };
      /** A reveal: its window at `u` px, its content counter-moved (the
       *  letters never move), stepped at each time. */
      const reveals = (win: Element, content: Element, first: number, changes: [number, number][]) => {
        steps(win, 'transform', tx(first), changes.map(([t, v]) => [t, tx(v)]));
        steps(content, 'transform', tx(-first), changes.map(([t, v]) => [t, tx(-v)]));
      };
      /** Shown (opacity 1) across [start, end), hidden otherwise. */
      const shown = (el: Element, start: number, end: number, on: number | string = 1, warm = false) => {
        const ch: [number, number | string][] = [];
        // A page about to cut in is drawn a few frames ahead at an opacity
        // no eye can see (WARM): the compositor rasters a layer it draws,
        // not one at zero, and a cut must never wait on a raster.
        if (warm && start > WARM_MS) ch.push([start - WARM_MS, WARM_OPACITY]);
        if (start > 0) ch.push([start, on]);
        if (end < total) ch.push([end, 0]);
        steps(el, 'opacity', start > 0 ? 0 : on, ch);
      };
      /** Drawn (visibility) from `lead` ms before `start` (at the earliest
       *  as the clock is laid) to just after `end`, and not otherwise: a
       *  main-thread property, so it is let in early and let go late — the
       *  compositor's opacity decides the frame the scene shows. What the
       *  first paint already draws (the first page, and the second, unseen,
       *  so that its first raster is done before the clock) is let go after
       *  its end instead. */
      const live = (el: Element, start: number, end: number, lead = PREROLL_MS) => {
        if (start <= 0 || el.hasAttribute('data-early')) {
          goneAfter(el, end);
          return;
        }
        const from = Math.max(-PRELUDE_MS, start - lead);
        const forever = end >= total;
        during(el, from, forever ? total : end + 50, [{ visibility: 'visible' }, { visibility: 'visible' }]).effect?.updateTiming({ fill: forever ? 'forwards' : 'none' });
      };
      /** Not drawn from just after `t` on (for what is there from the first
       *  paint). */
      const goneAfter = (el: Element, t: number) => {
        during(el, t + 50, total, [{ visibility: 'hidden' }, { visibility: 'hidden' }]).effect?.updateTiming({ fill: 'forwards' });
      };
      /** Shown and drawn across [start, end). */
      const scene = (el: Element, start: number, end: number, warm = false, lead = PREROLL_MS) => {
        shown(el, start, end, 1, warm);
        live(el, start, end, lead);
      };
      /** The grain: its tile moved every 60th of a second across [start, end). */
      const grain = (tile: Element | null, start: number, end: number) => {
        if (!tile) return;
        const frames: Keyframe[] = GRAIN_STEPS.map(([x, y], k) => ({ offset: k / GRAIN_STEPS.length, transform: `translate(${x}px, ${y}px)`, easing: 'steps(1, end)' }));
        frames.push({ offset: 1, transform: 'translate(0px, 0px)' });
        during(tile, start, start + GRAIN_LOOP_MS, frames, Math.max(1, Math.ceil((end - start) / GRAIN_LOOP_MS)));
      };
      /** The proof's part on the clock: laid from film −preLead (a negative
       *  delay, so its start time is t0 like every film animation's — seek
       *  and skip move it with the rest): −PRELUDE_MS, or earlier where the
       *  plates were printed earlier on a slow load. Opacity at film times,
       *  linear between (two at one time: a hard step). */
      const preLead = Math.max(PRELUDE_MS, -limeAt + CUT_MS);
      const preSpan = total + preLead;
      const pat = (t: number) => clamp01((t + preLead) / preSpan);
      const preKeys = (el: Element | null, keys: readonly { t: number; opacity: number }[]) => {
        if (!el || !keys.length) return;
        const frames: Keyframe[] = keys.map(({ t, opacity }) => ({ offset: pat(t), opacity }));
        if (frames[0].offset !== 0) frames.unshift({ offset: 0, opacity: keys[0].opacity });
        frames.push({ offset: 1, opacity: keys[keys.length - 1].opacity });
        const anim = el.animate(frames, { delay: -preLead, duration: preSpan, fill: 'both', easing: 'linear' });
        anim.startTime = t0;
        filmAnims.push(anim);
      };
      /** Hard steps of opacity from film −preLead. */
      const pre = (el: Element | null, first: number, changes: [number, number][]) => {
        const keys = [{ t: -preLead, opacity: first }];
        let prev = first;
        changes.forEach(([t, v]) => {
          keys.push({ t, opacity: prev }, { t, opacity: v });
          prev = v;
        });
        preKeys(el, keys);
      };
      /** A morph's letters: each pair fitted into their shared ink box across
       *  `win` (shares of the move [start, start + dur]); outside it each
       *  letter is its own (the face not shown then is hidden). */
      const morphLetters = (pairs: (readonly [Glyph, Glyph])[] | null, start: number, dur: number, win: readonly [number, number]) => {
        if (!pairs) return;
        const us = morphSamples(win);
        const span = win[1] - win[0];
        pairs.forEach(([a, b]) => {
          [a, b].forEach((gl) => {
            during(
              gl.el,
              start + dur * win[0],
              start + dur * win[1],
              us.map((u) => ({ offset: (u - win[0]) / span, transform: glyphTransform(gl, a, b, morphAt(u, win)) })),
            );
          });
        });
      };

      const acts = plan.acts;
      const f0 = acts.burn.start;
      const frameT = (f: number) => burnFrameStart(plan, f);
      const frameOut = frameT(BURN.out[1]);

      // ── Act 0: the proof — the plates on the clock; the sheet let go at the page ──
      // (The lights are the stylesheet's, from the first paint, and the
      // clock was counted from them. The plates the head script printed
      // are its own animations, kept as they are — the page is laid on
      // their grid; without them they are this clock's own beats.)
      {
        const pr = plan.prelude;
        // The lime plate (its first impression, setting to full), and a
        // sixth of a second on, the ink plate (the word).
        const block0 = q('[data-key="0"] [data-block]');
        const word0 = q('[data-key="0"] [data-word]');
        if (!platePrinted(block0)) preKeys(block0, proofLimeKeys(limeAt));
        if (!platePrinted(word0)) pre(word0, 0, [[wordAt(), 1]]);
        // The film's grain comes with the page (unseen before: drawn warm).
        const grainEl = q('[data-grain]');
        pre(grainEl, WARM_OPACITY, [[pr.end, 1], [acts.hand.start, 0]]);
        if (grainEl) goneAfter(grainEl, acts.hand.start);
        const sheet = q('[data-proof]');
        const marks = q('[data-proof-marks]');
        pre(sheet, PRELUDE.sheet, [[pr.end, 0]]);
        pre(marks, 1, [[pr.end, 0]]);
        if (sheet) goneAfter(sheet, pr.end);
        if (marks) goneAfter(marks, pr.end);
      }

      // ── Act 1: the paper, the pages, the anchor ──
      [q('[data-paper]'), q('[data-soft]'), q('[data-vignette]')].forEach((el) => el && scene(el, 0, acts.hand.start));
      // The frame's grain moves from the proof's first frame (unseen until
      // the page: Act 0).
      grain(q('[data-grain-tile]'), -PRELUDE_MS, acts.hand.start);
      const used = new Map(plan.cuts.map((c, k) => [c.index, k]));
      qa<HTMLElement>('[data-cut]').forEach((cutEl) => {
        const index = Number(cutEl.dataset.cut);
        const k = used.get(index);
        const key = q(`[data-key="${index}"]`)!;
        const chrome = q(`[data-chrome="${index}"]`);
        if (k == null) {
          [cutEl, key, chrome].forEach((el) => el && play(el, [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 0 }]));
          return;
        }
        const cut = plan.cuts[k];
        scene(cutEl, cut.start, cut.end, true, CUTS_DRAWN);
        if (chrome) scene(chrome, cut.start, cut.end, false, CUTS_DRAWN);
        scene(key, cut.start, cut.end, false, CUTS_DRAWN);
        // The giant words drift, the whole cut, one way (their copies ride
        // with them).
        const c = SCENES[index];
        const [dx, dy] = DRIFT_VEC[c.drift];
        const driftPx = c.driftPx * DRIFT_SCALE[plan.layout];
        const v = driftPx / (cut.end - cut.start);
        const pos = (t: number) => {
          const d = -driftPx / 2 + v * (t - cut.start);
          return tr(dx * d, dy * d);
        };
        qa<HTMLElement>('[data-giant]', cutEl).forEach((giant) => {
          play(giant, [
            { offset: 0, transform: pos(cut.start) },
            { offset: at(cut.start), transform: pos(cut.start) },
            { offset: at(cut.end), transform: pos(cut.end) },
            { offset: 1, transform: pos(cut.end) },
          ]);
        });
      });

      // ── Act 2: the hand-off — the lime block, alone, into the cursor ──
      {
        const hand = q('[data-handoff]')!;
        const from = g.blocks[plan.cuts[plan.cuts.length - 1].index];
        const to = g.landing;
        const { start, end } = acts.hand;
        const pose = (e: number) =>
          `translate(${((to.x - from.x) * e).toFixed(2)}px, ${((to.y - from.y) * e).toFixed(2)}px) scale(${(1 + (to.w / from.w - 1) * e).toFixed(5)}, ${(1 + (to.h / from.h - 1) * e).toFixed(5)})`;
        play(hand, [
          { offset: 0, transform: pose(0) },
          ...sampleCurve(HAND.ease, 16).map(({ u, e }) => ({ offset: at(start + (end - start) * u), transform: pose(e) })),
          { offset: 1, transform: pose(1) },
        ]);
        scene(hand, start, end);
      }

      // ── Act 3: the machines, the typing, the cursor ──
      const inkSteps = cursorSteps(plan);
      qa<HTMLElement>('[data-mat]').forEach((mat) => {
        const id = mat.dataset.mat as StyleId;
        const k = plan.styles.findIndex((x) => x.id === id);
        const m = plan.styles[k];
        const mg = g.mats.get(id);
        if (!m || !mg) {
          play(mat, [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 0 }]);
          return;
        }
        // The first machine is under the hand-off; the last holds through
        // the burn until the frame has gone.
        const startT = k === 0 ? acts.hand.start : m.start;
        const endT = id === BURN_STYLE ? frameOut : m.end;
        scene(mat, startT, endT, true);
        const reveal = q('[data-reveal]', mat)!;
        const inner = q('[data-reveal-in]', reveal)!;
        const { xs, width, size } = mg;
        // The reveal box is the line plus 1em each side: its right edge is
        // put at the n-th letter's end (a hair past its advance).
        const u = (n: number) => xs[n] + (n > 0 ? size * 0.02 : 0) - width - size;
        reveals(
          reveal,
          inner,
          u(0),
          plan.typing.map((t, i) => [t, u(i + 1)]),
        );
        // The cursor: the lime block landed (the first machine's: from the
        // hand-off's end), riding the typing; its ink on the film's clock.
        const cursor = q('[data-cursor]', mat)!;
        const ink = q('[data-cursor-ink]', cursor)!;
        steps(ink, 'opacity', k === 0 ? 0 : 1, k === 0 ? [[acts.hand.end, 1], ...inkSteps] : inkSteps);
        const cur: [number, string][] = plan.typing.map((t, i) => [t, tx(xs[i + 1])]);
        steps(cursor, 'transform', tx(0), cur);
        // What grows with the line (the label's tape, the marker) ends
        // where the cursor is.
        const growEnd = q('[data-grow-end]', mat);
        if (growEnd) steps(growEnd, 'transform', tx(0), cur);
        // The grid paper's arrow, drawn in four stages two 60ths apart (each
        // a longer stretch of the one path), its head with the last.
        const stages = qa<SVGPathElement>('[data-arrow]', mat);
        stages.forEach((path, j) => {
          const t = m.start + (j + 1) * ARROW_STEP_MS;
          const off = j < stages.length - 1 ? m.start + (j + 2) * ARROW_STEP_MS : endT;
          during(path, t, off, [{ opacity: 1 }, { opacity: 1 }]);
        });
        const head = q('[data-arrow-head]', mat);
        if (head) during(head, m.start + stages.length * ARROW_STEP_MS, endT, [{ opacity: 1 }, { opacity: 1 }]);
      });

      // ── Act 4: the burn ──
      // The frame: its gate weave, the slip, the slide out (held a frame) —
      // out along its own tilted up-axis.
      const frameEl = q('[data-frame]')!;
      const tanSlide = Math.tan((BURN.slideDeg * Math.PI) / 180);
      const framePose = (f: number) => {
        const p = frameAt(f);
        const slant = f >= BURN.out[0] ? -p.y * H * tanSlide : 0;
        return `translate3d(${(p.x + slant).toFixed(2)}px, ${(p.y * H + p.weaveY).toFixed(2)}px, 0) rotate(${p.rot.toFixed(3)}deg)`;
      };
      steps(
        frameEl,
        'transform',
        'translate3d(0px, 0px, 0) rotate(0deg)',
        Array.from({ length: BURN.out[1] + 1 }, (_, f) => [frameT(f), framePose(f)] as [number, string]),
      );
      // What a slip shows past the frame's foot: for the slip's frame only
      // (nothing light comes in as the frame darkens and goes).
      scene(q('[data-next]')!, frameT(BURN.slip), frameT(BURN.slip + 1));
      const sepia = q('[data-sepia]')!;
      steps(sepia, 'opacity', 0, [
        ...Array.from({ length: BURN.out[1] - BURN.burn[0] }, (_, k) => [frameT(BURN.burn[0] + k), burnSepia(BURN.burn[0] + k)] as [number, number]),
        [frameOut, 0],
      ]);
      live(sepia, frameT(BURN.burn[0]), frameOut);
      const canvas = q<HTMLCanvasElement>('[data-burn]')!;
      const veil = q('[data-veil]')!;
      if (burn) {
        scene(canvas, f0, frameOut);
        play(veil, [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 0 }]);
      } else {
        // No WebGL: no burn, but the frame still darkens and goes.
        play(canvas, [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 0 }]);
        steps(veil, 'opacity', 0, [
          ...Array.from({ length: BURN.out[1] - BURN.burn[0] }, (_, k) => [frameT(BURN.burn[0] + k), Math.max(burnRadius(BURN.burn[0] + k), burnDarkness(BURN.burn[0] + k))] as [number, number]),
          [frameOut, 0],
        ]);
        live(veil, frameT(BURN.burn[0]), frameOut);
      }
      scene(q('[data-burnground]')!, f0, acts.dark.start);
      // The leader: its card, a frame.
      qa<HTMLElement>('[data-leader]').forEach((card, k) => {
        const f = BURN.leader[0] + k;
        scene(card, frameT(f), frameT(f + 1));
      });

      // ── Acts 5–6: the dark, typed; the title ──
      const end = q('[data-end]')!;
      scene(end, acts.dark.start, total);
      grain(q('[data-end-grain-tile]'), acts.dark.start, total + LANDING_A.done);
      const tg = g.title;
      const unitEl = q('[data-title]')!;
      const mono = q('[data-title-from]')!;
      const reveal = mono.closest<HTMLElement>('[data-reveal]')!;
      const inner = q('[data-reveal-in]', reveal)!;
      const cursor = q('[data-title-cursor]')!;
      const t6 = acts.title.start;
      const samples = sampleCurve(GLIDE_EASE, 14);
      const scale = (e: number) => `scale(${(tg.k5 + (1 - tg.k5) * e).toFixed(5)})`;
      play(unitEl, [
        { offset: 0, transform: scale(0) },
        ...samples.map(({ u, e }) => ({ offset: at(t6 + TITLE.morph * u), transform: scale(e) })),
        { offset: 1, transform: scale(1) },
      ]);
      // The typing: the reveal's window to the n-th letter.
      const u5 = (n: number) => tg.pen + n * tg.adv - (tg.pen - 12 + tg.revealW);
      const typing5: [number, number][] = plan.darkTyping.map((t, i) => [t, u5(i + 1)]);
      reveals(reveal, inner, u5(0), typing5);
      // The typed line is struck in capitals on the beat the title begins
      // (the same cells): from there its letters are the morph's.
      steps(reveal, 'opacity', 1, [[t6, 0]]);
      // The lime cursor: on with the dark, riding the typing, gone as the
      // line turns into the title.
      const cur5: [number, string][] = plan.darkTyping.map((t, i) => [t, tx((i + 1) * tg.adv)]);
      steps(cursor, 'transform', tx(0), cur5);
      play(cursor, [
        { offset: 0, opacity: 0 },
        { offset: at(acts.dark.start), opacity: 0 },
        { offset: at(acts.dark.start), opacity: 1 },
        { offset: at(t6), opacity: 1, easing: FADE_CSS },
        { offset: at(t6 + TITLE.cursorOut), opacity: 0 },
        { offset: 1, opacity: 0 },
      ]);
      // Every typewriter capital turns into its Fraunces capital in one ink
      // box as the line grows to the title; one crossing, centred in it.
      morphLetters(pairGlyphs(tg.from, tg.to), t6, TITLE.morph, TITLE.box);
      const [a, b] = TITLE.swap;
      play(q('[data-gm="from"]', unitEl)!, [
        { offset: 0, opacity: 0 },
        { offset: at(t6), opacity: 0 },
        { offset: at(t6), opacity: 1 },
        { offset: at(t6 + TITLE.morph * a), opacity: 1 },
        { offset: at(t6 + TITLE.morph * b), opacity: 0 },
        { offset: 1, opacity: 0 },
      ]);
      play(q('[data-gm="to"]', unitEl)!, [
        { offset: 0, opacity: 0 },
        { offset: at(t6 + TITLE.morph * a), opacity: 0 },
        { offset: at(t6 + TITLE.morph * b), opacity: 1 },
        { offset: 1, opacity: 1 },
      ]);
      const rise = (el: Element, [s, e]: readonly [number, number]) => {
        play(el, [
          { offset: 0, opacity: 0, transform: tx(0, TITLE.rise) },
          { offset: at(t6 + s), opacity: 0, transform: tx(0, TITLE.rise), easing: ARRIVE_CSS },
          { offset: at(t6 + e), opacity: 1, transform: tx(0, 0) },
          { offset: 1, opacity: 1, transform: tx(0, 0) },
        ]);
      };
      rise(q('[data-title-sub]')!, TITLE.sub);
      rise(q('[data-title-you]')!, TITLE.you);
    };

    // ── The burn's canvas, on the film's clock, a 24th at a time ──
    let drawnFrame = -2;
    const drawBurn = (t: number) => {
      if (!burn || !geo) return;
      const f = burnFrameAt(plan, t);
      const want = f >= 0 && f < BURN.out[1] ? f : -1;
      if (want === drawnFrame) return;
      drawnFrame = want;
      if (want < 0) {
        burn.draw(null);
        return;
      }
      const diag = Math.hypot(geo.W, geo.H);
      burn.draw({
        frame: want,
        origin: geo.burnOrigin,
        radius: burnRadius(want) * diag,
        flick: burnFrame(want).flick * 0.1,
        dark: burnDarkness(want),
        // Dust on the frame until it darkens.
        dust: want < BURN.out[0] ? 1 : 0,
        scratch: scratchOf(want),
      });
    };
    // The same loop lays the landing on the formed title's hold (its last
    // FF_TAIL ms, when nothing moves), to start on the film's clock at its
    // end (a timer stands by, and fires late on a busy main thread).
    const burnLoop = (now: number) => {
      burnRaf = 0;
      if (disposed || phase !== 'film') return;
      const t = now - t0;
      drawBurn(t);
      if (t >= plan.length - FF_TAIL) {
        startLanding();
        return;
      }
      burnRaf = requestAnimationFrame(burnLoop);
    };

    // ── The clock's moments the page hears about ──
    const schedule = () => {
      clearTimers();
      if (seekParam != null) return;
      const t = filmTime();
      later(markSeen, plan.acts.type.start - t);
      // The globe's word comes with the landing's (one publish), unless the
      // page is to be told sooner.
      if (globeReleaseAt(plan) < plan.length) later(releaseGlobe, globeReleaseAt(plan) - t);
      later(startLanding, plan.length - FF_TAIL - t + 20);
    };
    const shiftAll = (delta: number) => {
      // The film's own list (a finished window is no longer among the
      // element's animations, but must move with the clock all the same).
      filmAnims.forEach((a) => {
        if (a.startTime != null) a.startTime = Number(a.startTime) + delta;
      });
      t0 += delta;
    };

    // The Skip pill: to the end title's tail, and a hurried landing.
    const fastForward = () => {
      if (phase === 'wait') {
        // Before the clock: no plate printed after this, and the clock laid
        // at once (the island is not kept waiting for a face or a plate).
        pendingSkip = true;
        plates?.hold();
        skipNow();
        return;
      }
      if (phase !== 'film') return;
      hurried = true;
      markSeen();
      releaseGlobe();
      const t = filmTime();
      const target = fastForwardTarget(plan, t);
      if (target == null) return;
      shiftAll(-(target - t));
      // The proof's lights (the stylesheet's) end down, and the head
      // script's plates printed; its layers are gone on the shifted clock.
      proofAnims().forEach((a) => a.finish());
      plates?.anims.forEach((a) => a.finish());
      drawBurn(target);
      schedule();
      if (!burnRaf) burnRaf = requestAnimationFrame(burnLoop);
    };
    onSkipFilm = fastForward;

    // ── Landing ──
    // Laid a little ahead — on the formed title's hold, when nothing moves —
    // and started on the film's clock, at its end: every landing animation's
    // start is the film's end; laid late, they start where they would be by
    // then. What it needs from the page — its words at both ends, the clones
    // that fly, the dark's own opacities — is read before the clock, with
    // the film's own measuring (planLanding, below), so the frame it is laid
    // in reads nothing and only writes: read on that frame, between its own
    // writes, it was 80 forced style and layout passes, 15–16 ms of a
    // 36–39 ms frame on a phone at a quarter of the CPU, and two dropped
    // frames in one run of three (round wf45's final check).
    function startLanding() {
      if (phase !== 'film') return;
      phase = 'landing';
      markSeen();
      const startAt = seekParam != null ? nowMs() : Math.max(nowMs(), t0 + plan.length);
      const tell = () => {
        // One word to the page: landing, and the globe may come up.
        globe = true;
        state = 'landing';
        publish();
        skip.classList.add('is-gone');
      };
      if (seekParam != null) tell();
      else later(tell, startAt - nowMs());
      landA(startAt);
    }

    // A: the words fly home (src/lib/openingFilm.ts, LANDING_A: his name
    // first, whole; then the others in the cover's reading order; the page's
    // own words take over under a short cross-dissolve).

    // What a word looks like at either end: its computed face, kept as plain
    // values (a live style read on the landing's frame would bring the
    // page's style up to date there). A word that is the same on both ends
    // (his name: the title sets it as the cover does) is only moved and
    // scaled — the size is the two faces' own ratio, so it lands as the page
    // draws it; one whose face changes (the credits' capitals into the
    // page's Fraunces) turns letter by letter, every letter and its
    // counterpart held to one ink box, at the start of its flight.
    interface FaceStyle {
      fontFamily: string;
      fontWeight: string;
      fontStyle: string;
      fontSize: string;
      letterSpacing: string;
      textTransform: string;
      color: string;
      fontVariationSettings: string;
      fontOpticalSizing: string;
      fontFeatureSettings: string;
      textShadow: string;
    }
    const faceStyle = (el: Element): FaceStyle => {
      const s = getComputedStyle(el);
      return {
        fontFamily: s.fontFamily,
        fontWeight: s.fontWeight,
        fontStyle: s.fontStyle,
        fontSize: s.fontSize,
        letterSpacing: s.letterSpacing,
        textTransform: s.textTransform,
        color: s.color,
        fontVariationSettings: s.fontVariationSettings,
        fontOpticalSizing: (s as CSSStyleDeclaration & { fontOpticalSizing: string }).fontOpticalSizing,
        fontFeatureSettings: s.fontFeatureSettings,
        textShadow: s.textShadow,
      };
    };
    const casing = (text: string, style: FaceStyle) =>
      style.textTransform === 'uppercase' ? text.toUpperCase() : style.textTransform === 'lowercase' ? text.toLowerCase() : text;
    const tracking = (style: FaceStyle) => (style.letterSpacing === 'normal' ? 0 : (parseFloat(style.letterSpacing) || 0) / (parseFloat(style.fontSize) || 16));
    const sameFace = (a: FaceStyle, b: FaceStyle, aText: string, bText: string) =>
      a.fontFamily === b.fontFamily &&
      a.fontWeight === b.fontWeight &&
      a.fontStyle === b.fontStyle &&
      casing(aText, a) === casing(bText, b) &&
      Math.abs(tracking(a) - tracking(b)) < 0.002;

    /** The end title, where each word leaves from: read while it stands
     *  still — before the clock (or on a refit, the film's keyframes off),
     *  never under the film's own keyframes (they scale it and raise its
     *  lines until it has formed); formed, it stands exactly so. */
    interface TitleWord {
      src: HTMLElement;
      rect: Box;
      scale: number;
      text: string;
      style: FaceStyle;
      ink: Ink;
      base: number;
      /** His name's words: their first letter's pen, as the title draws it. */
      pen: number | null;
    }
    interface TitleRead {
      words: Map<FlyWord, TitleWord>;
      /** The title's baseline, read off its letters on screen. */
      base: number | null;
      /** Where its letters' unit stands (his name sets off from it). */
      origin: Vec2;
      /** The dark's own opacities (the stylesheet's: the film never
       *  animates these). */
      dark: Map<Element, number>;
    }
    let titleRead: TitleRead | null = null;
    const readTitle = (): TitleRead => {
      const endLayer = q('[data-end]')!;
      // The title's name as it stands on screen: its letters (the morph's
      // Fraunces face) on their pens, and its baseline.
      const titleFace = q('[data-title] [data-gm="to"]', endLayer);
      const base = titleFace?.querySelector<HTMLElement>(':scope > .of-bl')?.getBoundingClientRect().top ?? null;
      const words = new Map<FlyWord, TitleWord>();
      FLY_ORDER.forEach((word) => {
        const src = endLayer.querySelector<HTMLElement>(LANDING_TARGETS[word].from);
        if (!src) return;
        const r = src.getBoundingClientRect();
        const text = (src.textContent || '').replace(/\s+/g, ' ').trim();
        // A word only moved (his name) starts exactly where the title draws
        // it: its first letter's pen and the title's baseline — so the clone
        // that takes the title's place is drawn on it (read off the letters
        // on screen, not the unseen text the title is measured on, a pixel
        // apart).
        const at = TITLE_NAME.indexOf(text);
        const letter = at >= 0 ? titleFace?.querySelector<HTMLElement>(`:scope > [data-g="${at}"]`) : null;
        words.set(word, {
          src,
          rect: { x: r.left, y: r.top, w: r.width, h: r.height },
          scale: r.height / Math.max(1, src.offsetHeight),
          text,
          style: faceStyle(src),
          ink: inkOf(src, text),
          base: baselineOf(src),
          pen: letter ? letter.getBoundingClientRect().left : null,
        });
      });
      const unit = q('[data-title] [data-gm-unit]', endLayer)!.getBoundingClientRect();
      // The dark: its ground, its perforations and grain, the credits' dots
      // — and any word with no place to fly to.
      const dark = new Map<Element, number>();
      [
        ...Array.from(endLayer.children).filter((el) => !el.classList.contains('of-end__title')),
        ...qa('.of-title__sub .of-title__dot, .of-title__sub [data-fly]', endLayer),
      ].forEach((el) => {
        const from = Number.parseFloat(getComputedStyle(el).opacity);
        dark.set(el, Number.isFinite(from) ? from : 1);
      });
      return { words, base, origin: [unit.left, unit.top], dark };
    };

    /** The cover of words under the film, where each word lands: read with
     *  the title before the clock, and again — in a resize observer's
     *  callback, the layout already up to date — if one of its words changes
     *  size under the film (a face that came late: the Chinese serif). */
    interface CoverWord {
      dst: HTMLElement;
      top: number;
      left: number;
      size: [number, number];
      box: Box | null;
      text: string;
      style: FaceStyle;
      ink: Ink;
      base: number;
    }
    const readCover = (): Map<FlyWord, CoverWord> => {
      const vh = viewport().h;
      const cover = new Map<FlyWord, CoverWord>();
      FLY_ORDER.forEach((word) => {
        // The cover is printed in both languages (src/i18n): the hidden
        // copy has no box, and a flight aimed at it would be dropped.
        const dst = shownMatch(document, LANDING_TARGETS[word].to);
        if (!dst || !dst.getClientRects().length) return;
        // A place below the first screen is not a landing: that word stays
        // and goes with the dark.
        const r = dst.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const text = (dst.textContent || '').trim();
        cover.set(word, { dst, top: r.top, left: r.left, size: [r.width, r.height], box: textBox(dst), text, style: faceStyle(dst), ink: inkOf(dst, text), base: baselineOf(dst) });
      });
      return cover;
    };

    /** The landing as laid before the clock: every word's flight and its
     *  clones in the flight layer (hidden until their moment), the dark. */
    interface LandingPlan {
      placed: {
        src: HTMLElement;
        dst: HTMLElement;
        same: boolean;
        to: Vec2;
        flight: ReturnType<typeof flightFor>;
        wrap: HTMLElement;
        source: { box: HTMLElement; text: string } | null;
        target: { box: HTMLElement; text: string } | null;
        word: { box: HTMLElement; text: string };
        letters: (readonly [Glyph, Glyph])[] | null;
      }[];
      /** The words besides his name (the landing's length). */
      others: number;
      dark: { el: Element; from: number }[];
      origin: Vec2;
    }
    let landing: LandingPlan | null = null;
    const planLanding = (title: TitleRead, cover: Map<FlyWord, CoverWord>): LandingPlan => {
      flightLayer.replaceChildren();
      const found = FLY_ORDER.flatMap((word) => {
        const t = title.words.get(word);
        const c = cover.get(word);
        return t && c ? [{ t, c, top: c.top, left: c.left, from: t.rect.y, name: NAME_WORDS.includes(word) }] : [];
      });
      // His name first, its words on one clock (one unit). Then the others,
      // each a little after the one before, by the line they land on: those
      // bound above the credits' line first (they rise behind the name), the
      // highest first; then those bound below it, the deepest first — so a
      // word never rises into one still rising above it, nor drops through
      // one still dropping below it (measured: with the cover's reading
      // order, "thought" passed over "archive" and "you"). On one line, in
      // reading order.
      const names = found.filter((p) => p.name);
      const others = found.filter((p) => !p.name).sort((a, b) => landingRank(a) - landingRank(b) || a.left - b.left);
      const pairs = [...names, ...others];

      const flights = pairs
        .map(({ t, c, name }, i) => {
          const dstBox = c.box;
          if (!dstBox || !t.rect.w) return null;
          const { src, scale, style: sStyle, text: srcText, ink: srcInk, base: srcBase } = t;
          const { dst, style: dStyle, text: dstText, ink: dstInk, base: dstBase } = c;
          const same = sameFace(sStyle, dStyle, srcText, dstText);
          // Ink centre to ink centre; the size from ink height to ink height
          // (the same face: from font size to font size, exactly).
          let from: Vec2 = [t.rect.x + (scale * (srcInk.right - srcInk.left)) / 2, srcBase - (scale * (srcInk.ascent - srcInk.descent)) / 2];
          const to: Vec2 = [dstBox.x + (dstInk.right - dstInk.left) / 2, dstBase - (dstInk.ascent - dstInk.descent) / 2];
          const srcH = same ? (parseFloat(sStyle.fontSize) || 16) * scale : (srcInk.ascent + srcInk.descent) * scale;
          const dstH = same ? parseFloat(dStyle.fontSize) || 16 : dstInk.ascent + dstInk.descent;
          if (same && title.base != null && t.pen != null) {
            const k = srcH / Math.max(1e-6, dstH);
            from = [t.pen - k * (dstBox.x - to[0]), title.base - k * (dstBase - to[1])];
          }
          const flight = flightFor({ x: from[0], y: from[1], w: 0, h: 0 }, { x: to[0], y: to[1], w: 0, h: 0 }, srcH, dstH, name ? null : i - names.length);
          return { src, dst, srcText, sStyle, dstText, dStyle, dstBox, dstBase, scale, to, flight, same };
        })
        .filter(<T,>(x: T | null): x is T => x != null);

      /** A clone of a word in a face (its letters each a box, for a morph). */
      const face = (text: string, style: FaceStyle, size: number, letters: boolean) => {
        const box = document.createElement('span');
        box.className = 'of-fly__face';
        const shown = casing(text, style);
        box.style.fontFamily = style.fontFamily;
        box.style.fontWeight = style.fontWeight;
        box.style.fontStyle = style.fontStyle;
        box.style.fontSize = `${size}px`;
        box.style.letterSpacing = `${(tracking(style) * size).toFixed(3)}px`;
        box.style.textTransform = 'none';
        box.style.color = style.color;
        box.style.lineHeight = 'normal';
        box.style.fontVariationSettings = style.fontVariationSettings;
        box.style.fontOpticalSizing = style.fontOpticalSizing;
        box.style.fontFeatureSettings = style.fontFeatureSettings;
        box.style.textShadow = style.textShadow;
        if (letters) {
          shown.split('').forEach((ch, i) => {
            if (ch === ' ') return;
            const g = document.createElement('span');
            g.className = 'of-g';
            g.dataset.g = String(i);
            g.textContent = ch;
            box.append(g);
          });
        } else {
          const inner = document.createElement('span');
          inner.className = 'of-fly__ink';
          inner.textContent = shown;
          box.append(inner);
        }
        const probe = document.createElement('i');
        probe.className = 'of-bl';
        box.append(probe);
        return { box, text: shown };
      };

      // The clones, every one written first: the word as the page sets it
      // (what lands), and — for a word whose face turns — its letters in
      // both faces for the turn; each word's faces in a wrap of its own,
      // hidden until its moment (its animations' own opacity from then on).
      const built = flights.map((f) => {
        const wrap = document.createElement('div');
        wrap.className = 'of-fly';
        wrap.style.opacity = '0';
        wrap.style.transformOrigin = `${f.to[0]}px ${f.to[1]}px`;
        const dstSize = parseFloat(f.dStyle.fontSize) || 16;
        const word = face(f.dstText, f.dStyle, dstSize, false);
        const target = f.same ? null : face(f.dstText, f.dStyle, dstSize, true);
        const source = f.same ? null : face(f.srcText, f.sStyle, ((parseFloat(f.sStyle.fontSize) || 16) * f.scale) / f.flight.k, true);
        if (source) {
          source.box.style.textShadow = 'none';
          wrap.append(source.box);
        }
        if (target) wrap.append(target.box);
        wrap.append(word.box);
        flightLayer.append(wrap);
        return { ...f, wrap, source, target, word };
      });
      // … then read, every one (one layout for all of them): each face's
      // baseline in its own box, its face for the canvas, the source's ink …
      const lifts = new Map<HTMLElement, number>();
      const reads = built.map(({ word, target, source }) => {
        lifts.set(word.box, baselineIn(word.box));
        return {
          target: target ? readFace(target.box) : null,
          source: source ? readFace(source.box) : null,
          sInk: source ? inkOf(source.box, source.text) : null,
        };
      });
      /** A face set on the page word's own pen and baseline. */
      const seat = (box: HTMLElement, x: number, base: number) => {
        box.style.left = px(x);
        box.style.top = px(base - (lifts.get(box) ?? baselineIn(box)));
      };
      // … then set: every word on the page word's own pen and baseline; the
      // page's letters on the page's own pens; the title's letters round the
      // same ink centre, at the page's scale.
      const placed = built.map((f, i) => {
        const { word, target, source } = f;
        seat(word.box, f.dstBox.x, f.dstBase);
        let letters: (readonly [Glyph, Glyph])[] | null = null;
        const read = reads[i];
        if (source && target && read.source && read.target && read.sInk) {
          const toLetters = setGlyphs(target.box, target.text, f.dstBox.x, f.dstBase, null, read.target);
          const sInk = read.sInk;
          const x0 = f.to[0] - (sInk.left + sInk.right) / 2 + sInk.left;
          const yB = f.to[1] + (sInk.ascent - sInk.descent) / 2;
          letters = pairGlyphs(setGlyphs(source.box, source.text, x0, yB, null, read.source), toLetters);
        }
        return { src: f.src, dst: f.dst, same: f.same, to: f.to, flight: f.flight, wrap: f.wrap, source, target, word, letters };
      });
      // The words that fly stay in full ink until they are handed to their
      // clones, in motion; the rest of the dark dissolves.
      const flying = new Set<Element>(placed.map((f) => f.src));
      const dark = [...title.dark].filter(([el]) => !flying.has(el)).map(([el, from]) => ({ el, from }));
      // A word of the cover that changes size under the film moves the
      // landing: read the cover again and lay the clones again, there.
      unwatchCover();
      if (typeof ResizeObserver !== 'undefined' && placed.length) {
        const was = new Map<Element, [number, number]>();
        cover.forEach((c) => was.set(c.dst, c.size));
        const watch = new ResizeObserver((entries) => {
          if (disposed || phase !== 'film' || coverWatch !== watch || !titleRead) return;
          const moved = entries.some((entry) => {
            const box = entry.borderBoxSize?.[0];
            const w = box ? box.inlineSize : entry.contentRect.width;
            const h = box ? box.blockSize : entry.contentRect.height;
            const before = was.get(entry.target);
            return !!before && (Math.abs(before[0] - w) > 0.05 || Math.abs(before[1] - h) > 0.05);
          });
          if (moved) landing = planLanding(titleRead, readCover());
        });
        coverWatch = watch;
        placed.forEach(({ dst }) => watch.observe(dst));
      }
      return { placed, others: others.length, dark, origin: title.origin };
    };

    // `startAt`: its start on document.timeline. It reads nothing: the
    // landing was laid before the clock (laid now only if it never was —
    // the title is formed and still on its hold, so it reads true now too).
    function landA(startAt: number) {
      if (!landing) landing = planLanding(titleRead ?? readTitle(), readCover());
      unwatchCover();
      const { placed, others, dark, origin } = landing;
      const endLayer = q('[data-end]')!;
      const titleLetters = q('[data-title] [data-gm-unit]', endLayer)!;
      const rate = hurried ? FF_RATE : 1;
      const ms = (v: number) => v / rate;

      // The cover's words the film carries home are marked so as it lands
      // (the cover need not find them itself on this frame: EntranceIntro).
      placed.forEach(({ dst }) => dst.setAttribute('data-flown', ''));
      overlay.classList.add('is-landing');
      html.setAttribute('data-open-fly', '');
      html.dataset.reel = 'flight';

      /** A landing animation, started on the landing's clock. */
      const track = (a: Animation) => {
        a.startTime = startAt;
        landAnims.push(a);
        return a;
      };
      // The dark dissolves into the page: its ground, its perforations and
      // grain, the credits' dots — and any word with no place to fly to. The
      // words that fly stay in full ink until they are handed to their
      // clones, in motion (below).
      const dissolve = { duration: ms(LANDING_A.dissolve[1] - LANDING_A.dissolve[0]), delay: ms(LANDING_A.dissolve[0]), fill: 'both' as FillMode, easing: FADE_CSS };
      dark.forEach(({ el, from }) => {
        track(el.animate([{ opacity: from }, { opacity: 0 }], dissolve));
      });
      /** An element shown (or hidden) from `at` ms on: one instant. */
      const cut = (el: Element, from: number, to: number, at: number) =>
        track(el.animate([{ opacity: from }, { opacity: to }], { delay: ms(at), duration: 0, fill: 'both' }));

      // YOU's line is gone before the first flight reaches its row (no word
      // flies across a half-faded line): all of it when YOU has no place on
      // the page to fly to; else its lead ("Admit one ·"), which the words
      // bound for the cover's lower lines drop through (the cover of words
      // gives YOU its place: src/lib/boardingPass.ts coverBlocks).
      const youLine = q('[data-title-you]', endLayer);
      const youFlies = placed.some(({ src }) => src.dataset.fly === 'you');
      const youGone = youLine ? (youFlies ? [...youLine.children].filter((el) => !(el as HTMLElement).dataset.fly) : [youLine]) : [];
      youGone.forEach((el) => {
        track(
          el.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: ms(LANDING_A.youOut[1] - LANDING_A.youOut[0]),
            delay: ms(LANDING_A.youOut[0]),
            fill: 'both',
            easing: FADE_CSS,
          }),
        );
      });

      /** An opacity held, then stepped at share `at` of the flight. */
      const step = (el: HTMLElement, from: number, at: number, to: number, timing: KeyframeAnimationOptions) =>
        track(
          el.animate(
            [
              { offset: 0, opacity: from },
              { offset: at, opacity: from },
              { offset: at, opacity: to },
              { offset: 1, opacity: to },
            ],
            timing,
          ),
        );
      placed.forEach(({ wrap, source, target, word, flight, letters }) => {
        const timing = { duration: ms(flight.duration), delay: ms(flight.delay), fill: 'both' as FillMode, easing: 'linear' };
        track(
          wrap.animate(
            flightPath(flight).map((k) => ({
              offset: k.offset,
              transform: `translate3d(${k.x.toFixed(2)}px, ${k.y.toFixed(2)}px, 0) scale(${k.s.toFixed(5)})`,
            })),
            timing,
          ),
        );
        if (!source || !target) return;
        if (letters) {
          const win = LANDING_A.morph;
          const us = morphSamples(win, 8);
          letters.forEach(([a, b]) => {
            [a, b].forEach((gl) => {
              track(
                gl.el.animate(
                  [
                    { offset: 0, transform: glyphTransform(gl, a, b, 0) },
                    ...us.map((u) => ({ offset: u, transform: glyphTransform(gl, a, b, morphAt(u, win)) })),
                    { offset: 1, transform: glyphTransform(gl, a, b, 1) },
                  ],
                  timing,
                ),
              );
            });
          });
        }
        // The credits' capitals, then the page's letters (one instant, in
        // the middle of the turn), then the word itself (the turn done).
        step(source.box, 1, LANDING_A.sourceOut[0], 0, timing);
        track(
          target.box.animate(
            [
              { offset: 0, opacity: 0 },
              { offset: LANDING_A.targetIn[0], opacity: 0 },
              { offset: LANDING_A.targetIn[1], opacity: 1 },
              { offset: LANDING_A.plain, opacity: 1 },
              { offset: LANDING_A.plain, opacity: 0 },
              { offset: 1, opacity: 0 },
            ],
            timing,
          ),
        );
        step(word.box, 0, LANDING_A.plain, 1, timing);
      });

      // His name sets off as the title draws it — its own letters, moved as
      // one on the name's flight (the clones' map, from where the title
      // stands) — and is handed to its clones in mid-air (LANDING_A.
      // nameSwap, at speed): a clone is drawn in a layer of its own, whose
      // text sits up to a pixel off the title's (measured: 1 px at 1728 ×
      // 1000), so the hand-over at rest ticked the name down as it left.
      // Every other word is handed to its clone as it sets off.
      const lead = placed.find((f) => f.same);
      if (lead) {
        const O: Vec2 = origin;
        const from: Vec2 = [lead.to[0] + lead.flight.dx, lead.to[1] + lead.flight.dy];
        titleLetters.style.transformOrigin = '0px 0px';
        track(
          titleLetters.animate(
            flightPath(lead.flight).map((k) => {
              const sigma = k.s / lead.flight.k;
              const tx = (1 - sigma) * (from[0] - O[0]) + k.x - lead.flight.dx;
              const ty = (1 - sigma) * (from[1] - O[1]) + k.y - lead.flight.dy;
              return { offset: k.offset, transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${sigma.toFixed(5)})` };
            }),
            { duration: ms(lead.flight.duration), delay: ms(lead.flight.delay), fill: 'both', easing: 'linear' },
          ),
        );
        cut(titleLetters, 1, 0, lead.flight.delay + LANDING_A.nameSwap * lead.flight.duration);
      }
      placed.forEach(({ wrap, src, same, flight }) => {
        const at = flight.delay + (same ? LANDING_A.nameSwap * flight.duration : 0);
        cut(wrap, 0, 1, at);
        if (!same) cut(src, 1, 0, at);
      });

      if (seekParam != null) return;
      // The page's moments, on the landing's clock.
      const wait = Math.max(0, startAt - nowMs());
      later(() => {
        html.dataset.reel = 'landed';
      }, wait + ms(LANDING_A.rest));
      // Home (every word landed, the dark gone): the page's own words take
      // over under the clones, which dissolve into them — the same word at
      // the same place, so no frame changes — and are then let go.
      const home = landingAHome(others);
      later(() => {
        html.removeAttribute('data-open-fly');
        placed.forEach(({ wrap }) => {
          landAnims.push(wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms(LANDING_A.settle), fill: 'forwards', easing: 'linear' }));
        });
        unlock();
        detachInput();
      }, wait + ms(home));
      later(() => {
        flightLayer.replaceChildren();
      }, wait + ms(home + LANDING_A.settle));
      later(finish, wait + ms(Math.max(LANDING_A.done, home + LANDING_A.settle)));
    }

    // ── Go: the fonts first, then the clock ──
    const begin = () => {
      if (disposed || phase !== 'wait') return;
      measuredWithFonts = fontsReady();
      geo = layout();
      // The landing, laid now too, with the film's own measuring: the title
      // stands still before any of the film's keyframes moves it.
      titleRead = readTitle();
      landing = planLanding(titleRead, readCover());
      const canvas = q<HTMLCanvasElement>('[data-burn]')!;
      if (!burn) burn = makeBurn(canvas);
      burn?.resize(geo.W, geo.H);
      burn?.draw(null);
      // Measured on this frame; the keyframes laid on the next, to take
      // effect a few frames on (the proof holding meanwhile, its lights
      // the stylesheet's): the frame that lays them is never one the
      // film's time is spent on, and nothing is re-timed once laid.
      requestAnimationFrame(() => {
        if (disposed || phase !== 'wait') return;
        phase = 'film';
        overlay.setAttribute('data-clock', '');
        const proof = proofAnims();
        if (pendingSkip) {
          // Skipped before the clock: to the title's tail (the proof never
          // counted; what it printed is let go under the end title).
          hurried = true;
          t0 = nowMs() + CLOCK_LEAD_MS - (plan.length - FF_TAIL);
          proof.forEach((a) => a.finish());
          plates?.hold();
          plates?.anims.forEach((a) => a.finish());
        } else {
          // The clock is the proof's: film 0 on its sixth grid, counted from
          // its first frame — laid a hair ahead, so each beat is taken on its
          // own frame (GRID_HAIR_MS). The plates printed (the head script's):
          // the page on the first sixth the keyframes can make, never sooner
          // than a sixth after the word (pageStart), their beats kept. None
          // printed: the lime on the first beat the keyframes can make, the
          // word and the page each a sixth on (filmStart).
          const ready = nowMs() + CLOCK_LEAD_MS;
          const lime = plates?.lime ?? null;
          if (lime != null) {
            const page = pageStart(lime, ready);
            t0 = page - GRID_HAIR_MS;
            limeAt = lime - page;
          } else {
            const starts = proof.map((a) => a.startTime).filter((s) => s != null).map(Number);
            const origin = starts.length ? Math.min(...starts) : proof.length ? nowMs() : null;
            t0 = filmStart(seekParam != null ? null : origin, ready) - GRID_HAIR_MS;
            limeAt = plan.prelude.lime;
          }
        }
        build();
        if (!pendingSkip && seekParam == null) {
          // Laid: the clock never starts before its keyframes are in. Where
          // laying them took longer than the lead (a slow phone: the page's
          // first sixth was spent before its page was there), the page goes
          // to the first later sixth of the same grid — the proof holds a
          // beat longer, as on any slow load.
          const late = nowMs() + CLOCK_LEAD_MS - (t0 + GRID_HAIR_MS);
          if (late > 0) {
            const shift = Math.ceil(late / CUT_MS - 1e-6) * CUT_MS;
            shiftAll(shift);
            if (plates?.lime != null) limeAt -= shift;
          }
          // One still pending (no frame drawn yet) joins the film's clock.
          proof.forEach((a) => {
            if (a.startTime == null) a.startTime = t0 - PRELUDE_MS;
          });
        }
        schedule();
        if (seekParam != null) {
          seek(seekParam);
          return;
        }
        burnRaf = requestAnimationFrame(burnLoop);
      });
    };

    // A verification hook (?filmT=<ms>): the film held still at any time
    // (−PRELUDE_MS … 0: the proof).
    const seek = (t: number) => {
      if (!geo) return;
      // Its own list: a window already played is no longer among the
      // elements' animations, and a seek back must find it.
      const film = filmAnims;
      film.forEach((a) => {
        a.pause();
        a.currentTime = Math.min(t, plan.length + 39);
      });
      // The proof's lights (the stylesheet's, from its first frame, a
      // PRELUDE_MS before film 0): ?filmT=-500 is the first paint.
      proofAnims().forEach((a) => {
        a.pause();
        a.currentTime = Math.max(0, t + PRELUDE_MS);
      });
      drawnFrame = -2;
      drawBurn(t);
      if (t >= plan.length) {
        if (phase === 'film') startLanding();
        const lt = t - plan.length;
        landAnims.forEach((a) => {
          a.pause();
          a.currentTime = lt;
        });
        html.dataset.reel = lt >= LANDING_A.rest ? 'landed' : 'flight';
      }
    };
    if (seekParam != null) {
      (window as Window & { __filmSeek?: (t: number) => void; __filmPlan?: FilmPlan }).__filmSeek = seek;
      (window as Window & { __filmPlan?: FilmPlan }).__filmPlan = plan;
      cleanups.push(() => {
        delete (window as Window & { __filmSeek?: unknown }).__filmSeek;
      });
    }

    // Measure again and rebuild on the same clock (a resize; a face that
    // came after the clock started): across the phone line, the other plan,
    // from the same time.
    const refit = () => {
      if (disposed || phase !== 'film') return;
      const next = layoutOf();
      const t = filmTime();
      if (next !== plan.layout) {
        plan = filmPlan(next);
        const to = Math.min(t, plan.length - FF_TAIL);
        t0 += t - to;
      }
      // The film's keyframes off while it is measured (laid again at once,
      // below, in the same task: no frame is drawn between), so the end
      // title is read standing still, as it will stand formed.
      filmAnims.forEach((a) => a.cancel());
      geo = layout();
      titleRead = readTitle();
      landing = planLanding(titleRead, readCover());
      burn?.resize(geo.W, geo.H);
      drawnFrame = -2;
      build();
      schedule();
      if (seekParam != null) seek(t);
    };

    // The fonts, before the clock starts — at most FONT_WAIT_MS (the proof
    // is on screen meanwhile, its lights going down from the first paint
    // and its plates printed by the head script): never longer, whatever
    // the network; a face that lands after the clock has started has every
    // word measured again, once, on the same clock. The proof's word's own
    // face is the head script's to wait for (at most PROOF_FACE_WAIT_MS from
    // the proof's first frame, while the proof holds, never in a stand-in
    // face while it can still come). His photographs are never waited for:
    // they load behind the film (each sized for its part) and are decoded
    // ahead of the page that shows them; one not in yet shows its print's
    // paper.
    let measuredWithFonts = false;
    const fontsReady = () => FONT_LOADS.every((f) => document.fonts?.check(f, FONT_SAMPLE) ?? true);
    const fontsLoad = Promise.all(FONT_LOADS.map((f) => document.fonts?.load(f, FONT_SAMPLE) ?? Promise.resolve([])))
      .then(() => document.fonts?.ready)
      .catch(() => undefined);
    fontsLoad.then(() => {
      if (disposed || phase !== 'film' || measuredWithFonts) return;
      measuredWithFonts = true;
      refit();
    });
    const fontsIn = Promise.race([fontsLoad, new Promise((resolve) => window.setTimeout(resolve, seekParam != null ? 6000 : FONT_WAIT_MS))]);
    qa<HTMLImageElement>('img[data-pic]').forEach((img) => {
      const decode = () => img.decode?.().catch(() => undefined);
      if (img.complete) decode();
      else img.addEventListener('load', decode, { once: true });
    });
    const whenVisible = () =>
      new Promise<void>((resolve) => {
        if (document.visibilityState !== 'hidden') {
          resolve();
          return;
        }
        const on = () => {
          if (document.visibilityState === 'hidden') return;
          document.removeEventListener('visibilitychange', on);
          resolve();
        };
        document.addEventListener('visibilitychange', on);
        cleanups.push(() => document.removeEventListener('visibilitychange', on));
      });
    // The clock waits for the fonts and for the plates to be printed (or
    // given up) — a tap on the Skip pill for neither: its end title at once.
    Promise.race([Promise.all([fontsIn, plates?.decided]), skipped]).then(whenVisible).then(() => {
      // A frame: the fonts' first layout is in before anything is read.
      requestAnimationFrame(begin);
    });

    // A resize: measure again and rebuild on the same clock.
    let refitTimer = 0;
    const onResize = () => {
      window.clearTimeout(refitTimer);
      refitTimer = window.setTimeout(refit, 160);
    };
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      disposed = true;
      clearTimers();
      detachInput();
      unlock();
      cleanups.forEach((fn) => fn());
      window.clearTimeout(refitTimer);
      window.removeEventListener('resize', onResize);
      if (burnRaf) cancelAnimationFrame(burnRaf);
      filmAnims.forEach((a) => a.cancel());
      landAnims.forEach((a) => a.cancel());
      burn?.dispose();
      unwatchCover();
      flightLayer.replaceChildren();
      html.removeAttribute('data-opening');
      html.removeAttribute('data-open-fly');
      if (html.dataset.reel === 'reel' || html.dataset.reel === 'flight') html.dataset.reel = 'page';
      window.__archiveOpening = undefined;
    };
  }, []);

  return (
    <>
      <div ref={rootRef} className="opening" aria-hidden="true">
        <div className="of-stage" data-stage>
          <OpeningScenes pictures={pictures} />
        </div>
        <div className="of-flight" data-flight />
      </div>
      <button ref={skipRef} type="button" className="of-skip" aria-label={say('film.skipAria')}>
        <T k="film.skip" />
        <span aria-hidden="true">&rarr;</span>
      </button>
    </>
  );
}
