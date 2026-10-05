// ── A cap on Mapbox's resolution (build time) ──
// mapbox-gl 3 has no `pixelRatio` option: it sizes its canvas, its viewport
// and its type from one getter in its browser utilities,
//   get devicePixelRatio(){return window.devicePixelRatio}
// read live, every frame. This build-time patch makes that getter honour a
// cap the page may set on `window.__mapboxMaxPixelRatio` (a positive number;
// none: the device's own ratio, as before). The homepage's atlas sets it
// while it is on the page (src/lib/mapPixelRatio.ts): the phone's map drew
// 3 device pixels per CSS pixel, 2.25 times the pixels of 2, for every frame.
//
// The patch is exact or the build fails: if a new mapbox-gl reshapes the
// getter, `npm run build` stops here (and scripts/map-pixel-ratio.test.mjs
// fails), rather than the cap silently doing nothing.
//
// Only the production bundle is patched. `astro dev` pre-bundles mapbox-gl
// with esbuild, which this Vite transform does not see: the dev server's map
// draws at the device's full ratio.

export const MAPBOX_DPR_GETTER = 'get devicePixelRatio(){return window.devicePixelRatio}';
export const MAPBOX_DPR_PATCHED =
  'get devicePixelRatio(){var r=window.devicePixelRatio,c=window.__mapboxMaxPixelRatio;return typeof c==="number"&&c>0&&r>c?c:r}';

/** The patched source, or null when the getter is not there exactly once. */
export function patchMapboxPixelRatio(code) {
  const at = code.indexOf(MAPBOX_DPR_GETTER);
  if (at < 0 || code.indexOf(MAPBOX_DPR_GETTER, at + MAPBOX_DPR_GETTER.length) >= 0) return null;
  return code.slice(0, at) + MAPBOX_DPR_PATCHED + code.slice(at + MAPBOX_DPR_GETTER.length);
}

/** mapbox-gl's own bundle (its `main`, the UMD build Rollup takes) — the
 *  file itself, not the CommonJS plugin's wrappers of it (`?commonjs-…`). */
export function isMapboxBundle(id) {
  return !id.includes('?') && /[\\/]node_modules[\\/]mapbox-gl[\\/]dist[\\/]mapbox-gl\.js$/.test(id);
}

export default function mapboxPixelRatio() {
  return {
    name: 'gallery:mapbox-pixel-ratio',
    enforce: 'pre',
    transform(code, id) {
      if (!isMapboxBundle(id)) return null;
      const patched = patchMapboxPixelRatio(code);
      if (!patched) {
        this.error('mapbox-gl: its devicePixelRatio getter has changed shape; scripts/mapbox-pixel-ratio.mjs cannot cap the map\'s resolution. Update MAPBOX_DPR_GETTER.');
      }
      return { code: patched, map: null };
    },
    // Nothing ships unpatched: a bundle that still carries the plain getter
    // (the file reached under another id) fails the build too.
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.code.includes(MAPBOX_DPR_GETTER)) {
          this.error(`mapbox-gl reached ${chunk.fileName} unpatched: the map's resolution cap would do nothing (scripts/mapbox-pixel-ratio.mjs).`);
        }
      }
    },
  };
}
