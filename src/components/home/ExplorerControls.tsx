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
 * for a reader who would rather step than roam. Owner, 2026-09-29: 右下角这些
 * 按钮太多了，没有美感 — five dark pills (Recentre, All places, Index, and
 * the two steps with their neighbours' names) are now ONE slim bar: ‹ and ›
 * either side of where the reader is on the route ("01 / 06 · Miami", which
 * opens the numbered list, each row with its shield), and two small icons —
 * Recentre (in only while it is needed: the view has drifted from the place
 * in hand, or nothing is in hand; the R key) and, on the desktop, the Index
 * (the archive's contact sheet). A step's neighbour and an icon's name show
 * on hover and focus (a tip over the bar); screen readers hear them whole.
 * Bone ink on translucent olive, one hairline, a bone dot by the place in
 * hand; no lime of its own (the view's one lime stays the atlas's readout).
 * PROPOSED copy (2026-09-28/29), for the owner to approve: "Places", the tips
 * "Recentre · 01 Miami · R" and "Index", and for screen readers "Previous
 * place: …" / "Next place: …", "All places, 06. Now 01 Miami", "Recentre on
 * 01 Miami (R)", "Index: the contact sheet".
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
  recentre,
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
  /** Recentre: shown when the view has drifted from the place in hand (or
   *  nothing is in hand), back onto `place`. */
  recentre?: { shown: boolean; place: ExplorerPlace | null; onRecentre: () => void };
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
  const now = current ? places.find((place) => place.id === current) ?? null : null;
  const chevron = (d: string) => (
    <svg className="explorer-bar__glyph" viewBox="0 0 12 12" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const prevButton = (
    <button
      type="button"
      className="explorer-bar__icon explorer-controls__step explorer-controls__step--prev"
      onClick={onPrev}
      disabled={!prev}
      aria-label={prev ? `Previous place: ${pad2(prev.number)} ${prev.name}` : 'Previous place'}
      data-tip={prev ? `${pad2(prev.number)} ${prev.name}` : undefined}
    >
      {chevron('M7.5 2.5 4 6l3.5 3.5')}
    </button>
  );
  const nextButton = (
    <button
      type="button"
      className="explorer-bar__icon explorer-controls__step explorer-controls__step--next"
      onClick={onNext}
      disabled={!next}
      aria-label={next ? `Next place: ${pad2(next.number)} ${next.name}` : 'Next place'}
      data-tip={next ? `${pad2(next.number)} ${next.name}` : undefined}
    >
      {chevron('M4.5 2.5 8 6l-3.5 3.5')}
    </button>
  );
  // The bar's middle: where the reader is on the route ("01 / 06 · Miami"),
  // or, with nothing in hand, how many places there are. It opens the list.
  const allButton = (
    <button
      ref={toggleRef}
      type="button"
      className="explorer-bar__now explorer-controls__all"
      aria-expanded={listOpen}
      aria-controls={listOpen ? listId : undefined}
      aria-label={now ? `All places, ${pad2(total)}. Now ${pad2(now.number)} ${now.name}` : `All places, ${pad2(total)}`}
      onClick={() => onListOpen(!listOpen)}
    >
      {now ? (
        <>
          <span className="explorer-bar__dot" aria-hidden="true" />
          <span className="explorer-bar__no tabular-nums">{pad2(now.number)}</span>
          <span className="explorer-bar__of tabular-nums">/ {pad2(total)}</span>
          <span className="explorer-bar__name">{now.name}</span>
        </>
      ) : (
        <>
          <span className="explorer-bar__no tabular-nums">{pad2(total)}</span>
          <span className="explorer-bar__name">Places</span>
        </>
      )}
      <svg className="explorer-bar__caret" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2.5 6.25 5 3.75l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
  const recentreShown = !!recentre?.shown && !listOpen;
  const recentreLabel = recentre?.place ? `Recentre on ${pad2(recentre.place.number)} ${recentre.place.name} (R)` : 'Recentre (R)';
  const recentreButton = recentre && (
    <button
      type="button"
      className="explorer-bar__icon explorer-controls__recentre"
      data-shown={recentreShown ? '' : undefined}
      aria-hidden={!recentreShown}
      inert={!recentreShown}
      tabIndex={recentreShown ? undefined : -1}
      onClick={recentre.onRecentre}
      aria-keyshortcuts="R"
      aria-label={recentreLabel}
      data-tip={recentre.place ? `Recentre · ${pad2(recentre.place.number)} ${recentre.place.name}${phone ? '' : ' · R'}` : 'Recentre'}
    >
      <svg className="explorer-bar__glyph" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="7" cy="7" r="1.1" fill="currentColor" />
        <path d="M7 0.5v2.4M7 11.1v2.4M0.5 7h2.4M11.1 7h2.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    </button>
  );
  const indexButton = onIndex && (
    <button
      type="button"
      className="explorer-bar__icon explorer-controls__index"
      onClick={onIndex}
      aria-label="Index: the contact sheet"
      data-tip="Index"
    >
      <svg className="explorer-bar__glyph" viewBox="0 0 12 12" aria-hidden="true">
        <rect x="1.5" y="1.5" width="3.6" height="3.6" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <rect x="6.9" y="1.5" width="3.6" height="3.6" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <rect x="1.5" y="6.9" width="3.6" height="3.6" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <rect x="6.9" y="6.9" width="3.6" height="3.6" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
      </svg>
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
      {/* One instrument (2026-09-29, 右下角这些按钮太多了，没有美感): Recentre
          (in only when it is needed), the steps either side of where the
          reader is on the route (the list behind it), and the Index. */}
      <div className="explorer-bar" role="group" aria-label="Places">
        {recentreButton}
        {prevButton}
        {allButton}
        {nextButton}
        {indexButton}
      </div>
    </div>
  );
}
