// Run offline: node --experimental-strip-types --test scripts/ticket-latch.test.mjs
//
// The guard on the homepage tickets' latch (src/lib/ticketLatch.ts): when a
// cover tears going forward and when it comes back. The owner's bug was a
// cover that never came back (回到miami看不见封面): a torn ticket re-seated only
// 0.1 short of its tear line, so a reader who stopped anywhere between that
// and the atlas's own back line saw the stub and no photograph, with the map
// still on the next place — and Miami, whose timeline cannot go below 0,
// could stay torn for good on a short window. These cases hold the latch to
// the atlas it has to agree with, and the mirrored constants to each other.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ATLAS_HOME_LINE,
  ATLAS_LEAVE_LINE,
  LATCH_WHOLE,
  TEAR_COAST_TO_MS,
  TEAR_HARD_LINE,
  TEAR_HYSTERESIS,
  TEAR_REST_GAP_MS,
  TEAR_LINE_MAX,
  TEAR_LINE_MIN,
  TEAR_PUSH_PX,
  TEAR_REARM,
  TEAR_REST_TURN,
  TEAR_SEEN_MS,
  TEAR_TOP_VH,
  accrueSeen,
  addPushSample,
  deriveCornerLine,
  deriveTearLine,
  plateShare,
  pushState,
  pushedAfter,
  readLandedAt,
  reseatLine,
  reseatsAtRest,
  stepLatch,
} from '../src/lib/ticketLatch.ts';
import {
  TEAR_BEAT_MS,
  TEAR_BEFORE_FLIGHT_MS,
  TEAR_FREE_MS,
  TEAR_MS,
  TEAR_SNAP_MS,
  applyAffine,
  mirrorAffine,
  msAtTip,
  tearPose,
  tearRate,
  tearStampAt,
  tipSmooth,
  tipStepped,
  tornEdge,
} from '../src/lib/ticketTear.ts';
import { EGG } from '../src/lib/globeEgg.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const constant = (text, name) => {
  const match = new RegExp(`const ${name} = ([\\d.]+);`).exec(text);
  assert.ok(match, `${name} is declared as a number`);
  return Number(match[1]);
};

/** Runs the latch over a list of deltas; returns every state and the flips. */
function run(deltas, line, start = LATCH_WHOLE) {
  let state = start;
  const flips = [];
  const states = [];
  for (const delta of deltas) {
    const next = stepLatch(state, delta, line);
    if (next.torn !== state.torn) flips.push({ delta, torn: next.torn });
    state = next;
    states.push(state);
  }
  return { state, flips, states };
}
/** Evenly spaced deltas from a to b (both exact), like scroll frames. The
 *  homepage timeline clamps chapter 0 to exactly 0 at the top. */
const sweep = (a, b, step = 0.004) => {
  const out = [];
  const n = Math.max(1, Math.round(Math.abs(b - a) / step));
  for (let i = 0; i <= n; i += 1) out.push(i === n ? b : a + ((b - a) * i) / n);
  return out;
};
const LINES = [TEAR_LINE_MIN, 0.05, 0.0382, 0.0822, 0.1, 0.162, 0.191, TEAR_LINE_MAX];

test('the mirrored lines keep their order: tear, home, re-arm, leave', () => {
  assert.ok(TEAR_LINE_MIN > 0, 'a cover centred on the reading line is never torn');
  assert.ok(TEAR_LINE_MIN < TEAR_LINE_MAX);
  assert.ok(TEAR_LINE_MAX < ATLAS_HOME_LINE, 'every tear line lies below the atlas home line');
  assert.ok(ATLAS_HOME_LINE + TEAR_REARM < ATLAS_LEAVE_LINE, 'a re-armed tear still comes before the flight');
  assert.ok(TEAR_LINE_MAX < TEAR_HARD_LINE && TEAR_HARD_LINE < ATLAS_LEAVE_LINE, 'the hard line comes before the flight');
  assert.ok(TEAR_HYSTERESIS > 0 && TEAR_TOP_VH > 0 && TEAR_TOP_VH < 0.48);
});

test('RouteAtlas still commits at the lines this module mirrors', () => {
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const forward = /\bforward:\s*([\d.]+),/.exec(atlas);
  const back = /\bback:\s*([\d.]+),/.exec(atlas);
  assert.ok(forward && back, 'HOP.forward and HOP.back are plain numbers in RouteAtlas.tsx');
  assert.equal(Number(forward[1]), 0.32);
  assert.equal(Number(back[1]), 0.78);
  assert.equal(ATLAS_LEAVE_LINE, Number(forward[1]));
  // The same expression RouteAtlas evaluates for its back commit from place 1.
  assert.equal(ATLAS_HOME_LINE, 1 - Number(back[1]));
});

