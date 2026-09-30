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
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  CORNER_ORDER,
  CUE,
  DOCK,
  QUADRANTS,
  ROUTE_SLACK,
  TICKET,
  TICKET_EXPAND_MS,
  TICKET_FOLD_MS,
  afterOpening,
  chooseCorners,
  coverStubRect,
  cueBox,
  dockPoint,
  glideShare,
  nameDownAt,
  printStyle,
  SHIELD_ROOM,
  shieldShift,
  tipPopFrames,
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
import { FLAP, SHIELD_MAP_PX, SHIELD_SCALE, flapSpan, shieldForm, shieldZoomScale, signLines, stateCode } from '../src/lib/routeShield.ts';
import { greatCirclePoint } from '../src/lib/routeGeometry.ts';

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
// shields as drawn there (their state's scale × the zoom's, SHIELD_ZOOM), its
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
    const shieldZoom = shieldZoomScale(zoom);
    return {
      id: city._id,
      name: city.name.trim(),
      lines: signLines(city.name),
      coordinates: coords,
      zoom,
      ratio: coverRatioOf(city.coverImageUrl ?? city.photos?.[0]?.imageUrl) ?? 1.5,
      tab: !!city.region?.trim(),
      shield: shieldOf(city.region, SHIELD_SCALE.current * shieldZoom),
      shieldZoom,
      neighbours: places.filter((_, j) => j !== index).map((other) => ({
        coordinates: other.coords,
        ...shieldOf(other.city.region, SHIELD_SCALE.ahead * shieldZoom),
      })),
      route: { prev: places[(index - 1 + n) % n].coords, next: places[(index + 1) % n].coords },
    };
  });
}
// The corners' points and the covers' sizes, as planDock derives them.
function corners(chapters, vw, vh) {
  const stage = stageBox(vw, vh);
  const room = chapters.reduce((m, c) => ({ w: Math.max(m.w, c.shield.w), h: Math.max(m.h, c.shield.h) }), { w: 0, h: 0 });
  const sizes = chapters.map((c) => coverSize(c.ratio, stage, room));
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
  // Stop 01's stub, where the entrance lands the pass's (derived: with the
  // shields a little larger at a rest, SHIELD_ZOOM, the plate stands a few
  // px further off its 64 px shield — (852, 208) at 1×).
  const plan = planDock(chapters, 1728, 1000, cameraFor(1728, 1000));
  const miami = plan[chapters[0].id];
  assert.equal(miami.quadrant, 'bl');
  assert.deepEqual(miami.point, { x: 1074, y: 207 });
  assert.deepEqual(coverStubRect(miami), { x: 845, y: 215, w: 190, h: 479, rotate: 0 });
  // Every shield the plan draws is the one the map draws at the place's rest.
  chapters.forEach((c) => {
    assert.equal(plan[c.id].shieldZoom, shieldZoomScale(c.zoom));
    assert.ok(Math.abs(plan[c.id].shield.w - SHIELD_MAP_PX * SHIELD_SCALE.current * shieldZoomScale(c.zoom)) < 1e-9);
  });
});

