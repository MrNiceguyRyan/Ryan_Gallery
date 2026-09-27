// Run offline: node --experimental-strip-types --test scripts/globe-egg.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EGG,
  blurAngle,
  bulbLabel,
  bulbSettleAt,
  bulbSettleSpeed,
  bulbWindSpeed,
  calmNext,
  captionArc,
  coastAt,
  coastSpeed,
  composeEgg,
  developAt,
  dragDegrees,
  exposedLabel,
  exposureGain,
  giveAt,
  handBackDecision,
  horizonVisibility,
  mod360,
  nudgeAt,
  nudgeSpeed,
  planBulbStop,
  planBulbTarget,
  planCoast,
  releaseVelocity,
  ticketPlacement,
  TICKET_GUTTER,
  wrap180,
} from '../src/lib/globeEgg.ts';
import { PROLOGUE_TURN, prologueNaturalLongitude } from '../src/lib/globeLook.ts';
import { TEAR_FREE_MS, TEAR_MS, TEAR_TENSION_MS, applyAffine, tearPose } from '../src/lib/ticketTear.ts';
import { STOCK_FALLBACK, TICKET_STOCK, stockPaper, stockStyle } from '../src/lib/ticketStock.ts';

// The six places in homepage chapter order (Miami … New York), lng/lat.
const PLACES = [
  [-80.19, 25.76],
  [-81.38, 28.54],
  [-111.46, 36.91],
  [-113.03, 37.3],
  [-112.19, 37.59],
  [-74.01, 40.71],
].map(([lng, lat]) => ({ lng, lat }));
const TARGET = -80.19;

test('U1 the prologue turn only ever goes one way (west), and ends on the first place', () => {
  for (const drift of [0, 15, 30]) {
    let previous = Infinity;
    for (let step = 0; step <= 1000; step += 1) {
      const q = step / 1000;
      const center = prologueNaturalLongitude(TARGET, q, drift);
      assert.ok(PROLOGUE_TURN.dir * (center - previous) > 0, `drift ${drift}: ${center} at q ${q}`);
      previous = center;
    }
    assert.ok(Math.abs(prologueNaturalLongitude(TARGET, 1, drift) - TARGET) < 1e-9);
  }
});

test('U2 every coast lands a place 14° west of the meridian, in time, leaving at the fling speed', () => {
  for (const sign of [1, -1]) {
    for (const speed of [81, 150, 300, 720]) {
      for (let center = -300; center <= 60; center += 17.3) {
        for (const bulb of [false, true]) {
          const plan = planCoast(sign * speed, center, PLACES, bulb);
          assert.ok(plan.index >= 0);
          const landing = center + plan.dir * plan.D;
          const detent = mod360(landing - (PLACES[plan.index].lng + EGG.LAND_WEST));
          assert.ok(Math.min(detent, 360 - detent) < 1e-6, `landing ${landing} is not a detent`);
          assert.equal(Math.abs(coastAt(plan, center, plan.T) - landing) < 1e-9, true);
          assert.ok(plan.T >= EGG.T_MIN * 1000 - 1e-6);
          assert.ok(plan.T <= (bulb ? EGG.BULB_T_MAX : EGG.T_MAX) * 1000 + 1e-6);
          assert.ok(plan.D >= EGG.MIN_TRAVEL);
          if (plan.p > 1.25 + 1e-9) {
            const initial = (plan.D * plan.p) / (plan.T / 1000);
            assert.ok(Math.abs(initial - speed) / speed < 0.01, `leaves at ${initial}°/s for a ${speed}°/s fling`);
          }
          // Monotonic: a coast never turns back.
          let previous = center;
          for (let t = 0; t <= plan.T; t += plan.T / 60) {
            const x = coastAt(plan, center, t);
            assert.ok(plan.dir * (x - previous) >= -1e-9);
            previous = x;
          }
        }
      }
    }
  }
});

