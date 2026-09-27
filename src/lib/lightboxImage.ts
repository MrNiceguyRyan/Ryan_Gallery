/** Sanity writes the file's pixel size into its name (`…-3000x2000.jpg`): the
 *  same rule as the proof sheet's (lib/proofSheet, FILE_DIMS). It lets the
 *  viewer know a frame's shape before a byte of the frame has arrived. */
const FILE_DIMS = /-(\d+)x(\d+)\.[a-z]+/i;

export function fileDims(url: string): { width: number; height: number } | null {
  const match = FILE_DIMS.exec(url);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

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
