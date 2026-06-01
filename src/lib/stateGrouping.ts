import type { Collection, Photo } from '../types';

/* ═══════════════════════════════════════════════════════════════════════
 *  State clustering helpers
 *
 *  The homepage groups collections by their `state` field. Multiple cities
 *  sharing a state collapse into a single "state chapter"; clicking it opens
 *  a hub that lists every city inside (so nothing is hidden). Collections
 *  without a `state`, or a state that contains only one city, render as a
 *  standalone collection chapter — fully backward compatible.
 * ═══════════════════════════════════════════════════════════════════════ */

/** A homepage list item: either a single collection or a clustered state. */
export type HomeItem =
  | { kind: 'collection'; collection: Collection }
  | { kind: 'state'; state: string; collections: Collection[] };

/** URL/DOM-safe key for a state label. */
export function stateSlug(state: string): string {
  return state.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Best available cover URL for a collection. */
export function collectionCover(c: Collection): string {
  return c.coverImageUrl ?? c.photos?.[0]?.imageUrl ?? '';
}

/** Number of frames in a collection (prefers the server `photoCount`). */
export function collectionFrameCount(c: Collection): number {
  return c.photoCount ?? c.photos?.length ?? 0;
}

/** Total frames across every city in a state. */
export function stateFrameCount(collections: Collection[]): number {
  return collections.reduce((sum, c) => sum + collectionFrameCount(c), 0);
}

/** Up to `max` distinct cover URLs drawn from the state's cities, used to
 *  build a montage cover for the state chapter. */
export function stateCovers(collections: Collection[], max = 4): string[] {
  const seen = new Set<string>();
  const covers: string[] = [];
  for (const c of collections) {
    const url = collectionCover(c);
    if (url && !seen.has(url)) {
      seen.add(url);
      covers.push(url);
      if (covers.length >= max) break;
    }
  }
  return covers;
}

/** First geotagged photo across a list of collections (for a state-level map link). */
export function firstCoords(collections: Collection[]): Photo['location'] | null {
  for (const c of collections) {
    const p = c.photos?.find((ph) => ph.location?.lat != null && ph.location?.lng != null);
    if (p?.location) return p.location;
  }
  return null;
}

/** A spread of "featured" frames pulled across the state's cities, round-robin
 *  so the strip showcases variety rather than dumping one city first. */
export function stateFeaturedPhotos(collections: Collection[], max = 10): Photo[] {
  const lists = collections.map((c) => c.photos ?? []);
  const out: Photo[] = [];
  let round = 0;
  let added = true;
  while (added && out.length < max) {
    added = false;
    for (const list of lists) {
      if (list[round]) {
        out.push(list[round]);
        added = true;
        if (out.length >= max) break;
      }
    }
    round += 1;
  }
  return out;
}

/**
 * Group collections into ordered homepage items. Order follows the input
 * order; a state cluster is placed at the position of its first member.
 * A state with only one collection is NOT clustered (no point adding a hub
 * layer for a single city).
 */
export function groupByState(collections: Collection[]): HomeItem[] {
  const groups = new Map<string, Collection[]>();
  for (const c of collections) {
    const st = c.state?.trim();
    if (!st) continue;
    const arr = groups.get(st);
    if (arr) arr.push(c);
    else groups.set(st, [c]);
  }

  const items: HomeItem[] = [];
  const placed = new Set<string>();
  for (const c of collections) {
    const st = c.state?.trim();
    const group = st ? groups.get(st) : undefined;
    if (st && group && group.length > 1) {
      if (!placed.has(st)) {
        placed.add(st);
        items.push({ kind: 'state', state: st, collections: group });
      }
      // subsequent members already represented by the placed state item
    } else {
      items.push({ kind: 'collection', collection: c });
    }
  }
  return items;
}

/** The DOM/observer key for a home item (the part after `archive-item-`). */
export function homeItemKey(item: HomeItem): string {
  return item.kind === 'state' ? `state-${stateSlug(item.state)}` : item.collection._id;
}

/** The representative collection used for palette/cover of a home item. */
export function homeItemRep(item: HomeItem): Collection {
  return item.kind === 'state' ? item.collections[0] : item.collection;
}
