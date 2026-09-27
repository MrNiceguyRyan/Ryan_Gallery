// ── The homepage's chapters, in the order it reads them ──
// Which chapters the front page carries and the order they are read in, as
// one pure rule the homepage and /about both use, so /about's "01 Miami" is
// always the homepage's 01. Moved verbatim out of HomePage.tsx; the steps are
// its three useMemos. scripts/chapter-order.test.mjs pins today's order.
import type { Collection } from '../types';

// The homepage is an ISSUE, not the archive. It flies a scripted camera through
// every chapter it is given at roughly one screen each, so "all collections"
// grows the page without bound: measured at 1.03 screens per chapter on a
// 900px viewport, six chapters is 10.9 screens and thirty would be 35. The
// archive keeps growing; this does not. The map is the complete index — that
// is the surface built to scale, and it is where everything stays reachable.
//
// Six is today's whole archive, so nothing changes until the seventh chapter
// lands, at which point the oldest leaves the front and stays on /travel.
export const HOME_CHAPTER_LIMIT = 6;

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

/** The most recent chapters, put back into the archive's reading order.
 *  Recency chooses WHICH chapters are in the issue; routeOrder still chooses
 *  the order they are read in, so the front page never reads backwards. */
export function issueChapters<T extends Chapter>(active: T[], limit = HOME_CHAPTER_LIMIT): T[] {
  if (active.length <= limit) return active;
  const byRecency = [...active].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  const inIssue = new Set(byRecency.slice(0, limit).map((collection) => collection._id));
  return active.filter((collection) => inIssue.has(collection._id));
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
export function chapterSections<T extends Chapter>(issue: T[]): Array<ChapterSection<T>> {
  const groups = new Map<string, T[]>();
  const order: string[] = [];
  for (const c of issue) {
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
  return chapterSections(issueChapters(activeChapters(collections))).flatMap((section) => section.cities);
}

/** A chapter's place in the homepage's run — "02 / 06" — and the chapter after
 *  it (the last wraps to the first): the number the ticket prints, which the
 *  story's kicker, running head, kept stub and Next line print too. `index` is
 *  -1 for a chapter the issue does not carry. */
export function chapterOrdinal<T extends Chapter>(collections: readonly T[], id: string): { index: number; total: number; next: T | null } {
  const order = chapterOrder(collections);
  const index = order.findIndex((collection) => collection._id === id);
  return {
    index,
    total: order.length,
    next: order.length > 0 ? order[(Math.max(index, -1) + 1) % order.length] ?? null : null,
  };
}
