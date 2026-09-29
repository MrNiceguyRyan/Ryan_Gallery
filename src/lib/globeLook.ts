// ── The prologue globe's look: a key-lit silver print ──
// Everything here is pure: constants, the q-schedule and the paint values the
// atlas writes onto the one `prologue-satellite` layer. RouteAtlas owns the
// camera and the writes; src/lib/planetLight.ts draws the light from these
// numbers. Every value was measured on the built page (1728×1000 and 1280×800
// at dpr 2) before it was written down here.

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

// ── The grade ──
// The satellite photograph is printed in silver: its luminance is mapped
// through an olive-to-paper ramp instead of being desaturated in colour. The
// top of the ramp stops at #e9e6d8 — at paper white the Sahara blew out at a
// quarter of the scroll and outshone the name.
// Owner, 2026-09-28 (到主页的时候…有点晃眼): the disc was still the brightest
// thing on arrival — p99 224/255 at dpr 2, 4.6% of the screen over 200, and
// the entry then turned the Sahara and Arabia across the view at that
// brightness. The top four stops come down a step (the print keeps its
// shadows and its olive): the highlights now stop at a warm grey, #c6c2b2.
// Measured at dpr 2 with the type hidden: 0.15% of the screen over 200
// (was 4.6%), the disc's 99th percentile under 195 (was 224).
export const SILVER_MIX = [0.2126, 0.7152, 0.0722, 0] as [number, number, number, number];
export const SILVER_RAMP: Array<[number, string]> = [
  [0.0, '#1a1e14'],
  [0.06, '#2b3224'],
  [0.14, '#383f2e'],
  [0.25, '#4f553f'],
  [0.4, '#76775e'],
  [0.56, '#96937b'],
  [0.72, '#aca78f'],
  [0.87, '#bcb7a3'],
  [1.0, '#c6c2b2'],
];
// Where the ramp's darkest four stops lift to once the page is under way, so
// the ocean reads one step above the page ground instead of as a hole in it.
// The first screen keeps the deep ocean; the lift runs across FLOOR_Q.
export const SILVER_FLOOR = ['#363b2d', '#3b4131', '#434a36', '#51573f'];
export const FLOOR_Q: [number, number] = [0.12, 0.32];
// The archive's own paint for the same layer (what it had before the grade):
// past SILVER_EXIT the satellite is only a residual veil under the dark
// atlas, and the chapters must look exactly as they did.
// Lifted 2026-09-28 with the residual (RouteAtlas): the owner found the
// chapters' ground too dark. Then, the same day, the lift glared (到主页的时候，
// 我感觉从视觉上来看有点晃眼，有点晕): a mean luma of 86/255 at rest, the
// Bahamas' shallows and the Sonoran desert blowing out, the saturation of a
// travel brochure. Settled between the two: a quieter colour, a softer
// contrast, the whites capped short of paper (no blown highlight), the deep
// water's floor kept a touch above black so the sea still reads as sea.
// Measured in headless Chrome at every place's rest, 1728×1000, the
// interface hidden (Rec. 709 luma, 0–255, mean over the six places): the
// old dark paint 36, the lift 86, then 63; saturation 0.26 → 0.22; the
// 99th-percentile highlight 149 → 110; the spread (sd) 26 → 18. The review
// that followed found the places themselves 48–79 apart (the desert of Page
// and Bryce against the sea off Miami): the top end capped lower, the floor
// lifted, the contrast and the colour softened again, so the sea comes up
// and the desert down. Measured the same way under the held 24° camera (dpr
// 2): Miami 54, Orlando 58, Page 70, Zion 63, Bryce 67, New York 59 — mean
// 62, where the paint before this measured 45–75.
export const STOCK_PAINT = {
  'raster-saturation': -0.4,
  'raster-contrast': -0.35,
  'raster-brightness-min': 0.15,
  'raster-brightness-max': 0.58,
} as const;
// The silver print's way out on the dive: the archive's own paint on a second
// layer over the same tiles, crossfaded in across these zooms at the veil's
// strength (RouteAtlas, `writeSatelliteVeil`) — no longer a swap hidden in a
// dip of the veil to 10%, which blinked the whole frame dark two seconds
// before the landing.
export const SILVER_EXIT: readonly [number, number] = [3.5, 5];

