// ── The prologue globe's two easter eggs, as pure maths ──
// Every beat is a photographic operation on the silver print; nothing new is
// drawn onto the map except the white-ink landing ring and its leader.
// Egg 1, the desk globe: grab the planet in the corner and fling it. It is
// shot at 1/30 s, so the land smears along its own rotation while it spins;
// it coasts like a globe on its meridian mount and always comes to rest with
// one of the archive's places in front. The place is dodged (the lamp finds
// it) and the archive's own ADMIT ONE ticket is dealt beside it.
// Egg 2, BULB: press and hold still. The globe winds round to the nearest of
// his places ahead, the shutter opens, and a real long exposure of the print
// builds up while it settles, his six places burning in as light. Let go and
// the exposure develops back into the live globe, dark tones first.
//
// Everything here is pure (constants, the coast and exposure planners, the
// pin, the hand-back, the ticket's placement) so it can be
// unit-tested (scripts/globe-egg.test.mjs). src/components/home/GlobeEggs.tsx
// is the controller and the DOM; src/lib/eggExposure.ts draws the shutter, the
// exposure, the burn and the dodge. The ticket tears on the archive's own
// score, src/lib/ticketTear.ts. RouteAtlas's camera stays the only thing
// that ever moves the map.

export const EGG = {
  // Telling the two apart: a hand that holds still this long (within SLOP css
  // px of where it pressed) opens the shutter; one that moves first spins.
  HOLD_MS: 450,
  SLOP: 6,
  // Only on the first screen (prologue progress below this).
  Q_MAX: 0.2,
  // The fling: velocity from the last VEL_WINDOW ms of the drag, clamped.
  // Slower than FLICK and the globe only drifts on a little (a nudge).
  VEL_WINDOW: 90,
  VMAX: 720,
  FLICK: 80,
  NUDGE_TAU: 380,
  // The detent: a coast always stops with a place LAND_WEST° west of the
  // centre meridian — under the upper-left key light it sits in the lit part
  // of the cap, not at the dusk edge.
  LAND_WEST: 14,
  // A free globe given |v| would roll about NATURAL_S·|v| degrees; the planner
  // aims a little short of that (AIM) and never stops sooner than MIN_TRAVEL,
  // so every fling reads as a spin, not a nudge that snaps.
  NATURAL_S: 0.9,
  MIN_TRAVEL: 100,
  AIM: 0.85,
  // Coast time grows with the distance over the speed, clamped. From a
  // landed place every other place is either inside MIN_TRAVEL or most of a
  // turn away, so a repeat fling travels ~250–330° and ran into the old 4.2 s
  // cap every time, creeping the last second like a motor; at 3.4 s it still
  // leaves at the fling's speed for any release over ~120°/s.
  K_T: 2.0,
  T_MIN: 1.3,
  T_MAX: 3.4,
  BULB_K_T: 2.0,
  BULB_T_MAX: 2.8,
  // Places dealt in the last few plays cost this many degrees more to land
  // on again (most recent first). The three canyon places sit 1–2° apart, and
  // Orlando 1.2° from Miami, so a hand could only ever stop on the one nearest
  // its aim; remembering only two, flings played left-right-left kept dealing
  // Zion, Bryce, New York and Miami (Page never came up in 18). Over all four
  // remembered plays every place comes round, and the coast still leaves at
  // the fling's speed.
  REPEAT_COST: [120, 90, 60, 30] as readonly number[],
  // Hand-back: a globe left ahead of the scroll is pinned there (the scroll
  // catches up, the turn never runs backwards) when it is at least PIN_W° ahead
  // and at most PIN_SLACK° past where the scroll will ever bring it; anything
  // else eases home the short way in RETURN_MS.
  PIN_W: 10,
  PIN_SLACK: 40,
  RETURN_MS: 900,

  // ── The shutter (the fling) ──
  // The globe is shot at SHUTTER_S: the print smears by |spin|·SHUTTER_S
  // degrees about its own axis, never more than BLUR_MAX. The smear composites
  // in over BLUR_ON (degrees; below the first it costs nothing at all). The
  // white-ink marks are cut once it passes MARKS_CUT — sharp route ink over a
  // smeared continent reads as a sticker — and come back with the landing.
  // The drag's spin is its last SPIN_WINDOW ms of travel, smoothed over
  // SPIN_TAU, so a jerky hand does not flicker the smear.
  SHUTTER_S: 1 / 30,
  BLUR_MAX: 26,
  BLUR_ON: [0.25, 1.4] as readonly [number, number],
  MARKS_CUT: 1.2,
  SPIN_TAU: 60,
  SPIN_WINDOW: 60,

  // ── BULB: a real long exposure ──
  // The hand holds; the motor winds eastward (the way the prologue used to
  // turn; it now turns west, and a hand-back after a BULB eases home westward
  // with the scroll) to the nearest place at least BULB_MIN_R° ahead, which
  // will rest BULB_LAND_WEST° west of the centre meridian (flings keep
  // LAND_WEST). It winds at
  // BULB_WIND_MIN + BULB_WIND_GAIN·(R − BULB_WIND_KNEE) °/s, never above
  // BULB_WIND_MAX, with R the degrees still to go, and the shutter opens once
  // the place is
  // up: inside the canvas less its bleed and BULB_OPEN_MARGIN, facing (cos
  // over the horizon by BULB_OPEN_FACING) and nearer than BULB_OPEN_R. Under
  // the open shutter the globe settles on a cubic ease-out over
  // BULB_SETTLE_S. The shutter closes on release, or on its own after
  // BULB_CAP_MS from opening. The knee is where his places come up on the
  // corner globe (R ≈ 35–45°, measured at 1728 and 1280): with it at 70 the
  // motor crawled at its floor for half a second before the place was in
  // view (the shutter opened 1.28 s after the press); at 35 it opens by
  // ~0.8 s and the wind's speed there (~110°/s) is the settle's own first
  // speed (3·R0/BULB_SETTLE_S), so the turn never steps.
  BULB_WIND_MIN: 70,
  BULB_WIND_KNEE: 35,
  BULB_WIND_GAIN: 8,
  BULB_WIND_MAX: 700,
  BULB_OPEN_R: 120,
  BULB_OPEN_MARGIN: 28,
  BULB_OPEN_FACING: 0.04,
  BULB_SETTLE_S: 1.05,
  BULB_LAND_WEST: 24,
  BULB_MIN_R: 25,
  BULB_CAP_MS: 8000,
  // After release the globe completes whatever is left of the settle:
  // T = clamp(BULB_STOP_K·D/ω, BULB_STOP_T) seconds.
  BULB_STOP_K: 1.2,
  BULB_STOP_T: [0.6, 2.4] as readonly [number, number],
  // The exposure's display gain, g(t) = 1 + GAIN_K·log2(1 + t/GAIN_T0): a
  // longer exposure fills the land with light while the ocean stays deep.
  GAIN_K: 0.38,
  GAIN_T0: 0.6,
  // Develop: the frozen exposure holds DEV_HOLD, then develops into the live
  // globe over DEV_MS, tone-ordered (dark tones first; DEV_SPREAD is how late
  // the highlights come). Reduced motion crossfades in DEV_CALM_MS, no hold.
  // The dodge takes over from the burn at DEV_POOL_U; the marks and the
  // landing come back at DEV_LAND_U.
  DEV_HOLD: 260,
  DEV_MS: 1500,
  DEV_SPREAD: 0.5,
  DEV_CALM_MS: 450,
  DEV_POOL_U: 0.5,
  DEV_LAND_U: 0.6,
  // The readout on the limb: in with the shutter; after release it holds
  // until the ticket has landed plus holdMs; an abort takes it in abortMs.
  READOUT: { inMs: 200, holdMs: 600, outMs: 400, abortMs: 450 },
  // His places as light (css px and film-toe constants): a core, a halation
  // halo and a wide bloom, each a gaussian swept along the path the place
  // travelled that frame, energy I·dt·e. The toe means a place crossing faster
  // than ~32 px/s leaves nothing: no lines, no rings. The bloom is held tight
  // (15 css px): at 24 a 4 s exposure still laid 9–16/255 of glow over the
  // ocean 30 px out from Miami and New York, the neon-pin look; at 15 the
  // halation stays at the place.
  BURN: { core: 0.9, halo: 10, bloom: 15, e: 45, toe: 1.4, toeHalo: 0.25, kc: 0.7, kh: 0.2, kb: 0.5, haloGain: 0.75, bloomGain: 0.18, band: 0.16 },
  // The darkroom dodge on the landed place: σ (deg on the sphere) focuses
  // from sigmaWide to sigma while it comes up over inMs (starting leadMs
  // before a fling lands); print × (1 + gain·a·g), elsewhere × (1 − burn·a·(1−g)).
  // It settles to `rest` restDelayMs after the landing, over restMs, and goes
  // over outMs.
  DODGE: { sigmaWide: 10, sigma: 3, gain: 0.75, burn: 0.14, leadMs: 700, inMs: 900, rest: 0.6, restDelayMs: 1300, restMs: 900, outMs: 420 },
  // The first-hover caption, engraved on the limb (see captionArc). It
  // follows a pointer that has rested restMs on the disc, once a session
  // (`key` in sessionStorage); a click with no drag brings it back for
  // clickShowMs. A brush past the limb is not leaving (graceMs).
  CAPTION: {
    restMs: 500,
    sweepMs: 1000,
    inMs: 320,
    graceMs: 650,
    outMs: 400,
    pressOutMs: 260,
    capMs: 6000,
    clickShowMs: 2400,
    pad: 28,
    centreDeg: 136,
    spanDeg: [180, 92] as readonly [number, number],
    key: 'globe-egg-caption',
  },
  // The give: one detent tap, amp·u·e^(1−u) with u = t/peakMs — it peaks at
  // peakMs and has settled by ms. A click answers with clickAmp.
  GIVE: { amp: 2.4, clickAmp: 3.2, peakMs: 110, ms: 1100 },
  // The ticket: dealt onto the print (dealMs, its shadow shadowMs) delayFling
  // after a fling lands or delayBulb after a BULB lands; the place is struck
  // first (markMs) and its chapter number prints numDelay in. A BULB ticket
  // carries its print (printW × printH css px).
  TICKET: { dealMs: 680, shadowMs: 760, delayFling: 60, delayBulb: 520, markMs: 520, numDelay: 240, printW: 76, printH: 58, stubW: 56 },
  // The keyboard's spin (Enter) is a flick at this speed.
  KEY_SPIN: 420,
  HOVER_MS: 180,
  // The egg layers let go of their render targets this long after the last
  // play (or at once when the first screen scrolls away).
  WARM_IDLE_MS: 15000,
  // A voyage from the ticket that never started gives the globe back after this.
  VOYAGE_SAFETY_MS: 3200,
} as const;

