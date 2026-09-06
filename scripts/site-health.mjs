import { applicationAssets, inspectRelease } from './release-check.mjs';

// One-shot availability check; no visitor script or tracking is installed.
const base = new URL(process.argv[2] || 'https://ryanxugallery.com');
if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) {
  throw new Error('Expected an HTTP(S) site URL without credentials');
}
const release = await inspectRelease(process.argv[3]);
let failures = 0;
for (const path of [...release.pages.filter((path) => path !== '/404.html'), ...release.assets]) {
  try {
    const response = await fetch(new URL(path, base.origin), { signal: AbortSignal.timeout(15000), redirect: 'follow' });
    if (new URL(response.url).origin !== base.origin) throw new Error('Unexpected cross-origin redirect');
    const type = response.headers.get('content-type') || '';
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (path.startsWith('/_astro/')) {
      if (path.endsWith('.js') && !/(java|ecma)script/i.test(type)) throw new Error(`Expected JavaScript, got ${type}`);
      if (path.endsWith('.css') && !/text\/css/i.test(type)) throw new Error(`Expected CSS, got ${type}`);
      await response.body?.cancel();
    } else {
      if (!/text\/html/i.test(type)) throw new Error(`Expected HTML, got ${type}`);
      const html = await response.text();
      if (!/<title>[^<]*Ryan/i.test(html)) throw new Error('Expected gallery page title');
      const liveAssets = new Set(applicationAssets(html));
      if (release.pageAssets[path].some((asset) => !liveAssets.has(asset))) {
        throw new Error('Page is not serving the expected release assets');
      }
    }
    console.log(`PASS ${path}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${path}: ${error.message}`);
  }
}
if (failures) throw new Error(`${failures} availability checks failed; inspect before rolling back or re-deploying`);
console.log(`Availability check passed for ${base.origin}. This does not test browser interactions or frame rate.`);
