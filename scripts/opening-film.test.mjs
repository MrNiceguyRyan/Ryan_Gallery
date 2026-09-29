// Run offline: node --experimental-strip-types --test scripts/opening-film.test.mjs
//
// The opening film (src/lib/openingFilm.ts), v4 — the owner's spec of
// 2026-09-28 ("复古编辑部动态排版"): a typewriter relay, the word found by a
// lime marker, match cuts round a fixed lime anchor, a film burn, the dark
// typed, the end title, the landing. Held here: the lengths (desktop ≤ 7.5 s,
// phone ≤ 6.6 s, landing included), every hard cut on the beat and the burn
// on the 24 fps grid, the flash budget (light/dark turns ≤ 3 in any second,
// ≤ 4 in all; the burn never brighter than bone), the anchor (one centre,
// one height, one cap height for every cut), the drift (on across a cut, or
// a quarter turn), the words (ARCHIVE, CAMERA — never cinema — TRAVEL,
// THOUGHT, YOU, RYAN XU), the landing's words at both ends, the input (only
// the Skip pill skips), the skip, and the house rules the sheet must keep.
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
const read = (file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const PLANS = { desktop: F.filmPlan('desktop'), phone: F.filmPlan('phone') };

test('the length: desktop ≤ 7.5 s and phone ≤ 6.6 s, the landing included; hard limit 8 s', () => {
  const landing = F.landingAEnd(F.FLY_ORDER.length);
  assert.ok(landing <= F.LANDING_A.done, 'every word home inside the landing');
  const desk = PLANS.desktop.length + F.LANDING_A.done;
  const phone = PLANS.phone.length + F.LANDING_A.done;
  assert.ok(desk <= 7500, `desktop ${desk} ms`);
  assert.ok(desk >= 7300, `desktop ${desk} ms: about 7.5 s`);
  assert.ok(phone <= 6600, `phone ${phone} ms`);
  assert.ok(phone >= 6400, `phone ${phone} ms: about 6.6 s`);
  for (const plan of Object.values(PLANS)) assert.ok(plan.length + F.LANDING_A.done <= 8000);
});

test('the acts: contiguous from 0, in the spec\'s order and lengths', () => {
  for (const [layout, plan] of Object.entries(PLANS)) {
    const order = ['type', 'find', 'cuts', 'burn', 'dark', 'title'];
    let at = 0;
    for (const id of order) {
      assert.equal(plan.acts[id].start, at, `${layout} ${id} starts where the last ended`);
      at = plan.acts[id].end;
    }
    assert.equal(at, plan.length);
    assert.equal(plan.acts.find.end - plan.acts.find.start, 500);
    assert.equal(plan.acts.burn.end - plan.acts.burn.start, 1000, 'the burn: 24 frames at 24 fps');
    assert.equal(plan.acts.dark.end - plan.acts.dark.start, 1000);
  }
  // Desktop, to the spec's clock: 1.75 / 2.25 / 4.25 / 5.25 / 6.25 s.
  const d = PLANS.desktop.acts;
  assert.deepEqual([d.type.end, d.find.end, d.cuts.end, d.burn.end, d.dark.end], [1750, 2250, 4250, 5250, 6250]);
});

test('every hard cut falls on the beat; the burn on the 24 fps grid', () => {
  assert.equal(F.BEAT_MS, 125);
  for (const plan of Object.values(PLANS)) {
    const cuts = F.hardCuts(plan);
    assert.ok(cuts.length >= 12);
    for (const t of cuts) assert.equal(t % F.BEAT_MS, 0, `${plan.layout} cut at ${t}`);
    for (const c of plan.cuts) assert.equal(c.end - c.start, 2 * F.BEAT_MS, 'a match cut is two beats');
    // The burn's frames: 1/24 s each, three to a beat.
    assert.ok(close(F.FRAME24_MS * 3, F.BEAT_MS));
    for (let f = 0; f <= F.BURN.frames; f += 3) assert.equal(F.burnFrameStart(plan, f) % F.BEAT_MS, 0);
    for (let f = 0; f < F.BURN.frames; f += 1) {
      const t = F.burnFrameStart(plan, f);
      assert.equal(F.burnFrameAt(plan, t + 1), f);
      assert.equal(F.burnFrameAt(plan, t + F.FRAME24_MS - 1), f, 'held for the whole frame');
    }
    assert.equal(F.burnFrameAt(plan, plan.acts.burn.start - 1), -1);
    assert.equal(F.burnFrameAt(plan, plan.acts.burn.end), -1);
  }
});

test('act 1: the typewriter relay — a material every three beats under letters that never move', () => {
  assert.equal(F.TYPED, 'an archive of travel');
  assert.equal(F.FOUND_WORD, 'archive');
  assert.deepEqual([...F.MATERIALS.desktop], ['crt', 'phosphor', 'paper', 'copy']);
  assert.equal(F.MATERIALS.phone.length, 3, 'the phone keeps three');
  for (const plan of Object.values(PLANS)) {
    const m = plan.materials;
    assert.equal(m[0].start, 0);
    m.forEach((x, i) => {
      if (i > 0) {
        assert.equal(x.start, m[i - 1].end);
        assert.equal(x.end - x.start, 3 * F.BEAT_MS, 'three beats a material');
      }
    });
    assert.equal(m[0].end - m[0].start, 5 * F.BEAT_MS, 'the cursor alone for two beats, then three');
    // Dark, (dark,) light, light: one change of tone.
    const tones = m.map((x) => F.MATERIAL_TONE[x.id]);
    assert.equal(tones.filter((t, i) => i > 0 && t !== tones[i - 1]).length, 1);
    // The typing: continuous across the cuts, done before the marker.
    const times = plan.typing;
    assert.equal(times.length, F.TYPED.length);
    assert.equal(times[0], 2 * F.BEAT_MS, 'the first letter after the cursor\'s flash');
    for (let i = 1; i < times.length; i += 1) assert.ok(times[i] > times[i - 1], 'in order');
    assert.ok(times.at(-1) <= plan.acts.type.end - F.TYPE_TAIL_MS);
  }
  // About fourteen a second on the desktop, each within ±25 ms of its beat.
  const t = PLANS.desktop.typing;
  const d = PLANS.desktop.acts.type;
  const interval = Math.min(1000 / F.TYPE_CPS, (d.end - F.TYPE_TAIL_MS - t[0]) / F.TYPED.length);
  t.forEach((x, i) => assert.ok(Math.abs(x - (t[0] + i * interval)) <= F.TYPE_JITTER_MS + 0.5, `letter ${i}`));
  const cps = ((t.length - 1) * 1000) / (t.at(-1) - t[0]);
  assert.ok(cps > 12.5 && cps < 15.5, `${cps.toFixed(1)} a second`);
  // The typewriter's ribbon: 0.75–1 strong, ±0.5 px, the same on server and client.
  const r = F.ribbon(F.TYPED);
  assert.deepEqual(r, F.ribbon(F.TYPED));
  for (const x of r) {
    assert.ok(x.ink >= 0.75 && x.ink <= 1);
    assert.ok(Math.abs(x.dx) <= 0.5 && Math.abs(x.dy) <= 0.5);
  }
});

test('act 2: the marker sweeps, then the word glides to the anchor on the spec\'s curve', () => {
  assert.deepEqual([...F.GLIDE_EASE], [0.2, 0.7, 0.1, 1]);
  for (const plan of Object.values(PLANS)) {
    assert.equal(plan.sweep.start, plan.acts.find.start);
    assert.equal(plan.sweep.end - plan.sweep.start, 150);
    assert.equal(plan.glide.start, plan.acts.find.start + F.BEAT_MS);
    assert.equal(plan.glide.end, plan.acts.cuts.start, 'it lands as the first cut comes');
    assert.equal(plan.cuts[0].face, 'f900', 'into the anchor\'s first face');
    assert.equal(plan.cuts[0].word, 'ARCHIVE');
  }
  // One crossfade window, inside the width's morph.
  assert.ok(F.FIND.morph[0] <= F.FIND.swap[0] && F.FIND.swap[1] <= F.FIND.morph[1]);
});

test('act 3: the keywords, the faces, the words the owner asked for', () => {
  const words = (plan) => plan.cuts.map((c) => c.word);
  assert.deepEqual(words(PLANS.desktop), ['ARCHIVE', 'ARCHIVE', 'CAMERA', 'CAMERA', 'TRAVEL', 'TRAVEL', 'THOUGHT', 'YOU']);
  assert.deepEqual(words(PLANS.phone), ['ARCHIVE', 'ARCHIVE', 'CAMERA', 'TRAVEL', 'TRAVEL', 'YOU']);
  for (const plan of Object.values(PLANS)) {
    assert.equal(plan.cuts.at(-1).word, 'YOU', 'YOU is the last page before the burn');
    for (let i = 1; i < plan.cuts.length; i += 1) assert.notEqual(plan.cuts[i].face, plan.cuts[i - 1].face, 'every cut changes the face');
    for (const c of plan.cuts) assert.ok(F.FACE_ORDER.includes(c.face));
  }
  assert.deepEqual(PLANS.desktop.cuts.map((c) => c.face), ['f900', 'f400', 'sg700', 'mono', 'f900', 'f400', 'sg700', 'mono']);
  // The words that must be seen: ARCHIVE, CAMERA, TRAVEL, RYAN XU, YOU — and
  // never cinema, anywhere in the film's source.
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  assert.equal(F.DARK_TYPED, 'ryan xu');
  assert.equal(F.TITLE_NAME, 'Ryan Xu');
  assert.deepEqual([...F.TITLE_SUB], ['CAMERA', 'ARCHIVE', 'TRAVEL', 'THOUGHT']);
  assert.equal(F.TITLE_YOU.word, 'YOU');
  for (const file of ['../src/lib/openingFilm.ts', '../src/components/home/OpeningScenes.tsx', '../src/components/home/OpeningFilm.tsx', '../src/styles/opening.css']) {
    assert.doesNotMatch(read(file), /cinema/i, file);
  }
  assert.match(scenes, /data-fly="you"/);
});

test('act 3: the anchor never moves — one centre, one block height, one cap height for every cut', () => {
  const W = 1728;
  const H = 1000;
  for (const layout of ['desktop', 'phone']) {
    const cap = F.anchorCap(W, H, 5.9, layout);
    const boxes = [2.6, 4.1, 5.9, 6.4].map((perCap) => F.keyBox(W, H, cap, perCap * cap));
    for (const b of boxes) {
      assert.ok(close(b.block.x + b.block.w / 2, boxes[0].block.x + boxes[0].block.w / 2), 'centre x');
      assert.ok(close(b.block.y + b.block.h / 2, boxes[0].block.y + boxes[0].block.h / 2), 'centre y');
      assert.ok(close(b.block.h, boxes[0].block.h), 'height');
      assert.ok(close(b.baseline, boxes[0].baseline), 'baseline');
      // The cap is centred in the block.
      assert.ok(close(b.baseline - cap / 2, b.cy));
      // The ink is centred on the anchor.
      assert.ok(close(b.inkX + (b.block.w - 2 * cap * F.ANCHOR.pad) / 2, b.cx));
    }
    // Only the width follows the word.
    assert.ok(boxes[3].block.w > boxes[0].block.w);
  }
  // 12% of the height, unless the widest word must fit across.
  assert.ok(close(F.anchorCap(1728, 1000, 5.9, 'desktop'), 120));
  const phoneCap = F.anchorCap(390, 844, 5.9, 'phone');
  assert.ok(phoneCap < 0.12 * 844 && close(phoneCap * (5.9 + 2 * F.ANCHOR.pad), 0.86 * 390, 1e-6));
  // Nothing in a cut's data can move the anchor: a composition has no
  // anchor of its own.
  for (const c of F.COMPOSITIONS) {
    for (const key of ['x', 'y', 'cap', 'anchor', 'block']) assert.equal(c[key], undefined, key);
  }
});

test('act 3: the drift runs on across every cut (the same way, or a quarter turn), 20–60 px', () => {
  for (const plan of Object.values(PLANS)) {
    for (let i = 1; i < plan.cuts.length; i += 1) {
      const a = F.DRIFT_DEG[plan.cuts[i - 1].drift];
      const b = F.DRIFT_DEG[plan.cuts[i].drift];
      const turn = Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
      assert.ok(turn === 0 || turn === 90, `${plan.layout} ${i}: ${turn}°`);
    }
  }
  for (const c of F.COMPOSITIONS) {
    assert.ok(c.driftPx >= 20 && c.driftPx <= 60, `${c.word} ${c.driftPx}`);
    assert.ok(c.giants.length >= 1 && c.giants.length <= 2, '1–2 giant words');
    for (const g of c.giants) assert.ok(g.cap >= 0.3 && g.cap <= 0.45, `${g.text} ${g.cap}`);
    assert.ok(c.texture.length >= 2 && c.texture.length <= 3, '2–3 texture paragraphs');
    assert.ok(c.label && c.line && c.ringed && c.metaL && c.frame && c.at);
  }
  // The motion blur: 3–4 copies, fainter as they fall back.
  assert.ok(F.BLUR_COPIES.length >= 3 && F.BLUR_COPIES.length <= 4);
  for (let i = 1; i < F.BLUR_COPIES.length; i += 1) assert.ok(F.BLUR_COPIES[i].opacity < F.BLUR_COPIES[i - 1].opacity);
});

test('act 4: the burn — frames in the spec\'s order, the slip, the leader one frame a card', () => {
  assert.equal(F.BURN.frames, 24);
  assert.deepEqual([...F.BURN.flicker], [0, 3]);
  assert.equal(F.BURN.slip, 3);
  assert.deepEqual([...F.BURN.burn], [4, 9]);
  assert.deepEqual([...F.BURN.out], [9, 12]);
  assert.deepEqual([...F.BURN.black], [12, 14]);
  assert.deepEqual([...F.BURN.leader], [14, 20]);
  assert.deepEqual([...F.BURN.perfs], [20, 24]);
  assert.equal(F.LEADER.length, F.BURN.leader[1] - F.BURN.leader[0], 'one card a frame');
  assert.ok(F.LEADER.includes('head') && F.LEADER.includes('35mm') && F.LEADER.includes('reel') && F.LEADER.includes('archive'));
  // The slip: a quarter up, for one frame; the slide out at 6°.
  assert.ok(close(F.frameAt(3).y, -0.25));
  assert.equal(F.frameAt(2).y, 0);
  assert.equal(F.frameAt(4).y, 0);
  assert.ok(close(F.frameAt(11).rot, 6));
  // The weave: ±1 px a frame, none once out.
  for (let f = 0; f < 12; f += 1) assert.ok(Math.abs(F.frameAt(f).x) <= 1 && Math.abs(F.frameAt(f).weaveY) <= 1);
  // The burn grows, the flicker is ±10% at most, the dark comes last.
  for (let f = 5; f < 12; f += 1) assert.ok(F.burnRadius(f) > F.burnRadius(f - 1));
  assert.equal(F.burnRadius(3), 0);
  for (let f = 0; f < 24; f += 1) assert.ok(Math.abs(F.burnFrame(f).flick) <= 1);
  assert.equal(F.burnDarkness(8), 0);
  assert.ok(F.burnDarkness(11) > F.burnDarkness(9));
  assert.equal(F.burnDarkness(12), 1);
});

test('no strobe: light/dark turns ≤ 3 in any second, ≤ 4 in all; the burn never brighter than bone', () => {
  for (const plan of Object.values(PLANS)) {
    const flips = F.toneFlips(plan);
    assert.ok(flips.length <= 4, `${plan.layout}: ${flips.length} turns`);
    for (const t of flips) {
      const inWindow = flips.filter((c) => c >= t && c < t + 1000).length;
      assert.ok(inWindow <= 3, `${plan.layout}: ${inWindow} turns from ${t} ms`);
    }
    // Act 1 turns once; act 3 never; the burn turns it dark and it stays so.
    const tl = F.toneTimeline(plan);
    assert.equal(tl[0].tone, 'dark');
    assert.equal(tl.at(-1).tone, 'dark');
    const act3 = tl.find((s) => s.start <= plan.acts.cuts.start && s.end >= plan.acts.cuts.end);
    assert.ok(act3 && act3.tone === 'light', 'act 3 all light');
  }
  const bone = F.luminance('#F4F4ED');
  for (const c of F.BURN_RAMP) assert.ok(F.luminance(c) <= bone + 1e-9, c);
  assert.equal(F.BURN_RAMP[0], '#F4F4ED', 'its brightest is bone');
  assert.ok(F.luminance(F.BURN_HOLE) < 0.02, 'the hole is dark');
});

test('acts 5–6: the dark typed with one lime cursor, then the line turns into the title', () => {
  for (const plan of Object.values(PLANS)) {
    const t = plan.darkTyping;
    assert.equal(t.length, F.DARK_TYPED.length);
    assert.equal(t[0], plan.acts.dark.start + F.DARK_TYPE_AT);
    const cps = ((t.length - 1) * 1000) / (t.at(-1) - t[0]);
    assert.ok(cps > 10.5 && cps < 13.5, `${cps.toFixed(1)} a second`);
    // Typed, then one blink (half a period off), on again as the title comes.
    assert.ok(plan.blink.start > t.at(-1));
    assert.ok(close(plan.blink.end - plan.blink.start, F.CURSOR_MS / 2));
    assert.equal(plan.blink.end, plan.acts.title.start);
  }
  assert.ok(F.TITLE.morph < F.ACT_BEATS.title * F.BEAT_MS);
  assert.ok(F.TITLE.swap[0] > 0 && F.TITLE.swap[1] < 1);
});

test('the landing\'s words: at both ends — the end title and the entrance', () => {
  assert.deepEqual([...F.FLY_ORDER], ['ryan', 'xu', 'camera', 'archive', 'travel', 'thought', 'you']);
  assert.deepEqual([...F.FLY_OPTIONAL], ['you']);
  for (const word of F.FLY_ORDER) {
    assert.equal(F.LANDING_TARGETS[word].from, `[data-fly="${word}"]`);
    if (word !== 'you') assert.equal(F.LANDING_TARGETS[word].to, `.entrance-intro [data-open-land="${word}"]`);
  }
  assert.equal(F.LANDING_TARGETS.you.to, '.entrance [data-open-land="you"]');
  const intro = read('../src/components/home/EntranceIntro.tsx');
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  for (const word of ['ryan', 'xu']) assert.ok(intro.includes(`data-open-land="${word}"`), `entrance: ${word}`);
  for (const word of ['camera', 'archive', 'travel', 'thought']) assert.ok(intro.includes(`{ land: '${word}' }`), `entrance: ${word}`);
  for (const word of ['ryan', 'xu']) assert.ok(scenes.includes(`data-fly="${word}"`), `title: ${word}`);
  // The credits' words carry data-fly from TITLE_SUB, lower-cased.
  assert.match(scenes, /data-fly=\{word\.toLowerCase\(\)\}/);
  for (const word of ['camera', 'archive', 'travel', 'thought']) assert.ok(F.TITLE_SUB.map((w) => w.toLowerCase()).includes(word));
});

test('landing A: every word flies from its box to its glyph box, in order, inside 0.6 s', () => {
  const src = { x: 500, y: 300, w: 400, h: 110 };
  const dst = { x: 104, y: 284, w: 700, h: 221 };
  const f = F.flightFor(src, dst, 64, 175, 0);
  assert.ok(close(f.dx, 700 - 454));
  assert.ok(close(f.dy, 355 - 394.5));
  assert.ok(close(f.k, 64 / 175));
  const delays = F.FLY_ORDER.map((_, i) => F.flightFor(src, dst, 1, 1, i).delay);
  for (let i = 1; i < delays.length; i += 1) assert.ok(delays[i] > delays[i - 1]);
  assert.ok(F.LANDING_A.done <= 600, 'the spec gives the landing 0.6 s');
  assert.ok(F.LANDING_A.rest < F.landingAEnd(F.FLY_ORDER.length));
  const path = F.flightPath(F.flightFor(src, dst, 64, 175, 0));
  assert.ok(close(path[0].x, 700 - 454) && close(path.at(-1).x, 0) && close(path.at(-1).s, 1));
  assert.deepEqual([...F.LANDING_A.sourceOut], [...F.LANDING_A.targetIn]);
  assert.ok(F.LANDING_A.morph[0] <= F.LANDING_A.sourceOut[0] && F.LANDING_A.sourceOut[1] <= F.LANDING_A.morph[1]);
});

test('one ink box: both faces hold one ink width at every moment', () => {
  for (const [srcW, dstW] of [
    [310, 460],
    [520, 240],
    [200, 200],
  ]) {
    const m = F.morphScales(srcW, dstW);
    for (let p = 0; p <= 1.0001; p += 0.125) {
      const sw = srcW * (m.source[0] + (m.source[1] - m.source[0]) * p);
      const tw = dstW * (m.target[0] + (m.target[1] - m.target[0]) * p);
      assert.ok(close(sw, tw, 1e-9), `${srcW}→${dstW} at ${p}`);
    }
  }
});

test('input: only the Skip pill skips; wheel, touch, keys and clicks do nothing', () => {
  assert.equal(F.INPUT_POLICY.skip, 'skip');
  for (const source of ['wheel', 'touch', 'key', 'pointer']) assert.notEqual(F.INPUT_POLICY[source], 'skip', source);
  for (const source of ['wheel', 'touch', 'key']) assert.equal(F.INPUT_POLICY[source], 'hold', source);
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.doesNotMatch(island, /addEventListener\('pointerdown'/);
  assert.doesNotMatch(island, /addEventListener\('touchstart'/);
  assert.match(island, /skip\.addEventListener\('click', onSkip\)/);
  const css = read('../src/styles/opening.css');
  assert.match(css, /html\[data-film-lock\] body \{ overflow: clip !important; \}/);
  assert.match(island, /html\.setAttribute\('data-film-lock', ''\)/);
  assert.match(island, /setAttribute\('inert', ''\)/);
  assert.doesNotMatch(island, /body\.style\.overflow/);
  const keys = island.slice(island.indexOf('const onKeyDown'), island.indexOf('const onSkip'));
  assert.match(keys, /event\.key === 'Tab'[\s\S]*?event\.preventDefault\(\);[\s\S]*?skip\.focus\(\{ preventScroll: true \}\)/);
  assert.ok(keys.indexOf('SCROLL_KEYS.has') > 0 && keys.indexOf('SCROLL_KEYS.has') < keys.indexOf('event.metaKey || event.ctrlKey || event.altKey ||'));
});

test('skip: to the end title with its tail left, never back, nothing once the landing has begun', () => {
  for (const plan of Object.values(PLANS)) {
    const target = plan.length - F.FF_TAIL;
    assert.ok(target >= plan.acts.title.start + F.TITLE.morph, 'the title is formed where the skip lands');
    assert.equal(F.fastForwardTarget(plan, 0), target);
    assert.equal(F.fastForwardTarget(plan, 3000), target);
    assert.equal(F.fastForwardTarget(plan, target), null, 'never back');
    assert.equal(F.fastForwardTarget(plan, plan.length), null);
  }
  assert.ok(F.FF_RATE > 1);
});

test('the fonts: every face loaded before the clock, none synthesised', () => {
  const faces = F.FONT_LOADS.join(' | ');
  for (const face of ['900 100px Fraunces', '400 100px Fraunces', '700 20px "Space Grotesk"']) assert.ok(faces.includes(face), face);
  assert.ok(F.FONT_WAIT_MS <= 4000);
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /document\.fonts\?\.load\(f, FONT_SAMPLE\)/);
  // The clock starts in begin(), which runs only once the fonts are in.
  assert.match(island, /fontsIn\.then\(whenVisible\)\.then/);
  const css = read('../src/styles/opening.css');
  assert.doesNotMatch(css, /italic/, 'no italic anywhere in the film (Space Grotesk has none)');
  // One more face only: the typewriter's monospace, a system stack.
  assert.match(css, /--of-mono: ui-monospace/);
  assert.doesNotMatch(css, /@import|@font-face|fonts\.googleapis/);
});

test('the house rules: bone and ink, never pure black or white; one lime; tracking ≤ 0.1em; no blur animated', () => {
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#fff\b|#ffffff\b|#000\b|#000000\b|[:,(]\s*(white|black)\b/i);
  assert.doesNotMatch(css, /rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]/);
  assert.doesNotMatch(css, /rgba?\(\s*255\s*,\s*255\s*,\s*255\s*[,)]/);
  // Uppercase tracking capped at 0.1em.
  for (const m of css.matchAll(/letter-spacing:\s*([\d.]+)em/g)) assert.ok(Number(m[1]) <= 0.1, m[0]);
  // The one accent: lime, and no yellow highlight.
  const lime = [...css.matchAll(/#d2ff00/gi)].length;
  assert.ok(lime >= 1 && lime <= 5);
  assert.doesNotMatch(css, /#ff0\b|#ffff00|#ffe600|#ffd400/i);
  // Only transform and opacity are animated (keyframes in the sheet).
  for (const block of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)) {
    for (const prop of block[1].matchAll(/([a-z-]+):/g)) assert.ok(['transform', 'opacity', 'visibility', 'pointer-events'].includes(prop[1]), prop[1]);
  }
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.doesNotMatch(island, /filter:\s*`?blur/);
});

test('no structure branches on the viewport or reduced motion (hydration)', () => {
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  assert.doesNotMatch(scenes, /useReducedMotion|matchMedia|innerWidth|window\./);
  const island = read('../src/components/home/OpeningFilm.tsx');
  const markup = island.slice(island.lastIndexOf('return ('));
  assert.doesNotMatch(markup, /reduce|phone/);
  assert.doesNotMatch(island, /initial=\{\{\s*opacity:\s*0/);
  // Reduced motion: the end title shown still (values, not structure).
  const css = read('../src/styles/opening.css');
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.of-end,[\s\S]*?opacity: 1/);
});

test('the material is seeded: the server and the client draw the same', () => {
  assert.deepEqual(F.typeTimes('abc', 0, 500, 14, 25, 3), F.typeTimes('abc', 0, 500, 14, 25, 3));
  const a = F.seeded(7);
  const b = F.seeded(7);
  for (let i = 0; i < 20; i += 1) assert.equal(a(), b());
});
