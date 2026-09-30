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
import { PAGE_BOUNDS, PANEL_BOUNDS, PROOF, copyBox, copyHeight, placeCopy, proofLayout } from '../src/lib/proofSheet.ts';

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
  // One group, in the keyboard's order: ‹, the place (the panel), ›. Recentre
  // comes first in the keyboard's order, a button of its own beside the
  // capsule (2026-09-30: 应该固定住); the Index is the panel's second view.
  assert.equal((controls.match(/className="explorer-bar"/g) ?? []).length, 1);
  const row = controls.slice(controls.indexOf('<div className="explorer-controls__row">'));
  const bar = row.slice(row.indexOf('<div className="explorer-bar"'));
  const order = ['{prevButton}', '{allButton}', '{nextButton}'].map((part) => bar.indexOf(part));
  order.forEach((at) => assert.ok(at > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(row.indexOf('{recentreButton}') > 0 && row.indexOf('{recentreButton}') < row.indexOf('<div className="explorer-bar"'));
  assert.doesNotMatch(bar.slice(0, bar.indexOf('</div>')), /recentreButton|indexButton/);
  assert.doesNotMatch(controls, /explorer-controls__bar|indexButton|onIndex|explorer-controls__index/);
  // Screen readers hear every one whole; R is still Recentre's key.
  for (const label of ['`Previous place: ${pad2(prev.number)} ${prev.name}`', '`Next place: ${pad2(next.number)} ${next.name}`', 'aria-expanded={listOpen}', 'aria-keyshortcuts="R"']) {
    assert.ok(controls.includes(label), label);
  }
  // Targets of 40px and more; one hairline; bone on translucent olive.
  const block = css.slice(css.indexOf('/* ── The controls: one bar, one size ──'), css.indexOf('/* ── The places panel: one paper, two views ──'));
  assert.ok(block.length > 2000);
  assert.match(block, /\.explorer-bar > button,\s*\.explorer-recentre \{[^}]*height: 40px;/);
  assert.match(block, /\.explorer-bar__icon \{[^}]*width: 40px;/);
  assert.match(block, /\.explorer-bar \{[^}]*border: 1px solid rgba\(244, 244, 237, 0\.16\);/);
  // Uppercase tracking capped at 0.1em.
  for (const [, value] of block.matchAll(/letter-spacing: ([\d.]+)em/g)) assert.ok(Number(value) <= 0.1, value);
  // No lime of its own but the keyboard's ring (the view's one lime is the
  // atlas's readout).
  const limes = block.match(/#D2FF00/gi) ?? [];
  assert.equal(limes.length, 1);
  assert.match(block, /\.explorer-bar > button:focus-visible,\s*\.explorer-recentre:focus-visible \{\s*outline: 2px solid #D2FF00;/);
  // Recentre is in only when needed, and never in the capsule.
  assert.match(block, /\.explorer-recentre \{\s*position: absolute;\s*top: 0;\s*right: calc\(100% \+ 8px\);/);
  assert.match(block, /\.explorer-recentre\[data-shown\] \{[^}]*opacity: 1;/);
});

test('the capsule is one size in every state: every word in its cell at once, Recentre beside it', () => {
  // Owner, 2026-09-30: 右下角的胶囊会随着地区改变，产生位置大小往左偏移，我觉得应该固定住.
  const controls = source('src/components/home/ExplorerControls.tsx');
  const css = source('src/styles/global.css');
  const block = css.slice(css.indexOf('/* ── The controls: one bar, one size ──'), css.indexOf('/* ── The places panel: one paper, two views ──'));
  // The middle holds every place's number and every place's name (and the
  // idle "Places") at once; `data-at` says which is seen and which just left.
  const all = controls.slice(controls.indexOf('const allButton = ('), controls.indexOf('const recentreShown'));
  assert.match(all, /className="explorer-bar__stack explorer-bar__no tabular-nums">\s*\{places\.map\(\(place\) => \(\s*<span key=\{place\.id\} data-at=\{at\(place\.id\)\}>\{pad2\(place\.number\)\}<\/span>/);
  assert.match(all, /className="explorer-bar__stack explorer-bar__name" aria-hidden="true">\s*<span data-at=\{at\(null\)\}>Places<\/span>\s*\{places\.map\(\(place\) => \(\s*<span key=\{place\.id\} data-at=\{at\(place\.id\)\}>\{place\.name\}<\/span>/);
  // Nothing in the middle comes and goes from the layout: the dot and the
  // slash only fade (held / idle), the total stays where it stands.
  assert.doesNotMatch(all, /\{now \? \(/);
  assert.match(block, /\.explorer-bar__stack \{\s*display: inline-grid;\s*overflow: hidden;\s*\}/);
  assert.match(block, /\.explorer-bar__stack > span \{\s*grid-area: 1 \/ 1;/);
  // One turn, on the house's own tokens: up and out, up and in.
  assert.match(block, /\.explorer-bar__stack > \[data-at='now'\] \{[^}]*transition: transform var\(--dur-swap\) var\(--ease-turn\)/);
  assert.match(block, /\.explorer-bar__stack > \[data-at='was'\] \{\s*transform: translateY\(-100%\);/);
  // Nothing in the capsule changes its width: no width transition, no
  // `!important` widths, no max-width on the name (it is as wide as its
  // widest word, BRYCE CANYON).
  assert.doesNotMatch(block, /transition:[^;]*\bwidth\b/);
  assert.doesNotMatch(block, /width: 0 !important/);
  assert.doesNotMatch(block, /\.explorer-bar__name \{[^}]*max-width/);
  // Reduced motion: the words change at once (values, not structure).
  const reduced = css.slice(css.indexOf('.explorer-controls[data-visible],\n  .explorer-recentre,'), css.indexOf('/* ─── The Collection Story'));
  for (const part of ['.explorer-bar__stack > span', '.explorer-recentre[data-shown]', '.explorer-panel__paper', '.explorer-list', '.explorer-sheet']) {
    assert.ok(reduced.includes(part), part);
  }
  // The phone keeps Recentre's place beside the capsule whether it is in or not.
  assert.match(css, /\.explorer-controls--phone \.explorer-controls__row \{[^}]*margin-left: calc\(var\(--bar-h\) \+ 8px\);/);
});

test('the Index is the places panel\'s second view: one paper grown in place, never a page of its own', () => {
  // Owner, 2026-09-30: 现在不知道index怎样和整体风格可以结合在一起，单独右下角跳转感觉效果很奇怪.
  const controls = source('src/components/home/ExplorerControls.tsx');
  const home = source('src/components/home/HomePage.tsx');
  const closing = source('src/components/home/ArchiveClosing.tsx');
  const css = source('src/styles/global.css');
  // No lone icon, no overlay of its own, no "Close index".
  assert.doesNotMatch(home, /indexOpen|openIndex|closeIndex|explorer-index|Close index/);
  assert.doesNotMatch(css, /\.explorer-index/);
  // The panel's two views, a tab list in its head; the sheet set on intent.
  assert.match(controls, /role="tablist" aria-label="Places"/);
  assert.match(controls, /\{tab\(tabPlacesId, 'places', listId, 'Places', total, `Places, \$\{pad2\(total\)\}`\)\}/);
  assert.match(controls, /\{tab\(tabSheetId, 'sheet', sheetId, 'Contact sheet', frames, `Contact sheet, \$\{frames\} frames`\)\}/);
  assert.match(controls, /role="tab"[\s\S]*aria-selected=\{view === own\}/);
  assert.match(controls, /\{sheetWanted && sheet\}/);
  // Esc, the bar, a click outside or the head's close put it away (not while
  // a story is up over it); focus goes back to the bar.
  assert.match(controls, /if \(!listOpen \|\| suspended\) return;/);
  assert.match(controls, /onListOpen\(false\);\s*toggleRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
  // HomePage: the sheet is the closing's, set in the panel; the panel opens
  // on the places every time; a story from the sheet leaves the panel open.
  assert.match(home, /<ArchiveClosing collections=\{orderedCities\} onOpenStory=\{openStoryFromClosing\} frame="panel" \/>/);
  assert.match(home, /setListOpen\(open\);\s*if \(open\) setPanelView\('places'\);/);
  assert.equal((home.match(/sheet=\{contactSheet\}/g) ?? []).length, 2, 'the desktop and the phone');
  assert.equal((home.match(/suspended=\{storyActive\}/g) ?? []).length, 2);
  assert.match(home, /const pageInert = storyActive;/);
  assert.match(closing, /frame = 'page'/);
  assert.match(closing, /proofLayout\(W, H, chapters, metrics, panel \? PANEL_BOUNDS : PAGE_BOUNDS\)/);
  assert.match(closing, /\{panel && !geo && \(\s*<FlowSheet/);
  // The paper: its views are set at the room's size and the paper cuts them
  // (nothing laid out again as it grows); a change of view is a large
  // plane's move, opening and closing the house curve.
  const panel = css.slice(css.indexOf('/* ── The places panel: one paper, two views ──'), css.indexOf('/* The contact sheet in the panel'));
  assert.match(panel, /\.explorer-panel \{[^}]*container-type: size;/);
  assert.match(panel, /\.explorer-panel__paper \{[^}]*overflow: hidden;/);
  assert.match(panel, /\.explorer-sheet \{\s*width: calc\(100cqw - 2px\);\s*height: calc\(100cqh - var\(--head-h\) - 3px\);/);
  assert.match(panel, /\.explorer-panel\[data-open\]\[data-move='grow'\] \.explorer-panel__paper \{\s*transition:\s*top var\(--dur-grow\) var\(--ease-plane\),\s*left var\(--dur-grow\) var\(--ease-plane\),/);
  assert.match(panel, /\.explorer-panel\[data-open\]\[data-view='sheet'\] \.explorer-panel__paper \{\s*top: 0;\s*left: 0;\s*\}/);
  // …and the sheet put away folds back down into the bar the same way.
  assert.match(panel, /\.explorer-panel\[data-move='grow'\]:not\(\[data-open\]\) \.explorer-panel__paper \{\s*transition:\s*top var\(--dur-grow\) var\(--ease-plane\),/);
  assert.match(controls, /if \(prevRef\.current\.open !== open\) moveRef\.current = !open && view === 'sheet' \? 'grow' : 'open';\s*else if \(prevRef\.current\.view !== view\) moveRef\.current = 'grow';/);
  // No lime of its own but the keyboard's ring.
  assert.equal((panel.match(/#D2FF00/gi) ?? []).length, 1);
  for (const [, value] of panel.matchAll(/letter-spacing: ([\d.]+)em/g)) assert.ok(Number(value) <= 0.1, value);
});

test('the contact sheet is set in the panel\'s own room, and flows where the proof cannot be set', () => {
  // The archive as it stands (read off the built sheet, 2026-09-30): its
  // type in its own faces, and its six rolls, frame by frame (A across, P
  // upright).
  const metrics = { ordinalEm: 1.167, metaW: 92, figureEm: [1.194, 1.083, 5.111], figureLabelW: [61, 48, 38], countEm: 1.222 };
  const rolls = ['AP AAAAA PPP AA PP A', 'PPPPP A PPPPPPPPPPP', 'P A PPP A PPPP A', 'AA PP AAAA', 'AAAAA', 'PA']
    .map((roll) => Array.from(roll.replace(/ /g, ''), (mark) => (mark === 'A' ? 1.507 : 0.662)));
  const chapters = rolls.map((ratios, row) => ({
    id: `c${row}`, slug: `s${row}`, ordinal: String(row + 1).padStart(2, '0'), place: `Place ${row}`, region: 'Region', year: '2026',
    coverUrl: '', coverRatio: 1.5,
    frames: ratios.map((ratio, k) => ({ url: `u${row}-${k}`, ratio, isCover: k === 0 })),
  }));
  assert.deepEqual(chapters.map((chapter) => chapter.frames.length), [15, 17, 11, 8, 5, 2]);
  // The panel's sheet at 1728 × 1000 and 1280 × 800 (the panel less its head).
  for (const [W, H] of [[1614, 767], [1171, 576]]) {
    const layout = proofLayout(W, H, chapters, metrics, PANEL_BOUNDS);
    assert.ok(layout, `${W}×${H}`);
    assert.equal(layout.bounds, PANEL_BOUNDS);
    for (const box of [...layout.frames, ...layout.stubs]) {
      assert.ok(box.x >= PANEL_BOUNDS.M - 0.5 && box.x + box.w <= W - PANEL_BOUNDS.M + 0.5, `x ${box.x}+${box.w} in ${W}`);
      assert.ok(box.y >= PANEL_BOUNDS.top && box.y + box.h <= H - PANEL_BOUNDS.FOOT, `y ${box.y}+${box.h} in ${H}`);
    }
    const copy = placeCopy(layout, 88);
    assert.ok(copy.y + copyHeight(copy.titleSize, layout.figureSize, false) <= H - PANEL_BOUNDS.copyFoot + 1);
    assert.equal(copyBox(layout, copy).h, copyHeight(copy.titleSize, layout.figureSize, false));
  }
  // The page's sheet is what it was.
  assert.deepEqual(proofLayout(1728, 1000, chapters, metrics), proofLayout(1728, 1000, chapters, metrics, PAGE_BOUNDS));
  assert.equal(PAGE_BOUNDS.top, PROOF.NAV);
  assert.equal(PAGE_BOUNDS.links, true);
  assert.equal(PANEL_BOUNDS.links, false);
  // The phone: no proof — the rolls flow (FlowSheet).
  assert.equal(proofLayout(364, 647, chapters, metrics, PANEL_BOUNDS), null);
});

