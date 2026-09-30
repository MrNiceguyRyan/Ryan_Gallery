// Run offline: node --experimental-strip-types --test scripts/notes.test.mjs
//
// The NOTES section's pure parts (src/lib/notes.ts): the Portable Text
// renderer never prints markup it was not asked to (every span escaped, only
// strong / em / safe links), the body plan (lede, crossheads, numbered
// figures, pull quotes, the end mark), Chinese detection, the image URLs (the
// editor's crop kept, the file's own ratio printed), the column's numbering
// and turn, and the nav's order MAP · NOTES · ABOUT.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  endmarkMissing,
  escapeHtml,
  featuredNote,
  imageSize,
  imageUrl,
  langOf,
  normalizeNotes,
  noteDescription,
  noteNeighbours,
  noteNumbers,
  planBody,
  planList,
  pullQuoteText,
  readingMinutes,
  renderInline,
  safeHref,
  shareCardUrl,
} from '../src/lib/notes.ts';

const span = (text, marks = []) => ({ _type: 'span', _key: Math.random().toString(36).slice(2), text, marks });
const block = (children, style = 'normal', markDefs = []) => ({ _type: 'block', _key: Math.random().toString(36).slice(2), style, children, markDefs });

test('every span is escaped; only strong, em, <br> and safe links are written', () => {
  const html = renderInline(block([
    span('<script>alert(1)</script> & "quotes"'),
    span('bold', ['strong']),
    span(' both', ['strong', 'em']),
    span('\nnext line'),
    span('odd', ['underline', 'code']),
  ]));
  assert.equal(
    html,
    '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;<strong>bold</strong><em><strong> both</strong></em><br>next lineodd',
  );
});

test('Chinese emphasis: the Han runs of an em get the dots, its Latin stays italic, still one <em>', () => {
  assert.equal(
    renderInline(block([span('我在'), span('羚羊峡谷 Antelope Canyon，等光', ['em']), span('。')])),
    '我在<em><span class="note-dot">羚羊峡谷</span> Antelope Canyon，<span class="note-dot">等光</span></em>。',
  );
  // Latin-only emphasis is untouched; strong on Chinese is untouched.
  assert.equal(renderInline(block([span('light', ['em']), span('光', ['strong'])])), '<em>light</em><strong>光</strong>');
});

test('links: adjacent spans share one <a>; external links open apart; unsafe hrefs print as text', () => {
  const defs = [
    { _key: 'a', _type: 'link', href: 'https://example.com/x?y=1&z=2' },
    { _key: 'b', _type: 'link', href: '/works/page' },
    { _key: 'c', _type: 'link', href: 'javascript:alert(1)' },
  ];
  const html = renderInline(block([
    span('see ', ['a']),
    span('this', ['a', 'em']),
    span(' and '),
    span('Page', ['b']),
    span(' or ', []),
    span('that', ['c']),
  ], 'normal', defs));
  assert.equal(
    html,
    '<a class="note-link" href="https://example.com/x?y=1&amp;z=2" target="_blank" rel="noopener noreferrer">see <em>this</em></a>'
      + ' and <a class="note-link" href="/works/page">Page</a> or that',
  );
  assert.equal(safeHref('mailto:hi@example.com'), 'mailto:hi@example.com');
  assert.equal(safeHref('//evil.example'), null);
  assert.equal(safeHref('data:text/html,x'), null);
  assert.equal(safeHref('https://ryanxugallery.com/about'), 'https://ryanxugallery.com/about');
  assert.doesNotMatch(
    renderInline(block([span('home', ['d'])], 'normal', [{ _key: 'd', _type: 'link', href: 'https://www.ryanxugallery.com/' }])),
    /target=/,
  );
  assert.equal(escapeHtml(`<'&">`), '&lt;&#39;&amp;&quot;&gt;');
});

