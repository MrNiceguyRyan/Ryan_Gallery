// Run offline: node --experimental-strip-types --test scripts/cover-dock.test.mjs
//
// The cover rides with its shield (src/lib/coverDock.ts): owner, 2026-09-28,
// 封面可以跟随路牌一起走，出现在路牌的右上角或者左上角或者右下角或者左下角. On the
// desktop a chapter's ticket lies on the atlas beside its place's shield, a
// joint's gap off one of its corners. One dock per corner (owner,
// 2026-09-29: 从任何角度冒出来都可以，不用局限一定要在地标左下边): each place
// takes the corner that hides no other shield and keeps its route clear,
// places at one corner stand on one point, and a switch folds the cover into
// a small ticket, relays it, opens it in place and then puts its tip out
// (先缩小成类似机票那样过去，地点文字滚动，到位之后展开封面，然后…尖冒出来): the
// ticket's geometry, the beats and the glide are held here too. Pinned on
// the archive as Sanity serves it (a fixture).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';
import {
  CORNER_ORDER,
  DOCK,
  QUADRANTS,
  ROUTE_SLACK,
  TICKET,
  TICKET_EXPAND_MS,
  chooseCorners,
  coverStubRect,
  developSweep,
  dockPoint,
  easeInverse,
  glideAt,
  switchSchedule,
  ticketFrames,
  ticketGlide,
  RAIL,
  awaySide,
  centreFor,
  coverDock,
  coverRatioOf,
  coverSize,
  dockShown,
  fitBox,
  planDock,
  plateRect,
  projectAt,
  railBox,
  stageBox,
} from '../src/lib/coverDock.ts';
import { activeChapters, chapterSections } from '../src/lib/chapterOrder.ts';
import { EXPLORE_PITCH } from '../src/lib/explorerCamera.ts';
import { chapterPoint } from '../src/lib/geo.ts';
import { EASE, bezierFn, voyageEase } from '../src/lib/motion.ts';
import { SHIELD_MAP_PX, SHIELD_SCALE, shieldForm, signLines, stateCode } from '../src/lib/routeShield.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { collections } = JSON.parse(readFileSync(new URL('./fixtures/archive-2026-09-27.json', import.meta.url), 'utf8'));

const SCREENS = [[1728, 1000], [1280, 800], [1440, 900], [1920, 1080], [1024, 768]];
const inside = (box, stage) => box.left >= stage.left - 0.5 && box.right <= stage.right + 0.5 && box.top >= stage.top - 0.5 && box.bottom <= stage.bottom + 0.5;
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const shieldBox = (point, shield) => ({ left: point.x - shield.w / 2, top: point.y - shield.h, right: point.x + shield.w / 2, bottom: point.y });

// The atlas's resting camera as RouteAtlas derives it (the atlas 78% of the
// page, its focal point 264px in from its right edge, on the reading line;
// the canvas a 32px bleed past the viewport each side; the explorer's
// pitch).
const cameraFor = (vw, vh) => ({ focal: { x: (0.78 * vw - 264) / 2, y: 0.48 * vh }, pitch: EXPLORE_PITCH.rest, bearing: -2, distance: 1.5 * (vh + 64) });

// The archive as the homepage reads it, with each chapter's rest zoom
// (RouteAtlas hopRestZooms: neighbours ≥150px apart, 5.05 to 5.98), its
// sign's name lines, its two legs (the route closes, 06 onto 01) and — every
// place with a region — its state's tab.
function archiveChapters() {
  const sections = chapterSections(activeChapters(collections));
  const cities = sections.flatMap((section) => section.cities);
  const places = cities.map((city) => ({ city, coords: chapterPoint(city) }));
  const my = (lat) => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const px = (a, b, z) => (Math.hypot(b[0] - a[0], my(b[1]) - my(a[1])) * 512 * 2 ** z) / 360;
  const shieldOf = (region, scale) => {
    const w = SHIELD_MAP_PX * scale;
    return { w, h: (w * shieldForm(stateCode(region)).h) / 100 };
  };
  const n = places.length;
  return places.map(({ city, coords }, index) => {
    let nearest = Infinity;
    places.forEach((other, j) => { if (j !== index) nearest = Math.min(nearest, px(coords, other.coords, 5.05)); });
    const zoom = Math.max(5.05, Math.min(5.98, 5.05 + Math.log2(150 / nearest)));
    return {
      id: city._id,
      name: city.name.trim(),
      lines: signLines(city.name),
      coordinates: coords,
      zoom,
      ratio: coverRatioOf(city.coverImageUrl ?? city.photos?.[0]?.imageUrl) ?? 1.5,
      tab: !!city.region?.trim(),
      shield: shieldOf(city.region, SHIELD_SCALE.current),
      neighbours: places.filter((_, j) => j !== index).map((other) => ({
        coordinates: other.coords,
        ...shieldOf(other.city.region, SHIELD_SCALE.ahead),
      })),
      route: { prev: places[(index - 1 + n) % n].coords, next: places[(index + 1) % n].coords },
    };
  });
}
// The corners' points and the covers' sizes, as planDock derives them.
function corners(chapters, vw, vh) {
  const stage = stageBox(vw, vh);
  const sizes = chapters.map((c) => coverSize(c.ratio, stage));
  const pairs = chapters.map((c, i) => ({ shield: c.shield, size: sizes[i], tab: c.tab }));
  const points = Object.fromEntries(QUADRANTS.map((q) => [q, dockPoint(stage, pairs, q).point]));
  return { stage, sizes, points };
}
const insets = (clip) => clip.match(/inset\(([^)]+)\)/)[1].split(' ').map((v) => parseFloat(v));
const translate = (tf) => tf.match(/translate\(([^,]+)px, ([^)]+)px\)/).slice(1, 3).map(Number);

