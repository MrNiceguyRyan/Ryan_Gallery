// Run offline: node --experimental-strip-types --test scripts/explorer-drift.test.mjs
//
// Letting go of a place the reader has left, and coming back to it
// (src/lib/explorerDrift.ts, the explorer's 'drift' and 'recentre' in
// src/lib/explorer.ts). Owner, 2026-09-29: 我飞出去了很远依旧显示miami，修复这个
// 反逻辑问题，同时增加一个重定位的功能. What the reader looks at decides what the
// ticket and the rail say: a look round the neighbours holds the place; a
// drag that takes it off the view, past the hold ellipse or over the planet's
// limb lets it go (a fade, no tear); nothing switches by itself; Recentre
// goes back to the place in hand, else the last one held, else stop 01.
import assert from 'node:assert/strict';
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
const drift = await bundle('../src/lib/explorerDrift.ts');
const explorer = await bundle('../src/lib/explorer.ts');
const dock = await bundle('../src/lib/coverDock.ts');
const { DRIFT, arcDeg, limbDeg, overLimb, shareIn, mapView, plateAt, holds, drifted, offerOf, offerRing, recentreTarget, recentreShown, phoneView } = drift;
const { explore } = explorer;

const ORDER = ['miami', 'orlando', 'page', 'zion', 'bryce', 'newyork'];
const MIAMI = [-80.19, 25.76];
const exploring = (current) => ({ phase: 'explore', current });

// The desktop at 1728 × 1000, as measured on the built page (2026-09-29):
// Miami's shield's foot on the dock at (1074, 200), its ticket below-left of
// it (908 × 479 from (134, 208)); the rail from x = 1232.
const VIEW = mapView(1728, 1000, dock.railBox(1728).left);
const DOCK_AT = { x: 1074, y: 200 };
const OFFSET = { x: 134 - 1074, y: 208 - 200 };
const ticket = (point) => plateAt(point, OFFSET, 908, 479);
const at = (dx, dy) => {
  const point = { x: DOCK_AT.x + dx, y: DOCK_AT.y + dy };
  return { point, view: VIEW, plate: ticket(point), behind: false };
};

test('the view the reader sees: the open map on the desktop, the band above the card on a phone', () => {
  assert.deepEqual(VIEW, { left: 0, top: DRIFT.navBand, right: 1232, bottom: 1000 - DRIFT.footBand });
  const band = phoneView(390, 844, 844 - 72 - 250 - 12);
  assert.deepEqual(band, { left: 0, top: 88, right: 390, bottom: 510 });
  // A card taller than the screen leaves a band of at least 40 px.
  assert.equal(phoneView(390, 300, 20).bottom, 128);
});

test('shareIn: how much of a box shows on the view', () => {
  const view = { left: 0, top: 0, right: 100, bottom: 100 };
  assert.equal(shareIn({ left: 10, top: 10, right: 60, bottom: 60 }, view), 1);
  assert.equal(shareIn({ left: 50, top: 0, right: 150, bottom: 100 }, view), 0.5);
  assert.equal(shareIn({ left: 200, top: 0, right: 300, bottom: 100 }, view), 0);
  assert.equal(shareIn({ left: 0, top: 0, right: 0, bottom: 10 }, view), 0, 'an empty box shows nothing');
});

