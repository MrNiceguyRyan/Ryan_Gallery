// Run offline: node --experimental-strip-types --test scripts/opening-film.test.mjs
//
// The opening film (src/lib/openingFilm.ts), v7 — the owner's spec of
// 2026-09-28 ("复古编辑部动态排版"), his changes of 2026-09-29 (no place
// names — suspense; a tiny easter egg allowed; the single words FIRST, match
// cuts on a sixth of a second through editorial pages and printed matter
// round a fixed lime anchor, the first of them drawn under the proof, the
// film's first paint — act 0, a count-in on the sixth, the owner's "可以加
// 一个小小的开场" — then the lime block handed off into the cursor of a
// typewriter relay across machines, each in its own face; richer, layered
// pages; black-and-white pages and colour in runs), and of 2026-10-05: "现在
// 我觉得开头的动画可以再短一点点 控制在5秒" — from the first paint to the
// landing done within five seconds (it was 10.1 s), every act kept and
// compressed: ten pages, two a keyword (an editorial page and a piece of
// printed matter); five machines; nine frames of burn; the dark typed and
// the title on the 24th; a 0.555 s landing. Held here: the five seconds
// (with a missed beat to spare); the act order; every cut on its act's grid
// and every grid whole vsyncs (the match cuts the sixth, the hand-off and
// the relay the twelfth, the burn, the dark and the title the 24th); the
// relay (slow to fast, typing continuous, one left edge, baseline and cap
// height); the flash budget (≤ 6 turns, ≤ 3 in any second, a mid ground
// turning nothing; the proof turns none); the
// proof (its beats on the sixth, its clock counted from its first frame,
// the stylesheet's lights at rest when down, both plates printed from the
// first paint by the head script and kept by the clock — the plates' own
// animations, never a second on their elements — so a slow
// load holds a finished title card, the lime never stands alone longer than
// its beat, the word never in a stand-in face while its face can come); the
// anchor (one centre, one
// height, one cap height, its reading zone kept clear); the drift (on across
// a cut, or a quarter turn); at least four type tiers a page; no place names
// but the eggs; the words (ARCHIVE, CAMERA — never cinema — TRAVEL, THOUGHT,
// YOU, RYAN XU); the palette (lime the one accent; the site's grounds; no
// yellow, no purple, no saturated blue or red); the landing's words at both
// ends; the input (only the Skip pill skips); the skip; the house rules.
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
// The entrance's cover of words (where landing A lands).
const P = await import('../src/lib/boardingPass.ts');
const read = (file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
/** t is a whole number of `unit`s after `from`. */
const onGrid = (t, unit, from = 0) => close((t - from) / unit, Math.round((t - from) / unit), 1e-6);
const PLANS = { desktop: F.filmPlan('desktop'), phone: F.filmPlan('phone') };
const SOURCES = ['../src/lib/openingFilm.ts', '../src/components/home/OpeningScenes.tsx', '../src/components/home/OpeningFilm.tsx', '../src/styles/opening.css'];

// The owner's five seconds (2026-10-05): from the first paint to the landing
// done — with a beat to spare (the proof's lime waits a sixth for a face
// still on its way, on a cold load), so the reader's own load is in it too.
// It was 10 117 ms (measured 10.1 s, desktop and phone).
const FIVE_S = 5000;
const BEFORE_MS = 1000 + 8416.667 + 700;
const firstPaintToLanded = (plan) => F.PRELUDE_MS + plan.length + F.LANDING_A.done;

test('the five seconds: first paint to the landing done ≤ 5000 ms, with a missed beat to spare; every act still there', () => {
  for (const [layout, plan] of Object.entries(PLANS)) {
    const total = firstPaintToLanded(plan);
    assert.ok(total <= FIVE_S - F.CUT_MS, `${layout}: ${total.toFixed(1)} ms (a missed beat: ${(total + F.CUT_MS).toFixed(1)})`);
    assert.ok(BEFORE_MS - total > 5000, `${layout}: ${(BEFORE_MS - total).toFixed(0)} ms shorter than it was`);
    for (const id of F.ACT_ORDER) assert.ok(plan.acts[id].end - plan.acts[id].start > 0, `${layout}: ${id} is there`);
    assert.ok(F.PRELUDE_MS > 0, 'the proof is there');
  }
  // Each act's share (ms): the plan the owner's sheet shows.
  const p = PLANS.desktop;
  const len = (id) => p.acts[id].end - p.acts[id].start;
  assert.ok(close(F.PRELUDE_MS, 500), 'the proof: half a second');
  assert.ok(close(len('cuts'), 10 * F.CUT_MS), 'ten pages, a sixth each');
  assert.ok(close(len('hand'), 2 * F.FRAME12_MS));
  assert.ok(close(len('type'), 11 * F.FRAME12_MS));
  assert.ok(close(len('burn'), 9 * F.FRAME24_MS));
  assert.ok(close(len('dark') + len('title'), 14 * F.FRAME24_MS));
  assert.equal(F.LANDING_A.done, 555);
});

test('the acts: contiguous from 0, the single words first, then the relay; the landing inside 0.6 s', () => {
  assert.deepEqual([...F.ACT_ORDER], ['cuts', 'hand', 'type', 'burn', 'dark', 'title']);
  for (const [layout, plan] of Object.entries(PLANS)) {
    let at = 0;
    for (const id of F.ACT_ORDER) {
      assert.ok(close(plan.acts[id].start, at), `${layout} ${id} starts where the last ended`);
      at = plan.acts[id].end;
    }
    assert.ok(close(at, plan.length));
    assert.equal(plan.acts.cuts.start, 0, 'the match cuts open the film (the first page is the first paint)');
    // The match cuts a second and two thirds (ten sixths, a page each).
    const cuts = plan.acts.cuts.end - plan.acts.cuts.start;
    assert.ok(cuts >= 1500 && cuts <= 2000, `act 1 ${cuts} ms`);
    // The hand-off: two twelfths.
    assert.ok(close(plan.acts.hand.end - plan.acts.hand.start, F.HAND.frames * F.FRAME12_MS));
    assert.equal(F.HAND.frames, 2);
    // The relay: about a second (it was the owner's two to three).
    const relay = plan.acts.type.end - plan.acts.type.start;
    assert.ok(relay >= 800 && relay <= 1200, `relay ${relay} ms`);
    assert.ok(close(plan.acts.burn.end - plan.acts.burn.start, F.BURN.frames * F.FRAME24_MS), 'the burn: its frames at 24 fps');
    assert.ok(close(plan.acts.dark.end - plan.acts.dark.start, F.DARK_FRAMES * F.FRAME24_MS));
    assert.ok(close(plan.acts.title.end - plan.acts.title.start, F.TITLE.frames * F.FRAME24_MS));
  }
  const others = F.FLY_ORDER.length - F.NAME_WORDS.length;
  assert.ok(F.landingAHome(others) + F.LANDING_A.settle <= F.LANDING_A.done, 'every word home, and the page\'s own, inside the landing');
});

test('every hard cut falls on its act\'s grid: the sixth, the twelfth, the 24th — every grid whole vsyncs', () => {
  assert.ok(close(F.FRAME12_MS, 1000 / 12));
  assert.ok(close(F.CUT_MS, 1000 / 6));
  assert.ok(close(F.FRAME24_MS, 1000 / 24));
  // Whole vsyncs: a sixth is 10 at 60 Hz, a twelfth 5, a 24th 5 at 120 Hz.
  for (const [grid, hz] of [[F.CUT_MS, 60], [F.FRAME12_MS, 60], [F.FRAME24_MS, 120], [F.CUT_MS, 120], [F.FRAME12_MS, 120]]) {
    assert.ok(close((grid * hz) / 1000, Math.round((grid * hz) / 1000), 1e-9), `${grid} ms at ${hz} Hz`);
  }
  for (const plan of Object.values(PLANS)) {
    // The match cuts: every one on a sixth from the clock's start.
    for (const c of plan.cuts) {
      assert.ok(onGrid(c.start, F.CUT_MS, plan.acts.cuts.start), `${c.word} ${c.start}`);
      assert.ok(onGrid(c.end, F.CUT_MS, plan.acts.cuts.start));
      assert.ok(c.end - c.start >= F.CUT_MS - 1e-6);
    }
    // The hand-off and the machines on the twelfth.
    for (const t of [plan.acts.hand.start, plan.acts.hand.end]) assert.ok(onGrid(t, F.FRAME12_MS), `hand ${t}`);
    for (const s of plan.styles) assert.ok(onGrid(s.start, F.FRAME12_MS) && onGrid(s.end, F.FRAME12_MS), `${s.id} ${s.start}`);
    // The proof's beats on the sixth (before the clock).
    for (const t of [plan.prelude.start, plan.prelude.lime, plan.prelude.word, plan.prelude.end]) assert.ok(onGrid(t, F.CUT_MS), `proof beat ${t}`);
    // The burn's frames on the 24th from its start.
    for (let f = 0; f < F.BURN.frames; f += 1) {
      const t = F.burnFrameStart(plan, f);
      assert.ok(onGrid(t, F.FRAME24_MS, plan.acts.burn.start));
      assert.equal(F.burnFrameAt(plan, t + 1), f);
      assert.equal(F.burnFrameAt(plan, t + F.FRAME24_MS - 1), f, 'held for the whole frame');
    }
    assert.equal(F.burnFrameAt(plan, plan.acts.burn.start - 1), -1);
    assert.equal(F.burnFrameAt(plan, plan.acts.burn.end), -1);
    // The dark's keys, the title, its morph's end and the landing on the
    // 24th from the dark (the skip lands on it too).
    for (const t of [plan.acts.dark.start, ...plan.darkTyping, plan.acts.title.start, plan.acts.title.start + F.TITLE.morph, plan.length, plan.length - F.FF_TAIL]) {
      assert.ok(onGrid(t, F.FRAME24_MS, plan.acts.dark.start), `24th ${t}`);
    }
    // And every act starts on the 24th and the twelfth from the clock's
    // start (a sixth is two twelfths).
    for (const a of Object.values(plan.acts)) assert.ok(onGrid(a.start, F.FRAME24_MS), `act at ${a.start}`);
    assert.ok(F.hardCuts(plan).length >= 18, `${F.hardCuts(plan).length} cuts`);
  }
});

test('act 3: the relay — five machines, each its own face, slow to fast, the typing continuous across the cuts', () => {
  assert.equal(F.TYPED, 'an archive of travel');
  const ids = F.STYLES.map((s) => s.id);
  assert.ok(ids.length >= 4 && ids.length <= 6, 'four to six machines');
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.at(-1), F.BURN_STYLE, 'the burn takes the last');
  // The owner's machines: the antique 1-bit computer first (where the lime
  // block lands), a strip of film on a lightbox; no blue, no red machine.
  assert.equal(ids[0], 'mac');
  assert.ok(ids.includes('film'));
  for (const id of ['deep', 'bars', 'pill']) assert.ok(!ids.includes(id), id);
  // Every machine imitates its own face.
  assert.equal(new Set(F.STYLES.map((s) => s.face)).size, ids.length, 'a face a machine');
  // Slow to fast: each machine no longer than the one before, the paper
  // (the last) holds for the burn; the first the longest, and on screen
  // under the hand-off before it.
  const frames = F.STYLES.map((s) => s.frames);
  for (let i = 1; i < frames.length - 1; i += 1) assert.ok(frames[i] <= frames[i - 1], `${ids[i]} ${frames[i]}`);
  assert.ok(frames[0] > frames[1], 'the antique computer the longest');
  assert.ok((F.HAND.frames + frames[0]) * F.FRAME12_MS >= 400, 'the first is on long enough to be read');
  assert.ok(frames.at(-2) * F.FRAME12_MS <= 250, 'the fastest at a quarter second');
  // All light: in the five seconds a dark run between light machines, a
  // second before the burn's dark, read as a flash — the relay turns
  // nothing over.
  const tones = F.STYLES.map((s) => s.tone).filter((t) => t !== 'mid');
  assert.equal(tones.filter((t, i) => i > 0 && t !== tones[i - 1]).length, 0);
  for (const plan of Object.values(PLANS)) {
    const times = plan.typing;
    assert.equal(times.length, F.TYPED.length);
    assert.ok(close(times[0], plan.acts.type.start + F.TYPE_AT), 'the first key a beat after the cursor has landed');
    for (let i = 1; i < times.length; i += 1) assert.ok(times[i] > times[i - 1], 'in order');
    plan.styles.forEach((s, k) => {
      const mine = times.map((t, i) => [t, F.TYPED[i]]).filter(([t]) => t >= s.start - 1e-6 && t < s.end - 1e-6);
      assert.equal(mine.length, F.STYLES[k].keys, `${s.id} strikes ${mine.length}`);
      assert.ok(mine.some(([t, ch]) => ch !== ' ' && t <= s.end - 33), `${s.id} shows a letter`);
      if (k > 0) assert.ok(close(mine[0][0], s.start, 1e-3), `${s.id}: its first key on its cut`);
      for (const [t] of mine) assert.ok(!(t > s.end - F.RELAY_KEYS.quiet && t < s.end), `${s.id}: a key ${Math.round(s.end - t)} ms before its cut`);
    });
    assert.equal(F.STYLES.reduce((n, s) => n + s.keys, 0), F.TYPED.length, 'every letter struck');
    const paper = plan.styles.at(-1);
    assert.ok(times.at(-1) >= paper.start && times.at(-1) < plan.acts.burn.start, 'the last letter on the paper, before the burn');
    // Fast — the relay's own acceleration — but never two letters a frame.
    const cps = ((times.length - 1) * 1000) / (times.at(-1) - times[0]);
    assert.ok(cps >= 18 && cps <= 30, `${cps.toFixed(1)} a second`);
    for (let i = 1; i < times.length; i += 1) assert.ok(times[i] - times[i - 1] >= 1000 / 30, `keys ${i} ${(times[i] - times[i - 1]).toFixed(1)} ms apart`);
    // The cursor: solid while it types, blinking after the last letter.
    const steps = F.cursorSteps(plan);
    for (const [t, v] of steps) assert.ok(!(t > times[0] && t < times.at(-1) && v === 0), `off while typing at ${t}`);
    const after = steps.filter(([t]) => t > times.at(-1));
    assert.ok(after.some(([, v]) => v === 0) && after.some(([, v]) => v === 1), 'it blinks after the last letter');
    for (let i = 1; i < after.length; i += 1) assert.ok(close(after[i][0] - after[i - 1][0], F.CURSOR_MS / 2));
  }
  const r = F.ribbon(F.TYPED);
  assert.deepEqual(r, F.ribbon(F.TYPED));
  for (const x of r) {
    assert.ok(x.ink >= 0.75 && x.ink <= 1);
    assert.ok(Math.abs(x.dx) <= 0.5 && Math.abs(x.dy) <= 0.5);
  }
});

