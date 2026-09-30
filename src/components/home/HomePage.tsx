import {
  lazy,
  memo,
  Suspense,
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import type { Collection } from '../../types';
import ArchiveChapter from './ArchiveChapter';
import ArchiveClosing, { type ClosingStoryRequest } from './ArchiveClosing';
import EntranceIntro from './EntranceIntro';
import ExplorerControls, { type ExplorerPlace } from './ExplorerControls';
import MagazineLayout, { photoOrigin, readStubMarks, type PlateOrigin, type PlateStub } from './MagazineLayout';
import type { AtlasFlight, RouteStop } from './RouteAtlas';
import { ARCHIVE_ENTRANCE_PHASES, entrancePhase } from '../../lib/archiveEntrance';
import { storyFrames } from '../../lib/storyPlan';
import { TICKET_STOCK } from '../../lib/ticketStock';
import { activeChapters, chapterSections } from '../../lib/chapterOrder';
import { chapterPoint } from '../../lib/geo';
import { ARRIVAL, archiveTicketH, coverDock, coverOf, coverRatioOf } from '../../lib/coverDock';
import { signLines } from '../../lib/routeShield';
import { DUR, DUR_MS, EASE, bezierFn } from '../../lib/motion';
import { ARRIVAL_EASE, ARRIVAL_SECONDS, distinctRegions } from '../../lib/boardingPass';
import { NOTES_LIVE } from '../../lib/notesNav';
import { OPENING_EVENT, type OpeningDetail } from '../../lib/openingFilm';
import {
  ARRIVAL_INERT_MS,
  ATLAS_IDLE_EVENT,
  ENTRY_LANDED_EVENT,
  EXPLORE_EVENT,
  EXPLORER_START,
  STUB_LANDED_EVENT,
  STUB_WAIT_MS,
  announceExplorer,
  entryLandsAt,
  setEntryLandsAt,
  explore,
  neighbour,
  phoneCard,
  stopOne,
  type ExploreRequest,
  type ExplorerAction,
  type ExplorerEffect,
  type ExplorerState,
} from '../../lib/explorer';
import { recentreShown, recentreTarget } from '../../lib/explorerDrift';
import { ENTRY, ENTRY_FINISH, ENTRY_SPAN, finishEntry as finishEntryPlan } from '../../lib/explorerCamera';

// Keep parsing separate from mounting. The handoff can warm these chunks while
// the opening is settling without creating Mapbox's WebGL context or mounting
// the story overlay before either one is needed.
const loadRouteAtlas = () => import('./RouteAtlas');
const arrivalCurve = bezierFn(ARRIVAL_EASE);
const RouteAtlas = lazy(loadRouteAtlas);

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
  'washington, dc': [-77.0369, 38.9072],
  'washington dc': [-77.0369, 38.9072],
  'washington, d.c.': [-77.0369, 38.9072],
  'district of columbia': [-77.0369, 38.9072],
  baltimore: [-76.6122, 39.2904],
};

