// Run offline: node --experimental-strip-types --test scripts/story-chapters.test.mjs
//
// A Collection Story's sub-chapters (src/lib/storyChapters.ts): how a story's
// frames are grouped into the chapters the owner sets in Sanity (frame 01
// stays the cover, a chapter keeps his order, nothing is dropped, frames no
// chapter holds end the story as "More frames"), how the planner lays a
// chapter story out (src/lib/storyPlan.ts: an opener per chapter beside its
// first frame, no pair across two chapters, the quote never against an
// opener), the contents' state (which chapter is being read, where a jump
// lands), and the preview-only sample (src/lib/storyChaptersSample.ts). A
// story with no chapters is the story it was.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  MORE_FRAMES_TITLE,
  chapterAnchor,
  currentSection,
  frameSpan,
  glideSeconds,
  groupChapters,
  jumpTop,
} from '../src/lib/storyChapters.ts';
import { frameRatio, isLandscape, planStory, slotRows, storyBoxes, storyFrames, storyGrid } from '../src/lib/storyPlan.ts';
import { planEntrances } from '../src/lib/storyEntrance.ts';
import { SAMPLE_CHAPTERS_SLUG, sampleChapters, withSampleChapters } from '../src/lib/storyChaptersSample.ts';

const { collections } = JSON.parse(readFileSync(new URL('./fixtures/archive-2026-09-27.json', import.meta.url), 'utf8'));
const QUOTED = new Set(['miami', 'orlando', 'page', 'zion-national-park']);
// The fixture's photographs carry no ids; give each a stable one.
const withIds = (collection) => ({
  ...collection,
  photos: collection.photos.map((photo, index) => ({ ...photo, _id: `${collection.slug}-${index}` })),
});
const miami = withIds(collections.find((c) => c.slug === 'miami'));
const written = (slots) => slots.map((s) => `${s.kind}${s.frames.length ? `[${s.frames.map((f) => f + 1).join(',')}]` : ''}`).join(' ');
const ids = (frames) => frames.map((frame) => frame._id);

/** A story as MagazineLayout plans it (storyPlanFor). */
const planned = (collection) => {
  const { frames, sections } = groupChapters(storyFrames(collection.photos, collection.coverImageUrl), collection.chapters);
  const ratios = frames.map(frameRatio);
  return { frames, sections, ratios, slots: planStory(ratios, { hasQuote: QUOTED.has(collection.slug), sections }) };
};

test('no chapters: the story is the story it was', () => {
  for (const raw of collections) {
    const collection = withIds(raw);
    const frames = storyFrames(collection.photos, collection.coverImageUrl);
    const ratios = frames.map(frameRatio);
    const before = written(planStory(ratios, { hasQuote: QUOTED.has(collection.slug) }));
    for (const chapters of [undefined, null, [], [{ title: '' , photoIds: [frames[1]?._id] }], [{ title: 'Empty', photoIds: [] }], [{ title: 'Elsewhere', photoIds: ['not-this-story'] }]]) {
      const grouped = groupChapters(frames, chapters);
      assert.deepEqual(ids(grouped.frames), ids(frames), collection.slug);
      assert.deepEqual(grouped.sections, [], collection.slug);
      assert.equal(written(planStory(ratios, { hasQuote: QUOTED.has(collection.slug), sections: grouped.sections })), before, collection.slug);
    }
  }
});

test('chapters keep his order; frame 01 stays the cover; nothing is dropped', () => {
  const frames = storyFrames(miami.photos, miami.coverImageUrl);
  const f = ids(frames);
  const chapters = [
    // The cover listed in a chapter is not repeated there; a foreign id is
    // ignored; his order inside the chapter wins over Sanity's.
    { _key: 'k1', title: '  Night  on   Ocean Drive ', kicker: ' After dark ', intro: ' Two lines. ', photoIds: [f[5], f[0], 'elsewhere', f[3]] },
    // Empty once its photographs are taken: not printed, takes no number.
    { _key: 'k2', title: 'Taken', photoIds: [f[3]] },
    { _key: 'k1', title: 'Second', photoIds: [f[7], f[5], null, f[6]] },
    { title: 'Untitled is skipped', kicker: 'x' },
  ];
  const { frames: out, sections } = groupChapters(frames, chapters);
  assert.equal(out.length, frames.length);
  assert.deepEqual(new Set(ids(out)), new Set(f));
  assert.equal(out[0]._id, f[0]);
  assert.deepEqual(ids(out.slice(1, 3)), [f[5], f[3]]);
  assert.deepEqual(ids(out.slice(3, 5)), [f[7], f[6]]);
  // The rest, in the order they had.
  assert.deepEqual(ids(out.slice(5)), f.filter((id, index) => index > 0 && ![3, 5, 6, 7].includes(index)));
  assert.deepEqual(sections.map(({ no, title, kicker, intro, start, count }) => ({ no, title, kicker, intro, start, count })), [
    { no: 1, title: 'Night on Ocean Drive', kicker: 'After dark', intro: 'Two lines.', start: 1, count: 2 },
    { no: 2, title: 'Second', kicker: '', intro: '', start: 3, count: 2 },
    { no: null, title: MORE_FRAMES_TITLE, kicker: '', intro: '', start: 5, count: frames.length - 5 },
  ]);
  // Keys are unique and safe in an id; anchors carry the story.
  const keys = sections.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.match(key, /^[a-z0-9_-]+$/);
  assert.equal(chapterAnchor('new-york-stories', keys[0]), `story-new-york-stories-${keys[0]}`);
  // Everything placed: no "More frames".
  const all = groupChapters(frames, [{ _key: 'a', title: 'All', photoIds: f.slice(1) }]);
  assert.equal(all.sections.length, 1);
  assert.equal(all.sections[0].count, frames.length - 1);
});

