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
 * EVERY SUBJECT IS TRACED FROM THE ARCHIVE'S OWN FRAMES.
 *
 * This is a rule, not a preference, and it was learned the hard way: the first
 * set was drawn from memory of what these places are famous for, and four of
 * six subjects turned out to appear in NONE of the photographs. Miami got a
 * lifeguard tower that is in no frame. Page got Horseshoe Bend, while all
 * eleven Page frames are inside Antelope Canyon. New York got the Empire State
 * Building, and the New York chapter is two frames of a street corner. Orlando
 * got a castle — which is both absent from the archive's own position ("Away
 * from the spectacle", EDITORIAL_FALLBACKS in narratives.tsx) and somebody
 * else's trademarked silhouette on a public site.
 *
 * So: open the chapter's frames, count what is actually in them, and draw
 * that. The count is recorded in each `subject` so the next person can check
 * the claim instead of trusting it. Where the archive's prose names a thing
 * (`narratives.tsx`), the drawing agrees with the prose — the photographs and
 * the writing are the same archive and should not disagree about what is here.
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
  /** What is drawn, and the count of frames in this chapter that support it. */
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

/** Keyed by collection slug. */
export const PLACE_LANDMARKS: Record<string, PlaceLandmark> = {
  miami: {
    subject:
      'An Art Deco hotel facade: stepped ziggurat parapet, eyebrow bands, and the vertical sign lit. Frame 5 of 15 is exactly this building; the archive\'s own prose names it — "the pastel geometry of Art Deco facades… and the neon beginning its slow assertion".',
    height: 16.6,
    body: 'M-8.4,0V-11.4H-5.6V-13.6H-2.4V-16H2.4V-13.6H5.6V-11.4H8.4V0Z M-12.4,-4.4H-9.6V-16.6H-12.4Z',
    full: `<path class="af-place__burn" d="M-8.4,0V-11.4H-5.6V-13.6H-2.4V-16H2.4V-13.6H5.6V-11.4H8.4V0 M-12.4,-4.4H-9.6V-16.6H-12.4Z"/>
      <path class="af-place__ink" d="M-8.4,0V-11.4H-5.6V-13.6H-2.4V-16H2.4V-13.6H5.6V-11.4H8.4V0"/>
      <path class="af-place__ink" d="M-12.4,-4.4H-9.6V-16.6H-12.4Z"/>
      <circle class="af-place__fill" cx="-11" cy="-14.4" r="0.75"/>
      <circle class="af-place__fill" cx="-11" cy="-11.8" r="0.75"/>
      <circle class="af-place__fill" cx="-11" cy="-9.2" r="0.75"/>
      <circle class="af-place__fill" cx="-11" cy="-6.6" r="0.75"/>
      <path class="af-place__soft" d="M-7,-8H7 M-7,-4.4H7"/>`,
    silhouette: `<path class="af-place__burn" d="M-8.4,0V-11.4H-5.6V-13.6H-2.4V-16H2.4V-13.6H5.6V-11.4H8.4V0 M-12.4,-4.4H-9.6V-16.6H-12.4Z"/>
      <path class="af-place__ink" d="M-8.4,0V-11.4H-5.6V-13.6H-2.4V-16H2.4V-13.6H5.6V-11.4H8.4V0"/>
      <path class="af-place__ink" d="M-12.4,-4.4H-9.6V-16.6H-12.4Z"/>`,
  },
  orlando: {
    subject:
      'A roller coaster: the vertical loop with its track and stanchions. Six of the seventeen Orlando frames are coasters — the single dominant subject in the largest chapter in the archive. A loop is a form, not a trademark, which the castle it replaced was.',
    height: 15,
    body: '',
    full: `<path class="af-place__burn" d="M-12.6,-1.8H12.6"/>
      <circle class="af-place__burn" cx="1.6" cy="-8.6" r="6.4"/>
      <path class="af-place__ink" d="M-12.6,-1.8H12.6"/>
      <circle class="af-place__ink" cx="1.6" cy="-8.6" r="6.4"/>
      <path class="af-place__soft" d="M-8.4,-1.8V0 M-3.6,-1.8V0 M6.6,-1.8V0 M11,-1.8V0 M1.6,-2.2V0"/>
      <path class="af-place__soft" d="M-4.8,-8.6H-3 M8,-8.6H9.8"/>`,
    silhouette: `<path class="af-place__burn" d="M-12.6,-1.8H12.6"/>
      <circle class="af-place__burn" cx="1.6" cy="-8.6" r="6.4"/>
      <path class="af-place__ink" d="M-12.6,-1.8H12.6"/>
      <circle class="af-place__ink" cx="1.6" cy="-8.6" r="6.4"/>`,
  },
  page: {
    subject:
      'The Antelope Canyon slot: two sinuous layered walls closing toward a sliver of sky. All eleven Page frames are inside this canyon, and the prose names it outright — "Inside Antelope Canyon the sandstone narrows until sound itself seems muffled."',
    height: 18.4,
    body: 'M-10.6,0C-8.6,-4.6 -11.4,-8.6 -6.6,-12.2C-4.6,-13.8 -4.2,-16 -5,-18.4L-13.6,-18.4V0Z M7.6,0C5.6,-5.4 8.8,-9.4 3.6,-13.2C1.8,-14.6 1.4,-16.6 2,-18.4L11.6,-18.4V0Z',
    full: `<path class="af-place__burn" d="M-10.6,0C-8.6,-4.6 -11.4,-8.6 -6.6,-12.2C-4.6,-13.8 -4.2,-16 -5,-18.4 M7.6,0C5.6,-5.4 8.8,-9.4 3.6,-13.2C1.8,-14.6 1.4,-16.6 2,-18.4"/>
      <path class="af-place__ink" d="M-10.6,0C-8.6,-4.6 -11.4,-8.6 -6.6,-12.2C-4.6,-13.8 -4.2,-16 -5,-18.4"/>
      <path class="af-place__ink" d="M7.6,0C5.6,-5.4 8.8,-9.4 3.6,-13.2C1.8,-14.6 1.4,-16.6 2,-18.4"/>
      <path class="af-place__soft" d="M-8,0C-6.4,-4.4 -8.6,-8 -4.8,-11.4C-3.2,-12.8 -2.8,-15.6 -3.4,-18.4 M5,0C3.6,-5 6,-8.6 1.4,-12.2C0,-13.4 -0.2,-16 0.2,-18.4"/>`,
    silhouette: `<path class="af-place__burn" d="M-10.6,0C-8.6,-4.6 -11.4,-8.6 -6.6,-12.2C-4.6,-13.8 -4.2,-16 -5,-18.4 M7.6,0C5.6,-5.4 8.8,-9.4 3.6,-13.2C1.8,-14.6 1.4,-16.6 2,-18.4"/>
      <path class="af-place__ink" d="M-10.6,0C-8.6,-4.6 -11.4,-8.6 -6.6,-12.2C-4.6,-13.8 -4.2,-16 -5,-18.4"/>
      <path class="af-place__ink" d="M7.6,0C5.6,-5.4 8.8,-9.4 3.6,-13.2C1.8,-14.6 1.4,-16.6 2,-18.4"/>`,
  },
  'zion-national-park': {
    subject:
      'The stone entrance monument: a masonry pillar with the beam and hanging sign board. Two of the eight Zion frames are this marker, and it is chosen over another red summit because Bryce already owns rock — a second sandstone peak would make the two Utah chapters indistinguishable at 30px. The emblem on the board is left blank: the arrowhead is a National Park Service mark.',
    height: 14.6,
    body: 'M-4.6,0V-14.6H4.6V0Z M-12,-12.2H-7V-8.4H-12Z',
    full: `<path class="af-place__burn" d="M-4.6,0V-14.6H4.6V0 M-5.8,-14.6H5.8 M-5.8,-13H-12.6 M-12,-12.2H-7V-8.4H-12Z"/>
      <path class="af-place__ink" d="M-4.6,0V-14.6H4.6V0"/>
      <path class="af-place__ink" d="M-5.8,-14.6H5.8"/>
      <path class="af-place__ink" d="M-5.8,-13H-12.6"/>
      <path class="af-place__ink" d="M-11.2,-13V-12.2 M-7.8,-13V-12.2"/>
      <path class="af-place__ink" d="M-12,-12.2H-7V-8.4H-12Z"/>
      <path class="af-place__soft" d="M-4.6,-11H4.6 M-4.6,-7.4H4.6 M-4.6,-3.8H4.6"/>
      <path class="af-place__soft" d="M-2.2,-11.4H2.2V-6.8H-2.2Z"/>`,
    silhouette: `<path class="af-place__burn" d="M-4.6,0V-14.6H4.6V0 M-5.8,-14.6H5.8 M-5.8,-13H-12.6 M-12,-12.2H-7V-8.4H-12Z"/>
      <path class="af-place__ink" d="M-4.6,0V-14.6H4.6V0"/>
      <path class="af-place__ink" d="M-5.8,-14.6H5.8"/>
      <path class="af-place__ink" d="M-5.8,-13H-12.6"/>
      <path class="af-place__ink" d="M-12,-12.2H-7V-8.4H-12Z"/>`,
  },
  'bryce-canyon-national-park': {
    subject:
      'The hoodoos: tapered spires under their cap rocks. The cap is what makes a hoodoo a hoodoo, and the prose says so — "the tallest capped with harder dolomite that protected them while everything around eroded away". The only subject in the first set that the frames already supported.',
    height: 15,
    body: 'M-9.4,0L-8.7,-9L-8,0Z M-5.4,0L-4.6,-13L-3.8,0Z M-1.2,0L-0.6,-7.4L0,0Z M3,0L3.8,-15L4.6,0Z M7.4,0L8.1,-6.6L8.8,0Z',
    full: `<path class="af-place__burn" d="M-9.4,0L-8.7,-9L-8,0 M-5.4,0L-4.6,-13L-3.8,0 M-1.2,0L-0.6,-7.4L0,0 M3,0L3.8,-15L4.6,0 M7.4,0L8.1,-6.6L8.8,0"/>
      <path class="af-place__ink" d="M-9.4,0L-8.7,-9L-8,0 M-5.4,0L-4.6,-13L-3.8,0 M-1.2,0L-0.6,-7.4L0,0 M3,0L3.8,-15L4.6,0 M7.4,0L8.1,-6.6L8.8,0"/>
      <path class="af-place__ink" d="M-9.7,-9H-7.7 M-5.7,-13H-3.5 M-1.5,-7.4H0.3 M2.6,-15H5 M7.1,-6.6H9.1"/>
      <path class="af-place__soft" d="M-12.2,0L-11.7,-5.4L-11.2,0 M11,0L11.5,-4.6L12,0"/>`,
    silhouette: `<path class="af-place__burn" d="M-9.4,0L-8.7,-9L-8,0 M-5.4,0L-4.6,-13L-3.8,0 M-1.2,0L-0.6,-7.4L0,0 M3,0L3.8,-15L4.6,0 M7.4,0L8.1,-6.6L8.8,0"/>
      <path class="af-place__ink" d="M-9.4,0L-8.7,-9L-8,0 M-5.4,0L-4.6,-13L-3.8,0 M-1.2,0L-0.6,-7.4L0,0 M3,0L3.8,-15L4.6,0 M7.4,0L8.1,-6.6L8.8,0"/>
      <path class="af-place__ink" d="M-9.7,-9H-7.7 M-5.7,-13H-3.5 M2.6,-15H5"/>`,
  },
  'new-york-stories': {
    subject:
      'The street cart under its umbrella. The New York chapter is two frames — a graffitied corner and a Sabrett cart in Times Square — and there is no skyline in either. Drawing the Empire State Building here would have been the archive claiming a picture it does not hold.',
    height: 14.3,
    body: 'M-7,-6.3H7V-2.7H-7Z',
    full: `<path class="af-place__burn" d="M-9.6,-10.7Q0,-17.9 9.6,-10.7 M-7,-6.3H7V-2.7H-7Z"/>
      <path class="af-place__ink" d="M-9.6,-10.7Q0,-17.9 9.6,-10.7"/>
      <path class="af-place__soft" d="M-9.6,-10.7Q-7.2,-8.7 -4.8,-10.5Q-2.4,-8.5 0,-10.7Q2.4,-8.5 4.8,-10.5Q7.2,-8.7 9.6,-10.7"/>
      <path class="af-place__ink" d="M0,-10.7V-6.3"/>
      <path class="af-place__ink" d="M-7,-6.3H7V-2.7H-7Z"/>
      <circle class="af-place__ink" cx="-4.2" cy="-1.3" r="1.3"/>
      <circle class="af-place__ink" cx="4.2" cy="-1.3" r="1.3"/>`,
    silhouette: `<path class="af-place__burn" d="M-9.6,-10.7Q0,-17.9 9.6,-10.7 M-7,-6.3H7V-2.7H-7Z"/>
      <path class="af-place__ink" d="M-9.6,-10.7Q0,-17.9 9.6,-10.7"/>
      <path class="af-place__ink" d="M0,-10.7V-6.3"/>
      <path class="af-place__ink" d="M-7,-6.3H7V-2.7H-7Z"/>
      <circle class="af-place__ink" cx="-4.2" cy="-1.3" r="1.3"/>
      <circle class="af-place__ink" cx="4.2" cy="-1.3" r="1.3"/>`,
  },
};

