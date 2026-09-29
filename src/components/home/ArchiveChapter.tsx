import { Fragment, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState, useMemo, useSyncExternalStore } from 'react';
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
import { DUR_MS, EASE, SPRING, smootherstep } from '../../lib/motion';
import { DOCK, awaySide, coverDock, coverRatioOf } from '../../lib/coverDock';
import { phoneCard, type PhoneCard } from '../../lib/explorer';
import {
  TEAR_BEFORE_FLIGHT_MS,
  TEAR_FREE_MS,
  TEAR_MS,
  TEAR_REDUCED_MS,
  TEAR_TENSION_MS,
  affineCss,
  handTipAt,
  mirrorAffine,
  msAtTip,
  tearPose,
  tearStampAt,
  tornEdge,
  type TearFrame,
} from '../../lib/ticketTear';

const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';
const EMPTY_PRELOAD_IMAGE_URLS: readonly string[] = [];
const PRELOADED_IMAGE_URLS = new Set<string>();

interface ArchiveChapterProps {
  id: string;
  collection: Collection;
  onClick: () => void;
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
  /** Desktop tickets: the cover torn away by hand (see PULL_*), or by its
   *  stub's "Next stop", goes on to the next place. Called once the face is
   *  free; HomePage starts the voyage. Left undefined while a voyage is under
   *  way — the cover is then only a click, never a pull. `focus: false`
   *  (a scroll's tear) leaves keyboard focus where it is. */
  onTearAway?: (options?: { focus?: boolean }) => void;
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
// ── The tear ──
// Held like a ticket in two hands: the right hand keeps the stub, and the
// reader's other hand is the left (src/lib/ticketTear.ts, the score). The
// paper takes the strain, gives at the top notch, and the rip runs down the
// perforation hole by hole, catching on each bridge, while the face HINGES
// open about the running tip — its top-left corner drops first and the map
// opens in a V between face and stub, torn fibres on both edges. The last
// bridge snaps, the stub recoils, and the face is laid aside up and to the
// left. It never falls (我喜欢是有撕掉的感觉，而不是像掉下去一样).
//
// The homepage is a map to roam now (src/lib/explorer.ts), and the tear is
// what every gesture that lets a ticket go does first (点开封面或者其他地方，
// 产生撕掉票根特效): a shield, Prev / Next, the list, the empty map, Escape.
// The explorer asks for it (`archive:tear-then` on the section) and goes on
// only once the face is free (撕开后才能前往下一个地方): TEAR_BEFORE_FLIGHT_MS,
// the face free plus a beat. Opening the story is the other tear: the STUB
// comes off in the right hand (`archive:tear-stub`, the score turned round,
// as /about's ticket is torn) — the admission — and the photograph, whole,
// grows into the story. A ticket let go is put back whole once its cover
// has gone (`archive:reseat`, or the dock hiding it), so the next visit
// finds it as it was.
// The score (src/lib/ticketTear.ts) runs on one clock, `tearClock`, 0 whole →
// 1 gone over TEAR_MS; the stub's on its own, `stubClock`. ArchiveClosing's
// TEAR_BEFORE_ENDING_MS (590) is TEAR_FREE_MS plus a beat — mirrored, not
// imported (a lazy chunk): change them together
// (scripts/ticket-latch.test.mjs checks).
// A docked cover leaving with its shield fades out over this long (global.css
// `.archive-dock`, mirrored), on the leave curve.
const DOCK_FADE_MS = DUR_MS.out;
// Reduced motion keeps the event and drops the travel: the face fades, the
// stub dims.
const REDUCED_TEAR_S = TEAR_REDUCED_MS / 1000;
// While the rip runs, nothing of the face may cross the seam (see the JSX):
// only the band beside the stub is cut away — above and below it the cue
// keeps its overhang.
const SEAM_CLIP = 'polygon(-100vw -100vh, calc(100% + 100vw) -100vh, calc(100% + 100vw) 0%, 100% 0%, 100% 100%, calc(100% + 100vw) 100%, calc(100% + 100vw) calc(100% + 100vh), -100vw calc(100% + 100vh))';
// …and while the stub's rip runs, nothing of the stub may cross into the
// face: its seat is cut away to the left of the seam.
const STUB_SEAM_CLIP = 'polygon(-100vw -100vh, calc(100% + 100vw) -100vh, calc(100% + 100vw) calc(100% + 100vh), -100vw calc(100% + 100vh), -100vw 100%, 0% 100%, 0% 0%, -100vw 0%)';
// ── Pull to tear ──
// The owner's own gesture: the right hand holds the stub, the left pulls the
// face DOWN. On the active cover a drag down on the photograph drives the
// tear's clock directly — the hand IS the clock, through the tension and the
// rip (0 → PULL_FREE_CLOCK), so the rip's tip, the pivot and the wedge of
// map follow it exactly. The first PULL_CLICK_SLOP of the hand is the strain
// (the tension); past it the rip's tip runs down the seam one to one with the
// hand (travel / span), so the paper answers from the first centimetre, and
// the hinge opens under the hand. The hand is the resistance, so a pull has
// no catches: the score's smooth tip (`msAtTip`), never the stepped one the
// scroll's tear plays. Released past most of the rip (or flicked down once
// the hand has plainly pulled), the tear finishes on its own score and, only
// once the face is free, the page goes on to the next place (a voyage,
// started by HomePage). Released early, the ticket springs back. A press that moves
// less than PULL_CLICK_SLOP is still a click and opens the story; one that
// travels farther never does, whether or not it pulled anything (reduced
// motion, a cover that cannot be pulled — see `pressRef`).
// Desktop pointer only, active chapter only, never under reduced motion, a
// flight or a voyage.
const PULL_CLICK_SLOP = 6;
// How long after a travelled press is let go its click is still the end of
// that drag (the browser fires it right after the release).
const DRAG_CLICK_WINDOW_MS = 800;
/** The tear clock (0–1 of TEAR_MS) at which the hand's rip has run `tip` of
 *  the seam. */
const clockAtTip = (tip: number) => msAtTip(tip) / TEAR_MS;
// Where the hand stops driving the clock: the rip has reached the bottom
// notch and the face hangs by its last corner.
const PULL_FREE_CLOCK = TEAR_FREE_MS / TEAR_MS;
// Released with the rip this far down the seam, the tear completes: 89% of
// the hand's span, the very point it committed at when the hand drove the
// clock linearly — so a 120px pull still springs back on a 800px-tall window
// and a 190px one still tears on every desktop.
const PULL_COMMIT_CLOCK = clockAtTip(0.89);
// A flick completes it early — once the rip is a quarter down (a hand that
// has plainly pulled, not a click's twitch: where the old linear clock left
// the strain), at this downward speed (px/ms) over the last
// PULL_FLICK_WINDOW_MS.
const PULL_FLICK_MIN_CLOCK = clockAtTip(0.25);
const PULL_FLICK_SPEED = 0.8;
const PULL_FLICK_WINDOW_MS = 90;
// The hand's travel for the whole rip, as a share of the viewport (read once
// at the press), clamped: long enough that a click's wobble never tears.
const PULL_SPAN_VH = 0.18;
const PULL_SPAN_MIN = 110;
const PULL_SPAN_MAX = 180;
// While the hand holds it, the whole face gives a little to the pull — paper
// in two hands stretches before it goes — at this share of the hand's travel,
// never more than PULL_FOLLOW_MAX px.
const PULL_FOLLOW = 0.08;
const PULL_FOLLOW_MAX = 6;
// Let go early: the paper springs back to its seat, on the house's arrive
// curve (EASE.arrive).
const PULL_RESEAT_S = 0.35;
const PULL_RESEAT_EASE = EASE.arrive;
// When the page may go on: the face free plus a beat.
const PULL_GO_AFTER_MS = TEAR_BEFORE_FLIGHT_MS;
// The sign's flap ("The sign turns into place"): a board set to the stop
// being left at take-off is put back if no landing follows this soon (a
// flight lasts 1.15–3.6 s).
const FLAP_PRIME_MAX_MS = 4200;
// A docked sign waits for its cover to appear (the camera settled) at most
// this long after the landing.
const FLAP_DOCK_WAIT_MS = 1600;
// While a hand holds a face, nothing on the page starts a text selection.
// Module-level so the same function is added and removed.
const preventPullSelection = (event: Event) => event.preventDefault();
/** The section's stamp for a scroll's tear (ticketTear.ts, `tearStampAt`). */
const tearStamp = (now: number, fromMs: number, rate: number) => String(Math.round(tearStampAt(now, fromMs, rate)));
// The shared quintic smootherstep (src/lib/motion.ts), the one RouteAtlas
// uses. The plate's matte, cue and copy accelerate and settle on the same
// curve as the map halo, route head and left-hand directory.
const smoothFocus = smootherstep;

/**
 * ArchiveChapter — a collection's homepage entry. Two layouts:
 *  - 'cover'   : a tall full-bleed photo with the name set large ON the image
 *                (the default, with the masthead crossing the map/photo seam).
 *  - 'feature' : an editorial 2-column spread (image + a text rail with the
 *                subtitle deck, an excerpt, a dateline, and the CTA) — used once,
 *                for the opener, to break the look-alike stack.
 * Hover keeps the same photograph, with a slow breath and a quiet story cue.
 */
export default function ArchiveChapter({
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
  onTearAway,
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

  // Pull to tear (see PULL_*): the hand on the photograph. Declared here, read
  // by the photograph's pointer handlers; the gesture itself is set up below,
  // beside the tear it drives.
  const pullRef = useRef<{
    id: number;
    frame: HTMLElement;
    x: number;
    y: number;
    /** How far down the seam the rip was when the hand took hold (0 unless
     *  it caught a re-seat), and whether the paper was already under strain. */
    baseTip: number;
    strained: boolean;
    /** px of travel for the whole rip, from the viewport at the press. */
    span: number;
    dragging: boolean;
    samples: Array<[number, number]>;
  } | null>(null);
  const pullHintTarget = useMotionValue(0);
  // Whether this cover can be pulled right now (written after each commit).
  const pullableRef = useRef(false);

  const handlePhotoPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' && pullableRef.current) pullHintTarget.set(1);
    if (!interactiveHover || event.pointerType === 'touch') return;
    photoBoundsRef.current = event.currentTarget.getBoundingClientRect();
  };

  const handlePhotoPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    // A hand pulling the face is not a hover: the parallax holds still under
    // it, and nothing is measured per move. (`movePull` is declared with the
    // tear it drives; this only runs on an event, long after render.)
    if (pullRef.current) {
      movePull(event);
      return;
    }
    // A cover that became pullable under a resting pointer lights its hint on
    // the pointer's next move.
    if (event.pointerType !== 'touch' && pullableRef.current && pullHintTarget.get() !== 1) {
      pullHintTarget.set(1);
    }
    if (!interactiveHover || event.pointerType === 'touch') return;
    // Nor is any other pressed hand (a drag across the cover, a selection):
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
    if (!pullRef.current) pullHintTarget.set(0);
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
  useEffect(() => {
    if (chapterProgress) return;
    const target = isActive ? resolvedChapterIndex : resolvedChapterIndex + 1;
    if (reduce) {
      fallbackChapterProgress.set(target);
      return;
    }
    const controls = animate(fallbackChapterProgress, target, {
      duration: 0.72,
      ease: EASE.arrive,
    });
    return () => controls.stop();
  }, [chapterProgress, fallbackChapterProgress, isActive, reduce, resolvedChapterIndex]);

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
  // A torn ticket's lede answers the pointer (see the torn note below) only
  // while it is there to be seen: gone, it must not leave a hit area over the
  // map.
  const fieldNoteHit = useTransform(fieldNoteOpacity, (opacity) => (opacity > 0.05 ? 'auto' : 'none'));
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
  // ── The tear (see "The tear" above the component) ─────────────────────
  // `chapterDelta` is positive once the reader has gone past this chapter.
  // The whole score is read off ONE clock (0 whole → 1 gone, src/lib/
  // ticketTear.ts), so the rip, the hinge, the snap and both hands can never
  // disagree about where the tear is, and going back is the same clock run in
  // reverse.
  const ticket = variant === 'cover' && Boolean(desktopMotion);
  // ── The dock (src/lib/coverDock.ts) ──
  // A ticket is not printed in its section: it rides on the atlas, beside its
  // place's shield, at the corner the plan gives it (on a phone it is dealt
  // at the foot of the screen instead, `phone`). The section keeps the
  // chapter's rail (the name, the lede). The atlas publishes, every camera
  // frame, where each place stands and the place whose cover shows; the
  // cover is written there, and shows only while its place is in hand and
  // the camera is down at it — it appears when the camera settles (no
  // slide), rides with its shield wherever the reader takes the map, and
  // fades out (easing in) when the place is let go.
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
  // covers it): both clocks to the start, nothing torn.
  const reseatRef = useRef<() => void>(() => {});
  // Whether the cover is on the atlas now: the latch counts it seen only
  // while it is.
  const dockShownRef = useRef(false);
  // Called once when the cover next appears (the sign's flap waits for it).
  const dockAppearRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!dockReady) return;
    const dock = dockRef.current;
    if (!dock) return;
    let shown = false;
    let hiddenAt = Number.NEGATIVE_INFINITY;
    let reseatTimer = 0;
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    const off = coverDock.subscribe((frame) => {
      const at = frame.at === collection._id;
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
          hiddenAt = performance.now();
          // Gone: once its fade is done, the ticket is put back whole for
          // the next visit (a torn face, a stub torn off for the story).
          reseatTimer = window.setTimeout(() => reseatRef.current(), DOCK_FADE_MS + 60);
        }
      }
      // The phone's card is dealt at the foot of the screen: nothing to place.
      if (phone) return;
      // Hidden, its fade long done: nothing to place until it shows again.
      if (!at && performance.now() - hiddenAt > DOCK_FADE_MS + 120) return;
      const point = frame.points[collection._id];
      if (!point || (point.x === lastX && point.y === lastY)) return;
      lastX = point.x;
      lastY = point.y;
      dock.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
    });
    return () => {
      off();
      window.clearTimeout(reseatTimer);
      dockShownRef.current = false;
    };
  }, [collection._id, dockReady, phone]);
  const [torn, setTorn] = useState(false);
  const tornRef = useRef(false);
  // The torn state to SHOW rather than play (a jump, or the first read). Keyed
  // to the state it belongs to: the render that is still on the old state
  // must not spend it.
  const tearSnapRef = useRef<boolean | null>(null);
  // 'drag' while a hand holds the ticket (nothing else tears it under the
  // hand), 'away' once it has been torn and the page is going on.
  const pullHoldRef = useRef<'none' | 'drag' | 'away'>('none');
  const pullTimersRef = useRef({ go: 0 });
  const tearClock = useMotionValue(0);
  // The stub's own clock (the admission tear), 0 whole → 1 gone.
  const stubClock = useMotionValue(0);
  const [stubTorn, setStubTorn] = useState(false);
  const stubTornRef = useRef(false);
  const stubPlayRef = useRef<{ stop: () => void } | null>(null);
  // A hand pulling the face adds its give to the dip (see PULL_FOLLOW); 0
  // otherwise.
  const pullFollow = useMotionValue(0);
  // How the clock is being played, which picks the tip the pose follows:
  // 'paper' is the paper's own stick-slip (a tear asked for); 'hand' (a
  // pull, and a pull's tear until the face is free) follows the hand's
  // smooth tip; 'reduced' is the fade.
  const tearModeRef = useRef<'paper' | 'hand' | 'reduced'>('paper');
  // Who tore it: asked for (the paper's own pace) or a hand.
  const tearOriginRef = useRef<'paper' | 'hand'>('paper');
  // The clock's animation and where it is heading (1 tearing, 0 re-seating).
  // The scroll's tears and re-seats are started on the scroll's own frame, by
  // the latch, and the clock effect then leaves them running.
  const tearPlayRef = useRef<{ stop: () => void; target: 0 | 1 } | null>(null);
  const stopTear = () => {
    tearPlayRef.current?.stop();
    tearPlayRef.current = null;
  };
  // Plays the tear forward from where the clock is. Linear on purpose: the
  // score's own curves live in the pose. A pull's tear goes on at the hand's
  // own tip; one asked for at the paper's stick-slip. Only refs and the clock
  // are read, so any render's copy is the same function.
  const playTear = () => {
    tearPlayRef.current?.stop();
    const hand = tearOriginRef.current === 'hand';
    tearModeRef.current = hand ? 'hand' : 'paper';
    const at = tearClock.get();
    const atMs = at * TEAR_MS;
    const ripS = Math.max(0, TEAR_FREE_MS - atMs) / 1000;
    const restS = ((TEAR_MS - Math.max(atMs, TEAR_FREE_MS)) / 1000);
    const controls = ripS > 0
      ? animate(tearClock, [at, TEAR_FREE_MS / TEAR_MS, 1], {
          duration: ripS + restS,
          times: [0, ripS / (ripS + restS), 1],
          ease: 'linear',
        })
      : animate(tearClock, 1, { duration: restS, ease: 'linear' });
    tearPlayRef.current = { stop: () => controls.stop(), target: 1 };
  };
  // The score's frame (the face box and the viewport width) and a redraw of
  // the pose — both kept by the effects below, measured per layout only.
  const tearFrameRef = useRef<TearFrame>({ w: 0, h: 0, vw: 0 });
  // The stub's box, for its own tear (the score turned round).
  const stubFrameRef = useRef<TearFrame>({ w: 0, h: 0, vw: 0 });
  const redrawTearRef = useRef<(() => void) | null>(null);

  // The score's frame and the torn edge, measured once per layout (the
  // face's box, the stub's, the viewport's width), never per frame.
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

  // The clock, for what was not started on the spot: a snap shown as it
  // is, reduced motion's fade. A tear taken up mid-way carries on from where
  // the clock is, for the time that is left.
  useEffect(() => {
    if (!ticket) return;
    const target = torn ? 1 : 0;
    if (tearSnapRef.current === torn) {
      tearSnapRef.current = null;
      stopTear();
      tearClock.set(target);
      return;
    }
    // Already on its way there: started by the latch on the scroll's frame.
    if (!reduce && tearPlayRef.current?.target === target) return;
    const from = tearClock.get();
    if (from === target) return;
    if (reduce) {
      stopTear();
      tearModeRef.current = 'reduced';
      const controls = animate(tearClock, target, { duration: REDUCED_TEAR_S * Math.abs(target - from), ease: 'linear' });
      tearPlayRef.current = { stop: () => controls.stop(), target };
    } else if (torn) {
      playTear();
    } else {
      stopTear();
      tearClock.set(0);
    }
  }, [reduce, tearClock, ticket, torn]);
  useEffect(() => () => {
    tearPlayRef.current?.stop();
    stubPlayRef.current?.stop();
  }, []);

  // ── Pull to tear (see PULL_CLICK_SLOP) ─────────────────────────────────
  // The hand drives the same clock the scroll's tear plays, so the pose
  // follows it with nothing new to keep in step. No React state while the
  // hand moves: the clock is a MotionValue, the cursor an attribute.
  const pullable = ticket && isActive && !reduce && canHover && !torn && Boolean(onTearAway);
  const plateRef = useRef<HTMLDivElement>(null);
  const onTearAwayRef = useRef(onTearAway);
  useEffect(() => {
    onTearAwayRef.current = onTearAway;
  }, [onTearAway]);
  useEffect(() => {
    pullableRef.current = pullable;
    if (!pullable && !pullRef.current) pullHintTarget.set(0);
  }, [pullHintTarget, pullable]);
  useEffect(() => () => {
    window.clearTimeout(pullTimersRef.current.go);
    if (pullRef.current) document.removeEventListener('selectstart', preventPullSelection, true);
  }, []);

  // ── The pose, written (src/lib/ticketTear.ts, `tearPose`) ──────────────
  // One writer. Whenever the clock (or the hand's give) changes, the score's
  // pose is computed once and written as custom properties and a few inline
  // styles on the elements it moves (global.css, "The tear") — never through
  // framer, so nothing fights it — and only what changed is written. No
  // layout is read. At rest everything is cleared, so the server render and
  // the client agree.
  useEffect(() => {
    if (!ticket) return;
    const plate = plateRef.current;
    if (!plate) return;
    const pick = (selector: string) => plate.querySelector<HTMLElement>(selector);
    const face = pick('.archive-plate__face');
    const tearBox = pick('.archive-plate__tear');
    const stubSeat = pick('.archive-ticket-stub-seat');
    const lift = pick('.archive-plate__lift');
    const frame = pick('.archive-photo-frame');
    const stub = pick('.archive-ticket-stub');
    const pad = pick('.archive-ticket-pad');
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
    // The admission: the stub pulled off by the right hand, the face kept in
    // the left (the score turned round, `mirrorAffine`, as /about's ticket
    // tears): its seam is its left edge, it hinges about the rip's tip there,
    // its top-right corner drops first and it is laid aside up and to the
    // right. The face gives a hair about its grip and never dims.
    const drawStub = (stubAt: number) => {
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
    const draw = () => {
      const clock = tearClock.get();
      const follow = pullFollow.get();
      const stubAt = stubClock.get();
      if (clock <= 0 && follow === 0 && stubAt <= 0) {
        clear();
        return;
      }
      if (stubAt > 0 && clock <= 0 && follow === 0) {
        drawStub(stubAt);
        return;
      }
      const box = tearFrameRef.current;
      const pose = tearPose(clock * TEAR_MS, box, {
        smooth: tearModeRef.current !== 'paper',
        reduced: Boolean(reduce),
      });
      // The hand's give is added to the dip.
      const m = [...pose.m] as typeof pose.m;
      m[5] += follow;
      // Promoted only while it moves: six idle faces on their own layers
      // would hold six photographs in memory for nothing.
      const moving = clock > 0 && clock < 1;
      put(face, '--tear-tf', affineCss(m));
      put(face, '--tear-op', pose.op >= 1 ? null : pose.op.toFixed(3));
      put(face, 'will-change', moving ? 'transform, opacity' : null);
      // Below the tip the face is still joined: nothing of it may swing into
      // the stub (see the JSX).
      put(tearBox, 'clip-path', pose.seam ? SEAM_CLIP : null);
      // Off the map: the shadow, rasterised once, follows the face down and
      // out by the lift.
      const shadow = [...m] as typeof m;
      shadow[5] += 2 + 7 * pose.lift;
      put(lift, 'transform', pose.lift > 0 ? affineCss(shadow) : null);
      put(lift, 'opacity', pose.lift > 0 ? (0.75 * Math.min(1, pose.lift) * pose.op).toFixed(3) : null);
      put(lift, 'will-change', moving && pose.lift > 0 ? 'transform, opacity' : null);
      // The torn edge runs down the seam with the tip, on both halves, and the
      // fibres with it; the strain holds on the seam below the tip.
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
      // The right hand: the stub gives about its grip, recoils at the snap,
      // and goes quiet as the record.
      put(stub, '--tear-stf', pose.stubDeg !== 0 || pose.stubY !== 0
        ? `translateY(${pose.stubY.toFixed(2)}px) rotate(${pose.stubDeg.toFixed(3)}deg)`
        : null);
      put(stub, '--tear-sop', pose.stubOp >= 1 ? null : pose.stubOp.toFixed(3));
      put(pad, '--tear-pop', pose.padOp >= 1 ? null : pose.padOp.toFixed(3));
    };
    redrawTearRef.current = draw;
    const offClock = tearClock.on('change', draw);
    const offFollow = pullFollow.on('change', draw);
    const offStub = stubClock.on('change', draw);
    draw();
    return () => {
      redrawTearRef.current = null;
      offClock();
      offFollow();
      offStub();
      clear();
    };
    // `dockReady`: a docked plate is on the page only once the dock is.
  }, [dockReady, pullFollow, reduce, stubClock, tearClock, ticket]);
  // The hint: the top-left corner — where the left hand will take it — comes
  // up off the map a hair, sprung so it answers the hand's arrival rather
  // than switching on. It is drawn, not moved (global.css, `--pull-hint`): the
  // face is never transformed by it, so its box, and the rect a story grows
  // from, stay exactly where the ticket lies, and nothing is swung into the
  // stub.
  // Sprung like the cover's own engagement (the house's answer spring,
  // SPRING.answer), so the corner and the cover's hover lift answer together.
  const pullHint = useSpring(pullHintTarget, SPRING.answer);
  // Every press on the cover, pull or no pull: where it went down and whether
  // it has since travelled PULL_CLICK_SLOP. A press that travelled is a drag —
  // a pull, a hand on the photograph under reduced motion, a text selection —
  // and the click the browser fires at its release is not a request for the
  // story, in either motion mode. Mouse and pen only: a finger that travels
  // is a scroll, and the browser has already cancelled its click.
  const pressRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  // When a travelled press was let go on the cover (see DRAG_CLICK_WINDOW_MS).
  const dragReleaseRef = useRef(0);
  // The ticket gives a hair under a still press (a click), and settles back
  // the moment the press travels PULL_CLICK_SLOP (a pull, a drag, a
  // selection) — whileTap held it pressed through the whole drag and sprang
  // back past its seat on release.
  const pressGive = usePressGive(!reduce, { slop: PULL_CLICK_SLOP });

  const tearAway = (clock: number) => {
    const section = chapterRef.current as HTMLElement | null;
    const now = performance.now();
    // Dated as if the scroll had committed it at rate 1: the score is at
    // `clock` this long after its commit. RouteAtlas and the closing gate on
    // this stamp.
    const tornAt = now - clock * TEAR_MS;
    pullHintTarget.set(0);
    pullHoldRef.current = 'away';
    tornRef.current = true;
    tearSnapRef.current = null;
    tearOriginRef.current = 'hand';
    if (section) section.dataset.ticketTornAt = String(Math.round(tornAt));
    // The clock effect carries the clock on from where the hand let go, on the
    // score's own time and still on the hand's smooth tip (no catches appear
    // on release): free, the snap, laid aside.
    setTorn(true);
    const timers = pullTimersRef.current;
    window.clearTimeout(timers.go);
    // Only once the face is free does the page go on (撕开后才能前往下一个地方).
    timers.go = window.setTimeout(() => {
      timers.go = 0;
      onTearAwayRef.current?.();
    }, Math.max(0, tornAt + PULL_GO_AFTER_MS - now));
  };

  // ── The tear, asked for ──
  // Every gesture that lets this ticket go (a shield, Prev / Next, the list,
  // the empty map, Escape, the stub's "Next stop"): the explorer sends
  // `archive:tear-then` to this section, and the ticket tears exactly as a
  // hand tears it — the paper's own stick-slip, the hinge, the snap, both
  // hands — and only once the face is free does the page go on (`go`):
  // 撕开票根，然后前往下一站. Under reduced motion the face fades in place
  // (TEAR_REDUCED_MS) and the page goes on after it. False when there is
  // nothing to tear here (torn already, a hand on it, its cover not up, the
  // camera in the air): the caller simply goes.
  const tearThen = (go: () => void) => {
    const section = chapterRef.current as HTMLElement | null;
    if (!ticket || !section || !dockShownRef.current) return false;
    if (tornRef.current || stubTornRef.current || pullHoldRef.current !== 'none' || pullRef.current) return false;
    if (tearClock.get() > 0.001) return false;
    if (document.documentElement.dataset.atlasCamera === 'flying') return false;
    const now = performance.now();
    pullHintTarget.set(0);
    pullHoldRef.current = 'away';
    tornRef.current = true;
    tearSnapRef.current = null;
    tearOriginRef.current = 'paper';
    section.dataset.ticketTornAt = tearStamp(now, 0, 1);
    // Started here, so the stamp and the clock agree to the frame; the clock
    // effect finds it already on its way (reduced motion's fade is played by
    // the clock effect).
    if (!reduce) playTear();
    setTorn(true);
    const timers = pullTimersRef.current;
    window.clearTimeout(timers.go);
    timers.go = window.setTimeout(() => {
      timers.go = 0;
      go();
    }, reduce ? TEAR_REDUCED_MS : PULL_GO_AFTER_MS);
    return true;
  };
  // ── The admission: the stub, torn off to open the story ──
  // A click on the cover (or Enter on its rail) opens its story, and the
  // opening gesture is the tear: the stub comes off in the right hand while
  // the photograph lies still, and only once the stub is free does the story
  // grow out of the photograph (`go`). The half the reader keeps goes into
  // the story's rail (MagazineLayout, KeptStub) and back onto this ticket at
  // the close. Under reduced motion the stub fades in place.
  const tearStubThen = (go: () => void) => {
    if (!ticket || !dockShownRef.current) return false;
    if (tornRef.current || stubTornRef.current || pullHoldRef.current !== 'none' || pullRef.current) return false;
    if (document.documentElement.dataset.atlasCamera === 'flying') return false;
    pullHintTarget.set(0);
    stubTornRef.current = true;
    setStubTorn(true);
    stubPlayRef.current?.stop();
    const controls = animate(stubClock, [0, TEAR_FREE_MS / TEAR_MS, 1], {
      duration: (reduce ? TEAR_REDUCED_MS : TEAR_MS) / 1000,
      times: [0, reduce ? 0.5 : TEAR_FREE_MS / TEAR_MS, 1],
      ease: 'linear',
    });
    stubPlayRef.current = { stop: () => controls.stop() };
    const timers = pullTimersRef.current;
    window.clearTimeout(timers.go);
    timers.go = window.setTimeout(() => {
      timers.go = 0;
      go();
    }, reduce ? TEAR_REDUCED_MS : PULL_GO_AFTER_MS);
    return true;
  };
  const tearThenRef = useRef(tearThen);
  tearThenRef.current = tearThen;
  const tearStubThenRef = useRef(tearStubThen);
  tearStubThenRef.current = tearStubThen;
  reseatRef.current = () => {
    const section = chapterRef.current as HTMLElement | null;
    window.clearTimeout(pullTimersRef.current.go);
    pullTimersRef.current.go = 0;
    pullHoldRef.current = 'none';
    stopTear();
    stubPlayRef.current?.stop();
    stubPlayRef.current = null;
    stubClock.set(0);
    if (stubTornRef.current) {
      stubTornRef.current = false;
      setStubTorn(false);
    }
    if (section) delete section.dataset.ticketTornAt;
    if (tornRef.current || tearClock.get() > 0) {
      tornRef.current = false;
      tearSnapRef.current = false;
      tearClock.set(0);
      setTorn(false);
    }
  };
  useEffect(() => {
    if (!ticket) return;
    const section = chapterRef.current as HTMLElement | null;
    if (!section) return;
    const onTearThen = (event: Event) => {
      const detail = (event as CustomEvent<{ go: () => void; handled?: boolean }>).detail;
      if (detail && !detail.handled) detail.handled = tearThenRef.current(detail.go);
    };
    const onTearStub = (event: Event) => {
      const detail = (event as CustomEvent<{ go: () => void; handled?: boolean }>).detail;
      if (detail && !detail.handled) detail.handled = tearStubThenRef.current(detail.go);
    };
    const onReseat = () => reseatRef.current();
    section.addEventListener('archive:tear-then', onTearThen);
    section.addEventListener('archive:tear-stub', onTearStub);
    section.addEventListener('archive:reseat', onReseat);
    return () => {
      section.removeEventListener('archive:tear-then', onTearThen);
      section.removeEventListener('archive:tear-stub', onTearStub);
      section.removeEventListener('archive:reseat', onReseat);
    };
  }, [ticket]);

  // The stub's own "Next stop": live on the ticket being read, while it is
  // whole and the page can go on.
  const nextReady = ticket && isActive && !torn && Boolean(onTearAway);
  const goNext = () => {
    if (!nextReady) return;
    const go = () => onTearAwayRef.current?.();
    if (!tearThen(go)) go();
  };

  // ── The sign turns into place ──
  // 下一站同样产生位置字母跳转功能: the stub's shield and name run a departure
  // board's flap (src/lib/routeShield.ts, FLAP) on a landing, from the place
  // the camera left. RouteAtlas tells the page at take-off (`atlas:depart`)
  // and at touchdown (`atlas:arrive`), with the place left as `from` (none
  // from the open map, none on the entry):
  //  - At take-off the board is SET to the stop being left (`primeFlap`), so
  //    the ticket the voyage carries in reads "MIAMI" until it turns — the
  //    name it lands with is never shown settled first and turned back (it
  //    was: ORLANDO settled on screen for ~350ms, then MIAMI, then ORLANDO).
  //    A take-off anywhere else puts this board back; so does a landing
  //    elsewhere, and FLAP_PRIME_MAX_MS with no landing at all.
  //  - It turns once the ticket has come to rest: when its cover appears at
  //    its shield (the dock's gate: the camera settled), never more than
  //    FLAP_DOCK_WAIT_MS after the landing.
  // Never on a first paint, a restore, a snap or the entry (whose ticket
  // comes up with nothing to turn from), and never under
  // reduced motion, where the sign is simply printed.
  const signRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ticket || reduce) return;
    const id = collection._id;
    type SignTrip = { id: string; from: Partial<Record<string, string>> | null };
    let stopFlap: (() => void) | null = null;
    let clearPrime: (() => void) | null = null;
    let primeTimer = 0;
    let waitTimer = 0;
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
      unprime();
    };
    const onDepart = (event: Event) => {
      const detail = (event as CustomEvent<SignTrip>).detail;
      reset();
      const root = signRef.current;
      if (!detail || detail.id !== id || !detail.from || !root) return;
      clearPrime = primeFlap(root, detail.from);
      primeTimer = window.setTimeout(unprime, FLAP_PRIME_MAX_MS);
    };
    const onArrive = (event: Event) => {
      const detail = (event as CustomEvent<SignTrip>).detail;
      if (!detail) return;
      if (detail.id !== id) {
        if (clearPrime) unprime();
        return;
      }
      const root = signRef.current;
      const from = detail.from;
      if (!from || !root) {
        reset();
        return;
      }
      cancelWait();
      window.clearTimeout(primeTimer);
      primeTimer = 0;
      const start = () => {
        cancelWait();
        stopFlap?.();
        // runFlap takes the primed board over where it stands.
        clearPrime = null;
        stopFlap = runFlap(root, from);
      };
      // The ticket is seen only once its cover appears (at its shield, or
      // dealt on the phone) — when the camera has settled — and it turns
      // from there: the name it carried in shows for FLAP.delay, then the
      // board runs.
      if (dockShownRef.current) start();
      else {
        dockAppearRef.current = start;
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

  const handlePullStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pullable || pullRef.current) return;
    if (event.button !== 0 || !event.isPrimary || event.pointerType === 'touch') return;
    if (tornRef.current || pullHoldRef.current !== 'none') return;
    // A face still on its way back into its seat is not there to hold.
    if (tearClock.get() > PULL_FREE_CLOCK) return;
    // The camera in the air is the atlas already on its way somewhere.
    if (document.documentElement.dataset.atlasCamera === 'flying') return;
    const frame = event.currentTarget;
    // Paper in the hand: no text selection while it is held (the image's own
    // drag is already off). Not preventDefault on the press: the press still
    // focuses the cover the way a click does, so the voyage's focus hand-off
    // to the next chapter stays a pointer focus — no lime ring lands there.
    document.addEventListener('selectstart', preventPullSelection, true);
    try {
      frame.setPointerCapture(event.pointerId);
    } catch {
      // Capture only keeps the moves coming off the photograph.
    }
    // The press does not own the ticket yet: a still press is a click. The
    // hand takes the paper once it has travelled PULL_CLICK_SLOP
    // (`movePull`).
    pullRef.current = {
      id: event.pointerId,
      frame,
      x: event.clientX,
      y: event.clientY,
      baseTip: 0,
      strained: false,
      span: Math.max(PULL_SPAN_MIN, Math.min(PULL_SPAN_MAX, window.innerHeight * PULL_SPAN_VH)),
      dragging: false,
      samples: [[event.timeStamp, event.clientY]],
    };
    plateRef.current?.setAttribute('data-pull', '');
  };

  // The press has travelled: the hand takes the ticket from here — unless
  // it was torn (or the atlas took off) under the still press, in which case
  // there is nothing left to hold and the press lets go.
  const takePull = (pull: NonNullable<typeof pullRef.current>) => {
    if (tornRef.current || stubTornRef.current || pullHoldRef.current !== 'none' || tearClock.get() > PULL_FREE_CLOCK
      || document.documentElement.dataset.atlasCamera === 'flying') {
      pullRef.current = null;
      plateRef.current?.removeAttribute('data-pull');
      document.removeEventListener('selectstart', preventPullSelection, true);
      try {
        if (pull.frame.hasPointerCapture(pull.id)) pull.frame.releasePointerCapture(pull.id);
      } catch {
        // Already released.
      }
      return false;
    }
    stopTear();
    tearClock.stop();
    pullFollow.stop();
    pullHoldRef.current = 'drag';
    tearModeRef.current = 'hand';
    const caught = Math.max(0, Math.min(PULL_FREE_CLOCK, tearClock.get()));
    pull.baseTip = caught > 0 ? handTipAt(caught * TEAR_MS) : 0;
    pull.strained = caught > 0;
    return true;
  };

  const movePull = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pull = pullRef.current;
    if (!pull || event.pointerId !== pull.id) return;
    const dy = event.clientY - pull.y;
    if (!pull.dragging) {
      if (Math.hypot(event.clientX - pull.x, dy) < PULL_CLICK_SLOP) return;
      if (!takePull(pull)) return;
      pull.dragging = true;
    }
    const at = event.timeStamp;
    pull.samples.push([at, event.clientY]);
    while (pull.samples.length > 2 && at - pull.samples[0][0] > PULL_FLICK_WINDOW_MS) pull.samples.shift();
    // Down only: the face is pulled, never pushed past its seat. The first
    // PULL_CLICK_SLOP of the hand takes the strain; from there the rip's tip
    // is the hand's share of the span, one to one.
    const travel = Math.max(0, dy);
    if (travel >= PULL_CLICK_SLOP) pull.strained = true;
    tearClock.set(pull.strained
      ? clockAtTip(pull.baseTip + travel / pull.span)
      : (TEAR_TENSION_MS * travel) / (PULL_CLICK_SLOP * TEAR_MS));
    pullFollow.set(Math.min(PULL_FOLLOW_MAX, travel * PULL_FOLLOW));
  };

  const endPull = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const pull = pullRef.current;
    if (!pull || event.pointerId !== pull.id) return;
    pullRef.current = null;
    plateRef.current?.removeAttribute('data-pull');
    document.removeEventListener('selectstart', preventPullSelection, true);
    try {
      if (pull.frame.hasPointerCapture(pull.id)) pull.frame.releasePointerCapture(pull.id);
    } catch {
      // Already released.
    }
    // A dragged release's click is swallowed by the cover (see `pressRef`).
    if (pull.dragging) {
      const clock = tearClock.get();
      let speed = 0;
      if (!cancelled) {
        const at = event.timeStamp;
        const recent = pull.samples.filter(([time]) => at - time <= PULL_FLICK_WINDOW_MS);
        if (recent.length > 0 && at > recent[0][0]) speed = (event.clientY - recent[0][1]) / (at - recent[0][0]);
      }
      if (!cancelled && (clock >= PULL_COMMIT_CLOCK || (clock >= PULL_FLICK_MIN_CLOCK && speed >= PULL_FLICK_SPEED))) {
        // The hand's give goes with it; the score carries the face from here.
        animate(pullFollow, 0, { duration: PULL_RESEAT_S, ease: PULL_RESEAT_EASE });
        tearAway(clock);
        return;
      }
    }
    // Let go early, or only a click: the paper springs back to its seat.
    if (pullFollow.get() !== 0) animate(pullFollow, 0, { duration: PULL_RESEAT_S, ease: PULL_RESEAT_EASE });
    // A press that never travelled never took the paper (see `takePull`).
    if (!pull.dragging) return;
    pullHoldRef.current = 'none';
    if (tornRef.current || tearClock.get() <= 0) return;
    animate(tearClock, 0, { duration: PULL_RESEAT_S, ease: PULL_RESEAT_EASE });
  };

  // Cover text planes counter-parallax against the photo — the masthead lifts,
  // the kicker sinks as the card passes, so name/kicker/photo read as depth.
  const mastheadY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '-16%']);
  const kickerY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '22%']);
  const titleInteractionX = useTransform(
    [editorialShift, titlePointerX, titleOpenX],
    ([timeline, pointer, open]) => Number(timeline) + Number(pointer) + Number(open),
  );

  // Keyword-ignite (the feature title's last word lights to lime on scroll-in) stays.
  const igniteColor = useTransform(scrollYProgress, [0.3, 0.52], ['rgba(244,244,237,1)', 'rgb(210,255,0)']);
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
      onPointerDown={handlePullStart}
      onPointerUp={(event) => endPull(event, false)}
      onPointerCancel={(event) => endPull(event, true)}
      onLostPointerCapture={(event) => endPull(event, true)}
      style={plateRatio ? { aspectRatio: String(plateRatio) } : undefined}
      className={`archive-photo-frame relative ${plateRatio ? '' : aspectClass} overflow-hidden`}
    >
      <div className="absolute inset-0">
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
    pullHintTarget.set(0);
    onClick();
  };
  // Capture phase, so every press is seen before the photograph's own pull
  // handlers — and whether or not they run.
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
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= PULL_CLICK_SLOP) press.moved = true;
    },
    onPointerUpCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      const press = pressRef.current;
      if (!press || event.pointerId !== press.id) return;
      pressRef.current = null;
      // The release point counts too: a hand that went off the cover (where
      // its moves are not seen here) and came back has still travelled.
      if (press.moved || Math.hypot(event.clientX - press.x, event.clientY - press.y) >= PULL_CLICK_SLOP) {
        dragReleaseRef.current = performance.now();
      }
    },
    onClick: () => {
      // The click a travelled release fires is the end of a drag, not a
      // request for the story (see PULL_CLICK_SLOP). Enter and Space open it
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
                  ? { color: reduce ? 'rgb(210,255,0)' : igniteColor }
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
        className={`archive-plate relative archive-plate--ticket${torn ? ' is-torn' : ''}${stubTorn ? ' is-stub-torn' : ''}${pullable ? ' archive-plate--pullable' : ''}`}
        style={{
          ...stockStyle(collection.slug),
          ...(phone && card
            ? { width: card.photoW + TICKET_STUB }
            : dockEntry ? { width: dockEntry.photoW + TICKET_STUB } : null),
        }}
      >
        {/* The stage sits in the tear: the hinge needs its own pivot (the
            tip of the rip). The outer box never moves; while the rip runs it
            clips at the seam, because below the tip a hinge about the tip
            carries the face a few pixels INTO the stub. Under the face lies
            its shadow off the map (`__lift`); the face itself is moved only
            by the tear's writer (`--tear-tf`). */}
        <div className="archive-plate__tear">
          <i className="archive-plate__lift" aria-hidden="true" />
          <motion.div
            className="archive-plate__face"
            style={{ ['--pull-hint' as never]: pullHint }}
          >
            {plateStage}
          </motion.div>
        </div>

        {/* The stub is the place's sign (owner, 2026-09-28: 将右侧的大号
            封面和路牌上方的州名缩写+地名和第几站结合在一起): the route
            shield the map signs this place with — its state's two letters,
            its stop number — beside "Stop / 06", and the place's name set
            big inside a guide sign's enamel rule, on the chapter's own card.
            On the landing the shield and the name turn into place like a
            departure board (`atlas:arrive`). Below the sign, the admission
            rows; at the foot, the way on: "Next stop", which tears this
            ticket exactly as a hand tears it and then goes on. The seat
            is the stub's own box: while the stub is torn off (opening the
            story) it clips at the seam, so nothing of the stub swings into
            the photograph below the rip's tip. */}
        <div className="archive-ticket-stub-seat">
        <aside
          className="archive-ticket-stub font-ui"
          aria-hidden="true"
          style={torn ? { pointerEvents: 'auto' } : undefined}
        >
          {/* The stub's half of the torn seam. */}
          <i className="archive-ticket-fibre" aria-hidden="true" />
          <i className="archive-ticket-strain" aria-hidden="true" />
          <div ref={signRef} className="archive-ticket-sign">
            <div className="archive-ticket-sign__head">
              <RouteShield
                className="archive-ticket-sign__shield"
                code={stateCode(collection.region)}
                accent={stockPaper(collection.slug)}
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
          {/* Torn, the face is gone and the place where it lay is map, not
              a button: the cover's own box stops answering the pointer (the
              stub re-enables it). */}
          <motion.div
            {...coverPointer}
            aria-hidden="true"
            style={torn ? { scale: pressGive.scale, pointerEvents: 'none' } : { scale: pressGive.scale }}
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
          <motion.div
            style={{
              opacity: reduce ? 1 : editorialOpacity,
              x: reduce ? 0 : titleInteractionX,
            }}
            className="archive-plate__meta pointer-events-none flex items-center justify-between gap-4 font-ui text-[9px] uppercase tracking-[0.1em]"
          >
            <span className="text-white/84">Chapter {String(index + 1).padStart(2, '0')}</span>
            <span className="text-right text-white/84">
              {dateline}{collection.year ? ` · ${collection.year}` : ''}
            </span>
          </motion.div>
          <motion.div
            style={{
              x: reduce ? 0 : titleInteractionX,
              opacity: reduce ? 1 : editorialOpacity,
            }}
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
            style={reduce ? undefined : { opacity: fieldNoteOpacity, y: fieldNoteShift }}
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
            style={{
              opacity: reduce ? 1 : editorialOpacity,
              x: reduce ? 0 : titleInteractionX,
            }}
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
            style={{
              y: reduce ? 0 : kickerY,
              opacity: reduce ? 1 : editorialOpacity,
              x: reduce ? 0 : titleInteractionX,
            }}
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
              y: reduce ? 0 : mastheadY,
              x: reduce ? 0 : titleInteractionX,
              opacity: reduce ? 1 : editorialOpacity,
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
          style={reduce ? undefined : { opacity: fieldNoteOpacity, y: fieldNoteShift }}
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
          style={reduce ? undefined : { opacity: fieldNoteOpacity, y: fieldNoteShift }}
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
