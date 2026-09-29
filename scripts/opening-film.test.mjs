// Run offline: node --experimental-strip-types --test scripts/opening-film.test.mjs
//
// The opening film (src/lib/openingFilm.ts), v6 — the owner's spec of
// 2026-09-28 ("复古编辑部动态排版") and his changes of 2026-09-29: no place
// names (suspense; two tiny easter eggs allowed); the single words FIRST —
// ~25 match cuts on a sixth of a second through editorial pages and printed
// matter round a fixed lime anchor (17 since the owner's "缩短3-4秒", the
// film 3–4 s shorter), the first of them drawn under the proof, the film's
// first paint (act 0, a count-in on the sixth, the owner's "可以加一个小小的
// 开场") — then the lime block handed off into the cursor of a typewriter
// relay across eight machines, each in its own face; richer, layered pages;
// black-and-white pages and colour in runs; no limit on the length. Held
// here: the act order; every cut on its act's grid (the match cuts the
// sixth, the hand-off and the relay the twelfth, the burn the 24th, the dark
// and the title the eighth); the relay (slow to fast, typing continuous, one
// left edge, baseline and cap height); the flash budget (≤ 6 turns, ≤ 3 in
// any second, a mid ground turning nothing; the proof turns none); the
// proof (its beats on the sixth, its clock counted from its first frame,
// the stylesheet's count-in at rest when printed); the anchor (one centre, one
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

// The film as it stood before the owner's "缩短3-4秒" (2026-09-29): 11 625 ms
// to the landing, 12 325 ms to the page.
const BEFORE_MS = 11625 + 700;

test('the acts: contiguous from 0, the single words first, then the relay; the landing inside 0.7 s', () => {
  assert.deepEqual([...F.ACT_ORDER], ['cuts', 'hand', 'type', 'burn', 'dark', 'title']);
  for (const [layout, plan] of Object.entries(PLANS)) {
    let at = 0;
    for (const id of F.ACT_ORDER) {
      assert.ok(close(plan.acts[id].start, at), `${layout} ${id} starts where the last ended`);
      at = plan.acts[id].end;
    }
    assert.ok(close(at, plan.length));
    assert.equal(plan.acts.cuts.start, 0, 'the match cuts open the film (the first page is the first paint)');
    // The match cuts about three and a third seconds (twenty sixths: the
    // first page two, the last three, every other one).
    const cuts = plan.acts.cuts.end - plan.acts.cuts.start;
    assert.ok(cuts >= 3000 && cuts <= 4000, `act 1 ${cuts} ms`);
    // The hand-off: four twelfths.
    assert.ok(close(plan.acts.hand.end - plan.acts.hand.start, F.HAND.frames * F.FRAME12_MS));
    // The relay is the owner's two to three seconds.
    const relay = plan.acts.type.end - plan.acts.type.start;
    assert.ok(relay >= 2000 && relay <= 3000, `relay ${relay} ms`);
    assert.ok(close(plan.acts.burn.end - plan.acts.burn.start, F.BURN.frames * F.FRAME24_MS), 'the burn: its frames at 24 fps');
    assert.ok(close(plan.acts.dark.end - plan.acts.dark.start, 7 * F.BEAT_MS));
    // The owner: "缩短3-4秒" — the whole of it, to the page, 3–4 s shorter
    // than it was (and every act still there).
    const total = plan.length + F.LANDING_A.done;
    assert.ok(BEFORE_MS - total >= 3000 && BEFORE_MS - total <= 4000, `${layout}: ${total} ms, ${BEFORE_MS - total} ms shorter`);
  }
  assert.ok(F.landingAEnd(F.FLY_ORDER.length) <= F.LANDING_A.done, 'every word home inside the landing');
});

test('every hard cut falls on its act\'s grid: the sixth, the twelfth, the 24th, the eighth', () => {
  assert.ok(close(F.FRAME12_MS, 1000 / 12));
  assert.ok(close(F.CUT_MS, 1000 / 6));
  assert.ok(close(F.FRAME24_MS, 1000 / 24));
  assert.equal(F.BEAT_MS, 125);
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
    // The burn's frames on the 24th from its start.
    for (let f = 0; f < F.BURN.frames; f += 1) {
      const t = F.burnFrameStart(plan, f);
      assert.ok(onGrid(t, F.FRAME24_MS, plan.acts.burn.start));
      assert.equal(F.burnFrameAt(plan, t + 1), f);
      assert.equal(F.burnFrameAt(plan, t + F.FRAME24_MS - 1), f, 'held for the whole frame');
    }
    assert.equal(F.burnFrameAt(plan, plan.acts.burn.start - 1), -1);
    assert.equal(F.burnFrameAt(plan, plan.acts.burn.end), -1);
    // The dark, the title and the landing on the eighth from the dark.
    for (const t of [plan.acts.dark.start, plan.acts.title.start, plan.acts.title.start + F.TITLE.morph, plan.length]) {
      assert.ok(onGrid(t, F.BEAT_MS, plan.acts.dark.start), `beat ${t}`);
    }
    // And every act starts on the 24th and the twelfth from the clock's
    // start (a sixth is two twelfths, an eighth three 24ths).
    for (const a of Object.values(plan.acts)) assert.ok(onGrid(a.start, F.FRAME24_MS), `act at ${a.start}`);
    assert.ok(F.hardCuts(plan).length >= 28);
  }
});

