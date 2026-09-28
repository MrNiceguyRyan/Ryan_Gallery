// Run offline: node --experimental-strip-types --test scripts/cover-dock.test.mjs
//
// The cover rides with its shield (src/lib/coverDock.ts): owner, 2026-09-28,
// 封面可以跟随路牌一起走，出现在路牌的右上角或者左上角或者右下角或者左下角. On the
// desktop a chapter's ticket lies on the atlas beside its place's shield, at
// one of the shield's four corners, a joint's gap off it; the corner is
// chosen per stop from geometry (the cover whole on the stage, clear of the
// chapter's rail and of the other shields, a different corner from the last
// stop's where there is a choice), and the camera sets each place where its
// cover fits. Pinned here on the archive as Sanity serves it (a fixture).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DOCK,
  DOCK_GATE,
  QUADRANT_ORDER,
  RAIL,
  askDock,
  awaySide,
  centreFor,
  coverDock,
  coverRatioOf,
  coverSize,
  dockShown,
  fitBox,
  placeAt,
  planDock,
  plateRect,
  poseRemainPx,
  projectAt,
  railBox,
  restLean,
  stageBox,
} from '../src/lib/coverDock.ts';
import { TEAR_HARD_LINE, TEAR_LINE_DOCKED, TEAR_LINE_MAX, TEAR_LINE_MIN } from '../src/lib/ticketLatch.ts';
import { activeChapters, chapterSections, issueChapters } from '../src/lib/chapterOrder.ts';
import { chapterPoint } from '../src/lib/geo.ts';
import { SHIELD_MAP_PX, SHIELD_SCALE, shieldForm, stateCode } from '../src/lib/routeShield.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { collections } = JSON.parse(readFileSync(new URL('./fixtures/archive-2026-09-27.json', import.meta.url), 'utf8'));

const SCREENS = [[1728, 1000], [1280, 800], [1440, 900], [1920, 1080], [1024, 768]];
const inside = (box, stage) => box.left >= stage.left - 0.5 && box.right <= stage.right + 0.5 && box.top >= stage.top - 0.5 && box.bottom <= stage.bottom + 0.5;
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const shieldBox = (point, shield) => ({ left: point.x - shield.w / 2, top: point.y - shield.h, right: point.x + shield.w / 2, bottom: point.y });

// The atlas's chapter camera as RouteAtlas derives it (the atlas 78% of the
// page, its focal point 264px in from its right edge, on the reading line;
// the canvas a 32px bleed past the viewport each side).
const cameraFor = (vw, vh) => ({ focal: { x: (0.78 * vw - 264) / 2, y: 0.48 * vh }, pitch: 46, bearing: -2, distance: 1.5 * (vh + 64) });

