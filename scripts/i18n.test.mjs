// Run offline: node --experimental-strip-types --test scripts/i18n.test.mjs
//
// 中 / EN (src/i18n): every interface key in both languages with the same
// {placeholders}; the inline head script that puts the stored language on
// <html> before the first paint (run in jsdom, as shipped); the CSS that
// shows one language; the nav's language control as the server sends it (a
// radiogroup, both languages in the markup, English checked until hydration);
// his content in Chinese (Sanity first, our drafts only while their English
// is the page's, English last); the map's labels; the Studio's …Zh fields.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const bundle = async (entry, extra = {}) => {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    ...extra,
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
};

const { en } = await bundle('../src/i18n/en.ts');
const { zh } = await bundle('../src/i18n/zh.ts');
const D = await bundle('../src/i18n/dict.ts');
const R = await bundle('../src/i18n/runtime.ts');
const C = await bundle('../src/i18n/content.ts');
const M = await bundle('../src/lib/mapLanguage.ts');
const N = await bundle('../src/lib/narratives.tsx', { jsx: 'automatic', external: ['react', 'react/jsx-runtime'] });

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every key is in both languages, non-empty, with the same placeholders', () => {
  const keys = Object.keys(en);
  assert.ok(keys.length > 100, `only ${keys.length} keys`);
  assert.deepEqual(Object.keys(zh).sort(), [...keys].sort(), 'zh has exactly the keys en has');
  for (const key of keys) {
    assert.equal(typeof en[key], 'string', key);
    assert.equal(typeof zh[key], 'string', key);
    assert.ok(en[key].trim(), `en ${key} is empty`);
    assert.ok(zh[key].trim(), `zh ${key} is empty`);
    assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), `placeholders of ${key}`);
  }
});

test('no key is defined twice across the parts (a later part would silently win)', () => {
  const seen = new Map();
  for (const part of ['core', 'home', 'story', 'travel', 'about', 'notes']) {
    const text = source(`src/i18n/parts/${part}.ts`);
    const enBlock = text.slice(text.indexOf('export const en'), text.indexOf('export const zh'));
    for (const [, key] of enBlock.matchAll(/^\s*'([^']+)':/gm)) {
      assert.ok(!seen.has(key), `${key} is in both ${seen.get(key)} and ${part}`);
      seen.set(key, part);
    }
  }
});

test('the glossary holds: his name and the shield letters stay, the places read as agreed', () => {
  for (const key of Object.keys(zh)) {
    if (/Ryan Xu/.test(en[key])) assert.match(zh[key], /Ryan Xu/, `${key} keeps "Ryan Xu"`);
    assert.doesNotMatch(zh[key], /瑞安|徐瑞/, `${key}: no invented Chinese name`);
    // "Frame" is 帧, never 框 (a frame of film, not a picture frame).
    if (/\bframes?\b/i.test(en[key])) assert.doesNotMatch(zh[key], /框/, `${key}`);
  }
  assert.equal(zh['nav.map'], '地图');
  assert.equal(zh['nav.about'], '关于');
  assert.equal(zh['lang.zh'], '中');
  assert.equal(zh['lang.en'], 'EN');
});

test('tr fills placeholders and falls back to English, never to the key', () => {
  assert.equal(D.tr('zh', 'story.frameLabel', { nn: '03' }), '第 03 帧');
  assert.equal(D.tr('en', 'story.frameLabel', { nn: '03' }), 'Frame 03');
  assert.equal(D.tr('zh', 'story.framesSr', { n: 15 }), '15 帧');
  assert.equal(D.tr('en', 'lightbox.prevAria', { n: 2, total: 15 }), 'Previous photo, 2 of 15');
  assert.deepEqual(D.both('nav.map'), { en: 'Map', zh: '地图' });
  const attrs = D.i18nAttrs({ 'aria-label': 'nav.aria' });
  assert.equal(attrs['aria-label'], 'Primary navigation');
  assert.deepEqual(JSON.parse(attrs['data-i18n-attrs']), { 'aria-label': { en: 'Primary navigation', zh: '主导航' } });
  assert.equal(D.pick('zh', 'Miami', '迈阿密'), '迈阿密');
  assert.equal(D.pick('zh', 'Miami', '  '), 'Miami');
  assert.equal(D.pick('en', 'Miami', '迈阿密'), 'Miami');
});

