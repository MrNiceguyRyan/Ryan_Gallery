// ── The cover rides with its shield ──
// Owner, 2026-09-28: 我希望封面可以跟随路牌一起走，出现在路牌的右上角或者左上角
// 或者右下角或者左下角 — the chapter's cover (the photograph and its ticket stub)
// is attached to the current place's route shield on the map, the way the
// reference's name board sits right over its stop's pin, at a corner of the
// shield. Every camera frame the atlas projects the places (the same
// projection the shields stand on) and hands the points over
// (`coverDock.publish`); the chapter writes its cover there. The camera sets
// each place where its cover fits (`centreFor`).
//
// One dock per corner (owner, 2026-09-29: 其实不一定非得右上角，从任何角度冒出来
// 都可以，不用局限一定要在地标左下边). The single corner for every place
// (below-left, the stub standing still through a switch) is released: the
// switch no longer carries the whole cover across the change, it folds it
// into a small ticket first ("The switch", below), so the corner is free to
// be each place's own. Each place takes the corner that hides none of its
// neighbours' shields and keeps its own route clear (`chooseCorners`), the
// same corner as the place before it where that is as good. Places at one
// corner stand on one point of the screen (`dockPoint`), so a hop between
// two of them moves nothing but the planet.
//
// Everything here is DERIVED from the viewport and the archive's own data —
// the cover's ratio (from its file name), whether it carries its state's
// tab, the places' coordinates and each chapter's rest zoom, the length of
// its name — never read off the page. scripts/cover-dock.test.mjs holds the
// maths.

import { EASE, bezierFn } from './motion.ts';
import { signNameSize } from './routeShield.ts';

export type Quadrant = 'tr' | 'tl' | 'br' | 'bl';

/** Every corner a plate can take about its shield (the geometry is the same
 *  for each; global.css draws a caret for each). */
export const QUADRANTS: readonly Quadrant[] = ['tr', 'bl', 'tl', 'br'];

/** The corners in the order a tie is broken: below-left and above-left keep
 *  the stub (the sign) on the shield's side and the photograph out on the
 *  open map, clear of the chapter's rail on the right. */
export const CORNER_ORDER: readonly Quadrant[] = ['bl', 'tl', 'br', 'tr'];

/** How much of its own route (px, the two legs to its neighbours) a cover
 *  may lie over before a corner that keeps it clear wins. The state's tab
 *  on every cover lays a 70–82 px sliver of Page's and Orlando's legs under
 *  a below-left cover; without the slack that sliver alone turned them
 *  above-right, 838–1283 px of ground moved per hop for nothing (晕). A
 *  cover that lies across its route (New York's 568–1072 px below-left)
 *  still counts. */
export const ROUTE_SLACK = 160;

export const DOCK = {
  /** The stub's fixed measure (ArchiveChapter TICKET_STUB). */
  stub: 190,
  /** The joint: the gap, each way, between the shield's corner and the
   *  cover's. No line crosses it (the owner has twice struck lines off the
   *  signs: 不需要下面的引线, 不需要白色竖干); the plate's own corner points
   *  at the shield with a caret, as the reference's board does over its
   *  stop (global.css `.archive-plate__caret`). */
  gap: 8,
  /** The state's tab on the cover's top edge (its name boxed: 州名可以框起来，
   *  更醒目). */
  tab: 30,
  /** What hangs under the plate: "Open story" only (30px down). */
  below: 36,
  /** The stage the covers are placed on: below the nav's band, above the
   *  tick strip, clear of the chapter's rail by `railGap`. */
  top: 104,
  bottom: 64,
  side: 48,
  railGap: 48,
  /** The photograph's height: this share of the stage's, or what its width
   *  share leaves (the stub included), never below `photoMinH`. */
  // A portrait cover at 0.64 of the stage kept 46% of the area it had in
  // the column (critic, 2026-09-28): 0.78 gives it back most of its height,
  // and a landscape its full width.
  photoShareH: 0.78,
  coverShareW: 0.8,
  photoMinH: 240,
  photoMaxH: 680,
} as const;

/** The chapter rail (HomePage's archive column): its right edge is the
 *  column's padding (`lg:pr-12 xl:pr-16`), its width `--rail-w`
 *  (global.css `.archive-rail`: clamp(280px, 25vw, 440px)). */
export const RAIL = { min: 280, share: 0.25, max: 440 } as const;

