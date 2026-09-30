// Run offline: node --experimental-strip-types --test scripts/proof-plates.test.mjs
//
// The proof's plates from the first paint (src/lib/proofPlates.ts): the head
// script built from proofPlates' own source, run in a sandbox with the
// browser's pieces mocked — the document streaming in, the stylesheets, the
// proof's lights (its CSS animation), the first word's face, the timeline,
// the Skip pill's tap. Held here: the lime on the proof's own sixth once the
// face is in (or its wait is up), the word a third of a second after it,
// both held at the stylesheet's own unprinted values to a hair before their
// beats and filled both ways (never a composited first keyframe before the
// start: the lime flash); no plate laid after a tap on the pill, which
// marks html[data-skip-pending] until the island is up (a plate already
// laid prints on its beat); nothing for the
// verification hook, a second run, or a film that does not play.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const load = async (file) => {
  const bundled = await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral' });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
};
const V = await load('../src/lib/proofPlates.ts');
const F = await load('../src/lib/openingFilm.ts');
const CUT = F.CUT_MS;
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const flush = () => new Promise((resolve) => setImmediate(resolve));

// A document streaming in, with just enough of a browser for the script.
function sandbox({ opening = '', search = '', readyState = 'loading', vignetteNow = false, lights = true, sheetPending = false, faceMs = 0, faceNever = false, hidden = false, perf = false } = {}) {
  const attrs = { 'data-reel': 'reel' };
  if (opening != null) attrs['data-opening'] = opening;
  const root = {
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => (attrs[k] = String(v)),
    hasAttribute: (k) => k in attrs,
    removeAttribute: (k) => delete attrs[k],
  };
  // clock.stale: what the timeline still reads in a tab that draws no frame.
  const clock = { now: 0, stale: null };
  const timers = [];
  const setTimeout = (fn, ms) => timers.push({ at: clock.now + ms, fn });
  const advance = async (to) => {
    clock.now = to;
    for (const t of timers.filter((x) => x.at <= to && !x.done)) {
      t.done = true;
      t.fn();
    }
    await flush();
    await flush();
  };
  const anims = [];
  const element = (name) => ({
    name,
    animate(frames, opts) {
      const a = { el: name, frames, opts, startTime: null, finished: false, finish() { this.finished = true; } };
      anims.push(a);
      return a;
    },
  });
  const block = element('block');
  const word = element('word');
  let lightsReady;
  // The lights: a CSS animation, restartable (cancel: idle, a new resolved
  // ready; play: pending until its next frame, a new ready).
  const lightsAnim = {
    animationName: 'of-proof-lights',
    startTime: null,
    playState: 'running',
    restarts: 0,
    ready: new Promise((r) => (lightsReady = r)),
    cancel() {
      this.startTime = null;
      this.playState = 'idle';
      this.ready = Promise.resolve(this);
    },
    play() {
      this.playState = 'running';
      this.restarts += 1;
      this.ready = new Promise((r) => (lightsReady = r));
    },
  };
  const vignette = { getAnimations: () => (lights ? [lightsAnim, { animationName: 'of-failsafe' }] : []) };
  const found = [];
  if (vignetteNow) found.push(vignette);
  const listeners = {};
  let sheetLoad = null;
  const link = { sheet: sheetPending ? null : {}, addEventListener: (type, fn) => type === 'load' && (sheetLoad = fn) };
  let observer = null;
  class MutationObserver {
    constructor(fn) {
      this.fn = fn;
      this.on = false;
      observer = this;
    }
    observe() {
      this.on = true;
    }
    disconnect() {
      this.on = false;
    }
  }
  let faceDone;
  const face = new Promise((r) => (faceDone = r));
  let visibility = hidden ? 'hidden' : 'visible';
  const document = {
    readyState,
    documentElement: root,
    get visibilityState() { return visibility; },
    timeline: { get currentTime() { return clock.stale ?? clock.now; } },
    fonts: { load: (f, sample) => { document.fontAsked = [f, sample]; return face; } },
    getElementsByClassName: (c) => (c === 'of-frame__vignette' ? found : []),
    querySelector: (sel) => (sel === '.of-key[data-key="0"] [data-block]' ? block : sel === '.of-key[data-key="0"] [data-word]' ? word : null),
    querySelectorAll: (sel) => (sel === 'link[rel="stylesheet"]' ? [link] : []),
    addEventListener: (type, fn, capture) => ((listeners[type] ??= []).push({ fn, capture })),
    removeEventListener: (type, fn) => (listeners[type] = (listeners[type] ?? []).filter((l) => l.fn !== fn)),
  };
  const window = {};
  const globals = { window, document, location: { search }, setTimeout, MutationObserver, Promise, Math, Number, JSON };
  if (perf) globals.performance = { now: () => clock.now };
  const context = vm.createContext(globals);
  const run = () => vm.runInContext(V.proofHeadScript(), context);
  // The island's own start (an in-site arrival: no head script, no taps).
  const runIsland = () => vm.runInContext(`(${V.proofPlates.toString()})(${JSON.stringify(V.PLATES)}, false)`, context);
  return {
    run,
    runIsland,
    document,
    window,
    attrs,
    anims,
    listeners,
    clock,
    advance,
    get observer() { return observer; },
    // The stream reaches the proof's vignette (a mutation).
    stream: async () => {
      found.push(vignette);
      observer?.fn([]);
      await flush();
    },
    contentLoaded: async () => {
      (listeners.DOMContentLoaded ?? []).forEach((l) => l.fn());
      await flush();
    },
    sheetIn: async () => {
      link.sheet = {};
      sheetLoad?.();
      await flush();
    },
    // The proof's first frame (the lights start).
    firstFrame: async (at) => {
      clock.now = at;
      lightsAnim.startTime = at;
      lightsReady();
      await flush();
      await flush();
    },
    faceIn: async (at) => {
      clock.now = at;
      if (!faceNever) faceDone([]);
      await flush();
      await flush();
    },
    tap: (target) => (listeners.click ?? []).forEach((l) => l.fn({ target })),
    lights: lightsAnim,
    // The tab hidden, or shown (its visibilitychange; the time it is shown).
    hide: async () => {
      visibility = 'hidden';
      (listeners.visibilitychange ?? []).forEach((l) => l.fn());
      await flush();
    },
    show: async (at) => {
      clock.now = at;
      visibility = 'visible';
      (listeners.visibilitychange ?? []).slice().forEach((l) => l.fn());
      await flush();
      await flush();
    },
    faceMs,
  };
}
const pill = { closest: (sel) => (sel === '.of-skip' ? {} : null) };
// The plate's opacity at a document time (its keyframes, linear, fill both).
const valueAt = (a, t) => {
  const local = Math.min(Math.max(t - a.startTime, 0), a.opts.duration) / a.opts.duration;
  const fr = a.frames;
  for (let i = fr.length - 1; i >= 0; i -= 1) {
    if (fr[i].offset <= local) {
      const next = fr[i + 1];
      if (!next || next.offset === fr[i].offset) return fr[i].opacity;
      return fr[i].opacity + ((next.opacity - fr[i].opacity) * (local - fr[i].offset)) / (next.offset - fr[i].offset);
    }
  }
  return fr[0].opacity;
};

