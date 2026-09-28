import { useState, useMemo, useRef, useCallback, useEffect, useId, Component } from 'react';
import type { ReactNode, ErrorInfo, MouseEvent as ReactMouseEvent } from 'react';
import MapGL, { Marker, NavigationControl, AttributionControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import Supercluster from 'supercluster';
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion';
import { RotateCcw, X } from 'lucide-react';
import { ATLAS_PAPER, silenceArchivePlaceLabels } from '../lib/atlasBasemap';
import { greatCircle } from '../lib/routeGeometry';
import { CSS_EASE, DUR_MS, EASE, bezierFn } from '../lib/motion';
import { TRAVEL_PLATE_HOLD_MS, TRAVEL_PLATE_RELEASE_MS, clearTravelPlate, markTravelPlate } from '../lib/travelPlate';
import { MAP_INK, MAP_INK_RGB } from '../lib/mapInk';
import { LANDMARK_VIEWBOX, landmarkFor } from '../lib/placeLandmarks';
import { flightMs, greatCircleKm, landingCamera, leadOf, routeKm, sheetHeight } from '../lib/travelSilver';
import type { SheetMode, TravelChapter, TravelViewport } from '../lib/travelSilver';
import TravelIndex, { TravelRows } from './travel/TravelIndex';
import type { TravelFlight } from './travel/TravelIndex';
import TravelTicket, { warmPlate } from './travel/TravelTicket';

// ─── The map ───
// /travel's map is the original atlas (owner, 2026-09-27: 只需要中间的地图这样
// 即可): dark-v11 graded into the site's olive emulsion on a globe, every
// place a white-ink mark with its name set beside it, places that stand close
// together gathered into a bone disc carrying their count and their region's
// name. No route is drawn (owner, 2026-09-27: map的地图不需要路线): the places
// stand on their own; the route belongs to the homepage atlas. Around it the page is
// today's: the chapters' index and tickets in the rail (TravelIndex), the
// phone sheet, and the ticket's plate grown into its story. Choosing on the
// map chooses the chapter in the rail; choosing a row flies the map.

// ─── Ink ───
// Marks ON the map are white ink seated on a dark burn — the homepage atlas's
// language (src/lib/mapInk.ts). The owner turned lime and yellow on the map
// down twice ("太奇怪"). Lime stays in the INTERFACE — focus outlines, the
// masthead's one accent word — never on the canvas.
const MAP_BURN_RGB = '11, 14, 9';
/** A mark dimmed while another chapter is selected. Dimmed by COLOUR — the ink
 *  at 35% over the atlas ground, mixed solid — not by opacity: a see-through
 *  dot let the route's dashes run through it. */
const MAP_INK_DIM = '#6B706A';
/** A place's landmark is detail for a close look: below this zoom the whole
 *  archive is on screen and a drawing would crowd its neighbours. */
const LANDMARK_MIN_ZOOM = 5;

/** Which side of its mark a place's landmark stands on. */
type LandmarkSide = 'above' | 'right' | 'left' | 'below';
/** px per viewBox unit: `.travel-landmark` draws the 44-unit box at 72px. */
const LANDMARK_UNIT = 72 / 44;
/** The drawings span about ±13 units across. */
const LANDMARK_HALF_WIDTH = 13 * LANDMARK_UNIT;

/** Which side of its mark a place's name is set on — the left east of 82°W.
 *  The landmark never takes that side. */
const nameSitsLeft = (lng: number) => lng > -82;

/**
 * Where a landmark's ground line (its viewBox origin, the box's middle) sits
 * relative to the centre of its mark. `clearance` clears the mark's ring.
 * Above: standing over the place. Beside: standing level with it, clear of the
 * ring. Below: hung under it.
 */
function landmarkOrigin(side: LandmarkSide, height: number, clearance: number) {
  const tall = height * LANDMARK_UNIT;
  if (side === 'below') return { x: 0, y: clearance + tall };
  if (side === 'right') return { x: clearance + 2 + LANDMARK_HALF_WIDTH, y: tall / 2 };
  if (side === 'left') return { x: -(clearance + 2 + LANDMARK_HALF_WIDTH), y: tall / 2 };
  return { x: 0, y: -clearance };
}

/**
 * The first side, in order of preference, whose drawing no leg of the route
 * runs through. The route is canvas and the drawing is a DOM mark over it, so
 * a leg that crossed the drawing did not pass behind it — it read as a line
 * that stopped dead at the picture. `paths` are the place's legs in screen px,
 * each starting at the mark's centre.
 */
function chooseLandmarkSide(
  paths: Array<Array<{ x: number; y: number }>>,
  height: number,
  clearance: number,
  sides: LandmarkSide[],
): LandmarkSide {
  const tall = height * LANDMARK_UNIT;
  const pad = 6;
  const crossed = (side: LandmarkSide) => {
    const origin = landmarkOrigin(side, height, clearance);
    const x0 = origin.x - LANDMARK_HALF_WIDTH - pad;
    const x1 = origin.x + LANDMARK_HALF_WIDTH + pad;
    const y0 = origin.y - tall - pad;
    const y1 = origin.y + pad;
    return paths.some((path) => path.some((point, index) => {
      if (index === 0) return false;
      const from = path[index - 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / 2));
      for (let step = 0; step <= steps; step += 1) {
        const x = from.x + ((point.x - from.x) * step) / steps;
        const y = from.y + ((point.y - from.y) * step) / steps;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
      }
      return false;
    }));
  };
  return sides.find((side) => !crossed(side)) ?? sides[0];
}

/**
 * The chapter's own landmark, drawn beside its mark once the camera has come
 * to rest on it — the drawing the homepage atlas gives a place at close range,
 * from the same shared source (`placeLandmarks.tsx`) and the same
 * `.af-place__*` inks, so the two maps draw a place with one hand.
 *
 * Always mounted when the place has a drawing, so it can fade OUT as well as
 * in: visibility is a class, not a mount. The body (the dark mass under the
 * ink) is feathered out towards its edges, so it is a burn under the ink
 * rather than a hard rectangle on this map's darker ground.
 */
function TravelLandmark({
  slug,
  shown,
  side,
  clearance,
}: {
  slug?: string | null;
  shown: boolean;
  side: LandmarkSide;
  clearance: number;
}) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const landmark = landmarkFor(slug);
  if (!landmark) return null;
  const origin = landmarkOrigin(side, landmark.height, clearance);
  return (
    <svg
      className={`travel-landmark${shown ? ' is-shown' : ''}`}
      viewBox={LANDMARK_VIEWBOX}
      aria-hidden="true"
      style={{
        ['--landmark-x' as never]: `${origin.x}px`,
        ['--landmark-y' as never]: `${origin.y}px`,
      }}
    >
      {landmark.body && (
        <>
          <defs>
            <radialGradient id={`${uid}-feather`} cx="0.5" cy="0.55" r="0.5">
              <stop offset="0.42" stopColor="#fff" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id={`${uid}-body`} maskContentUnits="objectBoundingBox">
              <rect width="1" height="1" fill={`url(#${uid}-feather)`} />
            </mask>
          </defs>
          <path className="af-place__body" d={landmark.body} mask={`url(#${uid}-body)`} />
        </>
      )}
      <g dangerouslySetInnerHTML={{ __html: landmark.full }} />
    </svg>
  );
}

const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';

/**
 * Grade dark-v11 into the same olive emulsion the homepage atlas uses, so the
 * same geography does not look like it came from a different product, and the
 * basemap's own type sits a clear step below the page's labels. This map IS
 * the interface here, so place names stay readable — one step below the UI,
 * not hidden.
 */
function gradeAtlasBasemap(map: any) {
  map.getStyle()?.layers?.forEach((layer: any) => {
    const id = layer.id.toLowerCase();

    if (layer.type === 'fill-extrusion') {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
      return;
    }

    if (layer.type === 'background') {
      map.setPaintProperty(layer.id, 'background-color', ATLAS_PAPER.background);
      return;
    }

    if (layer.type === 'fill') {
      if (id.includes('water')) {
        map.setPaintProperty(layer.id, 'fill-color', ATLAS_PAPER.water);
        map.setPaintProperty(layer.id, 'fill-opacity', 0.92);
      } else if (id.includes('park') || id.includes('landuse') || id.includes('landcover')) {
        map.setPaintProperty(layer.id, 'fill-color', ATLAS_PAPER.land);
        map.setPaintProperty(layer.id, 'fill-opacity', 0.34);
      } else if (id.includes('building')) {
        map.setPaintProperty(layer.id, 'fill-color', ATLAS_PAPER.building);
        map.setPaintProperty(layer.id, 'fill-opacity', 0.12);
      }
      return;
    }

    if (layer.type === 'line') {
      if (id.includes('admin') || id.includes('boundary')) {
        map.setPaintProperty(layer.id, 'line-color', '#AEB6A9');
        map.setPaintProperty(layer.id, 'line-width', 0.74);
        map.setPaintProperty(layer.id, 'line-opacity', 0.42);
      } else if (id.includes('motorway') || id.includes('trunk') || id.includes('primary')) {
        map.setPaintProperty(layer.id, 'line-color', '#8C9588');
        map.setPaintProperty(layer.id, 'line-opacity', 0.4);
      } else if (id.includes('secondary') || id.includes('tertiary')) {
        map.setPaintProperty(layer.id, 'line-color', '#737D6D');
        map.setPaintProperty(layer.id, 'line-opacity', 0.26);
      } else if (id.includes('road') || id.includes('street')) {
        map.setPaintProperty(layer.id, 'line-color', '#667064');
        map.setPaintProperty(layer.id, 'line-opacity', 0.15);
      } else if (id.includes('waterway')) {
        map.setPaintProperty(layer.id, 'line-color', '#657168');
        map.setPaintProperty(layer.id, 'line-opacity', 0.3);
      }
      return;
    }

    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) return;

    if (
      id.includes('poi')
      || id.includes('transit')
      || id.includes('airport')
      || id.includes('building-number')
    ) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
      return;
    }

    const isPlaceLabel =
      id.includes('settlement')
      || id.includes('place')
      || id.includes('city')
      || id.includes('town')
      || id.includes('village');
    const isAtlasLabel = id.includes('state-label') || id.includes('country-label');
    const isRoadLabel = id.includes('road') || id.includes('street');

    map.setPaintProperty(
      layer.id,
      'text-opacity',
      isPlaceLabel ? 0.6 : isAtlasLabel ? 0.38 : isRoadLabel ? 0.2 : 0.24,
    );
    map.setPaintProperty(layer.id, 'text-color', '#C2C8B8');
    map.setPaintProperty(layer.id, 'text-halo-color', '#11150F');
    map.setPaintProperty(layer.id, 'text-halo-width', 0.7);
    map.setPaintProperty(layer.id, 'text-halo-blur', 0.5);
  });
}

