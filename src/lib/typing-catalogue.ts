import { prisma } from '../db.js';
import type { PrismaClient } from '../../generated/prisma/index.js';

export type PracticePassage = { id: string; title: string; text: string };

const POOL_TTL_MS = 5 * 60 * 1000;
const BY_ID_CACHE_MAX = 500;
let cachedPool: PracticePassage[] | null = null;
let cachedPoolExpiresAt = 0;
let lastPickedId: string | null = null;
let refreshPromise: Promise<PracticePassage[]> | null = null;
const byIdCache = new Map<
  string,
  { passage: PracticePassage; expiresAt: number }
>();

function cachePassagesById(passages: PracticePassage[]): void {
  const expiresAt = Date.now() + POOL_TTL_MS;
  for (const passage of passages) {
    if (byIdCache.size >= BY_ID_CACHE_MAX) {
      const oldestKey = byIdCache.keys().next().value;
      if (oldestKey !== undefined) byIdCache.delete(oldestKey);
    }
    byIdCache.set(passage.id, { passage, expiresAt });
  }
}

async function fetchPublishedPassagePool(
  database: Pick<PrismaClient, '$queryRaw'>,
): Promise<PracticePassage[]> {
  const supported = '^[\t\n -~]+$';
  return database.$queryRaw<PracticePassage[]>`
    SELECT p."id", p."title", p."text"
    FROM "TypingPassage" p
    JOIN "TypingExamVersion" v ON v."id" = p."examVersionId"
    WHERE p."status" = 'PUBLISHED' AND v."status" = 'PUBLISHED'
      AND v."language" = 'en'
      AND char_length(p."text") BETWEEN 1 AND 50000
      AND p."text" ~ ${supported} AND p."text" ~ '[!-~]'
    ORDER BY random()
    LIMIT 200
  `;
}

function pickRandomFromPool(pool: PracticePassage[]): PracticePassage | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0] ?? null;
  const candidates = lastPickedId
    ? pool.filter((p) => p.id !== lastPickedId)
    : pool;
  const source = candidates.length > 0 ? candidates : pool;
  const picked = source[Math.floor(Math.random() * source.length)] ?? null;
  if (picked) lastPickedId = picked.id;
  return picked;
}

export async function getRandomPracticePassage(
  database: Pick<PrismaClient, '$queryRaw'> = prisma,
): Promise<PracticePassage | null> {
  // Use in-memory passage pool for the default production Prisma client
  if (database === prisma) {
    const now = Date.now();
    if (cachedPool && cachedPool.length > 0 && now < cachedPoolExpiresAt) {
      return pickRandomFromPool(cachedPool);
    }
    if (!refreshPromise) {
      refreshPromise = fetchPublishedPassagePool(database)
        .then((rows) => {
          if (rows.length > 0) {
            cachedPool = rows;
            cachedPoolExpiresAt = Date.now() + POOL_TTL_MS;
            cachePassagesById(rows);
          }
          return rows;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    if (cachedPool && cachedPool.length > 0) {
      // Stale-while-revalidate: return immediately from existing pool while refreshing
      void refreshPromise.catch(() => {});
      return pickRandomFromPool(cachedPool);
    }
    const freshPool = await refreshPromise;
    return pickRandomFromPool(freshPool);
  }

  const supported = '^[\t\n -~]+$';
  const passages = await database.$queryRaw<PracticePassage[]>`
    SELECT p."id", p."title", p."text"
    FROM "TypingPassage" p
    JOIN "TypingExamVersion" v ON v."id" = p."examVersionId"
    WHERE p."status" = 'PUBLISHED' AND v."status" = 'PUBLISHED'
      AND v."language" = 'en'
      AND char_length(p."text") BETWEEN 1 AND 50000
      AND p."text" ~ ${supported} AND p."text" ~ '[!-~]'
    ORDER BY random()
    LIMIT 1
  `;
  return passages[0] ?? null;
}

export async function getPracticePassageById(
  passageId: string,
  database: Pick<PrismaClient, '$queryRaw'> = prisma,
): Promise<PracticePassage | null> {
  if (database === prisma) {
    const fromPool = cachedPool?.find((p) => p.id === passageId);
    if (fromPool) return fromPool;

    const cached = byIdCache.get(passageId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.passage;
    }
    if (cached) byIdCache.delete(passageId);
  }

  const supported = '^[\t\n -~]+$';
  const passages = await database.$queryRaw<PracticePassage[]>`
    SELECT p."id", p."title", p."text"
    FROM "TypingPassage" p
    JOIN "TypingExamVersion" v ON v."id" = p."examVersionId"
    WHERE p."id" = ${passageId}
      AND p."status" = 'PUBLISHED' AND v."status" = 'PUBLISHED'
      AND v."language" = 'en'
      AND char_length(p."text") BETWEEN 1 AND 50000
      AND p."text" ~ ${supported} AND p."text" ~ '[!-~]'
    LIMIT 1
  `;
  const passage = passages[0] ?? null;
  if (passage && database === prisma) {
    cachePassagesById([passage]);
  }
  return passage;
}
