import { useState, useMemo, useRef, useCallback, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import MapGL, { Marker, NavigationControl, FullscreenControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import Supercluster from 'supercluster';
import { motion, AnimatePresence } from 'framer-motion';
import type { Photo } from '../types';

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

// ─── Sidebar location cluster (group photos by city) ───
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

// ─── Stylize map layers ───
function stylizeMap(map: any) {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    const { id, type } = layer;
    if (id.includes('water') && type === 'fill') map.setPaintProperty(id, 'fill-color', '#dce8f0');
    if ((id === 'land' || id === 'background')) {
      map.setPaintProperty(id, 'background-color', '#f8f7f5');
      if (type === 'fill') map.setPaintProperty(id, 'fill-color', '#f8f7f5');
    }
    if (id.includes('landuse') && type === 'fill') {
      if (id.includes('park') || id.includes('green')) { map.setPaintProperty(id, 'fill-color', '#e8efe5'); map.setPaintProperty(id, 'fill-opacity', 0.6); }
    }
    if (type === 'hillshade') { map.setPaintProperty(id, 'hillshade-shadow-color', '#d0cfc8'); map.setPaintProperty(id, 'hillshade-highlight-color', '#ffffff'); map.setPaintProperty(id, 'hillshade-exaggeration', 0.3); }
    if (id.includes('road') && type === 'line') {
      if (id.includes('highway') || id.includes('motorway') || id.includes('trunk')) { map.setPaintProperty(id, 'line-color', '#d4d0c8'); map.setPaintProperty(id, 'line-width', 1.2); }
      else if (id.includes('major') || id.includes('primary') || id.includes('secondary')) { map.setPaintProperty(id, 'line-color', '#ddd9d2'); map.setPaintProperty(id, 'line-width', 0.8); }
      else { map.setPaintProperty(id, 'line-color', '#e8e5e0'); map.setPaintProperty(id, 'line-width', 0.4); }
    }
    if (id.includes('admin') && type === 'line') {
      if (id.includes('0') || id.includes('country')) { map.setPaintProperty(id, 'line-color', '#b8b4ac'); map.setPaintProperty(id, 'line-width', 0.8); }
      else { map.setPaintProperty(id, 'line-color', '#d0ccc5'); map.setPaintProperty(id, 'line-width', 0.4); }
    }
    if (id.includes('label') && type === 'symbol') {
      if (id.includes('country')) { map.setPaintProperty(id, 'text-color', '#8a857c'); map.setPaintProperty(id, 'text-halo-color', '#f8f7f5'); map.setPaintProperty(id, 'text-halo-width', 1.5); }
      else if (id.includes('state') || id.includes('region')) { map.setPaintProperty(id, 'text-color', '#a09b93'); map.setPaintProperty(id, 'text-halo-color', '#f8f7f5'); map.setPaintProperty(id, 'text-halo-width', 1.2); }
      else if (id.includes('city') || id.includes('place') || id.includes('town')) { map.setPaintProperty(id, 'text-color', '#6b6660'); map.setPaintProperty(id, 'text-halo-color', '#f8f7f5'); map.setPaintProperty(id, 'text-halo-width', 1); }
    }
    if (id.includes('building') && type === 'fill') { map.setPaintProperty(id, 'fill-color', '#eae7e2'); map.setPaintProperty(id, 'fill-opacity', 0.5); }
  }
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
  }
}

