import { clearTimeout, setTimeout } from 'node:timers';
import { createClient } from 'redis';
import { prisma } from '../db.js';
import { getPublicJob } from './public-jobs.js';

export function createJobDetailCache(url: string) {
  const redis = createClient({
    url,
    disableOfflineQueue: true,
    commandsQueueMaxLength: 256,
    socket: { connectTimeout: 500 },
  });
  redis.on('error', () => {});
  void redis.connect().catch(() => {});

  async function withDeadline<T>(command: Promise<T>): Promise<T | undefined> {
    let cancelTimer = () => {};
    try {
      return await Promise.race([
        command,
        new Promise<undefined>((resolve) => {
          const timer = setTimeout(resolve, 150);
          cancelTimer = () => clearTimeout(timer);
        }),
      ]);
    } catch {
      return undefined;
    } finally {
      cancelTimer();
    }
  }

  async function read(id: string, database = prisma) {
    const load = () => getPublicJob(id, database);
    if (!redis.isReady) return load();

    // Committed Post and Source row versions retire keys even during Redis outages.
    async function version() {
      const [row] = await database.$queryRaw<
        { post: string; source: string }[]
      >`
        SELECT p.xmin::text AS post, s.xmin::text AS source
        FROM "Post" p JOIN "Source" s ON s.id = p."sourceId"
        WHERE p.id = ${id}
      `;
      return row
        ? `hodivo:jobs:detail:v1:${id}:${row.post}:${row.source}`
        : null;
    }

    const key = await version();
    if (!key) return null;
    const stored = await withDeadline(redis.get(key));
    if (stored) {
      try {
        return JSON.parse(stored) as NonNullable<
          Awaited<ReturnType<typeof getPublicJob>>
        >;
      } catch {
        // Treat an unreadable entry as a cache miss.
      }
    }
    const job = await load();
    if (stored !== undefined && job && (await version()) === key) {
      await withDeadline(
        redis.set(key, JSON.stringify(job), {
          expiration: { type: 'EX', value: 86_400 },
        }),
      );
    }
    return job;
  }

  return {
    read,
    close() {
      if (redis.isOpen) redis.destroy();
    },
  };
}
