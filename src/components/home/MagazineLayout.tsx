import React, { useCallback, useRef, useState, useEffect, useLayoutEffect, useMemo, type CSSProperties, type FocusEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { motion, animate, motionValue, useScroll, useMotionValueEvent, AnimatePresence, useReducedMotion, useIsPresent, type MotionValue } from 'framer-motion';
import type { Collection, Photo } from '../../types';
import Lightbox, { type LightboxOrigin, type LightboxTarget } from '../shared/Lightbox';
import {
  EDITORIAL_FALLBACKS,
  MAP_CREDIT,
  photoDescription,
  pullQuote,
  storyDek,
} from '../../lib/narratives';
import { useHoverCapable } from '../../lib/useHoverCapable';
import { usePressGive } from '../../lib/usePressGive';
import { useInViewOnce } from '../../lib/useInViewOnce';
import { stockPaper, stockStyle } from '../../lib/ticketStock';
import { fileDims } from '../../lib/lightboxImage';
import { CSS_EASE, DUR, DUR_MS, EASE } from '../../lib/motion';
import { travelPlateLeft } from '../../lib/travelPlate';
import { chapterOrdinal } from '../../lib/chapterOrder';
import { plateRows, type PlateRows } from '../../lib/plateRows';
import {
  css,
  formatPosition,
  frameRatio,
  isLandscape,
  openerRect,
  planStory,
  slotCaption,
  slotRows,
  storyBoxes,
  storyCamera,
  storyFrames,
  type Slot,
  type SlotBoxes,
  type SlotKind,
} from '../../lib/storyPlan';
import { planEntrances, playEntrance, POP_EASE, SHUTTER_BLADES, type SlotEntrance } from '../../lib/storyEntrance';

// Heavy in-out curve for the overlay panel slide — deliberate one-off (a big
// plane of UI entering/leaving reads better with symmetric weight than expo).
// Named exception - see src/lib/motion.ts.
const overlayEase = [0.32, 0, 0.07, 1] as const;
// The developing-print reveal (after Adovasio's .appear-mask), swept on
// EASE.develop.
const DEVELOP_MASK = 'linear-gradient(115deg, #000 40%, transparent 60%)';
const DEVELOP_MASK_STYLE = {
  WebkitMaskImage: DEVELOP_MASK,
  maskImage: DEVELOP_MASK,
  WebkitMaskSize: '300% 100%',
  maskSize: '300% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
} as const;
// Back-out curve for the photographs arriving as a story opens — the second
// sanctioned exception to house expo, approved by the owner so each page
// "springs out" instead of sliding in. The 1.56 overshoots and settles, so the
// frames lift just past rest and land. It drives transform only: opacity keeps
// expo, because an overshooting opacity has nothing to overshoot into. The
// inside frames' entrances (src/lib/storyEntrance.ts) hold its one copy.
// Named exception - see src/lib/motion.ts.
const popEase = POP_EASE;
// The Next card grows into the next story's opening spread. Long enough to
// read as one object arriving, short enough to stay a single page turn.
const COVER_EXPAND_MS = 500;
// The Homepage plate grows into the opening spread. A photograph the reader
// was just looking at travels further than the Next card (it starts at over
// half the viewport) and should be watched doing it, so it takes a little
// longer than the card; the plane keeps its own in-out curve (EASE.plane).
const PLATE_GROW_MS = 560;
// How long the spread takes to set once the photograph has landed: the type
// sets over it (the title's rise ends at 270 + 720ms, its last ~130ms
// sub-pixel) and only then is the kept stub handed in. Counted from the
// landing (or, on a cold /works page, from hydration). It was the front
// page's hold (PLATE_COVER_HOLD_MS) when a front page was peeled off the
// story; the value is kept.
const SPREAD_SET_MS = 860;
// The photo viewer's exit (Lightbox: the field and the flight home, 0.46s).
// A kept stub held back by a viewer opened as the story went live arrives
// once it has gone.
const VIEWER_EXIT_MS = 460;
// How long a landed spread waits for its terrain to decode. The fetch starts
// at the click, so the grow has normally finished it; this only bounds a
// slow network (a late map still develops, under type that has set).
const TERRAIN_GRACE_MS = 320;
// The overlay's panel slide (a story opened without a plate: the phone, a
// kept stub on the closing's proof sheet), for the stub's clock.
const PANEL_SLIDE_MS = 680;
// The type on the opening spread sets in reading order from the landing —
// kicker, title, dek, credits, caption at 180 + k × 90ms (STAGGER.line) — in
// CSS (global.css, Story block: `.story[data-set]`), so the story body
// mounting in the same frame cannot stall it.
const SHARED_OPEN_DURATION = 0.78;
// The line the story is read on: the homepage's reading line (AtlasSign's
// ATLAS_READING_LINE, 0.48 of the viewport). Mirrored, not imported, as
// ArchiveChapter does: AtlasSign lives in RouteAtlas's lazy chunk, and this
// module is in the homepage's eager bundle and in every /works page — an
// import would pull the atlas sign and its landmark drawings into both.
// Change them together.
const STORY_READING_LINE = 0.48;
/** The kept stub's ink follows the reading line continuously. What is shown
 *  chases what has been read with this time constant (ms), so a mouse-wheel
 *  notch glides instead of stepping; a trackpad is already continuous and
 *  simply passes through. The same chase is the stub's arrival: as it is
 *  handed in the ink counts up from nothing to where the reader stands. */
const STUB_INK_TAU = 90;
/** The frame number rolls after the ink, turning as the tick it names fills. */
const STUB_ROLL_TAU = 70;
/** The stub's flight from the rail back onto its homepage ticket at the
 *  close (`flyStubHome`). Slower out of the blocks than the plate's own
 *  in-out curve (which peaks at 167px a frame over this distance and reads
 *  as a jump): moving by +50ms, 90% there by +434ms, never more than ~105px
 *  a frame. Named exception - see src/lib/motion.ts. */
const STUB_TRAVEL_MS = 680;
const stubTravelEase = [0.5, 0, 0.18, 1] as const;
/** The card tips as it is carried, and lands square. */
const STUB_TRAVEL_TILT = -1.6;
/** Where the rail's kept stub waits while the story loads, and where it is
 *  set down once it has (KeptStub). It waits below the fold, tipped as it is
 *  when carried: the rail's foot rests the story's margin M (at most 48px)
 *  above the fold, and 145% of the card's own height (138px, so 200px) puts
 *  even its raised corner (~5px at 1.6° on the 390px rail) under the edge,
 *  where the story's scroller clips it. A share of its own height, so it is
 *  derived, never measured. */
const STUB_WAITING = { y: '145%', rotate: STUB_TRAVEL_TILT } as const;
const STUB_SEATED = { y: '0%', rotate: 0 } as const;

/** The map page of each story's opening spread: the terrain of its place,
 *  printed in white ink on the chapter's ticket stock (global.css,
 *  .story-terrain-ink). Miami, Orlando and New York are the original
 *  terraink posters; Page, Zion and Bryce were drawn to match them (contours
 *  carry the land where there are no streets). New York's poster is white
 *  roads on black (DARK_TERRAIN) and prints without the invert. A place
 *  without a map has its stock page and its type alone. */
const COVER_TERRAIN: Record<string, string> = {
  miami: '/textures/optimized/miami-map-2000.webp',
  orlando: '/textures/optimized/orlando-map-2000.webp',
  page: '/textures/optimized/page-map-2000.webp',
  'zion-national-park': '/textures/optimized/zion-national-park-map-2000.webp',
  'bryce-canyon-national-park': '/textures/optimized/bryce-canyon-national-park-map-2000.webp',
  'new-york-stories': '/textures/optimized/new-york-map-2000.webp',
};

/** Posters drawn white on black: printed as they are, not inverted. */
const DARK_TERRAIN: ReadonlySet<string> = new Set(['new-york-stories']);

/** A hand-set sequence for a story, when the planner's is not the one wanted
 *  (src/lib/storyPlan.ts planStory). Used only while it still places every
 *  frame once, in order; otherwise the planner's stands. None today. */
const STORY_SEQUENCE: Partial<Record<string, Slot[]>> = {};

function storySlots(slug: string | undefined, ratios: readonly number[], hasQuote: boolean): Slot[] {
  const set = slug ? STORY_SEQUENCE[slug] : undefined;
  if (set) {
    const placed = set.flatMap((slot) => slot.frames);
    const whole = placed.length === ratios.length && placed.every((frame, index) => frame === index);
    if (whole && set[0]?.kind === 'OPEN' && set[set.length - 1]?.kind === 'END') return set;
  }
  return planStory(ratios, { hasQuote });
}

function terrainFor(story: Pick<Collection, 'slug'> | null | undefined): string {
  return (story?.slug && COVER_TERRAIN[story.slug]) || '';
}

/** One fetch-and-decode per terrain per page life. The Image is kept so its
 *  decoded bitmap stays warm for the <img> that later draws the same URL. */
const terrainWarm = new Map<string, { image: HTMLImageElement; decoded: boolean; ready: Promise<boolean> }>();

function warmTerrain(url: string): Promise<boolean> {
  if (!url || typeof window === 'undefined') return Promise.resolve(false);
  const known = terrainWarm.get(url);
  if (known) return known.ready;
  const image = new Image();
  image.decoding = 'async';
  image.setAttribute('fetchpriority', 'high');
  image.src = url;
  const entry = { image, decoded: false, ready: Promise.resolve(false) };
  const loaded = () => image.complete && image.naturalWidth > 0;
  entry.ready = (typeof image.decode === 'function'
    ? image.decode()
    : new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; }))
    .then(() => true, () => loaded())
    .then((ok) => {
      entry.decoded = ok;
      // A failed fetch is forgotten, so a later turn to this story can retry.
      if (!ok) terrainWarm.delete(url);
      return ok;
    });
  terrainWarm.set(url, entry);
  return entry.ready;
}

const terrainDecoded = (url: string) => !!url && terrainWarm.get(url)?.decoded === true;

const SHARED_CLOSE_DURATION = 0.62;
const SHARED_CONTENT_DELAY = SHARED_OPEN_DURATION * 0.55;

export type MagazineEntryMode = 'cover' | 'shared-photo';

export interface MagazineLayoutProps {
  collection: Collection;
  allCollections: Collection[];
  onSelectCollection: (c: Collection) => void;
  onClose: () => void;
  returnFocusElement?: HTMLElement | null;
  mainId?: string;
  standalone?: boolean;
  canonicalUrl?: string;
  /** Homepage-only handoff. The opening photograph and its source must share
   *  this layoutId; other entry points keep the existing editorial cover. */
  entryMode?: MagazineEntryMode;
  sharedLayoutId?: string;
  /** Override source detection when the matching Homepage photograph is
   *  intentionally kept mounted without being the return-focus element. */
  sharedSourcePresent?: boolean;
  /** Exact decoded URL currently visible in the Homepage source frame. Using
   *  it for the morph avoids a cache miss or a hover-frame swap on click. */
  sharedImageUrl?: string;
  /** Called after the shared photograph has completed its 780ms handoff. The
   *  parent owns keyboard/focus orchestration in shared-photo mode. */
  onEntryReady?: (focusTarget: HTMLButtonElement | null) => void;
  /** Homepage desktop only: the chapter plate the reader clicked, measured
   *  once at the click. The story opens as a window cut at that rectangle
   *  and grows to the whole screen, while the plate's own decoded photograph
   *  — under the plate's own grade — flies to its place on the opening
   *  spread as frame 01 (`GrowPlane`). */
  entryOrigin?: PlateOrigin;
  /** Homepage desktop only, asked once at the close: the homepage ticket of
   *  the story on screen when that story was turned to (Next), read by the
   *  Homepage after it has set the page on that story's chapter. The rail's
   *  stub, the story's own, flies home into it. */
  homeStubFor?: (collectionId: string) => PlateStub | null;
}

/** What the Homepage read off the plate in the click, before any scroll lock. */
export interface PlateOrigin {
  /** The plate's frame: the window the photograph was seen through. */
  frame: LightboxOrigin;
  /** The photograph's own box inside that window, hover zoom and parallax
   *  included, so the first frame of the grow is the frame the reader saw. */
  image: LightboxOrigin;
  /** The file's width / height. */
  ratio: number;
  /** The plate's olive matte at the moment of the click (0–1). */
  matte: number;
  /** The exact decoded candidate the plate was showing. */
  imageUrl: string;
  /** The ticket's stub, when it still had one (an untorn ticket, on screen,
   *  motion allowed): the half the reader keeps. It is handed into the foot
   *  of the story's rail once the story has loaded, and flies back onto the
   *  ticket at the close. */
  stub?: PlateStub;
  /** A photograph that is not a ticket's (the Next card, a frame on
   *  the closing's proof sheet; see `photoOrigin`): it wears none of the
   *  ticket's shades, and its matte is its own window's ground. */
  bare?: { ground: string };
}

/** The three marks both stubs print — ordinal, "/ TT · admission", place —
 *  as text boxes relative to their stub's corner. */
export type StubMarks = Record<'no' | 'of' | 'place', { x: number; y: number }>;

export interface PlateStub {
  /** The homepage stub's box at the click. */
  box: LightboxOrigin;
  marks: StubMarks;
  /** The homepage stub itself: hidden while its half is away
   *  (`data-kept-away`), and copied for the rows only it prints. */
  node: HTMLElement;
  /** The window the box was read in (innerWidth × innerHeight, which the
   *  scrollbar never changes): a return to a resized page is not flown, since
   *  the box would no longer be where the ticket is. */
  view: { width: number; height: number };
  /** The ticket's own ordinal and total as the homepage printed them: the
   *  kept half carries the number it was torn from, not the story's folio
   *  (allCollections order is not the homepage's chapter order). */
  print?: { ordinal: string; total: string };
}

const STUB_MARKS = ['no', 'of', 'place'] as const;

/**
 * Where a stub's three shared marks are printed: text boxes (a Range over
 * each mark's text, so ascent to descent), not element boxes. The homepage
 * stub sets its labels on the body's 1.5 leading and the rail's on 1, so the
 * element boxes of one word sit a few pixels apart while its letters
 * coincide. `prefix` is the stub's block class.
 */
export function readStubMarks(root: HTMLElement, prefix: string): StubMarks | null {
  const corner = root.getBoundingClientRect();
  const marks = {} as StubMarks;
  for (const mark of STUB_MARKS) {
    const node = root.querySelector(`.${prefix}__${mark}`);
    if (!node) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    marks[mark] = { x: box.left - corner.left, y: box.top - corner.top };
  }
  return marks;
}

