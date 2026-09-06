import { useState, useMemo, useRef, useCallback, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import MapGL, { Marker, NavigationControl, AttributionControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import Supercluster from 'supercluster';
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, RotateCcw } from 'lucide-react';
import type { Photo } from '../types';
import Magnetic from './shared/Magnetic';

// ─── Accent color (unified warm dark tone) ───
const ACCENT = '#D2FF00';
const ACCENT_RGB = '210, 255, 0';
// Map markers use a calm warm ivory instead of the loud lime — dots read as
// map pins, not neon. (Lime stays for UI accents: tooltips, sidebar, etc.)
const DOT = '#E7E1CF';
const DOT_RGB = '231, 225, 207';

const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';

// ─── Region grouping (countries → region label) ───
const REGION_MAP: Record<string, string> = {
  'United States': 'North America',
  'Canada': 'North America',
  'Mexico': 'North America',
  'Brazil': 'South America',
  'Argentina': 'South America',
  'Colombia': 'South America',
  'United Kingdom': 'Europe',
  'France': 'Europe',
  'Germany': 'Europe',
  'Italy': 'Europe',
  'Spain': 'Europe',
  'Netherlands': 'Europe',
  'Switzerland': 'Europe',
  'Japan': 'Asia',
  'China': 'Asia',
  'South Korea': 'Asia',
  'Thailand': 'Asia',
  'Vietnam': 'Asia',
  'Singapore': 'Asia',
  'India': 'Asia',
  'Australia': 'Oceania',
  'New Zealand': 'Oceania',
};

function getRegion(country: string): string {
  return REGION_MAP[country] || country || 'Other';
}

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
          <span className="mb-4 h-2 w-2 rounded-full bg-[#D2FF00] shadow-[0_0_16px_rgba(210,255,0,0.36)]" aria-hidden="true" />
          <p className="font-serif text-2xl uppercase text-[#F4F4ED]">Atlas unavailable</p>
          <p className="mt-2 max-w-sm font-ui text-[10px] uppercase tracking-[0.2em] text-white/58">The geographic archive could not be drawn.</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} className="mt-5 inline-flex min-h-11 items-center rounded-full border border-white/14 px-5 font-ui text-[9px] uppercase tracking-[0.24em] text-white/72 transition-colors duration-300 hover:border-[#D2FF00]/45 hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]">Retry atlas</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Sidebar location cluster ───
interface LocationCluster {
  city: string;
  country: string;
  /** Fine-grained region from the collection (e.g. "Florida", "Arizona"). */
  region: string;
  lat: number;
  lng: number;
  photos: Photo[];
}

interface RegionGroup {
  region: string;
  clusters: LocationCluster[];
  totalPhotos: number;
}

function clusterByLocation(photos: Photo[]): LocationCluster[] {
  const groups: Record<string, LocationCluster & { coordinateCount: number; latTotal: number; lngTotal: number }> = {};
  for (const p of photos) {
    if (p.location?.lat == null || p.location?.lng == null) continue;
    const key = `${p.location.city || ''}|${p.location.country || ''}`;
    if (!groups[key]) {
      groups[key] = {
        city: p.location.city || 'Unknown',
        country: p.location.country || '',
        region: p.collection?.region?.trim() || '',
        lat: p.location.lat,
        lng: p.location.lng,
        photos: [],
        coordinateCount: 0,
        latTotal: 0,
        lngTotal: 0,
      };
    }
    // Backfill region if the first photo of a city lacked a collection region.
    if (!groups[key].region && p.collection?.region?.trim()) groups[key].region = p.collection.region.trim();
    groups[key].coordinateCount += 1;
    groups[key].latTotal += p.location.lat;
    groups[key].lngTotal += p.location.lng;
    groups[key].photos.push(p);
  }
  return Object.values(groups)
    .map(({ coordinateCount, latTotal, lngTotal, ...cluster }) => ({
      ...cluster,
      lat: latTotal / Math.max(1, coordinateCount),
      lng: lngTotal / Math.max(1, coordinateCount),
    }))
    .sort((a, b) => b.photos.length - a.photos.length);
}

function groupByRegion(clusters: LocationCluster[]): RegionGroup[] {
  const map: Record<string, LocationCluster[]> = {};
  for (const c of clusters) {
    // Prefer the collection's fine-grained region (Florida, Arizona, DMV…);
    // fall back to the country→continent map for anything untagged.
    const region = c.region || getRegion(c.country);
    if (!map[region]) map[region] = [];
    map[region].push(c);
  }
  return Object.entries(map)
    .map(([region, cls]) => ({ region, clusters: cls, totalPhotos: cls.reduce((s, c) => s + c.photos.length, 0) }))
    .sort((a, b) => b.totalPhotos - a.totalPhotos);
}

