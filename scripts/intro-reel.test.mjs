// Run offline: node --experimental-strip-types --test scripts/intro-reel.test.mjs
//
// The opening reel (src/lib/introReel.ts, src/lib/introReelPaint.ts,
// src/lib/introReelCover.ts): its score (every sphere gets its hold and its
// turn, the viewfinder comes after the last, the shutter fires once and
// fires back only past a gap), the shutter's blades (continuous through a
// click and through a click reversed halfway), the cover fit the server's SVG
// and the canvas share, the first screen's globe the moon lands on, the
// sphere maths, the football, the collage cuts, the iris, the cookie's bites,
// the lens, the palette (no lime, nothing neon), the server's cover
// markup (deterministic, balanced, small), and the review pass's promises:
// one stage for every ball, turns that begin and end exactly on the holds
// either side, a wallpaper that never jumps, the viewfinder's 3:2 window,
// the detent's timing and blades that move from the first frame; and the
// 2026-09-28 pass's: a shorter pin, the film clock (turns played by time on
// one eased curve, holds scrubbed, never at rest mid-turn, committed and
// released with hysteresis), the chase at a slow and a brisk wheel, and
// colours that blend through OKLab without a step or a flip. The modules
// import their siblings without extensions (Vite's way), so they are
// bundled first.
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const entry = `
export * from ${JSON.stringify(fileURLToPath(new URL('../src/lib/introReel.ts', import.meta.url)))};
export { REEL_INK, paintCover, paintSphereScene, paintTurn, actClock, moonSphere, moonLight, cookieBites, holeGeometry, focusCentre, shutterCentre, stageOf, ballAt, reelFlow, finderWindow, phoneMoonTarget, facetCuts, blendCuts, facetsOf, viewFor, groundWave, GROUND_WAVE, tileStone, mixHex } from ${JSON.stringify(fileURLToPath(new URL('../src/lib/introReelPaint.ts', import.meta.url)))};
export { reelCoverMarkup } from ${JSON.stringify(fileURLToPath(new URL('../src/lib/introReelCover.ts', import.meta.url)))};
export { SvgRecorder } from ${JSON.stringify(fileURLToPath(new URL('../src/lib/introReelSvg.ts', import.meta.url)))};
`;
const bundled = await build({
  stdin: { contents: entry, resolveDir: fileURLToPath(new URL('../src/lib/', import.meta.url)), loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
});
const R = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

for (const [label, score] of [['desktop', R.REEL_DESKTOP], ['phone', R.REEL_PHONE]]) {
  test(`${label}: the score is in order and ends in the viewfinder, then the shutter`, () => {
    const beats = score.beats;
    assert.equal(beats[0].kind, 'hole');
    assert.equal(beats[0].at, 0);
    assert.equal(beats[beats.length - 1].kind, 'moon');
    // Every ball gets its hold (its turn window and room to be seen).
    for (let i = 1; i < beats.length; i += 1) assert.ok(beats[i].at - score.turn > beats[i - 1].at + 0.05, `${beats[i].kind} gets room`);
    assert.equal(new Set(beats.map((b) => b.kind)).size, beats.length, 'no sphere twice');
    const last = beats[beats.length - 1].at;
    assert.ok(score.glide[0] > last + 0.05 && score.glide[1] > score.glide[0]);
    assert.ok(score.finder[0] >= score.glide[0] && score.finder[1] <= score.glide[1] + 1e-9 && score.finder[1] > score.finder[0]);
    assert.ok(score.focus[0] >= score.glide[1] && score.focus[1] > score.focus[0]);
    assert.ok(score.focus[1] < score.rearm && score.rearm < score.fire && score.fire < 1);
    assert.ok(score.turn > 0.005 && score.turn < 0.05, 'a turn is committed by a short stretch of scroll');
  });

  test(`${label}: each sphere holds, then turns into the next, in one direction and without a jump`, () => {
    const beats = score.beats;
    let previous = { index: 0, mix: 0 };
    for (let i = 0; i <= 8000; i += 1) {
      const d = i / 8000;
      const b = R.beatAt(score, d);
      assert.ok(b.mix >= 0 && b.mix <= 1);
      assert.ok(b.index + b.mix >= previous.index + previous.mix - 1e-9, `at ${d}`);
      previous = b;
    }
    for (let k = 0; k < beats.length - 1; k += 1) {
      const from = beats[k + 1].at - score.turn;
      assert.equal(R.beatAt(score, from - 1e-6).mix, 0, `${beats[k].kind} holds up to its window`);
      assert.ok(Math.abs(R.beatAt(score, from + score.turn / 2).mix - 0.5) < 1e-6, 'linear in the film (the clock eases it)');
      assert.equal(R.beatAt(score, beats[k + 1].at).index, k + 1, `${beats[k + 1].kind} has arrived`);
    }
  });

  test(`${label}: every sphere's act clock runs from 0 at its arrival`, () => {
    score.beats.forEach((b, i) => {
      assert.ok(close(R.actClock(score, i, b.at), 0));
      const next = i + 1 < score.beats.length ? score.beats[i + 1].at : score.glide[1];
      assert.ok(R.actClock(score, i, next) >= 1 - 1e-9);
    });
  });

  test(`${label}: the shutter fires going down, fires back going up, and never flaps in the gap`, () => {
    let fired = false;
    let flips = 0;
    const sweep = (from, to, steps = 2000) => {
      for (let i = 0; i <= steps; i += 1) {
        const p = from + ((to - from) * i) / steps;
        const next = R.shutterLatch(score, fired, p);
        if (next !== fired) flips += 1;
        fired = next;
      }
    };
    sweep(0, 1);
    assert.equal(fired, true);
    assert.equal(flips, 1);
    // A reader resting on the line, Lenis settling back and forth over it.
    for (let k = 0; k < 50; k += 1) sweep(score.fire + 0.004, score.rearm + 0.002, 10);
    assert.equal(flips, 1);
    sweep(1, 0);
    assert.equal(fired, false);
    assert.equal(flips, 2);
  });
}

test('the blades close over what shows, open on the other side, and are continuous through the click', () => {
  for (const toPage of [true, false]) {
    let last = R.shutterAt(0, toPage);
    assert.equal(last.closed, 0);
    assert.equal(last.showsPage, !toPage);
    for (let e = 1; e <= R.SHUTTER_MS.close + R.SHUTTER_MS.open + 40; e += 1) {
      const f = R.shutterAt(e, toPage);
      assert.ok(Math.abs(f.closed - last.closed) < 0.03, `jump at ${e}`);
      if (f.showsPage !== last.showsPage) assert.ok(f.closed > 0.97 && last.closed > 0.97, 'the side changes only when shut');
      last = f;
    }
    assert.equal(last.done, true);
    assert.equal(last.closed, 0);
    assert.equal(last.showsPage, toPage);
  }
});

test('a click reversed halfway picks up where the blades are, on the side that shows', () => {
  for (let e = 1; e < R.SHUTTER_MS.close + R.SHUTTER_MS.open; e += 3) {
    const before = R.shutterAt(e, true);
    const after = R.shutterAt(R.reversedElapsed(e), false);
    assert.ok(Math.abs(before.closed - after.closed) < 1e-6, `closed at ${e}`);
    assert.equal(after.showsPage, before.showsPage, `side at ${e}`);
    // …and it goes on to the reel.
    assert.equal(R.shutterAt(R.reversedElapsed(e) + 2000, false).showsPage, false);
  }
});

test('the cover fit covers the viewport, centred, and maps back', () => {
  for (const [w, h] of [[1728, 1000], [1280, 800], [1024, 1366], [2560, 1080], [390, 844]]) {
    const frame = w <= R.PHONE_MAX_WIDTH ? R.FRAME_PHONE : R.FRAME_DESKTOP;
    const c = R.coverTransform(frame, w, h);
    assert.ok(frame.w * c.s >= w - 1e-9 && frame.h * c.s >= h - 1e-9);
    assert.ok(close(frame.w * c.s, w) || close(frame.h * c.s, h));
    assert.ok(close(c.ox, (w - frame.w * c.s) / 2) && close(c.oy, (h - frame.h * c.s) / 2));
    const [x, y] = R.toDesign(c, w / 2, h / 2);
    assert.ok(close(x, frame.w / 2, 1e-6) && close(y, frame.h / 2, 1e-6));
  }
});

test('the moon lands where the first screen puts the Earth (measured off the live globe)', () => {
  const measured = [
    [1280, 800, 1075.2, 744, 486.0],
    [1440, 900, 1209.6, 837, 545.8],
    [1728, 1000, 1451.5, 930, 640.5],
    [1920, 1080, 1612.8, 1004.4, 701.7],
  ];
  for (const [w, h, x, y, r] of measured) {
    const g = R.firstScreenGlobe(w, h);
    assert.ok(Math.abs(g.x - x) < 2 && Math.abs(g.y - y) < 2, `${w}×${h} centre`);
    assert.ok(Math.abs(g.r - r) / r < 0.012, `${w}×${h} radius ${g.r} vs ${r}`);
  }
  // At the end of its glide the moon is there, its limb through the focusing
  // screen's centre (so the split image has an edge to work on).
  const env = { w: 1728, h: 1000, phone: false, t: 0, p: R.REEL_DESKTOP.glide[1], a: 1 };
  const c = R.coverTransform(R.FRAME_DESKTOP, 1728, 1000);
  const g = R.firstScreenGlobe(1728, 1000);
  const target = { x: (g.x - c.ox) / c.s, y: (g.y - c.oy) / c.s, r: g.r / c.s };
  const s = R.moonSphere(env, R.REEL_DESKTOP, target);
  assert.ok(close(s.cx, target.x) && close(s.cy, target.y));
  const [fx, fy] = R.focusCentre(env);
  assert.ok(Math.abs(Math.hypot(fx - s.cx, fy - s.cy) - s.r) < 14, 'limb crosses the focus');
  assert.ok(s.r >= target.r - 1e-9 && s.r < target.r * 1.25);
});

test('rotations are rotations; runs in front are in front', () => {
  for (const [y, p, r] of [[0.3, 1.2, -0.4], [2.2, -0.7, 0.1], [0, 0, 0]]) {
    const m = R.rotation(y, p, r);
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const d = m[i * 3] * m[j * 3] + m[i * 3 + 1] * m[j * 3 + 1] + m[i * 3 + 2] * m[j * 3 + 2];
        assert.ok(close(d, i === j ? 1 : 0, 1e-9));
      }
    }
  }
  const equator = R.sphereCircle([0, 1, 0], 0, 360);
  const runs = R.visibleRuns(equator);
  const pts = runs.flat();
  assert.ok(pts.every((p) => p[2] >= -1e-9));
  const length = runs.reduce((sum, run) => sum + run.slice(1).reduce((acc, p, i) => acc + Math.hypot(p[0] - run[i][0], p[1] - run[i][1], p[2] - run[i][2]), 0), 0);
  assert.ok(Math.abs(length - Math.PI) < 0.01, `half the equator is in front (${length})`);
});

