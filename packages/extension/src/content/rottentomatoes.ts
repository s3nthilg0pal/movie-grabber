import type { MediaInfo, ExtensionMessage, ExtensionResponse } from '@movie-grabber/shared';
import { injectButton } from '../ui/button.js';

/**
 * Content script for Rotten Tomatoes movie and TV pages.
 * URL patterns:
 *   - Movies: /m/{slug}
 *   - TV:     /tv/{slug}
 */

function extractMediaInfo(): MediaInfo | null {
  const path = window.location.pathname;

  // 1. Determine type from URL
  let type: 'movie' | 'series';
  if (path.startsWith('/m/')) {
    type = 'movie';
  } else if (path.startsWith('/tv/')) {
    type = 'series';
  } else {
    return null;
  }

  // 2. Try JSON-LD first
  let title = '';
  let year: number | undefined;

  const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of ldScripts) {
    try {
      const parsed = JSON.parse(script.textContent || '');
      if (parsed['name'] && (parsed['@type'] === 'Movie' || parsed['@type'] === 'TVSeries')) {
        title = parsed['name'];
        if (parsed['datePublished']) {
          year = parseInt(String(parsed['datePublished']).substring(0, 4), 10);
        } else if (parsed['dateCreated']) {
          year = parseInt(String(parsed['dateCreated']).substring(0, 4), 10);
        }
        break;
      }
    } catch {
      // skip
    }
  }

  // 3. Fallback: extract from DOM
  if (!title) {
    // RT typically has the title in a prominent heading
    const h1 = document.querySelector(
      'h1[data-qa="score-panel-title-link"], h1[slot="titleIntro"], h1',
    );
    if (h1) {
      title = h1.textContent?.trim() || '';
    }
  }

  // 4. Fallback year from page title: "Movie Name (Year)"
  if (!year) {
    const titleMatch = document.title.match(/\((\d{4})\)/);
    if (titleMatch) year = parseInt(titleMatch[1], 10);
  }

  // 5. Another year fallback: look for year in meta or info sections
  if (!year) {
    const yearEl = document.querySelector('[data-qa="score-panel-subtitle"]');
    if (yearEl) {
      const ym = yearEl.textContent?.match(/(\d{4})/);
      if (ym) year = parseInt(ym[1], 10);
    }
  }

  if (!title) return null;

  return {
    type,
    source: 'rottentomatoes',
    title,
    year,
    url: window.location.href,
    // No IMDb ID available from RT
  };
}

function init() {
  const media = extractMediaInfo();
  if (!media) {
    console.warn('[Movie Grabber] Could not extract media info from this Rotten Tomatoes page');
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
