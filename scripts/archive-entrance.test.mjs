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

test('the entrance score is the map\'s and the interface\'s only: no cover has an entrance', () => {
  // The first film's album unfold, and its type and details arriving on the
  // entrance, were retired with every other cover reveal (直接出现就好).
  assert.deepEqual(Object.keys(phases).sort(), ['interface', 'map', 'mapVisibility']);
  assert.equal(entrancePhase(1, ...phases.map), 1);
  assert.equal(entrancePhase(0, ...phases.map), 0);
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

test('the opening goes straight into chapter 1: the first film is simply there, a whole, live cover', () => {
  const chapter = readFileSync(new URL('../src/components/home/ArchiveChapter.tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/components/home/HomePage.tsx', import.meta.url), 'utf8');
  const prologue = readFileSync(new URL('../src/components/home/GlobePrologue.tsx', import.meta.url), 'utf8');
  const atlas = readFileSync(new URL('../src/components/home/RouteAtlas.tsx', import.meta.url), 'utf8');
  const closing = readFileSync(new URL('../src/components/home/ArchiveClosing.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  // The owner rejected the film-roll bridge (2026-09-27: repetitive and
  // unnecessary): the globe dives straight into chapter 1. No count page, no
  // index, no roll — and nothing holds chapter 1's plate back for a landing.
  // Since 2026-09-28 his name and the opening words are the entrance's
  // (EntranceIntro, above the globe: no globe there), where the opening
  // film's words land; the globe's first pose keeps one quiet caption.
  const entrance = readFileSync(new URL('../src/components/home/EntranceIntro.tsx', import.meta.url), 'utf8');
  assert.match(entrance, /data-open-land="ryan"/);
  assert.match(entrance, /data-open-land="xu"/);
  for (const word of ['camera', 'travel', 'archive', 'thought']) assert.match(entrance, new RegExp(`\\{ land: '${word}' \\}`));
  assert.doesNotMatch(prologue, /data-open-land/);
  assert.match(prologue, /The route begins in/);
  assert.doesNotMatch(prologue, /bridge|archive-index|chapters · |\bframes\b/i);
  assert.doesNotMatch(home, /rollFrames|rollGates|archive-index|Back to index/);
  assert.doesNotMatch(atlas, /rollGates|bridgeRoll|prologue-mark|archive-index/);
  assert.doesNotMatch(closing, /Back to index|onBackToIndex/);
  assert.match(closing, /Back to the start/);
  assert.doesNotMatch(css, /data-bridge|\.bridge-|prologue-mark/);
  // The plate has no unfold of its own any more — no cover does — so it is
  // interactive whenever it is there.
  assert.doesNotMatch(home, /handoffProgress=/);
  assert.doesNotMatch(chapter, /handoffProgress|entryInteractive|albumOpen|ARCHIVE_ENTRANCE_PHASES|bridge-landed|bridgeGate/);
  assert.match(chapter, /tabIndex: 0,/);
  assert.doesNotMatch(chapter, /inert:/);
  // The stage stays a layer of its own, as it has always been (the unfold
  // that used to make it one is gone), asked for with no transform at all.
  assert.match(css, /\.archive-plate__stage \{\s*will-change: transform;\s*\}/);
});

test('the phone window never wipes or zooms a photograph in either', () => {
  const phone = readFileSync(new URL('../src/components/home/LivingAtlasStory.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(phone, /DEVELOP_MASK|maskPosition|maskImage/);
  assert.doesNotMatch(phone, /\* 0\.012/);
  // A rail commit's destination is shown whole on arrival, not played in.
  assert.match(phone, /shown\.set\(1\);/);
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
