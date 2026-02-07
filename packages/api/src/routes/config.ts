import type { FastifyPluginAsync } from 'fastify';
import { extractRadarrConfig, extractSonarrConfig } from '../utils/config.js';
import { getQualityProfiles as getRadarrProfiles, getRootFolders as getRadarrFolders } from '../services/radarr.js';
import { getQualityProfiles as getSonarrProfiles, getRootFolders as getSonarrFolders } from '../services/sonarr.js';

export const configRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/config/profiles — returns quality profiles & root folders from both *arr services
  fastify.get('/profiles', async (req, reply) => {
    const result: Record<string, unknown> = {};

    // Try Radarr
    try {
      const radarrConfig = extractRadarrConfig(req);
      const [profiles, folders] = await Promise.all([
        getRadarrProfiles(radarrConfig),
        getRadarrFolders(radarrConfig),
      ]);
      result.radarr = { profiles, rootFolders: folders };
    } catch {
      result.radarr = { error: 'Radarr not configured or unreachable' };
    }

    // Try Sonarr
    try {
      const sonarrConfig = extractSonarrConfig(req);
      const [profiles, folders] = await Promise.all([
        getSonarrProfiles(sonarrConfig),
        getSonarrFolders(sonarrConfig),
      ]);
      result.sonarr = { profiles, rootFolders: folders };
    } catch {
      result.sonarr = { error: 'Sonarr not configured or unreachable' };
    }

    return reply.send({ success: true, data: result });
  });
};
