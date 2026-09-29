import type { CSSProperties, ReactNode } from 'react';
import {
  BLUR_COPIES,
  BLUR_STEP_PER_SPEED,
  CREDIT,
  CUT_MS,
  DARK_TYPED,
  DRIFT_VEC,
  FOUND_WORD,
  LEADER,
  PUSH_DIR,
  SCENES,
  SHEETS,
  STYLES,
  TEXTURE,
  TITLE_NAME,
  TITLE_SUB,
  TITLE_YOU,
  TYPED,
  faceText,
  ribbon,
  type AnchorFace,
  type LeaderCard,
  type OpeningPicture,
  type Scene,
  type SheetKind,
  type StyleId,
} from '../../lib/openingFilm';

// ── The opening film's scenes ──
// Plain markup, the same on the server and the client (no branch on the
// viewport or on reduced motion: CSS decides what shows, the island decides
// when). Every text element names its face: `font-serif` (Fraunces),
// `font-ui` (Space Grotesk) or `of-mono` (the typewriter's monospace, used
// for the typed line, the anchor's mono face and the typed printed matter) —
// a label with none falls through to the body's Inter. Nothing here is
// transformed at rest by the island's clock; what moves, the island moves
// (transform and opacity on the film's one clock), and where a word must be
// measured or set on the anchor's baseline it carries a baseline probe
// (`.of-bl`).
//
// New copy is PROPOSED (awaiting the owner): the typed line, the words round
// the anchor, the printed matter's own words (but the dictionary, Webster's
// 1913, and the book, Stevenson's Travels with a Donkey, 1879: both public
// domain), the leader cards, the credit, the YOU line. No place is named but
// in two tiny easter eggs (EGGS in src/lib/openingFilm.ts).

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** A zero-size probe on the baseline. */
const Bl = () => <i className="of-bl" aria-hidden="true" />;

/** A word as its letters, each its own box (the island sets each on its pen
 *  and, in a morph, fits it into the ink box it shares with its letter in
 *  the other face). Spaces are not letters: only the pen moves past them. */
function Glyphs({ text, className, face }: { text: string; className: string; face: 'from' | 'to' }) {
  return (
    <span className={`of-gm__face ${className}`} data-gm={face}>
      {text.split('').map((ch, i) =>
        ch === ' ' ? null : (
          <span key={i} className="of-g" data-g={i}>
            {ch}
          </span>
        ),
      )}
      <Bl />
    </span>
  );
}

/** A clip that reveals its content left to right (the island moves the
 *  window and counter-moves the content: both transforms, so the letters
 *  never move on screen). */
function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`of-reveal ${className}`} data-reveal>
      <span className="of-reveal__in" data-reveal-in>
        {children}
      </span>
    </span>
  );
}

/** One of his photographs (at its own ratio; the island waits for it to be
 *  decoded before the clock starts). */
function Picture({ picture, className = '' }: { picture?: OpeningPicture; className?: string }) {
  if (!picture) return <span className={`of-pic of-pic--none ${className}`} aria-hidden="true" />;
  return (
    <img
      className={`of-pic ${className}`}
      src={picture.src}
      alt=""
      decoding="async"
      draggable={false}
      data-pic
      style={vars({ '--ratio': picture.ratio })}
    />
  );
}

// ── Act 1: the typewriter relay ───────────────────────────────────────────
// The same line on eight machines, set identically (one monospace, one
// size, one place): only the machine is cut round it.
const INK = ribbon(TYPED);
/** The paper's line in the pieces that part when ARCHIVE is found (each with
 *  the space after it); neighbours pushed the same way stay one piece. */
const WORDS = (() => {
  const out: { text: string; from: number; key: string; dir: number }[] = [];
  let at = 0;
  TYPED.split(' ').forEach((word, i, all) => {
    const text = i < all.length - 1 ? `${word} ` : word;
    const dir = word === FOUND_WORD ? 0 : (PUSH_DIR[word] ?? 1);
    const last = out[out.length - 1];
    if (last && dir !== 0 && last.dir === dir) last.text += text;
    else out.push({ text, from: at, key: word, dir });
    at += text.length;
  });
  return out;
})();

/** The hand-drawn looping arrow on the grid paper, drawn in six stages
 *  (each a longer stretch of one path; the island shows them in turn). */
