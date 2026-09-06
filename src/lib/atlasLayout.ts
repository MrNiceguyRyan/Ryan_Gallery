export type AtlasPhotoSide = 'left' | 'right';
export type AtlasRouteZone = 'west' | 'central' | 'east';

interface GeographicStop {
  id: string;
  coordinates: [number, number];
}

export interface AtlasLayout {
  photoSide: AtlasPhotoSide;
  routeZone: AtlasRouteZone;
  cameraOffset: [number, number];
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Keeps the geographic point truthful while choosing an editorial safe area
 * for the photograph. A central stop receives its own zone instead of falling
 * through a fixed US longitude split, so future chapters can be inserted
 * anywhere along the route without moving their real coordinates.
 */
export function computeAtlasLayout(
  activeStop: GeographicStop,
  stops: GeographicStop[],
  mobile: boolean,
  viewport: { width: number; height: number },
): AtlasLayout {
  const longitudes = stops.map((stop) => stop.coordinates[0]);
  const minimum = Math.min(...longitudes);
  const maximum = Math.max(...longitudes);
  const span = Math.max(0.0001, maximum - minimum);
  const position = (activeStop.coordinates[0] - minimum) / span;
  const routeZone: AtlasRouteZone = position < 0.38
    ? 'west'
    : position > 0.62
      ? 'east'
      : 'central';

  const activeIndex = Math.max(0, stops.findIndex((stop) => stop.id === activeStop.id));
  const photoSide: AtlasPhotoSide = routeZone === 'west'
    ? 'right'
    : routeZone === 'east'
      ? 'left'
      : activeIndex % 2 === 0
        ? 'right'
        : 'left';

  if (mobile) {
    // The photograph occupies the upper field on a phone. Place the true map
    // marker in the exposed lower band instead of covering it with the image.
    return {
      photoSide,
      routeZone,
      cameraOffset: [0, clamp(viewport.height * 0.16, 104, 150)],
    };
  }

  return {
    photoSide,
    routeZone,
    cameraOffset: [
      viewport.width * (photoSide === 'right' ? -0.23 : 0.27),
      clamp(viewport.height * 0.025, 12, 24),
    ],
  };
}