test('the stage: below the nav, above the ticks, left of the chapters\' rail', () => {
  for (const [vw, vh] of SCREENS) {
    const rail = railBox(vw);
    const stage = stageBox(vw, vh);
    assert.equal(rail.right, vw - (vw >= 1280 ? 64 : 48), 'the column\'s own right padding (lg:pr-12 xl:pr-16)');
    assert.ok(rail.width >= RAIL.min && rail.width <= RAIL.max);
    assert.equal(stage.right, rail.left - DOCK.railGap);
    assert.ok(stage.right - stage.left > 520, `${vw}: room for a cover and its shield`);
  }
  // The rail's CSS width is the same clamp.
  const css = source('src/styles/global.css');
  assert.match(css, new RegExp(`\\.archive-rail \\{\\s*width: clamp\\(${RAIL.min}px, ${RAIL.share * 100}vw, ${RAIL.max}px\\);`));
});

test('a cover keeps its photograph\'s ratio and fits the stage', () => {
  assert.equal(coverRatioOf('https://cdn/x/abc-6048x4032.jpg'), 1.5);
  assert.equal(coverRatioOf('https://cdn/x/abc-4032x6048.jpg'), 4032 / 6048);
  assert.equal(coverRatioOf('https://cdn/x/abc-10000x1000.jpg'), 2.4);
  assert.equal(coverRatioOf('https://cdn/x/abc.jpg'), null);
  for (const [vw, vh] of SCREENS) {
    const stage = stageBox(vw, vh);
    for (const ratio of [0.45, 2 / 3, 1, 1.5, 2.4]) {
      const size = coverSize(ratio, stage);
      assert.ok(Math.abs(size.photoW / size.photoH - ratio) < 0.012, 'its own ratio');
      assert.equal(size.w, size.photoW + DOCK.stub);
      assert.ok(size.photoH <= DOCK.photoMaxH);
      assert.ok(size.photoH >= DOCK.photoMinH || size.w >= stage.right - stage.left - DOCK.gap - 48 - ratio - 1, 'the floor, unless the stage is narrower');
      assert.ok(size.w <= (stage.right - stage.left) * DOCK.coverShareW + 3 || size.photoH <= DOCK.photoMinH);
    }
  }
});

test('a plate hangs a joint\'s gap off the shield\'s corner, in its quadrant', () => {
  const point = { x: 600, y: 500 };
  const shield = { w: 40.8, h: 44 };
  const size = { w: 500, h: 300 };
  const corner = {
    tr: [shield.w / 2, -shield.h, 'left', 'bottom'],
    tl: [-shield.w / 2, -shield.h, 'right', 'bottom'],
    br: [shield.w / 2, 0, 'left', 'top'],
    bl: [-shield.w / 2, 0, 'right', 'top'],
  };
  for (const quadrant of QUADRANTS) {
    const plate = plateRect(point, shield, size, quadrant);
    const [cx, cy, sideX, sideY] = corner[quadrant];
    assert.ok(Math.abs(plate.right - plate.left - size.w) < 1e-9);
    assert.ok(Math.abs(plate.bottom - plate.top - size.h) < 1e-9);
    // The plate's nearest corner, the gap off the shield's, each way.
    assert.ok(Math.abs(Math.abs(plate[sideX] - (point.x + cx)) - DOCK.gap) < 1e-9, `${quadrant} x`);
    assert.ok(Math.abs(Math.abs(plate[sideY] - (point.y + cy)) - DOCK.gap) < 1e-9, `${quadrant} y`);
    assert.equal(overlap(plate, shieldBox(point, shield)), 0, `${quadrant}: never over its shield`);
    // Right quadrants lie right of the shield, top ones above it.
    assert.equal(plate.left > point.x, quadrant[1] === 'r');
    assert.equal(plate.bottom < point.y, quadrant[0] === 't');
    // The tab and the cue go on the edge away from the shield.
    assert.equal(awaySide(quadrant), quadrant[1] === 'r' ? 'right' : 'left');
  }
});

test('every corner fits the stage for every cover, on every desktop', () => {
  for (const [vw, vh] of SCREENS) {
    const stage = stageBox(vw, vh);
    for (const ratio of [2 / 3, 1.5, 2.4]) {
      const size = coverSize(ratio, stage);
      for (const quadrant of QUADRANTS) {
        for (const tab of [false, true]) {
          const shield = { w: 40.8, h: 44 };
          const { point, overflow } = dockPoint(stage, [{ shield, size, tab }], quadrant);
          assert.equal(overflow, 0, `${vw}×${vh} ${ratio.toFixed(2)} ${quadrant}`);
          assert.ok(inside(fitBox(plateRect(point, shield, size, quadrant), tab), stage));
          assert.ok(inside(shieldBox(point, shield), stage));
        }
      }
    }
  }
});

test('the camera\'s centre sets a place on its point (the pinhole, run backwards)', () => {
  for (const [vw, vh] of SCREENS) {
    const camera = cameraFor(vw, vh);
    const stage = stageBox(vw, vh);
    for (const place of [[-80.19, 25.76], [-112.19, 37.59], [-73.99, 40.75]]) {
      for (const zoom of [5.05, 5.5, 5.98]) {
        for (const point of [{ x: stage.left + 30, y: stage.bottom - 20 }, { x: stage.right - 40, y: stage.top + 60 }, { x: camera.focal.x, y: camera.focal.y }]) {
          const centre = centreFor(place, point, zoom, camera);
          const back = projectAt(place, centre, zoom, camera);
          assert.ok(Math.hypot(back.x - point.x, back.y - point.y) < 0.5, `${vw}: ${JSON.stringify(point)} → ${JSON.stringify(back)}`);
        }
      }
    }
    // The centre itself stands on the focal point.
    const at = projectAt([-100, 40], [-100, 40], 5.5, camera);
    assert.ok(Math.abs(at.x - camera.focal.x) < 1e-6 && Math.abs(at.y - camera.focal.y) < 1e-6);
  }
  // What lies further off (up the screen) is drawn smaller: the pitch.
  const camera = cameraFor(1728, 1000);
  const near = projectAt([-100, 39], [-100, 40], 5.5, camera);
  const far = projectAt([-100, 41], [-100, 40], 5.5, camera);
  assert.ok(camera.focal.y - far.y < near.y - camera.focal.y);
});