test('U2b repeated flings go round the whole archive, canyons included', () => {
  // The first screen faces India (centre ≈ −260); a reader flings again and
  // again at the same speed. Every place must come up.
  for (const [velocity, center] of [[273, -262], [368, -262], [-273, -262], [420, -262]]) {
    const recent = [];
    const seen = new Set();
    for (let play = 0; play < 12; play += 1) {
      const plan = planCoast(velocity, center, PLACES, false, recent);
      seen.add(plan.index);
      recent.push(plan.index);
      if (recent.length > 4) recent.shift();
    }
    assert.ok(seen.size >= 3, `${velocity}°/s: ${[...seen]}`);
  }
  // Across a spread of fling speeds and both directions, all six.
  const all = new Set();
  const recent = [];
  for (let play = 0; play < 60; play += 1) {
    const velocity = (play % 2 ? -1 : 1) * (120 + ((play * 37) % 560));
    const plan = planCoast(velocity, -262, PLACES, false, recent);
    all.add(plan.index);
    recent.push(plan.index);
    if (recent.length > 4) recent.shift();
  }
  assert.equal(all.size, 6);
  // No memory: the plain nearest-aim detent (the spec's planner).
  const plain = planCoast(273, -262, PLACES);
  assert.equal(plain.index, planCoast(273, -262, PLACES, false, []).index);
});

test('U3 the pin is a smooth max: natural below −w, the pin above w, C¹ at both seams', () => {
  const natural = -200;
  const f = (d) => composeEgg(natural, { offset: 0, pin: natural + d }) - natural;
  const w = EGG.PIN_W;
  assert.equal(f(-w - 0.5), 0);
  assert.equal(f(-50), 0);
  assert.equal(f(w + 0.5), w + 0.5);
  assert.equal(f(80), 80);
  for (const seam of [-w, w]) {
    const h = 1e-6;
    assert.ok(Math.abs(f(seam - h) - f(seam + h)) < 1e-5, `continuous at ${seam}`);
    const left = (f(seam) - f(seam - h)) / h;
    const right = (f(seam + h) - f(seam)) / h;
    assert.ok(Math.abs(left - right) < 1e-3, `C¹ at ${seam}: ${left} vs ${right}`);
  }
  // Without a pin it is the plain offset.
  assert.equal(composeEgg(10, { offset: 5, pin: Number.NaN }), 15);
});

test('U4 hand-back pins what the scroll will overtake, returns the rest the short way', () => {
  // The New York landing measured in the spec: pinned.
  const ny = handBackDecision(206.1, 185.9);
  assert.equal(ny.kind, 'pin');
  assert.ok(Math.abs(ny.d - 206.1) < 1e-9);
  // A westward fling lands the same meridian: pinned at the same d.
  assert.equal(handBackDecision(206.1 - 360, 185.9).kind, 'pin');
  // Nudge-sized: back in RETURN_MS.
  assert.deepEqual(handBackDecision(5, 180), { kind: 'return', from: 5 });
  // Past where the scroll could ever bring it (remaining + slack): back the
  // short way, never the long way round.
  assert.deepEqual(handBackDecision(350, 180), { kind: 'return', from: -10 });
  assert.deepEqual(handBackDecision(-60, 180), { kind: 'return', from: -60 });
  // Within the slack past the end of the turn: pinned (the entrance turns the
  // last few degrees, as it does from any handoff).
  assert.deepEqual(handBackDecision(20, 5), { kind: 'pin', d: 20 });
  assert.equal(handBackDecision(46, 5).kind, 'return');
});

