// Run offline: node --experimental-strip-types --test scripts/opening-film.test.mjs
//
// The opening film (src/lib/openingFilm.ts): the cut schedule (12–16 scenes
// on a desktop, fewer on a phone, cut on a beat, about 7–8.5 s to the clap,
// every shot holding long enough to be read once its entrance has landed, a
// clapperboard that holds), the words (CAMERA, never CINEMA), the runs (each
// word hunted in one run of match cuts; the first screen's own words all
// found), the entrances (a hard cut and one short move that lands exactly at
// rest, about the found word), the input (only the Skip pill skips), the
// skip (to the clapperboard, never past the landing, never back, nothing
// after the clap), the globe's lead, the camera (the word on the focus at the
// run's size; continuous across a match cut; a push that only grows), the
// finder's track (it searches while a shot moves and locks on when it can be
// read; it travels between runs), landing A's flights, landing B's portal
// (the counter at the start, the globe's disc at the end, a zoom about one
// point), the landing choice, the flash safety of the cuts (and the
// desktop's grade), the finder's looks, his photographs, and the seeded
// material the server and client both draw.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
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

test('the rhythm: 7–8.5 s to the clap, cut on the beat, every shot held long enough to read', () => {
  const cuts = F.cutSchedule(F.FILM_DESKTOP);
  const end = F.filmLength(cuts);
  // (He reviews by reloading: he sits through it every time.)
  assert.ok(end >= 7000 && end <= 8500, `desktop ${end} ms`);
  const phone = F.filmLength(F.cutSchedule(F.FILM_PHONE));
  assert.ok(phone >= 4500 && phone < end, `phone ${phone} ms`);
  // Hard cuts on the beat: every scene a whole number of beats.
  for (const film of [F.FILM_DESKTOP, F.FILM_PHONE]) for (const s of film) assert.equal(s.ms % F.BEAT_MS, 0, `${s.id} ${s.ms}`);
  // Every middle shot HOLDS once its entrance has landed (the finder locks
  // on): at least 420 ms, and on average 1.25× the 360 ms the last cut's
  // shots had in all (the owner: a little slower, to read each one).
  for (const film of [F.FILM_DESKTOP, F.FILM_PHONE]) {
    const middle = F.cutSchedule(film).slice(1, -1);
    const holds = middle.map((c) => c.end - F.lockAt(c));
    holds.forEach((h, i) => assert.ok(h >= 420, `${middle[i].id} holds ${h} ms`));
    const mean = holds.reduce((a, b) => a + b, 0) / holds.length;
    assert.ok(mean >= 1.25 * 360, `mean hold ${mean.toFixed(0)} ms`);
    for (const c of middle) assert.ok(c.ms <= 750, `${c.id} ${c.ms} ms: a shot, not a scene`);
  }
  // The code holds for its lock and lift (on a phone too: every beat ends
  // inside the scene); the clapperboard long enough to read.
  for (const film of [F.FILM_DESKTOP, F.FILM_PHONE]) {
    const code = film[0].ms;
    for (const beat of [F.CODE_BEATS.lift, F.CODE_BEATS.dim, F.CODE_BEATS.finder]) assert.ok(beat[0] < beat[1] && beat[1] <= code, `${beat} in ${code}`);
    const lastLock = F.CODE_BEATS.scramble + 6 * F.CODE_BEATS.stagger + F.CODE_BEATS.lockAfter;
    assert.ok(lastLock <= F.CODE_BEATS.lift[0] + 200, 'the word has locked before it is far off the rain');
    // …and ARCHIVE sits locked and lifted, still, before the first cut.
    assert.ok(code - F.CODE_BEATS.lift[1] >= 150, 'the lifted word holds');
    // The finder is up inside the first quarter second (the first second is
    // a hunt, not generic rain), and on the word when the lift lands.
    assert.ok(F.CODE_BEATS.finder[0] <= 250);
    assert.equal(F.CODE_BEATS.finder[1], F.CODE_BEATS.lift[1]);
  }
  assert.ok(F.FILM_DESKTOP.at(-1).ms >= 800);
  // Its beats fit inside it: it is lifted in, the chalk, then the clap on
  // the scene's end.
  const beats = F.slateBeats(F.FILM_DESKTOP.at(-1).ms);
  assert.equal(beats.clap[1], F.FILM_DESKTOP.at(-1).ms);
  assert.ok(beats.underline[0] >= F.ENTRANCES.slate.ms, 'chalked once it has landed');
  assert.ok(beats.underline.at(-1) + beats.underlineMs < beats.clap[0]);
});

