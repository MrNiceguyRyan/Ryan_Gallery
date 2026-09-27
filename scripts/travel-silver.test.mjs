// Run offline: node --experimental-strip-types --test scripts/travel-silver.test.mjs
//
// /travel's atlas in silver (src/lib/travelSilver.ts): the print's ramp and
// its place grade, the chapters in the homepage's order and numbering, the
// one landing every path uses, the flight clock, the route's length, the
// scale collar and the callout that sets the Southwest's three names. The
// module imports its siblings without extensions (Vite's way), so it is
// bundled first.
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
const T = await bundle('../src/lib/travelSilver.ts');
const { bezierFn, EASE } = await bundle('../src/lib/motion.ts');
const { SILVER_RAMP } = await bundle('../src/lib/globeLook.ts');
const { TICKET_STOCK } = await bundle('../src/lib/ticketStock.ts');

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// The archive as it stands: six chapters, New York in two places.
const place = (city, lat, lng, n) => Array.from({ length: n }, (_, i) => ({
  // A 40-hex asset hash per frame, as Sanity's file names carry.
  imageUrl: `https://cdn.sanity.io/images/p/d/${Buffer.from(city).toString('hex').slice(0, 20).padEnd(20, '0')}${String(i).padStart(20, '0')}-6048x4032.jpg`,
  width: i % 3 === 0 ? 4032 : 6048,
  height: i % 3 === 0 ? 6048 : 4032,
  location: { lat, lng, city, country: 'United States' },
}));
const collection = (slug, name, region, year, routeOrder, photos) => ({
  _id: slug, slug, name, region, year, routeOrder, photos, coverImageUrl: photos[photos.length - 1].imageUrl,
});
const COLLECTIONS = [
  collection('new-york-stories', 'New York', 'New York', 2025, 60, [...place('Manhattan', 40.758, -73.9855, 1), ...place('Midtown', 40.7484, -73.9857, 1)]),
  collection('miami', 'Miami', 'Florida', 2026, 10, place('Miami', 25.7617, -80.1918, 15)),
  collection('page', 'Page', 'Arizona', 2026, 30, place('Page', 36.9147, -111.4558, 11)),
  collection('orlando', 'Orlando', 'Florida', 2026, 20, place('Orlando', 28.5383, -81.3792, 17)),
  collection('zion-national-park', 'Zion', 'Utah', 2026, 40, place('Zion', 37.2982, -113.0263, 8)),
  collection('bryce-canyon-national-park', 'Bryce Canyon', 'Utah', 2026, 50, place('Bryce Canyon', 37.593, -112.1871, 5)),
];
const chapters = T.travelChapters(COLLECTIONS);

test('the print: the top of the ramp stays below paper and below the homepage print', () => {
  const top = T.TRAVEL_RAMP[T.TRAVEL_RAMP.length - 1][1];
  assert.ok(luminance(top) < luminance('#F4F4ED'), 'bone ink stands above the brightest rock');
  assert.ok(luminance(top) < luminance(SILVER_RAMP[SILVER_RAMP.length - 1][1]), 'one step below the globe\'s paper');
  for (let i = 1; i < T.TRAVEL_RAMP.length; i += 1) {
    assert.ok(T.TRAVEL_RAMP[i][0] > T.TRAVEL_RAMP[i - 1][0], 'stops ascend');
    assert.ok(luminance(T.TRAVEL_RAMP[i][1]) > luminance(T.TRAVEL_RAMP[i - 1][1]), 'and so does their ink');
  }
  const ramp = T.travelRamp();
  assert.deepEqual(ramp.slice(0, 3), ['interpolate', ['linear'], ['raster-value']], 'a constant expression, never on zoom');
  assert.ok(!JSON.stringify(T.travelSatellitePaint()).includes('"zoom"'), 'no zoom expression on raster paint');
});

test('the place grade: 1/0 over the overview, 0.70/0.16 at a place, monotonic and quantised', () => {
  assert.deepEqual(T.placeGrade(3), { brightness: 1, contrast: 0 });
  assert.deepEqual(T.placeGrade(7), { brightness: 0.7, contrast: 0.16 });
  let last = T.placeGrade(3.5);
  const seen = new Set();
  for (let z = 3.5; z <= 7.5; z += 0.01) {
    const g = T.placeGrade(z);
    assert.ok(g.brightness <= last.brightness + 1e-12, `brightness never rises with zoom (z ${z.toFixed(2)})`);
    assert.ok(g.contrast >= last.contrast - 1e-12, 'contrast never falls');
    assert.equal(Math.round(g.brightness * 40), g.brightness * 40, 'brightness is quantised to 1/40');
    seen.add(g.brightness);
    last = g;
  }
  assert.ok(seen.size <= 13, `a flight makes a dozen writes at most (${seen.size})`);
});

