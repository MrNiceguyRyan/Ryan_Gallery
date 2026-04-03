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
  city: string;
  country: string;
  lat: number;
  lng: number;
  photos: Photo[];
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
  return Object.values(groups);
}

function formatCoord(v: number, pos: string, neg: string) {
  return `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;
}

// ─── Main Inner Component ───
function MapboxMapInner({ photos, mapboxToken }: { photos: Photo[]; mapboxToken: string }) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState({ latitude: 30, longitude: -40, zoom: 2.2, pitch: 40, bearing: 0 });
  const [activeCluster, setActiveCluster] = useState<LocationCluster | null>(null);
  const [activeClusterCity, setActiveClusterCity] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [mapStyleIdx, setMapStyleIdx] = useState(0);
  const [showStylePicker, setShowStylePicker] = useState(false);

  const cityClusters = useMemo(() => clusterByLocation(photos), [photos]);
  const validPhotos = useMemo(() => photos.filter(p => p.location?.lat != null && p.location?.lng != null), [photos]);

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

  // Cluster click → expand
  const handleClusterClick = useCallback((clusterId: number, lng: number, lat: number) => {
    const expansionZoom = Math.min(clusterIndex.getClusterExpansionZoom(clusterId), 14);
    mapRef.current?.flyTo({ center: [lng, lat], zoom: expansionZoom, duration: 1200, essential: true });
    setActiveCluster(null);
  }, [clusterIndex]);

  // Photo marker click → show collection popup
  const handlePhotoClick = useCallback((photo: Photo) => {
    const city = photo.location?.city || '';
    const cluster = cityClusters.find(c => c.city === city) || null;
    setActiveCluster(cluster);
    setActiveClusterCity(city);
    mapRef.current?.flyTo({
      center: [photo.location!.lng, photo.location!.lat],
      zoom: Math.max(viewState.zoom, 8),
      duration: 1500,
      essential: true,
    });
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

  if (!mapboxToken) return <div className="h-[500px] rounded-2xl bg-gray-50 flex items-center justify-center"><p className="text-gray-400 text-sm">Mapbox token not configured</p></div>;
  if (validPhotos.length === 0) return <div className="h-[500px] rounded-2xl bg-gray-50 flex items-center justify-center"><p className="text-gray-400 text-sm">No geotagged photos found</p></div>;

  return (
    <div>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-0 rounded-[2rem] overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.15)] border border-gray-100 bg-white">
        {/* ── Map ── */}
        <div className="relative w-full lg:flex-1 h-[55vh] min-h-[350px] md:h-[550px] lg:h-[700px]">
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
            onClick={() => { setActiveCluster(null); setShowStylePicker(false); }}
          >
            <NavigationControl position="bottom-right" showCompass={false} />
            <FullscreenControl position="bottom-right" />

            {clusters.map((feature) => {
              const [lng, lat] = feature.geometry.coordinates;
              const props = feature.properties;

              // ── Cluster ──
              if (props.cluster) {
                const count = props.point_count;
                const size = count < 10 ? 40 : count < 30 ? 48 : 56;
                return (
                  <Marker key={`cluster-${feature.id}`} longitude={lng} latitude={lat} anchor="center" onClick={e => { e.originalEvent.stopPropagation(); handleClusterClick(feature.id as number, lng, lat); }}>
                    <div className="relative flex items-center justify-center cursor-pointer group" style={{ width: size + 16, height: size + 16 }}>
                      <div className="absolute rounded-full animate-ping opacity-15" style={{ width: size + 10, height: size + 10, backgroundColor: `rgba(${ACCENT_RGB},0.4)`, animationDuration: '2.5s' }} />
                      <div className="absolute rounded-full opacity-25 group-hover:opacity-40 transition-opacity duration-500" style={{ width: size + 4, height: size + 4, backgroundColor: `rgba(${ACCENT_RGB},0.25)` }} />
                      <div className="relative rounded-full flex items-center justify-center text-white font-bold shadow-lg border-[3px] border-white/60 group-hover:scale-110 transition-transform duration-300" style={{ width: size, height: size, fontSize: count < 10 ? 12 : 14, background: ACCENT, boxShadow: `0 8px 30px rgba(${ACCENT_RGB},0.35)` }}>
                        {count}
                      </div>
                    </div>
                  </Marker>
                );
              }

              // ── Individual marker ──
              const photo = validPhotos[props.photoIndex];
              if (!photo) return null;
              const isActive = activeCluster?.city === photo.location?.city;
              const isHovered = hoveredIdx === props.photoIndex;

              return (
                <Marker key={`photo-${photo._id}`} longitude={lng} latitude={lat} anchor="center" onClick={e => { e.originalEvent.stopPropagation(); handlePhotoClick(photo); }}>
                  <div className="relative flex items-center justify-center cursor-pointer group" style={{ width: 48, height: 48 }} onMouseEnter={() => setHoveredIdx(props.photoIndex)} onMouseLeave={() => setHoveredIdx(null)}>
                    <div className={`absolute w-[48px] h-[48px] rounded-full transition-all duration-500 ${isActive ? 'scale-100' : 'scale-0 group-hover:scale-100'}`} style={{ backgroundColor: isActive ? `rgba(${ACCENT_RGB},0.15)` : `rgba(${ACCENT_RGB},0.1)` }} />
                    <div className={`relative z-10 rounded-full overflow-hidden shadow-lg transition-all duration-500 ease-out ${isActive ? 'w-10 h-10 ring-[3px] shadow-[0_0_20px_rgba(44,62,80,0.3)]' : 'w-7 h-7 ring-[2.5px] ring-white group-hover:w-9 group-hover:h-9 group-hover:shadow-xl'}`} style={isActive ? { ringColor: ACCENT } as any : undefined}>
                      <img src={`${photo.imageUrl}?auto=format&w=100&h=100&fit=crop&q=75`} alt="" className="w-full h-full object-cover" draggable={false} />
                    </div>
                    <AnimatePresence>
                      {isHovered && !isActive && (
                        <motion.div initial={{ opacity: 0, y: -8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.9 }} transition={{ duration: 0.2 }} className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                          <div className="px-3 py-1.5 text-white text-[10px] font-semibold rounded-full shadow-xl whitespace-nowrap tracking-wide" style={{ background: ACCENT }}>{photo.location?.city || photo.title}</div>
                          <div className="w-1.5 h-1.5 rotate-45 absolute -bottom-0.5 left-1/2 -translate-x-1/2" style={{ background: ACCENT }} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Marker>
              );
            })}
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

          {/* ── Collection popup card (like reference image) ── */}
          <AnimatePresence>
            {activeCluster && (
              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.92 }}
                transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[280px]"
                onClick={e => e.stopPropagation()}
              >
                <div className="bg-white rounded-[1.5rem] shadow-[0_24px_56px_rgba(0,0,0,0.18)] border border-gray-100 overflow-hidden">
                  {/* Cover photo */}
                  <div className="relative h-40 overflow-hidden">
                    <img
                      src={`${activeCluster.photos[0].imageUrl}?auto=format&w=600&q=80`}
                      alt={activeCluster.city}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4">
                      <p className="text-[10px] uppercase tracking-widest text-white/70 font-bold">{activeCluster.country}</p>
                      <h3 className="text-lg font-serif italic text-white leading-tight">{activeCluster.city}</h3>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="px-5 py-4">
                    <p className="text-[11px] text-gray-500 leading-relaxed mb-1">
                      {activeCluster.photos.length} photos captured in this location.
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono">
                      {formatCoord(activeCluster.lat, 'N', 'S')}, {formatCoord(activeCluster.lng, 'E', 'W')}
                    </p>

                    {/* Photo thumbnails */}
                    <div className="grid grid-cols-4 gap-1.5 mt-3">
                      {activeCluster.photos.slice(0, 4).map((p) => (
                        <div key={p._id} className="aspect-square rounded-lg overflow-hidden">
                          <img src={`${p.imageUrl}?auto=format&w=120&q=75`} alt="" className="w-full h-full object-cover" draggable={false} />
                        </div>
                      ))}
                    </div>

                    {/* Explore button */}
                    {activeCluster.photos[0]?.collection?.slug && (
                      <a
                        href={`/works/${activeCluster.photos[0].collection.slug}`}
                        className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-[11px] uppercase tracking-[0.15em] font-bold text-white transition-all hover:opacity-90 active:scale-95"
                        style={{ background: ACCENT }}
                      >
                        Explore Story
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                      </a>
                    )}
                  </div>

                  {/* Close */}
                  <button onClick={() => setActiveCluster(null)} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/50 transition-colors">
                    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
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

        {/* ── Desktop sidebar ── */}
        <div className="hidden lg:flex flex-col w-[340px] border-l border-gray-100 bg-white">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[10px] tracking-[0.3em] text-gray-400 uppercase font-light">Locations</p>
            <p className="text-xs text-gray-300 font-mono mt-1">{cityClusters.length} cities · {photos.length} photos</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {cityClusters.map((cluster) => {
              const isSelected = activeClusterCity === cluster.city;
              return (
                <button key={cluster.city} onClick={() => handleCityClick(cluster)} className={`w-full text-left px-5 py-4 border-b border-gray-50 transition-all duration-300 hover:bg-gray-50 ${isSelected ? 'bg-gray-900 text-white hover:bg-gray-800' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 transition-colors ${isSelected ? 'ring-white/20' : 'ring-gray-100'}`}>
                      <img src={`${cluster.photos[0].imageUrl}?auto=format&w=80&h=80&fit=crop&q=75`} alt={cluster.city} className="w-full h-full object-cover" draggable={false} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-sm font-light tracking-tight truncate ${isSelected ? 'text-white' : 'text-gray-900'}`}>{cluster.city}</h3>
                      <p className={`text-[11px] font-light mt-0.5 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>{cluster.country}</p>
                    </div>
                    <span className={`text-[10px] font-mono ${isSelected ? 'text-white/40' : 'text-gray-300'}`}>{cluster.photos.length}</span>
                  </div>
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                        <div className="grid grid-cols-3 gap-1.5 mt-3">
                          {cluster.photos.slice(0, 6).map((photo, i) => (
                            <motion.div key={photo._id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04, duration: 0.25 }} className="aspect-square rounded-md overflow-hidden">
                              <img src={`${photo.imageUrl}?auto=format&w=160&q=75`} alt={photo.title} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" loading="lazy" draggable={false} />
                            </motion.div>
                          ))}
                        </div>
                        <p className="text-[10px] text-white/30 font-mono mt-2">{formatCoord(cluster.lat, 'N', 'S')}, {formatCoord(cluster.lng, 'E', 'W')}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Mobile city list ── */}
      <div className="lg:hidden mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cityClusters.map((cluster) => {
          const isSelected = activeClusterCity === cluster.city;
          return (
            <button key={cluster.city} onClick={() => handleCityClick(cluster)} className={`group p-4 rounded-xl text-left transition-all duration-300 ${isSelected ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-50 hover:bg-gray-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full overflow-hidden flex-shrink-0 ring-2 transition-colors ${isSelected ? 'ring-white/20' : 'ring-gray-200'}`}>
                  <img src={`${cluster.photos[0].imageUrl}?auto=format&w=100&h=100&fit=crop&q=75`} alt={cluster.city} className="w-full h-full object-cover" draggable={false} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-light tracking-tight truncate ${isSelected ? 'text-white' : 'text-gray-900'}`}>{cluster.city}</h3>
                  <p className={`text-[11px] font-light ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>{cluster.country}</p>
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
  );
}

export default function MapboxMap(props: { photos: Photo[]; mapboxToken: string; showLocationList?: boolean }) {
  return <MapErrorBoundary><MapboxMapInner photos={props.photos} mapboxToken={props.mapboxToken} /></MapErrorBoundary>;
}
