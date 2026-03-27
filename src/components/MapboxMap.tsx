import { useState, useMemo, useRef, useCallback, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import MapGL, { Marker, NavigationControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { motion, AnimatePresence } from 'framer-motion';
import type { Photo } from '../types';

// ─── Error Boundary ───
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class MapErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MapboxMap error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[500px] md:h-[650px] rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center px-8">
          <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-gray-400 text-sm font-light">Map failed to load</p>
          <p className="text-gray-300 text-xs font-mono mt-2 max-w-sm">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 px-5 py-2 text-xs font-light tracking-wider rounded-full border border-gray-200 text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-all duration-300"
          >
            Retry
          </button>
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

// ─── Coordinate formatter ───
function formatCoord(value: number, posDir: string, negDir: string): string {
  const dir = value >= 0 ? posDir : negDir;
  return `${Math.abs(value).toFixed(4)}°${dir}`;
}

// ─── Component ───
function MapboxMapInner({
  photos,
  mapboxToken,
}: {
  photos: Photo[];
  mapboxToken: string;
}) {
  const mapRef = useRef<MapRef>(null);
  const [selectedCluster, setSelectedCluster] = useState<LocationCluster | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const clusters = useMemo(() => clusterByLocation(photos), [photos]);

  const handleMarkerClick = useCallback(
    (cluster: LocationCluster) => {
      const isSame = selectedCluster?.city === cluster.city;
      setSelectedCluster(isSame ? null : cluster);
      if (!isSame) {
        mapRef.current?.flyTo({
          center: [cluster.lng, cluster.lat],
          zoom: 6,
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
      <div className="h-[500px] md:h-[650px] rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center px-8">
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
      <div className="h-[500px] md:h-[650px] rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center px-8">
        <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <p className="text-gray-400 text-sm font-light">No geotagged photos found</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Map */}
      <div className="h-[500px] md:h-[650px] rounded-2xl overflow-hidden shadow-lg">
        <MapGL
          ref={mapRef}
          initialViewState={{
            longitude: clusters.length === 1 ? clusters[0].lng : 0,
            latitude: clusters.length === 1 ? clusters[0].lat : 20,
            zoom: clusters.length === 1 ? 5 : 1.5,
          }}
          mapboxAccessToken={mapboxToken}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
          onClick={() => setSelectedCluster(null)}
          onLoad={() => setMapLoaded(true)}
        >
          <NavigationControl position="bottom-right" showCompass={false} />

          {mapLoaded && clusters.map((cluster, i) => {
            const isSelected = selectedCluster?.city === cluster.city;
            return (
              <Marker
                key={`${cluster.city}-${i}`}
                longitude={cluster.lng}
                latitude={cluster.lat}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  handleMarkerClick(cluster);
                }}
              >
                <div className="relative flex items-center justify-center cursor-pointer group">
                  {/* Pulse ring */}
                  <span
                    className={`absolute rounded-full animate-ping ${
                      isSelected
                        ? 'w-10 h-10 bg-white/20'
                        : 'w-7 h-7 bg-white/10'
                    }`}
                    style={{ animationDuration: '3s' }}
                  />
                  {/* Glow ring */}
                  <span
                    className={`absolute rounded-full transition-all duration-500 ${
                      isSelected
                        ? 'w-6 h-6 bg-white/15'
                        : 'w-4 h-4 bg-white/10 group-hover:w-5 group-hover:h-5 group-hover:bg-white/15'
                    }`}
                  />
                  {/* Core dot */}
                  <span
                    className={`relative rounded-full bg-white transition-all duration-300 ${
                      isSelected
                        ? 'w-3 h-3 shadow-[0_0_14px_4px_rgba(255,255,255,0.5)]'
                        : 'w-2 h-2 shadow-[0_0_8px_2px_rgba(255,255,255,0.3)] group-hover:shadow-[0_0_14px_4px_rgba(255,255,255,0.5)]'
                    }`}
                  />
                  {/* Label */}
                  <span
                    className={`absolute -top-6 whitespace-nowrap text-[10px] font-light tracking-wider transition-opacity duration-300 ${
                      isSelected
                        ? 'text-white/70 opacity-100'
                        : 'text-white/30 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {cluster.city}
                  </span>
                </div>
              </Marker>
            );
          })}
        </MapGL>
      </div>

      {/* Floating Info Panel — Desktop */}
      <div className="absolute top-4 right-4 w-[300px] md:w-[340px] hidden sm:block">
        <AnimatePresence mode="wait">
          {selectedCluster ? (
            <motion.div
              key={selectedCluster.city}
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="bg-black/50 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              {/* Close */}
              <button
                onClick={() => setSelectedCluster(null)}
                className="absolute top-3 right-3 text-white/30 hover:text-white/70 transition-colors"
                aria-label="Close info panel"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Location */}
              <h3 className="text-xl font-light text-white tracking-wide">
                {selectedCluster.city}
              </h3>
              {selectedCluster.country && (
                <p className="text-white/40 text-sm mt-1 font-light">
                  {selectedCluster.country}
                </p>
              )}
              <div className="flex items-center gap-4 mt-2 text-[10px] font-mono text-white/20">
                <span>{formatCoord(selectedCluster.lat, 'N', 'S')}</span>
                <span>{formatCoord(selectedCluster.lng, 'E', 'W')}</span>
              </div>

              <div className="h-px bg-white/10 my-4" />

              {/* Photo thumbnails */}
              <div className="grid grid-cols-3 gap-1.5">
                {selectedCluster.photos.slice(0, 6).map((photo, i) => (
                  <motion.div
                    key={photo._id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.06, duration: 0.3 }}
                    className="aspect-square rounded-lg overflow-hidden"
                  >
                    <img
                      src={`${photo.imageUrl}?auto=format&w=200&q=75`}
                      alt={photo.title}
                      className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                      loading="lazy"
                    />
                  </motion.div>
                ))}
              </div>

              <p className="text-[10px] text-white/25 font-mono mt-3">
                {selectedCluster.photos.length} photograph
                {selectedCluster.photos.length !== 1 ? 's' : ''} captured here
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-black/30 backdrop-blur-xl border border-white/[0.06] border-dashed rounded-2xl p-6 text-center"
            >
              <svg
                className="w-8 h-8 mx-auto text-white/15 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <p className="text-white/30 text-sm font-light">
                Select a point on the map
              </p>
              <p className="text-white/15 text-xs mt-1 font-mono">
                {clusters.length} location{clusters.length !== 1 ? 's' : ''}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile: info below map */}
      <div className="sm:hidden mt-4">
        <AnimatePresence mode="wait">
          {selectedCluster && (
            <motion.div
              key={selectedCluster.city}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-gray-50 rounded-2xl p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-light text-gray-900">
                    {selectedCluster.city}
                  </h3>
                  {selectedCluster.country && (
                    <p className="text-gray-400 text-sm mt-0.5">{selectedCluster.country}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-gray-300">
                    <span>{formatCoord(selectedCluster.lat, 'N', 'S')}</span>
                    <span>{formatCoord(selectedCluster.lng, 'E', 'W')}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCluster(null)}
                  className="text-gray-300 hover:text-gray-500 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5 mt-4">
                {selectedCluster.photos.slice(0, 4).map((photo) => (
                  <div key={photo._id} className="aspect-square rounded-lg overflow-hidden">
                    <img
                      src={`${photo.imageUrl}?auto=format&w=200&q=75`}
                      alt={photo.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-300 font-mono mt-3">
                {selectedCluster.photos.length} photograph{selectedCluster.photos.length !== 1 ? 's' : ''}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Exported wrapper with error boundary ───
export default function MapboxMap(props: { photos: Photo[]; mapboxToken: string }) {
  return (
    <MapErrorBoundary>
      <MapboxMapInner {...props} />
    </MapErrorBoundary>
  );
}
