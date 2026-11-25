import type { ExamSession } from './exam-contract.js';
import { advanceExamSession } from './exam-session.js';

const insertions = new Set([
  'insertText',
  'insertCompositionText',
  'insertFromComposition',
  'insertLineBreak',
  'insertParagraph',
]);
const corrections = new Set([
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteSoftLineBackward',
  'deleteSoftLineForward',
  'deleteHardLineBackward',
  'deleteHardLineForward',
  'deleteByCut',
  'deleteByDrag',
  'historyUndo',
  'historyRedo',
]);

const backwardDeletions = new Set([
  'deleteContentBackward',
  'deleteWordBackward',
  'deleteSoftLineBackward',
  'deleteHardLineBackward',
]);

export function lockedPrefixLength(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (/\s/.test(text[i]!)) return i + 1;
  }
  return 0;
}

export function isSupportedExamInputType(inputType: string): boolean {
  return insertions.has(inputType) || corrections.has(inputType);
}

export function isAllowedExamBeforeInput(
  session: ExamSession,
  inputType: string,
  selectionStart: number,
  selectionEnd: number,
): boolean {
  if (!isSupportedExamInputType(inputType)) return false;
  const policy =
    session.snapshot.version.rules.backspacePolicy ?? 'UNRESTRICTED';
  if (policy === 'UNRESTRICTED') return true;
  if (policy === 'DISABLED') {
    if (corrections.has(inputType)) return false;
    return (
      selectionStart === session.text.length &&
      selectionEnd === session.text.length
    );
  }
  if (inputType === 'historyUndo' || inputType === 'historyRedo') return false;
  const lockedLen = lockedPrefixLength(session.text);
  if (selectionStart < lockedLen || selectionEnd < lockedLen) return false;
  if (
    backwardDeletions.has(inputType) &&
    selectionStart === selectionEnd &&
    selectionStart <= lockedLen
  ) {
    return false;
  }
  return true;
}

export function applyExamInput(
  session: ExamSession,
  text: string,
  inputType: string,
  now: number,
  isComposing = false,
): ExamSession {
  const current = advanceExamSession(session, now);
  if (
    current.phase === 'finished' ||
    isComposing ||
    text.length > 50_000 ||
    !isSupportedExamInputType(inputType)
  )
    return current;
  if (text === current.text) return current;

  const policy =
    current.snapshot.version.rules.backspacePolicy ?? 'UNRESTRICTED';
  if (policy === 'DISABLED') {
    if (
      corrections.has(inputType) ||
      text.length <= current.text.length ||
      !text.startsWith(current.text)
    ) {
      return current;
    }
  } else if (policy === 'CURRENT_WORD_ONLY') {
    if (inputType === 'historyUndo' || inputType === 'historyRedo') {
      return current;
    }
    const lockedPrefix = current.text.slice(
      0,
      lockedPrefixLength(current.text),
    );
    if (!text.startsWith(lockedPrefix)) {
      return current;
    }
  }

  if (current.phase === 'ready') {
    if (!insertions.has(inputType) || text.length === 0) return current;
    const durationSeconds = current.snapshot.version.rules.durationSeconds;
    if (
      typeof durationSeconds !== 'number' ||
      !Number.isInteger(durationSeconds) ||
      durationSeconds < 1 ||
      durationSeconds > 3600
    ) {
      throw new Error('Unsupported exam simulation.');
    }
    return {
      ...current,
      text,
      phase: 'running',
      deadline: now + durationSeconds * 1000,
    };
  }
  return {
    ...current,
    text,
    backspaceCount: corrections.has(inputType)
      ? current.backspaceCount + 1
      : current.backspaceCount,
  };
}
