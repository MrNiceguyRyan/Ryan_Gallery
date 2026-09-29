// ── The entrance's two moves that run outside React ──
// (src/lib/boardingPass.ts has the schedules, the arc and the rules; this
// file only plays them.)
//
// 1. The assembly: at the end of the cover's reveal the boarding pass forms
//    beside the words — its paper, its stub, its print part by part — and
//    two words fly out of the last sentence onto it (the first place → TO,
//    "you" → PASSENGER). One read of every box before anything moves (the
//    pass is laid out, only hidden), then WAAPI on the compositor.
// 2. The courier: the torn stub, kept by the reader in a fixed layer of its
//    own on <body> — it outlives the entrance, which leaves the page once
//    the explorer has it — carried, flown on its arc to the rect the explorer
//    names for stop 01's cover stub, landed, and handed over
//    (STUB_LANDED_EVENT). Its geometry is the contract's rect, derived by
//    the explorer; nothing here reads a rect per frame.

import {
  ENTER_EASE,
  ENTRY_LANDED_EVENT,
  COVER_STUB_TARGET,
  PASS_ASSEMBLY,
  STUB_LANDED_EVENT,
  assemblyMs,
  assemblySchedule,
  courierCard,
  courierPose,
  courierStart,
  courierStep,
  cubicEase,
  unfoldInset,
  validStubRect,
  type CourierState,
  type FreeStub,
  type StubRect,
} from '../../lib/boardingPass';
import { EXPLORER_EVENT, type ExplorerDetail } from '../../lib/explorer';

const ENTER_CSS = `cubic-bezier(${ENTER_EASE.join(', ')})`;
const enter = cubicEase(ENTER_EASE);

// ── 1. The assembly ────────────────────────────────────────────────────
type Twin = { wrap: HTMLElement; dst: HTMLElement };

/** Assemble the pass inside `stage` (the pass's column: the pass and its
 *  hint), taking the flying words from `text`. Returns a cancel. `done` runs
 *  once everything is in place (at once under reduced motion). */