/** Where `object-fit: cover` draws a photograph of `ratio` inside `box`. */
function coverRect(ratio: number, box: LightboxOrigin): LightboxOrigin {
  const wider = box.width / box.height < ratio;
  const width = wider ? box.height * ratio : box.width;
  const height = wider ? box.height : box.width / ratio;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

/**
 * A story can grow out of any photograph on screen — the Next card on an end
 * page (its own ratio), a frame on the closing's proof sheet — exactly as it
 * grows out of a homepage plate: this reads that
 * picture as a PlateOrigin, once, in the click. The window is the frame, the
 * shape comes from the file's name (the decoded candidate's own size if the
 * name has none), and the matte is the window's ground showing through
 * wherever the picture was drawn at less than full strength (the card rests
 * at 0.55, an unchosen proof frame at 0.7), so the plane's first frame is the
 * frame the reader saw. Null when the picture is not decoded yet or its
 * window has no box: the caller keeps the way in it had.
 */
export function photoOrigin(frame: HTMLElement, image: HTMLImageElement | null): PlateOrigin | null {
  if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
  const imageUrl = image.currentSrc || image.src;
  const box = frame.getBoundingClientRect();
  if (!imageUrl || box.width <= 0 || box.height <= 0) return null;
  const dims = fileDims(imageUrl);
  const ratio = dims ? dims.width / dims.height : image.naturalWidth / image.naturalHeight;
  let ink = 1;
  for (let node: Element | null = image; node && node !== document.body; node = node.parentElement) {
    const opacity = Number.parseFloat(getComputedStyle(node).opacity);
    if (Number.isFinite(opacity)) ink *= opacity;
  }
  // The colour under the picture: its window's own, or the page's it sits
  // straight on (the Next card, on its end page's stock).
  const clearColour = (colour: string) => !colour || colour === 'transparent' || /,\s*0\)$/.test(colour);
  let ground = '';
  for (let node: Element | null = frame; node && node !== document.body && clearColour(ground); node = node.parentElement) {
    ground = getComputedStyle(node).backgroundColor;
  }
  const clear = clearColour(ground);
  const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
  return {
    frame: rect,
    image: rect,
    ratio,
    matte: Math.min(1, Math.max(0, 1 - ink)),
    imageUrl,
    bare: { ground: clear ? '#30352a' : ground },
  };
}

/** The story's frames in reading order, their shapes, and its plan. One
 *  source for the grid, the lightbox, the kept stub and the grow's aim. */
function storyPlanFor(story: Collection) {
  const frames = storyFrames(story.photos ?? [], story.coverImageUrl);
  const ratios = frames.map(frameRatio);
  return { frames, ratios, slots: storySlots(story.slug, ratios, !!pullQuote(story.slug)) };
}

/** The shape of a story's frame 01 without its photographs (a lightweight
 *  index entry): its cover, by the size in the file's name. */
function openerRatio(story: Collection): number {
  const frames = storyFrames(story.photos ?? [], story.coverImageUrl);
  if (frames[0]) return frameRatio(frames[0]);
  const dims = story.coverImageUrl ? fileDims(story.coverImageUrl) : null;
  return dims ? dims.width / dims.height : 1.5;
}

const ASSET_HASH = /[0-9a-f]{40}/;

/**
 * A story opens by growing out of the picture the reader chose — a homepage
 * plate, the Next card on an end page, a frame on the closing's proof sheet.
 * Two things move at once, both in window pixels read once in the click:
 *
 * - the window: a plane already the size of the screen, cut to the chosen
 *   picture's frame (`clip-path: inset`) and opened to the whole screen. It
 *   is printed with the grounds of the spread it becomes — the chapter's
 *   stock where the map page will be, paper under the photograph — so when it
 *   lands, the spread under it is the same picture and it simply goes;
 * - the photograph: when it IS the story's frame 01 (a plate, the Next card),
 *   it flies from where the reader saw it to where frame 01 sits on the
 *   spread (`openerRect`), a pure translate and uniform scale. Both boxes are
 *   the file's own shape, so the picture never re-crops: a portrait plate
 *   stands up into the full-height right page, a landscape slides to the top
 *   right. It stays over frame 01 until frame 01's own file has decoded.
 *
 * A proof-sheet frame that is not frame 01 opens the story on paper instead:
 * the story goes live scrolled so that frame sits in the middle of the screen
 * and the viewer takes it from there (HomePage), so the picture flies to that
 * place on the page — its box from the plan, at the height the page will be
 * scrolled to — and the viewer opens out of it.
 */
interface GrowPlane {
  key: number;
  kind: 'plate' | 'turn';
  /** The story the window opens onto. */
  story: Collection;
  origin: PlateOrigin | null;
  /** The chosen picture's frame, if there is no origin (not decoded). */
  box: LightboxOrigin;
  ms: number;
  /** 'spread': the window prints the spread's grounds and hands over to it at
   *  the landing; 'page': it opens on paper and fades after it. */
  onto: 'spread' | 'page';
  /** Where the stock page ends (px), or null for a full stock page (phone). */
  split: number | null;
  /** Where the photograph lands: frame 01's place on the spread, or (onto
   *  paper) the chosen frame's place, centred as the page will show it. */
  target: { x: number; y: number; width: number; height: number } | null;
  phase: 'grow' | 'hold';
}

/** Resolves once a story frame's own file has loaded and decoded, or has
 *  failed: the moment the page can show it instead of a stand-in. */
function frameDecoded(image: HTMLImageElement): Promise<void> {
  const loaded = image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
  return loaded.then(() => (image.naturalWidth > 0 && typeof image.decode === 'function' ? image.decode().catch(() => {}) : undefined));
}

let growKey = 0;

function growPlane(kind: GrowPlane['kind'], story: Collection, origin: PlateOrigin | null, box: LightboxOrigin, ms: number): GrowPlane {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const desktop = W >= 1024;
  const frame01 = storyFrames(story.photos ?? [], story.coverImageUrl)[0]?.imageUrl ?? story.coverImageUrl ?? '';
  const isFrame01 = !!origin && (!origin.bare || ASSET_HASH.exec(origin.imageUrl)?.[0] === ASSET_HASH.exec(frame01)?.[0]);
  const onto = !origin || isFrame01 ? 'spread' : 'page';
  const ratio = openerRatio(story);
  const rect = openerRect(W, H, ratio);
  let target: GrowPlane['target'] = null;
  if (desktop && origin && onto === 'spread') target = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  if (desktop && origin && onto === 'page') {
    const plan = storyPlanFor(story);
    const hash = ASSET_HASH.exec(origin.imageUrl)?.[0];
    const index = hash ? plan.frames.findIndex((photo) => ASSET_HASH.exec(photo.imageUrl)?.[0] === hash) : -1;
    const box = index > 0
      ? storyBoxes(plan.slots, plan.ratios, W, H).flatMap((slot) => slot.frames).find((frame) => frame.frame === index)
      : null;
    if (box) target = { x: box.x.v, y: Math.max(0, (H - box.h.v) / 2), width: box.w.v, height: box.h.v };
  }
  growKey += 1;
  return {
    key: growKey,
    kind,
    story,
    origin,
    box,
    ms,
    onto,
    split: desktop ? rect.mapW : null,
    target,
    phase: 'grow',
  };
}

function labelsMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const normalize = (value: string) => value
    .toLocaleLowerCase()
    .replace(/\b(national park|stories|city)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
  const left = normalize(a);
  const right = normalize(b);
  const rightPrimary = normalize(b.split(',')[0]);
  return !!left && (left === right || left === rightPrimary);
}

/* ── The frames on the page — their own ratio, never cropped ── */

/** How a frame arrives. 'rest': as sent — a /works page's server HTML, any
 *  frame already on screen (or above it) when the page arms, a frame the
 *  viewer flew home onto, and every frame once its entrance has played;
 *  'waiting': below the fold, not come up yet; 'shown': the reader has
 *  reached it and its entrance plays (src/lib/storyEntrance.ts). */
type Reach = 'rest' | 'waiting' | 'shown';

/** The event the story sends a frame when the viewer is about to fly home
 *  onto it: it drops its entrance and stands at rest to be measured. */
const FRAME_SETTLE = 'story-frame-settle';

/** One native observer per frame (never whileInView): each frame plays
 *  once, when it is on screen. It watches the photograph's own box, not the
 *  figure: a pair's caption hangs under its first frame only, and a taller
 *  target would reach the threshold later than its partner. So a pair's two
 *  frames, on one row on desktop, are reached in the same callback; on the
 *  phone, where they stack, each is reached on its own. A frame is reached
 *  as soon as its top edge is 6% of the screen in: a share of a tall
 *  frame's area came late, and a reader who paused left up to 226px of its
 *  place as blank paper for two seconds. Every entrance reads from the top
 *  or all at once, so it reads with only the frame's top on screen. */
function useFrameReach<T extends HTMLElement>(armed: boolean, reduce: boolean) {
  const ref = useRef<T>(null);
  const [reach, setReach] = useState<Reach>('rest');
  useEffect(() => {
    if (!armed || reduce) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    let first = true;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (first) {
          first = false;
          // On screen or above it when the page arms: it stays as it is,
          // rather than vanishing to arrive again in front of the reader.
          if (entry.isIntersecting || entry.boundingClientRect.top < window.innerHeight) {
            observer.disconnect();
            return;
          }
          setReach('waiting');
        } else if (entry.isIntersecting) {
          setReach('shown');
          observer.disconnect();
        }
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
    observer.observe(node.querySelector('.story-fig__plate') ?? node);
    const settle = () => {
      observer.disconnect();
      setReach('rest');
    };
    node.addEventListener(FRAME_SETTLE, settle);
    return () => {
      observer.disconnect();
      node.removeEventListener(FRAME_SETTLE, settle);
    };
  }, [armed, reduce]);
  return [ref, reach] as const;
}

/** The shutter's blades, top to bottom (storyEntrance.ts plays them). */
const SHUTTER_BLADE_KEYS = Array.from({ length: SHUTTER_BLADES }, (_, blade) => blade);

/** Stands a frame at rest at once, entrance or not: the viewer is about to
 *  measure it and fly home onto it. Called with the frame's button. */
function settleFrame(node: HTMLElement) {
  const figure = node.closest<HTMLElement>('.story-fig');
  if (!figure || !figure.hasAttribute('data-reach')) return;
  for (const animation of figure.getAnimations({ subtree: true })) {
    if (animation instanceof CSSTransition) continue;
    animation.finish();
  }
  // The attribute goes now, so the frame is visible for the measure and the
  // landing; the state follows on the next render.
  figure.removeAttribute('data-reach');
  figure.dispatchEvent(new Event(FRAME_SETTLE));
}

interface FrameShared {
  collectionName: string;
  total: number;
  canHover: boolean;
  /** Marks the hovered frame on the DOM. The dim and the inner zoom are CSS
   *  off that attribute: a pointer move must not re-render forty cells on the
   *  thread Lenis and Mapbox are already on. */
  onHover: (element: HTMLElement | null) => void;
  /** Called with the frame's own element, so the viewer can open out of it. */
  onOpen: (index: number, element: HTMLElement | null) => void;
}

/** A slot's caption, printed under its frames: the numbers in full ink, a
 *  frame's own place after its number where it is not the story's. */
function CaptionText({ frames, places }: { frames: readonly number[]; places: readonly string[] }) {
  return (
    <>
      {slotCaption(frames, places).map((part, index) => (
        <span key={part.no} className="story-cap__part">
          {index > 0 && <span aria-hidden="true" className="story-cap__sep">·</span>}
          <b>{part.no}</b>
          {part.place && <span>{part.place}</span>}
        </span>
      ))}
    </>
  );
}

function StoryFrame({
  photo,
  index,
  kind,
  style,
  arrive,
  armed,
  order,
  caption,
  sizes,
  wide,
  eager,
  place,
  shared,
}: {
  photo: Photo;
  /** 0-based position in the story's frames. */
  index: number;
  kind: SlotKind;
  /** The box as CSS custom properties (global.css, Story block). */
  style: CSSProperties;
  /** How it arrives, dealt by the plan; none for frame 01, which grows. */
  arrive: SlotEntrance | null;
  /** Hydrated: a frame below the fold may now wait for the reader. */
  armed: boolean;
  /** Position within its slot: a pair's second frame follows the first by
   *  the entrance's stagger. */
  order: number;
  caption: ReactNode;
  sizes: string;
  /** The frame can be the width of a large window (a screen-high landscape,
   *  frame 01): its candidates run to 3600px. */
  wide: boolean;
  eager: boolean;
  /** The frame's own place, for its accessible name. */
  place: string;
  shared: FrameShared;
}) {
  const reduce = useReducedMotion();
  const [figureRef, reach] = useFrameReach<HTMLElement>(armed && !!arrive, !!reduce);
  const imageRef = useRef<HTMLImageElement>(null);
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    const image = imageRef.current;
    setHasError(!!image?.complete && image.naturalWidth === 0);
  }, [photo.imageUrl]);
  // The entrance plays on the commit that shows the frame, before it is
  // painted, so its first keyframe is what the reader first sees. It leaves
  // nothing behind (fill: backwards), and once it has played the frame is
  // put back at rest (its blades unmounted); an unmount cancels it.
  useLayoutEffect(() => {
    const figure = figureRef.current;
    if (reach !== 'shown' || !arrive || !figure) return;
    const animations = playEntrance(figure, {
      entrance: arrive.entrance,
      from: arrive.from,
      delay: order * arrive.stagger,
      phone: window.innerWidth < 1024,
      tall: kind === 'SCREEN' || kind === 'PAGE' || kind === 'DIPTYCH',
    });
    let live = true;
    Promise.all(animations.map((animation) => animation.finished)).then(() => {
      if (live) figure.dispatchEvent(new Event(FRAME_SETTLE));
    }, () => {});
    return () => {
      live = false;
      animations.forEach((animation) => animation.cancel());
    };
    // Once, when it is shown: the rest of what it reads is fixed by then.
  }, [reach]);
  const ladder = wide ? [480, 800, 1200, 1600, 2200, 2800, 3600] : [480, 800, 1200, 1600, 2200, 2800];
  const srcSet = ladder.map((w) => `${photo.imageUrl}?auto=format&w=${w}&q=82 ${w}w`).join(', ');
  // What is announced: the frame's number, its written title if it has one
  // (every Sanity title today is machine-made, so none do) and its place.
  const workTitle = photoDescription(photo);
  const accessibleLabel = [`Frame ${pad2(index + 1)}`, workTitle, place || shared.collectionName].filter(Boolean).join(', ');
  // On touch devices the grid is never dimmed: a tap would flash the dim
  // before the viewer opened.
  const interactiveHover = shared.canHover && !reduce;
  // A still press gives the frame a hair; a press that travels (a swipe, a
  // selection) lets it straight back, on a tween (see usePressGive).
  const pressGive = usePressGive(interactiveHover);
  // The shutter's blades exist only for a frame that will fire one: never in
  // the server's HTML, never at rest.
  const blades = arrive?.entrance === 'shutter' && reach !== 'rest';

  return (
    // The figure owns the placement only. The photograph and its caption are
    // two different kinds of thing and do not arrive as one: the picture
    // comes up, and the caption is printed under it a beat later. The
    // button wraps only the image — a caption inside the control would be
    // read as part of its name. What the frame looks like while it waits is
    // CSS off `data-reach` (global.css, Story block); how it arrives is
    // playEntrance.
    <figure
      ref={figureRef}
      className={`story-fig story-fig--${kind.toLowerCase()}`}
      style={style}
      data-arrive={arrive?.entrance}
      data-reach={reach === 'rest' ? undefined : reach}
    >
      <div className="story-fig__plate">
        <motion.button
          type="button"
          {...(interactiveHover && {
            onPointerEnter: (event: ReactPointerEvent<HTMLButtonElement>) => shared.onHover(event.currentTarget),
            onPointerLeave: () => shared.onHover(null),
            onFocus: (event: FocusEvent<HTMLButtonElement>) => shared.onHover(event.currentTarget),
            onBlur: () => shared.onHover(null),
            onPointerDown: pressGive.onPointerDown,
            style: { scale: pressGive.scale },
          })}
          {...(!interactiveHover && !reduce && {
            whileTap: { opacity: 0.9 },
          })}
          onClick={(event) => shared.onOpen(index, event.currentTarget)}
          data-frame-index={index}
          aria-label={`Open ${accessibleLabel}`}
          className="story-frame story-focus group relative block w-full cursor-pointer overflow-hidden text-left"
        >
          {hasError && (
            <span className="story-frame__error font-ui">Frame unavailable</span>
          )}
          {/* The file's own shape from its width and height: the box is
              right before a byte of the picture has arrived. */}
          <img
            ref={imageRef}
            onError={() => setHasError(true)}
            src={`${photo.imageUrl}?auto=format&w=1200&q=82`}
            srcSet={srcSet}
            sizes={sizes}
            alt={accessibleLabel}
            width={photo.width}
            height={photo.height}
            className={`block h-auto w-full transition-opacity duration-500 ${hasError ? 'opacity-0' : ''}`}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : undefined}
            decoding="async"
            draggable={false}
          />
        </motion.button>
        {blades && (
          <span className="story-shutter" aria-hidden="true">
            {SHUTTER_BLADE_KEYS.map((key) => <span key={key} className="story-shutter__blade" />)}
          </span>
        )}
      </div>
      {caption && (
        // Printed under the frame once the picture reads as there.
        <figcaption className="story-cap font-ui">{caption}</figcaption>
      )}
    </figure>
  );
}