test('U4b the pin and the hand-back follow the prologue\'s own direction (west)', () => {
  const dir = PROLOGUE_TURN.dir;
  const natural = 90;
  const w = EGG.PIN_W;
  // Ahead is west: a pin west of the scroll's turn holds, and lets go once
  // the turn has come w past it.
  const f = (d) => composeEgg(natural, { offset: 0, pin: natural + dir * d }, w, dir) - natural;
  assert.equal(f(w + 0.5), dir * (w + 0.5));
  assert.equal(f(-w - 0.5), 0);
  const h = 1e-6;
  assert.ok(Math.abs(f(w - h) - f(w + h)) < 1e-5);
  // A globe left 60° west of the scroll's turn, with 150° still to turn: pinned there.
  assert.deepEqual(handBackDecision(-60, 150, dir), { kind: 'pin', d: -60 });
  // Left east of it (behind the turn): eased home the short way.
  assert.deepEqual(handBackDecision(40, 150, dir), { kind: 'return', from: 40 });
});

test('the hand: drag mapping, release speed, nudge', () => {
  // Pulling left turns the centre east (the surface follows the hand).
  assert.ok(dragDegrees(-100, 0, -14, 641, 9) > 0);
  assert.ok(Math.abs(dragDegrees(-641, 0, 0, 641, 0) - 180 / Math.PI) < 1e-9);
  // Latitude never changes; the poles widen but never blow up.
  assert.ok(Number.isFinite(dragDegrees(100, 0, 0, 641, 89.9)));
  const samples = [[0, 0], [30, 6], [60, 12], [90, 18]];
  // Only the last 90ms count (the press at t = 0 is 95ms old).
  assert.ok(Math.abs(releaseVelocity(samples, 95) - ((18 - 6) / (95 - 30)) * 1000) < 1e-9);
  // A hand that stopped before letting go throws nothing.
  assert.equal(releaseVelocity(samples, 300), 0);
  assert.equal(releaseVelocity([[0, 0], [1, 400]], 2), 0);
  assert.equal(releaseVelocity([[0, 0], [20, 30], [40, 60]], 41), EGG.VMAX);
  assert.ok(Math.abs(nudgeAt(60, 1e9) - 0.06 * EGG.NUDGE_TAU) < 1e-9);
  assert.equal(nudgeAt(60, 0), 0);
  // The nudge's speed is its own derivative.
  const h = 0.01;
  assert.ok(Math.abs((nudgeAt(60, 200 + h) - nudgeAt(60, 200 - h)) / (2 * h) * 1000 - nudgeSpeed(60, 200)) < 1e-4);
  // The drag's shutter reads a shorter window than the release.
  assert.ok(Math.abs(releaseVelocity([[0, 0], [30, 6], [60, 12], [90, 18]], 95, EGG.SPIN_WINDOW) - ((18 - 12) / (95 - 60)) * 1000) < 1e-9);
});

test('the shutter: the coast\'s speed is its own derivative, the smear is bounded', () => {
  for (const [v, center] of [[300, -262], [-450, -100], [720, 20]]) {
    const plan = planCoast(v, center, PLACES);
    // Leaves at the fling's speed.
    if (plan.p > 1.25 + 1e-9) assert.ok(Math.abs(Math.abs(coastSpeed(plan, 0)) - Math.abs(v)) / Math.abs(v) < 0.01);
    for (let t = 10; t < plan.T - 10; t += plan.T / 17) {
      const h = 0.05;
      const numeric = ((coastAt(plan, center, t + h) - coastAt(plan, center, t - h)) / (2 * h)) * 1000;
      assert.ok(Math.abs(numeric - coastSpeed(plan, t)) < 0.05 * Math.max(1, Math.abs(numeric)), `${numeric} vs ${coastSpeed(plan, t)}`);
    }
    assert.equal(coastSpeed(plan, plan.T), 0);
  }
  assert.equal(blurAngle(0), 0);
  assert.ok(Math.abs(blurAngle(600) - 20) < 1e-9, '600°/s smears 20° at 1/30 s');
  assert.equal(blurAngle(-5000), EGG.BLUR_MAX);
  // The marks go before the smear is full, and never at a still globe.
  assert.ok(EGG.MARKS_CUT > EGG.BLUR_ON[0] && EGG.MARKS_CUT < EGG.BLUR_ON[1]);
  assert.ok(Math.abs(EGG.MARKS_CUT / EGG.SHUTTER_S - 36) < 1e-9, 'cut above 36°/s');
});

