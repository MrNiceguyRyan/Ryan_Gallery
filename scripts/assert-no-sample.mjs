#!/usr/bin/env node
// ── No preview sample in production ──
// A preview build can print placeholder content so the owner can see a design
// before he writes a word: STORY_CHAPTERS_SAMPLE=1 (a story in placeholder
// chapters, src/lib/storyChaptersSample.ts) and NOTES_SAMPLE=1 (a sample note,
// src/lib/notesData.ts), both set by `npm run build:sample`. Such a build
// stamps <html data-story-sample> / <html data-notes-sample>
// (src/layouts/Layout.astro). Production is a local `npm run build` followed
// by `npx wrangler deploy` of whatever is in dist/, so a sample build pushed
// to the preview worker and then deployed as it stands would ship "Sample
// chapter one" to ryanxugallery.com.
//
// wrangler runs this before every deploy (wrangler.jsonc, `build.command`):
//   node scripts/assert-no-sample.mjs            production: exits 1 on a sample build
//   node scripts/assert-no-sample.mjs --preview  the preview worker: reports it, exits 0
// Fix a refusal with `npm run build` (no flags), then deploy again.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const preview = process.argv.includes('--preview');
const dist = process.env.ASSERT_DIST_DIR ?? fileURLToPath(new URL('../dist/', import.meta.url));

/** Every .html file under a directory. */
function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(path));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

/** The samples a built page carries: the stamps on its <html> tag, and the
 *  placeholder text itself as a second net. */
export function samplesIn(html) {
  const found = new Set();
  const tag = /<html\b[^>]*>/i.exec(html)?.[0] ?? '';
  if (/\sdata-story-sample(?=[\s=>])/.test(tag)) found.add('story chapters (STORY_CHAPTERS_SAMPLE=1)');
  if (/\sdata-notes-sample(?=[\s=>])/.test(tag)) found.add('notes (NOTES_SAMPLE=1)');
  if (html.includes('Sample chapter one')) found.add('story chapters (placeholder text)');
  return found;
}

function main() {
  if (!existsSync(dist)) {
    console.error(`assert-no-sample: ${dist} does not exist. Run \`npm run build\` first.`);
    return 1;
  }
  const found = new Map();
  for (const file of htmlFiles(dist)) {
    for (const sample of samplesIn(readFileSync(file, 'utf8'))) {
      if (!found.has(sample)) found.set(sample, file.slice(dist.length));
    }
  }
  if (existsSync(join(dist, 'notes', 'sample'))) found.set('notes (/notes/sample/)', 'notes/sample/');
  if (found.size === 0) {
    console.log('assert-no-sample: dist/ has no preview sample.');
    return 0;
  }
  const list = [...found].map(([sample, file]) => `  - ${sample}, e.g. ${file}`).join('\n');
  if (preview) {
    console.log(`assert-no-sample: preview build with samples (allowed on the preview worker):\n${list}`);
    return 0;
  }
  console.error(
    `assert-no-sample: REFUSED. dist/ was built with a preview-only sample:\n${list}\n`
    + 'Production must never ship it. Rebuild with `npm run build` (no sample flags) and deploy again.',
  );
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
