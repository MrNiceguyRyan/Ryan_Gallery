import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = {
  upload: readFileSync(new URL('./upload-photos.mjs', import.meta.url), 'utf8'),
  backfill: readFileSync(new URL('./backfill-region.mjs', import.meta.url), 'utf8'),
  cleanup: readFileSync(new URL('./cleanup-collections.mjs', import.meta.url), 'utf8'),
  layout: readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8'),
};

for (const [name, source] of Object.entries(files)) {
  assert.doesNotMatch(source, /sk[A-Za-z0-9]{60,}/, `${name} contains a checked-in long-lived token`);
  assert.doesNotMatch(source, /process\.env\.SANITY_TOKEN\s*\|\|/, `${name} falls back from SANITY_TOKEN to another value`);
}

for (const [name, source] of Object.entries({
  upload: files.upload,
  backfill: files.backfill,
  cleanup: files.cleanup,
})) {
  assert.match(source, /const SANITY_TOKEN = requireEnv\('SANITY_TOKEN'\);/, `${name} must require SANITY_TOKEN from the environment`);
}

assert.match(files.upload, /await uploadCity\(stateName, '\.', stateName\);/, 'direct state-folder uploads must use the state name for collection metadata');
assert.doesNotMatch(files.upload, /findOrCreateCollection\(cityFolderName, stateName\)/, 'uploadCity must not create a "." collection for direct folders');

assert.match(files.cleanup, /--ids=<collectionId,\.\.\.>/, 'cleanup delete usage must require an explicit ID allow-list');
assert.match(files.cleanup, /APPLY && DELETE_EMPTY && DELETE_IDS\.size === 0/, 'cleanup must refuse broad empty deletes');
assert.doesNotMatch(files.cleanup, /for \(const c of empties\) \{\s*await sanity\.delete/s, 'cleanup must not delete every empty collection');

assert.match(files.layout, /serializeJsonLd\(schema\)/, 'Layout must escape JSON-LD before set:html');
assert.doesNotMatch(files.layout, /set:html=\{JSON\.stringify\(schema\)\}/, 'Layout must not inject raw JSON.stringify into script HTML');
