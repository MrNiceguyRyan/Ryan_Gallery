// Run offline: node --experimental-strip-types --test scripts/explorer.test.mjs
//
// The homepage as a map to roam (src/lib/explorer.ts, src/lib/explorerCamera.ts):
// what every gesture does from every state (a tear always first), the entry
// to stop 01 (data-driven: Washington, DC once it is the first by route
// order), no six-chapter limit, and the camera's calm — every flight and the
// entry's descent under the caps, with the numbers the scroll-driven chapters
// had before, for the record. The entry is handed over by the entrance's
// boarding pass (the seam): torn, it brings the globe up already facing
// stop 01, and the camera goes straight down.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = async (entry) => {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
};
const explorer = await bundle('../src/lib/explorer.ts');
const camera = await bundle('../src/lib/explorerCamera.ts');
const look = await bundle('../src/lib/globeLook.ts');
const order = await bundle('../src/lib/chapterOrder.ts');
const { EXPLORER_START, explore, neighbour, stopOne, phoneCard, phoneFocalY, PHONE_CARD } = explorer;
const { ENTRY, EXPLORE_PITCH, FLIGHT, READER_ZOOM, entryStartZoom, entryZoomRate, flightPath, flightSpeeds, planFlight } = camera;
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { collections } = JSON.parse(readFileSync(new URL('./fixtures/archive-2026-09-27.json', import.meta.url), 'utf8'));

const ORDER = ['miami', 'orlando', 'page', 'zion', 'bryce', 'new-york'];
const run = (actions, from = EXPLORER_START) => actions.reduce(
  (acc, action) => {
    const step = explore(acc.state, action, ORDER);
    return { state: step.state, effects: [...acc.effects, ...step.effects] };
  },
  { state: from, effects: [] },
);

test('the entry: one move to stop 01, then the map is the reader\'s', () => {
  const entered = explore(EXPLORER_START, { type: 'enter' }, ORDER);
  assert.deepEqual(entered.state, { phase: 'entering', current: 'miami' });
  assert.deepEqual(entered.effects, [{ type: 'entry', id: 'miami' }]);
  // Nothing moves until the entry is down: a shield, the cover, the map.
  for (const action of [{ type: 'select', id: 'page' }, { type: 'open', id: 'miami' }, { type: 'dismiss' }]) {
    assert.deepEqual(explore(entered.state, action, ORDER).effects, [], action.type);
  }
  assert.deepEqual(explore(entered.state, { type: 'enter' }, ORDER).effects, [], 'asked twice, it enters once');
  const free = explore(entered.state, { type: 'entered' }, ORDER);
  assert.deepEqual(free.state, { phase: 'explore', current: 'miami' });
  // Stop 01 is whatever the route order puts first: data-driven.
  assert.equal(stopOne(['dc', ...ORDER]), 'dc');
  assert.equal(stopOne([]), null);
  assert.deepEqual(explore(EXPLORER_START, { type: 'enter' }, []).effects, [{ type: 'entry', id: null }]);
});

test('a shield: the ticket in hand tears first, then the flight', () => {
  const { state, effects } = run([{ type: 'enter' }, { type: 'entered' }, { type: 'select', id: 'page' }]);
  assert.deepEqual(state, { phase: 'explore', current: 'page' });
  assert.deepEqual(effects.slice(1), [
    { type: 'tear', id: 'miami' },
    { type: 'fly', id: 'page', from: 'miami' },
  ]);
  // The one in hand again: the camera comes back onto it; nothing tears.
  assert.deepEqual(explore(state, { type: 'select', id: 'page' }, ORDER).effects, [{ type: 'fly', id: 'page', from: 'page' }]);
  // A place the archive does not have: nothing.
  assert.deepEqual(explore(state, { type: 'select', id: 'nowhere' }, ORDER).effects, []);
});

test('the cover: its stub tears off, then the story opens', () => {
  const { state } = run([{ type: 'enter' }, { type: 'entered' }]);
  const opened = explore(state, { type: 'open', id: 'miami' }, ORDER);
  assert.deepEqual(opened.effects, [{ type: 'tear-stub', id: 'miami' }, { type: 'story', id: 'miami' }]);
  assert.deepEqual(opened.state, state, 'the place stays in hand under the story');
  // Only the cover in hand opens (a cover still leaving is not a door).
  assert.deepEqual(explore(state, { type: 'open', id: 'page' }, ORDER).effects, []);
});