test('every tear gate is the face free plus the same beat', () => {
  // src/lib/ticketTear.ts owns the score; RouteAtlas and ArchiveClosing are
  // lazy chunks and mirror its gate as a number.
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  assert.equal(TEAR_FREE_MS, 530);
  assert.equal(TEAR_BEAT_MS, 60);
  assert.equal(TEAR_BEFORE_FLIGHT_MS, TEAR_FREE_MS + TEAR_BEAT_MS);
  assert.equal(constant(source('src/components/home/RouteAtlas.tsx'), 'TEAR_BEFORE_FLIGHT_MS'), TEAR_BEFORE_FLIGHT_MS);
  assert.equal(constant(source('src/components/home/ArchiveClosing.tsx'), 'TEAR_BEFORE_ENDING_MS'), TEAR_BEFORE_FLIGHT_MS);
  assert.match(chapter, /const PULL_GO_AFTER_MS = TEAR_BEFORE_FLIGHT_MS;/);
  assert.ok(TEAR_FREE_MS < TEAR_MS, 'the face is free before the tear is over');
  assert.ok(TEAR_BEFORE_FLIGHT_MS < 1200, 'below RouteAtlas\'s hold cap');
});

test('a held flight never waits past its cap, however the reader scrolls on', () => {
  // RouteAtlas re-asks its hold on every scroll sample while it is held; a
  // cover with no stamp yet counts as tearing now, so without the cap there
  // too a reader who kept scrolling pushed the flight back sample by sample.
  const atlas = source('src/components/home/RouteAtlas.tsx');
  const capped = atlas.match(/Math\.min\(facesFreeAt\(committed, dest, now\), since \+ TEAR_HOLD_CAP_MS\)/g) ?? [];
  assert.equal(capped.length, 2, 'both holdFor and releaseHeldHop cap the wait');
  assert.doesNotMatch(atlas, /const wait = facesFreeAt\(committed, dest, now\) - now;/);
});

test('the globe egg\'s ticket tears on the archive\'s own score', () => {
  // No mirror: the egg imports the archive's score.
  const eggs = source('src/components/home/GlobeEggs.tsx');
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const importsScore = (text) => /import \{[^}]*\btearPose\b[^}]*\} from '\.\.\/\.\.\/lib\/ticketTear'/.test(text);
  assert.ok(importsScore(eggs), 'GlobeEggs imports tearPose from ticketTear');
  assert.ok(importsScore(chapter), 'ArchiveChapter imports tearPose from ticketTear');
  assert.match(eggs, /TEAR_BEFORE_FLIGHT_MS\);/, 'the egg\'s voyage waits for the same gate');
  assert.equal('TEAR' in EGG, false, 'globeEgg.ts keeps no copy of the score');
  assert.doesNotMatch(source('src/lib/globeEgg.ts'), /export function tearPose/);
});

test('(a) chapter 0 always comes back by its centre, whatever its line and peak', () => {
  for (const line of LINES) {
    for (const peak of [line, line + 0.01, 0.1, 0.15, 0.22, 0.3, 0.32, 0.5, 1]) {
      if (peak < line) continue;
      const torn = run(sweep(0, peak), line).state;
      assert.equal(torn.torn, true, `line ${line} tears by ${peak}`);
      // Chapter 0's delta floors at 0: coming all the way back must re-seat.
      const back = run(sweep(peak, 0), line, torn);
      assert.equal(back.state.torn, false, `line ${line}, peak ${peak}: whole at delta 0`);
    }
  }
  // The permanent short-window case (1728×800: Miami's raw line 0.0864).
  assert.equal(reseatLine(0.0864 + 0.001) >= 0, true);
  assert.equal(stepLatch({ torn: true, peak: 1, rearm: -Infinity }, 0, TEAR_LINE_MIN).torn, false);
});

test('(b) once the atlas has left, the face re-seats on the frame the atlas turns home', () => {
  for (const line of LINES) {
    for (const peak of [ATLAS_LEAVE_LINE, 0.5, 1]) {
      const torn = run(sweep(0, peak), line).state;
      // Just above the home line: still torn (the atlas still has the next place).
      const above = stepLatch(torn, ATLAS_HOME_LINE + 1e-9, line);
      assert.equal(above.torn, true, `line ${line}: torn just above home`);
      const at = stepLatch(above, ATLAS_HOME_LINE, line);
      assert.equal(at.torn, false, `line ${line}: whole at the home line`);
      // RouteAtlas turns home from place 1 when `position <= 1 - HOP.back`.
      assert.equal(ATLAS_HOME_LINE <= 1 - 0.78, true);
    }
  }
});

test('(c) a re-seat above the tear line re-arms the next tear further on', () => {
  const line = 0.162;
  let state = run(sweep(0, 1), line).state;
  // A throw back that lands at 0.21 in one frame (a slower one re-seats on
  // the first frame at or below the home line, 0.22).
  state = run([0.5, 0.21], line, state).state;
  assert.equal(state.torn, false, 'whole at 0.21 after the atlas turned home');
  assert.ok(Math.abs(state.rearm - (0.21 + TEAR_REARM)) < 1e-9);
  // Forward again: not on the next frame, not at 0.25 — at 0.29.
  assert.equal(stepLatch(state, 0.211, line).torn, false);
  assert.equal(stepLatch(state, 0.25, line).torn, false);
  assert.equal(stepLatch(state, 0.29, line).torn, true);
  assert.ok(0.21 + TEAR_REARM < ATLAS_LEAVE_LINE, 'still torn before the flight commits');
  // Dipping below the line clears it: the next tear is an ordinary one.
  const dipped = run([0.15, 0.1], line, state).state;
  assert.equal(dipped.rearm, -Infinity);
  assert.equal(stepLatch(dipped, line, line).torn, true);
});

