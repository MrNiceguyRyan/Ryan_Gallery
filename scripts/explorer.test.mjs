// Run offline: node --experimental-strip-types --test scripts/explorer.test.mjs
//
// The homepage as a map to roam (src/lib/explorer.ts, src/lib/explorerCamera.ts):
// what every gesture does from every state — any place to any place, at
// once, interruptible, nothing torn but the cover's admission — the entry to
// stop 01 (data-driven: Washington, DC once it is the first by route order),
// no six-chapter limit, the switch's turn (the reference's 1.4 s) and the
// camera's calm elsewhere, with the numbers the scroll-driven chapters had
// before, for the record. The entry is handed over by the entrance's
// boarding pass (the seam, and the stub hand-off): torn, it brings the globe
// up already facing stop 01, and the camera goes straight down.
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
const { EXPLORER_START, explore, neighbour, stopOne, phoneCard, phoneFocalY, phoneStubRect, phoneTicketScale, PHONE_CARD, ENTRY_LANDED_EVENT, STUB_LANDED_EVENT, STUB_WAIT_MS } = explorer;
const { ENTRY, ENTRY_PEAK, EXPLORE_PITCH, FLIGHT, READER_ZOOM, SWITCH, entryEase, entryEaseRate, entryEaseInverse, entryFrame, entryStartZoom, entryZoomRate, flightPath, flightSpeeds, phoneEntryMs, planFlight, switchLift, switchMs } = camera;
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

test('a switch: any place, from any place, at once, and nothing tears', () => {
  // Owner, 2026-09-28: 我想要的是任意的切换 … 地点之间的移动现在不需要撕票根动效.
  const { state, effects } = run([{ type: 'enter' }, { type: 'entered' }, { type: 'select', id: 'page' }]);
  assert.deepEqual(state, { phase: 'explore', current: 'page' });
  assert.deepEqual(effects.slice(1), [{ type: 'fly', id: 'page', from: 'miami' }], 'one turn, no tear before it');
  // Any to any, in any order: from Page straight to the far end and back.
  const far = run([{ type: 'select', id: 'new-york' }, { type: 'select', id: 'orlando' }, { type: 'select', id: 'zion' }], state);
  assert.deepEqual(far.effects, [
    { type: 'fly', id: 'new-york', from: 'page' },
    { type: 'fly', id: 'orlando', from: 'new-york' },
    { type: 'fly', id: 'zion', from: 'orlando' },
  ]);
  assert.equal(far.state.current, 'zion');
  // No effect of any gesture between places is a tear.
  for (const effect of far.effects) assert.notEqual(effect.type, 'tear-stub');
  assert.equal('tear' in Object.fromEntries(far.effects.map((e) => [e.type, 1])), false);
  // The one in hand again: the camera comes back onto it.
  assert.deepEqual(explore(far.state, { type: 'select', id: 'zion' }, ORDER).effects, [{ type: 'fly', id: 'zion', from: 'zion' }]);
  // A place the archive does not have: nothing.
  assert.deepEqual(explore(far.state, { type: 'select', id: 'nowhere' }, ORDER).effects, []);
});

