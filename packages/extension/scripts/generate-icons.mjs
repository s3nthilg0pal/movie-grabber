/**
 * Quick script to generate placeholder PNG icons for the Chrome extension.
 * Run with: node packages/extension/scripts/generate-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

// Generate a simple 1x1 pixel PNG (placeholder — replace with real icons)
// This is a minimal valid PNG file (red pixel)
function createMinimalPng(size) {
  // For a proper icon, replace these with real PNG files.
  // This creates a tiny valid PNG that Chrome will accept.
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4] = 37;     // R (blue theme)
    canvas[i * 4 + 1] = 99; // G
    canvas[i * 4 + 2] = 235; // B
    canvas[i * 4 + 3] = 255; // A
  }
  return canvas;
}

// Write placeholder files — in production, replace with actual designed icons
for (const size of [16, 48, 128]) {
  const placeholder = `<!-- Replace with actual ${size}x${size} PNG icon -->`;
  writeFileSync(join(iconsDir, `icon${size}.png`), placeholder);
  console.log(`Created placeholder icon${size}.png`);
}

console.log('\n⚠️  Replace placeholder icons with real PNG files before publishing!');