/** The story's words, as plain paragraphs: Sanity's introduction when it has
 *  one, else the owner-approved narrative (EDITORIAL_FALLBACKS), else the
 *  description. Paragraph 1 is the lede, paragraph 2 is Part II. */
function storyParagraphs(collection: Collection): string[] {
  const written = (collection.introduction ?? [])
    .map((block) => (block.children ?? []).map((span) => span.text).join('').trim())
    .filter(Boolean);
  if (written.length) return written;
  const fallback = collection.slug ? EDITORIAL_FALLBACKS[collection.slug] : null;
  if (fallback?.length) return fallback;
  return collection.description ? [collection.description] : [];
}

/** A paragraph that ends a section: a small square of ink after its last word. */
const EndMarked = ({ text }: { text: string }) => (
  <p>
    {text}
    <span className="story-endmark" aria-hidden="true" />
  </p>
);

/** The phone's width for a frame (below 1024px the slots stack). */
function phoneWidth(kind: SlotKind, ratios: readonly number[], frames: readonly number[], at: number): string {
  if (kind === 'DIPTYCH') {
    // Touching at one height: the window's width shared out by ratio, or
    // (a window wider than it is tall) the screen's height under the head.
    const sum = frames.reduce((total, frame) => total + ratios[frame], 0);
    const r = ratios[frames[at]];
    return `min(calc(100vw * ${(r / sum).toFixed(6)}), calc((100svh - var(--story-head) - 40px) * ${r.toFixed(6)}))`;
  }
  return '';
}

/** `sizes` for a frame: its box at the design window as a share of the
 *  width, and the phone's share. */
function frameSizes(kind: SlotKind, desktopShare: number, ratios: readonly number[], frames: readonly number[], at: number): string {
  let phone = 100;
  if (kind === 'DIPTYCH') phone = (ratios[frames[at]] / frames.reduce((total, frame) => total + ratios[frame], 0)) * 100;
  else if (kind === 'SMALL' || kind === 'LEDE') phone = 58;
  else if (kind === 'COLUMN' || kind === 'PART' || kind === 'LEDE2') phone = 83;
  else if (kind === 'PAIR') phone = at === 0 ? 100 : 80;
  return `(min-width: 1024px) ${Math.max(10, Math.round(desktopShare * 100))}vw, ${Math.round(phone)}vw`;
}

/** One slot of the story: its frames and its words, placed by its boxes. */
function SlotView({
  box,
  photos,
  ratios,
  places,
  paragraphs,
  quote,
  arrive,
  armed,
  shared,
}: {
  box: SlotBoxes;
  photos: readonly Photo[];
  ratios: readonly number[];
  places: readonly string[];
  paragraphs: readonly string[];
  quote: string;
  /** How its frames arrive (planEntrances); a pair shares one. */
  arrive: SlotEntrance | null;
  armed: boolean;
  shared: FrameShared;
}) {
  const { slot } = box;
  const { kind } = slot;
  const portraits = slot.frames.length === 2 && slot.frames.every((frame) => !isLandscape(ratios[frame]));
  const textStyle = (at: number) => {
    const text = box.text[at];
    return text ? ({ '--tx': css(text.x), '--tw': css(text.w), '--ty': css(text.y) } as CSSProperties) : undefined;
  };
  const figure = (at: number) => {
    const frame = box.frames[at];
    const photo = photos[frame.frame];
    if (!photo) return null;
    const style = {
      '--fx': css(frame.x),
      '--fw': css(frame.w),
      '--fy': css(frame.y),
      '--r': ratios[frame.frame].toFixed(6),
      '--pw': phoneWidth(kind, ratios, slot.frames, at) || undefined,
    } as CSSProperties;
    // One keyed caption for a pair or a diptych, under the first frame.
    const captionFrames = PAIRED_KINDS.has(kind) ? (at === 0 ? slot.frames : null) : [frame.frame];
    return (
      <StoryFrame
        key={photo._id}
        photo={photo}
        index={frame.frame}
        kind={kind === 'LEDE' ? 'SMALL' : kind === 'LEDE2' || kind === 'PART' ? 'COLUMN' : kind}
        style={style}
        arrive={arrive}
        armed={armed}
        order={at}
        caption={captionFrames ? <CaptionText frames={captionFrames} places={places} /> : null}
        sizes={frameSizes(kind, frame.w.v / 1728, ratios, slot.frames, at)}
        wide={kind === 'SCREEN'}
        eager={false}
        place={places[frame.frame] ?? ''}
        shared={shared}
      />
    );
  };
  const frames = box.frames.map((_, at) => figure(at));
  const [lede, part2] = paragraphs;
  return (
    <section
      className="story-slot"
      data-kind={kind}
      data-side={slot.side}
      data-pp={portraits ? 'true' : undefined}
      style={{ '--slot-top': css(box.top) } as CSSProperties}
    >
      {kind === 'LEDE' && lede && (
        <div className="story-text story-lede font-serif" style={textStyle(0)}><p>{lede}</p></div>
      )}
      {kind === 'LEDE2' && (
        <>
          {lede && <div className="story-text story-lede font-serif" style={textStyle(0)}><p>{lede}</p></div>}
          {part2 && (
            <div className="story-text story-prose font-serif" style={textStyle(1)}>
              <span className="story-part-no font-serif" aria-hidden="true">II</span>
              <EndMarked text={part2} />
            </div>
          )}
        </>
      )}
      {kind === 'PART' && part2 && (
        <div className="story-text story-prose font-serif" style={textStyle(0)}>
          <span className="story-part-no font-serif" aria-hidden="true">II</span>
          <EndMarked text={part2} />
        </div>
      )}
      {kind === 'QUOTE' && quote && (
        <blockquote className="story-text story-quote font-serif" style={textStyle(0)}>
          <p>{`\u201C${quote}\u201D`}</p>
        </blockquote>
      )}
      {frames}
    </section>
  );
}

const PAIRED_KINDS: ReadonlySet<SlotKind> = new Set(['PAIR', 'DIPTYCH']);

const pad2 = (value: number) => String(value).padStart(2, '0');

/** How far the reader is through the story, held once for the whole shell
 *  and printed by the rail's kept stub: frames read (fractional — the ink
 *  in the ticks), the frame number as it rolls (fractional while it turns),
 *  and the whole frame it is turning to (whose city is printed). 0 is the
 *  stub before the story is uncovered: no ink, "Frame 00". */
interface StubReading {
  ink: MotionValue<number>;
  shown: MotionValue<number>;
  frame: MotionValue<number>;
}

const cityLabel = (city: string | undefined) => (city ? `${city}\u00a0·\u00a0` : '');

/* The frame's own city is reprinted, not swapped: the old name lifts off
   (120ms, easing in — it is leaving; global.css `.is-lifting`) and the new
   one is inked in behind it (200ms, house expo). The text changes only while
   nothing is printed, so the line's width moves unseen. A flick through
   several frames prints only the last. */
const cityPrints = new WeakMap<HTMLElement, { text: string; want: string; timer: number }>();
function printCity(element: HTMLElement | null, label: string, reduce: boolean) {
  if (!element) return;
  let print = cityPrints.get(element);
  if (!print) {
    print = { text: element.textContent ?? '', want: '', timer: 0 };
    cityPrints.set(element, print);
  }
  print.want = label;
  if (reduce) {
    window.clearTimeout(print.timer);
    print.timer = 0;
    element.classList.remove('is-lifting');
    element.textContent = label;
    print.text = label;
    return;
  }
  // Lifting already: it prints whatever is wanted when it is off.
  if (print.timer || label === print.text) return;
  element.classList.add('is-lifting');
  const lifting = print;
  lifting.timer = window.setTimeout(() => {
    lifting.timer = 0;
    element.textContent = lifting.want;
    lifting.text = lifting.want;
    element.classList.remove('is-lifting');
  }, 120);
}

/* ── The kept stub's print ──
   What the stub prints, from props alone: the rail's stub prints it, and
   the copy that flies home at the close is cloned from that print. The same
   card as the homepage stub (global.css: .story-stub, just above
   .archive-ticket-stub): the chapter's ordinal in Fraunces, then place,
   region and year — only fields the archive holds. Under them, one tick per
   frame of this story, inked as the reader passes it, and the frame the
   reader is on.
   What moves on it — the ink in the ticks (`--p` against each tick's `--k`),
   the frame number (a strip of every value in a one-line window, global.css
   `.rolling-figure`), the frame's own city — is written from the shared
   reading straight onto the DOM, never through a render: React prints the
   first values once and never writes them again, so a re-render can never
   put back a value the reading has moved on from. */
