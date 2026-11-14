import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  ExamApiError,
  loadExamSnapshot,
  loadExamVersion,
  loadExamVersions,
  loadExams,
} from '../lib/typing/exam-api.js';

const summary = {
  id: 'exam1',
  slug: 'ssc-chsl',
  name: 'SSC CHSL',
  organization: null,
};

interface ApiStub {
  payload: { value: unknown; status: number };
  calls: { url: string; init?: RequestInit }[];
}

function stubApi(t: TestContext): ApiStub {
  const state: ApiStub = { payload: { value: null, status: 200 }, calls: [] };
  t.mock.method(
    globalThis,
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      state.calls.push({ url: String(input), init });
      return new Response(JSON.stringify(state.payload.value), {
        status: state.payload.status,
      });
    },
  );
  return state;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('fixture shape changed');
  return value;
}

function fixtureSnapshot(): Record<string, unknown> {
  const parsed: unknown = JSON.parse(
    readFileSync(
      new URL('./fixtures/typing-exam/start.json', import.meta.url),
      'utf8',
    ),
  );
  return record(record(parsed)['snapshot']);
}

test('exam client unwraps list wrappers and sends no-store GETs', async (t) => {
  const api = stubApi(t);
  const signal = new AbortController().signal;
  api.payload.value = { exams: [summary], nextCursor: 'exam1' };
  assert.deepEqual(await loadExams(signal), {
    items: [summary],
    nextCursor: 'exam1',
  });
  assert.equal(api.calls[0].url, '/api/typing/exams');
  assert.equal(api.calls[0].init?.cache, 'no-store');
  assert.equal(api.calls[0].init?.method, 'GET');
  assert.equal(api.calls[0].init?.body, undefined);
  assert.equal(api.calls[0].init?.signal, signal);
  await loadExams(signal, 'exam1');
  assert.equal(api.calls[1].url, '/api/typing/exams?cursor=exam1');
  api.payload.value = { versions: [], nextCursor: null };
  assert.deepEqual(await loadExamVersions('exam1', signal), {
    items: [],
    nextCursor: null,
  });
  assert.equal(api.calls[2].url, '/api/typing/exams/exam1/versions');
});

test('exam client unwraps version detail and the frozen start snapshot', async (t) => {
  const api = stubApi(t);
  const signal = new AbortController().signal;
  const snapshot = fixtureSnapshot();
  const version = record(snapshot['version']);
  api.payload.value = { version };
  const detail = await loadExamVersion('version1', signal);
  assert.equal(api.calls[0].url, '/api/typing/exam-versions/version1');
  assert.equal(detail.id, 'version1');
  assert.equal(detail.rules.durationSeconds, 600);
  assert.equal(detail.readiness.canStart, true);
  assert.deepEqual(detail.readiness.reasons, []);
  api.payload.value = {
    version: {
      ...version,
      rules: { ...record(version['rules']), editingPolicy: 'locked-word-v2' },
    },
  };
  assert.equal(
    (await loadExamVersion('version1', signal)).rules.editingPolicy,
    'locked-word-v2',
  );
  api.payload.value = { snapshot };
  const start = await loadExamSnapshot('version1', signal);
  assert.equal(api.calls[2].url, '/api/typing/exam-versions/version1/passage');
  assert.equal(start.contractRevision, 'exam-v1');
  assert.equal(
    start.passage.text,
    'A careful typist reads.\n\tThen writes  accurately.  ',
  );
  assert.equal(
    start.passage.contentHash,
    createHash('sha256').update(start.passage.text, 'utf8').digest('hex'),
  );
  assert.deepEqual(start, snapshot);
});

