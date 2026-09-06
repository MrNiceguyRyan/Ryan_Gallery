/** Keep responsive selection identical for the visible image and its decode gate. */
export function lightboxImageSources(imageUrl: string) {
  return {
    src: `${imageUrl}?auto=format&w=1400&q=88`,
    srcSet: `${imageUrl}?auto=format&w=900&q=88 900w, ${imageUrl}?auto=format&w=1400&q=88 1400w, ${imageUrl}?auto=format&w=2000&q=85 2000w`,
    sizes: '92vw',
  };
}

/** A cancelled or superseded request must never replace the frame being viewed. */
export function prepareLightboxImage(imageUrl: string, onReady: (ready: boolean) => void) {
  const image = new Image();
  const sources = lightboxImageSources(imageUrl);
  let active = true;
  const finish = (ready: boolean) => {
    if (!active) return;
    active = false;
    clearTimeout(timeout);
    image.onload = null;
    image.onerror = null;
    onReady(ready);
  };
  const timeout = setTimeout(() => finish(false), 12000);
  image.decoding = 'async';
  image.onload = () => {
    if (typeof image.decode === 'function') {
      void image.decode().then(() => finish(true), () => finish(false));
    } else {
      finish(image.naturalWidth > 0);
    }
  };
  image.onerror = () => finish(false);
  image.sizes = sources.sizes;
  image.srcset = sources.srcSet;
  image.src = sources.src;
  return () => {
    active = false;
    clearTimeout(timeout);
    image.onload = null;
    image.onerror = null;
  };
}
