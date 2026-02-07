import type { MediaInfo, ExtensionMessage, ExtensionResponse } from '@movie-grabber/shared';
import { injectButton } from '../ui/button.js';

/**
 * Content script for IMDb title pages.
 * Extracts media info from JSON-LD structured data and injects the "Add" button.
 */

function extractMediaInfo(): MediaInfo | null {
  // 1. Extract IMDb ID from URL
  const match = window.location.pathname.match(/\/title\/(tt\d+)/);
  if (!match) return null;
  const imdbId = match[1];

  // 2. Parse JSON-LD structured data
  const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
  let ldData: Record<string, unknown> | null = null;

  for (const script of ldScripts) {
    try {
      const parsed = JSON.parse(script.textContent || '');
      if (parsed['@type'] === 'Movie' || parsed['@type'] === 'TVSeries') {
        ldData = parsed;
        break;
      }
    } catch {
      // skip invalid JSON
    }
  }

  // 3. Determine type
  let type: 'movie' | 'series';
  if (ldData) {
    type = ldData['@type'] === 'TVSeries' ? 'series' : 'movie';
  } else {
    // Fallback: check og:type meta tag
    const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute('content');
    type = ogType === 'video.tv_show' ? 'series' : 'movie';
  }

  // 4. Extract title
  let title = '';
  if (ldData && typeof ldData['name'] === 'string') {
    title = ldData['name'];
  } else {
    // Fallback: grab from <title> tag — format: "Movie Name (Year) - IMDb"
    const pageTitle = document.title;
    const titleMatch = pageTitle.match(/^(.+?)\s*\(\d{4}\)/);
    title = titleMatch ? titleMatch[1].trim() : pageTitle.replace(/ - IMDb$/, '').trim();
  }

  // 5. Extract year
  let year: number | undefined;
  if (ldData && typeof ldData['datePublished'] === 'string') {
    year = parseInt(ldData['datePublished'].substring(0, 4), 10);
  }
  if (!year) {
    const yearMatch = document.title.match(/\((\d{4})\)/);
    if (yearMatch) year = parseInt(yearMatch[1], 10);
  }

  if (!title) return null;

  return {
    type,
    source: 'imdb',
    title,
    year,
    imdbId,
    url: window.location.href,
  };
}

function init() {
  const media = extractMediaInfo();
  if (!media) {
    console.warn('[Movie Grabber] Could not extract media info from this IMDb page');
    return;
  }

  console.log('[Movie Grabber] Detected:', media);

  const { setState } = injectButton(media.type, async () => {
    setState('loading');

    const message: ExtensionMessage = { action: 'addMedia', media };

    try {
      const response: ExtensionResponse = await chrome.runtime.sendMessage(message);

      if (response.alreadyExists) {
        setState('exists', response.message);
      } else if (response.success) {
        setState('success', response.message);
      } else {
        setState('error', response.message);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to communicate with extension';
      setState('error', errMsg);
    }
  });
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
