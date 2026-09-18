import { useEffect, useRef, useState } from 'react';
import { motion, type MotionValue } from 'framer-motion';

const FLAP_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ';

function flapText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '');
}

/**
 * A split-flap title, after 11 mois sans toi(t)'s stop sign: on a change the
 * board drops to the old name's first three tiles, then every tile spins
 * through random letters (22 ms a flap, 6 + its index flaps) and lands, the
 * tiles starting 35 ms apart left to right. Each letter sits in its own
 * fixed-width tile, so the board never jitters while it spins.
 */
export function SplitFlapText({ value, reducedMotion }: { value: string; reducedMotion: boolean }) {
  const target = flapText(value);
  const [tiles, setTiles] = useState<string[]>(() => Array.from(target));
  const shownRef = useRef(target);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (target === shownRef.current) return;
    const previous = shownRef.current;
    shownRef.current = target;
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    if (reducedMotion) {
      setTiles(Array.from(target));
      return;
    }
    const kept = previous.slice(0, Math.min(3, previous.length)).split('');
    setTiles(kept);
    const later = (delay: number, run: () => void) => {
      timersRef.current.push(window.setTimeout(run, delay));
    };
    later(160, () => {
      const letters = Array.from(target);
      setTiles(() => {
        const next = [...kept];
        while (next.length < letters.length) next.push(' ');
        return next.slice(0, letters.length);
      });
      letters.forEach((letter, index) => {
        const start = 35 * index;
        const flaps = 6 + index;
        for (let flap = 0; flap < flaps; flap += 1) {
          later(start + 22 * flap, () => setTiles((current) => {
            const next = [...current];
            next[index] = FLAP_ALPHABET[Math.floor(Math.random() * FLAP_ALPHABET.length)];
            return next;
          }));
        }
        later(start + 22 * flaps, () => setTiles((current) => {
          const next = [...current];
          next[index] = letter;
          return next;
        }));
      });
    });
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };
  }, [reducedMotion, target]);

  // A run cancelled because the chapter changed again mid-spin restarts from
  // the new value in the effect above; this only clears timers on unmount.
  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <span className="flap-board" aria-hidden="true">
      {tiles.map((letter, index) => (
        <span key={index} className={`flap-tile ${letter === ' ' ? 'is-blank' : ''}`}>
          <span className="flap-char">{letter === ' ' ? ' ' : letter}</span>
        </span>
      ))}
    </span>
  );
}

interface SignStop {
  name: string;
  year?: number | string;
  frameCount: number;
  region?: string;
}

/**
 * The current place as a small 3D standee planted at the route head: a
 * paper-framed split-flap board on a post, leaning back a few degrees, with a
 * contact shadow on the map. It stays at the atlas focal point while the map
 * travels beneath it; between chapters it rises slightly and turns toward the
 * direction of travel, then the name flaps over to the next place.
 */
export function AtlasSignboard({ stop, number, total, visibility, lift, sway, reducedMotion }: {
  stop: SignStop;
  number: number;
  total: number;
  visibility: MotionValue<number>;
  lift: MotionValue<number>;
  sway: MotionValue<number>;
  reducedMotion: boolean;
}) {
  const index = String(number).padStart(2, '0');
  return (
    <motion.div aria-hidden="true" className="atlas-sign" style={{ opacity: visibility }}>
      <motion.div className="atlas-sign__body" style={{ y: lift, rotateY: sway }}>
        <div className="atlas-sign__tabs">
          <span className="atlas-sign__tab is-current">Stop {index}</span>
          <span className="atlas-sign__tab">{index} / {String(total).padStart(2, '0')}</span>
        </div>
        <div className="atlas-sign__board">
          <div className="atlas-sign__screen">
            <SplitFlapText value={stop.name} reducedMotion={reducedMotion} />
          </div>
          <div className="atlas-sign__meta">
            {stop.year != null && stop.year !== '' && (
              <>
                <span>Year</span>
                <b>{stop.year}</b>
              </>
            )}
            <span>Frames</span>
            <b>{String(stop.frameCount).padStart(2, '0')}</b>
            {stop.region && (
              <>
                <span>State</span>
                <b>{stop.region}</b>
              </>
            )}
          </div>
        </div>
      </motion.div>
      <span className="atlas-sign__post" />
      <span className="atlas-sign__shadow" />
    </motion.div>
  );
}

/**
 * Every other place carries a small standing pin — a STOP badge on a post,
 * upright to the camera like the reference's markers. The current place hides
 * its pin: the signboard stands there instead.
 */
export function StopStandee({ number, current, visibility }: {
  number: number;
  current: boolean;
  visibility: MotionValue<number>;
}) {
  return (
    <motion.span
      aria-hidden="true"
      className={`stop-standee ${current ? 'is-current' : ''}`}
      style={{ opacity: visibility }}
    >
      <span className="stop-standee__badge">
        <span className="stop-standee__kicker">Stop</span>
        <span className="stop-standee__number">{String(number).padStart(2, '0')}</span>
      </span>
      <span className="stop-standee__post" />
    </motion.span>
  );
}
