import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref, type RefObject } from 'react';
import { encodeQr, qrPath } from '../../lib/qrCode';
import {
  HOVER_PEEL_DEG,
  HOVER_RATE,
  PASS_DRAG,
  PASS_HINGE,
  PASS_URL,
  PEEK_MS,
  PEEK_PIVOT,
  approach,
  barcodeBars,
  clampOffset,
  destinationScale,
  isDrag,
  offsetBounds,
  paperRest,
  paperStep,
  paperTransform,
  releaseVelocity,
  rubber,
  passResponse,
  peekAngle,
  type FreeStub,
  type PassFields,
} from '../../lib/boardingPass';
import {
  TEAR_FREE_MS,
  TEAR_MS,
  TEAR_REDUCED_MS,
  affineCss,
  mirrorAffine,
  tearPose,
  tornEdge,
  type Affine,
} from '../../lib/ticketTear';

// ── The boarding pass: a start button (src/lib/boardingPass.ts has the
// numbers and reasons) ──
// A white paper pass: the main part and a stub, one perforation between
// them. It is the way into the archive, and only its stub opens it: a click
// or a tap on the stub (or Enter / Space: the stub is a real button) plays
// the whole tear — the paper's catches down the perforation, the stub
// hinging open about the running rip (the site's own tear,
// src/lib/ticketTear.ts), the torn fibres on both edges — and the stub
// comes free. It is handed on (`onFree`, a copy of its face and its pose on
// the screen): the entrance keeps it with the reader and flies it onto stop
// 01's cover. Hovered (or focused, or pressed) the stub lifts a hair on its
// perforation; a click on the main part peels the stub at its top notch and
// lays it back (that is the way in). Nothing else tears it: no drag, no
// scroll, no timer. The pass can be picked up and moved (boardingPass.ts,
// PASS_DRAG, PAPER): held anywhere — the stub too — it goes with the hand
// once the press has travelled past the threshold (then it is not a
// click), like paper: on a spring, swinging about the held point, leaning
// into its travel, lifted; let go it slides on, settles and lands, whole on
// the screen (a soft edge); the arrow keys move it while the stub has the
// focus. Reduced motion: values, not structure — the stub fades where it
// is; the pass follows the hand directly, nothing swings.
//
// One writer, off one clock: every pose is written straight onto the nodes
// in a rAF loop that runs only while something moves, never through React
// state. React state is only what the words say.

export interface PassHandle {
  /** Tear the stub off (as a click on it does). */
  tear: () => void;
  torn: () => boolean;
}

export interface StubHandover {
  /** A copy of the stub's face, sized as it is on the pass (null under
   *  reduced motion: nothing travels). */
  face: HTMLElement | null;
  /** Where it came free: its centre and turn on the screen, its box. */
  free: FreeStub | null;
}

interface Props {
  fields: PassFields;
  handle?: Ref<PassHandle>;
  /** False while the pass is not yet whole on the page (the film over it,
   *  the assembly under way): it cannot be torn. */
  interactive: boolean;
  /** The tear has begun. */
  onTear?: () => void;
  /** The stub is free: hand it on. */
  onFree?: (stub: StubHandover) => void;
  /** The stub is lifted (hovered, focused, pressed): the hint answers. */
  onLift?: (lifted: boolean) => void;
  /** What moves when the pass is carried (the pass and what goes with it:
   *  its hint); the pass itself when not given. */
  carry?: RefObject<HTMLElement | null>;
}

// The seed of this pass's torn edge (the same profile every time).
const EDGE_SEED = 11;
// The tear shadow's full depth is reached at this peel (deg).
const PEEK_DEG_FOR_SHADE = 4;
// A white paper's torn fibres: its own white, with a faint shade line so
// they read on the paper and on the olive round it.
const FIBRE_INK = { face: 'rgba(251,249,242,0.96)', stub: 'rgba(214,209,194,0.9)' };
// While the stub turns nothing of it may swing across the seam into the main
// part: the band on the main part's side of the seat is cut away.
const SEAM_CLIP_LEFT =
  'polygon(-100vw -100vh, calc(100% + 100vw) -100vh, calc(100% + 100vw) calc(100% + 100vh), -100vw calc(100% + 100vh), -100vw 100%, 0% 100%, 0% 0%, -100vw 0%)';

