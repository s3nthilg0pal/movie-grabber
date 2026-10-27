import type {
  ArrConfig, ExtensionSettings, ExtensionResponse, MediaInfo, MediaType,
  QualityProfile, RootFolder, RadarrMovie, SonarrSeries,
} from '@movie-grabber/shared';

type LibraryItem = RadarrMovie | SonarrSeries;

export function getArrConfig(settings: ExtensionSettings, type: MediaType): ArrConfig {
  const service = type === 'movie' ? 'radarr' : 'sonarr';
  const label = type === 'movie' ? 'Radarr' : 'Sonarr';
  const url = settings[`${service}Url`].trim().replace(/\/+$/, '');
  const apiKey = settings[`${service}ApiKey`].trim();
  if (!url || !apiKey) throw new Error(`${label} URL and API key are required. Open extension options.`);
  return {
    url, apiKey,
    qualityProfileId: settings[`${service}QualityProfileId`],
    rootFolderPath: settings[`${service}RootFolderPath`],
  };
}

export async function arrFetch<T>(config: ArrConfig, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${config.url}/api/v3${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Service API error: HTTP ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

export async function loadArrProfiles(config: ArrConfig) {
  const [profiles, rootFolders] = await Promise.all([
    arrFetch<QualityProfile[]>(config, '/qualityprofile'),
    arrFetch<RootFolder[]>(config, '/rootfolder'),
  ]);
  return { profiles, rootFolders };
}

const normalizeTitle = (title: string) => title.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();

function findExisting(items: LibraryItem[], media: Pick<MediaInfo, 'title' | 'year' | 'imdbId'> & {
  tmdbId?: number; tvdbId?: number;
}) {
  return items.find((item) => {
    if (media.tmdbId && 'tmdbId' in item && item.tmdbId === media.tmdbId) return true;
    if (media.tvdbId && 'tvdbId' in item && item.tvdbId === media.tvdbId) return true;
    if (media.imdbId && item.imdbId === media.imdbId) return true;
    return normalizeTitle(item.title) === normalizeTitle(media.title)
      && (media.year === undefined || item.year === media.year);
  });
}

async function lookup(config: ArrConfig, media: MediaInfo): Promise<LibraryItem | undefined> {
  if (media.type === 'movie' && media.imdbId) {
    return arrFetch<RadarrMovie>(config, `/movie/lookup/imdb?imdbId=${encodeURIComponent(media.imdbId)}`);
  }
  const resource = media.type === 'movie' ? 'movie' : 'series';
  const term = media.type === 'series' && media.imdbId ? `imdb:${media.imdbId}` : media.title;
  const results = await arrFetch<LibraryItem[]>(config, `/${resource}/lookup?term=${encodeURIComponent(term)}`);
  return results.find((item) => media.year !== undefined && item.year === media.year) ?? results[0];
}

export async function handleMedia(settings: ExtensionSettings, media: MediaInfo, add: boolean): Promise<ExtensionResponse> {
  const config = getArrConfig(settings, media.type);
  const label = media.type === 'movie' ? 'Radarr' : 'Sonarr';
  const resource = media.type === 'movie' ? 'movie' : 'series';
  const items = await arrFetch<LibraryItem[]>(config, `/${resource}`);
  let existing = findExisting(items, media);
  if (existing) return { success: true, alreadyExists: true, message: `"${existing.title}" already exists in ${label}` };

  const match = await lookup(config, media);
  if (match) existing = findExisting(items, match);
  if (existing) return { success: true, alreadyExists: true, message: `"${existing.title}" already exists in ${label}` };
  if (!add) return { success: true, alreadyExists: false, message: `"${media.title}" is not in ${label}` };
  if (!match) return { success: false, message: `No ${resource} found for "${media.title}"` };

  if (!config.qualityProfileId) {
    config.qualityProfileId = (await arrFetch<QualityProfile[]>(config, '/qualityprofile'))[0]?.id;
  }
  if (!config.rootFolderPath) {
    config.rootFolderPath = (await arrFetch<RootFolder[]>(config, '/rootfolder'))[0]?.path;
  }
  if (!config.qualityProfileId || !config.rootFolderPath) {
    throw new Error(`Configure a quality profile and root folder in ${label} first.`);
  }
  const payload = {
    ...match,
    monitored: true,
    qualityProfileId: config.qualityProfileId,
    rootFolderPath: config.rootFolderPath,
    ...(media.type === 'movie' ? {
      minimumAvailability: 'minimumAvailability' in match ? match.minimumAvailability || 'released' : 'released',
      addOptions: { monitor: 'movieOnly', searchForMovie: true },
    } : {
      seasonFolder: true,
      seasons: 'seasons' in match ? match.seasons?.map((season) => ({ ...season, monitored: season.seasonNumber !== 0 })) : undefined,
      addOptions: { monitor: 'all', searchForMissingEpisodes: true, searchForCutoffUnmetEpisodes: false },
    }),
  };
  await arrFetch(config, `/${resource}`, { method: 'POST', body: JSON.stringify(payload) });
  return { success: true, message: `"${match.title}" added to ${label} — searching for downloads` };
}