test('the words: CAMERA, not cinema', () => {
  const words = new Set(F.FILM_DESKTOP.map((s) => s.word));
  assert.ok(words.has('camera'));
  assert.ok(!words.has('cinema'));
  assert.deepEqual(Object.keys(F.FOCUS).sort(), ['archive', 'camera', 'ryanxu', 'thought', 'travel']);
  // Nowhere in the film's source: the lib, the scenes, the island, the sheet.
  for (const file of ['../src/lib/openingFilm.ts', '../src/components/home/OpeningScenes.tsx', '../src/components/home/OpeningFilm.tsx', '../src/styles/opening.css']) {
    const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
    assert.doesNotMatch(text, /cinema/i, file);
  }
  const scenes = readFileSync(fileURLToPath(new URL('../src/components/home/OpeningScenes.tsx', import.meta.url)), 'utf8');
  // Two camera objects, and CAMERA found in three shots.
  assert.equal((scenes.match(/<Find word="camera"/g) || []).length, 3);
  assert.equal(F.FILM_DESKTOP.filter((s) => s.word === 'camera').length, 3);
});

test('the entrances: one short move, landing exactly at rest, then a hold', () => {
  const [w, h] = [1728, 1000];
  for (const film of [F.FILM_DESKTOP, F.FILM_PHONE]) {
    for (const cut of F.cutSchedule(film)) {
      const e = F.ENTRANCES[cut.id];
      assert.ok(e, cut.id);
      // Short: the move is a punch, never the shot.
      assert.ok(e.ms <= 0.6 * cut.ms, `${cut.id} moves ${e.ms} of ${cut.ms}`);
      assert.ok(e.read >= 0 && e.read <= 0.6 * cut.ms, `${cut.id} reads at ${e.read}`);
      // At rest when it lands.
      assert.deepEqual(F.entranceAt(e, 1, w, h), F.REST);
      if (e.ms > 0) {
        const start = F.entranceAt(e, 0, w, h);
        assert.notDeepEqual(start, F.REST, `${cut.id} starts somewhere`);
        // It only ever closes in on rest (no overshoot, no bounce: it locks).
        let last = Infinity;
        for (let u = 0; u <= 1.0001; u += 0.05) {
          const s = F.entranceAt(e, u, w, h);
          const off = Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.rx) + Math.abs(s.ry) + Math.abs(s.k - 1) * 1000 + s.blur;
          assert.ok(off <= last + 1e-9, `${cut.id} at ${u.toFixed(2)}`);
          last = off;
        }
      }
    }
  }
  // Varied: at least five kinds of move in the desktop film.
  const kinds = new Set(F.FILM_DESKTOP.map((s) => F.ENTRANCES[s.id].kind).filter((k) => k !== 'cut'));
  assert.ok(kinds.size >= 5, [...kinds].join());
  // Fast in: a snap is mostly done in its first third; a whip's streaks are
  // dense while it moves and gone when it lands.
  const snap = F.ENTRANCES.dictionary;
  assert.ok(F.entranceAt(snap, 1 / 3, w, h).k - 1 < 0.3 * (snap.k - 1));
  assert.equal(F.streakAt(1), 0);
  assert.ok(F.streakAt(0.1) >= 0.8);
  // The sheet's transform: the entrance turns about the word's resting
  // place (the focus maps to itself, whatever the tilt and scale).
  const cam = { s: 0.9, tx: 12, ty: -30 };
  const f = [800, 460];
  const str = F.sheetTransform(cam, { x: 0, y: 0, rx: 30, ry: -20, k: 1.2, blur: 0 }, f);
  assert.equal(str, 'translate(0.00px, 0.00px) translate(800.00px, 460.00px) rotateX(30.000deg) rotateY(-20.000deg) scale(1.20000) translate(-800.00px, -460.00px) translate(12.00px, -30.00px) scale(0.90000)');
  // A flat shot's list has no turn in it at all.
  const flat = F.sheetTransform(cam, { x: 40, y: 0, rx: 0, ry: 0, k: 1, blur: 0 }, f, false);
  assert.doesNotMatch(flat, /rotate|3d/);
  // At rest, the point the word rests on maps to itself: the entrance is
  // about it (x' = f + k (x - f) + offset).
  for (const depth of [true, false]) {
    const e = F.entranceAt(F.ENTRANCES.dictionary, 0, 1728, 1000);
    assert.ok(e.k > 1);
    assert.match(F.sheetTransform(cam, e, f, depth), /^translate\(0\.00px, 0\.00px\) translate\(800\.00px, 460\.00px\)/);
  }
});

