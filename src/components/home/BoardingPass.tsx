import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { encodeQr, qrPath } from '../../lib/qrCode';
import {
  PASS_URL,
  PASS_HAND,
  PASS_HINGE,
  PEEK_MS,
  STUB_FALL,
  approach,
  barcodeBars,
  bodyAtRest,
  clampToArea,
  destinationScale,
  passAreas,
  peekAngle,
  pullTravel,
  recentVelocity,
  rubberBand,
  scrollTravel,
  stepBody,
  stepFall,
  stepSway,
  swayTarget,
  tearClock,
  tearCommits,
  tearGive,
  tearResist,
  tearSpan,
  throwVelocity,
  tiltFor,
  type Body,
  type FallState,
  type PassFields,
} from '../../lib/boardingPass';
import {
  TEAR_FREE_MS,
  TEAR_MS,
  TEAR_REDUCED_MS,
  TEAR_TENSION_MS,
  affineCss,
  handTipAt,
  mirrorAffine,
  tearPose,
  tornEdge,
  tornEdgeAcross,
  type Affine,
} from '../../lib/ticketTear';
import { EASE, bezierFn, smootherstep } from '../../lib/motion';

// ── The boarding pass (src/lib/boardingPass.ts has the numbers and reasons) ──
// A white paper pass: the main part and a stub, one perforation between
// them. It can be picked up — pointer or finger, anywhere on it — and moved
// about: it follows the grab point one to one, tilts toward it, sways with
// the hand's sideways speed, lifts (its shadow deepens) while held, and let
// go it glides on, slows, and is set back down in its place; it can never
// be lost off the screen. Its stub tears off along the perforation: grab it
// and pull away from the pass — the paper resists, then the rip runs down
// the holes following the hand (the site's own tear, src/lib/ticketTear.ts:
// the hinge about the running tip, the torn fibres on both edges), and the
// stub springs into the hand; let go, it falls. Let go early, the stub lies
// back down but the rip stays. The Tear button, Enter or Space on the pass,
// or scrolling on past the pass tear it for the reader (a scripted tear:
// the paper's own catches, then a small toss); a tap on the stub only peels
// it a little (people click to pick things up). Reduced motion: no physics
// — the pass stays put and the stub fades.
//
// On a phone the pass stands upright (its stub below, the perforation
// across): the same score, turned about the diagonal. There a thumb that
// swipes up the pass scrolls the page: the pass is picked up by a sideways
// move or a short press-and-hold, and its stub (touch-action: none) tears.
//
// One writer, off one clock: every pose is written straight onto the nodes
// in a rAF loop that runs only while something moves, never through React
// state. React state is only what the words say.

export type TearHow = 'hand' | 'button' | 'key' | 'scroll';

export interface PassHandle {
  /** Tear the stub off for the reader (a scripted tear). */
  tear: (how: TearHow) => void;
  torn: () => boolean;
  /** The scroll-linked rise into view, 0 → 1. */
  setRise: (rise: number) => void;
  /** The strain the scroll puts on the perforation, 0 → 1. */
  setStrain: (strain: number) => void;
}

interface Props {
  fields: PassFields;
  handle?: Ref<PassHandle>;
  /** False while the opening film lies over the page. */
  interactive: boolean;
  /** The stub is free (in the hand, or tossed by a scripted tear). */
  onFree?: (how: TearHow) => void;
  /** The stub has left the hand (it falls): the page may go on. */
  onLetGo?: (how: TearHow) => void;
  /** The falling stub has left the screen. */
  onGone?: () => void;
}

// A press that travels less than this is a tap.
const SLOP = 6;
// A pull on the stub is a tear when it runs this much along the pull axis.
const PULL_BIAS = 0.55;
// A finger on the pass's main part (a phone, where a swipe must scroll the
// page): it picks the pass up by a sideways move past TOUCH_PICK_PX (more
// than TOUCH_SIDEWAYS × its vertical travel), or by holding still for
// TOUCH_HOLD_MS. A vertical swipe is the page's.
const TOUCH_PICK_PX = 8;
const TOUCH_SIDEWAYS = 1.4;
const TOUCH_HOLD_MS = 220;
// Let go early: the stub lies back down over this long (the rip stays).
const SPRING_BACK_MS = 340;
const arrive = bezierFn(EASE.arrive);
// Free in the hand, the stub springs from where the rip left it to the
// fingers (the strain let go), at this rate per second.
const CATCH_RATE = 15;
// A tap's peel: about a point just below the top notch, so the stub's top
// corner comes away and lies back.
const PEEK_PIVOT = 0.2;
// The seed of this pass's torn edge (the same profile every time).
const EDGE_SEED = 11;
// A white paper's torn fibres: its own white, with a faint shade line so
// they read on the paper and on the olive round it.
const FIBRE_INK = { face: 'rgba(251,249,242,0.96)', stub: 'rgba(214,209,194,0.9)' };
// The pose of the body: a 2D translate at rest (crisp type), the full
// perspective turn while it moves.
const PERSPECTIVE = 1100;
// While the rip runs nothing of the stub may swing across the seam into the
// main part: the band on the main part's side of the seat is cut away.
const SEAM_CLIP_LEFT =
  'polygon(-100vw -100vh, calc(100% + 100vw) -100vh, calc(100% + 100vw) calc(100% + 100vh), -100vw calc(100% + 100vh), -100vw 100%, 0% 100%, 0% 0%, -100vw 0%)';
const SEAM_CLIP_TOP =
  'polygon(-100vw -100vh, 0% -100vh, 0% 0%, 100% 0%, 100% -100vh, calc(100% + 100vw) -100vh, calc(100% + 100vw) calc(100% + 100vh), -100vw calc(100% + 100vh))';

/** S·m·S, S the swap of x and y: the canonical (seam down, pull right) pose
 *  turned for a pass that stands upright (seam across, pull down). */
