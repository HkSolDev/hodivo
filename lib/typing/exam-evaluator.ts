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
}

export interface ExamEvaluationResult {
  profileLabel: string;
  targetWpm: number;
  grossWpm: number;
  netWpm: number;
  accuracyPercent: number;
  errorPercent: number;
  fullMistakes: number;
  halfMistakes: number;
  totalEquivalentMistakes: number;
  evaluatedWordCount: number;
  typedWordCount: number;
  meetsSpeedTarget: boolean;
  overallStatus: 'QUALIFIED_ALL' | 'QUALIFIED_RESERVED' | 'BELOW_CUTOFF';
  statusLabel: string;
  statusDetail: string;
  categoryResults: CategoryQualificationResult[];
  reviewItems: ExamReviewItem[];
}

export function resolveExamEvaluationProfile(
  examSlug?: string | null,
  rules?: ExamRules | null,
): ExamEvaluationProfile {
  const base =
    (examSlug && EXAM_EVALUATION_PROFILES[examSlug]) ||
    DEFAULT_EVALUATION_PROFILE;
  const maxError = rules?.maxErrorPercent;
  if (
    maxError !== null &&
    maxError !== undefined &&
    !EXAM_EVALUATION_PROFILES[examSlug ?? '']
  ) {
    return {
      ...base,
      defaultTargetWpm: rules?.targetWpm ?? base.defaultTargetWpm,
      defaultDurationSeconds:
        rules?.durationSeconds ?? base.defaultDurationSeconds,
      categoryCutoffs: [
        { category: 'General (UR)', maxErrorPercent: maxError },
      ],
    };
  }
  return base;
}

