// ── The homepage's places, in the order it reads them ──
// The order the places are numbered in, as one pure rule the homepage and
// /about both use, so /about's "01 Miami" is always the homepage's 01.
// scripts/chapter-order.test.mjs pins today's order.
import type { Collection } from '../types';

// Every place the archive has photographs of is on the homepage: it is a map
// to roam now (src/lib/explorer.ts), not an issue read one screen per
// chapter, so it no longer grows with the archive and nothing is left off
// (the six-chapter issue went with the scroll that walked it, 2026-09-28:
// Washington, DC is to be stop 01, and a seventh place would have pushed the
// oldest off the front).

type Chapter = Pick<Collection, '_id' | 'year' | 'routeOrder' | 'region' | 'photoCount'> & {
  photos?: ReadonlyArray<unknown> | null;
};

/** Collections that have photos. A partial route-order rollout must not
 *  reshuffle the published archive: once every active collection has a
 *  value, routeOrder becomes the single deterministic source for inserting
 *  future locations between chapters. */
export function activeChapters<T extends Chapter>(collections: readonly T[]): T[] {
  // A story page's lightweight index carries a count instead of the photographs.
  const withPhotos = collections.filter((collection) => (collection.photos?.length || collection.photoCount || 0) > 0);
  const hasCompleteRouteOrder = withPhotos.length > 0 && withPhotos.every(
    (collection) => Number.isFinite(collection.routeOrder),
  );
  return hasCompleteRouteOrder
    ? [...withPhotos].sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0))
    : withPhotos;
}

export interface ChapterSection<T> {
  key: string;
  region: string | null;
  showHeader: boolean;
  frameCount: number;
  cities: T[];
}

/** Active cities grouped into ordered region sections. A section shows a
 *  divider HEADER only when it has ≥2 cities; single-city regions (and
 *  untagged collections) just render their chapter — no redundant header.
 *  Cities remain the unit everywhere (observer, rail, accent, story). */
export function chapterSections<T extends Chapter>(active: T[]): Array<ChapterSection<T>> {
  const groups = new Map<string, T[]>();
  const order: string[] = [];
  for (const c of active) {
    const key = c.region?.trim() ? `r:${c.region.trim()}` : `s:${c._id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(c);
  }
  return order.map((key) => {
    const cities = groups.get(key)!;
    const isRegion = key.startsWith('r:') && cities.length >= 2;
    return {
      key,
      region: isRegion ? cities[0].region!.trim() : null,
      showHeader: isRegion,
      frameCount: cities.reduce((n, c) => n + (c.photoCount ?? c.photos?.length ?? 0), 0),
      cities,
    };
  });
}

/** The flat chapter list in on-screen order (region members grouped
 *  adjacent): the homepage's numbering, 01 to the last. */
export function chapterOrder<T extends Chapter>(collections: readonly T[]): T[] {
  return chapterSections(activeChapters(collections)).flatMap((section) => section.cities);
}

/** A chapter's place in the homepage's run — "02 / 07" — and the chapter after
 *  it (the last wraps to the first): the number the ticket prints, which the
 *  story's kicker, running head, kept stub and Next line print too. `index` is
 *  -1 for a chapter with no photographs. */
export function chapterOrdinal<T extends Chapter>(collections: readonly T[], id: string): { index: number; total: number; next: T | null } {
  const order = chapterOrder(collections);
  const index = order.findIndex((collection) => collection._id === id);
  return {
    index,
    total: order.length,
    next: order.length > 0 ? order[(Math.max(index, -1) + 1) % order.length] ?? null : null,
  };
}