/** The archive's paint's share at `zoom` on the way down (0: all silver, 1:
 *  all the archive's), quantised to 1/50 so the layers are written only as
 *  it moves. Straight in the zoom, across most of the dive: the dive is
 *  fastest in its middle, and an eased share there darkened the frame ~17
 *  steps of luma a second. */
export function silverExitAt(zoom: number) {
  return Math.round(50 * clamp01((zoom - SILVER_EXIT[0]) / (SILVER_EXIT[1] - SILVER_EXIT[0]))) / 50;
}

const hexChannels = (hex: string) => {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
const mixHex = (from: string, to: string, t: number) => {
  const a = hexChannels(from);
  const b = hexChannels(to);
  return `#${a.map((channel, index) => Math.round(channel + (b[index] - channel) * t).toString(16).padStart(2, '0')).join('')}`;
};

/** The floor lift `k` at prologue progress q, quantised to 1/25 so the ramp
 *  (a 256-entry texture Mapbox rebuilds per write) changes 25 times at most. */
export function silverFloorAt(q: number) {
  return Math.round(25 * smoothstep(FLOOR_Q[0], FLOOR_Q[1], q)) / 25;
}

/** `raster-color` for the silver print with the floor lifted by k (0..1).
 *  A constant expression on purpose: zoom-driven raster paint is evaluated per
 *  tile on the draped globe and leaves rectangular seams mid-dive. */
export function silverRamp(k: number): unknown[] {
  const stops: unknown[] = [];
  SILVER_RAMP.forEach(([value, color], index) => {
    const floor = SILVER_FLOOR[index];
    stops.push(value, floor ? mixHex(color, floor, k) : color);
  });
  return ['interpolate', ['linear'], ['raster-value'], ...stops];
}

/** The full silver paint for `prologue-satellite` (raster-opacity is left to
 *  the atlas, which keeps its own zoom fade). */
export function silverPaint(k: number): Record<string, unknown> {
  return {
    'raster-color-mix': SILVER_MIX,
    'raster-color-range': [0, 1],
    'raster-color': silverRamp(k),
    'raster-saturation': 0,
    'raster-contrast': 0,
    // The stock paint lifts the floor; the silver print keeps its own.
    'raster-brightness-min': 0,
    'raster-brightness-max': 1,
  };
}

// ── The air ──
// Mapbox's own atmosphere drew a wide white halo all the way round. The air
// now comes from the light, on the lit limb only; the fog keeps just a whisper
// of high colour. The lite light (weak GPUs, see planetLight) draws no air, so
// its fog carries the rim instead.
export const SILVER_FOG = {
  range: [9, 20] as [number, number],
  color: 'rgba(244, 244, 237, 0)',
  'high-color': 'rgba(214, 217, 208, 0.05)',
  'space-color': '#282c20',
  'horizon-blend': 0.02,
  'star-intensity': 0,
};
export const SILVER_FOG_LITE = { ...SILVER_FOG, 'high-color': 'rgba(214, 217, 208, 0.12)' };

// ── The light ──
// Constant shader values. The key light's direction, the ambient floor and the
// night tint change with the scroll (globeLookAt below).
export const PLANET_LIGHT = {
  rim: 0.34,
  rimWidth: 0.035,
  // The air and the glint once the page is under way (from FLOOR_Q's end);
  // the first screen keeps the approved frame's softer, wider light
  // (FIRST_SCREEN_LIGHT) and eases into these across FLOOR_Q. Quieter since
  // the review of 2026-09-28 (晃眼): the lit limb was a bright crescent
  // swept across the view by the entry's turn (0.42 / 0.09).
  haze: 0.04,
  hazeWidth: 0.24,
  glow: 0.14,
  glowWidth: 0.012,
  sky: [-0.05, 0.95] as [number, number],
  spec: 0.1,
  specPower: 24,
  grain: 0.05,
  nightColor: [0.118, 0.13, 0.098] as [number, number, number],
  paper: [0.957, 0.957, 0.929] as [number, number, number],
  // Where the light arrives from before the dawn has swept it round (deg
  // away from the viewer: behind the planet).
  dawnTheta: 128,
} as const;
// The first screen as the owner approved it (the look C frame): a broad, soft
// sheen on the lit ocean and a little more air on the limb. Cut back once the
// scroll is under way, where at these values the lit limb glowed well past
// the edge and the Sahara went to paper at a quarter of the scroll.
export const FIRST_SCREEN_LIGHT = {
  spec: 0.18,
  specPower: 12,
  haze: 0.14,
  hazeWidth: 0.3,
  glow: 0.5,
} as const;

export interface GlobeLookValues {
  /** Light swing 0..1 (runs slightly ahead of the camera's glide). */
  swing: number;
  /** Floor lift 0..1, quantised. */
  floor: number;
  /** Key light azimuth in the screen plane (deg, 0 = right, 90 = up). */
  azimuth: number;
  /** Key light angle away from the viewer (deg). */
  theta: number;
  ambient: number;
  nightTint: number;
  wrap: number;
  spec: number;
  specPower: number;
  /** The lit limb's air: inner haze (strength, width) and the glow outside. */
  haze: number;
  hazeWidth: number;
  glow: number;
}

/** The look at the prologue's progress q: the key light from upper left
 *  swung round onto the archive's places by q = 1, the ocean floor lifted.
 *  The globe the torn pass brings up is drawn at q = 1 (RouteAtlas); the
 *  curve is kept whole, as measured, for the light's own sake. `dawn` (0..1)
 *  sweeps the light in from behind the planet. */
export function globeLookAt(q: number, dawn = 1): GlobeLookValues {
  const swing = smootherstep(clamp01((q - 0.45) / (0.8 - 0.45)));
  const floor = silverFloorAt(q);
  const thetaRest = lerp(72, 34, swing);
  // The first screen's light eases out across FLOOR_Q.
  const underway = smoothstep(FLOOR_Q[0], FLOOR_Q[1], q);
  return {
    swing,
    floor,
    azimuth: lerp(150, 118, swing),
    theta: lerp(PLANET_LIGHT.dawnTheta, thetaRest, clamp01(dawn)),
    // The floor ends at 0.3, not 0.24: at q 0.4–0.5 the disc is almost all
    // Pacific, and its unlit third read darker than the page itself — a hole
    // beside the chapter count.
    ambient: lerp(lerp(0.14, 0.3, floor), 0.34, swing),
    nightTint: lerp(lerp(0.55, 0.4, floor), 0.25, swing),
    wrap: lerp(0.38, 0.6, swing),
    spec: lerp(FIRST_SCREEN_LIGHT.spec, PLANET_LIGHT.spec, underway) * lerp(1, 0.5, swing),
    specPower: lerp(FIRST_SCREEN_LIGHT.specPower, PLANET_LIGHT.specPower, underway),
    haze: lerp(FIRST_SCREEN_LIGHT.haze, PLANET_LIGHT.haze, underway),
    hazeWidth: lerp(FIRST_SCREEN_LIGHT.hazeWidth, PLANET_LIGHT.hazeWidth, underway),
    glow: lerp(FIRST_SCREEN_LIGHT.glow, PLANET_LIGHT.glow, underway),
  };
}

/** The key light as a unit vector in screen space (x right, y up, z toward
 *  the reader). */
export function lightDirection(azimuthDeg: number, thetaDeg: number): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const th = (thetaDeg * Math.PI) / 180;
  return [Math.cos(az) * Math.sin(th), Math.sin(az) * Math.sin(th), Math.cos(th)];
}

