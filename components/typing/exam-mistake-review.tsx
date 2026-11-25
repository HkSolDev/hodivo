'use client';

import { useState } from 'react';
import type {
  ExamMistakeKind,
  ExamReviewItem,
} from '../../lib/typing/exam-evaluator';
import styles from './exam-mode.module.css';

type MistakeFilter = 'all' | 'full' | 'half' | 'unattempted';

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
  typedFullCount,
  halfCount,
  unattemptedCount,
}: {
  items: ExamReviewItem[];
  typedFullCount: number;
  halfCount: number;
  unattemptedCount: number;
}) {
  const [filter, setFilter] = useState<MistakeFilter>('all');
  const mistakes = items.filter((item) => item.weight > 0);
  const filtered =
    filter === 'full'
      ? mistakes.filter((item) => !item.unattemptedTail && item.weight === 1)
      : filter === 'half'
        ? mistakes.filter((item) => item.weight === 0.5)
        : filter === 'unattempted'
          ? mistakes.filter((item) => Boolean(item.unattemptedTail))
          : mistakes;

  const tailItems = filtered.filter((item) => item.unattemptedTail);
  const collapseTail = tailItems.length > 1;
  const visible = collapseTail
    ? filtered.filter((item) => !item.unattemptedTail)
    : filtered;

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

  const typedMistakeCount = typedFullCount + halfCount;
  const tabs: { id: MistakeFilter; label: string }[] = [
    {
      id: 'all',
      label:
        unattemptedCount > 0
          ? `All (${typedMistakeCount} · +${unattemptedCount} left)`
          : `All (${typedMistakeCount})`,
    },
    { id: 'full', label: `Full 1.0 (${typedFullCount})` },
    { id: 'half', label: `Half 0.5 (${halfCount})` },
  ];
  if (unattemptedCount > 0) {
    tabs.push({
      id: 'unattempted',
      label: `Unattempted (${unattemptedCount})`,
    });
  }

  return (
    <div className={styles.mistakeReview}>
      <div
        className={styles.mistakeFilterRow}
        role="group"
        aria-label="Filter mistakes"
      >
        {tabs.map((tab) => (
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

      {visible.length === 0 && !collapseTail ? (
        <div className={styles.mistakeEmptyState} role="status">
          <span className={styles.mistakeEmptyTitle}>None in this filter</span>
          <p className={styles.mistakeEmptyCopy}>
            {filter === 'half'
              ? 'No half mistakes (case, punctuation, or spacing) in typed words.'
              : 'No typed full mistakes in this attempt.'}
          </p>
        </div>
      ) : (
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
                    {
                      KIND_LABELS[
                        item.kind as Exclude<ExamMistakeKind, 'match'>
                      ]
                    }
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
          {collapseTail && (
            <li className={`${styles.mistakeRow} ${styles.mistakeRowFull}`}>
              <div className={styles.mistakeRowMeta}>
                <span
                  className={`${styles.mistakeWeightBadge} ${styles.mistakeWeightFull}`}
                >
                  Full · {tailItems.length}.0
                </span>
                <span className={styles.mistakeKindLabel}>Unattempted</span>
              </div>
              <div className={styles.mistakeDiff}>
                <span className={styles.mistakeExpected}>
                  {tailItems.length} remaining words
                </span>
                <span className={styles.mistakeArrow} aria-hidden="true">
                  →
                </span>
                <span className={styles.mistakeNone}>omitted</span>
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
