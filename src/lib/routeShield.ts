// ── The route shield: how a place is signed on the homepage ──
// Owner, 2026-09-28 (甲，我喜欢路盾这样): every place is a US-route shield —
// the 1926 state shield's form, bone plate, dark ink — carrying its state's
// two letters in the top band and its stop number below. The same shield
// heads the chapter's ticket (the stub IS the place's sign: 将右侧的大号封面
// 和路牌上方的州名缩写+地名和第几站结合在一起) and stands on the map.
//
// On the map there is no post under a shield (不需要下面的引线). A group of
// neighbouring places is ONE sign: its shields side by side in stop order,
// with a single leader pointing at the region they share, never one leader
// per place (引线指向一段区域即可，同一块区域不需要反复指引，按照数字排序即可).
//
// Pure, so scripts/route-shield.test.mjs can hold it: the outline, the
// state code, the regions and the split-flap's plan.
import { haversineKm } from './geo.ts';

/** The US-route shield outline (MUTCD M1-4, a generic public-domain form),
 *  normalised to a 100 × 100 box: ears at 19.8% / 80.2%, a centre cusp,
 *  a waist at 37.9%, the belly at 63.8% and a soft point at the foot. */
export const SHIELD_PATH =
  'M50,100 C45.5,94.6 38.8,91.4 31.9,91.4 L27.6,91.4 C12.5,91.4 0.1,79 0.1,63.8 C0.1,54.4 6.1,47.6 6.1,37.9 ' +
  'C6.1,31.3 3.8,24.4 0,19.2 L19.8,0.1 C23.9,3.6 29.4,5.7 34.8,5.7 C40.3,5.7 45.9,3.7 50,0 C54.1,3.7 59.7,5.7 ' +
  '65.2,5.7 C70.6,5.7 76.1,3.6 80.2,0.1 L100,19.2 C96.2,24.4 93.9,31.3 93.9,37.9 C93.9,47.6 99.9,54.4 99.9,63.8 ' +
  'C99.9,79 87.5,91.4 72.4,91.4 L68.1,91.4 C61.2,91.4 54.5,94.6 50,100Z';

/** Where the 1926 shield's band ends: a full-width rule of ink at this
 *  height (of 100), which closes the state's band over the stop number. */
export const SHIELD_BAND_RULE_Y = 35.5;

// USPS codes. The archive stores a place's `region` as the state's name
// ("Florida", "New York"); the two letters on a shield are DERIVED from it
// here — they are not a stored field. A region that is not a US state (a
// country, a province) falls back to its own initials.
const STATE_CODES: Readonly<Record<string, string>> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

/** The two letters in a shield's band, derived from the place's region:
 *  Florida → FL, Arizona → AZ, Utah → UT, New York → NY. Empty when there is
 *  no region (the band is then left blank rather than guessed). */
export function stateCode(region?: string | null): string {
  const name = region?.trim();
  if (!name) return '';
  const known = STATE_CODES[name.toLowerCase()];
  if (known) return known;
  const words = name.split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? words.map((word) => word[0]).join('') : name;
  return initials.slice(0, 2).toUpperCase();
}

export const pad2 = (value: number) => String(value).padStart(2, '0');

// ── The name on the ticket's sign ──
// Set in the label face, bold capitals, inside the sign's enamel rule: 142px
// of measure on the 190px stub. One size for every name the archive has
// (30px, a consistent cap height from ticket to ticket), smaller only when a
// word could not fit the rule. DERIVED from the letters, never measured:
// ~0.66em a bold capital (measured at 26px: MIAMI 75, ORLANDO 115, PAGE 63,
// ZION 56, BRYCE 80, CANYON 100, NEW 54, YORK 66 — ORLANDO is 133px at 30).
// The story's kept stub prints the same name at the same size, so the two
// fly like for like (MagazineLayout, StubFace).
export const SIGN_NAME_MEASURE = 142;
export const SIGN_NAME_MAX = 30;
export const SIGN_NAME_MIN = 15;
export function signNameSize(name: string): number {
  const longest = Math.max(1, ...name.trim().split(/\s+/).map((word) => word.length));
  return Math.max(SIGN_NAME_MIN, Math.min(SIGN_NAME_MAX, Math.floor(SIGN_NAME_MEASURE / (longest * 0.66))));
}

