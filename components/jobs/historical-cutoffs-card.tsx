import React from 'react';
import { JobDetailSection } from './job-detail-section';
import styles from './historical-cutoffs-card.module.css';

export type HistoricalCutoffItem = {
  examYear?: number | null;
  post?: string | null;
  stage?: string | null;
  isOfficial?: boolean | null;
  cutoffs?: Record<string, string | number | null> | null;
  sourceUrl?: string | null;
  notes?: string | null;
};

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function formatCategoryLabel(key: string): string {
  return key.replace(/_/g, ' ');
}

export function HistoricalCutoffsCard({
  items,
}: {
  items: HistoricalCutoffItem[];
}) {
  if (!items.length) return null;

  return (
    <JobDetailSection id="historical-cutoffs" title="Historical cutoffs">
      <div className={styles.list}>
        {items.map((item, idx) => {
          const entries =
            item.cutoffs && typeof item.cutoffs === 'object'
              ? Object.entries(item.cutoffs).filter(
                  ([, v]) =>
                    v !== null && v !== undefined && String(v).trim() !== '',
                )
              : [];
          const sourceHref = safeHttpUrl(item.sourceUrl);
          return (
            <div
              key={`${item.examYear ?? 'yr'}-${item.post ?? idx}`}
              className={styles.entry}
            >
              <div className={styles.entryHeader}>
                <div className={styles.titleGroup}>
                  {item.post ? (
                    <h3 className={styles.postTitle}>{item.post}</h3>
                  ) : null}
                  {item.stage ? (
                    <p className={styles.stageText}>{item.stage}</p>
                  ) : null}
                </div>
                <div className={styles.badges}>
                  {typeof item.examYear === 'number' ? (
                    <span className={styles.yearBadge}>{item.examYear}</span>
                  ) : null}
                  {item.isOfficial === true ? (
                    <span className={styles.officialBadge}>Official</span>
                  ) : (
                    <span className={styles.referenceBadge}>Reference</span>
                  )}
                </div>
              </div>

              {entries.length > 0 ? (
                <div className={styles.cutoffGrid}>
                  {entries.map(([cat, val]) => (
                    <div key={cat} className={styles.cutoffPill}>
                      <span className={styles.categoryLabel}>
                        {formatCategoryLabel(cat)}
                      </span>
                      <span className={styles.cutoffValue}>{String(val)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {item.notes || sourceHref ? (
                <div className={styles.footer}>
                  {item.notes ? (
                    <p className={styles.notes}>{item.notes}</p>
                  ) : null}
                  {sourceHref ? (
                    <a
                      href={sourceHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.sourceLink}
                    >
                      Source &#8599;
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </JobDetailSection>
  );
}