test('(d) a hand jiggling at the atlas home line does not flutter the ticket', () => {
  for (const line of [0.162, 0.2, TEAR_LINE_MIN, 0.0382]) {
    const alternations = [];
    for (let i = 0; i < 12; i += 1) alternations.push(i % 2 ? 0.25 : 0.19);
    const { flips } = run([...sweep(0, 0.19), ...alternations], line);
    assert.ok(flips.length <= 2, `line ${line}: ${flips.length} flips`);
    // The same after the atlas has left and the reader came back to 0.19.
    const returned = run([...sweep(0, 1), ...sweep(1, 0.19)], line).state;
    const late = run(alternations, line, returned).flips;
    assert.ok(late.length <= 2, `line ${line}, after a return: ${late.length} flips`);
  }
});

test('the fling guard: a small reversal after a tear never re-seats it', () => {
  for (const line of LINES) {
    for (const peak of [line + 0.02, 0.2, 0.25, 0.3]) {
      if (peak <= line) continue;
      const torn = run(sweep(0, peak), line).state;
      // ~15px at a 1000px chapter.
      assert.equal(stepLatch(torn, peak - 0.015, line).torn, true, `line ${line}, peak ${peak}`);
    }
  }
});

test('a forward read tears once and a full return re-seats once, never past home', () => {
  for (const line of LINES) {
    const { flips } = run([...sweep(-1, 1), ...sweep(1, -1)], line);
    assert.equal(flips.length, 2, `line ${line}`);
    assert.equal(flips[0].torn, true);
    assert.ok(flips[0].delta >= line && flips[0].delta < line + 0.005, 'tears on its line');
    assert.ok(flips[0].delta < ATLAS_LEAVE_LINE, 'before the atlas commits');
    assert.equal(flips[1].torn, false);
    assert.ok(flips[1].delta <= ATLAS_HOME_LINE && flips[1].delta > ATLAS_HOME_LINE - 0.005, 're-seats at home');
  }
});

test('reversing mid-tear, before the atlas left, re-seats a step back or at rest', () => {
  for (const line of [0.162, TEAR_LINE_MIN]) {
    const torn = run(sweep(0, 0.2), line).state;
    // Turned round and stopped: still torn on the move (inside the fling
    // guard), put back once at rest.
    const stopped = run(sweep(0.2, 0.14), line, torn).state;
    assert.equal(stopped.torn, true, 'a 0.06 step back is still inside the fling guard');
    assert.equal(reseatsAtRest(stopped, 0.14, line), true, `line ${line}: back at rest`);
    // Stepping back the hysteresis re-seats it on the move.
    assert.equal(run(sweep(0.2, 0.1), line, torn).state.torn, false);
  }
  assert.equal(reseatsAtRest(LATCH_WHOLE, 0, 0.162), false);
});

test('at rest: below the line, or turned round short of home — never a pause going on', () => {
  const line = TEAR_LINE_MIN;
  const at = (peak) => run(sweep(0, peak), line).state;
  // Going on and pausing (no turn): stays torn, anywhere past the line.
  for (const delta of [0.05, 0.1, 0.15, 0.2, 0.25]) {
    assert.equal(reseatsAtRest(at(delta), delta, line), false, `pause at ${delta}`);
  }
  // A wobble back (under TEAR_REST_TURN) is not turning round.
  assert.equal(reseatsAtRest(at(0.15), 0.15 - TEAR_REST_TURN / 2, line), false);
  // Turned round and stopped short of the atlas home line: back.
  assert.equal(reseatsAtRest(at(0.15), 0.15 - TEAR_REST_TURN * 1.5, line), true);
  assert.equal(reseatsAtRest(at(0.3), 0.21, line), true);
  // Turned round but still past the home line: the atlas is poised to go, the
  // ticket stays torn (a rest above 0.22 may be torn).
  assert.equal(reseatsAtRest(at(0.3), 0.25, line), false);
  // Below the line at rest: back whatever the turn.
  assert.equal(reseatsAtRest({ torn: true, peak: 0.02, rearm: -Infinity }, 0.02, line), true);
});

test('a notched wheel going on tears once and never re-seats at its pauses', () => {
  for (const line of [TEAR_LINE_MIN, 0.0822, 0.162]) {
    let state = LATCH_WHOLE;
    let flips = 0;
    for (let notch = 0; notch < 5; notch += 1) {
      for (const delta of sweep(notch * 0.1, (notch + 1) * 0.1)) {
        const next = stepLatch(state, delta, line);
        if (next.torn !== state.torn) flips += 1;
        state = next;
      }
      // The pause after each notch.
      if (reseatsAtRest(state, (notch + 1) * 0.1, line)) {
        state = LATCH_WHOLE;
        flips += 1;
      }
    }
    assert.equal(flips, 1, `line ${line}`);
    assert.equal(state.torn, true);
  }
});

test('stepLatch returns the same object when nothing changed', () => {
  const torn = stepLatch(LATCH_WHOLE, 0.5, 0.1);
  assert.equal(stepLatch(torn, 0.4, 0.1), torn);
  assert.equal(stepLatch(LATCH_WHOLE, 0, 0.1), LATCH_WHOLE);
});

