import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cancelFrame, cubicBezier, frame, type MotionValue } from 'framer-motion';
import type { Map as MapboxMap } from 'mapbox-gl';
import { PROLOGUE_TURN, type GlobeChannel } from '../../lib/globeLook';
import { planetOnScreen } from '../../lib/planetLight';
import { globeDepth, warmSatelliteTiles } from '../../lib/eggExposure';
import { CSS_EASE, DUR_MS, EASE } from '../../lib/motion';
import {
  EGG,
  blurAngle,
  bulbLabel,
  bulbSettleAt,
  bulbSettleSpeed,
  bulbWindSpeed,
  calmNext,
  captionArc,
  coastAt,
  coastSpeed,
  composeEgg,
  developAt,
  dragDegrees,
  exposedLabel,
  giveAt,
  handBackDecision,
  nudgeAt,
  nudgeSpeed,
  planBulbStop,
  planBulbTarget,
  planCoast,
  releaseVelocity,
  ticketPlacement,
  wrap180,
  type CoastPlan,
} from '../../lib/globeEgg';
import { stockPaper } from '../../lib/ticketStock';
import {
  TEAR_BEFORE_FLIGHT_MS,
  TEAR_FREE_MS,
  TEAR_MS,
  TEAR_REDUCED_MS,
  affineCss,
  tearPose,
  tornEdge,
} from '../../lib/ticketTear';
import type { AtlasVoyage, RouteStop } from './RouteAtlas';

// ── The globe's easter eggs (see src/lib/globeEgg.ts for the maths and
// src/lib/eggExposure.ts for the photograph) ──
// Only on the first screen, only for a mouse or a pen, only while the planet
// sits in the corner: grab it and fling it (the desk globe, shot at 1/30 s),
// or press and hold still (BULB, a real long exposure). Every beat is a
// photographic operation on the print; what the egg hands the reader is the
// archive's own ADMIT ONE ticket, torn like the archive's plates. Two rules
// hold throughout:
//  • RouteAtlas's camera stays the only thing that moves the map. This
//    controller only changes numbers on the shared GlobeChannel and asks the
//    camera for a frame; nothing here calls jumpTo or writes paint.
//  • While a hand is on the globe NOTHING else on the page moves: the press is
//    captured (no text selection, no drag), every egg node is position: fixed
//    inside an overflow: clip layer (no scroll width), the idle drift is
//    frozen, and no wheel is ever prevented or eaten here —
//    the reader's scroll always wins and hands the globe back.
// The mode is written to <html data-globe-egg> on transitions only (CSS and
// probes read it); nothing here sets React state per frame.

type Mode = 'idle' | 'armed' | 'drag' | 'bulb' | 'coast' | 'landed' | 'parked' | 'pinned' | 'returning' | 'voyage';

interface EggChapter {
  stop: RouteStop;
  chapterIndex: number;
}

interface Props {
  map: MapboxMap;
  channel: GlobeChannel;
  route: readonly EggChapter[];
  /** Prologue progress 0..1. */
  progress: MotionValue<number>;
  /** The canvas's first tiles are in and it has faded in. */
  revealed: boolean;
  /** A Story covers the atlas. */
  paused: boolean;
  voyage: AtlasVoyage | null;
  reducedMotion: boolean;
  /** How far the map canvas bleeds past the viewport on each side (css px). */
  bleed: number;
  onNavigate?: (chapterId: string) => void;
}

const HAND_BACK_KEYS = new Set(['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', ' ', 'Spacebar', 'Home', 'End']);
// The approved wording (uppercase in CSS).
const CAPTION_TEXT = 'Drag to spin · Hold to expose';
// The ticket at rest lies on the print with a little curl, lifted at its
// free end; it is dealt in from above the surface.
const TICKET_REST = 'translate(0px, 0px) perspective(900px) rotateY(-5deg) rotateX(1.5deg) rotate(-1.6deg)';
const TICKET_DEALT_FROM = 'translate(-16px, 20px) perspective(900px) rotateY(-12deg) rotateX(4deg) rotate(-7deg)';
const SHADOW_REST = 'translate(4px, 8px) skewY(2.2deg) scaleX(1.02)';
const SHADOW_DEALT_FROM = 'translate(18px, 34px) skewY(2.2deg) scaleX(1.02)';
// The torn stub's last beat (it goes with the page), ms.
const DUR_STUB = 320;
// The tear's aside on the ticket's own scale: the score carries a face 0.11
// of `vw` to the left, so passing its width × this carries this one about a
// quarter of its width, as an archive plate is carried.
const EGG_TEAR_ASIDE_SCALE = 2.4;
const ease = {
  arrive: cubicBezier(...EASE.arrive),
  leave: cubicBezier(...EASE.leave),
  fade: cubicBezier(...EASE.fade),
  travel: cubicBezier(...EASE.travel),
};
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const cubicInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const pad2 = (value: number) => String(value).padStart(2, '0');

// The first-hover caption shows once a session. Every storage read and write
// is guarded (private windows, blocked storage); the module flag keeps it to
// once a page load when storage says nothing.
let captionSeenThisLoad = false;
const captionSeen = () => {
  if (captionSeenThisLoad) return true;
  try {
    return window.sessionStorage.getItem(EGG.CAPTION.key) === '1';
  } catch {
    return false;
  }
};
const markCaptionSeen = () => {
  captionSeenThisLoad = true;
  try {
    window.sessionStorage.setItem(EGG.CAPTION.key, '1');
  } catch {
    // The module flag stands in.
  }
};

