// Run offline: node --experimental-strip-types --test scripts/ticket-latch.test.mjs
//
// The homepage ticket's tear (src/lib/ticketTear.ts): the score every
// ticket tears on — the face when the reader moves on, the stub when they
// open the story (the admission) — and the gates that wait for it. The
// scroll's latch that used to decide WHEN a ticket tore went with the scroll
// (the homepage is a map to roam, src/lib/explorer.ts): every gesture that
// lets a ticket go asks for its tear now, and goes on once the face is free.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
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
  tearStampAt,
  tipSmooth,
  tipStepped,
  tornEdge,
} from '../src/lib/ticketTear.ts';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the one tear left is the admission, and the story waits for all of it', () => {
  // src/lib/ticketTear.ts owns the score. Moving between places no longer
  // tears (owner, 2026-09-28: 地点之间的移动现在不需要撕票根动效): the face
  // tear, its latch-free "tear, then fly" and the pull to tear are gone. The
  // cover clicked plays the stub's tear whole (完整的撕开票根动画), then the
  // story opens.
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  assert.equal(TEAR_FREE_MS, 530);
  assert.equal(TEAR_BEAT_MS, 60);
  assert.equal(TEAR_BEFORE_FLIGHT_MS, TEAR_FREE_MS + TEAR_BEAT_MS);
  assert.ok(TEAR_FREE_MS < TEAR_MS, 'the stub is free before the tear is over');
  assert.match(chapter, /const STORY_AFTER_MS = TEAR_MS;/);
  assert.match(chapter, /\}, reduce \? TEAR_REDUCED_MS : STORY_AFTER_MS\);/);
  for (const gone of ['tearThen', 'archive:tear-then', 'tearClock', 'PULL_GO_AFTER_MS', 'GONE_GO_AFTER_MS', 'handlePullStart', 'pullHint', 'onTearAway', 'is-torn', 'archive-plate--pullable']) {
    assert.ok(!chapter.includes(gone), `${gone} is gone`);
  }
  const css = source('src/styles/global.css');
  assert.doesNotMatch(css, /--pull-hint|archive-plate--pullable|\.archive-plate\.is-torn|archive-plate__lift/);
  // The scroll's latch and its mirrors are gone with the scroll.
  assert.doesNotMatch(chapter, /stepLatch|TEAR_LINE_DOCKED|ticketLatch/);
  assert.doesNotMatch(source('src/components/home/RouteAtlas.tsx'), /TEAR_BEFORE_FLIGHT_MS|TEAR_HOLD_CAP_MS|heldHop/);
  assert.doesNotMatch(source('src/components/home/ArchiveClosing.tsx'), /TEAR_BEFORE_ENDING_MS/);
});

test('the admission: the stub torn off to open the story, the score turned round', () => {
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  assert.match(chapter, /put\(stub, '--tear-stf', reduce \? null : affineCss\(mirrorAffine\(pose\.m, box\.w\)\)\);/);
  // Below the rip's tip the stub is still joined: its seat clips at the seam.
  assert.match(chapter, /put\(stubSeat, 'clip-path', pose\.seam \? STUB_SEAM_CLIP : null\);/);
  // The explorer opens the story once the tear has played (HomePage).
  const home = source('src/components/home/HomePage.tsx');
  assert.match(home, /tearStub\(effect\.id, \(\) => \{/);
  // Its rest box (the half the reader keeps) is read before it tears.
  assert.match(home, /const captured = collection \? captureStory\(collection\) : undefined;/);
  // Mid-switch, the switch ends first: the ticket under this one must not
  // show through the tear's gap.
  const tear = chapter.slice(chapter.indexOf('const tearStubThen = '), chapter.indexOf('const tearStubThenRef'));
  assert.match(tear, /coverDock\.settle\(\);/);
  assert.match(tear, /if \(playRef\.current\) settlePlay\(true\);/);
});

test('every ticket tears on the archive\'s own score', () => {
  // No mirror: the cover imports the score. (The globe egg's ADMIT ONE tore
  // on it too, until the eggs went with the first screen's corner globe.)
  const chapter = source('src/components/home/ArchiveChapter.tsx');
  const importsScore = (text) => /import \{[^}]*\btearPose\b[^}]*\} from '\.\.\/\.\.\/lib\/ticketTear'/.test(text);
  assert.ok(importsScore(chapter), 'ArchiveChapter imports tearPose from ticketTear');
  assert.equal(existsSync(new URL('../src/components/home/GlobeEggs.tsx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/lib/globeEgg.ts', import.meta.url)), false);
});

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
  // A landscape and a portrait face at 1728, and a small ticket.
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
