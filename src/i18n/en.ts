// The English dictionary: the source of truth for the key set (every key
// here must be in zh.ts with the same {placeholders}: scripts/i18n.test.mjs).
// One part per area of the site, side by side with its Chinese.

import * as core from './parts/core.ts';
import * as home from './parts/home.ts';
import * as story from './parts/story.ts';
import * as travel from './parts/travel.ts';
import * as about from './parts/about.ts';
import * as notes from './parts/notes.ts';

export const en = {
  ...core.en,
  ...home.en,
  ...story.en,
  ...travel.en,
  ...about.en,
  ...notes.en,
};