test('"Open story" hangs off its own route: New York\'s goes up into the tab\'s band', () => {
  // The dashed line ran through New York's "OPEN STORY →" (its leg west
  // leaves the shield right under the cue of a cover above-left). The cue
  // keeps a berth of its route as the atlas draws it (open: no leg into 01,
  // none out of 06); where the line runs, it goes to the other free slot.
  const chapters = archiveChapters();
  const css = source('src/styles/global.css');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  for (const [vw, vh] of SCREENS) {
    const camera = cameraFor(vw, vh);
    const plan = planDock(chapters, vw, vh, camera);
    chapters.forEach((c, index) => {
      const e = plan[c.id];
      const plate = plateRect(e.point, c.shield, { w: e.photoW + DOCK.stub, h: e.photoH }, e.quadrant);
      const box = cueBox(plate, e.photoW, e.cue);
      // Inside what the plate carries (the tab's band, the cue's own under
      // it): nothing new on the stage.
      const fit = fitBox(plate, e.tab);
      assert.ok(box.left >= fit.left && box.right <= fit.right && box.top >= fit.top && box.bottom <= fit.bottom, `${vw} ${c.name}`);
      const ends = [index > 0 ? c.route.prev : null, index < chapters.length - 1 ? c.route.next : null].filter(Boolean);
      for (const end of ends) {
        for (let i = 0; i <= 600; i += 1) {
          const p = projectAt(greatCirclePoint(c.coordinates, end, i / 600), e.centre, c.zoom, camera);
          const near = p.x > box.left - CUE.berth && p.x < box.right + CUE.berth && p.y > box.top - CUE.berth && p.y < box.bottom + CUE.berth;
          assert.ok(!near, `${vw} ${c.name}: its route runs through its cue`);
        }
      }
    });
    assert.deepEqual(chapters.map((c) => `${plan[c.id].cue.edge}-${plan[c.id].cue.side}`), ['bottom-left', 'bottom-left', 'bottom-left', 'bottom-left', 'bottom-left', 'top-right'], `${vw}`);
  }
  assert.match(chapter, /data-cue=\{!phone && dockEntry \? `\$\{dockEntry\.cue\.edge\}-\$\{dockEntry\.cue\.side\}` : undefined\}/);
  assert.match(css, /\.archive-dock\[data-cue\$='-left'\] \.archive-plate__cue \{\s*right: auto;\s*left: 0;/);
  assert.match(css, new RegExp(`\\.archive-dock\\[data-cue\\^='top-'\\] \\.archive-plate__cue \\{\\s*top: -${CUE.rise}px;\\s*bottom: auto;`));
  assert.match(css, new RegExp(`\\.archive-plate__cue \\{[^}]*bottom: -${CUE.drop}px;`));
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
  // At 1728 the tickets lie at (695, 215) below-left and (695, 656) above.
  const plan = planDock(chapters, 1728, 1000, cameraFor(1728, 1000));
  const at = (id) => [plan[id].point.x + plan[id].ticket.x, plan[id].point.y + plan[id].ticket.y];
  assert.deepEqual(at(chapters[0].id), [695, 215]);
  assert.deepEqual(at(chapters[4].id), [695, 656]);
  assert.deepEqual(at(chapters[5].id), [695, 656]);
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
    // 先缩小: the whole cover shrinks into its corner and grows back out of
    // it — the stub and the face on one clock (no wipe of one after the
    // other).
    opening.frames.forEach((f) => {
      const [, , bottom, left] = insets(f.clipPath);
      assert.ok(Math.abs(bottom / (plate.h - H) - left / (plate.w - W)) < 0.01, `${q} ${f.clipPath}`);
    });
    // The photograph goes with it: a miniature of the whole cover in the
    // strip (the print scaled to cover the well, centred), never the
    // full-size print's corner. It starts and ends at full size, the fold's
    // last frame is the opening's first, and on every frame the print covers
    // what the clip shows of the face.
    const photo = { w: plate.w - DOCK.stub, h: plate.h };
    const well = { w: W - DOCK.stub, h: H };
    assert.equal(folding.print.length, folding.frames.length);
    assert.equal(folding.print[0].transform, 'translate(0.0px, 0.0px) scale(1.0000)');
    assert.equal(opening.print.at(-1).transform, 'translate(0.0px, 0.0px) scale(1.0000)');
    assert.equal(opening.print[0].transform, folding.print.at(-1).transform);
    assert.equal(folding.print.at(-1).transform, printStyle(form, 0).transform);
    const pose = (tf) => {
      const [, tx, ty, sc] = tf.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/).map(Number);
      return { tx, ty, sc };
    };
    const mini = pose(printStyle(form, 0).transform);
    const s = Math.max(well.w / photo.w, well.h / photo.h);
    assert.ok(Math.abs(mini.sc - s) < 1e-3, 'cover-fit in the well');
    assert.ok(Math.abs(mini.tx + (photo.w * s) / 2 - (photo.w - well.w / 2)) < 0.2, 'centred across the well');
    assert.ok(Math.abs(mini.ty + (photo.h * s) / 2 - well.h / 2) < 0.2, 'centred down the well');
    for (const set of [folding, opening, letGo]) {
      set.frames.forEach((f, i) => {
        const [, , bottom, left] = insets(f.clipPath);
        const p = pose(set.print[i].transform);
        // The face shown: from the clip's left to the perforation, from the
        // top to the clip's foot.
        assert.ok(p.tx <= left + 0.2, `${q}: the print reaches the clip's left edge`);
        assert.ok(p.ty <= 0.2, `${q}: the print reaches the top`);
        assert.ok(p.tx + photo.w * p.sc >= photo.w - 0.2, `${q}: the print reaches the perforation`);
        assert.ok(p.ty + photo.h * p.sc >= photo.h - bottom - 0.2, `${q}: the print reaches the clip's foot`);
      });
    }
  }
});

