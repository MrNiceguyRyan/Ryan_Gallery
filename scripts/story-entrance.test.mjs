// Run offline: node --experimental-strip-types --test scripts/story-entrance.test.mjs
//
// How the story's inside frames arrive (src/lib/storyEntrance.ts): four
// photographic entrances — zoom, advance, shutter, develop — dealt by the
// plan in reading order (the owner, 2026-09-27: not always the flash from
// the top-left corner). A magazine, not a showreel: zoom and advance carry
// the story and the two loud moves are placed on its beats. Pinned on the
// archive fixture the story plan's test reads, and swept over every mix of
// up to 20 frames from the same seeded run of orientations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { frameRatio, planStory, storyBoxes, storyFrames } from '../src/lib/storyPlan.ts';
import {
  DESIGN_H,
  DESIGN_W,
  ENTRANCES,
  planEntrances,
  revealMs,
  RUN,
  SHUTTER_BLADE_MS,
  SHUTTER_MAX,
  SHUTTER_MAX_SHARE,
  SHUTTER_MS,
  SHUTTER_SPACING,
  SHUTTER_TOTAL_MS,
} from '../src/lib/storyEntrance.ts';

const { collections } = JSON.parse(readFileSync(new URL('./fixtures/archive-2026-09-27.json', import.meta.url), 'utf8'));
const QUOTED = new Set(['miami', 'orlando', 'page', 'zion-national-park']);

const story = (slug) => {
  const collection = collections.find((c) => c.slug === slug);
  const ratios = storyFrames(collection.photos, collection.coverImageUrl).map(frameRatio);
  const slots = planStory(ratios, { hasQuote: QUOTED.has(slug) });
  return { ratios, slots, entrances: planEntrances(slots, ratios) };
};
const written = (slots, entrances) => slots
  .map((slot, i) => {
    const e = entrances[i];
    if (!e) return null;
    const side = e.entrance === 'develop' || e.entrance === 'advance' ? `/${e.from}` : '';
    return `${slot.kind}:${e.entrance}${side}`;
  })
  .filter(Boolean)
  .join(' ');

const cases = () => {
  const out = collections.map((c) => ({ name: c.slug, ...story(c.slug) }));
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let n = 1; n <= 20; n += 1) {
    for (let k = 0; k < 12; k += 1) {
      const ratios = Array.from({ length: n }, () => (rand() < 0.5 ? 1.5 : 2 / 3));
      for (const hasQuote of [true, false]) {
        const slots = planStory(ratios, { hasQuote });
        out.push({ name: `n${n}#${k}${hasQuote ? 'q' : ''}`, ratios, slots, entrances: planEntrances(slots, ratios) });
      }
    }
  }
  return out;
};

/** The framed slots, in reading order, with their entrance and their
 *  tallest frame at the design window. */
const framedOf = ({ slots, ratios, entrances }) => {
  const boxes = storyBoxes(slots, ratios, DESIGN_W, DESIGN_H);
  return slots.flatMap((slot, index) => (entrances[index]
    ? [{ slot, index, ...entrances[index], tallest: Math.max(...boxes[index].frames.map((f) => f.h.v)) }]
    : []));
};
const suitsShutter = (f) => f.tallest <= SHUTTER_MAX_SHARE * DESIGN_H;

test("today's six stories, as they are dealt", () => {
  const pinned = {
    // The review's re-deal, to the letter: the develop on the feature, the
    // 07/08 burst straight after the quote.
    // Where a diptych stood (gone 2026-09-28) a single page is dealt a
    // single frame's entrance: it zooms, or advances to break a third zoom.
    miami: 'LEDE:zoom PAIR:advance/right SCREEN:zoom FEATURE:develop/top PAIR:shutter PAGE:zoom PART:zoom PAIR:advance/left PAGE:zoom COLUMN:zoom SCREEN:advance/left',
    orlando: 'LEDE:zoom PAGE:zoom PAIR:advance/right COLUMN:zoom SCREEN:develop/top PAGE:zoom PAIR:advance/right PART:zoom PAGE:zoom PAIR:advance/left COLUMN:zoom PAGE:zoom SMALL:shutter',
    page: 'LEDE:zoom SCREEN:zoom PAGE:advance/right PAIR:advance/right PART:shutter PAGE:zoom PAIR:advance/left FEATURE:develop/top',
    'zion-national-park': 'LEDE:zoom SCREEN:zoom PAGE:advance/right PART:zoom FEATURE:develop/top PAIR:shutter',
    'bryce-canyon-national-park': 'LEDE:zoom SCREEN:zoom PART:shutter FEATURE:develop/top',
    'new-york-stories': 'PAGE:zoom',
  };
  for (const [slug, sequence] of Object.entries(pinned)) {
    const { slots, entrances } = story(slug);
    assert.equal(written(slots, entrances), sequence, slug);
  }
});

test('the same story is always dealt the same entrances', () => {
  for (const { name, slots, ratios, entrances } of cases()) {
    assert.deepEqual(planEntrances(slots, ratios), entrances, name);
    assert.deepEqual(planEntrances(structuredClone(slots), [...ratios]), entrances, name);
  }
});

