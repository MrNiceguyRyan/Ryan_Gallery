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
  assert.match(intro, /if \(word && document\.querySelector\(`\[data-fly="\$\{word\}"\]`\)\) el\.setAttribute\('data-flown', ''\);/);
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
  assert.match(css, /--entrance-ease: cubic-bezier\(0\.22, 0\.61, 0\.36, 1\);/);
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
  assert.equal(Math.max(...items.map((i) => i.at + i.ms)), at.hint.at + at.hint.ms);
  // Calm: every part is at least 0.38 s long; the words fly under 0.9 s.
  items.forEach((item) => assert.ok(item.ms >= 380, item.part));
  assert.ok(P.PASS_ASSEMBLY.flights.ms <= 900);
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
  assert.match(intro, /data-pass-from=\{part\.land === 'you' \? 'you' : undefined\}/);
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
  // own), and nothing picks the pass up or follows a scroll.
  const pass = source('src/components/home/BoardingPass.tsx');
  assert.match(pass, /<button\s+ref=\{tearRef\}\s+type="button"\s+className="bp-tear"/);
  assert.doesNotMatch(pass, /pointermove|setPointerCapture|setStrain|setRise|'scroll'|touchmove/);
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
  // At 0 it is where it set off; at 1 it is on the cover stub: centred on
  // it, turned as it, the cover stub's width — still the pass's white stub,
  // held in the air (its shadow shortened, not gone).
  const a = P.stubFlightPose(from, BOX, to, 0);
  assert.ok(close(a.cx, from.cx) && close(a.cy, from.cy) && close(a.rotate, from.rotate) && close(a.scale, from.scale));
  assert.equal(a.print, 1);
  assert.equal(a.card, 0);
  const z = P.stubFlightPose(from, BOX, to, 1);
  assert.ok(close(z.cx, end.x) && close(z.cy, end.y) && close(z.rotate, to.rotate, 1e-9));
  assert.ok(close(BOX.w * z.scale, to.w));
  assert.equal(z.print, 1);
  assert.equal(z.card, 0);
  assert.ok(z.shadow > 0.5 && z.shadow < from.shadow);
  // The merge (once the camera is down): in place, it becomes the cover
  // stub, blank — exactly its rect (the card's height lands at the cover
  // stub's), its card, no print, no shadow.
  const card = P.courierCard(BOX, to);
  assert.ok(close(card.h * z.scale, to.h));
  assert.ok(close(card.w * z.scale, to.w));
  const m0 = P.stubMergePose(z, 0);
  assert.deepEqual([m0.cx, m0.cy, m0.rotate, m0.scale, m0.print, m0.card, m0.unfold, m0.shadow], [z.cx, z.cy, z.rotate, z.scale, 1, 0, 0, z.shadow]);
  const m1 = P.stubMergePose(z, 1);
  assert.deepEqual([m1.cx, m1.cy, m1.rotate, m1.scale], [z.cx, z.cy, z.rotate, z.scale]);
  assert.equal(P.unfoldInset(card.h, BOX.h, m1.unfold), 0);
  assert.equal(m1.print, 0);
  assert.equal(m1.card, 1);
  assert.equal(m1.shadow, 0);
  let before = m0;
  for (let i = 1; i <= 30; i += 1) {
    const p = P.stubMergePose(z, i / 30);
    assert.ok(p.print <= before.print + 1e-12 && p.card >= before.card - 1e-12 && p.unfold >= before.unfold - 1e-12 && p.shadow <= before.shadow + 1e-12);
    before = p;
  }
  // The card is up before the print is gone: never a see-through moment.
  for (let i = 0; i <= 30; i += 1) {
    const p = P.stubMergePose(z, i / 30);
    assert.ok(p.card + p.print >= 0.99, `${i / 30}`);
  }
  assert.ok(P.STUB_MERGE.ms >= 380 && P.STUB_MERGE.ms <= 700);
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
    assert.ok(p.print <= prev.print + 1e-12 && p.card >= prev.card - 1e-12 && p.unfold >= prev.unfold - 1e-12);
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
function runHandoff({ targetAt, landedAt, target = TARGET, until = 16000 }) {
  const free = freeStub();
  let state = P.courierStart(0);
  const said = [];
  const removed = [];
  const phases = [];
  let lastPose = null;
  let jumps = 0;
  for (let now = 0; now <= until; now += 16) {
    if (targetAt != null && now >= targetAt) state = P.courierStep(state, { type: 'target', now, rect: target }, free).state;
    if (landedAt != null && now >= landedAt && state.entryLanded == null) {
      const r = P.courierStep(state, { type: 'entry-landed', now }, free);
      state = r.state;
      r.effects.forEach((e) => (e === 'say-landed' ? said : removed).push(now));
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
  return { state, said, removed, phases, jumps };
}

test('the hand-off: it merges only once it has arrived AND the camera is down, says so once, then goes', () => {
  // The contract's usual case: the target from the entry's start (after the
  // 1.6 s glide), a long descent: the stub arrives first and waits there,
  // fixed while the camera comes down under it; then it merges.
  const slow = runHandoff({ targetAt: 2300, landedAt: 2300 + 4400 });
  assert.deepEqual(slow.phases.map((p) => p.phase), ['carry', 'arc', 'hold', 'merge', 'handoff', 'done']);
  const arc = slow.phases.find((p) => p.phase === 'arc');
  assert.ok(arc.now >= 2300 && arc.now < 2300 + 40);
  const hold = slow.phases.find((p) => p.phase === 'hold');
  assert.ok(hold.now - arc.now >= 1200 && hold.now - arc.now <= 1640);
  const merge = slow.phases.find((p) => p.phase === 'merge');
  assert.ok(merge.now >= 6700 && merge.now < 6700 + 20);
  assert.equal(slow.said.length, 1);
  assert.ok(slow.said[0] >= merge.now + P.STUB_MERGE.ms && slow.said[0] < merge.now + P.STUB_MERGE.ms + 20);
  assert.equal(slow.removed.length, 1);
  assert.ok(slow.removed[0] - slow.said[0] >= P.STUB_FLIGHT.handoffMs);
  assert.equal(slow.jumps, 0);
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

test('the hand-off contract, as the page speaks it', () => {
  assert.equal(P.STUB_LANDED_EVENT, 'archive:stub-landed');
  assert.equal(P.ENTRY_LANDED_EVENT, 'archive:entry-landed');
  assert.equal(P.COVER_STUB_TARGET, '__archiveCoverStubTarget');
  // Torn, the entrance asks for the explorer with the stub's hand-off.
  const intro = source('src/components/home/EntranceIntro.tsx');
  assert.match(intro, /requestExplore\(\{ from: 'boarding-pass', stubHandoff \}\)/);
  assert.match(intro, /ask\(true\)/);
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
  assert.equal(P.ARRIVAL_SECONDS, 1.6);
  assert.ok(P.GLIDE_AFTER_FREE_MS > 0 && P.GLIDE_AFTER_FREE_MS <= 200);
  assert.match(intro, /arrivalCurve\(k\)/);
  // Values, not structure: neither component branches its markup on
  // reduced motion.
  for (const file of ['src/components/home/EntranceIntro.tsx', 'src/components/home/BoardingPass.tsx']) {
    assert.doesNotMatch(source(file), /useReducedMotion/, file);
  }
});