// Reduced motion's one cut onto the explorer (HomePage, the hand-over): once
// the map is still after the entry has landed (ATLAS_IDLE_EVENT) and the
// cover in hand's print is decoded — never longer than STILL_CAP_MS.
// Returns a cancel.
const STILL_CAP_MS = 2500;
function holdUntilStill(then: () => void): () => void {
  let over = false;
  let idle = false;
  let decoded = false;
  let raf = 0;
  const stop = () => {
    over = true;
    window.clearTimeout(cap);
    cancelAnimationFrame(raf);
    window.removeEventListener(ATLAS_IDLE_EVENT, onIdle);
    window.removeEventListener(ENTRY_LANDED_EVENT, onLanded);
  };
  const finish = () => {
    if (over) return;
    stop();
    then();
  };
  const check = () => {
    if (idle && decoded) finish();
  };
  function onIdle() {
    idle = true;
    check();
  }
  function onLanded() {
    let frames = 0;
    const look = () => {
      raf = 0;
      if (over) return;
      const img = document.querySelector<HTMLImageElement>('.archive-dock[data-at] .archive-photo-frame img');
      if (!img && frames < 30) {
        frames += 1;
        raf = requestAnimationFrame(look);
        return;
      }
      const done = () => {
        decoded = true;
        check();
      };
      if (!img || typeof img.decode !== 'function') {
        done();
        return;
      }
      img.decode().then(done, done);
    };
    raf = requestAnimationFrame(look);
  }
  const cap = window.setTimeout(finish, STILL_CAP_MS);
  window.addEventListener(ATLAS_IDLE_EVENT, onIdle);
  window.addEventListener(ENTRY_LANDED_EVENT, onLanded);
  return stop;
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

function routeCoordinateLabel([longitude, latitude]: [number, number]) {
  const format = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
  return `${format(latitude, 'N', 'S')}  /  ${format(longitude, 'E', 'W')}`;
}

interface Props {
  collections: Collection[];
}

// Keep the rendered tree aligned with Tailwind's `lg` breakpoint.
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

function useDesktopLayout() {
  return useSyncExternalStore(
    subscribeToDesktopLayout,
    getDesktopLayoutSnapshot,
    getDesktopLayoutServerSnapshot,
  );
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
  const ordinal = stubNode.querySelector('.archive-ticket-stub__no')?.textContent?.trim();
  const total = stubNode.querySelector('.archive-ticket-stub__of')?.textContent?.match(/\d+/)?.[0];
  return {
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    marks,
    node: stubNode,
    view: { width: window.innerWidth, height: window.innerHeight },
    print: ordinal && total ? { ordinal, total } : undefined,
  };
}

interface DeferredRouteAtlasProps {
  stops: RouteStop[];
  chapterIds?: string[];
  entryProgress?: MotionValue<number>;
  current: string | null;
  flight?: AtlasFlight | null;
  free?: boolean;
  interfaceOn?: boolean;
  phoneCardH?: number;
  reducedMotion: boolean;
  mobile?: boolean;
  paused?: boolean;
  engagedChapterId?: string | null;
  onEngage?: (chapterId: string | null) => void;
  onSelect?: (chapterId: string) => void;
  onDismiss?: () => void;
  onLeave?: () => void;
  onDrift?: (drifted: boolean) => void;
  onArrive?: (token: number, arrived: boolean) => void;
  eager?: boolean;
  holdReveal?: boolean;
  engage?: boolean;
}

function RouteAtlasFallback({ mobile = false, entryProgress }: {
  mobile?: boolean;
  entryProgress?: MotionValue<number>;
}) {
  const stableProgress = useMotionValue(1);
  // Reduced motion needs no case of its own: the entry's progress is a step
  // there, so the stand-in stays out of the first screen, as with motion.
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

// Memoised: the page renders again on every switch (the place in hand, the
// cover up), and the atlas only needs to when its own props change (the
// move asked for, the place in hand).
const DeferredRouteAtlas = memo(function DeferredRouteAtlas(props: DeferredRouteAtlasProps) {
  // The map is the page: it mounts at once (its chunk is warmed below).
  return (
    <div className="h-full w-full">
      <Suspense fallback={<RouteAtlasFallback mobile={props.mobile} entryProgress={props.entryProgress} />}>
        <RouteAtlas {...props} />
      </Suspense>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════
 *  HomePage — the entrance, then the archive as a map to roam
 * ═══════════════════════════════════════════════════════
 * One journey (owner, 2026-09-28): the opening film (its own island) lands
 * on the entrance's cover of words (EntranceIntro — no globe there), which
 * sets itself block by block; the boarding pass assembles beside it, and the
 * reader tears it — only a click on its stub does. Torn, the page glides on
 * by itself: the pass goes up and away as the globe rises over the lower
 * edge, already facing stop 01 (the first place by route order — data-
 * driven), and without a stop the camera goes down onto it: the explorer's
 * entry, asked for through the seam (`requestExplore`, src/lib/explorer.ts),
 * while the torn stub flies on to become stop 01's cover's stub (the
 * hand-off contract, src/lib/explorer.ts and src/lib/boardingPass.ts). From
 * there the map is the reader's: drag it, zoom it, choose any shield, any
 * time — the planet turns under the ticket in hand, which becomes the next
 * place's where it lies (no tear); its stub tears off, whole, only to open
 * its story. Once the
 * explorer has the page the entrance is taken off it (the page no longer
 * scrolls; the Index opens over the map); Back to the start (or the
 * wordmark) brings the opening words back, with a new pass. */
export default function HomePage({ collections }: Props) {
  const reduce = useReducedMotion();
  const desktopLayout = useDesktopLayout();

  // ── The places, in route order ──
  // Every collection with photographs (src/lib/chapterOrder.ts, shared with
  // /about, so its "01 Miami" is the homepage's 01), region members read
  // together.
  const activeCollections = useMemo(() => activeChapters(collections), [collections]);
  const sections = useMemo(() => chapterSections(activeCollections), [activeCollections]);
  const orderedCities = useMemo(() => sections.flatMap((s) => s.cities), [sections]);
  const orderedChapterIds = useMemo(() => orderedCities.map((city) => city._id), [orderedCities]);
  const archiveYearSpan = useMemo(() => {
    const years = activeCollections
      .map((city) => Number(city.year))
      .filter((year) => Number.isFinite(year) && year > 0);
    if (!years.length) return '';
    const first = Math.min(...years);
    const last = Math.max(...years);
    return first === last ? String(first) : `${first}–${last}`;
  }, [activeCollections]);
  const totalFrames = useMemo(
    () => orderedCities.reduce((sum, city) => sum + (city.photoCount ?? city.photos?.length ?? 0), 0),
    [orderedCities],
  );
  const chapterPreloadUrls = useMemo(() => {
    const covers = orderedCities.map((city) => city.coverImageUrl ?? city.photos?.[0]?.imageUrl ?? '');
    return covers.map((_, index) => [covers[index - 1], covers[index + 1]].filter(Boolean));
  }, [orderedCities]);
  // Every cover with a region carries its state on a tab, the name boxed
  // (owner, 2026-09-29: 封面的州名可以框起来，我想要这个更醒目一点); the first
  // place of a region of two or more keeps the region's figures on it,
  // "REGION [FLORIDA] 2 PLACES · 32 FRAMES" (owner, 2026-09-28: 保留).
  const stateTabs = useMemo(() => {
    const tabs = new Map<string, { state: string; places?: number; frames?: number }>();
    sections.forEach((section) => {
      section.cities.forEach((city, index) => {
        const state = section.region ?? city.region?.trim();
        if (!state) return;
        tabs.set(city._id, index === 0 && section.showHeader
          ? { state, places: section.cities.length, frames: section.frameCount }
          : { state });
      });
    });
    return tabs;
  }, [sections]);
  // The ticket a cover folds into on a switch is one height for the whole
  // archive: its tallest sign's (src/lib/coverDock.ts, TICKET). The desktop
  // reads it off the dock's plan; the phone's cards, from here.
  const ticketHeight = useMemo(
    () => archiveTicketH(orderedCities.map((city) => ({ name: city.name.trim(), lines: signLines(city.name) }))),
    [orderedCities],
  );
  const routeStops = useMemo<RouteStop[]>(
    () =>
      orderedCities.flatMap((city) => {
        const fallbackKey = [city.name, city.location, city.region]
          .filter(Boolean)
          .map((value) => value!.trim().toLowerCase())
          .find((value) => ROUTE_FALLBACKS[value]);
        // The canonical map point, else the mean of the geotagged frames
        // (src/lib/geo.ts), else a named place.
        const coordinates: [number, number] | undefined = chapterPoint(city)
          ?? (fallbackKey ? ROUTE_FALLBACKS[fallbackKey] : undefined);
        const landscapePreview = (city.photos ?? []).find((photo) =>
          !!photo.imageUrl && photo.width != null && photo.height != null && photo.width >= photo.height,
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
              coverRatio: coverRatioOf(city.coverImageUrl ?? city.photos?.[0]?.imageUrl) ?? undefined,
              dockTab: stateTabs.has(city._id),
            }]
          : [];
      }),
    [orderedCities, stateTabs],
  );
  // The route's first stop: the boarding pass's destination and date
  // (data-driven: Miami today, Washington once the owner adds it as stop 01).
  const firstStop = useMemo(() => {
    const first = orderedCities[0];
    return first ? { name: first.name.trim(), region: first.region?.trim() || null, year: first.year ?? null, slug: first.slug ?? null } : null;
  }, [orderedCities]);
  // The entrance's cover of words says what the archive holds, from its own
  // data (src/lib/boardingPass.ts, coverBlocks): the years, the places, the
  // frames, the regions in route order.
  const coverFacts = useMemo(() => ({
    years: archiveYearSpan,
    places: orderedCities.length,
    frames: totalFrames,
    regions: distinctRegions(orderedCities.map((city) => city.region)),
  }), [archiveYearSpan, orderedCities, totalFrames]);
  // The explorer's places: those the map can put a shield on.
  const placeIds = useMemo(() => routeStops.map((stop) => stop.id), [routeStops]);
  const places = useMemo<ExplorerPlace[]>(() => routeStops.map((stop) => ({
    id: stop.id,
    number: orderedChapterIds.indexOf(stop.id) + 1,
    name: stop.name,
    region: stop.region,
    slug: stop.slug,
    frames: stop.frameCount,
    year: stop.year,
  })), [orderedChapterIds, routeStops]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const mapped = new Set(routeStops.map((stop) => stop.id));
    const missing = orderedCities.filter((city) => !mapped.has(city._id));
    if (missing.length) {
      console.warn(`[Explorer] Missing canonical coordinates: ${missing.map((city) => city.name).join(', ')}`);
    }
    const unstocked = activeCollections.filter((collection) => !TICKET_STOCK[collection.slug]);
    if (unstocked.length) {
      console.warn(`[Ticket stock] No card stock for: ${unstocked.map((collection) => collection.slug).join(', ')} — printing on the olive fallback.`);
    }
  }, [activeCollections, orderedCities, routeStops]);

  // ── The explorer (src/lib/explorer.ts) ──
  const [explorer, setExplorer] = useState<ExplorerState>(EXPLORER_START);
  const explorerRef = useRef(explorer);
  // The desktop's clock for the entry (RouteAtlas follows it): the descent
  // alone. The globe no longer sits in a first screen's corner facing India,
  // to be turned half round the planet first — it rises with the page
  // already facing stop 01.
  const entryProgress = useMotionValue(0);
  const entryAnimRef = useRef<{ stop: () => void } | null>(null);
  const [flight, setFlight] = useState<AtlasFlight | null>(null);
  const flightTokenRef = useRef(0);
  const entryFlightRef = useRef<number | null>(null);
  const [engagedChapterId, setEngagedChapterId] = useState<string | null>(null);
  // ── Left, and come back to (src/lib/explorerDrift.ts) ──
  // The last place held (Recentre goes back to it once nothing is in hand);
  // whether the view has drifted from the place in hand (RouteAtlas says,
  // off the map's own projection on the reader's moves); and whether the
  // place was let go by the reader's own hand (its ticket fades a little
  // sooner as it rides away: global.css `[data-let-go]`).
  const [lastPlace, setLastPlace] = useState<string | null>(null);
  const [viewDrifted, setViewDrifted] = useState(false);
  const [letGo, setLetGo] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  // A sequence per gesture: a gesture's later steps (after the admission) are
  // dropped when another gesture has come since.
  const gestureRef = useRef(0);
  const current = explorer.current;
  const currentIndex = current ? placeIds.indexOf(current) : -1;
  const prevPlace = places.length ? places.find((place) => place.id === neighbour(placeIds, current, -1)) ?? null : null;
  const nextPlace = places.length ? places.find((place) => place.id === neighbour(placeIds, current, 1)) ?? null : null;

  // ── The story overlay (MagazineLayout) ──
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const selectedCollectionRef = useRef<Collection | null>(null);
  selectedCollectionRef.current = selectedCollection;
  const storyOpenedIdRef = useRef<string | null>(null);
  const [storyClosing, setStoryClosing] = useState(false);
  const storyOpenRef = useRef(false);
  const storyReturnFocusRef = useRef<HTMLElement | null>(null);
  const storySourceChapterIdRef = useRef<string | null>(null);
  const storySharedImageUrlRef = useRef('');
  // The plate the open story grew out of, as it was at the click.
  const plateOriginRef = useRef<PlateOrigin | null>(null);
  const pageRootRef = useRef<HTMLDivElement>(null);
  const storyActive = !!selectedCollection || storyClosing;

  // What a story grows out of, read once, where the ticket lies now — before
  // its stub tears off: the photograph's frame and picture (the plate), and
  // the stub's box and marks (the half the reader keeps). The ticket rides
  // on the atlas beside its shield (src/lib/coverDock.ts, `coverOf`); only a
  // cover up there (`data-at`) has a plate to grow from.
  interface StoryCapture {
    chapter: HTMLElement | null;
    returnFocus: HTMLElement | null;
    origin: PlateOrigin | null;
    imageUrl: string;
    dockedCover: HTMLElement | null;
  }
  const captureStory = useCallback((collection: Collection): StoryCapture => {
    const chapterId = `archive-item-${collection._id}`;
    const chapter = document.getElementById(chapterId);
    const chapterControl = chapter?.querySelector<HTMLElement>('[role="button"], button') ?? null;
    // Focus comes back to what asked for the story: the rail (or a row, a
    // key) that had it; a pointer on the cover leaves nothing focused, and
    // the chapter's own control stands in for it (its ring is bone: the
    // view's one lime stays on the interface — review of 2026-09-29).
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const invoker = active && active !== document.body && active.id !== 'main-content' && pageRootRef.current?.contains(active) ? active : null;
    const returnFocus = invoker ?? chapterControl;
    const dockedCover = coverOf(chapter);
    const plateRoot = dockedCover?.hasAttribute('data-at') ? dockedCover : null;
    const image = plateRoot?.querySelector<HTMLImageElement>('.archive-photo-frame img') ?? null;
    const imageUrl = image?.currentSrc || image?.src || '';
    const plateFrame = plateRoot?.querySelector<HTMLElement>('.archive-photo-frame');
    const frameBox = plateFrame?.getBoundingClientRect();
    const imageBox = image && plateFrame?.contains(image) ? image.getBoundingClientRect() : null;
    const plateMatte = plateRoot?.querySelector<HTMLElement>('.archive-photo-matte');
    const origin: PlateOrigin | null = image && frameBox && imageBox && imageUrl
      && frameBox.width > 0 && frameBox.height > 0 && imageBox.width > 0 && imageBox.height > 0
      ? {
          frame: { x: frameBox.x, y: frameBox.y, width: frameBox.width, height: frameBox.height },
          image: { x: imageBox.x, y: imageBox.y, width: imageBox.width, height: imageBox.height },
          ratio: image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : imageBox.width / imageBox.height,
          matte: Number.parseFloat(plateMatte?.style.opacity ?? '') || 0,
          imageUrl,
        }
      : null;
    // The stub the reader keeps (read before it tears off): handed into the
    // story's rail once the story has loaded, and flown back onto the ticket
    // at the close (MagazineLayout, KeptStub / flyStubHome). Under reduced
    // motion nothing travels.
    const stubNode = origin && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? plateRoot?.querySelector<HTMLElement>('.archive-ticket-stub')
      : null;
    const kept = stubNode ? ticketStubOf(stubNode) : null;
    if (origin && kept) origin.stub = kept;
    return { chapter, returnFocus, origin, imageUrl, dockedCover };
  }, []);

  const openCollection = useCallback((collection: Collection, captured?: StoryCapture) => {
    const at = captured ?? captureStory(collection);
    storyReturnFocusRef.current = at.returnFocus;
    storySharedImageUrlRef.current = at.imageUrl;
    plateOriginRef.current = at.origin;
    // The plate's title, cue and tab hang past its edges; they go with the
    // plate in the same paint the plane arrives in (global.css,
    // `[data-story-source]`).
    document.querySelectorAll<HTMLElement>('[data-story-source]').forEach((node) => {
      delete node.dataset.storySource;
    });
    if (at.chapter && at.origin) {
      at.chapter.dataset.storySource = 'true';
      if (at.dockedCover) at.dockedCover.dataset.storySource = 'true';
    }
    storyOpenRef.current = true;
    storyOpenedIdRef.current = collection._id;
    storySourceChapterIdRef.current = at.chapter?.id ?? `archive-item-${collection._id}`;
    setStoryClosing(false);
    setSelectedCollection(collection);
  }, [captureStory]);

  // ── Playing a gesture's effects, in order ──
  // The admission: the cover's stub tears off whole (ArchiveChapter, on the
  // score of src/lib/ticketTear.ts), and only then does `go` open the story.
  // A ticket that cannot tear (not on screen) simply goes on.
  const tearStub = useCallback((id: string, go: () => void) => {
    const section = document.getElementById(`archive-item-${id}`);
    const detail: { go: () => void; handled?: boolean } = { go };
    section?.dispatchEvent(new CustomEvent('archive:tear-stub', { detail }));
    if (!detail.handled) go();
  }, []);
  const nextFlight = useCallback((kind: AtlasFlight['kind'], id: string | null, entry = false, leadMs = 0) => {
    flightTokenRef.current += 1;
    const next: AtlasFlight = {
      kind,
      id,
      token: flightTokenRef.current,
      ...(entry ? { entry: true } : null),
      ...(leadMs > 0 ? { leadMs } : null),
    };
    setFlight(next);
    return next.token;
  }, []);

  // The desktop's entry: the camera goes down from the globe the page
  // brought up (facing stop 01, in the middle of the screen) onto the
  // place, on the entry's clock (src/lib/explorerCamera.ts ENTRY). Nothing
  // turns first: the turn from the first screen's corner globe went with it.
  // The torn pass asks as its glide sets off, so the clock starts under the
  // glide (ENTRY.diveMs counts it) and says when it will touch down
  // (`setEntryLandsAt`: the stub's arc lands on it). Reduced motion: a cut.
  const dispatchRef = useRef<(action: ExplorerAction) => void>(() => {});
  // The glide still bringing the page down when the entry was asked for, ms
  // (the phone's entry flight is that much longer).
  const entryLeadRef = useRef(0);
  const entryDown = useCallback(() => {
    entryAnimRef.current = null;
    setEntryLandsAt(null);
    dispatchRef.current({ type: 'entered' });
  }, []);
  const runEntry = useCallback((id: string | null) => {
    entryAnimRef.current?.stop();
    const lead = entryLeadRef.current;
    entryLeadRef.current = 0;
    if (!desktopLayout) {
      entryFlightRef.current = nextFlight('entry', id, false, lead);
      return;
    }
    if (reduce) {
      entryProgress.set(1);
      entryDown();
      return;
    }
    let stopped = false;
    const from = entryProgress.get();
    const ms = ENTRY.diveMs * (1 - Math.min(0.999, Math.max(0, from)));
    setEntryLandsAt(performance.now() + ms);
    const dive = animate(entryProgress, 1, {
      duration: ms / 1000,
      ease: 'linear',
      onComplete: () => {
        if (!stopped) entryDown();
      },
    });
    entryAnimRef.current = {
      stop: () => {
        stopped = true;
        dive.stop();
      },
    };
  }, [desktopLayout, entryDown, entryProgress, nextFlight, reduce]);

  // ── The entrance (EntranceIntro) ──
  // On the page above the explorer until the explorer has it (`entranceOn`);
  // a new pass each time the reader comes back to the start (`entranceIssue`
  // keys it). The globe holds its reveal — hidden, its tiles loading at the
  // pose it will rise in — until the pass is torn (`globeHeld`).
  const [entranceOn, setEntranceOn] = useState(true);
  const entranceOnRef = useRef(entranceOn);
  entranceOnRef.current = entranceOn;
  const [entranceIssue, setEntranceIssue] = useState(0);
  const [globeHeld, setGlobeHeld] = useState(true);
  const explorerSectionRef = useRef<HTMLDivElement>(null);
  // The veil over the whole page while Back to the start swaps the explorer
  // for the opening words (never a scroll back up through the pass).
  const [pageVeiled, setPageVeiled] = useState(false);

  // Back to the start: under a short veil the opening words come back, with
  // a new pass, the page at its top; below them the camera is set back on
  // the globe facing stop 01 (the desktop's entry clock to 0) or above
  // stop 01 (the phone), out of sight, ready to rise again with the next tear.
  const goHome = useCallback(() => {
    entryAnimRef.current?.stop();
    entryAnimRef.current = null;
    entryFlightRef.current = null;
    finishingRef.current = false;
    glidePendingRef.current = false;
    setEntryLandsAt(null);
    setPageVeiled(true);
    window.setTimeout(() => {
      if (desktopLayout) {
        entryProgress.set(0);
      } else {
        nextFlight('home', null);
      }
      setEntranceIssue((issue) => issue + 1);
      setEntranceOn(true);
      window.setTimeout(() => setPageVeiled(false), 80);
    }, reduce ? 0 : DUR_MS.out);
  }, [desktopLayout, entryProgress, nextFlight, reduce]);

  const play = useCallback((effects: ExplorerEffect[], gesture: number) => {
    const step = (index: number) => {
      if (index > 0 && gesture !== gestureRef.current) return;
      const effect = effects[index];
      if (!effect) return;
      const next = () => step(index + 1);
      switch (effect.type) {
        case 'tear-stub': {
          const collection = orderedCities.find((city) => city._id === effect.id);
          // What the story grows out of is read before the stub moves.
          const captured = collection ? captureStory(collection) : undefined;
          tearStub(effect.id, () => {
            if (gesture !== gestureRef.current || !collection) return;
            openCollection(collection, captured);
          });
          return;
        }
        case 'fly':
          // The switch: any place, at once, no tear (RouteAtlas turns the
          // planet under the ticket; a choice mid-turn turns on from there).
          nextFlight('fly', effect.id);
          next();
          return;
        case 'entry':
          runEntry(effect.id);
          next();
          return;
        case 'story': {
          // Opened by its tear (above), once the stub is torn off whole.
          next();
          return;
        }
        case 'release':
          nextFlight('release', effect.id);
          next();
          return;
        case 'home':
          goHome();
          next();
          return;
        default:
          next();
      }
    };
    step(0);
  }, [captureStory, goHome, nextFlight, openCollection, orderedCities, runEntry, tearStub]);

  const dispatch = useCallback((action: ExplorerAction) => {
    const step = explore(explorerRef.current, action, placeIds);
    if (step.state === explorerRef.current && !step.effects.length) return;
    explorerRef.current = step.state;
    setExplorer(step.state);
    if (step.state.current) {
      setLastPlace(step.state.current);
      setLetGo(false);
    }
    announceExplorer({ phase: step.state.phase, current: step.state.current });
    if (step.effects.length) {
      gestureRef.current += 1;
      play(step.effects, gestureRef.current);
    }
  }, [placeIds, play]);
  dispatchRef.current = dispatch;

  const onArrive = useCallback((token: number) => {
    if (token === entryFlightRef.current) {
      entryFlightRef.current = null;
      finishingRef.current = false;
      setEntryLandsAt(null);
      dispatchRef.current({ type: 'entered' });
    }
  }, []);

  // ── The entry, cut short ──
  // Being able to stop a motion is itself a comfort: while the entry plays,
  // a key (Escape among them), a press anywhere or a second turn of the wheel
  // plays the rest of it quickly, from where the camera is — never a jump
  // (review of 2026-09-29: the planet to the place in one frame, then flat
  // unloaded ground): the desktop's clock on ENTRY_FINISH (velocity-
  // continuous, the zoom under twice the flights' cap), the phone's flight
  // turned onto the place in a short turn from the live camera ('finish').
  // An entry that would be down sooner on its own is left to land (cutting
  // it short never makes it later). Says whether it had an entry to finish.
  const finishingRef = useRef(false);
  const finishEntry = useCallback(() => {
    if (explorerRef.current.phase !== 'entering') return false;
    if (finishingRef.current) return true;
    const landsAt = entryLandsAt();
    const left = landsAt != null ? landsAt - performance.now() : Infinity;
    if (desktopLayout) {
      const p0 = entryProgress.get();
      const plan = finishEntryPlan(p0, 1000 / ENTRY.diveMs, ENTRY_SPAN);
      if (left <= plan.ms) return true;
      finishingRef.current = true;
      entryAnimRef.current?.stop();
      setEntryLandsAt(performance.now() + plan.ms);
      let stopped = false;
      const rest = animate(entryProgress, 1, {
        duration: plan.ms / 1000,
        ease: (tau: number) => (plan.at(tau) - p0) / Math.max(1e-6, 1 - p0),
        onComplete: () => {
          finishingRef.current = false;
          if (!stopped) entryDown();
        },
      });
      entryAnimRef.current = {
        stop: () => {
          stopped = true;
          finishingRef.current = false;
          rest.stop();
        },
      };
      return true;
    }
    const id = explorerRef.current.current;
    if (id && entryFlightRef.current != null && left > ENTRY_FINISH.phoneMs) {
      finishingRef.current = true;
      entryFlightRef.current = nextFlight('finish', id, true);
    }
    return true;
  }, [desktopLayout, entryDown, entryProgress, nextFlight]);

  // A window that crosses the phone/desktop line with the map in hand (a
  // tablet turned, a window dragged narrower): the other layout's camera is
  // cut straight onto the place in hand, its clocks at their ends — no entry
  // replayed, nothing half-played left pending.
  const layoutRef = useRef(desktopLayout);
  useEffect(() => {
    if (layoutRef.current === desktopLayout) return;
    layoutRef.current = desktopLayout;
    const state = explorerRef.current;
    if (state.phase === 'globe') return;
    gestureRef.current += 1;
    entryAnimRef.current?.stop();
    entryAnimRef.current = null;
    entryFlightRef.current = null;
    if (desktopLayout) {
      entryProgress.set(1);
    }
    const entering = state.phase === 'entering';
    if (entering) dispatchRef.current({ type: 'entered' });
    if (state.current) nextFlight('cut', state.current, entering && !desktopLayout);
  }, [desktopLayout, entryProgress, nextFlight]);

  // ── The hand-over: the explorer takes the page ──
  // Asked for through the seam (below): the boarding pass, torn, asks as
  // its glide sets off (`arrivingMs`): the camera starts down at once, under
  // the glide, and the entrance is taken off the page when the glide lands
  // (`onGlided`) in the same frame as the scroll goes to 0 — nothing on
  // screen moves. Anyone else may ask too: the page is brought to the
  // explorer's top if it is not there yet, the entrance taken off, and the
  // camera goes down onto stop 01. Reduced motion holds the entrance until
  // the explorer is still and whole, then cuts once. Nothing synthetic is
  // dispatched after the ask: a real key, press or new wheel cuts the entry
  // short.
  const handOverRef = useRef<(enter: () => void, ask: ExploreRequest) => void>(() => {});
  const handOverTween = useRef(0);
  // The entrance's glide still under way when the entry was asked for: the
  // entrance goes once it has landed (`onGlided`).
  const glidePendingRef = useRef(false);
  const stillHoldRef = useRef<(() => void) | null>(null);
  const takeEntranceOff = useCallback(() => {
    handOverTween.current = 0;
    if (!entranceOnRef.current) return;
    entranceOnRef.current = false;
    setEntranceOn(false);
  }, []);
  handOverRef.current = (enter: () => void, ask: ExploreRequest) => {
    const section = explorerSectionRef.current;
    if (!entranceOnRef.current || !section) {
      enter();
      return;
    }
    setGlobeHeld(false);
    cancelAnimationFrame(handOverTween.current);
    stillHoldRef.current?.();
    const done = () => {
      takeEntranceOff();
      enter();
    };
    // The torn pass asks as its glide sets off: the entry starts now, under
    // the glide (the camera coming down while the globe rises), and nothing
    // scrolls the page but the glide itself; the entrance goes as it lands.
    const arriving = Math.max(0, ask.arrivingMs ?? 0);
    if (arriving > 0 && !reduce) {
      glidePendingRef.current = true;
      entryLeadRef.current = arriving;
      enter();
      return;
    }
    if (reduce) {
      // Reduced motion: the explorer is set on stop 01 under the entrance,
      // and the entrance is cut away only once the map is still with its
      // tiles in (ATLAS_IDLE_EVENT) and the cover's print is decoded — one
      // cut, never onto an empty explorer (review of 2026-09-29: a flat
      // photograph, no tiles for ~250 ms, the idle line before MIAMI).
      stillHoldRef.current = holdUntilStill(() => {
        stillHoldRef.current = null;
        takeEntranceOff();
      });
      enter();
      return;
    }
    const top = documentTop(section);
    const from = window.scrollY;
    if (Math.abs(from - top) <= 2) {
      done();
      return;
    }
    // Short of the explorer: the rest of the way on the entrance's glide
    // curve, in time with the distance (a full screen takes the glide's
    // own ARRIVAL_SECONDS).
    const seconds = Math.min(ARRIVAL_SECONDS, Math.max(0.45, (ARRIVAL_SECONDS * Math.abs(top - from)) / Math.max(1, window.innerHeight)));
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / (seconds * 1000));
      window.scrollTo({ top: from + (top - from) * arrivalCurve(k), behavior: 'instant' as ScrollBehavior });
      if (k < 1) handOverTween.current = requestAnimationFrame(step);
      else done();
    };
    handOverTween.current = requestAnimationFrame(step);
  };
  useEffect(() => () => {
    cancelAnimationFrame(handOverTween.current);
    stillHoldRef.current?.();
  }, []);
  // The glide has brought the explorer up: the entrance leaves the page in
  // the frame the scroll goes to 0 (nothing on screen moves).
  const onEntranceGlided = useCallback(() => {
    if (!glidePendingRef.current) return;
    glidePendingRef.current = false;
    takeEntranceOff();
  }, [takeEntranceOff]);

  // ── The stub hand-off (src/lib/explorer.ts) ──
  // Asked with `stubHandoff`, stop 01's cover shows its photograph but not
  // its stub until the entrance has flown the torn pass's stub onto it
  // (STUB_LANDED_EVENT: the chapter shows its own stub inside that event,
  // the same frame the entrance removes its copy). Never waited on for good:
  // STUB_WAIT_MS after the entry lands, the stub is shown anyway.
  const [stubAwaited, setStubAwaited] = useState<string | null>(null);
  // The ticket and the shields are out of the hand while the stub is on its
  // way, and ARRIVAL_INERT_MS after it lands (global.css
  // `[data-stub-arriving]`; the empty map's click waits too).
  const [arriving, setArriving] = useState(false);
  const arrivingRef = useRef(false);
  arrivingRef.current = arriving || !!stubAwaited;
  useEffect(() => {
    if (stubAwaited) {
      setArriving(true);
      return;
    }
    const timer = window.setTimeout(() => setArriving(false), ARRIVAL_INERT_MS);
    return () => window.clearTimeout(timer);
  }, [stubAwaited]);
  useEffect(() => {
    if (!stubAwaited) return;
    let timer = 0;
    const landed = () => setStubAwaited(null);
    const onEntryLanded = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(landed, STUB_WAIT_MS);
    };
    window.addEventListener(STUB_LANDED_EVENT, landed);
    window.addEventListener(ENTRY_LANDED_EVENT, onEntryLanded);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(STUB_LANDED_EVENT, landed);
      window.removeEventListener(ENTRY_LANDED_EVENT, onEntryLanded);
    };
  }, [stubAwaited]);

  // ── The seam: anyone may ask for the explorer (src/lib/explorer.ts) ──
  const placeIdsRef = useRef(placeIds);
  placeIdsRef.current = placeIds;
  useEffect(() => {
    announceExplorer({ phase: explorerRef.current.phase, current: explorerRef.current.current });
    // An ask is answered once: consumed here, so a later visit to the page
    // in the same window (a client-side navigation back) starts on the
    // opening words again rather than on a stale ask.
    const enter = (event?: Event) => {
      const ask = ((event as CustomEvent<ExploreRequest> | undefined)?.detail ?? window.__archiveExploreAsked ?? {}) as ExploreRequest;
      delete window.__archiveExploreAsked;
      if (ask.stubHandoff && explorerRef.current.phase === 'globe') setStubAwaited(stopOne(placeIdsRef.current));
      handOverRef.current(() => dispatchRef.current({ type: 'enter' }), ask);
    };
    if (window.__archiveExploreAsked) enter();
    window.addEventListener(EXPLORE_EVENT, enter);
    return () => window.removeEventListener(EXPLORE_EVENT, enter);
  }, []);

  // ── The opening film (OpeningFilm, its own island above this one) ──
  // While it covers the page the entrance's pass is out of the tab order;
  // `null` means there is no film to wait for (a second view). The film
  // lands on the entrance's opening words.
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
  useEffect(() => {
    if (explorer.phase !== 'entering' || reduce) return;
    const began = performance.now();
    // The wheel that entered keeps turning for a while (a trackpad's glide):
    // only a new turn after a pause, well into the entry, cuts it short.
    let lastWheel = began;
    const onWheel = (event: WheelEvent) => {
      const now = performance.now();
      const fresh = now - lastWheel > 320 && now - began > 600;
      lastWheel = now;
      if (fresh && Math.abs(event.deltaY) + Math.abs(event.deltaX) >= 4) finishEntry();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.key === 'Tab' || event.key === 'Shift') return;
      // A key held from the entering press repeats: not a new ask (Escape
      // always is).
      if (event.key !== 'Escape' && performance.now() - began < 250) return;
      finishEntry();
    };
    // The press that cuts the entry short is only that: its click (a tap's
    // finger coming down where the cover is about to be) never reaches the
    // cover, a shield or the empty map (review of 2026-09-29: it opened the
    // story, 4/4 on a phone).
    let swallowTimer = 0;
    const swallow = (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
    };
    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      if (!finishEntry()) return;
      window.removeEventListener('click', swallow, true);
      window.clearTimeout(swallowTimer);
      window.addEventListener('click', swallow, { capture: true, once: true });
      swallowTimer = window.setTimeout(() => window.removeEventListener('click', swallow, true), 700);
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      // A press's click still to come is swallowed even once the entry is
      // down (its timer lets it go).
    };
  }, [explorer.phase, finishEntry, reduce]);

  // ── The keys ──
  // Escape lets the ticket in hand go, calmly (its cover fades; nothing
  // tears), as a click on the empty map does. ← and → step to the previous
  // and next place, as the reference's keys do — from anywhere on the page
  // but the map itself (its own arrows pan it), a field, the list or an
  // open story or Index.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (storyOpenRef.current || indexOpen || listOpen) return;
      if (explorerRef.current.phase !== 'explore') return;
      if (event.key === 'Escape') {
        if (explorerRef.current.current) dispatchRef.current({ type: 'dismiss' });
        return;
      }
      if ((event.key === 'r' || event.key === 'R') && !event.shiftKey) {
        const target = event.target as Element | null;
        if (target?.closest?.('input, textarea, select, [contenteditable="true"], .explorer-list')) return;
        if (!recentreOnRef.current) return;
        event.preventDefault();
        recentreRef.current();
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as Element | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"], .mapboxgl-canvas, .explorer-list')) return;
      event.preventDefault();
      stepToRef.current(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [indexOpen, listOpen]);

  // ── The story ──
  const closeCollection = useCallback(() => {
    const opened = storyOpenedIdRef.current;
    const onScreen = selectedCollectionRef.current;
    // The ticket the story was opened from has its stub back, whole, before
    // the story lifts off it (the kept half flies home over it,
    // MagazineLayout's flyStubHome).
    if (opened) document.getElementById(`archive-item-${opened}`)?.dispatchEvent(new CustomEvent('archive:reseat'));
    // Turned (Next) to another place: the map is set on that place under the
    // story, so the close uncovers the place the reader is on.
    if (onScreen && opened && onScreen._id !== opened && placeIds.includes(onScreen._id)) {
      const state = { ...explorerRef.current, current: onScreen._id };
      explorerRef.current = state;
      setExplorer(state);
      announceExplorer({ phase: state.phase, current: state.current });
      gestureRef.current += 1;
      nextFlight('cut', onScreen._id);
      storySourceChapterIdRef.current = `archive-item-${onScreen._id}`;
      storyReturnFocusRef.current = document.getElementById(`archive-item-${onScreen._id}`)?.querySelector<HTMLElement>('[role="button"], button') ?? null;
    }
    setStoryClosing(true);
    setSelectedCollection(null);
  }, [nextFlight, placeIds]);
  const selectCollectionWithinStory = useCallback((collection: Collection) => {
    setSelectedCollection(collection);
  }, []);
  const finishStoryClose = useCallback(() => {
    storyOpenRef.current = false;
    setStoryClosing(false);
    document.querySelectorAll<HTMLElement>('[data-story-source]').forEach((node) => {
      delete node.dataset.storySource;
    });
    document.querySelectorAll<HTMLElement>('[data-kept-away]:not([data-kept-returning])').forEach((node) => {
      delete node.dataset.keptAway;
    });
    // Focusing into a subtree that is still `inert` silently no-ops: retry,
    // bounded, until the focus lands.
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
  // The atlas keeps rendering while the story panel rises over it and while
  // it drops; it pauses only once the overlay fully covers it.
  const [atlasPaused, setAtlasPaused] = useState(false);
  useEffect(() => {
    if (!selectedCollection || storyClosing) {
      setAtlasPaused(false);
      return;
    }
    const timer = window.setTimeout(() => setAtlasPaused(true), 900);
    return () => window.clearTimeout(timer);
  }, [selectedCollection, storyClosing]);
  useEffect(() => {
    document.body.style.backgroundColor = '#282c20';
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, []);
  // ── Nothing on this page scrolls by hand ──
  // The entrance is one screen (its cover of words and the pass: the pass is
  // the one way on, and its glide moves the page itself, EntranceIntro), and
  // the explorer is the map, whose wheel is its own. So the body is clipped
  // from the first frame — the only lock this page uses (under the story
  // too, its own scroller). No Lenis: there is no scroll left to smooth.
  useEffect(() => {
    document.body.style.overflow = 'clip';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);
  // The entrance off the page (the explorer's top becomes the page's) or
  // back on it (Back to the start): either way the page is at its top, in
  // the frame the DOM changes, before it paints.
  const entranceShownRef = useRef(entranceOn);
  useLayoutEffect(() => {
    if (entranceShownRef.current === entranceOn) return;
    entranceShownRef.current = entranceOn;
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [entranceOn]);

  // Stories opened from the Index's contact sheet: the chosen frame grows
  // into the story (photoOrigin); a kept stub opens the story at its front
  // page. Focus comes back to where the sheet says.
  const storyFrameRef = useRef<{ id: string; hash: string } | null>(null);
  const openStoryFromClosing = useCallback((collectionId: string, request: ClosingStoryRequest) => {
    const collection = orderedCities.find((city) => city._id === collectionId);
    if (!collection) return;
    const grownFrom = request.source ? photoOrigin(request.source, request.source.querySelector('img')) : null;
    openCollection(collection, {
      chapter: null,
      returnFocus: request.returnFocus ?? null,
      origin: grownFrom,
      imageUrl: '',
      dockedCover: null,
    });
    storyOpenedIdRef.current = null;
    const hash = request.frameUrl ? /[0-9a-f]{40}/.exec(request.frameUrl)?.[0] : undefined;
    const frame01 = storyFrames(collection.photos ?? [], collection.coverImageUrl)[0]?.imageUrl ?? collection.coverImageUrl ?? '';
    const isFrame01 = !!hash && /[0-9a-f]{40}/.exec(frame01)?.[0] === hash;
    storyFrameRef.current = hash && !isFrame01 ? { id: collection._id, hash } : null;
  }, [openCollection, orderedCities]);
  // …then the frame: while the story's front page still covers it, the story
  // is held at that frame's row, and once live the frame's own cell is
  // clicked. Found by asset hash. Gives up quietly.
  useEffect(() => {
    const pending = storyFrameRef.current;
    if (!pending) return;
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

  // ── The Index: the archive's contact sheet, over the map ──
  const indexReturnRef = useRef<HTMLElement | null>(null);
  const openIndex = useCallback(() => {
    indexReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setListOpen(false);
    setIndexOpen(true);
  }, []);
  const closeIndex = useCallback(() => {
    setIndexOpen(false);
    window.requestAnimationFrame(() => indexReturnRef.current?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    if (!indexOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !storyOpenRef.current) {
        event.preventDefault();
        closeIndex();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeIndex, indexOpen]);

  // The wordmark and the pills come in at once on every layout (there is no
  // opener card to wait for any more; the opening film, when it plays, keeps
  // the nav under it: global.css, html[data-reel]). `walkin-in` on the body
  // is what slides the wordmark down (global.css, .walkin-nav).
  const [navPillsVisible, setNavPillsVisible] = useState(false);
  useEffect(() => {
    document.body.classList.add('walkin-in');
    setNavPillsVisible(true);
  }, []);
  // Warm the map's chunk at once: the map is the page.
  useEffect(() => {
    void loadRouteAtlas();
  }, []);

  // The phone's card height: the camera sets a place in the band above it.
  const [phoneCardH, setPhoneCardH] = useState(0);
  useEffect(() => {
    if (desktopLayout) return;
    const size = () => {
      const heights = routeStops.map((stop) => phoneCard(window.innerWidth, window.innerHeight, stop.coverRatio ?? 1.5).h);
      setPhoneCardH(heights.reduce((most, h) => Math.max(most, h), 0));
    };
    size();
    window.addEventListener('resize', size, { passive: true });
    return () => window.removeEventListener('resize', size);
  }, [desktopLayout, routeStops]);

  const [dockHost, setDockHost] = useState<HTMLDivElement | null>(null);
  // Let go by the reader's own hand, the ticket fades sooner (global.css
  // `.archive-dock-host[data-let-go]`): said on the host, which on the
  // desktop is the atlas's own layer.
  useEffect(() => {
    if (!dockHost) return;
    if (letGo) dockHost.setAttribute('data-let-go', '');
    else dockHost.removeAttribute('data-let-go');
  }, [dockHost, letGo]);
  // The place whose cover is up (src/lib/coverDock.ts): its rail shows with
  // it — never while the ticket tears or the camera flies (one large motion
  // at a time) — and with no cover up the rail says what the archive is.
  const [dockAt, setDockAt] = useState<string | null>(null);
  // A ticket arriving from the open map (src/lib/coverDock.ts, "The
  // arrival") is up from take-off but seen only as the camera settles: its
  // rail's name and lede come in as it opens, this many ms after the
  // take-off (null: the rail's own beat).
  const [railDelay, setRailDelay] = useState<number | null>(null);
  const dockAtSeenRef = useRef<string | null>(null);
  useEffect(() => coverDock.subscribe((frame) => {
    const id = frame.at;
    if (id !== dockAtSeenRef.current) {
      dockAtSeenRef.current = id;
      const arrive = frame.arrive;
      setRailDelay(id && arrive && arrive.id === id ? Math.max(0, Math.round(arrive.expandAt - performance.now())) : null);
    }
    setDockAt((was) => (was === id ? was : id));
  }), []);
  const phase = explorer.phase;
  const entered = phase !== 'globe';
  const free = phase === 'explore';
  // Recentre shows once the view has drifted from the place in hand, or
  // with nothing in hand (src/lib/explorerDrift.ts); it goes back to the
  // place in hand, else the last one held, else stop 01.
  const recentreOn = recentreShown({ free, flying: false, places: placeIds.length, current, drifted: viewDrifted });
  const recentreOnRef = useRef(recentreOn);
  recentreOnRef.current = recentreOn;
  const recentrePlace = useMemo(() => {
    const id = recentreTarget(placeIds, current, lastPlace);
    return places.find((place) => place.id === id) ?? null;
  }, [current, lastPlace, placeIds, places]);
  // The wheel zooms the map wherever it turns: over the ticket at its shield
  // and over the rail's words too (they lie on the map), not only over the
  // bare canvas — a quarter of the screen used to be dead to it. Handed on to
  // the map's canvas as the same wheel, at the same point; the list and the
  // Index keep their own scroll.
  useEffect(() => {
    if (!free) return;
    const onWheel = (event: WheelEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.('.archive-dock, .explorer-rail')) return;
      if (target.closest('.explorer-list, [data-lenis-prevent]') || storyOpenRef.current) return;
      const canvas = document.querySelector<HTMLCanvasElement>('.route-atlas[data-atlas-free] .mapboxgl-canvas');
      if (!canvas) return;
      event.preventDefault();
      canvas.dispatchEvent(new WheelEvent('wheel', {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaZ: event.deltaZ,
        deltaMode: event.deltaMode,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        bubbles: true,
        cancelable: true,
      }));
    };
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, [free]);
  // A click on the empty map: the ticket in hand is let go, calmly (its
  // cover fades, its shield steps back; nothing tears) — as the reference's
  // board goes when the globe itself is clicked.
  const dismissFromMap = useCallback(() => {
    // Not while the stub is still landing on the ticket in hand.
    if (arrivingRef.current) return;
    dispatchRef.current({ type: 'dismiss' });
  }, []);
  // The reader's own drag or zoom has taken the place in hand out of view
  // (src/lib/explorerDrift.ts): it is let go, as the empty map lets it go —
  // its ticket fades as it rides off, the rail says what the archive is.
  // Never while the stub is still landing on it; never by our own flights
  // (RouteAtlas reads only the reader's moves).
  const leaveFromMap = useCallback(() => {
    if (arrivingRef.current || !explorerRef.current.current) return;
    setLetGo(true);
    dispatchRef.current({ type: 'drift' });
  }, []);
  // Recentre: back onto the place in hand, else the last one held, else
  // stop 01 — the switch's own move; its ticket docks again.
  const lastPlaceRef = useRef(lastPlace);
  lastPlaceRef.current = lastPlace;
  const recentre = useCallback(() => {
    dispatchRef.current({ type: 'recentre', last: lastPlaceRef.current });
  }, []);
  const recentreRef = useRef(recentre);
  recentreRef.current = recentre;
  const select = useCallback((id: string) => {
    dispatchRef.current({ type: 'select', id });
  }, []);
  const openFromCover = useCallback((city: Collection) => {
    if (explorerRef.current.current !== city._id) {
      select(city._id);
      return;
    }
    dispatchRef.current({ type: 'open', id: city._id });
  }, [select]);
  const stepTo = useCallback((direction: 1 | -1) => {
    const id = neighbour(placeIds, explorerRef.current.current, direction);
    if (id) select(id);
  }, [placeIds, select]);
  const stepToRef = useRef(stepTo);
  stepToRef.current = stepTo;
  const leave = useCallback(() => {
    setIndexOpen(false);
    setListOpen(false);
    dispatchRef.current({ type: 'leave' });
  }, []);
  // The wordmark: back to the start. On the entrance it is already there
  // (one screen, never scrolled by hand).
  const toStart = useCallback(() => {
    if (!entranceOnRef.current) {
      setSelectedCollection(null);
      leave();
    }
  }, [leave]);

  // The entrance's hand-off. Torn, the pass lets the globe come in (its
  // held reveal goes) as the page begins its glide; once the glide has
  // brought the globe up, the entrance asks for the explorer through the
  // seam itself (`requestExplore`, with the stub's hand-off: EntranceIntro).
  const onEntranceArrive = useCallback(() => setGlobeHeld(false), []);
  const entranceNextTop = useCallback(() => {
    const section = explorerSectionRef.current;
    return section ? documentTop(section) : null;
  }, []);

  const pageInert = storyActive || indexOpen;
  const navButton = 'nav-pill inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-full border border-white/10 bg-[#171b15]/80 px-3.5 max-[379px]:min-w-[3.25rem] max-[379px]:px-2.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-white shadow-[0_10px_34px_rgba(7,9,6,0.18)] hover:bg-[#171b15]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00] md:min-w-[5.5rem] md:bg-[#171b15]/60 md:px-6 md:text-[10px] md:backdrop-blur-xl md:hover:bg-[#171b15]/75';
  const currentCity = currentIndex >= 0 ? orderedCities.find((city) => city._id === current) ?? null : null;
  const atlasHref = currentCity?.slug
    ? `/travel?place=${encodeURIComponent(currentCity.slug)}#atlas-map`
    : '/travel';

  const atlas = (
    <DeferredRouteAtlas
      stops={routeStops}
      chapterIds={orderedChapterIds}
      entryProgress={desktopLayout ? entryProgress : undefined}
      current={current}
      flight={flight}
      free={free}
      interfaceOn={entered}
      phoneCardH={phoneCardH}
      reducedMotion={!!reduce}
      mobile={!desktopLayout}
      paused={atlasPaused}
      engagedChapterId={engagedChapterId}
      onEngage={setEngagedChapterId}
      onSelect={select}
      onDismiss={dismissFromMap}
      onLeave={leaveFromMap}
      onDrift={setViewDrifted}
      onArrive={onArrive}
      eager
      holdReveal={globeHeld}
      // The map is the page's second half: the camera holds the pose the
      // globe will rise in (its tiles loading) while the entrance is read.
      engage
      // The desktop's covers ride in a layer of the atlas's own, under its
      // route shields while a ticket travels (ArchiveChapter portals them
      // in; src/lib/coverDock.ts places them every camera frame).
      onDockHost={desktopLayout ? setDockHost : undefined}
    />
  );

  // Every chapter's props are stable between switches (the chapter is
  // memoised): a switch renders again only the chapters it concerns — the
  // place left and the place arrived at — not the whole archive (the
  // click's React work was 6.5–8 ms of the switch's first frame, traced
  // 2026-09-29).
  const nextStops = useMemo(() => new Map(orderedCities.map((city) => {
    const next = places.find((place) => place.id === neighbour(placeIds, city._id, 1));
    return [city._id, next ? { name: next.name, number: next.number, region: next.region, slug: next.slug } : null] as const;
  })), [orderedCities, placeIds, places]);
  const stepNext = useCallback(() => stepTo(1), [stepTo]);
  const chapters = orderedCities.map((city, index) => (
    <ArchiveChapter
      key={city._id}
      id={`archive-item-${city._id}`}
      collection={city}
      isActive={current === city._id}
      railShown={dockAt === city._id}
      onClick={openFromCover}
      index={index}
      chapterIndex={index}
      chapterTotal={orderedCities.length}
      preloadImageUrls={chapterPreloadUrls[index]}
      // Any place is a click away: the neighbours and the place pointed at
      // are fetched first (a switch also waits a moment for its print to
      // decode before it develops).
      prioritizeImage={currentIndex < 0 ? index === 0 : Math.abs(index - currentIndex) <= 1 || engagedChapterId === city._id}
      onEngagementChange={setEngagedChapterId}
      highlighted={engagedChapterId === city._id}
      variant="cover"
      desktopMotion
      phone={!desktopLayout}
      dockHost={dockHost}
      stateTab={stateTabs.get(city._id) ?? null}
      ticketHeight={ticketHeight}
      // The stub's "Next stop": the next place, as Next does (no tear).
      onNext={stepNext}
      stubAwaited={stubAwaited === city._id}
      nextStop={nextStops.get(city._id) ?? null}
    />
  ));

  return (
    <>
      <div
        ref={pageRootRef}
        className="relative overflow-x-clip font-sans bg-[#282c20] text-[#F4F4ED]"
        data-explorer-phase={phase}
        data-explorer-place={current ?? undefined}
        data-stub-arriving={arriving || stubAwaited ? '' : undefined}
        inert={pageInert}
        aria-hidden={pageInert}
      >
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] inline-flex min-h-11 translate-y-[-160%] items-center rounded-full bg-[#F4F4ED] px-5 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-[#171b15] transition-transform duration-200 focus:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
        >
          Skip to archive
        </a>
        <h1 className="sr-only">Ryan Xu — Visual Archive</h1>

        {/* ── Nav ── */}
        <nav
          aria-label="Primary navigation"
          data-site-nav
          className="fixed top-0 left-0 w-full z-50 px-6 py-5 md:py-8 md:px-12 flex justify-between items-center bg-transparent"
          style={{
            width: 'calc(100% - var(--story-gutter, 0px))',
            paddingTop: 'max(clamp(1.25rem, 2.1vw, 2.25rem), env(safe-area-inset-top))',
            paddingLeft: 'max(clamp(1.5rem, 3.35vw, 3rem), env(safe-area-inset-left))',
            paddingRight: 'max(clamp(1.5rem, 3.35vw, 3rem), env(safe-area-inset-right))',
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[clamp(5.5rem,10vh,7.75rem)] bg-[linear-gradient(180deg,rgba(40,44,32,0.72)_0%,rgba(40,44,32,0.4)_56%,transparent_100%)] transition-opacity duration-700"
            style={{ opacity: navPillsVisible && !reelCovering ? 1 : 0 }}
          />
          <motion.button
            type="button"
            aria-label="Ryan Xu — back to the start"
            onClick={toStart}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            transition={{ duration: DUR.flick, ease: EASE.arrive }}
            className="nav-wordmark flex min-h-11 min-w-11 shrink-0 items-center gap-3 py-2 font-serif text-lg font-medium uppercase leading-none tracking-[0.1em] text-[#F4F4ED] mix-blend-difference hover:opacity-60 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00] md:text-[21px]"
          >
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
            <motion.a
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={{ duration: DUR.flick, ease: EASE.arrive }}
              href={atlasHref}
              data-astro-prefetch="hover"
              tabIndex={navPillsVisible ? 0 : -1}
              className={navButton}
            >
              Map
            </motion.a>
            {NOTES_LIVE && (
              <motion.a
                whileTap={reduce ? undefined : { scale: 0.97 }}
                transition={{ duration: DUR.flick, ease: EASE.arrive }}
                href="/notes"
                data-astro-prefetch="hover"
                tabIndex={navPillsVisible ? 0 : -1}
                className={navButton}
              >
                Notes
              </motion.a>
            )}
            <motion.a
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={{ duration: DUR.flick, ease: EASE.arrive }}
              href="/about"
              tabIndex={navPillsVisible ? 0 : -1}
              className={navButton}
            >
              About
            </motion.a>
          </div>
        </nav>

        {/* ── The entrance: after the opening film, his opening words; a
             little way down, the boarding pass to pick up, tear or scan.
             Torn, the page glides on and the globe rises below it (the
             explorer, next), already facing stop 01. Taken off the page once
             the explorer has it; a new one with Back to the start. ── */}
        {entranceOn && (
          <EntranceIntro
            key={entranceIssue}
            facts={coverFacts}
            first={firstStop}
            nextTop={entranceNextTop}
            onArrive={onEntranceArrive}
            onGlided={onEntranceGlided}
            covered={reelCovering}
          />
        )}

        {/* ── The explorer: one screen, the map full bleed. `overflow-clip`,
             never `hidden`: a hidden box is still a scroller, and a focus
             that reached the map's attribution (below the fold of the
             canvas's bleed) scrolled it 32px and left it there. Out of reach
             (inert) until it is entered. ── */}
        <main
          id="main-content"
          ref={explorerSectionRef}
          tabIndex={-1}
          className="explorer-page relative z-10 h-[100dvh] overflow-clip focus:outline-none"
          data-story-under={selectedCollection && !storyClosing ? 'true' : undefined}
        >
          {desktopLayout ? (
            /* ── The desktop explorer: the map full screen, the place in
                hand's rail on the right. ── */
            <div className="explorer relative h-full w-full" inert={!entered}>
              {/* The rail: the place in hand — its name and lede — down the
                  right of the page; with nothing in hand, the archive's own
                  line. It lets the pointer through to the map elsewhere. */}
              <div
                data-archive-column
                className="explorer-rail"
                data-entered={entered ? '' : undefined}
                style={railDelay != null ? ({ '--place-delay': `${railDelay + ARRIVAL.inkMs}ms` } as CSSProperties) : undefined}
              >
                <h2 className="sr-only font-ui">Places</h2>
                <div className="explorer-idle" data-shown={free && !dockAt ? '' : undefined} aria-hidden={!free || !!dockAt}>
                  <p className="explorer-idle__kicker font-ui">
                    <span>Visual Archive</span>
                    {archiveYearSpan && <span className="tabular-nums">{archiveYearSpan}</span>}
                  </p>
                  <p className="explorer-idle__line font-serif">
                    A personal archive of <em>travel</em> and <em>thought</em>.
                  </p>
                  <p className="explorer-idle__figures font-ui tabular-nums">
                    {String(places.length).padStart(2, '0')} places · {totalFrames} frames
                  </p>
                  {/* PROPOSED copy (the explorer's build, 2026-09-28; the
                      recentre line 2026-09-29): for the owner to approve. */}
                  <p className="explorer-idle__hint font-ui">
                    {recentrePlace && lastPlace
                      ? `Choose a shield on the map, or recentre on ${recentrePlace.name}.`
                      : 'Choose a shield on the map, or step through below.'}
                  </p>
                </div>
                {chapters}
              </div>
              <ExplorerControls
                places={places}
                current={current}
                prev={prevPlace}
                next={nextPlace}
                listOpen={listOpen}
                onListOpen={setListOpen}
                onPrev={() => stepTo(-1)}
                onNext={() => stepTo(1)}
                onSelect={select}
                onIndex={openIndex}
                onEngage={setEngagedChapterId}
                visible={free}
                recentre={{ shown: recentreOn, place: recentrePlace, onRecentre: recentre }}
              />
              {/* The map comes after the rail and the controls in the page's
                  order (they lie over it: z-index, not order, stacks them),
                  so the keyboard meets the place in hand and the ways
                  through the places before the map's own stops. */}
              <aside className="explorer-stage absolute inset-y-0 left-0 z-10 h-full w-[78%]">
                {/* The covers' dock is the atlas's own layer (`onDockHost`). */}
                {atlas}
              </aside>
            </div>
          ) : (
            /* ── The phone's explorer: the map full screen; the place in
                hand's ticket dealt at the foot. No opener card: the
                entrance above already said who and what (the pass torn,
                the page goes straight into the entry). ── */
            <div className="explorer explorer--phone relative h-full w-full" inert={!entered}>
              <div className="explorer-stage absolute inset-0 z-0">
                {atlas}
              </div>
              <div ref={setDockHost} className="archive-dock-host archive-dock-host--phone" data-let-go={letGo ? '' : undefined} />
              <div data-archive-column className="explorer-rail explorer-rail--phone">
                <h2 className="sr-only font-ui">Places</h2>
                {chapters}
              </div>
              <ExplorerControls
                places={places}
                current={current}
                prev={prevPlace}
                next={nextPlace}
                listOpen={listOpen}
                onListOpen={setListOpen}
                onPrev={() => stepTo(-1)}
                onNext={() => stepTo(1)}
                onSelect={select}
                onEngage={setEngagedChapterId}
                phone
                visible={free}
                recentre={{ shown: recentreOn, place: recentrePlace, onRecentre: recentre }}
              />
            </div>
          )}
        </main>
        {/* Back to the start: the page is veiled while the explorer gives
            way to the opening words (never a scroll back up through the
            pass). Under the nav. */}
        <div className="home-veil" data-shown={pageVeiled ? '' : undefined} aria-hidden="true" />
      </div>

      {/* ── The Index: the archive's contact sheet, over the map (desktop) ── */}
      <AnimatePresence>
        {indexOpen && desktopLayout && (
          <motion.div
            key="index"
            className="explorer-index"
            role="dialog"
            aria-modal="true"
            aria-label="Index of the archive"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : DUR.out, ease: EASE.arrive }}
            inert={storyActive}
          >
            <ArchiveClosing
              collections={orderedCities}
              onBackToStart={leave}
              onOpenStory={openStoryFromClosing}
            />
            {/* PROPOSED copy: "Close index". */}
            <button
              type="button"
              className="explorer-index__close font-ui"
              onClick={closeIndex}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            >
              Close index <span aria-hidden="true">×</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
            entryMode="cover"
            entryOrigin={desktopLayout ? plateOriginRef.current ?? undefined : undefined}
          />
        )}
      </AnimatePresence>
    </>
  );
}
