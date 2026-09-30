// ── The route shield: how a place is signed on the homepage ──
// Owner, 2026-09-28: every place is a road shield carrying its state's two
// letters and its stop number, and the same shield heads the chapter's
// ticket (将右侧的大号封面和路牌上方的州名缩写+地名和第几站结合在一起).
//
// Later the same day (完全和这个网站对齐 11moissanstoit.com/etape/paris-1):
// ONE shield per place, standing on the map with the point of its foot
// exactly on the place — no grouping of neighbouring places, no post, stem
// or leader of any kind (不需要白色竖干). Shields that meet at a camera's zoom
// cascade like a pile of stop signs (`stackShields`), never merge. And the
// shields of different states are not one style (每个地区的路牌盾风格不能一样，
// 要差异化): each state has its own FORM, drawn after that state's real route
// marker (below), and each place prints its own ticket stock in the form's
// band, so Miami and Orlando (both Florida) still differ, and every shield
// matches its ticket.
//
// Pure, so scripts/route-shield.test.mjs can hold it: the forms, the state
// code, the stacking and the split-flap's plan.

// ── The forms ──
// Every form is drawn in a box 100 units wide (`h` tall, foot included), in
// the site's own ink: a bone plate, dark ink, and a BAND printed in the
// place's stock (src/lib/ticketStock.ts) that carries the state's letters in
// bone. The foot's point (`tip`) is what stands on the place. The drawings
// are ours — simplified, never traced from a sign — after the real markers
// (MUTCD 2009 and the states' supplements; checked against the public-domain
// drawings on Wikimedia Commons, 2026-09-28):
//   FL  Florida state road: a white square, the state's outline drawn round
//       it in black. Here: a square plate, and the state as the band — the
//       panhandle across the head (it carries FL), the peninsula down the
//       right-hand side; the number sits centred in the Gulf.
//   AZ  Arizona state route: the state's own outline, white on black — the
//       notch at its north-west corner, the diagonal of its south-west
//       border — with ARIZONA across the head. Here: the outline, its head
//       band carrying AZ, the foot where the diagonal meets the border.
//   UT  Utah state route: a beehive (the Beehive State) — tiers of a skep,
//       a knob on top — standing on a slab. Here: four tiers and the knob in
//       bone, the slab as the band, carrying UT.
//   NY  New York state route: a shield with a raised, ogee-curved head and a
//       pointed foot. Here: that shield, its head the band, carrying NY.
//   DC  The District has no route marker of its own (its roads carry the US
//       and Interstate shields), so its sign is its flag, the one mark every
//       Washingtonian knows: three stars over two bars (the Washington
//       family's arms). Here: a flag-shaped plate on a foot, the three stars
//       across the head and the two bars under the number printed in the
//       place's stock, the upper bar carrying DC.
//   US  Anything else: the US-route shield (MUTCD M1-4), the 1926 form the
//       archive signed every place with until now.
export interface ShieldText {
  /** Centre of the line, in the form's units. */
  x: number;
  /** The baseline, in the form's units. */
  y: number;
  /** Font size, in the form's units. */
  size: number;
}

export interface ShieldForm {
  key: 'FL' | 'AZ' | 'UT' | 'NY' | 'DC' | 'US';
  /** Height of the box (the width is always 100), foot included. */
  h: number;
  /** The point that stands on the place. */
  tip: readonly [number, number];
  /** The plate: bone, foot included. May be several sub-paths (a union). */
  plate: string;
  /** Printed in the place's stock; carries the state's letters. */
  band: string;
  /** Dark ink linework over the plate (rims, the hive's seams). */
  ink: string;
  /** The ink's stroke width, in the form's units. */
  inkWidth: number;
  /** An ink ring: the plate's own outline drawn again at this scale about
   *  the box's centre (the US shield's 1926 border ring). */
  rim?: number;
  code: ShieldText;
  num: ShieldText;
}

/** The US-route shield outline (MUTCD M1-4, a generic public-domain form),
 *  normalised to a 100 × 100 box: ears at 19.8% / 80.2%, a centre cusp,
 *  a waist at 37.9%, the belly at 63.8% and a soft point at the foot. */
