# Story return-state verification — 2026-09-06

## Scope

This follow-up stays on `codex/security-release-guardrails`, after `8b0fe50`. No merge, production/Studio deployment, visual redesign, CMS change or monitoring activation is included. The separate spatial-design checkout is untouched.

## Reproduced defect and cause

At a 1440 × 900 CSS viewport in the in-app browser, opening Miami from the Home archive and closing its Story restored the final scroll position but left `document.activeElement` on `BODY`.

Local-only diagnostic probes established that focus initially returned to the correct cover. About 39 ms later, that same connected cover became inert and lost focus. The document used `scroll-behavior: smooth` while Lenis was stopped. Home restored the body lock with `behavior: auto`, which inherits the CSS behavior, so the archive briefly sampled the journey back from scroll zero and disabled the first cover's entry gate. See the [scrollTo behavior definitions](https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollTo#parameters).

The fix uses `instant` only for body-lock restoration/cleanup. Normal navigation, smooth scrolling, map tracking and Story animations remain unchanged.

## Focus handoff

- Focus restoration waits for the source to be connected, visible and outside inert/hidden containers; it does not assume two animation frames are always sufficient.
- Sources are identified by stable collection IDs across desktop and compact layouts. If a responsive tree is replaced during Story, the new equivalent control can receive focus.
- Reopening a Story or unmounting Home cancels the prior pending focus operation.
- The retry is bounded at 500 ms. If the original source disappears, the archive main landmark is the fallback. No background retry loop runs indefinitely.
- Temporary diagnostic attributes/listeners were removed before final build.

## Verification

- Eight new regression cases exercise delayed interaction gates, responsive replacement, hidden sources, source removal, cancellation, bounded fallback, still-inert pages and the actual Home body-lock effect without Lenis.
- Website regressions: 32 passed. Release checks: 4 passed. Separate Studio security compatibility checks: 4 passed.
- Website and Studio audits still report zero known dependency vulnerabilities at this check.
- Static build: 10 pages, six stories. Local HTTP smoke: nine public routes and 11 directly referenced application assets passed.
- Browser retest: Miami Story closed back to the same scroll offset (2452 px), the active element remained `View story: Miami`, and the source no longer blurred during restoration. The full-screen viewer still advanced to photo 2 with the right-arrow key.

These are functional checks in the in-app browser, not native Chrome/Safari, real-phone, visual or performance acceptance. Native Chrome testing was interrupted by the user's active browsing; no further native-app actions were taken. The existing in-app viewport/screenshot limitations remain, and no FPS/Core Web Vitals claims are made.

Service choice for anonymous/minimized error reporting, native-browser/phone visual acceptance and release-account configuration remain pending. The production site has not been replaced by this work.
