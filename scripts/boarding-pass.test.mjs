// Run offline: node --experimental-strip-types --test scripts/boarding-pass.test.mjs
//
// The boarding pass after the opening film (src/lib/boardingPass.ts, its QR
// code src/lib/qrCode.ts): what it prints (from the first chapter, never an
// invented origin), the QR code (a real one: every block a valid
// Reed–Solomon codeword, the codewords read back out of the matrix in
// placement order, the format information BCH-valid, the finders and timing
// where a reader looks), the hand (the tilt and sway caps, the rest area it
// always comes back into from anywhere, the rubber band that keeps it on
// screen), the tear (the paper resists for 40 px, then the rip follows the
// hand to the bottom notch; let go early it springs back, late or flicked it
// tears on), the stub's fall, and the page's scroll score round it.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as P from '../src/lib/boardingPass.ts';
import * as Q from '../src/lib/qrCode.ts';
import { TEAR_FREE_MS, TEAR_TENSION_MS, tornEdge, tornEdgeAcross, tornEdgePaths } from '../src/lib/ticketTear.ts';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('what it prints: the first chapter, never an invented origin', () => {
  const miami = P.passFields({ name: 'Miami', region: 'Florida', year: '2026' });
  assert.equal(miami.to, 'MIAMI');
  assert.equal(miami.toCode, 'FL');
  assert.equal(miami.date, '2026');
  assert.equal(miami.from, 'HERE');
  assert.equal(miami.passenger, 'RYAN XU');
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
test('the tilt: toward the grab point, never more than 10°', () => {
  for (const [nx, ny] of [[1, 1], [-1, -1], [1, 0], [0, 1], [0.3, -0.8], [5, -9]]) {
    const { rx, ry } = P.tiltFor(nx, ny);
    assert.ok(Math.hypot(rx, ry) <= P.PASS_HAND.tiltMax + 1e-9);
  }
  // The grabbed point comes toward the reader: the right edge (rotateY −),
  // the bottom edge (rotateX +).
  assert.ok(P.tiltFor(1, 0).ry < 0 && P.tiltFor(-1, 0).ry > 0);
  assert.ok(P.tiltFor(0, 1).rx > 0 && P.tiltFor(0, -1).rx < 0);
  assert.ok(close(P.tiltFor(1, 0).ry, -10));
  assert.deepEqual(P.tiltFor(0.7, 0.7, 0), { rx: 0, ry: 0 });
});

test('the sway: from the hand\'s sideways speed, never more than 12°, settling when the hand stops', () => {
  for (const vx of [-99999, -3000, -200, 0, 200, 3000, 99999]) {
    for (const ny of [-1, 0, 1]) assert.ok(Math.abs(P.swayTarget(vx, ny)) <= P.PASS_HAND.swayMax + 1e-9);
  }
  // Hung from above, moving right, the foot trails left: a clockwise turn.
  assert.ok(P.swayTarget(800, -1) > 0);
  assert.ok(P.swayTarget(800, 1) < 0);
  // The spring: driven to the cap it stays inside it; let go it settles.
  let s = { s: 0, v: 0 };
  let peak = 0;
  for (let i = 0; i < 120; i += 1) {
    s = P.stepSway(s, 12, 1 / 60);
    peak = Math.max(peak, Math.abs(s.s));
  }
  assert.ok(peak <= P.PASS_HAND.swayMax + 1e-9);
  for (let i = 0; i < 90; i += 1) s = P.stepSway(s, 0, 1 / 60);
  assert.ok(Math.abs(s.s) < 0.05 && Math.abs(s.v) < 1, `settled at ${s.s}`);
});

test('the areas: the rest area keeps the pass on screen; the reach is wider', () => {
  for (const [fw, fh, pw, ph] of [[1728, 1000, 860, 352], [1280, 800, 690, 282], [390, 844, 340, 550], [375, 667, 271, 440]]) {
    const { rest, reach } = P.passAreas(fw, fh, pw, ph);
    assert.ok(rest.x1 >= 0 && rest.x0 === -rest.x1 && rest.y0 === -rest.y1);
    // Anywhere in the rest area the whole pass is on screen.
    assert.ok(pw / 2 + rest.x1 <= fw / 2, `${fw}: x`);
    assert.ok(ph / 2 + rest.y1 <= fh / 2, `${fw}: y`);
    assert.ok(reach.x1 > rest.x1 && reach.y1 > rest.y1);
  }
});

test('the rubber band: 1:1 inside, never past its dimension outside', () => {
  assert.equal(P.rubberBand(40, -100, 100, 300), 40);
  for (const d of [1, 10, 100, 1000, 1e6]) {
    const out = P.rubberBand(100 + d, -100, 100, 300);
    assert.ok(out > 100 && out < 100 + 300 && out < 100 + d + 1e-9);
    const back = P.rubberBand(-100 - d, -100, 100, 300);
    assert.ok(close(back, -out));
  }
  // It only ever gives more as the hand goes further.
  let last = 100;
  for (let d = 0; d < 2000; d += 25) {
    const out = P.rubberBand(100 + d, -100, 100, 300);
    assert.ok(out >= last - 1e-9);
    last = out;
  }
});

test('let go anywhere, at any speed: it glides, slows, and comes to rest inside its rest area', () => {
  const { rest, reach } = P.passAreas(1728, 1000, 860, 352);
  const starts = [];
  for (const x of [reach.x0 * 1.5, rest.x0, 0, rest.x1 * 0.5, reach.x1 * 1.5]) {
    for (const y of [reach.y0 * 1.5, 0, reach.y1 * 1.5]) {
      for (const [vx, vy] of [[0, 0], [4200, 0], [-4200, 1300], [900, -3000], [99999, 99999]]) {
        starts.push({ x, y, vx, vy });
      }
    }
  }
  for (const start of starts) {
    const [vx, vy] = P.throwVelocity(start.vx, start.vy);
    assert.ok(Math.hypot(vx, vy) <= P.PASS_HAND.maxSpeed + 1e-6);
    let body = { x: start.x, y: start.y, vx, vy };
    let settledAt = -1;
    for (let i = 0; i < 60 * 4; i += 1) {
      body = P.stepBody(body, 1 / 60, rest);
      assert.ok(Number.isFinite(body.x) && Number.isFinite(body.y));
      // Never flung far: at most a screen's width past the reach.
      assert.ok(Math.abs(body.x) < 1728 && Math.abs(body.y) < 1000);
      if (settledAt < 0 && P.bodyAtRest(body, rest)) settledAt = i;
    }
    assert.ok(settledAt >= 0, `settles from ${JSON.stringify(start)}`);
    assert.ok(settledAt < 60 * 2.5, `in ${settledAt} frames from ${JSON.stringify(start)}`);
    const [tx, ty] = P.clampToArea(body.x, body.y, rest);
    assert.ok(Math.hypot(body.x - tx, body.y - ty) < 0.5);
  }
  // Still, inside the area, it stays exactly where it was put.
  const still = P.stepBody({ x: rest.x1 / 2, y: 0, vx: 0, vy: 0 }, 1 / 60, rest);
  assert.deepEqual([still.x, still.y], [rest.x1 / 2, 0]);
  // The same path at any frame rate.
  const at60 = Array.from({ length: 60 }).reduce((b) => P.stepBody(b, 1 / 60, rest), { x: 700, y: 300, vx: 0, vy: 0 });
  const at120 = Array.from({ length: 120 }).reduce((b) => P.stepBody(b, 1 / 120, rest), { x: 700, y: 300, vx: 0, vy: 0 });
  assert.ok(close(at60.x, at120.x, 1) && close(at60.y, at120.y, 1));
});

// ── The tear ──
test('the tear: the paper resists for 40 px, then the rip follows the hand to the notch', () => {
  const span = P.tearSpan(352);
  assert.ok(span >= 130 && span <= 230);
  assert.equal(P.tearClock(0, span), 0);
  assert.equal(P.tearClock(-30, span), 0);
  // Resisting: only the strain, never the rip.
  for (const t of [1, 10, 20, 39.9]) {
    assert.ok(P.tearClock(t, span) < TEAR_TENSION_MS);
    assert.equal(P.tearTip(t, span), 0);
  }
  assert.ok(close(P.tearClock(P.TEAR_RESIST_PX, span), TEAR_TENSION_MS));
  // The rip follows the hand: its tip is the hand's share of the span, and
  // the clock only moves on as the hand does.
  let last = 0;
  for (let t = 0; t <= P.TEAR_RESIST_PX + span + 40; t += 2) {
    const clock = P.tearClock(t, span);
    assert.ok(clock >= last - 1e-9);
    last = clock;
  }
  assert.ok(close(P.tearTip(P.TEAR_RESIST_PX + span / 2, span), 0.5));
  assert.equal(P.tearClock(P.TEAR_RESIST_PX + span, span), TEAR_FREE_MS);
  assert.equal(P.tearClock(P.TEAR_RESIST_PX + span * 3, span), TEAR_FREE_MS);
  // The pass gives a little while it resists, and settles as the rip runs.
  assert.ok(P.tearGive(P.TEAR_RESIST_PX, span) <= P.TEAR_GIVE_PX + 1e-9);
  assert.ok(P.tearGive(P.TEAR_RESIST_PX, span) > P.tearGive(20, span));
  assert.equal(P.tearGive(P.TEAR_RESIST_PX + span, span), 0);
  // Let go: early springs back; most of the way, or a flick, tears on.
  assert.equal(P.tearCommits(P.TEAR_RESIST_PX - 1, span, 5), false);
  assert.equal(P.tearCommits(P.TEAR_RESIST_PX + span * 0.5, span, 0.1), false);
  assert.equal(P.tearCommits(P.TEAR_RESIST_PX + span * 0.5, span, 1.2), true);
  assert.equal(P.tearCommits(P.TEAR_RESIST_PX + span * 0.9, span, 0), true);
  // A finger's pull is shorter.
  assert.ok(P.tearSpan(340, true) <= P.tearSpan(340));
});

test('the torn edge across: the same profile turned about the diagonal', () => {
  const along = tornEdgePaths(300, 7);
  assert.deepEqual(tornEdgePaths(300, 7), along);
  const down = tornEdge(300, 7);
  const across = tornEdgeAcross(300, 7, { face: 'rgba(0,0,0,0.2)', stub: 'rgba(0,0,0,0.1)' });
  for (const key of ['faceCut', 'stubCut', 'faceFringe', 'stubFringe']) {
    assert.ok(down[key].startsWith('url("data:image/svg+xml,'));
    assert.ok(across[key].startsWith('url("data:image/svg+xml,'));
    assert.ok(decodeURIComponent(across[key]).includes("matrix(0 1 1 0 0 0)"));
  }
  assert.ok(decodeURIComponent(across.faceCut).includes(`width='${along.height}' height='8'`));
});

test('the stub\'s fall: down, faster and faster, and gone below the screen', () => {
  let s = { x: 0, y: 0, vx: P.STUB_FALL.toss[0], vy: P.STUB_FALL.toss[1], a: 0, va: P.STUB_FALL.toss[2] };
  let lastVy = s.vy;
  let t = 0;
  while (s.y < 1000 && t < P.STUB_FALL.maxMs / 1000) {
    s = P.stepFall(s, 1 / 60);
    assert.ok(s.vy > lastVy, 'gravity only ever adds');
    lastVy = s.vy;
    t += 1 / 60;
  }
  assert.ok(s.y >= 1000, `below a 1000 px screen in ${t.toFixed(2)} s`);
  assert.ok(t < 1.4);
});

test('the page round it: the rise, the scroll\'s strain, the tear point, the glide', () => {
  const vh = 1000;
  const pin = 1000;
  assert.equal(P.passRise(0, pin, vh), 0);
  assert.equal(P.passRise(pin * P.PASS_RISE[0] - 1, pin, vh), 0);
  assert.equal(P.passRise(pin, pin, vh), 1);
  assert.equal(P.scrollStrain(pin, pin, vh), 0);
  assert.equal(P.scrollStrain(pin + vh * P.PASS_PIN * P.PASS_TEAR_AT, pin, vh), 1);
  assert.ok(P.PASS_TEAR_AT < 1, 'it tears while still pinned');
  for (const d of [200, 1000, 1600, 4000]) {
    const s = P.arrivalSeconds(d);
    assert.ok(s >= 1.2 && s <= 1.6);
  }
});
