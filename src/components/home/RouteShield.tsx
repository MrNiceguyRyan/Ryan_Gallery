import type { CSSProperties } from 'react';
import {
  FLAP,
  type ShieldForm,
  flapGlyph,
  flapPlan,
  flapText,
  keptShows,
  shieldForm,
  signNameSize,
} from '../../lib/routeShield';

/**
 * A word that can turn like a departure board (src/lib/routeShield.ts,
 * FLAP). Each character is its own box, holding the final glyph's width, so
 * the flips never move the line: while a character turns, its own glyph is
 * inked out and the flip is printed over it (`data-show`, global.css
 * "The split-flap"). `role` names the word for the board, which turns each
 * word from the one it is leaving ('name', 'code', 'num'). A name also holds
 * the name being left, set over its blank cells until they turn
 * (`.flap-was`, empty otherwise).
 */
export function FlapWord({ text, role, className }: { text: string; role: string; className?: string }) {
  // Words are kept whole (`.flap-w`): between two character boxes the line
  // could otherwise break anywhere ("BRYCE CAN / YON"); only the spaces
  // between words are places to break.
  const words = text.split(/(\s+)/).filter(Boolean);
  return (
    <span className={className} data-flap={role}>
      {words.map((word, wordIndex) => (
        /^\s+$/.test(word)
          ? ' '
          : (
            <span key={wordIndex} className="flap-w">
              {Array.from(word).map((character, index) => (
                <span key={index} className="flap-c" data-flap-c={character.toUpperCase()}>
                  {character}
                </span>
              ))}
            </span>
          )
      ))}
      {role === 'name' && <span className="flap-was" data-flap-was="" aria-hidden="true" />}
    </span>
  );
}

/** The words a board turns from: the place being left's name, its state's
 *  letters and its stop number. */
export type FlapFrom = Partial<Record<'name' | 'code' | 'num', string>>;

/** One character of a board: what it shows `t` ms after the retract
 *  (`data-show`; null: its own glyph) and what it shows now. */
interface FlapCell {
  el: HTMLElement;
  at: (t: number) => string | null;
  shown: string | null;
}
/** A letter of the name being left, set over the new name's cells. */
interface KeptLetter {
  el: HTMLElement;
  shows: (t: number) => boolean;
  on: boolean;
}
interface Board {
  cells: FlapCell[];
  kept: KeptLetter[];
  overlay: HTMLElement | null;
  /** ms after the retract: every character down. */
  end: number;
}

/** A word's character boxes, each with its place in the word's text (the
 *  spaces between words counted: the cascade runs through them). */
function cellsOf(word: HTMLElement) {
  const out: Array<{ el: HTMLElement; index: number; final: string }> = [];
  let index = 0;
  word.childNodes.forEach((node) => {
    if (node instanceof HTMLElement) {
      if (node.hasAttribute('data-flap-was')) return;
      node.querySelectorAll<HTMLElement>('[data-flap-c]').forEach((el) => {
        out.push({ el, index, final: el.dataset.flapC ?? '' });
        index += 1;
      });
    } else if (node.textContent && /\s/.test(node.textContent) && index > 0) {
      index += 1;
    }
  });
  return out;
}

/** Sets the name being left in the overlay, a box a letter (as the cells
 *  set theirs: no kerning between them, so the letters the leaving ticket
 *  keeps and these fall on the same pixels), its words kept whole. */
function fillOverlay(overlay: HTMLElement, text: string, newName: string): HTMLElement[] {
  overlay.textContent = '';
  const letters: HTMLElement[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean);
  words.forEach((word, wordIndex) => {
    if (wordIndex > 0) overlay.append(' ');
    const w = document.createElement('span');
    w.className = 'flap-w';
    Array.from(word).forEach((character) => {
      const c = document.createElement('span');
      c.className = 'flap-k';
      c.textContent = character;
      w.append(c);
      letters.push(c);
    });
    overlay.append(w);
  });
  // Set at its own size, should it differ from the new name's.
  const own = signNameSize(text);
  if (own !== signNameSize(newName)) overlay.style.fontSize = `${own}px`;
  else overlay.style.removeProperty('font-size');
  return letters;
}

/**
 * Every FlapWord under `root` as a board turning from the words it is
 * leaving (`from`, the previous stop's), on the reference's plan
 * (src/lib/routeShield.ts, FLAP): the name retracts to its first letters
 * and cascades into place; the stop number turns on the same numbers; the
 * state turns only if it changes, in from a blank band. `force` turns the
 * name even onto itself (a ticket turned back to its own place after it had
 * retracted). `seed` sets the run's scatter.
 */