test('the tear line is derived from the layout and clamped', () => {
  // 1728×1000: Miami (landscape, 486px tall) and Orlando (portrait, 780px).
  const miami = deriveTearLine(1000, 486, 0.48, 969);
  assert.ok(miami >= TEAR_LINE_MIN && miami <= TEAR_LINE_MAX);
  // Its top edge at the line is where TEAR_TOP_VH says (unless clamped up).
  const top = 0.48 * 1000 - 486 / 2 - miami * 969;
  assert.ok(top <= TEAR_TOP_VH * 1000 + 0.5 || miami === TEAR_LINE_MIN);
  assert.equal(deriveTearLine(1000, 780, 0.48, 1115), TEAR_LINE_MIN, 'a portrait tears on the floor');
  assert.equal(deriveTearLine(1000, 486, 0.48, 0), TEAR_LINE_MAX, 'no span: the ceiling');
  assert.equal(deriveTearLine(1000, 10, 0.48, 400), TEAR_LINE_MAX, 'never past the ceiling');
});

// ── The gate: seen whole first, then torn by the reader's own push ──
// The owner's words for the old trigger: 有点太早了, 有时候没看见就撕下去了. A model
// of ArchiveChapter's sample loop (the latch effect's `observe`): the ring of
// timeline samples, the seen clock, the push since seen, and the gated latch.
function reader({ line, corner, vh = 1000, h = 486, span = 969, prevSpan = span, landedAt = () => 0 }) {
  let state = LATCH_WHOLE;
  let samples = [];
  let seen = 0;
  let pushed = 0;
  let prevT = -1;
  let prevPx = 0;
  let prevShare = 0;
  let tornAt = null;
  const step = (t, delta) => {
    const px = delta * (delta >= 0 ? span : prevSpan);
    addPushSample(samples, t, px);
    const push = pushState(samples, t);
    if (prevT >= 0) seen = accrueSeen(seen, prevT, t, landedAt(t), prevShare, h, vh);
    if (seen >= TEAR_SEEN_MS) pushed = pushedAfter(pushed, push, px - prevPx);
    const share = plateShare(delta, vh, h, 0.48, span, prevSpan);
    if (share <= 0) {
      seen = 0;
      pushed = 0;
    }
    prevT = t;
    prevPx = px;
    prevShare = share;
    const was = state.torn;
    state = stepLatch(state, delta, line, { seen: seen >= TEAR_SEEN_MS && pushed >= TEAR_PUSH_PX, pushing: push.pushing, corner });
    if (!was && state.torn && !tornAt) tornAt = { t, delta, speed: push.vNow };
    return state;
  };
  return { step, get torn() { return state.torn; }, get tornAt() { return tornAt; }, get seen() { return seen; } };
}
const FRAME = 1000 / 60;
/** A trackpad swipe's momentum from `from` to `to` (deltas): exponential, tau
 *  ms, sampled on frames from t0 until it has settled. Returns the end time. */
function glide(model, t0, from, to, tau, span = 969) {
  let t = t0;
  for (; t - t0 < tau * 6; t += FRAME) {
    const k = 1 - Math.exp(-(t - t0) / tau);
    model.step(t, from + (to - from) * k);
  }
  model.step(t, to);
  return t;
}
/** A steady read at `pace` px/s from `from` for `ms`. */
function read(model, t0, from, pace, ms, span = 969) {
  let t = t0;
  for (; t - t0 <= ms; t += FRAME) model.step(t, from + ((pace * (t - t0)) / 1000) / span);
  return t;
}
// 1728×1000: Zion-like landscape (486px tall, 969px to the next anchor) and
// Orlando-like portrait (780px, 1115px).
const LANDSCAPE = { h: 486, span: 969 };
const PORTRAIT = { h: 780, span: 1115 };
const linesOf = ({ h, span }) => {
  const line = deriveTearLine(1000, h, 0.48, span);
  return { line, corner: deriveCornerLine(1000, h, 0.48, span, line) };
};

test('the corner line: a portrait just past its line, a landscape at the ceiling', () => {
  const landscape = linesOf(LANDSCAPE);
  const portrait = linesOf(PORTRAIT);
  assert.ok(portrait.corner >= portrait.line && portrait.corner < 0.045, `portrait corner ${portrait.corner}`);
  assert.ok(landscape.corner > 0.15 && landscape.corner <= TEAR_LINE_MAX, `landscape corner ${landscape.corner}`);
  // Its top edge is at 5% of the viewport there (unless clamped).
  const top = 480 - 780 / 2 - portrait.corner * 1115;
  assert.ok(Math.abs(top - 50) < 0.5, `portrait top at the corner line: ${top}`);
  for (const h of [200, 486, 700, 780, 900]) {
    for (const span of [700, 969, 1115, 1400]) {
      const line = deriveTearLine(1000, h, 0.48, span);
      const corner = deriveCornerLine(1000, h, 0.48, span, line);
      assert.ok(corner >= line && corner <= TEAR_LINE_MAX && TEAR_LINE_MAX < ATLAS_HOME_LINE);
    }
  }
  assert.equal(deriveCornerLine(1000, 486, 0.48, 0, 0.03), TEAR_LINE_MAX);
});

