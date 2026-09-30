// Run offline: node --experimental-strip-types --test scripts/split-flap.test.mjs
//
// The ticket's board (src/components/home/RouteShield.tsx on the plan of
// src/lib/routeShield.ts FLAP), owner 2026-09-30: 封面上的地点我喜欢是和之前一样
// 字条跳转切换，和目标网站的效果一致，这个很重要. The reference's board (11 mois
// sans toi(t), its `c_`, measured: scratchpad wf29/ref/SPEC.md §2.3): the name
// being left retracts to its first 3 letters; 160 ms later letter i starts at
// 35·i ms and shows 6 + i random capitals, one every 22 ms, then settles.
// The sign is rendered into a DOM and the board driven on a clock held here.
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { FLAP, flapPlan, flapSpan, flapText, flipSet, keptShows } from '../src/lib/routeShield.ts';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><body><div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Node']) globalThis[key] = dom.window[key];
// The clock and the frames, held here.
let clock = 0;
const frames = new Map();
let nextFrame = 1;
globalThis.performance = { now: () => clock };
globalThis.requestAnimationFrame = (callback) => { const id = nextFrame++; frames.set(id, callback); return id; };
globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
const tickTo = (t) => {
  clock = t;
  const due = [...frames.entries()];
  frames.clear();
  due.forEach(([, callback]) => callback(t));
};

const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/home/RouteShield.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
});
const compiled = new Module(fileURLToPath(new URL('./route-shield-under-test.cjs', import.meta.url)));
compiled.filename = fileURLToPath(new URL('./route-shield-under-test.cjs', import.meta.url));
compiled.paths = Module._nodeModulePaths(fileURLToPath(new URL('..', import.meta.url)));
compiled._compile(result.outputFiles[0].text, compiled.filename);
const { FlapWord, RouteShield, primeFlap, runFlap, retractFlap } = compiled.exports;
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

/** A ticket's sign: its shield (state, number) and its name, as ArchiveChapter prints it. */
function sign(name, code, number) {
  const root = document.getElementById('root');
  root.innerHTML = renderToStaticMarkup(React.createElement('div', { className: 'archive-ticket-sign' },
    React.createElement(RouteShield, { code, number, flap: true }),
    React.createElement('span', { className: 'archive-ticket-sign__name' }, React.createElement(FlapWord, { text: name, role: 'name' }))));
  return root.firstElementChild;
}
/** What the board shows: per word, each cell's flip (or its own glyph), and
 *  the kept letters of the name being left that still show. */
function read(root) {
  const out = {};
  root.querySelectorAll('[data-flap]').forEach((word) => {
    const cells = [...word.querySelectorAll('[data-flap-c]')].map((c) => (c.hasAttribute('data-show') ? c.getAttribute('data-show') || '·' : c.dataset.flapC));
    out[word.dataset.flap] = cells.join('');
    const was = word.querySelector('[data-flap-was]');
    if (was) out.kept = [...was.querySelectorAll('.flap-k')].filter((k) => k.style.visibility !== 'hidden').map((k) => k.textContent).join('');
  });
  return out;
}
const MIAMI = { name: 'Miami', code: 'FL', num: '01' };

test('the plan is the reference\'s: retract, 160 ms, letter i at 35·i with 6 + i flips every 22 ms', () => {
  assert.deepEqual({ ...FLAP }, { keep: 3, pause: 160, stagger: 35, base: 6, tick: 22, hold: 60 });
  const plan = flapPlan(7);
  plan.forEach((step, i) => {
    assert.equal(step.start, 160 + 35 * i);
    assert.equal(step.flips, 6 + i);
    assert.equal(step.land, step.start + 22 * (6 + i));
  });
  // Every name the archive has, down this long after the retract.
  const spans = Object.fromEntries(['Miami', 'Orlando', 'Page', 'Zion', 'Bryce Canyon', 'New York'].map((n) => [n, flapSpan(n)]));
  assert.deepEqual(spans, { Miami: 520, Orlando: 634, Page: 463, Zion: 463, 'Bryce Canyon': 919, 'New York': 691 });
  assert.equal(flapText('  bryce   canyon '), 'BRYCE CANYON');
  assert.equal(flapSpan(''), 0);
  // The letters kept: the first three, whole before the retract, each until
  // the new name's cell at its place starts.
  assert.equal(keptShows(5, 7, -1), true);
  assert.equal(keptShows(3, 7, 0), false);
  assert.equal(keptShows(0, 7, 159), true);
  assert.equal(keptShows(0, 7, 160), false);
  assert.equal(keptShows(2, 7, 229), true);
  assert.equal(keptShows(2, 7, 230), false);
  assert.equal(keptShows(2, 2, 159), true, 'past a short new name: through the pause');
  assert.equal(keptShows(2, 2, 160), false);
});