test('the beats: off the flight\'s own clock, and never before the name is down', () => {
  const turn = bezierFn(EASE.turn);
  const t = switchSchedule(1400, turn);
  assert.equal(t.relayAt, TICKET.foldAt + TICKET.faceMs);
  assert.equal(t.relayAt, 380);
  // The board's retract: FLAP.pause before the relay (the leaving ticket's
  // name keeps its first letters as it folds; the arriving one's cascade
  // starts as it is laid on).
  assert.equal(t.flapAt, t.relayAt - FLAP.pause);
  assert.equal(t.flapAt, 220);
  assert.ok(Math.abs(t.expandAt - 921) <= 2, `turn ${t.expandAt}`);
  assert.equal(t.expandEnd, t.expandAt + 440);
  assert.ok(Math.abs(t.expandEnd - 1361) <= 2);
  assert.equal(t.tipAt, t.expandEnd + TICKET.tipGap);
  assert.ok(t.tipAt + TICKET.tipInMs <= 1610);
  // 到位之后展开封面: the name is down (and read) before the ticket opens —
  // on the 1400 turn MIAMI, PAGE, ZION and ORLANDO within the camera's own
  // 95%, NEW YORK and BRYCE CANYON a little after it.
  const opens = Object.fromEntries(['Miami', 'Orlando', 'Page', 'Zion', 'Bryce Canyon', 'New York'].map((name) => [name, switchSchedule(1400, turn, name).expandAt]));
  for (const [name, expandAt] of Object.entries(opens)) {
    assert.ok(expandAt >= t.flapAt + flapSpan(name) + FLAP.hold, `${name} opens at ${expandAt}, its name down at ${t.flapAt + flapSpan(name)}`);
    assert.ok(expandAt >= t.expandAt);
  }
  assert.ok(Math.abs(opens.Miami - 921) <= 2);
  assert.ok(Math.abs(opens.Orlando - 921) <= 2, `ORLANDO ${opens.Orlando}`);
  assert.equal(opens['Bryce Canyon'], 220 + 919 + FLAP.hold);
  assert.equal(opens['New York'], 220 + 691 + FLAP.hold);
  assert.equal(nameDownAt(100, ''), 0, 'no name: nothing to wait for');
  assert.equal(nameDownAt(100, 'Zion'), 100 + flapSpan('Zion') + FLAP.hold);
  // 然后尖冒出来: the tip is a beat of its own, out of its corner on the
  // house curve — and never past its size (no overshoot in the switch).
  assert.ok(TICKET.tipInMs >= 200 && TICKET.tipInMs <= 260);
  assert.equal(TICKET.tipPop, undefined);
  const pop = tipPopFrames({ arrive: 'A' });
  assert.deepEqual(pop.map((f) => f.transform), ['scale(0)', 'scale(1)']);
  assert.equal(pop[0].easing, 'A');
  assert.ok(TICKET.extrasGap >= 120 && TICKET.extrasGap <= 150);
  assert.equal(t.extrasAt, t.tipAt + TICKET.tipInMs + TICKET.extrasGap);
  assert.equal(t.end, t.extrasAt + TICKET.extrasInMs);
  assert.deepEqual(afterOpening(t.expandAt), { expandAt: t.expandAt, expandEnd: t.expandEnd, tipAt: t.tipAt, extrasAt: t.extrasAt, end: t.end });
  // The relay is a cross-fade of the two pictures, then the cut: no dark
  // tile in between.
  assert.ok(TICKET.dissolveMs > 0 && TICKET.dissolveMs <= 200);
  assert.equal(TICKET_FOLD_MS, TICKET.faceMs);
  // 到位之后展开: the camera has made 95% of its move.
  assert.ok(Math.abs(turn(t.expandAt / 1400) - TICKET.landShare) < 0.01);
  assert.ok(Math.abs(switchSchedule(2000, voyageEase).expandAt - 1713) <= 2);
  for (let land = 860; land <= 2600; land += 20) {
    for (const ease of [turn, voyageEase]) {
      const s = switchSchedule(land, ease, 'Bryce Canyon');
      assert.ok(s.expandAt - s.relayAt >= TICKET.transitMinMs, `${land}`);
      assert.ok(s.expandAt >= s.flapAt + flapSpan('Bryce Canyon') + FLAP.hold);
    }
  }
  assert.ok(Math.abs(easeInverse((x) => x, 0.3) - 0.3) < 1e-9);
  // The tip comes out last, the extras with it: nothing hangs off a ticket.
  assert.ok(TICKET.tipOutMs <= 120 && TICKET.extrasOutMs <= 120);
  assert.equal(TICKET.leanPx, 0);
});

test('the glide: one straight run to a new corner on the camera\'s own clock, a share of the ground\'s pace', () => {
  // 封面的移动动效可以继续优化: the ticket lies still on the screen as the
  // reference's board does while the planet turns under it; to a new corner
  // it glides there once — from the click, on the flight's own curve, in a
  // straight line, there by the opening — so at every frame it moves a fixed
  // share of the ground's pace (the seats lie nearer than the ground runs),
  // never faster, never sideways, nothing past its seat and back.
  const chapters = archiveChapters();
  const turn = bezierFn(EASE.turn);
  for (const [vw, vh] of SCREENS) {
    const camera = cameraFor(vw, vh);
    const plan = planDock(chapters, vw, vh, camera);
    const n = chapters.length;
    for (let i = 0; i < n; i += 1) {
      for (const j of [(i + 1) % n, (i - 1 + n) % n]) {
        const a = plan[chapters[i].id];
        const b = plan[chapters[j].id];
        const from = { x: a.point.x + a.ticket.x, y: a.point.y + a.ticket.y };
        const to = { x: b.point.x + b.ticket.x, y: b.point.y + b.ticket.y };
        const seat = Math.hypot(to.x - from.x, to.y - from.y);
        if (a.quadrant === b.quadrant) {
          // One corner: the ticket does not move at all.
          assert.ok(seat <= (a.quadrant === 'bl' ? 0 : 4), `${vw}: ${chapters[i].name} → ${chapters[j].name} ${seat}`);
          continue;
        }
        // The ground: the place gone to, from where it stands at the place
        // left's rest to its own point.
        const start = projectAt(chapters[j].coordinates, a.centre, chapters[i].zoom, camera);
        const ground = Math.hypot(b.point.x - start.x, b.point.y - start.y);
        for (const [D, ease] of [[1400, turn], [1400, voyageEase], [2000, voyageEase]]) {
          const s = switchSchedule(D, ease, chapters[j].name);
          const g = ticketGlide(from, to, s.expandAt, ease, D);
          assert.deepEqual(g(0), from, 'from where it lay, at the click');
          assert.deepEqual(g(s.expandAt), to, 'there by the opening');
          assert.deepEqual(g(D + 100), to);
          let prev = from;
          for (let t = 1; t <= s.expandAt; t += 1) {
            const p = g(t);
            const step = Math.hypot(p.x - prev.x, p.y - prev.y);
            const groundStep = ground * (ease(t / D) - ease((t - 1) / D));
            assert.ok(step <= groundStep + 1e-6, `${vw} ${chapters[i].name} → ${chapters[j].name} (${D}): ${step.toFixed(3)} px/ms against the ground's ${groundStep.toFixed(3)} at ${t}`);
            // On the straight run between the two seats, one way only.
            const across = Math.abs((p.x - from.x) * (to.y - from.y) - (p.y - from.y) * (to.x - from.x)) / seat;
            assert.ok(across < 1e-6, 'never sideways');
            assert.ok((p.x - prev.x) * (to.x - from.x) + (p.y - prev.y) * (to.y - from.y) >= -1e-9, 'never back');
            prev = p;
          }
        }
      }
    }
  }
  // Zion → Bryce Canyon at 1728: 441 px down, against the 687 px or so the
  // ground runs.
  const plan = planDock(chapters, 1728, 1000, cameraFor(1728, 1000));
  const zion = plan[chapters[3].id];
  const bryce = plan[chapters[4].id];
  assert.deepEqual([zion.point.x + zion.ticket.x, zion.point.y + zion.ticket.y, bryce.point.x + bryce.ticket.x, bryce.point.y + bryce.ticket.y], [695, 215, 695, 656]);
  // With nowhere to go it lies still.
  const still = ticketGlide({ x: 9, y: 9 }, { x: 9, y: 9 }, 921, voyageEase, 1400);
  assert.deepEqual(still(700), { x: 9, y: 9 });
  // The share is the camera's own clock up to the opening.
  const share = glideShare(900, turn, 1400);
  assert.equal(share(0), 0);
  assert.equal(share(900), 1);
  assert.ok(Math.abs(share(450) - turn(450 / 1400) / turn(900 / 1400)) < 1e-12);
});