export const mod360 = (degrees: number) => ((degrees % 360) + 360) % 360;
export const wrap180 = (degrees: number) => mod360(degrees + 180) - 180;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export interface CoastPlace {
  lng: number;
}

export interface CoastPlan {
  /** +1: the centre longitude increases (the surface moves left). */
  dir: 1 | -1;
  /** Degrees the centre travels. */
  D: number;
  /** Duration, ms. */
  T: number;
  /** The ease's power: x(u) = D·(1 − (1 − u)^p). */
  p: number;
  /** The place it comes to rest on. */
  index: number;
}

/**
 * A coast that leaves at |v| °/s and stops with a place LAND_WEST° west of the
 * centre meridian. Of every place (and every extra lap of it) at least
 * MIN_TRAVEL away, it takes the one whose travel is nearest the aim; places
 * in `recent` (indices, most recent last) cost REPEAT_COST more. The duration
 * and the ease's power are then chosen so the coast leaves at exactly the
 * fling's speed (D·p/T = |v|) whatever distance was picked.
 */
export function planCoast(
  v: number,
  currentCenter: number,
  places: readonly CoastPlace[],
  bulb = false,
  recent: readonly number[] = [],
): CoastPlan {
  const dir: 1 | -1 = v < 0 ? -1 : 1;
  const speed = Math.max(1, Math.abs(v));
  const natural = speed * EGG.NATURAL_S;
  const minTravel = Math.max(0.45 * natural, EGG.MIN_TRAVEL);
  const aim = EGG.AIM * natural;
  let chosen = { d: minTravel, index: -1, cost: Number.POSITIVE_INFINITY };
  for (let index = 0; index < places.length; index += 1) {
    const dealt = recent.lastIndexOf(index);
    const penalty = dealt >= 0 ? EGG.REPEAT_COST[recent.length - 1 - dealt] ?? 0 : 0;
    let d = mod360(dir * (places[index].lng + EGG.LAND_WEST - currentCenter));
    for (let lap = 0; lap < 4; lap += 1, d += 360) {
      if (d < minTravel) continue;
      const cost = Math.abs(d - aim) + penalty;
      if (cost < chosen.cost) chosen = { d, index, cost };
    }
  }
  const D = chosen.d;
  const T = Math.min(bulb ? EGG.BULB_T_MAX : EGG.T_MAX, Math.max(EGG.T_MIN, ((bulb ? EGG.BULB_K_T : EGG.K_T) * D) / speed));
  return { dir, D, T: T * 1000, p: Math.max(1.25, (T * speed) / D), index: chosen.index };
}

