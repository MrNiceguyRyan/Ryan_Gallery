import { useEffect, useRef, useState } from 'react';
import { useReducedMotion, type MotionValue } from 'framer-motion';

interface Props {
  years: string;
  /** Prologue progress 0–1 (HomePage's clock for the globe). */
  progress?: MotionValue<number>;
  /** The globe is not up yet (the opening film, or the entrance's pass
   *  still whole): it cannot be played with, so its key is out of the tab
   *  order. */
  covered?: boolean;
  /** The route's first stop, and how many stops there are. */
  first?: { name: string; region?: string | null; year?: number | string | null } | null;
  stops?: number;
  /** The entrance's glide: 'gliding' while it brings the globe up (the
   *  caption waits), 'landed' once the globe is in place (the caption comes
   *  up), 'none' when there was no glide (the caption simply is). */
  arrival?: 'none' | 'gliding' | 'landed';
}

// The globe's easter eggs take the keyboard too, on the first screen only
// (GlobeEggs listens for `archive:globe-egg`): Enter spins, Space held past
// EGG_HOLD_MS opens the shutter until it is let go, a tap of Space spins.
const EGG_Q_MAX = 0.2;
const EGG_HOLD_MS = 450;
const sendGlobeEgg = (type: 'spin' | 'bulb-start' | 'bulb-end') =>
  window.dispatchEvent(new CustomEvent('archive:globe-egg', { detail: { type } }));

/**
 * GlobePrologue — the globe's first pose on the desktop homepage, laid over
 * the live atlas.
 *
 * His name and the opening words are the entrance's now (EntranceIntro,
 * above): the globe arrives here once the boarding pass is torn, lit, low in
 * the bottom-right corner, and this screen only says where the route begins
 * — a quiet caption, never a second title. About a screen of scroll on, the
 * globe glides to the atlas's focal point and dives straight into the first
 * chapter. The globe itself is the RouteAtlas map (driven by
 * `prologueProgress`); this component is only the type.
 */
export default function GlobePrologue({ years, progress, covered = false, first = null, stops = 0, arrival = 'none' }: Props) {
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
      data-arrival={arrival === 'none' ? undefined : arrival}
    >
      {/* Plain elements on purpose: framer writes a hidden `initial` into
          the server HTML. At rest these are the finished screen; the
          caption waits while the entrance's glide brings the globe up and
          comes up once it is in place (`data-arrival`, global.css "The
          globe's first pose"). */}
      <div className="flex h-[100svh] flex-col justify-end pb-[11svh] pl-[6vw] pr-[40vw]">
        {/* The kicker's dot is bone: the screen's one lime mark is the
            scroll cue's sweep below. */}
        <p className="prologue-cap prologue-cap--1 flex items-center gap-3 font-ui text-[11px] uppercase tracking-[0.1em] text-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-[#F4F4ED]" aria-hidden="true" />
          <span>Visual Archive</span>
          {years && <span className="tabular-nums text-white/45">{years}</span>}
        </p>
        {first && (
          <>
            {/* PROPOSED copy, awaiting the owner. Data-driven: the route's
                first stop (Miami today; Washington once it is stop 01). */}
            <p className="prologue-cap prologue-cap--2 mt-5 max-w-[16em] font-serif text-[clamp(30px,2.9vw,50px)] leading-[1.12] text-[#F4F4ED]">
              The route begins in <em>{first.name}</em>.
            </p>
            <p className="prologue-cap prologue-cap--3 mt-5 flex items-center gap-3 font-ui text-[11px] uppercase tracking-[0.1em] text-white/55">
              <span className="tabular-nums">
                Stop 01{stops > 0 ? ` / ${String(stops).padStart(2, '0')}` : ''}
              </span>
              {first.region && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{first.region}</span>
                </>
              )}
              {first.year != null && String(first.year).trim() !== '' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{String(first.year).trim()}</span>
                </>
              )}
            </p>
          </>
        )}
        <div className="mt-12 flex items-center gap-10">
          {/* The cue that says "scroll" comes up with the caption, never
              after the reader already has. */}
          <p
            aria-hidden="true"
            className="prologue-cap prologue-cap--4 flex items-center gap-3 font-ui text-[10px] uppercase tracking-[0.1em] text-white/50"
          >
            <span className="prologue-scroll-cue relative block h-7 w-px overflow-hidden bg-white/18" />
            Scroll
          </p>
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