test('BULB winds to a real place at least BULB_MIN_R ahead, whatever it was dealt', () => {
  for (let center = -540; center <= 360; center += 7.3) {
    for (const recent of [[], [3], [2, 3], [0, 1, 2, 3], [5, 4, 3, 2]]) {
      const plan = planBulbTarget(center, PLACES, recent);
      assert.ok(plan.index >= 0 && plan.index < PLACES.length);
      assert.ok(plan.D >= EGG.BULB_MIN_R - 1e-9, `${plan.D}° from ${center}`);
      assert.ok(plan.D < 360 + EGG.BULB_MIN_R, 'never more than a lap');
      // It rests BULB_LAND_WEST° west of the centre meridian.
      const detent = mod360(center + plan.D - (PLACES[plan.index].lng + EGG.BULB_LAND_WEST));
      assert.ok(Math.min(detent, 360 - detent) < 1e-6);
    }
  }
  // Nearest ahead: from the India first screen, a canyon place (~171° on).
  const first = planBulbTarget(-260, PLACES);
  assert.ok([2, 3, 4].includes(first.index), `${first.index}`);
  assert.ok(first.D > 160 && first.D < 180, `${first.D}`);
  // A place just dealt costs more: the next press deals round the archive.
  assert.notEqual(planBulbTarget(-260, PLACES, [first.index]).index, first.index);
  // The wind: fast far away, never past its cap, never below its floor.
  assert.equal(bulbWindSpeed(400), EGG.BULB_WIND_MAX);
  assert.equal(bulbWindSpeed(10), EGG.BULB_WIND_MIN);
  assert.ok(bulbWindSpeed(100) > bulbWindSpeed(80));
});

test('BULB settles under the open shutter and completes on release', () => {
  const R0 = 88;
  assert.equal(bulbSettleAt(R0, 0), R0);
  assert.equal(bulbSettleAt(R0, EGG.BULB_SETTLE_S), 0);
  assert.equal(bulbSettleAt(R0, 9), 0);
  let previous = Infinity;
  for (let t = 0; t <= EGG.BULB_SETTLE_S; t += 0.01) {
    const R = bulbSettleAt(R0, t);
    assert.ok(R <= previous + 1e-12);
    previous = R;
    const h = 1e-4;
    const numeric = -(bulbSettleAt(R0, Math.min(EGG.BULB_SETTLE_S, t + h)) - bulbSettleAt(R0, Math.max(0, t - h))) / (Math.min(EGG.BULB_SETTLE_S, t + h) - Math.max(0, t - h));
    assert.ok(Math.abs(numeric - bulbSettleSpeed(R0, t)) < 0.05, `${numeric} vs ${bulbSettleSpeed(R0, t)} at ${t}`);
  }
  for (const [R, omega] of [[40, 120], [3, 300], [0.2, 5], [60, 700], [0, 0], [12, 0]]) {
    const plan = planBulbStop(R, omega, 2);
    assert.ok(plan.p >= 1.25 && Number.isFinite(plan.p));
    assert.ok(plan.T >= EGG.BULB_STOP_T[0] * 1000 - 1e-6 && plan.T <= EGG.BULB_STOP_T[1] * 1000 + 1e-6);
    assert.equal(plan.index, 2);
    const end = coastAt(plan, 0, plan.T);
    assert.ok(Math.abs(end - (R >= 0.01 && omega >= 0.01 ? R : 0)) < 1e-9, 'lands exactly where the settle would have');
    if (plan.D > 0 && plan.p > 1.25 + 1e-9) assert.ok(Math.abs(coastSpeed(plan, 0) - omega) / omega < 0.01, 'leaves at the motor\'s speed');
  }
});

