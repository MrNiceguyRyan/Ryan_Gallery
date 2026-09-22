/**
 * The landmark each place wears on the atlas.
 *
 * Every place used to wear the same surveyor's benchmark disc. A disc says
 * "this point was measured", which is true of all of them and therefore tells
 * you nothing about any of them: six identical marks are a uniform, not a set
 * of landmarks.
 *
 * So the disc stays, but only as the DEFAULT — the mark a place wears until
 * somebody draws it. When the camera comes to a place, the disc gives way to
 * that place's own landmark, drawn in the same white hairline as everything
 * else on this map.
 *
 * WHY THE DISC SURVIVES AS THE FALLBACK. It answers the two questions a
 * per-place mark system usually cannot. A place with no drawing yet is not a
 * hole in the map, it is a surveyed point — which is honest, and which is what
 * a place in this archive is before it has been looked at properly. And the
 * archive is going to keep growing: a new city ships the day its photographs
 * do, wearing the disc, and earns its landmark later. Nothing is ever blocked
 * on illustration.
 *
 * TWO LEVELS OF DETAIL, BECAUSE ONE DOES NOT SURVIVE. Measured on the live
 * page: at rest a mark is 16px across, and six hairline drawings at 16px on a
 * graded satellite ground are six identical grey smudges — the drawing is
 * unreadable AND the places stop being distinguishable, which is worse than
 * the uniform it replaced. So detail arrives with attention:
 *
 *   far (scale 0.52, 16px)  the benchmark disc. Every place, identical, calm.
 *   near (scale 0.92 / 1)   the place's own landmark, drawn.
 *
 * DRAWING CONVENTION. Landmarks are authored STANDING: the object's base sits
 * on y = 0 and it rises into negative y, which is how you draw a thing that
 * stands somewhere. But the Mapbox Marker anchors `center`, so a glyph left
 * standing on the origin would hang entirely above its own coordinate. The
 * component lifts each landmark by half its own `height` so the object's middle
 * lands on the point. Author standing and declare the height; the lift is
 * applied for you.
 */

export const LANDMARK_VIEWBOX = '-22 -22 44 44';

export interface PlaceLandmark {
  /** What is drawn, and why it is the right subject for this place. */
  subject: string;
  /**
   * The drawing's standing height. The component lifts by half of it, which is
   * what actually centres the object on its coordinate — a single shared lift
   * left the shorter landmarks sitting 2px high of their own point, and 2px is
   * visible when the thing beside it is a 1px hairline.
   */
  height: number;
  /**
   * The object's solid mass, closed, drawn first and filled with the same dark
   * burn the disc uses. A benchmark disc is a physical object and the route
   * hairline passes behind it; a landmark is no less physical, and without this
   * the route ran straight through the Watchman and out the other side.
   */
  body: string;
  /** The full drawing, authored standing on y = 0. */
  full: string;
  /** The same object with its interior detail dropped — used while the camera
   *  is still flying, when the detail would only shimmer. */
  silhouette: string;
}

/**
 * Keyed by collection slug. The subjects are the landmark a reader already
 * recognises, which is a deliberate choice: these marks have to be legible to
 * someone who has not seen the photographs yet, since the mark is how they
 * decide whether to go and look.
 */
