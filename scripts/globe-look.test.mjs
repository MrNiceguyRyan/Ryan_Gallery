// Run offline: node --experimental-strip-types --test scripts/globe-look.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FIRST_SCREEN_LIGHT,
  PLANET_LIGHT,
  SILVER_FLOOR,
  SILVER_RAMP,
  createGlobeChannel,
  globeLookAt,
  silverFloorAt,
  silverPaint,
  silverRamp,
  STOCK_PAINT,
} from '../src/lib/globeLook.ts';

test('the first screen\'s corner globe and its turn are gone: the globe rises facing stop 01', async () => {
  // The globe left the first screen (2026-09-28: the entrance's opening
  // words and boarding pass are there); the torn pass brings it up already
  // facing stop 01. Nothing of the corner globe's turn (India's face turned
  // ~195° west to the Americas), its drift or its graticule is left.
  const look = await import('../src/lib/globeLook.ts');
  for (const name of ['prologueTurnRemaining', 'prologueNaturalLongitude', 'prologueGlide', 'prologueRoll', 'PROLOGUE_TURN', 'globeGraticule']) {
    assert.equal(name in look, false, name);
  }
});

test('the key light and the ambient floor follow the measured schedule', () => {
  const near = (actual, expected, tolerance = 0.006) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
  const rest = globeLookAt(0);
  near(rest.azimuth, 150); near(rest.theta, 72); near(rest.ambient, 0.14); near(rest.nightTint, 0.55);
  assert.equal(rest.floor, 0);
  assert.equal(globeLookAt(0, 0).theta, 128);
  const early = globeLookAt(0.2);
  assert.equal(early.floor, 0.36);
  near(early.ambient, 0.198); near(early.nightTint, 0.5, 0.01);
  // The floor's end lifts the unlit side to 0.3 (the mid-prologue Pacific
  // read darker than the page at 0.24).
  near(globeLookAt(0.42).ambient, 0.3);
  near(globeLookAt(0.25).floor, 0.72, 0.001);
  const mid = globeLookAt(0.42);
  assert.equal(mid.floor, 1);
  near(mid.azimuth, 150);
  const index = globeLookAt(0.9);
  near(index.azimuth, 118); near(index.theta, 34); near(index.ambient, 0.34); near(index.nightTint, 0.25);
  // The globe the pass brings up is drawn at q = 1: the light swung round
  // onto the places, the floor lifted.
  const planet = globeLookAt(1);
  near(planet.azimuth, 118); near(planet.theta, 34);
  assert.equal(planet.floor, 1);
  assert.equal('graticule' in planet, false);
});

test('the first screen keeps the approved light, and eases to the under-way light across the floor lift', () => {
  const rest = globeLookAt(0);
  assert.deepEqual(
    [rest.spec, rest.specPower, rest.haze, rest.hazeWidth, rest.glow],
    [FIRST_SCREEN_LIGHT.spec, FIRST_SCREEN_LIGHT.specPower, FIRST_SCREEN_LIGHT.haze, FIRST_SCREEN_LIGHT.hazeWidth, FIRST_SCREEN_LIGHT.glow],
  );
  assert.deepEqual(globeLookAt(0.11).haze, FIRST_SCREEN_LIGHT.haze);
  const underway = globeLookAt(0.32);
  [underway.spec, underway.specPower, underway.haze, underway.hazeWidth, underway.glow].forEach((value, index) => {
    const want = [PLANET_LIGHT.spec, PLANET_LIGHT.specPower, PLANET_LIGHT.haze, PLANET_LIGHT.hazeWidth, PLANET_LIGHT.glow][index];
    assert.ok(Math.abs(value - want) < 1e-9, `${index}: ${value} vs ${want}`);
  });
  // Quieter under way since the review of 2026-09-28 (the lit limb swept
  // across the view by the entry's turn).
  assert.ok(PLANET_LIGHT.glow <= 0.14 && PLANET_LIGHT.haze <= 0.04);
  // Monotonic in between: no pulse.
  let previous = Infinity;
  for (let q = 0; q <= 0.4; q += 0.005) {
    const { glow } = globeLookAt(q);
    assert.ok(glow <= previous + 1e-12);
    previous = glow;
  }
  // The swing still halves the glint by the time the planet has glided in.
  assert.ok(Math.abs(globeLookAt(0.9).spec - PLANET_LIGHT.spec * 0.5) < 1e-9);
});

