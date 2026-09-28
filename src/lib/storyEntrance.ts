// ── How a photograph arrives on the story's page ──
// Every inside frame used to arrive the same way, a diagonal develop from the
// top-left corner, and forty of them in a row read as one trick (the owner,
// 2026-09-27: 出现方式可以不局限于从左上角闪出). A story now has four
// photographic ways for a picture to come up:
//   zoom    — the print settles onto the page: a hair large, fading up as it
//             comes to size. The house default for a single frame;
//   advance — the film is wound on: a strip (a pair, a feature) comes in a
//             short way from its own side and glides to rest;
//   shutter — a vertical-travel focal-plane shutter fires over the frame:
//             four blades run down and close it, then run on down to open it
//             on the picture, top first, the way the reader scrolls;
//   develop — the old develop, now straight down from the top, once a story.
// A magazine, not a showreel: zoom and advance carry the story, and the two
// loud moves are accents placed on its beats. The develop goes to the
// story's feature (else its first screen-high landscape); the shutter to the
// first frame after the pull quote (else from Part II on), at most twice,
// four framed slots apart, and only over a frame short enough for the
// curtain to be seen crossing it (a review, 2026-09-27: over a screen-high
// frame it fired below the fold and read as a black blind).
// The frame the reader opened the story from (frame 01, the plate's grow)
// and the end page's Plates keep their own arrivals and are not dealt one.
//
// `planEntrances` is pure (scripts/story-entrance.test.mjs pins it on the
// six stories). `playEntrance` runs one on the DOM with the Web Animations
// API: transform, opacity and a mask position only, nothing that lays out,
// and `fill: 'backwards'`, so once it has played no inline state is left
// behind — the frame is exactly what the server sent.

import { CSS_EASE, STAGGER } from './motion.ts';
import { storyBoxes, type Slot, type SlotKind } from './storyPlan.ts';

export type Entrance = 'zoom' | 'shutter' | 'advance' | 'develop';
/** The side a frame advances from ('left' or 'right'); a develop always
 *  comes from the 'top'. */
export type EntranceFrom = 'left' | 'right' | 'top';

export interface SlotEntrance {
  entrance: Entrance;
  from: EntranceFrom;
  /** Seconds between the two frames of a pair: 0 where they arrive as one
   *  thing (a strip of film). */
  stagger: number;
}

export const ENTRANCES: readonly Entrance[] = ['zoom', 'shutter', 'advance', 'develop'];

/** The window the plan measures frames in: the design window, the one
 *  MagazineLayout's `sizes` read. One deal for every screen, so the server's
 *  HTML and the hydrated page agree. */
export const DESIGN_W = 1728;
export const DESIGN_H = 1000;

/** A shutter fires only over a frame no taller than this share of the
 *  screen, so the reader sees the curtain cross it. */
export const SHUTTER_MAX_SHARE = 0.6;
/** At most this many shutters in a story… */
export const SHUTTER_MAX = 2;
/** …never within three framed slots of each other. */
export const SHUTTER_SPACING = 4;
/** The same entrance at most this many times running. */
export const RUN = 2;

/** A pair of frames fired as a burst: the second shutter a beat after the
 *  first (seconds). */
const SHUTTER_BURST = 0.12;

/** The templates that arrive as a strip of film: they advance. */
const STRIPS: ReadonlySet<SlotKind> = new Set(['PAIR', 'FEATURE']);

/** The side a template's frame is set on, which is where it advances from. */
function placedFrom(slot: Slot): EntranceFrom {
  switch (slot.kind) {
    case 'SCREEN':
      return 'left';
    case 'PAGE':
    case 'LEDE':
    case 'LEDE2':
    case 'PART':
      return 'right';
    default:
      return slot.side === -1 ? 'left' : 'right';
  }
}

const isDealt = (slot: Slot) => slot.kind !== 'OPEN' && slot.kind !== 'END' && slot.frames.length > 0;

/**
 * An entrance per slot, aligned with `slots`: null for the slots that are
 * not dealt one (frame 01's OPEN, the end page, a slot with no frame).
 *   develop — the story's first FEATURE, else its first SCREEN; none else.
 *   shutter — over a slot whose tallest frame, at the design window, is at
 *             most SHUTTER_MAX_SHARE of the screen: the first such slot
 *             after the pull quote (with no quote, from Part II on; with
 *             neither, from the start), then the next one at least
 *             SHUTTER_SPACING framed slots on, at most SHUTTER_MAX. With none
 *             after that beat, the one nearest before it.
 *   the rest — a strip advances and a single frame zooms, except where that
 *             would be the same entrance a third time running: then the
 *             other one.
 */
