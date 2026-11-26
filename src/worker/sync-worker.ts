import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import 'dotenv/config';
import { createClient } from 'redis';
import { Prisma, type PrismaClient } from '../../generated/prisma/index.js';
import { prisma, prismaRead } from '../db.js';
import { notifyJobsRevalidated } from '../lib/notify-jobs-revalidation.js';
import {
  SYNC_STREAM_KEY,
  type SyncEntityType,
  type SyncEvent,
} from '../lib/sync-queue.js';

export const SYNC_GROUP_NAME = 'hodivo-sync-workers';

const VALID_ENTITY_TYPES = new Set<SyncEntityType>([
  'SOURCE',
  'TYPING_EXAM_VERSION',
  'TYPING_PASSAGE',
  'TYPING_ATTEMPT',
]);

const MAX_BACKOFF_MS = 30_000;

function toJsonInput(
  value: Prisma.JsonValue | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null || value === undefined
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);
}

export function parseStreamEvent(
  fields: Record<string, string>,
): SyncEvent | null {
  const entityType = fields.entityType as SyncEntityType | undefined;
  const entityId = fields.entityId?.trim();
  if (!entityType || !VALID_ENTITY_TYPES.has(entityType) || !entityId) {
    return null;
  }
  return { entityType, entityId };
}

export async function syncSource(
  sourceId: string,
  master: PrismaClient = prisma,
  slave: PrismaClient = prismaRead,
): Promise<{ postIds: string[] }> {
  const source = await master.source.findUnique({
    where: { id: sourceId },
    include: { posts: true },
  });

  if (!source) {
    await slave.$transaction([
      slave.post.deleteMany({ where: { sourceId } }),
      slave.source.deleteMany({ where: { id: sourceId } }),
    ]);
    return { postIds: [] };
  }

  const { posts, ...sourceData } = source;
  const postIds = posts.map((post) => post.id);

  await slave.$transaction(async (tx) => {
    await tx.source.upsert({
      where: { id: source.id },
      create: sourceData,
      update: sourceData,
    });

    for (const post of posts) {
      // Omit ExtractionCandidate FK so internal review drafts stay out of slave-db.
      const row = {
        ...post,
        extractionCandidateId: null,
        candidatePostIndex: null,
        categoryRelaxationRules: toJsonInput(post.categoryRelaxationRules),
        eligibilityRules: toJsonInput(post.eligibilityRules),
        reviewedDetails: toJsonInput(post.reviewedDetails),
      };
      await tx.post.upsert({
        where: { id: post.id },
        create: row,
        update: row,
      });
    }

    await tx.post.deleteMany({
      where: {
        sourceId: source.id,
        ...(postIds.length > 0 ? { id: { notIn: postIds } } : {}),
      },
    });
  });

  return { postIds };
}

export async function syncTypingExamVersion(
  versionId: string,
  master: PrismaClient = prisma,
  slave: PrismaClient = prismaRead,
): Promise<void> {
  const version = await master.typingExamVersion.findUnique({
    where: { id: versionId },
    include: { exam: true, passages: true },
  });

  if (!version) {
    await slave.$transaction([
      slave.typingPassage.deleteMany({ where: { examVersionId: versionId } }),
      slave.typingExamVersion.deleteMany({ where: { id: versionId } }),
    ]);
    return;
  }

  const { exam, passages, ...versionData } = version;
  const passageIds = passages.map((passage) => passage.id);

  await slave.$transaction(async (tx) => {
    await tx.typingExam.upsert({
      where: { id: exam.id },
      create: exam,
      update: exam,
    });
    await tx.typingExamVersion.upsert({
      where: { id: version.id },
      create: versionData,
      update: versionData,
    });
    for (const passage of passages) {
      await tx.typingPassage.upsert({
        where: { id: passage.id },
        create: passage,
        update: passage,
      });
    }
    await tx.typingPassage.deleteMany({
      where: {
        examVersionId: version.id,
        ...(passageIds.length > 0 ? { id: { notIn: passageIds } } : {}),
      },
    });
  });
}

