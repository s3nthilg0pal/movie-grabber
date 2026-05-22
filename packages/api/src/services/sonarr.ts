import type { ArrConfig, SonarrSeries, QualityProfile, RootFolder } from '@movie-grabber/shared';

/**
 * Generic fetch helper for Sonarr API v3.
 */
async function sonarrFetch<T>(
  config: ArrConfig,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${config.url}/api/v3${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.apiKey,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sonarr API error ${res.status}: ${res.statusText} — ${body}`);
  }

  return res.json() as Promise<T>;
}

function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function selectBestSeriesMatch(results: SonarrSeries[], year?: number): SonarrSeries | undefined {
  if (!results.length) {
    return undefined;
  }

  if (year && results.length > 1) {
    const yearMatch = results.find((series) => series.year === year);
    if (yearMatch) {
      return yearMatch;
    }
  }

  return results[0];
}

function findExistingSeriesInLibrary(
  series: SonarrSeries[],
  params: { title: string; year?: number; tvdbId?: number; imdbId?: string },
): SonarrSeries | undefined {
  const normalizedTitle = normalizeTitle(params.title);

  return series.find((item) => {
    if (params.tvdbId && item.tvdbId === params.tvdbId) {
      return true;
    }

    if (params.imdbId && item.imdbId === params.imdbId) {
      return true;
    }

    if (normalizeTitle(item.title) !== normalizedTitle) {
      return false;
    }

    return params.year === undefined || item.year === params.year;
  });
}

// ─── Lookup ──────────────────────────────────────────────────────────────────

export async function lookupSeriesByTitle(
  config: ArrConfig,
  title: string,
): Promise<SonarrSeries[]> {
  return sonarrFetch<SonarrSeries[]>(config, `/series/lookup?term=${encodeURIComponent(title)}`);
}

// ─── Existing series ─────────────────────────────────────────────────────────

export async function getExistingSeries(config: ArrConfig): Promise<SonarrSeries[]> {
  return sonarrFetch<SonarrSeries[]>(config, '/series');
}

export async function seriesExists(config: ArrConfig, tvdbId: number): Promise<boolean> {
  const series = await getExistingSeries(config);
  return series.some((s) => s.tvdbId === tvdbId);
}

export async function findExistingSeries(
  config: ArrConfig,
  params: { title: string; year?: number },
): Promise<SonarrSeries | undefined> {
  const existingSeries = await getExistingSeries(config);
  const directMatch = findExistingSeriesInLibrary(existingSeries, params);

  if (directMatch) {
    return directMatch;
  }

  const results = await lookupSeriesByTitle(config, params.title).catch(() => []);
  const lookupMatch = selectBestSeriesMatch(results, params.year);

  if (!lookupMatch) {
    return undefined;
  }

  return findExistingSeriesInLibrary(existingSeries, {
    title: lookupMatch.title,
    year: lookupMatch.year,
    tvdbId: lookupMatch.tvdbId,
    imdbId: lookupMatch.imdbId,
  });
}

// ─── Add series ──────────────────────────────────────────────────────────────

export async function addSeries(
  config: ArrConfig,
  series: SonarrSeries,
): Promise<SonarrSeries> {
  const payload: SonarrSeries = {
    ...series,
    monitored: true,
    seasonFolder: true,
    qualityProfileId: config.qualityProfileId ?? series.qualityProfileId,
    rootFolderPath: config.rootFolderPath ?? series.rootFolderPath,
    addOptions: {
      monitor: 'all',
      searchForMissingEpisodes: true, // triggers automatic search + download
      searchForCutoffUnmetEpisodes: false,
    },
  };

  return sonarrFetch<SonarrSeries>(config, '/series', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── Configuration helpers ──────────────────────────────────────────────────

export async function getQualityProfiles(config: ArrConfig): Promise<QualityProfile[]> {
  return sonarrFetch<QualityProfile[]>(config, '/qualityprofile');
}

export async function getRootFolders(config: ArrConfig): Promise<RootFolder[]> {
  return sonarrFetch<RootFolder[]>(config, '/rootfolder');
}

// ─── High-level: lookup + add ────────────────────────────────────────────────

export interface AddSeriesResult {
  success: boolean;
  message: string;
  series?: SonarrSeries;
  alreadyExists?: boolean;
}

export async function lookupAndAddSeries(
  config: ArrConfig,
  params: { title: string; year?: number },
): Promise<AddSeriesResult> {
  // 1. Lookup by title (Sonarr uses TVDB internally, but lookup accepts title)
  const results = await lookupSeriesByTitle(config, params.title);

  if (!results.length) {
    return { success: false, message: `No series found for "${params.title}"` };
  }

  const match = selectBestSeriesMatch(results, params.year);
  if (!match) {
    return { success: false, message: `No series found for "${params.title}"` };
  }

  // 2. Check duplicate
  const existingSeries = await getExistingSeries(config);
  const existing = findExistingSeriesInLibrary(existingSeries, {
    title: match.title,
    year: match.year,
    tvdbId: match.tvdbId,
    imdbId: match.imdbId,
  });
  if (existing) {
    return {
      success: true,
      message: `"${match.title}" already exists in Sonarr`,
      alreadyExists: true,
    };
  }

  // 3. Ensure we have quality profile and root folder
  if (!config.qualityProfileId) {
    const profiles = await getQualityProfiles(config);
    if (profiles.length) config.qualityProfileId = profiles[0].id;
  }
  if (!config.rootFolderPath) {
    const folders = await getRootFolders(config);
    if (folders.length) config.rootFolderPath = folders[0].path;
  }

  // 4. Add
  const added = await addSeries(config, match);
  return {
    success: true,
    message: `"${added.title}" (${added.year}) added to Sonarr — searching for episodes`,
    series: added,
  };
}