function formatCoord(v: number, pos: string, neg: string) {
  return `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;
}

function slugifyPlace(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clusterMatchesPlace(cluster: LocationCluster, place: string) {
  if (slugifyPlace(cluster.city) === place) return true;
  return cluster.photos.some((photo) => photo.collection?.slug === place);
}

function CityDetail({ cluster, mobile = false }: { cluster: LocationCluster; mobile?: boolean }) {
  const storySlug = cluster.photos[0]?.collection?.slug;
  return (
    <div className={mobile ? 'pb-[max(1.25rem,env(safe-area-inset-bottom))]' : ''}>
      <div className={`relative overflow-hidden ${mobile ? 'h-40' : 'h-36'}`}>
        <img
          src={`${cluster.photos[0].imageUrl}?auto=format&w=800&q=82`}
          alt={cluster.city}
          className="h-full w-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#11150f] via-black/15 to-transparent" />
        <div className="atlas-sheet-safe-inline absolute inset-x-0 bottom-3 flex items-end justify-between gap-4 font-ui text-[9px] uppercase tracking-[0.18em] text-white/64">
          <p>{cluster.country}</p>
          <span className="shrink-0 font-ui text-[9px] uppercase tracking-[0.16em] text-white/60">{cluster.photos.length} frames</span>
        </div>
      </div>
      <div className="atlas-sheet-safe-inline pb-4 pt-3">
        <p className="mb-3 font-ui text-[9px] tracking-[0.14em] text-white/56">
          {formatCoord(cluster.lat, 'N', 'S')} · {formatCoord(cluster.lng, 'E', 'W')}
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {cluster.photos.slice(0, 3).map((photo, index) => (
            <div key={photo._id} className="aspect-[4/3] overflow-hidden rounded-[0.45rem]">
              <img
                src={`${photo.imageUrl}?auto=format&w=220&q=76`}
                alt={typeof photo.title === 'string' && !photo.title.includes('[object Object]') ? photo.title : `${cluster.city} photograph ${index + 1}`}
                className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                loading="lazy"
                draggable={false}
              />
            </div>
          ))}
        </div>
        {storySlug && (
          <a
            href={`/works/${storySlug}`}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-3 rounded-full bg-[#D2FF00] px-5 font-ui text-[10px] font-bold uppercase tracking-[0.22em] text-[#171b15] transition-transform duration-300 hover:scale-[1.015] active:scale-[0.985]"
          >
            Explore story
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Camera framing — the map settles face-on over the continental US ───
// No dive-from-space intro: the "from space" globe zoom was inherently heavy
// (rendering the whole globe/atmosphere while a 60fps onMove re-render storm
const FINAL_VIEW = { latitude: 38.8, longitude: -97.5, zoom: 3.5, pitch: 0, bearing: 0 };
type MobileSheetMode = 'peek' | 'browse' | 'detail';

type AtlasClusterFeature = {
  id?: number | string;
  properties: {
    cluster?: boolean;
    cluster_id?: number;
    point_count?: number;
    cityIndex?: number;
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
    : `city-${String(feature.properties.cityIndex)}`;
}

// ─── Main Inner Component ───
function MapboxMapInner({ photos, mapboxToken }: { photos: Photo[]; mapboxToken: string }) {
  const mapRef = useRef<MapRef>(null);
  const atlasStyleReadyRef = useRef(false);
  const atlasReadySignaledRef = useRef(false);
  const sheetDragControls = useDragControls();
  const mobileSheetHeaderRef = useRef<HTMLButtonElement>(null);
  const activeClusterRef = useRef<LocationCluster | null>(null);
  const initialPlaceAppliedRef = useRef(false);
  const markerBloomPlayedRef = useRef(false);
  const clusterZoomFrameRef = useRef(0);
  const pendingClusterZoomRef = useRef(FINAL_VIEW.zoom);
  const playInitialMarkerBloom = !markerBloomPlayedRef.current;
  const prefersReduced = !!useReducedMotion();
  const coarsePointer = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  );
  const [mobileLayout, setMobileLayout] = useState(false);
  const [viewState, setViewState] = useState(FINAL_VIEW);
  const [clusterZoom, setClusterZoom] = useState(FINAL_VIEW.zoom);
  const [clusterMorphing, setClusterMorphing] = useState(false);
  // No dive intro any more — the map opens settled on the US, so markers may
  // bloom in immediately (they still stagger-animate on mount for a little life).
  const [activeCluster, setActiveCluster] = useState<LocationCluster | null>(null);
  const [activeClusterCity, setActiveClusterCity] = useState<string | null>(null);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<MobileSheetMode>('peek');
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);
  const seededRegion = useRef(false);

  // Only the markers present for the first rendered atlas field bloom. Any
  // markers introduced by later pans or zoom-level clustering appear without
  // a fresh stagger, so navigation never feels delayed.
  useEffect(() => {
    markerBloomPlayedRef.current = true;
  }, []);

  useEffect(() => {
    activeClusterRef.current = activeCluster;
  }, [activeCluster]);

  useEffect(() => () => {
    if (clusterZoomFrameRef.current) window.cancelAnimationFrame(clusterZoomFrameRef.current);
    delete document.documentElement.dataset.atlasReady;
  }, []);

  const cityClusters = useMemo(() => clusterByLocation(photos), [photos]);
  const regionGroups = useMemo(() => groupByRegion(cityClusters), [cityClusters]);
  const validPhotos = useMemo(() => photos.filter(p => p.location?.lat != null && p.location?.lng != null), [photos]);
  const archiveBounds = useMemo(() => {
    if (cityClusters.length === 0) return null;
    const lngs = cityClusters.map((cluster) => cluster.lng);
    const lats = cityClusters.map((cluster) => cluster.lat);
    return [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ] as [[number, number], [number, number]];
  }, [cityClusters]);

  useEffect(() => {
    if (seededRegion.current || regionGroups.length === 0) return;
    seededRegion.current = true;
    setExpandedRegion(regionGroups[0].region);
  }, [regionGroups]);

  // Keep interaction behavior aligned with the CSS breakpoint when a tablet
  // rotates or a desktop window crosses into the compact layout.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const sync = () => setMobileLayout(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (mobileSheet !== 'detail' || !activeCluster) return;
    requestAnimationFrame(() => mobileSheetHeaderRef.current?.focus({ preventScroll: true }));
  }, [activeCluster, mobileSheet]);

  // Never leave the visitor staring at an endless loading state if Mapbox is
  // unreachable. A slow connection still gets a generous window, then the
  // atlas becomes an explicit, retryable state instead of an apparent blank.
  useEffect(() => {
    if (mapReady || mapLoadFailed) return;
    const timeout = window.setTimeout(() => setMapLoadFailed(true), 12000);
    return () => window.clearTimeout(timeout);
  }, [mapLoadFailed, mapReady]);

  // Supercluster operates at the same semantic level as the atlas index: one
  // point per city. Photos from one city may share the exact GPS coordinate;
  // clustering every frame made that city a large badge that could never split
  // before max zoom, even though there was only one actual destination.
  const points = useMemo(() =>
    cityClusters.map((cluster, cityIndex) => ({
      type: 'Feature' as const,
      properties: { cluster: false, cityIndex },
      geometry: { type: 'Point' as const, coordinates: [cluster.lng, cluster.lat] },
    })),
    [cityClusters],
  );

  const clusterIndex = useMemo(() => {
    const idx = new Supercluster({ radius: 50, maxZoom: 16 });
    idx.load(points as any);
    return idx;
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
  // zoom frame. This gives children a real path out of their parent instead of
  // replacing one DOM tree with another after the camera has already stopped.
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
    const cityParent = new Map<number, AtlasClusterFeature>();

    lower.forEach((feature) => {
      if (feature.properties.cluster) {
        try {
          clusterIndex.getLeaves(feature.id as number, Infinity).forEach((leaf: any) => {
            const cityIndex = leaf.properties.cityIndex;
            if (Number.isInteger(cityIndex)) cityParent.set(cityIndex, feature);
          });
        } catch {
          // A malformed cluster should degrade to the upper node's own position.
        }
      } else if (Number.isInteger(feature.properties.cityIndex)) {
        cityParent.set(feature.properties.cityIndex as number, feature);
      }
    });

    const parentForUpper = new Map<string, AtlasClusterFeature>();
    const siblingCountByParent = new Map<string, number>();
    upper.forEach((feature) => {
      const key = atlasFeatureKey(feature);
      if (lowerByKey.has(key)) return;
      let representativeCity: number | undefined;
      if (feature.properties.cluster) {
        try {
          representativeCity = clusterIndex.getLeaves(feature.id as number, 1)[0]?.properties?.cityIndex;
        } catch {
          representativeCity = undefined;
        }
      } else {
        representativeCity = feature.properties.cityIndex;
      }
      if (!Number.isInteger(representativeCity)) return;
      const parent = cityParent.get(representativeCity as number);
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
    // Leave a tiny quiet zone at each integer boundary to absorb trackpad
    // micro-jitter, while preserving a reversible continuous curve in between.
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
      setClusterZoom((current) => Math.abs(current - next) < 0.0001 ? current : next);
    });
  }, []);

  // Keep the Atlas in the same olive-black cartographic language as Home.
  const applyGlobeSettings = useCallback((map: any) => {
    map.setProjection('globe');
    map.setFog({
      color: 'rgb(30, 36, 28)',
      'high-color': 'rgb(49, 58, 45)',
      'horizon-blend': 0.08,
      'space-color': 'rgb(9, 12, 9)',
      'star-intensity': 0.18,
    });
    // NOTE: 3D terrain (raster-DEM) intentionally removed. The atlas is framed
    // face-on at pitch:0, so terrain relief is never visible — it added real
    // per-frame GPU render cost + streamed DEM tiles that repaint on load,
    // hurting scroll smoothness on constrained compositors for zero visual gain.
    if (coarsePointer) map.touchZoomRotate.disableRotation();
  }, [coarsePointer]);

  const frameArchiveOverview = useCallback((duration = 0) => {
    const map = mapRef.current?.getMap();
    if (!map || !archiveBounds) return;
    const compact = window.matchMedia('(max-width: 1023px)').matches;
    map.fitBounds(archiveBounds, {
      padding: compact
        ? { top: 42, right: 46, bottom: 118, left: 46 }
        : { top: 58, right: 68, bottom: 58, left: 68 },
      maxZoom: compact ? 4.15 : 3.7,
      duration: prefersReduced ? 0 : duration,
      essential: !prefersReduced,
      retainPadding: false,
    });
  }, [archiveBounds, prefersReduced]);

  // City details occupy the lower part of the mobile map. Frame the selected
  // coordinates inside the remaining visible map, including very short
  // landscape screens, instead of centering them behind the sheet.
  const mobileFocusCamera = useCallback(() => {
    if (!window.matchMedia('(max-width: 1023px)').matches) return {};
    const mapHeight = mapRef.current?.getMap().getContainer().clientHeight || window.innerHeight;
    // Match the 62svh detail-sheet ceiling while preserving a useful map
    // horizon even on short landscape screens.
    const visibleMap = 72;
    const sheetHeight = Math.min(window.innerHeight * 0.62, Math.max(78, mapHeight - visibleMap));
    const top = mapHeight <= 280 ? 12 : 24;
    const bottom = Math.min(mapHeight - top - 28, Math.round(sheetHeight + 12));
    return {
      padding: { top, right: 24, bottom: Math.max(78, bottom), left: 24 },
      retainPadding: false,
    };
  }, []);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const finish = () => {
      applyGlobeSettings(map);
      frameArchiveOverview(0);
      atlasStyleReadyRef.current = true;
      setMapLoadFailed(false);
    };
    if (map.isStyleLoaded()) finish();
    else map.once('style.load', finish);
  }, [applyGlobeSettings, frameArchiveOverview]);

  const handleMapIdle = useCallback(() => {
    if (!atlasStyleReadyRef.current || atlasReadySignaledRef.current) return;
    atlasReadySignaledRef.current = true;
    setMapLoadFailed(false);
    setMapReady(true);
    document.documentElement.dataset.atlasReady = 'true';
    window.dispatchEvent(new CustomEvent('gallery:atlas-ready'));
  }, []);

  // Mapbox does not automatically recompute its canvas or camera padding when
  // a phone rotates while staying inside the mobile breakpoint. Coalesce the
  // resize/orientation burst into one frame, resize the canvas, then reframe
  // the current selection (or the archive overview when nothing is selected).
  useEffect(() => {
    if (!mapReady) return;

    let resizeFrame = 0;
    const reframe = () => {
      resizeFrame = 0;
      const map = mapRef.current?.getMap();
      if (!map) return;

      map.stop();
      map.resize();

      const selected = activeClusterRef.current;
      if (selected) {
        map.easeTo({
          center: [selected.lng, selected.lat],
          zoom: map.getZoom(),
          duration: 0,
          essential: false,
          ...mobileFocusCamera(),
        });
      } else {
        frameArchiveOverview(0);
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
  }, [frameArchiveOverview, mapReady, mobileFocusCamera]);

  const updatePlaceUrl = useCallback((cluster: LocationCluster | null) => {
    const url = new URL(window.location.href);
    if (cluster) url.searchParams.set('place', cluster.photos[0]?.collection?.slug || slugifyPlace(cluster.city));
    else url.searchParams.delete('place');
    url.hash = 'atlas-map';
    // Keep Astro's history index and scroll metadata while updating the map URL.
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  // Cluster click. The index now contains one point per city, so every cluster
  // is geographic rather than a stack of frames at one GPS coordinate.
  const handleClusterClick = useCallback((clusterId: number, lng: number, lat: number) => {
    let leaves: any[] = [];
    try { leaves = clusterIndex.getLeaves(clusterId, Infinity); } catch { leaves = []; }
    const citiesInCluster = Array.from(new Set(
      leaves.map((leaf) => cityClusters[leaf.properties.cityIndex]?.city).filter(Boolean),
    ));

    if (citiesInCluster.length === 1) {
      const cluster = cityClusters.find((c) => c.city === citiesInCluster[0]) || null;
      if (cluster) {
        mapRef.current?.flyTo({ center: [cluster.lng, cluster.lat], zoom: Math.max(viewState.zoom, 7), duration: prefersReduced ? 0 : 1150, essential: !prefersReduced, curve: 1.42, ...mobileFocusCamera() });
        setActiveCluster(cluster);
        setActiveClusterCity(cluster.city);
        setExpandedRegion(cluster.region || getRegion(cluster.country));
        if (mobileLayout) setMobileSheet('detail');
        updatePlaceUrl(cluster);
        return;
      }
    }

    // Multi-city (or unresolved) cluster → expand toward its break-apart zoom.
    try {
      const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
      const targetZoom = Math.min(expansionZoom, viewState.zoom + 3.5, 16);
      mapRef.current?.flyTo({ center: [lng, lat], zoom: targetZoom, duration: prefersReduced ? 0 : 1150, essential: !prefersReduced, curve: 1.42, speed: 0.8 });
    } catch {
      mapRef.current?.flyTo({ center: [lng, lat], zoom: viewState.zoom + 2, duration: prefersReduced ? 0 : 1000, essential: !prefersReduced });
    }
    setActiveCluster(null);
    setActiveClusterCity(null);
    if (mobileLayout) setMobileSheet('peek');
    updatePlaceUrl(null);
  }, [clusterIndex, viewState.zoom, cityClusters, mobileLayout, mobileFocusCamera, prefersReduced, updatePlaceUrl]);

  // A direct map point always represents a city, matching the sidebar and URL.
  const handleMapCityClick = useCallback((cluster: LocationCluster) => {
    const city = cluster.city;
    setActiveCluster(cluster);
    setActiveClusterCity(city);
    setExpandedRegion(cluster.region || getRegion(cluster.country));
    if (mobileLayout) setMobileSheet('detail');
    updatePlaceUrl(cluster);
    // Gentle centre, using the same averaged coordinate as the marker itself.
    const targetZoom = Math.max(viewState.zoom, 6);
    mapRef.current?.flyTo({
      center: [cluster.lng, cluster.lat],
      zoom: targetZoom,
      duration: prefersReduced ? 0 : 1000,
      essential: !prefersReduced,
      ...mobileFocusCamera(),
    });
    // Wait for AnimatePresence region expand (300ms) before scrolling
    setTimeout(() => {
      const el = document.getElementById(`sidebar-city-${city.replace(/\s+/g, '-')}`);
      el?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'nearest' });
    }, 400);
  }, [viewState.zoom, mobileLayout, mobileFocusCamera, prefersReduced, updatePlaceUrl]);

  // Sidebar city click
  const handleCityClick = useCallback((cluster: LocationCluster) => {
    if (mobileLayout) {
      setActiveClusterCity(cluster.city);
      setActiveCluster(cluster);
      setExpandedRegion(cluster.region || getRegion(cluster.country));
      setMobileSheet('detail');
      updatePlaceUrl(cluster);
      mapRef.current?.flyTo({ center: [cluster.lng, cluster.lat], zoom: 7, duration: prefersReduced ? 0 : 1150, essential: !prefersReduced, ...mobileFocusCamera() });
      return;
    }
    const isSame = activeClusterCity === cluster.city;
    setActiveClusterCity(isSame ? null : cluster.city);
    setActiveCluster(isSame ? null : cluster);
    if (!isSame) setExpandedRegion(cluster.region || getRegion(cluster.country));
    if (!isSame) {
      mapRef.current?.flyTo({ center: [cluster.lng, cluster.lat], zoom: 7, duration: prefersReduced ? 0 : 1150, essential: !prefersReduced });
    }
    updatePlaceUrl(isSame ? null : cluster);
  }, [activeClusterCity, mobileLayout, mobileFocusCamera, prefersReduced, updatePlaceUrl]);

  // Accept stable place deep links from Home, while retaining the earlier
  // coordinate hash used by story mini-maps.
  useEffect(() => {
    if (!mapReady) return;
    const goToRequestedPlace = () => {
      const place = new URLSearchParams(window.location.search).get('place');
      if (place) {
        const match = cityClusters.find((cluster) => clusterMatchesPlace(cluster, slugifyPlace(place)));
        if (!match) return;
        setActiveClusterCity(match.city);
        setActiveCluster(match);
        setExpandedRegion(match.region || getRegion(match.country));
        if (mobileLayout) setMobileSheet('detail');
        const initialPlace = !initialPlaceAppliedRef.current;
        initialPlaceAppliedRef.current = true;
        const camera = { center: [match.lng, match.lat] as [number, number], zoom: 7, ...mobileFocusCamera() };
        if (initialPlace) mapRef.current?.jumpTo(camera);
        else mapRef.current?.flyTo({ ...camera, duration: prefersReduced ? 0 : 1150, essential: !prefersReduced });
        return;
      }

      const hash = window.location.hash;
      if (!hash.startsWith('#loc=')) return;
      const parts = hash.replace('#loc=', '').split(',');
      if (parts.length < 2) return;
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      const zoom = parts[2] ? parseFloat(parts[2]) : 8;
      if (isNaN(lat) || isNaN(lng)) return;
      let closest: LocationCluster | null = null;
      let minDist = Infinity;
      for (const cluster of cityClusters) {
        const distance = Math.abs(cluster.lat - lat) + Math.abs(cluster.lng - lng);
        if (distance < minDist) { minDist = distance; closest = cluster; }
      }
      if (closest && minDist < 2) {
        setActiveClusterCity(closest.city);
        setActiveCluster(closest);
        setExpandedRegion(closest.region || getRegion(closest.country));
        if (mobileLayout) setMobileSheet('detail');
        mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: prefersReduced ? 0 : 1350, essential: !prefersReduced, ...mobileFocusCamera() });
        const url = new URL(window.location.href);
        url.searchParams.set('place', closest.photos[0]?.collection?.slug || slugifyPlace(closest.city));
        url.hash = 'atlas-map';
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      } else {
        mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: prefersReduced ? 0 : 1350, essential: !prefersReduced });
      }
    };
    goToRequestedPlace();
    window.addEventListener('hashchange', goToRequestedPlace);
    window.addEventListener('popstate', goToRequestedPlace);
    return () => {
      window.removeEventListener('hashchange', goToRequestedPlace);
      window.removeEventListener('popstate', goToRequestedPlace);
    };
  }, [cityClusters, mapReady, mobileLayout, mobileFocusCamera, prefersReduced]);

  const resetView = useCallback(() => {
    frameArchiveOverview(1100);
    setActiveCluster(null);
    setActiveClusterCity(null);
    setMobileSheet('peek');
    updatePlaceUrl(null);
  }, [frameArchiveOverview, updatePlaceUrl]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setActiveCluster(null);
      setActiveClusterCity(null);
      setMobileSheet('peek');
      updatePlaceUrl(null);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [updatePlaceUrl]);

  const isMarkerAvailable = useCallback((lng: number, lat: number) => {
    const map = mapRef.current?.getMap();
    if (!mapReady || !map) return false;

    const container = map.getContainer();
    const point = map.project([lng, lat]);
    const insideViewport = map.getBounds().contains([lng, lat])
      && point.x >= 0
      && point.x <= container.clientWidth
      && point.y >= 0
      && point.y <= container.clientHeight;
    if (!insideViewport) return false;
    if (!mobileLayout) return true;

    const sheetHeight = mobileSheet === 'peek'
      ? 78
      : Math.min(
          window.innerHeight * (mobileSheet === 'detail' ? 0.62 : 0.48),
          Math.max(78, container.clientHeight - 72),
        );

    return point.y < container.clientHeight - sheetHeight - 8;
  }, [clusterZoom, mapReady, mobileLayout, mobileSheet, viewState]);

  if (!mapboxToken) return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[#171b15] px-8 text-center md:rounded-[1.35rem]">
      <span className="mb-4 h-2 w-2 rounded-full bg-[#D2FF00]/70" aria-hidden="true" />
      <p className="font-serif text-2xl uppercase text-[#F4F4ED]">Atlas offline</p>
      <p className="mt-2 font-ui text-[10px] uppercase tracking-[0.2em] text-white/58">Map access is not available in this build.</p>
      <a href="/" className="mt-5 inline-flex min-h-11 items-center rounded-full border border-white/14 px-5 font-ui text-[9px] uppercase tracking-[0.24em] text-white/72 hover:border-[#D2FF00]/45 hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]">Return home</a>
    </div>
  );
  if (validPhotos.length === 0) return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[#171b15] px-8 text-center md:rounded-[1.35rem]">
      <span className="mb-4 h-2 w-2 rounded-full border border-white/35" aria-hidden="true" />
      <p className="font-serif text-2xl uppercase text-[#F4F4ED]">No coordinates yet</p>
      <p className="mt-2 font-ui text-[10px] uppercase tracking-[0.2em] text-white/58">New photographic locations will appear here.</p>
      <a href="/" className="mt-5 inline-flex min-h-11 items-center rounded-full border border-white/14 px-5 font-ui text-[9px] uppercase tracking-[0.24em] text-white/72 hover:border-[#D2FF00]/45 hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]">Return home</a>
    </div>
  );

  return (
    <div className="h-full min-h-0" aria-busy={!mapReady}>
      {/* translateZ(0) promotes the ENTIRE card (shadow + map + sidebar) to one
          cached compositor layer, so scrolling the page just translates that
          layer instead of re-compositing the heavy WebGL region every frame —
          the key win for constrained compositors (mobile / embedded webviews).
          Shadow blur trimmed 100px→64px (indistinguishable at 0.45 alpha) to
          shrink the layer's rasterised bounds. */}
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#151913] shadow-[0_26px_70px_-54px_rgba(7,9,6,0.4)] lg:flex-row lg:rounded-[1.35rem]" style={{ transform: 'translateZ(0)' }}>
        {/* ── Map ── */}
        {/* translateZ(0) promotes this map region to its own compositor layer.
            Two payoffs during page scroll: (1) the overlay controls' backdrop-blur
            samples a LOCAL, static backdrop (the canvas scrolls with them) so the
            browser caches the filter instead of re-rasterising it every frame, and
            (2) the whole map region translates as one cached layer. It's an ancestor
            of the Mapbox canvas — never the canvas itself — so map/marker geometry
            is untouched. This is a big win for smooth-scrolling back up past the map. */}
        <div className="atlas-map-workspace relative h-full min-h-0 w-full lg:flex-1" data-mobile-sheet={mobileSheet} style={{ transform: 'translateZ(0)' }}>
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
            onClick={() => {
              setActiveCluster(null);
              setActiveClusterCity(null);
              setMobileSheet('peek');
              updatePlaceUrl(null);
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
              const markerAvailable = isMarkerAvailable(lng, lat);
              const markerInteractive = clusterNode.interactive && markerAvailable;

              // Bloom outward from the framed centre on the first atlas field
              // only. Subsequent cluster sets enter immediately while panning
              // or zooming, so the map always responds without a new stagger.
              const dx = lng - viewState.longitude;
              const dy = lat - viewState.latitude;
              const dist = Math.sqrt(dx * dx + dy * dy);
              // Stable per-marker jitter (0..0.08) hashed from the feature/photo id
              // so it doesn't change on every render — a fresh Math.random() here
              // would re-stagger whileHover/exit and cause hover lag + ghosting.
              const bloomSeed = String(
                props.cluster ? feature.id : (cityClusters[props.cityIndex ?? -1]?.city ?? feature.id),
              );
              let bloomHash = 0;
              for (let i = 0; i < bloomSeed.length; i++) bloomHash = (bloomHash * 31 + bloomSeed.charCodeAt(i)) & 0xffff;
              const bloomJitter = (bloomHash % 81) / 1000; // 0..0.08
              const bloomDelay = playInitialMarkerBloom
                ? Math.min(dist * 0.006, 0.5) + bloomJitter
                : 0;

              // ── Cluster ──
              if (props.cluster) {
                const count = props.point_count ?? 0;
                const baseSize = count < 3 ? 38 : count < 6 ? 42 : 46;
                const size = baseSize + (coarsePointer ? 4 : 0);
                let clusterCities: string[] = [];
                let clusterRegions: string[] = [];
                try {
                  clusterCities = Array.from(new Set(
                    clusterIndex
                      .getLeaves(feature.id as number, Infinity)
                      .map((leaf: any) => cityClusters[leaf.properties.cityIndex]?.city)
                      .filter(Boolean),
                  )) as string[];
                  clusterRegions = Array.from(new Set(
                    clusterCities
                      .map((city) => cityClusters.find((item) => item.city === city))
                      .filter(Boolean)
                      .map((item) => item!.region || getRegion(item!.country)),
                  ));
                } catch {
                  clusterCities = [];
                  clusterRegions = [];
                }
                const clusterLabel = clusterRegions.length === 1
                  ? clusterRegions[0]
                  : clusterRegions.length > 0 && clusterRegions.every((region) => region === 'Utah' || region === 'Arizona')
                    ? 'Southwest'
                    : 'Locations';
                const isHoveredCluster = hoveredCity != null && clusterCities.includes(hoveredCity);
                const isActiveCluster = Boolean(
                  activeCluster
                  && Math.abs(activeCluster.lng - featureLng) < 0.3
                  && Math.abs(activeCluster.lat - featureLat) < 0.3,
                );
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
                      aria-label={`Explore ${clusterLabel} cluster, ${count} locations`}
                      tabIndex={markerInteractive ? 0 : -1}
                      onClick={(event) => { event.stopPropagation(); handleClusterClick(feature.id as number, featureLng, featureLat); }}
                      className="group relative flex cursor-pointer items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00]"
                      style={{ width: size + 18, height: size + 18 }}
                      initial={prefersReduced || !playInitialMarkerBloom ? false : { opacity: 0, scale: 0.4 }}
                      animate={{ opacity: activeCluster && !isActiveCluster ? 0.32 : 1, scale: isHoveredCluster ? 1.07 : 1 }}
                      exit={prefersReduced
                        ? { opacity: 0, scale: 1, transition: { duration: 0 } }
                        : { opacity: 0, scale: 0.4, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }}
                      transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 22, delay: bloomDelay }}
                      whileHover={prefersReduced ? undefined : { scale: 1.08, transition: { type: 'spring', stiffness: 320, damping: 22 } }}
                      whileTap={prefersReduced ? undefined : { scale: 0.94 }}
                    >
                      {/* The cluster halo stays still while its geometry morphs.
                          Breathing is reserved for intentional hover/focus so it
                          never fights the split trajectory. */}
                      <div
                        className={`absolute rounded-full ${isActiveCluster || isHoveredCluster ? 'marker-breathe' : ''}`}
                        style={{ width: size + 14, height: size + 14, backgroundColor: `rgba(${isActiveCluster || isHoveredCluster ? ACCENT_RGB : DOT_RGB},${isActiveCluster || isHoveredCluster ? 0.2 : 0.12})` }}
                      />
                      {/* Inner halo */}
                      <div
                        className="absolute rounded-full"
                        style={{ width: size + 6, height: size + 6, backgroundColor: `rgba(${isActiveCluster || isHoveredCluster ? ACCENT_RGB : DOT_RGB},${isActiveCluster || isHoveredCluster ? 0.24 : 0.18})` }}
                      />
                      {/* Core badge */}
                      <div
                        className="relative rounded-full flex items-center justify-center font-bold shadow-lg border-[2.5px] border-black/15"
                        style={{
                          width: size, height: size,
                          fontSize: count < 10 ? 12 : 13,
                          background: isActiveCluster || isHoveredCluster ? ACCENT : DOT,
                          color: '#20241a',
                          boxShadow: isActiveCluster || isHoveredCluster
                            ? `0 0 24px rgba(${ACCENT_RGB},0.38)`
                            : '0 4px 16px rgba(0,0,0,0.35)',
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
                      <span className={`pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 font-ui text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur-md transition-colors duration-300 ${isActiveCluster || isHoveredCluster ? 'border-[#D2FF00]/35 bg-[#171b15]/90 text-[#D2FF00]' : 'border-white/12 bg-[#171b15]/82 text-white/78'}`}>
                        {clusterLabel}
                      </span>
                    </motion.button>
                    </div>
                  </Marker>
                );
              }

              // ── Individual city marker ──
              const city = cityClusters[props.cityIndex ?? -1];
              if (!city) return null;
              const isActive = activeCluster?.city === city.city;
              const isHovered = hoveredCity === city.city;
              // Active markers sit above map labels; idle markers sit below
              const markerZ = isActive ? 3 : isHovered ? 2 : 1;
              const visualContainerSize = isActive ? 52 : isHovered ? 48 : 44;
              const containerSize = coarsePointer ? Math.max(48, visualContainerSize) : visualContainerSize;
              const markerCoreSize = isActive ? 22 : isHovered ? 19 : 16;
              const labelOnLeft = city.lng > -82;

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
                    aria-label={`Explore ${city.city}, ${city.photos.length} frames`}
                    tabIndex={markerInteractive ? 0 : -1}
                    onClick={(event) => { event.stopPropagation(); handleMapCityClick(city); }}
                    className="group relative flex cursor-pointer items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D2FF00]"
                    style={{ width: containerSize, height: containerSize }}
                    initial={prefersReduced || !playInitialMarkerBloom ? false : { opacity: 0, scale: 0.3 }}
                    animate={{
                      // Dim the rest of the field when a city is selected, so
                      // the active one (and any hovered one) reads as focus.
                      opacity: activeCluster && !isActive && !isHovered ? 0.35 : 1,
                      scale: 1,
                    }}
                    exit={prefersReduced
                      ? { opacity: 0, scale: 1, transition: { duration: 0 } }
                      : { opacity: 0, scale: 0.3, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }}
                    transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 24, delay: bloomDelay, opacity: { duration: 0.5 } }}
                    onMouseEnter={() => setHoveredCity(city.city)}
                    onMouseLeave={() => setHoveredCity(null)}
                    onFocus={() => setHoveredCity(city.city)}
                    onBlur={() => setHoveredCity(null)}
                  >
                    {/* The atlas uses cartographic points; photography is reserved
                        for the single detail surface. */}
                    {(isActive || isHovered) && (
                      <div
                        className="absolute inset-0 rounded-full transition-colors duration-500"
                        style={{ backgroundColor: `rgba(${DOT_RGB},${isActive ? 0.18 : 0.1})` }}
                      />
                    )}

                    {/* Pulse ring — pings outward while the city is hovered (incl.
                        from the list), reinforcing the list ↔ map linkage. CSS
                        keyframes (compositor), not a framer repeat loop; PRM
                        users get a static ring instead. */}
                    {isHovered && !isActive && (
                      prefersReduced ? (
                        <span
                          className="absolute inset-0 rounded-full"
                          style={{ border: `1.5px solid rgba(${DOT_RGB},0.5)` }}
                        />
                      ) : (
                        <span
                          className="absolute inset-0 rounded-full ping-out"
                          style={{
                            border: `1.5px solid rgba(${DOT_RGB},0.65)`,
                            ['--ping-from' as never]: 0.7,
                            ['--ping-to' as never]: 1.9,
                            ['--ping-dur' as never]: '1.3s',
                          }}
                        />
                      )
                    )}
                    <div
                      className="relative rounded-full transition-[width,height,box-shadow,background-color,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{
                        width: markerCoreSize,
                        height: markerCoreSize,
                        background: isActive ? ACCENT : DOT,
                        border: `1px solid ${isActive ? 'rgba(210,255,0,0.95)' : 'rgba(231,225,207,0.72)'}`,
                        boxShadow: isActive
                          ? `0 0 22px rgba(${ACCENT_RGB},0.66)`
                          : `0 0 10px rgba(${DOT_RGB},0.2)`,
                      }}
                    />
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute top-1/2 block max-w-28 -translate-y-1/2 truncate whitespace-nowrap rounded-[0.35rem] border px-2.5 py-1 font-ui text-[10px] font-semibold uppercase backdrop-blur-md transition-colors duration-300 ${isActive || isHovered ? 'border-[#D2FF00]/38 bg-[#171b15]/92 text-[#D2FF00]' : 'border-white/12 bg-[#171b15]/84 text-white/78'}`}
                      style={{
                        left: labelOnLeft ? 'auto' : `calc(50% + ${markerCoreSize / 2 + 6}px)`,
                        right: labelOnLeft ? `calc(50% + ${markerCoreSize / 2 + 6}px)` : 'auto',
                        letterSpacing: coarsePointer ? '0.1em' : '0.14em',
                        maxWidth: coarsePointer ? 96 : 112,
                        zIndex: 10,
                      }}
                    >
                      {city.city}
                    </span>
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
                className={`absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-[#151913] ${mapLoadFailed ? 'pointer-events-auto' : 'pointer-events-none'}`}
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: prefersReduced ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
                role={mapLoadFailed ? 'alert' : 'status'}
                aria-live="polite"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(231,225,207,0.055),transparent_42%)]" />
                <div className="relative flex flex-col items-center gap-3 text-center">
                  <motion.span
                    className="h-1.5 w-1.5 rounded-full bg-[#D2FF00]"
                    animate={prefersReduced || mapLoadFailed ? undefined : { opacity: [0.35, 1, 0.35] }}
                    transition={{ duration: 1.65, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <p className="font-ui text-[8px] uppercase tracking-[0.36em] text-white/48">
                    {mapLoadFailed ? 'Atlas unavailable' : 'Charting the archive'}
                  </p>
                  <p className="font-ui text-[9px] uppercase tracking-[0.2em] text-white/48">
                    {mapLoadFailed ? 'Map tiles could not be loaded' : `${photos.length} geotagged frames`}
                  </p>
                  {mapLoadFailed && (
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="mt-2 min-h-11 rounded-full border border-white/14 px-5 font-ui text-[8px] uppercase tracking-[0.24em] text-white/68 transition-colors hover:border-[#D2FF00]/45 hover:text-[#D2FF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
                    >
                      Retry map
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Quiet reset control, separated from the native zoom rail ── */}
          <div
            className="absolute left-4 top-4 z-10 flex flex-col md:left-5 md:top-5"
            style={{ left: 'max(1rem, env(safe-area-inset-left))' }}
          >
            <Magnetic strength={0.3}>
              <motion.button initial={prefersReduced ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: prefersReduced ? 0 : 0.35, duration: prefersReduced ? 0 : 0.3 }} whileHover={prefersReduced ? undefined : { scale: 1.06 }} whileTap={prefersReduced ? undefined : { scale: 0.94 }} onClick={resetView} className="atlas-reset-control flex h-11 w-11 items-center justify-center rounded-full text-white/55 transition-colors duration-300 hover:text-white" title="Reset view" aria-label="Reset view">
                <RotateCcw size={16} aria-hidden="true" />
              </motion.button>
            </Magnetic>

          </div>

          {/* A legible first-use cue. The map is intentionally immersive, but
              it should never look like a passive background or make visitors
              guess whether the geographic index is interactive. */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: prefersReduced ? 0 : 0.45, duration: prefersReduced ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute left-1/2 top-5 z-10 hidden -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-[#11150f]/78 px-4 py-2 font-ui text-[9px] uppercase tracking-[0.18em] text-white/72 shadow-[0_12px_34px_rgba(7,9,6,0.22)] backdrop-blur-xl lg:flex"
            aria-hidden="true"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#D2FF00] shadow-[0_0_10px_rgba(210,255,0,0.45)]" />
            <span>{activeCluster ? `Viewing ${activeCluster.city}` : 'Select a city or marker'}</span>
            <span className="h-3 w-px bg-white/14" />
            <span className="text-white/54">Drag to move · Scroll to zoom</span>
          </motion.div>

          {/* Mobile keeps the full explorer: the map owns the viewport while
              browse and detail become one draggable, scroll-isolated sheet. */}
          <motion.section
            className="atlas-mobile-sheet absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-[1.75rem] bg-[#20251d] shadow-[0_-24px_70px_rgba(7,9,6,0.42)] lg:hidden"
            style={{ maxHeight: 'min(62svh, calc(100% - 4.5rem))' }}
            initial={false}
            animate={{
              height: mobileSheet === 'peek' ? 78 : mobileSheet === 'browse' ? '48svh' : '62svh',
            }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
            drag={prefersReduced ? false : 'y'}
            dragControls={sheetDragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.08}
            onDragEnd={(_, info) => {
              if (info.offset.y < -44) {
                if (mobileSheet === 'peek') setMobileSheet('browse');
                else if (mobileSheet === 'browse' && activeCluster) setMobileSheet('detail');
              } else if (info.offset.y > 44) {
                if (mobileSheet === 'detail') setMobileSheet('browse');
                else if (mobileSheet === 'browse') setMobileSheet('peek');
              }
            }}
            data-lenis-prevent
            aria-label="Atlas locations"
          >
            <button
              ref={mobileSheetHeaderRef}
              type="button"
              onPointerDown={(event) => {
                if (!prefersReduced) sheetDragControls.start(event);
              }}
              onClick={() => setMobileSheet((current) => current === 'peek' ? 'browse' : current === 'browse' ? 'peek' : 'browse')}
              className="atlas-mobile-sheet__header atlas-sheet-safe-inline flex min-h-[78px] min-w-0 shrink-0 touch-none items-center gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#D2FF00]"
              aria-expanded={mobileSheet !== 'peek'}
              aria-controls={mobileSheet === 'peek' ? undefined : 'atlas-sheet-content'}
            >
              <span className={`absolute left-1/2 top-3 h-[3px] w-10 -translate-x-1/2 rounded-full bg-white/24 ${prefersReduced ? 'hidden' : ''}`} aria-hidden="true" />
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D2FF00] font-ui text-[9px] font-bold text-[#171b15]">
                {activeCluster ? String(cityClusters.findIndex((cluster) => cluster.city === activeCluster.city) + 1).padStart(2, '0') : String(cityClusters.length).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 overflow-hidden">
                <span className="block font-ui text-[9px] uppercase tracking-[0.26em] text-white/62">
                  {activeCluster ? 'Current location' : 'Interactive atlas'}
                </span>
                <span className="mt-1 block truncate font-serif text-xl uppercase leading-none text-[#F4F4ED]">
                  {activeCluster?.city ?? 'Explore locations'}
                </span>
              </span>
              <span className="shrink-0 whitespace-nowrap font-ui text-[9px] font-semibold uppercase tracking-[0.2em] text-[#D2FF00]/88">
                {mobileSheet === 'peek' ? 'Open' : mobileSheet === 'detail' ? 'Back' : 'Close'}
              </span>
            </button>
            <span className="sr-only" aria-live="polite">
              {mobileSheet === 'detail' && activeCluster
                ? `${activeCluster.city} details open`
                : mobileSheet === 'browse'
                  ? 'Location index open'
                  : 'Location index collapsed'}
            </span>

            <AnimatePresence mode="wait" initial={false}>
              {mobileSheet === 'browse' && (
                <motion.div
                  key="browse"
                  initial={prefersReduced ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: prefersReduced ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="atlas-sheet-safe-inline min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                  data-lenis-prevent
                  id="atlas-sheet-content"
                >
                  {regionGroups.map((group) => (
                    <div key={group.region} className="border-t border-white/7 py-4 first:border-t-0">
                      <div className="mb-2 flex items-center justify-between font-ui text-[9px] uppercase tracking-[0.22em] text-white/60">
                        <span>{group.region}</span>
                        <span>{group.totalPhotos} frames</span>
                      </div>
                      {group.clusters.map((cluster) => (
                        <button
                          key={cluster.city}
                          type="button"
                          onClick={() => handleCityClick(cluster)}
                          aria-pressed={activeClusterCity === cluster.city}
                          className="flex min-h-12 w-full items-center gap-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D2FF00]"
                        >
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full border ${activeClusterCity === cluster.city ? 'border-[#D2FF00] bg-[#D2FF00] shadow-[0_0_12px_rgba(210,255,0,0.55)]' : 'border-white/35 bg-transparent'}`} />
                          <span className="min-w-0 flex-1 truncate font-serif text-lg uppercase text-[#F4F4ED]">{cluster.city}</span>
                          <span className="font-ui text-[9px] uppercase tracking-[0.18em] text-white/62">{cluster.photos.length}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </motion.div>
              )}

              {mobileSheet === 'detail' && activeCluster && (
                <motion.div
                  key={`detail-${activeCluster.city}`}
                  initial={prefersReduced ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: prefersReduced ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                  data-lenis-prevent
                  id="atlas-sheet-content"
                >
                  <CityDetail cluster={activeCluster} mobile />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>

        </div>

        {/* ── Desktop destination index. The feather is a separate visual layer;
            copy and controls sit on a stable opaque surface so the basemap never
            changes their contrast. Region disclosure restores the clearer,
            explicitly interactive hierarchy of the earlier Atlas. ── */}
        <aside
          className="relative z-10 -ml-12 hidden h-full min-h-0 w-[340px] flex-col pl-12 lg:flex xl:-ml-20 xl:w-[420px] xl:pl-20"
          aria-label="Photographic locations"
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-transparent via-[#30352a]/52 to-[#30352a]" aria-hidden="true" />
          <div className="relative flex h-full min-h-0 flex-col bg-[#30352a]">
            <header className="shrink-0 border-b border-white/8 px-5 pb-4 pt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.24em] text-[#F4F4ED]/90">Select a location</p>
                  <p className="mt-2 max-w-[235px] font-ui text-[11px] leading-relaxed tracking-[0.02em] text-white/62">
                    Choose a city to focus the map and open its photographic record.
                  </p>
                </div>
                <span className="font-serif text-[28px] leading-none text-[#F4F4ED]/78 tabular-nums">
                  {String(cityClusters.length).padStart(2, '0')}
                </span>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar" data-lenis-prevent>
              {regionGroups.map((group, regionIndex) => {
                const isOpen = expandedRegion === group.region;
                return (
                  <section key={group.region} className="border-b border-white/7 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpandedRegion(isOpen ? null : group.region)}
                      className="group flex min-h-12 w-full cursor-pointer items-center gap-3 px-5 text-left hover:bg-white/[0.035] focus-visible:outline-none focus-visible:shadow-[inset_2px_0_0_#D2FF00]"
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? `atlas-region-${slugifyPlace(group.region)}` : undefined}
                    >
                      <span className="min-w-0 flex-1 font-ui text-[9px] font-semibold uppercase tracking-[0.24em] text-white/70 group-hover:text-white/90">
                        {group.region}
                      </span>
                      <span className="font-ui text-[9px] tabular-nums tracking-[0.1em] text-white/56">{group.totalPhotos} frames</span>
                      <motion.span
                        aria-hidden="true"
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: prefersReduced ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="flex h-6 w-6 items-center justify-center text-[13px] text-white/58"
                      >
                        ↓
                      </motion.span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          id={`atlas-region-${slugifyPlace(group.region)}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ height: { duration: prefersReduced ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: prefersReduced ? 0 : 0.24 } }}
                          className="overflow-hidden bg-[#292e25]"
                        >
                          {group.clusters.map((cluster, cityIndex) => {
                            const isSelected = activeClusterCity === cluster.city;
                            const isHoveredFromMap = hoveredCity === cluster.city && !isSelected;
                            const itemNumber = regionGroups
                              .slice(0, regionIndex)
                              .reduce((total, item) => total + item.clusters.length, 0) + cityIndex + 1;
                            return (
                              <motion.div
                                key={cluster.city}
                                id={`sidebar-city-${cluster.city.replace(/\s+/g, '-')}`}
                                initial={prefersReduced ? false : { opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: prefersReduced ? 0 : cityIndex * 0.045, duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleCityClick(cluster)}
                                  onMouseEnter={() => setHoveredCity(cluster.city)}
                                  onMouseLeave={() => setHoveredCity(null)}
                                  onFocus={() => setHoveredCity(cluster.city)}
                                  onBlur={() => setHoveredCity(null)}
                                  aria-pressed={isSelected}
                                  aria-expanded={isSelected}
                                  aria-controls={isSelected ? `atlas-city-detail-${slugifyPlace(cluster.city)}` : undefined}
                                  className={`group relative flex min-h-[66px] w-full cursor-pointer items-center gap-3 border-t border-white/6 px-5 text-left transition-[background-color,transform] duration-300 focus-visible:outline-none focus-visible:shadow-[inset_2px_0_0_#D2FF00] ${
                                    isSelected
                                      ? 'bg-[#D2FF00]/[0.075]'
                                      : isHoveredFromMap
                                        ? 'bg-white/[0.055]'
                                        : 'hover:bg-white/[0.04]'
                                  }`}
                                >
                                  <motion.span
                                    className="absolute inset-y-3 left-0 w-[2px] rounded-full bg-[#D2FF00]"
                                    initial={false}
                                    animate={{ opacity: isSelected || isHoveredFromMap ? 1 : 0, scaleY: isSelected || isHoveredFromMap ? 1 : 0.3 }}
                                    transition={{ duration: prefersReduced ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                                  />
                                  <span className="relative h-10 w-12 shrink-0 overflow-hidden rounded-[0.35rem] bg-black/20">
                                    <img
                                      src={`${cluster.photos[0].imageUrl}?auto=format&w=160&h=120&fit=crop&q=76`}
                                      alt=""
                                      className="h-full w-full object-cover opacity-80 transition-[transform,opacity] duration-500 group-hover:scale-105 group-hover:opacity-100"
                                      loading="lazy"
                                      draggable={false}
                                    />
                                    <span className="absolute left-1.5 top-1 font-ui text-[8px] tabular-nums tracking-[0.12em] text-white/82 drop-shadow">
                                      {String(itemNumber).padStart(2, '0')}
                                    </span>
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className={`block truncate font-serif text-[19px] uppercase leading-none tracking-[-0.01em] ${isSelected ? 'text-[#F4F4ED]' : 'text-[#F4F4ED]/88 group-hover:text-white'}`}>
                                      {cluster.city}
                                    </span>
                                    <span className="mt-1.5 block font-ui text-[10px] uppercase tracking-[0.1em] text-white/62">
                                      {cluster.country || group.region} · {cluster.photos.length} frames
                                    </span>
                                  </span>
                                  <span className={`shrink-0 font-ui text-[10px] font-semibold uppercase tracking-[0.1em] ${isSelected ? 'text-[#D2FF00]' : 'text-white/62 group-hover:text-white/86'}`}>
                                    {isSelected ? 'Viewing' : 'Focus'}
                                  </span>
                                </button>

                                <AnimatePresence initial={false}>
                                  {isSelected && (
                                    <motion.div
                                      key="detail"
                                      id={`atlas-city-detail-${slugifyPlace(cluster.city)}`}
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ height: { duration: prefersReduced ? 0 : 0.46, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: prefersReduced ? 0 : 0.26 } }}
                                      className="overflow-hidden border-t border-white/6 bg-[#171b15]/94"
                                    >
                                      <CityDetail cluster={cluster} />
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>
                );
              })}
            </div>

          </div>
        </aside>
      </div>
    </div>
  );
}

export default function MapboxMap(props: { photos: Photo[]; mapboxToken: string }) {
  return <MapErrorBoundary><MapboxMapInner photos={props.photos} mapboxToken={props.mapboxToken} /></MapErrorBoundary>;
}
