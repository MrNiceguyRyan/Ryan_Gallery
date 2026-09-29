import { useEffect, useRef, useState } from 'react';
import { useReducedMotion, type MotionValue } from 'framer-motion';

interface Props {
  years: string;
  /** Prologue progress 0–1 (HomePage's clock for the globe). */
  progress?: MotionValue<number>;
  /** The opening film lies over the first screen (OpeningFilm): the globe
   *  cannot be played with, so its key is out of the tab order. */
  covered?: boolean;
  /** The explorer has been entered: the first screen's type steps aside as
   *  the globe turns and glides (and comes back with the globe). */
  leaving?: boolean;
  /** The cue, pressed: enter the explorer (src/lib/explorer.ts). */
  onEnter?: () => void;
}

// The globe's easter eggs take the keyboard too, on the first screen only
// (GlobeEggs listens for `archive:globe-egg`): Enter spins, Space held past
// EGG_HOLD_MS opens the shutter until it is let go, a tap of Space spins.
const EGG_Q_MAX = 0.2;
const EGG_HOLD_MS = 450;
const sendGlobeEgg = (type: 'spin' | 'bulb-start' | 'bulb-end') =>
  window.dispatchEvent(new CustomEvent('archive:globe-egg', { detail: { type } }));

/**
 * GlobePrologue — the desktop homepage's first screen, laid over the live
 * atlas.
 *
 * After 11 mois sans toi(t): his name and what this is, over a whole, lit
 * globe half off the bottom-right corner. The reader's first move enters the
 * explorer (src/lib/explorer.ts): this type steps aside, the globe turns to
 * the Americas as it glides to the atlas's focal point and the camera goes
 * down onto stop 01. The globe itself is the RouteAtlas map (driven by
 * `prologueProgress`); this component is only the type.
 */