/** A page as Layout sends it, with the head script inline where it ships. */
function page({ stored, storageThrows = false } = {}) {
  const html = `<!doctype html><html lang="en"><head>
    <title data-zh="关于 | Ryan">About | Ryan</title>
    <meta name="description" content="Photographic archive." data-zh="摄影档案。">
    <script>${R.langHeadScript()}</script>
  </head><body><nav data-i18n-attrs='${JSON.stringify({ 'aria-label': { en: 'Primary navigation', zh: '主导航' } })}' aria-label="Primary navigation"></nav>
  <p><span data-l="en">Map</span><span data-l="zh" lang="zh-Hans">地图</span></p></body></html>`;
  return new JSDOM(html, {
    url: 'https://ryanxugallery.com/about/',
    runScripts: 'dangerously',
    beforeParse(window) {
      if (storageThrows) {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
      } else if (stored != null) {
        window.localStorage.setItem(R.LANG_KEY, stored);
      }
    },
  });
}

test('the head script: nothing stored is English, as the server sent it', () => {
  const { window } = page();
  const root = window.document.documentElement;
  assert.equal(root.getAttribute('lang'), 'en');
  assert.equal(root.getAttribute('data-lang'), 'en');
  assert.equal(window.document.title, 'About | Ryan');
});

test('the head script: a stored 中 is on <html>, the title and the description before the body', () => {
  const { window } = page({ stored: 'zh' });
  const doc = window.document;
  assert.equal(doc.documentElement.getAttribute('lang'), 'zh-Hans');
  assert.equal(doc.documentElement.getAttribute('data-lang'), 'zh');
  assert.equal(doc.title, '关于 | Ryan');
  assert.equal(doc.querySelector('meta[name=description]').getAttribute('content'), '摄影档案。');
  // Static attributes are set once the document is parsed.
  doc.dispatchEvent(new window.Event('DOMContentLoaded'));
  assert.equal(doc.querySelector('nav').getAttribute('aria-label'), '主导航');
});

test('the head script: a toggle goes through window.__rxLang, stores, swaps back and tells the islands', () => {
  const { window } = page({ stored: 'zh' });
  const doc = window.document;
  const heard = [];
  window.addEventListener(R.LANG_EVENT, (event) => heard.push(event.detail.lang));
  assert.equal(window.__rxLang.get(), 'zh');
  window.__rxLang.set('en');
  assert.equal(window.localStorage.getItem(R.LANG_KEY), 'en');
  assert.equal(doc.documentElement.getAttribute('lang'), 'en');
  assert.equal(doc.title, 'About | Ryan', 'the English title comes back from data-en');
  assert.equal(doc.querySelector('meta[name=description]').getAttribute('content'), 'Photographic archive.');
  assert.equal(doc.querySelector('nav').getAttribute('aria-label'), 'Primary navigation');
  window.__rxLang.set('zh');
  assert.deepEqual(heard, ['en', 'zh']);
  // Anything else stored is English.
  assert.equal(R.langOfValue('fr'), 'en');
});

test('the head script: storage denied is English, and a toggle still switches the page', () => {
  const { window } = page({ storageThrows: true });
  assert.equal(window.document.documentElement.getAttribute('data-lang'), 'en');
  window.__rxLang.set('zh');
  assert.equal(window.document.documentElement.getAttribute('data-lang'), 'zh');
});

test('the head script: an in-site arrival is marked on the incoming document before the swap', () => {
  const { window } = page({ stored: 'zh' });
  const incoming = new window.DOMParser().parseFromString(
    '<!doctype html><html lang="en"><head><title data-zh="地图 | Ryan">Map | Ryan</title></head><body></body></html>',
    'text/html',
  );
  const event = new window.Event('astro:before-swap');
  event.newDocument = incoming;
  window.document.dispatchEvent(event);
  assert.equal(incoming.documentElement.getAttribute('data-lang'), 'zh');
  assert.equal(incoming.documentElement.getAttribute('lang'), 'zh-Hans');
  assert.equal(incoming.title, '地图 | Ryan');
});

test('the head script: another tab\'s toggle arrives silently', () => {
  const { window } = page({ stored: 'en' });
  const heard = [];
  window.addEventListener(R.LANG_EVENT, (event) => heard.push(event.detail));
  const event = new window.Event('storage');
  event.key = R.LANG_KEY;
  event.newValue = 'zh';
  window.dispatchEvent(event);
  assert.equal(window.document.documentElement.getAttribute('data-lang'), 'zh');
  // (The detail was made in the page's realm: compare its fields.)
  assert.deepEqual(heard.map((detail) => [detail.lang, detail.quiet]), [['zh', true]]);
});

test('Layout ships the script after the title and the description, before the body', () => {
  const layout = source('src/layouts/Layout.astro');
  const title = layout.indexOf('<title data-zh=');
  const description = layout.indexOf('<meta name="description"');
  const script = layout.indexOf('set:html={langHeadScript()}');
  const body = layout.indexOf('<body');
  assert.ok(title > 0 && description > title && script > description && body > script);
});

