import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateExamAttempt,
  EXAM_EVALUATION_PROFILES,
} from '../lib/typing/exam-evaluator.js';

test('evaluateExamAttempt counts exact match with 0 full and 0 half mistakes', () => {
  const masterText =
    'The modern civil service examination tests academic competence and accuracy.';
  const result = evaluateExamAttempt({
    masterText,
    typedText: masterText,
    elapsedSeconds: 20,
    examSlug: 'ssc-chsl',
  });

  assert.equal(result.fullMistakes, 0);
  assert.equal(result.halfMistakes, 0);
  assert.equal(result.totalEquivalentMistakes, 0);
  assert.equal(result.errorPercent, 0);
  assert.equal(result.accuracyPercent, 100);
  assert.equal(result.overallStatus, 'QUALIFIED_ALL');
  assert.equal(result.statusLabel, 'Qualified (General)');
});

test('evaluateExamAttempt classifies case, punctuation, merge, and split errors as Half Mistakes (0.5)', () => {
  const masterText = 'India is a sovereign, democratic republic in Asia.';
  // 1) "india" (case) -> 0.5
  // 2) "sovereign" (missing comma) -> 0.5
  // 3) "democraticrepublic" (merged space) -> 0.5
  // 4) "As ia." (split word) -> 0.5
  const typedText = 'india is a sovereign democraticrepublic in As ia.';
  const result = evaluateExamAttempt({
    masterText,
    typedText,
    elapsedSeconds: 15,
    examSlug: 'ssc-chsl',
  });

  assert.equal(result.fullMistakes, 0);
  assert.equal(result.halfMistakes, 4);
  assert.equal(result.totalEquivalentMistakes, 2);
  assert.equal(result.errorPercent, 25);
  assert.equal(result.accuracyPercent, 75);
  assert.equal(
    result.reviewItems.filter((item) => item.weight === 0.5).length,
    result.halfMistakes,
  );
  assert.deepEqual(
    result.reviewItems
      .filter((item) => item.weight > 0)
      .map((item) => item.kind),
    ['case', 'punctuation', 'merge', 'split'],
  );
});

test('evaluateExamAttempt classifies substitutions, omissions, and extra words as Full Mistakes (1.0)', () => {
  const masterText = 'Data entry speed tests require regular practice daily.';
  // "Data" OK
  // "entry" omitted -> 1 Full
  // "speed" OK
  // "tets" substitution -> 1 Full
  // "require" OK
  // "very" extra word -> 1 Full
  // "regular" OK
  // "practice" OK
  // "daily." OK
  const typedText = 'Data speed tets require very regular practice daily.';
  const result = evaluateExamAttempt({
    masterText,
    typedText,
    elapsedSeconds: 15,
    examSlug: 'ssc-cgl',
  });

  assert.equal(result.fullMistakes, 3);
  assert.equal(result.halfMistakes, 0);
  assert.equal(result.totalEquivalentMistakes, 3);
  assert.equal(result.errorPercent, 37.5);
  assert.equal(result.accuracyPercent, 62.5);
  assert.equal(
    result.reviewItems.filter((item) => item.weight === 1).length,
    result.fullMistakes,
  );
  assert.deepEqual(
    result.reviewItems
      .filter((item) => item.weight > 0)
      .map((item) => item.kind),
    ['omission', 'substitution', 'addition'],
  );
});

test('SSC CHSL vs SSC CGL DEST profiles apply their respective WPM and category error cutoffs', () => {
  assert.equal(EXAM_EVALUATION_PROFILES['ssc-chsl']?.defaultTargetWpm, 35);
  assert.equal(EXAM_EVALUATION_PROFILES['ssc-cgl']?.defaultTargetWpm, 27);

  // 10-word passage with 1 full mistake = 10% error rate
  const masterText = 'One two three four five six seven eight nine ten.';
  const typedText = 'One two three four five six seven eight nine wrong.';

  const chslResult = evaluateExamAttempt({
    masterText,
    typedText,
    elapsedSeconds: 10,
    examSlug: 'ssc-chsl',
  });
  // 10% error: exceeds CHSL General (UR) cutoff (7%)
  assert.equal(chslResult.errorPercent, 10);
  assert.equal(chslResult.overallStatus, 'BELOW_CUTOFF');

  const cglResult = evaluateExamAttempt({
    masterText,
    typedText,
    elapsedSeconds: 10,
    examSlug: 'ssc-cgl',
  });
  // 10% error: meets CGL DEST General (UR) cutoff (20%)
  assert.equal(cglResult.errorPercent, 10);
  assert.equal(cglResult.overallStatus, 'QUALIFIED_ALL');

  // 7-word passage with 1 full mistake = 14.29% error rate (2 decimal places per SSC notice)
  const sevenWordResult = evaluateExamAttempt({
    masterText: 'One two three four five six seven.',
    typedText: 'One two three four five six wrong.',
    elapsedSeconds: 10,
    examSlug: 'ssc-cgl',
  });
  assert.equal(sevenWordResult.errorPercent, 14.29);
  assert.equal(sevenWordResult.accuracyPercent, 85.71);
});

test('official full-passage evaluation counts unattempted trailing words as Full Mistake omissions', () => {
  // 10-word master passage; candidate only types the first 6 words accurately and stops
  const masterText = 'One two three four five six seven eight nine ten.';
  const typedText = 'One two three four five six';
  const result = evaluateExamAttempt({
    masterText,
    typedText,
    elapsedSeconds: 60,
    examSlug: 'ssc-chsl',
  });

  // 4 unattempted words ("seven", "eight", "nine", "ten.") = 4 Full Mistakes -> 4 / 10 = 40% error
  // Net WPM deducts only typed mistakes (0), so 27 chars / 5 / 1 min = 5 WPM
  assert.equal(result.evaluatedWordCount, 10);
  assert.equal(result.typedWordCount, 6);
  assert.equal(result.fullMistakes, 4);
  assert.equal(result.typedFullMistakes, 0);
  assert.equal(result.unattemptedWords, 4);
  assert.equal(result.halfMistakes, 0);
  assert.equal(result.totalEquivalentMistakes, 4);
  assert.equal(result.errorPercent, 40);
  assert.equal(result.accuracyPercent, 60);
  assert.equal(result.typedAccuracyPercent, 100);
  assert.equal(result.netWpm, 5);
  assert.equal(result.overallStatus, 'BELOW_CUTOFF');
  assert.equal(
    result.reviewItems.filter((item) => item.unattemptedTail).length,
    4,
  );
});

test('dynamic exam rules override hardcoded profile defaults for any exam', () => {
  const masterText = 'One two three four five six seven eight nine ten.';
  const typedText = 'One two three four five six seven eight nine wrong.';
  const result = evaluateExamAttempt({
    masterText,
    typedText,
    elapsedSeconds: 10,
    examSlug: 'ssc-chsl',
    examName: 'High Court Typist 2026',
    rules: {
      durationSeconds: 600,
      targetWpm: 40,
      targetKeystrokes: 2000,
      maxErrorPercent: 12,
      backspacePolicy: 'UNRESTRICTED',
      editingPolicy: 'native-correction-v1',
      scoringMethod: null,
      instructions: null,
      ruleSourceUrl: null,
      ruleSourceNote: null,
    },
  });

  assert.equal(result.profileLabel, 'High Court Typist 2026');
  assert.equal(result.targetWpm, 40);
  assert.equal(result.targetKeystrokes, 2000);
  // 10% error passes the dynamic 12% cutoff even though ssc-chsl default is 7%
  assert.equal(result.overallStatus, 'QUALIFIED_ALL');
});
