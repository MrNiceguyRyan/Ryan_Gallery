import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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

/** The places panel's two views: the list of places, and the contact sheet
 *  of every frame (the Index). */
export type PanelView = 'places' | 'sheet';

/**
 * The explorer's controls (src/lib/explorer.ts): the way through the places
 * for a reader who would rather step than roam.
 *
 * THE BAR. Owner, 2026-09-29: 右下角这些按钮太多了，没有美感 — one slim bar:
 * ‹ and › either side of where the reader is on the route ("01 / 06 ·
 * Miami", which opens the places panel). Owner, 2026-09-30: 右下角的胶囊会随着
 * 地区改变，产生位置大小往左偏移，我觉得应该固定住 — the capsule is one size in
 * every state, and never moves: its middle sets every state's words in the
 * same cells at once (the numbers, every place's name, "Places"; only the
 * one in hand is seen), so the widest of them — BRYCE CANYON — sizes it
 * whatever is on it, from the data, nothing measured. The total ("06")
 * stands in the same place idle and held; a new place's number and name
 * turn in once (one roll up, the old out of the top), quietly under the
 * cover's own flap. Recentre (in only while it is needed: the view has
 * drifted from the place in hand, or nothing is in hand; the R key) is a
 * button of its own beside the capsule, never in it: it comes and goes
 * without moving the capsule by a pixel.
 *
 * THE PANEL. Owner, 2026-09-30: 现在不知道index怎样和整体风格可以结合在一起，
 * 单独右下角跳转感觉效果很奇怪 — the Index (the archive's contact sheet) is no
 * longer a lone icon that jumps to a page of its own: it is the places
 * panel's second view. The panel opens from the bar on the list of places;
 * its head holds the two views — Places and Contact sheet — and the
 * sheet's paper grows out of the list's, in place, above the bar, the map
 * and the nav still round it: the six rows of places become the six rolls
 * of the sheet. Esc, the bar's middle, a click on the map outside or the
 * head's close put it away; focus goes back to the bar.
 *
 * A step's neighbour and an icon's name show on hover and focus (a tip over
 * the bar); screen readers hear them whole. Bone ink on translucent olive,
 * one hairline, a bone dot by the place in hand; no lime of its own (the
 * view's one lime stays the atlas's readout; the keyboard's ring is lime).
 * PROPOSED copy (2026-09-28/29/30), for the owner to approve: "Places", the
 * tips "Recentre · 01 Miami · R", the panel's views "Places 06" and
 * "Contact sheet 58", and for screen readers "Previous place: …" / "Next
 * place: …", "All places, 06. Now 01 Miami", "Recentre on 01 Miami (R)",
 * "Close".
 */
