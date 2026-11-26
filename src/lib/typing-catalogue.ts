import { prismaRead } from '../db.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/index.js';
import { readTypingCache } from './typing-passage-cache.js';

export type PracticePassage = { id: string; title: string; text: string };
type PassageSummary = Pick<PracticePassage, 'id' | 'title'>;
type Database = Pick<PrismaClient, '$queryRaw'>;

const eligible = Prisma.sql`
  FROM "TypingPassage" p
  JOIN "TypingExamVersion" v ON v."id" = p."examVersionId"
  WHERE p."status" = 'PUBLISHED' AND v."status" = 'PUBLISHED'
    AND v."language" = 'en'
    AND char_length(p."text") BETWEEN 1 AND 50000
    AND p."text" ~ ${'^[\t\n -~]+$'} AND p."text" ~ '[!-~]'
`;

export function listPracticePassages(
  limit: number,
  cursor?: string,
  database: Database = prismaRead,
) {
  return readTypingCache(
    database,
    `catalogue:${limit}:${cursor ?? ''}`,
    async () => {
      const rows = await database.$queryRaw<PassageSummary[]>`
      SELECT p."id", p."title" ${eligible}
      AND p."id" > ${cursor ?? ''}
      ORDER BY p."id" LIMIT ${limit + 1}
    `;
      return {
        passages: rows.slice(0, limit),
        nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      };
    },
  );
}

export function getPracticePassage(
  id: string,
  database: Database = prismaRead,
) {
  return readTypingCache(database, `text:${id}`, async () => {
    const rows = await database.$queryRaw<PracticePassage[]>`
      SELECT p."id", p."title", p."text" ${eligible} AND p."id" = ${id}
    `;
    return rows[0] ?? null;
  });
}

let lastPickedId: string | null = null;

export async function getRandomPracticePassage(
  database: Database = prismaRead,
): Promise<PracticePassage | null> {
  const rows = await database.$queryRaw<{ id: string }[]>`
    SELECT p."id" ${eligible}
    ORDER BY (p."id" = ${database === prismaRead ? lastPickedId : null}), random()
    LIMIT 1
  `;
  const picked = rows[0];
  if (!picked) return null;
  if (database === prismaRead) lastPickedId = picked.id;
  return getPracticePassage(picked.id, database);
}
