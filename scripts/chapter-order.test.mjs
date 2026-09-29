// Run offline: node --experimental-strip-types --test scripts/chapter-order.test.mjs
//
// The homepage's chapter order (src/lib/chapterOrder.ts), which /about now
// reads too: /about's "01 Miami" must always be the homepage's 01. Pinned on
// the archive as Sanity serves it (published order, a fixture), plus the two
// rules that decide it once the archive grows: route order only once every
// chapter has one, and a region's members read together.
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
const { activeChapters, chapterOrder, chapterOrdinal, chapterSections } = await bundle('../src/lib/chapterOrder.ts');
const { collections } = JSON.parse(readFileSync(new URL('./fixtures/archive-2026-09-27.json', import.meta.url), 'utf8'));

test('today: Miami, Orlando, Page, Zion, Bryce Canyon, New York', () => {
  assert.deepEqual(chapterOrder(collections).map((c) => c.name), ['Miami', 'Orlando', 'Page', 'Zion', 'Bryce Canyon', 'New York']);
  const sections = chapterSections(activeChapters(collections));
  assert.deepEqual(sections.map((s) => s.region), ['Florida', null, 'Utah', null]);
  assert.deepEqual(sections.map((s) => s.frameCount), [32, 11, 13, 2]);
});

test('route order decides only once every chapter has one', () => {
  const a = { _id: 'a', name: 'A', routeOrder: 20, photos: [1] };
  const b = { _id: 'b', name: 'B', routeOrder: 10, photos: [1] };
  const c = { _id: 'c', name: 'C', photos: [1] };
  const empty = { _id: 'e', name: 'E', routeOrder: 5, photos: [] };
  assert.deepEqual(activeChapters([a, b, empty]).map((x) => x._id), ['b', 'a']);
  assert.deepEqual(activeChapters([a, b, c]).map((x) => x._id), ['a', 'b', 'c'], 'a partial rollout keeps the published order');
});

test('every chapter with photographs is read, in route order: no limit', () => {
  // The homepage is a map to roam (src/lib/explorer.ts): a seventh place no
  // longer pushes the oldest off the front.
  const many = Array.from({ length: 9 }, (_, i) => ({ _id: `c${i}`, year: 2020 + i, routeOrder: i, photos: [1] }));
  assert.deepEqual(chapterOrder(many).map((x) => x._id), many.map((x) => x._id));
  // Washington, DC first by route order is stop 01, and /about's numbering is
  // the same list.
  const dc = { _id: 'dc', name: 'Washington, DC', region: 'District of Columbia', year: 2024, routeOrder: 5, photos: [1] };
  const seven = [...collections, dc];
  assert.equal(chapterOrder(seven)[0].name, 'Washington, DC');
  assert.deepEqual([chapterOrdinal(seven, 'dc').index, chapterOrdinal(seven, 'dc').total], [0, 7]);
  const byName = (name) => collections.find((c) => c.name === name);
  assert.equal(chapterOrdinal(seven, byName('Miami')._id).index, 1, 'Miami becomes 02');
});

test("a region's members read together", () => {
  const list = [
    { _id: '1', region: 'Florida', routeOrder: 1, photos: [1] },
    { _id: '2', region: 'Utah', routeOrder: 2, photos: [1] },
    { _id: '3', region: 'Florida', routeOrder: 3, photos: [1] },
  ];
  assert.deepEqual(chapterOrder(list).map((x) => x._id), ['1', '3', '2']);
});

test("a story prints its ticket's number: the homepage's, not the data's", () => {
  const byName = (name) => collections.find((c) => c.name === name);
  const orlando = chapterOrdinal(collections, byName('Orlando')._id);
  assert.deepEqual([orlando.index, orlando.total, orlando.next.name], [1, 6, 'Page']);
  assert.equal(chapterOrdinal(collections, byName('New York')._id).next.name, 'Miami', 'the last wraps to the first');
  // A story page's index has counts, not photographs, and reads the same.
  const index = collections.map(({ photos, ...rest }) => ({ ...rest, photoCount: photos.length }));
  assert.deepEqual(chapterOrder(index).map((c) => c.name), ['Miami', 'Orlando', 'Page', 'Zion', 'Bryce Canyon', 'New York']);
  assert.equal(chapterOrdinal(index, byName('Zion')._id).index, 3);
});