test('a look round holds the place; a drag that takes it out of view lets it go', () => {
  assert.equal(holds(at(0, 0)), true, 'at rest on its dock');
  // A look round: the next place along the coast, the planet turned a little.
  assert.equal(holds(at(-300, 120)), true);
  assert.equal(holds(at(-700, 300)), true, 'far from the dock, its shield still on the map');
  // The shield under the rail, most of the ticket still on the map: held.
  assert.equal(holds(at(200, 0)), true);
  // The shield under the nav's band, the ticket still showing: held.
  assert.equal(holds(at(0, -170)), true);
  // Dragged right until a third of the ticket is under the rail: let go
  // (the globe's own trace at 1728: foot at x 1698, plate 758–1666).
  assert.equal(holds(at(700, 0)), false);
  assert.equal(holds({ point: { x: 1698, y: 334 }, view: VIEW, plate: { left: 758, top: 342, right: 1666, bottom: 821 }, behind: false }), false);
  // Dragged up off the top, shield and ticket: let go.
  assert.equal(holds(at(0, -520)), false);
  // Dragged left off the screen: let go once the shield has gone and less
  // than two thirds of the ticket shows.
  assert.equal(holds(at(-1080, 0)), false);
  assert.equal(holds(at(-3000, 1200)), false, 'far off the screen');
  // The shield on the map but its ticket gone: held (the place is in view).
  assert.equal(holds({ ...at(-1000, 400), plate: ticket({ x: -5000, y: 0 }) }), true);
  // Over the planet's limb, wherever the projection says it stands.
  assert.equal(holds({ ...at(0, 0), behind: true }), false, 'on the far side');
  // Nothing to read: let go.
  assert.equal(holds({ ...at(0, 0), point: null }), false);
  assert.equal(holds({ ...at(0, 0), point: { x: Number.NaN, y: 3 } }), false);
  // A phone (no ticket riding the map): its shield in the band above the card.
  const band = phoneView(390, 844, 510);
  assert.equal(holds({ point: { x: 195, y: 300 }, view: band, plate: null, behind: false }), true);
  assert.equal(holds({ point: { x: 195, y: 600 }, view: band, plate: null, behind: false }), false, 'under the card');
  assert.equal(holds({ point: { x: -20, y: 300 }, view: band, plate: null, behind: false }), false, 'off the side');
});

test('the planet\'s limb: derived from the zoom and the camera\'s distance', () => {
  assert.ok(Math.abs(arcDeg([0, 0], [90, 0]) - 90) < 1e-9);
  assert.ok(Math.abs(arcDeg([0, 0], [180, 0]) - 180) < 1e-9);
  assert.ok(Math.abs(arcDeg([-80.19, 25.76], [-80.19, 25.76])) < 1e-9);
  assert.ok(Math.abs(arcDeg([170, 10], [-170, 10]) - arcDeg([-10, 10], [10, 10])) < 1e-9, 'across the antimeridian');
  // 1.5 canvas heights (1000 px) away: zoomed out to the whole planet the
  // camera sees ~82° round; at a place's rest zoom, ~50°.
  const distance = 1.5 * 1000;
  const whole = limbDeg(1.6, distance);
  const rest = limbDeg(5.05, distance);
  assert.ok(whole > 78 && whole < 86, `whole planet ${whole}`);
  assert.ok(rest > 45 && rest < 56, `rest ${rest}`);
  assert.ok(limbDeg(8, distance) < rest, 'closer in, the limb comes nearer');
  // The far side of the planet (the owner's screenshot: dragged away from
  // Florida to empty dark ground): over the limb.
  assert.equal(overLimb(MIAMI, [100, 10], 1.6, distance), true, 'Miami from over Asia');
  assert.equal(overLimb(MIAMI, [-90, 35], 1.6, distance), false, 'Miami from over the States');
  // The margin: a place just inside the true limb already counts as over it.
  const near = whole - DRIFT.limbMarginDeg / 2;
  assert.equal(overLimb([near, 0], [0, 0], 1.6, distance), true);
});

test('drifted: the foot off its dock, or the zoom off its rest', () => {
  assert.equal(drifted(DOCK_AT, DOCK_AT, 5.05, 5.05), false);
  assert.equal(drifted({ x: DOCK_AT.x + DRIFT.offPx - 1, y: DOCK_AT.y }, DOCK_AT, 5.05, 5.05), false, 'a nudge is not a drift');
  assert.equal(drifted({ x: DOCK_AT.x + DRIFT.offPx + 1, y: DOCK_AT.y }, DOCK_AT, 5.05, 5.05), true);
  assert.equal(drifted(DOCK_AT, DOCK_AT, 5.05 - DRIFT.offZoom - 0.01, 5.05), true, 'zoomed out, on the place');
  assert.equal(drifted(DOCK_AT, DOCK_AT, 5.05 + DRIFT.offZoom - 0.01, 5.05), false);
  assert.equal(drifted(null, DOCK_AT, 5, 5), true);
});

