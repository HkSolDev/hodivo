import { prismaRead } from '../db.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/index.js';
import {
  isLocalHindiEnabled,
  hindiPracticeText,
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

type PracticeScope = 'english' | 'published' | 'local';

function catalogueScope(): PracticeScope {
  return isLocalHindiEnabled() ? 'local' : 'published';
}

function eligible(scope: PracticeScope) {
  const published = Prisma.sql`p."status" = 'PUBLISHED' AND v."status" = 'PUBLISHED'
    AND p."reviewedAt" IS NOT NULL AND p."publishedAt" IS NOT NULL
    AND v."reviewedAt" IS NOT NULL AND v."publishedAt" IS NOT NULL`;
  const visibility =
    scope === 'local'
      ? Prisma.sql`(${published}) OR (p."status" = 'DRAFT' AND v."status" = 'DRAFT')`
      : published;
  const hindi =
    scope === 'english'
      ? Prisma.empty
      : Prisma.sql`OR (
    (${visibility}) AND ${hindiPracticeText}
    AND v."language" = 'hi'
    AND v."versionKey" = ${localHindiVersion.versionKey}
    AND EXISTS (SELECT 1 FROM "TypingExam" e
      WHERE e."id" = v."examId" AND e."slug" = ${localHindiVersion.exam.slug})
    AND char_length(p."text") BETWEEN 1 AND 50000
    AND p."contentHash" = encode(sha256(convert_to(p."text", 'UTF8')), 'hex')
  )`;
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
  const scope = catalogueScope();
  return readTypingCache(
    database,
    `catalogue:${scope === 'local' ? 'local:' : ''}${limit}:${cursor ?? ''}`,
    async () => {
      const rows = await database.$queryRaw<PassageSummary[]>`
      SELECT p."id", p."title" ${eligible(scope)}
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
  return getPassageById(id, database, catalogueScope());
}

function getPassageById(id: string, database: Database, scope: PracticeScope) {
  return readTypingCache(
    database,
    `text:${scope === 'local' ? 'local:' : scope === 'english' ? 'english:' : ''}${id}`,
    async () => {
      const rows = await database.$queryRaw<PracticePassage[]>`
      SELECT p."id", p."title", p."text"
        ${scope !== 'english' ? Prisma.sql`, NULLIF(v."language", 'en') AS "language"` : Prisma.empty}
      ${eligible(scope)} AND p."id" = ${id}
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
    SELECT p."id" ${eligible('english')}
    ORDER BY (p."id" = ${database === prismaRead ? lastPickedId : null}), random()
    LIMIT 1
  `;
  const picked = rows[0];
  if (!picked) return null;
  if (database === prismaRead) lastPickedId = picked.id;
  return getPassageById(picked.id, database, 'english');
}