const turnAffine = (m: Affine): Affine => [m[3], m[2], m[1], m[0], m[5], m[4]];
/** A · B: B first, then A. */
const mulAffine = (A: Affine, B: Affine): Affine => [
  A[0] * B[0] + A[2] * B[1],
  A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3],
  A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4],
  A[1] * B[4] + A[3] * B[5] + A[5],
];

type Press = {
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  touch: boolean;
  /** A finger on a screen that scrolls under it: the pass waits to be
   *  picked up (sideways, or held) and lets a vertical swipe go. */
  pan: boolean;
  onStub: boolean;
  mode: 'pending' | 'drag' | 'tear' | 'hand';
  /** The grab point in the body's own box (px), and as −1…1 from its middle. */
  gx: number;
  gy: number;
  nx: number;
  ny: number;
  /** The grab point in the stub's own box (px): where the fingers hold it. */
  sx: number;
  sy: number;
  /** The body's home (its box at rest) on screen, read once per press. */
  homeX: number;
  homeY: number;
  /** The paper's resistance and the hand's travel for the whole rip (a
   *  finger's are shorter; a rip already started resists no more). */
  resist: number;
  span: number;
  holdTimer: number;
  samples: Array<[number, number, number]>;
};

type Hand = {
  /** The stub's middle on screen and its angle (deg). */
  cx: number;
  cy: number;
  theta: number;
  /** Held: the middle's offset from the hand, easing from where the rip
   *  left it (rx, ry) to where the fingers hold it (tx, ty). */
  held: boolean;
  rx: number;
  ry: number;
  tx: number;
  ty: number;
  theta0: number;
  sway: { s: number; v: number };
  fall: FallState | null;
  fallStart: number;
  gravity: number;
  how: TearHow;
};

