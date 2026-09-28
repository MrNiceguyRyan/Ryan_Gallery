// Run offline: node --experimental-strip-types --test scripts/plate-rows.test.mjs
//
// The end page's Plates (src/lib/plateRows.ts): every frame at its own
// ratio, set in even rows at one plate height. They used to wrap wherever the
// column ran out — Orlando's seventeen came out 15 + 2 at 1728px, an
// orphaned pair — and on the phone they were 40px chips.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PLATE_ROWS, plateRows } from '../src/lib/plateRows.ts';

// The stories' frames as Sanity served them on 2026-09-27 (width x height).
const dims = (list) => list.split(' ').map((entry) => {
  const [width, height] = entry.split('x').map(Number);
  return width / height;
});
const STORIES = {
  orlando: dims('5152x7728 5152x7728 2592x3888 4117x6175 5152x7728 5152x7728 7728x5152 5152x7728 3648x5472 3648x5472 5152x7728 3648x5472 3160x4740 5152x7728 2592x3888 5152x7728 5152x7728'),
  miami: dims('7728x5152 7728x5152 5152x7728 5472x3648 2546x1697 7728x5152 7728x5152 7728x5152 5152x7728 5152x7728 5152x7728 3888x2592 2592x3888 5152x7728 7728x5152'),
  page: dims('4032x6048 4032x6048 5794x3863 3737x5605 4032x6048 4032x6048 6048x4032 3191x4786 4032x6048 3762x5643 6048x4032'),
  newYork: dims('6048x4032 4032x6048'),
  zion: dims('6048x4032 6048x4032 6048x4032 4032x6048 3993x5989 6048x4032 6048x4032 6048x4032'),
  bryce: dims('6048x4032 6048x4032 6048x4032 6048x4032 6048x4032'),
};
// The strip's column and the house plate height, as measured on the page
// (1728 × 1000 and 1280 × 800 desktop, 390 × 844 phone), 8px apart.
const VIEWS = [
  { name: '1728', width: 1218, height: 96 },
  { name: '1280', width: 902, height: 72 },
  { name: '390', width: 358, height: 64 },
];
const GAP = 8;

const lengths = (ratios, { rows, scale }, height) => {
  let at = 0;
  return rows.map((count) => {
    const row = ratios.slice(at, at + count);
    at += count;
    return row.reduce((total, ratio) => total + ratio * height * scale, 0) + GAP * (count - 1);
  });
};

test('every row fits its column, holds every frame once, in order, at one height', () => {
  for (const view of VIEWS) {
    for (const [story, ratios] of Object.entries(STORIES)) {
      const set = plateRows(ratios, view.height, view.width, GAP);
      assert.equal(set.rows.reduce((total, count) => total + count, 0), ratios.length, `${story} @${view.name}`);
      assert.ok(set.rows.every((count) => count > 0));
      assert.ok(set.scale <= 1 && set.scale >= PLATE_ROWS.minScale, `${story} @${view.name}: scale ${set.scale}`);
      lengths(ratios, set, view.height).forEach((length, row) => {
        // With the allowance each plate's file may round its width by.
        const count = set.rows[row];
        assert.ok(length + PLATE_ROWS.tolerance * count <= view.width + 1e-9, `${story} @${view.name} row ${row}: ${length}`);
      });
    }
  }
});

