import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import Fastify from 'fastify';
import { createClient } from 'redis';
import { createAuth, type AppAuth } from '../src/auth/auth.js';
import { requireOperator } from '../src/auth/require-operator.js';
import { requireSession } from '../src/auth/require-session.js';
import { registerAuthRoutes } from '../src/auth/routes.js';
import {
  AUTH_REDIS_KEY_PREFIX,
  createAuthSecondaryStorage,
  type AuthSecondaryStorage,
} from '../src/auth/secondary-storage.js';
import { authDatabase } from './helpers/auth-database.js';
import { mockGoogle } from './helpers/google-fixture.js';

// Set to a disposable Redis to run live round-trip checks, e.g. redis://127.0.0.1:6390.
const liveRedisUrl = process.env.AUTH_TEST_REDIS_URL;
const databaseUrl = process.env.TEST_DATABASE_URL;

const config = {
  origin: 'https://aptus.example',
  secret: 'fictional-test-only-secret-not-for-production-0123456789',
  googleClientId: 'example.apps.googleusercontent.com',
  googleClientSecret: 'fictional-client-secret',
};

const operatorEnv: NodeJS.ProcessEnv = {
  APTUS_REVIEW_OPERATOR_EMAILS: 'example@example.invalid',
};

function signSessionCookie(token: string, secret = config.secret): string {
  const sig = createHmac('sha256', secret).update(token).digest('base64');
  return `__Secure-aptus.session_token=${encodeURIComponent(`${token}.${sig}`)}`;
}

function createMemorySecondaryStorage(): AuthSecondaryStorage & {
  entries: Map<string, { value: string; ttl?: number }>;
} {
  const entries = new Map<string, { value: string; ttl?: number }>();
  const counters = new Map<string, number>();
  return {
    entries,
    get(key) {
      return entries.get(key)?.value ?? null;
    },
    getAndDelete(key) {
      const value = entries.get(key)?.value ?? null;
      entries.delete(key);
      return value;
    },
    increment(key) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    set(key, value, ttl) {
      entries.set(key, { value, ttl });
    },
    delete(key) {
      entries.delete(key);
    },
    close() {},
  };
}

function buildTestServer(t: TestContext, auth: AppAuth) {
  const app = Fastify({ logger: false });
  t.after(() => app.close());
  registerAuthRoutes(app, auth);
  app.get('/private', { preHandler: requireSession(auth) }, (request) => ({
    userId: request.authUserId,
  }));
  app.get(
    '/operator',
    { preHandler: requireOperator(auth, operatorEnv) },
    (request) => ({
      userId: request.authUserId,
      email: request.operatorEmail,
    }),
  );
  return app;
}

await test('secondaryStorage fails closed when Redis is unreachable', async (t) => {
  const storage = createAuthSecondaryStorage('redis://127.0.0.1:1');
  t.after(() => storage.close());

  await assert.rejects(
    async () => await storage.get('missing-session-token'),
    /unavailable|timed out/i,
  );
  await assert.rejects(
    async () => await storage.getAndDelete('missing-session-token'),
    /unavailable|timed out/i,
  );
  await assert.rejects(
    async () => await storage.increment('counter-key', 60),
    /unavailable|timed out/i,
  );
  await assert.rejects(
    async () => await storage.set('example-session-token', '{"ok":true}', 60),
    /unavailable|timed out/i,
  );
  await assert.rejects(
    async () => await storage.delete('example-session-token'),
    /unavailable|timed out/i,
  );
});

await test('unreachable Redis returns 503 on requireSession, requireOperator, and /sign-out', async (t) => {
  const storage = createAuthSecondaryStorage('redis://127.0.0.1:1');
  t.after(() => storage.close());
  const auth = createAuth(config, undefined, storage);
  const app = buildTestServer(t, auth);
  const cookie = signSessionCookie('fictional-unreachable-session-token');

  const sessionRes = await app.inject({ url: '/private', headers: { cookie } });
  assert.equal(sessionRes.statusCode, 503);

  const operatorRes = await app.inject({
    url: '/operator',
    headers: { cookie },
  });
  assert.equal(operatorRes.statusCode, 503);

  const signOutRes = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-out',
    headers: { cookie, origin: config.origin },
    payload: {},
  });
  assert.equal(signOutRes.statusCode, 503);
});

await test('secondaryStorage serves getSession, requireSession, requireOperator, and revokes on /sign-out without DB reads', async (t) => {
  const storage = createMemorySecondaryStorage();
  const token = 'fictional-redis-session-token';
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 86400_000);
  const userId = 'fictional-user-1';

  storage.set(
    token,
    JSON.stringify({
      session: {
        id: 'fictional-session-1',
        token,
        userId,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        ipAddress: null,
        userAgent: null,
      },
      user: {
        id: userId,
        name: 'Example Learner',
        email: 'example@example.invalid',
        emailVerified: true,
        image: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    }),
    7 * 86400,
  );
  storage.set(
    `active-sessions-${userId}`,
    JSON.stringify([{ token, expiresAt: expiresAt.getTime() }]),
    7 * 86400,
  );

  // Use the real auth pipeline without a database; any DB read/write would fail.
  const auth = createAuth(config, undefined, storage);
  const app = buildTestServer(t, auth);
  const cookie = signSessionCookie(token);

  assert.equal(
    (
      await app.inject({
        url: '/api/auth/get-session',
        headers: { cookie },
      })
    ).statusCode,
    200,
  );

  const privateRes = await app.inject({ url: '/private', headers: { cookie } });
  assert.equal(privateRes.statusCode, 200);
  assert.deepEqual(privateRes.json(), { userId });

  const operatorRes = await app.inject({
    url: '/operator',
    headers: { cookie },
  });
  assert.equal(operatorRes.statusCode, 200);
  assert.deepEqual(operatorRes.json(), {
    userId,
    email: 'example@example.invalid',
  });

  const signOutRes = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-out',
    headers: { cookie, origin: config.origin },
    payload: {},
  });
  assert.equal(signOutRes.statusCode, 200);
  assert.equal(storage.get(token), null);
  assert.equal(storage.get(`active-sessions-${userId}`), null);

  for (const url of ['/api/auth/get-session', '/private', '/operator']) {
    assert.equal(
      (await app.inject({ url, headers: { cookie } })).statusCode,
      401,
    );
  }
});

