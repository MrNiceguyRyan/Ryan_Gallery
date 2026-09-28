// Run offline: node --experimental-strip-types --test scripts/bridge-roll.test.mjs
//
// The bridge between the homepage's opening and chapter 1 (src/lib/
// bridgeRoll.ts): a roll of his own frames that travels in on the wheel,
// lights each place on the globe as its select passes the gate (once the
// place faces the reader), comes to rest with chapter 1's select on its
// plate's left edge, and lands that frame in the plate moving exactly as the
// page does. The prologue globe's westward turn (src/lib/globeLook.ts) is
// held here too, since the lighting depends on it.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROLL,
  arcDegrees,
  bandRecede,
  gateCrossings,
  gatePassed,
  landingPose,
  litWhenSeen,
  onFace,
  prologueMark,
  rollCuts,
  rollFrames,
  rollTravel,
  rollX,
  rollXStill,
  routeTail,
  statementState,
} from '../src/lib/bridgeRoll.ts';
import { PROLOGUE_TURN, prologueNaturalLongitude } from '../src/lib/globeLook.ts';

// The issue as Sanity served it on 2026-09-27: chapter number, the frames in
// the roll (their numbers, ratios, which is the select) and the place.
const CHAPTERS = [
  { order: 1, frames: [[10, 1.5], [11, 1.5, true], [12, 1.5]], place: [-80.1918, 25.7617] },
  { order: 2, frames: [[15, 0.6667], [16, 0.6667, true], [17, 1.5]], place: [-81.3792, 28.5383] },
  { order: 3, frames: [[9, 0.6667], [10, 0.6667, true], [11, 1.5]], place: [-111.4558, 36.9147] },
  { order: 4, frames: [[4, 0.6667], [5, 1.5, true], [6, 1.5]], place: [-113.0263, 37.2982] },
  { order: 5, frames: [[4, 1.5], [5, 1.5, true]], place: [-112.1871, 37.593] },
  { order: 6, frames: [[1, 1.5, true], [2, 1.5]], place: [-73.9856, 40.7532] },
].map((chapter) => ({
  ...chapter,
  frames: chapter.frames.map(([n, ratio, select]) => ({ n, ratio, select: !!select })),
}));
// Where chapter 1's plate stands at the two viewports the bridge was
// measured at (document px: left, top, width, height) and its anchor.
const VIEWPORTS = [
  { W: 1728, H: 1000, plate: { l: 745, t: 3694, w: 730, h: 487 }, anchor: 3457 },
  { W: 1280, H: 800, plate: { l: 552, t: 3052, w: 541, h: 361 }, anchor: 2827 },
];
const setup = ({ W, H, plate }) => {
  const layout = rollCuts(CHAPTERS, Math.round(ROLL.frameH * H));
  const X0 = W + ROLL.enter;
  const X1 = plate.l - layout.select.left;
  return { layout, X0, X1, gateX: ROLL.gate * W };
};

test('the roll winds back from the last chapter to the first, each frame at its own ratio', () => {
  const layout = rollCuts(CHAPTERS, 240);
  assert.deepEqual(layout.cuts.map((cut) => cut.order), [6, 5, 4, 3, 2, 1]);
  for (const cut of layout.cuts) {
    const chapter = CHAPTERS.find((entry) => entry.order === cut.order);
    cut.frames.forEach((frame, index) => {
      assert.equal(frame.n, chapter.frames[index].n, 'each cut keeps its own frame order');
      assert.equal(frame.width, Math.round(240 * chapter.frames[index].ratio));
    });
  }
  // No squares: a 3:2 frame is 360 wide, a 2:3 one 160.
  assert.equal(layout.cuts[0].frames[0].width, 360);
  assert.equal(layout.cuts.at(-2).frames[0].width, 160);
  // The select that lands is chapter 1's.
  const last = layout.cuts.at(-1);
  assert.equal(layout.select.left, last.frames[1].left);
  assert.equal(layout.select.width, last.frames[1].width);
});

