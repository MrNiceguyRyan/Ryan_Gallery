import { useState, useMemo, useRef, useCallback, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import MapGL, { Source, Layer, NavigationControl, Popup } from 'react-map-gl/mapbox';
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

// ─── Location clustering (for sidebar) ───
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

// ─── Build GeoJSON for Mapbox native clustering (supercluster) ───
function buildGeoJSON(photos: Photo[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of photos) {
    if (p.location?.lat == null || p.location?.lng == null) continue;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [p.location.lng, p.location.lat],
      },
      properties: {
        id: p._id,
        title: p.title || '',
        imageUrl: p.imageUrl || '',
        city: p.location.city || 'Unknown',
        country: p.location.country || '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

// ─── Stylize map layers ───
function stylizeMap(map: any) {
  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id;
    const type = layer.type;

    if (id.includes('water') && type === 'fill') {
      map.setPaintProperty(id, 'fill-color', '#dce8f0');
    }
    if (id === 'land' || id === 'background') {
      map.setPaintProperty(id, 'background-color', '#f8f7f5');
      if (type === 'fill') map.setPaintProperty(id, 'fill-color', '#f8f7f5');
    }
    if (id.includes('landuse') && type === 'fill') {
      if (id.includes('park') || id.includes('green')) {
        map.setPaintProperty(id, 'fill-color', '#e8efe5');
        map.setPaintProperty(id, 'fill-opacity', 0.6);
      } else if (id.includes('sand') || id.includes('beach')) {
        map.setPaintProperty(id, 'fill-color', '#f0ebe0');
      }
    }
    if (type === 'hillshade') {
      map.setPaintProperty(id, 'hillshade-shadow-color', '#d0cfc8');
      map.setPaintProperty(id, 'hillshade-highlight-color', '#ffffff');
      map.setPaintProperty(id, 'hillshade-exaggeration', 0.3);
    }
    if (id.includes('road') && type === 'line') {
      if (id.includes('highway') || id.includes('motorway') || id.includes('trunk')) {
        map.setPaintProperty(id, 'line-color', '#d4d0c8');
        map.setPaintProperty(id, 'line-width', 1.2);
      } else if (id.includes('major') || id.includes('primary') || id.includes('secondary')) {
        map.setPaintProperty(id, 'line-color', '#ddd9d2');
        map.setPaintProperty(id, 'line-width', 0.8);
      } else {
        map.setPaintProperty(id, 'line-color', '#e8e5e0');
        map.setPaintProperty(id, 'line-width', 0.4);
      }
    }
    if (id.includes('admin') && type === 'line') {
      if (id.includes('0') || id.includes('country')) {
        map.setPaintProperty(id, 'line-color', '#b8b4ac');
        map.setPaintProperty(id, 'line-width', 0.8);
      } else {
        map.setPaintProperty(id, 'line-color', '#d0ccc5');
        map.setPaintProperty(id, 'line-width', 0.4);
      }
    }
    if (id.includes('label') && type === 'symbol') {
      if (id.includes('country')) {
        map.setPaintProperty(id, 'text-color', '#8a857c');
        map.setPaintProperty(id, 'text-halo-color', '#f8f7f5');
        map.setPaintProperty(id, 'text-halo-width', 1.5);
        map.setLayoutProperty(id, 'text-letter-spacing', 0.15);
        map.setLayoutProperty(id, 'text-transform', 'uppercase');
      } else if (id.includes('state') || id.includes('region')) {
        map.setPaintProperty(id, 'text-color', '#a09b93');
        map.setPaintProperty(id, 'text-halo-color', '#f8f7f5');
        map.setPaintProperty(id, 'text-halo-width', 1.2);
        map.setLayoutProperty(id, 'text-letter-spacing', 0.1);
      } else if (id.includes('city') || id.includes('place') || id.includes('town')) {
        map.setPaintProperty(id, 'text-color', '#6b6660');
        map.setPaintProperty(id, 'text-halo-color', '#f8f7f5');
        map.setPaintProperty(id, 'text-halo-width', 1);
      } else {
        map.setPaintProperty(id, 'text-color', '#b0aaa2');
        map.setPaintProperty(id, 'text-halo-color', '#f8f7f5');
        map.setPaintProperty(id, 'text-halo-width', 0.8);
      }
    }
    if (id.includes('building') && type === 'fill') {
      map.setPaintProperty(id, 'fill-color', '#eae7e2');
      map.setPaintProperty(id, 'fill-opacity', 0.5);
    }
    if (id.includes('building') && type === 'fill-extrusion') {
      map.setPaintProperty(id, 'fill-extrusion-color', '#eae7e2');
      map.setPaintProperty(id, 'fill-extrusion-opacity', 0.4);
    }
  }

  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });
  }
}

