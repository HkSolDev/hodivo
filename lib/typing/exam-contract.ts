export type ExamReason =
  | 'RULES_INCOMPLETE'
  | 'RULES_UNSUPPORTED'
  | 'SCORING_UNAVAILABLE'
  | 'NO_ELIGIBLE_PASSAGE';

export interface ExamSummary {
  id: string;
  slug: string;
  name: string;
  organization: string | null;
}

export interface ExamVersionSummary {
  id: string;
  examId: string;
  versionKey: string;
  label: string;
  language: 'en' | 'hi';
  examYear: number | null;
}

export interface ExamRules {
  durationSeconds: number | null;
  targetWpm: number | null;
  targetKeystrokes: number | null;
  maxErrorPercent: number | null;
  backspacePolicy: 'UNRESTRICTED' | 'DISABLED' | 'CURRENT_WORD_ONLY' | null;
  editingPolicy: string | null;
  scoringMethod: string | null;
  instructions: string | null;
  ruleSourceUrl: string | null;
  ruleSourceNote: string | null;
}

export interface ExamVersionDetail extends ExamVersionSummary {
  rules: ExamRules;
  rulesUpdatedAt: string;
  readiness: {
    canStart: boolean;
    reasons: ExamReason[];
    scoringAvailable: boolean;
  };
}

export interface ExamPassageSummary {
  id: string;
  title: string;
  sourceKind: 'OFFICIAL_PREVIOUS_YEAR' | 'RECONSTRUCTED' | 'PRACTICE';
  examYear: number | null;
  shift: string | null;
}

export interface ExamStartSnapshot {
  contractRevision: 'exam-v1';
  version: ExamVersionDetail;
  passage: {
    id: string;
    title: string;
    text: string;
    contentHash: string;
    revision: number;
    sourceKind: 'OFFICIAL_PREVIOUS_YEAR' | 'RECONSTRUCTED' | 'PRACTICE';
    sourceUrl: string | null;
    sourceNote: string | null;
  };
}

export interface ExamPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ExamSession {
  snapshot: ExamStartSnapshot;
  phase: 'ready' | 'running' | 'finished';
  text: string;
  backspaceCount: number;
  deadline: number | null;
  remainingSeconds: number;
  finishReason: 'submitted' | 'expired' | null;
}

export const HINDI_EXAM_TEXT = /^[\t\n -~ऀ-ॿ‌‍]+$/u;
export const HINDI_EXAM_LETTER = /[अ-ह]/u;
