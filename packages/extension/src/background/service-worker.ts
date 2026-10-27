import { extension } from '../browser.js';
import { handleMedia } from '../services/arr.js';
import { sendMagnet } from '../services/qbittorrent.js';
import type {
  ExtensionMessage,
  ExtensionResponse,
  ExtensionSettings,
  AddMagnetMessage,
} from '@movie-grabber/shared';
import { DEFAULT_SETTINGS } from '@movie-grabber/shared';

/**
 * Background script — runs as a Chrome service worker or Firefox event page.
 * Handles messages from content scripts and connects directly to configured services.
 */

async function getSettings(): Promise<ExtensionSettings> {
  const result = await extension.storage.sync.get(DEFAULT_SETTINGS);
  return result as ExtensionSettings;
}

async function addMagnetLink(msg: AddMagnetMessage): Promise<ExtensionResponse> {
  const settings = await getSettings();
  const yearMatch = msg.title.match(/\(((?:19|20)\d{2})\)\s*$/);
  const media = {
    type: msg.type, source: 'magnet' as const, url: '',
    title: yearMatch ? msg.title.replace(/\s*\(\d{4}\)\s*$/, '').trim() : msg.title,
    year: yearMatch ? Number(yearMatch[1]) : undefined,
  };
  const label = msg.type === 'movie' ? 'Radarr' : 'Sonarr';
  let arrResult: ExtensionResponse;
  try {
    arrResult = await handleMedia(settings, media, true);
  } catch (err) {
    arrResult = { success: false, message: err instanceof Error ? err.message : String(err) };
  }
  const category = msg.type === 'movie'
    ? settings.qbitMovieCategory || 'radarr'
    : settings.qbitTvCategory || 'sonarr';
  try {
    await sendMagnet({ url: settings.qbitUrl, username: settings.qbitUsername, password: settings.qbitPassword }, msg.magnetUri, category);
    return {
      success: arrResult.success,
      message: `${label}${arrResult.success ? '' : ' failed'}: ${arrResult.message} | Magnet sent to qBittorrent (category: ${category})`,
    };
  } catch (err) {
    return {
      success: false,
      message: `${label}${arrResult.success ? '' : ' failed'}: ${arrResult.message} | qBittorrent failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Extension icon click — inject magnet scanner ────────────────────────────
extension.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await extension.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-magnet.js'],
    });
  } catch (err) {
    console.error('[Movie Grabber] Failed to inject magnet scanner:', err);
  }
});

// ─── Message listener ────────────────────────────────────────────────────────
extension.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (r: ExtensionResponse) => void) => {
    const handle = async () => {
      try {
        switch (message.action) {
          case 'addMedia':
            return await handleMedia(await getSettings(), message.media, true);
          case 'checkStatus':
            return await handleMedia(await getSettings(), message.media, false);
          case 'addMagnet':
            return await addMagnetLink(message);
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

console.log('[Movie Grabber] Background script loaded');
