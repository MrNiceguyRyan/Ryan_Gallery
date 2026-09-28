// Run offline: node --experimental-strip-types --test scripts/story-plan.test.mjs
//
// The Collection Story as a weekly feature (src/lib/storyPlan.ts): which
// template each frame goes into, and where every box sits. Pinned on the
// archive as Sanity served it on 2026-09-27 (the fixture the chapter-order
// test reads): frame 01 is the chapter's cover, the six stories' sequences
// are the ones the design was judged on (less the touching diptych, gone
// 2026-09-28), every box is the photograph's own shape and fits on one
// screen, and no two photographs are joined. The geometry is written twice from one
// formula — CSS calc() for the server HTML and pixels for the plate's grow —
// so the two are evaluated against each other at three windows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CAPTION_ROOM,
  STORY_HEAD,
  cameraName,
  formatPosition,
  frameRatio,
  isLandscape,
  openerRect,
  planStory,
  slotCaption,
  slotRows,
  storyBoxes,
  storyCamera,
  storyFrames,
  storyGrid,
} from '../src/lib/storyPlan.ts';

const { collections } = JSON.parse(readFileSync(new URL('./fixtures/archive-2026-09-27.json', import.meta.url), 'utf8'));
// The stories with a pull quote (src/lib/narratives.tsx PULL_QUOTES).
const QUOTED = new Set(['miami', 'orlando', 'page', 'zion-national-park']);
const HASH = /[0-9a-f]{40}/;

const story = (slug) => {
  const collection = collections.find((c) => c.slug === slug);
  const frames = storyFrames(collection.photos, collection.coverImageUrl);
  const ratios = frames.map(frameRatio);
  return { collection, frames, ratios, slots: planStory(ratios, { hasQuote: QUOTED.has(slug) }) };
};
const written = (slots) => slots.map((s) => `${s.kind}${s.frames.length ? `[${s.frames.map((f) => f + 1).join(',')}]` : ''}`).join(' ');
const WINDOWS = [[1728, 1000], [1280, 800], [1024, 768]];

test('frame 01 is the cover the reader clicked', () => {
  for (const collection of collections) {
    const frames = storyFrames(collection.photos, collection.coverImageUrl);
    assert.equal(frames.length, collection.photos.length);
    assert.equal(HASH.exec(frames[0].imageUrl)[0], HASH.exec(collection.coverImageUrl)[0], collection.slug);
    // The rest keep Sanity's order.
    const rest = collection.photos.filter((p) => p !== frames[0]);
    assert.deepEqual(frames.slice(1), rest);
  }
  // No cover among the photographs: the first landscape leads, as before.
  const p = { imageUrl: 'a-4000x6000.jpg', width: 4000, height: 6000 };
  const l = { imageUrl: 'b-6000x4000.jpg', width: 6000, height: 4000 };
  assert.deepEqual(storyFrames([p, l], 'https://x/c0ffee.jpg'), [l, p]);
  assert.deepEqual(storyFrames([p]), [p]);
});

test("today's six sequences", () => {
  // No diptych (the owner, 2026-09-28: no two photographs joined together).
  // Where one stood — miami 13/14, orlando 3/4, 8/9 and 14/15, page 4/5 —
  // the first portrait is a page of its own and the next is planned as any
  // other frame; miami, zion, bryce and New York are otherwise as judged.
  const pinned = {
    miami: 'OPEN[1] LEDE[2] PAIR[3,4] SCREEN[5] FEATURE[6] QUOTE PAIR[7,8] PAGE[9] PART[10] PAIR[11,12] PAGE[13] COLUMN[14] SCREEN[15] END',
    orlando: 'OPEN[1] LEDE[2] PAGE[3] PAIR[4,5] COLUMN[6] SCREEN[7] QUOTE PAGE[8] PAIR[9,10] PART[11] PAGE[12] PAIR[13,14] COLUMN[15] PAGE[16] SMALL[17] END',
    page: 'OPEN[1] LEDE[2] SCREEN[3] PAGE[4] QUOTE PAIR[5,6] PART[7] PAGE[8] PAIR[9,10] FEATURE[11] END',
    'zion-national-park': 'OPEN[1] LEDE[2] SCREEN[3] QUOTE PAGE[4] PART[5] FEATURE[6] PAIR[7,8] END',
    'bryce-canyon-national-park': 'OPEN[1] LEDE[2] SCREEN[3] PART[4] FEATURE[5] END',
    'new-york-stories': 'OPEN[1] LEDE2 PAGE[2] END',
  };
  for (const [slug, sequence] of Object.entries(pinned)) assert.equal(written(story(slug).slots), sequence, slug);
  // Orientation strings the design was judged on (cover first).
  const orient = (slug) => story(slug).ratios.map((r) => (isLandscape(r) ? 'L' : 'P')).join('');
  assert.equal(orient('miami'), 'LLPLLLLLPPPLPPL');
  assert.equal(orient('orlando'), 'PPPPPPLPPPPPPPPPP');
  assert.equal(orient('new-york-stories'), 'LP');
});

