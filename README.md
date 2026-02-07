# Movie Grabber

A Chrome extension that grabs movie/TV series titles from **IMDb** and **Rotten Tomatoes** and adds them to **Radarr** (movies) or **Sonarr** (TV series). Downloads are handled automatically by Radarr/Sonarr's configured download client (e.g., qBittorrent).

## Architecture

```
IMDb/RT Page  →  Content Script (extract title/type/ID)
                      ↓ chrome.runtime.sendMessage()
                 Service Worker
                      ↓ fetch()
                 Backend API (Fastify + TypeScript)
                    ├→ Radarr API (movies)  →  [qBittorrent managed internally]
                    └→ Sonarr API (TV)      →  [qBittorrent managed internally]
```

## Project Structure

```
packages/
  shared/     — Shared TypeScript types used by both extension and API
  api/        — Fastify backend server (Radarr/Sonarr proxy)
  extension/  — Chrome Extension (Manifest V3, TypeScript, Vite)
```

## Prerequisites

- Node.js 20+
- Radarr instance with API key
- Sonarr instance with API key
- qBittorrent configured as download client **inside Radarr/Sonarr settings**

## Setup

```bash
# Install dependencies
npm install

# Start the backend API (development mode with hot reload)
npm run dev:api

# Build the Chrome extension
npm run build:extension
```

## Loading the Extension

1. Run `npm run build:extension`
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select `packages/extension/dist`
6. Click the extension icon → Options to configure your backend URL and API keys

## Configuration

Open the extension's **Options** page to configure:

- **Backend API URL** — Where the Fastify server is running (default: `http://localhost:3000`)
- **Radarr URL** — Your Radarr instance URL (default: `http://localhost:7878`)
- **Radarr API Key** — Found in Radarr → Settings → General → Security
- **Sonarr URL** — Your Sonarr instance URL (default: `http://localhost:8989`)
- **Sonarr API Key** — Found in Sonarr → Settings → General → Security
- **Quality Profiles & Root Folders** — Auto-loaded from your *arr instances

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/movie/add` | Add a movie to Radarr |
| `POST` | `/api/series/add` | Add a TV series to Sonarr |
| `GET` | `/api/movie/status/:imdbId` | Check if movie exists in Radarr |
| `GET` | `/api/series/status/:title` | Check if series exists in Sonarr |
| `GET` | `/api/config/profiles` | Get quality profiles & root folders |

All endpoints expect *arr configuration via request headers:
- `X-Radarr-Url`, `X-Radarr-Key`
- `X-Sonarr-Url`, `X-Sonarr-Key`

## How It Works

1. Visit an **IMDb** or **Rotten Tomatoes** movie/TV page
2. The extension detects the media type and title via JSON-LD structured data
3. A floating **"Add to Radarr"** or **"Add to Sonarr"** button appears
4. Click it — the extension sends the media info to your backend API
5. The backend searches Radarr/Sonarr, checks for duplicates, and adds the media
6. Radarr/Sonarr automatically searches indexers and sends downloads to qBittorrent
