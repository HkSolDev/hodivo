import { clearTimeout, setTimeout } from 'node:timers';
import { createClient } from 'redis';

// Stream consumed by the sync worker, which copies Neon rows into slave-db.
export const SYNC_STREAM_KEY = 'hodivo:sync:v1';
// Approximate cap so a stopped worker cannot grow Redis without bound.
const STREAM_MAX_LENGTH = 10_000;
const ENQUEUE_DEADLINE_MS = 2_000;

// The worker re-reads the row from Neon, so an event only names what changed:
// - SOURCE: the source and all of its posts (covers replaced or deleted posts)
// - TYPING_EXAM_VERSION: the version, its exam and its passages
// - TYPING_PASSAGE / TYPING_ATTEMPT: that single row
export type SyncEntityType =
  | 'SOURCE'
  | 'TYPING_EXAM_VERSION'
  | 'TYPING_PASSAGE'
  | 'TYPING_ATTEMPT';

export interface SyncEvent {
  entityType: SyncEntityType;
  entityId: string;
}

export const sourceSyncEvent = (id: string): SyncEvent => ({
  entityType: 'SOURCE',
  entityId: id,
});
export const examVersionSyncEvent = (id: string): SyncEvent => ({
  entityType: 'TYPING_EXAM_VERSION',
  entityId: id,
});
export const passageSyncEvent = (id: string): SyncEvent => ({
  entityType: 'TYPING_PASSAGE',
  entityId: id,
});
export const attemptSyncEvent = (id: string): SyncEvent => ({
  entityType: 'TYPING_ATTEMPT',
  entityId: id,
});

function uniqueEvents(events: readonly SyncEvent[]): SyncEvent[] {
  const byKey = new Map(
    events.map((event) => [`${event.entityType}:${event.entityId}`, event]),
  );
  return [...byKey.values()];
}

// Delivery runs after the Neon commit and must never fail the write itself. A
// missed event is repaired later by the worker's full catch-up run.
// A short-lived connection lets CLI scripts exit as soon as they are done.
export async function enqueueSyncEvents(
  events: readonly SyncEvent[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const url = env.SYNC_REDIS_URL?.trim() || env.JOBS_REDIS_URL?.trim();
  const queued = uniqueEvents(events);
  if (!url || queued.length === 0) return false;

  const redis = createClient({
    url,
    socket: { connectTimeout: 500, reconnectStrategy: false },
  });
  redis.on('error', () => {});
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await redis.connect();
        const batch = redis.multi();
        for (const event of queued) {
          batch.xAdd(SYNC_STREAM_KEY, '*', { ...event }, {
            TRIM: {
              strategy: 'MAXLEN',
              strategyModifier: '~',
              threshold: STREAM_MAX_LENGTH,
            },
          });
        }
        await batch.exec();
      })(),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error('Sync enqueue timed out.')),
          ENQUEUE_DEADLINE_MS,
        );
      }),
    ]);
    return true;
  } catch {
    console.error('sync event enqueue failed');
    return false;
  } finally {
    clearTimeout(deadline);
    redis.destroy();
  }
}