const ARROW = 'M34 188 C 20 140, 60 104, 104 118 C 150 132, 142 184, 104 180 C 70 176, 78 118, 132 96 C 176 78, 222 70, 262 44';
const ARROW_STAGES = [0.16, 0.33, 0.5, 0.67, 0.84, 1];

function Style({ id, pictures }: { id: StyleId; pictures: readonly OpeningPicture[] }) {
  let line: ReactNode = TYPED;
  if (id === 'paper') {
    // Typewriter ink: every letter struck a little harder or softer, a hair
    // off true; the words in the pieces that part when one is found.
    line = WORDS.map((w) => (
      <span key={w.key} className="of-paper__word" data-word={w.key}>
        {w.text.split('').map((ch, k) => {
          const i = w.from + k;
          return (
            <span key={k} className="of-strike" style={vars({ '--ink': INK[i].ink, '--dx': `${INK[i].dx}px`, '--dy': `${INK[i].dy}px` })}>
              {ch}
            </span>
          );
        })}
      </span>
    ));
  }
  const grows = id === 'pill' || id === 'grid' || id === 'bars';
  return (
    <div className={`of-mat of-mat--${id}`} data-mat={id}>
      <div className="of-mat__ground">
        {id === 'pill' && (
          <span className="of-pill__life" aria-hidden="true">
            <Picture picture={pictures[0]} className="of-pic--life" />
          </span>
        )}
        {id === 'deep' && (
          // A terminal's status line: the screen is a machine, not a field
          // of colour (PROPOSED copy).
          <span className="of-deep__status of-mono" aria-hidden="true">
            READY
          </span>
        )}
        {id === 'beige' && (
          <span className="of-beige__screen" aria-hidden="true">
            <span className="of-beige__bar">
              <span className="of-beige__menu font-ui">File&nbsp;&nbsp;Edit&nbsp;&nbsp;View&nbsp;&nbsp;Insert&nbsp;&nbsp;Format</span>
              <span className="of-beige__tools">
                <i />
                <i />
                <i />
                <b className="font-ui">B</b>
                <b className="font-ui of-beige__u">U</b>
                <i />
                <i />
                <span className="of-beige__font of-mono">Mono · 12</span>
              </span>
            </span>
            <span className="of-beige__ruler" />
          </span>
        )}
        {id === 'grid' && (
          <>
            <span className="of-grid__print" aria-hidden="true">
              <Picture picture={pictures[1]} className="of-pic--print" />
              <span className="of-grid__tape" />
            </span>
            <svg className="of-grid__arrow" viewBox="0 0 280 200" aria-hidden="true">
              {ARROW_STAGES.map((k, i) => (
                <path key={i} d={ARROW} pathLength={1} style={vars({ strokeDasharray: `${k} 2` })} data-arrow={i} />
              ))}
              <path className="of-grid__head" d="M244 40 L 263 43 L 254 60" data-arrow-head />
            </svg>
          </>
        )}
      </div>
      <div className="of-line" data-line>
        <Reveal>
          {grows && <span className={`of-grow of-grow--${id}`} aria-hidden="true" />}
          <span className="of-typed of-mono" data-typed>
            {line}
            <Bl />
          </span>
          {id === 'crt' && (
            // The phosphor's bloom: the same line, soft, under the dots.
            <span className="of-typed of-typed--bloom of-mono" aria-hidden="true">
              {TYPED}
            </span>
          )}
        </Reveal>
        {grows && <i className={`of-grow-end of-grow-end--${id}`} data-grow-end aria-hidden="true" />}
        {/* The cursor: the island moves it and shows it; its ink blinks
            (530 ms steps: before the clock by the sheet, then on the
            film's clock — solid while it types). */}
        <i className="of-cursor" data-cursor>
          <i className="of-cursor__ink" data-cursor-ink />
        </i>
      </div>
      {id === 'grid' && (
        <svg className="of-grid__pointer" viewBox="0 0 24 36" aria-hidden="true">
          <path d="M2 2 L2 28 L8.5 22 L13 33 L17.5 31 L13 20.5 L21.5 20.5 Z" />
        </svg>
      )}
      <div className="of-mat__over" />
    </div>
  );
}

// ── Act 3: the anchor and the pages round it ──────────────────────────────

