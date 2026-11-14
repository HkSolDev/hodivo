import { createHash } from 'node:crypto';
import { prisma } from '../db.js';
import {
  Prisma,
  type PrismaClient,
  type TypingExamVersion,
} from '../../generated/prisma/index.js';
import type {
  ExamPage,
  ExamPassageSummary,
  ExamReason,
  ExamRules,
  ExamStartSnapshot,
  ExamSummary,
  ExamVersionDetail,
  ExamVersionSummary,
} from '../../lib/typing/exam-contract.js';

export class ExamCatalogueError extends Error {
  constructor(
    public readonly code: 'INVALID_REQUEST' | 'NOT_FOUND' | 'EXAM_NOT_READY',
    public readonly reasons?: ExamReason[],
  ) {
    super(code);
  }
}

export interface ExamCatalogue {
  listExams(limit: number, cursor?: string): Promise<ExamPage<ExamSummary>>;
  listVersions(
    examId: string,
    limit: number,
    cursor?: string,
  ): Promise<ExamPage<ExamVersionSummary>>;
  getVersion(versionId: string): Promise<ExamVersionDetail>;
  listPassages(versionId: string): Promise<ExamPassageSummary[]>;
  getSnapshot(
    versionId: string,
    passageId?: string,
  ): Promise<ExamStartSnapshot>;
}

const visibleVersion = { status: 'PUBLISHED', language: 'en' } as const;
const examSelect = {
  id: true,
  slug: true,
  name: true,
  organization: true,
} as const;
const summarySelect = {
  id: true,
  examId: true,
  versionKey: true,
  label: true,
  language: true,
  examYear: true,
} as const;

function inRange(
  value: number | null,
  min: number,
  max: number,
  integer = true,
): boolean {
  return (
    value === null ||
    (Number.isFinite(value) &&
      (!integer || Number.isInteger(value)) &&
      value >= min &&
      value <= max)
  );
}

export function evaluateExamReadiness(
  v: TypingExamVersion,
  hasPassage: boolean,
): ExamVersionDetail['readiness'] {
  const reasons: ExamReason[] = [];
  if (
    v.durationSeconds === null ||
    v.targetWpm === null ||
    v.backspacePolicy === null ||
    !v.editingPolicy ||
    !v.ruleSourceUrl?.trim() ||
    !v.ruleSourceNote?.trim() ||
    !v.reviewedAt ||
    !v.publishedAt
  )
    reasons.push('RULES_INCOMPLETE');
  if (
    !inRange(v.durationSeconds, 1, 3600) ||
    !inRange(v.targetWpm, 1, 1000) ||
    (v.backspacePolicy !== null && v.backspacePolicy !== 'UNRESTRICTED') ||
    (v.editingPolicy !== null && v.editingPolicy !== 'native-correction-v1') ||
    !inRange(v.targetKeystrokes, 1, 100000) ||
    !inRange(v.maxErrorPercent, 0, 100, false) ||
    !inRange(v.examYear, 1900, 2100)
  )
    reasons.push('RULES_UNSUPPORTED');
  if (v.scoringMethod !== null) reasons.push('SCORING_UNAVAILABLE');
  if (!hasPassage) reasons.push('NO_ELIGIBLE_PASSAGE');
  return { canStart: reasons.length === 0, reasons, scoringAvailable: false };
}

function versionSummary(
  v: Pick<
    TypingExamVersion,
    'id' | 'examId' | 'versionKey' | 'label' | 'language' | 'examYear'
  >,
): ExamVersionSummary {
  if (v.language !== 'en' || !inRange(v.examYear, 1900, 2100))
    throw new Error('Invalid catalogue projection.');
  return {
    id: v.id,
    examId: v.examId,
    versionKey: v.versionKey,
    label: v.label,
    language: 'en',
    examYear: v.examYear,
  };
}

function versionDetail(
  v: TypingExamVersion,
  hasPassage: boolean,
): ExamVersionDetail {
  if (
    !inRange(v.durationSeconds, 1, 3600) ||
    !inRange(v.targetWpm, 1, 1000) ||
    !inRange(v.targetKeystrokes, 1, 100000) ||
    !inRange(v.maxErrorPercent, 0, 100, false)
  ) {
    throw new Error('Invalid numeric projection.');
  }
  if (
    v.backspacePolicy !== null &&
    !['UNRESTRICTED', 'DISABLED', 'CURRENT_WORD_ONLY'].includes(
      v.backspacePolicy,
    )
  )
    throw new Error('Invalid policy projection.');
  const rules: ExamRules = {
    durationSeconds: v.durationSeconds,
    targetWpm: v.targetWpm,
    targetKeystrokes: v.targetKeystrokes,
    maxErrorPercent: v.maxErrorPercent,
    backspacePolicy: v.backspacePolicy,
    editingPolicy: v.editingPolicy,
    scoringMethod: v.scoringMethod,
    instructions: v.instructions,
    ruleSourceUrl: v.ruleSourceUrl,
    ruleSourceNote: v.ruleSourceNote,
  };
  return {
    ...versionSummary(v),
    rules,
    rulesUpdatedAt: v.updatedAt.toISOString(),
    readiness: evaluateExamReadiness(v, hasPassage),
  };
}

