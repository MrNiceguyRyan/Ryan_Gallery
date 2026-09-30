// ── The proof's plates, from the first paint ──
// The opening film opens on a printer's proof (act 0 in src/lib/openingFilm.ts):
// the lights go down, the lime plate prints the anchor's block, the ink plate
// prints ARCHIVE into it, the page is printed round it. None of it may wait
// for the island: on a cold load it hydrates one and a half to two seconds
// after the first paint (its chunks are most of a megabyte), and an empty,
// still sheet for that long reads as a page that has not loaded. The
// stylesheet brings the lights down; this prints the plates, from the page's
// <head>, before any of the island's code has come:
//
//   - It watches the document stream in for the proof's vignette (the
//     lights are its ::before's CSS animation) and, once the page's
//     stylesheets are in, reads the proof's first frame from the lights'
//     start time: the origin of the proof's sixth grid, and the island's.
//   - It asks for the first word's face at once (PROOF_FACE: its fetch
//     starts with the page's stylesheets, not once the proof is laid out),
//     waits for it (at most PROOF_FACE_WAIT_MS from the proof's first frame:
//     never ARCHIVE in a stand-in face while it can still come), then
//     prints the lime plate on the first sixth of the grid it can make,
//     and the ink plate (the word) a third of a second after it: WAAPI on
//     opacity from the proof's first frame, held unprinted (the
//     stylesheet's own values) to a hair before its beat (GRID_HAIR_MS).
//   - Never while the page is hidden. A tab opened in the background draws
//     no frame: its timeline stands still, its lights play unseen, and a
//     grid counted from them is spent before the tab is shown (the reader
//     would land on the finished title card, the page a moment later). It
//     waits to be shown; on the page's first showing the lights go down
//     again (restarted in the visibilitychange event, before that first
//     frame is drawn), and the grid is counted from there.
//   - It takes a tap on the Skip pill before the island is up (the pill is
//     drawn from 0.12 s; the island's own handler exists only once it has
//     hydrated): html[data-skip-pending] (the pill held pressed), and no
//     plate is laid after it (one already laid prints on its beat); the
//     island reads it as it mounts and takes the film to its end title.
//
// window.__proofPlates is its record for the island: the origin, the lime's
// beat, its animations. The island prints the page on the first sixth it can
// make, never sooner than a third of a second after the word (pageStart),
// keeps these animations as the plates (it never lays a second animation on
// the same element: two opacity animations on one element take both off the
// compositor, and under load the plates would print late, off the cuts'
// grid), and stops the tap listener. On an
// in-site arrival (no head script: the document was swapped in whole) the
// island starts the same function itself, without the tap listener.
//
// It never asks for an animation frame: before the page's stylesheets are in,
// one draws a frame of the bare page (a blank frame, the one thing a first
// paint must never be). It never throws: without the animations it reads,
// it records nothing and the island prints the plates on its own clock.
//
// proofPlates is self-contained (no import, no module binding at run time):
// the head script is built from its very source. scripts/proof-plates.test.mjs
// runs that script in a sandbox with the browser's pieces mocked.

import { CUT_MS, GRID_HAIR_MS, PRELUDE, PROOF_FACE, PROOF_FACE_WAIT_MS, proofInk } from './openingFilm';

export interface PlatesConfig {
  /** The first word's face, and the characters it sets. */
  face: string;
  sample: string;
  /** How long the plates wait for it at most (ms). */
  wait: number;
  /** The grid: a sixth of a second; the lime's first beat, in sixths from
   *  the proof's first frame; the word's, in sixths after the lime. */
  cut: number;
  lime: number;
  word: number;
  /** A plate is laid at least this long before its beat (its keyframes are
   *  in before it: three frames). */
  lead: number;
  hair: number;
  /** The lime plate before its beat (drawn, unseen: the stylesheet's own
   *  warm opacity), and its ink from its beat: [ms after it, opacity]. */
  unprinted: number;
  ink: [number, number][];
  /** The lights' CSS animation and the element that carries it (a class);
   *  what the plates print on; the Skip pill. */
  lights: string;
  vignette: string;
  block: string;
  word0: string;
  skip: string;
}

export interface ProofPlates {
  /** The proof's first frame on document.timeline (the lights' start). */
  origin: number | null;
  /** The lime plate's beat on document.timeline, once it is laid. */
  lime: number | null;
  anims: Animation[];
  /** The lime's beat once laid, or null: nothing will be printed (a skip,
   *  or nothing to count from). */
  decided: Promise<number | null>;
  /** Never print (a skip). */
  hold: () => void;
  /** Stop taking taps (the island is up). */
  off: () => void;
}