await test(
  'Google OAuth sign-in stores session in secondaryStorage with zero AuthSession DB queries',
  {
    skip:
      !databaseUrl &&
      'Requires TEST_DATABASE_URL; creates and removes an isolated schema',
  },
  async (t) => {
    if (!databaseUrl) throw new Error('Missing test database.');
    const google = mockGoogle(t, config.googleClientId);
    const { database } = await authDatabase(t, databaseUrl);
    const storage = liveRedisUrl
      ? createAuthSecondaryStorage(liveRedisUrl)
      : createMemorySecondaryStorage();
    t.after(() => storage.close());

    let authSessionQueries = 0;
    const guardedDatabase = database.$extends({
      query: {
        authSession: {
          $allOperations({ operation }) {
            authSessionQueries += 1;
            throw new Error(`Unexpected AuthSession.${operation} query`);
          },
        },
      },
    }) as unknown as typeof database;

    const auth = createAuth(config, guardedDatabase, storage);
    const app = buildTestServer(t, auth);

    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      headers: { origin: config.origin },
      payload: { provider: 'google' },
    });
    assert.equal(start.statusCode, 200);
    const redirect: { url: string } = start.json();
    const oauthUrl = new URL(redirect.url);
    google.nonce = oauthUrl.searchParams.get('nonce') ?? '';
    google.challenge = oauthUrl.searchParams.get('code_challenge') ?? '';
    const startCookie = (start.headers['set-cookie'] as string[] | string)
      .toString()
      .split(';')[0];

    const callback = await app.inject({
      url: `/api/auth/callback/google?code=fictional-code&state=${encodeURIComponent(oauthUrl.searchParams.get('state') ?? '')}`,
      headers: { cookie: startCookie },
    });
    assert.equal(callback.statusCode, 302);
    assert.equal(callback.headers.location, `${config.origin}/`);

    const setCookie = callback.headers['set-cookie'];
    const sessionCookie = (
      Array.isArray(setCookie) ? setCookie : [String(setCookie ?? '')]
    )
      .map((entry) => entry.split(';')[0])
      .join('; ');
    assert.match(sessionCookie, /aptus\.session_token=/);

    assert.equal(
      (
        await app.inject({
          url: '/api/auth/get-session',
          headers: { cookie: sessionCookie },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          url: '/private',
          headers: { cookie: sessionCookie },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          url: '/operator',
          headers: { cookie: sessionCookie },
        })
      ).statusCode,
      200,
    );

    const signOut = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie: sessionCookie, origin: config.origin },
      payload: {},
    });
    assert.equal(signOut.statusCode, 200);
    assert.equal(
      (
        await app.inject({
          url: '/private',
          headers: { cookie: sessionCookie },
        })
      ).statusCode,
      401,
    );

    assert.equal(authSessionQueries, 0);
  },
);

await test(
  'secondaryStorage stores, reads, atomically consumes, increments with fixed TTL, and deletes prefixed keys in Redis',
  { skip: !liveRedisUrl },
  async (t) => {
    const storage = createAuthSecondaryStorage(liveRedisUrl!);
    const redis = createClient({ url: liveRedisUrl });
    redis.on('error', () => {});
    await redis.connect();
    t.after(async () => {
      await redis.del([
        `${AUTH_REDIS_KEY_PREFIX}test-token-1`,
        `${AUTH_REDIS_KEY_PREFIX}test-once-1`,
        `${AUTH_REDIS_KEY_PREFIX}test-counter-1`,
      ]);
      storage.close();
      redis.destroy();
    });

    await storage.set('test-token-1', '{"session":{"id":"s1"}}', 120);
    assert.equal(await storage.get('test-token-1'), '{"session":{"id":"s1"}}');
    const ttl = await redis.ttl(`${AUTH_REDIS_KEY_PREFIX}test-token-1`);
    assert.ok(ttl > 0 && ttl <= 120);

    await storage.set('test-once-1', 'one-time', 120);
    assert.equal(await storage.getAndDelete('test-once-1'), 'one-time');
    assert.equal(await storage.get('test-once-1'), null);

    assert.equal(await storage.increment('test-counter-1', 60), 1);
    assert.equal(await storage.increment('test-counter-1', 60), 2);
    const counterTtl = await redis.ttl(
      `${AUTH_REDIS_KEY_PREFIX}test-counter-1`,
    );
    assert.ok(counterTtl > 0 && counterTtl <= 60);

    await storage.set('test-token-1', '{"session":{"id":"s1"}}', 0);
    assert.equal(await storage.get('test-token-1'), null);

    await storage.set('test-token-1', '{"session":{"id":"s1"}}', 120);
    await storage.delete('test-token-1');
    assert.equal(await storage.get('test-token-1'), null);
  },
);
