// ── The prologue globe's key light ──
// Mapbox's globe is lit flat from everywhere at once. This custom layer puts
// one light on it — upper left, from the name's side — as three full-screen
// passes clipped to the planet: a multiply (the light's falloff and a little
// grain), an over (the night side in olive rather than black) and a screen
// (air on the lit limb and a narrow glint). It sits directly above the
// satellite layer, so the route, the stops and the graticule — white ink —
// draw over it unshaded.
//
// It only ever draws on the prologue globe: nothing in the archive (the
// strength is zero there and render() returns before touching GL).
import type { CustomLayerInterface, Map as MapboxMap } from 'mapbox-gl';
import { PLANET_LIGHT, globeLookAt, lightDirection } from './globeLook';

export interface PlanetLightState {
  /** Prologue progress 0..1. */
  q: number;
  dawn: number;
  veil: number;
  hover: number;
  /** The atlas has taken over (chapter camera). */
  archive: boolean;
  /** The zoom the light fades out on. The camera passes the satellite veil's
   *  own zoom here, which follows a fast dive at a capped rate, so the light
   *  and the veil fade together instead of the light dropping in a frame or
   *  two. Not a number: the map's zoom. */
  zoom?: number;
}

export interface PlanetLightLayer extends CustomLayerInterface {
  /** The lighter pass for weak GPUs: no grain, no glint, no screen pass
   *  unless the globe is hovered (the fog carries the rim instead). */
  setLite: (lite: boolean) => void;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// Private transform fields read below (mapbox-gl 3.21). Every one is guarded;
// without them the limb is found by bisection instead.
interface GlobeTransform {
  width?: number;
  height?: number;
  globeCenterInViewSpace?: ArrayLike<number>;
  globeRadius?: number;
  cameraToCenterDistance?: number;
  _pixelsPerMercatorPixel?: number;
}

let limbKey = '';
let limbRadius = 0;
/** The limb, measured rather than fitted: the largest radius (toward the upper
 *  left, the side of the planet that is on screen in the corner) whose screen
 *  point still round-trips through unproject → project. Cached per pose. */
function limbByBisection(map: MapboxMap, x: number, y: number, width: number, height: number) {
  const key = `${x.toFixed(2)}|${y.toFixed(2)}|${map.getZoom().toFixed(5)}|${width}|${height}`;
  if (key === limbKey) return limbRadius;
  const onGlobe = (rho: number) => {
    const px: [number, number] = [x - rho * 0.7071, y - rho * 0.7071];
    const lngLat = map.unproject(px);
    if (!lngLat || !Number.isFinite(lngLat.lng)) return false;
    const back = map.project(lngLat);
    return Math.hypot(back.x - px[0], back.y - px[1]) < 0.35;
  };
  let lo = 20;
  let hi = 4 * Math.max(width, height);
  for (let i = 0; i < 26; i += 1) {
    const mid = (lo + hi) / 2;
    if (onGlobe(mid)) lo = mid;
    else hi = mid;
  }
  limbKey = key;
  limbRadius = lo;
  return lo;
}

/** Where the planet sits on the map canvas, in canvas CSS px: its centre
 *  (padding-aware) and its true limb radius. The limb comes straight from the
 *  camera — r = f·R / √(d² − R²) — because a fit on the zoom alone (the one
 *  the atlas once sized its index planet with) reads 7% small at the corner
 *  zoom (592 against 641 at 1728).
 *  Camera maths only; no layout is read. */
export function planetOnScreen(map: MapboxMap): { x: number; y: number; r: number } | null {
  const center = map.project(map.getCenter());
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;
  const t = (map as unknown as { transform?: GlobeTransform }).transform;
  const g = t?.globeCenterInViewSpace;
  const R = t?.globeRadius;
  const f = t?.cameraToCenterDistance;
  const ratio = t?._pixelsPerMercatorPixel;
  if (g && g.length >= 3 && Number.isFinite(R) && Number.isFinite(f) && Number.isFinite(ratio) && (ratio as number) > 0) {
    const d = Math.hypot(g[0], g[1], g[2]);
    if (d > (R as number)) {
      const r = ((f as number) * (R as number)) / Math.sqrt(d * d - (R as number) * (R as number)) / (ratio as number);
      if (Number.isFinite(r) && r > 0) return { x: center.x, y: center.y, r };
    }
  }
  const width = t?.width ?? map.getCanvas().clientWidth;
  const height = t?.height ?? map.getCanvas().clientHeight;
  return { x: center.x, y: center.y, r: limbByBisection(map, center.x, center.y, width, height) };
}

const VERTEX = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
const FRAGMENT = `precision highp float;
uniform vec3 uCR; uniform vec3 uL; uniform float uPass; uniform float uDpr;
uniform float uAmb, uWrap, uTint, uRim, uRimW, uHaze, uHazeW, uGlow, uGlowW, uSpec, uSpecPow, uGrain, uVeil, uStrength, uHover;
uniform vec3 uNightCol, uPaper; uniform vec2 uSky;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 d = (gl_FragCoord.xy - uCR.xy) / uCR.z;
  float rho2 = dot(d, d);
  float rho = sqrt(rho2);
  float aa = 1.25 * uDpr / uCR.z;
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + 0.2 * aa, rho);
  vec3 n = vec3(d, sqrt(max(0.0, 1.0 - min(rho2, 1.0))));
  vec3 L = normalize(uL);
  float ndl = dot(n, L);
  float lit = clamp((ndl + uWrap) / (1.0 + uWrap), 0.0, 1.0);
  lit = lit * lit * (3.0 - 2.0 * lit);
  float dayLit = lit;
  vec2 dir = rho > 0.0001 ? d / rho : vec2(0.0);
  float limbLit = dot(vec3(dir, 0.0), L);
  if (uPass < 0.5) {
    // over (premultiplied): the unlit side in night olive, not black; solid
    // under the load-in veil.
    float a = (1.0 - dayLit) * mix(uTint, 1.0, uVeil) * inside * uStrength;
    gl_FragColor = vec4(uNightCol * a, a);
  } else if (uPass < 1.5) {
    // multiply: the key light's falloff, the far side's floor and the grain.
    float shade = mix(uAmb, 1.0, dayLit);
    float g = hash(floor(gl_FragCoord.xy / max(1.0, uDpr * 0.75)));
    shade *= 1.0 + (g - 0.5) * uGrain;
    shade = mix(1.0, shade, inside * uStrength);
    gl_FragColor = vec4(vec3(shade), 1.0);
  } else {
    // screen: air on the lit limb, inside and just outside the disc, and a narrow glint.
    float sky = smoothstep(uSky.x, uSky.y, limbLit);
    float edge = clamp((rho - (1.0 - uRimW)) / uRimW, 0.0, 1.0);
    float broad = clamp((rho - (1.0 - uHazeW)) / uHazeW, 0.0, 1.0);
    float airIn = (uRim * edge * edge + uHaze * pow(broad, 3.0)) * sky * smoothstep(-0.25, 0.35, ndl + 0.15) * inside;
    float airOut = (rho > 1.0 ? uGlow * exp(-(rho - 1.0) / uGlowW) : uGlow) * sky * (1.0 - inside);
    vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));
    float glint = uSpec * pow(max(dot(n, h), 0.0), uSpecPow) * inside;
    float v = (airIn + airOut + glint) * (1.0 + 0.25 * uHover) * uStrength;
    gl_FragColor = vec4(uPaper * clamp(v, 0.0, 1.0), 1.0);
  }
}`;

const UNIFORMS = [
  'uCR', 'uL', 'uPass', 'uDpr', 'uAmb', 'uWrap', 'uTint', 'uRim', 'uRimW', 'uHaze', 'uHazeW', 'uGlow', 'uGlowW',
  'uSpec', 'uSpecPow', 'uGrain', 'uVeil', 'uStrength', 'uHover', 'uNightCol', 'uPaper', 'uSky',
] as const;

/** How strongly the light applies now: the prologue globe only, fading out as
 *  the dive passes zoom 3.2–3.75 (not gated on q — the dive needs its light,
 *  or the silver disc goes flat against the ground). `zoom` is the one the
 *  fade reads, when the camera gives one (see PlanetLightState.zoom). */
export function planetLightStrength(map: MapboxMap, archive: boolean, zoom?: number) {
  if (archive || map.getProjection?.()?.name !== 'globe') return 0;
  return 1 - smoothstep(3.2, 3.75, Number.isFinite(zoom) ? (zoom as number) : map.getZoom());
}

export function createPlanetLight(map: MapboxMap, getState: () => PlanetLightState): PlanetLightLayer {
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let attribute = -1;
  const U: Partial<Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>> = {};
  let lite = false;
  return {
    id: 'planet-light',
    type: 'custom',
    renderingMode: '2d',
    setLite(next: boolean) {
      lite = next;
    },
    onAdd(_map: MapboxMap, gl: WebGLRenderingContext) {
      // A light that cannot compile leaves the silver print unlit; it never
      // throws inside Mapbox's addLayer (that would abort the atlas's onLoad).
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
        gl.deleteShader(shader);
        return null;
      };
      const vertex = compile(gl.VERTEX_SHADER, VERTEX);
      const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
      // The shaders are only needed until the link: flagged for deletion
      // here, GL frees them with the program (or at once, on any failure).
      const dropShaders = () => {
        if (program && vertex) gl.detachShader(program, vertex);
        if (program && fragment) gl.detachShader(program, fragment);
        if (vertex) gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
      };
      program = vertex && fragment ? gl.createProgram() : null;
      if (!program || !vertex || !fragment) {
        program = null;
        dropShaders();
        return;
      }
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      const linked = !!gl.getProgramParameter(program, gl.LINK_STATUS);
      dropShaders();
      if (!linked) {
        gl.deleteProgram(program);
        program = null;
        return;
      }
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      // One triangle that covers the whole screen.
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      attribute = gl.getAttribLocation(program, 'a');
      UNIFORMS.forEach((name) => {
        U[name] = gl.getUniformLocation(program as WebGLProgram, name);
      });
    },
    onRemove(_map: MapboxMap, gl: WebGLRenderingContext) {
      if (program) gl.deleteProgram(program);
      if (buffer) gl.deleteBuffer(buffer);
      program = null;
      buffer = null;
    },
    render(gl: WebGLRenderingContext) {
      if (!program || !buffer || attribute < 0) return;
      const state = getState();
      const strength = planetLightStrength(map, state.archive, state.zoom);
      if (strength < 0.001) return;
      const planet = planetOnScreen(map);
      if (!planet) return;
      const transform = (map as unknown as { transform?: GlobeTransform }).transform;
      const cssWidth = transform?.width || map.getCanvas().clientWidth || 1;
      const cssHeight = transform?.height || map.getCanvas().clientHeight || 1;
      const bufferWidth = gl.drawingBufferWidth;
      const bufferHeight = gl.drawingBufferHeight;
      const dpr = bufferWidth / cssWidth;
      const cx = planet.x * dpr;
      const cy = (cssHeight - planet.y) * dpr;
      const r = planet.r * dpr;
      // Scissor to the disc and its air.
      const margin = r * (1 + 8 * PLANET_LIGHT.glowWidth) + 4;
      const x0 = Math.max(0, Math.floor(cx - margin));
      const y0 = Math.max(0, Math.floor(cy - margin));
      const x1 = Math.min(bufferWidth, Math.ceil(cx + margin));
      const y1 = Math.min(bufferHeight, Math.ceil(cy + margin));
      if (x1 <= x0 || y1 <= y0) return;

      const look = globeLookAt(state.q, state.dawn);
      const light = lightDirection(look.azimuth, look.theta);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.colorMask(true, true, true, true);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x0, y0, x1 - x0, y1 - y0);

      gl.uniform3f(U.uCR ?? null, cx, cy, r);
      gl.uniform3f(U.uL ?? null, light[0], light[1], light[2]);
      gl.uniform1f(U.uDpr ?? null, dpr);
      gl.uniform1f(U.uAmb ?? null, look.ambient);
      gl.uniform1f(U.uWrap ?? null, look.wrap);
      gl.uniform1f(U.uTint ?? null, look.nightTint);
      gl.uniform1f(U.uRim ?? null, PLANET_LIGHT.rim);
      gl.uniform1f(U.uRimW ?? null, PLANET_LIGHT.rimWidth);
      gl.uniform1f(U.uHaze ?? null, look.haze);
      gl.uniform1f(U.uHazeW ?? null, look.hazeWidth);
      gl.uniform1f(U.uGlow ?? null, look.glow);
      gl.uniform1f(U.uGlowW ?? null, PLANET_LIGHT.glowWidth);
      gl.uniform1f(U.uSpec ?? null, lite ? 0 : look.spec);
      gl.uniform1f(U.uSpecPow ?? null, look.specPower);
      gl.uniform1f(U.uGrain ?? null, lite ? 0 : PLANET_LIGHT.grain);
      gl.uniform1f(U.uVeil ?? null, state.veil);
      gl.uniform1f(U.uStrength ?? null, strength);
      gl.uniform1f(U.uHover ?? null, state.hover);
      gl.uniform3f(U.uNightCol ?? null, ...PLANET_LIGHT.nightColor);
      gl.uniform3f(U.uPaper ?? null, ...PLANET_LIGHT.paper);
      gl.uniform2f(U.uSky ?? null, PLANET_LIGHT.sky[0], PLANET_LIGHT.sky[1]);

      gl.enable(gl.BLEND);
      // 1 — multiply: the light.
      gl.blendFunc(gl.DST_COLOR, gl.ZERO);
      gl.uniform1f(U.uPass ?? null, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 2 — over: the night side, after the multiply so it stays olive.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(U.uPass ?? null, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 3 — screen: the air and the glint.
      if (!lite || state.hover > 0) {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        gl.uniform1f(U.uPass ?? null, 2);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.disableVertexAttribArray(attribute);
    },
  } as PlanetLightLayer;
}
