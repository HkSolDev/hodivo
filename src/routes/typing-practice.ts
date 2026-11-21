import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import {
  getPracticePassage,
  getRandomPracticePassage,
  listPracticePassages,
} from '../lib/typing-catalogue.js';
import {
  startTypingCache,
  stopTypingCache,
} from '../lib/typing-passage-cache.js';

const passageId = /^[A-Za-z0-9_-]{1,128}$/;
const unavailable = {
  error: 'Practice passages are temporarily unavailable. Please try again.',
};

export function registerTypingPracticeRoutes(
  app: FastifyInstance,
  loadPassage: () => ReturnType<
    typeof getRandomPracticePassage
  > = getRandomPracticePassage,
  database: Pick<typeof prisma, '$queryRaw'> = prisma,
) {
  app.addHook('onReady', (done) => {
    startTypingCache();
    done();
  });
  app.addHook('onClose', (_app, done) => {
    stopTypingCache();
    done();
  });

  app.get('/api/typing/practice-passages', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const query = new URL(request.url, 'http://localhost').searchParams;
    const cursor = query.get('cursor') ?? undefined;
    if (
      [...query.keys()].some((key) => key !== 'cursor') ||
      query.getAll('cursor').length > 1 ||
      (cursor !== undefined && !passageId.test(cursor))
    ) {
      return reply.code(400).send({ error: 'Invalid passage cursor.' });
    }
    try {
      return await listPracticePassages(10, cursor, database);
    } catch {
      return reply.code(503).send(unavailable);
    }
  });

  app.get<{ Params: { id: string }; Querystring: Record<string, unknown> }>(
    '/api/typing/practice-passages/:id',
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      if (
        !passageId.test(request.params.id) ||
        Object.keys(request.query).length
      ) {
        return reply.code(400).send({ error: 'Invalid passage request.' });
      }
      try {
        const passage = await getPracticePassage(request.params.id, database);
        if (!passage)
          return reply.code(404).send({ error: 'Passage not found.' });
        return { passage };
      } catch {
        return reply.code(503).send(unavailable);
      }
    },
  );

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
        return reply.code(503).send(unavailable);
      }
    },
  );
}