test('the chapter plan: an opener per chapter at its first frame, every frame once, no pair across two', () => {
  let seed = 11;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cases = [];
  for (let n = 2; n <= 24; n += 1) {
    for (let k = 0; k < 10; k += 1) {
      const ratios = Array.from({ length: n }, () => (rand() < 0.5 ? 1.5 : 2 / 3));
      // Random cuts of frames 2..n.
      const sections = [];
      let start = 1;
      while (start < n) {
        const count = Math.min(n - start, 1 + Math.floor(rand() * 6));
        sections.push({ start, count });
        start += count;
      }
      for (const hasQuote of [true, false]) cases.push({ ratios, sections, hasQuote });
    }
  }
  for (const { ratios, sections, hasQuote } of cases) {
    const slots = planStory(ratios, { hasQuote, sections });
    const name = `${ratios.map((r) => (isLandscape(r) ? 'L' : 'P')).join('')} ${JSON.stringify(sections)}: ${written(slots)}`;
    assert.deepEqual(slots.flatMap((s) => s.frames), ratios.map((_, i) => i), name);
    assert.equal(slots[0].kind, 'OPEN', name);
    assert.equal(slots[1].kind, 'LEDE2', name);
    assert.equal(slots[1].frames.length, 0, name);
    assert.equal(slots.at(-1).kind, 'END', name);
    assert.ok(!slots.some((s) => s.kind === 'PART' || s.kind === 'LEDE'), name);
    const openers = slots.filter((s) => s.kind === 'CHAPTER');
    assert.deepEqual(openers.map((s) => s.section), sections.map((_, i) => i), name);
    assert.deepEqual(openers.map((s) => s.frames), sections.map((s) => [s.start]), name);
    const sectionOf = (frame) => sections.findIndex((s) => frame >= s.start && frame < s.start + s.count);
    for (let i = 1; i < slots.length; i += 1) {
      const s = slots[i];
      // No template twice running (a one-frame chapter's opener may follow
      // another's).
      if (s.kind !== 'CHAPTER') assert.notEqual(s.kind, slots[i - 1].kind, name);
      if (s.frames.length === 2) assert.equal(sectionOf(s.frames[0]), sectionOf(s.frames[1]), name);
      assert.ok(s.frames.length <= 2, name);
      if (s.frames.length > 1) assert.equal(s.kind, 'PAIR', name);
      // The quote is never set against an opener or the end page.
      if (s.kind === 'QUOTE') assert.ok(slots[i + 1].frames.length > 0 && slots[i + 1].kind !== 'CHAPTER', name);
    }
    assert.deepEqual(slotRows(slots).flat(), ratios.map((_, i) => i), name);
    // Every framed slot is dealt an entrance.
    const entrances = planEntrances(slots, ratios);
    slots.forEach((s, i) => assert.equal(entrances[i] === null, s.kind === 'OPEN' || s.frames.length === 0, name));
  }
  // Sections that do not hold frames 2..n once each are not a chapter plan.
  const ratios = [1.5, 1.5, 0.66, 1.5, 0.66];
  const plain = written(planStory(ratios));
  for (const bad of [[{ start: 2, count: 3 }], [{ start: 1, count: 2 }], [{ start: 1, count: 2 }, { start: 2, count: 2 }], [{ start: 1, count: 5 }]]) {
    assert.equal(written(planStory(ratios, { sections: bad })), plain, JSON.stringify(bad));
  }
});

