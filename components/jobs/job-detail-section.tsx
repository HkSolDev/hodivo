'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './job-detail-section.module.css';
import { useDesignReview } from './design-review-state';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function JobDetailSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [showBottomToggle, setShowBottomToggle] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details || !open) {
      setShowBottomToggle(false);
      return;
    }

    const updateBottomToggle = () => {
      const minimumHeight =
        window.innerWidth >= 1050 ? 680 : window.innerWidth >= 641 ? 560 : 460;
      setShowBottomToggle(
        details.getBoundingClientRect().height > minimumHeight,
      );
    };
    const observer = new ResizeObserver(updateBottomToggle);
    observer.observe(details);
    window.addEventListener('resize', updateBottomToggle);
    updateBottomToggle();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateBottomToggle);
    };
  }, [open]);

  function hideDetails() {
    setOpen(false);
    requestAnimationFrame(() => {
      summaryRef.current?.focus({ preventScroll: true });
      summaryRef.current?.scrollIntoView({ block: 'start' });
    });
  }

  return (
    <details
      id={id}
      ref={detailsRef}
      className={styles.section}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary ref={summaryRef}>
        <span className={styles.title}>{title}</span>
        <span className={styles.toggleButton} aria-hidden="true">
          <span>
            {open ? 'Hide' : 'Show'}
            <span className={styles.toggleSuffix}> details</span>
          </span>
          <ChevronIcon open={open} />
        </span>
      </summary>
      <div className={styles.content}>{children}</div>
      {open && showBottomToggle ? (
        <button
          type="button"
          className={styles.bottomToggle}
          onClick={hideDetails}
        >
          Hide {title.toLowerCase()} details ↑
        </button>
      ) : null}
    </details>
  );
}

export function JobPreviewSaveButton({ id }: { id?: string }) {
  const review = useDesignReview();
  const [localSaved, setLocalSaved] = useState(false);
  const saved = review && id ? review.saved.includes(id) : localSaved;

  return (
    <button
      type="button"
      className={styles.saveButton}
      aria-pressed={saved}
      title="Preview-only save; this does not persist to an account."
      onClick={() => {
        if (review && id)
          review.setSaved((current) =>
            current.includes(id)
              ? current.filter((item) => item !== id)
              : [...current, id],
          );
        else setLocalSaved((value) => !value);
      }}
    >
      {saved ? 'Saved for this preview' : 'Save job'}
    </button>
  );
}