test('the config is the plan\'s: the grid, the beats, the face and its wait, the ink, the hair', () => {
  const P = V.PLATES;
  assert.equal(P.cut, CUT);
  assert.equal(P.lime, F.PRELUDE.beats.paint - F.PRELUDE.beats.lime);
  assert.equal(P.word, F.PRELUDE.beats.lime - F.PRELUDE.beats.word);
  assert.equal(P.face, F.PROOF_FACE);
  assert.equal(P.wait, F.PROOF_FACE_WAIT_MS);
  assert.equal(P.hair, F.GRID_HAIR_MS);
  assert.equal(P.unprinted, F.PRELUDE.unprinted);
  assert.deepEqual(P.ink, F.proofInk().map((k) => [k.at, k.opacity]));
  assert.equal(P.lights, 'of-proof-lights');
  assert.ok(P.lead >= 2 * (1000 / 60) && P.lead <= 100, 'laid a few frames ahead of its beat');
  // Built from its very source, self-contained (no module binding at run time).
  const src = V.proofHeadScript();
  assert.ok(src.includes(`var proofPlates=${V.proofPlates.toString()};`));
  assert.doesNotMatch(V.proofPlates.toString(), /requestAnimationFrame/, 'never asks for a frame (before the stylesheets, one is a blank frame)');
});