test('the body plan: lede, crossheads, numbered figures, pull quotes and the end mark', () => {
  const image = (w, h, extra = {}) => ({ _type: 'image', _key: `i${w}`, asset: { url: 'https://cdn.sanity.io/images/p/d/abc-100x100.jpg', width: w, height: h }, ...extra });
  const pieces = planBody([
    block([span('Opening paragraph.')]),
    block([span('   ')]),
    block([span('A crosshead')], 'h2'),
    image(6000, 4000, { caption: 'Page, Arizona' }),
    { _type: 'pullQuote', _key: 'q', text: 'That light lasts minutes.' },
    block([span('Second paragraph.')]),
    block([span('Label')], 'h3'),
    block([span('Quoted passage')], 'blockquote'),
    block([span('A list item')], 'normal'),
    { _type: 'image', _key: 'broken' },
    image(4000, 6000),
    { _type: 'mystery', _key: 'm' },
  ]);
  assert.deepEqual(pieces.map((p) => (p.kind === 'text' ? `${p.style}${p.lede ? '+lede' : ''}${p.endmark ? '+end' : ''}` : p.kind)), [
    'normal+lede', 'h2', 'figure', 'quote', 'normal', 'h3', 'blockquote', 'normal+end', 'figure',
  ]);
  assert.equal(endmarkMissing(pieces), false);
  const figures = pieces.filter((p) => p.kind === 'figure');
  assert.deepEqual(figures.map((f) => [f.number, f.width, f.height]), [[1, 6000, 4000], [2, 4000, 6000]]);
  assert.equal(pieces.find((p) => p.kind === 'quote').text, 'That light lasts minutes');
  // A body that opens on a picture has no lede.
  assert.equal(planBody([image(10, 5), block([span('x')])])[1].lede, false);
  // The end mark closes the text: never on a paragraph a pull quote or a
  // crosshead follows (the build is told instead); a quoted passage can close.
  const endsOnQuote = planBody([block([span('One.')]), { _type: 'pullQuote', _key: 'q2', text: 'Two.' }]);
  assert.equal(endsOnQuote.some((p) => p.endmark), false);
  assert.equal(endmarkMissing(endsOnQuote), true);
  const endsOnHead = planBody([block([span('One.')]), block([span('Two')], 'h2'), image(3, 2)]);
  assert.equal(endmarkMissing(endsOnHead), true);
  const endsOnPassage = planBody([block([span('One.')]), block([span('Quoted.')], 'blockquote'), image(3, 2)]);
  assert.deepEqual(endsOnPassage.map((p) => p.endmark ?? null), [false, true, null]);
  assert.equal(endmarkMissing([]), false);
});

test('Chinese is detected by weight, not by a single character', () => {
  assert.equal(langOf('我在羚羊峡谷等了两个小时，光只停留了几分钟。'), 'zh-Hans');
  assert.equal(langOf('我在 Antelope Canyon 等了两个小时'), 'zh-Hans');
  assert.equal(langOf('The word 光 means light, and it lasts minutes.'), undefined);
  assert.equal(langOf('Cities and landscapes'), undefined);
  assert.equal(langOf(''), undefined);
});

test('pull quotes keep their words and drop the closing full stop, in either language', () => {
  assert.equal(pullQuoteText('That light lasts minutes.'), 'That light lasts minutes');
  assert.equal(pullQuoteText('“光只停留了几分钟。”'), '光只停留了几分钟');
  assert.equal(pullQuoteText('Is it?'), 'Is it?');
});

test('images: the editor crop is kept and printed at its own ratio', () => {
  const plain = { asset: { url: 'https://cdn.sanity.io/images/p/d/abc-6000x4000.jpg', width: 6000, height: 4000 } };
  assert.deepEqual(imageSize(plain), { width: 6000, height: 4000 });
  assert.equal(imageUrl(plain, 1600), 'https://cdn.sanity.io/images/p/d/abc-6000x4000.jpg?w=1600&q=82&auto=format');
  const cropped = { ...plain, crop: { top: 0.1, bottom: 0.1, left: 0.25, right: 0.25 } };
  assert.deepEqual(imageSize(cropped), { width: 3000, height: 3200 });
  assert.equal(imageUrl(cropped, 800), 'https://cdn.sanity.io/images/p/d/abc-6000x4000.jpg?rect=1500,400,3000,3200&w=800&q=82&auto=format');
  // The share card is 1200×630, cut inside the crop around the hotspot.
  const card = shareCardUrl({ ...plain, hotspot: { x: 0.9, y: 0.5 } });
  const [x, y, w, h] = card.match(/rect=([\d,]+)/)[1].split(',').map(Number);
  assert.ok(Math.abs(w / h - 1200 / 630) < 0.01);
  assert.equal(x + w, 6000, 'the cut is pushed against the right edge, where the hotspot is');
  assert.ok(y >= 0 && y + h <= 4000);
});

