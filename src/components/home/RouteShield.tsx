import type { CSSProperties } from 'react';
import { CSS_EASE } from '../../lib/motion';
import {
  FLAP,
  TICKET_NAME_LINE,
  type FlapTiming,
  type ShieldForm,
  codePlan,
  flapGlyph,
  flapNumber,
  flapPlan,
  nameStep,
  rollMs,
  shieldForm,
  signLines,
} from '../../lib/routeShield';

/**
 * A word that can turn like a departure board's flap (src/lib/routeShield.ts,
 * FLAP). Each character is its own box, holding the final glyph's width, so
 * the flips never move the line: while a character turns, its own glyph is
 * inked out and the flip is printed over it (`data-show`, global.css
 * "The split-flap"). `role` names the word for the flap runner, which starts
 * each word from the one it is leaving ('name', 'code', 'num'). A name also
 * holds the name being left, set whole over its blanked cells until it turns
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

/** One character of a board: what it shows at `t` ms into the flap, when it
 *  is down, and what it is showing now (`data-show`, null = its own glyph). */
interface FlapColumn {
  el: HTMLElement;
  final: string;
  at: (t: number) => string;
  land: number;
  shown: string | null;
  /** The name being left, set whole (`.flap-was`): written as its text. */
  was?: boolean;
}

/**
 * Every FlapWord under `root` as columns turning from the words it is
 * leaving (`from[role]`, the previous stop's): the name through its plan
 * (src/lib/routeShield.ts, FLAP), the state only if it changes (CODE_FLIPS),
 * the stop number counting through the real stops between, its last step
 * landing with the name's last character.
 */
function flapColumns(root: HTMLElement, from: Partial<Record<string, string>>, timing: FlapTiming = {}): FlapColumn[] {
  const delay = timing.delay ?? FLAP.delay;
  const words = Array.from(root.querySelectorAll<HTMLElement>('[data-flap]')).map((word) => {
    const role = word.dataset.flap ?? '';
    return {
      role,
      el: word,
      chars: Array.from(word.querySelectorAll<HTMLElement>('[data-flap-c]')),
      text: (from[role] ?? '').trim(),
      leaving: (from[role] ?? '').replace(/\s+/g, '').toUpperCase(),
    };
  });
  let nameEnd: number = delay;
  words.forEach((word) => {
    if (word.role !== 'name') return;
    const plan = flapPlan(word.chars.length, timing);
    if (plan.length) nameEnd = Math.max(nameEnd, plan[plan.length - 1].land);
  });
  const columns: FlapColumn[] = [];
  words.forEach((word, wordIndex) => {
    const finalWord = word.chars.map((el) => el.dataset.flapC ?? '').join('');
    const column = (el: HTMLElement, at: (t: number) => string, land: number) => columns.push({
      el,
      final: el.dataset.flapC ?? '',
      at,
      land,
      shown: el.getAttribute('data-show'),
    });
    if (word.role === 'num') {
      word.chars.forEach((el, index) => column(
        el,
        (t) => flapNumber(finalWord, word.leaving, t, delay, nameEnd)[index] ?? (el.dataset.flapC ?? ''),
        nameEnd,
      ));
      return;
    }
    if (word.role === 'code') {
      // The same state stays down; with no stop left behind there is
      // nothing for it to turn from. A new state's letters turn in from a
      // blank band: the shield already wears the new state's form (the
      // stock and the outline are the ticket's own print), and the old
      // state's letters on it — FL on Arizona's outline — read as a misprint.
      const still = !word.leaving || word.leaving === finalWord;
      const plan = codePlan(word.chars.length, delay);
      word.chars.forEach((el, index) => {
        const final = el.dataset.flapC ?? '';
        column(el, still ? () => final : (t) => flapGlyph(final, '', plan[index], t, index + wordIndex * 5), still ? 0 : plan[index].land);
      });
      return;
    }
    // The name: the same name stays down. Otherwise the name being left is
    // set whole over the blanked cells until FLAP.delay, and then every
    // cell turns until its landing.
    if (word.leaving === finalWord) {
      word.chars.forEach((el) => {
        const final = el.dataset.flapC ?? '';
        column(el, () => final, 0);
      });
      return;
    }
    const was = word.el.querySelector<HTMLElement>(':scope > [data-flap-was]');
    if (was) {
      columns.push({
        el: was,
        final: '',
        at: (t) => (t < delay ? word.text : ''),
        land: delay,
        shown: was.textContent || null,
        was: true,
      });
    }
    const plan = flapPlan(word.chars.length, timing);
    word.chars.forEach((el, index) => {
      const final = el.dataset.flapC ?? '';
      const step = nameStep(plan[index], delay);
      column(el, (t) => flapGlyph(final, '', step, t, index + wordIndex * 5), step.land);
    });
  });
  return columns;
}

/** Writes a column's glyph, only when it changes: its own glyph clears
 *  `data-show`. */
function writeColumn(column: FlapColumn, glyph: string | null) {
  const show = glyph == null || glyph === column.final ? null : glyph;
  if (column.shown === show) return;
  column.shown = show;
  if (column.was) column.el.textContent = show ?? '';
  else if (show == null) column.el.removeAttribute('data-show');
  else column.el.setAttribute('data-show', show);
}

/**
 * Sets the board to the stop being left, without turning (the camera has
 * taken off toward this stop): every FlapWord under `root` shows the words
 * `from` holds — the name whole, the state and the number in their cells —
 * as runFlap's first frame will, so the name a ticket carries in is the one
 * being left, and the turn on the landing starts from exactly what is on
 * screen. Returns a clear that puts every word back.
 */
