// ── The silver print, off the globe and onto paper ──
// /about prints the photographer's portrait in the same darkroom as the
// prologue globe: the picture's luminance mapped through the globe's own
// olive-to-paper ramp (globeLook SILVER_RAMP), not desaturated to a cool grey.
//
// Pure, so scripts/silver-print.test.mjs can hold it. Two readers:
// - `silverTables` is the ramp sampled the way an SVG feComponentTransfer
//   `table` takes it (one list per channel, 0..1), for anything that still
//   grades in the browser;
// - `silverGrade` applies the same grade to raw sRGB pixels, so the portrait
//   endpoint (src/pages/about/portrait-[w].webp.ts) prints it ONCE at build
//   time. A live SVG filter under the droplet's morph re-rasterised the
//   portrait every frame (720 raster tasks per 3 s against 180 without it).
import { SILVER_MIX, SILVER_RAMP } from './globeLook';

type Ramp = ReadonlyArray<readonly [number, string]>;

const channels = (hex: string) => {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** The ramp's colour at `t` (0..1), linear between its stops, 0..255. */
function rampAt(ramp: Ramp, t: number) {
  const x = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < ramp.length - 2 && x > ramp[i + 1][0]) i += 1;
  const [x0, c0] = ramp[i];
  const [x1, c1] = ramp[i + 1];
  const k = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
  const a = channels(c0);
  const b = channels(c1);
  return a.map((v, ch) => v + (b[ch] - v) * k);
}

/** The ramp sampled at i / (samples − 1), one list per channel, in 0..1 to
 *  four decimals: the `tableValues` of an feFuncR / feFuncG / feFuncB. */
export function silverTables(ramp: Ramp = SILVER_RAMP, samples = 21): [number[], number[], number[]] {
  const out: [number[], number[], number[]] = [[], [], []];
  for (let i = 0; i < samples; i += 1) {
    const rgb = rampAt(ramp, i / (samples - 1));
    rgb.forEach((v, ch) => out[ch].push(Math.round((v / 255) * 1e4) / 1e4));
  }
  return out;
}

/**
 * Grades raw 8-bit sRGB pixels in place, exactly as the SVG filter does with
 * color-interpolation-filters="sRGB": luminance by SILVER_MIX on the encoded
 * values, then each channel through its table, piecewise-linear between the
 * samples (feComponentTransfer's `table` rule). Alpha, if any, is left alone.
 */
export function silverGrade(pixels: Uint8Array, channelCount: number, tables = silverTables()) {
  const n = tables[0].length - 1;
  const [wr, wg, wb] = SILVER_MIX;
  for (let p = 0; p + 2 < pixels.length; p += channelCount) {
    const lum = Math.max(0, Math.min(1, (wr * pixels[p] + wg * pixels[p + 1] + wb * pixels[p + 2]) / 255));
    const at = lum * n;
    const k = Math.min(n - 1, Math.floor(at));
    const f = at - k;
    for (let ch = 0; ch < 3; ch += 1) {
      const table = tables[ch];
      pixels[p + ch] = Math.round((table[k] + (table[k + 1] - table[k]) * f) * 255);
    }
  }
  return pixels;
}