test('the archive\'s plan: one dock per corner — each place at its own, the corner\'s point shared, whole, clear', () => {
  const chapters = archiveChapters();
  assert.deepEqual(chapters.map((c) => c.name), ['Miami', 'Orlando', 'Page', 'Zion', 'Bryce Canyon', 'New York']);
  assert.deepEqual(chapters.map((c) => c.tab), [true, true, true, true, true, true], 'every place with a region carries its state');
  for (const [vw, vh] of SCREENS) {
    const camera = cameraFor(vw, vh);
    const rail = railBox(vw);
    const { stage, sizes, points } = corners(chapters, vw, vh);
    const plan = planDock(chapters, vw, vh, camera);
    const entries = chapters.map((c) => plan[c.id]);
    // Below-left for Florida, Page and Zion; above-left for Bryce Canyon and
    // New York (below-left, Bryce's cover hid Zion's shield).
    assert.deepEqual(entries.map((e) => e.quadrant), ['bl', 'bl', 'bl', 'bl', 'tl', 'tl'], `${vw}`);
    const chosen = chooseCorners(chapters, vw, vh, camera, points, sizes);
    chapters.forEach((chapter, index) => {
      const entry = entries[index];
      const cost = chosen[index].costs.find((c) => c.quadrant === entry.quadrant);
      assert.equal(cost.covered, 0, `${vw}: ${chapter.name} hides no shield`);
      assert.equal(cost.route, 0, `${vw}: ${chapter.name} keeps its route (beyond the slack)`);
      assert.equal(entry.covered, 0);
      // Places at one corner stand on its point, inside the stage.
      assert.deepEqual(entry.point, points[entry.quadrant]);
      const size = { w: entry.photoW + DOCK.stub, h: entry.photoH };
      const plate = plateRect(entry.point, chapter.shield, size, entry.quadrant);
      const fit = fitBox(plate, entry.tab);
      assert.equal(entry.overflow, 0, `${vw}: ${chapter.name} fits`);
      assert.ok(inside(fit, stage), `${vw}: ${chapter.name} on the stage`);
      assert.ok(fit.right < rail.left, `${vw}: ${chapter.name} clear of its rail`);
      assert.ok(inside(shieldBox(entry.point, chapter.shield), stage));
      assert.equal(entry.offset.x, Math.round(plate.left - entry.point.x));
      assert.equal(entry.offset.y, Math.round(plate.top - entry.point.y));
      // The camera's centre for it puts the place on its point.
      const back = projectAt(chapter.coordinates, entry.centre, chapter.zoom, camera);
      assert.ok(Math.hypot(back.x - entry.point.x, back.y - entry.point.y) < 0.5);
      assert.ok(Math.abs(entry.photoW / entry.photoH - chapter.ratio) < 0.012);
      assert.equal(entry.lines, chapter.lines);
    });
    Object.values(points).forEach((p) => assert.ok(p.x > stage.left && p.x < stage.right && p.y > stage.top && p.y < stage.bottom));
    // Pure: the same screen plans the same way.
    assert.deepEqual(planDock(chapters, vw, vh, camera), plan);
  }
  // Stop 01 stands where it stood (52a37be): the entrance's stub lands there.
  const plan = planDock(chapters, 1728, 1000, cameraFor(1728, 1000));
  const miami = plan[chapters[0].id];
  assert.equal(miami.quadrant, 'bl');
  assert.deepEqual(miami.point, { x: 1074, y: 200 });
  assert.deepEqual(coverStubRect(miami), { x: 852, y: 208, w: 190, h: 479, rotate: 0 });
});

test('the corner rule: pure, the route\'s slack, a hop in one corner moves nothing', () => {
  const chapters = archiveChapters();
  for (const [vw, vh] of SCREENS) {
    const camera = cameraFor(vw, vh);
    const { sizes, points } = corners(chapters, vw, vh);
    const a = chooseCorners(chapters, vw, vh, camera, points, sizes);
    assert.deepEqual(chooseCorners(chapters, vw, vh, camera, points, sizes), a, 'pure');
    // Why the slack: the state's tab lays a sliver of Page's legs (and at
    // the narrow screens Orlando's) under a below-left cover, and with no
    // slack that sliver alone sends them above-right — 838–1283 px of ground
    // per hop for nothing.
    const bare = chooseCorners(chapters, vw, vh, camera, points, sizes, 0).map((c) => c.quadrant);
    assert.equal(bare[2], 'tr', `${vw}: Page`);
    assert.equal(bare[1], vw <= 1280 ? 'tr' : 'bl', `${vw}: Orlando`);
    assert.ok(ROUTE_SLACK >= 120 && ROUTE_SLACK <= 200);
    assert.deepEqual(CORNER_ORDER, ['bl', 'tl', 'br', 'tr']);
    // A hop between neighbours at one corner leaves the ticket where it
    // lies: below-left to the pixel, above-left within the shields' heights.
    const plan = planDock(chapters, vw, vh, camera);
    for (let i = 1; i < chapters.length; i += 1) {
      const e0 = plan[chapters[i - 1].id];
      const e1 = plan[chapters[i].id];
      if (e0.quadrant !== e1.quadrant) continue;
      const move = Math.hypot(e1.point.x + e1.ticket.x - e0.point.x - e0.ticket.x, e1.point.y + e1.ticket.y - e0.point.y - e0.ticket.y);
      assert.ok(move <= (e0.quadrant === 'bl' ? 0 : 4), `${vw}: ${chapters[i - 1].name} → ${chapters[i].name} ${move}`);
    }
  }
});

