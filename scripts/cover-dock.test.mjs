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
  QUADRANT_ORDER,
  RAIL,
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
  projectAt,
  railBox,
  stageBox,
} from '../src/lib/coverDock.ts';
import { activeChapters, chapterSections } from '../src/lib/chapterOrder.ts';
import { EXPLORE_PITCH } from '../src/lib/explorerCamera.ts';
import { chapterPoint } from '../src/lib/geo.ts';
import { SHIELD_MAP_PX, SHIELD_SCALE, shieldForm, stateCode } from '../src/lib/routeShield.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { collections } = JSON.parse(readFileSync(new URL('./fixtures/archive-2026-09-27.json', import.meta.url), 'utf8'));

const SCREENS = [[1728, 1000], [1280, 800], [1440, 900], [1920, 1080], [1024, 768]];
const inside = (box, stage) => box.left >= stage.left - 0.5 && box.right <= stage.right + 0.5 && box.top >= stage.top - 0.5 && box.bottom <= stage.bottom + 0.5;
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const shieldBox = (point, shield) => ({ left: point.x - shield.w / 2, top: point.y - shield.h, right: point.x + shield.w / 2, bottom: point.y });

// The atlas's resting camera as RouteAtlas derives it (the atlas 78% of the
// page, its focal point 264px in from its right edge, on the reading line;
// the canvas a 32px bleed past the viewport each side; the explorer's
// pitch, 40° since the owner found the page dizzying).
const cameraFor = (vw, vh) => ({ focal: { x: (0.78 * vw - 264) / 2, y: 0.48 * vh }, pitch: EXPLORE_PITCH.rest, bearing: -2, distance: 1.5 * (vh + 64) });

// The archive as the homepage reads it, with each chapter's rest zoom
// (RouteAtlas hopRestZooms: neighbours ≥150px apart, 5.05 to 5.98).
function archiveChapters() {
  const sections = chapterSections(activeChapters(collections));
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

test('a ticket tears only while its cover is up, and is put back whole once it has gone', () => {
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  // Nothing tears a cover no one can see (the explorer then simply goes on).
  assert.match(chapter, /const tearThen = \(go: \(\) => void\) => \{\s+const section = chapterRef\.current as HTMLElement \| null;\s+if \(!ticket \|\| !section \|\| !dockShownRef\.current\) return false;/);
  assert.match(chapter, /const tearStubThen = \(go: \(\) => void\) => \{\s+if \(!ticket \|\| !dockShownRef\.current\) return false;/);
  // Gone (its fade done), it is whole again for the next visit.
  assert.match(chapter, /reseatTimer = window\.setTimeout\(\(\) => reseatRef\.current\(\), DOCK_FADE_MS \+ 60\);/);
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
  assert.match(atlas, /const askFor = \(\) => \{\s+const held = currentRef\.current;\s+if \(!held \|\| flying\) return null;/);
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
  assert.match(home, /<div ref=\{setDockHost\} className="archive-dock-host" \/>/);
  // The place in hand's rail shows with its cover (the dock's frame).
  assert.match(home, /coverDock\.subscribe\(\(frame\) => \{/);
  assert.match(home, /railShown=\{dockAt === city\._id\}/);
  assert.doesNotMatch(closing, /archive:onward/);
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
