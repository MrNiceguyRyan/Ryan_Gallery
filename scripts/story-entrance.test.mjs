// Run offline: node --experimental-strip-types --test scripts/story-entrance.test.mjs
//
// How the story's inside frames arrive (src/lib/storyEntrance.ts): four
// photographic entrances — zoom, shutter, advance, develop — dealt by the
// plan in reading order, so a story has variety with a rhythm to it (the
// owner, 2026-09-27: not always the flash from the top-left corner). Pinned
// on the archive fixture the story plan's test reads, and swept over every
// mix of up to 20 frames from the same seeded run of orientations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { frameRatio, planStory, storyFrames } from '../src/lib/storyPlan.ts';
import { ENTRANCES, planEntrances, revealMs, SHUTTER_MS } from '../src/lib/storyEntrance.ts';

const { collections } = JSON.parse(readFileSync(new URL('./fixtures/archive-2026-09-27.json', import.meta.url), 'utf8'));
const QUOTED = new Set(['miami', 'orlando', 'page', 'zion-national-park']);

const story = (slug) => {
  const collection = collections.find((c) => c.slug === slug);
  const ratios = storyFrames(collection.photos, collection.coverImageUrl).map(frameRatio);
  const slots = planStory(ratios, { hasQuote: QUOTED.has(slug) });
  return { ratios, slots, entrances: planEntrances(slots) };
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
        out.push({ name: `n${n}#${k}${hasQuote ? 'q' : ''}`, ratios, slots, entrances: planEntrances(slots) });
      }
    }
  }
  return out;
};

test("today's six stories, as they are dealt", () => {
  const pinned = {
    miami: 'LEDE:zoom PAIR:advance/right SCREEN:shutter FEATURE:develop/left PAIR:advance/right PAGE:zoom PART:develop/right PAIR:advance/left DIPTYCH:shutter SCREEN:zoom',
    orlando: 'LEDE:zoom DIPTYCH:shutter PAIR:advance/right SCREEN:zoom DIPTYCH:shutter PAGE:develop/top PART:zoom PAIR:advance/left DIPTYCH:shutter PAGE:zoom COLUMN:develop/right',
    page: 'LEDE:zoom SCREEN:shutter DIPTYCH:advance/right PAGE:zoom PART:develop/right PAIR:advance/right PAGE:zoom FEATURE:develop/left',
    'zion-national-park': 'LEDE:zoom SCREEN:shutter PAGE:develop/top PART:zoom FEATURE:advance/right PAIR:shutter',
    'bryce-canyon-national-park': 'LEDE:zoom SCREEN:shutter PART:develop/right FEATURE:advance/right',
    'new-york-stories': 'PAGE:zoom',
  };
  for (const [slug, sequence] of Object.entries(pinned)) {
    const { slots, entrances } = story(slug);
    assert.equal(written(slots, entrances), sequence, slug);
  }
});

test('the same story is always dealt the same entrances', () => {
  for (const { name, slots, entrances } of cases()) {
    assert.deepEqual(planEntrances(slots), entrances, name);
    assert.deepEqual(planEntrances(structuredClone(slots)), entrances, name);
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

test('never the same entrance twice running, so never three times', () => {
  for (const { name, slots, entrances } of cases()) {
    const dealt = entrances.filter(Boolean).map((e) => e.entrance);
    for (let i = 1; i < dealt.length; i += 1) assert.notEqual(dealt[i], dealt[i - 1], `${name}: ${written(slots, entrances)}`);
  }
});

test('develop stays a minority, and two develops never sweep from the same side in a row', () => {
  for (const { name, slots, entrances } of cases()) {
    const dealt = entrances.filter(Boolean);
    const develops = dealt.filter((e) => e.entrance === 'develop');
    assert.ok(develops.length * 4 <= dealt.length + 2, `${name}: ${develops.length} of ${dealt.length}`);
    for (let i = 1; i < develops.length; i += 1) assert.notEqual(develops[i].from, develops[i - 1].from, `${name}: ${written(slots, entrances)}`);
    for (const e of dealt) {
      if (e.entrance === 'advance') assert.ok(['left', 'right'].includes(e.from), name);
      if (e.entrance === 'develop') assert.ok(['left', 'right', 'top'].includes(e.from), name);
    }
  }
});

test('a story of four framed slots or more has at least three kinds of arrival', () => {
  for (const { name, slots, entrances } of cases()) {
    const dealt = entrances.filter(Boolean).map((e) => e.entrance);
    if (dealt.length >= 4) assert.ok(new Set(dealt).size >= 3, `${name}: ${written(slots, entrances)}`);
  }
});

test('a pair shares its entrance; a diptych fires one shutter and a strip of film advances as one', () => {
  for (const { name, slots, entrances } of cases()) {
    slots.forEach((slot, i) => {
      const e = entrances[i];
      if (!e) return;
      if (slot.kind === 'DIPTYCH' && e.entrance === 'shutter') assert.equal(e.stagger, 0, name);
      if (e.entrance === 'advance') assert.equal(e.stagger, 0, name);
      assert.ok(e.stagger >= 0 && e.stagger <= 0.12, name);
    });
  }
});

test('the shutter is quick and mechanical; every picture reads as there within half a second', () => {
  const total = SHUTTER_MS.close + SHUTTER_MS.hold + SHUTTER_MS.open;
  assert.ok(total >= 450 && total <= 600, `shutter ${total}ms`);
  for (const entrance of ENTRANCES) {
    for (const phone of [false, true]) {
      for (const tall of [false, true]) assert.ok(revealMs({ entrance, phone, tall }) <= 500, `${entrance} ${phone} ${tall}`);
    }
  }
});