function StubFace({
  chapter,
  ordinal,
  total,
  frames,
  cities,
  reading,
  reduce,
}: {
  chapter: Pick<Collection, 'name' | 'location' | 'region' | 'year'>;
  ordinal: string;
  total: string;
  frames: number;
  /** The frame's own place per frame number (0 is the arrival's "00",
   *  printed with the first frame's), '' where it is the chapter's. */
  cities: string[];
  reading: StubReading;
  reduce: boolean;
}) {
  const ticksRef = useRef<HTMLSpanElement>(null);
  const stripRef = useRef<HTMLSpanElement>(null);
  const cityRef = useRef<HTMLSpanElement>(null);
  const [first] = useState(() => ({
    ink: reading.ink.get(),
    shown: reading.shown.get(),
    frame: reading.frame.get(),
  }));
  const paintInk = (ink: number) => ticksRef.current?.style.setProperty('--p', ink.toFixed(4));
  const paintShown = (shown: number) => {
    if (stripRef.current) stripRef.current.style.transform = `translateY(${(-shown).toFixed(4)}em)`;
  };
  useMotionValueEvent(reading.ink, 'change', paintInk);
  useMotionValueEvent(reading.shown, 'change', paintShown);
  useMotionValueEvent(reading.frame, 'change', (frame) => printCity(cityRef.current, cityLabel(cities[frame]), reduce));
  // A print whose reading moved between its render and its commit catches
  // up before it is painted.
  useLayoutEffect(() => {
    paintInk(reading.ink.get());
    paintShown(reading.shown.get());
    const city = cityRef.current;
    const label = cityLabel(cities[reading.frame.get()]);
    if (city && city.textContent !== label) city.textContent = label;
    // Once, at mount: afterwards the subscriptions above keep it current.
  }, []);

  // Guarded as the rest of this file guards it: not every record's
  // `location` is a string.
  const location = typeof chapter.location === 'string' ? chapter.location.trim() : '';
  // What the homepage stub prints under REGION: the region, else the place.
  const region = (typeof chapter.region === 'string' && chapter.region.trim()) || location;
  const stubRows: Array<[string, string]> = [];
  if (region) stubRows.push(['Region', region]);
  if (chapter.year) stubRows.push(['Year', String(chapter.year)]);

  return (
    <>
      <div className="story-stub__head">
        <div className="story-stub__admission">
          <span className="story-stub__no font-serif">{ordinal}</span>
          <span className="story-stub__of">/ {total} · admission</span>
        </div>
        {stubRows.length > 0 && (
          <dl className="story-stub__rows">
            {stubRows.map(([label, value]) => (
              <div key={label} className="story-stub__row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <span className="story-stub__rule" />
      <div className="story-stub__line">
        <span className="story-stub__place">{chapter.name}</span>
        <span className="story-stub__frame">
          {/* The frame's own place, printed only when it is not the
              chapter's (New York's frames are Midtown and Manhattan; Miami's
              are all Miami). Always in the line, empty when there is none,
              so it can be reprinted without a render. */}
          <span ref={cityRef} className="story-stub__city">{cityLabel(cities[first.frame])}</span>
          <span className="story-stub__label">Frame&nbsp;</span>
          <span className="story-stub__count rolling-figure">
            <span className="rolling-figure__sizer">{pad2(frames)}</span>
            <span className="rolling-figure__window">
              <span
                ref={stripRef}
                className="rolling-figure__strip"
                style={{ transform: `translateY(${(-first.shown).toFixed(4)}em)` }}
              >
                {Array.from({ length: frames + 1 }, (_, value) => (
                  <span key={value}>{pad2(value)}</span>
                ))}
              </span>
            </span>
          </span>
          <span className="story-stub__total">&nbsp;/ {pad2(frames)}</span>
        </span>
      </div>
      <span
        ref={ticksRef}
        className="story-stub__ticks"
        style={{ '--p': first.ink.toFixed(4) } as CSSProperties}
      >
        {Array.from({ length: frames }, (_, index) => (
          <i key={index} style={{ '--k': index } as CSSProperties} />
        ))}
      </span>
    </>
  );
}

/* ── The kept stub ──
   The homepage cover is a ticket; opening the story tears it, and this is
   the half the reader keeps, at the foot of the rail (columns 1–3, bottom
   left, from the opening spread to the end page), where a blog widget used
   to print "Reading Progress 62%". Printed on the chapter's own card stock,
   keyed by its slug, holes down its torn edge; its number is the ticket's
   (the homepage's chapter order).
   Read continuously and derived: each row's top is an offsetTop chain inside
   the story's own scroller, measured on mount and on resize only; a scroll
   reads one number (the scroller's scrollY, already tracked for the phone's
   header bar) against those lines. The reading line's travel from a row's
   top to the next row's top is shared out over the row's frames in order —
   a row is the unit because its frames are bottom-aligned (a portrait
   beside a landscape starts higher up the page, and lighting frames by
   their own tops would light them out of order), and sharing it out means a
   two-frame row fills its two ticks one after the other, never as a pair.
   The ink shown chases that value (STUB_INK_TAU) in a frame loop the scroll
   starts and that stops at rest; the number rolls after it (STUB_ROLL_TAU).
   It used to commit whole rows: frozen for most of the scroll, then two or
   three ticks lit together, and the number jumped 01 → 03.
   It arrives only once the story has loaded — the opening spread set, the
   type on it and the map developing. Until then the card waits below the
   fold (STUB_WAITING), so nothing stub-like is on the plate as it grows or
   on the spread as it sets; the owner found the slip resting at the foot of
   the loading screen wrong (2026-09-27). Then it is handed in: it rises
   into its place from under the fold, tipped as it is carried and set down
   square (DUR.settle, house expo), printed as the ticket printed it, and its
   ink counts up from nothing to where the reader stands. It used to fly in
   from the homepage ticket in the click. */
function KeptStub({
  stubRef,
  containerRef,
  gridRef,
  scrollY,
  rows,
  frames,
  chapter,
  ordinal,
  total,
  cities,
  reading,
  armed,
  released,
  reduce,
}: {
  stubRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
  /** The story scroller's scrollTop (useScroll's `scrollY` on the container). */
  scrollY: MotionValue<number>;
  /** Frame indices per slot, in reading order (`slotRows`). */
  rows: number[][];
  frames: number;
  chapter: Pick<Collection, 'name' | 'slug' | 'location' | 'region' | 'year'>;
  ordinal: string;
  total: string;
  cities: string[];
  reading: StubReading;
  /** False only while a standalone /works page is still its server HTML: the
   *  stub is sent waiting below the fold, and is handed in from hydration
   *  on, like every other way in. */
  armed: boolean;
  /** The story has loaded: until then the stub waits below the fold at
   *  nothing read. */
  released: boolean;
  reduce: boolean;
}) {
  /** Per row: its top edge in the scroller's content, where it ends (the
   *  next row's top; the last row's own foot), and its number of frames. */
  const linesRef = useRef<Array<{ top: number; end: number; len: number }> | null>(null);
  const viewRef = useRef(0);
  const armedRef = useRef(armed);
  armedRef.current = armed;
  const releasedRef = useRef(released);
  releasedRef.current = released;
  const kickRef = useRef<() => void>(() => {});

  // Frames read, fractional, from the scroll offset alone.
  const readAt = useCallback((scrollTop: number) => {
    const lines = linesRef.current;
    if (!lines) return 0;
    const line = scrollTop + viewRef.current * STORY_READING_LINE;
    let read = 0;
    for (const row of lines) {
      const share = Math.min(1, Math.max(0, (line - row.top) / Math.max(1, row.end - row.top)));
      read += share * row.len;
      if (share < 1) break;
    }
    return Math.min(frames, read);
  }, [frames]);

  const measure = useCallback(() => {
    const root = containerRef.current;
    const stub = stubRef.current;
    // Below lg the stub is not drawn and nothing is measured or compared.
    if (!root || !stub || stub.offsetParent === null) {
      linesRef.current = null;
      return;
    }
    viewRef.current = root.clientHeight;
    // One frame per index on the page (the end page's Plates carry their own
    // attribute); take the laid-out one, in case a layout ever hides one.
    const boxes = new Map<number, { top: number; bottom: number }>();
    root.querySelectorAll<HTMLElement>('[data-frame-index]').forEach((node) => {
      if (node.offsetParent === null) return;
      const index = Number(node.dataset.frameIndex);
      if (!Number.isFinite(index) || boxes.has(index)) return;
      let top = 0;
      let step: HTMLElement | null = node;
      while (step && step !== root) {
        top += step.offsetTop;
        step = step.offsetParent instanceof HTMLElement ? step.offsetParent : null;
      }
      if (step !== root) return;
      boxes.set(index, { top, bottom: top + node.offsetHeight });
    });
    const spans = rows.map((row) => {
      let top = Infinity;
      let bottom = -Infinity;
      for (const index of row) {
        const box = boxes.get(index);
        if (!box) continue;
        top = Math.min(top, box.top);
        bottom = Math.max(bottom, box.bottom);
      }
      return { top, bottom, len: row.length };
    });
    // A row that is not laid out ends the reading there (its top is
    // Infinity, so nothing past it is ever read).
    linesRef.current = spans.map((span, index) => ({
      top: span.top,
      end: index + 1 < spans.length && Number.isFinite(spans[index + 1].top) ? spans[index + 1].top : span.bottom,
      len: span.len,
    }));
    kickRef.current();
  }, [containerRef, rows, stubRef]);

  // A passive effect, not a layout one: on a /works page the scroller and the
  // grid mount in the same commit as the stub, and a child's layout effect
  // runs before its ancestors' refs are attached — the scroller would still
  // be null.
  useEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    // The grid's height moves when a caption's face arrives or the window
    // changes width; the scroller's when the window changes height.
    const observer = new ResizeObserver(() => measure());
    if (gridRef.current) observer.observe(gridRef.current);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [containerRef, gridRef, measure]);

  // The frame loop: started by a scroll (or a measure, or the release), it
  // runs while what is shown is still catching up and stops at rest.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const step = (now: number) => {
      raf = 0;
      if (!armedRef.current) return;
      const dt = Math.min(64, now - last);
      last = now;
      const goal = releasedRef.current ? readAt(scrollY.get()) : 0;
      let ink = reading.ink.get();
      if (reduce) ink = goal;
      else {
        ink += (goal - ink) * (1 - Math.exp(-dt / STUB_INK_TAU));
        if (Math.abs(goal - ink) < 0.002) ink = goal;
      }
      // The number names the frame being read — the tick that is filling —
      // and turns from the ink SHOWN, so it turns exactly as its tick fills.
      const want = ink <= 0 ? 0 : Math.min(frames, Math.floor(ink) + 1);
      let shown = reading.shown.get();
      if (reduce) shown = want;
      else {
        shown += (want - shown) * (1 - Math.exp(-dt / STUB_ROLL_TAU));
        if (Math.abs(want - shown) < 0.004) shown = want;
      }
      reading.ink.set(ink);
      reading.shown.set(shown);
      if (reading.frame.get() !== want) reading.frame.set(want);
      if (ink !== goal || shown !== want) raf = requestAnimationFrame(step);
    };
    kickRef.current = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    };
    return () => {
      cancelAnimationFrame(raf);
      kickRef.current = () => {};
    };
  }, [frames, readAt, reading, reduce, scrollY]);

  // Until the story has loaded the stub has read nothing; arming a hydrated
  // /works page drops its print there at once, below the fold.
  useEffect(() => {
    if (!armed) return;
    if (!released && !reduce) {
      reading.ink.set(0);
      reading.shown.set(0);
      reading.frame.set(0);
    }
    kickRef.current();
  }, [armed, released, reduce, reading]);

  useMotionValueEvent(scrollY, 'change', () => kickRef.current());

  // Waiting below the fold from the first paint — a /works page's server
  // HTML included, where it is a decorative card out of sight, not page
  // content held back — and handed in once the story has loaded. Reduced
  // motion seats it at once, from hydration on (the server cannot know, and
  // the hydrating render must match what it sent).
  const waiting = !released && !reduce;
  return (
    <motion.div
      ref={stubRef}
      className="story-stub font-ui"
      aria-hidden="true"
      style={stockStyle(chapter.slug)}
      initial={armed && reduce ? false : STUB_WAITING}
      animate={waiting ? STUB_WAITING : STUB_SEATED}
      transition={waiting || reduce ? { duration: 0 } : { duration: DUR.settle, ease: EASE.arrive }}
    >
      <div className="story-stub__print">
        <StubFace
          chapter={chapter}
          ordinal={ordinal}
          total={total}
          frames={frames}
          cities={cities}
          reading={reading}
          reduce={reduce}
        />
      </div>
    </motion.div>
  );
}

/** Moves the three shared marks of a travelling print from where the rail
 *  prints them to where the homepage stub printed them, by `--travel-home`
 *  (0 = the rail's place, 1 = the homepage's), so a single print carries
 *  them the whole way and nothing is ever printed twice. */
function aimSharedMarks(print: HTMLElement, home: StubMarks) {
  const kept = readStubMarks(print, 'story-stub');
  if (!kept) return;
  for (const mark of STUB_MARKS) {
    const node = print.querySelector<HTMLElement>(`.story-stub__${mark}`);
    if (!node) continue;
    const dx = home[mark].x - kept[mark].x;
    const dy = home[mark].y - kept[mark].y;
    node.style.translate = `calc(var(--travel-home, 0) * ${dx.toFixed(2)}px) calc(var(--travel-home, 0) * ${dy.toFixed(2)}px)`;
  }
}

/** The homepage stub, copied for the rows only it prints. Its framer
 *  styles (the tear's counter-pull and dimming) and the attribute that hides
 *  the original are not part of the print. */
function copyHomeStub(stub: PlateStub) {
  const copy = stub.node.cloneNode(true) as HTMLElement;
  copy.removeAttribute('style');
  copy.removeAttribute('data-kept-away');
  copy.removeAttribute('data-kept-returning');
  return copy;
}

/* ── The stub goes home ──
   Closing a story that grew out of its homepage ticket flies the kept half
   back onto it while the panel drops: the rail's card, as the reader left it
   (ink, frame, city), travels to the ticket (stubTravelEase), tipping the
   other way to the way it was handed in. The rail's own parts leave late
   (160ms from +380ms, easing in) and the homepage's rows arrive late (240ms
   from +440ms, expo), so the card is never blank in flight; the shared marks
   slide back. Seated, the ticket gets its real stub back under the copy —
   the same print, in the same place — so the copy only has to get out of the
   way: a flick of a fade (DUR.flick, EASE.fade), cut to nothing by the
   reader's first wheel, key or touch. It used to dissolve over 420ms easing
   in, near full strength for most of it, and a reader who scrolled straight
   on watched two stubs part. Built on the page rather than in the story: the
   story is leaving, and this outlives it. The rail's rect is read once, here,
   where the stub is. */
function flyStubHome(rail: HTMLElement, home: PlateStub, slug: string | undefined) {
  const from = rail.getBoundingClientRect();
  const to = home.box;
  const face = rail.querySelector('.story-stub__print');
  if (!face || !from.width || !from.height) return false;
  const paper = document.createElement('div');
  paper.className = 'story-stub story-stub-travel story-stub-travel--returning font-ui';
  paper.setAttribute('aria-hidden', 'true');
  paper.style.setProperty('--stub-paper', stockPaper(slug));
  const printOf = (part: 'is-shared' | 'is-kept') => {
    const print = document.createElement('div');
    print.className = `story-stub story-stub--print ${part}`;
    print.style.width = `${from.width}px`;
    print.appendChild(face.cloneNode(true));
    return print;
  };
  const homePrint = document.createElement('div');
  homePrint.className = 'story-stub-travel__home';
  homePrint.style.width = `${to.width}px`;
  homePrint.style.height = `${to.height}px`;
  homePrint.style.opacity = '0';
  homePrint.appendChild(copyHomeStub(home));
  const kept = printOf('is-kept');
  const shared = printOf('is-shared');
  paper.append(homePrint, kept, shared);
  const place = (t: number) => {
    const lerp = (a: number, b: number) => a + (b - a) * t;
    paper.style.width = `${lerp(from.width, to.width)}px`;
    paper.style.height = `${lerp(from.height, to.height)}px`;
    const tilt = t >= 1 ? 0 : -STUB_TRAVEL_TILT * Math.sin(Math.PI * t);
    paper.style.transform = `translate(${lerp(from.x, to.x)}px, ${lerp(from.y, to.y)}px) rotate(${tilt.toFixed(3)}deg)`;
    paper.style.setProperty('--travel-home', t.toFixed(4));
    paper.style.setProperty('--travel-kept', (1 - t).toFixed(4));
  };
  place(0);
  document.body.appendChild(paper);
  // The copy is fixed, but the ticket it lands on is on the page: once Lenis
  // starts again (+~690ms, just before the copy seats) a scroll moves the
  // ticket away. The copy follows the page by the scroll offset until it is
  // gone, and a copy the page moved under is cut at once — the ticket's own
  // scroll-linked drift is not in that offset. The offset is read in the
  // page's own scroll event, before the frame's writes (read in a frame loop
  // after the flight had written its box, it forced a layout every frame).
  const scrollAtStart = window.scrollY;
  let fade: Animation | null = null;
  let scrolled = false;
  let seated = false;
  const follow = () => {
    if (!paper.isConnected) return;
    const offset = scrollAtStart - window.scrollY;
    paper.style.translate = `0 ${offset.toFixed(1)}px`;
    if (!scrolled && Math.abs(offset) > 1) {
      scrolled = true;
      if (seated) cut();
    }
  };
  const cut = () => {
    fade?.cancel();
    paper.remove();
    window.removeEventListener('scroll', follow);
    window.removeEventListener('wheel', cut, true);
    window.removeEventListener('keydown', cut, true);
    window.removeEventListener('touchstart', cut, true);
  };
  window.addEventListener('scroll', follow, { passive: true });
  aimSharedMarks(shared, home.marks);
  // Normally away since the kept half was handed into the rail; set here
  // too, so the ticket can never show its stub under the copy on its way.
  home.node.dataset.keptAway = 'true';
  home.node.dataset.keptReturning = 'true';
  rail.style.visibility = 'hidden';
  kept.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, delay: 380, easing: CSS_EASE.leave, fill: 'forwards' });
  homePrint.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 440, easing: CSS_EASE.arrive, fill: 'forwards' });
  const seat = () => {
    if (seated) return;
    seated = true;
    delete home.node.dataset.keptAway;
    delete home.node.dataset.keptReturning;
    // The real stub shows in this same frame, so whichever way the copy goes
    // there is never a frame with neither.
    if (scrolled) {
      cut();
      return;
    }
    fade = paper.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR_MS.flick, easing: CSS_EASE.fade, fill: 'forwards' });
    fade.finished.then(cut, cut);
    window.addEventListener('wheel', cut, { capture: true, passive: true });
    window.addEventListener('keydown', cut, true);
    window.addEventListener('touchstart', cut, { capture: true, passive: true });
  };
  animate(0, 1, { duration: STUB_TRAVEL_MS / 1000, ease: stubTravelEase, onUpdate: place, onComplete: seat });
  // However the flight ends, the ticket gets its stub back.
  window.setTimeout(seat, STUB_TRAVEL_MS + 200);
  window.setTimeout(cut, STUB_TRAVEL_MS + 1200);
  return true;
}

