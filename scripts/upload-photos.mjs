/**
 * Batch Photo Upload Script (State → City structure)
 * Usage: node scripts/upload-photos.mjs                   (upload all)
 *        node scripts/upload-photos.mjs Florida            (upload one state)
 *        node scripts/upload-photos.mjs Florida/Miami      (upload one city)
 *
 * Requires: ANTHROPIC_API_KEY env var for AI naming (optional)
 */

import { createClient } from '@sanity/client';
import exifr from 'exifr';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { createReadStream } from 'fs';

// ─── Config ─────────────────────────────────────────────────────────────────
const PHOTO_ROOT = '/Users/ryan/Desktop/PHOTO';
const SANITY_TOKEN = 'sk3kQRk6iCVf7vXT1NxgxryfDgXpLTf3Ye990cWMyL8mCT8lT4kWgF4NRvbBaUBO40Ddfm88gPfZ9rUsj';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// City folder name → location metadata (fuzzy-matched by lowercase)
const LOCATION_MAP = {
  '66 road':                      { city: '66 Road',          country: 'United States', lat: 35.1983, lng: -111.6513 },
  'grand canyon national park':   { city: 'Grand Canyon',     country: 'United States', lat: 36.1069, lng: -112.1129 },
  'page':                         { city: 'Page',             country: 'United States', lat: 36.9147, lng: -111.4558 },
  'death valley nation park':     { city: 'Death Valley',     country: 'United States', lat: 36.5054, lng: -117.0794 },
  'los angeles':                  { city: 'Los Angeles',      country: 'United States', lat: 34.0522, lng: -118.2437 },
  'san diego':                    { city: 'San Diego',        country: 'United States', lat: 32.7157, lng: -117.1611 },
  'denver':                       { city: 'Denver',           country: 'United States', lat: 39.7392, lng: -104.9903 },
  'rocky mountain national park': { city: 'Rocky Mountain',   country: 'United States', lat: 40.3428, lng: -105.6836 },
  'baltimore':                    { city: 'Baltimore',        country: 'United States', lat: 39.2904, lng: -76.6122 },
  'dc':                           { city: 'Washington DC',    country: 'United States', lat: 38.9072, lng: -77.0369 },
  'miami':                        { city: 'Miami',            country: 'United States', lat: 25.7617, lng: -80.1918 },
  'orlando':                      { city: 'Orlando',          country: 'United States', lat: 28.5383, lng: -81.3792 },
  'macau':                        { city: 'Macau',            country: 'China',         lat: 22.1987, lng: 113.5439 },
  'las vegas':                    { city: 'Las Vegas',        country: 'United States', lat: 36.1699, lng: -115.1398 },
  'new york':                     { city: 'New York',         country: 'United States', lat: 40.7128, lng: -74.006 },
  'bryce canyon national park':   { city: 'Bryce Canyon',     country: 'United States', lat: 37.5930, lng: -112.1871 },
  'capitol reef national park':   { city: 'Capitol Reef',     country: 'United States', lat: 38.2832, lng: -111.2471 },
  'zion national park':           { city: 'Zion',             country: 'United States', lat: 37.2982, lng: -113.0263 },
  'seattle':                      { city: 'Seattle',          country: 'United States', lat: 47.6062, lng: -122.3321 },
};

// State name → style category default
const STATE_STYLE_MAP = {
  'arizona':    'landscape',
  'california': 'landscape',
  'colorado':   'landscape',
  'dmv':        'street',
  'florida':    'street',
  'macau':      'street',
  'nevada':     'street',
  'new york':   'street',
  'utah':       'landscape',
  'washington': 'street',
};

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG', '.HEIC', '.heic']);