export default function GlobePrologue({ years, progress, covered = false, leaving = false, onEnter }: Props) {
  const reduce = useReducedMotion();
  // The egg's key: client-only (a mouse or a pen beside the keyboard, as the
  // eggs themselves need), in the tab order only while the globe can play.
  const [eggKey, setEggKey] = useState(false);
  const [eggKeyTab, setEggKeyTab] = useState(0);
  const eggKeyTabRef = useRef(0);
  const spaceHoldRef = useRef<{ timer: number; bulb: boolean } | null>(null);
  const eggKeyAtRef = useRef(0);
  useEffect(() => {
    if (reduce || !progress) {
      setEggKey(false);
      return;
    }
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setEggKey(query.matches);
    sync();
    query.addEventListener('change', sync);
    const tab = (value: number) => {
      const next = value < EGG_Q_MAX ? 0 : -1;
      if (next === eggKeyTabRef.current) return;
      eggKeyTabRef.current = next;
      setEggKeyTab(next);
    };
    tab(progress.get());
    const unsubscribe = progress.on('change', tab);
    return () => {
      query.removeEventListener('change', sync);
      unsubscribe();
    };
  }, [progress, reduce]);
  const endSpaceHold = (send: boolean) => {
    const hold = spaceHoldRef.current;
    spaceHoldRef.current = null;
    if (!hold) return;
    window.clearTimeout(hold.timer);
    if (hold.bulb) sendGlobeEgg('bulb-end');
    else if (send) sendGlobeEgg('spin');
  };

  return (
    <div
      className="globe-prologue pointer-events-none absolute inset-x-0 top-0 z-30 hidden lg:block"
      data-leaving={leaving ? '' : undefined}
      aria-hidden={leaving || undefined}
      inert={leaving}
    >
      {/* The first screen enters in CSS, from the first paint (the
          `prologue-hero-*` classes in global.css). These are plain elements
          on purpose: framer writes a hidden `initial` into the server HTML,
          so his name used to wait, invisible, for the scripts. */}
      <div className="flex h-[100svh] flex-col justify-end pb-[11svh] pl-[6vw] pr-[40vw]">
        {/* The kicker's dot is bone: the first screen's one lime mark is the
            scroll cue's sweep below. */}
        <p className="prologue-hero-kicker flex items-center gap-3 font-ui text-[11px] uppercase tracking-[0.1em] text-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-[#F4F4ED]" aria-hidden="true" />
          <span>Visual Archive</span>
          {years && <span className="tabular-nums text-white/45">{years}</span>}
        </p>
        <p
          aria-hidden="true"
          className="prologue-display mt-5 font-serif uppercase text-[#F4F4ED]"
          style={{ fontSize: 'clamp(112px, 15.2vw, 280px)' }}
        >
          <span className="prologue-line"><span className="prologue-hero-rise block" data-open-land="ryan">Ryan</span></span>
          <span className="prologue-line"><span className="prologue-hero-rise prologue-hero-rise--late block" data-open-land="xu">Xu</span></span>
        </p>
        {/* What this is, in his words: roman, with the two things it is an
            archive of set in italic. The measure is in em, not ch: 30ch in the
            metric fallback is 454px at 28px against 542px in Fraunces, so the
            line wrapped in two until the webfont landed and then pulled the
            whole bottom-anchored column, his name included, 38px down. 19.4em
            is Fraunces' 30ch, in either face.
            The words the opening film found in its texts (OpeningFilm, landing
            A) fly home to their own spans here; the rest of the line comes up
            round them. */}
        <p className="prologue-hero-tagline mt-8 max-w-[19.4em] font-serif text-[clamp(20px,1.7vw,28px)] leading-snug text-white/78">
          <span className="open-rest">A personal </span>
          <span data-open-land="archive">archive</span>
          <span className="open-rest"> of </span>
          <em data-open-land="travel">travel</em>
          <span className="open-rest"> and </span>
          <em data-open-land="thought">thought</em>
          <span className="open-rest">.</span>
        </p>
        <div className="mt-14 flex items-center gap-10">
          {/* Last of the first screen, but inside the name's own rise: the
              cue that says "scroll" must not arrive after the reader already
              has. The wheel, a key or a press of it enters the map (the page
              itself does not scroll: src/lib/explorer.ts). */}
          <button
            type="button"
            aria-label="Enter the map"
            tabIndex={covered ? -1 : 0}
            onClick={onEnter}
            className="prologue-hero-cue pointer-events-auto flex min-h-11 items-center gap-3 font-ui text-[10px] uppercase tracking-[0.1em] text-white/50 transition-colors hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
          >
            <span className="prologue-scroll-cue relative block h-7 w-px overflow-hidden bg-white/18" />
            Scroll
          </button>
          {/* The globe's easter eggs by keyboard. Out of sight until focused;
              focused, one quiet line says what the keys do. */}
          {eggKey && (
            <button
              type="button"
              tabIndex={covered ? -1 : eggKeyTab}
              className="globe-egg-key sr-only pointer-events-auto whitespace-nowrap font-ui text-[10px] uppercase tracking-[0.1em] text-white/58 focus-visible:not-sr-only focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
              aria-label="Spin the globe: press Enter. Hold Space for a long exposure."
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  eggKeyAtRef.current = performance.now();
                  if (!event.repeat) sendGlobeEgg('spin');
                  return;
                }
                if (event.key !== ' ') return;
                event.preventDefault();
                eggKeyAtRef.current = performance.now();
                if (event.repeat || spaceHoldRef.current) return;
                const hold = { timer: 0, bulb: false };
                hold.timer = window.setTimeout(() => {
                  hold.bulb = true;
                  sendGlobeEgg('bulb-start');
                }, EGG_HOLD_MS);
                spaceHoldRef.current = hold;
              }}
              onKeyUp={(event) => {
                if (event.key !== ' ') return;
                event.preventDefault();
                eggKeyAtRef.current = performance.now();
                endSpaceHold(true);
              }}
              onBlur={() => endSpaceHold(false)}
              onClick={() => {
                // Keys are handled above; a click that follows one is its echo.
                if (performance.now() - eggKeyAtRef.current < 400) return;
                sendGlobeEgg('spin');
              }}
            >
              Spin the globe · Enter<span className="ml-6">Hold Space · Bulb</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