test('no orphans: Orlando is one row at 1728, even rows elsewhere', () => {
  // The recheck's case: 15 + 2 at 1728. Seventeen frames fit one row a
  // little smaller than the house height (never below minScale of it).
  const orlando = plateRows(STORIES.orlando, 96, 1218, GAP);
  assert.deepEqual(orlando.rows, [17]);
  assert.ok(orlando.scale > 0.92 && orlando.scale < 1);
  // Miami (was 9 + 6 at 1728, 8 + 7 at 1280): rows a frame apart.
  assert.deepEqual(plateRows(STORIES.miami, 96, 1218, GAP).rows, [7, 8]);
  assert.deepEqual(plateRows(STORIES.miami, 72, 902, GAP).rows, [7, 8]);
  // Orlando at 1280 does not fit one row at 90%: two even rows at full size.
  const orlando1280 = plateRows(STORIES.orlando, 72, 902, GAP);
  assert.deepEqual(orlando1280.rows, [8, 9]);
  assert.equal(orlando1280.scale, 1);
  // Stories that fit one row stay one row at the house height.
  for (const story of ['page', 'newYork', 'zion', 'bryce']) {
    assert.deepEqual(plateRows(STORIES[story], 96, 1218, GAP), { rows: [STORIES[story].length], scale: 1 });
  }
  // On the phone, at 64px: every row within two frames of every other, and
  // no row shorter than half the longest.
  for (const [story, ratios] of Object.entries(STORIES)) {
    const set = plateRows(ratios, 64, 358, GAP);
    assert.ok(Math.max(...set.rows) - Math.min(...set.rows) <= 2, `${story}: ${set.rows}`);
    const rowLengths = lengths(ratios, set, 64);
    if (set.rows.length > 1) assert.ok(Math.min(...rowLengths) >= Math.max(...rowLengths) / 2, `${story}: ${rowLengths}`);
  }
  assert.deepEqual(plateRows(STORIES.orlando, 64, 358, GAP).rows, [6, 5, 6]);
});

test('the fewest rows: a row is only added when the frames do not fit at 90%', () => {
  // Any story, any column: one row fewer would need plates below minScale.
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let trial = 0; trial < 300; trial += 1) {
    const n = 1 + Math.floor(random() * 40);
    const ratios = Array.from({ length: n }, () => [0.45, 0.6667, 0.75, 1, 1.333, 1.5, 1.5, 1.7778, 2.4][Math.floor(random() * 9)]);
    const width = 320 + Math.floor(random() * 1000);
    const height = 56 + Math.floor(random() * 48);
    const set = plateRows(ratios, height, width, GAP);
    assert.equal(set.rows.reduce((total, count) => total + count, 0), n);
    const rowLengths = lengths(ratios, set, height);
    rowLengths.forEach((length, row) => {
      if (set.rows[row] > 1) assert.ok(length + PLATE_ROWS.tolerance * set.rows[row] <= width + 1e-9);
    });
    // Filling rows one after another at the chosen size needs as many rows:
    // none of them could have been saved.
    let rows = 0;
    let line = Number.POSITIVE_INFINITY;
    for (const ratio of ratios) {
      const plate = ratio * height * set.scale + PLATE_ROWS.tolerance;
      if (line + GAP + plate > width) {
        rows += 1;
        line = plate;
      } else line += GAP + plate;
    }
    assert.equal(set.rows.length, rows, `trial ${trial}`);
    // Adjacent rows never differ by more than a plate or two's length: the
    // split is even, not the first rows filled and the rest left over.
    for (let row = 1; row < rowLengths.length; row += 1) {
      const widest = Math.max(...ratios) * height * set.scale + GAP;
      assert.ok(Math.abs(rowLengths[row] - rowLengths[row - 1]) <= 2 * widest + 1e-6, `trial ${trial}: ${rowLengths}`);
    }
  }
});

test('nothing to measure against: one row, as the page wraps it', () => {
  assert.deepEqual(plateRows([], 96, 1218, GAP), { rows: [], scale: 1 });
  assert.deepEqual(plateRows([1.5, 0.6667], 0, 1218, GAP), { rows: [2], scale: 1 });
  assert.deepEqual(plateRows([1.5, 0.6667], 96, 0, GAP), { rows: [2], scale: 1 });
  // A missing or broken ratio is read as 3:2.
  assert.deepEqual(plateRows([Number.NaN, 0, 1.5], 96, 1218, GAP), { rows: [3], scale: 1 });
});