test('act 3: the relay — eight machines, each its own face, slow to fast, the typing continuous across the cuts', () => {
  assert.equal(F.TYPED, 'an archive of travel');
  const ids = F.STYLES.map((s) => s.id);
  assert.ok(ids.length >= 6 && ids.length <= 8, 'six to eight machines');
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.at(-1), F.BURN_STYLE, 'the burn takes the last');
  // The owner's machines: an antique 1-bit computer first (where the lime
  // block lands), a strip of film on a lightbox and a label maker's tape in
  // place of the blue screen and the maroon paper; no blue, no red machine.
  assert.equal(ids[0], 'mac');
  for (const id of ['film', 'label']) assert.ok(ids.includes(id), id);
  for (const id of ['deep', 'bars', 'pill']) assert.ok(!ids.includes(id), id);
  // Every machine imitates its own face.
  assert.equal(new Set(F.STYLES.map((s) => s.face)).size, ids.length, 'a face a machine');
  // Slow to fast: each machine no longer than the one before, the paper
  // (the last) holds for the burn; the first long.
  const frames = F.STYLES.map((s) => s.frames);
  for (let i = 1; i < frames.length - 1; i += 1) assert.ok(frames[i] <= frames[i - 1], `${ids[i]} ${frames[i]}`);
  assert.ok(frames[0] * F.FRAME12_MS >= 600, 'the first is on long enough to be read');
  assert.ok(frames.at(-2) * F.FRAME12_MS <= 250, 'the fastest at a quarter second');
  // Light, one dark run, light: the relay turns the picture twice.
  const tones = F.STYLES.map((s) => s.tone).filter((t) => t !== 'mid');
  assert.equal(tones.filter((t, i) => i > 0 && t !== tones[i - 1]).length, 2);
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
    const cps = ((times.length - 1) * 1000) / (times.at(-1) - times[0]);
    assert.ok(cps >= 7.5 && cps <= 11, `${cps.toFixed(1)} a second`);
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
  assert.ok(close(F.PRELUDE_MS, 6 * F.CUT_MS));
  assert.ok(F.PRELUDE_MS <= 1000 + 1e-6, 'small: a second at most (the owner\'s "小小的开场", after his "缩短3-4秒")');
  for (const b of [paint, lime, word]) assert.ok(Number.isInteger(b), `${b}: whole sixths`);
  assert.ok(paint > lime && lime > word && word > 0, 'the paint, the lime plate, the ink plate, then the page');
  assert.ok(close(F.PRELUDE_MS, paint * F.CUT_MS));
  assert.ok(P0.draw * F.CUT_MS <= (paint - lime) * F.CUT_MS + 1e-6, 'the marks are drawn by the time the lime prints');
  assert.ok(P0.set <= (lime - word) * F.CUT_MS - 1000 / 60, 'the lime has set a frame before the word prints');
  assert.ok(close(F.PROOF_LIME_MS, (paint - lime) * F.CUT_MS + P0.set));
  assert.ok(P0.sheet < 1 && P0.sheet > 0.99, 'never opaque, never seen through');
  assert.ok(P0.unprinted > 0 && P0.unprinted < 0.005, 'drawn, never seen');
  for (const [layout, plan] of Object.entries(PLANS)) {
    const pr = plan.prelude;
    assert.ok(close(pr.start, -F.PRELUDE_MS) && close(pr.lime, -lime * F.CUT_MS) && close(pr.word, -word * F.CUT_MS) && pr.end === 0, `${layout}: ${JSON.stringify(pr)}`);
    for (const t of [pr.start, pr.lime, pr.word, pr.end]) assert.ok(onGrid(t, F.CUT_MS, pr.start), `${layout}: a beat at ${t}, on the sixth from the first paint`);
    assert.equal(plan.acts.cuts.start, 0, 'film 0 is still the first page: no act, no cut moves');
    assert.ok(close(plan.cuts[1].start - pr.end, 2 * F.CUT_MS), 'the first page holds its two sixths after the proof');
    // The owner's shorter film stays shorter: first paint to the page.
    const fpToPage = F.PRELUDE_MS + plan.length + F.LANDING_A.done;
    assert.ok(fpToPage <= BEFORE_MS - 2000, `${layout}: ${fpToPage.toFixed(1)} ms from the first paint to the page`);
    // Light on light: the proof turns nothing over.
    const tl = F.toneTimeline(plan);
    assert.equal(tl[0].tone, 'light');
    assert.ok(close(tl[0].start, -F.PRELUDE_MS), 'the tone line starts at the first paint');
    const flips = F.toneFlips(plan);
    const without = F.toneFlips({ ...plan, prelude: { start: 0, lime: 0, word: 0, end: 0 } });
    assert.deepEqual(flips.map((t) => Math.round(t * 1e3)), without.map((t) => Math.round(t * 1e3)), 'the proof adds no turn');
    const want = [5 * F.CUT_MS, 13 * F.CUT_MS, 28 * F.CUT_MS, 5250, 6375];
    assert.equal(flips.length, want.length);
    flips.forEach((t, i) => assert.ok(close(t, want[i], 1e-5), `turn ${i}: ${t}`));
    assert.ok(flips[0] - pr.start >= 1800, 'no turn in the first 1.8 s from the first paint');
  }
  assert.ok(F.luminance(P0.ground) > 0.6, 'newsprint: light');
  assert.ok(Math.abs(F.luminance('#D2FF00') - F.luminance(P0.ground)) < 0.1, 'the lime plate is a change of hue, not of light');
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, new RegExp(`\\.of-sheet--newspaper \\{ --sheet-bg: ${P0.ground}; \\}`, 'i'), 'proof and first page: one newsprint');
  assert.match(ruleOf(css, '.of-proof'), new RegExp(`background: ${P0.ground};`, 'i'));
  // Before the island is up, the page's own ground is the proof's paper (a
  // paint before the parser reaches the film is never a dark frame first);
  // not under reduced motion (it opens dark); no transition while it turns back.
  assert.match(css, new RegExp(`@media \\(prefers-reduced-motion: no-preference\\) \\{\\s*html\\[data-opening=''\\] body \\{ background-color: ${P0.ground}; \\}\\s*\\}`, 'i'));
  assert.match(css, /html\[data-opening\] body \{ transition: none; \}/);
  // The slug: no place, and not his name (the film ends on it).
  const slug = [F.PROOF_SLUG.head, F.PROOF_SLUG.wide, ...F.PROOF_SLUG.plates];
  for (const text of slug) assert.doesNotMatch(text, /ryan|xu/i, text);
  for (const n of F.PLACE_NAMES) for (const text of slug) assert.doesNotMatch(text, new RegExp(`\\b${n}\\b`, 'i'), text);
});

