import type { CSSProperties, ReactNode } from 'react';
import {
  BLUR_COPIES,
  BLUR_STEP_PER_SPEED,
  COMPOSITIONS,
  CREDIT,
  DARK_TYPED,
  DRIFT_VEC,
  FOUND_WORD,
  LEADER,
  MATERIALS,
  TEXTURE,
  TITLE_SUB,
  TITLE_YOU,
  TYPED,
  ribbon,
  type AnchorFace,
  type Composition,
  type LeaderCard,
  type MaterialId,
} from '../../lib/openingFilm';

// ── The opening film's scenes ──
// Plain markup, the same on the server and the client (no branch on the
// viewport or on reduced motion: CSS decides what shows, the island decides
// when). Every text element names its face: `font-serif` (Fraunces),
// `font-ui` (Space Grotesk) or `of-mono` (the typewriter's monospace, used
// only for the typing and the screens) — a label with none falls through to
// the body's Inter. Nothing here is transformed at rest; what moves, the
// island moves (transform and opacity on the film's one clock), and where a
// word must be measured it carries a baseline probe (`.of-bl`).
//
// Copy new in this cut is marked PROPOSED (awaiting the owner): the leader
// cards, the labels and meta round the anchor, the credit, and the YOU line.

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** A zero-size probe on the baseline. */
const Bl = () => <i className="of-bl" aria-hidden="true" />;

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

// ── Act 1: the typewriter relay ───────────────────────────────────────────
// The same line in four materials, set identically (one face, one size, one
// place): only the material is cut under it.
const INK = ribbon(TYPED);
const WORDS = (() => {
  // The line as its words (each with the space after it), for the
  // photocopy's strip: each word carries its own piece of the strip, so the
  // words can be pushed apart when ARCHIVE is found.
  const out: { text: string; from: number; key: string }[] = [];
  let at = 0;
  TYPED.split(' ').forEach((word, i, all) => {
    const text = i < all.length - 1 ? `${word} ` : word;
    out.push({ text, from: at, key: word });
    at += text.length;
  });
  return out;
})();

function Material({ id }: { id: MaterialId }) {
  let line: ReactNode;
  if (id === 'paper') {
    // Typewriter ink: every letter struck a little harder or softer, a hair
    // off true.
    line = TYPED.split('').map((ch, i) => (
      <span key={i} className="of-strike" style={vars({ '--ink': INK[i].ink, '--dx': `${INK[i].dx}px`, '--dy': `${INK[i].dy}px` })}>
        {ch}
      </span>
    ));
  } else if (id === 'copy') {
    line = WORDS.map((w) => (
      <span key={w.key} className="of-copy__word" data-word={w.key}>
        <span className="of-copy__strip" aria-hidden="true" />
        <span className="of-copy__ink">{w.text}</span>
      </span>
    ));
  } else {
    line = TYPED;
  }
  return (
    <div className={`of-mat of-mat--${id}`} data-mat={id}>
      <div className="of-mat__ground" />
      <div className="of-line" data-line>
        <Reveal>
          <span className="of-typed of-mono" data-typed>
            {line}
            <Bl />
          </span>
          {id === 'phosphor' && (
            // The phosphor's bloom: the same line, soft, under the dots.
            <span className="of-typed of-typed--bloom of-mono" aria-hidden="true">
              {TYPED}
            </span>
          )}
        </Reveal>
        <i className="of-cursor" data-cursor />
      </div>
      <div className="of-mat__over" />
    </div>
  );
}

// ── Act 3: the anchor and the pages round it ──────────────────────────────

const FACE_CLASS: Record<AnchorFace, string> = {
  f900: 'font-serif of-face--f900',
  f400: 'font-serif of-face--f400',
  sg700: 'font-ui of-face--sg700',
  mono: 'of-mono of-face--mono',
};

/** The anchor with its word, one per cut. The first is also the found word
 *  of act 2: its typewriter face ("archive") turns into its Fraunces face
 *  (ARCHIVE) as it glides to the anchor. */
function Key({ index, c }: { index: number; c: Composition }) {
  return (
    <div className="of-key" data-key={index}>
      <span className="of-key__clip" data-clip>
        <span className="of-key__clip-in" data-clip-in>
          <span className="of-key__block" data-block />
          {index === 0 && (
            <span className="of-key__word of-key__word--from of-mono" data-from>
              {FOUND_WORD}
              <Bl />
            </span>
          )}
          <span className={`of-key__word ${FACE_CLASS[c.face]}`} data-word>
            {c.word}
            <Bl />
          </span>
        </span>
      </span>
    </div>
  );
}