function boardOf(root: HTMLElement, from: FlapFrom, seed: number, force = false): Board {
  const board: Board = { cells: [], kept: [], overlay: null, end: 0 };
  root.querySelectorAll<HTMLElement>('[data-flap]').forEach((word, wordIndex) => {
    const role = word.dataset.flap ?? '';
    const cells = cellsOf(word);
    const finalText = flapText(Array.from(word.childNodes)
      .filter((node) => !(node instanceof HTMLElement && node.hasAttribute('data-flap-was')))
      .map((node) => node.textContent ?? '')
      .join(''));
    const leaving = flapText((role === 'name' ? from.name : role === 'code' ? from.code : from.num) ?? '');
    const plan = flapPlan(finalText.length);
    const add = (el: HTMLElement, at: (t: number) => string | null, land: number) => {
      board.cells.push({ el, at, shown: el.getAttribute('data-show') });
      board.end = Math.max(board.end, land);
    };
    // Nothing to turn from, or nothing changes: printed as it is.
    if (!leaving || (leaving === finalText && !(force && role === 'name'))) {
      cells.forEach(({ el }) => add(el, () => null, 0));
      return;
    }
    const salt = seed + wordIndex * 7919;
    if (role === 'num') {
      // The number being left, digit for digit, until each digit turns.
      const was = leaving.padStart(finalText.length, '0');
      cells.forEach(({ el, index, final }) => {
        const step = plan[index];
        const before = was[index] ?? '';
        add(el, (t) => {
          const glyph = flapGlyph(final, before, step, t, salt, index);
          return glyph === final ? null : glyph;
        }, step.land);
      });
      return;
    }
    if (role === 'code') {
      // A new state's letters turn in from a blank band.
      cells.forEach(({ el, index, final }) => {
        const step = plan[index];
        add(el, (t) => {
          const glyph = flapGlyph(final, '', step, t, salt, index);
          return glyph === final ? null : glyph;
        }, step.land);
      });
      return;
    }
    // The name: its cells blank until each starts (the name being left is
    // set over them, whole before the retract, then its first letters).
    cells.forEach(({ el, index, final }) => {
      const step = plan[index];
      add(el, (t) => {
        if (t < step.start) return '';
        const glyph = flapGlyph(final, '', step, t, salt, index);
        return glyph === final ? null : glyph;
      }, step.land);
    });
    const overlay = word.querySelector<HTMLElement>(':scope > [data-flap-was]');
    if (overlay) {
      board.overlay = overlay;
      const count = finalText.length;
      fillOverlay(overlay, from.name ?? '', finalText).forEach((el, index) => {
        board.kept.push({ el, shows: (t) => keptShows(index, count, t), on: true });
      });
      board.end = Math.max(board.end, FLAP.pause + FLAP.stagger * (FLAP.keep - 1));
    }
  });
  return board;
}

/** Writes a board as it stands `t` ms after its retract, only what changes. */
function writeBoard(board: Board, t: number) {
  board.cells.forEach((cell) => {
    const show = cell.at(t);
    if (cell.shown === show) return;
    cell.shown = show;
    if (show == null) cell.el.removeAttribute('data-show');
    else cell.el.setAttribute('data-show', show);
  });
  board.kept.forEach((letter) => {
    const on = letter.shows(t);
    if (letter.on === on) return;
    letter.on = on;
    letter.el.style.visibility = on ? '' : 'hidden';
  });
}

/** Puts every word straight back (its own glyphs, no overlay). */
function clearBoard(board: Board) {
  board.cells.forEach((cell) => {
    cell.shown = null;
    cell.el.removeAttribute('data-show');
  });
  if (board.overlay) {
    board.overlay.textContent = '';
    board.overlay.style.removeProperty('font-size');
  }
}

const newSeed = () => Math.floor(Math.random() * 0x7fffffff);

/**
 * Sets the board to the stop being left, without turning (the camera has
 * taken off toward this stop): the name being left whole over the blank
 * cells, the number being left, a changing state's band blank — as the
 * board's first frame before its retract, so a ticket carries in the words
 * it leaves. Returns a clear that puts every word back.
 */
export function primeFlap(root: HTMLElement, from: FlapFrom): () => void {
  const board = boardOf(root, from, 0);
  writeBoard(board, -1);
  return () => clearBoard(board);
}

/**
 * Turns every FlapWord under `root` into place from the words it is leaving
 * (`from`): the retract at `origin` (performance.now() ms: the board may be
 * taken over part-way, a ticket laid on at its relay picks the turn up where
 * it stands), then the cascade, on one rAF loop that runs only for the
 * board and writes a character only when it changes. The frame it starts in
 * is written at once. Returns a stop that puts every word straight back.
 */
export function runFlap(root: HTMLElement, from: FlapFrom = {}, options: { origin?: number; force?: boolean; seed?: number } = {}): () => void {
  const board = boardOf(root, from, options.seed ?? newSeed(), options.force);
  if (!board.cells.length && !board.kept.length) return () => {};
  const origin = options.origin ?? performance.now();
  let frame = 0;
  const tick = () => {
    frame = 0;
    const t = performance.now() - origin;
    writeBoard(board, t);
    if (t < board.end) frame = requestAnimationFrame(tick);
    else clearBoard(board);
  };
  tick();
  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    clearBoard(board);
  };
}