/** Where a coast is at `tMs` from its start (closed form: dropped frames can
 *  never move the landing). */
export function coastAt(plan: CoastPlan, x0: number, tMs: number) {
  const u = clamp01(tMs / plan.T);
  return x0 + plan.dir * plan.D * (1 - Math.pow(1 - u, plan.p));
}

/** The coast's speed at `tMs` (°/s, signed): the derivative of coastAt. The
 *  shutter's smear reads it — the KNOWN motion, never a render delta, so a
 *  frame Mapbox drew late never un-blurs the globe. */
export function coastSpeed(plan: CoastPlan, tMs: number) {
  if (plan.T <= 0 || tMs >= plan.T) return 0;
  const u = clamp01(tMs / plan.T);
  return (plan.dir * plan.D * plan.p * Math.pow(1 - u, plan.p - 1)) / (plan.T / 1000);
}

/** A slow release drifts on and stops by itself (τ = NUDGE_TAU): degrees
 *  travelled at `tMs`. */
export function nudgeAt(v: number, tMs: number, tau: number = EGG.NUDGE_TAU) {
  return (v / 1000) * tau * (1 - Math.exp(-Math.max(0, tMs) / tau));
}

/** The nudge's speed at `tMs` (°/s). */
export function nudgeSpeed(v: number, tMs: number, tau: number = EGG.NUDGE_TAU) {
  return v * Math.exp(-Math.max(0, tMs) / tau);
}

