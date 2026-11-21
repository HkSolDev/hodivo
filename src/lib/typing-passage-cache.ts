import { createClient } from 'redis';
import type { PrismaClient } from '../../generated/prisma/index.js';

const url = process.env.TYPING_REDIS_URL;
const redis = url
  ? createClient({
      url,
      disableOfflineQueue: true,
      commandsQueueMaxLength: 256,
      socket: { connectTimeout: 500 },
    })
  : null;
redis?.on('error', () => {});

export function startTypingCache() {
  if (redis && !redis.isOpen) void redis.connect().catch(() => {});
}

export function isTypingCacheReady(): boolean {
  return redis?.isReady === true;
}

export function stopTypingCache() {
  if (redis?.isOpen) redis.destroy();
}

async function withRedisDeadline<T>(command: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      command,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Redis command timed out.')),
          150,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readTypingCache<T>(
  database: Pick<PrismaClient, '$queryRaw'>,
  entry: string,
  load: () => Promise<T>,
): Promise<T> {
  return readRevisionedCache(
    async () => {
      // A late fill can only write under its previous revision.
      const [row] = await database.$queryRaw<{ revision: string }[]>`
      SELECT "revision" FROM "TypingCacheRevision"
    `;
      return row ? `hodivo:typing:v1:${row.revision}:${entry}` : null;
    },
    load,
    300,
  );
}

export async function getTypingAttemptRevision(
  database: Pick<PrismaClient, '$queryRaw'>,
  passageId: string,
  kind: 'board' | 'progress',
  scope: string,
) {
  const [row] = await database.$queryRaw<
    { content: string; attempt: string | null }[]
  >`
    SELECT content."revision" AS content, scoped."revision" AS attempt
    FROM "TypingCacheRevision" content
    LEFT JOIN "TypingAttemptCacheRevision" scoped
      ON scoped."passageId" = ${passageId}
      AND scoped."kind" = ${kind}
      AND scoped."scope" = ${scope}
  `;
  if (!row) return null;
  return {
    content: row.content,
    key: `hodivo:typing:attempt:${kind === 'board' ? 'v2' : 'v1'}:${JSON.stringify([kind, passageId, scope, row.content, row.attempt])}`,
  };
}

const ATTEMPT_TTL_SECONDS = 30;

export function readTypingAttemptCache<T>(
  database: Pick<PrismaClient, '$queryRaw'>,
  passageId: string,
  kind: 'board' | 'progress',
  scope: string,
  load: () => Promise<T>,
): Promise<T> {
  return readRevisionedCache(
    async () =>
      (await getTypingAttemptRevision(database, passageId, kind, scope))?.key ??
      null,
    load,
    ATTEMPT_TTL_SECONDS,
    kind === 'board',
  );
}

export async function promoteTypingBoard<T>(
  previousKey: string,
  currentKey: string,
  update: (board: T) => T,
): Promise<void> {
  if (!redis?.isReady) return;
  try {
    const [stored, expiresAt] = await withRedisDeadline(
      redis.multi().get(previousKey).pExpireTime(previousKey).exec(),
    );
    if (
      typeof stored !== 'string' ||
      typeof expiresAt !== 'number' ||
      expiresAt < 0
    ) {
      return;
    }
    // Keep the original expiry so reused participant metadata still ages out.
    await withRedisDeadline(
      redis.set(currentKey, JSON.stringify(update(JSON.parse(stored) as T)), {
        condition: 'NX',
        expiration: { type: 'PXAT', value: expiresAt },
      }),
    );
  } catch {
    // The new revision still forces a database rebuild.
  }
}

async function readRevisionedCache<T>(
  resolveKey: () => Promise<string | null>,
  load: () => Promise<T>,
  ttl: number,
  verifyRevision = false,
): Promise<T> {
  if (!redis?.isReady) return load();
  const key = await resolveKey();
  if (!key) return load();
  try {
    const stored = await withRedisDeadline(redis.get(key));
    if (stored !== null) return JSON.parse(stored) as T;
  } catch {
    return load();
  }

  const value = await load();
  // Promoting an older board is safe only if its fill saw that revision.
  if (value !== null && (!verifyRevision || key === (await resolveKey()))) {
    await withRedisDeadline(
      redis.set(key, JSON.stringify(value), {
        ...(verifyRevision ? { condition: 'NX' as const } : {}),
        expiration: { type: 'EX', value: ttl },
      }),
    ).catch(() => {});
  }
  return value;
}
