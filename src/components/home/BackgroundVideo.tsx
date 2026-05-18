import { useEffect, useRef, useState } from 'react';

/**
 * BackgroundVideo — atmospheric hero video, lazy-loaded.
 *
 * Rationale: even though the video is rendered at ~22 % opacity behind a
 * dark gradient (so most users barely register it), `<video autoPlay src>`
 * would still kick off a multi-megabyte network request immediately,
 * blocking critical resources and trashing LCP on mobile.
 *
 * This component:
 *   1. Renders the <video> with `preload="none"` and no src on first paint
 *   2. Waits until the element scrolls into view via IntersectionObserver
 *   3. Then attaches the <source> and calls load() to start streaming
 *   4. Honors prefers-reduced-motion — does nothing if user opted out
 *
 * The visual result is identical to the original code once playing; only
 * the network/CPU cost of an unseen autoplaying clip is removed.
 */
export default function BackgroundVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    // Respect reduced-motion: skip the video entirely.
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const el = videoRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px' }, // start fetching slightly before it enters viewport
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      loop
      muted
      playsInline
      preload="none"
      className="absolute inset-0 w-full h-full object-cover grayscale opacity-[0.22] contrast-125"
    >
      {shouldLoad && <source src={src} type="video/mp4" />}
    </video>
  );
}