// ─── Sanity client ───────────────────────────────────────────────────────────
const sanity = createClient({
  projectId: 'z610fooo',
  dataset: 'production',
  apiVersion: '2024-03-16',
  token: SANITY_TOKEN,
  useCdn: false,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isImage(file) {
  return IMAGE_EXTS.has(extname(file));
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// AI-powered title generation using Claude API
async function generateTitle(cityName, stateName, index, exifData) {
  const locationInfo = LOCATION_MAP[cityName.toLowerCase()] || {};
  const displayCity = locationInfo.city || cityName;

  if (!ANTHROPIC_API_KEY) {
    return `${displayCity} #${String(index + 1).padStart(2, '0')}`;
  }

  const camera = exifData?.Make && exifData?.Model
    ? `${exifData.Make} ${exifData.Model}`
    : 'Unknown Camera';
  const date = exifData?.DateTimeOriginal
    ? new Date(exifData.DateTimeOriginal).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `Create a short, evocative title (3-5 words) for a travel/landscape photo taken in ${displayCity}, ${stateName}${date ? ` in ${date}` : ''} with ${camera}. Reply with ONLY the title, no quotes, no explanation.`,
        }],
      }),
    });
    const data = await resp.json();
    return data.content?.[0]?.text?.trim() ?? `${displayCity} #${String(index + 1).padStart(2, '0')}`;
  } catch {
    return `${displayCity} #${String(index + 1).padStart(2, '0')}`;
  }
}

// Find or create a collection for the city
async function findOrCreateCollection(cityFolderName, stateName) {
  const slug = slugify(cityFolderName);
  const locationInfo = LOCATION_MAP[cityFolderName.toLowerCase()] || {};
  const displayCity = locationInfo.city || cityFolderName;

  // Search for existing collection by slug or name
  const existing = await sanity.fetch(
    `*[_type == "collection" && (slug.current == $slug || lower(name) == $lowerName)][0]{ _id, name }`,
    { slug, lowerName: displayCity.toLowerCase() }
  );

  if (existing) {
    console.log(`  ✓ Found existing collection: "${existing.name}" (${existing._id})`);
    return existing._id;
  }

  // Create new collection
  const doc = {
    _type: 'collection',
    name: displayCity,
    slug: { _type: 'slug', current: slug },
    subtitle: `${displayCity}, ${locationInfo.country || stateName}`,
    location: displayCity,
    year: new Date().getFullYear(),
    description: `A visual journey through ${displayCity}.`,
    featured: false,
    gridSize: 'medium',
  };

  const created = await sanity.create(doc);
  console.log(`  ✓ Created new collection: "${displayCity}" (${created._id})`);
  return created._id;
}

// Upload a single image file to Sanity and return asset reference
async function uploadImage(filePath) {
  const stream = createReadStream(filePath);
  const asset = await sanity.assets.upload('image', stream, {
    filename: basename(filePath),
  });
  return asset._id;
}

// Parse EXIF camera info
function parseCameraInfo(exif) {
  return {
    camera: [exif?.Make, exif?.Model].filter(Boolean).join(' ') || null,
    focalLength: exif?.FocalLength ? `${Math.round(exif.FocalLength)}mm` : null,
    aperture: exif?.FNumber ? `f/${exif.FNumber}` : null,
    shutterSpeed: exif?.ExposureTime
      ? exif.ExposureTime < 1
        ? `1/${Math.round(1 / exif.ExposureTime)}s`
        : `${exif.ExposureTime}s`
      : null,
    iso: exif?.ISO ? String(exif.ISO) : null,
  };
}

