// Run offline: node --experimental-strip-types --test scripts/story-overlay.test.mjs
//
// The story overlay (MagazineLayout over the Homepage), round wf45's final
// check. Its open and close brought the page's style and layout up to date
// about fourteen times from script (11 passes, 35–37 ms at the open, 3 and
// 12–13 ms at the close, on a phone at a quarter of the CPU): the scroller
// put back to a top it was already at, framer's scroll tracker measuring the
// scroller as it attached, the focus moved mid-commit, the frames' rows and
// the running head's sentinels read off the elements. And the blurred,
// receded atlas under an open story went on being drawn, the whole screen
// blurred anew under an opaque story (on the weak-GPU stand-in: the GPU busy
// 2.2 s of a 4.7 s read; 0.6–0.8 s once it is not drawn). Held here: none of
// that comes back, and the page under the story is drawn again — as it was —
// in the very commit that begins the close.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const story = source('src/components/home/MagazineLayout.tsx');
const home = source('src/components/home/HomePage.tsx');
const css = source('src/styles/global.css');

test('focus at the open and the close waits for the next layout (a resize observer\'s first word), once, and can be called off', () => {
  const start = story.indexOf('function afterNextFrame(');
  const end = story.indexOf('\n}\n', start) + 2;
  assert.ok(start > 0 && end > start);
  const { code } = transformSync(story.slice(start, end), { loader: 'ts' });
  const observers = [];
  class FakeObserver {
    constructor(callback) { this.callback = callback; this.targets = []; this.on = true; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.on = false; }
  }
  const root = { tag: 'html' };
  const make = new Function('ResizeObserver', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', 'window', `${code}; return afterNextFrame;`);
  const afterNextFrame = make(FakeObserver, { documentElement: root }, () => { throw new Error('no frame callback with an observer'); }, () => {}, {});
  let calls = 0;
  afterNextFrame(() => { calls += 1; });
  assert.equal(observers.length, 1);
  assert.deepEqual(observers[0].targets, [root], 'the page itself is observed: its first word comes after the next layout');
  assert.equal(calls, 0, 'nothing at once (mid-commit)');
  observers[0].callback([]);
  observers[0].callback([]);
  assert.equal(calls, 1, 'once, on the observer\'s first word');
  assert.equal(observers[0].on, false, 'and the observer let go');
  const cancel = afterNextFrame(() => { calls += 1; });
  cancel();
  observers[1].callback([]);
  assert.equal(calls, 1, 'a cancelled focus never runs');
  // Every focus of the story's: the shell's at the open, Back's once live,
  // and the way back to what opened it at the close.
  assert.match(story, /return afterNextFrame\(\(\) => dialogRef\.current\?\.focus\(\{ preventScroll: true \}\)\);/);
  assert.match(story, /return afterNextFrame\(\(\) => closeButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)\);/);
  assert.match(story, /afterNextFrame\(\(\) => \{\n\s*const active = document\.activeElement;[\s\S]{0,200}previous\.focus\(\{ preventScroll: true \}\);/);
  assert.doesNotMatch(story, /if \(previous\?\.isConnected\) previous\.focus\(/, 'never mid-commit');
});

test('the story\'s scroll: its own scroll events, and a scroller put back to its top only when it is off it', () => {
  assert.doesNotMatch(story, /useScroll\(/, 'framer\'s tracker measured the scroller as it attached');
  assert.match(story, /const \[scrollY\] = useState\(\(\) => motionValue\(0\)\);/);
  assert.match(story, /const onScroll = \(\) => \{\n\s*const top = root\.scrollTop;\n\s*scrolledRef\.current = top !== 0;\n\s*scrollY\.set\(top\);/);
  assert.match(story, /root\.addEventListener\('scroll', onScroll, \{ passive: true \}\);/);
  // A new story opens at its top: written only where the scroller is off it
  // (a story just mounted is there; the write laid the whole new story out
  // in the commit, 34 ms of the open on a phone at a quarter speed).
  assert.match(story, /if \(!el \|\| !scrolledRef\.current\) return;\n\s*scrolledRef\.current = false;\n\s*const behavior = el\.style\.scrollBehavior;\n\s*el\.style\.scrollBehavior = 'auto';\n\s*el\.scrollTop = 0;/);
});

test('rows, folio and sentinels are read where the layout is already up to date', () => {
  // The kept stub's rows and the phone's folio: measured in their resize
  // observer's first word (after the story's layout, before its paint), not
  // in the commit's wake.
  assert.match(story, /if \(typeof ResizeObserver === 'undefined'\) \{\n\s*measure\(\);\n\s*return;\n\s*\}\n[\s\S]{0,400}const observer = new ResizeObserver\(\(\) => measure\(\)\);/);
  assert.match(story, /if \(typeof ResizeObserver === 'undefined'\) \{\n\s*measure\(\);\n\s*return;\n\s*\}\n\s*const observer = new ResizeObserver\(measure\);\n\s*if \(frameGridRef\.current\) observer\.observe\(frameGridRef\.current\);\n\s*observer\.observe\(root\);\n\s*return \(\) => observer\.disconnect\(\);\n\s*\}, \[entryLanded, collection\._id, paintFolio\]\);/);
  // The running head's sentinel not laid out at this width: off the entry.
  assert.match(story, /if \(!entry\.boundingClientRect\.width && !entry\.boundingClientRect\.height\) continue;/);
  assert.doesNotMatch(story, /\(entry\.target as HTMLElement\)\.offsetParent/);
  // The frames' reach: the cached viewport, not a live innerHeight.
  assert.match(story, /entry\.boundingClientRect\.top < viewport\(\)\.h/);
});

test('over the whole screen, the page under the story is not drawn — and drawn again in the commit that begins the close', () => {
  // MagazineLayout says so once: the shell faded in and the panel risen
  // (each as its own animation completes), or the plate grown (the landing).
  assert.match(story, /onAnimationComplete=\{\(\) => settleCover\('shell'\)\}/);
  assert.match(story, /onAnimationComplete=\{\(\) => settleCover\('panel'\)\}/);
  assert.match(story, /if \(cover\.told \|\| !cover\.shell \|\| !cover\.panel \|\| !isPresentRef\.current \|\| !onCoveredRef\.current\) return;/);
  assert.match(story, /if \(!plateEntry \|\| !entryLanded \|\| !isPresent\) return;\n\s*settleCover\('shell'\);\n\s*settleCover\('panel'\);/);
  // The Homepage writes the mark on <main> itself (no render of the page),
  // only beside data-story-under, and wipes it at every open and close.
  assert.match(home, /onCovered=\{markStoryCovered\}/);
  assert.match(home, /if \(main\?\.dataset\.storyUnder === 'true'\) main\.setAttribute\('data-story-covered', ''\);/);
  const clears = home.match(/clearStoryCovered\(\);/g) ?? [];
  assert.equal(clears.length, 3, 'open, close, and the close done');
  assert.match(home, /clearStoryCovered\(\);\n\s*setStoryClosing\(false\);\n\s*setSelectedCollection\(collection\);/);
  assert.match(home, /clearStoryCovered\(\);\n\s*setStoryClosing\(true\);\n\s*setSelectedCollection\(null\);/);
  // The rules count only beside data-story-under: the commit that begins the
  // close (data-story-under goes) draws the page again in the same style
  // pass, and the recede's way back runs as it always did.
  const hide = css.match(/main\[data-story-under="true"\]\[data-story-covered\] :is\(([^)]*\)[^)]*)\) \{\s*visibility: hidden;\s*\}/);
  assert.ok(hide, 'hidden only beside data-story-under');
  for (const sel of ['.route-atlas', '.archive-dock-host:not(.archive-dock-host--atlas)', '[data-archive-column]', '.explorer-controls']) assert.ok(hide[1].includes(sel), sel);
  assert.match(css, /main\[data-story-under="true"\]\[data-story-covered\] :is\(\.route-atlas, \.archive-dock-host:not\(\.archive-dock-host--atlas\), \[data-archive-column\]\) \{\s*transition: none;\s*\}/);
  assert.doesNotMatch(css, /(?<!\[data-story-under="true"\])\[data-story-covered\][^{]*\{/, 'never on its own');
  // The recede itself is unchanged.
  assert.match(css, /main\[data-story-under="true"\] \.route-atlas,\nmain\[data-story-under="true"\] \.archive-dock-host:not\(\.archive-dock-host--atlas\) \{\s*transform: scale\(1\.12\);\s*filter: blur\(10px\);\s*transition-delay: 0\.25s;\s*\}/);
});