export interface Box { left: number; top: number; right: number; bottom: number }
export interface Point { x: number; y: number }
export interface Size { w: number; h: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function railBox(vw: number) {
  const right = vw - (vw >= 1280 ? 64 : 48);
  const width = clamp(RAIL.share * vw, RAIL.min, RAIL.max);
  return { left: right - width, right, width };
}

/** Where a cover and its shield may stand, in viewport (= pinned atlas) px. */
export function stageBox(vw: number, vh: number): Box {
  return { left: DOCK.side, top: DOCK.top, right: railBox(vw).left - DOCK.railGap, bottom: vh - DOCK.bottom };
}

/** A photograph's ratio from its Sanity file name (`-4032x6048.jpg`),
 *  clamped as the covers are (a tall 9:20 to a wide 2.4:1); null without. */
export function coverRatioOf(url: string | undefined | null): number | null {
  const match = /-(\d+)x(\d+)\.[a-z]+/i.exec(url ?? '');
  if (!match) return null;
  const ratio = Number(match[1]) / Number(match[2]);
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(2.4, Math.max(0.45, ratio)) : null;
}

/** The cover's size on this stage: the photograph at its own ratio and the
 *  stub beside it, as large as the stage lets every corner still fit. */
export function coverSize(ratio: number, stage: Box) {
  const stageW = stage.right - stage.left;
  const stageH = stage.bottom - stage.top;
  const byHeight = stageH * DOCK.photoShareH;
  const byWidth = (stageW * DOCK.coverShareW - DOCK.stub) / ratio;
  // Never more than a corner can hold, whatever the floor says: the plate,
  // the joint and a shield side by side across the stage, and the plate with
  // its tab, cue, joint and a shield down it.
  const fitsW = (stageW - DOCK.gap - 48 - DOCK.stub) / ratio;
  const fitsH = stageH - DOCK.tab - DOCK.below - DOCK.gap - 56;
  const photoH = Math.floor(Math.min(fitsW, fitsH, clamp(Math.min(byHeight, byWidth), DOCK.photoMinH, DOCK.photoMaxH)));
  const photoW = Math.floor(photoH * ratio);
  return { photoW, photoH, w: photoW + DOCK.stub, h: photoH };
}

/** The plate (photograph + stub) beside a shield standing on `point` (its
 *  foot's point), at `quadrant`: one corner of the plate a joint's gap from
 *  the shield's corner. */
export function plateRect(point: Point, shield: Size, size: Size, quadrant: Quadrant): Box {
  const right = quadrant === 'tr' || quadrant === 'br';
  const top = quadrant === 'tr' || quadrant === 'tl';
  const left = right ? point.x + shield.w / 2 + DOCK.gap : point.x - shield.w / 2 - DOCK.gap - size.w;
  const y = top ? point.y - shield.h - DOCK.gap - size.h : point.y + DOCK.gap;
  return { left, top: y, right: left + size.w, bottom: y + size.h };
}

/** The plate with what it carries: the state's tab above, the cue below. */
export function fitBox(plate: Box, tab: boolean): Box {
  return { left: plate.left, top: plate.top - (tab ? DOCK.tab : 0), right: plate.right, bottom: plate.bottom + DOCK.below };
}

/** Which side of the plate its tab and cue sit on: away from the shield. */
export function awaySide(quadrant: Quadrant): 'left' | 'right' {
  return quadrant === 'tr' || quadrant === 'br' ? 'right' : 'left';
}

const area = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

// ── The camera, as a pinhole ──
// The atlas's chapter camera at rest: its centre stands at the atlas's focal
// point on the screen (`focal`, its padding's centre, the same for every
// chapter), pitched `pitch` degrees, turned `bearing`, `distance` px from its
// centre (Mapbox: 1.5 canvas heights, where a world px at the camera's zoom
// is a screen px). Web Mercator at the zoom, a pinhole in front of it. An
// approximation of Mapbox's own (its globe at the rest zooms is all but
// flat) — good to a few px — used to plan, never to place: the covers are
// placed by the atlas's real projection every frame.
export interface DockCamera {
  focal: Point;
  pitch: number;
  bearing: number;
  distance: number;
}

const mercX = (lng: number, world: number) => ((lng + 180) / 360) * world;
const mercY = (lat: number, world: number) =>
  ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * world;

/** Where `coords` stand on the screen with the camera's centre over
 *  `centre` at `zoom`. */
export function projectAt(coords: readonly [number, number], centre: readonly [number, number], zoom: number, camera: DockCamera): Point {
  const world = 512 * 2 ** zoom;
  const mx = mercX(coords[0], world) - mercX(centre[0], world);
  const my = mercY(coords[1], world) - mercY(centre[1], world);
  const b = (camera.bearing * Math.PI) / 180;
  const p = (camera.pitch * Math.PI) / 180;
  const right = mx * Math.cos(b) + my * Math.sin(b);
  const forward = -(-mx * Math.sin(b) + my * Math.cos(b));
  const depth = Math.max(camera.distance * 0.25, camera.distance + forward * Math.sin(p));
  return {
    x: camera.focal.x + (camera.distance * right) / depth,
    y: camera.focal.y - (camera.distance * forward * Math.cos(p)) / depth,
  };
}

/**
 * The camera's centre that sets `place` at screen `point` — `projectAt` run
 * backwards. The atlas moves a place on the screen by where the camera
 * stands over the ground, never by moving the camera's centre on the
 * screen, so every chapter keeps the view the atlas has always had: a place
 * set low on the page does not tip the horizon into the top of the screen,
 * as a padding that moved the centre down did.
 */
export function centreFor(place: readonly [number, number], point: Point, zoom: number, camera: DockCamera): [number, number] {
  const world = 512 * 2 ** zoom;
  const p = (camera.pitch * Math.PI) / 180;
  const b = (camera.bearing * Math.PI) / 180;
  const d = camera.distance;
  // The place's screen offset from the centre (right, up), and the ground
  // under it in the camera's frame (forward = up the screen).
  const right = point.x - camera.focal.x;
  const up = camera.focal.y - point.y;
  const forward = (up * d) / Math.max(1e-6, d * Math.cos(p) - up * Math.sin(p));
  const across = (right * (d + forward * Math.sin(p))) / d;
  // Into Web Mercator px (x east, y south).
  const dx = across * Math.cos(b) + forward * Math.sin(b);
  const dy = across * Math.sin(b) - forward * Math.cos(b);
  const mx = mercX(place[0], world) - dx;
  const my = mercY(place[1], world) - dy;
  const lng = (mx / world) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * my) / world))) * 180) / Math.PI;
  return [lng, lat];
}