export default function GlobeEggs({
  map,
  channel,
  route,
  progress,
  revealed,
  paused,
  voyage,
  reducedMotion,
  bleed,
  onNavigate,
}: Props) {
  const hitRef = useRef<HTMLDivElement>(null);
  const markSlotRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const markDotRef = useRef<HTMLElement>(null);
  const markNumRef = useRef<HTMLSpanElement>(null);
  const arcRef = useRef<SVGSVGElement>(null);
  const arcGroupRef = useRef<SVGGElement>(null);
  const arcPathRef = useRef<SVGPathElement>(null);
  const arcSweepRef = useRef<SVGPathElement>(null);
  const arcTextRef = useRef<SVGTextPathElement>(null);
  const tickARef = useRef<SVGLineElement>(null);
  const tickBRef = useRef<SVGLineElement>(null);
  const ticketSlotRef = useRef<HTMLDivElement>(null);
  const ticketRef = useRef<HTMLButtonElement>(null);
  const faceRef = useRef<HTMLSpanElement>(null);
  const faceShadowRef = useRef<HTMLSpanElement>(null);
  const faceContactRef = useRef<HTMLSpanElement>(null);
  const stubRef = useRef<HTMLSpanElement>(null);
  const stubShadowRef = useRef<HTMLSpanElement>(null);
  const stubContactRef = useRef<HTMLSpanElement>(null);
  const printRef = useRef<HTMLCanvasElement>(null);
  const ordinalRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const kickerRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const metaRef = useRef<HTMLSpanElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);
  // Props the controller reads on demand; it is built once per map and route
  // and must not restart (and drop a play) when these change.
  const live = useRef({ revealed, paused, voyage, reducedMotion, onNavigate });
  live.current = { revealed, paused, voyage, reducedMotion, onNavigate };
  const controllerRef = useRef<{ sync: () => void; abort: () => void; voyageChanged: (next: AtlasVoyage | null) => void } | null>(null);

  useEffect(() => {
    const hit = hitRef.current;
    const markSlot = markSlotRef.current;
    const mark = markRef.current;
    const markDot = markDotRef.current;
    const markNum = markNumRef.current;
    const arc = arcRef.current;
    const arcGroup = arcGroupRef.current;
    const arcPath = arcPathRef.current;
    const arcSweep = arcSweepRef.current;
    const arcText = arcTextRef.current;
    const tickA = tickARef.current;
    const tickB = tickBRef.current;
    const ticketSlot = ticketSlotRef.current;
    const ticket = ticketRef.current;
    const face = faceRef.current;
    const faceShadow = faceShadowRef.current;
    const faceContact = faceContactRef.current;
    const stub = stubRef.current;
    const stubShadow = stubShadowRef.current;
    const stubContact = stubContactRef.current;
    const print = printRef.current;
    const liveRegion = liveRef.current;
    if (
      !hit || !markSlot || !mark || !markDot || !markNum || !arc || !arcGroup || !arcPath || !arcSweep || !arcText ||
      !tickA || !tickB || !ticketSlot || !ticket || !face || !faceShadow || !faceContact || !stub || !stubShadow ||
      !stubContact || !print || !liveRegion || !route.length
    ) return;

    const root = document.documentElement;
    const places = route.map((entry) => ({ lng: entry.stop.coordinates[0], lat: entry.stop.coordinates[1] }));
    channel.places = route.map((entry) => [entry.stop.coordinates[0], entry.stop.coordinates[1]] as const);
    const fineQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const wideQuery = window.matchMedia('(min-width: 1024px)');
    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Reduced motion keeps the same states with calm values: no give, no
    // hover glow, no smear, landings in one frame, a still exposure, tickets
    // by opacity.
    const calm = () => live.current.reducedMotion || reduceQuery.matches;
    const keyButton = () => document.querySelector<HTMLButtonElement>('.globe-egg-key');

    let disposed = false;
    let mode: Mode = 'idle';
    // The absolute centre longitude while a hand, a coast or a landing holds
    // the globe (NaN otherwise: then the channel's offset and pin apply). Held
    // absolute so a landing is exact even if the load-in settle is still
    // easing the natural turn underneath it.
    let hold = Number.NaN;
    let landed = -1;
    // The last places dealt (indices, most recent last), for variety.
    const dealt: number[] = [];
    let calmLast = -1;
    let viaKeyboard = false;
    let exposedText = '';
    let printImage: ImageData | null = null;
    let lastScrollY = window.scrollY;
    let voyageSeen = false;
    let voyageTimer = 0;
    let tearTimer = 0;
    let dawnTimer = 0;
    let captionTimer = 0;
    let captionLeaveTimer = 0;
    let captionCapTimer = 0;
    let readoutTimer = 0;
    let poolRestTimer = 0;
    let coolTimer = 0;
    let ticketSize = { w: 300, h: 104 };
    let faceSize = { w: 244, h: 104 };
    // Which chapter's torn edge (and at what seam length) the ticket holds.
    let edgeFor = '';
    let viewport = { w: root.clientWidth, h: window.innerHeight };
    let ticketAnimations: Animation[] = [];
    let marksFor = -1;
    let marksListening = false;
    // The BULB press under way (see "BULB" below).
    let bulb: {
      phase: 'wind' | 'open';
      index: number;
      /** The absolute centre longitude the exposure settles on. */
      target: number;
      last: number;
      omega: number;
      /** The press: the hold the reader makes is the exposure they are told
       *  about (a BULB counts from the button, not from the motor's wind). */
      pressedAt: number;
      openedAt: number;
      R0: number;
      fromOpen: number;
      tenth: number;
    } | null = null;

    const setMode = (next: Mode) => {
      mode = next;
      channel.mode = next;
      if (next === 'idle') delete root.dataset.globeEgg;
      else root.dataset.globeEgg = next;
      placeDisc();
    };

    // ── One frame loop, in the frame's update step, so the camera's draw
    // (scheduled from here) lands in the same frame ──
    const jobs = new Map<string, (now: number) => boolean | void>();
    let ticking = false;
    let repaint = false;
    const tick = () => {
      const now = performance.now();
      repaint = false;
      jobs.forEach((job, name) => {
        if (job(now) === false) jobs.delete(name);
      });
      channel.requestDraw();
      // The light and the egg layers read the channel on their own render:
      // ask for one.
      if (repaint) map.triggerRepaint();
      if (!jobs.size) {
        cancelFrame(tick);
        ticking = false;
      }
    };
    const run = (name: string, job: (now: number) => boolean | void) => {
      jobs.set(name, job);
      if (!ticking && !disposed) {
        ticking = true;
        frame.update(tick, true);
      }
    };
    const stop = (...names: string[]) => names.forEach((name) => jobs.delete(name));

    const easeHover = (target: number, duration: number) => {
      const from = channel.hover;
      if (from === target && !jobs.has('hover')) return;
      const t0 = performance.now();
      run('hover', (now) => {
        const u = duration > 0 ? clamp01((now - t0) / duration) : 1;
        channel.hover = from + (target - from) * u;
        repaint = true;
        if (u >= 1) return false;
      });
    };

    // ── Where things are (camera maths, never a layout read per frame) ──
    const planetInViewport = () => {
      const planet = planetOnScreen(map);
      return planet ? { x: planet.x - bleed, y: planet.y - bleed, r: planet.r } : null;
    };
    const composedCenter = () => {
      const natural = channel.natural;
      if (Number.isFinite(hold)) return hold;
      return Number.isFinite(natural) ? composeEgg(natural, channel, EGG.PIN_W, PROLOGUE_TURN.dir) : Number.NaN;
    };

    const allowed = () => {
      const props = live.current;
      return props.revealed && channel.revealed && channel.dawn >= 0.6 &&
        progress.get() < EGG.Q_MAX && wideQuery.matches && fineQuery.matches &&
        !props.paused && !props.voyage && document.visibilityState === 'visible' &&
        Number.isFinite(channel.natural);
    };

    // The hit disc is the planet's true limb; it exists only while the globe
    // can be picked up (or is being played with).
    let discKey = '';
    const placeDisc = () => {
      const on = allowed() || mode === 'armed' || mode === 'drag' || mode === 'bulb' ||
        mode === 'coast' || mode === 'landed' || mode === 'parked';
      const planet = on ? planetInViewport() : null;
      if (!planet) {
        if (discKey !== 'off') {
          discKey = 'off';
          hit.style.display = 'none';
          if (channel.hover > 0) easeHover(0, calm() ? 0 : EGG.HOVER_MS);
        }
        return;
      }
      const key = `${planet.x.toFixed(1)}|${planet.y.toFixed(1)}|${planet.r.toFixed(1)}`;
      if (key === discKey) return;
      discKey = key;
      hit.style.display = 'block';
      hit.style.width = `${2 * planet.r}px`;
      hit.style.height = `${2 * planet.r}px`;
      hit.style.transform = `translate(${planet.x - planet.r}px, ${planet.y - planet.r}px)`;
    };

    // ── The render targets: taken while a hand is near, given back when idle ──
    const warm = () => {
      window.clearTimeout(coolTimer);
      coolTimer = 0;
      if (!channel.warm) {
        channel.warm = true;
        map.triggerRepaint();
      }
      warmSatelliteTiles(map, channel.places);
    };
    const coolLater = (delay: number = EGG.WARM_IDLE_MS) => {
      window.clearTimeout(coolTimer);
      coolTimer = window.setTimeout(() => {
        coolTimer = 0;
        if (disposed || !channel.warm) return;
        if (mode !== 'idle' && mode !== 'pinned' && mode !== 'returning') {
          coolLater();
          return;
        }
        if (channel.exposure.phase !== 'off' || channel.pool.amount > 0) {
          coolLater();
          return;
        }
        channel.warm = false;
        map.triggerRepaint();
      }, delay);
    };

    // ── The shutter's smear follows the known spin; the marks go with it ──
    const setSpin = (spin: number) => {
      channel.spin = spin;
      if (!channel.marksHidden && !calm() && blurAngle(spin) > EGG.MARKS_CUT) {
        channel.marksHidden = true;
        channel.requestDraw();
      }
      repaint = true;
    };
    const restoreMarks = () => {
      if (!channel.marksHidden) return;
      channel.marksHidden = false;
      channel.requestDraw();
    };
    const clearExposure = () => {
      bulb = null;
      stop('bulb', 'develop');
      channel.exposure.phase = 'off';
      channel.exposure.u = 0;
      channel.wantPrint = false;
      map.triggerRepaint();
    };

    // ── The limb's engraving: the caption, then the BULB readout ──
    let arcShown: 'caption' | 'readout' | null = null;
    let arcWords = '';
    let arcWordsLength = 0;
    let arcPlanet: { x: number; y: number; r: number } | null = null;
    let arcAnimations: Animation[] = [];
    const layoutArc = () => {
      const planet = planetInViewport();
      if (!planet) return false;
      arcPlanet = planet;
      const geometry = captionArc(planet, arcWordsLength);
      arcPath.setAttribute('d', geometry.d);
      arcSweep.setAttribute('d', geometry.d);
      return true;
    };
    const setArcWords = (words: string, strong = false) => {
      arc.classList.toggle('globe-egg-arc--strong', strong);
      if (words === arcWords) return;
      const measure = words.length !== arcWords.length || !arcWordsLength;
      arcWords = words;
      arcText.textContent = words;
      // One text-length read per change of length (tabular figures hold the
      // width while the tenths count).
      if (measure) arcWordsLength = arcText.getComputedTextLength?.() || 0;
      if (!arcPlanet) return;
      const [a, b] = captionArc(arcPlanet, arcWordsLength).ticks;
      [[tickA, a], [tickB, b]].forEach(([line, [x1, y1, x2, y2]]) => {
        (line as SVGLineElement).setAttribute('x1', (x1 as number).toFixed(1));
        (line as SVGLineElement).setAttribute('y1', (y1 as number).toFixed(1));
        (line as SVGLineElement).setAttribute('x2', (x2 as number).toFixed(1));
        (line as SVGLineElement).setAttribute('y2', (y2 as number).toFixed(1));
      });
    };
    const arcOpacity = () => Number(getComputedStyle(arcGroup).opacity) || 0;
    const showArc = (kind: 'caption' | 'readout', words: string, sweep: boolean) => {
      if (!layoutArc()) return;
      const from = arcShown ? arcOpacity() : 0;
      arcAnimations.forEach((animation) => animation.cancel());
      arcWords = '';
      setArcWords(words, false);
      arcShown = kind;
      const quiet = calm();
      if (sweep && !quiet) {
        // Engraved words turn into view along the ring, a mask sweep.
        arcAnimations = [
          arcSweep.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
            duration: EGG.CAPTION.sweepMs,
            easing: CSS_EASE.develop,
            fill: 'both',
          }),
          arcGroup.animate([{ opacity: from }, { opacity: 1 }], { duration: EGG.CAPTION.inMs, easing: CSS_EASE.arrive, fill: 'forwards' }),
        ];
        return;
      }
      arcAnimations = [
        arcSweep.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 0 }], { duration: 1, fill: 'forwards' }),
        arcGroup.animate([{ opacity: from }, { opacity: 1 }], {
          duration: quiet ? EGG.CAPTION.inMs : kind === 'readout' ? EGG.READOUT.inMs : EGG.CAPTION.inMs,
          easing: CSS_EASE.arrive,
          fill: 'forwards',
        }),
      ];
    };
    const hideArc = (duration: number, easing: string, delay = 0) => {
      if (!arcShown) return;
      arcShown = null;
      window.clearTimeout(captionCapTimer);
      window.clearTimeout(captionLeaveTimer);
      window.clearTimeout(readoutTimer);
      const from = arcOpacity();
      arcAnimations.push(arcGroup.animate([{ opacity: from }, { opacity: 0 }], {
        duration: calm() ? Math.min(duration, 200) : duration,
        delay,
        easing,
        fill: 'forwards',
      }));
    };
    const hideCaption = (duration: number, easing: string) => {
      window.clearTimeout(captionTimer);
      captionTimer = 0;
      if (arcShown === 'caption') hideArc(duration, easing);
    };

    // ── The give (the hint, and a click's reply): one detent tap ──
    const give = (amp: number) => {
      if (calm()) return;
      const t0 = performance.now();
      run('give', (now) => {
        const t = now - t0;
        channel.wobble = giveAt(t, amp);
        if (t >= EGG.GIVE.ms) {
          channel.wobble = 0;
          return false;
        }
      });
    };
    const showCaption = (click: boolean) => {
      if (arcShown === 'readout') return;
      showArc('caption', CAPTION_TEXT, true);
      give(click ? EGG.GIVE.clickAmp : EGG.GIVE.amp);
      window.clearTimeout(captionCapTimer);
      captionCapTimer = window.setTimeout(() => {
        if (arcShown === 'caption') hideArc(EGG.CAPTION.outMs, CSS_EASE.fade);
      }, click ? EGG.CAPTION.clickShowMs : EGG.CAPTION.capMs);
    };
    // The first hover: a pointer that rests on the disc, once a session.
    const armCaption = () => {
      window.clearTimeout(captionTimer);
      captionTimer = 0;
      if (captionSeen() || calm()) return;
      captionTimer = window.setTimeout(() => {
        captionTimer = 0;
        if (disposed || mode !== 'idle' || !allowed() || captionSeen()) return;
        markCaptionSeen();
        warm();
        coolLater();
        showCaption(false);
      }, EGG.CAPTION.restMs);
    };

    // ── The darkroom dodge ──
    const poolTo = (index: number, to: number, duration: number, shape: (t: number) => number, sigmaFrom?: number, sigmaTo?: number) => {
      const pool = channel.pool;
      if (index >= 0 && index !== pool.index) {
        pool.index = index;
        pool.amount = 0;
      }
      if (pool.index < 0) return;
      const from = pool.amount;
      const s0 = sigmaFrom ?? pool.sigma;
      const s1 = sigmaTo ?? s0;
      const t0 = performance.now();
      run('pool', (now) => {
        const k = duration > 0 ? clamp01((now - t0) / duration) : 1;
        const e = shape(k);
        pool.amount = from + (to - from) * e;
        pool.sigma = s0 + (s1 - s0) * e;
        repaint = true;
        if (k >= 1) {
          if (to <= 0) {
            pool.amount = 0;
            pool.index = -1;
          }
          return false;
        }
      });
    };
    const poolIn = (index: number, wide: boolean) =>
      poolTo(index, 1, calm() ? 200 : EGG.DODGE.inMs, ease.travel, wide ? EGG.DODGE.sigmaWide : EGG.DODGE.sigma, EGG.DODGE.sigma);
    const poolOut = () => {
      window.clearTimeout(poolRestTimer);
      poolRestTimer = 0;
      if (channel.pool.index >= 0) poolTo(-1, 0, calm() ? 200 : EGG.DODGE.outMs, ease.leave);
    };

    // ── The globe's longitude: the egg composes it for the camera ──
    const release = () => {
      hold = Number.NaN;
      channel.pin = Number.NaN;
      channel.offset = 0;
      channel.driftFrozen = false;
      channel.spin = 0;
      stop('coast', 'return', 'dragspin');
      setMode('idle');
      restoreMarks();
      channel.requestDraw();
      coolLater();
    };
    channel.compose = (natural) => {
      if (Number.isFinite(hold)) return hold;
      const center = composeEgg(natural, channel, EGG.PIN_W, PROLOGUE_TURN.dir);
      // The scroll's own turn has come past the pin: let it go.
      if (!Number.isNaN(channel.pin) && PROLOGUE_TURN.dir * (channel.pin - natural) <= -EGG.PIN_W) {
        channel.pin = Number.NaN;
        channel.offset = 0;
        queueMicrotask(() => {
          if (!disposed && mode === 'pinned' && Number.isNaN(channel.pin)) release();
        });
      }
      return center;
    };

    /** A hand (or a key) takes the globe: whatever it was doing continues from
     *  exactly where it is, and the lean and the drift hold still. */
    const takeHold = () => {
      stop('coast', 'return', 'give', 'dragspin');
      clearExposure();
      const natural = channel.natural;
      const center = composedCenter() + channel.wobble;
      channel.wobble = 0;
      channel.spin = 0;
      // Kept within half a turn of the natural longitude (the same meridian).
      hold = Number.isFinite(natural) ? natural + wrap180(center - natural) : center;
      channel.pin = Number.NaN;
      channel.offset = 0;
      channel.driftFrozen = true;
      lastScrollY = window.scrollY;
      markCaptionSeen();
      warm();
      if (landed >= 0) dropTicket(false);
      else poolOut();
      // A new play: the last exposure's readout goes.
      if (arcShown === 'readout') hideArc(EGG.READOUT.outMs, CSS_EASE.fade);
    };

    // ── Coasts ──
    const coast = (plan: CoastPlan, from: number, then: () => void, lead = true) => {
      setMode('coast');
      if (channel.exposure.phase === 'off') channel.exposure.phase = 'motion';
      const t0 = performance.now();
      let pooled = false;
      run('coast', (now) => {
        const t = now - t0;
        hold = coastAt(plan, from, t);
        setSpin(calm() ? 0 : coastSpeed(plan, t));
        // The lamp finds the place as the globe comes to rest.
        if (lead && !pooled && plan.index >= 0 && t >= plan.T - EGG.DODGE.leadMs) {
          pooled = true;
          poolIn(plan.index, true);
        }
        if (t >= plan.T) {
          setSpin(0);
          then();
          return false;
        }
      });
    };
    const park = () => {
      stop('coast', 'dragspin');
      setSpin(0);
      restoreMarks();
      if (channel.exposure.phase === 'motion') channel.exposure.phase = 'off';
      setMode('parked');
    };
    const spin = (velocity: number) => {
      if (calm()) {
        land(calmNext(calmLast, route.length), false);
        return;
      }
      const plan = planCoast(velocity, hold, places, false, dealt);
      if (plan.index < 0) {
        park();
        return;
      }
      coast(plan, hold, () => land(plan.index, false));
    };
    const nudge = (velocity: number) => {
      if (Math.abs(velocity) < 1 || calm()) {
        park();
        return;
      }
      const from = hold;
      const t0 = performance.now();
      setMode('coast');
      run('coast', (now) => {
        const t = now - t0;
        hold = from + nudgeAt(velocity, t);
        setSpin(nudgeSpeed(velocity, t));
        if (t >= 5 * EGG.NUDGE_TAU) {
          park();
          return false;
        }
      });
    };

    // ── The landing: the dodge, the place struck, the ticket ──
    // The place is printed as the atlas prints it — a dot of white ink with
    // its knockout, keyed by the chapter number the ticket's stub carries. The
    // shared number ties the place to its ticket, in place of a leader line
    // that was all but invisible on the silver print. The dot sits on whole
    // pixels, or its 7px disc smears across two.
    const placeMarks = () => {
      const entry = route[marksFor];
      if (!entry) return;
      const point = map.project(entry.stop.coordinates);
      const x = Math.round(point.x - bleed);
      const y = Math.round(point.y - bleed);
      markSlot.style.transform = `translate(${x}px, ${y}px)`;
      const { tx, ty } = ticketPlacement(x, y, ticketSize.w, ticketSize.h, viewport.w, viewport.h);
      ticketSlot.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
    };
    const onResize = () => {
      viewport = { w: root.clientWidth, h: window.innerHeight };
      discKey = '';
      placeDisc();
      if (marksFor >= 0) placeMarks();
      if (arcShown) {
        layoutArc();
        const words = arcWords;
        arcWords = '';
        setArcWords(words, arc.classList.contains('globe-egg-arc--strong'));
      }
    };
    const resetTicket = () => {
      ticketAnimations.forEach((animation) => animation.cancel());
      ticketAnimations = [];
      ticket.hidden = true;
      ticket.style.opacity = '';
      mark.style.opacity = '';
      marksFor = -1;
      if (marksListening) {
        marksListening = false;
        map.off('render', placeMarks);
      }
    };

    const land = (index: number, bulb: boolean) => {
      const entry = route[index];
      if (!entry) {
        park();
        return;
      }
      stop('coast');
      const quiet = calm();
      if (quiet && Number.isFinite(channel.natural)) {
        // One frame: the place LAND_WEST° west of the centre meridian (no
        // coast is running to ask the camera for it, so ask here).
        const target = entry.stop.coordinates[0] + EGG.LAND_WEST;
        hold = channel.natural + wrap180(target - channel.natural);
        channel.requestDraw();
      }
      calmLast = index;
      dealt.push(index);
      if (dealt.length > 4) dealt.shift();
      resetTicket();
      landed = index;
      marksFor = index;
      setMode('landed');
      setSpin(0);
      restoreMarks();
      if (channel.exposure.phase === 'motion') channel.exposure.phase = 'off';
      lastScrollY = window.scrollY;

      const { stop: place, chapterIndex } = entry;
      const name = place.name.trim();
      const region = place.region?.trim();
      const facts = [
        region && region.toLowerCase() !== name.toLowerCase() ? region : null,
        `${pad2(place.frameCount)} frames`,
        place.year != null && place.year !== '' ? String(place.year) : null,
      ].filter(Boolean).join(' · ');
      const number = chapterIndex + 1;
      ticket.style.setProperty('--stub-paper', stockPaper(place.slug));
      ticket.dataset.chapterIndex = String(chapterIndex);
      ticket.setAttribute('aria-label', `Go to chapter ${number}: ${name}`);
      if (ordinalRef.current) ordinalRef.current.textContent = pad2(number);
      if (totalRef.current) totalRef.current.textContent = `/ ${pad2(route.length)}`;
      if (kickerRef.current) kickerRef.current.textContent = bulb && exposedText ? exposedText : 'Admit one · Chapter';
      if (nameRef.current) nameRef.current.textContent = name;
      if (metaRef.current) metaRef.current.textContent = facts;
      // A BULB ticket carries the print just exposed.
      const withPrint = bulb && !!printImage;
      print.hidden = !withPrint;
      if (withPrint && printImage) print.getContext('2d')?.putImageData(printImage, 0, 0);
      liveRegion.textContent = `${name} — chapter ${number} of ${route.length}. Press Enter to go there.`;
      ticket.hidden = false;
      // Measured once per landing (a layout read, not a per-frame one).
      ticketSize = { w: ticket.offsetWidth || 300, h: ticket.offsetHeight || 104 };
      faceSize = { w: face.offsetWidth || ticketSize.w - EGG.TICKET.stubW, h: face.offsetHeight || ticketSize.h };
      ticket.style.setProperty('--ticket-w', `${ticketSize.w}px`);
      // The archive's torn edge for this chapter's ticket (the same profile
      // its plate tears along), at this ticket's seam length.
      if (edgeFor !== `${chapterIndex}:${faceSize.h}`) {
        edgeFor = `${chapterIndex}:${faceSize.h}`;
        const edge = tornEdge(faceSize.h, chapterIndex);
        ticket.style.setProperty('--egg-edge-face', edge.faceCut);
        ticket.style.setProperty('--egg-edge-stub', edge.stubCut);
        ticket.style.setProperty('--egg-fringe-face', edge.faceFringe);
        ticket.style.setProperty('--egg-fringe-stub', edge.stubFringe);
      }
      viewport = { w: root.clientWidth, h: window.innerHeight };
      placeMarks();
      if (!marksListening) {
        marksListening = true;
        map.on('render', placeMarks);
      }

      // The lamp finds the place (a fling's pool began as it slowed; a BULB's
      // took over from the burn in the develop).
      if (channel.pool.index !== index || channel.pool.amount <= 0) {
        if (quiet) poolTo(index, EGG.DODGE.rest, 200, (t) => t, EGG.DODGE.sigma, EGG.DODGE.sigma);
        else poolIn(index, !bulb);
      }
      window.clearTimeout(poolRestTimer);
      poolRestTimer = quiet ? 0 : window.setTimeout(() => {
        poolRestTimer = 0;
        if (!disposed && mode === 'landed' && landed === index) poolTo(-1, EGG.DODGE.rest, EGG.DODGE.restMs, ease.travel);
      }, EGG.DODGE.restDelayMs);

      markNum.textContent = pad2(number);
      mark.style.opacity = '1';
      const T = EGG.TICKET;
      const delay = bulb ? T.delayBulb : T.delayFling;
      if (quiet) {
        ticketAnimations = [
          mark.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' }),
          ticket.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'both' }),
        ];
      } else {
        // Easing on each keyframe, the effect linear: an effect-level curve
        // remaps the offsets too.
        ticketAnimations = [
          // The place is struck: the dot comes up to its size, is pressed
          // down like a stamp and comes back — never past its size.
          markDot.animate([
            { opacity: 0, scale: 0, easing: CSS_EASE.arrive },
            { opacity: 1, scale: 1, offset: 0.45, easing: CSS_EASE.leave },
            { scale: 0.6, offset: 0.62, easing: CSS_EASE.arrive },
            { opacity: 1, scale: 1 },
          ], {
            duration: T.markMs,
            easing: 'linear',
            fill: 'forwards',
          }),
          // Then its number prints, settling as the stamp lifts.
          markNum.animate([{ opacity: 0, translate: '0 1.5px' }, { opacity: 1, translate: '0 0' }], {
            duration: DUR_MS.in,
            delay: T.numDelay,
            easing: CSS_EASE.arrive,
            fill: 'both',
          }),
          // Dealt onto the print: it arrives a little above the surface, its
          // shadow wide and soft, settles flat, the shadow tightening to
          // contact.
          ticket.animate([{ transform: TICKET_DEALT_FROM, easing: CSS_EASE.arrive }, { transform: TICKET_REST }], {
            duration: T.dealMs,
            delay,
            easing: 'linear',
            fill: 'both',
          }),
          ticket.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1 }], {
            duration: T.dealMs,
            delay,
            easing: 'linear',
            fill: 'both',
          }),
          ...[faceShadow, stubShadow].map((shadow) => shadow.animate([
            { opacity: 0, transform: SHADOW_DEALT_FROM, filter: 'blur(22px)', easing: CSS_EASE.arrive },
            { opacity: 1, transform: SHADOW_REST, filter: 'blur(7px)' },
          ], { duration: T.shadowMs, delay, easing: 'linear', fill: 'both' })),
          ...[faceContact, stubContact].map((contact) => contact.animate(
            [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }],
            { duration: T.shadowMs, delay, easing: 'linear', fill: 'both' },
          )),
        ];
      }
      // The readout holds until the ticket is down, then goes.
      if (bulb && arcShown === 'readout') {
        window.clearTimeout(readoutTimer);
        readoutTimer = window.setTimeout(() => {
          if (arcShown === 'readout') hideArc(EGG.READOUT.outMs, CSS_EASE.fade);
        }, quiet ? 200 + EGG.READOUT.holdMs : delay + T.dealMs + EGG.READOUT.holdMs);
      }
      // A keyboard play hands the ticket the focus, so Enter goes there and
      // Esc comes back. A mouse play does not: Space must still scroll.
      if (viaKeyboard) ticket.focus({ preventScroll: true });
    };

    /** The ticket falls away (a hand-back, Esc, a new play). */
    const dropTicket = (returnFocus: boolean) => {
      poolOut();
      if (landed < 0) return;
      landed = -1;
      const hadFocus = document.activeElement === ticket;
      ticketAnimations.forEach((animation) => animation.cancel());
      const quiet = calm();
      const duration = quiet ? 200 : 560;
      // The fall is SEEN: the pull gives (eases out) for 15%, the drop eases
      // in the rest of the way, and the ticket stays whole to 60% before it
      // fades. It lifts off the print as it goes: the shadow widens and the
      // contact goes first.
      const fall = ticket.animate(
        quiet
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { opacity: 1, easing: 'linear' },
              { opacity: 1, offset: 0.6, easing: CSS_EASE.leave },
              { opacity: 0 },
            ],
        { duration, easing: 'linear', fill: 'forwards' },
      );
      ticketAnimations = [fall];
      if (!quiet) {
        ticketAnimations.push(
          ticket.animate(
            [
              { translate: '0 0', easing: CSS_EASE.arrive },
              { translate: '0 6px', offset: 0.15, easing: CSS_EASE.leave },
              { translate: '0 34px' },
            ],
            { duration, easing: 'linear', fill: 'forwards' },
          ),
          ...[faceShadow, stubShadow].map((shadow) => shadow.animate(
            [
              { opacity: 1, filter: 'blur(7px)' },
              { opacity: 0.6, filter: 'blur(16px)', offset: 0.3 },
              { opacity: 0, filter: 'blur(16px)' },
            ],
            { duration, easing: 'linear', fill: 'forwards' },
          )),
          ...[faceContact, stubContact].map((contact) => contact.animate(
            [{ opacity: 1, easing: CSS_EASE.leave }, { opacity: 0, offset: 120 / duration }, { opacity: 0 }],
            { duration, easing: 'linear', fill: 'forwards' },
          )),
        );
      }
      ticketAnimations.push(
        mark.animate([{ opacity: 1 }, { opacity: 0 }], { duration: quiet ? 200 : 320, easing: CSS_EASE.leave, fill: 'forwards' }),
      );
      liveRegion.textContent = '';
      if (hadFocus && returnFocus) keyButton()?.focus({ preventScroll: true });
      fall.finished.then(() => {
        if (disposed || landed >= 0 || mode === 'voyage') return;
        resetTicket();
      }).catch(() => {});
    };

    // ── Hand-back: the reader scrolled (or pressed Esc, or clicked away) ──
    const handBack = () => {
      if (mode === 'idle' || mode === 'pinned' || mode === 'voyage' || mode === 'returning') return;
      endGesture();
      // The photograph is dropped within a frame: no develop.
      const exposing = !!bulb || channel.exposure.phase !== 'off';
      clearExposure();
      if (exposing && arcShown === 'readout') hideArc(EGG.READOUT.abortMs, CSS_EASE.leave);
      stop('coast', 'dragspin');
      channel.spin = 0;
      restoreMarks();
      dropTicket(true);
      const natural = channel.natural;
      const center = hold;
      hold = Number.NaN;
      if (!Number.isFinite(center) || !Number.isFinite(natural) || calm()) {
        // Reduced motion always returns, in no time.
        release();
        return;
      }
      const decision = handBackDecision(center - natural, channel.remaining, PROLOGUE_TURN.dir);
      if (decision.kind === 'pin') {
        // Held on the place; the scroll's turn catches up and carries on. The
        // cursor lean comes back, the drift waits.
        channel.pin = natural + decision.d;
        channel.offset = 0;
        setMode('pinned');
        channel.requestDraw();
        coolLater();
        return;
      }
      channel.offset = decision.from;
      setMode('returning');
      const t0 = performance.now();
      run('return', (now) => {
        const k = cubicInOut(clamp01((now - t0) / EGG.RETURN_MS));
        channel.offset = decision.from * (1 - k);
        if (k >= 1) {
          release();
          return false;
        }
      });
    };

    // ── BULB: wind, open, settle, close, develop ──
    // The shutter opens once the place is up: on the canvas short of its
    // right edge, facing, and near enough to settle under the open shutter.
    const shutterReady = (index: number, R: number) => {
      if (R >= EGG.BULB_OPEN_R) return false;
      const place = places[index];
      const center = map.getCenter();
      const rad = Math.PI / 180;
      const cosAngle = Math.sin(place.lat * rad) * Math.sin(center.lat * rad) +
        Math.cos(place.lat * rad) * Math.cos(center.lat * rad) * Math.cos((place.lng - center.lng) * rad);
      const D = globeDepth(map);
      if (Number.isFinite(D) && D > 1 && cosAngle <= 1 / D + EGG.BULB_OPEN_FACING) return false;
      const point = map.project([place.lng, place.lat]);
      return point.x - bleed < viewport.w - EGG.BULB_OPEN_MARGIN;
    };
    const openShutter = (now: number, R: number) => {
      const b = bulb;
      if (!b) return;
      b.phase = 'open';
      b.openedAt = now;
      b.R0 = Math.max(0, R);
      b.fromOpen = hold;
      b.tenth = Math.floor((now - b.pressedAt) / 100);
      channel.exposure.phase = 'open';
      channel.exposure.openedAt = now;
      channel.exposure.closedAt = 0;
      channel.exposure.target = b.index;
      channel.exposure.u = 0;
      channel.exposure.still = calm();
      // The photograph has no UI.
      channel.marksHidden = true;
      channel.requestDraw();
      map.triggerRepaint();
      showArc('readout', bulbLabel(Math.floor((now - b.pressedAt) / 100) / 10), false);
    };
    const bulbStep = (now: number) => {
      const b = bulb;
      if (!b) return false;
      const dt = Math.min(0.05, Math.max(0, (now - b.last) / 1000));
      b.last = now;
      if (b.phase === 'wind') {
        const R = b.target - hold;
        if (R <= 0.01 || shutterReady(b.index, R)) openShutter(now, R);
        else {
          b.omega = bulbWindSpeed(R);
          hold += Math.min(R, b.omega * dt);
          setSpin(b.omega);
          return;
        }
      }
      const t = (now - b.openedAt) / 1000;
      if (!channel.exposure.still) {
        // Under the open shutter the globe settles, closed form.
        hold = b.target - bulbSettleAt(b.R0, t);
        b.omega = bulbSettleSpeed(b.R0, t);
        setSpin(b.omega);
      }
      repaint = true;
      // The readout counts the hold, from the press (see `pressedAt`).
      const tenth = Math.floor((now - b.pressedAt) / 100);
      if (tenth !== b.tenth) {
        b.tenth = tenth;
        setArcWords(bulbLabel(tenth / 10), false);
      }
      if (now - b.openedAt >= EGG.BULB_CAP_MS) {
        closeShutter(false);
        return false;
      }
    };
    // `pressedAt`: when the button went down — a held press only becomes a
    // BULB after EGG.HOLD_MS, and that wait is part of the hold too.
    const startBulb = (pressedAt = performance.now()) => {
      if (bulb) return;
      setMode('bulb');
      hideCaption(EGG.CAPTION.pressOutMs, CSS_EASE.leave);
      const now = performance.now();
      if (calm()) {
        // A still exposure: the globe does not move; the lights burn in where
        // they are.
        const index = calmNext(calmLast, route.length);
        bulb = { phase: 'wind', index, target: hold, last: now, omega: 0, pressedAt, openedAt: now, R0: 0, fromOpen: hold, tenth: -1 };
        openShutter(now, 0);
        run('bulb', bulbStep);
        return;
      }
      const plan = planBulbTarget(hold, places, dealt);
      if (plan.index < 0) {
        park();
        return;
      }
      bulb = { phase: 'wind', index: plan.index, target: hold + plan.D, last: now, omega: 0, pressedAt, openedAt: 0, R0: 0, fromOpen: hold, tenth: -1 };
      channel.exposure.phase = 'wind';
      channel.exposure.target = plan.index;
      run('bulb', bulbStep);
    };
    const closeShutter = (abort: boolean) => {
      const b = bulb;
      if (!b) return;
      bulb = null;
      stop('bulb');
      if (abort) {
        clearExposure();
        restoreMarks();
        channel.spin = 0;
        if (arcShown === 'readout') hideArc(EGG.READOUT.abortMs, CSS_EASE.leave);
        return;
      }
      const now = performance.now();
      const R = Math.max(0, b.target - hold);
      const quiet = calm();
      if (b.phase === 'wind') {
        // Let go before the shutter opened: no photograph. The motor's turn
        // completes like a fling's coast, to the same place.
        channel.exposure.phase = 'motion';
        coast(planBulbStop(R, b.omega, b.index), hold, () => land(b.index, false));
        return;
      }
      const seconds = (now - b.pressedAt) / 1000;
      exposedText = exposedLabel(seconds, quiet ? 0 : hold - b.fromOpen);
      setArcWords(exposedText, true);
      printImage = null;
      channel.exposure.phase = 'develop';
      channel.exposure.closedAt = now;
      channel.exposure.u = 0;
      channel.wantPrint = true;
      map.triggerRepaint();
      // The develop runs on its own clock: the dodge takes over from the burn
      // halfway, and the landing comes as the marks do.
      const landAt = now + (quiet ? EGG.DEV_CALM_MS : EGG.DEV_HOLD + EGG.DEV_LAND_U * EGG.DEV_MS);
      let pooled = false;
      run('develop', (time) => {
        const u = developAt(time, now, quiet);
        channel.exposure.u = u;
        repaint = true;
        if (!pooled && u >= EGG.DEV_POOL_U && !quiet) {
          pooled = true;
          poolIn(b.index, false);
        }
        if (u >= EGG.DEV_LAND_U) restoreMarks();
        if (u >= 1.05) {
          if (channel.exposure.phase === 'develop') channel.exposure.phase = 'off';
          return false;
        }
      });
      const plan = planBulbStop(R, b.omega, b.index);
      const from = hold;
      setMode('coast');
      const t0 = now;
      run('coast', (time) => {
        const t = time - t0;
        if (!quiet) {
          hold = coastAt(plan, from, t);
          setSpin(coastSpeed(plan, t));
        }
        if (t >= plan.T && time >= landAt) {
          setSpin(0);
          land(b.index, true);
          return false;
        }
      });
    };
    channel.onPrint = (image) => {
      if (disposed) return;
      printImage = image;
      // A ticket already down (a very short develop) takes it now.
      if (landed >= 0 && !print.hidden) print.getContext('2d')?.putImageData(image, 0, 0);
    };

    // ── The hand ──
    let gesture: {
      id: number;
      x0: number;
      y0: number;
      from: number;
      radius: number;
      bearing: number;
      latitude: number;
      samples: Array<[number, number]>;
      timer: number;
    } | null = null;
    const endGesture = () => {
      if (!gesture) return;
      window.clearTimeout(gesture.timer);
      const { id } = gesture;
      gesture = null;
      try {
        if (hit.hasPointerCapture(id)) hit.releasePointerCapture(id);
      } catch {
        // Already released.
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
      if (mode === 'voyage' || mode === 'armed' || mode === 'drag' || mode === 'bulb') return;
      if (!allowed() && (mode === 'idle' || mode === 'pinned')) return;
      // No selection, no drag image, no focus change: the press is the globe's.
      event.preventDefault();
      window.clearTimeout(captionTimer);
      captionTimer = 0;
      hideCaption(EGG.CAPTION.pressOutMs, CSS_EASE.leave);
      try {
        hit.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that cannot be captured still plays; it just may leave.
      }
      viaKeyboard = false;
      takeHold();
      const planet = planetInViewport();
      const now = performance.now();
      gesture = {
        id: event.pointerId,
        x0: event.clientX,
        y0: event.clientY,
        from: hold,
        radius: planet?.r ?? 640,
        bearing: map.getBearing(),
        latitude: map.getCenter().lat,
        samples: [[now, hold]],
        timer: window.setTimeout(() => {
          if (!disposed && mode === 'armed') startBulb(now);
        }, EGG.HOLD_MS),
      };
      setMode('armed');
    };
    const onPointerMove = (event: PointerEvent) => {
      const g = gesture;
      if (!g || event.pointerId !== g.id) return;
      const dx = event.clientX - g.x0;
      const dy = event.clientY - g.y0;
      if (mode === 'armed' && Math.hypot(dx, dy) > EGG.SLOP) {
        window.clearTimeout(g.timer);
        setMode('drag');
        // The shutter follows the hand's own speed (its last SPIN_WINDOW ms,
        // smoothed over SPIN_TAU).
        let last = performance.now();
        run('dragspin', (now) => {
          const current = gesture;
          if (!current || mode !== 'drag') return false;
          const target = calm() ? 0 : releaseVelocity(current.samples, now, EGG.SPIN_WINDOW);
          const k = 1 - Math.exp(-Math.max(0, now - last) / EGG.SPIN_TAU);
          last = now;
          setSpin(channel.spin + (target - channel.spin) * k);
        });
      }
      if (mode !== 'drag') return;
      // From the press point: the spot that was grabbed stays under the hand.
      hold = g.from + dragDegrees(dx, dy, g.bearing, g.radius, g.latitude);
      const now = performance.now();
      g.samples.push([now, hold]);
      while (g.samples.length > 2 && now - g.samples[0][0] > EGG.VEL_WINDOW) g.samples.shift();
      channel.requestDraw();
    };
    const onPointerUp = (event: PointerEvent) => {
      const g = gesture;
      if (!g || event.pointerId !== g.id) return;
      const cancelled = event.type !== 'pointerup';
      const samples = g.samples;
      const was = mode;
      endGesture();
      if (was === 'bulb') {
        closeShutter(cancelled);
        if (cancelled) handBack();
        return;
      }
      if (was === 'armed') {
        // A click: a request for help. The globe stays where it was caught,
        // gives once, and the caption comes back for a moment.
        const natural = channel.natural;
        if (Number.isFinite(natural) && Math.abs(wrap180(hold - natural)) < 0.01) release();
        else park();
        if (!cancelled && !calm()) showCaption(true);
        return;
      }
      if (was !== 'drag') return;
      stop('dragspin');
      const velocity = cancelled ? 0 : releaseVelocity(samples, performance.now());
      if (Math.abs(velocity) > EGG.FLICK) spin(velocity);
      else nudge(velocity);
    };
    const onHoverMove = (event: PointerEvent) => {
      // Re-armed on every move: the caption waits for the pointer to REST.
      if (gesture || captionSeen() || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
      if (mode === 'idle') armCaption();
    };
    const onPointerEnter = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      window.clearTimeout(captionLeaveTimer);
      captionLeaveTimer = 0;
      if (calm()) return;
      easeHover(1, EGG.HOVER_MS);
      if (mode === 'idle') armCaption();
    };
    const onPointerLeave = () => {
      window.clearTimeout(captionTimer);
      captionTimer = 0;
      // A brush past the limb is not leaving.
      window.clearTimeout(captionLeaveTimer);
      captionLeaveTimer = window.setTimeout(() => {
        captionLeaveTimer = 0;
        if (arcShown === 'caption') hideArc(EGG.CAPTION.outMs, CSS_EASE.fade);
      }, EGG.CAPTION.graceMs);
      if (channel.hover > 0 || jobs.has('hover')) easeHover(0, calm() ? 0 : EGG.HOVER_MS);
    };
    hit.addEventListener('pointerdown', onPointerDown);
    hit.addEventListener('pointermove', onPointerMove);
    hit.addEventListener('pointerup', onPointerUp);
    hit.addEventListener('pointercancel', onPointerUp);
    hit.addEventListener('lostpointercapture', onPointerUp);
    hit.addEventListener('pointerenter', onPointerEnter);
    hit.addEventListener('pointerleave', onPointerLeave);
    hit.addEventListener('pointermove', onHoverMove);
    const noDrag = (event: Event) => event.preventDefault();
    hit.addEventListener('dragstart', noDrag);

    // ── The ticket: torn like the archive's plates, then the voyage ──
    const finishVoyage = () => {
      window.clearTimeout(voyageTimer);
      window.clearTimeout(tearTimer);
      delete root.dataset.globeVoyage;
      resetTicket();
      // The entrance already owns the camera; the prologue is left natural
      // for whenever the reader scrolls back up to it.
      release();
    };
    const tearTicket = () => {
      const quiet = calm();
      ticketAnimations.forEach((animation) => animation.cancel());
      if (quiet) {
        // Reduced motion keeps the event and drops the travel: the face
        // fades, the stub stays.
        ticketAnimations = [
          face.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TEAR_REDUCED_MS, easing: CSS_EASE.fade, fill: 'forwards' }),
        ];
        return;
      }
      // The archive's own score (src/lib/ticketTear.ts), baked once into
      // linear keyframes at rate 1 (no per-frame script): the paper takes the
      // strain, the rip runs down the seam hole by hole with its torn edge
      // and fibres, the face hinging about the rip's tip — the top-left
      // corner drops first — then it snaps free and is laid aside, up and to
      // the left. The stub gives in the right hand, recoils, dims to a record,
      // then goes with the page.
      const W = faceSize.w;
      const H = faceSize.h;
      // The aside is sized to the ticket, not the window: the archive's
      // plates are carried ~a quarter of their width, and so is this one
      // (the score takes it as a share of `vw`).
      const frame = { w: W, h: H, vw: W * EGG_TEAR_ASIDE_SCALE };
      const SW = EGG.TICKET.stubW;
      const stubEnd = TEAR_BEFORE_FLIGHT_MS + DUR_STUB;
      const total = Math.max(TEAR_MS, stubEnd);
      const faceFrames: Keyframe[] = [];
      const stubFrames: Keyframe[] = [];
      for (let ms = 0; ; ms = Math.min(total, ms + 16)) {
        const pose = tearPose(ms, frame);
        const offset = ms / total;
        const torn = `${(pose.tip * H).toFixed(1)}px`;
        faceFrames.push({
          offset,
          transform: affineCss(pose.m),
          opacity: +pose.op.toFixed(4),
          '--egg-torn': torn,
        } as Keyframe);
        const gone = 1 - ease.fade(clamp01((ms - TEAR_BEFORE_FLIGHT_MS) / DUR_STUB));
        stubFrames.push({
          offset,
          // About the right hand's grip, the stub's right-middle.
          transform: `translate(${SW}px, ${(H / 2 + pose.stubY).toFixed(2)}px) rotate(${pose.stubDeg.toFixed(3)}deg) translate(${-SW}px, ${(-H / 2).toFixed(2)}px)`,
          opacity: +(pose.stubOp * gone).toFixed(4),
          '--egg-torn': torn,
        } as Keyframe);
        if (ms >= total) break;
      }
      const freeAt = TEAR_FREE_MS / total;
      ticketAnimations = [
        face.animate(faceFrames, { duration: total, easing: 'linear', fill: 'forwards' }),
        // The contact shadow is paper lying on the print: it goes as the face
        // lifts off it. The cast shadow travels with the face. (A keyframe's
        // easing runs from that keyframe to the next: the fade curve sits on
        // the first.)
        faceContact.animate([{ opacity: 1, easing: CSS_EASE.fade }, { opacity: 0, offset: freeAt }, { opacity: 0 }], {
          duration: total,
          easing: 'linear',
          fill: 'forwards',
        }),
        stub.animate(stubFrames, { duration: total, easing: 'linear', fill: 'forwards' }),
        stubShadow.animate([{ opacity: 1 }, { opacity: 1, offset: TEAR_BEFORE_FLIGHT_MS / total, easing: CSS_EASE.fade }, { opacity: 0 }], {
          duration: total,
          easing: 'linear',
          fill: 'forwards',
        }),
        mark.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: TEAR_FREE_MS, easing: CSS_EASE.leave, fill: 'forwards' }),
      ];
    };
    const onTicketClick = () => {
      if (mode !== 'landed' || landed < 0) return;
      const entry = route[landed];
      landed = -1;
      window.clearTimeout(poolRestTimer);
      poolRestTimer = 0;
      // The ticket is torn where it was taken; the globe glides off into the
      // dive without it.
      if (marksListening) {
        marksListening = false;
        map.off('render', placeMarks);
      }
      setMode('voyage');
      voyageSeen = false;
      liveRegion.textContent = '';
      if (arcShown === 'readout') hideArc(EGG.READOUT.outMs, CSS_EASE.fade);
      // From the first screen the whole prologue would stream past at speed:
      // its type steps aside for the trip (global.css, data-globe-voyage).
      if (progress.get() < EGG.Q_MAX) root.dataset.globeVoyage = 'from-top';
      tearTicket();
      window.clearTimeout(tearTimer);
      // The flight waits for the tear: the face is free, plus a beat.
      tearTimer = window.setTimeout(() => {
        tearTimer = 0;
        if (disposed || mode !== 'voyage') return;
        poolOut();
        window.clearTimeout(voyageTimer);
        voyageTimer = window.setTimeout(() => {
          if (disposed || mode !== 'voyage') return;
          delete root.dataset.globeVoyage;
          if (voyageSeen) {
            finishVoyage();
            return;
          }
          // The page never set off (another trip was under way): the globe is
          // simply handed back.
          resetTicket();
          setMode('parked');
          handBack();
        }, EGG.VOYAGE_SAFETY_MS);
        live.current.onNavigate?.(entry.stop.id);
      }, calm() ? TEAR_REDUCED_MS : TEAR_BEFORE_FLIGHT_MS);
    };
    ticket.addEventListener('click', onTicketClick);

    // ── Hand-back triggers. Passive: never a preventDefault on a wheel. ──
    const onWheel = (event: WheelEvent) => {
      // A sideways wheel is not a scroll (and Lenis swallows it whole): the
      // hand keeps the globe.
      if (event.deltaY !== 0 && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) handBack();
    };
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastScrollY) <= 4) return;
      lastScrollY = y;
      handBack();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (mode === 'idle' || mode === 'pinned' || mode === 'voyage' || mode === 'returning') return;
        const focusHome = document.activeElement === ticket || document.activeElement === keyButton();
        handBack();
        if (focusHome) keyButton()?.focus({ preventScroll: true });
        return;
      }
      if (!HAND_BACK_KEYS.has(event.key)) return;
      if (event.target === ticket || event.target === keyButton()) return;
      handBack();
    };
    const onPointerDownAnywhere = (event: PointerEvent) => {
      if (mode !== 'landed' && mode !== 'parked') return;
      const target = event.target as Node | null;
      if (target && (hit.contains(target) || ticket.contains(target))) return;
      handBack();
    };
    window.addEventListener('wheel', onWheel, { passive: true, capture: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });
    document.addEventListener('pointerdown', onPointerDownAnywhere, { capture: true });

    // ── The keyboard (GlobePrologue's key button) ──
    const onEggKey = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (type === 'bulb-end') {
        if (mode === 'bulb') closeShutter(false);
        return;
      }
      if (type !== 'spin' && type !== 'bulb-start') return;
      if (mode === 'voyage' || mode === 'armed' || mode === 'drag' || mode === 'bulb') return;
      if (!allowed()) return;
      viaKeyboard = true;
      hideCaption(EGG.CAPTION.pressOutMs, CSS_EASE.leave);
      takeHold();
      if (type === 'spin') spin(EGG.KEY_SPIN);
      else startBulb();
    };
    window.addEventListener('archive:globe-egg', onEggKey);

    // ── Everything drops for a hidden page, a Story, or an unmount ──
    const abort = () => {
      endGesture();
      jobs.clear();
      if (ticking) {
        cancelFrame(tick);
        ticking = false;
      }
      bulb = null;
      [captionTimer, captionLeaveTimer, captionCapTimer, readoutTimer, poolRestTimer, voyageTimer, tearTimer].forEach((timer) => window.clearTimeout(timer));
      captionTimer = 0;
      resetTicket();
      arcAnimations.forEach((animation) => animation.cancel());
      arcAnimations = [];
      arcShown = null;
      landed = -1;
      liveRegion.textContent = '';
      delete root.dataset.globeVoyage;
      hold = Number.NaN;
      channel.pin = Number.NaN;
      channel.offset = 0;
      channel.wobble = 0;
      channel.hover = 0;
      channel.spin = 0;
      channel.exposure.phase = 'off';
      channel.exposure.u = 0;
      channel.wantPrint = false;
      channel.pool.index = -1;
      channel.pool.amount = 0;
      channel.driftFrozen = false;
      restoreMarks();
      if (mode !== 'idle') setMode('idle');
      coolLater();
      map.triggerRepaint();
      channel.requestDraw();
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' && mode !== 'idle') abort();
      placeDisc();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // The disc follows the gates: the scroll, the load-in's dawn, the viewport.
    const unsubscribeProgress = progress.on('change', (q) => {
      // The atlas let go of a pin once the archive had the camera.
      if (mode === 'pinned' && Number.isNaN(channel.pin)) release();
      // Past the first screen the targets go at once.
      if (q >= EGG.Q_MAX && channel.warm && (mode === 'idle' || mode === 'pinned' || mode === 'returning')) coolLater(0);
      placeDisc();
    });
    map.on('resize', onResize);
    window.addEventListener('resize', onResize, { passive: true });
    const onQuery = () => {
      discKey = '';
      if (!fineQuery.matches && mode !== 'idle') abort();
      placeDisc();
    };
    fineQuery.addEventListener('change', onQuery);
    wideQuery.addEventListener('change', onQuery);
    // Until the dawn is far enough in for the globe to be picked up.
    const waitForDawn = () => {
      dawnTimer = 0;
      if (disposed) return;
      placeDisc();
      if (!(channel.revealed && channel.dawn >= 0.6)) dawnTimer = window.setTimeout(waitForDawn, 120);
    };
    waitForDawn();

    controllerRef.current = {
      sync: placeDisc,
      abort,
      voyageChanged: (next) => {
        if (mode !== 'voyage') return;
        if (next) voyageSeen = true;
        else if (voyageSeen) finishVoyage();
      },
    };

    return () => {
      abort();
      disposed = true;
      controllerRef.current = null;
      window.clearTimeout(dawnTimer);
      window.clearTimeout(coolTimer);
      channel.warm = false;
      channel.onPrint = () => {};
      channel.compose = (natural) => natural + channel.offset;
      delete root.dataset.globeEgg;
      hit.removeEventListener('pointerdown', onPointerDown);
      hit.removeEventListener('pointermove', onPointerMove);
      hit.removeEventListener('pointerup', onPointerUp);
      hit.removeEventListener('pointercancel', onPointerUp);
      hit.removeEventListener('lostpointercapture', onPointerUp);
      hit.removeEventListener('pointerenter', onPointerEnter);
      hit.removeEventListener('pointerleave', onPointerLeave);
      hit.removeEventListener('pointermove', onHoverMove);
      hit.removeEventListener('dragstart', noDrag);
      ticket.removeEventListener('click', onTicketClick);
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      document.removeEventListener('pointerdown', onPointerDownAnywhere, { capture: true });
      window.removeEventListener('archive:globe-egg', onEggKey);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribeProgress();
      map.off('resize', onResize);
      window.removeEventListener('resize', onResize);
      fineQuery.removeEventListener('change', onQuery);
      wideQuery.removeEventListener('change', onQuery);
      map.triggerRepaint();
    };
  }, [bleed, channel, map, progress, route]);

  // A Story over the atlas drops any play; otherwise the gates may have moved.
  useEffect(() => {
    if (paused) controllerRef.current?.abort();
    controllerRef.current?.sync();
  }, [paused, revealed, reducedMotion]);
  useEffect(() => {
    controllerRef.current?.voyageChanged(voyage);
    controllerRef.current?.sync();
  }, [voyage]);

  return createPortal(
    <>
      <div className="globe-egg-layer" aria-hidden="true">
        <div ref={hitRef} className="globe-egg-hit" />
      </div>
      <div className="globe-egg-marks">
        <div ref={markSlotRef} className="globe-egg-slot" aria-hidden="true">
          <span ref={markRef} className="globe-egg-mark">
            <i ref={markDotRef} className="globe-egg-mark__dot" />
            <span ref={markNumRef} className="globe-egg-mark__num font-ui" />
          </span>
        </div>
        {/* The limb's engraving: the first-hover caption, then BULB's readout. */}
        <svg ref={arcRef} className="globe-egg-arc" aria-hidden="true">
          <defs>
            <path ref={arcPathRef} id="globe-egg-arc-path" />
            <mask id="globe-egg-arc-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
              <path ref={arcSweepRef} className="globe-egg-arc__sweep" pathLength={1} />
            </mask>
          </defs>
          <g ref={arcGroupRef} className="globe-egg-arc__words" mask="url(#globe-egg-arc-mask)">
            <line ref={tickARef} className="globe-egg-arc__tick" />
            <line ref={tickBRef} className="globe-egg-arc__tick" />
            <text className="globe-egg-arc__text font-ui">
              <textPath ref={arcTextRef} href="#globe-egg-arc-path" startOffset="50%" textAnchor="middle" />
            </text>
          </g>
        </svg>
        <div ref={ticketSlotRef} className="globe-egg-slot">
          <button ref={ticketRef} type="button" className="globe-ticket" hidden>
            {/* The archive plate's anatomy: the face on the left, the stub on
                the right, one perforation between them, each half carrying
                its own shadow so it can be torn away with it. */}
            <span ref={faceRef} className="globe-ticket__part globe-ticket__part--face" aria-hidden="true">
              <span ref={faceShadowRef} className="globe-ticket__shadow" />
              <span ref={faceContactRef} className="globe-ticket__contact" />
              <span className="globe-ticket__face">
                <canvas
                  ref={printRef}
                  className="globe-ticket__print"
                  width={EGG.TICKET.printW * 3}
                  height={EGG.TICKET.printH * 3}
                  hidden
                />
                <span className="globe-ticket__body">
                  <span className="globe-ticket__row">
                    <span ref={kickerRef} className="globe-ticket__kicker font-ui" />
                    <span className="globe-ticket__enter font-ui">
                      Enter
                      <svg className="globe-ticket__arrow" width="9" height="7" viewBox="0 0 9 7" aria-hidden="true">
                        <path d="M0 3.5h8M5 0.7l2.9 2.8L5 6.3" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                    </span>
                  </span>
                  <span ref={nameRef} className="globe-ticket__name font-serif" />
                  <span ref={metaRef} className="globe-ticket__meta font-ui" />
                </span>
              </span>
            </span>
            <span ref={stubRef} className="globe-ticket__part globe-ticket__part--stub" aria-hidden="true">
              <span ref={stubShadowRef} className="globe-ticket__shadow" />
              <span ref={stubContactRef} className="globe-ticket__contact" />
              <span className="globe-ticket__stub">
                <span ref={ordinalRef} className="globe-ticket__ordinal font-serif" />
                <span ref={totalRef} className="globe-ticket__total font-ui" />
              </span>
            </span>
          </button>
        </div>
        <p ref={liveRef} className="sr-only" aria-live="polite" />
      </div>
    </>,
    document.body,
  );
}
