'use client';

import { useState } from 'react';
import type {
  ExamMistakeKind,
  ExamReviewItem,
} from '../../lib/typing/exam-evaluator';
import styles from './exam-mode.module.css';

type MistakeFilter = 'all' | 'full' | 'half';

const KIND_LABELS: Record<Exclude<ExamMistakeKind, 'match'>, string> = {
  substitution: 'Wrong word',
  omission: 'Skipped',
  addition: 'Extra word',
  case: 'Case',
  punctuation: 'Punctuation',
  merge: 'Merged space',
  split: 'Split word',
};

export function ExamMistakeReview({
  items,
  fullCount,
  halfCount,
}: {
  items: ExamReviewItem[];
  fullCount: number;
  halfCount: number;
}) {
  const [filter, setFilter] = useState<MistakeFilter>('all');
  const mistakes = items.filter((item) => item.weight > 0);
  const visible =
    filter === 'full'
      ? mistakes.filter((item) => item.weight === 1)
      : filter === 'half'
        ? mistakes.filter((item) => item.weight === 0.5)
        : mistakes;

  if (mistakes.length === 0) {
    return (
      <div className={styles.mistakeEmptyState} role="status">
        <span className={styles.mistakeEmptyTitle}>Zero mistakes</span>
        <p className={styles.mistakeEmptyCopy}>
          Every evaluated word matched the official passage.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.mistakeReview}>
      <div
        className={styles.mistakeFilterRow}
        role="group"
        aria-label="Filter mistakes"
      >
        {(
          [
            { id: 'all', label: `All (${mistakes.length})` },
            { id: 'full', label: `Full 1.0 (${fullCount})` },
            { id: 'half', label: `Half 0.5 (${halfCount})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.mistakeFilterBtn}${filter === tab.id ? ` ${styles.mistakeFilterBtnActive}` : ''}`}
            aria-pressed={filter === tab.id}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ul className={styles.mistakeList} aria-label="Mistake breakdown">
        {visible.map((item, idx) => {
          const isFull = item.weight === 1;
          return (
            <li
              key={`${item.kind}-${idx}-${item.expected}-${item.typed}`}
              className={`${styles.mistakeRow} ${isFull ? styles.mistakeRowFull : styles.mistakeRowHalf}`}
            >
              <div className={styles.mistakeRowMeta}>
                <span
                  className={`${styles.mistakeWeightBadge} ${isFull ? styles.mistakeWeightFull : styles.mistakeWeightHalf}`}
                >
                  {isFull ? 'Full · 1.0' : 'Half · 0.5'}
                </span>
                <span className={styles.mistakeKindLabel}>
                  {KIND_LABELS[item.kind as Exclude<ExamMistakeKind, 'match'>]}
                </span>
              </div>
              <div className={styles.mistakeDiff}>
                {item.expected ? (
                  <span className={styles.mistakeExpected}>
                    {item.expected}
                  </span>
                ) : (
                  <span className={styles.mistakeNone}>none</span>
                )}
                <span className={styles.mistakeArrow} aria-hidden="true">
                  →
                </span>
                {item.typed ? (
                  <span className={styles.mistakeTyped}>{item.typed}</span>
                ) : (
                  <span className={styles.mistakeNone}>omitted</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