// ── The shared channel ──
/** The one object the globe's camera and its light share. RouteAtlas's draw
 *  loop stays the ONLY camera writer; the light reads `hover`, `dawn` and
 *  `veil` on its next render. Kept in a ref, so it survives the camera
 *  effect's restarts (resize, Story close). (It carried the first screen's
 *  easter eggs too — the spin, the pin, the long exposure — until the globe
 *  left the first screen, 2026-09-28: the entrance's opening words and the
 *  boarding pass are there now, and the globe only rises once the pass is
 *  torn, on its way down to stop 01.) */
export interface GlobeChannel {
  /** The pointer's hover glow (0..1): none since the eggs went (the light
   *  still reads it). */
  hover: number;
  /** The load-in: the canvas is shown once its first tiles are in; the dawn
   *  (0..1) and the veil (1..0) are the light's, at their ends now (the globe
   *  rises already lit). */
  revealed: boolean;
  dawn: number;
  veil: number;
  /** The light's lighter pass is on (weak GPU). */
  lite: boolean;
  /** Ask the camera for a frame. Set by the camera effect. */
  requestDraw: () => void;
}

export function createGlobeChannel(): GlobeChannel {
  return {
    hover: 0,
    revealed: false,
    dawn: 1,
    veil: 0,
    lite: false,
    requestDraw: () => {},
  };
}
