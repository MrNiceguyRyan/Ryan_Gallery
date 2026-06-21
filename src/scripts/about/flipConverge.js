/* ============================================================
   Effect · "Carve it / Into / Memory" converge (动效 5)
   The three words sit spread with a portrait between them. On a
   pinned scrub: GSAP Flip collapses them into one line "Carve it
   Into Memory" while the centre portrait grows to a full-bleed
   background, and the theme inverts white→black (words → white) so
   contrast holds. The signature moment.
   Pattern: Flip.getState(spread) → add .is-converged → Flip.from()
   → scrub the resulting timeline under a pin.
   ============================================================ */
export function initFlipConverge({ gsap, ScrollTrigger, Flip, reduce }) {
  const section = document.querySelector('[data-converge]');
  if (!section) return;

  const words = Array.from(section.querySelectorAll('[data-converge-word]'));
  const media = section.querySelector('[data-converge-media]');
  const targets = [...words, media].filter(Boolean);
  if (!targets.length) return;

  if (reduce) {
    // Land in the converged composition immediately, no motion.
    section.classList.add('is-converged');
    gsap.set(words, { color: '#ffffff' });
    return;
  }

  // 1) record the spread layout
  const state = Flip.getState(targets);
  // 2) switch to the converged layout (one line + full-bleed media)
  section.classList.add('is-converged');
  // 3) Flip spread → converged AS the scrubbed timeline. Theme inversion is
  //    appended onto the same Flip timeline so one ScrollTrigger scrubs it all.
  //    (Passing the Flip timeline directly as `animation` lets ScrollTrigger
  //    take control immediately — wrapping it in another timeline broke scrub.)
  const flip = Flip.from(state, { duration: 1, ease: 'none', simple: true });
  flip.to('body', { backgroundColor: '#000000', color: '#ffffff', ease: 'none', duration: 0.5 }, 0.5);
  flip.to(words, { color: '#ffffff', ease: 'none', duration: 0.5 }, 0.5);

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: '+=160%',
    pin: true,
    scrub: true,
    anticipatePin: 1,
    animation: flip,
  });
}
