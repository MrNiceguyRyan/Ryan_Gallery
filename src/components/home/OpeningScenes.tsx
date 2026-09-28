import type { ReactNode } from 'react';
import { RAIN_COLUMNS, rainColumns, scrambleStrip, type FoundWord, type SceneId } from '../../lib/openingFilm';

// ── The opening film's scenes ──
// Plain markup, the same on the server and the client (no branch on the
// viewport or on reduced motion: CSS decides what shows). Each scene is a
// full-screen ground with one SHEET on it, the material the camera moves
// over; the found word in it is a `data-find` span with a baseline probe
// (`.of-bl`, a zero-height inline-block sitting on the baseline) so the
// island can measure where the word is in its sheet without reading any
// transform. Sheets are drawn at the desktop's scale: a found word's cap
// height is about 64 px (src/lib/openingFilm.ts, "The camera").
//
// The words are real text, never quoted from anything under copyright: the
// dictionary is Webster's 1913 (public domain), the book is Stevenson's
// Travels with a Donkey in the Cévennes (1879, public domain, the passage
// as he wrote it), and the rest is written for the film. Nothing here says
// anything about Ryan beyond "photographs / camera: Ryan Xu" and "a personal
// archive of travel and thought". The magazine's picture page and the strip
// of film carry his own photographs (index.astro picks them; the island
// fetches them after the first paint), each at its own ratio.

/** One of his photographs for the film: its URL (sized for the scene) and
 *  its width / height. */
export interface OpeningPicture {
  src: string;
  ratio: number;
}

/** A photograph the island loads later (no src in the markup: the first
 *  paint never waits on it). */
function Picture({ picture, className = '' }: { picture?: OpeningPicture; className?: string }) {
  if (!picture) return null;
  return <img className={`of-pic ${className}`} data-src={picture.src} alt="" draggable={false} />;
}

/** A found word: measured by the island (its box, its baseline). `ink` is
 *  the text to measure when the span's own text is not it (the locked
 *  letters' scramble strips), or "box" to take the span's layout box (the
 *  departure board's tiles). */
function Find({ children, word, className = '', ink }: { children: ReactNode; word: FoundWord; className?: string; ink?: string }) {
  return (
    <span className={`of-find ${className}`} data-find={word} data-ink={ink}>
      {children}
      <i className="of-bl" aria-hidden="true" />
    </span>
  );
}

function Scene({ id, word, children, className = '' }: { id: SceneId; word: FoundWord; children: ReactNode; className?: string }) {
  return (
    <div className={`of-scene of-scene--${id} ${className}`} data-scene={id} data-word={word}>
      {children}
    </div>
  );
}

// ── 1. Code ─────────────────────────────────────────────────────────────
// The archive's own jargon falling down the screen, read a character at a
// time; seven columns in the middle lock, one letter after another, into
// ARCHIVE, and the word lifts off the rain toward the lens.
const RAIN = rainColumns();
const LOCK = 'ARCHIVE';

function CodeScene() {
  return (
    <Scene id="code" word="archive">
      <div className="of-rain" data-rain>
        {RAIN.map((column, index) => (
          <div
            key={index}
            className="of-rain__col"
            style={{
              ['--i' as string]: column.i,
              ['--fall' as string]: `${column.fall.toFixed(2)}s`,
              ['--phase' as string]: column.phase.toFixed(3),
              ['--len' as string]: column.len,
            }}
          >
            <span className="of-rain__tail">{column.text.slice(0, -1)}</span>
            <span className="of-rain__head">{column.text.slice(-1)}</span>
          </div>
        ))}
      </div>
      <div className="of-lock" data-lock>
        <span className="of-lock__cells" aria-hidden="true">
          {LOCK.split('').map((letter, index) => (
            <span key={index} className="of-lock__cell" style={{ ['--k' as string]: index }} />
          ))}
        </span>
        <Find word="archive" className="of-lock__word" ink="ARCHIVE">
          {LOCK.split('').map((letter, index) => (
            <span key={index} className="of-lock__slot" style={{ ['--k' as string]: index }}>
              <span className="of-lock__strip">{scrambleStrip(letter, index)}</span>
              <span className="of-lock__letter">{letter}</span>
            </span>
          ))}
        </Find>
      </div>
    </Scene>
  );
}
export const RAIN_COUNT = RAIN_COLUMNS;

