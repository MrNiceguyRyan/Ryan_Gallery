import { memo, useId } from 'react';
import type { CSSProperties } from 'react';
import { LANDMARK_VIEWBOX, landmarkFor } from '../../lib/placeLandmarks';
import type { LabelPlacement, TravelChapter } from '../../lib/travelSilver';

// ─── A chapter's mark on /travel ───
// ONE component for every chapter's mark, printed in the same system as the
// homepage atlas's places (owner, 2026-09-27: 地图上对应的小标志太丑了 — the
// rings, seats and arrival rings are gone): a dot of white ink with a hard
// knockout, keyed by the chapter's number. The map itself draws every place's
// dot (the `travel-rings` circle layers: it moves with the ground exactly and
// costs React nothing); this is the part that has to be DOM — the hit area,
// the dot of the place pointed at or chosen (so it can be struck on arrival),
// the chapter's number and name, a callout's leader, and the landmark.

/** Which side of its mark a place's landmark stands on. */
export type LandmarkSide = 'above' | 'right' | 'left' | 'below';
/** px per viewBox unit: `.travel-landmark` draws the 44-unit box at 58px. */
const LANDMARK_UNIT = 58 / 44;
/** The drawings span about ±13 units across. */
const LANDMARK_HALF_WIDTH = 13 * LANDMARK_UNIT;
/** A landmark stands this far off its mark's centre. */
export const LANDMARK_CLEARANCE = 12;

/**
 * Where a landmark's ground line (its viewBox origin, the box's middle) sits
 * relative to the centre of its mark. Above: standing over the place. Beside:
 * level with it, clear of the dot. Below: hung under it.
 */
export function landmarkOrigin(side: LandmarkSide, height: number, clearance: number) {
  const tall = height * LANDMARK_UNIT;
  if (side === 'below') return { x: 0, y: clearance + tall };
  if (side === 'right') return { x: clearance + 2 + LANDMARK_HALF_WIDTH, y: tall / 2 };
  if (side === 'left') return { x: -(clearance + 2 + LANDMARK_HALF_WIDTH), y: tall / 2 };
  return { x: 0, y: -clearance };
}

/** The landmark's box, mark-relative (for keeping names off it). */
export function landmarkBox(slug: string | null | undefined, side: LandmarkSide, clearance = LANDMARK_CLEARANCE) {
  const landmark = landmarkFor(slug);
  if (!landmark) return null;
  const origin = landmarkOrigin(side, landmark.height, clearance);
  const tall = landmark.height * LANDMARK_UNIT;
  return { x0: origin.x - LANDMARK_HALF_WIDTH, x1: origin.x + LANDMARK_HALF_WIDTH, y0: origin.y - tall, y1: origin.y };
}

/**
 * The first side, in order of preference, whose drawing no leg of the route
 * runs through. The route is canvas and the drawing is a DOM mark over it, so
 * a leg that crossed the drawing did not pass behind it — it read as a line
 * that stopped dead at the picture. `paths` are the place's legs in screen
 * px, each starting at the mark's centre.
 */
export function chooseLandmarkSide(
  paths: Array<Array<{ x: number; y: number }>>,
  height: number,
  clearance: number,
  sides: LandmarkSide[],
): LandmarkSide {
  const tall = height * LANDMARK_UNIT;
  const pad = 6;
  const crossed = (side: LandmarkSide) => {
    const origin = landmarkOrigin(side, height, clearance);
    const x0 = origin.x - LANDMARK_HALF_WIDTH - pad;
    const x1 = origin.x + LANDMARK_HALF_WIDTH + pad;
    const y0 = origin.y - tall - pad;
    // Standing over the mark, the drawing ends at its ground line: a leg
    // leaving the mark just under that line runs clear of it.
    const y1 = origin.y + (side === 'above' ? 0 : pad);
    return paths.some((path) => path.some((point, index) => {
      if (index === 0) return false;
      const from = path[index - 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / 2));
      for (let step = 0; step <= steps; step += 1) {
        const x = from.x + ((point.x - from.x) * step) / steps;
        const y = from.y + ((point.y - from.y) * step) / steps;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
      }
      return false;
    }));
  };
  return sides.find((side) => !crossed(side)) ?? sides[0];
}

/**
 * The place's own landmark, drawn beside its mark once the camera has come to
 * rest on it — the drawing the homepage atlas gives a place at close range,
 * from the same shared source (`placeLandmarks.tsx`) and the same
 * `.af-place__*` inks. Always mounted when the place has a drawing, so it can
 * fade out as well as in. The body (the dark mass under the ink) is feathered
 * towards its edges: on the print its closed edge showed as a hard rectangle.
 */
