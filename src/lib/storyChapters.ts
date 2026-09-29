// ── A Collection Story's sub-chapters ──
// The owner (2026-09-28): 其实有不少热门的collection story我打算在打开的内部，再做
// 几个小章节，因为我有不少的主题和很多照片想放进来，你可以提前规划一下，在里面做
// 一个小目录什么的. A collection may carry an ordered list of chapters in
// Sanity (ryan/schemaTypes/collection.ts, `chapters`): each a title, an
// optional kicker and intro, and the photographs it holds, in the order he
// set them. The story then reads: the opening spread (frame 01, the cover, as
// always), the story's own introduction, and the chapters in order, each
// opened by a quiet opener (its number, title and intro) beside its first
// frame; a small numbered contents list lets the reader jump between them.
//
// Frames no chapter holds are never dropped: they follow the last chapter as
// one more group, "More frames", unnumbered. At the end rather than first,
// because the chapters are the part he has edited and the rest is what he has
// not sorted yet — a story he is still chaptering reads as chapters with a
// remainder, not as a remainder with chapters after it.
//
// Rules, all here so they are tested once (scripts/story-chapters.test.mjs):
// - frame 01 is the cover on the opening spread whatever chapter lists it; a
//   chapter never repeats it;
// - a photograph listed twice goes to its first chapter;
// - a reference to a photograph that is not this story's (or no longer
//   exists) is ignored;
// - a chapter left with no photographs is not printed (a title with nothing
//   under it would be an empty page) and does not take a number;
// - with no chapter left, the story is exactly the story it was: same frames,
//   same order, no contents.
//
// Pure and free of the DOM, so the server prints the final page and the
// planner (src/lib/storyPlan.ts) and the tests read the same result.

export interface ChapterInput {
  /** Sanity's array key: stable across edits, used for the anchor. */
  _key?: string | null;
  title?: string | null;
  /** Optional: a shorter title for the contents list and the phone's row. */
  shortTitle?: string | null;
  kicker?: string | null;
  intro?: string | null;
  /** The chapter's photographs as document ids, in his order. */
  photoIds?: ReadonlyArray<string | null | undefined> | null;
}

export interface StorySection {
  /** Stable key (React, the anchor): the Sanity key, or 'more'. */
  key: string;
  /** The chapter's number as printed, from 1; null for "More frames". */
  no: number | null;
  title: string;
  /** The title as the contents prints it: his short title, or the title. */
  short: string;
  kicker: string;
  intro: string;
  /** Its frames in the story's reading order: [start, start + count). */
  start: number;
  count: number;
}

export interface GroupedFrames<T> {
  frames: T[];
  /** Empty when the story has no chapters to print. */
  sections: StorySection[];
}

/** PROPOSED copy awaiting the owner: the title of the group of frames no
 *  chapter holds, the contents list's heading, and the word before a part's
 *  number ("Part III"). */
export const MORE_FRAMES_TITLE = 'More frames';
export const CONTENTS_LABEL = 'Contents';
export const PART_LABEL = 'Part';

const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** An anchor-safe key, unique within the story. */
function keyFor(raw: string, used: Set<string>): string {
  const base = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'chapter';
  let key = base;
  for (let n = 2; used.has(key); n += 1) key = `${base}-${n}`;
  used.add(key);
  return key;
}

/**
 * The story's frames in chapter order, and its sections. `frames` is the
 * story's reading order as storyFrames() gives it (frame 01 first); the
 * result keeps frame 01 first, then each printed chapter's photographs in its
 * own order, then every frame no chapter holds, in the order it had.
 */
export function groupChapters<T extends { _id?: string }>(
  frames: readonly T[],
  chapters: readonly ChapterInput[] | null | undefined,
): GroupedFrames<T> {
  const all = [...frames];
  if (!Array.isArray(chapters) || chapters.length === 0 || all.length < 2) return { frames: all, sections: [] };
  const at = new Map<string, number>();
  all.forEach((frame, index) => {
    if (index > 0 && typeof frame?._id === 'string' && !at.has(frame._id)) at.set(frame._id, index);
  });
  const placed = new Set<number>([0]);
  const used = new Set<string>();
  const ordered: T[] = [all[0]];
  const sections: StorySection[] = [];
  for (const chapter of chapters) {
    const title = text(chapter?.title);
    if (!title) continue;
    const members: number[] = [];
    for (const id of chapter.photoIds ?? []) {
      const index = typeof id === 'string' ? at.get(id) : undefined;
      if (index === undefined || placed.has(index)) continue;
      placed.add(index);
      members.push(index);
    }
    if (members.length === 0) continue;
    sections.push({
      key: keyFor(text(chapter._key) || `chapter-${sections.length + 1}`, used),
      no: sections.length + 1,
      title,
      short: text(chapter.shortTitle) || title,
      kicker: text(chapter.kicker),
      intro: text(chapter.intro),
      start: ordered.length,
      count: members.length,
    });
    for (const index of members) ordered.push(all[index]);
  }
  if (sections.length === 0) return { frames: all, sections: [] };
  const rest = all.flatMap((frame, index) => (placed.has(index) ? [] : [frame]));
  if (rest.length > 0) {
    sections.push({
      key: keyFor('more', used),
      no: null,
      title: MORE_FRAMES_TITLE,
      short: MORE_FRAMES_TITLE,
      kicker: '',
      intro: '',
      start: ordered.length,
      count: rest.length,
    });
    ordered.push(...rest);
  }
  return { frames: ordered, sections };
}

