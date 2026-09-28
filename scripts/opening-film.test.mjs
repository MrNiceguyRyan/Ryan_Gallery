// Run offline: node --experimental-strip-types --test scripts/opening-film.test.mjs
//
// The opening film (src/lib/openingFilm.ts): the cut schedule (12–16 scenes
// on a desktop, fewer on a phone, a trailer's accelerating rhythm, a
// clapperboard that holds), the runs (each word hunted in one run of match
// cuts; the first screen's own words all found), the fast-forward (to the
// clapperboard, never past the landing, never back, nothing after the clap),
// the globe's lead, the camera (the word on the focus at the run's size;
// continuous across a match cut; a push that only grows), the finder's track
// (a pulse inside a run, a travel between runs), landing A's flights,
// landing B's portal (the counter at the start, the globe's disc at the end,
// a zoom about one point), the landing choice, the flash safety of the cuts,
// and the seeded material the server and client both draw.
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/openingFilm.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
});
const F = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('the schedule: 12–16 scenes on a desktop, fewer on a phone, every scene once', () => {
  assert.ok(F.FILM_DESKTOP.length >= 12 && F.FILM_DESKTOP.length <= 16, `${F.FILM_DESKTOP.length} scenes`);
  assert.ok(F.FILM_PHONE.length < F.FILM_DESKTOP.length);
  for (const film of [F.FILM_DESKTOP, F.FILM_PHONE]) {
    const ids = film.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, 'no scene twice');
    assert.equal(ids[0], 'code', 'it opens on the code');
    assert.equal(ids[ids.length - 1], 'slate', 'it ends on the clapperboard');
    // Every phone scene is one of the desktop's (the same film, fewer).
    for (const id of F.FILM_PHONE.map((s) => s.id)) assert.ok(F.FILM_DESKTOP.some((s) => s.id === id), id);
  }
});

test('the rhythm: 5–7 s to the clap; cuts shorten like a trailer, ~700 ms early to ~250 ms late', () => {
  const cuts = F.cutSchedule(F.FILM_DESKTOP);
  const end = F.filmLength(cuts);
  assert.ok(end >= 5000 && end <= 7000, `desktop ${end} ms`);
  const phone = F.filmLength(F.cutSchedule(F.FILM_PHONE));
  assert.ok(phone >= 3500 && phone < end, `phone ${phone} ms`);
  // The middle scenes (after the code's lock, before the clapperboard's
  // hold) never lengthen.
  const middle = F.FILM_DESKTOP.slice(1, -1).map((s) => s.ms);
  for (let i = 1; i < middle.length; i += 1) assert.ok(middle[i] <= middle[i - 1], `cut ${i + 1}: ${middle[i]} after ${middle[i - 1]}`);
  assert.ok(middle[0] <= 720 && middle[0] >= 560, `first cut ${middle[0]}`);
  assert.ok(middle[middle.length - 1] >= 240 && middle[middle.length - 1] <= 300, `last cut ${middle[middle.length - 1]}`);
  // The code holds for its lock and lift (on a phone too: every beat ends
  // inside the scene); the clapperboard long enough to read.
  for (const film of [F.FILM_DESKTOP, F.FILM_PHONE]) {
    const code = film[0].ms;
    for (const beat of [F.CODE_BEATS.lift, F.CODE_BEATS.dim, F.CODE_BEATS.finder]) assert.ok(beat[0] < beat[1] && beat[1] <= code, `${beat} in ${code}`);
    const lastLock = F.CODE_BEATS.scramble + 6 * F.CODE_BEATS.stagger + F.CODE_BEATS.lockAfter;
    assert.ok(lastLock <= F.CODE_BEATS.lift[0] + 200, 'the word has locked before it is far off the rain');
  }
  assert.ok(F.FILM_DESKTOP.at(-1).ms >= 700);
  // Its beats fit inside it: the chalk, then the clap on the scene's end.
  const beats = F.slateBeats(F.FILM_DESKTOP.at(-1).ms);
  assert.equal(beats.clap[1], F.FILM_DESKTOP.at(-1).ms);
  assert.ok(beats.underline.at(-1) + beats.underlineMs < beats.clap[0]);
});

