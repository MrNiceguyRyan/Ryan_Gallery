// Run offline: node --experimental-strip-types --test scripts/exposure-record.test.mjs
//
// /about's counts (src/lib/exposureRecord.ts: the ticket stub and the
// colophon's cameras), the homepage's leg rule (src/lib/geo.ts) and the
// portrait's silver print (src/lib/silverPrint.ts), held against the archive
// as Sanity served it on 2026-09-27 (a fixture). The counts are reduced from
// the frames, so this is the guard that they say what the camera did.
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
const { exposureTotals, tidyCamera } = await bundle('../src/lib/exposureRecord.ts');
const { chapterOrder } = await bundle('../src/lib/chapterOrder.ts');
const { chapterPoint, formatKm, haversineKm } = await bundle('../src/lib/geo.ts');
const { silverTables, silverGrade } = await bundle('../src/lib/silverPrint.ts');
const { collections } = JSON.parse(readFileSync(new URL('./fixtures/archive-2026-09-27.json', import.meta.url), 'utf8'));
const ordered = chapterOrder(collections);

test('the counts: six chapters, 58 frames, two bodies', () => {
  const totals = exposureTotals(ordered);
  assert.equal(totals.chapters, 6);
  assert.equal(totals.frames, 58);
  // Most frames first: the X-T50 made Miami and Orlando's 32.
  assert.deepEqual(totals.bodies, ['Fujifilm X-T50', 'Nikon Zf']);
  assert.deepEqual(exposureTotals([]), { chapters: 0, frames: 0, bodies: [] });
});

test('the EXIF spellings the archive holds', () => {
  assert.equal(tidyCamera('NIKON CORPORATION NIKON Z f'), 'Nikon Zf');
  assert.equal(tidyCamera('Nikon Zf'), 'Nikon Zf');
  assert.equal(tidyCamera('FUJIFILM X-T50'), 'Fujifilm X-T50');
  assert.equal(tidyCamera(''), null);
  // A frame with no camera is counted as a frame, never as a body.
  assert.deepEqual(exposureTotals([{ photos: [{ camera: null }, { camera: 'NIKON CORPORATION NIKON Z f' }] }]), {
    chapters: 1,
    frames: 2,
    bodies: ['Nikon Zf'],
  });
});

test("the homepage's legs, chapter to chapter", () => {
  const points = ordered.map(chapterPoint);
  assert.ok(points.every(Boolean), 'every chapter stands somewhere');
  const legs = points.slice(1).map((point, i) => haversineKm(points[i], point));
  // The AtlasSign readouts, leg by leg (Miami→Orlando … Bryce Canyon→New York).
  assert.deepEqual(legs.map((km) => Math.round(km)), [330, 2949, 146, 81, 3286]);
  // Grouped as the readout prints it, with a thin space.
  assert.equal(formatKm(legs[4]), '3 286');
  assert.equal(Math.round(haversineKm([0, 0], [0, 1])), 111);
  assert.deepEqual(chapterPoint({ mapLocation: { lng: -73.98, lat: 40.75 }, photos: [] }), [-73.98, 40.75]);
  assert.equal(chapterPoint({ photos: [{ location: null }] }), undefined);
});

test('the silver print: the globe ramp, olive to paper, never reversing', () => {
  const tables = silverTables();
  const expected = JSON.parse(readFileSync(new URL('./fixtures/silver-table.json', import.meta.url), 'utf8'));
  assert.deepEqual(tables, expected);
  const hex = (t, i) => '#' + t.map((ch) => Math.round(ch[i] * 255).toString(16).padStart(2, '0')).join('');
  assert.equal(hex(tables, 0), '#1a1e14');
  assert.equal(hex(tables, 20), '#e9e6d8');
  for (const channel of tables) for (let i = 1; i < channel.length; i += 1) assert.ok(channel[i] >= channel[i - 1]);
  // Black prints as the ramp's foot, white as its head, a mid grey between.
  const px = Uint8Array.from([0, 0, 0, 255, 255, 255, 128, 128, 128]);
  silverGrade(px, 3, tables);
  assert.deepEqual([...px.slice(0, 3)], [26, 30, 20]);
  assert.deepEqual([...px.slice(3, 6)], [233, 230, 216]);
  assert.ok(px[6] > 100 && px[6] < 160 && px[6] >= px[8]);
});