test('the ticket: 340×172, seated at the plate\'s corner by its shield, at every corner', () => {
  const chapters = archiveChapters();
  for (const [vw, vh] of SCREENS) {
    const camera = cameraFor(vw, vh);
    for (const q of QUADRANTS) {
      const plan = planDock(chapters, vw, vh, camera, { quadrant: q });
      const minW = Math.min(...Object.values(plan).map((e) => e.photoW));
      chapters.forEach((chapter) => {
        const e = plan[chapter.id];
        const W = Math.min(TICKET.face, minW) + DOCK.stub;
        assert.equal(e.ticketW, W);
        assert.equal(e.ticketW, 340, 'the narrowest photograph still gives the face its strip');
        assert.equal(e.ticketH, 172, 'one height: the tallest sign (two lines)');
        const plateW = e.photoW + DOCK.stub;
        const fold = {
          bl: { x: 0, y: 0 },
          tl: { x: 0, y: e.photoH - e.ticketH },
          br: { x: -(plateW - W), y: 0 },
          tr: { x: -(plateW - W), y: e.photoH - e.ticketH },
        }[q];
        assert.deepEqual(e.fold, fold, `${q} fold`);
        const seat = { bl: [plateW - W, 0], tl: [plateW - W, e.photoH - e.ticketH], br: [0, 0], tr: [0, e.photoH - e.ticketH] }[q];
        assert.deepEqual(e.ticket, { x: e.offset.x + seat[0], y: e.offset.y + seat[1] }, `${q} seat`);
        // The ticket's corner is the plate's corner by the shield.
        const plate = plateRect(e.point, chapter.shield, { w: plateW, h: e.photoH }, q);
        const t = { left: e.point.x + e.ticket.x, top: e.point.y + e.ticket.y };
        if (q[1] === 'l') assert.ok(Math.abs(t.left + W - plate.right) <= 0.5);
        else assert.ok(Math.abs(t.left - plate.left) <= 0.5);
        if (q[0] === 't') {
          // Above: its foot is the plate's, a joint's gap over the shield.
          assert.ok(Math.abs(t.top + e.ticketH - plate.bottom) <= 0.5);
          assert.ok(Math.abs(plate.bottom - (e.point.y - chapter.shield.h - DOCK.gap)) < 1e-9);
        } else assert.ok(Math.abs(t.top - plate.top) <= 0.5);
        // The stub the entrance lands on is the plate's right end.
        const stub = coverStubRect(e);
        assert.ok(Math.abs(stub.x + stub.w - plate.right) <= 0.5);
        assert.ok(Math.abs(stub.y - plate.top) <= 0.5);
        assert.equal(stub.h, e.photoH);
      });
    }
  }
  // At 1728 the tickets lie at (702, 208) below-left and (702, 661) above.
  const plan = planDock(chapters, 1728, 1000, cameraFor(1728, 1000));
  const at = (id) => [plan[id].point.x + plan[id].ticket.x, plan[id].point.y + plan[id].ticket.y];
  assert.deepEqual(at(chapters[0].id), [702, 208]);
  assert.deepEqual(at(chapters[4].id), [702, 661]);
  assert.deepEqual(at(chapters[5].id), [702, 661]);
});

test('the fold and the opening: a clip and a translate, one edge by the shield never moving', () => {
  const plate = { w: 718 + DOCK.stub, h: 479 };
  for (const q of QUADRANTS) {
    const W = 340;
    const H = 172;
    const fold = { x: q[1] === 'r' ? -(plate.w - W) : 0, y: q[0] === 't' ? plate.h - H : 0 };
    const form = { plate, w: W, h: H, fold };
    const folding = ticketFrames(form, 'fold');
    const opening = ticketFrames(form, 'expand');
    const letGo = ticketFrames(form, 'let-go');
    assert.equal(folding.ms, TICKET.faceMs);
    assert.equal(opening.ms, TICKET_EXPAND_MS);
    // Folded: exactly the ticket (its top-right W×H, the 12 px pad kept for
    // the caret), brought to the corner by the shield.
    const last = folding.frames.at(-1);
    assert.deepEqual(insets(last.clipPath), [-12, -12, plate.h - H, plate.w - W]);
    assert.deepEqual(translate(last.transform), [fold.x, fold.y]);
    assert.deepEqual(folding.frames[0], { offset: 0, clipPath: 'inset(-12px -12px 0.0px 0.0px)', transform: 'translate(0.0px, 0.0px)' });
    // The opening starts where the fold ends and ends whole.
    assert.equal(opening.frames[0].clipPath, last.clipPath);
    assert.equal(opening.frames[0].transform, last.transform);
    assert.equal(opening.frames.at(-1).clipPath, 'inset(-12px -12px 0.0px 0.0px)');
    assert.deepEqual(translate(opening.frames.at(-1).transform), [0, 0]);
    // A let-go folds to the same ticket, on the exit curve.
    assert.deepEqual(letGo.frames.at(-1), last);
    // Monotonic, and the edges by the shield stand still throughout.
    let prev = null;
    folding.frames.forEach((frame) => {
      const [, , bottom, left] = insets(frame.clipPath);
      const [tx, ty] = translate(frame.transform);
      if (prev) assert.ok(bottom >= prev[0] - 1e-9 && left >= prev[1] - 1e-9, `${q} ${frame.clipPath}`);
      prev = [bottom, left];
      // Right-hand corners: the left edge (tx + left) stays at 0; above
      // corners: the foot (ty + h − bottom) stays at the plate's.
      if (q[1] === 'r') assert.ok(Math.abs(tx + left) <= 0.11);
      else assert.equal(tx, 0);
      if (q[0] === 't') assert.ok(Math.abs(ty - bottom) <= 0.11);
      else assert.equal(ty, 0);
    });
    // The stub unrolls before the face is half open (the sign first).
    const half = opening.frames.find((f) => insets(f.clipPath)[3] <= (plate.w - W) / 2);
    assert.ok(insets(half.clipPath)[2] <= (plate.h - H) * 0.05);
  }
});

