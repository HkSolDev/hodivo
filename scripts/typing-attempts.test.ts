import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { AppAuth } from '../src/auth/auth.js';
import {
  getPassageComparisonSummary,
  listUserTypingHistory,
  parseAttemptInput,
  saveTypingAttempt,
  TypingAttemptError,
  type TypingAttemptsDatabase,
} from '../src/lib/typing-attempts.js';
import { registerTypingAttemptsRoutes } from '../src/routes/typing-attempts.js';
import { registerTypingPracticeRoutes } from '../src/routes/typing-practice.js';

interface StoredAttemptRow {
  id: string;
  authUserId: string;
  passageId: string;
  passageContentHash: string;
  mode: 'PRACTICE' | 'EXAM';
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
}

function createFakeDb(
  initialRows: StoredAttemptRow[] = [],
): TypingAttemptsDatabase {
  const rows = [...initialRows];
  let seq = initialRows.length;

  return {
    typingPassage: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'pass1'
          ? { id: 'pass1', contentHash: 'hash1', status: 'PUBLISHED' }
          : null,
    },
    typingExamVersion: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'ver1' ? { id: 'ver1', status: 'PUBLISHED' } : null,
    },
    typingAttempt: {
      findMany: async (args: {
        where: { authUserId: string; passageId?: string };
        take?: number;
        cursor?: { id: string };
        skip?: number;
      }) => {
        let filtered = rows
          .filter(
            (r) =>
              r.authUserId === args.where.authUserId &&
              (!args.where.passageId || r.passageId === args.where.passageId),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        if (args.cursor) {
          const idx = filtered.findIndex((r) => r.id === args.cursor?.id);
          filtered = idx >= 0 ? filtered.slice(idx + (args.skip ?? 0)) : [];
        }
        if (args.take !== undefined) {
          filtered = filtered.slice(0, args.take);
        }
        return filtered.map((r) => ({
          ...r,
          passage: { title: 'SSC Passage 1' },
          examVersion: r.examVersionId ? { label: 'SSC CHSL 2026' } : null,
        }));
      },
      create: async ({
        data,
      }: {
        data: Omit<StoredAttemptRow, 'id' | 'createdAt'>;
      }) => {
        seq += 1;
        const created: StoredAttemptRow = {
          ...data,
          id: `att${seq}`,
          createdAt: new Date(1_700_000_000_000 + seq * 1_000),
        };
        rows.push(created);
        return created;
      },
    },
  } as unknown as TypingAttemptsDatabase;
}

test('parseAttemptInput validates bounds and mode rules', () => {
  const valid = parseAttemptInput({
    passageId: 'pass1',
    mode: 'PRACTICE',
    grossWpm: 42.345,
    netWpm: 40.1,
    accuracy: 95.5,
    errorPercent: 4.5,
    keystrokes: 220,
    backspaceCount: 5,
    durationMs: 60_000,
  });
  assert.equal(valid.grossWpm, 42.35);
  assert.equal(valid.examVersionId, null);

  assert.throws(
    () =>
      parseAttemptInput({
        passageId: 'pass1',
        mode: 'EXAM',
        grossWpm: 40,
        netWpm: 38,
        accuracy: 95,
        errorPercent: 5,
        keystrokes: 200,
        backspaceCount: 0,
        durationMs: 60_000,
      }),
    TypingAttemptError,
  );

  assert.throws(
    () =>
      parseAttemptInput({
        passageId: 'pass1',
        mode: 'PRACTICE',
        examVersionId: 'ver1',
        grossWpm: 40,
        netWpm: 38,
        accuracy: 95,
        errorPercent: 5,
        keystrokes: 200,
        backspaceCount: 0,
        durationMs: 60_000,
      }),
    TypingAttemptError,
  );
});

