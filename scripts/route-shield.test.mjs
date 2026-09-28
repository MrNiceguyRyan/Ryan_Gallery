// Run offline: node --experimental-strip-types --test scripts/route-shield.test.mjs
//
// The homepage's route shields (src/lib/routeShield.ts): the state code each
// shield carries, the one-sign-per-region rule on the map, where a sign
// stands, and the split-flap a stop's name lands with.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FLAP,
  REGION_REACH_KM,
  SIGN_CLEAR,
  SIGN_LEAD_MAX,
  SIGN_LEAD_MIN,
  flapGlyph,
  flapPlan,
  regionSigns,
  signPose,
  stateCode,
} from '../src/lib/routeShield.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Today's six stops, in the homepage's order, at their map points.
const STOPS = [
  { id: 'miami', number: 1, region: 'Florida', coordinates: [-80.1918, 25.7617] },
  { id: 'orlando', number: 2, region: 'Florida', coordinates: [-81.3789, 28.5384] },
  { id: 'page', number: 3, region: 'Arizona', coordinates: [-111.4558, 36.9147] },
  { id: 'zion', number: 4, region: 'Utah', coordinates: [-113.0263, 37.2982] },
  { id: 'bryce', number: 5, region: 'Utah', coordinates: [-112.1871, 37.593] },
  { id: 'new-york', number: 6, region: 'New York', coordinates: [-73.9856, 40.7484] },
];

test('the shield carries the state its region names (derived, not stored)', () => {
  assert.deepEqual(STOPS.map((stop) => stateCode(stop.region)), ['FL', 'FL', 'AZ', 'UT', 'UT', 'NY']);
  assert.equal(stateCode('  new york '), 'NY');
  assert.equal(stateCode(undefined), '');
  assert.equal(stateCode(''), '');
  // Not a US state: its own initials, never a guess at a code.
  assert.equal(stateCode('British Columbia'), 'BC');
  assert.equal(stateCode('Kyoto'), 'KY');
});

test('one sign per stretch of the route, its shields in stop order', () => {
  const signs = regionSigns([...STOPS].reverse());
  assert.deepEqual(signs.map((sign) => sign.places.map((place) => place.number)), [[1, 2], [3, 4, 5], [6]]);
  // Arizona's Page and Utah's Zion and Bryce are one corner of the map.
  assert.deepEqual(signs[1].places.map((place) => place.region), ['Arizona', 'Utah', 'Utah']);
  // The leader points at the middle of the region, which lies among its places.
  const [, southwest] = signs;
  const lngs = southwest.places.map((place) => place.coordinates[0]);
  const lats = southwest.places.map((place) => place.coordinates[1]);
  assert.ok(southwest.anchor[0] > Math.min(...lngs) && southwest.anchor[0] < Math.max(...lngs));
  assert.ok(southwest.anchor[1] > Math.min(...lats) && southwest.anchor[1] < Math.max(...lats));
  assert.deepEqual(signs[2].anchor, STOPS[5].coordinates);
  assert.ok(REGION_REACH_KM > 400 && REGION_REACH_KM < 2000, 'Miami–Orlando joins, Orlando–Page does not');
});

test('a sign clears its region and keeps inside the map column', () => {
  // The leader runs up past the northernmost place by SIGN_CLEAR.
  const clear = signPose({ x: 400, y: 450 }, 390, 106, 48, 750, 38);
  assert.equal(clear.lead, 60 + SIGN_CLEAR);
  assert.equal(clear.shift, 0);
  // Never shorter than its minimum, never longer than its maximum.
  assert.equal(signPose({ x: 400, y: 450 }, 450, 30, 48, 750, 0).lead, Math.max(SIGN_LEAD_MIN, SIGN_CLEAR));
  assert.equal(signPose({ x: 400, y: 900 }, 100, 30, 48, 750, 0).lead, SIGN_LEAD_MAX);
  // Near the covers the row slides left, but never off its rail.
  const edge = signPose({ x: 740, y: 450 }, 420, 106, 48, 750, 38);
  assert.equal(edge.shift, -38);
  const room = signPose({ x: 720, y: 450 }, 420, 106, 48, 750, 38);
  assert.equal(room.shift, 750 - (720 + 53));
  // A single shield has no rail: its leader meets its own point.
  assert.equal(signPose({ x: 745, y: 450 }, 450, 30, 48, 750, 0).shift, 0);
  // And on the left edge it slides right.
  assert.equal(signPose({ x: 80, y: 450 }, 440, 106, 48, 750, 38).shift, 48 - (80 - 53));
});

test('the split-flap lands left to right, inside DUR.scene', () => {
  const plan = flapPlan('BRYCE CANYON'.length);
  assert.equal(plan[0].start, FLAP.delay);
  for (let index = 1; index < plan.length; index += 1) {
    assert.ok(plan[index].start > plan[index - 1].start);
    assert.ok(plan[index].land > plan[index - 1].land);
  }
  assert.ok(plan[plan.length - 1].land <= FLAP.delay + FLAP.budget);
  // A very long word is compressed, not cut.
  const long = flapPlan(40);
  assert.ok(long[39].land <= FLAP.delay + FLAP.budget);
  assert.equal(long.length, 40);
});

test('each character turns through its own kind and lands on itself', () => {
  const [step] = flapPlan(1);
  assert.equal(flapGlyph('M', 'O', step, 0, 0), 'O', 'before its start it still shows the stop being left');
  assert.equal(flapGlyph('M', '', step, 0, 0), '', 'or nothing, past the end of that name');
  for (let t = step.start; t < step.land; t += 7) {
    const glyph = flapGlyph('M', 'O', step, t, 3);
    assert.match(glyph, /^[A-Z]$/);
    assert.notEqual(glyph, 'M');
    assert.match(flapGlyph('4', '1', step, t, 3), /^[0-9]$/);
  }
  assert.equal(flapGlyph('M', 'O', step, step.land, 0), 'M');
  assert.equal(flapGlyph(' ', 'O', step, step.start + 5, 0), ' ');
});

test('the map marks are signs, the ticket prints the sign, no corners are drawn', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const sign = source('src/components/home/AtlasSign.tsx');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const css = source('src/styles/global.css');
  assert.match(atlas, /regionSignList\.map\(\(sign\) => \(\s*<Marker/);
  assert.doesNotMatch(atlas + sign, /AfPoint|af-point/);
  // Placed from the camera's projection on each map render, no rects.
  const place = atlas.slice(atlas.indexOf('const placeSigns = () => {'), atlas.indexOf('const placeSignsRef'));
  assert.doesNotMatch(place, /getBoundingClientRect|clientWidth|offsetWidth/);
  assert.match(atlas, /map\.on\('render', onRender\)/);
  // The ticket's stub carries the shield and the name, and the three marks
  // the story's kept stub flies between.
  for (const mark of ['archive-ticket-stub__no', 'archive-ticket-stub__of', 'archive-ticket-stub__place']) {
    assert.ok(chapter.includes(mark), mark);
  }
  assert.match(chapter, /<RouteShield/);
  assert.doesNotMatch(chapter, /archive-focus/);
  assert.doesNotMatch(css, /\.archive-focus/);
  // No lime on the map's signs.
  const signCss = css.slice(css.indexOf('/* ─── The route signs'), css.indexOf('.af-place__body'));
  assert.doesNotMatch(signCss.replace(/:focus-visible \{[^}]*\}/g, ''), /#D2FF00|210,\s*255,\s*0/i);
});
