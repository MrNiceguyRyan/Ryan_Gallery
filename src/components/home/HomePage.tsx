import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useReducedMotion,
  useMotionValue,
  type MotionValue,
} from 'framer-motion';
import type { Collection } from '../../types';
import WalkIn from './WalkIn';
import ArchiveChapter from './ArchiveChapter';
import MagazineLayout from './MagazineLayout';
import type { RouteStop } from './RouteAtlas';
import LivingAtlasStory from './LivingAtlasStory';
import Magnetic from '../shared/Magnetic';
import { startLenis } from '../../lib/smoothScroll';
import { restoreStoryFocus } from '../../lib/storyFocus';
import { archiveEntryProgress, entrancePhase, ARCHIVE_ENTRANCE_PHASES } from '../../lib/archiveEntrance';
import type Lenis from 'lenis';

// Keep parsing separate from mounting. The handoff can warm these chunks while
// the opening is settling without creating Mapbox's WebGL context or mounting
// the story overlay before either one is needed.
const loadRouteAtlas = () => import('./RouteAtlas');
const RouteAtlas = lazy(loadRouteAtlas);

const expo = [0.16, 1, 0.3, 1] as const;
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
// photograph centre, not at the chapter's longer text-and-spacing container.
function archiveChapterAnchorY(element: HTMLElement, desktop: boolean) {
  const photoFrame = desktop
    ? element.querySelector<HTMLElement>('.archive-photo-frame')
    : null;
  const visualAnchor = photoFrame && photoFrame.offsetHeight > 0
    ? photoFrame
    : element;
  return documentTop(visualAnchor) + visualAnchor.offsetHeight * (desktop ? 0.5 : 0.19);
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
  reducedMotion: boolean;
  mobile?: boolean;
  paused?: boolean;
  presentation?: 'classic' | 'living';
  onNavigate?: (chapterId: string) => void;
}

