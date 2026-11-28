import type { ExamRules } from './exam-contract.js';

export interface CategoryCutoffRule {
  category: string;
  maxErrorPercent: number;
}

export interface ExamEvaluationProfile {
  examSlug: string;
  familyLabel: string;
  defaultTargetWpm: number;
  defaultDurationSeconds: number;
  /** Standard strokes per word used by the commission (SSC/RRB = 5). */
  strokesPerWord: number;
  /** Weight of a half-mistake (case, punctuation, spacing merge/split). */
  halfMistakeWeight: number;
  /** Category-wise maximum permissible error percentage cutoffs. */
  categoryCutoffs: readonly CategoryCutoffRule[];
}

/**
 * Unified registry of exam evaluation literals and rules.
 * Adding a new exam family later (e.g. RRB NTPC, Allahabad HC, IBPS)
 * requires only adding one entry to this map.
 */
export const EXAM_EVALUATION_PROFILES: Record<string, ExamEvaluationProfile> = {
  'ssc-chsl': {
    examSlug: 'ssc-chsl',
    familyLabel: 'SSC CHSL Skill Test (LDC/JSA)',
    defaultTargetWpm: 35,
    defaultDurationSeconds: 600,
    strokesPerWord: 5,
    halfMistakeWeight: 0.5,
    categoryCutoffs: [{ category: 'General (UR)', maxErrorPercent: 7 }],
  },
  'ssc-cgl': {
    examSlug: 'ssc-cgl',
    familyLabel: 'SSC CGL Tier-II DEST',
    defaultTargetWpm: 27,
    defaultDurationSeconds: 900,
    strokesPerWord: 5,
    halfMistakeWeight: 0.5,
    categoryCutoffs: [{ category: 'General (UR)', maxErrorPercent: 20 }],
  },
  'rrb-ntpc': {
    examSlug: 'rrb-ntpc',
    familyLabel: 'RRB NTPC Typing Skill Test',
    defaultTargetWpm: 30,
    defaultDurationSeconds: 600,
    strokesPerWord: 5,
    halfMistakeWeight: 0.5,
    categoryCutoffs: [{ category: 'General (UR)', maxErrorPercent: 5 }],
  },
};

const DEFAULT_EVALUATION_PROFILE: ExamEvaluationProfile = {
  examSlug: 'default',
  familyLabel: 'Standard Government Typing Test',
  defaultTargetWpm: 35,
  defaultDurationSeconds: 600,
  strokesPerWord: 5,
  halfMistakeWeight: 0.5,
  categoryCutoffs: [{ category: 'General (UR)', maxErrorPercent: 7 }],
};

export interface CategoryQualificationResult {
  category: string;
  maxErrorPercent: number;
  qualified: boolean;
}

export type ExamMistakeKind =
  | 'match'
  | 'substitution'
  | 'omission'
  | 'addition'
  | 'case'
  | 'punctuation'
  | 'merge'
  | 'split';

export interface ExamReviewItem {
  kind: ExamMistakeKind;
  weight: 0 | 0.5 | 1;
  expected: string;
  typed: string;
  unattemptedTail?: boolean;
}

export interface ExamEvaluationResult {
  profileLabel: string;
  targetWpm: number;
  targetKeystrokes: number | null;
  grossWpm: number;
  netWpm: number;
  accuracyPercent: number;
  typedAccuracyPercent: number;
  errorPercent: number;
  fullMistakes: number;
  typedFullMistakes: number;
  unattemptedWords: number;
  halfMistakes: number;
  totalEquivalentMistakes: number;
  evaluatedWordCount: number;
  typedWordCount: number;
  completionPercent: number;
  meetsSpeedTarget: boolean;
  meetsKeystrokeTarget: boolean;
  overallStatus: 'QUALIFIED_ALL' | 'QUALIFIED_RESERVED' | 'BELOW_CUTOFF';
  statusLabel: string;
  statusDetail: string;
  categoryResults: CategoryQualificationResult[];
  reviewItems: ExamReviewItem[];
}

