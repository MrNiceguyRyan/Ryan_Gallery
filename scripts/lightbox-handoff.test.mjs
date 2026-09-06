// Offline behavior regression; motion is stubbed so image races are deterministic.
// Run: node --test scripts/lightbox-handoff.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><body><button id="source">Source</button><div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetParent', { get() { return this.parentElement; } });

const pending = [];
class ControlledImage {
  naturalWidth = 1400;
  onload = null;
  onerror = null;
  decode() { return new Promise((resolve, reject) => { this.resolveDecode = resolve; this.rejectDecode = reject; }); }
  set src(value) { this.url = value; pending.push(this); }
  get src() { return this.url; }
}
globalThis.Image = ControlledImage;
const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/shared/Lightbox.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'lucide-react'],
  plugins: [{ name: 'deterministic-motion', setup(builder) {
    builder.onResolve({ filter: /^framer-motion$/ }, () => ({ path: 'motion', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
      import React from 'react';
      const components = {};
      export const motion = new Proxy({}, { get(_, tag) { return components[tag] ||= React.forwardRef(({children, initial, animate, exit, transition, variants, custom, whileHover, whileTap, ...props}, ref) => React.createElement(tag, {...props, ref}, children)); }});
      export const AnimatePresence = ({children}) => children;
      export const useReducedMotion = () => false;
      export const useIsPresent = () => true;
    `, loader: 'js' }));
    builder.onResolve({ filter: /lib\/narratives$/ }, () => ({ path: 'labels', namespace: 'labels' }));
    builder.onLoad({ filter: /.*/, namespace: 'labels' }, () => ({ contents: `export const photoDisplayTitle = p => p.title; export const photoAccessibleLabel = (p,i,n) => p.title + ', ' + (i+1) + ' of ' + n;`, loader: 'js' }));
  } }],
});
const compiled = new Module(fileURLToPath(new URL('./lightbox-under-test.cjs', import.meta.url)));
compiled.filename = fileURLToPath(new URL('./lightbox-under-test.cjs', import.meta.url));
compiled.paths = Module._nodeModulePaths(fileURLToPath(new URL('..', import.meta.url)));
compiled._compile(result.outputFiles[0].text, compiled.filename);
const Lightbox = compiled.exports.default;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = React;
const photos = Array.from({ length: 5 }, (_, i) => ({ _id: `photo-${i}`, imageUrl: `https://images.test/${i}.jpg`, title: `Frame ${i + 1}` }));
let root;
const visible = () => document.querySelector('.gallery-lightbox-photo')?.getAttribute('src');
const requestFor = (i) => pending.findLast(image => image.url.includes(`/${i}.jpg`) && image.onload);
async function key(value) { await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })); }); }
async function decode(image) { await act(async () => { image.onload(); image.resolveDecode(); await Promise.resolve(); }); }
async function mount() {
  pending.length = 0;
  document.getElementById('source').focus();
  root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(React.createElement(Lightbox, { photos, initialIndex: 0, onClose() {} })); });
}
async function unmount() { await act(async () => root.unmount()); }

test('old image and metadata remain until the selected responsive image has decoded', async () => {
  await mount();
  await key('ArrowRight');
  const requested = requestFor(1);
  assert.match(visible(), /\/0\.jpg/);
  await act(async () => requested.onload());
  assert.match(visible(), /\/0\.jpg/, 'load alone is not decode completion');
  await act(async () => { requested.resolveDecode(); await Promise.resolve(); });
  assert.match(visible(), /\/1\.jpg/);
  assert.match(document.querySelector('[aria-live]').textContent, /Frame 2/);
  assert.equal(document.querySelector('.gallery-lightbox-photo').getAttribute('srcset'), requested.srcset);
  await unmount();
});

test('late decode from a superseded frame cannot overwrite the latest selection', async () => {
  await mount();
  await key('ArrowRight');
  const stale = requestFor(1);
  await act(async () => stale.onload());
  await key('ArrowRight');
  const latest = requestFor(2);
  await decode(latest);
  await act(async () => { stale.resolveDecode(); await Promise.resolve(); });
  assert.match(visible(), /\/2\.jpg/);
  await unmount();
});

