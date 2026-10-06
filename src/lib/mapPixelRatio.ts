// ── The homepage map's resolution: never above 2 device pixels per CSS px ──
// Owner, 2026-10-05: 手机端的使用很不流畅. A phone draws 3 device pixels per
// CSS pixel, and Mapbox drew its whole map at that: 1170 × 2532 pixels of
// photograph, sea, air and type on a 390 × 844 phone, for every frame of
// every drag, pinch, flight and descent — 2.25 times the pixels it draws at
// 2, on the weakest GPU the site meets. Its imagery is Mapbox's @2x satellite
// (a tile pixel is half a CSS pixel), so above 2 it only spends more pixels
// on the same photograph; what the cap softens a little is the map's own
// fine type and lines (the basemap's names, the route's dashes). The
// shields, the covers, the controls and every word of the page are not the
// map's: they stay at the screen's own sharpness. A desktop at 2× (the
// owner's MacBook) is untouched; a 3× desktop is capped like a phone.
//
// mapbox-gl has no option for it: scripts/mapbox-pixel-ratio.mjs patches its
// one devicePixelRatio getter at build time to honour
// `window.__mapboxMaxPixelRatio`, which the atlas sets while it is on the
// page (`holdMapPixelRatio`) — the /travel map, which is not this one, keeps
// the device's own ratio unless it asks for the cap itself.

export const ATLAS_MAX_PIXEL_RATIO = 2;

declare global {
  interface Window {
    /** Read by the patched mapbox-gl (scripts/mapbox-pixel-ratio.mjs): the
     *  most device pixels per CSS pixel any map draws while set. */
    __mapboxMaxPixelRatio?: number;
  }
}

/** Cap every Mapbox map at `ratio` from now on (idempotent). Called in the
 *  atlas's render, before its map is created: react-map-gl creates the map
 *  in an effect of its own, which runs before the atlas's effects. */
export function holdMapPixelRatio(ratio = ATLAS_MAX_PIXEL_RATIO) {
  if (typeof window === 'undefined') return;
  if (window.__mapboxMaxPixelRatio !== ratio) window.__mapboxMaxPixelRatio = ratio;
}

/** The atlas has left the page: maps draw at the device's own ratio again. */
export function releaseMapPixelRatio() {
  if (typeof window === 'undefined') return;
  delete window.__mapboxMaxPixelRatio;
}

/** The ratio a map draws at on this device under the cap. */
export function mapPixelRatio(device: number, ratio = ATLAS_MAX_PIXEL_RATIO) {
  return device > ratio ? ratio : device;
}
