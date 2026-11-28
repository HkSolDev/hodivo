import { prismaRead } from '../db.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/index.js';
import {
  isLocalHindiEnabled,
  localHindiPassage,
  localHindiVersion,
} from './typing-local-hindi.js';
import { readTypingCache } from './typing-passage-cache.js';

export type PracticePassage = {
  id: string;
  title: string;
  text: string;
  language?: 'hi';
};
type PassageSummary = Pick<PracticePassage, 'id' | 'title'>;
type Database = Pick<PrismaClient, '$queryRaw'>;

const english = Prisma.sql`
  p."status" = 'PUBLISHED' AND v."status" = 'PUBLISHED'
  AND v."language" = 'en'
  AND char_length(p."text") BETWEEN 1 AND 50000
  AND p."text" ~ ${'^[\t\n -~]+$'} AND p."text" ~ '[!-~]'
`;

function eligible(includeHindi: boolean) {
  const hindi = includeHindi
    ? Prisma.sql`OR (${localHindiPassage}
        AND v."status" = 'DRAFT' AND v."language" = 'hi'
        AND v."versionKey" = ${localHindiVersion.versionKey}
        AND EXISTS (SELECT 1 FROM "TypingExam" e
          WHERE e."id" = v."examId" AND e."slug" = ${localHindiVersion.exam.slug})
        AND char_length(p."text") BETWEEN 1 AND 50000
        AND p."contentHash" = encode(sha256(convert_to(p."text", 'UTF8')), 'hex'))`
    : Prisma.empty;
  return Prisma.sql`
    FROM "TypingPassage" p
    JOIN "TypingExamVersion" v ON v."id" = p."examVersionId"
    WHERE ((${english}) ${hindi})
  `;
}

export function listPracticePassages(
  limit: number,
  cursor?: string,
  database: Database = prismaRead,
) {
  const includeHindi = isLocalHindiEnabled();
  return readTypingCache(
    database,
    `catalogue:${includeHindi ? 'local:' : ''}${limit}:${cursor ?? ''}`,
    async () => {
      const rows = await database.$queryRaw<PassageSummary[]>`
      SELECT p."id", p."title" ${eligible(includeHindi)}
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
  return getPassageById(id, database, isLocalHindiEnabled());
}

function getPassageById(id: string, database: Database, includeHindi: boolean) {
  return readTypingCache(
    database,
    `text:${includeHindi ? 'local:' : ''}${id}`,
    async () => {
      const rows = await database.$queryRaw<PracticePassage[]>`
      SELECT p."id", p."title", p."text"
        ${includeHindi ? Prisma.sql`, NULLIF(v."language", 'en') AS "language"` : Prisma.empty}
      ${eligible(includeHindi)} AND p."id" = ${id}
    `;
      const row = rows[0];
      if (!row) return null;
      const { language, ...passage } = row;
      return language === 'hi' ? { ...passage, language } : passage;
    },
  );
}

let lastPickedId: string | null = null;

export async function getRandomPracticePassage(
  database: Database = prismaRead,
): Promise<PracticePassage | null> {
  const rows = await database.$queryRaw<{ id: string }[]>`
    SELECT p."id" ${eligible(false)}
    ORDER BY (p."id" = ${database === prismaRead ? lastPickedId : null}), random()
    LIMIT 1
  `;
  const picked = rows[0];
  if (!picked) return null;
  if (database === prismaRead) lastPickedId = picked.id;
  return getPassageById(picked.id, database, false);
}
