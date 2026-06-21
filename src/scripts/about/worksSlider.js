/* ============================================================
   Effect · Works slideshow (动效 6)
   The side project list drives the stage: hovering/selecting an item
   makes it active (indicator line), clip-wipes the big background to
   that project's frame, and rises its index numeral in. Click opens
   nothing here (single page) — it's a hover/selection showcase.
   ============================================================ */
export function initWorksSlider({ gsap, reduce }) {
  const section = document.querySelector('.works');
  if (!section) return;
  const bg = section.querySelector('[data-works-bg]');
  const indexEl = section.querySelector('[data-works-index]');
  const items = Array.from(section.querySelectorAll('[data-works-item]'));
  if (!bg || !items.length) return;

  let current = 0;
  let busy = false;

  const activate = (i) => {
    if (i === current) return;
    current = i;
    const item = items[i];
    items.forEach((it, j) => it.classList.toggle('is-active', j === i));

    const nextImg = item.dataset.img;
    const nextNum = item.dataset.num || '';

    if (reduce) {
      if (nextImg) bg.src = nextImg;
      if (indexEl) indexEl.textContent = nextNum;
      return;
    }

    // Clip-wipe the stage to the new frame.
    if (nextImg) {
      busy = true;
      gsap.to(bg, {
        clipPath: 'inset(0% 0% 100% 0%)',
        duration: 0.32,
        ease: 'power2.in',
        onComplete: () => {
          bg.src = nextImg;
          gsap.fromTo(
            bg,
            { clipPath: 'inset(100% 0% 0% 0%)' },
            { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.6, ease: 'power3.out', onComplete: () => (busy = false) },
          );
        },
      });
    }

    // Rise the index numeral in.
    if (indexEl) {
      indexEl.textContent = nextNum;
      gsap.fromTo(indexEl, { yPercent: 45, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.55, ease: 'expo.out' });
    }
  };

  items.forEach((item, i) => {
    item.addEventListener('mouseenter', () => activate(i));
    item.addEventListener('focus', () => activate(i));
    item.addEventListener('click', () => activate(i));
  });

  // ensure clip-path baseline so the first wipe has a value to animate from
  gsap.set(bg, { clipPath: 'inset(0% 0% 0% 0%)' });
}
