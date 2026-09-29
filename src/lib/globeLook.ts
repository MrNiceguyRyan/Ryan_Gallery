// ── The globe's look: a key-lit, split-toned print ──
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
// A split-toned print of the photograph: its shadows toward the page's olive
// ink, its highlights toward bone, its colour kept at about half — the planet
// printed on the site's own stock rather than pasted over it. How it got here
// (every place's rest and the whole planet, 1728 × 1000 at dpr 2, the
// interface hidden: Rec. 709 luma 0–255 / its sd / mean HSV saturation; the
// page's ground #282c20 is 42):
// - Grey. The planet printed in silver (its luminance through an olive ramp)
//   and the reader's map under a grey lift (floor 0.15, whites 0.58, colour
//   −40%, three-quarters strength, a 16% tone, a grey-olive haze): ~50 / ~7.5
//   / 0.11, a flat grey card. Owner, 2026-09-29: 整个地球的模型有点丑…有点灰灰
//   的，我想要精致和明亮一点.
// - Bright (the same day). The photograph whole in its own colour (saturation
//   0, contrast 0.1, whites 0.94, a blue-green sea, a blue air): Miami 66,
//   Page 102, the whole planet 77 at 0.48–0.56, the phone's Zion 133 — a
//   satellite screenshot in a dark print archive. Owner: 地球可以再优化一下，
//   太亮了也和整体网站风格差异过大.
// - Now. The whites stop at 0.68 (the glare was the deserts'), the colour
//   comes down by 0.46 — half, not the grey's washout — and a firmer contrast
//   (0.24) keeps it crisp rather than dull; the hue a few degrees warmer (the
//   greens toward olive). Miami 41 / 14 / 0.24, Orlando 43, New York 39,
//   Page 68 / 37 / 0.30 (p99 152), Zion 64, Bryce 67; the whole planet 46 /
//   21 / 0.23 in space of 31; the phone 32–38 by the sea and 84–89 in the
//   desert. A third calmer than the bright pass, and up to five times the
//   grey's depth (sd 11–37 against its ~7.5).
// The same grade on the planet the page brings up (PLANET_PAINT) and on the
// reader's map (STOCK_PAINT): nothing changes colour on the way down (the two
// layers at one camera inside SILVER_EXIT differ by 0.05 of 255 per channel;
// the dive's frames step at most 1.3 luma once the planet is up).
const ATLAS_GRADE = {
  'raster-saturation': -0.46,
  'raster-contrast': 0.24,
  'raster-brightness-min': 0.04,
  'raster-brightness-max': 0.68,
  'raster-hue-rotate': -8,
} as const;
export const STOCK_PAINT = ATLAS_GRADE;
export const PLANET_PAINT = ATLAS_GRADE;
/** The seas: a dark olive-grey laid over the imagery's water (the basemap's
 *  own water polygons, a fill over the photograph), under the light, the
 *  route and the names — the page's ink a step lifted, so on the whole
 *  planet the open sea sits just over the space round it (the Atlantic 33,
 *  the Gulf 32, space 31) and the planet reads as a sphere. One step darker
 *  (#2b322c) it sat under the space: a dark hole in a ring of air. */
export const WATER_TINT = { color: '#383f37', opacity: 0.5 } as const;
// The planet's paint's way out on the dive onto the reader's map's: a
// crossfade of two layers (RouteAtlas, `writeSatelliteVeil`) across these
// zooms. The two carry one grade now, so it is invisible; the two layers
// stay (one source each: the draped globe's overlap stencil masked a second
// layer on one source mid-dive).
export const SILVER_EXIT: readonly [number, number] = [3.5, 5];

/** The reader's map's paint's share at `zoom` on the way down (0: all the
 *  planet's layer, 1: all the map's), quantised to 1/50 so the layers are
 *  written only as it moves. */
export function silverExitAt(zoom: number) {
  return Math.round(50 * clamp01((zoom - SILVER_EXIT[0]) / (SILVER_EXIT[1] - SILVER_EXIT[0]))) / 50;
}

// The light's own floor lift (globeLookAt): across FLOOR_Q of the prologue.
export const FLOOR_Q: [number, number] = [0.12, 0.32];
/** The floor lift `k` at prologue progress q, quantised to 1/25. */
export function silverFloorAt(q: number) {
  return Math.round(25 * smoothstep(FLOOR_Q[0], FLOOR_Q[1], q)) / 25;
}

// ── The air ──
// A thin atmosphere: the planet's limb crisp, a narrow bone glow on it (the
// site's own type colour; it was a pale sky blue under the bright pass, off
// the palette), the space round it darker than the page so the planet stands
// out. The air on the planet the page brings up comes from the light, on the
// lit limb (planetLight); the fog keeps a whisper of bone there, and its
// space is the page's own ground (the planet rises over the page). The lite
// light (weak GPUs) draws no air, so its fog carries the rim instead.
export const SILVER_FOG = {
  range: [10, 20] as [number, number],
  color: 'rgba(190, 214, 226, 0)',
  'high-color': 'rgba(220, 218, 200, 0.08)',
  'space-color': '#282c20',
  'horizon-blend': 0.012,
  'star-intensity': 0,
};
export const SILVER_FOG_LITE = { ...SILVER_FOG, 'high-color': 'rgba(220, 218, 200, 0.18)' };

// ── The light ──
// Constant shader values. The key light's direction, the ambient floor and the
// night tint change with the scroll (globeLookAt below).
export const PLANET_LIGHT = {
  // The limb a quiet, crisp hairline (2026-09-29, 太亮…: it was 0.34 at
  // 0.035, a soft bright halo round the whole planet).
  rim: 0.28,
  rimWidth: 0.028,
  // The air and the glint once the page is under way (from FLOOR_Q's end);
  // the first screen keeps the approved frame's softer, wider light
  // (FIRST_SCREEN_LIGHT) and eases into these across FLOOR_Q. Quieter since
  // the review of 2026-09-28 (晃眼): the lit limb was a bright crescent
  // swept across the view by the entry's turn (0.42 / 0.09).
  haze: 0.04,
  hazeWidth: 0.24,
  glow: 0.12,
  glowWidth: 0.012,
  sky: [-0.05, 0.95] as [number, number],
  spec: 0.06,
  specPower: 24,
  grain: 0.05,
  // The night side and the air, in the site's own palette (2026-09-29,
  // 太亮了也和整体网站风格差异过大): the unlit side the page's ink (#171b15,
  // a step under the space's #1d2117), the air bone (#f4f4ed, the type's
  // colour). The bright pass's blue-black night and sky-blue air (0.035,
  // 0.055, 0.085 / 0.8, 0.89, 0.97) were a satellite render's, not the
  // archive's. The glint (0.1 → 0.06) and the lit limb's glow (0.14 →
  // 0.12) came down with them.
  nightColor: [0.09, 0.106, 0.082] as [number, number, number],
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
    // Where the swing lands (the planet the torn pass brings up): the far
    // side falls to 0.45 of the lit one, the page's ink laid over it at 0.28,
    // the terminator's wrap 0.5 — the planet reads round, its night the
    // page's own dark rather than a grey third (2026-09-29, the toned print;
    // 0.6 / 0.12 / 0.6 under the bright pass, 0.34 / 0.25 under the silver).
    ambient: lerp(lerp(0.14, 0.3, floor), 0.45, swing),
    nightTint: lerp(lerp(0.55, 0.4, floor), 0.28, swing),
    wrap: lerp(0.38, 0.5, swing),
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
