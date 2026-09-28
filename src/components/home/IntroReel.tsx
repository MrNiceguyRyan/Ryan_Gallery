import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  FRAME_DESKTOP,
  FRAME_PHONE,
  PHONE_MAX_WIDTH,
  REEL_DESKTOP,
  REEL_EVENT,
  REEL_PHONE,
  SHUTTER_MS,
  SHUTTER_WAIT_MS,
  chaseFilm,
  coverTransform,
  filmAt,
  filmClock,
  filmSettled,
  filmTarget,
  firstScreenGlobe,
  reelProgressAt,
  reversedElapsed,
  segment,
  shutterAt,
  shutterLatch,
  toDesign,
  type FilmChase,
  type ReelDetail,
  type ReelScore,
  type ReelState,
} from '../../lib/introReel';
import { markReelSeen, recordReelOffset, reelOffsetIn } from '../../lib/reelVisit';
import {
  ReelRenderer,
  phoneMoonTarget,
  shutterCentre,
  viewFor,
  type MoonTarget,
  type ShutterState,
  type View,
} from '../../lib/introReelPaint';

// The canvas never draws finer than 2 device pixels per CSS pixel, and it
// steps down on its own if a machine cannot keep up (see `quality`).
const MAX_DPR = 2;
// Left alone, the cover keeps its slow life at every frame while it is cheap
// (the wallpaper flows 70 design px a second; at 30 fps it visibly steps),
// and drops to ~30 fps on a machine where a frame costs more than 6 ms.
const IDLE_FRAME_MS = 16;
const IDLE_FRAME_SLOW_MS = 33;
// Reduced motion (or no canvas): the still cover holds over a one-screen pin
// and cuts to the page when the first screen is all but in place under it —
// the globe released under it well before, and the cut held (briefly) for
// its tiles.
const STILL_CUT = 0.94;
const STILL_FRAMED = 0.3;
const STILL_TILE_WAIT_MS = 400;
// Without Lenis (a touch screen), the detent is a jump and a short lock.
const TOUCH_LOCK_MS = 600;

function documentTop(node: HTMLElement) {
  let top = 0;
  let current: HTMLElement | null = node;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }
  return top;
}

/**
 * IntroReel — the homepage's opening film.
 *
 * A black hole in a harlequin wallpaper that its gravity bends into a sphere
 * of curves; scrolling turns it into a vortex and then into one ball after
 * another on the same stage (src/lib/introReel.ts has the score), each
 * becoming the next on the ball itself; the last, the moon, glides to where
 * the Earth sits on the first screen, a film camera's viewfinder closes round
 * it and focuses on its limb, and the shutter fires: the blades close and
 * open on the real globe. The archive begins.
 *
 * It is pinned over the top of the page (its wrapper overlaps the first
 * screen by one viewport, so the first screen is in place, under it, when it
 * ends), drawn on one canvas, driven by the scroll through one derived
 * progress value (the geometry is read at resize, never per frame) — and by
 * the film clock that chases it: a ball's hold follows the scroll, a turn
 * into the next ball, once the scroll commits it, plays by itself on one
 * ease-in-out curve (src/lib/introReel.ts, "The film clock").
 *
 * It plays once a tab session: on a later view (back from another page, the
 * wordmark elsewhere) it has been skipped before the first paint
 * (src/lib/reelVisit.ts, html[data-reel="skip"]) and this island does
 * nothing; a reload plays it again.
 *
 * When the shutter fires going down, the page is carried to rest on the
 * first screen as the blades finish (HomePage does that through Lenis; on a
 * touch screen, with no Lenis, this island jumps the page there under the
 * shut blades and holds it still a moment), so the reader arrives on his
 * name and the globe, not somewhere past them.
 *
 * The first paint is the cover as SVG (index.astro renders it into
 * `children`, a static slot the client never recomputes); the canvas draws
 * the same frame over it and it is hidden. Reduced motion keeps that still
 * cover over a one-screen pin and cuts, with a short fade, to the first
 * screen as it arrives under it (the same tree; only CSS and values differ).
 */
