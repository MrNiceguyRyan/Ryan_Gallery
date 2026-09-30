import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import BoardingPass, { type PassHandle, type StubHandover } from './BoardingPass';
import { assemblePass, launchStubCourier } from './entranceMotion';
import {
  ARRIVAL_EASE,
  ARRIVAL_SECONDS,
  COVER_REVEAL,
  GLIDE_AFTER_FREE_MS,
  assemblyAt,
  coverBlocks,
  coverWords,
  passFields,
  type CoverBlock,
  type CoverFacts,
  type PassChapter,
} from '../../lib/boardingPass';
import { requestExplore } from '../../lib/explorer';
import { markPassTorn } from '../../lib/reelVisit';
import { stockPaper } from '../../lib/ticketStock';
import { bezierFn } from '../../lib/motion';
import { T, useT } from '../../i18n/react';

// ── The entrance: a cover of words, and the pass that is the way in ──
// Owner, 2026-09-28: 封面画面结束后，就如同这个 11moissanstoit 封面一样，一些字体
// 组成一段文字，展示大致的一个内容，最后的画面需要出现一些元素，和这些文字一样飞出来
// 变成这个机票，两者都在界面中 … 机票只能靠点开，撕开后和用户一起往下滑动，直接进入
// 地球相册 … (and, earlier: no globe on this screen).
//
// One screen. After the opening film (its words land in their own spans
// here: src/lib/openingFilm.ts, landing A), the cover sets itself block by
// block — his name and what the archive is, its numbers, its regions and
// years, what the camera kept, and the first stop — the way the reference's
// cover sets (src/lib/boardingPass.ts, COVER_REVEAL). At the end of it the
// boarding pass assembles beside the words, and three facts fly out of the
// words onto it (entranceMotion.ts, assemblePass). Then it waits: the pass
// is the start button, and only its stub tears it (BoardingPass). Torn, the
// page goes on by itself: a beat, then one glide down onto the globe
// (rising, already facing stop 01) — the words and the pass's main part
// going up and away — while the stub stays with the reader, and flies on to
// become stop 01's cover's stub (entranceMotion.ts, the courier; the
// hand-off contract is in src/lib/boardingPass.ts). As the glide sets off,
// the entrance asks for the explorer (`requestExplore`, with `stubHandoff`
// and the glide's `arrivingMs`: the camera comes down under the glide), and
// once it has landed HomePage takes the entrance off the page.
//
// Owner, 2026-09-29 (机票可以稍微发光一下，提示用户读者，做到可以手动挪来挪去):
// the pass glows a little once it has assembled (entrance.css), and it can
// be carried anywhere on the screen with its hint (`carry`: the stage moves;
// BoardingPass, PASS_DRAG). Tearing is still the stub's click alone; torn
// where it was put, the stub's arc sets off from there.
//
// A second view (the film skipped: src/lib/reelVisit.ts) before the pass has
// been torn, and Back to the start, open on the cover already composed and
// the pass ready: nothing replays. Once it has been torn in the session, a
// second view opens on the globe instead (the way back: this cover is not
// drawn, HomePage takes it off). Reduced motion: values, not structure —
// the words are simply there, the pass too, the stub fades where it is and
// the page cuts.
//
// Nothing here reads a rect per frame: the explorer's top once per glide.

const arrivalCurve = bezierFn(ARRIVAL_EASE);

type Compose = 'wait' | 'play' | 'done';

interface Props {
  /** The archive's own facts for the cover (HomePage). */
  facts: CoverFacts;
  /** The first chapter of the route (the pass's destination and date, the
   *  cover's first stop, the stub's card). */
  first: PassChapter | null;
  /** Where the page goes on to once the pass is torn (document px): the
   *  explorer's top, the globe. */
  nextTop: () => number | null;
  /** The globe may come in: HomePage lets go of the atlas's held reveal.
   *  `glide`: the page glides it into view; false when it cuts. */
  onArrive: (glide: boolean) => void;
  /** The glide has landed on the explorer (HomePage takes the entrance off
   *  the page: the entry has been under way since the glide set off). */
  onGlided?: () => void;
  /** The opening film still lies over the page. */
  covered: boolean;
}

function Words({ block }: { block: CoverBlock }) {
  const words = coverWords(block.pieces);
  return (
    <>
      {words.map((word, index) => {
        const key = `${index}-${word.map((part) => part.text).join('')}`;
        // No space before a word set close (Chinese: src/lib/boardingPass.ts
        // coverWords).
        const lead = index > 0 && !word[0]?.tight ? ' ' : null;
        if (word[0]?.br) return <br key={key} className="ec-br" />;
        const special = word.find((part) => part.land || part.pass);
        if (!special) {
          return (
            <span key={key}>
              {lead}
              <span className="ec-w">{word.map((part) => part.text).join('')}</span>
            </span>
          );
        }
        // A word the film lands or the pass takes: it never rises (it is
        // home, or it is about to leave); its punctuation fades in with the
        // block.
        return (
          <span key={key}>
            {lead}
            <span className="ec-f">
              {word.map((part, at) =>
                part.land ? (
                  <span key={at} className="ec-found" data-open-land={part.land} data-pass-from={part.land === 'you' ? 'you' : undefined}>
                    {part.text}
                  </span>
                ) : part.pass ? (
                  <span key={at} className="ec-found" data-pass-from={part.pass}>{part.text}</span>
                ) : (
                  <span key={at} className="ec-p">{part.text}</span>
                ),
              )}
            </span>
          </span>
        );
      })}
    </>
  );
}

