import type { FastifyPluginAsync } from 'fastify';
import type { AddMagnetRequest, ApiResponse } from '@movie-grabber/shared';
import { extractRadarrConfig, extractSonarrConfig, extractQBitConfig } from '../utils/config.js';
import { lookupAndAddMovie } from '../services/radarr.js';
import { lookupAndAddSeries } from '../services/sonarr.js';
import { addMagnet as addMagnetToQBit } from '../services/qbittorrent.js';

const addMagnetSchema = {
  body: {
    type: 'object',
    required: ['magnetUri', 'title', 'type'],
    properties: {
      magnetUri: { type: 'string', pattern: '^magnet:\\?' },
      title: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['movie', 'series'] },
      category: { type: 'string' },
    },
  },
};

export const magnetRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/magnet/add
   *
   * 1. Look up the title in Radarr or Sonarr and add it if not present
   * 2. Send the magnet link to qBittorrent with the correct category
   */
  fastify.post<{ Body: AddMagnetRequest }>(
    '/add',
    { schema: addMagnetSchema },
    async (req, reply) => {
      const { magnetUri, title, type, category } = req.body;

      const results: { arr?: string; qbit?: string; error?: string } = {};

      // ── Step 1: Add to *arr ──────────────────────────────────────────────
      try {
        if (type === 'movie') {
          const radarrConfig = extractRadarrConfig(req);
          const arrResult = await lookupAndAddMovie(radarrConfig, { title });
          results.arr = arrResult.message;
        } else {
          const sonarrConfig = extractSonarrConfig(req);
          const arrResult = await lookupAndAddSeries(sonarrConfig, { title });
          results.arr = arrResult.message;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        fastify.log.warn(`*arr add failed for "${title}": ${errMsg}`);
        results.arr = `*arr: ${errMsg}`;
      }

      // ── Step 2: Send magnet to qBittorrent ───────────────────────────────
      try {
        const qbitConfig = extractQBitConfig(req);
        const cat = category || (type === 'movie' ? 'radarr' : 'sonarr');
        await addMagnetToQBit(qbitConfig, magnetUri, cat);
        results.qbit = `Magnet sent to qBittorrent (category: ${cat})`;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        fastify.log.warn(`qBittorrent add failed: ${errMsg}`);
        results.qbit = `qBittorrent: ${errMsg}`;
      }

      const success = !results.qbit?.startsWith('qBittorrent:');
      const response: ApiResponse = {
        success,
        message: success
          ? `Magnet added successfully for "${title}"`
          : `Partial failure for "${title}"`,
        data: results,
      };

      return reply.status(success ? 200 : 207).send(response);
    },
  );
};