// The archive as the homepage reads it, with each chapter's rest zoom
// (RouteAtlas hopRestZooms: neighbours ≥150px apart, 5.05 to 5.98).
function archiveChapters() {
  const sections = chapterSections(issueChapters(activeChapters(collections)));
  const cities = sections.flatMap((section) => section.cities);
  const tabs = new Set(sections.filter((s) => s.showHeader && s.region).map((s) => s.cities[0]._id));
  const places = cities.map((city) => ({ city, coords: chapterPoint(city) }));
  const my = (lat) => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const px = (a, b, z) => (Math.hypot(b[0] - a[0], my(b[1]) - my(a[1])) * 512 * 2 ** z) / 360;
  const shieldOf = (region, scale) => {
    const w = SHIELD_MAP_PX * scale;
    return { w, h: (w * shieldForm(stateCode(region)).h) / 100 };
  };
  return places.map(({ city, coords }, index) => {
    let nearest = Infinity;
    places.forEach((other, j) => { if (j !== index) nearest = Math.min(nearest, px(coords, other.coords, 5.05)); });
    const zoom = Math.max(5.05, Math.min(5.98, 5.05 + Math.log2(150 / nearest)));
    return {
      id: city._id,
      name: city.name,
      coordinates: coords,
      zoom,
      ratio: coverRatioOf(city.coverImageUrl ?? city.photos?.[0]?.imageUrl) ?? 1.5,
      tab: tabs.has(city._id),
      shield: shieldOf(city.region, SHIELD_SCALE.current),
      neighbours: places.filter((_, j) => j !== index).map((other, k) => ({
        coordinates: other.coords,
        ...shieldOf(other.city.region, SHIELD_SCALE.ahead),
      })),
    };
  });
}

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
  for (const quadrant of QUADRANT_ORDER) {
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
      for (const quadrant of QUADRANT_ORDER) {
        for (const tab of [false, true]) {
          const shield = { w: 40.8, h: 44 };
          const { point, overflow } = placeAt(stage, shield, size, quadrant, tab);
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

test('the archive\'s plan: every cover whole on the stage, off the rail and the other shields, round the four corners', () => {
  const chapters = archiveChapters();
  assert.deepEqual(chapters.map((c) => c.name), ['Miami', 'Orlando', 'Page', 'Zion', 'Bryce Canyon', 'New York']);
  assert.deepEqual(chapters.map((c) => c.tab), [true, false, false, true, false, false], 'the region line rides on its region\'s first cover');
  for (const [vw, vh] of SCREENS) {
    const camera = cameraFor(vw, vh);
    const stage = stageBox(vw, vh);
    const rail = railBox(vw);
    const plan = planDock(chapters, vw, vh, camera);
    const quadrants = chapters.map((c) => plan[c.id].quadrant);
    chapters.forEach((chapter, index) => {
      const entry = plan[chapter.id];
      const size = { w: entry.photoW + DOCK.stub, h: entry.photoH };
      const plate = plateRect(entry.point, chapter.shield, size, entry.quadrant);
      const fit = fitBox(plate, entry.tab);
      assert.equal(entry.overflow, 0, `${vw}: ${chapter.name} fits`);
      assert.ok(inside(fit, stage), `${vw}: ${chapter.name} on the stage`);
      assert.ok(fit.right < rail.left, `${vw}: ${chapter.name} clear of its rail`);
      assert.ok(inside(shieldBox(entry.point, chapter.shield), stage), `${vw}: ${chapter.name}'s shield on the stage`);
      assert.equal(entry.covered, 0, `${vw}: ${chapter.name} hides no other shield`);
      // The plate's offset from the foot is its rect from a foot at 0.
      assert.equal(entry.offset.x, Math.round(plate.left - entry.point.x));
      assert.equal(entry.offset.y, Math.round(plate.top - entry.point.y));
      // The camera's centre for it puts the place on its point.
      const back = projectAt(chapter.coordinates, entry.centre, chapter.zoom, camera);
      assert.ok(Math.hypot(back.x - entry.point.x, back.y - entry.point.y) < 0.5);
      if (index > 0) assert.notEqual(entry.quadrant, quadrants[index - 1], `${vw}: ${chapter.name} turns the corner`);
    });
    assert.ok(new Set(quadrants).size >= 3, `${vw}: ${quadrants.join(' ')} goes round the shield`);
    // Pure: the same screen plans the same way.
    assert.deepEqual(planDock(chapters, vw, vh, camera), plan);
  }
  // Today, on the owner's screen.
  const plan = planDock(chapters, 1728, 1000, cameraFor(1728, 1000));
  assert.deepEqual(chapters.map((c) => plan[c.id].quadrant), ['tr', 'bl', 'br', 'bl', 'tr', 'tl']);
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

test('a docked ticket tears on its own line, before the atlas leaves', () => {
  assert.ok(TEAR_LINE_DOCKED >= TEAR_LINE_MIN && TEAR_LINE_DOCKED <= TEAR_LINE_MAX);
  assert.ok(TEAR_LINE_DOCKED < TEAR_HARD_LINE);
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  assert.match(chapter, /tearLineRef\.current = TEAR_LINE_DOCKED;/);
  // Seen whole exactly while the camera is on its place.
  assert.match(chapter, /\? \(dockShownRef\.current \? 1 : 0\)/);
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
  assert.match(publish, /Math\.round\(point\.x\) - CANVAS_BLEED/);
  assert.doesNotMatch(publish, /getBoundingClientRect|offsetTop|clientWidth/);
  // On `move` too, as the shields' markers are placed: on `render` alone the
  // cover trailed its sign by a frame (the joint closed from 12px to 3).
  assert.match(atlas, /const onRender = \(\) => publishDockRef\.current\(\);\s+map\.on\('move', onRender\);\s+map\.on\('render', onRender\);/);
  // Shown or not is the gate's decision, on the camera's ask.
  assert.match(publish, /dockShown\(dockAtRef\.current, dockAskRef\.current,/);
  assert.match(atlas, /dockAsk = askDock\(chapterRoute\[committed\]\?\.stop\.id \?\? null, dockLanded, entryAt, entryStill, hopRemainPx\);/);
  // The resting camera's lean is restLean's, from where it came down.
  assert.match(atlas, /const lean = restLean\(position, committed, leanFrom, lastRouteIndex, HOP\.forward, HOP\.back\);/);
  assert.match(atlas, /dockLanded = true;\s+leanFrom = leanOrigin\(landing\.dest\);/);
  // The camera moves a place by where it stands over the ground; its centre
  // on the screen stays the atlas's focal point.
  assert.match(atlas, /const restCenter = \(index: number\): GeoCoordinate => dockCentres\[index\] \?\?/);
  assert.match(atlas, /map\.setPadding\(focused \? activePadding : neutralPadding\);/);
  // Off the globe's swap to Mercator at zoom 6.
  assert.match(atlas, /restZoomMax: 5\.98,/);
  // The cover is written at its place's foot, into the atlas's dock.
  assert.match(chapter, /dock\.style\.transform = `translate3d\(\$\{point\.x\}px, \$\{point\.y\}px, 0\)`/);
  assert.match(chapter, /data-cover-for=\{id\}/);
  assert.match(chapter, /createPortal\(/);
  assert.match(home, /<div ref=\{setDockHost\} className="archive-dock-host" \/>/);
  // The chapter's point on the timeline is its rail.
  assert.match(home, /querySelector<HTMLElement>\('\[data-chapter-anchor\]'\)/);
  assert.match(closing, /querySelector<HTMLElement>\('\[data-chapter-anchor\]'\)/);
  // It appears whole (no transition in) and fades out on the fade curve.
  assert.match(css, /\.archive-dock\[data-at\] \{\s*opacity: 1;\s*visibility: visible;\s*transition: none;/);
  assert.match(css, /\.archive-dock \{[^}]*transition: opacity var\(--dur-out\) var\(--ease-fade\)/);
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
  for (const quadrant of QUADRANT_ORDER) {
    const rule = new RegExp(`\\.archive-dock\\[data-quadrant='${quadrant}'\\] \\.archive-plate__caret \\{[^}]*clip-path: polygon\\(`);
    assert.match(css, rule, quadrant);
  }
  assert.match(css, /\.archive-plate__caret\[data-half='stub'\] \{\s*background: var\(--stub-paper/);
  // Torn, the face's caret goes with the face.
  assert.match(css, /\.archive-plate\.is-torn \.archive-plate__caret\[data-half='face'\] \{\s*opacity: 0;/);
  // The caret's tip stays inside the gap: 4px out each way of the 8.
  const tip = /\.archive-dock\[data-quadrant='tr'\] \.archive-plate__caret \{\s*left: -4px;/;
  assert.match(css, tip);
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

test('a cover appears once its camera has settled, and stays while it is on its place', () => {
  const { settledPx, entryHold, entryAppear } = DOCK_GATE;
  assert.ok(entryHold < entryAppear && entryAppear < 1, 'a band between hold and appear: no flicker at its edge');
  // In the air: nothing asked.
  assert.equal(askDock('miami', false, 1, true, 0), null);
  assert.equal(askDock(null, true, 1, true, 0), null);
  // Down but still settling: it may stay (were it shown) but not appear.
  assert.deepEqual(askDock('orlando', true, 1, true, settledPx + 0.5), { id: 'orlando', appear: false, stay: true });
  assert.deepEqual(askDock('orlando', true, 1, true, settledPx), { id: 'orlando', appear: true, stay: true });
  // In the archive the entrance is done: its stillness is not asked.
  assert.equal(askDock('orlando', true, 1, false, 0).appear, true);
  // The first chapter in the entrance's last stretch: it appears once the
  // scroll holds still there, stays down to the hold while it moves, and
  // below the hold neither.
  assert.deepEqual(askDock('miami', true, 0.9, false, 0), { id: 'miami', appear: false, stay: true });
  assert.deepEqual(askDock('miami', true, 0.9, true, 0), { id: 'miami', appear: true, stay: true });
  assert.deepEqual(askDock('miami', true, entryAppear - 0.01, true, 0), { id: 'miami', appear: false, stay: true });
  assert.deepEqual(askDock('miami', true, entryHold - 0.01, true, 0), { id: 'miami', appear: false, stay: false });
  // The dock: a landing that has not settled shows nothing yet …
  let shown = null;
  shown = dockShown(shown, askDock('orlando', true, 1, true, 29));
  assert.equal(shown, null);
  // … the settled frame shows it whole where it rests …
  shown = dockShown(shown, askDock('orlando', true, 1, true, 1.2));
  assert.equal(shown, 'orlando');
  // … and it rides the reader's pre-roll after that (the pose moving again).
  shown = dockShown(shown, askDock('orlando', true, 1, true, 40));
  assert.equal(shown, 'orlando');
  // Take-off: gone at once.
  shown = dockShown(shown, askDock('orlando', false, 1, true, 0));
  assert.equal(shown, null);
  // A place with no point this frame never appears.
  assert.equal(dockShown(null, askDock('page', true, 1, true, 0), () => false), null);
  // A new place asked while another shows: the old goes, the new waits for
  // its own settle.
  assert.equal(dockShown('page', askDock('zion', true, 1, true, 12)), null);
  // Scrolling up out of Miami: shown through the hold, then gone …
  shown = 'miami';
  for (const entry of [0.97, 0.9, 0.82]) shown = dockShown(shown, askDock('miami', true, entry, false, 0));
  assert.equal(shown, 'miami');
  shown = dockShown(shown, askDock('miami', true, 0.78, false, 0));
  assert.equal(shown, null);
  // … back down while the scroll still moves: not yet …
  shown = dockShown(shown, askDock('miami', true, 0.9, false, 0));
  assert.equal(shown, null);
  // … and where the scroll stops, whole (a reader back from Orlando who
  // stopped short of Miami's line had no cover at all).
  shown = dockShown(shown, askDock('miami', true, 0.9, true, 0));
  assert.equal(shown, 'miami');
  // What is left to settle counts the zoom to come across the dock's reach.
  assert.equal(poseRemainPx(0, 0), 0);
  assert.ok(Math.abs(poseRemainPx(1, 0.004) - (1 + DOCK_GATE.reachPx * (2 ** 0.004 - 1))) < 1e-9);
  assert.ok(poseRemainPx(0, 0.01) > settledPx, 'a hundredth of a zoom still to go is still settling');
});

test('a landed camera holds until the hand moves on (the lean)', () => {
  const forward = 0.32;
  const back = 0.78;
  // At the place's reading line, as ever: no lean, then the whole lean at
  // the commit lines either way.
  assert.deepEqual(restLean(1, 1, 1, 5, forward, back), { from: 1, neighbour: 1, amount: 0 });
  assert.equal(restLean(1 + forward, 1, 1, 5, forward, back).amount, 1);
  assert.equal(restLean(1 + forward, 1, 1, 5, forward, back).neighbour, 2);
  assert.equal(restLean(1 - back, 1, 1, 5, forward, back).amount, 1);
  assert.equal(restLean(1 - back, 1, 1, 5, forward, back).neighbour, 0);
  // Landed on Orlando with the wheel stopped at 0.59: nothing moves (it
  // leaned 26px back toward Miami).
  const landed = restLean(0.59, 1, 0.59, 5, forward, back);
  assert.deepEqual(landed, { from: 0.59, neighbour: 1, amount: 0 });
  // On toward the reading line: still nothing, all the way.
  for (const position of [0.7, 0.85, 0.99]) assert.equal(restLean(position, 1, 0.59, 5, forward, back).amount, 0);
  // Crossing it ends the stretch: from there it leans on as ever.
  const crossed = restLean(1.1, 1, 0.59, 5, forward, back);
  assert.equal(crossed.from, 1);
  assert.equal(crossed.neighbour, 2);
  assert.ok(Math.abs(crossed.amount - restLean(1.1, 1, 1, 5, forward, back).amount) < 1e-12);
  // Back from where it landed: it leans home, from 0 at the landing to the
  // whole lean at the back line — continuous.
  assert.equal(restLean(0.59, 1, 0.59, 5, forward, back).amount, 0);
  const home = restLean(0.4, 1, 0.59, 5, forward, back);
  assert.equal(home.neighbour, 0);
  assert.ok(home.amount > 0 && home.amount < 1);
  assert.equal(restLean(1 - back, 1, 0.59, 5, forward, back).amount, 1);
  // Continuous along the whole leg, wherever it can have landed: on the way
  // on at or past the commit line (1 − 0.68), on the way back at or before
  // the back line (2 − 0.78).
  for (const from of [1 - (1 - forward), 0.59, 1, 2 - back]) {
    let prev = null;
    for (let p = 1 - back; p <= 1 + forward + 1e-9; p += 0.001) {
      const lean = restLean(p, 1, from, 5, forward, back);
      const signed = lean.neighbour === 1 ? 0 : lean.neighbour > 1 ? lean.amount : -lean.amount;
      if (prev != null) assert.ok(Math.abs(signed - prev) < 0.02, `from ${from} at ${p.toFixed(3)}`);
      prev = signed;
    }
  }
  // The ends of the route lean nowhere they cannot go.
  assert.deepEqual(restLean(-0.2, 0, 0, 5, forward, back), { from: 0, neighbour: 0, amount: 0 });
  assert.equal(restLean(5.2, 5, 5, 5, forward, back).amount, 0);
});

test('the rail clears the nav, and the sign turns when its cover appears', () => {
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const css = source('src/styles/global.css');
  // The rail fades on its own scroll before its top reaches the nav's band,
  // derived from its rest (its centre on the reading line), once per layout.
  assert.match(chapter, /const restTop = ARCHIVE_READING_LINE \* geometry\.vh - own\.offsetHeight \/ 2;/);
  assert.match(chapter, /\{ span, from: Math\.max\(0, restTop - 240\), to: Math\.max\(1, restTop - 120\) \}/);
  assert.match(chapter, /return \(1 - distance \* \(delta < 0 \? 0\.3 : 0\.52\)\) \* railClear\(delta\);/);
  assert.match(chapter, /return \(1 - distance \* \(delta < 0 \? 0\.38 : 1\)\) \* railClear\(delta\);/);
  // Docked, the flap waits for the cover to appear, not the voyage's end.
  assert.match(chapter, /if \(dockShownRef\.current\) start\(\);\s+else \{\s+dockAppearRef\.current = start;/);
  // Narrow windows stack the frames count over the lede.
  assert.match(css, /@media \(max-width: 1439px\) \{\s+\.archive-rail \.archive-lede \{\s+grid-template-columns: minmax\(0, 1fr\);/);
  // The rail's pool is light (a cloud of smoke on pale rock at 0.8); the
  // type has its own soft shadow.
  assert.match(css, /rgba\(16, 20, 14, 0\.58\) 0%/);
  assert.match(css, /\.archive-rail__lede \{\s+color: rgba\(244, 244, 237, 0\.92\);\s+text-shadow:/);
});
