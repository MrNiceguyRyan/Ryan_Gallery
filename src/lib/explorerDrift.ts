// ── Letting go of a place the reader has left, and coming back to it ──
// Owner, 2026-09-29 (a screenshot: the globe dragged far from Florida, empty
// dark planet on screen, and still the Miami ticket, the rail's MIAMI and its
// lede): 这里有个问题，我飞出去了很远依旧显示miami，修复这个反逻辑问题，同时增加
// 一个重定位的功能. The ticket and the rail say what the reader is LOOKING AT:
//  - HOLD: while the reader's own drag or zoom keeps the place in hand in
//    what they see — its shield on the open map, or two thirds of its
//    ticket — the ticket rides with its shield as before (a look round the
//    neighbours is not a leaving; the place need not stay on its dock);
//  - LET GO: once their hand takes it out of view — the shield off the map
//    (off the screen, under the nav's band or the rail) with less than two
//    thirds of its ticket still showing, or over the planet's limb — the
//    place is let go, as a click on the empty map lets it go: the ticket
//    fades as it rides away (no tear), the rail says what the archive is,
//    the place's labels clear;
//  - OFFER: nothing in hand and the map come to rest (its moveend — never
//    mid-drag) with a place near the middle of the view, that place's shield
//    lifts and prints its name, quietly. Nothing switches without a click:
//    a ticket that arrived by itself under a moving hand would be the same
//    surprise the other way round;
//  - RECENTRE: the view drifted from the place in hand (moved, or zoomed
//    off its rest), or nothing in hand at all, a Recentre control (and the
//    R key) flies back — the switch's own move — to the place in hand, else
//    the last one held, else stop 01, and its ticket docks again.
// Our own flights never let go of anything: only the reader's moves are
// read (RouteAtlas, `flying` excluded). Everything is DERIVED from the map's
// projection of the places on its move events and from the viewport and
// the dock's plan — never a rect read off the page. Pure, so
// scripts/explorer-drift.test.mjs can hold the maths.

import type { Box, Point } from './coverDock.ts';

