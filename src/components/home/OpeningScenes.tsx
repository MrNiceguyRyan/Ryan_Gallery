import type { CSSProperties, ReactNode } from 'react';
import { RAIN_COLUMNS, TYPE_STRIKE, rainColumns, scrambleStrip, seeded, type FoundWord, type KickEase, type SceneId } from '../../lib/openingFilm';

// ── The opening film's scenes ──
// Plain markup, the same on the server and the client (no branch on the
// viewport or on reduced motion: CSS decides what shows). Each scene is a
// full-screen ground with one SHEET on it, the material the camera moves
// over; the found word in it is a `data-find` span with a baseline probe
// (`.of-bl`, a zero-height inline-block sitting on the baseline) so the
// island can measure where the word is in its sheet without reading any
// transform. Sheets are drawn at the desktop's scale: a found word's cap
// height is about 64 px (src/lib/openingFilm.ts, "The camera"). Nothing that
// holds a found word is itself transformed at rest (layout is where the word
// is); what moves in a scene — the dial, the lens rings, the slices, the
// flaps — moves FROM somewhere TO its resting place (data-kick, played by
// the island on the film's clock).
//
// Type as material: engraved metal, paint in the grooves of a lens ring, a
// halftone screen, stencil paint on wood, an LED matrix, letterpress pressed
// into card, chalk, typewriter ink bleeding into a photocopy, a two-colour
// print a hair out of register. Faces: ours and web-safe / system stacks
// (Copperplate, Impact, DIN Condensed, SuperClarendon, Chalkduster, American
// Typewriter, Didot…, each with a fallback) — nothing is downloaded.
//
// The words are real text, never quoted from anything under copyright: the
// dictionary is Webster's 1913 (public domain), the book is Stevenson's
// Travels with a Donkey in the Cévennes (1879, public domain, the passage
// as he wrote it), and the rest is written for the film. Nothing here says
// anything about Ryan beyond "photographs / camera: Ryan Xu" and "a personal
// archive of travel and thought". Lines new in this cut are marked PROPOSED
// copy (awaiting the owner). The newspaper's picture and the contact sheet
// carry his own photographs in black and white (index.astro picks them; the
// island fetches them after the first paint), each at its own ratio.

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
 *  departure board's tiles, the slices' cells); `cap` gives the cap height
 *  outright (sheet px) when the word is set in several faces at once. */
