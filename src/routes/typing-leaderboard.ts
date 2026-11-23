import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { AppAuth } from '../auth/auth.js';
import type { TypingAttemptMode } from '../../generated/prisma/index.js';
import { TYPING_ID_REGEX, TypingAttemptError } from '../lib/typing-attempts.js';
import {
  getPassageLeaderboard,
  listLeaderboardPassages,
  type TypingLeaderboardDatabase,
} from '../lib/typing-leaderboard.js';

async function resolveOptionalUserId(
  request: FastifyRequest,
  auth: AppAuth | null,
): Promise<string | null> {
  if (!auth) return null;
  try {
    const result = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      query: { disableCookieCache: true, disableRefresh: true },
    });
    if (!result || result.session.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return result.user.id;
  } catch {
    return null;
  }
}

export function registerTypingLeaderboardRoutes(
  app: FastifyInstance,
  auth: AppAuth | null,
  db?: TypingLeaderboardDatabase,
): void {
  app.get('/api/typing/leaderboard/passages', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    try {
      const passages = await listLeaderboardPassages(db);
      return { passages };
    } catch {
      return reply.code(503).send({
        error: 'Leaderboard passages are temporarily unavailable.',
      });
    }
  });

  app.get<{
    Params: { passageId: string };
    Querystring: { mode?: string };
  }>('/api/typing/passages/:passageId/leaderboard', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const { passageId } = request.params;
    if (!TYPING_ID_REGEX.test(passageId)) {
      return reply.code(400).send({ error: 'Invalid passage ID.' });
    }

    const modeParam = request.query.mode?.toUpperCase() ?? 'EXAM';
    if (modeParam !== 'EXAM' && modeParam !== 'PRACTICE') {
      return reply.code(400).send({ error: 'Invalid typing mode.' });
    }
    const mode: TypingAttemptMode = modeParam;

    try {
      const userId = await resolveOptionalUserId(request, auth);
      return await getPassageLeaderboard(passageId, mode, userId, db);
    } catch (error) {
      if (error instanceof TypingAttemptError) {
        return reply.code(error.status).send({ error: error.message });
      }
      return reply.code(503).send({
        error: 'Leaderboard is temporarily unavailable. Please try again.',
      });
    }
  });
}
