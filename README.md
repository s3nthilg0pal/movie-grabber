# Movie Grabber

A Chrome and Firefox extension that grabs movie/TV series titles from **IMDb** and **Rotten Tomatoes** and adds them to **Radarr** (movies) or **Sonarr** (TV series). Downloads are handled automatically by Radarr/Sonarr's configured download client (e.g., qBittorrent).

## Architecture

```
IMDb/RT Page → Content Script → Extension Background Script
                                  ├→ Radarr API (movies)
                                  ├→ Sonarr API (TV series)
                                  └→ qBittorrent Web UI API (magnet downloads)
```

The extension connects directly to Radarr, Sonarr, and qBittorrent. The Backend API URL is configured independently; service requests use each service's own URL and credentials.

## Project Structure

```
packages/
  shared/     — Shared TypeScript types and magnet parsing
  api/        — Standalone Fastify API for separate integrations
  extension/  — Chrome/Firefox Extension (Manifest V3, TypeScript, Vite)
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

# Build shared types
npm run build:shared

# Build the Chrome extension
npm run build:extension

# Build the Firefox extension
npm run build:extension:firefox
```

## Loading the Extension

### Chrome

1. Run `npm run build:extension`
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select `packages/extension/dist`
6. Click the extension icon → Options to configure your service URLs and API keys

### Firefox (desktop 140+)

1. Run `npm run build:extension:firefox`
2. Open Firefox → `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select `packages/extension/dist-firefox/manifest.json`
5. Open `about:addons` → **Movie Grabber** → **Preferences** to configure the service URLs and API keys
6. Visit an IMDb/Rotten Tomatoes title page to use the floating Add button, or click the toolbar icon on a page with magnet links to open the scanner

Temporary add-ons are removed when Firefox restarts. For permanent installation in standard Firefox, package and sign the Firefox build through [Mozilla Add-ons](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), then install the signed `.xpi`.

Chrome and Firefox builds use separate output folders and can be built in either order. Firefox uses an event page for the background script and native `browser` APIs. The Firefox manifest includes a stable add-on ID (also needed for sync storage) and declares the credentials and website content sent to your configured services. Firefox 140+ supports the [built-in consent prompt](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) for those data types. The extension sends media titles/IDs and magnet links, along with configured service credentials, directly to the configured services to perform requests; it does not send telemetry.

If content buttons or service requests fail, check the extension's **Permissions** in `about:addons` and allow access to IMDb, Rotten Tomatoes, and your service hosts. Reload the page after changing site access.

## Configuration

Open the extension's **Options** page to configure:

- **Backend API URL** — Your backend connection (default: `http://localhost:3000`), with its own connection test
- **Radarr URL** — Your Radarr instance URL (default: `http://localhost:7878`)
- **Radarr API Key** — Found in Radarr → Settings → General → Security
- **Sonarr URL** — Your Sonarr instance URL (default: `http://localhost:8989`)
- **Sonarr API Key** — Found in Sonarr → Settings → General → Security
- **Quality Profiles & Root Folders** — Loaded directly from each service using **Test & Load Profiles**
- **qBittorrent Web UI URL, Username & Password** — Used for direct magnet downloads
- **Movie & TV Categories** — Match the categories used by Radarr/Sonarr in qBittorrent

All service URLs must be reachable from the computer running your browser. The extension supports explicit HTTP URLs for local services and uses host access for direct requests. A request-header rule restricted to its own qBittorrent API calls supplies the Web UI's required origin and referer headers.

## Standalone API Endpoints

The separate API package remains available for other integrations. These endpoints are not used by the extension.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/movie/add` | Add a movie to Radarr |
| `POST` | `/api/series/add` | Add a TV series to Sonarr |
| `POST` | `/api/movie/status` | Check if movie exists in Radarr |
| `POST` | `/api/series/status` | Check if series exists in Sonarr |
| `GET` | `/api/config/profiles` | Get quality profiles & root folders |

All endpoints expect *arr configuration via request headers:
- `X-Radarr-Url`, `X-Radarr-Key`
- `X-Sonarr-Url`, `X-Sonarr-Key`

## How It Works

1. Visit an **IMDb** or **Rotten Tomatoes** movie/TV page
2. The extension detects the media type and title via JSON-LD structured data
3. A floating **"Add to Radarr"** or **"Add to Sonarr"** button appears
4. Click it — the extension connects to Radarr or Sonarr using the configured URL and API key
5. The extension looks up the title, checks for duplicates, and adds it directly
6. Radarr/Sonarr automatically searches indexers and sends downloads to qBittorrent