export default function BoardingPass({ fields, handle, interactive, onFree, onLetGo, onGone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const mainHalfRef = useRef<HTMLDivElement>(null);
  const seatRef = useRef<HTMLDivElement>(null);
  const stubHalfRef = useRef<HTMLDivElement>(null);
  const stubRef = useRef<HTMLDivElement>(null);
  const liftRefs = useRef<HTMLSpanElement[]>([]);
  const stubLiftRef = useRef<HTMLSpanElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'whole' | 'torn'>('whole');
  const [handHost, setHandHost] = useState<HTMLElement | null>(null);
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const callbacks = useRef({ onFree, onLetGo, onGone });
  callbacks.current = { onFree, onLetGo, onGone };
  // The imperative side, filled in by the effect below.
  const api = useRef<PassHandle>({ tear: () => {}, torn: () => false, setRise: () => {}, setStrain: () => {} });
  useImperativeHandle(handle, () => ({
    tear: (how) => api.current.tear(how),
    torn: () => api.current.torn(),
    setRise: (rise) => api.current.setRise(rise),
    setStrain: (strain) => api.current.setStrain(strain),
  }), []);

  // The QR code: encoded once, the same on the server and the client.
  const qr = useMemo(() => {
    const code = encodeQr(PASS_URL, 'M');
    return { size: code.size, path: qrPath(code, 0) };
  }, []);
  const bars = useMemo(() => {
    const widths = barcodeBars(7, 47);
    let x = 0;
    const rects: string[] = [];
    widths.forEach((w, i) => {
      if (i % 2 === 0) rects.push(`M${x} 0h${w}v1h-${w}z`);
      x += w;
    });
    return { width: x, path: rects.join('') };
  }, []);

  useEffect(() => {
    setHandHost(document.body);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const body = bodyRef.current;
    const main = mainRef.current;
    const mainHalf = mainHalfRef.current;
    const seat = seatRef.current;
    const stubHalf = stubHalfRef.current;
    const stub = stubRef.current;
    const stubLift = stubLiftRef.current;
    if (!root || !body || !main || !mainHalf || !seat || !stubHalf || !stub || !stubLift) return;
    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const uprightQuery = window.matchMedia('(max-width: 639px)');
    // Where the pass's main part lets a vertical swipe scroll the page
    // (entrance.css: touch-action pan-y under a coarse pointer).
    const coarseQuery = window.matchMedia('(pointer: coarse)');
    const fibres = [main, stub].map((half) => half.querySelector<HTMLElement>(':scope > .bp-fibre'));
    const strains = [main, stub].map((half) => half.querySelector<HTMLElement>(':scope > .bp-strain'));

    // ── The one writer ──
    const written = new Map<HTMLElement, Map<string, string>>();
    const put = (element: HTMLElement | null | undefined, property: string, value: string | null) => {
      if (!element) return;
      let props = written.get(element);
      if (!props) {
        props = new Map();
        written.set(element, props);
      }
      if ((props.get(property) ?? null) === value) return;
      if (value == null) {
        element.style.removeProperty(property);
        props.delete(property);
      } else {
        element.style.setProperty(property, value);
        props.set(property, value);
      }
    };

    // ── State ──
    let bodyState: Body = { x: 0, y: 0, vx: 0, vy: 0 };
    let sway = { s: 0, v: 0 };
    // The pick-up (0 → 1 while held: tilt, a hair of scale, the deep
    // shadow) and the hover's answer (the shadow only, never the type's
    // transform: a mouse resting on the pass reads crisp print).
    let lift = 0;
    let hoverLift = 0;
    let hovering = false;
    let tiltN = { nx: 0, ny: 0 };
    let give = 0;
    let press: Press | null = null;
    let tearPhase: 'whole' | 'free' | 'gone' = 'whole';
    let clock = 0;
    let smooth = true;
    let strain = 0;
    // How far the rip has run for good: what has torn stays torn.
    let floor = 0;
    let rise = 1;
    let risen: boolean | null = null;
    // A tap's peel: its start (ms) while it plays.
    let peekStart = -1;
    // Once the stub is off, the main part is centred in its frame.
    let restShift: [number, number] = [0, 0];
    let play: { from: number; to: number; start: number; dur: number; ease?: (x: number) => number; done?: () => void } | null = null;
    let hand: Hand | null = null;
    let raf = 0;
    let last = 0;
    let disposed = false;
    const reduced = () => reduceQuery.matches;

    // ── Layout: read once per resize, never per frame ──
    const L = {
      upright: false,
      w: 0,
      h: 0,
      seatW: 0,
      seatH: 0,
      frameW: window.innerWidth,
      frameH: window.innerHeight,
      rest: { x0: 0, x1: 0, y0: 0, y1: 0 },
      reach: { x0: 0, x1: 0, y0: 0, y1: 0 },
      band: { x: 1, y: 1 },
      span: 100,
      seam: 0,
      along: 0,
      edgeKey: '',
    };
    const axis = () => (L.upright ? { x: 0, y: 1 } : { x: 1, y: 0 });
    const measure = () => {
      L.upright = uprightQuery.matches;
      L.w = body.offsetWidth || L.w;
      L.h = body.offsetHeight || L.h;
      L.seatW = seat.offsetWidth || L.seatW;
      L.seatH = seat.offsetHeight || L.seatH;
      const frame = root.parentElement;
      L.frameW = frame?.clientWidth || window.innerWidth;
      L.frameH = frame?.clientHeight || window.innerHeight;
      if (tearPhase !== 'whole' && !reduced()) restShift = L.upright ? [0, L.seatH / 2] : [L.seatW / 2, 0];
      const areas = passAreas(L.frameW, L.frameH, L.w, L.h, restShift);
      L.rest = areas.rest;
      L.reach = areas.reach;
      L.band = areas.band;
      L.seam = L.upright ? L.seatW : L.seatH;
      L.along = L.upright ? L.seatH : L.seatW;
      const key = `${L.upright ? 'u' : 'l'}${Math.round(L.seam)}`;
      if (key !== L.edgeKey && L.seam > 0) {
        L.edgeKey = key;
        const edge = L.upright ? tornEdgeAcross(L.seam, EDGE_SEED, FIBRE_INK) : tornEdge(L.seam, EDGE_SEED, FIBRE_INK);
        root.style.setProperty('--bp-edge-main', edge.faceCut);
        root.style.setProperty('--bp-edge-stub', edge.stubCut);
        root.style.setProperty('--bp-fringe-main', edge.faceFringe);
        root.style.setProperty('--bp-fringe-stub', edge.stubFringe);
      }
      L.span = tearSpan(L.seam, false);
      root.dataset.orient = L.upright ? 'upright' : 'landscape';
      // A pass left away from its (new) place comes back to it.
      wake();
      drawAll();
    };

    // ── Drawing ──
    const drawBody = () => {
      const x = bodyState.x + axis().x * give;
      const y = bodyState.y + axis().y * give;
      const { rx, ry } = tiltFor(tiltN.nx, tiltN.ny, lift);
      const s = sway.s;
      const moving = lift > 0.002 || Math.abs(s) > 0.01 || Math.abs(rx) > 0.01 || Math.abs(ry) > 0.01;
      if (!moving && Math.abs(x) < 0.01 && Math.abs(y) < 0.01) put(body, 'transform', null);
      else if (!moving) put(body, 'transform', `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`);
      else {
        const k = 1 + 0.018 * lift;
        put(
          body,
          'transform',
          `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${s.toFixed(3)}deg) perspective(${PERSPECTIVE}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${k.toFixed(4)})`,
        );
      }
      put(body, 'will-change', moving || press ? 'transform' : null);
      const shadow = Math.max(lift, hoverLift);
      liftRefs.current.forEach((el) => {
        put(el, 'opacity', shadow > 0.002 ? shadow.toFixed(3) : null);
        put(el, 'transform', shadow > 0.002 ? `translateY(${(10 * shadow).toFixed(2)}px)` : null);
      });
    };

    const canonFrame = () => ({ w: L.along, h: L.seam, vw: L.along * 4 });
    const turned = (m: Affine) => {
      const mc = mirrorAffine(m, L.along);
      return L.upright ? turnAffine(mc) : mc;
    };
    const drawTear = () => {
      if (tearPhase !== 'whole') return;
      const r = reduced();
      const pose = tearPose(clock, canonFrame(), { smooth, reduced: r, hinge: PASS_HINGE, tipFloor: floor });
      let m = pose.m;
      let seamCut = pose.seam;
      let lifted = pose.lift;
      // A tap's peel: the stub's top corner comes away about a point just
      // below the notch, and lies back down — on top of whatever the scroll
      // is already pulling (the pinned pass is rarely without its strain).
      if (peekStart >= 0 && !r) {
        const deg = peekAngle((performance.now() - peekStart) / PEEK_MS);
        const t = (deg * Math.PI) / 180;
        const px = L.along;
        const py = PEEK_PIVOT * L.seam;
        // T(p) · R(−deg) · T(−p): the canonical face's hinge, at the pivot,
        // then the pose.
        const cos = Math.cos(-t);
        const sin = Math.sin(-t);
        m = mulAffine(m, [cos, sin, -sin, cos, px - (cos * px - sin * py), py - (sin * px + cos * py)]);
        seamCut = seamCut || deg > 0.01;
        lifted = Math.max(lifted, 0.5 * (deg / 4));
      }
      const still = r || (clock <= 0 && !(peekStart >= 0));
      put(stubHalf, 'transform', still ? null : affineCss(turned(m)));
      put(stubHalf, 'opacity', pose.op >= 1 ? null : pose.op.toFixed(3));
      put(seat, 'clip-path', seamCut ? (L.upright ? SEAM_CLIP_TOP : SEAM_CLIP_LEFT) : null);
      put(stubLift, 'opacity', lifted > 0 ? (0.8 * Math.min(1, lifted)).toFixed(3) : null);
      const torn = pose.tip > 0 ? `${(pose.tip * L.seam).toFixed(1)}px` : null;
      put(main, '--bp-torn', torn);
      put(stub, '--bp-torn', torn);
      const reveal = ((1 - pose.tip) * 100).toFixed(2);
      const below = (pose.tip * 100).toFixed(2);
      fibres.forEach((fibre) => {
        put(fibre, 'clip-path', pose.tip > 0 ? (L.upright ? `inset(0 ${reveal}% 0 0)` : `inset(0 0 ${reveal}% 0)`) : null);
        put(fibre, 'opacity', pose.tip > 0 ? '1' : null);
      });
      // The strain: the hand's pull (or the scroll's), on the seam below the tip.
      const amount = pose.strain;
      strains.forEach((el, index) => {
        const a = amount * (index === 0 ? 0.9 : 1);
        put(el, 'clip-path', a > 0 ? (L.upright ? `inset(0 0 0 ${below}%)` : `inset(${below}% 0 0 0)`) : null);
        put(el, 'opacity', a > 0 ? a.toFixed(3) : null);
      });
      put(stubHalf, 'will-change', (clock > 0 && clock < TEAR_FREE_MS) || peekStart >= 0 ? 'transform' : null);
    };

    const drawHand = () => {
      const el = handRef.current;
      if (!el) return;
      if (!hand) {
        put(el, 'transform', null);
        put(el, 'visibility', null);
        return;
      }
      const t = (hand.theta * Math.PI) / 180;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      const hx = L.seatW / 2;
      const hy = L.seatH / 2;
      // T(c) · R(θ) · T(−half): the stub's middle on (cx, cy), turned θ.
      const e = hand.cx - (cos * hx - sin * hy);
      const f = hand.cy - (sin * hx + cos * hy);
      put(el, 'width', `${L.seatW}px`);
      put(el, 'height', `${L.seatH}px`);
      put(el, 'transform', `matrix(${cos.toFixed(5)}, ${sin.toFixed(5)}, ${(-sin).toFixed(5)}, ${cos.toFixed(5)}, ${e.toFixed(2)}, ${f.toFixed(2)})`);
      put(el, 'visibility', 'visible');
    };

    const drawRise = () => {
      const e = smootherstep(Math.max(0, Math.min(1, rise)));
      // Not in place yet, it cannot be picked up: a finger swiping the page
      // up over the rising pass scrolls the page (and a grab mid-rise would
      // miss its point under the turn).
      const inPlace = rise >= 0.98;
      if (inPlace !== risen) {
        risen = inPlace;
        if (inPlace) root.setAttribute('data-risen', '');
        else root.removeAttribute('data-risen');
      }
      if (e >= 0.999) {
        put(root, 'transform', null);
        put(root, 'opacity', null);
        return;
      }
      // Reduced motion: the pass comes up in place (its ink only, no tilt).
      put(root, 'transform', reduced() ? null : `perspective(1600px) translate3d(0, ${((1 - e) * 64).toFixed(2)}px, 0) rotateX(${((1 - e) * 16).toFixed(3)}deg) scale(${(0.955 + 0.045 * e).toFixed(4)})`);
      put(root, 'opacity', Math.min(1, e * 1.8).toFixed(3));
    };

    const drawAll = () => {
      drawBody();
      drawTear();
      drawHand();
      drawRise();
    };

    // ── The clock ──
    const wake = () => {
      if (raf || disposed) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const tick = (now: number) => {
      raf = 0;
      if (disposed) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let moving = false;
      const r = reduced();
      const held = press?.mode === 'drag';

      // The pass.
      if (!held && !r) {
        if (!bodyAtRest(bodyState, L.rest)) {
          bodyState = stepBody(bodyState, dt, L.rest);
          moving = true;
        } else if (bodyState.vx !== 0 || bodyState.vy !== 0 || bodyState.x !== L.rest.x0 || bodyState.y !== L.rest.y0) {
          // Set down exactly in its place (no half-pixel left over).
          const [x, y] = clampToArea(bodyState.x, bodyState.y, L.rest);
          bodyState = { x, y, vx: 0, vy: 0 };
        }
      }
      const liftTarget = held ? 1 : 0;
      lift = approach(lift, liftTarget, PASS_HAND.liftRate, dt);
      if (Math.abs(lift - liftTarget) < 0.002) lift = liftTarget;
      else moving = true;
      const hoverTarget =
        !r && tearPhase === 'whole' && interactiveRef.current && (hovering || press?.mode === 'pending') ? PASS_HAND.hoverLift : 0;
      hoverLift = approach(hoverLift, hoverTarget, PASS_HAND.liftRate, dt);
      if (Math.abs(hoverLift - hoverTarget) < 0.002) hoverLift = hoverTarget;
      else moving = true;
      // The hand's speed now: a hand held still has none.
      const [hvx] = press ? recentVelocity(press.samples, now) : [0];
      const target = held && press ? swayTarget(hvx, press.ny) : 0;
      sway = stepSway(sway, target, dt);
      if (Math.abs(sway.s - target) > 0.01 || Math.abs(sway.v) > 0.05) moving = true;
      else if (!held) sway = { s: 0, v: 0 };
      if (held && press) {
        // The sway turns the pass about its middle: the grab point stays
        // under the hand, frame by frame.
        followHand(press);
        moving = true;
      }
      if (!held && lift === 0) tiltN = { nx: 0, ny: 0 };

      // A scripted stretch of the tear's clock (a tear, a lying back down).
      if (play) {
        if (play.start < 0) play.start = now;
        const k = play.dur > 0 ? Math.min(1, (now - play.start) / play.dur) : 1;
        clock = play.from + (play.to - play.from) * (play.ease ? play.ease(k) : k);
        if (k >= 1) {
          const done = play.done;
          play = null;
          done?.();
        } else moving = true;
      }
      // A tap's peel.
      if (peekStart >= 0) {
        if (performance.now() - peekStart >= PEEK_MS || play || press?.mode === 'tear') peekStart = -1;
        else moving = true;
      }

      // The stub in the hand, or falling.
      if (hand) {
        if (hand.held && press) {
          hand.sway = stepSway(hand.sway, swayTarget(hvx, -0.4), dt);
          // From where the rip left it to where the fingers hold it.
          const catchUp = 1 - Math.exp(-CATCH_RATE * dt);
          hand.rx += (hand.tx - hand.rx) * catchUp;
          hand.ry += (hand.ty - hand.ry) * catchUp;
          const t = (hand.sway.s * Math.PI) / 180;
          hand.cx = press.x + Math.cos(t) * hand.rx - Math.sin(t) * hand.ry;
          hand.cy = press.y + Math.sin(t) * hand.rx + Math.cos(t) * hand.ry;
          hand.theta = hand.theta0 + hand.sway.s;
          moving = true;
        } else if (hand.fall) {
          hand.fall = stepFall(hand.fall, dt, hand.gravity);
          hand.cx = hand.fall.x;
          hand.cy = hand.fall.y;
          hand.theta = hand.fall.a;
          const gone = hand.fall.y - Math.hypot(L.seatW, L.seatH) / 2 > window.innerHeight + 20 || now - hand.fallStart > STUB_FALL.maxMs;
          if (gone) {
            hand = null;
            tearPhase = 'gone';
            root.dataset.stub = 'gone';
            callbacks.current.onGone?.();
          } else moving = true;
        }
      }

      drawAll();
      if (moving) raf = requestAnimationFrame(tick);
    };

    const run = (to: number, dur: number, ease?: (x: number) => number, done?: () => void) => {
      play = { from: clock, to, start: -1, dur: Math.max(0, dur), ease, done };
      wake();
    };

    // ── Free: the stub leaves the pass ──
    // Handed to a fixed layer (it stays in the hand whatever the page does):
    // its box on screen is the seat's, read once, here; its pose there is
    // the pose it came free in, so the handover is seamless.
    const free = (how: TearHow, heldBy: Press | null) => {
      if (tearPhase !== 'whole') return;
      tearPhase = 'free';
      root.dataset.stub = 'free';
      setPhase('torn');
      clock = TEAR_FREE_MS;
      floor = 1;
      peekStart = -1;
      const m = turned(tearPose(TEAR_FREE_MS, canonFrame(), { smooth, hinge: PASS_HINGE }).m);
      const box = seat.getBoundingClientRect();
      const theta = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
      const hx = L.seatW / 2;
      const hy = L.seatH / 2;
      const cx = box.left + m[0] * hx + m[2] * hy + m[4];
      const cy = box.top + m[1] * hx + m[3] * hy + m[5];
      // Where the fingers hold it: the grabbed point of the stub, under the
      // hand, the stub turned as it came free.
      const cos = m[0];
      const sin = m[1];
      const ox = heldBy ? hx - heldBy.sx : 0;
      const oy = heldBy ? hy - heldBy.sy : 0;
      hand = {
        cx,
        cy,
        theta,
        held: !!heldBy,
        rx: heldBy ? cx - heldBy.x : 0,
        ry: heldBy ? cy - heldBy.y : 0,
        tx: cos * ox - sin * oy,
        ty: sin * ox + cos * oy,
        theta0: theta,
        sway: { s: 0, v: 0 },
        fall: null,
        fallStart: 0,
        gravity: STUB_FALL.gravity,
        how,
      };
      // The hand's copy of the stub prints the same torn edge.
      const handEl = handRef.current;
      if (handEl) {
        ['--bp-edge-stub', '--bp-fringe-stub'].forEach((name) => handEl.style.setProperty(name, root.style.getPropertyValue(name)));
      }
      if (!heldBy) toss(how);
      // The pass: the main part keeps its torn edge whole; the seat is empty.
      put(main, '--bp-torn', `${L.seam.toFixed(1)}px`);
      // (Its fibres out along the whole seam; the stub's go with the stub.)
      put(fibres[0], 'clip-path', 'none');
      put(fibres[0], 'opacity', '1');
      strains.forEach((el) => {
        put(el, 'opacity', null);
        put(el, 'clip-path', null);
      });
      put(seat, 'clip-path', null);
      put(stubHalf, 'visibility', 'hidden');
      put(stubHalf, 'will-change', null);
      put(stubLift, 'opacity', null);
      give = 0;
      // The main part, alone now, eases to the middle of its frame (where
      // the prompt was centred), and stays there.
      if (!reduced()) {
        restShift = L.upright ? [0, L.seatH / 2] : [L.seatW / 2, 0];
        L.rest = passAreas(L.frameW, L.frameH, L.w, L.h, restShift).rest;
      }
      callbacks.current.onFree?.(how);
      wake();
    };

    const toss = (how: TearHow) => {
      if (!hand) return;
      // Torn by the scroll the page is about to move up: the stub goes DOWN,
      // and fast, off the screen before the page sets off.
      const scroll = how === 'scroll';
      const [along, up, spin] = scroll ? STUB_FALL.scrollToss : STUB_FALL.toss;
      hand.held = false;
      hand.gravity = scroll ? STUB_FALL.scrollGravity : STUB_FALL.gravity;
      hand.fall = L.upright
        ? { x: hand.cx, y: hand.cy, vx: scroll ? along : along * 0.7, vy: scroll ? up : up * 0.75, a: hand.theta, va: spin }
        : { x: hand.cx, y: hand.cy, vx: along, vy: up, a: hand.theta, va: spin };
      hand.fallStart = performance.now();
      callbacks.current.onLetGo?.(how);
    };

    const letGo = (vx: number, vy: number) => {
      if (!hand) return;
      const [tx, ty] = throwVelocity(vx, vy);
      hand.held = false;
      hand.fall = { x: hand.cx, y: hand.cy, vx: tx * 0.9, vy: ty * 0.9, a: hand.theta, va: hand.sway.v * 0.6 };
      hand.fallStart = performance.now();
      callbacks.current.onLetGo?.('hand');
      wake();
    };

    // ── A scripted tear: the paper's own catches, then the toss ──
    const scriptedTear = (how: TearHow) => {
      if (tearPhase !== 'whole') return;
      if (press && (press.mode === 'tear' || press.mode === 'hand')) return;
      peekStart = -1;
      if (reduced()) {
        // Values, not structure: the stub fades in place, the pass stays.
        smooth = false;
        run(TEAR_MS, TEAR_REDUCED_MS, undefined, () => {
          tearPhase = 'gone';
          root.dataset.stub = 'gone';
          setPhase('torn');
          put(stubHalf, 'visibility', 'hidden');
          put(main, '--bp-torn', `${L.seam.toFixed(1)}px`);
          callbacks.current.onFree?.(how);
          callbacks.current.onLetGo?.(how);
        });
        return;
      }
      smooth = false;
      strain = 0;
      run(TEAR_FREE_MS, Math.max(120, TEAR_FREE_MS - clock), undefined, () => free(how, null));
    };

    // ── The hand ──
    const preventSelection = (event: Event) => event.preventDefault();
    const release = (current: Press) => {
      window.clearTimeout(current.holdTimer);
      root.removeAttribute('data-held');
      document.removeEventListener('selectstart', preventSelection, true);
      try {
        if (body.hasPointerCapture(current.id)) body.releasePointerCapture(current.id);
      } catch {
        // Already released.
      }
    };
    const pickUp = (current: Press) => {
      current.mode = 'drag';
      tiltN = { nx: current.nx, ny: current.ny };
      root.setAttribute('data-held', 'drag');
      document.addEventListener('selectstart', preventSelection, true);
      wake();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!interactiveRef.current || press || event.button !== 0 || !event.isPrimary) return;
      if (hand) return;
      const onStub = tearPhase === 'whole' && !play && seat.contains(event.target as Node);
      // The body's home on screen (its box at rest): the root's box, once
      // it has risen (the root carries only the rise).
      const home = root.getBoundingClientRect();
      const cx = L.w / 2;
      const cy = L.h / 2;
      // The grab point in the body's own box: the pointer, less where the
      // body is, turned back by its sway (its tilt is ignored: ≤ 10°).
      const px = event.clientX - home.left - bodyState.x - cx;
      const py = event.clientY - home.top - bodyState.y - cy;
      const t = (-sway.s * Math.PI) / 180;
      const gx = cx + Math.cos(t) * px - Math.sin(t) * py;
      const gy = cy + Math.sin(t) * px + Math.cos(t) * py;
      // The stub's own box: the seat, beside (or below) the main part.
      const seatX = L.upright ? 0 : L.w - L.seatW;
      const seatY = L.upright ? L.h - L.seatH : 0;
      const touch = event.pointerType === 'touch';
      const current: Press = {
        id: event.pointerId,
        x0: event.clientX,
        y0: event.clientY,
        x: event.clientX,
        y: event.clientY,
        touch,
        pan: touch && coarseQuery.matches && !onStub,
        onStub,
        mode: 'pending',
        gx,
        gy,
        nx: Math.max(-1, Math.min(1, (gx - cx) / Math.max(1, cx))),
        ny: Math.max(-1, Math.min(1, (gy - cy) / Math.max(1, cy))),
        sx: Math.max(0, Math.min(L.seatW, gx - seatX)),
        sy: Math.max(0, Math.min(L.seatH, gy - seatY)),
        homeX: home.left,
        homeY: home.top,
        // A rip already started resists no more.
        resist: floor > 0 ? 0 : tearResist(touch),
        span: touch ? tearSpan(L.seam, true) : L.span,
        holdTimer: 0,
        samples: [[event.timeStamp, event.clientX, event.clientY]],
      };
      press = current;
      // A finger that holds still picks the pass up.
      if (current.pan && !reduced()) {
        current.holdTimer = window.setTimeout(() => {
          if (press === current && current.mode === 'pending') pickUp(current);
        }, TOUCH_HOLD_MS);
      }
      try {
        body.setPointerCapture(event.pointerId);
      } catch {
        // Capture only keeps the moves coming once the hand leaves the pass.
      }
      wake();
    };

    const followHand = (current: Press) => {
      // The grab point under the hand, one to one, the body turned by its
      // sway about its middle; past its reach, a rubber band.
      const cx = L.w / 2;
      const cy = L.h / 2;
      const t = (sway.s * Math.PI) / 180;
      const rx = Math.cos(t) * (current.gx - cx) - Math.sin(t) * (current.gy - cy);
      const ry = Math.sin(t) * (current.gx - cx) + Math.cos(t) * (current.gy - cy);
      const rawX = current.x - current.homeX - cx - rx;
      const rawY = current.y - current.homeY - cy - ry;
      bodyState = {
        x: rubberBand(rawX, L.reach.x0, L.reach.x1, L.band.x),
        y: rubberBand(rawY, L.reach.y0, L.reach.y1, L.band.y),
        vx: 0,
        vy: 0,
      };
    };

    const travelOf = (current: Press) => {
      const a = axis();
      const dx = current.x - current.x0;
      const dy = current.y - current.y0;
      return pullTravel(dx * a.x + dy * a.y, dx * a.y - dy * a.x, current.touch);
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = press;
      if (!current || event.pointerId !== current.id) return;
      current.x = event.clientX;
      current.y = event.clientY;
      current.samples.push([event.timeStamp, event.clientX, event.clientY]);
      while (current.samples.length > 2 && event.timeStamp - current.samples[0][0] > PASS_HAND.velocityWindowMs) current.samples.shift();
      const dx = event.clientX - current.x0;
      const dy = event.clientY - current.y0;
      if (current.mode === 'pending') {
        if (Math.hypot(dx, dy) < SLOP) return;
        if (reduced()) return;
        const a = axis();
        const along = dx * a.x + dy * a.y;
        if (current.onStub && tearPhase === 'whole' && along >= PULL_BIAS * Math.hypot(dx, dy)) {
          window.clearTimeout(current.holdTimer);
          current.mode = 'tear';
          strain = 0;
          smooth = true;
          play = null;
          peekStart = -1;
          root.setAttribute('data-held', 'tear');
          document.addEventListener('selectstart', preventSelection, true);
        } else if (current.pan) {
          // A finger on a page that scrolls: sideways picks the pass up; a
          // swipe up or down is the page's (the browser takes it).
          if (Math.abs(dx) >= TOUCH_PICK_PX && Math.abs(dx) > TOUCH_SIDEWAYS * Math.abs(dy)) {
            window.clearTimeout(current.holdTimer);
            pickUp(current);
          } else if (Math.abs(dy) >= TOUCH_PICK_PX && Math.abs(dy) >= Math.abs(dx)) {
            press = null;
            release(current);
            wake();
            return;
          } else return;
        } else {
          window.clearTimeout(current.holdTimer);
          pickUp(current);
        }
      }
      if (current.mode === 'drag') {
        followHand(current);
        drawBody();
        wake();
        return;
      }
      if (current.mode === 'tear') {
        const travel = travelOf(current);
        clock = tearClock(travel, current.span, current.resist);
        give = current.resist > 0 ? tearGive(travel, current.span, current.resist) : 0;
        if (clock >= TEAR_FREE_MS) {
          current.mode = 'hand';
          root.setAttribute('data-held', 'hand');
          free('hand', current);
          return;
        }
        drawBody();
        drawTear();
        return;
      }
      if (current.mode === 'hand') wake();
    };

    const onPointerEnd = (event: PointerEvent) => {
      const current = press;
      if (!current || event.pointerId !== current.id) return;
      press = null;
      release(current);
      const cancelled = event.type !== 'pointerup';
      // The hand's speed as it lets go: none if it had stopped.
      const [vx, vy] = recentVelocity(current.samples, event.timeStamp);
      if (current.mode === 'pending') {
        // A tap on the stub peels it a little: the tear itself is a pull,
        // or the Tear button's (Enter's, Space's).
        if (!cancelled && current.onStub && tearPhase === 'whole' && !play && !reduced()) {
          peekStart = performance.now();
        }
        wake();
        return;
      }
      if (current.mode === 'drag') {
        const [tx, ty] = throwVelocity(vx, vy);
        bodyState = { ...bodyState, vx: cancelled ? 0 : tx, vy: cancelled ? 0 : ty };
        wake();
        return;
      }
      if (current.mode === 'tear') {
        const a = axis();
        const travel = travelOf(current);
        const speed = (vx * a.x + vy * a.y) / 1000;
        give = 0;
        if (!cancelled && tearCommits(travel, current.span, speed, current.resist)) {
          smooth = true;
          run(TEAR_FREE_MS, Math.max(90, (TEAR_FREE_MS - clock) * 0.7), undefined, () => free('hand', null));
          return;
        }
        // Let go early: what has torn stays torn; the stub lies back down.
        if (clock > TEAR_TENSION_MS) floor = Math.max(floor, handTipAt(clock));
        smooth = true;
        run(0, SPRING_BACK_MS, arrive);
        return;
      }
      if (current.mode === 'hand') letGo(cancelled ? 0 : vx, cancelled ? 0 : vy);
    };

    // A thumb that has picked the pass up (or is tearing its stub) keeps
    // the page still under it.
    const onTouchMove = (event: TouchEvent) => {
      if (press && press.mode !== 'pending' && event.cancelable) event.preventDefault();
    };
    const onPointerEnter = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      hovering = true;
      wake();
    };
    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      hovering = false;
      wake();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target !== body) return;
      event.preventDefault();
      scriptedTear('key');
    };
    const noDrag = (event: Event) => event.preventDefault();

    body.addEventListener('pointerdown', onPointerDown);
    body.addEventListener('pointermove', onPointerMove);
    body.addEventListener('pointerup', onPointerEnd);
    body.addEventListener('pointercancel', onPointerEnd);
    body.addEventListener('lostpointercapture', onPointerEnd);
    body.addEventListener('pointerenter', onPointerEnter);
    body.addEventListener('pointerleave', onPointerLeave);
    body.addEventListener('touchmove', onTouchMove, { passive: false });
    body.addEventListener('keydown', onKeyDown);
    body.addEventListener('dragstart', noDrag);

    api.current = {
      tear: (how) => scriptedTear(how),
      torn: () => tearPhase !== 'whole',
      setRise: (value) => {
        if (Math.abs(value - rise) < 0.0005) return;
        rise = value;
        drawRise();
      },
      setStrain: (value) => {
        // Reduced motion: the scroll does not pull at the paper.
        const next = reduced() ? 0 : Math.max(0, Math.min(1, value));
        if (Math.abs(next - strain) < 0.002) return;
        strain = next;
        if (tearPhase !== 'whole' || press?.mode === 'tear' || play) return;
        // The scroll pulls on the stub as a hand would: the strain, then the
        // first of the rip (which, like a hand's, stays torn); the pass
        // gives a little toward the pull.
        peekStart = -1;
        smooth = true;
        const travel = scrollTravel(strain, L.span, floor > 0 ? 0 : tearResist(false));
        clock = tearClock(travel, L.span, floor > 0 ? 0 : tearResist(false));
        if (clock > TEAR_TENSION_MS) floor = Math.max(floor, handTipAt(clock));
        give = floor > 0 ? 0 : tearGive(travel, L.span);
        drawBody();
        drawTear();
      },
    };

    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    resize?.observe(root);
    const onViewport = () => measure();
    window.addEventListener('resize', onViewport, { passive: true });
    uprightQuery.addEventListener('change', onViewport);
    measure();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (press) window.clearTimeout(press.holdTimer);
      resize?.disconnect();
      window.removeEventListener('resize', onViewport);
      uprightQuery.removeEventListener('change', onViewport);
      document.removeEventListener('selectstart', preventSelection, true);
      body.removeEventListener('pointerdown', onPointerDown);
      body.removeEventListener('pointermove', onPointerMove);
      body.removeEventListener('pointerup', onPointerEnd);
      body.removeEventListener('pointercancel', onPointerEnd);
      body.removeEventListener('lostpointercapture', onPointerEnd);
      body.removeEventListener('pointerenter', onPointerEnter);
      body.removeEventListener('pointerleave', onPointerLeave);
      body.removeEventListener('touchmove', onTouchMove);
      body.removeEventListener('keydown', onKeyDown);
      body.removeEventListener('dragstart', noDrag);
      written.forEach((props, element) => props.forEach((_value, property) => element.style.removeProperty(property)));
      written.clear();
      root.removeAttribute('data-risen');
    };
  }, []);

  const toScale = destinationScale(fields.to);
  const torn = phase === 'torn';
  const stubFace = (hand: boolean) => (
    <div ref={hand ? undefined : stubRef} className={`bp-stub${hand ? ' bp-stub--hand' : ''}`}>
      <i className="bp-fibre" aria-hidden="true" />
      <i className="bp-strain" aria-hidden="true" />
      <div className="bp-band bp-band--stub">
        <span className="bp-band__kind">Boarding pass</span>
        <span className="bp-band__flight">{fields.flight}</span>
      </div>
      <div className="bp-stub__fields">
        <span className="bp-field bp-field--stack">
          <span className="bp-label">Passenger</span>
          <span className="bp-value">{fields.passenger}</span>
        </span>
        <span className="bp-field bp-field--stack bp-stub__to">
          <span className="bp-label">To</span>
          <span className="bp-value bp-value--city">
            {fields.to}
            {fields.toCode && <span className="bp-code">{fields.toCode}</span>}
          </span>
        </span>
        <span className="bp-stub__pair">
          <span className="bp-field bp-field--stack">
            <span className="bp-label">Seat</span>
            <span className="bp-value">{fields.seat}</span>
          </span>
          <span className="bp-field bp-field--stack">
            <span className="bp-label">Gate</span>
            <span className="bp-value">{fields.gate}</span>
          </span>
        </span>
      </div>
      <svg className="bp-barcode" viewBox={`0 0 ${bars.width} 1`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={bars.path} />
      </svg>
    </div>
  );

  return (
    <div ref={rootRef} className="bp" style={{ ['--bp-to-scale' as string]: String(toScale) }}>
      <div
        ref={bodyRef}
        className="bp-body"
        tabIndex={interactive && !torn ? 0 : -1}
        role="group"
        aria-roledescription="boarding pass"
        aria-label={`Boarding pass: ${fields.passenger}, from ${fields.from.toLowerCase()} to ${fields.to.toLowerCase()}, flight ${fields.flight}, seat ${fields.seat}. ${torn ? 'The stub is torn off.' : 'Press Enter to tear off the stub.'} Its QR code opens ryanxugallery.com.`}
      >
        <div ref={mainHalfRef} className="bp-half bp-half--main">
          <span className="bp-shadow" aria-hidden="true" />
          <span ref={(el) => { if (el) liftRefs.current[0] = el; }} className="bp-shadow bp-shadow--lift" aria-hidden="true" />
          <div ref={mainRef} className="bp-main">
            <i className="bp-fibre" aria-hidden="true" />
            <i className="bp-strain" aria-hidden="true" />
            <div className="bp-band">
              <span className="bp-band__mark" aria-hidden="true">RX</span>
              <span className="bp-band__kind">Boarding pass</span>
              <span className="bp-band__flight">Flight {fields.flight}</span>
            </div>
            <div className="bp-route">
              <span className="bp-field bp-field--stack bp-route__from">
                <span className="bp-label">From</span>
                <span className="bp-city bp-city--from">{fields.from}</span>
              </span>
              <svg className="bp-arrow" viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <path d="M0 6H116" />
                <path d="M109 1.5L116 6L109 10.5" />
              </svg>
              <span className="bp-field bp-field--stack bp-route__to">
                <span className="bp-label">To</span>
                <span className="bp-city">
                  {fields.to}
                  {fields.toCode && <span className="bp-code">{fields.toCode}</span>}
                </span>
              </span>
            </div>
            <div className="bp-grid">
              <span className="bp-field bp-field--stack bp-grid__wide">
                <span className="bp-label">Passenger</span>
                <span className="bp-value">{fields.passenger}</span>
              </span>
              <span className="bp-field bp-field--stack">
                <span className="bp-label">Flight</span>
                <span className="bp-value">{fields.flight}</span>
              </span>
              <span className="bp-field bp-field--stack">
                <span className="bp-label">Date</span>
                <span className="bp-value">{fields.date}</span>
              </span>
              <span className="bp-field bp-field--stack">
                <span className="bp-label">Gate</span>
                <span className="bp-value">{fields.gate}</span>
              </span>
              <span className="bp-field bp-field--stack">
                <span className="bp-label">Seat</span>
                <span className="bp-value">{fields.seat}</span>
              </span>
              <span className="bp-field bp-field--stack">
                <span className="bp-label">Boarding</span>
                <span className="bp-value">{fields.boarding}</span>
              </span>
            </div>
            <span className="bp-qr">
              <svg
                className="bp-qr__code"
                viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`}
                shapeRendering="crispEdges"
                role="img"
                aria-label="QR code: ryanxugallery.com"
              >
                <rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} className="bp-qr__ground" />
                <path d={qr.path} />
              </svg>
              <span className="bp-qr__cap" aria-hidden="true">ryanxugallery.com</span>
            </span>
          </div>
        </div>
        <div ref={seatRef} className="bp-seat">
          <div ref={stubHalfRef} className="bp-half bp-half--stub">
            <span className="bp-shadow" aria-hidden="true" />
            <span ref={(el) => { if (el) liftRefs.current[1] = el; }} className="bp-shadow bp-shadow--lift" aria-hidden="true" />
            <span ref={stubLiftRef} className="bp-shadow bp-shadow--tear" aria-hidden="true" />
            {stubFace(false)}
          </div>
        </div>
      </div>
      {/* The stub once it is free: in the hand (a fixed layer, so it stays
          there whatever the page does), then falling. */}
      {handHost &&
        createPortal(
          <div className="bp-hand-layer" aria-hidden="true">
            <div ref={handRef} className="bp-hand" style={{ ['--bp-to-scale' as string]: String(toScale) }}>
              <span className="bp-shadow bp-shadow--hand" />
              {stubFace(true)}
            </div>
          </div>,
          handHost,
        )}
    </div>
  );
}
