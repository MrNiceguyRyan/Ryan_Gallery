/**
 * One-time data hygiene for collections.
 *
 *   node scripts/cleanup-collections.mjs              (DRY RUN — reports only)
 *   node scripts/cleanup-collections.mjs --apply      (trim whitespace names)
 *   node scripts/cleanup-collections.mjs --apply --delete-id=<collectionId>
 *                                                     (delete one known empty
 *                                                      collection — destructive)
 *
 * Fixes surfaced by the audit:
 *   - "New York " → "New York"  (trailing-space name)
 *   - empty duplicate "Orlando" + empty "Arizona"  (0 photos → noise in the
 *     homepage region clustering)
 *
 * Requires: SANITY_TOKEN env var.
 *
 * Deleting is destructive and gated behind BOTH --apply and explicit
 * --delete-id=<collectionId> arguments, and only ever touches collections with
 * exactly 0 referencing photos.
 */
import { createClient } from '@sanity/client';

const SANITY_TOKEN = process.env.SANITY_TOKEN;

const APPLY = process.argv.includes('--apply');
const DELETE_IDS = process.argv
  .filter((arg) => arg.startsWith('--delete-id='))
  .map((arg) => arg.slice('--delete-id='.length).trim())
  .filter(Boolean);

if (!SANITY_TOKEN) {
  console.error('Fatal: SANITY_TOKEN environment variable is required for Sanity access.');
  process.exit(1);
}

if (process.argv.includes('--delete-empty')) {
  console.error('Fatal: --delete-empty was removed. Pass explicit --delete-id=<collectionId> values after reviewing the dry run.');
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
  console.log(`\n🧹 Collection cleanup  ${APPLY ? '(APPLY)' : '(DRY RUN — no writes)'}${DELETE_IDS.length ? ` +delete-id x${DELETE_IDS.length}` : ''}\n`);

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
    console.log('   Re-run with --apply to trim names; pass explicit --delete-id=<collectionId> after review to remove one empty collection.\n');
    return;
  }

  for (const { c, trimmed } of trims) {
    await sanity.patch(c._id).set({ name: trimmed }).commit();
    console.log(`   ✓ trimmed "${c.name}" → "${trimmed}"`);
  }

  if (DELETE_IDS.length) {
    const emptyById = new Map(empties.map((c) => [c._id, c]));
    for (const id of DELETE_IDS) {
      const c = emptyById.get(id);
      if (!c) {
        throw new Error(`Refusing to delete "${id}": not found or not empty in the dry-run result`);
      }
      await sanity.delete(c._id);
      console.log(`   ✓ deleted empty collection "${c.name}" (${c._id})`);
    }
  } else if (empties.length) {
    console.log('   (empties left in place — pass explicit --delete-id=<collectionId> after review to remove one)');
  }
  console.log('\n   ✅ Done.\n');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