test('the chapters: homepage order, numbers, stocks, frames numbered across the issue', () => {
  assert.deepEqual(chapters.map((c) => c.slug), ['miami', 'orlando', 'page', 'zion-national-park', 'bryce-canyon-national-park', 'new-york-stories']);
  assert.deepEqual(chapters.map((c) => c.ordinal), ['01', '02', '03', '04', '05', '06']);
  assert.deepEqual(chapters.map((c) => c.stock), chapters.map((c) => TICKET_STOCK[c.slug]));
  assert.equal(chapters.reduce((sum, c) => sum + c.frames.length, 0), 58);
  assert.deepEqual(chapters.map(T.frameRange), ['01–15', '16–32', '33–43', '44–51', '52–56', '57–58']);
  const ny = chapters[5];
  assert.equal(ny.places.length, 2, 'New York is one chapter of two places');
  assert.equal(ny.places[ny.lead].city, 'Midtown', 'its mark stands where the cover was made');
  assert.equal(T.figuresLine(ny), '02 frames · 2025 · 2 places', 'no region that only repeats the name');
  assert.equal(T.figuresLine(chapters[0]), 'Florida · 15 frames · 2026');
  assert.equal(T.framesLabel(1), '01 frame', 'never "1 frames"');
  for (const c of chapters) assert.ok(c.coverRatio >= 0.45 && c.coverRatio <= 2.4, 'the ticket ratio rule');
  // Unordered collections keep the published order (HomePage's rule).
  const partial = T.travelChapters(COLLECTIONS.map((c, i) => (i === 0 ? { ...c, routeOrder: undefined } : c)));
  assert.equal(partial[0].slug, 'new-york-stories');
});

test('the landing: one camera per chapter; New York at street scale with both corners apart', () => {
  const desktop = { compact: false, feather: 80 };
  const miami = T.landingCamera(chapters[0], desktop);
  assert.equal(miami.zoom, T.PLACE_ZOOM);
  assert.deepEqual(miami.center, T.leadOf(chapters[0]));
  assert.deepEqual(miami.padding, { top: 40, right: 96, bottom: 40, left: 40 });
  const ny = T.landingCamera(chapters[5], desktop);
  assert.ok(ny.zoom <= T.STREET_ZOOM_MAX && ny.zoom > T.PLACE_ZOOM, `z${ny.zoom}`);
  const size = { width: 1340, height: 784 };
  const [a, b] = chapters[5].places.map((p) => T.projectAround([p.lng, p.lat], ny, size));
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= T.PLACES_APART_PX - 0.5, 'Manhattan and Midtown stand apart');
  assert.ok([a, b].every((p) => p.x > 40 && p.x < size.width - 96 && p.y > 40 && p.y < size.height - 40), 'both on screen');
  const phone = T.landingCamera(chapters[2], { compact: true, sheet: T.sheetHeight('detail', 844, 700) });
  assert.equal(phone.padding.bottom, T.sheetHeight('detail', 844, 700) + 16, 'the phone frames what the sheet leaves');
});

test('the flight clock and the route', () => {
  assert.equal(T.flightMs(0), 900);
  assert.equal(T.flightMs(3000), 1600);
  assert.equal(T.flightMs(20000), 1600);
  for (let km = 0; km < 5000; km += 50) {
    const ms = T.flightMs(km);
    assert.ok(ms >= 900 && ms <= 1600);
    assert.ok(ms >= T.flightMs(Math.max(0, km - 50)), 'further never flies faster');
  }
  const leads = chapters.map(T.leadOf);
  const km = T.routeKm(leads);
  assert.ok(km > 6700 && km < 6900, `five legs, lead to lead (${km.toFixed(0)} km)`);
  assert.equal(T.groupThousands(6792.4), '6 792');
  const travel = bezierFn(EASE.travel);
  assert.equal(travel(0), 0);
  assert.equal(travel(1), 1);
  assert.ok(Math.abs(travel(0.5) - 0.5) < 1e-6, 'symmetric curve crosses the middle');
  let prev = 0;
  for (let x = 0; x <= 1; x += 0.01) { const y = travel(x); assert.ok(y >= prev - 1e-9); prev = y; }
});