test('the proof\'s clock: film 0 on the proof\'s sixth grid, the word never before the keyframes', () => {
  const CUT = F.CUT_MS;
  assert.ok(close(F.filmStart(1000, 1100), 2000), 'fast: the page a second after the first paint');
  assert.ok(close(F.filmStart(1000, 1000 + 4 * CUT), 2000), 'ready on the word\'s own beat');
  assert.ok(close(F.filmStart(1000, 1700), 2000 + CUT), 'a sixth late');
  assert.ok(close(F.filmStart(1000, 2800), 2000 + 7 * CUT), 'a slow island');
  assert.ok(close(F.filmStart(null, 500), 500 + 2 * CUT), 'no proof to count from: the word when ready');
  const rand = F.seeded(4061);
  for (let i = 0; i < 2000; i += 1) {
    const o = rand() * 5000;
    const r = o + rand() * 4000;
    const t0 = F.filmStart(o, r);
    assert.ok(onGrid(t0, CUT, o), `on the proof's grid: ${o} ${r}`);
    assert.ok(t0 - o >= F.PRELUDE_MS - 1e-6, 'never shorter than the proof');
    assert.ok(t0 - 2 * CUT >= r - 1e-6, `the word never before the keyframes: ${o} ${r}`);
    assert.ok(t0 - 2 * CUT < Math.max(r, o + 4 * CUT) + CUT, `never more than a sixth late: ${o} ${r}`);
  }
});