test('act 3: one left edge, one baseline, one cap height on every machine (the island measures each face)', () => {
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  // The line is placed once (not per machine), and no machine moves or
  // sizes the typed letters in the sheet: the island fits every face's
  // capitals to the terminal's and sets its baseline on the terminal's.
  assert.equal([...css.matchAll(/^\.of-line \{/gm)].length, 1);
  for (const m of css.matchAll(/\.of-mat--[\w-]+ \.of-(?:typed|line)(?!--bloom)[^{]*\{([^}]*)\}/g)) {
    assert.doesNotMatch(m[1], /font-size|font-family|(?:^|\s)left:|(?:^|\s)top:|transform:/, m[0].slice(0, 60));
  }
  assert.match(css, /\.of-typed \{[^}]*font-size: 1em;/);
  assert.match(css, /\.of-typed \{[^}]*font-synthesis: none;/);
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /fitCap\(typed, line, refCap\)/);
  assert.match(island, /line\.style\.top = px\(refBase - baselineIn\(line\)\)/);
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  assert.match(scenes, /className=\{`of-typed \$\{RELAY_FACE\[id\]\}`\} data-typed/);
});

test('act 2: the hand-off — the page cuts away, the lime block alone glides into the first cursor', () => {
  for (const plan of Object.values(PLANS)) {
    assert.equal(plan.acts.hand.start, plan.acts.cuts.end, 'on the sixth the last page ends');
    assert.equal(plan.acts.hand.end, plan.acts.type.start, 'the cursor is there as the relay begins');
    assert.equal(plan.styles[0].start, plan.acts.hand.end);
    assert.equal(plan.cuts.at(-1).word, 'YOU');
    // The first machine is on under the hand-off (one tone for both).
    const tl = F.toneTimeline(plan);
    const hand = tl.find((s) => s.start <= plan.acts.hand.start + 1e-6 && s.end >= plan.acts.hand.end - 1e-6);
    assert.ok(hand && hand.tone === F.STYLE_TONE[plan.styles[0].id]);
  }
  assert.deepEqual([...F.HAND.ease], [...F.GLIDE_EASE]);
  const island = read('../src/components/home/OpeningFilm.tsx');
  // The block, not the word: the word goes with the page.
  assert.match(island, /const hand = q\('\[data-handoff\]'\)!;/);
  assert.match(island, /steps\(ink, 'opacity', k === 0 \? 0 : 1, k === 0 \? \[\[acts\.hand\.end, 1\], \.\.\.inkSteps\] : inkSteps\)/);
  const css = read('../src/styles/opening.css');
  assert.match(css, /\.of-handoff \{[^}]*background: var\(--of-lime\);/);
});

test('act 1: the first page is the first paint — drawn by the stylesheet where the island will set it', () => {
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const shown = css.slice(css.indexOf(".of-frame__vignette,\n.of-cut[data-cut='0']") - '.of-frame__paper,\n.of-frame__soft,\n.of-frame__grain,\n'.length);
  assert.match(shown, /^\.of-frame__paper,\s*\.of-frame__soft,\s*\.of-frame__grain,\s*\.of-frame__vignette,\s*\.of-cut\[data-cut='0'\],\s*\.of-key\[data-key='0'\] \{\s*opacity: 1;\s*visibility: visible;/);
  for (const sel of [".of-key[data-key='0'] .of-key__block", ".of-key[data-key='0'] .of-key__word", ".of-cut[data-cut='0'] .of-giant"]) assert.ok(css.includes(`${sel} {`), sel);
  // Its anchor on the anchor's own numbers: the centre, 1.56 caps tall.
  assert.match(css, /\.of-key\[data-key='0'\] \.of-key__block \{[^}]*top: calc\(50vh - 0\.78 \* var\(--c0\)\);[^}]*height: calc\(1\.56 \* var\(--c0\)\);/);
  assert.equal(F.ANCHOR.block, 1.56);
  assert.equal(F.ANCHOR.x, 0.5);
  assert.equal(F.ANCHOR.y, 0.5);
  // The island waits at most 300 ms for the faces and his photographs.
  assert.ok(F.FONT_WAIT_MS <= 300);
  // Reduced motion does not draw it.
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.of-cut\[data-cut='0'\],\s*\.of-key\[data-key='0'\] \{ opacity: 0; visibility: hidden; \}/);
});

// ── Act 0: the proof ──
// A CSS rule's body, by its exact selector (comments stripped).
const ruleOf = (css, sel) => {
  const i = css.indexOf(`${sel} {`);
  assert.ok(i >= 0, `rule ${sel}`);
  return css.slice(i + sel.length + 2, css.indexOf('}', i));
};
// A @keyframes block as [{ offset, opacity }] (selector lists expanded).
const keyframesOf = (css, name) => {
  const m = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(m, `@keyframes ${name}`);
  const out = [];
  for (const r of m[1].matchAll(/([\w.%,\s]+?)\{([^}]*)\}/g)) {
    const op = r[2].match(/opacity:\s*([\d.]+)/);
    for (const sel of r[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      out.push({ offset: sel === 'from' ? 0 : sel === 'to' ? 1 : parseFloat(sel) / 100, opacity: op ? Number(op[1]) : null, body: r[2] });
    }
  }
  return out;
};

test('act 0: the proof — a count-in on the sixth, before the clock (the plan untouched)', () => {
  const P0 = F.PRELUDE;
  const { paint, lime, word } = P0.beats;
  assert.ok(close(F.PRELUDE_MS, 3 * F.CUT_MS));
  assert.ok(F.PRELUDE_MS <= 500 + 1e-6, 'small: half a second at most (the owner\'s "小小的开场", within his five seconds)');
  for (const b of [paint, lime, word]) assert.ok(Number.isInteger(b), `${b}: whole sixths`);
  assert.ok(paint > lime && lime > word && word > 0, 'the paint, the lime plate, the ink plate, then the page');
  assert.ok(close(F.PRELUDE_MS, paint * F.CUT_MS));
  assert.ok(Number.isInteger(P0.lights) && P0.lights * F.CUT_MS <= (paint - lime) * F.CUT_MS + 1e-6, 'the lights are down by the time the lime prints');
  assert.ok(P0.set <= (lime - word) * F.CUT_MS - 1000 / 60, 'the lime has set a frame before the word prints');
  // The lime alone on the sheet: one beat, never more (the owner's eye:
  // longer, a lone bar reads as a loading bar).
  assert.ok((lime - word) * F.CUT_MS <= 500, 'the word within half a second of the lime');
  assert.ok(F.GRID_HAIR_MS > 0 && F.GRID_HAIR_MS <= 0.5, 'the clock a hair ahead of the grid, never a frame');
  assert.ok(P0.sheet < 1 && P0.sheet > 0.99, 'never opaque, never seen through');
  assert.ok(P0.unprinted > 0 && P0.unprinted < 0.005, 'drawn, never seen');
  for (const [layout, plan] of Object.entries(PLANS)) {
    const pr = plan.prelude;
    assert.ok(close(pr.start, -F.PRELUDE_MS) && close(pr.lime, -lime * F.CUT_MS) && close(pr.word, -word * F.CUT_MS) && pr.end === 0, `${layout}: ${JSON.stringify(pr)}`);
    for (const t of [pr.start, pr.lime, pr.word, pr.end]) assert.ok(onGrid(t, F.CUT_MS, pr.start), `${layout}: a beat at ${t}, on the sixth from the first paint`);
    assert.equal(plan.acts.cuts.start, 0, 'film 0 is still the first page: no act, no cut moves');
    assert.ok(close(plan.cuts[1].start - pr.end, F.CUT_MS), 'the first page holds its sixth after the proof');
    // The five seconds: first paint to the page.
    const fpToPage = firstPaintToLanded(plan);
    assert.ok(fpToPage <= FIVE_S - F.CUT_MS, `${layout}: ${fpToPage.toFixed(1)} ms from the first paint to the page`);
    // Light on light: the proof turns nothing over.
    const tl = F.toneTimeline(plan);
    assert.equal(tl[0].tone, 'light');
    assert.ok(close(tl[0].start, -F.PRELUDE_MS), 'the tone line starts at the first paint');
    const flips = F.toneFlips(plan);
    const without = F.toneFlips({ ...plan, prelude: { start: 0, lime: 0, word: 0, end: 0 } });
    assert.deepEqual(flips.map((t) => Math.round(t * 1e3)), without.map((t) => Math.round(t * 1e3)), 'the proof adds no turn');
    // CAMERA's black and white in, paper again at THOUGHT, the burn's dark.
    const want = [2 * F.CUT_MS, 6 * F.CUT_MS, F.burnFrameStart(plan, F.BURN.out[0])];
    assert.equal(flips.length, want.length);
    flips.forEach((t, i) => assert.ok(close(t, want[i], 1e-5), `turn ${i}: ${t}`));
    assert.ok(flips[0] - pr.start >= 800, 'no turn before the proof and the first two pages have been read');
  }
  assert.ok(F.luminance(P0.ground) > 0.6, 'newsprint: light');
  assert.ok(Math.abs(F.luminance('#D2FF00') - F.luminance(P0.ground)) < 0.1, 'the lime plate is a change of hue, not of light');
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, new RegExp(`\\.of-sheet--newspaper \\{ --sheet-bg: ${P0.ground}; \\}`, 'i'), 'proof and first page: one newsprint');
  assert.match(ruleOf(css, '.of-proof'), new RegExp(`background: ${P0.ground};`, 'i'));
  // Before the island is up, the page's own ground and the film's layer's
  // are the proof's paper (a paint before the parser reaches the film, or
  // its sheet, is never a dark frame first); not under reduced motion (it
  // opens dark); no transition while it turns back.
  assert.match(css, new RegExp(`@media \\(prefers-reduced-motion: no-preference\\) \\{\\s*html\\[data-opening=''\\] body,\\s*html\\[data-opening=''\\] \\.opening \\{ background-color: ${P0.ground}; \\}\\s*\\}`, 'i'));
  assert.match(css, /html\[data-opening\] body \{ transition: none; \}/);
  // The slug: no place, and not his name (the film ends on it).
  const slug = [F.PROOF_SLUG.head, F.PROOF_SLUG.wide, ...F.PROOF_SLUG.plates];
  for (const text of slug) assert.doesNotMatch(text, /ryan|xu/i, text);
  for (const n of F.PLACE_NAMES) for (const text of slug) assert.doesNotMatch(text, new RegExp(`\\b${n}\\b`, 'i'), text);
});

test('the proof\'s clock: the plates on the proof\'s sixth from its first frame; the page on the first sixth the island can make, never sooner than a sixth after the word', () => {
  const CUT = F.CUT_MS;
  const { paint, lime, word } = F.PRELUDE.beats;
  // The lime's beat (the head script's): its own beat, or the first sixth
  // after.
  assert.ok(close(F.limeBeat(1000, 1100), 1000 + CUT), 'the face in: the lime on its own beat');
  assert.ok(close(F.limeBeat(1000, 1000 + CUT), 1000 + CUT), 'ready on the beat');
  assert.ok(close(F.limeBeat(1000, 1200), 1000 + 2 * CUT), 'a sixth late');
  // The page (the island): a sixth after the word, or the first sixth
  // after the island is ready.
  assert.ok(close(F.pageStart(1000 + CUT, 1100), 1500), 'fast: the page half a second after the first paint');
  assert.ok(close(F.pageStart(1000 + CUT, 1500), 1500), 'ready on the page\'s beat');
  assert.ok(close(F.pageStart(1000 + CUT, 2800), 1500 + 8 * CUT), 'a slow island: the title card holds');
  // The fallback (no plates were printed): the plan's own count-in.
  assert.ok(close(F.filmStart(1000, 1100), 1500), 'fast: the page half a second after the first paint');
  assert.ok(close(F.filmStart(1000, 1000 + CUT), 1500), 'ready on the lime\'s own beat');
  assert.ok(close(F.filmStart(1000, 1200), 1500 + CUT), 'a sixth late');
  assert.ok(close(F.filmStart(1000, 2800), 1500 + 10 * CUT), 'a slow island');
  assert.ok(close(F.filmStart(null, 500), 500 + 2 * CUT), 'no proof to count from: the lime when ready');
  const rand = F.seeded(4061);
  for (let i = 0; i < 2000; i += 1) {
    const o = rand() * 5000;
    const faceIn = o + rand() * 1500;
    const ready = o + rand() * 4000;
    // The head script: the lime on the proof's grid, once the face is in.
    const limeAt = F.limeBeat(o, faceIn);
    assert.ok(onGrid(limeAt, CUT, o), `the lime on the proof's grid: ${o} ${faceIn}`);
    assert.ok(limeAt - o >= (paint - lime) * CUT - 1e-6, 'never before its own beat');
    assert.ok(limeAt >= faceIn - 1e-6 && limeAt < Math.max(faceIn, o + (paint - lime) * CUT) + CUT, 'the first beat it can make');
    // The island: the page.
    const page = F.pageStart(limeAt, ready);
    assert.ok(onGrid(page, CUT, o), `the page on the proof's grid: ${o} ${ready}`);
    assert.ok(page - limeAt >= lime * CUT - 1e-6, 'the word a sixth after the lime, the page a sixth after the word — never sooner');
    assert.ok(page >= ready - 1e-6 && page < Math.max(ready, limeAt + lime * CUT) + CUT, 'the first sixth the island can make');
    // The fallback is the same grid (the island printing its own plates).
    const t0 = F.filmStart(o, ready);
    assert.ok(onGrid(t0, CUT, o) && t0 - o >= F.PRELUDE_MS - 1e-6, 'never shorter than the proof');
    assert.ok(close(t0, F.limeBeat(o, ready) + lime * CUT), 'the lime when the keyframes can make it, the page two beats on');
    assert.ok(close(t0 - word * CUT - (t0 - lime * CUT), (lime - word) * CUT), 'the word a beat after the lime');
  }
});

