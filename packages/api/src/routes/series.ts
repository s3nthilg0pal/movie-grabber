import type { FastifyPluginAsync } from 'fastify';
import type { AddSeriesRequest, ApiResponse } from '@movie-grabber/shared';
import { extractSonarrConfig } from '../utils/config.js';
import { lookupAndAddSeries } from '../services/sonarr.js';

const addSeriesSchema = {
  body: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1 },
      year: { type: 'number' },
      qualityProfileId: { type: 'number' },
      rootFolderPath: { type: 'string' },
    },
  },
};

export const seriesRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/series/add
  fastify.post<{ Body: AddSeriesRequest }>(
    '/add',
    { schema: addSeriesSchema },
    async (req, reply) => {
      try {
        const config = extractSonarrConfig(req);

        if (req.body.qualityProfileId) config.qualityProfileId = req.body.qualityProfileId;
        if (req.body.rootFolderPath) config.rootFolderPath = req.body.rootFolderPath;

        const result = await lookupAndAddSeries(config, {
          title: req.body.title,
          year: req.body.year,
        });

        const response: ApiResponse = {
          success: result.success,
          message: result.message,
          data: {
            series: result.series,
            alreadyExists: result.alreadyExists,
          },
        };

        return reply.status(result.success ? 200 : 404).send(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        fastify.log.error(err, 'Failed to add series');
        return reply.status(500).send({
          success: false,
          message,
        } satisfies ApiResponse);
      }
    },
  );

  // GET /api/series/status/:title
  fastify.get<{ Params: { title: string } }>(
    '/status/:title',
    async (req, reply) => {
      try {
        const config = extractSonarrConfig(req);
        const { getExistingSeries } = await import('../services/sonarr.js');

        const existing = await getExistingSeries(config);
        const found = existing.find(
          (s) => s.title.toLowerCase() === req.params.title.toLowerCase(),
        );

        return reply.send({
          success: true,
          data: {
            exists: !!found,
            title: found?.title,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return reply.status(500).send({ success: false, message });
      }
    },
  );
};
