// ── The opening reel's cover, as the server paints it ──
// Called from src/pages/index.astro at build time; the markup goes into the
// IntroReel island as a static slot, so it is in the HTML — the first paint
// is the cover, before any script — and the client never recomputes it (the
// canvas that takes over draws the same frame over it, then hides it).
// One SVG per design frame; CSS shows the one for the viewport.

import { FRAME_DESKTOP, FRAME_PHONE, type DesignFrame } from './introReel';
import { paintCover } from './introReelPaint';
import { SvgRecorder } from './introReelSvg';

function coverSvg(frame: DesignFrame, phone: boolean) {
  const recorder = new SvgRecorder(phone ? 'reel-p' : 'reel-d', frame);
  paintCover(recorder, frame, phone);
  const variant = phone ? 'phone' : 'desktop';
  return (
    `<svg class="intro-reel__svg intro-reel__svg--${variant}" xmlns="http://www.w3.org/2000/svg"` +
    ` viewBox="0 0 ${frame.w} ${frame.h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">` +
    `${recorder.markup()}</svg>`
  );
}

let cached: string | null = null;
export function reelCoverMarkup() {
  cached ??= coverSvg(FRAME_DESKTOP, false) + coverSvg(FRAME_PHONE, true);
  return cached;
}
