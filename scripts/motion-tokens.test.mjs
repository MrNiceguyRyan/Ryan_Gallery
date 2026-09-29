// Run offline: node --experimental-strip-types --test scripts/motion-tokens.test.mjs
//
// The guard on the site's motion vocabulary: the `:root` Motion block in
// src/styles/global.css and its mirror, src/lib/motion.ts. An undefined
// custom property in a transition shorthand does not fall back to anything —
// the whole transition is dropped and the move hard-cuts, with no error
// anywhere — so every var(--ease-*) and var(--dur-*) under src/ has to be one
// the block defines. The two copies have to agree, or a CSS hover and a
// framer landing drift apart, and no other file may write a token's curve out
// by hand (it names the token instead). And Tailwind 4 owns --ease-in, --ease-out and
// --ease-in-out (its ease-in/ease-out utilities read them), so redefining one
// would quietly restyle every element that uses those utilities.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CSS_EASE, DUR, DUR_MS, EASE, smootherstep, voyageEase } from '../src/lib/motion.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = /\.(css|astro|tsx?|jsx?|mjs|mdx)$/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return SOURCE.test(entry.name) ? [path] : [];
  });
}

const files = walk(join(ROOT, 'src')).map((path) => ({
  path: relative(ROOT, path),
  text: readFileSync(path, 'utf8'),
}));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** The Motion block: the top-level `:root` rule in global.css that declares
 *  --ease-arrive. Returns its --ease-* and --dur-* declarations. */