/**
 * ON COLOUR, kept because it is a measurement and it will come up again.
 *
 * A wall of per-chapter plates on /about coloured each chapter with ink sampled
 * from its own frames. The code is gone (the wall was pulled), but the finding
 * that shaped it should not have to be rediscovered:
 *
 * A hue histogram over all 58 photographs puts FOUR of the six chapters on the
 * same sky blue — Miami 195°, Orlando 195°, Bryce 210°, New York 210°. Only
 * Page (0°, 53% of its ink) and Zion (10-20°, 43%) own a hue. This archive has
 * two colours, red rock and blue sky, because it is shot in the Southwest and
 * Florida, under sky. So per-chapter colour cannot tell chapters apart: it
 * would be four near-identical blues pretending to be a palette. Per-REGION
 * colour can, and reads as a map legend — Arizona #E8654F, Utah #D9A05C,
 * Florida #489CC7, New York #7295DB (its second peak, 220°, because its first
 * sits 10° from Florida's; also the colour its prose reaches for, "water towers
 * against violet sky"). All four clear 4.5:1 on #12160F.
 *
 * Either way the marks ON THE MAP stay white ink. That rule has held twice.
 */

export const landmarkFor = (slug?: string | null): PlaceLandmark | null =>
  (slug && PLACE_LANDMARKS[slug]) || null;

/** What centres a standing glyph on its coordinate. */
export const landmarkLift = (landmark: PlaceLandmark) => landmark.height / 2;
