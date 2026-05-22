import type { QBittorrentConfig } from '@movie-grabber/shared';

/**
 * qBittorrent Web API v2 client.
 * Uses cookie-based authentication.
 */

const FETCH_TIMEOUT = 10_000; // 10s

function qbitRequestOrigin(config: QBittorrentConfig): string {
  return new URL(config.url).origin;
}

function qbitHeaders(
  config: QBittorrentConfig,
  headers?: Record<string, string>,
): Record<string, string> {
  const origin = qbitRequestOrigin(config);
  return {
    ...headers,
    Origin: origin,
    Referer: origin,
  };
}

/** Wrapper around fetch with timeout and friendlier error messages. */
async function qbitFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  } catch (err) {
    const cause = err instanceof Error ? err.cause ?? err : err;
    // Node.js native fetch wraps the real error in `cause`
    const code = (cause as NodeJS.ErrnoException)?.code;
    if (code === 'ECONNREFUSED') {
      throw new Error(`Cannot reach qBittorrent at ${url} — connection refused. Is it running?`);
    }
    if (code === 'ENOTFOUND') {
      throw new Error(`Cannot reach qBittorrent — hostname not found for ${url}`);
    }
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(`qBittorrent request timed out after ${FETCH_TIMEOUT / 1000}s (${url})`);
    }
    throw new Error(`qBittorrent request to ${url} failed: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Log in to qBittorrent and return the session cookie (SID).
 */
export async function login(config: QBittorrentConfig): Promise<string> {
  const res = await qbitFetch(`${config.url}/api/v2/auth/login`, {
    method: 'POST',
    headers: qbitHeaders(config, { 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: new URLSearchParams({
      username: config.username,
      password: config.password,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    const detail = text.trim();
    throw new Error(
      `qBittorrent login failed: HTTP ${res.status}${detail ? ` (${detail})` : ''}`,
    );
  }

  if (text.trim() !== 'Ok.') {
    throw new Error(`qBittorrent login failed: ${text.trim() || 'invalid credentials'}`);
  }

  // Extract SID cookie — Node.js exposes getSetCookie() on Headers
  let sid: string | undefined;
  const cookies: string[] =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') || '').split(/,\s*/);

  for (const cookie of cookies) {
    const match = cookie.match(/SID=([^;]+)/);
    if (match) {
      sid = match[1];
      break;
    }
  }

  if (!sid) {
    throw new Error('qBittorrent login succeeded but no SID cookie returned');
  }

  return sid;
}

export async function testConnection(config: QBittorrentConfig): Promise<string> {
  const sid = await login(config);
  const res = await qbitFetch(`${config.url}/api/v2/app/version`, {
    headers: qbitHeaders(config, { Cookie: `SID=${sid}` }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `qBittorrent version check failed: HTTP ${res.status}${
        detail.trim() ? ` (${detail.trim()})` : ''
      }`,
    );
  }

  return (await res.text()).trim();
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
  await qbitFetch(`${config.url}/api/v2/torrents/createCategory`, {
    method: 'POST',
    headers: qbitHeaders(config, {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `SID=${sid}`,
    }),
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

  const res = await qbitFetch(`${config.url}/api/v2/torrents/add`, {
    method: 'POST',
    headers: qbitHeaders(config, {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `SID=${sid}`,
    }),
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
