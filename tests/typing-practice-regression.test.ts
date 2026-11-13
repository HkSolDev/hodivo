import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTypingSession } from '../lib/typing/session';

test('blurring after the deadline finishes even when the display interval was delayed', () => {
  let time = 0;
  const session = createTypingSession(
    { target: 'a long passage', durationMs: 1000 },
    () => time,
  );
  session.applyEdit('a');
  time = 1100;
  session.pause();
  const snapshot = session.snapshot();
  assert.equal(snapshot.status, 'finished');
  assert.equal(snapshot.finishedReason, 'duration');
  assert.equal(snapshot.elapsedMs, 1000);
  assert.equal(session.applyEdit('ab').accepted, false);
});

test('selection replacement counts the entire actual insertion even when part matches existing text', () => {
  const session = createTypingSession(
    { target: 'abcde', durationMs: 15000 },
    () => 0,
  );
  session.applyEdit('ab');
  session.applyEdit('aB', { text: 'aB', position: 0 });
  const snapshot = session.snapshot();
  assert.equal(snapshot.insertedAttempts, 4);
  assert.equal(snapshot.correctAttempts, 3);
  assert.equal(snapshot.incorrectAttempts, 1);
});

test('inserting a repeated character uses the actual caret position', () => {
  const session = createTypingSession(
    { target: 'aabaa', durationMs: 15000 },
    () => 0,
  );
  session.applyEdit('aa');
  session.applyEdit('aaa', { text: 'a', position: 0 });
  assert.equal(session.snapshot().correctAttempts, 3);
  assert.equal(session.snapshot().incorrectAttempts, 0);
});