test('input: only the Skip pill skips; wheel, touch, keys and clicks do nothing', () => {
  assert.equal(F.INPUT_POLICY.skip, 'skip');
  for (const source of ['wheel', 'touch', 'key', 'pointer']) assert.notEqual(F.INPUT_POLICY[source], 'skip', source);
  // The page does not scroll under the film either.
  for (const source of ['wheel', 'touch', 'key']) assert.equal(F.INPUT_POLICY[source], 'hold', source);
  // The island has no fast-forward on anything but the pill.
  const island = readFileSync(fileURLToPath(new URL('../src/components/home/OpeningFilm.tsx', import.meta.url)), 'utf8');
  assert.doesNotMatch(island, /addEventListener\('pointerdown'/);
  assert.doesNotMatch(island, /addEventListener\('touchstart'/);
  assert.doesNotMatch(island, /hurry\(\)/);
  assert.match(island, /skip\.addEventListener\('click', onSkip\)/);
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
  assert.ok(F.FILM_DESKTOP.some((s) => s.word === 'camera'));
});

test('opening.css scrambles and locks the letters on CODE_BEATS', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/styles/opening.css', import.meta.url)), 'utf8');
  const { scramble, stagger, lockAfter } = F.CODE_BEATS;
  assert.ok(css.includes(`animation: of-scramble ${lockAfter}ms`), 'scramble duration');
  assert.ok(css.includes(`animation-delay: calc(${scramble}ms + var(--k) * ${stagger}ms)`), 'scramble start');
  assert.ok(css.includes(`animation-delay: calc(${scramble + lockAfter}ms + var(--k) * ${stagger}ms)`), 'lock-on');
});

test('skip: to the clapperboard with its tail left, never back, nothing after the clap', () => {
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
  // Hurried, the landing plays faster: from the pill to the settled page in
  // about a second and a half.
  assert.ok(F.FF_RATE > 1 && F.FF_RATE <= 1.6);
  assert.ok(F.FF_TAIL + F.LANDING_A.done / F.FF_RATE <= 1500, 'Skip → settled page');
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

test('the finder\'s looks: a reading rule by default, the corners on ?finder=frame', () => {
  assert.equal(F.finderLookFrom(''), 'rule');
  assert.equal(F.finderLookFrom('?finder=frame'), 'frame');
  assert.equal(F.finderLookFrom('?open=b&finder=frame'), 'frame');
  assert.equal(F.finderLookFrom('?finder=x'), 'rule');
  // The rule: the word's ink width + 8 px, 6 px under the baseline (a box is
  // the word's cap box + pad).
  const word = { x: 500, y: 300, w: 240, h: 64 };
  const pad = 16;
  const r = F.ruleFor(F.finderBox(word, pad), pad);
  assert.ok(close(r.x, 496) && close(r.w, 248) && close(r.y, 370));
  // It grows only sideways (a pulse is a snap, not a drop).
  const g = F.growBox(word, 12, 0);
  assert.equal(g.y, word.y);
  assert.equal(g.h, word.h);
  assert.equal(g.w, word.w + 24);
});

test('the finder in the code scene: up round the scrambling letters, then riding the lift onto the word', () => {
  const ink = { x: 680, y: 430, w: 370, h: 66 };
  const [cx, cy] = [864, 460];
  const k0 = 0.3;
  const pad = 16;
  const keys = F.codeFinderKeys(ink, cx, cy, k0, pad);
  for (let i = 1; i < keys.length; i += 1) assert.ok(keys[i].t >= keys[i - 1].t);
  const small = F.finderBox(F.scaleBox(ink, k0, cx, cy), pad);
  // It comes up round the scrambling cells, not round the word it will be.
  assert.equal(keys[0].t, 0);
  assert.ok(close(keys[0].box.w, small.w + 2 * F.CODE_BEATS.search));
  assert.ok(keys[0].box.w < F.finderBox(ink, pad).w, 'smaller than the lifted word');
  assert.ok(keys.some((k) => k.t === F.CODE_BEATS.finder[0]));
  // Closed on the cells when the lift starts; on the full word when it ends.
  const liftStart = keys.find((k) => k.t === F.CODE_BEATS.lift[0]);
  assert.deepEqual(liftStart.box, small);
  const last = keys.at(-1);
  assert.equal(last.t, F.CODE_BEATS.lift[1]);
  const full = F.finderBox(ink, pad);
  for (const key of ['x', 'y', 'w', 'h']) assert.ok(close(last.box[key], full[key], 1e-9), key);
  // Riding the lift: it only grows, centred on the lock point.
  let w = 0;
  for (const k of keys.filter((k) => k.t >= F.CODE_BEATS.lift[0])) {
    assert.ok(k.box.w >= w - 1e-9);
    w = k.box.w;
  }
});

test('the finder: it searches while a shot moves, locks on when it can be read, travels between runs', () => {
  const cuts = F.cutSchedule(F.FILM_DESKTOP);
  const boxes = cuts.map((c, i) => {
    const b = { x: 600 + i * 7, y: 400 + i * 3, w: 400 + i, h: 90 };
    return [b, { ...b, x: b.x - 4, w: b.w + 8 }];
  });
  const keys = F.finderTrack(cuts, boxes, F.CODE_BEATS.finder[1]);
  for (let i = 1; i < keys.length; i += 1) assert.ok(keys[i].t >= keys[i - 1].t, `key ${i} in time`);
  const lerpBox = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });
  cuts.forEach((cut, i) => {
    if (i === 0) return;
    const lock = F.lockAt(cut);
    assert.ok(lock >= cut.start && lock < cut.end, `${cut.id} locks inside its shot`);
    // (At a cut the previous scene's last key comes first, then this one's.)
    const first = keys.filter((k) => k.t === cut.start).at(-1);
    assert.ok(first, `a key on cut ${i}`);
    if (cut.runStart) {
      assert.equal(first.ease, 'travel');
      assert.deepEqual(first.box, boxes[i - 1][1], 'it leaves from the last word');
      // …and is on the new word by the time the shot can be read.
      const arrived = keys.find((k) => k.t > cut.start && k.t <= cut.end);
      assert.ok(arrived.t >= lock, 'arrives as the word lands');
    } else {
      // Searching: wide, held until the lock, then onto the word.
      assert.equal(first.ease, 'hold');
      assert.ok(first.box.w > boxes[i][0].w, 'wider than the word');
      const held = keys.find((k) => k.t === lock);
      assert.ok(held && held.ease === 'arrive' && held.box.w > boxes[i][0].w, 'still wide at the lock, then it snaps');
      const on = keys.find((k) => k.t > lock && k.t < cut.end);
      const span = cut.end - cut.start;
      const expect = lerpBox(boxes[i][0], boxes[i][1], (on.t - cut.start) / span);
      for (const key of ['x', 'y', 'w', 'h']) assert.ok(close(on.box[key], expect[key], 1e-9), `on the word after the snap: ${key}`);
      assert.ok(on.t - lock <= F.FINDER_SNAP_MS, 'a snap, not a glide');
    }
    const last = keys.filter((k) => k.t === cut.end)[0];
    assert.deepEqual(last.box, boxes[i][1], 'on the word at the cut\'s end');
  });
  // Its strength: dim while searching, full once locked (steps on the frame).
  const strength = F.finderStrength(cuts);
  for (const cut of cuts.slice(1)) {
    const lock = F.lockAt(cut);
    if (lock <= cut.start) continue;
    const mine = strength.filter((k) => k.t >= cut.start && k.t < cut.end);
    assert.deepEqual(mine.slice(0, 3).map((k) => k.o), [1, F.FINDER_SEARCH_OPACITY, F.FINDER_SEARCH_OPACITY]);
    assert.equal(mine.at(-1).o, 1);
  }
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
  assert.ok(F.LANDING_A.fly >= 950 && F.LANDING_A.fly <= 1400, 'about 1–1.2 s');
  assert.ok(F.LANDING_A.done <= 1600, 'the transition is 1.2–1.6 s');
  assert.ok(F.LANDING_A.rest < F.landingAEnd(F.FLY_ORDER.length));
  // No dead beat after the clap: the words are off at once, and a tenth of
  // the way home within 200 ms.
  assert.equal(F.LANDING_A.start, 0);
  const curve = (u) => {
    // The FLY_EASE bezier, sampled (x → y) by bisection.
    const [x1, y1, x2, y2] = F.FLY_EASE;
    const bx = (t) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
    const by = (t) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (bx(mid) < u) lo = mid;
      else hi = mid;
    }
    return by((lo + hi) / 2);
  };
  assert.ok(curve(200 / F.LANDING_A.fly) >= 0.1, `${curve(200 / F.LANDING_A.fly)} at 200 ms`);
  const path = F.flightPath(F.flightFor(src, dst, 64, 175, 0));
  assert.ok(close(path[0].x, 700 - 454) && close(path.at(-1).x, 0) && close(path.at(-1).s, 1));
  // The typeface turns in ONE window (both faces), inside the morph.
  assert.deepEqual([...F.LANDING_A.sourceOut], [...F.LANDING_A.targetIn]);
  assert.ok(F.LANDING_A.morph[0] <= F.LANDING_A.sourceOut[0] && F.LANDING_A.sourceOut[1] <= F.LANDING_A.morph[1]);
});

