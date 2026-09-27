// Run offline: node --experimental-strip-types --test scripts/egg-exposure.test.mjs
//
// The globe eggs' photograph (src/lib/eggExposure.ts): the perspective
// sphere the shutter smears on, the sample budget, the burn that lays his
// places down as light without beads, the film toe that keeps a fast crossing
// from leaving a line, the dodge's pool and the print's crop. The module
// imports its siblings without extensions (Vite's way), so it is bundled
// first.
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/eggExposure.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  external: ['mapbox-gl'],
});
const { toSphere, toScreen, samplesFor, burnWeight, burnTone, dodgeWeight, printCrop, landingTiles } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

test('the sphere round-trips at the first screen\'s depth, and the limb is at 1', () => {
  const D = 2.685;
  for (let sx = -0.99; sx <= 0.99; sx += 0.07) {
    for (let sy = -0.99; sy <= 0.99; sy += 0.07) {
      if (sx * sx + sy * sy >= 0.995) continue;
      const P = toSphere(sx, sy, D);
      assert.ok(P, `${sx},${sy} is on the disc`);
      assert.ok(Math.abs(Math.hypot(...P) - 1) < 1e-9, 'on the unit sphere');
      assert.ok(P[2] * D > 1 - 1e-9, 'facing the camera');
      const [x, y] = toScreen(P, D);
      assert.ok(Math.abs(x - sx) <= 1e-4 && Math.abs(y - sy) <= 1e-4, `${sx},${sy} → ${x},${y}`);
    }
  }
  assert.equal(toSphere(1.01, 0, D), null, 'off the disc');
  // The centre looks straight at the sphere's near pole.
  assert.deepEqual(toSphere(0, 0, D), [0, 0, 1]);
});

test('the smear takes a sample every ~2.2px, 2 to 48', () => {
  assert.equal(samplesFor(0.01, 641), 2);
  assert.equal(samplesFor(26, 641), 48);
  const r = 641;
  const n = samplesFor(4, r);
  assert.equal(n, Math.ceil((r * 4 * Math.PI) / 180 / 2.2));
  for (let degrees = 0; degrees <= 30; degrees += 0.5) {
    const count = samplesFor(degrees, r);
    assert.ok(count >= 2 && count <= 48);
  }
});

test('the burn tiles: two halves crossed in half the time each lay the whole', () => {
  const a = [100, 100];
  const b = [160, 130];
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (const sigma of [0.9, 10, 24]) {
    for (let px = 60; px <= 200; px += 7) {
      for (let py = 70; py <= 170; py += 9) {
        const whole = burnWeight([px, py], a, b, sigma);
        const halves = 0.5 * burnWeight([px, py], a, m, sigma) + 0.5 * burnWeight([px, py], m, b, sigma);
        assert.ok(Math.abs(whole - halves) < 1e-3 * Math.max(1, whole), `σ ${sigma} at ${px},${py}: ${whole} vs ${halves}`);
      }
    }
  }
  // A place that sat still lays a plain gaussian, its peak 1/(√(2π)σ).
  const still = burnWeight([50, 50], [50, 50], [50, 50], 10);
  assert.ok(Math.abs(still - 1 / (Math.sqrt(2 * Math.PI) * 10)) < 1e-6);
});

test('the film toe: nothing below it, a soft shoulder above', () => {
  assert.deepEqual(burnTone(0, 0, 0), { core: 0, halo: 0, bloom: 0, light: 0 });
  const toe = burnTone(1.4, 0.25, 0.49);
  assert.equal(toe.light, 0, 'at each toe exactly: still nothing');
  const lit = burnTone(20, 20, 20);
  assert.ok(lit.core > 0.99 && lit.halo < 0.75 + 1e-9 && lit.bloom < 0.18 + 1e-9);
  assert.ok(lit.light <= 1);
  // Monotonic in the light laid down.
  let previous = -1;
  for (let e = 0; e <= 12; e += 0.25) {
    const { light } = burnTone(e, e, e);
    assert.ok(light >= previous - 1e-12);
    previous = light;
  }
});

test('the dodge is a gaussian pool on the sphere', () => {
  assert.equal(dodgeWeight(0, 3), 1);
  assert.ok(Math.abs(dodgeWeight(3, 3) - Math.exp(-0.5)) < 1e-12);
  assert.ok(dodgeWeight(12, 3) < 0.001, 'four σ out it has let go');
  assert.ok(dodgeWeight(10, 10) > dodgeWeight(10, 3), 'the wide pool reaches further');
});

test('the print is cropped on the place at 1.31, inside the disc\'s box', () => {
  const box = { x0: 800, y0: 300, x1: 1792, y1: 1064 };
  const centred = printCrop({ x: 1300, y: 600 }, 641, box);
  assert.ok(Math.abs(centred.w / centred.h - 76 / 58) < 0.02);
  assert.ok(Math.abs(centred.x + centred.w / 2 - 1300) < 1e-9 && Math.abs(centred.y + centred.h / 2 - 600) < 1e-9);
  const edge = printCrop({ x: 1780, y: 320 }, 641, box);
  assert.ok(edge.x >= box.x0 && edge.x + edge.w <= box.x1 + 1e-9 && edge.y >= box.y0 && edge.y + edge.h <= box.y1 + 1e-9);
  const small = printCrop({ x: 50, y: 50 }, 641, { x0: 0, y0: 0, x1: 200, y1: 120 });
  assert.ok(small.w <= 200 + 1e-9 && small.h <= 120 + 1e-9 && Math.abs(small.w / small.h - 0.9 / 0.69) < 1e-9);
});

test('the warm-up takes the z4 tiles every landing is drawn from', () => {
  const places = [[-80.19, 25.76], [-81.38, 28.54], [-111.46, 36.91], [-113.03, 37.3], [-112.19, 37.59], [-74.01, 40.71]];
  const tiles = landingTiles(places);
  assert.equal(tiles.length, 15, tiles.join(' '));
  // The tile under each place, and its neighbours (the continental US).
  for (const tile of ['4/4/6', '4/3/6', '4/2/6', '4/1/5', '4/5/7']) assert.ok(tiles.includes(tile), tile);
  // Wraps across the antimeridian.
  assert.ok(landingTiles([[179, 0]]).includes('4/0/8'));
});