test('the selects cross the gate in roll order, and the roll comes to rest on the plate', () => {
  for (const viewport of VIEWPORTS) {
    const { layout, X0, X1, gateX } = setup(viewport);
    // At rest chapter 1's select stands on its plate's left edge.
    assert.equal(rollX(1, X0, X1) + layout.select.left, viewport.plate.l);
    // Off the right edge before the roll enters.
    assert.equal(rollX(0, X0, X1), viewport.W + ROLL.enter);
    assert.equal(rollX(ROLL.travel[0], X0, X1), X0);
    const crossings = gateCrossings(layout.covers, X0, X1, gateX);
    assert.equal(crossings.length, 6);
    for (let index = 1; index < crossings.length; index += 1) {
      assert.ok(crossings[index] > crossings[index - 1], `crossing ${index} after ${index - 1}`);
    }
    assert.ok(crossings.every((q) => q > ROLL.travel[0] && q < 1), `${crossings}`);
    // Each crossing is where that select's centre reaches the gate.
    crossings.forEach((q, index) => {
      assert.ok(Math.abs(rollX(q, X0, X1) + layout.covers[index] - gateX) < 0.01);
    });
    // gatePassed agrees with them, and its fraction runs 0 → 1 between two.
    assert.equal(gatePassed(crossings[2] - 1e-6, crossings).passed, 2);
    assert.equal(gatePassed(crossings[2], crossings).passed, 3);
    const mid = gatePassed((crossings[2] + crossings[3]) / 2, crossings);
    assert.ok(Math.abs(mid.fraction - 0.5) < 1e-9);
  }
});

test('the travel only ever goes one way, evenly at first, and arrives with no speed', () => {
  let previous = -Infinity;
  for (let step = 0; step <= 1000; step += 1) {
    const t = rollTravel(step / 1000);
    assert.ok(t >= previous);
    previous = t;
  }
  assert.equal(rollTravel(1), 1);
  const h = 1e-5;
  const slope = (q) => (rollTravel(q + h) - rollTravel(q - h)) / (2 * h);
  // Even speed through the cruise, continuous where it starts to slow.
  const cruise = ROLL.travel[0] + ROLL.cruise * (ROLL.travel[1] - ROLL.travel[0]);
  assert.ok(Math.abs(slope(0.3) - slope(0.5)) < 1e-6);
  assert.ok(Math.abs(slope(cruise - 1e-3) - slope(cruise + 1e-3)) < 0.01);
  assert.ok(slope(1 - 2 * h) < 0.01);
});

test('the landing arrives moving 1:1 with the plate, rising all the way', () => {
  for (const viewport of VIEWPORTS) {
    const { layout } = setup(viewport);
    const H = viewport.H;
    const frameH = layout.frameH;
    const from = { x: viewport.plate.l, y: ROLL.bandBottom * H - frameH, scale: layout.select.width / viewport.plate.w };
    const slot = { x: viewport.plate.l, y: viewport.plate.t - viewport.anchor };
    const span = viewport.anchor - 2.44 * H;
    const start = landingPose(0, from, slot, span);
    assert.deepEqual(start, from);
    const end = landingPose(1, from, slot, span);
    assert.ok(Math.abs(end.y - slot.y) < 1e-9 && end.scale === 1 && end.x === slot.x);
    // At the end its top moves span px per unit of the landing clock — the
    // plate's own speed — so the hand-over has no sticky release.
    const h = 1e-5;
    const speed = (landingPose(1, from, slot, span).y - landingPose(1 - h, from, slot, span).y) / h;
    assert.ok(Math.abs(-speed - span) / span < 1e-3, `${-speed} vs ${span}`);
    let previous = Infinity;
    for (let step = 0; step <= 200; step += 1) {
      const y = landingPose(step / 200, from, slot, span).y;
      assert.ok(y <= previous + 1e-9, 'the select only ever rises');
      previous = y;
    }
    // Its scale at rest is the select's own size: it starts as the frame.
    assert.ok(Math.abs(from.scale * viewport.plate.h - frameH) < 2);
  }
  // A wide window (2560×1440, span/drop ≈ 1.74): the drop is long for the
  // scroll that carries it, and the curve bends the other way (b < 0) rather
  // than arriving 1.15× faster than the plate.
  {
    const H = 1440;
    const from = { x: 1100, y: ROLL.bandBottom * H - Math.round(ROLL.frameH * H), scale: 0.4 };
    const slot = { x: 1100, y: 280 };
    const span = 1.74 * (from.y - slot.y);
    const h = 1e-5;
    const speed = (landingPose(1, from, slot, span).y - landingPose(1 - h, from, slot, span).y) / h;
    assert.ok(Math.abs(-speed - span) / span < 1e-3, `wide: ${-speed} vs ${span}`);
    let previous = Infinity;
    for (let step = 0; step <= 200; step += 1) {
      const y = landingPose(step / 200, from, slot, span).y;
      assert.ok(y <= previous + 1e-9, 'wide: the select only ever rises');
      previous = y;
    }
    assert.ok(Math.abs(landingPose(1, from, slot, span).y - slot.y) < 1e-9);
  }
  // The band steps back, then drops away: whole before, gone by the end.
  assert.deepEqual(bandRecede(0), { opacity: 1, dropY: 0 });
  assert.ok(Math.abs(bandRecede(ROLL.dimEnd).opacity - ROLL.dimTo) < 1e-9);
  assert.equal(bandRecede(ROLL.drop[1]).opacity, 0);
  assert.equal(bandRecede(1).dropY, ROLL.dropPx);
});

