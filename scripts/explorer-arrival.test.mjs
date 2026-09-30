// Run offline: node --experimental-strip-types --test scripts/explorer-arrival.test.mjs
// Owner, 2026-09-29: 当地球页空置的时候，点开一个地点的动效和封面出现动效很差 (the
// arrival from the open map, now in the switch's own language: the ticket,
// the opening, then the tip — 先缩小成类似机票那样…到位之后展开封面，然后…尖冒出来),
// and 右下角这些按钮太多了，没有美感 (the controls).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ARRIVAL, TICKET, TICKET_EXPAND_MS, arrivalSchedule } from '../src/lib/coverDock.ts';
import { EASE, bezierFn, voyageEase, DUR_MS } from '../src/lib/motion.ts';
import { SWITCH } from '../src/lib/explorerCamera.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the arrival in the switch\'s language: the ticket inks in, is printed, opens by the touchdown, then its tip', () => {
  // Nowhere to go (the camera all but there): at once past the shield's lift.
  // The tab and the cue wait for the tip to be down (TICKET.extrasGap).
  const extras = TICKET.tipInMs + TICKET.extrasGap;
  assert.deepEqual(arrivalSchedule(SWITCH.ms, 3), { inkAt: 260, expandAt: 620, tipAt: 1080, extrasAt: 1080 + extras });
  assert.deepEqual(arrivalSchedule(SWITCH.ms, Number.NaN), { inkAt: 260, expandAt: 620, tipAt: 1080, extrasAt: 1080 + extras });
  // A real flight: open as the camera settles, the tip out at the touchdown.
  assert.deepEqual(arrivalSchedule(1800, 500), { inkAt: 980, expandAt: 1340, tipAt: 1800, extrasAt: 1800 + extras });
  const turn = bezierFn(EASE.turn);
  const onTurn = arrivalSchedule(SWITCH.ms, 400);
  assert.equal(onTurn.tipAt, SWITCH.ms, 'the tip comes out as the camera touches down');
  assert.ok(turn(onTurn.expandAt / SWITCH.ms) >= 0.85, `turn at ${turn(onTurn.expandAt / SWITCH.ms)}`);
  const far = arrivalSchedule(SWITCH.farMaxMs, 1600);
  assert.ok(voyageEase(far.expandAt / SWITCH.farMaxMs) >= 0.8);
  // Never sooner than the floor, whatever the flight: the shield lifts first.
  assert.equal(arrivalSchedule(300, 500).inkAt, ARRIVAL.minDelayMs);
  assert.ok(ARRIVAL.minDelayMs >= DUR_MS.in);
  // The ticket (its picture a miniature in the strip) is on the map before
  // it opens, its ink quick (no hard first edge, no slow fade), its opening
  // the switch's.
  for (const land of [300, 900, 1400, 2000, 2600]) {
    const s = arrivalSchedule(land, 400);
    assert.equal(s.expandAt - s.inkAt, ARRIVAL.printMs);
    assert.equal(s.tipAt - s.expandAt, TICKET_EXPAND_MS + TICKET.tipGap);
  }
  assert.ok(ARRIVAL.inkMs >= 120 && ARRIVAL.inkMs <= 240);
  // No unroll or open of its own any more: the switch's ticket opens it.
  for (const gone of ['leadMs', 'unrollMs', 'openDelay', 'openMs', 'developDelay', 'developMs', 'extrasAt', 'foldMs']) {
    assert.equal(ARRIVAL[gone], undefined, gone);
  }
});

