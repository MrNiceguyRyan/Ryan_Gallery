/**
 * Batch Photo Upload Script
 * Usage: node scripts/upload-photos.mjs [folder-name]
 * Example: node scripts/upload-photos.mjs Miami
 *          node scripts/upload-photos.mjs  (uploads all folders)
 *
 * Requires: ANTHROPIC_API_KEY env var for AI naming (optional)
 */

import { createClient } from '@sanity/client';
import exifr from 'exifr';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { createReadStream } from 'fs';

// ─── Config ─────────────────────────────────────────────────────────────────
const PHOTO_ROOT = '/Users/ryan/Desktop/PHOTO';
const SANITY_TOKEN = 'sk3kQRk6iCVf7vXT1NxgxryfDgXpLTf3Ye990cWMyL8mCT8lT4kWgF4NRvbBaUBO40Ddfm88gPfZ9rUsj';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Folder name → location metadata
const LOCATION_MAP = {
  'new york': { city: 'New York', country: 'United States', lat: 40.7128, lng: -74.006 },
  'miami':    { city: 'Miami',    country: 'United States', lat: 25.7617, lng: -80.1918 },
  'arizona':  { city: 'Phoenix',  country: 'United States', lat: 33.4484, lng: -112.074 },
  'tokyo':    { city: 'Tokyo',    country: 'Japan',         lat: 35.6762, lng: 139.6503 },
  'paris':    { city: 'Paris',    country: 'France',        lat: 48.8566, lng: 2.3522 },
  'greece':   { city: 'Santorini',country: 'Greece',        lat: 36.3932, lng: 25.4615 },
};

// Folder name → style category suggestion
const STYLE_MAP = {
  'new york': 'street',
  'miami':    'street',
  'arizona':  'landscape',
  'tokyo':    'street',
  'paris':    'architecture',
  'greece':   'landscape',
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

function folderKey(name) {
  return name.toLowerCase().trim();
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// AI-powered title generation using Claude API
async function generateTitle(folderName, index, exifData) {
  if (!ANTHROPIC_API_KEY) {
    const city = LOCATION_MAP[folderKey(folderName)]?.city ?? folderName;
    return `${city} #${String(index + 1).padStart(2, '0')}`;
  }

  const camera = exifData?.Make && exifData?.Model
    ? `${exifData.Make} ${exifData.Model}`
    : 'Unknown Camera';
  const date = exifData?.DateTimeOriginal
    ? new Date(exifData.DateTimeOriginal).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';
  const location = LOCATION_MAP[folderKey(folderName)]?.city ?? folderName;

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
          content: `Create a short, evocative title (3-5 words) for a street/travel photo taken in ${location}${date ? ` in ${date}` : ''} with ${camera}. Reply with ONLY the title, no quotes, no explanation.`,
        }],
      }),
    });
    const data = await resp.json();
    return data.content?.[0]?.text?.trim() ?? `${location} #${String(index + 1).padStart(2, '0')}`;
  } catch {
    return `${location} #${String(index + 1).padStart(2, '0')}`;
  }
}

// Find or create a collection for the folder
async function findOrCreateCollection(folderName) {
  const key = folderKey(folderName);
  const slug = slugify(folderName);

  // Search for existing collection
  const existing = await sanity.fetch(
    `*[_type == "collection" && slug.current == $slug][0]{ _id, name }`,
    { slug }
  );

  if (existing) {
    console.log(`  ✓ Found existing collection: "${existing.name}" (${existing._id})`);
    return existing._id;
  }

  // Create new collection
  const location = LOCATION_MAP[key];
  const year = new Date().getFullYear().toString();

  const doc = {
    _type: 'collection',
    name: folderName,
    slug: { _type: 'slug', current: slug },
    subtitle: location ? `${location.city}, ${location.country}` : folderName,
    location: location?.city ?? folderName,
    year,
    description: `A visual journey through ${location?.city ?? folderName}.`,
    featured: false,
  };

  const created = await sanity.create(doc);
  console.log(`  ✓ Created new collection: "${folderName}" (${created._id})`);
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

// ─── Main ────────────────────────────────────────────────────────────────────
async function uploadFolder(folderName) {
  const folderPath = join(PHOTO_ROOT, folderName);
  const key = folderKey(folderName);

  console.log(`\n📁 Processing folder: ${folderName}`);

  // Get image files
  const files = readdirSync(folderPath).filter(isImage);
  if (files.length === 0) {
    console.log('  ⚠️  No images found, skipping.');
    return;
  }
  console.log(`  Found ${files.length} images`);

  // Find or create collection
  const collectionId = await findOrCreateCollection(folderName);
  const location = LOCATION_MAP[key];
  const styleCategory = STYLE_MAP[key] ?? 'street';

  // Upload each photo
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = join(folderPath, file);

    process.stdout.write(`  [${i + 1}/${files.length}] ${file} → `);

    try {
      // Read EXIF
      const exif = await exifr.parse(filePath, {
        pick: ['Make', 'Model', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO', 'DateTimeOriginal'],
      }).catch(() => ({}));

      // Generate title
      const title = await generateTitle(folderName, i, exif);

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
        styleCategory,
        ...(location && {
          location: {
            lat: location.lat,
            lng: location.lng,
            city: location.city,
            country: location.country,
          },
        }),
        ...(cam.camera && { camera: cam.camera }),
        ...(cam.focalLength && { focalLength: cam.focalLength }),
        ...(cam.aperture && { aperture: cam.aperture }),
        ...(cam.shutterSpeed && { shutterSpeed: cam.shutterSpeed }),
        ...(cam.iso && { iso: cam.iso }),
      };

      // Create and immediately publish
      const created = await sanity.create(photoDoc);
      await sanity.patch(created._id).set({}).commit(); // ensure saved

      console.log(`✓ "${title}"`);
    } catch (err) {
      console.log(`✗ Error: ${err.message}`);
    }
  }

  // Set collection cover image to first uploaded photo
  try {
    const firstPhoto = await sanity.fetch(
      `*[_type == "photo" && collection._ref == $id][0]{ image }`,
      { id: collectionId }
    );
    if (firstPhoto?.image) {
      await sanity.patch(collectionId).set({ coverImage: firstPhoto.image }).commit();
      console.log(`  ✓ Set collection cover image`);
    }
  } catch { /* optional */ }
}

async function main() {
  const targetFolder = process.argv[2]; // optional: upload only one folder

  console.log('🚀 Batch Photo Upload');
  console.log(`   Source: ${PHOTO_ROOT}`);
  console.log(`   AI naming: ${ANTHROPIC_API_KEY ? '✓ enabled (Claude API)' : '✗ disabled (using location+index)'}`);

  try {
    if (targetFolder) {
      await uploadFolder(targetFolder);
    } else {
      // Upload all folders
      const folders = readdirSync(PHOTO_ROOT).filter(
        (f) => statSync(join(PHOTO_ROOT, f)).isDirectory()
      );
      for (const folder of folders) {
        await uploadFolder(folder);
      }
    }

    console.log('\n✅ Upload complete! Photos will appear on the site after Vercel redeploys.');
    console.log('   You can also trigger a manual redeploy at https://vercel.com/dashboard');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
