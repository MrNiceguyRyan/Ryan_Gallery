// Run offline: node --experimental-strip-types --test scripts/route-shield.test.mjs
//
// The homepage's route shields (src/lib/routeShield.ts): the state code each
// shield carries, the one-sign-per-region rule on the map, where a sign
// stands, and the split-flap a stop's name lands with.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CODE_FLIPS,
  FLAP,
  REGION_REACH_KM,
  SIGN_CLEAR,
  SIGN_LEAD_MAX,
  SIGN_LEAD_MIN,
  SIGN_NAME_MAX,
  SIGN_NAME_MEASURE,
  codePlan,
  flapGlyph,
  flapNumber,
  flapPlan,
  nameStep,
  regionSigns,
  routeMidpoint,
  screenMidpoint,
  signNameSize,
  signPose,
  stateCode,
} from '../src/lib/routeShield.ts';
import { haversineKm } from '../src/lib/geo.ts';

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
  assert.ok(REGION_REACH_KM > 400 && REGION_REACH_KM < 2000, 'Miami–Orlando joins, Orlando–Page does not');
});

test('the leader lands on the region\'s own road, halfway along it', () => {
  const [florida, southwest, newYork] = regionSigns(STOPS);
  // Florida: the middle of the Miami–Orlando leg.
  const miami = STOPS[0].coordinates;
  const orlando = STOPS[1].coordinates;
  assert.ok(Math.abs(haversineKm(miami, florida.anchor) - haversineKm(florida.anchor, orlando)) < 0.5);
  assert.ok(Math.abs(haversineKm(miami, florida.anchor) + haversineKm(florida.anchor, orlando) - haversineKm(miami, orlando)) < 0.5, 'on the leg, not beside it');
  // The Southwest: half the Page–Zion–Bryce length, which falls on the
  // Page–Zion leg (145 of 225 km) — on the road, not on bare ground between
  // the legs (the mean of the three places lay near Kanab, on neither).
  const [page, zion, bryce] = STOPS.slice(2, 5).map((stop) => stop.coordinates);
  const total = haversineKm(page, zion) + haversineKm(zion, bryce);
  const along = haversineKm(page, southwest.anchor);
  assert.ok(Math.abs(along - total / 2) < 0.5);
  assert.ok(Math.abs(along + haversineKm(southwest.anchor, zion) - haversineKm(page, zion)) < 0.5, 'on the Page–Zion leg');
  // A place alone is its own anchor.
  assert.deepEqual(newYork.anchor, STOPS[5].coordinates);
  assert.deepEqual(routeMidpoint([[1, 2]]), [1, 2]);
  // The phone's projected overview: the same rule in px.
  assert.deepEqual(screenMidpoint([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }]), { x: 20, y: 0 });
  assert.deepEqual(screenMidpoint([{ x: 4, y: 5 }]), { x: 4, y: 5 });
});

test('every name on the ticket\'s sign is one size, inside the enamel rule', () => {
  const names = ['Miami', 'Orlando', 'Page', 'Zion', 'Bryce Canyon', 'New York'];
  assert.deepEqual(names.map(signNameSize), names.map(() => SIGN_NAME_MAX));
  assert.equal(SIGN_NAME_MAX, 30);
  // ORLANDO measured 115px at 26px: 133px at 30, inside the 142 measure.
  assert.ok((115 * 30) / 26 < SIGN_NAME_MEASURE);
  // A long word steps down rather than running out of the rule.
  assert.ok(signNameSize('Massachusetts') < SIGN_NAME_MAX);
  assert.ok(signNameSize('Massachusetts') * 13 * 0.66 <= SIGN_NAME_MEASURE);
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
  // Every cell of the name turns from FLAP.delay (when the name being left,
  // set whole, goes) to its own landing, one flip each FLAP.turn.
  for (const step of plan) {
    const turn = nameStep(step);
    assert.equal(turn.start, FLAP.delay);
    assert.equal(turn.land, step.land);
    assert.ok(turn.flips >= 2);
    assert.ok(Math.abs((turn.land - turn.start) / turn.flips - FLAP.turn) <= FLAP.turn / 2);
  }
  // A very long word is compressed, not cut.
  const long = flapPlan(40);
  assert.ok(long[39].land <= FLAP.delay + FLAP.budget);
  assert.equal(long.length, 40);
});

