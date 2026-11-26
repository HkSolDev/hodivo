import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from 'redis';
import {
  attemptSyncEvent,
  enqueueSyncEvents,
  examVersionSyncEvent,
  passageSyncEvent,
  SYNC_STREAM_KEY,
  sourceSyncEvent,
} from '../src/lib/sync-queue.js';

// Set to a disposable Redis to run the stream test, e.g. redis://127.0.0.1:6390.
const liveRedisUrl = process.env.SYNC_TEST_REDIS_URL;

test('sync events name the changed entity for the worker', () => {
  assert.deepEqual(sourceSyncEvent('s1'), {
    entityType: 'SOURCE',
    entityId: 's1',
  });
  assert.deepEqual(examVersionSyncEvent('v1'), {
    entityType: 'TYPING_EXAM_VERSION',
    entityId: 'v1',
  });
  assert.deepEqual(passageSyncEvent('p1'), {
    entityType: 'TYPING_PASSAGE',
    entityId: 'p1',
  });
  assert.deepEqual(attemptSyncEvent('a1'), {
    entityType: 'TYPING_ATTEMPT',
    entityId: 'a1',
  });
});

test('enqueue does nothing without a Redis URL or without events', async () => {
  assert.equal(await enqueueSyncEvents([sourceSyncEvent('s1')], {}), false);
  assert.equal(
    await enqueueSyncEvents([], { SYNC_REDIS_URL: 'redis://127.0.0.1:1' }),
    false,
  );
});

test('enqueue never throws when Redis is unreachable', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const sent = await enqueueSyncEvents([sourceSyncEvent('s1')], {
    SYNC_REDIS_URL: 'redis://127.0.0.1:1',
  });
  assert.equal(sent, false);
  assert.equal(logged.mock.callCount(), 1);
});

test(
  'enqueue appends one stream entry per distinct event',
  { skip: !liveRedisUrl },
  async () => {
    const redis = createClient({ url: liveRedisUrl });
    redis.on('error', () => {});
    await redis.connect();
    try {
      const before = await redis.xLen(SYNC_STREAM_KEY);
      // SYNC_REDIS_URL wins over the jobs cache URL.
      const sent = await enqueueSyncEvents(
        [sourceSyncEvent('s1'), sourceSyncEvent('s1'), attemptSyncEvent('a1')],
        { SYNC_REDIS_URL: liveRedisUrl, JOBS_REDIS_URL: 'redis://127.0.0.1:1' },
      );
      assert.equal(sent, true);
      assert.equal((await redis.xLen(SYNC_STREAM_KEY)) - before, 2);
      const entries = await redis.xRevRange(SYNC_STREAM_KEY, '+', '-', {
        COUNT: 2,
      });
      assert.ok(entries);
      assert.deepEqual(
        entries.map((entry) => ({ ...entry.message })),
        [
          { entityType: 'TYPING_ATTEMPT', entityId: 'a1' },
          { entityType: 'SOURCE', entityId: 's1' },
        ],
      );
    } finally {
      await redis.del(SYNC_STREAM_KEY);
      redis.destroy();
    }
  },
);
