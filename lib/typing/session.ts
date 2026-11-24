// Practice session engine (typing-practice-v1): owns target text, attempt
// history, pause-aware active time and the idle/running/paused/finished
// state machine. Pure TypeScript with an injectable time source so the
// browser component and tests share one implementation.
import { createClock, type TimeSource, type TypingClock } from './clock';
import { isSupportedTypingText } from './custom-input';
import { evaluate } from './evaluate';
import { computeSessionScore, type SessionScore } from './scoring';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'finished';
export type FinishedReason = 'duration' | 'target';
export type EditRejection = 'finished' | 'paused' | 'expired' | 'unsupported';

// Metadata from the native beforeinput/input events for a real insertion.
// Needed when the inserted character equals the selected character: the
// textarea value is then unchanged and a value-only diff cannot see the edit.
export interface ActualInsertion {
  text: string;
  position: number;
}

export interface SessionSnapshot {
  status: SessionStatus;
  target: string;
  typedText: string;
  durationMs: number;
  elapsedMs: number | null;
  remainingMs: number;
  insertedAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  finishedReason: FinishedReason | null;
  score: SessionScore;
}

export interface EditResult {
  accepted: boolean;
  rejection: EditRejection | null;
  started: boolean;
  finished: boolean;
}

export interface TypingSession {
  snapshot(): SessionSnapshot;
  applyEdit(nextText: string, actualInsertion?: ActualInsertion): EditResult;
  pause(): void;
  resume(): void;
  tick(): SessionSnapshot;
  restart(settings?: { target?: string; durationMs?: number }): void;
}

export interface TypingSessionSettings {
  target: string;
  durationMs: number;
}

const defaultNow: TimeSource = () => performance.now();

export function createTypingSession(
  settings: TypingSessionSettings,
  now: TimeSource = defaultNow,
): TypingSession {
  let target = settings.target;
  let durationMs = settings.durationMs;
  let clock: TypingClock = createClock(now);
  let typedText = '';
  let insertedAttempts = 0;
  let correctAttempts = 0;
  let incorrectAttempts = 0;
  let status: SessionStatus = 'idle';
  let finishedReason: FinishedReason | null = null;

  function activeElapsedMs(): number | null {
    const elapsed = clock.elapsedMs();
    if (elapsed === null) return null;
    return Math.min(elapsed, durationMs);
  }

  function finish(reason: FinishedReason): void {
    if (status === 'finished') return;
    status = 'finished';
    finishedReason = reason;
    clock.stop();
  }

  function snapshot(): SessionSnapshot {
    const elapsedMs = activeElapsedMs();
    const counts = { insertedAttempts, correctAttempts, incorrectAttempts };
    return {
      status,
      target,
      typedText,
      durationMs,
      elapsedMs,
      remainingMs:
        elapsedMs === null ? durationMs : Math.max(0, durationMs - elapsedMs),
      ...counts,
      finishedReason,
      score: computeSessionScore(counts, elapsedMs),
    };
  }

  function deadlineRejection(): EditRejection | null {
    if (status === 'finished') return 'finished';
    if (status === 'paused') return 'paused';
    if (status === 'running') {
      const elapsed = clock.elapsedMs();
      if (elapsed !== null && elapsed >= durationMs) {
        finish('duration');
        return 'expired';
      }
    }
    return null;
  }

  function applyEdit(
    nextText: string,
    actualInsertion?: ActualInsertion,
  ): EditResult {
    const rejection = deadlineRejection();
    if (rejection !== null) {
      return {
        accepted: false,
        rejection,
        started: false,
        finished: status === 'finished',
      };
    }

    const edit = diffEdit(typedText, nextText);
    let insertedText = edit.inserted;
    let insertStart = edit.start;
    if (actualInsertion && actualInsertion.text.length > 0) {
      // Browser insertion metadata preserves selected text that happens to
      // match the existing value; a string diff would lose those attempts.
      insertedText = actualInsertion.text;
      insertStart = actualInsertion.position;
    }

    // Deletion-only edit (Backspace/Delete/selection cut): the final text
    // changes but deletion never adds attempts to the history.
    if (insertedText.length === 0) {
      typedText = nextText;
      return {
        accepted: true,
        rejection: null,
        started: status === 'running',
        finished: false,
      };
    }

    // Unsupported characters are blocked visibly and never scored.
    if (!isSupportedTypingText(insertedText)) {
      return {
        accepted: false,
        rejection: 'unsupported',
        started: false,
        finished: false,
      };
    }

    // First accepted insertion starts the monotonic clock (idle -> running).
    if (status === 'idle') {
      clock.start();
      status = 'running';
    }

    // Correctness is judged against the word-aligned target position at
    // insertion time, so corrected mistakes stay in the attempt history
    // without shifting subsequent words after a missing or extra letter.
    for (let index = 0; index < insertedText.length; index++) {
      const position = insertStart + index;
      if (insertedText[index] === expectedCharAt(target, nextText, position)) {
        correctAttempts++;
      } else {
        incorrectAttempts++;
      }
      insertedAttempts++;
    }
    typedText = nextText;

    let finished = false;
    if (target.length > 0 && evaluate(target, nextText).done) {
      finish('target');
      finished = true;
    }
    return { accepted: true, rejection: null, started: true, finished };
  }

  function pause(): void {
    if (status !== 'running') return;
    // Check the deadline before pausing: a blur arriving after expiry must
    // finish the session instead of freezing a clock that is already done.
    const elapsed = clock.elapsedMs();
    if (elapsed !== null && elapsed >= durationMs) {
      finish('duration');
      return;
    }
    clock.pause();
    status = 'paused';
  }

  function resume(): void {
    if (status !== 'paused') return;
    clock.resume();
    status = 'running';
  }

  function tick(): SessionSnapshot {
    if (status === 'running') deadlineRejection();
    return snapshot();
  }

  function restart(next?: { target?: string; durationMs?: number }): void {
    if (next?.target !== undefined) target = next.target;
    if (next?.durationMs !== undefined) durationMs = next.durationMs;
    clock = createClock(now);
    typedText = '';
    insertedAttempts = 0;
    correctAttempts = 0;
    incorrectAttempts = 0;
    status = 'idle';
    finishedReason = null;
  }

  return { snapshot, applyEdit, pause, resume, tick, restart };
}