// Every story the planner could meet: the six, plus every mix of up to 20
// frames from a seeded run of orientations.
const cases = () => {
  const out = collections.map((c) => ({ name: c.slug, ...story(c.slug) }));
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let n = 1; n <= 20; n += 1) {
    for (let k = 0; k < 12; k += 1) {
      const ratios = Array.from({ length: n }, () => (rand() < 0.5 ? 1.5 : 2 / 3));
      for (const hasQuote of [true, false]) out.push({ name: `n${n}#${k}${hasQuote ? 'q' : ''}`, ratios, slots: planStory(ratios, { hasQuote }) });
    }
  }
  return out;
};

test('every frame is placed once, in order, and no template repeats back to back', () => {
  for (const { name, ratios, slots } of cases()) {
    assert.deepEqual(slots.flatMap((s) => s.frames), ratios.map((_, i) => i), name);
    for (let i = 1; i < slots.length; i += 1) assert.notEqual(slots[i].kind, slots[i - 1].kind, `${name}: ${written(slots)}`);
    assert.equal(slots[0].kind, 'OPEN');
    assert.equal(slots.at(-1).kind, 'END');
    for (const s of slots) {
      if (s.kind === 'SCREEN' || s.kind === 'FEATURE') assert.ok(s.frames.every((f) => isLandscape(ratios[f])), `${name}: ${s.kind} is a landscape`);
      // The one template that holds two photographs is the pair.
      if (s.frames.length > 1) assert.equal(s.kind, 'PAIR', `${name}: ${written(slots)}`);
      assert.ok(s.frames.length <= 2, `${name}: ${written(slots)}`);
    }
    // The rows the kept stub reads are the frames in reading order.
    assert.deepEqual(slotRows(slots).flat(), ratios.map((_, i) => i));
  }
});

test('the quote comes before Part II with a picture between; Part II never follows the lede', () => {
  for (const { name, slots } of cases()) {
    const quote = slots.findIndex((s) => s.kind === 'QUOTE');
    const part = slots.findIndex((s) => s.kind === 'PART');
    if (quote >= 0 && part >= 0) {
      assert.ok(quote < part, `${name}: ${written(slots)}`);
      assert.ok(slots.slice(quote + 1, part).some((s) => s.frames.length > 0), `${name}: ${written(slots)}`);
    }
    if (part >= 0) assert.ok(!['LEDE', 'LEDE2'].includes(slots[part - 1].kind), `${name}: ${written(slots)}`);
    // One quote and one Part II at most; a short story has its II in the band.
    assert.ok(slots.filter((s) => s.kind === 'QUOTE').length <= 1);
    assert.ok(slots.filter((s) => s.kind === 'PART').length <= 1);
  }
});

test('a story of five or more has a frame the height of the screen and a small one', () => {
  for (const { name, ratios, slots } of cases()) {
    if (ratios.length < 5) continue;
    const tall = slots.some((s) => ['SCREEN', 'PAGE'].includes(s.kind) || (s.kind === 'OPEN' && !isLandscape(ratios[0])));
    const small = slots.some((s) => s.kind === 'LEDE' || s.kind === 'SMALL');
    assert.ok(tall && small, `${name}: ${written(slots)}`);
  }
});