test('the proof is the first paint: the stylesheet counts in, one animation an element, at rest when printed', () => {
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const P0 = F.PRELUDE;
  const CUT = F.CUT_MS;
  const sheet = ruleOf(css, '.of-proof');
  assert.match(sheet, new RegExp(`opacity: ${P0.sheet};`));
  assert.match(sheet, /visibility: visible;/);
  const marks = ruleOf(css, '.of-proof-marks');
  assert.match(marks, /opacity: 1;/);
  assert.match(marks, /visibility: visible;/);
  // The three running rules: on html[data-opening] (never data-clock, so the
  // clock can't cut the count short), ONE animation each (two on one
  // property are played on the main thread, where hydration would stall
  // them), filled both ways (the island reads the proof's start from them
  // at any moment, and seeks them).
  const runs = [...css.matchAll(/([^{}]+)\{[^}]*animation:[^;}]*of-proof[^}]*\}/g)];
  assert.equal(runs.filter((m) => !/animation: none/.test(m[0])).length, 3);
  for (const m of runs) {
    assert.doesNotMatch(m[1], /data-clock/, m[1]);
    if (/animation: none/.test(m[0])) continue;
    assert.match(m[1].trim(), /^html\[data-opening\] /, m[1]);
    const value = m[0].match(/animation:\s*([^;]+);/)[1];
    assert.doesNotMatch(value.replace(/\([^)]*\)/g, ''), /,/, `one animation: ${value}`);
    assert.match(value, / both$/, `filled both ways: ${value}`);
  }
  // The lime plate: held unprinted to its beat, then the first impression
  // setting to full on the house curve (the plan's keyframes, sampled).
  const lime = ruleOf(css, "html[data-opening] .of-key[data-key='0'] .of-key__block").match(/animation: of-proof-lime (\d+\.?\d*)ms linear both;/);
  assert.ok(lime, 'the lime plate');
  assert.ok(close(Number(lime[1]), F.PROOF_LIME_MS, 0.001), `${lime[1]} ms`);
  const got = keyframesOf(css, 'of-proof-lime');
  const want = F.proofLimeKeyframes();
  assert.equal(got.length, want.length, 'as many keyframes as the plan');
  got.forEach((k, i) => {
    assert.ok(close(k.offset, want[i].offset, 1e-6), `offset ${i}: ${k.offset} / ${want[i].offset}`);
    assert.ok(close(k.opacity, want[i].opacity, 5e-4), `opacity ${i}: ${k.opacity} / ${want[i].opacity}`);
  });
  // The lime prints on its beat's own frame: the step is taken within a
  // hundredth of a millisecond before it, never after.
  const beat = (P0.beats.paint - P0.beats.lime) * CUT;
  for (const k of [want[1], want[2], got[1], got[2]]) {
    const t = k.offset * F.PROOF_LIME_MS;
    assert.ok(t < beat && beat - t < 0.01, `the lime's step at ${t} ms, its beat ${beat} ms`);
  }
  assert.equal(want[2].opacity, P0.limeInk, 'its first impression');
  assert.equal(want.at(-1).opacity, 1, 'at rest: printed');
  assert.equal(got[0].opacity, P0.unprinted);
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.equal(Number(island.match(/const WARM_OPACITY = ([\d.]+);/)[1]), P0.unprinted, 'unprinted is the pages\' own warm opacity');
  // The crop marks rule in by the lime's beat, on the house curve.
  const draw = ruleOf(css, 'html[data-opening] .of-proof-marks .of-crop').match(/animation: of-proof-draw (\d+\.?\d*)ms var\(--ease-arrive\) both;/);
  assert.ok(draw && close(Number(draw[1]), P0.draw * CUT, 0.001), 'the crop marks');
  for (const k of keyframesOf(css, 'of-proof-draw')) assert.match(k.body.trim(), /^transform: [^;]+;$/, 'transform only');
  // The lime plate's label comes with it (a step, printed at rest).
  const plate = ruleOf(css, "html[data-opening] .of-proof__slug [data-plate='1']").match(/animation: of-proof-plate (\d+\.?\d*)ms steps\(1, end\) both;/);
  assert.ok(plate && close(Number(plate[1]), (P0.beats.paint - P0.beats.lime) * CUT, 0.001), 'plate 1 with the lime');
  assert.deepEqual(keyframesOf(css, 'of-proof-plate').map((k) => k.opacity), [0, 1]);
  assert.match(css, /\.of-proof__slug \[data-plate\] \{ display: inline-block; \}/, 'a box of its own (its opacity the compositor\'s)');
  // The ink plate is the clock's: held until the clock is laid.
  assert.match(css, /\.opening:not\(\[data-clock\]\) \.of-key\[data-key='0'\] \.of-key__word,\s*\.opening:not\(\[data-clock\]\) \.of-proof__slug \[data-plate='2'\] \{ opacity: 0; \}/);
  // Reduced motion: no proof (the same selectors as the running rules).
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.of-proof,\s*\.of-proof-marks \{ opacity: 0; visibility: hidden; \}/);
  assert.match(rm, /html\[data-opening\] \.of-proof-marks \.of-crop,\s*html\[data-opening\] \.of-proof__slug \[data-plate='1'\],\s*html\[data-opening\] \.of-key\[data-key='0'\] \.of-key__block \{ animation: none; \}/);
  // The phone keeps its registration mark, and the slug above the pill.
  const phone = css.slice(css.indexOf('.of-proof__wide { display: none; }') - 400, css.indexOf('.of-proof__wide { display: none; }') + 200);
  assert.match(phone, /\.of-proof-marks \.of-reg \{\s*display: block;\s*left: calc\(50% - 10px\);\s*width: 20px;\s*height: 20px;/);
  assert.match(phone, /bottom: calc\(max\(clamp\(1\.25rem, 2\.6vh, 2\.25rem\), env\(safe-area-inset-bottom\)\) \+ 58px\);/);
  // The markup: the sheet over the pages, under the anchor; the marks over
  // the soft edge; static, and the slug in the system monospace only.
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  const main = scenes.slice(scenes.indexOf('export default function OpeningScenes'));
  const at = (s) => main.indexOf(s);
  assert.ok(at('<ProofSheet') > at('<Cut key') && at('<ProofSheet') < at('className="of-anchor"'), 'the sheet between the pages and the anchor');
  assert.ok(at('<ProofMarks') > at('of-frame__soft'), 'the marks above the soft edge');
  const marksFn = scenes.slice(scenes.indexOf('function ProofMarks'), scenes.indexOf('// ── Act 1'));
  assert.match(marksFn, /className="of-proof__slug of-mono"/);
  assert.doesNotMatch(marksFn, /font-serif|font-ui/);
  assert.match(marksFn, /<span data-plate="1">\{PROOF_SLUG\.plates\[0\]\}<\/span>/);
  assert.match(marksFn, /<span data-plate="2">\{PROOF_SLUG\.plates\[1\]\}<\/span>/);
});