test('plateShare is the share of the plate on screen, from the geometry alone', () => {
  // Centred: a 486px plate on a 1000px viewport is whole.
  assert.equal(plateShare(0, 1000, 486, 0.48, 969, 969), 1);
  // Its top 80px past the viewport's top: (486 − 80) / 486 on screen.
  const delta = (480 - 243 + 80) / 969;
  assert.ok(Math.abs(plateShare(delta, 1000, 486, 0.48, 969, 969) - (486 - 80) / 486) < 1e-9);
  // Before it, the previous span counts; far off, nothing.
  assert.ok(plateShare(-0.3, 1000, 486, 0.48, 969, 500) > plateShare(-0.3, 1000, 486, 0.48, 969, 969));
  assert.equal(plateShare(1, 1000, 486, 0.48, 969, 969), 0);
  assert.equal(plateShare(0, 1000, 0, 0.48, 969, 969), 0);
});

test('the seen clock: only once landed, only while whole on screen, credited for a rest', () => {
  assert.equal(readLandedAt(undefined), 0, 'no atlas: landed long ago');
  assert.equal(readLandedAt('flying'), Infinity);
  assert.equal(readLandedAt('1234'), 1234);
  assert.equal(accrueSeen(0, 100, 600, 0, 1, 486, 1000), 500, 'a rest counts in full');
  assert.equal(accrueSeen(0, 100, 600, 400, 1, 486, 1000), 200, 'from the landing');
  assert.equal(accrueSeen(0, 100, 600, Infinity, 1, 486, 1000), 0, 'not while the map flies');
  assert.equal(accrueSeen(0, 100, 600, 0, 0.85, 486, 1000), 0, 'not while partly off screen');
  // A plate taller than the viewport counts as whole when it fills it.
  assert.equal(accrueSeen(0, 100, 600, 0, 0.9, 1200, 1000), 500);
});

test('a cover has no entrance of its own: on screen whole is seen', () => {
  // 页面下滑，封面部分是自动划出来的，我觉得没必要，直接出现就好 — the covers are
  // simply there: no crop wipe, no overscan zoom, no fade or rise, no album
  // unfold. So nothing but the plate's share on screen gates the seen clock.
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  assert.doesNotMatch(chapter, /COVER_REVEAL|revealOpen|revealClip|coverReveal|mediaScale|focusScale|entryY/);
  assert.doesNotMatch(chapter, /albumOpen|albumClip|albumScale|albumRotate|albumPhotoY|handoffProgress|entryInteractive/);
  assert.doesNotMatch(chapter, /revealed\(\)/);
  assert.match(chapter, /accrueSeen\(seenMs, prevT, now, landedAt, prevShare, geometry\.h, geometry\.vh\)/);
  // The section and the plate's stage carry no motion style of their own.
  assert.doesNotMatch(chapter, /<motion\.section/);
  assert.match(chapter, /<div className="archive-plate__stage">/);
});

test('a push is new movement: a decaying glide coasts, a hand pushes', () => {
  const samples = [];
  for (let t = 0; t < 400; t += FRAME) samples.push({ t, px: 1000 * (1 - Math.exp(-t / 650)) });
  const coast = pushState(samples, samples.at(-1).t);
  assert.ok(coast.vNow > 200, `still fast: ${coast.vNow}`);
  assert.equal(coast.pushing, false, 'but decaying: a glide');
  const hand = [];
  for (let t = 0; t < 400; t += FRAME) hand.push({ t, px: 0.575 * t });
  assert.equal(pushState(hand, hand.at(-1).t).pushing, true);
  // Fewer than two samples in the window: no speed at all.
  assert.equal(pushState([{ t: 0, px: 0 }], 500).vNow, 0);
  // After a rest the page stood still until a frame ago: the first frame of a
  // push has its speed at once. A frame after a frame adds nothing.
  const ring = [{ t: 0, px: 100 }];
  addPushSample(ring, 1000, 104);
  assert.equal(ring.length, 2, 'the rest, a frame ago, and the push');
  assert.ok(pushState(ring, 1000).vNow > 200 && pushState(ring, 1000).pushing);
  addPushSample(ring, 1000 + TEAR_REST_GAP_MS - 1, 110);
  assert.equal(ring.length, 3);
  // The push counts from its first frame; a glide never counts.
  assert.equal(pushedAfter(0, { pushing: true, travel: 16 }, 4), 16);
  assert.equal(pushedAfter(16, { pushing: true, travel: 20 }, 5), 21);
  assert.equal(pushedAfter(3, { pushing: false, travel: 0 }, 30), 3);
  assert.equal(pushState(samples, samples.at(-1).t).travel, 0, 'a coasting glide has no push travel');
  // The ring keeps only TEAR_COAST_TO_MS of the hand.
  for (let t = 1100; t < 2000; t += FRAME) addPushSample(ring, t, t);
  assert.ok(ring.at(-1).t - ring[0].t <= TEAR_COAST_TO_MS);
});

