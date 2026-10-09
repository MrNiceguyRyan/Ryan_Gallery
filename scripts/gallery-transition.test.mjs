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

// ── Every in-site arrival asks for the folder (no 307 from the host) ──
// Layout's first preparation listener rewrites /about to /about/ (the URL
// the host's redirect would have landed on) and leaves everything else.
const folderBegin = layout.indexOf('      // ── Every in-site arrival asks for the page itself ──');
const folderEnd = layout.indexOf('      // ── Filmstrip scroll restoration ──', folderBegin);
assert.ok(folderBegin > 0 && folderEnd > folderBegin, 'The folder rewrite is in Layout, before the filmstrip listener');
const folderCode = layout.slice(folderBegin, folderEnd);
function folderOf(to, origin = 'https://ryanxugallery.com') {
  const document = new EventTarget();
  const window = { location: { origin } };
  vm.runInNewContext(folderCode, { document, window, URL });
  const event = new Event('astro:before-preparation');
  event.to = new URL(to, origin);
  document.dispatchEvent(event);
  return event.to.href.replace(origin, '');
}
assert.equal(folderOf('/about'), '/about/', 'A page is asked for as its folder');
assert.equal(folderOf('/travel'), '/travel/');
assert.equal(folderOf('/notes'), '/notes/');
assert.equal(folderOf('/works/miami'), '/works/miami/', 'A story too (the Map\'s link, Keep Reading)');
assert.equal(folderOf('/notes/sample'), '/notes/sample/');
assert.equal(folderOf('/travel?place=miami#atlas-map'), '/travel/?place=miami#atlas-map', 'The query and the hash ride along');
assert.equal(folderOf('/'), '/', 'Home is already its folder');
assert.equal(folderOf('/about/'), '/about/', 'A folder is left alone');
assert.equal(folderOf('/sitemap-index.xml'), '/sitemap-index.xml', 'A file is left alone');
assert.equal(folderOf('https://example.com/about'), 'https://example.com/about', 'Another site is left alone');
// It is the first preparation listener: the ones after it read the folder.
const firstPrep = layout.indexOf("document.addEventListener('astro:before-preparation'");
assert.ok(firstPrep > folderBegin && firstPrep < folderEnd, 'The rewrite is registered before every other preparation listener');

// A print-media stylesheet that must not hold a full load's first paint
// (CjkSerifLink) applies at once on an in-site arrival: the router has
// already loaded it, and the incoming page gets it as a plain stylesheet.
{
  const document = new EventTarget();
  vm.runInNewContext(folderCode, { document, window: { location: { origin: 'https://ryanxugallery.com' } }, URL });
  const link = { media: 'print', setAttribute(name, value) { this[name] = value; } };
  let asked = '';
  const event = new Event('astro:before-swap');
  event.newDocument = { querySelectorAll: (selector) => { asked = selector; return [link]; } };
  document.dispatchEvent(event);
  assert.equal(link.media, 'all', 'The incoming page applies the waiting stylesheet at once');
  assert.match(asked, /link\[rel="stylesheet"\]\[data-swap-media\]/, 'Only the marked stylesheets');
  const cjk = fs.readFileSync(`${root}/src/components/shared/CjkSerifLink.astro`, 'utf8');
  assert.match(cjk, /<link rel="stylesheet" href=\{CJK_SERIF_CSS\} media="print" onload="this\.media='all'" data-swap-media \/>/, 'The Chinese serif waits as print media and is marked for the swap');
  assert.match(cjk, /<noscript><link rel="stylesheet" href=\{CJK_SERIF_CSS\} \/><\/noscript>/, 'Without script it is a plain stylesheet');
  // The Chinese serif from our own site (2026-10-09): Google's rules and
  // slices, a versioned folder, cached for a year — never Google's hosts.
  const notesLib = fs.readFileSync(`${root}/src/lib/notes.ts`, 'utf8');
  const cjkHref = notesLib.match(/export const CJK_SERIF_CSS = '([^']+)';/)[1];
  assert.match(cjkHref, /^\/fonts\/noto-serif-sc-v\d+\/noto-serif-sc\.css$/, 'the serif\'s rules are ours');
  const cjkCss = fs.readFileSync(`${root}/public${cjkHref}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(cjkCss, /gstatic|googleapis/, 'no Google host in its rules');
  const cjkFiles = [...new Set([...cjkCss.matchAll(/url\('\.\/([\w-]+\.woff2)'\)/g)].map((m) => m[1]))];
  assert.ok(cjkFiles.length >= 90, `${cjkFiles.length} slices`);
  for (const file of cjkFiles) {
    const bytes = fs.readFileSync(`${root}/public${cjkHref.replace(/[^/]+$/, '')}${file}`);
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', file);
  }
  assert.match(fs.readFileSync(`${root}/public/_headers`, 'utf8'), /\/fonts\/\*\n  Cache-Control: public, max-age=31536000, immutable/, 'the versioned folder cached a year');
}

// ── The webfonts: their rules and their nine files are our own — no first
// paint and no first word waiting on Google's hosts.
{
  assert.doesNotMatch(layout, /<link[^>]*fonts\.googleapis\.com/, 'No render-blocking request to fonts.googleapis.com');
  assert.doesNotMatch(layout, /fonts\.gstatic\.com/, 'The font files are served from our own site: no Google host to warm');
  const fontsAt = layout.indexOf("import '../styles/fonts.css';");
  assert.ok(fontsAt > 0 && fontsAt < layout.indexOf("import '../styles/global.css';"), 'Layout imports the font rules with its stylesheet');
  const fonts = fs.readFileSync(`${root}/src/styles/fonts.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const faces = fonts.match(/@font-face \{[^}]*\}/g) || [];
  assert.equal(faces.length, 18, 'Every face Google answers for the request: Fraunces 2 × 3 subsets, Space Grotesk 4 weights × 3');
  for (const face of faces) {
    assert.match(face, /font-display: swap;/);
    assert.match(face, /src: url\('\.\.\/assets\/fonts\/(fraunces-(roman|italic)|space-grotesk)-(vietnamese|latin-ext|latin)\.woff2'\) format\('woff2'\);/);
    assert.match(face, /font-family: '(Fraunces|Space Grotesk)';/);
    assert.match(face, /unicode-range: U\+/);
  }
  const files = new Set(faces.map((face) => face.match(/url\(([^)]+)\)/)[1]));
  assert.equal(files.size, 9, 'The same nine files');
  for (const file of files) {
    const bytes = fs.readFileSync(new URL(file.replace(/'/g, ''), `file://${root}/src/styles/`));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${file} is a woff2 file`);
  }
  const shipped = fs.readdirSync(`${root}/src/assets/fonts`).filter((f) => f.endsWith('.woff2'));
  assert.equal(shipped.length, 9, 'Exactly the nine files are kept: no stray font ships');
  assert.ok(faces.some((face) => /font-style: normal;\s*font-weight: 400 900;/.test(face) && /U\+0000-00FF/.test(face)), 'Fraunces roman, the whole weight axis, latin');
  assert.ok(faces.some((face) => /font-style: italic;\s*font-weight: 400 600;/.test(face) && /U\+0000-00FF/.test(face)), 'Fraunces italic, latin');
}

console.log('PASS: duplicate Back, retry after failure, fixed-body scroll, native Back, target-state preservation, ordinary scroll, computed offset, direct Home restore, exit interaction lock, layered Escape handling, folder-first arrivals, and the webfonts served from our own site');