test('saveTypingAttempt + summary compare Practice and Exam on the same passageId', async () => {
  const db = createFakeDb();

  const first = await saveTypingAttempt(
    'user1',
    parseAttemptInput({
      passageId: 'pass1',
      mode: 'PRACTICE',
      grossWpm: 36,
      netWpm: 34,
      accuracy: 94,
      errorPercent: 6,
      keystrokes: 180,
      backspaceCount: 8,
      durationMs: 60_000,
    }),
    db,
  );
  assert.equal(first.comparison.lastAttempt, null);
  assert.equal(first.comparison.personalBest, null);
  assert.equal(first.comparison.otherModeBest, null);

  const second = await saveTypingAttempt(
    'user1',
    parseAttemptInput({
      passageId: 'pass1',
      mode: 'PRACTICE',
      grossWpm: 42,
      netWpm: 40,
      accuracy: 96,
      errorPercent: 4,
      keystrokes: 210,
      backspaceCount: 4,
      durationMs: 60_000,
    }),
    db,
  );
  assert.equal(second.comparison.lastAttempt?.netWpm, 34);
  assert.equal(second.comparison.personalBest?.netWpm, 34);

  const exam = await saveTypingAttempt(
    'user1',
    parseAttemptInput({
      passageId: 'pass1',
      mode: 'EXAM',
      examVersionId: 'ver1',
      grossWpm: 39,
      netWpm: 37,
      accuracy: 95,
      errorPercent: 5,
      keystrokes: 900,
      backspaceCount: 2,
      durationMs: 300_000,
      passedRule: true,
    }),
    db,
  );
  assert.equal(exam.comparison.lastAttempt, null);
  assert.equal(exam.comparison.otherModeBest?.netWpm, 40);

  const summary = await getPassageComparisonSummary('user1', 'pass1', db);
  assert.equal(summary.practice.attemptCount, 2);
  assert.equal(summary.practice.lastAttempt?.netWpm, 40);
  assert.equal(summary.practice.personalBest?.netWpm, 40);
  assert.equal(summary.exam.attemptCount, 1);
  assert.equal(summary.exam.lastAttempt?.passedRule, true);

  const page1 = await listUserTypingHistory('user1', { limit: 2 }, db);
  assert.equal(page1.items.length, 2);
  assert.ok(page1.nextCursor);
  const page2 = await listUserTypingHistory(
    'user1',
    { limit: 2, cursor: page1.nextCursor ?? undefined },
    db,
  );
  assert.equal(page2.items.length, 1);
  assert.equal(page2.nextCursor, null);
});

test('practice-passages/:passageId route returns passage, 404, 400, and 503', async (t) => {
  const app = Fastify();
  let fail = false;
  registerTypingPracticeRoutes(app, async () => null, {
    $queryRaw: async (_query: unknown, ...args: unknown[]) => {
      if (fail) throw new Error('db down');
      return args.at(-1) === 'pass1'
        ? [{ id: 'pass1', title: 'Passage 1', text: 'Hello world.' }]
        : [];
    },
  } as unknown as Parameters<typeof registerTypingPracticeRoutes>[2]);
  t.after(() => app.close());

  let res = await app.inject('/api/typing/practice-passages/pass1');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), {
    passage: { id: 'pass1', title: 'Passage 1', text: 'Hello world.' },
  });

  res = await app.inject('/api/typing/practice-passages/missing1');
  assert.equal(res.statusCode, 404);

  res = await app.inject('/api/typing/practice-passages/BAD-ID!');
  assert.equal(res.statusCode, 400);

  fail = true;
  res = await app.inject('/api/typing/practice-passages/pass1');
  assert.equal(res.statusCode, 503);
});

test('typing-attempts routes enforce auth and serve authenticated user', async (t) => {
  const db = createFakeDb();
  let sessionUser: string | null = null;
  const mockAuth = {
    api: {
      getSession: async () =>
        sessionUser
          ? {
              user: { id: sessionUser, email: 'a@example.com', name: 'A' },
              session: {
                id: 'sess1',
                userId: sessionUser,
                expiresAt: new Date(Date.now() + 60_000),
              },
            }
          : null,
    },
  } as unknown as AppAuth;

  const app = Fastify();
  registerTypingAttemptsRoutes(app, mockAuth, db);
  t.after(() => app.close());

  let res = await app.inject({
    method: 'POST',
    url: '/api/typing/attempts',
    payload: { passageId: 'pass1' },
  });
  assert.equal(res.statusCode, 401);

  sessionUser = 'user1';
  res = await app.inject({
    method: 'POST',
    url: '/api/typing/attempts',
    payload: {
      passageId: 'pass1',
      mode: 'PRACTICE',
      grossWpm: 45,
      netWpm: 43,
      accuracy: 96,
      errorPercent: 4,
      keystrokes: 200,
      backspaceCount: 3,
      durationMs: 60_000,
    },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().attempt.netWpm, 43);

  res = await app.inject('/api/typing/passages/pass1/summary');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().practice.attemptCount, 1);

  res = await app.inject('/api/typing/history?limit=10');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().items.length, 1);
});
