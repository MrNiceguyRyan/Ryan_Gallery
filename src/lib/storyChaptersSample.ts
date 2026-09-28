// ── STORY_CHAPTERS_SAMPLE=1: sub-chapters shown on a preview build only ──
// The owner will split some Collection Stories into sub-chapters in Sanity
// (ryan/schemaTypes/collection.ts, `chapters`). Until he has written any, a
// PREVIEW build can print one story — Miami — as three obviously placeholder
// chapters, so he can see the contents list, the openers and the jump before
// he writes a word:
//
//   npm run build:sample   (NOTES_SAMPLE=1 STORY_CHAPTERS_SAMPLE=1 astro build)
//
// Production builds never set it (`npm run build` alone, the deploy flow): the
// flag is read here, at build time, on the server. A sample build stamps
// <html data-story-sample>, and wrangler refuses to deploy such a dist/ to
// production (wrangler.jsonc `build.command`, scripts/assert-no-sample.mjs);
// the preview worker takes it. It changes nothing in Sanity. A story that
// already has chapters of its own is left as he wrote it, flag or not.
//
// The sample splits Miami's frames after frame 01 (the cover, which stays on
// the opening spread) into chapters of about 40%, 35% and 25%, and leaves the
// last two frames out of every chapter on purpose: they show where frames no
// chapter holds go (the "More frames" group at the end). The titles and intros
// say they are placeholders; none of it is copy for the site.
import type { ChapterInput } from './storyChapters.ts';
import { storyFrames, type StoryPhotoLike } from './storyPlan.ts';

export const SAMPLE_CHAPTERS_SLUG = 'miami';

/** Whether this is a STORY_CHAPTERS_SAMPLE=1 build. Such a build stamps
 *  <html data-story-sample> (src/layouts/Layout.astro), and
 *  scripts/assert-no-sample.mjs, which wrangler runs before every deploy,
 *  refuses to send its dist/ to production. Server only. */
export const isStorySampleBuild = () => process.env.STORY_CHAPTERS_SAMPLE === '1';

interface SampleStory {
  slug?: string;
  coverImageUrl?: string;
  photos?: ReadonlyArray<StoryPhotoLike & { _id?: string }> | null;
  chapters?: ChapterInput[] | null;
}

/** Three placeholder chapters over a story's frames, or null when it has too
 *  few frames to split. Pure (scripts/story-chapters.test.mjs). */
export function sampleChapters(story: SampleStory): ChapterInput[] | null {
  const ids = storyFrames(story.photos ?? [], story.coverImageUrl)
    .slice(1)
    .map((photo) => photo._id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length < 4) return null;
  const outside = ids.length >= 8 ? 2 : 0;
  const body = ids.length - outside;
  const one = Math.max(1, Math.round(body * 0.4));
  const two = Math.max(1, Math.round(body * 0.35));
  const three = Math.max(1, body - one - two);
  const first = body - two - three;
  return [
    {
      _key: 'sample-one',
      title: 'Sample chapter one',
      kicker: 'Sample kicker',
      intro: 'Placeholder intro: a sentence or two that opens this chapter. It is written in Sanity with the chapter, and can be left out.',
      photoIds: ids.slice(0, first),
    },
    {
      _key: 'sample-two',
      title: 'Sample chapter two',
      intro: 'Placeholder intro, with no kicker above the title.',
      photoIds: ids.slice(first, first + two),
    },
    {
      _key: 'sample-three',
      title: 'Sample chapter three',
      photoIds: ids.slice(first + two, body),
    },
  ];
}

let announced = false;

/** The collection as the page prints it: with the sample chapters when this
 *  is a STORY_CHAPTERS_SAMPLE=1 build and the story is the sample's and has
 *  none of its own; otherwise exactly as Sanity sent it. Server only. */
export function withSampleChapters<T extends SampleStory | null | undefined>(collection: T): T {
  if (!isStorySampleBuild()) return collection;
  if (!collection || collection.slug !== SAMPLE_CHAPTERS_SLUG) return collection;
  if (Array.isArray(collection.chapters) && collection.chapters.length > 0) return collection;
  const chapters = sampleChapters(collection);
  if (!chapters) return collection;
  if (!announced) {
    announced = true;
    console.info(`STORY_CHAPTERS_SAMPLE=1: "${SAMPLE_CHAPTERS_SLUG}" is printed with three placeholder chapters (preview only).`);
  }
  return { ...collection, chapters };
}
