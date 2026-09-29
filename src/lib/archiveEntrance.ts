/** One score for the explorer's entry (the descent onto stop 01, on
 *  HomePage's clock): the map's and its interface's. No cover has an entrance
 *  on it — the covers are simply there (ArchiveChapter). */
export const ARCHIVE_ENTRANCE_PHASES = {
  mapVisibility: [0, 0.34],
  interface: [0.42, 0.86],
} as const;

export function entrancePhase(progress: number, start: number, end: number) {
  const value = Math.max(0, Math.min(1, (progress - start) / (end - start)));
  return value * value * value * (value * (value * 6 - 15) + 10);
}