test('the empty map, Escape: the ticket tears away, nothing in hand', () => {
  const { state } = run([{ type: 'enter' }, { type: 'entered' }]);
  const dismissed = explore(state, { type: 'dismiss' }, ORDER);
  assert.deepEqual(dismissed.state, { phase: 'explore', current: null });
  assert.deepEqual(dismissed.effects, [{ type: 'tear', id: 'miami' }, { type: 'release', id: 'miami' }], 'the cover goes once torn');
  assert.deepEqual(explore(dismissed.state, { type: 'dismiss' }, ORDER).effects, [], 'nothing in hand, nothing to tear');
  // Roaming with nothing in hand, a shield flies from the open map.
  assert.deepEqual(explore(dismissed.state, { type: 'select', id: 'zion' }, ORDER).effects, [{ type: 'fly', id: 'zion', from: null }]);
});

test('back to the first screen tears what is in hand, then goes home', () => {
  const { state } = run([{ type: 'enter' }, { type: 'entered' }, { type: 'select', id: 'bryce' }]);
  const left = explore(state, { type: 'leave' }, ORDER);
  assert.deepEqual(left.state, EXPLORER_START);
  assert.deepEqual(left.effects, [{ type: 'tear', id: 'bryce' }, { type: 'home' }]);
  assert.deepEqual(explore(EXPLORER_START, { type: 'leave' }, ORDER).effects, []);
  // Mid-entry there is no ticket in hand yet.
  const entering = explore(EXPLORER_START, { type: 'enter' }, ORDER).state;
  assert.deepEqual(explore(entering, { type: 'leave' }, ORDER).effects, [{ type: 'home' }]);
});

test('Prev / Next go round the route; from nothing in hand, Next is stop 01', () => {
  assert.equal(neighbour(ORDER, 'miami', 1), 'orlando');
  assert.equal(neighbour(ORDER, 'miami', -1), 'new-york', 'the first\'s previous is the last');
  assert.equal(neighbour(ORDER, 'new-york', 1), 'miami', 'the last\'s next is the first');
  assert.equal(neighbour(ORDER, null, 1), 'miami');
  assert.equal(neighbour(ORDER, null, -1), 'new-york');
  assert.equal(neighbour([], 'miami', 1), null);
});

test('every place with photographs is on the map: no six-chapter limit', () => {
  assert.equal('HOME_CHAPTER_LIMIT' in order, false, 'the limit is gone');
  assert.equal('issueChapters' in order, false);
  // Seven places (a synthetic Washington, DC first by route order): all
  // seven, DC is stop 01, /about's numbering is the same list.
  const dc = { _id: 'dc', name: 'Washington, DC', slug: 'washington-dc', region: 'District of Columbia', year: 2024, routeOrder: 5, photos: [1, 2, 3] };
  const seven = [...collections, dc];
  const chapters = order.chapterOrder(seven);
  assert.equal(chapters.length, 7);
  assert.equal(chapters[0]._id, 'dc');
  assert.deepEqual(chapters.map((c) => c.name).slice(1), ['Miami', 'Orlando', 'Page', 'Zion', 'Bryce Canyon', 'New York']);
  assert.equal(order.chapterOrdinal(seven, 'dc').index, 0);
  assert.equal(order.chapterOrdinal(seven, 'dc').total, 7);
  // Thirty places: thirty, in route order.
  const many = Array.from({ length: 30 }, (_, i) => ({ _id: `c${i}`, year: 2000 + i, routeOrder: 100 - i, photos: [1] }));
  assert.equal(order.chapterOrder(many).length, 30);
  assert.equal(order.chapterOrder(many)[0]._id, 'c29');
  // A place with no photographs is not a stop.
  assert.equal(order.chapterOrder([...seven, { _id: 'empty', routeOrder: 1, photos: [] }]).length, 7);
});