export function planEntrances(slots: readonly Slot[], ratios: readonly number[]): Array<SlotEntrance | null> {
  const boxes = storyBoxes(slots, ratios, DESIGN_W, DESIGN_H);
  const framed = slots.flatMap((slot, index) => (isDealt(slot) ? [index] : []));
  const developAt = framed.find((index) => slots[index].kind === 'FEATURE')
    ?? framed.find((index) => slots[index].kind === 'SCREEN')
    ?? -1;
  const suits = (index: number) => index !== developAt
    && Math.max(...boxes[index].frames.map((frame) => frame.h.v)) <= SHUTTER_MAX_SHARE * DESIGN_H;
  const quote = slots.findIndex((slot) => slot.kind === 'QUOTE');
  const part = slots.findIndex((slot) => slot.kind === 'PART');
  const beat = Math.max(0, quote >= 0 ? quote : part);
  // The shutters, as positions among the framed slots.
  const shutters: number[] = [];
  framed.forEach((index, at) => {
    if (index < beat || shutters.length >= SHUTTER_MAX || !suits(index)) return;
    if (shutters.length && at - shutters[shutters.length - 1] < SHUTTER_SPACING) return;
    shutters.push(at);
  });
  if (shutters.length === 0) {
    for (let at = framed.length - 1; at >= 0; at -= 1) {
      if (framed[at] < beat && suits(framed[at])) {
        shutters.push(at);
        break;
      }
    }
  }
  const dealt: Entrance[] = [];
  const third = (entrance: Entrance) => dealt.length >= RUN && dealt.slice(-RUN).every((last) => last === entrance);
  return slots.map((slot, index) => {
    if (!isDealt(slot)) return null;
    let entrance: Entrance;
    if (index === developAt) entrance = 'develop';
    else if (shutters.includes(dealt.length)) entrance = 'shutter';
    else {
      const wanted: Entrance = STRIPS.has(slot.kind) ? 'advance' : 'zoom';
      entrance = third(wanted) ? (wanted === 'advance' ? 'zoom' : 'advance') : wanted;
    }
    dealt.push(entrance);
    const from: EntranceFrom = entrance === 'develop' ? 'top' : placedFrom(slot);
    const stagger = entrance === 'advance' ? 0 : entrance === 'shutter' ? SHUTTER_BURST : STAGGER.set;
    return { entrance, from, stagger };
  });
}

// ── Playing one ──

/** The develop's rise: the story's frame curve (a small overshoot, then
 *  home). Named exception - see src/lib/motion.ts ("popEase, the frame
 *  rise"); MagazineLayout's Next card reads this copy. */
export const POP_EASE = [0.34, 1.56, 0.64, 1] as const;
const POP = `cubic-bezier(${POP_EASE.join(', ')})`;

/** The develop's soft edge, straight down. The mask is three times the
 *  frame's height, so the edge crosses at an even pace. It starts with the
 *  edge at the frame's top: from 100% it began a fifth of a frame above,
 *  and the frame showed nothing for its first 160ms. */
const DEVELOP = {
  image: 'linear-gradient(180deg, #000 40%, transparent 60%)',
  size: '100% 300%',
  from: '0% 90%',
  to: '0% 0%',
} as const;
export const DEVELOP_MS = 620;

/** The shutter's clock (ms). Each of its four blades runs down to close
 *  (`close`), a `blade` after the one above it; the curtain holds shut for
 *  `hold`, with the picture put in behind it; then each blade runs on down,
 *  off the bottom edge, to open (`open`), in the same order. Both strokes
 *  ease in and end at speed, as a spring-driven blade does. */
export const SHUTTER_MS = { close: 120, hold: 40, open: 200, blade: 14 } as const;
export const SHUTTER_BLADES = 4;
/** One blade's run, from the first move of its close to the end of its
 *  open: the same for every blade, each started a `blade` later. */
export const SHUTTER_BLADE_MS = SHUTTER_MS.close + (SHUTTER_BLADES - 1) * SHUTTER_MS.blade + SHUTTER_MS.hold + SHUTTER_MS.open;
/** The whole shutter, first blade in to last blade out. */
export const SHUTTER_TOTAL_MS = SHUTTER_BLADE_MS + (SHUTTER_BLADES - 1) * SHUTTER_MS.blade;