test('landing A\'s morph: both faces hold one ink width at every moment, board\'s to page\'s', () => {
  for (const [srcW, dstW] of [
    [310, 460],
    [520, 240],
    [200, 200],
  ]) {
    const m = F.morphScales(srcW, dstW);
    for (let p = 0; p <= 1.0001; p += 0.125) {
      // The island interpolates each face's scaleX linearly between these,
      // with one curve and one window for both: the same p for both.
      const sw = srcW * (m.source[0] + (m.source[1] - m.source[0]) * p);
      const tw = dstW * (m.target[0] + (m.target[1] - m.target[0]) * p);
      assert.ok(close(sw, tw, 1e-9), `${srcW}→${dstW} at ${p}`);
    }
    assert.ok(close(srcW * m.source[0], srcW) && close(dstW * m.target[1], dstW));
  }
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

test('no strobe: at most three light/dark changes in any one second; the desktop a calm grade', () => {
  const changesOf = (film) => {
    const cuts = F.cutSchedule(film);
    const changes = [];
    for (let i = 1; i < cuts.length; i += 1) {
      if (F.SCENE_TONE[cuts[i].id] !== F.SCENE_TONE[cuts[i - 1].id]) changes.push(cuts[i].start);
    }
    return changes;
  };
  for (const film of [F.FILM_DESKTOP, F.FILM_PHONE]) {
    const changes = changesOf(film);
    for (const t of changes) {
      const inWindow = changes.filter((c) => c >= t && c < t + 1000).length;
      assert.ok(inWindow <= 3, `${inWindow} changes from ${t} ms`);
    }
  }
  // Desktop: four changes of tone in all, never two inside one second (dark
  // code, light paper, dark cinema, light travel/thought, dark film).
  const desk = changesOf(F.FILM_DESKTOP);
  assert.ok(desk.length <= 4, `${desk.length} changes`);
  for (let i = 1; i < desk.length; i += 1) assert.ok(desk[i] - desk[i - 1] >= 1000, `${desk[i - 1]} → ${desk[i]}`);
  // It ends dark, into the olive page.
  assert.equal(F.SCENE_TONE[F.FILM_DESKTOP.at(-1).id], 'dark');
});

test('his photographs: a landscape frame from each chapter first, at its own ratio, sized for the scene', () => {
  const photo = (name, w, h) => ({ imageUrl: `https://cdn.sanity.io/images/p/d/${name}.jpg`, width: w, height: h });
  const groups = [
    { photos: [photo('m-tall', 3000, 4500), photo('m1', 6000, 4000), photo('m2', 6000, 4000)] },
    { photos: [photo('p1', 5000, 3333)] },
    { photos: null },
    { photos: [photo('z-pano', 9000, 3000), photo('z1', 4000, 2800)] },
  ];
  const pics = F.pickPictures(groups);
  assert.equal(pics.length, 4);
  assert.deepEqual(
    pics.map((p) => p.src.split('/').at(-1).split('?')[0]),
    ['m1.jpg', 'p1.jpg', 'z1.jpg', 'm2.jpg'],
    'one per chapter, then a second round; portraits and panoramas passed over',
  );
  assert.ok(pics[0].src.endsWith('?w=640&q=60&auto=format'));
  assert.ok(pics[1].src.endsWith('?w=800&q=60&auto=format'));
  for (const p of pics) assert.ok(p.ratio >= F.PICTURE_RATIO[0] && p.ratio <= F.PICTURE_RATIO[1]);
  assert.ok(close(pics[2].ratio, Math.round((4000 / 2800) * 10000) / 10000));
  assert.deepEqual(F.pickPictures([]), []);
  assert.deepEqual(F.pickPictures([{ photos: [{ imageUrl: null, width: 1, height: 1 }] }]), []);
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