// ─── Main Inner Component ───
function MapboxMapInner({ photos, mapboxToken }: { photos: Photo[]; mapboxToken: string }) {
  const mapRef = useRef<MapRef>(null);

  // View state for controlled map
  const [viewState, setViewState] = useState({
    latitude: 30,
    longitude: -40,
    zoom: 2.2,
    pitch: 40,
    bearing: 0,
  });

  const [activePhoto, setActivePhoto] = useState<Photo | null>(null);
  const [activeClusterCity, setActiveClusterCity] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Sidebar clusters
  const cityClusters = useMemo(() => clusterByLocation(photos), [photos]);

  // Valid photos for Supercluster
  const validPhotos = useMemo(() => photos.filter(p => p.location?.lat != null && p.location?.lng != null), [photos]);

  // GeoJSON points
  const points = useMemo(() =>
    validPhotos.map((photo, index) => ({
      type: 'Feature' as const,
      properties: { cluster: false, photoIndex: index },
      geometry: { type: 'Point' as const, coordinates: [photo.location!.lng, photo.location!.lat] },
    })),
    [validPhotos],
  );

  // Supercluster index
  const clusterIndex = useMemo(() => {
    const idx = new Supercluster({ radius: 50, maxZoom: 16 });
    idx.load(points as any);
    return idx;
  }, [points]);

  // Compute visible clusters from current viewport
  const clusters = useMemo(() => {
    const map = mapRef.current?.getMap();
    if (!map) return clusterIndex.getClusters([-180, -85, 180, 85], Math.floor(viewState.zoom));
    const bounds = map.getBounds()?.toArray().flat() as [number, number, number, number];
    return bounds ? clusterIndex.getClusters(bounds, Math.floor(viewState.zoom)) : [];
  }, [clusterIndex, viewState.zoom, viewState.latitude, viewState.longitude]);

  // Handle map load
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const apply = () => {
      stylizeMap(map);
      map.setProjection('globe');
      // Globe atmosphere
      map.setFog({
        color: 'rgb(245, 245, 247)',
        'high-color': 'rgb(200, 210, 230)',
        'horizon-blend': 0.08,
        'space-color': 'rgb(15, 15, 20)',
        'star-intensity': 0.4,
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once('style.load', apply);
  }, []);

  // Click cluster → smooth expand
  const handleClusterClick = useCallback((clusterId: number, lng: number, lat: number) => {
    const expansionZoom = Math.min(clusterIndex.getClusterExpansionZoom(clusterId), 14);
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom: expansionZoom,
      duration: 1200,
      essential: true,
    });
    setActivePhoto(null);
  }, [clusterIndex]);

  // Click photo marker → select + fly
  const handlePhotoClick = useCallback((photo: Photo) => {
    setActivePhoto(photo);
    setActiveClusterCity(photo.location?.city || null);
    mapRef.current?.flyTo({
      center: [photo.location!.lng, photo.location!.lat],
      zoom: Math.max(viewState.zoom, 6),
      duration: 1500,
      essential: true,
    });
  }, [viewState.zoom]);

  // Sidebar city click → fly
  const handleCityClick = useCallback((cluster: LocationCluster) => {
    const isSame = activeClusterCity === cluster.city;
    setActiveClusterCity(isSame ? null : cluster.city);
    setActivePhoto(null);
    if (!isSame) {
      mapRef.current?.flyTo({
        center: [cluster.lng, cluster.lat],
        zoom: 7,
        duration: 1500,
        essential: true,
      });
    }
  }, [activeClusterCity]);

  // Reset view
  const resetView = useCallback(() => {
    mapRef.current?.flyTo({ center: [-40, 30], zoom: 2.2, pitch: 40, bearing: 0, duration: 2000 });
    setActivePhoto(null);
    setActiveClusterCity(null);
  }, []);

  // Escape key
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') { setActivePhoto(null); setActiveClusterCity(null); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  if (!mapboxToken) {
    return <div className="h-[500px] rounded-2xl bg-gray-50 flex items-center justify-center"><p className="text-gray-400 text-sm">Mapbox token not configured</p></div>;
  }

  if (validPhotos.length === 0) {
    return <div className="h-[500px] rounded-2xl bg-gray-50 flex items-center justify-center"><p className="text-gray-400 text-sm">No geotagged photos found</p></div>;
  }

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
            mapStyle="mapbox://styles/mapbox/light-v11"
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
            onLoad={handleMapLoad}
            maxZoom={16}
            minZoom={1.5}
            onClick={() => { setActivePhoto(null); }}
          >
            <NavigationControl position="bottom-right" showCompass={false} />
            <FullscreenControl position="bottom-right" />

            {/* Render clusters + individual markers from Supercluster */}
            {clusters.map((feature) => {
              const [lng, lat] = feature.geometry.coordinates;
              const props = feature.properties;

              // ── Cluster bubble ──
              if (props.cluster) {
                const count = props.point_count;
                const size = count < 10 ? 44 : count < 30 ? 52 : 60;
                return (
                  <Marker
                    key={`cluster-${feature.id}`}
                    longitude={lng}
                    latitude={lat}
                    anchor="center"
                    onClick={e => { e.originalEvent.stopPropagation(); handleClusterClick(feature.id as number, lng, lat); }}
                  >
                    <div className="relative flex items-center justify-center cursor-pointer group" style={{ width: size + 16, height: size + 16 }}>
                      {/* Outer pulse ring */}
                      <div
                        className="absolute rounded-full animate-ping opacity-20"
                        style={{ width: size + 12, height: size + 12, backgroundColor: 'rgba(59,130,246,0.4)', animationDuration: '2.5s' }}
                      />
                      {/* Mid glow */}
                      <div
                        className="absolute rounded-full opacity-30 group-hover:opacity-50 transition-opacity duration-500"
                        style={{ width: size + 6, height: size + 6, backgroundColor: 'rgba(59,130,246,0.3)' }}
                      />
                      {/* Core circle */}
                      <div
                        className="relative rounded-full flex items-center justify-center text-white font-bold shadow-lg border-[3px] border-white/60 group-hover:scale-110 transition-transform duration-300"
                        style={{
                          width: size,
                          height: size,
                          fontSize: count < 10 ? 13 : 15,
                          background: count < 10 ? 'rgba(59,130,246,0.8)' : count < 30 ? 'rgba(99,102,241,0.85)' : 'rgba(139,92,246,0.85)',
                          boxShadow: '0 8px 30px rgba(59,130,246,0.35)',
                        }}
                      >
                        {count}
                      </div>
                    </div>
                  </Marker>
                );
              }

              // ── Individual photo marker ──
              const photo = validPhotos[props.photoIndex];
              if (!photo) return null;
              const isActive = activePhoto?._id === photo._id;
              const isHovered = hoveredIdx === props.photoIndex;

              return (
                <Marker
                  key={`photo-${photo._id}`}
                  longitude={lng}
                  latitude={lat}
                  anchor="center"
                  onClick={e => { e.originalEvent.stopPropagation(); handlePhotoClick(photo); }}
                >
                  <div
                    className="relative flex items-center justify-center cursor-pointer group"
                    style={{ width: 48, height: 48 }}
                    onMouseEnter={() => setHoveredIdx(props.photoIndex)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {/* Selection ring */}
                    <div className={`absolute w-[48px] h-[48px] rounded-full transition-all duration-500 ${isActive ? 'bg-blue-500/20 scale-100' : 'bg-blue-500/0 scale-0 group-hover:bg-blue-500/15 group-hover:scale-100'}`} />

                    {/* Photo thumbnail circle */}
                    <div className={`relative z-10 rounded-full overflow-hidden shadow-lg transition-all duration-500 ease-out ${isActive ? 'w-10 h-10 ring-[3px] ring-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'w-7 h-7 ring-[2.5px] ring-white group-hover:w-9 group-hover:h-9 group-hover:ring-blue-400 group-hover:shadow-xl'}`}>
                      <img
                        src={`${photo.imageUrl}?auto=format&w=100&h=100&fit=crop&q=75`}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>

                    {/* Hover tooltip */}
                    <AnimatePresence>
                      {isHovered && !isActive && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.9 }}
                          transition={{ duration: 0.2 }}
                          className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                        >
                          <div className="px-3 py-1.5 bg-gray-900 text-white text-[10px] font-semibold rounded-full shadow-xl whitespace-nowrap tracking-wide">
                            {photo.location?.city || photo.title}
                          </div>
                          <div className="w-1.5 h-1.5 bg-gray-900 rotate-45 absolute -bottom-0.5 left-1/2 -translate-x-1/2" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Marker>
              );
            })}
          </MapGL>

          {/* ── Floating top-left label ── */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="absolute top-6 left-6 z-10 pointer-events-none"
          >
            <div className="bg-white/70 backdrop-blur-2xl px-5 py-3 rounded-2xl shadow-lg border border-white/30">
              <h2 className="text-[9px] uppercase tracking-[0.3em] font-black text-black/35 mb-0.5">Journal Gallery</h2>
              <p className="text-sm font-serif italic text-black/80">World Explorer</p>
            </div>
          </motion.div>

          {/* ── Reset view button ── */}
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            onClick={resetView}
            className="absolute top-6 right-6 z-10 w-10 h-10 rounded-full bg-white/70 backdrop-blur-2xl border border-white/30 shadow-lg flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-white transition-all active:scale-90"
            title="Reset view"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </motion.button>

          {/* ── Bottom detail card ── */}
          <AnimatePresence>
            {activePhoto && (
              <motion.div
                initial={{ opacity: 0, y: 60, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 60, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[92%] max-w-md"
              >
                <div className="bg-white/80 backdrop-blur-2xl p-4 rounded-[1.5rem] border border-white/40 shadow-[0_24px_56px_rgba(0,0,0,0.15)] flex items-center gap-4">
                  <div className="relative w-20 h-20 flex-shrink-0">
                    <img
                      src={`${activePhoto.imageUrl}?auto=format&w=200&h=200&fit=crop&q=80`}
                      alt=""
                      className="w-full h-full object-cover rounded-xl shadow-lg"
                      draggable={false}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-bold text-blue-500 uppercase tracking-[0.25em] block mb-1">Location</span>
                    <h4 className="font-serif italic text-lg text-gray-900 leading-tight truncate">{activePhoto.location?.city || activePhoto.title}</h4>
                    <p className="text-[11px] text-gray-400 mt-1">{activePhoto.location?.country}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[9px] font-mono text-gray-500">
                        {formatCoord(activePhoto.location!.lat, 'N', 'S')}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[9px] font-mono text-gray-500">
                        {formatCoord(activePhoto.location!.lng, 'E', 'W')}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActivePhoto(null)}
                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 transition-colors flex-shrink-0"
                  >
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Bottom engine label ── */}
          <div className="absolute bottom-6 left-6 z-10 pointer-events-none hidden lg:block">
            <div className="bg-white/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">
              Globe · 3D Terrain
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
                <button
                  key={cluster.city}
                  onClick={() => handleCityClick(cluster)}
                  className={`w-full text-left px-5 py-4 border-b border-gray-50 transition-all duration-300 hover:bg-gray-50 ${isSelected ? 'bg-gray-900 text-white hover:bg-gray-800' : ''}`}
                >
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
            <button
              key={cluster.city}
              onClick={() => handleCityClick(cluster)}
              className={`group p-4 rounded-xl text-left transition-all duration-300 ${isSelected ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-50 hover:bg-gray-100'}`}
            >
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

// ─── Export ───
export default function MapboxMap(props: { photos: Photo[]; mapboxToken: string; showLocationList?: boolean }) {
  return (
    <MapErrorBoundary>
      <MapboxMapInner photos={props.photos} mapboxToken={props.mapboxToken} />
    </MapErrorBoundary>
  );
}