test('the owner\'s trackpad case: whole through the glide and the look, torn on the next push', () => {
  for (const tau of [330, 650]) {
    for (const plate of [LANDSCAPE, PORTRAIT]) {
      const { line, corner } = linesOf(plate);
      // The map lands on this place 1.2s into the swipe that brings it in.
      const landing = 1200;
      const model = reader({ ...plate, line, corner, landedAt: (t) => (t < landing ? Infinity : landing) });
      const over = 60 / plate.span;
      const settled = glide(model, 0, -1, over, tau, plate.span);
      assert.equal(model.torn, false, `tau ${tau}, h ${plate.h}: whole through the glide`);
      // He looks for a second (no samples), then reads on.
      const start = settled + 1000;
      read(model, start, over, 575, 400, plate.span);
      assert.ok(model.tornAt, `tau ${tau}, h ${plate.h}: torn by the push`);
      assert.ok(model.tornAt.t - start <= 200, `torn ${model.tornAt.t - start}ms into the push`);
      assert.ok(model.tornAt.delta >= line);
    }
  }
});

test('never at rest, never on a glide below the hard line, always at it', () => {
  const { line, corner } = linesOf(LANDSCAPE);
  // A long glide that coasts to 0.15, well past the line, with the map down
  // and the plate seen for seconds: whole.
  const coasting = reader({ ...LANDSCAPE, line, corner });
  let t = glide(coasting, 0, -1, 0.15, 650);
  assert.equal(coasting.torn, false);
  assert.ok(coasting.seen >= TEAR_SEEN_MS);
  // Parked there for 5s: a sample that does not move is not a push.
  t += 5000;
  coasting.step(t, 0.15);
  assert.equal(coasting.torn, false, 'at rest');
  // One notch on (120px over ~100ms): torn inside 150ms.
  const notch = t + FRAME;
  for (let s = notch; s <= notch + 150; s += FRAME) coasting.step(s, 0.15 + Math.min(1, (s - notch) / 100) * (120 / 969));
  assert.ok(coasting.tornAt && coasting.tornAt.t - notch <= 150, 'a notch tears it');
  // A glide that coasts past TEAR_HARD_LINE tears on the hard line, pushing
  // or not, before the atlas's commit.
  const past = reader({ ...LANDSCAPE, line, corner, landedAt: () => Infinity });
  glide(past, 0, -0.3, 0.5, 650);
  assert.ok(past.tornAt && past.tornAt.delta >= TEAR_HARD_LINE && past.tornAt.delta < TEAR_HARD_LINE + 0.05);
  assert.ok(past.tornAt.delta < ATLAS_LEAVE_LINE);
});

// The page's own glide: a trackpad's exponential momentum as Lenis smooths it
// (lerp 0.085 a frame), on whole pixels, sampled when the scroll moves with a
// few ms of jitter — the tail the verifier measured, which read as a push
// against the old 185ms coast window (有时候没看见就撕下去了).
function pageGlide(model, t0, fromPx, distPx, tau, span, jitter = 4) {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let scroll = 0;
  let shown = null;
  let t = t0;
  for (let frame = 0; frame < (tau * 7) / FRAME; frame += 1) {
    t = t0 + frame * FRAME;
    scroll += (distPx * (1 - Math.exp(-(t - t0) / tau)) - scroll) * (1 - Math.exp(-0.085));
    const y = Math.round(scroll);
    if (y === shown) continue;
    shown = y;
    model.step(t + (random() - 0.5) * jitter, (fromPx + y) / span);
  }
  return t;
}

test('a glide that runs long past a chapter keeps it whole until the next push', () => {
  // 1728×1000 overshoots of 150–300px (Zion and Bryce tore by themselves at
  // 150–200, ~0.5s after landing), and 130px at 1280×800 (a 643px leg).
  const cases = [
    ...[150, 200, 250, 280].map((over) => ({ plate: LANDSCAPE, vh: 1000, over, tau: 650 })),
    { plate: PORTRAIT, vh: 1000, over: 200, tau: 650 },
    { plate: { h: 312, span: 643 }, vh: 800, over: 130, tau: 650 },
    { plate: LANDSCAPE, vh: 1000, over: 200, tau: 1000 },
  ];
  for (const { plate, vh, over, tau } of cases) {
    const line = deriveTearLine(vh, plate.h, 0.48, plate.span);
    const corner = deriveCornerLine(vh, plate.h, 0.48, plate.span, line);
    const landing = 1100;
    const model = reader({ ...plate, vh, line, corner, landedAt: (t) => (t < landing ? Infinity : landing) });
    const settled = pageGlide(model, 0, -plate.span, plate.span + over, tau, plate.span);
    assert.equal(model.torn, false, `${plate.h}px, ${over}px over, tau ${tau}: whole through the glide`);
    const start = settled + 1500;
    read(model, start, over / plate.span, 575, 400, plate.span);
    assert.ok(model.tornAt && model.tornAt.t - start <= 200, `${plate.h}px, ${over}px over: torn by the next push`);
  }
});

test('a portrait read straight through tears on its corner line, top edge on screen', () => {
  const { line, corner } = linesOf(PORTRAIT);
  const model = reader({ ...PORTRAIT, line, corner });
  read(model, 0, -0.5, 575, 2000, PORTRAIT.span);
  assert.ok(model.tornAt, 'torn');
  assert.ok(model.tornAt.delta <= corner + 0.02, `at ${model.tornAt.delta}, corner ${corner}`);
  const top = 480 - PORTRAIT.h / 2 - model.tornAt.delta * PORTRAIT.span;
  assert.ok(top >= 30, `top edge ${top}px down when it tears`);
});