export default function IntroReel({ children }: { children?: ReactNode }) {
  const wrapRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    const cover = coverRef.current;
    const cue = cueRef.current;
    if (!wrap || !frame || !canvas) return;
    const root = document.documentElement;
    // A second view in this tab session: the film was decided away before
    // the first paint (src/lib/reelVisit.ts; CSS has collapsed the pin). No
    // pin, no lock, no detent: the page is on show from the start, and
    // HomePage, hearing nothing from here, treats the globe as uncovered.
    if (root.dataset.reel === 'skip') {
      recordReelOffset(0);
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: ReelRenderer | null = null;
    if (!reduce) {
      try {
        renderer = new ReelRenderer(canvas);
      } catch {
        renderer = null;
      }
    }
    // Without a canvas the reel is its still cover, as under reduced motion.
    const still = !renderer;
    const globeReady = () => {
      try {
        return window.__archiveGlobeReady ? window.__archiveGlobeReady() : true;
      } catch {
        return true;
      }
    };

    // ── Geometry: read at resize only ──
    let top = 0;
    let pinned = 1;
    let phone = false;
    let score: ReelScore = REEL_DESKTOP;
    let target: MoonTarget | null = null;
    let centre: [number, number] = [0, 0];
    let view: View = { x0: 0, y0: 0, x1: FRAME_DESKTOP.w, y1: FRAME_DESKTOP.h };
    let unit = 1;
    let quality = 1;
    let idleFrameMs = IDLE_FRAME_MS;
    const measure = () => {
      top = documentTop(wrap);
      const viewW = frame.clientWidth;
      const viewH = frame.clientHeight;
      pinned = Math.max(1, wrap.offsetHeight - viewH);
      phone = window.innerWidth <= PHONE_MAX_WIDTH;
      score = phone ? REEL_PHONE : REEL_DESKTOP;
      const design = phone ? FRAME_PHONE : FRAME_DESKTOP;
      const fit = coverTransform(design, viewW, viewH);
      view = viewFor(fit, viewW, viewH);
      unit = 1 / fit.s;
      renderer?.resize(viewW, viewH, Math.min(MAX_DPR, window.devicePixelRatio || 1) * quality, design, phone, fit);
      if (phone) {
        target = phoneMoonTarget({ w: design.w, h: design.h, phone, t: 0, p: 1, a: 1, view });
      } else {
        const globe = firstScreenGlobe(viewW, viewH);
        const [x, y] = toDesign(fit, globe.x, globe.y);
        target = { x, y, r: globe.r / fit.s };
      }
      centre = shutterCentre(design, phone, view) as [number, number];
      // The first screen's distance from the top, on this history entry, so
      // a scroll saved here is restored to the same place with or without
      // the film (src/lib/reelVisit.ts).
      recordReelOffset(reelOffsetIn(document));
    };
    measure();

    // ── State ──
    const progress = () => reelProgressAt(window.scrollY - top, pinned);
    let p = progress();
    // The film clock (src/lib/introReel.ts): the scroll's target on the film,
    // and the film's own position chasing it — turns play by themselves.
    let filmGoal = filmTarget(score, p, p);
    let chase: FilmChase = { tau: filmClock(score, filmGoal), v: 0 };
    let film = filmAt(score, chase.tau);
    let chaseScore = score;
    let fired = still ? p >= STILL_CUT : p >= score.fire;
    let release = -1;
    let releaseToPage = true;
    // The latch has fired but the film is still catching up: the blades wait
    // for it (at most SHUTTER_WAIT_MS) while the detent carries the page.
    let pending = -1;
    // The blades may hold shut for the globe's tiles (at most SHUTTER_MS.hold).
    let heldSince = -1;
    let holdDone = false;
    let touchJumped = false;
    let touchLock = 0;
    let stillCutWait = -1;
    let state: ReelState = fired ? 'page' : 'reel';
    let framed = fired || p >= (still ? STILL_FRAMED : score.beats[score.beats.length - 1].at);
    let finderUp = false;
    let seen = false;
    let lastP = p;
    let lastMove = performance.now();
    let lastNow = 0;
    let lastDraw = 0;
    let clock = 0;
    let drawn = false;
    let raf = 0;
    let disposed = false;
    const costs: number[] = [];

    const publish = () => {
      const detail: ReelDetail = { state, framed, fired, blades: release >= 0 };
      window.__archiveReel = detail;
      root.dataset.reel = state;
      window.dispatchEvent(new CustomEvent<ReelDetail>(REEL_EVENT, { detail }));
    };
    const setFinder = (on: boolean) => {
      if (on === finderUp) return;
      finderUp = on;
      if (on) root.dataset.reelFinder = '';
      else delete root.dataset.reelFinder;
    };
    const show = (on: boolean, interactive: boolean) => {
      frame.style.visibility = on ? 'visible' : 'hidden';
      frame.style.pointerEvents = on && interactive ? 'auto' : 'none';
      // The film has been on screen: a later view in this session skips it.
      if (on && !seen) {
        seen = true;
        markReelSeen();
      }
    };
    publish();
    show(!fired, !fired);

    const tick = (now: number) => {
      raf = 0;
      if (disposed || document.hidden) {
        lastNow = 0;
        return;
      }
      const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
      lastNow = now;
      p = progress();
      if (Math.abs(p - lastP) > 1e-5) {
        lastP = p;
        lastMove = now;
      }

      if (still) {
        // Reduced motion (or no canvas): the still cover, then a cut — a
        // short fade — to the page as its first screen arrives under it. The
        // globe is let go under the cover a good way before, and the cut
        // waits a moment for its tiles if they are not in yet.
        let next: ReelState = 'reel';
        if (p >= STILL_CUT) {
          if (state === 'page' || globeReady()) next = 'page';
          else {
            if (stillCutWait < 0) stillCutWait = now;
            if (now - stillCutWait >= STILL_TILE_WAIT_MS) next = 'page';
          }
        } else {
          stillCutWait = -1;
        }
        const nextFramed = next === 'page' || p >= STILL_FRAMED;
        const nextFired = next === 'page';
        if (next !== state || nextFramed !== framed || nextFired !== fired) {
          state = next;
          framed = nextFramed;
          fired = nextFired;
          publish();
        }
        frame.style.opacity = state === 'reel' ? '1' : '0';
        frame.style.pointerEvents = state === 'reel' ? 'auto' : 'none';
        if (state === 'reel') {
          frame.style.visibility = 'visible';
          if (!seen) {
            seen = true;
            markReelSeen();
          }
        }
        // A cut waiting on the tiles looks again next frame.
        if (stillCutWait >= 0 && state === 'reel') raf = requestAnimationFrame(tick);
        return;
      }

      // The film chases the scroll (a new score after a resize across the
      // phone line starts from where the scroll is).
      if (chaseScore !== score) {
        chaseScore = score;
        filmGoal = filmTarget(score, p, p);
        chase = { tau: filmClock(score, filmGoal), v: 0 };
      }
      filmGoal = filmTarget(score, p, filmGoal);
      const goalTau = filmClock(score, filmGoal);
      chase = chaseFilm(chase, goalTau, dt);
      film = filmAt(score, chase.tau);
      const filmMoving = !filmSettled(chase, goalTau);
      // The film has glided into the corner and the finder is up (or there
      // is nothing left to wait for: the scroll's own target is short of it).
      const filmReady = film >= Math.min(score.glide[1], filmGoal) - 1e-3;

      // The shutter: fires going down past `fire`, back going up past `rearm`.
      const latched = shutterLatch(score, fired, p);
      if (latched !== fired) {
        fired = latched;
        heldSince = -1;
        holdDone = !latched;
        touchJumped = false;
        // (Only with Lenis, whose detent holds the page meanwhile: a touch
        // screen's momentum would carry it past the pin, so there the
        // blades go at once.)
        if (latched && release < 0 && !filmReady && root.classList.contains('lenis')) {
          pending = now;
        } else if (!latched && pending >= 0) {
          // Fired back before the blades had moved: nothing to reverse.
          pending = -1;
        } else {
          const elapsed = release >= 0 ? now - release : -1;
          release = now - (elapsed >= 0 ? reversedElapsed(elapsed) : 0);
          releaseToPage = latched;
        }
      }
      if (pending >= 0 && (filmReady || now - pending >= SHUTTER_WAIT_MS)) {
        pending = -1;
        release = now;
        releaseToPage = true;
      }
      // Shut, going to the page: hold the blades closed until the globe's
      // tiles are in (a slower shutter speed), for at most SHUTTER_MS.hold.
      if (release >= 0 && releaseToPage && !holdDone && now - release >= SHUTTER_MS.close) {
        if (heldSince < 0) heldSince = now;
        if (!globeReady() && now - heldSince < SHUTTER_MS.hold) release = now - SHUTTER_MS.close;
        else holdDone = true;
      }
      let shutter: ShutterState | null = null;
      let showsPage = fired && pending < 0;
      if (release >= 0) {
        const blades = shutterAt(now - release, releaseToPage);
        showsPage = blades.showsPage;
        if (blades.done) release = -1;
        else shutter = { closed: blades.closed, revealed: blades.showsPage, cx: centre[0], cy: centre[1], view, unit };
        // No Lenis (a touch screen): under the shut blades, jump the page to
        // the first screen and hold it still a moment (body overflow: clip,
        // the one lock that keeps the sticky atlas in place).
        if (releaseToPage && !touchJumped && blades.closed >= 0.98 && !root.classList.contains('lenis')) {
          touchJumped = true;
          window.scrollTo({ top: top + pinned, behavior: 'instant' as ScrollBehavior });
          const body = document.body;
          const previous = body.style.overflow;
          body.style.overflow = 'clip';
          window.clearTimeout(touchLock);
          touchLock = window.setTimeout(() => {
            if (body.style.overflow === 'clip') body.style.overflow = previous;
          }, TOUCH_LOCK_MS);
        }
      }
      const nextState: ReelState = showsPage ? 'page' : 'reel';
      // Framed: the globe behind may start to appear (HomePage releases its
      // reveal) — from the moon's arrival, so its fade, dawn and first turn
      // (and the tiles they ask for) are done when the blades open on it.
      const nextFramed = fired || p >= score.beats[score.beats.length - 1].at;
      const blading = release >= 0;
      if (nextState !== state || nextFramed !== framed || (window.__archiveReel?.blades ?? false) !== blading || (window.__archiveReel?.fired ?? false) !== fired) {
        state = nextState;
        framed = nextFramed;
        publish();
      }
      // The nav steps out while the reader looks through the camera.
      setFinder(state === 'reel' && film >= score.finder[0]);
      // While the blades move, the frame is held to the viewport: the click
      // fires a little before the pin ends, and the page is carried on under
      // it to the first screen.
      const pinnedStyle = shutter ? 'fixed' : '';
      if (frame.style.position !== pinnedStyle) frame.style.position = pinnedStyle;
      if (fired && release < 0 && pending < 0) {
        // The archive is on show: the canvas is off until the reader comes back.
        show(false, false);
        return;
      }
      show(true, !showsPage || !!shutter);

      clock += dt;
      const busy = !!shutter || pending >= 0 || filmMoving || now - lastMove < 240;
      if (busy || now - lastDraw >= idleFrameMs - 2 || !drawn) {
        const start = performance.now();
        renderer?.render(score, film, p, clock, target, shutter);
        const cost = performance.now() - start;
        lastDraw = now;
        if (!drawn) {
          drawn = true;
          if (cover) cover.style.visibility = 'hidden';
        }
        if (cue) cue.style.opacity = String(1 - segment(p, 0.004, 0.03));
        // A machine that cannot keep up draws coarser, once and for all.
        costs.push(cost);
        if (costs.length >= 24) {
          const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
          costs.length = 0;
          if (mean > 6) idleFrameMs = IDLE_FRAME_SLOW_MS;
          if (mean > 10 && quality > 0.62) {
            quality = Math.max(0.62, quality * 0.82);
            measure();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(tick);
    };

    // Lenis starts its own frame loop in HomePage's effect, after this one;
    // starting ours from a task keeps it after Lenis' in every frame, so the
    // reel reads the scroll Lenis has just written.
    const boot = window.setTimeout(wake, 0);
    let resizeFrame = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        measure();
        drawn = false;
        wake();
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
    observer?.observe(frame);
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', wake, { passive: true });
    document.addEventListener('visibilitychange', wake);
    // The page below settles its own layout after hydration (fonts, the
    // atlas): the reel's own box does not move, but re-read once it has.
    window.addEventListener('load', onResize, { once: true });

    return () => {
      disposed = true;
      window.clearTimeout(boot);
      window.clearTimeout(touchLock);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', wake);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('load', onResize);
      // (Only what this island wrote: an in-site arrival may already have
      // swapped in the next page's own decision, "skip" among them.)
      if (root.dataset.reel === state) delete root.dataset.reel;
      delete root.dataset.reelFinder;
      window.__archiveReel = undefined;
    };
  }, []);

  const heights = {
    ['--reel-h-phone' as string]: `${Math.round((REEL_PHONE.screens + 1) * 100)}svh`,
    ['--reel-h-desktop' as string]: `${Math.round((REEL_DESKTOP.screens + 1) * 100)}svh`,
  } as CSSProperties;

  return (
    <section
      ref={wrapRef}
      aria-hidden="true"
      className="intro-reel pointer-events-none relative z-40 -mb-[100svh]"
      style={heights}
    >
      <div
        ref={frameRef}
        className="intro-reel__frame sticky left-0 top-0 h-[100lvh] w-full overflow-hidden lg:h-[100svh]"
      >
        <div ref={coverRef} className="intro-reel__cover absolute inset-0">
          {children}
        </div>
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
        {/* The scroll cue, the one lime on the cover: a plumb line dropped
            from the hole's lower rim to the foot of the screen, a dash of
            light running down it, and SCROLL at its foot on an ink pill.
            Placed in the design frame's own units (container units, the
            same cover fit as the canvas), so the server's first paint has it
            where the hole is. */}
        <div ref={cueRef} className="intro-reel__cue pointer-events-none absolute inset-0">
          <span className="intro-reel__plumb" aria-hidden="true" />
          <span className="intro-reel__pill absolute left-1/2 flex -translate-x-1/2 items-center rounded-full bg-[#16190f] px-4 py-2 font-ui text-[11px] uppercase leading-none tracking-[0.1em] text-[#F4F4ED]/90 shadow-[0_8px_30px_rgba(22,25,15,0.28)]">
            Scroll
          </span>
        </div>
      </div>
    </section>
  );
}