test('the column: numbered oldest first, listed newest first, with its turn', () => {
  const notes = normalizeNotes([
    { _id: 'c', title: 'Third', slug: 'third', publishedAt: '2026-10-03T12:00:00Z', places: [null, { slug: 'page', name: 'Page' }], body: [] },
    { _id: 'b', title: 'Second', slug: 'second', publishedAt: '2026-10-02T12:00:00Z', featured: true },
    { _id: 'x', title: '', slug: 'untitled', publishedAt: '2026-10-02T12:00:00Z' },
    { _id: 'a', title: 'First', slug: 'first', publishedAt: '2026-10-01T12:00:00Z' },
    null,
  ]);
  assert.deepEqual(notes.map((n) => n.slug), ['third', 'second', 'first']);
  assert.deepEqual(notes[0].places, [{ slug: 'page', name: 'Page' }]);
  const numbers = noteNumbers(notes);
  assert.deepEqual([...numbers.entries()], [['first', 1], ['second', 2], ['third', 3]]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(noteNeighbours(notes, 'second')).map(([k, v]) => [k, v?.slug ?? null])),
    { previous: 'first', next: 'third' },
  );
  assert.equal(noteNeighbours(notes, 'third').next, null);
  assert.equal(featuredNote(notes).slug, 'second');
  assert.equal(featuredNote(notes.filter((n) => !n.featured)).slug, 'third');
});

test('the list: entries up to three notes; from four, a lead and contents rows with year lines', () => {
  const at = (slug, iso) => ({ _id: slug, title: slug, slug, publishedAt: iso, places: [], body: [], featured: false });
  const three = [at('c', '2027-01-10T12:00:00Z'), at('b', '2026-12-01T12:00:00Z'), at('a', '2026-10-01T12:00:00Z')];
  assert.deepEqual(planList(three).map((r) => r.kind), ['entry', 'entry', 'entry']);
  const five = [at('e', '2027-03-01T12:00:00Z'), at('d', '2027-02-01T12:00:00Z'), ...three];
  assert.deepEqual(planList(five).map((r) => `${r.kind}${r.yearBefore ? ':' + r.yearBefore : ''}`), ['lead', 'row', 'row', 'row:2026', 'row']);
  // New York's year: 1 January 03:00 UTC is still the old year there.
  const nyYear = planList([at('n', '2027-01-01T03:00:00Z'), three[1], three[2], at('z', '2026-09-01T12:00:00Z')]);
  assert.deepEqual(nyYear.map((r) => r.yearBefore ?? null), [null, null, null, null]);
});

test('reading time and description work in both languages', () => {
  const english = { title: 't', dek: null, body: [block([span(Array.from({ length: 460 }, () => 'word').join(' '))])] };
  assert.equal(readingMinutes(english), 2);
  const chinese = { title: '标题', dek: null, body: [block([span('光'.repeat(1200))])] };
  assert.equal(readingMinutes(chinese), 3);
  assert.equal(noteDescription({ title: 't', dek: 'The dek.', body: [] }), 'The dek.');
  const long = noteDescription({ title: 't', dek: null, body: [block([span('word '.repeat(80))])] }, 60);
  assert.ok(long.endsWith('…') && long.length <= 61);
});

test('the nav reads MAP · NOTES · ABOUT, and NOTES only once a note is live', () => {
  // One set for every page (Nav.tsx NAV_LINKS, printed by NavSet); the
  // homepage prints the same set, not a copy of it.
  const nav = readFileSync(new URL('../src/components/Nav.tsx', import.meta.url), 'utf8');
  const map = nav.indexOf("key: 'nav.map'");
  const notes = nav.indexOf("key: 'nav.notes'");
  const about = nav.indexOf("key: 'nav.about'");
  assert.ok(map > 0 && notes > map && about > notes);
  assert.match(nav, /\.\.\.\(NOTES_LIVE \? \[\{ href: '\/notes', key: 'nav\.notes' as Key \}\] : \[\]\)/);
  const home = readFileSync(new URL('../src/components/home/HomePage.tsx', import.meta.url), 'utf8');
  assert.match(home, /import \{ NavSet \} from '\.\.\/Nav';/);
  assert.match(home, /<NavSet mapHref=\{atlasHref\} tabbable=\{navPillsVisible\} \/>/);
  const config = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
  assert.match(config, /__NOTES_LIVE__: JSON\.stringify\(notesLive\)/);
  const layout = readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8');
  assert.match(layout, /LATERAL = \{ '\/travel': 1, '\/notes': 1\.5, '\/about': 2 \}/);
});
