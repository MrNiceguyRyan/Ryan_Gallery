import type { CSSProperties, ReactNode } from 'react';
import {
  BLUR_COPIES,
  BLUR_STEP_PER_SPEED,
  CREDIT,
  CUT_MS,
  DARK_TYPED,
  DRIFT_VEC,
  LEADER,
  PROOF_SLUG,
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
  sceneTone,
  seeded,
  type AnchorFace,
  type LeaderCard,
  type Layers as LayerSpec,
  type OpeningPicture,
  type Scene,
  type SheetKind,
  type StyleId,
  type Vec2,
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
// (`.of-bl`). The server's first paint is the proof (act 0): a sheet of the
// newspaper's newsprint over the first match cut, its marks and its slug,
// the first cut's lime anchor over it — the stylesheet counts it in. The
// first match cut is drawn under it from the first paint: the stylesheet
// sets it (the anchor, its giant, the words on its line) exactly where the
// island will.
//
// New copy is PROPOSED (awaiting the owner): the typed line, the words round
// the anchor, the printed matter's own words (but the dictionary, Webster's
// 1913: public domain), the layers' captions, notes, stamps and receipts, the leader
// cards, the credit, the YOU line. No place is named but in two tiny easter
// eggs (EGGS in src/lib/openingFilm.ts).

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

/** A barcode: seeded bars (the server and the client draw the same). */
function Bars({ seed, n = 34 }: { seed: number; n?: number }) {
  const rand = seeded(seed);
  let x = 0;
  const bars: { x: number; w: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const w = 1 + Math.floor(rand() * 3);
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  }
  return (
    <svg className="of-bars" viewBox={`0 0 ${x} 20`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={20} />
      ))}
    </svg>
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

/** A hand-drawn arrow, pointing its way. */
function Arrow({ dir, className = 'of-arrow' }: { dir: 'l' | 'r' | 'u' | 'd'; className?: string }) {
  return (
    <svg className={`${className} ${className}--${dir}`} viewBox="0 0 80 40" aria-hidden="true">
      <path d="M4 26 C 22 30, 44 10, 70 18" />
      <path d="M58 9 L 71 18 L 57 27" />
    </svg>
  );
}

/** A circled number (a pencil's ring round it). */
function Circled({ n }: { n: string }) {
  return (
    <span className="of-circled font-serif">
      {n}
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M24 4 C 10 2, 3 12, 4 22 S 14 38, 24 36 S 38 26, 36 15 S 26 3, 15 6" />
      </svg>
    </span>
  );
}

/** Crop marks at the frame's corners, a registration mark at its head and a
 *  grey step bar (a printer's proof). */
function Marks() {
  return (
    <div className="of-marks" aria-hidden="true">
      <i className="of-crop of-crop--tl" />
      <i className="of-crop of-crop--tr" />
      <i className="of-crop of-crop--bl" />
      <i className="of-crop of-crop--br" />
      <svg className="of-reg" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="10" />
        <path d="M20 2 V38 M2 20 H38" />
      </svg>
      <span className="of-steps">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
          <i key={k} style={vars({ '--k': k })} />
        ))}
      </span>
    </div>
  );
}

// ── Act 0: the proof ──────────────────────────────────────────────────────

/** The proof's sheet: the newspaper's newsprint over the first page (let go
 *  at film 0; never quite opaque, so the page under it is drawn). */
function ProofSheet() {
  return <div className="of-proof" data-proof aria-hidden="true" />;
}
/** Its marks (the pages' own: crop marks, registration mark, step bar) and
 *  its slug, above the soft edge so the hairlines stay crisp. Each plate's
 *  label comes with its plate: the lime's (the stylesheet), the ink's (the
 *  clock). */
function ProofMarks() {
  return (
    <div className="of-proof-marks" data-proof-marks aria-hidden="true">
      <Marks />
      <p className="of-proof__slug of-mono">
        {PROOF_SLUG.head}{' '}
        <span className="of-proof__wide">{PROOF_SLUG.wide}</span>{' '}
        <span data-plate="1">{PROOF_SLUG.plates[0]}</span>{' '}
        <span data-plate="2">{PROOF_SLUG.plates[1]}</span>
      </p>
    </div>
  );
}

