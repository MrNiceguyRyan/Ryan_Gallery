import {
  lazy,
  startTransition,
  Suspense,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import type { Collection } from '../../types';
import WalkIn from './WalkIn';
import ArchiveChapter from './ArchiveChapter';
import ArchiveClosing, { type ClosingStoryRequest } from './ArchiveClosing';
import GlobePrologue from './GlobePrologue';
import MagazineLayout, { photoOrigin, readStubMarks, type PlateOrigin, type PlateStub } from './MagazineLayout';
import type { AtlasVoyage, RouteStop } from './RouteAtlas';
import LivingAtlasStory from './LivingAtlasStory';
import { startLenis } from '../../lib/smoothScroll';
import { archiveEntryProgress, entrancePhase, ARCHIVE_ENTRANCE_PHASES, ARCHIVE_ENTRY_LEAD } from '../../lib/archiveEntrance';
import { storyFrames } from '../../lib/storyPlan';
import { TICKET_STOCK, stockPaper } from '../../lib/ticketStock';
import { activeChapters, chapterSections, issueChapters } from '../../lib/chapterOrder';
import { chapterPoint } from '../../lib/geo';
import { coverOf, coverRatioOf } from '../../lib/coverDock';
import { DUR, DUR_MS, EASE, voyageEase, voyageSeconds } from '../../lib/motion';
import { NOTES_LIVE } from '../../lib/notesNav';
import { OPENING_EVENT, type OpeningDetail } from '../../lib/openingFilm';
import type Lenis from 'lenis';

// Keep parsing separate from mounting. The handoff can warm these chunks while
// the opening is settling without creating Mapbox's WebGL context or mounting
// the story overlay before either one is needed.
const loadRouteAtlas = () => import('./RouteAtlas');
const RouteAtlas = lazy(loadRouteAtlas);

// Keep the more experimental Living Atlas composition on compact screens for
// now, but restore the established desktop archive: persistent route rail,
// real Mapbox geography and the active photograph sharing one editorial field.
// The desktop direction is intentionally anchored to the published site.

const ROUTE_FALLBACKS: Record<string, [number, number]> = {
  miami: [-80.1918, 25.7617],
  orlando: [-81.3792, 28.5383],
  page: [-111.4558, 36.9147],
  zion: [-112.987, 37.2982],
  'bryce canyon': [-112.1871, 37.6283],
  arizona: [-111.0937, 34.0489],
  'new york': [-74.006, 40.7128],
  manhattan: [-73.9857, 40.7484],
  washington: [-77.0369, 38.9072],
  baltimore: [-76.6122, 39.2904],
};

function routeCoordinateLabel([longitude, latitude]: [number, number]) {
  const format = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
  return `${format(latitude, 'N', 'S')}  /  ${format(longitude, 'E', 'W')}`;
}

interface Props {
  collections: Collection[];
}

// Keep the rendered tree aligned with Tailwind's `lg` breakpoint. The old
// 768px switch selected the desktop tree on tablets while the desktop atlas
// itself stayed hidden until 1024px, leaving an entire breakpoint without a
// map.
/* Every chapter is the same kind of cover. One editorial spread used to break
   the run (index 3); the owner asked for one treatment throughout. -1 keeps
   the `feature` variant reachable without any chapter using it. */
const FEATURE_CHAPTER_INDEX = -1;
// The homepage is an ISSUE, not the archive: which chapters it carries
// (HOME_CHAPTER_LIMIT) and the order it reads them in live in
// src/lib/chapterOrder.ts, which /about reads too.
// Desktop globe prologue: the height of the opening laid over the atlas. The
// atlas entrance overlaps it by ARCHIVE_ENTRY_LEAD of the viewport (the
// entrance begins when the archive's top edge is 56% down the screen), so the
// prologue's own clock runs over the first ~0.7 of a screen: the first screen
// (his name, the line, the globe and its eggs), then the globe's glide to the
// focal point. The dive into chapter 1 follows at once, and the first
// photograph comes up the page about a screen from the top. (It was 300svh:
// the name, a count page, then the index or the film roll, and the first
// photograph was nearly three screens down.)
const PROLOGUE_HEIGHT = '125svh';
// A voyage's passing (global.css, "A voyage's passing"): while a click carries
// the page to a place, what it streams past steps back so only the destination
// reads. The page comes back up over DUR.out, started that long before the
// landing, so it is whole on the frame the trip ends.
const PASSING_RESTORE_MS = DUR_MS.out;

function prologueProgressAt(scrollY: number, prologueTop: number, archiveTop: number, viewportHeight: number) {
  const span = Math.max(1, archiveTop - prologueTop - viewportHeight * ARCHIVE_ENTRY_LEAD);
  return Math.max(0, Math.min(1, (scrollY - prologueTop) / span));
}

const DESKTOP_LAYOUT_QUERY = '(min-width: 1024px)';

function subscribeToDesktopLayout(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_LAYOUT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getDesktopLayoutSnapshot() {
  return window.matchMedia(DESKTOP_LAYOUT_QUERY).matches;
}

function getDesktopLayoutServerSnapshot() {
  return true;
}

function documentTop(node: HTMLElement) {
  let top = 0;
  let current: HTMLElement | null = node;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }
  return top;
}

// Navigation and the scroll timeline must meet at the same untransformed
// point. On the desktop the chapter's cover rides on the map beside its
// shield (src/lib/coverDock.ts), so the chapter IS its rail — the name and
// the lede — and the timeline reads the rail's centre (`data-chapter-anchor`),
// not the section's longer box.
function archiveChapterAnchorY(element: HTMLElement, desktop: boolean) {
  const rail = desktop
    ? element.querySelector<HTMLElement>('[data-chapter-anchor]')
    : null;
  const visualAnchor = rail && rail.offsetHeight > 0
    ? rail
    : element;
  return documentTop(visualAnchor) + visualAnchor.offsetHeight * (desktop ? 0.5 : 0.19);
}

/** A ticket's stub as the story's rail keeps it (MagazineLayout, PlateStub):
 *  its box and where its stop number, "/ TT" and place are printed,
 *  read once, where it lies now. Null when it is not on screen. */
function ticketStubOf(stubNode: HTMLElement): PlateStub | null {
  const box = stubNode.getBoundingClientRect();
  const marks = box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight
    ? readStubMarks(stubNode, 'archive-ticket-stub')
    : null;
  if (!marks) return null;
  // What this ticket prints — its place in the homepage's run — so the
  // half the reader keeps carries the same number into the story.
  const ordinal = stubNode.querySelector('.archive-ticket-stub__no')?.textContent?.trim();
  const total = stubNode.querySelector('.archive-ticket-stub__of')?.textContent?.match(/\d+/)?.[0];
  return {
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    marks,
    node: stubNode,
    // The window, not the client width: the site's scrollbar comes and goes
    // with Lenis, and the close compared 1724 with 1728 and never flew the
    // stub home.
    view: { width: window.innerWidth, height: window.innerHeight },
    print: ordinal && total ? { ordinal, total } : undefined,
  };
}

function useDesktopLayout() {
  return useSyncExternalStore(
    subscribeToDesktopLayout,
    getDesktopLayoutSnapshot,
    getDesktopLayoutServerSnapshot,
  );
}

interface DeferredRouteAtlasProps {
  stops: RouteStop[];
  activeIndex: number;
  engagedChapterId?: string | null;
  chapterIds?: string[];
  chapterProgress?: MotionValue<number>;
  entryProgress?: MotionValue<number>;
  prologueProgress?: MotionValue<number>;
  reducedMotion: boolean;
  mobile?: boolean;
  paused?: boolean;
  presentation?: 'classic' | 'living';
  /** `focus` false (a pointer's click on the atlas): keyboard focus stays. */
  onNavigate?: (chapterId: string, options?: { focus?: boolean }) => void;
  /** Mount the map now (the opening film covers the first screen), not
   *  when the atlas nears the viewport. */
  eager?: boolean;
  /** Hold the globe's reveal while the opening film covers it (until the
   *  film lets go, about three seconds before it lands on the globe). */
  holdReveal?: boolean;
  /** Count the atlas as engaged while the opening film covers it. */
  engage?: boolean;
  /** The opening film still lies over the globe: its life waits. */
  covered?: boolean;
}

function RouteAtlasFallback({ mobile = false, entryProgress }: {
  mobile?: boolean;
  entryProgress?: MotionValue<number>;
}) {
  const stableProgress = useMotionValue(1);
  // Reduced motion needs no case of its own: its entry progress is already a
  // step (0 above the archive, 1 in it), so the stand-in stays out of the
  // prologue there too and the first screen is the globe's, as with motion.
  const opacity = useTransform(entryProgress ?? stableProgress, (p) =>
    entrancePhase(p, ...ARCHIVE_ENTRANCE_PHASES.mapVisibility),
  );
  return (
    <motion.div
      aria-hidden="true"
      style={{ opacity }}
      className={`route-atlas route-atlas-fallback relative w-full overflow-hidden bg-[#282c20] ${
        mobile ? 'route-atlas--mobile h-full min-h-[100svh]' : 'h-full'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_34%_42%,rgba(210,255,0,0.035),transparent_64%)]" />
      <div className="route-atlas-fallback__art absolute inset-0">
        <div className="absolute left-1/2 top-1/2 aspect-[1600/956] w-[132%] -translate-x-1/2 -translate-y-1/2 opacity-[0.24] md:w-[110%]">
          <img
            src="/assets/maps/walkin-us-atlas.webp"
            alt=""
            className="h-full w-full object-contain"
            width="1600"
            height="956"
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </div>
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_34%,rgba(40,44,32,0.34)_72%,#282c20_100%)]" />
    </motion.div>
  );
}

function DeferredRouteAtlas(props: DeferredRouteAtlasProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const mobile = !!props.mobile;

  useEffect(() => {
    if (nearViewport) return;
    const shell = shellRef.current;
    if (props.eager || !shell || typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNearViewport(true);
        observer.disconnect();
      },
      // Import Mapbox only near the route handoff. A larger margin starts
      // parsing the bundle halfway through the opening card animation and
      // competes with its final scale/mask frames.
      { rootMargin: props.reducedMotion ? '0px' : '120px 0px', threshold: 0 },
    );
    observer.observe(shell);
    return () => observer.disconnect();
  }, [nearViewport, props.eager, props.reducedMotion]);

  return (
    <div
      ref={shellRef}
      className="h-full w-full"
    >
      {nearViewport ? (
        <Suspense fallback={<RouteAtlasFallback mobile={mobile} entryProgress={props.entryProgress} />}>
          <RouteAtlas {...props} />
        </Suspense>
      ) : (
        <RouteAtlasFallback mobile={mobile} entryProgress={props.entryProgress} />
      )}
    </div>
  );
}

/* A homepage section — a run of city chapters that share a `region`. Sections
 * with ≥2 cities get a divider header; single-city/untagged ones don't. Cities
 * stay the clickable unit (each opens its story directly). */
interface RegionSection {
  key: string;
  region: string | null;
  showHeader: boolean;
  frameCount: number;
  cities: Collection[];
}

/* ═══════════════════════════════════════════════════════
 *  HomePage — atmospheric dark archive
 * ═══════════════════════════════════════════════════════ */
export default function HomePage({ collections }: Props) {
  const lenisRef = useRef<Lenis | null>(null);
  // A render-free, fractional chapter timeline. Lenis supplies the smooth
  // desktop transport while native momentum supplies touch; the atlas route
  // reads this value directly, so geography advances between chapter
  // thresholds instead of jumping only after the active city changes.
  const archiveProgress = useMotionValue(0);
  // The atlas enters on the same physical scroll axis as the archive. Unlike
  // the chapter timeline (which is expressed in chapter-space), this value is
  // a dedicated 0–1 handoff runway. It starts only after more than half of The
  // Route is visible and finishes as the first cover settles into the viewport,
  // giving the geographic zoom enough physical scroll distance to stay calm.
  const atlasEntryProgress = useMotionValue(0);
  const prologueProgress = useMotionValue(0);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const selectedCollectionRef = useRef<Collection | null>(null);
  selectedCollectionRef.current = selectedCollection;
  // The story the overlay opened on, and whether it opened from its chapter
  // (a plate, a cover) rather than from the closing's proof sheet: a reader
  // who turns on with Next and then goes Back comes back to the chapter of
  // the story they are on, not the one they opened.
  const storyOpenedIdRef = useRef<string | null>(null);
  const storyAtChapterRef = useRef(false);
  const [storyClosing, setStoryClosing] = useState(false);
  const [activeArchiveId, setActiveArchiveId] = useState<string | null>(null);
  const [engagedChapterId, setEngagedChapterId] = useState<string | null>(null);
  // The trip a click set in motion (desktop): a place on the atlas, the
  // globe's ticket, pull to tear, Back to the start.
  const [voyage, setVoyage] = useState<AtlasVoyage | null>(null);
  const voyageTimerRef = useRef(0);
  // Semantic city changes belong to React, but the optical timeline does not.
  // Keeping the current ID in a ref prevents every scroll frame from entering
  // React's state queue just to return the existing value.
  const activeArchiveIdRef = useRef<string | null>(null);
  const commitActiveArchiveId = useCallback((next: string | null) => {
    if (activeArchiveIdRef.current === next) return;
    activeArchiveIdRef.current = next;
    // The chapter change re-renders the whole archive; as a transition it
    // yields to the frames of the map flight and the scroll it coincides with.
    startTransition(() => setActiveArchiveId(next));
  }, []);
  const storyOpenRef = useRef(false);
  const storyScrollYRef = useRef(0);
  const storyReturnFocusRef = useRef<HTMLElement | null>(null);
  const storySourceChapterIdRef = useRef<string | null>(null);
  const bodyPaddingRightRef = useRef('');
  // The scrollbar's width while a story is open (0 when there is none): the
  // page keeps it as padding so nothing under the overlay reflows when the
  // stopped Lenis takes the scrollbar away.
  const storyGutterRef = useRef(0);
  const storySharedImageUrlRef = useRef('');
  // The plate the open story grew out of, as it was at the click.
  const plateOriginRef = useRef<PlateOrigin | null>(null);
  // The most opaque of the living atlas's stacked photographic layers — the one
  // the visitor is actually looking at mid-scrub.
  const liveAtlasFrame = () => {
    const layers = Array.from(
      document.querySelectorAll<HTMLElement>('.living-atlas__photo-layer'),
    );
    let best: HTMLElement | null = null;
    let bestOpacity = -1;
    layers.forEach((layer) => {
      const opacity = Number.parseFloat(getComputedStyle(layer).opacity);
      if (Number.isFinite(opacity) && opacity > bestOpacity) {
        bestOpacity = opacity;
        best = layer;
      }
    });
    return (best as HTMLElement | null)?.querySelector<HTMLImageElement>('img') ?? null;
  };
  // The scrollbar's width, held as the body's padding (and the fixed nav's,
  // through --story-gutter) from the frame Lenis stops until the frame it
  // starts again. Measured only while the scrollbar is still there; once held,
  // a second call keeps what it has.
  const holdStoryGutter = useCallback(() => {
    if (storyGutterRef.current > 0) return;
    const gutter = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    if (gutter <= 0) return;
    storyGutterRef.current = gutter;
    bodyPaddingRightRef.current = document.body.style.paddingRight;
    document.body.style.paddingRight = `${gutter}px`;
    document.documentElement.style.setProperty('--story-gutter', `${gutter}px`);
  }, []);
  const releaseStoryGutter = useCallback(() => {
    if (storyGutterRef.current <= 0) return;
    storyGutterRef.current = 0;
    document.body.style.paddingRight = bodyPaddingRightRef.current;
    document.documentElement.style.removeProperty('--story-gutter');
  }, []);
  const openCollection = useCallback((collection: Collection) => {
    // Two trees, two anchor prefixes: the living (mobile) tree publishes its
    // chapters as `mobile-archive-item-…`, so looking one up under the desktop
    // prefix silently found nothing there — no source chapter to return focus
    // to and no photograph to hand to the story. Only one tree is ever mounted,
    // so asking for both and taking whichever answers needs no layout flag (and
    // no dependency on one, which would have to be declared further down).
    const chapterId = `archive-item-${collection._id}`;
    const chapter = document.getElementById(chapterId)
      ?? document.getElementById(`mobile-${chapterId}`);
    const chapterControl = chapter?.querySelector<HTMLElement>('[role="button"], button');
    storyReturnFocusRef.current = chapterControl ?? (
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    );
    // Morph the exact frame the visitor is looking at. `currentSrc` is the
    // responsive candidate the browser already decoded, so the story's opening
    // photograph cannot cache-miss or land on a different candidate mid-flight.
    // The living tree has no per-chapter cover: its one photographic window
    // holds the committed frame, so the frame being looked at is the layer
    // currently carrying opacity there.
    // On the desktop the cover is not in its section: it rides on the atlas
    // beside its place's shield (src/lib/coverDock.ts, `coverOf`). A story
    // grows out of it only while it is shown there — the camera on its place
    // (`data-at`); opened from the rail mid-flight, it opens on its own cover.
    const dockedCover = coverOf(chapter);
    const plateRoot: HTMLElement | null = dockedCover
      ? (dockedCover.hasAttribute('data-at') ? dockedCover : null)
      : chapter;
    const chapterImage = plateRoot?.querySelector<HTMLImageElement>('.archive-photo-frame img')
      ?? (dockedCover ? null : liveAtlasFrame());
    storySharedImageUrlRef.current = chapterImage?.currentSrc || chapterImage?.src || '';
    // The plate the story will grow out of, measured once, here, in the click
    // — before Lenis is stopped and before the body lock lands (both follow
    // below): a rect read after either is a rect of a page that has already
    // moved. Two boxes in the one pass: the frame (the window) and the
    // photograph inside it (hover zoom and parallax included), so the plane's
    // first frame is the frame the reader saw. The living tree has no plate,
    // so its stories keep the cover they have.
    const plateFrame = plateRoot?.querySelector<HTMLElement>('.archive-photo-frame');
    // A torn ticket (its stub, or the keyboard) opens from where the
    // photograph LAY, not from the face torn off: that face is rotated,
    // laid aside and transparent, and a rect of it is the axis-aligned bound of
    // a box nobody can see. The tear box never moves and the frame sits at
    // its top-left, so its corner plus the frame's own size is the frame at
    // rest; the photograph fills it as the plane's first frame.
    const tornTear = plateRoot?.querySelector<HTMLElement>('.archive-plate.is-torn .archive-plate__tear');
    const tearBox = tornTear && plateFrame ? tornTear.getBoundingClientRect() : null;
    const frameBox = tearBox && plateFrame
      ? new DOMRect(tearBox.x, tearBox.y, plateFrame.offsetWidth, plateFrame.offsetHeight)
      : plateFrame?.getBoundingClientRect();
    const imageBox = tearBox
      ? frameBox ?? null
      : chapterImage && plateFrame?.contains(chapterImage)
        ? chapterImage.getBoundingClientRect()
        : null;
    const plateMatte = plateRoot?.querySelector<HTMLElement>('.archive-photo-matte');
    plateOriginRef.current = chapterImage && frameBox && imageBox
      && frameBox.width > 0 && frameBox.height > 0 && imageBox.width > 0 && imageBox.height > 0
      && storySharedImageUrlRef.current
      ? {
          frame: { x: frameBox.x, y: frameBox.y, width: frameBox.width, height: frameBox.height },
          image: { x: imageBox.x, y: imageBox.y, width: imageBox.width, height: imageBox.height },
          ratio: chapterImage.naturalWidth > 0 && chapterImage.naturalHeight > 0
            ? chapterImage.naturalWidth / chapterImage.naturalHeight
            : imageBox.width / imageBox.height,
          // framer writes the matte's MotionValue inline, so this is current.
          matte: Number.parseFloat(plateMatte?.style.opacity ?? '') || 0,
          imageUrl: storySharedImageUrlRef.current,
        }
      : null;
    // The ticket's stub goes with the story: the half the reader keeps is
    // handed into the foot of the story's rail once the story has loaded,
    // and flies back onto the ticket at the close (MagazineLayout, KeptStub
    // / flyStubHome). Read in the same pass as the plate — its box and where
    // its stop number, "/ TT" and place are printed. It stays on the
    // ticket while the plate grows over it: MagazineLayout hides it
    // (`data-kept-away`) only once its kept half is in the rail, under the
    // opaque story. A torn ticket has already given its stub up; under
    // reduced motion nothing travels.
    const stubNode = plateOriginRef.current && !tornTear
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? plateRoot?.querySelector<HTMLElement>('.archive-ticket-stub')
      : null;
    const keptStub = stubNode ? ticketStubOf(stubNode) : null;
    if (plateOriginRef.current && keptStub) plateOriginRef.current.stub = keptStub;
    // The plate's title, corners and cue hang past its edges; they go with the
    // plate in the same paint the plane arrives in (global.css,
    // `[data-story-source]`). An attribute set here rather than React state,
    // so it is on the node before the commit that mounts the story.
    document.querySelectorAll<HTMLElement>('[data-story-source]').forEach((node) => {
      delete node.dataset.storySource;
    });
    if (chapter && plateOriginRef.current) {
      chapter.dataset.storySource = 'true';
      if (dockedCover) dockedCover.dataset.storySource = 'true';
    }
    // Freeze the page in the same event frame as the story selection. Waiting
    // for the state effect left one residual smooth-scroll frame moving behind
    // the full-screen cover on quick trackpad clicks.
    storyOpenRef.current = true;
    storyOpenedIdRef.current = collection._id;
    storyAtChapterRef.current = !!chapter;
    storySourceChapterIdRef.current = chapter?.id ?? chapterId;
    setStoryClosing(false);
    storyScrollYRef.current = window.scrollY;
    commitActiveArchiveId(`archive-item-${collection._id}`);
    // Stopping Lenis clips <html> and takes the scrollbar with it: hold its
    // width as padding in the same frame, or the whole page reflows under the
    // growing plate (and the stub's box above stops being where it is).
    holdStoryGutter();
    lenisRef.current?.stop();
    setSelectedCollection(collection);
  }, [commitActiveArchiveId, holdStoryGutter]);
  // A turned story's own chapter ticket, read at the close for the story's
  // kept stub to fly home into (MagazineLayout asks for it: `homeStubFor`).
  const turnedStubRef = useRef<{ id: string; stub: PlateStub } | null>(null);
  const homeStubFor = useCallback(
    (collectionId: string) => (turnedStubRef.current?.id === collectionId ? turnedStubRef.current.stub : null),
    [],
  );
  const closeCollection = useCallback(() => {
    turnedStubRef.current = null;
    // A story turned (Next) away from the chapter it opened on closes onto
    // the chapter of the story on screen: the page is set at that chapter's
    // anchor (derived from the offset chain, as a voyage aims) under the
    // story while it still covers the whole screen, so the exit uncovers the
    // chapter the reader is actually on. Its focus returns there too. The
    // page is held (Lenis stopped, the body locked); the lock's release lands
    // on the same position (`storyScrollYRef`).
    const current = selectedCollectionRef.current;
    if (current && storyAtChapterRef.current && current._id !== storyOpenedIdRef.current) {
      const chapterId = `archive-item-${current._id}`;
      const desktopTarget = document.getElementById(chapterId);
      const target = desktopTarget ?? document.getElementById(`mobile-${chapterId}`);
      if (target) {
        const desktop = !!desktopTarget;
        const y = Math.max(0, Math.round(archiveChapterAnchorY(target, desktop) - window.innerHeight * (desktop ? 0.48 : 0.56)));
        storyScrollYRef.current = y;
        if (desktopTarget) {
          window.scrollTo({ top: y, behavior: 'instant' });
          // The chapter clock goes with the page. Its sampler is off while a
          // story is open, and the page now sits on this chapter's anchor,
          // which is this chapter on the clock. So the atlas resumes here
          // under the story, not on the chapter the story opened from, and
          // cuts to it before the story lifts (RouteAtlas, "Resumed on
          // another place").
          const chapterIndex = Number(desktopTarget.dataset.chapterIndex);
          if (Number.isFinite(chapterIndex)) archiveProgress.set(chapterIndex);
          // This chapter's own ticket takes the turned story's kept stub
          // home, as a ticket a story grew out of does. The stub is read
          // once, here, as the open reads it: after the page has been set
          // where the exit will uncover it, and nothing moves it before the
          // flight lands (an untorn ticket, motion allowed).
          // (Its cover rides on the atlas: only one the camera is on — shown
          // there, `data-at` — has a place to fly the stub home to.)
          const turnedCover = coverOf(desktopTarget) ?? desktopTarget;
          const stubNode = (turnedCover === desktopTarget || turnedCover.hasAttribute('data-at'))
            && !turnedCover.querySelector('.archive-plate.is-torn')
            && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? turnedCover.querySelector<HTMLElement>('.archive-ticket-stub')
            : null;
          const stub = stubNode ? ticketStubOf(stubNode) : null;
          if (stub) turnedStubRef.current = { id: current._id, stub };
        } else document.body.style.inset = `-${y}px 0 auto`;
        storySourceChapterIdRef.current = target.id;
        storyReturnFocusRef.current = target.querySelector<HTMLElement>('[role="button"], button');
        commitActiveArchiveId(chapterId);
      }
    }
    // Keep the homepage frozen until the editorial Story cover and panel have
    // completed their exit. The map timeline resumes only after AnimatePresence.
    setStoryClosing(true);
    setSelectedCollection(null);
  }, [archiveProgress, commitActiveArchiveId]);
  const selectCollectionWithinStory = useCallback((collection: Collection) => {
    setSelectedCollection(collection);
  }, []);
  const finishStoryClose = useCallback(() => {
    storyOpenRef.current = false;
    setStoryClosing(false);
    // The plate that grew into the story gets its title and corners back.
    document.querySelectorAll<HTMLElement>('[data-story-source]').forEach((node) => {
      delete node.dataset.storySource;
    });
    // …and its stub, if the story's own close did not already give it back
    // (one flying home seats itself, and is left alone here).
    document.querySelectorAll<HTMLElement>('[data-kept-away]:not([data-kept-returning])').forEach((node) => {
      delete node.dataset.keptAway;
    });
    // Focusing into a subtree that is still `inert` silently no-ops, and the
    // page root only drops `inert` once the state above has painted. Two
    // frames covered the editorial-cover exit, but the shared-photograph exit
    // is longer and lost that race intermittently — leaving focus on <body>.
    // Retry, bounded, until the focus actually lands.
    let attempts = 0;
    const restoreFocus = () => {
      const sourceChapter = storySourceChapterIdRef.current
        ? document.getElementById(storySourceChapterIdRef.current)
        : null;
      const focusTarget = storyReturnFocusRef.current?.isConnected
        ? storyReturnFocusRef.current
        : sourceChapter?.querySelector<HTMLElement>('[role="button"], button') ??
          document.getElementById('main-content');
      if (!focusTarget) {
        storySourceChapterIdRef.current = null;
        return;
      }
      focusTarget.focus({ preventScroll: true });
      if (document.activeElement === focusTarget || attempts >= 8) {
        storySourceChapterIdRef.current = null;
        return;
      }
      attempts += 1;
      window.requestAnimationFrame(restoreFocus);
    };
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restoreFocus);
    });
  }, []);
  const storyActive = !!selectedCollection || storyClosing;
  // The atlas keeps rendering while the story panel slides up over it and
  // while it slides back down, so the page under the panel is the live page;
  // it pauses only once the overlay fully covers it.
  const [atlasPaused, setAtlasPaused] = useState(false);
  useEffect(() => {
    if (!selectedCollection || storyClosing) {
      setAtlasPaused(false);
      return;
    }
    const timer = window.setTimeout(() => setAtlasPaused(true), 900);
    return () => window.clearTimeout(timer);
  }, [selectedCollection, storyClosing]);

  // Honour "reduce motion": skip the always-on ambient animations entirely.
  const reduce = useReducedMotion();
  const desktopLayout = useDesktopLayout();
  // Desktop keeps the classic two-column composition: the sticky atlas with
  // the column of film covers beside it. Rendering the living atlas — a
  // full-bleed map stage with one photographic window floating on it — at
  // desktop width was built and rejected by the owner. The same "map is the
  // stage" shape had already been rejected once before. The living tree is the
  // mobile composition only. Do not widen this to desktop again.
  const useLivingAtlas = !desktopLayout;

  // Desktop CAN open a story by morphing the cover photograph itself into the
  // story's opening frame (MagazineLayout's `shared-photo` entry). It is off:
  // taking that path makes `coverGone`/`coverExited` start true, which skips
  // the whole editorial cover — the 1.12→1 backdrop, the four staggered column
  // rules, the masthead and folio clipPath wipes, the masked headline — and
  // shortens the exit. The morph is quick but that sequence is the transition
  // into and back out of a story, and losing it was a downgrade. Flip this to
  // true to trade the cover for the morph; everything else stays wired.
  // Mobile could never morph anyway: with no ArchiveChapter to morph FROM,
  // `shared-photo` degrades to a bare 0.35s fade.
  const SHARED_PHOTO_ENTRY = false;
  const storySharedLayoutId = SHARED_PHOTO_ENTRY && desktopLayout && selectedCollection
    ? `story-photo-${selectedCollection._id}`
    : undefined;
  const focusStoryEntry = useCallback((focusTarget: HTMLButtonElement | null) => {
    focusTarget?.focus({ preventScroll: true });
  }, []);

  // In shared-photo mode MagazineLayout hands Escape and focus containment
  // back to the Homepage — its own handler early-returns on `sharedEntry`
  // because the photograph is mid-flight between two surfaces and the outgoing
  // shell must not keep trapping focus. The page root is already `inert` while
  // a story is open, so Tab cannot reach the archive; what is missing is the
  // Escape key and a wrap inside the story dialog. The Lightbox registers
  // keydown in the capture phase and stops propagation, so it still owns
  // Escape (and the arrows) whenever it is open.
  useEffect(() => {
    if (!storySharedLayoutId || !storyActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCollection();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('aria-hidden') && element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeCollection, storyActive, storySharedLayoutId]);

  // Nav pills (Map/About) stay hidden only while the opening title is resolving.
  // WalkIn marks that hand-off on the body; the custom event is supported as a
  // second signal so navigation never waits for the user to scroll.
  const [navPillsVisible, setNavPillsVisible] = useState(false);
  useEffect(() => {
    let revealed = document.body.classList.contains('walkin-in');
    let detached = false;
    let bodyObserver: MutationObserver | null = null;

    const detach = () => {
      if (detached) return;
      detached = true;
      bodyObserver?.disconnect();
      window.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('walkin:reveal', onReveal);
    };

    const apply = () => {
      const show =
        revealed ||
        document.body.classList.contains('walkin-in') ||
        window.scrollY > window.innerHeight * 1.15;
      setNavPillsVisible((current) => (current === show ? current : show));
      if (show) detach();
    };

    const onReveal = () => {
      revealed = true;
      apply();
    };
    bodyObserver = new MutationObserver(apply);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('scroll', apply, { passive: true });
    window.addEventListener('resize', apply, { passive: true });
    window.addEventListener('walkin:reveal', onReveal);
    apply();
    return detach;
  }, []);

  // ── The opening film (OpeningFilm, its own island above this one) ──
  // While it covers the first screen the globe holds its reveal (until the
  // film lets go of it, so the fade, the dawn and the tiles they ask for are
  // done when the film lands on the globe) and the globe's key is out of the
  // tab order; `null` means there is no film to wait for (a second view).
  const [opening, setOpening] = useState<OpeningDetail | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.reel === 'skip' || !root.hasAttribute('data-opening')) return;
    const apply = (detail?: OpeningDetail) => setOpening(detail ?? { state: 'film', globe: false });
    apply(window.__archiveOpening);
    const onOpening = (event: Event) => apply((event as CustomEvent<OpeningDetail>).detail);
    window.addEventListener(OPENING_EVENT, onOpening);
    return () => window.removeEventListener(OPENING_EVENT, onOpening);
  }, []);
  const reelCovering = opening != null && opening.state !== 'page';
  const reelFramed = opening?.globe ?? false;

  // ── Lenis smooth scroll (landonorris-style weighty momentum) ──
  // Boots via the shared startLenis() helper (single source of truth for the
  // site's scroll feel — travel/about use the same). framer's useScroll reads
  // the same window position Lenis drives, so the scroll effects keep working.
  // startLenis no-ops under reduced-motion. Held in a ref so the collection
  // overlay can pause it — Lenis otherwise eats the wheel on the window and the
  // overlay's own scroll never moves.
  useEffect(() => {
    const { lenis, destroy } = startLenis();
    lenisRef.current = lenis;
    return () => {
      destroy();
      lenisRef.current = null;
    };
  }, [reduce]);

  // Warm Mapbox after the opening reveal has had its visual beat. Its WebGL
  // canvas remains separately gated near the viewport — except behind the
  // opening film: the map is created at once (its start-up is on the main
  // thread while the film plays on the compositor), and its tiles are in
  // long before the film lands on it.
  const atlasEager = desktopLayout && opening != null;
  useEffect(() => {
    let delay = 0;
    let idle = 0;
    let disposed = false;

    const importDestinations = () => {
      if (disposed) return;
      void loadRouteAtlas();
    };
    const scheduleImport = () => {
      delay = window.setTimeout(() => {
        if ('requestIdleCallback' in window) {
          idle = window.requestIdleCallback(importDestinations, { timeout: 1400 });
        } else {
          importDestinations();
        }
      }, reduce ? 0 : 1800);
    };

    if (document.body.classList.contains('walkin-in')) scheduleImport();
    else window.addEventListener('walkin:reveal', scheduleImport, { once: true });

    return () => {
      disposed = true;
      window.clearTimeout(delay);
      if (idle && 'cancelIdleCallback' in window) window.cancelIdleCallback(idle);
      window.removeEventListener('walkin:reveal', scheduleImport);
    };
  }, [reduce]);

  const desktopAtlasSectionRef = useRef<HTMLDivElement>(null);
  // The covers' dock on the atlas (see the aside below): a state, so the
  // chapters render their covers into it once it is on the page.
  const [dockHost, setDockHost] = useState<HTMLDivElement | null>(null);
  const desktopStageRef = useRef<HTMLDivElement>(null);
  // The page's own root: gone from the document once a navigation (the
  // browser's Back with a story open) has swapped the page out.
  const pageRootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!desktopLayout || !desktopAtlasSectionRef.current) return;
    // Restored/deep-linked pages enter at their current position, never replay
    // a zero-progress opening for the first hydrated frame.
    const progress = archiveEntryProgress(window.scrollY, documentTop(desktopAtlasSectionRef.current), window.innerHeight);
    atlasEntryProgress.set(reduce ? (progress > 0 ? 1 : 0) : progress);
    if (desktopStageRef.current) {
      prologueProgress.set(prologueProgressAt(
        window.scrollY,
        documentTop(desktopStageRef.current),
        documentTop(desktopAtlasSectionRef.current),
        window.innerHeight,
      ));
    }
  }, [desktopLayout, atlasEntryProgress, prologueProgress, reduce]);
  // Filter to collections that have photos, in route order; then the issue
  // (the most recent HOME_CHAPTER_LIMIT, read in route order); then the
  // region sections. The rules are src/lib/chapterOrder.ts, shared with /about.
  const activeCollections = useMemo(() => activeChapters(collections), [collections]);
  const issueCollections = useMemo(() => issueChapters(activeCollections), [activeCollections]);
  const sections = useMemo<RegionSection[]>(() => chapterSections(issueCollections), [issueCollections]);

  // Flat city list in on-screen order (region members grouped adjacent) — the
  // route rail + observer index against this.
  const orderedCities = useMemo(() => sections.flatMap((s) => s.cities), [sections]);

  // ── Stories opened from the closing's proof sheet ──
  // A frame on the sheet opens its chapter's story and then that frame in the
  // viewer; a kept stub opens the story. The sheet lies a page or more below
  // the chapter's plate, so the story does not grow out of that plate (its
  // rect is off-screen). A chosen frame is on screen, though, and the story
  // grows out of it by the plate's own path (`photoOrigin`): the picture the
  // reader picked becomes the cover, and its place's terrain comes up over
  // it. That replaces a 0.7s crossfade of the whole panel over the sheet,
  // which read as a muddy double exposure. A stub opens the story on its own
  // front page, as before. No chapter is made active behind the cover — the
  // reader is still at the closing — and focus comes back to where the sheet
  // says (the stub, if it was pressed from the keyboard; the closing section,
  // if a pointer chose).
  const storyFrameRef = useRef<{ id: string; hash: string } | null>(null);
  const openStoryFromClosing = useCallback((collectionId: string, request: ClosingStoryRequest) => {
    const collection = orderedCities.find((city) => city._id === collectionId);
    if (!collection) return;
    const activeBefore = activeArchiveIdRef.current;
    // The chosen frame, read before openCollection stops Lenis and holds the
    // scrollbar's gutter, as the plate is read in openCollection itself.
    const grownFrom = request.source ? photoOrigin(request.source, request.source.querySelector('img')) : null;
    openCollection(collection);
    // The reader is at the closing, and comes back to it whatever story they
    // turn on to.
    storyAtChapterRef.current = false;
    // Undo what openCollection read off the chapter's plate, in the same
    // event: the story mounts on the next render and reads these refs there.
    // (The chapter's stub stays on its ticket: it is hidden only by a story
    // that grew out of that ticket, and this one grows from the frame.)
    plateOriginRef.current = grownFrom;
    document.querySelectorAll<HTMLElement>('[data-story-source]').forEach((node) => {
      delete node.dataset.storySource;
    });
    if (request.returnFocus) storyReturnFocusRef.current = request.returnFocus;
    commitActiveArchiveId(activeBefore);
    // The story's frame 01 (its cover) IS the spread the grow lands on: a
    // proof-sheet cover opens the story, not the viewer over it.
    const hash = request.frameUrl ? /[0-9a-f]{40}/.exec(request.frameUrl)?.[0] : undefined;
    const frame01 = storyFrames(collection.photos ?? [], collection.coverImageUrl)[0]?.imageUrl ?? collection.coverImageUrl ?? '';
    const isFrame01 = !!hash && /[0-9a-f]{40}/.exec(frame01)?.[0] === hash;
    storyFrameRef.current = hash && !isFrame01 ? { id: collection._id, hash } : null;
  }, [orderedCities, openCollection, commitActiveArchiveId]);
  // …then the frame. MagazineLayout takes no starting frame, so the page does
  // what a reader would: while the story's front page still covers it, the
  // story is held at that frame's row (so the peel uncovers the frame, not
  // the story's top), and once the story is live (its body no longer inert)
  // the frame's own cell is clicked — the viewer flies out of it exactly as it
  // does from a click there. Found by asset hash, so the story's own order
  // (it promotes a landscape to the front) never matters. Gives up quietly.
  useEffect(() => {
    const pending = storyFrameRef.current;
    if (!pending) return;
    // Closed, or turned to another story before the frame was reached.
    if (!selectedCollection || pending.id !== selectedCollection._id) {
      storyFrameRef.current = null;
      return;
    }
    let frame = 0;
    const started = performance.now();
    const findCell = () => Array.from(document.querySelectorAll<HTMLElement>('[data-frame-index]')).find((cell) => {
      if (cell.offsetParent === null) return false;
      const image = cell.querySelector('img');
      return !!image && `${image.getAttribute('srcset') ?? ''} ${image.getAttribute('src') ?? ''}`.includes(pending.hash);
    }) ?? null;
    const step = () => {
      frame = 0;
      if (storyFrameRef.current !== pending) return;
      if (performance.now() - started > 8000) {
        storyFrameRef.current = null;
        return;
      }
      const cell = findCell();
      const scroller = cell?.closest<HTMLElement>('[data-lenis-prevent]') ?? null;
      if (cell && scroller) {
        let top = 0;
        let node: HTMLElement | null = cell;
        while (node && node !== scroller) {
          top += node.offsetTop;
          node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
        }
        if (node === scroller) {
          const target = Math.max(0, Math.round(top - (scroller.clientHeight - cell.offsetHeight) / 2));
          if (Math.abs(scroller.scrollTop - target) > 1) {
            const behavior = scroller.style.scrollBehavior;
            scroller.style.scrollBehavior = 'auto';
            scroller.scrollTop = target;
            scroller.style.scrollBehavior = behavior;
          }
        }
        if (!cell.closest('[inert]')) {
          storyFrameRef.current = null;
          cell.click();
          return;
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [selectedCollection]);
  // The first screen's kicker years, derived from the archive itself. Some
  // chapters store their year as a string, so parse rather than trust the
  // type. From the whole archive, deliberately — the span is a claim about the
  // archive, not about the chapters that happen to be on the front this month.
  const archiveYearSpan = useMemo(() => {
    const years = activeCollections
      .map((city) => Number(city.year))
      .filter((year) => Number.isFinite(year) && year > 0);
    if (!years.length) return '';
    const first = Math.min(...years);
    const last = Math.max(...years);
    return first === last ? String(first) : `${first}–${last}`;
  }, [activeCollections]);
  const orderedChapterIds = useMemo(
    () => orderedCities.map((city) => city._id),
    [orderedCities],
  );
  const chapterPreloadUrls = useMemo(() => {
    const covers = orderedCities.map(
      (city) => city.coverImageUrl ?? city.photos?.[0]?.imageUrl ?? '',
    );
    return covers.map((_, index) => [covers[index - 1], covers[index + 1]].filter(Boolean));
  }, [orderedCities]);
  // The pad under each ticket: the card stock of the (up to three) tickets
  // still bound under it, nearest first.
  const chapterPadStocks = useMemo(
    () => orderedCities.map((_, index) =>
      orderedCities.slice(index + 1, index + 4).map((city) => stockPaper(city.slug)),
    ),
    [orderedCities],
  );
  const walkInCollections = useMemo(
    () => orderedCities.map((city) => ({
      name: city.name.trim(),
      frames: city.photoCount ?? city.photos?.length ?? 0,
    })),
    [orderedCities],
  );
  // A region of two or more places is headed "REGION FLORIDA · 2 PLACES · 32
  // FRAMES" at its first place (owner, 2026-09-28: 保留). On the desktop the
  // heading rides as a tab on that place's cover (src/lib/coverDock.ts).
  const regionTabs = useMemo(() => {
    const tabs = new Map<string, { region: string; places: number; frames: number }>();
    sections.forEach((section) => {
      const first = section.cities[0];
      if (section.showHeader && section.region && first) {
        tabs.set(first._id, { region: section.region, places: section.cities.length, frames: section.frameCount });
      }
    });
    return tabs;
  }, [sections]);
  const cityDomId = (c: Collection) => `archive-item-${c._id}`;
  const mobileCityDomId = (c: Collection) => `mobile-archive-item-${c._id}`;

  // The route inset is driven by the archive's real geotags. A named-place
  // fallback keeps older, untagged collections on the same geographic trace.
  const routeStops = useMemo<RouteStop[]>(
    () =>
      orderedCities.flatMap((city) => {
        const fallbackKey = [city.name, city.location, city.region]
          .filter(Boolean)
          .map((value) => value!.trim().toLowerCase())
          .find((value) => ROUTE_FALLBACKS[value]);
        // The canonical map point, else the mean of the geotagged frames
        // (src/lib/geo.ts, the rule /about's route figure reads too), else a
        // named place.
        const coordinates: [number, number] | undefined = chapterPoint(city)
          ?? (fallbackKey ? ROUTE_FALLBACKS[fallbackKey] : undefined);

        const landscapePreview = (city.photos ?? []).find((photo) =>
          !!photo.imageUrl &&
          photo.width != null &&
          photo.height != null &&
          photo.width >= photo.height,
        )?.imageUrl;
        const imageUrl = landscapePreview || city.coverImageUrl || city.photos?.[0]?.imageUrl || '';
        const rawLocationLabel = city.location || city.region;
        const locationLabel = rawLocationLabel?.trim().toLowerCase() === city.name.trim().toLowerCase()
          ? undefined
          : rawLocationLabel;

        return coordinates
          ? [{
              id: city._id,
              name: city.name.trim(),
              slug: city.slug,
              coordinates,
              imageUrl,
              coverImageUrl: city.coverImageUrl || city.photos?.[0]?.imageUrl || undefined,
              frameCount: city.photoCount ?? city.photos?.length ?? 0,
              year: city.year,
              region: city.region?.trim() || undefined,
              locationLabel,
              coordinateLabel: routeCoordinateLabel(coordinates),
              // What the cover docked beside the place's shield needs to be
              // placed: its photograph's ratio, and whether it carries its
              // region's tab.
              coverRatio: coverRatioOf(city.coverImageUrl ?? city.photos?.[0]?.imageUrl) ?? undefined,
              dockTab: regionTabs.has(city._id),
            }]
          : [];
      }),
    [orderedCities, regionTabs],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const orderedCount = activeCollections.filter((collection) =>
      Number.isFinite(collection.routeOrder),
    ).length;
    if (orderedCount > 0 && orderedCount < activeCollections.length) {
      console.warn(
        '[Living Atlas] routeOrder is only partially configured; preserving the published collection order.',
      );
    }
    const mappedIds = new Set(routeStops.map((stop) => stop.id));
    const missing = orderedCities.filter((city) => !mappedIds.has(city._id));
    if (missing.length) {
      console.warn(
        `[Living Atlas] Missing canonical coordinates: ${missing.map((city) => city.name).join(', ')}`,
      );
    }
    // A new chapter prints on the olive fallback until it is given its own
    // card stock (and one from STOCK_RESERVE) in src/lib/ticketStock.ts.
    const unstocked = activeCollections.filter((collection) => !TICKET_STOCK[collection.slug]);
    if (unstocked.length) {
      console.warn(
        `[Ticket stock] No card stock for: ${unstocked.map((collection) => collection.slug).join(', ')} — printing on the olive fallback.`,
      );
    }
  }, [activeCollections, orderedCities, routeStops]);

  // Index of the active city — drives the geographic trace (−1 in the hero).
  // `activeArchiveId` holds the active city's full DOM id.
  const activeRouteIndex = activeArchiveId
    ? orderedCities.findIndex((c) => cityDomId(c) === activeArchiveId)
    : -1;
  const activeRouteCity = activeRouteIndex >= 0 ? orderedCities[activeRouteIndex] : null;
  const livingAtlasActiveIndex = useMemo(() => {
    const index = routeStops.findIndex((stop) => stop.id === activeRouteCity?._id);
    return index >= 0 ? index : routeStops.length > 0 ? 0 : -1;
  }, [activeRouteCity?._id, routeStops]);
  const atlasHref = activeRouteCity?.slug
    ? `/travel?place=${encodeURIComponent(activeRouteCity.slug)}#atlas-map`
    : '/travel';

  const voyageActiveRef = useRef(false);

  // ── A voyage's passing ──
  // Set on the archive column for the trip (and on the destination chapter,
  // which never steps back); cleared by a timer PASSING_RESTORE_MS before the
  // landing, and again by the trip's own settle in case it ends early.
  // Attributes outside React's tree of props: a render in between never
  // touches them. <html> carries it too, with the destination's group in the
  // atlas's tick strip, so the strip's caption names only where the trip is
  // going, not each chapter it streams past.
  const passingRef = useRef<{ column: HTMLElement; destination: HTMLElement | null; tick: HTMLElement | null; timer: number } | null>(null);
  const endPassing = useCallback(() => {
    const passing = passingRef.current;
    if (!passing) return;
    passingRef.current = null;
    window.clearTimeout(passing.timer);
    delete passing.column.dataset.voyage;
    delete document.documentElement.dataset.voyage;
    if (passing.destination) delete passing.destination.dataset.voyageDest;
    if (passing.tick) delete passing.tick.dataset.voyageDest;
  }, []);
  const startPassing = useCallback((destination: HTMLElement | null, durationMs: number) => {
    endPassing();
    const column = document.querySelector<HTMLElement>('[data-archive-column]');
    if (!column) return;
    const destinationId = destination?.id.startsWith('archive-item-') ? destination.id.slice('archive-item-'.length) : null;
    const tick = destinationId
      ? document.querySelector<HTMLElement>(`[data-tick-group="${CSS.escape(destinationId)}"]`)
      : null;
    if (destination) destination.dataset.voyageDest = '';
    if (tick) tick.dataset.voyageDest = '';
    column.dataset.voyage = 'passing';
    document.documentElement.dataset.voyage = 'passing';
    const timer = window.setTimeout(endPassing, Math.max(0, durationMs - PASSING_RESTORE_MS));
    passingRef.current = { column, destination, tick, timer };
  }, [endPassing]);
  useEffect(() => endPassing, [endPassing]);

  // `passing` false: the trip does not step the page back (pull to tear,
  // whose torn face is still being laid aside when the page sets off).
  const navigateLivingChapter = useCallback((anchorId: string, passing = true, moveFocus = true) => {
    // One trip at a time: a second click mid-voyage would retarget the dive.
    if (voyageActiveRef.current) return;
    const target = document.getElementById(anchorId);
    if (!target) return;

    // Move keyboard focus with the visual journey. `preventScroll` keeps focus
    // from snapping the page before Lenis/native scroll performs the same
    // calibrated movement used by pointer users.
    const chapterControl = target.querySelector<HTMLElement>('[role="button"], button');
    const chapterImage = (coverOf(target) ?? target).querySelector<HTMLImageElement>('.archive-photo-frame img');
    if (chapterImage) {
      chapterImage.loading = 'eager';
      chapterImage.fetchPriority = 'high';
      if (typeof chapterImage.decode === 'function') void chapterImage.decode().catch(() => {});
    }
    if (moveFocus) chapterControl?.focus({ preventScroll: true });

    const readingLine = window.innerHeight * (desktopLayout ? 0.48 : 0.56);
    const targetY = archiveChapterAnchorY(target, desktopLayout) - readingLine;
    const lenis = lenisRef.current;
    if (lenis && !reduce) {
      const chapterId = desktopLayout && anchorId.startsWith('archive-item-')
        ? anchorId.slice('archive-item-'.length)
        : null;
      if (chapterId) {
        // Desktop: a voyage. The page takes a beat longer the further it
        // goes, eases in and out so the camera can take off and land with it,
        // and the atlas is told where it is heading so it goes straight there.
        const distance = Math.abs(targetY - window.scrollY);
        const duration = voyageSeconds(distance);
        const token = Date.now();
        // The page gliding in, told to the destination's ticket (<html>
        // `data-voyage-to`, then `archive:voyage-end` as it comes to rest):
        // its sign turns into place once the ticket has stopped, not while
        // it still slides under the landing (ArchiveChapter, "The sign
        // turns into place").
        const html = document.documentElement;
        const settle = () => {
          voyageActiveRef.current = false;
          setVoyage((current) => (current?.token === token ? null : current));
          endPassing();
          if (html.dataset.voyageTo === chapterId) {
            delete html.dataset.voyageTo;
            window.dispatchEvent(new CustomEvent('archive:voyage-end', { detail: { id: chapterId } }));
          }
        };
        voyageActiveRef.current = true;
        html.dataset.voyageTo = chapterId;
        setVoyage({ chapterId, duration: duration * 1000, token });
        if (passing) startPassing(target, duration * 1000);
        window.clearTimeout(voyageTimerRef.current);
        voyageTimerRef.current = window.setTimeout(settle, duration * 1000 + 500);
        lenis.scrollTo(targetY, {
          duration,
          easing: voyageEase,
          lock: true,
          onComplete: settle,
        });
        return;
      }
      lenis.scrollTo(targetY, {
        duration: 1.05,
        easing: (progress) => Math.min(1, 1.001 - Math.pow(2, -10 * progress)),
      });
      return;
    }

    window.scrollTo({
      top: targetY,
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [desktopLayout, reduce, startPassing, endPassing]);

  // Pull to tear (desktop tickets, ArchiveChapter): a cover torn away by hand
  // goes on to the next place — the very voyage a place on the atlas takes,
  // asked for only once the face is free. The last ticket goes on to the
  // closing, the page it tears on when scrolled (its top on the viewport's
  // top is where the closing counts as arrived).
  // `focus: false` (a scroll's tear): the page goes on without taking
  // keyboard focus with it.
  const tearAwayFrom = useCallback((index: number, options?: { focus?: boolean }) => {
    const next = orderedCities[index + 1];
    if (next) {
      navigateLivingChapter(`archive-item-${next._id}`, false, options?.focus !== false);
      return;
    }
    const closing = document.querySelector<HTMLElement>('[data-archive-closing]');
    if (!closing) return;
    const targetY = documentTop(closing);
    const lenis = lenisRef.current;
    if (lenis && !reduce) {
      const distance = Math.abs(targetY - window.scrollY);
      lenis.scrollTo(targetY, {
        duration: voyageSeconds(distance),
        easing: voyageEase,
        lock: true,
      });
      return;
    }
    window.scrollTo({ top: targetY, behavior: 'auto' });
  }, [navigateLivingChapter, orderedCities, reduce]);

  // A stop chosen on the atlas (a shield on the map, a group in the tick
  // strip). Going on, the ticket being read is torn first — exactly as the
  // reader's push tears it — and the page sets off only once its face is
  // free (owner, 2026-09-28: 当移走或者点击下一站的时候将会和之前一样撕开票根，
  // 然后前往下一站); ArchiveChapter answers `archive:tear-then` when it has a
  // whole ticket to tear. Going back, or with nothing to tear, the voyage goes
  // at once, as before.
  // Keyboard focus goes with the trip only for a keyboard's click (`focus`,
  // AtlasSign): a mouse's click focused the destination chapter too, and
  // Chrome ringed the whole chapter in lime beside the leg's lime name.
  const navigateFromAtlas = useCallback((chapterId: string, options?: { focus?: boolean }) => {
    const anchorId = `archive-item-${chapterId}`;
    const moveFocus = options?.focus !== false;
    const target = orderedCities.findIndex((city) => city._id === chapterId);
    const from = activeRouteIndex;
    if (desktopLayout && !reduce && !voyageActiveRef.current && from >= 0 && target > from) {
      const section = document.querySelector<HTMLElement>(`[data-archive-chapter][data-chapter-index="${from}"]`);
      const detail: { go: () => void; handled?: boolean } = {
        go: () => navigateLivingChapter(anchorId, false, moveFocus),
      };
      section?.dispatchEvent(new CustomEvent('archive:tear-then', { detail }));
      if (detail.handled) return;
    }
    navigateLivingChapter(anchorId, true, moveFocus);
  }, [activeRouteIndex, desktopLayout, navigateLivingChapter, orderedCities, reduce]);

  // Back to the start: a voyage up the page to the first screen, the same
  // trip a place on the atlas takes down it (a beat longer the further it
  // goes, sine in and out, the wheel held off), not the browser's smooth
  // scroll, which whipped seven thousand pixels past in 1.4 s, up to 366 px a
  // frame. Every chapter on the way is passed. Focus goes to the top of the
  // page's content at once, without a scroll of its own. Without Lenis
  // (reduced motion, a touch screen) it is a jump.
  const backToStart = useCallback(() => {
    const start = document.getElementById('main-content');
    const lenis = lenisRef.current;
    // The start is the first screen — the top of this page's own content.
    const startY = pageRootRef.current ? documentTop(pageRootRef.current) : 0;
    if (!lenis || reduce) {
      window.scrollTo({ top: startY, behavior: 'auto' });
      start?.focus({ preventScroll: true });
      return;
    }
    if (voyageActiveRef.current) return;
    start?.focus({ preventScroll: true });
    const fromY = window.scrollY;
    const duration = voyageSeconds(Math.max(0, fromY - startY));
    const token = Date.now();
    const settle = () => {
      voyageActiveRef.current = false;
      setVoyage((current) => (current?.token === token ? null : current));
      endPassing();
    };
    voyageActiveRef.current = true;
    // The atlas flies out of the archive in one zoom-out on the trip's own
    // clock (RouteAtlas, `beginOutbound`), and the prologue's own scroll
    // glides the planet home to the first screen's corner for the last
    // stretch. The zoom-out has to be done by the time the page reaches the
    // prologue's end (where the dive begins going down): the share of the
    // trip that takes, on the trip's own curve (voyageEase inverted), from
    // the same offsets the scroll sampler uses — a beat early, so the
    // prologue always takes the planet from the pose the dive starts from.
    const atlasSection = desktopAtlasSectionRef.current;
    if (atlasSection && fromY > startY) {
      const prologueEnd = documentTop(atlasSection) - window.innerHeight * ARCHIVE_ENTRY_LEAD;
      const reached = Math.max(0, Math.min(1, (fromY - prologueEnd) / (fromY - startY)));
      const entryShare = Math.max(0.2, Math.min(1, 0.95 * (Math.acos(1 - 2 * reached) / Math.PI)));
      setVoyage({ chapterId: '', duration: duration * 1000, token, outbound: { entryShare } });
    }
    startPassing(null, duration * 1000);
    window.clearTimeout(voyageTimerRef.current);
    voyageTimerRef.current = window.setTimeout(settle, duration * 1000 + 500);
    lenis.scrollTo(startY, {
      duration,
      easing: voyageEase,
      lock: true,
      onComplete: settle,
    });
  }, [reduce, startPassing, endPassing]);

  // Keep the active city tied to the chapter nearest the visual reading line.
  // IntersectionObserver only fires when thresholds are crossed; during a
  // long smooth-scroll it could leave Orlando on screen while the atlas still
  // reported Miami. A single rAF-throttled scroll sampler makes the chapter,
  // route rail and map camera share one source of truth.
  useEffect(() => {
    // The full-screen story owns the viewport while open. Freezing the atlas
    // index here prevents scrollbar/overlay geometry changes from nominating a
    // neighbouring chapter behind the cover.
    if (storyActive) return;
    let scrollFrame = 0;
    let measureFrame = 0;
    let lastVisualFrameAt = 0;
    let visualFrameBudget = 0;
    let disposed = false;
    const trackedIds = useLivingAtlas
      ? routeStops.map((stop) => stop.id)
      : orderedCities.map((city) => city._id);
    const queryTracked = () =>
      trackedIds.flatMap((id, chapterIndex) => {
        const element = document.getElementById(
          `${desktopLayout ? 'archive-item-' : 'mobile-archive-item-'}${id}`,
        );
        if (!element) return [];
        return [{ element, chapterIndex }];
      });
    let anchors: { id: string; documentY: number; chapterIndex: number }[] = [];
    // Where the reader was on the chapter timeline at the last sample, when
    // they were inside it (between the first chapter's centre and the
    // last's); null anywhere else. A window resize keeps the raw scrollY,
    // which after the relayout is somewhere else in the story — on a shorter
    // window, chapters past where the reader was (their tickets torn, the map
    // flown on). `heldPosition` carries this across the resize so the page
    // is put back at the same point of the story (see measureAnchors).
    let readingAt: number | null = null;
    let heldPosition: number | null = null;
    let atlasEntryDocumentY: number | null = null;
    let prologueDocumentY: number | null = null;
    const writeProgress = (value: MotionValue<number>, next: number) => {
      const current = value.get();
      // Preserve every chapter centre, not only 0/1, and discard only changes
      // below roughly a fifth of a route pixel.
      const nearestChapter = Math.round(next);
      const normalized = Math.abs(next - nearestChapter) < 0.0002 ? nearestChapter : next;
      if (Math.abs(current - normalized) < 0.0002) return;
      value.set(normalized);
    };

    const applyAtlasEntry = () => {
      if (!desktopLayout) {
        writeProgress(atlasEntryProgress, 1);
        return;
      }
      if (atlasEntryDocumentY == null) return;
      const viewportHeight = Math.max(1, window.innerHeight);
      const raw = archiveEntryProgress(window.scrollY, atlasEntryDocumentY, viewportHeight);
      writeProgress(atlasEntryProgress, reduce ? (raw > 0 ? 1 : 0) : raw);
      if (prologueDocumentY != null) {
        writeProgress(
          prologueProgress,
          prologueProgressAt(window.scrollY, prologueDocumentY, atlasEntryDocumentY, viewportHeight),
        );
      }
    };

    const applyActiveChapter = () => {
      if (!anchors.length || storyOpenRef.current) return;

      applyAtlasEntry();

      const viewportHeight = window.innerHeight;
      const scrollTop = window.scrollY;
      const readingLine = viewportHeight * (desktopLayout ? 0.48 : 0.56);
      const validTop = viewportHeight * 0.18;
      const validBottom = viewportHeight * (desktopLayout ? 0.86 : 0.90);
      let nearest: { id: string; viewportY: number } | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      let nearestOutsideWindow: { id: string; viewportY: number } | null = null;
      let nearestOutsideDistance = Number.POSITIVE_INFINITY;

      // `archiveProgress` is the only visual chapter clock on both layouts.
      // Integer positions are chapter centres; the interval between them is
      // preserved as a continuous decimal so geography, route, coordinates,
      // halos and photographic focus can all sample the exact same moment.
      const timelineY = scrollTop + readingLine;
      let fractionalChapter = 0;
      if (timelineY >= anchors.at(-1)!.documentY) {
        fractionalChapter = anchors.at(-1)!.chapterIndex;
      } else if (timelineY <= anchors[0].documentY) {
        fractionalChapter = anchors[0].chapterIndex;
      } else if (timelineY > anchors[0].documentY) {
        for (let index = 0; index < anchors.length - 1; index += 1) {
          const fromAnchor = anchors[index];
          const toAnchor = anchors[index + 1];
          if (timelineY > toAnchor.documentY) continue;
          const span = Math.max(1, toAnchor.documentY - fromAnchor.documentY);
          const local = Math.max(0, Math.min(1, (timelineY - fromAnchor.documentY) / span));
          fractionalChapter = fromAnchor.chapterIndex +
            (toAnchor.chapterIndex - fromAnchor.chapterIndex) * local;
          break;
        }
      }
      writeProgress(archiveProgress, reduce ? Math.round(fractionalChapter) : fractionalChapter);
      readingAt = timelineY >= anchors[0].documentY - 1 && timelineY <= anchors.at(-1)!.documentY + 1
        ? fractionalChapter
        : null;

      if (useLivingAtlas) {
        const activeAnchor = anchors.reduce((nearestAnchor, candidate) =>
          Math.abs(candidate.chapterIndex - fractionalChapter) <
          Math.abs(nearestAnchor.chapterIndex - fractionalChapter)
            ? candidate
            : nearestAnchor,
        );
        if (activeAnchor) {
          const canonicalId = activeAnchor.id.startsWith('mobile-archive-item-')
            ? activeAnchor.id.slice('mobile-'.length)
            : activeAnchor.id;
          commitActiveArchiveId(canonicalId);
        }
        return;
      }

      for (const anchor of anchors) {
        const viewportY = anchor.documentY - scrollTop;
        const distance = Math.abs(viewportY - readingLine);
        if (distance < nearestOutsideDistance) {
          nearestOutsideDistance = distance;
          nearestOutsideWindow = { id: anchor.id, viewportY };
        }
        if (viewportY <= validTop || viewportY >= validBottom) continue;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = { id: anchor.id, viewportY };
        }
      }

      if (!nearest) {
        const firstY = anchors[0].documentY - scrollTop;
        const last = anchors.at(-1);
        const lastY = last ? last.documentY - scrollTop : Number.POSITIVE_INFINITY;
        if (firstY >= validBottom) {
          commitActiveArchiveId(null);
          return;
        } else if (last && lastY <= validTop) {
          const canonicalLast = last.id.startsWith('mobile-archive-item-')
            ? last.id.slice('mobile-'.length)
            : last.id;
          commitActiveArchiveId(canonicalLast);
          return;
        }
        nearest = nearestOutsideWindow;
        nearestDistance = nearestOutsideDistance;
      }

      if (!nearest) return;

      const canonicalId = nearest.id.startsWith('mobile-archive-item-')
        ? nearest.id.slice('mobile-'.length)
        : nearest.id;
      const current = activeArchiveIdRef.current;
      if (current === canonicalId) return;

      // Keep the current city through tiny trackpad reversals or touch bounce.
      // A challenger must be meaningfully closer to the reading line unless the
      // current anchor has already left the valid window.
      if (current) {
        const currentAnchor = anchors.find((anchor) => {
          const id = anchor.id.startsWith('mobile-archive-item-')
            ? anchor.id.slice('mobile-'.length)
            : anchor.id;
          return id === current;
        });
        if (currentAnchor) {
          const currentViewportY = currentAnchor.documentY - scrollTop;
          const currentIsValid = currentViewportY > validTop && currentViewportY < validBottom;
          const currentDistance = Math.abs(currentViewportY - readingLine);
          if (currentIsValid && nearestDistance + (desktopLayout ? 36 : 72) >= currentDistance) return;
        }
      }

      commitActiveArchiveId(canonicalId);
    };

    const runActiveChapter = (time: number) => {
      // Cap the heavy visual clock near 60Hz without a fixed 14.5ms skip gate.
      // Carrying the fractional budget prevents 90/120/144Hz displays from
      // accidentally falling into a visibly uneven 45/48fps cadence.
      if (!reduce) {
        const elapsed = lastVisualFrameAt ? Math.min(34, time - lastVisualFrameAt) : 1000 / 60;
        lastVisualFrameAt = time;
        visualFrameBudget += elapsed;
        if (visualFrameBudget < 1000 / 60) {
          scrollFrame = requestAnimationFrame(runActiveChapter);
          return;
        }
        visualFrameBudget %= 1000 / 60;
      }
      scrollFrame = 0;
      applyActiveChapter();
    };

    const syncActiveChapter = () => {
      if (storyOpenRef.current) return;
      // The opener owns the first part of the page. Avoid scheduling an archive
      // sampler on every WalkIn frame before the first chapter is even near the
      // viewport; when returning upward, also restore the atlas overview early.
      if (
        anchors.length > 0 &&
        window.scrollY + window.innerHeight * 1.15 < anchors[0].documentY
      ) {
        applyAtlasEntry();
        writeProgress(archiveProgress, 0);
        commitActiveArchiveId(null);
        return;
      }
      if (!scrollFrame) scrollFrame = requestAnimationFrame(runActiveChapter);
    };
    // Lenis itself runs in rAF. Queueing the sampler once more lets multiple
    // high-refresh events collapse into the latest scroll position rather than
    // making every intermediate event redraw the map and all six chapters.
    const syncSmoothChapter = syncActiveChapter;
    const measureAnchors = () => {
      if (measureFrame) cancelAnimationFrame(measureFrame);
      measureFrame = requestAnimationFrame(() => {
        measureFrame = 0;
        if (disposed) return;
        atlasEntryDocumentY = desktopAtlasSectionRef.current
          ? documentTop(desktopAtlasSectionRef.current)
          : null;
        prologueDocumentY = desktopStageRef.current
          ? documentTop(desktopStageRef.current)
          : null;
        anchors = queryTracked().flatMap(({ element, chapterIndex }) => {
          if (element.offsetWidth <= 0 || element.offsetHeight <= 0) return [];
          return [{
            id: element.id,
            chapterIndex,
            // Desktop chapter centres cross the 48% reading line exactly.
            // offsetTop ignores Framer's visual transforms, so this optical
            // clock cannot drift with the photograph's entry/parallax. Mobile
            // keeps its earlier image-led anchor as a regression-safe layout.
            documentY: archiveChapterAnchorY(element, desktopLayout),
          }];
        });
        // A resized window puts the reader back where they were in the
        // story, before anything samples the new layout: straight there, on
        // the new anchors, never played. The chapter clock then reads what
        // it read before, so no ticket tears and the map stays put.
        const held = heldPosition;
        heldPosition = null;
        const lenisNow = lenisRef.current;
        if (held != null && desktopLayout && lenisNow && !storyOpenRef.current && anchors.length) {
          let from = 0;
          anchors.forEach((anchor, index) => {
            if (anchor.chapterIndex <= held) from = index;
          });
          const start = anchors[from];
          const end = anchors[Math.min(anchors.length - 1, from + 1)];
          const local = end.chapterIndex > start.chapterIndex
            ? (held - start.chapterIndex) / (end.chapterIndex - start.chapterIndex)
            : 0;
          const targetY = start.documentY + (end.documentY - start.documentY) * Math.max(0, Math.min(1, local)) -
            window.innerHeight * 0.48;
          if (Math.abs(targetY - window.scrollY) > 1) lenisNow.scrollTo(targetY, { immediate: true, force: true });
        }
        if (scrollFrame) cancelAnimationFrame(scrollFrame);
        scrollFrame = 0;
        applyActiveChapter();
      });
    };

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measureAnchors);
    let measuredViewportWidth = window.innerWidth;
    const handleViewportResize = () => {
      const nextWidth = window.innerWidth;
      // Mobile browser chrome changes the visual viewport height while the
      // document geometry itself stays put. Re-measuring every address-bar
      // tick would move the chapter timeline under the user's finger.
      if (useLivingAtlas && !desktopLayout && Math.abs(nextWidth - measuredViewportWidth) < 1) return;
      measuredViewportWidth = nextWidth;
      // Kept for the re-measure: a burst of resize events keeps the first.
      if (heldPosition == null) heldPosition = readingAt;
      measureAnchors();
    };
    queryTracked().forEach(({ element }) => resizeObserver?.observe(element));
    measureAnchors();
    document.fonts?.ready.then(() => {
      if (!disposed) measureAnchors();
    });
    const lenis = lenisRef.current;
    if (lenis) lenis.on('scroll', syncSmoothChapter);
    else window.addEventListener('scroll', syncActiveChapter, { passive: true });
    window.addEventListener('resize', handleViewportResize, { passive: true });
    return () => {
      disposed = true;
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      if (measureFrame) cancelAnimationFrame(measureFrame);
      resizeObserver?.disconnect();
      if (lenis) lenis.off('scroll', syncSmoothChapter);
      else window.removeEventListener('scroll', syncActiveChapter);
      window.removeEventListener('resize', handleViewportResize);
    };
  }, [orderedCities, routeStops, desktopLayout, storyActive, archiveProgress, atlasEntryProgress, prologueProgress, commitActiveArchiveId, reduce, useLivingAtlas]);

  useEffect(() => {
    const isOverlayOpen = storyActive;
    storyOpenRef.current = isOverlayOpen;
    document.body.style.backgroundColor = '#282c20';
    // Pause Lenis while the overlay is up so its own overflow-y-auto scrolls
    // natively; resume on close.
    if (isOverlayOpen) {
      const lockedScrollY = storyScrollYRef.current || window.scrollY;
      storyScrollYRef.current = lockedScrollY;
      // Measured before the stop (openCollection usually has already).
      holdStoryGutter();
      lenisRef.current?.stop();
      if (desktopLayout) {
        // Desktop: the page stays exactly where it is under the overlay —
        // sticky atlas, scroll-driven covers and all — so the close simply
        // uncovers it. Lenis, stopped, already puts `overflow: clip` on
        // <html>; that stops the body's own overflow (the site's
        // `overflow-x: hidden`, which computes y to `auto`) propagating to the
        // viewport and would make the body its own scroll container, dropping
        // the sticky atlas out of view. `clip` on the body never creates a
        // scroll container, so the sticky holds. (A fixed body sat the page
        // at the top, blanked the archive and replayed the scroll on close.)
        document.body.style.overflow = 'clip';
      } else {
        document.body.style.position = 'fixed';
        document.body.style.inset = `-${lockedScrollY}px 0 auto`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
      }
    } else {
      document.body.style.position = '';
      document.body.style.inset = '';
      document.body.style.width = '';
      // Back to the site's own `overflow-x: hidden` (Layout.astro), never an
      // inline `auto`: `auto` in x hands the viewport a sideways scroll, and a
      // trackpad swipe or a drag to the edge slid the whole page with it.
      document.body.style.overflow = '';
      releaseStoryGutter();
      if (storyScrollYRef.current > 0 && Math.abs(window.scrollY - storyScrollYRef.current) > 1) {
        // 'instant', never left to the stylesheet: when html carried
        // `scroll-behavior: smooth`, the phone layout (fixed body) showed the
        // top of the page, then smooth-scrolled 600ms back down. The page
        // must land where the reader left it, in one frame.
        window.scrollTo({ top: storyScrollYRef.current, behavior: 'instant' });
        // The body lock moves the native window to the top while Lenis is
        // stopped. Reconcile Lenis' internal target before restarting it, or
        // a keyboard-opened Story can resume toward that stale top position.
        lenisRef.current?.scrollTo(storyScrollYRef.current, {
          immediate: true,
          force: true,
        });
      }
      lenisRef.current?.start();
    }
    return () => {
      if (isOverlayOpen) {
        document.body.style.position = '';
        document.body.style.inset = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        releaseStoryGutter();
        // Only while this page is still the document: unmounted by a
        // navigation (Back with a story open), this scroll landed on the NEXT
        // page, which the router then recorded as its own position (/about
        // came back at its foot).
        if (pageRootRef.current?.isConnected && Math.abs(window.scrollY - storyScrollYRef.current) > 1) {
          window.scrollTo({ top: storyScrollYRef.current, behavior: 'instant' });
        }
      }
      document.body.style.overflow = '';
      document.body.style.backgroundColor = '';
    };
  }, [desktopLayout, storyActive, holdStoryGutter, releaseStoryGutter]);

  // Site accent is a single fixed electric lime, defined once via the
  // @property initial values in global.css (--accent-r/g/b = 210/255/0);
  // every descendant reads it with rgb(var(--accent-r), ...). The former
  // per-chapter retint system is gone — nothing sets these vars at runtime.

  return (
    <>
      {/* `overflow-x-clip`: the atlas canvas and its page-ground strip bleed
          past the right edge on purpose (their geometry is derived, see
          RouteAtlas), and unclipped that bleed made the page 40px wider than
          the window — a sideways swipe or a drag to the edge slid everything
          left. `clip`, unlike `hidden`, is not a scroll container, so the
          sticky atlas still pins to the viewport. */}
      <div
        ref={pageRootRef}
        className="min-h-screen font-sans relative overflow-x-clip bg-[#282c20] text-[#F4F4ED]"
        inert={storyActive}
        aria-hidden={storyActive}
      >
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] inline-flex min-h-11 translate-y-[-160%] items-center rounded-full bg-[#F4F4ED] px-5 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-[#171b15] transition-transform duration-200 focus:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
        >
          Skip to archive
        </a>
        <h1 className="sr-only">Ryan Xu — Visual Archive</h1>

        {/* Background canvas removed — a clean solid-dark canvas; the "wow"
             comes from content (monumental type, image reveals), not an ambient
             backdrop. */}

        {/* ── Nav — signature font + pill buttons ── */}
        <nav
          aria-label="Primary navigation"
          data-site-nav
          className="fixed top-0 left-0 w-full z-50 px-6 py-5 md:py-8 md:px-12 flex justify-between items-center bg-transparent"
          style={{
            // Keeps its width while a story holds the scrollbar's gutter.
            width: 'calc(100% - var(--story-gutter, 0px))',
            paddingTop: 'max(clamp(1.25rem, 2.1vw, 2.25rem), env(safe-area-inset-top))',
            paddingLeft: 'max(clamp(1.5rem, 3.35vw, 3rem), env(safe-area-inset-left))',
            paddingRight: 'max(clamp(1.5rem, 3.35vw, 3rem), env(safe-area-inset-right))',
          }}
        >
          {/* The fixed layer needs a floor. Without one the pills sat directly
              on the archive's own type — the masthead's "…distilled lens." and
              each chapter's dateline passed straight through them. The scrim
              waits for the opening to reveal so the cover is untouched. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[clamp(5.5rem,10vh,7.75rem)] bg-[linear-gradient(180deg,rgba(40,44,32,0.72)_0%,rgba(40,44,32,0.4)_56%,transparent_100%)] transition-opacity duration-700"
            // Not over the opening film: it would print as a band on it.
            style={{ opacity: navPillsVisible && !reelCovering ? 1 : 0 }}
          />
          <motion.button
            type="button"
            aria-label="Ryan Xu — back to top"
            onClick={() => {
              setSelectedCollection(null);
              // The top is the first screen (his name, the globe) — the start
              // of the archive.
              const start = pageRootRef.current ? documentTop(pageRootRef.current) : 0;
              window.scrollTo({ top: start, behavior: reduce ? 'auto' : 'smooth' });
            }}
            // No hover scale: the wordmark only fades to 0.6, as it does on
            // every other page (.nav-wordmark). A press gives 3%.
            whileTap={reduce ? undefined : { scale: 0.97 }}
            transition={{ duration: DUR.flick, ease: EASE.arrive }}
            className="nav-wordmark flex min-h-11 min-w-11 shrink-0 items-center gap-3 py-2 font-serif text-lg font-medium uppercase leading-none tracking-[0.1em] text-[#F4F4ED] mix-blend-difference hover:opacity-60 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00] md:text-[21px]"
          >
            {/* Slides down from above once the opening reveals (body.walkin-in,
                 flipped by WalkIn) — the reference's header entrance. */}
            <span className="block overflow-hidden">
              <span className="walkin-nav block">Ryan&nbsp;Xu</span>
            </span>
          </motion.button>

          <div
            className="flex shrink-0 items-center gap-2 transition-opacity duration-500 max-[379px]:gap-1.5 md:gap-3"
            aria-hidden={!navPillsVisible}
            inert={!navPillsVisible}
            style={{
              opacity: navPillsVisible ? 1 : 0,
              pointerEvents: navPillsVisible ? 'auto' : 'none',
            }}
          >
              {/* The same pills as Nav.tsx: background only on hover
                  (.nav-pill), no scale, a 3% press. */}
              <motion.a
                whileTap={reduce ? undefined : { scale: 0.97 }}
                transition={{ duration: DUR.flick, ease: EASE.arrive }}
                href={atlasHref}
                data-astro-prefetch="hover"
                tabIndex={navPillsVisible ? 0 : -1}
                className="nav-pill inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-full border border-white/10 bg-[#171b15]/80 px-3.5 max-[379px]:min-w-[3.25rem] max-[379px]:px-2.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-white shadow-[0_10px_34px_rgba(7,9,6,0.18)] hover:bg-[#171b15]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00] md:min-w-[5.5rem] md:bg-[#171b15]/60 md:px-6 md:text-[10px] md:backdrop-blur-xl md:hover:bg-[#171b15]/75"
              >
                Map
              </motion.a>

              {/* MAP · NOTES · ABOUT — NOTES once a note is published
                  (src/lib/notesNav, decided at build time). */}
              {NOTES_LIVE && (
                <motion.a
                  whileTap={reduce ? undefined : { scale: 0.97 }}
                  transition={{ duration: DUR.flick, ease: EASE.arrive }}
                  href="/notes"
                  data-astro-prefetch="hover"
                  tabIndex={navPillsVisible ? 0 : -1}
                  className="nav-pill inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-full border border-white/10 bg-[#171b15]/80 px-3.5 max-[379px]:min-w-[3.25rem] max-[379px]:px-2.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-white shadow-[0_10px_34px_rgba(7,9,6,0.18)] hover:bg-[#171b15]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00] md:min-w-[5.5rem] md:bg-[#171b15]/60 md:px-6 md:text-[10px] md:backdrop-blur-xl md:hover:bg-[#171b15]/75"
                >
                  Notes
                </motion.a>
              )}

              <motion.a
                whileTap={reduce ? undefined : { scale: 0.97 }}
                transition={{ duration: DUR.flick, ease: EASE.arrive }}
                href="/about"
                tabIndex={navPillsVisible ? 0 : -1}
                className="nav-pill inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-full border border-white/10 bg-[#171b15]/80 px-3.5 max-[379px]:min-w-[3.25rem] max-[379px]:px-2.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-white shadow-[0_10px_34px_rgba(7,9,6,0.18)] hover:bg-[#171b15]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00] md:min-w-[5.5rem] md:bg-[#171b15]/60 md:px-6 md:text-[10px] md:backdrop-blur-xl md:hover:bg-[#171b15]/75"
              >
                About
              </motion.a>
          </div>
        </nav>

        {/* ── The opening — the original paper-to-olive entrance develops the
             quiet editorial cover, then grows it to full bleed. ── */}
        {/* Compact screens keep the WalkIn opener. On desktop the globe
            prologue (inside the atlas section) replaces it; CSS hides it so the
            server and every client render the same tree. */}
        <div className="lg:hidden">
          <WalkIn collections={walkInCollections} places={walkInCollections.length} />
        </div>

        {/* One responsive archive tree at a time. This keeps Mapbox and every
             motion observer from mounting twice behind CSS-only visibility. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="relative z-10 focus:outline-none"
          data-story-under={selectedCollection && !storyClosing ? 'true' : undefined}
        >
          {useLivingAtlas ? (
            <LivingAtlasStory
              stops={routeStops}
              activeIndex={livingAtlasActiveIndex}
              chapterProgress={archiveProgress}
              mobile={!desktopLayout}
              reducedMotion={!!reduce}
              paused={atlasPaused}
              atlas={
                <DeferredRouteAtlas
                  stops={routeStops}
                  activeIndex={livingAtlasActiveIndex}
                  chapterProgress={archiveProgress}
                  reducedMotion={!!reduce}
                  mobile={!desktopLayout}
                  paused={atlasPaused}
                  presentation="living"
                />
              }
              onOpen={(stop) => {
                const collection = orderedCities.find((city) => city._id === stop.id);
                if (collection) openCollection(collection);
              }}
              onNavigate={navigateLivingChapter}
            />
          ) : desktopLayout ? (
          /* ── Desktop Main — full-height geographic atlas + archive chapters ── */
          <div
            ref={desktopStageRef}
            className="relative pb-8 pt-24 lg:pt-0"
            style={{ ['--prologue-h' as never]: PROLOGUE_HEIGHT }}
          >
          <GlobePrologue years={archiveYearSpan} progress={prologueProgress} covered={reelCovering} />
          {/* Where the archive proper begins: the entrance score is measured
              from here, exactly as it was from the section's top before the
              prologue was laid over the atlas. */}
          <div
            ref={desktopAtlasSectionRef}
            data-archive-start
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 h-px"
            style={{ top: 'var(--prologue-h)' }}
          />
          {/* The blurred active-chapter photo backdrop was removed — no photo
               used as background anywhere; the contour atmosphere carries it. */}

          <div className="relative flex w-full flex-col lg:flex-row lg:items-start lg:overflow-visible">
            {/* A full-bleed Mapbox field anchors the archive. The photo column
                 overlaps its soft seam so map and work read as one editorial
                 spread instead of two adjacent widgets. */}
            {/* `opening-atlas`: landing A lets the globe rise out of the dark
                behind the words (global.css, "The opening film"). */}
            <aside className="opening-atlas sticky top-0 z-10 hidden h-screen h-[100dvh] w-[78%] shrink-0 lg:block">
              <DeferredRouteAtlas
                stops={routeStops}
                activeIndex={routeStops.findIndex((stop) => stop.id === orderedCities[activeRouteIndex]?._id)}
                chapterIds={orderedChapterIds}
                chapterProgress={archiveProgress}
                entryProgress={atlasEntryProgress}
                prologueProgress={prologueProgress}
                reducedMotion={!!reduce}
                engagedChapterId={engagedChapterId}
                paused={atlasPaused}
                voyage={voyage}
                onEngage={setEngagedChapterId}
                onNavigate={navigateFromAtlas}
                eager={atlasEager}
                holdReveal={reelCovering && !reelFramed}
                engage={atlasEager && reelCovering}
                covered={reelCovering}
              />
              {/* The covers' dock: each chapter's cover rides here, on the
                  atlas, beside its place's shield (ArchiveChapter portals it
                  in; src/lib/coverDock.ts places it every camera frame). On
                  the atlas's own box, so it pins, releases and recedes under
                  a story with the map it is attached to. */}
              <div ref={setDockHost} className="archive-dock-host" />
            </aside>

            {/* The atlas does not stop on a section boundary. Near the end of
                 the archive a long, page-coloured veil rises through the sticky
                 map, so geography releases into the site canvas before the
                 sticky layer unpins. It sits above the map and below the work. */}
            <div
              aria-hidden="true"
              className="route-atlas-release pointer-events-none absolute -bottom-px inset-x-0 z-[15] hidden h-[52svh] lg:block"
            />

            {/* The chapters' rail. On the desktop a chapter is its name and
                 its lede, set in a rail down the right of the page; its cover
                 rides on the atlas beside its place's shield (the dock, above).
                 The column still spans the map's right-hand part, so it lets
                 the pointer through to the covers and shields under it: only
                 the rails take it. */}
            <div data-archive-column className="pointer-events-none relative z-20 flex min-w-0 flex-1 flex-col overflow-visible px-6 md:px-12 lg:-ml-[36%] lg:w-[58%] lg:flex-none lg:pl-0 lg:pr-12 lg:pt-[calc(var(--prologue-h)+46svh)] xl:pr-16">
              {/* Where "Selected Works" stood: the first screen says what the
                  archive is, so the heading is for screen readers only. The
                  column's top is set so the globe's dive ends as chapter 1's
                  rail reaches the reading line (its centre a screen below the
                  archive's start, as the first plate's was). */}
              <h2 className="sr-only font-ui">Selected Works</h2>

              <div>
                {sections.map((section) => (
                    <section
                      key={section.key}
                      aria-label={section.region ? `Region: ${section.region}` : undefined}
                    >
                      <div>
                            {section.cities.map((city) => {
                              const index = orderedCities.indexOf(city);
                              const domId = `archive-item-${city._id}`;
                              return (
                                <ArchiveChapter
                                  key={city._id}
                                  id={domId}
                                  collection={city}
                                  isActive={activeArchiveId === domId}
                                  onClick={() => openCollection(city)}
                                  index={index}
                                  chapterIndex={index}
                                  chapterTotal={orderedCities.length}
                                  padStocks={chapterPadStocks[index]}
                                  chapterProgress={archiveProgress}
                                  preloadImageUrls={chapterPreloadUrls[index]}
                                  prioritizeImage={
                                    activeRouteIndex < 0
                                      ? index === 0
                                      : Math.abs(index - activeRouteIndex) <= 1
                                  }
                                  onEngagementChange={setEngagedChapterId}
                                  highlighted={engagedChapterId === city._id}
                                  sharedLayoutId={
                                    selectedCollection?._id === city._id ? storySharedLayoutId : undefined
                                  }
                                  variant={index === FEATURE_CHAPTER_INDEX ? 'feature' : 'cover'}
                                  desktopMotion
                                  dockHost={dockHost}
                                  regionTab={regionTabs.get(city._id) ?? null}
                                  /* Pull to tear: never while a voyage is
                                     already under way — the cover is then
                                     only a click. */
                                  onTearAway={voyage ? undefined : (options) => tearAwayFrom(index, options)}
                                  nextStop={orderedCities[index + 1]
                                    ? {
                                        name: orderedCities[index + 1].name.trim(),
                                        number: index + 2,
                                        region: orderedCities[index + 1].region?.trim() || undefined,
                                        slug: orderedCities[index + 1].slug,
                                      }
                                    : null}
                                />
                              );
                            })}
                      </div>
                    </section>
                ))}
              </div>
            </div>
          </div>
          </div>

          ) : (
          /* ── Mobile Main — the same route narrative, recomposed vertically ── */
          <div className="mobile-route-story relative isolate bg-[#282c20]">
            <h2 className="sr-only font-ui">Selected Works</h2>
            <div className="sticky top-0 z-0 h-[100dvh] min-h-[100svh]">
              <DeferredRouteAtlas
                stops={routeStops}
                activeIndex={routeStops.findIndex((stop) => stop.id === orderedCities[activeRouteIndex]?._id)}
                reducedMotion={!!reduce}
                mobile
                paused={storyActive}
              />
            </div>

            <div className="mobile-route-story__scenes relative z-20">
              <div className="mobile-route-story__lead-in" aria-hidden="true" />
              {sections.flatMap((section) =>
                section.cities.map((city) => {
                  const index = orderedCities.indexOf(city);
                  return (
                    <div key={city._id} className="mobile-route-story__scene relative">
                      {section.showHeader && section.region && section.cities[0]?._id === city._id && (
                        <div className="mobile-route-region pointer-events-none absolute left-5 top-[12svh] flex items-center gap-3 font-ui text-[9px] uppercase tracking-[0.1em] text-white/56">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#D2FF00]" />
                          Region · {section.region}
                        </div>
                      )}
                      <div className="mobile-route-card ml-auto w-[88vw] max-w-[620px] pr-4">
                        <ArchiveChapter
                          id={mobileCityDomId(city)}
                          collection={city}
                          isActive={activeArchiveId === cityDomId(city)}
                          onClick={() => openCollection(city)}
                          index={index}
                          chapterIndex={index}
                          chapterProgress={archiveProgress}
                          preloadImageUrls={chapterPreloadUrls[index]}
                          prioritizeImage={
                            activeRouteIndex < 0
                              ? index === 0
                              : Math.abs(index - activeRouteIndex) <= 1
                          }
                          variant="cover"
                        />
                      </div>
                    </div>
                  );
                }),
              )}
              <div className="mobile-route-story__release route-atlas-release--mobile" aria-hidden="true" />
            </div>
          </div>
          )}
        </main>

        {/* ── Archive end-cap — the page's closing punctuation. Desktop: the
             last ticket tears and the ending pulls back from its face to the
             proof sheet of the whole issue (the same chapters, in the same
             order, the stubs were printed from); compact screens keep the
             quiet line. ── */}
        {desktopLayout ? (
          <ArchiveClosing
            collections={orderedCities}
            onBackToStart={backToStart}
            onOpenStory={openStoryFromClosing}
          />
        ) : (
        <div className="flex flex-col items-center gap-4 pb-16 pt-8 text-center opacity-70">
          <div
            className="h-1 w-1 rounded-full"
            style={{ background: 'rgba(244, 244, 237, 0.72)' }}
          />
          <span className="font-ui text-[10px] uppercase tracking-[0.1em] text-white/72">
            {String(orderedCities.length).padStart(2, '0')} / {String(orderedCities.length).padStart(2, '0')} · Archive complete
          </span>
          <button
            type="button"
            onClick={backToStart}
            className="min-h-11 font-ui text-[9px] uppercase tracking-[0.1em] text-[#D2FF00]/82 transition-colors hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
          >
            Back to the start ↑
          </button>
        </div>
        )}

      </div>

      {/* ── Collection detail overlay (MagazineLayout) ── */}
      <AnimatePresence onExitComplete={finishStoryClose}>
        {selectedCollection && (
          <MagazineLayout
            collection={selectedCollection}
            allCollections={activeCollections}
            onSelectCollection={selectCollectionWithinStory}
            onClose={closeCollection}
            returnFocusElement={storyReturnFocusRef.current}
            canonicalUrl={selectedCollection.slug ? `/works/${selectedCollection.slug}` : undefined}
            entryMode={storySharedLayoutId ? 'shared-photo' : 'cover'}
            sharedLayoutId={storySharedLayoutId}
            sharedImageUrl={storySharedLayoutId ? storySharedImageUrlRef.current : undefined}
            onEntryReady={storySharedLayoutId ? focusStoryEntry : undefined}
            /* Desktop only: the mobile composition has no plate to grow from
               and locks the body differently; its route cards keep the cover
               they have. */
            entryOrigin={desktopLayout ? plateOriginRef.current ?? undefined : undefined}
            homeStubFor={desktopLayout ? homeStubFor : undefined}
          />
        )}
      </AnimatePresence>
    </>
  );
}
