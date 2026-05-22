import type { FastifyPluginAsync } from 'fastify';
import type { AddMovieRequest, ApiResponse, MovieStatusRequest } from '@movie-grabber/shared';
import { extractRadarrConfig } from '../utils/config.js';
import { findExistingMovie, lookupAndAddMovie } from '../services/radarr.js';

const addMovieSchema = {
  body: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1 },
      year: { type: 'number' },
      imdbId: { type: 'string', pattern: '^tt\\d{7,}$' },
      qualityProfileId: { type: 'number' },
      rootFolderPath: { type: 'string' },
    },
  },
};

const movieStatusSchema = {
  body: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1 },
      year: { type: 'number' },
      imdbId: { type: 'string', pattern: '^tt\\d{7,}$' },
    },
  },
};

export const movieRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/movie/add
  fastify.post<{ Body: AddMovieRequest }>(
    '/add',
    { schema: addMovieSchema },
    async (req, reply) => {
      try {
        const config = extractRadarrConfig(req);

        // Override config with per-request body values if provided
        if (req.body.qualityProfileId) config.qualityProfileId = req.body.qualityProfileId;
        if (req.body.rootFolderPath) config.rootFolderPath = req.body.rootFolderPath;

        const result = await lookupAndAddMovie(config, {
          title: req.body.title,
          year: req.body.year,
          imdbId: req.body.imdbId,
        });

        const response: ApiResponse = {
          success: result.success,
          message: result.message,
          data: {
            movie: result.movie,
            alreadyExists: result.alreadyExists,
          },
        };

        return reply.status(result.success ? 200 : 404).send(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        fastify.log.error(err, 'Failed to add movie');
        return reply.status(500).send({
          success: false,
          message,
        } satisfies ApiResponse);
      }
    },
  );

  // POST /api/movie/status
  fastify.post<{ Body: MovieStatusRequest }>(
    '/status',
    { schema: movieStatusSchema },
    async (req, reply) => {
      try {
        const config = extractRadarrConfig(req);
        const found = await findExistingMovie(config, {
          title: req.body.title,
          year: req.body.year,
          imdbId: req.body.imdbId,
        });

        return reply.send({
          success: true,
          message: found
            ? `"${found.title}" is already in Radarr`
            : `"${req.body.title}" is not in Radarr`,
          data: {
            exists: !!found,
            title: found?.title ?? req.body.title,
            status: found ? (found.hasFile ? 'downloaded' : 'monitored') : undefined,
          },
        } satisfies ApiResponse);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return reply.status(500).send({ success: false, message } satisfies ApiResponse);
      }
    },
  );
};