export default function EntranceIntro({ facts, first, nextTop, onArrive, onGlided, covered }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pass = useRef<PassHandle>(null);
  // Undefined on the server and on the first client render (the same
  // markup): the cover is composed unless the film is still over it
  // (entrance.css reads html[data-reel] for that first paint).
  const [compose, setCompose] = useState<Compose | undefined>(undefined);
  const [torn, setTorn] = useState(false);
  const [lifted, setLifted] = useState(false);
  const fields = useMemo(() => passFields(first), [first]);
  const blocks = useMemo(() => coverBlocks(facts, first), [facts, first]);
  // The same cover in Chinese: the same blocks in the same order (the
  // reveal's --b is shared), every landing word in its own span. Both are in
  // the markup; html[data-lang] shows one (src/i18n/runtime.ts).
  const blocksZh = useMemo(() => coverBlocks(facts, first, 'zh'), [facts, first]);
  const t = useT();
  const callbacks = useRef({ nextTop, onArrive, onGlided });
  callbacks.current = { nextTop, onArrive, onGlided };
  const flow = useRef({ released: false, gliding: false, asked: false });
  // The glide (set by the page's effect below), started once the stub is free.
  const glideRef = useRef<() => void>(() => {});

  // ── The cover sets itself (a first view), or is simply there ──
  useEffect(() => {
    const root = document.documentElement;
    const section = sectionRef.current;
    const text = textRef.current;
    const stage = stageRef.current;
    if (!section || !text || !stage) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer = 0;
    let cancelAssembly: (() => void) | null = null;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      setCompose('play');
      // The pass assembles as the last block settles.
      timer = window.setTimeout(() => {
        cancelAssembly = assemblePass(stage, text, reduce.matches, () => setCompose('done'));
      }, reduce.matches ? 0 : assemblyAt(blocks.length));
    };
    const reel = () => root.dataset.reel ?? '';
    const waiting = () => reel() === 'reel' || reel() === 'flight';
    // The words the film carries home (its slate has them: landing A flies
    // every word it finds on both sides whose place is on the first screen,
    // src/components/home/OpeningFilm.tsx landA — read once, as it does) are
    // home once it lands; any other word of ours (one the film does not
    // carry, one below a short screen, the first stop) sets itself with its
    // block, like the rest.
    let flownMarked = false;
    const markFlown = () => {
      if (flownMarked) return;
      flownMarked = true;
      const vh = window.innerHeight;
      section.querySelectorAll<HTMLElement>('[data-open-land]').forEach((el) => {
        const word = el.dataset.openLand;
        if (!word || !document.querySelector(`[data-fly="${word}"]`) || !el.getClientRects().length) return;
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        el.setAttribute('data-flown', '');
      });
    };
    let observer: MutationObserver | null = null;
    if (waiting()) {
      setCompose('wait');
      if (reel() === 'flight') markFlown();
      observer = new MutationObserver(() => {
        if (reel() === 'flight') markFlown();
        if (!waiting()) {
          observer?.disconnect();
          observer = null;
          start();
        }
      });
      observer.observe(root, { attributes: true, attributeFilter: ['data-reel'] });
    } else if (reel() === 'landed') {
      // Hydrated while the film's words were landing: set the rest now.
      markFlown();
      start();
    } else {
      // A second view, Back to the start, reduced motion's crossfade done:
      // composed.
      setCompose('done');
    }
    return () => {
      observer?.disconnect();
      window.clearTimeout(timer);
      cancelAssembly?.();
    };
  }, [blocks.length]);

  // ── The page round it: one screen, the explorer below it ──
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const state = flow.current;
    let tween = 0;
    let disposed = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    // `arrivingMs`: the glide still bringing the page down (the entry starts
    // under it: the camera comes down while the globe rises).
    const ask = (stubHandoff: boolean, arrivingMs = 0) => {
      if (state.asked) return;
      state.asked = true;
      // Keyboard focus left on the stub's button (or dropped to the body as
      // the torn stub's button went) goes on with the page.
      const active = document.activeElement;
      if (!active || active === document.body || (active instanceof HTMLElement && section.contains(active))) {
        document.getElementById('main-content')?.focus({ preventScroll: true });
      }
      requestExplore({ from: 'boarding-pass', stubHandoff, ...(arrivingMs > 0 ? { arrivingMs } : null) });
    };
    const release = (glide: boolean) => {
      if (state.released) return;
      state.released = true;
      callbacks.current.onArrive(glide);
    };

    // The glide, a beat after the stub is free: down onto the globe. The
    // explorer is asked for as it sets off (the entry rides under it: the
    // camera is already coming down as the globe rises), and told when it
    // has landed (HomePage then takes the entrance off the page).
    glideRef.current = () => {
      const next = callbacks.current.nextTop();
      const from = window.scrollY;
      if (next == null || reduce.matches || from >= next - 2) {
        release(false);
        ask(true);
        return;
      }
      release(true);
      state.gliding = true;
      const start = performance.now();
      const duration = ARRIVAL_SECONDS * 1000;
      ask(true, duration);
      const step = (now: number) => {
        tween = 0;
        if (disposed) return;
        const k = Math.min(1, (now - start) / duration);
        window.scrollTo({ top: from + (next - from) * arrivalCurve(k), behavior: 'instant' as ScrollBehavior });
        if (k < 1) {
          tween = requestAnimationFrame(step);
          return;
        }
        state.gliding = false;
        callbacks.current.onGlided?.();
      };
      tween = requestAnimationFrame(step);
    };

    // Reached below the cover some other way (the skip link, a restored
    // position): the globe must be there, and the explorer asked for — the
    // pass stays whole (nothing tore it).
    const onScroll = () => {
      if (state.gliding || state.asked) return;
      if (window.scrollY > window.innerHeight * 0.5) {
        release(false);
        ask(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      disposed = true;
      if (tween) cancelAnimationFrame(tween);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const onTear = useCallback(() => {
    setTorn(true);
    // Torn once in this session: a later visit opens on the globe
    // (src/lib/reelVisit.ts, the way back).
    markPassTorn();
  }, []);
  const onFree = useCallback(
    ({ face, free }: StubHandover) => {
      // The stub stays with the reader and goes on to stop 01's cover.
      launchStubCourier({ face, free, stock: stockPaper(first?.slug) });
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.setTimeout(() => glideRef.current(), reduce ? 0 : GLIDE_AFTER_FREE_MS);
    },
    [first?.slug],
  );

  const ready = compose === 'done' && !covered;
  const style = {
    ['--ec-step' as string]: `${COVER_REVEAL.stepMs}ms`,
    ['--ec-dur' as string]: `${COVER_REVEAL.durMs}ms`,
    ['--ec-rise' as string]: `${COVER_REVEAL.rise}px`,
  } as CSSProperties;
  const head = blocks.filter((block) => block.kind !== 'm');
  const body = blocks.filter((block) => block.kind === 'm');
  const indexOf = (block: CoverBlock) => blocks.indexOf(block);
  const both = (block: CoverBlock) => {
    const zh = blocksZh[indexOf(block)];
    return (
      <>
        <span data-l="en">
          <Words block={block} />
        </span>
        {zh && (
          <span data-l="zh" lang="zh-Hans">
            <Words block={zh} />
          </span>
        )}
      </>
    );
  };

  return (
    <section
      ref={sectionRef}
      className="entrance"
      aria-label={t('entrance.aria')}
      data-compose={compose}
      data-torn={torn ? '' : undefined}
      style={style}
    >
      <div className="entrance-intro">
        <div className="ec">
          <div ref={textRef} className="ec-text">
            <div className="ec-head">
              {head.map((block) =>
                block.kind === 'kicker' ? (
                  <p key="kicker" className="ec-block ec-kicker" style={{ ['--b' as string]: indexOf(block) } as CSSProperties}>
                    <span className="ec-w ec-kicker__dot" aria-hidden="true" />
                    {block.pieces.map((piece, at) => (
                      <span
                        key={at}
                        className={`ec-w${at > 0 ? ' ec-kicker__years' : ''}`}
                        // The pass's DATE flies out of the archive's years
                        // (when they hold it: the first chapter's year).
                        data-pass-from={at > 0 && fields.date !== '—' && String(piece).includes(fields.date) ? 'date' : undefined}
                      >
                        {at === 0 ? <T k="cover.kicker" /> : String(piece)}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p
                    key={indexOf(block)}
                    className={`ec-block ec-${block.kind}`}
                    style={{ ['--b' as string]: indexOf(block) } as CSSProperties}
                  >
                    {both(block)}
                  </p>
                ),
              )}
            </div>
            <div className="ec-body">
              {body.map((block) => (
                <p key={indexOf(block)} className="ec-block ec-m" style={{ ['--b' as string]: indexOf(block) } as CSSProperties}>
                  {both(block)}
                </p>
              ))}
            </div>
          </div>
          <div ref={stageRef} className="ec-pass" data-lifted={lifted ? '' : undefined}>
            <BoardingPass
              fields={fields}
              handle={pass}
              interactive={ready}
              onTear={onTear}
              onFree={onFree}
              onLift={setLifted}
              carry={stageRef}
            />
            <p className="ec-hint" data-asm="hint" aria-hidden="true">
              <span className="ec-hint__dot" />
              <T k="entrance.hint" />
            </p>
          </div>
        </div>
      </div>
      <span className="sr-only" role="status">{torn ? <T k="entrance.torn" /> : ''}</span>
    </section>
  );
}
