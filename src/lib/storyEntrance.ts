// ── How a photograph arrives on the story's page ──
// Every inside frame used to arrive the same way, a diagonal develop from the
// top-left corner, and forty of them in a row read as one trick (the owner,
// 2026-09-27: 出现方式可以不局限于从左上角闪出). A story now has four
// photographic ways for a picture to come up, dealt by the plan so a feature
// has variety with a rhythm to it:
//   zoom    — the print settles onto the page: 1.06 → 1 as it fades up;
//   shutter — a focal-plane shutter fires over the frame: two dark curtains
//             of blades close over it, and open on the picture;
//   advance — the film advances: the frame is wound on a short way from its
//             own side and stops dead, as a frame lands in the gate;
//   develop — the old diagonal develop, now for a minority of frames and
//             swept from the side the frame is set on.
// The frame the reader opened the story from (frame 01, the plate's grow)
// and the end page's Plates keep their own arrivals and are not dealt one.
//
// `planEntrances` is pure (scripts/story-entrance.test.mjs pins it on the
// six stories). `playEntrance` runs one on the DOM with the Web Animations
// API: transform, opacity and a mask position only, nothing that lays out,
// and `fill: 'backwards'`, so once it has played no inline state is left
// behind — the frame is exactly what the server sent.

import { CSS_EASE, STAGGER } from './motion.ts';
import type { Slot, SlotKind } from './storyPlan.ts';

export type Entrance = 'zoom' | 'shutter' | 'advance' | 'develop';
/** The side a frame advances or develops from ('top' only develops). */
export type EntranceFrom = 'left' | 'right' | 'top';

export interface SlotEntrance {
  entrance: Entrance;
  from: EntranceFrom;
  /** Seconds between the two frames of a pair or a diptych: 0 where they
   *  arrive as one thing (a diptych's one exposure, a strip of film). */
  stagger: number;
}

export const ENTRANCES: readonly Entrance[] = ['zoom', 'shutter', 'advance', 'develop'];

/** A pair of frames fired as a burst: the second shutter a beat after the
 *  first (seconds). */
const SHUTTER_BURST = 0.12;

/** What suits each template, best first. A screen-high frame is where a
 *  shutter reads as a shot; a pair is a strip of film; a wide landscape
 *  carries a diagonal edge; the small frames settle. Any other entrance is
 *  a last resort, taken in ENTRANCES order. */
const PREFER: Partial<Record<SlotKind, readonly Entrance[]>> = {
  SCREEN: ['shutter', 'zoom', 'develop'],
  PAGE: ['zoom', 'shutter', 'develop'],
  DIPTYCH: ['shutter', 'advance', 'zoom'],
  PAIR: ['advance', 'zoom', 'shutter'],
  FEATURE: ['develop', 'advance', 'zoom'],
  COLUMN: ['zoom', 'develop', 'advance'],
  PART: ['develop', 'zoom', 'advance'],
  LEDE: ['zoom', 'advance', 'develop'],
  LEDE2: ['zoom', 'develop', 'advance'],
  SMALL: ['zoom', 'advance', 'develop'],
};

/** The side a template's frame is set on, which is where it comes from. */
function placedFrom(slot: Slot): EntranceFrom {
  switch (slot.kind) {
    case 'SCREEN':
      return 'left';
    case 'PAGE':
      return 'top';
    case 'LEDE':
    case 'LEDE2':
    case 'PART':
    case 'DIPTYCH':
      return 'right';
    default:
      return slot.side === -1 ? 'left' : 'right';
  }
}

const DEVELOP_TURN: Record<EntranceFrom, EntranceFrom> = { left: 'top', top: 'right', right: 'left' };

/** At most one develop in every four framed slots (the first may come at
 *  the second): the old move stays in the story, as a minority. */
const developAllowed = (developed: number, dealt: number) => (developed + 1) * 4 <= dealt + 2;

