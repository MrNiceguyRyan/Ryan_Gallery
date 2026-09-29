import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type Lenis from 'lenis';
import BoardingPass, { type PassHandle, type TearHow } from './BoardingPass';
import {
  ARRIVAL_EASE,
  ARRIVAL_SECONDS,
  PASS_PIN,
  PASS_TEAR_AT,
  passFields,
  passRise,
  scrollStrain,
  type PassChapter,
} from '../../lib/boardingPass';
import { EASE, bezierFn } from '../../lib/motion';

// ── The entrance: opening words, a boarding pass, then the globe ──
// Owner, 2026-09-28: 结束完封面播放之后，来到封面，我希望在这里写一些开头语…这个时候
// 最好不出现地球。往下划一点点之后，会出现一张白色机票…可以拖来拖去观看，同时会提示观众
// 撕开他，或者扫描他也行…之后就可以地球以很好的动态划入回到我们熟悉的操作界面.
//
// After the opening film the homepage opens HERE, not on the globe: his name
// and a few opening words on the olive ground (the film's found words fly
// home into them: src/lib/openingFilm.ts, landing A). A little way down, a
// white boarding pass rises into view with the scroll (BoardingPass.tsx):
// it can be picked up and looked at, torn along its perforation, or scanned.
// Its frame holds (sticky) for a short stretch below it, where the scroll
// itself pulls at the stub and peels it; scrolled on past PASS_TEAR_AT of
// that stretch the pass tears for the reader, so nobody is ever stuck. Torn
// — by hand, button, key or scroll — the page goes on in one calm glide: the
// pass's main part slides away up the screen as the globe rises over the
// lower edge, the whole planet already facing stop 01, fading in lit but
// not turning (one move at a time). Landed, the pass asks for the explorer
// (HomePage: `requestExplore`, the seam) and the camera goes straight down
// onto stop 01; the entrance is then taken off the page. On a phone the
// glide brings up the map above stop 01 the same way. Reduced motion: the
// stub fades, nothing moves the page (HomePage cuts to the explorer).
//
// The geometry is derived (document offsets once per layout, the scroll
// position per frame); nothing reads a rect per frame.

/** PROPOSED copy, awaiting the owner: the opening words. They must keep the
 *  four words the film finds (camera, travel, archive, thought), each its
 *  own span, so landing A has somewhere to land them — in about the order
 *  the clapperboard carries them (CAMERA beside his name, then ARCHIVE,
 *  TRAVEL, THOUGHT), so the flying words do not cross on their way home. */
const OPENING_WORDS: ReadonlyArray<string | { land: 'travel' | 'camera' | 'archive' | 'thought' }> = [
  'A ',
  { land: 'camera' },
  ' goes where I ',
  { land: 'travel' },
  '. What it keeps becomes this ',
  { land: 'archive' },
  ' — the places, the light, and the ',
  { land: 'thought' },
  ' that came along, one frame at a time.',
];
/** PROPOSED copy, awaiting the owner: the pass's prompt. */
const PASS_PROMPT = 'Tear along the line — or scan to take it with you.';

// The glide waits for the falling stub to leave the screen (one thing at a
// time: the stub falls, then the page moves), at least this long after it
// leaves the hand (a beat for the tear to register) and at most GO_ON_MAX_MS
// (a stub flung up takes its time coming down). The glide's own start is
// slow (ARRIVAL_EASE), so whatever overlap is left is the stub's last frames
// over a page that has barely set off.
const GO_ON_AFTER_HAND_MS = 260;
const GO_ON_AFTER_TOSS_MS = 380;
const GO_ON_MAX_MS = 900;
// Torn by the scroll, the reader is already on the move: the page (held
// while the paper tears, SCROLL_HOLD_S) goes on as soon as the stub, let go
// downward, has fallen off the screen — at most GO_ON_AFTER_SCROLL_MAX_MS
// after it is let go — so it never crosses the rising globe.
const GO_ON_AFTER_SCROLL_MAX_MS = 450;
const SCROLL_HOLD_S = 0.35;
// On a touch screen the page's own momentum must be over before the glide.
const TOUCH_IDLE_MS = 140;
const arrivalCurve = bezierFn(ARRIVAL_EASE);
const arriveCurve = bezierFn(EASE.arrive);

function documentTop(node: HTMLElement) {
  let top = 0;
  let current: HTMLElement | null = node;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }
  return top;
}

interface Props {
  years: string;
  /** The first chapter of the route (the pass's destination and date). */
  first: PassChapter | null;
  lenisRef: MutableRefObject<Lenis | null>;
  /** Where the page goes on to once the pass is torn (document px): the
   *  explorer's top, the globe (the map above stop 01 on a phone). */
  nextTop: () => number | null;
  /** The globe may come in: HomePage lets go of the atlas's held reveal.
   *  `glide`: the page glides it into view; false when the reader is
   *  already past the pass. */
  onArrive: (glide: boolean) => void;
  /** The glide has landed (or there was none to make): the globe is up,
   *  and HomePage asks for the explorer (the seam). */
  onArrived?: () => void;
  /** The opening film still lies over the page. */
  covered: boolean;
}

