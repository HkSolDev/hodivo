import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, type PrismaClient } from '../generated/prisma/index.js';
import {
  applySyncEvent,
  parseStreamEvent,
  syncSource,
  syncTypingAttempt,
  syncTypingPassage,
} from '../src/worker/sync-worker.js';

function createFakeClient(calls: string[]) {
  const tx = {
    source: {
      upsert: async (args: { where: { id: string } }) => {
        calls.push(`source.upsert:${args.where.id}`);
      },
      deleteMany: async (args: { where: { id?: string } }) => {
        calls.push(`source.delete:${args.where.id ?? 'bulk'}`);
      },
    },
    post: {
      upsert: async (args: {
        where: { id: string };
        create: { extractionCandidateId: null; eligibilityRules: unknown };
      }) => {
        assert.equal(args.create.extractionCandidateId, null);
        assert.equal(args.create.eligibilityRules, Prisma.DbNull);
        calls.push(`post.upsert:${args.where.id}`);
      },
      deleteMany: async (args: { where: { sourceId?: string } }) => {
        calls.push(`post.deleteMany:${args.where.sourceId ?? 'bulk'}`);
      },
    },
    typingExam: {
      upsert: async (args: { where: { id: string } }) => {
        calls.push(`exam.upsert:${args.where.id}`);
      },
    },
    typingExamVersion: {
      upsert: async (args: { where: { id: string } }) => {
        calls.push(`version.upsert:${args.where.id}`);
      },
    },
    typingPassage: {
      findUnique: async () => null,
      upsert: async (args: { where: { id: string } }) => {
        calls.push(`passage.upsert:${args.where.id}`);
      },
      deleteMany: async (args: { where: { id?: string } }) => {
        calls.push(`passage.delete:${args.where.id ?? 'bulk'}`);
      },
    },
    authUser: {
      upsert: async (args: { where: { id: string } }) => {
        calls.push(`authUser.upsert:${args.where.id}`);
      },
    },
    typingAttempt: {
      upsert: async (args: { where: { id: string } }) => {
        calls.push(`attempt.upsert:${args.where.id}`);
      },
      deleteMany: async (args: { where: { id?: string } }) => {
        calls.push(`attempt.delete:${args.where.id ?? 'bulk'}`);
      },
    },
  };

  return {
    ...tx,
    $transaction: async (
      fnOrOps: ((client: typeof tx) => Promise<unknown>) | Promise<unknown>[],
    ) => {
      if (typeof fnOrOps === 'function') return fnOrOps(tx);
      return Promise.all(fnOrOps);
    },
  };
}

test('parseStreamEvent validates entity types and trims IDs', () => {
  assert.deepEqual(
    parseStreamEvent({ entityType: 'SOURCE', entityId: ' s1 ' }),
    { entityType: 'SOURCE', entityId: 's1' },
  );
  assert.equal(
    parseStreamEvent({ entityType: 'UNKNOWN', entityId: 's1' }),
    null,
  );
  assert.equal(
    parseStreamEvent({ entityType: 'SOURCE', entityId: '   ' }),
    null,
  );
});

test('applySyncEvent refuses syncing when master and slave point to the same client', async () => {
  const client = createFakeClient([]) as unknown as PrismaClient;
  await assert.rejects(
    () =>
      applySyncEvent(
        { entityType: 'SOURCE', entityId: 's1' },
        client,
        client,
        {},
      ),
    /SLAVE_DATABASE_URL must differ/,
  );
});