/** A · B: B first, then A. */
const mulAffine = (A: Affine, B: Affine): Affine => [
  A[0] * B[0] + A[2] * B[1],
  A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3],
  A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4],
  A[1] * B[4] + A[3] * B[5] + A[5],
];

export default function BoardingPass({ fields, handle, interactive, onTear, onFree, onLift, carry }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const seatRef = useRef<HTMLDivElement>(null);
  const stubHalfRef = useRef<HTMLDivElement>(null);
  const stubRef = useRef<HTMLDivElement>(null);
  const stubLiftRef = useRef<HTMLSpanElement>(null);
  const tearRef = useRef<HTMLButtonElement>(null);
  const liftRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<'whole' | 'torn'>('whole');
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const callbacks = useRef({ onTear, onFree, onLift });
  callbacks.current = { onTear, onFree, onLift };
  const carryRef = useRef(carry);
  carryRef.current = carry;
  // The imperative side, filled in by the effect below.
  const api = useRef<PassHandle>({ tear: () => {}, torn: () => false });
  useImperativeHandle(handle, () => ({
    tear: () => api.current.tear(),
    torn: () => api.current.torn(),
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
    const root = rootRef.current;
    const main = mainRef.current;
    const seat = seatRef.current;
    const stubHalf = stubHalfRef.current;
    const stub = stubRef.current;
    const stubLift = stubLiftRef.current;
    const tearButton = tearRef.current;
    if (!root || !main || !seat || !stubHalf || !stub || !stubLift || !tearButton) return;
    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = () => reduceQuery.matches;
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
    let tearPhase: 'whole' | 'tearing' | 'free' = 'whole';
    let clock = 0;
    // The stub's lift on its perforation (deg), and whether it is asked for.
    let peel = 0;
    let hovered = false;
    let focused = false;
    let pressed = false;
    // A peek's start (ms) while it plays.
    let peekStart = -1;
    let play: { from: number; to: number; start: number; dur: number; done?: () => void } | null = null;
    let raf = 0;
    let last = 0;
    let disposed = false;
    let lifted = false;
    // ── Carried (PASS_DRAG, PAPER) ──
    // What moves (the pass with its hint: translated), the pass itself
    // (lifted, swung and leaned about the held point), the paper's state,
    // and the rect of what moves at no offset (`home`: read once per grab
    // and per resize, never per frame).
    const body = root.querySelector<HTMLElement>('.bp-body') ?? root;
    const liftShade = liftRef.current;
    const carried = () => carryRef.current?.current ?? root;
    let paper = paperRest();
    let drawn = { x: 0, y: 0 };
    let home: { left: number; top: number; right: number; bottom: number } | null = null;
    let held = false;
    let squaring = false;
    // The held point from the pass's centre (px), and the swing's lever
    // (the centre less the held point, over the half-width).
    let grab = { x: 0, y: 0 };
    let lever = { x: 0, y: 0 };
    // The pass's centre from the top-left of what moves, px (read at rest).
    let centreIn: { x: number; y: number } | null = null;
    // A press: where it began, whether it has become a drag, the hand's
    // last positions (for the pace at the let-go), where the paper was.
    let press: { id: number; x: number; y: number; from: { x: number; y: number }; drag: boolean; samples: [number, number, number][] } | null = null;
    // The click that ends a drag is not a click.
    let swallowClick = false;
    let swallowTimer = 0;
    const readHome = () => {
      const r = carried().getBoundingClientRect();
      home = { left: r.left - drawn.x, top: r.top - drawn.y, right: r.right - drawn.x, bottom: r.bottom - drawn.y };
    };
    const vw = () => document.documentElement.clientWidth || window.innerWidth;
    const vh = () => window.innerHeight;
    // Unbounded until it has been taken up (its home is read then).
    const FREE = { lo: { x: -Infinity, y: -Infinity }, hi: { x: Infinity, y: Infinity } };
    const bounds = () => (home ? offsetBounds(home, vw(), vh()) : FREE);
    const drawCarry = () => {
      const moved = Math.abs(paper.p.x) > 0.01 || Math.abs(paper.p.y) > 0.01;
      put(carried(), 'transform', moved ? `translate3d(${paper.p.x.toFixed(2)}px, ${paper.p.y.toFixed(2)}px, 0)` : null);
      drawn = moved ? { ...paper.p } : { x: 0, y: 0 };
      put(root, 'transform', paperTransform(paper, grab));
      // The lifted shadow: wider, softer and further down the higher it is.
      const lift = Math.max(0, Math.min(1.2, paper.lift));
      put(liftShade, 'opacity', lift > 0.002 ? Math.min(1, lift).toFixed(3) : null);
      put(liftShade, 'transform', lift > 0.002 ? `translate3d(0, ${(10 * lift).toFixed(2)}px, 0) scale(${(1 + 0.02 * lift).toFixed(4)})` : null);
    };

    // ── Layout: read once per resize, never per frame ──
    const L = { w: 0, h: 0, seatW: 0, seatH: 0, edgeKey: '' };
    const measure = () => {
      L.w = root.offsetWidth || L.w;
      L.h = root.offsetHeight || L.h;
      L.seatW = seat.offsetWidth || L.seatW;
      L.seatH = seat.offsetHeight || L.seatH;
      const key = `${Math.round(L.seatH)}`;
      if (key !== L.edgeKey && L.seatH > 0) {
        L.edgeKey = key;
        const edge = tornEdge(L.seatH, EDGE_SEED, FIBRE_INK);
        root.style.setProperty('--bp-edge-main', edge.faceCut);
        root.style.setProperty('--bp-edge-stub', edge.stubCut);
        root.style.setProperty('--bp-fringe-main', edge.faceFringe);
        root.style.setProperty('--bp-fringe-stub', edge.stubFringe);
      }
      drawTear();
    };

    // ── Drawing ──
    // The tear's score is written for a face pulled off its stub; the pass
    // is held the other way round (the stub comes off), so its pose is the
    // mirror (ticketTear's mirrorAffine): the stub's top-right corner drops
    // first, about the running rip on its left edge.
    const canonFrame = () => ({ w: L.seatW, h: L.seatH, vw: L.seatW * 4 });
    const turned = (m: Affine) => mirrorAffine(m, L.seatW);
    const drawTear = () => {
      if (tearPhase === 'free') return;
      const r = reduced();
      const pose = tearPose(clock, canonFrame(), { smooth: false, reduced: r, hinge: PASS_HINGE });
      let m = pose.m;
      let seamCut = pose.seam;
      let shade = pose.lift;
      // The lift on the perforation (hover, focus, a press) and a click's
      // peek: the stub's top corner comes away about a point just below its
      // top notch, on top of whatever the tear is doing.
      const peek = peekStart >= 0 && !r ? peekAngle((performance.now() - peekStart) / PEEK_MS) : 0;
      const deg = r ? 0 : Math.max(peel, peek);
      if (deg > 0.005) {
        const t = (deg * Math.PI) / 180;
        const px = L.seatW;
        const py = PEEK_PIVOT * L.seatH;
        // T(p) · R(−deg) · T(−p): the canonical face's hinge, at the pivot.
        const cos = Math.cos(-t);
        const sin = Math.sin(-t);
        m = mulAffine(m, [cos, sin, -sin, cos, px - (cos * px - sin * py), py - (sin * px + cos * py)]);
        seamCut = true;
        shade = Math.max(shade, 0.5 * (deg / PEEK_DEG_FOR_SHADE));
      }
      const still = r || (clock <= 0 && deg <= 0.005);
      put(stubHalf, 'transform', still ? null : affineCss(turned(m)));
      put(stubHalf, 'opacity', pose.op >= 1 ? null : pose.op.toFixed(3));
      put(seat, 'clip-path', seamCut && !r ? SEAM_CLIP_LEFT : null);
      put(stubLift, 'opacity', shade > 0 && !r ? (0.8 * Math.min(1, shade)).toFixed(3) : null);
      const torn = pose.tip > 0 ? `${(pose.tip * L.seatH).toFixed(1)}px` : null;
      put(main, '--bp-torn', torn);
      put(stub, '--bp-torn', torn);
      const reveal = ((1 - pose.tip) * 100).toFixed(2);
      const below = (pose.tip * 100).toFixed(2);
      fibres.forEach((fibre) => {
        put(fibre, 'clip-path', pose.tip > 0 ? `inset(0 0 ${reveal}% 0)` : null);
        put(fibre, 'opacity', pose.tip > 0 ? '1' : null);
      });
      strains.forEach((el, index) => {
        const a = pose.strain * (index === 0 ? 0.9 : 1);
        put(el, 'clip-path', a > 0 ? `inset(${below}% 0 0 0)` : null);
        put(el, 'opacity', a > 0 ? a.toFixed(3) : null);
      });
      put(stubHalf, 'will-change', clock > 0 || deg > 0.005 ? 'transform' : null);
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
      // The lift on the perforation: asked for while the stub is hovered,
      // focused or pressed, and only while the pass can be torn.
      const want = !reduced() && tearPhase === 'whole' && interactiveRef.current && (hovered || focused || pressed) ? HOVER_PEEL_DEG : 0;
      peel = approach(peel, want, HOVER_RATE, dt);
      if (Math.abs(peel - want) < 0.01) peel = want;
      else moving = true;
      const nowLifted = want > 0;
      if (nowLifted !== lifted) {
        lifted = nowLifted;
        callbacks.current.onLift?.(lifted);
      }
      // A scripted stretch of the tear's clock.
      if (play) {
        if (play.start < 0) play.start = now;
        const k = play.dur > 0 ? Math.min(1, (now - play.start) / play.dur) : 1;
        clock = play.from + (play.to - play.from) * k;
        if (k >= 1) {
          const done = play.done;
          play = null;
          done?.();
        } else moving = true;
      }
      if (peekStart >= 0) {
        if (performance.now() - peekStart >= PEEK_MS || tearPhase !== 'whole') peekStart = -1;
        else moving = true;
      }
      // The paper (held, sliding, settling, squared for the tear).
      const step = paperStep(paper, { held, lever, bounds: bounds(), square: squaring, reduced: reduced() }, dt);
      paper = step.state;
      if (step.moving) moving = true;
      drawCarry();
      drawTear();
      if (moving) raf = requestAnimationFrame(tick);
    };

    const run = (to: number, dur: number, done?: () => void) => {
      play = { from: clock, to, start: -1, dur: Math.max(0, dur), done };
      wake();
    };

    // ── Free: the stub leaves the pass ──
    // Its box on screen is the seat's, read once, here; its pose is the pose
    // it came free in, so the copy handed on takes over seamlessly.
    const free = () => {
      if (tearPhase === 'free') return;
      tearPhase = 'free';
      root.dataset.stub = 'free';
      setPhase('torn');
      clock = TEAR_FREE_MS;
      peekStart = -1;
      peel = 0;
      // Square where it lies (the tear's own spring has all but done it):
      // the stub's box is read off the pass as it is laid.
      paper = paperRest(paper.p);
      drawCarry();
      const m = turned(tearPose(TEAR_FREE_MS, canonFrame(), { smooth: false, hinge: PASS_HINGE }).m);
      const box = seat.getBoundingClientRect();
      const hx = L.seatW / 2;
      const hy = L.seatH / 2;
      const freeStub: FreeStub = {
        cx: box.left + m[0] * hx + m[2] * hy + m[4],
        cy: box.top + m[1] * hx + m[3] * hy + m[5],
        rotate: (Math.atan2(m[1], m[0]) * 180) / Math.PI,
        w: L.seatW,
        h: L.seatH,
      };
      // The copy that travels: the stub's own face (its print, its torn
      // edge), at the pass's size, the fibres out along the whole seam.
      const face = document.createElement('div');
      face.className = 'bp-hand';
      face.style.setProperty('--bp-w', `${L.w}px`);
      ['--bp-edge-stub', '--bp-fringe-stub', '--bp-to-scale'].forEach((name) => {
        const value = root.style.getPropertyValue(name);
        if (value) face.style.setProperty(name, value);
      });
      const copy = stub.cloneNode(true) as HTMLElement;
      copy.classList.add('bp-stub--hand');
      copy.style.removeProperty('--bp-torn');
      copy.querySelectorAll<HTMLElement>('.bp-fibre, .bp-strain').forEach((el) => el.removeAttribute('style'));
      copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      face.append(copy);
      // The pass: the main part keeps its torn edge whole; the seat is empty.
      put(main, '--bp-torn', `${L.seatH.toFixed(1)}px`);
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
      callbacks.current.onFree?.({ face, free: freeStub });
    };

    // ── The tear: the paper's own catches, the whole way ──
    const tear = () => {
      if (tearPhase !== 'whole' || !interactiveRef.current) return;
      if (passResponse('stub', 'click') !== 'tear') return;
      tearPhase = 'tearing';
      root.dataset.stub = 'tearing';
      peekStart = -1;
      // Torn where it lies: no slide on, squared up (the stub's rect is
      // read as it comes free, TEAR_FREE_MS on).
      endPress();
      squaring = true;
      wake();
      callbacks.current.onTear?.();
      if (reduced()) {
        // Values, not structure: the stub fades where it is.
        run(TEAR_MS, TEAR_REDUCED_MS, () => {
          tearPhase = 'free';
          root.dataset.stub = 'free';
          setPhase('torn');
          put(stubHalf, 'visibility', 'hidden');
          put(main, '--bp-torn', `${L.seatH.toFixed(1)}px`);
          callbacks.current.onFree?.({ face: null, free: null });
        });
        return;
      }
      // Whatever lift it had eases out into the tear's own hinge.
      run(TEAR_FREE_MS, Math.max(120, TEAR_FREE_MS - clock), free);
    };

    // ── The hand: the stub is a button; the main part only points to it ──
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      hovered = passResponse('stub', 'hover', tearPhase !== 'whole') === 'lift';
      wake();
    };
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      hovered = false;
      pressed = false;
      wake();
    };
    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      pressed = passResponse('stub', 'press', tearPhase !== 'whole') === 'lift';
      wake();
    };
    const onUp = () => {
      pressed = false;
      wake();
    };
    const onFocus = () => {
      focused = tearButton.matches(':focus-visible');
      wake();
    };
    const onBlur = () => {
      focused = false;
      wake();
    };
    const onClick = () => {
      if (swallowClick) return;
      tear();
    };
    const onMainClick = (event: MouseEvent) => {
      if (tearButton.contains(event.target as Node)) return;
      if (swallowClick) return;
      if (!interactiveRef.current || reduced()) return;
      if (passResponse('main', 'click', tearPhase !== 'whole') !== 'peek') return;
      peekStart = performance.now();
      wake();
    };
    const noDrag = (event: Event) => event.preventDefault();

    // ── Carried: a press anywhere on the pass (the stub too) ──
    const canCarry = () => interactiveRef.current && tearPhase === 'whole';
    function endPress() {
      if (!press) return;
      press = null;
      window.removeEventListener('pointermove', onPressMove);
      window.removeEventListener('pointerup', onPressUp);
      window.removeEventListener('pointercancel', onPressUp);
      if (held) {
        held = false;
        delete root!.dataset.held;
      }
      wake();
    }
    const onPressDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || !canCarry() || press) return;
      window.clearTimeout(swallowTimer);
      swallowClick = false;
      // A slide still going stops in the hand.
      paper = { ...paper, drift: { x: 0, y: 0 } };
      readHome();
      // The pass's centre within what moves, read while it lies square.
      if (!centreIn || !paperTransform(paper, grab)) {
        if (!paperTransform(paper, grab)) {
          const r = root.getBoundingClientRect();
          const c = carried().getBoundingClientRect();
          centreIn = { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top };
        }
      }
      press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        from: { ...paper.p },
        drag: false,
        samples: [[event.timeStamp, event.clientX, event.clientY]],
      };
      window.addEventListener('pointermove', onPressMove);
      window.addEventListener('pointerup', onPressUp);
      window.addEventListener('pointercancel', onPressUp);
    };
    function onPressMove(event: PointerEvent) {
      if (!press || event.pointerId !== press.id) return;
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      if (!press.drag) {
        if (!isDrag(dx, dy) || !canCarry()) return;
        press.drag = true;
        held = true;
        root!.dataset.held = '';
        // Taken up: the stub's own lift lets go (it is the pass that moves).
        pressed = false;
        press.from = { ...paper.p };
        // Held where it was taken (a pass still swinging from the last hold
        // keeps that point: a new one would shift it under the hand).
        const swinging = Math.abs(paper.sway) > 0.3 || Math.abs(paper.leanX) > 0.3 || Math.abs(paper.leanY) > 0.3;
        if (centreIn && !swinging) {
          const at = { x: home!.left + drawn.x + centreIn.x, y: home!.top + drawn.y + centreIn.y };
          const half = Math.max(1, root!.offsetWidth / 2);
          grab = { x: press.x - at.x, y: press.y - at.y };
          lever = { x: -grab.x / half, y: -grab.y / half };
        }
      }
      event.preventDefault();
      const all = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      (all.length ? all : [event]).forEach((e) => press!.samples.push([e.timeStamp, e.clientX, e.clientY]));
      while (press.samples.length > 16) press.samples.shift();
      // The hand's place, softly held back at the screen's edges.
      const b = bounds();
      paper = { ...paper, target: { x: rubber(press.from.x + dx, b.lo.x, b.hi.x), y: rubber(press.from.y + dy, b.lo.y, b.hi.y) } };
      wake();
    }
    function onPressUp(event: PointerEvent) {
      if (!press || event.pointerId !== press.id) return;
      if (press.drag) {
        // The click this press ends is not one (the stub is not torn).
        swallowClick = true;
        window.clearTimeout(swallowTimer);
        swallowTimer = window.setTimeout(() => {
          swallowClick = false;
        }, 400);
        paper = { ...paper, drift: reduced() ? { x: 0, y: 0 } : releaseVelocity(press.samples) };
      }
      endPress();
    }
    // The arrow keys move it while the stub has the focus.
    const onKey = (event: KeyboardEvent) => {
      if (!canCarry() || event.altKey || event.metaKey || event.ctrlKey) return;
      const step = event.shiftKey ? PASS_DRAG.nudgeFar : PASS_DRAG.nudge;
      const by = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[event.key];
      if (!by) return;
      event.preventDefault();
      readHome();
      paper = { ...paper, drift: { x: 0, y: 0 }, target: clampOffset({ x: paper.target.x + by[0], y: paper.target.y + by[1] }, home!, vw(), vh()) };
      wake();
    };
    // A new screen size: the pass is kept whole on it.
    const onResize = () => {
      centreIn = null;
      if (paper.target.x === 0 && paper.target.y === 0 && drawn.x === 0 && drawn.y === 0) return;
      readHome();
      paper = { ...paper, target: clampOffset(paper.target, home!, vw(), vh()) };
      wake();
    };

    tearButton.addEventListener('pointerenter', onEnter);
    tearButton.addEventListener('pointerleave', onLeave);
    tearButton.addEventListener('pointerdown', onDown);
    tearButton.addEventListener('pointerup', onUp);
    tearButton.addEventListener('pointercancel', onUp);
    tearButton.addEventListener('focus', onFocus);
    tearButton.addEventListener('blur', onBlur);
    tearButton.addEventListener('click', onClick);
    root.addEventListener('click', onMainClick);
    root.addEventListener('dragstart', noDrag);
    body.addEventListener('pointerdown', onPressDown);
    tearButton.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize, { passive: true });

    api.current = {
      tear,
      torn: () => tearPhase !== 'whole',
    };

    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    resize?.observe(root);
    window.addEventListener('resize', measure, { passive: true });
    measure();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      resize?.disconnect();
      window.removeEventListener('resize', measure);
      tearButton.removeEventListener('pointerenter', onEnter);
      tearButton.removeEventListener('pointerleave', onLeave);
      tearButton.removeEventListener('pointerdown', onDown);
      tearButton.removeEventListener('pointerup', onUp);
      tearButton.removeEventListener('pointercancel', onUp);
      tearButton.removeEventListener('focus', onFocus);
      tearButton.removeEventListener('blur', onBlur);
      tearButton.removeEventListener('click', onClick);
      root.removeEventListener('click', onMainClick);
      root.removeEventListener('dragstart', noDrag);
      body.removeEventListener('pointerdown', onPressDown);
      tearButton.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPressMove);
      window.removeEventListener('pointerup', onPressUp);
      window.removeEventListener('pointercancel', onPressUp);
      window.clearTimeout(swallowTimer);
      written.forEach((props, element) => props.forEach((_value, property) => element.style.removeProperty(property)));
      written.clear();
    };
  }, []);

  const toScale = destinationScale(fields.to);
  const torn = phase === 'torn';
  const label = `Boarding pass: passenger ${fields.passenger.toLowerCase()}, from ${fields.from.toLowerCase()} to ${fields.to.toLowerCase()}, flight ${fields.flight}, seat ${fields.seat}. Its QR code opens ryanxugallery.com.`;

  return (
    <div
      ref={rootRef}
      className="bp"
      style={{ ['--bp-to-scale' as string]: String(toScale) }}
      data-stub={torn ? 'free' : undefined}
    >
      <span ref={liftRef} className="bp-lift" aria-hidden="true" />
      <div className="bp-body" role="group" aria-roledescription="boarding pass" aria-label={label}>
        <div className="bp-half bp-half--main" data-asm="paper">
          <span className="bp-shadow" aria-hidden="true" />
          <div ref={mainRef} className="bp-main">
            <i className="bp-fibre" aria-hidden="true" />
            <i className="bp-strain" aria-hidden="true" />
            <div className="bp-band" data-asm="band">
              <span className="bp-band__mark" aria-hidden="true">RX</span>
              <span className="bp-band__kind">Boarding pass</span>
              <span className="bp-band__flight">Flight {fields.flight}</span>
            </div>
            <div className="bp-route" data-asm="route">
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
                  <span data-pass-land="to">{fields.to}</span>
                  {fields.toCode && <span className="bp-code">{fields.toCode}</span>}
                </span>
              </span>
            </div>
            <div className="bp-grid" data-asm="grid">
              <span className="bp-field bp-field--stack bp-grid__wide">
                <span className="bp-label">Passenger</span>
                <span className="bp-value bp-value--passenger">
                  <span data-pass-land="you">{fields.passenger}</span>
                </span>
              </span>
              <span className="bp-field bp-field--stack">
                <span className="bp-label">Flight</span>
                <span className="bp-value">{fields.flight}</span>
              </span>
              <span className="bp-field bp-field--stack">
                <span className="bp-label">Date</span>
                <span className="bp-value">
                  <span data-pass-land="date">{fields.date}</span>
                </span>
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
            <span className="bp-qr" data-asm="qr">
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
        <div ref={seatRef} className="bp-seat" data-asm="stub">
          <div ref={stubHalfRef} className="bp-half bp-half--stub">
            <span className="bp-shadow" aria-hidden="true" />
            <span ref={stubLiftRef} className="bp-shadow bp-shadow--tear" aria-hidden="true" />
            <div ref={stubRef} className="bp-stub">
              <i className="bp-fibre" aria-hidden="true" />
              <i className="bp-strain" aria-hidden="true" />
              <div className="bp-band bp-band--stub">
                <span className="bp-band__kind">Boarding pass</span>
                <span className="bp-band__flight">{fields.flight}</span>
              </div>
              <div className="bp-stub__fields" data-asm="stubprint">
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
          </div>
          {/* The start button: the stub itself. PROPOSED label. */}
          <button
            ref={tearRef}
            type="button"
            className="bp-tear"
            aria-label="Tear the stub to begin"
            disabled={!interactive || torn}
            tabIndex={interactive && !torn ? 0 : -1}
          />
        </div>
      </div>
    </div>
  );
}
