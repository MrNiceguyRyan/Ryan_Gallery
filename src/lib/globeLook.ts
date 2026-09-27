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
export const SILVER_MIX = [0.2126, 0.7152, 0.0722, 0] as [number, number, number, number];
export const SILVER_RAMP: Array<[number, string]> = [
  [0.0, '#1a1e14'],
  [0.06, '#2b3224'],
  [0.14, '#383f2e'],
  [0.25, '#4f553f'],
  [0.4, '#76775e'],
  [0.56, '#a09d83'],
  [0.72, '#c4bfa5'],
  [0.87, '#dcd8c3'],
  [1.0, '#e9e6d8'],
];
// Where the ramp's darkest four stops lift to once the page is under way, so
// the ocean reads one step above the page ground instead of as a hole in it.
// The first screen keeps the deep ocean; the lift runs across FLOOR_Q.
export const SILVER_FLOOR = ['#363b2d', '#3b4131', '#434a36', '#51573f'];
export const FLOOR_Q: [number, number] = [0.12, 0.32];
// The archive's own paint for the same layer (what it had before the grade):
// below SILVER_EXIT_ZOOM the satellite is only a residual veil under the dark
// atlas, and the chapters must look exactly as they did.
export const STOCK_PAINT = {
  'raster-saturation': -0.32,
  'raster-contrast': 0.08,
  'raster-brightness-max': 0.86,
} as const;
export const SILVER_EXIT_ZOOM = 4.5;
export const SILVER_EXIT_HYSTERESIS = 0.1;

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
    'raster-brightness-max': 1,
  };
}

/** The stock paint: no colour mapping (undefined resets each key). */
export function stockPaint(): Record<string, unknown> {
  return {
    'raster-color': undefined,
    'raster-color-mix': undefined,
    'raster-color-range': undefined,
    ...STOCK_PAINT,
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
  // (FIRST_SCREEN_LIGHT) and eases into these across FLOOR_Q.
  haze: 0.09,
  hazeWidth: 0.24,
  glow: 0.42,
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
  /** Opacity of the faint prologue graticule, quantised to 1/200. */
  graticule: number;
}

/** The single source for everything that changes with the scroll: the key
 *  light starts upper left, from the name's side, and swings round onto the
 *  archive's places by the index step; the ocean floor lifts once the page is
 *  under way; a faint graticule shows mid-prologue only (never on the first
 *  screen). `dawn` (0..1) sweeps the light in from behind the planet on load. */
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
    graticule: Math.round(200 * 0.1 * smoothstep(0.28, 0.42, q) * (1 - clamp01((q - 0.9) / 0.09))) / 200,
  };
}

/** The key light as a unit vector in screen space (x right, y up, z toward
 *  the reader). */
export function lightDirection(azimuthDeg: number, thetaDeg: number): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const th = (thetaDeg * Math.PI) / 180;
  return [Math.cos(az) * Math.sin(th), Math.sin(az) * Math.sin(th), Math.cos(th)];
}

// ── The turn ──
/** The prologue's turn runs WEST: Asia, Africa, the Atlantic, the Americas.
 *  The bridge's roll winds back from the last chapter (New York) to the first
 *  (Miami), and each place lights as its frames pass only once it faces the
 *  reader (src/lib/bridgeRoll.ts): turning west, New York comes round first
 *  and the canyons follow, in the roll's own order. (It used to turn east,
 *  across the Pacific, and New York came into view last.) The centre is
 *  target + A·(1 − q)³ + B·(1 − q): quick while the planet sits in the corner,
 *  slow as it glides in. A + B is the whole turn, chosen so the first screen
 *  keeps its face: ≈ 115°E once the load-in has settled, drifting west over
 *  India toward ≈ 85°E, it faces 90–97°E through the first seconds, as the
 *  eastward drift did. `dir` is the way the centre's longitude goes as the
 *  page scrolls, for the eggs' pin (src/lib/globeEgg.ts). */
export const PROLOGUE_TURN = { A: 121, B: 74, dir: -1 } as const;

/** How many degrees of the prologue's turn are still to come at progress q
 *  (a magnitude; the turn goes PROLOGUE_TURN.dir). The idle drift is folded
 *  INTO the turn rather than faded out beside it: fading it out across
 *  q 0.28–0.5 ran against the scroll's own turn and the globe stalled, then
 *  turned back. The drift turns the same way as the scroll and is consumed by
 *  it, so the centre only ever moves one way for any drift below the whole
 *  turn, and the turn still ends exactly on the target at q = 1. */
export function prologueTurnRemaining(q: number, drift: number) {
  const u = 1 - clamp01(q);
  const { A, B } = PROLOGUE_TURN;
  return (A * u * u * u + B * u) * (1 - drift / (A + B));
}

/** The prologue globe's longitude before the cursor lean and any egg: the
 *  target plus the turn still to come and the load-in settle, both of which
 *  it turns off westward. */
export function prologueNaturalLongitude(targetLongitude: number, q: number, drift: number, settle = 0) {
  return targetLongitude - PROLOGUE_TURN.dir * (prologueTurnRemaining(q, drift) + settle);
}

// ── The prologue graticule ──
/** 24 meridians and 11 parallels, densified every 2.5° so they curve on the
 *  globe. Drawn in white ink under the route, never on the first screen. */
