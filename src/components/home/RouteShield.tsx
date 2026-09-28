import {
  FLAP,
  SHIELD_BAND_RULE_Y,
  SHIELD_PATH,
  codePlan,
  flapGlyph,
  flapNumber,
  flapPlan,
  nameStep,
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
function flapColumns(root: HTMLElement, from: Partial<Record<string, string>>): FlapColumn[] {
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
  let nameEnd: number = FLAP.delay;
  words.forEach((word) => {
    if (word.role !== 'name') return;
    const plan = flapPlan(word.chars.length);
    if (plan.length) nameEnd = Math.max(nameEnd, plan[plan.length - 1].land);
  });
  const columns: FlapColumn[] = [];
  words.forEach((word, wordIndex) => {
    const finalWord = word.chars.map((el) => el.dataset.flapC ?? '').join('');
    const leaving = Array.from(word.leaving);
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
        (t) => flapNumber(finalWord, word.leaving, t, FLAP.delay, nameEnd)[index] ?? (el.dataset.flapC ?? ''),
        nameEnd,
      ));
      return;
    }
    if (word.role === 'code') {
      // The same state stays down; with no stop left behind there is
      // nothing for it to turn from.
      const still = !word.leaving || word.leaving === finalWord;
      const plan = codePlan(word.chars.length);
      word.chars.forEach((el, index) => {
        const final = el.dataset.flapC ?? '';
        column(el, still ? () => final : (t) => flapGlyph(final, leaving[index] ?? '', plan[index], t, index + wordIndex * 5), still ? 0 : plan[index].land);
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
        at: (t) => (t < FLAP.delay ? word.text : ''),
        land: FLAP.delay,
        shown: was.textContent || null,
        was: true,
      });
    }
    const plan = flapPlan(word.chars.length);
    word.chars.forEach((el, index) => {
      const final = el.dataset.flapC ?? '';
      const step = nameStep(plan[index]);
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
 * stands. Returns a stop that puts every word straight back.
 */
export function runFlap(root: HTMLElement, from: Partial<Record<string, string>> = {}): () => void {
  const columns = flapColumns(root, from);
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

/** The shield's plate: the outline in bone, the 1926 border ring inside it
 *  and the rule closing the state's band, all in dark ink. */
function ShieldPlate() {
  return (
    <>
      <path d={SHIELD_PATH} className="route-shield__paper" />
      <path
        d={SHIELD_PATH}
        className="route-shield__border"
        transform="translate(50 50) scale(0.84) translate(-50 -50)"
      />
      <line x1="12.5" x2="87.5" y1={SHIELD_BAND_RULE_Y} y2={SHIELD_BAND_RULE_Y} className="route-shield__rule" />
    </>
  );
}

/**
 * The route shield as printed on paper (the ticket's head, the phone stub):
 * the plate is drawn, the state and the stop number are type over it, so
 * they can turn on a landing (`flap`) and be read like any other print.
 * `numberClassName` lets the ticket name its ordinal for the story's kept
 * stub (.archive-ticket-stub__no).
 */
export function RouteShield({ code, number, className = '', numberClassName = '', flap = false }: {
  code: string;
  number: string;
  className?: string;
  numberClassName?: string;
  flap?: boolean;
}) {
  return (
    <span className={`route-shield ${className}`}>
      <svg className="route-shield__plate" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <ShieldPlate />
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
 *  holds its place exactly at 30px, where HTML type rounds). */
export function MapShield({ code, number }: { code: string; number: string }) {
  return (
    <svg className="route-sign__plate" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <ShieldPlate />
      {code && (
        <text x="50" y="30.2" className="route-sign__code" textAnchor="middle">{code}</text>
      )}
      <text x="50" y="79.5" className="route-sign__num" textAnchor="middle">{number}</text>
    </svg>
  );
}
