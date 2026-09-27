// ── The globe eggs' photograph: the shutter, the long exposure, the burn, the dodge ──
// Two custom layers on the prologue globe (RouteAtlas adds them; GlobeEggs
// drives them through the GlobeChannel):
//  • `egg-exposure`, directly under `planet-light`, works on the UNLIT silver
//    print, so the key light, the air and the glint draw over it sharp and
//    still — a real lamp over a spinning desk globe. It captures the print
//    (a blit of the disc's box) and either smears it along the globe's own
//    rotation (a fling, shot at 1/30 s) or folds every frame into a
//    time-weighted mean (BULB: a real long exposure), then composites it back
//    over the disc, stopping just short of the limb. After release the
//    frozen exposure develops back into the live print, dark tones first. It
//    also carries the darkroom dodge on a landed place: one multiply that
//    lifts the print under a gaussian pool and holds the rest a little down.
//  • `egg-burn`, on top of the stack, lays his six places down as light: a
//    core, a halation halo and a wide bloom deposited along the path each
//    place swept that frame (the burn is written by `egg-exposure`, where all
//    the framebuffer switches happen), shown through a film toe so a place
//    crossing fast leaves nothing — no lines, no rings. It also reads the
//    finished exposure back once, for the BULB ticket's print.
// At rest (no spin, no exposure, no pool) both return before a single GL call.
// Render targets are allocated only while `channel.warm` (a hand is near) and
// dropped when it is not. Geometry is camera maths only (the same private
// transform fields planetOnScreen reads), never a layout read.
import type { CustomLayerInterface, Map as MapboxMap } from 'mapbox-gl';
import type { GlobeChannel } from './globeLook';
import { EGG, blurAngle, developAt, exposureGain, horizonVisibility } from './globeEgg';

interface GlobeTransform {
  width?: number;
  height?: number;
  globeCenterInViewSpace?: ArrayLike<number>;
  globeRadius?: number;
  cameraToCenterDistance?: number;
  _pixelsPerMercatorPixel?: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// ── Pure helpers (scripts/egg-exposure.test.mjs) ──

/** A screen point on the planet (units of its limb radius, from its centre,
 *  y up) to the point on the unit sphere it shows, for a camera D globe radii
 *  from the centre (z toward the camera); null off the disc. */
export function toSphere(sx: number, sy: number, D: number): [number, number, number] | null {
  const k = Math.sqrt(D * D - 1);
  const a = sx / k;
  const b = sy / k;
  const q = a * a + b * b + 1;
  const disc = D * D - q * (D * D - 1);
  if (disc < 0) return null;
  const t = (D - Math.sqrt(disc)) / q;
  return [a * t, b * t, D - t];
}

/** The sphere point back to the screen (units of the limb radius, y up). */
export function toScreen(P: readonly [number, number, number], D: number): [number, number] {
  const k = Math.sqrt(D * D - 1);
  return [(k * P[0]) / (D - P[2]), (k * P[1]) / (D - P[2])];
}

/** Samples along a smear of `degrees` on a planet of limb radius `r` css px:
 *  one every ~2.2 px of the longest arc, never fewer than 2 or more than 48. */
export function samplesFor(degrees: number, r: number) {
  const px = r * ((degrees * Math.PI) / 180);
  return Math.max(2, Math.min(48, Math.ceil(px / 2.2)));
}

// Abramowitz–Stegun 7.1.26, the same as the shader's.
function erf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.sign(x) * y;
}

/** The light a place lays at `p` for a unit of time spent crossing from `a`
 *  to `b` (css px): a gaussian brush of `sigma` swept evenly along the
 *  segment. Consecutive segments tile exactly — two halves, each crossed in
 *  half the time, lay what the whole does — so the path has no beads. */
export function burnWeight(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number], sigma: number) {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const L = Math.hypot(bx, by);
  const dx = L > 1e-4 ? bx / L : 1;
  const dy = L > 1e-4 ? by / L : 0;
  const px = p[0] - a[0];
  const py = p[1] - a[1];
  const t = px * dx + py * dy;
  const n = -px * dy + py * dx;
  const perp = Math.exp((-n * n) / (2 * sigma * sigma));
  const k = Math.SQRT1_2 / sigma;
  const along = L > 0.02 * sigma
    ? (0.5 * (erf((L - t) * k) - erf(-t * k))) / L
    : Math.exp((-t * t) / (2 * sigma * sigma)) / (Math.sqrt(2 * Math.PI) * sigma);
  return perp * along;
}

/** The film's answer to the light laid down (core, halo and bloom energies):
 *  nothing below each toe, then a soft shoulder. The halo and the bloom carry
 *  their gains; the shown light is their sum, clamped. */
export function burnTone(core: number, halo: number, bloom: number) {
  const B = EGG.BURN;
  const c = 1 - Math.exp(-B.kc * Math.max(0, core - B.toe));
  const h = B.haloGain * (1 - Math.exp(-B.kh * Math.max(0, halo - B.toeHalo)));
  const g = B.bloomGain * (1 - Math.exp(-B.kb * Math.max(0, bloom - 0.35 * B.toe)));
  return { core: c, halo: h, bloom: g, light: clamp01(c + h + g) };
}

/** The dodge's pool at `thetaDeg` from the place (angle on the sphere). */
export function dodgeWeight(thetaDeg: number, sigmaDeg: number) {
  return Math.exp((-thetaDeg * thetaDeg) / (2 * sigmaDeg * sigmaDeg));
}

/** The BULB ticket's print: a crop of the finished frame centred on the
 *  place, 0.9r × 0.69r css (the print's 1.31 aspect), shifted (and if need be
 *  shrunk, keeping the aspect) into the disc's box. All in canvas css px, y
 *  down. */
export function printCrop(
  point: { x: number; y: number },
  r: number,
  box: { x0: number; y0: number; x1: number; y1: number },
) {
  let w = 0.9 * r;
  let h = 0.69 * r;
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const fit = Math.min(1, bw / w, bh / h);
  w *= fit;
  h *= fit;
  const x = Math.max(box.x0, Math.min(point.x - w / 2, box.x1 - w));
  const y = Math.max(box.y0, Math.min(point.y - h / 2, box.y1 - h));
  return { x, y, w, h };
}