function stripPunctuation(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function tokenizeWords(text: string): string[] {
  const trimmed = text.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}

function classifyWordMismatch(
  masterWord: string,
  typedWord: string,
): { weight: 0 | 0.5 | 1; kind: ExamMistakeKind } {
  if (masterWord === typedWord) return { weight: 0, kind: 'match' };

  if (masterWord.toLowerCase() === typedWord.toLowerCase()) {
    return { weight: 0.5, kind: 'case' };
  }

  const masterCore = stripPunctuation(masterWord);
  const typedCore = stripPunctuation(typedWord);
  if (
    masterCore.length > 0 &&
    masterCore.toLowerCase() === typedCore.toLowerCase()
  ) {
    return { weight: 0.5, kind: 'punctuation' };
  }

  return { weight: 1, kind: 'substitution' };
}

/**
 * Evaluates a candidate's typed script against the master passage using
 * word-level alignment (Full Mistakes = 1.0, Half Mistakes = 0.5) and
 * the exam's configured speed and category error cutoffs.
 */
export function evaluateExamAttempt(params: {
  masterText: string;
  typedText: string;
  elapsedSeconds: number;
  examSlug?: string | null;
  rules?: ExamRules | null;
}): ExamEvaluationResult {
  const { masterText, typedText, elapsedSeconds, examSlug, rules } = params;
  const profile = resolveExamEvaluationProfile(examSlug, rules);
  const targetWpm = rules?.targetWpm ?? profile.defaultTargetWpm;
  const strokesPerWord = profile.strokesPerWord;

  const masterWords = tokenizeWords(masterText);
  const typedWords = tokenizeWords(typedText);
  const typedLen = typedText.length;

  // Evaluate against the portion of the master passage attempted (or minimum 1 word if empty)
  const compareMasterCount =
    typedWords.length === 0
      ? 0
      : Math.min(
          masterWords.length,
          Math.max(typedWords.length, Math.ceil(typedLen / strokesPerWord)),
        );
  const mWords = masterWords.slice(0, compareMasterCount);
  const tWords = typedWords;

  let fullMistakes = 0;
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
      // Omitted words within the attempted window -> Full Mistake each
      for (let k = i; k < mWords.length; k++) {
        reviewItems.push({
          kind: 'omission',
          weight: 1,
          expected: mWords[k]!,
          typed: '',
        });
      }
      fullMistakes += mWords.length - i;
      break;
    }

    const mw = mWords[i]!;
    const tw = tWords[j]!;
    const direct = classifyWordMismatch(mw, tw);

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

    // Check spacing merge error: two master words joined into one typed word (e.g. "themodern" vs "the" "modern") -> Half Mistake
    if (
      i + 1 < mWords.length &&
      (mw + mWords[i + 1]!).toLowerCase() === tw.toLowerCase()
    ) {
      reviewItems.push({
        kind: 'merge',
        weight: 0.5,
        expected: `${mw} ${mWords[i + 1]!}`,
        typed: tw,
      });
      halfMistakes++;
      i += 2;
      j += 1;
      continue;
    }

    // Check spacing split error: one master word split into two typed words (e.g. "mod" "ern" vs "modern") -> Half Mistake
    if (
      j + 1 < tWords.length &&
      mw.toLowerCase() === (tw + tWords[j + 1]!).toLowerCase()
    ) {
      reviewItems.push({
        kind: 'split',
        weight: 0.5,
        expected: mw,
        typed: `${tw} ${tWords[j + 1]!}`,
      });
      halfMistakes++;
      i += 1;
      j += 2;
      continue;
    }

    // Check 1-word omission (candidate skipped mw and typed the next master word) -> 1 Full Mistake for omission
    if (
      i + 1 < mWords.length &&
      classifyWordMismatch(mWords[i + 1]!, tw).weight === 0
    ) {
      reviewItems.push({
        kind: 'omission',
        weight: 1,
        expected: mw,
        typed: '',
      });
      fullMistakes++;
      i += 1;
      continue;
    }

    // Check 1-word addition/repetition (candidate inserted an extra word tw before matching mw) -> 1 Full Mistake
    if (
      j + 1 < tWords.length &&
      classifyWordMismatch(mw, tWords[j + 1]!).weight === 0
    ) {
      reviewItems.push({
        kind: 'addition',
        weight: 1,
        expected: '',
        typed: tw,
      });
      fullMistakes++;
      j += 1;
      continue;
    }

    reviewItems.push({
      kind: direct.kind,
      weight: direct.weight,
      expected: mw,
      typed: tw,
    });
    if (direct.weight === 0.5) {
      halfMistakes++;
    } else {
      fullMistakes++;
    }
    i++;
    j++;
  }

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

  const elapsedMins = Math.max(elapsedSeconds / 60, 1 / 60);
  const grossWpm =
    typedLen > 0 ? Math.round(typedLen / strokesPerWord / elapsedMins) : 0;
  const netWpm =
    typedLen > 0
      ? Math.max(
          0,
          Math.round(
            (typedLen / strokesPerWord - totalEquivalentMistakes) / elapsedMins,
          ),
        )
      : 0;

  const meetsSpeedTarget = netWpm >= targetWpm && typedLen > 0;
  const categoryResults: CategoryQualificationResult[] =
    profile.categoryCutoffs.map((c) => ({
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

  const cutoffSummary = profile.categoryCutoffs
    .map((c) => `${c.category} ≤${c.maxErrorPercent}%`)
    .join(' · ');

  const statusDetail = !meetsSpeedTarget
    ? `Need ${targetWpm} WPM net (${cutoffSummary})`
    : `${errorPercent}% error (${cutoffSummary})`;

  return {
    profileLabel: profile.familyLabel,
    targetWpm,
    grossWpm,
    netWpm,
    accuracyPercent,
    errorPercent,
    fullMistakes,
    halfMistakes,
    totalEquivalentMistakes,
    evaluatedWordCount: mWords.length,
    typedWordCount: tWords.length,
    meetsSpeedTarget,
    overallStatus,
    statusLabel,
    statusDetail,
    categoryResults,
    reviewItems,
  };
}
