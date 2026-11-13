import type { FastifyInstance } from 'fastify';
import { getRandomPracticePassage } from '../lib/typing-catalogue.js';

export function registerTypingPracticeRoutes(
  app: FastifyInstance,
  loadPassage: () => ReturnType<
    typeof getRandomPracticePassage
  > = getRandomPracticePassage,
) {
  app.all<{ Querystring: Record<string, unknown> }>(
    '/api/typing/practice-passage',
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      if (request.method !== 'GET') {
        return reply.code(404).send({ error: 'Not Found' });
      }
      if (Object.keys(request.query).length > 0) {
        return reply
          .code(400)
          .send({ error: 'This endpoint does not accept query parameters.' });
      }
      try {
        return { passage: await loadPassage() };
      } catch {
        return reply.code(503).send({
          error:
            'Practice passages are temporarily unavailable. Please try again.',
        });
      }
    },
  );
}