test('exam client rejects malformed payloads, unknown keys and inconsistent readiness', async (t) => {
  const api = stubApi(t);
  const signal = new AbortController().signal;
  const snapshot = fixtureSnapshot();
  const version = record(snapshot['version']);
  const rules = record(version['rules']);
  const readiness = record(version['readiness']);
  const passage = record(snapshot['passage']);
  const badLists = [
    { exams: [], nextCursor: null, extra: true },
    { exams: 'none', nextCursor: null },
    { exams: [], nextCursor: 'NOT-AN-ID' },
    { exams: [{ ...summary, extra: true }], nextCursor: null },
    { exams: [{ ...summary, id: 'Exam1' }], nextCursor: null },
  ];
  for (const invalid of badLists) {
    api.payload.value = invalid;
    await assert.rejects(loadExams(signal));
  }
  const badVersions = [
    { version: { ...version, extra: true } },
    { version: { ...version, language: 'hi' } },
    { version: { ...version, examYear: 1899 } },
    { version: { ...version, rulesUpdatedAt: '2026-11-13' } },
    { version: { ...version, rules: { ...rules, durationSeconds: 3601 } } },
    { version: { ...version, rules: { ...rules, targetWpm: 0 } } },
    { version: { ...version, rules: { ...rules, maxErrorPercent: 101 } } },
    {
      version: {
        ...version,
        rules: { ...rules, backspacePolicy: 'WORD_LOCK' },
      },
    },
    {
      version: {
        ...version,
        rules: { ...rules, scoringMethod: 'official-v1' },
      },
    },
    {
      version: {
        ...version,
        readiness: {
          ...readiness,
          canStart: true,
          reasons: ['RULES_INCOMPLETE'],
        },
      },
    },
    {
      version: {
        ...version,
        readiness: {
          ...readiness,
          reasons: ['RULES_UNSUPPORTED', 'RULES_INCOMPLETE'],
        },
      },
    },
    {
      version: {
        ...version,
        readiness: {
          ...readiness,
          reasons: ['RULES_INCOMPLETE', 'RULES_INCOMPLETE'],
        },
      },
    },
  ];
  for (const invalid of badVersions) {
    api.payload.value = invalid;
    await assert.rejects(loadExamVersion('version1', signal));
  }
  const badSnapshots = [
    { snapshot: { ...snapshot, contractRevision: 'exam-v2' } },
    { snapshot: { ...snapshot, passage: { ...passage, text: 'emoji 😀' } } },
    { snapshot: { ...snapshot, passage: { ...passage, contentHash: 'abc' } } },
    {
      snapshot: { ...snapshot, passage: { ...passage, sourceKind: 'UNKNOWN' } },
    },
    { snapshot: { ...snapshot, passage: { ...passage, revision: 0 } } },
    {
      snapshot: {
        ...snapshot,
        version: {
          ...version,
          rules: { ...rules, editingPolicy: 'unknown-editor' },
        },
      },
    },
    {
      snapshot: {
        ...snapshot,
        version: { ...version, rules: { ...rules, durationSeconds: 3601 } },
      },
    },
    {
      snapshot: {
        ...snapshot,
        version: {
          ...version,
          readiness: { ...readiness, scoringAvailable: true },
        },
      },
    },
    {
      snapshot: {
        ...snapshot,
        version: {
          ...version,
          readiness: {
            ...readiness,
            canStart: false,
            reasons: ['RULES_INCOMPLETE'],
          },
        },
      },
    },
  ];
  for (const invalid of badSnapshots) {
    api.payload.value = invalid;
    await assert.rejects(loadExamSnapshot('version1', signal));
  }
});

test('client rejects cross-version responses and unbounded lists', async (t) => {
  const api = stubApi(t);
  const signal = new AbortController().signal;
  const snapshot = fixtureSnapshot();
  const version = record(snapshot['version']);
  api.payload.value = { version };
  await assert.rejects(loadExamVersion('otherversion', signal));
  api.payload.value = { snapshot };
  await assert.rejects(loadExamSnapshot('otherversion', signal));
  api.payload.value = {
    versions: [
      {
        id: 'version1',
        examId: 'exam2',
        versionKey: 'one',
        label: 'One',
        language: 'en',
        examYear: 2025,
      },
    ],
    nextCursor: null,
  };
  await assert.rejects(loadExamVersions('exam1', signal));
  api.payload.value = {
    exams: Array.from({ length: 51 }, () => summary),
    nextCursor: null,
  };
  await assert.rejects(loadExams(signal));
});

test('exam client maps closed error envelopes and preserves aborts', async (t) => {
  const api = stubApi(t);
  const signal = new AbortController().signal;
  api.payload.value = {
    error: {
      code: 'EXAM_NOT_READY',
      message: 'This exam is not ready to start.',
      reasons: ['RULES_INCOMPLETE'],
    },
  };
  api.payload.status = 409;
  await assert.rejects(
    loadExamSnapshot('version1', signal),
    (error: unknown) => {
      assert.ok(error instanceof ExamApiError);
      assert.equal(error.code, 'EXAM_NOT_READY');
      assert.equal(error.status, 409);
      assert.deepEqual(error.reasons, ['RULES_INCOMPLETE']);
      assert.equal(error.message, 'This exam is not ready to start.');
      return true;
    },
  );
  api.payload.value = { error: { code: 'UNKNOWN_CODE', message: 'nope' } };
  api.payload.status = 418;
  await assert.rejects(loadExams(signal), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(!(error instanceof ExamApiError));
    assert.equal(error.message, 'Exam request failed.');
    return true;
  });
  api.payload.value = {
    error: {
      code: 'NOT_FOUND',
      message: 'nope',
      reasons: ['RULES_INCOMPLETE'],
    },
  };
  api.payload.status = 404;
  await assert.rejects(loadExams(signal), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Exam request failed.');
    return true;
  });
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  });
  await assert.rejects(loadExams(signal), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'AbortError');
    return true;
  });
});
