/** One reversible scroll score for the archive's formal entrance: the map's
 *  and its interface's. No cover has an entrance on it — the first film's
 *  album unfold (and its type's and details' arrival) went with every other
 *  cover reveal; the covers are simply there (ArchiveChapter). */
export const ARCHIVE_ENTRANCE_PHASES = {
  map: [0.02, 0.68],
  mapVisibility: [0, 0.34],
  interface: [0.42, 0.86],
} as const;

export function entrancePhase(progress: number, start: number, end: number) {
  const value = Math.max(0, Math.min(1, (progress - start) / (end - start)));
  return value * value * value * (value * (value * 6 - 15) + 10);
}

/** How far into the viewport the archive's top edge is when its entrance
 *  begins (it begins with the archive's top 56% of the way down the screen),
 *  and so where the desktop prologue's clock ends. */
export const ARCHIVE_ENTRY_LEAD = 0.56;

export function archiveEntryProgress(scrollY: number, sectionY: number, viewportHeight: number) {
  const height = Math.max(1, viewportHeight);
  // Begin once the archive occupies almost half the viewport, and finish when
  // the first photograph is fully on stage. No spacer or scroll lock is added.
  return Math.max(0, Math.min(1, (scrollY - sectionY + height * ARCHIVE_ENTRY_LEAD) / (height * 1.08)));
}