/** A hand-drawn ring (one loop, its end past its start). */
function Ring() {
  return (
    <svg className="of-ring" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
      <path d="M62 6 C 30 3, 5 12, 5 31 S 32 57, 57 55 S 96 45, 95 27 S 70 3, 36 9" />
    </svg>
  );
}

function Giant({ g, c }: { g: Composition['giants'][number]; c: Composition }) {
  // The motion blur: copies behind the word (away from its drift), each a
  // step further and fainter, set once (they ride with the word).
  const speed = (c.driftPx * 1000) / 250;
  const step = (speed / 100) * BLUR_STEP_PER_SPEED;
  const [dx, dy] = DRIFT_VEC[c.drift];
  const face = g.face === 'f900' ? 'of-face--f900' : 'of-face--f400';
  return (
    <div className={`of-giant of-giant--${g.align}`} data-giant style={vars({ '--gx': g.x, '--gy': g.y, '--gcap': g.cap })}>
      {BLUR_COPIES.map((k) => (
        <span
          key={k.step}
          className={`of-giant__copy font-serif ${face}`}
          aria-hidden="true"
          style={vars({ opacity: k.opacity, transform: `translate3d(${(-dx * step * k.step).toFixed(1)}px, ${(-dy * step * k.step).toFixed(1)}px, 0)` })}
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

function Page({ index, c }: { index: number; c: Composition }) {
  return (
    <div className="of-cut" data-cut={index} data-drift={c.drift}>
      {c.giants.map((g, k) => (
        <Giant key={k} g={g} c={c} />
      ))}
      {c.texture.map((t, k) => (
        <p key={k} className="of-texture font-serif" style={vars({ '--tx': t.at[0], '--ty': t.at[1], '--tw': `${t.w}px` })}>
          {TEXTURE[t.text]}
        </p>
      ))}
      {/* PROPOSED copy: the label and the place beside the anchor. */}
      <p className="of-aux of-aux--label font-ui">{c.label}</p>
      <p className="of-aux of-aux--line font-serif">{c.line}</p>
      <span className="of-ringed font-ui" style={vars({ '--rx': c.ring[0], '--ry': c.ring[1] })}>
        {c.ringed}
        <Ring />
      </span>
      <span className="of-meta of-meta--l font-ui">{c.metaL}</span>
      <span className="of-meta of-meta--r font-ui">
        {c.frame}
        <span className="of-meta__at"> · {c.at}</span>
      </span>
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
          <circle cx="100" cy="100" r="92" />
          <circle cx="100" cy="100" r="74" />
          <path d="M100 0 V200 M0 100 H200" />
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
 * Every scene, stacked (the island times them): the typed materials, the
 * frame (the paper, every cut's page, the anchor, the soft edge, the grain,
 * the sepia and the burn's canvas, and — past its foot — the frame line and
 * perforations a slip shows), the dark of the burn with its leader and lit
 * perforations, and the dark of the end with the title.
 */
export default function OpeningScenes() {
  return (
    <>
      <div className="of-act of-act--type" data-act="type">
        {MATERIALS.desktop.map((id) => (
          <Material key={id} id={id} />
        ))}
      </div>

      <div className="of-burnground" data-burnground />

      <div className="of-frame" data-frame>
        <div className="of-frame__paper" data-paper />
        {COMPOSITIONS.map((c, i) => (
          <Page key={i} index={i} c={c} />
        ))}
        <div className="of-anchor" data-anchor>
          {COMPOSITIONS.map((c, i) => (
            <Key key={i} index={i} c={c} />
          ))}
        </div>
        <div className="of-frame__soft" data-soft />
        <div className="of-frame__grain" data-grain />
        <div className="of-frame__vignette" data-vignette />
        <div className="of-frame__sepia" data-sepia />
        <canvas className="of-burn" data-burn />
        <div className="of-frame__veil" data-veil />
        {/* Past the frame's foot: what a slip shows — the frame line with
            its perforations, and the top of the next frame. */}
        <div className="of-frame__next" aria-hidden="true">
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
        <div className="of-end__grain" />
        <div className="of-end__title">
          <div className="of-title" data-title>
            <Reveal className="of-title__typed">
              <span className="of-title__mono of-mono" data-title-from>
                {DARK_TYPED}
                <Bl />
              </span>
            </Reveal>
            <i className="of-title__cursor" data-title-cursor />
            <span className="of-title__name font-serif" data-title-to>
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
