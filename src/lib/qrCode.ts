// ── A QR code, drawn by the site itself ──
// The boarding pass (src/components/home/BoardingPass.tsx) carries a real QR
// code for the archive's address: a visitor with a phone can scan it off the
// screen and take the site with them. It is encoded here, at build time and
// in the browser alike, by a small deterministic encoder — no package, no
// image, the same modules on the server and the client — and drawn as one
// SVG path, crisp at any size.
//
// ISO/IEC 18004, the parts this needs: byte mode (UTF-8), versions 1–6
// (up to 134 bytes at level L), all four error-correction levels,
// Reed–Solomon over GF(256), the eight masks scored by the standard's four
// penalty rules, and the format information. Versions 7 and up (which also
// need version information) are not needed for an address.
//
// Pure, so scripts/boarding-pass.test.mjs can hold it: every block is a valid
// Reed–Solomon codeword, the codewords read back out of the matrix in
// placement order, the format information carries its own BCH check, and the
// function patterns are where a reader looks for them. That it SCANS was
// proven with an independent decoder (macOS CoreImage's CIDetector) on a
// screenshot of the pass.

export type QrEcl = 'L' | 'M' | 'Q' | 'H';

export interface QrCode {
  version: number;
  ecl: QrEcl;
  mask: number;
  size: number;
  /** modules[row][col], true = dark. */
  modules: boolean[][];
  /** The codewords in placement order (data then error correction,
   *  interleaved), for the tests. */
  codewords: number[];
}

// Error correction per version and level: [EC codewords per block,
// [[blocks, data codewords per block], …]] (the standard's table 9).
type BlockPlan = readonly [number, ReadonlyArray<readonly [number, number]>];
const BLOCKS: Record<number, Record<QrEcl, BlockPlan>> = {
  1: { L: [7, [[1, 19]]], M: [10, [[1, 16]]], Q: [13, [[1, 13]]], H: [17, [[1, 9]]] },
  2: { L: [10, [[1, 34]]], M: [16, [[1, 28]]], Q: [22, [[1, 22]]], H: [28, [[1, 16]]] },
  3: { L: [15, [[1, 55]]], M: [26, [[1, 44]]], Q: [18, [[2, 17]]], H: [22, [[2, 13]]] },
  4: { L: [20, [[1, 80]]], M: [18, [[2, 32]]], Q: [26, [[2, 24]]], H: [16, [[4, 9]]] },
  5: { L: [26, [[1, 108]]], M: [24, [[2, 43]]], Q: [18, [[2, 15], [2, 16]]], H: [22, [[2, 11], [2, 12]]] },
  6: { L: [18, [[2, 68]]], M: [16, [[4, 27]]], Q: [24, [[4, 19]]], H: [28, [[4, 15]]] },
};
export const QR_MAX_VERSION = 6;
const ECL_BITS: Record<QrEcl, number> = { L: 1, M: 0, Q: 3, H: 2 };

export function qrPlan(version: number, ecl: QrEcl) {
  const [ec, groups] = BLOCKS[version][ecl];
  const blocks = groups.flatMap(([count, data]) => Array.from({ length: count }, () => data));
  const data = blocks.reduce((sum, n) => sum + n, 0);
  return { ec, blocks, data, total: data + ec * blocks.length };
}

// ── GF(256), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11d) ──
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}
export const gfMul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
export const gfPow = (i: number) => EXP[((i % 255) + 255) % 255];

/** The generator polynomial of `degree`, highest power first (leading 1). */
function generator(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j += 1) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

/** The Reed–Solomon remainder (the EC codewords) of `data`. */
export function rsRemainder(data: readonly number[], degree: number): number[] {
  const divisor = generator(degree).slice(1);
  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < degree; i += 1) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

