import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from 'redis';
import {
  AUTH_REDIS_KEY_PREFIX,
  createAuthSecondaryStorage,
} from '../src/auth/secondary-storage.js';

// Set to a disposable Redis to run live round-trip checks, e.g. redis://127.0.0.1:6390.
const liveRedisUrl = process.env.AUTH_TEST_REDIS_URL;

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