export function assemblePass(stage: HTMLElement, text: HTMLElement, reduced: boolean, done: () => void): () => void {
  const animations: Animation[] = [];
  const twins: Twin[] = [];
  let finished = false;
  let timer = 0;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    twins.forEach(({ wrap, dst }) => {
      wrap.remove();
      dst.style.removeProperty('visibility');
    });
    stage.removeAttribute('data-assembling');
    done();
  };
  stage.setAttribute('data-assembling', '');
  if (reduced || typeof stage.animate !== 'function') {
    // Values, not structure: everything is simply there.
    finish();
    return () => {};
  }
  const parts = new Map<string, HTMLElement[]>();
  stage.querySelectorAll<HTMLElement>('[data-asm]').forEach((el) => {
    const key = el.dataset.asm!;
    parts.set(key, [...(parts.get(key) ?? []), el]);
  });
  const A = PASS_ASSEMBLY;
  // The paper is opaque early (a sheet laid down, never a grey veil fading
  // up over the olive) and settles for the rest of its time.
  const keyframes: Record<string, Keyframe[]> = {
    paper: [
      { offset: 0, opacity: 0, transform: `translate3d(0, ${A.paper.rise}px, 0) scale(0.985)` },
      { offset: 0.3, opacity: 1 },
      { offset: 1, opacity: 1, transform: 'none' },
    ],
    stub: [
      { offset: 0, opacity: 0, transform: `translate3d(${A.stub.slide}px, 0, 0)` },
      { offset: 0.3, opacity: 1 },
      { offset: 1, opacity: 1, transform: 'none' },
    ],
    print: [
      { opacity: 0, transform: `translate3d(0, ${A.print.rise}px, 0)` },
      { opacity: 1, transform: 'none' },
    ],
    hint: [{ opacity: 0 }, { opacity: 1 }],
  };

  // The flights: every box read once, before anything moves.
  const flights = (['to', 'you'] as const)
    .map((word) => {
      const src = text.querySelector<HTMLElement>(`[data-pass-from="${word}"]`);
      const dst = stage.querySelector<HTMLElement>(`[data-pass-land="${word}"]`);
      if (!src || !dst) return null;
      const a = src.getBoundingClientRect();
      const b = dst.getBoundingClientRect();
      if (!a.width || !b.width) return null;
      return { word, src, dst, a, b, sStyle: getComputedStyle(src), dStyle: getComputedStyle(dst) };
    })
    .filter(<T,>(x: T | null): x is T => x != null);

  let layer: HTMLElement | null = null;
  if (flights.length) {
    layer = document.createElement('div');
    layer.className = 'ec-fly-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
  }
  const face = (textContent: string, style: CSSStyleDeclaration, size: number) => {
    const el = document.createElement('span');
    el.className = 'ec-fly__face';
    el.textContent = textContent;
    el.style.fontFamily = style.fontFamily;
    el.style.fontWeight = style.fontWeight;
    el.style.fontSize = `${size}px`;
    el.style.letterSpacing = style.letterSpacing === 'normal' ? 'normal' : `${(parseFloat(style.letterSpacing) * size) / (parseFloat(style.fontSize) || size)}px`;
    el.style.textTransform = style.textTransform;
    el.style.color = style.color;
    el.style.fontVariationSettings = style.fontVariationSettings;
    el.style.fontFeatureSettings = style.fontFeatureSettings;
    return el;
  };

  const schedule = assemblySchedule();
  schedule.forEach((item) => {
    const timing = (ms: number, at: number): KeyframeAnimationOptions => ({ duration: ms, delay: at, easing: ENTER_CSS, fill: 'backwards' });
    if (item.part === 'flight-to' || item.part === 'flight-you') {
      const flight = flights.find((f) => `flight-${f.word}` === item.part);
      if (!flight || !layer) return;
      const { a, b, src, dst, sStyle, dStyle } = flight;
      // The twin sits on the field's own glyphs; it starts on the word in
      // the sentence (centre to centre, the sentence's size), and the two
      // faces cross on the way (the sentence's Fraunces → the field's type).
      const k = a.height / Math.max(1, b.height);
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      const wrap = document.createElement('div');
      wrap.className = 'ec-fly';
      wrap.style.left = `${b.left}px`;
      wrap.style.top = `${b.top}px`;
      wrap.style.width = `${b.width}px`;
      wrap.style.height = `${b.height}px`;
      const from = face(src.textContent ?? '', sStyle, (parseFloat(sStyle.fontSize) || 16) / k);
      const to = face(dst.textContent ?? '', dStyle, parseFloat(dStyle.fontSize) || 16);
      wrap.append(from, to);
      layer.append(wrap);
      // Each face placed once (one read each, before anything moves): the
      // field's face exactly on the field's glyphs (their inline boxes
      // match), the sentence's face centred on the same point, so the wrap's
      // scale about its middle takes it to the word in the sentence.
      const inkBox = (el: HTMLElement) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect();
      };
      const toBox = inkBox(to);
      to.style.transform = `translate3d(${(b.left - toBox.left).toFixed(2)}px, ${(b.top - toBox.top).toFixed(2)}px, 0)`;
      const fromBox = inkBox(from);
      from.style.transform = `translate3d(${(b.left + b.width / 2 - (fromBox.left + fromBox.width / 2)).toFixed(2)}px, ${(b.top + b.height / 2 - (fromBox.top + fromBox.height / 2)).toFixed(2)}px, 0)`;
      twins.push({ wrap, dst });
      dst.style.visibility = 'hidden';
      // The path: the slide on ENTER, the fall a little ahead of it (y done
      // by 80% of the way), so the word drops clear before it slides home.
      const frames: Keyframe[] = [];
      for (let i = 0; i <= 24; i += 1) {
        const u = i / 24;
        const ex = enter(u);
        const ey = enter(Math.min(1, u / 0.8));
        frames.push({
          offset: u,
          transform: `translate3d(${(dx * (1 - ex)).toFixed(2)}px, ${(dy * (1 - ey)).toFixed(2)}px, 0) scale(${(k + (1 - k) * ex).toFixed(4)})`,
        });
      }
      const flightTiming: KeyframeAnimationOptions = { duration: item.ms, delay: item.at, easing: 'linear', fill: 'both' };
      animations.push(wrap.animate(frames, flightTiming));
      animations.push(
        from.animate([{ offset: 0, opacity: 1 }, { offset: 0.34, opacity: 1 }, { offset: 0.58, opacity: 0 }, { offset: 1, opacity: 0 }], flightTiming),
        to.animate([{ offset: 0, opacity: 0 }, { offset: 0.34, opacity: 0 }, { offset: 0.58, opacity: 1 }, { offset: 1, opacity: 1 }], flightTiming),
      );
      // Landed: the field's own glyphs take over on the frame the twin goes.
      const landAt = item.at + item.ms;
      window.setTimeout(() => {
        if (finished) return;
        wrap.remove();
        dst.style.removeProperty('visibility');
      }, landAt);
      return;
    }
    const kind = item.part === 'paper' || item.part === 'stub' || item.part === 'hint' ? item.part : 'print';
    (parts.get(item.part) ?? []).forEach((el) => {
      animations.push(el.animate(keyframes[kind], timing(item.ms, item.at)));
    });
  });
  timer = window.setTimeout(() => {
    layer?.remove();
    finish();
  }, assemblyMs() + 30);
  return () => {
    animations.forEach((animation) => animation.cancel());
    layer?.remove();
    finish();
  };
}