test('the football is a truncated icosahedron: 12 pentagons, 90 equal seams', () => {
  const { pentagons, seams } = R.footballGeometry();
  assert.equal(pentagons.length, 12);
  assert.ok(pentagons.every((p) => p.length === 5));
  assert.equal(seams.length, 90);
  const lengths = seams.map(([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  const first = lengths[0];
  assert.ok(lengths.every((l) => Math.abs(l - first) < 1e-9));
  assert.ok(seams.flat().every((v) => close(Math.hypot(...v), 1, 1e-9)));
});

test('collage cuts tile the frame exactly', () => {
  const cuts = R.cutsAround([864, 480], 260, 4, 211);
  const shards = R.shardsFromCuts(1728, 1000, cuts);
  assert.ok(shards.length >= 5);
  const area = shards.reduce((sum, s) => sum + Math.abs(R.polygonArea(s)), 0);
  assert.ok(Math.abs(area - 1728 * 1000) < 1e-3);
});

test('the iris covers everything outside its opening, and nothing inside it', () => {
  const cx = 864, cy = 460;
  for (const aperture of [0, 120, 600]) {
    const blades = R.irisBlades(cx, cy, aperture, 7, -0.6, 5000);
    const opening = Array.from({ length: 7 }, (_, i) => {
      const a = -0.6 + (i / 7) * Math.PI * 2;
      return [cx + Math.cos(a) * aperture, cy + Math.sin(a) * aperture];
    });
    for (let k = 0; k < 400; k += 1) {
      const pt = [cx + (Math.cos(k * 2.39996) * (k * 7)) % 1700, cy + (Math.sin(k * 2.39996) * (k * 7)) % 1000];
      const covered = blades.some((b) => R.pointInPolygon(pt, b));
      const inside = aperture > 0 && R.pointInPolygon(pt, opening);
      if (inside) assert.ok(!covered, `open at ${pt}`);
      else if (Math.hypot(pt[0] - cx, pt[1] - cy) > aperture + 1) assert.ok(covered, `covered at ${pt} (aperture ${aperture})`);
    }
  }
});

test('the cookie is bitten where the bites are, and only there', () => {
  const whole = R.cookieOutline(0, 0, 100, [], 360);
  const bitten = R.cookieOutline(0, 0, 100, [{ angle: 0, depth: 0.3, size: 0.25 }], 360);
  const radius = (p) => Math.hypot(p[0], p[1]);
  assert.ok(whole.every((p) => radius(p) > 96 && radius(p) < 104));
  assert.ok(radius(bitten[0]) < 75, 'the bite reaches in');
  assert.ok(Math.abs(radius(bitten[180]) - radius(whole[180])) < 1e-9, 'the far side is whole');
  const b0 = R.cookieBites(0), b1 = R.cookieBites(1);
  assert.equal(b0.length, 0);
  assert.equal(b1.length, 2);
});

test('the lens pushes the wallpaper out of the hole and leaves the far field alone', () => {
  for (let k = 0; k < 200; k += 1) {
    const x = 864 + Math.cos(k) * k * 5, y = 470 + Math.sin(k) * k * 5;
    const [lx, ly] = R.lensed(x, y, 864, 470, 280);
    assert.ok(Math.hypot(lx - 864, ly - 470) >= 280 - 1e-6);
  }
  const [fx, fy] = R.lensed(864 + 3000, 470, 864, 470, 280);
  assert.ok(Math.hypot(fx - 3864, fy - 470) < 30);
});

// ── Colour: the reel's own palette sits with the site ──
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const oklch = (hex) => {
  const [r, g, b] = hexRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
};

test('the palette is dusty print ink: nothing neon, and no lime (lime is the interface)', () => {
  for (const [name, hex] of Object.entries(R.REEL_INK)) {
    const [, c, h] = oklch(hex);
    assert.ok(c <= 0.13, `${name} ${hex} chroma ${c.toFixed(3)}`);
    assert.ok(!(h > 100 && h < 140 && c > 0.06), `${name} ${hex} reads lime`);
  }
  assert.equal(R.REEL_INK.olive, '#282c20');
  assert.equal(R.REEL_INK.bone, '#F4F4ED');
});

test('the server\'s cover is deterministic, balanced and small', () => {
  const a = R.reelCoverMarkup();
  const b = R.reelCoverMarkup();
  assert.equal(a, b);
  const fresh = new R.SvgRecorder('x', R.FRAME_DESKTOP);
  R.paintCover(fresh, R.FRAME_DESKTOP, false);
  const again = new R.SvgRecorder('x', R.FRAME_DESKTOP);
  R.paintCover(again, R.FRAME_DESKTOP, false);
  assert.equal(fresh.markup(), again.markup());
  assert.equal((a.match(/<svg/g) || []).length, 2);
  assert.equal((a.match(/<g /g) || []).length, (a.match(/<\/g>/g) || []).length);
  assert.ok(!/NaN|Infinity|undefined/.test(a));
  assert.ok(a.length < 70000, `cover markup is ${a.length} bytes`);
  assert.ok(a.includes('preserveAspectRatio="xMidYMid slice"'));
});

// ── The review pass ─────────────────────────────────────────────────────────

test('every ball stands on the one stage, at one size', () => {
  for (const [label, score, frame, phone] of [['desktop', R.REEL_DESKTOP, R.FRAME_DESKTOP, false], ['phone', R.REEL_PHONE, R.FRAME_PHONE, true]]) {
    const S = R.stageOf({ w: frame.w, h: frame.h, phone });
    if (!phone) assert.deepEqual([S.cx, S.cy, S.r], [864, 480, 270]);
    score.beats.forEach((b, i) => {
      if (b.kind === 'hole') return;
      for (const f of [0, 0.1, 0.2]) {
        const p = b.at + f * 0.1;
        const env = { w: frame.w, h: frame.h, phone, t: 1.3, p, a: R.actClock(score, i, p) };
        const ball = R.ballAt(b.kind, env, score);
        assert.ok(close(ball.cx, S.cx, 1e-9), `${label} ${b.kind} x`);
        assert.ok(close(ball.r, S.r, 1e-9), `${label} ${b.kind} r`);
        // The basketball bounces in place: ±0.04 of the frame's height.
        const reach = b.kind === 'basket' ? frame.h * 0.04 + 1e-6 : 1e-9;
        assert.ok(Math.abs(ball.cy - S.cy) <= reach, `${label} ${b.kind} y ${ball.cy}`);
      }
    });
  }
});

// What a frame paints, as the SVG recorder writes it, with the clip
// scaffolding (empty groups a turn opens for parts not yet drawn) taken out.
const painted = (draw) => {
  const rec = new R.SvgRecorder('t', R.FRAME_DESKTOP);
  draw(rec);
  return rec.markup().replace(/<clipPath[^>]*>.*?<\/clipPath>/g, '').replace(/<\/?g[^>]*>/g, '');
};

test('each turn on the ball begins exactly as the hold before it and ends exactly as the hold after it', () => {
  const score = R.REEL_DESKTOP;
  const frame = R.FRAME_DESKTOP;
  const onBall = new Set(['hole>basket', 'basket>football', 'football>cookie', 'cookie>light', 'light>disco', 'disco>moon']);
  let checked = 0;
  for (let i = 0; i + 1 < score.beats.length; i += 1) {
    const from = score.beats[i].kind, to = score.beats[i + 1].kind;
    if (!onBall.has(`${from}>${to}`)) continue;
    for (const p of [score.beats[i + 1].at - score.turn * 0.5]) {
      const flow = R.reelFlow(score, p, 2.2, false);
      const envA = { w: frame.w, h: frame.h, phone: false, t: 2.2, p, a: R.actClock(score, i, p), flow };
      const envB = { ...envA, a: R.actClock(score, i + 1, p) };
      // (The cookie's crack starts as the whole cookie cut in three — the
      // same picture drawn as three pieces, which differs from the hold only
      // on the crack's anti-aliased seams: 0.3% of pixels in a browser.)
      if (from !== 'cookie') {
        const holdA = painted((c) => R.paintSphereScene(c, from, envA, score, null));
        const start = painted((c) => R.paintTurn(c, from, to, envA, envB, 0, score, null));
        assert.equal(start, holdA, `${from}>${to} starts on the ${from}`);
      }
      const holdB = painted((c) => R.paintSphereScene(c, to, envB, score, null));
      const end = painted((c) => R.paintTurn(c, from, to, envA, envB, 1, score, null));
      assert.equal(end, holdB, `${from}>${to} ends on the ${to}`);
      checked += 1;
    }
  }
  assert.equal(checked, 6);
});

test('the wallpaper flows on without a jump, through the cover and every turn', () => {
  for (const [score, phone] of [[R.REEL_DESKTOP, false], [R.REEL_PHONE, true]]) {
    for (const t of [0, 1.6, 7.25]) {
      let last = R.reelFlow(score, 0, t, phone);
      for (let i = 1; i <= 4000; i += 1) {
        const f = R.reelFlow(score, i / 4000, t, phone);
        assert.ok(Math.abs(f - last) < 4, `flow jumps at p=${i / 4000}, t=${t}`);
        last = f;
      }
    }
    // Left alone on the cover, it keeps moving down the page.
    assert.ok(R.reelFlow(score, 0, 1, phone) > R.reelFlow(score, 0, 0, phone) + 30);
  }
});

test('the viewfinder is a 3:2 frame (2:3 upright on a phone) with black round it, and focuses at its centre', () => {
  for (const [w, h, phone] of [[1728, 1000, false], [1280, 800, false], [2560, 1080, false], [390, 844, true]]) {
    const frame = phone ? R.FRAME_PHONE : R.FRAME_DESKTOP;
    const view = R.viewFor(R.coverTransform(frame, w, h), w, h);
    const env = { w: frame.w, h: frame.h, phone, t: 0, p: 1, a: 1, view };
    const win = R.finderWindow(env, 1);
    const ww = win.x1 - win.x0, hh = win.y1 - win.y0;
    const vw = view.x1 - view.x0, vh = view.y1 - view.y0;
    assert.ok(close(ww / hh, phone ? 2 / 3 : 3 / 2, 1e-9), `${w}×${h} aspect`);
    assert.ok(win.x0 - view.x0 >= vw * 0.05 - 1e-6 && view.x1 - win.x1 >= vw * 0.05 - 1e-6, `${w}×${h} sides`);
    assert.ok(view.y1 - win.y1 >= vh * 0.12 - 1e-6, `${w}×${h} meter strip`);
    const [fx, fy] = R.focusCentre(env);
    assert.ok(close(fx, (win.x0 + win.x1) / 2) && close(fy, (win.y0 + win.y1) / 2));
    // Not in yet, the window is the whole view.
    const open = R.finderWindow(env, 0);
    assert.ok(close(open.x0, view.x0) && close(open.y1, view.y1));
  }
});

test('on a phone the moon settles low on the right, its limb through the focusing screen', () => {
  const frame = R.FRAME_PHONE;
  const view = R.viewFor(R.coverTransform(frame, 390, 844), 390, 844);
  const env = { w: frame.w, h: frame.h, phone: true, t: 0, p: R.REEL_PHONE.glide[1], a: 1, view };
  const target = R.phoneMoonTarget(env);
  const s = R.moonSphere(env, R.REEL_PHONE, target);
  const [fx, fy] = R.focusCentre(env);
  assert.ok(Math.abs(Math.hypot(fx - s.cx, fy - s.cy) - s.r) < 6, 'limb through the focus');
  assert.ok(s.cx > fx && s.cy > fy, 'low on the right');
});

test('the facets are four cuts round the ball, and keep their codes as they turn from one set to another', () => {
  const env = { w: 1728, h: 1000, phone: false };
  const a = R.facetCuts('basket', env), b = R.facetCuts('football', env);
  assert.equal(a.length, 4);
  const codes = (cuts) => new Set(R.facetsOf(env, cuts).map((f) => f.code));
  const start = codes(R.blendCuts(a, b, 0)), end = codes(R.blendCuts(a, b, 1));
  assert.deepEqual([...start].sort(), [...codes(a)].sort());
  assert.deepEqual([...end].sort(), [...codes(b)].sort());
  for (const t of [0.25, 0.5, 0.75]) {
    const area = R.facetsOf(env, R.blendCuts(a, b, t)).reduce((sum, f) => sum + Math.abs(R.polygonArea(f.poly)), 0);
    assert.ok(area >= 1728 * 1000 - 1e-3, 'the planes still cover the frame');
  }
});

test('the detent: the page arrives as the blades finish, holds, and the blades move from the first frame', () => {
  assert.ok(close(R.DETENT_S * 1000, R.SHUTTER_MS.close + R.SHUTTER_MS.open, 1e-9));
  assert.ok(R.DETENT_HOLD_MS >= 300 && R.DETENT_HOLD_MS <= 600);
  assert.ok(R.detentEase(0) === 0 && close(R.detentEase(1), 1));
  // Quadratic in: already moving one frame after the release.
  assert.ok(R.shutterAt(16, true).closed > 0.005);
  // The latch leaves room for the detent before the pin ends.
  for (const score of [R.REEL_DESKTOP, R.REEL_PHONE]) {
    assert.ok(score.fire <= 0.98 && score.fire - score.rearm >= 0.015);
    assert.ok(score.finder[1] < score.focus[1] && score.focus[1] < score.rearm);
  }
});

// ── Quicker, and turns played by the film's own clock (2026-09-28) ──────────

test('pacing: the pin is shorter and every ball still holds long enough to be seen', () => {
  assert.ok(R.REEL_DESKTOP.screens >= 3.6 && R.REEL_DESKTOP.screens <= 4.2, `desktop ${R.REEL_DESKTOP.screens} screens`);
  assert.ok(R.REEL_PHONE.screens >= 2.2 && R.REEL_PHONE.screens <= 2.6, `phone ${R.REEL_PHONE.screens} screens`);
  for (const [label, score, least] of [['desktop', R.REEL_DESKTOP, 0.35], ['phone', R.REEL_PHONE, 0.25]]) {
    assert.ok(score.turnSeconds >= 0.4 && score.turnSeconds <= 0.7, `${label} turn ${score.turnSeconds}s`);
    assert.ok(score.glideSeconds >= 0.6 && score.glideSeconds <= 1, `${label} glide ${score.glideSeconds}s`);
    // However hard the wheel is spun, a turn is a turn, not a cut.
    assert.ok(score.turnSeconds / R.REEL_CHASE.fastest >= 0.25, `${label} fastest turn ${score.turnSeconds / R.REEL_CHASE.fastest}s`);
    // A ball's hold, in screens of scroll (the cover is where the reader
    // starts, at rest; the moon's runs to its glide).
    for (let k = 1; k < score.beats.length; k += 1) {
      const end = k + 1 < score.beats.length ? score.beats[k + 1].at - score.turn : score.glide[0];
      const screens = (end - score.beats[k].at) * score.screens;
      assert.ok(screens >= least, `${label} ${score.beats[k].kind} holds ${screens.toFixed(2)} screens`);
    }
  }
});

test('the film clock: holds cost little, each turn costs its seconds, and it inverts exactly', () => {
  for (const score of [R.REEL_DESKTOP, R.REEL_PHONE]) {
    const windows = R.reelWindows(score);
    assert.equal(windows.length, score.beats.length);
    for (const w of windows) {
      const spent = R.filmClock(score, w.to) - R.filmClock(score, w.from);
      assert.ok(close(spent, w.seconds, 1e-9), 'a window runs its seconds');
    }
    let last = -1;
    for (let i = 0; i <= 5000; i += 1) {
      const d = i / 5000;
      const tau = R.filmClock(score, d);
      assert.ok(tau >= last - 1e-12, 'monotone');
      last = tau;
      assert.ok(Math.abs(R.filmAt(score, tau) - d) < 1e-7, `inverts at ${d}`);
    }
    // Inside a window the film sets off from rest and lands at rest (the
    // ease), whatever the clock's speed; across its edges it is continuous.
    for (const w of windows) {
      const t0 = R.filmClock(score, w.from), t1 = R.filmClock(score, w.to), h = 1e-4;
      const startSpeed = (R.filmAt(score, t0 + h) - R.filmAt(score, t0)) / h;
      const endSpeed = (R.filmAt(score, t1) - R.filmAt(score, t1 - h)) / h;
      const midSpeed = (R.filmAt(score, (t0 + t1) / 2 + h) - R.filmAt(score, (t0 + t1) / 2)) / h;
      assert.ok(startSpeed < midSpeed * 0.01 && endSpeed < midSpeed * 0.01, 'eased at both ends');
      assert.ok(Math.abs(R.filmAt(score, t1 + 1e-9) - w.to) < 1e-6 && Math.abs(R.filmAt(score, t0 - 1e-9) - w.from) < 1e-6);
    }
  }
});

test('at rest the film is always a whole ball: the target never stops inside a turn', () => {
  for (const score of [R.REEL_DESKTOP, R.REEL_PHONE]) {
    const windows = R.reelWindows(score);
    for (const previous of [0, 0.5, 1]) {
      for (let i = 0; i <= 4000; i += 1) {
        const p = i / 4000;
        const t = R.filmTarget(score, p, previous);
        assert.ok(!windows.some((w) => t > w.from + 1e-9 && t < w.to - 1e-9), `rest inside a turn at ${p}`);
        if (!windows.some((w) => p > w.from && p < w.to)) assert.equal(t, p, 'a hold follows the scroll');
      }
    }
  }
});

test('a turn commits past half its window, releases under a third, and never flaps between', () => {
  const score = R.REEL_DESKTOP;
  const w = R.reelWindows(score)[1];
  const at = (f) => w.from + (w.to - w.from) * f;
  let target = at(0) - 0.01;
  const walk = (fs) => {
    for (const f of fs) target = R.filmTarget(score, at(f), target);
  };
  walk([0, 0.1, 0.2, 0.3, 0.4, 0.45]);
  assert.equal(target, w.from, 'not yet');
  walk([0.52]);
  assert.equal(target, w.to, 'committed');
  // Resting in the band, the reader's scroll settling back and forth.
  for (let k = 0; k < 40; k += 1) walk([0.35, 0.49, 0.32, 0.45]);
  assert.equal(target, w.to, 'no flapping');
  walk([0.28]);
  assert.equal(target, w.from, 'released');
  for (let k = 0; k < 40; k += 1) walk([0.31, 0.49, 0.4]);
  assert.equal(target, w.from, 'no flapping back');
});

// A reader's scroll through Lenis (lerp 0.085 per 60 Hz frame) at a steady
// pace, then at rest; the film clock chases it as IntroReel does.
function ride(score, pinnedPx, plan, seconds = 14) {
  const dt = 1 / 60;
  let goal = 0, y = 0, target = 0;
  let chase = { tau: 0, v: 0 };
  const frames = [];
  for (let i = 0; i * dt < seconds; i += 1) {
    const t = i * dt;
    goal = plan(t, goal);
    y += (goal - y) * 0.085;
    const p = R.reelProgressAt(y, pinnedPx);
    target = R.filmTarget(score, p, target);
    const goalTau = R.filmClock(score, target);
    chase = R.chaseFilm(chase, goalTau, dt);
    const film = R.filmAt(score, chase.tau);
    const beat = R.beatAt(score, film);
    frames.push({ t, p, film, pos: beat.index + beat.mix, beat, settled: R.filmSettled(chase, goalTau) });
  }
  return frames;
}
// Time from a turn leaving its ball to landing on the next.
const turnSpans = (frames) => {
  const spans = [];
  let start = null;
  for (const f of frames) {
    const moving = f.beat.mix > 0.001 && f.beat.mix < 0.999;
    if (moving && start === null) start = f.t;
    if (!moving && start !== null) {
      spans.push(f.t - start);
      start = null;
    }
  }
  return spans;
};

test('the chase: at a slow pace every turn plays for about half a second, on one curve', () => {
  const score = R.REEL_DESKTOP;
  const pinned = score.screens * 1000;
  const frames = ride(score, pinned, (t, g) => Math.min(pinned * 1.02, g + 360 / 60));
  const spans = turnSpans(frames);
  assert.ok(spans.length >= score.beats.length - 1, `${spans.length} turns`);
  for (const s of spans.slice(0, score.beats.length - 1)) assert.ok(s >= 0.42 && s <= 0.75, `turn ${s.toFixed(3)}s`);
  // Never a jump: the film moves at most a small step a frame.
  for (let i = 1; i < frames.length; i += 1) assert.ok(Math.abs(frames[i].pos - frames[i - 1].pos) < 0.06, `step at ${frames[i].t.toFixed(2)}s`);
});

test('the chase: at a brisk wheel the film keeps up, and has glided in by the time the shutter may fire', () => {
  const score = R.REEL_DESKTOP;
  const pinned = score.screens * 1000;
  const frames = ride(score, pinned, (t, g) => Math.min(pinned * 1.05, g + 1430 / 60), 8);
  const fire = frames.find((f) => f.p >= score.fire);
  assert.ok(fire, 'reaches the shutter');
  const ready = frames.find((f) => f.t >= fire.t && f.film >= score.glide[1] - 1e-3);
  assert.ok(ready && ready.t - fire.t <= R.SHUTTER_WAIT_MS / 1000, `film ready ${ready ? (ready.t - fire.t).toFixed(3) : 'never'}s after the latch`);
  // Faster, but still turns, not cuts: no turn in under a fifth of a second.
  for (const s of turnSpans(frames)) assert.ok(s >= 0.2, `turn ${s.toFixed(3)}s`);
  // (At the fastest the chase runs twice real time: a 0.25 s turn's eased
  // peak is 1.5 / 0.25 s, a tenth of a turn a frame.)
  for (let i = 1; i < frames.length; i += 1) assert.ok(Math.abs(frames[i].pos - frames[i - 1].pos) < 0.13, `step at ${frames[i].t.toFixed(2)}s`);
});

test('the chase: a reader who stops mid-turn sees it land; one who turns back sees it played back', () => {
  const score = R.REEL_DESKTOP;
  const pinned = score.screens * 1000;
  const w = R.reelWindows(score)[2];
  // Scroll to just past the commit point and stop.
  const stopAt = (w.from + (w.to - w.from) * 0.6) * pinned;
  let frames = ride(score, pinned, (t, g) => Math.min(stopAt, g + 700 / 60), 5);
  let last = frames[frames.length - 1];
  assert.ok(last.settled && last.beat.mix === 0 && last.beat.index === w.index + 1, 'landed on the next ball');
  // Now scroll back up out of the window during the turn.
  const backTo = (w.from - 0.01) * pinned;
  frames = ride(score, pinned, (t, g) => (t < 0.9 ? Math.min(stopAt, g + 1400 / 60) : Math.max(backTo, g - 1400 / 60)), 5);
  last = frames[frames.length - 1];
  assert.ok(last.settled && last.beat.mix === 0 && last.beat.index === w.index, 'back on the ball it left');
  for (let i = 1; i < frames.length; i += 1) assert.ok(Math.abs(frames[i].pos - frames[i - 1].pos) < 0.08, 'no jump on the way back');
});

// OKLab distance (from the test's own conversion above).
const oklab = (hex) => {
  const [L, C, h] = oklch(hex);
  return [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
};
const dE = (a, b) => {
  const x = oklab(a), y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

test('colour: blends run through OKLab, exact at both ends, and no colour steps by more than a sliver', () => {
  const inks = Object.values(R.REEL_INK).map((c) => c.toLowerCase());
  let worstStep = 0;
  for (const a of inks) {
    for (const b of inks) {
      if (a === b) continue;
      assert.equal(R.mixOklab(a, b, 0), a);
      assert.equal(R.mixOklab(a, b, 1), b);
      const whole = dE(a, b);
      let prev = a;
      for (let q = 1; q <= R.MIX_STEPS; q += 1) {
        const c = R.mixOklab(a, b, q / R.MIX_STEPS);
        const step = dE(prev, c);
        worstStep = Math.max(worstStep, step);
        assert.ok(step <= whole / R.MIX_STEPS + 0.006, `${a}→${b} step ${step.toFixed(4)} of ${whole.toFixed(3)}`);
        prev = c;
      }
    }
  }
  assert.ok(worstStep < 0.02, `worst quantised step ${worstStep}`);
});

test('colour: through a turn at full speed no lozenge or tile changes by more than a tenth of ΔE a frame (it used to flip whole)', () => {
  // The fastest a turn plays from rest: a cubic ease over turnSeconds, 60 Hz.
  const T = R.REEL_DESKTOP.turnSeconds;
  const mixAt = (t) => { const v = Math.min(1, Math.max(0, t / T)); return v * v * (3 - 2 * v); };
  const inks = Object.values(R.REEL_INK).map((c) => c.toLowerCase());
  const pairs = inks.flatMap((x) => inks.map((y) => [x, y]));
  const [a, b] = pairs.reduce((best, pair) => (dE(pair[0], pair[1]) > dE(best[0], best[1]) ? pair : best));
  let worst = 0;
  for (const lead of [0, 0.25, 0.5, 0.75, 1]) {
    let prevGround = a, prevTile = a;
    for (let i = 1; i <= Math.ceil(60 * T) + 1; i += 1) {
      const mix = mixAt(i / 60);
      const ground = R.mixHex(a, b, R.groundWave(mix, lead));
      const tile = R.mixHex(a, b, Math.round(R.tileStone({ mid: [lead - 0.5, 0.1, 0.8], sparkle: lead }, mix) * 16) / 16);
      worst = Math.max(worst, dE(prevGround, ground));
      assert.ok(dE(prevGround, ground) < 0.1, `lozenge ${a}→${b} lead ${lead} frame ${i}: ${dE(prevGround, ground).toFixed(3)}`);
      assert.ok(dE(prevTile, tile) < 0.16, `tile frame ${i}`);
      prevGround = ground;
      prevTile = tile;
    }
    assert.equal(prevGround, b, 'lands on the new colour');
  }
  assert.ok(dE(a, b) > 0.5 && worst < dE(a, b) / 5, `worst ${worst.toFixed(3)} of ${dE(a, b).toFixed(3)}`);
  // The wave starts at 0 and ends at 1 for every lozenge.
  for (const lead of [0, 0.5, 1]) assert.ok(R.groundWave(0, lead) === 0 && R.groundWave(1, lead) === 1);
});
