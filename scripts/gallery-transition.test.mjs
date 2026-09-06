import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] || fileURLToPath(new URL('../', import.meta.url));
const workSource = fs.readFileSync(`${root}/src/components/works/WorkStory.tsx`, 'utf8');
const backBody = workSource.match(/const returnToPreviousPage = \(\) => \{([\s\S]*?)\n  \};/)[1];

let backCalls = 0;
const window = {
  history: { state: { index: 2 }, back() { backCalls += 1; } },
  location: { origin: 'https://ryanxugallery.com' },
};
const pending = { current: false };
new Function('window', 'document', 'navigate', 'navigationPendingRef', backBody)(
  window, { referrer: '' }, () => Promise.resolve(), pending,
);
// The function body executes once above; repeat while the outgoing page remains mounted.
new Function('window', 'document', 'navigate', 'navigationPendingRef', backBody)(
  window, { referrer: '' }, () => Promise.resolve(), pending,
);
assert.equal(backCalls, 1, 'Double Back must not skip over Map');
window.history.state.index = 1;
new Function('window', 'document', 'navigate', 'navigationPendingRef', backBody)(
  window, { referrer: '' }, () => Promise.resolve(), pending,
);
assert.equal(backCalls, 1, 'Changing URL/history during preparation must not unlock old Story');

let fallbackCalls = 0;
const fallbackPending = { current: false };
const fallbackWindow = { history: { state: { index: 0 } }, location: window.location };
const fallback = new Function('window', 'document', 'navigate', 'navigationPendingRef', backBody).bind(
  null, fallbackWindow, { referrer: '' }, () => {
    fallbackCalls += 1;
    return Promise.reject(new Error('Simulated failed navigation'));
  }, fallbackPending,
);
fallback(); fallback();
assert.equal(fallbackCalls, 1, 'Fallback navigation is guarded too');
await Promise.resolve();
assert.equal(fallbackPending.current, false, 'Failed fallback can be retried');
fallback();
assert.equal(fallbackCalls, 2);
await Promise.resolve();

const layout = fs.readFileSync(`${root}/src/layouts/Layout.astro`, 'utf8');
const begin = layout.indexOf('      var restoreHomeScrollOnSwap = false;');
const end = layout.indexOf('      // ── Page-transition direction', begin);
const scrollCode = layout.slice(begin, end);

function makeScrollContext({ position = 'fixed', top = '-5342px', scrollY = 0, computedTop = top } = {}) {
  const store = new Map();
  const scrollCalls = [];
  const document = new EventTarget();
  document.body = { style: { position, top } };
  const history = {
    state: { index: 0, scrollX: 17, scrollY: 0, custom: 'preserved' },
    replaceState(next) { this.state = next; },
  };
  const window = {
    scrollY,
    location: { origin: 'https://ryanxugallery.com', pathname: '/' },
    scrollTo(value) { scrollCalls.push(value); this.scrollY = value.top; },
  };
  vm.runInNewContext(scrollCode, {
    document, window, history, URL,
    sessionStorage: {
      setItem: (key, value) => store.set(key, value),
      getItem: (key) => store.get(key),
      removeItem: (key) => store.delete(key),
    },
    getComputedStyle: () => ({ top: computedTop }),
  });
  const event = (name, from, to, navigationType = 'push') => {
    const event = new Event(name);
    Object.assign(event, {
      from: new URL(from, window.location.origin),
      to: new URL(to, window.location.origin),
      navigationType,
    });
    document.dispatchEvent(event);
  };
  return { document, window, history, event, store, scrollCalls };
}

let c = makeScrollContext();
c.event('astro:before-preparation', '/', '/travel?place=miami#atlas-map');
assert.equal(c.store.get('home-filmstrip-scroll'), '5342', 'Locked body must save the source chapter');
// Astro performs one final window.scrollY sample after preparation.
c.history.state.scrollY = 0;
c.event('astro:before-swap', '/', '/travel?place=miami#atlas-map');
assert.equal(c.history.state.scrollY, 5342, 'Existing Home history entry must receive original scroll');
assert.equal(c.history.state.index, 0);
assert.equal(c.history.state.scrollX, 17);
assert.equal(c.history.state.custom, 'preserved');

