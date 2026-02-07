import type { FastifyPluginAsync } from 'fastify';
import type { AddMovieRequest, ApiResponse } from '@movie-grabber/shared';
import { extractRadarrConfig } from '../utils/config.js';
import { lookupAndAddMovie } from '../services/radarr.js';

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

  // GET /api/movie/status/:imdbId
  fastify.get<{ Params: { imdbId: string } }>(
    '/status/:imdbId',
    async (req, reply) => {
      try {
        const config = extractRadarrConfig(req);
        const { lookupMovieByImdbId, getExistingMovies } = await import('../services/radarr.js');

        // Lookup the movie to get its tmdbId
        const lookupResult = await lookupMovieByImdbId(config, req.params.imdbId);
        if (!lookupResult) {
          return reply.send({ success: true, data: { exists: false } });
        }

        const movie = Array.isArray(lookupResult) ? lookupResult[0] : lookupResult;
        if (!movie) {
          return reply.send({ success: true, data: { exists: false } });
        }

        const existing = await getExistingMovies(config);
        const found = existing.find((m) => m.tmdbId === movie.tmdbId);

        return reply.send({
          success: true,
          data: {
            exists: !!found,
            title: movie.title,
            status: found ? (found.hasFile ? 'downloaded' : 'monitored') : undefined,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return reply.status(500).send({ success: false, message });
      }
    },
  );
};