/**
 * An entrance per slot, aligned with `slots`: null for the slots that are
 * not dealt one (frame 01's OPEN, the end page, a slot with no frame).
 * Per framed slot, in reading order: the first of the template's
 * preferences that is neither of the last two entrances dealt, else the
 * first that is not the last one, so the same entrance never comes twice
 * running; develop only while it stays a minority. A pair shares its slot's
 * entrance. A develop comes from the side its frame is set on, turned on
 * when the story's previous develop came from there too.
 */
export function planEntrances(slots: readonly Slot[]): Array<SlotEntrance | null> {
  const dealt: Entrance[] = [];
  let developed = 0;
  let lastDevelop: EntranceFrom | null = null;
  return slots.map((slot) => {
    if (slot.kind === 'OPEN' || slot.kind === 'END' || slot.frames.length === 0) return null;
    const count = dealt.length + 1;
    const last = dealt[dealt.length - 1];
    const recent = dealt.slice(-2);
    const order = [...(PREFER[slot.kind] ?? []), ...ENTRANCES.filter((entrance) => !(PREFER[slot.kind] ?? []).includes(entrance))];
    const open = order.filter((entrance) => entrance !== last && (entrance !== 'develop' || developAllowed(developed, count)));
    const entrance = open.find((candidate) => !recent.includes(candidate)) ?? open[0];
    dealt.push(entrance);
    let from = placedFrom(slot);
    if (entrance === 'develop') {
      if (from === lastDevelop) from = DEVELOP_TURN[from];
      lastDevelop = from;
      developed += 1;
    } else if (entrance === 'advance' && from === 'top') {
      from = 'right';
    }
    const stagger = entrance === 'advance' || (entrance === 'shutter' && slot.kind === 'DIPTYCH')
      ? 0
      : entrance === 'shutter'
        ? SHUTTER_BURST
        : STAGGER.set;
    return { entrance, from, stagger };
  });
}

// ── Playing one ──

/** The develop's rise: the story's frame curve (a small overshoot, then
 *  home). Named exception - see src/lib/motion.ts ("popEase, the frame
 *  rise"); MagazineLayout's Next card reads this copy. */
export const POP_EASE = [0.34, 1.56, 0.64, 1] as const;
const POP = `cubic-bezier(${POP_EASE.join(', ')})`;

/** The develop's soft diagonal edge, per side. The mask is three times the
 *  frame along the sweep, so the edge crosses at an even pace. */
const DEVELOP: Record<EntranceFrom, { image: string; size: string; from: string; to: string }> = {
  left: { image: 'linear-gradient(115deg, #000 40%, transparent 60%)', size: '300% 100%', from: '100% 0%', to: '0% 0%' },
  right: { image: 'linear-gradient(245deg, #000 40%, transparent 60%)', size: '300% 100%', from: '0% 0%', to: '100% 0%' },
  top: { image: 'linear-gradient(170deg, #000 40%, transparent 60%)', size: '100% 300%', from: '0% 100%', to: '0% 0%' },
};

/** The shutter's clock (ms): the curtains close, hold shut while the picture
 *  is put behind them, and open. Both strokes are spring-driven, so both
 *  ease in and stop dead, as a shutter does. */
export const SHUTTER_MS = { close: 170, hold: 70, open: 280 } as const;

export interface PlayOptions {
  entrance: Entrance;
  from: EntranceFrom;
  /** Seconds before it starts (the frame's place in its pair). */
  delay: number;
  /** Below 1024px: the same moves, lighter. */
  phone: boolean;
  /** A screen-high frame develops a little slower (the edge has further to go). */
  tall: boolean;
}

/** How long after it starts the picture reads as there: the caption is
 *  printed under it then. */
export function revealMs({ entrance, phone, tall }: Pick<PlayOptions, 'entrance' | 'phone' | 'tall'>): number {
  switch (entrance) {
    case 'zoom':
      return 220;
    case 'shutter':
      return SHUTTER_MS.close + SHUTTER_MS.hold + SHUTTER_MS.open * 0.55;
    case 'advance':
      return phone ? 280 : 320;
    case 'develop':
    default:
      return (tall ? 800 : 620) * 0.62;
  }
}