test('frame 01, the end page and a slot with no frame are not dealt one; every other slot is', () => {
  for (const { name, slots, entrances } of cases()) {
    assert.equal(entrances.length, slots.length, name);
    slots.forEach((slot, i) => {
      const skip = slot.kind === 'OPEN' || slot.kind === 'END' || slot.frames.length === 0;
      if (skip) assert.equal(entrances[i], null, `${name}: ${slot.kind}`);
      else assert.ok(entrances[i] && ENTRANCES.includes(entrances[i].entrance), `${name}: ${slot.kind}`);
    });
  }
});

test('never the same entrance three times running', () => {
  for (const c of cases()) {
    const dealt = framedOf(c).map((f) => f.entrance);
    for (let i = RUN; i < dealt.length; i += 1) {
      assert.ok(!dealt.slice(i - RUN, i + 1).every((e) => e === dealt[i]), `${c.name}: ${written(c.slots, c.entrances)}`);
    }
  }
});

test('one develop at most, from the top, on the feature (else the first screen-high landscape)', () => {
  for (const c of cases()) {
    const framed = framedOf(c);
    const develops = framed.filter((f) => f.entrance === 'develop');
    const feature = framed.find((f) => f.slot.kind === 'FEATURE') ?? framed.find((f) => f.slot.kind === 'SCREEN');
    assert.equal(develops.length, feature ? 1 : 0, c.name);
    if (feature) assert.equal(develops[0].index, feature.index, c.name);
    for (const f of develops) assert.equal(f.from, 'top', c.name);
  }
});

test('a shutter fires only over a frame it can be seen crossing, twice at most, four framed slots apart', () => {
  for (const c of cases()) {
    const framed = framedOf(c);
    const at = framed.flatMap((f, i) => (f.entrance === 'shutter' ? [i] : []));
    assert.ok(at.length <= SHUTTER_MAX, `${c.name}: ${written(c.slots, c.entrances)}`);
    for (const i of at) assert.ok(suitsShutter(framed[i]), `${c.name}: ${framed[i].slot.kind} ${Math.round(framed[i].tallest)}px`);
    for (let k = 1; k < at.length; k += 1) assert.ok(at[k] - at[k - 1] >= SHUTTER_SPACING, `${c.name}: ${written(c.slots, c.entrances)}`);
    // Never over a screen-high template: its plate is taller than the rule.
    for (const f of framed) if (['SCREEN', 'PAGE'].includes(f.slot.kind)) assert.notEqual(f.entrance, 'shutter', c.name);
    // A story with a frame a shutter suits fires one.
    const suited = framed.filter((f) => suitsShutter(f) && f.entrance !== 'develop');
    if (suited.length) assert.ok(at.length >= 1, `${c.name}: ${written(c.slots, c.entrances)}`);
  }
});

test('the first shutter falls on the first frame after the pull quote a shutter suits', () => {
  for (const c of cases()) {
    const quote = c.slots.findIndex((slot) => slot.kind === 'QUOTE');
    if (quote < 0) continue;
    const framed = framedOf(c);
    const after = framed.find((f) => f.index > quote && suitsShutter(f) && f.entrance !== 'develop');
    const first = framed.find((f) => f.entrance === 'shutter');
    if (after) assert.equal(first?.index, after.index, `${c.name}: ${written(c.slots, c.entrances)}`);
  }
});

test('the rest: a strip of film advances and a single frame zooms, except to break a run of three', () => {
  const strips = new Set(['PAIR', 'FEATURE']);
  for (const c of cases()) {
    const framed = framedOf(c);
    framed.forEach((f, i) => {
      if (f.entrance === 'develop' || f.entrance === 'shutter') return;
      const wanted = strips.has(f.slot.kind) ? 'advance' : 'zoom';
      if (f.entrance === wanted) return;
      const before = framed.slice(Math.max(0, i - RUN), i).map((g) => g.entrance);
      assert.ok(before.length === RUN && before.every((e) => e === wanted), `${c.name}: ${written(c.slots, c.entrances)}`);
    });
  }
});

test('a pair shares its entrance; a strip of film advances as one; a pair of shutters fires as a burst', () => {
  for (const c of cases()) {
    for (const f of framedOf(c)) {
      if (f.entrance === 'advance') {
        assert.equal(f.stagger, 0, c.name);
        assert.ok(['left', 'right'].includes(f.from), c.name);
      }
      if (f.entrance === 'shutter' && f.slot.frames.length === 2) assert.equal(f.stagger, 0.12, c.name);
      assert.ok(f.stagger >= 0 && f.stagger <= 0.12, c.name);
    }
  }
});

test('the shutter is quick and mechanical; every picture reads as there within half a second', () => {
  assert.equal(SHUTTER_BLADE_MS, SHUTTER_MS.close + 3 * SHUTTER_MS.blade + SHUTTER_MS.hold + SHUTTER_MS.open);
  assert.ok(SHUTTER_TOTAL_MS >= 380 && SHUTTER_TOTAL_MS <= 460, `shutter ${SHUTTER_TOTAL_MS}ms`);
  assert.equal(revealMs({ entrance: 'shutter', phone: false, tall: false }), 270);
  for (const entrance of ENTRANCES) {
    for (const phone of [false, true]) {
      for (const tall of [false, true]) assert.ok(revealMs({ entrance, phone, tall }) <= 500, `${entrance} ${phone} ${tall}`);
    }
  }
});