/**
 * The leaving ticket's half of the turn (src/lib/coverDock.ts, "The
 * switch"): its own name retracts to its first FLAP.keep letters at the
 * board's retract, so the ticket laid on it at the relay — its board
 * FLAP.pause into the same turn, the same letters kept — takes the name up
 * on the same pixels. Returns a restore.
 */
export function retractFlap(root: HTMLElement): () => void {
  const word = root.querySelector<HTMLElement>('[data-flap="name"]');
  if (!word) return () => {};
  const gone = cellsOf(word).filter(({ index }) => index >= FLAP.keep).map(({ el }) => el);
  gone.forEach((el) => el.setAttribute('data-show', ''));
  return () => gone.forEach((el) => el.removeAttribute('data-show'));
}

/** A shield's drawing (src/lib/routeShield.ts, SHIELD_FORMS): its state's
 *  form as a bone plate, the band printed in the place's stock
 *  (`--shield-accent`, else the paper it is printed on), and the form's dark
 *  ink over them. */
function ShieldDrawing({ form }: { form: ShieldForm }) {
  return (
    <>
      <path d={form.plate} className="route-shield__paper" />
      <path d={form.band} className="route-shield__band" />
      {form.rim && (
        <path
          d={form.plate}
          className="route-shield__ink"
          style={{ strokeWidth: form.inkWidth }}
          transform={`translate(50 50) scale(${form.rim}) translate(-50 -50)`}
        />
      )}
      {form.ink && <path d={form.ink} className="route-shield__ink" style={{ strokeWidth: form.inkWidth }} />}
    </>
  );
}

const percent = (value: number) => `${Math.round(value * 1000) / 1000}%`;

/**
 * The route shield as printed on paper (the ticket's head, the phone stub,
 * the story's kept stub): its state's form drawn, the state and the stop
 * number set over it as type, on the form's own lines, so they can turn on a
 * landing (`flap`) and be read like any other print. `accent` is the
 * place's stock (src/lib/ticketStock.ts): the band is printed in it, so the
 * ticket's shield is the map's. `numberClassName` lets the ticket name its
 * ordinal for the story's kept stub (.archive-ticket-stub__no).
 */
export function RouteShield({ code, number, accent, className = '', numberClassName = '', flap = false }: {
  code: string;
  number: string;
  accent?: string;
  className?: string;
  numberClassName?: string;
  flap?: boolean;
}) {
  const form = shieldForm(code);
  const style = {
    '--shield-ratio': form.h / 100,
    '--code-x': percent(form.code.x),
    '--code-y': percent((form.code.y / form.h) * 100),
    '--code-size': form.code.size / 100,
    '--num-x': percent(form.num.x),
    '--num-y': percent((form.num.y / form.h) * 100),
    '--num-size': form.num.size / 100,
    ...(accent ? { '--shield-accent': accent } : null),
  } as CSSProperties;
  return (
    <span className={`route-shield ${className}`} data-shield-form={form.key} style={style}>
      <svg className="route-shield__plate" viewBox={`0 0 100 ${form.h}`} aria-hidden="true" focusable="false">
        <ShieldDrawing form={form} />
      </svg>
      <span className="route-shield__code">
        {flap && code ? <FlapWord text={code} role="code" /> : code}
      </span>
      <span className={`route-shield__num ${numberClassName}`}>
        {flap ? <FlapWord text={number} role="num" /> : number}
      </span>
    </span>
  );
}

/** The route shield as the map prints it: small, all of it drawn (SVG type
 *  holds its place exactly at map sizes, where HTML type rounds), its band
 *  in the place's stock. Sized by its box (`width` × the form's ratio). */
export function MapShield({ code, number, accent, width }: {
  code: string;
  number: string;
  accent?: string;
  width: number;
}) {
  const form = shieldForm(code);
  return (
    <svg
      className="place-shield__plate"
      viewBox={`0 0 100 ${form.h}`}
      width={width}
      height={Math.round(((width * form.h) / 100) * 100) / 100}
      style={accent ? ({ '--shield-accent': accent } as CSSProperties) : undefined}
      data-shield-form={form.key}
      aria-hidden="true"
      focusable="false"
    >
      <ShieldDrawing form={form} />
      {code && (
        <text x={form.code.x} y={form.code.y} fontSize={form.code.size} className="place-shield__code" textAnchor="middle">
          {code}
        </text>
      )}
      <text x={form.num.x} y={form.num.y} fontSize={form.num.size} className="place-shield__num" textAnchor="middle">
        {number}
      </text>
    </svg>
  );
}