// ── Regions: one sign per stretch of neighbouring places ──
/** Places read one after another no further apart than this share a sign:
 *  Miami–Orlando (~330 km) is one stretch, Page–Zion–Bryce (~145 and ~80 km)
 *  another; Orlando–Page (~2 900 km) and Bryce–New York (~3 000 km) are not.
 *  By distance, not by the region field: Page is in Arizona and Zion in Utah,
 *  and on the map they are one corner of the Southwest. */
export const REGION_REACH_KM = 450;

export interface SignPlace {
  id: string;
  /** 1-based stop number. */
  number: number;
  /** [longitude, latitude] */
  coordinates: [number, number];
}

export interface RegionSign<T extends SignPlace = SignPlace> {
  /** Stable: the first member's id. */
  key: string;
  /** In stop order. */
  places: T[];
  /** Where the sign's one leader points: halfway along the region's own
   *  stretch of the route (by length, on its legs in stop order), so the
   *  leader lands ON the road the region's places share — a stretch, not a
   *  pin and not bare ground between two legs. A single place is its own
   *  anchor (and its sign has no leader: `SignPose`, RouteSign). */
  anchor: [number, number];
}

/** The point halfway along a polyline of [lng, lat] points, by haversine
 *  length, interpolated within the leg it falls on (the region's legs are a
 *  few hundred km at most, where lng/lat interpolation and the map's drawn
 *  leg agree to well under a pixel at the atlas's zooms). */
