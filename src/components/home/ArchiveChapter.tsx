import { Fragment, memo, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  animate,
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useReducedMotion,
  type MotionStyle,
  type MotionValue,
} from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { FlapWord, RouteShield, primeFlap, runFlap } from './RouteShield';
import { pad2, signNameSize as nameSizeFor, stateCode } from '../../lib/routeShield';
import type { Collection } from '../../types';
import { excerpt } from '../../lib/narratives';
import { useHoverCapable } from '../../lib/useHoverCapable';
import { usePressGive } from '../../lib/usePressGive';
import { stockPaper, stockStyle } from '../../lib/ticketStock';
import { CSS_EASE, DUR_MS, EASE, SPRING, smootherstep } from '../../lib/motion';
import {
  DEVELOP_MASK,
  DOCK,
  SWITCH_COVER,
  awaySide,
  coverDock,
  coverRatioOf,
  developSweep,
  matPolygon,
  switchClip,
  type DockEntry,
} from '../../lib/coverDock';
import { STUB_LANDED_EVENT, phoneCard, type PhoneCard } from '../../lib/explorer';
import {
  TEAR_FREE_MS,
  TEAR_MS,
  TEAR_REDUCED_MS,
  affineCss,
  mirrorAffine,
  tearPose,
  tornEdge,
  type TearFrame,
} from '../../lib/ticketTear';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const EMPTY_PRELOAD_IMAGE_URLS: readonly string[] = [];
const PRELOADED_IMAGE_URLS = new Set<string>();

interface ArchiveChapterProps {
  id: string;
  collection: Collection;
  /** The cover (or its rail) chosen: its collection. One callback for every
   *  chapter, so a chapter whose own props did not change does not render
   *  again when another place is chosen (the export is memoised). */
  onClick: (collection: Collection) => void;
  /** Display order used by the visible chapter number. */
  index: number;
  isActive: boolean;
  /** Position of the shared homepage chapter timeline. Fractional values blend
   *  the focus treatment continuously between neighbouring chapters. */
  chapterProgress?: MotionValue<number>;
  /** Timeline position when it differs from the visible display order. */
  chapterIndex?: number;
  /** How many chapters the archive holds — the stub prints "03 / 06". */
  chapterTotal?: number;
  /** The card stock of each ticket still bound under this one, nearest
   *  first (src/lib/ticketStock.ts): the pad's sheets are printed on them. */
  padStocks?: readonly string[];
  /** Minimal shared-element hooks for a later Homepage -> Story handoff. */
  sharedLayoutId?: string;
  sharedImageRef?: React.Ref<HTMLDivElement>;
  sharedImageSourceRef?: React.Ref<HTMLImageElement>;
  /** Optional neighbouring cover base URLs. They are decoded only while this
   *  chapter is active, using the same responsive candidate as the real image. */
  preloadImageUrls?: readonly string[];
  /** Eager-load only the current/adjacent cover (plus the first cover). */
  prioritizeImage?: boolean;
  /** Shares the cover's hover/focus lock with the geographic atlas. */
  onEngagementChange?: (chapterId: string | null) => void;
  /** Its place is pointed at on the map: the cover answers as if hovered. */
  highlighted?: boolean;
  /** 'cover' (default) = full-bleed magazine cover; 'feature' = a 2-column
   *  editorial spread (image + a text rail) used for the opening chapter. */
  variant?: 'feature' | 'cover';
  /** Desktop archive only: the ticket, the masked title rise and the
   *  focus-driven title weight. The cover itself has no entrance anywhere: it
   *  is simply there, whole, and scrolls in with the page. */
  desktopMotion?: boolean;
  /** The stub's "Next stop": the next place (the explorer turns the planet
   *  to it; nothing tears). */
  onNext?: () => void;
  /** Stop 01 on the entry, with the entrance bringing its stub (the stub
   *  hand-off, src/lib/explorer.ts): the cover's own stub stays hidden until
   *  STUB_LANDED_EVENT, and shows inside that event. */
  stubAwaited?: boolean;
  /** The stop after this one, printed on the stub's "Next stop" (null: this
   *  is the last, and the stub goes on to the end of the route). */
  nextStop?: { name: string; number: number; region?: string; slug?: string } | null;
  /** Desktop tickets: the atlas's dock (HomePage). The cover is rendered
   *  there, beside its place's shield, and placed every camera frame
   *  (src/lib/coverDock.ts); the section keeps the chapter's rail. */
  dockHost?: HTMLElement | null;
  /** The first place of a region of two or more carries the region's line
   *  ("REGION FLORIDA · 2 PLACES · 32 FRAMES") as a tab on its cover. */
  regionTab?: { region: string; places: number; frames: number } | null;
  /** The phone's explorer: the ticket is dealt as a card at the foot of the
   *  screen (src/lib/explorer.ts, phoneCard), not beside its shield. */
  phone?: boolean;
  /** Its cover is up: the explorer's rail shows this place's name and lede. */
  railShown?: boolean;
}

// Fraunces is served as a variable font (wght 400–900). The title racks on two
// axes as its chapter takes focus — weight up, tracking in — off ONE focus value,
// so the letters darken and draw together as the plate lands and open again as
// it leaves, on the same shared chapter timeline as the matte and scale.
// Weight is never animated alone: the pair is chosen so the measure holds
// roughly still. Measured on the served file at opsz 108, 400/−0.05em →
// 600/−0.065em moved every chapter name by under 2%; the pair now goes a
// step further (660/−0.07em) so the landing reads at a glance, and the word
// masks reserve the wider of the two end states, so whatever the measure does
// it can never reflow (see .archive-title-mask). Weight alone to 640 grew the
// names 3.4–6.8% and could move a line break mid-rack.
const TITLE_WEIGHT_REST = 400;
const TITLE_WEIGHT_FOCUS = 660;
// em. The cover title is set at −0.05em, the feature title at −0.025em
// (`tracking-tight`); both tighten by the same amount at focus.
const TITLE_TRACKING_TIGHTEN = 0.02;
const COVER_TITLE_TRACKING_REST = -0.05;
const FEATURE_TITLE_TRACKING_REST = -0.025;
// A chapter's title rises once, the first time the timeline comes this close.
const TITLE_RISE_DISTANCE = 0.62;
// ── The ticket ────────────────────────────────────────────────────────────
// A cover is a ticket: the photograph, one perforation, and a stub printed
// with the admission line. Every ticket is the same ANATOMY and no two are the
// same SHAPE, because the photograph still sets the shape — which is how a
// kept collection of stubs actually looks.
// Cutting every ticket to one length (2.05:1) was tried first and reverted:
// it turned a floor-to-ceiling portrait cover into a letterbox sliver and the
// map, not the photograph, became the subject of the page. That is precisely
// what the rule beside `coverRatio` protects against.
// The stub is printed matter: a fixed measure, it does not stretch with the
// picture beside it.
// One measure with the dock's plan (src/lib/coverDock.ts, DOCK.stub).
const TICKET_STUB = DOCK.stub;
// ── The admission: the one tear ──
// Held like a ticket in two hands (src/lib/ticketTear.ts, the score): the
// cover clicked (or its rail entered), the STUB comes off in the right hand
// — the score turned round, as /about's ticket is torn: the paper takes the
// strain, gives at the top notch, the rip runs down the perforation hole by
// hole, catching on each bridge, the stub hinges open about the running tip,
// snaps free and is laid aside — and only once the whole tear has played
// does the photograph, whole, grow into the story (owner, 2026-09-28: 当你
// 点击对应的封面的时候，完整的撕开票根动画开启). The explorer asks for it
// (`archive:tear-stub` on the section). Nothing else tears any more: moving
// between places is a switch (地点之间的移动现在不需要撕票根动效) — the ticket
// stays where it lies and becomes the next place's ("The switch", below).
// A ticket whose stub was torn is put back whole once its cover has gone, or
// the story closes (`archive:reseat`), so the next visit finds it as it was.
// The stub's score runs on one clock, `stubClock`, 0 whole → 1 gone over
// TEAR_MS.
// A docked cover let go fades out over this long (global.css `.archive-dock`,
// mirrored), on the fade curve.
const DOCK_FADE_MS = DUR_MS.out;
// …and while the stub's rip runs, nothing of the stub may cross into the
// face: its seat is cut away to the left of the seam.
const STUB_SEAM_CLIP = 'polygon(-100vw -100vh, calc(100% + 100vw) -100vh, calc(100% + 100vw) calc(100% + 100vh), -100vw calc(100% + 100vh), -100vw 100%, 0% 100%, 0% 0%, -100vw 0%)';
// A press that travels this far is a drag (a hand moving the map through the
// cover, a selection), and the click at its release is not a request for the
// story.
const CLICK_SLOP = 6;
// How long after a travelled press is let go its click is still the end of
// that drag (the browser fires it right after the release).
const DRAG_CLICK_WINDOW_MS = 800;
// The story waits for the whole tear (完整的撕开票根动画): the stub free, the
// snap, laid aside.
const STORY_AFTER_MS = TEAR_MS;
// The sign's flap ("The sign turns into place"): a board set to the stop
// being left at take-off is put back if no turn follows this soon.
const FLAP_PRIME_MAX_MS = 4200;
// A docked sign waits for its cover to appear at most this long.
const FLAP_DOCK_WAIT_MS = 1600;
// The shared quintic smootherstep (src/lib/motion.ts), the one RouteAtlas
// uses. The plate's matte, cue and copy accelerate and settle on the same
// curve as the map halo, route head and left-hand directory.
const smoothFocus = smootherstep;
// ── The switch (src/lib/coverDock.ts, "The switch") ──
// Laid over the ticket it replaces, a docked cover turns into its place's in
// place: its outline runs from the leaving ticket's to its own (clip-path,
// both covers, anchored at the stub's top-right: nothing is laid out again),
// its card eases from the leaving stock to its own (the stub, its caret and
// its sign's band, each a colour of its own), its print develops in over the leaving
// photograph from the corner by the stub (the house's develop mask), and its
// sign turns from the place left. A print not yet decoded holds the develop
// back this long at most.
const DEVELOP_WAIT_MS = 600;