test('every box is the photograph’s own shape and every in-flow frame fits on one screen', () => {
  for (const [W, H] of WINDOWS) {
    const g = storyGrid(W, H);
    const hmax = H - STORY_HEAD - CAPTION_ROOM;
    for (const { name, ratios, slots } of cases()) {
      for (const box of storyBoxes(slots, ratios, W, H)) {
        for (const f of box.frames) {
          const r = ratios[f.frame];
          assert.ok(Math.abs(f.w.v / f.h.v - r) / r < 1e-9, `${name} ${box.slot.kind} at ${W}: ratio`);
          assert.ok(f.x.v >= -0.01 && f.x.v + f.w.v <= W + 0.01, `${name} ${box.slot.kind} at ${W}: inside the window`);
          if (box.slot.kind === 'OPEN') assert.ok(f.h.v <= H + 0.01);
          else assert.ok(f.h.v <= hmax + 0.01, `${name} ${box.slot.kind} at ${W}x${H}: ${f.h.v.toFixed(1)} > ${hmax}`);
          // Frames stay out of the rail, except the screen-high landscape,
          // which passes over it as a full-bleed page drops its folio.
          if (box.slot.kind !== 'SCREEN' && box.slot.kind !== 'OPEN') assert.ok(f.x.v >= g.fieldX.v - 0.01, `${name} ${box.slot.kind} at ${W}: in the field`);
        }
      }
    }
  }
});

test('no two photographs are joined: a pair keeps its gutter, and no frame touches another', () => {
  // The owner (2026-09-28): collection story里面不要出现两张照片拼接在一起.
  // Within a slot the frames sit side by side, at least the pair's gutter
  // apart; slots stack, `top` apart, so frames of two slots never meet.
  for (const [W, H] of WINDOWS) {
    const g = storyGrid(W, H);
    for (const { name, ratios, slots } of cases()) {
      for (const box of storyBoxes(slots, ratios, W, H)) {
        const frames = [...box.frames].sort((a, b) => a.x.v - b.x.v);
        for (let i = 1; i < frames.length; i += 1) {
          const gutter = frames[i].x.v - (frames[i - 1].x.v + frames[i - 1].w.v);
          assert.ok(gutter >= g.pairGap.v - 1e-6, `${name} ${box.slot.kind} at ${W}: ${gutter.toFixed(1)}px apart`);
        }
        if (box.slot.kind !== 'OPEN') assert.ok(box.top.v > 0, `${name} ${box.slot.kind}`);
      }
    }
  }
});

test('a portrait opener is the full height of the window; a landscape leaves paper under it', () => {
  for (const [W, H] of WINDOWS) {
    const portrait = openerRect(W, H, 2 / 3);
    assert.ok(Math.abs(portrait.height - H) < 1e-9);
    assert.ok(Math.abs(portrait.x + portrait.width - W) < 1e-9);
    const landscape = openerRect(W, H, 1.5);
    assert.ok(landscape.height <= 0.72 * H + 1e-9);
    assert.equal(landscape.y, 0);
    assert.ok(Math.abs(landscape.x + landscape.width - W) < 1e-9);
    // The map page keeps at least the columns its title is set in.
    assert.ok(portrait.mapW >= storyGrid(W, H).colX(6).v - storyGrid(W, H).G.v / 2 - 1e-9);
  }
  // The judged numbers at 1728×1000.
  const miami = openerRect(1728, 1000, 7728 / 5152);
  assert.deepEqual([Math.round(miami.width), Math.round(miami.height), Math.round(miami.mapW)], [1002, 668, 726]);
  const orlando = openerRect(1728, 1000, 5152 / 7728);
  assert.deepEqual([Math.round(orlando.width), Math.round(orlando.height)], [667, 1000]);
});

