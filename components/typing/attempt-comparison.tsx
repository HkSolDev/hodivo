import Link from 'next/link';
import type { AttemptComparisonData } from '@/lib/typing/attempts-api';
import styles from './attempt-comparison.module.css';

export type AttemptSaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; comparison: AttemptComparisonData }
  | { status: 'unauthenticated' }
  | { status: 'error' };

interface AttemptComparisonProps {
  passageId: string;
  mode: 'PRACTICE' | 'EXAM';
  currentNetWpm: number;
  currentErrorPercent: number;
  saveState: AttemptSaveState;
}

function formatWpmDelta(current: number, previous: number): string {
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return 'Same speed';
  return `${diff > 0 ? '+' : ''}${diff} WPM`;
}

function formatErrorDelta(current: number, previous: number): string {
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return 'same error';
  return `${diff > 0 ? '+' : ''}${diff}% err`;
}

export function AttemptComparison({
  passageId,
  mode,
  currentNetWpm,
  currentErrorPercent,
  saveState,
}: AttemptComparisonProps) {
  const sameModeLabel = mode === 'PRACTICE' ? 'Practice' : 'Exam';
  const otherModeLabel = mode === 'PRACTICE' ? 'Exam' : 'Practice';

  return (
    <div className={styles.wrap} aria-label="Passage progress comparison">
      <div className={styles.header}>
        <span className={styles.title}>Passage progress</span>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
          }}
        >
          <span className={styles.passageTag}>ID: #{passageId}</span>
          <Link
            href={`/typing/leaderboard?passageId=${encodeURIComponent(passageId)}&mode=${mode}`}
            className={styles.signInLink}
            style={{ fontSize: '0.75rem' }}
          >
            Leaderboard →
          </Link>
        </div>
      </div>

      {saveState.status === 'saving' && (
        <p className={styles.quietNote}>Saving attempt…</p>
      )}

      {saveState.status === 'unauthenticated' && (
        <p className={styles.quietNote}>
          <Link href="/sign-in" className={styles.signInLink}>
            Sign in
          </Link>{' '}
          to save this passage&apos;s history and compare Practice vs. Exam
          progress.
        </p>
      )}

      {saveState.status === 'error' && (
        <p className={styles.quietNote}>
          Result shown locally — history sync is temporarily unavailable.
        </p>
      )}

      {saveState.status === 'saved' && (
        <div className={styles.grid}>
          <div className={styles.cell}>
            <span className={styles.label}>
              vs. Last {sameModeLabel} attempt
            </span>
            {saveState.comparison.lastAttempt ? (
              <>
                <span
                  className={`${styles.value} ${
                    currentNetWpm >= saveState.comparison.lastAttempt.netWpm
                      ? styles.deltaUp
                      : styles.deltaDown
                  }`}
                >
                  {formatWpmDelta(
                    currentNetWpm,
                    saveState.comparison.lastAttempt.netWpm,
                  )}
                </span>
                <span className={styles.sub}>
                  Prev: {saveState.comparison.lastAttempt.netWpm} WPM ·{' '}
                  {formatErrorDelta(
                    currentErrorPercent,
                    saveState.comparison.lastAttempt.errorPercent,
                  )}
                </span>
              </>
            ) : (
              <>
                <span className={styles.value}>First run</span>
                <span className={styles.sub}>Baseline saved</span>
              </>
            )}
          </div>

          <div className={styles.cell}>
            <span className={styles.label}>{sameModeLabel} best</span>
            {saveState.comparison.personalBest ? (
              <>
                <span className={styles.value}>
                  {Math.max(
                    currentNetWpm,
                    saveState.comparison.personalBest.netWpm,
                  )}{' '}
                  WPM
                </span>
                <span className={styles.sub}>
                  {currentNetWpm > saveState.comparison.personalBest.netWpm
                    ? 'New personal best!'
                    : `Best error: ${saveState.comparison.personalBest.errorPercent}%`}
                </span>
              </>
            ) : (
              <>
                <span className={styles.value}>{currentNetWpm} WPM</span>
                <span className={styles.sub}>Personal best set</span>
              </>
            )}
          </div>

          <div className={styles.cell}>
            <span className={styles.label}>{otherModeLabel} best</span>
            {saveState.comparison.otherModeBest ? (
              <>
                <span className={styles.value}>
                  {saveState.comparison.otherModeBest.netWpm} WPM
                </span>
                <span className={styles.sub}>
                  {saveState.comparison.otherModeBest.errorPercent}% err
                  {saveState.comparison.otherModeBest.passedRule === true
                    ? ' · PASS'
                    : saveState.comparison.otherModeBest.passedRule === false
                      ? ' · NOT MET'
                      : ''}
                </span>
              </>
            ) : (
              <>
                <span className={styles.value}>—</span>
                <span className={styles.sub}>
                  Not attempted in {otherModeLabel}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
