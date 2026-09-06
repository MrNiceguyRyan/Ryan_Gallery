// Run: node --test scripts/archive-entrance.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { archiveEntryProgress, entrancePhase, ARCHIVE_ENTRANCE_PHASES as phases } from '../src/lib/archiveEntrance.ts';

test('formal entrance begins and ends at the same viewport fractions on desktop sizes', () => {
  for (const height of [800, 900, 1117, 1440]) {
    const section = 4200;
    assert.equal(archiveEntryProgress(section - height * 0.56 - 1, section, height), 0);
    assert.equal(archiveEntryProgress(section + height * 0.52 + 1, section, height), 1);
    assert.ok(Math.abs(archiveEntryProgress(section, section, height) - 0.56 / 1.08) < 1e-12);
  }
});

test('every phase is bounded, monotonic and completely reversible without animation queues', () => {
  for (const [start, end] of Object.values(phases)) {
    let previous = -1;
    for (let i = -100; i <= 1100; i++) {
      const value = entrancePhase(i / 1000, start, end);
      assert.ok(value >= 0 && value <= 1 && value >= previous);
      previous = value;
    }
    assert.equal(entrancePhase(start, start, end), 0);
    assert.equal(entrancePhase(end, start, end), 1);
    const midpoint = (start + end) / 2;
    assert.ok(Math.abs(entrancePhase(midpoint, start, end) - 0.5) < 1e-12);
    const forward = [0.25, 0.5, 0.75].map(p => entrancePhase(p, start, end));
    const reversed = [0.75, 0.5, 0.25].map(p => entrancePhase(p, start, end)).reverse();
    assert.deepEqual(forward, reversed);
  }
});

test('geography leads the first film and its caption resolves afterwards', () => {
  assert.ok(entrancePhase(0.25, ...phases.map) > entrancePhase(0.25, ...phases.film));
  assert.equal(entrancePhase(0.25, ...phases.type), 0);
  assert.ok(entrancePhase(0.55, ...phases.film) > entrancePhase(0.55, ...phases.type));
  assert.equal(entrancePhase(0.55, ...phases.details), 0);
  assert.equal(entrancePhase(1, ...phases.map), 1);
  assert.equal(entrancePhase(1, ...phases.film), 1);
  assert.equal(entrancePhase(1, ...phases.details), 1);
});

test('map overscan covers its plane throughout the settling movement', () => {
  for (const height of [800, 900, 1117, 1440]) {
    for (let i = 0; i <= 1000; i++) {
      const p = entrancePhase(i / 1000, ...phases.map);
      const scale = 1 + 0.035 * (1 - p);
      const y = 28 * (1 - p);
      const overflow = 32 + (height + 64) * (scale - 1) / 2;
      assert.ok(-overflow + y <= 0);
      assert.ok(height + overflow + y >= height);
    }
  }
});

test('first film only uses formal entry and becomes interactive after it is visible', () => {
  const chapter = readFileSync(new URL('../src/components/home/ArchiveChapter.tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/components/home/HomePage.tsx', import.meta.url), 'utf8');
  assert.match(home, /handoffProgress=\{index === 0 \? atlasEntryProgress : undefined\}/);
  assert.match(chapter, /if \(reduce \|\| !handoffProgress\) return 1/);
  assert.match(chapter, /if \(!entryInteractive\) return/);
  assert.match(chapter, /inert: !entryInteractive/);
  assert.match(chapter, /tabIndex: entryInteractive \? 0 : -1/);
  assert.ok(entrancePhase(0.52, ...phases.film) >= 0.49);
  assert.doesNotMatch(chapter, /albumRotateY|albumRotateZ/);
});

test('fallback, deep-link hydration and the live map share the same scroll score', () => {
  const home = readFileSync(new URL('../src/components/home/HomePage.tsx', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../src/components/home/RouteAtlas.tsx', import.meta.url), 'utf8');
  assert.match(home, /RouteAtlasFallback mobile=\{mobile\} entryProgress=\{props.entryProgress\}/);
  assert.match(home, /useLayoutEffect\(\(\) => \{[\s\S]*?archiveEntryProgress\(window.scrollY, documentTop\(desktopAtlasSectionRef.current\)/);
  assert.match(home, /archiveEntryProgress\(window.scrollY, atlasEntryDocumentY, viewportHeight\)/);
  assert.match(map, /entrancePhase\(progress, \.\.\.ARCHIVE_ENTRANCE_PHASES.map\)/);
  assert.match(map, /entrancePhase\(progress, \.\.\.ARCHIVE_ENTRANCE_PHASES.mapVisibility\)/);
});
