import { resolve } from 'path';
import { defineConfig } from 'vite';

/**
 * Chrome content scripts do NOT support ES modules — they must be IIFE bundles
 * with all code inlined. We build each entry point separately via the build script.
 *
 * Set ENTRY env var to build a specific entry (used by build.mjs).
 */
const allEntries: Record<string, string> = {
  'content-imdb': resolve(__dirname, 'src/content/imdb.ts'),
  'content-rottentomatoes': resolve(__dirname, 'src/content/rottentomatoes.ts'),
  'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
  options: resolve(__dirname, 'src/options/options.ts'),
};

const entry = process.env.ENTRY;

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: entry === undefined || entry === 'content-imdb', // clean only on first
    rollupOptions: {
      input: entry ? { [entry]: allEntries[entry] } : allEntries,
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
      },
    },
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@movie-grabber/shared': resolve(__dirname, '../shared/src'),
    },
  },
});