export function resolveExamEvaluationProfile(
  examSlug?: string | null,
  rules?: ExamRules | null,
  examName?: string | null,
): ExamEvaluationProfile {
  const base =
    (examSlug && EXAM_EVALUATION_PROFILES[examSlug]) ||
    DEFAULT_EVALUATION_PROFILE;
  const durationSeconds = rules?.durationSeconds ?? base.defaultDurationSeconds;
  const derivedTargetWpm =
    rules?.targetWpm ??
    (rules?.targetKeystrokes != null
      ? Math.max(
          1,
          Math.round(
            rules.targetKeystrokes /
              base.strokesPerWord /
              Math.max(durationSeconds / 60, 1 / 60),
          ),
        )
      : base.defaultTargetWpm);
  const maxError = rules?.maxErrorPercent;
  const halfMistakeWeight =
    rules?.scoringMethod === 'strict-full-v1' ? 1 : base.halfMistakeWeight;
  return {
    ...base,
    familyLabel: examName?.trim() || base.familyLabel,
    defaultTargetWpm: derivedTargetWpm,
    defaultDurationSeconds: durationSeconds,
    halfMistakeWeight,
    categoryCutoffs:
      maxError !== null && maxError !== undefined
        ? [{ category: 'General (UR)', maxErrorPercent: maxError }]
        : base.categoryCutoffs,
  };
}

function stripPunctuation(word: string, isHindi: boolean): string {
  if (isHindi)
    return word.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '');
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function tokenizeWords(text: string): string[] {
  const trimmed = text.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}

function classifyWordMismatch(
  masterWord: string,
  typedWord: string,
  isHindi: boolean,
): { weight: 0 | 0.5 | 1; kind: ExamMistakeKind } {
  if (masterWord === typedWord) return { weight: 0, kind: 'match' };

  if (masterWord.toLowerCase() === typedWord.toLowerCase()) {
    return { weight: 0.5, kind: 'case' };
  }

  const masterCore = stripPunctuation(masterWord, isHindi);
  const typedCore = stripPunctuation(typedWord, isHindi);
  if (
    masterCore.length > 0 &&
    masterCore.toLowerCase() === typedCore.toLowerCase()
  ) {
    return { weight: 0.5, kind: 'punctuation' };
  }

  return { weight: 1, kind: 'substitution' };
}

const MAX_ALIGNMENT_LOOKAHEAD = 15;

function findOmissionJump(
  mWords: readonly string[],
  tWords: readonly string[],
  i: number,
  j: number,
  isHindi: boolean,
): number {
  const tw = tWords[j]!;
  if (
    i + 1 < mWords.length &&
    classifyWordMismatch(mWords[i + 1]!, tw, isHindi).weight === 0
  ) {
    return 1;
  }
  const maxOffset = Math.min(MAX_ALIGNMENT_LOOKAHEAD, mWords.length - 1 - i);
  for (let offset = 2; offset <= maxOffset; offset++) {
    if (classifyWordMismatch(mWords[i + offset]!, tw, isHindi).weight !== 0)
      continue;
    if (i + offset + 1 < mWords.length && j + 1 < tWords.length) {
      if (
        classifyWordMismatch(mWords[i + offset + 1]!, tWords[j + 1]!, isHindi)
          .weight < 1
      ) {
        return offset;
      }
    } else if (
      tw.length >= 4 &&
      i + offset === mWords.length - 1 &&
      j === tWords.length - 1
    ) {
      return offset;
    }
  }
  return 0;
}

function findAdditionJump(
  mWords: readonly string[],
  tWords: readonly string[],
  i: number,
  j: number,
  isHindi: boolean,
): number {
  const mw = mWords[i]!;
  if (
    j + 1 < tWords.length &&
    classifyWordMismatch(mw, tWords[j + 1]!, isHindi).weight === 0
  ) {
    return 1;
  }
  const maxOffset = Math.min(MAX_ALIGNMENT_LOOKAHEAD, tWords.length - 1 - j);
  for (let offset = 2; offset <= maxOffset; offset++) {
    if (classifyWordMismatch(mw, tWords[j + offset]!, isHindi).weight !== 0)
      continue;
    if (i + 1 < mWords.length && j + offset + 1 < tWords.length) {
      if (
        classifyWordMismatch(mWords[i + 1]!, tWords[j + offset + 1]!, isHindi)
          .weight < 1
      ) {
        return offset;
      }
    } else if (
      mw.length >= 4 &&
      i === mWords.length - 1 &&
      j + offset === tWords.length - 1
    ) {
      return offset;
    }
  }
  return 0;
}