export function primeFlap(root: HTMLElement, from: Partial<Record<string, string>>): () => void {
  const columns = flapColumns(root, from);
  columns.forEach((column) => writeColumn(column, column.at(0)));
  return () => columns.forEach((column) => writeColumn(column, null));
}

/**
 * Turns every FlapWord under `root` into place from the words it is leaving
 * (`from[role]`), on one rAF loop that runs only for the flap and writes a
 * character only when it changes. Takes over a primed board where it
 * stands. `timing` times it to its moment (a switch's transit: at once, and
 * down inside it). Returns a stop that puts every word straight back.
 */
export function runFlap(root: HTMLElement, from: Partial<Record<string, string>> = {}, timing: FlapTiming = {}): () => void {
  const columns = flapColumns(root, from, timing);
  if (!columns.length) return () => {};
  const end = Math.max(...columns.map((column) => column.land));
  const start = performance.now();
  let frame = 0;
  const tick = () => {
    frame = 0;
    const t = performance.now() - start;
    columns.forEach((column) => writeColumn(column, column.at(t)));
    if (t < end) frame = requestAnimationFrame(tick);
  };
  // The first frame is written at once: the word it is leaving is on the
  // board from the landing, not a frame after it.
  tick();
  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    columns.forEach((column) => writeColumn(column, null));
  };
}

/**
 * Rolls every FlapWord under `root` into place from the words it is leaving
 * (`from[role]`), a switch's ticket (src/lib/routeShield.ts, ROLL): takes a
 * primed board over — the name being left, set whole, slides up out of the
 * name's own box while the new name's cells rise into it from below (the box
 * clipped; the cells are inline-blocks, moved by their name's own height in
 * em, nothing measured); a state that changes fades in; the stop number
 * counts through the stops between, landing with the name. Down within
 * `timing.budget` (the transit). Returns a stop that puts every word back.
 */
export function runRoll(root: HTMLElement, from: Partial<Record<string, string>> = {}, timing: { budget?: number } = {}): () => void {
  const ms = rollMs(timing.budget);
  const anims: Animation[] = [];
  const clipped: HTMLElement[] = [];
  const overlays: HTMLElement[] = [];
  const counters: Array<{ el: HTMLElement; final: string; at: (t: number) => string; shown: string | null }> = [];
  let frame = 0;
  root.querySelectorAll<HTMLElement>('[data-flap]').forEach((word) => {
    const role = word.dataset.flap ?? '';
    const chars = Array.from(word.querySelectorAll<HTMLElement>('[data-flap-c]'));
    const final = chars.map((el) => el.dataset.flapC ?? '').join('');
    const leaving = (from[role] ?? '').replace(/\s+/g, '').toUpperCase();
    const overlay = role === 'name' ? word.querySelector<HTMLElement>(':scope > [data-flap-was]') : null;
    // The primed board lets go: every cell shows its own glyph from here.
    chars.forEach((el) => el.removeAttribute('data-show'));
    if (overlay) overlay.textContent = '';
    if (!leaving || leaving === final) return;
    if (role === 'name') {
      const box = word.parentElement;
      if (overlay) {
        overlay.textContent = (from.name ?? '').trim();
        overlays.push(overlay);
        anims.push(overlay.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-110%)' }], { duration: ms, easing: CSS_EASE.turn, fill: 'forwards' }));
      }
      if (box) {
        box.style.clipPath = 'inset(0 -0.3em)';
        clipped.push(box);
      }
      // From below the box as it stands at the start (the name being left
      // may take more lines than the new one: NEW YORK → MIAMI), by the
      // lines of the name's words, spaced (NEW YORK takes two).
      const words = Array.from(word.querySelectorAll<HTMLElement>(':scope > .flap-w'))
        .map((w) => Array.from(w.querySelectorAll<HTMLElement>('[data-flap-c]')).map((el) => el.dataset.flapC ?? '').join(''));
      const lines = Math.max(signLines(words.join(' ')), signLines((from.name ?? '').trim() || 'X'));
      const drop = `translateY(${(lines * TICKET_NAME_LINE + 0.12).toFixed(2)}em)`;
      chars.forEach((el) => anims.push(el.animate([{ transform: drop }, { transform: 'translateY(0)' }], { duration: ms, easing: CSS_EASE.turn, fill: 'backwards' })));
      return;
    }
    if (role === 'code') {
      chars.forEach((el) => anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: CSS_EASE.travel, fill: 'backwards' })));
      return;
    }
    if (role === 'num') {
      chars.forEach((el, index) => counters.push({
        el,
        final: el.dataset.flapC ?? '',
        // Down as the name reads (EASE.turn has made most of its way by
        // half its time), not after it.
        at: (t) => flapNumber(final, leaving, t, 0, ms / 2)[index] ?? (el.dataset.flapC ?? ''),
        shown: null,
      }));
    }
  });
  const write = (counter: (typeof counters)[number], glyph: string | null) => {
    const show = glyph == null || glyph === counter.final ? null : glyph;
    if (counter.shown === show) return;
    counter.shown = show;
    if (show == null) counter.el.removeAttribute('data-show');
    else counter.el.setAttribute('data-show', show);
  };
  const start = performance.now();
  const tick = () => {
    frame = 0;
    const t = performance.now() - start;
    counters.forEach((counter) => write(counter, counter.at(t)));
    if (t < ms) frame = requestAnimationFrame(tick);
  };
  if (counters.length) tick();
  const done = window.setTimeout(() => stop(), ms + 40);
  function stop() {
    window.clearTimeout(done);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    anims.forEach((anim) => anim.cancel());
    anims.length = 0;
    clipped.forEach((box) => box.style.removeProperty('clip-path'));
    overlays.forEach((overlay) => { overlay.textContent = ''; });
    counters.forEach((counter) => write(counter, null));
  }
  return stop;
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