test('the phone\'s card fits the screen, its type legible, the place above it', () => {
  for (const [vw, vh] of [[390, 844], [375, 667], [768, 1024], [320, 568]]) {
    for (const ratio of [0.45, 0.667, 1, 1.5, 2.4]) {
      const card = phoneCard(vw, vh, ratio);
      assert.ok((card.photoW + PHONE_CARD.stub) * card.scale <= vw - 2 * PHONE_CARD.gutter + 1, `${vw}×${vh} @${ratio}: fits across`);
      assert.ok(card.scale >= PHONE_CARD.minScale && card.scale <= 1);
      assert.ok(card.photoH * card.scale <= vh * PHONE_CARD.shareH + 1);
      const focal = phoneFocalY(vh, card.h);
      assert.ok(focal > 88 && focal < vh - PHONE_CARD.controls - card.h, `${vw}×${vh} @${ratio}: the place stands clear of the card`);
    }
  }
});

// ── The camera's calm ──
const mercY = (lat) => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));
const pxAt = (a, b, zoom) => (Math.hypot(b[0] - a[0], mercY(b[1]) - mercY(a[1])) * 512 * 2 ** zoom) / 360;
const PLACES = {
  dc: [-77.0369, 38.9072],
  miami: [-80.1918, 25.7617],
  orlando: [-81.3789, 28.5384],
  page: [-111.4558, 36.9147],
  zion: [-113.0263, 37.2982],
  bryce: [-112.1871, 37.593],
  'new-york': [-73.9856, 40.7484],
};
const LEGS = [['miami', 'orlando'], ['orlando', 'page'], ['page', 'zion'], ['bryce', 'new-york'], ['new-york', 'miami'], ['dc', 'miami']];
const REST_ZOOM = 5.4;

// The scroll-driven chapters' hop, as RouteAtlas had it (HOP, 9d24a38):
// 850 + 1000·reach ms, rho 2.1, a sine lift to 0.32 levels on neighbours,
// cubic-bezier(0.4, 0.05, 0.2, 1), measured over the clear stage (1728×1000:
// 1148 px). Before, for the record.
const bezier = ([x1, y1, x2, y2]) => (x) => {
  let t = x;
  for (let i = 0; i < 12; i += 1) {
    const cx = 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3 - x;
    const dx = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
    if (Math.abs(cx) < 1e-7 || !dx) break;
    t = Math.max(0, Math.min(1, t - cx / dx));
  }
  return 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
};
const oldHop = (a, b) => {
  const degrees = (Math.acos(Math.min(1, Math.sin(a[1] * Math.PI / 180) * Math.sin(b[1] * Math.PI / 180) + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.cos((b[0] - a[0]) * Math.PI / 180))) * 180) / Math.PI;
  const reach = Math.max(0, Math.min(1, Math.log(1 + degrees / 1.2) / Math.log(1 + 40 / 1.2)));
  const duration = 850 + 1000 * reach;
  const u1 = pxAt(a, b, REST_ZOOM);
  const base = flightPath(1148, 1148, u1, 2.1);
  const extra = Math.max(0, 0.32 - base.lift);
  const path = { at: (s) => { const p = base.at(s); return { u: p.u, dz: p.dz - extra * Math.sin(Math.PI * s) }; }, lift: base.lift + extra };
  return { duration, ...flightSpeeds(path, u1, duration, bezier([0.4, 0.05, 0.2, 1])) };
};

test('every flight keeps the ground and the zoom under the caps (and slower than the hops it replaces)', () => {
  const rows = [];
  for (const vw of [1728, 1280, 390]) {
    const w0 = vw === 390 ? 844 + 64 : vw + 64;
    for (const [from, to] of LEGS) {
      const u1 = pxAt(PLACES[from], PLACES[to], REST_ZOOM);
      const plan = planFlight(w0, u1, 0, vw);
      const cap = FLIGHT.screenShare * vw;
      assert.ok(plan.durationMs >= FLIGHT.minMs && plan.durationMs <= FLIGHT.maxMs);
      if (plan.durationMs < FLIGHT.maxMs) {
        assert.ok(plan.speeds.screenPxPerS <= cap * 1.02, `${vw} ${from}→${to}: ground ${plan.speeds.screenPxPerS.toFixed(0)} px/s ≤ ${cap.toFixed(0)}`);
        assert.ok(plan.speeds.zoomPerS <= FLIGHT.zoomPerS * 1.02, `${vw} ${from}→${to}: zoom ${plan.speeds.zoomPerS.toFixed(2)}/s`);
      }
      if (vw === 1728) {
        const old = oldHop(PLACES[from], PLACES[to]);
        rows.push(`${from}→${to}: before ${Math.round(old.duration)} ms, ${Math.round(old.screenPxPerS)} px/s, ${old.zoomPerS.toFixed(2)} z/s, lift ${old.lift.toFixed(2)} | after ${plan.durationMs} ms, ${Math.round(plan.speeds.screenPxPerS)} px/s, ${plan.speeds.zoomPerS.toFixed(2)} z/s, lift ${plan.speeds.lift.toFixed(2)}`);
        assert.ok(plan.speeds.screenPxPerS < old.screenPxPerS, `${from}→${to}: calmer than before`);
        assert.ok(plan.speeds.zoomPerS < old.zoomPerS, `${from}→${to}: gentler zoom than before`);
      }
    }
  }
  if (process.env.EXPLORER_NUMBERS) console.log(rows.join('\n'));
});

