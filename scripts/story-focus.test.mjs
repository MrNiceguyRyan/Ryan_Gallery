import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { restoreStoryFocus } from '../src/lib/storyFocus.ts';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
let now = 0;
let nextFrame = 0;
const frames = new Map();
window.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
window.cancelAnimationFrame = id => frames.delete(id);
window.performance.now = () => now;
// JSDOM has no layout engine. Model only whether a source occupies layout.
dom.window.HTMLElement.prototype.getClientRects = function () {
  return this.style.display === 'none' ? [] : [{}];
};
const tick = (ms = 16) => {
  now += ms;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach(callback => callback(now));
};
const source = () => document.getElementById('source');

beforeEach(() => {
  now = 0;
  frames.clear();
  document.body.innerHTML = '<main id="main-content" tabindex="-1"><div id="archive"><button id="source" data-story-source="miami">Miami</button></div></main><button id="dialog-close">Close</button>';
  document.getElementById('dialog-close').focus();
});

test('waits beyond two frames for both homepage and cover interaction gates', () => {
  const archive = document.getElementById('archive');
  archive.setAttribute('inert', '');
  source().setAttribute('inert', '');
  const focusCalls = [];
  const focus = source().focus.bind(source());
  source().focus = options => { focusCalls.push(options); focus(options); };
  restoreStoryFocus(source(), 'miami');
  tick(); tick();
  assert.equal(focusCalls.length, 0);
  archive.removeAttribute('inert');
  tick();
  assert.equal(focusCalls.length, 0, 'The cover still has its own inert gate');
  source().removeAttribute('inert');
  tick();
  assert.equal(document.activeElement, source());
  assert.deepEqual(focusCalls, [{ preventScroll: true }]);
  assert.equal(frames.size, 0);
});

test('re-resolves the same collection after responsive tree replacement', () => {
  const old = source();
  restoreStoryFocus(old, 'miami');
  document.getElementById('archive').innerHTML = '<button data-story-source="orlando">Other place</button><button id="mobile" data-story-source="miami">Miami mobile</button>';
  tick();
  assert.equal(document.activeElement.id, 'mobile');
});

test('ignores a hidden old source in favor of its visible replacement', () => {
  source().style.display = 'none';
  document.getElementById('archive').insertAdjacentHTML('beforeend', '<button id="replacement" data-story-source="miami">Visible Miami</button>');
  restoreStoryFocus(source(), 'miami');
  tick();
  assert.equal(document.activeElement.id, 'replacement');
});

test('source removal falls back to the archive without changing scroll', () => {
  const old = source();
  old.remove();
  const fallback = document.getElementById('main-content');
  const calls = [];
  const focus = fallback.focus.bind(fallback);
  fallback.focus = options => { calls.push(options); focus(options); };
  restoreStoryFocus(old, 'miami');
  tick();
  assert.equal(document.activeElement, fallback);
  assert.deepEqual(calls, [{ preventScroll: true }]);
});

test('cancellation on reopening or unmount prevents stale focus stealing', () => {
  const cancel = restoreStoryFocus(source(), 'miami');
  cancel();
  tick(600);
  assert.equal(document.activeElement.id, 'dialog-close');
  assert.equal(frames.size, 0);
});

test('a persistently gated source has a bounded archive fallback', () => {
  source().setAttribute('aria-hidden', 'true');
  restoreStoryFocus(source(), 'miami');
  tick(499);
  assert.equal(document.activeElement.id, 'dialog-close');
  tick(1);
  assert.equal(document.activeElement.id, 'main-content');
  assert.equal(frames.size, 0);
});

test('never focuses a still-inert page and does not retry indefinitely', () => {
  document.getElementById('main-content').setAttribute('inert', '');
  restoreStoryFocus(source(), 'miami');
  tick(500);
  assert.equal(document.activeElement.id, 'dialog-close');
  assert.equal(frames.size, 0);
});

test('body-lock cleanup and restoration override smooth CSS without Lenis', () => {
  const home = readFileSync(new URL('../src/components/home/HomePage.tsx', import.meta.url), 'utf8');
  const effect = home.match(/useEffect\(\(\) => \{\n    const isOverlayOpen = storyActive;([\s\S]*?)\n  \}, \[storyActive\]\);/);
  assert.ok(effect, 'Exercise the real Home body-lock effect');
  const apply = new Function('document', 'window', 'storyActive', 'storyOpenRef', 'storyScrollYRef', 'bodyPaddingRightRef', 'lenisRef', `const isOverlayOpen = storyActive;${effect[1]}`);
  const calls = [];
  const fakeWindow = {
    innerWidth: 1440,
    scrollY: 0,
    scrollTo(options) {
      calls.push(options);
      // On a page with smooth CSS, auto would animate from zero instead of
      // restoring the saved chapter in this same frame.
      if (options.behavior === 'instant') this.scrollY = options.top;
    },
  };
  const saved = { current: 2452 };
  const open = { current: true };
  const padding = { current: '' };
  const lenis = { current: null };
  const cleanup = apply(document, fakeWindow, true, open, saved, padding, lenis);
  assert.equal(document.body.style.position, 'fixed');
  cleanup();
  assert.equal(fakeWindow.scrollY, 2452, 'Cleanup restores immediately before timeline resumes');
  fakeWindow.scrollY = 0;
  apply(document, fakeWindow, false, open, saved, padding, lenis);
  assert.equal(fakeWindow.scrollY, 2452);
  assert.equal(open.current, false);
  assert.equal(document.body.style.position, '');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.behavior === 'instant'));
});