test('the beats: off the flight\'s own clock', () => {
  const turn = bezierFn(EASE.turn);
  const t = switchSchedule(1400, turn);
  assert.equal(t.relayAt, TICKET.foldAt + TICKET.faceMs);
  assert.equal(t.relayAt, 380);
  assert.ok(Math.abs(t.expandAt - 921) <= 2, `turn ${t.expandAt}`);
  assert.equal(t.expandEnd, t.expandAt + 440);
  assert.ok(Math.abs(t.expandEnd - 1361) <= 2);
  assert.equal(t.tipAt, t.expandEnd + TICKET.tipGap);
  assert.ok(t.tipAt + TICKET.tipInMs <= 1600);
  assert.equal(t.end, t.tipAt + TICKET.extrasInMs);
  // 到位之后展开: the camera has made 95% of its move.
  assert.ok(Math.abs(turn(t.expandAt / 1400) - TICKET.landShare) < 0.01);
  assert.ok(Math.abs(switchSchedule(2000, voyageEase).expandAt - 1713) <= 2);
  for (let land = 860; land <= 2600; land += 20) {
    for (const ease of [turn, voyageEase]) {
      const s = switchSchedule(land, ease);
      assert.ok(s.expandAt - s.relayAt >= TICKET.transitMinMs, `${land}`);
    }
  }
  assert.ok(Math.abs(easeInverse((x) => x, 0.3) - 0.3) < 1e-9);
  // The tip comes out last, the extras with it: nothing hangs off a ticket.
  assert.ok(TICKET.tipOutMs <= 120 && TICKET.extrasOutMs <= 120);
  assert.equal(TICKET.leanPx, 0);
});

test('the glide: a ticket rides the camera\'s own clock to its new corner, slower than the ground', () => {
  const chapters = archiveChapters();
  const plan = planDock(chapters, 1728, 1000, cameraFor(1728, 1000));
  const zion = plan[chapters[3].id];
  const bryce = plan[chapters[4].id];
  const from = { x: zion.point.x + zion.ticket.x, y: zion.point.y + zion.ticket.y };
  const to = { x: bryce.point.x + bryce.ticket.x, y: bryce.point.y + bryce.ticket.y };
  assert.deepEqual([from, to], [{ x: 702, y: 208 }, { x: 702, y: 661 }]);
  const ground = Math.hypot(bryce.point.x - zion.point.x, bryce.point.y - zion.point.y);
  for (const D of [1400, 2000]) {
    const s = switchSchedule(D, voyageEase);
    const g = ticketGlide(from, to, s.relayAt, s.expandAt, voyageEase, D);
    assert.deepEqual(g(0), from);
    assert.deepEqual(g(s.relayAt), from, 'still until the relay');
    assert.deepEqual(g(s.expandAt), to, 'there by the opening');
    let prev = from;
    let peak = 0;
    let groundPeak = 0;
    for (let t = 1; t <= D; t += 1) {
      const p = g(t);
      assert.ok(p.y >= prev.y - 1e-9, 'monotonic');
      peak = Math.max(peak, Math.hypot(p.x - prev.x, p.y - prev.y));
      groundPeak = Math.max(groundPeak, ground * (voyageEase(t / D) - voyageEase((t - 1) / D)));
      prev = p;
    }
    assert.ok(peak <= groundPeak, `${D}: the ticket ${peak.toFixed(3)} px/ms, the ground ${groundPeak.toFixed(3)}`);
  }
  // With nowhere to go it lies still.
  const still = ticketGlide(from, from, 380, 921, voyageEase, 1400);
  assert.deepEqual(still(700), from);
});

