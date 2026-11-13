import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ExamStartSnapshot } from '../lib/typing/exam-contract';
import { createExamSession } from '../lib/typing/exam-session';
import { applyExamInput } from '../lib/typing/exam-input';

const fixture: { snapshot: ExamStartSnapshot } = JSON.parse(
  readFileSync(
    new URL('./fixtures/typing-exam/start.json', import.meta.url),
    'utf8',
  ),
);

test('paste, drop, unknown input and composition preedit never start the clock', () => {
  const ready = createExamSession(fixture.snapshot);
  for (const kind of [
    'insertFromPaste',
    'insertFromDrop',
    'insertFromYank',
    'insertReplacementText',
    'unknown',
    'deleteContentBackward',
  ])
    assert.equal(applyExamInput(ready, 'answer', kind, 10), ready);
  assert.equal(
    applyExamInput(ready, 'あ', 'insertCompositionText', 10, true),
    ready,
  );
  const committed = applyExamInput(ready, 'あ', 'insertCompositionText', 30);
  assert.equal(committed.deadline, 600030);
});

test('normal corrections, selection replacement, undo and paragraphs remain allowed', () => {
  let current = applyExamInput(
    createExamSession(fixture.snapshot),
    'wrong',
    'insertText',
    0,
  );
  current = applyExamInput(current, 'wron', 'deleteContentBackward', 10);
  assert.equal(current.text, 'wron');
  current = applyExamInput(current, 'right', 'insertText', 20);
  current = applyExamInput(current, 'right\n\t', 'insertParagraph', 30);
  current = applyExamInput(current, 'right', 'historyUndo', 40);
  assert.equal(current.text, 'right');
  assert.equal(current.deadline, 600000);
  assert.equal(
    applyExamInput(current, 'x'.repeat(50001), 'insertText', 50).text,
    'right',
  );
});

test('expiry wins over edits including rejected paste and composition', () => {
  const running = applyExamInput(
    createExamSession(fixture.snapshot),
    'A',
    'insertText',
    0,
  );
  for (const kind of [
    'insertText',
    'insertFromPaste',
    'insertCompositionText',
  ]) {
    const expired = applyExamInput(running, 'new', kind, 600000, true);
    assert.equal(expired.phase, 'finished');
    assert.equal(expired.finishReason, 'expired');
    assert.equal(expired.text, 'A');
  }
});
