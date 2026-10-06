import { Fragment, memo, type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  animate,
  motion,
  useTransform,
  useMotionValue,
  useSpring,
  useReducedMotion,
  type MotionStyle,
  type MotionValue,
} from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { FlapWord, RouteShield, primeFlap, retractFlap, runFlap } from './RouteShield';
import { flapText, pad2, signLines, signNameSize as nameSizeFor, stateCode } from '../../lib/routeShield';
import type { Collection } from '../../types';
import { excerpt } from '../../lib/narratives';
import { Bi, T, useLang } from '../../i18n/react';
import { tr, type Key } from '../../i18n/dict';
import { paragraphsOf } from '../../i18n/content';
import { useHoverCapable } from '../../lib/useHoverCapable';
import { usePressGive } from '../../lib/usePressGive';
import { stockPaper, stockStyle } from '../../lib/ticketStock';
import { CSS_EASE, EASE, SPRING, smootherstep } from '../../lib/motion';
import {
  ARRIVAL,
  DOCK,
  TICKET,
  TICKET_EXPAND_MS,
  TICKET_FOLD_MS,
  afterOpening,
  awaySide,
  coverDock,
  coverRatioOf,
  printStyle,
  shieldShift,
  ticketFold,
  ticketFrames,
  ticketStyle,
  tipPopFrames,
  type DockArrive,
  type DockSwitch,
  type TicketForm,
} from '../../lib/coverDock';
import { STUB_LANDED_EVENT, phoneCard, type PhoneCard } from '../../lib/explorer';
import { viewport } from '../../lib/viewport';
import { useSectionScroll } from '../../lib/useSectionScroll';
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
  nextStop?: { name: string; nameZh?: string; number: number; region?: string; slug?: string } | null;
  /** Desktop tickets: the atlas's dock (HomePage). The cover is rendered
   *  there, beside its place's shield, and placed every camera frame
   *  (src/lib/coverDock.ts); the section keeps the chapter's rail. */
  dockHost?: HTMLElement | null;
  /** Its state, boxed on a tab on its cover's top edge (owner, 2026-09-29:
   *  封面的州名可以框起来，我想要这个更醒目一点); the first place of a region of
   *  two or more keeps the region's figures on it ("REGION [FLORIDA] 2
   *  PLACES · 32 FRAMES"). */
  stateTab?: { state: string; stateZh?: string; places?: number; frames?: number } | null;
  /** The archive's one ticket height (src/lib/coverDock.ts, TICKET): the
   *  phone's card folds to it (the desktop reads it off the dock's plan). */
  ticketHeight?: number;
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
// A docked cover let go is gone this long after (global.css `.archive-dock`,
// mirrored: its ink fades over DUR.swap from 200 ms, as its fold ends), and
// is put back whole, unseen, a beat later.
const DOCK_FADE_MS = 520;
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
// A docked cover travels a switch as a ticket carrying its picture: it
// shrinks into it (a clip and a translate of the plate, a scale of its
// print: nothing is laid out again), is relayed to the arriving place's
// cover — laid on the same pixels, its card easing from the leaving stock to
// its own (the stub, its caret, its sign's band), its sign rolling from the
// place left, its miniature dissolving in over the leaving one's — and
// grows open in place; then its tip pops out, then its tab and cue.

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

/** A Chinese paragraph cut to about `n` characters at a sentence's end (。！？),
 *  else at a comma, else hard with an ellipsis. */
function zhExcerpt(text: string | undefined, n: number): string | undefined {
  const full = text?.trim();
  if (!full) return undefined;
  if (full.length <= n) return full;
  const cut = full.slice(0, n);
  const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'));
  if (stop > n * 0.5) return cut.slice(0, stop + 1);
  const comma = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('、'));
  return (comma > n * 0.5 ? cut.slice(0, comma) : cut) + '…';
}

