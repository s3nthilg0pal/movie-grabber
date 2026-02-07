import type { QBittorrentConfig } from '@movie-grabber/shared';

/**
 * qBittorrent Web API v2 client.
 * Uses cookie-based authentication.
 */

/**
 * Log in to qBittorrent and return the session cookie (SID).
 */
export async function login(config: QBittorrentConfig): Promise<string> {
  const res = await fetch(`${config.url}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username: config.username,
      password: config.password,
    }),
  });

  if (!res.ok) {
    throw new Error(`qBittorrent login failed: HTTP ${res.status}`);
  }

  const text = await res.text();
  if (text.trim() !== 'Ok.') {
    throw new Error('qBittorrent login failed: invalid credentials');
  }

  // Extract SID cookie
  const setCookie = res.headers.get('set-cookie') || '';
  const sidMatch = setCookie.match(/SID=([^;]+)/);
  if (!sidMatch) {
    throw new Error('qBittorrent login succeeded but no SID cookie returned');
  }

  return sidMatch[1];
}

/**
 * Ensure a category exists in qBittorrent. Creates it if it doesn't exist.
 */
export async function ensureCategory(
  config: QBittorrentConfig,
  sid: string,
  category: string,
): Promise<void> {
  // Try to create — qBit returns 200 even if it already exists
  await fetch(`${config.url}/api/v2/torrents/createCategory`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `SID=${sid}`,
    },
    body: new URLSearchParams({ category, savePath: '' }),
  });
}

/**
 * Add a magnet URI to qBittorrent with an optional category.
 */
export async function addMagnet(
  config: QBittorrentConfig,
  magnetUri: string,
  category?: string,
): Promise<void> {
  const sid = await login(config);

  if (category) {
    await ensureCategory(config, sid, category);
  }

  const body = new URLSearchParams({ urls: magnetUri });
  if (category) {
    body.set('category', category);
  }

  const res = await fetch(`${config.url}/api/v2/torrents/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `SID=${sid}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`qBittorrent add magnet failed: HTTP ${res.status}`);
  }

  const text = await res.text();
  if (text.trim() === 'Fails.') {
    throw new Error('qBittorrent rejected the magnet link');
  }
}
