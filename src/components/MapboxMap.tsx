import { useState, useMemo, useRef, useCallback, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import MapGL, { Marker, NavigationControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { motion, AnimatePresence } from 'framer-motion';
import type { Photo } from '../types';

// ─── Error Boundary ───
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class MapErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('MapboxMap error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[50vh] min-h-[300px] md:h-[500px] rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center px-8">
          <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-gray-400 text-sm font-light">Map failed to load</p>
          <p className="text-gray-300 text-xs font-mono mt-2 max-w-sm">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} className="mt-4 px-5 py-2 text-xs font-light tracking-wider rounded-full border border-gray-200 text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-all duration-300">Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Location clustering ───
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
      groups[key] = {
        city: p.location.city || 'Unknown',
        country: p.location.country || '',
        lat: p.location.lat,
        lng: p.location.lng,
        photos: [],
      };
    }
    groups[key].photos.push(p);
  }
  return Object.values(groups);
}

function formatCoord(value: number, posDir: string, negDir: string): string {
  const dir = value >= 0 ? posDir : negDir;
  return `${Math.abs(value).toFixed(4)}°${dir}`;
}

// ─── Photo Marker ───
function PhotoMarker({
  cluster,
  isSelected,
  onClick,
}: {
  cluster: LocationCluster;
  isSelected: boolean;
  onClick: () => void;
}) {
  const coverPhoto = cluster.photos[0];
  return (
    <div
      className="relative cursor-pointer group"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${cluster.city} — ${cluster.photos.length} photos`}
    >
      {/* Pulse ring behind marker */}
      <span
        className={`absolute inset-0 rounded-full transition-all duration-500 ${
          isSelected
            ? 'animate-ping bg-gray-900/10 scale-150'
            : 'bg-transparent'
        }`}
        style={{ animationDuration: '2.5s' }}
      />

      {/* Photo circle */}
      <div
        className={`relative rounded-full overflow-hidden transition-all duration-500 ease-out ${
          isSelected
            ? 'w-16 h-16 md:w-20 md:h-20 ring-[3px] ring-gray-900 shadow-[0_0_20px_rgba(0,0,0,0.15)]'
            : 'w-10 h-10 md:w-12 md:h-12 ring-2 ring-white shadow-lg group-hover:w-14 group-hover:h-14 group-hover:ring-gray-900 group-hover:shadow-xl'
        }`}
      >
        <img
          src={`${coverPhoto.imageUrl}?auto=format&w=160&h=160&fit=crop&q=75`}
          alt={cluster.city}
          className="w-full h-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 rounded-full shadow-[inset_0_0_8px_rgba(0,0,0,0.1)]" />
      </div>

      {/* Photo count badge */}
      {cluster.photos.length > 1 && (
        <div
          className={`absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[9px] font-medium shadow-md transition-all duration-500 ${
            isSelected
              ? 'w-6 h-6 bg-gray-900 text-white'
              : 'w-5 h-5 bg-white text-gray-900 ring-1 ring-gray-200 group-hover:bg-gray-900 group-hover:text-white'
          }`}
        >
          {cluster.photos.length}
        </div>
      )}

      {/* City label */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tracking-wider transition-all duration-300 ${
          isSelected
            ? '-bottom-6 text-gray-900 opacity-100'
            : '-bottom-5 text-gray-500 opacity-0 group-hover:opacity-100'
        }`}
      >
        {cluster.city}
      </div>
    </div>
  );
}

