// Run offline: node --experimental-strip-types --test scripts/travel-silver.test.mjs
//
// /travel's chapters (src/lib/travelSilver.ts): the chapters in the
// homepage's order and numbering, the one landing every path uses, the
// flight clock, the route's length and the phone sheet's height. The module
// imports its siblings without extensions (Vite's way), so it is bundled
// first.
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
const { TICKET_STOCK } = await bundle('../src/lib/ticketStock.ts');

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

test('the sheet: one height rule', () => {
  assert.equal(T.sheetHeight('peek', 844, 600), 78);
  assert.equal(T.sheetHeight('browse', 844, 700), Math.round(844 * 0.48));
  assert.equal(T.sheetHeight('detail', 844, 700), Math.round(844 * 0.62));
  assert.equal(T.sheetHeight('detail', 844, 300), 228, 'never closer than 72px to the top of the map');
});
