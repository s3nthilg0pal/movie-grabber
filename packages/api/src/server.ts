import Fastify from 'fastify';
import cors from '@fastify/cors';
import { movieRoutes } from './routes/movie.js';
import { seriesRoutes } from './routes/series.js';
import { configRoutes } from './routes/config.js';

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
    },
  },
});

await fastify.register(cors, {
  origin: true, // allow all origins (extension has its own origin)
  methods: ['GET', 'POST'],
});

// ─── Health check ────────────────────────────────────────────────────────────
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Routes ──────────────────────────────────────────────────────────────────
await fastify.register(movieRoutes, { prefix: '/api/movie' });
await fastify.register(seriesRoutes, { prefix: '/api/series' });
await fastify.register(configRoutes, { prefix: '/api/config' });

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`Movie Grabber API running on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