export interface PlayOptions {
  entrance: Entrance;
  from: EntranceFrom;
  /** Seconds before it starts (the frame's place in its pair). */
  delay: number;
  /** Below 1024px: the same moves, lighter. */
  phone: boolean;
  /** A screen-high frame (a screen, a page) zooms from nearer its size: at
   *  1.06 a 1374px frame's edges would move 41px. */
  tall: boolean;
}

/** How long after it starts the picture reads as there: the caption is
 *  printed under it then. */
export function revealMs({ entrance, phone }: Pick<PlayOptions, 'entrance' | 'phone' | 'tall'>): number {
  switch (entrance) {
    case 'zoom':
      return 220;
    case 'shutter':
      return SHUTTER_MS.close + SHUTTER_MS.hold + SHUTTER_MS.open * 0.55;
    case 'advance':
      return phone ? 280 : 320;
    case 'develop':
    default:
      return DEVELOP_MS * 0.62;
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
    const scale = phone ? 1.035 : tall ? 1.04 : 1.06;
    out.push(
      plate.animate([{ opacity: 0 }, { opacity: 1 }], timing(phone ? 460 : 560, CSS_EASE.arrive)),
      plate.animate([{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], timing(phone ? 720 : 860, CSS_EASE.arrive)),
    );
  } else if (entrance === 'shutter') {
    const { close, hold, blade } = SHUTTER_MS;
    const closed = close + (SHUTTER_BLADES - 1) * blade;
    const shut = close / SHUTTER_BLADE_MS;
    const opens = (closed + hold) / SHUTTER_BLADE_MS;
    // Blade k is a quarter of the frame and a pixel, so neighbours overlap
    // with no seam of picture between them. It waits stacked above the
    // frame, fans down to its quarter to close, and runs on to stack below
    // the frame to open. The upper blade starts first and travels further,
    // so the curtain has no gap at any point of either stroke.
    figure.querySelectorAll<HTMLElement>('.story-shutter__blade').forEach((node, k) => {
      const fanned = `translate3d(0, calc(${k * 100}% - ${k}px), 0)`;
      out.push(node.animate([
        { transform: 'translate3d(0, -100%, 0)', offset: 0, easing: CSS_EASE.leave },
        { transform: fanned, offset: shut },
        { transform: fanned, offset: opens, easing: CSS_EASE.leave },
        { transform: `translate3d(0, ${SHUTTER_BLADES * 100}%, 0)`, offset: 1 },
      ], timing(SHUTTER_BLADE_MS, 'linear', k * blade)));
    });
    // The picture is put in behind the closed curtain: bare paper until the
    // last blade is home and halfway through the hold, then the photograph
    // (its CSS value from there; global.css keeps a transition off it).
    const frame = figure.querySelector<HTMLElement>('.story-frame');
    if (frame) out.push(frame.animate([{ opacity: 0 }, { opacity: 0 }], timing(closed + hold / 2, 'linear')));
  } else if (entrance === 'advance') {
    // Wound on, A to B on a clock (--ease-travel, an in-out): it gathers,
    // runs and glides to rest in the gate. Shorter on the phone, where a
    // frame set against the right edge must not be clipped by the screen.
    const distance = (phone ? 16 : 56) * (from === 'left' ? -1 : 1);
    out.push(
      plate.animate([{ opacity: 0 }, { opacity: 1 }], timing(240, CSS_EASE.arrive)),
      plate.animate([{ transform: `translate3d(${distance}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }], timing(phone ? 420 : 480, CSS_EASE.travel)),
    );
  } else {
    const frameAt = (position: string) => ({
      maskImage: DEVELOP.image,
      webkitMaskImage: DEVELOP.image,
      maskSize: DEVELOP.size,
      webkitMaskSize: DEVELOP.size,
      maskRepeat: 'no-repeat',
      webkitMaskRepeat: 'no-repeat',
      maskPosition: position,
      webkitMaskPosition: position,
    });
    out.push(
      plate.animate([frameAt(DEVELOP.from), frameAt(DEVELOP.to)] as Keyframe[], timing(DEVELOP_MS, CSS_EASE.develop)),
      plate.animate([{ opacity: 0 }, { opacity: 1 }], timing(250, CSS_EASE.arrive)),
      plate.animate([{ transform: `translate3d(0, ${phone ? 10 : 14}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }], timing(DEVELOP_MS, POP)),
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
