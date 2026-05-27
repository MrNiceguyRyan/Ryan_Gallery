import type { SanityImagePalette } from '../types';

export interface AccentRGB {
  r: number;
  g: number;
  b: number;
}

/** Neutral fallback — same color the homepage already uses for chrome
 *  accents (white/40 on bg-[#0A0A0A]). Returned when no palette resolves. */
export const ACCENT_NEUTRAL: AccentRGB = { r: 255, g: 255, b: 255 };

/**
 * Extract a single accent RGB triple from Sanity's auto-extracted image palette.
 *
 * The homepage runs on a near-black background, so we prefer swatches that
 * stay readable against `#0A0A0A`. The fallback chain is:
 *   `vibrant` → `lightVibrant` → `muted` → `dominant` → white
 *
 * `darkMuted` / `darkVibrant` are intentionally NOT preferred — on a dark
 * page they vanish into the background.
 */
export function accentFromPalette(
  palette: SanityImagePalette | null | undefined,
): AccentRGB {
  if (!palette) return ACCENT_NEUTRAL;
  const swatch =
    palette.vibrant ??
    palette.lightVibrant ??
    palette.muted ??
    palette.dominant ??
    null;
  if (!swatch?.background) return ACCENT_NEUTRAL;
  return hexToRgb(swatch.background) ?? ACCENT_NEUTRAL;
}

/** Tiny hex → {r,g,b}. Returns null on malformed input.
 *  Supports `#rgb`, `#rrggbb`, with or without the leading hash. */
function hexToRgb(hex: string): AccentRGB | null {
  let h = hex.replace(/^#/, '').trim();
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