function page<T extends { id: string }>(
  items: T[],
  limit: number,
): ExamPage<T> {
  return {
    items: items.slice(0, limit),
    nextCursor: items.length > limit ? items[limit - 1].id : null,
  };
}

function eligiblePassageWhere(versionId: string, passageId?: string): Prisma.Sql {
  const compatible = '^[\t\n -~]+$';
  const passageFilter = passageId
    ? Prisma.sql`AND p."id" = ${passageId}`
    : Prisma.empty;
  return Prisma.sql`
    p."examVersionId" = ${versionId} AND p."status" = 'PUBLISHED'
      AND p."reviewedAt" IS NOT NULL AND p."publishedAt" IS NOT NULL
      AND p."revision" > 0 AND char_length(p."text") BETWEEN 1 AND 50000
      AND p."text" ~ ${compatible} AND p."text" ~ '[!-~]'
      AND p."contentHash" = encode(sha256(convert_to(p."text", 'UTF8')), 'hex')
      AND p."sourceKind" IN ('OFFICIAL_PREVIOUS_YEAR', 'RECONSTRUCTED', 'PRACTICE')
      AND (p."sourceKind" <> 'OFFICIAL_PREVIOUS_YEAR' OR
        (length(btrim(p."sourceUrl")) > 0 AND length(btrim(p."sourceNote")) > 0))
      ${passageFilter}
  `;
}

async function eligiblePassage(
  tx: Prisma.TransactionClient,
  versionId: string,
  passageId?: string,
): Promise<ExamStartSnapshot['passage'] | null> {
  // shortcut: random sorting suits a small catalogue; measure before 10000 published passages.
  const rows = await tx.$queryRaw<ExamStartSnapshot['passage'][]>`
    SELECT p."id", p."title", p."text", p."contentHash", p."revision", p."sourceKind", p."sourceUrl", p."sourceNote"
    FROM "TypingPassage" p
    WHERE ${eligiblePassageWhere(versionId, passageId)}
    ORDER BY random() LIMIT 1
  `;
  const passage = rows[0] ?? null;
  if (
    passage &&
    createHash('sha256').update(passage.text).digest('hex') !==
      passage.contentHash
  )
    throw new Error('Invalid passage hash.');
  return passage;
}

export function createExamCatalogue(
  database: PrismaClient = prisma,
): ExamCatalogue {
  async function read(versionId: string, passageId?: string) {
    return database.$transaction(
      async (tx) => {
        const version = await tx.typingExamVersion.findFirst({
          where: { id: versionId, ...visibleVersion },
        });
        if (!version) throw new ExamCatalogueError('NOT_FOUND');
        const passage = await eligiblePassage(tx, versionId, passageId);
        return { version: versionDetail(version, passage !== null), passage };
      },
      { isolationLevel: 'RepeatableRead', timeout: 5000 },
    );
  }
  return {
    async listExams(limit, cursor) {
      const where: Prisma.TypingExamWhereInput = {
        versions: { some: visibleVersion },
      };
      if (
        cursor &&
        !(await database.typingExam.findFirst({
          where: { ...where, id: cursor },
          select: { id: true },
        }))
      )
        throw new ExamCatalogueError('INVALID_REQUEST');
      const rows = await database.typingExam.findMany({
        where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) },
        select: examSelect,
        orderBy: { id: 'asc' },
        take: limit + 1,
      });
      return page(rows, limit);
    },
    async listVersions(examId, limit, cursor) {
      const where = { examId, ...visibleVersion };
      if (
        !(await database.typingExam.findFirst({
          where: { id: examId, versions: { some: visibleVersion } },
          select: { id: true },
        }))
      )
        throw new ExamCatalogueError('NOT_FOUND');
      if (
        cursor &&
        !(await database.typingExamVersion.findFirst({
          where: { ...where, id: cursor },
          select: { id: true },
        }))
      )
        throw new ExamCatalogueError('INVALID_REQUEST');
      const rows = await database.typingExamVersion.findMany({
        where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) },
        select: summarySelect,
        orderBy: { id: 'asc' },
        take: limit + 1,
      });
      return page(rows.map(versionSummary), limit);
    },
    async getVersion(versionId) {
      return (await read(versionId)).version;
    },
    async listPassages(versionId) {
      const version = await database.typingExamVersion.findFirst({
        where: { id: versionId, ...visibleVersion },
        select: { id: true },
      });
      if (!version) throw new ExamCatalogueError('NOT_FOUND');
      return database.$queryRaw<ExamPassageSummary[]>`
        SELECT p."id", p."title", p."sourceKind", p."examYear", p."shift"
        FROM "TypingPassage" p
        WHERE ${eligiblePassageWhere(versionId)}
        ORDER BY p."sourceKind" ASC, p."title" ASC, p."id" ASC
      `;
    },
    async getSnapshot(versionId, passageId) {
      const { version, passage } = await read(versionId, passageId);
      if (!version.readiness.canStart || !passage)
        throw new ExamCatalogueError(
          'EXAM_NOT_READY',
          version.readiness.reasons,
        );
      return { contractRevision: 'exam-v1', version, passage };
    },
  };
}