export interface DockChapter {
  id: string;
  /** The place's name (its sign's size) and the lines it takes on the sign
   *  (src/lib/routeShield.ts, signLines): the tallest sets the ticket. */
  name?: string;
  lines?: number;
  /** The place, [longitude, latitude], and its chapter's rest zoom. */
  coordinates: readonly [number, number];
  zoom: number;
  ratio: number;
  /** A place with a region: its state's tab rides on the cover. */
  tab: boolean;
  /** The current shield's box (the camera's place, at its current scale). */
  shield: Size;
  /** Every other place's shield, as drawn when not current. */
  neighbours: ReadonlyArray<{ coordinates: readonly [number, number] } & Size>;
  /** The stops either side of it on the route (the last closes onto the
   *  first): a cover keeps off its own legs. */
  route?: { prev?: readonly [number, number]; next?: readonly [number, number] };
  /** The ticket's card stock (src/lib/ticketStock.ts): a switch eases the
   *  ticket from the stock it leaves to this one. */
  stock?: string;
}

export interface DockEntry {
  /** This place's corner of its shield (`chooseCorners`). */
  quadrant: Quadrant;
  /** Where the camera sets this place (its shield's foot), viewport px: the
   *  same point for every place at the same corner. */
  point: Point;
  /** The camera's centre that puts it there (`centreFor`). */
  centre: [number, number];
  /** The plate's top-left corner from the shield's foot, px: the cover is
   *  written at the foot's point every frame and sits here from it. */
  offset: Point;
  photoW: number;
  photoH: number;
  tab: boolean;
  stock?: string;
  /** The lines of its sign's name. */
  lines: number;
  /** The ticket it folds into on a switch ("The ticket"): its size (one for
   *  the whole archive), the plate's translate that seats it at the corner
   *  by the shield, and that seat's top-left from the foot, px. */
  ticketW: number;
  ticketH: number;
  fold: Point;
  ticket: Point;
  /** How much of its neighbours' shields the cover would hide (px²) and how
   *  far past the stage it would reach (px): 0 and 0 when it sits clear. */
  covered: number;
  overflow: number;
}

/** The neighbours' shields a cover must keep off, on the camera that sets
 *  the place at `point`: every one on screen and not under the rail (the
 *  atlas does not print those). */
function visibleNeighbours(chapter: DockChapter, centre: [number, number], camera: DockCamera, vw: number, vh: number) {
  const railLeft = railBox(vw).left;
  return chapter.neighbours.flatMap((n) => {
    const foot = projectAt(n.coordinates, centre, chapter.zoom, camera);
    const box: Box = { left: foot.x - n.w / 2, top: foot.y - n.h, right: foot.x + n.w / 2, bottom: foot.y };
    if (box.right < 0 || box.left > vw || box.bottom < 0 || box.top > vh) return [];
    if (box.right > railLeft - 4) return [];
    return [box];
  });
}