test('a switch can be interrupted: a new choice mid-turn turns on from there', () => {
  // The rule has no "in the air" state to wait on: a second choice before the
  // first turn is down is simply the next turn, from the place now in hand
  // (RouteAtlas starts Mapbox's flyTo from the live camera — no snap — and
  // the cover arriving becomes the one leaving).
  const entered = run([{ type: 'enter' }, { type: 'entered' }]).state;
  const first = explore(entered, { type: 'select', id: 'bryce' }, ORDER);
  const second = explore(first.state, { type: 'select', id: 'orlando' }, ORDER);
  assert.deepEqual(second.effects, [{ type: 'fly', id: 'orlando', from: 'bryce' }]);
  assert.equal(second.state.current, 'orlando');
  const atlas = source('src/components/home/RouteAtlas.tsx');
  // The turn cut off is over (no landing played for it); the new flyTo is
  // Mapbox's own from the live camera; its moveend is not taken for the new one.
  assert.match(atlas, /const cutOff = flying;\s+if \(cutOff\) \{\s+flying = null;\s+clearPlantTimers\(\);\s+onArriveRef\.current\?\.\(cutOff\.token, false\);/);
  assert.match(atlas, /token != null && token !== flying\.token/);
  // The ticket glides on from where it lies (never snaps); the cover it
  // carries by phase (src/lib/coverDock.ts, "The switch"), never stacking;
  // the same place with nothing under way is pinned back to its dock.
  assert.match(atlas, /pinRef\.current = \{ from: written \?\? to, to, t0: now, ms: durationMs, ease: easing \};/);
  // (Where it lay before it gave way to its shields, the step it had taken
  // carried on: coverDock `giveWay`.)
  assert.match(atlas, /const held = glideRef\.current;\s+const lies = held\s+\? \(held\.base \?\? held\.at\)\(now, seen\)/);
  assert.match(atlas, /from: carrier,\s+to: destId,\s+mode,/);
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  // An arriving ticket that becomes the carrier holds (in transit) or folds
  // back from where it is (opening).
  assert.match(chapter, /\/\/ It was arriving: it carries now\./);
});

test('the cover: its stub tears off, whole, then the story opens', () => {
  const { state } = run([{ type: 'enter' }, { type: 'entered' }]);
  const opened = explore(state, { type: 'open', id: 'miami' }, ORDER);
  assert.deepEqual(opened.effects, [{ type: 'tear-stub', id: 'miami' }, { type: 'story', id: 'miami' }]);
  assert.deepEqual(opened.state, state, 'the place stays in hand under the story');
  // Only the cover in hand opens (a cover still leaving is not a door).
  assert.deepEqual(explore(state, { type: 'open', id: 'page' }, ORDER).effects, []);
  // Straight after a switch, the new cover is the door.
  const switched = explore(state, { type: 'select', id: 'page' }, ORDER).state;
  assert.deepEqual(explore(switched, { type: 'open', id: 'page' }, ORDER).effects, [{ type: 'tear-stub', id: 'page' }, { type: 'story', id: 'page' }]);
  // HomePage opens the story from the stub's tear, which waits out the whole
  // score (ArchiveChapter STORY_AFTER_MS = TEAR_MS).
  const home = source('src/components/home/HomePage.tsx');
  assert.match(home, /case 'tear-stub': \{[\s\S]*?tearStub\(effect\.id, \(\) => \{[\s\S]*?openCollection\(collection, captured\);/);
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  assert.match(chapter, /const STORY_AFTER_MS = TEAR_MS;/);
});

test('the empty map, Escape: the ticket is let go calmly, nothing in hand', () => {
  const { state } = run([{ type: 'enter' }, { type: 'entered' }]);
  const dismissed = explore(state, { type: 'dismiss' }, ORDER);
  assert.deepEqual(dismissed.state, { phase: 'explore', current: null });
  assert.deepEqual(dismissed.effects, [{ type: 'release', id: 'miami' }], 'its cover fades; nothing tears');
  assert.deepEqual(explore(dismissed.state, { type: 'dismiss' }, ORDER).effects, [], 'nothing in hand, nothing to let go');
  // Roaming with nothing in hand, a shield flies from the open map.
  assert.deepEqual(explore(dismissed.state, { type: 'select', id: 'zion' }, ORDER).effects, [{ type: 'fly', id: 'zion', from: null }]);
  const home = source('src/components/home/HomePage.tsx');
  assert.match(home, /if \(event\.key === 'Escape'\) \{\s+if \(explorerRef\.current\.current\) dispatchRef\.current\(\{ type: 'dismiss' \}\);/);
  // (Not while the torn pass's stub is still landing on the ticket.)
  assert.match(home, /const dismissFromMap = useCallback\(\(\) => \{\s*\/\/[^\n]*\n\s*if \(arrivingRef\.current\) return;\s*dispatchRef\.current\(\{ type: 'dismiss' \}\);\s*\}, \[\]\);/);
});

test('back to the first screen goes home, with nothing torn', () => {
  const { state } = run([{ type: 'enter' }, { type: 'entered' }, { type: 'select', id: 'bryce' }]);
  const left = explore(state, { type: 'leave' }, ORDER);
  assert.deepEqual(left.state, EXPLORER_START);
  assert.deepEqual(left.effects, [{ type: 'home' }]);
  assert.deepEqual(explore(EXPLORER_START, { type: 'leave' }, ORDER).effects, []);
  const entering = explore(EXPLORER_START, { type: 'enter' }, ORDER).state;
  assert.deepEqual(explore(entering, { type: 'leave' }, ORDER).effects, [{ type: 'home' }]);
});

test('the way back: the explorer as the reader left it, at once — no entry, no descent, nothing torn', () => {
  // The place that was in hand: the camera cut onto it (its cover up).
  const back = explore(EXPLORER_START, { type: 'restore', id: 'zion' }, ORDER);
  assert.deepEqual(back.state, { phase: 'explore', current: 'zion' });
  assert.deepEqual(back.effects, [{ type: 'restore', id: 'zion' }]);
  // Nothing in hand (or a place no longer on the map): the planet, free.
  for (const id of [null, 'atlantis']) {
    const idle = explore(EXPLORER_START, { type: 'restore', id }, ORDER);
    assert.deepEqual(idle.state, { phase: 'explore', current: null });
    assert.deepEqual(idle.effects, []);
  }
  // The reader's map at once: any place, the cover's admission.
  assert.deepEqual(explore(back.state, { type: 'select', id: 'page' }, ORDER).effects, [{ type: 'fly', id: 'page', from: 'zion' }]);
  assert.deepEqual(explore(back.state, { type: 'open', id: 'zion' }, ORDER).effects.map((e) => e.type), ['tear-stub', 'story']);
  // Only onto a page not yet entered.
  const entering = explore(EXPLORER_START, { type: 'enter' }, ORDER).state;
  assert.deepEqual(explore(entering, { type: 'restore', id: 'zion' }, ORDER).state, entering);
  assert.deepEqual(explore(back.state, { type: 'restore', id: 'page' }, ORDER).state, back.state);
  // HomePage: decided before the first paint (html[data-home]), taken up in a
  // layout effect (never in the first render: the server's markup is the
  // entrance's), the place kept on every change, the veil lifted once the
  // map is still (the cut counts as an entry, so the map says when it is
  // down) — and on a phone that hydrates on the desktop's layout first, the
  // layout's own re-cut is an entry too.
  const page = source('src/components/home/HomePage.tsx');
  assert.match(page, /useLayoutEffect\(\(\) => \{\s*const root = document\.documentElement;\s*if \(root\.dataset\.home !== 'explorer'\) return;/);
  assert.match(page, /dispatchRef\.current\(\{ type: 'restore', id \}\);/);
  assert.match(page, /case 'restore':[\s\S]*?nextFlight\('cut', effect\.id, true\);/);
  assert.match(page, /stop = holdUntilStill\(lift\);/);
  assert.match(page, /nextFlight\('cut', state\.current, \(entering && !desktopLayout\) \|\| wayBackRef\.current\)/);
  assert.match(page, /if \(step\.state\.phase !== 'globe' \|\| action\.type === 'leave'\) keepExplorerPlace\(step\.state\.current\);/);
  assert.match(page, /markPassTorn\(\);/);
  assert.match(source('src/components/home/EntranceIntro.tsx'), /const onTear = useCallback\(\(\) => \{\s*setTorn\(true\);[\s\S]*?markPassTorn\(\);/);
  // The first paint: no entrance, the veil up.
  const css = source('src/styles/entrance.css');
  assert.match(css, /html\[data-home='explorer'\] \.entrance \{ display: none; \}/);
  assert.match(css, /html\[data-home='explorer'\] \.home-veil \{\s*opacity: 1;/);
  // The server draws the map's stand-in itself (no Suspense boundary left
  // pending in the HTML: a routed page hydrated it as React #419).
  assert.match(page, /\{client \? \(\s*<Suspense fallback=\{fallback\}>/);
});

test('the arrow keys step through the places, as the reference\'s do', () => {
  const home = source('src/components/home/HomePage.tsx');
  assert.match(home, /if \(event\.key !== 'ArrowLeft' && event\.key !== 'ArrowRight'\) return;/);
  // Not while the map itself has the keys (its arrows pan it), nor in the list.
  assert.match(home, /closest\?\.\('input, textarea, select, \[contenteditable="true"\], \.mapboxgl-canvas, \.explorer-list'\)/);
  assert.match(home, /stepToRef\.current\(event\.key === 'ArrowRight' \? 1 : -1\);/);
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
      // Its height counts the state's tab on its top edge — set back to the
      // screen's own size, whatever the card's scale (its state a constant
      // 15px: at the card's scale it read 10.8px on four of six places).
      assert.equal(card.h, Math.ceil(card.photoH * card.scale + PHONE_CARD.below) + PHONE_CARD.tab);
    }
  }
  assert.equal(PHONE_CARD.tab, 30);
  {
    const css = source('src/styles/global.css');
    assert.match(css, /\.archive-dock--phone \.archive-dock__tab \{\s*height: 30px;\s*transform: scale\(calc\(1 \/ var\(--card-scale, 1\)\)\);\s*transform-origin: 0 100%;/);
    assert.match(css, /\.archive-dock--phone \.archive-dock__tab-state \{\s*height: 22px;\s*font-size: 15px;/);
    assert.match(source('src/components/home/ArchiveChapter.tsx'), /'--card-scale': card\.scale/);
  }
  // The stub the entrance lands on does not move (the card's foot stays).
  for (const ratio of [1.5, 0.667]) {
    const rect = phoneStubRect(390, 844, ratio);
    const card = phoneCard(390, 844, ratio);
    assert.ok(Math.abs(rect.y + rect.h - (844 - PHONE_CARD.dockBottom - PHONE_CARD.below)) < 0.01);
    assert.ok(Math.abs(rect.h - card.photoH * card.scale) < 0.01);
  }
});

test("the phone's switch: every card folds into one ticket size, never swells, and the next grows out of it", async () => {
  // Review, 2026-09-29: Miami → Orlando's card grew 25 px taller as it
  // "shrank" into its ticket (it came to Orlando's larger scale), and
  // Orlando → Page only cropped its foot. One ticket size on the screen for
  // every hop: the smallest card's scale.
  const { coverRatioOf } = await bundle('../src/lib/coverDock.ts');
  const chapters = order.chapterSections(order.activeChapters(collections)).flatMap((section) => section.cities);
  const ratios = chapters.map((city) => coverRatioOf(city.coverImageUrl ?? city.photos?.[0]?.imageUrl) ?? 1.5);
  assert.equal(ratios.length, 6);
  for (const [vw, vh] of [[390, 844], [375, 667], [430, 932], [320, 568]]) {
    const scale = phoneTicketScale(vw, vh, ratios);
    const cards = ratios.map((ratio) => phoneCard(vw, vh, ratio));
    assert.equal(scale, Math.min(...cards.map((card) => card.scale)));
    assert.ok(scale >= PHONE_CARD.minScale);
    for (const card of cards) {
      // The ticket (the stub's head and a strip of the face, card px) on the
      // screen: one size for every card, never larger than the card it is
      // folded from — nor than that card's own ticket at its own scale.
      const w = Math.min(150, card.photoW) + PHONE_CARD.stub;
      const h = Math.min(card.photoH, 172);
      assert.ok(w * scale <= (card.photoW + PHONE_CARD.stub) * card.scale + 0.01);
      assert.ok(h * scale <= card.photoH * card.scale + 0.01);
      assert.ok(w * scale <= w * card.scale + 0.01 && h * scale <= h * card.scale + 0.01);
    }
  }
  const scale = phoneTicketScale(390, 844, ratios);
  assert.equal(scale, 0.72);
  assert.deepEqual([Math.round(340 * scale), Math.round(172 * scale)], [245, 124]);
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const atlas = source('src/components/home/RouteAtlas.tsx');
  // The atlas hands every switch the one scale; the carrier comes to it at
  // the arriving card's corner as it folds; the arriving card waits at it
  // and grows out of it to its own as it opens.
  assert.match(atlas, /ticketScale: phoneTicketScale\(window\.innerWidth, window\.innerHeight, chapterRoute\.map\(\(entry\) => entry\.stop\.coverRatio \?\? 1\.5\)\),/);
  assert.match(chapter, /const k = ticketK\(scale, dest\);/);
  assert.match(chapter, /Math\.min\(scale \?\? Math\.min\(card\.scale, other\?\.scale \?\? card\.scale\), card\.scale\) \/ card\.scale/);
  assert.match(chapter, /phoneGrow\(play, sw\.ticketScale, sw\.expandAt, !play\.carry\);/);
  assert.match(chapter, /play\.grow = startAt\(cover\.animate\(\[ticketTransform\(k\), ticketTransform\(1\)\], \{ duration: TICKET_EXPAND_MS, easing: CSS_EASE\.plane,/);
  assert.match(chapter, /TICKET_EXPAND_MS,\n  TICKET_FOLD_MS,/);
  // Every carry is to the one ticket size (never the arriving card's own).
  assert.doesNotMatch(chapter, /const k = dest\.scale \/ card\.scale;/);
  const carries = chapter.match(/(?<!const )phoneCarry\([^;]*;/g) ?? [];
  assert.equal(carries.length, 5);
  for (const call of carries) assert.match(call, /, sw\.ticketScale\);$/, call);
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
  // The descent: its zoom on the entry's clock, its tip over the last 80%
  // (from GLOBE_TIP_FROM), its frame from entryFrame (the planet risen in
  // the middle facing the place, the place on one line to the dock).
  const pose = atlas.slice(atlas.indexOf('function globeEntryPose('), atlas.indexOf('function isValidCoordinate('));
  assert.match(pose, /const share = entryEase\(clamp01\(progress\)\);\s*const zoom = startZoom \+ \(target\.zoom - startZoom\) \* share;/);
  assert.match(atlas, /const GLOBE_TIP_FROM = 0\.2;/);
  assert.match(atlas, /const frame = entryFrame\(\{/);
  assert.match(atlas, /rise: \{ x: document\.documentElement\.clientWidth \/ 2, y: focalPoint\.y \},/);
  assert.match(atlas, /dock: planFocal\(entryIndex\),/);
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
    assert.ok(rate <= ENTRY.zoomPerS + 1e-9, `${vw}×${vh}: from ${start.toFixed(2)} at ${rate.toFixed(2)} levels/s`);
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

test('a switch is the reference\'s turn: 1.4 s, its ENTER curve, no climb to speak of', () => {
  // 11 mois sans toi(t) (scratchpad wf29/ref/SPEC.md §2.2): flyTo 1400 ms on
  // [.22,.61,.36,1], its own curve, the pitch held, whatever the distance —
  // the planet turns under the board.
  assert.equal(SWITCH.ms, 1400);
  assert.equal(SWITCH.curve, 1.42);
  for (const dz of [0, 0.4, -0.9, 1]) assert.equal(switchMs(dz), 1400, `a leg at the rest zooms (Δz ${dz})`);
  // From far out (the reader zoomed to the planet) the turn takes longer,
  // never past maxMs.
  assert.ok(switchMs(3.45) > 1400 && switchMs(3.45) <= SWITCH.maxMs);
  assert.equal(switchMs(12), SWITCH.maxMs);
  // No big zoom-out apex between places: at the rest zooms every leg of the
  // archive climbs well under a level on Mapbox's path (1728 and 1280, the
  // canvas's larger side with its bleed).
  const rows = [];
  for (const vw of [1728, 1280]) {
    const w0 = vw + 64;
    for (const [from, to] of [...LEGS, ['new-york', 'page'], ['miami', 'zion']]) {
      const lift = switchLift(w0, pxAt(PLACES[from], PLACES[to], 5.05));
      assert.ok(lift < 0.8, `${vw} ${from}→${to}: climbs ${lift.toFixed(2)} levels`);
      if (vw === 1728) rows.push(`${from}→${to} ${lift.toFixed(2)}`);
    }
  }
  if (process.env.EXPLORER_NUMBERS) console.log(`switch lift at 1728: ${rows.join(', ')}`);
  const atlas = source('src/components/home/RouteAtlas.tsx');
  assert.match(atlas, /const plan = planSwitch\(w0, u1, dest\.zoom - zoomNow, window\.innerWidth\);\s+durationMs = plan\.durationMs;\s+curve = plan\.curve;\s+easing = plan\.ease === 'sine' \? voyageEase : turnEase;/);
  // The shields: the one arrived at lifts at the click (the reference's
  // active stop, 1.45 from its foot), the one left relaxes.
  assert.match(atlas, /if \(next\.kind === 'fly'\) \{[\s\S]{0,200}markCurrentStop\(destId\);/);
});

test('a far switch turns on the sine, the ground calm, no take-off in one frame', () => {
  // Review of 2026-09-29 (有点晕): on the turn at the rest zoom the far legs
  // raced the ground at 1.4–1.7 viewport widths a second at 1728 and took
  // off from rest to 40 px a frame in one frame (the turn starts at 2.77×
  // its mean). A neighbour keeps the reference's turn; a far leg turns on
  // the house's sine, as long as the share needs, within SWITCH.farMaxMs.
  const turn = bezier([0.22, 0.61, 0.36, 1]);
  const sine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  // The ground under the focal point, frame by frame at 60 fps: its fastest
  // and its biggest change from one frame to the next, px a frame.
  const frames = (plan, w0, u1) => {
    const path = flightPath(w0, w0, u1, plan.curve);
    const ease = plan.ease === 'sine' ? sine : turn;
    const n = Math.round(plan.durationMs / (1000 / 60));
    let prev = path.at(0);
    let prevV = 0;
    let fastest = 0;
    let jolt = 0;
    for (let i = 1; i <= n; i += 1) {
      const now = path.at(ease(i / n));
      const v = Math.abs(now.u - prev.u) * u1 * 2 ** ((now.dz + prev.dz) / 2);
      fastest = Math.max(fastest, v);
      jolt = Math.max(jolt, Math.abs(v - prevV));
      prevV = v;
      prev = now;
    }
    return { fastest, jolt };
  };
  const rows = [];
  for (const vw of [1728, 1280]) {
    const w0 = vw + 64;
    for (const [from, to] of [...LEGS.filter(([a]) => a !== 'dc'), ['page', 'new-york'], ['new-york', 'page'], ['miami', 'zion'], ['zion', 'bryce']]) {
      const u1 = pxAt(PLACES[from], PLACES[to], 5.05);
      const plan = camera.planSwitch(w0, u1, 0, vw);
      const f = frames(plan, w0, u1);
      assert.ok(plan.durationMs >= SWITCH.ms && plan.durationMs <= SWITCH.farMaxMs, `${vw} ${from}→${to}: ${plan.durationMs} ms`);
      assert.ok(plan.screenPxPerS <= SWITCH.farShare * vw * 1.01 || plan.durationMs === SWITCH.farMaxMs, `${vw} ${from}→${to}: ${Math.round(plan.screenPxPerS)} px/s`);
      assert.ok(f.jolt <= 12, `${vw} ${from}→${to}: ${f.jolt.toFixed(1)} px a frame from one frame to the next`);
      assert.ok(plan.lift < 0.8, `${vw} ${from}→${to}: no apex (${plan.lift.toFixed(2)})`);
      if (u1 < 0.3 * vw) assert.deepEqual([plan.ease, plan.durationMs], ['turn', SWITCH.ms], `${from}→${to}: a neighbour keeps the turn`);
      if (vw === 1728) rows.push(`${from}→${to} ${plan.ease} ${plan.durationMs} ms ${Math.round(plan.screenPxPerS)} px/s, jolt ${f.jolt.toFixed(1)}`);
    }
  }
  if (process.env.EXPLORER_NUMBERS) console.log(rows.join('\n'));
  // At 1728 the far legs the review measured stay under 1550 px/s for every
  // shield on screen (~1.2× the focal point under the oblique camera).
  for (const [from, to] of [['orlando', 'page'], ['page', 'new-york'], ['new-york', 'miami']]) {
    const plan = camera.planSwitch(1728 + 64, pxAt(PLACES[from], PLACES[to], 5.05), 0, 1728);
    assert.ok(plan.screenPxPerS * 1.24 <= 1560, `${from}→${to}: ${Math.round(plan.screenPxPerS)} px/s at the focal point`);
  }
  // The pin (the ticket held through the turn) rides the camera's curve.
  const atlas = source('src/components/home/RouteAtlas.tsx');
  assert.match(atlas, /ms: durationMs, ease: easing \};/);
});

test('the entry cut short plays its rest quickly, never a jump', () => {
  // Review of 2026-09-29: a click 0.6 s into the descent jumped the camera
  // from the whole planet to the place in one frame, then 60–150 ms of flat
  // unloaded ground. Now: from where the clock is, at its pace, landing at
  // rest; the zoom under twice the flights' cap (a first-half cut of a
  // whole-planet descent within ENTRY_FINISH.maxMs).
  const { ENTRY_FINISH, ENTRY_SPAN, finishEntry } = camera;
  assert.ok(Math.abs(ENTRY_SPAN - entryZoomRate(0, 1) * 0 - (5.05 - entryStartZoom(0, 5.05))) < 1e-9);
  const sine = entryEase;
  for (const p0 of [0, 0.08, 0.2, 0.4, 0.6, 0.8, 0.95]) {
    const v0 = 1000 / ENTRY.diveMs;
    const plan = finishEntry(p0, v0, ENTRY_SPAN);
    assert.ok(plan.ms >= ENTRY_FINISH.minMs && plan.ms <= ENTRY_FINISH.maxMs, `${p0}: ${plan.ms} ms`);
    assert.ok(Math.abs(plan.at(0) - p0) < 1e-6 && plan.at(1) === 1);
    let prev = plan.at(0);
    for (let i = 1; i <= 100; i += 1) {
      const p = plan.at(i / 100);
      assert.ok(p >= prev - 1e-9, `${p0}: never back`);
      prev = p;
    }
    assert.ok(plan.zoomPerS <= ENTRY_FINISH.zoomPerS + 1e-6 || plan.ms === ENTRY_FINISH.maxMs, `${p0}: ${plan.zoomPerS.toFixed(2)} levels/s`);
    assert.ok(plan.zoomPerS <= 3, `${p0}: ${plan.zoomPerS.toFixed(2)} levels/s at most`);
    // Velocity-continuous: its first step goes on at about the clock's pace
    // (no lurch), and it lands at rest.
    const dt = plan.ms / 1000 / 100;
    const first = (ENTRY_SPAN * (sine(plan.at(0.01)) - sine(plan.at(0)))) / dt;
    const before = ENTRY_SPAN * entryEaseRate(p0) * v0;
    assert.ok(Math.abs(first - before) <= 0.35, `${p0}: ${first.toFixed(2)} vs ${before.toFixed(2)} levels/s`);
    const last = (ENTRY_SPAN * (sine(plan.at(1)) - sine(plan.at(0.99)))) / dt;
    assert.ok(last <= 0.1, `${p0}: lands at rest (${last.toFixed(3)})`);
  }
  // The page plays it, and the phone turns onto the place from the live
  // camera; the press that cut it short never clicks what lies under it.
  const home = source('src/components/home/HomePage.tsx');
  assert.match(home, /const plan = finishEntryPlan\(p0, 1000 \/ ENTRY\.diveMs, ENTRY_SPAN\);/);
  assert.doesNotMatch(home.slice(home.indexOf('const finishEntry = useCallback'), home.indexOf('// A window that crosses')), /entryProgress\.set\(1\)/);
  assert.match(home, /entryFlightRef\.current = nextFlight\('finish', id, true\);/);
  assert.match(home, /window\.addEventListener\('click', swallow, \{ capture: true, once: true \}\);/);
  const atlas = source('src/components/home/RouteAtlas.tsx');
  assert.match(atlas, /durationMs = ENTRY_FINISH\.phoneMs;/);
  // Cutting it short never makes it later: an entry down sooner on its own
  // is left to land.
  assert.match(home, /if \(left <= plan\.ms\) return true;/);
  assert.match(home, /entryFlightRef\.current != null && left > ENTRY_FINISH\.phoneMs/);
});

test('the stub hand-off: a derived target, a landing event, a stub that waits', () => {
  assert.equal(ENTRY_LANDED_EVENT, 'archive:entry-landed');
  assert.equal(STUB_LANDED_EVENT, 'archive:stub-landed');
  assert.ok(STUB_WAIT_MS >= 2000);
  // The phone's card stub: where the card stands (centred, its foot 110 px
  // above the screen's), right of the photograph, at the card's scale.
  for (const [vw, vh] of [[390, 844], [375, 667]]) {
    for (const ratio of [2 / 3, 1.5]) {
      const card = phoneCard(vw, vh, ratio);
      const rect = phoneStubRect(vw, vh, ratio);
      const width = (card.photoW + PHONE_CARD.stub) * card.scale;
      assert.ok(Math.abs(rect.x + rect.w - (vw / 2 + width / 2)) < 0.01, 'the stub is the card\'s right end');
      assert.ok(Math.abs(rect.y + rect.h - (vh - PHONE_CARD.dockBottom - PHONE_CARD.below)) < 0.01, 'its foot is the card\'s');
      assert.ok(Math.abs(rect.w - PHONE_CARD.stub * card.scale) < 0.01);
      assert.equal(rect.rotate, 0);
    }
  }
  const css = source('src/styles/global.css');
  assert.match(css, new RegExp(`\\.archive-dock\\.archive-dock--phone \\{[^}]*bottom: calc\\(${PHONE_CARD.dockBottom}px`));
  assert.match(css, new RegExp(`\\.archive-dock--phone \\.archive-dock__seat \\{[^}]*bottom: ${PHONE_CARD.below}px`));
  // The atlas answers the target from its plan (never a rect read), and says
  // when the entry is down, on every way the entry lands.
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const target = atlas.slice(atlas.indexOf('window.__archiveCoverStubTarget = () => {'), atlas.indexOf('delete window.__archiveCoverStubTarget'));
  assert.match(target, /coverStubRect\(planned\)/);
  assert.match(target, /phoneStubRect\(window\.innerWidth, window\.innerHeight/);
  assert.doesNotMatch(target, /getBoundingClientRect|offset(Width|Height|Top|Left)|client(Width|Height)/);
  assert.equal((atlas.match(/entryLanded\(entryIndex\);/g) ?? []).length, 2, 'the descent down, and reduced motion\'s cut');
  assert.match(atlas, /if \(done\.entry\) entryLanded\(done\.index\);/);
  // HomePage keeps stop 01's stub waiting when asked with `stubHandoff`; the
  // chapter shows its stub inside the entrance's event itself.
  const home = source('src/components/home/HomePage.tsx');
  assert.match(home, /if \(ask\.stubHandoff && explorerRef\.current\.phase === 'globe'\) setStubAwaited\(stopOne\(placeIdsRef\.current\)\);/);
  assert.match(home, /stubAwaited=\{stubAwaited === city\._id\}/);
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  // The tip's pop is set up (held in, from the landing) before the stub
  // shows, so no frame has the tip out while the stub is away.
  assert.match(chapter, /const landed = \(\) => \{\s+if \(!reduce\) popTip\(null, performance\.now\(\)\);\s+plate\.removeAttribute\('data-stub-awaited'\);\s+\};\s+window\.addEventListener\(STUB_LANDED_EVENT, landed\);/);
  // Everything printed on the stub waits (its live "Next stop" says
  // `visibility: visible` of its own, so the seat alone is not enough), and
  // the tip, whichever half it is cut from.
  assert.match(css, /\.archive-plate\[data-stub-awaited\] :is\(\.archive-ticket-stub-seat, \.archive-ticket-stub-seat \*\) \{\s*visibility: hidden;/);
  assert.match(css, /\.archive-plate\[data-stub-awaited\] \.archive-plate__caret \{\s*visibility: hidden;/);
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

test('the atlas\'s draw loop never dies: a draw asked for from inside a draw goes to the next frame', async () => {
  // Found joining the entrance v2 (2026-09-29): a story closed over the
  // reader's map restarts the atlas's frame loop, and its first draw sets the
  // map's padding — a 'move', whose handler asks for a draw from INSIDE the
  // draw. Motion's render step puts an `immediate` ask into the batch it is
  // running, which still holds that very draw: the ask was dropped, the
  // guard (classicMapFrameRef) stayed set, and every later ask was refused —
  // Back to the start then left the camera down on Miami, the entry never
  // came down again, and the stub hand-off never heard it land. Motion's own
  // frame loop, driven here by a stand-in for requestAnimationFrame:
  globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(performance.now()), 2);
  const { frame } = await import('motion-dom');
  const loop = (immediateInside) => {
    let queued = null;
    let drawing = false;
    let draws = 0;
    let moved = false;
    const schedule = () => {
      if (queued) return;
      queued = draw;
      frame.render(draw, false, immediateInside ? true : !drawing);
    };
    function draw() {
      queued = null;
      drawing = true;
      draws += 1;
      // The first draw's own move (the padding set) asks for a draw.
      if (!moved) {
        moved = true;
        schedule();
      }
      drawing = false;
    }
    return { schedule, count: () => draws };
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
  const broken = loop(true);
  broken.schedule();
  await settle();
  broken.schedule(); // the entry's clock back to 0 (Back to the start)
  await settle();
  assert.equal(broken.count(), 1, 'the old way: the loop is dead after its first draw');
  const fixed = loop(false);
  fixed.schedule();
  await settle();
  fixed.schedule();
  await settle();
  assert.equal(fixed.count(), 3, 'the self-ask draws next frame, and a later ask still draws');
  // The atlas schedules that way.
  const atlas = source('src/components/home/RouteAtlas.tsx');
  assert.match(atlas, /classicMapFrameRef\.current = draw;\s+frame\.render\(draw, false, !drawing\);/);
  const draw = atlas.slice(atlas.indexOf('const draw: Process = () => {'), atlas.indexOf('const schedule = () => {'));
  assert.match(draw, /^const draw: Process = \(\) => \{\s+if \(disposed\) return;\s+classicMapFrameRef\.current = null;\s+drawing = true;/);
  assert.match(draw, /drawing = false;\s+\};\s+$/);
  assert.equal((draw.match(/return;/g) || []).length, 1, 'one way out of a draw: its end (drawing is cleared)');
});

test('the homepage hands the entrance a seam: an event, a function, a record', () => {
  const lib = source('src/lib/explorer.ts');
  assert.match(lib, /export const EXPLORE_EVENT = 'archive:explore'/);
  assert.match(lib, /export function requestExplore/);
  const home = source('src/components/home/HomePage.tsx');
  assert.match(home, /EXPLORE_EVENT/);
  assert.match(home, /__archiveExploreAsked/, 'an ask made before the page mounted is kept');
  // The boarding pass, torn, asks once the glide has brought the globe up —
  // itself, with its stub's hand-off (entrance v2) — and nothing synthetic
  // follows the ask (a real key, press or new wheel cuts the entry short).
  const entrance = source('src/components/home/EntranceIntro.tsx');
  assert.match(entrance, /requestExplore\(\{ from: 'boarding-pass', stubHandoff, \.\.\.\(arrivingMs > 0 \? \{ arrivingMs \} : null\) \}\)/);
  assert.match(lib, /stubHandoff\?: boolean;/);
  assert.doesNotMatch(home, /onEntranceArrived|onArrived=/);
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
  // The entry's descent is long enough for its own zoom and tip (see ENTRY):
  // it starts under the entrance's glide and has ENTRY.afterGlideMs left
  // once the page has landed.
  // Owner, 2026-09-29 (飞入地球的速度可以快一点): quicker than the 3.9 s it
  // was, under the cap the entry keeps (planned 1.6 levels/s; ~1.7 traced).
  assert.equal(ENTRY.diveMs, ENTRY.glideMs + ENTRY.afterGlideMs);
  assert.ok(ENTRY.diveMs >= 2200 && ENTRY.diveMs <= 2600 && ENTRY.glideMs <= 1100);
  assert.ok(ENTRY.zoomPerS <= 1.65);
  assert.ok(entryZoomRate(entryStartZoom(0, 5.05), 5.05) <= ENTRY.zoomPerS + 1e-9);
  assert.ok((Math.PI / 2) * (24 / ((ENTRY.diveMs / 1000) * 0.8)) <= 21, 'the tip over its last 80% stays under 21°/s');
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

test("the entry's clock: a cruise between two soft ramps, quicker than the sine at its peak", () => {
  assert.equal(entryEase(0), 0);
  assert.ok(Math.abs(entryEase(1) - 1) < 1e-12);
  assert.ok(Math.abs(entryEase(0.5) - 0.5) < 1e-12);
  let prev = 0;
  let peak = 0;
  const N = 2000;
  for (let i = 1; i <= N; i += 1) {
    const y = entryEase(i / N);
    assert.ok(y >= prev - 1e-12, 'never back');
    peak = Math.max(peak, (y - prev) * N);
    prev = y;
  }
  // Its peak is 1 / (1 − ramp) of the mean: under the sine's π/2.
  assert.ok(Math.abs(peak - ENTRY_PEAK) < 0.01, peak.toFixed(3));
  assert.ok(ENTRY_PEAK < Math.PI / 2);
  // At rest at both ends, and its pace is its slope.
  assert.equal(entryEaseRate(0), 0);
  assert.ok(entryEaseRate(1) < 1e-12);
  for (const t of [0.1, 0.3, 0.5, 0.8, 0.97]) {
    const slope = (entryEase(t + 1e-5) - entryEase(t - 1e-5)) / 2e-5;
    assert.ok(Math.abs(slope - entryEaseRate(t)) < 1e-4, `${t}`);
    assert.ok(Math.abs(entryEaseInverse(entryEase(t)) - t) < 1e-6);
  }
});

test("the entry's frame: the planet rises in the middle facing the place, and lands on the rest pose", () => {
  // 1728 × 1000 at Miami, as the built page plans it: the focal point
  // (542, 480), the dock's point (1074, 200).
  const input = {
    place: [-80.19, 25.77],
    restCentre: [-91.3, 21.2],
    startZoom: 2.2,
    restZoom: 5.05,
    rise: { x: 864, y: 480 },
    dock: { x: 1074, y: 200 },
    focal: { x: 542, y: 480 },
    pitch: 0,
    bearing: 0,
    restPitch: 24,
    restBearing: -2,
    distance: 1.5 * 1064,
  };
  // Risen: the camera on the place, its focal point in the middle.
  const start = entryFrame(input, 0);
  assert.deepEqual(start.centre, input.place);
  assert.ok(Math.hypot(start.focal.x - 864, start.focal.y - 480) < 1e-6);
  assert.equal(start.zoom, 2.2);
  // Down: the chapters' resting camera, exactly.
  const end = entryFrame({ ...input, pitch: 24, bearing: -2 }, 1);
  assert.deepEqual(end.centre, input.restCentre);
  assert.deepEqual(end.focal, input.focal);
  assert.equal(end.zoom, 5.05);
  // …and a hair before, all but there (no snap at the end).
  const near = entryFrame({ ...input, pitch: 24, bearing: -2 }, 0.999);
  assert.ok(Math.hypot(near.focal.x - 542, near.focal.y - 480) < 3, JSON.stringify(near.focal));
  // On the way the place is drawn on the line from the middle to the dock,
  // never back.
  let prevX = 864;
  for (let k = 0.1; k < 1; k += 0.1) {
    const f = entryFrame({ ...input, pitch: 24 * k, bearing: -2 * k }, k);
    assert.ok(f.placeAt.x >= prevX - 1e-9 && f.placeAt.x <= 1074 && f.placeAt.y <= 480 && f.placeAt.y >= 200);
    prevX = f.placeAt.x;
  }
});

test("the phone's entry: under the glide, on the desktop's clock", () => {
  // From PHONE_APPROACH_ZOOM (3.2) onto a place at 5.05: the desktop's
  // diveMs from the glide's start (it was the glide plus 2.4 s).
  assert.equal(phoneEntryMs(1.85, 2530, 1000), ENTRY.diveMs);
  assert.ok((Math.PI / 2) * 1.85 / (phoneEntryMs(1.85, 2530, 1000) / 1000) <= ENTRY.zoomPerS);
  // A long way down still keeps the cap.
  assert.ok((Math.PI / 2) * 5 / (phoneEntryMs(5, 4000, 1000) / 1000) <= ENTRY.zoomPerS + 1e-9);
  // Nothing gliding first: at least phoneMinMs.
  assert.equal(phoneEntryMs(1.85, 1000, 0), ENTRY.phoneMinMs);
  const atlas = source('src/components/home/RouteAtlas.tsx');
  assert.match(atlas, /durationMs = next\.kind === 'entry' \? phoneEntryMs\(dest\.zoom - zoomNow, plan\.durationMs, Math\.max\(0, next\.leadMs \?\? 0\)\) : plan\.durationMs;/);
});