test('a ticket in transit steps aside for nothing: every shield passes under it', () => {
  // The give-way (a ticket stepping up to 170 px across a shield's way, New
  // York → Miami) is gone: the ticket lies still over the turning ground, as
  // the reference's board does, and the shields — the place in hand's own
  // too — pass under the covers' dock.
  const lib = source('src/lib/coverDock.ts');
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const css = source('src/styles/global.css');
  for (const gone of ['giveWay', 'stepBack', 'yieldAxis', 'GIVE_WAY', 'rideAt', 'Yield', 'shields-over', 'leanFrom', 'smoothstep01']) {
    assert.doesNotMatch(lib + atlas + css, new RegExp(`\\b${gone}\\b`), gone);
  }
  assert.match(atlas, /pose\.marker\.style\.zIndex = String\(z\);/);
  assert.match(css, /\.archive-dock-host--atlas \{\s*z-index: 25;\s*\}/);
  // The glide is read off nothing on the ground: screen-anchored.
  assert.match(atlas, /const glideRef = useRef<\{\s*at: \(now: number\) => Point;\s*until: number;\s*\} \| null>\(null\);/);
  assert.match(atlas, /const glide = lies && seatTo \? ticketGlide\(lies, seatTo, expand - now, easing, durationMs\) : null;/);
  // A new choice mid-way takes it up from where it lies.
  assert.match(atlas, /const lies = held\s+\? held\.at\(now\)/);
});

test('a cover riding its shield keeps its joint\'s gap at every zoom', () => {
  // The shields grow with the zoom (SHIELD_ZOOM); the plan sets the cover a
  // joint's gap off its shield as drawn at the rest. Zoomed out (or in) with
  // the place in hand, the cover's corner keeps that gap to the shield as
  // drawn then, so the tip still meets it.
  const shield = { w: 60, h: 64 };
  const box = (point, s) => ({ left: point.x - s.w / 2, top: point.y - s.h, right: point.x + s.w / 2, bottom: point.y });
  for (const quadrant of QUADRANTS) {
    const entry = { quadrant, shield, shieldZoom: 1.3 };
    assert.deepEqual(shieldShift(entry, 1.3), { x: 0, y: 0 }, 'nought at its rest');
    for (const scale of [1, 1.1, 1.2, 1.35]) {
      const k = scale / 1.3;
      const drawn = { w: shield.w * k, h: shield.h * k };
      const foot = { x: 500, y: 500 };
      const shift = shieldShift(entry, scale);
      const plate = plateRect({ x: foot.x + shift.x, y: foot.y + shift.y }, shield, { w: 400, h: 300 }, quadrant);
      const s = box(foot, drawn);
      const gapX = quadrant[1] === 'l' ? s.left - plate.right : plate.left - s.right;
      const gapY = quadrant[0] === 'b' ? plate.top - foot.y : s.top - plate.bottom;
      assert.ok(Math.abs(gapX - DOCK.gap) <= 0.5, `${quadrant} ${scale}: across ${gapX}`);
      assert.ok(Math.abs(gapY - DOCK.gap) <= 0.5, `${quadrant} ${scale}: down ${gapY}`);
    }
  }
  assert.deepEqual(shieldShift({ quadrant: 'bl', shield, shieldZoom: 1.3 }, undefined), { x: 0, y: 0 });
  // Wiring: the atlas publishes the scale and writes the cover in hand's
  // foot with the shift; the chapter writes its own foot with it.
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  assert.match(atlas, /coverDock\.publish\(\{ at, points, switch: sw, pin, pins, arrive, shieldZoom: quantised \}\);/);
  assert.match(atlas, /const shift = shieldShift\(entry, quantised\);/);
  assert.match(atlas, /written = pin \?\? \(at \? footOf\(at\) : null\);/);
  assert.match(chapter, /const shift = entry \? shieldShift\(entry, frame\.shieldZoom\) : null;/);
  // The cover's room beside its shield is the largest shield the plan draws.
  assert.deepEqual(SHIELD_ROOM, { w: 48, h: 56 });
});

