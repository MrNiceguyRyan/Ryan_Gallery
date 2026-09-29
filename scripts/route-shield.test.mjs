// Run offline: node --experimental-strip-types --test scripts/route-shield.test.mjs
//
// The homepage's route shields (src/lib/routeShield.ts): the state code each
// shield carries, a form per state, one shield per place standing on it and
// how shields stack where they meet, and the split-flap a stop's name lands
// with.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CODE_FLIPS,
  FLAP,
  SHIELD_FORMS,
  SHIELD_MAP_PX,
  SHIELD_SCALE,
  SIGN_NAME_MAX,
  SIGN_NAME_MEASURE,
  STACK_PEEK,
  codePlan,
  flapGlyph,
  flapNumber,
  flapPlan,
  nameStep,
  shieldForm,
  signNameSize,
  stackShields,
  stateCode,
  typeBox,
} from '../src/lib/routeShield.ts';
import { TICKET_STOCK } from '../src/lib/ticketStock.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Today's six stops, in the homepage's order, at their map points.
const STOPS = [
  { id: 'miami', slug: 'miami', number: 1, region: 'Florida', coordinates: [-80.1918, 25.7617] },
  { id: 'orlando', slug: 'orlando', number: 2, region: 'Florida', coordinates: [-81.3789, 28.5384] },
  { id: 'page', slug: 'page', number: 3, region: 'Arizona', coordinates: [-111.4558, 36.9147] },
  { id: 'zion', slug: 'zion-national-park', number: 4, region: 'Utah', coordinates: [-113.0263, 37.2982] },
  { id: 'bryce', slug: 'bryce-canyon-national-park', number: 5, region: 'Utah', coordinates: [-112.1871, 37.593] },
  { id: 'new-york', slug: 'new-york-stories', number: 6, region: 'New York', coordinates: [-73.9856, 40.7484] },
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

test('Washington, DC: however its region is written, a DC shield of its own', () => {
  for (const name of ['District of Columbia', 'Washington, DC', 'Washington D.C.', 'washington, d.c.', 'DC', 'D.C.']) {
    assert.equal(stateCode(name), 'DC', name);
  }
  // Plain "Washington" is the state.
  assert.equal(stateCode('Washington'), 'WA');
  const dc = shieldForm('DC');
  assert.equal(dc.key, 'DC');
  assert.notEqual(dc.plate, SHIELD_FORMS.US.plate, 'not the generic US shield');
  for (const key of ['FL', 'AZ', 'UT', 'NY']) assert.notEqual(dc.plate, SHIELD_FORMS[key].plate);
  // The flag's three stars over two bars, in the place's stock: three star
  // sub-paths (ten points each) and two bars.
  const subpaths = dc.band.split('M').filter(Boolean);
  assert.equal(subpaths.length, 5);
  assert.equal(subpaths.filter((path) => (path.match(/L/g) ?? []).length === 9).length, 3);
  // A seventh place, stop 01, stands on its own among the six (a synthetic
  // Washington, DC at its map point, measured as the others are).
  const withDc = [{ id: 'dc', number: 1, region: 'District of Columbia', coordinates: [-77.0369, 38.9072] }, ...STOPS.map((stop) => ({ ...stop, number: stop.number + 1 }))];
  assert.deepEqual(withDc.map((stop) => shieldForm(stateCode(stop.region)).key), ['DC', 'FL', 'FL', 'AZ', 'UT', 'UT', 'NY']);
  const [x0, y0] = [542, 480];
  const box = typeBox(dc);
  assert.ok(box[0] > 0 && box[2] < 1 && box[1] > 0 && box[3] < 1, 'its type inside its plate');
  const slots = [
    { id: 'dc', number: 1, x: x0, y: y0, w: SHIELD_MAP_PX * SHIELD_SCALE.current, h: (SHIELD_MAP_PX * SHIELD_SCALE.current * dc.h) / 100, rank: 2, type: box },
    { id: 'new-york', number: 7, x: x0 + 150, y: y0 - 90, w: SHIELD_MAP_PX * SHIELD_SCALE.ahead, h: SHIELD_MAP_PX * SHIELD_SCALE.ahead, rank: 0, type: typeBox(SHIELD_FORMS.NY) },
  ];
  const placed = stackShields(slots);
  assert.equal(placed.get('dc').count, 0, 'DC and New York stand apart at a resting zoom');
});

test('every state the route visits has its own form; every place its own band', () => {
  const forms = STOPS.map((stop) => shieldForm(stateCode(stop.region)));
  assert.deepEqual(forms.map((form) => form.key), ['FL', 'FL', 'AZ', 'UT', 'UT', 'NY']);
  // Four states, four outlines: no two regions share a plate.
  const plates = new Set(['FL', 'AZ', 'UT', 'NY'].map((key) => SHIELD_FORMS[key].plate));
  assert.equal(plates.size, 4);
  assert.ok(!plates.has(SHIELD_FORMS.US.plate), 'none of them is the generic US shield');
  // A state the archive has not been to yet is signed with the US shield.
  assert.equal(shieldForm('OR').key, 'US');
  assert.equal(shieldForm('').key, 'US');
  assert.equal(shieldForm('ut').key, 'UT');
  // Places sharing a state differ by their stock, printed in the band.
  const stocks = STOPS.map((stop) => TICKET_STOCK[stop.slug]);
  assert.ok(stocks.every(Boolean));
  assert.equal(new Set(stocks).size, STOPS.length);
});

test('a form stands on its point: the foot at the bottom middle, the type inside', () => {
  for (const form of Object.values(SHIELD_FORMS)) {
    assert.deepEqual([...form.tip], [50, form.h], `${form.key}: the foot is the box's bottom middle`);
    // The marker anchors the box's bottom middle on the place.
    assert.ok(form.h >= 90 && form.h <= 112, `${form.key} is a shield, not a post`);
    for (const text of [form.code, form.num]) {
      const cap = text.size * 0.7;
      assert.ok(text.y - cap > 0 && text.y < form.h, `${form.key}: type inside the plate`);
      assert.ok(text.x > 15 && text.x < 85);
    }
    // The stop number is the shield's big mark, the state's letters its label.
    assert.ok(form.num.size > form.code.size * 1.8, form.key);
    // Nothing is drawn below the foot: no stem, post or leader.
    const ys = [...`${form.plate} ${form.band} ${form.ink}`.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
    assert.ok(Math.max(...ys) <= form.h + 0.01, `${form.key}: nothing below the point`);
  }
});

// The six places projected at each chapter's resting camera (measured on the
// homepage at 1728 × 1000, 2026-09-28): the foot points in css px.
const REST = [
  { current: 'miami', pts: { miami: [542, 480], orlando: [496, 387] } },
  { current: 'orlando', pts: { orlando: [542, 480], miami: [598, 595] } },
  { current: 'page', pts: { page: [542, 480], zion: [405, 447], bryce: [481, 427] } },
  { current: 'zion', pts: { zion: [542, 480], bryce: [618, 459], page: [687, 515] } },
  { current: 'bryce', pts: { bryce: [542, 480], zion: [463, 502], page: [609, 538] } },
  { current: 'new-york', pts: { 'new-york': [542, 456] } },
];
const slotsAt = (points, current, inbound = null, { px = SHIELD_MAP_PX, scales = SHIELD_SCALE } = {}) => Object.entries(points).map(([id, [x, y]]) => {
  const stop = STOPS.find((candidate) => candidate.id === id);
  const rank = id === current ? 2 : id === inbound ? 1 : 0;
  const scale = rank === 2 ? scales.current : rank === 1 ? scales.inbound : scales.ahead;
  const w = px * scale;
  const form = shieldForm(stateCode(stop.region));
  return { id, number: stop.number, x, y, w, h: (w * form.h) / 100, rank, type: typeBox(form) };
});

test('at every chapter\'s resting camera the shields stand apart, each on its place', () => {
  for (const { current, pts } of REST) {
    const placed = stackShields(slotsAt(pts, current));
    for (const [id, value] of placed) {
      assert.equal(value.dy, 0, `${current}: ${id} is not lifted`);
      assert.equal(value.count, 0, `${current}: ${id} is in no pile`);
    }
  }
});

test('where shields meet they stack: stop order, the current on top, a buried head lifted', () => {
  // Orlando → Page, zoomed out over the Southwest (z 3.7): Page, Zion and
  // Bryce stand a few px apart; the camera is flying to Page.
  const flight = stackShields(slotsAt({ page: [400, 500], zion: [377, 496], bryce: [393, 491] }, 'orlando', 'page'));
  const page = flight.get('page');
  const zion = flight.get('zion');
  const bryce = flight.get('bryce');
  assert.equal(page.count, 3, 'the front shield counts the pile');
  assert.ok(page.z > bryce.z && bryce.z > zion.z, 'Page (inbound) on top, then stop order');
  assert.equal(zion.count + bryce.count, 0);
  // Bryce stands 7px from Page, almost wholly behind it: its head is lifted
  // STACK_PEEK above Page's. Zion, 23px across, shows its side: not moved.
  assert.equal(page.dy, 0);
  assert.equal(zion.dy, 0);
  const pageTop = 500 - (SHIELD_MAP_PX * SHIELD_SCALE.inbound * SHIELD_FORMS.AZ.h) / 100;
  const bryceTop = 491 + bryce.dy - (SHIELD_MAP_PX * SHIELD_SCALE.ahead * SHIELD_FORMS.UT.h) / 100;
  assert.ok(bryceTop <= pageTop - STACK_PEEK + 0.5, 'Bryce\'s head shows above Page');
  assert.ok(bryce.dy < 0 && bryce.dy > -20, 'a small lift, not a move');
  // The same three on one point (a phone's overview): every head shows,
  // each above the one in front.
  const pile = stackShields(slotsAt({ page: [90, 440], zion: [89, 439], bryce: [91, 438] }, 'zion'));
  assert.equal(pile.get('zion').count, 3);
  assert.equal(pile.get('zion').dy, 0, 'the chapter being read stays on its place');
  assert.ok(pile.get('bryce').dy < 0 && pile.get('page').dy < pile.get('bryce').dy, 'a cascade');
  // Miami under Orlando on a phone's overview: shields that only touch are
  // two signs, no pile, no count.
  const touching = stackShields(slotsAt({ miami: [328, 565], orlando: [319, 532] }, 'page'));
  assert.equal(touching.get('orlando').count + touching.get('miami').count, 0);
  // Overlapping, they are one pile; Miami's foot still shows below
  // Orlando's, so neither is moved off its place.
  const florida = stackShields(slotsAt({ miami: [328, 545], orlando: [319, 532] }, 'page'));
  assert.equal(florida.get('orlando').count, 2);
  assert.equal(florida.get('miami').dy, 0);
  assert.equal(florida.get('orlando').dy, 0);
  // Two piles on one map are two piles.
  const two = stackShields(slotsAt({ miami: [300, 560], orlando: [296, 548], page: [90, 440], bryce: [92, 437] }, 'miami'));
  assert.equal(two.get('miami').count, 2);
  assert.equal(two.get('bryce').count, 2);
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


test('the map stands a shield on each place, the ticket prints that shield', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const sign = source('src/components/home/AtlasSign.tsx');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const story = source('src/components/home/MagazineLayout.tsx');
  const home = source('src/components/home/HomePage.tsx');
  const shield = source('src/components/home/RouteShield.tsx');
  const css = source('src/styles/global.css');
  const lib = source('src/lib/routeShield.ts');
  // One marker per place, at the place's own coordinates, anchored at the
  // bottom: the foot's point is the place. No region grouping is left.
  assert.match(atlas, /shieldPlaces\.map\(\(place\) => \(\s*<Marker\s+key=\{`shield-\$\{place\.id\}`\}\s+longitude=\{place\.coordinates\[0\]\}\s+latitude=\{place\.coordinates\[1\]\}\s+anchor="bottom"/);
  for (const gone of ['regionSigns', 'RegionSign', 'routeMidpoint', 'screenMidpoint', 'signPose', 'SignPose', 'REGION_REACH_KM', 'SIGN_SINGLE_GAP', 'SIGN_LEAD', 'SIGN_CLEAR', 'RouteSign', 'LivingRouteSign', 'regionSignList', 'signRowWidth', 'signRailHalf', 'SIGN_SHIELD_PX']) {
    assert.doesNotMatch(atlas + sign + lib + chapter + home, new RegExp(`\\b${gone}\\b`), gone);
  }
  // No stem, post, leader or rail anywhere a shield is drawn.
  const shieldCss = css.slice(css.indexOf('/* ─── The place shields'), css.indexOf('.af-place__body'));
  assert.ok(shieldCss.length > 500);
  assert.doesNotMatch(atlas + sign + css, /route-sign/);
  assert.doesNotMatch(atlas + sign + shieldCss, /__(?:lead|rail|stem|post)(?![\w-])/);
  // Placed from the camera's projection on each map render, no rects.
  const place = atlas.slice(atlas.indexOf('const placeShields = () => {'), atlas.indexOf('const placeShieldsRef'));
  assert.ok(place.length > 200);
  assert.doesNotMatch(place, /getBoundingClientRect|clientWidth|offsetWidth|offsetTop/);
  assert.match(place, /map\.project\(place\.coordinates\)/);
  assert.match(place, /stackShields\(slots\)/);
  assert.match(atlas, /map\.on\('render', onRender\)/);
  // The CSS sizes are the ones the atlas stacks with.
  const scaleOf = (selector) => Number(css.match(new RegExp(`\\.place-shield__sign${selector} \\{[^}]*transform: scale\\(([\\d.]+)\\)`))?.[1]);
  assert.equal(scaleOf(''), SHIELD_SCALE.ahead);
  assert.equal(scaleOf('\\.is-past'), SHIELD_SCALE.past);
  assert.equal(scaleOf('\\.is-inbound'), SHIELD_SCALE.inbound);
  assert.equal(scaleOf('\\.is-current'), SHIELD_SCALE.current);
  // Scaled about the foot's point, which never leaves the place.
  assert.match(css, /\.place-shield__sign \{[^}]*transform-origin: 50% 100%;/);
  // The phone: the same shields on the same map (its explorer), a little
  // smaller, stacked the same way.
  assert.match(atlas, /const shieldPx = mobile \? SHIELD_PHONE_PX : SHIELD_MAP_PX;/);
  assert.doesNotMatch(atlas, /LivingShields|deckShields/);
  // No lime on the map's shields (the keyboard ring aside).
  assert.doesNotMatch(shieldCss.replace(/:focus-visible \{[^}]*\}/g, ''), /#D2FF00|210,\s*255,\s*0/i);
  // Every printed shield is the place's: the band in its stock.
  assert.match(chapter, /code=\{stateCode\(collection\.region\)\}\s+accent=\{stockPaper\(collection\.slug\)\}/);
  assert.match(chapter, /accent=\{stockPaper\(nextStop\.slug\)\}/);
  assert.match(home, /\{ name: next\.name, number: next\.number, region: next\.region, slug: next\.slug \}/);
  assert.match(story, /accent=\{stockPaper\(chapter\.slug\)\}/);
  assert.match(sign, /accent=\{stockPaper\(stop\.slug\)\}/);
  assert.match(css, /\.route-shield__band \{\s*fill: var\(--shield-accent, var\(--stub-paper/);
  // The board is set at take-off and turned at the landing, from the place
  // left (none from the open map, none on the entry), once the cover is up.
  assert.match(atlas, /window\.dispatchEvent\(new CustomEvent\(type, \{ detail: \{ id: to\.id, from: signFrom\(from\) \} \}\)\)/);
  assert.match(atlas, /announce\('atlas:depart', index, flying\.from\)/);
  assert.match(atlas, /from: next\.kind === 'entry' \? -1 : from,/);
  assert.match(chapter, /primeFlap\(root, detail\.from\)/);
  assert.doesNotMatch(chapter + home, /archive:voyage-end/);
  assert.match(shield, /export function primeFlap/);
  // A new state's letters turn in from a blank band, never the old state's
  // letters printed on the new state's form (FL on Arizona's outline).
  assert.match(shield, /flapGlyph\(final, '', plan\[index\], t,/);
  // The name being left is set whole, never cut into the new name's cells.
  assert.match(shield, /role === 'name' && <span className="flap-was"/);
  assert.match(css, /\.archive-ticket-sign__name \{\s*position: relative;/);
  // A flip is cut to its own cell, by a clip (overflow would move the baseline).
  assert.match(css, /\.flap-c\[data-show\] \{[^}]*clip-path: inset\(-0\.2em 0\)/);
  // Every move lets the ticket in hand go first: the explorer tears it and
  // goes on once the face is free — a flight once it has gone
  // (src/lib/explorer.ts); the scroll's tear went with the scroll.
  assert.match(home, /case 'tear': \{[\s\S]*?tearTicket\(effect\.id, 'tear-then', finish,/);
  assert.doesNotMatch(chapter, /armScrollGoRef|atlasPlace|archive:onward/);
  // The story's kept stub is headed by the same sign, its three marks set
  // at the ticket's sizes.
  assert.match(story, /className="archive-ticket-sign story-stub__sign"/);
  assert.match(story, /numberClassName="story-stub__no"/);
  assert.match(story, /archive-ticket-sign__total story-stub__of/);
  assert.match(story, /archive-ticket-sign__name story-stub__place/);
  assert.doesNotMatch(story, /· admission/);
  assert.doesNotMatch(atlas + sign, /AfPoint|af-point/);
  // The ticket's stub carries the shield and the name, and the three marks
  // the story's kept stub flies between.
  for (const mark of ['archive-ticket-stub__no', 'archive-ticket-stub__of', 'archive-ticket-stub__place']) {
    assert.ok(chapter.includes(mark), mark);
  }
  assert.match(chapter, /<RouteShield/);
  assert.doesNotMatch(chapter, /archive-focus/);
  assert.doesNotMatch(css, /\.archive-focus/);
});

test('Florida\'s number sits whole in the Gulf, clear of the rim and the coast', () => {
  const form = SHIELD_FORMS.FL;
  // Centred like every other form's (50–52), not hugging the rim at 32.5.
  assert.ok(form.num.x >= 38 && form.num.x <= 44, 'the number near the middle');
  // The number's own lines: two digits of ≈0.6em, caps ≈0.72em.
  const left = form.num.x - 0.6 * form.num.size;
  const right = form.num.x + 0.6 * form.num.size;
  const top = form.num.y - 0.72 * form.num.size;
  // The rim's inner edge: 4.2 + half its 2.2 stroke.
  assert.ok(left - 5.3 >= 4, 'clear of the rim');
  // The peninsula's west coast over the number's lines (the band's
  // points below the Big Bend, x at each y): at least 4 units clear.
  const coast = [...form.band.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
    .map(([, x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => y >= top && y <= form.num.y && x > 50 && x < 90);
  assert.ok(coast.length >= 3);
  for (const [x] of coast) assert.ok(x - right >= 4, `the coast at ${x} clears the number (${right})`);
});

test('in a pile, a shield whose type is covered prints none; the front prints its own', () => {
  // The phone's Southwest: three places a few px apart, the reader on Miami.
  const slots = slotsAt({ page: [90, 440], zion: [89, 439], bryce: [91, 438] }, 'miami', null, { px: 22, scales: { current: 1.16, inbound: 1.16, ahead: 0.86 } });
  const pile = stackShields(slots);
  assert.equal(pile.get('bryce').count, 3, 'the front counts the pile');
  assert.equal(pile.get('bryce').buried, false, 'the front prints its number');
  assert.ok(pile.get('page').buried && pile.get('zion').buried, 'the shields behind print none');
  for (const id of ['page', 'zion', 'bryce']) assert.equal(pile.get(id).front, 'bryce');
  // Two shields that overlap only at a corner: the one behind still prints
  // its number, whole.
  const corner = stackShields(slotsAt({ miami: [328, 545], orlando: [300, 520] }, 'page'));
  assert.equal(corner.get('orlando').count, 2);
  assert.equal(corner.get('miami').buried, false, 'its number is clear of Orlando');
  // Read on a phone, Miami's corner just touches the foot of Orlando's 02:
  // Orlando keeps its number (the feet as the overview projects them).
  const phone = { px: 22, scales: { current: 1.16, inbound: 1.16, ahead: 0.86 } };
  const touch = stackShields(slotsAt({ miami: [314, 571], orlando: [305.5, 548] }, 'miami', null, phone));
  assert.equal(touch.get('miami').count, 2);
  assert.equal(touch.get('orlando').buried, false);
  // A lone shield is its own front, never buried.
  const alone = stackShields(slotsAt({ 'new-york': [500, 400] }, 'new-york'));
  assert.deepEqual({ ...alone.get('new-york') }, { dy: 0, z: 0, count: 0, front: 'new-york', buried: false });
});

test('the readouts step back from the shields; a pointer\'s click keeps focus', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const sign = source('src/components/home/AtlasSign.tsx');
  const home = source('src/components/home/HomePage.tsx');
  const css = source('src/styles/global.css');
  // The atlas hands every shield in view to the viewfinder, in the atlas's
  // px, from the same projection it stacks with.
  const place = atlas.slice(atlas.indexOf('const placeShields = () => {'), atlas.indexOf('const placeShieldsRef'));
  assert.match(place, /boxes\.push\(\{ id: slot\.id,/);
  assert.match(place, /- bleed/);
  assert.match(place, /viewfinderRef\.current\?\.avoid\(boxes\)/);
  assert.match(atlas, /map\.on\('move', onRender\)/);
  // The readouts' boxes are derived from their text, never measured.
  const clear = sign.slice(sign.indexOf('const clearReadouts = () => {'), sign.indexOf('// One frame of the viewfinder'));
  assert.ok(clear.length > 400);
  assert.doesNotMatch(clear, /getBoundingClientRect|offsetWidth|clientWidth|scrollWidth/);
  assert.match(clear, /READOUT_CHAR_PX \* latChars/);
  assert.match(sign, /className="viewfinder__yield"/);
  assert.match(css, /\.viewfinder__yield\[data-yield\] \{\s*opacity: 0;/);
  // Buried type is not printed (the phone's map is the same map).
  assert.match(atlas, /pose\.sign\.dataset\.buried = ''/);
  assert.match(css, /\.place-shield__sign\[data-buried\] :is\(\.place-shield__num, \.place-shield__code\) \{\s*opacity: 0;/);
  // The phone sets a place in the clear band above its card (derived).
  assert.match(atlas, /const phoneFocal = mobile \? phoneFocalY\(viewportH, phoneCardH\) : 0;/);
  // Up in the nav's band no shield is printed.
  assert.match(place, /point\.y - bleed - h < NAV_BAND_PX/);
  // A mouse's click on a shield or a tick leaves focus where it is; a
  // keyboard's (detail 0) takes it to the chapter, torn or not.
  assert.equal((sign.match(/onNavigate\?\.\([^)]*\{ focus: event\.detail === 0 \}\)/g) ?? []).length, 2);
  assert.match(home, /onSelect=\{select\}/);
});
