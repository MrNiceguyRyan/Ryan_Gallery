/**
 * One-time data hygiene for collections.
 *
 *   node scripts/cleanup-collections.mjs              (DRY RUN — reports only)
 *   node scripts/cleanup-collections.mjs --apply      (trim whitespace names)
 *   node scripts/cleanup-collections.mjs --apply --delete-empty --ids=<id,id>
 *                                                     (delete only the listed
 *                                                      photo-less collections)
 *
 * Requires: SANITY_TOKEN env var for Sanity reads/writes.
 *
 * Fixes surfaced by the audit:
 *   - "New York " → "New York"  (trailing-space name)
 *   - empty duplicate "Orlando" + empty "Arizona"  (0 photos → noise in the
 *     homepage region clustering)
 *
 * Deleting is destructive and gated behind --apply, --delete-empty, and an
 * explicit --ids list. It only ever touches listed collections with exactly 0
 * referencing photos.
 */
import { createClient } from '@sanity/client';

const SANITY_TOKEN = process.env.SANITY_TOKEN;

const APPLY = process.argv.includes('--apply');
const DELETE_EMPTY = process.argv.includes('--delete-empty');
const IDS_ARG = process.argv.find((arg) => arg.startsWith('--ids='));
const DELETE_IDS = new Set(
  IDS_ARG
    ? IDS_ARG.slice('--ids='.length).split(',').map((id) => id.trim()).filter(Boolean)
    : []
);

if (!SANITY_TOKEN) {
  console.error('Missing SANITY_TOKEN. Set a Sanity token in the environment before cleaning collections.');
  process.exit(1);
}

const sanity = createClient({
  projectId: 'z610fooo',
  dataset: 'production',
  apiVersion: '2024-03-16',
  token: SANITY_TOKEN,
  useCdn: false,
});

async function main() {
  console.log(`\n🧹 Collection cleanup  ${APPLY ? '(APPLY)' : '(DRY RUN — no writes)'}${DELETE_EMPTY ? ` +delete-empty (${DELETE_IDS.size} explicit id${DELETE_IDS.size === 1 ? '' : 's'})` : ''}\n`);

  const cols = await sanity.fetch(
    `*[_type == "collection"]{ _id, name, region, "n": count(*[_type=="photo" && references(^._id)]) } | order(name asc)`,
  );

  const trims = [];
  const empties = [];
  for (const c of cols) {
    const trimmed = (c.name || '').trim();
    const flags = [];
    if (trimmed !== c.name) { flags.push(`trim → "${trimmed}"`); trims.push({ c, trimmed }); }
    if (c.n === 0) { flags.push('EMPTY (0 photos)'); empties.push(c); }
    console.log(`   ${String(c.n).padStart(3)} photos · ${(c.region || '—').padEnd(12)} · "${c.name}"${flags.length ? '   ⟶ ' + flags.join(', ') : ''}`);
  }

  console.log(`\n   ${trims.length} name(s) to trim · ${empties.length} empty collection(s)\n`);

  if (!APPLY) {
    console.log('   Re-run with --apply to trim names; add --delete-empty --ids=<collectionId,...> to remove specific empties.\n');
    return;
  }

  for (const { c, trimmed } of trims) {
    await sanity.patch(c._id).set({ name: trimmed }).commit();
    console.log(`   ✓ trimmed "${c.name}" → "${trimmed}"`);
  }

  if (DELETE_EMPTY) {
    if (DELETE_IDS.size === 0) {
      console.error('   Refusing to delete empty collections without explicit --ids=<collectionId,...>.');
      process.exit(1);
    }
    for (const c of empties) {
      if (!DELETE_IDS.has(c._id)) {
        console.log(`   ⏭ left empty collection "${c.name}" (${c._id}) — not listed in --ids`);
        continue;
      }
      await sanity.delete(c._id);
      console.log(`   ✓ deleted empty collection "${c.name}" (${c._id})`);
    }
  } else if (empties.length) {
    console.log('   (empties left in place — add --delete-empty --ids=<collectionId,...> to remove specific empties)');
  }
  console.log('\n   ✅ Done.\n');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