export const PLACE_LANDMARKS: Record<string, PlaceLandmark> = {
  miami: {
    body: 'M-8.8,-11.4L0,-16.4L8.8,-11.4Z M-6.4,-11.4H6.4V-5.2H-6.4Z M-6,-5.2H-5.2V0H-6Z M5.2,-5.2H6V0H5.2Z',
    height: 20.2,
    subject: 'An Art Deco lifeguard tower — the silhouette that means Miami Beach and nothing else.',
    full: `<path class="af-place__burn" d="M-6.4,-5.2V-11.4H6.4V-5.2 M-8.8,-11.4L0,-16.4L8.8,-11.4"/>
      <path class="af-place__ink" d="M-5.6,0V-5.2 M5.6,0V-5.2"/>
      <path class="af-place__ink" d="M-7.8,-5.2H7.8"/>
      <path class="af-place__ink" d="M-6.4,-5.2V-11.4H6.4V-5.2"/>
      <path class="af-place__ink" d="M-8.8,-11.4L0,-16.4L8.8,-11.4Z"/>
      <path class="af-place__ink" d="M0,-16.4V-20.2"/>
      <path class="af-place__ink" d="M0,-20.2L4.2,-18.9L0,-17.6"/>
      <path class="af-place__soft" d="M-2.4,-9.6H2.4"/>`,
    silhouette: `<path class="af-place__burn" d="M-6.4,-5.2V-11.4H6.4V-5.2 M-8.8,-11.4L0,-16.4L8.8,-11.4"/>
      <path class="af-place__ink" d="M-5.6,0V-5.2 M5.6,0V-5.2 M-7.8,-5.2H7.8 M-6.4,-5.2V-11.4H6.4V-5.2"/>
      <path class="af-place__ink" d="M-8.8,-11.4L0,-16.4L8.8,-11.4Z"/>
      <path class="af-place__ink" d="M0,-16.4V-20.2"/>`,
  },
  orlando: {
    body: 'M-3.2,0V-10.6L0,-17L3.2,-10.6V0Z M-8.4,0V-7.6L-5.8,-12.2L-3.2,-7.6V0Z M8.4,0V-7.6L5.8,-12.2L3.2,-7.6V0Z',
    height: 20.4,
    subject: 'The castle — three spires. Orlando is a city that exists to be gone to, and this is the shape of the going.',
    full: `<path class="af-place__burn" d="M-3.2,0V-10.6L0,-17L3.2,-10.6V0 M-8.4,0V-7.6L-5.8,-12.2L-3.2,-7.6 M8.4,0V-7.6L5.8,-12.2L3.2,-7.6"/>
      <path class="af-place__ink" d="M-3.2,0V-10.6L0,-17L3.2,-10.6V0"/>
      <path class="af-place__ink" d="M-8.4,0V-7.6L-5.8,-12.2L-3.2,-7.6"/>
      <path class="af-place__ink" d="M8.4,0V-7.6L5.8,-12.2L3.2,-7.6"/>
      <path class="af-place__ink" d="M0,-17V-20.4L3.4,-19.2L0,-18"/>
      <path class="af-place__ink" d="M-1.7,0V-3.8A1.7,1.7 0 0 1 1.7,-3.8V0"/>
      <path class="af-place__soft" d="M-5.8,-12.2V-14.6 M5.8,-12.2V-14.6 M-8.4,-7.6H-3.2 M3.2,-7.6H8.4"/>`,
    silhouette: `<path class="af-place__burn" d="M-3.2,0V-10.6L0,-17L3.2,-10.6V0 M-8.4,0V-7.6L-5.8,-12.2L-3.2,-7.6 M8.4,0V-7.6L5.8,-12.2L3.2,-7.6"/>
      <path class="af-place__ink" d="M-3.2,0V-10.6L0,-17L3.2,-10.6V0"/>
      <path class="af-place__ink" d="M-8.4,0V-7.6L-5.8,-12.2L-3.2,-7.6"/>
      <path class="af-place__ink" d="M8.4,0V-7.6L5.8,-12.2L3.2,-7.6"/>
      <path class="af-place__ink" d="M0,-17V-20.4L3.4,-19.2L0,-18"/>`,
  },
  page: {
    body: 'M-11,-15.2C-11,-4 -6.4,0 0,0C6.4,0 11,-4 11,-15.2L8.2,-15.2C8.2,-5.4 4.8,-2.8 0,-2.8C-4.8,-2.8 -8.2,-5.4 -8.2,-15.2Z',
    height: 19,
    subject: 'Horseshoe Bend — the river drawn as the channel it cut, wrapping a rock left empty.',
    full: `<path class="af-place__burn" d="M-11,-15.2C-11,-4 -6.4,0 0,0C6.4,0 11,-4 11,-15.2 M-8.2,-15.2C-8.2,-5.4 -4.8,-2.8 0,-2.8C4.8,-2.8 8.2,-5.4 8.2,-15.2"/>
      <path class="af-place__ink" d="M-11,-15.2C-11,-4 -6.4,0 0,0C6.4,0 11,-4 11,-15.2"/>
      <path class="af-place__ink" d="M-8.2,-15.2C-8.2,-5.4 -4.8,-2.8 0,-2.8C4.8,-2.8 8.2,-5.4 8.2,-15.2"/>
      <path class="af-place__soft" d="M-11,-15.2V-19 M-8.2,-15.2V-19 M11,-15.2V-19 M8.2,-15.2V-19"/>`,
    silhouette: `<path class="af-place__burn" d="M-11,-15.2C-11,-4 -6.4,0 0,0C6.4,0 11,-4 11,-15.2 M-8.2,-15.2C-8.2,-5.4 -4.8,-2.8 0,-2.8C4.8,-2.8 8.2,-5.4 8.2,-15.2"/>
      <path class="af-place__ink" d="M-11,-15.2C-11,-4 -6.4,0 0,0C6.4,0 11,-4 11,-15.2"/>
      <path class="af-place__ink" d="M-8.2,-15.2C-8.2,-5.4 -4.8,-2.8 0,-2.8C4.8,-2.8 8.2,-5.4 8.2,-15.2"/>`,
  },
  'zion-national-park': {
    body: 'M-12.5,0L-5.5,-9.4L-1,-17.2L4,-9L12.5,0Z',
    height: 17.2,
    subject: 'The Watchman — the peak that stands over the south entrance, layered.',
    full: `<path class="af-place__burn" d="M-12.5,0L-5.5,-9.4L-1,-17.2L4,-9L12.5,0"/>
      <path class="af-place__ink" d="M-12.5,0L-5.5,-9.4L-1,-17.2L4,-9L12.5,0"/>
      <path class="af-place__soft" d="M-7.2,-6.6H6.4 M-9.6,-3.4H9.8 M-1,-17.2L-3.4,-9"/>`,
    silhouette: `<path class="af-place__burn" d="M-12.5,0L-5.5,-9.4L-1,-17.2L4,-9L12.5,0"/>
      <path class="af-place__ink" d="M-12.5,0L-5.5,-9.4L-1,-17.2L4,-9L12.5,0"/>`,
  },
  'bryce-canyon-national-park': {
    body: 'M-9.4,0L-8.7,-9L-8,0Z M-5.4,0L-4.6,-13L-3.8,0Z M-1.2,0L-0.6,-7.4L0,0Z M3,0L3.8,-15L4.6,0Z M7.4,0L8.1,-6.6L8.8,0Z',
    height: 15,
    subject: 'The hoodoos — tapered spires under their cap rocks. The cap is what makes a hoodoo a hoodoo.',
    full: `<path class="af-place__burn" d="M-9.4,0L-8.7,-9L-8,0 M-5.4,0L-4.6,-13L-3.8,0 M-1.2,0L-0.6,-7.4L0,0 M3,0L3.8,-15L4.6,0 M7.4,0L8.1,-6.6L8.8,0"/>
      <path class="af-place__ink" d="M-9.4,0L-8.7,-9L-8,0 M-5.4,0L-4.6,-13L-3.8,0 M-1.2,0L-0.6,-7.4L0,0 M3,0L3.8,-15L4.6,0 M7.4,0L8.1,-6.6L8.8,0"/>
      <path class="af-place__ink" d="M-9.7,-9H-7.7 M-5.7,-13H-3.5 M-1.5,-7.4H0.3 M2.6,-15H5 M7.1,-6.6H9.1"/>
      <path class="af-place__soft" d="M-12.2,0L-11.7,-5.4L-11.2,0 M11,0L11.5,-4.6L12,0"/>`,
    silhouette: `<path class="af-place__burn" d="M-9.4,0L-8.7,-9L-8,0 M-5.4,0L-4.6,-13L-3.8,0 M-1.2,0L-0.6,-7.4L0,0 M3,0L3.8,-15L4.6,0 M7.4,0L8.1,-6.6L8.8,0"/>
      <path class="af-place__ink" d="M-9.4,0L-8.7,-9L-8,0 M-5.4,0L-4.6,-13L-3.8,0 M-1.2,0L-0.6,-7.4L0,0 M3,0L3.8,-15L4.6,0 M7.4,0L8.1,-6.6L8.8,0"/>
      <path class="af-place__ink" d="M-9.7,-9H-7.7 M-5.7,-13H-3.5 M2.6,-15H5"/>`,
  },
  'new-york-stories': {
    body: 'M-7.4,0V-7.6H-4.6V-13.4H-2.6V-17.6H2.6V-13.4H4.6V-7.6H7.4V0Z',
    height: 21,
    subject: 'The Empire State Building — the setbacks and the mast, the one New York silhouette that needs no skyline around it.',
    full: `<path class="af-place__burn" d="M-7.4,0V-7.6H-4.6V-13.4H-2.6V-17.6H2.6V-13.4H4.6V-7.6H7.4V0"/>
      <path class="af-place__ink" d="M-7.4,0V-7.6H-4.6V-13.4H-2.6V-17.6H2.6V-13.4H4.6V-7.6H7.4V0"/>
      <path class="af-place__ink" d="M0,-17.6V-21"/>
      <path class="af-place__soft" d="M-1.4,-15.4H1.4 M-1.4,-12.4H1.4 M-3.4,-9.6H3.4 M-3.4,-6.4H3.4 M-3.4,-3.2H3.4"/>`,
    silhouette: `<path class="af-place__burn" d="M-7.4,0V-7.6H-4.6V-13.4H-2.6V-17.6H2.6V-13.4H4.6V-7.6H7.4V0"/>
      <path class="af-place__ink" d="M-7.4,0V-7.6H-4.6V-13.4H-2.6V-17.6H2.6V-13.4H4.6V-7.6H7.4V0"/>
      <path class="af-place__ink" d="M0,-17.6V-21"/>`,
  },
};

export const landmarkFor = (slug?: string | null): PlaceLandmark | null =>
  (slug && PLACE_LANDMARKS[slug]) || null;

/** What centres a standing glyph on its coordinate. */
export const landmarkLift = (landmark: PlaceLandmark) => landmark.height / 2;