test('a fast load: the lime on the proof\'s third sixth, the word a third of a second on; held unprinted to a hair before each, filled both ways', async () => {
  const s = sandbox();
  s.run();
  const plates = s.window.__proofPlates;
  assert.ok(plates && plates.lime == null);
  assert.equal(s.observer.on, true, 'watching the stream');
  await s.stream();
  assert.equal(s.observer.on, false);
  await s.faceIn(900);
  assert.equal(s.anims.length, 0, 'nothing before the proof\'s first frame');
  await s.firstFrame(1000);
  const lime = 1000 + 2 * CUT;
  assert.ok(close(plates.origin, 1000) && close(plates.lime, lime), JSON.stringify(plates));
  assert.ok(close(await plates.decided, lime));
  const [b, w] = s.anims;
  assert.equal(b.el, 'block');
  assert.equal(w.el, 'word');
  for (const a of [b, w]) {
    assert.equal(a.opts.fill, 'both');
    assert.equal(a.opts.easing, 'linear');
    assert.ok(close(a.startTime, 1000 - F.GRID_HAIR_MS), 'from the proof\'s first frame');
    assert.equal(a.frames[0].offset, 0);
  }
  const hair = F.GRID_HAIR_MS;
  assert.equal(valueAt(b, 1000), F.PRELUDE.unprinted);
  assert.equal(valueAt(b, lime - hair - 0.01), F.PRELUDE.unprinted, 'unprinted to its beat');
  assert.ok(close(valueAt(b, lime - hair), F.PRELUDE.limeInk), 'its first impression on its beat, a hair ahead');
  assert.equal(valueAt(b, lime + F.PRELUDE.set), 1);
  assert.equal(valueAt(b, lime + 5000), 1, 'at rest printed');
  const wordAt = lime + 2 * CUT;
  assert.equal(valueAt(w, wordAt - hair - 0.01), 0);
  assert.equal(valueAt(w, wordAt - hair), 1);
  assert.equal(valueAt(w, wordAt + 5000), 1);
  const rec = s.window.__proofPlates.anims;
  assert.ok(rec.length === 2 && rec[0] === b && rec[1] === w, 'its record: the plates it laid');
});

test('a slow face: the lime on the first sixth after it (never alone longer than its beat); the face asked for at once; its wait capped', async () => {
  const s = sandbox();
  s.run();
  assert.equal(s.window.__proofPlates && 1, 1);
  await s.stream();
  await s.firstFrame(1000);
  assert.equal(s.anims.length, 0, 'waiting for the face');
  await s.faceIn(1700);
  const lime = F.limeBeat(1000, 1700 + V.PLATES.lead);
  assert.ok(close(lime, 1000 + 5 * CUT), `${lime}`);
  assert.ok(close(s.window.__proofPlates.lime, lime));
  const [b, w] = s.anims;
  assert.ok(close(valueAt(w, lime + 2 * CUT - F.GRID_HAIR_MS), 1) && valueAt(w, lime + 2 * CUT - 1) === 0, 'the word a third of a second after the lime');
  assert.ok(valueAt(b, lime - 1) < 0.01);
  // The face never comes: printed when its wait is up (a stand-in face).
  const n = sandbox({ faceNever: true });
  n.run();
  await n.stream();
  await n.firstFrame(1000);
  await n.faceIn(1500);
  assert.equal(n.anims.length, 0);
  await n.advance(1000 + V.PLATES.wait + 1);
  assert.ok(close(n.window.__proofPlates.lime, F.limeBeat(1000, 1000 + V.PLATES.wait + 1 + V.PLATES.lead)));
  // The face is asked for as the script runs, not once the proof is laid out.
  const early = sandbox();
  early.run();
  assert.deepEqual(early.document.fontAsked, [F.PROOF_FACE, 'ARCHIVE']);
});

