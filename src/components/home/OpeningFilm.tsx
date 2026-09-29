import { useEffect, useRef } from 'react';
import OpeningScenes from './OpeningScenes';
import {
  ANCHOR,
  BURN,
  BURN_HOLE,
  BURN_RAMP,
  BURN_STOPS,
  COMPOSITIONS,
  DRIFT_VEC,
  FF_RATE,
  FF_TAIL,
  FIND,
  FLY_ORDER,
  FONT_LOADS,
  FONT_SAMPLE,
  FONT_WAIT_MS,
  FOUND_RANGE,
  FOUND_WORD,
  GLIDE_EASE,
  INPUT_POLICY,
  LANDING_A,
  LANDING_TARGETS,
  MATERIALS,
  OPENING_EVENT,
  PHONE_MAX_WIDTH,
  PUSH_DIR,
  STILL,
  TITLE,
  TYPED,
  anchorCap,
  burnDarkness,
  burnFrame,
  burnFrameAt,
  burnFrameStart,
  burnRadius,
  burnSepia,
  clamp01,
  fastForwardTarget,
  filmPlan,
  flightFor,
  flightPath,
  frameAt,
  globeReleaseAt,
  keyBox,
  landingAEnd,
  lerp,
  morphScales,
  sampleCurve,
  seeded,
  segment,
  type Box,
  type FilmInput,
  type FilmLayout,
  type FilmPlan,
  type OpeningDetail,
  type OpeningState,
  type Vec2,
} from '../../lib/openingFilm';
import { markReelSeen } from '../../lib/reelVisit';
import { EASE } from '../../lib/motion';

