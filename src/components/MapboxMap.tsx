import { useState, useMemo, useRef, useCallback, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo, MouseEvent as ReactMouseEvent } from 'react';
import MapGL, { Marker, NavigationControl, AttributionControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion';
import { RotateCcw, X } from 'lucide-react';
import { silenceArchivePlaceLabels } from '../lib/atlasBasemap';
import { greatCircle } from '../lib/routeGeometry';
import { CSS_EASE, DUR_MS, EASE, bezierFn } from '../lib/motion';
import { TRAVEL_PLATE_HOLD_MS, TRAVEL_PLATE_RELEASE_MS, clearTravelPlate, markTravelPlate } from '../lib/travelPlate';
import { MAP_BURN, MAP_INK } from '../lib/mapInk';
import { landmarkFor } from '../lib/placeLandmarks';
import {
  HAIRLINES,
  LABEL,
  LABEL_MINZOOM,
  LABEL_OPACITY,
  LABEL_PAINT,
  LABEL_SIZE,
  TRAVEL_FOG,
  TRAVEL_GROUND,
  TRAVEL_SATELLITE,
  calloutGroups,
  flightMs,
  greatCircleKm,
  groundRole,
  landingCamera,
  leadOf,
  metresPerPixel,
  niceScale,
  placeGrade,
  placeLabels,
  projectAround,
  routeKm,
  scaleLabel,
  sheetHeight,
  travelSatellitePaint,
} from '../lib/travelSilver';
import type { LabelPlacement, ScreenPoint, SheetMode, TravelChapter, TravelViewport } from '../lib/travelSilver';
import TravelIndex, { TravelRows } from './travel/TravelIndex';
import type { TravelFlight } from './travel/TravelIndex';
import TravelTicket, { warmPlate } from './travel/TravelTicket';
import TravelMark, { LANDMARK_CLEARANCE, chooseLandmarkSide, landmarkBox } from './travel/TravelMark';
import type { LandmarkSide } from './travel/TravelMark';

// ─── The atlas in silver ───
// /travel is the homepage's silver planet laid flat as a working atlas: the
// same satellite photograph printed through an olive-to-bone ramp, marks in
// the homepage's white ink (src/lib/mapInk.ts), the index numbered the way
// the homepage numbers its chapters, and a chosen chapter's ticket printed in
// its own stock. The values live in src/lib/travelSilver.ts; this file owns
// the map instance and every write.

const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';

/**
 * Print dark-v11 in silver. Everything the vector style drew on land
 * (landcover, parks, roads, buildings) is the photograph's job now, and the
 * map's own type says less than the archive: nothing below z5, towns and
 * states as context once the camera is down on a place. The vector ground
 * stays under the photograph as a dark print, so loading tiles never show a
 * wireframe.
 */
function applySilverGround(map: any) {
  const layers: Array<{ id: string; type: string }> = map.getStyle()?.layers ?? [];
  layers.forEach((layer) => {
    const role = groundRole(layer);
    if (role === 'hide') map.setLayoutProperty(layer.id, 'visibility', 'none');
    else if (role === 'ground') map.setPaintProperty(layer.id, 'background-color', TRAVEL_GROUND);
    else if (role === 'water') {
      map.setPaintProperty(layer.id, 'fill-color', TRAVEL_GROUND);
      map.setPaintProperty(layer.id, 'fill-opacity', 1);
    } else if (role === 'hairline') {
      Object.entries(HAIRLINES[layer.id] ?? HAIRLINES['admin-1-boundary']).forEach(([key, value]) => map.setPaintProperty(layer.id, key, value));
    } else if (role === 'label') {
      Object.entries(LABEL_PAINT).forEach(([key, value]) => map.setPaintProperty(layer.id, key, value));
      map.setPaintProperty(layer.id, 'text-opacity', LABEL_OPACITY[layer.id]);
      const own = map.getLayer(layer.id) as { minzoom?: number; maxzoom?: number } | undefined;
      if (LABEL_MINZOOM[layer.id] != null) {
        map.setLayerZoomRange(layer.id, Math.max(own?.minzoom ?? 0, LABEL_MINZOOM[layer.id]), own?.maxzoom ?? 24);
      }
      if (LABEL_SIZE[layer.id]) {
        try {
          map.setLayoutProperty(layer.id, 'text-size', LABEL_SIZE[layer.id]);
        } catch {
          // A style whose labels cannot take the size keeps its own.
        }
      }
      // Uppercase tracking is capped at 0.1em site-wide, the basemap's too.
      const tracking = map.getLayoutProperty(layer.id, 'text-letter-spacing');
      if (typeof tracking === 'number' ? tracking > 0.1 : Array.isArray(tracking)) {
        try {
          map.setLayoutProperty(layer.id, 'text-letter-spacing', typeof tracking === 'number' ? 0.1 : ['min', 0.1, tracking]);
        } catch {
          // A style whose tracking cannot be composed keeps its own.
        }
      }
    }
  });
  if (!map.getSource(TRAVEL_SATELLITE.source)) {
    map.addSource(TRAVEL_SATELLITE.source, { type: 'raster', url: TRAVEL_SATELLITE.url, tileSize: 256 });
  }
  if (!map.getLayer(TRAVEL_SATELLITE.layer)) {
    // Above every fill, below the boundaries, the route, the rings and the type.
    const before = map.getLayer('admin-1-boundary')
      ? 'admin-1-boundary'
      : layers.find((layer) => layer.type === 'symbol')?.id;
    map.addLayer({ id: TRAVEL_SATELLITE.layer, type: 'raster', source: TRAVEL_SATELLITE.source, paint: travelSatellitePaint() }, before);
  }
  map.setFog(TRAVEL_FOG);
}

/** A transparent image as big as a mark, its name and its landmark. */
const KEEP_OUT = { id: 'travel-keepout', width: 200, height: 112, offsetY: -39 } as const;


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
/** A place's landmark is detail for a close look: below this zoom the whole
 *  archive is on screen and a drawing would crowd its neighbours. */
const LANDMARK_MIN_ZOOM = 5;
/** The ticket-to-story hand-off waiting for its page change (its listeners'
 *  remover), so a second click replaces it rather than adding another. It
 *  outlives this component: the hand-off runs as the page is swapped. */
let pendingPlateHandoff: (() => void) | null = null;

const REST_PLACEMENT: LabelPlacement = { mode: 'right', dx: LABEL.gap, dy: 0, leader: null, group: null };
interface LabelState {
  placements: LabelPlacement[];
  hidden: boolean[];
}
const sameLabels = (a: LabelState, placements: LabelPlacement[], hidden: boolean[]) =>
  a.placements.length === placements.length
  && a.placements.every((p, i) => {
    const q = placements[i];
    return p.mode === q.mode && p.dx === q.dx && p.dy === q.dy && p.group === q.group
      && JSON.stringify(p.leader) === JSON.stringify(q.leader);
  })
  && a.hidden.every((value, i) => value === hidden[i]);
const groupKeyOf = (groups: readonly number[][] | null, index: number) =>
  groups?.find((group) => group.includes(index))?.join('-') ?? String(index);

function slugifyPlace(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Main Inner Component ───
function MapboxMapInner({ chapters, mapboxToken }: { chapters: TravelChapter[]; mapboxToken: string }) {
  const mapRef = useRef<MapRef>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const collarRef = useRef<HTMLDivElement>(null);
  const atlasStyleReadyRef = useRef(false);
  const atlasReadySignaledRef = useRef(false);
  const initialPlaceAppliedRef = useRef(false);
  const sheetDragControls = useDragControls();
  const mobileSheetHeaderRef = useRef<HTMLButtonElement>(null);
  const prefersReduced = !!useReducedMotion();
  const reduceRef = useRef(prefersReduced);
  reduceRef.current = prefersReduced;

  const [mobileLayout, setMobileLayout] = useState(false);
  // The chapter chosen (the index row, the ticket, the URL) and the chapter
  // the camera has come to rest on. They differ for the length of a flight.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [landedSlug, setLandedSlug] = useState<string | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  // Arrival: one thin ring at the focal point, only when a flight ran its
  // full clock. It plays once on mount and ends invisible (animation fill),
  // so it is left in place until the next choice rather than costing the
  // landing a second render to take away. Every flight carries a token in its eventData and only the
  // newest flight's own moveend can land — a second selection interrupts the
  // first with stop(), which fires the FIRST flight's moveend while the
  // second is already in the air.
  const [arrivedSlug, setArrivedSlug] = useState<string | null>(null);
  const [landmarkSlug, setLandmarkSlug] = useState<string | null>(null);
  const [flight, setFlight] = useState<TravelFlight | null>(null);
  const [labels, setLabels] = useState<LabelState>(() => ({
    placements: chapters.map(() => REST_PLACEMENT),
    hidden: chapters.map(() => false),
  }));
  const [layersReady, setLayersReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<SheetMode>('peek');

  // Mirrors for the map's own event handlers, which outlive any one render.
  const selectedRef = useRef<string | null>(null);
  const landedRef = useRef<string | null>(null);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const mobileSheetRef = useRef<SheetMode>('peek');
  mobileSheetRef.current = mobileSheet;
  // The sheet height the camera last framed for, so a sheet change the
  // camera already flew for (a selection) is not framed twice.
  const sheetFramedRef = useRef<SheetMode>('peek');
  const flightTokenRef = useRef(0);
  const flightStartRef = useRef(0);
  const flightDurationRef = useRef(0);
  const flightSlugRef = useRef<string | null>(null);
  // The callouts: the groups as they stand, and as they stood the last time
  // the camera framed the whole archive (where a reset is going back to).
  const groupsRef = useRef<number[][] | null>(null);
  const overviewGroupsRef = useRef<number[][] | null>(null);
  const atOverviewRef = useRef(true);
  const landmarkSideRef = useRef<Record<string, LandmarkSide>>({});
  const litRef = useRef<{ chapters: [number, number]; live: 0 | 1 }>({ chapters: [-1, -1], live: 0 });

  const bySlug = useMemo(() => new Map(chapters.map((chapter) => [chapter.slug, chapter])), [chapters]);
  const leads = useMemo(() => chapters.map(leadOf), [chapters]);
  const totalKm = useMemo(() => routeKm(leads), [leads]);
  const frameCount = useMemo(() => chapters.reduce((sum, chapter) => sum + chapter.frames.length, 0), [chapters]);
  const archiveBounds = useMemo(() => {
    const places = chapters.flatMap((chapter) => chapter.places);
    if (!places.length) return null;
    const lngs = places.map((place) => place.lng);
    const lats = places.map((place) => place.lat);
    return [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ] as [[number, number], [number, number]];
  }, [chapters]);
  // A place on this map is named once, by the archive: the basemap is asked
  // not to set its own label for a place (or a chapter) the archive names.
  const archiveNames = useMemo(
    () => [...new Set([...chapters.flatMap((chapter) => chapter.places.map((place) => place.city)), ...chapters.map((chapter) => chapter.name)])],
    [chapters],
  );
  // Every place, for the rings and the keep-out. A chapter's mark stands on
  // its lead place; its other places (New York's second corner) are rings.
  const placesGeo = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: chapters.flatMap((chapter, index) => chapter.places.map((place, placeIndex) => ({
      type: 'Feature' as const,
      id: index * 100 + placeIndex + 1,
      properties: { chapter: index + 1, lead: placeIndex === chapter.lead },
      geometry: { type: 'Point' as const, coordinates: [place.lng, place.lat] },
    }))),
  }), [chapters]);
  // THE ROUTE — one great-circle leg per consecutive CHAPTER, lead to lead,
  // tagged with the chapter at each end so a chosen chapter lights its own.
  const routeGeo = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: leads.slice(1).map((to, index) => ({
      type: 'Feature' as const,
      properties: { from: index + 1, to: index + 2 },
      geometry: { type: 'LineString' as const, coordinates: greatCircle(leads[index], to) },
    })),
  }), [leads]);

  useEffect(() => () => {
    delete document.documentElement.dataset.atlasReady;
  }, []);

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

  // What the camera is framing for: which layout, and on the phone how much
  // of the map the sheet leaves.
  const viewportFor = useCallback((sheet: SheetMode): TravelViewport => {
    const compact = window.matchMedia('(max-width: 1023px)').matches;
    const mapHeight = mapRef.current?.getMap().getContainer().clientHeight || window.innerHeight;
    return { compact, feather: window.innerWidth >= 1280 ? 80 : 48, sheet: sheetHeight(sheet, window.innerHeight, mapHeight) };
  }, []);

  // The basemap's context type (towns, states) sits out a flight and comes
  // back as the camera settles, with Mapbox's own symbol fade. Placing it on
  // every frame of a flight was, with the photograph, the flights' whole cost
  // on a slow machine (4× CPU: 16 frames over 20ms per flight with it, 4
  // without); and a town name streaming past is not something anyone reads.
  const contextTypeRef = useRef(true);
  const setContextType = useCallback((visible: boolean) => {
    const map = mapRef.current?.getMap();
    if (!map || contextTypeRef.current === visible) return;
    contextTypeRef.current = visible;
    Object.keys(LABEL_OPACITY).forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    });
  }, []);

  const beginFlight = useCallback((slug: string | null, duration: number) => {
    flightTokenRef.current += 1;
    flightStartRef.current = performance.now();
    flightDurationRef.current = duration;
    flightSlugRef.current = slug;
    if (duration > 0) setContextType(false);
    return flightTokenRef.current;
  }, [setContextType]);

  // ── The names on the map ──
  // Laid out when the camera is at rest (never per frame): each name beside
  // its mark, or stacked in a callout with the marks it stands among.
  const labelWidths = useCallback((container: HTMLElement) => chapters.map((chapter) => {
    const label = container.querySelector<HTMLElement>(`[data-travel-label="${CSS.escape(chapter.slug)}"]`);
    return label?.offsetWidth || 80;
  }), [chapters]);

  const layoutLabels = useCallback((map: any) => {
    const container: HTMLElement = map.getContainer();
    const points: ScreenPoint[] = leads.map((lngLat) => {
      const point = map.project(lngLat);
      return { x: point.x, y: point.y };
    });
    const groups = calloutGroups(points, groupsRef.current);
    groupsRef.current = groups;
    if (atOverviewRef.current) overviewGroupsRef.current = groups;
    const widths = labelWidths(container);
    const legs = routeGeo.features.map((leg) => leg.geometry.coordinates.map((coordinate) => {
      const point = map.project(coordinate as [number, number]);
      return { x: point.x, y: point.y };
    }));
    const placements = placeLabels(points, groups, widths, container.clientWidth, legs);
    // A dimmed name that would lie across the landed place's landmark waits
    // until the camera leaves (Zion's name under Page's canyon on the phone).
    const hidden = chapters.map(() => false);
    const landed = landedRef.current;
    const landedIndex = landed ? chapters.findIndex((chapter) => chapter.slug === landed) : -1;
    if (landedIndex >= 0 && map.getZoom() >= LANDMARK_MIN_ZOOM) {
      const box = landmarkBox(landed, landmarkSideRef.current[landed as string] ?? 'above');
      if (box) {
        const origin = points[landedIndex];
        chapters.forEach((_, j) => {
          if (j === landedIndex) return;
          const x0 = points[j].x + placements[j].dx - origin.x;
          const x1 = x0 + widths[j];
          const y0 = points[j].y + placements[j].dy - 8 - origin.y;
          const y1 = y0 + 16;
          if (x1 > box.x0 && x0 < box.x1 && y1 > box.y0 && y0 < box.y1) hidden[j] = true;
        });
      }
    }
    setLabels((current) => (sameLabels(current, placements, hidden) ? current : { placements, hidden }));
  }, [chapters, labelWidths, leads, routeGeo]);

  /** Where a flight is going, decided as it takes off. Names that will
   *  gather into a callout there, or leave one, wait unseen until the camera
   *  lands and they can be set where they will stand — except the name of
   *  the chapter being flown to, which is set beside its mark at once (the
   *  trio's three names side by side collided for the first half-second). */
  const prepareLabels = useCallback((destination: { points: ScreenPoint[] | null; groups: number[][] | null; focus?: number; legs?: ScreenPoint[][] }) => {
    const map = mapRef.current?.getMap();
    const destGroups = destination.groups;
    if (!map || !destGroups) return;
    const current = groupsRef.current;
    const container: HTMLElement = map.getContainer();
    const destPlacements = destination.points
      ? placeLabels(destination.points, destGroups, labelWidths(container), container.clientWidth, destination.legs)
      : null;
    setLabels((state) => {
      const placements = [...state.placements];
      const hidden = [...state.hidden];
      let changed = false;
      chapters.forEach((_, i) => {
        if (groupKeyOf(current, i) === groupKeyOf(destGroups, i)) return;
        const joining = (destGroups.find((group) => group.includes(i))?.length ?? 1) > 1;
        if (joining || i !== destination.focus) {
          if (!hidden[i]) { hidden[i] = true; changed = true; }
          return;
        }
        placements[i] = destPlacements?.[i] ?? REST_PLACEMENT;
        hidden[i] = false;
        changed = true;
      });
      return changed ? { placements, hidden } : state;
    });
    groupsRef.current = destGroups;
  }, [chapters, labelWidths]);

  // ── The scale collar ──
  // Measured on the map itself at the bar's own height — the globe is not
  // Mercator below z5 — from two points 100px apart, after every move.
  const updateCollar = useCallback((map: any) => {
    const collar = collarRef.current;
    if (!collar || !window.matchMedia('(min-width: 1024px)').matches) return;
    const container: HTMLElement = map.getContainer();
    const y = container.clientHeight - 67;
    let mpp = Number.NaN;
    try {
      const a = map.unproject([22, y]);
      const b = map.unproject([122, y]);
      const back = map.project(b);
      if (Math.hypot(back.x - 122, back.y - y) < 1) mpp = (greatCircleKm([a.lng, a.lat], [b.lng, b.lat]) * 1000) / 100;
    } catch {
      mpp = Number.NaN;
    }
    if (!(mpp > 0) || !Number.isFinite(mpp)) mpp = metresPerPixel(map.getZoom(), map.getCenter().lat);
    const metres = niceScale(110 * mpp);
    collar.style.setProperty('--collar-w', `${Math.round(metres / mpp)}px`);
    const label = collar.querySelector('.travel-collar__label');
    const text = scaleLabel(metres);
    if (label && label.textContent !== text) label.textContent = text;
  }, []);

  // ── The landmark ──
  // Which side of its mark a chapter's landmark stands on: over it by
  // default, else level with it on the side its name does not take, else
  // under it — the first no leg of the route runs through, read from the
  // camera it is about to be shown under, once per landing.
  const landmarkSideFor = useCallback((map: any, index: number): LandmarkSide => {
    const chapter = chapters[index];
    const landmark = landmarkFor(chapter.slug);
    if (!landmark) return 'above';
    const origin = map.project(leads[index]);
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
    const outgoing = routeGeo.features[index];
    const incoming = routeGeo.features[index - 1];
    if (outgoing) trace(outgoing.geometry.coordinates);
    if (incoming) trace([...incoming.geometry.coordinates].reverse());
    const nameSide = labelsRef.current.placements[index]?.mode;
    return chooseLandmarkSide(paths, landmark.height, LANDMARK_CLEARANCE, [
      'above',
      nameSide === 'left' ? 'right' : 'left',
      'below',
    ]);
  }, [chapters, leads, routeGeo]);

  // ── Framing ──
  const frameArchiveOverview = useCallback((duration = 0, token?: number, sheet: SheetMode = 'peek') => {
    const map = mapRef.current?.getMap();
    if (!map || !archiveBounds) return;
    const viewport = viewportFor(sheet);
    atOverviewRef.current = true;
    map.fitBounds(archiveBounds, {
      padding: viewport.compact
        ? { top: 56, right: 40, bottom: (viewport.sheet ?? 78) + 44, left: 48 }
        : { top: 58, right: 108, bottom: 58, left: 68 },
      maxZoom: viewport.compact ? 3.6 : 3.7,
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
    const viewport = viewportFor('detail');
    const camera = landingCamera(chapter, viewport);
    const centre = map.getCenter();
    const duration = jump || reduceRef.current ? 0 : flightMs(greatCircleKm([centre.lng, centre.lat], camera.center));
    atOverviewRef.current = false;
    const container: HTMLElement = map.getContainer();
    const size = { width: container.clientWidth, height: container.clientHeight };
    const points = leads.map((lngLat) => projectAround(lngLat, camera, size));
    const legs = routeGeo.features.map((leg) => leg.geometry.coordinates.map((coordinate) => projectAround(coordinate as [number, number], camera, size)));
    prepareLabels({ points, groups: calloutGroups(points, groupsRef.current), focus: chapters.indexOf(chapter), legs });
    const token = beginFlight(chapter.slug, duration);
    if (duration === 0) map.jumpTo({ ...camera, retainPadding: false }, { travelFlight: token });
    else map.flyTo({ ...camera, duration, curve: FLIGHT_CURVE, easing: TRAVEL_EASE, essential: true, retainPadding: false }, { travelFlight: token });
  }, [beginFlight, chapters, leads, prepareLabels, routeGeo, viewportFor]);

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

  const deselect = useCallback((focusMap = false) => {
    if (!selectedRef.current) return;
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
    prepareLabels({ points: null, groups: overviewGroupsRef.current });
    frameArchiveOverview(OVERVIEW_MS, beginFlight(null, OVERVIEW_MS));
    // A lime focus ring never lingers on a row that is no longer chosen.
    if (focusMap) workspaceRef.current?.focus({ preventScroll: true });
  }, [beginFlight, frameArchiveOverview, prepareLabels, updatePlaceUrl]);

  // A chapter chosen again from the index is put back (on the phone, its
  // ticket comes back up instead).
  const handleRowSelect = useCallback((slug: string) => {
    if (selectedRef.current !== slug) selectChapter(slug);
    else if (window.matchMedia('(max-width: 1023px)').matches) setMobileSheet('detail');
    else deselect();
  }, [deselect, selectChapter]);

  /** Marks standing together in a callout open as a group, in one click:
   *  the camera fits them so the next view shows them apart. */
  const fitGroup = useCallback((members: number[]) => {
    const map = mapRef.current?.getMap();
    if (!map || members.length < 2) return;
    const points = members.map((index) => leads[index]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))],
      [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))],
    ];
    const compact = window.matchMedia('(max-width: 1023px)').matches;
    const centre = map.getCenter();
    const mid: [number, number] = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
    const duration = reduceRef.current ? 0 : flightMs(greatCircleKm([centre.lng, centre.lat], mid));
    atOverviewRef.current = false;
    const token = beginFlight(null, duration);
    map.fitBounds(bounds, {
      padding: compact ? { top: 90, right: 70, bottom: 150, left: 70 } : { top: 150, right: 200, bottom: 150, left: 160 },
      maxZoom: 7.4,
      duration,
      easing: TRAVEL_EASE,
      essential: true,
      retainPadding: false,
    }, { travelFlight: token });
  }, [beginFlight, leads]);

  const handleMark = useCallback((slug: string) => {
    const index = chapters.findIndex((chapter) => chapter.slug === slug);
    const group = groupsRef.current?.find((members) => members.includes(index));
    if (group && group.length > 1 && selectedRef.current !== slug) fitGroup(group);
    else selectChapter(slug);
  }, [chapters, fitGroup, selectChapter]);
  const handleName = useCallback((slug: string) => selectChapter(slug), [selectChapter]);
  const handleHover = useCallback((slug: string | null) => setHoveredSlug(slug), []);

  // ── Into the story ──
  // The ticket's photograph grows into the story across the page change (a
  // view transition), over the map it was chosen on, to full bleed; holds
  // there a beat; and gives way to the story's front page, which holds from
  // then (travelPlate.ts) — a homepage plate's landing, from a ticket. The
  // growing plate is the full-size cover (warmed from the ticket's hover,
  // focus or press), in a box of the photograph's own ratio that covers the
  // viewport: the ticket's print and the plate are the same picture at the
  // same ratio, so the grow is one uniform scale and the sharp plate comes
  // up over the ticket's print pixel for pixel in the first part of it. It
  // used to carry the ticket's 171px print alone, blown up ten times to the
  // screen with its perforation, fading out before it got there, over a
  // page that had already cut to the story. When the full-size cover is not
  // in yet, the stand-in plane is transparent and the ticket's print gives
  // way to the story as before (html[data-travel-plate-blank]). The stub is
  // not carried: a story's kept stub arrives only once the story has loaded
  // (owner, 2026-09-27).
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
    setContextType(true);
    updateCollar(map);
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
      const index = chapters.findIndex((chapter) => chapter.slug === landedNow);
      if (index >= 0) landmarkSideRef.current[landedNow] = landmarkSideFor(map, index);
    }
    const landed = landedRef.current && landedRef.current === selectedRef.current ? landedRef.current : null;
    const shown = landed && map.getZoom() >= LANDMARK_MIN_ZOOM ? landed : null;
    setLandmarkSlug((current) => (current === shown ? current : shown));
    layoutLabels(map);
  }, [chapters, landmarkSideFor, layoutLabels, setContextType, updateCollar]);
  const moveEndRef = useRef(handleMoveEnd);
  moveEndRef.current = handleMoveEnd;

  // The archive's own layers: the route under the rings, the rings, and the
  // keep-out that stops the basemap setting a word on a mark.
  const addArchiveLayers = useCallback((map: any) => {
    const firstSymbol = map.getStyle()?.layers?.find((layer: any) => layer.type === 'symbol' && layer.layout?.visibility !== 'none')?.id;
    const fade = { duration: reduceRef.current ? 0 : 520, delay: 0 };
    if (!map.getSource('travel-route')) map.addSource('travel-route', { type: 'geojson', data: routeGeo });
    if (!map.getSource('travel-places')) map.addSource('travel-places', { type: 'geojson', data: placesGeo });
    // The route: the homepage atlas's dashed white leg, [3, 4], on a burn
    // casing so it reads over bright rock as well as water. A chosen
    // chapter's legs are overdrawn at full ink on two layers that take turns
    // (a constant opacity transitions; a data-driven one would snap).
    const lineLayout = { 'line-cap': 'round', 'line-join': 'round' };
    const add = (layer: any) => { if (!map.getLayer(layer.id)) map.addLayer(layer, firstSymbol); };
    add({ id: 'travel-route-casing', type: 'line', source: 'travel-route', layout: lineLayout, paint: { 'line-color': MAP_BURN, 'line-width': 4, 'line-blur': 3, 'line-opacity': 0.34 } });
    ([0, 1] as const).forEach((slot) => add({
      id: `travel-route-lit-casing-${slot}`,
      type: 'line',
      source: 'travel-route',
      filter: ['==', ['get', 'from'], -1],
      layout: lineLayout,
      paint: { 'line-color': MAP_BURN, 'line-width': 4.5, 'line-blur': 3, 'line-opacity': 0, 'line-opacity-transition': fade },
    }));
    add({ id: 'travel-route-line', type: 'line', source: 'travel-route', layout: lineLayout, paint: { 'line-color': MAP_INK, 'line-width': 1, 'line-dasharray': [3, 4], 'line-opacity': 0.62, 'line-opacity-transition': fade } });
    ([0, 1] as const).forEach((slot) => add({
      id: `travel-route-lit-${slot}`,
      type: 'line',
      source: 'travel-route',
      filter: ['==', ['get', 'from'], -1],
      layout: lineLayout,
      paint: { 'line-color': MAP_INK, 'line-width': 1, 'line-dasharray': [3, 4], 'line-opacity': 0, 'line-opacity-transition': fade },
    }));
    // The rings: every place a small hollow ring in the homepage's ink, on a
    // soft burn, upright to the viewer. The chosen chapter's lead place hands
    // its ring to the DOM mark (focus point and ring); its other places keep
    // theirs at full ink while the rest of the field dims by alpha, never to
    // a grey disc.
    const ring = {
      'circle-radius': 3.9,
      'circle-color': '#1b1f16',
      'circle-opacity': 0.86,
      'circle-stroke-color': MAP_INK,
      'circle-stroke-width': 1.25,
      'circle-stroke-opacity': 0.96,
      'circle-stroke-opacity-transition': { duration: reduceRef.current ? 0 : 320, delay: 0 },
      'circle-pitch-alignment': 'viewport',
      'circle-emissive-strength': 1,
    };
    add({ id: 'travel-rings-burn', type: 'circle', source: 'travel-places', paint: { 'circle-radius': 6.2, 'circle-color': MAP_BURN, 'circle-opacity': 0.42, 'circle-blur': 0.9, 'circle-pitch-alignment': 'viewport' } });
    add({ id: 'travel-rings', type: 'circle', source: 'travel-places', paint: ring });
    add({ id: 'travel-rings-own', type: 'circle', source: 'travel-places', filter: ['==', ['get', 'chapter'], -1], paint: ring });
    // Keep-out: an invisible icon as big as a mark, its name and its
    // landmark, placed first (the topmost symbol layer), so the basemap can
    // no longer set "Hialeah" under Miami's name or "Kayenta" on Page.
    if (!map.hasImage(KEEP_OUT.id)) {
      map.addImage(KEEP_OUT.id, { width: KEEP_OUT.width, height: KEEP_OUT.height, data: new Uint8Array(KEEP_OUT.width * KEEP_OUT.height * 4) });
    }
    if (!map.getLayer(KEEP_OUT.id)) {
      map.addLayer({
        id: KEEP_OUT.id,
        type: 'symbol',
        source: 'travel-places',
        layout: { 'icon-image': KEEP_OUT.id, 'icon-allow-overlap': true, 'icon-ignore-placement': false, 'icon-offset': [0, KEEP_OUT.offsetY] },
        paint: { 'icon-opacity': 0 },
      });
    }
  }, [placesGeo, routeGeo]);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const finish = () => {
      map.setProjection('globe');
      if (window.matchMedia('(pointer: coarse)').matches) map.touchZoomRotate.disableRotation();
      applySilverGround(map);
      silenceArchivePlaceLabels(map, archiveNames);
      addArchiveLayers(map);
      // The key light: the print lit from the upper left, like the globe —
      // over the canvas, under every DOM mark, at no GPU cost.
      const canvas = map.getCanvas();
      if (!canvas.parentElement?.querySelector('.travel-key-light')) {
        const light = document.createElement('div');
        light.className = 'travel-key-light';
        light.setAttribute('aria-hidden', 'true');
        canvas.after(light);
      }
      // The place grade, written as plain numbers when they change.
      let lastBrightness = -1;
      const grade = () => {
        const { brightness, contrast } = placeGrade(map.getZoom());
        if (brightness === lastBrightness) return;
        lastBrightness = brightness;
        map.setPaintProperty(TRAVEL_SATELLITE.layer, 'raster-brightness-max', brightness);
        map.setPaintProperty(TRAVEL_SATELLITE.layer, 'raster-contrast', contrast);
      };
      grade();
      map.on('zoom', grade);
      map.on('moveend', (event: any) => moveEndRef.current(event));
      // A hand on the map takes the camera: the flight it stopped lands nowhere.
      map.on('dragstart', () => { flightSlugRef.current = null; atOverviewRef.current = false; });
      map.on('zoomstart', (event: any) => {
        if (!event.originalEvent) return;
        flightSlugRef.current = null;
        atOverviewRef.current = false;
      });
      frameArchiveOverview(0);
      atlasStyleReadyRef.current = true;
      setLayersReady(true);
      setMapLoadFailed(false);
    };
    if (map.isStyleLoaded()) finish();
    else map.once('style.load', finish);
  }, [addArchiveLayers, archiveNames, frameArchiveOverview]);

  const handleMapIdle = useCallback(() => {
    if (!atlasStyleReadyRef.current || atlasReadySignaledRef.current) return;
    atlasReadySignaledRef.current = true;
    setMapLoadFailed(false);
    setMapReady(true);
    document.documentElement.dataset.atlasReady = 'true';
    window.dispatchEvent(new CustomEvent('gallery:atlas-ready'));
    const map = mapRef.current?.getMap();
    if (map) {
      layoutLabels(map);
      updateCollar(map);
    }
  }, [layoutLabels, updateCollar]);

  // The names are measured in their own faces: once the webfonts are in,
  // lay them out again.
  useEffect(() => {
    if (!mapReady || !document.fonts) return;
    let live = true;
    document.fonts.ready.then(() => {
      const map = mapRef.current?.getMap();
      if (live && map && !map.isMoving()) layoutLabels(map);
    });
    return () => { live = false; };
  }, [layoutLabels, mapReady]);

  // The chosen chapter on the canvas: its lead ring handed to the DOM mark,
  // its other places at full ink, the rest of the field dimmed by alpha, and
  // its legs of the route lit.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !layersReady) return;
    const index = chapters.findIndex((chapter) => chapter.slug === selectedSlug);
    const chapterNo = index >= 0 ? index + 1 : -1;
    map.setFilter('travel-rings', chapterNo > 0 ? ['!=', ['get', 'chapter'], chapterNo] : null);
    map.setFilter('travel-rings-own', ['all', ['==', ['get', 'chapter'], chapterNo], ['!', ['get', 'lead']]]);
    map.setPaintProperty('travel-rings', 'circle-stroke-opacity', chapterNo > 0 ? 0.5 : 0.96);
    map.setPaintProperty('travel-route-line', 'line-opacity', chapterNo > 0 ? 0.4 : 0.62);
    const lit = litRef.current;
    if (lit.chapters[lit.live] === chapterNo) return;
    const next: 0 | 1 = lit.live === 0 ? 1 : 0;
    const legs = ['any', ['==', ['get', 'from'], chapterNo], ['==', ['get', 'to'], chapterNo]];
    map.setFilter(`travel-route-lit-${next}`, legs);
    map.setFilter(`travel-route-lit-casing-${next}`, legs);
    map.setPaintProperty(`travel-route-lit-${next}`, 'line-opacity', chapterNo > 0 ? 0.94 : 0);
    map.setPaintProperty(`travel-route-lit-casing-${next}`, 'line-opacity', chapterNo > 0 ? 0.3 : 0);
    map.setPaintProperty(`travel-route-lit-${lit.live}`, 'line-opacity', 0);
    map.setPaintProperty(`travel-route-lit-casing-${lit.live}`, 'line-opacity', 0);
    lit.chapters[next] = chapterNo;
    lit.live = next;
  }, [chapters, layersReady, selectedSlug]);

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
  // chosen chapter over the sheet's edge, or the whole archive above it. The
  // camera used to stay put, and closing the detail sheet left the place
  // pinned under the masthead over an empty map.
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
      leads.forEach(([placeLng, placeLat], index) => {
        const distance = Math.abs(placeLat - lat) + Math.abs(placeLng - lng);
        if (distance < minDist) { minDist = distance; closest = index; }
      });
      if (closest >= 0 && minDist < 2) selectChapter(chapters[closest].slug);
    };
    goToRequestedPlace();
    window.addEventListener('hashchange', goToRequestedPlace);
    window.addEventListener('popstate', goToRequestedPlace);
    return () => {
      window.removeEventListener('hashchange', goToRequestedPlace);
      window.removeEventListener('popstate', goToRequestedPlace);
    };
  }, [chapters, leads, mapReady, selectChapter]);

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

  // The marks, rendered only when something they show changes — never per
  // frame: Mapbox moves the marker elements itself.
  const markers = useMemo(() => chapters.map((chapter, index) => {
    const [lng, lat] = leads[index];
    const selected = selectedSlug === chapter.slug;
    const hovered = hoveredSlug === chapter.slug;
    const placement = labels.placements[index] ?? REST_PLACEMENT;
    const members = placement.group ? placement.group.split('-').map(Number) : null;
    const groupLabel = members && !selected
      ? `Show ${members.map((member) => chapters[member]?.name).filter(Boolean).join(', ')}`
      : null;
    return (
      <Marker
        key={chapter.slug}
        longitude={lng}
        latitude={lat}
        anchor="center"
        style={{ zIndex: selected ? 3 : hovered ? 2 : 1 }}
      >
        <TravelMark
          chapter={chapter}
          total={chapters.length}
          selected={selected}
          hovered={hovered}
          dimmed={!!selectedSlug && !selected && !hovered}
          arrived={arrivedSlug === chapter.slug}
          landmarkShown={landmarkSlug === chapter.slug}
          landmarkSide={landmarkSideRef.current[chapter.slug] ?? 'above'}
          placement={placement}
          labelHidden={labels.hidden[index] ?? false}
          groupLabel={groupLabel}
          reduce={prefersReduced}
          onMark={handleMark}
          onName={handleName}
          onHover={handleHover}
        />
      </Marker>
    );
  }), [arrivedSlug, chapters, handleHover, handleMark, handleName, hoveredSlug, labels, landmarkSlug, leads, prefersReduced, selectedSlug]);

  const selectedChapter = selectedSlug ? bySlug.get(selectedSlug) ?? null : null;
  const years = useMemo(() => {
    const values = [...new Set(chapters.map((chapter) => chapter.year).filter(Boolean))].sort();
    return values.length > 1 ? `${values[0]}–${values[values.length - 1]}` : values[0] ?? '';
  }, [chapters]);

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
            {markers}
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

          {/* The scale collar, as a surveyor prints it (updated after every
              move, from the map itself). */}
          <div ref={collarRef} className="travel-collar font-ui" aria-hidden="true">
            <span className="travel-collar__bar" />
            <span className="travel-collar__label" />
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
