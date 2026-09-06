import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * useInViewOnce — the site's ONE sanctioned scroll-reveal trigger.
 *
 * A native IntersectionObserver flips `shown` exactly once when the element
 * enters the viewport. framer's `whileInView` is banned in this codebase: the
 * page-transition view-transition snapshot can leave its observer stuck at
 * `initial` (content never un-hides). Reduced-motion (and no-IO environments)
 * short-circuit to shown immediately so nothing is ever trapped invisible.
 *
 * Shared by HomePage and AboutPage's <Reveal> — tune the
 * trigger window per call site via rootMargin/threshold.
 */
export function useInViewOnce<T extends Element>(
  rootMargin = '0px 0px -12% 0px',
  threshold = 0.12,
) {
  const ref = useRef<T>(null);
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (reduce) { setShown(true); return; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }),
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, rootMargin, threshold]);
  return [ref, shown] as const;
}