declare global {
  interface Window {
    /** The head script's record (the island takes it over, once). */
    __proofPlates?: ProofPlates;
  }
}

export const PLATES: PlatesConfig = {
  face: PROOF_FACE,
  sample: 'ARCHIVE',
  wait: PROOF_FACE_WAIT_MS,
  cut: CUT_MS,
  lime: PRELUDE.beats.paint - PRELUDE.beats.lime,
  word: PRELUDE.beats.lime - PRELUDE.beats.word,
  lead: 50,
  hair: GRID_HAIR_MS,
  unprinted: PRELUDE.unprinted,
  ink: proofInk().map(({ at, opacity }) => [at, opacity] as [number, number]),
  lights: 'of-proof-lights',
  vignette: 'of-frame__vignette',
  block: '.of-key[data-key="0"] [data-block]',
  word0: '.of-key[data-key="0"] [data-word]',
  skip: '.of-skip',
};

/** Start the proof's plates (see the head of this file). `taps`: take a tap
 *  on the Skip pill until the island is up (the head script only). */
export function proofPlates(cfg: PlatesConfig, taps: boolean): ProofPlates {
  var doc = document;
  var root = doc.documentElement;
  var done = false;
  var begun = false;
  // Whether the page has been shown yet. A tab opened in the background has
  // not been: its timeline stands still and its lights play unseen, and a
  // grid counted from them would be spent before anyone could see it.
  var seen = doc.visibilityState !== 'hidden';
  var waiting: (() => void)[] = [];
  var settle: (value: number | null) => void = function () {};
  var noop = function () {};
  var plates: ProofPlates = {
    origin: null,
    lime: null,
    anims: [],
    decided: new Promise<number | null>(function (resolve) {
      settle = resolve;
    }),
    hold: function () {
      end(null);
    },
    off: noop,
  };
  function end(value: number | null) {
    if (done) return;
    done = true;
    doc.removeEventListener('visibilitychange', shownNow);
    settle(value);
  }
  // The proof's lights: the stylesheet's animation on the vignette.
  function lightsOf(vignette: Element | undefined): CSSAnimation | null {
    if (!vignette || typeof vignette.getAnimations !== 'function') return null;
    var all = vignette.getAnimations({ subtree: true });
    for (var i = 0; i < all.length; i += 1) {
      if ((all[i] as CSSAnimation).animationName === cfg.lights) return all[i] as CSSAnimation;
    }
    return null;
  }
  // Their start on the timeline, once they have one (read again after a
  // restart, which replaces their ready promise).
  function started(lights: CSSAnimation, tries: number): Promise<number | null> {
    return lights.ready.then(noop, noop).then(function (): number | null | Promise<number | null> {
      if (lights.startTime == null && lights.playState !== 'idle' && tries > 0) return started(lights, tries - 1);
      return lights.startTime == null ? null : Number(lights.startTime);
    });
  }
  // The page shown. For the first time: the lights go down again from here,
  // so the whole count-in plays from the first frame the reader sees. This
  // is the event itself (before that frame is drawn), and it comes before
  // anything that waits for it (below).
  function shownNow() {
    if (doc.visibilityState === 'hidden') return;
    if (!seen) {
      seen = true;
      var lights = lightsOf(doc.getElementsByClassName(cfg.vignette)[0]);
      if (lights) {
        try {
          lights.cancel();
          lights.play();
        } catch (e) {
          // The lights as they are (the grid counted from them).
        }
      }
    }
    var ready = waiting;
    waiting = [];
    for (var i = 0; i < ready.length; i += 1) ready[i]();
  }
  // Nothing is counted, and no plate laid, while the page is hidden.
  function whenShown() {
    return new Promise<void>(function (resolve) {
      if (doc.visibilityState !== 'hidden') resolve();
      else waiting.push(resolve);
    });
  }
  // The earliest a plate laid now takes effect: the timeline's time stands
  // still in a tab that draws no frame, so the clock's own reading as well.
  function now() {
    var t = Number(doc.timeline.currentTime) || 0;
    return typeof performance !== 'undefined' && performance.now ? Math.max(t, performance.now()) : t;
  }
  // A plate: one animation from the proof's first frame, held at its
  // unprinted value to a hair before its beat, filled both ways (laid with
  // a start still to come, or filled one way only, a composited animation
  // was drawn once at its first keyframe — a lime flash — before its start).
  function lay(sel: string, origin: number, beat: number, held: number, ink: [number, number][]) {
    var el = doc.querySelector(sel);
    if (!el || typeof el.animate !== 'function') return;
    var span = beat - origin + ink[ink.length - 1][0];
    var frames: Keyframe[] = [
      { offset: 0, opacity: held },
      { offset: (beat - origin) / span, opacity: held },
    ];
    for (var i = 0; i < ink.length; i += 1) frames.push({ offset: (beat - origin + ink[i][0]) / span, opacity: ink[i][1] });
    var anim = el.animate(frames, { duration: span, fill: 'both', easing: 'linear' });
    anim.startTime = origin - cfg.hair;
    plates.anims.push(anim);
  }
  function print(origin: number, at: number) {
    lay(cfg.block, origin, at, cfg.unprinted, cfg.ink);
    lay(cfg.word0, origin, at + cfg.word * cfg.cut, 0, [
      [0, 1],
      [1, 1],
    ]);
  }
  // Every stylesheet the page has asked for, in (the lights exist only then).
  function loaded(link: HTMLLinkElement) {
    return new Promise(function (resolve) {
      link.addEventListener('load', resolve);
      link.addEventListener('error', resolve);
    });
  }
  function sheetsIn() {
    var waits: Promise<unknown>[] = [];
    var links = doc.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i += 1) {
      if (!(links[i] as HTMLLinkElement).sheet) waits.push(loaded(links[i] as HTMLLinkElement));
    }
    return Promise.all(waits);
  }
  function begin(vignette: Element) {
    if (begun) return;
    begun = true;
    sheetsIn()
      .then(function () {
        if (done) return;
        var lights = lightsOf(vignette);
        if (!lights || !doc.timeline) {
          end(null);
          return;
        }
        var shown: CSSAnimation = lights;
        var cap = new Promise(function (resolve) {
          setTimeout(resolve, cfg.wait);
        });
        return Promise.all([started(shown, 2), Promise.race([face, cap])])
          .then(whenShown)
          .then(function () {
            // Their start as the reader saw it (restarted if never shown).
            return started(shown, 2);
          })
          .then(function (start) {
            if (done) return;
            if (start == null) {
              end(null);
              return;
            }
            var origin = start;
            var ready = now() + cfg.lead;
            var first = origin + cfg.lime * cfg.cut;
            var at = first + Math.max(0, Math.ceil((ready - first) / cfg.cut - 1e-6)) * cfg.cut;
            plates.origin = origin;
            print(origin, at);
            plates.lime = at;
            end(at);
          });
      })
      .catch(function () {
        end(null);
      });
  }
  // The face is asked for at once: from the head, its fetch starts as the
  // page's own stylesheets do (the faces' rules are in before this runs),
  // not once the proof has been laid out.
  var face: Promise<unknown> = Promise.resolve();
  try {
    if (doc.fonts && doc.fonts.load) face = doc.fonts.load(cfg.face, cfg.sample).catch(noop);
  } catch (e) {
    face = Promise.resolve();
  }
  try {
    doc.addEventListener('visibilitychange', shownNow);
    if (taps) {
      var onTap = function (event: Event) {
        // Once the island is up (data-opening="run") the tap is its own.
        if (root.getAttribute('data-opening') !== '') return;
        var target = event.target as Element | null;
        if (!target || typeof target.closest !== 'function' || !target.closest(cfg.skip)) return;
        root.setAttribute('data-skip-pending', '');
        end(null);
      };
      doc.addEventListener('click', onTap, true);
      plates.off = function () {
        doc.removeEventListener('click', onTap, true);
      };
    }
    var found = doc.getElementsByClassName(cfg.vignette);
    if (found[0]) begin(found[0]);
    else if (typeof MutationObserver === 'function') {
      var watch = new MutationObserver(function () {
        if (!found[0]) return;
        watch.disconnect();
        begin(found[0]);
      });
      watch.observe(doc, { childList: true, subtree: true });
      doc.addEventListener('DOMContentLoaded', function () {
        watch.disconnect();
        if (found[0]) begin(found[0]);
        else end(null);
      });
    } else end(null);
  } catch (e) {
    end(null);
  }
  return plates;
}

/** index.astro's <head> script, right after the reel's (html[data-opening]
 *  decided): on a full load where the film plays, the plates and the tap.
 *  Not for ?filmT (the verification hook lays the proof on its own clock). */
export function proofHeadScript() {
  return (
    '(function(){try{' +
    'var root=document.documentElement;' +
    "if(document.readyState!=='loading'||!root.hasAttribute('data-opening')||/[?&]filmT=/.test(location.search))return;" +
    `var proofPlates=${proofPlates.toString()};` +
    `window.__proofPlates=proofPlates(${JSON.stringify(PLATES)},true);` +
    '}catch(e){}})();'
  );
}