test('the grid, over many loads: the lime on the proof\'s sixth, the first it can make once the face is in', async () => {
  const rand = F.seeded(907);
  for (let i = 0; i < 60; i += 1) {
    const o = 200 + rand() * 3000;
    const faceAt = o + rand() * 1100;
    const s = sandbox();
    s.run();
    await s.stream();
    await s.firstFrame(o);
    await s.faceIn(faceAt);
    const lime = s.window.__proofPlates.lime;
    assert.ok(close(lime, F.limeBeat(o, faceAt + V.PLATES.lead), 1e-6), `${o} ${faceAt}`);
    assert.ok(close((lime - o) / CUT, Math.round((lime - o) / CUT), 1e-6), 'on the grid');
  }
});

test('the stream: the vignette found as it streams in; the stylesheets waited for; nothing to count from, nothing printed', async () => {
  const s = sandbox({ sheetPending: true });
  s.run();
  await s.stream();
  await s.faceIn(900);
  await s.firstFrame(1000);
  assert.equal(s.anims.length, 0, 'the page\'s stylesheets are not in yet');
  await s.sheetIn();
  await s.faceIn(1010);
  await flush();
  assert.ok(close(s.window.__proofPlates.lime, 1000 + 2 * CUT));
  // Already in the document (the island starts it on an in-site arrival):
  // at once, and no taps of its own.
  const now = sandbox({ vignetteNow: true, readyState: 'complete' });
  const p = now.runIsland();
  assert.equal(now.observer, null, 'nothing to watch');
  assert.equal((now.listeners.click ?? []).length, 0);
  await now.firstFrame(1000);
  await now.faceIn(1010);
  assert.ok(close(p.lime, 1000 + 2 * CUT));
  // No lights (reduced motion, an engine without them): nothing, at once.
  const rm = sandbox({ lights: false });
  rm.run();
  await rm.stream();
  assert.equal(await rm.window.__proofPlates.decided, null);
  assert.equal(rm.anims.length, 0);
  // The document ends without the film: nothing.
  const none = sandbox();
  none.run();
  await none.contentLoaded();
  assert.equal(await none.window.__proofPlates.decided, null);
});

test('a tap on the Skip pill before the island is up: html[data-skip-pending], and no plate laid after it; the island\'s own taps once it is up', async () => {
  const s = sandbox();
  s.run();
  const click = s.listeners.click;
  assert.equal(click.length, 1);
  assert.equal(click[0].capture, true, 'capture: before anything under it');
  await s.stream();
  s.tap({ closest: () => null });
  assert.equal(s.attrs['data-skip-pending'], undefined, 'a tap anywhere else does nothing');
  s.tap(pill);
  assert.equal(s.attrs['data-skip-pending'], '');
  assert.equal(await s.window.__proofPlates.decided, null);
  await s.firstFrame(1000);
  await s.faceIn(1010);
  assert.equal(s.anims.length, 0, 'no plate after the tap');
  // Once the island is up (data-opening="run") the tap is its own.
  const up = sandbox();
  up.run();
  up.attrs['data-opening'] = 'run';
  up.tap(pill);
  assert.equal(up.attrs['data-skip-pending'], undefined);
  up.window.__proofPlates.off();
  assert.equal(up.listeners.click.length, 0, 'stopped by the island');
  // A tap after the plates are printed: marked all the same (the island
  // goes to the end title); the plates stay as printed.
  const late = sandbox();
  late.run();
  await late.stream();
  await late.firstFrame(1000);
  await late.faceIn(1010);
  late.tap(pill);
  assert.equal(late.attrs['data-skip-pending'], '');
  assert.equal(late.anims.length, 2);
});

