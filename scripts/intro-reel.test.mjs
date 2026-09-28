// Run offline: node --experimental-strip-types --test scripts/intro-reel.test.mjs
//
// The opening reel (src/lib/introReel.ts, src/lib/introReelPaint.ts,
// src/lib/introReelCover.ts): its score (every sphere gets its hold and its
// turn, the viewfinder comes after the last, the shutter fires once and
// fires back only past a gap), the shutter's blades (continuous through a
// click and through a click reversed halfway), the cover fit the server's SVG
// and the canvas share, the first screen's globe the moon lands on, the
// sphere maths, the football, the collage cuts, the iris, the cookie's bites,
// the lens, the palette (no lime, nothing neon) and the server's cover
// markup (deterministic, balanced, small). The modules import their siblings
// without extensions (Vite's way), so they are bundled first.
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const entry = `
export * from ${JSON.stringify(fileURLToPath(new URL('../src/lib/introReel.ts', import.meta.url)))};
export { REEL_INK, paintCover, paintSphereScene, actClock, moonSphere, moonLight, cookieBites, holeGeometry, focusCentre, shutterCentre } from ${JSON.stringify(fileURLToPath(new URL('../src/lib/introReelPaint.ts', import.meta.url)))};
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
    for (let i = 1; i < beats.length; i += 1) assert.ok(beats[i].at > beats[i - 1].at + 0.08, `${beats[i].kind} gets room`);
    assert.equal(new Set(beats.map((b) => b.kind)).size, beats.length, 'no sphere twice');
    const last = beats[beats.length - 1].at;
    assert.ok(score.glide[0] > last && score.glide[1] > score.glide[0]);
    assert.ok(score.finder[0] >= score.glide[0] && score.finder[1] > score.finder[0]);
    assert.ok(score.focus[0] >= score.finder[0] && score.focus[1] > score.focus[0]);
    assert.ok(score.focus[1] < score.rearm && score.rearm < score.fire && score.fire < 1);
    assert.ok(score.hold > 0.2 && score.hold < 0.7);
    assert.ok(score.screens > 2 && score.screens < 9);
  });

  test(`${label}: each sphere holds, then turns into the next, smoothly and in one direction`, () => {
    const beats = score.beats;
    let previous = { index: 0, mix: 0 };
    for (let i = 0; i <= 4000; i += 1) {
      const p = i / 4000;
      const b = R.beatAt(score, p);
      assert.ok(b.mix >= 0 && b.mix <= 1);
      // Position along the whole reel never runs backwards.
      assert.ok(b.index + b.mix >= previous.index + previous.mix - 1e-9, `at ${p}`);
      // …and never jumps by more than a small step.
      assert.ok(b.index + b.mix - (previous.index + previous.mix) < 0.02, `jump at ${p}`);
      previous = b;
    }
    for (let k = 0; k < beats.length - 1; k += 1) {
      const span = beats[k + 1].at - beats[k].at;
      const holdEnd = beats[k].at + span * score.hold;
      assert.equal(R.beatAt(score, beats[k].at + span * score.hold * 0.99).mix, 0, `${beats[k].kind} holds`);
      assert.ok(R.beatAt(score, beats[k + 1].at - 1e-9).mix > 0.999, `${beats[k].kind} has turned`);
      assert.ok(R.beatAt(score, (holdEnd + beats[k + 1].at) / 2).mix > 0.2);
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
