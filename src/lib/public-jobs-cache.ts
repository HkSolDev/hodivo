import { clearTimeout, setTimeout } from 'node:timers';
import { createClient } from 'redis';
import { prismaRead } from '../db.js';
import { getPublicJob, listPublicJobs } from './public-jobs.js';
import { JOB_VISITORS_KEY, readJobVisitors } from './job-visitors.js';
import { indiaDateKey } from '../../frontend/india-date.js';

export function createPublicJobsCache(url: string) {
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

  // v2 retires cached payloads built before the HTTPS-only link policy.
  async function readDetail(id: string, database = prismaRead) {
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
        ? `hodivo:jobs:detail:v2:${id}:${row.post}:${row.source}`
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

  async function readListing(
    page: number,
    pageSize: number,
    filters: Parameters<typeof listPublicJobs>[2],
    database = prismaRead,
    now = new Date(),
  ) {
    const popular = filters?.sort === 'popular';
    const fields =
      popular && redis.isReady
        ? await withDeadline(redis.hGetAll(JOB_VISITORS_KEY))
        : undefined;
    const snapshot = fields && readJobVisitors(fields, now.getTime());
    const load = () =>
      listPublicJobs(page, pageSize, filters, database, now, snapshot?.counts);
    if (
      !redis.isReady ||
      page !== 1 ||
      (pageSize !== 10 && pageSize !== 30) ||
      (filters?.sort !== 'newest' && !snapshot) ||
      filters?.q ||
      filters?.qualification
    )
      return load();

    async function version() {
      const [row] = await database.$queryRaw<{ revision: string }[]>`
        SELECT "revision" FROM "JobsListingRevision" WHERE "singleton"
      `;
      return row?.revision;
    }

    const revision = await version().catch(() => undefined);
    if (!revision) return load();
    const date = indiaDateKey(now);
    const key = snapshot
      ? `hodivo:jobs:popular:v2:${date}:${pageSize}:${revision}:${snapshot.revision}`
      : `hodivo:jobs:listing:v2:${date}:${pageSize}:${revision}`;
    const stored = await withDeadline(redis.get(key));
    if (stored) {
      try {
        return JSON.parse(stored) as Awaited<ReturnType<typeof listPublicJobs>>;
      } catch {
        // Treat an unreadable entry as a cache miss.
      }
    }

    const jobs = await load();
    const nextIndiaMidnight = Date.parse(`${date}T18:30:00Z`);
    // A late fill can target only its original revision and India date.
    if (
      stored !== undefined &&
      (await version().catch(() => undefined)) === revision &&
      Date.now() < nextIndiaMidnight
    ) {
      await withDeadline(
        redis.set(key, JSON.stringify(jobs), {
          expiration: {
            type: 'PXAT',
            value: snapshot
              ? Math.min(nextIndiaMidnight, Date.now() + 3_600_000)
              : nextIndiaMidnight,
          },
        }),
      );
    }
    return jobs;
  }

  async function readVisitorCounts(ids: string[]) {
    if (!redis.isReady) return {};
    const fields = ['_refreshedAt', '_revision', ...ids];
    const values = await withDeadline(redis.hmGet(JOB_VISITORS_KEY, fields));
    if (!values) return {};
    const snapshot = readJobVisitors(
      Object.fromEntries(
        fields.flatMap((key, i) =>
          values[i] === null ? [] : [[key, values[i]]],
        ),
      ),
      Date.now(),
    );
    return Object.fromEntries(snapshot?.counts ?? []);
  }

  return {
    readVisitorCounts,
    readDetail,
    readListing,
    close() {
      if (redis.isOpen) redis.destroy();
    },
  };
}
