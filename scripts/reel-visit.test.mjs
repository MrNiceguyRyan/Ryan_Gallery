// Run offline: node --experimental-strip-types --test scripts/reel-visit.test.mjs
//
// The opening film on a second view (src/lib/reelVisit.ts): the decision
// (seen flag + navigation type → play | skip), a restored position below the
// first screen (no film), an old entry saved under the scroll-pinned reel
// (moved back by its offset, once), and the two inline scripts built from
// those very functions — index.astro's <head> script and Layout's
// ClientRouter listener — run in a sandbox with the browser's pieces mocked.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/reelVisit.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
});
const V = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('the decision: a first view, a reload and a new tab play; a later view in the session skips', () => {
  const cases = [
    // seen, navigation, firstEntry → plan
    [false, 'navigate', false, 'play'],
    [false, 'back_forward', false, 'play'],
    [false, 'push', false, 'play'],
    [false, 'traverse', false, 'play'],
    [false, 'reload', false, 'play'],
    [true, 'reload', false, 'play'],
    [true, 'reload', true, 'play'],
    [true, 'navigate', false, 'skip'],
    [true, 'navigate', true, 'play'],
    [true, 'back_forward', false, 'skip'],
    [true, 'back_forward', true, 'skip'],
    [true, 'push', false, 'skip'],
    [true, 'replace', false, 'skip'],
    [true, 'traverse', false, 'skip'],
    [true, 'prerender', false, 'play'],
    [true, 'something-new', false, 'play'],
  ];
  for (const [seen, nav, first, plan] of cases) assert.equal(V.reelPlan(seen, nav, first), plan, `${seen} ${nav} ${first}`);
});

test('a saved scroll: the same place on the page (the film takes no room); an old reel entry moves back by its offset', () => {
  assert.equal(V.restoredScroll(1500, undefined), 1500);
  assert.equal(V.restoredScroll(1500, 0), 1500);
  assert.equal(V.restoredScroll(5400, 3900), 1500);
  assert.equal(V.restoredScroll(1200, 3900), 0, 'inside the old film: the first screen');
  assert.equal(V.restoredScroll(800, 'x'), 800);
});

// A sandbox with just enough of a browser for the inline scripts.
function sandbox({ readyState = 'loading', seen = null, nav = 'navigate', histLength = 3, state = null, height = 1000, storageThrows = false } = {}) {
  const attrs = {};
  const listeners = {};
  const replaced = [];
  const history = {
    length: histLength,
    state,
    replaceState(next) {
      replaced.push(next);
      this.state = next;
    },
  };
  const sessionStorage = {
    getItem(k) {
      if (storageThrows) throw new Error('denied');
      return k === V.REEL_SEEN_KEY ? seen : null;
    },
  };
  const ctx = {
    document: {
      readyState,
      documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] },
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    },
    performance: { getEntriesByType: () => [{ type: nav }] },
    history,
    sessionStorage,
    innerHeight: height,
    location: { pathname: '/', origin: 'http://site' },
    URL,
    Object,
    Math,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, attrs, listeners, replaced };
}
const plain = (o) => JSON.parse(JSON.stringify(o));
const HEAD = V.reelHeadScript();

test('the head script: decides before the first paint on a full load', () => {
  const run = (opts) => {
    const box = sandbox(opts);
    vm.runInContext(HEAD, box.ctx);
    return box.attrs;
  };
  assert.deepEqual(plain(run({})), { 'data-reel': 'reel', 'data-opening': '' }, 'first view: the film');
  assert.deepEqual(plain(run({ seen: '1', nav: 'navigate' })), { 'data-reel': 'skip' }, 'a later view');
  assert.deepEqual(plain(run({ seen: '1', nav: 'back_forward' })), { 'data-reel': 'skip' }, 'back');
  assert.equal(run({ seen: '1', nav: 'reload' })['data-opening'], '', 'reload');
  assert.equal(run({ seen: '1', nav: 'navigate', histLength: 1 })['data-opening'], '', 'a new tab');
  assert.equal(run({ seen: '1', storageThrows: true })['data-opening'], '', 'storage denied: the film');
  // An in-site arrival runs it again after the swap (Layout decided): it
  // steps aside.
  assert.deepEqual(plain(run({ seen: '1', readyState: 'complete' })), {});
});

test('the head script: a position restored below the first screen skips the film; at the top it plays', () => {
  const run = (opts) => {
    const box = sandbox(opts);
    vm.runInContext(HEAD, box.ctx);
    return box;
  };
  // A reload deep in the archive: the reader keeps his place.
  let box = run({ seen: '1', nav: 'reload', state: { index: 1, scrollX: 0, scrollY: 4200 } });
  assert.equal(box.attrs['data-reel'], 'skip');
  assert.equal(box.attrs['data-opening'], undefined);
  // A reload on the first screen (or just under it): the film.
  box = run({ seen: '1', nav: 'reload', state: { index: 1, scrollX: 0, scrollY: 0 } });
  assert.equal(box.attrs['data-opening'], '');
  box = run({ seen: '1', nav: 'reload', state: { index: 1, scrollX: 0, scrollY: 420 } });
  assert.equal(box.attrs['data-opening'], '');
  // Nothing to correct: history is left alone.
  assert.equal(box.replaced.length, 0);
});

test('the head script: an entry saved under the old reel is moved back by its offset, once', () => {
  let box = sandbox({ seen: '1', nav: 'back_forward', state: { index: 2, scrollX: 0, scrollY: 5400, reelOffset: 3900 } });
  vm.runInContext(HEAD, box.ctx);
  assert.deepEqual(plain(box.ctx.history.state), { index: 2, scrollX: 0, scrollY: 1500 });
  // Saved on the old reel's first screen, reloaded: the top, and the film.
  box = sandbox({ seen: '1', nav: 'reload', state: { index: 1, scrollX: 0, scrollY: 3900, reelOffset: 3900 } });
  vm.runInContext(HEAD, box.ctx);
  assert.equal(box.ctx.history.state.scrollY, 0);
  assert.equal(box.attrs['data-opening'], '');
});

test('the router script: an in-site arrival at the homepage decides on the incoming document', () => {
  const box = sandbox({ readyState: 'complete', seen: '1' });
  vm.runInContext(V.reelRouterScript(), box.ctx);
  const swap = (target, to, navigationType) => {
    const incoming = {};
    const e = { to: new URL(to, 'http://site'), navigationType, newDocument: { documentElement: { setAttribute: (k, v) => { incoming[k] = v; } } } };
    target.listeners['astro:before-swap'].forEach((fn) => fn(e));
    return incoming;
  };
  assert.deepEqual(swap(box, '/', 'push'), { 'data-reel': 'skip' }, 'the wordmark');
  assert.deepEqual(swap(box, '/', 'traverse'), { 'data-reel': 'skip' }, 'back');
  assert.deepEqual(swap(box, '/about', 'push'), {}, 'not the homepage');
  const fresh = sandbox({ readyState: 'complete', seen: null });
  vm.runInContext(V.reelRouterScript(), fresh.ctx);
  assert.deepEqual(swap(fresh, '/', 'push'), { 'data-reel': 'reel', 'data-opening': '' }, 'not seen yet: the film');
});