/**
 * Plays a frame's entrance on its figure (`.story-fig`): the plate
 * (`.story-fig__plate`), the photograph's button (`.story-frame`), the
 * shutter's blades if it has them, and the caption (`.story-cap`). Called in
 * a layout effect on the commit that shows the frame, so the first keyframe
 * is in place before that frame is painted. Returns the animations, for
 * cancelling (an unmount) or finishing (the viewer flying home onto it).
 */
export function playEntrance(figure: HTMLElement, options: PlayOptions): Animation[] {
  const plate = figure.querySelector<HTMLElement>('.story-fig__plate');
  if (!plate || typeof plate.animate !== 'function') return [];
  const { entrance, from, phone, tall } = options;
  const delay = Math.max(0, options.delay * 1000);
  const timing = (duration: number, easing: string, extra = 0): KeyframeAnimationOptions => ({
    duration,
    delay: delay + extra,
    easing,
    fill: 'backwards',
  });
  const out: Animation[] = [];
  if (entrance === 'zoom') {
    const scale = phone ? 1.035 : 1.06;
    out.push(
      plate.animate([{ opacity: 0 }, { opacity: 1 }], timing(phone ? 460 : 560, CSS_EASE.arrive)),
      plate.animate([{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], timing(phone ? 720 : 860, CSS_EASE.arrive)),
    );
  } else if (entrance === 'shutter') {
    const { close, hold, open } = SHUTTER_MS;
    const total = close + hold + open;
    const shut = close / total;
    const opens = (close + hold) / total;
    figure.querySelectorAll<HTMLElement>('.story-shutter__blade').forEach((blade) => {
      out.push(blade.animate([
        { transform: 'scaleY(0)', offset: 0, easing: CSS_EASE.leave },
        { transform: 'scaleY(1)', offset: shut },
        { transform: 'scaleY(1)', offset: opens, easing: CSS_EASE.leave },
        { transform: 'scaleY(0)', offset: 1 },
      ], timing(total, 'linear')));
    });
    // The picture is put in behind the closed curtains.
    const frame = figure.querySelector<HTMLElement>('.story-frame');
    if (frame) {
      out.push(frame.animate([
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: shut },
        { opacity: 1, offset: Math.min(1, shut + 0.001) },
        { opacity: 1, offset: 1 },
      ], timing(total, 'linear')));
    }
  } else if (entrance === 'advance') {
    // Wound on, A to B on a clock: it gathers, runs and stops dead in the
    // gate, rather than gliding to rest.
    const distance = (phone ? 28 : 56) * (from === 'left' ? -1 : 1);
    out.push(
      plate.animate([{ opacity: 0 }, { opacity: 1 }], timing(240, CSS_EASE.arrive)),
      plate.animate([{ transform: `translate3d(${distance}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }], timing(phone ? 420 : 480, CSS_EASE.travel)),
    );
  } else {
    const span = tall ? 800 : 620;
    const mask = DEVELOP[from];
    const frameAt = (position: string) => ({
      maskImage: mask.image,
      webkitMaskImage: mask.image,
      maskSize: mask.size,
      webkitMaskSize: mask.size,
      maskRepeat: 'no-repeat',
      webkitMaskRepeat: 'no-repeat',
      maskPosition: position,
      webkitMaskPosition: position,
    });
    out.push(
      plate.animate([frameAt(mask.from), frameAt(mask.to)] as Keyframe[], timing(span, CSS_EASE.develop)),
      plate.animate([{ opacity: 0 }, { opacity: 1 }], timing(250, CSS_EASE.arrive)),
      plate.animate([{ transform: `translate3d(0, ${phone ? 10 : 14}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }], timing(span, POP)),
    );
  }
  // The caption is printed under the picture once it reads as there.
  const caption = figure.querySelector<HTMLElement>('.story-cap');
  if (caption) {
    out.push(caption.animate(
      [{ opacity: 0, transform: 'translate3d(0, 6px, 0)' }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }],
      timing(420, CSS_EASE.arrive, revealMs(options)),
    ));
  }
  return out;
}