test('CSS shows one language, and Chinese is never italic or tracked negative', () => {
  const css = source('src/styles/global.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /html\[data-lang='zh'\] \[data-l='en'\],\s*html:not\(\[data-lang='zh'\]\) \[data-l='zh'\] \{\s*display: none !important;/);
  const zhRule = css.match(/\n\[data-l='zh'\] \{([^}]*)\}/)[1];
  assert.match(zhRule, /font-style: normal/);
  assert.match(zhRule, /font-size: max\(1em, var\(--zh-min/);
  assert.match(zhRule, /letter-spacing: var\(--zh-track/);
  // The Chinese faces are the reader's own: no CJK web font is loaded.
  assert.doesNotMatch(source('src/layouts/Layout.astro'), /Noto\+Sans\+SC|Noto\+Serif\+SC/);
  // The language control's state is drawn from <html>, so it is right before
  // hydration.
  assert.match(css, /html\[data-lang='zh'\] \.site-lang__opt\[lang='zh-Hans'\]/);
});

test('the nav set as the server sends it: both languages, a radiogroup, English checked', async () => {
  const require = createRequire(import.meta.url);
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/components/Nav.tsx', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom'],
    define: { __NOTES_LIVE__: 'true' },
  });
  const compiled = new Module(fileURLToPath(new URL('./nav-under-test.cjs', import.meta.url)));
  compiled.filename = fileURLToPath(new URL('./nav-under-test.cjs', import.meta.url));
  compiled.paths = Module._nodeModulePaths(fileURLToPath(new URL('..', import.meta.url)));
  compiled._compile(result.outputFiles[0].text, compiled.filename);
  const React = require('react');
  const { renderToString } = require('react-dom/server');
  const { default: Nav, currentOf } = compiled.exports;
  const html = renderToString(React.createElement(Nav, { currentPath: '/about/' }));
  assert.match(html, /<span data-l="en">Map<\/span><span data-l="zh" lang="zh-Hans">地图<\/span>/);
  assert.match(html, /<span data-l="en">Notes<\/span><span data-l="zh" lang="zh-Hans">笔记<\/span>/);
  assert.match(html, /role="radiogroup" aria-label="Language"/);
  assert.match(html, /role="radio"[^>]*aria-checked="false"[^>]*lang="zh-Hans"/);
  assert.match(html, /role="radio"[^>]*aria-checked="true"[^>]*lang="en"/);
  assert.match(html, /aria-current="page"[^>]*>(?:<!-- -->)?<span data-l="en">About/);
  assert.doesNotMatch(html, /href="\/"[^>]*class="site-navset__link/, 'the wordmark is Home; the set has no HOME');
  assert.equal(currentOf('/notes/sample/', '/notes'), 'true');
  assert.equal(currentOf('/travel/', '/travel'), 'page');
  assert.equal(currentOf('/', '/travel'), undefined);
});

test('the drafts translate the English the code prints today (so they are used)', () => {
  for (const [slug, paragraphs] of Object.entries(N.EDITORIAL_FALLBACKS)) {
    if (slug === 'arizona') continue; // no such chapter
    const resolved = C.withZh({ _id: 'x', slug, introduction: null });
    assert.ok(resolved.introductionZh?.length === paragraphs.length, `${slug}: a Chinese paragraph per English one`);
  }
  for (const slug of Object.keys(N.HOMEPAGE_CAPTIONS)) {
    if (slug === 'arizona') continue;
    assert.ok(C.withZh({ _id: 'x', slug }).dekZh, `${slug}: the dek has its Chinese`);
  }
  for (const slug of Object.keys(N.PULL_QUOTES)) {
    const resolved = C.withZh({ _id: 'x', slug, introduction: null });
    assert.ok(resolved.pullQuoteZh, `${slug}: the pull quote has its Chinese`);
    // A pull quote is a verbatim line of its own story.
    assert.ok(resolved.introductionZh.join('').includes(resolved.pullQuoteZh), `${slug}: 金句 is in the Chinese story`);
  }
});

test('his content: Sanity first, our draft only while its English is the page\'s, else English', () => {
  const miami = { _id: 'PzEfpaLkt8k6GZZDOijJrW', slug: 'miami', name: 'Miami', region: 'Florida', location: 'Miami', description: 'A visual journey through Miami.', introduction: null };
  const drafted = C.withZh(miami);
  assert.equal(drafted.nameZh, '迈阿密');
  assert.equal(drafted.regionZh, '佛罗里达州');
  assert.equal(drafted.descriptionZh, '一段穿行迈阿密的影像之旅。');
  assert.equal(drafted.dek, N.HOMEPAGE_CAPTIONS.miami);
  // His own Chinese wins.
  assert.equal(C.withZh({ ...miami, nameZh: '迈阿密海滩' }).nameZh, '迈阿密海滩');
  // He rewrote the English and has not translated it yet: no stale draft.
  assert.equal(C.withZh({ ...miami, description: 'Neon, and the sea.' }).descriptionZh, undefined);
  const rewritten = C.withZh({ ...miami, introduction: [{ _type: 'block', _key: 'a', children: [{ _type: 'span', _key: 'b', text: 'A new story.' }] }] });
  assert.equal(rewritten.introductionZh, undefined);
  // His Chinese story in Portable Text arrives as plain paragraphs.
  const own = C.withZh({ ...miami, introductionZh: [{ _type: 'block', _key: 'a', children: [{ _type: 'span', _key: 'b', text: '第一段。' }] }] });
  assert.deepEqual(own.introductionZh, ['第一段。']);
  // A photograph's place.
  const photo = C.withPhotoZh({ location: { lat: 40.75, lng: -73.98, city: 'Midtown' } });
  assert.equal(photo.location.cityZh, '中城');
  assert.equal(C.withPhotoZh({ location: { lat: 0, lng: 0, city: 'Nowhere' } }).location.cityZh, undefined);
  // English fields are left exactly as fetched.
  assert.equal(drafted.name, 'Miami');
  assert.equal(drafted.description, miami.description);
});

test('the About prose: his bio in paragraphs in both languages; a rewrite of his drops the stale draft', () => {
  const none = C.siteText(null);
  assert.equal(none.bio.en.length, 2);
  assert.equal(none.bio.zh.length, 2);
  assert.equal(none.lede.zh, '城市与风景，一次一帧。');
  const his = C.siteText({ bio: 'One paragraph.\n\nTwo paragraphs.' });
  assert.deepEqual(his.bio.en, ['One paragraph.', 'Two paragraphs.']);
  assert.equal(his.bio.zh, undefined);
  assert.deepEqual(C.siteText({ bio: 'One.', bioZh: '一。' }).bio.zh, ['一。']);
});

test('map labels: every name read goes Chinese first; a road number does not; English comes back', () => {
  const field = ['coalesce', ['get', 'name_en'], ['get', 'name']];
  assert.deepEqual(M.localiseTextField(field), [
    'coalesce',
    ['coalesce', ['get', 'name_zh-Hans'], ['get', 'name_zh'], ['get', 'name_en']],
    ['coalesce', ['get', 'name_zh-Hans'], ['get', 'name_zh'], ['get', 'name']],
  ]);
  assert.equal(M.readsName(['get', 'ref']), false);
  const layers = [
    { id: 'settlement-major-label', type: 'symbol', layout: { 'text-field': field } },
    { id: 'road-number-shield', type: 'symbol', layout: { 'text-field': ['get', 'ref'] } },
    { id: 'water', type: 'fill', layout: {} },
  ];
  const set = new Map();
  const map = {
    getStyle: () => ({ layers }),
    getLayoutProperty: (id) => set.get(id) ?? layers.find((layer) => layer.id === id).layout['text-field'],
    setLayoutProperty: (id, name, value) => set.set(id, value),
  };
  M.applyMapLanguage(map, 'zh');
  assert.deepEqual(set.get('settlement-major-label'), M.localiseTextField(field));
  assert.equal(set.has('road-number-shield'), false);
  M.applyMapLanguage(map, 'en');
  assert.deepEqual(set.get('settlement-major-label'), field);
});

test('the Studio carries each Chinese field right under its English twin', async () => {
  const stub = {
    name: 'sanity-stub',
    setup(builder) {
      builder.onResolve({ filter: /^sanity$/ }, () => ({ path: 'sanity', namespace: 'stub' }));
      builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: 'export const defineField = (x) => x; export const defineType = (x) => x; export const defineArrayMember = (x) => x;',
        loader: 'js',
      }));
    },
  };
  const schema = async (file) => (await bundle(`../ryan/schemaTypes/${file}`, { plugins: [stub] })).default;
  const names = (type) => type.fields.map((field) => field.name);
  const after = (list, twin, zh) => assert.equal(list[list.indexOf(twin) + 1], zh, `${zh} follows ${twin}`);
  const collection = names(await schema('collection.ts'));
  for (const twin of ['name', 'subtitle', 'location', 'region', 'description', 'introduction', 'dek', 'pullQuote']) after(collection, twin, `${twin}Zh`);
  const settings = names(await schema('siteSettings.ts'));
  for (const twin of ['bio', 'lede', 'tagline', 'notesDek']) after(settings, twin, `${twin}Zh`);
  const note = await schema('note.ts');
  for (const twin of ['title', 'dek', 'body']) after(names(note), twin, `${twin}Zh`);
  const body = note.fields.find((field) => field.name === 'body');
  const bodyZh = note.fields.find((field) => field.name === 'bodyZh');
  assert.equal(bodyZh.of, body.of, 'the Chinese body has the same members');
  const photo = await schema('photo.ts');
  const location = photo.fields.find((field) => field.name === 'location');
  after(location.fields.map((field) => field.name), 'city', 'cityZh');
});