test('a place lights once its select has passed and it faces the reader, in roll order, never round the back', () => {
  const places = [...CHAPTERS].sort((a, b) => b.order - a.order).map((chapter) => chapter.place);
  // Facing Africa: New York is past the gate but 90°+ round the planet.
  assert.equal(litWhenSeen(1, [10, 20], places), 0);
  // Facing the Atlantic west of Africa: New York is on the face.
  assert.equal(litWhenSeen(1, [-20, 21], places), 1);
  // Bryce (next) has passed the gate but is still round the limb: nothing
  // after New York lights, even Zion, which is no nearer.
  assert.equal(litWhenSeen(3, [-20, 21], places), 1);
  // Facing North America: all that have passed.
  assert.equal(litWhenSeen(6, [-80.19, 21], places), 6);
  assert.equal(litWhenSeen(4, [-80.19, 21], places), 4);
  // Never beyond the threshold, whatever has passed.
  for (let lng = -180; lng <= 180; lng += 7) {
    const lit = litWhenSeen(6, [lng, 21], places);
    for (let index = 0; index < lit; index += 1) assert.ok(arcDegrees([lng, 21], places[index]) < ROLL.seenDeg);
  }
  // The route draws back from the last chapter to the last place lit, and
  // on toward the next while the roll carries its select to the gate.
  const progress = [1, 0.516, 0.504, 0.483, 0.049, 0];
  assert.equal(routeTail(0, 0, 0, progress), 1);
  assert.equal(routeTail(1, 1, 0, progress), 1);
  assert.ok(Math.abs(routeTail(1, 1, 0.5, progress) - 0.758) < 1e-9);
  assert.equal(routeTail(1, 3, 0.5, progress), 1, 'held on New York while Bryce is round the back');
  assert.equal(routeTail(6, 6, 0, progress), 0);
});

test('a pointer on the roll never leaves the planet without a mark', () => {
  // The places in roll order, as RouteAtlas lists them (06 New York first).
  const places = [...CHAPTERS].sort((a, b) => b.order - a.order)
    .map((chapter) => ({ id: `c${chapter.order}`, at: chapter.place }));
  const facing = (centre) => (place) => onFace(centre, place.at);
  const america = facing([-80.19, 21]);
  // 06, 05, 04, 03 lit (Page last); nothing pointed at: Page prints.
  assert.equal(prologueMark(null, places, 4, america), 'c3');
  // Pointing at 02 Orlando, which the roll has not lit yet (the recheck's
  // case at 1728, y1729): Orlando prints, where it used to print nothing.
  assert.equal(prologueMark('c2', places, 4, america), 'c2');
  // Pointing at a lit place prints it, as before.
  assert.equal(prologueMark('c5', places, 4, america), 'c5');
  // A place round the back of the planet would be hidden by its marker:
  // the lit mark stays (facing Africa, New York lit, Miami pointed at).
  assert.ok(arcDegrees([10, 20], places[5].at) >= ROLL.seenDeg);
  assert.equal(prologueMark('c1', places, 1, facing([10, 20])), 'c6');
  // Over the limb Mapbox's own horizon hides a marker that is still under
  // seenDeg (at 1728, y1250: Zion 69° out, hidden; Bryce, lit, 68.7°):
  // pointing at it keeps Bryce's mark.
  const centre = [-37.52, 15.28];
  assert.ok(onFace(centre, places[2].at) && onFace(centre, places[1].at));
  const mapboxHides = (id) => (place) => onFace(centre, place.at) && place.id !== id;
  assert.equal(prologueMark('c4', places, 2, mapboxHides('c4')), 'c5');
  // Before the camera has centred the planet there is no face to print on.
  assert.equal(onFace(null, places[0].at), false);
  assert.equal(prologueMark('c2', places, 4, facing(null)), 'c3');
  // Every place lit (99) and none pointed at: the last in the roll.
  assert.equal(prologueMark(null, places, 99, america), 'c1');
  // Reduced motion (no "last lit"): only a pointer prints.
  assert.equal(prologueMark(null, places, 99, america, false), null);
  assert.equal(prologueMark('c4', places, 99, america, false), 'c4');
  // Nothing lit and nothing pointed at: nothing, and an unknown id is no
  // pointer at all.
  assert.equal(prologueMark(null, places, 0, america), null);
  assert.equal(prologueMark('nowhere', places, 4, america), 'c3');
  // Whatever is lit and wherever the camera faces, a pointer on a place
  // that faces the reader always gets that place, and never takes the lit
  // mark away for one that does not.
  for (let lng = -180; lng <= 180; lng += 9) {
    for (let lit = 0; lit <= places.length; lit += 1) {
      for (const place of places) {
        const on = prologueMark(place.id, places, lit, facing([lng, 21]));
        if (arcDegrees([lng, 21], place.at) < ROLL.seenDeg) assert.equal(on, place.id);
        else assert.equal(on, lit > 0 ? places[lit - 1].id : null);
      }
    }
  }
});

