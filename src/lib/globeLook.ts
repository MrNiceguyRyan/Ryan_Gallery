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
// - Toned, first. The whites at 0.68, then 0.56 (the glare was the
//   deserts': at 0.68 the desert alone right of the rail was 85–88 and the
//   phone's 84–89, inside the band the owner had called 太亮), the colour
//   down by 0.46, the floor at 0.04 and a sea tint of #383f37. The deserts
//   were right (sd 22–29, twice the grey's depth), but by the sea the land
//   had gone down to the water's own tone: the coast (the land within 12 px
//   of the sea less the sea within 12 px of the land) +2 at Miami, Orlando
//   and New York, +1 on the phone and −2 at the phone's New York, the land
//   there darker than the sea — the coastline in hue only, and New York's
//   frame (31) no deeper than the grey card's (43). The forests, under the
//   colour's cut and the low whites, sat at the lifted sea's 38–47.
// - Now. The floor lifts to 0.10 and the sea's tint goes down a step
//   (#2b322c), so the land stands over the water again; the whites stop at
//   0.53 and the colour comes down by 0.38, not 0.46 (the lift takes the
//   saturation with it); the contrast (0.24) and the hue (−8, the greens
//   toward olive) stay. A lower contrast (0.12) lifts the sea as much as
//   the land (the coast +2 to +2.5, the phone's New York −1), and the floor
//   alone (0.10 over the old tint) lifts both: +4 to +5, the phone +1 to +4.
//   The coast now: +8.4 at Miami and Orlando, +6.5 at New York (the grey's
//   +7 to +8), the phone +6.5, +6.5 and +3.9. Miami
//   42 / 12 / 0.20, Orlando 43, New York 41; Page 61 / 27 / 0.27 (p99 120,
//   it was 126), Zion 58, Bryce 61; the whole planet 47 / 17 / 0.18 in
//   space of 31, the open sea 33 (the Atlantic, the Gulf). The phone: 35–39
//   by the sea, 73–77 in the desert. The desert alone, right of the rail:
//   75–76 (its land 82–84), where the bright pass's was 129–132.
// The same grade on the planet the page brings up (PLANET_PAINT) and on the
// reader's map (STOCK_PAINT): nothing changes colour on the way down (the two
// layers at one camera inside SILVER_EXIT differ by 0.02 of 255 per channel;
// the dive's frames step at most 1.4 luma once the planet is up).
const ATLAS_GRADE = {
  'raster-saturation': -0.38,
  'raster-contrast': 0.24,
  'raster-brightness-min': 0.1,
  'raster-brightness-max': 0.53,
  'raster-hue-rotate': -8,
} as const;
export const STOCK_PAINT = ATLAS_GRADE;
export const PLANET_PAINT = ATLAS_GRADE;
/** The seas: a dark olive-grey laid over the imagery's water (the basemap's
 *  own water polygons, a fill over the photograph), under the light, the
 *  route and the names — the page's own ink, so the land by the sea stands
 *  over it (the coasts above). Over the grade's 0.10 floor the open sea
 *  still sits just over the space round the whole planet (the Atlantic and
 *  the Gulf 33, space 31), and the planet reads as a sphere. At 0.04 this
 *  tint sat under the space (a dark hole in a ring of air), so the first
 *  toned pass lifted it to #383f37 — level with the forests, the coast
 *  gone. The tint lifts the photograph's own water, which is darker still:
 *  thinner (0.34, over the first pass's grade) the open sea fell to 20 in
 *  space of 31, the rests to 25–34. */
export const WATER_TINT = { color: '#2b322c', opacity: 0.5 } as const;
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
// the palette), the archive's space round it darker than the page so the
// planet stands out. The air on the planet the page brings up comes from
// the light, on the lit limb (planetLight); the fog keeps a whisper of bone
// there. Its space is the page's own ground (#282c20): the planet rises
// behind the entrance while the entrance still scrolls up over it, and the
// entrance's bottom edge must meet the space in one tone. The dive ramps it
// to the archive's (#1d2117, RouteAtlas GLOBE_FOG) once the entrance has
// gone (DIVE_SPACE_ZOOMS). The archive's space from the start (e00f013) put a
// straight seam of 8–11 luma across the whole screen for 0.6 s after the
// tear; on the page's ground the widest step at the screen's two edges is
// 1.5, the grain. The cost: the planet's night side (the Pacific) rises dark
// on the page's ground, as the first toned pass's did — its lower-left rim
// (20–60 px inside the limb against 20–60 px outside) 12–19 of luma under
// the ground from zoom 2.6 to 3.8, about 0.7 s (the first toned pass −19 at
// worst; the archive's space from the start −9). The lite light (weak GPUs)
// draws no air, so its fog carries the rim instead.
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