test('a press on a shield in flight is its click, never the reader taking the map', () => {
  // Review, 2026-09-29: the destination's own shield clicked again from the
  // relay on — Mapbox ended the flight on the press (its pan goes active on
  // mousedown), the reader's hand (`land(false)`) pulled the opening in to
  // that instant, and the click's own choice found it "already opening":
  // the tip popped with a second of flight to run.
  const atlas = source('src/components/home/RouteAtlas.tsx');
  assert.match(atlas, /const pressTarget = map\.getCanvasContainer\(\);/);
  assert.match(atlas, /const holdShieldPress = \(event: Event\) => \{\s*if \(!flying \|\| flying\.kind === 'home'\) return;\s*if \(\(event\.target as Element \| null\)\?\.closest\?\.\('\.place-shield__sign'\)\) event\.stopPropagation\(\);\s*\};/);
  assert.match(atlas, /pressTarget\.addEventListener\('mousedown', holdShieldPress, true\);/);
  assert.match(atlas, /pressTarget\.addEventListener\('touchstart', holdShieldPress, \{ capture: true, passive: true \}\);/);
  assert.match(atlas, /pressTarget\.removeEventListener\('mousedown', holdShieldPress, true\);/);
  assert.match(atlas, /pressTarget\.removeEventListener\('touchstart', holdShieldPress, true\);/);
  // The reader's own press on the map (not a shield) still takes it.
  assert.match(atlas, /if \(!arrived\) retimeOnTake\(\);/);
  // Mapbox's pan still goes active on the press itself (why it must not
  // reach it).
  // Resolved as Node would (a worktree may take its packages from a parent).
  const mapboxDir = createRequire(import.meta.url).resolve('mapbox-gl/package.json').replace(/package\.json$/, '');
  const mapbox = readFileSync(`${mapboxDir}dist/mapbox-gl-dev.js`, 'utf8');
  assert.match(mapbox, /class MousePanHandler extends MouseHandler \{\s*mousedown\(e, point\) \{\s*super\.mousedown\(e, point\);\s*if \(this\._lastPoint\) this\._active = true;/);
});

test('a switch keeps the ticket where it lies: its own pin for each cover, the relay a cut, nothing re-placed per frame', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const css = source('src/styles/global.css');
  // Through a switch the cover is carried: asked for from take-off.
  assert.match(atlas, /return flying\.carry && id === held \? \{ id, appear: true, stay: true \} : null;/);
  // Each cover is written at its own pin, else the pin, else its foot (a
  // joint's gap off its shield as drawn: `shieldShift`); only a changed
  // point is written.
  assert.match(chapter, /let point = frame\.pins\?\.\[me\] \?\? \(frame\.pin && \(at \|\| out\) \? frame\.pin : null\);/);
  assert.match(chapter, /const foot = frame\.points\[me\];/);
  assert.match(chapter, /if \(!point \|\| \(point\.x === lastX && point\.y === lastY\)\) return;/);
  // Both tickets on one point: the carrier's pin is the arriving one's,
  // moved by the difference of their seats.
  assert.match(atlas, /pins\[sw\.from\] = \{ x: written\.x \+ planned\.ticket\.x - carrier\.ticket\.x, y: written\.y \+ planned\.ticket\.y - carrier\.ticket\.y \};/);
  // The arriving cover is held hidden in its ticket form from the click, set
  // in the frame's own task (before any paint)…
  const switchIn = chapter.slice(chapter.indexOf('const switchIn = ('), chapter.indexOf('const retimeIn = ('));
  assert.match(switchIn, /dock\.setAttribute\('data-ticket', sw\.mode === 'lay' \? '' : 'wait'\);/);
  assert.match(chapter, /const off = coverDock\.subscribe\(\(frame\) => \{[\s\S]*onSwitchRef\.current\(sw, at, frame\.at\);[\s\S]*onBeatRef\.current\(sw, now\);/);
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
  assert.match(atlas, /\[sw\.relayAt, sw\.cutAt, sw\.expandAt, sw\.tipAt, sw\.extrasAt\]\.forEach\(\(t\) => \{/);
  assert.match(atlas, /const beats = sw \? \[sw\.relayAt, sw\.cutAt, sw\.expandAt, sw\.tipAt, sw\.extrasAt\]\.filter\(\(t\) => now >= t\)\.length : 0;/);
  // A resize moves every point with the camera standing still: the layout
  // and the plan's revision are in the publish's key.
  assert.match(atlas, /const key = `\$\{cameraKey\(map\)\}\|\$\{size\.width\}x\$\{size\.height\}\|\$\{pointsKey\}\|/);
  assert.match(atlas, /\$\{plan \? planRevRef\.current : 0\}/);
  // Paint and composite only: a clip, a translate, a scale, colours, a mask.
  const plays = chapter.slice(chapter.indexOf('// ── The switch, the arrival, the let-go'), chapter.indexOf('// ── The stub hand-off (src/lib/explorer.ts)'));
  assert.ok(plays.length > 2000);
  assert.doesNotMatch(plays, /getBoundingClientRect|offset(Width|Height|Top|Left)|client(Width|Height)|style\.(width|left|top) =/);
  // The only reads: a ticket in transit's colour and (the phone) its
  // transform, once each, at a 'lay' relay.
  assert.equal((plays.match(/getComputedStyle\(/g) ?? []).length, 2);
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
  // In transit: laid on at once, its picture dissolving in, then the cut.
  assert.match(pick, /mode = 'lay';\s+relayAt = now;\s+cutAt = now \+ TICKET\.dissolveMs;/);
  assert.match(pick, /let cutAt = relayAt \+ TICKET\.dissolveMs;/);
  // Opening: folds back over the share it had opened.
  assert.match(pick, /mode = 'back';[\s\S]*relayAt = now \+ Math\.max\(TICKET\.foldBackMinMs, Math\.round\(TICKET_FOLD_MS \* open\)\);/);
  // The chapter's parts: the one given up before its relay goes unseen…
  const onSwitch = chapter.slice(chapter.indexOf('const onSwitch = ('), chapter.indexOf('const onBeat = ('));
  assert.match(onSwitch, /if \(!play\.relayed && play\.mode !== 'self'\) cutUnseen\(\);/);
  // …a carrier a newer switch has dropped before its cut goes at once,
  // unseen under the ticket laid over it (it lingered and faded where it
  // lay: three tickets at once on rapid presses)…
  assert.match(onSwitch, /\} else if \(play\.cut\) settlePlay\(\);[\s\S]*else if \(sw \|\| held\) cutUnseen\(\);/);
  assert.match(chapter, /const cutUnseen = \(\) => \{\s+const dock = dockRef\.current;\s+dock\?\.setAttribute\('data-cut', ''\);\s+dock\?\.removeAttribute\('data-leaving'\);/);
  // …the carrier still folding carries on; a ticket in transit holds (its
  // own picture whole at once, over the one going from under it); a cover
  // opening folds back from where it is.
  assert.match(onSwitch, /if \(play\?\.kind === 'switch' && play\.role === 'out'\) \{\s+play\.key = sw\.key;\s+play\.cutAt = sw\.cutAt;\s+if \(!play\.cut && !reduce && phone\) phoneCarry\(play, sw\.toRatio,/);
  const out = chapter.slice(chapter.indexOf('const switchOut = ('), chapter.indexOf('const switchSelf = ('));
  assert.match(out, /if \(sw\.mode === 'lay'\) \{[\s\S]*was\.dissolve\?\.finish\(\);[\s\S]*holdNow\(anim\)/);
  assert.match(chapter, /const holdNow = \(anim: Animation\) => \{\s+const at = anim\.currentTime;\s+anim\.pause\(\);\s+if \(at != null\) anim\.currentTime = at;/);
  assert.match(out, /foldPlate\(was, form, now, 'fold', ms\);/);
  assert.match(chapter, /openingPlate\.commitStyles\(\);/);
  // Turned back to itself and away again before its relay (A → B → A → C,
  // a key held down): it never stopped folding — it carries on the same
  // fold (no restart from whole, no cut of a whole plate).
  assert.match(out, /if \(was\?\.kind === 'switch' && was\.mode === 'self' && !was\.relayed\) \{[\s\S]*Object\.assign\(was, \{ key: sw\.key, role: 'out', mode: 'fold', cut: false, cutAt: sw\.cutAt \}\);[\s\S]*retractTip\(was, now\);[\s\S]*return;\s+\}\s+if \(sw\.mode === 'fold' \|\| !was\) \{/);
  // The cover just left, chosen back after its cut: nothing of the cut
  // outlives it (a later let-go folds and fades, never vanishes).
  const switchIn = chapter.slice(chapter.indexOf('const switchIn = ('), chapter.indexOf('const retimeIn = ('));
  assert.match(switchIn, /dock\.removeAttribute\('data-cut'\);/);
  assert.match(chapter, /if \(at\) \{\s+hold = false;[\s\S]{0,300}dock\.removeAttribute\('data-cut'\);\s+dock\.setAttribute\('data-at', ''\);/);
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
  // The desktop's dock is a layer of the atlas's own, over every shield (a
  // ticket in transit lies still over the turning ground); the phone's is
  // the page's.
  assert.match(home, /onDockHost=\{desktopLayout \? setDockHost : undefined\}/);
  assert.match(atlas, /\{!mobile && onDockHost && <div ref=\{onDockHost\} className="archive-dock-host archive-dock-host--atlas" \/>\}/);
  assert.match(home, /<div ref=\{setDockHost\} className="archive-dock-host archive-dock-host--phone" data-let-go=\{letGo \? '' : undefined\} \/>/);
  assert.match(css, /\.archive-dock-host--atlas \{\s*z-index: 25;\s*\}/);
  assert.match(atlas, /pose\.marker\.style\.zIndex = String\(z\);/);
  assert.match(atlas, /atlasEl\.setAttribute\('data-ticket-transit', ''\)/);
  assert.match(atlas, /const ticketing = \(!!sw && now < sw\.expandAt\) \|\| \(!!arrive && now >= arrive\.inkAt && now < arrive\.expandAt\);/);
  // The place in hand's rail shows with its cover (the dock's frame).
  assert.match(home, /coverDock\.subscribe\(\(frame\) => \{/);
  assert.match(home, /railShown=\{dockAt === city\._id\}/);
  assert.doesNotMatch(closing, /archive:onward/);
  // It appears whole (no transition in) and fades out on the fade curve as
  // its fold ends.
  assert.match(css, /\.archive-dock\[data-at\] \{\s*opacity: 1;\s*visibility: visible;\s*transition: none;/);
  assert.match(css, /\.archive-dock \{[^}]*transition: opacity var\(--dur-swap\) var\(--ease-fade\) 200ms, visibility 0s linear 520ms;/);
  // It recedes under a story with the map it is on.
  assert.match(css, /main\[data-story-under="true"\] \.archive-dock-host:not\(\.archive-dock-host--atlas\) \{/);
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
  assert.match(css, /\.archive-plate__caret\[data-half='stub'\] \{\s*color: var\(--stub-paper/);
  // Its two outer sides carry a hairline of the sign's own enamel rule, so it
  // reads on any ground (Bryce Canyon's brown tip was lost on the brown
  // desert): the element is the rule's colour cut to the tip, the card's
  // stock (its `color`) the tip cut 1 px inside the two outer sides — the
  // plate's own edges keep no line.
  const rule = css.match(/\.archive-ticket-sign \{[^}]*box-shadow: inset 0 0 0 1\.5px (rgba\([^)]+\));/)[1];
  assert.match(css, new RegExp(`\\.archive-plate__caret \\{[^}]*background: ${rule.replace(/[()]/g, '\\$&')};\\s*color: #0f120d;`));
  assert.match(css, /\.archive-plate__caret::before \{\s*content: '';\s*position: absolute;\s*inset: 0;\s*background: currentColor;/);
  const inner = { bl: '8px 13.76px, 8px 8px, 2.24px 8px, 13.76px 2.24px', tl: '8px 2.24px, 8px 8px, 2.24px 8px, 13.76px 13.76px', br: '8px 13.76px, 8px 8px, 13.76px 8px, 2.24px 2.24px', tr: '8px 2.24px, 8px 8px, 13.76px 8px, 2.24px 13.76px' };
  for (const quadrant of QUADRANTS) {
    assert.ok(css.includes(`.archive-dock[data-quadrant='${quadrant}'] .archive-plate__caret::before {\n  clip-path: polygon(${inner[quadrant]});`), quadrant);
  }
  // The inner cut is the tip's two outer sides moved in by 1 px (the rule),
  // meeting the plate's edges: derived for below-left, mirrored for the rest.
  {
    const e1 = { a: { x: 0, y: 8 }, b: { x: 16, y: 0 } };
    const e2 = { a: { x: 16, y: 0 }, b: { x: 8, y: 16 } };
    const inward = (e, towards) => {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, l = Math.hypot(dx, dy);
      let n = { x: -dy / l, y: dx / l };
      const m = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
      if ((towards.x - m.x) * n.x + (towards.y - m.y) * n.y < 0) n = { x: -n.x, y: -n.y };
      return { a: { x: e.a.x + n.x, y: e.a.y + n.y }, b: { x: e.b.x + n.x, y: e.b.y + n.y } };
    };
    const i1 = inward(e1, { x: 8, y: 8 });
    const i2 = inward(e2, { x: 8, y: 8 });
    const at = (e, k) => ({ x: e.a.x + (e.b.x - e.a.x) * k, y: e.a.y + (e.b.y - e.a.y) * k });
    const onY8 = at(i1, (8 - i1.a.y) / (i1.b.y - i1.a.y));
    const onX8 = at(i2, (8 - i2.a.x) / (i2.b.x - i2.a.x));
    const d = (i1.b.x - i1.a.x) * (i2.b.y - i2.a.y) - (i1.b.y - i1.a.y) * (i2.b.x - i2.a.x);
    const k = ((i2.a.x - i1.a.x) * (i2.b.y - i2.a.y) - (i2.a.y - i1.a.y) * (i2.b.x - i2.a.x)) / d;
    const tip = at(i1, k);
    const r = (n) => Number(n.toFixed(2));
    assert.deepEqual([r(onX8.y), r(onY8.x), r(tip.x), r(tip.y)], [13.76, 2.24, 13.76, 2.24]);
  }
  // The tip reads at 1728 (a 4 px nub on the map did not): a 16 px box cut
  // 8 px into the plate, 8 px out each way — the gap's own depth, at 45°.
  assert.match(css, /\.archive-plate__caret \{\s*position: absolute;\s*z-index: 2;\s*width: 16px;\s*height: 16px;/);
  const tip = /\.archive-dock\[data-quadrant='tr'\] \.archive-plate__caret \{\s*left: -8px;/;
  assert.match(css, tip);
  // It comes out of the plate's corner itself: scaled about the point where
  // it meets the plate, per corner.
  const origin = { tr: '8px 8px', tl: '8px 8px', br: '8px 8px', bl: '8px 8px' };
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
  // 更醒目: 16px caps in a 26px rule on a 34px tab (it was 13 in 20: no
  // bigger than the Fraunces 14 it replaced).
  assert.match(rule, /font-size: 16px;/);
  assert.match(rule, /height: 26px;/);
  assert.match(rule, /font-weight: 700;/);
  assert.match(rule, /text-transform: uppercase;/);
  assert.ok(Number(rule.match(/letter-spacing: ([\d.]+)em/)[1]) <= 0.1);
  assert.match(rule, /box-shadow: inset 0 0 0 1\.5px rgba\(244, 244, 237, 0\.86\);/);
  const tabCss = css.slice(css.indexOf('\n.archive-dock__tab {'), css.indexOf('/* The chapter\'s rail'));
  assert.doesNotMatch(tabCss, /d2ff00|210,\s*255,\s*0/i);
  assert.match(css, /\.archive-dock__tab \{[^}]*height: 34px;/);
  assert.equal(DOCK.tab, 34);
  assert.equal(DOCK.below, 36);
  assert.match(chapter, /<div className="archive-dock__tab font-ui" data-side=\{phone \? 'left' : side\} aria-hidden="true">/);
  assert.match(chapter, /<span className="archive-dock__tab-state"><Bi en=\{stateTab\.state\} zh=\{stateTab\.stateZh\} \/><\/span>/);
  assert.doesNotMatch(css, /archive-dock__tab-region/);
  // No strips under the cover: the pad is gone everywhere, and the old
  // switch's outline, mat polygon, unroll and fold with it.
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  const src = walk(new URL('../src', import.meta.url).pathname).filter((f) => /\.(tsx?|css|astro)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const gone of ['archive-ticket-pad', 'padStocks', 'chapterPadStocks', 'SWITCH_COVER', 'switchClip', 'matPolygon', 'arrivalClipFrames', 'foldClip', 'DOCK_QUADRANT', 'arrivalDelay', 'regionTab', 'archive-photo-frame__mat', 'developStrip', 'developSweep', 'printToMat', 'retargetMatMs']) {
    assert.doesNotMatch(src, new RegExp(`\\b${gone}\\b`), gone);
  }
});

test('票根上已经有region了，只出现一处: the state once, boxed on the tab; every stub\'s tear has its guide', () => {
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const css = source('src/styles/global.css');
  const entrance = source('src/styles/entrance.css');
  // The stub prints no REGION row: the state is on the cover once, on its tab.
  const start = chapter.indexOf('const stubRows = useMemo(() => {');
  const rows = chapter.slice(start, chapter.indexOf('}, [collection]);', start));
  assert.ok(rows.length > 100);
  assert.doesNotMatch(rows, /'Region'|collection\.region/);
  assert.match(rows, /rows\.push\(\{ label: 'chapter\.stub\.frames'/);
  assert.match(chapter, /<span className="archive-dock__tab-state"><Bi en=\{stateTab\.state\} zh=\{stateTab\.stateZh\} \/><\/span>/);
  // 所有票根的撕口处做一个下划线指引: a hairline in the stub's own ink down its
  // perforation (6 px in from the holes, a dash between every two), from
  // under the top notch to above the bottom one, quiet on every stock,
  // brighter while pointed at; the rip takes it as it runs. No lime.
  const guide = css.match(/\.archive-ticket-stub::after \{([^}]*)\}/)[1];
  assert.match(guide, /left: 6px;/);
  assert.match(guide, /width: 1px;/);
  assert.match(guide, /repeating-linear-gradient\(180deg, currentColor 0 2px, transparent 2px 6px, currentColor 6px 8px\)/);
  assert.match(guide, /clip-path: inset\(max\(12px, var\(--ticket-torn, 0px\)\) 0 12px 0\);/);
  assert.ok(Number(guide.match(/opacity: ([\d.]+);/)[1]) <= 0.5, 'quiet');
  assert.match(css, /\.archive-dock__cover:is\(:hover, :focus-visible\) \.archive-ticket-stub::after \{\s*opacity: 0\.78;/);
  assert.match(css, /\.archive-ticket-stub \{[^}]*color: var\(--stub-ink\);/, 'its own ink');
  // The dashes fall between the holes: the holes every --ticket-pitch (8 px)
  // from half a pitch down; the dashes on the pitch itself.
  assert.match(css, /--ticket-pitch: 8px;/);
  // The rip's own clock writes --ticket-torn on the stub (the guide goes
  // with the paper it guided).
  assert.match(chapter, /put\(stub, '--ticket-torn', tornPx\);/);
  // The boarding pass's stub: the same guide in the pass's ink, from under
  // its band; taken by its rip (--bp-torn).
  const pass = entrance.match(/\.bp-stub::after \{([^}]*)\}/)[1];
  assert.match(pass, /repeating-linear-gradient\(180deg, currentColor 0 1px, transparent 1px 5px, currentColor 5px 6px\)/);
  assert.match(pass, /clip-path: inset\(max\(calc\(var\(--bp-band-h\) \+ 4px\), var\(--bp-torn, 0px\)\) 0 calc\(var\(--bp-notch\) \+ 4px\) 0\);/);
  assert.match(entrance, /--bp-pitch: 6px;/);
  assert.match(entrance, /\.bp-seat:has\(> \.bp-tear:is\(:hover, :focus-visible\)\) \.bp-stub::after \{\s*opacity: 0\.72;/);
  for (const block of [guide, pass]) assert.doesNotMatch(block, /d2ff00|210,\s*255,\s*0/i);
});

test('a resize mid-switch resumes the switch on the new layout', () => {
  // 1728 → 1280 mid Zion → Bryce Canyon: the camera's run was torn down with
  // the old layout and the flight ended as the reader's hand — Bryce left
  // off the screen, and let go. A flight between places torn down by a new
  // layout is asked again of the next run (the same token), from the live
  // camera.
  const atlas = source('src/components/home/RouteAtlas.tsx');
  assert.match(atlas, /relayoutAtRef\.current = performance\.now\(\);\s+cancelAnimationFrame\(frame\);/);
  assert.match(atlas, /if \(performance\.now\(\) - relayoutAtRef\.current < RELAYOUT_MS && done\.kind === 'fly' && flightRef\.current\?\.token === done\.token\) answeredFlightRef\.current = null;\s+else onArriveRef\.current\?\.\(done\.token, false\);/);
  assert.match(atlas, /const pending = flightRef\.current;\s+if \(pending && pending\.token !== answeredFlightRef\.current\) \{/);
});

test('a portrait cover keeps most of the height it had in the column', () => {
  // In the column a portrait cover stood 780px on the owner's screen; at
  // 0.64 of the stage it had 531 (46% of its area).
  const stage = stageBox(1728, 1000);
  // (Beside the place in hand's shield as drawn at a rest: 1.4 × 1.3 × 34,
  // Florida's the tallest form.)
  const shield = { w: SHIELD_MAP_PX * SHIELD_SCALE.current * shieldZoomScale(5.05) };
  shield.h = (shield.w * 108) / 100;
  const portrait = coverSize(2 / 3, stage, shield);
  const landscape = coverSize(1.5, stage, shield);
  assert.ok(portrait.photoH >= 640, `portrait ${portrait.photoW}×${portrait.photoH}`);
  assert.ok(landscape.photoW >= 700, `landscape ${landscape.photoW}×${landscape.photoH}`);
  // Still whole on the stage at every corner (the plan test holds the rest).
  assert.ok(portrait.photoH + DOCK.tab + DOCK.below + DOCK.gap + shield.h <= stage.bottom - stage.top);
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
