// ── The cover rides with its shield ──
// Owner, 2026-09-28: 我希望封面可以跟随路牌一起走，出现在路牌的右上角或者左上角
// 或者右下角或者左下角 — the chapter's cover (the photograph and its ticket stub)
// is attached to the current place's route shield on the map, the way the
// reference's name board sits right over its stop's pin, at one of four
// corners of the shield. Every camera frame the atlas projects the places
// (the same projection the shields stand on) and hands the points over
// (`coverDock.publish`); the chapter writes its cover there. The camera sets
// each place where its cover fits (`centreFor`).
//
// Everything here is DERIVED from the viewport and the archive's own data —
// the cover's ratio (from its file name), whether it carries its region's
// tab, the places' coordinates and each chapter's rest zoom — never read off
// the page. scripts/cover-dock.test.mjs holds the maths.

export type Quadrant = 'tr' | 'tl' | 'br' | 'bl';

/** The order the corners are offered in, turned one step per chapter, so a
 *  run of stops goes round the shield rather than sitting on one side. */
export const QUADRANT_ORDER: readonly Quadrant[] = ['tr', 'bl', 'tl', 'br'];

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
}

export interface DockEntry {
  quadrant: Quadrant;
  /** Where the camera sets this place (its shield's foot), viewport px. */
  point: Point;
  /** The camera's centre that puts it there (`centreFor`). */
  centre: [number, number];
  /** The plate's top-left corner from the shield's foot, px: the cover is
   *  written at the foot's point every frame and sits here from it. */
  offset: Point;
  photoW: number;
  photoH: number;
  tab: boolean;
  /** How much of its neighbours' shields the cover would hide (px²) and how
   *  far past the stage it would reach (px): 0 and 0 when it sits clear. */
  covered: number;
  overflow: number;
}

/** Where a place and its cover stand on the stage for one corner: the pair
 *  (shield and cover with what it carries) centred on the stage, then kept
 *  inside it. `overflow` is what still could not fit (px, both axes). */
