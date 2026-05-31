import { useEffect } from 'react';
import MagazineLayout from '../home/MagazineLayout';
import type { Collection } from '../../types';

/**
 * WorkStory — renders the SAME MagazineLayout story experience used by the
 * homepage overlay, but as a standalone /works/[slug] page. This keeps the
 * "open a collection story" experience identical whether the visitor arrives
 * from the homepage (in-app overlay) or from the Map's "Explore Story" link
 * (full-page navigation). Homepage is the baseline.
 *
 * Navigation-based equivalents of the overlay callbacks:
 *   - Keep Reading (onSelectCollection) → navigate to that work's page
 *   - Back (onClose)                    → return to where the visitor came
 *     from, falling back to the homepage
 */
export default function WorkStory({
  collection,
  allCollections,
}: {
  collection: Collection;
  allCollections: Collection[];
}) {
  // The MagazineLayout fills the viewport with its own internal scroll, so
  // lock the page body to avoid a second scrollbar.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.backgroundColor = '#0A0A0A';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <MagazineLayout
      collection={collection}
      allCollections={allCollections}
      onSelectCollection={(c) => {
        if (c.slug) window.location.href = `/works/${c.slug}`;
      }}
      onClose={() => {
        if (window.history.length > 1) window.history.back();
        else window.location.href = '/';
      }}
    />
  );
}