test('the pitch is held: one gentle oblique view at every zoom, never tipped by the reader\'s hand', () => {
  // The review of 2026-09-28: the pitch that followed the zoom tipped the
  // camera 75°/s under one flick of the wheel, 242°/s under a double-click.
  assert.equal(EXPLORE_PITCH.rest, 24);
  assert.deepEqual(Object.keys(EXPLORE_PITCH), ['rest']);
  assert.equal('pitchForZoom' in camera, false, 'nothing ties the pitch to the zoom');
  const atlas = source('src/components/home/RouteAtlas.tsx');
  assert.doesNotMatch(atlas, /map\.on\('zoom'/, 'no per-frame zoom handler writes the camera');
  assert.doesNotMatch(atlas, /transform\.pitch = /);
  assert.match(atlas, /pitch: CHAPTER_PITCH,\n/, 'a place\'s rest pose has the one pitch');
});

test('the reader\'s own zooms stay under the flights\' zoom cap', () => {
  // A sine over `ms` peaks at π/2 · levels / seconds.
  const peak = (levels, ms) => (Math.PI / 2) * levels / (ms / 1000);
  assert.ok(peak(READER_ZOOM.clickLevels, READER_ZOOM.clickMs) <= FLIGHT.zoomPerS, 'double-click');
  assert.ok(peak(READER_ZOOM.keyLevels, READER_ZOOM.keyMs) <= FLIGHT.zoomPerS, '+ / −');
  assert.ok(READER_ZOOM.wheelRate < 1 / 450, 'the wheel slower than Mapbox\'s default');
  const atlas = source('src/components/home/RouteAtlas.tsx');
  // Mapbox's own double-click and keys (300 ms, whole levels) are off.
  assert.match(atlas, /doubleClickZoom=\{false\}/);
  assert.match(atlas, /keyboard=\{false\}/);
  assert.match(atlas, /setWheelZoomRate\(READER_ZOOM\.wheelRate\)/);
  assert.match(atlas, /duration: reducedMotion \? 0 : READER_ZOOM\.clickMs/);
});

test('the globe rises already facing stop 01, and the entry is the descent alone', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  // No first-screen corner globe to turn from (India's face, ~195° to the
  // Americas): nothing of the turn is left, in the atlas or its look.
  assert.doesNotMatch(atlas, /prologueGlide|prologueRoll|prologueTurnRemaining|prologueNaturalLongitude|PROLOGUE_GLOBE|cornerZoomFor|prologueProgress/);
  assert.equal('prologueTurnRemaining' in look, false);
  assert.equal('turnMs' in ENTRY, false);
  // The descent holds its centre (nothing turns or slides: the planet only
  // comes closer), its zoom on the house's sine, its tip over the last 70%.
  const pose = atlas.slice(atlas.indexOf('function globeEntryPose('), atlas.indexOf('function isValidCoordinate('));
  assert.match(pose, /center: target\.coordinate,/);
  assert.match(pose, /startZoom \+ \(target\.zoom - startZoom\) \* voyageEase\(clamp01\(progress\)\)/);
  assert.match(atlas, /const riseZoom = entryStartZoom\(risePlanetZoom\(document\.documentElement\.clientWidth, viewportH\), aim\.zoom\);/);
  // The rise's planet is whole on screen (DERIVED from the viewport, never
  // measured): its limb's apparent radius clears the top by 7% of the height
  // and stays within the atlas column. Mapbox below zoom 5: a sphere of
  // 512·2^z/2π world px over cos 45°, seen from 1.5 canvas heights.
  const limb = (vw, vh) => {
    const r = Math.min((0.48 - 0.07) * vh, (0.78 * 0.78 * vw) / 2);
    const D = 1.5 * (vh + 64);
    const R = (r * (r + Math.sqrt(r * r + D * D))) / D;
    const z = Math.log2((R * 2 * Math.PI * Math.SQRT1_2) / 512);
    // back again: the limb a camera at D sees of the sphere at zoom z
    const Rz = (512 * 2 ** z) / (2 * Math.PI) / Math.SQRT1_2;
    return { r, z, seen: (D * Rz) / Math.sqrt(D * D + 2 * D * Rz) };
  };
  for (const [vw, vh] of [[1728, 1000], [1280, 800], [1024, 1366]]) {
    const { r, z, seen } = limb(vw, vh);
    assert.ok(Math.abs(seen - r) < 0.5, `${vw}×${vh}: limb ${seen.toFixed(1)} for ${r.toFixed(1)}`);
    assert.ok(0.48 * vh - seen >= 0.069 * vh, 'the disc clears the top');
    // The descent from it onto a place at rest (5.05) stays at the zoom cap
    // (a tall, narrow window's planet rises a little larger for it).
    const start = entryStartZoom(z, 5.05);
    const rate = entryZoomRate(start, 5.05);
    assert.ok(rate <= FLIGHT.zoomPerS + 1e-9, `${vw}×${vh}: from ${start.toFixed(2)} at ${rate.toFixed(2)} levels/s`);
    if (process.env.EXPLORER_NUMBERS) console.log(`rise ${vw}×${vh}: zoom ${z.toFixed(3)} (starts ${start.toFixed(3)}), descent ${rate.toFixed(2)} levels/s over ${ENTRY.diveMs} ms`);
  }
  // Measured on the built page at 1728 × 1000: a limb of 408.8 px for 410.
});