export function placeAt(stage: Box, shield: Size, size: Size, quadrant: Quadrant, tab: boolean) {
  const origin = { x: 0, y: 0 };
  const plate = fitBox(plateRect(origin, shield, size, quadrant), tab);
  const group: Box = {
    left: Math.min(plate.left, -shield.w / 2),
    top: Math.min(plate.top, -shield.h),
    right: Math.max(plate.right, shield.w / 2),
    bottom: Math.max(plate.bottom, 0),
  };
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

/**
 * The plan: for each chapter in route order, the corner its cover takes,
 * where the camera sets its place (and the centre that does it) and the
 * cover's size. A corner is chosen among the four by, in order of weight:
 * the cover fitting the stage; the cover keeping off its neighbours'
 * shields; a corner other than the last stop's; and the turn of
 * QUADRANT_ORDER for this chapter (so the run goes round). Pure: the same
 * viewport and archive always plan the same way.
 */
export function planDock(chapters: readonly DockChapter[], vw: number, vh: number, camera: DockCamera): Record<string, DockEntry> {
  const stage = stageBox(vw, vh);
  const plan: Record<string, DockEntry> = {};
  let previous: Quadrant | null = null;
  chapters.forEach((chapter, index) => {
    const size = coverSize(chapter.ratio, stage);
    let best: (DockEntry & { score: number }) | null = null;
    for (let rank = 0; rank < QUADRANT_ORDER.length; rank += 1) {
      const quadrant = QUADRANT_ORDER[(index + rank) % QUADRANT_ORDER.length];
      const { point, overflow } = placeAt(stage, chapter.shield, size, quadrant, chapter.tab);
      const centre = centreFor(chapter.coordinates, point, chapter.zoom, camera);
      const fit = grow(fitBox(plateRect(point, chapter.shield, size, quadrant), chapter.tab), 10);
      const covered = visibleNeighbours(chapter, centre, camera, vw, vh).reduce((sum, box) => sum + area(fit, box), 0);
      const score = overflow * 1e5 + covered * 4 + (quadrant === previous ? 6000 : 0) + rank * 400;
      if (!best || score < best.score) {
        const rel = plateRect({ x: 0, y: 0 }, chapter.shield, size, quadrant);
        best = {
          quadrant,
          point,
          centre,
          offset: { x: Math.round(rel.left), y: Math.round(rel.top) },
          photoW: size.photoW,
          photoH: size.photoH,
          tab: chapter.tab,
          covered: Math.round(covered),
          overflow,
          score,
        };
      }
    }
    if (!best) return;
    const { score: _score, ...entry } = best;
    plan[chapter.id] = entry;
    previous = entry.quadrant;
  });
  return plan;
}

// ── When a cover shows ──
// The atlas's camera asks, on every draw, for the cover of the place it is
// down on: `appear` once its pose has settled (so a cover is never seen
// sliding into its seat — the owner's rule: covers appear directly), `stay`
// while it is still on that place. The dock decides on every published
// frame, from what is shown and that ask.

export interface DockAsk {
  id: string;
  appear: boolean;
  stay: boolean;
}

export const DOCK_GATE = {
  /** A cover appears once the pose is this close (screen px) to the one it
   *  rests in. Appearing at the lock, covers slid 29–52px into their seat
   *  as the camera settled; one appeared off the top of the screen and slid
   *  700px (back into Miami). */
  settledPx: 3,
  /** How far from the focal point a docked place may stand, for what a
   *  zoom still to come moves it: r · |2^dz − 1| px. */
  reachPx: 600,
  /** The first chapter rests inside the entrance's last stretch on a tall
   *  window: 50px of scroll up from its reading line took its cover away
   *  while the camera had moved 2px, and a reader who came back from
   *  Orlando and stopped 83px short of Miami's line had no cover at all.
   *  Down to `entryAppear` of the entrance's camera (1728×1000: 240px of
   *  scroll, the place 40px off its seat) its cover appears once the scroll
   *  has left the camera alone for `entryStillMs`; shown, it stays down to
   *  `entryHold`, riding the scrub. */
  entryHold: 0.8,
  entryAppear: 0.85,
  entryStillMs: 140,
} as const;

/** How far the drawn pose still is from the one it rests in, in screen px
 *  (roughly): the centre's gap at the drawn zoom, and what the zoom still
 *  to come moves a place standing `reachPx` from the focal point. */
export function poseRemainPx(centreGapPx: number, zoomToGo: number): number {
  return centreGapPx + DOCK_GATE.reachPx * Math.abs(2 ** zoomToGo - 1);
}

/** The camera's ask for the place it is down on (`id`), from how far the
 *  entrance's camera has come down (1 in the archive), whether the scroll
 *  that drives it has held still (`entryStill`; the entrance's camera is
 *  the scroll's own) and how far the hop's pose still has to settle; null
 *  in the air. */
export function askDock(id: string | null, landed: boolean, entry: number, entryStill: boolean, remainPx: number): DockAsk | null {
  if (!id || !landed) return null;
  return {
    id,
    appear: entry >= DOCK_GATE.entryAppear && (entryStill || entry >= 1) && remainPx <= DOCK_GATE.settledPx,
    stay: entry >= DOCK_GATE.entryHold,
  };
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

// ── The resting camera's lean ──
// Before a commit the atlas's camera leans toward where the scroll is
// heading (its pre-roll), up to the whole lean at the commit lines. It used
// to lean from the place's own reading line: a wheel that stopped short of
// Orlando's (at 0.59 of the way from Miami) set Orlando's camera leaning
// back toward Miami — 26px, 0.85 s after it had landed and its cover had
// appeared. It leans now only past the stretch between where the reader was
// when the camera came down (`from`) and the reading line: a landed camera
// holds until the hand moves on. Crossing the reading line ends the
// stretch (the lean is nothing there either way, so nothing jumps).

export interface Lean {
  /** The stretch's far end, as it now stands (the place, once crossed). */
  from: number;
  /** The neighbour leaned toward (the place itself: no lean) … */
  neighbour: number;
  /** … and how far, 0–1 (eased). */
  amount: number;
}

const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** The lean at route `position` for the camera on route place `place`
 *  (0…`last`), which came down with the reader at `from`; `forward` and
 *  `back` are the commit lines (a share of a leg on and back). */
export function restLean(position: number, place: number, from: number, last: number, forward: number, back: number): Lean {
  let start = Math.min(place + forward, Math.max(place - back, from));
  if ((start < place && position >= place) || (start > place && position <= place)) start = place;
  const low = Math.min(start, place);
  const high = Math.max(start, place);
  const lean = position > high ? position - high : position < low ? position - low : 0;
  const neighbour = lean > 0 ? Math.min(last, place + 1) : lean < 0 ? Math.max(0, place - 1) : place;
  const amount = neighbour === place
    ? 0
    : smooth(Math.max(0, Math.min(1, lean > 0
      ? lean / Math.max(1e-3, place + forward - high)
      : -lean / Math.max(1e-3, low - (place - back)))));
  return { from: start, neighbour, amount };
}

// ── The channel ──
// The atlas is a lazy chunk and the chapters are in the page bundle, so the
// two meet here: the atlas sets the plan once per layout and publishes, on
// every camera frame it draws, where each place stands and which place the
// camera is ON (its cover shows; null in the air and outside the archive).
// A chapter subscribes and writes its own cover. The last of each is kept,
// so a chapter that mounts late is placed at once.

export interface DockFrame {
  /** The place the camera has landed on (its cover shows), else null. */
  at: string | null;
  /** Every place's foot this frame, viewport px. */
  points: Readonly<Record<string, Point>>;
}

type Listener<T> = (value: T) => void;

function createDockChannel() {
  let plan: Readonly<Record<string, DockEntry>> | null = null;
  let frame: DockFrame = { at: null, points: {} };
  const planListeners = new Set<() => void>();
  const frameListeners = new Set<Listener<DockFrame>>();
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
  };
}

export const coverDock = createDockChannel();

/** The docked cover of a chapter section (it lives on the atlas, not in its
 *  section): `[data-cover-for="<section id>"]`. */
export function coverOf(chapter: Element | null | undefined): HTMLElement | null {
  if (!chapter || typeof document === 'undefined' || !chapter.id) return null;
  return document.querySelector<HTMLElement>(`[data-cover-for="${CSS.escape(chapter.id)}"]`);
}
