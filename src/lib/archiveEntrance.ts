/** One reversible scroll score for the archive's formal entrance. */
export const ARCHIVE_ENTRANCE_PHASES = {
  map: [0.02, 0.68],
  mapVisibility: [0, 0.34],
  film: [0.2, 0.84],
  type: [0.46, 0.94],
  details: [0.62, 1],
  interface: [0.42, 0.86],
} as const;

export function entrancePhase(progress: number, start: number, end: number) {
  const value = Math.max(0, Math.min(1, (progress - start) / (end - start)));
  return value * value * value * (value * (value * 6 - 15) + 10);
}

export function archiveEntryProgress(scrollY: number, sectionY: number, viewportHeight: number) {
  const height = Math.max(1, viewportHeight);
  // Begin once the archive occupies almost half the viewport, and finish when
  // the first photograph is fully on stage. No spacer or scroll lock is added.
  return Math.max(0, Math.min(1, (scrollY - sectionY + height * 0.56) / (height * 1.08)));
}
