// Run offline: node --experimental-strip-types --test scripts/reel-visit.test.mjs
//
// The opening reel on a second view (src/lib/reelVisit.ts): the decision
// (seen flag + navigation type → play | skip), the scroll carried between a
// page with the film and one without it, and the two inline scripts built
// from those very functions — index.astro's <head> script and Layout's
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

test('a saved scroll keeps its place on the page, with or without the film above it', () => {
  const P = 3900;
  // In the archive: the same place on the page either way.
  assert.equal(V.reelScroll(P + 1500, P, 0, false, 500), 1500);
  assert.equal(V.reelScroll(1500, 0, P, false, 500), P + 1500);
  assert.equal(V.reelScroll(P + 1500, P, P, false, 500), P + 1500);
  // On the first screen: the first screen.
  assert.equal(V.reelScroll(P, P, 0, false, 500), 0);
  // Inside the film, then no film: the first screen.
  assert.equal(V.reelScroll(1200, P, 0, false, 500), 0);
  // Inside the film, and the film again: where it was (within the film).
  assert.equal(V.reelScroll(1200, P, P, false, 500), 1200);
  assert.equal(V.reelScroll(1200, P, 800, false, 500), 800);
  // A reload that plays the film, on (or near) the first screen: the cover.
  assert.equal(V.reelScroll(P, P, P, true, 500), 0);
  assert.equal(V.reelScroll(300, 0, P, true, 500), 0);
  // …but deep in the archive it keeps the reader's place.
  assert.equal(V.reelScroll(P + 2400, P, P, true, 500), P + 2400);
});

// A sandbox with just enough of a browser for the inline scripts.
function sandbox({ readyState = 'loading', seen = null, nav = 'navigate', histLength = 3, state = null, width = 1728, height = 1000, reduce = false, storageThrows = false, reel = null } = {}) {
  const attrs = {};
  const listeners = {};
  const replaced = [];
  let scrolled = null;
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
      querySelector: (sel) => (sel === '.intro-reel' ? reel : null),
    },
    performance: { getEntriesByType: () => [{ type: nav }] },
    history,
    sessionStorage,
    matchMedia: () => ({ matches: reduce }),
    getComputedStyle: (el) => ({ marginBottom: el.marginBottom }),
    innerWidth: width,
    innerHeight: height,
    scrollY: state?.scrollY ?? 0,
    scrollTo: (o) => { scrolled = o.top; },
    location: { pathname: '/', origin: 'http://site' },
    URL,
    Object,
    Math,
    parseFloat,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, attrs, listeners, replaced, get scrolled() { return scrolled; } };
}
// (Objects made inside the sandbox have its own prototypes.)
const plain = (o) => JSON.parse(JSON.stringify(o));
const HEAD = V.reelHeadScript({ desktopScreens: 3.9, phoneScreens: 2.4, phoneMaxWidth: 1023 });

test('the head script: decides before the first paint on a full load', () => {
  const run = (opts) => {
    const box = sandbox(opts);
    vm.runInContext(HEAD, box.ctx);
    return box;
  };
  assert.equal(run({}).attrs['data-reel'], 'reel', 'first view');
  assert.equal(run({ seen: '1', nav: 'navigate' }).attrs['data-reel'], 'skip', 'a later view');
  assert.equal(run({ seen: '1', nav: 'back_forward' }).attrs['data-reel'], 'skip', 'back');
  assert.equal(run({ seen: '1', nav: 'reload' }).attrs['data-reel'], 'reel', 'reload');
  assert.equal(run({ seen: '1', nav: 'navigate', histLength: 1 }).attrs['data-reel'], 'reel', 'a new tab');
  assert.equal(run({ seen: '1', storageThrows: true }).attrs['data-reel'], 'reel', 'storage denied: the film');
  // An in-site arrival runs it again after the swap (Layout decided): it
  // steps aside.
  assert.equal(run({ seen: '1', readyState: 'complete' }).attrs['data-reel'], undefined);
});

test('the head script: carries a restored scroll into the layout about to show', () => {
  // Back to the archive, saved with the film (offset 3900), now skipped.
  let box = sandbox({ seen: '1', nav: 'back_forward', state: { index: 2, scrollX: 0, scrollY: 5400, reelOffset: 3900 } });
  vm.runInContext(HEAD, box.ctx);
  assert.deepEqual(plain(box.ctx.history.state), { index: 2, scrollX: 0, scrollY: 1500, reelOffset: 0 });
  // A reload on the first screen: the film from its cover.
  box = sandbox({ seen: '1', nav: 'reload', state: { index: 1, scrollX: 0, scrollY: 0, reelOffset: 0 } });
  vm.runInContext(HEAD, box.ctx);
  assert.equal(box.ctx.history.state.scrollY, 0);
  assert.equal(box.ctx.history.state.reelOffset, 3900);
  // A reload deep in the archive, saved without the film: the same place.
  box = sandbox({ seen: '1', nav: 'reload', state: { index: 1, scrollX: 0, scrollY: 1500, reelOffset: 0 } });
  vm.runInContext(HEAD, box.ctx);
  assert.equal(box.ctx.history.state.scrollY, 5400);
  // A phone's film is shorter; reduced motion keeps a one-screen pin.
  box = sandbox({ seen: '1', nav: 'reload', width: 390, height: 844, state: { scrollY: 1500, reelOffset: 0 } });
  vm.runInContext(HEAD, box.ctx);
  assert.equal(box.ctx.history.state.reelOffset, Math.round(2.4 * 844));
  box = sandbox({ seen: '1', nav: 'reload', reduce: true, state: { scrollY: 1500, reelOffset: 0 } });
  vm.runInContext(HEAD, box.ctx);
  assert.equal(box.ctx.history.state.reelOffset, 1000);
  // Nothing saved by this code: left as it is.
  box = sandbox({ seen: '1', nav: 'back_forward', state: { index: 1, scrollX: 0, scrollY: 800 } });
  vm.runInContext(HEAD, box.ctx);
  assert.equal(box.replaced.length, 0);
});