test('the scale collar: the largest 1 / 2 / 5 × 10ⁿ that fits', () => {
  assert.equal(T.niceScale(1100), 1000);
  assert.equal(T.niceScale(560000), 500000);
  assert.equal(T.niceScale(210000), 200000);
  assert.equal(T.niceScale(99), 50);
  assert.equal(T.scaleLabel(500000), '500 km');
  assert.equal(T.scaleLabel(2000000), '2 000 km');
  assert.equal(T.scaleLabel(50), '50 m');
  const mpp = T.metresPerPixel(7, 37);
  assert.ok(mpp > 480 && mpp < 500, `${mpp} m/px at z7, 37°N`);
});

test('the callout: groups join at 58px and part only past 74px', () => {
  const pts = (d) => [{ x: 100, y: 100 }, { x: 100 + d, y: 100 }, { x: 600, y: 400 }];
  assert.deepEqual(T.calloutGroups(pts(57)), [[0, 1], [2]]);
  assert.deepEqual(T.calloutGroups(pts(60)), [[0], [1], [2]], 'apart past the join');
  const joined = T.calloutGroups(pts(50));
  assert.deepEqual(T.calloutGroups(pts(70), joined), [[0, 1], [2]], 'held together until the part');
  assert.deepEqual(T.calloutGroups(pts(76), joined), [[0], [1], [2]]);
});

test('the names: beside the mark, flipped at an edge or a neighbour, stacked for a group', () => {
  const widths = [80, 80, 80];
  // A lone mark: right. At the right edge: left. A neighbour just right: left.
  const lone = T.placeLabels([{ x: 300, y: 300 }], [[0]], [80], 1340);
  assert.equal(lone[0].mode, 'right');
  assert.equal(lone[0].dx, T.LABEL.gap);
  assert.equal(T.placeLabels([{ x: 1300, y: 300 }], [[0]], [80], 1340)[0].mode, 'left');
  const pair = T.placeLabels([{ x: 300, y: 300 }, { x: 420, y: 310 }], [[0], [1]], [80, 80], 1340);
  assert.equal(pair[0].mode, 'left', 'crowded on the right');
  assert.equal(pair[1].mode, 'right');
  // The Southwest: three marks within 58px → one callout, names in screen order.
  const sw = [{ x: 400, y: 330 }, { x: 380, y: 320 }, { x: 395, y: 305 }];
  const groups = T.calloutGroups(sw);
  assert.deepEqual(groups, [[0, 1, 2]]);
  const placed = T.placeLabels(sw, groups, widths, 1340);
  assert.ok(placed.every((p) => p.mode === 'stack' && p.leader), 'stacked with leaders');
  const labelY = placed.map((p, i) => sw[i].y + p.dy);
  const order = [0, 1, 2].sort((a, b) => sw[a].y - sw[b].y);
  for (let k = 1; k < 3; k += 1) assert.equal(Math.round(labelY[order[k]] - labelY[order[k - 1]]), T.LABEL.step, '22px apart, top to bottom');
  const rightEdge = placed.map((p, i) => sw[i].x + p.dx + widths[i]);
  assert.ok(rightEdge.every((x) => Math.abs(x - (380 - T.LABEL.stackGap)) < 0.2), 'right-aligned 40px left of the group');
  // The phone's overview above the open index (measured): New York's name,
  // set left of its mark, ran on from the Southwest's stack as one line.
  const phone = [{ x: 299, y: 301 }, { x: 288, y: 281 }, { x: 85, y: 228 }, { x: 77, y: 226 }, { x: 82, y: 224 }, { x: 313, y: 207 }];
  const phoneW = [50, 68, 45, 44, 96, 72];
  const phonePlaced = T.placeLabels(phone, T.calloutGroups(phone), phoneW, 390);
  const boxes = phonePlaced.map((p, i) => ({ x0: phone[i].x + p.dx, x1: phone[i].x + p.dx + phoneW[i], y: phone[i].y + p.dy }));
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const apart = Math.abs(boxes[a].y - boxes[b].y) >= 14 || boxes[a].x1 + 8 <= boxes[b].x0 || boxes[b].x1 + 8 <= boxes[a].x0;
      assert.ok(apart, `names ${a} and ${b} keep apart`);
    }
  }
  assert.ok(boxes.every((b) => b.x0 >= 0 && b.x1 <= 390), 'every name on the canvas');
  // No room on the left: the callout goes right.
  const near = sw.map((p) => ({ x: p.x - 330, y: p.y }));
  const edge = T.placeLabels(near, groups, widths, 1340);
  const maxX = Math.max(...near.map((p) => p.x));
  assert.ok(edge.every((p, i) => Math.abs(near[i].x + p.dx - (maxX + T.LABEL.stackGap)) < 0.2), 'left-aligned 40px right of the group');
});