/** Pads a box by `by` px each way. */
const grow = (box: Box, by: number): Box => ({ left: box.left - by, top: box.top - by, right: box.right + by, bottom: box.bottom + by });
const union = (a: Box, b: Box): Box => ({
  left: Math.min(a.left, b.left),
  top: Math.min(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
});

/** A corner's dock point: where every place set at `quadrant` stands on the
 *  screen, so that every pair — its shield and its cover (at the corner,
 *  with what it carries) — fits the stage. The union of all the pairs,
 *  their feet on one point, centred on the stage and kept inside it;
 *  `overflow` is what still could not fit (px, both axes: 0 by
 *  construction, since `coverSize` keeps each cover inside the stage beside
 *  a shield at any corner). Every place is in the union whichever corner it
 *  takes, so a corner's point never depends on the choice. */
export function dockPoint(stage: Box, pairs: ReadonlyArray<{ shield: Size; size: Size; tab: boolean }>, quadrant: Quadrant) {
  const origin = { x: 0, y: 0 };
  let group: Box | null = null;
  for (const { shield, size, tab } of pairs) {
    const plate = fitBox(plateRect(origin, shield, size, quadrant), tab);
    const pair = union(plate, { left: -shield.w / 2, top: -shield.h, right: shield.w / 2, bottom: 0 });
    group = group ? union(group, pair) : pair;
  }
  if (!group) return { point: { x: Math.round((stage.left + stage.right) / 2), y: Math.round((stage.top + stage.bottom) / 2) }, overflow: 0 };
  const axis = (lo: number, hi: number, g0: number, g1: number) => {
    const min = lo - g0;
    const max = hi - g1;
    const centred = (lo + hi) / 2 - (g0 + g1) / 2;
    if (min <= max) return { at: clamp(centred, min, max), over: 0 };
    return { at: centred, over: min - max };
  };
  const x = axis(stage.left, stage.right, group.left, group.right);
  const y = axis(stage.top, stage.bottom, group.top, group.bottom);
  return { point: { x: Math.round(x.at), y: Math.round(y.at) }, overflow: Math.round(x.over + y.over) };
}

// ── The ticket: the cover's compact form ──
// Owner, 2026-09-29: 封面切换动画过程中先缩小成类似机票那样过去，地点文字滚动，
// 到位之后展开封面，然后右上角的尖冒出来. Through a switch the cover is a
// small boarding pass: the plate's own print CLIPPED (never scaled, so no
// type shrinks) to a strip of the photograph's face beside the perforation
// and the head of the stub down to 12 px of card under the sign's enamel
// rule — about 2:1, 340×172 on the archive, where a stub alone (190×172,
// nearly square) did not read as 机票. Its lower edge is a straight cut: no
// shadow, no line. It sits at the plate's corner nearest its shield: the
// small ticket stands beside its landmark and the cover opens away from it.
export const TICKET = {
  /** The strip of the photograph kept on the ticket, px (never more than the
   *  narrowest photograph on the stage). */
  face: 150,
  /** The ticket's height above its sign's name lines, px: the sign's top in
   *  the stub (12: the stub's 20 top padding less the sign's 8 margin), its
   *  top padding (12), the shield row (50: ceil(46 × 108/100), the tallest
   *  SHIELD_FORMS form at the sign's --shield), the gap (14), the sign's
   *  bottom padding (15) and the card left under the rule (12). */
  head: 115,
  /** The line height of the sign's name, em (global.css
   *  `.archive-ticket-sign__name`). */
  nameLine: 0.95,
  // The beats, ms from the click (the camera's turn is 1400 on EASE.turn).
  /** 尖…等封面切换过去之后再冒出来: the tip goes back first (DUR.flick,
   *  EASE.leave), and the tab and "Open story" fade with it (EASE.fade). */
  tipOutMs: 120,
  extrasOutMs: 120,
  /** 先缩小成类似机票那样: the face closes toward the perforation (60→380)
   *  and the stub rolls up to the ticket's height (100→380), both on
   *  EASE.plane, while the camera makes the fast half of its turn. */
  foldAt: 60,
  faceMs: 320,
  rollAt: 100,
  rollMs: 280,
  /** The print fades to the card's dark ground as it folds (60→340,
   *  EASE.fade): the ticket is blank-faced at the relay, so the ticket
   *  leaving and the ticket arriving match to the pixel. */
  printOutMs: 280,
  /** 过去…地点文字滚动: the transit. The arriving ticket lies where the
   *  leaving one did, its name turning; it lasts at least this long… */
  transitMinMs: 480,
  /** …and 到位之后展开封面: it opens when the camera has made this share of
   *  its move. */
  landShare: 0.95,
  /** Meanwhile its own print develops into the strip (EASE.develop), from
   *  this long after the relay to this long before the opening (at most
   *  developMaxMs), so the opening only reveals. */
  developLead: 40,
  developTail: 20,
  developMaxMs: 620,
  /** The card eases from the stock it leaves (EASE.travel), at most this. */
  paperMaxMs: 620,
  /** The sign's rule eases between a one-line and a two-line name at the
   *  relay (EASE.travel: its edge never steps more than ~5 px a frame). */
  ruleMs: 240,
  /** The opening: the stub unrolls (0→300) and the face opens out of the
   *  strip (60→440), both on EASE.plane. */
  unrollMs: 300,
  openAt: 60,
  openMs: 380,
  /** 然后…尖冒出来: the tip comes out of the corner that faces the shield,
   *  this long after the cover is open (EASE.arrive, no overshoot)… */
  tipGap: 20,
  tipInMs: 200,
  /** …and the tab and "Open story" come back (DUR.out, EASE.arrive). */
  extrasInMs: 400,
  /** A new choice mid-switch: the ticket arriving on a ticket in transit
   *  lays its dark ground in over this before the one under it goes; a
   *  cover already opening folds back over at least this. */
  retargetMatMs: 160,
  foldBackMinMs: 160,
  /** A lean in the transit, px: off (the verdict on motion was subtract &
   *  repair). */
  leanPx: 0,
} as const;

/** The opening's whole length (the stub unrolled, the face open). */
export const TICKET_EXPAND_MS = Math.max(TICKET.unrollMs, TICKET.openAt + TICKET.openMs);
/** The fold's whole length, from its start. */
export const TICKET_FOLD_MS = Math.max(TICKET.faceMs, TICKET.rollAt - TICKET.foldAt + TICKET.rollMs);

/** The ticket's height for a sign of `lines` name lines set at `size` px:
 *  144 for one line, 172 for two (at the archive's 30px). */
export function ticketH(lines: number, size = 30) {
  return Math.ceil(TICKET.head + Math.max(1, lines) * TICKET.nameLine * size);
}

/** The archive's one ticket height: its tallest sign's (BRYCE CANYON and NEW
 *  YORK take two lines: 172), so the ticket never changes shape in flight. */
export function archiveTicketH(names: ReadonlyArray<{ name?: string; lines?: number }>) {
  return Math.max(ticketH(1), ...names.map((n) => ticketH(n.lines ?? 1, n.name ? signNameSize(n.name) : 30)));
}

/** The plate's translate that seats a ticket of `w` × `h` (its top-right
 *  W×H, the stub's head) at the plate's corner nearest its shield, and
 *  where that puts the ticket's top-left in the plate. */
export function ticketFold(quadrant: Quadrant | 'phone', plate: Size, w: number, h: number) {
  const across = quadrant === 'br' || quadrant === 'tr' ? -(plate.w - w) : 0;
  // The phone's card stands at the foot of the screen: its ticket forms at
  // the card's bottom-right, above the controls (the above-left mechanics).
  const down = quadrant === 'tl' || quadrant === 'tr' || quadrant === 'phone' ? plate.h - h : 0;
  return { fold: { x: across, y: down }, seat: { x: plate.w - w + across, y: down } };
}

/** How long `a`→`b` lies inside `box`, px (sampled). */
function lengthInside(a: Point, b: Point, box: Box, samples = 200) {
  const step = Math.hypot(b.x - a.x, b.y - a.y) / samples;
  let inside = 0;
  for (let i = 0; i < samples; i += 1) {
    const t = (i + 0.5) / samples;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (x > box.left && x < box.right && y > box.top && y < box.bottom) inside += step;
  }
  return inside;
}

export interface CornerCost {
  quadrant: Quadrant;
  /** Other places' visible shields under the cover (px²). */
  covered: number;
  /** Its own route under the cover beyond the slack (px). */
  route: number;
}

/**
 * Each place's corner, in route order: the corner whose cover (with its tab
 * and cue, grown by 10 px) hides the least of the other places' shields —
 * none hidden is the rule, a hidden shield is a defect — then lies the least
 * over its own two legs beyond `slack` (ROUTE_SLACK), then is the corner the
 * place before it took (a hop between two places at one corner moves nothing
 * but the planet), then comes first in CORNER_ORDER. `points` is each
 * corner's dock point, `sizes` each cover's. Pure: the same archive and
 * screen choose the same corners.
 */
export function chooseCorners(
  chapters: readonly DockChapter[],
  vw: number,
  vh: number,
  camera: DockCamera,
  points: Readonly<Record<Quadrant, Point>>,
  sizes: readonly Size[],
  slack: number = ROUTE_SLACK,
): Array<{ quadrant: Quadrant; costs: CornerCost[] }> {
  let previous: Quadrant | null = null;
  return chapters.map((chapter, index) => {
    const size = sizes[index];
    const costs = CORNER_ORDER.map((quadrant): CornerCost => {
      const point = points[quadrant];
      const centre = centreFor(chapter.coordinates, point, chapter.zoom, camera);
      const fit = grow(fitBox(plateRect(point, chapter.shield, size, quadrant), chapter.tab), 10);
      const covered = visibleNeighbours(chapter, centre, camera, vw, vh).reduce((sum, box) => sum + area(fit, box), 0);
      let legs = 0;
      for (const end of [chapter.route?.prev, chapter.route?.next]) {
        if (end) legs += lengthInside(point, projectAt(end, centre, chapter.zoom, camera), fit);
      }
      return { quadrant, covered: Math.round(covered), route: Math.max(0, Math.round(legs - slack)) };
    });
    const rank = (c: CornerCost) => [c.covered, c.route, c.quadrant === previous ? 0 : 1, CORNER_ORDER.indexOf(c.quadrant)];
    const best = [...costs].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
      return 0;
    })[0];
    previous = best.quadrant;
    return { quadrant: best.quadrant, costs };
  });
}

