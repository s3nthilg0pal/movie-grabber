// ─── Media Types ─────────────────────────────────────────────────────────────

export type MediaType = 'movie' | 'series';

export type MediaSource = 'imdb' | 'rottentomatoes';

export interface MediaInfo {
  type: MediaType;
  source: MediaSource;
  title: string;
  year?: number;
  imdbId?: string; // tt1234567 — available from IMDb, not from RT
  url: string; // original page URL
}

// ─── Extension → Service Worker Messages ─────────────────────────────────────

export interface AddMediaMessage {
  action: 'addMedia';
  media: MediaInfo;
}

export interface CheckStatusMessage {
  action: 'checkStatus';
  media: MediaInfo;
}

export type ExtensionMessage = AddMediaMessage | CheckStatusMessage;

export interface ExtensionResponse {
  success: boolean;
  message: string;
  alreadyExists?: boolean;
}

// ─── Extension Settings ──────────────────────────────────────────────────────

export interface ExtensionSettings {
  backendUrl: string;
  radarrApiKey: string;
  radarrUrl: string;
  sonarrApiKey: string;
  sonarrUrl: string;
  radarrQualityProfileId?: number;
  sonarrQualityProfileId?: number;
  radarrRootFolderPath?: string;
  sonarrRootFolderPath?: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  backendUrl: 'http://localhost:3000',
  radarrApiKey: '',
  radarrUrl: 'http://localhost:7878',
  sonarrApiKey: '',
  sonarrUrl: 'http://localhost:8989',
};

// ─── API Request/Response Types ──────────────────────────────────────────────

export interface AddMovieRequest {
  title: string;
  year?: number;
  imdbId?: string;
  qualityProfileId?: number;
  rootFolderPath?: string;
}

export interface AddSeriesRequest {
  title: string;
  year?: number;
  qualityProfileId?: number;
  rootFolderPath?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

export interface MediaStatusResponse {
  exists: boolean;
  title?: string;
  status?: string;
}

// ─── Radarr Types ────────────────────────────────────────────────────────────

export interface RadarrMovie {
  id?: number;
  title: string;
  tmdbId: number;
  imdbId?: string;
  year: number;
  monitored: boolean;
  qualityProfileId: number;
  rootFolderPath: string;
  minimumAvailability: string;
  addOptions?: {
    monitor: string;
    searchForMovie: boolean;
  };
  hasFile?: boolean;
  overview?: string;
  images?: Array<{ coverType: string; remoteUrl: string }>;
}

export interface QualityProfile {
  id: number;
  name: string;
}

export interface RootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

// ─── Sonarr Types ────────────────────────────────────────────────────────────

export interface SonarrSeries {
  id?: number;
  title: string;
  tvdbId: number;
  imdbId?: string;
  year: number;
  monitored: boolean;
  qualityProfileId: number;
  rootFolderPath: string;
  seasonFolder: boolean;
  addOptions?: {
    monitor: string;
    searchForMissingEpisodes: boolean;
    searchForCutoffUnmetEpisodes: boolean;
  };
  overview?: string;
  images?: Array<{ coverType: string; remoteUrl: string }>;
  seasons?: Array<{ seasonNumber: number; monitored: boolean }>;
}

// ─── Config passed via headers from extension ────────────────────────────────

export interface ArrConfig {
  url: string;
  apiKey: string;
  qualityProfileId?: number;
  rootFolderPath?: string;
}