// ── 2. Dictionary (Webster's Revised Unabridged, 1913) ────────────────────
function DictionaryScene() {
  return (
    <Scene id="dictionary" word="archive">
      <div className="of-sheet of-dict" data-sheet>
        <div className="of-dict__head">
          <span>ARCHIPELAGO</span>
          <span>79</span>
          <span>ARCHLY</span>
        </div>
        <div className="of-dict__cols">
          <div className="of-dict__col">
            <p>
              <b>Ar&prime;chi&middot;pel&prime;a&middot;go</b>, <i>n.</i>; <i>pl.</i> <b>-goes</b>. [It. <i>arcipelago</i>.] Any sea or broad sheet of water interspersed with many islands or with a group of islands.
            </p>
            <p>
              <b>Ar&prime;chi&middot;tect</b>, <i>n.</i> [L. <i>architectus</i>, Gr. <i>architekt&omacr;n</i> chief artificer.] <b>1.</b> A person skilled in the art of building; one who makes it his occupation to form plans and designs of buildings, and to superintend their construction. <b>2.</b> A contriver, designer, or maker.
            </p>
            <p>
              <b>Ar&prime;chi&middot;trave</b>, <i>n.</i> [F. <i>architrave</i>.] <i>(Arch.)</i> (a) The lower division of an entablature, or that part which rests immediately on the column. (b) The group of moldings, or other architectural member, above and on both sides of a door or other opening.
            </p>
          </div>
          <div className="of-dict__col">
            <p className="of-dict__entry">
              <Find word="archive" className="of-dict__hw">Ar&prime;chive</Find>{' '}
              <span className="of-dict__pos">n.; pl. <b>Archives</b>.</span> [F. <i>archives</i>, pl., L. <i>archivum</i>, fr. Gr. <i>archeion</i> government house, fr. <i>arch&#275;</i> beginning, government.] <b>1.</b> <i>pl.</i> The place in which public records or historic documents are kept. <b>2.</b> <i>pl.</i> Public records or documents preserved as evidence of facts; as, the <i>archives</i> of a country or family.
            </p>
            <p>
              <b>Ar&prime;chi&middot;vist</b>, <i>n.</i> [F. <i>archiviste.</i>] A keeper of archives or records.
            </p>
            <p>
              <b>Ar&prime;chi&middot;volt</b>, <i>n.</i> [It. <i>archivolto</i>.] <i>(Arch.)</i> The architectural member surrounding the curved opening of an arch, corresponding to the architrave in the case of a square opening.
            </p>
            <p>
              <b>Arch&prime;ly</b>, <i>adv.</i> In an arch manner; with attractive slyness or roguishness; slyly; waggishly.
            </p>
          </div>
        </div>
      </div>
    </Scene>
  );
}

// ── 3. Newspaper ──────────────────────────────────────────────────────────
function NewspaperScene() {
  return (
    <Scene id="newspaper" word="archive">
      <div className="of-sheet of-news" data-sheet>
        <div className="of-news__mast">
          <span>Saturday Edition</span>
          <span className="of-news__name">The Harbour Ledger</span>
          <span>Price Two Cents</span>
        </div>
        <div className="of-news__flag">
          From the <Find word="archive">Archive</Find>
        </div>
        <div className="of-news__hed">What a drawer of negatives remembers</div>
        <div className="of-news__cols">
          <p>
            Every archive begins as a drawer. Somewhere between the first roll and the hundredth, the pictures stop being souvenirs and start being a record: of light on one particular afternoon, of a street that has since changed its name, of a sea that was grey the day the ferry ran late.
          </p>
          <p>
            Nobody sets out to keep one. The contact sheets pile up, the envelopes are labelled in pencil and then in ink, and one winter the labels are moved into a ledger with the date, the place and the frame number beside each.
          </p>
          <div className="of-news__photo" aria-hidden="true" />
          <p>
            What such a drawer remembers is rarely what its keeper meant it to. The famous view is there, of course, and the monument; but so is the waiter who stepped into the frame, the rain on the lens, the shadow of the one holding the camera.
          </p>
          <p>
            Read in order, the frames make a route. Read out of order, they make something closer to a mind: the same corner of light, again and again, in different countries.
          </p>
        </div>
      </div>
    </Scene>
  );
}

// ── 4. Magazine ───────────────────────────────────────────────────────────
// The wide shot: a whole spread lying on a table, CINEMA set across its
// gutter — light on the picture, dark on the page (one word, one blend).
function MagazineScene({ picture }: { picture?: OpeningPicture }) {
  return (
    <Scene id="magazine" word="cinema">
      <div className="of-sheet of-mag" data-sheet>
        <div className="of-mag__page of-mag__page--photo" aria-hidden="true">
          <div className="of-mag__picture">
            {picture && (
              <span className="of-mag__plate" style={{ aspectRatio: String(picture.ratio) }}>
                <Picture picture={picture} />
              </span>
            )}
          </div>
          <span className="of-mag__caption">The last row, before the lights go down.</span>
          <span className="of-mag__folio of-mag__folio--left">42</span>
        </div>
        <div className="of-mag__page of-mag__page--text">
          <span className="of-mag__kicker">The Picture Issue — Feature</span>
          <span className="of-mag__deck">Twenty-four frames a second, and the one that stays.</span>
          <div className="of-mag__body">
            <p>
              A film is mostly forgotten on the way home. What stays is a frame or two: a face turned to a window, a road seen through a windscreen, the exact grey of a harbour at five. The rest dissolves, and it is right that it should.
            </p>
            <p>
              A photograph works the other way round. It is the one frame, chosen and kept; the film it came from, the walk and the waiting and the weather, is the part the viewer has to supply.
            </p>
          </div>
          <span className="of-mag__folio of-mag__folio--right">43</span>
        </div>
        <div className="of-mag__giant">
          <Find word="cinema">Cinema</Find>
        </div>
      </div>
    </Scene>
  );
}

// ── 5. Subtitles ──────────────────────────────────────────────────────────
function SubtitlesScene() {
  return (
    <Scene id="subtitles" word="cinema">
      <div className="of-sheet of-subs" data-sheet>
        <div className="of-subs__frame" aria-hidden="true">
          <span className="of-subs__light of-subs__light--a" />
          <span className="of-subs__light of-subs__light--b" />
          <span className="of-subs__light of-subs__light--c" />
          <span className="of-subs__light of-subs__light--d" />
        </div>
        <div className="of-subs__lines">
          <span className="of-subs__line">Let&rsquo;s go to the <Find word="cinema">cinema</Find> tonight,</span>
          <span className="of-subs__line">if only to get out of the rain.</span>
        </div>
      </div>
    </Scene>
  );
}

// ── 6. Ticket ─────────────────────────────────────────────────────────────
function TicketScene() {
  return (
    <Scene id="ticket" word="cinema">
      <div className="of-sheet of-ticket" data-sheet>
        <div className="of-ticket__stub">
          <span className="of-ticket__admit">Admit one</span>
          <span className="of-ticket__no">Nº 004127</span>
        </div>
        <div className="of-ticket__body">
          <span className="of-ticket__admit">Admit one · Evening</span>
          <Find word="cinema" className="of-ticket__word">Cinema</Find>
          <span className="of-ticket__row">
            <span>Screen 2</span>
            <span>Row F</span>
            <span>Seat 12</span>
          </span>
          <span className="of-ticket__fine">Keep this ticket. Not valid for re-entry.</span>
        </div>
      </div>
    </Scene>
  );
}

// ── 7. Book (Stevenson, Travels with a Donkey in the Cévennes, 1879) ─────
function BookScene() {
  // Set line by line (each justified to the measure), so the found word
  // falls mid-line; the lines away from it are out of focus.
  return (
    <Scene id="book" word="travel">
      <div className="of-sheet of-book" data-sheet>
        <div className="of-book__text">
          <span className="of-book__line of-book__line--far">Why any one should desire to visit either Luc or</span>
          <span className="of-book__line of-book__line--near">Cheylard is more than my much-inventing spirit can</span>
          <span className="of-book__line">suppose. For my part, I <Find word="travel">travel</Find> not to go anywhere,</span>
          <span className="of-book__line">but to go. I travel for travel&rsquo;s sake. The great</span>
          <span className="of-book__line of-book__line--near">affair is to move; to feel the needs and hitches of</span>
          <span className="of-book__line of-book__line--far">our life more nearly; to come down off this feather-</span>
          <span className="of-book__line of-book__line--far">bed of civilisation, and find the globe granite</span>
        </div>
        <span className="of-book__gutter" aria-hidden="true" />
        <span className="of-book__folio" aria-hidden="true">Travels with a Donkey · 63</span>
      </div>
    </Scene>
  );
}

// ── 8. Departure board ────────────────────────────────────────────────────
const BOARD_ROWS = [
  ['08:15', 'MIAMI', '04', 'ON TIME'],
  ['08:40', 'ORLANDO', '07', 'BOARDING'],
  ['09:05', 'PAGE AZ', '02', 'ON TIME'],
  ['09:30', 'ZION', '11', 'DELAYED'],
  ['10:10', 'BRYCE', '03', 'ON TIME'],
  ['10:45', 'NEW YORK', '01', 'GATE OPEN'],
] as const;
const BOARD_COLS = [5, 10, 2, 9] as const;

function Flaps({ text, width, className = '' }: { text: string; width: number; className?: string }) {
  const cells = text.padEnd(width, ' ').slice(0, width).split('');
  return (
    <span className={`of-flaps ${className}`}>
      {cells.map((ch, index) => (
        <span key={index} className="of-flap">
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  );
}

function BoardScene() {
  return (
    <Scene id="board" word="travel">
      <div className="of-sheet of-board" data-sheet>
        <div className="of-board__title">
          <Find word="travel" className="of-board__word" ink="box">
            {'TRAVEL'.split('').map((ch, index) => (
              <span key={index} className="of-flap of-flap--big">{ch}</span>
            ))}
          </Find>
          <span className="of-board__label">Departures · Abfahrt · Départs</span>
        </div>
        <div className="of-board__rows" aria-hidden="true">
          {BOARD_ROWS.map((row, r) => (
            <div key={r} className="of-board__row" style={{ ['--r' as string]: r }}>
              {row.map((cell, c) => (
                <Flaps key={c} text={cell} width={BOARD_COLS[c]} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Scene>
  );
}

// ── 9. Telegram ───────────────────────────────────────────────────────────
function TelegramScene() {
  return (
    <Scene id="telegram" word="thought">
      <div className="of-sheet of-wire" data-sheet>
        <div className="of-wire__head">
          <span className="of-wire__title">Telegram</span>
          <span className="of-wire__field">Received at 16.40</span>
          <span className="of-wire__field">Words 17</span>
        </div>
        <div className="of-wire__tapes">
          <span className="of-wire__tape">ARRIVED STOP LIGHT HOLDING STOP</span>
          <span className="of-wire__tape">
            <Find word="thought">THOUGHT</Find> OF THE SEA ALL DAY STOP
          </span>
          <span className="of-wire__tape">MORE FILM TOMORROW STOP</span>
        </div>
        <div className="of-wire__rules" aria-hidden="true" />
      </div>
    </Scene>
  );
}

// ── 10. Notebook ──────────────────────────────────────────────────────────
function NotebookScene() {
  return (
    <Scene id="notebook" word="thought">
      <div className="of-sheet of-note" data-sheet>
        <span className="of-note__margin" aria-hidden="true" />
        <p className="of-note__text">
          <span className="of-note__line of-note__line--soft">tuesday — the ferry late again, the light good.</span>
          <span className="of-note__line">a <Find word="thought">thought</Find>, written down,</span>
          <span className="of-note__line">is a place you can go back to.</span>
          <span className="of-note__line of-note__line--soft">(frame 14: the rope, not the boat)</span>
        </p>
      </div>
    </Scene>
  );
}

// ── 11. Library catalogue card ────────────────────────────────────────────
function CatalogueScene() {
  return (
    <Scene id="catalogue" word="ryanxu">
      <div className="of-sheet of-card" data-sheet>
        <span className="of-card__rule" aria-hidden="true" />
        <div className="of-card__text">
          <span className="of-card__call">TR<br />790<br />.X8</span>
          <span className="of-card__lines">
            <span className="of-card__line">Xu, Ryan.</span>
            <span className="of-card__line of-card__line--in">A personal archive of travel</span>
            <span className="of-card__line of-card__line--in">and thought / photographs,</span>
            {/* The statement of responsibility names him in reading order:
                the cut to the film's edge print lines up letter for letter. */}
            <span className="of-card__line of-card__line--in"><Find word="ryanxu">Ryan Xu</Find>.</span>
            <span className="of-card__line of-card__line--in of-card__line--gap">1. Travel photography. I. Title.</span>
          </span>
        </div>
        <span className="of-card__hole" aria-hidden="true" />
      </div>
    </Scene>
  );
}

// ── 12. The edge of a strip of film ───────────────────────────────────────
const PERFS = Array.from({ length: 18 }, (_, index) => <i key={index} />);

function ContactScene({ pictures }: { pictures: readonly (OpeningPicture | undefined)[] }) {
  return (
    <Scene id="contact" word="ryanxu">
      <div className="of-sheet of-film" data-sheet>
        <div className="of-film__strip">
          <div className="of-film__perfs of-film__perfs--top" aria-hidden="true">{PERFS}</div>
          <div className="of-film__edge">
            <span>&#9656; 23A</span>
            <Find word="ryanxu" className="of-film__print">RYAN XU</Find>
            <span>&#9656; 24</span>
            <span>&#9656; 24A</span>
          </div>
          <div className="of-film__frames" aria-hidden="true">
            {(['a', 'b', 'c'] as const).map((key, index) => {
              const picture = pictures[index];
              return (
                <span
                  key={key}
                  className={`of-film__frame of-film__frame--${key}`}
                  // A frame of his is as wide as its photograph (the frame's
                  // height fixed): nothing is cropped or stretched.
                  style={picture ? { width: `${Math.round(640 * picture.ratio)}px` } : undefined}
                >
                  <Picture picture={picture} />
                </span>
              );
            })}
          </div>
          <div className="of-film__perfs of-film__perfs--bottom" aria-hidden="true">{PERFS}</div>
        </div>
      </div>
    </Scene>
  );
}

// ── 13. The clapperboard ──────────────────────────────────────────────────
// It carries every word the film found. RYAN XU is where the last run held
// it; the line under it is the first screen's own line, and its found words
// are chalked under before the sticks come down. The O of THOUGHT is a true
// circle drawn in the stroke's weight, so landing B can push through its
// counter exactly.
function Chalk() {
  return (
    <svg className="of-chalk" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1 6.2 C 18 4.8, 36 7.4, 54 5.6 S 86 4.6, 99 6" pathLength="1" />
    </svg>
  );
}

function SlateScene() {
  return (
    <Scene id="slate" word="ryanxu">
      <div className="of-sheet of-slate" data-sheet>
        <div className="of-slate__sticks" aria-hidden="true">
          <span className="of-slate__stick of-slate__stick--top" data-clapper />
          <span className="of-slate__stick of-slate__stick--base" />
        </div>
        <div className="of-slate__board">
          <div className="of-slate__row of-slate__row--name">
            <span className="of-slate__label">Camera</span>
            <Find word="ryanxu" className="of-slate__name">
              <span data-fly="ryan">RYAN</span> <span data-fly="xu">XU</span>
            </Find>
          </div>
          <div className="of-slate__row of-slate__row--prod">
            <span className="of-slate__label">Prod.</span>
            <span className="of-slate__prod">
              A PERSONAL{' '}
              <span className="of-slate__found" data-fly="archive">ARCHIVE<Chalk /></span>{' '}
              OF{' '}
              <span className="of-slate__found" data-fly="travel">TRAVEL<Chalk /></span>{' '}
              AND{' '}
              <span className="of-slate__found" data-fly="thought">
                TH<span className="of-slate__o" data-portal-o><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42.5" /></svg></span>UGHT<Chalk />
              </span>
            </span>
          </div>
          <div className="of-slate__row of-slate__row--grid">
            <span className="of-slate__cell"><span className="of-slate__label">Roll</span><span className="of-slate__val">001</span></span>
            <span className="of-slate__cell"><span className="of-slate__label">Scene</span><span className="of-slate__val">01</span></span>
            <span className="of-slate__cell"><span className="of-slate__label">Take</span><span className="of-slate__val">1</span></span>
            <span className="of-slate__cell"><span className="of-slate__label">Date</span><span className="of-slate__val">2026</span></span>
          </div>
          <div className="of-slate__foot">
            <span>24 fps</span>
            <span>35 mm</span>
            <span>Sync</span>
          </div>
        </div>
      </div>
    </Scene>
  );
}

/** Every scene, in no particular order (the island's schedule orders them).
 *  `pictures`: his photographs, the magazine's first, then the film's. */
export default function OpeningScenes({ pictures = [] }: { pictures?: readonly OpeningPicture[] }) {
  return (
    <>
      <CodeScene />
      <DictionaryScene />
      <NewspaperScene />
      <MagazineScene picture={pictures[0]} />
      <SubtitlesScene />
      <TicketScene />
      <BookScene />
      <BoardScene />
      <TelegramScene />
      <NotebookScene />
      <CatalogueScene />
      <ContactScene pictures={[pictures[1], pictures[2], pictures[3]]} />
      <SlateScene />
    </>
  );
}