/**
 * The plan: for each chapter, its corner (`chooseCorners`, or `quadrant`
 * for all when given), where the camera sets its place — its corner's dock
 * point — and the centre that does it, its cover's size (its photograph's
 * own ratio, as large as the stage lets it be) and the ticket it folds into.
 * `covered` says how much of the other places' shields the cover hides at
 * that place's rest (scripts/cover-dock.test.mjs holds it at 0 for the
 * archive). Pure: the same viewport and archive always plan the same way.
 */
export function planDock(
  chapters: readonly DockChapter[],
  vw: number,
  vh: number,
  camera: DockCamera,
  options: { quadrant?: Quadrant; slack?: number } = {},
): Record<string, DockEntry> {
  const stage = stageBox(vw, vh);
  const sizes = chapters.map((chapter) => coverSize(chapter.ratio, stage));
  const pairs = chapters.map((chapter, index) => ({ shield: chapter.shield, size: sizes[index], tab: chapter.tab }));
  const docks = Object.fromEntries(QUADRANTS.map((q) => [q, dockPoint(stage, pairs, q)])) as Record<Quadrant, { point: Point; overflow: number }>;
  const points = Object.fromEntries(QUADRANTS.map((q) => [q, docks[q].point])) as Record<Quadrant, Point>;
  const corners = options.quadrant
    ? chapters.map(() => ({ quadrant: options.quadrant as Quadrant }))
    : chooseCorners(chapters, vw, vh, camera, points, sizes, options.slack);
  // One ticket for the whole archive: it never changes shape in flight.
  const ticketW = Math.min(TICKET.face, ...sizes.map((size) => size.photoW)) + DOCK.stub;
  const tallest = archiveTicketH(chapters);
  const plan: Record<string, DockEntry> = {};
  chapters.forEach((chapter, index) => {
    const size = sizes[index];
    const quadrant = corners[index].quadrant;
    const { point, overflow } = docks[quadrant];
    const centre = centreFor(chapter.coordinates, point, chapter.zoom, camera);
    const fit = grow(fitBox(plateRect(point, chapter.shield, size, quadrant), chapter.tab), 10);
    const covered = visibleNeighbours(chapter, centre, camera, vw, vh).reduce((sum, box) => sum + area(fit, box), 0);
    const rel = plateRect({ x: 0, y: 0 }, chapter.shield, size, quadrant);
    const offset = { x: Math.round(rel.left), y: Math.round(rel.top) };
    const ticketHeight = Math.min(size.photoH, tallest);
    const { fold, seat } = ticketFold(quadrant, { w: size.w, h: size.photoH }, ticketW, ticketHeight);
    plan[chapter.id] = {
      quadrant,
      point,
      centre,
      offset,
      photoW: size.photoW,
      photoH: size.photoH,
      tab: chapter.tab,
      ...(chapter.stock ? { stock: chapter.stock } : null),
      lines: chapter.lines ?? 1,
      ticketW,
      ticketH: ticketHeight,
      fold,
      ticket: { x: offset.x + seat.x, y: offset.y + seat.y },
      covered: Math.round(covered),
      overflow,
    };
  });
  return plan;
}