interface TextEdit {
  start: number;
  inserted: string;
}

function expectedCharAt(
  target: string,
  typed: string,
  position: number,
): string | undefined {
  const targetWords = target.match(/\S+/g);
  if (!targetWords || targetWords.length === 0) return target[position];

  let index = 0;
  while (index < typed.length && typed[index] === ' ') {
    index++;
  }
  if (position < index) return undefined;

  let wordIdx = 0;
  let wordStart = index;
  while (index < position) {
    if (typed[index] === ' ') {
      while (index < position && typed[index] === ' ') {
        index++;
      }
      wordIdx++;
      wordStart = index;
    } else {
      index++;
    }
  }

  const targetWord = targetWords[wordIdx];
  if (targetWord === undefined) return undefined;
  const charOffset = position - wordStart;

  if (typed[position] === ' ') {
    return wordIdx < targetWords.length - 1 &&
      charOffset >= targetWord.length &&
      typed[position - 1] !== ' '
      ? ' '
      : undefined;
  }

  return targetWord[charOffset];
}

// Locates the single changed region between two strings by walking the shared
// prefix and then the shared suffix. Handles caret moves, selection
// replacement, Backspace/Delete and multi-character edits uniformly.
function diffEdit(previous: string, next: string): TextEdit {
  let start = 0;
  const sharedLength = Math.min(previous.length, next.length);
  while (start < sharedLength && previous[start] === next[start]) {
    start++;
  }
  let previousEnd = previous.length;
  let nextEnd = next.length;
  while (
    previousEnd > start &&
    nextEnd > start &&
    previous[previousEnd - 1] === next[nextEnd - 1]
  ) {
    previousEnd--;
    nextEnd--;
  }
  return { start, inserted: next.slice(start, nextEnd) };
}