// ── Act 1: the anchor and the pages round it ──────────────────────────────

const FACE_CLASS: Record<AnchorFace, string> = {
  f900: 'font-serif of-face--f900',
  fit: 'font-serif of-face--fit',
  sg700: 'font-ui of-face--sg700',
  f400: 'font-serif of-face--f400',
  mono: 'of-mono of-face--mono',
};

/** The anchor with its word, one per cut. */
function Key({ index, s }: { index: number; s: Scene }) {
  const word = faceText(s.word, s.face);
  return (
    <div className="of-key" data-key={index} data-early={index === 1 ? '' : undefined}>
      <span className="of-key__block" data-block />
      <span className={`of-key__word ${FACE_CLASS[s.face]}`} data-word>
        {word}
        <Bl />
      </span>
    </div>
  );
}

function Giant({ g, s, k }: { g: Scene['giants'][number]; s: Scene; k: number }) {
  // The motion blur: copies behind the word (away from its drift), each a
  // step further and fainter, set once (they ride with the word).
  const speed = (s.driftPx * 1000) / (s.slots * CUT_MS);
  const step = (speed / 100) * BLUR_STEP_PER_SPEED;
  const [dx, dy] = DRIFT_VEC[s.drift];
  const face = g.face === 'f900' ? 'of-face--f900' : 'of-face--f400';
  return (
    <div className={`of-giant of-giant--${g.align}`} data-giant={k}>
      {BLUR_COPIES.map((c) => (
        <span
          key={c.step}
          className={`of-giant__copy font-serif ${face}`}
          aria-hidden="true"
          // A 2D translate: the copies are drawn into their word's own layer
          // (scaled with the drift by the layout's --drift-k).
          style={vars({
            opacity: c.opacity,
            transform: `translate(calc(var(--drift-k, 1) * ${(-dx * step * c.step).toFixed(1)}px), calc(var(--drift-k, 1) * ${(-dy * step * c.step).toFixed(1)}px))`,
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

/** Where a placed layer wants to be (the island finds it the nearest clear
 *  place). */
const want = (at: Vec2, extra: Record<string, string | number> = {}) => vars({ '--want-x': at[0], '--want-y': at[1], ...extra });

/** An editorial page's layers, under its giant words: the running head, a
 *  taped print, a torn clipping, a receipt, a stamp, a pull quote, a margin
 *  note, a circled number, a barcode, index tabs, a proof's marks. */
function Layers({ l, pictures, seed }: { l: LayerSpec; pictures: readonly OpeningPicture[]; seed: number }) {
  return (
    <>
      {l.run && (
        <div className="of-run" aria-hidden="true">
          <span className="of-run__t font-ui">{l.run[0]}</span>
          <span className="of-run__f font-serif">{l.run[1]}</span>
        </div>
      )}
      {l.marks && <Marks />}
      {l.tabs && (
        <div className="of-tabs" aria-hidden="true">
          {l.tabs.map((t, k) => (
            <span key={t} className={`of-tab font-ui${k === 0 ? ' of-tab--on' : ''}`}>
              {t}
            </span>
          ))}
        </div>
      )}
      {l.print && (
        <figure
          className={`of-print of-print--${l.print.treat}${l.print.ink ? ` of-duo--${l.print.ink}` : ''}`}
          data-place="over"
          data-phone={l.print.phone ? '' : undefined}
          style={want(l.print.at, { '--w': l.print.w, '--rot': `${l.print.rot}deg` })}
        >
          <span className="of-print__img">
            <Picture picture={pictures[l.print.pic]} className="of-pic--print" />
            <i className="of-print__screen" />
          </span>
          <figcaption className="of-print__cap font-serif">{l.print.caption}</figcaption>
          {l.print.tape && <i className="of-tape" />}
        </figure>
      )}
      {l.clip && (
        <div className="of-clip" data-place="over" data-phone={l.clip.phone ? '' : undefined} style={want(l.clip.at, { '--w': l.clip.w, '--rot': `${l.clip.rot}deg` })}>
          <div className="of-clip__paper">
            <p className="of-clip__head font-serif">{l.clip.head}</p>
            <p className="of-clip__body font-serif">{TEXTURE[l.clip.text]}</p>
          </div>
        </div>
      )}
      {l.receipt && (
        <div className="of-receipt of-mono" data-place="over" style={want(l.receipt.at, { '--rot': `${l.receipt.rot}deg` })}>
          {l.receipt.lines.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
      )}
      {l.stamp && (
        <div
          className={`of-stamp of-stamp--${l.stamp.shape} of-inkc--${l.stamp.ink}`}
          data-place="over"
          data-phone={l.stamp.phone ? '' : undefined}
          style={want(l.stamp.at, { '--rot': `${l.stamp.rot}deg` })}
        >
          <span className="of-stamp__t font-ui">{l.stamp.text}</span>
          <span className="of-stamp__s font-ui">{l.stamp.sub}</span>
        </div>
      )}
      {l.barcode && (
        <div className="of-barcode" data-place="over" style={want(l.barcode.at)}>
          <Bars seed={seed} />
          <span className="of-barcode__n of-mono">{l.barcode.code}</span>
        </div>
      )}
      {l.pull && (
        <blockquote className="of-pull font-serif" data-place="" data-phone={l.pull.phone ? '' : undefined} style={want(l.pull.at, { '--w': l.pull.w })}>
          {`“${l.pull.text}”`}
        </blockquote>
      )}
      {l.note && (
        <p className="of-note font-serif" data-place="" data-phone={l.note.phone ? '' : undefined} style={want(l.note.at, { '--rot': `${l.note.rot}deg` })}>
          {l.note.text}
          <Arrow dir={l.note.arrow} />
        </p>
      )}
      {l.num && (
        <p className="of-num" data-place="" style={want(l.num.at)}>
          <Circled n={l.num.n} />
          <span className="of-num__t font-serif">{l.num.text}</span>
        </p>
      )}
    </>
  );
}

/** An editorial page: its layers, the words beside the anchor, a ringed
 *  word, texture. */
function Editorial({ s, index, pictures }: { s: Scene; index: number; pictures: readonly OpeningPicture[] }) {
  return (
    <>
      {s.layers && <Layers l={s.layers} pictures={pictures} seed={500 + index * 7} />}
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
// anchor's line (Row), what is printed above and below it, and what lies on
// it or under it (a second card, a stub, a receipt, a stamp, a print). The
// frame crops every sheet like a close-up.

function Newspaper() {
  const c = SHEETS.newspaper;
  return (
    <>
      <div className="of-news__band">
        <div className="of-news__ear">
          <span className="of-news__ear-t font-ui">Weather</span>
          <span className="of-news__ear-b font-serif">{c.ears[0]}</span>
        </div>
        <div className="of-news__index font-ui">
          {c.index.map(([label, n]) => (
            <span key={label}>
              {label}
              <b>{n}</b>
            </span>
          ))}
        </div>
        <div className="of-news__ear of-news__ear--r">
          <span className="of-news__ear-t font-ui">Edition</span>
          <span className="of-news__ear-b font-serif">{c.ears[1]}</span>
        </div>
      </div>
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
        <p className="of-news__deck font-serif">{c.deck}</p>
        <div className="of-news__cols font-serif">
          {c.body.slice(0, 2).map((k, i) => (
            <p key={k}>
              {i === 0 && <b className="of-news__dateline font-ui">{c.dateline} </b>}
              {TEXTURE[k]}
            </p>
          ))}
          <figure className="of-news__photo">
            <span className="of-news__screen" aria-hidden="true" />
            <figcaption className="of-news__cap font-serif">{c.caption}</figcaption>
          </figure>
          {c.body.slice(2, 4).map((k) => (
            <p key={k}>{TEXTURE[k]}</p>
          ))}
          <blockquote className="of-news__pull font-serif">{c.pull}</blockquote>
          {c.body.slice(4).map((k) => (
            <p key={k}>{TEXTURE[k]}</p>
          ))}
          <p className="of-news__jump font-ui">{c.jump}</p>
          {c.body.slice(0, 4).map((k) => (
            <p key={`b${k}`}>{TEXTURE[(k + 3) % TEXTURE.length]}</p>
          ))}
        </div>
      </div>
      <span className="of-news__folio font-ui">{c.folio}</span>
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
        <p>
          <span className="of-dict__pencil">{c.below[0].slice(0, c.below[0].indexOf(' 2.'))}</span>
          {c.below[0].slice(c.below[0].indexOf(' 2.'))}
        </p>
        {c.below.slice(1).map((x) => (
          <Entry key={x} text={x} />
        ))}
        <p className="of-dict__note font-serif">
          {c.note}
          <Arrow dir="l" className="of-dict__arrow" />
        </p>
      </div>
      <figure className="of-dict__fig">
        <svg viewBox="0 0 120 80" aria-hidden="true">
          <defs>
            <pattern id="of-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <path d="M0 0 V3" />
            </pattern>
          </defs>
          <rect className="of-dict__hatch" x="8" y="6" width="104" height="70" />
          {[0, 1, 2].map((r) =>
            [0, 1, 2, 3].map((c2) => <rect key={`${r}${c2}`} className="of-dict__drawer" x={14 + c2 * 25} y={12 + r * 21} width={21} height={16} />),
          )}
        </svg>
        <figcaption className="of-dict__cap font-serif">{c.fig}</figcaption>
      </figure>
      <div className="of-dict__tabs" aria-hidden="true">
        {c.tabs.map((t, k) => (
          <span key={t} className={`of-dict__tab font-ui${k === 0 ? ' of-dict__tab--on' : ''}`}>
            {t}
          </span>
        ))}
      </div>
      <p className="of-dict__key font-serif">{c.key}</p>
    </>
  );
}

function Magazine({ picture }: { picture?: OpeningPicture }) {
  const c = SHEETS.magazine;
  return (
    <>
      <div className="of-mag__runs font-ui">
        <span>{c.runs[0]}</span>
        <span>{c.runs[1]}</span>
      </div>
      <p className="of-mag__lede font-serif">{c.pull}</p>
      <div className="of-mag__plate">
        <span className="of-mag__img">
          <Picture picture={picture} className="of-pic--plate" />
          <i className="of-print__screen" />
        </span>
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
        <p>
          <span className="of-mag__drop font-serif">{c.body[0].charAt(0)}</span>
          {c.body[0].slice(1)}
        </p>
        <p>{c.body[1]}</p>
        <p>{TEXTURE[5]}</p>
      </div>
      <span className="of-mag__folio of-mag__folio--l font-ui">{c.folios[0]}</span>
      <span className="of-mag__folio of-mag__folio--r font-ui">{c.folios[1]}</span>
      <Marks />
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
        <span className="of-slate__tape font-serif">{c.tape}</span>
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
      <div className="of-slate__wedge" aria-hidden="true">
        {Array.from({ length: 10 }, (_, k) => (
          <i key={k} style={vars({ '--k': k })} />
        ))}
      </div>
      <div className="of-slate__foot font-ui">
        {c.foot.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
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
        <span className="of-ticket__seat">
          {c.seat.map(([label, value]) => (
            <span key={label} className="of-ticket__cell">
              <span className="of-ticket__label font-ui">{label}</span>
              <span className="of-ticket__v font-serif">{value}</span>
            </span>
          ))}
        </span>
      </div>
      <p className="of-ticket__fine font-ui" data-clear=".of-ticket__route">
        {c.fine}
      </p>
      <div className="of-ticket__code">
        <Bars seed={4127} />
        <span className="of-mono">{c.code}</span>
      </div>
      <div className="of-ticket__punch of-inkc--maroon">
        <span className="font-ui">{c.punch}</span>
      </div>
      <div className="of-ticket__receipt of-mono">
        {c.receipt.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
    </>
  );
}

function Passport() {
  const c = SHEETS.passport;
  return (
    <>
      <svg className="of-pass__emblem" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" />
        <circle cx="50" cy="50" r="38" />
        <path d="M50 16 L58 42 L84 42 L63 58 L71 84 L50 68 L29 84 L37 58 L16 42 L42 42 Z" />
      </svg>
      <p className="of-pass__serial" aria-hidden="true">
        {c.serial.split('').map((d, k) => (
          <span key={k} className="of-pass__holes font-ui">
            {d}
          </span>
        ))}
      </p>
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
      <p className="of-pass__mrz of-mono">
        <span>{c.mrz}</span>
        <span>{c.mrz2}</span>
      </p>
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
      <div className="of-wire__stamp of-inkc--maroon">
        <span className="font-ui">{c.stamp[0]}</span>
        <span className="font-ui of-wire__stamp-t">{c.stamp[1]}</span>
      </div>
      <p className="of-wire__clerk font-serif">{c.clerk}</p>
      <div className="of-wire__boxes of-mono" aria-hidden="true">
        {'0417'.split('').map((d, k) => (
          <span key={k}>{d}</span>
        ))}
      </div>
    </>
  );
}

function Postcard({ picture }: { picture?: OpeningPicture }) {
  const c = SHEETS.postcard;
  return (
    <>
      <div className="of-post__stamp" aria-hidden="true">
        <span className="of-post__stamp-face font-ui">{c.stamp}</span>
      </div>
      <div className="of-post__stamp of-post__stamp--b" aria-hidden="true">
        <span className="of-post__stamp-face of-post__stamp-face--pic">
          <Picture picture={picture} className="of-pic--stamp" />
        </span>
      </div>
      <svg className="of-post__mark" viewBox="0 0 160 100" aria-hidden="true">
        <circle cx="50" cy="50" r="40" />
        <circle cx="50" cy="50" r="32" />
        <path d="M96 30 C 110 24, 124 36, 138 30 S 152 26, 158 30 M96 50 C 110 44, 124 56, 138 50 S 152 46, 158 50 M96 70 C 110 64, 124 76, 138 70 S 152 66, 158 70" />
        <text x="50" y="54" textAnchor="middle" className="font-ui">
          {c.mark}
        </text>
      </svg>
      <span className="of-post__air font-ui">{c.airmail}</span>
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

/** What a sheet's paper carries under its words (the spread's pages, the
 *  ticket, the passport's cover, the form, the border): printed ink goes
 *  over it. */
function SheetBack({ kind }: { kind: SheetKind }) {
  switch (kind) {
    case 'magazine':
      return (
        <div className="of-mag__pages" aria-hidden="true">
          <span className="of-mag__page of-mag__page--l" />
          <span className="of-mag__page of-mag__page--r" />
        </div>
      );
    case 'ticket':
      return (
        <>
          <div className="of-ticket of-ticket--under" aria-hidden="true" />
          <div className="of-ticket" aria-hidden="true">
            <span className="of-ticket__perf" />
            <span className="of-ticket__hole" />
          </div>
        </>
      );
    case 'passport':
      return (
        <div className="of-pass__cover" aria-hidden="true">
          <span className="of-pass__guilloche" />
        </div>
      );
    case 'telegram':
      return <div className="of-wire__form" aria-hidden="true" />;
    case 'postcard':
      return <div className="of-post__border" aria-hidden="true" />;
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
    case 'magazine':
      return <Magazine picture={pictures[1]} />;
    case 'slate':
      return <Slate />;
    case 'ticket':
      return <Ticket />;
    case 'passport':
      return <Passport />;
    case 'telegram':
      return <Telegram />;
    case 'postcard':
      return <Postcard picture={pictures[2]} />;
    default:
      return null;
  }
}

/** One cut's page: its ground (a colour, a paper, or the sheet's own), what
 *  is printed and laid round the anchor, and the giant words over it all. */
function Cut({ index, s, pictures }: { index: number; s: Scene; pictures: readonly OpeningPicture[] }) {
  const kind = s.sheet ? `of-cut--sheet of-sheet--${s.sheet}` : `of-cut--editorial of-ground--${s.ground ?? 'bone'}`;
  const dense = s.layers ? ` of-cut--${s.layers.density}` : '';
  return (
    <div
      className={`of-cut ${kind}${dense}${s.ink ? ` of-inkg--${s.ink}` : ''}`}
      data-cut={index}
      data-drift={s.drift}
      data-tone={sceneTone(s)}
      data-early={index === 1 ? '' : undefined}
    >
      <div className={s.sheet ? 'of-sheet__ground' : 'of-cut__ground'} aria-hidden="true" />
      {s.sheet && <SheetBack kind={s.sheet} />}
      {s.sheet ? <Sheet kind={s.sheet} pictures={pictures} /> : <Editorial s={s} index={index} pictures={pictures} />}
      {s.giants.map((g, k) => (
        <Giant key={k} g={g} s={s} k={k} />
      ))}
    </div>
  );
}

/** An editorial cut's print on the frame's edge: the meta at the top
 *  corners and the credit centred at the foot, above the frame's soft edge
 *  (crisp in the corners). */
function Chrome({ index, s }: { index: number; s: Scene }) {
  if (!s.deco) return null;
  return (
    <div className={`of-chrome of-ground--${s.ground ?? 'bone'}`} data-chrome={index} data-early={index === 1 ? '' : undefined}>
      <span className="of-meta of-meta--l font-ui">{s.deco.metaL}</span>
      <span className="of-meta of-meta--r font-ui">{s.deco.metaR}</span>
      <span className="of-credit font-ui">{CREDIT}</span>
    </div>
  );
}

// ── Act 3: the typewriter relay ───────────────────────────────────────────
// The same line on eight machines, each in its own face (the island sets
// every machine's size so its capitals are one height, and its line so the
// baseline and the left edge are one): only the machine is cut round it,
// and the typed count carries on.
const INK = ribbon(TYPED);
const RELAY_FACE: Record<StyleId, string> = {
  mac: 'font-ui of-rf--pixel',
  crt: 'of-mono of-rf--dot',
  film: 'font-ui of-rf--edge',
  label: 'font-ui of-rf--emboss',
  beige: 'font-ui of-rf--sans',
  bone: 'font-serif of-rf--serif',
  grid: 'font-serif of-rf--hand',
  paper: 'of-mono of-rf--type',
};

/** The hand-drawn looping arrow on the grid paper, drawn in six stages
 *  (each a longer stretch of one path; the island shows them in turn). */
const ARROW = 'M34 188 C 20 140, 60 104, 104 118 C 150 132, 142 184, 104 180 C 70 176, 78 118, 132 96 C 176 78, 222 70, 262 44';
const ARROW_STAGES = [0.16, 0.33, 0.5, 0.67, 0.84, 1];
const FILM_PERFS = Array.from({ length: 30 }, (_, i) => <i key={i} />);

function Style({ id, pictures }: { id: StyleId; pictures: readonly OpeningPicture[] }) {
  let line: ReactNode = TYPED;
  if (id === 'paper') {
    // Typewriter ink: every letter struck a little harder or softer, a hair
    // off true.
    line = TYPED.split('').map((ch, i) => (
      <span key={i} className="of-strike" style={vars({ '--ink': INK[i].ink, '--dx': `${INK[i].dx}px`, '--dy': `${INK[i].dy}px` })}>
        {ch}
      </span>
    ));
  }
  const grows = id === 'label' || id === 'grid';
  return (
    <div className={`of-mat of-mat--${id}`} data-mat={id}>
      <div className="of-mat__ground">
        {id === 'mac' && (
          <span className="of-mac__screen" aria-hidden="true">
            <span className="of-mac__menu font-ui">
              <b>File</b>
              <b>Edit</b>
              <b>Style</b>
              <b>Font</b>
            </span>
            <span className="of-mac__window">
              <span className="of-mac__title">
                <i className="of-mac__close" />
                <span className="of-mac__name font-ui">Untitled</span>
              </span>
            </span>
            <span className="of-mac__icon of-mac__icon--a" />
            <span className="of-mac__icon of-mac__icon--b" />
          </span>
        )}
        {id === 'crt' && (
          // A terminal's status line: the screen is a machine, not a field
          // of colour (PROPOSED copy).
          <span className="of-crt__status of-mono" aria-hidden="true">
            READY
          </span>
        )}
        {id === 'film' && (
          <span className="of-film__strip" aria-hidden="true">
            <span className="of-film__perfs of-film__perfs--t">{FILM_PERFS}</span>
            <span className="of-film__frame of-film__frame--l">
              <Picture picture={pictures[2]} className="of-pic--film" />
            </span>
            <span className="of-film__frame of-film__frame--r">
              <Picture picture={pictures[1]} className="of-pic--film" />
            </span>
            <span className="of-film__num of-film__num--a of-mono">12 ▸ 12A</span>
            <span className="of-film__num of-film__num--b of-mono">13 ▸ 13A</span>
            <span className="of-film__perfs of-film__perfs--b">{FILM_PERFS}</span>
          </span>
        )}
        {id === 'label' && <span className="of-label__gloss" aria-hidden="true" />}
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
                <span className="of-beige__font font-ui">Sans · 12</span>
              </span>
            </span>
            <span className="of-beige__ruler" />
          </span>
        )}
        {id === 'bone' && <span className="of-bone__margin" aria-hidden="true" />}
        {id === 'grid' && (
          <>
            <span className="of-grid__print" aria-hidden="true">
              <Picture picture={pictures[0]} className="of-pic--print" />
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
          <span className={`of-typed ${RELAY_FACE[id]}`} data-typed>
            {line}
            <Bl />
          </span>
          {id === 'crt' && (
            // The phosphor's bloom: the same line, soft, under the dots.
            <span className={`of-typed of-typed--bloom ${RELAY_FACE[id]}`} aria-hidden="true">
              {TYPED}
            </span>
          )}
        </Reveal>
        {grows && <i className={`of-grow-end of-grow-end--${id}`} data-grow-end aria-hidden="true" />}
        {/* The cursor: the island moves it and shows it; its ink blinks on
            the film's clock (solid while it types). */}
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
 * Every scene, stacked (the island times them): the frame (the paper, every
 * cut's page, the proof's sheet, the anchor, the soft edge, the proof's
 * marks, the grain; the relay's machines
 * over them; the hand-off's lime block; for the burn the sepia and its
 * canvas and — past its foot — the frame line and perforations a slip
 * shows), the dark of the burn with its leader and lit perforations, and the
 * dark of the end with the title. `pictures`: his photographs (the prints,
 * the magazine's plate, the lightbox's frames).
 */
export default function OpeningScenes({ pictures = [] }: { pictures?: readonly OpeningPicture[] }) {
  return (
    <>
      <div className="of-burnground" data-burnground />

      <div className="of-frame" data-frame>
        <div className="of-frame__paper" data-paper />
        {SCENES.map((s, i) => (
          <Cut key={i} index={i} s={s} pictures={pictures} />
        ))}
        {/* Act 0: the proof over the first page, under its anchor. */}
        <ProofSheet />
        <div className="of-anchor" data-anchor>
          {SCENES.map((s, i) => (
            <Key key={i} index={i} s={s} />
          ))}
        </div>
        <div className="of-frame__soft" data-soft />
        <ProofMarks />
        {SCENES.map((s, i) => (
          <Chrome key={i} index={i} s={s} />
        ))}
        <div className="of-frame__grain" data-grain>
          <i className="of-grain__tile" data-grain-tile />
        </div>
        <div className="of-frame__vignette" data-vignette />
        <div className="of-act of-act--type" data-act="type">
          {STYLES.map(({ id }) => (
            <Style key={id} id={id} pictures={pictures} />
          ))}
        </div>
        {/* The hand-off: the anchor's lime block, alone, into the cursor. */}
        <i className="of-handoff" data-handoff aria-hidden="true" />
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

      {/* Still filters, drawn once: the photocopy's toner edge; a 1-bit
          desktop's bitmap (the letters sampled on a coarse grid, every
          sample all ink or none) at the desktop's size and the phone's. */}
      <svg className="of-defs" aria-hidden="true" focusable="false">
        <filter id="of-copy-edge" x="-5%" y="-30%" width="110%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {[4, 2].map((k) => (
          <filter key={k} id={`of-pixel-${k}`} x="-4%" y="-20%" width="108%" height="140%" colorInterpolationFilters="sRGB">
            <feFlood x={k / 2} y={k / 2} width="1" height="1" floodColor="#171b15" />
            <feComposite width={k} height={k} />
            <feTile result="grid" />
            <feComposite in="SourceGraphic" in2="grid" operator="in" />
            <feComponentTransfer>
              <feFuncA type="discrete" tableValues="0 1 1" />
            </feComponentTransfer>
            <feMorphology operator="dilate" radius={k / 2} />
          </filter>
        ))}
      </svg>
    </>
  );
}
