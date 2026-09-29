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
// One dock for every place (owner, later the same day: switching must be free
// and like the reference's, whose board stays put while the planet turns
// under it). The corner used to turn per chapter, so the cover jumped round
// its shield on every move. Now every place stands on ONE point of the screen
// with its cover at ONE corner of its shield — DOCK_QUADRANT, below-left:
// the plate's top-right corner is the corner next to the shield, and that is
// the stub's top-right, so the stub (the sign, whose name turns in place) is
// the part of the ticket that never moves, whatever the photograph's shape.
// On a switch the camera turns the next place in under that corner and the
// ticket becomes the next place's where it lies ("The switch", below).
//
// Everything here is DERIVED from the viewport and the archive's own data —
// the cover's ratio (from its file name), whether it carries its region's
// tab, the places' coordinates and each chapter's rest zoom — never read off
// the page. scripts/cover-dock.test.mjs holds the maths.

import { EASE, bezierFn } from './motion.ts';

export type Quadrant = 'tr' | 'tl' | 'br' | 'bl';

/** Every corner a plate can take about its shield (the geometry is the same
 *  for each; global.css draws a caret for each). */
export const QUADRANTS: readonly Quadrant[] = ['tr', 'bl', 'tl', 'br'];

/** The one corner the cover takes, for every place: below-left of the
 *  shield. Its anchor — the plate's corner next to the shield — is the
 *  stub's top-right, so the sign is still through a switch; below-right or
 *  above-right would carry the stub sideways with the photograph's width,
 *  above-left would move the sign up and down with its height. */
export const DOCK_QUADRANT: Quadrant = 'bl';

export const DOCK = {
  /** The stub's fixed measure (ArchiveChapter TICKET_STUB). */
  stub: 190,
  /** The joint: the gap, each way, between the shield's corner and the
   *  cover's. No line crosses it (the owner has twice struck lines off the
   *  signs: 不需要下面的引线, 不需要白色竖干); the plate's own corner points
   *  at the shield with a caret, as the reference's board does over its
   *  stop (global.css `.archive-plate__caret`). */
  gap: 8,
  /** The region's tab on the cover's top edge. */
  tab: 26,
  /** What hangs under the plate: "Open story" (30px down) and the pad. */
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

/** The plate with what it carries: the region's tab above, the cue and the
 *  pad below. */
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
  /** The place, [longitude, latitude], and its chapter's rest zoom. */
  coordinates: readonly [number, number];
  zoom: number;
  ratio: number;
  /** The first place of a region of two or more: its tab rides on the cover. */
  tab: boolean;
  /** The current shield's box (the camera's place, at its current scale). */
  shield: Size;
  /** Every other place's shield, as drawn when not current. */
  neighbours: ReadonlyArray<{ coordinates: readonly [number, number] } & Size>;
  /** The ticket's card stock (src/lib/ticketStock.ts): a switch eases the
   *  ticket from the stock it leaves to this one. */
  stock?: string;
}