test('the cuts: contiguous from 0, one run per word, the first screen\'s words all found', () => {
  for (const film of [F.FILM_DESKTOP, F.FILM_PHONE]) {
    const cuts = F.cutSchedule(film);
    assert.equal(cuts[0].start, 0);
    for (let i = 1; i < cuts.length; i += 1) assert.equal(cuts[i].start, cuts[i - 1].end);
    const runs = [];
    cuts.forEach((c) => {
      if (c.runStart) runs.push(c.word);
      else assert.equal(c.word, cuts[c.index - 1].word);
    });
    assert.equal(new Set(runs).size, runs.length, 'each word in one run');
    for (const word of ['archive', 'travel', 'thought', 'ryanxu']) assert.ok(runs.includes(word), word);
    assert.equal(runs[0], 'archive');
    assert.equal(runs.at(-1), 'ryanxu');
    // sceneAt: the scene on screen at a time, the last holding.
    assert.equal(F.sceneAt(cuts, 0), 0);
    assert.equal(F.sceneAt(cuts, cuts[1].start), 1);
    assert.equal(F.sceneAt(cuts, cuts[1].start - 1), 0);
    assert.equal(F.sceneAt(cuts, 1e6), cuts.length - 1);
  }
  assert.ok(F.FILM_DESKTOP.some((s) => s.word === 'cinema'));
});

test('fast-forward: to the clapperboard with its tail left, never back, nothing after the clap', () => {
  for (const film of [F.FILM_DESKTOP, F.FILM_PHONE]) {
    const cuts = F.cutSchedule(film);
    const end = F.filmLength(cuts);
    const slate = cuts.at(-1);
    const target = end - F.FF_TAIL;
    assert.ok(target >= slate.start, 'inside the clapperboard');
    for (const t of [0, 10, 900, cuts[3].start + 5, slate.start, target - 1]) {
      const to = F.fastForwardTarget(cuts, t);
      assert.equal(to, target, `from ${t}`);
      assert.ok(to > t && to < end, 'forward, and the landing still to play');
    }
    assert.equal(F.fastForwardTarget(cuts, target), null, 'already there');
    assert.equal(F.fastForwardTarget(cuts, target + 50), null, 'never back');
    assert.equal(F.fastForwardTarget(cuts, end), null, 'the clap has come');
    assert.equal(F.fastForwardTarget(cuts, end + 400), null, 'landing');
    // The chalk is on the board by then (a fast-forward sees the found words).
    const beats = F.slateBeats(slate.ms);
    assert.ok(slate.start + beats.underline.at(-1) + beats.underlineMs <= target + 160);
  }
});

test('the globe: let go well before the clap, so its dawn is done under the film', () => {
  for (const film of [F.FILM_DESKTOP, F.FILM_PHONE]) {
    const cuts = F.cutSchedule(film);
    const at = F.globeReleaseAt(cuts);
    assert.ok(at >= 0);
    assert.ok(F.filmLength(cuts) - at >= 2500, 'at least 2.5 s of lead');
  }
});

test('the camera: the word on the focus at the run\'s cap height, and a push that only grows', () => {
  const anchor = { x: 820, y: 460, cap: 58 };
  const cam = F.cameraFor(anchor, [864, 460], 64, 0);
  assert.ok(close(cam.tx + anchor.x * cam.s, 864, 1e-9));
  assert.ok(close(cam.ty + anchor.y * cam.s, 460, 1e-9));
  assert.ok(close(anchor.cap * cam.s, 64, 1e-9));
  const pushed = F.cameraFor(anchor, [864, 460], 64, 1);
  assert.ok(close(anchor.cap * pushed.s, 64 * (1 + F.RUN_PUSH), 1e-9));
  assert.ok(F.RUN_PUSH > 0 && F.RUN_PUSH < 0.15, 'a slow push, not a zoom');
  // The CSS rule and the function agree.
  assert.equal(F.capFor(1728, 1000), 64);
  assert.equal(F.capFor(390, 844), 36);
  assert.equal(F.capFor(4000, 3000), 96);
});