/**
 * Degrees the grabbed globe turns for a hand that has moved (dx, dy) css px:
 * the move along the globe's own east (the map's bearing tilts it), over the
 * limb radius, widened toward the poles. Latitude never changes — a desk
 * globe on its meridian mount. Negative: the hand moved east, so the centre
 * longitude falls (the surface follows the hand).
 */
export function dragDegrees(dx: number, dy: number, bearingDeg: number, radius: number, latitudeDeg: number) {
  const b = (bearingDeg * Math.PI) / 180;
  const east = dx * Math.cos(b) + dy * Math.sin(b);
  return -((east / Math.max(1, radius)) * (180 / Math.PI)) / Math.max(0.35, Math.cos((latitudeDeg * Math.PI) / 180));
}

/** Release speed (°/s) from [time ms, centre°] samples: the last `window` ms
 *  only (VEL_WINDOW), 0 if the hand had stopped before letting go, clamped
 *  to ±VMAX. */
export function releaseVelocity(samples: ReadonlyArray<readonly [number, number]>, now: number, window: number = EGG.VEL_WINDOW) {
  const recent = samples.filter(([time]) => now - time <= window);
  if (recent.length < 2) return 0;
  const [t0, x0] = recent[0];
  const [t1, x1] = recent[recent.length - 1];
  if (now - t1 > window || t1 - t0 < 8) return 0;
  const v = ((x1 - x0) / (now - t0)) * 1000;
  return Math.max(-EGG.VMAX, Math.min(EGG.VMAX, v));
}

/** How far the shutter smears the print (degrees) for a spin of `spin` °/s. */
export function blurAngle(spin: number) {
  return Math.min(EGG.BLUR_MAX, Math.abs(spin) * EGG.SHUTTER_S);
}

/** Pinned smooth-max: centre = natural + f(pin − natural); f is C¹ at ±w and
 *  the pin lets go (f = 0) once the scroll's turn is w past it. `dir` is the
 *  way the scroll turns the centre (+1 east, −1 west: the prologue's turn,
 *  PROLOGUE_TURN.dir in src/lib/globeLook.ts); "ahead" is that way. */
export function composeEgg(natural: number, channel: { offset: number; pin: number }, w: number = EGG.PIN_W, dir = 1) {
  if (Number.isNaN(channel.pin)) return natural + channel.offset;
  const d = dir * (channel.pin - natural);
  return natural + dir * (d >= w ? d : d <= -w ? 0 : ((d + w) ** 2) / (4 * w));
}