test('a tab opened in the background: nothing counted or laid while it is hidden; shown, the lights go down again from its first frame and the grid is counted from there', async () => {
  const s = sandbox({ hidden: true });
  s.run();
  const plates = s.window.__proofPlates;
  assert.equal((s.listeners.visibilitychange ?? []).length, 1, 'listening for the tab to be shown');
  await s.stream();
  // Its timeline stands still: the lights "start" at 0 and play unseen.
  await s.firstFrame(0);
  await s.faceIn(0);
  await s.advance(V.PLATES.wait + 1);
  assert.equal(s.anims.length, 0, 'no plate laid while hidden');
  assert.equal(plates.lime, null);
  assert.equal(s.lights.restarts, 0);
  // Shown at 3000: in the event itself (before its first frame is drawn),
  // the lights go down again; nothing laid until they have their new start.
  await s.show(3000);
  assert.equal(s.lights.restarts, 1, 'the lights restarted');
  assert.equal(s.lights.startTime, null, 'pending: they start on the first frame drawn');
  assert.equal(s.anims.length, 0);
  // The first frame the reader sees.
  await s.firstFrame(3016);
  assert.ok(close(plates.origin, 3016), `${plates.origin}`);
  assert.ok(close(plates.lime, 3016 + 2 * CUT), `${plates.lime}`);
  assert.ok(close(await plates.decided, 3016 + 2 * CUT));
  const [b, w] = s.anims;
  assert.ok(close(b.startTime, 3016 - F.GRID_HAIR_MS) && close(w.startTime, 3016 - F.GRID_HAIR_MS), 'from the first frame the reader sees');
  assert.equal(valueAt(b, 3016 + 2 * CUT - 1), F.PRELUDE.unprinted);
  assert.equal(valueAt(w, 3016 + 4 * CUT - 1), 0);
  assert.equal((s.listeners.visibilitychange ?? []).length, 0, 'let go once decided');
  // Shown again later: the lights are never played twice.
  await s.hide();
  await s.show(9000);
  assert.equal(s.lights.restarts, 1);
});

test('hidden after it was seen: nothing laid while hidden; shown again, the lights are not played twice and the lime is on the first sixth of their grid it can make, whatever the stale timeline reads', async () => {
  const s = sandbox({ perf: true });
  s.run();
  await s.stream();
  await s.firstFrame(1000);
  await s.hide();
  await s.faceIn(1100);
  assert.equal(s.anims.length, 0, 'no plate laid while hidden');
  // Shown at 6000; the timeline still reads the last frame it drew.
  s.clock.stale = 1100;
  await s.show(6000);
  assert.equal(s.lights.restarts, 0, 'seen: never played twice');
  const lime = s.window.__proofPlates.lime;
  assert.ok(close(lime, F.limeBeat(1000, 6000 + V.PLATES.lead)), `${lime}`);
  assert.ok(lime >= 6000 + V.PLATES.lead, 'never a beat already spent');
  assert.ok(close((lime - 1000) / CUT, Math.round((lime - 1000) / CUT)), 'on the lights\' grid');
  // Shown throughout: the listener has nothing to do.
  const v = sandbox();
  v.run();
  await v.stream();
  await v.firstFrame(1000);
  await v.faceIn(1010);
  assert.equal(v.lights.restarts, 0);
  assert.ok(close(v.window.__proofPlates.lime, 1000 + 2 * CUT));
});

test('nothing for the verification hook, a document already loaded, or a film that does not play', () => {
  for (const opts of [{ search: '?filmT=-500' }, { search: '?a=1&filmT=0' }, { readyState: 'interactive' }, { opening: null }]) {
    const s = sandbox(opts);
    s.run();
    assert.equal(s.window.__proofPlates, undefined, JSON.stringify(opts));
    assert.equal((s.listeners.click ?? []).length, 0);
  }
});
