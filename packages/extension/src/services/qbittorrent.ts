import { extension } from '../browser.js';
import type { QBittorrentConfig } from '@movie-grabber/shared';

// qBittorrent requires Origin/Referer to match its Web UI. Fetch cannot set
// these headers reliably, so limit a session rule to our own API requests.
async function prepareRequests(config: QBittorrentConfig): Promise<string> {
  const url = config.url.trim().replace(/\/+$/, '');
  if (!url) throw new Error('qBittorrent URL not configured. Open extension options.');
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an HTTP or HTTPS qBittorrent URL.');
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await extension.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          { header: 'Origin', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: parsed.origin },
          { header: 'Referer', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: `${url}/` },
        ],
      },
      condition: {
        regexFilter: `^${escapedUrl}/api/v2/`,
        initiatorDomains: [new URL(extension.runtime.getURL('/')).hostname],
        resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
      },
    }],
  });
  return url;
}

async function request(url: string, path: string, body?: URLSearchParams): Promise<Response> {
  const response = await fetch(`${url}/api/v2${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    ...(body ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`qBittorrent API error: HTTP ${response.status} ${response.statusText}`);
  return response;
}

async function login(config: QBittorrentConfig): Promise<string> {
  const url = await prepareRequests(config);
  const response = await request(url, '/auth/login', new URLSearchParams({
    username: config.username || 'admin', password: config.password,
  }));
  const text = (await response.text()).trim();
  if (text === 'Fails.') throw new Error('qBittorrent login failed: invalid username or password');
  if (response.status !== 204 && text !== 'Ok.') throw new Error('qBittorrent login returned an unexpected response');
  // The browser stores and sends the session cookie via credentials: include.
  return url;
}

export async function testQbitConnection(config: QBittorrentConfig): Promise<string> {
  const url = await login(config);
  return (await (await request(url, '/app/version')).text()).trim();
}

export async function sendMagnet(config: QBittorrentConfig, magnetUri: string, category: string): Promise<void> {
  const url = await login(config);
  const categories = await (await request(url, '/torrents/categories')).json();
  if (category && !Object.hasOwn(categories, category)) {
    await request(url, '/torrents/createCategory', new URLSearchParams({ category, savePath: '' }));
  }
  const response = await request(url, '/torrents/add', new URLSearchParams({ urls: magnetUri, category }));
  if ((await response.text()).trim() === 'Fails.') throw new Error('qBittorrent rejected the magnet link');
}