test('the offer: the place nearest the view\'s middle, within its ring, on this side of the planet', () => {
  const ring = offerRing(VIEW);
  assert.deepEqual([ring.x, ring.y], [1232 / 2, (DRIFT.navBand + 1000 - DRIFT.footBand) / 2]);
  assert.ok(Math.abs(ring.r - DRIFT.offer * (1000 - DRIFT.footBand - DRIFT.navBand)) < 1e-9);
  const near = (dx, dy) => ({ x: ring.x + dx, y: ring.y + dy });
  const points = { zion: near(40, 10), bryce: near(-20, 0), page: near(ring.r + 1, 0) };
  assert.equal(offerOf(points, VIEW), 'bryce', 'the nearest');
  assert.equal(offerOf(points, VIEW, (id) => id === 'bryce'), 'zion', 'not one over the limb');
  assert.equal(offerOf({ page: near(ring.r + 1, 0) }, VIEW), null, 'none within the ring: nothing offered');
  assert.equal(offerOf({}, VIEW), null);
});

test('drift lets the place in hand go, as the empty map does; only in the explorer', () => {
  const left = explore(exploring('miami'), { type: 'drift' }, ORDER);
  assert.deepEqual(left.state, exploring(null));
  assert.deepEqual(left.effects, [{ type: 'release', id: 'miami' }], 'its cover fades; nothing tears, the camera stays the reader\'s');
  assert.deepEqual(explore(left.state, { type: 'drift' }, ORDER).effects, [], 'nothing in hand, nothing to let go');
  assert.deepEqual(explore({ phase: 'entering', current: 'miami' }, { type: 'drift' }, ORDER).effects, [], 'never mid-entry');
  assert.deepEqual(explore({ phase: 'globe', current: null }, { type: 'drift' }, ORDER).effects, []);
});

test('recentre: the place in hand, else the last held, else stop 01 — the switch\'s own move', () => {
  assert.equal(recentreTarget(ORDER, 'zion', 'miami'), 'zion');
  assert.equal(recentreTarget(ORDER, null, 'page'), 'page');
  assert.equal(recentreTarget(ORDER, null, 'gone'), 'miami', 'a last place no longer on the map: stop 01');
  assert.equal(recentreTarget(ORDER, null, null), 'miami');
  assert.equal(recentreTarget([], null, null), null);

  // Drifted off the place in hand: back onto it (the same place again: the
  // camera comes back, its ticket carried and docked).
  const back = explore(exploring('zion'), { type: 'recentre', last: 'miami' }, ORDER);
  assert.deepEqual(back.state, exploring('zion'));
  assert.deepEqual(back.effects, [{ type: 'fly', id: 'zion', from: 'zion' }]);
  // Let go (dragged away, or Escape): back to the last held.
  const let_ = explore(exploring('page'), { type: 'drift' }, ORDER);
  const again = explore(let_.state, { type: 'recentre', last: 'page' }, ORDER);
  assert.deepEqual(again.state, exploring('page'));
  assert.deepEqual(again.effects, [{ type: 'fly', id: 'page', from: null }], 'from the open map: the cover appears once down');
  // Nothing ever held: stop 01.
  assert.deepEqual(explore(exploring(null), { type: 'recentre' }, ORDER).effects, [{ type: 'fly', id: 'miami', from: null }]);
  // Never before the explorer is the reader's, nor with no places.
  assert.deepEqual(explore({ phase: 'entering', current: 'miami' }, { type: 'recentre', last: 'miami' }, ORDER).effects, []);
  assert.deepEqual(explore({ phase: 'globe', current: null }, { type: 'recentre' }, ORDER).effects, []);
  assert.deepEqual(explore(exploring(null), { type: 'recentre' }, []).effects, []);
  // Nothing tears on the way back.
  assert.ok(!again.effects.some((effect) => effect.type === 'tear-stub'));
});

test('the Recentre control: only in the reader\'s map, never in a flight of ours', () => {
  const base = { free: true, flying: false, places: 6, current: 'miami', drifted: false };
  assert.equal(recentreShown(base), false, 'at rest on the place: nothing to recentre');
  assert.equal(recentreShown({ ...base, drifted: true }), true);
  assert.equal(recentreShown({ ...base, current: null }), true, 'nothing in hand: back to the last');
  assert.equal(recentreShown({ ...base, drifted: true, flying: true }), false);
  assert.equal(recentreShown({ ...base, current: null, free: false }), false, 'not before the explorer is entered');
  assert.equal(recentreShown({ ...base, current: null, places: 0 }), false);
});