export function globeGraticule() {
  const features: Array<{
    type: 'Feature';
    properties: Record<string, never>;
    geometry: { type: 'LineString'; coordinates: [number, number][] };
  }> = [];
  for (let longitude = -180; longitude < 180; longitude += 15) {
    const coordinates: [number, number][] = [];
    for (let latitude = -75; latitude <= 75; latitude += 2.5) coordinates.push([longitude, latitude]);
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
  }
  for (let latitude = -75; latitude <= 75; latitude += 15) {
    const coordinates: [number, number][] = [];
    for (let longitude = -180; longitude <= 180; longitude += 2.5) coordinates.push([longitude, latitude]);
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
  }
  return { type: 'FeatureCollection' as const, features };
}

// ── The shared channel ──
/** Where the BULB egg's photograph is. 'motion' is a fling under way (the
 *  shutter smear follows `spin` in every phase); 'wind' is the motor turning
 *  to the place before the shutter opens; 'open' is the long exposure itself;
 *  'develop' the frozen exposure developing back into the live globe from
 *  `closedAt`. `target` is the place it settles on (a route index), `u` the
 *  develop's progress, `still` reduced motion's exposure of a globe that does
 *  not move. Times are performance.now() ms. */
export interface EggExposure {
  phase: 'off' | 'motion' | 'wind' | 'open' | 'develop';
  openedAt: number;
  closedAt: number;
  target: number;
  u: number;
  still: boolean;
}

/** The one object the prologue camera, the light and the globe's easter eggs
 *  share. RouteAtlas's draw loop stays the ONLY camera writer: an egg changes
 *  numbers here and calls `requestDraw()`; the light reads `hover`, `dawn` and
 *  `veil`, and the egg layers (src/lib/eggExposure.ts) read `spin`,
 *  `exposure`, `pool` and `wantPrint`, on their next render. Kept in a ref, so
 *  it survives the camera effect's restarts (resize, Story close). */
export interface GlobeChannel {
  /** Egg state; 'idle' when nobody is playing. */
  mode: string;
  /** Degrees added to the natural longitude. */
  offset: number;
  /** A longitude the globe is held on while the scroll catches up (NaN: none). */
  pin: number;
  /** A small give added outside everything else (the hint, a click's reply). */
  wobble: number;
  /** Freezes the idle drift and the cursor lean while a hand is on the globe. */
  driftFrozen: boolean;
  leanFrozen: boolean;
  /** The pointer's hover glow (0..1). */
  hover: number;
  /** The globe's spin under an egg (°/s), written from the KNOWN motion — the
   *  drag's samples, the coast's closed form, the motor — never from render
   *  deltas. The shutter smears the print by |spin|/30 degrees. */
  spin: number;
  exposure: EggExposure;
  /** The white-ink route and stop marks are cut (the camera applies it on a
   *  change only): off the smeared print, and out of the photograph. */
  marksHidden: boolean;
  /** The darkroom dodge on a landed place (route index, 0..1, σ in degrees). */
  pool: { index: number; amount: number; sigma: number };
  /** Read the finished exposure back once, on the first frame after release,
   *  for the BULB ticket's print (handed to `onPrint`). */
  wantPrint: boolean;
  onPrint: (image: ImageData) => void;
  /** The egg layers may hold their render targets (a hand is near). */
  warm: boolean;
  /** His places, [lng, lat] in chapter order: what the exposure burns in and
   *  the dodge finds. */
  places: ReadonlyArray<readonly [number, number]>;
  /** Written by the camera each prologue frame: the natural longitude (the
   *  scroll's turn, the drift, the settle and the cursor lean) and the degrees
   *  of turn the scroll still has to make. */
  natural: number;
  remaining: number;
  /** Idle drift in degrees, eased toward the prologue's driftMax. */
  drift: number;
  /** The load-in: the canvas is shown once its first tiles are in; the dawn
   *  sweeps the light round (0..1) while the veil (1..0) lifts off the night side. */
  revealed: boolean;
  dawn: number;
  veil: number;
  /** The light's lighter pass is on (weak GPU). */
  lite: boolean;
  /** The composed longitude (an egg replaces this; the default adds `offset`). */
  compose: (natural: number, q: number) => number;
  /** Ask the camera for a frame (and wake the idle loop). Set by the camera effect. */
  requestDraw: () => void;
}

export function createGlobeChannel(): GlobeChannel {
  const channel: GlobeChannel = {
    mode: 'idle',
    offset: 0,
    pin: Number.NaN,
    wobble: 0,
    driftFrozen: false,
    leanFrozen: false,
    hover: 0,
    spin: 0,
    exposure: { phase: 'off', openedAt: 0, closedAt: 0, target: -1, u: 0, still: false },
    marksHidden: false,
    pool: { index: -1, amount: 0, sigma: 10 },
    wantPrint: false,
    onPrint: () => {},
    warm: false,
    places: [],
    natural: Number.NaN,
    remaining: 0,
    drift: 0,
    revealed: false,
    dawn: 0,
    veil: 1,
    lite: false,
    compose: (natural) => natural + channel.offset,
    requestDraw: () => {},
  };
  return channel;
}
