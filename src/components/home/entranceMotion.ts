// ── The entrance's two moves that run outside React ──
// (src/lib/boardingPass.ts has the schedules, the arc and the rules; this
// file only plays them.)
//
// 1. The assembly: at the end of the cover's reveal the boarding pass forms
//    beside the words — its paper and its stub laid down (wiped on, never
//    faded), its print part by part — and three facts fly out of the words
//    onto it (the first place → TO, "you" → PASSENGER, the archive's years →
//    DATE), each word lifting off its sentence as its copy flies. One read
//    of every box before anything moves (the pass is laid out, only hidden),
//    then WAAPI on the compositor.
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
import { EXPLORER_EVENT, PHONE_CARD, type ExplorerDetail } from '../../lib/explorer';
import { shownMatch } from '../../i18n/lang';

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
  // The paper and the stub are laid down, never faded up: an opaque wipe
  // from their left edge to their right (their shadows inside the clip's
  // margin), the paper rising its last 20 px as it goes. Faded in, the white
  // slab flashed onto the olive in 62 ms (review of 2026-09-29).
  const WIPE = 60;
  const wipe = (from: string) => [
    { offset: 0, clipPath: `inset(-${WIPE}px 100% -${WIPE}px 0px)`, transform: from },
    { offset: 1, clipPath: `inset(-${WIPE}px -${WIPE}px -${WIPE}px -${WIPE}px)`, transform: 'none' },
  ];
  const keyframes: Record<string, Keyframe[]> = {
    paper: wipe(`translate3d(0, ${A.paper.rise}px, 0) scale(0.985)`),
    stub: wipe(`translate3d(${A.stub.slide}px, 0, 0)`),
    print: [
      { opacity: 0, transform: `translate3d(0, ${A.print.rise}px, 0)` },
      { opacity: 1, transform: 'none' },
    ],
    hint: [{ opacity: 0 }, { opacity: 1 }],
  };

  // The flights: every box read once, before anything moves.
  const flights = (['to', 'you', 'date'] as const)
    .map((word) => {
      // The cover is printed in both languages (src/i18n): the shown copy.
      const src = shownMatch(text, `[data-pass-from="${word}"]`);
      const dst = shownMatch(stage, `[data-pass-land="${word}"]`);
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
    if (item.part === 'flight-to' || item.part === 'flight-you' || item.part === 'flight-date') {
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
      // TO sits at the height of its sentence, so straight it printed over
      // the rest of the sentence and then over FROM, HERE and the arrow
      // (review of 2026-09-29): it dips under its line while it clears the
      // sentence, and bows up over the pass's band while it crosses FROM
      // (one S, `bow` px each way, level between the two). DATE leaves the
      // years over the headline: it goes along first, clear of the large
      // lines, and only then down the open side of the screen.
      const bow = flight.word === 'to' ? A.flights.bow : 0;
      const along = flight.word === 'date' ? 0.3 : 0;
      const frames: Keyframe[] = [];
      for (let i = 0; i <= 24; i += 1) {
        const u = i / 24;
        const ex = enter(u);
        const ey = along > 0 ? enter(Math.max(0, (u - along) / (1 - along))) : enter(Math.min(1, u / 0.8));
        const lift = -bow * Math.sin(2 * Math.PI * ex);
        frames.push({
          offset: u,
          transform: `translate3d(${(dx * (1 - ex)).toFixed(2)}px, ${(dy * (1 - ey) - lift).toFixed(2)}px, 0) scale(${(k + (1 - k) * ex).toFixed(4)})`,
        });
      }
      const flightTiming: KeyframeAnimationOptions = { duration: item.ms, delay: item.at, easing: 'linear', fill: 'both' };
      animations.push(wrap.animate(frames, flightTiming));
      // The copy is there only from its lift, and the word lifts off its
      // sentence with it in that frame (never printed twice, one a hair off
      // the other: review of 2026-09-29); the word comes back into its
      // sentence once the copy has landed.
      wrap.style.visibility = 'hidden';
      animations.push(
        wrap.animate([{ visibility: 'visible' }, { visibility: 'visible' }], { duration: item.ms, delay: item.at, fill: 'forwards' }),
        src.animate([{ visibility: 'hidden' }, { visibility: 'hidden' }], { duration: item.ms, delay: item.at, fill: 'none' }),
        src.animate([{ opacity: 0 }, { opacity: 1 }], { duration: A.wordBackMs, delay: item.at + item.ms, easing: ENTER_CSS, fill: 'none' }),
      );
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
  layer.style.setProperty('--stub-paper', stock);
  const stub = document.createElement('div');
  stub.className = 'bp-courier__stub';
  stub.style.width = `${free.w}px`;
  stub.style.height = `${free.h}px`;
  const shadow = document.createElement('span');
  shadow.className = 'bp-courier__shadow';
  // Stop 01's card: a plain card of its stock until the cover stub is on the
  // page, then a print of that stub itself (its sign, its rows, its
  // perforation), so the stub that lands IS the one that shows — nothing
  // blank, nothing that pops in after. Its box is the cover stub's own
  // measure (PHONE_CARD.stub wide, the target's height at that width),
  // scaled onto the courier's frame: derived from the contract's rect,
  // never read off the page.
  let card: HTMLElement = document.createElement('div');
  card.className = 'bp-courier__card';
  card.style.background = stock;
  let signed = false;
  const sign = () => {
    if (signed) return;
    const real = document.querySelector<HTMLElement>('.archive-plate[data-stub-awaited] .archive-ticket-stub');
    if (!real) return;
    const copy = real.cloneNode(true) as HTMLElement;
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    copy.querySelectorAll('button, a, [tabindex]').forEach((el) => el.setAttribute('tabindex', '-1'));
    copy.classList.add('bp-courier__card', 'bp-courier__card--signed');
    copy.style.cssText = '';
    card.replaceWith(copy);
    card = copy;
    signed = true;
    cardKey = '';
  };
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
      if (!signed && pose.card > 0) sign();
      const size = courierCard(box, state.target);
      // The signed card is laid out at the cover stub's own width and
      // scaled onto the courier's frame; the plain one is simply its size.
      const natural = signed ? { w: PHONE_CARD.stub, h: (state.target.h * PHONE_CARD.stub) / Math.max(1, state.target.w) } : size;
      const k = size.w / Math.max(1, natural.w);
      const key = `${size.w.toFixed(1)}x${size.h.toFixed(1)}:${signed ? 's' : 'p'}`;
      if (key !== cardKey) {
        cardKey = key;
        card.style.position = 'absolute';
        card.style.margin = '0';
        card.style.width = `${natural.w}px`;
        card.style.height = `${natural.h}px`;
        card.style.left = `${((free.w - size.w) / 2).toFixed(2)}px`;
        card.style.top = `${((free.h - size.h) / 2).toFixed(2)}px`;
        card.style.transformOrigin = '0 0';
        card.style.transform = signed ? `scale(${k.toFixed(5)})` : '';
      }
      const dy = unfoldInset(size.h, free.h, pose.unfold) / k;
      const dx = unfoldInset(size.w, free.w, pose.unfold) / k;
      card.style.clipPath = `inset(${dy.toFixed(2)}px ${dx.toFixed(2)}px)`;
      card.style.opacity = pose.card.toFixed(3);
      card.style.setProperty('--courier-sign', pose.sign.toFixed(3));
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
  return !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5 && Math.abs(a.rotate - b.rotate) < 0.05
    && Math.abs((a.landsAt ?? -1) - (b.landsAt ?? -1)) < 1;
}