test('a switch keeps the ticket where it lies: its own pin for each cover, the relay a cut, nothing re-placed per frame', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const css = source('src/styles/global.css');
  // Through a switch the cover is carried: asked for from take-off.
  assert.match(atlas, /return flying\.carry && id === held \? \{ id, appear: true, stay: true \} : null;/);
  // Each cover is written at its own pin, else the pin, else its foot; only
  // a changed point is written.
  assert.match(chapter, /const point = frame\.pins\?\.\[me\] \?\? \(frame\.pin && \(at \|\| out\) \? frame\.pin : frame\.points\[me\]\);/);
  assert.match(chapter, /if \(!point \|\| \(point\.x === lastX && point\.y === lastY\)\) return;/);
  // Both tickets on one point: the carrier's pin is the arriving one's,
  // moved by the difference of their seats.
  assert.match(atlas, /pins\[sw\.from\] = \{ x: written\.x \+ planned\.ticket\.x - carrier\.ticket\.x, y: written\.y \+ planned\.ticket\.y - carrier\.ticket\.y \};/);
  // The arriving cover is held hidden in its ticket form from the click, set
  // in the frame's own task (before any paint)…
  const switchIn = chapter.slice(chapter.indexOf('const switchIn = ('), chapter.indexOf('const retimeIn = ('));
  assert.match(switchIn, /dock\.setAttribute\('data-ticket', sw\.mode === 'lay' \? '' : 'wait'\);/);
  assert.match(chapter, /const off = coverDock\.subscribe\(\(frame\) => \{[\s\S]*onSwitchRef\.current\(sw, at\);[\s\S]*onBeatRef\.current\(sw, now\);/);
  assert.match(css, /\.archive-dock\[data-ticket='wait'\],\s*\.archive-dock\[data-ticket='wait'\] \.archive-ticket-next \{\s*visibility: hidden !important;/);
  // …and the relay and the carrier's cut are decided in the frame, for
  // every cover at once; the carrier goes with no fade.
  const onBeat = chapter.slice(chapter.indexOf('const onBeat = ('), chapter.indexOf('// ── The arrival (src/lib/coverDock.ts'));
  assert.match(onBeat, /now >= sw\.relayAt\) relayIn\(sw, now\)/);
  assert.match(onBeat, /now >= sw\.cutAt\) \{[\s\S]*dock\?\.setAttribute\('data-cut', ''\);/);
  assert.match(css, /\.archive-dock\[data-cut\] \{\s*transition: none;/);
  assert.match(css, /\.archive-dock\[data-leaving\] \{\s*z-index: 1;\s*opacity: 1;\s*visibility: visible;\s*transition: none;/);
  // Every beat is started at its own time on the document's timeline.
  assert.match(chapter, /anim\.startTime = time;/);
  // A publish at each beat (a resting map draws nothing), keyed by it.
  assert.match(atlas, /\[sw\.relayAt, sw\.cutAt, sw\.expandAt, sw\.tipAt\]\.forEach\(\(t\) => \{/);
  assert.match(atlas, /const beats = sw \? \[sw\.relayAt, sw\.cutAt, sw\.expandAt, sw\.tipAt\]\.filter\(\(t\) => now >= t\)\.length : 0;/);
  // Paint and composite only: a clip, a translate, a scale, colours, a mask.
  const plays = chapter.slice(chapter.indexOf('// ── The switch, the arrival, the let-go'), chapter.indexOf('// ── The stub hand-off (src/lib/explorer.ts)'));
  assert.ok(plays.length > 2000);
  assert.doesNotMatch(plays, /getBoundingClientRect|offset(Width|Height|Top|Left)|client(Width|Height)|style\.(width|left|top) =/);
  // The only read: the ticket in transit's colour, once, at a 'lay' relay.
  assert.equal((plays.match(/getComputedStyle\(/g) ?? []).length, 1);
  // A publish per frame at most (the map fires move and render in one).
  assert.match(atlas, /if \(key === publishedKeyRef\.current\) return;/);
  const publish = atlas.slice(atlas.indexOf('const publishDock = () => {'), atlas.indexOf('const publishDockRef'));
  assert.doesNotMatch(publish, /getBoundingClientRect|offset(Width|Height|Top|Left)|client(Width|Height)/);
});

test('a new choice mid-switch never stacks: the carrier by phase', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const pick = atlas.slice(atlas.indexOf('let carrier = switching ? shown : null;'), atlas.indexOf('const carrierIndex = '));
  // Folding: the one folding carries on, the new cover at the same relay.
  assert.match(pick, /if \(now < prev\.relayAt\) \{\s+carrier = prev\.from;\s+relayAt = prev\.relayAt;/);
  assert.match(pick, /mode = carrier === destId \? 'self' : 'fold';/);
  // In transit: laid on at once, its dark ground in over retargetMatMs.
  assert.match(pick, /mode = 'lay';\s+relayAt = now;\s+cutAt = now \+ TICKET\.retargetMatMs;/);
  // Opening: folds back over the share it had opened.
  assert.match(pick, /mode = 'back';[\s\S]*relayAt = now \+ Math\.max\(TICKET\.foldBackMinMs, Math\.round\(TICKET_FOLD_MS \* open\)\);/);
  // The chapter's parts: the one given up before its relay goes unseen…
  const onSwitch = chapter.slice(chapter.indexOf('const onSwitch = ('), chapter.indexOf('const onBeat = ('));
  assert.match(onSwitch, /if \(!play\.relayed && play\.mode !== 'self'\) cutUnseen\(\);/);
  // …the carrier still folding carries on; a ticket in transit holds; a
  // cover opening folds back from where it is.
  assert.match(onSwitch, /if \(play\?\.kind === 'switch' && play\.role === 'out'\) \{\s+play\.key = sw\.key;/);
  const out = chapter.slice(chapter.indexOf('const switchOut = ('), chapter.indexOf('const switchSelf = ('));
  assert.match(out, /if \(sw\.mode === 'lay'\) \{[\s\S]*anim\.pause\(\);/);
  assert.match(out, /foldPlate\(was, form, now, 'fold', ms\);/);
  assert.match(chapter, /running\.commitStyles\(\);/);
});

test('the channel keeps the last plan and frame for a cover that mounts late', () => {
  const frames = [];
  coverDock.publish({ at: 'a', points: { a: { x: 1, y: 2 } } });
  const off = coverDock.subscribe((frame) => frames.push(frame));
  assert.equal(frames.length, 1, 'placed at once');
  assert.equal(frames[0].at, 'a');
  coverDock.publish({ at: null, points: {} });
  assert.equal(frames.length, 2);
  off();
  coverDock.publish({ at: 'b', points: {} });
  assert.equal(frames.length, 2, 'unsubscribed');
  let told = 0;
  const offPlan = coverDock.subscribePlan(() => { told += 1; });
  coverDock.setPlan({});
  assert.equal(told, 1);
  offPlan();
  coverDock.setPlan(null);
  coverDock.publish({ at: null, points: {} });
});

test('a ticket tears only while its cover is up, and is put back whole once it has gone', () => {
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  // Nothing tears a cover no one can see (the explorer then simply goes on).
  assert.match(chapter, /const tearStubThen = \(go: \(\) => void\) => \{\s+if \(!ticket \|\| !dockShownRef\.current\) return false;/);
  // Gone (its fade done), it is whole again for the next visit: the fold,
  // the tip, the print all put back, unseen.
  assert.match(chapter, /reseatTimer = window\.setTimeout\(\(\) => \{\s+if \(dockShownRef\.current\) return;\s+hold = false;\s+settlePlayRef\.current\(\);\s+reseatRef\.current\(\);\s+\}, DOCK_FADE_MS \+ 60\);/);
  // A carrier let go while still folding is put back only once its own fade
  // is done (not at the one it lost its place in hand for).
  assert.match(chapter, /if \(!at && play\?\.role === 'out' && !play\.cut\) \{\s+hold = true;\s+reseatLater\(\);/);
});

test('wiring: the atlas publishes on its render, the chapters ride it', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const home = source('src/components/home/HomePage.tsx');
  const closing = source('src/components/home/ArchiveClosing.tsx');
  const css = source('src/styles/global.css');
  // Published on the map's render — the frame the canvas and the shields'
  // markers are drawn in — at the projected point rounded as a marker's is.
  const publish = atlas.slice(atlas.indexOf('const publishDock = () => {'), atlas.indexOf('const publishDockRef'));
  assert.match(publish, /map\.project\(place\.coordinates\)/);
  assert.match(publish, /Math\.round\(point\.x\) - bleed/);
  assert.doesNotMatch(publish, /getBoundingClientRect|offsetTop|clientWidth/);
  // On `move` too, as the shields' markers are placed: on `render` alone the
  // cover trailed its sign by a frame (the joint closed from 12px to 3).
  assert.match(atlas, /const onRender = \(\) => publishDockRef\.current\(\);\s+map\.on\('move', onRender\);\s+map\.on\('render', onRender\);/);
  // Shown or not is the gate's decision, on the camera's ask: the place in
  // hand, down at it (never in flight), near its zoom.
  assert.match(publish, /dockShown\(dockAtRef\.current, dockAskRef\.current,/);
  assert.match(atlas, /const askFor = \(\): DockAsk \| null => \{\s+const held = currentRef\.current;\s+if \(!held\) return null;/);
  assert.match(atlas, /return \{ id: held, appear: out <= HOP\.appearOut, stay: out <= HOP\.stayOut \};/);
  // The camera moves a place by where it stands over the ground; its centre
  // on the screen stays the atlas's focal point.
  assert.match(atlas, /const restCenter = \(index: number\): GeoCoordinate => dockCentres\[index\] \?\?/);
  assert.match(atlas, /map\.setPadding\(activePadding\);/);
  // Off the globe's swap to Mercator at zoom 6.
  assert.match(atlas, /restZoomMax: 5\.98,/);
  // The cover is written at its place's foot, into the atlas's dock.
  assert.match(chapter, /dock\.style\.transform = `translate3d\(\$\{point\.x\}px, \$\{point\.y\}px, 0\)`/);
  assert.match(chapter, /data-cover-for=\{id\}/);
  assert.match(chapter, /createPortal\(/);
  assert.match(home, /<div ref=\{setDockHost\} className="archive-dock-host"( data-let-go=\{[^}]*\})? \/>/);
  // The place in hand's rail shows with its cover (the dock's frame).
  assert.match(home, /coverDock\.subscribe\(\(frame\) => \{/);
  assert.match(home, /railShown=\{dockAt === city\._id\}/);
  assert.doesNotMatch(closing, /archive:onward/);
  // It appears whole (no transition in) and fades out on the fade curve as
  // its fold ends.
  assert.match(css, /\.archive-dock\[data-at\] \{\s*opacity: 1;\s*visibility: visible;\s*transition: none;/);
  assert.match(css, /\.archive-dock \{[^}]*transition: opacity var\(--dur-swap\) var\(--ease-fade\) 200ms, visibility 0s linear 520ms;/);
  // It recedes under a story with the map it is on.
  assert.match(css, /main\[data-story-under="true"\] \.archive-dock-host \{/);
  // No lime on the map's caret or tab.
  const dockCss = css.slice(css.indexOf('/* ─── The cover rides with its shield'), css.indexOf('/* The chapter\'s rail'));
  assert.ok(dockCss.length > 500);
  assert.doesNotMatch(dockCss, /#D2FF00|210,\s*255,\s*0/i);
});

test('the joint is a gap and a caret, never a line across it', () => {
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const css = source('src/styles/global.css');
  // The owner struck lines off the signs twice (不需要下面的引线, 不需要白色竖干).
  assert.equal(DOCK.gap, 8);
  assert.doesNotMatch(chapter, /archive-dock__joint/);
  assert.doesNotMatch(css, /archive-dock__joint/);
  // The plate's corner nearest its shield points at it, cut from the card:
  // the face's dark edge on the face's corners (the right-hand quadrants put
  // the photograph by the shield), the stub's stock on the stub's.
  assert.match(chapter, /className="archive-plate__caret"\s+data-half=\{quadrant === 'tr' \|\| quadrant === 'br' \? 'face' : 'stub'\}/);
  for (const quadrant of QUADRANTS) {
    const rule = new RegExp(`\\.archive-dock\\[data-quadrant='${quadrant}'\\] \\.archive-plate__caret \\{[^}]*clip-path: polygon\\(`);
    assert.match(css, rule, quadrant);
  }
  assert.match(css, /\.archive-plate__caret\[data-half='stub'\] \{\s*background: var\(--stub-paper/);
  // The caret's tip stays inside the gap: 4px out each way of the 8.
  const tip = /\.archive-dock\[data-quadrant='tr'\] \.archive-plate__caret \{\s*left: -4px;/;
  assert.match(css, tip);
  // It comes out of the plate's corner itself: scaled about the point where
  // it meets the plate, per corner.
  const origin = { tr: '4px 8px', tl: '8px 8px', br: '4px 4px', bl: '8px 4px' };
  for (const quadrant of QUADRANTS) {
    assert.match(css, new RegExp(`\\.archive-dock\\[data-quadrant='${quadrant}'\\] \\.archive-plate__caret \\{[^}]*transform-origin: ${origin[quadrant]};`), quadrant);
  }
  // While stop 01's stub is on its way, the tip waits too, whichever half.
  assert.match(css, /\.archive-plate\[data-stub-awaited\] \.archive-plate__caret \{\s*visibility: hidden;/);
  assert.doesNotMatch(css, /\[data-stub-awaited\][^{]*\.archive-plate__caret\[data-half='stub'\]/);
});

test('the state, boxed; the pad gone; the old switch gone', () => {
  const css = source('src/styles/global.css');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  // 州名可以框起来，更醒目: the state in the sign's own enamel rule, in the
  // label face, caps tracked at most 0.1em, outlined, never lime.
  const rule = css.match(/^\.archive-dock__tab-state \{([^}]*)\}/m)[1];
  assert.match(rule, /font-family: var\(--font-ui\);/);
  assert.match(rule, /font-size: 13px;/);
  assert.match(rule, /font-weight: 700;/);
  assert.match(rule, /text-transform: uppercase;/);
  assert.ok(Number(rule.match(/letter-spacing: ([\d.]+)em/)[1]) <= 0.1);
  assert.match(rule, /box-shadow: inset 0 0 0 1\.5px rgba\(244, 244, 237, 0\.86\);/);
  const tabCss = css.slice(css.indexOf('.archive-dock__tab {'), css.indexOf('/* The chapter\'s rail'));
  assert.doesNotMatch(tabCss, /d2ff00|210,\s*255,\s*0/i);
  assert.match(css, /\.archive-dock__tab \{[^}]*height: 30px;/);
  assert.equal(DOCK.tab, 30);
  assert.equal(DOCK.below, 36);
  assert.match(chapter, /<div className="archive-dock__tab font-ui" data-side=\{phone \? 'left' : side\} aria-hidden="true">/);
  assert.match(chapter, /<span className="archive-dock__tab-state">\{stateTab\.state\}<\/span>/);
  assert.doesNotMatch(css, /archive-dock__tab-region/);
  // No strips under the cover: the pad is gone everywhere, and the old
  // switch's outline, mat polygon, unroll and fold with it.
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  const src = walk(new URL('../src', import.meta.url).pathname).filter((f) => /\.(tsx?|css|astro)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const gone of ['archive-ticket-pad', 'padStocks', 'chapterPadStocks', 'SWITCH_COVER', 'switchClip', 'matPolygon', 'arrivalClipFrames', 'foldClip', 'DOCK_QUADRANT', 'arrivalDelay', 'regionTab']) {
    assert.doesNotMatch(src, new RegExp(`\\b${gone}\\b`), gone);
  }
  // The develop is kept (the strip), and starts blank.
  const { from, to, hidden } = developSweep(1.5);
  assert.ok(hidden < from && from < to);
});

test('a portrait cover keeps most of the height it had in the column', () => {
  // In the column a portrait cover stood 780px on the owner's screen; at
  // 0.64 of the stage it had 531 (46% of its area).
  const stage = stageBox(1728, 1000);
  const portrait = coverSize(2 / 3, stage);
  const landscape = coverSize(1.5, stage);
  assert.ok(portrait.photoH >= 640, `portrait ${portrait.photoW}×${portrait.photoH}`);
  assert.ok(landscape.photoW >= 700, `landscape ${landscape.photoW}×${landscape.photoH}`);
  // Still whole on the stage at every corner (the plan test holds the rest).
  assert.ok(portrait.photoH + DOCK.tab + DOCK.below + DOCK.gap + 56 <= stage.bottom - stage.top);
});

test('a cover appears once its place is in hand and the camera is down, and stays while it is', () => {
  // Nothing asked: nothing shown; a place asked for appears at once (it is
  // asked only once the camera is down on it, RouteAtlas's `askFor`) …
  let shown = dockShown(null, null);
  assert.equal(shown, null);
  shown = dockShown(shown, { id: 'orlando', appear: true, stay: true });
  assert.equal(shown, 'orlando');
  // … it stays while the reader roams the map with it in hand (zoomed out a
  // little it may no longer appear, but it stays) …
  shown = dockShown(shown, { id: 'orlando', appear: false, stay: true });
  assert.equal(shown, 'orlando');
  // … far out, or in flight, or let go: gone.
  assert.equal(dockShown(shown, { id: 'orlando', appear: false, stay: false }), null);
  assert.equal(dockShown(shown, null), null);
  // A new place asked while another shows: the old goes (in practice the
  // camera asks for nothing in flight, so the two never meet).
  assert.equal(dockShown('page', { id: 'zion', appear: true, stay: true }), 'zion');
  // A place with no point this frame never appears.
  assert.equal(dockShown(null, { id: 'page', appear: true, stay: true }, () => false), null);
});

test('the rail shows with its cover, and the sign turns when its cover appears', () => {
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const home = source('src/components/home/HomePage.tsx');
  const css = source('src/styles/global.css');
  // The explorer's rail: the place whose cover is up (never while a ticket
  // tears or the camera flies); with none up, the archive's own line.
  assert.match(chapter, /data-shown=\{railShown \? '' : undefined\}/);
  assert.match(css, /\.explorer-place\[data-shown\] \{\s*opacity: 1;/);
  assert.match(home, /className="explorer-idle" data-shown=\{free && !dockAt \? '' : undefined\}/);
  // The flap waits for the cover to appear.
  assert.match(chapter, /if \(dockShownRef\.current\) start\(\);\s+else \{\s+dockAppearRef\.current = start;/);
  // Narrow windows stack the frames count over the lede.
  assert.match(css, /@media \(max-width: 1439px\) \{\s+\.archive-rail \.archive-lede \{\s+grid-template-columns: minmax\(0, 1fr\);/);
  // The rail's pool is light (a cloud of smoke on pale rock at 0.8); the
  // type has its own soft shadow.
  assert.match(css, /rgba\(16, 20, 14, 0\.58\) 0%/);
  assert.match(css, /\.archive-rail__lede \{\s+color: rgba\(244, 244, 237, 0\.92\);\s+text-shadow:/);
});