// ── 2. The courier ─────────────────────────────────────────────────────
interface Courier {
  cancel: () => void;
}
let current: Courier | null = null;

function readTarget(): StubRect | null {
  const fn = (window as unknown as Record<string, unknown>)[COVER_STUB_TARGET];
  if (typeof fn !== 'function') return null;
  try {
    return validStubRect((fn as () => unknown)());
  } catch {
    return null;
  }
}
const hasTarget = () => typeof (window as unknown as Record<string, unknown>)[COVER_STUB_TARGET] === 'function';

function sayLanded(how: string) {
  window.dispatchEvent(new CustomEvent(STUB_LANDED_EVENT, { detail: { from: 'boarding-pass', how } }));
}

/**
 * Keep the torn stub with the reader and bring it to stop 01's cover.
 * `face` is a copy of the stub's face (null under reduced motion: nothing
 * travels, and the hand-off is said as soon as the camera is down), `stock`
 * stop 01's card.
 */
export function launchStubCourier({ face, free, stock }: { face: HTMLElement | null; free: FreeStub | null; stock: string }): Courier {
  current?.cancel();
  let disposed = false;
  let teardown = () => {};
  let onLanded = () => {};
  let letGo = () => {};
  // Stop 01, as the explorer names it once its entry is under way.
  let entryId: string | null = null;
  const listeners: Array<[string, EventListener]> = [];
  const listen = (type: string, fn: EventListener) => {
    window.addEventListener(type, fn);
    listeners.push([type, fn]);
  };
  const courier: Courier = { cancel: () => dispose() };
  function dispose() {
    if (disposed) return;
    disposed = true;
    teardown();
    listeners.forEach(([type, fn]) => window.removeEventListener(type, fn));
    document.removeEventListener('astro:before-swap', dispose);
    if (current === courier) current = null;
  }
  current = courier;
  document.addEventListener('astro:before-swap', dispose);
  listen(ENTRY_LANDED_EVENT, (event: Event) => {
    const id = (event as CustomEvent<{ id?: string }>).detail?.id;
    if (id && !entryId) entryId = id;
    onLanded();
  });
  listen(EXPLORER_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<ExplorerDetail>).detail;
    if (!detail) return;
    if (detail.phase === 'entering' && detail.current && !entryId) entryId = detail.current;
    // An explorer that names no target (its half of the hand-off not there)
    // is taken at its word that it has entered.
    if (detail.phase === 'explore' && !hasTarget()) onLanded();
    // The explorer has left stop 01 before the stub landed (another place,
    // the ticket let go, Back to the start): the stub is let go where it is
    // (boardingPass.ts, LET-GO) — never merged onto another place's cover.
    if (entryId && (detail.phase === 'globe' || (detail.phase === 'explore' && detail.current !== entryId))) letGo();
  });

  // Reduced motion (or no face): nothing travels. The hand-off is said once
  // the camera is down, so the cover's own stub shows.
  if (!face || !free) {
    const guard = window.setTimeout(() => onLanded(), 12000);
    teardown = () => window.clearTimeout(guard);
    onLanded = () => {
      if (disposed) return;
      sayLanded('still');
      dispose();
    };
    letGo = onLanded;
    if (window.__archiveExplorer?.phase === 'explore' && !hasTarget()) onLanded();
    return courier;
  }

  // The layer and the stub: the carried shadow, stop 01's card, the pass's
  // own face on top.
  const layer = document.createElement('div');
  layer.className = 'bp-courier';
  layer.setAttribute('aria-hidden', 'true');
  const stub = document.createElement('div');
  stub.className = 'bp-courier__stub';
  stub.style.width = `${free.w}px`;
  stub.style.height = `${free.h}px`;
  const shadow = document.createElement('span');
  shadow.className = 'bp-courier__shadow';
  const card = document.createElement('div');
  card.className = 'bp-courier__card';
  card.style.background = stock;
  const print = document.createElement('div');
  print.className = 'bp-courier__print';
  print.append(face);
  stub.append(shadow, card, print);
  layer.append(stub);
  document.body.append(layer);

  let state: CourierState = courierStart(performance.now());
  let raf = 0;
  let cardKey = '';
  const box = { w: free.w, h: free.h };
  teardown = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    layer.remove();
  };

  const draw = (now: number) => {
    const { pose, opacity } = courierPose(state, free, now);
    stub.style.transform = `translate3d(${(pose.cx - free.w / 2).toFixed(2)}px, ${(pose.cy - free.h / 2).toFixed(2)}px, 0) rotate(${pose.rotate.toFixed(3)}deg) scale(${pose.scale.toFixed(4)})`;
    stub.style.opacity = opacity >= 1 ? '' : opacity.toFixed(3);
    shadow.style.opacity = pose.shadow.toFixed(3);
    print.style.opacity = pose.print >= 1 ? '' : pose.print.toFixed(3);
    if (state.target) {
      const size = courierCard(box, state.target);
      const key = `${size.w.toFixed(1)}x${size.h.toFixed(1)}`;
      if (key !== cardKey) {
        cardKey = key;
        card.style.width = `${size.w}px`;
        card.style.height = `${size.h}px`;
        card.style.left = `${((free.w - size.w) / 2).toFixed(2)}px`;
        card.style.top = `${((free.h - size.h) / 2).toFixed(2)}px`;
      }
      const dy = unfoldInset(size.h, free.h, pose.unfold);
      const dx = unfoldInset(size.w, free.w, pose.unfold);
      card.style.clipPath = `inset(${dy.toFixed(2)}px ${dx.toFixed(2)}px)`;
      card.style.opacity = pose.card.toFixed(3);
    } else {
      card.style.opacity = '0';
    }
  };

  const apply = (effects: string[]) => {
    effects.forEach((effect) => {
      if (effect === 'say-landed') sayLanded(state.phase === 'fade' ? 'let-go' : 'flight');
      if (effect === 'remove') dispose();
    });
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed) return;
    // The explorer's word on where the stub will rest (derived there, from
    // the entry's final camera): read while it may still change.
    if (state.phase === 'carry' || state.phase === 'arc' || state.phase === 'hold') {
      const rect = readTarget();
      if (rect && !sameRect(rect, state.target)) state = courierStep(state, { type: 'target', now, rect }, free).state;
    }
    const drawn = courierPose(state, free, now);
    const step = courierStep(state, { type: 'tick', now, pose: drawn.pose }, free);
    state = step.state;
    draw(now);
    apply(step.effects);
    if (!disposed) raf = requestAnimationFrame(tick);
  };
  onLanded = () => {
    if (disposed) return;
    const step = courierStep(state, { type: 'entry-landed', now: performance.now() }, free);
    state = step.state;
    apply(step.effects);
  };
  letGo = () => {
    if (disposed) return;
    const now = performance.now();
    const step = courierStep(state, { type: 'let-go', now, pose: courierPose(state, free, now).pose }, free);
    state = step.state;
    draw(now);
    apply(step.effects);
  };
  if (window.__archiveExplorer?.phase === 'explore' && !hasTarget()) onLanded();
  draw(performance.now());
  raf = requestAnimationFrame(tick);
  return courier;
}

function sameRect(a: StubRect, b: StubRect | null) {
  return !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5 && Math.abs(a.rotate - b.rotate) < 0.05;
}
