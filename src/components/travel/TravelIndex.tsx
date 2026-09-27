import { memo, useEffect, useRef } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EASE } from '../../lib/motion';
import { figuresLine, frameRange, greatCircleKm, groupThousands, chapterCentre } from '../../lib/travelSilver';
import type { TravelChapter } from '../../lib/travelSilver';
import TravelTicket, { warmCover } from './TravelTicket';

// ─── The index ───
// /travel's rail is the edition's index: every chapter at once, in the
// homepage's reading order and under the homepage's numbers, each row edged
// with its chapter's card stock. Choosing a row prints that chapter's ticket
// under it. What it replaced (owner-visible, 2026-09-27): the state
// accordion that hid four of six chapters, "Select a location" and its
// instruction line, the big "07", the cropped row thumbnails, FOCUS/VIEWING,
// the cropped detail photograph and the ivory "Explore story" pill.

export interface TravelFlight {
  from: string | null;
  to: string;
}

interface RowsProps {
  chapters: TravelChapter[];
  selected: string | null;
  hovered: string | null;
  /** Print the selected chapter's ticket under its row (the desktop rail). */
  tickets: boolean;
  reduce: boolean;
  onSelect: (slug: string) => void;
  onHover: (slug: string | null) => void;
  onOpenTicket?: (photo: HTMLElement, event: MouseEvent<HTMLAnchorElement>, chapter: TravelChapter) => void;
}

/** The rows, shared by the desktop rail and the phone sheet's list. */
export function TravelRows({ chapters, selected, hovered, tickets, reduce, onSelect, onHover, onOpenTicket }: RowsProps) {
  return (
    <ol
      className="travel-index__list no-scrollbar"
      data-open={tickets && selected ? '' : undefined}
      style={{ ['--rows' as string]: chapters.length } as CSSProperties}
    >
      {chapters.map((chapter) => {
        const isSelected = selected === chapter.slug;
        return (
          <li
            key={chapter.slug}
            id={`travel-row-${chapter.slug}`}
            className="travel-index__row"
            data-selected={isSelected ? '' : undefined}
            data-hot={hovered === chapter.slug ? '' : undefined}
            style={{ ['--stub-paper' as string]: chapter.stock } as CSSProperties}
          >
            <button
              type="button"
              className="travel-index__btn"
              aria-pressed={isSelected}
              aria-expanded={tickets ? isSelected : undefined}
              onClick={() => onSelect(chapter.slug)}
              onPointerDown={() => warmCover(chapter.coverUrl)}
              // A row is hovered when the pointer moves on it, not when a row
              // arrives under a still pointer: choosing a row collapses the
              // open ticket and scrolls the list, and the row that slid
              // under the cursor used to count as hovered — its mark undimmed
              // beside the chosen one's. (The browser re-runs mouseenter for
              // content moving under the cursor; it sends no pointermove.)
              onPointerMove={(event) => {
                if (event.pointerType === 'touch' || hovered === chapter.slug) return;
                onHover(chapter.slug);
                warmCover(chapter.coverUrl);
              }}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(chapter.slug)}
              onBlur={() => onHover(null)}
            >
              <span className="travel-index__tab" aria-hidden="true" />
              <span className="travel-index__no font-serif">{chapter.ordinal}</span>
              <span className="travel-index__name font-serif">{chapter.name}</span>
              <span className="travel-index__range font-ui">{frameRange(chapter)}</span>
              <span className="travel-index__meta font-ui">{figuresLine(chapter)}</span>
            </button>
            {tickets && (
              <AnimatePresence initial={false}>
                {isSelected && (
                  <motion.div
                    key="ticket"
                    className="travel-index__ticket"
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    transition={{ duration: reduce ? 0 : 0.46, ease: EASE.arrive }}
                  >
                    <div className="travel-index__ticket-inner">
                      <TravelTicket chapter={chapter} total={chapters.length} reduce={reduce} onOpen={onOpenTicket} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </li>
        );
      })}
    </ol>
  );
}

interface IndexProps extends Omit<RowsProps, 'tickets'> {
  /** The camera's trip, while it is on one (the footer reads it out). */
  flight: TravelFlight | null;
  routeKm: number;
}

/** The desktop rail: the index's header, its rows (with the chosen chapter's
 *  ticket) and a footer that reads the route, or the trip under way. */
function TravelIndex({ chapters, selected, hovered, reduce, onSelect, onHover, onOpenTicket, flight, routeKm }: IndexProps) {
  const listHost = useRef<HTMLDivElement>(null);
  // A chosen row comes to the top of the list once its ticket has opened;
  // with nothing chosen the list goes back to the top.
  useEffect(() => {
    const list = listHost.current?.querySelector<HTMLElement>('.travel-index__list');
    if (!list) return;
    const timer = window.setTimeout(() => {
      const row = selected ? list.querySelector<HTMLElement>(`#travel-row-${CSS.escape(selected)}`) : null;
      list.scrollTo({ top: row ? row.offsetTop - list.offsetTop : 0, behavior: reduce ? 'auto' : 'smooth' });
    }, selected && !reduce ? 480 : 0);
    return () => window.clearTimeout(timer);
  }, [reduce, selected]);

  const bySlug = (slug: string | null) => chapters.find((chapter) => chapter.slug === slug) ?? null;
  const to = flight ? bySlug(flight.to) : null;
  const from = flight ? bySlug(flight.from) : null;
  const leg = from && to ? greatCircleKm(chapterCentre(from), chapterCentre(to)) : 0;
  return (
    <div className="travel-index" ref={listHost}>
      <header className="travel-index__head">
        <p className="travel-index__eyebrow font-ui">Index</p>
        <p className="travel-index__figures font-ui">Frames</p>
      </header>
      <TravelRows
        chapters={chapters}
        selected={selected}
        hovered={hovered}
        tickets
        reduce={reduce}
        onSelect={onSelect}
        onHover={onHover}
        onOpenTicket={onOpenTicket}
      />
      <footer className="travel-index__foot font-ui" aria-live="off">
        {to ? (
          <>
            <span>{from ? `${from.name} → ${to.name}` : `→ ${to.name}`}</span>
            <span className="travel-index__foot-figure">{from ? `${groupThousands(leg)} km` : ''}</span>
          </>
        ) : (
          <>
            <span>Route · {chapters.length} chapters</span>
            <span className="travel-index__foot-figure">{groupThousands(routeKm)} km</span>
          </>
        )}
      </footer>
    </div>
  );
}

export default memo(TravelIndex);
