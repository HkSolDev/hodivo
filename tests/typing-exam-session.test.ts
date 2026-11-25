import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ExamStartSnapshot } from '../lib/typing/exam-contract';
import {
  createExamSession,
  advanceExamSession,
  finishExamSession,
  resetExamSession,
} from '../lib/typing/exam-session';
import { applyExamInput } from '../lib/typing/exam-input';

// This coordinator-controlled serialized fixture is also checked by the API client.
const fixture: { snapshot: ExamStartSnapshot } = JSON.parse(
  readFileSync(
    new URL('./fixtures/typing-exam/start.json', import.meta.url),
    'utf8',
  ),
);

test('timer starts only on committed insertion and expires before late submission', () => {
  const ready = createExamSession(fixture.snapshot);
  assert.equal(advanceExamSession(ready, 9000).phase, 'ready');
  const running = applyExamInput(ready, 'A', 'insertText', 100);
  assert.equal(running.deadline, 600100);
  assert.equal(advanceExamSession(running, 1101).remainingSeconds, 599);
  const expired = finishExamSession(running, 600100);
  assert.equal(expired.finishReason, 'expired');
  assert.equal(expired.text, 'A');
  assert.equal(finishExamSession(expired, 700000), expired);
  assert.equal(ready.text, '');
});

test('submit finishes once and restart keeps the exact snapshot', () => {
  const ready = createExamSession(fixture.snapshot);
  assert.equal(finishExamSession(ready, 0), ready);
  const running = applyExamInput(ready, 'answer', 'insertText', 1);
  const done = finishExamSession(running, 42);
  assert.equal(done.finishReason, 'submitted');
  assert.equal(finishExamSession(done, 700000), done);
  const reset = resetExamSession(done);
  assert.equal(reset.snapshot, fixture.snapshot);
  assert.equal(reset.text, '');
  assert.equal(reset.remainingSeconds, 600);
});

test('unready and unsupported snapshots fail closed; invalid clocks are rejected', () => {
  assert.throws(() =>
    createExamSession({
      ...fixture.snapshot,
      version: {
        ...fixture.snapshot.version,
        rules: { ...fixture.snapshot.version.rules, durationSeconds: null },
      },
    }),
  );
  assert.throws(() =>
    createExamSession({
      ...fixture.snapshot,
      version: {
        ...fixture.snapshot.version,
        rules: {
          ...fixture.snapshot.version.rules,
          backspacePolicy: 'WORD_LOCK_V2' as never,
        },
      },
    }),
  );
  for (const policy of ['DISABLED', 'CURRENT_WORD_ONLY'] as const) {
    const s = createExamSession({
      ...fixture.snapshot,
      version: {
        ...fixture.snapshot.version,
        rules: { ...fixture.snapshot.version.rules, backspacePolicy: policy },
      },
    });
    assert.equal(s.phase, 'ready');
    assert.equal(s.backspaceCount, 0);
  }
  for (const now of [NaN, Infinity, -1])
    assert.throws(() =>
      advanceExamSession(createExamSession(fixture.snapshot), now),
    );
});

test('DB-driven SSC CGL profile (900s / 27 WPM) initializes and expires at 900s', () => {
  const cglSnapshot: ExamStartSnapshot = {
    ...fixture.snapshot,
    version: {
      ...fixture.snapshot.version,
      rules: {
        ...fixture.snapshot.version.rules,
        durationSeconds: 900,
        targetWpm: 27,
        targetKeystrokes: 2000,
        maxErrorPercent: 20,
      },
    },
  };
  const ready = createExamSession(cglSnapshot);
  assert.equal(ready.remainingSeconds, 900);
  const running = applyExamInput(ready, 'A', 'insertText', 100);
  assert.equal(running.deadline, 900100);
  assert.equal(advanceExamSession(running, 1101).remainingSeconds, 899);
});