/** A small drawn arrow: the running head's Back and the Next line's. Drawn,
 *  not typed, so it never falls back to another face. */
function Arrow({ left = false, className }: { left?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 10" width="16" height="10" aria-hidden="true" focusable="false">
      <path
        d={left ? 'M15 5H1.5M5.5 1 1.5 5l4 4' : 'M1 5h13.5M10.5 1l4 4-4 4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  );
}

/** Photographs · Camera · Map: the opening spread's credits. The map credit
 *  is the posters' own, reprinted because the map page crops past it. */
function Credits({ camera, map }: { camera: string; map: boolean }) {
  const [site, notice] = MAP_CREDIT.split(' · ');
  return (
    <dl className="story-credits">
      <div>
        <dt className="font-ui">Photographs</dt>
        <dd className="font-serif">Ryan Xu</dd>
      </div>
      {camera && (
        <div>
          <dt className="font-ui">Camera</dt>
          <dd className="font-serif">{camera}</dd>
        </div>
      )}
      {map && (
        <div>
          <dt className="font-ui">Map</dt>
          <dd className="font-serif">
            {site}
            <small className="font-ui">{notice}</small>
          </dd>
        </div>
      )}
    </dl>
  );
}

/* ── The opening spread's map page ──
   The left page of the spread, printed on the chapter's ticket stock: the
   place's terrain in white ink, the story's number, its title, and (for a
   portrait frame 01, and on the phone) the dek and the credits. On desktop
   it is pinned (position: sticky, global.css .story-spread) and the story's
   paper rises over it as the reader scrolls — the curtain, pure CSS. On a
   story that arrives by a grow, it is sent `waiting` (map undeveloped, type
   unset) and sets once the photograph has landed (`data-set` on the story,
   global.css); every other way in paints it set. */
function OpeningSpread({
  name,
  heading,
  ordinal,
  total,
  dek,
  camera,
  terrain,
  entering,
  waiting,
}: {
  name: string;
  heading: 'h1' | 'h2';
  ordinal: string;
  total: string;
  dek: string;
  camera: string;
  terrain: string;
  /** Arrived by a grow: the map develops once it has landed and decoded. */
  entering: boolean;
  waiting: boolean;
}) {
  const Heading = heading;
  const terrainRef = useRef<HTMLImageElement>(null);
  // Whether the map is still on its way. Read once at mount on a grown
  // arrival (warmTerrain has normally decoded it during the grow); never on
  // any other way in, which paints the map as sent.
  const [decoding, setDecoding] = useState(entering && !!terrain);
  useLayoutEffect(() => {
    const image = terrainRef.current;
    if (image?.complete && image.naturalWidth > 0) setDecoding(false);
  }, []);
  return (
    <section className="story-spread" aria-label={`${name}, opening`}>
      {/* Pending: the map and the gradient that sets the type on it
          develop together once the photograph has landed, so the grow's
          flat stock hands over to a flat stock. */}
      <div className="story-spread__map" data-pending={waiting || decoding ? 'true' : undefined}>
        {terrain && (
          <img
            ref={terrainRef}
            className="story-terrain-ink story-spread__terrain"
            src={terrain}
            alt=""
            width={2000}
            height={1126}
            decoding="async"
            fetchPriority="high"
            draggable={false}
            onLoad={() => setDecoding(false)}
          />
        )}
      </div>
      <div className="story-spread__type">
        <p className="story-kicker font-ui">{ordinal} / {total}</p>
        <Heading className="story-title font-serif">
          <span className="story-title__line">{name}</span>
        </Heading>
        <div className="story-spread__meta">
          {dek && <p className="story-dek font-serif">{dek}</p>}
          <Credits camera={camera} map={!!terrain} />
        </div>
      </div>
      {/* The running head takes paper once this passes under it (phone:
          the stock page is in the flow there). */}
      <span className="story-sentinel story-sentinel--phone" data-head-sentinel aria-hidden="true" />
    </section>
  );
}

/* ── The end page ──
   Printed on the chapter's stock, as the map page is: the Plates (every
   frame at its own ratio, numbered, each opening the viewer), the terrain
   plate whole with its credit, the facts, the next story — its cover at its
   own ratio, its number, "Next, Orlando" and the one lime mark in the story,
   the arrow, which arrives with the name — and two text links. Its own
   component so the in-view trigger is armed on ITS mount (the story body
   mounts only once a grow has landed). */
function EndPage({
  collection,
  photos,
  terrain,
  camera,
  position,
  frameCount,
  nextCollection,
  nextOrdinal,
  total,
  reduce,
  armed,
  onTurn,
  onOpenPlate,
  onShare,
  onTop,
  isShared,
  shareStatus,
  shareFallbackUrl,
}: {
  collection: Collection;
  photos: readonly Photo[];
  terrain: string;
  camera: string;
  position: string;
  frameCount: number;
  nextCollection: Collection | null;
  nextOrdinal: string;
  total: string;
  reduce: boolean;
  /** False only while a standalone /works page is still its server HTML:
   *  the end paints at rest and waits for the reader from hydration on. */
  armed: boolean;
  /** The card that becomes the next story's frame 01. */
  onTurn: (card: HTMLElement) => void;
  onOpenPlate: (index: number, element: HTMLElement) => void;
  onShare: () => void;
  onTop: () => void;
  isShared: boolean;
  shareStatus: string;
  shareFallbackUrl: string;
}) {
  const [nextRef, inView] = useInViewOnce<HTMLButtonElement>('0px 0px -18% 0px', 0.2);
  // Until the page is armed the end is simply there. Arming hides the Next
  // line at once (every "not yet" transition is instant), below the fold.
  const shown = inView || !armed;
  // The next story's map page is printed on its terrain. Fetch it while the
  // reader is still here, so the turn never waits on the network — on the
  // reader arriving, not on a /works page's server HTML.
  useEffect(() => {
    if (inView && nextCollection) void warmTerrain(terrainFor(nextCollection));
  }, [inView, nextCollection]);
  const region = typeof collection.region === 'string' ? collection.region.trim() : '';
  const facts: Array<[string, string]> = [
    ['Place', region && !labelsMatch(collection.name, region) ? `${collection.name}, ${region}` : collection.name],
  ];
  if (position) facts.push(['Position', position]);
  if (collection.year) facts.push(['Year', String(collection.year)]);
  facts.push(['Frames', String(frameCount)]);
  if (camera) facts.push(['Camera', camera]);
  facts.push(['Photographs', 'Ryan Xu']);
  const nextDims = nextCollection?.coverImageUrl ? fileDims(nextCollection.coverImageUrl) : null;
  const coverWaiting = { opacity: 0, y: 14, WebkitMaskPosition: '100% 0%', maskPosition: '100% 0%' };
  const coverRest = { opacity: 1, y: 0, WebkitMaskPosition: '0% 0%', maskPosition: '0% 0%' };
  // ── The Plates, in even rows (src/lib/plateRows.ts) ──
  // Measured when the strip's box changes — the column's width, the house
  // plate height, the gap — never per frame; until then (and in the server
  // HTML) the plates simply wrap. Keyed to the story, since a turn keeps
  // this component and changes its photographs.
  const platesRef = useRef<HTMLOListElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const platesKey = photos.map((photo) => photo._id).join('|');
  const [plateSet, setPlateSet] = useState<(PlateRows & { key: string }) | null>(null);
  useEffect(() => {
    const strip = platesRef.current;
    if (!strip || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const image = strip.querySelector('img');
      if (!image) return;
      const style = getComputedStyle(strip);
      const width = Number.parseFloat(style.width);
      const gap = Number.parseFloat(style.columnGap) || 0;
      // The house height, whatever fit is printed now (to 1/8 px, so the
      // plates' own rounding never moves it).
      const fit = Number.parseFloat(strip.style.getPropertyValue('--story-plate-fit')) || 1;
      const height = Math.round((Number.parseFloat(getComputedStyle(image).height) / fit) * 8) / 8;
      if (!(width > 0) || !(height > 0)) return;
      const ratios = photosRef.current.map((photo) => {
        if (photo.width && photo.height) return photo.width / photo.height;
        const dims = fileDims(photo.imageUrl);
        return dims ? dims.width / dims.height : 1.5;
      });
      const next = plateRows(ratios, height, width, gap);
      const scale = Math.floor(next.scale * 1e4) / 1e4;
      setPlateSet((current) => (
        current && current.key === platesKey && current.rows.join() === next.rows.join()
          && Math.abs(current.scale - scale) < 1e-3
          ? current
          : { rows: next.rows, scale, key: platesKey }
      ));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [platesKey]);
  const plateLayout = plateSet && plateSet.key === platesKey ? plateSet : null;
  // The plates after which a row ends (every row but the last).
  const rowEnds = new Set<number>();
  if (plateLayout && plateLayout.rows.length > 1) {
    let end = -1;
    plateLayout.rows.slice(0, -1).forEach((count) => {
      end += count;
      rowEnds.add(end);
    });
  }
  return (
    <footer className="story-end" style={stockStyle(collection.slug)}>
      <div className="story-end__plates">
        <p className="story-label font-ui">Plates</p>
        <ol
          ref={platesRef}
          className="story-plates"
          data-rows={rowEnds.size ? '' : undefined}
          style={plateLayout && plateLayout.scale < 1
            ? { ['--story-plate-fit' as never]: String(plateLayout.scale) }
            : undefined}
        >
          {photos.map((photo, index) => (
            <React.Fragment key={photo._id}>
              <li>
                <button
                  type="button"
                  className="story-plate story-focus"
                  data-plate-index={index}
                  aria-label={`Open frame ${pad2(index + 1)}`}
                  onClick={(event) => onOpenPlate(index, event.currentTarget)}
                >
                  <img
                    src={`${photo.imageUrl}?auto=format&h=200&q=70`}
                    alt=""
                    width={photo.width}
                    height={photo.height}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                  <span className="story-plate__no font-ui">{pad2(index + 1)}</span>
                </button>
              </li>
              {rowEnds.has(index) && <li className="story-plates__break" aria-hidden="true" />}
            </React.Fragment>
          ))}
        </ol>
      </div>
      {terrain && (
        <div className="story-end__map">
          <div className="story-end__terrain">
            <img
              className="story-terrain-ink"
              src={terrain}
              alt={`Map of ${collection.name}`}
              width={2000}
              height={1126}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </div>
          <p className="story-end__credit font-ui">{MAP_CREDIT}</p>
        </div>
      )}
      <dl className="story-end__facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="font-ui">{label}</dt>
            <dd className="font-serif">{value}</dd>
          </div>
        ))}
      </dl>
      {nextCollection && (
        <div className="story-end__next">
          <button
            ref={nextRef}
            type="button"
            className="story-next story-focus"
            onClick={(event) => {
              const card = event.currentTarget.querySelector<HTMLElement>('[data-next-cover]');
              onTurn(card ?? event.currentTarget);
            }}
            aria-label={`Read next story: ${nextCollection.name}`}
          >
            {nextCollection.coverImageUrl && (
              // The next story's frame 01 at its own ratio (it used to be
              // cropped to 1.6:1). It is the picture the turn grows from.
              <motion.span
                data-next-cover
                className="story-next__cover"
                style={reduce ? undefined : DEVELOP_MASK_STYLE}
                initial={reduce || !armed ? false : coverWaiting}
                animate={reduce || shown ? coverRest : coverWaiting}
                transition={reduce || !shown ? { duration: 0 } : {
                  opacity: { duration: 0.3, delay: 0.28, ease: EASE.arrive },
                  y: { duration: 0.8, delay: 0.28, ease: popEase },
                  WebkitMaskPosition: { duration: 0.8, delay: 0.28, ease: EASE.develop },
                  maskPosition: { duration: 0.8, delay: 0.28, ease: EASE.develop },
                }}
              >
                <img
                  src={`${nextCollection.coverImageUrl}?auto=format&w=900&q=80`}
                  alt=""
                  width={nextDims?.width}
                  height={nextDims?.height}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              </motion.span>
            )}
            <span className="story-next__text">
              <span className="story-next__kicker font-ui">{nextOrdinal} / {total}</span>
              {/* The name and the arrow rise together through one mask, so
                  the arrow is never on the page without its name. */}
              <span className="story-next__name font-serif">
                <motion.span
                  className="story-next__line"
                  initial={reduce || !armed ? false : { y: '112%' }}
                  animate={{ y: reduce || shown ? '0%' : '112%' }}
                  transition={{ duration: reduce || !shown ? 0 : DUR.plane, delay: reduce || !shown ? 0 : 0.12, ease: EASE.arrive }}
                >
                  <i>Next,</i> {nextCollection.name}
                  <Arrow className="story-next__arrow" />
                </motion.span>
              </span>
            </span>
          </button>
        </div>
      )}
      <div className="story-end__links">
        <button type="button" className="story-link font-ui story-focus" onClick={onShare}>
          {isShared ? 'Link copied' : 'Share this story'}
        </button>
        <button type="button" className="story-link font-ui story-focus" onClick={onTop}>
          Back to the opening
        </button>
      </div>
      <div className={shareFallbackUrl ? 'story-end__share' : 'sr-only'}>
        <p role="status" aria-live="polite" aria-atomic="true" className="font-ui">
          {shareStatus}
        </p>
        {shareFallbackUrl && (
          <input
            type="text"
            tabIndex={0}
            readOnly
            value={shareFallbackUrl}
            aria-label="Story link — select and copy"
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
            className="story-end__share-input font-ui story-focus"
          />
        )}
      </div>
    </footer>
  );
}

/* ── The grow ── (see GrowPlane) */
function GrowPlaneView({ plane, reduce }: { plane: GrowPlane; reduce: boolean }) {
  const [view] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const { origin } = plane;
  const frame = origin?.frame ?? plane.box;
  const clipStart = `inset(${frame.y}px ${view.width - frame.x - frame.width}px ${view.height - frame.y - frame.height}px ${frame.x}px)`;
  // The picture as the reader saw it: the whole photograph drawn in its
  // box (hover zoom and parallax included), which the window then crops.
  const shown = origin ? coverRect(origin.ratio, origin.image) : null;
  const at = plane.target ?? shown;
  const from = plane.target && shown
    ? { x: shown.x - plane.target.x, y: shown.y - plane.target.y, scale: shown.width / plane.target.width }
    : null;
  const transition = { duration: reduce ? 0 : plane.ms / 1000, ease: EASE.plane };
  const stock = stockPaper(plane.story.slug);
  const ground = plane.onto === 'page'
    ? 'var(--story-paper)'
    : plane.split == null
      ? stock
      : `linear-gradient(90deg, ${stock} 0 ${plane.split}px, var(--story-paper) ${plane.split}px)`;
  return (
    <motion.div
      className="story-grow"
      aria-hidden="true"
      initial={{ clipPath: clipStart }}
      animate={{ clipPath: 'inset(0px 0px 0px 0px)' }}
      transition={transition}
    >
      <div className="story-grow__ground" data-phase={plane.phase} data-onto={plane.onto} style={{ background: ground }} />
      {origin && at && (
        <motion.div
          className="story-grow__photo"
          style={{ left: at.x, top: at.y, width: at.width, height: at.height, transformOrigin: '0 0' }}
          initial={from ? { x: from.x, y: from.y, scale: from.scale, opacity: 1 } : { opacity: 1 }}
          animate={from ? { x: 0, y: 0, scale: 1, opacity: 1 } : { opacity: 0 }}
          transition={transition}
        >
          <img src={origin.imageUrl} alt="" decoding="async" draggable={false} />
          {/* The plate's own grade — its matte and shades — leaves as the
              picture lands, so its tone never cuts. A bare picture (the Next
              card, a proof frame) has only its own ground showing through. */}
          <motion.div
            className="story-grow__grade"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={transition}
          >
            <div style={{ opacity: origin.matte, background: origin.bare?.ground ?? '#30352a' }} />
            {!origin.bare && (
              <>
                <div className="story-grow__shade story-grow__shade--top" />
                <div className="story-grow__shade story-grow__shade--foot" />
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ── Full-screen lightbox using existing shared component ── */
function LightboxShell({
  photos,
  activeIndex,
  onClose,
  collectionName,
  origin,
  resolveTarget,
}: {
  photos: Photo[];
  activeIndex: number;
  onClose: () => void;
  collectionName: string;
  origin: LightboxOrigin | null;
  resolveTarget: (index: number) => LightboxTarget | null;
}) {
  return (
    <Lightbox
      photos={photos}
      initialIndex={activeIndex}
      onClose={onClose}
      collectionName={collectionName}
      origin={origin}
      resolveTarget={resolveTarget}
    />
  );
}

/* ══════════════════════════════════════════════════════════
 *  MagazineLayout — dark-theme collection detail overlay
 * ══════════════════════════════════════════════════════════ */
export default function MagazineLayout({
  collection,
  allCollections,
  onSelectCollection,
  onClose,
  returnFocusElement,
  mainId,
  standalone = false,
  canonicalUrl,
  entryMode = 'cover',
  sharedLayoutId,
  sharedSourcePresent,
  sharedImageUrl,
  onEntryReady,
  entryOrigin,
  homeStubFor,
}: MagazineLayoutProps) {
  const reduce = useReducedMotion();
  const isPresent = useIsPresent();
  // A standalone /works page is server-rendered, and framer writes `initial`
  // into the HTML it sends: every hidden starting state was a blank the
  // visitor looked at until hydration. So until it hydrates, the page paints
  // at rest — the opening spread set, every frame at rest. Hydration arms the
  // arrivals below the fold (the frames' develop, the end's Next line), each
  // jumping instantly to its waiting state where nobody is looking. The
  // overlay is never server-rendered and is armed from its first render.
  const [revealArmed, setRevealArmed] = useState(!standalone);
  useEffect(() => { setRevealArmed(true); }, []);
  const sharedEntry = entryMode === 'shared-photo';
  // A Keep Reading selection stays inside the same Story shell. Only the
  // collection actually opened from Homepage may morph back to that source.
  const sharedEntryCollectionRef = useRef(collection._id);
  const isSharedEntryCollection = sharedEntry && collection._id === sharedEntryCollectionRef.current;
  // Whether this shell was opened from a Homepage plate, and whether the story
  // on screen is still the one that grew out of it: a Next turn inside the
  // same shell grows from its card. Under reduced motion nothing grows. The
  // origin is read once, at mount: Homepage hands it over only while the
  // desktop layout holds, and a viewport crossing 1024px mid-grow must not
  // take the plate away from a plane that is halfway through becoming it.
  const entryOriginRef = useRef(entryOrigin);
  const plateEntry = !!entryOriginRef.current && !sharedEntry && !standalone && !reduce;
  const plateEntryCollectionRef = useRef(collection._id);
  // Spent the first time the shell turns away from that story. The archive
  // wraps, so the chapter this shell opened from comes round again after a
  // full lap of Next, and that arrival is an ordinary turn.
  const plateSpentRef = useRef(false);
  const plateOrigin = plateEntry && !plateSpentRef.current && collection._id === plateEntryCollectionRef.current
    ? entryOriginRef.current ?? null
    : null;
  // ── The grow (see GrowPlane) ──
  // A plate at mount, or the Next card during a turn.
  const [plane, setPlane] = useState<GrowPlane | null>(() => (
    plateOrigin ? growPlane('plate', collection, plateOrigin, plateOrigin.frame, PLATE_GROW_MS) : null
  ));
  // True once the plane has landed full-screen. Starts true on every path that
  // has nothing to grow from.
  const [entryLanded, setEntryLanded] = useState(() => !plateOrigin);
  // The story a grow has landed onto: its spread is sent waiting and sets
  // itself (`printedId` records that it has).
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [printedId, setPrintedId] = useState<string | null>(null);
  // The landing is on a timer rather than on the plane's animation callback:
  // a landing that depends on a callback is a landing that can simply not
  // happen. The story body mounts in the same commit (it is kept unmounted
  // until then), and the plane's grounds go in that commit too: the spread
  // under them is the same picture.
  useEffect(() => {
    if (entryLanded) return;
    if (!plane || plane.kind !== 'plate') {
      setEntryLanded(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setEntryLanded(true);
      setEnteringId(plane.story._id);
      setPlane((current) => (current && current.key === plane.key ? { ...current, phase: 'hold' } : current));
    }, plane.ms);
    return () => window.clearTimeout(timer);
  }, [plane, entryLanded]);
  // Spent after the commit that changes the story, not in the turn's click
  // handler, so the render that is still showing it keeps its origin.
  useEffect(() => {
    if (collection._id !== plateEntryCollectionRef.current) plateSpentRef.current = true;
  }, [collection._id]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onEntryReadyRef = useRef(onEntryReady);
  onEntryReadyRef.current = onEntryReady;
  // One scroll source for the story: the rail's kept stub and the phone's
  // frame folio read the offset.
  const { scrollY } = useScroll({ container: containerRef });
  const [isShared, setIsShared] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [shareFallbackUrl, setShareFallbackUrl] = useState('');
  const shareResetTimerRef = useRef<number | null>(null);
  const shareAttemptRef = useRef(0);
  // The hovered frame is held on the DOM, not in state (see FrameShared.onHover).
  const frameGridRef = useRef<HTMLDivElement>(null);
  const hoveredFrameRef = useRef<HTMLElement | null>(null);
  const markHoveredFrame = useCallback((element: HTMLElement | null) => {
    const previous = hoveredFrameRef.current;
    if (previous && previous !== element) previous.removeAttribute('data-hovered');
    if (element) element.setAttribute('data-hovered', '');
    hoveredFrameRef.current = element;
    const grid = frameGridRef.current;
    if (!grid) return;
    if (element) grid.setAttribute('data-hovered', '');
    else grid.removeAttribute('data-hovered');
  }, []);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // The box of the frame that opened the viewer, read at click time.
  const [lightboxOrigin, setLightboxOrigin] = useState<LightboxOrigin | null>(null);
  // A viewer opened from the end page's Plates goes back to its plate, which
  // is on screen, not to the frame's place further up the story.
  const plateReturnRef = useRef(false);
  // Where a frame IS, asked for at the moment the viewer closes rather than
  // remembered from when it opened. Take the first node actually laid out.
  const resolveFrameTarget = useCallback((index: number) => {
    const root = containerRef.current;
    if (!root) return null;
    const attribute = plateReturnRef.current ? 'data-plate-index' : 'data-frame-index';
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(`[${attribute}="${index}"]`));
    const node = nodes.find((candidate) => candidate.offsetParent !== null);
    if (!node) return null;
    // A frame the reader has not reached yet (the viewer riffled past it)
    // is waiting or mid-entrance: it stands at rest to be flown home onto,
    // rather than arriving again under the landing picture.
    if (!plateReturnRef.current) settleFrame(node);
    let box = node.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    // The reader may have paged a long way from the frame they opened, and the
    // story underneath has not moved since. Bring that frame into view before
    // measuring it: the viewer still covers the whole screen, so the story
    // scrolling to meet it is never seen — and it means closing always returns
    // the reader to the frame they were actually looking at, rather than to
    // wherever they happened to start.
    const rootBox = root.getBoundingClientRect();
    if (box.top < rootBox.top + 24 || box.bottom > rootBox.bottom - 24) {
      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      root.scrollTop += (box.top - rootBox.top) - (rootBox.height - box.height) / 2;
      box = node.getBoundingClientRect();
      root.style.scrollBehavior = previousBehavior;
      if (!box.width || !box.height) return null;
    }
    return { box: { x: box.x, y: box.y, width: box.width, height: box.height }, node };
  }, []);
  const openLightbox = (index: number, element: HTMLElement | null, fromPlates = false) => {
    plateReturnRef.current = fromPlates;
    const box = element?.getBoundingClientRect();
    // The picture the frame is showing, if it has already been decoded: the
    // viewer wears it until its own file arrives, so the flight out of this
    // frame carries this frame's pixels even when that file is still on its
    // way. A frame still loading lends nothing.
    const image = element?.querySelector('img');
    const src = image?.complete && image.naturalWidth > 0 ? image.currentSrc || image.src : '';
    setLightboxOrigin(box ? { x: box.x, y: box.y, width: box.width, height: box.height, src: src || undefined } : null);
    setLightboxIndex(index);
  };
  const [sharedBodyReady, setSharedBodyReady] = useState(!sharedEntry || !!reduce);
  // Touch devices: skip the "dim every other photo when one is hovered"
  // effect — the user can't trigger or escape it cleanly, and the hover
  // handler firing on tap causes a flash of dim before the lightbox opens.
  const canHover = useHoverCapable();
  useEffect(() => {
    markHoveredFrame(null);
    setLightboxIndex(null);
  }, [collection._id, markHoveredFrame]);

  // Treat the story as a real modal: focus the close control on entry, keep
  // keyboard focus inside, and return focus to the card that opened it.
  useEffect(() => {
    if (standalone || sharedEntry) return;
    previousFocusRef.current = returnFocusElement?.isConnected
      ? returnFocusElement
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [returnFocusElement, sharedEntry, standalone]);

  // Both the grow and the shared-photo handoff hold the story body inert for
  // their opening beat. Focus the dialog shell immediately so keyboard users
  // never sit inside the now-inert Homepage during that time.
  useEffect(() => {
    if (standalone || !isPresent) return;
    dialogRef.current?.focus({ preventScroll: true });
  }, [collection._id, sharedEntry, standalone, isPresent]);

  // ── The story on the page ──
  // Its frames (frame 01 is the cover the reader clicked), their shapes and
  // its plan. The boxes' CSS does not depend on the window; the pixel values
  // at the design window (1728×1000) only feed `sizes`.
  const { frames: photos, ratios, slots } = useMemo(() => storyPlanFor(collection), [collection]);
  const boxes = useMemo(() => storyBoxes(slots, ratios, 1728, 1000), [slots, ratios]);
  // How each slot's frames arrive: four photographic entrances dealt in
  // reading order (src/lib/storyEntrance.ts), aligned with `slots`; the
  // shutter goes only where the design window's frame is short enough.
  const entrances = useMemo(() => planEntrances(slots, ratios), [slots, ratios]);
  // The slots as the kept stub reads them: frame indices, in reading order.
  const frameRows = useMemo(() => slotRows(slots), [slots]);
  // Where the reader is, for the kept stub. A /works page's server HTML
  // prints the first frame read ("Frame 01", its tick inked) and drops to
  // nothing once armed, below the fold; the overlay starts at nothing.
  // Either way the ink counts up as the stub is handed in (KeptStub).
  const [stubReading] = useState<StubReading>(() => {
    const sent = standalone ? Math.min(photos.length, frameRows[0]?.length ?? 0) : 0;
    const frame = sent > 0 ? 1 : 0;
    return { ink: motionValue(sent), shown: motionValue(frame), frame: motionValue(frame) };
  });
  // The frame's own place, per frame, printed only where it is not the
  // chapter's (New York's frames are Midtown and Manhattan).
  const places = useMemo(() => {
    const location = typeof collection.location === 'string' ? collection.location.trim() : '';
    return photos.map((photo) => {
      const city = typeof photo?.location?.city === 'string' ? photo.location.city.trim() : '';
      return city && !labelsMatch(collection.name, city) && !labelsMatch(location, city) ? city : '';
    });
  }, [collection.location, collection.name, photos]);
  // The stub's per frame number; 0 (the arrival's "00") carries the first
  // frame's.
  const stubCities = useMemo(() => [places[0] ?? '', ...places], [places]);
  const paragraphs = useMemo(() => storyParagraphs(collection), [collection]);
  const quote = pullQuote(collection.slug);
  const dek = storyDek(collection.slug) || collection.subtitle || '';
  const camera = useMemo(() => storyCamera(photos.map((photo) => photo.camera)), [photos]);
  const position = formatPosition(photos[0]?.location?.lat, photos[0]?.location?.lng);
  const terrain = terrainFor(collection);
  const darkMap = !!collection.slug && DARK_TERRAIN.has(collection.slug);
  const region = typeof collection.region === 'string' ? collection.region.trim() : '';
  const location = typeof collection.location === 'string' ? collection.location.trim() : '';
  const dateline = [region || location, collection.year ? String(collection.year) : ''].filter(Boolean).join(', ');
  // The story's number is its ticket's: the homepage's chapter order, not the
  // data's (chapterOrdinal). A chapter the issue does not carry falls back to
  // its place in the list it was given.
  const chapter = useMemo(() => chapterOrdinal(allCollections, collection._id), [allCollections, collection._id]);
  const listIndex = allCollections.findIndex((entry) => entry._id === collection._id);
  const ordinal = pad2(chapter.index >= 0 ? chapter.index + 1 : Math.max(0, listIndex) + 1);
  const total = pad2(chapter.index >= 0 ? chapter.total : allCollections.length);
  const nextCollection = chapter.next ?? allCollections[(listIndex + 1) % Math.max(1, allCollections.length)] ?? null;
  const nextOrdinal = nextCollection ? pad2(chapterOrdinal(allCollections, nextCollection._id).index + 1) : '';
  // Frame 01's box on the spread; the map page is everything to its left.
  const opener = boxes[0]?.slot.kind === 'OPEN' ? boxes[0].frames[0] : null;
  const openLandscape = isLandscape(ratios[0] ?? 1.5);
  const storyStyle = {
    ...stockStyle(collection.slug),
    '--open-x': opener ? css(opener.x) : '0px',
    '--open-w': opener ? css(opener.w) : '0px',
    '--open-h': opener ? css(opener.h) : '0px',
  } as CSSProperties;

  const keptStubRef = useRef<HTMLDivElement>(null);
  // The homepage ticket's stub, while the story on screen is the one its
  // plate grew into: the rail's stub is its kept half, carrying its number.
  const plateStub = plateOrigin?.stub ?? null;
  const sharedPhotoBase = collection.coverImageUrl || photos[0]?.imageUrl || '';
  const sharedPhotoUrl = sharedImageUrl || (sharedPhotoBase
    ? `${sharedPhotoBase}${sharedPhotoBase.includes('?') ? '&' : '?'}auto=format&w=2200&q=86`
    : '');
  const hasSharedSource = sharedSourcePresent ?? !!returnFocusElement?.isConnected;
  const canMorphSharedPhoto = isSharedEntryCollection && !!sharedLayoutId && !!sharedPhotoUrl && hasSharedSource;

  // ── The page turn ──
  // The Next card the reader clicked grows into the next story's opening
  // spread: its box is read once, at click, and the plane grows out of it,
  // carrying the card's picture to where frame 01 sits on the next spread
  // (the card IS the next story's frame 01, at its own ratio). The story
  // underneath is swapped only once the plane is full-screen, so the swap is
  // never seen; the next spread then sets itself as a plate's does. On a
  // /works page a turn is a navigation (the whole document is replaced).
  const onSelectCollectionRef = useRef(onSelectCollection);
  onSelectCollectionRef.current = onSelectCollection;
  const turning = !!plane && plane.kind === 'turn' && plane.phase === 'grow';
  const beginPageTurn = (next: Collection, card: HTMLElement | null) => {
    if (plane) return;
    // Normally already warm from the end page arriving; the grow is the last
    // chance before the map is drawn.
    void warmTerrain(terrainFor(next));
    const box = card?.getBoundingClientRect();
    // Read in the click, before anything moves: the card's picture as a
    // plate. Not under reduced motion, where the turn has no grow at all.
    const origin = card && !reduce ? photoOrigin(card, card.querySelector('img')) : null;
    // Focus the shell before the story body goes inert underneath the plane.
    dialogRef.current?.focus({ preventScroll: true });
    if (reduce || !box || !box.width || !box.height) {
      onSelectCollection(next);
      return;
    }
    setPlane(growPlane('turn', next, origin, { x: box.x, y: box.y, width: box.width, height: box.height }, COVER_EXPAND_MS));
  };
  // The swap is on a timer rather than on the plane's own animation callback,
  // for the reason the landing is. The next story, its spread's waiting state
  // and the plane's hand-over land in one commit.
  useEffect(() => {
    if (!plane || plane.kind !== 'turn' || plane.phase !== 'grow') return;
    const timer = window.setTimeout(() => {
      setEnteringId(plane.story._id);
      setPlane((current) => (current && current.key === plane.key ? { ...current, phase: 'hold' } : current));
      onSelectCollectionRef.current(plane.story);
    }, plane.ms);
    return () => window.clearTimeout(timer);
  }, [plane]);
  // Landed: the grounds have gone. The photograph stays over frame 01 until
  // frame 01's own file has decoded (a bigger candidate than the plate's),
  // then the plane goes — the two are the same pixels in the same box. A
  // plane that opened on paper fades. There is no clock on it: on a slow
  // line (the owner reads from far off the image CDN) frame 01 can take ten
  // seconds, and a cap took the picture away and left blank paper until it
  // came. The plane is fixed and the page is not, so the reader scrolling
  // the story is the other thing that lets it go (a failed file ends it too).
  useEffect(() => {
    if (!plane || plane.phase !== 'hold' || plane.story._id !== collection._id) return;
    let live = true;
    let frame = 0;
    const done = () => {
      if (!live) return;
      setPlane((current) => (current && current.key === plane.key ? null : current));
    };
    if (plane.onto === 'page') {
      const timer = window.setTimeout(done, DUR_MS.swap);
      return () => { live = false; window.clearTimeout(timer); };
    }
    const root = containerRef.current;
    const image = plane.target ? root?.querySelector<HTMLImageElement>('[data-frame-index="0"] img') : null;
    if (!image) {
      frame = requestAnimationFrame(done);
      return () => { live = false; cancelAnimationFrame(frame); };
    }
    const onScroll = () => {
      if (root && root.scrollTop > 2) done();
    };
    root?.addEventListener('scroll', onScroll, { passive: true });
    void frameDecoded(image).then(() => { frame = requestAnimationFrame(done); });
    return () => {
      live = false;
      root?.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [plane, collection._id]);
  // The story is live — interactive, its body no longer inert — once it has
  // landed and while no turn is growing over it.
  const live = entryLanded && !turning;
  // A grown arrival's spread is sent waiting (map undeveloped, type unset)
  // and set two frames after it is on screen, so the set is a transition the
  // reader sees. Every other way in paints it set.
  const spreadWaiting = !reduce && enteringId === collection._id && printedId !== collection._id;
  useEffect(() => {
    if (!spreadWaiting || !entryLanded) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPrintedId(collection._id));
    });
    return () => cancelAnimationFrame(frame);
  }, [spreadWaiting, entryLanded, collection._id]);

  // The photograph owns the first 55% of the Homepage handoff. Navigation and
  // story content become interactive only once that expansion has established
  // the new full-screen context. With no matching source we skip the hold and
  // use a short, quiet fade instead of manufacturing another cover.
  useEffect(() => {
    if (!sharedEntry || !isPresent) return;
    if (!isSharedEntryCollection) {
      setSharedBodyReady(true);
      return;
    }

    if (reduce) {
      setSharedBodyReady(true);
      const frame = requestAnimationFrame(() => onEntryReadyRef.current?.(closeButtonRef.current));
      return () => cancelAnimationFrame(frame);
    }

    setSharedBodyReady(!canMorphSharedPhoto);
    const bodyTimer = canMorphSharedPhoto
      ? window.setTimeout(() => setSharedBodyReady(true), SHARED_CONTENT_DELAY * 1000)
      : 0;
    const readyTimer = window.setTimeout(
      () => onEntryReadyRef.current?.(closeButtonRef.current),
      (canMorphSharedPhoto ? SHARED_OPEN_DURATION : 0.35) * 1000,
    );
    return () => {
      if (bodyTimer) window.clearTimeout(bodyTimer);
      window.clearTimeout(readyTimer);
    };
  }, [canMorphSharedPhoto, isPresent, isSharedEntryCollection, reduce, sharedEntry]);

  // A new story opens at its top: before its first paint (a layout effect),
  // or a turn would show the next story for a frame at the old one's scroll.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const behavior = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    el.scrollTop = 0;
    el.style.scrollBehavior = behavior;
  }, [collection._id, entryLanded]);

  useEffect(() => {
    // Standalone work pages are documents, not dialogs. Do not steal focus
    // from the browser/skip-link flow.
    if (standalone || sharedEntry || !live || !isPresent) return;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [collection._id, live, sharedEntry, standalone, isPresent]);

  // ── The running head ──
  // Transparent over the spread, Back in bone on the stock. It takes paper (a
  // 97% sheet and a rule) and shows the story's name once a sentinel at the
  // foot of the spread (100svh − 44 on desktop; the stock page's foot on the
  // phone) has passed under it: an IntersectionObserver writes the attribute
  // straight on the head, never a scroll listener, never a render.
  const headRef = useRef<HTMLDivElement>(null);
  // A turn lands the next story at its top: the head is back on the stock
  // in the same paint, not fading off the last story's paper.
  useLayoutEffect(() => {
    const head = headRef.current;
    if (!head || !head.dataset.paper) return;
    head.dataset.instant = 'true';
    delete head.dataset.paper;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { delete head.dataset.instant; });
    });
    return () => cancelAnimationFrame(frame);
  }, [collection._id]);
  useEffect(() => {
    const root = containerRef.current;
    const head = headRef.current;
    if (!entryLanded || !root || !head || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        // One sentinel per layout; the other is not laid out at this width.
        if ((entry.target as HTMLElement).offsetParent === null) continue;
        const passed = !entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
        if (passed) head.dataset.paper = 'true';
        else delete head.dataset.paper;
      }
    }, { root });
    root.querySelectorAll('[data-head-sentinel]').forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      delete head.dataset.paper;
    };
  }, [entryLanded, collection._id]);
  // The phone has no stub: the running head's folio names the frame being
  // read ("07 / 15") — the last frame whose top has crossed the reading line.
  // Tops are an offsetTop chain measured on mount and on resize; a scroll
  // compares one number against them and writes the folio's text straight
  // onto the DOM.
  const folioRef = useRef<HTMLSpanElement>(null);
  const folioLinesRef = useRef<{ tops: number[]; view: number } | null>(null);
  const paintFolio = useCallback((scrollTop: number) => {
    const lines = folioLinesRef.current;
    const folio = folioRef.current;
    if (!lines || !folio) return;
    const line = scrollTop + lines.view * STORY_READING_LINE;
    let no = 1;
    lines.tops.forEach((top, index) => { if (top <= line) no = Math.max(no, index + 1); });
    const text = `${pad2(no)} / ${pad2(photos.length)}`;
    if (folio.textContent !== text) folio.textContent = text;
  }, [photos.length]);
  useEffect(() => {
    const root = containerRef.current;
    if (!entryLanded || !root) return;
    const measure = () => {
      const folio = folioRef.current;
      if (!folio || folio.offsetParent === null) {
        folioLinesRef.current = null;
        return;
      }
      const tops: number[] = [];
      root.querySelectorAll<HTMLElement>('[data-frame-index]').forEach((node) => {
        const index = Number(node.dataset.frameIndex);
        if (!Number.isFinite(index) || node.offsetParent === null || tops[index] !== undefined) return;
        let top = 0;
        let step: HTMLElement | null = node;
        while (step && step !== root) {
          top += step.offsetTop;
          step = step.offsetParent instanceof HTMLElement ? step.offsetParent : null;
        }
        if (step === root) tops[index] = top;
      });
      folioLinesRef.current = { tops, view: root.clientHeight };
      paintFolio(root.scrollTop);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    if (frameGridRef.current) observer.observe(frameGridRef.current);
    observer.observe(root);
    return () => observer.disconnect();
  }, [entryLanded, collection._id, paintFolio]);
  useMotionValueEvent(scrollY, 'change', paintFolio);

  useEffect(() => {
    setIsShared(false);
    setShareStatus('');
    setShareFallbackUrl('');
    return () => {
      shareAttemptRef.current += 1;
      if (shareResetTimerRef.current !== null) window.clearTimeout(shareResetTimerRef.current);
    };
  }, [collection._id]);

  const handleShare = async () => {
    const attempt = ++shareAttemptRef.current;
    if (shareResetTimerRef.current !== null) window.clearTimeout(shareResetTimerRef.current);
    setIsShared(false);
    setShareStatus('');
    setShareFallbackUrl('');
    const storyUrl = canonicalUrl
      ? new URL(canonicalUrl, window.location.origin).href
      : collection.slug
        ? new URL(`/works/${collection.slug}`, window.location.origin).href
        : window.location.href;
    const shareData = {
      title: `Ryan Xu | ${collection.name}`,
      text: collection.description || '',
      url: storyUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        if (attempt === shareAttemptRef.current) setShareStatus('Story shared.');
        return;
      } catch (error) {
        // Dismissing the native share sheet is an intentional cancellation.
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    if (attempt !== shareAttemptRef.current) return;
    try {
      await navigator.clipboard.writeText(storyUrl);
      if (attempt !== shareAttemptRef.current) return;
      setIsShared(true);
      setShareStatus('Link copied to clipboard.');
      shareResetTimerRef.current = window.setTimeout(() => {
        setIsShared(false);
        setShareStatus('');
        shareResetTimerRef.current = null;
      }, 2000);
    } catch {
      if (attempt !== shareAttemptRef.current) return;
      setShareFallbackUrl(storyUrl);
      setShareStatus('Unable to copy automatically. Select the link below to copy it.');
    }
  };

  const backToStoryTop = () => {
    closeButtonRef.current?.focus({ preventScroll: true });
    containerRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  // Escape closes the story (unless the lightbox is open — it owns Escape then).
  useEffect(() => {
    // Homepage owns Escape, focus trapping and source restoration while a
    // shared photograph is moving between the two surfaces.
    // The outgoing shell stays mounted for its visual exit, but must not
    // trap focus or accept another Story action once that exit has begun.
    if (sharedEntry || !isPresent) return;
    const fn = (e: KeyboardEvent) => {
      if (e.defaultPrevented || lightboxIndex !== null) return;
      // Escape closes only the Homepage modal. On a standalone /works page it
      // must not unexpectedly navigate away from a normal document.
      if (standalone) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('aria-hidden') && element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose, lightboxIndex, sharedEntry, standalone, isPresent]);

  // ── The kept stub's clock ──
  // The spread has set: the landing (a grow's), the panel's arrival (an
  // overlay opened without one), or hydration (a /works page; from the
  // /travel ticket's photograph giving way, when it opened under one), plus
  // SPREAD_SET_MS, by when the map has decoded or its short wait
  // (TERRAIN_GRACE_MS) is over. Keyed to the story, so a turn's first render
  // of the next story never counts the last one's.
  const slideInRef = useRef(!standalone && !plateOrigin && !sharedEntry);
  const [spreadSetId, setSpreadSetId] = useState<string | null>(null);
  useEffect(() => {
    if (!live) return;
    if (reduce) {
      setSpreadSetId(collection._id);
      return;
    }
    const lead = enteringId === collection._id
      ? 0
      : standalone
        ? travelPlateLeft()
        : slideInRef.current
          ? PANEL_SLIDE_MS
          : 0;
    slideInRef.current = false;
    const map = terrainFor(collection);
    const wait = lead + Math.max(SPREAD_SET_MS, !map || terrainDecoded(map) ? 0 : TERRAIN_GRACE_MS);
    const timer = window.setTimeout(() => setSpreadSetId(collection._id), wait);
    return () => window.clearTimeout(timer);
    // `enteringId` changes in the same commit as the story it names.
  }, [live, collection._id, reduce]);
  const spreadSet = spreadSetId === collection._id;
  // …and not before the spread has actually loaded: frame 01's own file and
  // the map page's terrain, each decoded (or failed). On a fast line both
  // are in long before SPREAD_SET_MS; on a slow one the stub used to arrive
  // beside a blank frame 01 and an undeveloped map.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  useEffect(() => {
    const root = containerRef.current;
    if (!entryLanded || !root) return;
    let live = true;
    const images = [
      root.querySelector<HTMLImageElement>('[data-frame-index="0"] img'),
      root.querySelector<HTMLImageElement>('.story-spread__terrain'),
    ].filter((image): image is HTMLImageElement => !!image);
    void Promise.all(images.map(frameDecoded)).then(() => {
      if (live) setLoadedId(collection._id);
    });
    return () => { live = false; };
  }, [entryLanded, collection._id]);
  // The story has loaded and the kept stub is handed into the rail (KeptStub).
  // Nothing stub-like is on screen before this: the ticket keeps its stub
  // while the plate grows over it, and gives it up only here, under the
  // opaque story, so the half the reader keeps is never in two places at once.
  // A turn growing over the story leaves its stub where it is: the next
  // story's own stub waits for its own spread.
  const stubReady = spreadSet && entryLanded && loadedId === collection._id;
  // It is handed in two frames after that, and only when no viewer is open:
  // a story opened onto one of its frames (the closing proof sheet) flies
  // that frame out of the page the moment the story goes live, and the stub
  // rising under the flight was two motions at once. Then it waits under the
  // fold until the viewer has closed and gone (VIEWER_EXIT_MS), and arrives
  // over the story the reader comes back to. Once in, it stays in.
  const [stubHandedIn, setStubHandedIn] = useState(false);
  const viewerOpenRef = useRef(false);
  viewerOpenRef.current = lightboxIndex !== null;
  const stubHeldRef = useRef(false);
  useEffect(() => {
    if (!stubReady) {
      stubHeldRef.current = false;
      setStubHandedIn(false);
      return;
    }
    if (stubHandedIn) return;
    if (lightboxIndex !== null) {
      stubHeldRef.current = true;
      return;
    }
    let frame = 0;
    const arrive = () => { if (!viewerOpenRef.current) setStubHandedIn(true); };
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(arrive); });
    }, stubHeldRef.current && !reduce ? VIEWER_EXIT_MS : 0);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [stubReady, stubHandedIn, lightboxIndex, reduce]);
  // Read with `stubReady` in the same render, so a turn's stale render
  // never counts the last story's hand-in for the new stub.
  const stubArrived = stubReady && stubHandedIn;
  useLayoutEffect(() => {
    if (plateStub && stubArrived && isPresent) plateStub.node.dataset.keptAway = 'true';
  }, [plateStub, stubArrived, isPresent]);
  // At the close the kept half flies back onto its ticket (`flyStubHome`) —
  // from the story that grew out of that ticket, once the stub has reached
  // the rail. A story turned to (Next) flies its own kept half into its own
  // chapter's ticket, which the Homepage has set on screen under it by now
  // (`homeStubFor`). Every other close (a close during the entry, reduced
  // motion, a resized window, a ticket off screen or torn) keeps the close it
  // had, and the ticket simply has its stub again under the leaving story. A
  // layout effect, so the rail's stub and its copy swap in the exit's first
  // paint.
  useLayoutEffect(() => {
    if (isPresent) return;
    const opened = entryOriginRef.current?.stub ?? null;
    const home = plateStub ?? homeStubFor?.(collection._id) ?? null;
    const rail = keptStubRef.current;
    const flown = !!home && stubArrived && !reduce && !!rail && rail.offsetParent !== null
      && home.node.isConnected
      && home.view.width === window.innerWidth
      && home.view.height === window.innerHeight
      && flyStubHome(rail, home, collection.slug);
    // The ticket the story grew out of has its stub back, unless it is the
    // one being flown home (that one is seated by the flight).
    if (opened && !(flown && home === opened)) delete opened.node.dataset.keptAway;
  }, [isPresent]);

  const StoryShell = standalone ? motion.main : motion.div;
  const heading = standalone ? 'h1' : 'h2';
  const sharedPanelDelay = canMorphSharedPhoto ? SHARED_CONTENT_DELAY : 0;
  const frameShared: FrameShared = {
    collectionName: collection.name,
    total: photos.length,
    canHover,
    onHover: markHoveredFrame,
    onOpen: (index, element) => openLightbox(index, element),
  };
  const openerPhoto = photos[0];

  return (
    <>
      {/* Overlay shell — slide-up/down. (No backdrop-blur: the panel covers the
          backdrop within a second, so the blur cost never reads.) */}
      <StoryShell
        ref={dialogRef}
        id={standalone ? mainId : undefined}
        tabIndex={-1}
        // A standalone /works page is server-rendered, and framer writes
        // `initial` into the SSR style attribute — so this shell shipped its
        // whole page at `opacity: 0`. The document must paint what it was
        // sent. A plate entry paints its shell whole as well: the growing
        // plate is this shell's child, and a shell fading in over 0.7s would
        // have put it on the Homepage at 40% for the first half of its travel.
        initial={standalone || (sharedEntry && canMorphSharedPhoto) || plateEntry ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        // A story leaves as a fade that eases IN. On the house expo the whole
        // story went 1 → 0.23 in 117ms, so the panel's 680ms drop below was
        // never seen — the story simply vanished.
        exit={sharedEntry
          ? { opacity: canMorphSharedPhoto ? 1 : 0 }
          : { opacity: 0, transition: { duration: reduce ? 0 : 0.62, ease: EASE.leave } }}
        transition={{
          duration: reduce
            ? 0
            : sharedEntry
              ? isPresent
                ? canMorphSharedPhoto ? 0 : 0.35
                : SHARED_CLOSE_DURATION
              : 0.7,
          ease: EASE.arrive,
        }}
        className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden ${sharedEntry || plateEntry ? 'bg-transparent' : 'bg-black/40'}`}
        role={standalone ? undefined : 'dialog'}
        aria-modal={standalone ? undefined : true}
        aria-label={`Story: ${collection.name}`}
        inert={!isPresent}
        aria-hidden={lightboxIndex !== null || !isPresent}
      >
        {sharedEntry && (
          <motion.div
            aria-hidden="true"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: reduce
                ? 0
                : isPresent
                  ? SHARED_OPEN_DURATION * 0.4
                  : SHARED_CLOSE_DURATION * 0.4,
              delay: reduce || isPresent ? 0 : SHARED_CLOSE_DURATION * 0.6,
              ease: EASE.arrive,
            }}
            className="pointer-events-none absolute inset-0 z-0 bg-[#171b15]"
          />
        )}
        {plateEntry && (
          /* The scrim the shell would have faded in, on its own and under the
             plane: the page dims behind the growing plate rather than the
             plate dimming over the page. It stays for the shell's life, so
             the close is the one it always was. */
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, ease: EASE.arrive }}
            className="pointer-events-none absolute inset-0 z-0 bg-black/40"
          />
        )}
        {canMorphSharedPhoto && (
          <motion.div
            layout
            layoutId={sharedLayoutId}
            aria-hidden="true"
            initial={false}
            animate={{ opacity: 1, borderRadius: 0 }}
            exit={{ opacity: 1, borderRadius: 0 }}
            transition={{
              layout: {
                duration: reduce ? 0 : isPresent ? SHARED_OPEN_DURATION : SHARED_CLOSE_DURATION,
                ease: EASE.arrive,
              },
              borderRadius: { duration: reduce ? 0 : isPresent ? SHARED_OPEN_DURATION : SHARED_CLOSE_DURATION, ease: EASE.arrive },
            }}
            className="pointer-events-none absolute inset-0 z-[1] overflow-hidden bg-[#20241a]"
          >
            <img
              src={sharedPhotoUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              draggable={false}
            />
          </motion.div>
        )}

        <motion.div
          id={standalone ? undefined : mainId}
          tabIndex={!standalone && mainId ? -1 : undefined}
          inert={sharedEntry ? !sharedBodyReady : !live}
          /* Behind a plate entry the panel does not slide up. The plane is
             cut to the plate's window while it grows, and a page-coloured
             panel rising outside that window would be the story arriving
             beside the plate instead of inside it. The panel is simply there,
             unseen, once the plane is full-screen. Its exit keeps the slide.
             A standalone /works page does not slide it up either: framer
             writes `initial` into the server HTML, and the body sat at
             translateY(100%) until hydration. It paints where it rests.
             Behind a plate its opacity is a plain style, not an animated
             value: it turns opaque in the very commit that mounts the story
             and takes the grow's grounds away (framer would apply it a frame
             later, and the Homepage showed through for that frame). */
          initial={standalone ? false : sharedEntry ? { opacity: 0 } : reduce ? { opacity: 0 } : plateEntry ? { y: 0 } : { y: '100%' }}
          animate={sharedEntry ? { opacity: 1 } : reduce ? { opacity: 1 } : plateEntry ? { y: 0 } : { y: 0 }}
          exit={sharedEntry ? { opacity: 0 } : reduce ? { opacity: 0 } : { y: '100%' }}
          transition={sharedEntry
            ? {
                duration: reduce ? 0 : isPresent ? 0.35 : 0.22,
                delay: reduce || !isPresent ? 0 : sharedPanelDelay,
                ease: EASE.arrive,
              }
            : plateEntry
              ? { y: { duration: reduce ? 0 : 0.68, ease: overlayEase } }
              : { duration: reduce ? 0 : 0.68, ease: overlayEase }}
          ref={containerRef}
          data-lenis-prevent
          // The story's page: paper. Its geometry (global.css, Story block)
          // reads the grid tokens and frame 01's box from here.
          className="story z-10 w-full h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar relative focus:outline-none"
          data-open={openLandscape ? 'landscape' : 'portrait'}
          data-map={darkMap ? 'dark' : undefined}
          data-set={spreadWaiting ? 'false' : 'true'}
          style={{
            ...storyStyle,
            paddingBottom: 'env(safe-area-inset-bottom)',
            ...(plateEntry ? { opacity: entryLanded ? 1 : 0 } : null),
          }}
        >
          {/* The running head: ← Back, the story's name, the dateline (the
              phone's frame folio). */}
          <div ref={headRef} className="story-head">
            <motion.button
              ref={closeButtonRef}
              onClick={onClose}
              whileHover={reduce ? undefined : { x: -2 }}
              whileTap={reduce ? undefined : { scale: 0.96, x: -4 }}
              transition={{ duration: 0.2, ease: EASE.arrive }}
              className="story-head__back story-focus font-ui"
              aria-label={`${standalone ? 'Back from' : 'Close'} ${collection.name} story`}
            >
              <Arrow left className="story-head__arrow" />
              Back
            </motion.button>
            <p className="story-head__name font-ui" aria-hidden="true">{collection.name}</p>
            <p className="story-head__folio font-ui" aria-hidden="true">
              <span className="story-head__dateline">{dateline}</span>
              <span key={collection._id} ref={folioRef} className="story-head__frame" />
            </p>
          </div>

          {/* The story — kept unmounted, not merely inert, until a plate
              entry has landed: a plane that is still a plate-sized window is
              no cover for mounting forty frames. */}
          {entryLanded && (
            <div key={collection._id} className="story-body">
              <OpeningSpread
                name={collection.name}
                heading={heading}
                ordinal={ordinal}
                total={total}
                dek={dek}
                camera={camera}
                terrain={terrain}
                entering={enteringId === collection._id && !reduce}
                waiting={spreadWaiting}
              />
              <div ref={frameGridRef} data-frame-grid className="story-sheet">
                {/* The spread's right page: frame 01, at its own ratio. On
                    desktop this row is the screen's height and scrolls away
                    while the map page stays pinned under the paper. */}
                <div className="story-open">
                  <span className="story-sentinel story-sentinel--desk" data-head-sentinel aria-hidden="true" />
                  {openerPhoto && opener && (
                    <StoryFrame
                      photo={openerPhoto}
                      index={0}
                      kind="OPEN"
                      style={{ '--fx': css(opener.x), '--fw': css(opener.w), '--r': (ratios[0] ?? 1.5).toFixed(6) } as CSSProperties}
                      arrive={null}
                      armed={false}
                      order={0}
                      caption={null}
                      sizes={`(min-width: 1024px) ${Math.round((opener.w.v / 1728) * 100)}vw, 100vw`}
                      wide
                      eager
                      place={places[0] ?? ''}
                      shared={frameShared}
                    />
                  )}
                  {/* A landscape frame 01 has paper under it: its caption,
                      and the credits in the rail's column. The dek is the
                      place's line, not this picture's, and set directly
                      under frame 01 it read as its caption (a sunrise under a
                      midday frame): it stands on the map page under the
                      title, as a standfirst, whichever way frame 01 turns. */}
                  <div className="story-open__under">
                    <p className="story-cap story-open__cap font-ui"><CaptionText frames={[0]} places={places} /></p>
                    <Credits camera={camera} map={!!terrain} />
                  </div>
                  {/* A portrait frame 01 fills the right page: its caption
                      stands on the map page beside it (the phone: under it). */}
                  <p className="story-cap story-open__cap story-open__cap--side font-ui"><CaptionText frames={[0]} places={places} /></p>
                </div>
                <div className="story-paper">
                  {boxes.slice(1).map((box, index) => (box.slot.kind === 'END' ? null : (
                    <SlotView
                      key={`${box.slot.kind}-${index}-${box.slot.frames.join('.')}`}
                      box={box}
                      photos={photos}
                      ratios={ratios}
                      places={places}
                      paragraphs={paragraphs}
                      quote={quote}
                      arrive={entrances[index + 1]}
                      armed={revealArmed}
                      shared={frameShared}
                    />
                  )))}
                  <EndPage
                    collection={collection}
                    photos={photos}
                    terrain={terrain}
                    camera={camera}
                    position={position}
                    frameCount={photos.length}
                    nextCollection={nextCollection}
                    nextOrdinal={nextOrdinal}
                    total={total}
                    reduce={!!reduce}
                    armed={revealArmed}
                    onTurn={(card) => {
                      if (!nextCollection) return;
                      // A standalone /works page turns by navigating, and the
                      // whole document is replaced; there is nothing here for
                      // a plane to grow into.
                      if (standalone) {
                        onSelectCollection(nextCollection);
                        return;
                      }
                      beginPageTurn(nextCollection, card);
                    }}
                    onOpenPlate={(index, element) => openLightbox(index, element, true)}
                    onShare={handleShare}
                    onTop={backToStoryTop}
                    isShared={isShared}
                    shareStatus={shareStatus}
                    shareFallbackUrl={shareFallbackUrl}
                  />
                </div>
              </div>
              {/* The rail: columns 1–3, holding only the kept stub, pinned at
                  the foot of the screen from the spread to the end page.
                  Desktop only; the phone's folio is in the running head. It
                  replaced a blog widget ("Reading Progress 62%", a lime
                  hairline and "15 Captured Frames"). */}
              <aside className="story-rail">
                <div className="story-rail__foot">
                  <p className="sr-only font-ui">{photos.length} frames</p>
                  <KeptStub
                    key={collection._id}
                    stubRef={keptStubRef}
                    containerRef={containerRef}
                    gridRef={frameGridRef}
                    scrollY={scrollY}
                    rows={frameRows}
                    frames={photos.length}
                    chapter={collection}
                    ordinal={plateStub?.print?.ordinal ?? ordinal}
                    total={plateStub?.print?.total ?? total}
                    cities={stubCities}
                    reading={stubReading}
                    armed={revealArmed}
                    released={stubArrived}
                    reduce={!!reduce}
                  />
                </div>
              </aside>
            </div>
          )}
        </motion.div>

        {plane && <GrowPlaneView key={plane.key} plane={plane} reduce={!!reduce} />}
      </StoryShell>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <LightboxShell
            photos={photos}
            activeIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            collectionName={collection.name}
            origin={lightboxOrigin}
            resolveTarget={resolveFrameTarget}
          />
        )}
      </AnimatePresence>
    </>
  );
}