test('the island: one clock from the proof\'s first frame; the proof moves with seek and skip', () => {
  const island = read('../src/components/home/OpeningFilm.tsx');
  const begin = island.slice(island.indexOf('const begin = () => {'), island.indexOf('// A verification hook'));
  assert.match(begin, /overlay\.setAttribute\('data-clock', ''\);\s*const proof = proofAnims\(\);/);
  assert.match(begin, /t0 = filmStart\(seekParam != null \? null : origin, nowMs\(\) \+ CLOCK_LEAD_MS\);/);
  assert.match(begin, /const origin = starts\.length \? Math\.min\(\.\.\.starts\) : proof\.length \? nowMs\(\) : null;/);
  assert.match(begin, /if \(a\.startTime == null\) a\.startTime = t0 - PRELUDE_MS;/);
  assert.match(begin, /if \(pendingSkip\) \{[\s\S]*?proof\.forEach\(\(a\) => a\.finish\(\)\);[\s\S]*?\} else \{/);
  assert.ok(begin.indexOf("setAttribute('data-clock', '')") < begin.indexOf('build();'), 'the clock and the keyframes in one task');
  assert.match(island, /\.filter\(\s*\(a\) => typeof \(a as CSSAnimation\)\.animationName === 'string' && \(a as CSSAnimation\)\.animationName\.startsWith\('of-proof'\),?\s*\)/);
  const ff = island.slice(island.indexOf('const fastForward = () => {'), island.indexOf('onSkipFilm = fastForward;'));
  assert.match(ff, /shiftAll\(-\(target - t\)\);[\s\S]*proofAnims\(\)\.forEach\(\(a\) => a\.finish\(\)\);/);
  const seek = island.slice(island.indexOf('const seek = (t: number) => {'), island.indexOf('if (seekParam != null) {\n      (window'));
  assert.match(seek, /proofAnims\(\)\.forEach\(\(a\) => \{\s*a\.pause\(\);\s*a\.currentTime = Math\.max\(0, t \+ PRELUDE_MS\);/);
  assert.match(island, /el\.animate\(frames, \{ delay: -PRELUDE_MS, duration: preSpan, fill: 'both', easing: 'linear' \}\);\s*anim\.startTime = t0;\s*filmAnims\.push\(anim\);/);
  assert.match(island, /pre\(q\('\[data-key="0"\] \[data-word\]'\), 0, \[\[pr\.word, 1\]\]\);/);
  assert.match(island, /pre\(q\('\[data-plate="2"\]'\), 0, \[\[pr\.word, 1\]\]\);/);
  assert.match(island, /pre\(sheet, PRELUDE\.sheet, \[\[pr\.end, 0\]\]\);/);
  assert.match(island, /pre\(marks, 1, \[\[pr\.end, 0\]\]\);/);
  assert.match(island, /goneAfter\(sheet, pr\.end\)/);
  assert.match(island, /goneAfter\(marks, pr\.end\)/);
  assert.match(island, /grain\(q\('\[data-grain-tile\]'\), -PRELUDE_MS, acts\.hand\.start\)/);
});

test('the first paint\'s anchor numbers are the island\'s (the lime never changes size on the proof)', () => {
  const css = read('../src/styles/opening.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const desk = css.match(/\.opening \{\s*--c0: min\(12vh, calc\((\d+)vw \/ ([\d.]+)\)\);\s*--c0w: ([\d.]+);/);
  const phone = css.match(/@media \(max-width: 1023px\) \{\s*\.opening \{\s*--c0: min\(12vh, calc\((\d+)vw \/ ([\d.]+)\)\);\s*--c0w: ([\d.]+);/);
  assert.ok(desk && phone);
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
  // The island lays the anchor from them, always, never from a measure (a
  // fallback face, faces that never come): the cap, and the first block
  // (its word centred in it by its own ink).
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /const firstPaint = FIRST_PAINT\[plan\.layout\];/);
  assert.match(island, /const cap = anchorCap\(W, H, firstPaint\.across - 2 \* ANCHOR\.pad, plan\.layout\);/);
  assert.equal([...island.matchAll(/anchorCap\(/g)].length, 1, 'one cap, the first paint\'s');
  assert.match(island, /const box = i === plan\.cuts\[0\]\.index \? keyBox\(W, H, cap, \(firstPaint\.key0 - 2 \* ANCHOR\.pad\) \* cap\)\.block : kb\.block;/);
  assert.match(island, /block\.style\.width = px\(box\.w\);/);
  assert.match(island, /word\.style\.left = px\(kb\.inkX \+ ink\.left\);/);
});

test('one ink box, letter by letter: a letter fitted into its own box is itself; into another, it fills it', () => {
  // The faces swapped in one instant (never a frame with both), inside the
  // letters' morph, near its middle.
  const mid = (w) => (w[0] + w[1]) / 2;
  for (const [box, fade] of [[F.TITLE.box, F.TITLE.swap], [F.LANDING_A.morph, F.LANDING_A.sourceOut], [F.LANDING_A.morph, F.LANDING_A.targetIn]]) {
    assert.ok(Math.abs(mid(box) - mid(fade)) <= 0.03, `centred: ${box} / ${fade}`);
    assert.equal(fade[1] - fade[0], 0, `one instant: ${fade}`);
  }
  assert.match(read('../src/components/home/OpeningScenes.tsx'), /text=\{TITLE_NAME\.toUpperCase\(\)\}/);
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

test('act 1: the keywords in the owner\'s order, a new face at every cut, 15–20 scenes', () => {
  const S = F.SCENES;
  assert.ok(S.length >= 15 && S.length <= 20, `${S.length} scenes`);
  const groups = [];
  S.forEach((s) => (groups.at(-1) === s.word ? null : groups.push(s.word)));
  assert.deepEqual(groups, ['ARCHIVE', 'CAMERA', 'TRAVEL', 'THOUGHT', 'YOU']);
  // Three or four pages a keyword; YOU two (a short hold, but read).
  const count = (w) => S.filter((s) => s.word === w).length;
  for (const w of ['ARCHIVE', 'CAMERA', 'TRAVEL', 'THOUGHT']) assert.ok(count(w) >= 3 && count(w) <= 4, `${w} ${count(w)}`);
  assert.equal(count('YOU'), 2);
  for (const plan of Object.values(PLANS)) {
    assert.equal(plan.cuts.at(-1).word, 'YOU', 'YOU is the last page before the hand-off');
    assert.equal(plan.cuts[0].word, 'ARCHIVE');
    for (let i = 1; i < plan.cuts.length; i += 1) assert.notEqual(plan.cuts[i].face, plan.cuts[i - 1].face, 'every cut changes the face');
    for (const face of F.FACE_ORDER) assert.ok(plan.cuts.some((c) => c.face === face), face);
  }
  // The first page (the first paint) holds two sixths, YOU's last three —
  // the longest, before the hand-off; every page between them one.
  const slots = S.map((s) => s.slots);
  assert.equal(slots[0], 2);
  S.slice(1, -1).forEach((s, k) => assert.equal(s.slots, 1, `${k + 1}: ${s.slots}`));
  assert.equal(slots.at(-1), 3);
  assert.equal(Math.max(...slots), slots.at(-1));
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
  assert.ok(sheets.length >= 8, `${sheets.length} pieces of printed matter`);
  assert.equal(new Set(sheets).size, sheets.length, 'each kind once');
  for (const kind of ['newspaper', 'dictionary', 'magazine', 'slate', 'ticket', 'passport', 'telegram', 'postcard']) assert.ok(sheets.includes(kind), kind);
  // Every kind of sheet the film draws is played (none left behind).
  assert.deepEqual(Object.keys(F.SHEETS).sort(), [...sheets].sort());
  assert.deepEqual(Object.keys(F.SHEET_TONE).sort(), [...sheets].sort());
  assert.ok(S.filter((s) => !s.sheet).length >= 8, 'editorial pages');
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
  assert.ok(dense >= 4 && eds - dense >= 4, `${dense} dense of ${eds}`);
  // His own photographs only (the film's three), at their ratio.
  assert.match(scenes, /<Picture picture=\{pictures\[l\.print\.pic\]\}/);
});

test('no place names: the suspense — only the two tiny eggs, in a corner, never the keyword', () => {
  const names = F.PLACE_NAMES;
  const eggText = F.EGGS.map((e) => e.text);
  assert.ok(F.EGGS.length <= 2);
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

test('act 4: the burn — frames in the spec\'s order, the slip, the leader one frame a card', () => {
  // 22 frames (it was 24): one black frame, three of lit perforations.
  assert.equal(F.BURN.frames, 22);
  assert.deepEqual([...F.BURN.flicker], [0, 3]);
  assert.equal(F.BURN.slip, 3);
  assert.deepEqual([...F.BURN.burn], [4, 9]);
  assert.deepEqual([...F.BURN.out], [9, 12]);
  assert.deepEqual([...F.BURN.black], [12, 13]);
  assert.deepEqual([...F.BURN.leader], [13, 19]);
  assert.deepEqual([...F.BURN.perfs], [19, 22]);
  assert.equal(F.BURN.perfs[1], F.BURN.frames, 'the perforations end the burn');
  assert.equal(F.LEADER.length, F.BURN.leader[1] - F.BURN.leader[0], 'one card a frame');
  const perfN = F.BURN.perfs[1] - F.BURN.perfs[0];
  assert.equal(F.BURN.perfY.length, perfN);
  assert.equal(F.BURN.perfO.length, perfN);
  for (let k = 1; k < perfN; k += 1) assert.ok(F.BURN.perfY[k] < F.BURN.perfY[k - 1] && F.BURN.perfO[k] < F.BURN.perfO[k - 1], 'climbing, fading');
  assert.ok(close(F.frameAt(3).y, -0.25));
  assert.equal(F.frameAt(2).y, 0);
  assert.equal(F.frameAt(4).y, 0);
  assert.ok(close(F.frameAt(11).rot, 6));
  for (let f = 0; f < 12; f += 1) assert.ok(Math.abs(F.frameAt(f).x) <= 1 && Math.abs(F.frameAt(f).weaveY) <= 1);
  for (let f = 0; f < 3; f += 1) assert.ok(Math.abs(F.burnFrame(f).flick) > 0, `flicker f${f}`);
  for (let f = 3; f < F.BURN.frames; f += 1) assert.equal(F.burnFrame(f).flick, 0, `no flicker f${f}`);
  for (let f = 9; f < 12; f += 1) assert.ok(F.frameAt(f).y < 0, `slide f${f} up`);
  assert.ok(F.frameAt(12).y <= -1, 'gone off the top');
  for (let f = 5; f < 12; f += 1) assert.ok(F.burnRadius(f) > F.burnRadius(f - 1));
  assert.equal(F.burnRadius(3), 0);
  assert.equal(F.burnDarkness(8), 0);
  assert.ok(F.burnDarkness(11) > F.burnDarkness(9));
  assert.equal(F.burnDarkness(12), 1);
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

test('acts 5–6: the dark typed with one lime cursor, then the line turns into the title', () => {
  for (const plan of Object.values(PLANS)) {
    const t = plan.darkTyping;
    assert.equal(t.length, F.DARK_TYPED.length);
    assert.equal(t[0], plan.acts.dark.start + F.DARK_TYPE_AT);
    const cps = ((t.length - 1) * 1000) / (t.at(-1) - t[0]);
    assert.ok(cps > 10.5 && cps < 14.5, `${cps.toFixed(1)} a second`);
    assert.ok(plan.blink.start > t.at(-1));
    assert.ok(close(plan.blink.end - plan.blink.start, F.CURSOR_MS / 2));
    assert.equal(plan.blink.end, plan.acts.title.start);
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

test('the end title sets his name in the cover\'s face; the cover\'s case turns in flight, one ink box a letter', () => {
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
  // The title's name: the same family (font-serif is Fraunces) and weight.
  const title = rule(film, '.of-title__face');
  assert.equal(value(title, 'font-weight'), '400');
  const scenes = read('../src/components/home/OpeningScenes.tsx');
  assert.match(scenes, /className="of-title__name of-title__face font-serif" data-title-to>\s*<span data-fly="ryan">Ryan<\/span> <span data-fly="xu">Xu<\/span>/);
  // Its capitals turn into the cover's case in flight: a face that differs
  // at either end (case included) morphs letter by letter, the two faces
  // swapped in one instant (never a frame with both).
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /casing\(aText, a\) === casing\(bText, b\)/);
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

test('landing A: every word flies from its box to its glyph box, in order, inside 0.6 s', () => {
  const src = { x: 500, y: 300, w: 400, h: 110 };
  const dst = { x: 104, y: 284, w: 700, h: 221 };
  const f = F.flightFor(src, dst, 64, 175, 0);
  assert.ok(close(f.dx, 700 - 454));
  assert.ok(close(f.dy, 355 - 394.5));
  assert.ok(close(f.k, 64 / 175));
  const delays = F.FLY_ORDER.map((_, i) => F.flightFor(src, dst, 1, 1, i).delay);
  for (let i = 1; i < delays.length; i += 1) assert.ok(delays[i] > delays[i - 1]);
  assert.ok(F.LANDING_A.done <= 700);
  // The rest of the cover sets itself block by block from 'landed' (the
  // film's LANDING_A.rest): the cover waits through the flight …
  const intro = read('../src/components/home/EntranceIntro.tsx');
  assert.match(intro, /const waiting = \(\) => reel\(\) === 'reel' \|\| reel\(\) === 'flight';/);
  const entrance = read('../src/styles/entrance.css');
  assert.match(entrance, /\.entrance\[data-compose='play'\] :is\(\.ec-w, \.ec-found:not\(\[data-flown\]\)\) \{\s*animation: ec-rise var\(--ec-dur, 600ms\) var\(--entrance-ease\) calc\(var\(--b, 0\) \* var\(--ec-step, 180ms\)\) backwards;/);
  // … and no word rises on a block a flying word lands on before every
  // word (YOU too) is home: nothing comes up under a word still sliding in.
  const all = F.landingAEnd(F.FLY_ORDER.length);
  for (const first of [{ name: 'Miami' }, null]) {
    landsOf(P.coverBlocks(COVER_FACTS, first)).forEach((lands, b) => {
      if (lands.length) assert.ok(F.LANDING_A.rest + P.revealAt(b) >= all, `block ${b}: ${F.LANDING_A.rest} + ${P.revealAt(b)} vs ${all}`);
    });
  }
  assert.ok(F.LANDING_A.rest < F.landingAEnd(F.FLY_ORDER.length));
  // YOU's line (its lead only, when YOU flies) is gone before the first
  // flight could reach it.
  assert.ok(F.LANDING_A.youOut[1] <= 100);
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /youFlies \? \[\.\.\.youLine\.children\]\.filter\(\(el\) => !\(el as HTMLElement\)\.dataset\.fly\) : \[youLine\]/);
  const path = F.flightPath(F.flightFor(src, dst, 64, 175, 0));
  assert.ok(close(path[0].x, 700 - 454) && close(path.at(-1).x, 0) && close(path.at(-1).s, 1));
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
  assert.match(island, /fontsIn\.then\(whenVisible\)\.then/);
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
  assert.match(island, /fontsIn\.then\(whenVisible\)\.then\(\(\) => \{\s*\/\/[^\n]*\n\s*requestAnimationFrame\(begin\);/);
  // Before the clock, the first page's grain moves and the Skip pill comes up.
  const css = read('../src/styles/opening.css');
  assert.match(css, /\.opening:not\(\[data-clock\]\) \.of-frame__grain \.of-grain__tile \{ animation: of-grain-first 200ms steps\(1, end\) infinite; \}/);
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
  for (const sel of ['.of-mat', '.of-leader', '.of-end', '.of-cut', '.of-chrome', '.of-key', '.of-handoff', '.of-burn', '.of-perfrow']) {
    assert.ok(hidden.includes(sel), sel);
  }
  const island = read('../src/components/home/OpeningFilm.tsx');
  assert.match(island, /const PREROLL_MS = 250;/);
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