test('the proof is the first paint: a flat sheet; the stylesheet brings the lights down, at rest when down; the plates are held for their beats; a stalled stream shows the blank sheet, never the page', () => {
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const P0 = F.PRELUDE;
  const CUT = F.CUT_MS;
  const sheet = ruleOf(css, '.of-proof');
  assert.match(sheet, new RegExp(`opacity: ${P0.sheet};`));
  assert.match(sheet, /visibility: visible;/);
  const marks = ruleOf(css, '.of-proof-marks');
  assert.match(marks, /opacity: 1;/);
  assert.match(marks, /visibility: visible;/);
  // ONE running rule: the lights, on html[data-opening] (never data-clock,
  // so the clock can't cut it short), one animation (compositor), filled
  // both ways (the island reads the proof's start from it at any moment,
  // and seeks it) — on the vignette's own ::before, so the island's
  // opacity on the vignette is never the same property.
  const runs = [...css.matchAll(/([^{}]+)\{[^}]*animation:[^;}]*of-proof[^}]*\}/g)];
  const running = runs.filter((m) => !/animation: none/.test(m[0]));
  assert.equal(running.length, 1, running.map((m) => m[1].trim()).join(' | '));
  for (const m of runs) assert.doesNotMatch(m[1], /data-clock/, m[1]);
  const lights = ruleOf(css, 'html[data-opening] .of-frame__vignette::before').match(/animation: of-proof-lights (\d+\.?\d*)ms var\(--ease-develop\) both;/);
  assert.ok(lights && close(Number(lights[1]), P0.lights * CUT, 0.001), 'the lights go down over the first beat');
  assert.deepEqual(keyframesOf(css, 'of-proof-lights').map((k) => [k.offset, k.opacity]), [[0, 0], [1, 1]], 'from none to down, at rest down');
  for (const k of keyframesOf(css, 'of-proof-lights')) assert.match(k.body.trim(), /^opacity: [\d.]+;$/, 'opacity only');
  // The vignette's gradient is its ::before's (the element itself carries none).
  assert.match(css, /\n\.of-frame__vignette::before \{[^}]*content: '';[^}]*background: radial-gradient\(/);
  assert.match(css, /\n\.of-frame__vignette \{[^}]*\}/);
  assert.doesNotMatch(css.match(/\n\.of-frame__vignette \{[^}]*\}/)[0], /background/);
  // Nothing else of the proof is the stylesheet's to print: no lime, word,
  // label, crop-mark or grain animation (a lime printed on the stylesheet's
  // clock stood alone for seconds on a slow load, waiting for the island's).
  for (const name of ['of-proof-lime', 'of-proof-draw', 'of-proof-plate', 'of-grain-first']) assert.ok(!css.includes(name), name);
  assert.doesNotMatch(ruleOf(css, ".of-key[data-key='0'] .of-key__block"), /animation/);
  // The plates are held for their beats: the lime and the grain drawn at
  // the pages' warm opacity (unseen, their rasters done), the word at 0.
  const warm = css.match(/\.opening:not\(\[data-clock\]\) \.of-key\[data-key='0'\] \.of-key__block,\s*\.opening:not\(\[data-clock\]\) \.of-frame__grain \{ opacity: ([\d.]+); \}/);
  assert.ok(warm, 'the lime and the grain held');
  assert.equal(Number(warm[1]), P0.unprinted);
  assert.match(css, /\.opening:not\(\[data-clock\]\) \.of-key\[data-key='0'\] \.of-key__word \{ opacity: 0; \}/);
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.equal(Number(island.match(/const WARM_OPACITY = ([\d.]+);/)[1]), P0.unprinted, 'unprinted is the pages\' own warm opacity');
  // Its slug printed whole, and no step bar (nothing at its foot moves, or
  // reads as a progress bar and its status line, while the reader waits).
  assert.doesNotMatch(css, /\[data-plate/);
  assert.match(css, /\n\.of-proof-marks \.of-steps \{ display: none; \}/, 'no step bar, at every width');
  // The sheet is in the stream after every page: until it has come, the
  // frame's paper and pages are not drawn, so a stalled stream shows the
  // layer's newsprint ground (the blank proof), never the first page.
  assert.match(css, /\.of-frame:not\(:has\(> \.of-proof\)\) > \.of-frame__paper,\s*\.of-frame:not\(:has\(> \.of-proof\)\) > \.of-cut \{ visibility: hidden; \}/);
  // A portrait frame's lights: the rim outside its sides (no oval, no egg).
  const portrait = css.match(/@media \(max-aspect-ratio: 3\/4\) \{\s*\.of-frame__vignette::before \{ background: radial-gradient\(ellipse (\d+)% (\d+)% at 50% 50%, transparent (\d+)%, rgba\(23, 27, 21, ([\d.]+)\) 100%\); \}\s*\}/);
  assert.ok(portrait, 'the portrait lights');
  const [rx, ry, clear, dark] = portrait.slice(1).map(Number);
  assert.ok((rx / 100) * (clear / 100) >= 0.5, 'the lights clear the sides: the rim outside the frame');
  assert.ok(ry < rx && dark <= 0.3, 'darkening at the head, the foot and the corners, no deeper than the landscape\'s');
  // Reduced motion: no proof (the same selector as the running rule).
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.of-proof,\s*\.of-proof-marks \{ opacity: 0; visibility: hidden; \}/);
  assert.match(rm, /html\[data-opening\] \.of-frame__vignette::before \{ animation: none; \}/);
  // The phone keeps its registration mark, and the slug above the pill.
  const phone = css.slice(css.indexOf('.of-proof__wide { display: none; }') - 400, css.indexOf('.of-proof__wide { display: none; }') + 200);
  assert.match(phone, /\.of-proof-marks \.of-reg \{\s*display: block;\s*left: calc\(50% - 10px\);\s*width: 20px;\s*height: 20px;/);
  assert.match(phone, /bottom: calc\(max\(clamp\(1\.25rem, 2\.6vh, 2\.25rem\), env\(safe-area-inset-bottom\)\) \+ 58px\);/);
  // The markup: the sheet over the pages, under the anchor; the marks over
  // the soft edge; static; no crop marks (flush in the corners they read as
  // the bracket frame the owner had taken off the covers, and the foot's
  // right corner is the Skip pill's); the slug in the system monospace only.
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  const main = scenes.slice(scenes.indexOf('export default function OpeningScenes'));
  const at = (s) => main.indexOf(s);
  assert.ok(at('<ProofSheet') > at('<Cut key') && at('<ProofSheet') < at('className="of-anchor"'), 'the sheet between the pages and the anchor');
  assert.ok(at('<ProofMarks') > at('of-frame__soft'), 'the marks above the soft edge');
  assert.ok(at('data-vignette') > at('<ProofMarks'), 'the lights over the proof');
  const marksFn = scenes.slice(scenes.indexOf('function ProofMarks'), scenes.indexOf('// ── Act 1'));
  assert.match(marksFn, /<Marks crops=\{false\} \/>/);
  assert.match(scenes, /\{crops && \(\s*<>\s*<i className="of-crop of-crop--tl" \/>/);
  assert.match(marksFn, /className="of-proof__slug of-mono"/);
  assert.doesNotMatch(marksFn, /font-serif|font-ui/);
  assert.match(marksFn, /\{PROOF_SLUG\.head\} <span className="of-proof__wide">\{PROOF_SLUG\.wide\}<\/span> \{PROOF_SLUG\.plates\.join\(' '\)\}/, 'the slug printed whole');
  assert.doesNotMatch(scenes, /data-plate/);
  assert.ok(main.indexOf('of-frame__paper') < at('<Cut key') && at('<ProofSheet') > at('<Cut key'), 'the paper first, the pages, then the sheet');
});

test('the proof\'s plates: the lime a sixth of a second before the word, setting to full a frame before it; the island keeps the head script\'s own animations (the same keys, laid by the island only where there were none)', () => {
  const P0 = F.PRELUDE;
  const CUT = F.CUT_MS;
  const ink = F.proofInk();
  assert.deepEqual([ink[0].at, ink[0].opacity], [0, P0.limeInk], 'its first impression on its beat');
  assert.ok(close(ink.at(-1).at, P0.set) && ink.at(-1).opacity === 1, 'set to full');
  for (let i = 1; i < ink.length; i += 1) {
    assert.ok(ink[i].at > ink[i - 1].at && ink[i].at - ink[i - 1].at <= 25 + 1e-9, 'on the house curve, sampled every 25 ms at most');
    assert.ok(ink[i].opacity >= ink[i - 1].opacity, 'the ink only sets');
  }
  assert.ok(P0.set <= (P0.beats.lime - P0.beats.word) * CUT - 1000 / 60, 'set a frame before the word');
  // On the film's clock, from any beat (a slow load prints them earlier).
  for (const limeT of [-P0.beats.lime * CUT, -1500, -2833.333]) {
    const keys = F.proofLimeKeys(limeT);
    assert.deepEqual(keys.slice(0, 2).map((k) => [+k.t.toFixed(6), k.opacity]), [[+limeT.toFixed(6), P0.unprinted], [+limeT.toFixed(6), P0.limeInk]], 'unprinted to its beat, then its first impression (a step)');
    keys.slice(1).forEach((k, i) => assert.ok(close(k.t - limeT, ink[i].at) && k.opacity === ink[i].opacity, 'the same keys as the head script\'s'));
  }
  assert.deepEqual(F.proofLimeKeys(), F.proofLimeKeys(-P0.beats.lime * CUT));
  const island = read('../src/components/home/OpeningFilm.tsx');
  // The island lays the plates only where they were not printed before it:
  // the plates' own animations are kept, the only ones on their elements
  // (a second opacity animation on one element takes both off the
  // compositor, and under load the plates printed late, off the cuts' grid).
  assert.match(island, /const block0 = q\('\[data-key="0"\] \[data-block\]'\);\s*const word0 = q\('\[data-key="0"\] \[data-word\]'\);\s*if \(!platePrinted\(block0\)\) preKeys\(block0, proofLimeKeys\(limeAt\)\);\s*if \(!platePrinted\(word0\)\) pre\(word0, 0, \[\[wordAt\(\), 1\]\]\);/);
  assert.match(island, /const platePrinted = \(el: Element \| null\) => !!el && !!plates\?\.anims\.some\(\(a\) => \(a\.effect as KeyframeEffect \| null\)\?\.target === el\);/);
  assert.equal((island.match(/proofLimeKeys\(/g) ?? []).length, 1, 'the lime laid in one place only');
  assert.equal((island.match(/\[data-key="0"\] \[data-(block|word)\]/g) ?? []).length, 2, 'the plates\' elements touched in one place only');
  assert.match(island, /const wordAt = \(\) => limeAt \+ \(PRELUDE\.beats\.lime - PRELUDE\.beats\.word\) \* CUT_MS;/);
  assert.match(island, /let limeAt: number = plan\.prelude\.lime;/);
  // The proof's part on the clock reaches back to the earliest plate.
  assert.match(island, /const preLead = Math\.max\(PRELUDE_MS, -limeAt \+ CUT_MS\);/);
  // The film's grain comes with the page (unseen before: drawn warm), and
  // goes where it always went.
  assert.match(island, /pre\(grainEl, WARM_OPACITY, \[\[pr\.end, 1\], \[acts\.hand\.start, 0\]\]\);\s*if \(grainEl\) goneAfter\(grainEl, acts\.hand\.start\);/);
  assert.match(island, /\[q\('\[data-paper\]'\), q\('\[data-soft\]'\), q\('\[data-vignette\]'\)\]\.forEach\(\(el\) => el && scene\(el, 0, acts\.hand\.start\)\);/);
  // The word's face: the first scene's, waited for by the head script (the
  // proof holds for it), a while at most; the island never waits for it.
  assert.equal(F.SCENES[0].word, 'ARCHIVE');
  assert.equal(F.SCENES[0].face, 'f900');
  assert.equal(F.PROOF_FACE, '900 100px Fraunces');
  assert.ok(F.FONT_LOADS.includes(F.PROOF_FACE));
  assert.ok(F.PROOF_FACE_WAIT_MS >= F.FONT_WAIT_MS && F.PROOF_FACE_WAIT_MS <= 1500, `${F.PROOF_FACE_WAIT_MS} ms`);
  assert.doesNotMatch(island, /proofFaceIn|fonts\?\.load\(PROOF_FACE/);
});

test('the island: one clock from the proof\'s first frame; it takes the head script\'s plates over; the proof moves with seek and skip', () => {
  const island = read('../src/components/home/OpeningFilm.tsx');
  const begin = island.slice(island.indexOf('const begin = () => {'), island.indexOf('// A verification hook'));
  assert.match(begin, /overlay\.setAttribute\('data-clock', ''\);\s*const proof = proofAnims\(\);/);
  // The plates printed (the head script's): the page on the first sixth the
  // keyframes can make, their beats kept on the film's clock.
  assert.match(begin, /const ready = nowMs\(\) \+ CLOCK_LEAD_MS;\s*const lime = plates\?\.lime \?\? null;\s*if \(lime != null\) \{\s*const page = pageStart\(lime, ready\);\s*t0 = page - GRID_HAIR_MS;\s*limeAt = lime - page;/);
  // None printed: the island's own count-in from the proof's first frame.
  assert.match(begin, /t0 = filmStart\(seekParam != null \? null : origin, ready\) - GRID_HAIR_MS;\s*limeAt = plan\.prelude\.lime;/);
  assert.match(begin, /const origin = starts\.length \? Math\.min\(\.\.\.starts\) : proof\.length \? nowMs\(\) : null;/);
  assert.match(begin, /if \(a\.startTime == null\) a\.startTime = t0 - PRELUDE_MS;/);
  assert.match(begin, /if \(pendingSkip\) \{[\s\S]*?proof\.forEach\(\(a\) => a\.finish\(\)\);\s*plates\?\.hold\(\);\s*plates\?\.anims\.forEach\(\(a\) => a\.finish\(\)\);[\s\S]*?\} else \{/);
  assert.ok(begin.indexOf("setAttribute('data-clock', '')") < begin.indexOf('build();'), 'the clock and the keyframes in one task');
  // The clock never starts before its keyframes are laid: laid late (a slow
  // phone), the page goes to a later sixth of the same grid.
  assert.match(begin, /build\(\);\s*if \(!pendingSkip && seekParam == null\) \{[\s\S]*?const late = nowMs\(\) \+ CLOCK_LEAD_MS - \(t0 \+ GRID_HAIR_MS\);\s*if \(late > 0\) \{\s*const shift = Math\.ceil\(late \/ CUT_MS - 1e-6\) \* CUT_MS;\s*shiftAll\(shift\);/);
  assert.ok(begin.indexOf('shiftAll(shift)') < begin.indexOf('schedule();'), 'shifted before the moments are scheduled');
  assert.match(island, /\.filter\(\s*\(a\) => typeof \(a as CSSAnimation\)\.animationName === 'string' && \(a as CSSAnimation\)\.animationName\.startsWith\('of-proof'\),?\s*\)/);
  // The head script's record, taken over once (and its taps stopped) before
  // anything else; its own when there was none; none for ?filmT.
  const effect = island.slice(island.indexOf('useEffect(() => {'));
  assert.ok(effect.indexOf('window.__proofPlates = undefined;') < effect.indexOf('if (!overlayEl || !skipEl) return;'), 'taken before any early return');
  assert.match(effect, /const headPlates = window\.__proofPlates \?\? null;\s*window\.__proofPlates = undefined;\s*headPlates\?\.off\(\);/);
  assert.match(island, /const plates: ProofPlates \| null = seekParam != null \? null : \(headPlates \?\? proofPlates\(PLATES, false\)\);/);
  const ff = island.slice(island.indexOf('const fastForward = () => {'), island.indexOf('onSkipFilm = fastForward;'));
  assert.match(ff, /if \(phase === 'wait'\) \{[\s\S]*?pendingSkip = true;\s*plates\?\.hold\(\);\s*skipNow\(\);\s*return;/);
  assert.match(ff, /shiftAll\(-\(target - t\)\);[\s\S]*proofAnims\(\)\.forEach\(\(a\) => a\.finish\(\)\);\s*plates\?\.anims\.forEach\(\(a\) => a\.finish\(\)\);/);
  const seek = island.slice(island.indexOf('const seek = (t: number) => {'), island.indexOf('if (seekParam != null) {\n      (window'));
  assert.match(seek, /proofAnims\(\)\.forEach\(\(a\) => \{\s*a\.pause\(\);\s*a\.currentTime = Math\.max\(0, t \+ PRELUDE_MS\);/);
  assert.match(island, /el\.animate\(frames, \{ delay: -preLead, duration: preSpan, fill: 'both', easing: 'linear' \}\);\s*anim\.startTime = t0;\s*filmAnims\.push\(anim\);/);
  assert.match(island, /pre\(sheet, PRELUDE\.sheet, \[\[pr\.end, 0\]\]\);/);
  assert.match(island, /pre\(marks, 1, \[\[pr\.end, 0\]\]\);/);
  assert.match(island, /goneAfter\(sheet, pr\.end\)/);
  assert.match(island, /goneAfter\(marks, pr\.end\)/);
  assert.match(island, /grain\(q\('\[data-grain-tile\]'\), -PRELUDE_MS, acts\.hand\.start\)/);
});

test('skip before the island is up: the head script takes the tap; the island goes to the end title at once, waiting for nothing', () => {
  const island = read('../src/components/home/OpeningFilm.tsx');
  // The pill tapped before hydration (html[data-skip-pending]): the film's
  // skip, or reduced motion's crossfade, at once.
  assert.match(island, /let pendingSkip = html\.hasAttribute\('data-skip-pending'\);/);
  assert.match(island, /if \(pendingSkip\) skipNow\(\);/);
  assert.match(island, /if \(pendingSkip\) plates\?\.hold\(\);/);
  assert.match(island, /later\(fade, html\.hasAttribute\('data-skip-pending'\) \? 0 : STILL\.hold\);/);
  // The clock waits for the fonts (at most FONT_WAIT_MS) and the plates —
  // a skip for neither.
  assert.match(island, /Promise\.race\(\[Promise\.all\(\[fontsIn, plates\?\.decided\]\), skipped\]\)\.then\(whenVisible\)\.then\(\(\) => \{\s*\/\/[^\n]*\n\s*requestAnimationFrame\(begin\);/);
  const finish = island.slice(island.indexOf('const finish = () => {'), island.indexOf('// ── Input: only the Skip pill skips ──'));
  assert.match(finish, /html\.removeAttribute\('data-skip-pending'\);/);
  // The pill held pressed meanwhile (never a hover's look only: taken).
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /html\[data-skip-pending\] \.of-skip \{\s*background: rgba\(23, 27, 21, 0\.94\);\s*color: rgba\(244, 244, 237, 0\.45\);\s*scale: 0\.93;\s*\}/);
  // The head script is the page's, right after the reel's decision.
  const page = read('../src/pages/index.astro');
  assert.ok(page.indexOf('set:html={reelHeadScript()}') > 0 && page.indexOf('set:html={proofHeadScript()}') > page.indexOf('set:html={reelHeadScript()}'), 'after html[data-opening] is decided');
});

test('the first key is the stylesheet\'s for good: the first paint\'s numbers are the island\'s, its optical size pinned (the lime never moves or changes size, at any width)', () => {
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const nums = '--c0: min\\(12vh, calc\\((\\d+)vw \\/ ([\\d.]+)\\)\\);\\s*--c0w: ([\\d.]+);\\s*--c0l: ([\\d.]+);\\s*--c0b: ([\\d.]+);\\s*--c0o: ([\\d.]+);';
  const desk = css.match(new RegExp(`\\.opening \\{\\s*${nums}`));
  const phone = css.match(new RegExp(`@media \\(max-width: 1023px\\) \\{\\s*\\.opening \\{\\s*${nums}`));
  assert.ok(desk && phone);
  for (const [layout, m] of [['desktop', desk], ['phone', phone]]) {
    const fp = F.FIRST_PAINT[layout];
    assert.deepEqual([Number(m[4]), Number(m[5]), Number(m[6])], [fp.left, fp.base, fp.opsz], `${layout}: the word's pen, baseline and optical size`);
  }
  // Its word: set at the anchor's cap (0.7 of its em), its optical size
  // pinned (its ink per cap, and so its padding, the same at every width).
  assert.match(ruleOf(css, ".of-key[data-key='0'] .of-key__word"), new RegExp(`font-size: calc\\(var\\(--c0\\) \\/ ${F.FIRST_PAINT_CAP_EM}\\);\\s*font-variation-settings: 'opsz' var\\(--c0o\\);`));
  assert.match(ruleOf(css, ".of-key[data-key='0'] .of-key__word"), new RegExp(`top: calc\\(50vh \\+ var\\(--c0\\) \\/ 2 - var\\(--c0b\\) \\* var\\(--c0\\) \\/ ${F.FIRST_PAINT_CAP_EM}\\);`));
  // The desktop's at its largest optical size (its set size is past it at
  // 1728 × 1000); the phone's at its set size on a 390 px phone.
  assert.equal(F.FIRST_PAINT.desktop.opsz, 144);
  const c390 = Math.min(0.12 * 844, (F.ANCHOR.maxWidth.phone * 390) / F.FIRST_PAINT.phone.across);
  assert.ok(Math.abs(c390 / F.FIRST_PAINT_CAP_EM - F.FIRST_PAINT.phone.opsz) < 0.01, `${c390 / F.FIRST_PAINT_CAP_EM}`);
  const c1728 = Math.min(0.12 * 1000, (F.ANCHOR.maxWidth.desktop * 1728) / F.FIRST_PAINT.desktop.across);
  assert.ok(c1728 / F.FIRST_PAINT_CAP_EM >= 144, 'the desktop\'s set size is past the largest optical size');
  assert.equal(Number(desk[1]) / 100, F.ANCHOR.maxWidth.desktop);
  assert.equal(Number(phone[1]) / 100, F.ANCHOR.maxWidth.phone);
  assert.equal(Number(desk[2]), F.FIRST_PAINT.desktop.across);
  assert.equal(Number(desk[3]), F.FIRST_PAINT.desktop.key0);
  assert.equal(Number(phone[2]), F.FIRST_PAINT.phone.across);
  assert.equal(Number(phone[3]), F.FIRST_PAINT.phone.key0);
  assert.equal(F.ANCHOR.capVh, 0.12);
  // Both layouts fit the same widest word (every scene plays on both).
  assert.equal(F.FIRST_PAINT.desktop.across, F.FIRST_PAINT.phone.across);
  // The same block, derived both ways: desktop 1728×1000, phone 390×844.
  for (const [layout, W, H, box] of [['desktop', 1728, 1000, [440.28, 406.4, 847.44, 187.2]], ['phone', 390, 844, [23.02, 386.69, 343.97, 70.62]]]) {
    const fp = F.FIRST_PAINT[layout];
    const cap = F.anchorCap(W, H, fp.across - 2 * F.ANCHOR.pad, layout);
    const kb = F.keyBox(W, H, cap, (fp.key0 - 2 * F.ANCHOR.pad) * cap);
    const c0 = Math.min(0.12 * H, (F.ANCHOR.maxWidth[layout] * W) / fp.across);
    assert.ok(close(cap, c0, 1e-9), `${layout}: the island's cap is the stylesheet's --c0`);
    assert.ok(close(kb.block.w, fp.key0 * c0, 1e-9) && close(kb.block.x, W / 2 - (fp.key0 * c0) / 2, 1e-9) && close(kb.block.h, 1.56 * c0, 1e-9) && close(kb.block.y, H / 2 - 0.78 * c0, 1e-9), `${layout}: the block`);
    [kb.block.x, kb.block.y, kb.block.w, kb.block.h].forEach((v, i) => assert.ok(Math.abs(v - box[i]) < 0.01, `${layout} ${i}: ${v}`));
  }
  // The island takes the cap from them, always, never from a measure (a
  // fallback face, faces that never come), and never lays the first key
  // (its block, its word, its page's block edges): the stylesheet's, in vw
  // and vh, so a resize or a turn re-lays it on its own frame.
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /const firstPaint = FIRST_PAINT\[plan\.layout\];/);
  assert.match(island, /const cap = anchorCap\(W, H, firstPaint\.across - 2 \* ANCHOR\.pad, plan\.layout\);/);
  assert.equal([...island.matchAll(/anchorCap\(/g)].length, 1, 'one cap, the first paint\'s');
  assert.match(island, /keys\.forEach\(\(key, i\) => \{\s*if \(i === 0\) \{\s*const kb = keyBox\(W, H, cap, \(firstPaint\.key0 - 2 \* ANCHOR\.pad\) \* cap\);\s*anchorBase = kb\.baseline;\s*blocks\.push\(kb\.block\);\s*return;\s*\}/);
  assert.match(island, /block\.style\.width = px\(box\.w\);/);
  assert.match(island, /word\.style\.left = px\(kb\.inkX \+ ink\.left\);/);
  for (const plan of Object.values(PLANS)) assert.equal(plan.cuts[0].index, 0, 'the first cut is the first key (the stylesheet\'s)');
});

test('one ink box, letter by letter: a letter fitted into its own box is itself; into another, it fills it', () => {
  // The faces swapped in one instant (never a frame with both), inside the
  // letters' morph, near its middle.
  const mid = (w) => (w[0] + w[1]) / 2;
  for (const [box, fade] of [[F.TITLE.box, F.TITLE.swap], [F.LANDING_A.morph, F.LANDING_A.sourceOut], [F.LANDING_A.morph, F.LANDING_A.targetIn]]) {
    assert.ok(Math.abs(mid(box) - mid(fade)) <= 0.03, `centred: ${box} / ${fade}`);
    assert.equal(fade[1] - fade[0], 0, `one instant: ${fade}`);
  }
  assert.match(read('../src/components/home/OpeningScenes.tsx'), /text=\{TITLE_NAME\}/);
  const ink = { l: 12, r: 60, t: -70, b: 2 };
  const same = F.glyphFit(ink, 10, 0, ink);
  assert.ok(close(same.sx, 1) && close(same.sy, 1) && close(same.tx, 0) && close(same.ty, 0));
  const to = { l: 30, r: 110, t: -80, b: 0 };
  const f = F.glyphFit(ink, 10, 0, to);
  const map = (x, y) => [10 + f.tx + f.sx * (x - 10), 0 + f.ty + f.sy * (y - 0)];
  const [l, t] = map(ink.l, ink.t);
  const [r, b] = map(ink.r, ink.b);
  assert.ok(close(l, to.l) && close(t, to.t) && close(r, to.r) && close(b, to.b));
  assert.equal(F.morphAt(0, [0.2, 0.6]), 0);
  assert.equal(F.morphAt(1, [0.2, 0.6]), 1);
  assert.ok(close(F.morphAt(0.4, [0.2, 0.6]), 0.5));
});

test('act 1: the keywords in the owner\'s order, a new face at every cut, ten scenes', () => {
  const S = F.SCENES;
  assert.ok(S.length >= 9 && S.length <= 12, `${S.length} scenes`);
  const groups = [];
  S.forEach((s) => (groups.at(-1) === s.word ? null : groups.push(s.word)));
  assert.deepEqual(groups, ['ARCHIVE', 'CAMERA', 'TRAVEL', 'THOUGHT', 'YOU']);
  // Two pages a keyword, each a different kind of printed matter: an
  // editorial page and a piece of printed matter (the owner's quick cuts
  // through magazines and newspapers, kept in the five seconds).
  const count = (w) => S.filter((s) => s.word === w).length;
  for (const w of ['ARCHIVE', 'CAMERA', 'TRAVEL', 'THOUGHT', 'YOU']) {
    assert.equal(count(w), 2, `${w} ${count(w)}`);
    const pages = S.filter((s) => s.word === w);
    assert.equal(pages.filter((s) => s.sheet).length, 1, `${w}: one piece of printed matter`);
    assert.equal(pages.filter((s) => !s.sheet).length, 1, `${w}: one editorial page`);
  }
  for (const plan of Object.values(PLANS)) {
    assert.equal(plan.cuts.at(-1).word, 'YOU', 'YOU is the last page before the hand-off');
    assert.equal(plan.cuts[0].word, 'ARCHIVE');
    for (let i = 1; i < plan.cuts.length; i += 1) assert.notEqual(plan.cuts[i].face, plan.cuts[i - 1].face, 'every cut changes the face');
    for (const face of F.FACE_ORDER) assert.ok(plan.cuts.some((c) => c.face === face), face);
  }
  // Every page a sixth: the first (the proof was its hold) and YOU's last
  // (the hand-off carries its block on) like the rest.
  S.forEach((s, k) => assert.equal(s.slots, 1, `${k}: ${s.slots}`));
  assert.equal(F.faceText('ARCHIVE', 'fit'), 'Archive');
  assert.equal(F.faceText('YOU', 'sg700'), 'YOU');
  // The words that must be seen: ARCHIVE, CAMERA, TRAVEL, RYAN XU, YOU —
  // and never cinema, anywhere in the film's source.
  assert.equal(F.DARK_TYPED, 'ryan xu');
  assert.equal(F.TITLE_NAME, 'Ryan Xu');
  assert.deepEqual([...F.TITLE_SUB], ['CAMERA', 'ARCHIVE', 'TRAVEL', 'THOUGHT']);
  assert.equal(F.TITLE_YOU.word, 'YOU');
  for (const file of SOURCES) assert.doesNotMatch(read(file), /cinema/i, file);
  assert.match(read('../src/components/home/OpeningScenes.tsx'), /data-fly="you"/);
});

test('act 1: editorial pages alternate with printed matter; at least four type tiers and layered print on every page', () => {
  const S = F.SCENES;
  const sheets = S.filter((s) => s.sheet).map((s) => s.sheet);
  assert.ok(sheets.length >= 5, `${sheets.length} pieces of printed matter`);
  assert.equal(new Set(sheets).size, sheets.length, 'each kind once');
  for (const kind of ['newspaper', 'magazine', 'ticket', 'telegram', 'postcard']) assert.ok(sheets.includes(kind), kind);
  // Every kind of sheet the film draws is played (none left behind).
  assert.deepEqual(Object.keys(F.SHEETS).sort(), [...sheets].sort());
  assert.deepEqual(Object.keys(F.SHEET_TONE).sort(), [...sheets].sort());
  assert.ok(S.filter((s) => !s.sheet).length >= 5, 'editorial pages');
  for (let i = 1; i < S.length; i += 1) assert.ok(!(S[i].sheet && S[i - 1].sheet), `two sheets in a row at ${i}`);
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  let dense = 0;
  for (const [i, s] of S.entries()) {
    // Tier 1: 1–2 giant words, 30–45% of the short side, cropped.
    assert.ok(s.giants.length >= 1 && s.giants.length <= 2, `${i} giants`);
    for (const g of s.giants) {
      assert.ok(g.cap >= 0.3 && g.cap <= 0.45, `${g.text} ${g.cap}`);
      assert.ok(g.face === 'f900' || g.face === 'f400');
    }
    if (s.sheet) {
      // Tiers 2–4: the sheet's words on the anchor's line, its print, its
      // fine print (each sheet component draws them; SHEETS holds their
      // words).
      const c = F.SHEETS[s.sheet];
      assert.ok(c.row && c.row.some((x) => x), `${s.sheet} has words on the anchor's line`);
      assert.ok(Object.keys(c).length >= 3, `${s.sheet}: its layers`);
    } else {
      // Tier 2: words beside the anchor, in the three roles; tier 3: a
      // ringed word, the layers (a note, a pull quote, a stamp, a caption…);
      // tier 4: 2–3 texture paragraphs, the meta at both corners, a credit.
      const roles = new Set(s.side.map((w) => w.role));
      for (const role of ['caps', 'italic', 'thin']) assert.ok(roles.has(role), `${i} ${role}`);
      assert.ok(s.side.some((w) => w.at === 'l') && s.side.some((w) => w.at === 'r'));
      assert.ok(s.deco.ringed && s.deco.metaL && s.deco.metaR);
      assert.ok(s.deco.texture.length >= 2 && s.deco.texture.length <= 3, '2–3 texture paragraphs');
      assert.ok(s.ground, `${i}: its ground`);
      const l = s.layers;
      assert.ok(l, `${i}: layers`);
      const n = ['run', 'print', 'clip', 'pull', 'note', 'stamp', 'receipt', 'num', 'barcode', 'tabs', 'marks'].filter((k) => l[k]).length;
      assert.ok(l.density === 'dense' ? n >= 3 : n >= 2, `${i}: ${n} layers for a ${l.density} page`);
      if (l.density === 'dense') dense += 1;
      if (l.print) assert.ok(l.print.w <= 0.2 && l.print.pic >= 0 && l.print.pic <= 2);
    }
  }
  // The rhythm breathes: crowded and calm pages both.
  const eds = S.filter((s) => !s.sheet).length;
  assert.ok(dense >= 2 && eds - dense >= 2, `${dense} dense of ${eds}`);
  // His own photographs only (the film's three), at their ratio.
  assert.match(scenes, /<Picture picture=\{pictures\[l\.print\.pic\]\}/);
});

test('no place names: the suspense — only the tiny egg, in a column, never the keyword', () => {
  const names = F.PLACE_NAMES;
  const eggText = F.EGGS.map((e) => e.text);
  assert.ok(F.EGGS.length >= 1 && F.EGGS.length <= 2);
  for (const e of F.EGGS) assert.ok(e.px <= 8, `${e.text} is tiny`);
  // Every word the film shows, but the eggs.
  const shown = [];
  const walk = (v) => {
    if (typeof v === 'string') shown.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk([F.SCENES, F.SHEETS, F.TEXTURE, F.CREDIT, F.TYPED, F.DARK_TYPED, F.TITLE_NAME, F.TITLE_SUB, F.TITLE_YOU, F.LEADER, F.PROOF_SLUG]);
  const hits = shown.filter((text) => !eggText.includes(text) && names.some((n) => new RegExp(`\\b${n}\\b`, 'i').test(text)));
  // "page" is also a word: only the place, in capitals or as a name, counts.
  const real = hits.filter((text) => !/^[^A-Z]*\bpage\b/.test(text) || /Page,|PAGE/.test(text));
  assert.deepEqual(real, [], 'a place named outside the eggs');
  // No giant word, keyword or side word is a place.
  for (const s of F.SCENES) {
    for (const g of s.giants) assert.ok(!names.some((n) => g.text.toUpperCase().includes(n.toUpperCase())), g.text);
  }
  // The markup names none either (its words come from the data).
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  for (const n of names.filter((x) => x !== 'Page')) assert.doesNotMatch(scenes, new RegExp(`>[^<]*\\b${n}\\b`), n);
});

test('act 1: the anchor never moves — one centre, one block height, one cap height; its reading zone kept clear', () => {
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
      assert.ok(close(b.baseline - cap / 2, b.cy));
      assert.ok(close(b.inkX + (b.block.w - 2 * cap * F.ANCHOR.pad) / 2, b.cx));
      const z = F.readingZone(b.block, cap);
      assert.ok(close(z.x, b.block.x - cap * F.ANCHOR.clear) && close(z.h, b.block.h + 2 * cap * F.ANCHOR.clear));
    }
    assert.ok(boxes[3].block.w > boxes[0].block.w);
  }
  assert.ok(F.ANCHOR.clear >= 0.3, 'a clear margin round the block');
  assert.ok(close(F.anchorCap(1728, 1000, 5.9, 'desktop'), 120));
  const phoneCap = F.anchorCap(390, 844, 5.9, 'phone');
  assert.ok(phoneCap < 0.12 * 844 && close(phoneCap * (5.9 + 2 * F.ANCHOR.pad), 0.86 * 390, 1e-6));
  for (const s of F.SCENES) for (const key of ['x', 'y', 'cap', 'anchor', 'block']) assert.equal(s[key], undefined, key);
  // The island keeps every placed layer out of the zone.
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /const zone = readingZone\(block, cap\);\s*const keep: Rect\[\] = \[zone, skipBox\];/);
});

test('act 1: the drift runs on across every cut (the same way, or a quarter turn), 20–60 px', () => {
  for (const plan of Object.values(PLANS)) {
    for (let i = 1; i < plan.cuts.length; i += 1) {
      const a = F.DRIFT_DEG[plan.cuts[i - 1].drift];
      const b = F.DRIFT_DEG[plan.cuts[i].drift];
      const turn = Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
      assert.ok(turn === 0 || turn === 90, `${plan.layout} ${i}: ${turn}°`);
    }
  }
  for (const s of F.SCENES) assert.ok(s.driftPx >= 20 && s.driftPx <= 60, `${s.word} ${s.driftPx}`);
  // The phone's drift and giants are scaled to its small frame (its local
  // flash budget); the stylesheet's --drift-k (the blur copies) agrees.
  assert.equal(F.DRIFT_SCALE.desktop, 1);
  assert.ok(F.DRIFT_SCALE.phone > 0.4 && F.DRIFT_SCALE.phone < 1);
  const css = read('../src/styles/opening.css');
  assert.match(css, new RegExp(`\\.opening \\{[\\s\\S]*?--drift-k: ${F.DRIFT_SCALE.desktop};`));
  assert.match(css, new RegExp(`@media \\(max-width: 1023px\\) \\{\\s*\\.opening \\{[^}]*--drift-k: ${F.DRIFT_SCALE.phone};`));
  assert.equal(F.GIANT_CAP_MAX.desktop, 0.45);
  assert.ok(F.GIANT_CAP_MAX.phone >= 0.3 && F.GIANT_CAP_MAX.phone < 0.45);
  assert.equal(F.giantCap({ cap: 0.44 }, 'phone'), F.GIANT_CAP_MAX.phone);
  assert.equal(F.giantCap({ cap: 0.44 }, 'desktop'), 0.44);
  assert.ok(F.BLUR_COPIES.length >= 3 && F.BLUR_COPIES.length <= 4);
  for (let i = 1; i < F.BLUR_COPIES.length; i += 1) assert.ok(F.BLUR_COPIES[i].opacity < F.BLUR_COPIES[i - 1].opacity);
});

test('act 4: the burn — every stage in the spec\'s order, a frame or two each: flicker, slip, burn, out, the leader\'s card', () => {
  // Nine frames (it was 22: the black frame, five leader cards and the lit
  // perforations went with the five seconds).
  assert.equal(F.BURN.frames, 9);
  assert.deepEqual([...F.BURN.flicker], [0, 2]);
  assert.equal(F.BURN.slip, 2);
  assert.deepEqual([...F.BURN.burn], [3, 6]);
  assert.deepEqual([...F.BURN.out], [6, 8]);
  assert.deepEqual([...F.BURN.leader], [8, 9]);
  assert.equal(F.BURN.leader[1], F.BURN.frames, 'the leader ends the burn');
  assert.equal(F.LEADER.length, F.BURN.leader[1] - F.BURN.leader[0], 'one card a frame');
  assert.ok(F.LEADER[0].startsWith('count-'), 'the countdown card');
  assert.equal(F.BURN.radius.length, F.BURN.out[1] - F.BURN.burn[0], 'a radius each frame from the burn until the frame has gone');
  assert.equal(F.BURN.darkness.length, F.BURN.out[1] - F.BURN.out[0]);
  assert.equal(F.BURN.slide.length, F.BURN.out[1] - F.BURN.out[0]);
  assert.ok(close(F.frameAt(2).y, -0.25));
  assert.equal(F.frameAt(1).y, 0);
  assert.equal(F.frameAt(3).y, 0);
  assert.ok(close(F.frameAt(7).rot, 6));
  for (let f = 0; f < 8; f += 1) assert.ok(Math.abs(F.frameAt(f).x) <= 1 && Math.abs(F.frameAt(f).weaveY) <= 1);
  for (let f = 0; f < 2; f += 1) assert.ok(Math.abs(F.burnFrame(f).flick) > 0, `flicker f${f}`);
  assert.ok(F.burnFrame(0).flick > 0 && F.burnFrame(1).flick < 0, 'light, then dark');
  for (let f = 2; f < F.BURN.frames; f += 1) assert.equal(F.burnFrame(f).flick, 0, `no flicker f${f}`);
  for (let f = 6; f < 8; f += 1) assert.ok(F.frameAt(f).y < 0, `slide f${f} up`);
  assert.ok(F.frameAt(8).y <= -1, 'gone off the top');
  for (let f = 4; f < 8; f += 1) assert.ok(F.burnRadius(f) > F.burnRadius(f - 1));
  assert.equal(F.burnRadius(2), 0);
  assert.equal(F.burnDarkness(5), 0);
  assert.ok(F.burnDarkness(7) > F.burnDarkness(6));
  assert.equal(F.burnDarkness(8), 1);
});

test('no strobe: light/dark turns ≤ 3 in any second, ≤ 6 in all (a mid ground turns nothing); the burn never brighter than bone', () => {
  assert.ok(F.FLIP_BUDGET.total <= 6 && F.FLIP_BUDGET.perSecond <= 3);
  for (const plan of Object.values(PLANS)) {
    const flips = F.toneFlips(plan);
    assert.ok(flips.length <= F.FLIP_BUDGET.total, `${plan.layout}: ${flips.length} turns`);
    for (const t of flips) {
      const inWindow = flips.filter((c) => c >= t && c < t + 1000).length;
      assert.ok(inWindow <= F.FLIP_BUDGET.perSecond, `${plan.layout}: ${inWindow} turns from ${t} ms`);
    }
    const tl = F.toneTimeline(plan);
    assert.equal(tl[0].tone, 'light', 'the first page is paper');
    assert.equal(tl.at(-1).tone, 'dark');
    // The colour comes in runs: the dark pages together (CAMERA in black
    // and white, TRAVEL in the stocks), never a light page alone among
    // them or a dark one alone among the light.
    const tones = plan.cuts.map((c) => c.tone).filter((t) => t !== 'mid');
    const runs = tones.filter((t, i) => i === 0 || t !== tones[i - 1]).length;
    assert.ok(runs <= 3, `${runs} runs of tone in the match cuts`);
  }
  // Every scene's tone comes from its ground: the dark grounds are the
  // site's own (ink, olive, the new-york slate, the stocks).
  for (const [g, hex] of Object.entries(F.GROUND_HEX)) {
    const L = F.luminance(hex);
    if (F.GROUND_TONE[g] === 'dark') assert.ok(L < 0.06, `${g} ${L}`);
    else assert.ok(L > 0.6, `${g} ${L}`);
  }
  const bone = F.luminance('#F4F4ED');
  for (const c of F.BURN_RAMP) assert.ok(F.luminance(c) <= bone + 1e-9, c);
  assert.equal(F.BURN_RAMP[0], '#F4F4ED');
  assert.ok(F.luminance(F.BURN_HOLE) < 0.02);
});

test('acts 5–6: the dark typed with one lime cursor, a key a 24th, then the line turns into the title, held formed', () => {
  for (const plan of Object.values(PLANS)) {
    const t = plan.darkTyping;
    assert.equal(t.length, F.DARK_TYPED.length);
    assert.equal(t[0], plan.acts.dark.start + F.DARK_TYPE_AT);
    t.forEach((k, i) => assert.ok(close(k, plan.acts.dark.start + i * F.FRAME24_MS, 1e-6), `key ${i} on its 24th`));
    const cps = ((t.length - 1) * 1000) / (t.at(-1) - t[0]);
    assert.ok(cps > 20 && cps < 26, `${cps.toFixed(1)} a second`);
    assert.ok(t.at(-1) < plan.acts.title.start, 'the line is whole a frame before it is struck');
    // The title: formed (its morph done, its credits up) and held before
    // the landing — the skip lands on that hold.
    assert.ok(plan.acts.title.start + F.TITLE.morph <= plan.length - F.FF_TAIL + 1e-6);
    assert.ok(F.TITLE.sub[1] <= F.TITLE.morph && F.TITLE.you[1] <= F.TITLE.morph, 'the credits up as it forms');
  }
  assert.ok(F.TITLE.morph < F.ACT_MS.title);
  assert.ok(F.TITLE.box[0] <= F.TITLE.swap[0] && F.TITLE.swap[1] <= F.TITLE.box[1]);
});

// The first screen is the entrance v2's cover of words (src/lib/boardingPass.ts
// coverBlocks, set by src/components/home/EntranceIntro.tsx): every word the
// film carries has its own span there, [data-open-land], inside
// .entrance-intro.
const COVER_FACTS = { years: '2025–2026', places: 6, frames: 58, regions: ['Florida', 'Arizona', 'Utah', 'New York'] };
const landsOf = (blocks) => blocks.map((block) => block.pieces.filter((piece) => typeof piece === 'object' && 'land' in piece).map((piece) => piece.land));

test('the end title sets his name exactly as the cover does (face, case, tracking): it flies home only moved', () => {
  const film = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const entrance = read('../src/styles/entrance.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const global = read('../src/styles/global.css');
  const rule = (css, sel) => {
    const i = css.indexOf(`${sel} {`);
    assert.ok(i >= 0, sel);
    return css.slice(i, css.indexOf('}', i));
  };
  const value = (css, prop) => css.match(new RegExp(`${prop}:\\s*([^;]+);`))?.[1];
  // The cover's large line (his name, "Ryan Xu, a camera, …"): Fraunces 400.
  const cover = entrance.slice(entrance.indexOf('.ec-xl,'), entrance.indexOf('}', entrance.indexOf('.ec-xl,')));
  assert.equal(value(cover, 'font-family'), 'var(--font-display)');
  assert.equal(value(cover, 'font-weight'), '400');
  assert.match(global, /--font-display: "Fraunces"/);
  // The title's name: the same family (font-serif is Fraunces), weight and
  // tracking, in the cover's own case (review of 2026-09-30: the capitals
  // turned letter by letter in flight, "Ryan XU" on one frame).
  const title = rule(film, '.of-title__face');
  assert.equal(value(title, 'font-weight'), '400');
  assert.equal(value(title, 'letter-spacing'), value(cover, 'letter-spacing'));
  assert.equal(value(title, 'text-transform'), undefined);
  assert.equal(F.TITLE_NAME, 'Ryan Xu');
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  assert.match(scenes, /className="of-title__name of-title__face font-serif" data-title-to>\s*<span data-fly="ryan">Ryan<\/span> <span data-fly="xu">Xu<\/span>/);
  assert.equal([...scenes.matchAll(/<Glyphs face="(from|to)"[^>]*text=\{TITLE_NAME\} \/>/g)].length, 2, 'the typed line is struck in the title\'s case');
  assert.doesNotMatch(scenes, /TITLE_NAME\.toUpperCase/);
  // The name at the cover's optical size, its letters on the page's own
  // pens (the clone that takes its place is the cover's word, scaled).
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /name\.style\.fontVariationSettings = opsz;\s*tTo\.style\.fontVariationSettings = opsz;/);
  assert.match(island, /setGlyphs\(tTo, caps, nameLeft, nameBase, domPens\(name, caps\)\)/);
  // A word the same at both ends is only moved (its scale the two sizes'
  // own ratio); one whose face changes (the credits) turns letter by letter,
  // the two faces swapped in one instant (never a frame with both).
  assert.match(island, /casing\(aText, a\) === casing\(bText, b\)/);
  assert.match(island, /const srcH = same \? \(parseFloat\(sStyle\.fontSize\) \|\| 16\) \* scale/);
  assert.match(island, /letters = pairGlyphs\(/);
  assert.equal(F.LANDING_A.sourceOut[0], F.LANDING_A.sourceOut[1]);
  assert.deepEqual([...F.LANDING_A.sourceOut], [...F.LANDING_A.targetIn]);
});

test('the landing\'s words: at both ends — the end title and the entrance\'s cover of words', () => {
  assert.deepEqual([...F.FLY_ORDER], ['ryan', 'xu', 'camera', 'archive', 'travel', 'thought', 'you']);
  assert.deepEqual([...F.FLY_OPTIONAL], ['you']);
  for (const word of F.FLY_ORDER) {
    assert.equal(F.LANDING_TARGETS[word].from, `[data-fly="${word}"]`);
    if (word !== 'you') assert.equal(F.LANDING_TARGETS[word].to, `.entrance-intro [data-open-land="${word}"]`);
  }
  assert.equal(F.LANDING_TARGETS.you.to, '.entrance [data-open-land="you"]');
  // The cover holds every word once (with a first stop and without), his
  // name in its own case.
  for (const first of [{ name: 'Miami', region: 'Florida', year: 2026, slug: 'miami' }, null]) {
    const lands = landsOf(P.coverBlocks(COVER_FACTS, first)).flat();
    assert.deepEqual([...lands].sort(), [...F.FLY_ORDER].sort());
  }
  const cover = read('../src/lib/boardingPass.ts');
  for (const word of ['ryan', 'xu']) assert.ok(cover.includes(`{ land: '${word}', text: `), `cover: ${word}`);
  // … each rendered as its own span inside .entrance-intro (in .entrance).
  const intro = read('../src/components/home/EntranceIntro.tsx');
  assert.match(intro, /className="entrance"[\s\S]*className="entrance-intro"/);
  assert.match(intro, /data-open-land=\{part\.land\}/);
  // The cover counts a word as home only where the film lands it (a place
  // on the first screen), read once, as the film reads it.
  assert.match(intro, /if \(r\.bottom < 0 \|\| r\.top > vh\) return;\s*el\.setAttribute\('data-flown', ''\)/);
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  for (const word of ['ryan', 'xu', 'you']) assert.ok(scenes.includes(`data-fly="${word}"`), `title: ${word}`);
  assert.match(scenes, /data-fly=\{word\.toLowerCase\(\)\}/);
});

test('landing A: every word flies from its box to its glyph box — his name first, whole — inside 0.6 s', () => {
  const src = { x: 500, y: 300, w: 400, h: 110 };
  const dst = { x: 104, y: 284, w: 700, h: 221 };
  const f = F.flightFor(src, dst, 64, 175, 0);
  assert.ok(close(f.dx, 700 - 454));
  assert.ok(close(f.dy, 355 - 394.5));
  assert.ok(close(f.k, 64 / 175));
  // His name's two words on one slot (one clock, one path); the others after
  // it, a stagger apart. It leaves first and lands first.
  assert.deepEqual([...F.NAME_WORDS], ['ryan', 'xu']);
  const name = F.landingSlot(null);
  assert.equal(name.rigid, true);
  const slots = [0, 1, 2, 3, 4].map((i) => F.landingSlot(i));
  for (let i = 1; i < slots.length; i += 1) assert.ok(slots[i].delay > slots[i - 1].delay);
  assert.ok(name.delay <= slots[0].delay);
  assert.ok(name.delay + name.duration < slots[0].delay + slots[0].duration, 'the name is home first');
  // The title's own letters fly the name's first share and hand it over in
  // mid-air, at speed (never at rest, where a layer's pixel shows).
  const curve = F.flightPath({ dx: 1, dy: 0, k: 1, delay: 0, duration: 1, yLead: 1, rigid: true }, 1000);
  const eased = (u) => 1 - curve[Math.round(u * 1000)].x;
  const speed = (u) => (eased(u + 0.01) - eased(u - 0.01)) / 0.02;
  assert.ok(F.LANDING_A.nameSwap > 0.15 && F.LANDING_A.nameSwap < 0.5, `swap at ${F.LANDING_A.nameSwap}`);
  assert.ok(speed(F.LANDING_A.nameSwap) > 1.2, `speed at the swap ${speed(F.LANDING_A.nameSwap)}`);
  // The credits turn into the page's face at the start of their flight, at
  // their own size, then give way to the word itself (the page's shaping).
  assert.equal(F.LANDING_A.morph[0], 0);
  assert.ok(F.LANDING_A.morph[1] <= 0.25);
  assert.ok(F.LANDING_A.plain > F.LANDING_A.morph[1] && F.LANDING_A.plain < 0.4);
  // The landing curve: calm — its fastest at most 2.1 times its mean (the
  // first landing's peaked at 2.7: a dart).
  const peak = Math.max(...Array.from({ length: 97 }, (_, i) => speed((i + 2) / 100)));
  assert.ok(peak <= 2.1, `peak ${peak}`);
  // Inside 0.6 s (the owner's five seconds; it was 0.7), the page's own
  // words in by then; his name's flight never shorter than 0.4 s (its
  // fastest 52 px a 60th at 1728 × 1000: calm, never the old dart).
  assert.ok(F.LANDING_A.done <= 600);
  assert.ok(F.LANDING_A.name.fly >= 400);
  const others = F.FLY_ORDER.length - F.NAME_WORDS.length;
  assert.ok(F.landingAHome(others) >= F.LANDING_A.dissolve[1], 'the dark is gone before the page\'s words take over');
  assert.ok(F.landingAHome(others) + F.LANDING_A.settle <= F.LANDING_A.done);
  // The rest of the cover sets itself block by block from 'landed' (the
  // film's LANDING_A.rest): the cover waits through the flight …
  const intro = read('../src/components/home/EntranceIntro.tsx');
  assert.match(intro, /const waiting = \(\) => reel\(\) === 'reel' \|\| reel\(\) === 'flight';/);
  const entrance = read('../src/styles/entrance.css');
  assert.match(entrance, /\.entrance\[data-compose='play'\] :is\(\.ec-w, \.ec-found:not\(\[data-flown\]\)\) \{\s*animation: ec-rise var\(--ec-dur, 600ms\) var\(--entrance-ease\) calc\(var\(--b, 0\) \* var\(--ec-step, 180ms\)\) backwards;/);
  // … and no word rises on a block a flying word lands on before every
  // word (YOU too) is home: nothing comes up under a word still sliding in.
  const all = F.landingAEnd(others);
  for (const first of [{ name: 'Miami' }, null]) {
    landsOf(P.coverBlocks(COVER_FACTS, first)).forEach((lands, b) => {
      if (lands.length) assert.ok(F.LANDING_A.rest + P.revealAt(b) >= all, `block ${b}: ${F.LANDING_A.rest} + ${P.revealAt(b)} vs ${all}`);
    });
  }
  assert.ok(F.LANDING_A.rest < F.landingAEnd(others));
  // YOU's line (its lead only, when YOU flies) is gone before the first
  // flight could reach it.
  assert.ok(F.LANDING_A.youOut[1] <= 100);
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /youFlies \? \[\.\.\.youLine\.children\]\.filter\(\(el\) => !\(el as HTMLElement\)\.dataset\.fly\) : \[youLine\]/);
  const path = F.flightPath(F.flightFor(src, dst, 64, 175, 0));
  assert.ok(close(path[0].x, 700 - 454) && close(path.at(-1).x, 0) && close(path.at(-1).s, 1));
  assert.ok(close(path[0].s, 64 / 175), 'from the title\'s size');
});

test('landing A: his name is one rigid unit — the gap between its words never opens', () => {
  // The page's "Ryan" and "Xu" (ink centres), and the title's: the same
  // layout, k times larger, somewhere else.
  const P1 = [203, 237];
  const P2 = [373, 237];
  const k = 1.3625;
  const O = [640, 420];
  const title = (p) => [O[0] + k * (p[0] - 200), O[1] + k * (p[1] - 240)];
  const flight = (p) => {
    const t = title(p);
    return F.flightFor({ x: t[0], y: t[1], w: 0, h: 0 }, { x: p[0], y: p[1], w: 0, h: 0 }, k, 1, null);
  };
  const a = F.flightPath(flight(P1), 60);
  const b = F.flightPath(flight(P2), 60);
  a.forEach((ka, i) => {
    const kb = b[i];
    assert.ok(close(ka.s, kb.s, 1e-9));
    const gapX = P2[0] + kb.x - (P1[0] + ka.x);
    const gapY = P2[1] + kb.y - (P1[1] + ka.y);
    assert.ok(close(gapX, ka.s * (P2[0] - P1[0]), 1e-6), `x at ${ka.offset}: ${gapX} vs ${ka.s * (P2[0] - P1[0])}`);
    assert.ok(close(gapY, 0, 1e-6));
  });
});

test('landing A: the order — above the credits\' line first, the highest first; then the deepest first — and no word ever passes through another', () => {
  // Measured on the built page (the source face's box on the end title, the
  // page word's box), 2026-09-30.
  const SCREENS = {
    '1728x1000': { camera: [[724, 516, 59, 17], [518, 172, 280, 129]], travel: [[870, 516, 54, 17], [683, 279, 207, 129]], archive: [[796, 516, 61, 16], [554, 604, 96, 34]], thought: [[936, 516, 68, 17], [313, 642, 102, 34]], you: [[895, 551, 29, 16], [554, 696, 48, 34]], NAME: [[641, 326, 441, 176], [104, 172, 326, 129]] },
    '1280x800': { camera: [[532, 408, 46, 13], [412, 142, 227, 96]], travel: [[645, 408, 41, 13], [551, 222, 170, 96]], archive: [[588, 408, 47, 13], [414, 468, 72, 25]], thought: [[696, 408, 52, 13], [234, 495, 77, 25]], you: [[666, 436, 25, 14], [413, 536, 36, 25]], NAME: [[467, 267, 339, 129], [77, 142, 262, 96]] },
    '390x844': { camera: [[87, 405, 46, 13], [46, 159, 139, 53]], travel: [[200, 405, 41, 13], [163, 204, 106, 53]], archive: [[143, 405, 47, 13], [290, 379, 58, 20]], thought: [[251, 405, 52, 13], [245, 403, 62, 20]], you: [[221, 434, 25, 14], [289, 460, 29, 20]], NAME: [[88, 313, 212, 72], [16, 115, 158, 53]] },
  };
  const EXPECTED = {
    '1728x1000': ['camera', 'travel', 'you', 'thought', 'archive'],
    '1280x800': ['camera', 'travel', 'you', 'thought', 'archive'],
    '390x844': ['camera', 'travel', 'archive', 'you', 'thought'],
  };
  const box = (b) => ({ x: b[0], y: b[1], w: b[2], h: b[3] });
  for (const [screen, words] of Object.entries(SCREENS)) {
    const rank = (w) => F.landingRank({ from: words[w][0][1], top: words[w][1][1] });
    const order = Object.keys(words).filter((w) => w !== 'NAME').sort((a, b) => rank(a) - rank(b) || words[a][1][0] - words[b][1][0]);
    assert.deepEqual(order, EXPECTED[screen], screen);
    const flights = Object.fromEntries(Object.keys(words).map((w) => {
      const [s, d] = words[w];
      const f = F.flightFor(box(s), box(d), s[3], d[3], w === 'NAME' ? null : order.indexOf(w));
      return [w, { f, s, d, path: F.flightPath(f, 200) }];
    }));
    // Each word's box at t (its ink ~76% of its line box's height); a credit
    // turns from its own shape into the page word's across the morph.
    const at = ({ f, s, d, path }, t) => {
      const u = Math.min(1, Math.max(0, (t - f.delay) / f.duration));
      const p = path[Math.round(u * 200)];
      const cx = d[0] + d[2] / 2 + p.x;
      const cy = d[1] + d[3] / 2 + p.y;
      let w = d[2] * p.s;
      let h = d[3] * p.s;
      if (!f.rigid && u < F.LANDING_A.morph[1]) {
        const m = u / F.LANDING_A.morph[1];
        w = s[2] * (1 - m) + w * m;
        h = s[3] * (1 - m) + h * m;
      }
      h *= 0.76;
      return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    };
    const names = Object.keys(flights);
    for (let t = 0; t <= F.LANDING_A.done; t += 4) {
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          const A = at(flights[names[i]], t);
          const B = at(flights[names[j]], t);
          const overlap = Math.min(A[2], B[2]) - Math.max(A[0], B[0]) > -2 && Math.min(A[3], B[3]) - Math.max(A[1], B[1]) > -2;
          assert.ok(!overlap, `${screen}: ${names[i]} and ${names[j]} cross at ${t} ms`);
        }
      }
    }
  }
});

test('landing A: the page\'s words take over pixel for pixel — the clones are not layers of their own', () => {
  const css = read('../src/styles/opening.css');
  const rule = (sel) => {
    const i = css.indexOf(`${sel} {`);
    assert.ok(i >= 0, sel);
    return css.slice(i, css.indexOf('}', i));
  };
  // A layer's origin is snapped to its whole pixel (a face on the page
  // word's sub-pixel pen drew its glyphs a third of a pixel off); a layer
  // that ever flew larger than the page keeps that raster (his name, 1.36
  // times the page's at the start): the flight's own animation makes the one
  // layer it needs, and nothing asks for more.
  for (const sel of ['.of-fly', '.of-fly__face', '.of-fly__ink']) assert.doesNotMatch(rule(sel), /will-change/, sel);
  // Home: the page's words shown under the clones, which dissolve into them
  // (one drawing), then go.
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /html\.removeAttribute\('data-open-fly'\);\s*placed\.forEach\(\(\{ wrap \}\) => \{\s*landAnims\.push\(wrap\.animate\(\[\{ opacity: 1 \}, \{ opacity: 0 \}\], \{ duration: ms\(LANDING_A\.settle\)/);
  assert.ok(F.LANDING_A.settle >= 80 && F.LANDING_A.settle <= 160);
  // Every word lands on the page word's own pen and baseline, set whole.
  assert.match(island, /seat\(word\.box, f\.dstBox\.x, f\.dstBase\);/);
  // His name sets off as the title draws it (its own letters) and is handed
  // to its clones in mid-air.
  assert.match(island, /cut\(titleLetters, 1, 0, lead\.flight\.delay \+ LANDING_A\.nameSwap \* lead\.flight\.duration\)/);
});

test('input: only the Skip pill skips; wheel, touch, keys and clicks do nothing', () => {
  assert.equal(F.INPUT_POLICY.skip, 'skip');
  for (const source of ['wheel', 'touch', 'key', 'pointer']) assert.notEqual(F.INPUT_POLICY[source], 'skip', source);
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.doesNotMatch(island, /addEventListener\('pointerdown'/);
  assert.doesNotMatch(island, /addEventListener\('touchstart'/);
  assert.match(island, /skip\.addEventListener\('click', onSkip\)/);
  const css = read('../src/styles/opening.css');
  assert.match(css, /html\[data-film-lock\] body \{ overflow: clip !important; \}/);
  assert.match(island, /html\.setAttribute\('data-film-lock', ''\)/);
  assert.match(island, /setAttribute\('inert', ''\)/);
  assert.doesNotMatch(island, /body\.style\.overflow/);
});

test('the landing is laid on the formed title\'s hold and starts on the film\'s clock, at its end (never late by the work of laying it)', () => {
  const island = read('../src/components/home/OpeningFilm.tsx');
  // Laid as the title is formed (its last FF_TAIL ms, when nothing moves)…
  assert.match(island, /if \(t >= plan\.length - FF_TAIL\) \{\s*startLanding\(\);/);
  assert.match(island, /later\(startLanding, plan\.length - FF_TAIL - t \+ 20\);/);
  // … every landing animation started at the film's end (laid late, it
  // starts where it would be by then), the page told as it starts, and the
  // page's moments counted from that start.
  assert.match(island, /const startAt = seekParam != null \? nowMs\(\) : Math\.max\(nowMs\(\), t0 \+ plan\.length\);/);
  assert.match(island, /const track = \(a: Animation\) => \{\s*a\.startTime = startAt;\s*landAnims\.push\(a\);/);
  assert.match(island, /else later\(tell, startAt - nowMs\(\)\);/);
  assert.match(island, /later\(finish, wait \+ ms\(Math\.max\(LANDING_A\.done, home \+ LANDING_A\.settle\)\)\);/);
  // The title is formed (morph done, credits up) when it is laid.
  for (const plan of Object.values(PLANS)) assert.ok(plan.acts.title.start + F.TITLE.morph <= plan.length - F.FF_TAIL + 1e-6);
});

test('the landing reads nothing on its own frame: its words, clones and dark are laid before the clock (round wf45)', () => {
  // Read on the title's hold, between its own writes, the landing was 80
  // forced style and layout passes — 15–16 ms of a 36–39 ms frame on a phone
  // at a quarter of the CPU, and two dropped frames in one run of three. Its
  // frame now only writes: the marks, its animations, its timers.
  const island = read('../src/components/home/OpeningFilm.tsx');
  const from = island.indexOf('    function landA(startAt: number) {');
  const to = island.indexOf('    // ── Go: the fonts first, then the clock ──');
  assert.ok(from > 0 && to > from, 'landA, before the clock\'s code');
  const landA = island.slice(from, to);
  for (const read of ['getBoundingClientRect', 'getComputedStyle', 'getClientRects', 'offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'innerHeight', 'clientHeight', 'textBox(', 'baselineOf(', 'baselineIn(', 'inkOf(', 'readFace(']) {
    assert.ok(!landA.includes(read), `the landing's frame reads nothing: ${read}`);
  }
  // Laid only where it never was (the title formed and still, so true then).
  assert.match(landA, /if \(!landing\) landing = planLanding\(titleRead \?\? readTitle\(\), readCover\(\)\);/);
  // Laid with the film's own measuring, before the clock: the title read as
  // it stands still (before any of the film's keyframes moves it) …
  assert.match(island, /geo = layout\(\);\n\s*\/\/ The landing, laid now too[^\n]*\n[^\n]*\n\s*titleRead = readTitle\(\);\n\s*landing = planLanding\(titleRead, readCover\(\)\);/);
  // … and on a refit with the film's keyframes off while it is measured
  // (they scale the title and raise its lines until it has formed).
  assert.match(island, /filmAnims\.forEach\(\(a\) => a\.cancel\(\)\);\n\s*geo = layout\(\);\n\s*titleRead = readTitle\(\);\n\s*landing = planLanding\(titleRead, readCover\(\)\);\n\s*burn\?\.resize/);
  // The clones are made, then read all at once (one layout for all of
  // them), then set: no write between two reads.
  const plan = island.slice(island.indexOf('    const planLanding = ('), island.indexOf('    function landA(startAt: number) {'));
  const made = plan.indexOf('const built = flights.map(');
  const readAll = plan.indexOf('const reads = built.map(');
  const set = plan.indexOf('const placed = built.map(');
  assert.ok(made > 0 && readAll > made && set > readAll, 'made, read, set');
  assert.match(plan, /wrap\.style\.opacity = '0';/, 'hidden until its moment');
  // A cover word that changes size under the film (a face that came late)
  // moves the landing: read again in the observer's callback, laid again.
  assert.match(plan, /new ResizeObserver\(/);
  assert.match(plan, /if \(moved\) landing = planLanding\(titleRead, readCover\(\)\);/);
  // The cover's own pass over the same words is spared: the film marks the
  // words it carries home as it lands, and the cover reads none then.
  assert.match(landA, /placed\.forEach\(\(\{ dst \}\) => dst\.setAttribute\('data-flown', ''\)\);[\s\S]*html\.dataset\.reel = 'flight';/);
  const intro = read('../src/components/home/EntranceIntro.tsx');
  assert.match(intro, /flownMarked = true;[\s\S]{0,260}if \(section\.querySelector\('\[data-open-land\]\[data-flown\]'\)\) return;\n\s*const vh = window\.innerHeight;/);
  // The watcher goes with the film on every path (finish() is reduced
  // motion's too: declared before it, never in its temporal dead zone).
  assert.ok(island.indexOf('const unwatchCover = () =>') < island.indexOf('const finish = () =>'), 'declared before finish()');
  assert.match(island, /overlay\.getAnimations\(\{ subtree: true \}\)\.forEach\(\(a\) => a\.cancel\(\)\);\n\s*unwatchCover\(\);/);
});

test('skip: to the end title with its tail left, never back, nothing once the landing has begun', () => {
  for (const plan of Object.values(PLANS)) {
    const target = plan.length - F.FF_TAIL;
    assert.ok(target >= plan.acts.title.start + F.TITLE.morph, 'the title is formed where the skip lands');
    assert.equal(F.fastForwardTarget(plan, 0), target);
    assert.equal(F.fastForwardTarget(plan, target), null, 'never back');
    assert.equal(F.fastForwardTarget(plan, plan.length), null);
  }
  assert.ok(F.FF_RATE > 1);
});

test('the fonts: every face asked for before the clock; italic only in Fraunces (the one face with an italic)', () => {
  const faces = F.FONT_LOADS.join(' | ');
  for (const face of ['900 100px Fraunces', '400 100px Fraunces', 'italic 400 100px Fraunces', 'italic 500 100px Fraunces', '700 20px "Space Grotesk"', '600 20px "Space Grotesk"', '500 20px "Space Grotesk"']) assert.ok(faces.includes(face), face);
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /document\.fonts\?\.load\(f, FONT_SAMPLE\)/);
  assert.match(island, /Promise\.race\(\[Promise\.all\(\[fontsIn, plates\?\.decided\]\), skipped\]\)\.then\(whenVisible\)\.then/);
  // His photographs are decoded behind the film (never waited for).
  assert.match(island, /img\.decode\?\.\(\)/);
  // Every italic rule's class is set on Fraunces (font-serif) in the markup,
  // never on Space Grotesk or the monospace.
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  const classNames = [...scenes.matchAll(/className=\{?[`"]([^`"]+)[`"]/g)].map((m) => m[1]);
  for (const m of css.matchAll(/([^{}]+)\{[^}]*font-style: italic;[^}]*\}/g)) {
    for (const sel of m[1].split(',')) {
      const cls = sel.trim().split(/[\s.:[]/).filter(Boolean).at(-1);
      const uses = classNames.filter((c) => c.split(/\s+/).includes(cls));
      for (const u of uses) assert.ok(u.includes('font-serif'), `${cls} is italic on "${u}"`);
      assert.doesNotMatch(sel, /font-ui|of-mono/);
    }
  }
  assert.match(css, /--of-mono: ui-monospace/);
  assert.doesNotMatch(css, /@import|@font-face|fonts\.googleapis/);
});

test('a reload never sits still: the clock waits ≤ 300 ms for the faces, never for his photographs; the page moves from the first paint', () => {
  assert.ok(F.FONT_WAIT_MS <= 300, `${F.FONT_WAIT_MS} ms`);
  const island = read('../src/components/home/OpeningFilm.tsx');
  // The race is the faces against the cap — nothing else.
  assert.match(island, /const fontsIn = Promise\.race\(\[fontsLoad, new Promise\(\(resolve\) => window\.setTimeout\(resolve, seekParam != null \? 6000 : FONT_WAIT_MS\)\)\]\);/);
  assert.doesNotMatch(island, /picturesIn/);
  // Photographs are decoded behind the film, not before the clock.
  assert.match(island, /img\.decode\?\.\(\)/);
  // One frame to the first measure, the clock CLOCK_LEAD_MS after the
  // keyframes are laid: ≤ 300 + 2 frames + the lead after the island starts.
  const lead = Number(island.match(/const CLOCK_LEAD_MS = (\d+);/)[1]);
  assert.ok(F.FONT_WAIT_MS + 2 * 17 + lead <= 400, 'the clock within 0.4 s of the island');
  assert.match(island, /Promise\.race\(\[Promise\.all\(\[fontsIn, plates\?\.decided\]\), skipped\]\)\.then\(whenVisible\)\.then\(\(\) => \{\s*\/\/[^\n]*\n\s*requestAnimationFrame\(begin\);/);
  // The plates' own wait for the first word's face is capped too (the head
  // script's, from the proof's first frame): the clock within a second and
  // a half of the proof, however slow the faces.
  assert.ok(F.PROOF_FACE_WAIT_MS <= 1500);
  // Before the clock, the proof's lights go down and the Skip pill comes up.
  const css = read('../src/styles/opening.css');
  assert.match(css, /html\[data-opening\] \.of-frame__vignette::before \{ animation: of-proof-lights /);
  assert.match(css, /html\[data-opening\] \.of-skip \{\s*display: inline-flex;\s*animation: of-skip-in 360ms/);
});

test('the palette: lime the one accent; bone and ink, never pure black or white; no yellow, purple, saturated blue or red', () => {
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  for (const src of [css, scenes]) {
    assert.doesNotMatch(src, /#fff\b|#ffffff\b|#000\b|#000000\b|[:,(]\s*(white|black)\b/i);
    assert.doesNotMatch(src, /rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[,)]/);
    assert.doesNotMatch(src, /rgba?\(\s*255\s*,\s*255\s*,\s*255\s*[,)]/);
    // The template's yellow, purple, blue and red: never.
    assert.doesNotMatch(src, /#f2d52e|#ff0\b|#ffff00|#ffe600|#ffd400|#2f5bff|#e0454f|#7fd4ff|purple|violet/i);
  }
  assert.equal([...css.matchAll(/#d2ff00/gi)].length, 1, 'lime is one token');
  // Lime: the anchor's block (and the hand-off's, the same block), the
  // relay's cursor (the block landed), the grid's marker, the dark's
  // cursor, the Skip pill's focus ring — each alone in its frame: where
  // the grid's marker is lime, its cursor is ink, and so is the
  // typewriter's.
  const limeUses = [...css.matchAll(/([^{}]+)\{[^}]*var\(--of-lime\)[^}]*\}/g)].map((m) => m[1].trim());
  for (const use of limeUses) assert.ok(/^\.of-key__block$|^\.of-handoff$|^\.of-cursor__ink$|of-grow--grid|of-grow-end--grid|of-title__cursor|of-skip:focus-visible/.test(use), use);
  for (const id of ['grid', 'paper']) assert.match(css, new RegExp(`\\.of-mat--${id} \\.of-cursor__ink \\{ background: #171b15; \\}`), id);
  // Uppercase tracking capped at 0.1em.
  for (const m of css.matchAll(/letter-spacing:\s*([\d.]+)em/g)) assert.ok(Number(m[1]) <= 0.1, m[0]);
});

test('the house rules: only transform and opacity move; no blur animated; the grain a bitmap; copies 2D', () => {
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const block of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)) {
    for (const prop of block[1].matchAll(/([a-z-]+):/g)) assert.ok(['transform', 'opacity', 'visibility', 'pointer-events'].includes(prop[1]), prop[1]);
  }
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.doesNotMatch(island, /filter:\s*`?blur/);
  assert.doesNotMatch(island, /strokeDashoffset|stroke-dashoffset/, 'the arrow is drawn in stages (opacity), not a dash offset');
  const leader = css.slice(css.indexOf('.of-leader {'), css.indexOf('}', css.indexOf('.of-leader {')));
  assert.doesNotMatch(leader, /filter:/);
  assert.doesNotMatch(css, /feTurbulence/);
  assert.match(css, /--of-noise: url\("\.\.\/assets\/film\/grain-ink\.png"\)/);
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  assert.doesNotMatch(scenes.slice(scenes.indexOf('function Giant'), scenes.indexOf('const ROLE_CLASS')), /translate3d/);
});

test('memory: every scene is drawn only round its own turn (hidden otherwise)', () => {
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const from = css.indexOf('.of-mat,\n.of-burnground,\n.of-leader,\n.of-end,\n.of-frame__sepia');
  assert.ok(from > 0);
  const hidden = css.slice(from, css.indexOf('{', from));
  assert.match(css.slice(css.indexOf('{', from)), /^\{\s*visibility: hidden;\s*\}/);
  for (const sel of ['.of-mat', '.of-leader', '.of-end', '.of-cut', '.of-chrome', '.of-key', '.of-handoff', '.of-burn']) {
    assert.ok(hidden.includes(sel), sel);
  }
  const island = read('../src/components/home/OpeningFilm.tsx');
  // Painted well ahead (a busy main thread is ridden out), rastered only
  // just before (WARM).
  assert.match(island, /const PREROLL_MS = 400;/);
  assert.match(island, /const WARM_MS = 150;/);
  // The match cuts' pages four cuts ahead: every cut the compositor's alone
  // through a half-second stall (the page's hydration and the map's
  // start-up fall in them on a phone), yet never every page at once (the
  // compositor's tiles); the rest round their own turn.
  const drawn = Number(island.match(/const CUTS_DRAWN = (\d+);/)[1]);
  assert.ok(drawn >= 4 * F.CUT_MS && drawn < F.ACT_MS.cuts - F.CUT_MS, `${drawn} ms ahead`);
  assert.match(island, /scene\(cutEl, cut\.start, cut\.end, true, CUTS_DRAWN\);\s*if \(chrome\) scene\(chrome, cut\.start, cut\.end, false, CUTS_DRAWN\);\s*scene\(key, cut\.start, cut\.end, false, CUTS_DRAWN\);/);
  assert.match(island, /const from = Math\.max\(-PRELUDE_MS, start - lead\);/);
  // What the first paint draws is let go once it has played.
  assert.match(island, /if \(start <= 0 \|\| el\.hasAttribute\('data-early'\)\) \{\s*goneAfter\(el, end\);/);
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.of-end \{ visibility: visible; \}/);
});

test('no structure branches on the viewport or reduced motion (hydration)', () => {
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  assert.doesNotMatch(scenes, /useReducedMotion|matchMedia|innerWidth|window\./);
  const island = read('../src/components/home/OpeningFilm.tsx');
  const markup = island.slice(island.lastIndexOf('return ('));
  assert.doesNotMatch(markup, /reduce|phone/);
  assert.doesNotMatch(island, /initial=\{\{\s*opacity:\s*0/);
  const css = read('../src/styles/opening.css');
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.of-end,[\s\S]*?opacity: 1/);
});

test('his photographs: landscape frames, one a chapter, each at its own ratio', () => {
  const groups = [
    { photos: [{ imageUrl: 'https://cdn/x/a.jpg', width: 3000, height: 2000 }, { imageUrl: 'https://cdn/x/b.jpg', width: 2000, height: 3000 }] },
    { photos: [{ imageUrl: 'https://cdn/x/c.jpg?rect=1', width: 1600, height: 1200 }] },
    { photos: [{ imageUrl: 'https://cdn/x/d.jpg', width: 4000, height: 1000 }, { imageUrl: 'https://cdn/x/e.jpg', width: 1500, height: 1000 }] },
  ];
  const p = F.pickPictures(groups);
  assert.equal(p.length, 3);
  assert.ok(p[0].src.startsWith('https://cdn/x/a.jpg?w=480'));
  assert.ok(p[1].src.startsWith('https://cdn/x/c.jpg?rect=1&w=900'));
  assert.ok(p[2].src.startsWith('https://cdn/x/e.jpg?w=640'));
  for (const x of p) assert.ok(x.ratio >= F.PICTURE_RATIO[0] && x.ratio <= F.PICTURE_RATIO[1]);
  assert.deepEqual(F.pickPictures([]), []);
});

test('the material is seeded: the server and the client draw the same', () => {
  assert.deepEqual(F.typeTimes('abc', 0, 500, 25, 3), F.typeTimes('abc', 0, 500, 25, 3));
  const a = F.seeded(7);
  const b = F.seeded(7);
  for (let i = 0; i < 20; i += 1) assert.equal(a(), b());
});
