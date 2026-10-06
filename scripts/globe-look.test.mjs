// Run offline: node --experimental-strip-types --test scripts/globe-look.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FIRST_SCREEN_LIGHT,
  PLANET_LIGHT,
  PLANET_PAINT,
  SILVER_FOG,
  SILVER_FOG_LITE,
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
  // Where the swing lands, the toned print (2026-09-29, 太亮了也和整体网站风格
  // 差异过大): the far side at 0.45 of the lit one, the page's ink laid over
  // it at 0.28, the wrap 0.5 (the bright pass: 0.6 / 0.12 / 0.6).
  near(index.azimuth, 118); near(index.theta, 34); near(index.ambient, 0.45); near(index.nightTint, 0.28); near(index.wrap, 0.5);
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

test('the planet is a split-toned print in the site\'s own palette: calm, crisp, not grey (owner, 2026-09-29)', () => {
  // Grey (有点灰灰的，我想要精致和明亮一点), then bright (太亮了也和整体网站风格
  // 差异过大), now between: one grade from the planet the page brings up to
  // the reader's map (nothing changes colour on the way down).
  const look = PLANET_PAINT;
  assert.deepEqual(STOCK_PAINT, PLANET_PAINT);
  assert.deepEqual(
    [look['raster-saturation'], look['raster-contrast'], look['raster-brightness-min'], look['raster-brightness-max'], look['raster-hue-rotate']],
    [-0.38, 0.24, 0.1, 0.53, -8],
  );
  for (const key of ['raster-color', 'raster-color-mix', 'raster-color-range']) assert.equal(key in look, false, key);
  // The colour kept at about half: never the full photograph (0, the bright
  // pass), never the grey's washout.
  assert.ok(look['raster-saturation'] <= -0.35 && look['raster-saturation'] >= -0.55);
  // Crisp: a firm contrast, never the grey's flat card.
  assert.ok(look['raster-contrast'] >= 0.18 && look['raster-contrast'] <= 0.3);
  // The floor lifted enough that the land by the sea stands over the water
  // (at 0.04 the coasts of Miami, Orlando and New York were +1 to +2 of
  // luma, the phone's New York −2: the coastline in hue only; at 0.10 with
  // the darker tint +4 to +8), never the grey's 0.15 veil. The whites held
  // well short of paper — the deserts' glare was the brightness (0.94 under
  // the bright pass; 0.68 still left the phone's desert at 84–89 of luma,
  // 0.53 over this floor holds it at 73–77).
  assert.ok(look['raster-brightness-min'] >= 0.08 && look['raster-brightness-min'] <= 0.12);
  assert.ok(look['raster-brightness-max'] >= 0.5 && look['raster-brightness-max'] <= 0.6);
  // A hair warmer: the hue turns a few degrees at most.
  assert.ok(Math.abs(look['raster-hue-rotate']) <= 10);
  // The seas: the page's own ink (not the bright pass's blue-green, not a
  // teal), over the water only, at half strength — a step under the first
  // toned pass's #383f37, which sat level with the forests (the coast gone).
  assert.equal(WATER_TINT.color, '#2b322c');
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(WATER_TINT.color.slice(i, i + 2), 16));
  assert.ok(g >= r && g >= b && Math.max(r, g, b) - Math.min(r, g, b) <= 10, 'olive-grey, near neutral');
  assert.ok(0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2126 * 0x38 + 0.7152 * 0x3f + 0.0722 * 0x37, 'under #383f37');
  assert.equal(WATER_TINT.opacity, 0.5);
  // The light's floor still lifts in 25 steps across FLOOR_Q.
  const values = new Set();
  for (let q = 0; q <= 1; q += 0.0005) values.add(silverFloorAt(q));
  assert.ok(values.size <= 26);
  assert.equal(silverFloorAt(0.12), 0);
  assert.equal(silverFloorAt(0.32), 1);
  // A thin atmosphere in the site's palette: the limb a quiet bone hairline,
  // the night the page's ink.
  assert.ok(SILVER_FOG['horizon-blend'] <= 0.02);
  // The space round the planet the torn pass brings up is the page's own
  // ground (HomePage's), so the entrance's bottom edge, scrolling up over
  // it, meets it in one tone: the archive's darker space from the start drew
  // a straight seam of 8–11 luma across the whole screen.
  const home = readFileSync(new URL('../src/components/home/HomePage.tsx', import.meta.url), 'utf8');
  assert.match(home, /className="relative overflow-x-clip font-sans bg-\[#282c20\]/);
  assert.equal(SILVER_FOG['space-color'], '#282c20');
  assert.equal(SILVER_FOG_LITE['space-color'], '#282c20');
  assert.match(SILVER_FOG['high-color'], /^rgba\(220, 218, 200, 0\.08\)$/);
  assert.equal(SILVER_FOG_LITE['high-color'], 'rgba(220, 218, 200, 0.18)');
  assert.deepEqual([PLANET_LIGHT.rim, PLANET_LIGHT.rimWidth, PLANET_LIGHT.glow, PLANET_LIGHT.spec], [0.28, 0.028, 0.12, 0.06]);
  assert.deepEqual(PLANET_LIGHT.paper, [0.957, 0.957, 0.929]);
  assert.ok(PLANET_LIGHT.paper[0] >= PLANET_LIGHT.paper[2], 'the air is bone, not blue');
  assert.deepEqual(PLANET_LIGHT.nightColor, [0.09, 0.106, 0.082]);
  const [nr, ng, nb] = PLANET_LIGHT.nightColor;
  assert.ok(ng > nr && nr > nb, 'the night is the page\'s olive ink, not blue-black');
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
  // The archive's air: no grey-olive haze, no blue; a narrow bone limb and
  // the space the page's ink a step under its ground.
  const fog = source.slice(source.indexOf('const GLOBE_FOG = {'), source.indexOf('};', source.indexOf('const GLOBE_FOG = {')));
  assert.doesNotMatch(fog, /#555a4a/);
  assert.doesNotMatch(fog, /190, 214, 226|80, 130, 180/);
  assert.match(fog, /color: 'rgba\(170, 170, 154, 0\.55\)'/);
  assert.match(fog, /'high-color': 'rgba\(214, 212, 196, 0\.14\)'/);
  assert.match(fog, /'space-color': '#1d2117'/);
  // The dive takes the space from the page's ground to the archive's on its
  // own band, after the entrance's edge has left the screen (zoom 3.31 on
  // the desktop, 3.87 on the phone) and done early in the air's (4.2–5).
  const spaceBand = /const DIVE_SPACE_ZOOMS = \[([\d.]+), ([\d.]+)\] as const;/.exec(source);
  assert.ok(spaceBand, 'DIVE_SPACE_ZOOMS');
  const [spaceFrom, spaceTo] = [Number(spaceBand[1]), Number(spaceBand[2])];
  assert.deepEqual([spaceFrom, spaceTo], [3.9, 4.4]);
  const airTo = Number(/const DIVE_FOG_ZOOMS = \[[\d.]+, ([\d.]+)\] as const;/.exec(source)?.[1]);
  assert.ok(spaceFrom > 3.87 && spaceTo < airTo, 'after the entrance has gone, before the air has turned');
  const dive = source.slice(source.indexOf('function diveFog('), source.indexOf('const PROLOGUE_FOG = '));
  assert.match(dive, /'space-color': \['interpolate', \['linear'\], \['zoom'\], spaceFrom, prologueAir\['space-color'\], spaceTo, GLOBE_FOG\['space-color'\]\],/);
  assert.match(fog, /'horizon-blend': 0\.01,/);
  // The reading tone: the page's olive ink at 0.16 (a whisper, 0.04, under
  // the bright pass); the rail's shade and the readout's shadow lighter again.
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(css, /\.route-atlas-rest-tone \{[^}]*background: rgba\(30, 36, 22, 0\.16\);/);
  assert.match(css, /\.explorer-rail::before \{[^}]*rgba\(14, 17, 11, 0\.34\) 0%, rgba\(14, 17, 11, 0\.2\) 52%, rgba\(14, 17, 11, 0\.05\) 82%/);
  assert.match(css, /\.viewfinder__readout \{[^}]*text-shadow: 0 0 6px rgba\(12, 15, 10, 0\.72\), 0 1px 2px rgba\(12, 15, 10, 0\.6\);/);
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
  // Written as plain numbers (see satelliteOpacityAt), on ONE photograph
  // the whole way down: the planet and the reader's map share one grade
  // (PLANET_PAINT === STOCK_PAINT), so the second layer that crossfaded over
  // the first across SILVER_EXIT drew the same picture twice (and loaded
  // every tile twice) for no change of a pixel (2026-10-05). The layer is
  // never hidden in the archive: it is the reader's map.
  assert.match(source, /map\.setPaintProperty\('prologue-satellite', 'raster-opacity', base\)/);
  assert.doesNotMatch(source, /SATELLITE_STOCK_LAYER|prologue-satellite-stock/);
  assert.equal((source.match(/map\.addSource\('prologue-satellite'/g) ?? []).length, 1);
  assert.doesNotMatch(source, /\['prologue-route', 'prologue-stops-dot', 'prologue-satellite'\]/);
});
