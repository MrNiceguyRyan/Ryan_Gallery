// Run offline: node --experimental-strip-types --test scripts/explorer.test.mjs
//
// The homepage as a map to roam (src/lib/explorer.ts, src/lib/explorerCamera.ts):
// what every gesture does from every state (a tear always first), the entry
// to stop 01 (data-driven: Washington, DC once it is the first by route
// order), no six-chapter limit, and the camera's calm — every flight and the
// entry's turn under the caps, with the numbers the scroll-driven chapters
// had before, for the record.
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
const order = await bundle('../src/lib/chapterOrder.ts');
const { EXPLORER_START, explore, neighbour, stopOne, phoneCard, phoneFocalY, PHONE_CARD } = explorer;
const { ENTRY, EXPLORE_PITCH, EXPLORE_ZOOM, FLIGHT, entryQ, entryTurnRate, flightPath, flightSpeeds, pitchForZoom, planFlight } = camera;
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

test('the pitch follows the zoom: square on the planet, oblique down at a place', () => {
  assert.equal(pitchForZoom(EXPLORE_ZOOM.min), 0);
  assert.equal(pitchForZoom(3), 0);
  assert.equal(pitchForZoom(EXPLORE_PITCH.full), EXPLORE_PITCH.rest);
  assert.equal(pitchForZoom(7), EXPLORE_PITCH.rest);
  let last = -1;
  for (let z = 1; z <= 9; z += 0.05) {
    const p = pitchForZoom(z);
    assert.ok(p >= last - 1e-9, 'never tips back as the zoom goes on');
    last = p;
  }
  assert.ok(EXPLORE_PITCH.rest < 46, 'less oblique than the chapters\' 46°');
});

test('the entry turns the planet on the sine, under 85°/s, and ends on q = 1', () => {
  for (const drift of [0, 12, 30]) {
    let last = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const q = entryQ(t, 0, drift);
      assert.ok(q >= last - 1e-9 && q <= 1, 'monotonic');
      last = q;
    }
    assert.equal(entryQ(1, 0, drift), 1);
    assert.ok(Math.abs(entryQ(0, 0, drift)) < 1e-6);
    const rate = entryTurnRate(0, drift);
    // The planet's surface at the corner globe's radius (~650px at 1728) then
    // crosses the screen at ≤ ~0.55 of its width a second: under the
    // flights' own cap (FLIGHT.screenShare).
    assert.ok(rate < 85, `drift ${drift}: ${rate.toFixed(1)}°/s`);
    if (process.env.EXPLORER_NUMBERS) console.log(`entry turn (drift ${drift}): peak ${rate.toFixed(1)}°/s over ${ENTRY.turnMs} ms`);
  }
  // Entered from partway (a globe already turned), the rest of the turn.
  assert.ok(entryQ(0.5, 0.4, 10) > 0.4);
});

test('the homepage hands the entrance a seam: an event, a function, a record', () => {
  const lib = source('src/lib/explorer.ts');
  assert.match(lib, /export const EXPLORE_EVENT = 'archive:explore'/);
  assert.match(lib, /export function requestExplore/);
  const home = source('src/components/home/HomePage.tsx');
  assert.match(home, /EXPLORE_EVENT/);
  assert.match(home, /__archiveExploreAsked/, 'an ask made before the page mounted is kept');
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
  assert.ok(ENTRY.diveMs >= 3600);
});

test('the reader\'s zoom is never cut short by the pitch; a fall tips only once it is down', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  // The pitch follows the zoom by writing the transform: `setPitch` is a
  // jumpTo, and a jumpTo stopped every wheel tick's eased zoom (30 ticks
  // moved the map 0.8 levels between z 3.4 and 5).
  const onZoom = atlas.slice(atlas.indexOf('const onZoom = () =>'), atlas.indexOf('const onFreeMove'));
  assert.match(onZoom, /transform\.pitch = target/);
  assert.doesNotMatch(onZoom.slice(0, onZoom.indexOf('} else {')), /setPitch/);
  // No snap to north after a drag (a 2° turn nobody asked for).
  assert.match(atlas, /bearingSnap=\{0\}/);
  // From the open planet the flight keeps its pitch and bearing and tips
  // after landing; a flight cut off by a newer one is not taken for it.
  assert.match(atlas, /\.\.\.\(flying\.tip \? \{ pitch: pitchNow, bearing: bearingNow \} : null\)/);
  assert.match(atlas, /arrived && flying\.tip && !flying\.tipping/);
  assert.match(atlas, /token != null && token !== flying\.token/);
});
