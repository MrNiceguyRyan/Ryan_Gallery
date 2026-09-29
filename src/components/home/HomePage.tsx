import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import type { Collection } from '../../types';
import WalkIn from './WalkIn';
import ArchiveChapter from './ArchiveChapter';
import ArchiveClosing, { type ClosingStoryRequest } from './ArchiveClosing';
import GlobePrologue from './GlobePrologue';
import ExplorerControls, { type ExplorerPlace } from './ExplorerControls';
import MagazineLayout, { photoOrigin, readStubMarks, type PlateOrigin, type PlateStub } from './MagazineLayout';
import type { AtlasFlight, AtlasVoyage, RouteStop } from './RouteAtlas';
import { ARCHIVE_ENTRANCE_PHASES, entrancePhase } from '../../lib/archiveEntrance';
import { storyFrames } from '../../lib/storyPlan';
import { TICKET_STOCK, stockPaper } from '../../lib/ticketStock';
import { activeChapters, chapterSections } from '../../lib/chapterOrder';
import { chapterPoint } from '../../lib/geo';
import { coverDock, coverOf, coverRatioOf } from '../../lib/coverDock';
import { DUR, DUR_MS, EASE } from '../../lib/motion';
import { NOTES_LIVE } from '../../lib/notesNav';
import { OPENING_EVENT, type OpeningDetail } from '../../lib/openingFilm';
import {
  EXPLORE_EVENT,
  EXPLORER_START,
  announceExplorer,
  explore,
  neighbour,
  phoneCard,
  type ExplorerAction,
  type ExplorerEffect,
  type ExplorerState,
} from '../../lib/explorer';
import { ENTRY, entryQ } from '../../lib/explorerCamera';

// Keep parsing separate from mounting. The handoff can warm these chunks while
// the opening is settling without creating Mapbox's WebGL context or mounting
// the story overlay before either one is needed.
const loadRouteAtlas = () => import('./RouteAtlas');
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
  prologueProgress?: MotionValue<number>;
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
  voyage?: AtlasVoyage | null;
  onEngage?: (chapterId: string | null) => void;
  onSelect?: (chapterId: string) => void;
  onDismiss?: () => void;
  onArrive?: (token: number, arrived: boolean) => void;
  eager?: boolean;
  holdReveal?: boolean;
  engage?: boolean;
  covered?: boolean;
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

