export type GeoCoordinate = [number, number];

const toVector = ([longitude, latitude]: GeoCoordinate) => {
  const lambda = (longitude * Math.PI) / 180;
  const phi = (latitude * Math.PI) / 180;
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)] as const;
};

export function angularDistance(from: GeoCoordinate, to: GeoCoordinate) {
  const a = toVector(from);
  const b = toVector(to);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot);
}

/** Initial great-circle heading, clockwise from north, in [-180, 180). */
export function initialBearing(from: GeoCoordinate, to: GeoCoordinate): number {
  const fromLatitude = (from[1] * Math.PI) / 180;
  const toLatitude = (to[1] * Math.PI) / 180;
  const longitudeDelta = ((to[0] - from[0]) * Math.PI) / 180;
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  // Coincident points (including equivalent longitudes at a pole) have no
  // travel direction. Antipodal points are similarly ambiguous.
  if (Math.hypot(x, y) < 1e-12) return 0;
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  return ((degrees + 540) % 360) - 180;
}

/** A single point on the shortest spherical arc between two coordinates. */
export function greatCirclePoint(from: GeoCoordinate, to: GeoCoordinate, progress: number): GeoCoordinate {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  if (clamped === 0) return from;
  if (clamped === 1) return to;

  const a = toVector(from);
  const b = toVector(to);
  const omega = angularDistance(from, to);
  if (omega < 0.00001) return from;

  const sinOmega = Math.sin(omega);
  // Antipodal points do not have one unique shortest arc. The archive does not
  // currently contain one, but normalized vector interpolation keeps a future
  // bad pair finite instead of feeding NaN into Mapbox.
  if (Math.abs(sinOmega) < 0.00001) {
    const x = a[0] + (b[0] - a[0]) * clamped;
    const y = a[1] + (b[1] - a[1]) * clamped;
    const z = a[2] + (b[2] - a[2]) * clamped;
    const magnitude = Math.sqrt(x * x + y * y + z * z) || 1;
    return [
      (Math.atan2(y / magnitude, x / magnitude) * 180) / Math.PI,
      (Math.asin(Math.max(-1, Math.min(1, z / magnitude))) * 180) / Math.PI,
    ];
  }

  const scaleA = Math.sin((1 - clamped) * omega) / sinOmega;
  const scaleB = Math.sin(clamped * omega) / sinOmega;
  const x = scaleA * a[0] + scaleB * b[0];
  const y = scaleA * a[1] + scaleB * b[1];
  const z = scaleA * a[2] + scaleB * b[2];
  return [
    (Math.atan2(y, x) * 180) / Math.PI,
    (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI,
  ];
}

export function greatCircle(from: GeoCoordinate, to: GeoCoordinate, count = 40): GeoCoordinate[] {
  if (angularDistance(from, to) < 0.00001) return [from, to];
  const steps = Math.max(1, Math.floor(count));
  return Array.from({ length: steps + 1 }, (_, index) =>
    greatCirclePoint(from, to, index / steps),
  );
}

export function routeCoordinates<T extends { coordinates: GeoCoordinate }>(
  stops: T[],
  endIndex = stops.length - 1,
): GeoCoordinate[] {
  const limit = Math.min(endIndex, stops.length - 1);
  if (limit <= 0) return stops[0] ? [stops[0].coordinates] : [];
  const coordinates: GeoCoordinate[] = [];
  for (let index = 0; index < limit; index += 1) {
    const segment = greatCircle(stops[index].coordinates, stops[index + 1].coordinates);
    coordinates.push(...(index === 0 ? segment : segment.slice(1)));
  }
  return coordinates;
}