export function routeMidpoint(points: ReadonlyArray<readonly [number, number]>): [number, number] {
  if (!points.length) return [0, 0];
  if (points.length === 1) return [points[0][0], points[0][1]];
  const legs = points.slice(1).map((point, index) => haversineKm(points[index] as [number, number], point as [number, number]));
  const total = legs.reduce((sum, km) => sum + km, 0);
  if (!(total > 0)) return [points[0][0], points[0][1]];
  let left = total / 2;
  for (let index = 0; index < legs.length; index += 1) {
    const km = legs[index];
    if (left <= km || index === legs.length - 1) {
      const t = km > 0 ? Math.min(1, left / km) : 0;
      const [a, b] = [points[index], points[index + 1]];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= km;
  }
  const last = points[points.length - 1];
  return [last[0], last[1]];
}

/** The same halfway point on screen (the phone's static overview, which
 *  signs its regions on projected points): by straight length in px. */
export function screenMidpoint(points: ReadonlyArray<{ x: number; y: number }>): { x: number; y: number } {
  if (!points.length) return { x: 0, y: 0 };
  const legs = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const total = legs.reduce((sum, px) => sum + px, 0);
  if (!(total > 0)) return { x: points[0].x, y: points[0].y };
  let left = total / 2;
  for (let index = 0; index < legs.length; index += 1) {
    if (left <= legs[index] || index === legs.length - 1) {
      const t = legs[index] > 0 ? Math.min(1, left / legs[index]) : 0;
      const a = points[index];
      const b = points[index + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= legs[index];
  }
  return { x: points[points.length - 1].x, y: points[points.length - 1].y };
}

/** The map's signs: places in stop order, a new sign wherever a leg is
 *  longer than `reachKm`. */
export function regionSigns<T extends SignPlace>(places: readonly T[], reachKm = REGION_REACH_KM): Array<RegionSign<T>> {
  const ordered = [...places].sort((a, b) => a.number - b.number);
  const signs: Array<RegionSign<T>> = [];
  let current: T[] = [];
  const close = () => {
    if (!current.length) return;
    signs.push({ key: current[0].id, places: current, anchor: routeMidpoint(current.map((place) => place.coordinates)) });
    current = [];
  };
  ordered.forEach((place, index) => {
    const previous = ordered[index - 1];
    if (previous && haversineKm(previous.coordinates, place.coordinates) > reachKm) close();
    current.push(place);
  });
  close();
  return signs;
}

// ── The sign's geometry on the map, derived per camera frame ──
// The sign hangs over its region: the leader runs up from its anchor (the
// middle of the region's stretch of road) until the shields clear the
// region's northernmost place by SIGN_CLEAR. The row slides sideways (the
// leader stays where it points) to keep inside the map column, never so far
// that the leader leaves the row. A single place's sign has no leader at all
// (不需要下面的引线): its shield stands SIGN_SINGLE_GAP over the place, and its
// own point is the pointer.
export const SIGN_CLEAR = 18;
export const SIGN_LEAD_MIN = 14;
export const SIGN_LEAD_MAX = 150;
/** A lone shield's point stands this far above its place, css px. */
export const SIGN_SINGLE_GAP = 6;

export interface SignPose {
  /** Leader length, px. */
  lead: number;
  /** The row's sideways shift from centred over the anchor, px. */
  shift: number;
}

/**
 * Where a sign sits, from projected screen points (any one frame of
 * reference): `anchor` (the region's middle), `topY` (its northernmost place
 * on screen), the row's width, the column it must keep inside, and how far
 * the row may slide before the leader would leave the rail its shields stand
 * on (`reach`; 0 for a single shield, whose own point the leader meets).
 */
export function signPose(
  anchor: { x: number; y: number },
  topY: number,
  rowWidth: number,
  left: number,
  right: number,
  reach: number,
): SignPose {
  const lead = Math.max(SIGN_LEAD_MIN, Math.min(SIGN_LEAD_MAX, anchor.y - topY + SIGN_CLEAR));
  const half = rowWidth / 2;
  let shift = 0;
  if (anchor.x + half > right) shift = right - (anchor.x + half);
  if (anchor.x - half + shift < left) shift = left - (anchor.x - half);
  const limit = Math.max(0, reach);
  // `+ 0`: a clamp to a zero reach must not hand back -0.
  return { lead: Math.round(lead * 2) / 2, shift: Math.round(Math.max(-limit, Math.min(limit, shift)) * 2) / 2 + 0 };
}

// ── The split-flap: a stop's name arriving ──
// On a landing further along the route the ticket's state, number and name
// run a departure board's flap into place (下一站同样产生位置字母跳转功能,
// after 11 mois sans toi(t)'s name switch, rebuilt on the site's own
// timings), from the stop the camera left. The board is set to that stop the
// moment the camera takes off (`primeFlap`), so the name the ticket carries
// in is the one being left and nothing already read is ever turned back.
// The name being left is shown whole, as it was set (the word's `was`
// overlay) — mapped letter by letter onto the new name's cells it came out
// cut and re-spaced ("BRY CECA" in NEW YORK's seven, "ORLA" in PAGE's four).
// FLAP.delay after the landing it goes and every cell of the new name turns,
// one flip each FLAP.turn, landing left to right on the plan (the first
// FLAP.base flips of FLAP.tick after FLAP.delay, each later character
// FLAP.stagger and a flip later). Only what changes turns: a name already
// right stays down; the state turns only when the state changes (FL → AZ,
// two flips, `CODE_FLIPS`); the stop number counts through the real stops
// between (03 → 04 → 05), its last step landing with the name's last
// character. Short and legible: a twelve-letter name lands inside
// DUR.scene. Reduced motion shows the word, no flap.
export const FLAP = {
  /** DUR.flick: the landing registers, then the board turns. */
  delay: 120,
  stagger: 32,
  tick: 24,
  /** Flips for the first character; each later one adds one. */
  base: 5,
  /** How long each flip of the name is shown while it turns, ms. */
  turn: 40,
  /** The whole word is down by delay + this (DUR.scene). */
  budget: 1000,
} as const;
/** A state that changes turns through this many letters, each this long. */
export const CODE_FLIPS = 2;
export const CODE_TICK = 36;

export interface FlapStep {
  /** ms after the flap starts. */
  start: number;
  /** ms after the flap starts: the character is down. */
  land: number;
  flips: number;
}

/** The flap's plan for `count` characters (spaces included, which simply do
 *  not turn). Compressed evenly if a long word would run past the budget. */
export function flapPlan(count: number): FlapStep[] {
  const raw = Array.from({ length: count }, (_, index) => {
    const start = FLAP.delay + FLAP.stagger * index;
    const flips = FLAP.base + index;
    return { start, flips, land: start + FLAP.tick * flips };
  });
  const last = raw.length ? raw[raw.length - 1].land : 0;
  const limit = FLAP.delay + FLAP.budget;
  if (last <= limit) return raw;
  const k = (limit - FLAP.delay) / (last - FLAP.delay);
  return raw.map((step) => ({
    start: Math.round(FLAP.delay + (step.start - FLAP.delay) * k),
    flips: step.flips,
    land: Math.round(FLAP.delay + (step.land - FLAP.delay) * k),
  }));
}

/** A name cell's turn: from FLAP.delay (when the name being left goes) to
 *  its planned landing, one flip each FLAP.turn. */
export function nameStep(step: FlapStep): FlapStep {
  return {
    start: FLAP.delay,
    land: step.land,
    flips: Math.max(2, Math.round((step.land - FLAP.delay) / FLAP.turn)),
  };
}

/** The state's plan: each letter two quick flips, a stagger apart. */
export function codePlan(count: number): FlapStep[] {
  return Array.from({ length: count }, (_, index) => {
    const start = FLAP.delay + FLAP.stagger * index;
    return { start, flips: CODE_FLIPS, land: start + CODE_TICK * CODE_FLIPS };
  });
}

// Each character turns only through characters of its own width class, in a
// cell as wide as the character it lands on: a wide M or W flipped through
// the cell of an I overprinted its neighbours ("EDAMI", "ORLDMYU"). Narrow
// capitals turn through narrow ones, M and W through the wide round ones,
// everything else through the middle of the alphabet.
const NARROW = 'IJLT';
const WIDE = 'MWQO';
const MIDDLE = 'ABCDEFGHKNOPRSUVXYZ';
const DIGITS = '0123456789';
const NARROW_DIGITS = '17';
function flipSet(final: string): string {
  if (/\d/.test(final)) return final === '1' ? NARROW_DIGITS : DIGITS;
  if (NARROW.includes(final)) return NARROW;
  if (final === 'M' || final === 'W') return WIDE;
  return MIDDLE;
}

/** What a character shows at `t` ms into the flap: the character it is
 *  leaving (`from`, before its start), a flip of its own width class, or
 *  itself once down — at once, if it is the character it is leaving.
 *  `seed` varies the flips per character so no two columns turn alike. */
export function flapGlyph(final: string, from: string, step: FlapStep, t: number, seed: number): string {
  if (final === ' ' || !final.trim()) return final;
  if (from === final) return final;
  if (t >= step.land) return final;
  if (t < step.start) return from;
  const flip = Math.floor((t - step.start) / Math.max(1, (step.land - step.start) / step.flips));
  const set = flipSet(final);
  // A cheap deterministic scatter, never the final character itself.
  let index = (seed * 7 + flip * 11 + final.charCodeAt(0)) % set.length;
  if (set[index] === final) index = (index + 3) % set.length;
  if (set[index] === final) index = (index + 1) % set.length;
  return set[index];
}

/** The stop number at `t`: the number being left until `start`, then every
 *  real stop between, one step each, the last landing at `land` (with the
 *  name's last character) — 01 → 02 is a single turn at the end, 03 → 05
 *  passes 04. Anything that is not a number, or the same number, is simply
 *  shown. */
export function flapNumber(final: string, from: string, t: number, start: number, land: number): string {
  const to = Number.parseInt(final, 10);
  const was = Number.parseInt(from, 10);
  if (!/^\d+$/.test(final) || !/^\d+$/.test(from) || was === to || t >= land) return final;
  const steps = Math.abs(to - was);
  const k = t < start ? 0 : Math.min(steps - 1, Math.floor(((t - start) / Math.max(1, land - start)) * steps));
  return String(was + Math.sign(to - was) * k).padStart(final.length, '0');
}
