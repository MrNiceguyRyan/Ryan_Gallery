export const ATLAS_IDLE_FALLBACK_MS = 1800;

export interface AtlasReadiness {
  loaded: boolean;
  cameraSynced: boolean;
  settled: boolean;
  idleFallback: boolean;
}

export function isAtlasInterfaceReady(state: AtlasReadiness) {
  return state.loaded && state.cameraSynced && (state.settled || state.idleFallback);
}

/** A loaded map may keep requesting tiles while the reader scrolls. Do not
 * require global idle forever, but never open an uninitialized camera. */
export function scheduleAtlasIdleFallback(
  state: AtlasReadiness,
  onReady: () => void,
  clock: Pick<Window, 'setTimeout' | 'clearTimeout'> = window,
) {
  if (!state.loaded || !state.cameraSynced || state.settled || state.idleFallback) return;
  let cancelled = false;
  const timer = clock.setTimeout(() => {
    if (!cancelled) onReady();
  }, ATLAS_IDLE_FALLBACK_MS);
  return () => {
    cancelled = true;
    clock.clearTimeout(timer);
  };
}
