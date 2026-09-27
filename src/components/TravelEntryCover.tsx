import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { EASE } from '../lib/motion';

interface Props {
  chapters: number;
  frames: number;
}

const ATLAS_SESSION_KEY = 'ryan-gallery:atlas-entry-seen';
// 'skip': a repeat arrival that is itself a view transition (see below).
type EntryMode = 'checking' | 'full' | 'brief' | 'skip';

/**
 * A short editorial handoff into the Atlas. It deliberately mirrors the
 * contributor cover on About so the two primary destinations share one
 * transition language, while Mapbox initializes behind the opaque plane.
 *
 * Kept (2026-09-27) where the design board recommended dropping it — the
 * owner decides — but it no longer holds the map back: its composition is
 * set within about 0.7s and it lifts the moment the atlas has drawn its
 * first settled frame, after a hold of MIN_HOLD_MS rather than 1.15s.
 */
const MIN_HOLD_MS = 600;
export default function TravelEntryCover({ chapters, frames }: Props) {
  const reduce = useReducedMotion();
  // The first render is the server's (the cover present) whatever the motion
  // preference: seeded from `reduce`, the first client render dropped the
  // cover the server had painted, hydration could not reconcile the two, and
  // the plane was left behind for good (display:none, still announcing
  // itself). Reduced motion unmounts it from the effect below instead.
  const [entryMode, setEntryMode] = useState<EntryMode>('checking');
  const [coverGone, setCoverGone] = useState(false);
  const [coverExited, setCoverExited] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [atlasReady, setAtlasReady] = useState(false);

  useEffect(() => {
    if (reduce) {
      // Reduced motion has no cover at all: after hydration it is unmounted
      // (it used to stay behind as a display:none plane still announcing
      // "Opening the photographic atlas" to a screen reader).
      setEntryMode('skip');
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
      // A repeat arrival that is itself a view transition — the push from
      // About, a fall back from a story — already carries the real page on
      // screen. The brief olive wipe used to run inside it: the push landed on
      // an empty plane with the map as a band at the bottom, two motions on
      // two axes for one page change. So it gets no cover at all. html's
      // data-axis stays set until the next navigation, so it is read once,
      // here. (Layout.astro hides the server-painted plane from the first
      // frame by the same rule, before this island has hydrated.)
      if (document.documentElement.hasAttribute('data-axis')) {
        setEntryMode('skip');
        setCoverGone(true);
        setCoverExited(true);
        return;
      }
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

    // The editorial composition gets one short beat. After that, the cover
    // waits for Mapbox's first settled frame rather than guessing at tile speed.
    const minimumHold = window.setTimeout(() => setIntroComplete(true), MIN_HOLD_MS);
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

  // Skipped, the cover is unmounted with its AnimatePresence, so it leaves
  // without an exit (a removed child would still play its lift).
  if (entryMode === 'skip') return null;

  return (
    <AnimatePresence onExitComplete={completeExit}>
      {!coverGone && (
        <motion.div
          key="travel-entry-cover"
          initial={{ y: 0 }}
          exit={{ y: '-100%' }}
          transition={{ duration: reduce ? 0 : entryMode === 'brief' ? 0.3 : 0.85, ease: EASE.plane }}
          className="travel-entry-cover fixed inset-0 z-[60] overflow-hidden bg-[#282c20] text-[#F4F4ED]"
          data-entry-cover={ATLAS_SESSION_KEY}
          data-entry-deeplink=""
        >
          <span className="sr-only" role="status">
            Opening the photographic atlas
          </span>
          {entryMode === 'full' && (
            <>
          <button
            type="button"
            onClick={() => setCoverGone(true)}
            className="fixed left-4 top-4 z-10 inline-flex min-h-11 -translate-y-[160%] items-center rounded-full bg-[#F4F4ED] px-5 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-[#171b15] transition-transform duration-200 focus:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
          >
            Skip entrance
          </button>
          {/* No lime anywhere on the cover: the page's one lime is the
              masthead's "Archive.", which the lifting cover uncovers. */}

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
                  duration: 0.5,
                  delay: 0.03 + index * 0.04,
                  ease: EASE.arrive,
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
            transition={{ duration: 0.5, delay: 0.06, ease: EASE.arrive }}
          >
            <div className="flex items-baseline justify-between gap-4 border-b border-white/20 pb-2 font-ui text-[10px] uppercase tracking-[0.1em]">
              <span className="font-medium text-white/60">The Journal Gallery</span>
              <span className="text-white/58">The Territory</span>
            </div>
            <div className="mt-[3px] border-b border-white/10" />
          </motion.div>

          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-[6vw] text-center"
          >
            {/* Bone, not lime: the masthead's "Archive." is the page's one
                lime, and during the lift the two were on screen together. */}
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.12, ease: EASE.arrive }}
              className="font-ui text-[11px] uppercase tracking-[0.1em] text-[#F4F4ED]/72"
            >
              Photographic Archive
            </motion.span>

            <div className="m-0 overflow-hidden px-[0.02em] py-[0.04em]">
              <motion.span
                initial={{ y: '110%' }}
                animate={{ y: '0%' }}
                transition={{ duration: 0.6, delay: 0.16, ease: EASE.arrive }}
                className="inline-block font-serif text-[clamp(64px,15vw,188px)] font-normal uppercase leading-[0.92] tracking-tight text-white/[0.98]"
              >
                Atlas
              </motion.span>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.26, ease: EASE.arrive }}
              className="font-ui text-[10px] uppercase tracking-[0.1em] text-white/58"
            >
              Geographic Index
            </motion.div>
          </div>

          <motion.div
            className="absolute flex items-baseline justify-between gap-4 border-t border-white/20 pt-2 font-ui text-[10px] uppercase tracking-[0.1em] text-white/58"
            style={{
              bottom:
                'max(clamp(1.5rem,4vh,3rem), env(safe-area-inset-bottom))',
              left: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-left))',
              right: 'max(clamp(1.5rem,5vw,4rem), env(safe-area-inset-right))',
            }}
            initial={{ clipPath: 'inset(0 0 0 100%)' }}
            animate={{ clipPath: 'inset(0 0 0 0%)' }}
            transition={{ duration: 0.5, delay: 0.08, ease: EASE.arrive }}
          >
            <span className="text-[13px] tracking-[0.1em] text-white/55">
              Live Atlas
            </span>
            <span>
              {String(chapters).padStart(2, '0')} chapters /{' '}
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
              <span className="font-ui text-[10px] uppercase tracking-[0.1em] text-white/52">
                Atlas
              </span>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
