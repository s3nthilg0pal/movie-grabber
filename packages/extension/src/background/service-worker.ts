import type {
  ExtensionMessage,
  ExtensionResponse,
  ExtensionSettings,
  MediaInfo,
  ApiResponse,
} from '@movie-grabber/shared';
import { DEFAULT_SETTINGS } from '@movie-grabber/shared';

/**
 * Service worker — background script for the Chrome extension.
 * Handles messages from content scripts and communicates with the backend API.
 */

async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return result as ExtensionSettings;
}

function buildHeaders(settings: ExtensionSettings): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Radarr config
  if (settings.radarrUrl) headers['X-Radarr-Url'] = settings.radarrUrl;
  if (settings.radarrApiKey) headers['X-Radarr-Key'] = settings.radarrApiKey;
  if (settings.radarrQualityProfileId) {
    headers['X-Radarr-Quality-Profile'] = String(settings.radarrQualityProfileId);
  }
  if (settings.radarrRootFolderPath) headers['X-Radarr-Root-Folder'] = settings.radarrRootFolderPath;

  // Sonarr config
  if (settings.sonarrUrl) headers['X-Sonarr-Url'] = settings.sonarrUrl;
  if (settings.sonarrApiKey) headers['X-Sonarr-Key'] = settings.sonarrApiKey;
  if (settings.sonarrQualityProfileId) {
    headers['X-Sonarr-Quality-Profile'] = String(settings.sonarrQualityProfileId);
  }
  if (settings.sonarrRootFolderPath) headers['X-Sonarr-Root-Folder'] = settings.sonarrRootFolderPath;

  return headers;
}

async function addMedia(media: MediaInfo): Promise<ExtensionResponse> {
  const settings = await getSettings();

  if (!settings.backendUrl) {
    return { success: false, message: 'Backend URL not configured. Open extension options.' };
  }

  const endpoint =
    media.type === 'movie'
      ? `${settings.backendUrl}/api/movie/add`
      : `${settings.backendUrl}/api/series/add`;

  const body = JSON.stringify({
    title: media.title,
    year: media.year,
    ...(media.imdbId ? { imdbId: media.imdbId } : {}),
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: buildHeaders(settings),
    body,
  });

  const data: ApiResponse = await res.json();

  return {
    success: data.success,
    message: data.message,
    alreadyExists: (data.data as Record<string, unknown>)?.alreadyExists === true,
  };
}

async function checkStatus(media: MediaInfo): Promise<ExtensionResponse> {
  const settings = await getSettings();

  if (!settings.backendUrl) {
    return { success: false, message: 'Backend URL not configured.' };
  }

  const endpoint =
    media.type === 'movie'
      ? `${settings.backendUrl}/api/movie/status/${encodeURIComponent(media.imdbId || media.title)}`
      : `${settings.backendUrl}/api/series/status/${encodeURIComponent(media.title)}`;

  const res = await fetch(endpoint, {
    headers: buildHeaders(settings),
  });

  const data: ApiResponse = await res.json();

  return {
    success: data.success,
    message: data.message,
    alreadyExists: (data.data as Record<string, unknown>)?.exists === true,
  };
}

// ─── Message listener ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (r: ExtensionResponse) => void) => {
    const handle = async () => {
      try {
        switch (message.action) {
          case 'addMedia':
            return await addMedia(message.media);
          case 'checkStatus':
            return await checkStatus(message.media);
          default:
            return { success: false, message: 'Unknown action' };
        }
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : 'An unexpected error occurred';
        console.error('[Movie Grabber] Error:', err);
        return { success: false, message: errMsg };
      }
    };

    handle().then(sendResponse);
    return true; // keep channel open for async response
  },
);

console.log('[Movie Grabber] Service worker loaded');