test('BULB develops dark tones first and reads back in its own words', () => {
  // g(t) = 1 + GAIN_K·log2(1 + t/GAIN_T0): 1.60 at 1.2 s, 2.07 at 3.6 s,
  // 2.46 at the 8 s cap.
  assert.ok(Math.abs(exposureGain(1.2) - 1.602) < 0.01);
  assert.ok(Math.abs(exposureGain(3.6) - 2.067) < 0.01);
  assert.ok(Math.abs(exposureGain(8) - 2.46) < 0.02);
  assert.equal(exposureGain(0), 1);
  assert.equal(developAt(1000, 1000), 0);
  assert.equal(developAt(1000 + EGG.DEV_HOLD, 1000), 0);
  assert.ok(Math.abs(developAt(1000 + EGG.DEV_HOLD + EGG.DEV_MS, 1000) - 1) < 1e-9);
  assert.ok(Math.abs(developAt(1000 + EGG.DEV_CALM_MS, 1000, true) - 1) < 1e-9, 'reduced motion: no hold');
  assert.ok(EGG.DEV_POOL_U < EGG.DEV_LAND_U && EGG.DEV_LAND_U < 1);
  assert.equal(bulbLabel(0), 'Bulb · 0.0 s');
  assert.equal(bulbLabel(1.27), 'Bulb · 1.2 s');
  assert.equal(exposedLabel(3.64, -43.4), 'Exposed 3.6 s · 43°');
  // The burn's horizon band.
  assert.equal(horizonVisibility(1, 0.5), 1);
  assert.equal(horizonVisibility(0.4, 0.5), 0);
  assert.ok(Math.abs(horizonVisibility(0.58, 0.5) - 0.5) < 1e-9);
});

test('the give is one tap: it peaks at 110 ms and has settled by 1.1 s', () => {
  let peak = 0;
  let peakAt = 0;
  for (let t = 0; t <= EGG.GIVE.ms; t += 1) {
    const v = giveAt(t);
    assert.ok(v >= 0, 'no oscillation');
    if (v > peak) {
      peak = v;
      peakAt = t;
    }
  }
  assert.equal(peakAt, EGG.GIVE.peakMs);
  assert.ok(Math.abs(peak - EGG.GIVE.amp) < 1e-9);
  assert.ok(giveAt(EGG.GIVE.ms - 1) <= 0.01);
  assert.equal(giveAt(EGG.GIVE.ms), 0);
  assert.equal(giveAt(0), 0);
  assert.ok(Math.abs(giveAt(EGG.GIVE.peakMs, EGG.GIVE.clickAmp) - EGG.GIVE.clickAmp) < 1e-9);
});

test('the caption is engraved on the limb, centred at 136°, ticked at both ends', () => {
  const planet = { x: 1500, y: 980, r: 641 };
  const { R, d, ticks, centre } = captionArc(planet, 180);
  assert.equal(R, 641 + EGG.CAPTION.pad);
  // From 180° to 92°, clockwise on screen (sweep 1), short arc.
  assert.match(d, /^M 831\.0 980\.0 A 669\.0 669\.0 0 0 1 /);
  const at = (deg, radius) => [planet.x + radius * Math.cos((deg * Math.PI) / 180), planet.y - radius * Math.sin((deg * Math.PI) / 180)];
  assert.ok(Math.hypot(centre[0] - at(136, R)[0], centre[1] - at(136, R)[1]) < 1e-9);
  // Each tick is radial, R−9 → R−3, 12px past the words' end.
  const half = ((180 / (2 * R) + 12 / R) * 180) / Math.PI;
  [[ticks[0], 136 + half], [ticks[1], 136 - half]].forEach(([[x1, y1, x2, y2], deg]) => {
    const inner = at(deg, R - 9);
    const outer = at(deg, R - 3);
    assert.ok(Math.hypot(x1 - inner[0], y1 - inner[1]) < 1e-9 && Math.hypot(x2 - outer[0], y2 - outer[1]) < 1e-9);
  });
});