test('the prologue turns west, one way, onto the first chapter; the first screen keeps its face', () => {
  const target = -80.1918;
  for (const drift of [0, 15, 30]) {
    let previous = Infinity;
    for (let step = 0; step <= 1000; step += 1) {
      const centre = prologueNaturalLongitude(target, step / 1000, drift);
      assert.ok(centre < previous, `drift ${drift}: ${centre} at ${step / 1000}`);
      previous = centre;
    }
    assert.ok(Math.abs(prologueNaturalLongitude(target, 1, drift) - target) < 1e-9);
  }
  assert.equal(PROLOGUE_TURN.dir, -1);
  // The first screen settles at ≈ 115°E and drifts on west over India.
  const rest = prologueNaturalLongitude(target, 0, 0);
  assert.ok(rest > 110 && rest < 120, `${rest}`);
  assert.ok(prologueNaturalLongitude(target, 0, 30) < rest);
});

test('the statements latch with hysteresis, and the selects come from the chapter\'s own frames', () => {
  const [a, b] = ROLL.s1;
  assert.deepEqual(statementState(a - 0.001, ROLL.s1, false), { on: false, past: false });
  assert.deepEqual(statementState(a, ROLL.s1, false), { on: true, past: false });
  assert.deepEqual(statementState(a - 0.005, ROLL.s1, true), { on: true, past: false });
  assert.deepEqual(statementState(b + 0.005, ROLL.s1, true), { on: true, past: false });
  assert.deepEqual(statementState(b + 0.02, ROLL.s1, true), { on: false, past: true });
  const photos = Array.from({ length: 15 }, (_, index) => ({
    imageUrl: `https://cdn.sanity.io/images/x/y/f${index}-${index % 2 ? '3000x2000' : '2000x3000'}.jpg`,
  }));
  const frames = rollFrames(photos, `${photos[10].imageUrl}?w=1600`);
  assert.deepEqual(frames.map((frame) => [frame.n, frame.select]), [[10, false], [11, true], [12, false]]);
  assert.ok(Math.abs(frames[0].ratio - 1.5) < 1e-9 && Math.abs(frames[1].ratio - 2 / 3) < 1e-9);
  assert.deepEqual(rollFrames(photos, `${photos[0].imageUrl}`).map((frame) => frame.n), [1, 2]);
});

test('reduced motion: the roll waits off screen, then cuts between three windows', () => {
  for (const viewport of VIEWPORTS) {
    const { layout, X0, X1 } = setup(viewport);
    assert.equal(rollXStill(0.1, layout, X0, X1, viewport.W), X0);
    assert.equal(rollXStill(0.9, layout, X0, X1, viewport.W), X1);
    const early = rollXStill(0.3, layout, X0, X1, viewport.W);
    const mid = rollXStill(0.6, layout, X0, X1, viewport.W);
    // The first window shows the roll's first cut; the second a later one.
    assert.ok(early + layout.cuts[0].left >= 0 && early + layout.cuts[0].left < viewport.W);
    assert.ok(mid < early);
  }
});