function RouteAtlasFallback({ mobile = false, entryProgress, reducedMotion = false }: {
  mobile?: boolean;
  entryProgress?: MotionValue<number>;
  reducedMotion?: boolean;
}) {
  const stableProgress = useMotionValue(1);
  const opacity = useTransform(entryProgress ?? stableProgress, (p) =>
    reducedMotion ? 1 : entrancePhase(p, ...ARCHIVE_ENTRANCE_PHASES.mapVisibility),
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
    if (!shell || typeof IntersectionObserver === 'undefined') {
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
  }, [nearViewport, props.reducedMotion]);

  return (
    <div
      ref={shellRef}
      className="h-full w-full"
    >
      {nearViewport ? (
        <Suspense fallback={<RouteAtlasFallback mobile={mobile} entryProgress={props.entryProgress} reducedMotion={props.reducedMotion} />}>
          <RouteAtlas {...props} />
        </Suspense>
      ) : (
        <RouteAtlasFallback mobile={mobile} entryProgress={props.entryProgress} reducedMotion={props.reducedMotion} />
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
/* ═══════════════════════════════════════════════════════
 *  QuietIndexBand — a restrained marquee seam (landonorris-style),
 *  cooler/quieter than /travel's: one row, filled 14% type, em-dash
 *  separators, no glow. ONE name glows emerald — the live active
 *  chapter (or the first at top), a calm spotlight tied to scroll.
 * ═══════════════════════════════════════════════════════ */
function QuietIndexBand({
  names,
  activeArchiveId,
  fallbackArchiveId,
}: {
  names: { name: string; id: string | null }[];
  activeArchiveId: string | null;
  fallbackArchiveId: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const firstId = names.find((n) => n.id)?.id ?? null;
  const activeId = activeArchiveId ?? fallbackArchiveId ?? firstId;
  const { scrollYProgress: handoffProgress } = useScroll({
    target: rootRef,
    // Keep the index connected to the whole seam instead of completing its
    // motion as soon as the first line reaches mid-screen. The names continue
    // drifting while the atlas develops and reverse cleanly on upward scroll.
    offset: ['start end', 'end start'],
  });
  const handoffOpacity = useTransform(handoffProgress, [0, 0.14, 0.32], [0, 0.42, 1]);
  const handoffY = useTransform(handoffProgress, [0, 0.18, 0.42], [30, 15, 0]);
  const trackX = useTransform(handoffProgress, [0, 0.54, 1], ['3vw', '0vw', '-6vw']);
  const trackY = useTransform(handoffProgress, [0, 0.52, 1], [12, 0, -10]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.qm-name').forEach((el) => {
      el.classList.toggle('is-active', !!activeId && el.dataset.id === activeId);
    });
  }, [activeId, names]);

  if (!names.length) return null;

  const run = (key: string) => (
    <div className="flex shrink-0" aria-hidden="true" key={key}>
      {names.map((n, i) => (
        <span key={i} className="flex items-baseline">
          <span className="qm-name" data-id={n.id ?? ''}>
            {n.name}
          </span>
          <span className="qm-sep">&mdash;</span>
        </span>
      ))}
    </div>
  );

  return (
    <motion.div
      ref={rootRef}
      id="archive-index"
      role="presentation"
      className="quiet-marquee quiet-marquee-handoff relative z-30 -mt-[24svh] flex h-[24svh] w-full items-center"
      style={reduce ? undefined : { opacity: handoffOpacity, y: handoffY }}
    >
      <motion.div
        className="quiet-marquee-track relative"
        style={reduce ? undefined : { x: trackX, y: trackY }}
      >
        {run('a')}
        {run('b')}
      </motion.div>
    </motion.div>
  );
}

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
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [storyClosing, setStoryClosing] = useState(false);
  const [activeArchiveId, setActiveArchiveId] = useState<string | null>(null);
  const [engagedChapterId, setEngagedChapterId] = useState<string | null>(null);
  // Semantic city changes belong to React, but the optical timeline does not.
  // Keeping the current ID in a ref prevents every scroll frame from entering
  // React's state queue just to return the existing value.
  const activeArchiveIdRef = useRef<string | null>(null);
  const commitActiveArchiveId = useCallback((next: string | null) => {
    if (activeArchiveIdRef.current === next) return;
    activeArchiveIdRef.current = next;
    setActiveArchiveId(next);
  }, []);
  const storyOpenRef = useRef(false);
  const storyScrollYRef = useRef(0);
  const storyReturnFocusRef = useRef<HTMLElement | null>(null);
  const storySourceChapterIdRef = useRef<string | null>(null);
  const cancelStoryFocusRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelStoryFocusRef.current?.(), []);
  const bodyPaddingRightRef = useRef('');
  const openCollection = useCallback((collection: Collection) => {
    cancelStoryFocusRef.current?.();
    const chapterId = `archive-item-${collection._id}`;
    const chapter = document.getElementById(chapterId);
    const chapterControl = chapter?.querySelector<HTMLElement>('[role="button"], button');
    storyReturnFocusRef.current = chapterControl ?? (
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    );
    // Freeze the page in the same event frame as the story selection. Waiting
    // for the state effect left one residual smooth-scroll frame moving behind
    // the full-screen cover on quick trackpad clicks.
    storyOpenRef.current = true;
    storySourceChapterIdRef.current = chapterId;
    setStoryClosing(false);
    storyScrollYRef.current = window.scrollY;
    commitActiveArchiveId(`archive-item-${collection._id}`);
    lenisRef.current?.stop();
    setSelectedCollection(collection);
  }, [commitActiveArchiveId]);
  const closeCollection = useCallback(() => {
    // Keep the homepage frozen until the editorial Story cover and panel have
    // completed their exit. The map timeline resumes only after AnimatePresence.
    setStoryClosing(true);
    setSelectedCollection(null);
  }, []);
  const selectCollectionWithinStory = useCallback((collection: Collection) => {
    setSelectedCollection(collection);
  }, []);
  const finishStoryClose = useCallback(() => {
    storyOpenRef.current = false;
    setStoryClosing(false);
    cancelStoryFocusRef.current?.();
    const sourceId = storySourceChapterIdRef.current?.replace(/^archive-item-/, '');
    if (sourceId) {
      cancelStoryFocusRef.current = restoreStoryFocus(storyReturnFocusRef.current, sourceId);
    }
    storySourceChapterIdRef.current = null;
  }, []);
  const storyActive = !!selectedCollection || storyClosing;

  // Honour "reduce motion": skip the always-on ambient animations entirely.
  const reduce = useReducedMotion();
  const desktopLayout = useDesktopLayout();
  const useLivingAtlas = !desktopLayout;

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
  // canvas remains separately gated near the viewport.
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

  // "Selected Works" is part of the handoff, not a second entrance. Its layers
  // resolve directly from the same page scroll so fast and slow scrolling keep
  // the same visual order and reversing the gesture reverses the transition.
  const selectedWorksRef = useRef<HTMLDivElement>(null);
  const desktopAtlasSectionRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!desktopLayout || !desktopAtlasSectionRef.current) return;
    // Restored/deep-linked pages enter at their current position, never replay
    // a zero-progress opening for the first hydrated frame.
    const progress = archiveEntryProgress(window.scrollY, documentTop(desktopAtlasSectionRef.current), window.innerHeight);
    atlasEntryProgress.set(reduce ? (progress > 0 ? 1 : 0) : progress);
  }, [desktopLayout, atlasEntryProgress, reduce]);
  // Reverse parallax — the heading block counter-drifts (down) against the
  // covers' upward drift, so the text plane reads as nearer than the photos.
  // useScroll measures the static outer wrapper; the drift is applied to an
  // inner layer (no measure/transform feedback loop). Off when reduced.
  const { scrollYProgress: swScrollProgress } = useScroll({
    target: selectedWorksRef,
    offset: ['start end', 'end start'],
  });
  const headingReverseY = useTransform(swScrollProgress, [0, 1], reduce ? [0, 0] : [36, -36]);
  // The section heading announces the archive before its first frame opens;
  // photo titles and geographic controls resolve in the later score phases.
  const swKickerOpacity = useTransform(atlasEntryProgress, (p) => entrancePhase(p, 0.04, 0.3));
  const swKickerX = useTransform(swKickerOpacity, [0, 1], [-16, 0]);
  const swRuleScale = useTransform(atlasEntryProgress, (p) => entrancePhase(p, 0.02, 0.26));
  const swTitleOpacity = useTransform(atlasEntryProgress, (p) => entrancePhase(p, 0.1, 0.5));
  const swTitleY = useTransform(swTitleOpacity, [0, 1], [42, 0]);
  const swCountOpacity = useTransform(atlasEntryProgress, (p) => entrancePhase(p, 0.26, 0.62));
  const swCountX = useTransform(swCountOpacity, [0, 1], [12, 0]);
  // Filter to collections that have photos
  const activeCollections = useMemo(() => {
    const withPhotos = collections.filter((collection) => (collection.photos?.length || 0) > 0);
    // A partial route-order rollout must not reshuffle the published archive.
    // Once every active collection has a value, routeOrder becomes the single
    // deterministic source for inserting future locations between chapters.
    const hasCompleteRouteOrder = withPhotos.length > 0 && withPhotos.every(
      (collection) => Number.isFinite(collection.routeOrder),
    );
    return hasCompleteRouteOrder
      ? [...withPhotos].sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0))
      : withPhotos;
  }, [collections]);

  // Group active cities into ordered region sections. A section shows a
  // divider HEADER only when it has ≥2 cities; single-city regions (and
  // untagged collections) just render their chapter — no redundant header.
  // Cities remain the unit everywhere (observer, rail, accent, story).
  const sections = useMemo<RegionSection[]>(() => {
    const groups = new Map<string, Collection[]>();
    const order: string[] = [];
    for (const c of activeCollections) {
      const key = c.region?.trim() ? `r:${c.region.trim()}` : `s:${c._id}`;
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(c);
    }
    return order.map((key) => {
      const cities = groups.get(key)!;
      const isRegion = key.startsWith('r:') && cities.length >= 2;
      return {
        key,
        region: isRegion ? cities[0].region!.trim() : null,
        showHeader: isRegion,
        frameCount: cities.reduce((n, c) => n + (c.photoCount ?? c.photos?.length ?? 0), 0),
        cities,
      };
    });
  }, [activeCollections]);

  // Flat city list in on-screen order (region members grouped adjacent) — the
  // route rail + observer index against this.
  const orderedCities = useMemo(() => sections.flatMap((s) => s.cities), [sections]);
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
  const walkInCollections = useMemo(
    () => orderedCities.map((city) => ({
      name: city.name.trim(),
      frames: city.photoCount ?? city.photos?.length ?? 0,
    })),
    [orderedCities],
  );
  const cityDomId = (c: Collection) => `archive-item-${c._id}`;
  const mobileCityDomId = (c: Collection) => `mobile-archive-item-${c._id}`;

  // The route inset is driven by the archive's real geotags. A named-place
  // fallback keeps older, untagged collections on the same geographic trace.
  const routeStops = useMemo<RouteStop[]>(
    () =>
      orderedCities.flatMap((city) => {
        const points = (city.photos ?? [])
          .map((photo) => photo.location)
          .filter((location): location is NonNullable<typeof location> =>
            location?.lat != null && location?.lng != null,
          );
        const fallbackKey = [city.name, city.location, city.region]
          .filter(Boolean)
          .map((value) => value!.trim().toLowerCase())
          .find((value) => ROUTE_FALLBACKS[value]);
        const canonicalMapLocation = city.mapLocation;
        const hasCanonicalMapLocation =
          Number.isFinite(canonicalMapLocation?.lng) &&
          Number.isFinite(canonicalMapLocation?.lat) &&
          canonicalMapLocation!.lng >= -180 &&
          canonicalMapLocation!.lng <= 180 &&
          canonicalMapLocation!.lat >= -90 &&
          canonicalMapLocation!.lat <= 90;
        const coordinates: [number, number] | undefined = hasCanonicalMapLocation
          ? [canonicalMapLocation!.lng, canonicalMapLocation!.lat]
          : points.length
            ? [
                points.reduce((sum, point) => sum + point.lng, 0) / points.length,
                points.reduce((sum, point) => sum + point.lat, 0) / points.length,
              ]
            : fallbackKey
              ? ROUTE_FALLBACKS[fallbackKey]
              : undefined;

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
              frameCount: city.photoCount ?? city.photos?.length ?? 0,
              year: city.year,
              locationLabel,
              coordinateLabel: routeCoordinateLabel(coordinates),
            }]
          : [];
      }),
    [orderedCities],
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
  }, [activeCollections, orderedCities, routeStops]);


  // The index mirrors the real chapter order exactly. It does not preview
  // places that have no corresponding story in this archive.
  const indexNames = useMemo(
    () => useLivingAtlas
      ? routeStops.map((stop) => ({ name: stop.name, id: `archive-item-${stop.id}` }))
      : orderedCities.map((city) => ({ name: city.name.trim(), id: cityDomId(city) })),
    [orderedCities, routeStops, useLivingAtlas],
  );

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

  const navigateLivingChapter = useCallback((anchorId: string) => {
    const target = document.getElementById(anchorId);
    if (!target) return;

    // Move keyboard focus with the visual journey. `preventScroll` keeps focus
    // from snapping the page before Lenis/native scroll performs the same
    // calibrated movement used by pointer users.
    const chapterControl = target.querySelector<HTMLElement>('[role="button"], button');
    const chapterImage = target.querySelector<HTMLImageElement>('.archive-photo-frame img');
    if (chapterImage) {
      chapterImage.loading = 'eager';
      chapterImage.fetchPriority = 'high';
      if (typeof chapterImage.decode === 'function') void chapterImage.decode().catch(() => {});
    }
    chapterControl?.focus({ preventScroll: true });

    const readingLine = window.innerHeight * (desktopLayout ? 0.48 : 0.56);
    const targetY = archiveChapterAnchorY(target, desktopLayout) - readingLine;
    const lenis = lenisRef.current;
    if (lenis && !reduce) {
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
  }, [desktopLayout, reduce]);

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
    let atlasEntryDocumentY: number | null = null;
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
  }, [orderedCities, routeStops, desktopLayout, storyActive, archiveProgress, atlasEntryProgress, commitActiveArchiveId, reduce, useLivingAtlas]);

  useEffect(() => {
    const isOverlayOpen = storyActive;
    storyOpenRef.current = isOverlayOpen;
    document.body.style.backgroundColor = '#282c20';
    // Pause Lenis while the overlay is up so its own overflow-y-auto scrolls
    // natively; resume on close.
    if (isOverlayOpen) {
      const lockedScrollY = storyScrollYRef.current || window.scrollY;
      storyScrollYRef.current = lockedScrollY;
      lenisRef.current?.stop();
      bodyPaddingRightRef.current = document.body.style.paddingRight;
      const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.position = 'fixed';
      document.body.style.inset = `-${lockedScrollY}px 0 auto`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.position = '';
      document.body.style.inset = '';
      document.body.style.width = '';
      document.body.style.overflow = 'auto';
      document.body.style.paddingRight = bodyPaddingRightRef.current;
      if (storyScrollYRef.current > 0) {
        // `auto` inherits the page's smooth CSS behavior while Lenis is
        // stopped. Restoration must not replay the archive from scroll zero.
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
        document.body.style.paddingRight = bodyPaddingRightRef.current;
        window.scrollTo({ top: storyScrollYRef.current, behavior: 'instant' });
      }
      document.body.style.overflow = '';
      document.body.style.backgroundColor = '';
    };
  }, [storyActive]);

  // Site accent is a single fixed electric lime, defined once via the
  // @property initial values in global.css (--accent-r/g/b = 210/255/0);
  // every descendant reads it with rgb(var(--accent-r), ...). The former
  // per-chapter retint system is gone — nothing sets these vars at runtime.

  return (
    <>
      <div
        className="min-h-screen font-sans relative bg-[#282c20] text-[#F4F4ED]"
        inert={storyActive}
        aria-hidden={storyActive}
      >
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] inline-flex min-h-11 translate-y-[-160%] items-center rounded-full bg-[#F4F4ED] px-5 font-ui text-[10px] font-bold uppercase tracking-[0.2em] text-[#171b15] transition-transform duration-200 focus:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
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
            paddingTop: 'max(clamp(1.25rem, 2.1vw, 2.25rem), env(safe-area-inset-top))',
            paddingLeft: 'max(clamp(1.5rem, 3.35vw, 3rem), env(safe-area-inset-left))',
            paddingRight: 'max(clamp(1.5rem, 3.35vw, 3rem), env(safe-area-inset-right))',
          }}
        >
          <motion.button
            type="button"
            aria-label="Ryan Xu — back to top"
            onClick={() => {
              setSelectedCollection(null);
              window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
            }}
            whileHover={reduce ? undefined : { scale: 1.04 }}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={{ duration: 0.2, ease: expo }}
            className="flex min-h-11 min-w-11 items-center gap-3 py-2 font-serif text-lg font-medium uppercase leading-none tracking-[0.16em] text-[#F4F4ED] mix-blend-difference transition-opacity duration-200 hover:opacity-60 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00] md:text-[21px] md:tracking-[0.12em]"
          >
            {/* Slides down from above once the opening reveals (body.walkin-in,
                 flipped by WalkIn) — the reference's header entrance. */}
            <span className="block overflow-hidden">
              <span className="walkin-nav block">Ryan&nbsp;Xu</span>
            </span>
          </motion.button>

          <div
            className="flex items-center gap-2 transition-opacity duration-500 md:gap-3"
            aria-hidden={!navPillsVisible}
            inert={!navPillsVisible}
            style={{
              opacity: navPillsVisible ? 1 : 0,
              pointerEvents: navPillsVisible ? 'auto' : 'none',
            }}
          >
            <Magnetic strength={0.32}>
              <motion.a
                whileHover={reduce ? undefined : { scale: 1.05 }}
                whileTap={reduce ? undefined : { scale: 0.95 }}
                href={atlasHref}
                data-astro-prefetch="hover"
                tabIndex={navPillsVisible ? 0 : -1}
                className="inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-full border border-white/10 bg-[#171b15]/80 px-3.5 text-[9px] font-bold uppercase tracking-[0.25em] text-white shadow-[0_10px_34px_rgba(7,9,6,0.18)] transition-colors duration-300 hover:bg-[#171b15]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00] md:min-w-[5.5rem] md:bg-[#171b15]/60 md:px-6 md:text-[10px] md:tracking-[0.3em] md:backdrop-blur-xl md:hover:bg-[#171b15]/75"
              >
                Map
              </motion.a>
            </Magnetic>

            <Magnetic strength={0.32}>
              <motion.a
                whileHover={reduce ? undefined : { scale: 1.05 }}
                whileTap={reduce ? undefined : { scale: 0.95 }}
                href="/about"
                tabIndex={navPillsVisible ? 0 : -1}
                className="inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-full border border-white/10 bg-[#171b15]/80 px-3.5 text-[9px] font-bold uppercase tracking-[0.25em] text-white shadow-[0_10px_34px_rgba(7,9,6,0.18)] transition-colors duration-300 hover:bg-[#171b15]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00] md:min-w-[5.5rem] md:bg-[#171b15]/60 md:px-6 md:text-[10px] md:tracking-[0.3em] md:backdrop-blur-xl md:hover:bg-[#171b15]/75"
              >
                About
              </motion.a>
            </Magnetic>
          </div>
        </nav>

        {/* ── The opening — the original paper-to-olive entrance develops the
             quiet editorial cover, then grows it to full bleed. ── */}
        <WalkIn collections={walkInCollections} places={walkInCollections.length} />

        {/* The city index is the single, lightweight seam between the opening
            cover and the live atlas chapter. */}
        {!useLivingAtlas && (
          <QuietIndexBand
            names={indexNames}
            activeArchiveId={activeArchiveId}
            fallbackArchiveId={orderedCities[0] ? cityDomId(orderedCities[0]) : null}
          />
        )}

        {/* One responsive archive tree at a time. This keeps Mapbox and every
             motion observer from mounting twice behind CSS-only visibility. */}
        <main id="main-content" tabIndex={-1} className="relative z-10 focus:outline-none">
          {useLivingAtlas ? (
            <LivingAtlasStory
              stops={routeStops}
              activeIndex={livingAtlasActiveIndex}
              chapterProgress={archiveProgress}
              mobile={!desktopLayout}
              reducedMotion={!!reduce}
              paused={storyActive}
              atlas={
                <DeferredRouteAtlas
                  stops={routeStops}
                  activeIndex={livingAtlasActiveIndex}
                  chapterProgress={archiveProgress}
                  reducedMotion={!!reduce}
                  mobile={!desktopLayout}
                  paused={storyActive}
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
          <div ref={desktopAtlasSectionRef} className="relative pb-8 pt-24 lg:pt-0">
          {/* The blurred active-chapter photo backdrop was removed — no photo
               used as background anywhere; the contour atmosphere carries it. */}

          <div className="relative flex w-full flex-col lg:flex-row lg:items-start lg:overflow-visible">
            {/* A full-bleed Mapbox field anchors the archive. The photo column
                 overlaps its soft seam so map and work read as one editorial
                 spread instead of two adjacent widgets. */}
            <aside className="sticky top-0 z-10 hidden h-screen h-[100dvh] w-[78%] shrink-0 lg:block">
              <DeferredRouteAtlas
                stops={routeStops}
                activeIndex={routeStops.findIndex((stop) => stop.id === orderedCities[activeRouteIndex]?._id)}
                chapterIds={orderedChapterIds}
                chapterProgress={archiveProgress}
                entryProgress={atlasEntryProgress}
                reducedMotion={!!reduce}
                paused={storyActive}
                engagedChapterId={engagedChapterId}
                onNavigate={(chapterId) => navigateLivingChapter(`archive-item-${chapterId}`)}
              />
            </aside>

            {/* The atlas does not stop on a section boundary. Near the end of
                 the archive a long, page-coloured veil rises through the sticky
                 map, so geography releases into the site canvas before the
                 sticky layer unpins. It sits above the map and below the work. */}
            <div
              aria-hidden="true"
              className="route-atlas-release pointer-events-none absolute -bottom-px inset-x-0 z-[15] hidden h-[52svh] lg:block"
            />

            {/* Exhibition Content — leans subtly with scroll velocity */}
            <div className="relative z-20 flex min-w-0 flex-1 flex-col gap-14 overflow-visible px-6 md:gap-20 md:px-12 lg:-ml-[36%] lg:w-[58%] lg:flex-none lg:pl-0 lg:pr-12 lg:pt-28 xl:pr-16">
              <div ref={selectedWorksRef} className="relative max-w-2xl lg:ml-[12%]">
                <motion.div style={reduce ? undefined : { y: headingReverseY }} className="space-y-5">
                <motion.div
                  style={reduce ? undefined : { opacity: swKickerOpacity, x: swKickerX }}
                  className="flex items-center gap-4 text-[9px] uppercase tracking-[0.6em] font-bold text-white/52"
                >
                  <motion.div
                    className="h-px origin-left"
                    style={{
                      width: 32,
                      background: 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))',
                      scaleX: reduce ? 1 : swRuleScale,
                    }}
                  />
                  <span>Selected Works</span>
                </motion.div>
                <motion.h2
                  className="max-w-[12ch] font-serif uppercase leading-[0.86] tracking-[-0.055em]"
                  style={{
                    fontSize: 'clamp(44px, 5.6vw, 84px)',
                    ...(reduce ? {} : { opacity: swTitleOpacity, y: swTitleY }),
                  }}
                >
                  Curating the world through a distilled{' '}
                  <span className="text-[#D2FF00]">lens.</span>
                </motion.h2>
                <motion.div
                  className="flex min-h-11 items-center gap-3 font-ui text-[9px] uppercase tracking-[0.3em] text-white/48"
                  style={reduce ? undefined : { opacity: swCountOpacity, x: swCountX }}
                >
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="marker-breathe absolute inset-0 rounded-full bg-[#D2FF00]" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-[#D2FF00]" />
                  </span>
                  <span>Select any frame to enter its story</span>
                </motion.div>
                </motion.div>
              </div>

              <div className="space-y-14 md:space-y-20 lg:pl-[2%]">
                {sections.map((section) => (
                    <section
                      key={section.key}
                      aria-label={section.region ? `Region: ${section.region}` : undefined}
                      className="space-y-8 md:space-y-12"
                    >
                      {section.showHeader && section.region && (
                        <div
                          className="relative flex w-full items-center gap-4 py-5"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#D2FF00]" />
                          <span className="font-ui text-[9px] uppercase tracking-[0.32em] text-white/54">Region</span>
                          <span className="font-serif text-xl uppercase tracking-[-0.02em] text-[#F4F4ED]">
                            {section.region}
                          </span>
                          <span className="ml-auto font-ui text-[9px] uppercase tracking-[0.22em] text-white/52">
                            {section.cities.length} places · {section.frameCount} frames
                          </span>
                        </div>
                      )}
                      <div className="space-y-14 md:space-y-20">
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
                                  chapterProgress={archiveProgress}
                                  handoffProgress={index === 0 ? atlasEntryProgress : undefined}
                                  preloadImageUrls={chapterPreloadUrls[index]}
                                  prioritizeImage={
                                    activeRouteIndex < 0
                                      ? index === 0
                                      : Math.abs(index - activeRouteIndex) <= 1
                                  }
                                  onEngagementChange={setEngagedChapterId}
                                  variant="cover"
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
            <h2 className="sr-only">Selected Works</h2>
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
                        <div className="mobile-route-region pointer-events-none absolute left-5 top-[12svh] flex items-center gap-3 font-ui text-[9px] uppercase tracking-[0.3em] text-white/56">
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

        {/* ── Archive end-cap — the page's closing punctuation ── */}
        <div className="flex flex-col items-center gap-4 pb-16 pt-8 text-center opacity-70">
          <div
            className="h-1 w-1 rounded-full"
            style={{ background: 'rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.72)' }}
          />
          <span className="font-ui text-[10px] uppercase tracking-[0.34em] text-white/72">
            {String(orderedCities.length).padStart(2, '0')} / {String(orderedCities.length).padStart(2, '0')} · Archive complete
          </span>
          <button
            type="button"
            onClick={() => document.getElementById('archive-index')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })}
            className="min-h-11 font-ui text-[9px] uppercase tracking-[0.32em] text-[#D2FF00]/82 transition-colors hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00]"
          >
            Back to index ↑
          </button>
        </div>

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
            entryMode="cover"
          />
        )}
      </AnimatePresence>
    </>
  );
}
