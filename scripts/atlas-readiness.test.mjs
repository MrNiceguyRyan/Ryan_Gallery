// Run offline: node --experimental-strip-types --test scripts/atlas-readiness.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ATLAS_IDLE_FALLBACK_MS,
  isAtlasInterfaceReady,
  scheduleAtlasIdleFallback,
} from '../src/lib/atlasReadiness.ts';

test('map base styles are owned by the shared layout rather than cached lazy islands', () => {
  const layout = readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8');
  assert.match(layout, /import 'mapbox-gl\/dist\/mapbox-gl\.css';/);
  assert.ok(layout.indexOf("import 'mapbox-gl/dist/mapbox-gl.css'") < layout.indexOf("import '../styles/global.css'"));
  for (const file of ['home/RouteAtlas.tsx', 'MapboxMap.tsx']) {
    assert.doesNotMatch(readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8'), /import 'mapbox-gl\/dist\/mapbox-gl\.css';/);
  }
});

function createClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        const [id, timer] = next;
        timers.delete(id);
        now = timer.at;
        timer.callback();
      }
      now = end;
    },
    pending() { return timers.size; },
  };
}

const initialized = {
  loaded: true,
  cameraSynced: true,
  settled: false,
  idleFallback: false,
};

test('neither elapsed network time nor idle can reveal an uninitialized map', () => {
  for (const gates of [
    { loaded: false, cameraSynced: false },
    { loaded: false, cameraSynced: true }, // Living overview still needs load.
    { loaded: true, cameraSynced: false }, // Classic needs its current timeline draw.
  ]) {
    const clock = createClock();
    let callbacks = 0;
    const state = { ...initialized, ...gates };
    scheduleAtlasIdleFallback(state, () => callbacks++, clock);
    clock.advance(60000);
    assert.equal(callbacks, 0);
    assert.equal(clock.pending(), 0);
    assert.equal(isAtlasInterfaceReady({ ...state, settled: true, idleFallback: true }), false);
  }
});

test('an initialized, synchronized map becomes ready at the bounded deadline without idle', () => {
  const clock = createClock();
  const state = { ...initialized };
  let callbacks = 0;
  scheduleAtlasIdleFallback(state, () => {
    callbacks++;
    state.idleFallback = true;
  }, clock);
  clock.advance(ATLAS_IDLE_FALLBACK_MS - 1);
  assert.equal(isAtlasInterfaceReady(state), false);
  clock.advance(1);
  assert.equal(isAtlasInterfaceReady(state), true);
  clock.advance(60000);
  assert.equal(callbacks, 1);
});

test('normal first idle keeps immediate readiness and cancels the unused fallback', () => {
  const clock = createClock();
  let callbacks = 0;
  const cleanup = scheduleAtlasIdleFallback(initialized, () => callbacks++, clock);
  clock.advance(300);
  cleanup(); // React cleans up when mapSettled changes.
  const settled = { ...initialized, settled: true };
  assert.equal(isAtlasInterfaceReady(settled), true);
  assert.equal(scheduleAtlasIdleFallback(settled, () => callbacks++, clock), undefined);
  clock.advance(60000);
  assert.equal(callbacks, 0);
  assert.equal(clock.pending(), 0);
});

test('a late load starts the deadline only after the current chapter has synchronized', () => {
  const clock = createClock();
  const state = { ...initialized, loaded: false, cameraSynced: false };
  const onReady = () => { state.idleFallback = true; };
  scheduleAtlasIdleFallback(state, onReady, clock);
  clock.advance(20000); // The separate network warning may have appeared already.
  assert.equal(isAtlasInterfaceReady(state), false);
  state.loaded = true;
  scheduleAtlasIdleFallback(state, onReady, clock);
  clock.advance(500);
  assert.equal(isAtlasInterfaceReady(state), false);
  state.cameraSynced = true;
  scheduleAtlasIdleFallback(state, onReady, clock);
  clock.advance(ATLAS_IDLE_FALLBACK_MS);
  assert.equal(isAtlasInterfaceReady(state), true);
});

test('unmount and stale queued callbacks cannot update readiness', () => {
  let queued;
  let cleared = false;
  let callbacks = 0;
  const clock = {
    setTimeout(callback) { queued = callback; return 7; },
    clearTimeout(id) { assert.equal(id, 7); cleared = true; },
  };
  const cleanup = scheduleAtlasIdleFallback(initialized, () => callbacks++, clock);
  cleanup();
  queued(); // Exercise a callback already queued before cancellation.
  assert.equal(cleared, true);
  assert.equal(callbacks, 0);
});

test('ready maps do not create more timers; mobile and reduced motion share the safe gate', () => {
  const clock = createClock();
  const ready = { ...initialized, idleFallback: true };
  assert.equal(scheduleAtlasIdleFallback(ready, assert.fail, clock), undefined);
  assert.equal(clock.pending(), 0);
  assert.equal(isAtlasInterfaceReady(ready), true);
  assert.equal(isAtlasInterfaceReady({ ...initialized, settled: true }), true);
  assert.equal(isAtlasInterfaceReady({ ...ready, loaded: false }), false);
});

test('RouteAtlas wiring keeps scroll, camera and network-warning lifecycles separate', () => {
  const source = readFileSync(new URL('../src/components/home/RouteAtlas.tsx', import.meta.url), 'utf8');
  assert.match(source, /isAtlasInterfaceReady\(mapReadiness\)/);
  assert.doesNotMatch(source, /\(mapSettled \|\| mapLoadDelayed\)/);
  // Scroll samples must not restart the readiness timer while travelling.
  assert.match(source, /\[living, mapCameraSynced, mapIdleFallback, mapLoaded, mapSettled\]/);
  // One synchronization state update, after camera and route writes, never per frame.
  const drawStart = source.indexOf('const draw: Process =');
  const syncStart = source.indexOf('if (!cameraSyncedRef.current)', drawStart);
  const scheduleStart = source.indexOf('const schedule =', drawStart);
  assert.ok(drawStart >= 0 && syncStart > drawStart && scheduleStart > syncStart);
  assert.ok(source.indexOf('map.jumpTo({', drawStart) < syncStart);
  assert.ok(source.indexOf("map.setPaintProperty(layerId, 'line-trim-offset'", drawStart) < syncStart);
  assert.match(source.slice(syncStart, scheduleStart), /cameraSyncedRef\.current = true;\s+setMapCameraSynced\(true\);/);
  // Late load / Story close still samples the real current chapter, not index 0.
  assert.match(source, /schedule\(chapterSample\.get\(\)\);/);
  assert.match(source, /mapEligible && !mapLoaded && mapLoadDelayed/);
});