export async function syncTypingPassage(
  passageId: string,
  master: PrismaClient = prisma,
  slave: PrismaClient = prismaRead,
): Promise<void> {
  const passage = await master.typingPassage.findUnique({
    where: { id: passageId },
    include: { examVersion: { include: { exam: true } } },
  });

  if (!passage) {
    await slave.typingPassage.deleteMany({ where: { id: passageId } });
    return;
  }

  const { examVersion, ...passageData } = passage;
  const { exam, ...versionData } = examVersion;

  await slave.$transaction(async (tx) => {
    await tx.typingExam.upsert({
      where: { id: exam.id },
      create: exam,
      update: exam,
    });
    await tx.typingExamVersion.upsert({
      where: { id: versionData.id },
      create: versionData,
      update: versionData,
    });
    await tx.typingPassage.upsert({
      where: { id: passage.id },
      create: passageData,
      update: passageData,
    });
  });
}

export async function syncTypingAttempt(
  attemptId: string,
  master: PrismaClient = prisma,
  slave: PrismaClient = prismaRead,
): Promise<void> {
  const attempt = await master.typingAttempt.findUnique({
    where: { id: attemptId },
    include: {
      authUser: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!attempt) {
    await slave.typingAttempt.deleteMany({ where: { id: attemptId } });
    return;
  }

  const existingPassage = await slave.typingPassage.findUnique({
    where: { id: attempt.passageId },
    select: { id: true },
  });
  if (!existingPassage) {
    await syncTypingPassage(attempt.passageId, master, slave);
  }

  const { authUser, ...attemptData } = attempt;

  await slave.$transaction(async (tx) => {
    await tx.authUser.upsert({
      where: { id: authUser.id },
      create: authUser,
      update: { name: authUser.name, updatedAt: authUser.updatedAt },
    });
    await tx.typingAttempt.upsert({
      where: { id: attempt.id },
      create: attemptData,
      update: attemptData,
    });
  });
}

export async function applySyncEvent(
  event: SyncEvent,
  master: PrismaClient = prisma,
  slave: PrismaClient = prismaRead,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (master === slave) {
    throw new Error('SLAVE_DATABASE_URL must differ from DATABASE_URL.');
  }

  switch (event.entityType) {
    case 'SOURCE': {
      const { postIds } = await syncSource(event.entityId, master, slave);
      await Promise.all(postIds.map((id) => notifyJobsRevalidated(env, id)));
      await notifyJobsRevalidated(env);
      return;
    }
    case 'TYPING_EXAM_VERSION':
      await syncTypingExamVersion(event.entityId, master, slave);
      return;
    case 'TYPING_PASSAGE':
      await syncTypingPassage(event.entityId, master, slave);
      return;
    case 'TYPING_ATTEMPT':
      await syncTypingAttempt(event.entityId, master, slave);
      return;
  }
}

export async function runBackfill(
  master: PrismaClient = prisma,
  slave: PrismaClient = prismaRead,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  sources: number;
  examVersions: number;
  attempts: number;
}> {
  if (master === slave) {
    throw new Error('SLAVE_DATABASE_URL must differ from DATABASE_URL.');
  }

  const masterSources = await master.source.findMany({ select: { id: true } });
  const sourceIds = masterSources.map((row) => row.id);
  for (const id of sourceIds) {
    await syncSource(id, master, slave);
  }
  await slave.post.deleteMany({
    where: sourceIds.length > 0 ? { sourceId: { notIn: sourceIds } } : {},
  });
  await slave.source.deleteMany({
    where: sourceIds.length > 0 ? { id: { notIn: sourceIds } } : {},
  });

  const masterVersions = await master.typingExamVersion.findMany({
    select: { id: true },
  });
  const versionIds = masterVersions.map((row) => row.id);
  for (const id of versionIds) {
    await syncTypingExamVersion(id, master, slave);
  }

  const masterAttempts = await master.typingAttempt.findMany({
    select: { id: true },
  });
  const attemptIds = masterAttempts.map((row) => row.id);
  for (const id of attemptIds) {
    await syncTypingAttempt(id, master, slave);
  }
  await slave.typingAttempt.deleteMany({
    where: attemptIds.length > 0 ? { id: { notIn: attemptIds } } : {},
  });

  await slave.typingPassage.deleteMany({
    where:
      versionIds.length > 0 ? { examVersionId: { notIn: versionIds } } : {},
  });
  await slave.typingExamVersion.deleteMany({
    where: versionIds.length > 0 ? { id: { notIn: versionIds } } : {},
  });

  await notifyJobsRevalidated(env);

  return {
    sources: sourceIds.length,
    examVersions: versionIds.length,
    attempts: attemptIds.length,
  };
}

async function ensureConsumerGroup(
  redis: Pick<ReturnType<typeof createClient>, 'xGroupCreate'>,
  group: string,
): Promise<void> {
  try {
    await redis.xGroupCreate(SYNC_STREAM_KEY, group, '0', { MKSTREAM: true });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) {
      throw error;
    }
  }
}

async function runWorker(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const redisUrl = env.SYNC_REDIS_URL?.trim() || env.JOBS_REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error('SYNC_REDIS_URL or JOBS_REDIS_URL is required.');
  }
  if (prisma === prismaRead) {
    throw new Error('SLAVE_DATABASE_URL is required for sync-worker.');
  }

  const redis = createClient({ url: redisUrl });
  redis.on('error', () => {});
  await redis.connect();
  await ensureConsumerGroup(redis, SYNC_GROUP_NAME);

  const consumer = `worker-${process.pid}`;
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  let readPending = true;
  let backoffMs = 1_000;

  console.log(`sync-worker listening on ${SYNC_STREAM_KEY} (${consumer})`);

  try {
    while (!stopping) {
      try {
        const response = await redis.xReadGroup(
          SYNC_GROUP_NAME,
          consumer,
          { key: SYNC_STREAM_KEY, id: readPending ? '0' : '>' },
          { COUNT: 20, BLOCK: 5_000 },
        );

        const messages = response?.[0]?.messages ?? [];
        if (messages.length === 0) {
          if (readPending) readPending = false;
          backoffMs = 1_000;
          continue;
        }

        for (const entry of messages) {
          if (stopping) break;
          const event = parseStreamEvent(entry.message);
          if (event) {
            await applySyncEvent(event, prisma, prismaRead, env);
          }
          await redis.xAck(SYNC_STREAM_KEY, SYNC_GROUP_NAME, entry.id);
        }
        backoffMs = 1_000;
      } catch (error) {
        if (stopping) break;
        const message =
          error instanceof Error ? error.message : 'sync-worker cycle failed';
        if (message.includes('NOGROUP')) {
          await ensureConsumerGroup(redis, SYNC_GROUP_NAME).catch(() => {});
          continue;
        }
        console.error(`sync-worker error (retrying in ${backoffMs}ms): ${message}`);
        await delay(backoffMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      }
    }
  } finally {
    await redis.quit().catch(() => redis.destroy());
    await Promise.allSettled([prisma.$disconnect(), prismaRead.$disconnect()]);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const backfill = process.argv.includes('--backfill');
  if (backfill) {
    runBackfill()
      .then((counts) => {
        console.log('backfill complete:', JSON.stringify(counts));
      })
      .catch((error) => {
        console.error(
          'backfill failed:',
          error instanceof Error ? error.message : 'unknown error',
        );
        process.exitCode = 1;
      })
      .finally(() =>
        Promise.allSettled([prisma.$disconnect(), prismaRead.$disconnect()]),
      );
  } else {
    runWorker().catch((error) => {
      console.error(
        'sync-worker exited:',
        error instanceof Error ? error.message : 'unknown error',
      );
      process.exitCode = 1;
    });
  }
}
