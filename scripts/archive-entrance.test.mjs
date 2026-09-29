// Run: node --test scripts/archive-entrance.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { entrancePhase, ARCHIVE_ENTRANCE_PHASES as phases } from '../src/lib/archiveEntrance.ts';

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

test('the entry\'s score is the map\'s visibility and the interface\'s only: no cover has an entrance', () => {
  // The first film's album unfold, and its type and details arriving on the
  // entrance, were retired with every other cover reveal (直接出现就好).
  assert.deepEqual(Object.keys(phases).sort(), ['interface', 'mapVisibility']);
  assert.equal(entrancePhase(1, ...phases.interface), 1);
  assert.equal(entrancePhase(0, ...phases.interface), 0);
});

test('the entry goes straight down onto stop 01: its cover is simply there, whole and live', () => {
  const chapter = readFileSync(new URL('../src/components/home/ArchiveChapter.tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/components/home/HomePage.tsx', import.meta.url), 'utf8');
  const atlas = readFileSync(new URL('../src/components/home/RouteAtlas.tsx', import.meta.url), 'utf8');
  const closing = readFileSync(new URL('../src/components/home/ArchiveClosing.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  // The owner rejected the film-roll bridge (2026-09-27: repetitive and
  // unnecessary): the globe dives straight into chapter 1. No count page, no
  // index, no roll — and nothing holds chapter 1's plate back for a landing.
  // Since 2026-09-28 his name and the opening words are the entrance's
  // (EntranceIntro: no globe there), where the opening film's words land.
  // The globe's first screen went with it (GlobePrologue: his name over a
  // corner globe facing India, then "The route begins in …" beside it): the
  // torn pass brings the globe up already facing stop 01, and the explorer's
  // rail says the place once the camera is down on it — one line, not two.
  // (Entrance v2: the cover of words — src/lib/boardingPass.ts coverBlocks —
  // renders each of the film's words as its own [data-open-land] span.)
  const entrance = readFileSync(new URL('../src/components/home/EntranceIntro.tsx', import.meta.url), 'utf8');
  const cover = readFileSync(new URL('../src/lib/boardingPass.ts', import.meta.url), 'utf8');
  assert.match(entrance, /data-open-land=\{part\.land\}/);
  assert.match(cover, /\{ land: 'ryan', text: 'Ryan' \}/);
  assert.match(cover, /\{ land: 'xu', text: 'Xu' \}/);
  for (const word of ['camera', 'travel', 'archive', 'thought', 'you']) assert.match(cover, new RegExp(`\\{ land: '${word}' \\}`));
  assert.equal(existsSync(new URL('../src/components/home/GlobePrologue.tsx', import.meta.url)), false);
  assert.doesNotMatch(home, /GlobePrologue|The route begins in|data-open-land/);
  assert.doesNotMatch(css, /globe-prologue|prologue-cap/);
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

test('the phone deals its ticket whole: nothing wipes or zooms a photograph in', () => {
  const chapter = readFileSync(new URL('../src/components/home/ArchiveChapter.tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/components/home/HomePage.tsx', import.meta.url), 'utf8');
  // A cover has no entrance: the one develop is a switch's (the next
  // place's print developing inside the still ticket, owner, 2026-09-28:
  // 切换中赋予我们现有的动效), never a cover appearing.
  const switchIn = chapter.slice(chapter.indexOf('const switchIn = ('), chapter.indexOf('const switchOut = ('));
  assert.match(switchIn, /maskPosition/);
  assert.doesNotMatch(chapter.replace(switchIn, ''), /maskPosition|DEVELOP_MASK\b(?!,)/);
  // The phone's card is the same ticket (its tear, its stub), dealt at the
  // foot of the screen, sized from the photograph's own ratio.
  assert.match(chapter, /phoneCard\(window\.innerWidth, window\.innerHeight, cardRatio\)/);
  assert.match(home, /phone=\{!desktopLayout\}/);
  // The living tree (the phone's scroll-driven route cards) is gone.
  assert.doesNotMatch(home, /LivingAtlasStory/);
});

test('the fallback and the live map share the entry\'s clock, which is time, not the scroll', () => {
  const home = readFileSync(new URL('../src/components/home/HomePage.tsx', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../src/components/home/RouteAtlas.tsx', import.meta.url), 'utf8');
  assert.match(home, /RouteAtlasFallback mobile=\{props\.mobile\} entryProgress=\{props\.entryProgress\}/);
  assert.match(home, /entrancePhase\(p, \.\.\.ARCHIVE_ENTRANCE_PHASES\.mapVisibility\)/);
  // The entry runs on time (src/lib/explorerCamera.ts ENTRY), never on the
  // page's scroll: the descent alone (no turn before it), and the explorer's
  // page does not scroll. Nor does the entrance above it (entrance v2: one
  // screen, the pass the one way on, its glide the only move of the page):
  // the body is clipped from the first frame, and there is no Lenis.
  assert.match(home, /animate\(entryProgress, 1, \{\s*duration: ENTRY\.diveMs \/ 1000/);
  assert.doesNotMatch(home, /prologueProgress|entryQ|turnMs|archiveEntryProgress/);
  assert.doesNotMatch(home, /startLenis|lenisRef/);
  assert.match(home, /useEffect\(\(\) => \{\s*document\.body\.style\.overflow = 'clip';/);
  assert.match(map, /entrancePhase\(Number\(entry\), \.\.\.ARCHIVE_ENTRANCE_PHASES\.interface\)/);
});
