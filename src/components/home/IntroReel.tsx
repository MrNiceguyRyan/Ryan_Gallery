import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  FRAME_DESKTOP,
  FRAME_PHONE,
  PHONE_MAX_WIDTH,
  REEL_DESKTOP,
  REEL_EVENT,
  REEL_PHONE,
  coverTransform,
  firstScreenGlobe,
  reelProgressAt,
  reversedElapsed,
  segment,
  shutterAt,
  shutterLatch,
  toDesign,
  type ReelDetail,
  type ReelScore,
  type ReelState,
} from '../../lib/introReel';
import { ReelRenderer, shutterCentre, type MoonTarget, type ShutterState } from '../../lib/introReelPaint';

// The canvas never draws finer than 2 device pixels per CSS pixel, and it
// steps down on its own if a machine cannot keep up (see `quality`).
const MAX_DPR = 2;
// Left alone, the reel keeps its slow life at ~30 fps.
const IDLE_FRAME_MS = 33;
// Reduced motion (or no canvas): the still cover holds over a one-screen pin
// and cuts to the page when the first screen is all but in place under it.
const STILL_CUT = 0.94;

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
 * of curves; scrolling turns it into a vortex and then into a run of spheres
 * (src/lib/introReel.ts has the score), each becoming the next; the last, the
 * moon, glides to where the Earth sits on the first screen, a film camera's
 * viewfinder closes round it and focuses on its limb, and the shutter fires:
 * the blades close and open on the real globe. The archive begins.
 *
 * It is pinned over the top of the page (its wrapper overlaps the first
 * screen by one viewport, so the first screen is in place, under it, when it
 * ends), drawn on one canvas, driven by the scroll through one derived
 * progress value (the geometry is read at resize, never per frame).
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

    // ── Geometry: read at resize only ──
    let top = 0;
    let pinned = 1;
    let phone = false;
    let score: ReelScore = REEL_DESKTOP;
    let target: MoonTarget | null = null;
    let centre: [number, number] = [0, 0];
    let quality = 1;
    let viewW = 0;
    let viewH = 0;
    const measure = () => {
      top = documentTop(wrap);
      viewW = frame.clientWidth;
      viewH = frame.clientHeight;
      pinned = Math.max(1, wrap.offsetHeight - viewH);
      phone = window.innerWidth <= PHONE_MAX_WIDTH;
      score = phone ? REEL_PHONE : REEL_DESKTOP;
      const design = phone ? FRAME_PHONE : FRAME_DESKTOP;
      const fit = coverTransform(design, viewW, viewH);
      renderer?.resize(viewW, viewH, Math.min(MAX_DPR, window.devicePixelRatio || 1) * quality, design, phone, fit);
      if (phone) {
        target = null;
      } else {
        const globe = firstScreenGlobe(viewW, viewH);
        const [x, y] = toDesign(fit, globe.x, globe.y);
        target = { x, y, r: globe.r / fit.s };
      }
      centre = shutterCentre(design, phone) as [number, number];
    };
    measure();

    // ── State ──
    const progress = () => reelProgressAt(window.scrollY - top, pinned);
    let p = progress();
    let fired = still ? p >= STILL_CUT : p >= score.fire;
    let release = -1;
    let releaseToPage = true;
    let state: ReelState = fired ? 'page' : 'reel';
    let framed = fired || (!still && p >= score.finder[0]);
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
      const detail: ReelDetail = { state, framed };
      window.__archiveReel = detail;
      root.dataset.reel = state;
      window.dispatchEvent(new CustomEvent<ReelDetail>(REEL_EVENT, { detail }));
    };
    const show = (on: boolean, interactive: boolean) => {
      frame.style.visibility = on ? 'visible' : 'hidden';
      frame.style.pointerEvents = on && interactive ? 'auto' : 'none';
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
        // short fade — to the page as its first screen arrives under it.
        const next: ReelState = p >= STILL_CUT ? 'page' : 'reel';
        if (next !== state) {
          state = next;
          framed = next === 'page';
          publish();
        }
        frame.style.opacity = state === 'reel' ? '1' : '0';
        frame.style.pointerEvents = state === 'reel' ? 'auto' : 'none';
        if (state === 'reel') frame.style.visibility = 'visible';
        return;
      }

      // The shutter: fires going down past `fire`, back going up past `rearm`.
      const latched = shutterLatch(score, fired, p);
      if (latched !== fired) {
        const elapsed = release >= 0 ? now - release : -1;
        release = now - (elapsed >= 0 ? reversedElapsed(elapsed) : 0);
        releaseToPage = latched;
        fired = latched;
      }
      let shutter: ShutterState | null = null;
      let showsPage = fired;
      if (release >= 0) {
        const blades = shutterAt(now - release, releaseToPage);
        showsPage = blades.showsPage;
        if (blades.done) release = -1;
        else shutter = { closed: blades.closed, revealed: blades.showsPage, cx: centre[0], cy: centre[1] };
      }
      const nextState: ReelState = showsPage ? 'page' : 'reel';
      // Framed: the globe behind may start to appear (HomePage releases its
      // reveal), so it is there, its dawn under way, when the blades open.
      const nextFramed = fired || p >= score.finder[0];
      if (nextState !== state || nextFramed !== framed) {
        state = nextState;
        framed = nextFramed;
        publish();
      }
      // While the blades move, the frame is held to the viewport: the click
      // fires a few dozen pixels before the pin ends, and a brisk scroll
      // would otherwise carry the viewfinder up the page mid-click.
      const pinnedStyle = shutter ? 'fixed' : '';
      if (frame.style.position !== pinnedStyle) frame.style.position = pinnedStyle;
      if (fired && release < 0) {
        // The archive is on show: the canvas is off until the reader comes back.
        show(false, false);
        return;
      }
      show(true, !showsPage || !!shutter);

      clock += dt;
      const busy = !!shutter || now - lastMove < 240;
      if (busy || now - lastDraw >= IDLE_FRAME_MS || !drawn) {
        const start = performance.now();
        renderer?.render(score, p, clock, target, shutter);
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
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', wake);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('load', onResize);
      delete root.dataset.reel;
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
        {/* The one lime mark on the cover: the scroll cue's sweep, on an ink
            pill so it reads over the wallpaper. */}
        <div
          ref={cueRef}
          className="intro-reel__cue absolute bottom-[max(4.5svh,1.5rem)] left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-[#16190f] py-2.5 pl-3.5 pr-4 font-ui text-[10px] uppercase tracking-[0.1em] text-[#F4F4ED]/85 shadow-[0_8px_30px_rgba(22,25,15,0.28)]"
        >
          <span className="prologue-scroll-cue relative block h-5 w-px overflow-hidden bg-white/25" />
          Scroll
        </div>
      </div>
    </section>
  );
}