test('without a gate the latch is exactly the old one', () => {
  const open = { seen: true, pushing: true, corner: 0 };
  for (const line of LINES) {
    let a = LATCH_WHOLE;
    let b = LATCH_WHOLE;
    for (const delta of [...sweep(-1, 1), ...sweep(1, -0.2), ...sweep(-0.2, 0.4)]) {
      a = stepLatch(a, delta, line);
      b = stepLatch(b, delta, line, open);
      assert.deepEqual(a, b);
    }
  }
});

test('a closed gate still re-seats, and a torn ticket is never held by it', () => {
  const closed = { seen: false, pushing: false, corner: TEAR_LINE_MAX };
  const torn = run(sweep(0, 0.5), 0.03).state;
  assert.equal(stepLatch(torn, ATLAS_HOME_LINE, 0.03, closed).torn, false, 're-seats at home');
  // Whole past the line with the gate closed: stays whole until the hard line.
  let state = LATCH_WHOLE;
  for (const delta of sweep(0, 0.29)) state = stepLatch(state, delta, 0.03, closed);
  assert.equal(state.torn, false);
  assert.equal(stepLatch(state, TEAR_HARD_LINE, 0.03, closed).torn, true);
});

// ── The score (src/lib/ticketTear.ts) ──
const FACE = { w: 729, h: 486, vw: 1728 };
const cornersAt = (ms, frame = FACE) => {
  const { m } = tearPose(ms, frame);
  return [[0, 0], [frame.w, 0], [0, frame.h], [frame.w, frame.h]].map(([x, y]) => applyAffine(m, x, y));
};

test('the rip runs down the seam, catching, and is whole-torn exactly when free', () => {
  let prevStep = 0;
  let prevSmooth = 0;
  let catches = 0;
  for (let u = 0; u <= 1.0001; u += 0.002) {
    const stepped = tipStepped(u);
    const smooth = tipSmooth(u);
    assert.ok(stepped >= prevStep - 1e-12 && smooth >= prevSmooth - 1e-12, 'never runs back up');
    if (u > 0 && stepped === prevStep && stepped < 1) catches += 1;
    prevStep = stepped;
    prevSmooth = smooth;
  }
  assert.ok(catches > 50, 'the paper catches on its bridges');
  assert.equal(tearPose(TEAR_FREE_MS, FACE).tip, 1);
  assert.ok(tearPose(TEAR_FREE_MS - 1, FACE).tip < 1);
  for (const tip of [0, 0.08, 0.25, 0.5, 0.89, 1]) {
    assert.ok(Math.abs(tipSmooth((msAtTip(tip) - 70) / 460) - tip) < 1e-9, `msAtTip inverts the hand at ${tip}`);
  }
  // The hinge: the top-left corner drops first, and well down by free.
  const [tl, tr] = cornersAt(TEAR_FREE_MS - 1);
  assert.ok(tl[1] - tr[1] > 90, `top V ${tl[1] - tr[1]}px`);
});

test('torn, not fallen: after the snap the face is carried up and aside, slowing', () => {
  const after = TEAR_FREE_MS + TEAR_SNAP_MS;
  // A landscape and a portrait face at 1728, and the egg's small ticket.
  for (const frame of [FACE, { w: 520, h: 780, vw: 1728 }, { w: 244, h: 160, vw: 586 }]) {
    for (let ms = after; ms < TEAR_MS; ms += 1) {
      const a = cornersAt(ms, frame);
      const b = cornersAt(ms + 1, frame);
      [0, 1, 2, 3].forEach((i) => assert.ok(b[i][1] <= a[i][1] + 1e-9, `${frame.w}×${frame.h} ${ms}ms: corner ${i} moves down`));
    }
  }
  for (let ms = after; ms < TEAR_MS; ms += 1) {
    const a = cornersAt(ms);
    const b = cornersAt(ms + 1);
    // No corner moves down the screen: the left hand's side (the corner the
    // owner watches) and the torn right edge alike.
    [0, 1, 2, 3].forEach((i) => assert.ok(b[i][1] <= a[i][1] + 1e-9, `${ms}ms: corner ${i} moves down`));
    // Carried to the left the whole way.
    assert.ok(b[0][0] <= a[0][0] + 1e-9);
  }
  // No corner speeds up from 120ms after free: a carry that decelerates.
  const speed = (ms) => cornersAt(ms).map((p, i) => Math.hypot(cornersAt(ms + 1)[i][0] - p[0], cornersAt(ms + 1)[i][1] - p[1]));
  for (let ms = TEAR_FREE_MS + 120; ms < TEAR_MS - 5; ms += 5) {
    const a = speed(ms);
    const b = speed(ms + 5);
    a.forEach((v, i) => assert.ok(b[i] <= v + 1e-6, `${ms}ms corner ${i} speeds up`));
  }
  // Whole until 40% of the carry, then gone by the end.
  assert.equal(tearPose(750, FACE).op, 1);
  assert.ok(tearPose(760, FACE).op < 1);
  assert.ok(tearPose(TEAR_MS, FACE).op < 1e-6);
  // The right hand settles.
  assert.ok(Math.abs(tearPose(TEAR_MS, FACE).stubDeg) < 0.02);
  // Reduced motion: values, not structure — no travel at all.
  const calm = tearPose(TEAR_MS / 2, FACE, { reduced: true });
  assert.deepEqual(calm.m, [1, 0, 0, 1, 0, 0]);
  assert.equal(calm.tip, 0);
  // It fades out as every fade-out does, easing in (EASE.fade): more than
  // half is left at half time, and it is gone at the end.
  assert.ok(calm.op > 0.6 && calm.op < 0.75, `reduced op at half time ${calm.op}`);
  assert.ok(tearPose(TEAR_MS, FACE, { reduced: true }).op < 1e-9);
});

