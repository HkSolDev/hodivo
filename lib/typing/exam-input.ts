import type { ExamSession } from './exam-contract';
import { advanceExamSession } from './exam-session';

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
    (!insertions.has(inputType) && !corrections.has(inputType))
  )
    return current;
  if (text === current.text) return current;
  if (current.phase === 'ready') {
    if (!insertions.has(inputType) || text.length === 0) return current;
    return { ...current, text, phase: 'running', deadline: now + 600_000 };
  }
  return { ...current, text };
}