function ArchiveChapter({
  id,
  collection,
  onClick,
  index,
  isActive,
  chapterProgress,
  chapterIndex,
  chapterTotal,
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
  stateTab = null,
  ticketHeight = 172,
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
  // word). The cover is never driven by it — and a docked cover (the
  // homepage's: it rides the map) reads none of it, so it does not track the
  // page's scroll at all (src/lib/useSectionScroll.ts: the entrance's glide
  // scrolls the window every frame, and each tracker measured in each one).
  const scrollYProgress = useSectionScroll(chapterRef, ['start end', 'end start'], !(variant === 'cover' && Boolean(desktopMotion)));
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
  // place's shield, at its place's corner (the dock's plan; on a phone it is
  // dealt at the foot of the screen instead, `phone`). The section keeps the
  // chapter's rail (the name, the lede). The atlas publishes, every camera
  // frame, where each place stands and the place whose cover shows; the
  // cover is written there, and shows only while its place is in hand — it
  // arrives as the camera settles on it from the open map (a ticket inked in
  // beside its shield, opened, its tip put out: "The arrival" below), rides
  // with its shield wherever the reader takes the map, travels a switch as a
  // ticket where it lies (pinned: "The switch" below), and folds into its
  // ticket as it fades when the place is let go.
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
  // The ticket's sign (its shield, stop and name): the board.
  const signRef = useRef<HTMLDivElement>(null);

  // ── The switch, the arrival, the let-go (src/lib/coverDock.ts) ──
  // One play at a time per cover: its part in a switch — the ticket that
  // carries it (`out`: it shrinks into its ticket, and is cut once the
  // arriving one's picture is over it) or the one arriving (`in`: held
  // hidden in its ticket form from the click, laid on at the relay, grown
  // open, its tip popped out) — or an arrival from the open map. Every
  // visual beat is a WAAPI animation started at its own absolute time on the
  // document's timeline (`startAt`), so two covers' beats land in one frame;
  // what is seen and what is not (the relay, the cut) is decided in the
  // published frame, where every cover hears it in one task. Nothing is laid
  // out again or measured: a clip, a translate, a scale, colours, opacity.
  type Play = {
    kind: 'switch' | 'arrive' | 'letgo';
    key: number;
    role: 'in' | 'out';
    mode: DockSwitch['mode'] | 'arrive';
    anims: Animation[];
    plate: Animation | null;
    /** The photograph shrinking into the strip, or growing out of it. */
    print: Animation | null;
    /** The arriving miniature dissolving in over the one under it. */
    dissolve: Animation | null;
    /** The phone's card coming to the one ticket size as it folds (or, laid
     *  on a ticket in transit, from that ticket to its own place)… */
    carry: Animation | null;
    /** …and, arriving, growing out of it to its own size as it opens. */
    grow: Animation | null;
    tip: Animation | null;
    timers: number[];
    relayed: boolean;
    cut: boolean;
    /** When this carrier is cut (its switch's `cutAt`). */
    cutAt: number;
    /** Seen at all yet (an arrival before its ink, a destination before its
     *  relay: not). */
    inked: boolean;
    /** The carrier's name retracted to its first letters (the board's first
     *  beat, at its switch's `flapAt`), and how to put it back. */
    retracted: boolean;
    unretract: (() => void) | null;
  };
  const playRef = useRef<Play | null>(null);
  const arrivedTimerRef = useRef(0);
  // The board, taken up at the relay (the sign effect below sets it): the
  // turn timed from its retract (`origin`), `force` onto its own name.
  const relayFlapRef = useRef<((origin: number, force?: boolean) => void) | null>(null);
  const parts = () => {
    const plate = plateRef.current;
    return {
      dock: dockRef.current,
      plate,
      cover: dockRef.current?.querySelector<HTMLElement>('.archive-dock__cover') ?? null,
      caret: plate?.querySelector<HTMLElement>('.archive-plate__caret') ?? null,
      print: plate?.querySelector<HTMLElement>('.archive-photo-frame__print') ?? null,
      name: plate?.querySelector<HTMLElement>('.archive-ticket-sign__name') ?? null,
    };
  };
  // An animation started at `time` (performance.now() ms: the document's
  // timeline counts from the same origin); before it, its fill says.
  const startAt = (anim: Animation, time: number) => {
    anim.startTime = time;
    return anim;
  };
  const alive = (anim: Animation | null): anim is Animation => !!anim && anim.playState !== 'finished' && anim.playState !== 'idle';
  // Held where it is now, this very frame (a pause alone takes hold a frame
  // later: the ticket read and the ticket held would differ by a frame).
  const holdNow = (anim: Animation) => {
    const at = anim.currentTime;
    anim.pause();
    if (at != null) anim.currentTime = at;
  };
  // The ticket this plate folds into (DERIVED: the plan, or the phone's
  // card and the archive's ticket height).
  const ticketForm = (): TicketForm | null => {
    if (phone) {
      if (!card) return null;
      const plateSize = { w: card.photoW + TICKET_STUB, h: card.photoH };
      const w = Math.min(TICKET.face, card.photoW) + TICKET_STUB;
      const h = Math.min(card.photoH, ticketHeight);
      return { plate: plateSize, w, h, fold: ticketFold('phone', plateSize, w, h).fold };
    }
    const mine = coverDock.plan()?.[collection._id];
    if (!mine) return null;
    return { plate: { w: mine.photoW + TICKET_STUB, h: mine.photoH }, w: mine.ticketW, h: mine.ticketH, fold: mine.fold };
  };
  // Ends this cover's play at once and clears everything it wrote: the plate
  // whole, the photograph full size, the tip at rest. `finish`: the cover in
  // hand (a tear, a switch cut short) — its tab and cue come in on it.
  const settlePlay = (finish = false) => {
    const play = playRef.current;
    playRef.current = null;
    const { dock, plate, cover, caret, print, name } = parts();
    if (play) {
      play.timers.forEach((timer) => window.clearTimeout(timer));
      play.anims.forEach((anim) => anim.cancel());
      play.unretract?.();
      play.unretract = null;
    }
    plate?.style.removeProperty('clip-path');
    plate?.style.removeProperty('transform');
    print?.style.removeProperty('transform');
    print?.style.removeProperty('opacity');
    caret?.style.removeProperty('transform');
    if (phone && (play?.carry || play?.grow)) {
      cover?.style.removeProperty('transform');
      cover?.style.removeProperty('transform-origin');
    }
    name?.style.removeProperty('height');
    name?.style.removeProperty('overflow');
    dock?.removeAttribute('data-switch');
    dock?.removeAttribute('data-ticket');
    dock?.removeAttribute('data-arriving');
    if (finish && play?.role === 'in' && dock) {
      dock.setAttribute('data-arrived', '');
      window.clearTimeout(arrivedTimerRef.current);
      arrivedTimerRef.current = window.setTimeout(() => dock.removeAttribute('data-arrived'), TICKET.extrasInMs);
    }
  };
  // Gone at once, no fade: a destination given up before its relay, an
  // arrival before its ink (never seen), or a carrier a newer switch has
  // dropped (a ticket already over it: it would linger where it lies).
  const cutUnseen = () => {
    const dock = dockRef.current;
    dock?.setAttribute('data-cut', '');
    dock?.removeAttribute('data-leaving');
    settlePlay();
    if (dock) requestAnimationFrame(() => requestAnimationFrame(() => dock.removeAttribute('data-cut')));
  };
  // Let go mid-play: it holds where it is while it fades (put back at the
  // reseat).
  const freezePlay = () => {
    const play = playRef.current;
    if (!play) return;
    play.timers.forEach((timer) => window.clearTimeout(timer));
    play.timers = [];
    play.anims.forEach((anim) => { if (anim.playState !== 'finished') holdNow(anim); });
  };
  const newPlay = (kind: Play['kind'], key: number, role: Play['role'], mode: Play['mode'], cutAt = 0): Play => {
    const play: Play = { kind, key, role, mode, anims: [], plate: null, print: null, dissolve: null, carry: null, grow: null, tip: null, timers: [], relayed: false, cut: false, cutAt, inked: false, retracted: false, unretract: null };
    playRef.current = play;
    return play;
  };
  const later = (play: Play, time: number, run: () => void) => {
    play.timers.push(window.setTimeout(() => { if (playRef.current === play) run(); }, Math.max(0, time - performance.now())));
  };
  // ── The beats ──
  // The tip: back into its corner (DUR.flick, the exit curve), out of it —
  // popped, past its size and back, a beat of its own (coverDock
  // `tipPopFrames`) — about the point where it meets the plate (global.css
  // `transform-origin` per corner). From where it stands, if it was moving.
  const retractTip = (play: Play, time: number) => {
    const { caret } = parts();
    if (!caret) return;
    if (play.tip) {
      try { play.tip.commitStyles(); } catch { /* not rendered: from rest */ }
      play.tip.cancel();
    }
    play.tip = startAt(caret.animate([{ transform: 'scale(0)' }], { duration: TICKET.tipOutMs, easing: CSS_EASE.leave, fill: 'forwards' }), time);
    play.anims.push(play.tip);
  };
  const popTip = (play: Play | null, time: number) => {
    const { caret } = parts();
    if (!caret) return null;
    // It holds the tip in until `time` itself: whatever put it in goes.
    if (play?.tip) {
      play.tip.cancel();
      play.anims = play.anims.filter((anim) => anim !== play.tip);
    }
    caret.style.removeProperty('transform');
    const tip = startAt(caret.animate(tipPopFrames(CSS_EASE), { duration: TICKET.tipInMs, fill: 'backwards' }), time);
    tip.onfinish = () => tip.cancel();
    if (play) {
      play.tip = tip;
      play.anims.push(tip);
    }
    return tip;
  };
  // The board's first beat on the leaving ticket (src/lib/routeShield.ts,
  // FLAP): at `time` (its switch's `flapAt`) its name keeps its first
  // letters, so the ticket laid on it at the relay — FLAP.pause into the
  // same turn — takes them up on the same pixels. Put back when its play
  // ends (it is cut by then, unseen).
  const retractName = (play: Play, time: number) => {
    if (reduce) return;
    later(play, time, () => {
      const root = signRef.current;
      if (!root || play.retracted) return;
      play.retracted = true;
      play.unretract = retractFlap(root);
    });
  };
  // The cover shrinks into its ticket at the corner by its shield — the clip
  // closing on it, the photograph shrinking into the strip as a miniature of
  // itself — (`dir` 'let-go': on the exit curve), over `ms` (a fold back is
  // shorter). From where it stands, if it was opening.
  const foldPlate = (play: Play, form: TicketForm, time: number, dir: 'fold' | 'let-go', ms?: number) => {
    const { plate, print } = parts();
    if (!plate) return;
    const openingPlate = alive(play.plate) ? play.plate : null;
    const openingPrint = alive(play.print) ? play.print : null;
    const { frames, print: printFrames, ms: total } = ticketFrames(form, dir);
    if (openingPlate) {
      try { openingPlate.commitStyles(); } catch { /* fold from whole */ }
      openingPlate.cancel();
      play.plate = startAt(plate.animate([ticketStyle(form, 0, 0)], { duration: ms ?? TICKET_FOLD_MS, easing: CSS_EASE.plane, fill: 'forwards' }), time);
    } else {
      play.plate = startAt(plate.animate(frames, { duration: ms ?? total, easing: 'linear', fill: 'forwards' }), time);
    }
    play.anims.push(play.plate);
    if (!print) return;
    if (openingPlate || openingPrint) {
      if (openingPrint) {
        try { openingPrint.commitStyles(); } catch { /* from full size */ }
        openingPrint.cancel();
      }
      play.print = startAt(print.animate([printStyle(form, 0)], { duration: ms ?? TICKET_FOLD_MS, easing: CSS_EASE.plane, fill: 'forwards' }), time);
    } else {
      play.print = startAt(print.animate(printFrames, { duration: ms ?? total, easing: 'linear', fill: 'forwards' }), time);
    }
    play.anims.push(play.print);
  };
  // The plate held in its ticket form (the photograph a miniature in the
  // strip) until `time`, then grown open in place, the photograph growing
  // with it; when it is open everything is cancelled (the clip `none`: the
  // corner free for the tip).
  const expandPlate = (play: Play, form: TicketForm, time: number, hold: boolean) => {
    const { plate, print } = parts();
    if (!plate) return;
    const { frames, print: printFrames, ms } = ticketFrames(form, 'expand');
    const timing: KeyframeAnimationOptions = { duration: ms, easing: 'linear', fill: hold ? 'both' : 'forwards' };
    play.plate = startAt(plate.animate(frames, timing), time);
    play.anims.push(play.plate);
    if (!print) return;
    play.print = startAt(print.animate(printFrames, timing), time);
    play.anims.push(play.print);
  };
  // The relay: the arriving ticket's miniature dissolves in over the one
  // under it (the only thing on the two tickets that differs).
  const dissolveIn = (play: Play, time: number) => {
    const { print } = parts();
    if (!print) return;
    play.dissolve = startAt(print.animate([{ opacity: 0 }, { opacity: 1 }], { duration: TICKET.dissolveMs, easing: CSS_EASE.travel, fill: 'backwards' }), time);
    play.anims.push(play.dissolve);
  };
  // The card eases from `from` to its own stock — the stub, its caret and
  // its sign's band, each a colour of its own (animating the stock itself
  // restyled the whole ticket every frame) — from `time` over `ms`; before
  // it, the card is `from`.
  const paperFrom = (play: Play, from: string, time: number, ms: number) => {
    const { plate } = parts();
    const to = stockPaper(collection.slug);
    if (!plate || !from || from === to) return;
    const timing: KeyframeAnimationOptions = { duration: Math.max(1, ms), easing: CSS_EASE.travel, fill: 'backwards' };
    const stub = plate.querySelector<HTMLElement>('.archive-ticket-stub');
    const caret = plate.querySelector<HTMLElement>('.archive-plate__caret[data-half="stub"]');
    const band = plate.querySelector<SVGElement>('.archive-ticket-sign__shield .route-shield__band');
    if (stub) play.anims.push(startAt(stub.animate([{ backgroundColor: from }, { backgroundColor: to }], timing), time));
    // (The caret's stock is its `color`: its edge is the sign's rule.)
    if (caret) play.anims.push(startAt(caret.animate([{ color: from }, { color: to }], timing), time));
    if (band) play.anims.push(startAt(band.animate([{ fill: from }, { fill: to }], timing), time));
  };
  // The sign's rule starts at the carrier's name lines (a one-line and a
  // two-line name: a 28 px step at the relay otherwise) and eases to its
  // own from the relay, A to B on a clock (EASE.travel: on the arrive
  // curve's first frames the rule's edge jumped 10–12 px a frame).
  // Stub-local, inside the ticket's clip; nothing is read back.
  const ruleFrom = (play: Play, fromLines: number | undefined, time: number) => {
    const { name } = parts();
    const own = signLines(collection.name);
    if (!name || !fromLines || fromLines === own) return;
    const height = (lines: number) => `${(lines * TICKET.nameLine).toFixed(2)}em`;
    name.style.height = height(fromLines);
    name.style.overflow = 'hidden';
    const rule = startAt(name.animate([{ height: height(fromLines) }, { height: height(own) }], { duration: TICKET.ruleMs, easing: CSS_EASE.travel, fill: 'forwards' }), time);
    rule.onfinish = () => {
      name.style.removeProperty('height');
      name.style.removeProperty('overflow');
      rule.cancel();
    };
    play.anims.push(rule);
  };
  // The phone's cards stand centred at the foot of the screen, each at its
  // own scale. A switch folds every card into ONE ticket size on the screen
  // (`ticketScale`, the smallest card's: src/lib/explorer.ts,
  // phoneTicketScale) — a card larger than it shrinks to it AS IT FOLDS,
  // about its ticket's corner (the card's bottom-right), which it brings
  // onto the arriving card's; a card at it stays as it is. The arriving card
  // waits at that same size on its own corner, so the relay lays one ticket
  // on the other exactly and the transit holds one size, then grows out of
  // it to its own size as it opens (arrive, then open). Never a card grown
  // to a larger one's scale on its way into a ticket (review, 2026-09-29:
  // Miami's card swelled 25 px taller "shrinking" to Orlando's). DERIVED
  // from the cards; from where it stands, if it was already moving.
  const ticketK = (scale: number | undefined, other?: PhoneCard) =>
    (card ? Math.min(scale ?? Math.min(card.scale, other?.scale ?? card.scale), card.scale) / card.scale : 1);
  const ticketTransform = (k: number, dx = 0) => ({ transform: `translate(${dx.toFixed(2)}px, 0px) scale(${k.toFixed(4)})`, transformOrigin: '100% 100%' });
  const phoneCarry = (play: Play, toRatio: number | undefined, time: number, ms: number, scale: number | undefined) => {
    const { cover } = parts();
    if (!phone || !card || !cover || !toRatio) return;
    // (At a switch's beat: the resize-read size, never a live read of the
    // window inside the frame, src/lib/viewport.ts.)
    const dest = phoneCard(viewport().w, viewport().h, toRatio);
    const k = ticketK(scale, dest);
    const dx = ((dest.photoW + TICKET_STUB) * dest.scale - (card.photoW + TICKET_STUB) * card.scale) / 2 / card.scale;
    const to = ticketTransform(k, dx);
    // (Still moving, or holding where it came to: from there.)
    const running = [play.carry, play.grow].filter((anim): anim is Animation => !!anim && anim.playState !== 'idle');
    if (running.length) {
      running.forEach((anim) => {
        try { anim.commitStyles(); } catch { /* from rest */ }
        anim.cancel();
      });
      play.grow = null;
    } else if (Math.abs(k - 1) < 1e-3 && Math.abs(dx) < 0.25) return;
    const frames = running.length ? [to] : [ticketTransform(1), to];
    play.carry = startAt(cover.animate(frames, { duration: Math.max(1, ms), easing: CSS_EASE.plane, fill: 'forwards' }), time);
    play.anims.push(play.carry);
  };
  // The arriving card grows out of the ticket to its own size as it opens
  // (`time`: the opening; `hold`: at the ticket's size until then — else
  // whatever brought it there holds it).
  const phoneGrow = (play: Play, scale: number | undefined, time: number, hold: boolean) => {
    const { cover } = parts();
    if (!phone || !card || !cover) return;
    const k = ticketK(scale);
    if (Math.abs(k - 1) < 1e-3) return;
    play.grow = startAt(cover.animate([ticketTransform(k), ticketTransform(1)], { duration: TICKET_EXPAND_MS, easing: CSS_EASE.plane, fill: hold ? 'both' : 'forwards' }), time);
    play.anims.push(play.grow);
  };
  // A card laid on a ticket still in transit (a new choice mid-transit):
  // it starts at the size and place that ticket has on the screen now (one
  // read of its transform, at the relay, as its stock is read), holds it
  // while its picture dissolves in over the one under it, and comes to its
  // own ticket's place over a fold's length once that one is gone (the
  // same size: only the corner moves, if the cards differ in width).
  const phoneLay = (play: Play, under: HTMLElement | null, fromRatio: number | undefined, time: number, scale: number | undefined) => {
    const { cover } = parts();
    const below = under?.querySelector<HTMLElement>('.archive-dock__cover') ?? null;
    if (!phone || !card || !cover || !below || !fromRatio) return;
    // (It holds as it is from here — its own part pauses it too — so what is
    // read is where it stays.)
    below.getAnimations().forEach((anim) => { if (anim.playState === 'running') holdNow(anim); });
    const now = getComputedStyle(below).transform;
    const m = now && now !== 'none' ? new DOMMatrixReadOnly(now) : new DOMMatrixReadOnly();
    const out = phoneCard(viewport().w, viewport().h, fromRatio);
    const k = (m.a * out.scale) / card.scale;
    const dx = (((out.photoW + TICKET_STUB) * out.scale - (card.photoW + TICKET_STUB) * card.scale) / 2 + m.e * out.scale) / card.scale;
    const own = ticketK(scale);
    if (Math.abs(k - own) < 1e-3 && Math.abs(dx) < 0.25) return;
    play.carry = startAt(cover.animate(
      [ticketTransform(k, dx), ticketTransform(own)],
      { duration: TICKET_FOLD_MS, easing: CSS_EASE.plane, fill: 'both' },
    ), time + TICKET.dissolveMs);
    play.anims.push(play.carry);
  };
  // After the opening: the tip, then — once it is down — the tab and the
  // cue (`data-arrived`). The phone has no tip: its tab and "View story"
  // come in as the card finishes opening.
  const openAndTip = (play: Play, beats: { expandAt: number; expandEnd: number; tipAt: number; extrasAt: number }) => {
    const { dock } = parts();
    const extrasAt = phone ? beats.expandEnd - TICKET.phoneExtrasLead : beats.extrasAt;
    later(play, beats.expandAt, () => {
      dock?.removeAttribute('data-ticket');
      play.inked = true;
    });
    later(play, beats.expandEnd, () => {
      [play.plate, play.print, play.carry, play.grow].forEach((anim) => anim?.cancel());
      play.anims = play.anims.filter((anim) => anim !== play.plate && anim !== play.print && anim !== play.carry && anim !== play.grow);
      play.plate = null;
      play.print = null;
      play.carry = null;
      play.grow = null;
    });
    later(play, extrasAt, () => {
      dock?.removeAttribute('data-switch');
      dock?.setAttribute('data-arrived', '');
    });
    later(play, Math.max(extrasAt + TICKET.extrasInMs, beats.tipAt + TICKET.tipInMs), () => {
      dock?.removeAttribute('data-arrived');
      settlePlay();
    });
  };
  // ── The roles ──
  // The arriving place's cover: hidden in its ticket form from the click
  // (`data-ticket="wait"`, set here, in the frame's own task, before any
  // paint), laid on at the relay — its miniature dissolving in over the
  // leaving one's ("lay": at once, over a ticket in transit) — grown open at
  // `expandAt`, its tip out at `tipAt`, its tab and cue once the tip is down.
  const switchIn = (sw: DockSwitch) => {
    settlePlay();
    const { dock, plate } = parts();
    if (!dock || !plate) return;
    // (It may be the cover just left, cut at its relay: it is in hand again.)
    dock.removeAttribute('data-cut');
    dock.removeAttribute('data-leaving');
    const play = newPlay('switch', sw.key, 'in', sw.mode, sw.cutAt);
    dock.setAttribute('data-switch', 'in');
    dock.setAttribute('data-ticket', sw.mode === 'lay' ? '' : 'wait');
    const form = ticketForm();
    if (reduce || !form) {
      // Values, not structure: the ticket is the next place's at once.
      settlePlay(true);
      return;
    }
    const plan = coverDock.plan();
    const leaving = document.querySelector<HTMLElement>(`[data-cover-for="archive-item-${CSS.escape(sw.from)}"]`);
    // The stock it is laid on: the carrier's own, or — a ticket in transit,
    // mid-ease — its colour now (one read, at the relay).
    let fromStock = plan?.[sw.from]?.stock ?? leaving?.querySelector<HTMLElement>('.archive-plate')?.style.getPropertyValue('--stub-paper').trim() ?? '';
    if (sw.mode === 'lay') {
      const stub = leaving?.querySelector<HTMLElement>('.archive-ticket-stub');
      if (stub) fromStock = getComputedStyle(stub).backgroundColor || fromStock;
      phoneLay(play, leaving, sw.fromRatio, sw.relayAt, sw.ticketScale);
    }
    // (The phone's card: at the ticket's size from the relay — or brought
    // there from the ticket it is laid on — and grown to its own as it opens.)
    phoneGrow(play, sw.ticketScale, sw.expandAt, !play.carry);
    expandPlate(play, form, sw.expandAt, true);
    dissolveIn(play, sw.relayAt);
    play.tip = popTip(play, sw.tipAt);
    paperFrom(play, fromStock, sw.relayAt, Math.min(TICKET.paperMaxMs, sw.expandAt - sw.relayAt));
    ruleFrom(play, sw.fromLines, sw.relayAt);
    openAndTip(play, sw);
  };
  // A new timing of the switch this cover is arriving in (the reader took
  // the map mid-turn, or asked for this place again): the opening and the
  // tip move.
  const retimeIn = (sw: DockSwitch) => {
    const play = playRef.current;
    const { dock } = parts();
    if (!play || !dock) return;
    play.timers.forEach((timer) => window.clearTimeout(timer));
    play.timers = [];
    // (Turned back to itself, the plate is still folding until its relay.)
    if (play.mode !== 'self' || play.relayed) {
      [play.plate, play.print].forEach((anim) => { if (alive(anim)) anim.startTime = sw.expandAt; });
    }
    if (alive(play.grow)) play.grow.startTime = sw.expandAt;
    if (play.tip) play.tip.startTime = sw.tipAt;
    openAndTip(play, sw);
  };
  // The relay (in the frame it passes, for every cover at once): the
  // arriving ticket is seen, and its board takes the turn up where it stands
  // (timed from the switch's retract, the letters the leaving ticket kept
  // set over its blank cells), down before the opening.
  const relayIn = (sw: DockSwitch, now: number) => {
    const play = playRef.current;
    const { dock } = parts();
    if (!play || !dock) return;
    play.relayed = true;
    play.inked = true;
    dock.setAttribute('data-ticket', '');
    if (play.mode === 'self') {
      // Turned back to itself: folded, it is held as a ticket (its own
      // picture in the strip) until it grows open again.
      const form = ticketForm();
      const fold = [play.plate, play.print];
      if (form) expandPlate(play, form, sw.expandAt, true);
      fold.forEach((anim) => anim?.cancel());
      // Its name, retracted as it folded, turns back into place (the board
      // takes the cells over from here).
      if (play.retracted) {
        play.unretract = null;
        relayFlapRef.current?.(sw.flapAt, true);
      }
      return;
    }
    relayFlapRef.current?.(sw.flapAt);
  };
  // The ticket carrying the switch: from whole it shrinks into its ticket
  // ('fold'); a ticket in transit stays one ('lay'); a cover opening folds
  // back from where it is, over what is left before the relay ('back'). It
  // is cut at `cutAt`, the arriving picture over it.
  const switchOut = (sw: DockSwitch) => {
    const { dock } = parts();
    if (!dock) return;
    const was = playRef.current;
    const form = ticketForm();
    const now = performance.now();
    if (was?.kind === 'switch' && was.mode === 'self' && !was.relayed) {
      // Turned back to itself and away again before its relay (A → B → A →
      // C, or a key held down round the route): it never stopped folding,
      // and it carries this switch on the same fold — only its pending
      // opening and tip are given up (the tip held in from where it is).
      was.timers.forEach((timer) => window.clearTimeout(timer));
      was.timers = [];
      Object.assign(was, { key: sw.key, role: 'out', mode: 'fold', cut: false, cutAt: sw.cutAt });
      dock.setAttribute('data-switch', 'out');
      dock.removeAttribute('data-arrived');
      if (reduce || !form) return;
      retractTip(was, now);
      if (!was.retracted) retractName(was, sw.flapAt);
      phoneCarry(was, sw.toRatio, now, Math.max(1, sw.relayAt - now), sw.ticketScale);
      return;
    }
    if (sw.mode === 'fold' || !was) {
      if (was) settlePlay();
      const play = newPlay('switch', sw.key, 'out', sw.mode, sw.cutAt);
      dock.setAttribute('data-switch', 'out');
      if (reduce || !form) return;
      retractTip(play, now);
      foldPlate(play, form, now + TICKET.foldAt, 'fold');
      retractName(play, sw.flapAt);
      phoneCarry(play, sw.toRatio, now + TICKET.foldAt, TICKET_FOLD_MS, sw.ticketScale);
      return;
    }
    // It was arriving: it carries now.
    was.timers.forEach((timer) => window.clearTimeout(timer));
    was.timers = [];
    Object.assign(was, { kind: 'switch', key: sw.key, role: 'out', mode: sw.mode, cut: false, cutAt: sw.cutAt });
    dock.setAttribute('data-switch', 'out');
    dock.removeAttribute('data-arrived');
    dock.removeAttribute('data-arriving');
    if (reduce || !form) return;
    if (sw.mode === 'lay') {
      // Still a ticket: it holds as it is (the tip in, its picture in the
      // strip) — its own picture whole at once, so the one it was laid on
      // can go from under it unseen.
      was.dissolve?.finish();
      [was.plate, was.print, was.tip, was.carry, was.grow].forEach((anim) => { if (alive(anim)) holdNow(anim); });
      return;
    }
    // 'back': folds back from where it is, its tip in first, by the relay.
    const ms = Math.max(1, sw.relayAt - now);
    retractTip(was, now);
    foldPlate(was, form, now, 'fold', ms);
    retractName(was, sw.flapAt);
    phoneCarry(was, sw.toRatio, now, ms, sw.ticketScale);
  };
  // Turned back to before its relay (A → B → A): the carrier is the arriving
  // cover, in place — no relay to another — held as a ticket (its own
  // picture in the strip), its name turned back into place if it had
  // retracted (at its relay), and grown open at the new `expandAt`.
  const switchSelf = (sw: DockSwitch) => {
    const { dock } = parts();
    const was = playRef.current;
    const form = ticketForm();
    if (!dock || !was || !form || reduce) {
      settlePlay(true);
      return;
    }
    was.timers.forEach((timer) => window.clearTimeout(timer));
    was.timers = [];
    Object.assign(was, { kind: 'switch', key: sw.key, role: 'in', mode: 'self', relayed: false, cut: false, inked: true });
    dock.removeAttribute('data-cut');
    dock.removeAttribute('data-leaving');
    dock.setAttribute('data-switch', 'in');
    dock.setAttribute('data-ticket', '');
    // (The phone's card, on its way to the other card's corner, comes back to
    // its own at the ticket's size, and grows out of it as it opens.)
    phoneCarry(was, cardRatio, performance.now(), Math.max(1, sw.relayAt - performance.now()), sw.ticketScale);
    phoneGrow(was, sw.ticketScale, sw.expandAt, !was.carry);
    popTip(was, sw.tipAt);
    openAndTip(was, sw);
  };
  // A frame's switch, heard once per key and timing (`held`: the place in
  // hand this frame, if any).
  const onSwitch = (sw: DockSwitch | null, at: boolean, held: string | null) => {
    const me = collection._id;
    const play = playRef.current;
    const mine = !!sw && (sw.from === me || sw.to === me);
    if (!mine) {
      if (!play || play.kind !== 'switch') return;
      if (play.role === 'in') {
        if (!play.relayed && play.mode !== 'self') cutUnseen();
        else if (at) settlePlay(true);
        else freezePlay();
      } else if (play.cut) settlePlay();
      // A carrier a newer switch has dropped before its cut (a ticket laid
      // over it, now carrying the new one), or whose switch ended with its
      // place still in hand (cut short: a resize), is gone at once, unseen
      // under the ticket over it — it must not linger and fade where it lies.
      else if (sw || held) cutUnseen();
      // (A carrier not yet cut, its switch given up with nothing in hand —
      // let go — folds on as it fades, and is put back at the reseat.)
      return;
    }
    if (sw.from === me && sw.to === me) {
      if (play?.mode === 'self' && play.key === sw.key) retimeIn(sw);
      else switchSelf(sw);
      return;
    }
    if (sw.to === me) {
      if (play?.kind === 'switch' && play.role === 'in' && play.key === sw.key) retimeIn(sw);
      else switchIn(sw);
      return;
    }
    // Still folding for the switch this one replaces: it carries on (the
    // phone's card now coming to the newest card's scale, from where it is).
    if (play?.kind === 'switch' && play.role === 'out') {
      play.key = sw.key;
      play.cutAt = sw.cutAt;
      if (!play.cut && !reduce && phone) phoneCarry(play, sw.toRatio, performance.now(), Math.max(1, sw.relayAt - performance.now()), sw.ticketScale);
      return;
    }
    switchOut(sw);
  };
  // A frame's beats: the relay, the carrier's cut.
  const onBeat = (sw: DockSwitch, now: number) => {
    const play = playRef.current;
    if (!play || play.kind !== 'switch' || play.key !== sw.key) return;
    if (play.role === 'in' && !play.relayed && now >= sw.relayAt) relayIn(sw, now);
    if (play.role === 'out' && !play.cut && now >= sw.cutAt) {
      play.cut = true;
      const { dock } = parts();
      dock?.setAttribute('data-cut', '');
      dock?.removeAttribute('data-leaving');
    }
  };
  // ── The arrival (src/lib/coverDock.ts, "The arrival") ──
  // This cover, asked for from the open map, shown from take-off but not
  // yet seen: at `inkAt` its ticket inks in beside its shield, its picture
  // a miniature in the strip; at `expandAt` it grows open; at `tipAt` its
  // tip pops out, and once it is down its tab and cue come in.
  const arriveIn = (arrive: DockArrive) => {
    settlePlay();
    const { dock, plate } = parts();
    if (!dock || !plate) return;
    dock.removeAttribute('data-cut');
    const play = newPlay('arrive', arrive.key, 'in', 'arrive');
    dock.setAttribute('data-switch', 'in');
    dock.setAttribute('data-ticket', '');
    const form = ticketForm();
    if (reduce || !form) {
      settlePlay(true);
      return;
    }
    // Out of the hand until it inks in (it is on the map, unseen).
    dock.setAttribute('data-arriving', '');
    later(play, arrive.inkAt, () => {
      dock.removeAttribute('data-arriving');
      play.inked = true;
      play.relayed = true;
    });
    play.anims.push(startAt(dock.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ARRIVAL.inkMs, easing: CSS_EASE.arrive, fill: 'backwards' }), arrive.inkAt));
    expandPlate(play, form, arrive.expandAt, true);
    play.tip = popTip(play, arrive.tipAt);
    openAndTip(play, { ...afterOpening(arrive.expandAt), tipAt: arrive.tipAt, extrasAt: arrive.extrasAt });
  };
  // ── Letting go: the fold, backwards ──
  // The ticket let go (the empty map, Escape, the reader's own hand taking
  // its place away) puts its tip back, shrinks into its ticket at its seat on
  // the exit curve (its picture a miniature in the strip), and fades as it
  // rides away with its shield (global.css). Mid-play, it holds where it is
  // instead.
  const letGo = () => {
    const play = playRef.current;
    if (play) {
      if (play.role === 'in' && !play.inked) cutUnseen();
      else freezePlay();
      return;
    }
    const form = ticketForm();
    if (reduce || !form) return;
    const fold = newPlay('letgo', 0, 'out', 'fold');
    const now = performance.now();
    retractTip(fold, now);
    foldPlate(fold, form, now + TICKET.foldAt, 'let-go');
  };
  const onSwitchRef = useRef(onSwitch);
  onSwitchRef.current = onSwitch;
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;
  const arriveInRef = useRef(arriveIn);
  arriveInRef.current = arriveIn;
  const letGoRef = useRef(letGo);
  letGoRef.current = letGo;
  const settlePlayRef = useRef(settlePlay);
  settlePlayRef.current = settlePlay;

  useEffect(() => {
    if (!dockReady) return;
    const dock = dockRef.current;
    if (!dock) return;
    const me = collection._id;
    let shown = false;
    let leaving = false;
    let seenSwitch = '';
    let seenArrive = 0;
    let hiddenAt = Number.NEGATIVE_INFINITY;
    let reseatTimer = 0;
    // Let go mid-switch, a ticket fades where it lies (it was pinned there:
    // back on its foot it would jump), until it is put back.
    let hold = false;
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    // Gone: once its fade is done, the ticket is put back whole for the next
    // visit (a stub torn off for the story, a fold, a tip), unseen.
    const reseatLater = () => {
      window.clearTimeout(reseatTimer);
      hiddenAt = performance.now();
      reseatTimer = window.setTimeout(() => {
        if (dockShownRef.current) return;
        hold = false;
        settlePlayRef.current();
        reseatRef.current();
      }, DOCK_FADE_MS + 60);
    };
    const off = coverDock.subscribe((frame) => {
      const at = frame.at === me;
      const sw = frame.switch ?? null;
      const now = performance.now();
      // A new switch (or a new timing of it), or none: this cover's part.
      const heard = sw ? `${sw.key}.${sw.rev}` : '';
      if (heard !== seenSwitch) {
        seenSwitch = heard;
        onSwitchRef.current(sw, at, frame.at);
      }
      // Its beats, in this frame, for every cover at once.
      if (sw) onBeatRef.current(sw, now);
      const out = !at && !!sw && sw.from === me;
      if (out !== leaving) {
        leaving = out;
        if (out) {
          if (playRef.current?.role !== 'out' || !playRef.current.cut) dock.setAttribute('data-leaving', '');
        } else {
          dock.removeAttribute('data-leaving');
          // Its switch is over: gone at once (it was cut at the relay) —
          // unless it is the cover in hand again, or was let go while still
          // folding (it fades as it folds, where it lies).
          const play = playRef.current;
          if (!at && play?.role === 'out' && !play.cut) {
            hold = true;
            reseatLater();
          } else if (!at) {
            dock.setAttribute('data-cut', '');
            requestAnimationFrame(() => requestAnimationFrame(() => dock.removeAttribute('data-cut')));
          }
        }
      }
      if (at !== shown) {
        shown = at;
        dockShownRef.current = at;
        window.clearTimeout(reseatTimer);
        if (at) {
          hold = false;
          // In hand again (the cover just left, cut at its relay, chosen
          // back): nothing of that cut outlives it — a let-go of it later
          // must fold and fade, not vanish.
          dock.removeAttribute('data-cut');
          dock.setAttribute('data-at', '');
          const appeared = dockAppearRef.current;
          dockAppearRef.current = null;
          appeared?.();
        } else {
          dock.removeAttribute('data-at');
          // Let go (not handed on in a switch, not cut unseen): it folds
          // back into its ticket as it fades — or, a ticket mid-switch
          // (pinned), holds as it is, where it lies.
          if (!out && !dock.hasAttribute('data-cut')) {
            const play = playRef.current;
            if (play?.kind === 'switch' && play.role === 'in' && play.inked) hold = true;
            letGoRef.current();
          }
          reseatLater();
        }
      }
      // A ticket arriving from the open map, once per key.
      const arrive = frame.arrive;
      if (at && arrive && arrive.id === me && arrive.key !== seenArrive) {
        seenArrive = arrive.key;
        arriveInRef.current(arrive);
      }
      // The phone's card is dealt at the foot of the screen: nothing to place.
      if (phone) return;
      // Hidden, its fade long done (or fading where it lies): nothing to
      // place until it shows again.
      if (hold || (!at && !out && performance.now() - hiddenAt > DOCK_FADE_MS + 120)) return;
      // Through a switch, where its ticket lies; pinned (the camera brought
      // back onto it); else at its foot — its corner a joint's gap off its
      // shield as the shield is drawn at this zoom (coverDock `shieldShift`:
      // nought at its rest).
      let point = frame.pins?.[me] ?? (frame.pin && (at || out) ? frame.pin : null);
      if (!point) {
        const foot = frame.points[me];
        const entry = coverDock.plan()?.[me];
        const shift = entry ? shieldShift(entry, frame.shieldZoom) : null;
        point = foot && shift ? { x: foot.x + shift.x, y: foot.y + shift.y } : foot;
      }
      if (!point || (point.x === lastX && point.y === lastY)) return;
      lastX = point.x;
      lastY = point.y;
      dock.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
    });
    return () => {
      off();
      window.clearTimeout(reseatTimer);
      dockShownRef.current = false;
      settlePlayRef.current();
    };
  }, [collection._id, dockReady, phone]);

  // ── The stub hand-off (src/lib/explorer.ts) ──
  // Stop 01 on an entry the entrance brings the stub for: the photograph
  // shows, the stub and the tip wait (global.css `[data-stub-awaited]`), and
  // show inside STUB_LANDED_EVENT itself — the frame the entrance's copy
  // goes — the tip coming out of its corner as it lands (its pop set up
  // before the stub shows, so no frame has it out).
  useLayoutEffect(() => {
    const plate = plateRef.current;
    if (!plate) return;
    if (!stubAwaited) {
      plate.removeAttribute('data-stub-awaited');
      return;
    }
    plate.setAttribute('data-stub-awaited', '');
    const landed = () => {
      if (!reduce) popTip(null, performance.now());
      plate.removeAttribute('data-stub-awaited');
    };
    window.addEventListener(STUB_LANDED_EVENT, landed);
    return () => window.removeEventListener(STUB_LANDED_EVENT, landed);
    // popTip reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockReady, reduce, stubAwaited]);

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
  // show through the tear's gap): the cover whole, printed, its tip at rest
  // (no pop).
  const tearStubThen = (go: () => void) => {
    if (!ticket || !dockShownRef.current) return false;
    if (stubTornRef.current) return false;
    if (playRef.current) settlePlay(true);
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
  // 字条跳转切换，和目标网站的效果一致: the stub's name, number and state turn
  // as the reference's board does (src/lib/routeShield.ts, FLAP) from the
  // place the camera left. RouteAtlas tells the page at take-off
  // (`atlas:depart`) and at touchdown (`atlas:arrive`), with the place left
  // as `from` (none from the open map, none on the entry):
  //  - At take-off the board is SET to the stop being left (`primeFlap`), so
  //    the ticket reads "MIAMI" until it turns — the name it lands with is
  //    never shown settled first and turned back. On a switch the leaving
  //    ticket's name retracts to its first letters as it folds (`flapAt`,
  //    the switch's `retractName`), and the arriving ticket's board takes the
  //    turn up at the relay, as it is laid on (`relayIn`: timed from that
  //    retract, the cascade starting as it is seen), down before it opens;
  //    failing that, it turns as it appears at its shield (at most
  //    FLAP_DOCK_WAIT_MS after the landing).
  //  - A take-off anywhere else puts this board back; so does a landing
  //    elsewhere, and FLAP_PRIME_MAX_MS with no turn at all.
  // Never on a first paint, a restore, a snap or the entry (whose ticket
  // comes up with nothing to turn from), and never under reduced motion,
  // where the sign is simply printed.
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
    const start = (timing?: { origin?: number; force?: boolean }) => {
      const root = signRef.current;
      const from = pending;
      cancelWait();
      if (!root || !from) return;
      pending = null;
      window.clearTimeout(primeTimer);
      primeTimer = 0;
      stopFlap?.();
      // Takes the primed board over where it stands: at a switch's relay,
      // timed from its retract; on a landing with no switch, from now.
      clearPrime = null;
      stopFlap = runFlap(root, from, timing);
    };
    relayFlapRef.current = (origin, force) => start({ origin, force });
    const onDepart = (event: Event) => {
      const detail = (event as CustomEvent<SignTrip>).detail;
      reset();
      const root = signRef.current;
      if (!detail || detail.id !== id || !detail.from || !root) return;
      pending = detail.from;
      // Turned back to its own place mid-fold: nothing to set (its name as
      // it stands, retracted or whole, is its board; `relayIn` turns it back).
      if (flapText(detail.from.name ?? '') === flapText(collection.name)) return;
      clearPrime = primeFlap(root, detail.from);
      primeTimer = window.setTimeout(() => {
        pending = null;
        unprime();
      }, FLAP_PRIME_MAX_MS);
      // It turns at the relay (the switch's `relayIn`), not before.
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
      relayFlapRef.current = null;
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
  // A docked photograph is exactly its planned size (the plan's, or the
  // phone card's: whole px, its own ratio to within a pixel), so the ticket
  // it folds into, and the stub the entrance lands on, are the plan's to the
  // pixel.
  const frameRatio = dockEntry && !phone
    ? `${dockEntry.photoW} / ${dockEntry.photoH}`
    : phone && card ? `${card.photoW} / ${card.photoH}` : String(plateRatio);
  // What the stub prints: only fields the archive already holds. No invented
  // codes. Space Grotesk has tabular figures, so the rows line up. No region
  // (owner, 2026-09-30: 票根上已经有region了，我希望只出现一处即可): the state
  // is on the cover once, boxed on its tab.
  // Each row: its label's key (also the React key), and its value — a
  // figure, or a coordinate whose hemisphere reads per language (北纬 …).
  const stubRows = useMemo(() => {
    const rows: Array<{ label: Key; value: string; coord?: Key }> = [];
    const frames = collection.photoCount ?? collection.photos?.length;
    if (frames) rows.push({ label: 'chapter.stub.frames', value: String(frames).padStart(2, '0') });
    if (collection.year) rows.push({ label: 'chapter.stub.year', value: String(collection.year) });
    const point = collection.mapLocation;
    if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      rows.push({ label: 'chapter.stub.lat', value: Math.abs(point.lat).toFixed(4), coord: point.lat >= 0 ? 'coord.n' : 'coord.s' });
      rows.push({ label: 'chapter.stub.long', value: Math.abs(point.lng).toFixed(4), coord: point.lng >= 0 ? 'coord.e' : 'coord.w' });
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
  // 中: the same lines' Chinese twins (src/i18n/content.ts withZh), each
  // falling back as its English does; a line with no twin prints English.
  const lang = useLang();
  const nameShown = (lang === 'zh' && collection.nameZh?.trim()) || collection.name;
  const datelineZh = (collection.location ? collection.locationZh : collection.regionZh)?.trim()
    || (collection.location || collection.region ? undefined : tr('zh', 'chapter.datelineFallback'));
  const ledeLine = (
    <Bi
      en={lede || deck || tr('en', 'chapter.rail.fallbackLede', { dateline })}
      zh={lede
        ? zhExcerpt(paragraphsOf(collection.introductionZh)[0], 110)
        : deck
          ? collection.subtitleZh?.trim()
          : tr('zh', 'chapter.rail.fallbackLede', { dateline: datelineZh || dateline })}
    />
  );
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
      style={plateRatio ? { aspectRatio: frameRatio } : undefined}
      className={`archive-photo-frame relative ${plateRatio ? '' : aspectClass} overflow-hidden`}
    >
      {/* The print: what a switch shrinks into the ticket's strip and grows
          back out of it, a miniature of the cover (its transform and ink
          written only while it runs). */}
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
              alt={nameShown}
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
        className="archive-plate__view pointer-events-none absolute bottom-5 right-[max(1.25rem,env(safe-area-inset-right))] z-10 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/14 bg-[#171b15]/72 px-4 font-ui text-[9px] uppercase tracking-[0.1em] text-white/76 shadow-[0_10px_28px_rgba(7,9,6,0.18)] lg:hidden"
      >
        <T k="chapter.hoverViewStory" /> <ArrowRight size={12} />
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
    'aria-label': tr(lang, 'chapter.coverAria', { name: nameShown }),
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
        <T k="chapter.openStory" />
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
    // While it is a ticket (a switch, an arrival) the cover answers nothing:
    // no give, and a click is swallowed — never a tear, and never through to
    // the map, where a click lets the place go. It answers again once open.
    const ticketed = () => dockRef.current?.hasAttribute('data-ticket') ?? false;
    const dockPointer = {
      ...coverPointer,
      onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (ticketed()) return;
        coverPointer.onPointerDownCapture(event);
      },
      onClick: (event: React.MouseEvent) => {
        if (ticketed()) {
          event.stopPropagation();
          return;
        }
        coverPointer.onClick();
      },
    };
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
            On a switch the name turns on the board while the planet turns
            (`atlas:depart`, `runFlap`), the card easing from the stock it
            leaves. Below the sign, the
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
              {stubRows.map((row) => (
                <div key={row.label} className="archive-ticket-stub__row">
                  <dt><T k={row.label} /></dt>
                  <dd>{row.coord ? <T k={row.coord} vars={{ v: row.value }} /> : row.value}</dd>
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
                <T k={nextStop ? 'chapter.nextStop' : 'chapter.endOfRoute'} />
              </span>
              {nextStop ? (
                <span className="archive-ticket-next__stop">
                  <RouteShield
                    className="archive-ticket-next__shield"
                    code={stateCode(nextStop.region)}
                    number={pad2(nextStop.number)}
                    accent={stockPaper(nextStop.slug)}
                  />
                  <span className="archive-ticket-next__name"><Bi en={nextStop.name} zh={nextStop.nameZh} /></span>
                  <ArrowRight size={12} strokeWidth={1.6} aria-hidden="true" />
                </span>
              ) : (
                <ArrowRight className="archive-ticket-next__down" size={12} strokeWidth={1.6} aria-hidden="true" />
              )}
            </button>
          )}
        </aside>
        </div>

        {/* The tip (尖): the plate's corner nearest its shield points at
            it, as the reference's board points at its stop — part of the
            card (the photograph's dark edge or the stub's stock, whichever
            half that corner is), never a line across the gap. Through a
            switch it goes back into that corner first and comes out of it
            last, once the cover is open (尖…等封面切换过去之后再冒出来). */}
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
    // (The phone's tab is set back to the screen's size — its state a
    // constant 15px however far the card is scaled: `--card-scale`.)
    const seatStyle = phone && card
      ? ({ transform: `scale(${card.scale})`, '--card-scale': card.scale } as CSSProperties)
      : dockEntry ? { left: dockEntry.offset.x, top: dockEntry.offset.y } : undefined;
    const dock = dockReady && dockHost && (phone ? card : dockEntry) ? createPortal(
      <div
        ref={dockRef}
        className={`archive-dock${phone ? ' archive-dock--phone' : ''}`}
        data-cover-for={id}
        data-quadrant={phone ? 'phone' : quadrant}
        // Where "Open story" hangs: off the place's own route (coverDock
        // `cueSlot`).
        data-cue={!phone && dockEntry ? `${dockEntry.cue.edge}-${dockEntry.cue.side}` : undefined}
      >
        <div
          className="archive-dock__seat"
          style={seatStyle}
        >
          {/* The state, boxed in the sign's own enamel rule (州名可以框起来，
              更醒目): outlined, no fill, no lime. The region's figures ride
              on its first place's tab. */}
          {stateTab && (
            <div className="archive-dock__tab font-ui" data-side={phone ? 'left' : side} aria-hidden="true">
              <span className="archive-dock__tab-label"><T k="chapter.stateTab.label" /></span>
              <span className="archive-dock__tab-state"><Bi en={stateTab.state} zh={stateTab.stateZh} /></span>
              {stateTab.places != null && (
                <span className="archive-dock__tab-figures">
                  <T k="chapter.stateTab.figures" vars={{ places: stateTab.places, frames: stateTab.frames }} />
                </span>
              )}
            </div>
          )}
          <motion.div
            {...dockPointer}
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
          className="archive-rail group relative cursor-pointer"
        >
          {/* Reduced motion changes these values, never whether they are
              there: the MotionValues answer `reduce` themselves (a style
              that came and went with it SSR'd one way and hydrated the
              other, and left the rail stuck at the old opacity). */}
          <motion.div
            style={{ opacity: editorialOpacity, x: titleInteractionX }}
            className="archive-plate__meta pointer-events-none flex items-center justify-between gap-4 font-ui text-[9px] uppercase tracking-[0.1em]"
          >
            <span className="text-white/84"><T k="chapter.rail.chapter" vars={{ nn: String(index + 1).padStart(2, '0') }} /></span>
            <span className="text-right text-white/84">
              <Bi en={dateline} zh={datelineZh} />{collection.year ? ` · ${collection.year}` : ''}
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
              <Bi
                en={risingWords(nameParts)}
                zh={collection.nameZh?.trim() ? risingWords([collection.nameZh.trim()], () => ({ letterSpacing: '0.02em' })) : null}
              />
            </motion.h3>
          </motion.div>
          <motion.div
            style={{ opacity: fieldNoteOpacity, y: fieldNoteShift }}
            className="archive-lede relative z-10 mt-[clamp(28px,3vw,44px)] grid grid-cols-[76px_minmax(0,1fr)] items-start gap-x-6"
          >
            {/* Bone ink at the lime's old weights: the atlas's one lime is
                the viewfinder's chapter number. */}
            <div className="pt-1 font-ui uppercase">
              <p className="text-[10px] tracking-[0.1em] text-[#F4F4ED]"><T k="chapter.rail.frames" vars={{ frames }} /></p>
              <span className="mt-5 block h-px w-10 bg-[#F4F4ED]/65" />
            </div>
            <div className="min-w-0">
              <p className="archive-rail__lede max-w-[46ch] font-serif text-[16px] leading-[1.55]">
                {ledeLine}
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
            <span className="text-white/80"><T k="chapter.rail.chapter" vars={{ nn: String(index + 1).padStart(2, '0') }} /></span>
            <span className="mr-[1%] text-right text-white/80">
              <Bi en={dateline} zh={datelineZh} />{collection.year ? ` · ${collection.year}` : ''}
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
            <p className="text-[10px] tracking-[0.1em] text-[#F4F4ED]"><T k="chapter.rail.frames" vars={{ frames }} /></p>
            <span className="mt-5 block h-px w-10 bg-[#F4F4ED]/65" />
          </div>
          <div className="min-w-0">
            <p className="max-w-[48ch] font-serif text-[16px] leading-[1.55] text-white/64">
              {ledeLine}
            </p>
          </div>
        </motion.div>

        <motion.div
          style={{ opacity: fieldNoteOpacity, y: fieldNoteShift }}
          className="relative z-30 mt-[clamp(72px,18vw,96px)] px-5 pr-6 lg:hidden"
        >
          <p className="font-ui text-[9px] uppercase tracking-[0.1em] text-[#F4F4ED]/86"><T k="chapter.rail.frames" vars={{ frames }} /></p>
          <p className="mt-4 max-w-[34ch] font-serif text-[15px] leading-[1.5] text-white/66">
            {ledeLine}
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
