import { useEffect, useRef, useState } from 'react';
import { T, useT } from '../../i18n/react';
import { DUR_MS, EASE, bezierFn } from '../../lib/motion';
import { STOCK_FALLBACK } from '../../lib/ticketStock';
import {
  TEAR_MS,
  TEAR_REDUCED_MS,
  TEAR_TENSION_MS,
  affineCss,
  mirrorAffine,
  msAtTip,
  tearPose,
  tornEdge,
} from '../../lib/ticketTear';

// ── /about's correspondence ticket ──
// The homepage ticket's anatomy, used once, as the page's contact: the face
// carries the address (mailto) and Instagram, the stub the archive's count,
// one perforation between them, punched through both halves, on the olive
// matte (STOCK_FALLBACK) in the shared bone ink.
//
// The visitor can take the stub. It is the archive's own tear
// (src/lib/ticketTear.ts), held the other way round: the left hand keeps the
// face, the right pulls the stub (`mirrorAffine`) — the paper takes the
// strain, the rip runs down the perforation catching on each bridge, the
// stub hinges about the rip's tip, its top-right corner dropping first,
// snaps free and is laid aside, up and to the right. Taking it copies the
// address, and what the stub covered is printed on the card beneath it:
// "Copied". The place it left puts a stub back.
//
// - A click, a tap, Enter or Space plays the score at its own pace, catches
//   and all.
// - A drag pulls it by hand (a mouse or a pen down or to the right; a finger
//   to the right, since down is the page's scroll): the hand IS the clock
//   through the strain and the rip (`msAtTip`, the smooth tip), as on the
//   homepage's pull to tear. Let go past most of the rip, or flick it, and
//   it tears on; let go early and the paper springs back.
// - The mailto link on the face is untouched: the tear is a second way in.
// - Reduced motion keeps the event and drops the travel (the score's own
//   reduced pose): the stub fades in place, the print is revealed.
//
// The pose is written straight onto the nodes, one writer, off one clock —
// never through React state — and cleared at rest, so the server render and
// the client agree. React state is only what the words say.
//
// 中 / EN: what the ticket prints is in both languages and CSS shows one
// (src/i18n/runtime.ts); what only a screen reader reads — the button's
// line, the live status — is in the reader's language (useT), the status
// kept as what happened, not as a sentence, so it is said in the language
// the page is in when it is read. The address and the handle are his, as
// they are.

// A press that travels less than this is a click.
const PULL_SLOP = 6;
// How long after a dragged release its click is still the end of that drag.
const DRAG_CLICK_WINDOW_MS = 800;
// The hand's travel for the whole rip, as on the homepage's pull to tear.
const PULL_SPAN_VH = 0.18;
const PULL_SPAN_MIN = 110;
const PULL_SPAN_MAX = 180;
// A finger pulls sideways, and on a phone the stub sits a thumb's width
// from the screen's edge: its rip runs over less.
const PULL_SPAN_TOUCH = 96;
// Released with the rip this far down, the tear completes; a flick does it
// once the rip is a quarter down.
const PULL_COMMIT_MS = msAtTip(0.89);
const PULL_FLICK_MIN_MS = msAtTip(0.25);
const PULL_FLICK_SPEED = 0.8;
const PULL_FLICK_WINDOW_MS = 90;
// Let go early: back to its seat on the house's arrive curve.
const SPRING_BACK_MS = 350;
// A stub put back re-seats on the house's re-seat.
const RESEAT_MS = DUR_MS.settle;
// The score carries the torn half a share of `vw`: sized to the stub, not the
// window, so it is laid aside about half its width.
const ASIDE_SCALE = 5;
// This ticket's own torn edge, the same every time.
const EDGE_SEED = 7;
// While the rip runs, nothing of the stub may swing across the seam into the
// face: the band left of the seat is cut away, above and below it nothing.
const SEAM_CLIP =
  'polygon(-100vw -100vh, calc(100% + 100vw) -100vh, calc(100% + 100vw) calc(100% + 100vh), -100vw calc(100% + 100vh), -100vw 100%, 0% 100%, 0% 0%, -100vw 0%)';
const arrive = bezierFn(EASE.arrive);

type Copy = 'copied' | 'manual';

interface Props {
  email: string;
  instagram: string;
  chapters: number;
  frames: number;
}