const pad2 = (value: number) => String(value).padStart(2, '0');

const ROMAN: ReadonlyArray<[number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** A part's number as printed: I, II, III, IV … ('' for none). */
export function roman(value: number | null | undefined): string {
  let rest = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  if (rest < 1 || rest > 3999) return rest >= 1 ? String(rest) : '';
  let out = '';
  for (const [size, letters] of ROMAN) {
    while (rest >= size) {
      out += letters;
      rest -= size;
    }
  }
  return out;
}

/** 'zh' when a title is written in Chinese (so its tracking opens to 0 and a
 *  screen reader reads it as Chinese), otherwise undefined. */
export function titleLang(value: string): 'zh' | undefined {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(value) ? 'zh' : undefined;
}

/** The frames a section holds, as its captions number them: "02–06", or
 *  "07" for one. */
export function frameSpan(section: Pick<StorySection, 'start' | 'count'>): string {
  const first = section.start + 1;
  const last = section.start + section.count;
  return last > first ? `${pad2(first)}–${pad2(last)}` : pad2(first);
}

/** The chapter the reader is in: the last whose opener's top has reached the
 *  reading line, or -1 before the first. `tops` are the openers' tops in the
 *  story's scroller, in order; the line is in the same space. */
export function currentSection(tops: readonly number[], line: number): number {
  let current = -1;
  tops.forEach((top, index) => {
    if (Number.isFinite(top) && top <= line) current = index;
  });
  return current;
}

/** Where a jump to an opener at `top` leaves the scroller: the opener `inset`
 *  under the top of the screen (under the running head and, on the phone,
 *  the contents row), within what the scroller can reach. */
export function jumpTop(top: number, inset: number, maxScroll: number): number {
  return Math.round(Math.min(Math.max(0, maxScroll), Math.max(0, top - inset)));
}

/** How long a jump glides (seconds): a short hop reads as one move, a long
 *  one takes a little longer without dragging. */
export function glideSeconds(distance: number): number {
  return Math.min(1.1, 0.55 + Math.abs(distance) / 9000);
}

/** The section a page's address names (/works/miami/#story-miami-…): its
 *  index, or -1. A shared chapter link, or a contents link opened in a new
 *  tab, lands on its chapter. */
export function sectionFromHash(
  hash: string | null | undefined,
  slug: string | undefined,
  sections: ReadonlyArray<Pick<StorySection, 'key'>>,
): number {
  if (!hash || hash.length < 2) return -1;
  let id = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    id = decodeURIComponent(id);
  } catch {
    // A malformed escape: compare it as written.
  }
  return sections.findIndex((section) => chapterAnchor(slug, section.key) === id);
}

/** Where the contents stands, and how visible it is, on desktop, where it
 *  rides up with the paper under the kept stub (pinned at the foot of the
 *  rail) before it pins under the running head. All in screen pixels: its
 *  top as laid out (`naturalTop`, the track's top plus its padding, less the
 *  scroll), the top it pins at, its height, and the stub's top edge. It
 *  shows only once it has cleared the stub, fading in over `fade` pixels of
 *  travel (less, if it pins sooner), so no row is ever read half under the
 *  stub; pinned (or carried off at the end), it is whole. */
export function contentsOpacity({
  naturalTop,
  stickyTop,
  height,
  stubTop,
  clearance = 16,
  fade = 96,
}: {
  naturalTop: number;
  stickyTop: number;
  height: number;
  stubTop: number;
  clearance?: number;
  fade?: number;
}): number {
  if (!Number.isFinite(naturalTop) || !Number.isFinite(stubTop)) return 1;
  if (naturalTop <= stickyTop) return 1;
  const room = stubTop - clearance - (naturalTop + height);
  // Whole by the time it pins, however little room a long list leaves
  // between the head and the stub: no step where it pins.
  const span = Math.max(1, Math.min(fade, stubTop - clearance - (stickyTop + height)));
  return Math.min(1, Math.max(0, room / span));
}

/** The contents' label ("Contents") while a screen-high photograph passes
 *  over the pinned list, as it passes over the stub. The photograph covers
 *  the rows from the bottom up; the label, above the list's top rule, would
 *  be left alone over the photograph for the last few pixels. It goes with
 *  the list instead: it fades over the `fade` pixels before the photograph's
 *  top edge reaches the list's top rule and stays hidden while the
 *  photograph covers that rule. Once the photograph's foot has risen past
 *  the rule the label is whole again (it is still under the photograph
 *  then, and is uncovered by it as the rows were). `covers` are the
 *  screens' [top, bottom] on screen, in pixels. */
export function contentsLabelOpacity(
  covers: ReadonlyArray<readonly [number, number]>,
  listTop: number,
  fade = 24,
): number {
  let opacity = 1;
  for (const [top, bottom] of covers) {
    if (bottom <= listTop || top >= listTop + fade) continue;
    opacity = Math.min(opacity, top <= listTop ? 0 : (top - listTop) / Math.max(1, fade));
  }
  return Math.max(0, Math.min(1, opacity));
}

/** The anchor of a section's opener. The story's slug keeps two stories'
 *  anchors apart during a page turn, when both are briefly in the document. */
export function chapterAnchor(slug: string | undefined, key: string): string {
  const story = (slug ?? 'story').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return `story-${story}-${key}`;
}