const FACE_CLASS: Record<AnchorFace, string> = {
  f900: 'font-serif of-face--f900',
  fit: 'font-serif of-face--fit',
  sg700: 'font-ui of-face--sg700',
  f400: 'font-serif of-face--f400',
  mono: 'of-mono of-face--mono',
};

/** The anchor with its word, one per cut. The first is also the found word
 *  of act 2: the typewriter's "archive" (as typed), struck again in
 *  capitals as it lifts off, whose every capital turns into its Fraunces
 *  capital as it glides to the anchor. */
function Key({ index, s }: { index: number; s: Scene }) {
  const word = faceText(s.word, s.face);
  return (
    <div className="of-key" data-key={index}>
      <span className="of-key__clip" data-clip>
        <span className="of-key__clip-in" data-clip-in>
          <span className="of-key__block" data-block />
          {index === 0 && (
            <>
              <span className="of-key__word of-key__word--from of-mono" data-from>
                {FOUND_WORD}
                <Bl />
              </span>
              <span className="of-gm" data-gm-unit>
                <Glyphs face="from" className="of-key__glyphs of-key__glyphs--from of-mono" text={FOUND_WORD.toUpperCase()} />
                <Glyphs face="to" className={`of-key__glyphs ${FACE_CLASS[s.face]}`} text={word} />
              </span>
            </>
          )}
          <span className={`of-key__word ${FACE_CLASS[s.face]}`} data-word>
            {word}
            <Bl />
          </span>
        </span>
      </span>
    </div>
  );
}

/** A hand-drawn ring (one loop, its end past its start). */
function Ring({ className = 'of-ring' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
      <path d="M62 6 C 30 3, 5 12, 5 31 S 32 57, 57 55 S 96 45, 95 27 S 70 3, 36 9" />
    </svg>
  );
}

function Giant({ g, s }: { g: Scene['giants'][number]; s: Scene }) {
  // The motion blur: copies behind the word (away from its drift), each a
  // step further and fainter, set once (they ride with the word).
  const speed = (s.driftPx * 1000) / (s.slots * CUT_MS);
  const step = (speed / 100) * BLUR_STEP_PER_SPEED;
  const [dx, dy] = DRIFT_VEC[s.drift];
  const face = g.face === 'f900' ? 'of-face--f900' : 'of-face--f400';
  return (
    <div className={`of-giant of-giant--${g.align}`} data-giant>
      {BLUR_COPIES.map((k) => (
        <span
          key={k.step}
          className={`of-giant__copy font-serif ${face}`}
          aria-hidden="true"
          // A 2D translate: the copies are drawn into their word's own layer
          // (scaled with the drift by the layout's --drift-k).
          style={vars({
            opacity: k.opacity,
            transform: `translate(calc(var(--drift-k, 1) * ${(-dx * step * k.step).toFixed(1)}px), calc(var(--drift-k, 1) * ${(-dy * step * k.step).toFixed(1)}px))`,
          })}
        >
          {g.text}
        </span>
      ))}
      <span className={`of-giant__word font-serif ${face}`} data-giant-word>
        {g.text}
        <Bl />
      </span>
    </div>
  );
}

const ROLE_CLASS = { caps: 'font-ui', italic: 'font-serif', thin: 'font-serif' } as const;

/** A word beside the anchor, on its line (set on the anchor's baseline by
 *  the island) or a line above or below it. */
function Row({ side, className, children }: { side: 'l' | 'r'; className: string; children: ReactNode }) {
  return (
    <p className={`of-row of-row--${side} ${className}`} data-base>
      <Bl />
      {children}
    </p>
  );
}

/** An editorial page: the words beside the anchor, a ringed word, texture. */
function Editorial({ s }: { s: Scene }) {
  return (
    <>
      {s.deco?.texture.map((t, k) => (
        <p key={k} className="of-texture font-serif" style={vars({ '--tw': `${t.w}px` })} data-texture={k}>
          {TEXTURE[t.text]}
        </p>
      ))}
      {s.side?.map((w, k) =>
        w.row === 0 ? (
          <Row key={k} side={w.at} className={`of-side of-side--${w.role} ${ROLE_CLASS[w.role]}`}>
            {w.text}
          </Row>
        ) : (
          <p key={k} className={`of-side of-side--${w.role} of-side--${w.at} of-side--row${w.row < 0 ? 'up' : 'down'} ${ROLE_CLASS[w.role]}`}>
            {w.text}
          </p>
        ),
      )}
      {s.deco && (
        <span className="of-ringed font-serif" data-ringed>
          {s.deco.ringed}
          <Ring />
        </span>
      )}
    </>
  );
}

