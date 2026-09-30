// Run offline: node --experimental-strip-types --test scripts/boarding-pass.test.mjs
//
// The entrance v2 (src/lib/boardingPass.ts, its QR code src/lib/qrCode.ts):
// what the pass prints (from the first chapter, the passenger the reader,
// never an invented origin), the QR code (a real one: every block a valid
// Reed–Solomon codeword, the codewords read back out of the matrix in
// placement order, the format information BCH-valid, the finders and timing
// where a reader looks), what the cover of words says (the archive's own
// facts; the film's words each in their own span), the reveal (a block
// every 180 ms, 0.6 s each, the reference's), the pass's assembly (one
// choreographed 0.8–1.2 s), the rule that only a click on the stub tears it,
// and the stub's hand-off to the explorer (the carry, the arc, the landing
// handshake — with a stand-in for the explorer's half of the contract).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as P from '../src/lib/boardingPass.ts';
import * as Q from '../src/lib/qrCode.ts';
import * as CAMERA from '../src/lib/explorerCamera.ts';
import { TEAR_FREE_MS, mirrorAffine, tearPose } from '../src/lib/ticketTear.ts';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('what it prints: the first chapter, the reader as the passenger, never an invented origin', () => {
  const miami = P.passFields({ name: 'Miami', region: 'Florida', year: '2026' });
  assert.equal(miami.passenger, 'YOU');
  assert.equal(miami.to, 'MIAMI');
  assert.equal(miami.toCode, 'FL');
  assert.equal(miami.date, '2026');
  assert.equal(miami.from, 'HERE');
  assert.equal(miami.flight, 'RX 001');
  assert.equal(miami.seat, '01A');
  assert.equal(miami.boarding, 'NOW');
  // Data-driven: the owner's stop 01 to come.
  const dc = P.passFields({ name: 'Washington', region: 'DMV', year: 2025 });
  assert.equal(dc.to, 'WASHINGTON');
  assert.equal(dc.date, '2025');
  // Nothing known: nothing made up.
  const none = P.passFields(null);
  assert.equal(none.date, '—');
  assert.equal(none.toCode, '');
  assert.equal(none.passenger, 'YOU');
  assert.equal(P.passFields({ name: 'X', year: 'soon' }).date, '—');
  // A long name steps down to keep to its field.
  assert.equal(P.destinationScale('MIAMI'), 1);
  assert.ok(P.destinationScale('WASHINGTON') < 1 && P.destinationScale('WASHINGTON') >= 0.52);
  assert.ok(P.destinationScale('BRYCE CANYON') < P.destinationScale('WASHINGTON'));
  // The barcode: the same every time, bars and gaps of 1–3 units.
  assert.deepEqual(P.barcodeBars(3), P.barcodeBars(3));
  assert.ok(P.barcodeBars(3).every((w) => w >= 1 && w <= 3));
});

// ── The QR code ──
const EXPECTED_ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

function syndromesZero(block) {
  // A Reed–Solomon codeword has zero syndromes at α^0 … α^(n−1).
  return (ec) => {
    for (let i = 0; i < ec; i += 1) {
      let s = 0;
      for (const byte of block) s = Q.gfMul(s, Q.gfPow(i)) ^ byte;
      if (s !== 0) return false;
    }
    return true;
  };
}

function deinterleave(codewords, plan) {
  const blocks = plan.blocks.map(() => []);
  let at = 0;
  const longest = Math.max(...plan.blocks);
  for (let i = 0; i < longest; i += 1) plan.blocks.forEach((len, b) => i < len && blocks[b].push(codewords[at++]));
  for (let i = 0; i < plan.ec; i += 1) plan.blocks.forEach((_, b) => blocks[b].push(codewords[at++]));
  return blocks;
}

test('the QR code: the archive\'s address, a real code — RS blocks, placement, format, patterns', () => {
  for (const [text, ecl] of [
    [P.PASS_URL, 'M'],
    [P.PASS_URL, 'Q'],
    [P.PASS_URL, 'H'],
    ['https://ryanxugallery.com/works/miami', 'L'],
    ['HELLO', 'M'],
  ]) {
    const code = Q.encodeQr(text, ecl);
    assert.equal(code.size, 17 + 4 * code.version);
    assert.equal(code.modules.length, code.size);
    code.modules.forEach((row) => assert.equal(row.length, code.size));
    const plan = Q.qrPlan(code.version, ecl);
    assert.equal(code.codewords.length, plan.total);
    // Every block is a valid Reed–Solomon codeword.
    deinterleave(code.codewords, plan).forEach((block) => assert.ok(syndromesZero(block)(plan.ec), `${text} ${ecl}`));
    // The data codewords spell byte mode, the length, the text, then pads.
    const data = deinterleave(code.codewords, plan).flatMap((block, b) => block.slice(0, plan.blocks[b]));
    const bits = data.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1));
    const read = (from, n) => bits.slice(from, from + n).reduce((v, bit) => (v << 1) | bit, 0);
    assert.equal(read(0, 4), 0b0100, 'byte mode');
    const length = read(4, 8);
    const bytes = Array.from({ length }, (_, i) => read(12 + i * 8, 8));
    assert.equal(new TextDecoder().decode(new Uint8Array(bytes)), text);
    // Read back out of the matrix in placement order, unmasked.
    const grid = { size: code.size, fn: fnMask(code) };
    const positions = Q.dataPositions(grid);
    const readBits = positions.slice(0, code.codewords.length * 8).map(([r, c]) => (code.modules[r][c] !== Q.maskAt(code.mask, r, c) ? 1 : 0));
    const readBytes = [];
    for (let i = 0; i < readBits.length; i += 8) readBytes.push(readBits.slice(i, i + 8).reduce((v, bit) => (v << 1) | bit, 0));
    assert.deepEqual(readBytes, code.codewords);
    // Both copies of the format information, BCH-valid, saying this level
    // and this mask.
    Q.formatPositions(code.size).forEach(([a, b], i) => {
      assert.equal(code.modules[a[0]][a[1]], code.modules[b[0]][b[1]], `format bit ${i}`);
    });
    let format = 0;
    Q.formatPositions(code.size).forEach(([a], i) => (format |= (code.modules[a[0]][a[1]] ? 1 : 0) << i));
    assert.equal(format, Q.formatBits(ecl, code.mask));
    const raw = format ^ 0x5412;
    let rem = raw;
    for (let i = 14; i >= 10; i -= 1) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
    assert.equal(rem, 0, 'BCH(15,5)');
    assert.equal(raw >>> 13, EXPECTED_ECL_BITS[ecl]);
    assert.equal((raw >>> 10) & 7, code.mask);
    // The finders (a 7×7 ring round a 3×3 core), their light separators,
    // the timing lines, the dark module.
    for (const [r0, c0] of [[0, 0], [0, code.size - 7], [code.size - 7, 0]]) {
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 7; c += 1) {
          const d = Math.max(Math.abs(r - 3), Math.abs(c - 3));
          assert.equal(code.modules[r0 + r][c0 + c], d !== 2, `finder ${r0},${c0}`);
        }
      }
    }
    for (let i = 8; i < code.size - 8; i += 1) {
      assert.equal(code.modules[6][i], i % 2 === 0);
      assert.equal(code.modules[i][6], i % 2 === 0);
    }
    assert.equal(code.modules[code.size - 8][8], true);
  }
  // The pass's own: version 2 at level M (25 modules), the same every time.
  const pass = Q.encodeQr(P.PASS_URL, 'M');
  assert.equal(pass.version, 2);
  assert.deepEqual(Q.encodeQr(P.PASS_URL, 'M').modules, pass.modules);
  // Drawn as one path, a unit per module, inside its quiet zone.
  const path = Q.qrPath(pass, 4);
  assert.ok(path.startsWith('M4 4h7v1h-7z'));
  let dark = 0;
  pass.modules.forEach((row) => row.forEach((v) => v && (dark += 1)));
  const drawn = [...path.matchAll(/h(\d+)v1/g)].reduce((sum, m) => sum + Number(m[1]), 0);
  assert.equal(drawn, dark);
  assert.throws(() => Q.encodeQr('x'.repeat(200), 'H'));
});