c.window.location.pathname = '/travel';
c.event('astro:before-preparation', '/travel', '/', 'traverse');
c.window.location.pathname = '/';
c.window.scrollY = c.history.state.scrollY; // Astro restores the existing Home entry.
c.event('astro:after-swap', '/travel', '/', 'traverse');
assert.equal(c.window.scrollY, 5342);
assert.equal(c.scrollCalls.length, 0, 'Native Back keeps Astro restoration; no second scroll correction');

c = makeScrollContext();
c.history.state = { index: 3, scrollX: 0, scrollY: 82 };
c.event('astro:before-preparation', '/', '/about', 'traverse');
c.event('astro:before-swap', '/', '/about', 'traverse');
assert.equal(c.history.state.scrollY, 82, 'Leaving Home via traversal must not overwrite destination history');

c = makeScrollContext({ position: '', top: '', scrollY: 1270 });
c.event('astro:before-preparation', '/', '/travel');
c.event('astro:before-swap', '/', '/travel');
assert.equal(c.store.get('home-filmstrip-scroll'), '1270');
assert.equal(c.history.state.scrollY, 1270, 'Ordinary Home scroll is unchanged');

c = makeScrollContext({ top: '', computedTop: '-375px' });
c.event('astro:before-preparation', '/', '/travel');
assert.equal(c.store.get('home-filmstrip-scroll'), '375', 'Computed fixed offset remains supported');
c.window.location.pathname = '/travel';
c.event('astro:before-preparation', '/travel', '/');
c.window.location.pathname = '/';
c.event('astro:after-swap', '/travel', '/');
assert.equal(c.scrollCalls[0].top, 375, 'Direct Home link still restores the existing saved offset');
assert.equal(c.store.has('home-filmstrip-scroll'), false);

const magazine = fs.readFileSync(`${root}/src/components/home/MagazineLayout.tsx`, 'utf8');
const keyboardStart = magazine.indexOf('  // Escape closes the story');
const keyboardBlock = magazine.slice(keyboardStart).match(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[onClose, lightboxIndex, sharedEntry, standalone, isPresent\]\);/)[1];
const keyboardBody = keyboardBlock
  .replace('(e: KeyboardEvent)', '(e)')
  .replace('querySelectorAll<HTMLElement>', 'querySelectorAll');
const bindKeys = new Function('window', 'document', 'onClose', 'lightboxIndex', 'sharedEntry', 'standalone', 'isPresent', 'dialogRef', keyboardBody);

function checkEscape({ present = true, lightbox = null, standalone = false, prevented = false } = {}) {
  let closes = 0;
  const listeners = new Map();
  const cleanup = bindKeys(
    {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    },
    {}, () => { closes += 1; }, lightbox, false, standalone, present, { current: null },
  );
  const registered = listeners.has('keydown');
  listeners.get('keydown')?.({ key: 'Escape', defaultPrevented: prevented });
  cleanup?.();
  assert.equal(listeners.size, 0, 'Story key listener must be removed by cleanup');
  return { closes, registered };
}

assert.deepEqual(checkEscape(), { closes: 1, registered: true });
assert.deepEqual(checkEscape({ present: false }), { closes: 0, registered: false }, 'An exiting Story must not retain Escape or a focus trap');
assert.equal(checkEscape({ lightbox: 0 }).closes, 0, 'Lightbox Escape must not also close Story');
assert.equal(checkEscape({ prevented: true }).closes, 0, 'Already-consumed Escape must not close Story');
assert.equal(checkEscape({ standalone: true }).closes, 0, 'Escape must not navigate away from a standalone Story');
assert.match(magazine, /inert=\{!isPresent\}/, 'Outgoing Story content must stop accepting pointer and keyboard actions');

console.log('PASS: duplicate Back, retry after failure, fixed-body scroll, native Back, target-state preservation, ordinary scroll, computed offset, direct Home restore, exit interaction lock, and layered Escape handling');
