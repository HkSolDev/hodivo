import { readTypingAttemptCache } from './typing-passage-cache.js';
import { prisma, prismaRead } from '../db.js';
import type {
  PrismaClient,
  TypingAttemptMode,
} from '../../generated/prisma/index.js';

export const TYPING_ID_REGEX = /^[a-z0-9]{1,64}$/;
const MAX_WPM = 250;
const MAX_KEYSTROKES = 200_000;
const MIN_DURATION_MS = 1_000;
const MAX_DURATION_MS = 7_200_000;

export interface SaveTypingAttemptInput {
  passageId: string;
  mode: TypingAttemptMode;
  examVersionId?: string | null;
  grossWpm: number;
  netWpm: number;
  accuracy: number;
  errorPercent: number;
  keystrokes: number;
  backspaceCount: number;
  durationMs: number;
  passedRule?: boolean | null;
}

export interface AttemptSnapshot {
  id: string;
  mode: TypingAttemptMode;
  examVersionId: string | null;
  grossWpm: number;
  netWpm: number;
  accuracy: number;
  errorPercent: number;
  keystrokes: number;
  backspaceCount: number;
  durationMs: number;
  passedRule: boolean | null;
  createdAt: string;
}

export interface ModeSummary {
  attemptCount: number;
  lastAttempt: AttemptSnapshot | null;
  personalBest: AttemptSnapshot | null;
}

export interface PassageSummaryResponse {
  passageId: string;
  practice: ModeSummary;
  exam: ModeSummary;
}

export interface SaveAttemptResponse {
  attempt: AttemptSnapshot;
  comparison: {
    lastAttempt: AttemptSnapshot | null;
    personalBest: AttemptSnapshot | null;
    otherModeBest: AttemptSnapshot | null;
  };
}

export interface HistoryItem extends AttemptSnapshot {
  passageId: string;
  passageTitle: string;
  examVersionLabel: string | null;
}

export class TypingAttemptError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type TypingAttemptsDatabase = Pick<
  PrismaClient,
  'typingAttempt' | 'typingPassage' | 'typingExamVersion' | '$queryRaw'
>;

function isFiniteInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function isIntInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function parseAttemptInput(body: unknown): SaveTypingAttemptInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypingAttemptError('Invalid attempt payload.', 400);
  }
  const raw = body as Record<string, unknown>;
  if (
    typeof raw.passageId !== 'string' ||
    !TYPING_ID_REGEX.test(raw.passageId)
  ) {
    throw new TypingAttemptError('Invalid passage ID.', 400);
  }
  if (raw.mode !== 'PRACTICE' && raw.mode !== 'EXAM') {
    throw new TypingAttemptError('Invalid typing mode.', 400);
  }

  let examVersionId: string | null = null;
  if (raw.mode === 'EXAM') {
    if (
      typeof raw.examVersionId !== 'string' ||
      !TYPING_ID_REGEX.test(raw.examVersionId)
    ) {
      throw new TypingAttemptError(
        'Exam version ID is required in exam mode.',
        400,
      );
    }
    examVersionId = raw.examVersionId;
  } else if (raw.examVersionId !== undefined && raw.examVersionId !== null) {
    throw new TypingAttemptError(
      'Exam version ID is not allowed in practice mode.',
      400,
    );
  }

  if (
    !isFiniteInRange(raw.grossWpm, 0, MAX_WPM) ||
    !isFiniteInRange(raw.netWpm, 0, MAX_WPM)
  ) {
    throw new TypingAttemptError('Invalid WPM measurement.', 400);
  }
  if (
    !isFiniteInRange(raw.accuracy, 0, 100) ||
    !isFiniteInRange(raw.errorPercent, 0, 100)
  ) {
    throw new TypingAttemptError('Invalid accuracy or error percentage.', 400);
  }
  if (
    !isIntInRange(raw.keystrokes, 0, MAX_KEYSTROKES) ||
    !isIntInRange(raw.backspaceCount, 0, MAX_KEYSTROKES)
  ) {
    throw new TypingAttemptError('Invalid keystroke count.', 400);
  }
  if (!isIntInRange(raw.durationMs, MIN_DURATION_MS, MAX_DURATION_MS)) {
    throw new TypingAttemptError(
      'Duration must be between 1 second and 2 hours.',
      400,
    );
  }

  let passedRule: boolean | null = null;
  if (raw.passedRule !== undefined && raw.passedRule !== null) {
    if (typeof raw.passedRule !== 'boolean') {
      throw new TypingAttemptError('Invalid passedRule value.', 400);
    }
    passedRule = raw.mode === 'EXAM' ? raw.passedRule : null;
  }

  return {
    passageId: raw.passageId,
    mode: raw.mode,
    examVersionId,
    grossWpm: Math.round(raw.grossWpm * 100) / 100,
    netWpm: Math.round(raw.netWpm * 100) / 100,
    accuracy: Math.round(raw.accuracy * 100) / 100,
    errorPercent: Math.round(raw.errorPercent * 100) / 100,
    keystrokes: raw.keystrokes,
    backspaceCount: raw.backspaceCount,
    durationMs: raw.durationMs,
    passedRule,
  };
}

function toSnapshot(row: {
  id: string;
  mode: TypingAttemptMode;
  examVersionId: string | null;
  grossWpm: number;
  netWpm: number;
  accuracy: number;
  errorPercent: number;
  keystrokes: number;
  backspaceCount: number;
  durationMs: number;
  passedRule: boolean | null;
  createdAt: Date;
}): AttemptSnapshot {
  return {
    id: row.id,
    mode: row.mode,
    examVersionId: row.examVersionId,
    grossWpm: row.grossWpm,
    netWpm: row.netWpm,
    accuracy: row.accuracy,
    errorPercent: row.errorPercent,
    keystrokes: row.keystrokes,
    backspaceCount: row.backspaceCount,
    durationMs: row.durationMs,
    passedRule: row.passedRule,
    createdAt: row.createdAt.toISOString(),
  };
}