function fnMask(code) {
  // Rebuild which modules are function modules: everything the encoder
  // reserved (finders + separators, timing, alignment, format, dark).
  const n = code.size;
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const mark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && (fn[r][c] = true);
  for (let i = 0; i < n; i += 1) {
    mark(6, i);
    mark(i, 6);
  }
  for (const [r0, c0] of [[3, 3], [3, n - 4], [n - 4, 3]]) for (let dr = -4; dr <= 4; dr += 1) for (let dc = -4; dc <= 4; dc += 1) mark(r0 + dr, c0 + dc);
  if (code.version >= 2) for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) mark(n - 7 + dr, n - 7 + dc);
  Q.formatPositions(n).forEach(([a, b]) => {
    mark(a[0], a[1]);
    mark(b[0], b[1]);
  });
  mark(n - 8, 8);
  return fn;
}

// ── The hand ──

// ── The cover of words ──
const FACTS = { years: '2025–2026', places: 6, frames: 58, regions: ['Florida', 'Arizona', 'Utah', 'New York'] };
const MIAMI = { name: 'Miami', region: 'Florida', year: 2026, slug: 'miami' };
const textOf = (block) => P.coverText(block.pieces);

test('the cover says what the archive holds, from its own data, in the film\'s words', () => {
  const blocks = P.coverBlocks(FACTS, MIAMI);
  assert.deepEqual(blocks.map((b) => b.kind), ['kicker', 'xl', 'xl-quiet', 'm', 'm', 'm']);
  const texts = blocks.map(textOf);
  assert.equal(texts[1], 'Ryan Xu, a camera, and the places I travel.');
  assert.equal(texts[2], '6 places. 58 frames.');
  assert.equal(texts[3], 'Florida, Arizona, Utah and New York, 2025–2026.');
  assert.equal(texts[5], 'First stop, Miami. The passenger is you.');
  // Every word the film lands, once, in its own span, in reading order.
  const lands = blocks.flatMap((b) => P.coverWords(b.pieces).flat()).filter((part) => part.land).map((part) => part.land);
  assert.deepEqual(lands, ['ryan', 'xu', 'camera', 'travel', 'archive', 'thought', 'you']);
  assert.deepEqual([...lands].sort(), [...P.LAND_WORDS].sort());
  // The first stop is the pass's to take (it flies onto TO).
  const passParts = blocks.flatMap((b) => P.coverWords(b.pieces).flat()).filter((part) => part.pass);
  assert.deepEqual(passParts, [{ text: 'Miami', pass: 'to' }]);
  // Nothing claimed that the data does not say: every number on the cover
  // is one of the facts (the kicker's years included).
  const numbers = texts.join(' ').match(/\d+/g) ?? [];
  const known = new Set([String(FACTS.places), String(FACTS.frames), '2025', '2026']);
  numbers.forEach((n) => assert.ok(known.has(n), `invented number ${n}`));
  assert.doesNotMatch(texts.join(' '), /one camera/i);
  // Singulars, and nothing where the data is silent.
  const one = P.coverBlocks({ years: '2026', places: 1, frames: 1, regions: ['Utah'] }, null).map(textOf);
  assert.ok(one.includes('1 place. 1 frame.'));
  assert.ok(one.includes('Utah, 2026.'));
  assert.equal(one[one.length - 1], 'The passenger is you.');
  const bare = P.coverBlocks({ years: '', places: 0, frames: 0, regions: [] }, null);
  assert.deepEqual(bare.map((b) => b.kind), ['kicker', 'xl', 'm', 'm']);
  // Regions: distinct, in route order.
  assert.deepEqual(P.distinctRegions(['Florida', 'Florida', ' Arizona ', null, 'Utah', 'utah', 'New York']), ['Florida', 'Arizona', 'Utah', 'New York']);
  assert.equal(P.listJoin(['A']), 'A');
  assert.equal(P.listJoin(['A', 'B']), 'A and B');
});

