const RESTORE_DEADLINE_MS = 500;

function ready(element: HTMLElement | null): element is HTMLElement {
  return !!element?.isConnected &&
    !element.closest('[inert], [hidden], [aria-hidden="true"]') &&
    !element.matches(':disabled') &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden';
}

/** Restore only after the body lock and the cover's own entry gate release. */
export function restoreStoryFocus(source: HTMLElement | null, collectionId: string) {
  const deadline = window.performance.now() + RESTORE_DEADLINE_MS;
  let frame = 0;
  let cancelled = false;

  const restore = () => {
    if (cancelled) return;
    // Re-resolve by stable collection ID: a resize can replace the entire
    // desktop archive tree while the Story is open.
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-story-source]'))
      .filter((element) => element.dataset.storySource === collectionId);
    if (source?.isConnected && source.dataset.storySource === collectionId) {
      candidates.unshift(source);
    }
    const target = candidates.find(ready);
    if (target) {
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return;
    }
    if (!candidates.length || window.performance.now() >= deadline) {
      const fallback = document.getElementById('main-content');
      if (ready(fallback)) {
        fallback.focus({ preventScroll: true });
        return;
      }
      if (window.performance.now() >= deadline) return;
    }
    frame = window.requestAnimationFrame(restore);
  };

  frame = window.requestAnimationFrame(restore);
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
  };
}