test('each character turns through its own width class and lands on itself', () => {
  const [step] = flapPlan(1);
  assert.equal(flapGlyph('M', 'O', step, 0, 0), 'O', 'before its start it still shows the stop being left');
  assert.equal(flapGlyph('M', '', step, 0, 0), '', 'or nothing, past the end of that name');
  for (let t = step.start; t < step.land; t += 7) {
    for (let seed = 0; seed < 12; seed += 1) {
      // Wide cells turn through wide letters, narrow through narrow, and
      // no other cell ever shows an M or a W (they overprinted: "EDAMI").
      const wide = flapGlyph('M', 'O', step, t, seed);
      assert.match(wide, /^[MWQO]$/);
      assert.notEqual(wide, 'M');
      const narrow = flapGlyph('I', 'O', step, t, seed);
      assert.match(narrow, /^[IJLT]$/);
      assert.notEqual(narrow, 'I');
      const middle = flapGlyph('R', 'O', step, t, seed);
      assert.doesNotMatch(middle, /^[MWR]$/);
      assert.match(middle, /^[A-Z]$/);
      assert.match(flapGlyph('4', '1', step, t, seed), /^[0-9]$/);
    }
  }
  assert.equal(flapGlyph('M', 'O', step, step.land, 0), 'M');
  assert.equal(flapGlyph(' ', 'O', step, step.start + 5, 0), ' ');
});

test('only what changes turns', () => {
  const [step] = flapPlan(1);
  // A character already right never churns.
  for (let t = 0; t < step.land; t += 7) assert.equal(flapGlyph('A', 'A', step, t, 2), 'A');
  // The stop number counts through the real stops between, never past
  // the route: 01 → 02 is one turn, at the end; 03 → 05 passes 04.
  const [start, land] = [FLAP.delay, 600];
  const seen = (final, from) => {
    const values = [];
    for (let t = 0; t <= land; t += 5) {
      const value = flapNumber(final, from, t, start, land);
      if (values[values.length - 1] !== value) values.push(value);
    }
    return values;
  };
  assert.deepEqual(seen('02', '01'), ['01', '02']);
  assert.equal(flapNumber('02', '01', land - 1, start, land), '01', 'the turn lands with the name');
  assert.deepEqual(seen('05', '03'), ['03', '04', '05']);
  assert.deepEqual(seen('06', '05'), ['05', '06']);
  assert.deepEqual(seen('03', '03'), ['03']);
  assert.deepEqual(seen('01', ''), ['01'], 'nothing to count from: simply printed');
  // The state turns only when it changes, and then only twice.
  const plan = codePlan(2);
  assert.equal(plan[0].flips, CODE_FLIPS);
  assert.ok(CODE_FLIPS <= 2);
  assert.ok(plan[1].land <= FLAP.delay + FLAP.budget);
});

test('the map marks are signs, the ticket prints the sign, no corners are drawn', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const sign = source('src/components/home/AtlasSign.tsx');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const story = source('src/components/home/MagazineLayout.tsx');
  const home = source('src/components/home/HomePage.tsx');
  const shield = source('src/components/home/RouteShield.tsx');
  const css = source('src/styles/global.css');
  // A lone shield has no post: no leader, no rail, its point the pointer.
  assert.match(sign, /\{count > 1 && <i className="route-sign__lead"/);
  assert.match(atlas, /count === 1\s*\?\s*\{ lead: SIGN_SINGLE_GAP, shift: 0 \}/);
  // The board is set at take-off and turned at the landing, only on the way
  // on, and waits for a voyage still gliding the ticket in.
  assert.match(atlas, /new CustomEvent\('atlas:depart'/);
  assert.match(atlas, /from != null && from < index/);
  assert.match(chapter, /primeFlap\(root, detail\.from\)/);
  assert.match(chapter, /'archive:voyage-end'/);
  assert.match(home, /new CustomEvent\('archive:voyage-end'/);
  assert.match(shield, /export function primeFlap/);
  // The name being left is set whole, never cut into the new name's cells.
  assert.match(shield, /role === 'name' && <span className="flap-was"/);
  assert.match(css, /\.archive-ticket-sign__name \{\s*position: relative;/);
  // A flip is cut to its own cell, by a clip (overflow would move the baseline).
  assert.match(css, /\.flap-c\[data-show\] \{[^}]*clip-path: inset\(-0\.2em 0\)/);
  // A push's tear goes on to the next stop, as Next stop does.
  assert.match(chapter, /armScrollGoRef\.current\(\);/);
  assert.match(chapter, /html\.dataset\.atlasPlace !== collection\._id/);
  // …without handing keyboard focus on after a wheel (a lime ring on the next
  // cover), unless focus was already on the torn chapter.
  assert.match(chapter, /onTearAwayRef\.current\?\.\(\{ focus: section\.contains\(document\.activeElement\) \}\)/);
  assert.match(home, /if \(moveFocus\) chapterControl\?\.focus/);
  // The story's kept stub is headed by the same sign, its three marks set
  // at the ticket's sizes.
  assert.match(story, /className="archive-ticket-sign story-stub__sign"/);
  assert.match(story, /numberClassName="story-stub__no"/);
  assert.match(story, /archive-ticket-sign__total story-stub__of/);
  assert.match(story, /archive-ticket-sign__name story-stub__place/);
  assert.doesNotMatch(story, /· admission/);
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
