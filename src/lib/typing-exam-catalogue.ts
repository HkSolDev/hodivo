import { createHash } from 'node:crypto';
import { prismaRead } from '../db.js';
import {
  isLocalHindiEnabled,
  localHindiPassage,
  localHindiVersion,
} from './typing-local-hindi.js';
import { getPracticePassage } from './typing-catalogue.js';
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
  localHindi = false,
): ExamVersionDetail['readiness'] {
  const reasons: ExamReason[] = [];
  if (
    v.durationSeconds === null ||
    v.targetWpm === null ||
    v.backspacePolicy === null ||
    !v.editingPolicy ||
    !v.ruleSourceUrl?.trim() ||
    !v.ruleSourceNote?.trim() ||
    (!localHindi && (!v.reviewedAt || !v.publishedAt))
  )
    reasons.push('RULES_INCOMPLETE');
  if (
    !inRange(v.durationSeconds, 1, 3600) ||
    !inRange(v.targetWpm, 1, 1000) ||
    (v.backspacePolicy !== null &&
      !['UNRESTRICTED', 'DISABLED', 'CURRENT_WORD_ONLY'].includes(
        v.backspacePolicy,
      )) ||
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
  if (
    (v.language !== 'en' && v.language !== 'hi') ||
    !inRange(v.examYear, 1900, 2100)
  )
    throw new Error('Invalid catalogue projection.');
  return {
    id: v.id,
    examId: v.examId,
    versionKey: v.versionKey,
    label: v.label,
    language: v.language,
    examYear: v.examYear,
  };
}

function versionDetail(
  v: TypingExamVersion,
  hasPassage: boolean,
  localHindi: boolean,
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
    readiness: evaluateExamReadiness(v, hasPassage, localHindi),
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

function eligiblePassageWhere(
  versionId: string,
  passageId?: string,
  localHindi = false,
): Prisma.Sql {
  const compatible = '^[\t\n -~]+$';
  const passageFilter = passageId
    ? Prisma.sql`AND p."id" = ${passageId}`
    : Prisma.empty;
  const eligibility = localHindi
    ? localHindiPassage
    : Prisma.sql`p."status" = 'PUBLISHED'
      AND p."reviewedAt" IS NOT NULL AND p."publishedAt" IS NOT NULL
      AND p."text" ~ ${compatible} AND p."text" ~ '[!-~]'`;
  return Prisma.sql`
    p."examVersionId" = ${versionId} AND ${eligibility}
      AND p."revision" > 0 AND char_length(p."text") BETWEEN 1 AND 50000
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
  localHindi = false,
): Promise<Omit<ExamStartSnapshot['passage'], 'text'> | null> {
  // shortcut: random sorting suits a small catalogue; measure before 10000 published passages.
  const rows = await tx.$queryRaw<Omit<ExamStartSnapshot['passage'], 'text'>[]>`
    SELECT p."id", p."title", p."contentHash", p."revision", p."sourceKind", p."sourceUrl", p."sourceNote"
    FROM "TypingPassage" p
    WHERE ${eligiblePassageWhere(versionId, passageId, localHindi)}
    ORDER BY random() LIMIT 1
  `;
  return rows[0] ?? null;
}

export function createExamCatalogue(
  database: PrismaClient = prismaRead,
): ExamCatalogue {
  const versionVisibility: Prisma.TypingExamVersionWhereInput =
    isLocalHindiEnabled()
      ? { OR: [visibleVersion, localHindiVersion] }
      : visibleVersion;
  function read<T>(
    versionId: string,
    passageId: string | undefined,
    project: (
      version: ExamVersionDetail,
      passage: Awaited<ReturnType<typeof eligiblePassage>>,
      tx: Prisma.TransactionClient,
    ) => T | Promise<T>,
  ) {
    return database.$transaction(
      async (tx) => {
        const version = await tx.typingExamVersion.findFirst({
          where: { id: versionId, ...versionVisibility },
        });
        if (!version) throw new ExamCatalogueError('NOT_FOUND');
        const localHindi = version.language === 'hi';
        const passage = await eligiblePassage(
          tx,
          versionId,
          passageId,
          localHindi,
        );
        return project(
          versionDetail(version, passage !== null, localHindi),
          passage,
          tx,
        );
      },
      { isolationLevel: 'RepeatableRead', timeout: 5000 },
    );
  }
  return {
    async listExams(limit, cursor) {
      const where: Prisma.TypingExamWhereInput = {
        versions: { some: versionVisibility },
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
      const where = { examId, ...versionVisibility };
      if (
        !(await database.typingExam.findFirst({
          where: { id: examId, versions: { some: versionVisibility } },
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
      return read(versionId, undefined, (version) => version);
    },
    async listPassages(versionId) {
      const version = await database.typingExamVersion.findFirst({
        where: { id: versionId, ...versionVisibility },
        select: { id: true, language: true },
      });
      if (!version) throw new ExamCatalogueError('NOT_FOUND');
      return database.$queryRaw<ExamPassageSummary[]>`
        SELECT p."id", p."title", p."sourceKind", p."examYear", p."shift"
        FROM "TypingPassage" p
        WHERE ${eligiblePassageWhere(versionId, undefined, version.language === 'hi')}
        ORDER BY p."sourceKind" ASC, p."title" ASC, p."id" ASC
      `;
    },
    async getSnapshot(versionId, passageId) {
      return read(versionId, passageId, async (version, passage, tx) => {
        if (!version.readiness.canStart || !passage)
          throw new ExamCatalogueError(
            'EXAM_NOT_READY',
            version.readiness.reasons,
          );

        // Read the shared key using the same snapshot as Exam's eligibility check.
        const content =
          version.language === 'hi'
            ? await tx.typingPassage.findUnique({
                where: { id: passage.id },
                select: { text: true },
              })
            : await getPracticePassage(passage.id, tx);
        if (
          !content ||
          createHash('sha256').update(content.text).digest('hex') !==
            passage.contentHash
        )
          throw new Error('Invalid passage hash.');
        return {
          contractRevision: 'exam-v1',
          version,
          passage: { ...passage, text: content.text },
        };
      });
    },
  };
}
