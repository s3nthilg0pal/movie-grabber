import type { FastifyRequest } from 'fastify';
import type { ArrConfig } from '@movie-grabber/shared';

/**
 * Extract *arr configuration from request headers.
 * The Chrome extension sends these per-request so the backend stays stateless.
 */
export function extractRadarrConfig(req: FastifyRequest): ArrConfig {
  const url = req.headers['x-radarr-url'] as string | undefined;
  const apiKey = req.headers['x-radarr-key'] as string | undefined;
  const qualityProfileId = req.headers['x-radarr-quality-profile'] as string | undefined;
  const rootFolderPath = req.headers['x-radarr-root-folder'] as string | undefined;

  if (!url || !apiKey) {
    throw new Error('Missing Radarr configuration. Provide X-Radarr-Url and X-Radarr-Key headers.');
  }

  return {
    url: url.replace(/\/+$/, ''), // strip trailing slash
    apiKey,
    qualityProfileId: qualityProfileId ? parseInt(qualityProfileId, 10) : undefined,
    rootFolderPath,
  };
}

export function extractSonarrConfig(req: FastifyRequest): ArrConfig {
  const url = req.headers['x-sonarr-url'] as string | undefined;
  const apiKey = req.headers['x-sonarr-key'] as string | undefined;
  const qualityProfileId = req.headers['x-sonarr-quality-profile'] as string | undefined;
  const rootFolderPath = req.headers['x-sonarr-root-folder'] as string | undefined;

  if (!url || !apiKey) {
    throw new Error('Missing Sonarr configuration. Provide X-Sonarr-Url and X-Sonarr-Key headers.');
  }

  return {
    url: url.replace(/\/+$/, ''),
    apiKey,
    qualityProfileId: qualityProfileId ? parseInt(qualityProfileId, 10) : undefined,
    rootFolderPath,
  };
}
