/* ============================================================
   Effect · Word & character reveal (动效 2 + 3)
   splitWordsReveal: each word starts dim and lifts to full contrast
   as you scroll, staggered word-by-word (the signature effect).
   splitCharsReveal: same, per character — for titles / social labels.
   Both scrub-bound to ScrollTrigger and theme-aware (dim→white on
   dark sections, dim→black on light).
   ============================================================ */

// Foreground/dim tones for the element's section theme.
function tones(el) {
  const theme = el.closest('[data-theme]')?.dataset.theme || 'dark';
  return theme === 'light'
    ? { dim: '#c9c9c9', lit: '#000000' }
    : { dim: '#3a3a3a', lit: '#ffffff' };
}

function wrapWords(el) {
  const words = el.textContent.replace(/\s+/g, ' ').trim().split(' ');
  el.textContent = '';
  return words.map((w) => {
    const s = document.createElement('span');
    s.className = 'word';
    s.textContent = w;
    el.appendChild(s); // spacing comes from .word margin-right
    return s;
  });
}

function wrapChars(el) {
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  el.textContent = '';
  return [...text].map((ch) => {
    const s = document.createElement('span');
    s.className = 'char';
    s.textContent = ch;
    el.appendChild(s);
    return s;
  });
}

/** Exposed so other sections can reuse the exact same primitive. */
export function splitWordsReveal(el, { gsap, reduce }) {
  if (el.dataset.split) return;
  el.dataset.split = '1';
  const { dim, lit } = tones(el);
  const spans = wrapWords(el);
  if (reduce) {
    gsap.set(spans, { color: lit });
    return;
  }
  gsap.set(spans, { color: dim });
  gsap.to(spans, {
    color: lit,
    ease: 'none',
    stagger: 0.4,
    scrollTrigger: { trigger: el, start: 'top 82%', end: 'top 38%', scrub: true },
  });
}

export function splitCharsReveal(el, { gsap, reduce }) {
  if (el.dataset.split) return;
  el.dataset.split = '1';
  const { dim, lit } = tones(el);
  const spans = wrapChars(el);
  if (reduce) {
    gsap.set(spans, { color: lit });
    return;
  }
  gsap.set(spans, { color: dim });
  gsap.to(spans, {
    color: lit,
    ease: 'none',
    stagger: 0.25,
    scrollTrigger: { trigger: el, start: 'top 88%', end: 'top 52%', scrub: true },
  });
}

export function initTextReveal(ctx) {
  ctx.gsap.utils.toArray('[data-words]').forEach((el) => splitWordsReveal(el, ctx));
  ctx.gsap.utils.toArray('[data-chars]').forEach((el) => splitCharsReveal(el, ctx));
}
