'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchLeaderboardPassages,
  fetchPassageLeaderboard,
  type LeaderboardPassageOption,
  type PassageLeaderboardResponse,
} from '@/lib/typing/leaderboard-api';
import styles from './typing-leaderboard.module.css';

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function TypingLeaderboard() {
  const [passages, setPassages] = useState<LeaderboardPassageOption[]>([]);
  const [selectedPassageId, setSelectedPassageId] = useState<string>('');
  const [mode, setMode] = useState<'EXAM' | 'PRACTICE'>('EXAM');
  const [board, setBoard] = useState<PassageLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const paramId = params.get('passageId')?.trim() ?? '';
    const paramMode = params.get('mode')?.toUpperCase();
    if (paramMode === 'PRACTICE' || paramMode === 'EXAM') {
      setMode(paramMode);
    }

    void fetchLeaderboardPassages(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setPassages(items);
        if (paramId) {
          setSelectedPassageId(paramId);
        } else if (items[0]) {
          setSelectedPassageId(items[0].id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Could not load passages right now.');
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedPassageId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetchPassageLeaderboard(selectedPassageId, mode, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setBoard(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBoard(null);
          setError('Leaderboard is temporarily unavailable.');
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedPassageId, mode]);

  const practiceHref = selectedPassageId
    ? mode === 'PRACTICE'
      ? `/typing?passageId=${encodeURIComponent(selectedPassageId)}`
      : '/typing/exam'
    : '/typing';

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.title}>Typing leaderboard</h1>
          <p className={styles.subtitle}>
            Best speed and accuracy per passage across Practice and Exam mode.
          </p>
        </div>
        <Link href={practiceHref} className={styles.primaryCta}>
          {mode === 'PRACTICE' ? 'Practice this passage' : 'Open Exam Mode'}
        </Link>
      </header>

      <div className={styles.controlsCard}>
        <div className={styles.controlGroup}>
          <label htmlFor="leaderboard-passage" className="sr-only">
            Select passage
          </label>
          <select
            id="leaderboard-passage"
            className={styles.select}
            value={selectedPassageId}
            onChange={(event) => setSelectedPassageId(event.target.value)}
            disabled={passages.length === 0}
          >
            {passages.length === 0 ? (
              <option value="">No passages available</option>
            ) : (
              passages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} (#{p.id})
                </option>
              ))
            )}
          </select>
        </div>

        <div
          className={styles.segmented}
          role="tablist"
          aria-label="Typing mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'EXAM'}
            className={`${styles.segmentBtn} ${
              mode === 'EXAM' ? styles.segmentBtnActive : ''
            }`}
            onClick={() => setMode('EXAM')}
          >
            Exam Mode
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'PRACTICE'}
            className={`${styles.segmentBtn} ${
              mode === 'PRACTICE' ? styles.segmentBtnActive : ''
            }`}
            onClick={() => setMode('PRACTICE')}
          >
            Practice Mode
          </button>
        </div>
      </div>

      {board?.me && (
        <div className={styles.rankGrid} aria-label="Your standing">
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Your Rank</span>
            <strong className={styles.statValue}>
              #{board.me.rank} of {board.totalParticipants}
            </strong>
            <span className={styles.statSub}>
              {mode === 'EXAM' ? 'Exam Mode' : 'Practice Mode'}
            </span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Your Best Speed</span>
            <strong className={styles.statValue}>
              {board.me.entry.netWpm} WPM
            </strong>
            <span className={styles.statSub}>
              Accuracy: {board.me.entry.accuracy}%
            </span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Error Rate</span>
            <strong className={styles.statValue}>
              {board.me.entry.errorPercent}%
            </strong>
            <span className={styles.statSub}>
              {board.me.entry.passedRule === true
                ? 'Rule benchmark met'
                : board.me.entry.passedRule === false
                  ? 'Rule benchmark not met'
                  : 'Practice run'}
            </span>
          </div>
        </div>
      )}

      <section className={styles.boardCard} aria-label="Top scores">
        <div className={styles.boardHeader}>
          <h2 className={styles.boardTitle}>
            {board ? board.passage.title : 'Top typists'}
          </h2>
          <span className={styles.boardMeta}>
            {board
              ? `ID: #${board.passage.id} · ${board.totalParticipants} participants`
              : loading
                ? 'Loading…'
                : ''}
          </span>
        </div>

        {loading && (
          <div className={styles.emptyState}>Loading leaderboard…</div>
        )}

        {!loading && error && <div className={styles.emptyState}>{error}</div>}

        {!loading && !error && board && board.entries.length === 0 && (
          <div className={styles.emptyState}>
            No attempts recorded for this passage in{' '}
            {mode === 'EXAM' ? 'Exam' : 'Practice'} mode yet. Be the first!
          </div>
        )}

        {!loading && !error && board && board.entries.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Typist</th>
                  <th>Net WPM</th>
                  <th>Accuracy</th>
                  <th>Error %</th>
                  {mode === 'EXAM' && <th>Status</th>}
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {board.entries.map((entry) => (
                  <tr
                    key={`${entry.rank}-${entry.displayName}-${entry.createdAt}`}
                    className={
                      entry.isCurrentUser ? styles.currentUserRow : undefined
                    }
                  >
                    <td>#{entry.rank}</td>
                    <td>
                      {entry.displayName}
                      {entry.isCurrentUser && (
                        <span className={styles.youBadge}>You</span>
                      )}
                    </td>
                    <td>{entry.netWpm} WPM</td>
                    <td>{entry.accuracy}%</td>
                    <td>{entry.errorPercent}%</td>
                    {mode === 'EXAM' && (
                      <td>
                        {entry.passedRule === true ? (
                          <span className={styles.passBadge}>PASS</span>
                        ) : entry.passedRule === false ? (
                          <span className={styles.failBadge}>NOT MET</span>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td>{formatShortDate(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
