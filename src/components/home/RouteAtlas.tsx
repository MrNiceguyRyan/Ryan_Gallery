import { useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, Marker, Source } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import {
  AnimatePresence,
  animate,
  cancelFrame,
  frame,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
  type Process,
} from 'framer-motion';
import { getMapboxToken } from '../../config/mapbox';
import { isAtlasInterfaceReady, scheduleAtlasIdleFallback } from '../../lib/atlasReadiness';
import { ARCHIVE_ENTRANCE_PHASES, entrancePhase } from '../../lib/archiveEntrance';
import {
  angularDistance,
  greatCirclePoint,
  initialBearing,
  routeCoordinates,
  type GeoCoordinate,
} from '../../lib/routeGeometry';

export interface RouteStop {
  id: string;
  name: string;
  slug: string;
  coordinates: [number, number];
  imageUrl: string;
  frameCount: number;
  year?: number | string;
  locationLabel?: string;
  coordinateLabel: string;
}

interface Props {
  stops: RouteStop[];
  activeIndex: number;
  /** Fractional index in `chapterIds` order, not necessarily the filtered stops. */
  chapterProgress?: MotionValue<number>;
  /** Full ordered chapter IDs; stops without valid coordinates are skipped by ID. */
  chapterIds?: string[];
  /** Optional 0–1 handoff from the opener into the classic atlas. */
  entryProgress?: MotionValue<number>;
  reducedMotion: boolean;
  mobile?: boolean;
  paused?: boolean;
  presentation?: 'classic' | 'living';
  /** Select a stop in the classic rail and move focus to its chapter. */
  onNavigate?: (chapterId: string) => void;
  /** Temporarily links a desktop classic photograph to its map and rail stop. */
  engagedChapterId?: string | null;
}

interface ProjectedPoint {
  id?: string;
  x: number;
  y: number;
}

interface ChapterRouteStop {
  stop: RouteStop;
  stopIndex: number;
  chapterIndex: number;
  routeProgress: number;
}

interface ChapterSample {
  position: number;
  from: ChapterRouteStop;
  to: ChapterRouteStop;
  localProgress: number;
  easedProgress: number;
  coordinate: GeoCoordinate;
  routeProgress: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const ACCENT = '#D2FF00';
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';
const US_OVERVIEW = { longitude: -97.7, latitude: 38.3, zoom: 3.15, bearing: -3, pitch: 0 };
const LIVING_OVERVIEW = { longitude: -98.5, latitude: 37.5, zoom: 4.05, bearing: 0, pitch: 0 };
const CLASSIC_INTERFACE_STAGGER = 0.025;
const CLASSIC_INTERFACE_ACCESSIBLE_ENTRY = ARCHIVE_ENTRANCE_PHASES.interface[0] +
  CLASSIC_INTERFACE_STAGGER +
  (ARCHIVE_ENTRANCE_PHASES.interface[1] - ARCHIVE_ENTRANCE_PHASES.interface[0]) * 0.62;

function lineFeature(coordinates: [number, number][]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates },
  };
}

function encodePolyline(coordinates: [number, number][]) {
  let previousLatitude = 0;
  let previousLongitude = 0;
  let encoded = '';

  const encodeValue = (value: number) => {
    let shifted = value < 0 ? ~(value << 1) : value << 1;
    let result = '';
    while (shifted >= 0x20) {
      result += String.fromCharCode((0x20 | (shifted & 0x1f)) + 63);
      shifted >>= 5;
    }
    return result + String.fromCharCode(shifted + 63);
  };

  coordinates.forEach(([longitude, latitude]) => {
    const nextLatitude = Math.round(latitude * 1e5);
    const nextLongitude = Math.round(longitude * 1e5);
    encoded += encodeValue(nextLatitude - previousLatitude);
    encoded += encodeValue(nextLongitude - previousLongitude);
    previousLatitude = nextLatitude;
    previousLongitude = nextLongitude;
  });
  return encoded;
}

