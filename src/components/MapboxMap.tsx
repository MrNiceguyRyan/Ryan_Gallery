import { useState, useMemo, useRef, useCallback, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import MapGL, { Marker, NavigationControl, FullscreenControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import Supercluster from 'supercluster';
import { motion, AnimatePresence } from 'framer-motion';
import type { Photo } from '../types';

// ─── Accent color (unified warm dark tone) ───
const ACCENT = '#2c3e50';
const ACCENT_RGB = '44, 62, 80';

// ─── Map style presets ───
const MAP_STYLES = [
  { id: 'light', label: 'Light', style: 'mapbox://styles/mapbox/light-v11' },
  { id: 'streets', label: 'Streets', style: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'outdoors', label: 'Outdoors', style: 'mapbox://styles/mapbox/outdoors-v12' },
  { id: 'satellite', label: 'Satellite', style: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { id: 'dark', label: 'Dark', style: 'mapbox://styles/mapbox/dark-v11' },
] as const;

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
        <div className="h-[50vh] min-h-[300px] rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center px-8">
          <p className="text-gray-400 text-sm font-light">Map failed to load</p>
          <p className="text-gray-300 text-xs font-mono mt-2 max-w-sm">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} className="mt-4 px-5 py-2 text-xs tracking-wider rounded-full border border-gray-200 text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-all duration-300">Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Sidebar location cluster ───
interface LocationCluster {
  key: string;
  city: string;
  country: string;
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
  const groups: Record<string, LocationCluster> = {};
  for (const p of photos) {
    if (p.location?.lat == null || p.location?.lng == null) continue;
    const key = `${p.location.city || ''}|${p.location.country || ''}`;
    if (!groups[key]) {
      groups[key] = {
        key,
        city: p.location.city || 'Unknown',
        country: p.location.country || '',
        lat: p.location.lat,
        lng: p.location.lng,
        photos: [],
      };
    }
    groups[key].photos.push(p);
  }
  return Object.values(groups).sort((a, b) => b.photos.length - a.photos.length);
}

function groupByRegion(clusters: LocationCluster[]): RegionGroup[] {
  const map: Record<string, LocationCluster[]> = {};
  for (const c of clusters) {
    const region = getRegion(c.country);
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

function toClusterKey(city?: string, country?: string) {
  return `${city || ''}|${country || ''}`;
}

function clusterDomId(key: string) {
  return `sidebar-city-${key.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-')}`;
}

// ─── Main Inner Component ───
function MapboxMapInner({ photos, mapboxToken }: { photos: Photo[]; mapboxToken: string }) {
  const mapRef = useRef<MapRef>(null);
  const mapSelectionHintTimerRef = useRef<number | null>(null);
  const [viewState, setViewState] = useState({ latitude: 30, longitude: -40, zoom: 2.2, pitch: 40, bearing: 0 });
  const [activeCluster, setActiveCluster] = useState<LocationCluster | null>(null);
  // NOTE: these hold LocationCluster.key ("city|country"), kept names to minimize churn.
  const [activeClusterCity, setActiveClusterCity] = useState<string | null>(null);
  const [mapSelectedCity, setMapSelectedCity] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [mapStyleIdx, setMapStyleIdx] = useState(0);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);

  const cityClusters = useMemo(() => clusterByLocation(photos), [photos]);
  const regionGroups = useMemo(() => groupByRegion(cityClusters), [cityClusters]);
  const validPhotos = useMemo(() => photos.filter(p => p.location?.lat != null && p.location?.lng != null), [photos]);

  // Auto-expand the first region
  useEffect(() => {
    if (regionGroups.length > 0 && !expandedRegion) {
      setExpandedRegion(regionGroups[0].region);
    }
  }, [regionGroups]);

  useEffect(() => {
    return () => {
      if (mapSelectionHintTimerRef.current !== null) {
        window.clearTimeout(mapSelectionHintTimerRef.current);
      }
    };
  }, []);

  // GeoJSON points for Supercluster
  const points = useMemo(() =>
    validPhotos.map((photo, index) => ({
      type: 'Feature' as const,
      properties: { cluster: false, photoIndex: index },
      geometry: { type: 'Point' as const, coordinates: [photo.location!.lng, photo.location!.lat] },
    })),
    [validPhotos],
  );

  const clusterIndex = useMemo(() => {
    const idx = new Supercluster({ radius: 50, maxZoom: 16 });
    idx.load(points as any);
    return idx;
  }, [points]);

  const clusters = useMemo(() => {
    const map = mapRef.current?.getMap();
    if (!map) return clusterIndex.getClusters([-180, -85, 180, 85], Math.floor(viewState.zoom));
    const bounds = map.getBounds()?.toArray().flat() as [number, number, number, number];
    return bounds ? clusterIndex.getClusters(bounds, Math.floor(viewState.zoom)) : [];
  }, [clusterIndex, viewState.zoom, viewState.latitude, viewState.longitude]);

  const selectClusterFromMap = useCallback((cluster: LocationCluster | null, zoomTo?: { lng: number; lat: number; zoom?: number }) => {
    if (!cluster) return;
    setActiveCluster(cluster);
    setActiveClusterCity(cluster.key);
    setMapSelectedCity(cluster.key);

    if (mapSelectionHintTimerRef.current !== null) {
      window.clearTimeout(mapSelectionHintTimerRef.current);
    }
    mapSelectionHintTimerRef.current = window.setTimeout(() => {
      setMapSelectedCity(null);
      mapSelectionHintTimerRef.current = null;
    }, 2600);

    setExpandedRegion(getRegion(cluster.country));

    if (zoomTo) {
      mapRef.current?.flyTo({
        center: [zoomTo.lng, zoomTo.lat],
        zoom: zoomTo.zoom ?? Math.max(viewState.zoom, 6),
        duration: 1200,
        essential: true,
      });
    }

    setTimeout(() => {
      const el = document.getElementById(clusterDomId(cluster.key));
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 400);
  }, [viewState.zoom]);

  // Apply globe + terrain on style load
  const applyGlobeSettings = useCallback((map: any) => {
    map.setProjection('globe');
    map.setFog({
      color: 'rgb(245, 245, 247)',
      'high-color': 'rgb(200, 210, 230)',
      'horizon-blend': 0.08,
      'space-color': 'rgb(15, 15, 20)',
      'star-intensity': 0.4,
    });
    if (!map.getSource('mapbox-dem')) {
      map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
    }
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
  }, []);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (map.isStyleLoaded()) applyGlobeSettings(map);
    else map.once('style.load', () => applyGlobeSettings(map));
  }, [applyGlobeSettings]);

  // Re-apply globe settings when style changes
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const reapply = () => applyGlobeSettings(map);
    map.once('style.load', reapply);
  }, [mapStyleIdx, applyGlobeSettings]);

  // Cluster click → only zoom in (no sidebar card yet)
  const handleClusterClick = useCallback((clusterId: number, lng: number, lat: number) => {
    // When user is still in clustered view, keep sidebar neutral.
    setActiveCluster(null);
    setActiveClusterCity(null);
    setMapSelectedCity(null);

    try {
      const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
      // Smooth step: don't jump too far, cap at +3 from current or expansionZoom, whichever is less
      const targetZoom = Math.min(expansionZoom, viewState.zoom + 3.5, 14);
      mapRef.current?.flyTo({
        center: [lng, lat],
        zoom: targetZoom,
        duration: 1400,
        essential: true,
        curve: 1.42,
        speed: 0.8,
      });
    } catch {
      mapRef.current?.flyTo({ center: [lng, lat], zoom: viewState.zoom + 2, duration: 1200, essential: true });
    }
  }, [clusterIndex, viewState.zoom]);

  // Photo marker click → highlight in sidebar (no map popup)
  const handlePhotoClick = useCallback((photo: Photo) => {
    const key = toClusterKey(photo.location?.city, photo.location?.country);
    const cluster = cityClusters.find((c) => c.key === key) || null;
    selectClusterFromMap(cluster, {
      lng: photo.location!.lng,
      lat: photo.location!.lat,
      zoom: Math.max(viewState.zoom, 6),
    });
  }, [viewState.zoom, cityClusters, selectClusterFromMap]);

  // Sidebar city click
  const handleCityClick = useCallback((cluster: LocationCluster) => {
    const isSame = activeClusterCity === cluster.key;
    setMapSelectedCity(null);
    setActiveClusterCity(isSame ? null : cluster.key);
    setActiveCluster(isSame ? null : cluster);
    if (!isSame) {
      mapRef.current?.flyTo({ center: [cluster.lng, cluster.lat], zoom: 7, duration: 1500, essential: true });
    }
  }, [activeClusterCity]);

  // Handle #loc= hash from mini-map navigation
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#loc=')) {
      const parts = hash.replace('#loc=', '').split(',');
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        const zoom = parts[2] ? parseFloat(parts[2]) : 8;
        if (!isNaN(lat) && !isNaN(lng)) {
          setTimeout(() => {
            mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 2000, essential: true });
            // Find and highlight closest city
            let closest: LocationCluster | null = null;
            let minDist = Infinity;
            for (const c of cityClusters) {
              const d = Math.abs(c.lat - lat) + Math.abs(c.lng - lng);
              if (d < minDist) { minDist = d; closest = c; }
            }
            if (closest && minDist < 2) {
              setActiveClusterCity(closest.key);
              setActiveCluster(closest);
              setExpandedRegion(getRegion(closest.country));
            }
          }, 500);
          // Clean the hash
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    }
  }, [cityClusters]);

  const resetView = useCallback(() => {
    mapRef.current?.flyTo({ center: [-40, 30], zoom: 2.2, pitch: 40, bearing: 0, duration: 2000 });
    setActiveCluster(null);
    setActiveClusterCity(null);
    setMapSelectedCity(null);
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') { setActiveCluster(null); setActiveClusterCity(null); setMapSelectedCity(null); setShowStylePicker(false); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  if (!mapboxToken) return <div className="h-[500px] rounded-2xl bg-gray-50 flex items-center justify-center"><p className="text-gray-400 text-sm">Mapbox token not configured</p></div>;
  if (validPhotos.length === 0) return <div className="h-[500px] rounded-2xl bg-gray-50 flex items-center justify-center"><p className="text-gray-400 text-sm">No geotagged photos found</p></div>;

  return (
    <div>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-0 rounded-[2rem] overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.15)] border border-gray-100 bg-white">
        {/* ── Map ── */}
        <div className="relative w-full lg:flex-1 h-[60vh] min-h-[400px] md:h-[600px] lg:h-[780px]">
          <MapGL
            {...viewState}
            ref={mapRef}
            onMove={evt => setViewState(evt.viewState)}
            mapboxAccessToken={mapboxToken}
            mapStyle={MAP_STYLES[mapStyleIdx].style}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
            onLoad={handleMapLoad}
            maxZoom={16}
            minZoom={1.5}
            onClick={() => { setShowStylePicker(false); }}
          >
            <NavigationControl position="bottom-right" showCompass={false} />
            <FullscreenControl position="bottom-right" />

            <AnimatePresence>
            {clusters.map((feature) => {
              const [lng, lat] = feature.geometry.coordinates;
              const props = feature.properties;

              // ── Cluster ──
              if (props.cluster) {
                const count = props.point_count;
                const size = count < 10 ? 40 : count < 30 ? 48 : 56;
                return (
                  <Marker
                    key={`cluster-${feature.id}`}
                    longitude={lng}
                    latitude={lat}
                    anchor="center"
                    style={{ zIndex: 2 }}
                    onClick={e => { e.originalEvent.stopPropagation(); handleClusterClick(feature.id as number, lng, lat); }}
                  >
                    <motion.div
                      className="relative flex items-center justify-center cursor-pointer group"
                      style={{ width: size + 20, height: size + 20 }}
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.4 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.94 }}
                    >
                      {/* Outer breathing ring */}
                      <motion.div
                        className="absolute rounded-full"
                        style={{ width: size + 14, height: size + 14, backgroundColor: `rgba(${ACCENT_RGB},0.12)` }}
                        animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.15, 0.5] }}
                        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      {/* Inner halo */}
                      <div
                        className="absolute rounded-full"
                        style={{ width: size + 6, height: size + 6, backgroundColor: `rgba(${ACCENT_RGB},0.18)` }}
                      />
                      {/* Core badge */}
                      <div
                        className="relative rounded-full flex items-center justify-center text-white font-bold shadow-lg border-[2.5px] border-white/50"
                        style={{
                          width: size, height: size,
                          fontSize: count < 10 ? 13 : 14,
                          background: ACCENT,
                          boxShadow: `0 6px 24px rgba(${ACCENT_RGB},0.4)`,
                        }}
                      >
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={count}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
                          >
                            {count}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  </Marker>
                );
              }

              // ── Individual marker ──
              const photo = validPhotos[props.photoIndex];
              if (!photo) return null;
              const markerKey = toClusterKey(photo.location?.city, photo.location?.country);
              const isActive = activeCluster?.key === markerKey;
              const isHovered = hoveredIdx === props.photoIndex;
              // Active markers sit above map labels; idle markers sit below
              const markerZ = isActive ? 3 : isHovered ? 2 : 1;
              // Container size matches the visual element — avoids invisible hit area
              // covering map place-name labels
              const containerSize = isActive ? 44 : isHovered ? 38 : 30;

              return (
                <Marker
                  key={`photo-${photo._id}`}
                  longitude={lng}
                  latitude={lat}
                  anchor="center"
                  style={{ zIndex: markerZ }}
                  onClick={e => { e.originalEvent.stopPropagation(); handlePhotoClick(photo); }}
                >
                  <motion.div
                    className="relative flex items-center justify-center cursor-pointer group"
                    style={{ width: containerSize, height: containerSize }}
                    initial={{ opacity: 0, scale: 0.3 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.3 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 24, delay: Math.random() * 0.12 }}
                    onMouseEnter={() => { setHoveredIdx(props.photoIndex); setHoveredCity(markerKey); }}
                    onMouseLeave={() => { setHoveredIdx(null); setHoveredCity(null); }}
                  >
                    {/* Glow ring — only shown when active or hovered */}
                    {(isActive || isHovered) && (
                      <div
                        className="absolute inset-0 rounded-full transition-all duration-500"
                        style={{ backgroundColor: `rgba(${ACCENT_RGB},${isActive ? 0.15 : 0.08})` }}
                      />
                    )}
                    <div
                      className="relative rounded-full overflow-hidden shadow-lg transition-all duration-300 ease-out"
                      style={{
                        width: isActive ? 40 : isHovered ? 34 : 26,
                        height: isActive ? 40 : isHovered ? 34 : 26,
                        outline: isActive
                          ? `3px solid ${ACCENT}`
                          : '2.5px solid rgba(255,255,255,0.9)',
                        outlineOffset: '1px',
                        boxShadow: isActive
                          ? `0 0 20px rgba(${ACCENT_RGB},0.4), 0 4px 12px rgba(0,0,0,0.2)`
                          : '0 2px 8px rgba(0,0,0,0.15)',
                      }}
                    >
                      <img
                        src={`${photo.imageUrl}?auto=format&w=100&h=100&fit=crop&q=75`}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>
                    <AnimatePresence>
                      {isHovered && !isActive && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.9 }}
                          transition={{ duration: 0.15 }}
                          className="absolute -top-9 left-1/2 -translate-x-1/2 pointer-events-none"
                          style={{ zIndex: 10 }}
                        >
                          <div className="px-3 py-1.5 text-white text-[10px] font-semibold rounded-full shadow-xl whitespace-nowrap tracking-wide" style={{ background: ACCENT }}>
                            {photo.location?.city || photo.title}
                          </div>
                          <div className="w-1.5 h-1.5 rotate-45 absolute -bottom-0.5 left-1/2 -translate-x-1/2" style={{ background: ACCENT }} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </Marker>
              );
            })}
            </AnimatePresence>
          </MapGL>

          {/* ── Floating label ── */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="absolute top-6 left-6 z-10 pointer-events-none">
            <div className="bg-white/70 backdrop-blur-2xl px-5 py-3 rounded-2xl shadow-lg border border-white/30">
              <h2 className="text-[9px] uppercase tracking-[0.3em] font-black text-black/35 mb-0.5">Journal Gallery</h2>
              <p className="text-sm font-serif italic text-black/80">World Explorer</p>
            </div>
          </motion.div>

          {/* ── Top-right controls ── */}
          <div className="absolute top-6 right-6 z-10 flex flex-col gap-2">
            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }} onClick={resetView} className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-2xl border border-white/30 shadow-lg flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-white transition-all active:scale-90" title="Reset view">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
            </motion.button>

            {/* Style switcher toggle */}
            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }} onClick={(e) => { e.stopPropagation(); setShowStylePicker(v => !v); }} className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-2xl border border-white/30 shadow-lg flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-white transition-all active:scale-90" title="Map style">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0l4.179 2.25L12 17.25 2.25 12l4.179-2.25m11.142 0l-5.571 3-5.571-3m11.142 4.5L12 21.75l-5.571-3" /></svg>
            </motion.button>
          </div>

          {/* ── Style picker dropdown ── */}
          <AnimatePresence>
            {showStylePicker && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute top-[7.5rem] right-6 z-20 bg-white/90 backdrop-blur-2xl rounded-2xl shadow-xl border border-gray-100 p-2 min-w-[140px]"
                onClick={e => e.stopPropagation()}
              >
                {MAP_STYLES.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => { setMapStyleIdx(i); setShowStylePicker(false); }}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200 ${i === mapStyleIdx ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Bottom label ── */}
          <div className="absolute bottom-6 left-6 z-10 pointer-events-none hidden lg:block">
            <div className="bg-white/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">
              Globe · 3D Terrain · {MAP_STYLES[mapStyleIdx].label}
            </div>
          </div>
        </div>

        {/* ── Desktop sidebar — grouped by region ── */}
        <div className="hidden lg:flex flex-col w-[340px] border-l border-gray-100 bg-white">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[10px] tracking-[0.3em] text-gray-400 uppercase font-light">Regions</p>
            <p className="text-xs text-gray-300 font-mono mt-1">{regionGroups.length} regions · {cityClusters.length} cities · {photos.length} photos</p>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {regionGroups.map((group) => {
              const isRegionOpen = expandedRegion === group.region;
              const regionHasActive = group.clusters.some((cluster) => cluster.key === activeClusterCity);
              return (
                <div key={group.region}>
                  {/* Region header */}
                  <button
                    onClick={() => setExpandedRegion(isRegionOpen ? null : group.region)}
                    className={`w-full text-left px-5 py-3 flex items-center justify-between border-b transition-colors ${
                      regionHasActive
                        ? 'bg-[#2c3e50]/8 border-[#2c3e50]/10'
                        : 'bg-gray-50/80 border-gray-100 hover:bg-gray-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
                      <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-600">{group.region}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-gray-300">{group.totalPhotos}</span>
                      <motion.svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className="text-gray-300"
                        animate={{ rotate: isRegionOpen ? 180 : 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </motion.svg>
                    </div>
                  </button>

                  {/* Cities within region */}
                  <AnimatePresence>
                    {isRegionOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                      >
                        {group.clusters.map((cluster) => {
                          const isSelected = activeClusterCity === cluster.key;
                          const isHoveredFromMap = hoveredCity === cluster.key && !isSelected;
                          const isMapGuided = mapSelectedCity === cluster.key;
                          return (
                            <div key={cluster.key} id={clusterDomId(cluster.key)}>
                              <button
                                onClick={() => handleCityClick(cluster)}
                                className={`w-full text-left px-5 py-3.5 border-b transition-all duration-300 ${
                                  isSelected
                                    ? 'bg-[#2c3e50] text-white hover:bg-[#2c3e50]/90 border-b-[#2c3e50]/30'
                                    : isHoveredFromMap
                                      ? 'bg-[#2c3e50]/8 border-b-[#2c3e50]/10'
                                      : 'hover:bg-gray-50 border-b-gray-50'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 ring-2 transition-all duration-300 ${
                                    isSelected
                                      ? 'ring-white/30 scale-110'
                                      : isMapGuided
                                        ? 'ring-[#2c3e50]/55 scale-110'
                                        : isHoveredFromMap
                                          ? 'ring-[#2c3e50]/30 scale-105'
                                          : 'ring-gray-100'
                                  }`}>
                                    <img src={`${cluster.photos[0].imageUrl}?auto=format&w=80&h=80&fit=crop&q=75`} alt={cluster.city} className="w-full h-full object-cover" draggable={false} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className={`text-[13px] font-medium tracking-tight truncate ${isSelected ? 'text-white' : isHoveredFromMap ? 'text-[#2c3e50]' : 'text-gray-800'}`}>{cluster.city}</h3>
                                    <p className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/50' : 'text-gray-400'}`}>{cluster.country}</p>
                                    {isMapGuided && (
                                      <p className={`text-[9px] mt-1 font-mono tracking-wide ${isSelected ? 'text-white/65' : 'text-[#2c3e50]/75'}`}>
                                        Collection story available
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] font-mono ${isSelected ? 'text-white/50' : 'text-gray-300'}`}>{cluster.photos.length}</span>
                                    {(isSelected || isHoveredFromMap || isMapGuided) && (
                                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white/40' : 'bg-[#2c3e50]/30'}`} />
                                    )}
                                  </div>
                                </div>
                              </button>
                              {/* Rich expanded card for selected city — with CSS transition */}
                              <div
                                className="bg-white border-b border-gray-100 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
                                style={{
                                  maxHeight: isSelected ? '500px' : '0px',
                                  opacity: isSelected ? 1 : 0,
                                  overflow: 'hidden',
                                }}
                              >
                                {/* Cover photo */}
                                <div className="relative h-36 overflow-hidden">
                                  <img
                                    src={`${cluster.photos[0].imageUrl}?auto=format&w=600&q=80`}
                                    alt={cluster.city}
                                    className="w-full h-full object-cover"
                                    draggable={false}
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                  <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                                    <div>
                                      <p className="text-[9px] uppercase tracking-[0.15em] text-white/60 font-semibold">{cluster.country}</p>
                                      <h4 className="text-lg font-serif italic text-white leading-tight">{cluster.city}</h4>
                                    </div>
                                    <span className="text-[10px] font-mono text-white/50">{cluster.photos.length} photos</span>
                                  </div>
                                </div>
                                {/* Content */}
                                <div className="p-4">
                                  {isMapGuided && (
                                    <div className="mb-3 rounded-lg bg-[#2c3e50]/8 px-3 py-2 border border-[#2c3e50]/10">
                                      <p className="text-[10px] font-mono tracking-wide text-[#2c3e50]/75">
                                        Selected from map point · Continue to collection story below
                                      </p>
                                    </div>
                                  )}
                                  <p className="text-[10px] text-gray-400 font-mono tracking-wide mb-3">
                                    {formatCoord(cluster.lat, 'N', 'S')}, {formatCoord(cluster.lng, 'E', 'W')}
                                  </p>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {cluster.photos.slice(0, 6).map((photo) => (
                                      <div key={photo._id} className="aspect-square rounded-lg overflow-hidden">
                                        <img src={`${photo.imageUrl}?auto=format&w=160&q=75`} alt={photo.title} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" loading="lazy" draggable={false} />
                                      </div>
                                    ))}
                                  </div>
                                  {cluster.photos[0]?.collection?.slug && (
                                    <a
                                      href={`/works/${cluster.photos[0].collection.slug}`}
                                      className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] uppercase tracking-[0.1em] font-bold text-white transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                                      style={{ background: ACCENT }}
                                    >
                                      Explore Story
                                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Mobile city list — grouped by region ── */}
      <div className="lg:hidden mt-4 space-y-4">
        {regionGroups.map((group) => (
          <div key={group.region}>
            <div className="flex items-center gap-2 px-1 mb-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">{group.region}</span>
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[10px] font-mono text-gray-300">{group.totalPhotos}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {group.clusters.map((cluster) => {
                const isSelected = activeClusterCity === cluster.key;
                const isMapGuided = mapSelectedCity === cluster.key;
                return (
                  <button key={cluster.key} onClick={() => handleCityClick(cluster)} className={`group p-3.5 rounded-xl text-left transition-all duration-300 ${isSelected ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-50 hover:bg-gray-100'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 ring-1 transition-colors ${isSelected ? 'ring-white/20' : 'ring-gray-200'}`}>
                        <img src={`${cluster.photos[0].imageUrl}?auto=format&w=100&h=100&fit=crop&q=75`} alt={cluster.city} className="w-full h-full object-cover" draggable={false} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`text-[13px] font-medium tracking-tight truncate ${isSelected ? 'text-white' : 'text-gray-800'}`}>{cluster.city}</h3>
                        <p className={`text-[10px] ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>{cluster.country}</p>
                        {isMapGuided && (
                          <p className={`text-[9px] mt-1 font-mono tracking-wide ${isSelected ? 'text-white/60' : 'text-[#2c3e50]/75'}`}>
                            Collection story available
                          </p>
                        )}
                      </div>
                      <span className={`text-xs font-mono ${isSelected ? 'text-white/40' : 'text-gray-300'}`}>{cluster.photos.length}</span>
                    </div>
                    <AnimatePresence>
                      {isSelected && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                          <div className="grid grid-cols-4 gap-1.5 mt-3">
                            {cluster.photos.slice(0, 4).map((photo) => (
                              <div key={photo._id} className="aspect-square rounded-md overflow-hidden">
                                <img src={`${photo.imageUrl}?auto=format&w=160&q=75`} alt={photo.title} className="w-full h-full object-cover" draggable={false} />
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MapboxMap(props: { photos: Photo[]; mapboxToken: string; showLocationList?: boolean }) {
  return <MapErrorBoundary><MapboxMapInner photos={props.photos} mapboxToken={props.mapboxToken} /></MapErrorBoundary>;
}