const bezier = ([a, b, c, d]: readonly number[]) => `cubic-bezier(${a}, ${b}, ${c}, ${d})`;
const FADE_CSS = bezier(EASE.fade);
const ARRIVE_CSS = bezier(EASE.arrive);
const GLIDE_CSS = bezier(GLIDE_EASE);
// The two faces' shared width across a morph: one curve for both.
const MORPH_EASE = 'cubic-bezier(0.45, 0, 0.55, 1)';
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

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
    col = over(col, ${glColor('#171B15')}, smoothstep(r, r - 0.9, d) * 0.5);
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
  draw: (u: { frame: number; origin: Vec2; radius: number; flick: number; dark: number; scratch: [number, number, number, number] } | null) => void;
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
  const u = { res: U('u_res'), px: U('u_px'), origin: U('u_origin'), frame: U('u_frame'), radius: U('u_radius'), flick: U('u_flick'), dark: U('u_dark'), scratch: U('u_scratch') };
  let ratio = 1;
  return {
    resize(w, h) {
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      gl!.viewport(0, 0, canvas.width, canvas.height);
    },
    draw(v) {
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
      g.uniform4f(u.scratch, ...v.scratch);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl!.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
/** Burn frame f's scratches: one or two, light and dark, seeded. */
function scratchOf(f: number): [number, number, number, number] {
  if (f >= BURN.out[0]) return [-1, -1, 0, 0];
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
 * markup is its first frame: a dark CRT and a blinking cursor). The island
 * loads every face the film sets, measures the words, and only then starts
 * the clock: the whole film is WAAPI on transform and opacity from that one
 * start (the compositor plays it, so the page's hydration and the map's
 * start-up behind it cannot stutter it), plus the burn's canvas, drawn on
 * the same clock a 24th of a second at a time. The page's scroll is held
 * (body overflow: clip, set by a stylesheet rule on html[data-film-lock]) and
 * the page under the film is inert; only the Skip pill skips — to the end
 * title and a hurried landing. Tab stays on the pill.
 *
 * It plays once a tab session (src/lib/reelVisit.ts decides before the first
 * paint: html[data-opening] present means it plays). `?filmT=<ms>` (a
 * verification hook, never linked) holds the film still at that time and
 * exposes window.__filmSeek.
 */
export default function OpeningFilm() {
  const rootRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const overlayEl = rootRef.current;
    const skipEl = skipRef.current;
    const html = document.documentElement;
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

    const finish = () => {
      if (phase === 'done') return;
      phase = 'done';
      clearTimers();
      detachInput();
      unlock();
      markSeen();
      html.removeAttribute('data-opening');
      html.removeAttribute('data-open-fly');
      skip.classList.remove('is-gone');
      state = 'page';
      globe = true;
      publish();
      if (burnRaf) cancelAnimationFrame(burnRaf);
      burnRaf = 0;
      overlay.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      flightLayer.replaceChildren();
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
      later(fade, STILL.hold);
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
    const layoutOf = (): FilmLayout => (overlay.clientWidth <= PHONE_MAX_WIDTH ? 'phone' : 'desktop');
    let plan: FilmPlan = filmPlan(layoutOf());
    let t0 = nowMs();
    const filmTime = () => nowMs() - t0;
    // Skip pressed while the fonts were still coming: start at the tail.
    let pendingSkip = false;

    // ── Layout: every word measured and placed, once, before the clock ──
    interface Geometry {
      W: number;
      H: number;
      /** Act 1: the line's left, its baseline, its advance, its size, the
       *  typed word's x-height. */
      line: { left: number; top: number; baseline: number; adv: number; size: number; width: number; xr: number; foundCx: number };
      /** The anchor. */
      cap: number;
      cx: number;
      cy: number;
      blocks: Box[];
      /** Act 2: the found word's two faces. */
      find: { k0: number; T0: Vec2; Wm: number; Ws: number; pad: number; clip: Box };
      /** Acts 5–6: the title's two faces. */
      title: { k5: number; Wm: number; Ws: number; adv: number; pen: number; revealW: number; origin: Vec2 };
      burnOrigin: Vec2;
    }
    let geo: Geometry | null = null;

    const layout = (): Geometry => {
      const W = overlay.clientWidth;
      const H = overlay.clientHeight;
      const short = Math.min(W, H);
      const phoneLayout = plan.layout === 'phone';

      // Act 1: the typed line (the CRT's copy stands for all four).
      const lineEl = q('[data-mat="crt"] [data-line]')!;
      const typed = q('[data-mat="crt"] [data-typed]')!;
      const lineRect = lineEl.getBoundingClientRect();
      const lineInk = inkOf(typed, TYPED);
      const size = lineInk.size;
      const width = typed.offsetWidth;
      const adv = width / TYPED.length;
      const baseline = lineRect.top + baselineIn(typed);
      const found = inkOf(typed, FOUND_WORD);
      const foundPen = lineRect.left + FOUND_RANGE[0] * adv;
      const foundCx = foundPen + (found.right - found.left) / 2;
      const xr = lineInk.xh / size;

      // The anchor: one cap height for every cut, the widest word fitting.
      const keys = qa<HTMLElement>('[data-key]');
      const used = new Set(plan.cuts.map((c) => c.index));
      const perCap = keys.map((key, i) => {
        const word = q('[data-word]', key)!;
        word.style.fontSize = '100px';
        const ink = inkOf(word, COMPOSITIONS[i].word);
        return { word, ink, perCap: (ink.left + ink.right) / Math.max(1, ink.cap), capRatio: ink.cap / 100 };
      });
      const widest = Math.max(...perCap.filter((_, i) => used.has(i)).map((p) => p.perCap));
      const cap = anchorCap(W, H, widest, plan.layout);
      const blocks: Box[] = [];
      keys.forEach((key, i) => {
        const { word, capRatio } = perCap[i];
        word.style.fontSize = px(cap / Math.max(0.01, capRatio));
        const ink = inkOf(word, COMPOSITIONS[i].word);
        const inkW = ink.left + ink.right;
        const kb = keyBox(W, H, cap, inkW);
        const block = q('[data-block]', key)!;
        block.style.left = px(kb.block.x);
        block.style.top = px(kb.block.y);
        block.style.width = px(kb.block.w);
        block.style.height = px(kb.block.h);
        word.style.left = px(kb.inkX + ink.left);
        word.style.top = '0px';
        word.style.top = px(kb.baseline - baselineIn(word));
        word.style.transformOrigin = `${(kb.cx - (kb.inkX + ink.left)).toFixed(2)}px 50%`;
        blocks.push(kb.block);
        key.style.transformOrigin = `${kb.cx.toFixed(2)}px ${kb.cy.toFixed(2)}px`;
        // The page round it knows where the block is.
        const cut = q(`[data-cut="${i}"]`);
        if (cut) {
          cut.style.setProperty('--bl', px(kb.block.x));
          cut.style.setProperty('--br', px(kb.block.x + kb.block.w));
          cut.style.setProperty('--bt', px(kb.block.y));
          cut.style.setProperty('--bb', px(kb.block.y + kb.block.h));
        }
      });
      const cx = ANCHOR.x * W;
      const cy = ANCHOR.y * H;
      const pad = cap * ANCHOR.pad;

      // Act 2: the found word's typewriter face, in the anchor's frame, its
      // x-height the anchor's cap height, on the same baseline and centre.
      const key0 = keys[0];
      const from = q('[data-from]', key0)!;
      const serif = perCap[0].word;
      const serifInk = inkOf(serif, COMPOSITIONS[0].word);
      const Ws = serifInk.left + serifInk.right;
      const Fm = cap / Math.max(0.05, xr);
      from.style.fontSize = px(Fm);
      const fromInk = inkOf(from, FOUND_WORD);
      const Wm = fromInk.left + fromInk.right;
      const kb0 = keyBox(W, H, cap, Ws);
      const fromLeft = cx - Wm / 2 + fromInk.left;
      from.style.left = px(fromLeft);
      from.style.top = '0px';
      from.style.top = px(kb0.baseline - baselineIn(from));
      from.style.transformOrigin = `${(cx - fromLeft).toFixed(2)}px 50%`;
      const k0 = size / Fm;
      const T0: Vec2 = [foundCx - cx, baseline - (size * xr) / 2 - cy];
      // The marker's clip: round both the start's block and the end's.
      const bh = cap * ANCHOR.block;
      const clipL = cx - Math.max(Wm, Ws) / 2 - pad - 24;
      const clipR = cx + Math.max(Wm, Ws) / 2 + pad + 24;
      const clip: Box = { x: clipL, y: cy - bh * 1.6, w: clipR - clipL, h: bh * 3.2 };
      const clipEl = q('[data-clip]', key0)!;
      const clipIn = q('[data-clip-in]', key0)!;
      clipEl.style.left = px(clip.x);
      clipEl.style.top = px(clip.y);
      clipEl.style.width = px(clip.w);
      clipEl.style.height = px(clip.h);
      clipIn.style.left = px(-clip.x);
      clipIn.style.top = px(-clip.y);

      // Act 3's pages: the giant words, set on the short side and placed on
      // their baselines.
      qa<HTMLElement>('[data-cut]').forEach((cutEl) => {
        const c = COMPOSITIONS[Number(cutEl.dataset.cut)];
        qa<HTMLElement>('[data-giant]', cutEl).forEach((g, k) => {
          const spec = c.giants[k];
          const word = q('[data-giant-word]', g)!;
          g.style.fontSize = '100px';
          const ink = inkOf(word, spec.text);
          const fontPx = (spec.cap * short) / Math.max(0.01, ink.cap / 100);
          g.style.fontSize = px(fontPx);
          const w = word.offsetWidth;
          const left = spec.align === 'l' ? spec.x * W : spec.align === 'r' ? spec.x * W - w : spec.x * W - w / 2;
          g.style.left = px(left);
          g.style.top = '0px';
          g.style.top = px(spec.y * H + (spec.yCap ?? 0) * spec.cap * short - baselineIn(word));
        });
      });

      // Acts 5–6: the title (in flow) and the typed line turned into it.
      const titleUnit = q('[data-title]')!;
      const name = q('[data-title-to]')!;
      const mono = q('[data-title-from]')!;
      const reveal = mono.closest<HTMLElement>('[data-reveal]')!;
      const nameInk = inkOf(name, 'Ryan Xu');
      const nameBase = name.offsetTop + baselineIn(name);
      const nameLeft = name.offsetLeft;
      const Ws5 = nameInk.left + nameInk.right;
      const inkCx = nameLeft + (nameInk.right - nameInk.left) / 2;
      const xh5 = nameInk.xh;
      const origin: Vec2 = [inkCx, nameBase - xh5 / 2];
      titleUnit.style.transformOrigin = `${origin[0].toFixed(2)}px ${origin[1].toFixed(2)}px`;
      name.style.transformOrigin = `${(inkCx - nameLeft).toFixed(2)}px 50%`;
      const Fm5 = xh5 / Math.max(0.05, xr);
      mono.style.fontSize = px(Fm5);
      const monoInk = inkOf(mono, 'ryan xu');
      const Wm5 = monoInk.left + monoInk.right;
      const adv5 = mono.offsetWidth / 'ryan xu'.length;
      const pen = inkCx - Wm5 / 2 + monoInk.left;
      const padR = 12;
      reveal.style.left = px(pen - padR);
      reveal.style.top = '0px';
      reveal.style.top = px(nameBase - baselineIn(mono) - padR);
      mono.style.transformOrigin = `${(inkCx - pen).toFixed(2)}px 50%`;
      const cursor = q('[data-title-cursor]')!;
      const capM = monoInk.cap;
      cursor.style.left = px(pen);
      cursor.style.top = px(nameBase - capM - Fm5 * 0.1);
      cursor.style.width = px(adv5 * 0.86);
      cursor.style.height = px(capM + Fm5 * 0.2);
      const typedPx = phoneLayout ? Math.max(18, Math.min(24, W * 0.058)) : Math.max(20, Math.min(34, W * 0.018));
      const k5 = typedPx / Fm5;

      // The burn starts beside the anchor (up and to the right of its
      // middle, on the last cut's block).
      const last = blocks[plan.cuts[plan.cuts.length - 1].index];
      const burnOrigin: Vec2 = [last.x + last.w * 0.68, last.y + last.h * 0.22];

      return {
        W,
        H,
        line: { left: lineRect.left, top: lineRect.top, baseline, adv, size, width, xr, foundCx },
        cap,
        cx,
        cy,
        blocks,
        find: { k0, T0, Wm, Ws, pad, clip },
        title: { k5, Wm: Wm5, Ws: Ws5, adv: adv5, pen, revealW: mono.offsetWidth + 2 * padR, origin },
        burnOrigin,
      };
    };

    // ── Build: the whole film as keyframes on one clock ──
    const build = () => {
      filmAnims.forEach((a) => a.cancel());
      filmAnims = [];
      const g = geo!;
      const { W, H } = g;
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
      const shown = (el: Element, start: number, end: number, on: number | string = 1) => {
        const ch: [number, number | string][] = [];
        if (start > 0) ch.push([start, on]);
        if (end < total) ch.push([end, 0]);
        steps(el, 'opacity', start > 0 ? 0 : on, ch);
      };

      const acts = plan.acts;
      const f0 = acts.burn.start;
      const frameT = (f: number) => burnFrameStart(plan, f);
      const frameOut = frameT(BURN.out[1]);

      // ── Act 1: the materials, the typing, the cursor ──
      const mats = MATERIALS[plan.layout];
      qa<HTMLElement>('[data-mat]').forEach((mat) => {
        const id = mat.dataset.mat as (typeof mats)[number];
        const m = plan.materials.find((x) => x.id === id);
        if (!m) {
          play(mat, [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 0 }]);
          return;
        }
        const last = id === mats[mats.length - 1];
        shown(mat, m.start, last ? acts.find.end : m.end);
        const reveal = q('[data-reveal]', mat)!;
        const inner = q('[data-reveal-in]', reveal)!;
        const { adv, width, size } = g.line;
        // The reveal box is the line plus 1em each side: its right edge is
        // put at the n-th letter's end.
        const u = (n: number) => n * adv - width - size;
        const typing: [number, number][] = plan.typing.map((t, i) => [t, u(i + 1)]);
        typing.push([acts.find.start, 0]);
        reveals(reveal, inner, u(0), typing);
        // The cursor: its first flash, then on, riding the typing.
        const cursor = q('[data-cursor]', mat)!;
        const cur: [number, string][] = plan.typing.map((t, i) => [t, tx((i + 1) * adv)]);
        if (id === 'copy') {
          // Found: it goes with TRAVEL, pushed down and out.
          const { start, end } = plan.glide;
          const endPush = start + (end - start) * FIND.pushGone;
          const frames: Keyframe[] = [{ offset: 0, transform: tx(0) }];
          let prev = tx(0);
          cur.forEach(([t, v]) => {
            frames.push({ offset: at(t), transform: prev }, { offset: at(t), transform: v });
            prev = v;
          });
          const x = TYPED.length * adv;
          frames.push({ offset: at(start), transform: tx(x), easing: GLIDE_CSS }, { offset: at(endPush), transform: tx(x, FIND.push * H) }, { offset: 1, transform: tx(x, FIND.push * H) });
          play(cursor, frames);
          play(cursor, [
            { offset: 0, opacity: 0 },
            { offset: at(plan.cursorOn), opacity: 0 },
            { offset: at(plan.cursorOn), opacity: 1 },
            { offset: at(start), opacity: 1 },
            { offset: at(endPush), opacity: 0 },
            { offset: 1, opacity: 0 },
          ]);
        } else {
          steps(cursor, 'transform', tx(0), cur);
          steps(cursor, 'opacity', 0, [[plan.cursorOn, 1]]);
        }
        if (id === 'copy') {
          // The rest of the line is pushed away as the word lifts off it.
          const { start, end } = plan.glide;
          const endPush = start + (end - start) * FIND.pushGone;
          qa<HTMLElement>('[data-word]', mat).forEach((w) => {
            const word = w.dataset.word!;
            if (word === 'archive') {
              play(w, [
                { offset: 0, opacity: 1 },
                { offset: at(start), opacity: 1, easing: FADE_CSS },
                { offset: at(start + 90), opacity: 0 },
                { offset: 1, opacity: 0 },
              ]);
              return;
            }
            const dy = (PUSH_DIR[word] ?? 1) * FIND.push * H;
            play(w, [
              { offset: 0, transform: tx(0) },
              { offset: at(start), transform: tx(0), easing: GLIDE_CSS },
              { offset: at(endPush), transform: tx(0, dy) },
              { offset: 1, transform: tx(0, dy) },
            ]);
            play(w, [
              { offset: 0, opacity: 1 },
              { offset: at(start), opacity: 1 },
              { offset: at(endPush), opacity: 0 },
              { offset: 1, opacity: 0 },
            ]);
          });
        }
      });

      // ── Act 2: the marker, the glide, the morph (key 0) ──
      const key0 = q('[data-key="0"]')!;
      {
        const { k0, T0, Wm, Ws, pad, clip } = g.find;
        const { sweep, glide } = plan;
        const clipEl = q('[data-clip]', key0)!;
        const clipIn = q('[data-clip-in]', key0)!;
        const cx = g.cx;
        // The marker: its window's right edge from the start block's left
        // to its right, then open.
        const bmL = cx - Wm / 2 - pad;
        const bmR = cx + Wm / 2 + pad;
        const clipRight = clip.x + clip.w;
        const uA = bmL - clipRight;
        const uB = bmR - clipRight;
        play(clipEl, [
          { offset: 0, transform: tx(uA) },
          { offset: at(sweep.start), transform: tx(uA) },
          { offset: at(sweep.end), transform: tx(uB) },
          { offset: at(sweep.end), transform: tx(0) },
          { offset: 1, transform: tx(0) },
        ]);
        play(clipIn, [
          { offset: 0, transform: tx(-uA) },
          { offset: at(sweep.start), transform: tx(-uA) },
          { offset: at(sweep.end), transform: tx(-uB) },
          { offset: at(sweep.end), transform: tx(0) },
          { offset: 1, transform: tx(0) },
        ]);
        // The glide: from the line's word to the anchor, growing to it.
        const samples = sampleCurve(GLIDE_EASE, 16);
        const dur = glide.end - glide.start;
        const unit = (e: number) => `translate3d(${(T0[0] * (1 - e)).toFixed(2)}px, ${(T0[1] * (1 - e)).toFixed(2)}px, 0) scale(${(k0 + (1 - k0) * e).toFixed(5)})`;
        play(key0, [
          { offset: 0, transform: unit(0) },
          ...samples.map(({ u, e }) => ({ offset: at(glide.start + dur * u), transform: unit(e) })),
          { offset: 1, transform: unit(1) },
        ]);
        // One ink width for both faces (the block with them), and one
        // crossfade window.
        const width = (u: number) => lerp(Wm, Ws, smooth(segment(u, FIND.morph[0], FIND.morph[1])));
        const block = q('[data-block]', key0)!;
        const from = q('[data-from]', key0)!;
        const to = q('[data-word]', key0)!;
        const ws = samples.map(({ u }) => ({ t: glide.start + dur * u, w: width(u) }));
        const sx = (v: number) => `scaleX(${v.toFixed(5)})`;
        play(block, [{ offset: 0, transform: sx((Wm + 2 * pad) / (Ws + 2 * pad)) }, ...ws.map(({ t, w }) => ({ offset: at(t), transform: sx((w + 2 * pad) / (Ws + 2 * pad)) })), { offset: 1, transform: sx(1) }]);
        play(from, [{ offset: 0, transform: sx(1) }, ...ws.map(({ t, w }) => ({ offset: at(t), transform: sx(w / Wm) })), { offset: 1, transform: sx(Ws / Wm) }]);
        play(to, [{ offset: 0, transform: sx(Wm / Ws) }, ...ws.map(({ t, w }) => ({ offset: at(t), transform: sx(w / Ws) })), { offset: 1, transform: sx(1) }]);
        const [s0, s1] = FIND.swap;
        play(from, [
          { offset: 0, opacity: 1 },
          { offset: at(glide.start + dur * s0), opacity: 1 },
          { offset: at(glide.start + dur * s1), opacity: 0 },
          { offset: 1, opacity: 0 },
        ]);
        play(to, [
          { offset: 0, opacity: 0 },
          { offset: at(glide.start + dur * s0), opacity: 0 },
          { offset: at(glide.start + dur * s1), opacity: 1 },
          { offset: 1, opacity: 1 },
        ]);
      }

      // ── Act 3: the paper, the pages, the anchor ──
      const lastCut = plan.cuts[plan.cuts.length - 1];
      [q('[data-paper]'), q('[data-soft]'), q('[data-grain]'), q('[data-vignette]')].forEach((el) => el && shown(el, acts.cuts.start, frameOut));
      const used = new Map(plan.cuts.map((c, k) => [c.index, k]));
      qa<HTMLElement>('[data-cut]').forEach((cutEl) => {
        const index = Number(cutEl.dataset.cut);
        const k = used.get(index);
        const key = q(`[data-key="${index}"]`)!;
        if (k == null) {
          play(cutEl, [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 0 }]);
          play(key, [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 0 }]);
          return;
        }
        const cut = plan.cuts[k];
        const isLast = k === plan.cuts.length - 1;
        const end = isLast ? frameOut : cut.end;
        shown(cutEl, cut.start, end);
        shown(key, index === 0 ? plan.sweep.start : cut.start, end);
        // The giant words drift, the whole cut, one way (their copies ride
        // with them); the last runs on into the burn a 24th at a time.
        const c = COMPOSITIONS[index];
        const [dx, dy] = DRIFT_VEC[c.drift];
        const v = c.driftPx / (cut.end - cut.start);
        const pos = (t: number) => {
          const d = -c.driftPx / 2 + v * (t - cut.start);
          return tx(dx * d, dy * d);
        };
        qa<HTMLElement>('[data-giant]', cutEl).forEach((giant) => {
          const frames: Keyframe[] = [
            { offset: 0, transform: pos(cut.start) },
            { offset: at(cut.start), transform: pos(cut.start) },
            { offset: at(cut.end), transform: pos(cut.end) },
          ];
          if (isLast) {
            let prev = pos(cut.end);
            for (let f = 1; f < BURN.out[0]; f += 1) {
              const t = frameT(f);
              frames.push({ offset: at(t), transform: prev }, { offset: at(t), transform: pos(t) });
              prev = pos(t);
            }
            frames.push({ offset: 1, transform: prev });
          } else frames.push({ offset: 1, transform: pos(cut.end) });
          play(giant, frames);
        });
      });

      // ── Act 4: the burn ──
      // The frame: its gate weave, the slip, the slide out (held a frame).
      const frameEl = q('[data-frame]')!;
      const tanSlide = Math.tan((BURN.slideDeg * Math.PI) / 180);
      const framePose = (f: number) => {
        const p = frameAt(f);
        const slant = f >= BURN.out[0] ? p.y * H * tanSlide : 0;
        return `translate3d(${(p.x + slant).toFixed(2)}px, ${(p.y * H + p.weaveY).toFixed(2)}px, 0) rotate(${p.rot.toFixed(3)}deg)`;
      };
      steps(
        frameEl,
        'transform',
        'translate3d(0px, 0px, 0) rotate(0deg)',
        Array.from({ length: BURN.out[1] + 1 }, (_, f) => [frameT(f), framePose(f)] as [number, string]),
      );
      steps(q('[data-sepia]')!, 'opacity', 0, [
        ...Array.from({ length: BURN.out[1] - BURN.burn[0] }, (_, k) => [frameT(BURN.burn[0] + k), burnSepia(BURN.burn[0] + k)] as [number, number]),
        [frameOut, 0],
      ]);
      const canvas = q<HTMLCanvasElement>('[data-burn]')!;
      const veil = q('[data-veil]')!;
      if (burn) {
        shown(canvas, f0, frameOut);
        play(veil, [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 0 }]);
      } else {
        // No WebGL: no burn, but the frame still darkens and goes.
        play(canvas, [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 0 }]);
        steps(veil, 'opacity', 0, [
          ...Array.from({ length: BURN.out[1] - BURN.burn[0] }, (_, k) => [frameT(BURN.burn[0] + k), Math.max(burnRadius(BURN.burn[0] + k), burnDarkness(BURN.burn[0] + k))] as [number, number]),
          [frameOut, 0],
        ]);
      }
      shown(q('[data-burnground]')!, f0, acts.dark.start);
      // The leader: one card a frame.
      qa<HTMLElement>('[data-leader]').forEach((card, k) => {
        const f = BURN.leader[0] + k;
        shown(card, frameT(f), frameT(f + 1));
      });
      // The lit perforations climb the screen, a frame at a time, fading.
      const perfs = q('[data-perfrow]')!;
      const perfY = [0.8, 0.54, 0.29, 0.06];
      const perfO = [0.95, 0.85, 0.62, 0.34];
      steps(perfs, 'transform', tx(0, perfY[0] * H), perfY.map((y, k) => [frameT(BURN.perfs[0] + k), tx(0, y * H)] as [number, string]));
      steps(perfs, 'opacity', 0, [...perfO.map((o, k) => [frameT(BURN.perfs[0] + k), o] as [number, number]), [acts.dark.start, 0]]);

      // ── Acts 5–6: the dark, typed; the title ──
      const end = q('[data-end]')!;
      shown(end, acts.dark.start, total);
      const tg = g.title;
      const unitEl = q('[data-title]')!;
      const name = q('[data-title-to]')!;
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
      typing5.push([t6, 0]);
      reveals(reveal, inner, u5(0), typing5);
      // The lime cursor: on, riding the typing, one blink after, gone as the
      // line turns into the title.
      const cur5: [number, string][] = plan.darkTyping.map((t, i) => [t, tx((i + 1) * tg.adv)]);
      steps(cursor, 'transform', tx(0), cur5);
      play(cursor, [
        { offset: 0, opacity: 0 },
        { offset: at(acts.dark.start), opacity: 0 },
        { offset: at(acts.dark.start), opacity: 1 },
        { offset: at(plan.blink.start), opacity: 1 },
        { offset: at(plan.blink.start), opacity: 0 },
        { offset: at(plan.blink.end), opacity: 0 },
        { offset: at(plan.blink.end), opacity: 1, easing: FADE_CSS },
        { offset: at(plan.blink.end + TITLE.cursorOut), opacity: 0 },
        { offset: 1, opacity: 0 },
      ]);
      // One ink width for both faces, one crossfade window.
      const w5 = (u: number) => lerp(tg.Wm, tg.Ws, smooth(u));
      const sx = (v: number) => `scaleX(${v.toFixed(5)})`;
      play(mono, [{ offset: 0, transform: sx(1) }, ...samples.map(({ u }) => ({ offset: at(t6 + TITLE.morph * u), transform: sx(w5(u) / tg.Wm) })), { offset: 1, transform: sx(tg.Ws / tg.Wm) }]);
      play(name, [{ offset: 0, transform: sx(tg.Wm / tg.Ws) }, ...samples.map(({ u }) => ({ offset: at(t6 + TITLE.morph * u), transform: sx(w5(u) / tg.Ws) })), { offset: 1, transform: sx(1) }]);
      const [a, b] = TITLE.swap;
      play(mono, [
        { offset: 0, opacity: 1 },
        { offset: at(t6 + TITLE.morph * a), opacity: 1 },
        { offset: at(t6 + TITLE.morph * b), opacity: 0 },
        { offset: 1, opacity: 0 },
      ]);
      play(name, [
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
        scratch: scratchOf(want),
      });
    };
    // The same loop starts the landing on the frame the film reaches its
    // end (a timer stands by, and fires late on a busy main thread).
    const burnLoop = (now: number) => {
      burnRaf = 0;
      if (disposed || phase !== 'film') return;
      const t = now - t0;
      drawBurn(t);
      if (t >= plan.length) {
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
      later(markSeen, plan.acts.find.start - t);
      later(releaseGlobe, globeReleaseAt(plan) - t);
      later(startLanding, plan.length - t + 50);
    };
    const shiftAll = (delta: number) => {
      overlay.getAnimations({ subtree: true }).forEach((a) => {
        if (a.startTime != null) a.startTime = Number(a.startTime) + delta;
      });
      t0 += delta;
    };

    // The Skip pill: to the end title's tail, and a hurried landing.
    const fastForward = () => {
      if (phase === 'wait') {
        pendingSkip = true;
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
      drawBurn(target);
      schedule();
      if (!burnRaf) burnRaf = requestAnimationFrame(burnLoop);
    };
    onSkipFilm = fastForward;

    // ── Landing ──
    function startLanding() {
      if (phase !== 'film') return;
      phase = 'landing';
      markSeen();
      releaseGlobe();
      state = 'landing';
      publish();
      skip.classList.add('is-gone');
      landA();
    }

    // A: the words fly home.
    function landA() {
      const endLayer = q('[data-end]')!;
      const rate = hurried ? FF_RATE : 1;
      const ms = (v: number) => v / rate;
      const vh = window.innerHeight;
      const pairs: { src: HTMLElement; dst: HTMLElement }[] = [];
      FLY_ORDER.forEach((word) => {
        const src = endLayer.querySelector<HTMLElement>(LANDING_TARGETS[word].from);
        const dst = document.querySelector<HTMLElement>(LANDING_TARGETS[word].to);
        if (!src || !dst || !dst.getClientRects().length) return;
        // A place below the first screen is not a landing: that word stays
        // and goes with the dark.
        const r = dst.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        pairs.push({ src, dst });
      });

      overlay.classList.add('is-landing');
      html.setAttribute('data-open-fly', '');
      html.dataset.reel = 'flight';

      const flights = pairs
        .map(({ src, dst }, order) => {
          const srcRect = src.getBoundingClientRect();
          const dstBox = textBox(dst);
          if (!dstBox || !srcRect.width) return null;
          const scale = srcRect.height / Math.max(1, src.offsetHeight);
          const srcText = (src.textContent || '').replace(/\s+/g, ' ').trim();
          const srcInk = inkOf(src, srcText);
          const srcBase = baselineOf(src);
          const dstText = (dst.textContent || '').trim();
          const dstInk = inkOf(dst, dstText);
          const dstBase = baselineOf(dst);
          const from: Vec2 = [srcRect.left + (scale * (srcInk.right - srcInk.left)) / 2, srcBase - (scale * srcInk.ascent) / 2];
          const to: Vec2 = [dstBox.x + (dstInk.right - dstInk.left) / 2, dstBase - dstInk.ascent / 2];
          const flight = flightFor({ x: from[0], y: from[1], w: 0, h: 0 }, { x: to[0], y: to[1], w: 0, h: 0 }, srcInk.ascent * scale, dstInk.ascent, order);
          return { src, dst, srcText, dstText, dstBox, dstBase, scale, to, flight };
        })
        .filter(<T,>(x: T | null): x is T => x != null);

      const face = (text: string, style: CSSStyleDeclaration, size: number) => {
        const box = document.createElement('span');
        box.className = 'of-fly__face';
        const inner = document.createElement('span');
        inner.className = 'of-fly__ink';
        inner.textContent = text;
        const probe = document.createElement('i');
        probe.className = 'of-bl';
        inner.append(probe);
        box.append(inner);
        inner.style.fontFamily = style.fontFamily;
        inner.style.fontWeight = style.fontWeight;
        inner.style.fontStyle = style.fontStyle;
        inner.style.fontSize = `${size}px`;
        inner.style.letterSpacing = style.letterSpacing === 'normal' ? 'normal' : `${(parseFloat(style.letterSpacing) * size) / (parseFloat(style.fontSize) || size)}px`;
        inner.style.textTransform = style.textTransform;
        inner.style.color = style.color;
        inner.style.lineHeight = 'normal';
        inner.style.fontVariationSettings = style.fontVariationSettings;
        inner.style.fontOpticalSizing = (style as CSSStyleDeclaration & { fontOpticalSizing: string }).fontOpticalSizing;
        inner.style.fontFeatureSettings = style.fontFeatureSettings;
        inner.style.textShadow = style.textShadow;
        return { box, inner, probe };
      };

      const built = flights.map(({ src, dst, srcText, dstText, to, scale, flight }) => {
        const wrap = document.createElement('div');
        wrap.className = 'of-fly';
        wrap.style.transformOrigin = `${to[0]}px ${to[1]}px`;
        const sStyle = getComputedStyle(src);
        const source = face(srcText, sStyle, ((parseFloat(sStyle.fontSize) || 16) * scale) / flight.k);
        source.inner.style.textShadow = 'none';
        const dStyle = getComputedStyle(dst);
        const target = face(dstText, dStyle, parseFloat(dStyle.fontSize) || 16);
        wrap.append(source.box, target.box);
        flightLayer.append(wrap);
        return { wrap, source, target, srcText, dstText, flight };
      });
      const placed = built.map((b, i) => {
        const { dstBox, dstBase } = flights[i];
        const sRect = b.source.box.getBoundingClientRect();
        const sBase = b.source.probe.getBoundingClientRect().top;
        const tRect = b.target.box.getBoundingClientRect();
        const tBase = b.target.probe.getBoundingClientRect().top;
        const sInk = inkOf(b.source.inner, b.srcText);
        const tInk = inkOf(b.target.inner, b.dstText);
        const [cx, cy] = flights[i].to;
        b.target.box.style.transform = `translate3d(${(dstBox.x - tRect.left).toFixed(2)}px, ${(dstBase - tBase).toFixed(2)}px, 0)`;
        const sx = cx - (sInk.right - sInk.left) / 2 - sRect.left;
        const sy = cy + sInk.ascent / 2 - sBase;
        b.source.box.style.transform = `translate3d(${sx.toFixed(2)}px, ${sy.toFixed(2)}px, 0)`;
        b.source.inner.style.transformOrigin = `${((sInk.right - sInk.left) / 2).toFixed(2)}px 50%`;
        b.target.inner.style.transformOrigin = `${((tInk.right - tInk.left) / 2).toFixed(2)}px 50%`;
        return { ...b, morph: morphScales(sInk.left + sInk.right, tInk.left + tInk.right) };
      });

      // The title's words leave it; the dark dissolves into the page.
      flights.forEach(({ src }) => {
        src.style.visibility = 'hidden';
      });
      const track = (a: Animation) => {
        landAnims.push(a);
        return a;
      };
      track(
        endLayer.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: ms(LANDING_A.dissolve[1] - LANDING_A.dissolve[0]),
          delay: ms(LANDING_A.dissolve[0]),
          fill: 'both',
          easing: FADE_CSS,
        }),
      );

      const [m0, m1] = LANDING_A.morph;
      placed.forEach(({ wrap, source, target, flight, morph }) => {
        const timing = { duration: ms(flight.duration), delay: ms(flight.delay), fill: 'both' as FillMode, easing: 'linear' };
        track(
          wrap.animate(
            flightPath(flight).map((k) => ({
              offset: k.offset,
              transform: `translate3d(${k.x.toFixed(2)}px, ${k.y.toFixed(2)}px, 0) scale(${k.s.toFixed(4)})`,
            })),
            timing,
          ),
        );
        const widths = (from: number, to: number): Keyframe[] => [
          { offset: 0, transform: `scaleX(${from.toFixed(4)})` },
          { offset: m0, transform: `scaleX(${from.toFixed(4)})`, easing: MORPH_EASE },
          { offset: m1, transform: `scaleX(${to.toFixed(4)})` },
          { offset: 1, transform: `scaleX(${to.toFixed(4)})` },
        ];
        track(source.inner.animate(widths(morph.source[0], morph.source[1]), timing));
        track(target.inner.animate(widths(morph.target[0], morph.target[1]), timing));
        const [so, sf] = LANDING_A.sourceOut;
        const [ti, tf] = LANDING_A.targetIn;
        track(
          source.box.animate(
            [
              { offset: 0, opacity: 1 },
              { offset: so, opacity: 1 },
              { offset: sf, opacity: 0 },
              { offset: 1, opacity: 0 },
            ],
            timing,
          ),
        );
        track(
          target.box.animate(
            [
              { offset: 0, opacity: 0 },
              { offset: ti, opacity: 0 },
              { offset: tf, opacity: 1 },
              { offset: 1, opacity: 1 },
            ],
            timing,
          ),
        );
      });

      if (seekParam != null) return;
      later(() => {
        html.dataset.reel = 'landed';
      }, ms(LANDING_A.rest));
      later(() => {
        // Landed: the page's own words take over on the very frame the
        // clones go.
        html.removeAttribute('data-open-fly');
        flightLayer.replaceChildren();
        unlock();
        detachInput();
      }, ms(Math.max(landingAEnd(placed.length), LANDING_A.dissolve[1])));
      later(finish, ms(LANDING_A.done));
    }

    // ── Go: the fonts first, then the clock ──
    const begin = () => {
      if (disposed || phase !== 'wait') return;
      geo = layout();
      const canvas = q<HTMLCanvasElement>('[data-burn]')!;
      if (!burn) burn = makeBurn(canvas);
      burn?.resize(geo.W, geo.H);
      burn?.draw(null);
      phase = 'film';
      t0 = nowMs();
      if (pendingSkip) {
        hurried = true;
        t0 -= plan.length - FF_TAIL;
      }
      build();
      schedule();
      if (seekParam != null) {
        seek(seekParam);
        return;
      }
      burnRaf = requestAnimationFrame(burnLoop);
    };

    // A verification hook (?filmT=<ms>): the film held still at any time.
    const seek = (t: number) => {
      if (!geo) return;
      const film = overlay.getAnimations({ subtree: true }).filter((a) => !landAnims.includes(a));
      film.forEach((a) => {
        a.pause();
        a.currentTime = Math.min(t, plan.length + 39);
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

    const fontsIn = Promise.race([
      Promise.all(FONT_LOADS.map((f) => document.fonts?.load(f, FONT_SAMPLE) ?? Promise.resolve([]))).then(() => document.fonts?.ready),
      new Promise((resolve) => window.setTimeout(resolve, FONT_WAIT_MS)),
    ]).catch(() => undefined);
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
    fontsIn.then(whenVisible).then(() => {
      // Two frames: the fonts' first layout is in before anything is read.
      requestAnimationFrame(() => requestAnimationFrame(begin));
    });

    // A resize: measure again and rebuild on the same clock (across the
    // phone line, the other plan, from the same time).
    let refit = 0;
    const onResize = () => {
      window.clearTimeout(refit);
      refit = window.setTimeout(() => {
        if (disposed || phase !== 'film') return;
        const next = layoutOf();
        const t = filmTime();
        if (next !== plan.layout) {
          plan = filmPlan(next);
          const to = Math.min(t, plan.length - FF_TAIL);
          t0 += t - to;
        }
        geo = layout();
        burn?.resize(geo.W, geo.H);
        drawnFrame = -2;
        build();
        schedule();
      }, 160);
    };
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      disposed = true;
      clearTimers();
      detachInput();
      unlock();
      cleanups.forEach((fn) => fn());
      window.clearTimeout(refit);
      window.removeEventListener('resize', onResize);
      if (burnRaf) cancelAnimationFrame(burnRaf);
      filmAnims.forEach((a) => a.cancel());
      landAnims.forEach((a) => a.cancel());
      burn?.dispose();
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
          <OpeningScenes />
        </div>
        <div className="of-flight" data-flight />
      </div>
      <button ref={skipRef} type="button" className="of-skip" aria-label="Skip the opening film">
        Skip
        <span aria-hidden="true">&rarr;</span>
      </button>
    </>
  );
}