test('the entry can be cut short, and the phone waits near stop 01', () => {
  const home = source('src/components/home/HomePage.tsx');
  assert.match(home, /const finishEntry = useCallback/);
  assert.match(home, /explorer\.phase !== 'entering'/);
  const atlas = source('src/components/home/RouteAtlas.tsx');
  assert.match(atlas, /const cutShort = prologue && !still && !cutDown && entryPoseAt < ENTRY_CUT_BELOW/);
  // The clock's own last frame is not a cut (no dip at a natural landing).
  assert.match(atlas, /if \(!cutShort && entryPoseAt < 1\) \{\s*map\.jumpTo\(restPose\(entryIndex\)\);/);
  assert.match(atlas, /const PHONE_APPROACH_ZOOM = 3\.2;/);
  // From the approach the descent is short at the zoom cap.
  const plan = planFlight(844 + 0, 40, 5.05 - 3.2, 390);
  assert.ok(plan.speeds.zoomPerS <= FLIGHT.zoomPerS * 1.02 && plan.durationMs <= 3000, `${plan.durationMs} ms, ${plan.speeds.zoomPerS.toFixed(2)}/s`);
});

test('a flight waits for the torn face to have gone; taps in a row do not tear what was never dealt', () => {
  const home = source('src/components/home/HomePage.tsx');
  assert.match(home, /tearTicket\(effect\.id, 'tear-then', finish, effects\[index \+ 1\]\?\.type === 'fly'\)/);
  assert.match(home, /const tearRunRef = useRef/);
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  assert.match(chapter, /const GONE_GO_AFTER_MS = TEAR_MS;/);
  assert.match(chapter, /reduce \? TEAR_REDUCED_MS : gone \? GONE_GO_AFTER_MS : PULL_GO_AFTER_MS/);
  // The ticket's own "Next stop" goes the explorer's way (same tear, same clock).
  const goNext = chapter.slice(chapter.indexOf('const goNext = () => {'), chapter.indexOf('// ── The sign turns into place'));
  assert.doesNotMatch(goNext, /tearThen/);
});

test('the map holds its tone while it moves, and its veil never dips', () => {
  const css = source('src/styles/global.css');
  assert.doesNotMatch(css, /data-atlas-camera='(locked|rest)'\] \.route-atlas-rest-tone/);
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const keys = atlas.slice(atlas.indexOf('const PROLOGUE_SATELLITE_OPACITY'), atlas.indexOf('];', atlas.indexOf('const PROLOGUE_SATELLITE_OPACITY')));
  assert.doesNotMatch(keys, /0\.1,/, 'no dip to 10%');
  // The crossfade is exact: silver under at V(1−k)/(1−Vk), the archive's
  // paint over at Vk, leaves the paper at 1−V throughout.
  for (const V of [1, 0.9, 0.76]) {
    for (const k of [0.1, 0.5, 0.9]) {
      const base = (V * (1 - k)) / (1 - V * k);
      const over = V * k;
      const paper = (1 - base) * (1 - over);
      assert.ok(Math.abs(paper - (1 - V)) < 1e-9);
      assert.ok(Math.abs(base * (1 - over) - V * (1 - k)) < 1e-9);
    }
  }
  const { silverExitAt, SILVER_EXIT } = look;
  assert.equal(silverExitAt(SILVER_EXIT[0]), 0);
  assert.equal(silverExitAt(SILVER_EXIT[1]), 1);
});