test('an opener sits in columns 4–7 with its first frame hung at the right, on one screen', () => {
  for (const [W, H] of [[1728, 1000], [1280, 800], [1024, 768]]) {
    const g = storyGrid(W, H);
    for (const ratio of [1.5, 2 / 3, 1, 2.4, 0.5]) {
      const ratios = [1.5, ratio, 1.5];
      const slots = planStory(ratios, { sections: [{ start: 1, count: 2 }] });
      const box = storyBoxes(slots, ratios, W, H).find((b) => b.slot.kind === 'CHAPTER');
      const [frame] = box.frames;
      const [words] = box.text;
      assert.equal(words.role, 'chapter');
      assert.ok(Math.abs(words.x.v - g.colX(4).v) < 0.01);
      // The frame ends at the right margin, clear of the words, whole on screen.
      assert.ok(Math.abs(frame.x.v + frame.w.v - g.fieldEnd.v) < 0.01, `${W} ${ratio}`);
      assert.ok(frame.x.v >= words.x.v + words.w.v + g.G.v - 0.01, `${W} ${ratio}`);
      assert.ok(frame.h.v <= g.Hmax.v + 0.01, `${W} ${ratio}`);
      assert.ok(Math.abs(frame.w.v / frame.h.v - ratio) < 1e-6);
      // A longer pause than a slot's gap.
      assert.ok(box.top.v > g.gap.v);
    }
  }
});

test('the chapter being read, and where a jump lands', () => {
  const tops = [1200, 3400, 6100];
  assert.equal(currentSection(tops, 0), -1);
  assert.equal(currentSection(tops, 1199), -1);
  assert.equal(currentSection(tops, 1200), 0);
  assert.equal(currentSection(tops, 3399), 0);
  assert.equal(currentSection(tops, 5000), 1);
  assert.equal(currentSection(tops, 99999), 2);
  // A chapter not laid out never becomes current.
  assert.equal(currentSection([1200, Infinity, 6100], 5000), 0);
  // The opener lands under the head (and the phone's row), within reach.
  assert.equal(jumpTop(3400, 104, 90000), 3296);
  assert.equal(jumpTop(40, 104, 90000), 0);
  assert.equal(jumpTop(6100, 104, 5000), 5000);
  // A jump lands with the reading line inside its chapter.
  const view = 1000;
  for (const [index, top] of tops.entries()) {
    const at = jumpTop(top, 44 + 60, 90000);
    assert.equal(currentSection(tops, at + view * 0.48), index);
  }
  assert.equal(frameSpan({ start: 1, count: 5 }), '02–06');
  assert.equal(frameSpan({ start: 6, count: 1 }), '07');
  assert.ok(glideSeconds(200) >= 0.55 && glideSeconds(200) < 0.6);
  assert.equal(glideSeconds(-60000), 1.1);
});

test('the preview sample: Miami in three placeholder chapters, off unless asked for', () => {
  const chapters = sampleChapters(miami);
  assert.equal(chapters.length, 3);
  assert.deepEqual(chapters.map((c) => c.title), ['Sample chapter one', 'Sample chapter two', 'Sample chapter three']);
  // 14 frames after the cover: 5 + 4 + 3, and two left for "More frames".
  assert.deepEqual(chapters.map((c) => c.photoIds.length), [5, 4, 3]);
  const { frames, sections } = planned({ ...miami, chapters });
  assert.deepEqual(sections.map((s) => [s.no, s.title, s.start, s.count]), [
    [1, 'Sample chapter one', 1, 5],
    [2, 'Sample chapter two', 6, 4],
    [3, 'Sample chapter three', 10, 3],
    [null, MORE_FRAMES_TITLE, 13, 2],
  ]);
  // The sample keeps Miami's own order: only the openers are new.
  assert.deepEqual(ids(frames), ids(storyFrames(miami.photos, miami.coverImageUrl)));
  // The flag.
  const saved = process.env.STORY_CHAPTERS_SAMPLE;
  try {
    delete process.env.STORY_CHAPTERS_SAMPLE;
    assert.equal(withSampleChapters(miami), miami);
    process.env.STORY_CHAPTERS_SAMPLE = '1';
    assert.equal(SAMPLE_CHAPTERS_SLUG, 'miami');
    assert.deepEqual(withSampleChapters(miami).chapters, chapters);
    const orlando = withIds(collections.find((c) => c.slug === 'orlando'));
    assert.equal(withSampleChapters(orlando), orlando);
    // His own chapters are never replaced.
    const own = { ...miami, chapters: [{ _key: 'x', title: 'His', photoIds: [miami.photos[1]._id] }] };
    assert.equal(withSampleChapters(own), own);
    assert.equal(withSampleChapters(null), null);
  } finally {
    if (saved === undefined) delete process.env.STORY_CHAPTERS_SAMPLE;
    else process.env.STORY_CHAPTERS_SAMPLE = saved;
  }
});