test('letting go runs the fold backwards: the tip in, the ticket folded at its seat, the ink gone by 520 (360 by the reader\'s hand)', () => {
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const css = source('src/styles/global.css');
  assert.match(chapter, /const DOCK_FADE_MS = 520;/);
  assert.match(css, /\.archive-dock \{[^}]*transition: opacity var\(--dur-swap\) var\(--ease-fade\) 200ms, visibility 0s linear 520ms;/);
  assert.match(css, /\.archive-dock-host\[data-let-go\] \.archive-dock:not\(\[data-at\]\):not\(\[data-leaving\]\) \{\s*transition: opacity var\(--dur-in\) var\(--ease-fade\) 160ms, visibility 0s linear 360ms;/);
  assert.equal(DUR_MS.swap + 200, 520);
  assert.equal(DUR_MS.in + 160, 360);
  const letGo = chapter.slice(chapter.indexOf('const letGo = () => {'), chapter.indexOf('const onSwitchRef'));
  assert.match(letGo, /retractTip\(fold, now\);/);
  // The fold shrinks the picture into the strip with the plate (no dark
  // ground: foldPlate runs the print's frames too).
  assert.match(letGo, /foldPlate\(fold, form, now \+ TICKET\.foldAt, 'let-go'\);/);
  assert.doesNotMatch(letGo, /printToMat|\bmat\b/);
  // Under reduced motion nothing folds (the dock is hidden at once).
  assert.match(letGo, /if \(reduce \|\| !form\) return;/);
  // The tab and the cue fade with the tip going back.
  assert.match(css, /\.archive-dock:is\(\[data-switch\], :not\(\[data-at\]\)\) :is\(\.archive-dock__tab, \.archive-plate__view\) \{\s*opacity: 0;\s*transition: opacity var\(--dur-flick\) var\(--ease-fade\);/);
});

test('wiring: the atlas asks for the arriving ticket at take-off and says when it inks in, opens, puts its tip out', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const home = source('src/components/home/HomePage.tsx');
  const css = source('src/styles/global.css');
  // From the open map (nothing shown — or a ticket not inked in yet), not
  // under reduced motion.
  assert.match(atlas, /if \(shown && arriveWas && arriveWas\.id === shown && now < arriveWas\.inkAt\) shown = null;/);
  assert.match(atlas, /const arriving = next\.kind === 'fly' && !shown && !reducedMotion;/);
  assert.match(atlas, /carry: \(switching \|\| arriving\) && !reducedMotion,/);
  // Not pinned: it rides in with its shield.
  assert.match(atlas, /\} else if \(arriving\) \{\s+(?:\/\/[^\n]*\n\s+)*pinRef\.current = null;/);
  // Timed off the flight's own landing, derived.
  assert.match(atlas, /const landMs = durationMs \+ \(flying\.tip\?\.ms \?\? 0\);/);
  assert.match(atlas, /const beats = arrivalSchedule\(landMs, travelPx\);/);
  assert.match(atlas, /inkAt: now \+ beats\.inkAt, expandAt: now \+ beats\.expandAt, tipAt: now \+ beats\.tipAt, extrasAt: now \+ beats\.extrasAt/);
  // Every flight clears the last one's arrival; it is published with the frame.
  assert.match(atlas, /coverDock\.publish\(\{ at, points, switch: sw, pin, pins, arrive \}\);/);
  // The chapter plays it once per key, and folds a ticket let go.
  assert.match(chapter, /if \(at && arrive && arrive\.id === me && arrive\.key !== seenArrive\) \{/);
  assert.match(chapter, /if \(!out && !dock\.hasAttribute\('data-cut'\)\) \{\s+const play = playRef\.current;\s+if \(play\?\.kind === 'switch' && play\.role === 'in' && play\.inked\) hold = true;\s+letGoRef\.current\(\);/);
  const arriveIn = chapter.slice(chapter.indexOf('const arriveIn = ('), chapter.indexOf('const letGo = () => {'));
  assert.match(arriveIn, /expandPlate\(play, form, arrive\.expandAt, true\);/);
  assert.match(arriveIn, /popTip\(play, arrive\.tipAt\)/);
  assert.match(arriveIn, /startAt\(dock\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: ARRIVAL\.inkMs,/);
  // Its words come in as it opens.
  assert.match(home, /arrive\.expandAt - performance\.now\(\)/);
  assert.match(home, /'--place-delay': `\$\{railDelay \+ ARRIVAL\.inkMs\}ms`/);
  assert.match(css, /opacity 560ms var\(--ease-arrive\) var\(--place-delay, var\(--dur-in\)\)/);
  // Out of the hand until it inks in; swallowed while a ticket.
  assert.match(css, /\.archive-dock\[data-arriving\] \.archive-dock__seat \{\s*pointer-events: none;/);
  assert.match(chapter, /const ticketed = \(\) => dockRef\.current\?\.hasAttribute\('data-ticket'\) \?\? false;/);
  assert.match(chapter, /if \(ticketed\(\)\) \{\s+event\.stopPropagation\(\);\s+return;/);
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
