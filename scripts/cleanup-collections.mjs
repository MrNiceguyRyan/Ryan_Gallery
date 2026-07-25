/**
 * One-time data hygiene for collections.
 *
 *   node scripts/cleanup-collections.mjs              (DRY RUN — reports only)
 *   node scripts/cleanup-collections.mjs --apply      (trim whitespace names)
 *   node scripts/cleanup-collections.mjs --apply --delete-empty --ids=<id,...>
 *                                                     (delete ONLY the listed
 *                                                      empty collections)
 *
 * Fixes surfaced by the audit:
 *   - "New York " → "New York"  (trailing-space name)
 *   - empty duplicate "Orlando" + empty "Arizona"  (0 photos → noise in the
 *     homepage region clustering)
 *
 * Deleting is destructive and gated behind --apply, --delete-empty, AND an
 * explicit --ids=<collectionId,...> allowlist. Only collections with exactly
 * 0 referencing photos that appear in that allowlist are deleted.
 */
import { createClient } from '@sanity/client';

const SANITY_TOKEN = process.env.SANITY_TOKEN;
if (!SANITY_TOKEN) {
  console.error('Missing SANITY_TOKEN env var. Set it before running mutation scripts.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DELETE_EMPTY = process.argv.includes('--delete-empty');
const idsArg = process.argv.find((a) => a.startsWith('--ids='));
const DELETE_IDS = idsArg
  ? idsArg
      .slice('--ids='.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

const sanity = createClient({
  projectId: 'z610fooo',
  dataset: 'production',
  apiVersion: '2024-03-16',
  token: SANITY_TOKEN,
  useCdn: false,
});

async function main() {
  console.log(`\n🧹 Collection cleanup  ${APPLY ? '(APPLY)' : '(DRY RUN — no writes)'}${DELETE_EMPTY ? ' +delete-empty' : ''}\n`);

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
    console.log('   Re-run with --apply to trim names; add --delete-empty --ids=<id,...> to remove specific empties.\n');
    return;
  }

  for (const { c, trimmed } of trims) {
    await sanity.patch(c._id).set({ name: trimmed }).commit();
    console.log(`   ✓ trimmed "${c.name}" → "${trimmed}"`);
  }

  if (DELETE_EMPTY) {
    if (!DELETE_IDS.length) {
      console.error(
        'Refusing to delete empty collections without an explicit --ids=<collectionId,...> allowlist.',
      );
      process.exit(1);
    }
    const allow = new Set(DELETE_IDS);
    let deleted = 0;
    for (const c of empties) {
      if (!allow.has(c._id)) continue;
      await sanity.delete(c._id);
      deleted++;
      console.log(`   ✓ deleted empty collection "${c.name}" (${c._id})`);
    }
    const skipped = DELETE_IDS.filter((id) => !empties.some((c) => c._id === id));
    if (skipped.length) {
      console.log(`   ⚠ --ids not deleted (missing or not empty): ${skipped.join(', ')}`);
    }
    console.log(`   Deleted ${deleted} empty collection(s) from allowlist.`);
  } else if (empties.length) {
    console.log('   (empties left in place — add --delete-empty --ids=<id,...> to remove them)');
  }
  console.log('\n   ✅ Done.\n');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
