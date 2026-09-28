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
import {
  LATCH_WHOLE,
  TEAR_LINE_DOCKED,
  TEAR_LINE_MAX,
  TEAR_PUSH_PX,
  TEAR_REST_MS,
  TEAR_SEEN_MS,
  accrueSeen,
  addPushSample,
  deriveCornerLine,
  deriveTearLine,
  plateShare,
  pushState,
  pushedAfter,
  readLandedAt,
  reseatsAtRest,
  stepLatch,
  type LatchState,
  type PushSample,
  type TearGate,
} from '../../lib/ticketLatch';
import {
  TEAR_BEFORE_FLIGHT_MS,
  TEAR_FREE_MS,
  TEAR_MS,
  TEAR_REDUCED_MS,
  TEAR_TENSION_MS,
  affineCss,
  handTipAt,
  msAtTip,
  tearPose,
  tearRate,
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
// reader's push is the left hand (src/lib/ticketTear.ts, the score). The
// paper takes the strain, gives at the top notch, and the rip runs down the
// perforation hole by hole, catching on each bridge, while the face HINGES
// open about the running tip — its top-left corner drops first and the map
// opens in a V between face and stub, torn fibres on both edges. The last
// bridge snaps, the stub recoils, and the face is laid aside up and to the
// left. It never falls (我喜欢是有撕掉的感觉，而不是像掉下去一样). Only once the
// face is free does the atlas fly on to the next place (撕开后才能前往下一个地方).
//
// It tears only after it has been SEEN: whole on screen with the map landed,
// and then only on the reader's own push — never at rest, never inside the
// glide that brought it in (有点太早了, 有时候没看见就撕下去了), nor in the crawl
// of one that ran long past it — and always by TEAR_HARD_LINE, a hair before
// the atlas commits (src/lib/ticketLatch.ts, "The gate").
//
// It tears once, on a commit, never scrubbed. The latch (src/lib/ticketLatch.ts)
// stamps the section (`data-ticket-torn-at`) with the moment the score would
// have started at rate 1 to free the face when it actually will — back-dated
// for a harder push, re-stamped if the push grows — so RouteAtlas, which
// commits to the next place later, at 32% (HOP.forward), takes off
// TEAR_BEFORE_FLIGHT_MS (590: free plus a beat) after the stamp, a beat after
// the face is free at any rate.
//
// Coming back puts the face back, and never later than the map comes back:
// a torn ticket re-seats where the atlas turns for home (22%, 1 − HOP.back),
// so the face rises on the frame the camera sets off back to its place — or,
// when the reader never went that far, once they have stepped back
// TEAR_HYSTERESIS from the furthest point they reached (the fling guard: a
// small reversal never re-seats it). Chapter 0, whose delta cannot go below
// 0, always re-seats by its centre. And at rest (TEAR_REST_MS) the face comes
// back to a reader who stopped below the tear line, or who turned round
// before the atlas left and stopped short of its home line: they stopped on
// the chapter, not past it. A reader who only pauses on the way on keeps the
// ticket torn, so a notched wheel never tears it twice.
//
// The line is each cover's own. The owner's beat is the top-left corner going
// down, so the tear has to start while this photograph's TOP edge is well on
// screen, and where that edge is at a given point on the timeline depends on
// the photograph's height. So the line is DERIVED from the layout the
// homepage timeline is built from (HomePage: archiveChapterAnchorY —
// untransformed offsets, the photograph's centre on the reading line): the
// point on the timeline where this plate's top edge reaches TEAR_TOP_VH (a
// quarter) of the viewport, clamped. At 0.08 the tear started with the top
// edge 60–80px down and a reader at reading pace (~550px/s) had carried it
// off the top before the rip began: only the fall was ever seen, with half
// the face gone. At a quarter, a landscape cover tears just past its centre
// (on most screens the floor, TEAR_LINE_MIN: 25–35px of scroll) with its
// top 200–240px down. The line is only the floor: past it the gate decides.
// A portrait cover, whose top is only 70–120px down even centred, tears on
// its corner line (its top edge at 5% of the viewport) if the reader reads
// straight through. The plate's share on screen, the lines and the torn edge
// are all measured once per layout change, never per scroll frame.
// Mirrors HomePage's desktop reading line (and AtlasSign's ATLAS_READING_LINE,
// which lives in the atlas's lazy chunk): the line a chapter's photograph
// centre crosses at a whole chapter.
const ARCHIVE_READING_LINE = 0.48;
/** Untransformed document offset, as the homepage timeline measures it. */
function documentOffsetTop(node: HTMLElement | null) {
  let top = 0;
  let current: HTMLElement | null = node;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }
  return top;
}
// A jump in the timeline (a restored scroll, a re-measure) is nobody tearing
// anything: the ticket is simply shown as it is, the way a restarted atlas
// snaps instead of replaying a flight. A Lenis frame moves a few hundredths.
const TEAR_JUMP = 0.5;
// The score (src/lib/ticketTear.ts) runs on one clock, `tearClock`, 0 whole →
// 1 gone over TEAR_MS. RouteAtlas's TEAR_BEFORE_FLIGHT_MS and ArchiveClosing's
// TEAR_BEFORE_ENDING_MS (590) are TEAR_FREE_MS plus a beat — mirrored, not
// imported (both are lazy chunks): change them together
// (scripts/ticket-latch.test.mjs checks).
// Going back re-seats the face: the score run in reverse on the hand's own
// tip (no catches), the hinge closing from the bottom up as the fibres
// retract.
const RESEAT_S = 0.65;
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
// When the page may go on: the face free plus a beat, the gate RouteAtlas
// holds its flights to.
const PULL_GO_AFTER_MS = TEAR_BEFORE_FLIGHT_MS;
// A torn-away ticket holds its latch until the voyage has carried the reader
// past its line (where the scroll's own verdict agrees), or this long after
// the voyage was asked for — a voyage refused leaves the scroll to decide.
const PULL_HOLD_MS = 4000;
// The sign's flap ("The sign turns into place"): a board set to the stop
// being left at take-off is put back if no landing follows this soon (a
// flight lasts 850–1850ms), and the turn waits for a voyage still gliding
// this ticket in no longer than this after the landing.
const FLAP_PRIME_MAX_MS = 2500;
const FLAP_VOYAGE_WAIT_MS = 900;
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
  // A docked chapter's rail stands down the right of the page, under the
  // nav's pills: carried up past its reading line it ran under MAP / NOTES /
  // ABOUT and between them. It goes before it gets there — on this
  // chapter's own scroll, from where its top would stand 240px down the
  // screen to where it would reach 120px (the nav's band, 24–92px, and a
  // breath) — DERIVED from its rest (its centre on the reading line) and
  // the step to the next chapter, measured once per layout (the latch's
  // `measureGeometry`), never read off the screen per frame.
  const railNavRef = useRef<{ span: number; from: number; to: number } | null>(null);
  const railClear = (delta: number) => {
    const rail = railNavRef.current;
    if (!rail || delta <= 0) return 1;
    const past = delta * rail.span;
    return 1 - smootherstep(Math.max(0, Math.min(1, (past - rail.from) / Math.max(1, rail.to - rail.from))));
  };
  const editorialOpacity = useTransform(chapterDelta, (delta) => {
    if (reduce) return Math.round(delta) === 0 ? 1 : 0.72;
    const distance = smoothFocus(Math.abs(delta));
    return (1 - distance * (delta < 0 ? 0.3 : 0.52)) * railClear(delta);
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
    return (1 - distance * (delta < 0 ? 0.38 : 1)) * railClear(delta);
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
  // A desktop ticket is not printed in its section: it rides on the atlas,
  // beside its place's shield, at the corner the plan gives it. The section
  // keeps the chapter's rail (the name, the lede). The atlas publishes, every
  // camera frame, where each place stands and the place the camera has
  // landed on; the cover is written there, and shows only while the camera
  // is on its place — it appears when the camera settles (no slide), rides
  // with its shield wherever the map moves, and fades out (easing in) as the
  // camera leaves, riding away with its shield.
  const docked = ticket;
  const dockRef = useRef<HTMLDivElement>(null);
  const dockEntry = useSyncExternalStore(
    coverDock.subscribePlan,
    () => (docked ? coverDock.plan()?.[collection._id] ?? null : null),
    () => null,
  );
  const dockReady = Boolean(docked && dockHost && dockEntry);
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
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    const off = coverDock.subscribe((frame) => {
      const at = frame.at === collection._id;
      if (at !== shown) {
        shown = at;
        dockShownRef.current = at;
        if (at) {
          dock.setAttribute('data-at', '');
          const appeared = dockAppearRef.current;
          dockAppearRef.current = null;
          appeared?.();
        } else {
          dock.removeAttribute('data-at');
          hiddenAt = performance.now();
        }
      }
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
      dockShownRef.current = false;
    };
  }, [collection._id, dockReady]);
  const [torn, setTorn] = useState(false);
  const tornRef = useRef(false);
  // The torn state to SHOW rather than play (a jump, or the first read). Keyed
  // to the state it belongs to: the render that is still on the old state
  // must not spend it.
  const tearSnapRef = useRef<boolean | null>(null);
  // Who owns the ticket besides the scroll: 'drag' while a hand is on it (the
  // latch waits), 'away' once a pull has torn it and the voyage is taking the
  // reader on (the latch waits until the reader is past the line, where it
  // agrees). See PULL_HOLD_MS.
  const pullHoldRef = useRef<'none' | 'drag' | 'away'>('none');
  const pullTimersRef = useRef({ go: 0, hold: 0 });
  // The latch, re-asked with the current timeline — set by the latch effect.
  const latchNowRef = useRef<(() => void) | null>(null);
  const releasePullHold = () => {
    window.clearTimeout(pullTimersRef.current.hold);
    pullTimersRef.current.hold = 0;
    pullHoldRef.current = 'none';
  };
  const tearClock = useMotionValue(0);
  // A hand pulling the face adds its give to the dip (see PULL_FOLLOW); 0
  // otherwise.
  const pullFollow = useMotionValue(0);
  // How the clock is being played, which picks the tip the pose follows:
  // 'scroll' is the paper's own stick-slip; 'hand' (a pull, and a pull's tear
  // until the face is free) and 'reseat' follow the hand's smooth tip;
  // 'reduced' is the fade.
  const tearModeRef = useRef<'scroll' | 'hand' | 'reseat' | 'reduced'>('scroll');
  // Who tore it: the scroll (its rate follows the push) or a hand (rate 1).
  const tearOriginRef = useRef<'scroll' | 'hand'>('scroll');
  // A scroll's tear goes on to the next stop once its face is free (see
  // "A scroll's tear goes on"): the pending check, armed by the latch.
  const scrollGoTimerRef = useRef(0);
  const armScrollGoRef = useRef<() => void>(() => {});
  // The scroll tear's rate (ticketTear.ts, `tearRate`), fixed at the trigger
  // and only ever raised before the face is free.
  const tearRateRef = useRef(1);
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
  // own tip and pace; the scroll's at the paper's stick-slip and the push's
  // rate until the face is free, then at the score's own pace. Called again
  // (by the latch) when the push grows, it retimes what is left. Only refs
  // and the clock are read, so any render's copy is the same function.
  const playTear = () => {
    tearPlayRef.current?.stop();
    const hand = tearOriginRef.current === 'hand';
    tearModeRef.current = hand ? 'hand' : 'scroll';
    const at = tearClock.get();
    const atMs = at * TEAR_MS;
    const ripS = Math.max(0, TEAR_FREE_MS - atMs) / (hand ? 1 : tearRateRef.current) / 1000;
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
  // Puts the face back: the score in reverse on the hand's smooth tip.
  const reseatTear = () => {
    tearPlayRef.current?.stop();
    tearModeRef.current = 'reseat';
    const controls = animate(tearClock, 0, { duration: RESEAT_S * tearClock.get(), ease: 'linear' });
    tearPlayRef.current = { stop: () => controls.stop(), target: 0 };
  };
  // The score's frame (the face box and the viewport width) and a redraw of
  // the pose — both kept by the effects below, measured per layout only.
  const tearFrameRef = useRef<TearFrame>({ w: 0, h: 0, vw: 0 });
  const redrawTearRef = useRef<(() => void) | null>(null);

  // This cover's tear line on the timeline (src/lib/ticketLatch.ts). Read by
  // the latch on every change of the timeline; written only when the layout
  // moves.
  const tearLineRef = useRef(TEAR_LINE_MAX);
  useEffect(() => {
    if (!ticket) return;
    const section = chapterRef.current as HTMLElement | null;
    if (!section) return;
    let last = chapterDelta.get();
    // The last chapter has no next chapter — the archive's timeline stops at
    // its centre — so its own delta never reaches the line. Its next page is
    // the closing: ArchiveClosing sends it its delta on the way there
    // (`archive:onward`, 0 = centred, 1 = the closing arrived, from the same
    // offsets), and the same latch, line and hysteresis tear it.
    let onward = -1;
    const effective = (delta: number) => Math.max(delta, onward);
    // The latch's memory (src/lib/ticketLatch.ts): torn or not, the furthest
    // point reached since it tore, and any re-arm after a re-seat.
    let state: LatchState = LATCH_WHOLE;
    // Torn by hand (a pull) or put back at rest since the scroll last asked:
    // the scroll carries on from the ticket as it now is.
    const sync = () => {
      if (state.torn !== tornRef.current) state = tornRef.current ? { ...LATCH_WHOLE, torn: true } : LATCH_WHOLE;
    };
    // This plate on the timeline (see `measureGeometry`): the viewport, the
    // photograph's height, the px from its centre to the next anchor and from
    // the previous one (chapter 0 has none: its own span), and its corner line.
    const geometry = { vh: 0, h: 0, span: 0, prevSpan: 0, corner: TEAR_LINE_MAX };
    // The reader's hand ("The gate", src/lib/ticketLatch.ts): the last few
    // samples of the timeline in px, how long the plate has been seen whole
    // with the map landed, and how far the reader has pushed on since. All of
    // it is forgotten whenever the ticket is put back.
    let samples: PushSample[] = [];
    let seenMs = 0;
    let pushedPx = 0;
    let speed = 0;
    let prevT = -1;
    let prevPx = 0;
    let prevShare = 0;
    const forget = () => {
      samples = [];
      seenMs = 0;
      pushedPx = 0;
    };
    // One sample of the timeline at `delta`: the gate as it now stands. The
    // seen clock accrues over the time since the last sample, judged by where
    // the plate was at that sample, so a reader at rest (no samples) is
    // credited with the whole rest on their first move.
    const observe = (delta: number, now: number): TearGate => {
      const px = delta * (delta >= 0 ? geometry.span : geometry.prevSpan);
      addPushSample(samples, now, px);
      const push = pushState(samples, now);
      speed = push.vNow;
      if (prevT >= 0) {
        const landedAt = readLandedAt(document.documentElement.dataset.atlasLandedAt);
        seenMs = accrueSeen(seenMs, prevT, now, landedAt, prevShare, geometry.h, geometry.vh);
      }
      if (seenMs >= TEAR_SEEN_MS) pushedPx = pushedAfter(pushedPx, push, px - prevPx);
      // A docked cover is on screen whole exactly while the camera is on its
      // place (the dock says so); a cover in the column, by its geometry.
      const share = docked
        ? (dockShownRef.current ? 1 : 0)
        : plateShare(delta, geometry.vh, geometry.h, ARCHIVE_READING_LINE, geometry.span, geometry.prevSpan);
      // The cover has no entrance of its own — wherever it is on screen it is
      // whole — so on screen whole is seen (`accrueSeen`). Off screen, it has
      // to be seen again.
      if (share <= 0) {
        seenMs = 0;
        pushedPx = 0;
      }
      prevT = now;
      prevPx = px;
      prevShare = share;
      // The corner waits for the map to land: before that a push is still
      // the swipe that brought this plate in.
      const landed = readLandedAt(document.documentElement.dataset.atlasLandedAt) <= now;
      return {
        seen: seenMs >= TEAR_SEEN_MS && pushedPx >= TEAR_PUSH_PX,
        pushing: push.pushing,
        corner: landed ? geometry.corner : Number.POSITIVE_INFINITY,
      };
    };
    // What a layout change, the first read or a hand let go may go on: no
    // push, so past the line only TEAR_HARD_LINE shows a ticket torn. Reduced
    // motion has no gate — its timeline moves in whole chapters.
    const gated = (gate: TearGate) => (reduce ? undefined : gate);
    const still = (): TearGate => ({ seen: false, pushing: false, corner: geometry.corner });
    // A reader who pushes on harder mid-rip pulls harder: the rate only rises,
    // only before the face is free, and the stamp moves with it so the atlas
    // still waits for this face.
    const raiseRate = () => {
      const clockMs = tearClock.get() * TEAR_MS;
      if (tearPlayRef.current?.target !== 1 || tearOriginRef.current !== 'scroll' || clockMs >= TEAR_FREE_MS) return;
      const rate = tearRate(speed);
      if (rate < tearRateRef.current + 0.02) return;
      tearRateRef.current = rate;
      playTear();
      section.dataset.ticketTornAt = tearStamp(performance.now(), clockMs, rate);
    };
    const step = (delta: number, snap: boolean, gate: TearGate | undefined) => {
      // A hand on the ticket owns it: the scroll neither tears nor re-seats
      // it underneath. Torn by hand, it stays torn until the reader is past
      // its line — from there the scroll's own verdict is the same one.
      const hold = pullHoldRef.current;
      if (hold === 'drag') return;
      if (hold === 'away') {
        if (delta < tearLineRef.current) return;
        releasePullHold();
      }
      sync();
      const was = state.torn;
      // Stored on every step: the furthest point moves without a flip.
      state = stepLatch(state, delta, tearLineRef.current, gate);
      const next = state.torn;
      if (next === was) {
        if (next && !snap && gate) raiseRate();
        return;
      }
      tornRef.current = next;
      tearSnapRef.current = snap ? next : null;
      // The atlas reads this (see "The tear" above the component). Written
      // here, on the scroll's own frame, not after React renders the tear: a
      // quick scroll can reach the atlas's commit before this chapter has
      // re-rendered. A ticket shown torn without tearing (a jump) has nothing
      // to wait for.
      if (!next) {
        delete section.dataset.ticketTornAt;
        window.clearTimeout(scrollGoTimerRef.current);
        scrollGoTimerRef.current = 0;
        forget();
        if (!snap && !reduce) reseatTear();
      } else if (snap) {
        section.dataset.ticketTornAt = '0';
      } else {
        tearOriginRef.current = 'scroll';
        tearRateRef.current = gate ? tearRate(speed) : 1;
        section.dataset.ticketTornAt = tearStamp(performance.now(), tearClock.get() * TEAR_MS, tearRateRef.current);
        // Started here, on the scroll's frame, rather than a render later:
        // the stamp and the clock agree to the frame. (Reduced motion's fade
        // is played by the clock effect.) A push's tear then goes on to the
        // next stop once its face is free, as "Next stop" does.
        if (gate) {
          playTear();
          armScrollGoRef.current();
        }
      }
      setTorn(next);
    };
    // At rest a torn ticket the reader has come back to goes back
    // (TEAR_REST_MS, `reseatsAtRest`): they turned round before the atlas
    // left — mid-tear, or during the flight's hold — and stopped on the
    // chapter. It re-seats on its normal played score, and removing the stamp
    // tells the atlas.
    let restTimer = 0;
    const reseatAtRest = () => {
      restTimer = 0;
      if (pullHoldRef.current !== 'none') return;
      sync();
      if (!reseatsAtRest(state, effective(chapterDelta.get()), tearLineRef.current)) return;
      state = LATCH_WHOLE;
      tornRef.current = false;
      tearSnapRef.current = null;
      delete section.dataset.ticketTornAt;
      window.clearTimeout(scrollGoTimerRef.current);
      scrollGoTimerRef.current = 0;
      forget();
      if (!reduce) reseatTear();
      setTorn(false);
    };
    const latch = (delta: number, snap: boolean, gate: TearGate | undefined) => {
      step(delta, snap, gate);
      window.clearTimeout(restTimer);
      restTimer = tornRef.current && pullHoldRef.current === 'none'
        ? window.setTimeout(reseatAtRest, TEAR_REST_MS)
        : 0;
    };
    // The same untransformed geometry HomePage builds the timeline from: this
    // photograph's centre is on the reading line at delta 0 and the next one's
    // at delta 1, so where this plate's top edge sits at any delta — and how
    // much of it is on screen — follows from a few offsets and the viewport
    // height. No rect, no scroll read. The score's frame and the torn edge
    // are measured here too, once per layout.
    let edgeHeight = 0;
    // The chapter's point on the timeline: a docked chapter's rail (its
    // cover rides on the atlas), else its photograph (HomePage reads the
    // same, archiveChapterAnchorY). The cover's own parts are where it is.
    const anchorSelector = docked ? '[data-chapter-anchor]' : '.archive-photo-frame';
    const measureGeometry = () => {
      const chapterAnchor = (chapter: number) => document.querySelector<HTMLElement>(
        `[data-archive-chapter][data-chapter-index="${chapter}"] ${anchorSelector}`,
      );
      const cover = docked ? dockRef.current : section;
      const own = section.querySelector<HTMLElement>(anchorSelector);
      const frame = cover?.querySelector<HTMLElement>('.archive-photo-frame') ?? null;
      const tearBox = cover?.querySelector<HTMLElement>('.archive-plate__tear') ?? null;
      const nextFrame = chapterAnchor(resolvedChapterIndex + 1);
      const prevFrame = resolvedChapterIndex > 0 ? chapterAnchor(resolvedChapterIndex - 1) : null;
      // The last chapter's next anchor is the closing arrived: its top on
      // the viewport's top, i.e. its top plus the reading line.
      const closing = nextFrame ? null : document.querySelector<HTMLElement>('[data-archive-closing]');
      const nextAnchor = nextFrame && nextFrame.offsetHeight > 0
        ? documentOffsetTop(nextFrame) + nextFrame.offsetHeight / 2
        : closing ? documentOffsetTop(closing) + ARCHIVE_READING_LINE * window.innerHeight : null;
      geometry.vh = window.innerHeight;
      tearFrameRef.current = {
        w: tearBox?.offsetWidth ?? 0,
        h: tearBox?.offsetHeight ?? 0,
        vw: window.innerWidth,
      };
      if (!own || nextAnchor == null || own.offsetHeight <= 0) {
        tearLineRef.current = TEAR_LINE_MAX;
        geometry.corner = TEAR_LINE_MAX;
        geometry.h = 0;
        geometry.span = 0;
        geometry.prevSpan = 0;
      } else {
        const anchor = documentOffsetTop(own) + own.offsetHeight / 2;
        const span = nextAnchor - anchor;
        geometry.span = span;
        geometry.prevSpan = prevFrame && prevFrame.offsetHeight > 0
          ? anchor - (documentOffsetTop(prevFrame) + prevFrame.offsetHeight / 2)
          : span;
        if (docked) {
          // The rail's way out under the nav (see `railClear`): its top at
          // rest is the reading line less half its height.
          const restTop = ARCHIVE_READING_LINE * geometry.vh - own.offsetHeight / 2;
          railNavRef.current = span > 0
            ? { span, from: Math.max(0, restTop - 240), to: Math.max(1, restTop - 120) }
            : null;
          // Docked beside its shield the cover never leaves the screen
          // while its chapter is read: one fixed line (TEAR_LINE_DOCKED),
          // the gate from there.
          geometry.h = frame?.offsetHeight || 1;
          tearLineRef.current = TEAR_LINE_DOCKED;
          geometry.corner = TEAR_LINE_MAX;
        } else {
          const height = own.offsetHeight;
          geometry.h = height;
          tearLineRef.current = deriveTearLine(geometry.vh, height, ARCHIVE_READING_LINE, span);
          geometry.corner = deriveCornerLine(geometry.vh, height, ARCHIVE_READING_LINE, span, tearLineRef.current);
        }
      }
      // The torn edge: one profile per ticket (seeded by its chapter, so it
      // tears the same way every time), drawn at the seam's own length.
      const seam = Math.round(tearFrameRef.current.h);
      if (seam > 0 && seam !== edgeHeight) {
        edgeHeight = seam;
        const edge = tornEdge(seam, resolvedChapterIndex);
        const plate = cover?.querySelector<HTMLElement>('.archive-plate');
        plate?.style.setProperty('--ticket-edge-face', edge.faceCut);
        plate?.style.setProperty('--ticket-edge-stub', edge.stubCut);
        cover?.querySelector<HTMLElement>('.archive-photo-frame > .archive-ticket-fibre')
          ?.style.setProperty('background-image', edge.faceFringe);
        cover?.querySelector<HTMLElement>('.archive-ticket-stub > .archive-ticket-fibre')
          ?.style.setProperty('background-image', edge.stubFringe);
      }
      redrawTearRef.current?.();
    };
    // A new layout moves the lines, never the reader: whatever they now say
    // is shown, not played.
    const remeasure = () => {
      measureGeometry();
      latch(effective(chapterDelta.get()), true, gated(still()));
    };
    measureGeometry();
    observe(effective(last), performance.now());
    latch(effective(last), true, gated(still()));
    // A pull let go (or a hold run out) asks again with the timeline as it
    // now stands: a scroll that crossed the line under the hand tears on from
    // where the hand left the clock if the reader is still pushing on.
    latchNowRef.current = () => {
      const delta = effective(chapterDelta.get());
      latch(delta, false, gated(observe(delta, performance.now())));
    };
    const onOnward = (event: Event) => {
      const detail = (event as CustomEvent<{ delta: number; jump?: boolean }>).detail;
      onward = detail.delta;
      const delta = effective(chapterDelta.get());
      const jump = Boolean(detail.jump);
      if (jump) samples = [];
      const gate = observe(delta, performance.now());
      latch(delta, jump, jump ? undefined : gated(gate));
    };
    section.addEventListener('archive:onward', onOnward);
    const nextSection = document.querySelector<HTMLElement>(
      `[data-archive-chapter][data-chapter-index="${resolvedChapterIndex + 1}"]`,
    );
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure);
    resizeObserver?.observe(section);
    if (nextSection) resizeObserver?.observe(nextSection);
    // A docked plate is sized by the dock's plan: a new plan re-measures.
    const dockedPlate = docked ? dockRef.current?.querySelector<HTMLElement>('.archive-plate') : null;
    if (dockedPlate) resizeObserver?.observe(dockedPlate);
    window.addEventListener('resize', remeasure, { passive: true });
    const unsubscribe = chapterDelta.on('change', (value) => {
      // Reduced motion writes the timeline in whole chapters, so every step
      // is a "jump" there; its fade is the tear and still plays. A jump
      // elsewhere (a restored scroll) is shown as it is, with no gate, and is
      // nobody's push.
      const jump = !reduce && Math.abs(value - last) > TEAR_JUMP;
      last = value;
      const delta = effective(value);
      if (jump) samples = [];
      const gate = observe(delta, performance.now());
      latch(delta, jump, jump ? undefined : gated(gate));
    });
    return () => {
      latchNowRef.current = null;
      window.clearTimeout(restTimer);
      unsubscribe();
      section.removeEventListener('archive:onward', onOnward);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', remeasure);
    };
  }, [chapterDelta, docked, dockReady, reduce, resolvedChapterIndex, tearClock, ticket]);

  // The clock, for what the latch did not start itself: a jump shown as it
  // is, a pull's tear, reduced motion's fade. A tear taken up mid-reseat (or
  // the reverse) carries on from where the clock is, for the time that is
  // left.
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
      reseatTear();
    }
  }, [reduce, tearClock, ticket, torn]);
  useEffect(() => () => {
    tearPlayRef.current?.stop();
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
    window.clearTimeout(pullTimersRef.current.hold);
    window.clearTimeout(scrollGoTimerRef.current);
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
    const draw = () => {
      const clock = tearClock.get();
      const follow = pullFollow.get();
      if (clock <= 0 && follow === 0) {
        clear();
        return;
      }
      const box = tearFrameRef.current;
      const pose = tearPose(clock * TEAR_MS, box, {
        smooth: tearModeRef.current !== 'scroll',
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
    draw();
    return () => {
      redrawTearRef.current = null;
      offClock();
      offFollow();
      clear();
    };
    // `dockReady`: a docked plate is on the page only once the dock is.
  }, [dockReady, pullFollow, reduce, tearClock, ticket]);
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
    tearRateRef.current = 1;
    if (section) section.dataset.ticketTornAt = String(Math.round(tornAt));
    // The clock effect carries the clock on from where the hand let go, on the
    // score's own time and still on the hand's smooth tip (no catches appear
    // on release): free, the snap, laid aside.
    setTorn(true);
    const timers = pullTimersRef.current;
    window.clearTimeout(timers.go);
    window.clearTimeout(timers.hold);
    // Only once the face is free does the page go on (撕开后才能前往下一个地方).
    timers.go = window.setTimeout(() => {
      timers.go = 0;
      onTearAwayRef.current?.();
      timers.hold = window.setTimeout(() => {
        releasePullHold();
        latchNowRef.current?.();
      }, PULL_HOLD_MS);
    }, Math.max(0, tornAt + PULL_GO_AFTER_MS - now));
  };

  // ── Next stop: the tear, asked for by a click ──
  // The stub's "Next stop", or the next place's shield on the map (HomePage
  // sends `archive:tear-then` to the chapter being read), tears this ticket
  // exactly as the reader's push does — the paper's own stick-slip, the
  // hinge, the snap, both hands — at the score's own rate, and only once the
  // face is free does the page go on (`go`): 撕开票根，然后前往下一站. The
  // section is stamped as a push's tear is, so the atlas holds its flight to
  // the face like any other; the latch then waits, as after a pull, until the
  // voyage has carried the reader past the line. False when there is nothing
  // to tear here (torn already, mid re-seat, a hand on it, the camera in the
  // air, reduced motion): the caller simply goes.
  const tearThen = (go: () => void) => {
    const section = chapterRef.current as HTMLElement | null;
    if (!ticket || reduce || !section) return false;
    if (tornRef.current || pullHoldRef.current !== 'none' || pullRef.current) return false;
    if (tearClock.get() > 0.001) return false;
    if (document.documentElement.dataset.atlasCamera === 'flying') return false;
    const now = performance.now();
    pullHintTarget.set(0);
    pullHoldRef.current = 'away';
    tornRef.current = true;
    tearSnapRef.current = null;
    tearOriginRef.current = 'scroll';
    tearRateRef.current = 1;
    section.dataset.ticketTornAt = tearStamp(now, 0, 1);
    // Started here, so the stamp and the clock agree to the frame; the clock
    // effect finds it already on its way.
    playTear();
    setTorn(true);
    const timers = pullTimersRef.current;
    window.clearTimeout(timers.go);
    window.clearTimeout(timers.hold);
    timers.go = window.setTimeout(() => {
      timers.go = 0;
      go();
      timers.hold = window.setTimeout(() => {
        releasePullHold();
        latchNowRef.current?.();
      }, PULL_HOLD_MS);
    }, PULL_GO_AFTER_MS);
    return true;
  };
  const tearThenRef = useRef(tearThen);
  tearThenRef.current = tearThen;
  useEffect(() => {
    if (!ticket) return;
    const section = chapterRef.current as HTMLElement | null;
    if (!section) return;
    const onTearThen = (event: Event) => {
      const detail = (event as CustomEvent<{ go: () => void; handled?: boolean }>).detail;
      if (detail && !detail.handled) detail.handled = tearThenRef.current(detail.go);
    };
    section.addEventListener('archive:tear-then', onTearThen);
    return () => section.removeEventListener('archive:tear-then', onTearThen);
  }, [ticket]);
  // ── A scroll's tear goes on ──
  // 当移走…的时候将会和之前一样撕开票根，然后前往下一站: a ticket the reader's
  // own push tore goes on to the next stop exactly as "Next stop" does — the
  // same score, then, once the face is free (the section's stamp plus
  // PULL_GO_AFTER_MS, re-read so a harder push's re-stamp brings it
  // forward), the voyage HomePage takes (`onTearAway`), then the flight and
  // the sign's turn. It used to stop there: torn ~100px past rest, the
  // atlas committing only at ~300px, a push that came to rest in between
  // left a torn ticket over a map that never moved. It goes only while the
  // tear still stands (a reader who turned back has re-seated it), no hand
  // holds the ticket (a pull, Next stop and a shield have their own go),
  // the camera is not already in the air (a fling that carried the scroll
  // past the atlas's own commit: the atlas flies and the reader's scroll
  // carries the page, as before), and the camera is still on this ticket's
  // place (`data-atlas-place`, RouteAtlas). Never on a snap or under
  // reduced motion, whose timeline already moves in whole chapters.
  armScrollGoRef.current = () => {
    window.clearTimeout(scrollGoTimerRef.current);
    const check = () => {
      scrollGoTimerRef.current = 0;
      const section = chapterRef.current as HTMLElement | null;
      if (!section || !tornRef.current || tearOriginRef.current !== 'scroll') return;
      if (pullHoldRef.current !== 'none' || pullRef.current) return;
      const stamp = Number(section.dataset.ticketTornAt);
      if (!(stamp > 0)) return;
      const wait = stamp + PULL_GO_AFTER_MS - performance.now();
      if (wait > 1) {
        scrollGoTimerRef.current = window.setTimeout(check, wait);
        return;
      }
      const html = document.documentElement;
      if (html.dataset.atlasCamera === 'flying' || html.dataset.atlasPlace !== collection._id) return;
      // Focus goes on with the page only if it was on this chapter (a
      // keyboard reader scrolling with the keys): handed on after a wheel,
      // with no press before it, the browser draws it as keyboard focus — a
      // lime ring round the next cover.
      onTearAwayRef.current?.({ focus: section.contains(document.activeElement) });
    };
    scrollGoTimerRef.current = window.setTimeout(check, PULL_GO_AFTER_MS);
  };

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
  // board's flap (src/lib/routeShield.ts, FLAP) on a landing further along
  // the route, from the stop the camera left. RouteAtlas tells the page at
  // take-off (`atlas:depart`) and at touchdown (`atlas:arrive`), with the
  // stop left as `from` only on the way on:
  //  - At take-off the board is SET to the stop being left (`primeFlap`), so
  //    the ticket the voyage carries in reads "MIAMI" until it turns — the
  //    name it lands with is never shown settled first and turned back (it
  //    was: ORLANDO settled on screen for ~350ms, then MIAMI, then ORLANDO).
  //    A take-off anywhere else puts this board back; so does a landing
  //    elsewhere, and FLAP_PRIME_MAX_MS with no landing at all.
  //  - It turns once the ticket has come to rest. Docked (the desktop), that
  //    is when its cover appears at its shield (the dock's gate: the camera
  //    settled), never more than FLAP_DOCK_WAIT_MS after the landing. In a
  //    column: at the landing, or, while the page is still gliding on a
  //    voyage to this chapter (short hops land ~400px before the page
  //    does), at the voyage's end (`archive:voyage-end`, HomePage), never
  //    more than FLAP_VOYAGE_WAIT_MS after the landing.
  // Never on a first paint, a restore, a snap, a flight back or the dive
  // (whose ticket the reader has read on the way down), and never under
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
    let onVoyageEnd: ((event: Event) => void) | null = null;
    const unprime = () => {
      window.clearTimeout(primeTimer);
      primeTimer = 0;
      clearPrime?.();
      clearPrime = null;
    };
    const cancelWait = () => {
      window.clearTimeout(waitTimer);
      waitTimer = 0;
      if (onVoyageEnd) window.removeEventListener('archive:voyage-end', onVoyageEnd);
      onVoyageEnd = null;
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
      if (docked && dockRef.current) {
        // Docked, the ticket is seen only once its cover appears at its
        // shield — when the camera has settled, whichever way it came
        // (a push, "Next stop", a shield) — and it turns from there: the
        // name it carried in shows for FLAP.delay, then the board runs. At
        // the lock it was hidden still, and "03 PAGE" had stood on Zion's
        // photograph for half a second before the voyage's end turned it.
        if (dockShownRef.current) start();
        else {
          dockAppearRef.current = start;
          waitTimer = window.setTimeout(start, FLAP_DOCK_WAIT_MS);
        }
      } else if (document.documentElement.dataset.voyageTo === id) {
        onVoyageEnd = (ended: Event) => {
          const endedId = (ended as CustomEvent<{ id?: string }>).detail?.id;
          if (!endedId || endedId === id) start();
        };
        window.addEventListener('archive:voyage-end', onVoyageEnd);
        waitTimer = window.setTimeout(start, FLAP_VOYAGE_WAIT_MS);
      } else {
        start();
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
    // The press does not own the ticket yet: a still press is a click, and
    // the scroll keeps its say under it (a wheel read on under a resting
    // finger tears on the scroll's own verdict, so the map and the cover
    // never disagree). The hand takes the paper once it has travelled
    // PULL_CLICK_SLOP (`movePull`).
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
  // the scroll tore it (or the atlas took off) under the still press, in
  // which case there is nothing left to hold and the press lets go.
  const takePull = (pull: NonNullable<typeof pullRef.current>) => {
    if (tornRef.current || pullHoldRef.current !== 'none' || tearClock.get() > PULL_FREE_CLOCK
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
    // Let go early, or only a click: the scroll has its say again (a line
    // crossed under the hand tears on from here), and failing that the paper
    // springs back to its seat.
    if (pullFollow.get() !== 0) animate(pullFollow, 0, { duration: PULL_RESEAT_S, ease: PULL_RESEAT_EASE });
    // A press that never travelled never took the paper (see `takePull`):
    // whatever the scroll is playing on it goes on untouched.
    if (!pull.dragging) return;
    pullHoldRef.current = 'none';
    latchNowRef.current?.();
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
        className={`archive-plate relative archive-plate--ticket${torn ? ' is-torn' : ''}${pullable ? ' archive-plate--pullable' : ''}`}
        style={{
          ...stockStyle(collection.slug),
          ...(dockEntry ? { width: dockEntry.photoW + TICKET_STUB } : null),
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
            ticket exactly as the reader's push does and then goes on. */}
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
    const dock = dockReady && dockEntry && dockHost ? createPortal(
      <div
        ref={dockRef}
        className="archive-dock"
        data-cover-for={id}
        data-quadrant={quadrant}
      >
        <div
          className="archive-dock__seat"
          style={{ left: dockEntry.offset.x, top: dockEntry.offset.y }}
        >
          {regionTab && (
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
        className="archive-chapter--docked relative flex min-h-[100svh] items-center justify-end"
        // The last chapter a little taller than the screen: the sticky atlas
        // releases at the archive's end, and at New York's reading line it
        // had let go by 16px — a band of the closing's still map under the
        // atlas's foot.
        style={chapterTotal != null && index === chapterTotal - 1 ? { minHeight: 'calc(100svh + 48px)' } : undefined}
      >
        {/* The rail: the chapter's control (a click or Enter opens its
            story), soft ground under its type (global.css `.archive-rail`),
            its name racked and risen on the shared timeline as before. */}
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