// ─── Cluster layer styles ───
const clusterCircleLayer: any = {
  id: 'clusters',
  type: 'circle',
  source: 'photos',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': [
      'step',
      ['get', 'point_count'],
      'rgba(59, 130, 246, 0.75)',  // < 10: blue
      10, 'rgba(99, 102, 241, 0.8)', // 10-30: indigo
      30, 'rgba(139, 92, 246, 0.8)', // 30+: violet
    ],
    'circle-radius': [
      'step',
      ['get', 'point_count'],
      22,   // < 10
      10, 28,  // 10-30
      30, 36,  // 30+
    ],
    'circle-stroke-width': 3,
    'circle-stroke-color': 'rgba(255, 255, 255, 0.6)',
    'circle-blur': 0.05,
    // Smooth transitions during zoom
    'circle-radius-transition': { duration: 400 },
    'circle-color-transition': { duration: 400 },
  },
};

const clusterCountLayer: any = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'photos',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
    'text-size': [
      'step',
      ['get', 'point_count'],
      13,
      10, 15,
      30, 17,
    ],
    'text-allow-overlap': true,
  },
  paint: {
    'text-color': '#ffffff',
  },
};

const unclusteredPointLayer: any = {
  id: 'unclustered-point',
  type: 'circle',
  source: 'photos',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': '#1a1a1a',
    'circle-radius': 7,
    'circle-stroke-width': 3,
    'circle-stroke-color': '#ffffff',
    'circle-blur': 0,
    'circle-radius-transition': { duration: 300 },
  },
};

// Outer glow ring for cluster breathing effect
const clusterGlowLayer: any = {
  id: 'cluster-glow',
  type: 'circle',
  source: 'photos',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': 'rgba(59, 130, 246, 0)',
    'circle-radius': [
      'step',
      ['get', 'point_count'],
      30,
      10, 38,
      30, 46,
    ],
    'circle-stroke-width': 2,
    'circle-stroke-color': 'rgba(59, 130, 246, 0.2)',
    'circle-stroke-opacity': 0.6,
  },
};

// ─── Popup info ───
interface PopupInfo {
  lng: number;
  lat: number;
  city: string;
  country: string;
  imageUrl: string;
  title: string;
}

