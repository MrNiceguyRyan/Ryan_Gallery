// ── /about's portrait: the crop it is drawn at ──
// The droplet is 4:5 and the source photograph is 3:2 with the portrait on
// its right. Drawing the whole 3:2 file with object-fit: cover threw most of
// it away and left the part that shows upscaled. Sanity is asked for the 4:5
// rectangle itself instead — the same pixels object-position: right showed —
// at the widths the droplet is drawn at (240px on a desktop, 192 on a phone,
// 1x to 3x).

/** The portrait when siteSettings has none (today it has none). */
export const PORTRAIT_FALLBACK =
  'https://cdn.sanity.io/images/z610fooo/production/926d2d1c1fcba0de3a1b45fd60b64e7fce7ce650-3300x2200.jpg';

/** The requested widths: 192 and 240px drawn, at 1x to 3x. */
export const PORTRAIT_WIDTHS = [240, 384, 480, 576, 720] as const;

/** What the droplet is drawn at, for the browser's pick from the widths. */
export const PORTRAIT_SIZES = '(min-width: 768px) 240px, 192px';

const FILE_DIMS = /-(\d+)x(\d+)\.[a-z]+$/i;

/**
 * The 4:5 crop of a Sanity asset at `width`. A wide source is cut from its
 * right edge, where the portrait sits; a tall one from its middle. Null for a
 * URL that is not a Sanity image with its dimensions in the file name.
 */
export function portraitCropUrl(url: string, width: number): string | null {
  const base = url.split('?')[0];
  if (!base.includes('cdn.sanity.io/images/')) return null;
  const match = FILE_DIMS.exec(base);
  if (!match) return null;
  const W = Number(match[1]);
  const H = Number(match[2]);
  if (!(W > 0 && H > 0)) return null;
  const wide = W / H > 0.8;
  const cw = wide ? Math.round(H * 0.8) : W;
  const ch = wide ? H : Math.round(W * 1.25);
  const x = wide ? W - cw : 0;
  const y = wide ? 0 : Math.round((H - ch) / 2);
  return `${base}?rect=${x},${y},${cw},${ch}&w=${width}&h=${Math.round(width * 1.25)}&fit=crop&auto=format&q=82`;
}