function DeferredRouteAtlas(props: DeferredRouteAtlasProps) {
  // The map is the page: it mounts at once (its chunk is warmed below).
  return (
    <div className="h-full w-full">
      <Suspense fallback={<RouteAtlasFallback mobile={props.mobile} entryProgress={props.entryProgress} />}>
        <RouteAtlas {...props} />
      </Suspense>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 *  HomePage — the archive as a map to roam (src/lib/explorer.ts)
 * ═══════════════════════════════════════════════════════
 * The first screen (his name and the globe on the desktop, the opener card
 * on a phone) lies over the map. Entered — a wheel, a swipe, a key, the cue,
 * or anyone's `requestExplore()` (the seam, src/lib/explorer.ts) — the
 * camera takes one calm move to stop 01, and the map is the reader's: drag
 * it, zoom it, choose a shield. The ticket in hand tears before anything
 * moves on; its stub tears off to open its story. The page does not scroll:
 * the archive's contact sheet (the Index) opens over the map. */
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
  // The pad under each ticket: the card stock of the (up to three) tickets
  // after it, nearest first.
  const chapterPadStocks = useMemo(
    () => orderedCities.map((_, index) =>
      orderedCities.slice(index + 1, index + 4).map((city) => stockPaper(city.slug)),
    ),
    [orderedCities],
  );
  // A region of two or more places is headed "REGION FLORIDA · 2 PLACES · 32
  // FRAMES" at its first place (owner, 2026-09-28: 保留): a tab on its cover.
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
  const walkInCollections = useMemo(
    () => orderedCities.map((city) => ({
      name: city.name.trim(),
      frames: city.photoCount ?? city.photos?.length ?? 0,
    })),
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
              dockTab: regionTabs.has(city._id),
            }]
          : [];
      }),
    [orderedCities, regionTabs],
  );
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
  // The desktop's two clocks for the entry (RouteAtlas follows them): the
  // globe's turn and glide, then the descent. On time, no longer the scroll's.
  const prologueProgress = useMotionValue(0);
  const entryProgress = useMotionValue(0);
  const entryAnimRef = useRef<{ stop: () => void } | null>(null);
  const [flight, setFlight] = useState<AtlasFlight | null>(null);
  const flightTokenRef = useRef(0);
  const entryFlightRef = useRef<number | null>(null);
  // The entry under way, for the globe's easter eggs.
  const [entryVoyage, setEntryVoyage] = useState<AtlasVoyage | null>(null);
  const [engagedChapterId, setEngagedChapterId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [veiled, setVeiled] = useState(false);
  // A sequence per gesture: a gesture's later steps (after a tear) are
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
    const returnFocus = chapterControl ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
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
  const tearTicket = useCallback((id: string, kind: 'tear-then' | 'tear-stub', go: () => void) => {
    const section = document.getElementById(`archive-item-${id}`);
    const detail: { go: () => void; handled?: boolean } = { go };
    section?.dispatchEvent(new CustomEvent(`archive:${kind}`, { detail }));
    if (!detail.handled) go();
  }, []);
  const nextFlight = useCallback((kind: AtlasFlight['kind'], id: string | null) => {
    flightTokenRef.current += 1;
    const next = { kind, id, token: flightTokenRef.current };
    setFlight(next);
    return next.token;
  }, []);

  // The desktop's entry: the globe turns to the Americas as it glides to the
  // focal point (the prologue's clock, on the sine of the turn itself,
  // src/lib/explorerCamera.ts `entryQ`), then the camera goes down onto the
  // place (the entrance's clock). Reduced motion: both at once, a cut.
  const dispatchRef = useRef<(action: ExplorerAction) => void>(() => {});
  const runEntry = useCallback((id: string | null) => {
    entryAnimRef.current?.stop();
    const entered = () => {
      entryAnimRef.current = null;
      setEntryVoyage(null);
      dispatchRef.current({ type: 'entered' });
    };
    if (!desktopLayout) {
      entryFlightRef.current = nextFlight('entry', id);
      setEntryVoyage({ chapterId: id ?? '', duration: ENTRY.phoneMinMs, token: flightTokenRef.current });
      return;
    }
    setEntryVoyage({ chapterId: id ?? '', duration: ENTRY.turnMs + ENTRY.diveMs, token: Date.now() });
    if (reduce) {
      prologueProgress.set(1);
      entryProgress.set(1);
      entered();
      return;
    }
    const q0 = prologueProgress.get();
    let stopped = false;
    let dive: { stop: () => void } | null = null;
    const turn = animate(0, 1, {
      duration: ENTRY.turnMs / 1000,
      ease: 'linear',
      onUpdate: (t) => prologueProgress.set(entryQ(t, q0, 0)),
      onComplete: () => {
        if (stopped) return;
        prologueProgress.set(1);
        dive = animate(entryProgress, 1, {
          duration: ENTRY.diveMs / 1000,
          ease: 'linear',
          onComplete: () => {
            if (!stopped) entered();
          },
        });
      },
    });
    entryAnimRef.current = {
      stop: () => {
        stopped = true;
        turn.stop();
        dive?.stop();
      },
    };
  }, [desktopLayout, entryProgress, nextFlight, prologueProgress, reduce]);

  // Back to the first screen: under a short veil the camera is set back on
  // the corner globe (the desktop's clocks to 0) or the planet (the phone),
  // and the first screen comes up again.
  const goHome = useCallback(() => {
    entryAnimRef.current?.stop();
    setEntryVoyage(null);
    setVeiled(true);
    window.setTimeout(() => {
      if (desktopLayout) {
        entryProgress.set(0);
        prologueProgress.set(0);
      } else {
        nextFlight('home', null);
      }
      window.setTimeout(() => setVeiled(false), 60);
    }, reduce ? 0 : DUR_MS.out);
  }, [desktopLayout, entryProgress, nextFlight, prologueProgress, reduce]);

  const play = useCallback((effects: ExplorerEffect[], gesture: number) => {
    const step = (index: number) => {
      if (index > 0 && gesture !== gestureRef.current) return;
      const effect = effects[index];
      if (!effect) return;
      const next = () => step(index + 1);
      switch (effect.type) {
        case 'tear':
          tearTicket(effect.id, 'tear-then', next);
          return;
        case 'tear-stub': {
          const collection = orderedCities.find((city) => city._id === effect.id);
          const captured = collection ? captureStory(collection) : undefined;
          tearTicket(effect.id, 'tear-stub', () => {
            if (gesture !== gestureRef.current || !collection) return;
            openCollection(collection, captured);
          });
          return;
        }
        case 'fly':
          nextFlight('fly', effect.id);
          next();
          return;
        case 'entry':
          runEntry(effect.id);
          next();
          return;
        case 'story': {
          // Opened by its tear (above) once the stub is free.
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
  }, [captureStory, goHome, nextFlight, openCollection, orderedCities, runEntry, tearTicket]);

  const dispatch = useCallback((action: ExplorerAction) => {
    const step = explore(explorerRef.current, action, placeIds);
    if (step.state === explorerRef.current && !step.effects.length) return;
    explorerRef.current = step.state;
    setExplorer(step.state);
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
      setEntryVoyage(null);
      dispatchRef.current({ type: 'entered' });
    }
  }, []);

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
    setEntryVoyage(null);
    if (desktopLayout) {
      prologueProgress.set(1);
      entryProgress.set(1);
    }
    if (state.phase === 'entering') dispatchRef.current({ type: 'entered' });
    if (state.current) nextFlight('cut', state.current);
  }, [desktopLayout, entryProgress, nextFlight, prologueProgress]);

  // ── The seam: anyone may ask for the explorer (src/lib/explorer.ts) ──
  useEffect(() => {
    announceExplorer({ phase: explorerRef.current.phase, current: explorerRef.current.current });
    // An ask is answered once: consumed here, so a later visit to the page
    // in the same window (a client-side navigation back) starts on the first
    // screen again rather than on a stale ask.
    const enter = () => {
      delete window.__archiveExploreAsked;
      dispatchRef.current({ type: 'enter' });
    };
    if (window.__archiveExploreAsked) enter();
    window.addEventListener(EXPLORE_EVENT, enter);
    return () => window.removeEventListener(EXPLORE_EVENT, enter);
  }, []);

  // ── The first screen hands over on the reader's first move ──
  // A wheel or a swipe, the keys that scroll, or the cue: the explorer is
  // entered (the page itself never scrolls). Not while the opening film
  // still covers the screen (its own keys fast-forward it).
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
  const reelCoveringRef = useRef(reelCovering);
  reelCoveringRef.current = reelCovering;
  useEffect(() => {
    if (explorer.phase !== 'globe') return;
    let touchY: number | null = null;
    const ready = () => !reelCoveringRef.current && !storyOpenRef.current;
    const enter = () => {
      if (ready()) dispatchRef.current({ type: 'enter' });
    };
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) >= 4 && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) enter();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, .globe-egg-key')) return;
      if (['ArrowDown', 'PageDown', ' ', 'Spacebar'].includes(event.key)) {
        event.preventDefault();
        enter();
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (touchY == null) return;
      const y = event.touches[0]?.clientY ?? touchY;
      if (touchY - y > 28) {
        touchY = null;
        enter();
      }
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [explorer.phase]);

  // ── Escape: the ticket in hand tears away ──
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (storyOpenRef.current || indexOpen || listOpen) return;
      if (explorerRef.current.phase !== 'explore' || !explorerRef.current.current) return;
      dispatchRef.current({ type: 'dismiss' });
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
  // The page never scrolls; under the story (its own scroller) the body is
  // clipped all the same, the only lock this page uses.
  useEffect(() => {
    document.body.style.backgroundColor = '#282c20';
    document.body.style.overflow = 'clip';
    return () => {
      document.body.style.overflow = '';
      document.body.style.backgroundColor = '';
    };
  }, []);

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

  // Nav pills stay hidden only while the opening card is resolving (WalkIn
  // marks that hand-off on the body).
  const [navPillsVisible, setNavPillsVisible] = useState(false);
  useEffect(() => {
    const show = () => setNavPillsVisible(true);
    // The desktop has no opener card: the wordmark and the pills come in at
    // once (the opening film, when it plays, keeps the nav under it).
    if (desktopLayout) document.body.classList.add('walkin-in');
    if (document.body.classList.contains('walkin-in')) show();
    const observer = new MutationObserver(() => {
      if (document.body.classList.contains('walkin-in')) show();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('walkin:reveal', show);
    return () => {
      observer.disconnect();
      window.removeEventListener('walkin:reveal', show);
    };
  }, [desktopLayout]);
  // Warm the map's chunk at once: the map is the page.
  useEffect(() => {
    void loadRouteAtlas();
  }, []);

  // The phone's card height: the camera sets a place in the band above it.
  const [phoneCardH, setPhoneCardH] = useState(0);
  useEffect(() => {
    if (desktopLayout) return;
    const size = () => {
      const tallest = routeStops.reduce((most, stop) => Math.max(most, phoneCard(window.innerWidth, window.innerHeight, stop.coverRatio ?? 1.5).h), 0);
      setPhoneCardH(tallest);
    };
    size();
    window.addEventListener('resize', size, { passive: true });
    return () => window.removeEventListener('resize', size);
  }, [desktopLayout, routeStops]);

  const [dockHost, setDockHost] = useState<HTMLDivElement | null>(null);
  // The place whose cover is up (src/lib/coverDock.ts): its rail shows with
  // it — never while the ticket tears or the camera flies (one large motion
  // at a time) — and with no cover up the rail says what the archive is.
  const [dockAt, setDockAt] = useState<string | null>(null);
  useEffect(() => coverDock.subscribe((frame) => {
    const id = frame.at;
    setDockAt((was) => (was === id ? was : id));
  }), []);
  const phase = explorer.phase;
  const entered = phase !== 'globe';
  const free = phase === 'explore';
  const select = useCallback((id: string) => {
    if (explorerRef.current.phase === 'globe') {
      // The globe's easter egg dealt a ticket: enter, straight to its place.
      dispatchRef.current({ type: 'enter', id });
      return;
    }
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
  const leave = useCallback(() => {
    setIndexOpen(false);
    setListOpen(false);
    dispatchRef.current({ type: 'leave' });
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
      prologueProgress={desktopLayout ? prologueProgress : undefined}
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
      voyage={entryVoyage}
      onEngage={setEngagedChapterId}
      onSelect={select}
      onDismiss={() => dispatchRef.current({ type: 'dismiss' })}
      onArrive={onArrive}
      eager
      holdReveal={reelCovering && !reelFramed}
      engage={reelCovering}
      covered={reelCovering}
    />
  );

  const chapters = orderedCities.map((city, index) => (
    <ArchiveChapter
      key={city._id}
      id={`archive-item-${city._id}`}
      collection={city}
      isActive={current === city._id}
      railShown={dockAt === city._id}
      onClick={() => openFromCover(city)}
      index={index}
      chapterIndex={index}
      chapterTotal={orderedCities.length}
      padStocks={chapterPadStocks[index]}
      preloadImageUrls={chapterPreloadUrls[index]}
      prioritizeImage={currentIndex < 0 ? index === 0 : Math.abs(index - currentIndex) <= 1}
      onEngagementChange={setEngagedChapterId}
      highlighted={engagedChapterId === city._id}
      variant="cover"
      desktopMotion
      phone={!desktopLayout}
      dockHost={dockHost}
      regionTab={regionTabs.get(city._id) ?? null}
      // A pull that tears the face away goes on to the next place; so does
      // the stub's "Next stop" (the ticket is torn already: nothing tears
      // twice).
      onTearAway={() => stepTo(1)}
      nextStop={(() => {
        const next = places.find((place) => place.id === neighbour(placeIds, city._id, 1));
        return next ? { name: next.name, number: next.number, region: next.region, slug: next.slug } : null;
      })()}
    />
  ));

  return (
    <>
      <div
        ref={pageRootRef}
        className="explorer-page relative h-[100dvh] overflow-hidden font-sans bg-[#282c20] text-[#F4F4ED]"
        data-explorer-phase={phase}
        data-explorer-place={current ?? undefined}
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
            aria-label="Ryan Xu — back to the first screen"
            onClick={() => {
              setSelectedCollection(null);
              leave();
            }}
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

        <main
          id="main-content"
          tabIndex={-1}
          className="relative z-10 h-full focus:outline-none"
          data-story-under={selectedCollection && !storyClosing ? 'true' : undefined}
        >
          {desktopLayout ? (
            /* ── The desktop explorer: the map full screen, the first screen
                over it, the place in hand's rail on the right. ── */
            <div className="explorer relative h-full w-full" data-veiled={veiled ? '' : undefined}>
              <GlobePrologue
                years={archiveYearSpan}
                progress={prologueProgress}
                covered={reelCovering}
                leaving={entered}
                onEnter={() => dispatchRef.current({ type: 'enter' })}
              />
              {/* `opening-atlas`: landing A lets the globe rise out of the dark
                  behind the words (global.css, "The opening film"). */}
              <aside className="explorer-stage opening-atlas absolute inset-y-0 left-0 z-10 h-full w-[78%]">
                {atlas}
                {/* The covers' dock: each place's cover rides here, on the
                    atlas, beside its shield (ArchiveChapter portals it in;
                    src/lib/coverDock.ts places it every camera frame). */}
                <div ref={setDockHost} className="archive-dock-host" />
              </aside>
              {/* The rail: the place in hand — its name and lede — down the
                  right of the page; with nothing in hand, the archive's own
                  line. It lets the pointer through to the map elsewhere. */}
              <div data-archive-column className="explorer-rail" data-entered={entered ? '' : undefined}>
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
                  <p className="explorer-idle__hint font-ui">Choose a shield on the map, or step through below.</p>
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
              />
            </div>
          ) : (
            /* ── The phone's explorer: the map full screen under the opener
                card; the place in hand's ticket dealt at the foot. ── */
            <div className="explorer explorer--phone relative h-full w-full" data-veiled={veiled ? '' : undefined}>
              <div className="explorer-stage absolute inset-0 z-0">
                {atlas}
              </div>
              <div ref={setDockHost} className="archive-dock-host archive-dock-host--phone" />
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
              />
              {/* The opener card over the map: a swipe up, a tap anywhere on
                  it, or its cue (the keyboard's way) hands the screen over. */}
              <div
                className="explorer-opener"
                data-leaving={entered ? '' : undefined}
                aria-hidden={entered}
                onClick={() => dispatchRef.current({ type: 'enter' })}
              >
                <WalkIn collections={walkInCollections} places={walkInCollections.length} />
                <button
                  type="button"
                  className="explorer-opener__cue font-ui"
                  tabIndex={entered ? -1 : 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    dispatchRef.current({ type: 'enter' });
                  }}
                >
                  Enter the map <span aria-hidden="true">↑</span>
                </button>
              </div>
            </div>
          )}
        </main>
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