test('the head script: a reload deep in the archive keeps the reel\'s frame hidden until the island takes over', () => {
  const restore = (opts) => {
    const box = sandbox(opts);
    vm.runInContext(HEAD, box.ctx);
    return box.attrs['data-reel-restore'];
  };
  // Deep in the archive, the film playing above it: the guard.
  assert.equal(restore({ seen: '1', nav: 'reload', state: { scrollY: 1500, reelOffset: 0 } }), '');
  assert.equal(restore({ seen: null, nav: 'back_forward', state: { scrollY: 5400, reelOffset: 3900 } }), '');
  // On the cover, inside the film, on the first screen (a reload restarts
  // the film), skipped, or nothing saved: none.
  assert.equal(restore({ seen: '1', nav: 'reload', state: { scrollY: 0, reelOffset: 0 } }), undefined);
  assert.equal(restore({ seen: null, nav: 'back_forward', state: { scrollY: 1200, reelOffset: 3900 } }), undefined);
  assert.equal(restore({ seen: '1', nav: 'reload', state: { scrollY: 3900, reelOffset: 3900 } }), undefined);
  assert.equal(restore({ seen: '1', nav: 'back_forward', state: { scrollY: 5400, reelOffset: 3900 } }), undefined);
  assert.equal(restore({ seen: '1', nav: 'reload' }), undefined);
});

test('the router script: an in-site arrival at the homepage decides on the incoming document', () => {
  const box = sandbox({ readyState: 'complete', seen: '1' });
  vm.runInContext(V.reelRouterScript(), box.ctx);
  const swap = (to, navigationType) => {
    const incoming = {};
    const e = { to: new URL(to, 'http://site'), navigationType, newDocument: { documentElement: { setAttribute: (k, v) => { incoming[k] = v; } } } };
    box.listeners['astro:before-swap'].forEach((fn) => fn(e));
    return incoming['data-reel'];
  };
  assert.equal(swap('/', 'push'), 'skip', 'the wordmark');
  assert.equal(swap('/', 'traverse'), 'skip', 'back');
  assert.equal(swap('/about', 'push'), undefined, 'not the homepage');
  const fresh = sandbox({ readyState: 'complete', seen: null });
  vm.runInContext(V.reelRouterScript(), fresh.ctx);
  const incoming = {};
  fresh.listeners['astro:before-swap'].forEach((fn) => fn({ to: new URL('/', 'http://site'), navigationType: 'push', newDocument: { documentElement: { setAttribute: (k, v) => { incoming[k] = v; } } } }));
  assert.equal(incoming['data-reel'], 'reel', 'not seen yet: the film');
});

test('the router script: a traversal carries the entry\'s scroll into the layout now showing', () => {
  // Swapped in skipped (the reel collapsed: no height).
  const box = sandbox({ readyState: 'complete', seen: '1', state: { index: 1, scrollX: 0, scrollY: 5400, reelOffset: 3900 }, reel: { offsetHeight: 0, marginBottom: '-1000px' } });
  vm.runInContext(V.reelRouterScript(), box.ctx);
  box.listeners['astro:after-swap'].forEach((fn) => fn());
  assert.equal(box.scrolled, 1500);
  assert.deepEqual(plain(box.ctx.history.state), { index: 1, scrollX: 0, scrollY: 1500, reelOffset: 0 });
  // With the film (4900 tall, overlapping one 1000px screen): offset 3900.
  const film = sandbox({ readyState: 'complete', seen: null, state: { index: 1, scrollX: 0, scrollY: 1500, reelOffset: 0 }, reel: { offsetHeight: 4900, marginBottom: '-1000px' } });
  vm.runInContext(V.reelRouterScript(), film.ctx);
  assert.equal(film.ctx.__reelVisit.offset(), 3900);
  film.listeners['astro:after-swap'].forEach((fn) => fn());
  assert.equal(film.scrolled, 5400);
  // A push arrival (a new entry, nothing saved): untouched.
  const push = sandbox({ readyState: 'complete', seen: '1', state: { index: 3, scrollX: 0, scrollY: 0 } });
  vm.runInContext(V.reelRouterScript(), push.ctx);
  push.listeners['astro:after-swap'].forEach((fn) => fn());
  assert.equal(push.scrolled, null);
  assert.equal(push.replaced.length, 0);
});