/** Where a docked cover's stub rests on the screen (viewport px) once its
 *  place is down on the dock: right of the photograph, the photograph's
 *  height, square on the screen — the plate's right end, at any corner.
 *  DERIVED from the plan (the entrance flies the torn pass's stub onto it:
 *  src/lib/explorer.ts, "The stub hand-off"). */
export function coverStubRect(entry: DockEntry) {
  return {
    x: entry.point.x + entry.offset.x + entry.photoW,
    y: entry.point.y + entry.offset.y,
    w: DOCK.stub,
    h: entry.photoH,
    rotate: 0,
  };
}

// ── The switch ──
// Owner, 2026-09-29: 我发现封面总是右上角突出一个尖指向地标，封面之间的切换有点怪，
// 我觉得这个尖可以等封面切换过去之后再冒出来，封面切换动画过程中先缩小成类似机票那样
// 过去，地点文字滚动，到位之后展开封面，然后右上角的尖冒出来. A move between
// places is one turn of the planet, and the cover travels it as a ticket;
// every beat is derived from the flight's own clock (`switchSchedule`):
//  - the tip goes back into its corner, the tab and "Open story" fade;
//  - the cover folds into its ticket at the corner by its shield — the face
//    closes toward the perforation, the stub rolls up to the ticket's
//    height — and its print fades to the card's dark ground
//    (`ticketFrames`), while the planet makes the fast half of its turn;
//  - the relay, which cannot be seen: the arriving place's cover, held
//    hidden in its ticket form since the click, is laid on exactly the same
//    pixels (the same stock, the sign primed with the same words, the same
//    dark face) and the leaving one is cut;
//  - the transit: the ticket lies still (or rides the ground to its new
//    corner, `ticketGlide`) while its name turns like a departure board
//    (src/lib/routeShield.ts, FLAP), its card eases to its own stock and its
//    print develops into the strip;
//  - at 95% of the camera's move the cover opens in place — the stub
//    unrolls, the face opens out of the strip — and then the tip comes out
//    of the corner that faces the shield; the tab and the cue come back.
// No line anywhere: the tip is a corner of the card.
export interface SwitchTimes {
  relayAt: number;
  expandAt: number;
  expandEnd: number;
  tipAt: number;
  end: number;
}

/** The time at which `ease` reaches `y` (bisection, 40 steps). */
export function easeInverse(ease: (t: number) => number, y: number) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (ease(mid) < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** When a switch's cover opens, ms after the click, for a relay at
 *  `relayAt` and a camera that lands `landMs` after the click on `ease`:
 *  when the camera has made TICKET.landShare of its move, never before a
 *  transit of TICKET.transitMinMs. */
export function expandAtFor(relayAt: number, landMs: number, ease: (t: number) => number) {
  return Math.round(Math.max(relayAt + TICKET.transitMinMs, easeInverse(ease, TICKET.landShare) * landMs));
}

/** A switch's beats, ms after the click, for a camera that lands `landMs`
 *  after it on `ease`: the relay as the fold ends (380), the opening when
 *  the camera has made TICKET.landShare of its move (921 on the 1400 turn),
 *  never before a transit of TICKET.transitMinMs, the tip 20 ms after the
 *  opening, the extras with it. */
export function switchSchedule(landMs: number, ease: (t: number) => number): SwitchTimes {
  const relayAt = TICKET.foldAt + TICKET.faceMs;
  const expandAt = expandAtFor(relayAt, landMs, ease);
  return { relayAt, ...afterOpening(expandAt) };
}

/** The beats after an opening at `expandAt`: its end, the tip, the end of
 *  the extras. */
export function afterOpening(expandAt: number) {
  const expandEnd = expandAt + TICKET_EXPAND_MS;
  const tipAt = expandEnd + TICKET.tipGap;
  return { expandAt, expandEnd, tipAt, end: tipAt + TICKET.extrasInMs };
}

/** The ticket form a plate takes: the plate's size, the ticket's, and the
 *  translate that seats it (`ticketFold`). */
export interface TicketForm {
  plate: Size;
  w: number;
  h: number;
  fold: Point;
}

const planeCurve = bezierFn(EASE.plane);
const leaveCurve = bezierFn(EASE.leave);

/** The plate at `kx` of its face open and `ky` of its stub unrolled (1, 1:
 *  whole; 0, 0: the ticket): a clip anchored at its top-right W×H (with
 *  `pad` px kept past the top and right edges for the caret), and the
 *  translate that brings that corner to the shield's. Both run off the same
 *  share, so the edges by the shield never move. */
export function ticketStyle(form: TicketForm, kx: number, ky: number, pad = 12) {
  const left = (form.plate.w - form.w) * (1 - kx);
  const bottom = (form.plate.h - form.h) * (1 - ky);
  const tx = form.fold.x * (1 - kx);
  const ty = form.fold.y * (1 - ky);
  const f = (n: number) => (Math.round(n * 10) / 10 || 0).toFixed(1);
  return {
    clipPath: `inset(${-pad}px ${-pad}px ${f(bottom)}px ${f(left)}px)`,
    transform: `translate(${f(tx)}px, ${f(ty)}px)`,
  };
}

/** The plate's keyframes (WAAPI, linear between them) for a fold into its
 *  ticket, its opening out of it, or a let-go's fold: the face (kx) and the
 *  stub (ky) each on their own clock and curve — folding, the face closes
 *  over TICKET.faceMs and the stub rolls up over the last TICKET.rollMs, on
 *  EASE.plane (EASE.leave both for a let-go: the exit rule); opening, the
 *  stub unrolls over TICKET.unrollMs and the face opens from TICKET.openAt
 *  over TICKET.openMs. */
export function ticketFrames(form: TicketForm, dir: 'fold' | 'expand' | 'let-go', steps = 16) {
  const opening = dir === 'expand';
  const ms = opening ? TICKET_EXPAND_MS : TICKET_FOLD_MS;
  const curve = dir === 'let-go' ? leaveCurve : planeCurve;
  const frames: Array<{ offset: number; clipPath: string; transform: string }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (ms * i) / steps;
    let kx: number;
    let ky: number;
    if (opening) {
      ky = curve(clamp(t / TICKET.unrollMs, 0, 1));
      kx = curve(clamp((t - TICKET.openAt) / TICKET.openMs, 0, 1));
    } else {
      kx = 1 - curve(clamp(t / TICKET.faceMs, 0, 1));
      ky = 1 - curve(clamp((t - (TICKET.rollAt - TICKET.foldAt)) / TICKET.rollMs, 0, 1));
    }
    frames.push({ offset: i / steps, ...ticketStyle(form, kx, ky) });
  }
  return { frames, ms };
}