export const DRIFT = {
  /** The ticket still holds its place while this share of it shows on the
   *  open map (its shield may already be under the rail or off the edge).
   *  Two thirds: at a half, a ticket dragged towards the rail was held with
   *  its shield at the screen's edge and its print half under the rail's
   *  words (traced at 1728: Miami's foot at x 1698, the plate 758–1666). */
  plateShare: 0.67,
  /** The open map on the desktop: below the nav's band (a shield's foot
   *  higher than this leaves the shield itself off the top), above a strip
   *  at the foot, left of the rail (the atlas prints no shield under it). */
  navBand: 48,
  footBand: 16,
  /** The planet's limb, less this many degrees of margin (the camera's
   *  pitch moves the true limb a little; better let go a touch early than
   *  keep a ticket for a place on the far side). */
  limbMarginDeg: 6,
  /** The view has drifted from the place in hand (Recentre offered) once
   *  its shield's foot is this far from the dock's point, px… */
  offPx: 24,
  /** …or the zoom this far from its rest, levels. */
  offZoom: 0.3,
  /** A place is offered (the map at rest, nothing in hand) when its foot
   *  stands within this share of the view's smaller side of the view's
   *  middle. */
  offer: 0.16,
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Great-circle angle between two [lng, lat] points, degrees. */
export function arcDeg(a: readonly [number, number], b: readonly [number, number]): number {
  const rad = Math.PI / 180;
  const la1 = a[1] * rad;
  const la2 = b[1] * rad;
  const dLat = la2 - la1;
  const dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / rad;
}

/** The planet's limb as seen from the camera, degrees of arc from the point
 *  under it: the globe's radius at `zoom` (Mapbox: a world of 512·2^zoom px
 *  round the equator) seen from `distancePx` above its surface (Mapbox's
 *  camera: 1.5 canvas heights) — acos(R / (R + d)). Past it a place is on
 *  the far side of the planet. */
export function limbDeg(zoom: number, distancePx: number): number {
  const radius = (512 * 2 ** zoom) / (2 * Math.PI);
  return (Math.acos(radius / (radius + Math.max(1, distancePx))) * 180) / Math.PI;
}

/** A place is over the limb (on the planet's far side) from a camera over
 *  `centre` at `zoom`: a margin short of it (DRIFT.limbMarginDeg). */
export function overLimb(place: readonly [number, number], centre: readonly [number, number], zoom: number, distancePx: number): boolean {
  return arcDeg(place, centre) > limbDeg(zoom, distancePx) - DRIFT.limbMarginDeg;
}

/** The share of `box` inside `view` (0 – 1). */
export function shareIn(box: Box, view: Box): number {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  if (!(w > 0 && h > 0)) return 0;
  const x = Math.max(0, Math.min(box.right, view.right) - Math.max(box.left, view.left));
  const y = Math.max(0, Math.min(box.bottom, view.bottom) - Math.max(box.top, view.top));
  return (x * y) / (w * h);
}

/** The open map on the desktop, viewport px: the screen below the nav's
 *  band and left of the rail (`railLeft`, src/lib/coverDock.ts railBox). */
export function mapView(vw: number, vh: number, railLeft: number): Box {
  return { left: 0, top: DRIFT.navBand, right: clamp(railLeft, 1, vw), bottom: vh - DRIFT.footBand };
}

/** The ticket's box when its shield's foot stands on `point`: the plan's
 *  offset from the foot and its size (src/lib/coverDock.ts DockEntry). */
export function plateAt(point: Point, offset: Point, w: number, h: number): Box {
  const left = point.x + offset.x;
  const top = point.y + offset.y;
  return { left, top, right: left + w, bottom: top + h };
}

const inside = (point: Point, box: Box) =>
  point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;

export interface DriftView {
  /** The place in hand's shield's foot this frame, viewport px (null: the
   *  map could not project it). */
  point: Point | null;
  /** The map the reader sees (`mapView`; the phone's clear band above its
   *  card, `phoneView`). */
  view: Box;
  /** The ticket's box at this foot (`plateAt`; null on a phone, whose card
   *  stays at the foot of the screen whatever the map does). */
  plate?: Box | null;
  /** The place is over the planet's limb (`overLimb`). */
  behind: boolean;
}

/** Whether the place in hand is still held by what the reader looks at:
 *  on this side of the planet, and its shield on the open map or at least
 *  DRIFT.plateShare of its ticket there. */
export function holds(v: DriftView): boolean {
  if (!v.point || v.behind) return false;
  if (!Number.isFinite(v.point.x) || !Number.isFinite(v.point.y)) return false;
  if (inside(v.point, v.view)) return true;
  return !!v.plate && shareIn(v.plate, v.view) >= DRIFT.plateShare;
}

/** The view has drifted from the place in hand: its foot `offPx` from the
 *  dock's point, or its zoom `offZoom` off its rest (either way the
 *  Recentre control is worth showing). */
export function drifted(point: Point | null, dock: Point, zoom: number, restZoom: number): boolean {
  if (!point) return true;
  return Math.hypot(point.x - dock.x, point.y - dock.y) > DRIFT.offPx || Math.abs(zoom - restZoom) > DRIFT.offZoom;
}

/** The view's middle, and the offer's radius about it (px). */
export function offerRing(view: Box) {
  return {
    x: (view.left + view.right) / 2,
    y: (view.top + view.bottom) / 2,
    r: DRIFT.offer * Math.max(1, Math.min(view.right - view.left, view.bottom - view.top)),
  };
}

/** The place offered with nothing in hand and the map at rest: the one
 *  whose foot stands nearest the view's middle within the offer's ring,
 *  on this side of the planet; null when none does. `points` in viewport
 *  px; `behind` says which places are over the limb. */
export function offerOf(
  points: Readonly<Record<string, Point>>,
  view: Box,
  behind: (id: string) => boolean = () => false,
): string | null {
  const ring = offerRing(view);
  let best: string | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const [id, point] of Object.entries(points)) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const d = Math.hypot(point.x - ring.x, point.y - ring.y);
    if (d > ring.r || d >= bestD || behind(id)) continue;
    best = id;
    bestD = d;
  }
  return best;
}

/** Where Recentre goes: the place in hand, else the last one held (if it
 *  is still a place), else stop 01; null with no places. */
export function recentreTarget(order: readonly string[], current: string | null, last: string | null): string | null {
  if (current && order.includes(current)) return current;
  if (last && order.includes(last)) return last;
  return order[0] ?? null;
}

/** Whether the Recentre control shows: the explorer is the reader's, no
 *  flight of ours is under way, and either nothing is in hand (it brings
 *  the last place back) or the view has drifted from the place in hand. */
export function recentreShown(s: { free: boolean; flying: boolean; places: number; current: string | null; drifted: boolean }): boolean {
  if (!s.free || s.flying || s.places < 1) return false;
  return !s.current || s.drifted;
}

/** The view the reader sees on a phone: the band between the nav and the
 *  card's top (`cardTop`, viewport px; the controls' top with no card). */
export function phoneView(vw: number, vh: number, cardTop: number): Box {
  const top = 88;
  return { left: 0, top, right: vw, bottom: clamp(cardTop, top + 40, vh) };
}