function TravelLandmark({ slug, shown, side }: { slug: string; shown: boolean; side: LandmarkSide }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const landmark = landmarkFor(slug);
  if (!landmark) return null;
  const origin = landmarkOrigin(side, landmark.height, LANDMARK_CLEARANCE);
  return (
    <svg
      className={`travel-landmark${shown ? ' is-shown' : ''}`}
      viewBox={LANDMARK_VIEWBOX}
      aria-hidden="true"
      style={{
        ['--landmark-x' as never]: `${origin.x}px`,
        ['--landmark-y' as never]: `${origin.y}px`,
      }}
    >
      {landmark.body && (
        <>
          <defs>
            <radialGradient id={`${uid}-feather`} cx="0.5" cy="0.55" r="0.5">
              <stop offset="0.42" stopColor="#fff" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id={`${uid}-body`} maskContentUnits="objectBoundingBox">
              <rect width="1" height="1" fill={`url(#${uid}-feather)`} />
            </mask>
          </defs>
          <path className="af-place__body" d={landmark.body} mask={`url(#${uid}-body)`} />
        </>
      )}
      <g dangerouslySetInnerHTML={{ __html: landmark.full }} />
    </svg>
  );
}

interface TravelMarkProps {
  chapter: TravelChapter;
  total: number;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  /** The flight to it ran its full clock: the dot is struck. */
  arrived: boolean;
  landmarkShown: boolean;
  landmarkSide: LandmarkSide;
  placement: LabelPlacement;
  /** The name waits (a callout forming where the camera is going, or a
   *  dimmed name that would sit on the selected place's landmark). */
  labelHidden: boolean;
  /** What a click on the mark does when it stands in a callout. */
  groupLabel: string | null;
  reduce: boolean;
  onMark: (slug: string) => void;
  onName: (slug: string) => void;
  onHover: (slug: string | null) => void;
}

/** A chapter's mark. Its name — the chapter's number and the place, both in
 *  the label face, the index's own numbering — only ever changes ink: its
 *  place and tracking never move while it is read. */
function TravelMark({
  chapter,
  total,
  selected,
  hovered,
  dimmed,
  arrived,
  landmarkShown,
  landmarkSide,
  placement,
  labelHidden,
  groupLabel,
  reduce,
  onMark,
  onName,
  onHover,
}: TravelMarkProps) {
  const leader = placement.leader;
  const labelStyle = {
    ['--lx' as string]: `${placement.dx}px`,
    ['--ly' as string]: `${placement.dy}px`,
  } as CSSProperties;
  return (
    <div
      className="travel-mark"
      data-selected={selected ? '' : undefined}
      data-hover={hovered ? '' : undefined}
      data-dimmed={dimmed ? '' : undefined}
    >
      {/* The dot of the place pointed at (over its canvas dot) or chosen
          (handed over from the canvas). Arrival is the homepage's strike: the
          dot pressed down and back like a stamp, its number printing. */}
      <span aria-hidden="true" className="travel-mark__dot" data-struck={!reduce && arrived ? '' : undefined} />
      <TravelLandmark slug={chapter.slug} shown={landmarkShown} side={landmarkSide} />
      {leader && (
        <svg className="travel-mark__leader" aria-hidden="true" data-hidden={labelHidden ? '' : undefined}>
          <line x1={leader.x1} y1={leader.y1} x2={leader.x2} y2={leader.y2} />
        </svg>
      )}
      <button
        type="button"
        className="travel-mark__hit"
        aria-label={groupLabel ?? `Chapter ${chapter.ordinal} of ${String(total).padStart(2, '0')}, ${chapter.name}: ${chapter.frames.length} ${chapter.frames.length === 1 ? 'frame' : 'frames'}`}
        aria-pressed={groupLabel ? undefined : selected}
        onClick={(event) => { event.stopPropagation(); onMark(chapter.slug); }}
        onMouseEnter={() => onHover(chapter.slug)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(chapter.slug)}
        onBlur={() => onHover(null)}
      />
      {/* The name is a target of its own, so a callout's stacked names each
          open their chapter while the marks open the group. Keyed on its
          placement mode: a name that changes side or joins a callout comes
          back in (CSS) rather than sliding across the map. */}
      <button
        key={placement.mode + (placement.group ?? '')}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="travel-mark__label"
        data-mode={placement.mode}
        data-hidden={labelHidden ? '' : undefined}
        style={labelStyle}
        onClick={(event) => { event.stopPropagation(); onName(chapter.slug); }}
        onMouseEnter={() => onHover(chapter.slug)}
        onMouseLeave={() => onHover(null)}
        data-travel-label={chapter.slug}
        data-side={placement.dx < 0 ? 'left' : 'right'}
        data-struck={!reduce && arrived ? '' : undefined}
      >
        {/* The number sits by the dot: "01 MIAMI" to the right of it,
            "MIAMI 01" to the left (the CSS turns the row round). */}
        <span className="travel-mark__ord font-ui">{chapter.ordinal}</span>
        <span className="travel-mark__name font-ui">{chapter.name}</span>
      </button>
    </div>
  );
}

export default memo(TravelMark);