/**
 * Where the ticket lies (its top-left, viewport px) `t` ms after the click,
 * when its corner changes with the place (Zion below-left → Bryce Canyon
 * above-left): still at `from` until the relay, then riding the camera's own
 * remaining clock (`ease` over `D` ms) to `to`, there by the opening — it
 * moves with the ground, and on a far leg's sine slower than it. With
 * nowhere to go it simply lies still.
 */
export function ticketGlide(from: Point, to: Point, relayAt: number, expandAt: number, ease: (t: number) => number, D: number) {
  const c = (t: number) => ease(clamp(t / Math.max(1, D), 0, 1));
  const c0 = c(relayAt);
  const c1 = c(expandAt);
  return (t: number): Point => {
    let g: number;
    if (t <= relayAt) g = 0;
    else if (t >= expandAt) g = 1;
    else if (c1 - c0 > 1e-6) g = clamp((c(t) - c0) / (c1 - c0), 0, 1);
    else g = (t - relayAt) / Math.max(1, expandAt - relayAt);
    return { x: from.x + (to.x - from.x) * g, y: from.y + (to.y - from.y) * g };
  };
}

/** The develop's mask positions for a print of `ratio` (the house mask,
 *  115° at 400%, global.css `.travel-ticket__photo img`, turned about the
 *  vertical so it runs from the corner by the stub): from the first moment
 *  its nearest corner is half printed to the moment its far corner is — and
 *  `hidden`, a position with nothing of it printed yet, where a ticket's
 *  strip starts blank (the mat), so the relay cannot be seen. */
export function developSweep(ratio: number) {
  const r = Math.max(0.45, Math.min(2.4, ratio || 1.5));
  const from = 36 - 7.46 / r;
  return { from, to: 80 + 9.34 / r, hidden: from - 12 - 1 / r } as const;
}
// The band between the two prints: narrow, so the develop reads as a sweep
// (at 40–60% both photographs lay over each other for ~300 ms: review of
// 2026-09-29). The sweep's positions hold: the band's middle is where it was.
export const DEVELOP_MASK = 'linear-gradient(245deg, #000 45%, transparent 55%)';

// ── The arrival: a ticket from the open map ──
// Owner, 2026-09-29: 当地球页空置的时候，点开一个地点的动效和封面出现动效很差 —
// and, the same day, the switch's own language (先缩小成类似机票那样…到位之后
// 展开封面，然后…尖冒出来). With nothing in hand the reader chooses a place:
// the camera turns to it, its shield lifts in the click, and its ticket
// inks in at its seat beside the shield (riding with it: nothing was in
// hand to hold still) while its print develops into the strip; as the
// camera settles the cover opens out of it, and then the tip comes out and
// the tab and the cue come in. No fold, no flap: there was nothing to turn
// from. Letting a ticket go runs the fold backwards as it fades.
export const ARRIVAL = {
  /** The ticket never inks in sooner than this after the click (the
   *  shield's lift reads first)… */
  minDelayMs: 260,
  /** …and under this many screen px of travel the camera has nowhere to go. */
  stillPx: 24,
  /** The ticket's ink comes up from nothing over this (no hard first edge). */
  inkMs: 160,
  /** The ticket is printed (its strip developed) this long before it opens. */
  printMs: 360,
} as const;

/** When the arriving ticket inks in, opens and puts its tip out, ms after
 *  the click, for a camera that lands `landMs` after it (its tip to the
 *  oblique included) with `travelPx` of screen to cover: open by the
 *  touchdown, at once past the floor when it has nowhere to go. */
export function arrivalSchedule(landMs: number, travelPx: number) {
  const floor = ARRIVAL.minDelayMs + ARRIVAL.printMs;
  const late = TICKET_EXPAND_MS + TICKET.tipGap;
  const expandAt = travelPx >= ARRIVAL.stillPx ? Math.round(Math.max(floor, landMs - late)) : floor;
  return { inkAt: expandAt - ARRIVAL.printMs, expandAt, tipAt: expandAt + late };
}

// ── When a cover shows ──
// The atlas's camera asks, on every draw, for the cover of the place in hand
// (src/lib/explorer.ts): `appear` once the camera is down at it (so a cover
// is never seen sliding into its seat — the owner's rule: covers appear
// directly), `stay` while the place is in hand and the reader is still down
// at it (they may drag and zoom the map; the cover rides with its shield).
// A switch asks at take-off (`switch`: the cover in hand turns into the next
// place's, see "The switch"). The dock decides on every published frame,
// from what is shown and that ask.