/**
 * ArchiveChapter — a collection's homepage entry. Two layouts:
 *  - 'cover'   : a tall full-bleed photo with the name set large ON the image
 *                (the default, with the masthead crossing the map/photo seam).
 *  - 'feature' : an editorial 2-column spread (image + a text rail with the
 *                subtitle deck, an excerpt, a dateline, and the CTA) — used once,
 *                for the opener, to break the look-alike stack.
 * Hover keeps the same photograph, with a slow breath and a quiet story cue.
 */
export default memo(ArchiveChapter);

function ArchiveChapter({
  id,
  collection,
  onClick,
  index,
  isActive,
  chapterProgress,
  chapterIndex,
  chapterTotal,
  padStocks,
  sharedLayoutId,
  sharedImageRef,
  sharedImageSourceRef,
  preloadImageUrls = EMPTY_PRELOAD_IMAGE_URLS,
  prioritizeImage = false,
  onEngagementChange,
  highlighted = false,
  variant = 'cover',
  desktopMotion = false,
  onNext,
  stubAwaited = false,
  nextStop,
  dockHost = null,
  regionTab = null,
  phone = false,
  railShown = false,
}: ArchiveChapterProps) {
  const chapterRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  const interactiveHover = canHover && !reduce;
  const engaged = (canHover && isHovered) || isFocused || highlighted;
  const engagementTarget = useMotionValue(0);
  const engagementDepth = useSpring(engagementTarget, SPRING.answer);
  const pointerTargetX = useMotionValue(0);
  const pointerTargetY = useMotionValue(0);
  const pointerX = useSpring(pointerTargetX, SPRING.hand);
  const pointerY = useSpring(pointerTargetY, SPRING.hand);
  const interactionDepth = reduce ? engagementTarget : engagementDepth;
  const hoverScale = useTransform(interactionDepth, [0, 1], [1, reduce ? 1 : 1.014]);

  const titlePointerX = useTransform(pointerX, (value) => reduce ? 0 : value * -0.32);
  const titleOpenX = useTransform(interactionDepth, [0, 1], [0, reduce ? 0 : -4]);

  const plateCueX = useTransform(interactionDepth, [0, 1], [0, reduce ? 0 : 4]);
  const photoBoundsRef = useRef<DOMRect | null>(null);
  const engagementRef = useRef(false);
  // A highlight from the map lights the cover without reporting engagement
  // back (that would only echo the id the map already has).
  useEffect(() => {
    if (highlighted) engagementTarget.set(1);
    else if (!engagementRef.current) engagementTarget.set(0);
  }, [engagementTarget, highlighted]);

  const setEngagement = (next: boolean) => {
    engagementTarget.set(next ? 1 : 0);
    if (!next) {
      pointerTargetX.set(0);
      pointerTargetY.set(0);
      photoBoundsRef.current = null;
    }
    if (engagementRef.current === next) return;
    engagementRef.current = next;
    onEngagementChange?.(next ? collection._id : null);
  };

  const handlePhotoPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactiveHover || event.pointerType === 'touch') return;
    photoBoundsRef.current = event.currentTarget.getBoundingClientRect();
  };

  const handlePhotoPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactiveHover || event.pointerType === 'touch') return;
    // A pressed hand (a drag across the cover, a selection) is not a hover:
    // the photograph holds where the hover left it until the button is up.
    if (event.buttons !== 0) return;
    const rect = photoBoundsRef.current ?? event.currentTarget.getBoundingClientRect();
    photoBoundsRef.current = rect;
    const x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
    const y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
    pointerTargetX.set(x * 10);
    pointerTargetY.set(y * 6);
  };

  const handlePhotoPointerLeave = () => {
    pointerTargetX.set(0);
    pointerTargetY.set(0);
    photoBoundsRef.current = null;
  };

  // A stationary pointer can stay over the cover while the page moves. Read
  // fresh geometry on its next movement, without measuring on every scroll.
  useEffect(() => {
    if (!isHovered || !interactiveHover) return;
    const invalidateBounds = () => { photoBoundsRef.current = null; };
    window.addEventListener('scroll', invalidateBounds, { passive: true, capture: true });
    window.addEventListener('resize', invalidateBounds, { passive: true });
    return () => {
      window.removeEventListener('scroll', invalidateBounds, true);
      window.removeEventListener('resize', invalidateBounds);
    };
  }, [isHovered, interactiveHover]);

  useEffect(() => () => {
    if (engagementRef.current) onEngagementChange?.(null);
  }, [onEngagementChange]);

  const resolvedChapterIndex = chapterIndex ?? index;
  const fallbackChapterProgress = useMotionValue(
    isActive ? resolvedChapterIndex : resolvedChapterIndex + 1,
  );
  const resolvedChapterProgress = chapterProgress ?? fallbackChapterProgress;

  // Existing callers can continue to drive the component with `isActive`.
  // Once the parent provides a shared fractional timeline, every chapter reads
  // that same MotionValue and this fallback becomes inert.
  // A docked chapter (the explorer's) is set at once: its rail shows only
  // while its place is in hand and crossfades on its own (global.css
  // `.explorer-place`), and its ticket turns by the switch; eased over 0.72 s
  // the focus only restyled the rail — and re-set the title's weight, a new
  // layout — on every frame of a switch.
  const settleAtOnce = variant === 'cover' && Boolean(desktopMotion);
  useEffect(() => {
    if (chapterProgress) return;
    const target = isActive ? resolvedChapterIndex : resolvedChapterIndex + 1;
    if (reduce || settleAtOnce) {
      fallbackChapterProgress.set(target);
      return;
    }
    const controls = animate(fallbackChapterProgress, target, {
      duration: 0.72,
      ease: EASE.arrive,
    });
    return () => controls.stop();
  }, [chapterProgress, fallbackChapterProgress, isActive, reduce, resolvedChapterIndex, settleAtOnce]);

  // The shared timeline also choreographs the editorial handoff. Treat the
  // outgoing and incoming chapter differently: the chapter being left gives
  // up contrast first, while the approaching chapter keeps more photographic
  // presence and resolves its copy slightly later. At the exact midpoint the
  // map route remains the visual lead instead of two cards competing equally.
  // The photograph itself takes no part in it (直接出现就好): it is never
  // cropped, zoomed, faded or moved on its way in — it is simply there, whole,
  // and the page's own scroll carries it. Only its grade (the matte), its
  // cue, and the type answer the timeline.
  const chapterDelta = useTransform(resolvedChapterProgress, (position) =>
    Math.max(-1, Math.min(1, position - resolvedChapterIndex)),
  );
  // A desktop ticket rides on the map beside its shield, alone, with no
  // name set over its foot: it is printed nearly clean (owner, 2026-09-28:
  // the chapters read too dark), a breath of grade that deepens only as the
  // camera leaves it.
  const cleanGrade = variant === 'cover' && Boolean(desktopMotion);
  const matteRest = cleanGrade ? 0.05 : 0.24;
  const scrollMatteOpacity = useTransform(chapterDelta, (delta) => {
    if (reduce) return Math.round(delta) === 0 ? matteRest : matteRest + 0.18;
    const distance = smoothFocus(Math.abs(delta));
    return matteRest + distance * (delta < 0 ? 0.18 : 0.27);
  });
  const matteOpacity = useTransform(
    [scrollMatteOpacity, interactionDepth],
    ([matte, interaction]) => Math.max(cleanGrade ? 0 : 0.12, Number(matte) - Number(interaction) * 0.085),
  );
  const editorialOpacity = useTransform(chapterDelta, (delta) => {
    if (reduce) return Math.round(delta) === 0 ? 1 : 0.72;
    const distance = smoothFocus(Math.abs(delta));
    return 1 - distance * (delta < 0 ? 0.3 : 0.52);
  });
  const editorialShift = useTransform(chapterDelta, (delta) => {
    if (reduce) return 0;
    const distance = smoothFocus(Math.abs(delta));
    return distance * (delta < 0 ? 14 : -12);
  });
  // A chapter the reader has passed takes its lede with it. At 0.38 of its
  // ink (0.24 in all) the last chapter's paragraph stayed printed under the
  // nav while the next one was being read — 2.2:1 residue over the atlas at
  // rest (owner, 2026-09-27: at rest a chapter reads as its place, its
  // ticket, its name and its lede). Still scroll-owned and reversible: mid-
  // handoff the leaving lede is half there, as before.
  const fieldNoteOpacity = useTransform(chapterDelta, (delta) => {
    if (reduce) return Math.round(delta) === 0 ? 1 : 0.68;
    const distance = smoothFocus(Math.abs(delta));
    return 1 - distance * (delta < 0 ? 0.38 : 1);
  });
  const fieldNoteShift = useTransform(chapterDelta, (delta) => {
    if (reduce) return 0;
    const distance = smoothFocus(Math.abs(delta));
    return distance * (delta < 0 ? 18 : -10);
  });

  // One cue lit at a time. Resting at 0.42 on every plate, "OPEN STORY" was
  // printed once per chapter down the whole column, which is not an invitation
  // but a watermark. It now belongs to the plate on the reading line, and to
  // the plate being pointed at — which are usually the same one.
  // On the line it is printed whole (owner, 2026-09-27: the cue was too dark
  // to read — at 0.5 of 0.7 ink it measured 2.8:1 on the atlas). The hover
  // answers in ink and the arrow's step (global.css), and lifts a cue off a
  // neighbouring plate.
  const plateCueOpacity = useTransform(
    [chapterDelta, interactionDepth],
    ([delta, interaction]) => {
      const distance = reduce
        ? (Math.round(Number(delta)) === 0 ? 0 : 1)
        : smoothFocus(Math.min(1, Math.abs(Number(delta))));
      // Squared, so the cue belongs to the plate on the line rather than being
      // shared out between the two either side of a handoff.
      const proximity = (1 - distance) * (1 - distance);
      // Added rather than `Math.max`ed: with a max, the hover spring has to
      // climb past 0.55 before the cue on the line moves at all, so the first
      // half of every hover is silent and the second half races.
      return Math.min(1, proximity + Number(interaction) * 0.6);
    },
  );

  // The section's own passage through the viewport: read by the type only
  // (the masthead's and kicker's counter-parallax, the feature title's lime
  // word). The cover is never driven by it.
  const { scrollYProgress } = useScroll({ target: chapterRef, offset: ['start end', 'end start'] });
  // One focus value feeds both title axes, so weight and tracking can never
  // disagree about where the plate is. Rest (0) whenever the rack is off.
  const titleFocus = useTransform(chapterDelta, (delta) =>
    !desktopMotion || reduce ? 0 : 1 - smoothFocus(Math.abs(delta)),
  );
  const titleWeight = useTransform(titleFocus, (focus) =>
    Math.round(TITLE_WEIGHT_REST + (TITLE_WEIGHT_FOCUS - TITLE_WEIGHT_REST) * focus),
  );
  const titleTrackingRest = variant === 'feature' ? FEATURE_TITLE_TRACKING_REST : COVER_TITLE_TRACKING_REST;
  // A string with its unit: framer has no value type for letter-spacing, so a
  // bare number would land in the stylesheet as an invalid `-0.05`.
  const titleTracking = useTransform(titleFocus, (focus) =>
    `${(titleTrackingRest - TITLE_TRACKING_TIGHTEN * focus).toFixed(4)}em`,
  );
  // The masked rise plays once per visit, the first time this chapter nears
  // focus. It is type, not the cover: the photograph under it is already
  // whole.
  const titleRiseEnabled = desktopMotion && !reduce;
  const [titleRisen, setTitleRisen] = useState(!titleRiseEnabled);
  useEffect(() => {
    if (!titleRiseEnabled) {
      setTitleRisen(true);
      return;
    }
    if (titleRisen) return;
    if (Math.abs(chapterDelta.get()) < TITLE_RISE_DISTANCE) {
      setTitleRisen(true);
      return;
    }
    return chapterDelta.on('change', (delta) => {
      if (Math.abs(delta) < TITLE_RISE_DISTANCE) setTitleRisen(true);
    });
  }, [chapterDelta, titleRiseEnabled, titleRisen]);
  // ── The ticket (see "The admission" above the component) ──────────────
  const ticket = variant === 'cover' && Boolean(desktopMotion);
  // ── The dock (src/lib/coverDock.ts) ──
  // A ticket is not printed in its section: it rides on the atlas, beside its
  // place's shield, at the dock's one corner (on a phone it is dealt at the
  // foot of the screen instead, `phone`). The section keeps the chapter's
  // rail (the name, the lede). The atlas publishes, every camera frame, where
  // each place stands and the place whose cover shows; the cover is written
  // there, and shows only while its place is in hand — it appears when the
  // camera settles on it from the open map (no slide), rides with its shield
  // wherever the reader takes the map, stays where it lies through a switch
  // (pinned: "The switch" below), and fades out when the place is let go.
  const docked = ticket;
  const dockRef = useRef<HTMLDivElement>(null);
  const dockEntry = useSyncExternalStore(
    coverDock.subscribePlan,
    () => (docked && !phone ? coverDock.plan()?.[collection._id] ?? null : null),
    () => null,
  );
  // The phone's card: sized from the screen and the photograph's own ratio
  // (src/lib/explorer.ts), again on a resize, never measured.
  const [card, setCard] = useState<PhoneCard | null>(null);
  const cardRatio = coverRatioOf(collection.coverImageUrl ?? collection.photos?.[0]?.imageUrl ?? '') ?? 1.5;
  useEffect(() => {
    if (!docked || !phone) {
      setCard(null);
      return;
    }
    const size = () => setCard(phoneCard(window.innerWidth, window.innerHeight, cardRatio));
    size();
    window.addEventListener('resize', size, { passive: true });
    return () => window.removeEventListener('resize', size);
  }, [cardRatio, docked, phone]);
  const dockReady = Boolean(docked && dockHost && (phone ? card : dockEntry));
  // Put back whole, at once and unseen (the cover has gone, or the story
  // covers it): the stub's clock to the start, nothing torn.
  const reseatRef = useRef<() => void>(() => {});
  // Whether the cover is on the atlas now.
  const dockShownRef = useRef(false);
  // Called once when the cover next appears (the sign's flap waits for it).
  const dockAppearRef = useRef<(() => void) | null>(null);
  const plateRef = useRef<HTMLDivElement>(null);

  // ── The switch (src/lib/coverDock.ts, "The switch") ──
  // The arriving cover (`in`) is laid over the leaving one (`out`), both
  // pinned where the ticket lay; each plays its half on the compositor or
  // as a paint (clip-path, three colours, a mask): nothing here is laid
  // out again or measured.
  const switchRef = useRef<{
    key: number;
    role: 'in' | 'out';
    anims: Animation[];
    timers: number[];
    develop: Animation | null;
  } | null>(null);
  const clearDevelop = (print: HTMLElement | null) => {
    if (!print) return;
    print.style.removeProperty('mask-image');
    print.style.removeProperty('-webkit-mask-image');
    print.style.removeProperty('mask-size');
    print.style.removeProperty('-webkit-mask-size');
    print.style.removeProperty('mask-repeat');
    print.style.removeProperty('-webkit-mask-repeat');
  };
  // Ends this cover's part in a switch: `finish` plays what is left to its
  // end at once (a print half developed is printed whole).
  const endSwitch = (finish = false) => {
    const record = switchRef.current;
    if (!record) return;
    switchRef.current = null;
    record.timers.forEach((timer) => window.clearTimeout(timer));
    record.anims.forEach((anim) => anim.cancel());
    record.develop?.cancel();
    const dock = dockRef.current;
    const plate = plateRef.current;
    clearDevelop(plate?.querySelector<HTMLElement>('.archive-photo-frame__print') ?? null);
    plate?.querySelector<HTMLElement>('.archive-photo-frame__mat')?.removeAttribute('data-on');
    dock?.removeAttribute('data-switch');
    if (finish && record.role === 'in') {
      dock?.setAttribute('data-arrived', '');
      window.setTimeout(() => dock?.removeAttribute('data-arrived'), SWITCH_COVER.extrasMs);
    }
  };
  // The card eased from one stock to another: only what is printed in it —
  // the stub, the caret cut from it, the sign's shield band — each on its
  // own (animating the inherited stock itself restyled the whole ticket
  // every frame).
  const paperFrom = (plate: HTMLElement, from: string, to: string, hold: boolean): Animation[] => {
    const timing: KeyframeAnimationOptions = { duration: SWITCH_COVER.paperMs, easing: CSS_EASE.travel, ...(hold ? { fill: 'forwards' as const } : null) };
    const anims: Animation[] = [];
    const stub = plate.querySelector<HTMLElement>('.archive-ticket-stub');
    const caret = plate.querySelector<HTMLElement>('.archive-plate__caret[data-half="stub"]');
    const band = plate.querySelector<SVGElement>('.archive-ticket-sign__shield .route-shield__band');
    if (stub) anims.push(stub.animate([{ backgroundColor: from }, { backgroundColor: to }], timing));
    if (caret) anims.push(caret.animate([{ backgroundColor: from }, { backgroundColor: to }], timing));
    if (band) anims.push(band.animate([{ fill: from }, { fill: to }], timing));
    return anims;
  };
  // This cover arrives over `fromId`'s.
  const switchIn = (fromId: string, key: number) => {
    endSwitch();
    const dock = dockRef.current;
    const plate = plateRef.current;
    if (!dock || !plate) return;
    const plan = coverDock.plan();
    const mine: DockEntry | null = phone ? null : plan?.[collection._id] ?? null;
    const theirs: DockEntry | null = phone ? null : plan?.[fromId] ?? null;
    const leaving = document.querySelector<HTMLElement>(`[data-cover-for="archive-item-${CSS.escape(fromId)}"] .archive-plate`);
    const fromStock = theirs?.stock ?? leaving?.style.getPropertyValue('--stub-paper').trim() ?? '';
    const myStock = stockPaper(collection.slug);
    const record = { key, role: 'in' as const, anims: [] as Animation[], timers: [] as number[], develop: null as Animation | null };
    switchRef.current = record;
    dock.setAttribute('data-switch', 'in');
    if (reduce) {
      // Values, not structure: the ticket is the next place's at once.
      endSwitch(true);
      return;
    }
    // The card: from the stock it leaves to its own.
    if (fromStock && fromStock !== myStock) record.anims.push(...paperFrom(plate, fromStock, myStock, false));
    // The outline: from the leaving ticket's to its own, anchored at the
    // stub's top-right (desktop; the phone's cards are dealt whole).
    const mat = plate.querySelector<HTMLElement>('.archive-photo-frame__mat');
    if (mine && theirs) {
      const own = { w: mine.photoW + TICKET_STUB, h: mine.photoH };
      const from = { w: theirs.photoW + TICKET_STUB, h: theirs.photoH };
      if (own.w !== from.w || own.h !== from.h) {
        record.anims.push(plate.animate(
          [{ clipPath: switchClip(own, from) }, { clipPath: switchClip(own, own) }],
          { duration: SWITCH_COVER.shapeMs, easing: CSS_EASE.travel },
        ));
      }
      const matShape = matPolygon({ w: mine.photoW, h: mine.photoH }, { w: theirs.photoW, h: theirs.photoH });
      if (mat && matShape) {
        mat.style.clipPath = matShape;
        mat.setAttribute('data-on', '');
      }
    } else if (mat) {
      mat.style.clipPath = 'none';
      mat.setAttribute('data-on', '');
    }
    // The print develops in over the one leaving, from the corner by the
    // stub (held back, a moment at most, for a print not yet decoded).
    const print = plate.querySelector<HTMLElement>('.archive-photo-frame__print');
    if (print) {
      const sweep = developSweep(mine ? mine.photoW / Math.max(1, mine.photoH) : cardRatio);
      print.style.setProperty('mask-image', DEVELOP_MASK);
      print.style.setProperty('-webkit-mask-image', DEVELOP_MASK);
      print.style.setProperty('mask-size', '400% 100%');
      print.style.setProperty('-webkit-mask-size', '400% 100%');
      print.style.setProperty('mask-repeat', 'no-repeat');
      print.style.setProperty('-webkit-mask-repeat', 'no-repeat');
      const develop = print.animate(
        [
          { maskPosition: `${sweep.from.toFixed(2)}% 0`, webkitMaskPosition: `${sweep.from.toFixed(2)}% 0` },
          { maskPosition: `${sweep.to.toFixed(2)}% 0`, webkitMaskPosition: `${sweep.to.toFixed(2)}% 0` },
        ] as Keyframe[],
        { duration: SWITCH_COVER.developMs, delay: SWITCH_COVER.developDelay, easing: CSS_EASE.develop, fill: 'both' },
      );
      record.develop = develop;
      const image = print.querySelector('img');
      if (image && !image.complete) {
        develop.pause();
        let started = false;
        const go = () => {
          if (started || switchRef.current !== record) return;
          started = true;
          develop.play();
        };
        image.decode?.().then(go, go);
        record.timers.push(window.setTimeout(go, DEVELOP_WAIT_MS));
      }
      develop.onfinish = () => {
        if (switchRef.current !== record || record.develop !== develop) return;
        record.develop = null;
        develop.cancel();
        clearDevelop(print);
        mat?.removeAttribute('data-on');
        // The outline was set already: the switch is over for this cover.
        if (!dock.hasAttribute('data-switch')) switchRef.current = null;
      };
    }
    // The outline set, the tab, the cue and the pad come in on it.
    record.timers.push(window.setTimeout(() => {
      if (switchRef.current !== record) return;
      dock.removeAttribute('data-switch');
      dock.setAttribute('data-arrived', '');
      record.timers.push(window.setTimeout(() => dock.removeAttribute('data-arrived'), SWITCH_COVER.extrasMs));
      if (!record.develop) switchRef.current = null;
    }, SWITCH_COVER.shapeMs));
  };
  // This cover leaves under `toId`'s: it lies still under the arriving one,
  // its outline running to the arriving one's, its card to the arriving
  // stock (whatever of it still shows below or beside the new ticket).
  const switchOut = (toId: string, key: number) => {
    // An arrival cut short by the next switch: its print is printed whole
    // (the ticket it came over has gone from under it).
    const was = switchRef.current;
    if (was?.role === 'in' && was.develop) {
      was.develop.finish();
    }
    endSwitch();
    const dock = dockRef.current;
    const plate = plateRef.current;
    if (!dock || !plate) return;
    const record = { key, role: 'out' as const, anims: [] as Animation[], timers: [] as number[], develop: null as Animation | null };
    switchRef.current = record;
    dock.setAttribute('data-switch', 'out');
    if (reduce || phone) return;
    const plan = coverDock.plan();
    const mine = plan?.[collection._id];
    const theirs = plan?.[toId];
    if (!mine || !theirs) return;
    const own = { w: mine.photoW + TICKET_STUB, h: mine.photoH };
    const to = { w: theirs.photoW + TICKET_STUB, h: theirs.photoH };
    if (own.w !== to.w || own.h !== to.h) {
      record.anims.push(plate.animate(
        [{ clipPath: switchClip(own, own) }, { clipPath: switchClip(own, to) }],
        { duration: SWITCH_COVER.shapeMs, easing: CSS_EASE.travel, fill: 'forwards' },
      ));
    }
    const toStock = theirs.stock;
    const myStock = stockPaper(collection.slug);
    if (toStock && toStock !== myStock) record.anims.push(...paperFrom(plate, myStock, toStock, true));
  };
  const switchInRef = useRef(switchIn);
  switchInRef.current = switchIn;
  const switchOutRef = useRef(switchOut);
  switchOutRef.current = switchOut;
  const endSwitchRef = useRef(endSwitch);
  endSwitchRef.current = endSwitch;

  useEffect(() => {
    if (!dockReady) return;
    const dock = dockRef.current;
    if (!dock) return;
    const me = collection._id;
    let shown = false;
    let leaving = false;
    let seenKey = 0;
    let hiddenAt = Number.NEGATIVE_INFINITY;
    let reseatTimer = 0;
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    const off = coverDock.subscribe((frame) => {
      const at = frame.at === me;
      const sw = frame.switch ?? null;
      const out = !at && !!sw && sw.from === me;
      // A new switch this cover is part of.
      if (sw && sw.key !== seenKey && (sw.to === me || sw.from === me)) {
        seenKey = sw.key;
        if (sw.to === me && at) switchInRef.current(sw.from, sw.key);
        else if (sw.from === me) switchOutRef.current(sw.to, sw.key);
      }
      if (out !== leaving) {
        leaving = out;
        if (out) {
          dock.setAttribute('data-leaving', '');
        } else {
          // Its switch is over: it goes from under the new ticket at once —
          // no fade, which would show its whole outline for a moment.
          dock.setAttribute('data-cut', '');
          if (switchRef.current?.role === 'out') endSwitchRef.current();
          dock.removeAttribute('data-leaving');
          requestAnimationFrame(() => requestAnimationFrame(() => dock.removeAttribute('data-cut')));
        }
      }
      if (at !== shown) {
        shown = at;
        dockShownRef.current = at;
        window.clearTimeout(reseatTimer);
        if (at) {
          dock.setAttribute('data-at', '');
          const appeared = dockAppearRef.current;
          dockAppearRef.current = null;
          appeared?.();
        } else {
          dock.removeAttribute('data-at');
          // Let go while arriving: nothing of the switch stays.
          if (switchRef.current?.role === 'in') endSwitchRef.current();
          hiddenAt = performance.now();
          // Gone: once its fade is done, the ticket is put back whole for
          // the next visit (a stub torn off for the story).
          reseatTimer = window.setTimeout(() => reseatRef.current(), DOCK_FADE_MS + 60);
        }
      }
      // The phone's card is dealt at the foot of the screen: nothing to place.
      if (phone) return;
      // Hidden, its fade long done: nothing to place until it shows again.
      if (!at && !out && performance.now() - hiddenAt > DOCK_FADE_MS + 120) return;
      // Pinned through a switch (where the ticket lies), else at its foot.
      const point = frame.pin && (at || out) ? frame.pin : frame.points[me];
      if (!point || (point.x === lastX && point.y === lastY)) return;
      lastX = point.x;
      lastY = point.y;
      dock.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
    });
    return () => {
      off();
      window.clearTimeout(reseatTimer);
      dockShownRef.current = false;
      endSwitchRef.current();
    };
  }, [collection._id, dockReady, phone]);

  // ── The stub hand-off (src/lib/explorer.ts) ──
  // Stop 01 on an entry the entrance brings the stub for: the photograph
  // shows, the stub and its caret wait (global.css `[data-stub-awaited]`),
  // and show inside STUB_LANDED_EVENT itself — the frame the entrance's
  // copy goes.
  useLayoutEffect(() => {
    const plate = plateRef.current;
    if (!plate) return;
    if (!stubAwaited) {
      plate.removeAttribute('data-stub-awaited');
      return;
    }
    plate.setAttribute('data-stub-awaited', '');
    const landed = () => plate.removeAttribute('data-stub-awaited');
    window.addEventListener(STUB_LANDED_EVENT, landed);
    return () => window.removeEventListener(STUB_LANDED_EVENT, landed);
  }, [dockReady, stubAwaited]);

  const tearFrameRef = useRef<TearFrame>({ w: 0, h: 0, vw: 0 });
  // The stub's box, for its tear (the score turned round).
  const stubFrameRef = useRef<TearFrame>({ w: 0, h: 0, vw: 0 });
  const redrawTearRef = useRef<(() => void) | null>(null);
  // The score's frame and the torn edge, measured once per layout (the
  // photograph's box, the stub's, the viewport's width), never per frame.
  useEffect(() => {
    if (!ticket || !dockReady) return;
    const cover = dockRef.current;
    if (!cover) return;
    let edgeHeight = 0;
    const measure = () => {
      const tearBox = cover.querySelector<HTMLElement>('.archive-plate__tear');
      const stubBox = cover.querySelector<HTMLElement>('.archive-ticket-stub');
      tearFrameRef.current = {
        w: tearBox?.offsetWidth ?? 0,
        h: tearBox?.offsetHeight ?? 0,
        vw: window.innerWidth,
      };
      stubFrameRef.current = {
        w: stubBox?.offsetWidth ?? 0,
        h: stubBox?.offsetHeight ?? 0,
        vw: window.innerWidth,
      };
      // The torn edge: one profile per ticket (seeded by its chapter, so it
      // tears the same way every time), drawn at the seam's own length.
      const seam = Math.round(tearFrameRef.current.h);
      if (seam > 0 && seam !== edgeHeight) {
        edgeHeight = seam;
        const edge = tornEdge(seam, resolvedChapterIndex);
        const plate = cover.querySelector<HTMLElement>('.archive-plate');
        plate?.style.setProperty('--ticket-edge-face', edge.faceCut);
        plate?.style.setProperty('--ticket-edge-stub', edge.stubCut);
        cover.querySelector<HTMLElement>('.archive-photo-frame > .archive-ticket-fibre')
          ?.style.setProperty('background-image', edge.faceFringe);
        cover.querySelector<HTMLElement>('.archive-ticket-stub > .archive-ticket-fibre')
          ?.style.setProperty('background-image', edge.stubFringe);
      }
      redrawTearRef.current?.();
    };
    measure();
    const plate = cover.querySelector<HTMLElement>('.archive-plate');
    const resizeObserver = typeof ResizeObserver === 'undefined' || !plate ? null : new ResizeObserver(measure);
    if (plate) resizeObserver?.observe(plate);
    window.addEventListener('resize', measure, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [dockReady, resolvedChapterIndex, ticket]);

  // The stub's own clock (the admission tear), 0 whole → 1 gone.
  const stubClock = useMotionValue(0);
  const [stubTorn, setStubTorn] = useState(false);
  const stubTornRef = useRef(false);
  const stubPlayRef = useRef<{ stop: () => void } | null>(null);
  const goTimerRef = useRef(0);
  useEffect(() => () => {
    stubPlayRef.current?.stop();
    window.clearTimeout(goTimerRef.current);
  }, []);

  // ── The pose, written (src/lib/ticketTear.ts, `tearPose`) ──────────────
  // One writer. Whenever the stub's clock changes, the score's pose is
  // computed once and written as custom properties and a few inline styles
  // on the elements it moves (global.css, "The tear") — never through
  // framer, so nothing fights it — and only what changed is written. No
  // layout is read. At rest everything is cleared, so the server render and
  // the client agree.
  // The admission: the stub pulled off by the right hand, the face kept in
  // the left (the score turned round, `mirrorAffine`, as /about's ticket
  // tears): its seam is its left edge, it hinges about the rip's tip there,
  // its top-right corner drops first and it is laid aside up and to the
  // right. The face gives a hair about its grip and never dims.
  useEffect(() => {
    if (!ticket) return;
    const plate = plateRef.current;
    if (!plate) return;
    const pick = (selector: string) => plate.querySelector<HTMLElement>(selector);
    const face = pick('.archive-plate__face');
    const stubSeat = pick('.archive-ticket-stub-seat');
    const frame = pick('.archive-photo-frame');
    const stub = pick('.archive-ticket-stub');
    const fibres = [pick('.archive-photo-frame > .archive-ticket-fibre'), pick('.archive-ticket-stub > .archive-ticket-fibre')];
    const strains = [pick('.archive-photo-frame > .archive-ticket-strain'), pick('.archive-ticket-stub > .archive-ticket-strain')];
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
      const stubAt = stubClock.get();
      if (stubAt <= 0) {
        clear();
        return;
      }
      const box = stubFrameRef.current;
      const pose = tearPose(stubAt * TEAR_MS, box, { reduced: Boolean(reduce) });
      const moving = stubAt > 0 && stubAt < 1;
      put(stub, 'transform-origin', '0 0');
      put(stub, '--tear-stf', reduce ? null : affineCss(mirrorAffine(pose.m, box.w)));
      put(stub, '--tear-sop', pose.op >= 1 ? null : pose.op.toFixed(3));
      put(stub, 'will-change', moving ? 'transform, opacity' : null);
      put(stubSeat, 'clip-path', pose.seam ? STUB_SEAM_CLIP : null);
      const tornPx = pose.tip > 0 ? `${(pose.tip * box.h).toFixed(1)}px` : null;
      put(frame, '--ticket-torn', tornPx);
      put(stub, '--ticket-torn', tornPx);
      fibres.forEach((fibre) => {
        put(fibre, 'clip-path', pose.tip > 0 ? `inset(0 0 ${((1 - pose.tip) * 100).toFixed(2)}% 0)` : null);
        put(fibre, 'opacity', pose.tip > 0 ? '1' : null);
      });
      strains.forEach((strain, index) => {
        const amount = pose.strain * (index === 0 ? 0.9 : 1);
        put(strain, 'clip-path', amount > 0 ? `inset(${(pose.tip * 100).toFixed(2)}% 0 0 0)` : null);
        put(strain, 'opacity', amount > 0 ? amount.toFixed(3) : null);
      });
      const gives = !reduce && (pose.stubDeg !== 0 || pose.stubY !== 0);
      put(face, '--tear-tf', gives ? `translateY(${pose.stubY.toFixed(2)}px) rotate(${(-pose.stubDeg).toFixed(3)}deg)` : null);
    };
    redrawTearRef.current = draw;
    const offStub = stubClock.on('change', draw);
    draw();
    return () => {
      redrawTearRef.current = null;
      offStub();
      clear();
    };
    // `dockReady`: a docked plate is on the page only once the dock is.
  }, [dockReady, reduce, stubClock, ticket]);
  // A still press on the cover gives a hair (a click), and settles back the
  // moment it travels CLICK_SLOP (a drag, a selection).
  const pressGive = usePressGive(!reduce, { slop: CLICK_SLOP });
  // Every press on the cover: where it went down and whether it has since
  // travelled CLICK_SLOP. A press that travelled is a drag and the click the
  // browser fires at its release is not a request for the story. Mouse and
  // pen only: a finger that travels is a scroll, and the browser has already
  // cancelled its click.
  const pressRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  // When a travelled press was let go on the cover (see DRAG_CLICK_WINDOW_MS).
  const dragReleaseRef = useRef(0);

  // ── The admission: the stub, torn off to open the story ──
  // A click on the cover (or Enter on its rail) opens its story, and the
  // opening gesture is the tear: the stub comes off in the right hand while
  // the photograph lies still, and only once the whole tear has played does
  // the story grow out of the photograph (`go`). The half the reader keeps
  // goes into the story's rail (MagazineLayout, KeptStub) and back onto this
  // ticket at the close. Under reduced motion the stub fades in place.
  // Mid-switch, the switch ends first (the ticket under this one must not
  // show through the tear's gap; this print is printed whole).
  const tearStubThen = (go: () => void) => {
    if (!ticket || !dockShownRef.current) return false;
    if (stubTornRef.current) return false;
    if (switchRef.current) {
      switchRef.current.develop?.finish();
      endSwitch(true);
    }
    coverDock.settle();
    stubTornRef.current = true;
    setStubTorn(true);
    stubPlayRef.current?.stop();
    const controls = animate(stubClock, [0, TEAR_FREE_MS / TEAR_MS, 1], {
      duration: (reduce ? TEAR_REDUCED_MS : TEAR_MS) / 1000,
      times: [0, reduce ? 0.5 : TEAR_FREE_MS / TEAR_MS, 1],
      ease: 'linear',
    });
    stubPlayRef.current = { stop: () => controls.stop() };
    window.clearTimeout(goTimerRef.current);
    goTimerRef.current = window.setTimeout(() => {
      goTimerRef.current = 0;
      go();
    }, reduce ? TEAR_REDUCED_MS : STORY_AFTER_MS);
    return true;
  };
  const tearStubThenRef = useRef(tearStubThen);
  tearStubThenRef.current = tearStubThen;
  reseatRef.current = () => {
    window.clearTimeout(goTimerRef.current);
    goTimerRef.current = 0;
    stubPlayRef.current?.stop();
    stubPlayRef.current = null;
    stubClock.set(0);
    if (stubTornRef.current) {
      stubTornRef.current = false;
      setStubTorn(false);
    }
  };
  useEffect(() => {
    if (!ticket) return;
    const section = chapterRef.current as HTMLElement | null;
    if (!section) return;
    const onTearStub = (event: Event) => {
      const detail = (event as CustomEvent<{ go: () => void; handled?: boolean }>).detail;
      if (detail && !detail.handled) detail.handled = tearStubThenRef.current(detail.go);
    };
    const onReseat = () => reseatRef.current();
    section.addEventListener('archive:tear-stub', onTearStub);
    section.addEventListener('archive:reseat', onReseat);
    return () => {
      section.removeEventListener('archive:tear-stub', onTearStub);
      section.removeEventListener('archive:reseat', onReseat);
    };
  }, [ticket]);

  // The stub's own "Next stop": live on the ticket being read, while its stub
  // is on it. It asks the explorer as Next does (the switch; nothing tears).
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const nextReady = ticket && isActive && !stubTorn && Boolean(onNext);
  const goNext = () => {
    if (!nextReady) return;
    onNextRef.current?.();
  };

  // ── The sign turns into place ──
  // 下一站同样产生位置字母跳转功能: the stub's shield and name run a departure
  // board's flap (src/lib/routeShield.ts, FLAP) from the place the camera
  // left. RouteAtlas tells the page at take-off (`atlas:depart`) and at
  // touchdown (`atlas:arrive`), with the place left as `from` (none from the
  // open map, none on the entry):
  //  - At take-off the board is SET to the stop being left (`primeFlap`), so
  //    the ticket reads "MIAMI" until it turns — the name it lands with is
  //    never shown settled first and turned back. It turns as soon as its
  //    cover is up: at once on a switch (the ticket in hand becomes this
  //    one where it lies, and the board turns while the planet does, like
  //    the reference's), or when it appears at its shield after a flight
  //    from the open map (at most FLAP_DOCK_WAIT_MS after the landing).
  //  - A take-off anywhere else puts this board back; so does a landing
  //    elsewhere, and FLAP_PRIME_MAX_MS with no turn at all.
  // Never on a first paint, a restore, a snap or the entry (whose ticket
  // comes up with nothing to turn from), and never under reduced motion,
  // where the sign is simply printed.
  const signRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ticket || reduce) return;
    const id = collection._id;
    type SignTrip = { id: string; from: Partial<Record<string, string>> | null };
    let stopFlap: (() => void) | null = null;
    let clearPrime: (() => void) | null = null;
    let primeTimer = 0;
    let waitTimer = 0;
    // The trip the board is primed for, until it has turned.
    let pending: Partial<Record<string, string>> | null = null;
    const unprime = () => {
      window.clearTimeout(primeTimer);
      primeTimer = 0;
      clearPrime?.();
      clearPrime = null;
    };
    const cancelWait = () => {
      window.clearTimeout(waitTimer);
      waitTimer = 0;
      dockAppearRef.current = null;
    };
    const reset = () => {
      cancelWait();
      stopFlap?.();
      stopFlap = null;
      pending = null;
      unprime();
    };
    const start = () => {
      const root = signRef.current;
      const from = pending;
      cancelWait();
      if (!root || !from) return;
      pending = null;
      window.clearTimeout(primeTimer);
      primeTimer = 0;
      stopFlap?.();
      // runFlap takes the primed board over where it stands.
      clearPrime = null;
      stopFlap = runFlap(root, from);
    };
    const onDepart = (event: Event) => {
      const detail = (event as CustomEvent<SignTrip>).detail;
      reset();
      const root = signRef.current;
      if (!detail || detail.id !== id || !detail.from || !root) return;
      pending = detail.from;
      clearPrime = primeFlap(root, detail.from);
      primeTimer = window.setTimeout(() => {
        pending = null;
        unprime();
      }, FLAP_PRIME_MAX_MS);
      // A switch shows this cover at once (the next published frame); from
      // the open map it appears at the landing.
      if (dockShownRef.current) start();
      else dockAppearRef.current = start;
    };
    const onArrive = (event: Event) => {
      const detail = (event as CustomEvent<SignTrip>).detail;
      if (!detail) return;
      if (detail.id !== id) {
        if (clearPrime) unprime();
        pending = null;
        return;
      }
      if (!pending) return;
      if (dockShownRef.current) start();
      else {
        dockAppearRef.current = start;
        window.clearTimeout(waitTimer);
        waitTimer = window.setTimeout(start, FLAP_DOCK_WAIT_MS);
      }
    };
    window.addEventListener('atlas:depart', onDepart);
    window.addEventListener('atlas:arrive', onArrive);
    return () => {
      window.removeEventListener('atlas:depart', onDepart);
      window.removeEventListener('atlas:arrive', onArrive);
      reset();
    };
  }, [collection._id, docked, reduce, ticket]);

  // Cover text planes counter-parallax against the photo — the masthead lifts,
  // the kicker sinks as the card passes, so name/kicker/photo read as depth.
  const mastheadY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '-16%']);
  const kickerY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '22%']);
  const titleInteractionX = useTransform(
    [editorialShift, titlePointerX, titleOpenX],
    ([timeline, pointer, open]) => Number(timeline) + Number(pointer) + Number(open),
  );

  // Keyword-ignite (the feature title's last word lights to lime on scroll-in) stays.
  // (Reduced motion: lit from the start — a value, the same style either way.)
  const igniteColor = useTransform(scrollYProgress, [0.3, 0.52], [reduce ? 'rgb(210,255,0)' : 'rgba(244,244,237,1)', 'rgb(210,255,0)']);
  const nameParts = collection.name.trim().split(/\s+/);
  // Each word rises inside its own mask, a line at a time — words are never
  // split into letters, so screen readers still hear whole words. The mask's
  // padding is cancelled by an equal negative margin, leaving layout and the
  // h3's drop-shadow (drawn from the composited heading) untouched.
  //
  // Two hidden copies of the word share the mask's grid cell, set at the two
  // ends of the focus rack. They fix the mask's width at the wider of the two,
  // so the line break between words is decided from boxes that never change
  // while the visible word's weight and tracking do.
  //
  // The rack is applied to the visible word, never to the h3: the h3's values
  // are inherited by the bare space between the masks, and a space is not a
  // constant — letter-spacing adds to it, and Fraunces' space glyph itself
  // narrows ~0.005em from 400 to 600. Racked on the h3, a two-word title still
  // shrank ~2px at 92px mid-rack, enough to flip its break at the widths where
  // it only just fits. The h3 holds both axes at rest, so the gap never moves.
  const titleMeasures = [
    { fontWeight: TITLE_WEIGHT_REST, letterSpacing: `${titleTrackingRest}em` },
    { fontWeight: TITLE_WEIGHT_FOCUS, letterSpacing: `${titleTrackingRest - TITLE_TRACKING_TIGHTEN}em` },
  ];
  const risingWords = (words: string[], wordStyle?: (word: string, index: number) => MotionStyle | undefined) =>
    words.map((word, wordIndex) => (
      <Fragment key={`${word}-${wordIndex}`}>
        {wordIndex > 0 && ' '}
        <span className="archive-title-mask">
          {titleMeasures.map((measure, measureIndex) => (
            <span
              key={measureIndex}
              aria-hidden="true"
              className="archive-title-mask__measure"
              style={measure}
            >
              {word}
            </span>
          ))}
          <motion.span
            className="inline-block"
            initial={false}
            animate={{ y: titleRisen ? '0%' : '118%' }}
            transition={titleRisen
              ? { duration: 0.8, delay: wordIndex * 0.08, ease: EASE.arrive }
              : { duration: 0 }}
            style={{ fontWeight: titleWeight, letterSpacing: titleTracking, ...wordStyle?.(word, wordIndex) }}
          >
            {word}
          </motion.span>
        </span>
      </Fragment>
    ));

  const coverBase = collection.coverImageUrl ?? collection.photos?.[0]?.imageUrl ?? '';
  // A photograph is never given a design ratio: the cover takes the file's
  // own, clamped the way 11 mois clamps its plates (a tall 9:20 to a wide
  // 2.4:1). Sanity puts the pixel dimensions in the asset's file name, so the
  // frame is right on the first paint — no measuring, no layout shift.
  // (The one rule the dock sizes a docked cover by, src/lib/coverDock.ts.)
  const coverRatio = useMemo(() => coverRatioOf(coverBase), [coverBase]);
  const plateRatio = variant === 'cover' ? coverRatio : null;
  // What the stub prints: only fields the archive already holds. No invented
  // codes. Space Grotesk has tabular figures, so the rows line up.
  const stubRows = useMemo(() => {
    const rows: Array<[string, string]> = [];
    const region = collection.region ?? collection.location;
    if (region) rows.push(['Region', region]);
    const frames = collection.photoCount ?? collection.photos?.length;
    if (frames) rows.push(['Frames', String(frames).padStart(2, '0')]);
    if (collection.year) rows.push(['Year', String(collection.year)]);
    const point = collection.mapLocation;
    if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      rows.push(['Lat', `${Math.abs(point.lat).toFixed(4)}° ${point.lat >= 0 ? 'N' : 'S'}`]);
      rows.push(['Long', `${Math.abs(point.lng).toFixed(4)}° ${point.lng >= 0 ? 'E' : 'W'}`]);
    }
    return rows;
  }, [collection]);
  // The sign's name size (src/lib/routeShield.ts, signNameSize): 30px for
  // every name the archive has today, smaller only for a word that could not
  // fit the enamel rule. Derived from the letters, never measured.
  const signNameSize = useMemo(() => nameSizeFor(collection.name), [collection.name]);
  const coverUrl = coverBase ? `${coverBase}?auto=format&w=1600&q=82` : '';
  const coverSrcSet = coverBase
    ? `${coverBase}?auto=format&w=1000&q=82 1000w, ${coverBase}?auto=format&w=1600&q=82 1600w, ${coverBase}?auto=format&w=2000&q=78 2000w`
    : undefined;

  // The visible <img> owns the current cover. Predecode only its neighbours,
  // with the exact same srcset/sizes contract, so a responsive 1000/2000px
  // candidate is not followed by a redundant fixed 1600px request.
  useEffect(() => {
    if ((!isActive && resolvedChapterIndex !== 0) || typeof Image === 'undefined') return;
    const bases = Array.from(new Set(preloadImageUrls.filter(Boolean))).filter((base) => {
      if (PRELOADED_IMAGE_URLS.has(base)) return false;
      PRELOADED_IMAGE_URLS.add(base);
      return true;
    });
    const images = bases.map((base) => {
      const image = new Image();
      image.decoding = 'async';
      image.sizes = '(min-width: 1900px) 1100px, (min-width: 1024px) 58vw, 100vw';
      image.srcset = `${base}?auto=format&w=1000&q=82 1000w, ${base}?auto=format&w=1600&q=82 1600w, ${base}?auto=format&w=2000&q=78 2000w`;
      image.src = `${base}?auto=format&w=1600&q=82`;
      if (typeof image.decode === 'function') {
        void image.decode().catch(() => PRELOADED_IMAGE_URLS.delete(base));
      }
      return image;
    });
    return () => {
      images.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [isActive, preloadImageUrls, resolvedChapterIndex]);

  const frames = collection.photoCount ?? collection.photos?.length ?? 0;
  const dateline = collection.location || collection.region || 'United States';
  const deck = collection.subtitle?.trim();
  const lede = excerpt(collection.slug, 220);
  const coverTitleSize = collection.name.trim().length > 10
    ? 'clamp(54px, 6.3vw, 92px)'
    : 'clamp(64px, 7.2vw, 108px)';

  const aspectClass =
    variant === 'feature'
      ? 'aspect-[4/5] lg:aspect-[5/6]'
      : 'aspect-[4/5] sm:aspect-[16/11] lg:aspect-[16/10]';

  // The film rebate sits inside the existing frame geometry. The geographic
  // timeline keeps the same centre, while one continuous image owns the cover.
  const imageBlock = (
    <motion.div
      ref={sharedImageRef}
      layoutId={sharedLayoutId}
      onPointerEnter={handlePhotoPointerEnter}
      onPointerMove={handlePhotoPointerMove}
      onPointerLeave={handlePhotoPointerLeave}
      style={plateRatio ? { aspectRatio: String(plateRatio) } : undefined}
      className={`archive-photo-frame relative ${plateRatio ? '' : aspectClass} overflow-hidden`}
    >
      {/* A switch's mat: the card's dark ground where this photograph reaches
          past the one it replaces, until it has developed there (see "The
          switch"). Nothing at rest. */}
      {ticket && <i className="archive-photo-frame__mat" aria-hidden="true" />}
      {/* The print: what a switch develops in (its mask, written only while
          it runs). */}
      <div className="archive-photo-frame__print absolute inset-0">
        {/* The hand's layer: only a pointer over the photograph moves it (the
            hover breath and parallax). Nothing on the page's scroll does. */}
        <motion.div
          className="absolute inset-0"
          style={{ x: pointerX, y: pointerY, scale: hoverScale }}
        >
          {coverUrl && (
            <motion.img
              ref={sharedImageSourceRef}
              src={coverUrl}
              srcSet={coverSrcSet}
              sizes="(min-width: 1900px) 1100px, (min-width: 1024px) 58vw, 100vw"
              alt={collection.name}
              loading={prioritizeImage ? 'eager' : 'lazy'}
              fetchPriority={prioritizeImage && (isActive || resolvedChapterIndex === 0) ? 'high' : 'auto'}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          )}
        </motion.div>
        {/* `archive-photo-matte` is read by the Homepage at click time, so the
            story cover can start under the very grade the plate is showing. */}
        <motion.div
          className="archive-photo-matte absolute inset-0 bg-[#30352a] pointer-events-none"
          style={{ opacity: matteOpacity }}
        />
        <div className="archive-photo-shade-top pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-[linear-gradient(180deg,rgba(24,28,20,0.54)_0%,rgba(24,28,20,0.16)_52%,transparent_100%)]" />
        <div className="archive-photo-shade-bottom pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-[linear-gradient(0deg,rgba(20,24,17,0.72)_0%,rgba(20,24,17,0.30)_44%,transparent_100%)]" />
      </div>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-5 right-[max(1.25rem,env(safe-area-inset-right))] z-10 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/14 bg-[#171b15]/72 px-4 font-ui text-[9px] uppercase tracking-[0.1em] text-white/76 shadow-[0_10px_28px_rgba(7,9,6,0.18)] lg:hidden"
      >
        View story <ArrowRight size={12} />
      </span>
      {/* The face's half of the torn seam: its fibres, and the strain that
          whitens the paper below the rip's tip (written by the tear). */}
      {ticket && (
        <>
          <i className="archive-ticket-fibre" aria-hidden="true" />
          <i className="archive-ticket-strain" aria-hidden="true" />
        </>
      )}
    </motion.div>
  );

  const activate = () => {
    setIsHovered(false);
    setIsFocused(false);
    setEngagement(false);
    onClick(collection);
  };
  // Capture phase, so every press is seen before anything inside it.
  const interactive = {
    onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      // The stub's "Next stop" is its own control: the ticket does not give
      // under it, and it is never the start of a click on the cover.
      if ((event.target as Element | null)?.closest?.('.archive-ticket-next')) return;
      dragReleaseRef.current = 0;
      pressGive.onPointerDown(event);
      pressRef.current = event.pointerType === 'touch'
        ? null
        : { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    },
    onPointerMoveCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      const press = pressRef.current;
      if (!press || press.moved || event.pointerId !== press.id) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= CLICK_SLOP) press.moved = true;
    },
    onPointerUpCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      const press = pressRef.current;
      if (!press || event.pointerId !== press.id) return;
      pressRef.current = null;
      // The release point counts too: a hand that went off the cover (where
      // its moves are not seen here) and came back has still travelled.
      if (press.moved || Math.hypot(event.clientX - press.x, event.clientY - press.y) >= CLICK_SLOP) {
        dragReleaseRef.current = performance.now();
      }
    },
    onClick: () => {
      // The click a travelled release fires is the end of a drag, not a
      // request for the story (see CLICK_SLOP). Enter and Space open it
      // from onKeyDown and never come through here.
      const dragged = dragReleaseRef.current > 0
        && performance.now() - dragReleaseRef.current < DRAG_CLICK_WINDOW_MS;
      dragReleaseRef.current = 0;
      if (dragged) return;
      activate();
    },
    ...(canHover && {
      onHoverStart: () => {
        setIsHovered(true);
        setEngagement(true);
      },
      onHoverEnd: () => {
        setIsHovered(false);
        setEngagement(isFocused);
      },
    }),
    onFocus: (e: React.FocusEvent) => {
      const visible = e.currentTarget.matches(':focus-visible');
      setIsFocused(visible);
      if (visible) setEngagement(true);
    },
    // Keyboard focus and physical pointer presence are independent. Clearing
    // hover here made the photograph freeze while it was still under a cursor.
    onBlur: () => {
      setIsFocused(false);
      setEngagement(canHover && isHovered);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) activate();
      }
    },
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': `View story: ${collection.name}`,
  };
  const baseline = (
    <motion.div
      className="absolute left-0 right-0 bottom-0 z-10 h-[5px] origin-left"
      style={{ background: ACCENT }}
      animate={{ scaleX: engaged ? 1 : 0 }}
      transition={{ duration: reduce ? 0 : engaged ? 0.3 : 0.5, ease: EASE.arrive }}
    />
  );

  // ── FEATURE — editorial 2-column spread ──
  // Carries the same diagnostic markers as the cover so the chapter stack can
  // be inspected uniformly, whichever variant a chapter renders.
  if (variant === 'feature') {
    return (
      <section
        id={id}
        ref={chapterRef}
        data-archive-chapter="true"
        data-chapter-index={resolvedChapterIndex}
        data-active={isActive ? 'true' : 'false'}
        className="relative pb-12 lg:pb-20"
      >
        <motion.div
          {...interactive}
          style={{ scale: pressGive.scale }}
          className="group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00] lg:grid lg:grid-cols-12 lg:items-center lg:gap-12"
        >
          <div className="relative overflow-hidden border border-white/5 bg-white/[0.02] transition-colors duration-700 group-hover:border-white/15 lg:col-span-8">
            {imageBlock}
            {baseline}
          </div>

          <div className="lg:col-span-4 mt-8 lg:mt-0 flex flex-col gap-5">
            <p className="text-kicker flex items-center gap-2 text-white/55">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
              In&nbsp;the&nbsp;Archive · Nº&nbsp;{String(index + 1).padStart(2, '0')}
            </p>
            <motion.h3
              className="font-serif uppercase text-white tracking-tight leading-[0.88]"
              style={{ fontSize: 'clamp(40px, 5vw, 84px)', fontWeight: TITLE_WEIGHT_REST }}
            >
              {risingWords(nameParts, (_word, wordIndex) =>
                wordIndex === nameParts.length - 1
                  ? { color: igniteColor }
                  : undefined,
              )}
            </motion.h3>
            {deck && <p className="text-deck max-w-[32ch]">{deck}</p>}
            {lede && <p className="text-[13.5px] leading-relaxed text-white/62 font-light max-w-[42ch]">{lede}</p>}
            <div className="h-px w-16" style={{ background: ACCENT }} />
            <span aria-hidden="true" className="mt-1 inline-flex min-h-11 shrink-0 items-center gap-3 font-ui text-[10px] uppercase tracking-[0.1em] text-white/80 md:text-[11px]">
              View Story
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 transition-[border-color,background-color,color] duration-500 group-hover:border-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] group-hover:bg-[rgb(var(--accent-r),var(--accent-g),var(--accent-b))] group-hover:text-[#282c20]">
                <ArrowRight size={16} />
              </span>
            </span>
          </div>
        </motion.div>
      </section>
    );
  }

  // ── COVER (default) — full-bleed magazine cover ──
  // One stage holds the photograph and its cue. No frame is drawn round it
  // (owner, 2026-09-28: 删掉封面旁边四个角的折角框): the photograph's own edge,
  // and the ticket's perforation, are the only edges it has.
  const plateStage = (
    <div className="archive-plate__stage">
      {imageBlock}
      <motion.span
        aria-hidden="true"
        className="archive-plate__cue"
        style={{ x: plateCueX, opacity: plateCueOpacity }}
      >
        Open story
        <ArrowRight size={13} strokeWidth={1.4} />
      </motion.span>
    </div>
  );

  // ── The docked ticket (desktop) ──
  // The chapter is its rail — the running head on demand, the name, the
  // frames and the lede — down the right of the page, where the reader's
  // eye and the keyboard go chapter by chapter; the ticket is on the atlas,
  // beside its place's shield (the dock, src/lib/coverDock.ts).
  if (docked) {
    const quadrant = dockEntry?.quadrant ?? 'tr';
    const side = awaySide(quadrant);
    const railTitleSize = collection.name.trim().length > 10
      ? 'clamp(40px, 3.7vw, 66px)'
      : 'clamp(46px, 4.6vw, 82px)';
    // Pointer only: the rail is the chapter's control for the keyboard and
    // the screen reader (the cover repeats it, a picture of the same story).
    const {
      role: _role,
      tabIndex: _tabIndex,
      'aria-label': _label,
      onFocus: _onFocus,
      onBlur: _onBlur,
      onKeyDown: _onKeyDown,
      ...coverPointer
    } = interactive;
    const ticketPlate = (
      <div
        ref={plateRef}
        className={`archive-plate relative archive-plate--ticket${stubTorn ? ' is-stub-torn' : ''}`}
        style={{
          ...stockStyle(collection.slug),
          ...(phone && card
            ? { width: card.photoW + TICKET_STUB }
            : dockEntry ? { width: dockEntry.photoW + TICKET_STUB } : null),
        }}
      >
        {/* The photograph's half. It never tears any more (only the stub
            does, for the story); while the stub is torn off, the face gives
            a hair about the left hand's grip (the tear's writer,
            `--tear-tf`). */}
        <div className="archive-plate__tear">
          <div className="archive-plate__face">
            {plateStage}
          </div>
        </div>

        {/* The stub is the place's sign (owner, 2026-09-28: 将右侧的大号
            封面和路牌上方的州名缩写+地名和第几站结合在一起): the route
            shield the map signs this place with — its state's two letters,
            its stop number — beside "Stop / 06", and the place's name set
            big inside a guide sign's enamel rule, on the chapter's own card.
            On a switch the shield and the name turn into place like a
            departure board while the planet turns (`atlas:depart`), the
            card easing from the stock it leaves. Below the sign, the
            admission rows; at the foot, the way on: "Next stop". The seat
            is the stub's own box: while the stub is torn off (opening the
            story) it clips at the seam, so nothing of the stub swings into
            the photograph below the rip's tip. The sign's shield prints its
            band in the card's own stock (`--stub-paper`), so it turns with
            the card on a switch. */}
        <div className="archive-ticket-stub-seat">
        <aside
          className="archive-ticket-stub font-ui"
          aria-hidden="true"
        >
          {/* The stub's half of the torn seam. */}
          <i className="archive-ticket-fibre" aria-hidden="true" />
          <i className="archive-ticket-strain" aria-hidden="true" />
          <div ref={signRef} className="archive-ticket-sign">
            <div className="archive-ticket-sign__head">
              <RouteShield
                className="archive-ticket-sign__shield"
                code={stateCode(collection.region)}
                number={pad2(index + 1)}
                numberClassName="archive-ticket-stub__no"
                flap
              />
              <span className="archive-ticket-sign__stop">
                <span className="archive-ticket-sign__label">Stop</span>
                <span className="archive-ticket-sign__total archive-ticket-stub__of">
                  / {pad2(chapterTotal ?? index + 1)}
                </span>
              </span>
            </div>
            <span
              className="archive-ticket-sign__name archive-ticket-stub__place"
              style={{ ['--sign-name' as never]: `${signNameSize}px` }}
            >
              <FlapWord text={collection.name.trim()} role="name" />
            </span>
          </div>
          {stubRows.length > 0 && (
            <dl className="archive-ticket-stub__rows">
              {stubRows.map(([label, value]) => (
                <div key={label} className="archive-ticket-stub__row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {nextStop !== undefined && (
            <button
              type="button"
              tabIndex={-1}
              className="archive-ticket-next"
              data-ready={nextReady ? '' : undefined}
              disabled={!nextReady}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                goNext();
              }}
            >
              <span className="archive-ticket-next__label">
                {nextStop ? 'Next stop' : 'End of the route'}
              </span>
              {nextStop ? (
                <span className="archive-ticket-next__stop">
                  <RouteShield
                    className="archive-ticket-next__shield"
                    code={stateCode(nextStop.region)}
                    number={pad2(nextStop.number)}
                    accent={stockPaper(nextStop.slug)}
                  />
                  <span className="archive-ticket-next__name">{nextStop.name}</span>
                  <ArrowRight size={12} strokeWidth={1.6} aria-hidden="true" />
                </span>
              ) : (
                <ArrowRight className="archive-ticket-next__down" size={12} strokeWidth={1.6} aria-hidden="true" />
              )}
            </button>
          )}
        </aside>
        </div>

        {/* The tickets still bound under this one: the pad thins as the
            archive is read, each sheet the next chapter's own card, solid
            (at half strength and less they read as smears on the lit map),
            the next one on top and the later ones' edges under it. */}
        {chapterTotal != null && chapterTotal - index - 1 > 0 && (
          <span className="archive-ticket-pad" aria-hidden="true">
            {Array.from({ length: Math.min(3, chapterTotal - index - 1) }, (_, sheet) => (
              <i
                key={sheet}
                style={{
                  top: sheet * 4,
                  zIndex: 3 - sheet,
                  ...(padStocks?.[sheet] ? { background: `color-mix(in oklab, ${padStocks[sheet]} 72%, #0e110c)` } : null),
                }}
              />
            ))}
          </span>
        )}

        {/* The caret: the plate's corner nearest its shield points at it,
            as the reference's board points at its stop — part of the card
            (the photograph's dark edge or the stub's stock, whichever half
            that corner is), never a line across the gap. */}
        <i
          className="archive-plate__caret"
          data-half={quadrant === 'tr' || quadrant === 'br' ? 'face' : 'stub'}
          aria-hidden="true"
        />
      </div>
    );
    // The dock: written at the place's foot every camera frame (`translate3d`,
    // by the dock subscription above); the seat hangs the plate at its corner
    // of the shield, a joint's gap off it (its caret pointing across), the
    // region's tab on the edge away from the shield.
    // On a phone the card is dealt at the foot of the screen, whole, scaled
    // to fit across (never below PHONE_CARD.minScale, src/lib/explorer.ts).
    const seatStyle = phone && card
      ? { transform: `scale(${card.scale})` }
      : dockEntry ? { left: dockEntry.offset.x, top: dockEntry.offset.y } : undefined;
    const dock = dockReady && dockHost && (phone ? card : dockEntry) ? createPortal(
      <div
        ref={dockRef}
        className={`archive-dock${phone ? ' archive-dock--phone' : ''}`}
        data-cover-for={id}
        data-quadrant={phone ? 'phone' : quadrant}
      >
        <div
          className="archive-dock__seat"
          style={seatStyle}
        >
          {regionTab && !phone && (
            <div className="archive-dock__tab font-ui" data-side={side} aria-hidden="true">
              <span className="archive-dock__tab-label">Region</span>
              <span className="archive-dock__tab-region">{regionTab.region}</span>
              <span className="archive-dock__tab-figures">
                {regionTab.places} places · {regionTab.frames} frames
              </span>
            </div>
          )}
          <motion.div
            {...coverPointer}
            aria-hidden="true"
            style={{ scale: pressGive.scale }}
            className="archive-dock__cover group relative cursor-pointer"
          >
            {ticketPlate}
          </motion.div>
        </div>
      </div>,
      dockHost,
    ) : null;
    return (
      <section
        id={id}
        ref={chapterRef}
        data-archive-chapter="true"
        data-chapter-index={resolvedChapterIndex}
        data-active={isActive ? 'true' : 'false'}
        data-ticket=""
        data-shown={railShown ? '' : undefined}
        // The explorer's rail shows the place in hand only, once its cover is
        // up (global.css, "The explorer"); the others are out of sight and
        // out of reach.
        inert={!isActive}
        aria-hidden={!isActive}
        className={`archive-chapter--docked explorer-place${phone ? ' explorer-place--phone' : ''}`}
      >
        {/* The rail: the chapter's control (a click or Enter opens its
            story, the stub torn off first), soft ground under its type
            (global.css `.archive-rail`), its name racked and risen as it
            comes into hand. */}
        <motion.div
          data-chapter-anchor
          {...interactive}
          className="archive-rail group relative cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-[#D2FF00]"
        >
          {/* Reduced motion changes these values, never whether they are
              there: the MotionValues answer `reduce` themselves (a style
              that came and went with it SSR'd one way and hydrated the
              other, and left the rail stuck at the old opacity). */}
          <motion.div
            style={{ opacity: editorialOpacity, x: titleInteractionX }}
            className="archive-plate__meta pointer-events-none flex items-center justify-between gap-4 font-ui text-[9px] uppercase tracking-[0.1em]"
          >
            <span className="text-white/84">Chapter {String(index + 1).padStart(2, '0')}</span>
            <span className="text-right text-white/84">
              {dateline}{collection.year ? ` · ${collection.year}` : ''}
            </span>
          </motion.div>
          <motion.div
            style={{ x: titleInteractionX, opacity: editorialOpacity }}
            className="archive-cover-title-wrap pointer-events-none relative z-20 mt-5"
          >
            <motion.h3
              className="archive-cover-title font-serif uppercase leading-[0.84] tracking-[-0.05em] text-[#F4F4ED]"
              style={{ fontSize: railTitleSize, wordSpacing: '0.12em', fontWeight: TITLE_WEIGHT_REST }}
            >
              {risingWords(nameParts)}
            </motion.h3>
          </motion.div>
          <motion.div
            style={{ opacity: fieldNoteOpacity, y: fieldNoteShift }}
            className="archive-lede relative z-10 mt-[clamp(28px,3vw,44px)] grid grid-cols-[76px_minmax(0,1fr)] items-start gap-x-6"
          >
            {/* Bone ink at the lime's old weights: the atlas's one lime is
                the viewfinder's chapter number. */}
            <div className="pt-1 font-ui uppercase">
              <p className="text-[10px] tracking-[0.1em] text-[#F4F4ED]">{frames} frames</p>
              <span className="mt-5 block h-px w-10 bg-[#F4F4ED]/65" />
            </div>
            <div className="min-w-0">
              <p className="archive-rail__lede max-w-[46ch] font-serif text-[16px] leading-[1.55]">
                {lede || deck || `A photographic dispatch from ${dateline}.`}
              </p>
            </div>
          </motion.div>
        </motion.div>
        {dock}
      </section>
    );
  }

  // The column's cover (the phone's route cards): the photograph at its own
  // ratio with its name over its foot, no ticket.
  return (
    <section
      id={id}
      ref={chapterRef}
      data-archive-chapter="true"
      data-chapter-index={resolvedChapterIndex}
      data-active={isActive ? 'true' : 'false'}
      className="relative overflow-visible pb-12 lg:pb-16"
    >
      <motion.div
        {...interactive}
        style={{ scale: pressGive.scale }}
        className="group relative w-full cursor-pointer overflow-visible focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
      >
        <div className="relative">
          <motion.div
            style={{ opacity: editorialOpacity, x: titleInteractionX }}
            className="archive-plate__meta pointer-events-none absolute -top-8 left-0 right-0 z-20 hidden items-center justify-between font-ui text-[9px] uppercase tracking-[0.1em] lg:flex"
          >
            <span className="text-white/80">Chapter {String(index + 1).padStart(2, '0')}</span>
            <span className="mr-[1%] text-right text-white/80">
              {dateline}{collection.year ? ` · ${collection.year}` : ''}
            </span>
          </motion.div>
          {/* The plate: the photograph at its own ratio, capped so a tall one
              still fits the reading line, with nothing drawn round it. */}
          <div
            ref={plateRef}
            className="archive-plate relative"
            style={plateRatio ? { maxWidth: `calc(78vh * ${plateRatio})` } : undefined}
          >
            {plateStage}
          </div>

          {/* Compact screens retain the original in-image running head. */}
          <motion.div
            style={{ y: kickerY, opacity: editorialOpacity, x: titleInteractionX }}
            className="absolute inset-x-0 top-0 flex items-start p-5 pt-24 font-ui text-[10px] uppercase tracking-[0.1em] md:p-8 md:pt-20 md:text-[11px] lg:hidden"
          >
            <span className="flex max-w-[78%] items-center gap-2 text-white/72">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT }} />
              {String(index + 1).padStart(2, '0')} · {collection.name}{collection.year ? ` · ${collection.year}` : ''}
            </span>
          </motion.div>

          {/* The title is deliberately not contained by the photograph. It
              crosses the map/photo seam like the selected Figure 1 direction. */}
          <motion.div
            style={{
              y: mastheadY,
              x: titleInteractionX,
              opacity: editorialOpacity,
              bottom: 'clamp(-52px, -3.6vw, -34px)',
            }}
            className="archive-cover-title-wrap pointer-events-none absolute left-[-6%] z-20 max-w-[106%] whitespace-normal lg:left-[-14%] lg:max-w-[94%]"
          >
            <motion.h3
              className="archive-cover-title font-serif uppercase leading-[0.78] tracking-[-0.05em] text-[#F4F4ED] drop-shadow-[0_5px_36px_rgba(8,10,7,0.62)]"
              style={{ fontSize: coverTitleSize, wordSpacing: '0.12em', fontWeight: TITLE_WEIGHT_REST }}
            >
              {desktopMotion ? risingWords(nameParts) : collection.name}
            </motion.h3>
          </motion.div>
        </div>
        {/* Borderless field notes: the text sits directly on the page instead
          of adding another card beneath the photograph. `archive-lede`
          softens the ground under it with a feathered shadow (global.css). */}
        <motion.div
          style={{ opacity: fieldNoteOpacity, y: fieldNoteShift }}
          className="archive-lede relative z-10 ml-[-12%] mt-[clamp(64px,6.5vw,92px)] hidden w-[88%] grid-cols-[96px_minmax(0,1fr)] items-start gap-x-8 pr-3 lg:grid"
        >
          <div className="pt-1 font-ui uppercase">
            <p className="text-[10px] tracking-[0.1em] text-[#F4F4ED]">{frames} frames</p>
            <span className="mt-5 block h-px w-10 bg-[#F4F4ED]/65" />
          </div>
          <div className="min-w-0">
            <p className="max-w-[48ch] font-serif text-[16px] leading-[1.55] text-white/64">
              {lede || deck || `A photographic dispatch from ${dateline}.`}
            </p>
          </div>
        </motion.div>

        <motion.div
          style={{ opacity: fieldNoteOpacity, y: fieldNoteShift }}
          className="relative z-30 mt-[clamp(72px,18vw,96px)] px-5 pr-6 lg:hidden"
        >
          <p className="font-ui text-[9px] uppercase tracking-[0.1em] text-[#F4F4ED]/86">{frames} frames</p>
          <p className="mt-4 max-w-[34ch] font-serif text-[15px] leading-[1.5] text-white/66">
            {lede || deck || `A photographic dispatch from ${dateline}.`}
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