/** A diagonal arrow, drawn (Space Grotesk has none). */
function ArrowOut() {
  return (
    <svg className="about-arrow-out" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
      <path d="M2 8L8 2M3.2 2H8v4.8" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="square" />
    </svg>
  );
}

export default function ContactTicket({ email, instagram, chapters, frames }: Props) {
  const [phase, setPhase] = useState<'whole' | 'torn'>('whole');
  const [copy, setCopy] = useState<Copy>('copied');
  // What the live region says: nothing, or what taking the stub did.
  const [status, setStatus] = useState<Copy | null>(null);
  const t = useT();

  const rootRef = useRef<HTMLDivElement>(null);
  const faceHalfRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLSpanElement>(null);
  const slotRef = useRef<HTMLButtonElement>(null);
  const seatRef = useRef<HTMLSpanElement>(null);
  const stubHalfRef = useRef<HTMLSpanElement>(null);
  const stubRef = useRef<HTMLSpanElement>(null);
  const liftRef = useRef<HTMLSpanElement>(null);

  const at = email.indexOf('@');
  const handle = '@' + (instagram.replace(/\/+$/, '').split('/').pop() || 'instagram');

  useEffect(() => {
    const root = rootRef.current;
    const faceHalf = faceHalfRef.current;
    const face = faceRef.current;
    const slot = slotRef.current;
    const seat = seatRef.current;
    const stubHalf = stubHalfRef.current;
    const stub = stubRef.current;
    const lift = liftRef.current;
    if (!root || !faceHalf || !face || !slot || !seat || !stubHalf || !stub || !lift) return;
    const fibres = [face, stub].map((half) => half.querySelector<HTMLElement>(':scope > .about-ticket__fibre'));
    const strains = [face, stub].map((half) => half.querySelector<HTMLElement>(':scope > .about-ticket__strain'));
    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    let box = { w: 164, h: 150 };
    let edgeFor = '';
    // Where the score is (ms at rate 1), and whether the tip follows the hand
    // (no catches: a pull, a spring back, a re-seat) or the paper.
    let clock = 0;
    let smooth = false;
    let whole = true;
    let play: { from: number; to: number; start: number; dur: number; ease?: (x: number) => number; done?: () => void } | null = null;
    let raf = 0;
    let press: {
      id: number;
      x: number;
      y: number;
      touch: boolean;
      dragging: boolean;
      strained: boolean;
      span: number;
      samples: Array<[number, number]>;
    } | null = null;
    let dragEndedAt = -Infinity;
    let disposed = false;

    // ── The one writer ──
    const written = new Map<HTMLElement, Map<string, string>>();
    const put = (element: HTMLElement | null, property: string, value: string | null) => {
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
    const clear = () => {
      written.forEach((props, element) => props.forEach((_value, property) => element.style.removeProperty(property)));
      written.clear();
    };
    const draw = () => {
      if (clock <= 0) {
        clear();
        return;
      }
      const reduced = reduceQuery.matches;
      const pose = tearPose(clock, { w: box.w, h: box.h, vw: box.w * ASIDE_SCALE }, { smooth, reduced });
      const moving = clock < TEAR_MS;
      // The stub: the face's pose, turned round.
      put(stubHalf, 'transform', reduced ? null : affineCss(mirrorAffine(pose.m, box.w)));
      put(stubHalf, 'opacity', pose.op >= 1 ? null : pose.op.toFixed(3));
      put(stubHalf, 'will-change', moving ? 'transform, opacity' : null);
      // Off the card: its shadow deepens and drops as it lifts.
      put(lift, 'opacity', pose.lift > 0 ? (0.75 * Math.min(1, pose.lift)).toFixed(3) : null);
      put(lift, 'transform', pose.lift > 0 ? `translateY(${(2 + 7 * pose.lift).toFixed(2)}px)` : null);
      // Below the tip the stub is still joined: nothing of it crosses the seam.
      put(seat, 'clip-path', pose.seam ? SEAM_CLIP : null);
      // The torn edge runs down the seam with the tip, on both halves, and the
      // fibres with it; the strain holds on the seam below the tip.
      const torn = pose.tip > 0 ? `${(pose.tip * box.h).toFixed(1)}px` : null;
      put(face, '--ticket-torn', torn);
      put(stub, '--ticket-torn', torn);
      fibres.forEach((fibre) => {
        put(fibre, 'clip-path', pose.tip > 0 ? `inset(0 0 ${((1 - pose.tip) * 100).toFixed(2)}% 0)` : null);
        put(fibre, 'opacity', pose.tip > 0 ? '1' : null);
      });
      strains.forEach((strain, index) => {
        const amount = pose.strain * (index === 0 ? 0.9 : 1);
        put(strain, 'clip-path', amount > 0 ? `inset(${(pose.tip * 100).toFixed(2)}% 0 0 0)` : null);
        put(strain, 'opacity', amount > 0 ? amount.toFixed(3) : null);
      });
      // The left hand: the face gives a hair about its grip (its left-middle)
      // while the paper holds, and recoils when the load goes. The score's
      // stub give, turned round. It never dims: it is still the contact.
      const gives = !reduced && (pose.stubDeg !== 0 || pose.stubY !== 0);
      put(faceHalf, 'transform', gives ? `translateY(${pose.stubY.toFixed(2)}px) rotate(${(-pose.stubDeg).toFixed(3)}deg)` : null);
    };

    // ── Layout: read once per resize, never per frame ──
    const measure = () => {
      box = { w: stubHalf.offsetWidth || box.w, h: stubHalf.offsetHeight || box.h };
      const key = `${Math.round(box.h)}`;
      if (key !== edgeFor) {
        edgeFor = key;
        const edge = tornEdge(box.h, EDGE_SEED);
        root.style.setProperty('--ticket-edge-face', edge.faceCut);
        root.style.setProperty('--ticket-edge-stub', edge.stubCut);
        root.style.setProperty('--ticket-fringe-face', edge.faceFringe);
        root.style.setProperty('--ticket-fringe-stub', edge.stubFringe);
      }
      draw();
    };

    // ── The clock ──
    const tick = (now: number) => {
      raf = 0;
      const current = play;
      if (!current || disposed) return;
      if (current.start < 0) current.start = now;
      const k = current.dur > 0 ? Math.min(1, (now - current.start) / current.dur) : 1;
      clock = current.from + (current.to - current.from) * (current.ease ? current.ease(k) : k);
      draw();
      if (k >= 1) {
        play = null;
        root.removeAttribute('data-moving');
        current.done?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const run = (to: number, dur: number, ease?: (x: number) => number, done?: () => void) => {
      play = { from: clock, to, start: -1, dur: Math.max(0, dur), ease, done };
      root.setAttribute('data-moving', '');
      if (!raf) raf = requestAnimationFrame(tick);
    };

    // ── The address ──
    // Started inside the gesture (the clipboard needs one); the print under
    // the stub says what happened. If the clipboard is shut, the address on
    // the face is selected, ready to copy.
    const copyAddress = async (): Promise<Copy> => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(email);
          return 'copied';
        }
      } catch {
        // Denied or unavailable: the older way, then a selection.
      }
      try {
        const area = document.createElement('textarea');
        area.value = email;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        slot.focus({ preventScroll: true });
        if (ok) return 'copied';
      } catch {
        // Fall through to the selection.
      }
      const address = addressRef.current;
      const selection = window.getSelection();
      if (address && selection) selection.selectAllChildren(address);
      return 'manual';
    };

    const tearOff = (byHand: boolean) => {
      if (!whole) return;
      whole = false;
      setPhase('torn');
      setStatus(null);
      const copying = copyAddress();
      // A click plays the paper's own catches; a hand's tear carries on as
      // smoothly as the hand pulled it.
      smooth = byHand;
      const reduced = reduceQuery.matches;
      const remaining = TEAR_MS - clock;
      run(TEAR_MS, reduced ? (remaining * TEAR_REDUCED_MS) / TEAR_MS : remaining);
      copying.then((result) => {
        if (disposed) return;
        setCopy(result);
        setStatus(result);
      });
    };

    const putBack = () => {
      if (whole) return;
      whole = true;
      setPhase('whole');
      setStatus(null);
      smooth = true;
      if (reduceQuery.matches) run(0, TEAR_REDUCED_MS);
      else run(0, RESEAT_MS, arrive);
    };

    // ── The hand ──
    const preventSelection = (event: Event) => event.preventDefault();
    const letGo = (id: number) => {
      root.removeAttribute('data-held');
      document.removeEventListener('selectstart', preventSelection, true);
      try {
        if (slot.hasPointerCapture(id)) slot.releasePointerCapture(id);
      } catch {
        // Already released.
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!whole || play || press) return;
      if (event.button !== 0 || !event.isPrimary) return;
      press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        touch: event.pointerType === 'touch',
        dragging: false,
        strained: false,
        span: event.pointerType === 'touch'
          ? PULL_SPAN_TOUCH
          : Math.max(PULL_SPAN_MIN, Math.min(PULL_SPAN_MAX, window.innerHeight * PULL_SPAN_VH)),
        samples: [[event.timeStamp, 0]],
      };
      try {
        slot.setPointerCapture(event.pointerId);
      } catch {
        // Capture only keeps the moves coming once the hand leaves the stub.
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      const current = press;
      if (!current || event.pointerId !== current.id) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.dragging) {
        // Under reduced motion there is no pull: the press stays a click.
        if (reduceQuery.matches || Math.hypot(dx, dy) < PULL_SLOP) return;
        // A finger going up or down is the page's scroll, not a pull.
        if (current.touch && Math.abs(dy) > Math.abs(dx)) {
          press = null;
          letGo(current.id);
          return;
        }
        current.dragging = true;
        root.setAttribute('data-held', '');
        document.addEventListener('selectstart', preventSelection, true);
      }
      // Pulled, never pushed: down or away from the face for a mouse or a
      // pen, away from the face for a finger.
      const travel = Math.max(0, current.touch ? dx : Math.max(dx, dy));
      current.samples.push([event.timeStamp, travel]);
      while (current.samples.length > 2 && event.timeStamp - current.samples[0][0] > PULL_FLICK_WINDOW_MS) current.samples.shift();
      // The first PULL_SLOP of the hand takes the strain; from there the
      // rip's tip is the hand's share of the span, one to one.
      if (travel >= PULL_SLOP) current.strained = true;
      smooth = true;
      clock = current.strained ? msAtTip(travel / current.span) : (TEAR_TENSION_MS * travel) / PULL_SLOP;
      draw();
    };
    const onPointerEnd = (event: PointerEvent) => {
      const current = press;
      if (!current || event.pointerId !== current.id) return;
      press = null;
      letGo(current.id);
      if (!current.dragging) return;
      dragEndedAt = performance.now();
      const cancelled = event.type !== 'pointerup';
      let speed = 0;
      if (!cancelled && current.samples.length > 1) {
        const [t0, v0] = current.samples[0];
        const [t1, v1] = current.samples[current.samples.length - 1];
        if (t1 > t0) speed = (v1 - v0) / (t1 - t0);
      }
      if (!cancelled && (clock >= PULL_COMMIT_MS || (clock >= PULL_FLICK_MIN_MS && speed >= PULL_FLICK_SPEED))) {
        tearOff(true);
        return;
      }
      smooth = true;
      if (clock > 0) run(0, SPRING_BACK_MS, arrive);
    };
    const onClick = (event: MouseEvent) => {
      // The click that ends a drag is not a request.
      if (performance.now() - dragEndedAt < DRAG_CLICK_WINDOW_MS) {
        event.preventDefault();
        return;
      }
      if (play || press) return;
      if (whole) tearOff(false);
      else putBack();
    };
    const noDrag = (event: Event) => event.preventDefault();

    slot.addEventListener('pointerdown', onPointerDown);
    slot.addEventListener('pointermove', onPointerMove);
    slot.addEventListener('pointerup', onPointerEnd);
    slot.addEventListener('pointercancel', onPointerEnd);
    slot.addEventListener('lostpointercapture', onPointerEnd);
    slot.addEventListener('click', onClick);
    slot.addEventListener('dragstart', noDrag);
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    resize?.observe(root);
    measure();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      resize?.disconnect();
      document.removeEventListener('selectstart', preventSelection, true);
      slot.removeEventListener('pointerdown', onPointerDown);
      slot.removeEventListener('pointermove', onPointerMove);
      slot.removeEventListener('pointerup', onPointerEnd);
      slot.removeEventListener('pointercancel', onPointerEnd);
      slot.removeEventListener('lostpointercapture', onPointerEnd);
      slot.removeEventListener('click', onClick);
      slot.removeEventListener('dragstart', noDrag);
      clear();
    };
  }, [email]);

  const torn = phase === 'torn';
  const manual = copy === 'manual';

  return (
    <div className="about-contact" data-about-reveal="ticket">
      <div
        ref={rootRef}
        className="about-ticket"
        data-phase={phase}
        style={{ ['--stub-paper' as string]: STOCK_FALLBACK }}
      >
        <div ref={faceHalfRef} className="about-ticket__half about-ticket__half--face">
          <span className="about-ticket__shadow" aria-hidden="true" />
          <div ref={faceRef} className="about-ticket__face">
            <i className="about-ticket__fibre" aria-hidden="true" />
            <i className="about-ticket__strain" aria-hidden="true" />
            <span className="about-ticket__label">
              <T k="contact.email.label" />
            </span>
            <span className="about-ticket__write">
              <a className="about-ticket__mail" href={`mailto:${email}`} aria-label={t('contact.email.aria', { email })}>
                <span ref={addressRef}>
                  {at > 0 ? (
                    <>
                      {email.slice(0, at)}
                      <wbr />
                      {email.slice(at)}
                    </>
                  ) : (
                    email
                  )}
                </span>{' '}
                <ArrowOut />
              </a>
            </span>
            <span className="about-ticket__rule" aria-hidden="true" />
            <span className="about-ticket__line">
              <span className="about-ticket__label">
                <T k="contact.instagram.label" />
              </span>
              <a className="about-ticket__ig" href={instagram} target="_blank" rel="noopener noreferrer">
                {handle} <ArrowOut />
              </a>
            </span>
          </div>
        </div>

        {/* The stub's place is the button: it takes the stub while the stub
            is there, and puts one back once it has gone. */}
        <button ref={slotRef} type="button" className="about-ticket__slot">
          {/* Printed on the card under the stub, revealed as it leaves. What
              the print and the stub say is said once, for a screen reader,
              by the line at the end of the button. */}
          <span className="about-ticket__under" aria-hidden="true">
            <span className="about-ticket__word">
              <T k={manual ? 'contact.under.selected' : 'contact.under.copied'} />
            </span>
            <span className="about-ticket__small">
              <T k={manual ? 'contact.under.selectedSmall' : 'contact.under.copiedSmall'} />
            </span>
            <span className="about-ticket__stub-rule" />
            <span className="about-ticket__small about-ticket__again">
              <T k="contact.under.again" />
            </span>
          </span>
          <span ref={seatRef} className="about-ticket__seat">
            <span ref={stubHalfRef} className="about-ticket__half about-ticket__half--stub" aria-hidden="true">
              <span className="about-ticket__shadow" aria-hidden="true" />
              <span ref={liftRef} className="about-ticket__lift" aria-hidden="true" />
              <span ref={stubRef} className="about-ticket__stub">
                <i className="about-ticket__fibre" aria-hidden="true" />
                <i className="about-ticket__strain" aria-hidden="true" />
                <span className="about-ticket__no">{String(chapters).padStart(2, '0')}</span>
                <span className="about-ticket__small">
                  <T k="contact.stub.chapters" />
                </span>
                <span className="about-ticket__stub-rule" />
                <span className="about-ticket__rows">
                  <span className="about-ticket__row">
                    <span>
                      <T k="contact.stub.frames" />
                    </span>
                    <span>{frames}</span>
                  </span>
                  <span className="about-ticket__row">
                    <span>
                      <T k="contact.stub.since" />
                    </span>
                    <span>2023</span>
                  </span>
                  <span className="about-ticket__row">
                    <span>
                      <T k="contact.stub.base" />
                    </span>
                    <span>
                      <T k="contact.stub.baseValue" />
                    </span>
                  </span>
                </span>
              </span>
            </span>
          </span>
          <span className="sr-only">
            {!torn
              ? t('contact.sr.stub', { chapters, frames })
              : manual
                ? t('contact.sr.selected')
                : t('contact.sr.copied')}
          </span>
        </button>
      </div>
      <p className="about-ticket-hint" aria-hidden="true">
        <T k="contact.hint" />
      </p>
      <span className="sr-only" role="status">
        {status === 'copied'
          ? t('contact.status.copied', { email })
          : status === 'manual'
            ? t('contact.status.manual', { email })
            : ''}
      </span>
    </div>
  );
}
