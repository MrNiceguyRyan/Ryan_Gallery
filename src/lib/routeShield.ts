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
  /** Where the sign's one leader points: the middle of the region (the mean
   *  of its places), which is on the ground the region covers. */
  anchor: [number, number];
}

/** The map's signs: places in stop order, a new sign wherever a leg is
 *  longer than `reachKm`. */
export function regionSigns<T extends SignPlace>(places: readonly T[], reachKm = REGION_REACH_KM): Array<RegionSign<T>> {
  const ordered = [...places].sort((a, b) => a.number - b.number);
  const signs: Array<RegionSign<T>> = [];
  let current: T[] = [];
  const close = () => {
    if (!current.length) return;
    const lng = current.reduce((sum, place) => sum + place.coordinates[0], 0) / current.length;
    const lat = current.reduce((sum, place) => sum + place.coordinates[1], 0) / current.length;
    signs.push({ key: current[0].id, places: current, anchor: [lng, lat] });
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
// The sign hangs over its region: the leader runs up from the region's middle
// until the shields clear the region's northernmost place by SIGN_CLEAR. The
// row slides sideways (the leader stays where it points) to keep inside the
// map column, never so far that the leader leaves the row.
export const SIGN_CLEAR = 18;
export const SIGN_LEAD_MIN = 14;
export const SIGN_LEAD_MAX = 150;

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
// On the landing the ticket's state, number and name run a departure board's
// flap into place (下一站同样产生位置字母跳转功能, after 11 mois sans toi(t)'s
// name switch, rebuilt on the site's own timings): after FLAP.delay each
// character starts FLAP.stagger after the one before, shows a run of other
// characters FLAP.tick apart — a few more for each later character, so the
// word lands left to right — and settles. Short and legible: a twelve-letter
// name lands inside DUR.scene. Reduced motion shows the word, no flap.
export const FLAP = {
  /** DUR.flick: the landing registers, then the board turns. */
  delay: 120,
  stagger: 32,
  tick: 24,
  /** Flips for the first character; each later one adds one. */
  base: 5,
  /** The whole word is down by delay + this (DUR.scene). */
  budget: 1000,
} as const;

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

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

/** What a character shows at `t` ms into the flap: the character it is
 *  leaving (`from`, before its start), a flip of its own kind (a letter
 *  turns through letters, a figure through figures), or itself once down.
 *  `seed` varies the flips per character so no two columns turn alike. */
export function flapGlyph(final: string, from: string, step: FlapStep, t: number, seed: number): string {
  if (final === ' ' || !final.trim()) return final;
  if (t >= step.land) return final;
  if (t < step.start) return from;
  const flip = Math.floor((t - step.start) / Math.max(1, (step.land - step.start) / step.flips));
  const set = /\d/.test(final) ? DIGITS : LETTERS;
  // A cheap deterministic scatter, never the final character itself.
  let index = (seed * 7 + flip * 11 + final.charCodeAt(0)) % set.length;
  if (set[index] === final) index = (index + 3) % set.length;
  return set[index];
}