test('the silver ramp lifts only its four darkest stops, in 25 steps, and caps the highlights', () => {
  const stops = (ramp) => ramp.slice(3).filter((_, index) => index % 2 === 1);
  const base = stops(silverRamp(0));
  assert.deepEqual(base, SILVER_RAMP.map(([, color]) => color));
  // Capped a step below paper since the review of 2026-09-28 (晃眼 on
  // arrival): the disc's p99 was 224/255.
  assert.equal(base.at(-1), '#c6c2b2');
  const lifted = stops(silverRamp(1));
  assert.deepEqual(lifted.slice(0, 4), SILVER_FLOOR);
  assert.deepEqual(lifted.slice(4), base.slice(4));
  const values = new Set();
  for (let q = 0; q <= 1; q += 0.0005) values.add(silverFloorAt(q));
  assert.ok(values.size <= 26);
  assert.equal(silverFloorAt(0.12), 0);
  assert.equal(silverFloorAt(0.32), 1);
  // Stock paint resets the colour mapping and restores the archive's grade —
  // lifted 2026-09-28 (the owner found the chapters' ground too dark), then
  // calmed the same day (有点晃眼): a quieter colour and contrast, the whites
  // capped short of paper, the floor kept above black; the silver print puts
  // its own floor back. Measured at every place's rest, the map's mean luma
  // went 86 → 63 (the target band 60–65), its 99th percentile 149 → 110.
  // The archive's paint is its own layer's for good (RouteAtlas,
  // SATELLITE_STOCK_LAYER): no colour mapping on it to reset.
  const stock = STOCK_PAINT;
  assert.equal('raster-color' in stock, false);
  assert.equal(stock['raster-saturation'], -0.4);
  assert.equal(stock['raster-contrast'], -0.35);
  assert.ok(stock['raster-brightness-min'] > 0 && stock['raster-brightness-min'] <= 0.15);
  assert.ok(stock['raster-brightness-max'] <= 0.8, 'no blown highlight');
  assert.equal(silverPaint(0)['raster-brightness-min'], 0);
});

test('channel and wiring', () => {
  const channel = createGlobeChannel();
  assert.equal(channel.revealed, false);
  // The globe rises already lit: the dawn at its end, no veil on the night
  // side, and nothing (no egg) to hover it.
  assert.equal(channel.dawn, 1);
  assert.equal(channel.veil, 0);
  assert.equal(channel.hover, 0);
  assert.equal('compose' in channel, false);
  const source = readFileSync(new URL('../src/components/home/RouteAtlas.tsx', import.meta.url), 'utf8');
  // mapbox-gl 3 has no pixelRatio option: the prop was a no-op and is gone.
  assert.doesNotMatch(source, /pixelRatio=\{/);
  assert.doesNotMatch(source, /introSpin|introZoom/);
  // The canvas is held until the reveal (the pass torn, the tiles in); the
  // camera stays the only writer, and it draws the look at the planet's own.
  assert.match(source, /opacity: globeRevealed \? 1 : 0/);
  assert.match(source, /if \(holdRevealRef\.current\) \{/);
  assert.match(source, /const floor = silverFloorAt\(1\);/);
  assert.doesNotMatch(source, /GlobeEggs|createEggExposure|prologue-graticule|lifeActive|globeIntro/);
});

test('the archive stays on the globe (owner decision, 2026-09-25)', () => {
  const source = readFileSync(new URL('../src/components/home/RouteAtlas.tsx', import.meta.url), 'utf8');
  // Nothing swaps to Mercator: every swap reloaded every tile (a flat olive
  // frame) and needed the dive to overshoot to zoom 6.05 and back.
  assert.doesNotMatch(source, /setProjection\(\s*['"]mercator['"]/);
  // The dive descends straight to the nearest rest zoom: its zoom only rises.
  assert.match(source, /const GLOBE_HANDOFF_ZOOM = HOP\.restZoom;/);
  // The veil and the light's fade share one rate-limited zoom (a fast dive
  // stepped the whole map 6.5 L in one frame at zoom 3.6).
  assert.match(source, /zoom: globeWritesRef\.current\.fadeZoom/);
  // Written as plain numbers (see satelliteOpacityAt): the print below, the
  // archive's paint over it across the silver's exit.
  assert.match(source, /map\.setPaintProperty\('prologue-satellite', 'raster-opacity', base\)/);
  assert.match(source, /map\.setPaintProperty\(SATELLITE_STOCK_LAYER, 'raster-opacity', over\)/);
});
