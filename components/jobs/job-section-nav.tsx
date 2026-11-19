'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './job-section-nav.module.css';

export type JobNavSection = {
  id: string;
  label: string;
};

/**
 * Dynamic "On this page" jump navigation for job detail sections.
 * Auto-opens collapsed sections, scrolls smoothly, and briefly highlights the target card.
 */
export function JobSectionNav({
  sections,
  variant,
}: {
  sections: readonly JobNavSection[];
  variant: 'sidebar' | 'strip';
}) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '');
  const listRef = useRef<HTMLUListElement | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const highlightedElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (sections.length < 2 || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: '-12% 0px -65% 0px',
        threshold: 0,
      },
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [sections]);

  useEffect(() => {
    if (variant !== 'strip' || !activeId) return;
    const list = listRef.current;
    if (!list) return;
    const activeLink = list.querySelector<HTMLAnchorElement>(
      `a[href="#${CSS.escape(activeId)}"]`,
    );
    if (!activeLink) return;

    const targetLeft =
      activeLink.offsetLeft - list.clientWidth / 2 + activeLink.offsetWidth / 2;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    list.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [activeId, variant]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  if (sections.length < 2) return null;

  function handleJump(
    event: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ): void {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();

    const details =
      target instanceof HTMLDetailsElement ? target : target.closest('details');
    if (details && !details.open) {
      details.open = true;
    }

    setActiveId(id);
    window.history.replaceState(null, '', `#${id}`);

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });

    if (highlightedElRef.current && highlightedElRef.current !== target) {
      highlightedElRef.current.removeAttribute('data-jump-highlight');
    }
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }

    target.setAttribute('data-jump-highlight', 'true');
    highlightedElRef.current = target;
    highlightTimerRef.current = window.setTimeout(() => {
      target.removeAttribute('data-jump-highlight');
      if (highlightedElRef.current === target) {
        highlightedElRef.current = null;
      }
      highlightTimerRef.current = null;
    }, 1500);
  }

  return (
    <nav
      aria-label="Jump to job section"
      className={variant === 'sidebar' ? styles.sidebar : styles.strip}
    >
      <p className={styles.heading}>On this page</p>
      <ul
        ref={listRef}
        className={
          variant === 'sidebar' ? styles.sidebarList : styles.stripList
        }
      >
        {sections.map((section) => {
          const isActive = activeId === section.id;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={isActive ? 'true' : undefined}
                className={
                  variant === 'sidebar'
                    ? `${styles.sidebarLink} ${isActive ? styles.sidebarLinkActive : ''}`
                    : `${styles.stripLink} ${isActive ? styles.stripLinkActive : ''}`
                }
                onClick={(event) => handleJump(event, section.id)}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