/**
 * Evaluates a candidate's typed script against the master passage using
 * word-level alignment (Full Mistakes = 1.0, Half Mistakes = 0.5 or profile weight)
 * and the exam's configured speed, keystrokes, and category error cutoffs.
 */
export function evaluateExamAttempt(params: {
  masterText: string;
  typedText: string;
  elapsedSeconds: number;
  examSlug?: string | null;
  examName?: string | null;
  rules?: ExamRules | null;
  language?: 'en' | 'hi';
}): ExamEvaluationResult {
  const { masterText, typedText, elapsedSeconds, examSlug, examName, rules } =
    params;
  const profile = resolveExamEvaluationProfile(examSlug, rules, examName);
  const targetWpm = profile.defaultTargetWpm;
  const targetKeystrokes = rules?.targetKeystrokes ?? null;
  const strokesPerWord = profile.strokesPerWord;
  const halfWeight: 0.5 | 1 = profile.halfMistakeWeight === 1 ? 1 : 0.5;

  const isHindi = params.language === 'hi';
  const masterWords = tokenizeWords(
    isHindi ? masterText.normalize('NFC') : masterText,
  );
  const typedWords = tokenizeWords(
    isHindi ? typedText.normalize('NFC') : typedText,
  );
  const typedLen = typedText.length;

  // Official SSC / TCS iON full-passage evaluation: compare against the entire
  // master passage so any unattempted words left at the end count as Omissions (1.0).
  const mWords = masterWords;
  const tWords = typedWords;

  let fullMistakes = 0;
  let unattemptedWords = 0;
  let halfMistakes = 0;
  const reviewItems: ExamReviewItem[] = [];

  // Greedy windowed word alignment handling omissions, additions, merges, splits, and substitutions
  let i = 0;
  let j = 0;
  while (i < mWords.length || j < tWords.length) {
    if (i >= mWords.length) {
      // Extra inserted words at the end -> Full Mistake each
      for (let k = j; k < tWords.length; k++) {
        reviewItems.push({
          kind: 'addition',
          weight: 1,
          expected: '',
          typed: tWords[k]!,
        });
      }
      fullMistakes += tWords.length - j;
      break;
    }
    if (j >= tWords.length) {
      // Unattempted / omitted words remaining in the master passage -> Full Mistake each
      for (let k = i; k < mWords.length; k++) {
        reviewItems.push({
          kind: 'omission',
          weight: 1,
          expected: mWords[k]!,
          typed: '',
          unattemptedTail: true,
        });
      }
      unattemptedWords = mWords.length - i;
      fullMistakes += unattemptedWords;
      break;
    }

    const mw = mWords[i]!;
    const tw = tWords[j]!;
    const direct = classifyWordMismatch(mw, tw, isHindi);

    if (direct.weight === 0) {
      reviewItems.push({
        kind: 'match',
        weight: 0,
        expected: mw,
        typed: tw,
      });
      i++;
      j++;
      continue;
    }

    // Check spacing merge error: two master words joined into one typed word (e.g. "themodern" vs "the" "modern")
    if (
      i + 1 < mWords.length &&
      (mw + mWords[i + 1]!).toLowerCase() === tw.toLowerCase()
    ) {
      reviewItems.push({
        kind: 'merge',
        weight: halfWeight,
        expected: `${mw} ${mWords[i + 1]!}`,
        typed: tw,
      });
      if (halfWeight === 1) fullMistakes++;
      else halfMistakes++;
      i += 2;
      j += 1;
      continue;
    }

    // Check spacing split error: one master word split into two typed words (e.g. "mod" "ern" vs "modern")
    if (
      j + 1 < tWords.length &&
      mw.toLowerCase() === (tw + tWords[j + 1]!).toLowerCase()
    ) {
      reviewItems.push({
        kind: 'split',
        weight: halfWeight,
        expected: mw,
        typed: `${tw} ${tWords[j + 1]!}`,
      });
      if (halfWeight === 1) fullMistakes++;
      else halfMistakes++;
      i += 1;
      j += 2;
      continue;
    }

    // Check multi-word or 1-word omission vs addition (resyncs cleanly even if candidate skipped a phrase/line)
    const omitOffset = findOmissionJump(mWords, tWords, i, j, isHindi);
    const addOffset = findAdditionJump(mWords, tWords, i, j, isHindi);

    if (omitOffset > 0 && (addOffset === 0 || omitOffset <= addOffset)) {
      for (let k = 0; k < omitOffset; k++) {
        reviewItems.push({
          kind: 'omission',
          weight: 1,
          expected: mWords[i + k]!,
          typed: '',
        });
      }
      fullMistakes += omitOffset;
      i += omitOffset;
      continue;
    }

    if (addOffset > 0) {
      for (let k = 0; k < addOffset; k++) {
        reviewItems.push({
          kind: 'addition',
          weight: 1,
          expected: '',
          typed: tWords[j + k]!,
        });
      }
      fullMistakes += addOffset;
      j += addOffset;
      continue;
    }

    const itemWeight: 0.5 | 1 = direct.weight === 0.5 ? halfWeight : 1;
    reviewItems.push({
      kind: direct.kind,
      weight: itemWeight,
      expected: mw,
      typed: tw,
    });
    if (itemWeight === 0.5) {
      halfMistakes++;
    } else {
      fullMistakes++;
    }
    i++;
    j++;
  }

  const typedFullMistakes = Math.max(0, fullMistakes - unattemptedWords);
  const typedEquivalentMistakes = Number(
    (typedFullMistakes + halfMistakes * profile.halfMistakeWeight).toFixed(1),
  );
  const totalEquivalentMistakes = Number(
    (fullMistakes + halfMistakes * profile.halfMistakeWeight).toFixed(1),
  );
  const denominatorWords = Math.max(1, mWords.length, tWords.length);
  const errorPercent =
    typedLen === 0
      ? 100
      : Number(
          Math.min(
            100,
            (totalEquivalentMistakes / denominatorWords) * 100,
          ).toFixed(2),
        );
  const accuracyPercent =
    typedLen === 0 ? 0 : Number(Math.max(0, 100 - errorPercent).toFixed(2));

  const attemptedDenominator = Math.max(
    1,
    mWords.length - unattemptedWords,
    tWords.length,
  );
  const typedErrorPercent =
    typedLen === 0
      ? 100
      : Math.min(100, (typedEquivalentMistakes / attemptedDenominator) * 100);
  const typedAccuracyPercent =
    typedLen === 0
      ? 0
      : Number(Math.max(0, 100 - typedErrorPercent).toFixed(2));
  const completionPercent =
    masterText.length === 0
      ? 0
      : Math.min(100, Math.round((typedLen / masterText.length) * 100));

  const elapsedMins = Math.max(elapsedSeconds / 60, 1 / 60);
  const speedWords = isHindi ? tWords.length : typedLen / strokesPerWord;
  const grossWpm = Math.round(speedWords / elapsedMins);

  let netWpm = 0;
  if (typedLen > 0) {
    if (!isHindi && rules?.scoringMethod === 'rrb-10x-v1') {
      const typedWordsByStrokes = typedLen / strokesPerWord;
      const ignoredMistakes = typedWordsByStrokes * 0.05;
      const penalizedMistakes = Math.max(
        0,
        typedEquivalentMistakes - ignoredMistakes,
      );
      netWpm = Math.max(
        0,
        Math.round(
          (typedWordsByStrokes - penalizedMistakes * 10) / elapsedMins,
        ),
      );
    } else {
      // Net WPM reflects the speed of words actually typed, deducting only typed mistakes
      netWpm = Math.max(
        0,
        Math.round((speedWords - typedEquivalentMistakes) / elapsedMins),
      );
    }
  }

  const effectiveTargetKeystrokes =
    targetKeystrokes !== null
      ? masterText.length > 0
        ? Math.min(targetKeystrokes, masterText.length)
        : targetKeystrokes
      : null;
  const meetsKeystrokeTarget =
    effectiveTargetKeystrokes === null || typedLen >= effectiveTargetKeystrokes;
  const meetsSpeedTarget =
    netWpm >= targetWpm && typedLen > 0 && meetsKeystrokeTarget;

  const categoryResults: CategoryQualificationResult[] = (
    isHindi ? [] : profile.categoryCutoffs
  ).map((c) => ({
    category: c.category,
    maxErrorPercent: c.maxErrorPercent,
    qualified: meetsSpeedTarget && errorPercent <= c.maxErrorPercent,
  }));

  const urQualified = categoryResults[0]?.qualified ?? false;
  const anyQualified = categoryResults.some((c) => c.qualified);

  let overallStatus: ExamEvaluationResult['overallStatus'] = 'BELOW_CUTOFF';
  let statusLabel = 'Below Cut-off';
  if (urQualified) {
    overallStatus = 'QUALIFIED_ALL';
    statusLabel = 'Qualified (General)';
  } else if (anyQualified) {
    overallStatus = 'QUALIFIED_RESERVED';
    const passedCats = categoryResults
      .filter((c) => c.qualified)
      .map((c) => c.category)
      .join(', ');
    statusLabel = `Qualified (${passedCats})`;
  }

  const maxAllowedError = categoryResults[0]?.maxErrorPercent ?? 7;
  const cutoffSummary = profile.categoryCutoffs
    .map((c) => `${c.category} ≤${c.maxErrorPercent}%`)
    .join(' · ');

  let statusDetail: string;
  if (urQualified) {
    statusDetail = `${netWpm} WPM net · ${errorPercent}% error (${cutoffSummary})`;
  } else if (unattemptedWords > 0 && errorPercent > maxAllowedError) {
    statusDetail = `Incomplete: ${unattemptedWords} words left (${errorPercent}% error · need ≤${maxAllowedError}%)`;
  } else if (
    !meetsKeystrokeTarget &&
    effectiveTargetKeystrokes !== null &&
    netWpm >= targetWpm
  ) {
    statusDetail = `Keystrokes low: ${typedLen.toLocaleString()} / ${effectiveTargetKeystrokes.toLocaleString()} required`;
  } else if (!meetsSpeedTarget && errorPercent > maxAllowedError) {
    statusDetail = `Need ${targetWpm} WPM net & ≤${maxAllowedError}% error`;
  } else if (!meetsSpeedTarget) {
    statusDetail = `Speed low: ${netWpm} WPM net (need ${targetWpm} WPM)`;
  } else {
    statusDetail = `Error high: ${errorPercent}% (need ≤${maxAllowedError}%)`;
  }

  return {
    profileLabel: profile.familyLabel,
    targetWpm,
    targetKeystrokes,
    grossWpm,
    netWpm,
    accuracyPercent,
    typedAccuracyPercent,
    errorPercent,
    fullMistakes,
    typedFullMistakes,
    unattemptedWords,
    halfMistakes,
    totalEquivalentMistakes,
    evaluatedWordCount: mWords.length,
    typedWordCount: tWords.length,
    completionPercent,
    meetsSpeedTarget: isHindi
      ? netWpm >= targetWpm && tWords.length > 0
      : meetsSpeedTarget,
    meetsKeystrokeTarget: isHindi ? false : meetsKeystrokeTarget,
    overallStatus,
    statusLabel: isHindi ? 'Local Hindi test result' : statusLabel,
    statusDetail: isHindi
      ? `Word-based estimate · ${netWpm >= targetWpm && tWords.length > 0 ? 'speed target met' : 'below speed target'}${rules?.maxErrorPercent == null ? '' : errorPercent <= rules.maxErrorPercent ? ' · within test error limit' : ' · above test error limit'}. Keystrokes are a reference value.`
      : statusDetail,
    categoryResults,
    reviewItems,
  };
}
