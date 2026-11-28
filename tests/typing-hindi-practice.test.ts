import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareHindiText,
  evaluateHindi,
  hindiGroups,
} from '../lib/typing/hindi-practice';
import { createTypingSession } from '../lib/typing/session';

test('Hindi groups keep vowel marks and conjuncts together', () => {
  assert.deepEqual(hindiGroups('कि क्ष ज्ञ किताबें'), [
    'कि',
    ' ',
    'क्ष',
    ' ',
    'ज्ञ',
    ' ',
    'कि',
    'ता',
    'बें',
  ]);
});

test('Hindi uses the shared session deadline and scores completed groups', () => {
  let now = 0;
  const session = createTypingSession(
    { target: 'कि क्ष', durationMs: 2_000, compareText: evaluateHindi },
    () => now,
  );
  session.applyEdit('क');
  assert.equal(session.snapshot().insertedAttempts, 0);
  now = 1_000;
  session.applyEdit('कि');
  assert.equal(session.snapshot().score.netWpm, 60);
  assert.equal(session.snapshot().score.grossWpm, 60);
  session.applyEdit('कि क');
  now = 2_000;
  const result = session.tick();
  assert.equal(result.finishedReason, 'duration');
  assert.equal(result.incorrectAttempts, 1);
  assert.equal(session.applyEdit('कि क्ष').rejection, 'finished');
});

test('an unfinished letter is deferred until completed, passed or submitted', () => {
  const target = hindiGroups('किताबें');
  assert.equal(compareHindiText(target, 'क', false).compared, 0);
  assert.equal(compareHindiText(target, 'क', true).compared, 1);
  assert.equal(compareHindiText(target, 'कत', false).compared, 1);
  assert.equal(compareHindiText(target, 'किताब', true).correct, 2);
  assert.equal(compareHindiText(target, 'किताबें', false).correct, 3);
});

test('Hindi comparison recovers at spaces after a typo or a skipped word', () => {
  const target = 'सुबह मैं अपनी किताबें लेकर';
  const typo = evaluateHindi(target, 'सुबह मई अपनी किताबे', false);
  assert.equal(typo.chars.find(({ ch }) => ch === 'ले')?.state, 'untyped');
  assert.equal(typo.chars.find(({ ch }) => ch === 'मैं')?.state, 'incorrect');
  assert.equal(typo.chars.find(({ ch }) => ch === 'प')?.state, 'correct');
  assert.equal(typo.chars.find(({ ch }) => ch === 'बें')?.state, 'current');

  const skipped = evaluateHindi(target, 'सुबह अपनी किताबें ', false);
  assert.equal(
    skipped.chars.find(({ ch }) => ch === 'मैं')?.state,
    'incorrect',
  );
  assert.equal(skipped.chars.find(({ ch }) => ch === 'बें')?.state, 'correct');
  assert.equal(skipped.chars.find(({ ch }) => ch === 'ले')?.state, 'current');
});

test('Hindi practice finishes after the final word even with earlier mistakes', () => {
  for (const text of ['सुबह मई अपनी कि', 'सुबह अपनी कि']) {
    const session = createTypingSession({
      target: 'सुबह मैं अपनी कि',
      durationMs: 2_000,
      compareText: evaluateHindi,
    });
    assert.equal(session.applyEdit(text.slice(0, -1)).finished, false);
    assert.equal(session.applyEdit(text).finished, true);
    assert.equal(session.snapshot().finishedReason, 'target');
  }
});

test('Hindi practice ignores repeated spaces and scores only entered groups', () => {
  const target = 'सुबह मैं अपनी कि';
  const singleSpace = evaluateHindi(target, 'सुबह मैं अपनी कि', false);
  assert.deepEqual(
    evaluateHindi(target, 'सुबह  मैं अपनी कि', false),
    singleSpace,
  );
  const skipped = evaluateHindi(target, 'सुबह अपनी कि', false);
  assert.equal(skipped.incorrect, 0);
  assert.equal(skipped.correct, hindiGroups('सुबह अपनी कि').length);
  assert.equal(
    skipped.chars.find(({ ch }) => ch === 'मैं')?.state,
    'incorrect',
  );
});

test('Hindi speed uses words and skips are reported separately from accuracy', () => {
  let now = 0;
  const target = 'सुबह मैं अपनी किताबें';
  const session = createTypingSession(
    { target, durationMs: 120_000, compareText: evaluateHindi },
    () => now,
  );
  session.applyEdit('सुबह');
  now = 60_000;
  session.applyEdit('सुबह अपनी  किताबें');
  const result = session.snapshot();
  assert.equal(result.finishedReason, 'target');
  assert.equal(result.score.grossWpm, 3);
  assert.equal(result.score.netWpm, 3);
  assert.equal(result.score.accuracy, 100);
  assert.deepEqual(result.comparison?.words, {
    typed: 3,
    correct: 3,
    skipped: 1,
  });
});
