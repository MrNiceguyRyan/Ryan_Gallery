// ── The travel plate: a /travel ticket's photograph grown over its story ──
// Opening a story from its ticket on /travel grows the ticket's photograph
// to full bleed across the page change (a view transition MapboxMap names),
// holds it there a beat and lets it go to the story's front page — the
// grammar of a homepage plate, which lands and gives way to its terrain. The
// story's front page then holds from that moment (MagazineLayout), as a
// plate's front page holds from its landing, so the title is read before it
// peels. The two sides are islands on two pages, so the hand-off is one
// attribute on <html>: when (on the performance.now() clock) the photograph
// starts to give way. Astro clears it with the next page change; the plate
// clears it itself once it has gone.

import { DUR_MS } from './motion';

/** The grown photograph holds at full bleed this long… */
export const TRAVEL_PLATE_HOLD_MS = 180;
/** …then gives way to the front page over this (an ink fade, eased in). */
export const TRAVEL_PLATE_RELEASE_MS = DUR_MS.out;

const UNTIL = 'data-travel-plate-until';

export function markTravelPlate(releaseAt: number) {
  document.documentElement.setAttribute(UNTIL, String(Math.round(releaseAt)));
}

export function clearTravelPlate() {
  document.documentElement.removeAttribute(UNTIL);
}

/** Milliseconds until a travel plate over this page starts to give way; 0
 *  when there is none (or it already has). */
export function travelPlateLeft(now = performance.now()) {
  if (typeof document === 'undefined') return 0;
  const at = Number(document.documentElement.getAttribute(UNTIL));
  return Number.isFinite(at) && at > 0 ? Math.max(0, at - now) : 0;
}