test('the stamp keeps the flight a beat after the face is free at any rate', () => {
  for (const rate of [1, 1.4, 2, 2.2]) {
    for (const fromMs of [0, 120, 400]) {
      const now = 10000;
      const freeAt = now + (TEAR_FREE_MS - fromMs) / rate;
      const flight = tearStampAt(now, fromMs, rate) + TEAR_BEFORE_FLIGHT_MS;
      assert.ok(Math.abs(flight - (freeAt + TEAR_BEAT_MS)) < 1e-9, `rate ${rate} from ${fromMs}`);
    }
  }
  assert.equal(tearStampAt(500, TEAR_FREE_MS + 100, 2) + TEAR_BEFORE_FLIGHT_MS, 500 + TEAR_BEAT_MS);
  assert.equal(tearRate(0), 1);
  assert.equal(tearRate(300), 1);
  assert.ok(tearRate(575) > 1.3 && tearRate(575) < 1.5);
  assert.equal(tearRate(5000), 2.2);
});

test('each ticket tears along its own edge, the same way every time', () => {
  const a = tornEdge(486, 2);
  assert.deepEqual(tornEdge(486, 2), a);
  assert.notEqual(tornEdge(486, 3).faceCut, a.faceCut);
  for (const key of ['faceCut', 'stubCut', 'faceFringe', 'stubFringe']) assert.match(a[key], /^url\("data:image\/svg\+xml,/);
});

test('/about\'s stub is torn on the same score, held the other way round', () => {
  // ContactTicket imports the archive's score and turns it round; it keeps
  // no copy of its own.
  const ticket = source('src/components/about/ContactTicket.tsx');
  assert.match(ticket, /import \{[^}]*\btearPose\b[^}]*\bmirrorAffine\b|import \{[^}]*\bmirrorAffine\b[^}]*\btearPose\b/);
  assert.match(ticket, /from '\.\.\/\.\.\/lib\/ticketTear'/);
  assert.doesNotMatch(ticket, /function tearPose|const STOPS/);
  const STUB = { w: 164, h: 159, vw: 164 * 5 };
  const stubCorners = (ms, options) => {
    const m = mirrorAffine(tearPose(ms, STUB, options).m, STUB.w);
    return [[0, 0], [STUB.w, 0], [0, STUB.h], [STUB.w, STUB.h]].map(([x, y]) => applyAffine(m, x, y));
  };
  // At rest, nothing moves; turned round twice is the face's own pose.
  assert.deepEqual(mirrorAffine(tearPose(0, STUB).m, STUB.w), [1, 0, 0, 1, 0, 0]);
  for (const ms of [40, 300, TEAR_FREE_MS + 40, TEAR_MS - 10]) {
    const m = tearPose(ms, STUB).m;
    mirrorAffine(mirrorAffine(m, STUB.w), STUB.w).forEach((v, i) => assert.ok(Math.abs(v - m[i]) < 1e-9));
  }
  // The rip: the stub hinges about the tip on its LEFT edge (the seam stays
  // put there, but for the hand's dip), and its top-RIGHT corner drops first.
  for (const ms of [150, 300, TEAR_FREE_MS - 1]) {
    const pose = tearPose(ms, STUB, { smooth: true });
    const m = mirrorAffine(pose.m, STUB.w);
    const [x, y] = applyAffine(m, 0, pose.tip * STUB.h);
    assert.ok(Math.abs(x) < 1e-6 && y - pose.tip * STUB.h <= 1.5 + 1e-9, `${ms}ms: the tip holds on the seam`);
  }
  const [tl, tr] = stubCorners(TEAR_FREE_MS - 1);
  assert.ok(tr[1] - tl[1] > 15, `top V ${tr[1] - tl[1]}px`);
  // Free: laid aside up and to the RIGHT, never falling.
  for (let ms = TEAR_FREE_MS + TEAR_SNAP_MS; ms < TEAR_MS; ms += 1) {
    const a = stubCorners(ms);
    const b = stubCorners(ms + 1);
    [0, 1, 2, 3].forEach((i) => assert.ok(b[i][1] <= a[i][1] + 1e-9, `${ms}ms: stub corner ${i} moves down`));
    assert.ok(b[1][0] >= a[1][0] - 1e-9, `${ms}ms: carried right`);
  }
  assert.ok(stubCorners(TEAR_MS)[0][0] > 60, 'laid aside about half its width');
  // Reduced motion: no travel at all.
  assert.deepEqual(mirrorAffine(tearPose(TEAR_MS / 2, STUB, { reduced: true }).m, STUB.w), [1, 0, 0, 1, 0, 0]);
});
