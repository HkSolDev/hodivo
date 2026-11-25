import type { ExamSession, ExamStartSnapshot } from './exam-contract.js';

export function createExamSession(snapshot: ExamStartSnapshot): ExamSession {
  const { rules, readiness } = snapshot.version;
  if (
    snapshot.contractRevision !== 'exam-v1' ||
    !readiness.canStart ||
    readiness.reasons.length !== 0 ||
    readiness.scoringAvailable ||
    typeof rules.durationSeconds !== 'number' ||
    !Number.isInteger(rules.durationSeconds) ||
    rules.durationSeconds < 1 ||
    rules.durationSeconds > 3600 ||
    typeof rules.targetWpm !== 'number' ||
    !Number.isInteger(rules.targetWpm) ||
    rules.targetWpm < 1 ||
    rules.targetWpm > 1000 ||
    (rules.backspacePolicy !== 'UNRESTRICTED' &&
      rules.backspacePolicy !== 'DISABLED' &&
      rules.backspacePolicy !== 'CURRENT_WORD_ONLY') ||
    rules.editingPolicy !== 'native-correction-v1' ||
    rules.scoringMethod !== null
  )
    throw new Error('Unsupported exam simulation.');
  return {
    snapshot,
    phase: 'ready',
    text: '',
    backspaceCount: 0,
    deadline: null,
    remainingSeconds: rules.durationSeconds,
    finishReason: null,
  };
}

export function advanceExamSession(
  session: ExamSession,
  now: number,
): ExamSession {
  if (!Number.isFinite(now) || now < 0)
    throw new Error('Invalid monotonic time.');
  if (session.phase !== 'running' || session.deadline === null) return session;
  const remainingSeconds = Math.ceil(
    Math.max(0, session.deadline - now) / 1000,
  );
  if (remainingSeconds === 0)
    return {
      ...session,
      phase: 'finished',
      remainingSeconds: 0,
      finishReason: 'expired',
    };
  return remainingSeconds === session.remainingSeconds
    ? session
    : { ...session, remainingSeconds };
}

export function finishExamSession(
  session: ExamSession,
  now: number,
): ExamSession {
  const current = advanceExamSession(session, now);
  return current.phase === 'running'
    ? { ...current, phase: 'finished', finishReason: 'submitted' }
    : current;
}

export function resetExamSession(session: ExamSession): ExamSession {
  return createExamSession(session.snapshot);
}