test('the homepage hands the entrance a seam: an event, a function, a record', () => {
  const lib = source('src/lib/explorer.ts');
  assert.match(lib, /export const EXPLORE_EVENT = 'archive:explore'/);
  assert.match(lib, /export function requestExplore/);
  const home = source('src/components/home/HomePage.tsx');
  assert.match(home, /EXPLORE_EVENT/);
  assert.match(home, /__archiveExploreAsked/, 'an ask made before the page mounted is kept');
  // The boarding pass, torn, asks once the glide has brought the globe up —
  // and nothing synthetic follows the ask (a real key, press or new wheel
  // cuts the entry short).
  assert.match(home, /const onEntranceArrived = useCallback\(\(\) => requestExplore\(\{ from: 'boarding-pass' \}\), \[\]\);/);
  assert.match(home, /onArrived=\{onEntranceArrived\}/);
  const handOver = home.slice(home.indexOf('handOverRef.current = (enter'), home.indexOf('// ── The seam: anyone may ask'));
  assert.doesNotMatch(handOver, /dispatchEvent|new (Wheel|Keyboard|Pointer|Mouse)Event/);
  // The explorer's first screen no longer listens for a first wheel or key:
  // the entrance above it scrolls, and the pass is the one way in.
  assert.doesNotMatch(home, /The first screen hands over on the reader's first move/);
  // No opener card on the phone: the pass torn, straight into the entry.
  assert.doesNotMatch(home, /explorer-opener|WalkIn|Enter the map/);
});

test('the fall from the whole planet onto a place stays near the zoom cap', () => {
  // A reader zoomed out to the planet (EXPLORE_ZOOM.min) picks a place from
  // the list: ~4.4 levels down. Capped at 3.6 s it peaked at 2.2 levels/s on
  // the live page; FLIGHT.maxMs lets it take the entry's own pace.
  for (const [vw, vh] of [[1728, 1000], [1280, 800], [390, 844]]) {
    // w0: the canvas's larger side, bleed included (as RouteAtlas measures it).
    const plan = planFlight(Math.max(vw, vh) + 64, 300, 4.4, vw);
    assert.ok(plan.speeds.zoomPerS <= 1.45, `${vw}: ${plan.speeds.zoomPerS.toFixed(2)} levels/s over ${plan.durationMs} ms`);
  }
  // The entry's descent is long enough for its own zoom and tip (see ENTRY).
  assert.ok(ENTRY.diveMs >= 4000);
});

test('a drag never turns the map; a camera set square tips only once it is down', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  // No snap to north after a drag (a 2° turn nobody asked for).
  assert.match(atlas, /bearingSnap=\{0\}/);
  // From the open planet the flight keeps its pitch and bearing and tips
  // after landing; a flight cut off by a newer one is not taken for it.
  assert.match(atlas, /\.\.\.\(flying\.tip \? \{ pitch: pitchNow, bearing: bearingNow \} : null\)/);
  assert.match(atlas, /arrived && flying\.tip && !flying\.tipping/);
  assert.match(atlas, /token != null && token !== flying\.token/);
});