test('the names keep off the route: a callout moves out along its side, a name to its other side', () => {
  // The Southwest at 1280 × 800: the marks sit too near the left edge for
  // the callout, so it goes right — where Bryce's leg to New York leaves up
  // and Orlando's leg into Page comes in from below, and the stack set level
  // with the group had a leg through "05 Bryce Canyon" and "03 Page".
  const sw = [{ x: 118, y: 393 }, { x: 99, y: 382 }, { x: 111, y: 379 }];
  const widths = [45, 44, 96];
  const toNewYork = [{ x: 111, y: 379 }, { x: 391, y: 330 }, { x: 671, y: 300 }];
  const intoPage = [{ x: 597, y: 576 }, { x: 330, y: 500 }, { x: 118, y: 393 }];
  const legs = [intoPage, toNewYork];
  const groups = T.calloutGroups(sw);
  const level = T.placeLabels(sw, groups, widths, 1000);
  const box = (p, i) => ({ x0: sw[i].x + p.dx - 3, x1: sw[i].x + p.dx + widths[i] + 3, y0: sw[i].y + p.dy - 8, y1: sw[i].y + p.dy + 8 });
  assert.ok(level.some((p, i) => T.legsCross(legs, box(p, i))), 'without the legs, a leg runs through the stack');
  const placed = T.placeLabels(sw, groups, widths, 1000, legs);
  assert.ok(placed.every((p) => p.mode === 'stack' && p.leader), 'still one stacked callout with leaders');
  assert.ok(placed.every((p, i) => sw[i].x + p.dx > Math.max(...sw.map((q) => q.x))), 'on the right, the side that fits');
  assert.ok(placed.every((p, i) => !T.legsCross(legs, box(p, i))), 'no leg through any name');
  const labelY = placed.map((p, i) => sw[i].y + p.dy);
  const order = [0, 1, 2].sort((a, b) => sw[a].y - sw[b].y);
  for (let k = 1; k < 3; k += 1) assert.equal(Math.round(labelY[order[k]] - labelY[order[k - 1]]), T.LABEL.step, 'still 22px apart, in screen order');
  // A lone name with a leg running out to its right goes left.
  const lone = T.placeLabels([{ x: 400, y: 300 }], [[0]], [80], 1340, [[{ x: 400, y: 300 }, { x: 700, y: 302 }]]);
  assert.equal(lone[0].mode, 'left');
  // Nothing clear anywhere: set as without the route.
  const walled = [[{ x: 0, y: 290 }, { x: 1340, y: 290 }], [{ x: 0, y: 300 }, { x: 1340, y: 300 }], [{ x: 0, y: 310 }, { x: 1340, y: 310 }]];
  assert.equal(T.placeLabels([{ x: 400, y: 300 }], [[0]], [80], 1340, walled)[0].mode, 'right');
  // A name keeps off an obstacle (the landed place's landmark) as it keeps
  // off a leg, and is set by its own dot, not pushed off it.
  const drawing = [{ x0: 405, x1: 460, y0: 280, y1: 310 }];
  assert.equal(T.placeLabels([{ x: 400, y: 300 }], [[0]], [80], 1340, [], drawing)[0].mode, 'left');
  assert.equal(T.placeLabels([{ x: 400, y: 300 }], [[0]], [80], 1340)[0].dx, T.LABEL.gap);
});

test('the sheet: one height rule', () => {
  assert.equal(T.sheetHeight('peek', 844, 600), 78);
  assert.equal(T.sheetHeight('browse', 844, 700), Math.round(844 * 0.48));
  assert.equal(T.sheetHeight('detail', 844, 700), Math.round(844 * 0.62));
  assert.equal(T.sheetHeight('detail', 844, 300), 228, 'never closer than 72px to the top of the map');
});