export default function EntranceIntro({ years, first, lenisRef, nextTop, onArrive, onArrived, covered }: Props) {
  const passRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const pass = useRef<PassHandle>(null);
  const [torn, setTorn] = useState(false);
  const fields = useMemo(() => passFields(first), [first]);
  const callbacks = useRef({ nextTop, onArrive, onArrived });
  callbacks.current = { nextTop, onArrive, onArrived };
  // The entrance's own moments, shared by the scroll handler and the pass's
  // callbacks (never React state per frame).
  const flow = useRef({
    released: false,
    glided: false,
    gliding: false,
    lastScrollAt: 0,
    goOn: (_how: TearHow) => {},
    stubGone: () => {},
  });

  useEffect(() => {
    const section = passRef.current;
    if (!section) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const state = flow.current;
    let passTop = 0;
    let vh = window.innerHeight;
    let pinEnd = 0;
    let tearY = 0;
    let lastY = window.scrollY;
    let disposed = false;
    let goTimer = 0;
    let tween = 0;
    let glideTimer = 0;

    const release = (glide: boolean) => {
      if (state.released) return;
      state.released = true;
      callbacks.current.onArrive(glide);
    };
    let arrived = false;
    const landed = () => {
      state.gliding = false;
      window.clearTimeout(glideTimer);
      if (arrived) return;
      arrived = true;
      // Keyboard focus left on the pass or its Tear button (now torn, out
      // of the tab order and a screen above) goes on with the page.
      const active = document.activeElement;
      const entrance = section.closest('.entrance');
      if (active instanceof HTMLElement && entrance?.contains(active)) {
        document.getElementById('main-content')?.focus({ preventScroll: true });
      }
      callbacks.current.onArrived?.();
    };

    const measure = () => {
      passTop = documentTop(section);
      vh = window.innerHeight;
      pinEnd = passTop + vh * PASS_PIN;
      tearY = passTop + vh * PASS_PIN * PASS_TEAR_AT;
      apply(false);
    };

    // ── The glide: the pass slides away, the globe rises into place ──
    const glide = () => {
      const next = callbacks.current.nextTop();
      const y = window.scrollY;
      if (next == null || reduce.matches || y >= next - 2) {
        release(false);
        landed();
        return;
      }
      release(true);
      // Inside the pin nothing on screen moves with the scroll (the frame
      // holds the pass, the page above is out of view): the page is set at
      // the pin's end at once — unseen — so every frame of the glide moves.
      const from = y >= passTop && y < pinEnd ? pinEnd : y;
      const duration = ARRIVAL_SECONDS;
      state.gliding = true;
      const lenis = lenisRef.current;
      if (lenis) {
        if (from !== y) lenis.scrollTo(from, { immediate: true, force: true });
        lenis.scrollTo(next, { duration, easing: arrivalCurve, lock: true, force: true, onComplete: landed });
        glideTimer = window.setTimeout(landed, duration * 1000 + 500);
        return;
      }
      // No Lenis (a touch screen): the same glide, frame by frame; a touch
      // or a wheel gives the page back to the reader at once.
      if (from !== y) window.scrollTo({ top: from, behavior: 'instant' as ScrollBehavior });
      const start = performance.now();
      const stop = () => {
        if (tween) cancelAnimationFrame(tween);
        tween = 0;
        window.removeEventListener('touchstart', stop);
        window.removeEventListener('wheel', stop);
        landed();
      };
      window.addEventListener('touchstart', stop, { passive: true, once: true });
      window.addEventListener('wheel', stop, { passive: true, once: true });
      const step = (now: number) => {
        tween = 0;
        if (disposed) return;
        const k = Math.min(1, (now - start) / (duration * 1000));
        window.scrollTo({ top: from + (next - from) * arrivalCurve(k), behavior: 'instant' as ScrollBehavior });
        if (k < 1) tween = requestAnimationFrame(step);
        else stop();
      };
      tween = requestAnimationFrame(step);
    };

    let letGoAt = 0;
    let minWait = 0;
    let stubOut = false;
    const go = (tries: number) => {
      if (disposed) return;
      // A finger's flick is still carrying the page: let it finish.
      if (!lenisRef.current && performance.now() - state.lastScrollAt < TOUCH_IDLE_MS && tries < 25) {
        goTimer = window.setTimeout(() => go(tries + 1), 60);
        return;
      }
      glide();
    };
    state.goOn = (how: TearHow) => {
      if (state.glided) return;
      state.glided = true;
      window.clearTimeout(goTimer);
      letGoAt = performance.now();
      // Torn by the scroll, the reader is already on the move: go on as soon
      // as the stub is off the screen.
      if (how === 'scroll') {
        minWait = 0;
        goTimer = window.setTimeout(() => go(0), stubOut || reduce.matches ? 0 : GO_ON_AFTER_SCROLL_MAX_MS);
        return;
      }
      minWait = how === 'hand' ? GO_ON_AFTER_HAND_MS : GO_ON_AFTER_TOSS_MS;
      goTimer = window.setTimeout(() => go(0), stubOut || reduce.matches ? minWait : GO_ON_MAX_MS);
    };
    state.stubGone = () => {
      stubOut = true;
      if (!state.glided || state.gliding || !letGoAt) return;
      // The stub is off the screen: go on now (after the beat, at least).
      window.clearTimeout(goTimer);
      goTimer = window.setTimeout(() => go(0), Math.max(0, minWait - (performance.now() - letGoAt)));
    };

    // ── The scroll ──
    const apply = (fromScroll: boolean) => {
      const y = window.scrollY;
      const down = y > lastY + 0.5;
      lastY = y;
      if (fromScroll) state.lastScrollAt = performance.now();
      const handle = pass.current;
      const rise = passRise(y, passTop, vh);
      handle?.setRise(rise);
      handle?.setStrain(state.gliding || state.glided ? 0 : scrollStrain(y, passTop, vh));
      const prompt = promptRef.current;
      if (prompt) {
        const shown = Math.max(0, Math.min(1, (rise - 0.72) / 0.28));
        prompt.style.setProperty('--prompt-in', shown.toFixed(3));
      }
      if (!handle) return;
      // Scrolled on past the pass: it tears for the reader. The page holds
      // at the pin a moment while the paper tears (the wheel is held too).
      if (fromScroll && down && !handle.torn() && !state.glided && y >= tearY) {
        handle.tear('scroll');
        const lenis = lenisRef.current;
        if (lenis && !reduce.matches && y < pinEnd) {
          lenis.scrollTo(Math.min(Math.max(y, tearY), pinEnd - 1), { duration: SCROLL_HOLD_S, easing: arriveCurve, lock: true, force: true });
        }
      }
      // Past the pass by any means (a key, a link, a restored position):
      // the globe must be there.
      if (y >= pinEnd && !state.glided && !state.released) {
        release(false);
        landed();
      }
    };
    const onScroll = () => apply(true);

    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    resize?.observe(section);
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.fonts?.ready.then(() => {
      if (!disposed) measure();
    });
    measure();
    return () => {
      disposed = true;
      window.clearTimeout(goTimer);
      window.clearTimeout(glideTimer);
      if (tween) cancelAnimationFrame(tween);
      resize?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', onScroll);
    };
  }, [lenisRef]);

  const onFree = useCallback(() => setTorn(true), []);
  const onLetGo = useCallback((how: TearHow) => flow.current.goOn(how), []);
  const onGone = useCallback(() => flow.current.stubGone(), []);

  return (
    <section className="entrance" aria-label="Opening">
      <div className="entrance-intro">
        <div className="entrance-intro__inner">
          {/* The kicker's dot is bone: the screen's one lime is the scroll
              cue's sweep. */}
          <p className="entrance-kicker">
            <span className="entrance-kicker__dot" aria-hidden="true" />
            <span>Visual Archive</span>
            {years && <span className="entrance-kicker__years">{years}</span>}
          </p>
          <p className="entrance-name" aria-label="Ryan Xu">
            <span className="entrance-line" aria-hidden="true">
              <span className="entrance-rise" data-open-land="ryan">Ryan</span>
            </span>{' '}
            <span className="entrance-line" aria-hidden="true">
              <span className="entrance-rise entrance-rise--late" data-open-land="xu">Xu</span>
            </span>
          </p>
          {/* The words the film found (landing A) fly home to their own
              spans here; the rest of the line comes up round them. */}
          <p className="entrance-words">
            {OPENING_WORDS.map((part, index) =>
              typeof part === 'string' ? (
                <span key={index} className="open-rest">{part}</span>
              ) : (
                <span key={index} className="entrance-found" data-open-land={part.land}>{part.land}</span>
              ),
            )}
          </p>
        </div>
        <p className="entrance-cue" aria-hidden="true">
          <span className="entrance-cue__line" />
          Scroll
        </p>
      </div>
      <div
        ref={passRef}
        className="entrance-pass"
        style={{ ['--pass-pin' as string]: `${PASS_PIN * 100}svh` }}
        data-torn={torn ? '' : undefined}
      >
        <div className="entrance-pass__frame">
          <BoardingPass
            fields={fields}
            handle={pass}
            interactive={!covered}
            onFree={onFree}
            onLetGo={onLetGo}
            onGone={onGone}
          />
          <div ref={promptRef} className="entrance-pass__prompt">
            <p className="entrance-pass__line">{PASS_PROMPT}</p>
            <button
              type="button"
              className="entrance-pass__tear"
              tabIndex={covered || torn ? -1 : 0}
              aria-hidden={torn || undefined}
              onClick={() => pass.current?.tear('button')}
            >
              <span className="entrance-pass__tear-dot" aria-hidden="true" />
              Tear
            </button>
          </div>
          <span className="sr-only" role="status">{torn ? 'The stub is torn off. Boarding.' : ''}</span>
        </div>
      </div>
    </section>
  );
}
