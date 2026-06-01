import { useState, useMemo, useRef, useCallback, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import MapGL, { Marker, NavigationControl, FullscreenControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import Supercluster from 'supercluster';
import { motion, AnimatePresence } from 'framer-motion';
import type { Photo } from '../types';
import Magnetic from './shared/Magnetic';

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
        <div className="h-[50vh] min-h-[300px] rounded-2xl bg-white/5 flex flex-col items-center justify-center text-center px-8">
          <p className="text-white/40 text-sm font-light">Map failed to load</p>
          <p className="text-white/20 text-xs font-mono mt-2 max-w-sm">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} className="mt-4 px-5 py-2 text-xs tracking-wider rounded-full border border-white/10 text-white/50 hover:border-white/30 hover:text-white transition-all duration-300">Retry</button>
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
      groups[key] = { city: p.location.city || 'Unknown', country: p.location.country || '', lat: p.location.lat, lng: p.location.lng, photos: [] };
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

// ─── Main Inner Component ───
function MapboxMapInner({ photos, mapboxToken, showLocationList = true }: { photos: Photo[]; mapboxToken: string; showLocationList?: boolean }) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState({ latitude: 30, longitude: -40, zoom: 2.2, pitch: 40, bearing: 0 });
  const [activeCluster, setActiveCluster] = useState<LocationCluster | null>(null);
  const [activeClusterCity, setActiveClusterCity] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [mapStyleIdx, setMapStyleIdx] = useState(0); // default to light style
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

  // Cluster click → smooth expand to appropriate zoom
  const handleClusterClick = useCallback((clusterId: number, lng: number, lat: number) => {
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
    setActiveCluster(null);
  }, [clusterIndex, viewState.zoom]);

  // Photo marker click → highlight in sidebar (no map popup)
  const handlePhotoClick = useCallback((photo: Photo) => {
    const city = photo.location?.city || '';
    const cluster = cityClusters.find(c => c.city === city) || null;
    setActiveCluster(cluster);
    setActiveClusterCity(city);
    // Expand the region containing this city so the card is visible
    if (cluster) {
      const region = getRegion(cluster.country);
      setExpandedRegion(region);
    }
    // Gentle center, don't zoom aggressively
    const targetZoom = Math.max(viewState.zoom, 6);
    mapRef.current?.flyTo({
      center: [photo.location!.lng, photo.location!.lat],
      zoom: targetZoom,
      duration: 1200,
      essential: true,
    });
    // Wait for AnimatePresence region expand (300ms) before scrolling
    setTimeout(() => {
      const el = document.getElementById(`sidebar-city-${city.replace(/\s+/g, '-')}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 400);
  }, [viewState.zoom, cityClusters]);

  // Sidebar city click
  const handleCityClick = useCallback((cluster: LocationCluster) => {
    const isSame = activeClusterCity === cluster.city;
    setActiveClusterCity(isSame ? null : cluster.city);
    setActiveCluster(isSame ? null : cluster);
    if (!isSame) {
      mapRef.current?.flyTo({ center: [cluster.lng, cluster.lat], zoom: 7, duration: 1500, essential: true });
    }
  }, [activeClusterCity]);

  // Handle #loc= hash navigation — from the mini-map AND the on-page Atlas
  // Index. Runs on mount and on every hashchange so an already-mounted map
  // still flies when the index sets a new #loc= hash.
  useEffect(() => {
    const goToHash = () => {
      const hash = window.location.hash;
      if (!hash.startsWith('#loc=')) return;
      const parts = hash.replace('#loc=', '').split(',');
      if (parts.length < 2) return;
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      const zoom = parts[2] ? parseFloat(parts[2]) : 8;
      if (isNaN(lat) || isNaN(lng)) return;
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
          setActiveClusterCity(closest.city);
          setActiveCluster(closest);
          setExpandedRegion(getRegion(closest.country));
        }
      }, 300);
      // Clean the hash so it doesn't re-fire on reload
      window.history.replaceState(null, '', window.location.pathname);
    };
    goToHash();
    window.addEventListener('hashchange', goToHash);
    return () => window.removeEventListener('hashchange', goToHash);
  }, [cityClusters]);

  const resetView = useCallback(() => {
    mapRef.current?.flyTo({ center: [-40, 30], zoom: 2.2, pitch: 40, bearing: 0, duration: 2000 });
    setActiveCluster(null);
    setActiveClusterCity(null);
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') { setActiveCluster(null); setActiveClusterCity(null); setShowStylePicker(false); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  if (!mapboxToken) return <div className="h-[500px] rounded-2xl bg-white/5 flex items-center justify-center"><p className="text-white/40 text-sm">Mapbox token not configured</p></div>;
  if (validPhotos.length === 0) return <div className="h-[500px] rounded-2xl bg-white/5 flex items-center justify-center"><p className="text-white/40 text-sm">No geotagged photos found</p></div>;

  return (
    <div>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-0 rounded-[2rem] overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.4)] border border-white/10 bg-[#111]">
        {/* ── Map ── */}
        <div className="relative w-full lg:flex-1 h-[62vh] min-h-[420px] md:h-[78vh] lg:h-[88vh]">
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
              const isActive = activeCluster?.city === photo.location?.city;
              // Highlight on direct marker hover OR when its city is hovered in
              // the right-hand list (bidirectional list ↔ map linkage).
              const isHovered = hoveredIdx === props.photoIndex
                || (hoveredCity != null && photo.location?.city === hoveredCity);
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
                    animate={{
                      // Dim the rest of the field when a city is selected, so the
                      // active one (and any hovered one) reads as the focus.
                      opacity: activeCluster && !isActive && !isHovered ? 0.35 : 1,
                      scale: 1,
                    }}
                    exit={{ opacity: 0, scale: 0.3 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 24, delay: Math.random() * 0.12, opacity: { duration: 0.5 } }}
                    onMouseEnter={() => { setHoveredIdx(props.photoIndex); setHoveredCity(photo.location?.city || null); }}
                    onMouseLeave={() => { setHoveredIdx(null); setHoveredCity(null); }}
                  >
                    {/* Glow ring — only shown when active or hovered */}
                    {(isActive || isHovered) && (
                      <div
                        className="absolute inset-0 rounded-full transition-all duration-500"
                        style={{ backgroundColor: `rgba(${ACCENT_RGB},${isActive ? 0.15 : 0.08})` }}
                      />
                    )}

                    {/* Pulse ring — pings outward while the city is hovered (incl.
                        from the list), reinforcing the list ↔ map linkage. */}
                    {isHovered && !isActive && (
                      <motion.span
                        className="absolute inset-0 rounded-full"
                        style={{ border: `1.5px solid rgba(${ACCENT_RGB},0.6)` }}
                        initial={{ scale: 0.7, opacity: 0.6 }}
                        animate={{ scale: [0.7, 1.9], opacity: [0.55, 0] }}
                        transition={{ duration: 1.3, repeat: Infinity, ease: 'easeOut' }}
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
                        alt={photo.title || photo.location?.city || 'Map location'}
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

          {/* ── Floating status badge ── */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="absolute top-6 left-6 z-10 pointer-events-none">
            <div className="bg-black/50 backdrop-blur-2xl px-5 py-3.5 rounded-2xl shadow-lg border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping" style={{ background: ACCENT }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: ACCENT }} />
                </span>
                <span className="text-[8px] uppercase tracking-[0.4em] font-black text-white/40">Live Atlas</span>
              </div>
              <p className="text-sm font-serif italic text-white/85 leading-none">United States</p>
              <p className="text-[8px] font-mono uppercase tracking-[0.25em] text-white/30 mt-1.5">
                {cityClusters.length} coordinates · {photos.length} frames
              </p>
            </div>
          </motion.div>

          {/* ── Top-right controls ── */}
          <div className="absolute top-6 right-6 z-10 flex flex-col gap-2.5">
            <Magnetic strength={0.4}>
              <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }} onClick={resetView} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-2xl border border-white/10 shadow-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-black/70 hover:border-white/30 transition-colors duration-300" title="Reset view">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
              </motion.button>
            </Magnetic>

            {/* Style switcher toggle */}
            <Magnetic strength={0.4}>
              <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); setShowStylePicker(v => !v); }} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-2xl border border-white/10 shadow-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-black/70 hover:border-white/30 transition-colors duration-300" title="Map style">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0l4.179 2.25L12 17.25 2.25 12l4.179-2.25m11.142 0l-5.571 3-5.571-3m11.142 4.5L12 21.75l-5.571-3" /></svg>
              </motion.button>
            </Magnetic>
          </div>

          {/* ── Style picker dropdown ── */}
          <AnimatePresence>
            {showStylePicker && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute top-[7.5rem] right-6 z-20 bg-black/80 backdrop-blur-2xl rounded-2xl shadow-xl border border-white/10 p-2 min-w-[140px]"
                onClick={e => e.stopPropagation()}
              >
                {MAP_STYLES.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => { setMapStyleIdx(i); setShowStylePicker(false); }}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200 ${i === mapStyleIdx ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Bottom label ── */}
          <div className="absolute bottom-6 left-6 z-10 pointer-events-none hidden lg:block">
            <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">
              Globe · 3D Terrain · {MAP_STYLES[mapStyleIdx].label}
            </div>
          </div>

          {/* ── Live coordinate readout — bottom-center so it clears the
               bottom-right Mapbox nav/fullscreen controls. Updates on pan/zoom. ── */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none hidden md:block">
            <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 font-mono text-[9px] tracking-[0.12em] text-white/40 tabular-nums flex items-center gap-2.5">
              <span style={{ color: ACCENT }}>◉</span>
              <span>LAT {viewState.latitude.toFixed(2)}°</span>
              <span className="opacity-30">·</span>
              <span>LNG {viewState.longitude.toFixed(2)}°</span>
              <span className="opacity-30">·</span>
              <span>Z {viewState.zoom.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* ── Desktop sidebar — grouped by region (optional; off when an
             external index drives the map, e.g. /travel's AtlasIndex) ── */}
        {showLocationList && (
        <div className="hidden lg:flex flex-col w-[340px] border-l border-white/5 bg-[#0A0A0A]">
          <div className="px-5 py-4 border-b border-white/5">
            <p className="text-[10px] tracking-[0.3em] text-white/30 uppercase font-light">Regions</p>
            <p className="text-xs text-white/20 font-mono mt-1">{regionGroups.length} regions · {cityClusters.length} cities · {photos.length} photos</p>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {regionGroups.map((group) => {
              const isRegionOpen = expandedRegion === group.region;
              return (
                <div key={group.region}>
                  {/* Region header */}
                  <button
                    onClick={() => setExpandedRegion(isRegionOpen ? null : group.region)}
                    className="w-full text-left px-5 py-3 flex items-center justify-between bg-white/[0.02] border-b border-white/5 hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                      <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">{group.region}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-white/20">{group.totalPhotos}</span>
                      <motion.svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className="text-white/20"
                        animate={{ rotate: isRegionOpen ? 180 : 0 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
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
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], opacity: { duration: 0.35 } }}
                        className="overflow-hidden"
                      >
                        {group.clusters.map((cluster, ci) => {
                          const isSelected = activeClusterCity === cluster.city;
                          const isHoveredFromMap = hoveredCity === cluster.city && !isSelected;
                          return (
                            <motion.div
                              key={cluster.city}
                              id={`sidebar-city-${cluster.city.replace(/\s+/g, '-')}`}
                              initial={{ opacity: 0, x: -14 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.04 + ci * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            >
                              <button
                                onClick={() => handleCityClick(cluster)}
                                onMouseEnter={() => setHoveredCity(cluster.city)}
                                onMouseLeave={() => setHoveredCity(null)}
                                className={`relative w-full text-left px-5 py-3.5 border-b transition-[transform,background-color,border-color] duration-[550ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                  isSelected
                                    ? 'bg-white/10 text-white border-b-white/10 translate-x-0'
                                    : isHoveredFromMap
                                      ? 'bg-white/[0.05] border-b-white/5 translate-x-2'
                                      : 'hover:bg-white/[0.03] border-b-white/[0.03]'
                                }`}
                              >
                                {/* Accent rail — grows in from the middle when this city is
                                    active or hovered (list ↔ map), soft-eased not a hard toggle */}
                                <motion.span
                                  className="absolute left-0 top-1 bottom-1 w-[2px] origin-center rounded-full"
                                  style={{ background: ACCENT }}
                                  initial={false}
                                  animate={{
                                    scaleY: isSelected || isHoveredFromMap ? 1 : 0,
                                    opacity: isSelected || isHoveredFromMap ? 1 : 0,
                                  }}
                                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                />
                                <div className="flex items-center gap-3">
                                  <div className={`w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 ring-2 transition-[transform,box-shadow,outline-color] duration-[550ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isSelected ? 'ring-white/30 scale-110' : isHoveredFromMap ? 'ring-white/20 scale-105' : 'ring-white/5'}`}>
                                    <img src={`${cluster.photos[0].imageUrl}?auto=format&w=80&h=80&fit=crop&q=75`} alt={cluster.city} className="w-full h-full object-cover" draggable={false} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className={`text-[13px] font-medium tracking-tight truncate ${isSelected ? 'text-white' : isHoveredFromMap ? 'text-white/80' : 'text-white/60'}`}>{cluster.city}</h3>
                                    <p className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/40' : 'text-white/25'}`}>{cluster.country}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] font-mono ${isSelected ? 'text-white/50' : 'text-white/20'}`}>{cluster.photos.length}</span>
                                    {(isSelected || isHoveredFromMap) && (
                                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white/40' : 'bg-white/20'}`} />
                                    )}
                                  </div>
                                </div>
                              </button>
                              {/* Rich expanded card for selected city — with CSS transition */}
                              <div
                                className="bg-[#111] border-b border-white/5 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
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
                                  <p className="text-[10px] text-white/30 font-mono tracking-wide mb-3">
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
                            </motion.div>
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
        )}
      </div>

      {/* ── Mobile city list — grouped by region (gated with the panel) ── */}
      {showLocationList && (
      <div className="lg:hidden mt-4 space-y-4">
        {regionGroups.map((group) => (
          <div key={group.region}>
            <div className="flex items-center gap-2 px-1 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">{group.region}</span>
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-[10px] font-mono text-white/20">{group.totalPhotos}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {group.clusters.map((cluster) => {
                const isSelected = activeClusterCity === cluster.city;
                return (
                  <button key={cluster.city} onClick={() => handleCityClick(cluster)} className={`group p-3.5 rounded-xl text-left transition-all duration-300 active:scale-[0.98] min-h-[60px] ${isSelected ? 'bg-white/10 text-white shadow-lg' : 'bg-white/[0.03] hover:bg-white/[0.06] active:bg-white/[0.08]'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 ring-1 transition-colors ${isSelected ? 'ring-white/20' : 'ring-white/5'}`}>
                        <img src={`${cluster.photos[0].imageUrl}?auto=format&w=100&h=100&fit=crop&q=75`} alt={cluster.city} className="w-full h-full object-cover" draggable={false} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`text-[13px] font-medium tracking-tight truncate ${isSelected ? 'text-white' : 'text-white/60'}`}>{cluster.city}</h3>
                        <p className={`text-[10px] ${isSelected ? 'text-white/40' : 'text-white/25'}`}>{cluster.country}</p>
                      </div>
                      <span className={`text-xs font-mono ${isSelected ? 'text-white/40' : 'text-white/20'}`}>{cluster.photos.length}</span>
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
      )}
    </div>
  );
}

export default function MapboxMap(props: { photos: Photo[]; mapboxToken: string; showLocationList?: boolean }) {
  return <MapErrorBoundary><MapboxMapInner photos={props.photos} mapboxToken={props.mapboxToken} showLocationList={props.showLocationList} /></MapErrorBoundary>;
}
