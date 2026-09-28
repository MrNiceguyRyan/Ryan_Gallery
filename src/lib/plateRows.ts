// ── The Plates: a story's contact strip, set in even rows ──
// The end page of a story (MagazineLayout, EndPage) prints every frame at its
// own ratio, numbered, each opening the viewer. They used to wrap wherever
// the column ran out, so a story one or two frames longer than a row left
// those frames alone on a second one (Orlando: 15 + 2 at 1728px). This is
// the rule that sets them instead: one plate height for the whole strip, in
// the fewest rows that hold it, the frames shared out so the rows come out
// as nearly the same length as the frames allow.
//
// The height is the house's (`--story-plate-h`). When the strip would need
// one row more than it fits in at that height, and a slightly smaller plate
// (no less than `minScale` of it) fits one row fewer, the plates take that
// size instead: a row of seventeen at 93% rather than two of eight and nine.
//
// Pure: MagazineLayout measures the column and the plate height when the
// layout changes (never per frame) and renders the rows it gets back.
// scripts/plate-rows.test.mjs holds it.

export const PLATE_ROWS = {
  /** The smallest share of the house height a strip is set at to save a row. */
  minScale: 0.9,
  /** Allowance per plate (px) for a photograph whose file rounds its width
   *  a little differently from its recorded ratio: a row is only planned to
   *  fit with this much room to spare, so the browser never wraps it. */
  tolerance: 0.3,
} as const;

export interface PlateRows {
  /** How many plates each row holds, top to bottom (they sum to the count). */
  rows: number[];
  /** The plates' height as a share of the house height (1, or a little less
   *  when that saves a row). */
  scale: number;
}

const finiteRatio = (ratio: number) => (Number.isFinite(ratio) && ratio > 0 ? ratio : 1.5);

/**
 * Sets `ratios` (each plate's width / height, in the story's order) in rows
 * `width` px wide, at `height` px (the house height), `gap` px apart.
 * Returns one row of everything when there is nothing to measure against.
 */
export function plateRows(
  ratios: readonly number[],
  height: number,
  width: number,
  gap: number,
  { minScale = PLATE_ROWS.minScale, tolerance = PLATE_ROWS.tolerance } = {},
): PlateRows {
  const n = ratios.length;
  if (!n) return { rows: [], scale: 1 };
  if (!(height > 0) || !(width > 0)) return { rows: [n], scale: 1 };
  const safe = ratios.map(finiteRatio);
  // Prefix sums of the ratios: a row from plate i up to (not including) j
  // is (sum[j] − sum[i]) plate heights of photograph, plus its gaps.
  const sum = [0];
  safe.forEach((ratio, index) => sum.push(sum[index] + ratio));
  const rowWidth = (from: number, to: number, plateHeight: number) =>
    (sum[to] - sum[from]) * plateHeight + gap * (to - from - 1) + tolerance * (to - from);
  const fits = (from: number, to: number, plateHeight: number) => rowWidth(from, to, plateHeight) <= width;

  // A row holds its plates when they fit — or when it is a single plate,
  // which has a row to itself however wide it is.
  const holds = (from: number, to: number, plateHeight: number) => to - from === 1 || fits(from, to, plateHeight);
  // The rows the plates take at a height, filling each row in turn: the
  // fewest any split can manage.
  const greedyRows = (plateHeight: number) => {
    const rows: number[] = [];
    let from = 0;
    while (from < n) {
      let to = from + 1;
      while (to < n && holds(from, to + 1, plateHeight)) to += 1;
      rows.push(to - from);
      from = to;
    }
    return rows;
  };
  const rowsNeeded = (plateHeight: number) => greedyRows(plateHeight).length;
  // The largest share of the house height at which the plates fit in `k`
  // rows (by bisection: fewer rows only ever need smaller plates).
  const largestScale = (k: number) => {
    let lo = 0;
    let hi = 1;
    for (let step = 0; step < 32; step += 1) {
      const mid = (lo + hi) / 2;
      if (rowsNeeded(mid * height) <= k) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  const atHouse = rowsNeeded(height);
  let k = atHouse;
  let scale = 1;
  for (let fewer = 1; fewer < atHouse; fewer += 1) {
    const fit = largestScale(fewer);
    if (fit >= minScale) {
      k = fewer;
      scale = fit;
      break;
    }
  }
  const plateHeight = scale * height;

  // The most even split into exactly k rows that each fit: rows as nearly the
  // same length AND the same number of frames as the frames allow. Each row
  // costs its length squared plus its count's squared, the count taken at an
  // average plate's footprint (`unit`), so a row of six wide frames and one
  // of nine narrow ones do not pass as even. cost[r][j]: the first j plates
  // in r rows.
  const unit = (sum[n] * plateHeight + gap * n) / n;
  const INF = Number.POSITIVE_INFINITY;
  const cost = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(INF));
  const cut = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(-1));
  cost[0][0] = 0;
  for (let r = 1; r <= k; r += 1) {
    for (let j = r; j <= n - (k - r); j += 1) {
      for (let i = r - 1; i < j; i += 1) {
        if (cost[r - 1][i] === INF || !holds(i, j, plateHeight)) continue;
        const length = rowWidth(i, j, plateHeight);
        const count = (j - i) * unit;
        const total = cost[r - 1][i] + length * length + count * count;
        if (total < cost[r][j]) {
          cost[r][j] = total;
          cut[r][j] = i;
        }
      }
    }
  }
  // Never short of a split (k is at most the plates' count, and a split in
  // fewer rows only ever divides further); kept as the row-by-row fill.
  if (cost[k][n] === INF) return { rows: greedyRows(plateHeight), scale };
  const rows: number[] = [];
  for (let r = k, j = n; r > 0; r -= 1) {
    const i = cut[r][j];
    rows.unshift(j - i);
    j = i;
  }
  return { rows, scale };
}