test('the cover\'s words: punctuation stays with its word, a landed word never rises', () => {
  const words = P.coverWords([{ land: 'ryan', text: 'Ryan' }, ' ', { land: 'xu', text: 'Xu' }, ', a ', { land: 'camera' }, ', and — the ', { land: 'travel' }, '.']);
  assert.deepEqual(words.map((w) => w.map((p) => p.text).join('')), ['Ryan', 'Xu,', 'a', 'camera,', 'and', '—', 'the', 'travel.']);
  // "Xu," is one word: the landed Xu and its comma.
  assert.deepEqual(words[1], [{ text: 'Xu', land: 'xu' }, { text: ',' }]);
  // A wide screen's break is a word of its own, and reads as a space.
  const broken = P.coverWords(['a,', { br: true }, 'b']);
  assert.deepEqual(broken, [[{ text: 'a,' }], [{ text: '', br: true }], [{ text: 'b' }]]);
  assert.equal(P.coverText(['a,', { br: true }, 'b']), 'a, b');
  // The component renders a landed word's word as a never-rising group (its
  // punctuation fades in with the block), every other word as a rising one;
  // the film's contract is the span's own attribute, inside .entrance-intro.
  const intro = source('src/components/home/EntranceIntro.tsx');
  assert.match(intro, /className="entrance-intro"/);
  assert.match(intro, /data-open-land=\{part\.land\}/);
  assert.match(intro, /className="ec-f"/);
  assert.match(intro, /className="ec-w"/);
  assert.match(intro, /data-pass-from=\{part\.pass\}/);
  const css = source('src/styles/entrance.css');
  // The words rise; so does a word of ours the film did not carry home; a
  // word it carried home ([data-flown], marked as the film lands) never
  // moves, nor does the group round it.
  assert.match(css, /\.entrance\[data-compose='play'\] :is\(\.ec-w, \.ec-found:not\(\[data-flown\]\)\) \{\s*animation: ec-rise/);
  assert.doesNotMatch(css, /\.ec-f[\s,{:][^{]*\{[^}]*animation/);
  assert.doesNotMatch(css.replace(/\.ec-found:not\(\[data-flown\]\)/g, ''), /\.ec-found[^{]*\{[^}]*animation: ec-/);
  // (Home only where the film lands it: its word on the slate, and its
  // place on the first screen — the film's own rule, OpeningFilm landA.)
  assert.match(intro, /if \(!word \|\| !document\.querySelector\(`\[data-fly="\$\{word\}"\]`\) \|\| !el\.getClientRects\(\)\.length\) return;/);
  assert.match(intro, /if \(r\.bottom < 0 \|\| r\.top > vh\) return;\s*el\.setAttribute\('data-flown', ''\);/);
});

// ── The reveal ──
test('the reveal is the reference\'s: a block every 180 ms, each up 20 px and in over 0.6 s on ENTER', () => {
  assert.deepEqual([...P.ENTER_EASE], [0.22, 0.61, 0.36, 1]);
  assert.deepEqual({ ...P.COVER_REVEAL }, { stepMs: 180, durMs: 600, rise: 20 });
  assert.deepEqual([0, 1, 2, 5].map(P.revealAt), [0, 180, 360, 900]);
  assert.equal(P.revealEnd(6), 5 * 180 + 600);
  assert.equal(P.revealEnd(0), 0);
  // The stylesheet runs it from the module's numbers (set inline), on the
  // entrance's own copy of the curve.
  const css = source('src/styles/entrance.css');
  assert.match(css, /--entrance-ease: var\(--ease-turn\);/);
  assert.match(css, /calc\(var\(--b, 0\) \* var\(--ec-step, 180ms\)\)/);
  assert.match(css, /@keyframes ec-rise \{\s*from \{ opacity: 0; transform: translateY\(var\(--ec-rise, 20px\)\); \}/);
  const intro = source('src/components/home/EntranceIntro.tsx');
  assert.match(intro, /\['--ec-step' as string\]: `\$\{COVER_REVEAL\.stepMs\}ms`/);
  assert.match(intro, /\['--ec-dur' as string\]: `\$\{COVER_REVEAL\.durMs\}ms`/);
  // Reduced motion: values, not structure — the words are simply there.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.entrance\[data-compose='play'\] :is\(\.ec-w, \.ec-p, \.ec-found\) \{ animation: none; \}/);
  // A second view opens composed: the cover waits only while the film is
  // over it (html[data-reel] reel / flight), and plays once it lands.
  assert.match(intro, /const waiting = \(\) => reel\(\) === 'reel' \|\| reel\(\) === 'flight';/);
  assert.match(intro, /setCompose\('done'\);/);
});

// ── The assembly ──
test('the pass assembles in one choreographed move of 0.8–1.2 s, as the last line settles', () => {
  const items = P.assemblySchedule();
  const at = Object.fromEntries(items.map((item) => [item.part, item]));
  const ms = P.assemblyMs();
  assert.ok(ms >= 800 && ms <= 1200, `${ms} ms`);
  // Paper first, then the stub to meet it, the print part by part, the
  // words onto their fields once the part they land on is in, the hint last.
  assert.equal(items[0].part, 'paper');
  assert.equal(at.paper.at, 0);
  assert.ok(at.stub.at > at.paper.at && at.stub.at < at.paper.ms);
  for (const part of ['band', 'route', 'grid', 'qr', 'stubprint']) assert.ok(at[part].at > 0 && at[part].at + at[part].ms <= ms, part);
  assert.ok(at['flight-to'].at + at['flight-to'].ms >= at.route.at + at.route.ms, 'TO lands on its line once it is printed');
  assert.ok(at['flight-you'].at + at['flight-you'].ms >= at.grid.at + at.grid.ms, 'PASSENGER lands on its line once it is printed');
  assert.ok(at['flight-you'].at + at['flight-you'].ms >= at.paper.at + at.paper.ms);
  assert.ok(at['flight-date'].at + at['flight-date'].ms >= at.grid.at + at.grid.ms, 'DATE lands on its line once it is printed');
  assert.equal(Math.max(...items.map((i) => i.at + i.ms)), at.hint.at + at.hint.ms);
  // Calm: every part is at least 0.36 s long; the words fly under 0.9 s,
  // 90 ms apart, and every one has landed before the print is done (review
  // of 2026-09-29: "you" came last, after the pass was whole).
  items.forEach((item) => assert.ok(item.ms >= 360, item.part));
  assert.ok(P.PASS_ASSEMBLY.flights.ms <= 900);
  const printDone = Math.max(...['band', 'route', 'grid', 'qr', 'stubprint'].map((part) => at[part].at + at[part].ms));
  const flights = ['flight-to', 'flight-you', 'flight-date'].map((part) => at[part]);
  flights.forEach((flight, index) => {
    assert.ok(flight.at + flight.ms <= printDone, `${['to', 'you', 'date'][index]} lands before the print is done`);
    if (index) assert.equal(flight.at - flights[index - 1].at, 90);
  });
  // The paper and the stub are laid down (a wipe), never faded: faded, the
  // white slab flashed onto the olive in 62 ms.
  const motion = source('src/components/home/entranceMotion.ts');
  const assembly = motion.slice(motion.indexOf('export function assemblePass'), motion.indexOf('// ── 2. The courier'));
  assert.match(assembly, /paper: wipe\(/);
  assert.match(assembly, /stub: wipe\(/);
  assert.match(assembly, /clipPath: `inset\(-\$\{WIPE\}px 100% -\$\{WIPE\}px 0px\)`/);
  assert.ok(at.paper.ms <= 500 && at.stub.at >= 200);
  // Each word lifts off its sentence as its copy flies (never printed
  // twice), and comes back once it has landed; TO bows up over the band.
  assert.match(assembly, /src\.animate\(\[\{ visibility: 'hidden' \}, \{ visibility: 'hidden' \}\], \{ duration: item\.ms, delay: item\.at, fill: 'none' \}\)/);
  assert.match(assembly, /wrap\.style\.visibility = 'hidden';/);
  assert.match(assembly, /const bow = flight\.word === 'to' \? A\.flights\.bow : 0;/);
  assert.ok(P.PASS_ASSEMBLY.flights.bow >= 40);
  // It starts as the last block is settling: after it started rising, before
  // it has finished.
  for (const blocks of [4, 5, 6]) {
    const start = P.assemblyAt(blocks);
    assert.ok(start > P.revealAt(blocks - 1) && start < P.revealEnd(blocks), `${blocks} blocks`);
  }
  // Every part it plays is on the pass, and both flights have a field to
  // land on and a word to leave from.
  const pass = source('src/components/home/BoardingPass.tsx');
  const intro = source('src/components/home/EntranceIntro.tsx');
  for (const part of ['paper', 'stub', 'band', 'route', 'grid', 'qr', 'stubprint']) assert.match(pass, new RegExp(`data-asm="${part}"`), part);
  assert.match(intro, /data-asm="hint"/);
  assert.match(pass, /data-pass-land="to"/);
  assert.match(pass, /data-pass-land="you"/);
  assert.match(pass, /data-pass-land="date"/);
  assert.match(intro, /data-pass-from=\{part\.land === 'you' \? 'you' : undefined\}/);
  // DATE flies out of the archive's years only when they hold it (a fact,
  // never a stretch).
  assert.match(intro, /data-pass-from=\{at > 0 && fields\.date !== '—' && String\(piece\)\.includes\(fields\.date\) \? 'date' : undefined\}/);
  // Both on the first screen: the pass sits beside the words (desktop) or
  // under them (narrower), never a screen below.
  const css = source('src/styles/entrance.css');
  assert.match(css, /\.entrance-intro \{[^}]*height: 100svh;/);
  assert.doesNotMatch(css, /--pass-pin|entrance-pass__frame/);
});

// ── The start button ──
test('only a click on the stub tears it: no drag, no wheel, no scroll, no timer', () => {
  const inputs = ['click', 'key', 'hover', 'press', 'drag', 'wheel', 'scroll', 'idle'];
  const table = Object.fromEntries(['stub', 'main', 'elsewhere'].map((target) => [target, inputs.map((input) => P.passResponse(target, input))]));
  assert.deepEqual(table.stub, ['tear', 'tear', 'lift', 'lift', 'none', 'none', 'none', 'none']);
  assert.deepEqual(table.main, ['peek', 'none', 'none', 'none', 'none', 'none', 'none', 'none']);
  assert.deepEqual(table.elsewhere, inputs.map(() => 'none'));
  for (const target of ['stub', 'main', 'elsewhere']) for (const input of inputs) assert.equal(P.passResponse(target, input, true), 'none');
  // The pass itself: the stub is a real button (Enter and Space are its
  // own), and nothing follows a scroll. The pass can be carried (PASS_DRAG,
  // owner 2026-09-29), but a carry never tears: the only calls to the tear
  // are the stub's click (swallowed after a drag) and the handle.
  const pass = source('src/components/home/BoardingPass.tsx');
  assert.match(pass, /<button\s+ref=\{tearRef\}\s+type="button"\s+className="bp-tear"/);
  assert.doesNotMatch(pass, /setPointerCapture|setStrain|setRise|'scroll'|touchmove/);
  assert.equal((pass.match(/(?<![.\w])tear\(\)/g) || []).length, 1, 'tear() is called from the click alone');
  assert.match(pass, /const onClick = \(\) => \{\s*if \(swallowClick\) return;\s*tear\(\);/);
  assert.match(pass, /tear: \(\) => api\.current\.tear\(\)/);
  const moves = pass.slice(pass.indexOf('function onPressMove('), pass.indexOf('function onPressUp('));
  assert.doesNotMatch(moves, /tear|onTear|onFree/);
  const intro = source('src/components/home/EntranceIntro.tsx');
  assert.doesNotMatch(intro, /\.tear\(/, 'the entrance never tears the pass itself');
  assert.doesNotMatch(intro, /setTimeout\([^)]*tear/);
  // The hover: a hair on the perforation, less than a click's peek.
  assert.ok(P.HOVER_PEEL_DEG > 0 && P.HOVER_PEEL_DEG < P.PEEK_DEG && P.HOVER_PEEL_DEG <= 3);
  assert.equal(P.peekAngle(0), 0);
  assert.ok(Math.abs(P.peekAngle(1)) < 1e-9);
  let peak = 0;
  for (let k = 0; k <= 1; k += 0.01) peak = Math.max(peak, P.peekAngle(k));
  assert.ok(close(peak, P.PEEK_DEG, 0.05));
});

// ── The stub, kept ──
const BOX = { w: 177, h: 263 };
function freeStub() {
  // As BoardingPass reads it: the tear's pose the moment the stub is free,
  // mirrored (the stub comes off the pass), about the seat's box.
  const m = mirrorAffine(tearPose(TEAR_FREE_MS, { w: BOX.w, h: BOX.h, vw: BOX.w * 4 }, { hinge: P.PASS_HINGE }).m, BOX.w);
  const seat = { left: 1447, top: 612 };
  return {
    cx: seat.left + m[0] * (BOX.w / 2) + m[2] * (BOX.h / 2) + m[4],
    cy: seat.top + m[1] * (BOX.w / 2) + m[3] * (BOX.h / 2) + m[5],
    rotate: (Math.atan2(m[1], m[0]) * 180) / Math.PI,
    w: BOX.w,
    h: BOX.h,
  };
}
const TARGET = { x: 1102, y: 262, w: 190, h: 596, rotate: 0 };

test('free, the stub settles into the hand from exactly where the tear left it', () => {
  const free = freeStub();
  assert.ok(Math.abs(free.rotate) > 1 && Math.abs(free.rotate) <= 8 * P.PASS_HINGE + 0.5, `${free.rotate}°`);
  const at0 = P.carryPose(free, 0);
  assert.deepEqual([at0.cx, at0.cy, at0.rotate, at0.scale, at0.print, at0.card], [free.cx, free.cy, free.rotate, 1, 1, 0]);
  const held = P.carried(free);
  assert.ok(close(held.cy, free.cy - P.STUB_CARRY.lift));
  assert.ok(close(held.rotate, free.rotate * (1 - P.STUB_CARRY.straighten)));
  assert.ok(close(held.scale, P.STUB_CARRY.scale));
  assert.equal(held.shadow, 1);
});

test('the arc: 1.2–1.6 s, bowed up, a slight turn, onto the cover stub; the merge makes it the cover stub', () => {
  const free = freeStub();
  const from = P.carried(free);
  const to = TARGET;
  const end = P.centreOf(to);
  // Its length is in step with the distance, within the reference's range.
  const near = P.stubFlightMs({ x: 0, y: 0 }, { x: 10, y: 0 });
  const mid = P.stubFlightMs({ x: 0, y: 0 }, { x: 600, y: 0 });
  const far = P.stubFlightMs({ x: 0, y: 0 }, { x: 3000, y: 0 });
  assert.ok(near >= 1200 && near < 1210);
  assert.ok(mid > near && mid < 1600);
  assert.equal(far, 1600);
  // At 0 it is where it set off, the pass's white stub; at 1 it is on the
  // cover stub — centred on it, turned as it, the cover stub's width — and
  // it IS the cover stub (review of 2026-09-29: it used to hang white, then
  // turn into a blank slab after the landing): its card, its sign, its
  // height; only its shadow (shortened, not gone) says it is in the air.
  const a = P.stubFlightPose(from, BOX, to, 0);
  assert.ok(close(a.cx, from.cx) && close(a.cy, from.cy) && close(a.rotate, from.rotate) && close(a.scale, from.scale));
  assert.deepEqual([a.print, a.card, a.sign, a.unfold], [1, 0, 0, 0]);
  const z = P.stubFlightPose(from, BOX, to, 1);
  assert.ok(close(z.cx, end.x) && close(z.cy, end.y) && close(z.rotate, to.rotate, 1e-9));
  assert.ok(close(BOX.w * z.scale, to.w));
  assert.deepEqual([z.print, z.card, z.sign, z.unfold], [0, 1, 1, 1]);
  assert.ok(z.shadow > 0.5 && z.shadow < from.shadow);
  const card = P.courierCard(BOX, to);
  assert.ok(close(card.h * z.scale, to.h));
  assert.ok(close(card.w * z.scale, to.w));
  assert.equal(P.unfoldInset(card.h, BOX.h, z.unfold), 0);
  // On the way: the card (stop 01's stock) is up under the white paper
  // before the paper goes (never a see-through moment), the sign prints on
  // the card only (never on the white), the card unfolds last.
  for (let i = 0; i <= 60; i += 1) {
    const p = P.stubFlightPose(from, BOX, to, i / 60);
    assert.ok(p.card + p.print >= 0.99, `${i / 60}`);
    assert.ok(p.sign <= p.card + 1e-9, `${i / 60}: the sign is on the card`);
    if (i / 60 < P.ARC_MERGE.unfold[0]) assert.equal(p.unfold, 0);
  }
  // Down, it settles in place (its shadow goes) and is exactly the cover
  // stub: nothing else changes.
  const m0 = P.stubMergePose(z, 0);
  assert.deepEqual([m0.cx, m0.cy, m0.rotate, m0.scale, m0.print, m0.card, m0.sign, m0.unfold, m0.shadow], [z.cx, z.cy, z.rotate, z.scale, 0, 1, 1, 1, z.shadow]);
  const m1 = P.stubMergePose(z, 1);
  assert.deepEqual([m1.cx, m1.cy, m1.rotate, m1.scale, m1.print, m1.card, m1.sign, m1.unfold, m1.shadow], [z.cx, z.cy, z.rotate, z.scale, 0, 1, 1, 1, 0]);
  let before = m0;
  for (let i = 1; i <= 30; i += 1) {
    const p = P.stubMergePose(z, i / 30);
    assert.ok(p.shadow <= before.shadow + 1e-12);
    before = p;
  }
  assert.ok(P.STUB_MERGE.ms >= 160 && P.STUB_MERGE.ms <= 400);
  assert.equal(P.STUB_FLIGHT.handoffMs, 0, 'the real stub shows and the copy goes in one frame');
  // Bowed up: mid-way it is above the chord's middle, by no more than bowMax.
  const c = P.arcControl({ x: from.cx, y: from.cy }, end);
  assert.ok(c.y < (from.cy + end.y) / 2);
  assert.ok(Math.hypot(c.x - (from.cx + end.x) / 2, c.y - (from.cy + end.y) / 2) <= P.STUB_FLIGHT.bowMax + 1e-9);
  // A chord going up and one going down both bow up the screen.
  assert.ok(P.arcControl({ x: 0, y: 500 }, { x: 400, y: 100 }).y < 300);
  assert.ok(P.arcControl({ x: 400, y: 100 }, { x: 0, y: 500 }).y < 300);
  // Every step of the way: the progress along the path never goes back,
  // the turn stays slight, nothing jumps between frames.
  let prev = a;
  let maxTurn = 0;
  for (let i = 1; i <= 90; i += 1) {
    const p = P.stubFlightPose(from, BOX, to, i / 90);
    const base = from.rotate + (to.rotate - from.rotate) * ((p.scale - from.scale) / (z.scale - from.scale));
    maxTurn = Math.max(maxTurn, Math.abs(p.rotate - base));
    assert.ok(Math.hypot(p.cx - prev.cx, p.cy - prev.cy) < 40, `step ${i}`);
    assert.ok(p.print <= prev.print + 1e-12 && p.card >= prev.card - 1e-12 && p.sign >= prev.sign - 1e-12 && p.unfold >= prev.unfold - 1e-12);
    prev = p;
  }
  assert.ok(maxTurn <= P.STUB_FLIGHT.turn + 0.5 && maxTurn >= P.STUB_FLIGHT.turn * 0.8, `${maxTurn}°`);
  // The card unfolds from the print's height (centred) to its own.
  assert.ok(close(P.unfoldInset(card.h, BOX.h, 0), (card.h - BOX.h) / 2));
  // A cover stub shorter than the pass's (a phone's card, scaled): the stub
  // lands fitted inside it (never spilling past it) and the card unfolds
  // across instead.
  const phoneBox = { w: 97, h: 156 };
  const phoneTo = { x: 236.8, y: 587.1, w: 136.8, h: 146.9, rotate: 0 };
  const s = P.landingScale(phoneBox, phoneTo);
  assert.ok(close(phoneBox.h * s, phoneTo.h) && phoneBox.w * s <= phoneTo.w + 1e-9);
  const phoneCard = P.courierCard(phoneBox, phoneTo);
  assert.ok(close(phoneCard.w * s, phoneTo.w) && close(phoneCard.h * s, phoneTo.h));
  assert.equal(P.unfoldInset(phoneCard.h, phoneBox.h, 0), 0);
  assert.ok(close(P.unfoldInset(phoneCard.w, phoneBox.w, 0), (phoneCard.w - phoneBox.w) / 2));
  assert.equal(P.unfoldInset(phoneCard.w, phoneBox.w, 1), 0);
  assert.equal(P.unfoldInset(100, 263, 0), 0);
});

// A stand-in for the explorer's half of the contract: it names the target
// once its entry starts (`targetAt`) and says it has landed (`landedAt`).
function runHandoff({ targetAt, landedAt, letGoAt = null, target = TARGET, until = 16000 }) {
  const free = freeStub();
  let state = P.courierStart(0);
  const said = [];
  const removed = [];
  const phases = [];
  let lastPose = null;
  let jumps = 0;
  let letGone = null;
  for (let now = 0; now <= until; now += 16) {
    if (targetAt != null && now >= targetAt) state = P.courierStep(state, { type: 'target', now, rect: target }, free).state;
    if (landedAt != null && now >= landedAt && state.entryLanded == null) {
      const r = P.courierStep(state, { type: 'entry-landed', now }, free);
      state = r.state;
      r.effects.forEach((e) => (e === 'say-landed' ? said : removed).push(now));
    }
    if (letGoAt != null && now >= letGoAt && !letGone) {
      letGone = { phase: state.phase, pose: P.courierPose(state, free, now).pose, now };
      const r = P.courierStep(state, { type: 'let-go', now, pose: letGone.pose }, free);
      state = r.state;
      r.effects.forEach((e) => (e === 'say-landed' ? said : removed).push(now));
      if (state.phase === 'done') break;
    }
    const drawn = P.courierPose(state, free, now);
    const r = P.courierStep(state, { type: 'tick', now, pose: drawn.pose }, free);
    state = r.state;
    r.effects.forEach((e) => (e === 'say-landed' ? said : removed).push(now));
    if (phases[phases.length - 1]?.phase !== state.phase) phases.push({ phase: state.phase, now });
    const pose = P.courierPose(state, free, now).pose;
    if (lastPose && state.phase !== 'done' && Math.hypot(pose.cx - lastPose.cx, pose.cy - lastPose.cy) > 40) jumps += 1;
    lastPose = pose;
    if (state.phase === 'done') break;
  }
  return { state, said, removed, phases, jumps, letGone };
}

test('the hand-off: it merges only once it has arrived AND the camera is down, says so once, then goes', () => {
  // The contract's usual case: the target from the entry's start (after the
  // 1.6 s glide), a long descent: the stub arrives first and waits there,
  // fixed while the camera comes down under it; then it merges.
  const slow = runHandoff({ targetAt: 2300, landedAt: 2300 + 4400 });
  assert.deepEqual(slow.phases.map((p) => p.phase), ['carry', 'arc', 'hold', 'merge', 'done']);
  const arc = slow.phases.find((p) => p.phase === 'arc');
  assert.ok(arc.now >= 2300 && arc.now < 2300 + 40);
  const hold = slow.phases.find((p) => p.phase === 'hold');
  assert.ok(hold.now - arc.now >= 1200 && hold.now - arc.now <= 1640);
  const merge = slow.phases.find((p) => p.phase === 'merge');
  assert.ok(merge.now >= 6700 && merge.now < 6700 + 20);
  assert.equal(slow.said.length, 1);
  assert.ok(slow.said[0] >= merge.now + P.STUB_MERGE.ms && slow.said[0] < merge.now + P.STUB_MERGE.ms + 20);
  assert.equal(slow.removed.length, 1);
  // It is the cover stub already: the real one shows and the copy goes in
  // the same frame.
  assert.equal(slow.removed[0], slow.said[0]);
  assert.equal(slow.jumps, 0);
  // The contract says when the camera will touch down (`landsAt`): the arc
  // is timed to land on it — no hanging in the air over the planet (review
  // of 2026-09-29: 4.6 s still at 1728) — the stub held in the hand until
  // then.
  const landsAt = 700 + 3900;
  const timed = runHandoff({ targetAt: 700, landedAt: landsAt, target: { ...TARGET, landsAt } });
  const tArc = timed.phases.find((p) => p.phase === 'arc');
  const tMerge = timed.phases.find((p) => p.phase === 'merge');
  assert.ok(tArc.now > 700 + P.STUB_CARRY.ms, 'held in the hand first');
  assert.ok(Math.abs(tMerge.now - landsAt) <= 20, `merges at the touchdown (${tMerge.now} vs ${landsAt})`);
  assert.ok(!timed.phases.some((p) => p.phase === 'hold' && tMerge.now - p.now > 20), 'never hangs on the rect');
  assert.ok(timed.said[0] - landsAt <= P.STUB_MERGE.ms + 20);
  assert.equal(timed.jumps, 0);
  // The touchdown brought forward (the entry cut short) while it is still
  // in the hand: it sets off at once.
  const cut = runHandoff({ targetAt: 700, landedAt: 1800, target: { ...TARGET, landsAt: 1800 } });
  assert.ok(cut.phases.find((p) => p.phase === 'arc').now <= 700 + P.STUB_CARRY.ms + 20);
  // A short descent (or one the reader cut short): the camera is down before
  // the stub arrives; it merges the moment it arrives.
  const quick = runHandoff({ targetAt: 2300, landedAt: 2600 });
  const qArc = quick.phases.find((p) => p.phase === 'arc');
  const qLand = quick.phases.find((p) => p.phase === 'merge');
  assert.ok(qLand.now - qArc.now >= 1200 && qLand.now - qArc.now <= 1640);
  assert.ok(!quick.phases.some((p) => p.phase === 'hold' && p.now < qLand.now - 20));
  assert.equal(quick.said.length, 1);
  assert.equal(quick.jumps, 0);
  // Named early (the explorer can derive it before its entry): it still
  // settles into the hand first.
  const early = runHandoff({ targetAt: 0, landedAt: 5000 });
  assert.ok(early.phases.find((p) => p.phase === 'arc').now >= P.STUB_CARRY.ms);
  // An explorer that never names a target: once it has landed the stub is
  // let go where it is, and the landing is still said (its own stub shows).
  const none = runHandoff({ targetAt: null, landedAt: 6000 });
  assert.deepEqual(none.phases.map((p) => p.phase), ['carry', 'fade', 'done']);
  assert.equal(none.said.length, 1);
  assert.ok(none.said[0] >= 6000 + P.STUB_FLIGHT.targetGraceMs);
  // One that never says it landed: handed over all the same, never kept.
  const mute = runHandoff({ targetAt: 2300, landedAt: null });
  assert.equal(mute.said.length, 1);
  assert.ok(mute.said[0] >= P.STUB_FLIGHT.maxWaitMs + P.STUB_MERGE.ms && mute.said[0] < P.STUB_FLIGHT.maxWaitMs + P.STUB_MERGE.ms + 20);
  // Neither: let go at the longest wait.
  const lost = runHandoff({ targetAt: null, landedAt: null });
  assert.equal(lost.said.length, 1);
  assert.equal(lost.state.phase, 'done');
  // A contract rect is taken only if it is one.
  assert.equal(P.validStubRect(null), null);
  assert.equal(P.validStubRect({ x: 1, y: 2, w: 0, h: 5, rotate: 0 }), null);
  assert.equal(P.validStubRect({ x: NaN, y: 2, w: 10, h: 5 }), null);
  assert.deepEqual(P.validStubRect({ x: 1, y: 2, w: 10, h: 5 }), { x: 1, y: 2, w: 10, h: 5, rotate: 0 });
});

test('let go on its way: the reader already elsewhere, the stub fades where it is, never onto another cover', () => {
  // The explorer leaves stop 01 while the stub merges (a key, a shield, the
  // ticket let go, Back to the start: entranceMotion.ts tells it LET-GO).
  const free = freeStub();
  const merging = runHandoff({ targetAt: 2300, landedAt: 6700, letGoAt: 6700 + 200 });
  assert.equal(merging.letGone.phase, 'merge');
  assert.deepEqual(merging.phases.map((p) => p.phase).slice(-2), ['fade', 'done']);
  assert.ok(!merging.phases.some((p) => p.phase === 'handoff'));
  // It says the landing at once (stop 01's own stub is not kept hidden for a
  // stub that is not coming), once, and goes after the let-go's short fade.
  assert.equal(merging.said.length, 1);
  assert.equal(merging.said[0], merging.letGone.now);
  assert.equal(merging.removed.length, 1);
  assert.ok(merging.removed[0] - merging.letGone.now >= P.STUB_FLIGHT.letGoMs && merging.removed[0] - merging.letGone.now < P.STUB_FLIGHT.letGoMs + 20);
  assert.ok(P.STUB_FLIGHT.letGoMs < P.STUB_FLIGHT.fadeMs);
  assert.equal(merging.jumps, 0);
  // It fades in the very pose it was let go in: no jump back to the hand.
  let state = P.courierStart(0);
  state = P.courierStep(state, { type: 'target', now: 0, rect: TARGET }, free).state;
  for (let now = 0; now <= 1200; now += 16) state = P.courierStep(state, { type: 'tick', now, pose: P.courierPose(state, free, now).pose }, free).state;
  assert.equal(state.phase, 'arc');
  const at = P.courierPose(state, free, 1200).pose;
  state = P.courierStep(state, { type: 'let-go', now: 1200, pose: at }, free).state;
  assert.equal(state.phase, 'fade');
  const fading = P.courierPose(state, free, 1300);
  assert.deepEqual(fading.pose, at);
  assert.ok(fading.opacity > 0 && fading.opacity < 1);
  assert.equal(P.courierPose(state, free, 1200 + P.STUB_FLIGHT.letGoMs).opacity, 0);
  // Already the cover's stub (the landing said): the copy went in the frame
  // the real stub showed; there is nothing left to let go.
  const handed = runHandoff({ targetAt: 2300, landedAt: 6700, letGoAt: 6700 + P.STUB_MERGE.ms + 60 });
  assert.equal(handed.letGone, null);
  assert.equal(handed.said.length, 1);
  assert.equal(handed.removed[0], handed.said[0]);
  // The page tells it when the explorer leaves stop 01 before the landing.
  const motion = source('src/components/home/entranceMotion.ts');
  assert.match(motion, /if \(entryId && \(detail\.phase === 'globe' \|\| \(detail\.phase === 'explore' && detail\.current !== entryId\)\)\) letGo\(\);/);
  assert.match(motion, /courierStep\(state, \{ type: 'let-go', now, pose: courierPose\(state, free, now\)\.pose \}, free\)/);
});

test('the hand-off contract, as the page speaks it', () => {
  assert.equal(P.STUB_LANDED_EVENT, 'archive:stub-landed');
  assert.equal(P.ENTRY_LANDED_EVENT, 'archive:entry-landed');
  assert.equal(P.COVER_STUB_TARGET, '__archiveCoverStubTarget');
  // Torn, the entrance asks for the explorer with the stub's hand-off.
  const intro = source('src/components/home/EntranceIntro.tsx');
  assert.match(intro, /requestExplore\(\{ from: 'boarding-pass', stubHandoff, \.\.\.\(arrivingMs > 0 \? \{ arrivingMs \} : null\) \}\)/);
  assert.match(intro, /ask\(true\)/);
  // …as its glide SETS OFF (the entry rides under the glide), and says when
  // the glide has landed (HomePage takes the entrance off then).
  assert.match(intro, /const duration = ARRIVAL_SECONDS \* 1000;\s*ask\(true, duration\);/);
  assert.match(intro, /callbacks\.current\.onGlided\?\.\(\);/);
  assert.match(source('src/lib/explorer.ts'), /arrivingMs\?: number;/);
  assert.match(source('src/lib/explorer.ts'), /stubHandoff\?: boolean;/);
  // The courier reads the explorer's derived rect, never a rect of its own
  // per frame (derive, do not sample), and says the landing on window.
  const motion = source('src/components/home/entranceMotion.ts');
  const courier = motion.slice(motion.indexOf('export function launchStubCourier'));
  assert.doesNotMatch(courier, /getBoundingClientRect|offsetWidth|offsetTop/);
  assert.match(courier, /readTarget\(\)/);
  assert.match(motion, /window\.dispatchEvent\(new CustomEvent\(STUB_LANDED_EVENT/);
  assert.match(courier, /listen\(ENTRY_LANDED_EVENT/);
  // It lives on <body>, outside the entrance (which leaves the page once the
  // explorer has it), and goes with the page.
  assert.match(courier, /document\.body\.append\(layer\)/);
  assert.match(courier, /astro:before-swap/);
  // The glide: the page goes on by itself, a beat after the stub is free,
  // on the glide's own curve.
  // One number for the glide and the entry riding under it.
  assert.equal(P.ARRIVAL_SECONDS, 1);
  assert.equal(P.ARRIVAL_SECONDS * 1000, CAMERA.ENTRY.glideMs);
  assert.ok(P.GLIDE_AFTER_FREE_MS > 0 && P.GLIDE_AFTER_FREE_MS <= 200);
  assert.match(intro, /arrivalCurve\(k\)/);
  // Values, not structure: neither component branches its markup on
  // reduced motion.
  for (const file of ['src/components/home/EntranceIntro.tsx', 'src/components/home/BoardingPass.tsx']) {
    assert.doesNotMatch(source(file), /useReducedMotion/, file);
  }
});

test('the pass in the hand: carried, never torn by it, kept on the screen', () => {
  const D = P.PASS_DRAG;
  // A press that travels past the threshold is a drag (never a click).
  assert.equal(P.isDrag(D.threshold, 0), false);
  assert.equal(P.isDrag(D.threshold + 0.5, 0), true);
  assert.equal(P.isDrag(4, 4), false);
  assert.ok(D.threshold >= 4 && D.threshold <= 8);
  // Clamped whole on the screen, margin in from each edge.
  const home = { left: 1000, top: 600, right: 1660, bottom: 900 };
  assert.deepEqual(P.clampOffset({ x: -5000, y: -5000 }, home, 1728, 1000), { x: D.margin - 1000, y: D.margin - 600 });
  assert.deepEqual(P.clampOffset({ x: 5000, y: 5000 }, home, 1728, 1000), { x: 1728 - D.margin - 1660, y: 1000 - D.margin - 900 });
  assert.deepEqual(P.clampOffset({ x: -20, y: 10 }, home, 1728, 1000), { x: -20, y: 10 });
  // The pace at the let-go: its last samples, capped.
  const v = P.releaseVelocity([[0, 0, 0], [16, 10, 0], [32, 20, 0], [48, 30, 5]]);
  assert.ok(Math.abs(v.x - 625) < 1 && Math.abs(v.y - 104.2) < 1, JSON.stringify(v));
  const fast = P.releaseVelocity([[0, 0, 0], [16, 400, 0]]);
  assert.ok(Math.abs(Math.hypot(fast.x, fast.y) - D.maxSpeed) < 1e-6);
  assert.deepEqual(P.releaseVelocity([[0, 0, 0]]), { x: 0, y: 0 });
  // Like paper (owner, 2026-09-29: 移动这个票太僵硬了). A frame-rate-free
  // simulation: the same hand at 60 Hz and 120 Hz moves it alike.
  const Q = P.PAPER;
  const open = P.offsetBounds({ left: 400, top: 300, right: 800, bottom: 500 }, 1728, 1000);
  const hold = (hz, ms, hand, extra = {}) => {
    let st = P.paperRest();
    const trace = [];
    const dt = 1 / hz;
    for (let t = 0; t <= ms / 1000 + 1e-9; t += dt) {
      const h = hand(t);
      if (h) st = { ...st, target: h };
      st = P.paperStep(st, { held: !!h, lever: { x: 0, y: 1 }, bounds: open, ...extra }, dt).state;
      trace.push([t + dt, st]);
    }
    return trace;
  };
  // A step of the hand (100 px): caught up in ~0.1 s, a hair of overshoot.
  const step = (hz) => hold(hz, 400, () => ({ x: 100, y: 0 }));
  for (const hz of [60, 120]) {
    const tr = step(hz);
    const caught = tr.find(([, st]) => st.p.x >= 95)[0];
    assert.ok(caught >= 0.05 && caught <= 0.12, `${hz} Hz: 95% at ${(caught * 1000).toFixed(0)} ms`);
    const over = Math.max(...tr.map(([, st]) => st.p.x)) - 100;
    assert.ok(over >= 0 && over <= 3, `${hz} Hz: overshoot ${over.toFixed(2)} px`);
  }
  const at = (tr, t) => tr.reduce((best, cur) => (Math.abs(cur[0] - t) < Math.abs(best[0] - t) ? cur : best))[1];
  const s60 = step(60);
  const s120 = step(120);
  for (const t of [0.05, 0.1, 0.2]) assert.ok(Math.abs(at(s60, t).p.x - at(s120, t).p.x) < 1.5, `${t}s: 60 vs 120 Hz`);
  // A steady hand (300 px/s): trailed by well under 20 px (no lag to feel).
  const slow = hold(120, 1000, (t) => ({ x: 300 * t, y: 0 }));
  const lag = 300 * 1 - at(slow, 1).p.x;
  assert.ok(lag > 0 && lag < 16, `lag ${lag.toFixed(1)} px`);
  // It swings with the hand (held above its middle, moving right: clockwise),
  // within its limit, and leans into its travel.
  assert.ok(at(slow, 1).sway > 0.5 && at(slow, 1).sway <= Q.sway.max, `sway ${at(slow, 1).sway.toFixed(2)}`);
  assert.ok(at(slow, 1).leanY > 0 && at(slow, 1).leanY <= Q.lean.max);
  const quick = hold(120, 600, (t) => ({ x: 4000 * t, y: -1500 * t }));
  for (const [, st] of quick) {
    assert.ok(Math.abs(st.sway) <= 10, `sway ${st.sway.toFixed(2)}`);
    assert.ok(Math.abs(st.leanX) <= 8 && Math.abs(st.leanY) <= 8, `lean ${st.leanX.toFixed(2)} ${st.leanY.toFixed(2)}`);
  }
  // Let go at 1000 px/s: it slides ~140 px on, settles (a small overshoot),
  // swings back to square and lands.
  let st = { ...P.paperRest(), sway: 5, leanY: 4, lift: 1, drift: { x: 1000, y: 0 } };
  let peak = 0;
  let steps = 0;
  for (let moving = true; moving && steps < 600; steps += 1) {
    ({ state: st, moving } = P.paperStep(st, { held: false, lever: { x: 0, y: 1 }, bounds: open }, 1 / 120));
    peak = Math.max(peak, st.p.x);
  }
  assert.ok(st.p.x > 95 && st.p.x < 125, `slid ${st.p.x.toFixed(1)} px`);
  assert.ok(peak - st.p.x <= 3, `settle overshoot ${(peak - st.p.x).toFixed(2)}`);
  assert.equal(st.sway, 0);
  assert.equal(st.leanX + st.leanY + st.lift, 0);
  assert.ok(steps < 300, `at rest in ${(steps / 120).toFixed(2)} s`);
  // An edge gives a little (never more than the rubber's reach) and the
  // paper comes back inside when let go.
  assert.equal(P.rubber(50, 0, 100), 50);
  assert.ok(P.rubber(1e6, 0, 100) < 100 + Q.rubber && P.rubber(1e6, 0, 100) > 100 + Q.rubber * 0.99);
  assert.ok(P.rubber(-40, 0, 100) > -Q.rubber && P.rubber(-40, 0, 100) < 0);
  let back = { ...P.paperRest({ x: open.hi.x + 50, y: 0 }), target: { x: open.hi.x + 50, y: 0 } };
  for (let i = 0; i < 240; i += 1) back = P.paperStep(back, { held: false, lever: { x: 0, y: 0 }, bounds: open }, 1 / 60).state;
  assert.equal(back.p.x, open.hi.x);
  // Squared for the tear: square within the tear's 530 ms.
  let sq = { ...P.paperRest(), sway: 8, swayV: 40, leanX: 6, leanY: -6, lift: 1 };
  for (let t = 0; t < 0.5; t += 1 / 60) sq = P.paperStep(sq, { held: false, lever: { x: 0, y: 1 }, bounds: open, square: true }, 1 / 60).state;
  assert.ok(Math.abs(sq.sway) < 0.02 && Math.abs(sq.leanX) < 0.02 && Math.abs(sq.lift) < 0.01, JSON.stringify(sq));
  // Reduced motion: direct, nothing swings.
  const direct = P.paperStep(P.paperRest(), { held: true, lever: { x: 0, y: 1 }, bounds: open, reduced: true }, 1 / 60);
  assert.equal(direct.moving, false);
  const rd = P.paperStep({ ...P.paperRest(), target: { x: 80, y: 20 } }, { held: true, lever: { x: 0, y: 1 }, bounds: open, reduced: true }, 1 / 60).state;
  assert.deepEqual([rd.p, rd.sway, rd.leanX, rd.leanY], [{ x: 80, y: 20 }, 0, 0, 0]);
  // Its transform: none at rest; lifted, turned and leaned about the held point.
  assert.equal(P.paperTransform(P.paperRest(), { x: 10, y: 5 }), null);
  const tf = P.paperTransform({ ...P.paperRest(), sway: 3, leanY: 2, lift: 1 }, { x: 10, y: 5 });
  assert.match(tf, /^translate3d\(0, -5\.00px, 0\) translate\(10\.0px, 5\.0px\) perspective\(1100px\) rotateX\(0\.000deg\) rotateY\(2\.000deg\) rotate\(3\.000deg\) scale\(1\.0350\) translate\(-10\.0px, -5\.0px\)$/);
  const pass2 = source('src/components/home/BoardingPass.tsx');
  assert.match(pass2, /const step = paperStep\(paper, \{ held, lever, bounds: bounds\(\), square: squaring, reduced: reduced\(\) \}, dt\);/);
  assert.match(pass2, /getCoalescedEvents/);
  // The page: the carry moves the pass with its hint (EntranceIntro), the
  // pass takes no touch scroll, and the glow is bone light, never lime, a
  // slow breath put out by the tear, still under reduced motion.
  const intro = source('src/components/home/EntranceIntro.tsx');
  assert.match(intro, /carry=\{stageRef\}/);
  const css = source('src/styles/entrance.css');
  assert.match(css, /\.ec-pass \.bp-body \{\s*touch-action: none;/);
  assert.match(css, /@keyframes bp-breathe/);
  assert.match(css, /animation: bp-breathe 2\.8s ease-in-out 0\.4s infinite;/);
  assert.match(css, /\.bp\[data-stub\]::before,\s*\.bp\[data-stub\]::after \{\s*animation: none;\s*opacity: 0;/);
  const glow = css.slice(css.indexOf('.bp::before,'), css.indexOf('/* ── Carried'));
  assert.doesNotMatch(glow, /d2ff00|lime/i);
  assert.match(glow, /prefers-reduced-motion: reduce[\s\S]*animation: none;/);
});

test('中: the cover in Chinese keeps every landing slot, breaks like Chinese, and the pass stays printed English', () => {
  const facts = { ...FACTS, regionsZh: ['佛罗里达州', '亚利桑那州', '犹他州', '纽约州'] };
  const first = { ...MIAMI, nameZh: '迈阿密' };
  const en = P.coverBlocks(facts, first);
  const zh = P.coverBlocks(facts, first, 'zh');
  // The same blocks in the same order (the reveal's --b is shared).
  assert.deepEqual(zh.map((b) => b.kind), en.map((b) => b.kind));
  const texts = zh.map(textOf);
  assert.equal(texts[1], 'Ryan Xu，一台相机，和我旅行过的地方。');
  assert.equal(texts[2], '6 个地点。58 帧。');
  assert.equal(texts[3], '佛罗里达州、亚利桑那州、犹他州和纽约州，2025–2026 年。');
  assert.equal(texts[5], '第一站，迈阿密。乘客是你。');
  // Every word the film lands, once each, in its own span (his name Latin).
  const parts = zh.flatMap((b) => P.coverWords(b.pieces).flat());
  assert.deepEqual(parts.filter((p) => p.land).map((p) => [p.land, p.text]), [
    ['ryan', 'Ryan'], ['xu', 'Xu'], ['camera', '相机'], ['travel', '旅行'], ['archive', '档案'], ['thought', '思考'], ['you', '你'],
  ]);
  assert.deepEqual(parts.filter((p) => p.pass), [{ text: '迈阿密', pass: 'to', tight: true }]);
  // Han breaks between phrases (set close, no space): after a closing
  // mark, at a landed word, where Han meets a figure — never before a
  // closing mark, never inside a phrase, never between a figure and its
  // unit (a no-break space).
  const words = P.coverWords(zh[1].pieces).map((w) => w.map((p) => p.text).join(''));
  assert.deepEqual(words, ['Ryan', 'Xu，', '一台', '相机，', '', '和我', '旅行', '过的地方。']);
  // (Phrases, not characters: "一台" is never split across two lines.)
  const kept = P.coverWords(zh[4].pieces).map((w) => w.map((p) => p.text).join(''));
  assert.deepEqual(kept, ['相机留下的，', '成了这份', '档案——', '光线、', '土地，', '以及一路相随的', '思考。']);
  const where = P.coverWords(zh[3].pieces).map((w) => w.map((p) => p.text).join(''));
  assert.equal(where[where.length - 1], '2025–2026 年。');
  assert.ok(where.every((w) => !/^[，。、]/.test(w)), 'no line starts with a closing mark');
  // English is untouched by the Han rule: no word is set close.
  assert.ok(en.every((b) => P.coverWords(b.pieces).every((w) => !w[0].tight)));
  assert.equal(P.listJoin(['A', 'B', 'C'], 'zh'), 'A、B和C');
  // The pass prints English in both languages (like the shields); only what
  // a screen reader hears is translated (toZh).
  const fields = P.passFields(first);
  assert.equal(fields.to, 'MIAMI');
  assert.equal(fields.toZh, '迈阿密');
  assert.equal(fields.passenger, 'YOU');
  // Both covers are in the markup: the flights take the shown copy.
  const entrance = source('src/components/home/EntranceIntro.tsx');
  assert.match(entrance, /coverBlocks\(facts, first, 'zh'\)/);
  assert.match(entrance, /<span data-l="zh" lang="zh-Hans">\s*<Words block=\{zh\} \/>/);
  const motion = source('src/components/home/entranceMotion.ts');
  assert.match(motion, /shownMatch\(text, `\[data-pass-from="\$\{word\}"\]`\)/);
  assert.match(motion, /shownMatch\(stage, `\[data-pass-land="\$\{word\}"\]`\)/);
  assert.doesNotMatch(motion, /querySelector<HTMLElement>\(`\[data-pass-(from|land)/);
});

test('中: his name keeps the display tracking in the Chinese cover (the landing moves the same word; the title gives way)', () => {
  const css = source('src/styles/entrance.css');
  const xl = /\.ec-xl,\s*\.ec-xl-quiet \{[^}]*letter-spacing: (-?[\d.]+em);/.exec(css);
  assert.ok(xl, 'the display tracking');
  const name = /\.ec-xl \[data-l='zh'\] :is\(\[data-open-land='ryan'\], \[data-open-land='xu'\]\) \{\s*letter-spacing: (-?[\d.]+em);/.exec(css);
  assert.ok(name, 'the name rule in 中');
  assert.equal(name[1], xl[1]);
});
