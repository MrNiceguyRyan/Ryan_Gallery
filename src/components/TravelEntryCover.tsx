import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Props {
  locations: number;
  frames: number;
}

const expo = [0.16, 1, 0.3, 1] as const;
const coverEase = [0.76, 0, 0.24, 1] as const;
const ATLAS_SESSION_KEY = 'ryan-gallery:atlas-entry-seen';
type EntryMode = 'checking' | 'full' | 'brief';

/**
 * A short editorial handoff into the Atlas. It deliberately mirrors the
 * contributor cover on About so the two primary destinations share one
 * transition language, while Mapbox initializes behind the opaque plane.
 */
export default function TravelEntryCover({ locations, frames }: Props) {
  const reduce = useReducedMotion();
  const [entryMode, setEntryMode] = useState<EntryMode>('checking');
  const [coverGone, setCoverGone] = useState(!!reduce);
  const [coverExited, setCoverExited] = useState(!!reduce);
  const [introComplete, setIntroComplete] = useState(!!reduce);
  const [atlasReady, setAtlasReady] = useState(false);

  useEffect(() => {
    if (reduce) {
      setEntryMode('brief');
      setCoverGone(true);
      setCoverExited(true);
      setIntroComplete(true);
      return;
    }

    setEntryMode('checking');
    setCoverGone(false);
    setCoverExited(false);
    setIntroComplete(false);
    setAtlasReady(false);

    let seenThisSession = false;
    try {
      seenThisSession = window.sessionStorage.getItem(ATLAS_SESSION_KEY) === 'true';
      window.sessionStorage.setItem(ATLAS_SESSION_KEY, 'true');
    } catch {
      // Private browsing can deny storage; the URL still selects the right pace.
    }

    const deepLinked = window.location.search.length > 1 || window.location.hash.length > 1;
    if (seenThisSession || deepLinked) {
      setEntryMode('brief');
      const briefExit = window.setTimeout(() => setCoverGone(true), 24);
      return () => window.clearTimeout(briefExit);
    }

    setEntryMode('full');

    const onAtlasReady = () => setAtlasReady(true);
    window.addEventListener('gallery:atlas-ready', onAtlasReady);
    if (document.documentElement.dataset.atlasReady === 'true') {
      setAtlasReady(true);
    }

    // The editorial composition gets one clear beat. After that, the cover
    // waits for Mapbox's first settled frame rather than guessing at tile speed.
    const minimumHold = window.setTimeout(() => setIntroComplete(true), 1150);
    // A slow or offline map must never trap the visitor behind the cover. The
    // Atlas owns a separate retryable loading state once this limit is reached.
    const hardLimit = window.setTimeout(() => setCoverGone(true), 3800);

    return () => {
      window.removeEventListener('gallery:atlas-ready', onAtlasReady);
      window.clearTimeout(minimumHold);
      window.clearTimeout(hardLimit);
    };
  }, [reduce]);

  useEffect(() => {
    if (!reduce && introComplete && atlasReady) setCoverGone(true);
  }, [atlasReady, introComplete, reduce]);

  useEffect(() => {
    let nav: HTMLElement | null = null;
    let navHost: HTMLElement | null = null;
    let workspace: HTMLElement | null = null;
    let globalSkip: HTMLElement | null = null;
    let secondFrame = 0;

    const apply = () => {
      nav = document.querySelector<HTMLElement>('[data-site-nav]');
      navHost = nav?.closest<HTMLElement>('astro-island') ?? nav;
      workspace = document.querySelector<HTMLElement>('[data-travel-workspace]');
      globalSkip = document.querySelector<HTMLElement>('a[href="#main-content"]');
      // The Astro island wrapper is outside React's hydration contract. Apply
      // transient accessibility state there so Nav never sees mutated SSR
      // attributes while it hydrates underneath the opaque cover.
      for (const target of [navHost, workspace, globalSkip]) {
        if (!target) continue;
        if (!coverExited) {
          target.inert = true;
          target.setAttribute('aria-hidden', 'true');
        } else {
          target.inert = false;
          target.removeAttribute('aria-hidden');
        }
      }
    };

    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(apply);
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      for (const target of [navHost, workspace, globalSkip]) {
        if (!target) continue;
        target.inert = false;
        target.removeAttribute('aria-hidden');
      }
    };
  }, [coverExited]);

  const completeExit = () => {
    setCoverExited(true);
  };

  return (
    <AnimatePresence onExitComplete={completeExit}>
      {!coverGone && (
        <motion.div
          key="travel-entry-cover"
          initial={{ y: 0 }}
          exit={{ y: '-100%' }}
          transition={{ duration: reduce ? 0 : entryMode === 'brief' ? 0.3 : 0.85, ease: coverEase }}
          className="travel-entry-cover fixed inset-0 z-[60] overflow-hidden bg-[#282c20] text-[#F4F4ED]"
        >
          <span className="sr-only" role="status">
            Opening the photographic atlas
          </span>
          {entryMode === 'full' && (
            <>
          <button
            type="button"
            onClick={() => setCoverGone(true)}
            className="fixed left-4 top-4 z-10 inline-flex min-h-11 -translate-y-[160%] items-center rounded-full bg-[#F4F4ED] px-5 font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-[#171b15] transition-transform duration-200 focus:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
          >
            Skip entrance
          </button>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(54vmax 42vmax at 18% 112%, rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.1), transparent 68%)',
            }}
          />

          <div className="pointer-events-none absolute inset-0 grid grid-cols-4 opacity-50">
            {[0, 1, 2, 3].map((index) => (
              <motion.span
                key={index}
                className="origin-top"
                style={{
                  borderRight:
                    index === 3 ? '0' : '1px solid rgba(255,255,255,0.05)',
                }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{
                  duration: 0.7,
                  delay: 0.05 + index * 0.06,
                  ease: expo,
                }}
              />
            ))}
          </div>

          <motion.div
            className="absolute"
            style={{
              top: 'clamp(1.5rem,4vh,3rem)',
              left: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-left))',
              right: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-right))',
            }}
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0% 0 0)' }}
            transition={{ duration: 0.65, delay: 0.1, ease: expo }}
          >
            <div className="flex items-baseline justify-between gap-4 border-b border-white/20 pb-2 font-ui text-[10px] uppercase tracking-[0.42em]">
              <span className="font-medium text-white/60">The Journal Gallery</span>
              <span className="text-white/58">The Territory</span>
            </div>
            <div className="mt-[3px] border-b border-white/10" />
          </motion.div>

          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-[6vw] text-center"
          >
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.22, ease: expo }}
              className="font-ui text-[11px] uppercase tracking-[0.5em]"
              style={{
                color:
                  'rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.85)',
              }}
            >
              Photographic Archive
            </motion.span>

            <div className="m-0 overflow-hidden px-[0.02em] py-[0.04em]">
              <motion.span
                initial={{ y: '110%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 0.85, delay: 0.32, ease: expo }}
                className="inline-block font-serif text-[clamp(64px,15vw,188px)] font-normal uppercase leading-[0.92] tracking-tight text-white/[0.98]"
              >
                Atlas
              </motion.span>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.46, ease: expo }}
              className="font-ui text-[10px] uppercase tracking-[0.34em] text-white/58"
            >
              Geographic Index
            </motion.div>
          </div>

          <motion.div
            className="absolute flex items-baseline justify-between gap-4 border-t border-white/20 pt-2 font-ui text-[10px] uppercase tracking-[0.42em] text-white/58"
            style={{
              bottom:
                'max(clamp(1.5rem,4vh,3rem), env(safe-area-inset-bottom))',
              left: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-left))',
              right: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-right))',
            }}
            initial={{ clipPath: 'inset(0 0 0 100%)' }}
            animate={{ clipPath: 'inset(0 0 0 0%)' }}
            transition={{ duration: 0.65, delay: 0.12, ease: expo }}
          >
            <span className="text-[13px] tracking-[0.2em] text-white/55">
              Live Atlas
            </span>
            <span>
              {String(locations).padStart(2, '0')} locations /{' '}
              {String(frames).padStart(2, '0')} frames
            </span>
          </motion.div>
            </>
          )}

          {entryMode === 'brief' && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduce ? 0 : 0.12 }}
              aria-hidden="true"
            >
              <span className="font-ui text-[10px] uppercase tracking-[0.42em] text-white/52">
                Atlas
              </span>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