test('the ticket never covers its place, and stays in the viewport', () => {
  for (const [vw, vh] of [[1728, 1000], [1280, 800]]) {
    for (const [w, h] of [[300, 104], [386, 104]]) {
      for (let x = 0; x <= vw; x += 8) {
        for (let y = 60; y <= vh - 40; y += 20) {
          const { tx, ty } = ticketPlacement(x, y, w, h, vw, vh);
          assert.ok(tx >= TICKET_GUTTER && tx + w <= vw - TICKET_GUTTER + 1e-9, `x ${x}: ${tx}`);
          assert.ok(ty >= TICKET_GUTTER && ty + h <= vh - TICKET_GUTTER + 1e-9, `y ${y}: ${ty}`);
          const covers = x >= tx - 12 && x <= tx + w + 12 && y >= ty - 12 && y <= ty + h + 12;
          assert.ok(!covers, `${vw}: the ticket at ${tx},${ty} covers ${x},${y}`);
        }
      }
    }
  }
  // Up and to the right where there is room (New York high on the planet).
  assert.deepEqual(ticketPlacement(1409, 432, 268, 104, 1728, 1000), { tx: 1728 - 268 - TICKET_GUTTER, ty: 282, side: 'right' });
  // High and near the right edge, the clamped ticket would lie on the place:
  // it flips to the left instead.
  assert.deepEqual(ticketPlacement(1600, 100, 300, 104, 1728, 1000), { tx: 1270, ty: TICKET_GUTTER, side: 'left' });
  // Never nearer the edge than the page's own margin (the nav pills' 48px).
  assert.ok(TICKET_GUTTER >= 48);
});

test('the ticket tears on the archive\'s score: the top-left corner drops first', () => {
  // The egg's ADMIT ONE (GlobeEggs) bakes src/lib/ticketTear.ts's own pose; at
  // its size (a 244×104 face) the corner still leads.
  const W = 244;
  const H = 104;
  const frame = { w: W, h: H, vw: W * 2.4 };
  const corners = (ms) => {
    const { m } = tearPose(ms, frame);
    return { left: applyAffine(m, 0, 0), right: applyAffine(m, W, 0) };
  };
  for (let ms = TEAR_TENSION_MS + 20; ms < TEAR_FREE_MS; ms += 10) {
    const { left, right } = corners(ms);
    assert.ok(left[1] > right[1], `${ms}ms: top-left ${left[1]} is not below top-right ${right[1]}`);
  }
  // Probe P8: 300 ms after the click the corner is well down.
  const { left, right } = corners(300);
  assert.ok(left[1] - right[1] >= 4, `${left[1] - right[1]}px`);
  assert.equal(tearPose(TEAR_FREE_MS - 1, frame).seam, true);
  assert.equal(tearPose(TEAR_FREE_MS, frame).seam, false);
  assert.equal(tearPose(TEAR_FREE_MS, frame).tip, 1);
  assert.equal(tearPose(0, frame).tip, 0);
  // Gone by the end of the score, and carried to the left, not dropped.
  const end = tearPose(TEAR_MS, frame);
  assert.ok(end.op < 1e-6);
  assert.ok(applyAffine(end.m, 0, 0)[0] < -50);
});

test('reduced motion deals the chapters in order', () => {
  assert.equal(calmNext(-1, 6), 0);
  assert.equal(calmNext(0, 6), 1);
  assert.equal(calmNext(5, 6), 0);
  assert.equal(calmNext(0, 0), -1);
  assert.equal(wrap180(190), -170);
  assert.equal(wrap180(-190), 170);
});

test('ticket stock: six cards and a fallback, printed through one custom property', () => {
  assert.equal(Object.keys(TICKET_STOCK).length, 6);
  assert.equal(stockPaper('miami'), '#562f2e');
  assert.equal(stockPaper('somewhere-new'), STOCK_FALLBACK);
  assert.equal(stockPaper(undefined), STOCK_FALLBACK);
  assert.deepEqual(stockStyle('new-york-stories'), { '--stub-paper': '#35383e' });
});
