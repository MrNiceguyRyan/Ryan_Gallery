// Run offline: node --experimental-strip-types --test scripts/globe-look.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FIRST_SCREEN_LIGHT,
  PLANET_LIGHT,
  PLANET_PAINT,
  SILVER_FOG,
  createGlobeChannel,
  globeLookAt,
  silverFloorAt,
  STOCK_PAINT,
  WATER_TINT,
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
  // Where the swing lands, brighter since 2026-09-29 (有点灰灰的): the far
  // side at 0.6 of the lit one, the night laid over it at 0.12.
  near(index.azimuth, 118); near(index.theta, 34); near(index.ambient, 0.6); near(index.nightTint, 0.12);
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

test('the planet is a photograph of itself, bright and in its own colour (owner, 2026-09-29)', () => {
  // 整个地球的模型有点丑…有点灰灰的，我想要精致和明亮一点: no silver print, no
  // grey lift. One grade from the planet the page brings up to the reader's
  // map (nothing changes colour on the way down).
  const look = PLANET_PAINT;
  assert.deepEqual(STOCK_PAINT, PLANET_PAINT);
  for (const key of ['raster-color', 'raster-color-mix', 'raster-color-range']) assert.equal(key in look, false, key);
  // Its own colour, never washed out; a little contrast, never flattened.
  assert.ok(look['raster-saturation'] >= 0 && look['raster-saturation'] <= 0.15);
  assert.ok(look['raster-contrast'] > 0 && look['raster-contrast'] <= 0.15);
  // The floor only just lifted (it was 0.15: a grey veil over the sea), the
  // whites allowed (they were capped at 0.58), short of paper.
  assert.ok(look['raster-brightness-min'] <= 0.06);
  assert.ok(look['raster-brightness-max'] >= 0.9 && look['raster-brightness-max'] < 1);
  // A hair warmer: the hue turns a few degrees at most.
  assert.ok(Math.abs(look['raster-hue-rotate']) <= 10);
  // The seas: a clear blue-green over the water only, well short of opaque.
  assert.match(WATER_TINT.color, /^#[0-9a-f]{6}$/i);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(WATER_TINT.color.slice(i, i + 2), 16));
  assert.ok(g > r && b > r, 'blue-green');
  assert.ok(WATER_TINT.opacity > 0.15 && WATER_TINT.opacity <= 0.45);
  // The light's floor still lifts in 25 steps across FLOOR_Q.
  const values = new Set();
  for (let q = 0; q <= 1; q += 0.0005) values.add(silverFloorAt(q));
  assert.ok(values.size <= 26);
  assert.equal(silverFloorAt(0.12), 0);
  assert.equal(silverFloorAt(0.32), 1);
  // A thin atmosphere: the limb's blend narrow, the air a pale blue.
  assert.ok(SILVER_FOG['horizon-blend'] <= 0.02);
  assert.ok(PLANET_LIGHT.paper[2] > PLANET_LIGHT.paper[0], 'the air is blue, not paper');
  assert.ok(PLANET_LIGHT.nightColor[2] > PLANET_LIGHT.nightColor[0], 'the night is blue-black, not olive');
});

test('the reader\'s map carries the photograph whole, the seas tinted, under a clear air', () => {
  const source = readFileSync(new URL('../src/components/home/RouteAtlas.tsx', import.meta.url), 'utf8');
  // The photograph at full strength over the dark basemap (it was 0.76: a
  // grey film).
  assert.match(source, /const PROLOGUE_SATELLITE_RESIDUAL = 1;/);
  assert.match(source, /const ARCHIVE_SATELLITE_OPACITY: readonly number\[\] = \[3\.1, 1, 4\.6, PROLOGUE_SATELLITE_RESIDUAL\];/);
  assert.match(source, /const PHONE_SATELLITE_OPACITY = 1;/);
  // The planet's layer is painted in the grade (no silver ramp is written).
  assert.match(source, /\.\.\.PLANET_PAINT,/);
  assert.doesNotMatch(source, /'raster-color'/);
  // The sea tint: over the water, under the light (the desktop) and on the
  // phone's map; its id never says "water" (the basemap restyle would paint
  // it the paper's dark water).
  assert.equal((source.match(/addWaterTint\(map, firstLabel\);/g) ?? []).length, 2);
  const id = /const WATER_TINT_LAYER = '([^']+)';/.exec(source)?.[1];
  assert.ok(id && !id.includes('water'), id);
  assert.ok(source.indexOf('addWaterTint(map, firstLabel);') < source.indexOf('map.addLayer(light, firstLabel);'));
  // The archive's air: no grey-olive haze, a narrow limb.
  const fog = source.slice(source.indexOf('const GLOBE_FOG = {'), source.indexOf('};', source.indexOf('const GLOBE_FOG = {')));
  assert.doesNotMatch(fog, /#555a4a/);
  assert.match(fog, /'horizon-blend': 0\.012/);
  // The reading tone is a whisper now.
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(css, /\.route-atlas-rest-tone \{[^}]*background: rgba\(9, 12, 8, 0\.04\);/);
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
  assert.match(source, /lookWrites\.floor = silverFloorAt\(1\);/);
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