/** The camera's distance from the globe's centre, in globe radii (NaN when
 *  the private fields are missing). */
export function globeDepth(map: MapboxMap) {
  const t = (map as unknown as { transform?: GlobeTransform }).transform;
  const g = t?.globeCenterInViewSpace;
  const R = t?.globeRadius;
  if (!g || g.length < 3 || !Number.isFinite(R) || !(R as number)) return Number.NaN;
  return Math.hypot(g[0], g[1], g[2]) / (R as number);
}

// ── The white-ink marks, cut and restored ──
// Data-driven paint does not transition, so this is a cut: fine under a
// smear or an open shutter, and it comes back with the landing. The paint
// is saved as written and restored as it was; a value someone else wrote
// meanwhile (a React prop that changed) is left as it is.
const MARK_LAYERS = [
  ['prologue-route', 'line-opacity'],
  ['prologue-stops-dot', 'circle-opacity'],
  // The dot's knockout is its own paint: left on, it stayed behind as a
  // dark ring round an empty place.
  ['prologue-stops-dot', 'circle-stroke-opacity'],
  ['route-all-glow', 'line-opacity'],
  ['route-all-line', 'line-opacity'],
  ['route-travelled-glow', 'line-opacity'],
  ['route-travelled-line', 'line-opacity'],
] as const;
const marksByMap = new WeakMap<MapboxMap, { hidden: boolean; saved: Map<string, unknown> }>();

export function setEggMarks(map: MapboxMap, hidden: boolean) {
  let state = marksByMap.get(map);
  if (!state) {
    state = { hidden: false, saved: new Map() };
    marksByMap.set(map, state);
  }
  if (state.hidden === hidden) return;
  state.hidden = hidden;
  const paint = map as unknown as {
    getPaintProperty: (id: string, name: string) => unknown;
    setPaintProperty: (id: string, name: string, value: unknown) => void;
  };
  MARK_LAYERS.forEach(([id, name]) => {
    if (!map.getLayer(id)) return;
    // Keyed by layer AND property: one layer can have two cut.
    const key = `${id} ${name}`;
    if (hidden) {
      const value = paint.getPaintProperty(id, name);
      if (value === 0) return;
      state.saved.set(key, value);
      paint.setPaintProperty(id, name, 0);
      return;
    }
    if (!state.saved.has(key)) return;
    if (paint.getPaintProperty(id, name) === 0) paint.setPaintProperty(id, name, state.saved.get(key));
  });
  if (!hidden) state.saved.clear();
}

// ── Warm tiles ──
/** Asks the browser (when idle) for the satellite tiles every landing is
 *  drawn from, so a first fling's landing finds them in the HTTP cache
 *  instead of showing dark quads while they load (measured on a slow, cold
 *  connection: ~2 s of them). The corner globe draws `zoom` 4 tiles (and a
 *  few z3 at the limb); a landing always centres on one of his places, so
 *  this takes the tile under each place and its eight neighbours (15 tiles
 *  for his six places). The URLs come from the map's own builder, so they are
 *  exactly the ones it will ask for. Private API (the request manager),
 *  fully guarded; once per map. */