// ── Data: byte mode ──
function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function dataCodewords(bytes: readonly number[], version: number, capacity: number): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((byte) => push(byte, 8));
  const room = capacity * 8;
  push(0, Math.min(4, room - bits.length));
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    out.push(byte);
  }
  for (let pad = 0xec; out.length < capacity; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** Split into blocks, add each block's EC, interleave. */
function interleave(data: readonly number[], version: number, ecl: QrEcl): number[] {
  const plan = qrPlan(version, ecl);
  const blocks: number[][] = [];
  let at = 0;
  plan.blocks.forEach((length) => {
    blocks.push(data.slice(at, at + length));
    at += length;
  });
  const ecBlocks = blocks.map((block) => rsRemainder(block, plan.ec));
  const out: number[] = [];
  const longest = Math.max(...plan.blocks);
  for (let i = 0; i < longest; i += 1) blocks.forEach((block) => i < block.length && out.push(block[i]));
  for (let i = 0; i < plan.ec; i += 1) ecBlocks.forEach((block) => out.push(block[i]));
  return out;
}

// ── The matrix ──
function alignmentCentres(version: number, size: number): number[] {
  return version < 2 ? [] : [6, size - 7];
}

/** The 15 format bits (level and mask, BCH(15,5), masked with 0x5412). */
export function formatBits(ecl: QrEcl, mask: number): number {
  const data = (ECL_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

/** Where the two copies of format bit i sit: [row, col] pairs. */
export function formatPositions(size: number): Array<[[number, number], [number, number]]> {
  const out: Array<[[number, number], [number, number]]> = [];
  for (let i = 0; i < 15; i += 1) {
    const first: [number, number] = i <= 5 ? [i, 8] : i === 6 ? [7, 8] : i === 7 ? [8, 8] : i === 8 ? [8, 7] : [8, 14 - i];
    const second: [number, number] = i < 8 ? [8, size - 1 - i] : [size - 15 + i, 8];
    out.push([first, second]);
  }
  return out;
}

const MASKS: ReadonlyArray<(row: number, col: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];
export const maskAt = (mask: number, row: number, col: number) => MASKS[mask](row, col);

interface Grid {
  size: number;
  modules: boolean[][];
  fn: boolean[][];
}

function blankGrid(version: number): Grid {
  const size = 17 + 4 * version;
  const make = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const grid: Grid = { size, modules: make(), fn: make() };
  const set = (row: number, col: number, dark: boolean) => {
    if (row < 0 || col < 0 || row >= size || col >= size) return;
    grid.modules[row][col] = dark;
    grid.fn[row][col] = true;
  };
  // Timing patterns.
  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Finder patterns and their separators.
  const finder = (row: number, col: number) => {
    for (let dr = -4; dr <= 4; dr += 1) {
      for (let dc = -4; dc <= 4; dc += 1) {
        const d = Math.max(Math.abs(dr), Math.abs(dc));
        set(row + dr, col + dc, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(3, size - 4);
  finder(size - 4, 3);
  // Alignment patterns (not over a finder).
  const centres = alignmentCentres(version, size);
  const last = centres.length - 1;
  centres.forEach((row, i) => {
    centres.forEach((col, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) set(row + dr, col + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    });
  });
  // Reserve the format areas (written per mask) and the dark module.
  formatPositions(size).forEach(([a, b]) => {
    set(a[0], a[1], false);
    set(b[0], b[1], false);
  });
  set(size - 8, 8, true);
  return grid;
}

/** The data modules in placement order (the zigzag), as [row, col]. */
export function dataPositions(grid: { size: number; fn: boolean[][] }): Array<[number, number]> {
  const { size, fn } = grid;
  const out: Array<[number, number]> = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (!fn[row][col]) out.push([row, col]);
      }
    }
  }
  return out;
}

function penalty(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;
  // N1: runs of five or more in a row or column.
  const runs = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < size; i += 1) {
      let run = 1;
      for (let j = 1; j <= size; j += 1) {
        if (j < size && get(i, j) === get(i, j - 1)) run += 1;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
    }
  };
  runs((r, c) => modules[r][c]);
  runs((c, r) => modules[r][c]);
  // N2: 2×2 blocks of one colour.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
    }
  }
  // N3: a finder-like 1:1:3:1:1 with four light modules on a side (the
  // quiet zone counts as light).
  const A = [true, false, true, true, true, false, true, false, false, false, false];
  const B = [false, false, false, false, true, false, true, true, true, false, true];
  const at = (get: (i: number, j: number) => boolean, i: number, j: number) => (j < 0 || j >= size ? false : get(i, j));
  const finders = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < size; i += 1) {
      for (let j = -4; j < size; j += 1) {
        if (A.every((v, k) => at(get, i, j + k) === v)) score += 40;
        if (B.every((v, k) => at(get, i, j + k) === v)) score += 40;
      }
    }
  };
  finders((r, c) => modules[r][c]);
  finders((c, r) => modules[r][c]);
  // N4: the share of dark modules away from half.
  let dark = 0;
  modules.forEach((row) => row.forEach((v) => v && (dark += 1)));
  const total = size * size;
  score += 10 * (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1);
  return score;
}

/** Encode `text` (UTF-8, byte mode) at level `ecl` in the smallest version
 *  that holds it, masked with the best-scoring mask (or `mask` if given). */
export function encodeQr(text: string, ecl: QrEcl = 'M', mask?: number): QrCode {
  const bytes = utf8(text);
  let version = 0;
  for (let v = 1; v <= QR_MAX_VERSION; v += 1) {
    const need = 4 + 8 + bytes.length * 8;
    if (need <= qrPlan(v, ecl).data * 8) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error(`QR: ${bytes.length} bytes do not fit version ${QR_MAX_VERSION}-${ecl}`);
  const plan = qrPlan(version, ecl);
  const codewords = interleave(dataCodewords(bytes, version, plan.data), version, ecl);
  const base = blankGrid(version);
  const positions = dataPositions(base);
  const place = (m: number) => {
    const modules = base.modules.map((row) => row.slice());
    positions.forEach(([row, col], i) => {
      const bit = i < codewords.length * 8 ? ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
      modules[row][col] = bit !== maskAt(m, row, col);
    });
    const bits = formatBits(ecl, m);
    formatPositions(base.size).forEach(([a, b], i) => {
      const dark = ((bits >>> i) & 1) === 1;
      modules[a[0]][a[1]] = dark;
      modules[b[0]][b[1]] = dark;
    });
    modules[base.size - 8][8] = true;
    return modules;
  };
  let best = mask ?? 0;
  let bestModules = place(best);
  if (mask == null) {
    let bestScore = penalty(bestModules);
    for (let m = 1; m < 8; m += 1) {
      const modules = place(m);
      const score = penalty(modules);
      if (score < bestScore) {
        best = m;
        bestModules = modules;
        bestScore = score;
      }
    }
  }
  return { version, ecl, mask: best, size: base.size, modules: bestModules, codewords };
}

/** The dark modules as one SVG path (module = 1 unit; `quiet` modules of
 *  light margin round it), horizontal runs merged. */
export function qrPath(code: Pick<QrCode, 'modules'>, quiet = 0): string {
  const parts: string[] = [];
  code.modules.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c += 1;
        continue;
      }
      let run = 1;
      while (c + run < row.length && row[c + run]) run += 1;
      parts.push(`M${c + quiet} ${r + quiet}h${run}v1h-${run}z`);
      c += run;
    }
  });
  return parts.join('');
}