/** What to do with a globe the reader has scrolled away from: pin it where it
 *  is (`d` degrees from the natural longitude, ahead of the scroll's own turn
 *  in direction `dir`) or ease `from` → 0. */
export function handBackDecision(offset: number, remaining: number, dir = 1) {
  const d = mod360(dir * offset);
  return d >= EGG.PIN_W && d <= remaining + EGG.PIN_SLACK
    ? { kind: 'pin' as const, d: dir * d }
    : { kind: 'return' as const, from: wrap180(offset) };
}

// ── BULB ──

/**
 * The place a long exposure settles on: the nearest of his places AHEAD (the
 * centre longitude rising, the way the motor winds) whose rest — BULB_LAND_WEST°
 * west of the centre meridian — is at least BULB_MIN_R° of turn away, so the
 * shutter always has a turn to expose. Places in `recent` cost REPEAT_COST
 * more (a repeat press from the same globe deals round the archive). `D` is
 * the turn to that rest.
 */
export function planBulbTarget(center: number, places: readonly CoastPlace[], recent: readonly number[] = []) {
  let best = { index: -1, D: Number.POSITIVE_INFINITY, cost: Number.POSITIVE_INFINITY };
  for (let index = 0; index < places.length; index += 1) {
    let d = mod360(places[index].lng + EGG.BULB_LAND_WEST - center);
    if (d < EGG.BULB_MIN_R) d += 360;
    const dealt = recent.lastIndexOf(index);
    const penalty = dealt >= 0 ? EGG.REPEAT_COST[recent.length - 1 - dealt] ?? 0 : 0;
    if (d + penalty < best.cost) best = { index, D: d, cost: d + penalty };
  }
  return { index: best.index, D: best.D };
}

/** The motor's speed (°/s) while it winds, `R` degrees still to go. */
export function bulbWindSpeed(R: number) {
  return Math.min(EGG.BULB_WIND_MAX, EGG.BULB_WIND_MIN + EGG.BULB_WIND_GAIN * Math.max(0, R - EGG.BULB_WIND_KNEE));
}

/** Degrees still to go `t` seconds after the shutter opened with R0 to go: a
 *  cubic ease-out that arrives at BULB_SETTLE_S. */
export function bulbSettleAt(R0: number, t: number) {
  const u = clamp01(t / EGG.BULB_SETTLE_S);
  return R0 * Math.pow(1 - u, 3);
}

/** The settle's speed (°/s) at `t` seconds. */
export function bulbSettleSpeed(R0: number, t: number) {
  const u = clamp01(t / EGG.BULB_SETTLE_S);
  return u >= 1 ? 0 : ((3 * R0) / EGG.BULB_SETTLE_S) * (1 - u) * (1 - u);
}

/** Released with R degrees of the settle left at ω °/s: the globe completes
 *  them on a coast that leaves at ω (a coast of nothing when it had arrived). */
export function planBulbStop(R: number, omega: number, index: number): CoastPlan {
  const D = Math.max(0, R);
  const speed = Math.abs(omega);
  const [tMin, tMax] = EGG.BULB_STOP_T;
  if (D < 0.01 || speed < 0.01) return { dir: 1, D: 0, T: tMin * 1000, p: 1.25, index };
  const T = Math.min(tMax, Math.max(tMin, (EGG.BULB_STOP_K * D) / speed));
  return { dir: 1, D, T: T * 1000, p: Math.max(1.25, (T * speed) / D), index };
}

/** The exposure's display gain after `seconds` of exposure. */
export function exposureGain(seconds: number) {
  return 1 + EGG.GAIN_K * Math.log2(1 + Math.max(0, seconds) / EGG.GAIN_T0);
}

/** How far the develop is (0 → 1, and on past 1) `now` ms, the shutter
 *  having closed at `closedAt`. Reduced motion (`calm`) has no hold. */
export function developAt(now: number, closedAt: number, calm = false) {
  const hold = calm ? 0 : EGG.DEV_HOLD;
  const span = calm ? EGG.DEV_CALM_MS : EGG.DEV_MS;
  return Math.max(0, (now - closedAt - hold) / span);
}

