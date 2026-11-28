import Link from 'next/link';
import type { ReactNode } from 'react';
import { indiaDateKey } from '@/frontend/india-date';
import {
  shortenQualificationPoint,
  summarizeQualification,
} from '@/lib/jobs/format-qualification';
import styles from './job-card.module.css';
import { SaveJobButton } from './save-job-button';

export interface PublicJobItem {
  id: string;
  postName: string;
  organization?: string | null;
  appointmentType?: string | null;
  vacancies: number | null;
  recentVisitorCount?: number | null;
  applicationLastDate: string | null;
  educationRequired: string | null;
  payLevel?: string | null;
  source: {
    name: string;
  };
}

function formatDate(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function JobCard({
  job,
  recommended = false,
  matchSummary,
  actions,
}: {
  job: PublicJobItem;
  recommended?: boolean;
  matchSummary?: ReactNode;
  actions?: ReactNode;
}) {
  const visitors = job.recentVisitorCount ?? 0;
  const applyBy = formatDate(job.applicationLastDate);
  const closesToday =
    applyBy !== null &&
    job.applicationLastDate?.slice(0, 10) === indiaDateKey();
  const { points: qualPoints, chips: qualChips } = summarizeQualification(
    job.educationRequired,
  );
  const hasQualification = qualPoints.length > 0;
  const visibleQualPoints = qualPoints.slice(0, 2);
  const hiddenQualCount = Math.max(
    0,
    qualPoints.length - visibleQualPoints.length,
  );
  const organization = job.organization?.trim() || 'Not specified';
  const appointmentType = job.appointmentType?.trim();
  const hasAppointmentType =
    Boolean(appointmentType) && !/^not specified$/i.test(appointmentType!);

  return (
    <article
      className={`${styles.card}${recommended ? ` ${styles.recommended}` : ''}`}
      data-job-card
    >
      <div className={styles.primary}>
        <h3 className={styles.title} data-job-title>
          <Link href={`/jobs/${encodeURIComponent(job.id)}`}>
            {job.postName}
          </Link>
        </h3>
        <div className={styles.meta}>
          <p className={`muted ${styles.organization}`} data-job-org>
            <span className={styles.metaLabel}>Organization: </span>
            {organization}
          </p>
          {hasAppointmentType && (
            <p
              className={`muted ${styles.appointmentType}`}
              data-job-appointment
            >
              <span className={styles.metaLabel}>Appointment: </span>
              {appointmentType}
            </p>
          )}
        </div>
        <div className={styles.primaryStatusRow}>
          <p className={styles.deadline} data-job-deadline>
            {closesToday ? (
              <>
                <span className={styles.deadlineToday}>Last day to apply</span>{' '}
                <time dateTime={job.applicationLastDate?.slice(0, 10)}>
                  {applyBy}
                </time>
              </>
            ) : applyBy ? (
              `Apply by ${applyBy}`
            ) : (
              'Deadline not specified'
            )}
          </p>
          {job.vacancies != null && (
            <span className={styles.vacancyPill} data-job-vacancies>
              {job.vacancies.toLocaleString('en-IN')}{' '}
              {job.vacancies === 1 ? 'vacancy' : 'vacancies'}
            </span>
          )}
        </div>
        {matchSummary}
      </div>
      <div className={styles.facts}>
        {hasQualification && (
          <div className={styles.qualification}>
            <p className="small muted">Qualification</p>
            {qualPoints.length === 1 ? (
              <p>{qualPoints[0]}</p>
            ) : (
              <>
                {qualChips.length > 0 && (
                  <div className={styles.qualChips}>
                    {qualChips.map((chip) => (
                      <span className={styles.qualChip} key={chip}>
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
                <ul className={styles.qualList}>
                  {visibleQualPoints.map((point, idx) => (
                    <li key={`${idx}-${point.slice(0, 24)}`}>
                      {shortenQualificationPoint(point)}
                    </li>
                  ))}
                </ul>
                {hiddenQualCount > 0 && (
                  <p className={`small muted ${styles.qualMore}`}>
                    +{hiddenQualCount} more in details
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {job.payLevel && (
          <p className={`small ${styles.extra}`} data-job-extra>
            {`Pay: ${job.payLevel}`}
          </p>
        )}
        {Number.isSafeInteger(visitors) && visitors > 0 && (
          <p className="small muted" data-job-visitors>
            {visitors.toLocaleString('en-IN')}{' '}
            {visitors === 1 ? 'visitor' : 'visitors'} in the last 7 days
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <Link
          className={styles.open}
          href={`/jobs/${encodeURIComponent(job.id)}`}
        >
          View details
        </Link>
        <div className={styles.secondaryActions}>
          {actions ?? <SaveJobButton id={job.id} />}
        </div>
      </div>
    </article>
  );
}
