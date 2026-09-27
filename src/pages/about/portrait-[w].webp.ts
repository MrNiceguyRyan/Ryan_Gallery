import type { APIRoute, GetStaticPaths } from 'astro';
import sharp from 'sharp';
import { sanityClient } from 'sanity:client';
import { fetchSanityWithRetry } from '../../lib/sanityFetch';
import { PORTRAIT_FALLBACK, PORTRAIT_WIDTHS, portraitCropUrl } from '../../lib/aboutPortrait';
import { silverGrade } from '../../lib/silverPrint';

// /about's portrait, printed in the globe's silver once, at build time, one
// file per width (dist/about/portrait-840.webp …). The browser used to grade
// it live through an SVG filter under the droplet's morph, re-rasterising the
// print every frame; now the droplet morphs a plain image, as it did before
// it was silver. The page falls back to the live filter only when the
// portrait is not a Sanity asset (see about.astro).

export const getStaticPaths = (() =>
  PORTRAIT_WIDTHS.map((w) => ({ params: { w: String(w) } }))) satisfies GetStaticPaths;

let source: Promise<string> | null = null;
const portraitSource = () =>
  (source ??= fetchSanityWithRetry(() =>
    sanityClient.fetch<string | null>(`*[_type == "siteSettings"][0].avatar.asset->url`),
  ).then((url) => url || PORTRAIT_FALLBACK));

export const GET: APIRoute = async ({ params }) => {
  const width = Number(params.w);
  const avatar = await portraitSource();
  const crop = portraitCropUrl(avatar, width) ?? portraitCropUrl(PORTRAIT_FALLBACK, width)!;
  const response = await fetchSanityWithRetry(async () => {
    const res = await fetch(crop);
    if (!res.ok) throw new Error(`portrait ${width}: ${res.status} from ${crop}`);
    return res;
  });
  const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  silverGrade(data, info.channels);
  const webp = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .webp({ quality: 84 })
    .toBuffer();
  return new Response(new Uint8Array(webp), { headers: { 'Content-Type': 'image/webp' } });
};