test('a board turns MIAMI into ORLANDO as the reference\'s does, cell by cell', () => {
  const root = sign('Orlando', 'FL', '02');
  // Primed at take-off: the name being left, whole, over blank cells; the
  // number being left; the state (the same) as it is.
  const clear = primeFlap(root, MIAMI);
  assert.deepEqual(read(root), { code: 'FL', num: '01', name: '·······', kept: 'Miami' });
  clear();
  assert.deepEqual(read(root), { code: 'FL', num: '02', name: 'ORLANDO', kept: '' });
  // The turn, its retract at 1000.
  frames.clear();
  clock = 1100;
  const stop = runFlap(root, MIAMI, { origin: 1000, seed: 7 });
  // (Taken up 100 ms in: the first frame is written at once.)
  assert.deepEqual(read(root), { code: 'FL', num: '01', name: '·······', kept: 'Mia' });
  const plan = flapPlan(7);
  const seen = Array.from({ length: 7 }, () => []);
  for (let t = 101; t <= 700; t += 1) {
    tickTo(1000 + t);
    const board = read(root);
    [...board.name].forEach((glyph, i) => {
      const step = plan[i];
      const final = 'ORLANDO'[i];
      if (t < step.start) assert.equal(glyph, '·', `cell ${i} blank before its start (${t})`);
      else if (t < step.land) {
        // A flip: of its own width class, never the letter it lands on.
        assert.ok(flipSet(final).includes(glyph) && glyph !== final, `cell ${i} at ${t}: ${glyph}`);
        if (seen[i].at(-1)?.[1] !== glyph) seen[i].push([t, glyph]);
      } else assert.equal(glyph, final, `cell ${i} down at ${t}`);
    });
    // The kept letters: M until 160, I until 195, A until 230.
    const kept = board.kept;
    assert.equal(kept, t < 160 ? 'Mia' : t < 195 ? 'ia' : t < 230 ? 'a' : '', `kept at ${t}`);
    // The number turns on the same board: its first digit (0 → 0) holds
    // until it starts, its second shows 1 until 195; each lands on its plan.
    const [d0, d1] = board.num;
    if (t < 160) assert.equal(d0, '0');
    if (t >= 160 && t < 292) assert.ok(/[1-9]/.test(d0), `digit 0 at ${t}: ${d0}`);
    if (t >= 292) assert.equal(d0, '0');
    if (t < 195) assert.equal(d1, '1');
    if (t >= 195 + 22 * 7) assert.equal(d1, '2');
    // The same state never turns.
    assert.equal(board.code, 'FL');
  }
  // One glyph per 22 ms tick, no more.
  seen.forEach((flips, i) => assert.ok(flips.length <= plan[i].flips && flips.length >= plan[i].flips - 2, `cell ${i}: ${flips.length} flips`));
  // Down: every word itself, the overlay empty, the loop stopped.
  assert.deepEqual(read(root), { code: 'FL', num: '02', name: 'ORLANDO', kept: '' });
  assert.equal(frames.size, 0);
  stop();
});

test('a new state turns in from a blank band; spaces never turn; a two-line name keeps its words', () => {
  const root = sign('New York', 'NY', '06');
  frames.clear();
  clock = 0;
  runFlap(root, { name: 'Bryce Canyon', code: 'UT', num: '05' }, { origin: 0, seed: 3 });
  // Before its letters start, the band is blank (never UT on New York's form).
  assert.equal(read(root).code, '··');
  tickTo(170);
  assert.match(read(root).code, /^[^·]·$/, 'the first letter turning');
  tickTo(160 + 35 + 22 * 7);
  assert.equal(read(root).code, 'NY');
  // NEW YORK: its cells in their words (the space between them counted in
  // the cascade: Y is the fifth character).
  const words = [...root.querySelectorAll('[data-flap="name"] > .flap-w')].map((w) => w.textContent);
  assert.deepEqual(words, ['New', 'York']);
  const plan = flapPlan('NEW YORK'.length);
  tickTo(plan[4].start - 1);
  assert.equal(read(root).name[3], '·', 'Y not yet');
  tickTo(plan[4].start);
  assert.notEqual(read(root).name[3], '·', 'Y from its place in the cascade');
  tickTo(flapSpan('New York') + 1);
  assert.deepEqual(read(root), { code: 'NY', num: '06', name: 'NEWYORK', kept: '' });
});

test('the leaving ticket retracts its own name; nothing turns onto itself unless asked', () => {
  const root = sign('Miami', 'FL', '01');
  const restore = retractFlap(root);
  assert.equal(read(root).name, 'MIA··', 'its first three letters, the rest blank');
  restore();
  assert.equal(read(root).name, 'MIAMI');
  // A two-word name keeps its first three characters (NEW), its line the same.
  const ny = sign('New York', 'NY', '06');
  retractFlap(ny);
  assert.equal(read(ny).name, 'NEW····');
  // The same place: no turn…
  const same = sign('Miami', 'FL', '01');
  frames.clear();
  clock = 0;
  const stop = runFlap(same, MIAMI, { origin: 0 });
  assert.deepEqual(read(same), { code: 'FL', num: '01', name: 'MIAMI', kept: '' });
  assert.equal(frames.size, 0);
  stop();
  // …unless it had retracted (a ticket turned back to its own place): then
  // it turns back into place from its first letters.
  retractFlap(same);
  runFlap(same, MIAMI, { origin: 0, force: true, seed: 1 });
  assert.equal(read(same).kept, 'Mia');
  tickTo(flapSpan('Miami') + 1);
  assert.deepEqual(read(same), { code: 'FL', num: '01', name: 'MIAMI', kept: '' });
});

test('a stop puts the board straight back at once', () => {
  const root = sign('Zion', 'UT', '04');
  frames.clear();
  clock = 0;
  const stop = runFlap(root, { name: 'Page', code: 'AZ', num: '03' }, { origin: 0 });
  tickTo(250);
  assert.notDeepEqual(read(root), { code: 'UT', num: '04', name: 'ZION', kept: '' });
  stop();
  assert.deepEqual(read(root), { code: 'UT', num: '04', name: 'ZION', kept: '' });
  assert.equal(frames.size, 0);
});