export interface DockAsk {
  id: string;
  appear: boolean;
  stay: boolean;
}

/** The place whose cover shows, from the one shown and the camera's ask: a
 *  cover shown stays while the camera asks it to; none shown, the asked one
 *  appears once it may (and its place has a point this frame). */
export function dockShown(shown: string | null, ask: DockAsk | null, placed: (id: string) => boolean = () => true): string | null {
  let at = shown;
  if (at && (!ask || ask.id !== at || !ask.stay)) at = null;
  if (!at && ask?.appear && placed(ask.id)) at = ask.id;
  return at;
}

/** Where the covers are pinned `t` ms into a glide from `from` to `to` over
 *  `ms` on `ease` (the camera brought back onto the place in hand: its own
 *  turn), px. */
export function glideAt(from: Point, to: Point, t: number, ms: number, ease: (k: number) => number): Point {
  const k = ms > 0 ? ease(clamp(t / ms, 0, 1)) : 1;
  return { x: Math.round(from.x + (to.x - from.x) * k), y: Math.round(from.y + (to.y - from.y) * k) };
}

// ── The channel ──
// The atlas is a lazy chunk and the chapters are in the page bundle, so the
// two meet here: the atlas sets the plan once per layout and publishes, on
// every camera frame it draws, where each place stands and which place's
// cover shows (null with nothing in hand, zoomed far out, or in the air on
// the way down from the open map). A chapter subscribes and writes its own
// cover. The last of each is kept, so a chapter that mounts late is placed
// at once.

export interface DockSwitch {
  /** A new switch, a new key; a new timing of the same switch (the reader
   *  took the map mid-turn, the same place asked again), a new rev. */
  key: number;
  rev: number;
  /** The place whose ticket carries the switch (the one leaving; itself,
   *  when the reader turns back to it before the relay). */
  from: string;
  to: string;
  /** How the carrier comes to be a ticket: it folds from whole ('fold'), is
   *  one already in transit ('lay': the arriving ticket lays its dark
   *  ground in over it first), folds back from opening ('back'), or turns
   *  back into itself ('self'). */
  mode: 'fold' | 'lay' | 'back' | 'self';
  /** performance.now() ms: the click, the relay, the carrier's cut, the
   *  opening, its end, the tip, the end of the extras. */
  t0: number;
  relayAt: number;
  cutAt: number;
  expandAt: number;
  expandEnd: number;
  tipAt: number;
  end: number;
  /** The carrier's name lines (the arriving sign's rule starts at them). */
  fromLines?: number;
  /** The leaving cover's ratio (the phone's cards: the arriving one is laid
   *  on it at the leaving one's scale). */
  fromRatio?: number;
}

export interface DockFrame {
  /** The place whose cover shows (in hand, the camera down at it or turning
   *  to it), else null. */
  at: string | null;
  /** Every place's foot this frame, viewport px. */
  points: Readonly<Record<string, Point>>;
  /** A switch under way (until its extras are in). */
  switch?: DockSwitch | null;
  /** Where the cover shown is pinned this frame (a glide back to the dock's
   *  point, or back onto the shield once the camera is down), instead of
   *  its place's foot. */
  pin?: Point | null;
  /** Through a switch, each cover's own pin (its foot), so both tickets lie
   *  on one point whatever their corners. */
  pins?: Readonly<Record<string, Point>> | null;
  /** A ticket arriving from the open map (see "The arrival"). */
  arrive?: DockArrive | null;
}

export interface DockArrive {
  /** A new arrival, a new key. */
  key: number;
  id: string;
  /** performance.now() ms: the ticket inks in, opens, puts its tip out. */
  inkAt: number;
  expandAt: number;
  tipAt: number;
}

type Listener<T> = (value: T) => void;

function createDockChannel() {
  let plan: Readonly<Record<string, DockEntry>> | null = null;
  let frame: DockFrame = { at: null, points: {} };
  const planListeners = new Set<() => void>();
  const frameListeners = new Set<Listener<DockFrame>>();
  let settle: (() => void) | null = null;
  return {
    plan: () => plan,
    setPlan(next: Readonly<Record<string, DockEntry>> | null) {
      plan = next;
      planListeners.forEach((listener) => listener());
    },
    subscribePlan(listener: () => void) {
      planListeners.add(listener);
      return () => { planListeners.delete(listener); };
    },
    frame: () => frame,
    publish(next: DockFrame) {
      frame = next;
      frameListeners.forEach((listener) => listener(next));
    },
    subscribe(listener: Listener<DockFrame>) {
      frameListeners.add(listener);
      listener(frame);
      return () => { frameListeners.delete(listener); };
    },
    /** Ends a switch at once (the arriving ticket is being torn: the one
     *  under it must not show through). The atlas sets the handler. */
    settle: () => settle?.(),
    onSettle(handler: (() => void) | null) {
      settle = handler;
    },
  };
}

export const coverDock = createDockChannel();


/** The docked cover of a chapter section (it lives on the atlas, not in its
 *  section): `[data-cover-for="<section id>"]`. */
export function coverOf(chapter: Element | null | undefined): HTMLElement | null {
  if (!chapter || typeof document === 'undefined' || !chapter.id) return null;
  return document.querySelector<HTMLElement>(`[data-cover-for="${CSS.escape(chapter.id)}"]`);
}