export const SHIELD_PATH =
  'M50,100 C45.5,94.6 38.8,91.4 31.9,91.4 L27.6,91.4 C12.5,91.4 0.1,79 0.1,63.8 C0.1,54.4 6.1,47.6 6.1,37.9 ' +
  'C6.1,31.3 3.8,24.4 0,19.2 L19.8,0.1 C23.9,3.6 29.4,5.7 34.8,5.7 C40.3,5.7 45.9,3.7 50,0 C54.1,3.7 59.7,5.7 ' +
  '65.2,5.7 C70.6,5.7 76.1,3.6 80.2,0.1 L100,19.2 C96.2,24.4 93.9,31.3 93.9,37.9 C93.9,47.6 99.9,54.4 99.9,63.8 ' +
  'C99.9,79 87.5,91.4 72.4,91.4 L68.1,91.4 C61.2,91.4 54.5,94.6 50,100Z';

// A tier of the hive: a band `hw` either side of the middle, 11.5 tall, its
// ends rounded, so the tiers' sides stack as the skep's coils.
const tier = (top: number, hw: number) =>
  `M${50 - hw + 5.75},${top} H${50 + hw - 5.75} A5.75,5.75 0 0 1 ${50 + hw - 5.75},${top + 11.5} H${50 - hw + 5.75} A5.75,5.75 0 0 1 ${50 - hw + 5.75},${top}Z`;
// Where two tiers meet: the seam, cut in from the notch between the coils
// on each side (`hw`, the lower tier's half-width).
const seam = (y: number, hw: number, reach: number) =>
  `M${50 - hw + 7},${y} h${reach} M${50 + hw - 7},${y} h${-reach}`;

