import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ExamStartSnapshot } from '../lib/typing/exam-contract';
import { createExamSession } from '../lib/typing/exam-session';
import {
  applyExamInput,
  isAllowedExamBeforeInput,
} from '../lib/typing/exam-input';

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
  assert.equal(current.backspaceCount, 2);
  assert.equal(current.deadline, 600000);
  assert.equal(
    applyExamInput(current, 'x'.repeat(50001), 'insertText', 50).text,
    'right',
  );
});

test('DISABLED backspacePolicy blocks deletions, undo, and mid-text overwrites while allowing append', () => {
  const disabledSnapshot: ExamStartSnapshot = {
    ...fixture.snapshot,
    version: {
      ...fixture.snapshot.version,
      rules: { ...fixture.snapshot.version.rules, backspacePolicy: 'DISABLED' },
    },
  };
  let current = applyExamInput(
    createExamSession(disabledSnapshot),
    'hello',
    'insertText',
    10,
  );
  assert.equal(current.text, 'hello');
  assert.equal(
    isAllowedExamBeforeInput(current, 'deleteContentBackward', 5, 5),
    false,
  );
  assert.equal(isAllowedExamBeforeInput(current, 'insertText', 2, 2), false);
  assert.equal(isAllowedExamBeforeInput(current, 'insertText', 5, 5), true);

  // Backspace, undo, and selection-overwrite are rejected
  assert.equal(
    applyExamInput(current, 'hell', 'deleteContentBackward', 20).text,
    'hello',
  );
  assert.equal(applyExamInput(current, '', 'historyUndo', 25).text, 'hello');
  assert.equal(
    applyExamInput(current, 'hxllo', 'insertText', 30).text,
    'hello',
  );

  // Appending at the end succeeds and backspaceCount remains 0
  current = applyExamInput(current, 'hello world', 'insertText', 40);
  assert.equal(current.text, 'hello world');
  assert.equal(current.backspaceCount, 0);
});

test('CURRENT_WORD_ONLY backspacePolicy allows editing current word and locks previous words after whitespace', () => {
  const wordOnlySnapshot: ExamStartSnapshot = {
    ...fixture.snapshot,
    version: {
      ...fixture.snapshot.version,
      rules: {
        ...fixture.snapshot.version.rules,
        backspacePolicy: 'CURRENT_WORD_ONLY',
      },
    },
  };
  let current = applyExamInput(
    createExamSession(wordOnlySnapshot),
    'wro',
    'insertText',
    10,
  );
  // Can backspace within the first uncommitted word
  current = applyExamInput(current, 'wr', 'deleteContentBackward', 20);
  assert.equal(current.text, 'wr');
  assert.equal(current.backspaceCount, 1);

  // Type full word + space -> locks "wrong "
  current = applyExamInput(current, 'wrong ', 'insertText', 30);
  assert.equal(
    isAllowedExamBeforeInput(current, 'deleteContentBackward', 6, 6),
    false,
  );
  assert.equal(
    applyExamInput(current, 'wrong', 'deleteContentBackward', 40).text,
    'wrong ',
  );

  // Type next word "teh", backspace inside "teh" -> allowed
  current = applyExamInput(current, 'wrong teh', 'insertText', 50);
  assert.equal(
    isAllowedExamBeforeInput(current, 'deleteContentBackward', 9, 9),
    true,
  );
  current = applyExamInput(current, 'wrong t', 'deleteContentBackward', 60);
  assert.equal(current.text, 'wrong t');
  assert.equal(current.backspaceCount, 2);

  // Attempting to edit locked first word is rejected
  assert.equal(
    applyExamInput(current, 'right t', 'insertText', 70).text,
    'wrong t',
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
