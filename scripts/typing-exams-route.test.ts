import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { registerTypingExamRoutes } from '../src/routes/typing-exams.js';
import {
  ExamCatalogueError,
  evaluateExamReadiness,
  type ExamCatalogue,
} from '../src/lib/typing-exam-catalogue.js';
import type { ExamStartSnapshot } from '../lib/typing/exam-contract.js';
import type { TypingExamVersion } from '../generated/prisma/index.js';

const { snapshot }: { snapshot: ExamStartSnapshot } = JSON.parse(
  readFileSync(
    new URL('../tests/fixtures/typing-exam/start.json', import.meta.url),
    'utf8',
  ),
);
const summary = {
  id: 'exam1',
  slug: 'exam',
  name: 'Synthetic exam',
  organization: null,
};
const {
  rules: _rules,
  readiness: _ready,
  rulesUpdatedAt: _updated,
  ...version
} = snapshot.version;

test('exam HTTP contract validates requests and sanitizes errors before exposing catalogue data', async (t) => {
  let fail: Error | null = null;
  const calls: unknown[][] = [];
  const check = (...args: unknown[]) => {
    calls.push(args);
    if (fail) throw fail;
  };
  const catalogue: ExamCatalogue = {
    async listExams(limit, cursor) {
      check('exams', limit, cursor);
      return { items: [summary], nextCursor: 'exam1' };
    },
    async listVersions(id, limit, cursor) {
      check('versions', id, limit, cursor);
      return { items: [version], nextCursor: null };
    },
    async getVersion(id) {
      check('version', id);
      return snapshot.version;
    },
    async listPassages(id) {
      check('passages', id);
      return [
        {
          id: snapshot.passage.id,
          title: snapshot.passage.title,
          sourceKind: snapshot.passage.sourceKind,
          examYear: null,
          shift: null,
        },
      ];
    },
    async getSnapshot(id, passageId) {
      check('snapshot', id, passageId);
      return snapshot;
    },
  };
  const app = Fastify({
    exposeHeadRoutes: false,
    routerOptions: { maxParamLength: 128 },
  });
  registerTypingExamRoutes(app, catalogue);
  t.after(() => app.close());
  const response = await app.inject('/api/typing/exams?limit=2&cursor=exam1');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { exams: [summary], nextCursor: 'exam1' });
  assert.deepEqual(calls.pop(), ['exams', 2, 'exam1']);
  assert.equal(response.headers['cache-control'], 'no-store');
  for (const path of [
    '/api/typing/exams/exam1/versions',
    '/api/typing/exam-versions/version1',
    '/api/typing/exam-versions/version1/passage',
  ]) {
    assert.equal((await app.inject(path)).statusCode, 200);
  }
  const before = calls.length;
  for (const path of [
    '/api/typing/exams?limit=0',
    '/api/typing/exams?limit=51',
    '/api/typing/exams?limit=01',
    '/api/typing/exams?limit=2&limit=3',
    '/api/typing/exams?cursor=',
    '/api/typing/exams?other=1',
    '/api/typing/exams?cursor=A',
    '/api/typing/exam-versions/version1?limit=2',
    '/api/typing/exam-versions/UPPER',
    '/api/typing/exams/a-b/versions',
    `/api/typing/exam-versions/${'a'.repeat(65)}`,
  ]) {
    const invalid = await app.inject(path);
    assert.equal(invalid.statusCode, 400, path);
    assert.deepEqual(invalid.json(), {
      error: { code: 'INVALID_REQUEST', message: 'Invalid exam request.' },
    });
    assert.equal(invalid.headers['cache-control'], 'no-store');
  }
  assert.equal(calls.length, before);
  for (const injection of [
    {
      method: 'POST' as const,
      url: '/api/typing/exams',
      payload: '{',
      headers: { 'content-type': 'application/json' },
    },
    {
      method: 'POST' as const,
      url: '/api/typing/exams',
      payload: 'data',
      headers: { 'content-type': 'application/octet-stream' },
    },
    { method: 'HEAD' as const, url: '/api/typing/exams' },
  ]) {
    const rejected = await app.inject(injection);
    assert.equal(rejected.statusCode, 404);
    assert.equal(rejected.headers['cache-control'], 'no-store');
  }
  for (const [error, status, code, message] of [
    [
      new ExamCatalogueError('INVALID_REQUEST'),
      400,
      'INVALID_REQUEST',
      'Invalid exam request.',
    ],
    [
      new ExamCatalogueError('NOT_FOUND'),
      404,
      'NOT_FOUND',
      'Exam content not found.',
    ],
    [
      new ExamCatalogueError('EXAM_NOT_READY', ['RULES_INCOMPLETE']),
      409,
      'EXAM_NOT_READY',
      'This exam is not ready to start.',
    ],
    [
      new Error('secret database details'),
      503,
      'SERVICE_UNAVAILABLE',
      'Exam content is temporarily unavailable.',
    ],
  ] as const) {
    fail = error;
    const errorResponse = await app.inject(
      '/api/typing/exam-versions/version1/passage',
    );
    assert.equal(errorResponse.statusCode, status);
    assert.deepEqual(errorResponse.json(), {
      error: {
        code,
        message,
        ...(status === 409 ? { reasons: ['RULES_INCOMPLETE'] } : {}),
      },
    });
    assert.equal(errorResponse.headers['cache-control'], 'no-store');
  }
});

test('readiness keeps unavailable scoring distinct from incomplete and unsupported rules', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  const base: TypingExamVersion = {
    ...version,
    ...snapshot.version.rules,
    language: 'en',
    status: 'PUBLISHED',
    reviewedAt: now,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  assert.deepEqual(evaluateExamReadiness(base, true), {
    canStart: true,
    reasons: [],
    scoringAvailable: false,
  });
  assert.deepEqual(
    evaluateExamReadiness(
      {
        ...base,
        durationSeconds: null,
        editingPolicy: 'unknown',
        scoringMethod: 'unapproved',
      },
      false,
    ).reasons,
    [
      'RULES_INCOMPLETE',
      'RULES_UNSUPPORTED',
      'SCORING_UNAVAILABLE',
      'NO_ELIGIBLE_PASSAGE',
    ],
  );
  for (const policy of ['DISABLED', 'CURRENT_WORD_ONLY'] as const)
    assert.deepEqual(
      evaluateExamReadiness({ ...base, backspacePolicy: policy }, true).reasons,
      ['RULES_UNSUPPORTED'],
    );
  assert.deepEqual(
    evaluateExamReadiness({ ...base, maxErrorPercent: 101 }, true).reasons,
    ['RULES_UNSUPPORTED'],
  );
  assert.deepEqual(
    evaluateExamReadiness({ ...base, publishedAt: null }, true).reasons,
    ['RULES_INCOMPLETE'],
  );
  assert.deepEqual(
    evaluateExamReadiness(
      {
        ...base,
        durationSeconds: 900,
        targetWpm: 27,
        targetKeystrokes: 2000,
        maxErrorPercent: 20,
      },
      true,
    ),
    { canStart: true, reasons: [], scoringAvailable: false },
  );
  for (const invalid of [
    { durationSeconds: 0 },
    { durationSeconds: 3601 },
    { targetWpm: 0 },
    { targetWpm: 1001 },
  ]) {
    assert.deepEqual(
      evaluateExamReadiness({ ...base, ...invalid }, true).reasons,
      ['RULES_UNSUPPORTED'],
    );
  }
});