test('a match cut: across a cut inside a run the word keeps its place and its size', () => {
  const cuts = F.cutSchedule(F.FILM_DESKTOP);
  const [w, h] = [1728, 1000];
  // Two different sheets, two different anchors: at the cut, both put their
  // word on one point at one size.
  const a = { x: 1100, y: 960, cap: 63 };
  const b = { x: 2450, y: 780, cap: 66 };
  for (let i = 1; i < cuts.length; i += 1) {
    if (cuts[i].runStart) continue;
    const t = cuts[i].start;
    const before = F.cameraFor(a, F.focusAt(cuts, i - 1, t, w, h, false), 64, F.runProgress(cuts, i - 1, t));
    const after = F.cameraFor(b, F.focusAt(cuts, i, t, w, h, false), 64, F.runProgress(cuts, i, t));
    assert.ok(close(before.tx + a.x * before.s, after.tx + b.x * after.s, 1e-6), `x at cut ${i}`);
    assert.ok(close(before.ty + a.y * before.s, after.ty + b.y * after.s, 1e-6), `y at cut ${i}`);
    assert.ok(close(a.cap * before.s, b.cap * after.s, 1e-6), `size at cut ${i}`);
  }
  // The run's progress only grows, and the code's run pushes from its
  // second scene (the first lifts its word instead).
  for (let i = 0; i < cuts.length; i += 1) {
    let last = -1;
    for (let t = cuts[i].start; t <= cuts[i].end; t += 17) {
      const p = F.runProgress(cuts, i, t);
      assert.ok(p >= last - 1e-12);
      last = p;
    }
  }
  assert.equal(F.runProgress(cuts, 0, cuts[0].end), 0);
});

test('the finder: a pulse onto the word inside a run, a travel to the next word between runs', () => {
  const cuts = F.cutSchedule(F.FILM_DESKTOP);
  const boxes = cuts.map((c, i) => {
    const b = { x: 600 + i * 7, y: 400 + i * 3, w: 400 + i, h: 90 };
    return [b, { ...b, x: b.x - 4, w: b.w + 8 }];
  });
  const keys = F.finderTrack(cuts, boxes, 1080);
  for (let i = 1; i < keys.length; i += 1) assert.ok(keys[i].t >= keys[i - 1].t, `key ${i} in time`);
  cuts.forEach((cut, i) => {
    if (i === 0) return;
    // (At a cut the previous scene's last key comes first, then this one's.)
    const first = keys.filter((k) => k.t === cut.start).at(-1);
    assert.ok(first, `a key on cut ${i}`);
    if (cut.runStart) {
      assert.equal(first.ease, 'travel');
      assert.deepEqual(first.box, boxes[i - 1][1], 'it leaves from the last word');
    } else {
      assert.equal(first.ease, 'arrive');
      assert.ok(first.box.w > boxes[i][0].w, 'a wider box closing in');
    }
    const last = keys.filter((k) => k.t === cut.end)[0];
    assert.deepEqual(last.box, boxes[i][1], 'on the word at the cut\'s end');
  });
});

test('landing A: every word flies from its box on the board to its glyph box, in order, inside the landing', () => {
  const src = { x: 500, y: 300, w: 400, h: 110 };
  const dst = { x: 104, y: 284, w: 700, h: 221 };
  const f = F.flightFor(src, dst, 64, 175, 0);
  assert.ok(close(f.dx, 700 - 454));
  assert.ok(close(f.dy, 355 - 394.5));
  assert.ok(close(f.k, 64 / 175));
  const delays = F.FLY_ORDER.map((_, i) => F.flightFor(src, dst, 1, 1, i).delay);
  for (let i = 1; i < delays.length; i += 1) assert.ok(delays[i] > delays[i - 1]);
  assert.ok(F.landingAEnd(F.FLY_ORDER.length) <= F.LANDING_A.done);
  assert.ok(F.LANDING_A.fly >= 1100 && F.LANDING_A.fly <= 1400, 'about 1.2 s');
  assert.ok(F.LANDING_A.rest < F.landingAEnd(F.FLY_ORDER.length));
  // The typeface crossfades inside the flight.
  assert.ok(F.LANDING_A.sourceOut[0] < F.LANDING_A.targetIn[1] && F.LANDING_A.targetIn[0] < F.LANDING_A.sourceOut[1]);
});

