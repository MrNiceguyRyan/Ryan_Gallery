import { useState, useMemo, useRef, useCallback, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import MapGL, { Marker, Popup, NavigationControl, FullscreenControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import Supercluster from 'supercluster';
import { motion, AnimatePresence } from 'framer-motion';
import type { Photo } from '../types';
import Magnetic from './shared/Magnetic';

// ─── Accent color (unified warm dark tone) ───
const ACCENT = '#D2FF00';
const ACCENT_RGB = '210, 255, 0';
// Map markers use a calm warm ivory instead of the loud lime — dots read as
// map pins, not neon. (Lime stays for UI accents: tooltips, sidebar, etc.)
const DOT = '#E7E1CF';
const DOT_RGB = '231, 225, 207';

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
          <p className="text-white/20 text-xs font-ui mt-2 max-w-sm">{this.state.error?.message}</p>
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
  const groups: Record<string, LocationCluster> = {};
  for (const p of photos) {
    if (p.location?.lat == null || p.location?.lng == null) continue;
    const key = `${p.location.city || ''}|${p.location.country || ''}`;
    if (!groups[key]) {
      groups[key] = { city: p.location.city || 'Unknown', country: p.location.country || '', region: p.collection?.region?.trim() || '', lat: p.location.lat, lng: p.location.lng, photos: [] };
    }
    // Backfill region if the first photo of a city lacked a collection region.
    if (!groups[key].region && p.collection?.region?.trim()) groups[key].region = p.collection.region.trim();
    groups[key].photos.push(p);
  }
  return Object.values(groups).sort((a, b) => b.photos.length - a.photos.length);
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

// ─── Camera framing — the map settles face-on over the continental US ───
// No dive-from-space intro: the "from space" globe zoom was inherently heavy
// (rendering the whole globe/atmosphere while a 60fps onMove re-render storm
// ran), so the map now simply opens on the States, framed face-on (pitch:0).
const FINAL_VIEW = { latitude: 38.8, longitude: -97.5, zoom: 3.5, pitch: 0, bearing: 0 };

// ─── Main Inner Component ───
function MapboxMapInner({ photos, mapboxToken }: { photos: Photo[]; mapboxToken: string }) {
  const mapRef = useRef<MapRef>(null);
  const prefersReduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [viewState, setViewState] = useState(FINAL_VIEW);
  // No dive intro any more — the map opens settled on the US, so markers may
  // bloom in immediately (they still stagger-animate on mount for a little life).
  const [activeCluster, setActiveCluster] = useState<LocationCluster | null>(null);
  const [activeClusterCity, setActiveClusterCity] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [mapStyleIdx, setMapStyleIdx] = useState(0); // default to light style (the globe dive-in fog is light-tuned)
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
    // NOTE: 3D terrain (raster-DEM) intentionally removed. The atlas is framed
    // face-on at pitch:0, so terrain relief is never visible — it added real
    // per-frame GPU render cost + streamed DEM tiles that repaint on load,
    // hurting scroll smoothness on constrained compositors for zero visual gain.
  }, []);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Apply the globe projection + atmosphere once the style is ready. No dive:
    // the camera is already framed on the US (initial viewState = FINAL_VIEW).
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

  // Cluster click. A cluster can hold photos from ONE city (proximity grouping
  // at low zoom) or several. If it resolves to a single city we treat the click
  // like selecting that city — smooth zoom in, highlight it in the sidebar, and
  // pop its photo card on the map. A genuinely multi-city cluster just expands.
  const handleClusterClick = useCallback((clusterId: number, lng: number, lat: number) => {
    let leaves: any[] = [];
    try { leaves = clusterIndex.getLeaves(clusterId, Infinity); } catch { leaves = []; }
    const citiesInCluster = Array.from(new Set(
      leaves.map((l) => validPhotos[l.properties.photoIndex]?.location?.city).filter(Boolean),
    ));

    if (citiesInCluster.length === 1) {
      const cluster = cityClusters.find((c) => c.city === citiesInCluster[0]) || null;
      if (cluster) {
        mapRef.current?.flyTo({ center: [cluster.lng, cluster.lat], zoom: Math.max(viewState.zoom, 7), duration: 1400, essential: !prefersReduced, curve: 1.42 });
        setActiveCluster(cluster);
        setActiveClusterCity(cluster.city);
        setExpandedRegion(cluster.region || getRegion(cluster.country));
        return;
      }
    }

    // Multi-city (or unresolved) cluster → expand toward its break-apart zoom.
    try {
      const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
      const targetZoom = Math.min(expansionZoom, viewState.zoom + 3.5, 14);
      mapRef.current?.flyTo({ center: [lng, lat], zoom: targetZoom, duration: 1400, essential: !prefersReduced, curve: 1.42, speed: 0.8 });
    } catch {
      mapRef.current?.flyTo({ center: [lng, lat], zoom: viewState.zoom + 2, duration: 1200, essential: !prefersReduced });
    }
    setActiveCluster(null);
    setActiveClusterCity(null);
  }, [clusterIndex, viewState.zoom, validPhotos, cityClusters]);

  // Photo marker click → highlight in sidebar (no map popup)
  const handlePhotoClick = useCallback((photo: Photo) => {
    const city = photo.location?.city || '';
    const cluster = cityClusters.find(c => c.city === city) || null;
    setActiveCluster(cluster);
    setActiveClusterCity(city);
    // Expand the region containing this city so the card is visible. Use the
    // same key groupByRegion does (fine-grained region wins over country map),
    // otherwise the wrong sidebar group opens.
    if (cluster) {
      setExpandedRegion(cluster.region || getRegion(cluster.country));
    }
    // Gentle center, don't zoom aggressively
    const targetZoom = Math.max(viewState.zoom, 6);
    mapRef.current?.flyTo({
      center: [photo.location!.lng, photo.location!.lat],
      zoom: targetZoom,
      duration: 1200,
      essential: !prefersReduced,
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
      mapRef.current?.flyTo({ center: [cluster.lng, cluster.lat], zoom: 7, duration: 1500, essential: !prefersReduced });
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
        mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 2000, essential: !prefersReduced });
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
          setExpandedRegion(closest.region || getRegion(closest.country));
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
    mapRef.current?.flyTo({ center: [FINAL_VIEW.longitude, FINAL_VIEW.latitude], zoom: FINAL_VIEW.zoom, pitch: FINAL_VIEW.pitch, bearing: FINAL_VIEW.bearing, duration: 1600, essential: !prefersReduced });
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
      {/* translateZ(0) promotes the ENTIRE card (shadow + map + sidebar) to one
          cached compositor layer, so scrolling the page just translates that
          layer instead of re-compositing the heavy WebGL region every frame —
          the key win for constrained compositors (mobile / embedded webviews).
          Shadow blur trimmed 100px→64px (indistinguishable at 0.45 alpha) to
          shrink the layer's rasterised bounds. */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-0 rounded-[2rem] overflow-hidden shadow-[0_30px_64px_-24px_rgba(0,0,0,0.45)] border border-white/10 bg-[#111]" style={{ transform: 'translateZ(0)' }}>
        {/* ── Map ── */}
        {/* translateZ(0) promotes this map region to its own compositor layer.
            Two payoffs during page scroll: (1) the overlay controls' backdrop-blur
            samples a LOCAL, static backdrop (the canvas scrolls with them) so the
            browser caches the filter instead of re-rasterising it every frame, and
            (2) the whole map region translates as one cached layer. It's an ancestor
            of the Mapbox canvas — never the canvas itself — so map/marker geometry
            is untouched. This is a big win for smooth-scrolling back up past the map. */}
        <div className="relative w-full lg:flex-1 h-[54vh] min-h-[360px] md:h-[64vh] lg:h-[72vh]" style={{ transform: 'translateZ(0)' }}>
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
            onClick={() => { setShowStylePicker(false); setActiveCluster(null); setActiveClusterCity(null); }}
          >
            <NavigationControl position="bottom-right" showCompass={false} />
            <FullscreenControl position="bottom-right" />

            <AnimatePresence>
            {clusters.map((feature) => {
              const [lng, lat] = feature.geometry.coordinates;
              const props = feature.properties;

              // Bloom outward from the framed centre once the dive settles —
              // near markers first, distant ones trailing. Light jitter keeps
              // it organic rather than a rigid ripple.
              const dx = lng - viewState.longitude;
              const dy = lat - viewState.latitude;
              const dist = Math.sqrt(dx * dx + dy * dy);
              // Stable per-marker jitter (0..0.08) hashed from the feature/photo id
              // so it doesn't change on every render — a fresh Math.random() here
              // would re-stagger whileHover/exit and cause hover lag + ghosting.
              const bloomSeed = String(
                props.cluster ? feature.id : (validPhotos[props.photoIndex]?._id ?? feature.id),
              );
              let bloomHash = 0;
              for (let i = 0; i < bloomSeed.length; i++) bloomHash = (bloomHash * 31 + bloomSeed.charCodeAt(i)) & 0xffff;
              const bloomJitter = (bloomHash % 81) / 1000; // 0..0.08
              const bloomDelay = Math.min(dist * 0.006, 0.5) + bloomJitter;

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
                      initial={prefersReduced ? false : { opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }}
                      transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 22, delay: bloomDelay }}
                      whileHover={prefersReduced ? undefined : { scale: 1.08, transition: { type: 'spring', stiffness: 320, damping: 22 } }}
                      whileTap={{ scale: 0.94 }}
                    >
                      {/* Outer breathing ring — CSS keyframes (compositor, off the
                          main thread) so N perpetual cluster rings never compete
                          with Lenis's main-thread smooth scroll. */}
                      <div
                        className="absolute rounded-full marker-breathe"
                        style={{ width: size + 14, height: size + 14, backgroundColor: `rgba(${DOT_RGB},0.12)` }}
                      />
                      {/* Inner halo */}
                      <div
                        className="absolute rounded-full"
                        style={{ width: size + 6, height: size + 6, backgroundColor: `rgba(${DOT_RGB},0.18)` }}
                      />
                      {/* Core badge */}
                      <div
                        className="relative rounded-full flex items-center justify-center font-bold shadow-lg border-[2.5px] border-black/15"
                        style={{
                          width: size, height: size,
                          fontSize: count < 10 ? 13 : 14,
                          background: DOT,
                          color: '#20241a',
                          boxShadow: `0 4px 16px rgba(0,0,0,0.35)`,
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
                    initial={prefersReduced ? false : { opacity: 0, scale: 0.3 }}
                    animate={{
                      // Dim the rest of the field when a city is selected, so
                      // the active one (and any hovered one) reads as focus.
                      opacity: activeCluster && !isActive && !isHovered ? 0.35 : 1,
                      scale: 1,
                    }}
                    exit={{ opacity: 0, scale: 0.3, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }}
                    transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 24, delay: bloomDelay, opacity: { duration: 0.5 } }}
                    onMouseEnter={() => { setHoveredIdx(props.photoIndex); setHoveredCity(photo.location?.city || null); }}
                    onMouseLeave={() => { setHoveredIdx(null); setHoveredCity(null); }}
                  >
                    {/* Glow ring — only shown when active or hovered */}
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
                      className="relative rounded-full overflow-hidden shadow-lg transition-[width,height,box-shadow,outline] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{
                        width: isActive ? 40 : isHovered ? 34 : 26,
                        height: isActive ? 40 : isHovered ? 34 : 26,
                        outline: isActive
                          ? `3px solid ${DOT}`
                          : '2.5px solid rgba(255,255,255,0.9)',
                        outlineOffset: '1px',
                        boxShadow: isActive
                          ? `0 0 18px rgba(${DOT_RGB},0.45), 0 4px 12px rgba(0,0,0,0.25)`
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
                          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
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

            {/* ── Photo box — pops up on the map at the selected city, so a
                 marker click reads clearly: map zooms in, the sidebar city
                 highlights, and this preview appears. Mirrors the sidebar
                 selection; dismiss via ×, another marker, or an empty-map click. ── */}
            {activeCluster && (
              <Popup
                longitude={activeCluster.lng}
                latitude={activeCluster.lat}
                anchor="bottom"
                offset={20}
                closeButton={false}
                closeOnClick={false}
                className="premium-map-popup"
                maxWidth="240px"
              >
                <motion.div
                  key={activeCluster.city}
                  initial={{ opacity: 0, y: 8, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                  className="relative w-[218px] overflow-hidden rounded-2xl bg-[#15150f] border border-white/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)]"
                >
                  <div className="relative h-28 overflow-hidden">
                    <img
                      src={`${activeCluster.photos[0].imageUrl}?auto=format&w=440&q=80`}
                      alt={activeCluster.city}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveCluster(null); setActiveClusterCity(null); }}
                      className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-colors"
                      aria-label="Close"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                    <div className="absolute bottom-2.5 left-3.5 right-3.5">
                      <p className="text-[8px] uppercase tracking-[0.2em] text-white/55 font-semibold">{activeCluster.country}</p>
                      <h4 className="text-base font-serif uppercase text-white leading-tight truncate">{activeCluster.city}</h4>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-2.5 gap-2">
                    <div className="flex -space-x-2">
                      {activeCluster.photos.slice(0, 3).map((p) => (
                        <div key={p._id} className="w-7 h-7 rounded-md overflow-hidden ring-2 ring-[#15150f]">
                          <img src={`${p.imageUrl}?auto=format&w=64&h=64&fit=crop&q=70`} alt="" className="w-full h-full object-cover" draggable={false} />
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] font-ui uppercase tracking-[0.12em] font-semibold" style={{ color: ACCENT }}>
                      {activeCluster.photos.length} frame{activeCluster.photos.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  {/* pointer toward the marker */}
                  <div className="absolute left-1/2 -bottom-[7px] -translate-x-1/2 w-3.5 h-3.5 rotate-45 bg-[#15150f] border-r border-b border-white/10" />
                </motion.div>
              </Popup>
            )}
          </MapGL>

          {/* ── Floating status badge ── */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="absolute top-6 left-6 z-10 pointer-events-none">
            <div className="bg-black/50 backdrop-blur-2xl px-5 py-3.5 rounded-2xl shadow-lg border border-white/10">
              <p className="text-sm font-serif uppercase text-white/85 leading-none">United States</p>
              <p className="text-[8px] font-ui uppercase tracking-[0.25em] text-white/30 mt-1.5">
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
              Globe · {MAP_STYLES[mapStyleIdx].label}
            </div>
          </div>

          {/* ── Live coordinate readout — bottom-center so it clears the
               bottom-right Mapbox nav/fullscreen controls. Updates on pan/zoom. ── */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none hidden md:block">
            <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 font-ui text-[9px] tracking-[0.12em] text-white/40 tabular-nums flex items-center gap-2.5">
              <span style={{ color: ACCENT }}>◉</span>
              <span>LAT {viewState.latitude.toFixed(2)}°</span>
              <span className="opacity-30">·</span>
              <span>LNG {viewState.longitude.toFixed(2)}°</span>
              <span className="opacity-30">·</span>
              <span>Z {viewState.zoom.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* ── Desktop sidebar — grouped by region ── */}
        <div className="hidden lg:flex flex-col w-[340px] border-l border-white/5 bg-[#30352a]">
          <div className="px-5 py-4 border-b border-white/5">
            <p className="text-[10px] tracking-[0.3em] text-white/30 uppercase font-light">Regions</p>
            <p className="text-xs text-white/20 font-ui mt-1">{regionGroups.length} regions · {cityClusters.length} cities · {photos.length} photos</p>
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
                      <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">{group.region}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-ui text-white/20">{group.totalPhotos}</span>
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
                                className={`relative w-full text-left px-5 py-3.5 border-b transition-[translate,background-color,border-color] duration-[550ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
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
                                  <div className={`w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 ring-2 transition-[scale,box-shadow,outline-color] duration-[550ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isSelected ? 'ring-white/30 scale-110' : isHoveredFromMap ? 'ring-white/20 scale-105' : 'ring-white/5'}`}>
                                    <img src={`${cluster.photos[0].imageUrl}?auto=format&w=80&h=80&fit=crop&q=75`} alt={cluster.city} className="w-full h-full object-cover" draggable={false} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className={`text-[13px] font-medium tracking-tight truncate ${isSelected ? 'text-white' : isHoveredFromMap ? 'text-white/80' : 'text-white/60'}`}>{cluster.city}</h3>
                                    <p className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/40' : 'text-white/25'}`}>{cluster.country}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] font-ui ${isSelected ? 'text-white/50' : 'text-white/20'}`}>{cluster.photos.length}</span>
                                    {(isSelected || isHoveredFromMap) && (
                                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white/40' : 'bg-white/20'}`} />
                                    )}
                                  </div>
                                </div>
                              </button>
                              {/* Rich expanded card for the selected city — framer
                                  measures the real content height and animates it, so
                                  the expand is smooth (no max-height:500px guess +
                                  transition:all reflow on the 600px cover image). */}
                              <AnimatePresence initial={false}>
                                {isSelected && (
                                  <motion.div
                                    key="detail"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ height: { duration: 0.5, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } }}
                                    className="bg-[#111] border-b border-white/5 overflow-hidden"
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
                                      <h4 className="text-lg font-serif uppercase text-white leading-tight">{cluster.city}</h4>
                                    </div>
                                    <span className="text-[10px] font-ui text-white/50">{cluster.photos.length} photos</span>
                                  </div>
                                </div>
                                {/* Content */}
                                <div className="p-4">
                                  <p className="text-[10px] text-white/30 font-ui tracking-wide mb-3">
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
                                      className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] uppercase tracking-[0.1em] font-bold text-white transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                                      style={{ background: ACCENT }}
                                    >
                                      Explore Story
                                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                                    </a>
                                  )}
                                </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
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
      </div>

      {/* ── Mobile city list — grouped by region ── */}
      <div className="lg:hidden mt-4 space-y-4">
        {regionGroups.map((group) => (
          <div key={group.region}>
            <div className="flex items-center gap-2 px-1 mb-2">
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">{group.region}</span>
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-[10px] font-ui text-white/20">{group.totalPhotos}</span>
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
                      <span className={`text-xs font-ui ${isSelected ? 'text-white/40' : 'text-white/20'}`}>{cluster.photos.length}</span>
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

export default function MapboxMap(props: { photos: Photo[]; mapboxToken: string }) {
  return <MapErrorBoundary><MapboxMapInner photos={props.photos} mapboxToken={props.mapboxToken} /></MapErrorBoundary>;
}
