import type { FastifyInstance } from 'fastify';
import {
  getPracticePassageById,
  getRandomPracticePassage,
  type PracticePassage,
} from '../lib/typing-catalogue.js';

const PASSAGE_ID_REGEX = /^[a-z0-9]{1,64}$/;

export function registerTypingPracticeRoutes(
  app: FastifyInstance,
  loadPassage: () => ReturnType<
    typeof getRandomPracticePassage
  > = getRandomPracticePassage,
  loadPassageById: (
    passageId: string,
  ) => Promise<PracticePassage | null> = getPracticePassageById,
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

  app.all<{
    Params: { passageId: string };
    Querystring: Record<string, unknown>;
  }>('/api/typing/practice-passage/:passageId', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (request.method !== 'GET') {
      return reply.code(404).send({ error: 'Not Found' });
    }
    if (Object.keys(request.query).length > 0) {
      return reply
        .code(400)
        .send({ error: 'This endpoint does not accept query parameters.' });
    }
    const { passageId } = request.params;
    if (!PASSAGE_ID_REGEX.test(passageId)) {
      return reply.code(400).send({ error: 'Invalid passage ID.' });
    }
    try {
      const passage = await loadPassageById(passageId);
      if (!passage) {
        return reply.code(404).send({ error: 'Practice passage not found.' });
      }
      return { passage };
    } catch {
      return reply.code(503).send({
        error:
          'Practice passages are temporarily unavailable. Please try again.',
      });
    }
  });
}