/** The readout's words (uppercase in CSS). */
export const bulbLabel = (seconds: number) => `Bulb · ${(Math.floor(Math.max(0, seconds) * 10) / 10).toFixed(1)} s`;
export const exposedLabel = (seconds: number, degrees: number) =>
  `Exposed ${Math.max(0, seconds).toFixed(1)} s · ${Math.round(Math.abs(degrees))}°`;

/** How much light a point on the globe may lay down: fades in over the band
 *  (0.16 of cos(angle)) above the horizon (R/d), 0 behind it. */
export function horizonVisibility(cosAngle: number, horizon: number) {
  return clamp01((cosAngle - horizon) / EGG.BURN.band);
}

// ── The hint ──

/** The give (degrees) `tMs` into it: one detent tap that peaks at peakMs
 *  and has settled by ms, no oscillation. */
export function giveAt(tMs: number, amp: number = EGG.GIVE.amp) {
  if (tMs <= 0 || tMs >= EGG.GIVE.ms) return 0;
  const u = tMs / EGG.GIVE.peakMs;
  return amp * u * Math.exp(1 - u);
}

/**
 * The limb's engraving: an arc concentric with the planet at r + pad css px,
 * run from spanDeg[0] to spanDeg[1] (screen angles, y up; clockwise on screen)
 * so a textPath centred on it sits at centreDeg, plus the two radial index
 * ticks 12 px beyond each end of `textLength` (px) of words. `planet` is in
 * viewport css px.
 */
export function captionArc(planet: { x: number; y: number; r: number }, textLength: number) {
  const { pad, centreDeg, spanDeg } = EGG.CAPTION;
  const R = planet.r + pad;
  const at = (deg: number, radius = R): [number, number] => [
    planet.x + radius * Math.cos((deg * Math.PI) / 180),
    planet.y - radius * Math.sin((deg * Math.PI) / 180),
  ];
  const [x0, y0] = at(spanDeg[0]);
  const [x1, y1] = at(spanDeg[1]);
  const large = Math.abs(spanDeg[0] - spanDeg[1]) > 180 ? 1 : 0;
  const d = `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  // Half the words' angular span plus 12px, in degrees.
  const half = ((Math.max(0, textLength) / (2 * R) + 12 / R) * 180) / Math.PI;
  const ticks = [centreDeg + half, centreDeg - half].map((deg) => {
    const [ax, ay] = at(deg, R - 9);
    const [bx, by] = at(deg, R - 3);
    return [ax, ay, bx, by] as [number, number, number, number];
  });
  return { R, d, ticks, centre: at(centreDeg) };
}

// ── The ticket ──

/** The ticket's gutter: the page's own margin (the nav pills keep 48px),
 *  plus the ~10px its dealt tilt (global.css, .globe-ticket) swings its far
 *  corner out past its box. At 16px a BULB ticket landed 6px from the edge. */
export const TICKET_GUTTER = 58;

/**
 * Where the ticket sits for a place at (x, y) viewport px: up and to the
 * right of it, inside TICKET_GUTTER. Clamped against the right edge it
 * could come back over the place, so it flips up and to the left; if that
 * still covers it (no room either side) it drops below. A placement "covers"
 * the place when its rect grown by 12px contains the point.
 */
export function ticketPlacement(x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const clampX = (tx: number) => Math.max(TICKET_GUTTER, Math.min(tx, viewportWidth - width - TICKET_GUTTER));
  const clampY = (ty: number) => Math.max(TICKET_GUTTER, Math.min(ty, viewportHeight - height - TICKET_GUTTER));
  const covers = (tx: number, ty: number) =>
    x >= tx - 12 && x <= tx + width + 12 && y >= ty - 12 && y <= ty + height + 12;
  const up = clampY(y - 46 - height);
  const right = clampX(x + 30);
  if (!covers(right, up)) return { tx: right, ty: up, side: 'right' as const };
  const left = clampX(x - 30 - width);
  if (!covers(left, up)) return { tx: left, ty: up, side: 'left' as const };
  const below = clampY(y + 46);
  return { tx: covers(right, below) ? left : right, ty: below, side: 'below' as const };
}

/** Reduced motion's calm spin: no physics, the next chapter after the last
 *  one dealt (the first when none has been). */
export function calmNext(last: number, count: number) {
  if (count <= 0) return -1;
  return last < 0 ? 0 : (last + 1) % count;
}
