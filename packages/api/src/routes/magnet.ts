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

      // Parse year from clean title like "The Matrix (1999)"
      const yearMatch = title.match(/\(((?:19|20)\d{2})\)\s*$/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
      const searchTitle = yearMatch ? title.replace(/\s*\(\d{4}\)\s*$/, '').trim() : title;

      const results: { arr?: string; qbit?: string; arrOk?: boolean; qbitOk?: boolean } = {};

      // ── Step 1: Add to *arr ──────────────────────────────────────────────
      try {
        if (type === 'movie') {
          const radarrConfig = extractRadarrConfig(req);
          const arrResult = await lookupAndAddMovie(radarrConfig, { title: searchTitle, year });
          results.arr = arrResult.message;
          results.arrOk = arrResult.success;
        } else {
          const sonarrConfig = extractSonarrConfig(req);
          const arrResult = await lookupAndAddSeries(sonarrConfig, { title: searchTitle, year });
          results.arr = arrResult.message;
          results.arrOk = arrResult.success;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        fastify.log.warn(`*arr add failed for "${title}": ${errMsg}`);
        results.arr = errMsg;
        results.arrOk = false;
      }

      // ── Step 2: Send magnet to qBittorrent ───────────────────────────────
      try {
        const qbitConfig = extractQBitConfig(req);
        const cat = category || (type === 'movie' ? 'radarr' : 'sonarr');
        await addMagnetToQBit(qbitConfig, magnetUri, cat);
        results.qbit = `Magnet sent to qBittorrent (category: ${cat})`;
        results.qbitOk = true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        fastify.log.warn(`qBittorrent add failed: ${errMsg}`);
        results.qbit = errMsg;
        results.qbitOk = false;
      }

      const bothOk = results.arrOk === true && results.qbitOk === true;
      const anyOk = results.arrOk === true || results.qbitOk === true;

      // Build a user-visible message summarizing both steps
      const parts: string[] = [];
      const arrLabel = type === 'movie' ? 'Radarr' : 'Sonarr';
      if (results.arrOk) {
        parts.push(`${arrLabel}: ${results.arr}`);
      } else {
        parts.push(`${arrLabel} failed: ${results.arr}`);
      }
      if (results.qbitOk) {
        parts.push(results.qbit!);
      } else {
        parts.push(`qBittorrent failed: ${results.qbit}`);
      }

      const response: ApiResponse = {
        success: bothOk,
        message: parts.join(' | '),
        data: results,
      };

      return reply.status(bothOk ? 200 : anyOk ? 207 : 500).send(response);
    },
  );
};
