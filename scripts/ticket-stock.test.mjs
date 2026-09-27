// Run offline: node --experimental-strip-types --test scripts/ticket-stock.test.mjs
//
// The guard on the chapters' card stocks (src/lib/ticketStock.ts). A new
// chapter, or a retuned one, has to stay a dark tinted card the photograph
// outshines, carry the shared bone ink at a readable contrast, keep clear of
// the interface's lime, and stay far enough from every other stock that a
// torn stub and the next ticket read as two tickets.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { STOCK_FALLBACK, STOCK_RESERVE, TICKET_STOCK, stockPaper, stockStyle } from '../src/lib/ticketStock.ts';

// ── Colour maths (sRGB ↔ OKLab, WCAG 2 contrast, alpha over paper) ──────────
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (rgb) => {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// Browsers blend in sRGB, and so does this.
const over = (ink, alpha, paper) => ink.map((v, i) => v * alpha + paper[i] * (1 - alpha));
const oklab = (hex) => {
  const [r, g, b] = hexRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};
const oklch = (hex) => {
  const [L, a, b] = oklab(hex);
  const H = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, Math.hypot(a, b), H < 0 ? H + 360 : H];
};
const deltaE = (x, y) => Math.hypot(...oklab(x).map((v, i) => v - oklab(y)[i]));

// ── The ink, read from the stylesheet itself so the test and the page agree ──
const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const token = (name) => {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  assert.ok(match, `global.css defines --${name}`);
  return match[1].trim();
};
const alphaOf = (name) => {
  const match = /rgba\(\s*244,\s*244,\s*237,\s*([\d.]+)\s*\)/.exec(token(name));
  assert.ok(match, `--${name} is bone (244, 244, 237) at an alpha`);
  return Number(match[1]);
};
const INK = hexRgb(token('stub-ink'));
const STOCKS = Object.entries(TICKET_STOCK);
const PRINTED = [...STOCKS, ...STOCK_RESERVE.map((hex, i) => [`reserve ${i + 1}`, hex])];

test('every stock is a six-digit hex and the table holds the six chapters', () => {
  assert.equal(token('stub-ink').toLowerCase(), '#f4f4ed');
  assert.ok(STOCKS.length >= 6);
  for (const [slug, hex] of PRINTED) assert.match(hex, /^#[0-9a-f]{6}$/i, slug);
});

test('small labels (muted ink) read at 4.5:1 or better on every stock', () => {
  const muted = alphaOf('stub-muted');
  const strong = alphaOf('stub-strong');
  for (const [slug, hex] of [...PRINTED, ['fallback', STOCK_FALLBACK]]) {
    const paper = hexRgb(hex);
    const mutedRatio = contrast(over(INK, muted, paper), paper);
    assert.ok(mutedRatio >= 4.5, `${slug}: muted ${mutedRatio.toFixed(2)}:1`);
    assert.ok(contrast(over(INK, strong, paper), paper) > mutedRatio, `${slug}: strong reads above muted`);
  }
});

test('every stock is a dark card in one band, never lime or yellow-green', () => {
  for (const [slug, hex] of PRINTED) {
    const [L, C, H] = oklch(hex);
    assert.ok(L >= 0.32 && L <= 0.4, `${slug}: OKLCH L ${L.toFixed(3)} outside 0.32–0.40`);
    assert.ok(C < 0.015 || H < 95 || H > 140, `${slug}: hue ${H.toFixed(0)}° is lime territory (C ${C.toFixed(3)})`);
  }
});

test('no two stocks are closer than ΔE_ok 0.04', () => {
  for (let i = 0; i < PRINTED.length; i += 1) {
    for (let j = i + 1; j < PRINTED.length; j += 1) {
      const d = deltaE(PRINTED[i][1], PRINTED[j][1]);
      assert.ok(d >= 0.04, `${PRINTED[i][0]} / ${PRINTED[j][0]}: ΔE_ok ${d.toFixed(3)}`);
    }
  }
});

test('stockPaper / stockStyle fall back to the olive for an unknown chapter', () => {
  assert.equal(stockPaper('miami'), TICKET_STOCK.miami);
  assert.equal(stockPaper('a-new-place'), STOCK_FALLBACK);
  assert.equal(stockPaper(null), STOCK_FALLBACK);
  assert.deepEqual(stockStyle('orlando'), { '--stub-paper': TICKET_STOCK.orlando });
});
