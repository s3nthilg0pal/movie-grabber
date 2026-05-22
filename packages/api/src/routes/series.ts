import type { FastifyPluginAsync } from 'fastify';
import type { AddSeriesRequest, ApiResponse, SeriesStatusRequest } from '@movie-grabber/shared';
import { extractSonarrConfig } from '../utils/config.js';
import { findExistingSeries, lookupAndAddSeries } from '../services/sonarr.js';

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

const seriesStatusSchema = {
  body: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1 },
      year: { type: 'number' },
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

  // POST /api/series/status
  fastify.post<{ Body: SeriesStatusRequest }>(
    '/status',
    { schema: seriesStatusSchema },
    async (req, reply) => {
      try {
        const config = extractSonarrConfig(req);
        const found = await findExistingSeries(config, {
          title: req.body.title,
          year: req.body.year,
        });

        return reply.send({
          success: true,
          message: found
            ? `"${found.title}" is already in Sonarr`
            : `"${req.body.title}" is not in Sonarr`,
          data: {
            exists: !!found,
            title: found?.title ?? req.body.title,
          },
        } satisfies ApiResponse);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return reply.status(500).send({ success: false, message } satisfies ApiResponse);
      }
    },
  );
};