// The server's CSS, evaluated: the grid tokens as global.css writes them.
const evalCss = (value, W, H) => {
  const g = storyGrid(W, H);
  const js = value
    .replace(/var\(--sM\)/g, `(${g.M.v})`)
    .replace(/var\(--sG\)/g, `(${g.G.v})`)
    .replace(/var\(--sC\)/g, `(${g.C.v})`)
    .replace(/(-?[\d.]+)svh/g, (_, n) => `(${n}*${H}/100)`)
    .replace(/(-?[\d.]+)vw/g, (_, n) => `(${n}*${W}/100)`)
    .replace(/(-?[\d.]+)px/g, '($1)')
    .replace(/\bcalc\(/g, '(')
    .replace(/\bmin\(/g, 'Math.min(')
    .replace(/\bmax\(/g, 'Math.max(');
  // Nothing left but numbers, operators and the two functions.
  assert.doesNotMatch(js.replace(/Math\.(min|max)/g, ''), /[a-z-]{2,}/i, js);
  return Function(`return ${js}`)();
};

test('the CSS the server sends is the same box the grow aims at', () => {
  for (const [W, H] of WINDOWS) {
    for (const slug of ['miami', 'orlando', 'page', 'zion-national-park', 'bryce-canyon-national-park', 'new-york-stories']) {
      const { ratios, slots } = story(slug);
      for (const box of storyBoxes(slots, ratios, W, H)) {
        for (const f of box.frames) {
          for (const key of ['x', 'w', 'h', 'y']) {
            const cssValue = evalCss(`calc(${f[key].c})`, W, H);
            assert.ok(Math.abs(cssValue - f[key].v) < 1e-3, `${slug} ${box.slot.kind} ${key} at ${W}: ${cssValue} vs ${f[key].v}`);
          }
        }
        for (const t of box.text) for (const key of ['x', 'w', 'y']) assert.ok(Math.abs(evalCss(`calc(${t[key].c})`, W, H) - t[key].v) < 1e-3);
        assert.ok(Math.abs(evalCss(`calc(${box.top.c})`, W, H) - box.top.v) < 1e-3);
      }
    }
  }
});

test('the scale ladder at 1728×1000', () => {
  const widths = [];
  for (const slug of ['miami', 'orlando']) {
    const { ratios, slots } = story(slug);
    for (const box of storyBoxes(slots, ratios, 1728, 1000)) for (const f of box.frames) widths.push(f.w.v);
  }
  // The largest frame is the screen-high landscape; the range is 3.5:1 or more
  // (it was 3.1:1 as a grid of rows).
  assert.equal(Math.round(Math.max(...widths)), 1374);
  assert.ok(Math.max(...widths) / Math.min(...widths) >= 3.5);
});

test('the rhythm is compact: slots a tenth of the screen apart, a pair a hair closer', () => {
  // The owner (2026-09-27): the layout is right, the photographs a little
  // closer. Between slots was max(96px, 14svh) and a pair's gutter
  // max(48px, 4.5vw); both came in by about a quarter to a third.
  const at = (W, H) => storyGrid(W, H);
  assert.equal(at(1728, 1000).gap.v, 100);
  assert.equal(at(1280, 800).gap.v, 80);
  assert.equal(at(1024, 600).gap.v, 68);
  assert.ok(Math.abs(at(1728, 1000).pairGap.v - 58.752) < 1e-9);
  assert.equal(at(1024, 768).pairGap.v, 36);
  for (const [W, H] of WINDOWS) {
    const was = Math.max(96, 0.14 * H);
    const cut = 1 - at(W, H).gap.v / was;
    assert.ok(cut >= 0.25 && cut <= 0.35, `gap at ${W}x${H} came in by ${(cut * 100).toFixed(1)}%`);
  }
});

test('captions, credits and facts', () => {
  assert.deepEqual(slotCaption([4, 5], ['', '', '', '', '', '']), [{ no: '05, 06', place: '' }]);
  assert.deepEqual(slotCaption([0], ['Midtown']), [{ no: '01', place: 'Midtown' }]);
  assert.deepEqual(slotCaption([0, 1], ['Midtown', 'Manhattan']), [{ no: '01', place: 'Midtown' }, { no: '02', place: 'Manhattan' }]);
  assert.equal(cameraName('FUJIFILM X-T50'), 'Fujifilm X-T50');
  assert.equal(cameraName('NIKON CORPORATION NIKON Z f'), 'Nikon Z f');
  assert.equal(cameraName('Nikon Zf'), 'Nikon Z f');
  assert.equal(cameraName(''), '');
  assert.equal(storyCamera(['Nikon Zf', 'NIKON CORPORATION NIKON Z f', 'FUJIFILM X-T50']), 'Nikon Z f');
  assert.equal(formatPosition(25.7617, -80.1918), '25.76° N, 80.19° W');
  assert.equal(formatPosition(undefined, 3), '');
  for (const collection of collections) {
    const camera = storyCamera(collection.photos.map((p) => p.camera));
    assert.ok(['Fujifilm X-T50', 'Nikon Z f'].includes(camera), `${collection.slug}: ${camera}`);
  }
});
