// Practice scoring formulas:
// grossWpm = (insertedAttempts / 5) / minutes; netWpm = max(0, grossWpm -
// (incorrectAttempts / 5) / minutes) = (correctAttempts / 5) / minutes;
// accuracy = correct / inserted * 100 (100 if zero attempts).
// Speed is unavailable while no active time has elapsed.
export interface AttemptCounts {
  insertedAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
}

export interface SessionScore {
  grossWpm: number | null;
  netWpm: number | null;
  accuracy: number;
}

export function computeSessionScore(
  counts: AttemptCounts,
  elapsedMs: number | null,
): SessionScore {
  const accuracy =
    counts.insertedAttempts === 0
      ? 100
      : (counts.correctAttempts / counts.insertedAttempts) * 100;

  if (!(elapsedMs !== null && elapsedMs > 0)) {
    return { grossWpm: null, netWpm: null, accuracy };
  }

  const minutes = elapsedMs / 60000;
  const grossWpm = counts.insertedAttempts / 5 / minutes;
  const netWpm = Math.max(0, grossWpm - counts.incorrectAttempts / 5 / minutes);

  return { grossWpm, netWpm, accuracy };
}
