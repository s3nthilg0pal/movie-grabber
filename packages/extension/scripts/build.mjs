/**
 * Build script — builds each entry point separately as IIFE so Chrome
 * content scripts get fully self-contained bundles with no import statements.
 */
import { execSync } from 'child_process';

const entries = ['content-imdb', 'content-rottentomatoes', 'service-worker', 'options'];

for (const entry of entries) {
  console.log(`\n📦 Building ${entry}...`);
  execSync(`ENTRY=${entry} npx vite build`, { stdio: 'inherit' });
}

console.log('\n✅ All entries built successfully!');