function motionBlock() {
  const css = readFileSync(join(ROOT, 'src/styles/global.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/(?<=(?:^|\})\s*):root\s*\{([^{}]*)\}/g)].map((m) => m[1]);
  const body = rules.find((rule) => /--ease-arrive\s*:/.test(rule));
  assert.ok(body, 'global.css has a top-level :root block that declares --ease-arrive');
  const tokens = new Map();
  for (const [, name, value] of body.matchAll(/(--(?:ease|dur)-[\w-]+)\s*:\s*([^;]+);/g)) {
    assert.ok(!tokens.has(name), `${name} is declared once in the Motion block`);
    tokens.set(name, value.trim());
  }
  return tokens;
}

const tokens = motionBlock();
const bezier = (value) => {
  const match = /^cubic-bezier\(([^)]*)\)$/.exec(value);
  assert.ok(match, `${value} is a cubic-bezier()`);
  return match[1].split(',').map((n) => Number(n.trim()));
};

/** Every motion token a source text reads: var(--x, …) in CSS, inline styles
 *  and scripts, and Tailwind 4's shorthand utilities such as ease-(--x). */
const motionUses = (text) =>
  [...text.matchAll(/var\(\s*(--(?:ease|dur)-[\w-]+)|\((--(?:ease|dur)-[\w-]+)\)/g)].map((match) => ({
    name: match[1] ?? match[2],
    index: match.index,
  }));

test('(a) every var(--ease-*) and var(--dur-*) under src/ is defined in the Motion block', () => {
  // The scanner itself: it has to see the kinds of use a component writes.
  assert.deepEqual(
    motionUses('transition: opacity 1s var(--ease-nope); a { transition-duration: var( --dur-in ,200ms) } <b class="ease-(--ease-leave)">').map((use) => use.name),
    ['--ease-nope', '--dur-in', '--ease-leave'],
  );
  const undefinedUses = [];
  for (const { path, text } of files) {
    for (const { name, index } of motionUses(text)) {
      if (!tokens.has(name)) undefinedUses.push(`${path}:${lineOf(text, index)} ${name}`);
    }
  }
  assert.deepEqual(undefinedUses, [], `undefined motion tokens (the transition would hard-cut):\n${undefinedUses.join('\n')}`);
});

test('(b) src/lib/motion.ts mirrors the Motion block exactly', () => {
  const cssEase = [...tokens.keys()].filter((name) => name.startsWith('--ease-')).sort();
  const cssDur = [...tokens.keys()].filter((name) => name.startsWith('--dur-')).sort();
  assert.deepEqual(cssEase, Object.keys(EASE).map((name) => `--ease-${name}`).sort(), 'the same curves on both sides');
  assert.deepEqual(cssDur, Object.keys(DUR_MS).map((name) => `--dur-${name}`).sort(), 'the same durations on both sides');

  for (const [name, curve] of Object.entries(EASE)) {
    const value = tokens.get(`--ease-${name}`);
    assert.deepEqual(bezier(value), [...curve], `--ease-${name} equals EASE.${name}`);
    assert.equal(CSS_EASE[name], value, `CSS_EASE.${name} is written exactly as the block writes it`);
  }
  for (const [name, ms] of Object.entries(DUR_MS)) {
    assert.equal(tokens.get(`--dur-${name}`), `${ms}ms`, `--dur-${name} equals DUR_MS.${name}`);
    assert.equal(DUR[name], ms / 1000, `DUR.${name} is DUR_MS.${name} in seconds`);
  }
  assert.deepEqual(Object.keys(DUR), Object.keys(DUR_MS));
});

test('(c) --ease-in, --ease-out and --ease-in-out are never defined under src/', () => {
  const css = /(?<![\w-])--ease-(?:in|out|in-out)\s*:/g;
  const script = /['"`]--ease-(?:in|out|in-out)['"`]/g;
  const found = [];
  for (const { path, text } of files) {
    const bare = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
    for (const match of bare.matchAll(css)) found.push(`${path}:${lineOf(bare, match.index)}`);
    for (const match of text.matchAll(script)) found.push(`${path}:${lineOf(text, match.index)}`);
  }
  assert.deepEqual(found, [], `Tailwind's own ease tokens redefined at:\n${found.join('\n')}`);
});

test('(d) no file writes out a copy of a token curve: it names the token', () => {
  // A copied curve drifts the day the token is retuned, and the hover and the
  // landing stop being the same hand. The one written-out copy allowed is the
  // page fall's fade in Layout.astro: a var() inside a @keyframes rule is not
  // resolved there (see its comment), so it spells --ease-fade out.
  const allowed = new Set(['src/layouts/Layout.astro fade']);
  const curves = Object.entries(EASE);
  const literal = /cubic-bezier\(\s*([^)]*)\)|cubicBezier\(\s*([^)]*)\)|\[\s*(-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+)\s*\]/g;
  const found = [];
  for (const { path, text } of files) {
    if (path === join('src', 'lib', 'motion.ts')) continue;
    for (const match of text.matchAll(literal)) {
      const numbers = (match[1] ?? match[2] ?? match[3]).split(',').map((n) => Number(n.trim()));
      if (numbers.length !== 4 || numbers.some(Number.isNaN)) continue;
      const hit = curves.find(([, curve]) => curve.every((value, i) => value === numbers[i]));
      if (!hit) continue;
      // The Motion block's own definitions.
      const line = text.slice(text.lastIndexOf('\n', match.index) + 1, match.index);
      if (path === join('src', 'styles', 'global.css') && new RegExp(`--ease-${hit[0]}\\s*:\\s*$`).test(line)) continue;
      if (allowed.has(`${path} ${hit[0]}`)) continue;
      found.push(`${path}:${lineOf(text, match.index)} EASE.${hit[0]}`);
    }
  }
  assert.deepEqual(found, [], `token curves written out instead of named (use var(--ease-*), EASE or CSS_EASE):\n${found.join('\n')}`);
});

test('every curve is one a browser accepts, and the leaving curves ease in', () => {
  for (const [name, [x1, , x2]] of Object.entries(EASE)) {
    // cubic-bezier() with an x outside 0..1 is invalid CSS: the transition is dropped.
    assert.ok(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1, `EASE.${name} keeps x1 and x2 in 0..1`);
  }
  // Falls and fade-outs ease IN: they start from rest and are always behind
  // a linear clock, so they leave fastest.
  const at = ([x1, y1, x2, y2], x) => {
    const b = (p1, p2, t) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (b(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return b(y1, y2, (lo + hi) / 2);
  };
  for (const name of ['leave', 'fade']) {
    assert.equal(EASE[name][1], 0, `EASE.${name} starts flat`);
    for (let x = 0.05; x < 1; x += 0.05) assert.ok(at(EASE[name], x) < x, `EASE.${name} eases in at ${x.toFixed(2)}`);
  }
  for (const ms of Object.values(DUR_MS)) assert.ok(Number.isInteger(ms) && ms > 0);
});

test('the voyage\'s sine is the explorer\'s: its flights and its entry turn ride it', () => {
  const sine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  for (let t = 0; t <= 1; t += 0.0625) assert.equal(voyageEase(t), sine(t));
  // The page no longer scrolls on a voyage (the homepage is a map to roam):
  // the voyage's clock went with it.
  const home = readFileSync(join(ROOT, 'src/components/home/HomePage.tsx'), 'utf8');
  assert.doesNotMatch(home, /voyageSeconds|lenis\.scrollTo/);
  const camera = readFileSync(join(ROOT, 'src/lib/explorerCamera.ts'), 'utf8');
  assert.match(camera, /import \{ voyageEase \} from '\.\/motion\.ts';/);
  const atlas = readFileSync(join(ROOT, 'src/components/home/RouteAtlas.tsx'), 'utf8');
  assert.match(atlas, /easing: voyageEase,/);
});

test('smootherstep is the quintic the scroll-owned values share', () => {
  assert.equal(smootherstep(0), 0);
  assert.equal(smootherstep(1), 1);
  assert.equal(smootherstep(0.5), 0.5);
  const quintic = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let t = 0; t <= 1; t += 0.05) assert.equal(smootherstep(t), quintic(t));
  // Flat at both ends: a value tied to the wheel starts and stops without a kick.
  assert.ok(smootherstep(0.001) < 1e-8 && 1 - smootherstep(0.999) < 1e-8);
});
