import { useEffect, useId, useRef } from 'react';
import { MapShield } from './RouteShield';
import { pad2, stateCode } from '../../lib/routeShield';
import { stockPaper } from '../../lib/ticketStock';

export interface ExplorerPlace {
  id: string;
  number: number;
  name: string;
  region?: string;
  slug?: string;
  frames: number;
  year?: number | string;
}

/**
 * The explorer's controls (src/lib/explorer.ts): the way through the places
 * for a reader who would rather step than roam — Prev and Next with the
 * neighbouring places' names, "All places" (the numbered list, each row
 * with its place's shield, a jump anywhere), and on the desktop the Index
 * (the archive's contact sheet). Every one of them lets the ticket in hand
 * go first: the explorer tears it before it moves. Bone ink; the one lime
 * in view stays the atlas's.
 */
export default function ExplorerControls({
  places,
  current,
  prev,
  next,
  listOpen,
  onListOpen,
  onPrev,
  onNext,
  onSelect,
  onIndex,
  onEngage,
  phone = false,
  visible,
}: {
  places: ExplorerPlace[];
  current: string | null;
  prev: ExplorerPlace | null;
  next: ExplorerPlace | null;
  listOpen: boolean;
  onListOpen: (open: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (id: string) => void;
  /** The Index (desktop): the contact sheet over the map. */
  onIndex?: () => void;
  onEngage?: (id: string | null) => void;
  phone?: boolean;
  /** Up once the explorer has been entered. */
  visible: boolean;
}) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Open, the list takes focus at the place in hand (or the first); closed
  // from inside, focus goes back to its toggle.
  useEffect(() => {
    if (!listOpen) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[aria-current="true"]') ?? list?.querySelector<HTMLElement>('button');
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: 'nearest' });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onListOpen(false);
        toggleRef.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const rows = Array.from(list?.querySelectorAll<HTMLElement>('button') ?? []);
      const at = rows.indexOf(document.activeElement as HTMLElement);
      if (at < 0) return;
      event.preventDefault();
      rows[(at + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus({ preventScroll: true });
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (list?.contains(target) || toggleRef.current?.contains(target)) return;
      onListOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [listOpen, onListOpen]);

  const total = places.length;
  const prevButton = (
    <button
      type="button"
      className="explorer-controls__step explorer-controls__step--prev"
      onClick={onPrev}
      disabled={!prev}
      aria-label={prev ? `Previous place: ${pad2(prev.number)} ${prev.name}` : 'Previous place'}
    >
      <span aria-hidden="true" className="explorer-controls__arrow">←</span>
      {prev && (
        <span className="explorer-controls__place">
          <span className="tabular-nums">{pad2(prev.number)}</span>
          <span className="explorer-controls__name">{prev.name}</span>
        </span>
      )}
    </button>
  );
  const nextButton = (
    <button
      type="button"
      className="explorer-controls__step explorer-controls__step--next"
      onClick={onNext}
      disabled={!next}
      aria-label={next ? `Next place: ${pad2(next.number)} ${next.name}` : 'Next place'}
    >
      {next && (
        <span className="explorer-controls__place">
          <span className="tabular-nums">{pad2(next.number)}</span>
          <span className="explorer-controls__name">{next.name}</span>
        </span>
      )}
      <span aria-hidden="true" className="explorer-controls__arrow">→</span>
    </button>
  );
  const allButton = (
    <button
      ref={toggleRef}
      type="button"
      className="explorer-controls__all"
      aria-expanded={listOpen}
      aria-controls={listOpen ? listId : undefined}
      onClick={() => onListOpen(!listOpen)}
    >
      All places <span className="tabular-nums explorer-controls__count">{pad2(total)}</span>
    </button>
  );
  return (
    <div
      className={`explorer-controls font-ui${phone ? ' explorer-controls--phone' : ''}`}
      data-visible={visible ? '' : undefined}
      aria-hidden={!visible}
      inert={!visible}
    >
      {listOpen && (
        <div
          ref={listRef}
          id={listId}
          className="explorer-list"
          role="dialog"
          aria-label={`All places, ${total}`}
          data-lenis-prevent
        >
          <p className="explorer-list__head">
            <span>All places</span>
            <span className="tabular-nums">{pad2(total)}</span>
          </p>
          <ol className="explorer-list__rows">
            {places.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="explorer-list__row"
                  aria-current={place.id === current ? 'true' : undefined}
                  onPointerEnter={() => onEngage?.(place.id)}
                  onPointerLeave={() => onEngage?.(null)}
                  onFocus={() => onEngage?.(place.id)}
                  onBlur={() => onEngage?.(null)}
                  onClick={() => {
                    onEngage?.(null);
                    onListOpen(false);
                    onSelect(place.id);
                  }}
                >
                  <span className="explorer-list__no tabular-nums">{pad2(place.number)}</span>
                  <span className="explorer-list__shield" aria-hidden="true">
                    <MapShield code={stateCode(place.region)} number={pad2(place.number)} accent={stockPaper(place.slug)} width={22} />
                  </span>
                  <span className="explorer-list__name">{place.name}</span>
                  <span className="explorer-list__meta">
                    {[place.region, `${place.frames} frames`].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {phone ? (
        <div className="explorer-controls__bar">
          {prevButton}
          {allButton}
          {nextButton}
        </div>
      ) : (
        // Two rows on the desktop, so a neighbour's name is never cut to its
        // first letter ("05 B…" at 1280): the list and the Index over the
        // steps, in the order the keyboard meets them.
        <>
          <div className="explorer-controls__bar explorer-controls__bar--tools">
            {allButton}
            {onIndex && (
              <button type="button" className="explorer-controls__index" onClick={onIndex}>
                Index
              </button>
            )}
          </div>
          <div className="explorer-controls__bar explorer-controls__bar--steps">
            {prevButton}
            {nextButton}
          </div>
        </>
      )}
    </div>
  );
}
