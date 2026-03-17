import { useState, useMemo, useRef, useCallback } from 'react';
import MapGL, { Marker, NavigationControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { motion, AnimatePresence } from 'framer-motion';
import type { Photo } from '../types';
import 'mapbox-gl/dist/mapbox-gl.css';

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

// ─── Component ───
export default function MapboxMap({
  photos,
  mapboxToken,
}: {
  photos: Photo[];
  mapboxToken: string;
}) {
  const mapRef = useRef<MapRef>(null);
  const [selectedCluster, setSelectedCluster] = useState<LocationCluster | null>(null);
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

  if (clusters.length === 0) return null;

  return (
    <div className="relative">
      {/* Map */}
      <div className="h-[500px] md:h-[650px] rounded-2xl overflow-hidden shadow-lg">
        <MapGL
          ref={mapRef}
          initialViewState={{
            longitude: clusters.length === 1 ? clusters[0].lng : 0,
            latitude: clusters.length === 1 ? clusters[0].lat : 30,
            zoom: clusters.length === 1 ? 5 : 1.5,
          }}
          mapboxAccessToken={mapboxToken}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
          onClick={() => setSelectedCluster(null)}
        >
          <NavigationControl position="bottom-right" showCompass={false} />

          {clusters.map((cluster, i) => {
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

      {/* Floating Info Panel */}
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
                <span>{selectedCluster.lat.toFixed(4)}°N</span>
                <span>
                  {Math.abs(selectedCluster.lng).toFixed(4)}°
                  {selectedCluster.lng >= 0 ? 'E' : 'W'}
                </span>
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
                </div>
                <button
                  onClick={() => setSelectedCluster(null)}
                  className="text-gray-300 hover:text-gray-500 transition-colors"
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