export interface DockEntry {
  quadrant: Quadrant;
  /** Where the camera sets this place (its shield's foot), viewport px: the
   *  same point for every place (the single dock). */
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

/** The single dock's point: where every place stands on the screen, so that
 *  every pair — its shield and its cover (at DOCK_QUADRANT, with what it
 *  carries) — fits the stage. The union of all the pairs, their feet on one
 *  point, centred on the stage and kept inside it; `overflow` is what still
 *  could not fit (px, both axes: 0 by construction, since `coverSize` keeps
 *  each cover inside the stage beside a shield at any corner). */
export function dockPoint(stage: Box, pairs: ReadonlyArray<{ shield: Size; size: Size; tab: boolean }>, quadrant: Quadrant = DOCK_QUADRANT) {
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

/**
 * The plan: for each chapter, where the camera sets its place — the single
 * dock's point, the same for every place — and the centre that does it, and
 * its cover's size (its photograph's own ratio, as large as the stage lets
 * it be) at the single corner. `covered` says how much of the other places'
 * shields the cover hides at that place's rest (scripts/cover-dock.test.mjs
 * holds it at 0 for the archive). Pure: the same viewport and archive
 * always plan the same way.
 */
export function planDock(chapters: readonly DockChapter[], vw: number, vh: number, camera: DockCamera, quadrant: Quadrant = DOCK_QUADRANT): Record<string, DockEntry> {
  const stage = stageBox(vw, vh);
  const sizes = chapters.map((chapter) => coverSize(chapter.ratio, stage));
  const { point, overflow } = dockPoint(stage, chapters.map((chapter, index) => ({ shield: chapter.shield, size: sizes[index], tab: chapter.tab })), quadrant);
  const plan: Record<string, DockEntry> = {};
  chapters.forEach((chapter, index) => {
    const size = sizes[index];
    const centre = centreFor(chapter.coordinates, point, chapter.zoom, camera);
    const fit = grow(fitBox(plateRect(point, chapter.shield, size, quadrant), chapter.tab), 10);
    const covered = visibleNeighbours(chapter, centre, camera, vw, vh).reduce((sum, box) => sum + area(fit, box), 0);
    const rel = plateRect({ x: 0, y: 0 }, chapter.shield, size, quadrant);
    plan[chapter.id] = {
      quadrant,
      point,
      centre,
      offset: { x: Math.round(rel.left), y: Math.round(rel.top) },
      photoW: size.photoW,
      photoH: size.photoH,
      tab: chapter.tab,
      ...(chapter.stock ? { stock: chapter.stock } : null),
      covered: Math.round(covered),
      overflow,
    };
  });
  return plan;
}

/** Where a docked cover's stub rests on the screen (viewport px) once its
 *  place is down on the dock: right of the photograph, the photograph's
 *  height, square on the screen. DERIVED from the plan (the entrance flies
 *  the torn pass's stub onto it: src/lib/explorer.ts, "The stub hand-off"). */
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
// A move between places is one turn of the planet under the ticket, which
// stays where it lies (the reference's board does not move; ours becomes
// the next place's ticket in place). At take-off the arriving place's cover
// is laid over the one leaving, both pinned at the dock's point, and the
// house's own motions carry the change:
//  - the paper: the card eases from the stock it leaves to its own
//    (SWITCH_COVER.paperMs on the travel curve);
//  - the shape: both plates are clipped to one outline that runs from the
//    leaving plate's box to the arriving one's, anchored at the corner by
//    the shield (the stub's top-right, which never moves) — `switchClip`;
//    where the arriving photograph reaches past the leaving one, a mat of
//    the card's dark ground lies under it until it develops (`matPolygon`);
//  - the photograph: the arriving print develops in over the one leaving,
//    from the corner by the stub outward (the house's develop mask, its
//    sweep mirrored: `developSweep`);
//  - the sign: its state, number and name turn like a departure board from
//    the place left (src/lib/routeShield.ts, FLAP), at once;
//  - the shields: the one left relaxes, the one arriving lifts (global.css).
// Then the leaving cover goes (it is under the new one) and the tab, the
// cue and the pad come in on the new outline. Nothing is placed per frame:
// both covers are written at the dock's point (or glide to it with the
// camera, when the reader had dragged the ticket away).
export const SWITCH_COVER = {
  /** The outline's change and the paper's. */
  shapeMs: 720,
  paperMs: 720,
  /** The print's develop, and how long after take-off it starts. */
  developMs: 900,
  developDelay: 60,
  /** The leaving cover stays under the arriving one until then. */
  leaveMs: 1000,
  /** The tab, the cue and the pad come in once the outline is set. */
  extrasMs: 400,
} as const;

/** The outline a plate of size `own` is clipped to so that only `show` of
 *  it (anchored at its top-right) is seen: CSS inset() lengths (top right
 *  bottom left), px, with `pad` past the anchor's edges so the caret and
 *  the joint keep their overhang. */
export function switchClip(own: Size, show: Size, pad = 12) {
  const bottom = Math.max(0, own.h - show.h);
  const left = Math.max(0, own.w - show.w);
  return `inset(${-pad}px ${-pad}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px)`;
}

/** The mat under an arriving photograph of size `own` (anchored at its
 *  top-right, as the one leaving is): the part the leaving photograph
 *  `under` does not cover, as a CSS polygon, or null when it covers it all.
 *  Until the arriving print has developed there, the mat is what shows. */
export function matPolygon(own: Size, under: Size): string | null {
  const ax = Math.max(0, own.w - under.w);
  const ay = Math.min(own.h, under.h);
  if (ax <= 0.5 && ay >= own.h - 0.5) return null;
  const f = (n: number) => `${Math.round(n * 10) / 10}px`;
  return `polygon(0 0, ${f(ax)} 0, ${f(ax)} ${f(ay)}, ${f(own.w)} ${f(ay)}, ${f(own.w)} ${f(own.h)}, 0 ${f(own.h)})`;
}

/** The develop's mask positions for a print of `ratio` (the house mask,
 *  115° at 400%, global.css `.travel-ticket__photo img`, turned about the
 *  vertical so it runs from the corner by the stub): from the first moment
 *  its nearest corner is half printed to the moment its far corner is. */
export function developSweep(ratio: number) {
  const r = Math.max(0.45, Math.min(2.4, ratio || 1.5));
  return { from: 36 - 7.46 / r, to: 80 + 9.34 / r } as const;
}
// The band between the two prints: narrow, so the develop reads as a sweep
// (at 40–60% both photographs lay over each other for ~300 ms: review of
// 2026-09-29). The sweep's positions hold: the band's middle is where it was.
export const DEVELOP_MASK = 'linear-gradient(245deg, #000 45%, transparent 55%)';

// ── The arrival: a ticket from the open map ──
// Owner, 2026-09-29: 当地球页空置的时候，点开一个地点的动效和封面出现动效很差.
// With nothing in hand the reader chooses a place: the camera turns to it on
// the switch's own move (explorerCamera.ts planSwitch), its shield lifts in
// the click, and the ticket used to appear whole in one frame at the
// landing, the rail's words a beat later. Now it ARRIVES as the planet
// settles, from its shield: the ticket rides in with its shield (not pinned:
// nothing was in hand to hold still) and, `delay` ms after the click —
// ARRIVAL.leadMs before the camera touches down, when the turn has done ~90%
// of its way — its stub unrolls down from the corner by the shield (the
// caret first), the face opens across from the stub outward, the print
// develops in behind it from the stub's edge (the switch's develop), and the
// tab, the cue and the pad come in once the outline is set. The rail's name
// and lede come in with it (HomePage). Letting a ticket go folds it back
// into the same corner as it fades (`foldClip`): the arrival run backwards.
export const ARRIVAL = {
  /** The ticket starts this long before the camera touches down… */
  leadMs: 520,
  /** …never sooner than this after the click (the shield's lift reads
   *  first), and at once past it when the camera has nowhere to go. */
  minDelayMs: 260,
  /** Under this many screen px of travel the camera has nowhere to go. */
  stillPx: 24,
  /** The dock's ink comes up from nothing over this (no hard first edge). */
  inkMs: 160,
  /** The stub unrolls from the corner by the shield. */
  unrollMs: 460,
  /** The face opens across from the stub, starting this far in. */
  openDelay: 180,
  openMs: 640,
  /** The print develops (the switch's develop), starting this far in. */
  developDelay: 220,
  developMs: 900,
  /** The tab, the cue and the pad come in (the outline set). */
  extrasAt: 820,
  /** The fold back into the corner on letting go (the dock's fade). */
  foldMs: 400,
} as const;

/** When the arriving ticket starts, ms after the click: ARRIVAL.leadMs before
 *  a camera that lands `landMs` after it, once it has `travelPx` of screen to
 *  cover; at ARRIVAL.minDelayMs when it has (all but) nowhere to go. */
export function arrivalDelay(landMs: number, travelPx: number) {
  if (!(travelPx >= ARRIVAL.stillPx)) return ARRIVAL.minDelayMs;
  return Math.round(Math.max(ARRIVAL.minDelayMs, landMs - ARRIVAL.leadMs));
}

const arriveCurve = bezierFn(EASE.arrive);
const planeCurve = bezierFn(EASE.plane);

/** The arriving plate's outline over the arrival (0 → ARRIVAL.openDelay +
 *  openMs), as clip-path keyframes (WAAPI, linear between them): the stub's
 *  height on the arrive curve, then the face's width on the plane curve,
 *  both anchored at the stub's top-right (switchClip). `own` is the plate
 *  (photograph + stub). */
export function arrivalClipFrames(own: Size, stub: number = DOCK.stub, steps = 20) {
  const total = ARRIVAL.openDelay + ARRIVAL.openMs;
  const across = Math.min(own.w, stub);
  const frames: Array<{ offset: number; clipPath: string }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (total * i) / steps;
    const down = arriveCurve(clamp(t / ARRIVAL.unrollMs, 0, 1));
    const open = planeCurve(clamp((t - ARRIVAL.openDelay) / ARRIVAL.openMs, 0, 1));
    const show = { w: across + (own.w - across) * open, h: own.h * down };
    frames.push({ offset: i / steps, clipPath: switchClip(own, show) });
  }
  return { frames, ms: total };
}

/** Where a ticket let go folds to as it fades: back to its stub, a third of
 *  its height, at the corner by the shield. */
export function foldClip(own: Size, stub: number = DOCK.stub) {
  return switchClip(own, { w: Math.min(own.w, stub), h: own.h / 3 });
}

// ── When a cover shows ──
// The atlas's camera asks, on every draw, for the cover of the place in hand
// (src/lib/explorer.ts): `appear` once the camera is down at it (so a cover
// is never seen sliding into its seat — the owner's rule: covers appear
// directly), `stay` while the place is in hand and the reader is still down
// at it (they may drag and zoom the map; the cover rides with its shield).
// A switch asks at take-off (`switch`: the cover in hand turns into the next
// place's where it lies, see "The switch"). The dock decides on every
// published frame, from what is shown and that ask.

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
 *  `ms` on `ease` (a switch's: the camera's own turn), px. */
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
  /** A new switch, a new key. */
  key: number;
  /** The place whose cover is leaving (under the arriving one). */
  from: string;
  to: string;
}

export interface DockFrame {
  /** The place whose cover shows (in hand, the camera down at it or turning
   *  to it), else null. */
  at: string | null;
  /** Every place's foot this frame, viewport px. */
  points: Readonly<Record<string, Point>>;
  /** A switch under way (until the leaving cover has gone). */
  switch?: DockSwitch | null;
  /** Where the covers are pinned this frame (the dock's point, or a glide
   *  to it, or back onto the shield once the camera is down), instead of
   *  their place's foot. */
  pin?: Point | null;  /** A ticket arriving from the open map (see "The arrival"). */
  arrive?: DockArrive | null;
}

export interface DockArrive {
  /** A new arrival, a new key. */
  key: number;
  id: string;
  /** When the ticket starts (performance.now() ms). */
  at: number;
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
