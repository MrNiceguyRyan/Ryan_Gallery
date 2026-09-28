import { SHIELD_BAND_RULE_Y, SHIELD_PATH, flapGlyph, flapPlan, type FlapStep } from '../../lib/routeShield';

/**
 * A word that can turn like a departure board's flap (src/lib/routeShield.ts,
 * FLAP). Each character is its own box, holding the final glyph's width, so
 * the flips never move the line: while a character turns, its own glyph is
 * inked out and the flip is printed over it (`data-show`, global.css
 * "The split-flap"). `role` names the word for the flap runner, which starts
 * each word from the one it is leaving ('name', 'code', 'num').
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
    </span>
  );
}

/**
 * Turns every FlapWord under `root` into place: each from the word it is
 * leaving (`from[role]`, the previous stop's), on one rAF loop that runs only
 * for the flap and writes a character only when it changes. Returns a stop
 * that puts every word straight back.
 */
export function runFlap(root: HTMLElement, from: Partial<Record<string, string>> = {}): () => void {
  const columns: Array<{ el: HTMLElement; final: string; from: string; step: FlapStep; seed: number; shown: string | null }> = [];
  root.querySelectorAll<HTMLElement>('[data-flap]').forEach((word, wordIndex) => {
    const role = word.dataset.flap ?? '';
    const chars = Array.from(word.querySelectorAll<HTMLElement>('[data-flap-c]'));
    const plan = flapPlan(chars.length);
    const leaving = Array.from((from[role] ?? '').replace(/\s+/g, '').toUpperCase());
    chars.forEach((el, index) => {
      columns.push({
        el,
        final: el.dataset.flapC ?? '',
        from: leaving[index] ?? '',
        step: plan[index],
        seed: index + wordIndex * 5,
        shown: null,
      });
    });
  });
  if (!columns.length) return () => {};
  const end = Math.max(...columns.map((column) => column.step.land));
  const start = performance.now();
  let frame = 0;
  const write = (column: (typeof columns)[number], show: string | null) => {
    if (column.shown === show) return;
    column.shown = show;
    if (show == null) column.el.removeAttribute('data-show');
    else column.el.setAttribute('data-show', show);
  };
  const tick = () => {
    frame = 0;
    const t = performance.now() - start;
    columns.forEach((column) => {
      const glyph = flapGlyph(column.final, column.from, column.step, t, column.seed);
      write(column, glyph === column.final ? null : glyph);
    });
    if (t < end) frame = requestAnimationFrame(tick);
  };
  // The first frame is written at once: the word it is leaving is on the
  // board from the landing, not a frame after it.
  tick();
  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    columns.forEach((column) => write(column, null));
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
