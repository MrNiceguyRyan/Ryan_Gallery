import { useEffect, useRef } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { DUR_MS } from '../../lib/motion';
import { frameSrc, pad2 } from '../../lib/proofSheet';
import { coordLabel, frameRange, framesLabel, leadOf } from '../../lib/travelSilver';
import type { TravelChapter } from '../../lib/travelSilver';

// ─── A chapter's ticket on /travel ───
// Choosing a chapter prints its ticket — the homepage's 票根 in the chapter's
// own card stock — standing upright in the index: the chapter's cover above,
// at the photograph's own ratio (never cropped), one perforation, and the
// stub below printed with the homepage stub's own fields. Under it, the
// chapter's proof strip: every frame at its own ratio with its number in the
// issue. The whole ticket opens the story, and its photograph grows into the
// story's cover (MapboxMap names it for the view transition).

/** The cover at the one size the ticket asks for, so a warm-up on hover is
 *  the same request the print makes. */
export const coverSrc = (url: string) => `${url}?auto=format&w=800&q=82`;

/** The cover at the size it is when it has grown over the story (the story's
 *  own front-page size): the pixels the travel plate is made of, so the
 *  photograph is sharp when it is large instead of the ticket's print blown
 *  up ten times. */
export const plateSrc = (url: string) => `${url}?auto=format&w=2000&q=80`;

const warmed = new Map<string, HTMLImageElement>();
function warm(src: string) {
  const known = warmed.get(src);
  if (known) return known;
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  image.decode().catch(() => undefined);
  warmed.set(src, image);
  return image;
}
/** Fetch and decode a chapter's cover before its ticket prints (row hover,
 *  a press): without it Page's ticket showed its blank plum card for ~300ms
 *  while the develop swept over nothing. */
export function warmCover(url: string) {
  if (!url || typeof window === 'undefined') return;
  warm(coverSrc(url));
}
/** Fetch the full-size cover the moment opening the story is likely (the
 *  ticket hovered, focused or pressed), and hand back its image: the plate
 *  that grows over the story is drawn from it when it is ready in time. */
export function warmPlate(url: string) {
  if (!url || typeof window === 'undefined') return null;
  return warm(plateSrc(url));
}

interface TravelTicketProps {
  chapter: TravelChapter;
  total: number;
  reduce: boolean;
  /** The photograph as the story's opening plane is about to grow from it. */
  onOpen?: (photo: HTMLElement, event: MouseEvent<HTMLAnchorElement>, chapter: TravelChapter) => void;
}

export default function TravelTicket({ chapter, total, reduce, onOpen }: TravelTicketProps) {
  const ticketRef = useRef<HTMLAnchorElement>(null);
  const photoRef = useRef<HTMLSpanElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  // The print develops from the moment it is chosen — the same click that
  // sends the camera — so print and landing finish together. A class set on
  // the node two frames after mount (after the undeveloped mask has been
  // painted), not React state: it costs the flight no render.
  useEffect(() => {
    const ticket = ticketRef.current;
    if (!ticket) return;
    if (reduce) {
      ticket.classList.add('is-developed');
      return;
    }
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => ticket.classList.add('is-developed'));
    });
    return () => cancelAnimationFrame(frame);
  }, [reduce]);

  // The full-size cover is fetched once the ticket has printed (at once on a
  // hover, focus or press of it): opening the story is what a printed ticket
  // is for, and the plate that grows over the story is made of it. A click
  // that beats it grows the ticket's own print instead (MapboxMap).
  useEffect(() => {
    if (reduce) return;
    const timer = window.setTimeout(() => warmPlate(chapter.coverUrl), DUR_MS.scene);
    return () => window.clearTimeout(timer);
  }, [chapter.coverUrl, reduce]);

  // The proof strip runs sideways; a wheel over it turns it, until it has
  // run out, and then the index scrolls as usual.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = strip.scrollWidth - strip.clientWidth;
      if (max <= 0) return;
      if ((event.deltaY > 0 && strip.scrollLeft >= max - 1) || (event.deltaY < 0 && strip.scrollLeft <= 0)) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    };
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => strip.removeEventListener('wheel', onWheel);
  }, []);

  const [lng, lat] = leadOf(chapter);
  const count = chapter.frames.length;
  const range = frameRange(chapter);
  const paper = {
    ['--stub-paper' as string]: chapter.stock,
    ['--ratio' as string]: chapter.coverRatio,
  } as CSSProperties;
  return (
    <div className="travel-ticket-set" style={paper}>
      <a
        ref={ticketRef}
        className="travel-ticket"
        href={`/works/${chapter.slug}`}
        aria-label={`Open the ${chapter.name} story, chapter ${chapter.ordinal} of ${pad2(total)}`}
        onClick={(event) => { if (photoRef.current) onOpen?.(photoRef.current, event, chapter); }}
        onPointerEnter={() => { if (!reduce) warmPlate(chapter.coverUrl); }}
        onPointerDown={() => { if (!reduce) warmPlate(chapter.coverUrl); }}
        onFocus={() => { if (!reduce) warmPlate(chapter.coverUrl); }}
      >
        <span className="travel-ticket__photo" ref={photoRef}>
          <img src={coverSrc(chapter.coverUrl)} alt="" draggable={false} decoding="async" />
        </span>
        <span className="travel-ticket__stub font-ui">
          <span className="travel-stub__no font-serif">{chapter.ordinal}</span>
          <span className="travel-stub__of">/ {pad2(total)} · Admission</span>
          <span className="travel-stub__place">{chapter.name}</span>
          <span className="travel-stub__rule" aria-hidden="true" />
          <dl className="travel-stub__rows">
            <div><dt>Region</dt><dd>{chapter.region || '—'}</dd></div>
            <div><dt>Frames</dt><dd>{pad2(count)}</dd></div>
            <div><dt>Year</dt><dd>{chapter.year || '—'}</dd></div>
          </dl>
          <span className="travel-stub__coord">{coordLabel(lng, lat)}</span>
          <span className="travel-stub__admit">
            <span>Open the story</span>
            <ArrowUpRight size={12} strokeWidth={1.6} aria-hidden="true" className="travel-stub__arrow" />
          </span>
        </span>
      </a>
      {/* Out of the tab order: the strip is a picture of the chapter for
          the eye (hidden from assistive tech — the ticket names it), and a
          focusable scroller drew the focus ring on nothing a screen reader
          could reach. The wheel still turns it. */}
      <div className="travel-proof" ref={stripRef} aria-hidden="true" tabIndex={-1} data-lenis-prevent>
        {chapter.frames.map((frame) => (
          <span key={frame.number} className="travel-proof__frame" style={{ ['--ratio' as string]: frame.ratio } as CSSProperties}>
            <img src={frameSrc(frame.url, Math.round(144 * frame.ratio))} alt="" loading="lazy" decoding="async" draggable={false} />
            <span className="travel-proof__no font-ui">{pad2(frame.number)}</span>
          </span>
        ))}
      </div>
      <p className="travel-proof__label font-ui">
        {framesLabel(count)}
        {range ? ` · ${range}` : ''}
      </p>
    </div>
  );
}