const warmedMaps = new WeakSet<MapboxMap>();
export function landingTiles(places: ReadonlyArray<readonly [number, number]>, zoom = 4) {
  const n = 1 << zoom;
  const tiles = new Set<string>();
  places.forEach(([lng, lat]) => {
    const x = Math.floor(((lng + 180) / 360) * n);
    const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const ty = y + dy;
        if (ty < 0 || ty >= n) continue;
        tiles.add(`${zoom}/${(((x + dx) % n) + n) % n}/${ty}`);
      }
    }
  });
  return [...tiles];
}
export function warmSatelliteTiles(map: MapboxMap, places: ReadonlyArray<readonly [number, number]>, sourceId = 'prologue-satellite') {
  if (warmedMaps.has(map) || !places.length) return;
  warmedMaps.add(map);
  const run = () => {
    try {
      const source = map.getSource(sourceId) as unknown as { tiles?: string[]; tileSize?: number } | undefined;
      const template = source?.tiles?.[0];
      const manager = (map as unknown as { _requestManager?: { normalizeTileURL?: (url: string, use2x?: boolean, size?: number) => string } })._requestManager;
      if (!template || typeof manager?.normalizeTileURL !== 'function') return;
      const use2x = (window.devicePixelRatio || 1) >= 2;
      landingTiles(places).forEach((tile) => {
        const [z, x, y] = tile.split('/');
        const raw = template.replace('{z}', z).replace('{x}', x).replace('{y}', y);
        const url = manager.normalizeTileURL?.(raw, use2x, source?.tileSize);
        if (url) fetch(url, { mode: 'cors', credentials: 'same-origin' }).catch(() => {});
      });
    } catch {
      // A warm-up is only ever a head start.
    }
  };
  const idle = (window as unknown as { requestIdleCallback?: (fn: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 2000 });
  else window.setTimeout(run, 200);
}

// ── Shaders ──
const VERTEX = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
uniform vec2 uC; uniform float uR; uniform float uD; uniform vec3 uN;
uniform vec2 uOrigin; uniform float uScale;
bool toSphere(vec2 s, out vec3 P) {
  float k = sqrt(uD * uD - 1.0);
  vec2 ab = s / k;
  float q = dot(ab, ab) + 1.0;
  float disc = uD * uD - q * (uD * uD - 1.0);
  if (disc < 0.0) { P = vec3(0.0); return false; }
  float t = (uD - sqrt(disc)) / q;
  P = vec3(ab * t, uD - t);
  return true;
}
vec2 toScreen(vec3 P) { float k = sqrt(uD * uD - 1.0); return k * P.xy / (uD - P.z); }
vec3 rot(vec3 P, float a) { float c = cos(a), s = sin(a); return P * c + cross(uN, P) * s + uN * dot(uN, P) * (1.0 - c); }
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

// The shutter: each pixel averages the print along the arc its surface point
// sweeps as the sphere turns on its tilted axis, over the smear angle uA
// (perspective-correct), the shutter opening and closing (no hard ends).
// Samples over the horizon are dropped and the rest renormalised.
const BLUR = `
uniform sampler2D uCap; uniform vec2 uCapOrigin; uniform vec2 uCapSize; uniform float uA; uniform int uNs;
vec3 blurAt(vec2 css) {
  vec2 uv0 = (css - uCapOrigin) / uCapSize;
  vec2 s = (css - uC) / uR;
  vec3 P;
  if (uNs < 2 || uA < 1e-5 || !toSphere(s, P)) return texture(uCap, uv0).rgb;
  float perp = length(cross(uN, P));
  float stepPx = uR * uA * perp / float(uNs - 1);
  float lod = clamp(log2(max(stepPx, 1.0)) - 0.4, 0.0, 5.0);
  vec3 acc = vec3(0.0);
  float w = 0.0;
  for (int i = 0; i < 48; i++) {
    if (i >= uNs) break;
    float f = float(i) / float(uNs - 1) - 0.5;
    vec3 Q = rot(P, uA * f);
    if (Q.z * uD <= 1.0005) continue;
    vec2 sc = uC + toScreen(Q) * uR;
    float wt = 1.0 - 0.55 * abs(2.0 * f);
    acc += textureLod(uCap, (sc - uCapOrigin) / uCapSize, lod).rgb * wt;
    w += wt;
  }
  return w > 0.0 ? acc / w : texture(uCap, uv0).rgb;
}
`;

const FS_ACCUM = `${COMMON}${BLUR}
out vec4 o;
void main() {
  vec2 css = uOrigin + gl_FragCoord.xy * uScale;
  o = vec4(blurAt(css), 1.0);
}`;

// Over the disc, premultiplied: the smeared print (0), the open exposure
// with its display gain (1), or the develop from it to the live print, dark
// tones first (2). The develop fades the exposure off the map's own print
// (not off the css-resolution copy, which would sharpen in one step when the
// layer lets go); only as much of the smeared copy stays as the globe's
// remaining spin asks for (uAlpha). Stops short of the limb (5 → 1.5 css px
// inside), so the map's own antialiased edge and the light's rim over it are
// untouched.
const FS_COMP = `${COMMON}
uniform sampler2D uAcc; uniform sampler2D uLive; uniform vec2 uCapOrigin; uniform vec2 uCapSize;
uniform int uMode; uniform float uU; uniform float uAlpha; uniform float uSpread; uniform float uLift;
out vec4 o;
void main() {
  vec2 css = uOrigin + gl_FragCoord.xy * uScale;
  float rho = length((css - uC) / uR);
  float inside = 1.0 - smoothstep(1.0 - 5.0 / uR, 1.0 - 1.5 / uR, rho);
  if (inside <= 0.0) discard;
  vec2 uv = (css - uCapOrigin) / uCapSize;
  float dither = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  if (uMode == 0) {
    float a = inside * uAlpha;
    o = vec4((texture(uLive, uv).rgb + dither) * a, a);
    return;
  }
  vec3 ex = texture(uAcc, uv).rgb;
  float lx = dot(ex, vec3(0.2126, 0.7152, 0.0722));
  ex = mix(ex, 1.0 - pow(max(1.0 - ex, vec3(0.0)), vec3(uLift)), smoothstep(0.14, 0.5, lx));
  if (uMode == 1) {
    o = vec4((ex + dither) * inside, inside);
    return;
  }
  vec3 live = texture(uLive, uv).rgb;
  float ll = clamp((dot(live, vec3(0.2126, 0.7152, 0.0722)) - 0.1) / 0.8, 0.0, 1.0);
  float start = uSpread * ll;
  float dev = smoothstep(start, start + (1.0 - uSpread), uU);
  float a = 1.0 - dev * (1.0 - uAlpha);
  vec3 col = (1.0 - dev) * (ex + dither) + dev * uAlpha * live;
  o = vec4(col * inside, a * inside);
}`;

// The burn's deposit: every place a gaussian brush swept from its last point
// to this one (core, halo, bloom), added into a float target.
const FS_DEPOSIT = `${COMMON}
uniform vec4 uSeg[8]; uniform vec3 uW[8]; uniform float uSc; uniform float uSh; uniform float uSb;
out vec4 o;
float erf1(float x) { float t = 1.0 / (1.0 + 0.3275911 * abs(x)); float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x); return sign(x) * y; }
float swept(vec2 p, vec2 a, vec2 b, float sg) {
  vec2 ba = b - a;
  float L = length(ba);
  vec2 dir = L > 1e-4 ? ba / L : vec2(1.0, 0.0);
  float t = dot(p - a, dir);
  float n = dot(p - a, vec2(-dir.y, dir.x));
  float perp = exp(-n * n / (2.0 * sg * sg));
  float k = 0.70710678 / sg;
  float along = L > 0.02 * sg ? 0.5 * (erf1((L - t) * k) - erf1(-t * k)) / L : exp(-t * t / (2.0 * sg * sg)) / (2.5066283 * sg);
  return perp * along;
}
void main() {
  vec2 p = uOrigin + gl_FragCoord.xy * uScale;
  float core = 0.0, halo = 0.0, bloom = 0.0;
  for (int i = 0; i < 8; i++) {
    if (uW[i].z <= 0.0) continue;
    core += uW[i].x * swept(p, uSeg[i].xy, uSeg[i].zw, uSc);
    halo += uW[i].y * swept(p, uSeg[i].xy, uSeg[i].zw, uSh);
    bloom += uW[i].y * swept(p, uSeg[i].xy, uSeg[i].zw, uSb);
  }
  o = vec4(core, halo, bloom, 1.0);
}`;

// The burn shown: the film toe (see burnTone), bone ink, screen-blended.
const FS_BURN = `${COMMON}
uniform sampler2D uBurn; uniform vec2 uCapOrigin; uniform vec2 uCapSize;
uniform float uKc, uKh, uKb, uToe, uToeH, uHg, uBg, uGain; uniform vec3 uInk;
out vec4 o;
void main() {
  vec2 css = uOrigin + gl_FragCoord.xy * uScale;
  vec3 e = texture(uBurn, (css - uCapOrigin) / uCapSize).rgb;
  float core = 1.0 - exp(-uKc * max(0.0, e.r - uToe));
  float halo = 1.0 - exp(-uKh * max(0.0, e.g - uToeH));
  float bloom = 1.0 - exp(-uKb * max(0.0, e.b - uToe * 0.35));
  float v = clamp((core + uHg * halo + uBg * bloom) * uGain, 0.0, 1.0);
  v += (hash(gl_FragCoord.xy + 7.0) - 0.5) / 255.0;
  o = vec4(uInk * max(v, 0.0), 1.0);
}`;

// The dodge: blended DST_COLOR, SRC_ALPHA, so the print becomes
// print × (1 + gain·a·g − burn·a·(1 − g)): lifted under the pool, held a
// little down elsewhere — a pure multiply, no added light, no halo.
const FS_DODGE = `${COMMON}
uniform vec3 uPlace; uniform float uAmt; uniform float uSig; uniform float uGain; uniform float uBurnDown;
out vec4 o;
void main() {
  vec2 css = uOrigin + gl_FragCoord.xy * uScale;
  vec2 s = (css - uC) / uR;
  vec3 P;
  if (!toSphere(s, P)) discard;
  float inside = 1.0 - smoothstep(1.0 - 5.0 / uR, 1.0 - 1.5 / uR, length(s));
  float th = acos(clamp(dot(P, uPlace), -1.0, 1.0));
  float g = exp(-th * th / (2.0 * uSig * uSig));
  o = vec4(vec3(uGain * uAmt * g * inside), 1.0 - uBurnDown * uAmt * (1.0 - g) * inside);
}`;

type Program = { program: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
type TargetName = 'cap' | 'live' | 'acc' | 'burn';

export interface EggLayers {
  exposure: CustomLayerInterface;
  burn: CustomLayerInterface;
}

/** The print's pixels (3× its 76 × 58 css). */
const PRINT_W = EGG.TICKET.printW * 3;
const PRINT_H = EGG.TICKET.printH * 3;
const MAX_PLACES = 8;

export function createEggExposure(map: MapboxMap, getState: () => GlobeChannel): EggLayers {
  let gl: WebGL2RenderingContext | null = null;
  let disabled = false;
  let programs: Record<'accum' | 'comp' | 'deposit' | 'burn' | 'dodge', Program> | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let buffer: WebGLBuffer | null = null;
  const tex: Partial<Record<TargetName, WebGLTexture>> = {};
  const fbo: Partial<Record<TargetName, WebGLFramebuffer>> = {};
  // The disc ∩ canvas, css px, y up from the canvas bottom.
  let box: { x0: number; yb: number; w: number; h: number } | null = null;
  // The float format the exposure and the burn accumulate in (null: the
  // shutter's smear only).
  let floatFormat: { internal: number; type: number; filter: number } | null = null;
  let checked = false;
  // The exposure's own clock (render time, not the controller's).
  let accFor = -1;
  let accT = 0;
  let accLast = 0;
  let burnPrev: Array<[number, number] | null> = [];
  let clearBurn = false;

  const compile = (type: number, source: string) => {
    const g = gl as WebGL2RenderingContext;
    const shader = g.createShader(type);
    if (!shader) return null;
    g.shaderSource(shader, source);
    g.compileShader(shader);
    if (g.getShaderParameter(shader, g.COMPILE_STATUS)) return shader;
    g.deleteShader(shader);
    return null;
  };
  const link = (fragment: string): Program | null => {
    const g = gl as WebGL2RenderingContext;
    const vs = compile(g.VERTEX_SHADER, VERTEX);
    const fs = compile(g.FRAGMENT_SHADER, fragment);
    const program = vs && fs ? g.createProgram() : null;
    if (!program || !vs || !fs) {
      if (vs) g.deleteShader(vs);
      if (fs) g.deleteShader(fs);
      return null;
    }
    g.attachShader(program, vs);
    g.attachShader(program, fs);
    g.bindAttribLocation(program, 0, 'a');
    g.linkProgram(program);
    g.detachShader(program, vs);
    g.detachShader(program, fs);
    g.deleteShader(vs);
    g.deleteShader(fs);
    if (!g.getProgramParameter(program, g.LINK_STATUS)) {
      g.deleteProgram(program);
      return null;
    }
    const u: Record<string, WebGLUniformLocation | null> = {};
    const count = g.getProgramParameter(program, g.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i += 1) {
      const info = g.getActiveUniform(program, i);
      if (info) u[info.name.replace(/\[0\]$/, '')] = g.getUniformLocation(program, info.name);
    }
    return { program, u };
  };

  const dropTargets = () => {
    const g = gl;
    if (!g) return;
    (Object.keys(tex) as TargetName[]).forEach((name) => {
      g.deleteTexture(tex[name] as WebGLTexture);
      delete tex[name];
    });
    (Object.keys(fbo) as TargetName[]).forEach((name) => {
      g.deleteFramebuffer(fbo[name] as WebGLFramebuffer);
      delete fbo[name];
    });
    box = null;
    accFor = -1;
  };
  const makeTarget = (name: TargetName, w: number, h: number, internal: number, format: number, type: number, filter: number, mips: boolean) => {
    const g = gl as WebGL2RenderingContext;
    const texture = g.createTexture() as WebGLTexture;
    g.bindTexture(g.TEXTURE_2D, texture);
    g.texImage2D(g.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, mips ? g.LINEAR_MIPMAP_LINEAR : filter);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, filter);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    const framebuffer = g.createFramebuffer() as WebGLFramebuffer;
    g.bindFramebuffer(g.FRAMEBUFFER, framebuffer);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, texture, 0);
    const complete = g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE;
    tex[name] = texture;
    fbo[name] = framebuffer;
    return complete;
  };
  const ensureTargets = (next: { x0: number; yb: number; w: number; h: number }) => {
    const g = gl as WebGL2RenderingContext;
    if (box && box.w === next.w && box.h === next.h && tex.cap) {
      box = next;
      return true;
    }
    dropTargets();
    let ok = makeTarget('cap', next.w, next.h, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, g.LINEAR, true) &&
      makeTarget('live', next.w, next.h, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, g.LINEAR, false);
    if (ok && floatFormat) {
      const floats = makeTarget('acc', next.w, next.h, floatFormat.internal, g.RGBA, floatFormat.type, floatFormat.filter, false) &&
        makeTarget('burn', next.w, next.h, floatFormat.internal, g.RGBA, floatFormat.type, floatFormat.filter, false);
      // A float target the driver will not render to: the smear only.
      if (!floats) {
        floatFormat = null;
        ok = true;
      }
    }
    box = next;
    return ok;
  };

  const planet = () => {
    const t = (map as unknown as { transform?: GlobeTransform }).transform;
    const g = t?.globeCenterInViewSpace;
    const R = t?.globeRadius;
    const f = t?.cameraToCenterDistance;
    const ratio = t?._pixelsPerMercatorPixel;
    if (!t || !g || g.length < 3 || !Number.isFinite(R) || !Number.isFinite(f) || !Number.isFinite(ratio) || !(ratio as number)) return null;
    const d = Math.hypot(g[0], g[1], g[2]);
    if (!(d > (R as number))) return null;
    const r = ((f as number) * (R as number)) / Math.sqrt(d * d - (R as number) * (R as number)) / (ratio as number);
    const c = map.project(map.getCenter());
    const cssW = t.width || map.getCanvas().clientWidth || 1;
    const cssH = t.height || map.getCanvas().clientHeight || 1;
    if (!Number.isFinite(r) || !Number.isFinite(c.x)) return null;
    return { x: c.x, y: c.y, r, D: d / (R as number), cssW, cssH };
  };
  type Planet = NonNullable<ReturnType<typeof planet>>;
  const boxFor = (pl: Planet) => {
    const x0 = Math.max(0, Math.floor(pl.x - pl.r - 2));
    const x1 = Math.min(pl.cssW, Math.ceil(pl.x + pl.r + 2));
    const yt0 = Math.max(0, Math.floor(pl.y - pl.r - 2));
    const yt1 = Math.min(pl.cssH, Math.ceil(pl.y + pl.r + 2));
    if (x1 <= x0 || yt1 <= yt0) return null;
    return { x0, yb: pl.cssH - yt1, w: x1 - x0, h: yt1 - yt0 };
  };
  // The globe's axis on screen: north measured from two projections, so the
  // map's bearing comes for free.
  const axis = (): [number, number, number] => {
    const c = map.getCenter();
    const a = map.project(c);
    const b = map.project([c.lng, Math.min(89.5, c.lat + 0.5)]);
    let nx = b.x - a.x;
    let ny = -(b.y - a.y);
    const length = Math.hypot(nx, ny) || 1;
    nx /= length;
    ny /= length;
    const phi = (c.lat * Math.PI) / 180;
    return [Math.cos(phi) * nx, Math.cos(phi) * ny, Math.sin(phi)];
  };
  const common = (p: Program, pl: Planet, N: [number, number, number], origin: [number, number], scale: number) => {
    const g = gl as WebGL2RenderingContext;
    g.useProgram(p.program);
    g.uniform2f(p.u.uC ?? null, pl.x, pl.cssH - pl.y);
    g.uniform1f(p.u.uR ?? null, pl.r);
    g.uniform1f(p.u.uD ?? null, pl.D);
    g.uniform3f(p.u.uN ?? null, N[0], N[1], N[2]);
    g.uniform2f(p.u.uOrigin ?? null, origin[0], origin[1]);
    g.uniform1f(p.u.uScale ?? null, scale);
  };
  const draw = () => {
    const g = gl as WebGL2RenderingContext;
    g.bindVertexArray(vao);
    g.drawArrays(g.TRIANGLES, 0, 3);
  };

  const exposureLayer: CustomLayerInterface = {
    id: 'egg-exposure',
    type: 'custom',
    renderingMode: '2d',
    onAdd(_map: MapboxMap, context: WebGLRenderingContext) {
      // Mapbox GL 3 is WebGL 2 throughout; anything less (or a multisampled
      // default framebuffer, which cannot be blitted down) leaves the eggs
      // without their photograph, never throws inside addLayer.
      const g = context as WebGL2RenderingContext;
      if (typeof g.blitFramebuffer !== 'function' || g.getContextAttributes()?.antialias) {
        disabled = true;
        return;
      }
      gl = g;
      const accum = link(FS_ACCUM);
      const comp = link(FS_COMP);
      const deposit = link(FS_DEPOSIT);
      const burn = link(FS_BURN);
      const dodge = link(FS_DODGE);
      if (!accum || !comp || !deposit || !burn || !dodge) {
        [accum, comp, deposit, burn, dodge].forEach((p) => p && g.deleteProgram(p.program));
        disabled = true;
        return;
      }
      programs = { accum, comp, deposit, burn, dodge };
      const colorFloat = !!g.getExtension('EXT_color_buffer_float');
      const floatBlend = !!g.getExtension('EXT_float_blend');
      const floatLinear = !!g.getExtension('OES_texture_float_linear');
      if (colorFloat && floatBlend) floatFormat = { internal: g.RGBA32F, type: g.FLOAT, filter: floatLinear ? g.LINEAR : g.NEAREST };
      else if (colorFloat || g.getExtension('EXT_color_buffer_half_float')) floatFormat = { internal: g.RGBA16F, type: g.HALF_FLOAT, filter: g.LINEAR };
      buffer = g.createBuffer();
      vao = g.createVertexArray();
      g.bindVertexArray(vao);
      g.bindBuffer(g.ARRAY_BUFFER, buffer);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
      g.enableVertexAttribArray(0);
      g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      g.bindVertexArray(null);
    },
    onRemove() {
      const g = gl;
      if (!g) return;
      dropTargets();
      if (programs) Object.values(programs).forEach((p) => g.deleteProgram(p.program));
      if (vao) g.deleteVertexArray(vao);
      if (buffer) g.deleteBuffer(buffer);
      programs = null;
      vao = null;
      buffer = null;
      gl = null;
    },
    render() {
      const g = gl;
      if (disabled || !g || !programs) return;
      const s = getState();
      const phase = s.exposure.phase;
      const burning = (phase === 'open' || phase === 'develop') && !!floatFormat;
      const exposing = burning && !s.exposure.still;
      const A = blurAngle(s.spin);
      const moving = A >= EGG.BLUR_ON[0];
      const pooling = s.pool.index >= 0 && s.pool.amount > 0.001 && !!s.places[s.pool.index];
      if (!moving && !burning && !pooling) {
        // At rest: no GL at all, except once to take or give back the targets.
        if (phase === 'off') {
          accFor = -1;
          burnPrev = [];
        }
        if (!s.warm && box) dropTargets();
        else if (s.warm && !box) {
          const pl = planet();
          const next = pl && boxFor(pl);
          if (next) {
            const previous = g.getParameter(g.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
            ensureTargets(next);
            g.bindFramebuffer(g.FRAMEBUFFER, previous);
          }
        }
        return;
      }
      const pl = planet();
      if (!pl || !(pl.D > 1.0001)) return;
      const next = boxFor(pl);
      if (!next) return;
      const now = performance.now();
      const previous = g.getParameter(g.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const bufferWidth = g.drawingBufferWidth;
      const bufferHeight = g.drawingBufferHeight;
      const dpr = bufferWidth / pl.cssW;
      try {
        // The dodge alone needs no targets (and must not re-make them while
        // the scroll carries the planet off under a fading pool).
        const needCapture = moving || exposing;
        if ((needCapture || burning) && !ensureTargets(next)) return;
        const b = (needCapture || burning) && box ? box : next;
        const N = axis();
        g.disable(g.DEPTH_TEST);
        g.disable(g.STENCIL_TEST);
        g.disable(g.CULL_FACE);
        g.depthMask(false);
        g.colorMask(true, true, true, true);
        g.disable(g.SCISSOR_TEST);
        const bx0 = Math.round(b.x0 * dpr);
        const by0 = Math.round(b.yb * dpr);
        const bx1 = Math.round((b.x0 + b.w) * dpr);
        const by1 = Math.round((b.yb + b.h) * dpr);

        // A new exposure starts its own mean and its own burn.
        if (burning && s.exposure.openedAt !== accFor) {
          accFor = s.exposure.openedAt;
          accT = 0;
          accLast = 0;
          burnPrev = [];
          clearBurn = true;
        }
        const dt = accLast ? Math.min(0.05, Math.max(0, (now - accLast) / 1000)) : 1 / 60;
        if (phase === 'open') accLast = now;

        // 1 — capture the unlit print, css resolution, with mips.
        if (needCapture) {
          if (!checked) g.getError();
          g.bindFramebuffer(g.READ_FRAMEBUFFER, previous);
          g.bindFramebuffer(g.DRAW_FRAMEBUFFER, fbo.cap as WebGLFramebuffer);
          g.blitFramebuffer(bx0, by0, bx1, by1, 0, 0, b.w, b.h, g.COLOR_BUFFER_BIT, g.LINEAR);
          if (!checked) {
            checked = true;
            if (g.getError() !== g.NO_ERROR) {
              disabled = true;
              return;
            }
          }
          g.activeTexture(g.TEXTURE0);
          g.bindTexture(g.TEXTURE_2D, tex.cap as WebGLTexture);
          g.generateMipmap(g.TEXTURE_2D);
        }
        const setBlur = (p: Program, degrees: number) => {
          g.activeTexture(g.TEXTURE0);
          g.bindTexture(g.TEXTURE_2D, tex.cap as WebGLTexture);
          g.uniform1i(p.u.uCap ?? null, 0);
          g.uniform2f(p.u.uCapOrigin ?? null, b.x0, b.yb);
          g.uniform2f(p.u.uCapSize ?? null, b.w, b.h);
          g.uniform1f(p.u.uA ?? null, (degrees * Math.PI) / 180);
          const samples = degrees > 0.02 ? Math.min(s.lite ? 24 : 48, samplesFor(degrees, pl.r)) : 1;
          g.uniform1i(p.u.uNs ?? null, samples);
        };
        g.viewport(0, 0, b.w, b.h);

        // 2 — the open shutter folds this frame, smeared over the angle it
        // swept, into the time-weighted mean; otherwise the live print is
        // smeared by the fling's shutter.
        if (phase === 'open' && exposing) {
          accT += dt;
          g.bindFramebuffer(g.FRAMEBUFFER, fbo.acc as WebGLFramebuffer);
          common(programs.accum, pl, N, [b.x0, b.yb], 1);
          setBlur(programs.accum, Math.min(12, Math.abs(s.spin) * dt));
          if (accT <= dt + 1e-6) g.disable(g.BLEND);
          else {
            g.enable(g.BLEND);
            g.blendColor(0, 0, 0, dt / accT);
            g.blendFunc(g.CONSTANT_ALPHA, g.ONE_MINUS_CONSTANT_ALPHA);
          }
          draw();
        } else if (needCapture) {
          g.bindFramebuffer(g.FRAMEBUFFER, fbo.live as WebGLFramebuffer);
          g.disable(g.BLEND);
          common(programs.accum, pl, N, [b.x0, b.yb], 1);
          setBlur(programs.accum, A);
          draw();
        }

        // 3 — his places, laid down as light (the camera of this frame).
        if (phase === 'open' && burning && fbo.burn) {
          g.bindFramebuffer(g.FRAMEBUFFER, fbo.burn);
          if (clearBurn) {
            clearBurn = false;
            g.disable(g.BLEND);
            g.clearColor(0, 0, 0, 0);
            g.clear(g.COLOR_BUFFER_BIT);
          }
          const center = map.getCenter();
          const lat0 = (center.lat * Math.PI) / 180;
          const lng0 = (center.lng * Math.PI) / 180;
          const segments = new Float32Array(4 * MAX_PLACES);
          const weights = new Float32Array(3 * MAX_PLACES);
          let any = false;
          s.places.slice(0, MAX_PLACES).forEach(([lng, lat], index) => {
            const la = (lat * Math.PI) / 180;
            const lo = (lng * Math.PI) / 180;
            const cosA = Math.sin(la) * Math.sin(lat0) + Math.cos(la) * Math.cos(lat0) * Math.cos(lo - lng0);
            const visible = horizonVisibility(cosA, 1 / pl.D);
            const point = map.project([lng, lat]);
            const current: [number, number] = [point.x, pl.cssH - point.y];
            const last = burnPrev[index];
            burnPrev[index] = visible > 0 ? current : null;
            if (!last || visible <= 0) return;
            if (Math.hypot(current[0] - last[0], current[1] - last[1]) > 160) return;
            const energy = dt * EGG.BURN.e * visible;
            segments.set([last[0], last[1], current[0], current[1]], index * 4);
            weights.set([energy, energy, 1], index * 3);
            any = true;
          });
          if (any) {
            g.enable(g.BLEND);
            g.blendFunc(g.ONE, g.ONE);
            const p = programs.deposit;
            common(p, pl, N, [b.x0, b.yb], 1);
            g.uniform4fv(p.u.uSeg ?? null, segments);
            g.uniform3fv(p.u.uW ?? null, weights);
            g.uniform1f(p.u.uSc ?? null, EGG.BURN.core);
            g.uniform1f(p.u.uSh ?? null, EGG.BURN.halo);
            g.uniform1f(p.u.uSb ?? null, EGG.BURN.bloom);
            draw();
          }
        }

        // 4 — back onto the map, over the disc, below the light.
        g.bindFramebuffer(g.FRAMEBUFFER, previous);
        g.viewport(0, 0, bufferWidth, bufferHeight);
        g.enable(g.SCISSOR_TEST);
        g.scissor(bx0, by0, bx1 - bx0, by1 - by0);
        if (needCapture) {
          g.enable(g.BLEND);
          g.blendFuncSeparate(g.ONE, g.ONE_MINUS_SRC_ALPHA, g.ZERO, g.ONE);
          const p = programs.comp;
          common(p, pl, N, [0, 0], 1 / dpr);
          g.activeTexture(g.TEXTURE1);
          g.bindTexture(g.TEXTURE_2D, (tex.acc ?? tex.live) as WebGLTexture);
          g.uniform1i(p.u.uAcc ?? null, 1);
          g.activeTexture(g.TEXTURE2);
          g.bindTexture(g.TEXTURE_2D, tex.live as WebGLTexture);
          g.uniform1i(p.u.uLive ?? null, 2);
          g.uniform2f(p.u.uCapOrigin ?? null, b.x0, b.yb);
          g.uniform2f(p.u.uCapSize ?? null, b.w, b.h);
          g.uniform1f(p.u.uLift ?? null, exposureGain(accT));
          g.uniform1f(p.u.uSpread ?? null, EGG.DEV_SPREAD);
          if (exposing && phase === 'open') {
            g.uniform1i(p.u.uMode ?? null, 1);
            g.uniform1f(p.u.uAlpha ?? null, 1);
            g.uniform1f(p.u.uU ?? null, 0);
          } else if (exposing && phase === 'develop') {
            g.uniform1i(p.u.uMode ?? null, 2);
            g.uniform1f(p.u.uAlpha ?? null, smoothstep(EGG.BLUR_ON[0], EGG.BLUR_ON[1], A));
            g.uniform1f(p.u.uU ?? null, Math.min(1, developAt(now, s.exposure.closedAt, s.exposure.still)));
          } else {
            g.uniform1i(p.u.uMode ?? null, 0);
            g.uniform1f(p.u.uAlpha ?? null, smoothstep(EGG.BLUR_ON[0], EGG.BLUR_ON[1], A));
            g.uniform1f(p.u.uU ?? null, 0);
          }
          draw();
        }

        // 5 — the dodge on the landed place.
        if (pooling) {
          const [lng, lat] = s.places[s.pool.index];
          const point = map.project([lng, lat]);
          const sphere = toSphere((point.x - pl.x) / pl.r, (pl.y - point.y) / pl.r, pl.D);
          if (sphere) {
            g.enable(g.BLEND);
            g.blendFuncSeparate(g.DST_COLOR, g.SRC_ALPHA, g.ZERO, g.ONE);
            const p = programs.dodge;
            common(p, pl, N, [0, 0], 1 / dpr);
            g.uniform3f(p.u.uPlace ?? null, sphere[0], sphere[1], sphere[2]);
            g.uniform1f(p.u.uAmt ?? null, s.pool.amount);
            g.uniform1f(p.u.uSig ?? null, (Math.max(0.5, s.pool.sigma) * Math.PI) / 180);
            g.uniform1f(p.u.uGain ?? null, EGG.DODGE.gain);
            g.uniform1f(p.u.uBurnDown ?? null, EGG.DODGE.burn);
            draw();
          }
        }
      } catch {
        disabled = true;
      } finally {
        g.bindFramebuffer(g.FRAMEBUFFER, previous);
        g.viewport(0, 0, bufferWidth, bufferHeight);
        g.disable(g.SCISSOR_TEST);
        g.disable(g.BLEND);
        g.bindVertexArray(null);
        g.activeTexture(g.TEXTURE0);
      }
      // The exposure keeps building (and the develop keeps running) on a
      // globe that has stopped: ask for the next frame.
      if (phase === 'open' || phase === 'develop') map.triggerRepaint();
    },
  } as CustomLayerInterface;

  // The print: the finished frame, cropped on the place and brought down to
  // the ticket's pixels by halving blits (a single 5× blit aliases), read
  // back once.
  const capturePrint = (g: WebGL2RenderingContext, s: GlobeChannel, pl: Planet, dpr: number, previous: WebGLFramebuffer | null) => {
    const b = box;
    const place = s.places[s.exposure.target];
    if (!b || !place) return;
    const point = map.project([place[0], place[1]]);
    const crop = printCrop({ x: point.x, y: point.y }, pl.r, {
      x0: b.x0,
      y0: pl.cssH - b.yb - b.h,
      x1: b.x0 + b.w,
      y1: pl.cssH - b.yb,
    });
    let sx0 = Math.round(crop.x * dpr);
    let sy0 = Math.round((pl.cssH - crop.y - crop.h) * dpr);
    let sw = Math.round(crop.w * dpr);
    let sh = Math.round(crop.h * dpr);
    let source = previous;
    const temps: Array<{ texture: WebGLTexture; framebuffer: WebGLFramebuffer }> = [];
    const target = (w: number, h: number) => {
      const texture = g.createTexture() as WebGLTexture;
      g.bindTexture(g.TEXTURE_2D, texture);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, null);
      const framebuffer = g.createFramebuffer() as WebGLFramebuffer;
      g.bindFramebuffer(g.FRAMEBUFFER, framebuffer);
      g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, texture, 0);
      temps.push({ texture, framebuffer });
      return framebuffer;
    };
    try {
      while (sw > 2 * PRINT_W && sh > 2 * PRINT_H) {
        const w = Math.ceil(sw / 2);
        const h = Math.ceil(sh / 2);
        const framebuffer = target(w, h);
        g.bindFramebuffer(g.READ_FRAMEBUFFER, source);
        g.bindFramebuffer(g.DRAW_FRAMEBUFFER, framebuffer);
        g.blitFramebuffer(sx0, sy0, sx0 + sw, sy0 + sh, 0, 0, w, h, g.COLOR_BUFFER_BIT, g.LINEAR);
        source = framebuffer;
        sx0 = 0;
        sy0 = 0;
        sw = w;
        sh = h;
      }
      const framebuffer = target(PRINT_W, PRINT_H);
      g.bindFramebuffer(g.READ_FRAMEBUFFER, source);
      g.bindFramebuffer(g.DRAW_FRAMEBUFFER, framebuffer);
      g.blitFramebuffer(sx0, sy0, sx0 + sw, sy0 + sh, 0, 0, PRINT_W, PRINT_H, g.COLOR_BUFFER_BIT, g.LINEAR);
      g.bindFramebuffer(g.READ_FRAMEBUFFER, framebuffer);
      const pixels = new Uint8Array(PRINT_W * PRINT_H * 4);
      g.readPixels(0, 0, PRINT_W, PRINT_H, g.RGBA, g.UNSIGNED_BYTE, pixels);
      // GL reads bottom-up.
      const flipped = new Uint8ClampedArray(pixels.length);
      const row = PRINT_W * 4;
      for (let y = 0; y < PRINT_H; y += 1) flipped.set(pixels.subarray((PRINT_H - 1 - y) * row, (PRINT_H - y) * row), y * row);
      for (let i = 3; i < flipped.length; i += 4) flipped[i] = 255;
      const image = new ImageData(flipped, PRINT_W, PRINT_H);
      queueMicrotask(() => s.onPrint(image));
    } finally {
      temps.forEach(({ texture, framebuffer }) => {
        g.deleteFramebuffer(framebuffer);
        g.deleteTexture(texture);
      });
    }
  };

  const burnLayer: CustomLayerInterface = {
    id: 'egg-burn',
    type: 'custom',
    renderingMode: '2d',
    onAdd() {},
    render() {
      const g = gl;
      if (disabled || !g || !programs) return;
      const s = getState();
      const phase = s.exposure.phase;
      if (phase !== 'open' && phase !== 'develop') return;
      const printNow = s.wantPrint && phase === 'develop';
      const b = box;
      if (!b || (!fbo.burn && !printNow)) return;
      const pl = planet();
      if (!pl) return;
      const previous = g.getParameter(g.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const bufferWidth = g.drawingBufferWidth;
      const bufferHeight = g.drawingBufferHeight;
      const dpr = bufferWidth / pl.cssW;
      try {
        g.disable(g.DEPTH_TEST);
        g.disable(g.STENCIL_TEST);
        g.disable(g.CULL_FACE);
        g.depthMask(false);
        g.colorMask(true, true, true, true);
        if (fbo.burn && tex.burn && accFor >= 0) {
          let gain = 1;
          if (phase === 'develop') {
            const u = developAt(performance.now(), s.exposure.closedAt, s.exposure.still);
            gain = 1 - Math.pow(u <= 0.4 ? 0 : Math.min(1, (u - 0.4) / 0.6), 1.6);
          }
          if (gain > 0.001) {
            g.bindFramebuffer(g.FRAMEBUFFER, previous);
            g.viewport(0, 0, bufferWidth, bufferHeight);
            g.enable(g.SCISSOR_TEST);
            g.scissor(Math.round(b.x0 * dpr), Math.round(b.yb * dpr), Math.round(b.w * dpr), Math.round(b.h * dpr));
            g.enable(g.BLEND);
            g.blendFuncSeparate(g.ONE, g.ONE_MINUS_SRC_COLOR, g.ZERO, g.ONE);
            const p = programs.burn;
            common(p, pl, [0, 0, 1], [0, 0], 1 / dpr);
            g.activeTexture(g.TEXTURE0);
            g.bindTexture(g.TEXTURE_2D, tex.burn);
            g.uniform1i(p.u.uBurn ?? null, 0);
            g.uniform2f(p.u.uCapOrigin ?? null, b.x0, b.yb);
            g.uniform2f(p.u.uCapSize ?? null, b.w, b.h);
            g.uniform1f(p.u.uKc ?? null, EGG.BURN.kc);
            g.uniform1f(p.u.uKh ?? null, EGG.BURN.kh);
            g.uniform1f(p.u.uKb ?? null, EGG.BURN.kb);
            g.uniform1f(p.u.uToe ?? null, EGG.BURN.toe);
            g.uniform1f(p.u.uToeH ?? null, EGG.BURN.toeHalo);
            g.uniform1f(p.u.uHg ?? null, EGG.BURN.haloGain);
            // The lighter pass for weak GPUs keeps the core and the halo only.
            g.uniform1f(p.u.uBg ?? null, s.lite ? 0 : EGG.BURN.bloomGain);
            g.uniform1f(p.u.uGain ?? null, gain);
            g.uniform3f(p.u.uInk ?? null, 0.957, 0.957, 0.929);
            draw();
            g.disable(g.SCISSOR_TEST);
            g.disable(g.BLEND);
          }
        }
        if (printNow) {
          s.wantPrint = false;
          capturePrint(g, s, pl, dpr, previous);
        }
      } catch {
        s.wantPrint = false;
      } finally {
        g.bindFramebuffer(g.FRAMEBUFFER, previous);
        g.viewport(0, 0, bufferWidth, bufferHeight);
        g.disable(g.SCISSOR_TEST);
        g.disable(g.BLEND);
        g.bindVertexArray(null);
        g.activeTexture(g.TEXTURE0);
      }
    },
  } as CustomLayerInterface;

  return { exposure: exposureLayer, burn: burnLayer };
}