test('syncSource upserts source + posts, clears ExtractionCandidate FK, and prunes stale posts', async () => {
  const calls: string[] = [];
  const master = {
    source: {
      findUnique: async () => ({
        id: 'src1',
        name: 'SSC',
        url: 'https://ssc.gov.in',
        rawHash: 'h1',
        fetchedAt: new Date(),
        notificationPdfUrl: null,
        officialSiteUrl: null,
        applyUrl: null,
        posts: [
          {
            id: 'post1',
            sourceId: 'src1',
            postName: 'CGL',
            organization: 'SSC',
            postGroup: null,
            payLevel: null,
            minAge: 18,
            maxAge: 30,
            vacancies: 100,
            applicationLastDate: null,
            ageAsOnDate: null,
            educationRequired: null,
            minEducationLevel: null,
            minMarksPercent: null,
            categoryRelaxationApplies: null,
            categoryRelaxationRules: null,
            eligibilityRules: null,
            extractionCandidateId: 'cand1',
            candidatePostIndex: 0,
            reviewedDetails: { pay: 'Level 7' },
            reviewedAt: null,
            reviewNote: null,
            publishedAt: new Date(),
          },
        ],
      }),
    },
  } as unknown as PrismaClient;

  const slave = createFakeClient(calls) as unknown as PrismaClient;
  const result = await syncSource('src1', master, slave);

  assert.deepEqual(result, { postIds: ['post1'] });
  assert.deepEqual(calls, [
    'source.upsert:src1',
    'post.upsert:post1',
    'post.deleteMany:src1',
  ]);
});

test('syncSource deletes source and posts when missing from master', async () => {
  const calls: string[] = [];
  const master = {
    source: { findUnique: async () => null },
  } as unknown as PrismaClient;
  const slave = createFakeClient(calls) as unknown as PrismaClient;

  const result = await syncSource('missing-src', master, slave);
  assert.deepEqual(result, { postIds: [] });
  assert.deepEqual(calls, [
    'post.deleteMany:missing-src',
    'source.delete:missing-src',
  ]);
});

test('syncTypingAttempt backfills missing passage and authUser before upserting attempt', async () => {
  const calls: string[] = [];
  const master = {
    typingAttempt: {
      findUnique: async () => ({
        id: 'att1',
        authUserId: 'u1',
        passageId: 'p1',
        passageContentHash: 'hash1',
        mode: 'PRACTICE',
        examVersionId: 'v1',
        grossWpm: 45,
        netWpm: 42,
        accuracy: 95,
        errorPercent: 5,
        keystrokes: 200,
        backspaceCount: 4,
        durationMs: 60000,
        passedRule: true,
        createdAt: new Date(),
        authUser: {
          id: 'u1',
          name: 'Hemant',
          email: 'hemant@example.com',
          emailVerified: true,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    },
    typingPassage: {
      findUnique: async () => ({
        id: 'p1',
        examVersionId: 'v1',
        contentKey: 'k1',
        revision: 1,
        title: 'Sample',
        text: 'Hello world',
        contentHash: 'hash1',
        sourceKind: 'OFFICIAL',
        status: 'PUBLISHED',
        examYear: 2024,
        shift: null,
        sourceUrl: null,
        sourceNote: null,
        reviewedAt: null,
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        examVersion: {
          id: 'v1',
          examId: 'e1',
          versionKey: '2024',
          label: '2024',
          language: 'en',
          status: 'PUBLISHED',
          examYear: 2024,
          durationSeconds: 900,
          backspacePolicy: null,
          editingPolicy: null,
          scoringMethod: null,
          targetWpm: 35,
          maxErrorPercent: 5,
          targetKeystrokes: 1750,
          instructions: null,
          ruleSourceUrl: null,
          ruleSourceNote: null,
          reviewedAt: null,
          publishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          exam: {
            id: 'e1',
            slug: 'ssc-chsl',
            name: 'SSC CHSL',
            organization: 'SSC',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      }),
    },
  } as unknown as PrismaClient;

  const slave = createFakeClient(calls) as unknown as PrismaClient;
  await syncTypingAttempt('att1', master, slave);

  assert.deepEqual(calls, [
    'exam.upsert:e1',
    'version.upsert:v1',
    'passage.upsert:p1',
    'authUser.upsert:u1',
    'attempt.upsert:att1',
  ]);
});

test('syncTypingPassage deletes passage when missing from master', async () => {
  const calls: string[] = [];
  const master = {
    typingPassage: { findUnique: async () => null },
  } as unknown as PrismaClient;
  const slave = createFakeClient(calls) as unknown as PrismaClient;

  await syncTypingPassage('p-deleted', master, slave);
  assert.deepEqual(calls, ['passage.delete:p-deleted']);
});