test('rapid reversal back to the displayed frame cancels the pending handoff', async () => {
  await mount();
  await key('ArrowRight');
  const stale = requestFor(1);
  await act(async () => stale.onload());
  await key('ArrowLeft');
  await act(async () => { stale.resolveDecode(); await Promise.resolve(); });
  assert.match(visible(), /\/0\.jpg/);
  assert.equal(document.querySelector('[role=status]').textContent, '');
  await unmount();
});

test('failed request preserves the photo, offers retry, then commits only after success', async () => {
  await mount();
  await key('ArrowRight');
  await act(async () => requestFor(1).onerror());
  assert.match(visible(), /\/0\.jpg/);
  assert.match(document.querySelector('[role=status]').textContent, /could not load/);
  const retry = [...document.querySelectorAll('button')].find(button => button.textContent === 'Retry');
  await act(async () => retry.click());
  await decode(requestFor(1));
  assert.match(visible(), /\/1\.jpg/);
  assert.equal(document.querySelector('[role=status]').textContent, '');
  await unmount();
});

test('closing during decode cancels callbacks and restores the source focus/scroll lock', async () => {
  document.body.style.overflow = 'hidden'; // The parent story already owns the lock.
  await mount();
  await key('ArrowRight');
  const stale = requestFor(1);
  await act(async () => stale.onload());
  await unmount();
  await act(async () => { stale.resolveDecode(); await Promise.resolve(); });
  assert.equal(document.getElementById('root').children.length, 0);
  assert.equal(document.activeElement.id, 'source');
  assert.equal(document.body.style.overflow, 'hidden');
  document.body.style.overflow = '';
});

test('batched rapid keys track the requested index and respect both sequence edges', async () => {
  await mount();
  await act(async () => {
    for (let i = 0; i < 12; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  });
  assert.match(visible(), /\/0\.jpg/);
  await decode(requestFor(4));
  assert.match(visible(), /\/4\.jpg/);
  assert.equal(document.querySelector('[aria-label^="Next photo"]'), null);
  await act(async () => {
    for (let i = 0; i < 12; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  });
  await decode(requestFor(0));
  assert.match(visible(), /\/0\.jpg/);
  assert.equal(document.querySelector('[aria-label^="Previous photo"]'), null);
  await unmount();
});

test('decode rejection retains the old photo instead of trusting download completion', async () => {
  await mount();
  await key('ArrowRight');
  const requested = requestFor(1);
  await act(async () => { requested.onload(); requested.rejectDecode(new Error('decode failed')); await Promise.resolve(); });
  assert.match(visible(), /\/0\.jpg/);
  assert.match(document.querySelector('[role=status]').textContent, /could not load/);
  await unmount();
});

test('a stalled image has a bounded wait and ignores a later load', async (context) => {
  const { prepareLightboxImage } = await import('../src/lib/lightboxImage.ts');
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const outcomes = [];
  const cancel = prepareLightboxImage('https://images.test/stalled.jpg', ready => outcomes.push(ready));
  const requested = pending.at(-1);
  context.mock.timers.tick(11999);
  assert.deepEqual(outcomes, []);
  context.mock.timers.tick(1);
  assert.deepEqual(outcomes, [false]);
  assert.equal(requested.onload, null);
  cancel();
  context.mock.timers.tick(30000);
  assert.deepEqual(outcomes, [false]);
});

test('cancelled image requests neither time out nor deliver stale callbacks', async (context) => {
  const { prepareLightboxImage } = await import('../src/lib/lightboxImage.ts');
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const outcomes = [];
  const cancel = prepareLightboxImage('https://images.test/cancelled.jpg', ready => outcomes.push(ready));
  const requested = pending.at(-1);
  cancel();
  context.mock.timers.tick(30000);
  assert.equal(requested.onload, null);
  assert.equal(requested.onerror, null);
  assert.deepEqual(outcomes, []);
});
