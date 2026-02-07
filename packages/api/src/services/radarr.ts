import type { ArrConfig, RadarrMovie, QualityProfile, RootFolder } from '@movie-grabber/shared';

/**
 * Generic fetch helper for Radarr API v3.
 */
async function radarrFetch<T>(
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
    throw new Error(`Radarr API error ${res.status}: ${res.statusText} — ${body}`);
  }

  return res.json() as Promise<T>;
}

// ─── Lookup ──────────────────────────────────────────────────────────────────

export async function lookupMovieByImdbId(
  config: ArrConfig,
  imdbId: string,
): Promise<RadarrMovie[]> {
  return radarrFetch<RadarrMovie[]>(config, `/movie/lookup/imdb?imdbId=${encodeURIComponent(imdbId)}`);
}

export async function lookupMovieByTitle(
  config: ArrConfig,
  title: string,
): Promise<RadarrMovie[]> {
  return radarrFetch<RadarrMovie[]>(config, `/movie/lookup?term=${encodeURIComponent(title)}`);
}

// ─── Existing movies ─────────────────────────────────────────────────────────

export async function getExistingMovies(config: ArrConfig): Promise<RadarrMovie[]> {
  return radarrFetch<RadarrMovie[]>(config, '/movie');
}

export async function movieExists(config: ArrConfig, tmdbId: number): Promise<boolean> {
  const movies = await getExistingMovies(config);
  return movies.some((m) => m.tmdbId === tmdbId);
}

// ─── Add movie ───────────────────────────────────────────────────────────────

export async function addMovie(config: ArrConfig, movie: RadarrMovie): Promise<RadarrMovie> {
  // Ensure required defaults
  const payload: RadarrMovie = {
    ...movie,
    monitored: true,
    minimumAvailability: movie.minimumAvailability ?? 'released',
    qualityProfileId: config.qualityProfileId ?? movie.qualityProfileId,
    rootFolderPath: config.rootFolderPath ?? movie.rootFolderPath,
    addOptions: {
      monitor: 'movieOnly',
      searchForMovie: true, // triggers automatic search + download
    },
  };

  return radarrFetch<RadarrMovie>(config, '/movie', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── Configuration helpers ──────────────────────────────────────────────────

export async function getQualityProfiles(config: ArrConfig): Promise<QualityProfile[]> {
  return radarrFetch<QualityProfile[]>(config, '/qualityprofile');
}

export async function getRootFolders(config: ArrConfig): Promise<RootFolder[]> {
  return radarrFetch<RootFolder[]>(config, '/rootfolder');
}

// ─── High-level: lookup + add ────────────────────────────────────────────────

export interface AddMovieResult {
  success: boolean;
  message: string;
  movie?: RadarrMovie;
  alreadyExists?: boolean;
}

export async function lookupAndAddMovie(
  config: ArrConfig,
  params: { title: string; year?: number; imdbId?: string },
): Promise<AddMovieResult> {
  // 1. Lookup
  let results: RadarrMovie[];

  if (params.imdbId) {
    // Wrap in array — Radarr returns a single object for imdb lookup
    const single = await radarrFetch<RadarrMovie>(
      config,
      `/movie/lookup/imdb?imdbId=${encodeURIComponent(params.imdbId)}`,
    );
    results = [single];
  } else {
    results = await lookupMovieByTitle(config, params.title);
  }

  if (!results.length) {
    return { success: false, message: `No movie found for "${params.title}"` };
  }

  // Pick best match — first result if IMDb lookup, or filter by year
  let match = results[0];
  if (params.year && results.length > 1) {
    const yearMatch = results.find((m) => m.year === params.year);
    if (yearMatch) match = yearMatch;
  }

  // 2. Check duplicate
  const exists = await movieExists(config, match.tmdbId);
  if (exists) {
    return { success: true, message: `"${match.title}" already exists in Radarr`, alreadyExists: true };
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
  const added = await addMovie(config, match);
  return {
    success: true,
    message: `"${added.title}" (${added.year}) added to Radarr — searching for downloads`,
    movie: added,
  };
}
