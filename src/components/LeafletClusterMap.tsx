import { useState, useMemo, useCallback, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Popup, useMap, ZoomControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { Photo } from '../types';

// ─── Error Boundary ───
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class MapErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('LeafletMap error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[50vh] min-h-[300px] md:h-[500px] rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center px-8">
          <p className="text-gray-400 text-sm font-light">Map failed to load</p>
          <p className="text-gray-300 text-xs font-mono mt-2 max-w-sm">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} className="mt-4 px-5 py-2 text-xs font-light tracking-wider rounded-full border border-gray-200 text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-all duration-300">Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Location clustering (group photos by city) ───
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

// ─── Custom marker icon ───
function createPhotoIcon(imageUrl: string, count: number) {
  return L.divIcon({
    html: `<div style="position:relative;width:44px;height:44px;">
      <div style="width:44px;height:44px;border-radius:50%;overflow:hidden;border:3px solid white;box-shadow:0 4px 15px rgba(0,0,0,0.2);">
        <img src="${imageUrl}?auto=format&w=100&h=100&fit=crop&q=75" style="width:100%;height:100%;object-fit:cover;" />
      </div>
      ${count > 1 ? `<div style="position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:50%;background:#1a1a1a;color:white;font-size:9px;font-weight:600;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.2);">${count}</div>` : ''}
    </div>`,
    className: 'custom-marker-icon',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
}

// ─── Custom cluster icon ───
function createClusterIcon(cluster: any) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 44 : count < 50 ? 52 : 60;
  return L.divIcon({
    html: `<div class="cluster-pulse" style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(59,130,246,0.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;color:white;font-size:${count < 10 ? 13 : 14}px;font-weight:700;border:3px solid rgba(255,255,255,0.6);box-shadow:0 8px 25px rgba(59,130,246,0.35);letter-spacing:0.02em;">
      ${count}
    </div>`,
    className: 'custom-cluster-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ─── Map fly-to controller ───
function MapController({ center, zoom }: { center: [number, number] | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom, { duration: 1.5, easeLinearity: 0.25 });
    }
  }, [center, zoom, map]);
  return null;
}

// ─── Main inner component ───
function LeafletClusterMapInner({ photos }: { photos: Photo[] }) {
  const clusters = useMemo(() => clusterByLocation(photos), [photos]);
  const [selectedCluster, setSelectedCluster] = useState<LocationCluster | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ center: [number, number]; zoom: number } | null>(null);

  const handleSelectCluster = useCallback(
    (cluster: LocationCluster) => {
      const isSame = selectedCluster?.city === cluster.city;
      if (isSame) {
        setSelectedCluster(null);
        setFlyTarget(null);
      } else {
        setSelectedCluster(cluster);
        setFlyTarget({ center: [cluster.lat, cluster.lng], zoom: 8 });
      }
    },
    [selectedCluster],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCluster(null);
        setFlyTarget(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (clusters.length === 0) {
    return (
      <div className="h-[500px] md:h-[700px] rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center px-8">
        <p className="text-gray-400 text-sm font-light">No geotagged photos found</p>
      </div>
    );
  }

  // Calculate initial bounds
  const initialCenter: [number, number] = clusters.length === 1
    ? [clusters[0].lat, clusters[0].lng]
    : [39.8, -98.6]; // Center of USA
  const initialZoom = clusters.length === 1 ? 6 : 4;

  return (
    <div>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-0 rounded-2xl overflow-hidden shadow-xl border border-gray-100 bg-white">
        {/* Map */}
        <div className="relative w-full lg:flex-1 h-[50vh] min-h-[300px] md:h-[500px] lg:h-[650px]">
          <MapContainer
            center={initialCenter}
            zoom={initialZoom}
            scrollWheelZoom={true}
            className="w-full h-full"
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            <ZoomControl position="bottomright" />

            <MarkerClusterGroup
              chunkedLoading
              spiderfyOnMaxZoom={true}
              iconCreateFunction={createClusterIcon}
              showCoverageOnHover={false}
              maxClusterRadius={50}
              zoomToBoundsOnClick={true}
              animate={true}
            >
              {clusters.map((cluster) => (
                <Marker
                  key={cluster.city}
                  position={[cluster.lat, cluster.lng]}
                  icon={createPhotoIcon(cluster.photos[0].imageUrl, cluster.photos.length)}
                  eventHandlers={{
                    click: () => handleSelectCluster(cluster),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -24]} opacity={1}>
                    {cluster.city}
                  </Tooltip>
                  <Popup closeButton={false} minWidth={260} maxWidth={300}>
                    <div className="overflow-hidden rounded-xl bg-white">
                      <div className="relative h-36 w-full overflow-hidden">
                        <img
                          src={`${cluster.photos[0].imageUrl}?auto=format&w=600&q=80`}
                          alt={cluster.city}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-3 left-4 right-4">
                          <p className="text-[10px] uppercase tracking-widest text-white/70 font-bold">
                            {cluster.country}
                          </p>
                          <h3 className="text-base font-serif italic text-white">
                            {cluster.city}
                          </h3>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-4 gap-1.5 mb-3">
                          {cluster.photos.slice(0, 4).map((photo) => (
                            <div key={photo._id} className="aspect-square rounded-md overflow-hidden">
                              <img
                                src={`${photo.imageUrl}?auto=format&w=100&q=75`}
                                alt={photo.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-gray-400 font-mono">
                          {cluster.photos.length} photos · {formatCoord(cluster.lat, 'N', 'S')}
                        </p>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>

            <MapController
              center={flyTarget?.center ?? null}
              zoom={flyTarget?.zoom ?? initialZoom}
            />
          </MapContainer>

          {/* Floating label */}
          <div className="absolute top-6 left-6 z-[1000] pointer-events-none">
            <div className="bg-white/80 backdrop-blur-xl px-5 py-2.5 rounded-xl shadow-lg border border-white/30">
              <h2 className="text-[9px] uppercase tracking-[0.3em] font-black text-black/35 mb-0.5">Journal Gallery</h2>
              <p className="text-sm font-serif italic text-black/80">Global Footprints</p>
            </div>
          </div>
        </div>

        {/* Desktop sidebar: city list */}
        <div className="hidden lg:flex flex-col w-[340px] border-l border-gray-100 bg-white">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[10px] tracking-[0.3em] text-gray-400 uppercase font-light">Locations</p>
            <p className="text-xs text-gray-300 font-mono mt-1">{clusters.length} cities · {photos.length} photos</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {clusters.map((cluster) => {
              const isSelected = selectedCluster?.city === cluster.city;
              return (
                <button
                  key={cluster.city}
                  onClick={() => handleSelectCluster(cluster)}
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

      {/* Mobile: city list below map */}
      <div className="lg:hidden mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {clusters.map((cluster) => {
          const isSelected = selectedCluster?.city === cluster.city;
          return (
            <button
              key={cluster.city}
              onClick={() => handleSelectCluster(cluster)}
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
export default function LeafletClusterMap({ photos }: { photos: Photo[] }) {
  return (
    <MapErrorBoundary>
      <LeafletClusterMapInner photos={photos} />
    </MapErrorBoundary>
  );
}