test('landing B: the counter at the start, the globe\'s disc at the end, one zoom about one point', () => {
  const c0 = [760, 640];
  const r0 = 9;
  const target = F.portalTarget(1728, 1000, false);
  const globe = F.firstScreenGlobe(1728, 1000);
  assert.deepEqual(target, globe);
  assert.ok(close(globe.x, 0.84 * 1728) && close(globe.y, 930));
  const a = F.portalAt(0, c0, r0, target);
  assert.ok(close(a.x, c0[0]) && close(a.y, c0[1]) && close(a.r, r0));
  const z = F.portalAt(1, c0, r0, target);
  assert.ok(close(z.x, target.x, 1e-6) && close(z.y, target.y, 1e-6) && close(z.r, target.r, 1e-6));
  // A zoom about a fixed pivot: (c - pivot) = (c0 - pivot) * zoom.
  const Z = target.r / r0;
  const pivot = [(Z * c0[0] - target.x) / (Z - 1), (Z * c0[1] - target.y) / (Z - 1)];
  let lastR = 0;
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const p = F.portalAt(u, c0, r0, target);
    assert.ok(p.r >= lastR - 1e-9, 'the window only opens');
    lastR = p.r;
    assert.ok(close(p.x - pivot[0], (c0[0] - pivot[0]) * p.zoom, 1e-6));
    assert.ok(close(p.y - pivot[1], (c0[1] - pivot[1]) * p.zoom, 1e-6));
  }
  // A phone has no globe on its first screen: an iris out past the corners.
  const phone = F.portalTarget(390, 844, true);
  assert.ok(phone.r >= Math.hypot(195, 422));
  assert.ok(F.LANDING_B.rise < F.LANDING_B.done && F.LANDING_B.push <= F.LANDING_B.done);
});

test('the landing is chosen by the URL: ?open=b, otherwise A', () => {
  assert.equal(F.landingFrom(''), 'a');
  assert.equal(F.landingFrom('?open=a'), 'a');
  assert.equal(F.landingFrom('?open=b'), 'b');
  assert.equal(F.landingFrom('?x=1&open=b'), 'b');
  assert.equal(F.landingFrom('?open=c'), 'a');
});

test('no strobe: at most three light/dark changes in any one second of cuts', () => {
  for (const film of [F.FILM_DESKTOP, F.FILM_PHONE]) {
    const cuts = F.cutSchedule(film);
    const changes = [];
    for (let i = 1; i < cuts.length; i += 1) {
      if (F.SCENE_TONE[cuts[i].id] !== F.SCENE_TONE[cuts[i - 1].id]) changes.push(cuts[i].start);
    }
    for (const t of changes) {
      const inWindow = changes.filter((c) => c >= t && c < t + 1000).length;
      assert.ok(inWindow <= 3, `${inWindow} changes from ${t} ms`);
    }
  }
});

test('the material is seeded: the server and the client draw the same rain', () => {
  const a = F.rainColumns();
  const b = F.rainColumns();
  assert.deepEqual(a, b);
  assert.equal(a.length, F.RAIN_COLUMNS);
  assert.equal(a[(F.RAIN_COLUMNS - 1) / 2].i, 0, 'the middle column is the lock column');
  for (const c of a) {
    assert.equal(c.text.length, c.len);
    assert.ok(c.fall > 1.5 && c.fall < 6);
  }
  for (const [i, letter] of [...'ARCHIVE'].entries()) {
    const strip = F.scrambleStrip(letter, i);
    assert.equal(strip.length, 8);
    assert.equal(strip.at(-1), letter);
  }
});
