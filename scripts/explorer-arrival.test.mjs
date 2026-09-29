// Run offline: node --experimental-strip-types --test scripts/explorer-arrival.test.mjs
// Owner, 2026-09-29: 当地球页空置的时候，点开一个地点的动效和封面出现动效很差 (the
// arrival from the open map), and 右下角这些按钮太多了，没有美感 (the controls).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ARRIVAL, DOCK, arrivalClipFrames, arrivalDelay, foldClip, switchClip } from '../src/lib/coverDock.ts';
import { EASE, bezierFn, voyageEase, DUR_MS } from '../src/lib/motion.ts';
import { SWITCH } from '../src/lib/explorerCamera.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const insets = (clip) => clip.match(/inset\(([^)]+)\)/)[1].split(' ').map((v) => parseFloat(v));

test('the ticket starts as the camera settles: ARRIVAL.leadMs before the touchdown, never before the click reads', () => {
  // The turn (1.4 s on the reference's curve): the ticket starts 880 ms in,
  // when the planet has turned ~90% of its way.
  const turn = bezierFn(EASE.turn);
  const onTurn = arrivalDelay(SWITCH.ms, 400);
  assert.equal(onTurn, SWITCH.ms - ARRIVAL.leadMs);
  assert.ok(turn(onTurn / SWITCH.ms) >= 0.85, `turn at ${turn(onTurn / SWITCH.ms)}`);
  // A far leg on the house's sine (up to SWITCH.farMaxMs): past four fifths.
  const far = arrivalDelay(SWITCH.farMaxMs, 1600);
  assert.ok(voyageEase(far / SWITCH.farMaxMs) >= 0.8);
  // Nowhere to go (the camera is all but there): at once after the shield's
  // lift, not after a turn of nothing.
  assert.equal(arrivalDelay(SWITCH.ms, 3), ARRIVAL.minDelayMs);
  assert.equal(arrivalDelay(SWITCH.ms, Number.NaN), ARRIVAL.minDelayMs);
  // Never sooner than the floor, whatever the flight.
  assert.equal(arrivalDelay(300, 500), ARRIVAL.minDelayMs);
  assert.ok(ARRIVAL.minDelayMs >= DUR_MS.in, 'the shield lifts first');
});

test('it is whole soon after the touchdown: outline, extras and print', () => {
  const land = SWITCH.ms;
  const start = arrivalDelay(land, 400);
  const outline = ARRIVAL.openDelay + ARRIVAL.openMs;
  assert.ok(start + outline <= land + 400, 'the outline is set within 0.4 s of the touchdown');
  assert.ok(ARRIVAL.extrasAt >= outline, 'the tab, cue and pad wait for the outline');
  assert.ok(start + ARRIVAL.developDelay + ARRIVAL.developMs <= land + 800, 'the print is whole within 0.8 s of it');
  // The stub unrolls before the face is half open (the sign comes first).
  assert.ok(ARRIVAL.unrollMs <= ARRIVAL.openDelay + ARRIVAL.openMs / 2);
  // The ink comes up quickly: no hard first edge, no slow fade either.
  assert.ok(ARRIVAL.inkMs >= 120 && ARRIVAL.inkMs <= 240);
  // Letting go folds back as it fades (the dock's own fade).
  assert.equal(ARRIVAL.foldMs, DUR_MS.out);
});

test('the outline unrolls from the corner by the shield: the stub down, then the face across', () => {
  const own = { w: 900, h: 480 };
  const { frames, ms } = arrivalClipFrames(own, DOCK.stub, 20);
  assert.equal(ms, ARRIVAL.openDelay + ARRIVAL.openMs);
  assert.equal(frames[0].offset, 0);
  assert.equal(frames.at(-1).offset, 1);
  // The first frame: only the pad strip over the stub's top (the caret, by
  // the shield); the last: the whole plate, exactly as a switch leaves it.
  const [top0, right0, bottom0, left0] = insets(frames[0].clipPath);
  assert.equal(top0, -12);
  assert.equal(right0, -12);
  assert.equal(bottom0, own.h);
  assert.equal(left0, own.w - DOCK.stub);
  assert.equal(frames.at(-1).clipPath, switchClip(own, own));
  // Monotonic: it only ever opens.
  let prev = insets(frames[0].clipPath);
  frames.slice(1).forEach(({ clipPath }) => {
    const now = insets(clipPath);
    assert.ok(now[2] <= prev[2] + 1e-9 && now[3] <= prev[3] + 1e-9, clipPath);
    prev = now;
  });
  // Before the face opens, only the stub's width is seen.
  frames.filter((f) => f.offset * ms < ARRIVAL.openDelay).forEach((f) => assert.equal(insets(f.clipPath)[3], own.w - DOCK.stub));
  // A plate narrower than a stub (never, but) is not clipped past itself.
  const thin = arrivalClipFrames({ w: 120, h: 300 }, DOCK.stub, 4);
  assert.equal(insets(thin.frames[0].clipPath)[3], 0);
});