// ─── Upload a single city folder ─────────────────────────────────────────────
async function uploadCity(stateName, cityFolderName) {
  const cityPath = join(PHOTO_ROOT, stateName, cityFolderName);
  const locationKey = cityFolderName.toLowerCase().trim();
  const locationInfo = LOCATION_MAP[locationKey];
  const stateStyle = STATE_STYLE_MAP[stateName.toLowerCase()] || 'street';

  // Get image files
  const files = readdirSync(cityPath).filter(isImage);
  if (files.length === 0) {
    console.log(`    ⚠️  No images in ${cityFolderName}, skipping.`);
    return;
  }
  console.log(`    📷 ${cityFolderName}: ${files.length} images`);

  // Find or create collection
  const collectionId = await findOrCreateCollection(cityFolderName, stateName);

  // Check existing photos in this collection to avoid duplicates
  const existingPhotos = await sanity.fetch(
    `count(*[_type == "photo" && collection._ref == $id])`,
    { id: collectionId }
  );
  if (existingPhotos > 0) {
    console.log(`    ℹ️  Collection already has ${existingPhotos} photos. Uploading new ones...`);
  }

  // Upload each photo
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = join(cityPath, file);

    process.stdout.write(`    [${i + 1}/${files.length}] ${file} → `);

    try {
      // Read EXIF
      const exif = await exifr.parse(filePath, {
        pick: ['Make', 'Model', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO', 'DateTimeOriginal'],
      }).catch(() => ({}));

      // Generate title
      const title = await generateTitle(cityFolderName, stateName, existingPhotos + i, exif);

      // Upload image asset
      const assetId = await uploadImage(filePath);

      // Camera info from EXIF
      const cam = parseCameraInfo(exif);

      // Build photo document
      const photoDoc = {
        _type: 'photo',
        title,
        image: {
          _type: 'image',
          asset: { _type: 'reference', _ref: assetId },
        },
        collection: { _type: 'reference', _ref: collectionId },
        styleCategory: stateStyle,
        ...(locationInfo && {
          location: {
            lat: locationInfo.lat,
            lng: locationInfo.lng,
            city: locationInfo.city,
            country: locationInfo.country,
          },
        }),
        ...(cam.camera && { camera: cam.camera }),
        ...(cam.focalLength && { focalLength: cam.focalLength }),
        ...(cam.aperture && { aperture: cam.aperture }),
        ...(cam.shutterSpeed && { shutterSpeed: cam.shutterSpeed }),
        ...(cam.iso && { iso: cam.iso }),
      };

      const created = await sanity.create(photoDoc);
      console.log(`✓ "${title}"`);
    } catch (err) {
      console.log(`✗ Error: ${err.message}`);
    }
  }

  // Set collection cover image to first photo if not set
  try {
    const col = await sanity.fetch(
      `*[_type == "collection" && _id == $id][0]{ coverImage }`,
      { id: collectionId }
    );
    if (!col?.coverImage) {
      const firstPhoto = await sanity.fetch(
        `*[_type == "photo" && collection._ref == $id][0]{ image }`,
        { id: collectionId }
      );
      if (firstPhoto?.image) {
        await sanity.patch(collectionId).set({ coverImage: firstPhoto.image }).commit();
        console.log(`    ✓ Set collection cover image`);
      }
    }
  } catch { /* optional */ }
}

// ─── Upload a state folder ───────────────────────────────────────────────────
async function uploadState(stateName) {
  const statePath = join(PHOTO_ROOT, stateName);

  if (!existsSync(statePath) || !statSync(statePath).isDirectory()) {
    console.error(`  ✗ State folder not found: ${statePath}`);
    return;
  }

  console.log(`\n📁 ${stateName}`);

  // Get city subfolders
  const cities = readdirSync(statePath).filter(
    (f) => statSync(join(statePath, f)).isDirectory()
  );

  if (cities.length === 0) {
    // Check for photos directly in state folder (e.g., Macau)
    const directPhotos = readdirSync(statePath).filter(isImage);
    if (directPhotos.length > 0) {
      console.log(`  📷 Photos directly in ${stateName} (no city subfolders)`);
      // Treat state as city
      await uploadCity(stateName, '.');
    } else {
      console.log(`  ⚠️  No city folders or photos found, skipping.`);
    }
    return;
  }

  for (const city of cities.sort()) {
    await uploadCity(stateName, city);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const target = process.argv[2]; // optional: "Florida" or "Florida/Miami"

  console.log('🚀 Batch Photo Upload (State → City)');
  console.log(`   Source: ${PHOTO_ROOT}`);
  console.log(`   AI naming: ${ANTHROPIC_API_KEY ? '✓ enabled (Claude API)' : '✗ disabled (using city+index)'}`);

  try {
    if (target) {
      if (target.includes('/')) {
        // Specific city: "Florida/Miami"
        const [state, city] = target.split('/');
        console.log(`\n📁 ${state}`);
        await uploadCity(state, city);
      } else {
        // Entire state
        await uploadState(target);
      }
    } else {
      // Upload all states
      const states = readdirSync(PHOTO_ROOT)
        .filter((f) => statSync(join(PHOTO_ROOT, f)).isDirectory())
        .sort();

      console.log(`   Found ${states.length} state folders\n`);

      for (const state of states) {
        await uploadState(state);
      }
    }

    console.log('\n✅ Upload complete! Photos will appear on the site after Cloudflare rebuilds.');
    console.log('   Push to GitHub to trigger auto-deploy, or wait for Sanity webhook.');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
