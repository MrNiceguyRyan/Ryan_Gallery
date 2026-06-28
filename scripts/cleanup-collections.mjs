/**
 * One-time data hygiene for collections.
 *
 *   node scripts/cleanup-collections.mjs              (DRY RUN — reports only)
 *   node scripts/cleanup-collections.mjs --apply      (trim whitespace names)
 *   node scripts/cleanup-collections.mjs --apply --delete-empty --slug=orlando
 *                                                     (delete explicit photo-less
 *                                                      collections — destructive)
 *
 * Fixes surfaced by the audit:
 *   - "New York " → "New York"  (trailing-space name)
 *   - empty duplicate "Orlando" + empty "Arizona"  (0 photos → noise in the
 *     homepage region clustering)
 *
 * Deleting is destructive and gated behind --apply, --delete-empty, and explicit
 * --id=<collectionId> / --slug=<slug> targets. It only deletes those targets
 * when they have exactly 0 referencing photos.
 */
import { createClient } from '@sanity/client';

const SANITY_TOKEN =
  process.env.SANITY_TOKEN;

if (!SANITY_TOKEN) {
  console.error('Missing SANITY_TOKEN. Set a Sanity write token in the environment before running this script.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DELETE_EMPTY = process.argv.includes('--delete-empty');
const DELETE_IDS = parseArgValues('--id=');
const DELETE_SLUGS = parseArgValues('--slug=');

function parseArgValues(prefix) {
  return process.argv
    .filter((arg) => arg.startsWith(prefix))
    .map((arg) => arg.slice(prefix.length).trim())
    .filter(Boolean);
}

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
    `*[_type == "collection"]{ _id, name, region, "slug": slug.current, "n": count(*[_type=="photo" && references(^._id)]) } | order(name asc)`,
  );

  const trims = [];
  const empties = [];
  for (const c of cols) {
    const trimmed = (c.name || '').trim();
    const flags = [];
    if (trimmed !== c.name) { flags.push(`trim → "${trimmed}"`); trims.push({ c, trimmed }); }
    if (c.n === 0) { flags.push('EMPTY (0 photos)'); empties.push(c); }
    const slug = c.slug ? ` · /${c.slug}` : '';
    console.log(`   ${String(c.n).padStart(3)} photos · ${(c.region || '—').padEnd(12)} · "${c.name}"${slug}${flags.length ? '   ⟶ ' + flags.join(', ') : ''}`);
  }

  console.log(`\n   ${trims.length} name(s) to trim · ${empties.length} empty collection(s)\n`);

  if (!APPLY) {
    console.log('   Re-run with --apply to trim names; add --delete-empty plus --id/--slug targets to remove empties.\n');
    return;
  }

  for (const { c, trimmed } of trims) {
    await sanity.patch(c._id).set({ name: trimmed }).commit();
    console.log(`   ✓ trimmed "${c.name}" → "${trimmed}"`);
  }

  if (DELETE_EMPTY) {
    if (DELETE_IDS.length === 0 && DELETE_SLUGS.length === 0) {
      console.error('   Refusing to delete all empty collections. Pass explicit --id=<id> or --slug=<slug> targets.');
      process.exit(1);
    }

    const deleteCandidates = empties.filter(
      (c) => DELETE_IDS.includes(c._id) || (c.slug && DELETE_SLUGS.includes(c.slug)),
    );

    for (const c of deleteCandidates) {
      await sanity.delete(c._id);
      console.log(`   ✓ deleted empty collection "${c.name}" (${c._id}${c.slug ? `, /${c.slug}` : ''})`);
    }

    const skippedTargets = [...DELETE_IDS, ...DELETE_SLUGS].filter(
      (target) => !deleteCandidates.some((c) => c._id === target || c.slug === target),
    );
    if (skippedTargets.length > 0) {
      console.log(`   Skipped target(s) that were not empty collections: ${skippedTargets.join(', ')}`);
    }
  } else if (empties.length) {
    console.log('   (empties left in place — add --delete-empty plus explicit --id/--slug targets to remove them)');
  }
  console.log('\n   ✅ Done.\n');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