export default function ExplorerControls({
  places,
  current,
  prev,
  next,
  listOpen,
  onListOpen,
  view = 'places',
  onView,
  sheet,
  suspended = false,
  onPrev,
  onNext,
  onSelect,
  onEngage,
  phone = false,
  visible,
  recentre,
}: {
  places: ExplorerPlace[];
  current: string | null;
  prev: ExplorerPlace | null;
  next: ExplorerPlace | null;
  /** The places panel is open. */
  listOpen: boolean;
  onListOpen: (open: boolean) => void;
  /** Which of the panel's views is up. */
  view?: PanelView;
  onView?: (view: PanelView) => void;
  /** The contact sheet (the Index): set in the panel once it is wanted. */
  sheet?: ReactNode;
  /** A story is up over the panel: it keeps still (no outside click or Esc
   *  of its own) until the story is put away. */
  suspended?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (id: string) => void;
  onEngage?: (id: string | null) => void;
  phone?: boolean;
  /** Up once the explorer has been entered. */
  visible: boolean;
  /** Recentre: shown when the view has drifted from the place in hand (or
   *  nothing is in hand), back onto `place`. */
  recentre?: { shown: boolean; place: ExplorerPlace | null; onRecentre: () => void };
}) {
  const panelId = useId();
  const listId = useId();
  const sheetId = useId();
  const tabPlacesId = useId();
  const tabSheetId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // What the bar's middle showed before the place now in hand (null: the
  // idle "Places"): it turns out as the new one turns in.
  const lastRef = useRef<string | null>(null);
  const shownRef = useRef<string | null>(current);
  const hasSheet = !!sheet;
  const moveRef = useRef<'open' | 'grow'>('open');
  const prevRef = useRef({ open: listOpen && visible, view });
  const sheetOn = listOpen && view === 'sheet' && hasSheet;
  // The sheet is set once it is wanted — its view chosen, or the pointer or
  // the keyboard on its tab — and kept (its files are fetched once).
  const [sheetWanted, setSheetWanted] = useState(false);
  useEffect(() => {
    if (sheetOn) setSheetWanted(true);
  }, [sheetOn]);
  const wantSheet = () => {
    if (hasSheet) setSheetWanted(true);
  };
  const setView = (next: PanelView) => {
    if (next === 'sheet') wantSheet();
    onView?.(next);
  };

  // Open, the list takes focus at the place in hand (or the first); put away
  // from inside, focus goes back to the bar's middle.
  useEffect(() => {
    if (!listOpen) return;
    const list = listRef.current;
    if (view === 'places') {
      const row = list?.querySelector<HTMLElement>('[aria-current="true"]') ?? list?.querySelector<HTMLElement>('button');
      if (!panelRef.current?.contains(document.activeElement)) {
        row?.focus({ preventScroll: true });
        // Into view in the list's own scroll only: the paper cuts its views
        // (overflow: hidden is still a scroller) and must never be scrolled.
        if (row && list) {
          const top = row.offsetTop;
          if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = Math.max(0, top - 6);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listOpen]);
  useEffect(() => {
    if (!listOpen || suspended) return;
    const panel = panelRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onListOpen(false);
        toggleRef.current?.focus({ preventScroll: true });
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      // The views' tabs: ← and → go across (and choose), as a tab list does.
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && active?.getAttribute('role') === 'tab' && panel?.contains(active)) {
        event.preventDefault();
        event.stopPropagation();
        const nextView: PanelView = view === 'places' ? 'sheet' : 'places';
        if (nextView === 'sheet' && !hasSheet) return;
        setView(nextView);
        panel?.querySelector<HTMLElement>(`#${CSS.escape(nextView === 'places' ? tabPlacesId : tabSheetId)}`)?.focus({ preventScroll: true });
        return;
      }
      if (view !== 'places' || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
      const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('button') ?? []);
      const at = rows.indexOf(active as HTMLElement);
      if (at < 0) return;
      event.preventDefault();
      rows[(at + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus({ preventScroll: true });
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (panel?.contains(target) || toggleRef.current?.contains(target)) return;
      onListOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listOpen, onListOpen, suspended, view, hasSheet]);

  const total = places.length;
  const frames = places.reduce((sum, place) => sum + (place.frames || 0), 0);
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
  // or, with nothing in hand, how many places there are. It opens the panel.
  // Every state's words are set in the same cells at once (`data-at` says
  // which one is seen, and which one just left): the cells are as wide as
  // their widest word, so the capsule never changes size.
  if (shownRef.current !== (now?.id ?? null)) {
    lastRef.current = shownRef.current;
    shownRef.current = now?.id ?? null;
  }
  const at = (id: string | null) => (id === (now?.id ?? null) ? 'now' : id === lastRef.current ? 'was' : undefined);
  const allButton = (
    <button
      ref={toggleRef}
      type="button"
      className="explorer-bar__now explorer-controls__all"
      data-held={now ? '' : undefined}
      aria-expanded={listOpen}
      aria-controls={panelId}
      aria-label={now ? `All places, ${pad2(total)}. Now ${pad2(now.number)} ${now.name}` : `All places, ${pad2(total)}`}
      onClick={() => onListOpen(!listOpen)}
    >
      <span className="explorer-bar__fig" aria-hidden="true">
        <span className="explorer-bar__dot" />
        <span className="explorer-bar__stack explorer-bar__no tabular-nums">
          {places.map((place) => (
            <span key={place.id} data-at={at(place.id)}>{pad2(place.number)}</span>
          ))}
        </span>
        <span className="explorer-bar__of tabular-nums">
          <span className="explorer-bar__slash">/</span> {pad2(total)}
        </span>
      </span>
      <span className="explorer-bar__stack explorer-bar__name" aria-hidden="true">
        <span data-at={at(null)}>Places</span>
        {places.map((place) => (
          <span key={place.id} data-at={at(place.id)}>{place.name}</span>
        ))}
      </span>
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
      className="explorer-recentre explorer-controls__recentre"
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

  const open = listOpen && visible;
  // How the paper moves: the list opens and closes riding the bar (quick,
  // the house curve); a change of view grows or folds the paper in place,
  // and the whole sheet folds back down into the bar the same way (a large
  // plane's curve). Read off what changed in this render, so the paper's
  // transition is the right one from its first frame.
  if (prevRef.current.open !== open) moveRef.current = !open && view === 'sheet' ? 'grow' : 'open';
  else if (prevRef.current.view !== view) moveRef.current = 'grow';
  prevRef.current = { open, view };
  const tab = (id: string, own: PanelView, controls: string, label: string, count: number, aria: string) => (
    <button
      id={id}
      type="button"
      role="tab"
      className="explorer-panel__tab"
      aria-selected={view === own}
      aria-controls={controls}
      aria-label={aria}
      tabIndex={view === own ? 0 : -1}
      onClick={() => setView(own)}
      onPointerEnter={own === 'sheet' ? wantSheet : undefined}
      onFocus={own === 'sheet' ? wantSheet : undefined}
    >
      <span>{label}</span>
      <span className="explorer-panel__count tabular-nums">{pad2(count)}</span>
    </button>
  );
  return (
    <>
      {/* The places panel: one paper, two views. It lies over the map from
          the nav's band to the bar, its paper grown to the view's size (the
          list's box at the bar's end; the sheet's, the whole room). */}
      <div
        ref={panelRef}
        id={panelId}
        className={`explorer-panel font-ui${phone ? ' explorer-panel--phone' : ''}`}
        data-open={open ? '' : undefined}
        data-view={sheet ? view : 'places'}
        data-move={moveRef.current}
        role="dialog"
        aria-label="Places"
        aria-hidden={!open}
        inert={!open}
        style={{ '--rows': total } as CSSProperties}
      >
        <div className="explorer-panel__paper">
          <div className="explorer-panel__head">
            {sheet ? (
              <div className="explorer-panel__tabs" role="tablist" aria-label="Places">
                {tab(tabPlacesId, 'places', listId, 'Places', total, `Places, ${pad2(total)}`)}
                {tab(tabSheetId, 'sheet', sheetId, 'Contact sheet', frames, `Contact sheet, ${frames} frames`)}
              </div>
            ) : (
              <p className="explorer-panel__tabs">
                <span className="explorer-panel__tab">
                  <span>Places</span>
                  <span className="explorer-panel__count tabular-nums">{pad2(total)}</span>
                </span>
              </p>
            )}
            <button
              type="button"
              className="explorer-panel__close"
              aria-label="Close"
              onClick={() => {
                onListOpen(false);
                toggleRef.current?.focus({ preventScroll: true });
              }}
            >
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div
            ref={listRef}
            id={listId}
            className="explorer-list"
            role={sheet ? 'tabpanel' : undefined}
            aria-labelledby={sheet ? tabPlacesId : undefined}
            aria-hidden={view !== 'places' && !!sheet}
            inert={view !== 'places' && !!sheet}
            data-lenis-prevent
          >
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
          {sheet && (
            <div
              id={sheetId}
              className="explorer-sheet"
              role="tabpanel"
              aria-labelledby={tabSheetId}
              aria-hidden={view !== 'sheet'}
              inert={view !== 'sheet'}
            >
              {sheetWanted && sheet}
            </div>
          )}
        </div>
      </div>
      <div
        className={`explorer-controls font-ui${phone ? ' explorer-controls--phone' : ''}`}
        data-visible={visible ? '' : undefined}
        aria-hidden={!visible}
        inert={!visible}
      >
        {/* One instrument (2026-09-29, 右下角这些按钮太多了，没有美感), one
            size (2026-09-30, 应该固定住): the steps either side of where the
            reader is on the route (the panel behind it); Recentre beside it
            when it is needed. */}
        <div className="explorer-controls__row">
          {recentreButton}
          <div className="explorer-bar" role="group" aria-label="Places">
            {prevButton}
            {allButton}
            {nextButton}
          </div>
        </div>
      </div>
    </>
  );
}
