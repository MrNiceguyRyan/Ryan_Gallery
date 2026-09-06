import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export function applicationAssets(html) {
  return [...new Set([...html.matchAll(/(?:src|href|component-url|renderer-url)=["'](\/_astro\/[^"']+)["']/g)]
    .map((match) => match[1].split(/[?#]/)[0]))];
}

export async function inspectRelease(directory = 'dist') {
  const root = resolve(directory);
  const pages = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = resolve(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.html') && !relative(root, path).startsWith(`posters${sep}`)) pages.push(path);
    }
  }
  await walk(root);
  for (const route of ['index.html', 'travel/index.html', 'about/index.html']) {
    if (!pages.includes(resolve(root, route))) throw new Error(`Required page missing: ${route}`);
  }
  const stories = pages.filter((path) => relative(root, path).startsWith(`works${sep}`));
  if (!stories.length) throw new Error('No Collection Story pages were generated');
  const assets = new Set();
  const pageAssets = {};
  for (const page of pages) {
    const html = await readFile(page, 'utf8');
    const route = '/' + relative(root, page).split(sep).join('/').replace(/index\.html$/, '');
    pageAssets[route] = applicationAssets(html);
    if (!/<title>[^<]+<\/title>/.test(html)) throw new Error(`Missing page title: ${relative(root, page)}`);
    for (const asset of applicationAssets(html)) {
      const path = resolve(root, `.${asset}`);
      if (!path.startsWith(root + sep)) throw new Error(`Invalid asset path: ${asset}`);
      if (!(await stat(path)).isFile()) throw new Error(`Missing application asset: ${asset}`);
      assets.add(asset);
    }
  }
  if (!assets.size) throw new Error('No application assets found');
  return {
    pages: pages.map((path) => '/' + relative(root, path).split(sep).join('/').replace(/index\.html$/, '')),
    assets: [...assets],
    stories: stories.length,
    pageAssets,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const release = await inspectRelease(process.argv[2]);
  console.log(`Release check passed: ${release.pages.length} pages, ${release.stories} stories, ${release.assets.length} referenced application assets.`);
}
