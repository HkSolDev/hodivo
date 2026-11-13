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

export function isSupportedExamInputType(inputType: string): boolean {
  return insertions.has(inputType) || corrections.has(inputType);
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
  if (current.phase === 'ready') {
    if (!insertions.has(inputType) || text.length === 0) return current;
    return { ...current, text, phase: 'running', deadline: now + 600_000 };
  }
  return { ...current, text };
}