test('letting go folds the ticket back into the same corner', () => {
  const own = { w: 900, h: 480 };
  const [top, right, bottom, left] = insets(foldClip(own, DOCK.stub));
  assert.equal(top, -12);
  assert.equal(right, -12);
  assert.equal(left, own.w - DOCK.stub);
  assert.ok(Math.abs(bottom - (own.h * 2) / 3) < 0.1);
});

test('wiring: the atlas asks for the arriving ticket at take-off and says when it starts', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const home = source('src/components/home/HomePage.tsx');
  const css = source('src/styles/global.css');
  // From the open map (nothing shown), not under reduced motion.
  assert.match(atlas, /const arriving = next\.kind === 'fly' && !shown && !reducedMotion;/);
  assert.match(atlas, /carry: \(switching \|\| arriving\) && !reducedMotion,/);
  // Not pinned: it rides in with its shield.
  assert.match(atlas, /\} else if \(arriving\) \{\s+(?:\/\/[^\n]*\n\s+)*pinRef\.current = null;/);
  // Timed off the flight's own landing, derived.
  assert.match(atlas, /const landMs = durationMs \+ \(flying\.tip\?\.ms \?\? 0\);/);
  assert.match(atlas, /at: performance\.now\(\) \+ arrivalDelay\(landMs, travelPx\)/);
  // Every flight clears the last one's arrival; it is published with the frame.
  assert.match(atlas, /coverDock\.publish\(\{ at, points, switch: sw, pin, arrive \}\);/);
  // The chapter plays it once per key, and folds a ticket let go.
  assert.match(chapter, /if \(arrive && arrive\.id === me && arrive\.key !== seenArrive\) \{/);
  assert.match(chapter, /if \(!out\) foldAwayRef\.current\(\);/);
  // Its words come in with it.
  assert.match(home, /'--place-delay': `\$\{railDelay \+ ARRIVAL\.inkMs\}ms`/);
  assert.match(css, /opacity 560ms var\(--ease-arrive\) var\(--place-delay, var\(--dur-in\)\)/);
  // Out of the hand until it starts.
  assert.match(css, /\.archive-dock\[data-arriving\] \.archive-dock__seat \{\s*pointer-events: none;/);
});

test('the controls are one bar: every function kept, labelled, reachable', () => {
  const controls = source('src/components/home/ExplorerControls.tsx');
  const css = source('src/styles/global.css');
  // One group, in the keyboard's order: Recentre, ‹, the place (the list), ›, the Index.
  assert.equal((controls.match(/className="explorer-bar"/g) ?? []).length, 1);
  const bar = controls.slice(controls.indexOf('<div className="explorer-bar"'));
  const order = ['{recentreButton}', '{prevButton}', '{allButton}', '{nextButton}', '{indexButton}'].map((part) => bar.indexOf(part));
  order.forEach((at) => assert.ok(at > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.doesNotMatch(controls, /explorer-controls__bar/);
  // Screen readers hear every one whole; R is still Recentre's key.
  for (const label of ['`Previous place: ${pad2(prev.number)} ${prev.name}`', '`Next place: ${pad2(next.number)} ${next.name}`', 'aria-expanded={listOpen}', 'aria-keyshortcuts="R"', 'aria-label="Index: the contact sheet"']) {
    assert.ok(controls.includes(label), label);
  }
  // Targets of 40px and more; one hairline; bone on translucent olive.
  const block = css.slice(css.indexOf('.explorer-bar {'), css.indexOf('.explorer-list {\n  position: absolute;'));
  assert.match(block, /\.explorer-bar > button \{[^}]*height: 40px;/);
  assert.match(block, /\.explorer-bar__icon \{[^}]*width: 40px;/);
  assert.match(block, /\.explorer-bar \{[^}]*border: 1px solid rgba\(244, 244, 237, 0\.16\);/);
  // Uppercase tracking capped at 0.1em.
  for (const [, value] of block.matchAll(/letter-spacing: ([\d.]+)em/g)) assert.ok(Number(value) <= 0.1, value);
  // No lime of its own but the keyboard's ring (the view's one lime is the
  // atlas's readout).
  const limes = block.match(/#D2FF00/gi) ?? [];
  assert.equal(limes.length, 1);
  assert.match(block, /\.explorer-bar > button:focus-visible \{\s*outline: 2px solid #D2FF00;/);
  // Recentre is in only when needed.
  assert.match(block, /\.explorer-controls__recentre \{[^}]*width: 0 !important;/);
  assert.match(block, /\.explorer-controls__recentre\[data-shown\] \{[^}]*width: 40px !important;/);
});
