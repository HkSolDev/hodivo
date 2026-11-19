'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchTypingHistory,
  type HistoryItem,
} from '@/lib/typing/attempts-api';
import styles from './typing-leaderboard.module.css';

type FilterMode = 'ALL' | 'EXAM' | 'PRACTICE';

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function TypingProgress() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('ALL');
  const [status, setStatus] = useState<
    'loading' | 'ok' | 'unauthenticated' | 'error'
  >('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchTypingHistory({ limit: 30 }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === 'ok') {
        setItems(result.items);
        setNextCursor(result.nextCursor);
        setStatus('ok');
      } else {
        setStatus(result.status);
      }
    });
    return () => controller.abort();
  }, []);

  const handleLoadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    void fetchTypingHistory({ limit: 30, cursor: nextCursor }).then(
      (result) => {
        setLoadingMore(false);
        if (result.status === 'ok') {
          setItems((prev) => [...prev, ...result.items]);
          setNextCursor(result.nextCursor);
        }
      },
    );
  };

  const filtered =
    filter === 'ALL' ? items : items.filter((item) => item.mode === filter);

  const avgNetWpm =
    filtered.length > 0
      ? Math.round(
          (filtered.reduce((sum, item) => sum + item.netWpm, 0) /
            filtered.length) *
            10,
        ) / 10
      : 0;
  const bestNetWpm =
    filtered.length > 0 ? Math.max(...filtered.map((item) => item.netWpm)) : 0;
  const examItems = items.filter((item) => item.mode === 'EXAM');
  const examPassed = examItems.filter(
    (item) => item.passedRule === true,
  ).length;
  const uniquePassages = new Set(filtered.map((item) => item.passageId)).size;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.title}>Typing progress</h1>
          <p className={styles.subtitle}>
            Your past passages, exam validity, and speed history across Practice
            and Exam mode.
          </p>
        </div>
        <Link href="/typing" className={styles.primaryCta}>
          Practice now
        </Link>
      </header>

      {status === 'unauthenticated' && (
        <section className={styles.boardCard}>
          <div className={styles.emptyState}>
            <p style={{ margin: '0 0 0.75rem' }}>
              Sign in to view your saved typing history and exam readiness.
            </p>
            <Link href="/sign-in" className={styles.primaryCta}>
              Sign in
            </Link>
          </div>
        </section>
      )}

      {status === 'error' && (
        <section className={styles.boardCard}>
          <div className={styles.emptyState}>
            Could not load typing progress right now. Please try again.
          </div>
        </section>
      )}

      {(status === 'loading' || status === 'ok') && (
        <>
          <div className={styles.controlsCard}>
            <div className={styles.controlGroup}>
              <span className={styles.boardMeta}>
                {status === 'loading'
                  ? 'Loading history…'
                  : `${filtered.length} attempts · ${uniquePassages} passages`}
              </span>
            </div>

            <div
              className={styles.segmented}
              role="tablist"
              aria-label="Filter attempts by mode"
            >
              {(['ALL', 'EXAM', 'PRACTICE'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab}
                  className={`${styles.segmentBtn} ${
                    filter === tab ? styles.segmentBtnActive : ''
                  }`}
                  onClick={() => setFilter(tab)}
                >
                  {tab === 'ALL'
                    ? 'All'
                    : tab === 'EXAM'
                      ? 'Exam Mode'
                      : 'Practice Mode'}
                </button>
              ))}
            </div>
          </div>

          {status === 'ok' && items.length > 0 && (
            <div className={styles.rankGrid} aria-label="Progress summary">
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Average Speed</span>
                <strong className={styles.statValue}>{avgNetWpm} WPM</strong>
                <span className={styles.statSub}>Best: {bestNetWpm} WPM</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Exam Validity</span>
                <strong className={styles.statValue}>
                  {examItems.length > 0
                    ? `${examPassed} / ${examItems.length} passed`
                    : 'No exam runs'}
                </strong>
                <span className={styles.statSub}>
                  Official rule qualification
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Passages Covered</span>
                <strong className={styles.statValue}>{uniquePassages}</strong>
                <span className={styles.statSub}>
                  {filtered.length} recorded attempts
                </span>
              </div>
            </div>
          )}

          <section className={styles.boardCard} aria-label="Attempt history">
            <div className={styles.boardHeader}>
              <h2 className={styles.boardTitle}>Recent attempts</h2>
              <span className={styles.boardMeta}>
                Click Retry to open the exact passage again
              </span>
            </div>

            {status === 'loading' && (
              <div className={styles.emptyState}>Loading your history…</div>
            )}

            {status === 'ok' && filtered.length === 0 && (
              <div className={styles.emptyState}>
                No saved attempts yet. Complete a passage in Practice or Exam
                mode to start tracking.
              </div>
            )}

            {status === 'ok' && filtered.length > 0 && (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Passage</th>
                        <th>Mode</th>
                        <th>Net WPM</th>
                        <th>Error %</th>
                        <th>Validity</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div>{item.passageTitle}</div>
                            <span className={styles.boardMeta}>
                              #{item.passageId}
                            </span>
                          </td>
                          <td>
                            <div>
                              {item.mode === 'EXAM' ? 'Exam' : 'Practice'}
                            </div>
                            {item.examVersionLabel && (
                              <span className={styles.boardMeta}>
                                {item.examVersionLabel}
                              </span>
                            )}
                          </td>
                          <td>{item.netWpm} WPM</td>
                          <td>{item.errorPercent}%</td>
                          <td>
                            {item.mode === 'EXAM' ? (
                              item.passedRule === true ? (
                                <span className={styles.passBadge}>PASS</span>
                              ) : item.passedRule === false ? (
                                <span className={styles.failBadge}>
                                  NOT MET
                                </span>
                              ) : (
                                '—'
                              )
                            ) : (
                              <span className={styles.boardMeta}>Practice</span>
                            )}
                          </td>
                          <td>{formatShortDate(item.createdAt)}</td>
                          <td>
                            <div
                              style={{
                                display: 'inline-flex',
                                gap: '0.65rem',
                                fontSize: '0.8125rem',
                              }}
                            >
                              <Link
                                href={`/typing?passageId=${encodeURIComponent(item.passageId)}`}
                              >
                                Retry
                              </Link>
                              <Link
                                href={`/typing/leaderboard?passageId=${encodeURIComponent(item.passageId)}&mode=${item.mode}`}
                              >
                                Board
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {nextCursor && (
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      borderTop: '1px solid var(--line)',
                      textAlign: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className={styles.segmentBtn}
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