/** The olive-black air around the globe, the homepage atlas's. */
const ATLAS_FOG = {
  color: 'rgb(30, 36, 28)',
  'high-color': 'rgb(49, 58, 45)',
  'horizon-blend': 0.08,
  'space-color': 'rgb(9, 12, 9)',
  'star-intensity': 0.18,
};

// ─── Error Boundary ───
interface ErrorBoundaryState { hasError: boolean; error: Error | null }
class MapErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('MapboxMap error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[#171b15] px-8 text-center md:rounded-[1.35rem]">
          <span className="mb-4 h-2 w-2 rounded-full bg-[#F4F4ED]/80" aria-hidden="true" />
          <p className="font-serif text-2xl uppercase text-[#F4F4ED]">Atlas unavailable</p>
          <p className="mt-2 max-w-sm font-ui text-[10px] uppercase tracking-[0.1em] text-white/58">The geographic archive could not be drawn.</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} className="mt-5 inline-flex min-h-11 items-center rounded-full border border-white/14 px-5 font-ui text-[9px] uppercase tracking-[0.1em] text-white/72 transition-colors duration-300 hover:border-[#D2FF00]/45 hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]">Retry atlas</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── The places ───
// One point per place (a city a chapter's frames were made in), in the
// chapters' reading order. New York is one chapter of two places, Manhattan
// and Midtown; they share its number and its selection.
interface MapPlace {
  city: string;
  lng: number;
  lat: number;
  frames: number;
  slug: string;
  /** 1-based, the homepage's chapter number. */
  chapterNo: number;
  /** The chapter's mark place (the cover's): it carries the landmark and the
   *  arrival ring. */
  lead: boolean;
  /** The chapter's region (Florida, Utah, Arizona…), for a cluster's name. */
  region: string;
}

type AtlasClusterFeature = {
  id?: number | string;
  properties: {
    cluster?: boolean;
    cluster_id?: number;
    point_count?: number;
    placeIndex?: number;
  };
  geometry: { type: 'Point'; coordinates: number[] };
};

type ClusterMorphRole = 'stable' | 'parent' | 'child';

type ClusterMorphTopologyNode = {
  key: string;
  feature: AtlasClusterFeature;
  role: ClusterMorphRole;
  from: [number, number];
  to: [number, number];
  siblingCount: number;
};

type ClusterRenderNode = ClusterMorphTopologyNode & {
  coordinates: [number, number];
  opacity: number;
  scale: number;
  interactive: boolean;
};

const CLUSTER_WORLD_BOUNDS: [number, number, number, number] = [-180, -85, 180, 85];

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothZoomMorph(value: number) {
  const t = clampUnit(value);
  return t * t * (3 - 2 * t);
}

function atlasFeatureKey(feature: AtlasClusterFeature) {
  return feature.properties.cluster
    ? `cluster-${String(feature.id ?? feature.properties.cluster_id)}`
    : `city-${String(feature.properties.placeIndex)}`;
}

/** A cluster names its region; the Southwest's three canyons are Utah and
 *  Arizona together. */
function clusterName(regions: string[]) {
  if (regions.length === 1) return regions[0];
  if (regions.length > 0 && regions.every((region) => region === 'Utah' || region === 'Arizona')) return 'Southwest';
  return 'Locations';
}

// ─── Camera ───
// The map opens settled on the archive — no dive from space (dropped in
// 2026-07: the whole-globe zoom was heavy and the owner chose to lose it).
const FINAL_VIEW = { latitude: 38.8, longitude: -97.5, zoom: 3.5, pitch: 0, bearing: 0 };
// Every trip rides the house travel curve (src/lib/motion.ts), a beat longer
// the further it goes (travelSilver.flightMs); the reset takes the long way.
const TRAVEL_EASE = bezierFn(EASE.travel);
const ARRIVE_EASE = bezierFn(EASE.arrive);
const FLIGHT_CURVE = 1.42;
const OVERVIEW_MS = 1400;
const SHEET_REFRAME_MS = 620;
// A flight whose moveend comes within a frame of its own full clock landed;
// an earlier one was stopped (a drag, a wheel zoom, a resize).
const FLIGHT_LANDED_SLACK_MS = 17;
/** The ticket-to-story hand-off waiting for its page change (its listeners'
 *  remover), so a second click replaces it rather than adding another. It
 *  outlives this component: the hand-off runs as the page is swapped. */
let pendingPlateHandoff: (() => void) | null = null;