function Find({ children, word, className = '', ink, cap }: { children: ReactNode; word: FoundWord; className?: string; ink?: string; cap?: number }) {
  return (
    <span className={`of-find ${className}`} data-find={word} data-ink={ink} data-cap={cap}>
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

/** A kick: this element moves FROM `from` (a transform) to `to` (its resting
 *  transform, none by default), `at` ms after its scene's cut, for `ms`, on
 *  a named curve (src/lib/openingFilm.ts KICK_EASES). `op` fades it in from
 *  that opacity over the same span. */
function kick(from: string, at: number, ms: number, ease: KickEase = 'lock', to = 'none', op?: number) {
  return {
    'data-kick': '',
    'data-from': from,
    'data-to': to,
    'data-at': at,
    'data-ms': ms,
    'data-ease': ease,
    ...(op != null ? { 'data-op': op } : {}),
  };
}

const vars = (v: Record<string, string | number>) => v as CSSProperties;

// ── 1. Code ─────────────────────────────────────────────────────────────
// The archive's own jargon falling down the screen, read a character at a
// time; seven columns in the middle lock, one letter after another, into
// ARCHIVE, and the word jumps off the rain toward the lens — as a SOLID: a
// stack of copies behind it, stepping back and darker as they go (its side),
// that closes up into the one word as it lands (the island plays it on the
// lift).
const RAIN = rainColumns();
const LOCK = 'ARCHIVE';
/** The copies stacked behind the lifting word. */
export const LOCK_DEPTH = 8;

function CodeScene() {
  return (
    <Scene id="code" word="archive">
      <div className="of-rain" data-rain>
        {RAIN.map((column, index) => (
          <div
            key={index}
            className="of-rain__col"
            style={vars({
              '--i': column.i,
              '--fall': `${column.fall.toFixed(2)}s`,
              '--phase': column.phase.toFixed(3),
              '--len': column.len,
            })}
          >
            <span className="of-rain__tail">{column.text.slice(0, -1)}</span>
            <span className="of-rain__head">{column.text.slice(-1)}</span>
          </div>
        ))}
      </div>
      <div className="of-lock" data-lock>
        <span className="of-lock__cells" aria-hidden="true">
          {LOCK.split('').map((letter, index) => (
            <span key={index} className="of-lock__cell" style={vars({ '--k': index })} />
          ))}
        </span>
        <Find word="archive" className="of-lock__word" ink="ARCHIVE">
          <span className="of-lock__depth" aria-hidden="true">
            {Array.from({ length: LOCK_DEPTH }, (_, k) => (
              <span key={k} className="of-lock__layer" data-depth={LOCK_DEPTH - k} style={vars({ '--d': LOCK_DEPTH - k })}>
                {LOCK}
              </span>
            ))}
          </span>
          {LOCK.split('').map((letter, index) => (
            <span key={index} className="of-lock__slot" style={vars({ '--k': index })}>
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
              <b>Ar&prime;chi&middot;tect</b>, <i>n.</i> [L. <i>architectus</i>, Gr. <i>architekt&#333;n</i> chief artificer.] <b>1.</b> A person skilled in the art of building; one who makes it his occupation to form plans and designs of buildings, and to superintend their construction. <b>2.</b> A contriver, designer, or maker.
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

// ── 3. Newspaper, in black and white ──────────────────────────────────────
// Newsprint and one ink: a heavy condensed flag, and a halftone of one of
// his photographs (a screen of dots, thresholded) — the drawn stand-in until
// it arrives.
function NewspaperScene({ picture }: { picture?: OpeningPicture }) {
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
        <div className="of-news__fig" aria-hidden="true">
          {/* The box takes the photograph's own ratio (never cropped). */}
          <span className="of-news__halftone" style={picture ? { aspectRatio: String(picture.ratio) } : undefined}>
            <span className="of-news__plate">
              <Picture picture={picture} />
            </span>
            <span className="of-news__screen" />
          </span>
          {/* PROPOSED copy (awaiting the owner): the picture's credit line. */}
          <span className="of-news__credit">Photograph from the archive</span>
        </div>
        <div className="of-news__cols">
          <p>
            Every archive begins as a drawer. Somewhere between the first roll and the hundredth, the pictures stop being souvenirs and start being a record: of light on one particular afternoon, of a street that has since changed its name, of a sea that was grey the day the ferry ran late.
          </p>
          <p>
            Nobody sets out to keep one. The contact sheets pile up, the envelopes are labelled in pencil and then in ink, and one winter the labels are moved into a ledger with the date, the place and the frame number beside each.
          </p>
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

// ── 4. A camera's top plate ───────────────────────────────────────────────
// The front of a rangefinder, close: brushed chrome, the maker's word
// engraved and filled with black paint (here the word is CAMERA: no maker's
// name), the windows, the shutter-speed dial on top turning to its setting
// and the lens mount below. An original drawing; no real camera's name,
// shape or mark.
const DIAL = ['B', '1', '2', '4', '8', '15', '30', '60', '125', '250', '500', '1000', 'B', '1', '2', '4', '8', '15', '30', '60'];

function TopPlateScene() {
  return (
    <Scene id="topplate" word="camera">
      <div className="of-sheet of-top" data-sheet>
        <div className="of-top__body">
          <span className="of-top__rewind" aria-hidden="true" />
          <span className="of-top__shoe" aria-hidden="true" />
          <span className="of-top__release" aria-hidden="true" />
          <span className="of-top__dial" aria-hidden="true">
            <span className="of-top__dial-band" {...kick('translate3d(-420px, 0, 0)', 40, 300, 'lock')}>
              {DIAL.map((v, i) => (
                <span key={i} className="of-top__dial-n">
                  {v}
                </span>
              ))}
            </span>
            <span className="of-top__dial-knurl" {...kick('translate3d(-420px, 0, 0)', 40, 300, 'lock')} />
            <span className="of-top__dial-shade" />
          </span>
          <div className="of-top__plate">
            <span className="of-top__window of-top__window--vf" aria-hidden="true" />
            <span className="of-top__window of-top__window--frame" aria-hidden="true" />
            <span className="of-top__window of-top__window--rf" aria-hidden="true" />
            <Find word="camera" className="of-top__name">CAMERA</Find>
            <span className="of-top__serial" aria-hidden="true">No 1048226</span>
          </div>
          <div className="of-top__leather" aria-hidden="true" />
          {/* The lens stands out of the body toward the camera (depth: it
              moves against the plate as the camera swings in). */}
          <span className="of-top__mount" aria-hidden="true">
            <span className="of-top__mount-ring" />
            <span className="of-top__mount-scale">16&ensp;11&ensp;8&ensp;4&ensp;|&ensp;4&ensp;8&ensp;11&ensp;16</span>
          </span>
        </div>
      </div>
    </Scene>
  );
}

// ── 5. The lens, its rings ────────────────────────────────────────────────
// A lens stood on its mount, the camera close on its barrel: rings of black
// anodised metal with their scales in white paint, the type WRAPPED ROUND
// THE CYLINDER (flat plates at their angles in 3D, turning about the
// barrel's axis). On the beat the name ring turns CAMERA round to the front
// and locks; the aperture and focus rings tick the other way. PROPOSED (the
// owner may give his own): the engraved figures here and on the top plate —
// 1:2, f = 50 mm, the serial numbers — are the drawing's, not a claim about
// the camera he uses.
const R = 720;
function Ring({ className, plates, from, at = 0, ms = 260, ease = 'lock' as KickEase }: { className: string; plates: { a: number; text: ReactNode; find?: boolean; cls?: string }[]; from: number; at?: number; ms?: number; ease?: KickEase }) {
  return (
    <div className={`of-ring ${className}`}>
      <div className="of-ring__turn" {...kick(`translateZ(-${R}px) rotateY(${from}deg)`, at, ms, ease, `translateZ(-${R}px) rotateY(0deg)`)}>
        {plates.map((p, i) => (
          // The found word's plate spans the barrel (its layout is where it
          // rests); the others are as wide as their type, turned about the
          // axis from their own middle (less to draw as the ring turns).
          <span
            key={i}
            className={`of-ring__plate${p.find ? '' : ' of-ring__plate--tight'} ${p.cls ?? ''}`}
            style={{ transform: p.find ? `rotateY(${p.a}deg) translateZ(${R}px)` : `rotateY(${p.a}deg) translateZ(${R}px) translateX(-50%)` }}
          >
            {p.find ? <Find word="camera" className="of-lens__name">{p.text}</Find> : p.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function LensScene() {
  return (
    <Scene id="lens" word="camera">
      <div className="of-sheet of-lens" data-sheet>
        <div className="of-lens__barrel">
          <span className="of-lens__band of-lens__band--lip" aria-hidden="true" />
          <div className="of-lens__band of-lens__band--name">
            <Ring
              className="of-ring--name"
              from={-118}
              plates={[
                { a: -62, text: '⌀ 46' },
                { a: -34, text: '1:2' },
                { a: 0, text: 'CAMERA', find: true },
                { a: 34, text: 'f = 50 mm' },
                { a: 64, text: 'No 2618004' },
                { a: 100, text: '1:2' },
                { a: 136, text: 'f = 50 mm' },
                { a: 172, text: '\u2300 46' },
              ]}
            />
            <span className="of-lens__shade" aria-hidden="true" />
          </div>
          <div className="of-lens__band of-lens__band--aperture" aria-hidden="true">
            <span className="of-lens__knurl" {...kick('translate3d(180px, 0, 0)', 0, 260, 'lock')} />
            <Ring
              className="of-ring--aperture"
              from={26}
              plates={['2', '2.8', '4', '5.6', '8', '11', '16'].map((text, i) => ({ a: (i - 3) * 13, text, cls: i === 3 ? 'is-set' : '' }))}
            />
            <span className="of-lens__shade" />
          </div>
          <div className="of-lens__band of-lens__band--dof" aria-hidden="true">
            <span className="of-lens__dof">
              <span>16</span>
              <span>11</span>
              <span>8</span>
              <span>4</span>
              <span className="of-lens__index" />
              <span>4</span>
              <span>8</span>
              <span>11</span>
              <span>16</span>
            </span>
            <span className="of-lens__shade" />
          </div>
          <div className="of-lens__band of-lens__band--focus" aria-hidden="true">
            <Ring
              className="of-ring--focus"
              from={-34}
              ms={300}
              plates={['∞', '10', '5', '3', '2', '1.5', '1.2', '1', '.9', '.8', '.7'].map((text, i) => ({ a: (i - 4) * 11, text }))}
            />
            <span className="of-lens__knurl of-lens__knurl--grip" {...kick('translate3d(-240px, 0, 0)', 0, 300, 'lock')} />
            <span className="of-lens__shade" />
          </div>
        </div>
      </div>
    </Scene>
  );
}

// ── 6. Slices ─────────────────────────────────────────────────────────────
// The frame cut into strips of six materials — chrome, newsprint, crate
// wood, an LED panel, letterpress card, a blackboard — and CAMERA set across
// six of them, one letter per strip, each letter in its strip's own face and
// finish. On the beat the strips slam in from above and below, the word's
// first, and lock.
const PITCH = 96;
type Material = 'chrome' | 'news' | 'wood' | 'led' | 'card' | 'board' | 'steel' | 'film';
const SLICE_WORD: { letter: string; material: Material }[] = [
  { letter: 'C', material: 'chrome' },
  { letter: 'A', material: 'news' },
  { letter: 'M', material: 'wood' },
  { letter: 'E', material: 'led' },
  { letter: 'R', material: 'card' },
  { letter: 'A', material: 'board' },
];
// The strips either side of the word: mostly dark stock (the shot stays in
// the dark block of the grade), a light one now and then.
const SLICE_OUTER_CYCLE: Material[] = ['steel', 'led', 'film', 'board', 'news', 'steel', 'wood', 'film', 'led', 'board', 'card', 'film'];
const SLICE_OUTER = 12;
/** Every strip: its index from the word's first (negative to the left), its
 *  material, and when and from where it slams in. */
const SLICES = Array.from({ length: SLICE_OUTER * 2 + 6 }, (_, n) => {
  const j = n - SLICE_OUTER;
  const inWord = j >= 0 && j < 6;
  const material: Material = inWord ? SLICE_WORD[j].material : SLICE_OUTER_CYCLE[(j + 24) % SLICE_OUTER_CYCLE.length];
  const reach = Math.abs(j - 2.5);
  const at = inWord ? Math.round(reach * 10) : Math.round(30 + reach * 9);
  const up = n % 2 === 0;
  // The outer strips rest a little out of line (a cut-up); the word's are
  // true to one baseline.
  const rand = seeded(7000 + n);
  const rest = inWord ? 0 : Math.round((rand() - 0.5) * 90);
  // How far it slams from: past the frame's edge for the word's strips, a
  // ragged part of the way for the rest (the cut opens on a broken frame).
  const reachPx = inWord ? 900 : Math.round(600 + rand() * 600);
  return { j, n, inWord, material, at, up, rest, reachPx };
});
/** The veil over the strips round the word: at the shot's read (the finder's
 *  lock, ENTRANCES.slices.read), down over 90 ms. */
const SLICES_VEIL = { at: 190, ms: 90 } as const;
const NEWS_TEXT =
  'Every archive begins as a drawer. The contact sheets pile up, the envelopes are labelled in pencil and then in ink. Read in order, the frames make a route; read out of order, something closer to a mind. ';

/** What a strip carries besides its stock (the word's strips carry nothing
 *  near the word). */
function SliceBody({ material, n, inWord }: { material: Material; n: number; inWord: boolean }) {
  switch (material) {
    case 'news':
      // (The word's own newsprint strip is bare: a paragraph over the
      // halftone A pulled the eye off the word.)
      return inWord ? null : <span className="of-slice__news">{NEWS_TEXT.repeat(3)}</span>;
    case 'led':
      return <span className="of-slice__dots" />;
    case 'card':
      return inWord ? null : <span className="of-slice__big">{'&R3'[n % 3]}</span>;
    case 'board':
      return inWord ? null : <span className="of-slice__chalk">{['1/125', 'f/8', '36'][n % 3]}</span>;
    case 'wood':
      return inWord ? null : <span className="of-slice__stencil">{['07', 'UP', '35'][n % 3]}</span>;
    case 'film':
      return <span className="of-slice__perfs" />;
    case 'steel':
    case 'chrome':
      return inWord ? null : <span className="of-slice__screw" />;
    default:
      return null;
  }
}

function SlicesScene() {
  return (
    <Scene id="slices" word="camera">
      <div className="of-sheet of-slices" data-sheet>
        {SLICES.map((s) => (
          <span
            key={s.n}
            className={`of-slice of-slice--${s.material}${s.inWord ? ' is-word' : ''}`}
            style={vars({ left: `${1012 + s.j * PITCH}px`, top: `${s.rest}px`, '--rest': `${s.rest}px` })}
            {...kick(`translate3d(0, ${s.up ? -s.reachPx : s.reachPx}px, 0)`, s.at, 150, 'whip')}
          >
            {/* What a strip carries besides its stock — cleared out of the
                word's band on the strips round it, so nothing but the six
                letters is there to read at the word's height. */}
            <span className={`of-slice__ink${s.inWord ? '' : ' is-banded'}`}>
              <SliceBody material={s.material} n={s.n} inWord={s.inWord} />
            </span>
          </span>
        ))}
        {/* As the word can be read, the strips either side of the word's six
            go down (a veil, not over the letters): the eye has one place to
            go. */}
        <span className="of-slices__veil of-slices__veil--l" aria-hidden="true" {...kick('none', SLICES_VEIL.at, SLICES_VEIL.ms, 'lock', 'none', 0)} />
        <span className="of-slices__veil of-slices__veil--r" aria-hidden="true" {...kick('none', SLICES_VEIL.at, SLICES_VEIL.ms, 'lock', 'none', 0)} />
        <span className="of-slices__shade" aria-hidden="true" />
        <Find word="camera" className="of-slices__word" ink="box" cap={64}>
          {SLICE_WORD.map((cell, j) => {
            const s = SLICES[SLICE_OUTER + j];
            return (
              <span key={j} className={`of-slices__cell of-slices__cell--${cell.material}`} {...kick(`translate3d(0, ${s.up ? -s.reachPx : s.reachPx}px, 0)`, s.at, 150, 'whip')}>
                <span className="of-slices__letter">{cell.letter}</span>
              </span>
            );
          })}
        </Find>
      </div>
    </Scene>
  );
}

// ── 7. Departure board ────────────────────────────────────────────────────
const BOARD_ROWS = [
  ['08:15', 'MIAMI', '04', 'ON TIME'],
  ['08:40', 'ORLANDO', '07', 'BOARDING'],
  ['09:05', 'PAGE AZ', '02', 'ON TIME'],
  ['09:30', 'ZION', '11', 'DELAYED'],
  ['10:10', 'BRYCE', '03', 'ON TIME'],
  ['10:45', 'NEW YORK', '01', 'GATE OPEN'],
] as const;
const BOARD_COLS = [5, 10, 2, 9] as const;

function Flaps({ text, width, row }: { text: string; width: number; row: number }) {
  const cells = text.padEnd(width, ' ').slice(0, width).split('');
  return (
    <span className="of-flaps">
      {cells.map((ch, index) => (
        <span key={index} className="of-flap">
          {ch === ' ' ? ' ' : ch}
          {row === 1 && ch !== ' ' && <span className="of-flap__leaf" {...kick('scaleY(0.04)', 90 + index * 22, 150, 'fall')}><span>{ch}</span></span>}
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
              <span key={index} className="of-flap of-flap--big">
                <span className="of-flap__top">
                  <span>{ch}</span>
                </span>
                {/* The word's flaps fall in real depth: each leaf swings down
                    from the hinge, out of the board toward the lens, and lands
                    flat (the rows' small flaps stay a flat squash). */}
                <span className="of-flap__leaf of-flap__leaf--3d" {...kick('perspective(600px) rotateX(88deg)', 16 + index * 18, 110, 'fall', 'perspective(600px) rotateX(0deg)')}>
                  <span>{ch}</span>
                </span>
              </span>
            ))}
          </Find>
          <span className="of-board__label">Departures · Abfahrt · Départs</span>
        </div>
        <div className="of-board__rows" aria-hidden="true">
          {BOARD_ROWS.map((row, r) => (
            <div key={r} className="of-board__row">
              {row.map((cell, c) => (
                <Flaps key={c} text={cell} width={BOARD_COLS[c]} row={r} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Scene>
  );
}

// ── 8. Book (Stevenson, Travels with a Donkey in the Cévennes, 1879) ─────
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

// ── 9. A telegram, typed, then photocopied ───────────────────────────────
// Black and white: the printed form, the typewriter's letters each struck a
// little harder or softer, a little high or low, the ink bled into the
// paper, and the copier's toner and dark edge over all of it. It cuts in on
// the carriage slamming home (its entrance), and THOUGHT is struck a letter
// at a time.
/** Typed text: each letter struck a little harder or softer and a little
 *  high or low (by up to `jitter` px either way). `strike`: the letters are
 *  struck on the film's clock as the shot lands (TYPE_STRIKE), each a size
 *  too big and pressed flat. */
function Typed({ text, seed, jitter = 1.6, strike = false }: { text: string; seed: number; jitter?: number; strike?: boolean }) {
  const rand = seeded(seed);
  let struck = 0;
  return (
    <>
      {text.split('').map((ch, i) => {
        const ink = 0.84 + rand() * 0.16;
        const lift = (rand() - 0.5) * 2 * jitter;
        if (ch === ' ') return ' ';
        const order = struck;
        struck += 1;
        return (
          <span key={i} className="of-typed" style={vars({ '--ink': ink.toFixed(2), '--lift': `${lift.toFixed(1)}px` })}>
            {strike ? (
              <span className="of-typed__key" {...kick(`scale(${TYPE_STRIKE.k})`, TYPE_STRIKE.at + order * TYPE_STRIKE.stagger, TYPE_STRIKE.ms, 'snap', 'none', 0)}>
                {ch}
              </span>
            ) : (
              ch
            )}
          </span>
        );
      })}
    </>
  );
}

function TypewriterScene() {
  return (
    <Scene id="typewriter" word="thought">
      <div className="of-sheet of-type" data-sheet>
        <span className="of-type__edge" aria-hidden="true" />
        <div className="of-type__head" aria-hidden="true">
          <span className="of-type__title">Telegram</span>
          <span className="of-type__field">Received at 16.40</span>
          <span className="of-type__field">Words 17</span>
        </div>
        <div className="of-type__lines">
          <span className="of-type__line">
            <Typed text="ARRIVED STOP LIGHT HOLDING STOP" seed={31} />
          </span>
          <span className="of-type__line">
            {/* The found word's letters jitter by a pixel at most: the reading
                rule sits 6 px under its baseline and must clear every one. */}
            <Find word="thought">
              <Typed text="THOUGHT" seed={47} jitter={1} strike />
            </Find>{' '}
            <Typed text="OF THE SEA ALL DAY STOP" seed={53} />
          </span>
          <span className="of-type__line">
            <Typed text="MORE FILM TOMORROW STOP" seed={71} />
          </span>
        </div>
        <span className="of-type__toner" aria-hidden="true" />
      </div>
    </Scene>
  );
}

// ── 10. A letterpress poster ──────────────────────────────────────────────
// Wood type of several faces pressed into thick card, two inks (black and a
// red) a hair out of register, and the notebook's line set as a broadside.
function PosterScene() {
  return (
    <Scene id="poster" word="thought">
      <div className="of-sheet of-poster" data-sheet>
        {/* The red A is a layer of its own: it arrives slower than the page
            (a depth behind the black). */}
        <span className="of-poster__giant" aria-hidden="true" {...kick('scale(1.32)', 0, 300, 'lock')}>A</span>
        <span className="of-poster__rule of-poster__rule--top" aria-hidden="true" />
        <div className="of-poster__set">
          <span className="of-poster__l of-poster__l--1">
            <span className="of-poster__a">a</span> <Find word="thought" className="of-poster__word">Thought</Find>,
          </span>
          <span className="of-poster__l of-poster__l--2">Written down,</span>
          <span className="of-poster__l of-poster__l--3">is a place</span>
          <span className="of-poster__l of-poster__l--4">you can go</span>
          <span className="of-poster__l of-poster__l--5">back to.</span>
        </div>
        <span className="of-poster__rule of-poster__rule--bottom" aria-hidden="true" />
        <span className="of-poster__stars" aria-hidden="true">&#9733;&emsp;&#9733;&emsp;&#9733;</span>
      </div>
    </Scene>
  );
}

// ── 11. The edge of a strip of film, on a contact sheet ───────────────────
// A black-and-white contact print: the strip's rebate with its edge print
// and frame numbers, his frames in black and white, a china-marker circle,
// and a loupe standing on it.
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
          <div className="of-film__numbers" aria-hidden="true">
            <span>23</span>
            <span>24</span>
            <span>25</span>
          </div>
          <div className="of-film__perfs of-film__perfs--bottom" aria-hidden="true">{PERFS}</div>
        </div>
        <svg className="of-film__mark" viewBox="0 0 400 260" aria-hidden="true">
          <path d="M40 150 C 30 60, 170 18, 280 34 S 392 120, 360 190 S 190 262, 96 236 S 22 190, 58 118" pathLength="1" />
        </svg>
        {/* A photographer's loupe standing on the sheet: a layer nearer the
            lens than the sheet, so on the whip it trails the sheet by 40 px
            and settles after it (depth by parallax). */}
        <span className="of-film__loupe" aria-hidden="true" {...kick('translate3d(40px, 0, 0)', 0, 170, 'lock')}>
          <span className="of-film__loupe-glass" />
        </span>
      </div>
    </Scene>
  );
}

// ── 12. The clapperboard ──────────────────────────────────────────────────
// It carries every word the film found. RYAN XU is where the last run held
// it, under its field label CAMERA; the line under it is the first screen's
// own line. Every found word is chalked before the sticks come down — a ring
// round CAMERA, a line under ARCHIVE, TRAVEL and THOUGHT. The O of THOUGHT is
// a true circle drawn in the stroke's weight. CAMERA, beside his name, flies
// home too, into the entrance's opening words. The board's fields are a roll of film's, not a
// film set's (the owner asked for a camera) — PROPOSED copy (awaiting the
// owner): the labels Title, Roll, Frame, Exp., Date, their values, and the
// foot "35 mm · B&W · 36 exp.".
// The chalk is drawn in the SVG's own units (no non-scaling stroke: with one,
// Chrome sizes the dash on screen and a line stopped short of its word), so
// every line and the ring are drawn whole, end to end.
function Chalk() {
  return (
    <svg className="of-chalk" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1 6.2 C 18 4.8, 36 7.4, 54 5.6 S 86 4.6, 99 6" pathLength="1" />
    </svg>
  );
}
/** A hand-drawn chalk ring round a label: one loop, its end running past its
 *  start. */
function ChalkRing() {
  return (
    <svg className="of-chalk of-chalk--ring" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d="M58 4.5 C 30 3, 5 8, 4.5 20 S 30 37.5, 55 36.5 S 96 31, 95.5 18.5 S 72 2.5, 38 6.5" pathLength="1" />
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
            <span className="of-slate__label" data-fly="camera">
              <span className="of-slate__ringed">
                Camera
                <ChalkRing />
              </span>
            </span>
            <Find word="ryanxu" className="of-slate__name">
              <span data-fly="ryan">RYAN</span> <span data-fly="xu">XU</span>
            </Find>
          </div>
          <div className="of-slate__row of-slate__row--prod">
            <span className="of-slate__label">Title</span>
            <span className="of-slate__prod">
              A PERSONAL{' '}
              <span className="of-slate__found" data-fly="archive">ARCHIVE<Chalk /></span>{' '}
              OF{' '}
              <span className="of-slate__found" data-fly="travel">TRAVEL<Chalk /></span>{' '}
              AND{' '}
              <span className="of-slate__found" data-fly="thought">
                TH<span className="of-slate__o"><span className="of-slate__o-ch">O</span><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42.5" /></svg></span>UGHT<Chalk />
              </span>
            </span>
          </div>
          <div className="of-slate__row of-slate__row--grid">
            <span className="of-slate__cell"><span className="of-slate__label">Roll</span><span className="of-slate__val">001</span></span>
            <span className="of-slate__cell"><span className="of-slate__label">Frame</span><span className="of-slate__val">01</span></span>
            <span className="of-slate__cell"><span className="of-slate__label">Exp.</span><span className="of-slate__val">1/125</span></span>
            <span className="of-slate__cell"><span className="of-slate__label">Date</span><span className="of-slate__val">2026</span></span>
          </div>
          <div className="of-slate__foot">
            <span>35 mm</span>
            <span>B&amp;W</span>
            <span>36 exp.</span>
          </div>
        </div>
      </div>
    </Scene>
  );
}

/** Every scene, in no particular order (the island's schedule orders them).
 *  `pictures`: his photographs, the newspaper's first, then the contact
 *  sheet's. */
export default function OpeningScenes({ pictures = [] }: { pictures?: readonly OpeningPicture[] }) {
  return (
    <>
      <CodeScene />
      <DictionaryScene />
      <NewspaperScene picture={pictures[0]} />
      <TopPlateScene />
      <LensScene />
      <SlicesScene />
      <BoardScene />
      <BookScene />
      <TypewriterScene />
      <PosterScene />
      <ContactScene pictures={[pictures[1], pictures[2], pictures[3]]} />
      <SlateScene />
    </>
  );
}
