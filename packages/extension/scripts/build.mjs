/**
 * Build script — builds each entry point separately as IIFE so browser
 * content scripts get fully self-contained bundles with no import statements.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = process.argv[2] ?? 'chrome';
if (!['chrome', 'firefox'].includes(target)) {
  throw new Error(`Unknown browser target: ${target}. Use chrome or firefox.`);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = target === 'firefox' ? 'dist-firefox' : 'dist';

const entries = ['content-imdb', 'content-rottentomatoes', 'content-magnet', 'service-worker', 'options'];

for (const entry of entries) {
  console.log(`\n📦 Building ${entry}...`);
  execFileSync(process.execPath, [fileURLToPath(new URL('bin/vite.js', import.meta.resolve('vite/package.json'))), 'build'], {
    cwd: root,
    env: { ...process.env, ENTRY: entry, BROWSER: target },
    stdio: 'inherit',
  });
}

if (target === 'firefox') {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
  // Firefox MV3 uses an event page instead of Chrome's service worker.
  manifest.background = { scripts: ['service-worker.js'] };
  manifest.browser_specific_settings = {
    gecko: {
      id: 'movie-grabber@movie-grabber',
      strict_min_version: '140.0',
      data_collection_permissions: {
        required: ['authenticationInfo', 'websiteContent'],
      },
    },
  };
  writeFileSync(new URL(`../${outDir}/manifest.json`, import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(`\n✅ ${target} extension built in ${outDir}!`);
