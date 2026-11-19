import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppAuth } from '../auth/auth.js';
import { requireSession } from '../auth/require-session.js';
import {
  getPassageComparisonSummary,
  listUserTypingHistory,
  parseAttemptInput,
  saveTypingAttempt,
  TYPING_ID_REGEX,
  TypingAttemptError,
  type TypingAttemptsDatabase,
} from '../lib/typing-attempts.js';

export function registerTypingAttemptsRoutes(
  app: FastifyInstance,
  auth: AppAuth | null,
  db?: TypingAttemptsDatabase,
): void {
  const sessionGuard = auth
    ? requireSession(auth)
    : async (_request: FastifyRequest, reply: FastifyReply) =>
        reply.code(503).send({
          error: 'Sign-in is temporarily unavailable. Please try again later.',
        });

  app.post(
    '/api/typing/attempts',
    {
      preHandler: sessionGuard,
      schema: { body: { type: 'object' } },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const authUserId = request.authUserId;
      if (!authUserId) {
        return reply.code(401).send({ error: 'Please sign in again.' });
      }
      try {
        const input = parseAttemptInput(request.body);
        const result = await saveTypingAttempt(authUserId, input, db);
        return reply.code(201).send(result);
      } catch (error) {
        if (error instanceof TypingAttemptError) {
          return reply.code(error.status).send({ error: error.message });
        }
        return reply.code(503).send({
          error: 'Could not save typing attempt. Please try again.',
        });
      }
    },
  );

  app.get<{ Params: { passageId: string } }>(
    '/api/typing/passages/:passageId/summary',
    { preHandler: sessionGuard },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const authUserId = request.authUserId;
      if (!authUserId) {
        return reply.code(401).send({ error: 'Please sign in again.' });
      }
      const { passageId } = request.params;
      if (!TYPING_ID_REGEX.test(passageId)) {
        return reply.code(400).send({ error: 'Invalid passage ID.' });
      }
      try {
        return await getPassageComparisonSummary(authUserId, passageId, db);
      } catch (error) {
        if (error instanceof TypingAttemptError) {
          return reply.code(error.status).send({ error: error.message });
        }
        return reply.code(503).send({
          error: 'Could not load passage summary. Please try again.',
        });
      }
    },
  );

  app.get<{ Querystring: { limit?: string; cursor?: string } }>(
    '/api/typing/history',
    { preHandler: sessionGuard },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const authUserId = request.authUserId;
      if (!authUserId) {
        return reply.code(401).send({ error: 'Please sign in again.' });
      }
      const { limit: limitRaw, cursor } = request.query;
      let limit: number | undefined;
      if (limitRaw !== undefined) {
        if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limitRaw)) {
          return reply.code(400).send({ error: 'Invalid limit.' });
        }
        limit = Number(limitRaw);
      }
      if (cursor !== undefined && !TYPING_ID_REGEX.test(cursor)) {
        return reply.code(400).send({ error: 'Invalid cursor.' });
      }
      try {
        return await listUserTypingHistory(authUserId, { limit, cursor }, db);
      } catch {
        return reply.code(503).send({
          error: 'Could not load typing history. Please try again.',
        });
      }
    },
  );
}
