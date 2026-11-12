import { prisma } from '../db.js';
import type { PrismaClient } from '../../generated/prisma/index.js';

export type PracticePassage = { id: string; title: string; text: string };

export async function getRandomPracticePassage(
  database: Pick<PrismaClient, '$queryRaw'> = prisma,
): Promise<PracticePassage | null> {
  const supported = '^[\t\n -~]+$';
  // shortcut: random sort suits a small catalogue; measure before scaling past 10000 published passages.
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