test('every page asks Sanity for the Chinese twins it prints', () => {
  for (const page of ['src/pages/index.astro', 'src/pages/works/[slug].astro']) {
    const text = source(page);
    assert.match(text, /COLLECTION_ZH_FIELDS/, page);
    assert.match(text, /withZh\(/, page);
  }
});

test('the homepage in 中: hooks found on the shown copy, map labels bound, no English left in its islands', () => {
  const film = source('src/components/home/OpeningFilm.tsx');
  // The landing's targets are printed in both languages: a bare first match
  // is the hidden English in 中, and its flight would silently drop.
  assert.match(film, /const dst = shownMatch\(document, LANDING_TARGETS\[word\]\.to\);/);
  assert.match(film, /const coverName = shownMatch\(document, LANDING_TARGETS\.ryan\.to\);/);
  assert.doesNotMatch(film, /document\.querySelector<HTMLElement>\(LANDING_TARGETS/);
  // The homepage map's own labels follow the toggle; unbound with the atlas.
  const atlas = source('src/components/home/RouteAtlas.tsx');
  assert.match(atlas, /unbindMapLanguageRef\.current = bindMapLanguage\(map\);/);
  assert.match(atlas, /unbindMapLanguageRef\.current\?\.\(\);/);
  // Route shields and the sign stay English: the English name/region stay the keys.
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  assert.match(chapter, /<FlapWord text=\{collection\.name\.trim\(\)\} role="name" \/>/);
  assert.match(chapter, /code=\{stateCode\(collection\.region\)\}/);
  assert.match(chapter, /<span className="archive-ticket-sign__label">Stop<\/span>/);
  // No English literal left where a reader or a screen reader meets it.
  const files = {
    'src/components/home/ExplorerControls.tsx': [/aria-label="[A-Z]/, /`(Previous|Next) place/, />Places</, /'Contact sheet'/],
    'src/components/home/HomePage.tsx': [/Skip to archive/, /aria-label="(Primary|Ryan Xu —)/, /Choose a shield/, />Visual Archive</],
    'src/components/home/ArchiveChapter.tsx': [/>\s*View story/, /Open story\s*</, /'Next stop'/, />Region</, /frames<\/p>/],
    'src/components/home/ArchiveClosing.tsx': [/Back to the start ↑/, /Archive complete/, /aria-label=\{`Open \$/],
    'src/components/home/AtlasSign.tsx': [/} KM`/, /aria-label="Chapters"/, /aria-label=\{`Go to chapter/],
    'src/components/home/RouteAtlas.tsx': [/Route signal delayed/, /aria-label="The archive's map"/, /'Map of the archive\./],
    'src/components/home/EntranceIntro.tsx': [/aria-label="Opening"/, /'The stub is torn off/],
    'src/components/home/BoardingPass.tsx': [/aria-label="(QR code|Tear the stub)/, /aria-roledescription="boarding pass"/],
  };
  for (const [file, patterns] of Object.entries(files)) {
    const text = source(file);
    for (const pattern of patterns) assert.doesNotMatch(text, pattern, `${file}: ${pattern}`);
  }
});

test('the viewfinder in 中: a Han character counts as two in the readouts\' width estimate; KM and the hemispheres per language', async () => {
  const { tr } = await bundle('../src/i18n/dict.ts');
  assert.equal(tr('zh', 'coord.n', { v: '25.7617' }), '北纬 25.7617°');
  assert.equal(tr('en', 'coord.w', { v: '80.1918' }), '80.1918° W');
  assert.equal(tr('zh', 'sign.km', { km: '380' }), '380 公里');
  const sign = source('src/components/home/AtlasSign.tsx');
  assert.match(sign, /n \+= HAN_CHAR\.test\(ch\) \? 2 : 1;/);
  assert.match(sign, /const key = `leg:\$\{from\.id\}>\$\{to\.id\}:\$\{lang\}`;/);
});
