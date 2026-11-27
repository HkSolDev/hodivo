import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { registerTypingPracticeRoutes } from './routes/typing-practice.js';
import { registerTypingAttemptsRoutes } from './routes/typing-attempts.js';
import { registerTypingLeaderboardRoutes } from './routes/typing-leaderboard.js';
import { registerTypingExamRoutes } from './routes/typing-exams.js';
import { registerHealthRoute } from './routes/health.js';
import { createPublicJobsCache } from './lib/public-jobs-cache.js';
import { registerPublicRoutes } from './routes/public.js';
import { handleMatch } from './routes/match.js';
import { handleExplain } from './routes/explain.js';
import { handleIngest } from './routes/ingest.js';
import { registerReviewDraftRoutes } from './routes/review-drafts.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerSavedJobsRoutes } from './routes/saved-jobs.js';
import { createAuth, type AppAuth } from './auth/auth.js';
import { readAuthConfig } from './auth/config.js';
import { registerAuthRoutes } from './auth/routes.js';
import { requireSession } from './auth/require-session.js';
import { createAuthSecondaryStorage } from './auth/secondary-storage.js';
import { requireIngestToken } from './auth/require-ingest-token.js';
import {
  logSecurityEvent,
  registerRequestLogging,
  safeLoggingOptions,
} from './lib/logging.js';

// Build without listening so tests and startup use the same configuration.
export function buildApp(
  auth?: AppAuth,
  env: NodeJS.ProcessEnv = process.env,
  database?: Parameters<typeof registerPublicRoutes>[1],
  typingDatabase?: Parameters<typeof registerTypingPracticeRoutes>[1],
  examCatalogue?: Parameters<typeof registerTypingExamRoutes>[1],
) {
  const app = Fastify({
    ...safeLoggingOptions,
    exposeHeadRoutes: false,
    routerOptions: { maxParamLength: 128 },
    trustProxy: false,
    bodyLimit: 1_048_576,
    requestTimeout: 30_000,
    ajv: { customOptions: { removeAdditional: false } },
  });
  registerRequestLogging(app);

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: 'Not Found' });
  });

  app.setErrorHandler((error, request, reply) => {
    const status =
      error instanceof Error && 'statusCode' in error ? error.statusCode : 500;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply
        .code(status)
        .send({ error: 'Please check your request and try again.' });
    }
    request.log.error(
      { event: 'request_failed', reason: 'internal_error' },
      'Request failed',
    );
    return reply
      .code(500)
      .send({ error: 'Something went wrong. Please try again.' });
  });

  registerHealthRoute(app);
  const publicJobsCache = env.JOBS_REDIS_URL
    ? createPublicJobsCache(env.JOBS_REDIS_URL)
    : undefined;
  if (publicJobsCache) {
    app.addHook('onClose', (_app, done) => {
      publicJobsCache.close();
      done();
    });
  }
  registerPublicRoutes(
    app,
    database,
    publicJobsCache?.readDetail,
    publicJobsCache?.readListing,
    publicJobsCache?.readVisitorCounts,
  );
  registerTypingPracticeRoutes(app, typingDatabase);
  registerTypingExamRoutes(app, examCatalogue);
  const config = auth ? null : readAuthConfig(env);
  const authStorage = config?.authRedisUrl
    ? createAuthSecondaryStorage(config.authRedisUrl)
    : undefined;
  if (authStorage) {
    app.addHook('onClose', (_app, done) => {
      authStorage.close();
      done();
    });
  }
  const appAuth =
    auth ?? (config ? createAuth(config, undefined, authStorage) : null);
  if (appAuth) registerAuthRoutes(app, appAuth);
  registerReviewDraftRoutes(app, appAuth, env);
  registerProfileRoutes(app, appAuth);
  registerSavedJobsRoutes(app, appAuth);
  registerTypingAttemptsRoutes(app, appAuth);
  registerTypingLeaderboardRoutes(app, appAuth);
  const options = { schema: { body: { type: 'object' } } };
  const protectedOptions = {
    ...options,
    preHandler: appAuth
      ? requireSession(appAuth)
      : async (_request: FastifyRequest, reply: FastifyReply) =>
          reply.code(503).send({
            error:
              'Sign-in is temporarily unavailable. Please try again later.',
          }),
  };
  app.post<{ Body: Parameters<typeof handleMatch>[0]['body'] }>(
    '/api/match',
    {
      ...protectedOptions,
      onRequest: async (request, reply) => {
        // Check the configured origin before any session lookup or profile write.
        if (appAuth && request.headers.origin !== appAuth.options.baseURL) {
          logSecurityEvent(request, 'origin_rejected', 'origin_mismatch');
          return reply.code(403).header('cache-control', 'no-store').send({
            error:
              'This request could not be verified. Refresh Aptus and try again.',
          });
        }
      },
    },
    handleMatch,
  );
  app.post<{ Body: Parameters<typeof handleExplain>[0]['body'] }>(
    '/api/explain',
    protectedOptions,
    handleExplain,
  );
  app.post<{ Body: Parameters<typeof handleIngest>[0]['body'] }>(
    '/api/internal/ingest',
    { ...options, onRequest: requireIngestToken(env) },
    (request, reply) => handleIngest(request, reply, env),
  );
  return app;
}