// ─── Main Map Component ───
function MapboxMapInner({
  photos,
  mapboxToken,
}: {
  photos: Photo[];
  mapboxToken: string;
}) {
  const mapRef = useRef<MapRef>(null);
  const [selectedCluster, setSelectedCluster] = useState<LocationCluster | null>(null);
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const clusters = useMemo(() => clusterByLocation(photos), [photos]);
  const geojson = useMemo(() => buildGeoJSON(photos), [photos]);

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
    const map = mapRef.current?.getMap();
    if (map) {
      const applyStyle = () => {
        stylizeMap(map);
        // Change cursor on cluster/point hover
        map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });
      };
      if (map.isStyleLoaded()) applyStyle();
      else map.once('style.load', applyStyle);
    }
  }, []);

  // ── Click on cluster → smooth zoom into bounds (silky split animation) ──
  const handleClusterClick = useCallback((e: any) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    if (!features.length) return;

    const feature = features[0];
    const clusterId = feature.properties?.cluster_id;
    const source = map.getSource('photos') as any;

    // Get cluster expansion zoom, then fly smoothly
    source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
      if (err) return;
      const geometry = feature.geometry as GeoJSON.Point;
      map.flyTo({
        center: geometry.coordinates as [number, number],
        zoom: Math.min(zoom, 14),
        duration: 1200,
        essential: true,
        curve: 1.42, // smooth easing curve
      });
    });

    setPopupInfo(null);
  }, []);

  // ── Click on unclustered point → show popup ──
  const handlePointClick = useCallback((e: any) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const features = map.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] });
    if (!features.length) return;

    const feature = features[0];
    const geometry = feature.geometry as GeoJSON.Point;
    const props = feature.properties!;

    setPopupInfo({
      lng: geometry.coordinates[0],
      lat: geometry.coordinates[1],
      city: props.city,
      country: props.country,
      imageUrl: props.imageUrl,
      title: props.title,
    });
  }, []);

  // ── Combined click handler ──
  const handleMapClick = useCallback((e: any) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Check clusters first
    const clusterFeatures = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    if (clusterFeatures.length) {
      handleClusterClick(e);
      return;
    }

    // Then unclustered points
    const pointFeatures = map.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] });
    if (pointFeatures.length) {
      handlePointClick(e);
      return;
    }

    // Click on empty space → dismiss
    setPopupInfo(null);
    setSelectedCluster(null);
  }, [handleClusterClick, handlePointClick]);

  const flyToCluster = useCallback(
    (cluster: LocationCluster) => {
      const isSame = selectedCluster?.city === cluster.city;
      setSelectedCluster(isSame ? null : cluster);
      setPopupInfo(null);
      if (!isSame) {
        mapRef.current?.flyTo({
          center: [cluster.lng, cluster.lat],
          zoom: 7,
          duration: 1500,
          essential: true,
          curve: 1.42,
        });
      }
    },
    [selectedCluster],
  );

  // Keyboard: Escape to deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCluster(null);
        setPopupInfo(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!mapboxToken) {
    return (
      <div className="h-[500px] md:h-[700px] rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center px-8">
        <p className="text-gray-400 text-sm font-light">Mapbox token not configured</p>
        <p className="text-gray-300 text-xs font-mono mt-2">Set PUBLIC_MAPBOX_TOKEN in .env</p>
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="h-[500px] md:h-[700px] rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-center px-8">
        <p className="text-gray-400 text-sm font-light">No geotagged photos found</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-0 rounded-2xl overflow-hidden shadow-xl border border-gray-100 bg-white">
        {/* Map */}
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
            onClick={handleMapClick}
            onLoad={handleMapLoad}
            maxZoom={16}
            minZoom={1.5}
          >
            <NavigationControl position="bottom-right" showCompass={false} />

            {/* GeoJSON source with native supercluster */}
            <Source
              id="photos"
              type="geojson"
              data={geojson}
              cluster={true}
              clusterMaxZoom={14}
              clusterRadius={60}
            >
              <Layer {...clusterGlowLayer} />
              <Layer {...clusterCircleLayer} />
              <Layer {...clusterCountLayer} />
              <Layer {...unclusteredPointLayer} />
            </Source>

            {/* Popup on unclustered point click */}
            {popupInfo && (
              <Popup
                longitude={popupInfo.lng}
                latitude={popupInfo.lat}
                anchor="bottom"
                closeButton={false}
                closeOnClick={false}
                offset={16}
                className="map-popup-custom"
              >
                <div className="overflow-hidden rounded-xl bg-white min-w-[220px]">
                  {popupInfo.imageUrl && (
                    <div className="relative h-32 w-full overflow-hidden">
                      <img
                        src={`${popupInfo.imageUrl}?auto=format&w=500&q=80`}
                        alt={popupInfo.city}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      <div className="absolute bottom-2 left-3 right-3">
                        <p className="text-[10px] uppercase tracking-widest text-white/70 font-bold">
                          {popupInfo.country}
                        </p>
                        <h3 className="text-sm font-serif italic text-white">
                          {popupInfo.city}
                        </h3>
                      </div>
                    </div>
                  )}
                  {popupInfo.title && (
                    <div className="px-3 py-2">
                      <p className="text-[11px] text-gray-500 truncate">{popupInfo.title}</p>
                    </div>
                  )}
                </div>
              </Popup>
            )}
          </MapGL>
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

// ─── Exported wrapper ───
export default function MapboxMap(props: { photos: Photo[]; mapboxToken: string; showLocationList?: boolean }) {
  return (
    <MapErrorBoundary>
      <MapboxMapInner photos={props.photos} mapboxToken={props.mapboxToken} />
    </MapErrorBoundary>
  );
}
