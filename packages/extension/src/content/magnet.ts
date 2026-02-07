import type { ExtensionResponse, MagnetInfo, MediaType } from '@movie-grabber/shared';
import { parseMagnetUri } from '@movie-grabber/shared';

/**
 * Magnet content script — injected on-demand via chrome.action.onClicked.
 * Scans the page for magnet links, parses them, and shows a floating panel.
 */

const HOST_ID = 'movie-grabber-magnet-root';

// Prevent duplicate injection
if (document.getElementById(HOST_ID)) {
  document.getElementById(HOST_ID)!.remove();
}

// ─── Scan for magnet links ───────────────────────────────────────────────────

function scanMagnets(): MagnetInfo[] {
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href^="magnet:"]');
  const seen = new Set<string>();
  const results: MagnetInfo[] = [];

  for (const link of links) {
    const parsed = parseMagnetUri(link.href);
    if (parsed && !seen.has(parsed.infoHash)) {
      seen.add(parsed.infoHash);
      results.push(parsed);
    }
  }

  return results;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .mg-panel {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    width: 420px;
    max-height: 80vh;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #e2e8f0;
  }

  .mg-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #1e293b;
    background: #1e293b;
  }

  .mg-header h2 {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    color: #f8fafc;
  }

  .mg-header .mg-count {
    font-size: 12px;
    color: #94a3b8;
    font-weight: 400;
  }

  .mg-close {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    padding: 4px;
    border-radius: 4px;
  }

  .mg-close:hover {
    color: #f8fafc;
    background: #334155;
  }

  .mg-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .mg-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 20px;
    border-bottom: 1px solid #1e293b;
  }

  .mg-item:last-child {
    border-bottom: none;
  }

  .mg-item-info {
    flex: 1;
    min-width: 0;
  }

  .mg-item-title {
    font-size: 13px;
    font-weight: 500;
    color: #f1f5f9;
    line-height: 1.4;
    word-break: break-word;
  }

  .mg-item-raw {
    font-size: 11px;
    color: #64748b;
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mg-badges {
    display: flex;
    gap: 6px;
    margin-top: 6px;
    flex-wrap: wrap;
  }

  .mg-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .mg-badge-movie {
    background: #1e3a5f;
    color: #93c5fd;
  }

  .mg-badge-series {
    background: #312e81;
    color: #a5b4fc;
  }

  .mg-add-btn {
    flex-shrink: 0;
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    color: #fff;
    background: #2563eb;
    transition: all 0.15s ease;
    white-space: nowrap;
    align-self: center;
  }

  .mg-add-btn:hover {
    background: #1d4ed8;
  }

  .mg-add-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .mg-add-btn[data-state="success"] {
    background: #16a34a;
  }

  .mg-add-btn[data-state="error"] {
    background: #dc2626;
  }

  .mg-empty {
    padding: 32px 20px;
    text-align: center;
    color: #94a3b8;
    font-size: 14px;
  }

  .mg-toggle-type {
    font-size: 11px;
    padding: 2px 6px;
    border: 1px solid #475569;
    border-radius: 4px;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    margin-left: 4px;
  }

  .mg-toggle-type:hover {
    border-color: #93c5fd;
    color: #93c5fd;
  }
`;

// ─── Build panel ─────────────────────────────────────────────────────────────

const magnets = scanMagnets();

const host = document.createElement('div');
host.id = HOST_ID;
const shadow = host.attachShadow({ mode: 'closed' });

const style = document.createElement('style');
style.textContent = STYLES;
shadow.appendChild(style);

const panel = document.createElement('div');
panel.className = 'mg-panel';

// Header
const header = document.createElement('div');
header.className = 'mg-header';
header.innerHTML = `
  <h2>🧲 Magnet Links <span class="mg-count">(${magnets.length} found)</span></h2>
`;
const closeBtn = document.createElement('button');
closeBtn.className = 'mg-close';
closeBtn.textContent = '✕';
closeBtn.addEventListener('click', () => host.remove());
header.appendChild(closeBtn);
panel.appendChild(header);

// List
const list = document.createElement('div');
list.className = 'mg-list';

if (magnets.length === 0) {
  const empty = document.createElement('div');
  empty.className = 'mg-empty';
  empty.textContent = 'No magnet links found on this page.';
  list.appendChild(empty);
} else {
  for (const magnet of magnets) {
    const item = document.createElement('div');
    item.className = 'mg-item';

    // Track mutable type per item
    let currentType: MediaType = magnet.type;

    const info = document.createElement('div');
    info.className = 'mg-item-info';

    const title = document.createElement('div');
    title.className = 'mg-item-title';
    title.textContent = magnet.cleanTitle;

    const raw = document.createElement('div');
    raw.className = 'mg-item-raw';
    raw.textContent = magnet.title;

    const badges = document.createElement('div');
    badges.className = 'mg-badges';

    const badge = document.createElement('span');
    badge.className = `mg-badge mg-badge-${currentType}`;
    badge.textContent = currentType === 'movie' ? 'Movie' : 'TV Series';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'mg-toggle-type';
    toggleBtn.textContent = '⇄ Switch';
    toggleBtn.title = 'Toggle between Movie / TV Series';
    toggleBtn.addEventListener('click', () => {
      currentType = currentType === 'movie' ? 'series' : 'movie';
      badge.className = `mg-badge mg-badge-${currentType}`;
      badge.textContent = currentType === 'movie' ? 'Movie' : 'TV Series';
    });

    badges.appendChild(badge);
    badges.appendChild(toggleBtn);

    info.appendChild(title);
    info.appendChild(raw);
    info.appendChild(badges);

    const addBtn = document.createElement('button');
    addBtn.className = 'mg-add-btn';
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      addBtn.textContent = 'Adding...';

      try {
        const response: ExtensionResponse = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              action: 'addMagnet',
              magnetUri: magnet.magnetUri,
              title: magnet.cleanTitle,
              type: currentType,
            },
            (res: ExtensionResponse) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(res);
              }
            },
          );
        });

        if (response.success) {
          addBtn.dataset.state = 'success';
          addBtn.textContent = 'Added ✓';
        } else {
          addBtn.dataset.state = 'error';
          addBtn.textContent = 'Failed';
          setTimeout(() => {
            addBtn.dataset.state = '';
            addBtn.textContent = 'Retry';
            addBtn.disabled = false;
          }, 3000);
        }
      } catch (err) {
        addBtn.dataset.state = 'error';
        addBtn.textContent = 'Error';
        setTimeout(() => {
          addBtn.dataset.state = '';
          addBtn.textContent = 'Retry';
          addBtn.disabled = false;
        }, 3000);
      }
    });

    item.appendChild(info);
    item.appendChild(addBtn);
    list.appendChild(item);
  }
}

panel.appendChild(list);
shadow.appendChild(panel);
document.body.appendChild(host);