function summarizeModeRows(rows: AttemptSnapshot[]): ModeSummary {
  if (rows.length === 0) {
    return { attemptCount: 0, lastAttempt: null, personalBest: null };
  }
  const lastAttempt = rows[0] ?? null;
  let personalBest = rows[0] ?? null;
  for (const row of rows) {
    if (
      personalBest &&
      (row.netWpm > personalBest.netWpm ||
        (row.netWpm === personalBest.netWpm &&
          row.errorPercent < personalBest.errorPercent))
    ) {
      personalBest = row;
    }
  }
  return { attemptCount: rows.length, lastAttempt, personalBest };
}

async function loadModeBreakdown(
  authUserId: string,
  passageId: string,
  db: TypingAttemptsDatabase,
): Promise<{ practice: ModeSummary; exam: ModeSummary }> {
  const rows = await db.typingAttempt.findMany({
    where: { authUserId, passageId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      mode: true,
      examVersionId: true,
      grossWpm: true,
      netWpm: true,
      accuracy: true,
      errorPercent: true,
      keystrokes: true,
      backspaceCount: true,
      durationMs: true,
      passedRule: true,
      createdAt: true,
    },
  });

  const practiceRows: AttemptSnapshot[] = [];
  const examRows: AttemptSnapshot[] = [];
  for (const row of rows) {
    const snap = toSnapshot(row);
    if (row.mode === 'PRACTICE') practiceRows.push(snap);
    else examRows.push(snap);
  }

  return {
    practice: summarizeModeRows(practiceRows),
    exam: summarizeModeRows(examRows),
  };
}

export async function saveTypingAttempt(
  authUserId: string,
  input: SaveTypingAttemptInput,
  db: TypingAttemptsDatabase = prisma,
): Promise<SaveAttemptResponse> {
  const passage = await db.typingPassage.findUnique({
    where: { id: input.passageId },
    select: { id: true, contentHash: true, status: true },
  });
  if (!passage || passage.status !== 'PUBLISHED') {
    throw new TypingAttemptError('Passage not found.', 404);
  }

  if (input.examVersionId) {
    const version = await db.typingExamVersion.findUnique({
      where: { id: input.examVersionId },
      select: { id: true, status: true },
    });
    if (!version || version.status !== 'PUBLISHED') {
      throw new TypingAttemptError('Exam version not found.', 404);
    }
  }

  const prior = await loadModeBreakdown(authUserId, input.passageId, db);
  const sameMode = input.mode === 'PRACTICE' ? prior.practice : prior.exam;
  const otherMode = input.mode === 'PRACTICE' ? prior.exam : prior.practice;

  const created = await db.typingAttempt.create({
    data: {
      authUserId,
      passageId: passage.id,
      passageContentHash: passage.contentHash,
      mode: input.mode,
      examVersionId: input.examVersionId ?? null,
      grossWpm: input.grossWpm,
      netWpm: input.netWpm,
      accuracy: input.accuracy,
      errorPercent: input.errorPercent,
      keystrokes: input.keystrokes,
      backspaceCount: input.backspaceCount,
      durationMs: input.durationMs,
      passedRule: input.passedRule ?? null,
    },
    select: {
      id: true,
      mode: true,
      examVersionId: true,
      grossWpm: true,
      netWpm: true,
      accuracy: true,
      errorPercent: true,
      keystrokes: true,
      backspaceCount: true,
      durationMs: true,
      passedRule: true,
      createdAt: true,
    },
  });

  return {
    attempt: toSnapshot(created),
    comparison: {
      lastAttempt: sameMode.lastAttempt,
      personalBest: sameMode.personalBest,
      otherModeBest: otherMode.personalBest,
    },
  };
}

export async function getPassageComparisonSummary(
  authUserId: string,
  passageId: string,
  db: TypingAttemptsDatabase = prismaRead,
): Promise<PassageSummaryResponse> {
  return readTypingAttemptCache(
    db,
    passageId,
    'progress',
    authUserId,
    async () => {
      const passage = await db.typingPassage.findUnique({
        where: { id: passageId },
        select: { id: true, status: true },
      });
      if (!passage || passage.status !== 'PUBLISHED') {
        throw new TypingAttemptError('Passage not found.', 404);
      }

      const breakdown = await loadModeBreakdown(authUserId, passageId, db);
      return {
        passageId: passage.id,
        practice: breakdown.practice,
        exam: breakdown.exam,
      };
    },
  );
}

export async function listUserTypingHistory(
  authUserId: string,
  options: { limit?: number; cursor?: string } = {},
  db: TypingAttemptsDatabase = prismaRead,
): Promise<{ items: HistoryItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const rows = await db.typingAttempt.findMany({
    where: { authUserId },
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      passageId: true,
      mode: true,
      examVersionId: true,
      grossWpm: true,
      netWpm: true,
      accuracy: true,
      errorPercent: true,
      keystrokes: true,
      backspaceCount: true,
      durationMs: true,
      passedRule: true,
      createdAt: true,
      passage: { select: { title: true } },
      examVersion: { select: { label: true } },
    },
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items: HistoryItem[] = pageRows.map((row) => ({
    ...toSnapshot(row),
    passageId: row.passageId,
    passageTitle: row.passage.title,
    examVersionLabel: row.examVersion?.label ?? null,
  }));
  const nextCursor = hasMore
    ? (pageRows[pageRows.length - 1]?.id ?? null)
    : null;

  return { items, nextCursor };
}