function staticAtlasUrl(coordinates: [number, number][], token: string, mobile: boolean) {
  if (!token || coordinates.length < 2) return '';
  const route = encodeURIComponent(encodePolyline(coordinates));
  const camera = mobile ? '-98.5,37.5,2.75,0' : '-98.5,37.5,4.05,0';
  const size = mobile ? '960x960@2x' : '1280x720@2x';
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/path-3+d2ff00-0.92(${route})/${camera}/${size}?access_token=${encodeURIComponent(token)}`;
}

function graticuleFeature() {
  const coordinates: [number, number][][] = [];
  for (let longitude = -130; longitude <= -60; longitude += 10) {
    coordinates.push([
      [longitude, 20],
      [longitude, 60],
    ]);
  }
  for (let latitude = 20; latitude <= 60; latitude += 10) {
    coordinates.push([
      [-130, latitude],
      [-60, latitude],
    ]);
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'MultiLineString' as const, coordinates },
  };
}

const NORTH_AMERICA_GRATICULE = graticuleFeature();

const smootherstep = (progress: number) =>
  progress * progress * progress * (progress * (progress * 6 - 15) + 10);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function isValidCoordinate(coordinates: unknown): coordinates is GeoCoordinate {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return false;
  const [longitude, latitude] = coordinates;
  return Number.isFinite(longitude) && Number.isFinite(latitude) &&
    longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

function buildChapterRoute(stops: RouteStop[], chapterIds?: string[]) {
  const orderedIds = chapterIds?.length ? chapterIds : stops.map((stop) => stop.id);
  const chapterIndexById = new Map<string, number>();
  orderedIds.forEach((id, index) => {
    if (id && !chapterIndexById.has(id)) chapterIndexById.set(id, index);
  });

  const seenIds = new Set<string>();
  const seenChapterIndices = new Set<number>();
  const route = stops.flatMap((stop, stopIndex) => {
    const chapterIndex = chapterIndexById.get(stop.id);
    if (
      chapterIndex == null ||
      !stop.id ||
      seenIds.has(stop.id) ||
      seenChapterIndices.has(chapterIndex) ||
      !isValidCoordinate(stop.coordinates)
    ) return [];
    seenIds.add(stop.id);
    seenChapterIndices.add(chapterIndex);
    return [{ stop, stopIndex, chapterIndex }];
  }).sort((a, b) => a.chapterIndex - b.chapterIndex);

  if (!route.length) return [];
  const segmentLengths = route.slice(1).map((entry, index) =>
    angularDistance(route[index].stop.coordinates, entry.stop.coordinates),
  );
  const total = segmentLengths.reduce((sum, length) => sum + length, 0);
  let travelled = 0;
  return route.map<ChapterRouteStop>((entry, index) => {
    if (index > 0) travelled += segmentLengths[index - 1];
    return {
      ...entry,
      routeProgress: total > 0 ? travelled / total : index / Math.max(1, route.length - 1),
    };
  });
}

/** One authoritative optical sample for camera, route, names, coordinates and markers. */
function sampleChapter(
  route: ChapterRouteStop[],
  chapterPosition: number,
  reducedMotion: boolean,
): ChapterSample | null {
  if (!route.length) return null;
  const first = route[0];
  const last = route.at(-1)!;
  const finitePosition = Number.isFinite(chapterPosition) ? chapterPosition : first.chapterIndex;
  const position = Math.max(first.chapterIndex, Math.min(last.chapterIndex, finitePosition));

  let from = first;
  let to = first;
  for (let index = 1; index < route.length; index += 1) {
    to = route[index];
    if (position <= to.chapterIndex) break;
    from = to;
  }
  if (position >= last.chapterIndex) from = to = last;

  const span = Math.max(1, to.chapterIndex - from.chapterIndex);
  const rawLocal = from === to ? 0 : clamp01((position - from.chapterIndex) / span);
  if (reducedMotion) {
    const snapped = rawLocal < 0.5 ? from : to;
    return {
      position: snapped.chapterIndex,
      from: snapped,
      to: snapped,
      localProgress: 0,
      easedProgress: 0,
      coordinate: snapped.stop.coordinates,
      routeProgress: snapped.routeProgress,
      zoom: 4.72,
      pitch: 0,
      bearing: -2,
    };
  }

  // Keep photographic emphasis soft, but let geography retain most of the
  // direct scroll velocity. Applying the full quintic curve to the camera made
  // every leg stick at both cities and then rush through its midpoint.
  const easedProgress = smootherstep(rawLocal);
  const travelProgress = rawLocal * 0.86 + easedProgress * 0.14;
  const distance = angularDistance(from.stop.coordinates, to.stop.coordinates);
  const distanceZoomOut = Math.min(0.68, (distance / 0.55) * 0.68);
  // One continuous optical breath replaces the old departure plateau/arrival
  // plateau pair. It is symmetric, reversible and has no hidden flat section.
  const lift = Math.sin(Math.PI * rawLocal);
  const travelLift = lift * lift;
  // An oblique, north-legible flight instead of a target sliding over a flat
  // map. Every leg returns to the same pose with zero angular velocity, so
  // neighbouring headings cannot whip the camera around at a chapter boundary.
  const bank = Math.sin(initialBearing(from.stop.coordinates, to.stop.coordinates) * Math.PI / 180) * 14;
  return {
    position,
    from,
    to,
    localProgress: rawLocal,
    easedProgress,
    coordinate: greatCirclePoint(from.stop.coordinates, to.stop.coordinates, travelProgress),
    routeProgress: from.routeProgress + (to.routeProgress - from.routeProgress) * travelProgress,
    zoom: 5.05 - travelLift * distanceZoomOut,
    pitch: 42 + travelLift * 16,
    bearing: -2 + travelLift * bank,
  };
}

function chapterWeight(sample: ChapterSample | null, stopId: string) {
  if (!sample) return 0;
  if (sample.from.stop.id === sample.to.stop.id) return sample.from.stop.id === stopId ? 1 : 0;
  if (sample.from.stop.id === stopId) return 1 - sample.easedProgress;
  if (sample.to.stop.id === stopId) return sample.easedProgress;
  return 0;
}

function stopVisualState(sample: ChapterSample | null, entry: ChapterRouteStop) {
  const focus = chapterWeight(sample, entry.stop.id);
  let passed = 0;
  if (sample) {
    if (entry.chapterIndex < sample.from.chapterIndex) passed = 1;
    else if (entry.stop.id === sample.from.stop.id && sample.from !== sample.to) {
      passed = sample.easedProgress;
    }
  }
  return { focus, accent: Math.max(focus, passed * 0.32) };
}

function useRouteStopLighting(sample: MotionValue<ChapterSample | null>, entry: ChapterRouteStop) {
  const state = useTransform(sample, (current) => stopVisualState(current, entry));
  const focus = useTransform(state, (current) => current.focus);
  const accent = useTransform(state, (current) => current.accent);
  return { focus, accent };
}

function useFocusLockProgress(focusLocked: boolean, reducedMotion: boolean) {
  const progress = useMotionValue(focusLocked ? 1 : 0);

  useEffect(() => {
    const target = focusLocked ? 1 : 0;
    if (reducedMotion) {
      progress.set(target);
      return;
    }
    const controls = animate(progress, target, {
      duration: target ? 0.28 : 0.42,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [focusLocked, progress, reducedMotion]);

  return progress;
}

const projectedPointsMatch = (current: ProjectedPoint[], next: ProjectedPoint[]) =>
  current.length === next.length && current.every((point, index) => {
    const candidate = next[index];
    return candidate !== undefined &&
      point.id === candidate.id &&
      Math.abs(point.x - candidate.x) < 0.05 &&
      Math.abs(point.y - candidate.y) < 0.05;
  });

function formatCoordinate(value: number, positive: string, negative: string) {
  const normalized = Math.abs(value) < 0.00005 ? 0 : value;
  return `${Math.abs(normalized).toFixed(4)}° ${normalized >= 0 ? positive : negative}`;
}

function formatCoordinateLabel([longitude, latitude]: [number, number]) {
  return `${formatCoordinate(latitude, 'N', 'S')}  ·  ${formatCoordinate(longitude, 'E', 'W')}`;
}

function ScrubbedCoordinateReadout({ sample }: { sample: MotionValue<ChapterSample | null> }) {
  const latitudeRef = useRef<HTMLSpanElement>(null);
  const longitudeRef = useRef<HTMLSpanElement>(null);
  const write = (next: ChapterSample | null) => {
    if (!next) return;
    const [longitude, latitude] = next.coordinate;
    if (latitudeRef.current) latitudeRef.current.textContent = formatCoordinate(latitude, 'N', 'S');
    if (longitudeRef.current) longitudeRef.current.textContent = formatCoordinate(longitude, 'E', 'W');
  };

  useMotionValueEvent(sample, 'change', write);
  useEffect(() => write(sample.get()), [sample]);

  const [longitude, latitude] = sample.get()?.coordinate ?? [US_OVERVIEW.longitude, US_OVERVIEW.latitude];
  return (
    <span
      aria-hidden="true"
      className="mx-auto inline-grid grid-cols-[10.5ch_auto_11.5ch] items-center gap-2 whitespace-nowrap tabular-nums"
    >
      <span ref={latitudeRef} className="text-right">{formatCoordinate(latitude, 'N', 'S')}</span>
      <span aria-hidden="true">·</span>
      <span ref={longitudeRef} className="text-left">{formatCoordinate(longitude, 'E', 'W')}</span>
    </span>
  );
}

function ScrubbedPlaceName({
  stop,
  sample,
}: {
  stop: RouteStop;
  sample: MotionValue<ChapterSample | null>;
}) {
  const opacity = useTransform(sample, (current) => chapterWeight(current, stop.id));
  const y = useTransform(sample, (current) => {
    if (!current) return 0;
    if (current.to.stop.id === stop.id) return (1 - current.easedProgress) * 3;
    if (current.from.stop.id === stop.id) return current.easedProgress * -3;
    return 0;
  });
  return (
    <motion.span className="absolute inset-0 block whitespace-nowrap" style={{ opacity, y }}>
      {stop.name}
    </motion.span>
  );
}

function ScrubbedRouteStop({
  entry,
  index,
  sample,
  semanticActive,
  mobile,
  onNavigate,
  focusLocked,
  reducedMotion,
}: {
  entry: ChapterRouteStop;
  index: number;
  sample: MotionValue<ChapterSample | null>;
  semanticActive: boolean;
  mobile: boolean;
  onNavigate?: (chapterId: string) => void;
  focusLocked: boolean;
  reducedMotion: boolean;
}) {
  // Both the rail and geographic waypoint read this same lighting state,
  // including routes that bridge chapters without coordinates. Hysteresis is
  // retained only for the semantic announcement, never for visual brightness.
  const { focus, accent } = useRouteStopLighting(sample, entry);
  const focusLockProgress = useFocusLockProgress(focusLocked, reducedMotion);
  const visualFocus = useTransform(
    [focus, focusLockProgress],
    ([chapterFocus, lock]) => clamp01(chapterFocus + (1 - chapterFocus) * lock * 0.34),
  );
  const dotScale = useTransform(focus, [0, 1], [0.92, 1.08]);
  const dotBorderColor = useTransform(
    [accent, focusLockProgress],
    ([strength, lock]) => `rgba(210, 255, 0, ${0.24 + clamp01(strength + lock * 0.2) * 0.76})`,
  );
  const dotCoreScale = useTransform(focus, [0, 1], [0.62, 1]);
  const labelOpacity = useTransform(
    visualFocus,
    (strength) => mobile ? strength : 0.5 + strength * 0.5,
  );
  const labelX = useTransform(focus, [0, 1], [-2, 0]);
  const labelColor = useTransform(visualFocus, (strength) => {
    const red = Math.round(244 + (210 - 244) * strength);
    const green = Math.round(244 + (255 - 244) * strength);
    const blue = Math.round(237 + (0 - 237) * strength);
    return `rgba(${red}, ${green}, ${blue}, ${0.68 + strength * 0.32})`;
  });

  return (
    <motion.button
      type="button"
      onClick={() => onNavigate?.(entry.stop.id)}
      disabled={!onNavigate}
      aria-current={semanticActive ? 'step' : undefined}
      aria-label={`Go to ${entry.stop.name} story`}
      data-route-rail-stop={entry.stop.id}
      data-route-focus-locked={focusLocked ? 'true' : undefined}
      className={`route-atlas-stop relative flex w-full items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D2FF00] disabled:cursor-default ${mobile ? 'py-2' : 'py-3.5'}`}
    >
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-2 inset-y-1 bg-[linear-gradient(90deg,rgba(210,255,0,0.075),rgba(210,255,0,0.018)_48%,transparent_88%)]"
        style={{ opacity: focusLockProgress }}
      />
      <motion.span
        aria-hidden="true"
        className="relative z-10 h-[15px] w-[15px] shrink-0 rounded-full border bg-[#171a15]"
        style={{ scale: dotScale, borderColor: dotBorderColor }}
      >
        <motion.span
          className="absolute inset-[4px] rounded-full bg-[#D2FF00]"
          data-route-accent="true"
          style={{ opacity: accent, scale: dotCoreScale }}
        />
        <motion.span
          className="absolute inset-[5px] rounded-full bg-[#F0F3DF]"
          data-route-focus="true"
          style={{ opacity: focus }}
        />
      </motion.span>
      <motion.span
        className="min-w-0"
        style={{ opacity: labelOpacity, x: labelX, color: labelColor }}
      >
        <span className="block font-ui text-[10px] uppercase tracking-[0.2em]">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="mt-1 block truncate font-ui text-[11px] uppercase tracking-[0.22em]">
          {entry.stop.name}
        </span>
      </motion.span>
    </motion.button>
  );
}

function ScrubbedRouteOrdinal({
  sample,
  route,
  includeTotal = false,
  className,
}: {
  sample: MotionValue<ChapterSample | null>;
  route: ChapterRouteStop[];
  includeTotal?: boolean;
  className?: string;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const formatValue = (current: ChapterSample | null) => {
    if (!current || !route.length) {
      return includeTotal ? `00 / ${String(route.length).padStart(2, '0')}` : '00';
    }
    const visualStop = current.from.stop.id === current.to.stop.id || current.easedProgress < 0.5
      ? current.from
      : current.to;
    const routeIndex = route.findIndex((entry) => entry.stop.id === visualStop.stop.id);
    const ordinal = routeIndex >= 0 ? String(routeIndex + 1).padStart(2, '0') : '00';
    return includeTotal ? `${ordinal} / ${String(route.length).padStart(2, '0')}` : ordinal;
  };
  const write = (current: ChapterSample | null) => {
    if (valueRef.current) valueRef.current.textContent = formatValue(current);
  };

  useMotionValueEvent(sample, 'change', write);
  useEffect(() => write(sample.get()), [sample, route, includeTotal]);

  return (
    <span ref={valueRef} className={className}>
      {formatValue(sample.get())}
    </span>
  );
}

function LivingMarkerNode({
  stop,
  index,
  stops,
  chapterProgress,
  interfaceVisible,
  reducedMotion,
  mobile,
  playInterfaceIntro,
}: {
  stop: RouteStop;
  index: number;
  stops: RouteStop[];
  chapterProgress: MotionValue<number>;
  interfaceVisible: boolean;
  reducedMotion: boolean;
  mobile: boolean;
  playInterfaceIntro: boolean;
}) {
  const emphasis = useTransform(chapterProgress, (chapterPosition) => {
    const distance = Math.abs(chapterPosition - index);
    return smootherstep(Math.max(0, Math.min(1, 1 - distance)));
  });
  const passed = useTransform(chapterProgress, (chapterPosition) =>
    smootherstep(Math.max(0, Math.min(1, chapterPosition - index))),
  );
  const accentStrength = useTransform([emphasis, passed], ([emphasisValue, passedValue]) =>
    Math.max(emphasisValue, passedValue * 0.42),
  );
  const haloOpacity = useTransform(emphasis, [0, 1], [0, 1]);
  const haloScale = useTransform(emphasis, [0, 1], [0.7, 1]);
  const ringOpacity = useTransform(emphasis, [0, 0.15, 1], [0, 0.1, 0.58]);
  const ringScale = useTransform(emphasis, [0, 1], [0.76, 1.08]);
  const dotScale = useTransform(emphasis, [0, 1], [1, 1.4]);
  const dotBorderColor = useTransform(
    accentStrength,
    (strength) => `rgba(210, 255, 0, ${0.25 + strength * 0.75})`,
  );
  const dotBackgroundColor = useTransform(
    accentStrength,
    (strength) => `rgba(210, 255, 0, ${0.035 + strength * 0.965})`,
  );
  const dotShadow = useTransform(
    emphasis,
    (strength) => `0 0 ${2 + strength * 12}px rgba(210, 255, 0, ${strength * 0.86})`,
  );
  const labelOpacity = useTransform(
    emphasis,
    (strength) => mobile ? strength : 0.56 + strength * 0.44,
  );
  const labelOffset = useTransform(emphasis, (strength) => (1 - strength) * 3);
  const labelColor = useTransform(
    emphasis,
    (strength) => `rgba(244, 244, 237, ${0.58 + strength * 0.42})`,
  );
  const indexColor = useTransform(
    emphasis,
    (strength) => `rgba(210, 255, 0, ${0.48 + strength * 0.52})`,
  );
  const nearbyStops = stops
    .filter((candidate) => angularDistance(candidate.coordinates, stop.coordinates) < 0.038)
    .sort((a, b) => b.coordinates[1] - a.coordinates[1]);
  const clusterRank = nearbyStops.findIndex((candidate) => candidate.id === stop.id);
  const clusterOffset = !mobile && nearbyStops.length > 1
    ? Math.max(-54, Math.min(54, (clusterRank - (nearbyStops.length - 1) / 2) * 36))
    : 0;
  const labelOnLeft =
    (stop.coordinates[0] > -90 && (mobile || stop.coordinates[1] > 35)) ||
    (!mobile && nearbyStops.length > 1 && clusterRank === 0);
  const labelX = useTransform(labelOffset, (offset) => labelOnLeft ? -offset : offset);

  return (
    <motion.span
      aria-hidden="true"
      data-route-stop={stop.id}
      initial={false}
      animate={interfaceVisible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.72 }}
      transition={{
        duration: reducedMotion ? 0 : playInterfaceIntro ? 0.56 : 0.32,
        delay: reducedMotion || !playInterfaceIntro ? 0 : 0.18 + index * 0.035,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="relative flex h-11 w-11 items-center justify-center"
    >
      <motion.span
        className="pointer-events-none absolute h-16 w-16 rounded-full bg-[radial-gradient(circle,rgba(210,255,0,0.16)_0%,rgba(210,255,0,0.055)_34%,transparent_72%)] blur-[2px]"
        style={{ opacity: haloOpacity, scale: haloScale }}
      />
      {!reducedMotion && (
        <motion.span
          className="absolute h-12 w-12 rounded-full border border-[#D2FF00]/45"
          style={{ opacity: ringOpacity, scale: ringScale }}
        />
      )}
      <motion.span
        className="relative block h-2.5 w-2.5 rounded-full border"
        style={{
          scale: dotScale,
          borderColor: dotBorderColor,
          backgroundColor: dotBackgroundColor,
          boxShadow: dotShadow,
        }}
      />
      {interfaceVisible && (
        <motion.span
          style={{
            top: `calc(50% + ${clusterOffset}px)`,
            opacity: labelOpacity,
            x: labelX,
            color: labelColor,
          }}
          className={`pointer-events-none absolute top-1/2 min-w-max -translate-y-1/2 whitespace-nowrap font-ui text-[10px] uppercase tracking-[0.2em] ${labelOnLeft ? 'right-[2.15rem] text-right' : 'left-[2.15rem]'}`}
        >
          <motion.span className="mr-[10px] inline-block text-[8px]" style={{ color: indexColor }}>
            {String(index + 1).padStart(2, '0')}
          </motion.span>
          {stop.name}
        </motion.span>
      )}
    </motion.span>
  );
}

function ClassicMarkerNode({
  entry,
  sample,
  visibility,
  focusLocked,
  reducedMotion,
}: {
  entry: ChapterRouteStop;
  sample: MotionValue<ChapterSample | null>;
  visibility: MotionValue<number>;
  focusLocked: boolean;
  reducedMotion: boolean;
}) {
  const { focus, accent } = useRouteStopLighting(sample, entry);
  const dotScale = useTransform(focus, [0, 1], [0.82, 1]);
  const focusLockProgress = useFocusLockProgress(focusLocked, reducedMotion);
  const focusLockScale = useTransform(
    focusLockProgress,
    [0, 1],
    reducedMotion ? [1, 1] : [1, 1.1],
  );
  const focusLockHaloOpacity = useTransform(
    focusLockProgress,
    (progress) => reducedMotion ? 0 : progress * 0.28,
  );
  const focusLockHaloScale = useTransform(
    focusLockProgress,
    [0, 1],
    reducedMotion ? [1, 1] : [0.78, 1],
  );
  const focusLockContrast = useTransform(focusLockProgress, [0, 1], [0, 0.72]);

  return (
    <motion.span
      aria-hidden="true"
      data-route-stop={entry.stop.id}
      data-route-focus-locked={focusLocked ? 'true' : undefined}
      initial={false}
      style={{ opacity: visibility }}
      className="relative flex h-11 w-11 items-center justify-center"
    >
      {/* Small geographic anchors stay on the map. Camera perspective now
          carries the journey; no screen-fixed focus ring competes with it. */}
      <motion.span
        className="route-waypoint relative block h-[22px] w-[22px] rounded-full"
        style={{ scale: focusLockScale }}
      >
        <motion.span
          className="pointer-events-none absolute inset-[-8px] rounded-full bg-[radial-gradient(circle,rgba(210,255,0,0.28)_0%,rgba(210,255,0,0.08)_38%,transparent_72%)]"
          style={{ opacity: focusLockHaloOpacity, scale: focusLockHaloScale }}
        />
        <motion.span className="absolute inset-0 rounded-full" style={{ scale: dotScale }}>
          <span className="absolute inset-0 rounded-full border border-[#E0E7CE]/60 bg-[#253021] shadow-[0_2px_6px_rgba(7,13,5,0.6)]" />
          <motion.span
            className="absolute inset-[3px] rounded-full bg-[#C3D78B]"
            data-route-accent="true"
            style={{ opacity: accent }}
          />
          <motion.span
            className="absolute inset-[6px] rounded-full bg-[#F0F3DF]"
            data-route-focus="true"
            style={{ opacity: focus }}
          />
          <motion.span
            className="absolute inset-[1px] rounded-full border border-[#F0F3DF]"
            style={{ opacity: focusLockContrast }}
          />
        </motion.span>
      </motion.span>
    </motion.span>
  );
}

export default function RouteAtlas({
  stops,
  activeIndex,
  chapterProgress,
  chapterIds,
  entryProgress,
  reducedMotion,
  mobile = false,
  paused = false,
  presentation = 'classic',
  onNavigate,
  engagedChapterId = null,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const routeAtlasRef = useRef<HTMLElement>(null);
  const classicMapFrameRef = useRef<Process | null>(null);
  const interfaceIntroPlayedRef = useRef(false);
  const viewportWidthRef = useRef(0);
  const cameraSyncedRef = useRef(false);
  const mapboxToken = getMapboxToken();
  const resolvedIndex = activeIndex >= 0 && activeIndex < stops.length ? activeIndex : -1;
  const living = presentation === 'living';
  const classicEntrance = !living && !mobile && !!entryProgress;
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapSettled, setMapSettled] = useState(false);
  const [mapCameraSynced, setMapCameraSynced] = useState(false);
  const [mapIdleFallback, setMapIdleFallback] = useState(false);
  const [mapLoadDelayed, setMapLoadDelayed] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const [mapEligible, setMapEligible] = useState(false);
  const [atlasEngaged, setAtlasEngaged] = useState(reducedMotion);
  const [interfaceInFrame, setInterfaceInFrame] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [projectedStops, setProjectedStops] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const [projectedRoute, setProjectedRoute] = useState<Array<{ x: number; y: number }>>([]);

  const chapterRoute = useMemo(() => buildChapterRoute(stops, chapterIds), [chapterIds, stops]);
  const mappedStops = useMemo(() => chapterRoute.map((entry) => entry.stop), [chapterRoute]);
  const activeRouteEntry = resolvedIndex >= 0
    ? chapterRoute.find((entry) => entry.stopIndex === resolvedIndex)
    : undefined;
  const activeStop = activeRouteEntry?.stop;
  const activeStopRef = useRef<RouteStop | undefined>(activeStop);
  const activeChapterPosition = activeRouteEntry?.chapterIndex ?? chapterRoute[0]?.chapterIndex ?? 0;
  const fallbackChapterProgress = useMotionValue(activeChapterPosition);
  const fallbackEntryProgress = useMotionValue(1);
  const resolvedChapterProgress = chapterProgress ?? fallbackChapterProgress;
  const resolvedEntryProgress = entryProgress ?? fallbackEntryProgress;
  const chapterSample = useTransform(
    resolvedChapterProgress,
    (position) => sampleChapter(chapterRoute, position, reducedMotion),
  );
  const livingTravelProgress = useTransform(
    chapterSample,
    (sample) => sample?.routeProgress ?? 0,
  );
  const railCompletion = useTransform(chapterSample, (sample) => {
    if (!sample || chapterRoute.length < 2) return 0;
    const fromIndex = chapterRoute.findIndex((entry) => entry.stop.id === sample.from.stop.id);
    const toIndex = chapterRoute.findIndex((entry) => entry.stop.id === sample.to.stop.id);
    if (fromIndex < 0 || toIndex < 0) return 0;
    return clamp01(
      (fromIndex + (toIndex - fromIndex) * sample.easedProgress) /
      Math.max(1, chapterRoute.length - 1),
    );
  });
  const sampledEntryProgress = useTransform(
    resolvedEntryProgress,
    (progress) => reducedMotion ? (progress < 0.5 ? 0 : 1) : clamp01(progress),
  );
  // Geography develops first, then its camera and surface settle together.
  // Every value is reversible and remains attached to the shared scroll score.
  const classicMapEntry = useTransform(sampledEntryProgress, (progress) =>
    classicEntrance ? entrancePhase(progress, ...ARCHIVE_ENTRANCE_PHASES.map) : progress,
  );
  const classicEntryOpacity = useTransform(sampledEntryProgress, (progress) =>
    classicEntrance
      ? entrancePhase(progress, ...ARCHIVE_ENTRANCE_PHASES.mapVisibility)
      : clamp01((progress - 0.02) / 0.36),
  );
  const classicEntryScale = useTransform(classicMapEntry, (progress) =>
    1 + (classicEntrance ? 0.035 : 0.006) * (1 - progress),
  );
  const classicEntryY = useTransform(classicMapEntry, (progress) =>
    (classicEntrance ? 28 : 18) * (1 - progress),
  );
  const classicEntryVeilOpacity = useTransform(sampledEntryProgress, (progress) =>
    classicEntrance
      ? 1 - entrancePhase(progress, ...ARCHIVE_ENTRANCE_PHASES.mapVisibility)
      : 1 - clamp01(progress / 0.96),
  );

  useEffect(() => {
    activeStopRef.current = activeStop;
  }, [activeStop]);

  const fullRouteCoordinates = useMemo(() => routeCoordinates(mappedStops), [mappedStops]);
  const fullRoute = useMemo(() => lineFeature(fullRouteCoordinates), [fullRouteCoordinates]);
  const staticMapUrl = useMemo(
    () => living ? '' : staticAtlasUrl(fullRouteCoordinates, mapboxToken, mobile),
    [fullRouteCoordinates, living, mapboxToken, mobile],
  );
  const projectedRoutePath = useMemo(
    () => projectedRoute
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' '),
    [projectedRoute],
  );
  const routeBounds = useMemo(() => {
    const longitudes = mappedStops.map((stop) => stop.coordinates[0]);
    const latitudes = mappedStops.map((stop) => stop.coordinates[1]);
    if (!longitudes.length || !latitudes.length) {
      return [[-125, 24], [-66, 50]] as [[number, number], [number, number]];
    }
    return [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ] as [[number, number], [number, number]];
  }, [mappedStops]);

  useEffect(() => {
    if (chapterProgress) return;
    if (!living || reducedMotion) {
      fallbackChapterProgress.set(activeChapterPosition);
      return;
    }
    const controls = animate(fallbackChapterProgress, activeChapterPosition, {
      duration: mobile ? 0.62 : 0.74,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [activeChapterPosition, chapterProgress, fallbackChapterProgress, living, mobile, reducedMotion]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = () => setViewportReady(mobile ? !query.matches : query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [mobile]);

  useEffect(() => {
    if (!living || !mapLoaded) {
      setProjectedStops([]);
      setProjectedRoute([]);
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map) return;
    const update = () => {
      const nextStops = mappedStops.map((stop) => {
        const point = map.project(stop.coordinates);
        return { id: stop.id, x: point.x, y: point.y };
      });
      const nextRoute = fullRouteCoordinates.map((coordinate) => {
        const point = map.project(coordinate);
        return { x: point.x, y: point.y };
      });
      setProjectedStops((current) => projectedPointsMatch(current, nextStops) ? current : nextStops);
      setProjectedRoute((current) => projectedPointsMatch(current, nextRoute) ? current : nextRoute);
    };
    update();
    map.on('load', update);
    map.on('resize', update);
    map.on('moveend', update);
    map.on('idle', update);
    return () => {
      map.off('load', update);
      map.off('resize', update);
      map.off('moveend', update);
      map.off('idle', update);
    };
  }, [fullRouteCoordinates, living, mapLoaded, mappedStops]);

  useEffect(() => {
    let frame = 0;
    viewportWidthRef.current = window.innerWidth;
    const resize = () => {
      const nextWidth = window.innerWidth;
      // Mobile browser chrome frequently changes only the visual viewport
      // height while scrolling. The Living Atlas uses a stable svh stage, so
      // resizing WebGL and re-projecting every marker for those events is both
      // unnecessary and a major source of touch-scroll hitching.
      if (living && Math.abs(nextWidth - viewportWidthRef.current) < 1) return;
      viewportWidthRef.current = nextWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        mapRef.current?.resize();
        setLayoutRevision((current) => current + 1);
      });
    };
    window.addEventListener('resize', resize, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [living]);

  // Mapbox is the heaviest homepage dependency. HomePage first imports this
  // module near the atlas; this tighter second gate waits to create WebGL until
  // the section is almost visible, keeping map startup away from the opener's
  // card-to-page handoff.
  useEffect(() => {
    if (!viewportReady || mapEligible) return;
    const atlas = routeAtlasRef.current;
    if (!atlas || typeof IntersectionObserver === 'undefined') {
      setMapEligible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setMapEligible(true);
        observer.disconnect();
      },
      { rootMargin: mobile ? '80px 0px' : '140px 0px', threshold: 0 },
    );
    observer.observe(atlas);
    return () => observer.disconnect();
  }, [mapEligible, mobile, viewportReady]);

  useEffect(() => {
    if (!mapEligible || mapLoaded) {
      setMapLoadDelayed(false);
      return;
    }
    const timeout = window.setTimeout(() => setMapLoadDelayed(true), 15000);
    return () => window.clearTimeout(timeout);
  }, [mapEligible, mapLoaded]);

  // Preloading and engagement are intentionally separate. The WebGL canvas can
  // warm up just outside the viewport, but the camera, route and interface wait
  // until the atlas occupies a meaningful part of the screen. Engagement is
  // reversible: scrolling back to the index restores the page-coloured veil
  // instead of leaving an already-revealed map cutting into the handoff.
  useEffect(() => {
    if (!viewportReady) return;
    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      setAtlasEngaged(true);
      return;
    }
    const atlas = routeAtlasRef.current;
    if (!atlas) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setAtlasEngaged((current) => {
          const enterThreshold = mobile ? 0.10 : 0.08;
          const exitThreshold = mobile ? 0.05 : 0.04;
          const threshold = current ? exitThreshold : enterThreshold;
          const next = !!entry?.isIntersecting && entry.intersectionRatio >= threshold;
          return current === next ? current : next;
        });
      },
      {
        threshold: [0, 0.04, 0.05, 0.08, 0.10, 0.5, 1],
        rootMargin: '0px',
      },
    );
    observer.observe(atlas);
    return () => observer.disconnect();
  }, [mobile, reducedMotion, viewportReady]);

  // Keep the atlas chrome out of the opening seam and fade it before the
  // sticky map unpins at the end. This prevents the route rail from sliding
  // underneath the fixed Ryan Xu navigation.
  useEffect(() => {
    if (!viewportReady) return;
    const atlas = routeAtlasRef.current;
    if (!atlas || typeof IntersectionObserver === 'undefined') {
      setInterfaceInFrame(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInterfaceInFrame((current) => {
          const enterThreshold = mobile ? 0.80 : 0.78;
          const exitThreshold = mobile ? 0.66 : 0.64;
          const threshold = current ? exitThreshold : enterThreshold;
          const next = !!entry?.isIntersecting && entry.intersectionRatio >= threshold;
          return current === next ? current : next;
        });
      },
      { threshold: [0, 0.5, 0.64, 0.66, 0.78, 0.80, 1] },
    );
    observer.observe(atlas);
    return () => observer.disconnect();
  }, [mobile, viewportReady]);

  // Living Atlas retains its one stable overview; its HTML/SVG layer owns the
  // chapter interpolation. Classic has a separate scroll sampler below.
  useEffect(() => {
    if (!living || !mapLoaded || !atlasEngaged || paused || activeStop) return;
    const map = mapRef.current;
    map?.stop();
    map?.fitBounds(routeBounds, {
      padding: mobile
        ? { top: 240, right: 18, bottom: 174, left: 18 }
        : { top: 88, right: 62, bottom: 64, left: 238 },
      maxZoom: mobile ? 2.85 : 4.05,
      bearing: 0,
      pitch: 0,
      duration: reducedMotion ? 0 : mobile ? 820 : 1150,
      essential: !reducedMotion,
    });
  }, [activeStop, atlasEngaged, living, mapLoaded, mobile, paused, reducedMotion, routeBounds]);

  // Classic map motion is one render-free scroll transaction. Camera, route,
  // labels and waypoints read the same ChapterSample. We coalesce to one latest
  // value in Motion's render phase, after the shared sample and waypoint
  // strengths resolve in preRender, without queuing a second browser frame.
  useEffect(() => {
    if (classicMapFrameRef.current) cancelFrame(classicMapFrameRef.current);
    classicMapFrameRef.current = null;
    if (living) return;
    if (!mapLoaded || !atlasEngaged || paused) {
      mapRef.current?.stop();
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map) return;
    let disposed = false;
    let queuedSample = chapterSample.get();
    let queuedEntry = sampledEntryProgress.get();
    let padded: boolean | null = null;
    let lastOverview = false;
    let lastCoordinate: GeoCoordinate | null = null;
    let lastZoom = Number.NaN;
    let lastPitch = Number.NaN;
    let lastBearing = Number.NaN;
    let lastRouteProgress = Number.NaN;
    const activePadding = { top: 48, right: 264, bottom: 0, left: 0 };
    const neutralPadding = { top: 0, right: 0, bottom: 0, left: 0 };

    const draw: Process = () => {
      if (disposed) return;
      classicMapFrameRef.current = null;
      const sample = queuedSample;
      const focused = !!sample && (
        !!activeStopRef.current ||
        (!!entryProgress && queuedEntry > 0.02)
      );

      // Padding defines the permanent editorial focal point; applying it only
      // when the map changes mode avoids resubmitting the same layout object on
      // every camera frame.
      if (padded !== focused) {
        padded = focused;
        map.setPadding(focused ? activePadding : neutralPadding);
      }

      if (sample && focused) {
        // Enter The Route through geography, not through a scaled interface
        // panel. The same scroll-owned entry clock carries the camera from a
        // continental overview into the first chapter, so slow, fast and
        // reverse gestures all resolve to the exact same optical state.
        // The formal entrance uses the same geographic phase as the map plane;
        // after that phase ends, the existing chapter camera is untouched.
        const entryCameraProgress = entryProgress
          ? classicEntrance
            ? entrancePhase(queuedEntry, ...ARCHIVE_ENTRANCE_PHASES.map)
            : clamp01(queuedEntry)
          : 1;
        const entryOverview: GeoCoordinate = [-100.2, 38.6];
        const entryOverviewZoom = 2.32;
        const entryCoordinate = entryProgress
          ? greatCirclePoint(
              entryOverview,
              sample.coordinate,
              entryCameraProgress,
            )
          : sample.coordinate;
        const entryZoom = entryProgress
          ? entryOverviewZoom + (sample.zoom - entryOverviewZoom) * entryCameraProgress
          : sample.zoom;
        const entryPoseProgress = classicEntrance ? entryCameraProgress : smootherstep(entryCameraProgress);
        const entryPitch = sample.pitch * entryPoseProgress;
        const entryBearing = US_OVERVIEW.bearing +
          (sample.bearing - US_OVERVIEW.bearing) * entryPoseProgress;
        const atChapterEndpoint = sample.easedProgress <= 0.000001 || sample.easedProgress >= 0.999999;
        const lastScreenPoint = lastCoordinate ? map.project(lastCoordinate) : null;
        const nextScreenPoint = map.project(entryCoordinate);
        const screenDelta = lastScreenPoint
          ? Math.hypot(nextScreenPoint.x - lastScreenPoint.x, nextScreenPoint.y - lastScreenPoint.y)
          : Number.POSITIVE_INFINITY;
        // Compare in visible pixels rather than degrees. The old 0.012° gate
        // quantised short legs into small jumps, especially on high-DPI Chrome.
        const coordinateChanged = !lastCoordinate || screenDelta >= 0.14 ||
          (atChapterEndpoint && screenDelta > 0.001);
        const zoomChanged = !Number.isFinite(lastZoom) || Math.abs(lastZoom - entryZoom) > 0.0004;
        const poseChanged = !Number.isFinite(lastPitch) || !Number.isFinite(lastBearing) ||
          Math.abs(lastPitch - entryPitch) > 0.015 || Math.abs(lastBearing - entryBearing) > 0.015;
        if (lastOverview || coordinateChanged || zoomChanged || poseChanged) {
          map.jumpTo({
            center: entryCoordinate,
            zoom: entryZoom,
            bearing: entryBearing,
            pitch: entryPitch,
          });
          lastCoordinate = entryCoordinate;
          lastZoom = entryZoom;
          lastPitch = entryPitch;
          lastBearing = entryBearing;
          lastOverview = false;
        }
      } else {
        if (!lastOverview) {
          map.jumpTo({
            center: [US_OVERVIEW.longitude, US_OVERVIEW.latitude],
            zoom: US_OVERVIEW.zoom,
            bearing: US_OVERVIEW.bearing,
            pitch: 0,
          });
          lastCoordinate = null;
          lastZoom = US_OVERVIEW.zoom;
          lastPitch = 0;
          lastBearing = US_OVERVIEW.bearing;
          lastOverview = true;
        }
      }

      const routeProgress = sample?.routeProgress ?? 0;
      const atRouteEndpoint = !!sample && (
        sample.easedProgress <= 0.000001 || sample.easedProgress >= 0.999999
      );
      if (
        !Number.isFinite(lastRouteProgress) ||
        Math.abs(routeProgress - lastRouteProgress) >= 0.0002 ||
        (atRouteEndpoint && routeProgress !== lastRouteProgress)
      ) {
        lastRouteProgress = routeProgress;
        ['route-travelled-glow', 'route-travelled-line'].forEach((layerId) => {
          if (map.getLayer(layerId)) map.setPaintProperty(layerId, 'line-trim-offset', [routeProgress, 1]);
        });
      }
      // Mark only the first real timeline draw. The readiness fallback must
      // never reveal the initial overview before the current chapter is applied.
      if (!cameraSyncedRef.current) {
        cameraSyncedRef.current = true;
        setMapCameraSynced(true);
      }
    };
    const schedule = (sample = chapterSample.get()) => {
      if (disposed) return;
      queuedSample = sample;
      if (classicMapFrameRef.current) return;
      classicMapFrameRef.current = draw;
      frame.render(draw, false, true);
    };
    const scheduleEntry = (progress: number) => {
      queuedEntry = progress;
      schedule(queuedSample);
    };
    const unsubscribe = chapterSample.on('change', schedule);
    const unsubscribeEntry = sampledEntryProgress.on('change', scheduleEntry);
    // Mapbox may finish loading after several chapters have already passed, and
    // Story close may resume on a stationary scroll position. Always replay now.
    schedule(chapterSample.get());
    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeEntry();
      cancelFrame(draw);
      if (classicMapFrameRef.current === draw) classicMapFrameRef.current = null;
    };
  }, [atlasEngaged, chapterSample, classicEntrance, entryProgress, layoutRevision, living, mapLoaded, paused, sampledEntryProgress]);

  const mapReadiness = {
    loaded: mapLoaded,
    cameraSynced: living || mapCameraSynced,
    settled: mapSettled,
    idleFallback: mapIdleFallback,
  };
  useEffect(() => scheduleAtlasIdleFallback({
    loaded: mapLoaded,
    cameraSynced: living || mapCameraSynced,
    settled: mapSettled,
    idleFallback: mapIdleFallback,
  }, () => setMapIdleFallback(true)), [living, mapCameraSynced, mapIdleFallback, mapLoaded, mapSettled]);

  const coordinateLabel = activeStop ? formatCoordinateLabel(activeStop.coordinates) : '';
  const entryOwnsClassicInterface = !living && !!entryProgress;
  const interfaceVisible = !paused && atlasEngaged &&
    (entryOwnsClassicInterface || interfaceInFrame) &&
    isAtlasInterfaceReady(mapReadiness);
  // On small screens the active photograph already carries the place, year,
  // frame count and story cue. Removing the atlas footer during an active
  // chapter keeps those layers from competing for the same bottom edge.
  const footerVisible = !living && interfaceVisible && (!mobile || !activeStop);
  const playInterfaceIntro = interfaceVisible && !interfaceIntroPlayedRef.current;
  const sampledClassicActive = !!activeStop || entryOwnsClassicInterface;
  const interfaceGate = useMotionValue(interfaceVisible ? 1 : 0);
  const classicInterfaceOpacity = useTransform(
    [sampledEntryProgress, interfaceGate],
    ([entry, gate]) => (classicEntrance
      ? entrancePhase(entry, ...ARCHIVE_ENTRANCE_PHASES.interface)
      : smootherstep(clamp01((entry - 0.54) / 0.42))) * gate,
  );
  const classicHeaderOpacity = useTransform(
    [sampledEntryProgress, interfaceGate],
    ([entry, gate]) => (classicEntrance
      ? entrancePhase(entry,
          ARCHIVE_ENTRANCE_PHASES.interface[0] - CLASSIC_INTERFACE_STAGGER,
          ARCHIVE_ENTRANCE_PHASES.interface[1] - CLASSIC_INTERFACE_STAGGER)
      : smootherstep(clamp01((entry - 0.54) / 0.42))) * gate,
  );
  const classicFooterOpacity = useTransform(
    [sampledEntryProgress, interfaceGate],
    ([entry, gate]) => (classicEntrance
      ? entrancePhase(entry,
          ARCHIVE_ENTRANCE_PHASES.interface[0] + CLASSIC_INTERFACE_STAGGER,
          ARCHIVE_ENTRANCE_PHASES.interface[1] + CLASSIC_INTERFACE_STAGGER)
      : smootherstep(clamp01((entry - 0.54) / 0.42))) * gate,
  );
  const classicInterfaceY = useTransform(classicInterfaceOpacity, (opacity) => (1 - opacity) * (classicEntrance ? 20 : 18));
  const classicHeaderY = useTransform(classicHeaderOpacity, (opacity) => (1 - opacity) * (classicEntrance ? 16 : 18));
  const classicFooterY = useTransform(classicFooterOpacity, (opacity) => (1 - opacity) * (classicEntrance ? 14 : 18));
  const accessibleEntry = classicEntrance ? CLASSIC_INTERFACE_ACCESSIBLE_ENTRY : 0.8;
  const [entryInterfaceAvailable, setEntryInterfaceAvailable] = useState(() =>
    !entryOwnsClassicInterface || sampledEntryProgress.get() >= accessibleEntry,
  );
  const interfaceAccessible = interfaceVisible && (!entryOwnsClassicInterface || entryInterfaceAvailable);
  const footerAccessible = footerVisible && (!entryOwnsClassicInterface || entryInterfaceAvailable);

  useEffect(() => {
    if (!entryOwnsClassicInterface) {
      setEntryInterfaceAvailable(true);
      return;
    }
    // Visual opacity stays entirely scroll-owned. Only make the emerging
    // controls focusable once they are legible, and remove them again on the
    // reverse pass. This updates React only when the boolean threshold changes.
    let available = sampledEntryProgress.get() >= accessibleEntry;
    setEntryInterfaceAvailable(available);
    return sampledEntryProgress.on('change', (progress) => {
      const next = progress >= accessibleEntry;
      if (next === available) return;
      available = next;
      setEntryInterfaceAvailable(next);
    });
  }, [accessibleEntry, entryOwnsClassicInterface, sampledEntryProgress]);

  useEffect(() => {
    const target = interfaceVisible ? 1 : 0;
    if (entryOwnsClassicInterface || reducedMotion) {
      interfaceGate.set(target);
      return;
    }
    const controls = animate(interfaceGate, target, {
      duration: target ? 0.32 : 0.24,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [entryOwnsClassicInterface, interfaceGate, interfaceVisible, reducedMotion]);

  useEffect(() => {
    if (!interfaceVisible || interfaceIntroPlayedRef.current) return;
    const timeout = window.setTimeout(() => {
      interfaceIntroPlayedRef.current = true;
    }, 1100);
    return () => window.clearTimeout(timeout);
  }, [interfaceVisible]);

  if (chapterRoute.length < 2) {
    return (
      <section
        aria-hidden="true"
        className={`route-atlas relative w-full overflow-hidden bg-[#282c20] ${mobile ? 'route-atlas--mobile h-full min-h-[100svh]' : 'h-full'}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_42%_48%,rgba(210,255,0,0.035),transparent_58%)]" />
        <div className="route-atlas-fallback__art absolute inset-0">
          <div className="absolute left-1/2 top-1/2 aspect-[1600/956] w-[132%] -translate-x-1/2 -translate-y-1/2 opacity-30 md:w-[110%]">
            <img
              src="/assets/maps/walkin-us-atlas.webp"
              alt=""
              className="h-full w-full object-contain"
              width="1600"
              height="956"
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </div>
        </div>
      </section>
    );
  }

  if (!viewportReady) {
    return (
      <section
        aria-hidden="true"
        className={`route-atlas relative w-full overflow-hidden bg-[#282c20] ${mobile ? 'route-atlas--mobile' : ''} ${
          mobile ? 'h-full min-h-[100svh]' : 'h-full'
        }`}
      >
        <div className="route-atlas-fallback__art absolute inset-0">
          <div className="absolute left-1/2 top-1/2 aspect-[1600/956] w-[132%] -translate-x-1/2 -translate-y-1/2 opacity-30 md:w-[110%]">
            <img
              src="/assets/maps/walkin-us-atlas.webp"
              alt=""
              className="h-full w-full object-contain"
              width="1600"
              height="956"
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={routeAtlasRef}
      aria-label={living ? undefined : 'Scroll-driven photographic route'}
      role={living ? 'presentation' : undefined}
      data-atlas-engaged={atlasEngaged ? 'true' : 'false'}
      className={`route-atlas relative w-full overflow-hidden bg-transparent ${living ? '' : 'isolate'} ${mobile ? 'route-atlas--mobile' : ''} ${living ? 'route-atlas--living' : ''} ${
        mobile ? 'h-full min-h-[100svh]' : 'h-full'
      }`}
    >
      <div className={`absolute inset-0 ${living ? 'bg-[#0f130e]' : 'bg-[#282c20]'}`} aria-hidden="true" />
      <motion.div
        initial={false}
        animate={!living && entryProgress
          ? undefined
          : reducedMotion
            ? { scale: 1, y: 0 }
            : atlasEngaged && !paused
              ? { scale: 1, y: 0 }
              : { scale: mobile ? 1.045 : 1.03, y: mobile ? 18 : 12 }}
        style={!living && entryProgress
          ? { opacity: classicEntryOpacity, scale: classicEntryScale, y: classicEntryY }
          : undefined}
        transition={{ duration: reducedMotion ? 0 : 1.08, ease: [0.16, 1, 0.3, 1] }}
        className={`absolute origin-center overflow-hidden ${classicEntrance ? '-inset-8' : 'inset-0'}`}
      >
        <motion.div
          aria-hidden="true"
          initial={false}
          animate={{ opacity: living ? (mapSettled ? 0.42 : 1) : mapSettled ? 0 : 0.3 }}
          transition={{ duration: reducedMotion ? 0 : 0.85, ease: [0.16, 1, 0.3, 1] }}
          className="route-atlas-fallback__art pointer-events-none absolute inset-0"
        >
          {living ? (
            <div className="route-atlas-print-base absolute inset-0" aria-hidden="true">
              <img
                src="/assets/maps/walkin-silver-paper.webp"
                alt=""
                className="route-atlas-print-paper absolute inset-0 h-full w-full object-cover"
                width="1600"
                height="956"
                loading="eager"
                decoding="async"
                draggable={false}
              />
              <div className="route-atlas-print-map absolute inset-0">
                <img
                  src="/assets/maps/walkin-us-silhouette.webp"
                  alt=""
                  className="route-atlas-print-silhouette absolute inset-0 h-full w-full object-fill"
                  width="1600"
                  height="956"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
                <img
                  src="/assets/maps/walkin-us-atlas.webp"
                  alt=""
                  className="route-atlas-print-states absolute inset-0 h-full w-full object-fill"
                  width="1600"
                  height="956"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              </div>
              {!mobile && (
                <div className="route-atlas-print-labels absolute inset-0 font-serif uppercase" aria-hidden="true">
                  <span className="route-atlas-print-label route-atlas-print-label--canada">Canada</span>
                  <span className="route-atlas-print-label route-atlas-print-label--usa">United<br />States</span>
                  <span className="route-atlas-print-label route-atlas-print-label--mexico">Mexico</span>
                  <span className="route-atlas-print-label route-atlas-print-label--pacific">Pacific<br />Ocean</span>
                  <span className="route-atlas-print-label route-atlas-print-label--atlantic">Atlantic<br />Ocean</span>
                  <span className="route-atlas-print-label route-atlas-print-label--gulf">Gulf of<br />Mexico</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {staticMapUrl && (
                <img
                  src={staticMapUrl}
                  alt=""
                  className="route-atlas-static-map absolute inset-0 h-full w-full object-cover"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              )}
              <div className="absolute left-1/2 top-1/2 aspect-[1600/956] w-[132%] -translate-x-1/2 -translate-y-1/2 opacity-20 md:w-[110%]">
                <img
                  src="/assets/maps/walkin-us-atlas.webp"
                  alt=""
                  className="h-full w-full object-contain"
                  width="1600"
                  height="956"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              </div>
            </>
          )}
        </motion.div>

        {mapEligible && (
          <MapGL
            ref={mapRef}
            mapboxAccessToken={mapboxToken}
            mapStyle={MAP_STYLE}
            projection={{ name: 'mercator' }}
            initialViewState={living
              ? mobile
                ? { ...LIVING_OVERVIEW, zoom: 2.35, latitude: 37.5 }
                : LIVING_OVERVIEW
              : mobile
                ? { ...US_OVERVIEW, zoom: 2.3, pitch: 0 }
                : { ...US_OVERVIEW, zoom: 3 }}
            style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
            attributionControl
            trackResize={false}
            renderWorldCopies={false}
            fadeDuration={0}
            scrollZoom={false}
            dragRotate={false}
            dragPan={false}
            touchZoomRotate={false}
            touchPitch={false}
            doubleClickZoom={false}
            boxZoom={false}
            keyboard={false}
            minZoom={2.2}
            maxZoom={11}
            onIdle={() => setMapSettled(true)}
            onLoad={() => {
              setMapLoaded(true);
              setMapLoadDelayed(false);
              const map = mapRef.current?.getMap();
              if (!map) return;
              // This homepage map is presentation-only; the adjacent route
              // rail owns navigation. Keep the WebGL canvas out of the Tab
              // order while leaving Mapbox's legal attribution DOM intact.
              map.getCanvas().tabIndex = -1;
              map.getCanvas().setAttribute('aria-hidden', 'true');
              if (mobile) map.touchZoomRotate.disableRotation();

          // Keep the actual road network without heavy terrain or extrusions.
          // Classic depth comes from the scroll-owned oblique camera, with no
          // terrain startup cost or extra animation competing with the photos.
          map.setTerrain(null);
          map.setFog(null);

          map.getStyle().layers?.forEach((layer) => {
            const id = layer.id.toLowerCase();

            if (layer.type === 'fill-extrusion') {
              map.setLayoutProperty(layer.id, 'visibility', 'none');
              return;
            }

            if (layer.type === 'hillshade') {
              if (!living) {
                map.setLayoutProperty(layer.id, 'visibility', 'none');
                return;
              }
              map.setPaintProperty(layer.id, 'hillshade-exaggeration', 0.16);
              map.setPaintProperty(layer.id, 'hillshade-shadow-color', '#080b07');
              map.setPaintProperty(layer.id, 'hillshade-highlight-color', '#59614f');
              map.setPaintProperty(layer.id, 'hillshade-accent-color', '#252c22');
              return;
            }

            if (layer.type === 'background') {
              map.setPaintProperty(layer.id, 'background-color', living ? '#0F130E' : '#1B2319');
              return;
            }

            if (layer.type === 'fill') {
              if (id.includes('water')) {
                map.setPaintProperty(layer.id, 'fill-color', '#0B1210');
                map.setPaintProperty(layer.id, 'fill-opacity', 0.92);
              } else if (id.includes('park') || id.includes('landuse') || id.includes('landcover')) {
                map.setPaintProperty(layer.id, 'fill-color', '#263024');
                map.setPaintProperty(layer.id, 'fill-opacity', living ? (mobile ? 0.32 : 0.28) : (mobile ? 0.36 : 0.38));
              } else if (id.includes('building')) {
                map.setPaintProperty(layer.id, 'fill-color', '#2A3028');
                map.setPaintProperty(layer.id, 'fill-opacity', mobile ? 0.1 : 0.12);
              }
              return;
            }

            if (layer.type === 'line') {
              if (id.includes('admin') || id.includes('boundary')) {
                map.setPaintProperty(layer.id, 'line-color', '#AEB6A9');
                map.setPaintProperty(layer.id, 'line-width', mobile ? 0.62 : 0.74);
                map.setPaintProperty(layer.id, 'line-opacity', living ? (mobile ? 0.21 : 0.2) : (mobile ? 0.28 : 0.46));
              } else if (id.includes('motorway') || id.includes('trunk') || id.includes('primary')) {
                map.setPaintProperty(layer.id, 'line-color', '#8C9588');
                map.setPaintProperty(layer.id, 'line-opacity', living ? 0.1 : (mobile ? 0.32 : 0.56));
              } else if (id.includes('secondary') || id.includes('tertiary')) {
                map.setPaintProperty(layer.id, 'line-color', '#737D6D');
                map.setPaintProperty(layer.id, 'line-opacity', living ? 0.045 : (mobile ? 0.2 : 0.39));
              } else if (id.includes('road') || id.includes('street')) {
                map.setPaintProperty(layer.id, 'line-color', '#667064');
                map.setPaintProperty(layer.id, 'line-opacity', living ? 0.018 : (mobile ? 0.1 : 0.22));
              } else if (id.includes('waterway')) {
                map.setPaintProperty(layer.id, 'line-color', '#657168');
                map.setPaintProperty(layer.id, 'line-opacity', living ? 0.08 : (mobile ? 0.18 : 0.34));
              }
              return;
            }

            if (layer.type !== 'symbol' || !('layout' in layer) || !layer.layout?.['text-field']) return;
            const isBaseNavigationNoise =
              id.includes('poi') ||
              id.includes('transit') ||
              id.includes('airport') ||
              id.includes('building-number');
            const isRoadLabel = id.includes('road') || id.includes('street');
            const isPlaceLabel =
              id.includes('settlement') ||
              id.includes('place') ||
              id.includes('city') ||
              id.includes('town') ||
              id.includes('village');
            if (isBaseNavigationNoise || (living && isRoadLabel)) {
              map.setLayoutProperty(layer.id, 'visibility', 'none');
              return;
            }
            const isAtlasLabel =
              id.includes('state-label') ||
              id.includes('country-label') ||
              id.includes('water-point') ||
              id.includes('water-line');
            if (living && !isAtlasLabel) {
              map.setLayoutProperty(layer.id, 'visibility', 'none');
              return;
            }
            map.setPaintProperty(
              layer.id,
              'text-opacity',
              isAtlasLabel
                ? living
                  ? (mobile ? 0.21 : 0.19)
                  : (mobile ? 0.4 : 0.54)
                : isPlaceLabel
                  ? (mobile ? 0.42 : 0.64)
                  : isRoadLabel
                    ? (mobile ? 0.2 : 0.36)
                    : (mobile ? 0.34 : 0.4),
            );
            map.setPaintProperty(layer.id, 'text-color', '#C8CEC2');
            map.setPaintProperty(layer.id, 'text-halo-color', '#11150F');
            map.setPaintProperty(layer.id, 'text-halo-width', 0.7);
            map.setPaintProperty(layer.id, 'text-halo-blur', 0.5);
          });
            }}
          >
        <Source key="atlas-graticule" id="atlas-graticule" type="geojson" data={NORTH_AMERICA_GRATICULE}>
          <Layer
            id="atlas-graticule-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#AEB6A9',
              'line-width': 0.55,
              'line-opacity': mobile ? 0.055 : 0.045,
            }}
          />
        </Source>
        {!living && <Source key="route-all" id="route-all" type="geojson" data={fullRoute} lineMetrics>
          <Layer
            id="route-all-glow"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ACCENT,
              'line-width': 7,
              'line-opacity': living ? 0 : atlasEngaged ? 0.06 : 0,
              'line-opacity-transition': { duration: reducedMotion ? 0 : 700, delay: reducedMotion ? 0 : 120 },
              'line-blur': mobile ? 5 : 7,
              'line-trim-offset': [1, 1],
            }}
          />
          <Layer
            id="route-all-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ACCENT,
              'line-width': mobile ? 1.1 : 1.25,
              'line-opacity': living ? 0 : atlasEngaged ? (mobile ? 0.44 : 0.48) : 0,
              'line-opacity-transition': { duration: reducedMotion ? 0 : 700, delay: reducedMotion ? 0 : 120 },
              'line-trim-offset': [1, 1],
            }}
          />
          <Layer
            id="route-travelled-glow"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#BACF86',
              'line-width': mobile ? 5.5 : 4,
              'line-opacity': living ? 0 : mobile ? 0.075 : 0.065,
              'line-blur': mobile ? 5 : 3,
              'line-trim-offset': [chapterSample.get()?.routeProgress ?? 0, 1],
            }}
          />
          <Layer
            id="route-travelled-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#C3D78B',
              'line-width': mobile ? 1.45 : 1.65,
              'line-opacity': living ? 0 : mobile ? 0.84 : 0.82,
              'line-trim-offset': [chapterSample.get()?.routeProgress ?? 0, 1],
            }}
          />
        </Source>}

        {!living && chapterRoute.map((entry) => (
          <Marker key={entry.stop.id} longitude={entry.stop.coordinates[0]} latitude={entry.stop.coordinates[1]} anchor="center" pitchAlignment="map" rotationAlignment="map">
            <ClassicMarkerNode
              entry={entry}
              sample={chapterSample}
              visibility={classicInterfaceOpacity}
              focusLocked={!mobile && engagedChapterId === entry.stop.id}
              reducedMotion={reducedMotion}
            />
          </Marker>
        ))}
          </MapGL>
        )}

      </motion.div>

      {living && projectedStops.length === mappedStops.length && (
        <motion.div
          aria-hidden="true"
          initial={false}
          animate={
            reducedMotion
              ? { scale: 1, y: 0 }
              : atlasEngaged && !paused
                ? { scale: 1, y: 0 }
                : { scale: mobile ? 1.045 : 1.03, y: mobile ? 18 : 12 }
          }
          transition={{ duration: reducedMotion ? 0 : 1.08, ease: [0.16, 1, 0.3, 1] }}
          className="route-atlas__marker-overlay pointer-events-none absolute inset-0 z-20 origin-center"
        >
          {projectedRoute.length > 1 && (
            <svg className="route-atlas__route-overlay absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              <motion.path
                d={projectedRoutePath}
                fill="none"
                stroke="#8FA52D"
                strokeWidth={mobile ? 1.05 : 1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                animate={{ pathLength: interfaceVisible ? 1 : 0, opacity: interfaceVisible ? (mobile ? 0.32 : 0.34) : 0 }}
                transition={{ duration: reducedMotion ? 0 : 1.05, ease: [0.16, 1, 0.3, 1] }}
              />
              <motion.path
                d={projectedRoutePath}
                fill="none"
                stroke={ACCENT}
                strokeWidth={mobile ? 1.25 : 1.45}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                style={{ pathLength: livingTravelProgress }}
                animate={{ opacity: interfaceVisible ? (mobile ? 0.72 : 0.78) : 0 }}
                transition={{
                  opacity: { duration: reducedMotion ? 0 : 0.38, ease: [0.16, 1, 0.3, 1] },
                }}
              />
            </svg>
          )}
          {projectedStops.map((projected, index) => {
            const stop = mappedStops[index];
            return (
              <div
                key={projected.id}
                className="absolute"
                style={{
                  left: projected.x,
                  top: projected.y,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <LivingMarkerNode
                  stop={stop}
                  index={index}
                  stops={mappedStops}
                  chapterProgress={resolvedChapterProgress}
                  interfaceVisible={interfaceVisible}
                  reducedMotion={reducedMotion}
                  mobile={mobile}
                  playInterfaceIntro={playInterfaceIntro}
                />
              </div>
            );
          })}
        </motion.div>
      )}

      <div
        aria-hidden="true"
        className={`route-atlas-entry-dissolve pointer-events-none absolute inset-x-0 top-0 z-[5] ${mobile ? 'h-[18%]' : 'h-[24%]'}`}
      />

      <motion.div
        initial={false}
        animate={!living && entryProgress
          ? undefined
          : { opacity: atlasEngaged && !paused ? 0 : 1 }}
        style={!living && entryProgress ? { opacity: classicEntryVeilOpacity } : undefined}
        transition={{ duration: reducedMotion ? 0 : 0.82, ease: [0.16, 1, 0.3, 1] }}
        className={`pointer-events-none absolute inset-0 z-10 ${living ? 'bg-[#0f130e]' : 'bg-[#282c20]'}`}
      />

      <AnimatePresence>
        {mapEligible && !mapLoaded && mapLoadDelayed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.55 }}
            className="pointer-events-none absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2"
            aria-live="polite"
          >
            <div className="rounded-full border border-white/10 bg-[#171b15]/76 px-4 py-3 font-ui text-[9px] uppercase tracking-[0.3em] text-white/62 shadow-[0_12px_36px_rgba(7,9,6,0.2)] backdrop-blur-md">
              Route signal delayed
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={`route-atlas-grade pointer-events-none absolute inset-0 ${
          mobile
            ? 'bg-[radial-gradient(circle_at_48%_54%,rgba(210,255,0,0.025)_0%,transparent_38%,rgba(7,9,6,0.2)_100%)]'
            : 'shadow-[inset_0_0_120px_rgba(7,9,6,0.23)]'
        }`}
      />
      {!mobile && <div className="route-atlas-tone pointer-events-none absolute inset-0" />}
      {!mobile && <div className="route-atlas-interface-veil pointer-events-none absolute inset-y-0 left-0" />}

      {!living && <motion.header
        initial={false}
        animate={entryOwnsClassicInterface
          ? undefined
          : interfaceVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
        style={entryOwnsClassicInterface
          ? { opacity: classicHeaderOpacity, y: classicHeaderY }
          : undefined}
        transition={{
          duration: reducedMotion ? 0 : interfaceVisible ? (playInterfaceIntro ? 0.56 : 0.34) : 0.3,
          delay: reducedMotion || !playInterfaceIntro ? 0 : 0.1,
          ease: [0.16, 1, 0.3, 1],
        }}
        aria-hidden={!interfaceAccessible}
        inert={!interfaceAccessible}
        className={`route-atlas-header absolute inset-x-0 top-0 z-20 flex items-start justify-between ${mobile ? 'px-5 pb-6 pt-24' : 'pb-7 pl-8 pr-[38%] pt-24'}`}
      >
        <div>
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-[#D2FF00] shadow-[0_0_14px_rgba(210,255,0,0.75)]" />
            <p className="font-ui text-[8px] font-bold uppercase tracking-[0.46em] text-white/72">The Route</p>
          </div>
          <p className="mt-3 font-ui text-[9px] uppercase tracking-[0.28em] text-white/54">Photographic coordinates</p>
        </div>
        <ScrubbedRouteOrdinal
          sample={chapterSample}
          route={chapterRoute}
          includeTotal
          className="font-ui text-[9px] uppercase tracking-[0.26em] text-white/56"
        />
      </motion.header>}

      {!living && <motion.nav
        initial={false}
        animate={entryOwnsClassicInterface
          ? undefined
          : interfaceVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: -18 }}
        style={entryOwnsClassicInterface
          ? { opacity: classicInterfaceOpacity, y: classicInterfaceY }
          : undefined}
        transition={{
          duration: reducedMotion ? 0 : interfaceVisible ? (playInterfaceIntro ? 0.62 : 0.36) : 0.3,
          delay: reducedMotion || !playInterfaceIntro ? 0 : 0.18,
          ease: [0.16, 1, 0.3, 1],
        }}
        aria-hidden={!interfaceAccessible}
        inert={!interfaceAccessible}
        aria-label="Archive route chapters"
        className={`route-atlas-nav absolute z-30 ${
          mobile
            ? 'left-5 top-[31%] w-[132px]'
            : 'left-8 top-[170px] w-[190px]'
        }`}
      >
        <div className="route-atlas-rail relative">
          <div className="absolute bottom-3 left-[7px] top-3 w-px bg-white/12" />
          <motion.div
            className="absolute bottom-3 left-[7px] top-3 w-px origin-top bg-[#D2FF00] shadow-[0_0_8px_rgba(210,255,0,0.45)]"
            style={{ scaleY: railCompletion }}
          />
          {chapterRoute.map((entry, index) => {
            return (
              <ScrubbedRouteStop
                key={entry.stop.id}
                entry={entry}
                index={index}
                sample={chapterSample}
                semanticActive={entry.stopIndex === resolvedIndex}
                mobile={mobile}
                onNavigate={onNavigate}
                focusLocked={!mobile && engagedChapterId === entry.stop.id}
                reducedMotion={reducedMotion}
              />
            );
          })}
        </div>
      </motion.nav>}

      {!living && <motion.footer
        initial={false}
        animate={entryOwnsClassicInterface
          ? undefined
          : {
              opacity: footerVisible ? 1 : 0,
              y: footerVisible ? 0 : 18,
            }}
        style={entryOwnsClassicInterface
          ? { opacity: classicFooterOpacity, y: classicFooterY }
          : undefined}
        transition={{
          duration: reducedMotion ? 0 : footerVisible ? (playInterfaceIntro ? 0.56 : 0.34) : 0.28,
          delay: reducedMotion || !playInterfaceIntro ? 0 : 0.24,
          ease: [0.16, 1, 0.3, 1],
        }}
        aria-hidden={!footerAccessible}
        inert={!footerAccessible}
        className={`route-atlas-status pointer-events-none absolute z-20 ${mobile ? 'inset-x-5 bottom-[max(28px,env(safe-area-inset-bottom))]' : 'bottom-7 left-8 right-[38%]'}`}
      >
        {mobile ? (
          <div className="route-atlas-footer flex items-end justify-between gap-5 pt-5">
            <div className="min-w-0">
              <motion.div
                key="route-overview"
                initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.58, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="route-atlas-overview-title font-serif text-[clamp(38px,13.8vw,54px)] uppercase leading-[0.78] tracking-[-0.055em] text-[#F4F4ED]">The Route</p>
                <p className="mt-5 font-ui text-[9px] uppercase tracking-[0.22em] text-[#D2FF00]/78">{mappedStops.length} places · photographic atlas</p>
              </motion.div>
            </div>
            <span className="mb-1 shrink-0 font-ui text-[9px] uppercase tracking-[0.24em] text-white/54">Scroll to follow</span>
          </div>
        ) : (
          <div className="route-atlas-footer grid grid-cols-[auto_1fr_auto] items-end gap-5 pt-5 font-ui uppercase">
            <span className="sr-only" aria-live="polite">
              {activeStop ? `Current place: ${activeStop.name}. Coordinates ${coordinateLabel}` : 'Route overview'}
            </span>
            <div>
              <ScrubbedRouteOrdinal
                sample={chapterSample}
                route={chapterRoute}
                className="block text-[9px] tracking-[0.28em] text-[#D2FF00]"
              />
              <span className="relative mt-1 block h-[1.2em] min-w-[12ch] text-[9px] tracking-[0.24em] text-white/52">
                {mappedStops.map((stop) => (
                  <ScrubbedPlaceName key={stop.id} stop={stop} sample={chapterSample} />
                ))}
              </span>
            </div>
            <div className="relative min-w-0 text-center text-[9px] tracking-[0.22em] text-[#D2FF00]/72">
              <motion.div
                initial={false}
                animate={{ opacity: sampledClassicActive ? 1 : 0, y: sampledClassicActive ? 0 : 4 }}
                transition={{ duration: reducedMotion ? 0 : 0.38, ease: [0.16, 1, 0.3, 1] }}
              >
                <ScrubbedCoordinateReadout sample={chapterSample} />
              </motion.div>
              <motion.p
                aria-hidden="true"
                initial={false}
                animate={{ opacity: sampledClassicActive ? 0 : 1, y: sampledClassicActive ? -4 : 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
              >
                {mappedStops.length} places · photographic atlas
              </motion.p>
            </div>
            <span className={`mb-1 shrink-0 font-ui text-[9px] uppercase tracking-[0.23em] text-white/54 ${sampledClassicActive ? 'invisible' : ''}`}>Scroll to follow</span>
          </div>
        )}
      </motion.footer>}
    </section>
  );
}