// ─── Main Map Component ───
function MapboxMapInner({
  photos,
  mapboxToken,
  showLocationList = true,
}: {
  photos: Photo[];
  mapboxToken: string;
  showLocationList?: boolean;
}) {
  const mapRef = useRef<MapRef>(null);
  const [selectedCluster, setSelectedCluster] = useState<LocationCluster | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const clusters = useMemo(() => clusterByLocation(photos), [photos]);
  const locationListRef = useRef<HTMLDivElement>(null);

  const flyToCluster = useCallback(
    (cluster: LocationCluster) => {
      const isSame = selectedCluster?.city === cluster.city;
      setSelectedCluster(isSame ? null : cluster);
      if (!isSame) {
        mapRef.current?.flyTo({
          center: [cluster.lng, cluster.lat],
          zoom: 7,
          duration: 2000,
          essential: true,
        });
      }
    },
    [selectedCluster],
  );

  // Keyboard: Escape to deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedCluster(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Token validation
  if (!mapboxToken) {
    return (
      <div className="h-[500px] md:h-[700px] rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center px-8">
        <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-gray-400 text-sm font-light">Mapbox token not configured</p>
        <p className="text-gray-300 text-xs font-mono mt-2">Set PUBLIC_MAPBOX_TOKEN in .env</p>
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="h-[500px] md:h-[700px] rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center px-8">
        <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <p className="text-gray-400 text-sm font-light">No geotagged photos found</p>
      </div>
    );
  }

  return (
    <div>
      {/* ─── Card layout: Map left, Cities right ─── */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-0 rounded-2xl overflow-hidden shadow-xl border border-gray-100 bg-white">
        {/* Map side — always visible at every viewport width */}
        <div className="relative w-full lg:flex-1 h-[50vh] min-h-[300px] md:h-[500px] lg:h-[650px]">
          <MapGL
            ref={mapRef}
            initialViewState={{
              longitude: clusters.length === 1 ? clusters[0].lng : -40,
              latitude: clusters.length === 1 ? clusters[0].lat : 25,
              zoom: clusters.length === 1 ? 5 : 2.2,
            }}
            mapboxAccessToken={mapboxToken}
            mapStyle="mapbox://styles/mapbox/light-v11"
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
            onClick={() => setSelectedCluster(null)}
            onLoad={() => setMapLoaded(true)}
            maxZoom={16}
            minZoom={1.5}
          >
            <NavigationControl position="bottom-right" showCompass={false} />

            {mapLoaded &&
              clusters.map((cluster, i) => {
                const isSelected = selectedCluster?.city === cluster.city;
                return (
                  <Marker
                    key={`${cluster.city}-${i}`}
                    longitude={cluster.lng}
                    latitude={cluster.lat}
                    anchor="center"
                  >
                    <PhotoMarker
                      cluster={cluster}
                      isSelected={isSelected}
                      onClick={() => flyToCluster(cluster)}
                    />
                  </Marker>
                );
              })}
          </MapGL>
        </div>

        {/* ─── Right side: City list panel (desktop) ─── */}
        <div className="hidden lg:flex flex-col w-[340px] border-l border-gray-100 bg-white">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[10px] tracking-[0.3em] text-gray-400 uppercase font-light">Locations</p>
            <p className="text-xs text-gray-300 font-mono mt-1">{clusters.length} cities · {photos.length} photos</p>
          </div>

          {/* Scrollable city list */}
          <div className="flex-1 overflow-y-auto">
            {clusters.map((cluster) => {
              const isSelected = selectedCluster?.city === cluster.city;
              return (
                <button
                  key={cluster.city}
                  onClick={() => flyToCluster(cluster)}
                  className={`w-full text-left px-5 py-4 border-b border-gray-50 transition-all duration-300 hover:bg-gray-50 ${
                    isSelected ? 'bg-gray-900 text-white hover:bg-gray-800' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 transition-colors ${isSelected ? 'ring-white/20' : 'ring-gray-100'}`}>
                      <img
                        src={`${cluster.photos[0].imageUrl}?auto=format&w=80&h=80&fit=crop&q=75`}
                        alt={cluster.city}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-sm font-light tracking-tight truncate ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                        {cluster.city}
                      </h3>
                      <p className={`text-[11px] font-light mt-0.5 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>
                        {cluster.country}
                      </p>
                    </div>
                    <span className={`text-[10px] font-mono ${isSelected ? 'text-white/40' : 'text-gray-300'}`}>
                      {cluster.photos.length}
                    </span>
                  </div>

                  {/* Show photos when selected */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-3 gap-1.5 mt-3">
                          {cluster.photos.slice(0, 6).map((photo, i) => (
                            <motion.div
                              key={photo._id}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: i * 0.04, duration: 0.25 }}
                              className="aspect-square rounded-md overflow-hidden"
                            >
                              <img
                                src={`${photo.imageUrl}?auto=format&w=160&q=75`}
                                alt={photo.title}
                                className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                                loading="lazy"
                                draggable={false}
                              />
                            </motion.div>
                          ))}
                        </div>
                        <p className="text-[10px] text-white/30 font-mono mt-2">
                          {formatCoord(cluster.lat, 'N', 'S')}, {formatCoord(cluster.lng, 'E', 'W')}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Mobile/Tablet: city list below map ─── */}
      <div className="lg:hidden mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {clusters.map((cluster) => {
          const isSelected = selectedCluster?.city === cluster.city;
          return (
            <button
              key={cluster.city}
              onClick={() => flyToCluster(cluster)}
              className={`group p-4 rounded-xl text-left transition-all duration-300 ${
                isSelected ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-50 hover:bg-gray-100'
              }`}
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
              {/* Expandable thumbnails on selection */}
              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
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

// ─── Exported wrapper with error boundary ───
export default function MapboxMap(props: { photos: Photo[]; mapboxToken: string; showLocationList?: boolean }) {
  return (
    <MapErrorBoundary>
      <MapboxMapInner {...props} />
    </MapErrorBoundary>
  );
}