// A five-pointed star (the flag's), point up, `r` to its points.
const star = (cx: number, cy: number, r: number) => {
  const inner = r * 0.382;
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 ? inner : r;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${points.join(' L')}Z`;
};

export const SHIELD_FORMS: Readonly<Record<ShieldForm['key'], ShieldForm>> = {
  FL: {
    key: 'FL',
    h: 108,
    tip: [50, 108],
    plate: 'M8,0 H92 Q100,0 100,8 V88 Q100,96 92,96 H58 L50,108 L42,96 H8 Q0,96 0,88 V8 Q0,0 8,0Z',
    // The state: the panhandle along the head, the Big Bend, Tampa Bay, the
    // peninsula down to its tip; the Atlantic coast straight up the side.
    // The peninsula narrow, as the state's is: its west coast from the Big
    // Bend (x≈64) down to the tip (x≈86), so the number sits whole in the
    // Gulf, clear of the rim and the coast (at 32.5 it hugged the rim and the
    // peninsula took a third of the plate: a dog-eared tile, not Florida).
    band: 'M8,8 H92 L92.5,42 C92.5,60 91.5,73 88.5,83 L86,89.5 C84,87.5 82.5,84 81,79 L78,69 ' +
      'C76.5,65 74.5,63 72,61 C73.5,58.5 73,55.5 71.5,52.5 C69.5,47.5 67,42.5 63.5,38.5 C59.5,33.5 54,29.8 46.5,28.8 ' +
      'L34.5,28.2 C33,30.8 30.2,31.2 28.6,28 L8,27.2Z',
    ink: 'M4.2,11 Q4.2,4.2 11,4.2 H89 Q95.8,4.2 95.8,11 V85 Q95.8,91.8 89,91.8 H11 Q4.2,91.8 4.2,85Z',
    inkWidth: 2.2,
    code: { x: 21, y: 23, size: 16.5 },
    num: { x: 40, y: 84, size: 38 },
  },
  AZ: {
    key: 'AZ',
    h: 102,
    tip: [50, 102],
    // The notch at the north-west corner; the south-west border's diagonal
    // down to the foot; the Mexican border flat to the east.
    plate: 'M20,0 H100 V90 H57 L50,102 L43,88 L0,77 V19 H20Z',
    band: 'M24,4 H96 V24 H24Z',
    ink: 'M23.6,3.6 H96.4 V86.4 H55.6 L3.6,73.9 V22.6 H23.6Z',
    inkWidth: 2.2,
    code: { x: 60, y: 20.5, size: 17 },
    num: { x: 52, y: 72, size: 44 },
  },
  UT: {
    key: 'UT',
    h: 100,
    tip: [50, 100],
    // The knob, five tiers of the skep, the slab it stands on, the foot.
    plate: [
      'M43.5,11 A6.5,6.5 0 0 1 56.5,11Z',
      tier(9, 17),
      tier(19.5, 27),
      tier(30, 35),
      tier(40.5, 41),
      tier(51, 45),
      'M3,61 H97 Q100,61 100,64 V84 Q100,87 97,87 H57 L50,100 L43,87 H3 Q0,87 0,84 V64 Q0,61 3,61Z',
    ].join(' '),
    band: 'M4,64.5 H96 V83.5 H4Z',
    ink: [seam(20, 27, 5), seam(30.5, 35, 5), seam(41, 41, 5), seam(51.5, 45, 5)].join(' '),
    inkWidth: 2.2,
    code: { x: 50, y: 80.2, size: 17 },
    num: { x: 50, y: 55.5, size: 34 },
  },
  NY: {
    key: 'NY',
    h: 100,
    tip: [50, 100],
    plate: 'M50,0 C61.2,0 67,2.3 73.8,7.4 C81.3,12.9 89.9,16.4 100,16.4 V75.3 C100,80.5 99.9,80.5 97.3,83.3 ' +
      'C92.6,87.8 50,100 50,100 C50,100 7.4,87.8 2.7,83.3 C0.1,80.5 0,80.5 0,75.3 V16.4 C10.1,16.4 18.7,12.9 26.2,7.4 ' +
      'C33,2.3 38.8,0 50,0Z',
    band: 'M50,4.6 C60,4.6 65.6,6.8 71.8,11.4 C79,16.7 87,20 95.4,20.5 V34 H4.6 V20.5 C13,20 21,16.7 28.2,11.4 ' +
      'C34.4,6.8 40,4.6 50,4.6Z',
    ink: 'M95.4,34 V74.6 C95.4,78.4 95.3,78.6 93.4,80.6 C89.4,84.4 50,95.2 50,95.2 C50,95.2 10.6,84.4 6.6,80.6 ' +
      'C4.7,78.6 4.6,78.4 4.6,74.6 V34',
    inkWidth: 2.2,
    code: { x: 50, y: 29.5, size: 17 },
    num: { x: 50, y: 74, size: 42 },
  },
  DC: {
    key: 'DC',
    h: 104,
    tip: [50, 104],
    // The flag, square-cornered like a banner, on the foot every form
    // stands on.
    plate: 'M4,0 H96 Q100,0 100,4 V88 Q100,92 96,92 H58 L50,104 L42,92 H4 Q0,92 0,88 V4 Q0,0 4,0Z',
    // Three stars across the head; the two bars under the number, the upper
    // one broad enough to carry the District's letters.
    band: [star(24, 17, 9.5), star(50, 17, 9.5), star(76, 17, 9.5), 'M8,61 H92 V80 H8Z', 'M8,83.5 H92 V87.5 H8Z'].join(' '),
    ink: 'M4.2,8 Q4.2,4.2 8,4.2 H92 Q95.8,4.2 95.8,8 V84 Q95.8,87.8 92,87.8 H8 Q4.2,87.8 4.2,84Z',
    inkWidth: 2.2,
    code: { x: 50, y: 76.5, size: 16 },
    num: { x: 50, y: 56.5, size: 32 },
  },
  US: {
    key: 'US',
    h: 100,
    tip: [50, 100],
    plate: SHIELD_PATH,
    // The 1926 border ring (the plate at 0.84, `rim`) and the band above its rule.
    band: 'M8,24.1 L24.6,8.1 C28,11 32.6,12.8 37.2,12.8 C41.8,12.8 46.6,11.1 50,8 C53.4,11.1 58.2,12.8 62.8,12.8 ' +
      'C67.4,12.8 72,11 75.4,8.1 L92,24.1 C89.5,27.5 88.2,31.5 87.9,35.5 H12.1 C11.8,31.5 10.5,27.5 8,24.1Z',
    ink: 'M12.5,35.5 H87.5',
    rim: 0.84,
    inkWidth: 3.6,
    code: { x: 50, y: 30.2, size: 18.5 },
    num: { x: 50, y: 79.5, size: 45 },
  },
};

/** A state's form, from its two letters: the places the archive has been
 *  to have their own; anything else the US-route shield. */
export function shieldForm(code?: string | null): ShieldForm {
  const key = (code ?? '').trim().toUpperCase();
  return key in SHIELD_FORMS ? SHIELD_FORMS[key as ShieldForm['key']] : SHIELD_FORMS.US;
}

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

// The District, however it is written: "District of Columbia", "Washington,
// DC", "Washington D.C.", "DC". Never plain "Washington", which is the state.
const DISTRICT = /^(?:district of columbia|washington,?\s*d\.?\s*c\.?|d\.?\s*c\.?)$/;

/** The two letters in a shield's band, derived from the place's region:
 *  Florida → FL, Arizona → AZ, Utah → UT, New York → NY, District of
 *  Columbia (or "Washington, DC") → DC. Empty when there is no region (the
 *  band is then left blank rather than guessed). */
export function stateCode(region?: string | null): string {
  const name = region?.trim();
  if (!name) return '';
  const lower = name.toLowerCase().replace(/\s+/g, ' ');
  if (DISTRICT.test(lower)) return 'DC';
  const known = STATE_CODES[lower];
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
/** The sign's name's line height, em (global.css `.archive-ticket-sign__name`). */
export const TICKET_NAME_LINE = 0.95;
export const SIGN_NAME_MAX = 30;
export const SIGN_NAME_MIN = 15;
export function signNameSize(name: string): number {
  const longest = Math.max(1, ...name.trim().split(/\s+/).map((word) => word.length));
  return Math.max(SIGN_NAME_MIN, Math.min(SIGN_NAME_MAX, Math.floor(SIGN_NAME_MEASURE / (longest * 0.66))));
}
/** How many lines the name takes inside the rule: a greedy wrap at
 *  SIGN_NAME_MEASURE, at its own size (`signNameSize`), ~0.66em a bold
 *  capital and ~0.3em a space — the same estimate the size is set by, never
 *  measured. MIAMI, ORLANDO, PAGE and ZION take one line; BRYCE CANYON and
 *  NEW YORK two. The ticket a cover folds into on a switch is cut to the
 *  archive's tallest sign (src/lib/coverDock.ts, TICKET). */
export function signLines(name: string): number {
  const size = signNameSize(name);
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let lines = 1;
  let run = 0;
  words.forEach((word) => {
    const w = word.length * 0.66 * size;
    if (run > 0 && run + 0.3 * size + w > SIGN_NAME_MEASURE) {
      lines += 1;
      run = w;
    } else run += (run > 0 ? 0.3 * size : 0) + w;
  });
  return lines;
}

// ── One shield per place, and how they stack ──
// Each place's shield stands on the map with its foot's point on the place,
// placed on every camera frame from the camera's projection (RouteAtlas,
// "The shields"). Nothing moves a shield off its place, except this: where
// two shields meet at a camera's zoom (Zion and Bryce are ~80 km apart, a
// few px on a zoomed-out flight), they STACK, as 11 mois sans toi(t)'s stop
// signs do — each still on its own place, in stop order, the current stop on
// top, and the pile's front shield carries a small count. A shield buried
// almost entirely behind the one in front of it (their places a few px
// apart) is lifted just enough that its head shows above (STACK_PEEK), so a
// pile always reads as so many signs, never as one.
//
// The map's sizes, css px. At every chapter's own resting camera no two
// shields meet (measured at 1728 × 1000 and 1280 × 800: the nearest pair,
// Miami–Orlando from Miami, stands 46px apart across and 93px down).
export const SHIELD_MAP_PX = 34;
/** How a shield carries its state, as the CSS scales it (global.css, "The
 *  place shields"; scripts/route-shield.test.mjs holds the two together). */
export const SHIELD_SCALE = { ahead: 0.9, past: 0.94, inbound: 1.1, current: 1.4 } as const;
/** Owner, 2026-09-30: 地图放大之后，路牌也可以稍微放大一点，不然看不清. The shields
 *  grow a little with the map's zoom, on top of their state's scale: 1× on
 *  the whole planet (zoom `from` and out), easing up to `max` at a place's
 *  rest (`to`: RouteAtlas HOP.restZoom, the lowest rest zoom — every place
 *  rests at 5.05–5.98, so every place rests at `max`). 1.3, the middle of
 *  the range asked for: an ahead shield's stop number then stands 10.5 px
 *  tall at a rest on the desktop (8.1 at 1×) and 8.1 px on the phone (6.2),
 *  the active one's state letters 7.2 px (5.5); every rest still keeps its
 *  shields apart and its cover's corner (scripts/route-shield.test.mjs,
 *  scripts/cover-dock.test.mjs). The active shield keeps its lift
 *  (SHIELD_SCALE.current) on top of it. DERIVED from the camera's zoom,
 *  never measured; the covers' dock is planned at the rest scale
 *  (RouteAtlas, "The dock"). */
export const SHIELD_ZOOM = { from: 2, to: 5.05, max: 1.3 } as const;
export function shieldZoomScale(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  const k = Math.min(1, Math.max(0, (zoom - SHIELD_ZOOM.from) / (SHIELD_ZOOM.to - SHIELD_ZOOM.from)));
  return 1 + (SHIELD_ZOOM.max - 1) * k * k * (3 - 2 * k);
}
/** A shield showing less than this beyond the one in front of it (above,
 *  below or to either side) is buried: its head is lifted this far above
 *  the other's, px. */
export const STACK_PEEK = 6;
/** Two shields that overlap by more than this (box into box, px) are one
 *  pile; shields that merely touch stand apart and carry no count. */
export const STACK_GAP = -1;
/** A shield in front that reaches less than this (px, each way) into
 *  another's type leaves it printed: a corner touching the foot of a number
 *  (Miami's, read on a phone, at Orlando's 02) does not hide it. */
export const TYPE_SLACK = 1;

export interface StackSlot {
  id: string;
  /** 1-based stop number. */
  number: number;
  /** The foot's point on screen, px. */
  x: number;
  y: number;
  /** The shield as drawn now (its state's scale applied), px. */
  w: number;
  h: number;
  /** 2 the stop the camera is on, 1 the stop it is flying to, else 0. */
  rank: number;
  /** Where the form prints its type (`typeBox`), as fractions of the box.
   *  Without it, every shield behind a pile's front counts as buried. */
  type?: readonly [number, number, number, number];
}

export interface StackPlace {
  /** The lift of a buried shield, px (≤ 0: up). */
  dy: number;
  /** 0 = back of its pile. Front shields are above every shield behind. */
  z: number;
  /** On a pile's front shield: how many shields the pile holds (else 0). */
  count: number;
  /** The id of its pile's front shield (its own, alone or in front). */
  front: string;
  /** Behind a shield that covers some of its type: its number and letters
   *  are not printed (half a number beside the front's read as a third
   *  digit, "053"), so a pile reads as a deck — the front's number, the
   *  edges of the shields behind, the count. */
  buried: boolean;
}

const overlaps = (a: StackSlot, b: StackSlot, gap: number) =>
  a.x - a.w / 2 < b.x + b.w / 2 + gap &&
  b.x - b.w / 2 < a.x + a.w / 2 + gap &&
  a.y - a.h < b.y + gap &&
  b.y - b.h < a.y + gap;

/** Where a form prints its type — the stop number and the state's letters —
 *  as fractions of the shield's box [left, top, right, bottom]: two digits
 *  of the label face (their ink ≈0.55em either side of the centre, the caps
 *  0.7em over the baseline) and the letters' line (≈0.65em either side). A
 *  pile hides a shield's type when a shield in front covers some of it
 *  (more than TYPE_SLACK). */
export function typeBox(form: ShieldForm): [number, number, number, number] {
  const lines = [
    { x0: form.num.x - 0.55 * form.num.size, x1: form.num.x + 0.55 * form.num.size, y0: form.num.y - 0.7 * form.num.size, y1: form.num.y },
    { x0: form.code.x - 0.65 * form.code.size, x1: form.code.x + 0.65 * form.code.size, y0: form.code.y - 0.7 * form.code.size, y1: form.code.y },
  ];
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return [
    round(Math.min(...lines.map((line) => line.x0)) / 100),
    round(Math.min(...lines.map((line) => line.y0)) / form.h),
    round(Math.max(...lines.map((line) => line.x1)) / 100),
    round(Math.max(...lines.map((line) => line.y1)) / form.h),
  ];
}

/** Places the shields of one camera frame: piles, their order, the lift of
 *  a buried shield, the front shield's count and whose type is covered.
 *  Pure and cheap (six places, one frame). */
export function stackShields(slots: readonly StackSlot[], gap = STACK_GAP): Map<string, StackPlace> {
  const parent = slots.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  for (let a = 0; a < slots.length; a += 1) {
    for (let b = a + 1; b < slots.length; b += 1) {
      if (overlaps(slots[a], slots[b], gap)) parent[find(a)] = find(b);
    }
  }
  const piles = new Map<number, StackSlot[]>();
  slots.forEach((slot, index) => {
    const root = find(index);
    const pile = piles.get(root);
    if (pile) pile.push(slot);
    else piles.set(root, [slot]);
  });
  const placed = new Map<string, StackPlace>();
  piles.forEach((pile) => {
    // Back to front: in stop order, the later stop in front; the stop the
    // camera is flying to over that, the stop it is on over everything.
    const order = [...pile].sort((a, b) => a.rank - b.rank || a.number - b.number);
    const lifted = new Map<string, number>();
    for (let index = order.length - 1; index >= 0; index -= 1) {
      const slot = order[index];
      let dy = 0;
      // Every shield in front of this one that would bury it — leave less
      // than STACK_PEEK of it showing on every side — pushes its head up
      // above theirs (again, until none does: a lift past one can leave it
      // under another). A shield whose side or foot still shows is left on
      // its place: it reads as its own sign already.
      for (let pass = 0; pass < order.length; pass += 1) {
        let moved = false;
        for (let front = index + 1; front < order.length; front += 1) {
          const other = order[front];
          const otherFoot = other.y + (lifted.get(other.id) ?? 0);
          const otherTop = otherFoot - other.h;
          const foot = slot.y + dy;
          const top = foot - slot.h;
          const showing = Math.max(
            otherTop - top,
            foot - otherFoot,
            other.x - other.w / 2 - (slot.x - slot.w / 2),
            slot.x + slot.w / 2 - (other.x + other.w / 2),
          );
          if (showing < STACK_PEEK - 0.01) {
            dy += otherTop - STACK_PEEK - top;
            moved = true;
          }
        }
        if (!moved) break;
      }
      // Half pixels: the lift is written as a transform, only when it moves.
      dy = Math.round(dy * 2) / 2 + 0;
      lifted.set(slot.id, dy);
    }
    // With every lift known: whose type a shield in front of it covers.
    const front = order[order.length - 1];
    const box = (slot: StackSlot) => {
      const foot = slot.y + (lifted.get(slot.id) ?? 0);
      return { left: slot.x - slot.w / 2, right: slot.x + slot.w / 2, top: foot - slot.h, bottom: foot };
    };
    order.forEach((slot, index) => {
      let buried = false;
      if (index < order.length - 1) {
        if (!slot.type) buried = true;
        else {
          const own = box(slot);
          const type = {
            left: own.left + slot.type[0] * slot.w,
            top: own.top + slot.type[1] * slot.h,
            right: own.left + slot.type[2] * slot.w,
            bottom: own.top + slot.type[3] * slot.h,
          };
          buried = order.slice(index + 1).some((other) => {
            const cover = box(other);
            return Math.min(type.right, cover.right) - Math.max(type.left, cover.left) > TYPE_SLACK &&
              Math.min(type.bottom, cover.bottom) - Math.max(type.top, cover.top) > TYPE_SLACK;
          });
        }
      }
      placed.set(slot.id, {
        dy: lifted.get(slot.id) ?? 0,
        z: index,
        count: index === order.length - 1 && order.length > 1 ? order.length : 0,
        front: front.id,
        buried,
      });
    });
  });
  return placed;
}

// ── The split-flap: a stop's name arriving ──
// Owner, 2026-09-30: 封面上的地点我喜欢是和之前一样字条跳转切换，和目标网站的效果一致，
// 这个很重要. The ticket's name turns as 11 mois sans toi(t)'s board does
// (its `c_`, measured frame by frame: scratchpad wf29/ref/SPEC.md §2.3),
// on the reference's own numbers:
//   - t0: the name being left RETRACTS to its first FLAP.keep letters
//     ("MIAMI" → "MIA");
//   - FLAP.pause later, letter i starts at FLAP.stagger · i and shows
//     FLAP.base + i random capitals, one every FLAP.tick, then settles on its
//     own — left to right, a departure board's cascade ("ORLANDO" is down
//     634 ms after the retract, "BRYCE CANYON" 919).
// The reference's word reflows as its letters change width; ours never
// moves: every character is a box of its own final glyph's width (FlapWord),
// a flip is printed over it and drawn from the characters of its own width
// class (a W in the cell of an I overprinted its neighbours: "EDAMI"), and
// the words keep their line breaks, so a two-line name never falls to one
// line mid-turn. The letters kept from the name being left are set as it was
// set, one box each, over the new name's blank cells, and each goes as the
// cell under it starts. The stop number and a state that changes turn on the
// same board, on the same numbers (the digits and the letters in their own
// boxes: tabular figures, fixed letter cells); a state that stays does not
// turn, and a new state's letters turn in from a blank band (the shield
// already wears the new state's form: FL on Arizona's outline reads as a
// misprint). Only what changes turns. Reduced motion shows the word, no flap.
export const FLAP = {
  /** The name being left retracts to this many of its letters… */
  keep: 3,
  /** …and holds them this long… */
  pause: 160,
  /** …then letter i starts at stagger · i ms… */
  stagger: 35,
  /** …and shows base + i random letters, one every tick ms, then settles. */
  base: 6,
  tick: 22,
  /** A cover opens round its sign only once the name has settled, and this
   *  long after it (the settled word is read before the ticket moves again). */
  hold: 60,
} as const;

export interface FlapStep {
  /** ms after the retract: the character starts to turn… */
  start: number;
  /** …and is down. */
  land: number;
  flips: number;
}

/** The board's plan for a word of `count` characters (spaces included: the
 *  cascade runs through them, as the reference's does, though a space
 *  itself never turns), ms after the retract. */
export function flapPlan(count: number): FlapStep[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const start = FLAP.pause + FLAP.stagger * index;
    const flips = FLAP.base + index;
    return { start, flips, land: start + FLAP.tick * flips };
  });
}

/** The characters a word turns through: its letters, one space between
 *  words (FlapWord sets them so). */
export const flapText = (text: string) => text.trim().replace(/\s+/g, ' ').toUpperCase();

/** How long after the retract the whole word is down, ms (0 for nothing):
 *  MIAMI 520, ORLANDO 634, PAGE 463, NEW YORK 691, BRYCE CANYON 919. */
export function flapSpan(text: string): number {
  const plan = flapPlan(flapText(text).length);
  return plan.length ? plan[plan.length - 1].land : 0;
}

// Each character turns only through characters of its own width class, in a
// cell as wide as the character it lands on: narrow capitals through narrow
// ones, M and W through the wide round ones, everything else through the
// middle of the alphabet; the figures are tabular, all one width.
const NARROW = 'IJLT';
const WIDE = 'MWQO';
const MIDDLE = 'ABCDEFGHKNOPRSUVXYZ';
const DIGITS = '0123456789';
export function flipSet(final: string): string {
  if (/\d/.test(final)) return DIGITS;
  if (NARROW.includes(final)) return NARROW;
  if (final === 'M' || final === 'W') return WIDE;
  return MIDDLE;
}

/** A scatter as random as the reference's `Math.random()` per flip, but a
 *  function of (seed, cell, flip): the same run reads the same at any frame,
 *  so a frame dropped or repeated never changes a letter out of turn. */
export function flapNoise(seed: number, cell: number, flip: number): number {
  let h = (seed ^ Math.imul(cell + 1, 0x9e3779b1) ^ Math.imul(flip + 1, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** What a character shows `t` ms after the retract: `before` until its
 *  start (the letter kept from the name being left, the number being left,
 *  or nothing), then a random character of its own width class every tick
 *  — never the one it lands on — then itself. */
export function flapGlyph(final: string, before: string, step: FlapStep, t: number, seed: number, cell: number): string {
  if (!final.trim()) return final;
  if (t >= step.land) return final;
  if (t < step.start) return before;
  const flip = Math.floor((t - step.start) / FLAP.tick);
  const set = flipSet(final).replace(final, '');
  return set[Math.floor(flapNoise(seed, cell, flip) * set.length)] ?? final;
}

/** Whether the letter the name being left keeps at `index` still shows `t`
 *  ms after the retract (t < 0: the name whole): the first FLAP.keep stay
 *  through the pause, each until the new name's cell at its place starts
 *  (gone at the pause past the new name's end). */
export function keptShows(index: number, newCount: number, t: number): boolean {
  if (t < 0) return true;
  if (index >= FLAP.keep) return false;
  return t < (index < newCount ? FLAP.pause + FLAP.stagger * index : FLAP.pause);
}
