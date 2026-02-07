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

  // Pick best match — filter by year if provided
  let match = results[0];
  if (params.year && results.length > 1) {
    const yearMatch = results.find((s) => s.year === params.year);
    if (yearMatch) match = yearMatch;
  }

  // 2. Check duplicate
  const exists = await seriesExists(config, match.tvdbId);
  if (exists) {
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