function slugifyPlace(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Main Inner Component ───
function MapboxMapInner({ chapters, mapboxToken }: { chapters: TravelChapter[]; mapboxToken: string }) {
  const mapRef = useRef<MapRef>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const atlasStyleReadyRef = useRef(false);
  const atlasReadySignaledRef = useRef(false);
  const initialPlaceAppliedRef = useRef(false);
  const clusterZoomFrameRef = useRef(0);
  const pendingClusterZoomRef = useRef(FINAL_VIEW.zoom);
  const sheetDragControls = useDragControls();
  const mobileSheetHeaderRef = useRef<HTMLButtonElement>(null);
  const prefersReduced = !!useReducedMotion();
  const reduceRef = useRef(prefersReduced);
  reduceRef.current = prefersReduced;
  const coarsePointer = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  );

  const [mobileLayout, setMobileLayout] = useState(false);
  const [viewState, setViewState] = useState(FINAL_VIEW);
  const [clusterZoom, setClusterZoom] = useState(FINAL_VIEW.zoom);
  const [clusterMorphing, setClusterMorphing] = useState(false);
  // The chapter chosen (a mark, the index row, the ticket, the URL) and the
  // chapter the camera has come to rest on. They differ for a flight's length.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [landedSlug, setLandedSlug] = useState<string | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  // Arrival: one thin ring round the chapter's mark, only when a flight ran
  // its full clock. Every flight carries a token in its eventData and only the
  // newest flight's own moveend can land — a second selection interrupts the
  // first with stop(), which fires the FIRST flight's moveend while the
  // second is already in the air.
  const [arrivedSlug, setArrivedSlug] = useState<string | null>(null);
  const [landmarkSlug, setLandmarkSlug] = useState<string | null>(null);
  const [flight, setFlight] = useState<TravelFlight | null>(null);
  const [layersReady, setLayersReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<SheetMode>('peek');

  // Mirrors for the map's own event handlers, which outlive any one render.
  const selectedRef = useRef<string | null>(null);
  const landedRef = useRef<string | null>(null);
  const mobileSheetRef = useRef<SheetMode>('peek');
  mobileSheetRef.current = mobileSheet;
  // The sheet height the camera last framed for, so a sheet change the
  // camera already flew for (a selection) is not framed twice.
  const sheetFramedRef = useRef<SheetMode>('peek');
  const flightTokenRef = useRef(0);
  const flightStartRef = useRef(0);
  const flightDurationRef = useRef(0);
  const flightSlugRef = useRef<string | null>(null);
  // The side each chapter's landmark stands on, chosen once at its landing
  // and kept, so a drawing fading OUT leaves from where it stood.
  const landmarkSideRef = useRef<Record<string, LandmarkSide>>({});

  const bySlug = useMemo(() => new Map(chapters.map((chapter) => [chapter.slug, chapter])), [chapters]);
  const leads = useMemo(() => chapters.map(leadOf), [chapters]);
  const totalKm = useMemo(() => routeKm(leads), [leads]);
  const frameCount = useMemo(() => chapters.reduce((sum, chapter) => sum + chapter.frames.length, 0), [chapters]);
  const places = useMemo<MapPlace[]>(() => chapters.flatMap((chapter, index) => chapter.places.map((place, placeIndex) => ({
    city: place.city,
    lng: place.lng,
    lat: place.lat,
    frames: place.frames,
    slug: chapter.slug,
    chapterNo: index + 1,
    lead: placeIndex === chapter.lead,
    region: chapter.region || chapter.name,
  }))), [chapters]);
  const archiveBounds = useMemo(() => {
    if (!places.length) return null;
    const lngs = places.map((place) => place.lng);
    const lats = places.map((place) => place.lat);
    return [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ] as [[number, number], [number, number]];
  }, [places]);
  // A place on this map is named once, by the archive: the basemap is asked
  // not to set its own label for a place (or a chapter) the archive names.
  const archiveNames = useMemo(
    () => [...new Set([...places.map((place) => place.city), ...chapters.map((chapter) => chapter.name)])],
    [chapters, places],
  );
  // THE ROUTE — the archive's path through its places in reading order,
  // drawn as the homepage atlas draws it: great-circle legs from the same
  // geometry source, one feature per leg, tagged with the chapter at each end
  // so a chosen chapter lights exactly its own legs (New York's short inner
  // leg has the chapter at both ends, so it lights with it).
  const routeGeo = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: places.slice(1).map((to, index) => {
      const from = places[index];
      return {
        type: 'Feature' as const,
        properties: { from: from.chapterNo, to: to.chapterNo },
        geometry: { type: 'LineString' as const, coordinates: greatCircle([from.lng, from.lat], [to.lng, to.lat]) },
      };
    }),
  }), [places]);

  useEffect(() => () => {
    if (clusterZoomFrameRef.current) window.cancelAnimationFrame(clusterZoomFrameRef.current);
    delete document.documentElement.dataset.atlasReady;
  }, []);

  // The arrival ring plays once; it is taken away after it has gone, so a
  // mark remounted by the cluster morph does not ring a second time.
  useEffect(() => {
    if (!arrivedSlug) return;
    const timer = window.setTimeout(() => setArrivedSlug(null), 760);
    return () => window.clearTimeout(timer);
  }, [arrivedSlug]);

  // Keep interaction behaviour aligned with the CSS breakpoint.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const sync = () => setMobileLayout(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // Never leave the visitor staring at an endless loading state if Mapbox is
  // unreachable: after a generous window the atlas says so and offers a retry.
  useEffect(() => {
    if (mapReady || mapLoadFailed) return;
    const timeout = window.setTimeout(() => setMapLoadFailed(true), 12000);
    return () => window.clearTimeout(timeout);
  }, [mapLoadFailed, mapReady]);

  useEffect(() => {
    if (mobileSheet !== 'detail' || !selectedSlug) return;
    requestAnimationFrame(() => mobileSheetHeaderRef.current?.focus({ preventScroll: true }));
  }, [selectedSlug, mobileSheet]);

  // ── Clusters ──
  // Supercluster works at the index's level: one point per place.
  const points = useMemo(() => places.map((place, placeIndex) => ({
    type: 'Feature' as const,
    properties: { cluster: false, placeIndex },
    geometry: { type: 'Point' as const, coordinates: [place.lng, place.lat] },
  })), [places]);

  const clusterIndex = useMemo(() => {
    const index = new Supercluster({ radius: 50, maxZoom: 16 });
    index.load(points as any);
    return index;
  }, [points]);

  const settledClusterZoom = Math.round(clusterZoom);
  const lowerClusterZoom = Math.max(0, Math.min(16,
    prefersReduced || !clusterMorphing ? settledClusterZoom : Math.floor(clusterZoom),
  ));
  const upperClusterZoom = prefersReduced || !clusterMorphing
    ? lowerClusterZoom
    : Math.min(16, lowerClusterZoom + 1);

  // Build the cluster family only when an integer zoom boundary changes. The
  // far cheaper render pass below then morphs that stable topology on every
  // zoom frame, so children have a real path out of their parent instead of
  // one DOM tree replacing another after the camera has already stopped.
  const clusterMorphTopology = useMemo<ClusterMorphTopologyNode[]>(() => {
    const lower = clusterIndex.getClusters(CLUSTER_WORLD_BOUNDS, lowerClusterZoom) as AtlasClusterFeature[];
    if (lowerClusterZoom === upperClusterZoom) {
      return lower.map((feature) => {
        const coordinates = feature.geometry.coordinates as [number, number];
        return {
          key: atlasFeatureKey(feature),
          feature,
          role: 'stable' as const,
          from: coordinates,
          to: coordinates,
          siblingCount: 1,
        };
      });
    }

    const upper = clusterIndex.getClusters(CLUSTER_WORLD_BOUNDS, upperClusterZoom) as AtlasClusterFeature[];
    const lowerByKey = new Map(lower.map((feature) => [atlasFeatureKey(feature), feature]));
    const upperKeys = new Set(upper.map(atlasFeatureKey));
    const placeParent = new Map<number, AtlasClusterFeature>();

    lower.forEach((feature) => {
      if (feature.properties.cluster) {
        try {
          clusterIndex.getLeaves(feature.id as number, Infinity).forEach((leaf: any) => {
            const placeIndex = leaf.properties.placeIndex;
            if (Number.isInteger(placeIndex)) placeParent.set(placeIndex, feature);
          });
        } catch {
          // A malformed cluster degrades to the upper node's own position.
        }
      } else if (Number.isInteger(feature.properties.placeIndex)) {
        placeParent.set(feature.properties.placeIndex as number, feature);
      }
    });

    const parentForUpper = new Map<string, AtlasClusterFeature>();
    const siblingCountByParent = new Map<string, number>();
    upper.forEach((feature) => {
      const key = atlasFeatureKey(feature);
      if (lowerByKey.has(key)) return;
      let representative: number | undefined;
      if (feature.properties.cluster) {
        try {
          representative = clusterIndex.getLeaves(feature.id as number, 1)[0]?.properties?.placeIndex;
        } catch {
          representative = undefined;
        }
      } else {
        representative = feature.properties.placeIndex;
      }
      if (!Number.isInteger(representative)) return;
      const parent = placeParent.get(representative as number);
      if (!parent) return;
      const parentKey = atlasFeatureKey(parent);
      parentForUpper.set(key, parent);
      siblingCountByParent.set(parentKey, (siblingCountByParent.get(parentKey) ?? 0) + 1);
    });

    const outgoing = lower
      .filter((feature) => !upperKeys.has(atlasFeatureKey(feature)))
      .map((feature) => {
        const coordinates = feature.geometry.coordinates as [number, number];
        return {
          key: atlasFeatureKey(feature),
          feature,
          role: 'parent' as const,
          from: coordinates,
          to: coordinates,
          siblingCount: siblingCountByParent.get(atlasFeatureKey(feature)) ?? 1,
        };
      });

    const incoming = upper.map((feature) => {
      const key = atlasFeatureKey(feature);
      const coordinates = feature.geometry.coordinates as [number, number];
      const stable = lowerByKey.has(key);
      const parent = parentForUpper.get(key);
      const parentCoordinates = parent?.geometry.coordinates as [number, number] | undefined;
      return {
        key,
        feature,
        role: stable ? 'stable' as const : 'child' as const,
        from: stable ? coordinates : parentCoordinates ?? coordinates,
        to: coordinates,
        siblingCount: parent ? siblingCountByParent.get(atlasFeatureKey(parent)) ?? 1 : 1,
      };
    });

    return [...outgoing, ...incoming];
  }, [clusterIndex, lowerClusterZoom, upperClusterZoom]);

  const clusters = useMemo<ClusterRenderNode[]>(() => {
    const rawFraction = prefersReduced || lowerClusterZoom === upperClusterZoom
      ? 1
      : clusterZoom - lowerClusterZoom;
    // A tiny quiet zone at each integer boundary absorbs trackpad
    // micro-jitter, keeping a reversible continuous curve in between.
    const progress = smoothZoomMorph((rawFraction - 0.035) / 0.93);
    const map = mapRef.current?.getMap();

    return clusterMorphTopology.map((node) => {
      let coordinates = node.to;
      if (node.role === 'child' && progress < 1) {
        if (map) {
          const fromPoint = map.project(node.from);
          const toPoint = map.project(node.to);
          const point = map.unproject([
            fromPoint.x + (toPoint.x - fromPoint.x) * progress,
            fromPoint.y + (toPoint.y - fromPoint.y) * progress,
          ]);
          coordinates = [point.lng, point.lat];
        } else {
          coordinates = [
            node.from[0] + (node.to[0] - node.from[0]) * progress,
            node.from[1] + (node.to[1] - node.from[1]) * progress,
          ];
        }
      }

      if (node.role === 'parent') {
        return {
          ...node,
          coordinates,
          opacity: Math.pow(1 - progress, 1.35),
          scale: 1 - progress * 0.2,
          interactive: progress < 0.46,
        };
      }
      if (node.role === 'child') {
        const energyFloor = 1 / Math.sqrt(Math.max(1, node.siblingCount));
        return {
          ...node,
          coordinates,
          opacity: progress * (energyFloor + (1 - energyFloor) * progress),
          scale: 0.64 + progress * 0.36,
          interactive: progress > 0.54,
        };
      }
      return { ...node, coordinates, opacity: 1, scale: 1, interactive: true };
    });
  }, [clusterMorphTopology, clusterZoom, lowerClusterZoom, prefersReduced, upperClusterZoom]);

  const handleMapZoom = useCallback((event: { viewState: { zoom: number } }) => {
    setClusterMorphing(true);
    pendingClusterZoomRef.current = event.viewState.zoom;
    if (clusterZoomFrameRef.current) return;
    clusterZoomFrameRef.current = window.requestAnimationFrame(() => {
      clusterZoomFrameRef.current = 0;
      const next = pendingClusterZoomRef.current;
      setClusterZoom((current) => (Math.abs(current - next) < 0.0001 ? current : next));
    });
  }, []);

  // What the camera is framing for: which layout, and on the phone how much
  // of the map the sheet leaves.
  const viewportFor = useCallback((sheet: SheetMode): TravelViewport => {
    const compact = window.matchMedia('(max-width: 1023px)').matches;
    const mapHeight = mapRef.current?.getMap().getContainer().clientHeight || window.innerHeight;
    return { compact, feather: window.innerWidth >= 1280 ? 80 : 48, sheet: sheetHeight(sheet, window.innerHeight, mapHeight) };
  }, []);

  const beginFlight = useCallback((slug: string | null, duration: number) => {
    flightTokenRef.current += 1;
    flightStartRef.current = performance.now();
    flightDurationRef.current = duration;
    flightSlugRef.current = slug;
    return flightTokenRef.current;
  }, []);

  // ── The landmark ──
  // Which side of its mark a chapter's landmark stands on: over it by
  // default, else level with it on the side its name does not take, else
  // under it — the first no leg of the route runs through, read from the
  // camera it is about to be shown under, once per landing.
  const landmarkSideFor = useCallback((map: any, slug: string): LandmarkSide => {
    const landmark = landmarkFor(slug);
    const index = places.findIndex((place) => place.slug === slug && place.lead);
    if (!landmark || index < 0) return 'above';
    const place = places[index];
    const origin = map.project([place.lng, place.lat]);
    const paths: Array<Array<{ x: number; y: number }>> = [];
    const trace = (coordinates: number[][]) => {
      const path: Array<{ x: number; y: number }> = [];
      let travelled = 0;
      for (const coordinate of coordinates) {
        const projected = map.project(coordinate as [number, number]);
        const point = { x: projected.x - origin.x, y: projected.y - origin.y };
        const last = path[path.length - 1];
        if (last) travelled += Math.hypot(point.x - last.x, point.y - last.y);
        path.push(point);
        if (travelled > 320) break;
      }
      paths.push(path);
    };
    // Leg `i` runs from place `i` to place `i + 1`.
    const outgoing = routeGeo.features[index];
    const incoming = routeGeo.features[index - 1];
    if (outgoing) trace(outgoing.geometry.coordinates);
    if (incoming) trace([...incoming.geometry.coordinates].reverse());
    return chooseLandmarkSide(paths, landmark.height, 21, [
      'above',
      nameSitsLeft(place.lng) ? 'right' : 'left',
      'below',
    ]);
  }, [places, routeGeo]);

  // ── Framing ──
  const frameArchiveOverview = useCallback((duration = 0, token?: number, sheet: SheetMode = 'peek') => {
    const map = mapRef.current?.getMap();
    if (!map || !archiveBounds) return;
    const viewport = viewportFor(sheet);
    map.fitBounds(archiveBounds, {
      padding: viewport.compact
        ? { top: 42, right: 46, bottom: (viewport.sheet ?? 78) + 40, left: 46 }
        : { top: 58, right: 68, bottom: 58, left: 68 },
      maxZoom: viewport.compact ? 4.15 : 3.7,
      duration: reduceRef.current ? 0 : duration,
      easing: TRAVEL_EASE,
      essential: true,
      retainPadding: false,
    }, token ? { travelFlight: token } : undefined);
  }, [archiveBounds, viewportFor]);

  // The one landing every path uses (travelSilver.landingCamera).
  const flyToChapter = useCallback((chapter: TravelChapter, jump = false) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const camera = landingCamera(chapter, viewportFor('detail'));
    const centre = map.getCenter();
    const duration = jump || reduceRef.current ? 0 : flightMs(greatCircleKm([centre.lng, centre.lat], camera.center));
    const token = beginFlight(chapter.slug, duration);
    if (duration === 0) map.jumpTo({ ...camera, retainPadding: false }, { travelFlight: token });
    else map.flyTo({ ...camera, duration, curve: FLIGHT_CURVE, easing: TRAVEL_EASE, essential: true, retainPadding: false }, { travelFlight: token });
  }, [beginFlight, viewportFor]);

  const updatePlaceUrl = useCallback((chapter: TravelChapter | null) => {
    const url = new URL(window.location.href);
    if (chapter) url.searchParams.set('place', chapter.slug);
    else url.searchParams.delete('place');
    url.hash = 'atlas-map';
    // Keep Astro's history index and scroll metadata while updating the map URL.
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const selectChapter = useCallback((slug: string, jump = false) => {
    const chapter = bySlug.get(slug);
    if (!chapter) return;
    const from = landedRef.current && landedRef.current !== slug ? landedRef.current : null;
    selectedRef.current = slug;
    landedRef.current = null;
    setSelectedSlug(slug);
    setLandedSlug(null);
    setArrivedSlug(null);
    setLandmarkSlug(null);
    setFlight(jump || reduceRef.current ? null : { from, to: slug });
    if (window.matchMedia('(max-width: 1023px)').matches) {
      sheetFramedRef.current = 'detail';
      setMobileSheet('detail');
    }
    updatePlaceUrl(chapter);
    flyToChapter(chapter, jump);
  }, [bySlug, flyToChapter, updatePlaceUrl]);

  /** Puts the chosen chapter back without moving the camera. */
  const clearSelection = useCallback(() => {
    selectedRef.current = null;
    landedRef.current = null;
    setSelectedSlug(null);
    setLandedSlug(null);
    setArrivedSlug(null);
    setLandmarkSlug(null);
    setFlight(null);
    sheetFramedRef.current = 'peek';
    setMobileSheet('peek');
    updatePlaceUrl(null);
  }, [updatePlaceUrl]);

  const deselect = useCallback((focusMap = false) => {
    if (!selectedRef.current) return;
    clearSelection();
    frameArchiveOverview(OVERVIEW_MS, beginFlight(null, OVERVIEW_MS));
    // A lime focus ring never lingers on a row that is no longer chosen.
    if (focusMap) workspaceRef.current?.focus({ preventScroll: true });
  }, [beginFlight, clearSelection, frameArchiveOverview]);

  // A chapter chosen again from the index is put back (on the phone, its
  // ticket comes back up instead).
  const handleRowSelect = useCallback((slug: string) => {
    if (selectedRef.current !== slug) selectChapter(slug);
    else if (window.matchMedia('(max-width: 1023px)').matches) setMobileSheet('detail');
    else deselect();
  }, [deselect, selectChapter]);

  const handleHover = useCallback((slug: string | null) => setHoveredSlug(slug), []);

  // A cluster that stands for one chapter (New York's two places, merged
  // until street scale) is that chapter's selection. A cluster of several
  // chapters has no single destination: it opens toward the zoom where it
  // comes apart, and earns no arrival ring.
  const handleClusterClick = useCallback((clusterId: number, lng: number, lat: number) => {
    let leaves: any[] = [];
    try { leaves = clusterIndex.getLeaves(clusterId, Infinity); } catch { leaves = []; }
    const slugs = Array.from(new Set(leaves.map((leaf) => places[leaf.properties.placeIndex]?.slug).filter(Boolean))) as string[];
    if (slugs.length === 1) {
      selectChapter(slugs[0]);
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map) return;
    const zoom = map.getZoom();
    let target = zoom + 2;
    try {
      target = Math.min(clusterIndex.getClusterExpansionZoom(clusterId), zoom + 3.5, 16);
    } catch {
      target = zoom + 2;
    }
    clearSelection();
    const centre = map.getCenter();
    const duration = reduceRef.current ? 0 : flightMs(greatCircleKm([centre.lng, centre.lat], [lng, lat]));
    const token = beginFlight(null, duration);
    map.flyTo({ center: [lng, lat], zoom: target, duration, curve: FLIGHT_CURVE, easing: TRAVEL_EASE, essential: true, retainPadding: false }, { travelFlight: token });
  }, [beginFlight, clearSelection, clusterIndex, places, selectChapter]);

  // ── Into the story ──
  // The ticket's photograph grows into the story across the page change (a
  // view transition), over the map it was chosen on, to full bleed; holds
  // there a beat; and gives way to the story's front page, which holds from
  // then (travelPlate.ts) — a homepage plate's landing, from a ticket. The
  // growing plate is the full-size cover (warmed from the ticket's hover,
  // focus or press), in a box of the photograph's own ratio that covers the
  // viewport: the ticket's print and the plate are the same picture at the
  // same ratio, so the grow is one uniform scale and the sharp plate comes
  // up over the ticket's print pixel for pixel in the first part of it. When
  // the full-size cover is not in yet, the stand-in plane is transparent and
  // the ticket's print gives way to the story (html[data-travel-plate-blank]).
  // The stub is not carried: a story's kept stub arrives only once the story
  // has loaded (owner, 2026-09-27).
  const handleOpenTicket = useCallback((photo: HTMLElement, event: ReactMouseEvent<HTMLAnchorElement>, chapter: TravelChapter) => {
    if (reduceRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    photo.style.viewTransitionName = 'travel-plate';
    const print = warmPlate(chapter.coverUrl);
    const story = `/works/${chapter.slug}`;
    let transition: { ready: Promise<void>; finished: Promise<void> } | null = null;
    // One hand-off at a time: a second click on the ticket while its story
    // loads (a double click) would otherwise add a second stand-in plane of
    // the same name, and a view transition with two is abandoned.
    pendingPlateHandoff?.();
    const stop = () => {
      document.removeEventListener('astro:before-swap', onBeforeSwap);
      document.removeEventListener('astro:after-swap', onAfterSwap);
      if (pendingPlateHandoff === stop) pendingPlateHandoff = null;
    };
    pendingPlateHandoff = stop;
    const onBeforeSwap = (swap: Event) => {
      const to = (swap as Event & { to?: URL }).to;
      // Another page change than this story's (the click was overtaken).
      if (!to || to.pathname.replace(/\/$/, '') !== story) {
        stop();
        return;
      }
      transition = (swap as Event & { viewTransition?: typeof transition }).viewTransition ?? null;
    };
    const onAfterSwap = () => {
      stop();
      const root = document.documentElement;
      const plane = document.createElement('div');
      plane.setAttribute('data-travel-plate', '');
      plane.setAttribute('aria-hidden', 'true');
      const ready = !!print && print.complete && print.naturalWidth > 0;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const ratio = chapter.coverRatio > 0 ? chapter.coverRatio : width / height;
      const w = ratio < width / height ? width : height * ratio;
      const h = w / ratio;
      plane.style.cssText = ready
        ? `position:fixed;left:${(width - w) / 2}px;top:${(height - h) / 2}px;width:${w}px;height:${h}px;z-index:120;pointer-events:none;view-transition-name:travel-plate`
        : 'position:fixed;inset:0;pointer-events:none;view-transition-name:travel-plate';
      if (ready && print) {
        print.alt = '';
        print.draggable = false;
        // Drawn in the frame it is inserted in: the new page's snapshot is
        // taken right after this.
        print.decoding = 'sync';
        print.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover';
        plane.appendChild(print);
      }
      document.body.appendChild(plane);
      const grown = DUR_MS.grow + TRAVEL_PLATE_HOLD_MS;
      if (ready) markTravelPlate(performance.now() + grown + 32);
      else root.setAttribute('data-travel-plate-blank', '');
      const release = () => {
        root.removeAttribute('data-travel-plate-blank');
        if (!ready) {
          plane.remove();
          return;
        }
        markTravelPlate(performance.now() + TRAVEL_PLATE_HOLD_MS);
        const fade = plane.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: TRAVEL_PLATE_RELEASE_MS,
          delay: TRAVEL_PLATE_HOLD_MS,
          easing: CSS_EASE.fade,
          fill: 'forwards',
        });
        fade.finished.catch(() => undefined).then(() => {
          plane.remove();
          clearTravelPlate();
        });
      };
      if (!transition) {
        release();
        return;
      }
      transition.ready.then(() => { if (ready) markTravelPlate(performance.now() + grown); }, () => undefined);
      transition.finished.then(release, release);
    };
    document.addEventListener('astro:before-swap', onBeforeSwap);
    document.addEventListener('astro:after-swap', onAfterSwap);
  }, []);

  // ── The map's own events ──
  const handleMoveEnd = useCallback((event: any) => {
    const map = event.target;
    const tagged = event.travelFlight;
    let landedNow: string | null = null;
    if (tagged !== undefined && tagged === flightTokenRef.current) {
      setFlight(null);
      const slug = flightSlugRef.current;
      flightSlugRef.current = null;
      if (slug && slug === selectedRef.current) {
        landedNow = slug;
        const elapsed = performance.now() - flightStartRef.current;
        const duration = flightDurationRef.current;
        if (!reduceRef.current && duration > 0 && elapsed >= duration - FLIGHT_LANDED_SLACK_MS) setArrivedSlug(slug);
      }
    }
    if (landedNow) {
      landedRef.current = landedNow;
      setLandedSlug(landedNow);
      landmarkSideRef.current[landedNow] = landmarkSideFor(map, landedNow);
    }
    const landed = landedRef.current && landedRef.current === selectedRef.current ? landedRef.current : null;
    const shown = landed && map.getZoom() >= LANDMARK_MIN_ZOOM ? landed : null;
    setLandmarkSlug((current) => (current === shown ? current : shown));
  }, [landmarkSideFor]);
  const moveEndRef = useRef(handleMoveEnd);
  moveEndRef.current = handleMoveEnd;

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const finish = () => {
      // The same olive-black cartographic language as the homepage atlas.
      // No 3D terrain: the atlas is framed face-on, so relief is never seen
      // and only costs GPU and DEM tiles.
      map.setProjection('globe');
      map.setFog(ATLAS_FOG);
      if (window.matchMedia('(pointer: coarse)').matches) map.touchZoomRotate.disableRotation();
      gradeAtlasBasemap(map);
      silenceArchivePlaceLabels(map, archiveNames);
      map.on('moveend', (event: any) => moveEndRef.current(event));
      // A hand on the map takes the camera: the flight it stopped lands nowhere.
      map.on('dragstart', () => { flightSlugRef.current = null; });
      map.on('zoomstart', (event: any) => {
        if (!event.originalEvent) return;
        flightSlugRef.current = null;
      });
      frameArchiveOverview(0);
      atlasStyleReadyRef.current = true;
      setLayersReady(true);
      setMapLoadFailed(false);
    };
    if (map.isStyleLoaded()) finish();
    else map.once('style.load', finish);
  }, [archiveNames, frameArchiveOverview]);

  const handleMapIdle = useCallback(() => {
    if (!atlasStyleReadyRef.current || atlasReadySignaledRef.current) return;
    atlasReadySignaledRef.current = true;
    setMapLoadFailed(false);
    setMapReady(true);
    document.documentElement.dataset.atlasReady = 'true';
    window.dispatchEvent(new CustomEvent('gallery:atlas-ready'));
  }, []);


  // Mapbox does not recompute its canvas or camera padding when a phone
  // rotates inside the mobile breakpoint. Coalesce the burst into one frame,
  // resize, then reframe the chosen chapter (or the archive).
  useEffect(() => {
    if (!mapReady) return;
    let resizeFrame = 0;
    const reframe = () => {
      resizeFrame = 0;
      const map = mapRef.current?.getMap();
      if (!map) return;
      map.stop();
      map.resize();
      const selected = selectedRef.current ? bySlug.get(selectedRef.current) : null;
      if (selected) {
        const camera = landingCamera(selected, viewportFor(mobileSheetRef.current));
        map.jumpTo({ center: camera.center, zoom: map.getZoom(), padding: camera.padding, retainPadding: false });
      } else {
        frameArchiveOverview(0, undefined, mobileSheetRef.current);
      }
    };
    const scheduleReframe = () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(reframe);
    };
    window.addEventListener('resize', scheduleReframe, { passive: true });
    window.addEventListener('orientationchange', scheduleReframe, { passive: true });
    return () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener('resize', scheduleReframe);
      window.removeEventListener('orientationchange', scheduleReframe);
    };
  }, [bySlug, frameArchiveOverview, mapReady, viewportFor]);

  // Phone: every change of the sheet frames what it leaves of the map — the
  // chosen chapter over the sheet's edge, or the whole archive above it.
  useEffect(() => {
    if (!mapReady || !mobileLayout) return;
    if (sheetFramedRef.current === mobileSheet) return;
    sheetFramedRef.current = mobileSheet;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const selected = selectedRef.current ? bySlug.get(selectedRef.current) : null;
    if (!selected) {
      frameArchiveOverview(SHEET_REFRAME_MS, beginFlight(null, SHEET_REFRAME_MS), mobileSheet);
      return;
    }
    const camera = landingCamera(selected, viewportFor(mobileSheet));
    map.easeTo({
      center: camera.center,
      padding: camera.padding,
      duration: reduceRef.current ? 0 : SHEET_REFRAME_MS,
      easing: ARRIVE_EASE,
      essential: true,
      retainPadding: false,
    });
  }, [beginFlight, bySlug, frameArchiveOverview, mapReady, mobileLayout, mobileSheet, viewportFor]);

  // Accept stable place deep links from Home (`?place=`), and the older
  // coordinate hash story mini-maps used (`#loc=lat,lng,zoom`).
  useEffect(() => {
    if (!mapReady) return;
    const goToRequestedPlace = () => {
      const place = new URLSearchParams(window.location.search).get('place');
      if (place) {
        const wanted = slugifyPlace(place);
        const match = chapters.find((chapter) => chapter.slug === wanted
          || chapter.places.some((entry) => slugifyPlace(entry.city) === wanted));
        if (!match) return;
        const initial = !initialPlaceAppliedRef.current;
        initialPlaceAppliedRef.current = true;
        if (!initial && selectedRef.current === match.slug) return;
        // Opened already on the place: nothing flies, so nothing rings, but
        // the camera is there.
        selectChapter(match.slug, initial);
        return;
      }
      initialPlaceAppliedRef.current = true;
      const hash = window.location.hash;
      if (!hash.startsWith('#loc=')) return;
      const [lat, lng] = hash.replace('#loc=', '').split(',').map(parseFloat);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;
      let closest = -1;
      let minDist = Infinity;
      places.forEach((entry, index) => {
        const distance = Math.abs(entry.lat - lat) + Math.abs(entry.lng - lng);
        if (distance < minDist) { minDist = distance; closest = index; }
      });
      if (closest >= 0 && minDist < 2) selectChapter(places[closest].slug);
    };
    goToRequestedPlace();
    window.addEventListener('hashchange', goToRequestedPlace);
    window.addEventListener('popstate', goToRequestedPlace);
    return () => {
      window.removeEventListener('hashchange', goToRequestedPlace);
      window.removeEventListener('popstate', goToRequestedPlace);
    };
  }, [chapters, mapReady, places, selectChapter]);

  const resetView = useCallback(() => {
    if (selectedRef.current) deselect();
    else {
      frameArchiveOverview(OVERVIEW_MS, beginFlight(null, OVERVIEW_MS), mobileSheetRef.current);
    }
  }, [beginFlight, deselect, frameArchiveOverview]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !selectedRef.current) return;
      deselect(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deselect]);

  // A mark is only a target where it can be seen: on the canvas, and on the
  // phone above the sheet.
  const isMarkerAvailable = useCallback((lng: number, lat: number) => {
    const map = mapRef.current?.getMap();
    if (!mapReady || !map) return false;
    const container = map.getContainer();
    const point = map.project([lng, lat]);
    const insideViewport = map.getBounds()?.contains([lng, lat])
      && point.x >= 0
      && point.x <= container.clientWidth
      && point.y >= 0
      && point.y <= container.clientHeight;
    if (!insideViewport) return false;
    if (!mobileLayout) return true;
    return point.y < container.clientHeight - sheetHeight(mobileSheet, window.innerHeight, container.clientHeight) - 8;
    // viewState and clusterZoom: the camera the answer is read under.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterZoom, mapReady, mobileLayout, mobileSheet, viewState]);

  const selectedChapter = selectedSlug ? bySlug.get(selectedSlug) ?? null : null;
  const landedChapter = landedSlug && landedSlug === selectedSlug ? bySlug.get(landedSlug) ?? null : null;
  const years = useMemo(() => {
    const values = [...new Set(chapters.map((chapter) => chapter.year).filter(Boolean))].sort();
    return values.length > 1 ? `${values[0]}–${values[values.length - 1]}` : values[0] ?? '';
  }, [chapters]);

  // The status pill: every state it can say (sized together), and the one it
  // says now — named only once the camera has landed there.
  const statusLabels = useMemo(
    () => Array.from(new Set(['Select a city or marker', ...chapters.map((chapter) => `Viewing ${chapter.name}`)])),
    [chapters],
  );
  const statusLabel = landedChapter ? `Viewing ${landedChapter.name}` : 'Select a city or marker';

  if (!mapboxToken) return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[#171b15] px-8 text-center md:rounded-[1.35rem]">
      <span className="mb-4 h-2 w-2 rounded-full bg-[#F4F4ED]/70" aria-hidden="true" />
      <p className="font-serif text-2xl uppercase text-[#F4F4ED]">Atlas offline</p>
      <p className="mt-2 font-ui text-[10px] uppercase tracking-[0.1em] text-white/58">Map access is not available in this build.</p>
      <a href="/" className="mt-5 inline-flex min-h-11 items-center rounded-full border border-white/14 px-5 font-ui text-[9px] uppercase tracking-[0.1em] text-white/72 hover:border-[#D2FF00]/45 hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]">Return home</a>
    </div>
  );
  if (chapters.length === 0) return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[#171b15] px-8 text-center md:rounded-[1.35rem]">
      <span className="mb-4 h-2 w-2 rounded-full border border-white/35" aria-hidden="true" />
      <p className="font-serif text-2xl uppercase text-[#F4F4ED]">No coordinates yet</p>
      <p className="mt-2 font-ui text-[10px] uppercase tracking-[0.1em] text-white/58">New photographic locations will appear here.</p>
      <a href="/" className="mt-5 inline-flex min-h-11 items-center rounded-full border border-white/14 px-5 font-ui text-[9px] uppercase tracking-[0.1em] text-white/72 hover:border-[#D2FF00]/45 hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]">Return home</a>
    </div>
  );

  return (
    <div className="h-full min-h-0" aria-busy={!mapReady}>
      {/* translateZ(0) promotes the whole card (map + index) to one cached
          compositor layer, so a page scroll translates that layer instead of
          re-compositing the WebGL region every frame. */}
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#151913] shadow-[0_26px_70px_-54px_rgba(7,9,6,0.4)] lg:flex-row lg:rounded-[1.35rem]" style={{ transform: 'translateZ(0)' }}>
        {/* ── Map ── */}
        <div
          ref={workspaceRef}
          tabIndex={-1}
          className="atlas-map-workspace relative h-full min-h-0 w-full lg:flex-1"
          data-mobile-sheet={mobileSheet}
          style={{ transform: 'translateZ(0)' }}
        >
          <MapGL
            initialViewState={FINAL_VIEW}
            ref={mapRef}
            onZoom={handleMapZoom}
            onMoveEnd={(event) => {
              setViewState(event.viewState);
              pendingClusterZoomRef.current = event.viewState.zoom;
              setClusterZoom(event.viewState.zoom);
              setClusterMorphing(false);
            }}
            mapboxAccessToken={mapboxToken}
            mapStyle={MAP_STYLE}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
            onLoad={handleMapLoad}
            onIdle={handleMapIdle}
            onError={() => {
              if (typeof navigator !== 'undefined' && !navigator.onLine) setMapLoadFailed(true);
            }}
            maxZoom={16}
            minZoom={1.5}
            onClick={(event) => {
              // A click on the ground (not on a mark) puts the chapter back.
              const target = (event.originalEvent?.target as HTMLElement | null) ?? null;
              if (target && target.tagName !== 'CANVAS') return;
              deselect();
            }}
            cooperativeGestures={false}
          >
            <NavigationControl position="bottom-right" showCompass={false} />
            <AttributionControl position="bottom-left" compact />

            {clusters.map((clusterNode) => {
              const feature = clusterNode.feature;
              const [lng, lat] = clusterNode.coordinates;
              const [featureLng, featureLat] = feature.geometry.coordinates;
              const props = feature.properties;
              const markerInteractive = clusterNode.interactive && isMarkerAvailable(lng, lat);

              // ── Cluster ──
              if (props.cluster) {
                const count = props.point_count ?? 0;
                const baseSize = count < 3 ? 38 : count < 6 ? 42 : 46;
                const size = baseSize + (coarsePointer ? 4 : 0);
                let members: MapPlace[] = [];
                try {
                  members = clusterIndex
                    .getLeaves(feature.id as number, Infinity)
                    .map((leaf: any) => places[leaf.properties.placeIndex])
                    .filter(Boolean);
                } catch {
                  members = [];
                }
                const memberSlugs = Array.from(new Set(members.map((member) => member.slug)));
                const label = clusterName(Array.from(new Set(members.map((member) => member.region))));
                const isActiveCluster = !!selectedSlug && memberSlugs.includes(selectedSlug);
                const isHoveredCluster = !!hoveredSlug && memberSlugs.includes(hoveredSlug);
                const engagedCluster = isActiveCluster || isHoveredCluster;
                // The rest of the field recedes while a chapter is chosen — by
                // colour, so the disc stays solid over the route.
                const dimmedCluster = !!selectedSlug && !engagedCluster;
                // A cluster of one chapter wears that chapter's landmark once
                // it has been landed on; a cluster of several has no single
                // drawing and wears none. Its name hangs under it, so the
                // drawing never stands below.
                const clusterSlug = memberSlugs.length === 1 ? memberSlugs[0] : null;
                const clusterLandmarkShown = !!clusterSlug && landmarkSlug === clusterSlug && clusterZoom >= LANDMARK_MIN_ZOOM;
                const chosenSide = clusterSlug ? landmarkSideRef.current[clusterSlug] ?? 'above' : 'above';
                const clusterLandmarkSide: LandmarkSide = chosenSide === 'below' ? 'above' : chosenSide;
                return (
                  <Marker
                    key={clusterNode.key}
                    longitude={lng}
                    latitude={lat}
                    anchor="center"
                    style={{ zIndex: clusterNode.role === 'child' ? 3 : 2 }}
                  >
                    <div
                      data-atlas-marker-morph={clusterNode.role}
                      aria-hidden={!markerInteractive}
                      style={{
                        opacity: clusterNode.opacity,
                        transform: `scale(${clusterNode.scale})`,
                        transformOrigin: 'center',
                        pointerEvents: markerInteractive ? 'auto' : 'none',
                        willChange: clusterNode.role === 'stable' ? 'auto' : 'opacity, transform',
                      }}
                    >
                      <motion.button
                        type="button"
                        aria-label={`Explore ${label} cluster, ${count} locations`}
                        tabIndex={markerInteractive ? 0 : -1}
                        onClick={(event) => { event.stopPropagation(); handleClusterClick(feature.id as number, featureLng, featureLat); }}
                        className="group relative flex cursor-pointer items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00]"
                        style={{ width: size + 18, height: size + 18 }}
                        initial={false}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 22 }}
                      >
                        <TravelLandmark
                          slug={clusterSlug}
                          shown={clusterLandmarkShown}
                          side={clusterLandmarkSide}
                          clearance={size / 2 + 11}
                        />
                        {/* Engaged, a cluster is ringed the way a chosen place
                            is: one thin white ring at a gap. Hovering the
                            cluster draws the same ring; its count and name are
                            type, which is not scaled while it is read. */}
                        <div
                          className={`absolute rounded-full transition-[opacity,transform] ease-(--ease-arrive) ${
                            engagedCluster
                              ? 'opacity-100 [transform:scale(1)] duration-[280ms]'
                              : 'opacity-0 [transform:scale(1.12)] duration-[420ms] group-hover:opacity-100 group-hover:[transform:scale(1)] group-hover:duration-[280ms]'
                          }`}
                          style={{
                            width: size + 14,
                            height: size + 14,
                            border: `1px solid rgba(${MAP_INK_RGB},0.92)`,
                            boxShadow: `0 0 0 1px rgba(${MAP_BURN_RGB},0.22)`,
                          }}
                        />
                        {/* The seat: a dark burn collar under the disc, so the
                            ink stands off pale ground and deepens when engaged. */}
                        <div
                          className="absolute rounded-full transition-colors duration-300"
                          style={{
                            width: size + 6,
                            height: size + 6,
                            backgroundColor: `rgba(${MAP_BURN_RGB},${engagedCluster ? 0.66 : 0.42})`,
                          }}
                        />
                        {/* The count is the interface object here, so it keeps
                            its solid disc and dark numerals. */}
                        <div
                          className="relative flex items-center justify-center rounded-full font-bold transition-[background-color] duration-500 ease-(--ease-arrive)"
                          style={{
                            width: size,
                            height: size,
                            fontSize: count < 10 ? 12 : 13,
                            backgroundColor: dimmedCluster ? MAP_INK_DIM : MAP_INK,
                            color: '#20241a',
                            boxShadow: `0 1px 2px rgba(${MAP_BURN_RGB},0.9)`,
                          }}
                        >
                          <AnimatePresence mode="wait">
                            <motion.span
                              key={count}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: prefersReduced ? 0 : 0.2 }}
                            >
                              {count}
                            </motion.span>
                          </AnimatePresence>
                        </div>
                        {/* The cluster's name, set as the marks' names are:
                            ink on the ground, not a chip. */}
                        <span
                          className="pointer-events-none absolute left-1/2 top-full mt-1.5 block -translate-x-1/2 whitespace-nowrap font-ui font-medium uppercase"
                          style={{
                            fontSize: engagedCluster ? 10 : 9,
                            letterSpacing: engagedCluster ? '0.1em' : '0.12em',
                            color: engagedCluster ? '#F4F4ED' : dimmedCluster ? 'rgba(244,244,237,0.3)' : 'rgba(244,244,237,0.72)',
                            textShadow: '0 0 5px rgba(12,15,10,0.7), 0 0 12px rgba(12,15,10,0.45)',
                            transition: engagedCluster
                              ? `color 200ms ${CSS_EASE.arrive}, font-size 200ms ${CSS_EASE.arrive}, letter-spacing 200ms ${CSS_EASE.arrive}`
                              : `color 420ms ${CSS_EASE.arrive}, font-size 420ms ${CSS_EASE.arrive}, letter-spacing 420ms ${CSS_EASE.arrive}`,
                          }}
                        >
                          {label}
                        </span>
                      </motion.button>
                    </div>
                  </Marker>
                );
              }

              // ── A single place ──
              const place = places[props.placeIndex ?? -1];
              if (!place) return null;
              const isActive = selectedSlug === place.slug;
              const isHovered = hoveredSlug === place.slug;
              const markerZ = isActive ? 3 : isHovered ? 2 : 1;
              const visualContainerSize = isActive ? 52 : isHovered ? 48 : 44;
              const containerSize = coarsePointer ? Math.max(48, visualContainerSize) : visualContainerSize;
              const markerCoreSize = isActive ? 22 : isHovered ? 19 : 16;
              const labelOnLeft = nameSitsLeft(place.lng);
              const engagedMark = isActive || isHovered;
              // The rest of the field recedes while a chapter is chosen — by
              // colour, so the dot stays solid over the route's dashes.
              const dimmedMark = !!selectedSlug && !engagedMark;

              return (
                <Marker
                  key={clusterNode.key}
                  longitude={lng}
                  latitude={lat}
                  anchor="center"
                  style={{ zIndex: markerZ }}
                >
                  <div
                    data-atlas-marker-morph={clusterNode.role}
                    aria-hidden={!markerInteractive}
                    style={{
                      opacity: clusterNode.opacity,
                      transform: `scale(${clusterNode.scale})`,
                      transformOrigin: 'center',
                      pointerEvents: markerInteractive ? 'auto' : 'none',
                      willChange: clusterNode.role === 'stable' ? 'auto' : 'opacity, transform',
                    }}
                  >
                    <motion.button
                      type="button"
                      aria-label={`Explore ${place.city}, ${place.frames} frames`}
                      tabIndex={markerInteractive ? 0 : -1}
                      onClick={(event) => { event.stopPropagation(); selectChapter(place.slug); }}
                      className="group relative flex cursor-pointer items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00]"
                      style={{ width: containerSize, height: containerSize }}
                      initial={false}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 24, opacity: { duration: 0.5 } }}
                      onMouseEnter={() => setHoveredSlug(place.slug)}
                      onMouseLeave={() => setHoveredSlug(null)}
                      onFocus={() => setHoveredSlug(place.slug)}
                      onBlur={() => setHoveredSlug(null)}
                    >
                      {/* Arrival — one thin ring, snapped in and eased out, the
                          same confirm the homepage atlas gives a landed flight. */}
                      {!prefersReduced && place.lead && arrivedSlug === place.slug && (
                        <span aria-hidden="true" className="atlas-arrival-ring" />
                      )}
                      {/* The seat — not a glow: a dark burn under the place, so
                          the white dot and its name stand off the ground. Always
                          mounted, so it eases out as well as in; hover sets it,
                          selection deepens it. */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{
                          background: `radial-gradient(circle, rgba(${MAP_BURN_RGB},0.6) 0%, rgba(${MAP_BURN_RGB},0.24) 34%, transparent 72%)`,
                          opacity: isActive ? 1 : isHovered ? 0.55 : 0,
                          transition: `opacity ${isActive || isHovered ? 200 : 420}ms ${CSS_EASE.arrive}`,
                        }}
                      />
                      {/* Chosen: one thin white ring at a gap, the ring the
                          homepage atlas puts round an engaged place. */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-1/2 top-1/2 -ml-[17px] -mt-[17px] h-[34px] w-[34px] rounded-full"
                        style={{
                          border: `1px solid rgba(${MAP_INK_RGB},0.95)`,
                          boxShadow: `0 0 0 1px rgba(${MAP_BURN_RGB},0.22)`,
                          opacity: isActive ? 1 : 0,
                          transform: `scale(${isActive ? 1 : 1.35})`,
                          transition: isActive
                            ? `opacity 280ms ${CSS_EASE.arrive}, transform 280ms ${CSS_EASE.arrive}`
                            : `opacity 420ms ${CSS_EASE.arrive}, transform 420ms ${CSS_EASE.arrive}`,
                        }}
                      />
                      {place.lead && (
                        <TravelLandmark
                          slug={place.slug}
                          shown={landmarkSlug === place.slug && clusterZoom >= LANDMARK_MIN_ZOOM}
                          side={landmarkSideRef.current[place.slug] ?? 'above'}
                          clearance={21}
                        />
                      )}
                      <div
                        className="relative rounded-full transition-[width,height,box-shadow,background-color,border-color] duration-300 ease-(--ease-arrive)"
                        style={{
                          width: markerCoreSize,
                          height: markerCoreSize,
                          backgroundColor: dimmedMark ? MAP_INK_DIM : MAP_INK,
                          border: `1px solid ${dimmedMark ? MAP_INK_DIM : `rgba(${MAP_INK_RGB},${isActive ? 0.95 : 0.72})`}`,
                          boxShadow: isActive
                            ? `0 0 0 2.5px rgba(${MAP_BURN_RGB},0.82), 0 1px 2px rgba(${MAP_BURN_RGB},0.9)`
                            : `0 0 0 1.5px rgba(${MAP_BURN_RGB},0.5), 0 1px 2px rgba(${MAP_BURN_RGB},0.9)`,
                        }}
                      />
                      {/* A place says its name in ink, bare type over the
                          ground, as the homepage atlas sets its names. */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 block -translate-y-1/2 truncate whitespace-nowrap font-ui font-medium uppercase"
                        style={{
                          left: labelOnLeft ? 'auto' : `calc(50% + ${markerCoreSize / 2 + 16}px)`,
                          right: labelOnLeft ? `calc(50% + ${markerCoreSize / 2 + 16}px)` : 'auto',
                          fontSize: engagedMark ? 10 : 9,
                          letterSpacing: engagedMark ? '0.1em' : '0.12em',
                          color: engagedMark ? '#F4F4ED' : dimmedMark ? 'rgba(244,244,237,0.3)' : 'rgba(244,244,237,0.72)',
                          textShadow: '0 0 5px rgba(12,15,10,0.7), 0 0 12px rgba(12,15,10,0.45)',
                          maxWidth: coarsePointer ? 96 : 140,
                          transition: engagedMark
                            ? `color 200ms ${CSS_EASE.arrive}, font-size 200ms ${CSS_EASE.arrive}, letter-spacing 200ms ${CSS_EASE.arrive}`
                            : `color 420ms ${CSS_EASE.arrive}, font-size 420ms ${CSS_EASE.arrive}, letter-spacing 420ms ${CSS_EASE.arrive}`,
                          zIndex: 10,
                        }}
                      >
                        {place.city}
                      </span>
                      {/* The leader: one hairline drawn from the mark towards
                          its name, undrawn at rest. */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 block h-px"
                        style={{
                          left: labelOnLeft ? 'auto' : `calc(50% + ${markerCoreSize / 2 + 3}px)`,
                          right: labelOnLeft ? `calc(50% + ${markerCoreSize / 2 + 3}px)` : 'auto',
                          width: 10,
                          background: 'rgba(244,244,237,0.5)',
                          transformOrigin: labelOnLeft ? 'right center' : 'left center',
                          transform: `translateY(-50%) scaleX(${engagedMark ? 1 : 0})`,
                          transition: engagedMark
                            ? `transform 220ms ${CSS_EASE.arrive}`
                            : `transform 380ms ${CSS_EASE.arrive}`,
                          zIndex: 10,
                        }}
                      />
                    </motion.button>
                  </div>
                </Marker>
              );
            })}
          </MapGL>

          <AnimatePresence initial={false}>
            {!mapReady && (
              <motion.div
                key="atlas-loading"
                className={`absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-[#1d2117] ${mapLoadFailed ? 'pointer-events-auto' : 'pointer-events-none'}`}
                initial={false}
                animate={{ opacity: 1 }}
                // A fade-out eases in (the site rule for anything leaving).
                exit={{ opacity: 0, transition: { duration: prefersReduced ? 0 : 0.28, ease: EASE.fade } }}
                role={mapLoadFailed ? 'alert' : 'status'}
                aria-live="polite"
              >
                <div className="relative flex flex-col items-center gap-3 text-center">
                  <span
                    className={`h-1.5 w-1.5 rounded-full bg-[#F4F4ED] ${mapLoadFailed ? '' : 'soft-pulse'}`}
                    style={{ ['--pulse-min' as never]: 0.35, ['--pulse-dur' as never]: '1.65s' }}
                  />
                  <p className="font-ui text-[8px] uppercase tracking-[0.1em] text-white/48">
                    {mapLoadFailed ? 'Atlas unavailable' : 'Charting the archive'}
                  </p>
                  <p className="font-ui text-[9px] uppercase tracking-[0.1em] text-white/48">
                    {mapLoadFailed ? 'Map tiles could not be loaded' : `${frameCount} geotagged frames`}
                  </p>
                  {mapLoadFailed && (
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="mt-2 min-h-11 rounded-full border border-white/14 px-5 font-ui text-[8px] uppercase tracking-[0.1em] text-white/68 transition-colors hover:border-[#D2FF00]/45 hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
                    >
                      Retry map
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Reset. Chrome never scales on hover; a press gives 3%. ── */}
          <div
            className="absolute left-4 top-4 z-10 flex flex-col md:left-5 md:top-5"
            style={{ left: 'max(1rem, env(safe-area-inset-left))' }}
          >
            <button
              type="button"
              onClick={resetView}
              className="atlas-reset-control flex h-11 w-11 items-center justify-center rounded-full text-white/55 transition-colors duration-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
              title="Reset view"
              aria-label="Reset view"
            >
              <RotateCcw size={16} aria-hidden="true" />
            </button>
          </div>

          {/* A legible first-use cue, so the map never looks like a passive
              background. Its dot is the map's mark in miniature — white ink
              on a burn collar. Every state it can say sits in one grid cell,
              so the pill never changes width; a change crosses over in the
              house's `in` time, arriving on the house curve and leaving on
              the fade. */}
          <div
            className="pointer-events-none absolute left-1/2 top-5 z-10 hidden -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-[#11150f]/78 px-4 py-2 font-ui text-[9px] uppercase tracking-[0.1em] text-white/72 shadow-[0_12px_34px_rgba(7,9,6,0.22)] backdrop-blur-xl lg:flex"
            aria-hidden="true"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_0_1.5px_rgba(11,14,9,0.5)]" />
            <span className="grid">
              {statusLabels.map((label) => {
                const current = label === statusLabel;
                return (
                  <span
                    key={label}
                    className="col-start-1 row-start-1 whitespace-nowrap"
                    style={{
                      opacity: current ? 1 : 0,
                      transition: `opacity ${prefersReduced ? 0 : DUR_MS.in}ms ${current ? CSS_EASE.arrive : CSS_EASE.fade}`,
                    }}
                  >
                    {label}
                  </span>
                );
              })}
            </span>
            <span className="h-3 w-px bg-white/14" />
            <span className="text-white/54">Drag to move · Scroll to zoom</span>
          </div>

          {/* Phone: the map owns the viewport and the index becomes one
              draggable, scroll-isolated sheet — peek (the edition's figures),
              browse (the index's rows) and detail (the chapter's ticket). */}
          <motion.section
            className="atlas-mobile-sheet absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-[1.75rem] bg-[#262b21] shadow-[0_-24px_70px_rgba(7,9,6,0.42)] lg:hidden"
            style={{ maxHeight: 'min(62svh, calc(100% - 4.5rem))' }}
            initial={false}
            animate={{
              height: mobileSheet === 'peek' ? 78 : mobileSheet === 'browse' ? '48svh' : '62svh',
            }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.46, ease: EASE.arrive }}
            drag={prefersReduced ? false : 'y'}
            dragControls={sheetDragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.08}
            onDragEnd={(_, info) => {
              if (info.offset.y < -44) {
                if (mobileSheet === 'peek') setMobileSheet('browse');
                else if (mobileSheet === 'browse' && selectedSlug) setMobileSheet('detail');
              } else if (info.offset.y > 44) {
                if (mobileSheet === 'detail') setMobileSheet('browse');
                else if (mobileSheet === 'browse') setMobileSheet('peek');
              }
            }}
            data-lenis-prevent
            aria-label="Atlas index"
          >
            <div className="atlas-mobile-sheet__header relative flex min-h-[78px] shrink-0 items-stretch">
              <button
                ref={mobileSheetHeaderRef}
                type="button"
                onPointerDown={(event) => {
                  if (!prefersReduced) sheetDragControls.start(event);
                }}
                onClick={() => setMobileSheet((current) => (current === 'peek' ? 'browse' : current === 'browse' ? 'peek' : 'browse'))}
                className="atlas-sheet-safe-inline flex min-w-0 flex-1 touch-none items-center gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#D2FF00]"
                aria-expanded={mobileSheet !== 'peek'}
                aria-controls={mobileSheet === 'peek' ? undefined : 'atlas-sheet-content'}
              >
                {/* Drag is off under reduced motion, so the grabber goes
                    with it — decided in CSS, which the server can agree with. */}
                <span className="absolute left-1/2 top-3 h-[3px] w-10 -translate-x-1/2 rounded-full bg-white/24 motion-reduce:hidden" aria-hidden="true" />
                {mobileSheet === 'detail' && selectedChapter ? (
                  <span className="flex min-w-0 flex-1 items-baseline gap-3 overflow-hidden">
                    <span className="travel-sheet__no font-serif">{selectedChapter.ordinal}</span>
                    <span className="min-w-0 truncate font-serif text-[20px] uppercase leading-none text-[#F4F4ED]">{selectedChapter.name}</span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="block font-ui text-[9px] font-medium uppercase tracking-[0.1em] text-[#F4F4ED]/90">Index</span>
                    <span className="mt-1.5 block truncate font-ui text-[9px] uppercase tracking-[0.1em] text-[#F4F4ED]/56">
                      {String(chapters.length).padStart(2, '0')} chapters · {frameCount} frames{years ? ` · ${years}` : ''}
                    </span>
                  </span>
                )}
                <span className="shrink-0 whitespace-nowrap font-ui text-[9px] font-medium uppercase tracking-[0.1em] text-white/72">
                  {mobileSheet === 'peek' ? 'Open' : mobileSheet === 'detail' ? 'Index' : 'Close'}
                </span>
              </button>
              {mobileSheet === 'detail' && selectedChapter && (
                <button
                  type="button"
                  onClick={() => deselect()}
                  className="flex w-12 shrink-0 items-center justify-center text-white/62 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#D2FF00]"
                  style={{ marginRight: 'max(0.5rem, env(safe-area-inset-right))' }}
                  aria-label={`Close ${selectedChapter.name}`}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <span className="sr-only font-ui" aria-live="polite">
              {mobileSheet === 'detail' && selectedChapter
                ? `${selectedChapter.name} open`
                : mobileSheet === 'browse'
                  ? 'Index open'
                  : 'Index collapsed'}
            </span>

            <AnimatePresence mode="wait" initial={false}>
              {mobileSheet === 'browse' && (
                <motion.div
                  key="browse"
                  initial={prefersReduced ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: prefersReduced ? 0 : 0.2, ease: EASE.fade } }}
                  transition={{ duration: prefersReduced ? 0 : 0.4, ease: EASE.arrive }}
                  className="travel-sheet__rows min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                  data-lenis-prevent
                  id="atlas-sheet-content"
                >
                  <TravelRows
                    chapters={chapters}
                    selected={selectedSlug}
                    hovered={hoveredSlug}
                    tickets={false}
                    reduce={prefersReduced}
                    onSelect={handleRowSelect}
                    onHover={handleHover}
                  />
                </motion.div>
              )}

              {mobileSheet === 'detail' && selectedChapter && (
                <motion.div
                  key={`detail-${selectedChapter.slug}`}
                  initial={prefersReduced ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: prefersReduced ? 0 : 0.2, ease: EASE.fade } }}
                  transition={{ duration: prefersReduced ? 0 : 0.42, ease: EASE.arrive }}
                  className="travel-sheet__ticket min-h-0 flex-1 overflow-y-auto overscroll-contain"
                  data-lenis-prevent
                  id="atlas-sheet-content"
                >
                  <TravelTicket chapter={selectedChapter} total={chapters.length} reduce={prefersReduced} onOpen={handleOpenTicket} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        </div>

        {/* ── The index. The feather is its own layer over the map's edge;
            the rows sit on an opaque surface so the ground never changes
            their contrast. ── */}
        <aside
          className="relative z-10 -ml-12 hidden h-full min-h-0 w-[340px] flex-col pl-12 lg:flex xl:-ml-20 xl:w-[420px] xl:pl-20"
          aria-label="Index of chapters"
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-transparent via-[#30352a]/52 to-[#30352a]" aria-hidden="true" />
          <div className="relative flex h-full min-h-0 flex-col bg-[#30352a]" data-lenis-prevent>
            <TravelIndex
              chapters={chapters}
              selected={selectedSlug}
              hovered={hoveredSlug}
              reduce={prefersReduced}
              onSelect={handleRowSelect}
              onHover={handleHover}
              onOpenTicket={handleOpenTicket}
              flight={flight}
              routeKm={totalKm}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function MapboxMap(props: { chapters: TravelChapter[]; mapboxToken: string }) {
  return <MapErrorBoundary><MapboxMapInner chapters={props.chapters} mapboxToken={props.mapboxToken} /></MapErrorBoundary>;
}