// ── The printed matter ─────────────────────────────────────────────────────
// Each sheet is laid round the anchor: its own ground, the words on the
// anchor's line (Row), what is printed above and below it. The frame crops
// every sheet like a close-up.

function Newspaper() {
  const c = SHEETS.newspaper;
  return (
    <>
      <div className="of-news__edition font-ui">
        {c.edition.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      <Row side="l" className="of-news__from font-serif">
        {c.row[0]}
      </Row>
      <Row side="r" className="of-news__sect font-ui">
        {c.row[1]}
      </Row>
      <div className="of-news__below">
        <p className="of-news__hed font-serif">{c.headline}</p>
        <div className="of-news__cols font-serif">
          {c.body.map((k, i) => (
            <p key={k}>
              {i === 0 && <b className="of-news__dateline font-ui">{c.dateline} </b>}
              {TEXTURE[k]}
            </p>
          ))}
          <span className="of-news__photo" aria-hidden="true" />
          {c.body.slice(0, 3).map((k) => (
            <p key={`b${k}`}>{TEXTURE[k]}</p>
          ))}
        </div>
      </div>
    </>
  );
}

/** A dictionary entry: its headword bold, the rest in the book face. */
function Entry({ text }: { text: string }) {
  const at = text.indexOf(',');
  return (
    <p>
      <b>{text.slice(0, at)}</b>
      {text.slice(at)}
    </p>
  );
}

function Dictionary() {
  const c = SHEETS.dictionary;
  return (
    <>
      <div className="of-dict__head font-ui">
        {c.head.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      <div className="of-dict__above font-serif">
        {c.above.map((x) => (
          <Entry key={x} text={x} />
        ))}
      </div>
      <Row side="r" className="of-dict__def font-serif">
        {c.row[1]}
      </Row>
      <div className="of-dict__below font-serif" data-clear="[data-base]">
        <p>{c.below[0]}</p>
        {c.below.slice(1).map((x) => (
          <Entry key={x} text={x} />
        ))}
      </div>
    </>
  );
}

function Catalogue() {
  const c = SHEETS.catalogue;
  return (
    <>
      <div className="of-card__call of-mono">
        {c.call.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      <div className="of-card__above of-mono">
        {c.above.map((x) => (
          <p key={x}>{x}</p>
        ))}
      </div>
      <Row side="r" className="of-card__row of-mono">
        {c.row[1]}
      </Row>
      <div className="of-card__below of-mono" data-clear="[data-base]">
        {c.below.map((x) => (
          <p key={x}>{x}</p>
        ))}
      </div>
    </>
  );
}

function Magazine({ picture }: { picture?: OpeningPicture }) {
  const c = SHEETS.magazine;
  return (
    <>
      <div className="of-mag__plate">
        <Picture picture={picture} className="of-pic--plate" />
        <span className="of-mag__caption font-serif">{c.caption}</span>
      </div>
      <div className="of-mag__above">
        <span className="of-mag__kicker font-ui">{c.kicker}</span>
        <span className="of-mag__deck font-serif">{c.deck}</span>
      </div>
      <Row side="r" className="of-mag__obscura font-serif">
        {c.row[1]}
      </Row>
      <div className="of-mag__body font-serif">
        {c.body.map((x) => (
          <p key={x}>{x}</p>
        ))}
      </div>
      <span className="of-mag__folio of-mag__folio--l font-ui">{c.folios[0]}</span>
      <span className="of-mag__folio of-mag__folio--r font-ui">{c.folios[1]}</span>
    </>
  );
}

function Slate() {
  const c = SHEETS.slate;
  return (
    <>
      <div className="of-slate__sticks" aria-hidden="true">
        <span className="of-slate__stick of-slate__stick--top" />
        <span className="of-slate__stick of-slate__stick--base" />
      </div>
      <div className="of-slate__prod">
        <span className="of-slate__label font-ui">{c.prod[0]}</span>
        <span className="of-slate__hand font-serif">{c.prod[1]}</span>
      </div>
      <Row side="l" className="of-slate__label of-slate__rowl font-ui">
        {c.row[0]}
      </Row>
      <Row side="r" className="of-slate__hand of-slate__rowr font-serif">
        {c.row[1]}
      </Row>
      <div className="of-slate__cells">
        {c.cells.map(([label, value]) => (
          <span key={label} className="of-slate__cell">
            <span className="of-slate__label font-ui">{label}</span>
            <span className="of-slate__hand font-serif">{value}</span>
          </span>
        ))}
      </div>
    </>
  );
}

const PERFS = Array.from({ length: 22 }, (_, i) => <i key={i} />);

function Edge({ pictures }: { pictures: readonly OpeningPicture[] }) {
  const c = SHEETS.edge;
  return (
    <>
      <div className="of-edge__strip" aria-hidden="true">
        <span className="of-edge__perfs of-edge__perfs--t">{PERFS}</span>
        <span className="of-edge__frame of-edge__frame--l">
          <Picture picture={pictures[2]} className="of-pic--frame" />
        </span>
        <span className="of-edge__frame of-edge__frame--r">
          <Picture picture={pictures[1]} className="of-pic--frame" />
        </span>
        <span className="of-edge__perfs of-edge__perfs--b">{PERFS}</span>
      </div>
      <p className="of-edge__print of-edge__print--l of-mono">{c.row[0]}</p>
      <p className="of-edge__print of-edge__print--r of-mono">{c.row[1]}</p>
      <p className="of-edge__note of-edge__note--a font-serif">
        {c.notes[0]}
        <Ring className="of-edge__ring" />
      </p>
      <p className="of-edge__note of-edge__note--b font-serif">{c.notes[1]}</p>
    </>
  );
}

function Ticket() {
  const c = SHEETS.ticket;
  return (
    <>
      <div className="of-ticket__stub font-ui">
        <span>{c.stub}</span>
        <span className="of-ticket__no">{c.no}</span>
      </div>
      <div className="of-ticket__head font-ui">
        {c.head.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      <Row side="l" className="of-ticket__valid font-ui">
        {c.row[0]}
      </Row>
      <Row side="r" className="of-ticket__only font-serif">
        {c.row[1]}
      </Row>
      <div className="of-ticket__route">
        {c.route.map(([label, value]) => (
          <span key={label} className="of-ticket__stop">
            <span className="of-ticket__label font-ui">{label}</span>
            <span className="of-ticket__place font-serif">{value}</span>
          </span>
        ))}
      </div>
      <p className="of-ticket__fine font-ui" data-clear=".of-ticket__route">
        {c.fine}
      </p>
    </>
  );
}

function Book() {
  const c = SHEETS.book;
  return (
    <>
      <div className="of-book__above font-serif">
        {c.above.map((x) => (
          <span key={x} className="of-book__line">
            {x}{' '}
          </span>
        ))}
      </div>
      <Row side="l" className="of-book__row font-serif">
        {c.row[0]}
      </Row>
      <Row side="r" className="of-book__row font-serif">
        {c.row[1]}
      </Row>
      <div className="of-book__below font-serif">
        {c.below.map((x) => (
          <span key={x} className="of-book__line">
            {/* Flowed (the phone), a line's end is a space — or nothing
                after a hyphen. */}
            {x}
            {x.endsWith('-') ? '' : ' '}
          </span>
        ))}
      </div>
      <p className="of-book__folio font-ui">
        <span>{c.head[0]}</span>
        <span>{c.head[1]}</span>
      </p>
    </>
  );
}

function Passport() {
  const c = SHEETS.passport;
  return (
    <>
      <span className="of-pass__stamp of-pass__stamp--a font-ui">{c.stamps[0]}</span>
      <span className="of-pass__stamp of-pass__stamp--b font-ui">
        <span>{c.stamps[1]}</span>
        <span className="of-pass__no">{c.stamps[3]}</span>
      </span>
      <span className="of-pass__stamp of-pass__stamp--c font-ui">{c.stamps[2]}</span>
      {/* The egg: a park's cancellation stamp, in the page's corner. */}
      <svg className="of-pass__park" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <path id="of-park-ring" d="M50 50 m -36 0 a 36 36 0 1 1 72 0 a 36 36 0 1 1 -72 0" />
        </defs>
        <circle cx="50" cy="50" r="46" />
        <circle cx="50" cy="50" r="28" />
        <text className="font-ui">
          <textPath href="#of-park-ring">{c.park}</textPath>
        </text>
      </svg>
      <Row side="l" className="of-pass__visas font-ui">
        {c.row[0]}
      </Row>
      <Row side="r" className="of-pass__end font-serif">
        {c.row[1]}
      </Row>
      <p className="of-pass__mrz of-mono">{c.mrz}</p>
      <span className="of-pass__page font-ui">{c.page}</span>
    </>
  );
}

function Telegram() {
  const c = SHEETS.telegram;
  return (
    <>
      <div className="of-wire__fields font-ui">
        {c.fields.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      <p className="of-wire__tape of-wire__tape--above of-mono">{c.above}</p>
      <span className="of-wire__tape of-wire__tape--row" aria-hidden="true" />
      <Row side="r" className="of-wire__rowr of-mono">
        {c.row[1]}
      </Row>
      <p className="of-wire__tape of-wire__tape--below of-mono">{c.below}</p>
    </>
  );
}

function Notebook() {
  const c = SHEETS.notebook;
  return (
    <>
      <p className="of-note__hand of-note__above font-serif">{c.above}</p>
      <Row side="l" className="of-note__hand font-serif">
        {c.row[0]}
      </Row>
      <Row side="r" className="of-note__hand font-serif">
        {c.row[1]}
      </Row>
      <div className="of-note__below font-serif">
        <p className="of-note__hand font-serif">{c.below[0]}</p>
        <p className="of-note__hand of-note__aside font-serif">{c.below[1]}</p>
      </div>
    </>
  );
}

function Postcard() {
  const c = SHEETS.postcard;
  return (
    <>
      <div className="of-post__stamp" aria-hidden="true">
        <span className="of-post__stamp-face font-ui">{c.stamp}</span>
      </div>
      <svg className="of-post__mark" viewBox="0 0 160 100" aria-hidden="true">
        <circle cx="50" cy="50" r="40" />
        <circle cx="50" cy="50" r="32" />
        <path d="M96 30 C 110 24, 124 36, 138 30 S 152 26, 158 30 M96 50 C 110 44, 124 56, 138 50 S 152 46, 158 50 M96 70 C 110 64, 124 76, 138 70 S 152 66, 158 70" />
        <text x="50" y="54" textAnchor="middle" className="font-ui">
          {c.mark}
        </text>
      </svg>
      <div className="of-post__address" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <Row side="l" className="of-post__hand font-serif">
        {c.row[0]}
      </Row>
      <Row side="r" className="of-post__hand font-serif">
        {c.row[1]}
      </Row>
      <p className="of-post__msg font-serif">{c.below}</p>
    </>
  );
}

/** What a sheet's paper carries under its giant words (the card, the
 *  spread's pages, the ticket, the form, the rules): printed ink goes over
 *  it, the giant words and the small print on top. */
function SheetBack({ kind }: { kind: SheetKind }) {
  switch (kind) {
    case 'catalogue':
      return (
        <div className="of-card" aria-hidden="true">
          <span className="of-card__rule" />
          <span className="of-card__hole" />
        </div>
      );
    case 'magazine':
      return (
        <div className="of-mag__pages" aria-hidden="true">
          <span className="of-mag__page of-mag__page--l" />
          <span className="of-mag__page of-mag__page--r" />
        </div>
      );
    case 'ticket':
      return (
        <div className="of-ticket" aria-hidden="true">
          <span className="of-ticket__perf" />
        </div>
      );
    case 'book':
      return <div className="of-book__gutter" aria-hidden="true" />;
    case 'passport':
      return <div className="of-pass__guilloche" aria-hidden="true" />;
    case 'telegram':
      return <div className="of-wire__form" aria-hidden="true" />;
    case 'notebook':
      return <div className="of-note__ruled" aria-hidden="true" />;
    case 'postcard':
      return <div className="of-post__divider" aria-hidden="true" />;
    default:
      return null;
  }
}

function Sheet({ kind, pictures }: { kind: SheetKind; pictures: readonly OpeningPicture[] }) {
  switch (kind) {
    case 'newspaper':
      return <Newspaper />;
    case 'dictionary':
      return <Dictionary />;
    case 'catalogue':
      return <Catalogue />;
    case 'magazine':
      return <Magazine picture={pictures[2]} />;
    case 'slate':
      return <Slate />;
    case 'edge':
      return <Edge pictures={pictures} />;
    case 'ticket':
      return <Ticket />;
    case 'book':
      return <Book />;
    case 'passport':
      return <Passport />;
    case 'telegram':
      return <Telegram />;
    case 'notebook':
      return <Notebook />;
    case 'postcard':
      return <Postcard />;
    default:
      return null;
  }
}

/** One cut's page: its ground (the frame's paper, or the sheet's own), the
 *  giant words, and what is printed round the anchor. */
function Cut({ index, s, pictures }: { index: number; s: Scene; pictures: readonly OpeningPicture[] }) {
  return (
    <div className={`of-cut ${s.sheet ? `of-cut--sheet of-sheet--${s.sheet}` : 'of-cut--editorial'}`} data-cut={index} data-drift={s.drift}>
      {s.sheet && <div className="of-sheet__ground" aria-hidden="true" />}
      {s.sheet && <SheetBack kind={s.sheet} />}
      {s.giants.map((g, k) => (
        <Giant key={k} g={g} s={s} />
      ))}
      {s.sheet ? <Sheet kind={s.sheet} pictures={pictures} /> : <Editorial s={s} />}
    </div>
  );
}

/** An editorial cut's print on the frame's edge: the meta at the top
 *  corners and the credit centred at the foot, above the frame's soft edge
 *  (crisp in the corners). */
function Chrome({ index, s }: { index: number; s: Scene }) {
  if (!s.deco) return null;
  return (
    <div className="of-chrome" data-chrome={index}>
      <span className="of-meta of-meta--l font-ui">{s.deco.metaL}</span>
      <span className="of-meta of-meta--r font-ui">{s.deco.metaR}</span>
      <span className="of-credit font-ui">{CREDIT}</span>
    </div>
  );
}

// ── Act 4: the leader ─────────────────────────────────────────────────────
// Projected: light on the dark, a little soft, with a halo. PROPOSED copy.
function Leader({ card }: { card: LeaderCard }) {
  let body: ReactNode;
  if (card === 'count-3' || card === 'count-2') {
    body = (
      <>
        <svg className="of-leader__dial" viewBox="0 0 200 200" aria-hidden="true">
          {/* The projector's halo, drawn in the picture (no filter on the
              card: a filtered card cost a frame as it came up). */}
          <filter id={`of-dial-glow-${card}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.4" result="g" />
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <g filter={`url(#of-dial-glow-${card})`}>
            <circle cx="100" cy="100" r="92" />
            <circle cx="100" cy="100" r="74" />
            <path d="M100 0 V200 M0 100 H200" />
          </g>
        </svg>
        <span className="of-leader__n font-ui">{card === 'count-3' ? '3' : '2'}</span>
      </>
    );
  } else if (card === 'head') {
    body = <span className="of-leader__head font-ui">HEAD</span>;
  } else if (card === '35mm') {
    body = <span className="of-leader__v font-ui">35MM</span>;
  } else if (card === 'reel') {
    body = <span className="of-leader__reel font-ui">REEL 01</span>;
  } else {
    body = <span className="of-leader__word font-ui">ARCHIVE</span>;
  }
  return (
    <div className={`of-leader of-leader--${card}`} data-leader={card}>
      {body}
    </div>
  );
}

const PERF_ROW = Array.from({ length: 11 }, (_, i) => <i key={i} />);
const PERF_EDGE = Array.from({ length: 28 }, (_, i) => <i key={i} />);

/**
 * Every scene, stacked (the island times them): the typed machines, the
 * frame (the paper, every cut's page, the anchor, the soft edge, the grain,
 * the sepia and the burn's canvas, and — past its foot — the frame line and
 * perforations a slip shows), the dark of the burn with its leader and lit
 * perforations, and the dark of the end with the title.
 * `pictures`: his photographs (the pill's life, the grid's print, the
 * magazine's plate).
 */
export default function OpeningScenes({ pictures = [] }: { pictures?: readonly OpeningPicture[] }) {
  return (
    <>
      <div className="of-act of-act--type" data-act="type">
        {STYLES.map(({ id }) => (
          <Style key={id} id={id} pictures={pictures} />
        ))}
      </div>

      <div className="of-burnground" data-burnground />

      <div className="of-frame" data-frame>
        <div className="of-frame__paper" data-paper />
        {SCENES.map((s, i) => (
          <Cut key={i} index={i} s={s} pictures={pictures} />
        ))}
        <div className="of-anchor" data-anchor>
          {SCENES.map((s, i) => (
            <Key key={i} index={i} s={s} />
          ))}
        </div>
        <div className="of-frame__soft" data-soft />
        {SCENES.map((s, i) => (
          <Chrome key={i} index={i} s={s} />
        ))}
        <div className="of-frame__grain" data-grain>
          <i className="of-grain__tile" data-grain-tile />
        </div>
        <div className="of-frame__vignette" data-vignette />
        <div className="of-frame__sepia" data-sepia />
        <canvas className="of-burn" data-burn />
        <div className="of-frame__veil" data-veil />
        {/* Past the frame's foot: what a slip shows — the frame line with
            its perforations, and the top of the next frame. */}
        <div className="of-frame__next" data-next aria-hidden="true">
          <div className="of-frame__line">
            <span className="of-frame__perfs of-frame__perfs--l">{PERF_ROW.slice(0, 3)}</span>
            <span className="of-frame__perfs of-frame__perfs--r">{PERF_ROW.slice(0, 3)}</span>
          </div>
          <div className="of-frame__below" />
        </div>
      </div>

      {LEADER.map((card) => (
        <Leader key={card} card={card} />
      ))}
      <div className="of-perfrow" data-perfrow aria-hidden="true">
        {PERF_ROW}
      </div>

      <div className="of-end" data-end>
        <div className="of-end__ground" />
        <div className="of-end__edge of-end__edge--top" aria-hidden="true">
          {PERF_EDGE}
        </div>
        <div className="of-end__edge of-end__edge--bottom" aria-hidden="true">
          {PERF_EDGE}
        </div>
        <div className="of-end__grain">
          <i className="of-grain__tile of-grain__tile--light" data-end-grain-tile />
        </div>
        <div className="of-end__title">
          <div className="of-title" data-title>
            <Reveal className="of-title__typed">
              <span className="of-title__mono of-mono" data-title-from>
                {DARK_TYPED}
                <Bl />
              </span>
            </Reveal>
            <i className="of-title__cursor" data-title-cursor />
            {/* The name as the film sets it (its letters morph from the
                typewriter's capitals) … */}
            <span className="of-gm of-title__gm" data-gm-unit>
              <Glyphs face="from" className="of-title__glyphs of-title__glyphs--from of-mono" text={TITLE_NAME.toUpperCase()} />
              <Glyphs face="to" className="of-title__glyphs of-title__face font-serif" text={TITLE_NAME.toUpperCase()} />
            </span>
            {/* … and as a word (what flies home; the still under reduced
                motion). */}
            <span className="of-title__name of-title__face font-serif" data-title-to>
              <span data-fly="ryan">Ryan</span> <span data-fly="xu">Xu</span>
              <Bl />
            </span>
          </div>
          <p className="of-title__sub font-ui" data-title-sub>
            {TITLE_SUB.map((word, i) => (
              <span key={word}>
                {i > 0 && <span className="of-title__dot" aria-hidden="true"> · </span>}
                <span data-fly={word.toLowerCase()}>{word}</span>
              </span>
            ))}
          </p>
          {/* PROPOSED copy: YOU, the viewer (the pass that follows is made
              out to YOU). */}
          <p className="of-title__you font-ui" data-title-you>
            <span className="of-title__lead">{TITLE_YOU.lead}</span>
            <span className="of-title__dot" aria-hidden="true"> · </span>
            <span data-fly="you">{TITLE_YOU.word}</span>
          </p>
        </div>
      </div>

      {/* The photocopy's toner edge (a still filter, drawn once). */}
      <svg className="of-defs" aria-hidden="true" focusable="false">
        <filter id="of-copy-edge" x="-5%" y="-30%" width="110%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </>
  );
}
