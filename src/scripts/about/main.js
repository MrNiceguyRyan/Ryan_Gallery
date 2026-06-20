/* ============================================================
   About / cinematic portfolio — ENTRY
   Wires Lenis smooth-scroll into GSAP's ticker and drives
   ScrollTrigger.update() from Lenis. Each scroll effect lives in
   its own module under ./ and is initialised here.
   ============================================================ */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';
import Lenis from 'lenis';

import { initThemeSwitch } from './themeSwitch.js';
// Effect modules — filled in one at a time (see each file's header).
import { initHeroExpand } from './heroExpand.js';
import { initTextReveal } from './textReveal.js';
import { initImageReveal } from './imageReveal.js';
import { initFlipConverge } from './flipConverge.js';
import { initWorksSlider } from './worksSlider.js';

let booted = false;

export function initAbout() {
  if (booted) return; // idempotent — safe across re-inits
  booted = true;

  gsap.registerPlugin(ScrollTrigger, Flip);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Lenis smooth scroll, driven by GSAP's ticker ──
  // Skipped for reduced-motion users — native scrolling, effects degrade
  // to simple fades inside each module.
  let lenis = null;
  if (!reduce) {
    lenis = new Lenis({
      duration: 1.1,
      // expo-out — long, weighty glide
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
    });

    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // ── Effects ──
  const ctx = { gsap, ScrollTrigger, Flip, lenis, reduce };
  initThemeSwitch(ctx); // base: B&W background transitions per section
  initHeroExpand(ctx);
  initTextReveal(ctx);
  initImageReveal(ctx);
  initFlipConverge(ctx);
  initWorksSlider(ctx);

  // Recalculate once images/fonts have settled.
  ScrollTrigger.refresh();
  window.addEventListener('load', () => ScrollTrigger.refresh());

  // expose for debugging
  window.__about = { lenis, ScrollTrigger, gsap };
}
